import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("Doctor treatment and price revision migration", () => {
  const migration = fs.readFileSync(
    path.resolve(
      process.cwd(),
      "supabase/migrations/20270113000000_allow_doctor_treatment_and_price_revision.sql"
    ),
    "utf-8"
  );

  it("allows only the assigned doctor to update service and price while revising", () => {
    expect(migration).toContain("v_user.role <> 'DOCTOR'");
    expect(migration).toContain("v_treatment.status <> 'PERLU_REVISI'");
    expect(migration).toContain("IS DISTINCT FROM COALESCE(v_treatment.assigned_doctor_id, v_treatment.doctor_id)");
    expect(migration).toContain("service_id = p_service_id");
    expect(migration).toContain("price_snapshot = p_price_snapshot");
    expect(migration).toContain("p_price_snapshot < 0");
    expect(migration).toContain("p_price_snapshot > 9007199254740991");
  });

  it("keeps stock and compensation untouched and records the revision", () => {
    expect(migration).toContain("SET service_id = p_service_id");
    expect(migration).toContain("'REVISION_RESUBMITTED'");
    expect(migration).not.toContain("inventory");
    expect(migration).not.toContain("compensation_accruals");
  });

  it("allows only an active service, except retaining the current inactive service", () => {
    expect(migration).toContain("(is_active = true OR id = v_treatment.service_id)");
  });
});
