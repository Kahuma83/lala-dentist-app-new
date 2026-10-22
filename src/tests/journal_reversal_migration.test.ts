import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("Posted journal reversal migration", () => {
  const migration = fs.readFileSync(
    path.resolve(process.cwd(), "supabase/migrations/20261203000000_add_journal_reversal_workflow.sql"),
    "utf-8"
  );

  it("stores a single linked reversal and its mandatory reason", () => {
    expect(migration).toContain("reversal_of_journal_id");
    expect(migration).toContain("reversal_reason");
    expect(migration).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS idx_journal_entries_single_reversal[\s\S]*?WHERE reversal_of_journal_id IS NOT NULL/i);
  });

  it("creates reversals atomically with reversed debit and credit values", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.reverse_posted_journal");
    expect(migration).toContain("NOTIFY pgrst, 'reload schema'");
    expect(migration).toContain("FOR UPDATE");
    expect(migration).toMatch(/SELECT[\s\S]*?credit,[\s\S]*?debit,[\s\S]*?FROM public\.journal_lines/i);
    expect(migration).toMatch(/UPDATE public\.journal_entries[\s\S]*?SET[\s\S]*?status = 'POSTED'/i);
  });

  it("enforces access scope and restricts source transactions that need specialized correction", () => {
    expect(migration).toContain("public.user_can_access_accounting_branch(original_journal.branch_id)");
    expect(migration).toContain("original_journal.source_type NOT IN ('EXPENSE', 'MANUAL', 'ADJUSTMENT')");
    expect(migration).toMatch(/CREATE POLICY "Accounting journal insert draft by branch"[\s\S]*?source_type <> 'REVERSAL'/i);
    expect(migration).toMatch(/CREATE POLICY "Accounting journal update by branch"[\s\S]*?source_type <> 'REVERSAL'/i);
    expect(migration).toContain("TO authenticated");
  });
});
