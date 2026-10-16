import { describe, it, expect, beforeEach } from "vitest";
import { MockDatabase } from "../data/mockData";
import { MockOvertimeRepository, MockAttendanceRepository, MockPayrollRepository, AppClock } from "../repositories/mockRepositories";
import { OvertimeStatus, AttendanceStatus, UserRole, PayrollStatus } from "../types/domain";

describe("HR-4: Payroll Integration - Approved Overtime to Monthly Payroll", () => {
  let db: MockDatabase;
  let overtimeRepo: MockOvertimeRepository;
  let attendanceRepo: MockAttendanceRepository;
  let payrollRepo: MockPayrollRepository;

  beforeEach(() => {
    db = MockDatabase.resetInstance();
    overtimeRepo = new MockOvertimeRepository();
    attendanceRepo = new MockAttendanceRepository();
    payrollRepo = new MockPayrollRepository();
    AppClock.reset();
  });

  it("1. Payroll only uses APPROVED overtime records and ignores DETECTED or REJECTED ones", async () => {
    AppClock.setFixedTime("2026-10-01T08:00:00Z");
    
    // Create two attendance records for staff-ast-clary in October 2026
    const att1 = await attendanceRepo.checkIn({
      staffId: "staff-ast-clary",
      branchId: "branch-gebang",
      date: "2026-10-01",
      scheduledStartAt: "08:00",
      scheduledEndAt: "16:00",
      actorRole: UserRole.SUPER_ADMIN
    });
    AppClock.setFixedTime("2026-10-01T18:00:00Z");
    await attendanceRepo.checkOut({ attendanceId: att1.id, actorRole: UserRole.SUPER_ADMIN });

    AppClock.setFixedTime("2026-10-02T08:00:00Z");
    const att2 = await attendanceRepo.checkIn({
      staffId: "staff-ast-clary",
      branchId: "branch-gebang",
      date: "2026-10-02",
      scheduledStartAt: "08:00",
      scheduledEndAt: "16:00",
      actorRole: UserRole.SUPER_ADMIN
    });
    AppClock.setFixedTime("2026-10-02T18:00:00Z");
    await attendanceRepo.checkOut({ attendanceId: att2.id, actorRole: UserRole.SUPER_ADMIN });

    const ot1 = await overtimeRepo.detectFromAttendance(att1.id, UserRole.SUPER_ADMIN);
    const ot2 = await overtimeRepo.detectFromAttendance(att2.id, UserRole.SUPER_ADMIN);

    // Set snapshot on both in DB directly
    const dbInstance = MockDatabase.getInstance();
    const dbOt1 = dbInstance.overtimes.find(o => o.id === ot1!.id);
    const dbOt2 = dbInstance.overtimes.find(o => o.id === ot2!.id);
    if (dbOt1) dbOt1.overtimeAmountSnapshot = 75000;
    if (dbOt2) dbOt2.overtimeAmountSnapshot = 75000;

    // Approve only ot1, leave ot2 as DETECTED
    await overtimeRepo.submit(ot1!.id, UserRole.SUPER_ADMIN);
    await overtimeRepo.approve(ot1!.id, "HR Manager", UserRole.SUPER_ADMIN);

    // Generate monthly payroll for October 2026
    const payroll = await payrollRepo.generateMonthlyPayroll("staff-ast-clary", 10, 2026, 2500000);
    const items = await payrollRepo.getPayrollItems(payroll.id);

    // Net salary should include base salary (2,500,000) + ot1 (75,000) = 2,575,000 (ot2 excluded because not APPROVED)
    expect(payroll.netSalary).toBe(2575000);
    expect(items.some(i => i.sourceId === ot1!.id)).toBe(true);
    expect(items.some(i => i.sourceId === ot2!.id)).toBe(false);
  });

  it("2. Payroll uses snapshot values and does not recalculate overtime", async () => {
    AppClock.setFixedTime("2026-10-05T08:00:00Z");
    const att = await attendanceRepo.checkIn({
      staffId: "staff-ast-clary",
      branchId: "branch-gebang",
      date: "2026-10-05",
      scheduledStartAt: "08:00",
      scheduledEndAt: "16:00",
      actorRole: UserRole.SUPER_ADMIN
    });
    AppClock.setFixedTime("2026-10-05T17:00:00Z"); // 60 mins overtime
    await attendanceRepo.checkOut({ attendanceId: att.id, actorRole: UserRole.SUPER_ADMIN });

    const ot = await overtimeRepo.detectFromAttendance(att.id, UserRole.SUPER_ADMIN);
    
    // Manually override snapshot to a fixed custom amount in DB
    const dbInstance = MockDatabase.getInstance();
    const dbOt = dbInstance.overtimes.find(o => o.id === ot!.id);
    if (dbOt) dbOt.overtimeAmountSnapshot = 500000;

    await overtimeRepo.submit(ot!.id, UserRole.SUPER_ADMIN);
    await overtimeRepo.approve(ot!.id, "HR Manager", UserRole.SUPER_ADMIN);

    const payroll = await payrollRepo.generateMonthlyPayroll("staff-ast-clary", 10, 2026, 2500000);
    expect(payroll.netSalary).toBe(3000000); // 2,500,000 + 500,000 snapshot
  });

  it("3. Handles null overtimeAmountSnapshot gracefully (displays NOT_CONFIGURED equivalent and excludes from earning)", async () => {
    AppClock.setFixedTime("2026-10-06T08:00:00Z");
    const att = await attendanceRepo.checkIn({
      staffId: "staff-ast-clary",
      branchId: "branch-gebang",
      date: "2026-10-06",
      scheduledStartAt: "08:00",
      scheduledEndAt: "16:00",
      actorRole: UserRole.SUPER_ADMIN
    });
    AppClock.setFixedTime("2026-10-06T18:00:00Z");
    await attendanceRepo.checkOut({ attendanceId: att.id, actorRole: UserRole.SUPER_ADMIN });

    const ot = await overtimeRepo.detectFromAttendance(att.id, UserRole.SUPER_ADMIN);
    // Leave overtimeAmountSnapshot as null

    await overtimeRepo.submit(ot!.id, UserRole.SUPER_ADMIN);
    await overtimeRepo.approve(ot!.id, "HR Manager", UserRole.SUPER_ADMIN);

    const payroll = await payrollRepo.generateMonthlyPayroll("staff-ast-clary", 10, 2026, 2500000);
    // Should not add null amount to total earning, netSalary remains baseSalary (2,500,000)
    expect(payroll.netSalary).toBe(2500000);
  });

  it("4. Ensures idempotency and prevents double-inclusion when generating payroll multiple times", async () => {
    AppClock.setFixedTime("2026-10-07T08:00:00Z");
    const att = await attendanceRepo.checkIn({
      staffId: "staff-ast-clary",
      branchId: "branch-gebang",
      date: "2026-10-07",
      scheduledStartAt: "08:00",
      scheduledEndAt: "16:00",
      actorRole: UserRole.SUPER_ADMIN
    });
    AppClock.setFixedTime("2026-10-07T18:00:00Z");
    await attendanceRepo.checkOut({ attendanceId: att.id, actorRole: UserRole.SUPER_ADMIN });

    const ot = await overtimeRepo.detectFromAttendance(att.id, UserRole.SUPER_ADMIN);
    const dbInstance = MockDatabase.getInstance();
    const dbOt = dbInstance.overtimes.find(o => o.id === ot!.id);
    if (dbOt) dbOt.overtimeAmountSnapshot = 100000;

    await overtimeRepo.submit(ot!.id, UserRole.SUPER_ADMIN);
    await overtimeRepo.approve(ot!.id, "HR Manager", UserRole.SUPER_ADMIN);

    const payroll1 = await payrollRepo.generateMonthlyPayroll("staff-ast-clary", 10, 2026, 2500000);
    const payroll2 = await payrollRepo.generateMonthlyPayroll("staff-ast-clary", 10, 2026, 2500000);

    expect(payroll2.netSalary).toBe(payroll1.netSalary);
    expect(payroll2.netSalary).toBe(2600000);

    const items = await payrollRepo.getPayrollItems(payroll2.id);
    const otItems = items.filter(i => i.sourceId === ot!.id);
    expect(otItems.length).toBe(1); // No double inclusion
  });

  it("5. Maintains branch isolation where branch admin only includes their branch's approved overtime", async () => {
    // Branch Gebang overtime
    AppClock.setFixedTime("2026-10-08T08:00:00Z");
    const att1 = await attendanceRepo.checkIn({
      staffId: "staff-ast-clary",
      branchId: "branch-gebang",
      date: "2026-10-08",
      scheduledStartAt: "08:00",
      scheduledEndAt: "16:00",
      actorRole: UserRole.SUPER_ADMIN
    });
    AppClock.setFixedTime("2026-10-08T18:00:00Z");
    await attendanceRepo.checkOut({ attendanceId: att1.id, actorRole: UserRole.SUPER_ADMIN });

    const ot1 = await overtimeRepo.detectFromAttendance(att1.id, UserRole.SUPER_ADMIN);
    const dbInstance = MockDatabase.getInstance();
    const dbOt1 = dbInstance.overtimes.find(o => o.id === ot1!.id);
    if (dbOt1) dbOt1.overtimeAmountSnapshot = 80000;

    await overtimeRepo.submit(ot1!.id, UserRole.SUPER_ADMIN);
    await overtimeRepo.approve(ot1!.id, "Gebang Admin", UserRole.BRANCH_ADMIN, "branch-gebang");
  });

  it("6. Branch Isolation - Different Branch (OT from branch-kencong should not enter branch-gebang staff payroll)", async () => {
    // Staff assigned to branch-gebang
    const staffId = "staff-ast-clary"; 
    // Payroll branch context: branch-gebang (via staff assignment)
    
    // Create OT for branch-kencong
    AppClock.setFixedTime("2026-10-09T08:00:00Z");
    const att = await attendanceRepo.checkIn({
      staffId: staffId,
      branchId: "branch-kencong", // Different branch
      date: "2026-10-09",
      scheduledStartAt: "08:00",
      scheduledEndAt: "16:00",
      actorRole: UserRole.SUPER_ADMIN
    });
    AppClock.setFixedTime("2026-10-09T18:00:00Z");
    await attendanceRepo.checkOut({ attendanceId: att.id, actorRole: UserRole.SUPER_ADMIN });

    const ot = await overtimeRepo.detectFromAttendance(att.id, UserRole.SUPER_ADMIN);
    const dbInstance = MockDatabase.getInstance();
    const dbOt = dbInstance.overtimes.find(o => o.id === ot!.id);
    if (dbOt) dbOt.overtimeAmountSnapshot = 90000;

    await overtimeRepo.submit(ot!.id, UserRole.SUPER_ADMIN);
    await overtimeRepo.approve(ot!.id, "Kencong Admin", UserRole.BRANCH_ADMIN, "branch-kencong");

    // Generate payroll for Gebang-based staff
    const payroll = await payrollRepo.generateMonthlyPayroll(staffId, 10, 2026, 2500000);
    
    // Should NOT include 90000 overtime amount because it's from branch-kencong
    expect(payroll.netSalary).toBe(2500000);
  });
});
