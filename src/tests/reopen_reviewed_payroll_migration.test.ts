import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("Reviewed payroll correction migration", () => {
  const migration = fs.readFileSync(
    path.resolve(process.cwd(), "supabase/migrations/20261219000000_reopen_reviewed_payroll_for_correction.sql"),
    "utf-8"
  );

  it("only allows Super Admin to reopen REVIEW payroll with no journal history", () => {
    expect(migration).toMatch(/auth\.uid\(\) IS NULL OR NOT public\.is_super_admin\(\)/i);
    expect(migration).toMatch(/payroll_row\.status <> 'REVIEW'/i);
    expect(migration).toMatch(/FROM public\.journal_entries[\s\S]*?source_type = 'PAYROLL'[\s\S]*?source_id = p_payroll_id::TEXT/i);
    expect(migration).toMatch(/DELETE FROM public\.payroll_items[\s\S]*?WHERE payroll_id = p_payroll_id/i);
    expect(migration).toMatch(/SET status = 'DRAFT'/i);
    expect(migration).toMatch(/net_salary = 0/i);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.reopen_reviewed_payroll_for_correction\(UUID\) TO authenticated/i);
  });
});
