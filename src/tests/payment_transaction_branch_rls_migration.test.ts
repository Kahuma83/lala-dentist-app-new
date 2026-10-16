import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("Payment transaction branch RLS migration", () => {
  const migration = fs.readFileSync(
    path.resolve(process.cwd(), "supabase/migrations/20261023000000_fix_payment_transaction_branch_rls.sql"),
    "utf-8"
  );

  it("removes permissive and legacy payment policies", () => {
    expect(migration).toContain('DROP POLICY IF EXISTS "Payment transactions full access policy"');
    expect(migration).toContain('DROP POLICY IF EXISTS "Payment branch isolation"');
  });

  it("restricts payment management to accessible branch admins or super admins", () => {
    expect(migration).toMatch(
      /CREATE POLICY "Payment branch isolation manage"[\s\S]*?public\.is_super_admin\(\)[\s\S]*?public\.get_user_role\(\) = 'BRANCH_ADMIN'[\s\S]*?public\.user_can_access_branch\(branch_id\)/i
    );
  });

  it("requires the payment branch to match the parent invoice branch", () => {
    expect(migration).toMatch(
      /i\.id = payment_transactions\.invoice_id[\s\S]*?i\.branch_id = payment_transactions\.branch_id[\s\S]*?public\.user_can_access_branch\(i\.branch_id\)/i
    );
  });
});
