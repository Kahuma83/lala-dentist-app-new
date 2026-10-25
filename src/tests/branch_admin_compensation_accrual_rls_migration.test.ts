import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("Branch admin treatment compensation accrual RLS migration", () => {
  const migration = fs.readFileSync(
    path.resolve(
      process.cwd(),
      "supabase/migrations/20261227000000_allow_branch_admin_treatment_compensation_accruals.sql"
    ),
    "utf-8"
  );

  it("allows branch admins only in an accessible branch", () => {
    expect(migration).toContain("public.get_user_role() = 'BRANCH_ADMIN'");
    expect(migration).toContain("public.user_can_access_branch(branch_id)");
  });

  it("preserves treatment, compensation-rule, snapshot, and amount validation", () => {
    expect(migration).toContain("job.status IN ('SELESAI', 'DISERAHKAN')");
    expect(migration).toContain("rule.is_active");
    expect(migration).toContain("rule.rule_type_snapshot IN ('PERCENTAGE', 'FIXED_PER_TREATMENT')");
    expect(migration).toContain("compensation_accruals.amount = CASE");
    expect(migration).toContain("public.user_can_manage_treatment_branch(branch_id)");
  });

  it("replaces only the existing insert policy", () => {
    expect(migration).toContain('DROP POLICY IF EXISTS "Validated compensation accrual insert"');
    expect(migration).toContain('CREATE POLICY "Validated compensation accrual insert"');
    expect(migration).toContain("FOR INSERT");
    expect(migration).not.toMatch(/FOR UPDATE|FOR DELETE/i);
  });
});
