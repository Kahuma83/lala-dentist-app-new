import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

describe("Central-fund expense corrections", () => {
  const migration = fs.readFileSync(
    path.resolve(process.cwd(), "supabase/manual-migrations/20270307000000_central_funds_expense_correction.sql"),
    "utf-8"
  );
  const expensesPage = fs.readFileSync(
    path.resolve(process.cwd(), "src/pages/Expenses.tsx"),
    "utf-8"
  );

  it("adds central cash classification and atomically posts a reversal and replacement", () => {
    expect(migration).toMatch(/cash_source IN \('DAILY_CASH', 'KERITING', 'CENTRAL'\)/i);
    expect(migration).toMatch(/payment_method IN \('CASH', 'TRANSFER', 'QRIS', 'OTHER'\)/i);
    expect(migration).toContain("corrects_journal_id");
    expect(migration).toContain("correction_reason");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.correct_posted_expense");
    expect(migration).toContain("FOR UPDATE");
    expect(migration).toContain("reversal_of_journal_id");
    expect(migration).toContain("corrects_journal_id, correction_reason");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.correct_posted_expense");
  });

  it("excludes centrally funded cash expenses from both branch daily-cash calculations", () => {
    expect(migration).toContain("old_condition CONSTANT TEXT := 'cash_source <> ''KERITING'''");
    expect(migration).toContain("new_condition CONSTANT TEXT := 'cash_source = ''DAILY_CASH'''");
    expect(migration).toContain("IF occurrences <> 2 THEN");
    expect(expensesPage).toContain("Dana Pusat (setoran klinik dikelola Owner)");
    expect(expensesPage).toContain("Cara Pembayaran *");
    expect(expensesPage).toContain('label: "QRIS"');
    expect(expensesPage).toContain("Posting Pembalik + Pengganti");
  });
});
