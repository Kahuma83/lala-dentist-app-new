import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("Accounting journal branch RLS migration", () => {
  const migration = fs.readFileSync(
    path.resolve(process.cwd(), "supabase/migrations/20261027000000_secure_accounting_journal_rls.sql"),
    "utf-8"
  );

  it("allows branch admins to create only draft journals within an accessible branch", () => {
    expect(migration).toMatch(
      /CREATE POLICY "Accounting journal insert draft by branch"[\s\S]*?FOR INSERT[\s\S]*?get_user_role\(\) = 'BRANCH_ADMIN'[\s\S]*?user_can_access_branch\(branch_id\)[\s\S]*?status = 'DRAFT'/i
    );
  });

  it("allows journal lines only when the parent draft has the same branch", () => {
    expect(migration).toMatch(
      /CREATE POLICY "Accounting journal lines insert into draft"[\s\S]*?journal\.branch_id = journal_lines\.branch_id[\s\S]*?journal\.status = 'DRAFT'/i
    );
  });

  it("validates debit-credit balance and prevents editing posted journals", () => {
    expect(migration).toContain("enforce_journal_posting_integrity");
    expect(migration).toContain("debit_sum <> credit_sum");
    expect(migration).toContain("Jurnal POSTED tidak dapat diubah selain dibatalkan (VOID)");
  });

  it("replaces legacy policies and enables RLS on both journal tables", () => {
    expect(migration).toContain("ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("ALTER TABLE public.journal_lines ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("FROM pg_policies");
  });
});
