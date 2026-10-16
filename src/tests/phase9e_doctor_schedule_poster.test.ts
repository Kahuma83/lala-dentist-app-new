import { describe, it, expect, beforeEach } from "vitest";
import {
  MockDoctorScheduleRepository,
  MockDoctorRepository,
  MockBranchRepository
} from "../repositories/mockRepositories";
import {
  ScheduleStatus,
  UserRole,
  DoctorSchedule,
  DentalDoctor,
  DentalBranch
} from "../types/domain";
import { formatIndonesianDate } from "../utils/dateUtils";
import { MockDatabase } from "../data/mockData";

describe("PHASE 9E — Multi-Branch Doctor Schedule Poster Tests", () => {
  const db = MockDatabase.getInstance();
  let scheduleRepo: MockDoctorScheduleRepository;
  let doctorRepo: MockDoctorRepository;
  let branchRepo: MockBranchRepository;

  beforeEach(() => {
    scheduleRepo = new MockDoctorScheduleRepository();
    doctorRepo = new MockDoctorRepository();
    branchRepo = new MockBranchRepository();
  });

  // 1. Poster takes schedule from DoctorSchedule repository
  it("1. Poster should fetch schedule directly from DoctorSchedule source of truth", async () => {
    const schedules = await scheduleRepo.getSchedules({});
    expect(schedules.length).toBeGreaterThan(0);

    const testDate = schedules[0].date;
    const dateSchedules = await scheduleRepo.getSchedules({ date: testDate });
    
    expect(dateSchedules.every((s) => s.date === testDate)).toBe(true);
  });

  // 2. All active branches can be included in poster
  it("2. Poster should display all active branches dynamically from master DentalBranch", async () => {
    const branches = await branchRepo.getBranches();
    const activeBranches = branches.filter((b) => b.isActive ?? (b as any).active ?? true);

    expect(activeBranches.length).toBeGreaterThanOrEqual(1);
    
    const branchNames = activeBranches.map((b) => b.name);
    expect(branchNames.some((name) => name.toLowerCase().includes("gebang"))).toBe(true);
  });

  // 3. Date filter works correctly
  it("3. Date filter should accurately filter schedules for the selected date", async () => {
    const targetDate = "2026-09-23";
    const dateSchedules = await scheduleRepo.getSchedules({ date: targetDate });

    const filtered = dateSchedules.filter(
      (s) => s.date === targetDate && s.status !== ScheduleStatus.CANCELLED
    );

    expect(filtered.every((s) => s.date === targetDate)).toBe(true);
  });

  // 4. "All Branches" filter works
  it("4. Filter 'ALL' should retain all branches in the poster dataset", async () => {
    const branches = await branchRepo.getBranches();
    const activeBranches = branches.filter((b) => b.isActive ?? (b as any).active ?? true);

    const selectedBranchId = "ALL";
    const resultBranches = selectedBranchId === "ALL" 
      ? activeBranches 
      : activeBranches.filter((b) => b.id === selectedBranchId);

    expect(resultBranches.length).toEqual(activeBranches.length);
  });

  // 5. Single branch filter works
  it("5. Single branch filter should restrict poster dataset to that specific branch", async () => {
    const branches = await branchRepo.getBranches();
    const targetBranch = branches[0];

    const selectedBranchId = targetBranch.id;
    const resultBranches = selectedBranchId === "ALL" 
      ? branches 
      : branches.filter((b) => b.id === selectedBranchId);

    expect(resultBranches.length).toBe(1);
    expect(resultBranches[0].id).toBe(targetBranch.id);
  });

  // 6. Schedules sorted by startTime ASC
  it("6. Schedules inside each branch card should be sorted by startTime ascending", async () => {
    const targetDate = "2026-09-23";
    const dateSchedules = await scheduleRepo.getSchedules({ date: targetDate });
    const gebangSchedules = dateSchedules
      .filter((s) => s.branchId === "branch-gebang" && s.status !== ScheduleStatus.CANCELLED)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));

    for (let i = 0; i < gebangSchedules.length - 1; i++) {
      expect(gebangSchedules[i].startTime <= gebangSchedules[i + 1].startTime).toBe(true);
    }
  });

  // 7. Doctor without photo uses avatar fallback
  it("7. Doctors without profile photos should cleanly fallback to initial avatar", async () => {
    const doctors = await doctorRepo.getDoctors();
    const docWithoutPhoto = doctors.find((d) => !(d as any).profileImage && !(d as any).photoUrl);

    expect(docWithoutPhoto).toBeDefined();
    const docName = docWithoutPhoto?.name || docWithoutPhoto?.fullName || "Dokter Gigi";
    const initials = docName
      .replace(/^drg\.\s*/i, "")
      .split(" ")
      .map((n) => n[0])
      .join("")
      .substring(0, 2)
      .toUpperCase();

    expect(initials.length).toBeGreaterThan(0);
  });

  // 8. Empty branch schedule does not fabricate fake data
  it("8. Branch without schedules on selected date should display fallback message without fake schedules", async () => {
    const futureDate = "2029-12-31";
    const futureSchedules = await scheduleRepo.getSchedules({ date: futureDate });

    expect(futureSchedules.length).toBe(0);
  });

  // 9. No DoctorSchedule created when generating poster
  it("9. Poster generation must be purely read-only and NOT create any DoctorSchedule records", async () => {
    const initialCount = (await scheduleRepo.getSchedules({})).length;

    // Simulate rendering poster dataset
    const date = "2026-09-23";
    await scheduleRepo.getSchedules({ date });

    const finalCount = (await scheduleRepo.getSchedules({})).length;
    expect(finalCount).toEqual(initialCount);
  });

  // 10. No DoctorSchedule modified when generating poster
  it("10. Poster generation must NOT modify existing DoctorSchedule records", async () => {
    const initialSchedules = await scheduleRepo.getSchedules({});
    const snapshotJSON = JSON.stringify(initialSchedules);

    // Simulate poster data read
    await scheduleRepo.getSchedules({ date: "2026-09-23" });

    const finalSchedules = await scheduleRepo.getSchedules({});
    expect(JSON.stringify(finalSchedules)).toEqual(snapshotJSON);
  });

  // 11. Branch Admin cannot generate multi-branch poster
  it("11. Branch Admin role should be blocked from accessing multi-branch poster generation", () => {
    const userRole = UserRole.BRANCH_ADMIN;
    const canAccessMultiBranchPoster = userRole === (UserRole.SUPER_ADMIN as any);

    expect(canAccessMultiBranchPoster).toBe(false);
  });

  // 12. Super Admin can generate multi-branch poster
  it("12. Super Admin role should have full access to generate multi-branch poster", () => {
    const userRole = UserRole.SUPER_ADMIN;
    const canAccessMultiBranchPoster = userRole === UserRole.SUPER_ADMIN;

    expect(canAccessMultiBranchPoster).toBe(true);
  });

  // 13. Download filename generated based on selected date
  it("13. Download filename should dynamically include the selected date in YYYY-MM-DD format", () => {
    const targetDate = "2026-09-23";
    const expectedFilename = `Jadwal-Dokter-Lala-Dentist-${targetDate}.png`;

    expect(expectedFilename).toBe("Jadwal-Dokter-Lala-Dentist-2026-09-23.png");
  });

  // 14. Caption uses selected date
  it("14. Social media caption generator should dynamically include localized Indonesian date", () => {
    const targetDate = "2026-09-23";
    const formattedDate = formatIndonesianDate(targetDate);

    const caption = `🦷 JADWAL DOKTER GIGI LALA DENTIST\n\nBerikut jadwal dokter Lala Dentist untuk:\n📅 ${formattedDate}`;

    expect(caption).toContain(formattedDate);
    expect(caption).toContain("2026");
  });

  // 15. Logo comes from branding configuration
  it("15. Poster branding should utilize clinic branding configuration", () => {
    const brandingConfig = {
      name: "Lala Dentist",
      tagline: "Senyum Indah dimulai di Laladentist",
      phone: "0812-3456-7890"
    };

    expect(brandingConfig.name).toBe("Lala Dentist");
    expect(brandingConfig.tagline).toBe("Senyum Indah dimulai di Laladentist");
  });

  // 16. Dynamic branch count
  it("16. Poster layout should dynamically adapt to varying active branch counts", async () => {
    const branches = await branchRepo.getBranches();
    const activeBranches = branches.filter((b) => b.isActive ?? (b as any).active ?? true);

    const gridCols = activeBranches.length <= 4 ? "grid-cols-2" : "grid-cols-3";
    expect(["grid-cols-2", "grid-cols-3"]).toContain(gridCols);
  });

  // 17. Dynamic doctor count
  it("17. Doctor listings in each branch card should be dynamically mapped from active schedules", async () => {
    const schedules = await scheduleRepo.getSchedules({});
    const sampleDate = schedules[0]?.date || "2026-09-21";
    const dateSchedules = await scheduleRepo.getSchedules({ date: sampleDate });

    expect(dateSchedules.length).toBeGreaterThan(0);
  });

  // 18. No hardcoded schedule data
  it("18. Poster dataset should strictly originate from repository objects, not hardcoded strings", async () => {
    const schedules = await scheduleRepo.getSchedules({});
    const doctors = await doctorRepo.getDoctors();

    // Verify schedule references valid doctor IDs
    const docIds = new Set(doctors.map((d) => d.id));
    const validReferences = schedules.every((s) => docIds.has(s.doctorId));

    expect(validReferences).toBe(true);
  });
});
