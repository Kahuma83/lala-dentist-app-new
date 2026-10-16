import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("Global patient history RLS for doctors", () => {
  const migrationPath = path.resolve(
    process.cwd(),
    "supabase/migrations/20261018000000_allow_doctors_global_patient_history.sql"
  );

  it("allows active doctors to read profiles, visits, and medical records across branches", () => {
    const migration = fs.readFileSync(migrationPath, "utf-8");

    for (const table of ["patient_profiles", "patient_visits", "clinical_medical_records"]) {
      const policy = new RegExp(
        `CREATE POLICY "[^"]+"\\s+ON public\\.${table}\\s+FOR SELECT\\s+TO authenticated\\s+USING \\(public\\.get_user_role\\(\\) = 'DOCTOR'\\)`,
        "i"
      );
      expect(migration).toMatch(policy);
    }
  });

  it("does not add cross-branch write policies", () => {
    const migration = fs.readFileSync(migrationPath, "utf-8");
    expect(migration).not.toMatch(/FOR (?:ALL|INSERT|UPDATE|DELETE)/i);
  });
});
