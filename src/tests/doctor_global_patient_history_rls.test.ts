import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("Global patient history RLS for doctors", () => {
  const migrationPath = path.resolve(
    process.cwd(),
    "supabase/migrations/20261206000000_standardize_clinical_record_foundation.sql"
  );

  it("removes cross-branch doctor access to clinical medical records", () => {
    const migration = fs.readFileSync(migrationPath, "utf-8");
    expect(migration).toMatch(/DROP POLICY IF EXISTS "Doctors read all patient medical records"/i);
    expect(migration).toMatch(/DROP POLICY IF EXISTS "Assistants and Branch Admins can view own branch medical records"/i);
    expect(migration).toMatch(/DROP POLICY IF EXISTS "Super Admin can manage all medical records"/i);
    expect(migration).toMatch(/CREATE POLICY "Clinical records doctor read"[\s\S]*?FOR SELECT[\s\S]*?public\.user_can_manage_treatment_branch\(branch_id\)/i);
  });

  it("limits clinical record reads and writes to doctors in authorized branches and Super Admin", () => {
    const migration = fs.readFileSync(migrationPath, "utf-8");
    expect(migration).toMatch(/Clinical records doctor insert[\s\S]*?FOR INSERT/i);
    expect(migration).toMatch(/Clinical records doctor update[\s\S]*?FOR UPDATE/i);
    expect(migration).not.toMatch(/Clinical records doctor delete/i);
    expect(migration).toMatch(/public\.is_super_admin\(\)/i);
  });

  it("scopes doctors to patients with an assigned visit, active booking, or treatment", () => {
    const assignmentMigration = path.resolve(
      process.cwd(),
      "supabase/migrations/20261212000000_scope_doctor_patient_access.sql"
    );
    const migration = fs.readFileSync(assignmentMigration, "utf-8");
    expect(migration).toContain('DROP POLICY IF EXISTS "Doctors read all global patient profiles"');
    expect(migration).toContain('DROP POLICY IF EXISTS "Doctors read all patient visits"');
    expect(migration).toContain("public.doctor_can_access_patient(patient_profiles.id)");
    expect(migration).toContain("booking.status IN ('PENDING', 'CONFIRMED')");
    expect(migration).toContain("booking.doctor_id = current_doctor_id");
    expect(migration).toContain("COALESCE(job.assigned_doctor_id, job.doctor_id) = current_doctor_id");
    expect(migration).toContain("public.doctor_can_manage_clinical_visit(visit_id, branch_id, doctor_id)");
    expect(migration).toContain("public.user_can_manage_treatment_branch(branch_id)");
  });
});
