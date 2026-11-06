import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("Auto-extend internal doctor replacement schedule migration", () => {
  const migration = fs.readFileSync(
    path.resolve(process.cwd(), "supabase/migrations/20270216000000_auto_extend_internal_doctor_replacement_schedule.sql"),
    "utf-8"
  );
  const fullShiftMigration = fs.readFileSync(
    path.resolve(process.cwd(), "supabase/migrations/20270217000000_include_full_absent_doctor_shift_in_replacement_schedule.sql"),
    "utf-8"
  );

  it("allows an internal replacement who already has attendance that day", () => {
    const replacementGuard = migration.match(/\$assignment_guard\$([\s\S]*?)\$assignment_guard\$/)?.[1];
    expect(migration).toMatch(/pg_get_functiondef\([\s\S]*?review_doctor_absence_request/i);
    expect(migration).toMatch(/public\.staff_replacement_assignments/);
    expect(migration).toMatch(/replacement_staff_id = v_replacement_staff\.id/);
    expect(migration).toMatch(/public\.attendances/);
    expect(migration).toMatch(/Dokter internal sudah memiliki penugasan pengganti/);
    expect(replacementGuard).toBeDefined();
    expect(replacementGuard).not.toMatch(/attendances/i);
  });

  it("extends the replacement doctor's active schedule or creates one for the covered shift", () => {
    expect(migration).toMatch(/SELECT schedule\.\* INTO v_replacement_schedule/);
    expect(migration).toMatch(/LEAST\(start_time::TIME, v_schedule\.start_time::TIME\)/);
    expect(migration).toMatch(/GREATEST\(end_time::TIME, v_schedule\.end_time::TIME\)/);
    expect(migration).toMatch(/INSERT INTO public\.doctor_schedules/);
    expect(migration).toMatch(/v_schedule\.branch_id[\s\S]*?v_schedule\.date[\s\S]*?v_schedule\.start_time[\s\S]*?v_schedule\.end_time/);
  });

  it("keeps database-side migration checks for schema drift", () => {
    expect(migration).toMatch(/Tidak menemukan validasi absensi dokter pengganti/);
    expect(migration).toMatch(/Tidak menemukan titik penambahan jadwal pengganti/);
    expect(migration).toMatch(/EXECUTE v_updated_definition/);
  });

  it("uses the full daily schedule range for each branch, not an arbitrary single shift", () => {
    expect(fullShiftMigration).toMatch(/regexp_replace\(/i);
    expect(fullShiftMigration).toMatch(/SELECT DISTINCT ON \\\(ds\\\.date\\\)/);
    expect(fullShiftMigration).toMatch(/to_char\(MIN\(ds\.start_time::TIME\), 'HH24:MI'\) AS start_time/);
    expect(fullShiftMigration).toMatch(/to_char\(MAX\(ds\.end_time::TIME\), 'HH24:MI'\) AS end_time/);
    expect(fullShiftMigration).toMatch(/GROUP BY ds\.date, ds\.branch_id/);
    expect(fullShiftMigration).toMatch(/Tidak menemukan pengurutan jadwal pada fungsi review dokter/);
  });
});
