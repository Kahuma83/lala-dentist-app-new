import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

describe("Unperformed treatment cancellation migration", () => {
  const migration = fs.readFileSync(
    path.resolve(
      process.cwd(),
      "supabase/migrations/20270117000000_allow_cancellation_of_unperformed_treatments.sql"
    ),
    "utf-8"
  );
  const invoiceTreatmentMigration = fs.readFileSync(
    path.resolve(
      process.cwd(),
      "supabase/migrations/20270302000000_scope_treatment_invoice_cancellation.sql"
    ),
    "utf-8"
  );

  it("locks the treatment and requires confirmation for an in-progress item", () => {
    expect(migration).toMatch(/WHERE id = p_treatment_id\s+FOR UPDATE/);
    expect(migration).toContain("p_not_performed_confirmed IS DISTINCT FROM TRUE");
    expect(migration).toContain("v_treatment.status NOT IN ('BELUM_DIMULAI', 'DALAM_PROSES')");
  });

  it("rejects cancellation after material usage or clinical activity", () => {
    expect(migration).toContain("FROM public.inventory_treatment_consumptions");
    expect(migration).toContain("movement.movement_type = 'OUT'");
    expect(migration).toContain("activity.activity_type <> 'STARTED'");
  });

  it("blocks cancelling only treatments included in an active invoice and blocks adding plans after invoicing", () => {
    expect(invoiceTreatmentMigration).toContain("invoice_item.treatment_job_id = p_treatment_id");
    expect(invoiceTreatmentMigration).toContain("invoice_item.treatment_job_id IS NULL");
    expect(invoiceTreatmentMigration).toContain("prevent_treatment_creation_after_active_invoice");
    expect(invoiceTreatmentMigration).toContain("NEW.visit_id");
  });
});
