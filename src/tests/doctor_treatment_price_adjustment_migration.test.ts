import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

describe("Doctor treatment price adjustment migration", () => {
  const migration = fs.readFileSync(
    path.resolve(
      process.cwd(),
      "supabase/migrations/20270116000000_allow_doctor_treatment_price_adjustments.sql"
    ),
    "utf-8"
  );

  it("uses the branch tariff by default and permits assigned doctors to override it", () => {
    expect(migration).toContain("v_official_price := COALESCE(v_branch_price, v_base_price)");
    expect(migration).toContain("NEW.price_snapshot := v_official_price");
    expect(migration).toContain("v_role <> 'DOCTOR'");
    expect(migration).toContain("public.get_authenticated_doctor_id()");
    expect(migration).toContain("log_doctor_treatment_price_adjustment");
    expect(migration).toContain("'OTHER'");
  });

  it("passes corrected per-treatment prices through a secured doctor revision RPC", () => {
    expect(migration).toContain("resubmit_treatment_to_cashier_secure");
    expect(migration).toContain("p_price_snapshot BIGINT");
    expect(migration).toContain("p_patient_approval_confirmed BOOLEAN");
    expect(migration).toContain("price_snapshot = p_price_snapshot");
    expect(migration).toContain("patient_approved_at = v_now");
    expect(migration).toContain("Hanya dokter penanggung jawab");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.resubmit_treatment_to_cashier_secure(UUID, TEXT, UUID, BIGINT, BOOLEAN) TO authenticated, service_role");
  });
});
