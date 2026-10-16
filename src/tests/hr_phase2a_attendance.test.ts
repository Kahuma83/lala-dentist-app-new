import { describe, it, expect, beforeEach } from "vitest";
import { MockDatabase } from "../data/mockData";
import {
  MockAttendanceRepository,
  MockStaffRepository,
  MockDoctorScheduleRepository,
  MockWorkShiftRepository,
  MockStaffShiftAssignmentRepository,
  AppClock
} from "../repositories/mockRepositories";
import {
  AttendanceStatus,
  AttendanceMethod,
  UserRole,
  EmploymentStatus,
  ScheduleStatus
} from "../types/domain";

describe("PHASE HR-2A — Attendance Core", () => {
  let attendanceRepo: MockAttendanceRepository;
  let staffRepo: MockStaffRepository;
  let doctorScheduleRepo: MockDoctorScheduleRepository;
  let workShiftRepo: MockWorkShiftRepository;
  let staffShiftRepo: MockStaffShiftAssignmentRepository;

  beforeEach(() => {
    MockDatabase.resetInstance();
    attendanceRepo = new MockAttendanceRepository();
    staffRepo = new MockStaffRepository();
    doctorScheduleRepo = new MockDoctorScheduleRepository();
    workShiftRepo = new MockWorkShiftRepository();
    staffShiftRepo = new MockStaffShiftAssignmentRepository();
    AppClock.reset();
  });

  // 1. Create attendance directly / via repository
  it("Scenario 01: dapat membuat attendance record baru", async () => {
    AppClock.setFixedTime("2026-09-22T07:50:00Z");
    const att = await attendanceRepo.checkIn({
      staffId: "staff-adm-gebang",
      branchId: "branch-gebang",
      date: "2026-09-22",
      scheduledStartAt: "08:00",
      scheduledEndAt: "14:00"
    });

    expect(att).toBeDefined();
    expect(att.id).toBeTruthy();
    expect(att.staffId).toBe("staff-adm-gebang");
    expect(att.branchId).toBe("branch-gebang");
    expect(att.date).toBe("2026-09-22");
  });

  // 2. Check-in berhasil
  it("Scenario 02: check-in berhasil dan mencatat waktu check-in", async () => {
    AppClock.setFixedTime("2026-09-22T07:55:00Z");
    const att = await attendanceRepo.checkIn({
      staffId: "staff-ast-clary",
      branchId: "branch-gebang",
      date: "2026-09-22",
      scheduledStartAt: "08:00",
      scheduledEndAt: "14:00",
      photoPath: "attendance/clary_checkin.jpg",
      method: AttendanceMethod.WEB
    });

    expect(att.actualCheckInAt).toBe("2026-09-22T07:55:00Z");
    expect(att.checkInPhotoPath).toBe("attendance/clary_checkin.jpg");
    expect(att.checkInMethod).toBe(AttendanceMethod.WEB);
    expect(att.attendanceStatus).toBe(AttendanceStatus.PRESENT);
  });

  // 3. Check-out berhasil
  it("Scenario 03: check-out berhasil dan mencatat waktu checkout", async () => {
    AppClock.setFixedTime("2026-09-22T07:55:00Z");
    const checkedIn = await attendanceRepo.checkIn({
      staffId: "staff-ast-clary",
      branchId: "branch-gebang",
      date: "2026-09-22",
      scheduledStartAt: "08:00",
      scheduledEndAt: "14:00"
    });

    AppClock.setFixedTime("2026-09-22T14:05:00Z");
    const checkedOut = await attendanceRepo.checkOut({
      attendanceId: checkedIn.id,
      photoPath: "attendance/clary_checkout.jpg"
    });

    expect(checkedOut.actualCheckOutAt).toBe("2026-09-22T14:05:00Z");
    expect(checkedOut.checkOutPhotoPath).toBe("attendance/clary_checkout.jpg");
    expect(checkedOut.earlyCheckoutMinutes).toBe(0);
  });

  // 4. Duplicate check-in ditolak
  it("Scenario 04: duplicate check-in ditolak secara aman", async () => {
    AppClock.setFixedTime("2026-09-22T07:55:00Z");
    await attendanceRepo.checkIn({
      staffId: "staff-adm-gebang",
      branchId: "branch-gebang",
      date: "2026-09-22",
      scheduledStartAt: "08:00",
      scheduledEndAt: "14:00"
    });

    await expect(
      attendanceRepo.checkIn({
        staffId: "staff-adm-gebang",
        branchId: "branch-gebang",
        date: "2026-09-22",
        scheduledStartAt: "08:00",
        scheduledEndAt: "14:00"
      })
    ).rejects.toThrow(/sudah melakukan absensi/i);
  });

  // 5. Duplicate checkout ditolak
  it("Scenario 05: duplicate checkout ditolak secara aman", async () => {
    AppClock.setFixedTime("2026-09-22T07:55:00Z");
    const att = await attendanceRepo.checkIn({
      staffId: "staff-adm-gebang",
      branchId: "branch-gebang",
      date: "2026-09-22",
      scheduledStartAt: "08:00",
      scheduledEndAt: "14:00"
    });

    AppClock.setFixedTime("2026-09-22T14:00:00Z");
    await attendanceRepo.checkOut({ attendanceId: att.id });

    // Panggilan checkout kedua
    await expect(
      attendanceRepo.checkOut({ attendanceId: att.id })
    ).rejects.toThrow(/sudah melakukan checkout/i);
  });

  // 6. Checkout tanpa check-in ditolak
  it("Scenario 06: checkout tanpa check-in ditolak", async () => {
    // Buat absensi tanpa check-in (misal SICK)
    const absence = await attendanceRepo.createAbsence({
      staffId: "staff-adm-gebang",
      date: "2026-09-23",
      attendanceStatus: AttendanceStatus.SICK,
      notes: "Demam tinggi"
    });

    await expect(
      attendanceRepo.checkOut({ attendanceId: absence.id })
    ).rejects.toThrow(/tanpa check-in/i);
  });

  // 7. Checkout sebelum check-in ditolak
  it("Scenario 07: checkout sebelum waktu check-in ditolak", async () => {
    const att = await attendanceRepo.checkIn({
      staffId: "staff-adm-gebang",
      branchId: "branch-gebang",
      date: "2026-09-22",
      checkInTime: "08:15",
      scheduledStartAt: "08:00",
      scheduledEndAt: "14:00"
    });

    await expect(
      attendanceRepo.checkOut({
        attendanceId: att.id,
        checkOutTime: "08:00"
      })
    ).rejects.toThrow(/sebelum waktu check-in/i);
  });

  // 8. Staff menggunakan WorkShift yang benar
  it("Scenario 08: staff otomatis mengambil jadwal dari StaffShiftAssignment -> WorkShift", async () => {
    // Assign shift ke staff-ast-clary pada tanggal 2026-09-25
    await staffShiftRepo.assignStaffShift({
      staffId: "staff-ast-clary",
      branchId: "branch-gebang",
      shiftId: "shift-geb-2", // 14:00 - 21:00
      date: "2026-09-25",
      active: true
    });

    const att = await attendanceRepo.checkIn({
      staffId: "staff-ast-clary",
      date: "2026-09-25",
      checkInTime: "13:55"
    });

    expect(att.scheduledStartAt).toBe("14:00");
    expect(att.scheduledEndAt).toBe("21:00");
    expect(att.branchId).toBe("branch-gebang");
    expect(att.lateMinutes).toBe(0);
    expect(att.attendanceStatus).toBe(AttendanceStatus.PRESENT);
  });

  // 9. Doctor menggunakan DoctorSchedule yang benar
  it("Scenario 09: doctor otomatis mengambil jadwal dari DoctorSchedule", async () => {
    // Buat schedule baru untuk drg. Yuni di Kencong pada 2026-09-26 (08:00 - 13:00)
    await doctorScheduleRepo.createSchedule({
      doctorId: "doc-yuni",
      branchId: "branch-kencong",
      date: "2026-09-26",
      startTime: "08:00",
      endTime: "13:00",
      status: ScheduleStatus.ACTIVE
    });

    const att = await attendanceRepo.checkIn({
      staffId: "doc-yuni",
      date: "2026-09-26",
      checkInTime: "07:58"
    });

    expect(att.staffId).toBe("staff-doc-yuni");
    expect(att.branchId).toBe("branch-kencong");
    expect(att.scheduledStartAt).toBe("08:00");
    expect(att.scheduledEndAt).toBe("13:00");
    expect(att.attendanceStatus).toBe(AttendanceStatus.PRESENT);
  });

  // 10. Scheduled start/end tersimpan sebagai snapshot
  it("Scenario 10: scheduled start/end tersimpan sebagai snapshot", async () => {
    const att = await attendanceRepo.checkIn({
      staffId: "staff-adm-gebang",
      branchId: "branch-gebang",
      date: "2026-09-27",
      scheduledStartAt: "08:00",
      scheduledEndAt: "14:00",
      checkInTime: "07:55"
    });

    expect(att.scheduledStartAt).toBe("08:00");
    expect(att.scheduledEndAt).toBe("14:00");
  });

  // 11. Perubahan shift setelah attendance tidak mengubah snapshot
  it("Scenario 11: perubahan WorkShift setelah attendance tidak mengubah historical snapshot", async () => {
    // 1. Assign shift-geb-1 (08:00 - 14:00)
    await staffShiftRepo.assignStaffShift({
      staffId: "staff-ast-clary",
      branchId: "branch-gebang",
      shiftId: "shift-geb-1",
      date: "2026-09-28",
      active: true
    });

    // 2. Staff check-in
    const att = await attendanceRepo.checkIn({
      staffId: "staff-ast-clary",
      date: "2026-09-28",
      checkInTime: "07:55"
    });
    expect(att.scheduledStartAt).toBe("08:00");
    expect(att.scheduledEndAt).toBe("14:00");

    // 3. Admin mengubah shift-geb-1 menjadi 09:00 - 15:00
    await workShiftRepo.updateShift("shift-geb-1", {
      startTime: "09:00",
      endTime: "15:00"
    });

    // 4. Historical attendance tetap tidak berubah!
    const attAfter = await attendanceRepo.getById(att.id);
    expect(attAfter?.scheduledStartAt).toBe("08:00");
    expect(attAfter?.scheduledEndAt).toBe("14:00");
  });

  // 12. Perubahan doctor schedule setelah attendance tidak mengubah snapshot
  it("Scenario 12: perubahan DoctorSchedule setelah attendance tidak mengubah historical snapshot", async () => {
    const sched = await doctorScheduleRepo.createSchedule({
      doctorId: "doc-syafira",
      branchId: "branch-gebang",
      date: "2026-09-29",
      startTime: "08:00",
      endTime: "13:00",
      status: ScheduleStatus.ACTIVE
    });

    const att = await attendanceRepo.checkIn({
      staffId: "doc-syafira",
      date: "2026-09-29",
      checkInTime: "08:00"
    });

    expect(att.scheduledStartAt).toBe("08:00");
    expect(att.scheduledEndAt).toBe("13:00");

    // Update doctor schedule kemudian
    await doctorScheduleRepo.updateSchedule(sched.id, {
      startTime: "10:00",
      endTime: "16:00"
    });

    const attAfter = await attendanceRepo.getById(att.id);
    expect(attAfter?.scheduledStartAt).toBe("08:00");
    expect(attAfter?.scheduledEndAt).toBe("13:00");
  });

  // 13. Check-in tepat waktu = PRESENT
  it("Scenario 13: check-in tepat waktu menghasilkan status PRESENT", async () => {
    const att = await attendanceRepo.checkIn({
      staffId: "staff-adm-gebang",
      branchId: "branch-gebang",
      date: "2026-09-30",
      scheduledStartAt: "08:00",
      scheduledEndAt: "14:00",
      checkInTime: "08:00"
    });

    expect(att.lateMinutes).toBe(0);
    expect(att.attendanceStatus).toBe(AttendanceStatus.PRESENT);
  });

  // 14. Check-in terlambat = LATE
  it("Scenario 14: check-in terlambat menghasilkan status LATE dan lateMinutes akurat", async () => {
    const att = await attendanceRepo.checkIn({
      staffId: "staff-adm-gebang",
      branchId: "branch-gebang",
      date: "2026-09-30",
      scheduledStartAt: "08:00",
      scheduledEndAt: "14:00",
      checkInTime: "08:14"
    });

    expect(att.lateMinutes).toBe(14);
    expect(att.attendanceStatus).toBe(AttendanceStatus.LATE);
  });

  // 15. Early check-in tidak menghasilkan overtime
  it("Scenario 15: early check-in (datang lebih awal) tidak menghasilkan overtime", async () => {
    const att = await attendanceRepo.checkIn({
      staffId: "staff-adm-gebang",
      branchId: "branch-gebang",
      date: "2026-09-30",
      scheduledStartAt: "08:00",
      scheduledEndAt: "14:00",
      checkInTime: "07:30"
    });

    expect(att.lateMinutes).toBe(0);
    expect(att.attendanceStatus).toBe(AttendanceStatus.PRESENT);
    expect((att as any).overtimeMinutes).toBeUndefined();
    expect((att as any).overtimePay).toBeUndefined();
  });

  // 16. lateMinutes dihitung benar
  it("Scenario 16: formula lateMinutes = max(0, actualCheckInAt - scheduledStartAt)", async () => {
    const att1 = await attendanceRepo.checkIn({
      staffId: "staff-adm-gebang",
      branchId: "branch-gebang",
      date: "2026-10-01",
      scheduledStartAt: "08:00",
      scheduledEndAt: "14:00",
      checkInTime: "08:45"
    });
    expect(att1.lateMinutes).toBe(45);

    const att2 = await attendanceRepo.checkIn({
      staffId: "staff-ast-clary",
      branchId: "branch-gebang",
      date: "2026-10-01",
      scheduledStartAt: "08:00",
      scheduledEndAt: "14:00",
      checkInTime: "07:59"
    });
    expect(att2.lateMinutes).toBe(0);
  });

  // 17. Checkout tepat waktu
  it("Scenario 17: checkout tepat waktu menghasilkan earlyCheckoutMinutes = 0", async () => {
    const att = await attendanceRepo.checkIn({
      staffId: "staff-adm-gebang",
      branchId: "branch-gebang",
      date: "2026-10-02",
      scheduledStartAt: "08:00",
      scheduledEndAt: "14:00",
      checkInTime: "08:00"
    });

    const out = await attendanceRepo.checkOut({
      attendanceId: att.id,
      checkOutTime: "14:00"
    });

    expect(out.earlyCheckoutMinutes).toBe(0);
  });

  // 18. Early checkout dihitung
  it("Scenario 18: early checkout mencatat menit pulang lebih awal secara tepat", async () => {
    const att = await attendanceRepo.checkIn({
      staffId: "staff-adm-gebang",
      branchId: "branch-gebang",
      date: "2026-10-02",
      scheduledStartAt: "08:00",
      scheduledEndAt: "14:00",
      checkInTime: "08:00"
    });

    const out = await attendanceRepo.checkOut({
      attendanceId: att.id,
      checkOutTime: "13:30" // 30 menit sebelum 14:00
    });

    expect(out.earlyCheckoutMinutes).toBe(30);
  });

  // 19. Late checkout tetap hanya dicatat sebagai actual checkout
  it("Scenario 19: late checkout (pulang terlambat) tetap dicatat sebagai fakta tanpa deduction/overtime", async () => {
    const att = await attendanceRepo.checkIn({
      staffId: "staff-adm-gebang",
      branchId: "branch-gebang",
      date: "2026-10-02",
      scheduledStartAt: "08:00",
      scheduledEndAt: "14:00",
      checkInTime: "08:00"
    });

    const out = await attendanceRepo.checkOut({
      attendanceId: att.id,
      checkOutTime: "16:10" // Lewat 2 jam 10 menit
    });

    expect(out.actualCheckOutAt).toBe("16:10");
    expect(out.earlyCheckoutMinutes).toBe(0);
  });

  // 20. Jangan menghitung uang overtime
  it("Scenario 20: core attendance tidak menghitung uang overtime atau penalti payroll", async () => {
    const att = await attendanceRepo.checkIn({
      staffId: "staff-adm-gebang",
      branchId: "branch-gebang",
      date: "2026-10-03",
      scheduledStartAt: "08:00",
      scheduledEndAt: "14:00",
      checkInTime: "07:00"
    });

    const out = await attendanceRepo.checkOut({
      attendanceId: att.id,
      checkOutTime: "18:00"
    });

    expect((out as any).overtimeAmount).toBeUndefined();
    expect((out as any).payrollDeduction).toBeUndefined();
  });

  // 21. SICK tanpa check-in valid
  it("Scenario 21: attendance status SICK tidak memiliki check-in/checkout", async () => {
    const sick = await attendanceRepo.createAbsence({
      staffId: "staff-adm-gebang",
      date: "2026-10-04",
      attendanceStatus: AttendanceStatus.SICK,
      notes: "Sakit flu surat dokter terlampir"
    });

    expect(sick.attendanceStatus).toBe(AttendanceStatus.SICK);
    expect(sick.actualCheckInAt).toBeNull();
    expect(sick.actualCheckOutAt).toBeNull();
    expect(sick.lateMinutes).toBe(0);
    expect(sick.earlyCheckoutMinutes).toBe(0);
  });

  // 22. LEAVE tanpa check-in valid
  it("Scenario 22: attendance status LEAVE tidak memiliki check-in/checkout", async () => {
    const leave = await attendanceRepo.createAbsence({
      staffId: "staff-ast-clary",
      date: "2026-10-04",
      attendanceStatus: AttendanceStatus.LEAVE,
      notes: "Cuti tahunan disetujui"
    });

    expect(leave.attendanceStatus).toBe(AttendanceStatus.LEAVE);
    expect(leave.actualCheckInAt).toBeNull();
    expect(leave.actualCheckOutAt).toBeNull();
  });

  // 23. OFF tanpa check-in valid
  it("Scenario 23: attendance status OFF untuk hari libur yang dicatat", async () => {
    const off = await attendanceRepo.createAbsence({
      staffId: "staff-ob-gebang",
      date: "2026-10-04",
      attendanceStatus: AttendanceStatus.OFF,
      notes: "Hari libur mingguan"
    });

    expect(off.attendanceStatus).toBe(AttendanceStatus.OFF);
    expect(off.actualCheckInAt).toBeNull();
  });

  // 24. ABSENT hanya jika scheduled
  it("Scenario 24: ABSENT hanya dapat ditetapkan jika staff memang dijadwalkan bekerja", async () => {
    // 1. Staff TIDAK dijadwalkan pada 2026-10-05 -> harus ditolak
    await expect(
      attendanceRepo.createAbsence({
        staffId: "staff-ast-clary",
        date: "2026-10-05",
        attendanceStatus: AttendanceStatus.ABSENT,
        notes: "Mangkir tanpa kabar"
      })
    ).rejects.toThrow(/hanya dapat ditetapkan jika staff memiliki jadwal/i);

    // 2. Sekarang beri jadwal shift pada 2026-10-05
    await staffShiftRepo.assignStaffShift({
      staffId: "staff-ast-clary",
      branchId: "branch-gebang",
      shiftId: "shift-geb-1",
      date: "2026-10-05",
      active: true
    });

    // 3. Sekarang penetapan ABSENT berhasil dan snapshot jam shift tersimpan
    const absent = await attendanceRepo.createAbsence({
      staffId: "staff-ast-clary",
      date: "2026-10-05",
      attendanceStatus: AttendanceStatus.ABSENT,
      notes: "Mangkir tidak hadir tanpa keterangan"
    });

    expect(absent.attendanceStatus).toBe(AttendanceStatus.ABSENT);
    expect(absent.scheduledStartAt).toBe("08:00");
    expect(absent.scheduledEndAt).toBe("14:00");
    expect(absent.actualCheckInAt).toBeNull();
  });

  // 25. OB tanpa UserAccount dapat attendance
  it("Scenario 25: staff seperti OB tanpa userAccountId tetap dapat dicatat attendancenya", async () => {
    const ob = await staffRepo.getStaffById("staff-ob-gebang");
    expect(ob?.userAccountId).toBeNull(); // Memastikan OB tidak punya akun login

    // Assign shift untuk OB
    await staffShiftRepo.assignStaffShift({
      staffId: "staff-ob-gebang",
      branchId: "branch-gebang",
      shiftId: "shift-geb-1",
      date: "2026-10-06",
      active: true
    });

    const att = await attendanceRepo.checkIn({
      staffId: "staff-ob-gebang",
      date: "2026-10-06",
      checkInTime: "07:35"
    });

    expect(att.staffId).toBe("staff-ob-gebang");
    expect(att.attendanceStatus).toBe(AttendanceStatus.PRESENT);
  });

  // 26. Inactive staff tidak dapat membuat attendance baru
  it("Scenario 26: staff berstatus INACTIVE ditolak saat check-in atau pencatatan absensi", async () => {
    // Nonaktifkan staff
    await staffRepo.updateStaff("staff-ob-gebang", {
      active: false,
      employmentStatus: EmploymentStatus.INACTIVE
    });

    await expect(
      attendanceRepo.checkIn({
        staffId: "staff-ob-gebang",
        branchId: "branch-gebang",
        date: "2026-10-07",
        scheduledStartAt: "08:00",
        scheduledEndAt: "14:00"
      })
    ).rejects.toThrow(/tidak aktif/i);

    await expect(
      attendanceRepo.createAbsence({
        staffId: "staff-ob-gebang",
        date: "2026-10-07",
        attendanceStatus: AttendanceStatus.SICK
      })
    ).rejects.toThrow(/tidak aktif/i);
  });

  // 27. Staff branch isolation
  it("Scenario 27: Branch Admin tidak dapat check-in staff cabang lain", async () => {
    // Branch Admin Gebang mencoba check-in staff Kencong
    await expect(
      attendanceRepo.checkIn(
        {
          staffId: "staff-adm-kencong",
          branchId: "branch-kencong",
          date: "2026-10-08",
          scheduledStartAt: "08:00",
          scheduledEndAt: "14:00"
        },
        UserRole.BRANCH_ADMIN,
        "branch-gebang"
      )
    ).rejects.toThrow(/cabang/i);
  });

  // 28. Branch Admin tidak dapat melihat cabang lain
  it("Scenario 28: Branch Admin terisolasi hanya dapat melihat data absensi cabangnya", async () => {
    const gebangList = await attendanceRepo.list(
      undefined,
      UserRole.BRANCH_ADMIN,
      "branch-gebang"
    );

    // Semua data yang dikembalikan harus dari branch-gebang
    expect(gebangList.length).toBeGreaterThan(0);
    gebangList.forEach(a => {
      expect(a.branchId).toBe("branch-gebang");
    });

    // Coba minta branch lain secara eksplisit, tetap dipaksa ke cabangnya
    const forcedList = await attendanceRepo.list(
      { branchId: "branch-kencong" },
      UserRole.BRANCH_ADMIN,
      "branch-gebang"
    );
    forcedList.forEach(a => {
      expect(a.branchId).toBe("branch-gebang");
    });
  });

  // 29. Super Admin dapat melihat semua
  it("Scenario 29: Super Admin dapat melihat seluruh attendance lintas cabang", async () => {
    const allList = await attendanceRepo.list(
      undefined,
      UserRole.SUPER_ADMIN,
      null
    );

    const branchIds = new Set(allList.map(a => a.branchId));
    expect(branchIds.has("branch-gebang")).toBe(true);
    expect(branchIds.has("branch-kencong")).toBe(true);
  });

  // 30. Doctor hanya melihat attendance yang diizinkan
  it("Scenario 30: role Doctor dengan staffId hanya melihat kehadiran miliknya", async () => {
    const docAttendances = await attendanceRepo.list(
      undefined,
      UserRole.DOCTOR,
      "branch-gebang",
      "staff-doc-syafira"
    );

    expect(docAttendances.length).toBeGreaterThan(0);
    docAttendances.forEach(a => {
      expect(a.staffId).toBe("staff-doc-syafira");
    });
  });

  // 31. Duplicate check-in tidak membuat record kedua
  it("Scenario 31: duplicate check-in tidak menambah jumlah record di database", async () => {
    const initialCount = (await attendanceRepo.list()).length;

    await attendanceRepo.checkIn({
      staffId: "staff-adm-gebang",
      branchId: "branch-gebang",
      date: "2026-10-09",
      scheduledStartAt: "08:00",
      scheduledEndAt: "14:00"
    });

    expect((await attendanceRepo.list()).length).toBe(initialCount + 1);

    // Panggilan kedua gagal
    try {
      await attendanceRepo.checkIn({
        staffId: "staff-adm-gebang",
        branchId: "branch-gebang",
        date: "2026-10-09",
        scheduledStartAt: "08:00",
        scheduledEndAt: "14:00"
      });
    } catch (e) {
      // expected error
    }

    // Record tetap bertambah 1 saja
    expect((await attendanceRepo.list()).length).toBe(initialCount + 1);
  });

  // 32. Duplicate checkout tidak overwrite data pertama
  it("Scenario 32: percobaan duplicate checkout tidak meng-overwrite timestamp checkout pertama", async () => {
    const att = await attendanceRepo.checkIn({
      staffId: "staff-adm-gebang",
      branchId: "branch-gebang",
      date: "2026-10-10",
      scheduledStartAt: "08:00",
      scheduledEndAt: "14:00",
      checkInTime: "08:00"
    });

    // Checkout pertama pada 14:05
    await attendanceRepo.checkOut({
      attendanceId: att.id,
      checkOutTime: "14:05"
    });

    // Percobaan checkout kedua pada 17:00
    try {
      await attendanceRepo.checkOut({
        attendanceId: att.id,
        checkOutTime: "17:00"
      });
    } catch (e) {
      // expected error
    }

    const fetched = await attendanceRepo.getById(att.id);
    expect(fetched?.actualCheckOutAt).toBe("14:05");
  });

  // 33. Doctor multi-branch schedule check-in
  it("Scenario 33: dokter yang berpraktik di beberapa cabang check-in sesuai jadwal spesifik cabang", async () => {
    // Buat jadwal untuk drg. Yuni di Gebang jam 08:00-12:00 dan di Ambulu jam 13:00-17:00 pada tanggal yang sama
    await doctorScheduleRepo.createSchedule({
      doctorId: "doc-yuni",
      branchId: "branch-gebang",
      date: "2026-10-11",
      startTime: "08:00",
      endTime: "12:00",
      status: ScheduleStatus.ACTIVE
    });

    const att = await attendanceRepo.checkIn({
      staffId: "doc-yuni",
      branchId: "branch-gebang",
      date: "2026-10-11",
      checkInTime: "07:55"
    });

    expect(att.branchId).toBe("branch-gebang");
    expect(att.scheduledStartAt).toBe("08:00");
    expect(att.scheduledEndAt).toBe("12:00");
  });

  // 34. Photo metadata path persistence
  it("Scenario 34: menyimpan path foto check-in dan check-out dengan benar", async () => {
    const inPhoto = "uploads/attendance/20261012_checkin.png";
    const outPhoto = "uploads/attendance/20261012_checkout.png";

    const att = await attendanceRepo.checkIn({
      staffId: "staff-adm-gebang",
      branchId: "branch-gebang",
      date: "2026-10-12",
      scheduledStartAt: "08:00",
      scheduledEndAt: "14:00",
      photoPath: inPhoto
    });

    expect(att.checkInPhotoPath).toBe(inPhoto);

    const out = await attendanceRepo.checkOut({
      attendanceId: att.id,
      photoPath: outPhoto
    });

    expect(out.checkInPhotoPath).toBe(inPhoto);
    expect(out.checkOutPhotoPath).toBe(outPhoto);
  });

  // 35. Attendance filtering by date range & status
  it("Scenario 35: filter attendance berdasarkan rentang tanggal dan status", async () => {
    await attendanceRepo.checkIn({
      staffId: "staff-adm-gebang",
      branchId: "branch-gebang",
      date: "2026-10-15",
      scheduledStartAt: "08:00",
      scheduledEndAt: "14:00",
      checkInTime: "08:00" // PRESENT
    });

    await attendanceRepo.checkIn({
      staffId: "staff-ast-clary",
      branchId: "branch-gebang",
      date: "2026-10-15",
      scheduledStartAt: "08:00",
      scheduledEndAt: "14:00",
      checkInTime: "08:20" // LATE
    });

    const lateList = await attendanceRepo.list({
      date: "2026-10-15",
      attendanceStatus: AttendanceStatus.LATE
    });

    expect(lateList.length).toBe(1);
    expect(lateList[0].staffId).toBe("staff-ast-clary");
    expect(lateList[0].attendanceStatus).toBe(AttendanceStatus.LATE);
  });
});
