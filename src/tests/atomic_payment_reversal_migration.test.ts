import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20270119000000_atomic_payment_reversal.sql"),
  "utf-8"
);

describe("atomic payment reversal migration", () => {
  it("updates payment audit metadata and invoice balances in one database function", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.reverse_invoice_payment_atomic(");
    expect(migration).toMatch(/FROM public\.invoices\s+WHERE id = v_invoice_id\s+FOR UPDATE/);
    expect(migration).toMatch(/FROM public\.payment_transactions\s+WHERE id = p_payment_id\s+FOR UPDATE/);
    expect(migration).toContain("SET status = 'REFUNDED'");
    expect(migration).toContain("reversal_reason = v_reason");
    expect(migration).toContain("WHERE invoice_id = v_invoice.id");
    expect(migration).toContain("AND status = 'SUCCESS'");
    expect(migration).toContain("SET paid_amount = v_new_paid");
  });

  it("creates and posts a balanced reversal journal for posted payment journals", () => {
    expect(migration).toContain("v_journal.status = 'POSTED'");
    expect(migration).toMatch(/v_journal\.total_credit,\s*v_journal\.total_debit/);
    expect(migration).toMatch(/SELECT[\s\S]*?account_id,[\s\S]*?branch_id,[\s\S]*?credit,[\s\S]*?debit,[\s\S]*?FROM public\.journal_lines/);
    expect(migration).toContain("reversal_of_journal_id");
    expect(migration).toContain("SET status = 'POSTED'");
  });

  it("restricts the RPC to authenticated users and grants execution only to authenticated", () => {
    expect(migration).toContain("IF auth.uid() IS NULL THEN");
    expect(migration).toContain("public.get_user_role() = 'BRANCH_ADMIN'");
    expect(migration).toContain("REVOKE INSERT, UPDATE, DELETE ON public.payment_transactions FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.reverse_invoice_payment_atomic(UUID, TEXT) FROM PUBLIC, anon");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.reverse_invoice_payment_atomic(UUID, TEXT) TO authenticated");
  });
});
