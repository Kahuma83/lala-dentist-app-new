import { describe, it, expect, beforeEach } from "vitest";
import { MockDatabase } from "../data/mockData";
import { MockBookingRepository, MockDoctorScheduleRepository, MockDoctorRepository } from "../repositories/mockRepositories";
import { UserRole, ScheduleStatus } from "../types/domain";
import { isBranchMatch } from "../utils/branchUtils";

describe("Booking Resolution for Branch Admin Gebang", () => {
  let db: MockDatabase;
  let bookingRepo: MockBookingRepository;
  let scheduleRepo: MockDoctorScheduleRepository;
  let doctorRepo: MockDoctorRepository;

  beforeEach(() => {
    db = MockDatabase.resetInstance();
    bookingRepo = new MockBookingRepository();
    scheduleRepo = new MockDoctorScheduleRepository();
    doctorRepo = new MockDoctorRepository();
  });

  it("1. Resolves branch matching correctly between Gebang variants (slug, code, name)", () => {
    expect(isBranchMatch("branch-gebang", "GEB", db.branches)).toBe(true);
    expect(isBranchMatch("branch-gebang", "Cabang Gebang", db.branches)).toBe(true);
    expect(isBranchMatch("GEB", "branch-ambulu", db.branches)).toBe(false);
  });

  it("2. Schedules on 2026-10-14 at Gebang belong to drg. Regina", async () => {
    // Seed schedule for drg. Regina at Gebang on 2026-10-14
    await scheduleRepo.createSchedule({
      doctorId: "doc-regina",
      branchId: "branch-gebang",
      date: "2026-10-14",
      startTime: "14:00",
      endTime: "19:00",
      status: ScheduleStatus.ACTIVE,
      notes: "Praktek Gebang Sore"
    });

    const schedules = await scheduleRepo.getSchedules(
      { date: "2026-10-14" },
      UserRole.BRANCH_ADMIN,
      "branch-gebang"
    );

    const gebangSchedules = schedules.filter((s) =>
      isBranchMatch(s.branchId, "branch-gebang", db.branches) && s.status === ScheduleStatus.ACTIVE
    );

    expect(gebangSchedules.length).toBeGreaterThan(0);
    expect(gebangSchedules.some((s) => s.doctorId.includes("regina"))).toBe(true);
  });

  it("3. Branch Admin Gebang creates a booking with scheduleVerified = true", async () => {
    const created = await bookingRepo.createBooking(
      {
        patientId: "patient-1",
        branchId: "branch-gebang",
        doctorId: "doc-regina",
        bookingDateTime: "2026-10-14T14:30:00Z",
        timeSlot: "14:30",
        notes: "Konsultasi gigi",
        scheduleVerified: true
      },
      UserRole.BRANCH_ADMIN,
      "branch-gebang"
    );

    expect(created.id).toBeDefined();
    expect(isBranchMatch(created.branchId, "branch-gebang", db.branches)).toBe(true);
    expect(created.scheduleVerified).toBe(true);
  });
});
