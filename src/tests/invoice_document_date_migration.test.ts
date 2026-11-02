import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

describe("Invoice document date migration", () => {
  const migration = fs.readFileSync(
    path.resolve(process.cwd(), "supabase/migrations/20270205000000_add_invoice_document_date.sql"),
    "utf-8"
  );

  it("backfills and defaults invoice dates in Jakarta time", () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS invoice_date DATE");
    expect(migration).toContain("(created_at AT TIME ZONE 'Asia/Jakarta')::DATE");
    expect(migration).toContain("timezone('Asia/Jakarta', now())::DATE");
    expect(migration).toContain("ALTER COLUMN invoice_date SET NOT NULL");
  });

  it("validates invoice dates and generates invoice numbers from the document date", () => {
    expect(migration).toContain("NEW.invoice_date > v_today");
    expect(migration).toContain("NEW.invoice_date > v_last_treatment_date");
    expect(migration).toContain("BEFORE INSERT ON public.invoices");
    expect(migration).toContain("BEFORE UPDATE OF invoice_date, visit_id ON public.invoices");
    expect(migration).toContain("NEW.invoice_date IS DISTINCT FROM OLD.invoice_date");
    expect(migration).toContain("to_char(NEW.invoice_date, 'YYYYMM')");
  });
});
