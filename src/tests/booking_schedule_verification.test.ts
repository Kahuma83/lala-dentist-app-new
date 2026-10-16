import { describe, it, expect, beforeEach } from "vitest";
import { MockDatabase } from "../data/mockData";
import { MockBookingRepository, MockDoctorScheduleRepository } from "../repositories/mockRepositories";
import { BookingStatus, ScheduleStatus } from "../types/domain";

describe("Booking Schedule Verification Tests", () => {
  let bookingRepo: MockBookingRepository;
  let scheduleRepo: MockDoctorScheduleRepository;

  beforeEach(() => {
    MockDatabase.resetInstance();
    bookingRepo = new MockBookingRepository();
    scheduleRepo = new MockDoctorScheduleRepository();
  });

  it("should create booking with scheduleVerified = true when doctor schedule is active and available", async () => {
    // 1. Setup an active schedule for doctor in branch-gebang
    const testDate = "2026-10-25";
    const doctorId = "doc-syafira";
    const branchId = "branch-gebang";
    const patientId = "patient-1"; // Amanda Lestari

    await scheduleRepo.createSchedule({
      doctorId,
      branchId,
      date: testDate,
      startTime: "09:00",
      endTime: "14:00",
      status: ScheduleStatus.ACTIVE
    });

    // 2. Create booking for this doctor, branch, and date with scheduleVerified = true
    const booking = await bookingRepo.createBooking({
      patientId,
      branchId,
      doctorId,
      bookingDateTime: `${testDate}T09:00:00Z`,
      timeSlot: "09:00",
      status: BookingStatus.PENDING,
      scheduleVerified: true
    });

    expect(booking).toBeDefined();
    expect(booking.id).toBeDefined();
    expect(booking.scheduleVerified).toBe(true);
    expect(booking.doctorId).toBe(doctorId);
    expect(booking.branchId).toBe(branchId);

    // Verify persisted in repo
    const retrieved = await bookingRepo.getBookingById(booking.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.scheduleVerified).toBe(true);
  });

  it("should create booking with scheduleVerified = false when no schedule exists for branch and date", async () => {
    // 1. Choose branch and date with no schedules created yet
    const unconfirmedDate = "2026-12-15";
    const branchId = "branch-gebang";
    const doctorId = "doc-syafira";
    const patientId = "patient-1";

    // Ensure no schedules exist for this date
    const schedules = await scheduleRepo.getSchedules({ branchId, date: unconfirmedDate });
    expect(schedules.length).toBe(0);

    // 2. Create booking when schedule is unconfirmed (scheduleVerified = false)
    const booking = await bookingRepo.createBooking({
      patientId,
      branchId,
      doctorId,
      bookingDateTime: `${unconfirmedDate}T10:00:00Z`,
      timeSlot: "10:00",
      status: BookingStatus.PENDING,
      scheduleVerified: false
    });

    expect(booking).toBeDefined();
    expect(booking.id).toBeDefined();
    expect(booking.scheduleVerified).toBe(false);
    expect(booking.doctorId).toBe(doctorId);

    // Verify persisted in repo
    const retrieved = await bookingRepo.getBookingById(booking.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.scheduleVerified).toBe(false);
  });

  it("blocks a second active booking for the same patient, branch, and day but allows another day", async () => {
    MockDatabase.getInstance().bookings = [];
    const patientId = "patient-1";
    const branchId = "branch-gebang";
    const doctorId = "doc-syafira";

    await bookingRepo.createBooking({
      patientId,
      branchId,
      doctorId,
      bookingDateTime: "2026-10-25T09:00:00Z",
      timeSlot: "09:00",
      status: BookingStatus.PENDING
    });

    await expect(bookingRepo.createBooking({
      patientId,
      branchId,
      doctorId,
      bookingDateTime: "2026-10-25T10:00:00Z",
      timeSlot: "10:00",
      status: BookingStatus.PENDING
    })).rejects.toThrow("Pasien sudah memiliki booking aktif");

    const nextDayBooking = await bookingRepo.createBooking({
      patientId,
      branchId,
      doctorId,
      bookingDateTime: "2026-10-26T09:00:00Z",
      timeSlot: "09:00",
      status: BookingStatus.PENDING
    });

    expect(nextDayBooking.id).toBeDefined();
  });

  it("should detect unscheduled doctor booking for H-1 confirmation warnings", async () => {
    const testDate = "2026-11-01";
    const scheduledBranch = "branch-gebang";
    const unscheduledBranch = "branch-ambulu";
    const doctorId = "doc-syafira";

    // Schedule is only at branch-gebang
    await scheduleRepo.createSchedule({
      doctorId,
      branchId: scheduledBranch,
      date: testDate,
      startTime: "09:00",
      endTime: "14:00",
      status: ScheduleStatus.ACTIVE
    });

    // Booking at branch-ambulu (where doctor has no schedule on that date)
    const bookingUnscheduled = await bookingRepo.createBooking({
      patientId: "patient-1",
      branchId: unscheduledBranch,
      doctorId,
      bookingDateTime: `${testDate}T10:00:00Z`,
      timeSlot: "10:00",
      status: BookingStatus.PENDING,
      scheduleVerified: false
    });

    // Check schedules match
    const activeSchedules = await scheduleRepo.getSchedules({
      date: testDate,
      status: ScheduleStatus.ACTIVE
    });

    const isDoctorScheduledAtBranch = activeSchedules.some(
      (s) => s.doctorId === bookingUnscheduled.doctorId && s.branchId === bookingUnscheduled.branchId && s.status === ScheduleStatus.ACTIVE
    );

    // Doctor is NOT scheduled at branch-ambulu on testDate
    expect(isDoctorScheduledAtBranch).toBe(false);
  });
});
