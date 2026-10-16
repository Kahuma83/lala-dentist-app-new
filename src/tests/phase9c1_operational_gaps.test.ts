import { describe, it, expect, beforeEach } from "vitest";
import {
  MockCompensationRepository,
  MockAccountingRepository,
  MockBranchRepository,
  MockPayrollRepository,
  MockTreatmentRepository,
  MockDoctorRepository,
  MockStaffRepository
} from "../repositories/mockRepositories";
import { AccountingPostingService } from "../services/accountingPostingService";
import {
  UserRole,
  JournalStatus,
  JournalSourceType,
  AccountType,
  AccountCategory,
  StaffPosition
} from "../types/domain";

describe("Phase 9C.1 Operational Gaps & Financial Completeness Tests", () => {
  let compRepo: MockCompensationRepository;
  let accountingRepo: MockAccountingRepository;
  let branchRepo: MockBranchRepository;
  let payrollRepo: MockPayrollRepository;
  let postingService: AccountingPostingService;
  let staffRepo: MockStaffRepository;
  let doctorRepo: MockDoctorRepository;
  let treatmentRepo: MockTreatmentRepository;

  beforeEach(() => {
    compRepo = new MockCompensationRepository();
    accountingRepo = new MockAccountingRepository();
    branchRepo = new MockBranchRepository();
    payrollRepo = new MockPayrollRepository();
    staffRepo = new MockStaffRepository();
    doctorRepo = new MockDoctorRepository();
    treatmentRepo = new MockTreatmentRepository();
    postingService = new AccountingPostingService({
      accountingRepo,
      compRepo,
      payrollRepo,
      treatmentRepo,
      doctorRepo
    });
  });

  describe("1. Compensation Rules & Base Salary Handling", () => {
    it("should allow creating a BASE_SALARY compensation rule for non-doctor staff", async () => {
      const rule = await compRepo.createCompensationRule({
        staffId: "staff-gebang-admin-1",
        name: "Gaji Pokok Branch Admin Gebang",
        ruleTypeSnapshot: "BASE_SALARY",
        valueSnapshot: 3500000,
        serviceId: null,
        isActive: true
      });

      expect(rule.id).toBeDefined();
      expect(rule.ruleTypeSnapshot).toBe("BASE_SALARY");
      expect(rule.valueSnapshot).toBe(3500000);
      expect(rule.isActive).toBe(true);

      const staffRules = await compRepo.getCompensationRulesByStaff("staff-gebang-admin-1");
      expect(staffRules.some((r) => r.ruleTypeSnapshot === "BASE_SALARY" && r.valueSnapshot === 3500000)).toBe(true);
    });

    it("should NOT calculate treatment accruals from BASE_SALARY rules", async () => {
      // Create a BASE_SALARY rule for Claryssa
      await compRepo.createCompensationRule({
        staffId: "assistant-clary",
        name: "Gaji Pokok Asisten Claryssa",
        ruleTypeSnapshot: "BASE_SALARY",
        valueSnapshot: 2800000,
        serviceId: null,
        isActive: true
      });

      // Also create a treatment percentage rule (10%)
      await compRepo.createCompensationRule({
        staffId: "assistant-clary",
        name: "Fee Pendamping Tindakan",
        ruleTypeSnapshot: "PERCENTAGE",
        valueSnapshot: 10,
        serviceId: null,
        isActive: true
      });

      // Complete treatment-job-1 (which has picAssistantId: assistant-clary and service-scaling base 150000)
      await treatmentRepo.completeTreatmentJob(
        "treatment-job-1",
        UserRole.DOCTOR,
        "branch-gebang",
        "doc-syafira"
      );

      // Calculate accrual for treatment-job-1
      const accruals = await compRepo.calculateAndAccrueForTreatment("treatment-job-1");

      // Filter accruals for assistant-clary: should ONLY contain treatment fees (never the 2,800,000 base salary)
      const claryAccruals = accruals.filter((a) => a.staffId === "assistant-clary");
      expect(claryAccruals.length).toBeGreaterThan(0);
      expect(claryAccruals.some((a) => a.ruleTypeSnapshot === "BASE_SALARY")).toBe(false);
      expect(claryAccruals.every((a) => a.ruleTypeSnapshot === "PERCENTAGE")).toBe(true);
      expect(claryAccruals.every((a) => a.amount === 15000)).toBe(true);
    });

    it("should accurately filter compensation rules by serviceId if specified", async () => {
      // Global 5% rule for any service
      await compRepo.createCompensationRule({
        staffId: "doc-syafira",
        name: "Komisi Global Dokter Andi",
        ruleTypeSnapshot: "PERCENTAGE",
        valueSnapshot: 5,
        serviceId: null,
        isActive: true
      });

      // Specific 30% rule only for Perawatan Saluran Akar (service-root-canal)
      await compRepo.createCompensationRule({
        staffId: "doc-syafira",
        name: "Spesialis Root Canal",
        ruleTypeSnapshot: "PERCENTAGE",
        valueSnapshot: 30,
        serviceId: "service-root-canal",
        isActive: true
      });

      // Accrual for Root Canal (treatment-job-3, service-root-canal base price 400000):
      // Both global 5% (20000) and specific 30% (120000) should trigger = 140,000 total
      const accrualsRootCanal = await compRepo.calculateAndAccrueForTreatment("treatment-job-3");
      const andiAccruals = accrualsRootCanal.filter((a) => a.staffId === "doc-syafira");
      expect(andiAccruals.length).toBe(2);
      const totalAmount = andiAccruals.reduce((sum, a) => sum + a.amount, 0);
      expect(totalAmount).toBe(20000 + 120000); // 140,000
    });
  });

  describe("2. Branch Operational Expense & Accounting Integration", () => {
    it("should successfully post a branch operational expense to General Ledger", async () => {
      // Look up Beban Listrik (5040) and Kas (1000)
      const accounts = await accountingRepo.getAccounts();
      const expenseAcc = accounts.find((a) => a.code === "5040")!;
      const cashAcc = accounts.find((a) => a.code === "1000")!;

      expect(expenseAcc).toBeDefined();
      expect(expenseAcc.accountType).toBe(AccountType.EXPENSE);
      expect(cashAcc).toBeDefined();
      expect(cashAcc.accountType).toBe(AccountType.ASSET);

      const postedJournal = await postingService.postBranchExpense(
        {
          branchId: "branch-gebang",
          expenseAccountId: expenseAcc.id,
          paymentAccountId: cashAcc.id,
          amount: 450000,
          date: "2026-09-22",
          description: "Pembayaran token listrik PLN Gebang",
          referenceNumber: "PLN-202609-001"
        },
        UserRole.BRANCH_ADMIN,
        "branch-gebang",
        "Admin Gebang"
      );

      expect(postedJournal).toBeDefined();
      expect(postedJournal.journalNumber).toMatch(/^JRN-.*$/);
      expect(postedJournal.status).toBe(JournalStatus.POSTED);
      expect(postedJournal.sourceType).toBe(JournalSourceType.EXPENSE);
      expect(postedJournal.branchId).toBe("branch-gebang");
      expect(postedJournal.totalDebit).toBe(450000);
      expect(postedJournal.totalCredit).toBe(450000);

      // Verify double-entry lines
      const debitLine = postedJournal.lines.find((l) => l.debit > 0);
      const creditLine = postedJournal.lines.find((l) => l.credit > 0);

      expect(debitLine?.accountId).toBe(expenseAcc.id);
      expect(debitLine?.debit).toBe(450000);
      expect(debitLine?.branchId).toBe("branch-gebang");

      expect(creditLine?.accountId).toBe(cashAcc.id);
      expect(creditLine?.credit).toBe(450000);
      expect(creditLine?.branchId).toBe("branch-gebang");
    });

    it("should reject posting when a non-expense account is passed for debit", async () => {
      const accounts = await accountingRepo.getAccounts();
      const revenueAcc = accounts.find((a) => a.accountType === AccountType.REVENUE)!;
      const cashAcc = accounts.find((a) => a.code === "1000")!;

      await expect(
        postingService.postBranchExpense(
          {
            branchId: "branch-gebang",
            expenseAccountId: revenueAcc.id, // Invalid: Revenue instead of Expense
            paymentAccountId: cashAcc.id,
            amount: 150000,
            date: "2026-09-22",
            description: "Test Invalid Debit"
          },
          UserRole.SUPER_ADMIN,
          null,
          "Super Admin"
        )
      ).rejects.toThrow(/Akun pengeluaran harus bertipe EXPENSE/i);
    });

    it("should reject posting when a non-asset account is passed for payment", async () => {
      const accounts = await accountingRepo.getAccounts();
      const expenseAcc = accounts.find((a) => a.code === "5040")!;
      const liabilityAcc = accounts.find((a) => a.accountType === AccountType.LIABILITY)!;

      await expect(
        postingService.postBranchExpense(
          {
            branchId: "branch-gebang",
            expenseAccountId: expenseAcc.id,
            paymentAccountId: liabilityAcc.id, // Invalid: Liability instead of Asset
            amount: 150000,
            date: "2026-09-22",
            description: "Test Invalid Credit"
          },
          UserRole.SUPER_ADMIN,
          null,
          "Super Admin"
        )
      ).rejects.toThrow(/Akun pembayaran harus bertipe ASSET/i);
    });

    it("should reject posting when Branch Admin tries to post for another branch", async () => {
      const accounts = await accountingRepo.getAccounts();
      const expenseAcc = accounts.find((a) => a.code === "5040")!;
      const cashAcc = accounts.find((a) => a.code === "1000")!;

      await expect(
        postingService.postBranchExpense(
          {
            branchId: "branch-kalisat", // Branch Admin is assigned to branch-gebang!
            expenseAccountId: expenseAcc.id,
            paymentAccountId: cashAcc.id,
            amount: 200000,
            date: "2026-09-22",
            description: "Pengeluaran Cabang Lain"
          },
          UserRole.BRANCH_ADMIN,
          "branch-gebang",
          "Admin Gebang"
        )
      ).rejects.toThrow(/Akses ditolak: Branch Admin hanya dapat mencatat pengeluaran/i);
    });

    it("should allow VOID on a POSTED expense journal with audit trail", async () => {
      const accounts = await accountingRepo.getAccounts();
      const expenseAcc = accounts.find((a) => a.code === "5040")!;
      const cashAcc = accounts.find((a) => a.code === "1000")!;

      const journal = await postingService.postBranchExpense(
        {
          branchId: "branch-gebang",
          expenseAccountId: expenseAcc.id,
          paymentAccountId: cashAcc.id,
          amount: 300000,
          date: "2026-09-22",
          description: "Pembelian ATK Operasional"
        },
        UserRole.BRANCH_ADMIN,
        "branch-gebang",
        "Admin Gebang"
      );

      expect(journal.status).toBe(JournalStatus.POSTED);

      // Void with valid reason
      const voidedJournal = await accountingRepo.voidJournal(
        journal.id,
        "Admin Gebang",
        "Kwitansi ganda, transaksi dibatalkan",
        UserRole.BRANCH_ADMIN,
        "branch-gebang"
      );

      expect(voidedJournal.status).toBe(JournalStatus.VOID);
      expect(voidedJournal.voidReason).toBe("Kwitansi ganda, transaksi dibatalkan");
      expect(voidedJournal.voidedBy).toBe("Admin Gebang");
      expect(voidedJournal.voidedAt).toBeDefined();
    });
  });
});
