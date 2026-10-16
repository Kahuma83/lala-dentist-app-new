import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("Standard accounting chart migration", () => {
  const migration = fs.readFileSync(
    path.resolve(process.cwd(), "supabase/migrations/20261025000000_seed_standard_accounting_chart.sql"),
    "utf-8"
  );

  it("seeds the accounts required for invoice and payment posting", () => {
    for (const row of [
      "('1000', 'Kas (Cash)', 'ASSET', 'CASH', 'DEBIT'",
      "('1010', 'Bank & QRIS Settlement', 'ASSET', 'BANK', 'DEBIT'",
      "('1100', 'Piutang Pasien (Accounts Receivable)', 'ASSET', 'ACCOUNTS_RECEIVABLE', 'DEBIT'",
      "('4000', 'Pendapatan Tindakan Medis', 'REVENUE', 'TREATMENT_REVENUE', 'CREDIT'"
    ]) {
      expect(migration).toContain(row);
    }
  });

  it("keeps existing chart-of-account configuration intact on re-run", () => {
    expect(migration).toContain("ON CONFLICT (code) DO NOTHING");
  });
});
