import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("Branch admin accounting access migration", () => {
  const migration = fs.readFileSync(
    path.resolve(process.cwd(), "supabase/migrations/20261028000000_fix_branch_admin_journal_access.sql"),
    "utf-8"
  );

  it("validates branch access using the authenticated account branch and the shared branch helper", () => {
    expect(migration).toContain("public.get_user_branch_id()::TEXT = target_branch_id::TEXT");
    expect(migration).toContain("OR public.user_can_access_branch(target_branch_id)");
    expect(migration).toContain("public.get_user_role() = 'BRANCH_ADMIN'");
  });

  it("replaces branch-scoped policies for journal headers and lines", () => {
    expect(migration).toContain('DROP POLICY IF EXISTS "Accounting journal insert draft by branch"');
    expect(migration).toContain('DROP POLICY IF EXISTS "Accounting journal lines insert into draft"');
    expect(migration).toContain("public.user_can_access_accounting_branch(branch_id)");
    expect(migration).toContain("journal.status = 'DRAFT'");
  });

  it("restricts execution of the helper to authenticated users", () => {
    expect(migration).toContain("FROM PUBLIC, anon");
    expect(migration).toContain("TO authenticated");
  });
});
