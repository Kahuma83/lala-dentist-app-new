import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("Allow scheduled internal doctor replacements migration", () => {
  const migration = fs.readFileSync(
    path.resolve(process.cwd(), "supabase/migrations/20270202000000_allow_scheduled_doctor_replacements.sql"),
    "utf-8"
  );
  const superAdminPage = fs.readFileSync(
    path.resolve(process.cwd(), "src/components/AbsenceRequestManager.tsx"),
    "utf-8"
  );
  const employeePortal = fs.readFileSync(
    path.resolve(process.cwd(), "attendance-portal/src/AttendancePortal.tsx"),
    "utf-8"
  );
  const originalDoctorMigration = fs.readFileSync(
    path.resolve(process.cwd(), "supabase/migrations/20261225000000_doctor_replacement_compensation.sql"),
    "utf-8"
  );

  it("lists active, linked internal doctors without filtering by schedule or attendance", () => {
    const candidateFunction = migration.match(
      /CREATE OR REPLACE FUNCTION public\.get_absence_replacement_candidates[\s\S]*?\n\$\$;/
    )?.[0];
    expect(candidateFunction).toBeDefined();
    expect(candidateFunction).toMatch(/candidate_doctor\.active/);
    expect(candidateFunction).not.toMatch(/doctor_schedules/i);
    expect(candidateFunction).toMatch(/candidate_account\.auth_user_id IS NOT NULL/i);
  });

  it("removes the schedule-conflict rejection from doctor absence approval", () => {
    expect(migration).toMatch(/pg_get_functiondef\([\s\S]*?review_doctor_absence_request/i);
    expect(migration).toMatch(/v_updated_definition := replace\(/i);
    expect(migration).toMatch(/replacement_schedule\.date = absent_schedule\.date/i);
    expect(migration).toMatch(/EXECUTE v_updated_definition/i);
    const originalCheck = originalDoctorMigration.match(
      /  IF p_approve AND p_replacement_doctor_id IS NOT NULL AND EXISTS \([\s\S]*?Dokter internal yang dipilih sudah memiliki jadwal aktif[\s\S]*?  END IF;/
    )?.[0];
    const replacementTarget = migration.match(/\$conflict_check\$([\s\S]*?)\$conflict_check\$/)?.[1];
    expect(originalCheck?.trim()).toBe(replacementTarget?.trim());
  });

  it("shows doctors the expanded replacement rule in both employee and HR portals", () => {
    expect(employeePortal).toMatch(/meskipun memiliki jadwal/);
    expect(superAdminPage).not.toMatch(/doctorSchedules\.every/);
  });
});
