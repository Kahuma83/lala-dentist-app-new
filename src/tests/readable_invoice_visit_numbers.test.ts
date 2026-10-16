import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("Readable invoice and visit numbers", () => {
  const migration = fs.readFileSync(
    path.resolve(process.cwd(), "supabase/migrations/20261022000000_add_readable_invoice_and_visit_numbers.sql"),
    "utf-8"
  );
  const repository = fs.readFileSync(
    path.resolve(process.cwd(), "src/repositories/supabaseRepositories.ts"),
    "utf-8"
  );
  const invoiceDocument = fs.readFileSync(
    path.resolve(process.cwd(), "src/components/documents/InvoiceDocument.tsx"),
    "utf-8"
  );

  it("creates sequential readable numbers for new and existing visits and invoices", () => {
    expect(migration).toContain("CREATE SEQUENCE IF NOT EXISTS public.patient_visit_number_seq");
    expect(migration).toContain("CREATE SEQUENCE IF NOT EXISTS public.invoice_number_seq");
    expect(migration).toContain("'VIS/'");
    expect(migration).toContain("'INV/'");
    expect(migration).toContain("CREATE UNIQUE INDEX IF NOT EXISTS uq_patient_visits_visit_number");
    expect(migration).toContain("CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_invoice_number");
  });

  it("maps readable numbers without replacing the UUID primary keys", () => {
    expect(repository).toMatch(/id: row\.id,\s+visitNumber: row\.visit_number/);
    expect(repository).toMatch(/id: row\.id,\s+invoiceNumber: row\.invoice_number,[\s\S]*?visitNumber: row\.visit_number/);
  });

  it("prints the readable visit number instead of the internal visit UUID", () => {
    expect(invoiceDocument).toContain("{visitNumber}");
    expect(invoiceDocument).not.toContain("{invoice.visitId}");
  });
});
