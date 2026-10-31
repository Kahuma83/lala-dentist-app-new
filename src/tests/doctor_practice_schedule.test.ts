import { beforeEach, describe, expect, it } from "vitest";
import { MockDatabase } from "../data/mockData";
import { MockQueueRepository } from "../repositories/mockRepositories";
import { DoctorSchedule, ScheduleStatus, UserRole } from "../types/domain";
import {
  getDoctorPracticeBranchIds,
  resolveDoctorPracticeBranchId
} from "../utils/doctorPracticeSchedule";

describe("doctor practice schedule branch selection", () => {
  beforeEach(() => {
    MockDatabase.resetInstance();
  });

  it("uses only active schedules for the logged-in doctor on the operational date", () => {
    const schedules: DoctorSchedule[] = [
      {
        id: "schedule-gebang",
        doctorId: "doctor-ulfa",
        branchId: "branch-gebang",
        date: "2026-10-31",
        startTime: "08:00",
        endTime: "13:00",
        status: ScheduleStatus.ACTIVE,
        createdAt: "",
        updatedAt: ""
      },
      {
        id: "schedule-ambulu",
        doctorId: "doctor-ulfa",
        branchId: "branch-ambulu",
        date: "2026-10-31",
        startTime: "14:00",
        endTime: "18:00",
        status: ScheduleStatus.ACTIVE,
        createdAt: "",
        updatedAt: ""
      },
      {
        id: "schedule-inactive",
        doctorId: "doctor-ulfa",
        branchId: "branch-kampus",
        date: "2026-10-31",
        startTime: "08:00",
        endTime: "13:00",
        status: ScheduleStatus.CANCELLED,
        createdAt: "",
        updatedAt: ""
      },
      {
        id: "schedule-other-date",
        doctorId: "doctor-ulfa",
        branchId: "branch-kencong",
        date: "2026-11-01",
        startTime: "08:00",
        endTime: "13:00",
        status: ScheduleStatus.ACTIVE,
        createdAt: "",
        updatedAt: ""
      }
    ];

    expect(getDoctorPracticeBranchIds(schedules, "doctor-ulfa", "2026-10-31"))
      .toEqual(["branch-ambulu", "branch-gebang"]);
  });

  it("preserves a valid branch selection and otherwise prefers today's scheduled branch", () => {
    expect(resolveDoctorPracticeBranchId(
      ["branch-ambulu", "branch-gebang"],
      "branch-ambulu",
      "branch-gebang"
    )).toBe("branch-ambulu");
    expect(resolveDoctorPracticeBranchId(
      ["branch-ambulu"],
      "",
      "branch-gebang"
    )).toBe("branch-ambulu");
    expect(resolveDoctorPracticeBranchId([], "", "branch-gebang")).toBe("branch-gebang");
  });

  it("allows doctors to load queue data for an assigned practice branch only when identified", async () => {
    const db = MockDatabase.getInstance();
    db.doctorBranchAssignments = db.doctorBranchAssignments.filter(
      (assignment) => assignment.doctorId !== "doc-syafira" || assignment.branchId !== "branch-kampus"
    );
    db.doctorBranchAssignments.push({
      id: "test-doctor-campus-assignment",
      doctorId: "doc-syafira",
      branchId: "branch-kampus",
      startDate: "2026-01-01",
      active: true,
      createdAt: "",
      updatedAt: ""
    });

    const queueRepository = new MockQueueRepository();
    await expect(
      queueRepository.getQueueByBranch(
        "branch-kampus",
        UserRole.DOCTOR,
        "branch-gebang",
        "doc-syafira"
      )
    ).resolves.toBeDefined();
    await expect(
      queueRepository.getQueueByBranch("branch-kampus", UserRole.DOCTOR, "branch-gebang")
    ).rejects.toThrow("Access denied");
    await expect(
      queueRepository.getQueueByBranch(
        "branch-kencong",
        UserRole.DOCTOR,
        "branch-gebang",
        "doc-syafira"
      )
    ).rejects.toThrow("Access denied");
  });
});
