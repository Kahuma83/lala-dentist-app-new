import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20270101000000_secure_payment_receipt_snapshots.sql"),
  "utf-8"
);
const repository = readFileSync(
  resolve(process.cwd(), "src/repositories/supabaseRepositories.ts"),
  "utf-8"
);

describe("secure payment receipt snapshots migration", () => {
  it("replaces client-supplied snapshot RPC overloads with the seven-argument version", () => {
    expect(migration).toContain("DROP FUNCTION IF EXISTS public.record_invoice_payment_atomic(");
    expect(migration).toContain("p_receipt_number TEXT DEFAULT NULL");
    expect(migration).not.toContain("p_invoice_net_amount_snapshot BIGINT");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.record_invoice_payment_atomic(");
  });

  it("calculates receipt snapshots from the locked invoice inside the payment transaction", () => {
    expect(migration).toMatch(/FROM public\.invoices\s+WHERE id = p_invoice_id\s+FOR UPDATE/);
    expect(migration).toMatch(/v_invoice\.net_amount,\s*v_paid_after,\s*v_outstanding_after/);
    expect(migration).toContain("v_paid_after := v_invoice.paid_amount + p_amount;");
    expect(migration).toContain("v_outstanding_after := v_outstanding - p_amount;");
  });

  it("does not fetch or submit invoice snapshots from the client", () => {
    const createPaymentMethod = repository.slice(
      repository.indexOf("async createPayment("),
      repository.indexOf("async ", repository.indexOf("async createPayment(") + 10)
    );
    expect(createPaymentMethod).not.toContain("p_invoice_net_amount_snapshot");
    expect(createPaymentMethod).not.toContain(".from(\"invoices\")");
    expect(createPaymentMethod).toContain("p_receipt_number");
  });
});
