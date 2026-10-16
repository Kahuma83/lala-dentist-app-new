import { describe, it, expect, beforeEach } from "vitest";
import { MockDoctorScheduleRepository, MockDoctorRepository } from "../repositories/mockRepositories";
import { SupabaseDoctorScheduleRepository, SupabaseDoctorRepository } from "../repositories/supabaseRepositories";
import { DoctorSchedule, UserRole, ScheduleStatus } from "../types/domain";
import { isBranchMatch } from "../utils/branchUtils";
import { getActiveDoctorsForSchedule } from "../utils/doctorScheduleUtils";
import { MOCK_BRANCHES, MOCK_DOCTORS } from "../data/mockData";

describe("Branch Admin Doctor Schedules & Assignment Retrieval Resilience", () => {
  let mockScheduleRepo: MockDoctorScheduleRepository;
  let mockDoctorRepo: MockDoctorRepository;
  let supabaseScheduleRepo: SupabaseDoctorScheduleRepository;
  let supabaseDoctorRepo: SupabaseDoctorRepository;

  beforeEach(() => {
    mockScheduleRepo = new MockDoctorScheduleRepository();
    mockDoctorRepo = new MockDoctorRepository();
    supabaseScheduleRepo = new SupabaseDoctorScheduleRepository();
    supabaseDoctorRepo = new SupabaseDoctorRepository();
  });

  describe("Branch Matching Utility (isBranchMatch)", () => {
    it("should match branch codes with branch slugs and UUIDs", () => {
      // Code to slug
      expect(isBranchMatch("GEB", "branch-gebang", MOCK_BRANCHES)).toBe(true);
      expect(isBranchMatch("branch-gebang", "GEB", MOCK_BRANCHES)).toBe(true);
      expect(isBranchMatch("KEN", "branch-kencong", MOCK_BRANCHES)).toBe(true);
      expect(isBranchMatch("AMB", "branch-ambulu", MOCK_BRANCHES)).toBe(true);
      expect(isBranchMatch("KAM", "branch-kampus", MOCK_BRANCHES)).toBe(true);
      expect(isBranchMatch("LEN", "branch-lengkong-mumbul", MOCK_BRANCHES)).toBe(true);

      // Same branch code lowercase / uppercase
      expect(isBranchMatch("geb", "GEB")).toBe(true);
      expect(isBranchMatch("ken", "branch-kencong")).toBe(true);

      // Negative matches (different branches)
      expect(isBranchMatch("GEB", "branch-kencong", MOCK_BRANCHES)).toBe(false);
      expect(isBranchMatch("KEN", "branch-gebang", MOCK_BRANCHES)).toBe(false);
      expect(isBranchMatch("AMB", "branch-kampus", MOCK_BRANCHES)).toBe(false);
    });

    it("filters walk-in doctor choices to active schedules for the selected branch and date", () => {
      const schedules: DoctorSchedule[] = [
        {
          id: "schedule-ulfa-today",
          doctorId: "doc-ulfa",
          branchId: "branch-gebang",
          date: "2026-10-15",
          startTime: "08:00",
          endTime: "16:00",
          status: ScheduleStatus.ACTIVE,
          createdAt: "2026-10-01T00:00:00Z",
          updatedAt: "2026-10-01T00:00:00Z"
        },
        {
          id: "schedule-amel-other-branch",
          doctorId: "doc-amel",
          branchId: "branch-kencong",
          date: "2026-10-15",
          startTime: "08:00",
          endTime: "16:00",
          status: ScheduleStatus.ACTIVE,
          createdAt: "2026-10-01T00:00:00Z",
          updatedAt: "2026-10-01T00:00:00Z"
        },
        {
          id: "schedule-iza-cancelled",
          doctorId: "doc-iza",
          branchId: "branch-gebang",
          date: "2026-10-15",
          startTime: "08:00",
          endTime: "16:00",
          status: ScheduleStatus.CANCELLED,
          createdAt: "2026-10-01T00:00:00Z",
          updatedAt: "2026-10-01T00:00:00Z"
        },
        {
          id: "schedule-regina-other-day",
          doctorId: "doc-regina",
          branchId: "branch-gebang",
          date: "2026-10-16",
          startTime: "08:00",
          endTime: "16:00",
          status: ScheduleStatus.ACTIVE,
          createdAt: "2026-10-01T00:00:00Z",
          updatedAt: "2026-10-01T00:00:00Z"
        }
      ];

      const available = getActiveDoctorsForSchedule(
        MOCK_DOCTORS,
        schedules,
        "branch-gebang",
        "2026-10-15",
        MOCK_BRANCHES
      );

      expect(available.map((doctor) => doctor.id)).toEqual(["doc-ulfa"]);
    });
  });

  describe("Mock Repositories Doctor & Schedule Retrieval for Branch Admin", () => {
    it("should retrieve doctors for Branch Admin with text branch code 'GEB'", async () => {
      const doctors = await mockDoctorRepo.getDoctors(UserRole.BRANCH_ADMIN, "GEB");
      expect(doctors.length).toBeGreaterThan(0);
      expect(doctors.some((d) => d.id === "doc-ulfa" || d.name.includes("Ulfa"))).toBe(true);
    });

    it("should retrieve doctors for Branch Admin with text branch code 'KEN'", async () => {
      const doctors = await mockDoctorRepo.getDoctors(UserRole.BRANCH_ADMIN, "KEN");
      expect(doctors.length).toBeGreaterThan(0);
      expect(doctors.some((d) => d.id === "doc-amel" || d.id === "doc-iza" || d.name.includes("Amel"))).toBe(true);
    });

    it("should fallback to active doctors for Branch Admin on newly initialized branches (never 0 doctors)", async () => {
      const doctors = await mockDoctorRepo.getDoctors(UserRole.BRANCH_ADMIN, "branch-baru-tanpa-tugas");
      expect(doctors.length).toBeGreaterThan(0);
      expect(doctors.every((d) => d.active ?? d.isActive ?? true)).toBe(true);
    });

    it("should retrieve schedules for Branch Admin with text code 'GEB'", async () => {
      const schedules = await mockScheduleRepo.getSchedules(
        undefined,
        UserRole.BRANCH_ADMIN,
        "GEB"
      );
      expect(schedules.length).toBeGreaterThan(0);
      // All returned schedules should belong to Gebang
      expect(schedules.every((s) => isBranchMatch(s.branchId, "GEB", MOCK_BRANCHES))).toBe(true);
    });

    it("should retrieve doctor branch assignments with text branch code", async () => {
      const assignments = await mockDoctorRepo.getDoctorBranchAssignments(undefined, "GEB");
      expect(assignments.length).toBeGreaterThan(0);
      expect(assignments.some((a) => a.doctorId === "doc-ulfa")).toBe(true);
    });
  });

  describe("Supabase Repositories Doctor & Schedule Retrieval for Branch Admin", () => {
    it("should retrieve doctors without failing when passed branch code 'GEB' or slug", async () => {
      const doctors = await supabaseDoctorRepo.getDoctors(UserRole.BRANCH_ADMIN, "GEB");
      expect(doctors.length).toBeGreaterThan(0);
    });

    it("should retrieve schedules for Branch Admin with branch code 'GEB' in fallback mode", async () => {
      const schedules = await supabaseScheduleRepo.getSchedules(
        undefined,
        UserRole.BRANCH_ADMIN,
        "GEB"
      );
      expect(schedules.length).toBeGreaterThan(0);
      expect(schedules.every((s) => isBranchMatch(s.branchId, "GEB", MOCK_BRANCHES))).toBe(true);
    });

    it("should retrieve doctor branch assignments for Branch Admin with branch code 'KEN'", async () => {
      const assignments = await supabaseDoctorRepo.getDoctorBranchAssignments(undefined, "KEN");
      expect(assignments.length).toBeGreaterThan(0);
    });
  });
});
