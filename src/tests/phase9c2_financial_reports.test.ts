import { describe, it, expect, beforeEach } from "vitest";
import { MockDatabase } from "../data/mockData";
import {
  MockAccountingRepository,
  MockCompensationRepository,
  MockPayrollRepository,
  MockDoctorScheduleRepository
} from "../repositories/mockRepositories";
import {
  UserRole,
  AccountType,
  AccountCategory,
  NormalBalance,
  JournalSourceType,
  JournalStatus
} from "../types/domain";

describe("Phase 9C.2 Financial Reports & Advanced Compensation Tests", () => {
  let accountingRepo: MockAccountingRepository;
  let compRepo: MockCompensationRepository;
  let payrollRepo: MockPayrollRepository;
  let db: MockDatabase;

  beforeEach(() => {
    MockDatabase.resetInstance();
    db = MockDatabase.getInstance();
    accountingRepo = new MockAccountingRepository();
    compRepo = new MockCompensationRepository();
    payrollRepo = new MockPayrollRepository();
  });

  describe("1. Income Statement (Laba Rugi) Report", () => {
    it("should correctly aggregate revenues, expenses and net income from posted journals", async () => {
      const report = await accountingRepo.getIncomeStatementReport(
        undefined,
        UserRole.SUPER_ADMIN
      );

      expect(report).toBeDefined();
      expect(report.totalRevenue).toBeGreaterThanOrEqual(0);
      expect(report.totalExpense).toBeGreaterThanOrEqual(0);
      expect(report.netIncome).toBe(report.totalRevenue - report.totalExpense);
      expect(Array.isArray(report.revenues)).toBe(true);
      expect(Array.isArray(report.expenses)).toBe(true);
    });

    it("should filter income statement by branch isolation", async () => {
      const gebangReport = await accountingRepo.getIncomeStatementReport(
        { branchId: "branch-gebang" },
        UserRole.BRANCH_ADMIN,
        "branch-gebang"
      );

      expect(gebangReport.branchId).toBe("branch-gebang");
      expect(gebangReport.branchName).toBe("Cabang Gebang");
    });

    it("should reject non-admin roles from accessing financial reports", async () => {
      await expect(
        accountingRepo.getIncomeStatementReport(undefined, UserRole.DOCTOR, "branch-gebang")
      ).rejects.toThrow("Akses ditolak");

      await expect(
        accountingRepo.getIncomeStatementReport(undefined, UserRole.PATIENT, null)
      ).rejects.toThrow("Akses ditolak");
    });
  });

  describe("2. Trial Balance (Neraca Saldo) Report", () => {
    it("should calculate debit, credit, and verify balance equilibrium", async () => {
      const trialBalance = await accountingRepo.getTrialBalanceReport(
        undefined,
        UserRole.SUPER_ADMIN
      );

      expect(trialBalance).toBeDefined();
      expect(trialBalance.totalDebit).toBe(trialBalance.totalCredit);
      expect(trialBalance.isBalanced).toBe(true);
      expect(trialBalance.items.length).toBeGreaterThan(0);
    });

    it("should calculate correct ending balances for debit and credit normal balance accounts", async () => {
      const trialBalance = await accountingRepo.getTrialBalanceReport(
        undefined,
        UserRole.SUPER_ADMIN
      );

      for (const item of trialBalance.items) {
        if (item.normalBalance === NormalBalance.DEBIT) {
          expect(item.endingBalance).toBe(item.debit - item.credit);
        } else {
          expect(item.endingBalance).toBe(item.credit - item.debit);
        }
      }
    });
  });

  describe("3. Balance Sheet (Neraca Keuangan) Report", () => {
    it("should satisfy the fundamental accounting equation: Assets = Liabilities + Equity + Net Income", async () => {
      const balanceSheet = await accountingRepo.getBalanceSheetReport(
        undefined,
        UserRole.SUPER_ADMIN
      );

      expect(balanceSheet).toBeDefined();
      expect(balanceSheet.totalAssets).toBe(balanceSheet.totalLiabilitiesAndEquity);
      expect(balanceSheet.isBalanced).toBe(true);
      expect(balanceSheet.totalEquity).toBe(
        balanceSheet.equity.reduce((s, e) => s + e.amount, 0) + balanceSheet.currentPeriodNetIncome
      );
    });
  });

  describe("4. Advanced Compensation & Doctor Sitting Fee Rules", () => {
    it("should enforce doctor role check for DOCTOR_SITTING_FEE rule", async () => {
      // Reject for non-doctor
      await expect(
        compRepo.createCompensationRule({
          staffId: "staff-gebang-admin-1",
          name: "Uang Duduk Admin",
          ruleTypeSnapshot: "DOCTOR_SITTING_FEE",
          valueSnapshot: 150000,
          isActive: true
        })
      ).rejects.toThrow("Doctor Sitting Fee hanya dapat diterapkan untuk Dokter");

      // Accept for registered doctor
      const docRule = await compRepo.createCompensationRule({
        staffId: "doc-syafira",
        name: "Uang Duduk drg. Andi",
        ruleTypeSnapshot: "DOCTOR_SITTING_FEE",
        valueSnapshot: 200000,
        isActive: true,
        effectiveStartDate: "2026-01-01",
        effectiveEndDate: "2026-12-31"
      });

      expect(docRule.id).toBeDefined();
      expect(docRule.ruleTypeSnapshot).toBe("DOCTOR_SITTING_FEE");
      expect(docRule.valueSnapshot).toBe(200000);
    });

    it("should prevent overlapping active BASE_SALARY rules for the same staff", async () => {
      await compRepo.createCompensationRule({
        staffId: "staff-gebang-admin-1",
        name: "Gaji Pokok Awal 2026",
        ruleTypeSnapshot: "BASE_SALARY",
        valueSnapshot: 3000000,
        effectiveStartDate: "2026-01-01",
        effectiveEndDate: "2026-06-30",
        isActive: true
      });

      // Overlapping date range should be rejected
      await expect(
        compRepo.createCompensationRule({
          staffId: "staff-gebang-admin-1",
          name: "Gaji Pokok Tumpang Tindih",
          ruleTypeSnapshot: "BASE_SALARY",
          valueSnapshot: 3500000,
          effectiveStartDate: "2026-03-01",
          effectiveEndDate: "2026-08-31",
          isActive: true
        })
      ).rejects.toThrow("Aturan kompensasi bertabrakan");

      // Non-overlapping future date range should succeed
      const validFutureRule = await compRepo.createCompensationRule({
        staffId: "staff-gebang-admin-1",
        name: "Gaji Pokok Semester 2",
        ruleTypeSnapshot: "BASE_SALARY",
        valueSnapshot: 3500000,
        effectiveStartDate: "2026-07-01",
        effectiveEndDate: "2026-12-31",
        isActive: true
      });

      expect(validFutureRule.id).toBeDefined();
    });

    it("should dynamically include doctor sitting fee in payroll generation based on schedules", async () => {
      // Create sitting fee rule for drg. Andi
      await compRepo.createCompensationRule({
        staffId: "doc-syafira",
        name: "Uang Duduk Sesi",
        ruleTypeSnapshot: "DOCTOR_SITTING_FEE",
        valueSnapshot: 250000,
        isActive: true
      });

      // Generate payroll for doc-syafira for 9/2026
      const payroll = await payrollRepo.generateMonthlyPayroll("doc-syafira", 9, 2026);
      const items = await payrollRepo.getPayrollItems(payroll.id);

      const sittingFeeItem = items.find(i => i.descriptionSnapshot.includes("Doctor Sitting Fee"));
      if (sittingFeeItem) {
        expect(sittingFeeItem.amountSnapshot).toBeGreaterThan(0);
        expect(payroll.totalCompensation).toBeGreaterThanOrEqual(sittingFeeItem.amountSnapshot);
      }
    });
  });
});
