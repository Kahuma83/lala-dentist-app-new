import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

describe("Owner daily cash report migration", () => {
  const migration = fs.readFileSync(
    path.resolve(process.cwd(), "supabase/manual-migrations/20270303000000_owner_daily_cash_report.sql"),
    "utf-8"
  );
  const cashFlowFix = fs.readFileSync(
    path.resolve(process.cwd(), "supabase/manual-migrations/20270304000000_owner_daily_cash_report_cash_flow_fixes.sql"),
    "utf-8"
  );
  const branchAdminFix = fs.readFileSync(
    path.resolve(process.cwd(), "supabase/manual-migrations/20270305000000_branch_admin_keriting_cash_management.sql"),
    "utf-8"
  );
  const dashboard = fs.readFileSync(
    path.resolve(process.cwd(), "src/components/OwnerDailyCashReport.tsx"),
    "utf-8"
  );
  const expensesPage = fs.readFileSync(
    path.resolve(process.cwd(), "src/pages/Expenses.tsx"),
    "utf-8"
  );

  it("limits report and rounding-fund operations to active Owner accounts", () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.get_owner_daily_cash_report/i);
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.record_owner_cash_rounding_entry/i);
    expect(migration).toMatch(/auth\.uid\(\) IS NULL OR NOT public\.is_owner\(\)/i);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_owner_daily_cash_report\(DATE\) TO authenticated/i);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.record_owner_cash_rounding_entry\(UUID, VARCHAR, DATE, BIGINT, TEXT\) TO authenticated/i);
    expect(migration).toMatch(/CREATE POLICY owner_cash_rounding_entries_read[\s\S]*?USING \(public\.is_owner\(\)\)/i);
  });

  it("aggregates successful payments by method and deducts only daily cash expenses before rounding", () => {
    expect(migration).toMatch(/payment\.status = 'SUCCESS'/i);
    expect(migration).toMatch(/payment_method = 'QRIS'[\s\S]*?payment_method = 'OTHER'[\s\S]*?payment_method = 'TRANSFER'[\s\S]*?payment_method = 'CASH'/i);
    expect(migration).toMatch(/AT TIME ZONE 'Asia\/Jakarta'/i);
    expect(migration).toMatch(/cash_source <> 'KERITING'/i);
    expect(migration).toMatch(/cash_collected, 0\) - coalesce\(expense\.expenses, 0\)/i);
    expect(migration).toMatch(/mod\([\s\S]*?50000\)/i);
    expect(migration).toMatch(/amount_to_bring/i);
  });

  it("keeps daily rounding, opening balance, keriting expenses, and settlements in the balance calculation", () => {
    expect(migration).toMatch(/'OPENING_BALANCE', 'SETTLEMENT'/i);
    expect(migration).toMatch(/accumulated_rounding[\s\S]*?keriting_expense\.expenses[\s\S]*?settlement\.amount/i);
    expect(migration).toMatch(/p_amount > v_available_balance/i);
    expect(migration).toMatch(/amount >= 50000 AND mod\(amount, 50000\) = 0/i);
    expect(migration).toMatch(/p_amount < 50000 OR mod\(p_amount, 50000\) <> 0/i);
    expect(migration).toMatch(/p_entry_date < v_latest_settlement_date/i);
    expect(migration).toMatch(/bool_and\(report\.rounding_balance IS NOT NULL\)/i);
    expect(dashboard).toContain('supabase.rpc("get_owner_daily_cash_report"');
    expect(dashboard).toContain('supabase.rpc("record_owner_cash_rounding_entry"');
    expect(dashboard).toContain("Total yang harus dibawa");
    expect(dashboard).toContain("Uang keriting hari ini");
    expect(dashboard).toContain("Catat setoran uang keriting");
  });

  it("uses payment dates and actual cash-account movements for daily cash totals", () => {
    expect(cashFlowFix).toMatch(/payment\.payment_date = p_date/i);
    expect(cashFlowFix).toMatch(/payment\.payment_date BETWEEN opening\.entry_date AND p_date/i);
    expect(cashFlowFix).toMatch(/account\.account_category = 'CASH' THEN line\.credit - line\.debit/i);
    expect(cashFlowFix).toMatch(/journal\.source_type IN \('EXPENSE', 'MANUAL', 'ADJUSTMENT', 'REVERSAL'\)/i);
    expect(cashFlowFix).toMatch(/original\.source_type IN \('EXPENSE', 'MANUAL', 'ADJUSTMENT'\)/i);
    expect(cashFlowFix).toMatch(/HAVING bool_or\([\s\S]*?account\.account_category = 'CASH'/i);
  });

  it("limits branch-admin cash reports and entries to the assigned branch", () => {
    expect(branchAdminFix).toMatch(/public\.get_user_role\(\) <> 'BRANCH_ADMIN'/i);
    expect(branchAdminFix).toMatch(/NOT public\.user_can_access_branch\(p_branch_id\)/i);
    expect(branchAdminFix).toMatch(/branch\.id = p_branch_id/i);
    expect(branchAdminFix).toMatch(/public\.get_user_role\(\) = 'BRANCH_ADMIN'[\s\S]*?public\.user_can_access_branch\(p_branch_id\)/i);
    expect(branchAdminFix).toMatch(/public\.get_branch_cash_rounding_report\(p_entry_date, p_branch_id\)/i);
    expect(branchAdminFix).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_branch_cash_rounding_report\(DATE, UUID\) TO authenticated/i);
  });

  it("shows the single-branch cash manager on Branch Admin expenses", () => {
    expect(dashboard).toMatch(/get_branch_cash_rounding_report/);
    expect(dashboard).toMatch(/p_branch_id: branchId/);
    expect(dashboard).toMatch(/\[branchId, refreshKey, reportDate\]/);
    expect(expensesPage).toMatch(/isBranchMatch\(userBranchId, branch\.id, branches\)/);
    expect(expensesPage).toMatch(/<OwnerDailyCashReport branchId=\{cashReportBranchId\} refreshKey=\{cashReportRefreshKey\} \/>/);
    expect(expensesPage).toMatch(/const refreshCashReport = \(\) => setCashReportRefreshKey\(\(key\) => key \+ 1\)/);
    expect(expensesPage.match(/refreshCashReport\(\);/g)).toHaveLength(4);
  });

  it("shows aggregate totals only on the Owner report and keeps branch details", () => {
    expect(dashboard).toMatch(/\{!branchId && \([\s\S]*?report\.totals\.total/);
    expect(dashboard).toContain('label="Total" value={branch.total}');
    expect(dashboard).toContain('label="Saldo uang keriting"');
  });
});
