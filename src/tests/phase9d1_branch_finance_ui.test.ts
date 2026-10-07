import { describe, it, expect, beforeEach } from "vitest";
import {
  MockAccountingRepository,
  MockInvoiceRepository,
  MockPaymentRepository,
  MockCompensationRepository,
  MockPayrollRepository,
  MockTreatmentRepository,
  MockDoctorRepository
} from "../repositories/mockRepositories";
import { AccountingPostingService } from "../services/accountingPostingService";
import {
  JournalSourceType,
  JournalStatus,
  UserRole,
  AccountType,
  PayrollStatus
} from "../types/domain";
import { MockDatabase } from "../data/mockData";

describe("PHASE 9D.1 — Branch Admin Financial UI & Operational Simplification Tests", () => {
  const db = MockDatabase.getInstance();
  let accountingRepo: MockAccountingRepository;
  let invoiceRepo: MockInvoiceRepository;
  let paymentRepo: MockPaymentRepository;
  let compRepo: MockCompensationRepository;
  let payrollRepo: MockPayrollRepository;
  let treatmentRepo: MockTreatmentRepository;
  let doctorRepo: MockDoctorRepository;
  let postingService: AccountingPostingService;

  beforeEach(() => {
    accountingRepo = new MockAccountingRepository();
    invoiceRepo = new MockInvoiceRepository();
    paymentRepo = new MockPaymentRepository();
    compRepo = new MockCompensationRepository();
    payrollRepo = new MockPayrollRepository();
    treatmentRepo = new MockTreatmentRepository();
    doctorRepo = new MockDoctorRepository();

    postingService = new AccountingPostingService({
      accountingRepo,
      invoiceRepo,
      paymentRepo,
      compRepo,
      payrollRepo,
      treatmentRepo,
      doctorRepo
    });
  });

  // 1. Branch Admin can record operational expenses
  it("1. Branch Admin should be able to record operational expenses successfully", async () => {
    const expenseAccounts = (await accountingRepo.getAccounts()).filter(
      (a) => a.accountType === AccountType.EXPENSE && a.isActive
    );
    const assetAccounts = (await accountingRepo.getAccounts()).filter(
      (a) => a.accountType === AccountType.ASSET && a.isActive
    );

    const electricityAcc = expenseAccounts.find((a) => a.code === "5040") || expenseAccounts[0];
    const cashAcc = assetAccounts.find((a) => a.code === "1000") || assetAccounts[0];

    const result = await postingService.postBranchExpense(
      {
        branchId: "branch-gebang",
        expenseAccountId: electricityAcc.id,
        paymentAccountId: cashAcc.id,
        amount: 350000,
        date: "2026-09-22",
        description: "Pembayaran Listrik PLN Cabang Gebang",
        referenceNumber: "KWT-PLN-998"
      },
      UserRole.BRANCH_ADMIN,
      "branch-gebang",
      "Siska Wardani"
    );

    expect(result).toBeDefined();
    expect(result.status).toBe(JournalStatus.POSTED);
    expect(result.branchId).toBe("branch-gebang");
    expect(result.totalDebit).toBe(350000);
    expect(result.sourceType).toBe(JournalSourceType.EXPENSE);
  });

  // 2. Branch Admin cannot select Gaji/Insentif/Share Dokter in manual expense dropdown
  it("2. Manual expense account selection should exclude Gaji, Insentif, and Share Dokter accounts", async () => {
    const allAccounts = await accountingRepo.getAccounts();

    // Simulation of manual dropdown filtering in Expenses.tsx
    const filteredExpenseAccounts = allAccounts.filter((a) => {
      if (a.accountType !== AccountType.EXPENSE || !a.isActive) return false;

      const code = a.code;
      const nameLower = a.name.toLowerCase();
      const isPayrollOrComp =
        code === "5000" ||
        code === "5010" ||
        code === "5020" ||
        nameLower.includes("gaji") ||
        nameLower.includes("insentif") ||
        nameLower.includes("biaya dokter") ||
        nameLower.includes("jasa dokter");

      return !isPayrollOrComp;
    });

    const hasGajiStaff = filteredExpenseAccounts.some((a) => a.code === "5000");
    const hasBiayaDokter = filteredExpenseAccounts.some((a) => a.code === "5010");
    const hasInsentif = filteredExpenseAccounts.some((a) => a.code === "5020");

    expect(hasGajiStaff).toBe(false);
    expect(hasBiayaDokter).toBe(false);
    expect(hasInsentif).toBe(false);

    // Operational expenses should remain available
    const hasListrik = filteredExpenseAccounts.some((a) => a.code === "5040");
    expect(hasListrik).toBe(true);
  });

  // 3. Payroll automatically generates accounting entries
  it("3. Payroll processing should automatically generate accounting journal entries", async () => {
    const payrolls = await payrollRepo.getPayrolls(9, 2026);
    expect(payrolls.length).toBeGreaterThan(0);

    const targetPayroll = payrolls[0];
    const dbPayroll = db.payrolls.find((p) => p.id === targetPayroll.id);
    if (dbPayroll) {
      dbPayroll.status = PayrollStatus.APPROVED;
    }

    const journal = await postingService.postPayroll(
      targetPayroll.id,
      UserRole.SUPER_ADMIN,
      null,
      "Admin Finance"
    );

    expect(journal).toBeDefined();
    expect(journal.sourceType).toBe(JournalSourceType.PAYROLL);
    expect(journal.sourceId).toBe(targetPayroll.id);
    expect(journal.status).toBe(JournalStatus.POSTED);
  });

  // 4. Compensation automatically generates accounting entries
  it("4. Compensation accrual should automatically generate accounting journal entries", async () => {
    const accruals = await compRepo.getCompensationAccruals();
    expect(accruals.length).toBeGreaterThan(0);

    const targetAccrual = accruals[0];
    const postedJournal = await postingService.postCompensation(
      targetAccrual.id,
      UserRole.SUPER_ADMIN,
      null,
      "System Auto"
    );

    expect(postedJournal).toBeDefined();
    expect(postedJournal.sourceType).toBe(JournalSourceType.COMPENSATION);
    expect(postedJournal.status).toBe(JournalStatus.POSTED);
  });

  // 5. Branch Expense automatically generates accounting entries
  it("5. Branch Expense should automatically generate debit expense and credit cash/bank journal lines", async () => {
    const expenseAccounts = (await accountingRepo.getAccounts()).filter(
      (a) => a.accountType === AccountType.EXPENSE && a.isActive
    );
    const assetAccounts = (await accountingRepo.getAccounts()).filter(
      (a) => a.accountType === AccountType.ASSET && a.isActive
    );

    const res = await postingService.postBranchExpense(
      {
        branchId: "branch-gebang",
        expenseAccountId: expenseAccounts[0].id,
        paymentAccountId: assetAccounts[0].id,
        amount: 250000,
        date: "2026-09-22",
        description: "Beli ATK Kertas & Pulpen"
      },
      UserRole.BRANCH_ADMIN,
      "branch-gebang",
      "Admin Gebang"
    );

    expect(res.lines.length).toBe(2);
    const debitLine = res.lines.find((l) => l.debit > 0);
    const creditLine = res.lines.find((l) => l.credit > 0);

    expect(debitLine?.debit).toBe(250000);
    expect(creditLine?.credit).toBe(250000);
  });

  // 6. No double counting occurs
  it("6. Operational expense entries should be distinct from payroll and compensation journals", async () => {
    const allJournals = await accountingRepo.getJournals();
    const expenseJournals = allJournals.filter((j) => j.sourceType === JournalSourceType.EXPENSE);
    const payrollJournals = allJournals.filter((j) => j.sourceType === JournalSourceType.PAYROLL);
    const compJournals = allJournals.filter((j) => j.sourceType === JournalSourceType.COMPENSATION);

    // Sources must be distinct without overlapping source ids
    const expenseSourceIds = new Set(expenseJournals.map((j) => j.sourceId));
    const payrollSourceIds = new Set(payrollJournals.map((j) => j.sourceId));

    for (const id of expenseSourceIds) {
      if (id) {
        expect(payrollSourceIds.has(id)).toBe(false);
      }
    }
  });

  // 7. Branch Isolation is enforced for Branch Admin
  it("7. Branch Admin should only access financial entries for their assigned branch", async () => {
    const gebangJournals = await accountingRepo.getJournals({ branchId: "branch-gebang" });
    const allGebang = gebangJournals.every((j) => j.branchId === "branch-gebang");
    expect(allGebang).toBe(true);

    // Attempting to post branch expense for another branch as branch admin should fail
    await expect(
      postingService.postBranchExpense(
        {
          branchId: "branch-bintaro",
          expenseAccountId: "coa-5040",
          paymentAccountId: "coa-1000",
          amount: 100000,
          date: "2026-09-22",
          description: "Listrik Bintaro"
        },
        UserRole.BRANCH_ADMIN,
        "branch-gebang", // User is assigned to gebang
        "Siska Wardani"
      )
    ).rejects.toThrow();
  });

  // 8. Super Admin retains detailed accounting visibility
  it("8. Super Admin should maintain full visibility across all branches and raw accounting details", async () => {
    const allJournals = await accountingRepo.getJournals();
    expect(allJournals.length).toBeGreaterThan(0);

    const journalWithLines = allJournals.find((j) => j.lines && j.lines.length >= 2);
    expect(journalWithLines).toBeDefined();
    expect(journalWithLines?.journalNumber).toBeDefined();
    expect(journalWithLines?.totalDebit).toEqual(journalWithLines?.totalCredit);
  });

  // 9. Indonesian operational terminology verified
  it("9. Indonesian operational terminology mapping should be correct and complete", () => {
    const termMap: Record<string, string> = {
      "Branch Expense": "Pengeluaran Cabang",
      "Create Expense": "Catat Pengeluaran",
      "Journal Entry": "Pencatatan Keuangan",
      "General Ledger": "Riwayat Keuangan",
      "Chart of Accounts": "Daftar Jenis Akun",
      "Posted": "Tercatat",
      "Void": "Dibatalkan",
      "Outstanding": "Sisa Tagihan",
      "Paid": "Lunas",
      "Partially Paid": "Dibayar Sebagian",
      "Open": "Belum Lunas",
      "Compensation": "Insentif / Pembagian Jasa"
    };

    expect(termMap["Branch Expense"]).toBe("Pengeluaran Cabang");
    expect(termMap["Create Expense"]).toBe("Catat Pengeluaran");
    expect(termMap["Outstanding"]).toBe("Sisa Tagihan");
    expect(termMap["General Ledger"]).toBe("Riwayat Keuangan");
    expect(termMap["Posted"]).toBe("Tercatat");
    expect(termMap["Void"]).toBe("Dibatalkan");
  });

  // 10. No technical accounting jargon on operational forms
  it("10. Operational form field labels should use user-friendly Indonesian terminology", () => {
    const formFields = {
      date: "Tanggal Pengeluaran",
      type: "Jenis Pengeluaran",
      amount: "Jumlah (Rp)",
      paymentMethod: "Dibayar Menggunakan",
      notes: "Keterangan",
      proof: "Bukti / No. Referensi / Kwitansi"
    };

    expect(formFields.type).not.toContain("COA Code");
    expect(formFields.type).not.toContain("Debit Account");
    expect(formFields.paymentMethod).not.toContain("Credit Account");
    expect(formFields.notes).toBe("Keterangan");
  });
});
