import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

describe("Payment document date migration", () => {
  const migration = fs.readFileSync(
    path.resolve(process.cwd(), "supabase/migrations/20270206000000_add_payment_document_date.sql"),
    "utf-8"
  );

  it("backfills payment dates in Jakarta time and uses them for receipt numbering", () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS payment_date DATE");
    expect(migration).toContain("(transaction_date_time AT TIME ZONE 'Asia/Jakarta')::DATE");
    expect(migration).toContain("to_char(NEW.payment_date, 'YYYYMM')");
    expect(migration).toContain("ALTER COLUMN payment_date SET NOT NULL");
  });

  it("validates backdated payments on the server while retaining actual transaction time", () => {
    expect(migration).toContain("v_payment_date > v_today");
    expect(migration).toContain("v_payment_date < v_invoice.invoice_date");
    expect(migration).toContain("Alasan pencatatan pembayaran mundur wajib diisi");
    expect(migration).toMatch(/transaction_date_time,\s*payment_date,\s*notes,/);
    expect(migration).toMatch(/now\(\),\s*v_payment_date,\s*v_notes,/);
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.record_invoice_payment_atomic");
  });
});
