import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

describe("Treatment plan approval and cancellation migration", () => {
  const migration = fs.readFileSync(
    path.resolve(
      process.cwd(),
      "supabase/migrations/20270115000000_treatment_plan_approval_and_cancellation.sql"
    ),
    "utf-8"
  );
  const finalPriceMigration = fs.readFileSync(
    path.resolve(
      process.cwd(),
      "supabase/migrations/20270120000000_secure_treatment_final_price.sql"
    ),
    "utf-8"
  );

  it("persists verbal approval and enforces the active branch tariff on new plans", () => {
    expect(migration).toContain("patient_approval_method");
    expect(migration).toContain("patient_approved_at");
    expect(migration).toContain("patient_approved_by");
    expect(migration).toContain("enforce_treatment_plan_approval_and_tariff");
    expect(migration).toContain("NEW.price_snapshot := COALESCE(v_branch_price, v_base_price)");
  });

  it("allows cancellation only through the secure unstarted-plan workflow", () => {
    expect(migration).toContain("cancel_treatment_job_secure");
    expect(migration).toContain("v_treatment.status <> 'BELUM_DIMULAI'");
    expect(migration).toContain("SET status = 'DIBATALKAN'");
    expect(migration).toContain("'CANCELLED'");
    expect(migration).toContain("'DIBATALKAN'");
  });

  it("resubmits revised treatment at the branch tariff, not a client-provided price", () => {
    expect(migration).toContain("DROP FUNCTION IF EXISTS public.resubmit_treatment_to_cashier_secure(UUID, TEXT, UUID, BIGINT)");
    expect(migration).toContain("price_snapshot = COALESCE(v_branch_price, v_base_price)");
    expect(migration).not.toContain("p_price_snapshot");
  });

  it("records the doctor-approved final price atomically with secure treatment completion", () => {
    expect(finalPriceMigration).toContain("complete_treatment_job_with_final_price_secure");
    expect(finalPriceMigration).toContain("p_patient_approval_confirmed IS DISTINCT FROM true");
    expect(finalPriceMigration).toContain("get_authenticated_doctor_id()");
    expect(finalPriceMigration).toContain("complete_treatment_job_secure(");
    expect(finalPriceMigration).toContain("SET price_snapshot = p_final_price_snapshot");
    expect(finalPriceMigration).toContain("Harga final Rp %s dicatat setelah tindakan");
    expect(finalPriceMigration).toContain("GRANT EXECUTE");
  });
});
