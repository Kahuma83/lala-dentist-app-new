import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("Readable receipt numbers", () => {
  const migration = fs.readFileSync(
    path.resolve(process.cwd(), "supabase/migrations/20261024000000_add_readable_receipt_numbers.sql"),
    "utf-8"
  );
  const repository = fs.readFileSync(
    path.resolve(process.cwd(), "src/repositories/supabaseRepositories.ts"),
    "utf-8"
  );
  const receiptDocument = fs.readFileSync(
    path.resolve(process.cwd(), "src/components/documents/ReceiptDocument.tsx"),
    "utf-8"
  );
  const receiptModal = fs.readFileSync(
    path.resolve(process.cwd(), "src/components/documents/ReceiptDocumentModal.tsx"),
    "utf-8"
  );

  it("assigns, backfills, and uniquely indexes durable receipt numbers", () => {
    expect(migration).toContain("CREATE SEQUENCE IF NOT EXISTS public.payment_receipt_number_seq");
    expect(migration).toContain("'KWT/'");
    expect(migration).toContain("CREATE TRIGGER trg_assign_payment_receipt_number");
    expect(migration).toContain("CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_transactions_receipt_number");
  });

  it("uses the receipt number returned by Supabase instead of a local generated override", () => {
    expect(repository).toMatch(/receiptNumber: row\.receipt_number/);
    expect(repository).not.toMatch(/mapped\.receiptNumber = receiptNumber/);
  });

  it("never displays the internal payment UUID as a receipt number", () => {
    expect(receiptDocument).toContain('payment.receiptNumber || "Nomor kwitansi belum tersedia"');
    expect(receiptModal).toContain('payment.receiptNumber || "Nomor kwitansi belum tersedia"');
  });
});
