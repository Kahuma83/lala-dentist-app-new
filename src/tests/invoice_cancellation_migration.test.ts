import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

describe("Atomic invoice cancellation migration", () => {
  const migration = fs.readFileSync(
    path.resolve(process.cwd(), "supabase/migrations/20270207000000_atomic_invoice_cancellation.sql"),
    "utf-8"
  );

  it("stores cancellation audit metadata and prevents untracked cancellation", () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS cancellation_reason TEXT");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ");
    expect(migration).toContain("trg_prevent_untracked_invoice_cancellation");
    expect(migration).toContain("app.allow_invoice_cancellation");
  });

  it("atomically reverses posted invoice revenue and requires payments to be reversed first", () => {
    expect(migration).toContain("cancel_invoice_with_reversal_atomic");
    expect(migration).toContain("status = 'SUCCESS'");
    expect(migration).toContain("reversal_of_journal_id");
    expect(migration).toContain("v_journal.total_credit");
    expect(migration).toContain("Alasan pembatalan invoice wajib diisi");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.cancel_invoice_with_reversal_atomic");
  });
});
