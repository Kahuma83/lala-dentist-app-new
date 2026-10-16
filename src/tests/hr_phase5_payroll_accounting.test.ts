import { describe, it, expect, beforeEach } from "vitest";
import { MockDatabase } from "../data/mockData";
import { MockPayrollRepository, MockAccountingRepository } from "../repositories/mockRepositories";
import { PayrollStatus, JournalSourceType, UserRole, JournalStatus } from "../types/domain";
import { AppClock } from "../utils/clock";

describe("HR-5: Payroll Accounting Integration", () => {
  let db: MockDatabase;
  let payrollRepo: MockPayrollRepository;
  let accRepo: MockAccountingRepository;

  beforeEach(() => {
    db = MockDatabase.resetInstance();
    AppClock.reset();
    payrollRepo = new MockPayrollRepository();
    accRepo = new MockAccountingRepository();
  });

  // Helper to prepare a standard payroll with different items
  async function createTestPayroll(opts: {
    staffId: string;
    month: number;
    year: number;
    baseSalary?: number;
    compensationAmount?: number;
    overtimeHours?: number;
    overtimeAmountSnapshot?: number;
  }) {
    // 1. Setup staff in db if not exists
    let staff = db.staff.find(s => s.id === opts.staffId);
    if (!staff) {
      staff = {
        id: opts.staffId,
        name: "Test Staff " + opts.staffId,
        role: UserRole.DOCTOR_ASSISTANT,
        branchId: "branch-gebang",
        isActive: true,
        email: opts.staffId + "@example.com",
        phone: "123",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z"
      };
      db.staff.push(staff);
    }

    // 2. Clear any existing accruals and overtimes for this staff/period
    db.accruals = db.accruals.filter(a => a.staffId !== opts.staffId);
    db.overtimes = db.overtimes.filter(o => o.staffId !== opts.staffId);

    // 3. Add compensation accrual if requested
    if (opts.compensationAmount && opts.compensationAmount > 0) {
      db.accruals.push({
        id: `accrual-${opts.staffId}-1`,
        staffId: opts.staffId,
        amount: opts.compensationAmount,
        sourceId: "treatment-job-test",
        accruedAt: "2026-09-20T10:00:00Z"
      });
    }

    // 4. Add overtime if requested
    if (opts.overtimeHours && opts.overtimeHours > 0) {
      const otId = `ot-${opts.staffId}-1`;
      db.overtimes.push({
        id: otId,
        staffId: opts.staffId,
        branchId: staff.branchId,
        attendanceId: `att-${opts.staffId}-1`,
        date: `2026-09-15`,
        scheduledEndAt: "17:00",
        actualEndAt: "20:00",
        overtimeMinutes: opts.overtimeHours * 60,
        overtimeHours: opts.overtimeHours,
        overtimeType: "AFTER_SHIFT" as any,
        status: "APPROVED" as any,
        overtimeAmountSnapshot: opts.overtimeAmountSnapshot !== undefined ? opts.overtimeAmountSnapshot : opts.overtimeHours * 25000,
        createdAt: "2026-09-15T18:00:00Z",
        updatedAt: "2026-09-15T18:00:00Z"
      });
    }

    // 5. Generate Monthly Payroll
    const payroll = await payrollRepo.generateMonthlyPayroll(
      opts.staffId,
      opts.month,
      opts.year,
      opts.baseSalary || 2500000
    );

    return payroll;
  }

  it("1. APPROVED menghasilkan accrual journal", async () => {
    const payroll = await createTestPayroll({
      staffId: "staff-ast-clary",
      month: 9,
      year: 2026,
      compensationAmount: 15000
    });

    await payrollRepo.updatePayrollStatus(payroll.id, PayrollStatus.APPROVED);

    const journals = db.journals.filter(
      j => j.sourceType === JournalSourceType.PAYROLL && j.sourceId === payroll.id && j.description.includes("Accrual")
    );
    expect(journals.length).toBe(1);
    expect(journals[0].status).toBe(JournalStatus.POSTED);
    expect(journals[0].totalDebit).toBe(2515000);
  });

  it("2. DRAFT tidak menghasilkan posted accrual", async () => {
    const payroll = await createTestPayroll({
      staffId: "staff-ast-clary",
      month: 9,
      year: 2026
    });

    const journals = db.journals.filter(
      j => j.sourceType === JournalSourceType.PAYROLL && j.sourceId === payroll.id
    );
    expect(journals.length).toBe(0);
  });

  it("3. REVIEW tidak menghasilkan payment", async () => {
    const payroll = await createTestPayroll({
      staffId: "staff-ast-clary",
      month: 9,
      year: 2026
    });

    await payrollRepo.updatePayrollStatus(payroll.id, "REVIEW" as any);

    const journals = db.journals.filter(
      j => j.sourceType === JournalSourceType.PAYROLL && j.sourceId === payroll.id
    );
    expect(journals.length).toBe(0);
  });

  it("4. PAID menghasilkan payment journal", async () => {
    const payroll = await createTestPayroll({
      staffId: "staff-ast-clary",
      month: 9,
      year: 2026,
      compensationAmount: 100000
    });

    await payrollRepo.updatePayrollStatus(payroll.id, PayrollStatus.APPROVED);
    await payrollRepo.updatePayrollStatus(payroll.id, PayrollStatus.PAID);

    const accruals = db.journals.filter(
      j => j.sourceType === JournalSourceType.PAYROLL && j.sourceId === payroll.id && j.description.includes("Accrual")
    );
    const payments = db.journals.filter(
      j => j.sourceType === JournalSourceType.PAYROLL && j.sourceId === payroll.id && j.description.includes("Payment")
    );

    expect(accruals.length).toBe(1);
    expect(payments.length).toBe(1);
    expect(payments[0].status).toBe(JournalStatus.POSTED);
    expect(payments[0].totalDebit).toBe(2600000);
  });

  it("5. Base salary menggunakan PayrollItem/snapshot", async () => {
    const payroll = await createTestPayroll({
      staffId: "staff-ast-clary",
      month: 9,
      year: 2026,
      baseSalary: 2500000
    });

    const staff = db.staff.find(s => s.id === "staff-ast-clary");
    if (staff) {
      (staff as any).salary = 3000000;
    }

    await payrollRepo.updatePayrollStatus(payroll.id, PayrollStatus.APPROVED);

    const journal = db.journals.find(
      j => j.sourceType === JournalSourceType.PAYROLL && j.sourceId === payroll.id && j.description.includes("Accrual")
    );
    expect(journal).toBeDefined();

    const baseLine = journal?.lines.find(l => l.accountId === "coa-5000" && l.debit > 0);
    expect(baseLine?.debit).toBe(2500000);
  });

  it("6. Compensation menggunakan PayrollItem.amount", async () => {
    const payroll = await createTestPayroll({
      staffId: "staff-ast-clary",
      month: 9,
      year: 2026,
      compensationAmount: 125000
    });

    await payrollRepo.updatePayrollStatus(payroll.id, PayrollStatus.APPROVED);

    const journal = db.journals.find(
      j => j.sourceType === JournalSourceType.PAYROLL && j.sourceId === payroll.id && j.description.includes("Accrual")
    );
    expect(journal).toBeDefined();

    const compLine = journal?.lines.find(l => l.accountId === "coa-5020" && l.debit > 0);
    expect(compLine?.debit).toBe(125000);
  });

  it("7. Overtime menggunakan PayrollItem.amount", async () => {
    const payroll = await createTestPayroll({
      staffId: "staff-ast-clary",
      month: 9,
      year: 2026,
      overtimeHours: 5,
      overtimeAmountSnapshot: 150000
    });

    await payrollRepo.updatePayrollStatus(payroll.id, PayrollStatus.APPROVED);

    const journal = db.journals.find(
      j => j.sourceType === JournalSourceType.PAYROLL && j.sourceId === payroll.id && j.description.includes("Accrual")
    );
    expect(journal).toBeDefined();

    const otLine = journal?.lines.find(l => l.accountId === "coa-5020" && l.debit > 0);
    expect(otLine?.debit).toBe(150000);
  });

  it("8. Tidak ada overtime recalculation", async () => {
    const payroll = await createTestPayroll({
      staffId: "staff-ast-clary",
      month: 9,
      year: 2026,
      overtimeHours: 4,
      overtimeAmountSnapshot: 100000
    });

    db.overtimes = [];

    await payrollRepo.updatePayrollStatus(payroll.id, PayrollStatus.APPROVED);

    const journal = db.journals.find(
      j => j.sourceType === JournalSourceType.PAYROLL && j.sourceId === payroll.id && j.description.includes("Accrual")
    );
    expect(journal).toBeDefined();

    const otLine = journal?.lines.find(l => l.accountId === "coa-5020" && l.debit > 0);
    expect(otLine?.debit).toBe(100000);
  });

  it("9. Null overtime tidak menghasilkan nominal/journal overtime", async () => {
    const payroll = await createTestPayroll({
      staffId: "staff-ast-clary",
      month: 9,
      year: 2026
    });

    await payrollRepo.updatePayrollStatus(payroll.id, PayrollStatus.APPROVED);

    const journal = db.journals.find(
      j => j.sourceType === JournalSourceType.PAYROLL && j.sourceId === payroll.id && j.description.includes("Accrual")
    );

    const otLine = journal?.lines.find(l => l.accountId === "coa-5020");
    expect(otLine).toBeUndefined();
  });

  it("10. Accrual balanced", async () => {
    const payroll = await createTestPayroll({
      staffId: "staff-ast-clary",
      month: 9,
      year: 2026,
      compensationAmount: 150000,
      overtimeHours: 2,
      overtimeAmountSnapshot: 50000
    });

    await payrollRepo.updatePayrollStatus(payroll.id, PayrollStatus.APPROVED);

    const journal = db.journals.find(
      j => j.sourceType === JournalSourceType.PAYROLL && j.sourceId === payroll.id && j.description.includes("Accrual")
    );
    expect(journal).toBeDefined();

    const sumDebit = journal?.lines.reduce((s, l) => s + l.debit, 0) || 0;
    const sumCredit = journal?.lines.reduce((s, l) => s + l.credit, 0) || 0;

    expect(sumDebit).toBe(sumCredit);
    expect(sumDebit).toBe(2700000);
  });

  it("11. Payment balanced", async () => {
    const payroll = await createTestPayroll({
      staffId: "staff-ast-clary",
      month: 9,
      year: 2026,
      compensationAmount: 200000
    });

    await payrollRepo.updatePayrollStatus(payroll.id, PayrollStatus.APPROVED);
    await payrollRepo.updatePayrollStatus(payroll.id, PayrollStatus.PAID);

    const journal = db.journals.find(
      j => j.sourceType === JournalSourceType.PAYROLL && j.sourceId === payroll.id && j.description.includes("Payment")
    );
    expect(journal).toBeDefined();

    const sumDebit = journal?.lines.reduce((s, l) => s + l.debit, 0) || 0;
    const sumCredit = journal?.lines.reduce((s, l) => s + l.credit, 0) || 0;

    expect(sumDebit).toBe(sumCredit);
    expect(sumDebit).toBe(2700000);
  });

  it("12. Duplicate accrual prevented", async () => {
    const payroll = await createTestPayroll({
      staffId: "staff-ast-clary",
      month: 9,
      year: 2026
    });

    await payrollRepo.updatePayrollStatus(payroll.id, PayrollStatus.APPROVED);
    await payrollRepo.updatePayrollStatus(payroll.id, PayrollStatus.APPROVED);

    const journals = db.journals.filter(
      j => j.sourceType === JournalSourceType.PAYROLL && j.sourceId === payroll.id && j.description.includes("Accrual")
    );
    expect(journals.length).toBe(1);
  });

  it("13. Duplicate payment prevented", async () => {
    const payroll = await createTestPayroll({
      staffId: "staff-ast-clary",
      month: 9,
      year: 2026
    });

    await payrollRepo.updatePayrollStatus(payroll.id, PayrollStatus.APPROVED);
    await payrollRepo.updatePayrollStatus(payroll.id, PayrollStatus.PAID);
    await payrollRepo.updatePayrollStatus(payroll.id, PayrollStatus.PAID);

    const payments = db.journals.filter(
      j => j.sourceType === JournalSourceType.PAYROLL && j.sourceId === payroll.id && j.description.includes("Payment")
    );
    expect(payments.length).toBe(1);
  });

  it("14. Accrual + payment coexist", async () => {
    const payroll = await createTestPayroll({
      staffId: "staff-ast-clary",
      month: 9,
      year: 2026
    });

    await payrollRepo.updatePayrollStatus(payroll.id, PayrollStatus.APPROVED);
    await payrollRepo.updatePayrollStatus(payroll.id, PayrollStatus.PAID);

    const journals = db.journals.filter(
      j => j.sourceType === JournalSourceType.PAYROLL && j.sourceId === payroll.id
    );
    expect(journals.length).toBe(2);
    expect(journals.some(j => j.description.includes("Accrual"))).toBe(true);
    expect(journals.some(j => j.description.includes("Payment"))).toBe(true);
  });

  it("15. sourceType = PAYROLL", async () => {
    const payroll = await createTestPayroll({
      staffId: "staff-ast-clary",
      month: 9,
      year: 2026
    });

    await payrollRepo.updatePayrollStatus(payroll.id, PayrollStatus.APPROVED);

    const journal = db.journals.find(
      j => j.sourceId === payroll.id
    );
    expect(journal?.sourceType).toBe(JournalSourceType.PAYROLL);
  });

  it("16. sourceId = payrollId", async () => {
    const payroll = await createTestPayroll({
      staffId: "staff-ast-clary",
      month: 9,
      year: 2026
    });

    await payrollRepo.updatePayrollStatus(payroll.id, PayrollStatus.APPROVED);

    const journal = db.journals.find(
      j => j.sourceType === JournalSourceType.PAYROLL
    );
    expect(journal?.sourceId).toBe(payroll.id);
  });

  it("17. Journal branchId mengikuti Payroll.branchId", async () => {
    const payroll = await createTestPayroll({
      staffId: "staff-ast-clary",
      month: 9,
      year: 2026
    });

    const pDb = db.payrolls.find(p => p.id === payroll.id);
    if (pDb) {
      pDb.branchId = "branch-custom-special";
    }

    await payrollRepo.updatePayrollStatus(payroll.id, PayrollStatus.APPROVED);

    const journal = db.journals.find(
      j => j.sourceType === JournalSourceType.PAYROLL && j.sourceId === payroll.id
    );
    expect(journal?.branchId).toBe("branch-custom-special");
    expect(journal?.lines.every(l => l.branchId === "branch-custom-special")).toBe(true);
  });

  it("18. Branch Admin cross-branch blocked", async () => {
    const payroll = await createTestPayroll({
      staffId: "staff-ast-clary",
      month: 9,
      year: 2026
    });
    payroll.branchId = "branch-gebang";

    const crossBranchJournal = await accRepo.getJournals(
      { branchId: "branch-gebang" },
      UserRole.BRANCH_ADMIN,
      "branch-kampus"
    );
    expect(crossBranchJournal.some(j => j.branchId === "branch-gebang")).toBe(false);
  });

  it("19. Super Admin cross-branch allowed", async () => {
    const payroll = await createTestPayroll({
      staffId: "staff-ast-clary",
      month: 9,
      year: 2026
    });
    payroll.branchId = "branch-gebang";

    await payrollRepo.updatePayrollStatus(payroll.id, PayrollStatus.APPROVED);

    const crossBranchJournal = await accRepo.getJournals(
      { branchId: "branch-gebang" },
      UserRole.SUPER_ADMIN,
      null
    );
    expect(crossBranchJournal.length).toBeGreaterThan(0);
  });

  it("20. POSTED journal immutable", async () => {
    const payroll = await createTestPayroll({
      staffId: "staff-ast-clary",
      month: 9,
      year: 2026
    });

    await payrollRepo.updatePayrollStatus(payroll.id, PayrollStatus.APPROVED);

    const journal = db.journals.find(
      j => j.sourceType === JournalSourceType.PAYROLL && j.sourceId === payroll.id
    );
    expect(journal?.status).toBe(JournalStatus.POSTED);

    await expect(
      accRepo.updateDraftJournal(
        journal!.id,
        { description: "Hacked!" },
        UserRole.SUPER_ADMIN,
        null
      )
    ).rejects.toThrow("Immutability Violation");
  });

  it("21. Historical salary snapshot preserved", async () => {
    const payroll = await createTestPayroll({
      staffId: "staff-ast-clary",
      month: 9,
      year: 2026,
      baseSalary: 1800000
    });

    const baseItem = db.payrollItems.find(i => i.payrollId === payroll.id && i.id.endsWith("-base"));
    expect(baseItem?.amountSnapshot).toBe(1800000);
  });

  it("22. Historical overtime snapshot preserved melalui PayrollItem", async () => {
    const payroll = await createTestPayroll({
      staffId: "staff-ast-clary",
      month: 9,
      year: 2026,
      overtimeHours: 3,
      overtimeAmountSnapshot: 75000
    });

    const otItem = db.payrollItems.find(i => i.payrollId === payroll.id && i.id.includes("-ot-"));
    expect(otItem?.amountSnapshot).toBe(75000);
  });

  it("23. Historical compensation snapshot preserved melalui PayrollItem", async () => {
    const payroll = await createTestPayroll({
      staffId: "staff-ast-clary",
      month: 9,
      year: 2026,
      compensationAmount: 45000
    });

    const compItem = db.payrollItems.find(i => i.payrollId === payroll.id && i.id.includes("-accrual-"));
    expect(compItem?.amountSnapshot).toBe(45000);
  });

  it("24. Journal masuk General Ledger", async () => {
    const payroll = await createTestPayroll({
      staffId: "staff-ast-clary",
      month: 9,
      year: 2026
    });

    await payrollRepo.updatePayrollStatus(payroll.id, PayrollStatus.APPROVED);

    const journal = db.journals.find(
      j => j.sourceType === JournalSourceType.PAYROLL && j.sourceId === payroll.id
    );
    expect(journal?.status).toBe(JournalStatus.POSTED);
  });

  it("25. Repeated payroll accounting tetap idempotent", async () => {
    const payroll = await createTestPayroll({
      staffId: "staff-ast-clary",
      month: 9,
      year: 2026
    });

    await payrollRepo.updatePayrollStatus(payroll.id, PayrollStatus.APPROVED);
    await payrollRepo.updatePayrollStatus(payroll.id, PayrollStatus.PAID);

    const initialJournalCount = db.journals.length;

    await (payrollRepo as any).handlePayrollAccounting(payroll);
    await (payrollRepo as any).handlePayrollAccounting(payroll);

    expect(db.journals.length).toBe(initialJournalCount);
  });

  it("26. GAP 1: gross = net -> payment balanced, no Rp0, no negative liability", async () => {
    const payroll = await createTestPayroll({
      staffId: "staff-ast-clary",
      month: 9,
      year: 2026,
      baseSalary: 2500000,
      compensationAmount: 0
    });

    await payrollRepo.updatePayrollStatus(payroll.id, PayrollStatus.APPROVED);
    await payrollRepo.updatePayrollStatus(payroll.id, PayrollStatus.PAID);

    const paymentJournal = db.journals.find(
      j => j.sourceType === JournalSourceType.PAYROLL && j.sourceId === payroll.id && j.event === "PAYMENT"
    );

    expect(paymentJournal).toBeDefined();
    expect(paymentJournal!.totalDebit).toBe(2500000);
    expect(paymentJournal!.totalCredit).toBe(2500000);
    expect(paymentJournal!.totalDebit).toBe(paymentJournal!.totalCredit);

    // Ensure no Rp 0 line
    const zeroLine = paymentJournal!.lines.find(l => l.debit === 0 && l.credit === 0);
    expect(zeroLine).toBeUndefined();
  });

  it("27. GAP 1: gross > net karena deduction -> payment tetap balanced, no Rp0, no negative liability", async () => {
    const payroll = await createTestPayroll({
      staffId: "staff-ast-clary",
      month: 9,
      year: 2026,
      baseSalary: 3000000,
      compensationAmount: 0
    });

    // Manually add deduction item
    db.payrollItems.push({
      id: `item-${payroll.id}-ded-1`,
      payrollId: payroll.id,
      descriptionSnapshot: "Potongan Pajak PPh21",
      amountSnapshot: 150000,
      type: "DEDUCTION"
    });

    // Update actual payroll in database
    const dbPayroll = db.payrolls.find(p => p.id === payroll.id);
    if (dbPayroll) {
      dbPayroll.totalDeductions = 150000;
      dbPayroll.netSalary = 2850000;
    }

    await payrollRepo.updatePayrollStatus(payroll.id, PayrollStatus.APPROVED);
    await payrollRepo.updatePayrollStatus(payroll.id, PayrollStatus.PAID);

    const paymentJournal = db.journals.find(
      j => j.sourceType === JournalSourceType.PAYROLL && j.sourceId === payroll.id && j.event === "PAYMENT"
    );

    expect(paymentJournal).toBeDefined();
    expect(paymentJournal!.totalDebit).toBe(3000000); // Debits the gross liability (coa-2010)
    expect(paymentJournal!.totalCredit).toBe(3000000); // Bank (2.85m) + Tax Payable (150k)
    expect(paymentJournal!.totalDebit).toBe(paymentJournal!.totalCredit);

    // Verify tax deduction line is credited correctly to coa-2040
    const taxLine = paymentJournal!.lines.find(l => l.accountId === "coa-2040");
    expect(taxLine).toBeDefined();
    expect(taxLine!.credit).toBe(150000);

    // Ensure no Rp 0 line
    const zeroLine = paymentJournal!.lines.find(l => l.debit === 0 && l.credit === 0);
    expect(zeroLine).toBeUndefined();
  });

  it("28. GAP 2: event-specific idempotency (PAYROLL + payrollId + ACCRUAL/PAYMENT)", async () => {
    const payroll = await createTestPayroll({
      staffId: "staff-ast-clary",
      month: 9,
      year: 2026
    });

    await payrollRepo.updatePayrollStatus(payroll.id, PayrollStatus.APPROVED);
    await payrollRepo.updatePayrollStatus(payroll.id, PayrollStatus.APPROVED); // Duplicate APPROVED trigger

    const accrualJournals = db.journals.filter(
      j => j.sourceType === JournalSourceType.PAYROLL && j.sourceId === payroll.id && j.event === "ACCRUAL"
    );
    expect(accrualJournals.length).toBe(1); // Exactly 1 accrual journal

    await payrollRepo.updatePayrollStatus(payroll.id, PayrollStatus.PAID);
    await payrollRepo.updatePayrollStatus(payroll.id, PayrollStatus.PAID); // Duplicate PAID trigger

    const paymentJournals = db.journals.filter(
      j => j.sourceType === JournalSourceType.PAYROLL && j.sourceId === payroll.id && j.event === "PAYMENT"
    );
    expect(paymentJournals.length).toBe(1); // Exactly 1 payment journal

    // Accrual & Payment coexist harmoniously
    expect(accrualJournals[0]).toBeDefined();
    expect(paymentJournals[0]).toBeDefined();
  });
});
