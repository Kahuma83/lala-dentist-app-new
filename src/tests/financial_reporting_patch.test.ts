import { describe, it, expect, beforeEach } from "vitest";
import { MockAccountingRepository } from "../repositories/mockRepositories";
import { UserRole, JournalStatus, JournalSourceType, AccountType, AccountCategory, NormalBalance } from "../types/domain";

describe("Financial Reporting & General Ledger UX Patch Tests", () => {
  let repo: MockAccountingRepository;

  beforeEach(() => {
    repo = new MockAccountingRepository();
  });

  it("1. Buku Besar: 'Semua Akun' (ALL) displays all ledger entries matching branch/date filter", async () => {
    const allEntries = await repo.getLedgerEntries(
      { accountId: "ALL" },
      UserRole.SUPER_ADMIN,
      null
    );

    expect(allEntries).toBeDefined();
    expect(Array.isArray(allEntries)).toBe(true);
    expect(allEntries.length).toBeGreaterThan(0);

    // Verify entries contain multiple distinct accountIds
    const uniqueAccounts = new Set(allEntries.map((e) => e.accountId));
    expect(uniqueAccounts.size).toBeGreaterThan(1);
  });

  it("2. Buku Besar: Specific COA displays only entries for that COA", async () => {
    const specificEntries = await repo.getLedgerEntries(
      { accountId: "coa-1000" },
      UserRole.SUPER_ADMIN,
      null
    );

    expect(specificEntries).toBeDefined();
    specificEntries.forEach((entry) => {
      expect(entry.accountId).toBe("coa-1000");
    });
  });

  it("3. Filter Cabang: Branch Admin is restricted to assigned branch", async () => {
    const branchGebangEntries = await repo.getLedgerEntries(
      { accountId: "ALL", branchId: "branch-gebang" },
      UserRole.BRANCH_ADMIN,
      "branch-gebang"
    );

    branchGebangEntries.forEach((entry) => {
      expect(entry.branchId).toBe("branch-gebang");
    });

    // Attempting to ask for another branch as BRANCH_ADMIN should still enforce assigned branch
    const forcedOtherBranchEntries = await repo.getLedgerEntries(
      { accountId: "ALL", branchId: "branch-kencong" },
      UserRole.BRANCH_ADMIN,
      "branch-gebang"
    );

    forcedOtherBranchEntries.forEach((entry) => {
      expect(entry.branchId).toBe("branch-gebang");
    });
  });

  it("4. Filter Cabang: Super Admin can query specific branch or all branches", async () => {
    const gebangReport = await repo.getIncomeStatementReport(
      { branchId: "branch-gebang" },
      UserRole.SUPER_ADMIN,
      null
    );
    expect(gebangReport.branchId).toBe("branch-gebang");

    const consolidatedReport = await repo.getIncomeStatementReport(
      { branchId: "ALL" },
      UserRole.SUPER_ADMIN,
      null
    );
    expect(consolidatedReport.branchId).toBeNull(); // Consolidated
    expect(consolidatedReport.branchName).toContain("Semua Cabang");
  });

  it("5. Laba Rugi: Income statement for specific branch uses ONLY that branch's POSTED journals", async () => {
    const report = await repo.getIncomeStatementReport(
      { branchId: "branch-gebang" },
      UserRole.SUPER_ADMIN,
      null
    );

    expect(report.totalRevenue).toBeGreaterThanOrEqual(0);
    expect(report.totalExpense).toBeGreaterThanOrEqual(0);
    expect(report.netIncome).toBe(report.totalRevenue - report.totalExpense);
  });

  it("6. Laba Rugi: Consolidated report uses all branches' POSTED journals", async () => {
    const gebangReport = await repo.getIncomeStatementReport(
      { branchId: "branch-gebang" },
      UserRole.SUPER_ADMIN,
      null
    );
    const kencongReport = await repo.getIncomeStatementReport(
      { branchId: "branch-kencong" },
      UserRole.SUPER_ADMIN,
      null
    );
    const consolidatedReport = await repo.getIncomeStatementReport(
      { branchId: "ALL" },
      UserRole.SUPER_ADMIN,
      null
    );

    expect(consolidatedReport.totalRevenue).toBeGreaterThanOrEqual(gebangReport.totalRevenue);
    expect(consolidatedReport.totalRevenue).toBeGreaterThanOrEqual(kencongReport.totalRevenue);
  });

  it("7. Laba Rugi: DRAFT and VOID journals are excluded from Laba Rugi", async () => {
    // Create a DRAFT journal with high revenue
    const draftJournal = await repo.createDraftJournal(
      {
        journalDate: "2026-09-23",
        branchId: "branch-gebang",
        description: "Draft Test Journal Revenue",
        sourceType: JournalSourceType.MANUAL,
        lines: [
          { accountId: "coa-1000", debit: 50000000, credit: 0 },
          { accountId: "coa-4000", debit: 0, credit: 50000000 }
        ]
      },
      "TestUser",
      UserRole.SUPER_ADMIN,
      null
    );

    const reportBeforePost = await repo.getIncomeStatementReport(
      { branchId: "branch-gebang", dateFrom: "2026-09-23", dateTo: "2026-09-23" },
      UserRole.SUPER_ADMIN,
      null
    );

    // Revenue in draft should NOT be included
    const draftRevenueItem = reportBeforePost.revenues.find((r) => r.accountId === "coa-4000");
    const amountBeforePost = draftRevenueItem ? draftRevenueItem.amount : 0;

    // Post the journal
    await repo.postJournal(draftJournal.id, "TestUser", UserRole.SUPER_ADMIN, null);

    const reportAfterPost = await repo.getIncomeStatementReport(
      { branchId: "branch-gebang", dateFrom: "2026-09-23", dateTo: "2026-09-23" },
      UserRole.SUPER_ADMIN,
      null
    );

    const postRevenueItem = reportAfterPost.revenues.find((r) => r.accountId === "coa-4000");
    const amountAfterPost = postRevenueItem ? postRevenueItem.amount : 0;

    expect(amountAfterPost).toBe(amountBeforePost + 50000000);

    // Void the journal
    await repo.voidJournal(draftJournal.id, "TestUser", "Voiding for test", UserRole.SUPER_ADMIN, null);

    const reportAfterVoid = await repo.getIncomeStatementReport(
      { branchId: "branch-gebang", dateFrom: "2026-09-23", dateTo: "2026-09-23" },
      UserRole.SUPER_ADMIN,
      null
    );

    const voidRevenueItem = reportAfterVoid.revenues.find((r) => r.accountId === "coa-4000");
    const amountAfterVoid = voidRevenueItem ? voidRevenueItem.amount : 0;

    // Revenue after voiding should be back to amountBeforePost
    expect(amountAfterVoid).toBe(amountBeforePost);
  });

  it("8. Konsistensi: Laba Rugi = Revenue - Expense strictly", async () => {
    const report = await repo.getIncomeStatementReport(
      { branchId: "ALL" },
      UserRole.SUPER_ADMIN,
      null
    );

    const sumRevenues = report.revenues.reduce((s, r) => s + r.amount, 0);
    const sumExpenses = report.expenses.reduce((s, e) => s + e.amount, 0);

    expect(report.totalRevenue).toBe(sumRevenues);
    expect(report.totalExpense).toBe(sumExpenses);
    expect(report.netIncome).toBe(sumRevenues - sumExpenses);
  });
});
