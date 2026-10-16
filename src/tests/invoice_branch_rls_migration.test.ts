import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("Invoice branch RLS migration", () => {
  const migrationPath = path.resolve(
    process.cwd(),
    "supabase/migrations/20261019000000_fix_invoice_branch_rls.sql"
  );
  const migration = fs.readFileSync(migrationPath, "utf-8");

  it("replaces permissive legacy invoice policies", () => {
    expect(migration).toContain('DROP POLICY IF EXISTS "Invoices full access policy" ON public.invoices');
    expect(migration).toContain('DROP POLICY IF EXISTS "Invoice items full access policy" ON public.invoice_items');
  });

  it("allows branch admins to manage invoices only for branches they can access", () => {
    expect(migration).toMatch(
      /CREATE POLICY "Invoice branch isolation manage"[\s\S]*?FOR ALL[\s\S]*?public\.get_user_role\(\) = 'BRANCH_ADMIN'[\s\S]*?public\.user_can_access_branch\(branch_id\)[\s\S]*?WITH CHECK[\s\S]*?public\.user_can_access_branch\(branch_id\)/i
    );
  });

  it("checks invoice-item access through the parent invoice branch", () => {
    expect(migration).toMatch(
      /CREATE POLICY "Invoice items isolation"[\s\S]*?public\.user_can_access_branch\(i\.branch_id\)/i
    );
  });
});
