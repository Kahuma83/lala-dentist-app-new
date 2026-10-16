import { describe, it, expect, beforeEach } from "vitest";
import { MockDatabase } from "../data/mockData";
import {
  MockDoctorRepository,
  MockStaffRepository,
  MockDoctorScheduleRepository,
  MockWorkShiftRepository,
  MockStaffShiftAssignmentRepository,
  AppClock
} from "../repositories/mockRepositories";
import {
  UserRole,
  StaffPosition,
  EmploymentStatus,
  ScheduleStatus
} from "../types/domain";

describe("PHASE HR-1: Master SDM, Dokter Multi-Cabang, Jadwal Dokter & Shift Staff", () => {
  let docRepo: MockDoctorRepository;
  let staffRepo: MockStaffRepository;
  let scheduleRepo: MockDoctorScheduleRepository;
  let shiftRepo: MockWorkShiftRepository;
  let staffShiftRepo: MockStaffShiftAssignmentRepository;

  beforeEach(() => {
    MockDatabase.resetInstance();
    AppClock.reset();
    docRepo = new MockDoctorRepository();
    staffRepo = new MockStaffRepository();
    scheduleRepo = new MockDoctorScheduleRepository();
    shiftRepo = new MockWorkShiftRepository();
    staffShiftRepo = new MockStaffShiftAssignmentRepository();
  });

  // =========================================================================
  // DOCTOR MANAGEMENT & MULTI-BRANCH TESTS (1-8)
  // =========================================================================
  it("Test 1: Can retrieve all doctors including standard Lala Dentist roster", async () => {
    const doctors = await docRepo.getDoctors();
    expect(doctors.length).toBeGreaterThanOrEqual(8);

    const names = doctors.map((d) => d.name || d.fullName);
    expect(names.some((n) => n?.includes("Syafira"))).toBe(true);
    expect(names.some((n) => n?.includes("Lala"))).toBe(true);
    expect(names.some((n) => n?.includes("Vio"))).toBe(true);
    expect(names.some((n) => n?.includes("Yuni"))).toBe(true);
    expect(names.some((n) => n?.includes("Ulfa"))).toBe(true);
    expect(names.some((n) => n?.includes("Regina"))).toBe(true);
    expect(names.some((n) => n?.includes("Iza"))).toBe(true);
    expect(names.some((n) => n?.includes("Amel"))).toBe(true);
  });

  it("Test 2: Enforces doctorCode uniqueness (case-insensitive)", async () => {
    await expect(
      docRepo.createDoctor({
        doctorCode: "doc-syafira", // duplicate of DOC-SYAFIRA
        name: "drg. Syafira Duplicate",
        specialization: "Sp.KG",
        phone: "0811111111",
        assignedBranchId: "branch-gebang",
        active: true,
        isActive: true
      })
    ).rejects.toThrow(/sudah terdaftar/i);
  });

  it("Test 3: Super Admin can create a new doctor with valid fields", async () => {
    const newDoc = await docRepo.createDoctor({
      doctorCode: "DOC-NEW01",
      name: "drg. Sarah Bella, Sp.Ort",
      specialization: "Ortodonti",
      phone: "081234567899",
      email: "sarah@laladentist.com",
      str: "STR-999888",
      sip: "SIP-777666",
      assignedBranchId: "branch-gebang",
      active: true,
      isActive: true,
      notes: "Dokter Spesialis Ortodonti Baru"
    });

    expect(newDoc.id).toBeDefined();
    expect(newDoc.doctorCode).toBe("DOC-NEW01");
    expect(newDoc.name).toBe("drg. Sarah Bella, Sp.Ort");
    expect(newDoc.active).toBe(true);

    const fetched = await docRepo.getDoctorById(newDoc.id);
    expect(fetched?.name).toBe("drg. Sarah Bella, Sp.Ort");
  });

  it("Test 4: Auto-creates DoctorBranchAssignment when doctor created with assignedBranchId", async () => {
    const newDoc = await docRepo.createDoctor({
      doctorCode: "DOC-AUTO-BR",
      name: "drg. Kevin",
      specialization: "Dokter Gigi Umum",
      phone: "081234567888",
      assignedBranchId: "branch-kampus",
      active: true,
      isActive: true
    });

    const assignments = await docRepo.getDoctorBranchAssignments(newDoc.id);
    expect(assignments.length).toBeGreaterThanOrEqual(1);
    expect(assignments.some((a) => a.branchId === "branch-kampus" && a.active)).toBe(true);
  });

  it("Test 5: Multi-Branch: Doctor can be assigned to multiple branches simultaneously", async () => {
    const newDoc = await docRepo.createDoctor({
      doctorCode: "DOC-MULTI",
      name: "drg. Multi Cabang",
      specialization: "Periodonsia",
      phone: "0819999999",
      assignedBranchId: "branch-gebang",
      active: true,
      isActive: true
    });

    // Assign to a second branch (Lengkong Mumbul)
    await docRepo.assignDoctorToBranch({
      doctorId: newDoc.id,
      branchId: "branch-lengkong-mumbul",
      startDate: "2026-10-01",
      endDate: null,
      active: true,
      notes: "Praktek setiap Rabu & Jumat"
    });

    const assignments = await docRepo.getDoctorBranchAssignments(newDoc.id);
    const assignedBranchIds = assignments.filter((a) => a.active).map((a) => a.branchId);
    expect(assignedBranchIds).toContain("branch-gebang");
    expect(assignedBranchIds).toContain("branch-lengkong-mumbul");
  });

  it("Test 6: Doctor active status toggle updates both active and isActive flags", async () => {
    const doc = (await docRepo.getDoctors())[0];
    const originalActive = doc.active;

    const updated = await docRepo.updateDoctor(doc.id, {
      active: !originalActive
    });

    expect(updated.active).toBe(!originalActive);
    expect(updated.isActive).toBe(!originalActive);
  });

  it("Test 7: Updating doctor with conflicting doctorCode of another doctor throws error", async () => {
    const docs = await docRepo.getDoctors();
    const doc1 = docs[0];
    const doc2 = docs[1];

    await expect(
      docRepo.updateDoctor(doc2.id, {
        doctorCode: doc1.doctorCode
      })
    ).rejects.toThrow(/sudah terdaftar/i);
  });

  it("Test 8: Can filter doctors by assigned branch", async () => {
    const gebangDocs = await docRepo.getDoctorsByBranch("branch-gebang");
    expect(gebangDocs.length).toBeGreaterThan(0);
    const docs = await docRepo.getDoctors();
    expect(gebangDocs.every((d) => d.assignedBranchId === "branch-gebang" || docs.some((m) => m.id === d.id))).toBe(true);
  });

  // =========================================================================
  // MASTER STAFF & "STAFF ≠ USERACCOUNT" PRINCIPLE TESTS (9-19)
  // =========================================================================
  it("Test 9: Super Admin can list all staff across all branches", async () => {
    const allStaff = await staffRepo.getStaff();
    expect(allStaff.length).toBeGreaterThanOrEqual(5);
  });

  it("Test 10: Staff ≠ UserAccount: Staff can exist WITHOUT login user account (e.g. Office Boy)", async () => {
    const obStaff = await staffRepo.createStaff({
      employeeCode: "STF-OB001",
      fullName: "Pak Supriadi (OB)",
      phone: "081555555555",
      position: StaffPosition.OB,
      employmentStatus: EmploymentStatus.ACTIVE,
      joinDate: "2026-01-01",
      branchId: "branch-gebang",
      userAccountId: null, // No login credentials required
      active: true
    });

    expect(obStaff.id).toBeDefined();
    expect(obStaff.position).toBe(StaffPosition.OB);
    expect(obStaff.userAccountId).toBeNull();
  });

  it("Test 11: Staff can be linked with UserAccount credentials", async () => {
    const allStaff = await staffRepo.getStaff();
    const staffWithUser = allStaff.find((s) => s.userAccountId !== null && s.userAccountId !== undefined);
    expect(staffWithUser).toBeDefined();
    expect(staffWithUser?.userAccountId).toBeTruthy();
  });

  it("Test 12: Enforces employeeCode uniqueness (case-insensitive)", async () => {
    await expect(
      staffRepo.createStaff({
        employeeCode: "emp-001", // duplicate of EMP-001
        fullName: "Duplikat Staff",
        phone: "0812345678",
        position: StaffPosition.ASSISTANT,
        employmentStatus: EmploymentStatus.ACTIVE,
        joinDate: "2026-01-01",
        branchId: "branch-gebang",
        active: true
      })
    ).rejects.toThrow(/sudah terdaftar/i);
  });

  it("Test 13: Super Admin can create staff in any branch", async () => {
    const created = await staffRepo.createStaff(
      {
        employeeCode: "STF-SA-01",
        fullName: "Staff Lengkong Baru",
        phone: "0812345678",
        position: StaffPosition.BRANCH_ADMIN,
        employmentStatus: EmploymentStatus.ACTIVE,
        joinDate: "2026-01-01",
        branchId: "branch-lengkong-mumbul",
        active: true
      },
      UserRole.SUPER_ADMIN,
      null
    );

    expect(created.id).toBeDefined();
    expect(created.branchId).toBe("branch-lengkong-mumbul");
  });

  it("Test 14: Branch Admin can create staff in their assigned branch", async () => {
    const created = await staffRepo.createStaff(
      {
        employeeCode: "STF-BA-GEB",
        fullName: "Asisten Gebang Baru",
        phone: "0812345678",
        position: StaffPosition.ASSISTANT,
        employmentStatus: EmploymentStatus.ACTIVE,
        joinDate: "2026-01-01",
        branchId: "branch-gebang",
        active: true
      },
      UserRole.BRANCH_ADMIN,
      "branch-gebang"
    );

    expect(created.id).toBeDefined();
    expect(created.branchId).toBe("branch-gebang");
  });

  it("Test 15: Branch Isolation: Branch Admin FORBIDDEN from creating staff in another branch", async () => {
    await expect(
      staffRepo.createStaff(
        {
          employeeCode: "STF-HACK-01",
          fullName: "Staff Cabang Lain",
          phone: "0812345678",
          position: StaffPosition.ASSISTANT,
          employmentStatus: EmploymentStatus.ACTIVE,
          joinDate: "2026-01-01",
          branchId: "branch-lengkong-mumbul", // Different branch
          active: true
        },
        UserRole.BRANCH_ADMIN,
        "branch-gebang"
      )
    ).rejects.toThrow(/hanya dapat mendaftarkan staff/i);
  });

  it("Test 16: Branch Isolation: Branch Admin only retrieves staff belonging to their branch", async () => {
    const gebangStaff = await staffRepo.getStaff(undefined, UserRole.BRANCH_ADMIN, "branch-gebang");
    expect(gebangStaff.length).toBeGreaterThan(0);
    expect(gebangStaff.every((s) => s.branchId === "branch-gebang" || s.branchId === null)).toBe(true);
  });

  it("Test 17: Super Admin can update staff information", async () => {
    const staffList = await staffRepo.getStaff();
    const target = staffList[0];

    const updated = await staffRepo.updateStaff(target.id, {
      fullName: `${target.fullName} (Senior)`,
      notes: "Dipromosikan menjadi senior"
    });

    expect(updated.fullName).toContain("(Senior)");
    expect(updated.notes).toBe("Dipromosikan menjadi senior");
  });

  it("Test 18: Staff deactivation sets status to INACTIVE and active: false", async () => {
    const staffList = await staffRepo.getStaff();
    const target = staffList.find((s) => s.active);
    expect(target).toBeDefined();

    const deactivated = await staffRepo.deactivateStaff(target!.id);
    expect(deactivated.active).toBe(false);
    expect(deactivated.employmentStatus).toBe(EmploymentStatus.INACTIVE);
  });

  it("Test 19: Branch Admin cannot deactivate staff of another branch", async () => {
    const allStaff = await staffRepo.getStaff();
    const lengkongStaff = allStaff.find((s) => s.branchId === "branch-lengkong-mumbul");
    expect(lengkongStaff).toBeDefined();

    await expect(
      staffRepo.deactivateStaff(lengkongStaff!.id, UserRole.BRANCH_ADMIN, "branch-gebang")
    ).rejects.toThrow(/tidak memiliki akses mengubah staff di cabang lain/i);
  });

  // =========================================================================
  // DOCTOR SCHEDULES TESTS (20-27)
  // =========================================================================
  it("Test 20: Can create a valid doctor schedule for a specific date and branch", async () => {
    const doc = (await docRepo.getDoctors())[0];
    const sched = await scheduleRepo.createSchedule({
      doctorId: doc.id,
      branchId: "branch-gebang",
      date: "2026-10-15",
      startTime: "08:00",
      endTime: "14:00",
      status: ScheduleStatus.ACTIVE,
      notes: "Poli Pagi Gebang"
    });

    expect(sched.id).toBeDefined();
    expect(sched.status).toBe(ScheduleStatus.ACTIVE);
    expect(sched.startTime).toBe("08:00");
    expect(sched.endTime).toBe("14:00");
  });

  it("Test 21: Validation: Reject schedule if startTime >= endTime", async () => {
    const doc = (await docRepo.getDoctors())[0];
    await expect(
      scheduleRepo.createSchedule({
        doctorId: doc.id,
        branchId: "branch-gebang",
        date: "2026-10-16",
        startTime: "14:00",
        endTime: "08:00", // Invalid!
        status: ScheduleStatus.ACTIVE
      })
    ).rejects.toThrow(/waktu mulai harus lebih awal/i);

    // Equal times
    await expect(
      scheduleRepo.createSchedule({
        doctorId: doc.id,
        branchId: "branch-gebang",
        date: "2026-10-16",
        startTime: "09:00",
        endTime: "09:00", // Invalid!
        status: ScheduleStatus.ACTIVE
      })
    ).rejects.toThrow(/waktu mulai harus lebih awal/i);
  });

  it("Test 22: Validation: Reject schedule if doctor is inactive", async () => {
    const doc = (await docRepo.getDoctors())[0];
    await docRepo.updateDoctor(doc.id, { active: false, isActive: false });

    await expect(
      scheduleRepo.createSchedule({
        doctorId: doc.id,
        branchId: "branch-gebang",
        date: "2026-10-17",
        startTime: "08:00",
        endTime: "12:00",
        status: ScheduleStatus.ACTIVE
      })
    ).rejects.toThrow(/berstatus tidak aktif/i);
  });

  it("Test 23: Collision Detection: Reject schedule if doctor already has an overlapping active schedule", async () => {
    const doc = (await docRepo.getDoctors())[0];
    const testDate = "2026-10-20";

    // Schedule 1: 08:00 - 14:00 at Gebang
    await scheduleRepo.createSchedule({
      doctorId: doc.id,
      branchId: "branch-gebang",
      date: testDate,
      startTime: "08:00",
      endTime: "14:00",
      status: ScheduleStatus.ACTIVE
    });

    // Schedule 2 (Overlapping inside): 10:00 - 12:00 -> Reject!
    await expect(
      scheduleRepo.createSchedule({
        doctorId: doc.id,
        branchId: "branch-kampus",
        date: testDate,
        startTime: "10:00",
        endTime: "12:00",
        status: ScheduleStatus.ACTIVE
      })
    ).rejects.toThrow(/bentrok dengan jadwal aktif/i);

    // Schedule 3 (Overlapping start): 07:00 - 09:00 -> Reject!
    await expect(
      scheduleRepo.createSchedule({
        doctorId: doc.id,
        branchId: "branch-lengkong-mumbul",
        date: testDate,
        startTime: "07:00",
        endTime: "09:00",
        status: ScheduleStatus.ACTIVE
      })
    ).rejects.toThrow(/bentrok dengan jadwal aktif/i);

    // Schedule 4 (Overlapping end): 13:00 - 17:00 -> Reject!
    await expect(
      scheduleRepo.createSchedule({
        doctorId: doc.id,
        branchId: "branch-gebang",
        date: testDate,
        startTime: "13:00",
        endTime: "17:00",
        status: ScheduleStatus.ACTIVE
      })
    ).rejects.toThrow(/bentrok dengan jadwal aktif/i);
  });

  it("Test 24: Non-overlapping schedules for the same doctor on the same date are ALLOWED", async () => {
    const doc = (await docRepo.getDoctors())[0];
    const testDate = "2026-10-21";

    // Schedule 1: Morning at Gebang (08:00 - 14:00)
    const morningSched = await scheduleRepo.createSchedule({
      doctorId: doc.id,
      branchId: "branch-gebang",
      date: testDate,
      startTime: "08:00",
      endTime: "14:00",
      status: ScheduleStatus.ACTIVE
    });
    expect(morningSched.id).toBeDefined();

    // Schedule 2: Afternoon at Kampus (15:00 - 21:00) - No overlap!
    const eveningSched = await scheduleRepo.createSchedule({
      doctorId: doc.id,
      branchId: "branch-kampus",
      date: testDate,
      startTime: "15:00",
      endTime: "21:00",
      status: ScheduleStatus.ACTIVE
    });
    expect(eveningSched.id).toBeDefined();
  });

  it("Test 25: Branch Admin cannot create schedule for a different branch", async () => {
    const doc = (await docRepo.getDoctors())[0];
    await expect(
      scheduleRepo.createSchedule(
        {
          doctorId: doc.id,
          branchId: "branch-lengkong-mumbul",
          date: "2026-10-22",
          startTime: "08:00",
          endTime: "12:00",
          status: ScheduleStatus.ACTIVE
        },
        UserRole.BRANCH_ADMIN,
        "branch-gebang"
      )
    ).rejects.toThrow(/hanya dapat membuat jadwal untuk cabangnya/i);
  });

  it("Test 26: Cancelling a schedule marks it as CANCELLED", async () => {
    const doc = (await docRepo.getDoctors())[0];
    const sched = await scheduleRepo.createSchedule({
      doctorId: doc.id,
      branchId: "branch-gebang",
      date: "2026-10-23",
      startTime: "08:00",
      endTime: "12:00",
      status: ScheduleStatus.ACTIVE
    });

    const cancelled = await scheduleRepo.cancelSchedule(sched.id);
    expect(cancelled.status).toBe(ScheduleStatus.CANCELLED);
  });

  it("Test 27: Cancelled schedule frees the time slot without collision rejection", async () => {
    const doc = (await docRepo.getDoctors())[0];
    const testDate = "2026-10-24";

    const sched1 = await scheduleRepo.createSchedule({
      doctorId: doc.id,
      branchId: "branch-gebang",
      date: testDate,
      startTime: "08:00",
      endTime: "12:00",
      status: ScheduleStatus.ACTIVE
    });

    // Cancel the schedule
    await scheduleRepo.cancelSchedule(sched1.id);

    // Creating another schedule at the exact same time slot should now SUCCEED
    const sched2 = await scheduleRepo.createSchedule({
      doctorId: doc.id,
      branchId: "branch-gebang",
      date: testDate,
      startTime: "08:00",
      endTime: "12:00",
      status: ScheduleStatus.ACTIVE
    });

    expect(sched2.id).toBeDefined();
    expect(sched2.status).toBe(ScheduleStatus.ACTIVE);
  });

  // =========================================================================
  // WORK SHIFTS & STAFF ROSTER TESTS (28-32)
  // =========================================================================
  it("Test 28: Can list work shifts per branch (Gebang, Lengkong Mumbul, Kampus)", async () => {
    const gebangShifts = await shiftRepo.getShifts("branch-gebang");
    expect(gebangShifts.length).toBeGreaterThanOrEqual(2);
    expect(gebangShifts.some((s) => s.startTime === "08:00" && s.endTime === "14:00")).toBe(true);

    const lengkongShifts = await shiftRepo.getShifts("branch-lengkong-mumbul");
    expect(lengkongShifts.length).toBeGreaterThanOrEqual(2);
    // Lengkong Mumbul Shift 2 ends at 19:00
    expect(lengkongShifts.some((s) => s.endTime === "19:00")).toBe(true);
  });

  it("Test 29: Can assign work shift to an active staff member on a specific date", async () => {
    const staffList = await staffRepo.getStaff();
    const activeStaff = staffList.find((s) => s.active && s.branchId === "branch-gebang");
    expect(activeStaff).toBeDefined();

    const shifts = await shiftRepo.getShifts("branch-gebang");
    const targetShift = shifts[0];

    const assignment = await staffShiftRepo.assignStaffShift({
      staffId: activeStaff!.id,
      branchId: "branch-gebang",
      shiftId: targetShift.id,
      date: "2026-10-25",
      active: true,
      notes: "Tugas Shift Pagi Poli Gigi"
    });

    expect(assignment.id).toBeDefined();
    expect(assignment.staffId).toBe(activeStaff!.id);
    expect(assignment.shiftId).toBe(targetShift.id);
  });

  it("Test 30: Validation: Reject shift assignment to inactive staff", async () => {
    const staffList = await staffRepo.getStaff();
    const targetStaff = staffList[0];
    await staffRepo.deactivateStaff(targetStaff.id);

    const shifts = await shiftRepo.getShifts("branch-gebang");

    await expect(
      staffShiftRepo.assignStaffShift({
        staffId: targetStaff.id,
        branchId: "branch-gebang",
        shiftId: shifts[0].id,
        date: "2026-10-26",
        active: true
      })
    ).rejects.toThrow(/berstatus tidak aktif/i);
  });

  it("Test 31: Branch Isolation: Branch Admin cannot assign shift in another branch", async () => {
    const staffList = await staffRepo.getStaff();
    const targetStaff = staffList.find((s) => s.active);
    const lengkongShifts = await shiftRepo.getShifts("branch-lengkong-mumbul");

    await expect(
      staffShiftRepo.assignStaffShift(
        {
          staffId: targetStaff!.id,
          branchId: "branch-lengkong-mumbul",
          shiftId: lengkongShifts[0].id,
          date: "2026-10-27",
          active: true
        },
        UserRole.BRANCH_ADMIN,
        "branch-gebang"
      )
    ).rejects.toThrow(/hanya dapat menugaskan shift untuk cabangnya/i);
  });

  it("Test 32: Removing a shift assignment deletes it from the roster", async () => {
    const staffList = await staffRepo.getStaff();
    const targetStaff = staffList.find((s) => s.active && s.branchId === "branch-gebang");
    const shifts = await shiftRepo.getShifts("branch-gebang");

    const assignment = await staffShiftRepo.assignStaffShift({
      staffId: targetStaff!.id,
      branchId: "branch-gebang",
      shiftId: shifts[0].id,
      date: "2026-10-28",
      active: true
    });

    await staffShiftRepo.removeAssignment(assignment.id);

    const remaining = await staffShiftRepo.getAssignments({ date: "2026-10-28" });
    expect(remaining.some((a) => a.id === assignment.id)).toBe(false);
  });
});
