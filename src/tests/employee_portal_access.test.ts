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
  const manifestPath = path.resolve(process.cwd(), "attendance-portal/public/manifest.webmanifest");
  const portalHtmlPath = path.resolve(process.cwd(), "attendance-portal/index.html");

  it("exposes the employee portal navigation sections", () => {
    const portal = fs.readFileSync(portalPath, "utf-8");
    for (const section of ["Beranda", "Absensi", "Jadwal Saya", "Lembur Saya", "Gaji Saya", "Profil"]) {
      expect(portal).toContain(`label: "${section}"`);
    }
    expect(portal).not.toContain("Foto profil hanya terlihat oleh Anda. Maksimal 512 KB.");
  });

  it("supports separate doctor attendance records by branch without overlapping open shifts", () => {
    const portal = fs.readFileSync(portalPath, "utf-8");
    const migration = fs.readFileSync(multiBranchAttendanceMigrationPath, "utf-8");
    expect(portal).toContain("Setiap cabang memiliki catatan masuk dan pulang terpisah.");
    expect(portal).toContain("unfinishedTodayAttendance");
    expect(migration).toContain("branch_id = p_branch_id");
    expect(migration).toContain("actual_check_in_at IS NOT NULL AND actual_check_out_at IS NULL");
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
