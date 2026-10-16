import { describe, it, expect, beforeEach } from "vitest";
import { MockDatabase } from "../data/mockData";
import { MockOvertimeRepository, MockAttendanceRepository, AppClock } from "../repositories/mockRepositories";
import { OvertimeStatus, OvertimeType, AttendanceStatus, UserRole } from "../types/domain";

describe("HR-3: Overtime Engine & Approval - Comprehensive Test Suite", () => {
  let db: MockDatabase;
  let overtimeRepo: MockOvertimeRepository;
  let attendanceRepo: MockAttendanceRepository;

  beforeEach(() => {
    db = MockDatabase.resetInstance();
    overtimeRepo = new MockOvertimeRepository();
    attendanceRepo = new MockAttendanceRepository();
    AppClock.reset();
  });

  it("1. Detects overtime when actualCheckOutAt > scheduledEndAt", async () => {
    AppClock.setFixedTime("2026-10-05T08:00:00Z");
    const att = await attendanceRepo.checkIn({
      staffId: "staff-ast-clary",
      branchId: "branch-gebang",
      date: "2026-10-05",
      scheduledStartAt: "08:00",
      scheduledEndAt: "16:00",
      actorRole: UserRole.SUPER_ADMIN
    });
    AppClock.setFixedTime("2026-10-05T17:30:00Z");
    await attendanceRepo.checkOut({
      attendanceId: att.id,
      actorRole: UserRole.SUPER_ADMIN
    });

    const ot = await overtimeRepo.detectFromAttendance(att.id, UserRole.SUPER_ADMIN);
    expect(ot).not.toBeNull();
    expect(ot?.status).toBe(OvertimeStatus.DETECTED);
    expect(ot?.overtimeMinutes).toBe(90);
    expect(ot?.overtimeHours).toBe(1.5);
    expect(ot?.staffId).toBe("staff-ast-clary");
    expect(ot?.branchId).toBe("branch-gebang");
  });

  it("2. Returns null when actualCheckOutAt equals scheduledEndAt", async () => {
    AppClock.setFixedTime("2026-09-22T08:00:00Z");
    const att = await attendanceRepo.checkIn({
      staffId: "staff-ast-clary",
      branchId: "branch-gebang",
      date: "2026-09-22",
      scheduledStartAt: "08:00",
      scheduledEndAt: "16:00",
      actorRole: UserRole.SUPER_ADMIN
    });
    AppClock.setFixedTime("2026-09-22T16:00:00Z");
    await attendanceRepo.checkOut({
      attendanceId: att.id,
      actorRole: UserRole.SUPER_ADMIN
    });

    const ot = await overtimeRepo.detectFromAttendance(att.id, UserRole.SUPER_ADMIN);
    expect(ot).toBeNull();
  });

  it("3. Returns null when actualCheckOutAt is earlier than scheduledEndAt", async () => {
    AppClock.setFixedTime("2026-09-23T08:00:00Z");
    const att = await attendanceRepo.checkIn({
      staffId: "staff-ast-clary",
      branchId: "branch-gebang",
      date: "2026-09-23",
      scheduledStartAt: "08:00",
      scheduledEndAt: "16:00",
      actorRole: UserRole.SUPER_ADMIN
    });
    AppClock.setFixedTime("2026-09-23T15:00:00Z");
    await attendanceRepo.checkOut({
      attendanceId: att.id,
      actorRole: UserRole.SUPER_ADMIN
    });

    const ot = await overtimeRepo.detectFromAttendance(att.id, UserRole.SUPER_ADMIN);
    expect(ot).toBeNull();
  });

  it("4. Ensures idempotency when detecting multiple times for same attendance", async () => {
    AppClock.setFixedTime("2026-09-24T08:00:00Z");
    const att = await attendanceRepo.checkIn({
      staffId: "staff-ast-clary",
      branchId: "branch-gebang",
      date: "2026-09-24",
      scheduledStartAt: "08:00",
      scheduledEndAt: "16:00",
      actorRole: UserRole.SUPER_ADMIN
    });
    AppClock.setFixedTime("2026-09-24T18:00:00Z");
    await attendanceRepo.checkOut({
      attendanceId: att.id,
      actorRole: UserRole.SUPER_ADMIN
    });

    const ot1 = await overtimeRepo.detectFromAttendance(att.id, UserRole.SUPER_ADMIN);
    const ot2 = await overtimeRepo.detectFromAttendance(att.id, UserRole.SUPER_ADMIN);
    expect(ot1?.id).toBe(ot2?.id);
    expect(db.overtimes.length).toBe(1);
  });

  it("5. Skips doctor attendances from overtime detection", async () => {
    AppClock.setFixedTime("2026-09-25T08:00:00Z");
    const att = await attendanceRepo.checkIn({
      staffId: "staff-doc-syafira", // Doctor
      branchId: "branch-gebang",
      date: "2026-09-25",
      scheduledStartAt: "08:00",
      scheduledEndAt: "14:00",
      actorRole: UserRole.SUPER_ADMIN
    });
    AppClock.setFixedTime("2026-09-25T17:00:00Z");
    await attendanceRepo.checkOut({
      attendanceId: att.id,
      actorRole: UserRole.SUPER_ADMIN
    });

    const ot = await overtimeRepo.detectFromAttendance(att.id, UserRole.SUPER_ADMIN);
    expect(ot).toBeNull();
  });

  it("6. Skips non-PRESENT attendances (SICK, LEAVE, OFF, ABSENT)", async () => {
    AppClock.setFixedTime("2026-09-26T08:00:00Z");
    const att = await attendanceRepo.createAbsence({
      staffId: "staff-ast-clary",
      branchId: "branch-gebang",
      date: "2026-09-26",
      attendanceStatus: AttendanceStatus.SICK,
      actorRole: UserRole.SUPER_ADMIN
    });

    const ot = await overtimeRepo.detectFromAttendance(att.id, UserRole.SUPER_ADMIN);
    expect(ot).toBeNull();
  });

  it("7. Transitions DETECTED -> SUBMITTED", async () => {
    AppClock.setFixedTime("2026-09-27T08:00:00Z");
    const att = await attendanceRepo.checkIn({
      staffId: "staff-ast-clary",
      branchId: "branch-gebang",
      date: "2026-09-27",
      scheduledStartAt: "08:00",
      scheduledEndAt: "16:00",
      actorRole: UserRole.SUPER_ADMIN
    });
    AppClock.setFixedTime("2026-09-27T17:00:00Z");
    await attendanceRepo.checkOut({
      attendanceId: att.id,
      actorRole: UserRole.SUPER_ADMIN
    });

    let ot = await overtimeRepo.detectFromAttendance(att.id, UserRole.SUPER_ADMIN);
    expect(ot?.status).toBe(OvertimeStatus.DETECTED);

    ot = await overtimeRepo.submit(ot!.id, UserRole.SUPER_ADMIN);
    expect(ot.status).toBe(OvertimeStatus.SUBMITTED);
  });

  it("8. Transitions SUBMITTED -> APPROVED with approver details", async () => {
    AppClock.setFixedTime("2026-09-28T08:00:00Z");
    const att = await attendanceRepo.checkIn({
      staffId: "staff-ast-clary",
      branchId: "branch-gebang",
      date: "2026-09-28",
      scheduledStartAt: "08:00",
      scheduledEndAt: "16:00",
      actorRole: UserRole.SUPER_ADMIN
    });
    AppClock.setFixedTime("2026-09-28T17:00:00Z");
    await attendanceRepo.checkOut({
      attendanceId: att.id,
      actorRole: UserRole.SUPER_ADMIN
    });

    let ot = await overtimeRepo.detectFromAttendance(att.id, UserRole.SUPER_ADMIN);
    ot = await overtimeRepo.submit(ot!.id, UserRole.SUPER_ADMIN);
    ot = await overtimeRepo.approve(ot.id, "Dr. Budi", UserRole.SUPER_ADMIN);

    expect(ot.status).toBe(OvertimeStatus.APPROVED);
    expect(ot.approvedBy).toBe("Dr. Budi");
    expect(ot.approvedAt).not.toBeNull();
  });

  it("9. Transitions SUBMITTED -> REJECTED with mandatory reason", async () => {
    AppClock.setFixedTime("2026-09-29T08:00:00Z");
    const att = await attendanceRepo.checkIn({
      staffId: "staff-ast-clary",
      branchId: "branch-gebang",
      date: "2026-09-29",
      scheduledStartAt: "08:00",
      scheduledEndAt: "16:00",
      actorRole: UserRole.SUPER_ADMIN
    });
    AppClock.setFixedTime("2026-09-29T17:00:00Z");
    await attendanceRepo.checkOut({
      attendanceId: att.id,
      actorRole: UserRole.SUPER_ADMIN
    });

    let ot = await overtimeRepo.detectFromAttendance(att.id, UserRole.SUPER_ADMIN);
    ot = await overtimeRepo.submit(ot!.id, UserRole.SUPER_ADMIN);

    await expect(overtimeRepo.reject(ot.id, "Manager", "", UserRole.SUPER_ADMIN)).rejects.toThrow();

    ot = await overtimeRepo.reject(ot.id, "Manager", "Unscheduled overtime", UserRole.SUPER_ADMIN);
    expect(ot.status).toBe(OvertimeStatus.REJECTED);
    expect(ot.rejectedBy).toBe("Manager");
    expect(ot.rejectionReason).toBe("Unscheduled overtime");
  });

  it("10. Prevents direct approval of DETECTED records without submission", async () => {
    AppClock.setFixedTime("2026-09-30T08:00:00Z");
    const att = await attendanceRepo.checkIn({
      staffId: "staff-ast-clary",
      branchId: "branch-gebang",
      date: "2026-09-30",
      scheduledStartAt: "08:00",
      scheduledEndAt: "16:00",
      actorRole: UserRole.SUPER_ADMIN
    });
    AppClock.setFixedTime("2026-09-30T17:00:00Z");
    await attendanceRepo.checkOut({
      attendanceId: att.id,
      actorRole: UserRole.SUPER_ADMIN
    });

    const ot = await overtimeRepo.detectFromAttendance(att.id, UserRole.SUPER_ADMIN);
    await expect(overtimeRepo.approve(ot!.id, "Manager", UserRole.SUPER_ADMIN)).rejects.toThrow();
  });

  it("11. Enforces branch isolation for Branch Admin", async () => {
    AppClock.setFixedTime("2026-10-01T08:00:00Z");
    const att = await attendanceRepo.checkIn({
      staffId: "staff-ast-clary",
      branchId: "branch-kampus",
      date: "2026-10-01",
      scheduledStartAt: "08:00",
      scheduledEndAt: "16:00",
      actorRole: UserRole.SUPER_ADMIN
    });
    AppClock.setFixedTime("2026-10-01T17:00:00Z");
    await attendanceRepo.checkOut({
      attendanceId: att.id,
      actorRole: UserRole.SUPER_ADMIN
    });

    const ot = await overtimeRepo.detectFromAttendance(att.id, UserRole.SUPER_ADMIN);

    const res = await overtimeRepo.getById(ot!.id, UserRole.BRANCH_ADMIN, "branch-gebang");
    expect(res).toBeNull();

    await expect(
      overtimeRepo.submit(ot!.id, UserRole.BRANCH_ADMIN, "branch-gebang")
    ).rejects.toThrow();
  });

  it("12. Retrieves summary accurately across states", async () => {
    AppClock.setFixedTime("2026-10-02T08:00:00Z");
    const att1 = await attendanceRepo.checkIn({
      staffId: "staff-ast-clary",
      branchId: "branch-gebang",
      date: "2026-10-02",
      scheduledStartAt: "08:00",
      scheduledEndAt: "16:00",
      actorRole: UserRole.SUPER_ADMIN
    });
    AppClock.setFixedTime("2026-10-02T17:00:00Z");
    await attendanceRepo.checkOut({
      attendanceId: att1.id,
      actorRole: UserRole.SUPER_ADMIN
    });

    await overtimeRepo.detectFromAttendance(att1.id, UserRole.SUPER_ADMIN);

    const summary = await overtimeRepo.getSummary("branch-gebang", UserRole.SUPER_ADMIN);
    expect(summary.totalDetectedMinutes).toBe(60);
    expect(summary.totalApprovedMinutes).toBe(0);
  });

  it("13. Retrieves by staff correctly", async () => {
    AppClock.setFixedTime("2026-10-03T08:00:00Z");
    const att = await attendanceRepo.checkIn({
      staffId: "staff-ast-clary",
      branchId: "branch-gebang",
      date: "2026-10-03",
      scheduledStartAt: "08:00",
      scheduledEndAt: "16:00",
      actorRole: UserRole.SUPER_ADMIN
    });
    AppClock.setFixedTime("2026-10-03T17:00:00Z");
    await attendanceRepo.checkOut({
      attendanceId: att.id,
      actorRole: UserRole.SUPER_ADMIN
    });

    await overtimeRepo.detectFromAttendance(att.id, UserRole.SUPER_ADMIN);
    const list = await overtimeRepo.getByStaff("staff-ast-clary", UserRole.SUPER_ADMIN);
    expect(list.length).toBe(1);
    expect(list[0].staffId).toBe("staff-ast-clary");
  });

  it("14. Retrieves by date range correctly", async () => {
    AppClock.setFixedTime("2026-10-04T08:00:00Z");
    const att = await attendanceRepo.checkIn({
      staffId: "staff-ast-clary",
      branchId: "branch-gebang",
      date: "2026-10-04",
      scheduledStartAt: "08:00",
      scheduledEndAt: "16:00",
      actorRole: UserRole.SUPER_ADMIN
    });
    AppClock.setFixedTime("2026-10-04T17:00:00Z");
    await attendanceRepo.checkOut({
      attendanceId: att.id,
      actorRole: UserRole.SUPER_ADMIN
    });

    await overtimeRepo.detectFromAttendance(att.id, UserRole.SUPER_ADMIN);
    const range = await overtimeRepo.getByDateRange("2026-10-01", "2026-10-05", "branch-gebang", UserRole.SUPER_ADMIN);
    expect(range.length).toBe(1);
  });
});
