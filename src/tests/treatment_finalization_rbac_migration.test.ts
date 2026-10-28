import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const migration = fs.readFileSync(
  path.resolve(process.cwd(), "supabase/migrations/20261020000000_restrict_treatment_finalization_to_doctors.sql"),
  "utf-8"
);

const assignmentMigration = fs.readFileSync(
  path.resolve(process.cwd(), "supabase/migrations/20270106000000_restrict_treatment_finalization_to_assigned_doctor.sql"),
  "utf-8"
);

describe("Doctor-only treatment finalization migration", () => {
  it("restricts completion and handover to the assigned doctor", () => {
    expect(assignmentMigration).toContain("public.get_authenticated_doctor_id()");
    expect(assignmentMigration).toContain("COALESCE(v_treatment.assigned_doctor_id, v_treatment.doctor_id)");
    expect(assignmentMigration).toContain("CREATE OR REPLACE FUNCTION public.hand_over_treatment_job_secure");
  });

  it("keeps assistant and Super Admin exceptions limited to external-doctor treatment", () => {
    expect(assignmentMigration).toContain("v_treatment.external_doctor_id IS NOT NULL");
    expect(assignmentMigration).toContain("v_user.role IN ('SUPER_ADMIN', 'DOCTOR_ASSISTANT')");
  });

  it("provides a secure assistant-only treatment start workflow", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.start_treatment_job_secure");
    expect(migration).toContain("v_user.role NOT IN ('SUPER_ADMIN', 'DOCTOR_ASSISTANT')");
    expect(migration).toContain("SET status = 'DALAM_PROSES'");
  });
});
