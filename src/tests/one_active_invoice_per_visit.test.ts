import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { MockInvoiceRepository } from "../repositories/mockRepositories";
import { InvoiceStatus, UserRole } from "../types/domain";

describe("one active invoice per visit", () => {
  it("allows replacing a cancelled invoice but rejects a second active invoice", async () => {
    const repository = new MockInvoiceRepository();
    const data = {
      visitId: "visit-invoice-uniqueness",
      patientId: "patient-1",
      branchId: "branch-gebang",
      items: [{
        serviceId: "service-scaling",
        descriptionSnapshot: "Scaling & Polishing",
        unitPriceSnapshot: 150000,
        quantity: 1
      }]
    };

    const first = await repository.createInvoice(data);
    await expect(repository.createInvoice(data)).rejects.toThrow("sudah memiliki invoice aktif");

    await repository.cancelInvoice(first.id, "Koreksi invoice", UserRole.SUPER_ADMIN);
    const replacement = await repository.createInvoice(data);

    expect(replacement.status).toBe(InvoiceStatus.OPEN);
    expect(replacement.id).not.toBe(first.id);
  });

  it("creates a partial unique index and reports existing active duplicates before migration", () => {
    const migration = fs.readFileSync(
      path.resolve(process.cwd(), "supabase/migrations/20261114000000_one_active_invoice_per_visit.sql"),
      "utf-8"
    );

    expect(migration).toContain("GROUP BY visit_id");
    expect(migration).toContain("HAVING COUNT(*) > 1");
    expect(migration).toContain("uq_invoices_one_active_per_visit");
    expect(migration).toContain("WHERE status <> 'CANCELLED'");
  });
});
