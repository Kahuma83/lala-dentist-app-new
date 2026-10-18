import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("employee portal navigation and row-level access", () => {
  const portalPath = path.resolve(process.cwd(), "attendance-portal/src/AttendancePortal.tsx");
  const migrationPath = path.resolve(
    process.cwd(),
    "supabase/migrations/20261117000000_employee_portal_self_service_access.sql"
  );
  const multiBranchAttendanceMigrationPath = path.resolve(
    process.cwd(),
    "supabase/migrations/20261118000000_doctor_multi_branch_daily_attendance.sql"
  );
  const doctorScheduleVisibilityMigrationPath = path.resolve(
    process.cwd(),
    "supabase/migrations/20261019000000_fix_employee_doctor_schedule_visibility.sql"
  );
  const manifestPath = path.resolve(process.cwd(), "attendance-portal/public/manifest.webmanifest");
  const portalHtmlPath = path.resolve(process.cwd(), "attendance-portal/index.html");

  it("exposes the employee portal navigation sections", () => {
    const portal = fs.readFileSync(portalPath, "utf-8");
    for (const section of ["Beranda", "Absensi", "Jadwal Saya", "Lembur Saya", "Gaji Saya", "Profil"]) {
      expect(portal).toContain(`label: "${section}"`);
    }
    expect(portal).not.toContain("Foto profil hanya terlihat oleh Anda. Maksimal 512 KB.");
  });

  it("uses the same blue brand system on login and in the employee portal", () => {
    const portal = fs.readFileSync(portalPath, "utf-8");
    const stylesheet = fs.readFileSync(path.resolve(process.cwd(), "attendance-portal/src/style.css"), "utf-8");
    expect(portal).toContain('<div className="login-brand">');
    expect(portal).toContain("<strong>Lala Dentist</strong><span>Portal Pegawai</span>");
    expect(stylesheet).toContain("--portal-blue:");
    expect(stylesheet).toContain(".login-card");
    expect(stylesheet).toContain(".welcome-card");
    expect(stylesheet).toContain(".portal-nav-item.active");
  });

  it("supports separate doctor attendance records by branch without overlapping open shifts", () => {
    const portal = fs.readFileSync(portalPath, "utf-8");
    const migration = fs.readFileSync(multiBranchAttendanceMigrationPath, "utf-8");
    expect(portal).toContain("Setiap cabang memiliki catatan masuk dan pulang terpisah.");
    expect(portal).toContain("unfinishedTodayAttendance");
    expect(migration).toContain("branch_id = p_branch_id");
    expect(migration).toContain("actual_check_in_at IS NOT NULL AND actual_check_out_at IS NULL");
  });

  it("limits doctor schedules to today and the following two days", () => {
    const portal = fs.readFileSync(portalPath, "utf-8");
    expect(portal).toContain('const scheduleEnd = addDays(today, 2)');
    expect(portal).toContain('.gte("date", today)');
    expect(portal).toContain('.lte("date", scheduleEnd)');
    expect(portal).toContain('const scheduleEnd = addDays(today, 2)');
    expect(portal).toContain('staffContext?.role === "DOCTOR" ? 3 : staffContext && fiveDayScheduleRoles.includes(staffContext.role) ? 5 : 7');
    expect(portal).toContain('addDays(today, index)');
  });

  it("limits branch admin and doctor assistant shifts to the next five days", () => {
    const portal = fs.readFileSync(portalPath, "utf-8");
    expect(portal).toContain('const fiveDayScheduleRoles: StaffRole[] = ["BRANCH_ADMIN", "DOCTOR_ASSISTANT"]');
    expect(portal).toContain("const assignmentStart = isFiveDaySchedule ? today : requestedWeekStart");
    expect(portal).toContain("const assignmentEnd = isFiveDaySchedule ? addDays(today, 4) : addDays(requestedWeekStart, 6)");
    expect(portal).toContain('staffContext && fiveDayScheduleRoles.includes(staffContext.role) ? 5 : 7');
    expect(portal).toContain('"Belum ada jadwal yang ditetapkan untuk lima hari ini."');
  });

  it("uses the staff shift assignment date column defined by the database schema", () => {
    const repositories = fs.readFileSync(path.resolve(process.cwd(), "src/repositories/supabaseRepositories.ts"), "utf-8");
    const schema = fs.readFileSync(
      path.resolve(process.cwd(), "supabase/migrations/20260923000000_business_schema_foundation.sql"),
      "utf-8"
    );
    const repository = repositories.slice(
      repositories.indexOf("export class SupabaseStaffShiftAssignmentRepository"),
      repositories.indexOf("// 23. SUPABASE ATTENDANCE REPOSITORY")
    );
    const assignmentSchema = schema.match(/CREATE TABLE IF NOT EXISTS public\.staff_shift_assignments \(([\s\S]*?)\);/);
    expect(assignmentSchema?.[1]).toMatch(/\bdate DATE NOT NULL\b/);
    expect(repository).toContain('q.eq("date", filter.date)');
    expect(repository).toContain("date: row.date");
    expect(repository).toContain("date: data.date");
    expect(repository).toContain("date: inserted.date");
    expect(repository).toContain("payload.date = updates.date");
    expect(repository).not.toContain("assignment_date");
  });

  it("provides standard morning and afternoon shifts for branch admins and assistants", () => {
    const hrManagement = fs.readFileSync(path.resolve(process.cwd(), "src/pages/HRManagement.tsx"), "utf-8");
    expect(hrManagement).toContain('name: "Shift Pagi", startTime: "08:00", endTime: "14:00"');
    expect(hrManagement).toContain('name: "Shift Sore", startTime: "14:00", endTime: "21:00"');
    expect(hrManagement).toContain("position === StaffPosition.BRANCH_ADMIN || position === StaffPosition.ASSISTANT");
    expect(hrManagement).toContain("await workShiftRepo.createShift({");
    expect(hrManagement).toContain("normalizeShiftTime(shift.startTime) === preset.startTime");
    expect(hrManagement).toContain("if (!isStandardShiftStaff(position)) return branchShifts");
    expect(hrManagement).toContain("getAssignmentShiftOptions(workShifts, assignShiftForm.branchId, selectedStaff?.position)");
    expect(hrManagement).toContain("Siapkan Shift Pagi & Sore");
  });

  it("hides the weekly-copy marker and uses a compact schedule time style", () => {
    const portal = fs.readFileSync(portalPath, "utf-8");
    const stylesheet = fs.readFileSync(path.resolve(process.cwd(), "attendance-portal/src/style.css"), "utf-8");
    expect(portal).toContain("!/^salinan mingguan");
    expect(portal).toContain("test(row.notes.trim())");
    expect(portal).toContain('className="portal-list-value schedule-time"');
    expect(stylesheet).toMatch(/\.schedule-day-row \.schedule-time \{[^}]*font-size: 12px;/);
    expect(stylesheet).toMatch(/\.schedule-day-row \.schedule-time \{[^}]*font-size: 11px;/);
  });

  it("allows a doctor to read schedules through the linked staff record", () => {
    const migration = fs.readFileSync(doctorScheduleVisibilityMigrationPath, "utf-8");
    expect(migration).toContain('DROP POLICY IF EXISTS "Doctor schedules authenticated read"');
    expect(migration).toContain("doctor.staff_id = public.get_user_staff_id()");
    expect(migration).toContain("account.doctor_id");
    expect(migration).toContain("account.auth_user_id = auth.uid()");
    expect(migration).not.toContain("ua.staff_id = doctor.id::TEXT");
  });

  it("offers a first-visit install screen and valid PWA manifest icons", () => {
    const portal = fs.readFileSync(portalPath, "utf-8");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    const html = fs.readFileSync(portalHtmlPath, "utf-8");
    expect(portal).toContain("Pasang Sekarang");
    expect(portal).toContain("<h1>MyLala</h1>");
    expect(portal).toContain("beforeinstallprompt");
    expect(portal).toContain("Tambahkan ke Layar Utama");
    expect(portal).toContain('src="/portal-brand.png"');
    expect(portal).not.toContain('src="/clinic-logo.jpg"');
    expect(html).toContain('href="/portal-brand.png"');
    expect(html).toContain('content="MyLala"');
    expect(html).toContain('href="/portal-icon-180.png"');
    expect(fs.existsSync(path.resolve(process.cwd(), "attendance-portal/public/portal-brand.png"))).toBe(true);
    expect(fs.existsSync(path.resolve(process.cwd(), "attendance-portal/public/portal-icon-180.png"))).toBe(true);
    expect(manifest.name).toBe("MyLala");
    expect(manifest.short_name).toBe("MyLala");
    expect(manifest.icons).toEqual(expect.arrayContaining([
      expect.objectContaining({ sizes: "192x192", type: "image/png" }),
      expect.objectContaining({ sizes: "512x512", type: "image/png" })
    ]));
  });

  it("limits schedule, overtime, and payroll data to the linked employee or authorized managers", () => {
    const migration = fs.readFileSync(migrationPath, "utf-8");
    for (const table of ["staff_shift_assignments", "work_shifts", "overtime_records", "monthly_payrolls", "payroll_items"]) {
      expect(migration).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`);
    }
    expect(migration).toContain("staff_id = public.get_user_staff_id()");
    expect(migration).toContain("status IN ('APPROVED', 'PAID')");
    expect(migration).toContain("payroll.staff_id = public.get_user_staff_id()");
  });
});
