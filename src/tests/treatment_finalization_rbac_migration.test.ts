import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const migration = fs.readFileSync(
  path.resolve(process.cwd(), "supabase/migrations/20261020000000_restrict_treatment_finalization_to_doctors.sql"),
  "utf-8"
);

describe("Doctor-only treatment finalization migration", () => {
  it("restricts treatment completion and direct updates to doctors", () => {
    expect(migration).toContain("IF v_user.role <> 'DOCTOR' THEN");
    expect(migration).toContain("public.get_user_role() = 'DOCTOR'");
  });

  it("provides a secure assistant-only treatment start workflow", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.start_treatment_job_secure");
    expect(migration).toContain("v_user.role NOT IN ('SUPER_ADMIN', 'DOCTOR_ASSISTANT')");
    expect(migration).toContain("SET status = 'DALAM_PROSES'");
  });
});
