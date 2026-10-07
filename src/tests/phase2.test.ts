import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { MockDatabase } from "../data/mockData";
import { AppClock } from "../utils/clock";
import {
  MockPatientRepository,
  MockBranchRepository,
  MockBookingRepository,
  MockH1ConfirmationRepository,
  MockVisitRepository
} from "../repositories/mockRepositories";
import {
  UserRole,
  BookingStatus,
  ConfirmationStatusH1,
  VisitType,
  VisitStatus
} from "../types/domain";
import {
  getTodayDateString,
  getTomorrowDateString,
  getDayAfterTomorrowDateString
} from "../utils/dateUtils";

describe("Lala Dentist Web Admin - Phase 2 Booking & H-1 Confirmation Tests", () => {
  let patientRepo: MockPatientRepository;
  let branchRepo: MockBranchRepository;
  let bookingRepo: MockBookingRepository;
  let h1Repo: MockH1ConfirmationRepository;
  let visitRepo: MockVisitRepository;

  beforeEach(() => {
    // Set fixed time for deterministic Phase 2 test suite
    AppClock.setFixedTime("2026-09-21T09:00:00Z");
    // Reset database singleton to clean state before each test
    MockDatabase.resetInstance();
    patientRepo = new MockPatientRepository();
    branchRepo = new MockBranchRepository();
    bookingRepo = new MockBookingRepository();
    h1Repo = new MockH1ConfirmationRepository();
    visitRepo = new MockVisitRepository();
  });

  afterEach(() => {
    AppClock.reset();
  });

  // ==========================================
  // 1. BOOKING CORE VALIDATIONS
  // ==========================================
  it("1. should create booking successfully when valid data is provided", async () => {
    const booking = await bookingRepo.createBooking({
      patientId: "patient-1",
      branchId: "branch-gebang",
      doctorId: "doc-syafira",
      serviceId: "service-scaling",
      bookingDateTime: "2026-09-25T10:00:00Z",
      notes: "Pembersihan rutin"
    });

    expect(booking.id).toBeDefined();
    expect(booking.patientId).toBe("patient-1");
    expect(booking.branchId).toBe("branch-gebang");
    expect(booking.doctorId).toBe("doc-syafira");
    expect(booking.status).toBe(BookingStatus.PENDING);
  });

  it("2. should reject booking creation if patientId does not exist in master patients", async () => {
    await expect(
      bookingRepo.createBooking({
        patientId: "non-existent-patient",
        branchId: "branch-gebang",
        doctorId: "doc-syafira",
        bookingDateTime: "2026-09-25T10:00:00Z"
      })
    ).rejects.toThrow("Pasien tidak ditemukan");
  });

  it("3. should reject booking creation if branchId does not exist", async () => {
    await expect(
      bookingRepo.createBooking({
        patientId: "patient-1",
        branchId: "non-existent-branch",
        doctorId: "doc-syafira",
        bookingDateTime: "2026-09-25T10:00:00Z"
      })
    ).rejects.toThrow("Cabang tidak ditemukan");
  });

  it("4. should reject booking creation if doctorId does not exist", async () => {
    await expect(
      bookingRepo.createBooking({
        patientId: "patient-1",
        branchId: "branch-gebang",
        doctorId: "non-existent-doctor",
        bookingDateTime: "2026-09-25T10:00:00Z"
      })
    ).rejects.toThrow("Dokter tidak ditemukan");
  });

  it("5. should reject booking creation if date/time is missing or invalid", async () => {
    await expect(
      bookingRepo.createBooking({
        patientId: "patient-1",
        branchId: "branch-gebang",
        doctorId: "doc-syafira",
        bookingDateTime: "invalid-date-string"
      })
    ).rejects.toThrow("Tanggal dan jam booking wajib valid");
  });

  it("6. should reject booking creation if bookingDateTime is empty", async () => {
    await expect(
      bookingRepo.createBooking({
        patientId: "patient-1",
        branchId: "branch-gebang",
        doctorId: "doc-syafira",
        bookingDateTime: ""
      })
    ).rejects.toThrow("Tanggal dan jam booking wajib valid");
  });

  it("7. should ensure created booking references valid patientId", async () => {
    const booking = await bookingRepo.createBooking({
      patientId: "patient-2",
      branchId: "branch-gebang",
      doctorId: "doc-syafira",
      bookingDateTime: "2026-09-26T11:00:00Z"
    });

    const patient = await patientRepo.getPatientById(booking.patientId);
    expect(patient).not.toBeNull();
    expect(patient?.id).toBe("patient-2");
  });

  it("8. should verify booking creation never creates a new PatientProfile", async () => {
    const patientsBefore = await patientRepo.getPatients();
    const countBefore = patientsBefore.length;

    await bookingRepo.createBooking({
      patientId: "patient-1",
      branchId: "branch-gebang",
      doctorId: "doc-syafira",
      bookingDateTime: "2026-09-27T09:00:00Z"
    });

    const patientsAfter = await patientRepo.getPatients();
    expect(patientsAfter.length).toBe(countBefore);
  });

  it("9. should verify booking creation never automatically creates a PatientVisit", async () => {
    const visitsBefore = await visitRepo.getVisits();
    const countBefore = visitsBefore.length;

    await bookingRepo.createBooking({
      patientId: "patient-1",
      branchId: "branch-gebang",
      doctorId: "doc-syafira",
      bookingDateTime: "2026-09-28T14:00:00Z"
    });

    const visitsAfter = await visitRepo.getVisits();
    expect(visitsAfter.length).toBe(countBefore);
  });

  it("10. should enforce booking branch corresponds to specified actor branch", async () => {
    const booking = await bookingRepo.createBooking(
      {
        patientId: "patient-1",
        branchId: "branch-gebang",
        doctorId: "doc-syafira",
        bookingDateTime: "2026-09-29T10:00:00Z"
      },
      UserRole.BRANCH_ADMIN,
      "branch-gebang"
    );

    expect(booking.branchId).toBe("branch-gebang");
  });

  // ==========================================
  // 2. BRANCH SECURITY
  // ==========================================
  it("11. should allow Branch Admin to create booking for assigned branch", async () => {
    const booking = await bookingRepo.createBooking(
      {
        patientId: "patient-2",
        branchId: "branch-gebang",
        doctorId: "doc-syafira",
        bookingDateTime: "2026-09-30T10:00:00Z"
      },
      UserRole.BRANCH_ADMIN,
      "branch-gebang"
    );

    expect(booking).toBeDefined();
    expect(booking.branchId).toBe("branch-gebang");
  });

  it("12. should prevent Branch Admin from creating booking for another branch", async () => {
    await expect(
      bookingRepo.createBooking(
        {
          patientId: "patient-2",
          branchId: "branch-kampus", // Admin Gebang trying to book Muktisari/Kampus
          doctorId: "doc-lala",
          bookingDateTime: "2026-09-30T10:00:00Z"
        },
        UserRole.BRANCH_ADMIN,
        "branch-gebang"
      )
    ).rejects.toThrow("Branch Admin tidak dapat membuat booking untuk cabang lain");
  });

  it("13. should prevent Branch Admin from viewing bookings of another branch", async () => {
    await expect(
      bookingRepo.getBookingsByBranch("branch-kampus", UserRole.BRANCH_ADMIN, "branch-gebang")
    ).rejects.toThrow("Branch Admin tidak memiliki akses melihat booking di cabang lain");
  });

  it("14. should prevent Branch Admin from updating or cancelling booking of another branch", async () => {
    // booking-3 is at branch-kampus
    await expect(
      bookingRepo.updateBooking(
        "booking-3",
        { notes: "Hacked notes" },
        UserRole.BRANCH_ADMIN,
        "branch-gebang"
      )
    ).rejects.toThrow("Branch Admin tidak dapat mengubah booking cabang lain");

    await expect(
      bookingRepo.cancelBooking("booking-3", UserRole.BRANCH_ADMIN, "branch-gebang")
    ).rejects.toThrow("Branch Admin tidak dapat membatalkan booking cabang lain");
  });

  it("15. should allow Super Admin to view and manage bookings across all branches", async () => {
    const allBookings = await bookingRepo.getBookings(UserRole.SUPER_ADMIN, null);
    expect(allBookings.length).toBeGreaterThan(0);

    const bookingKampus = await bookingRepo.updateBooking(
      "booking-3",
      { notes: "Super Admin update notes" },
      UserRole.SUPER_ADMIN,
      null
    );
    expect(bookingKampus.notes).toBe("Super Admin update notes");
  });

  // ==========================================
  // 3. H-1 CONFIRMATION LIFECYCLE & STATUSES
  // ==========================================
  it("16. should default H-1 confirmation status to BELUM_DIHUBUNGI", async () => {
    const conf = await h1Repo.getH1Confirmation("booking-h1-gebang-1");
    expect(conf).not.toBeNull();
    expect(conf?.confirmationStatus).toBe(ConfirmationStatusH1.BELUM_DIHUBUNGI);
    expect(conf?.status).toBe(ConfirmationStatusH1.BELUM_DIHUBUNGI);
  });

  it("17. should transition H-1 status from BELUM_DIHUBUNGI to SUDAH_DIHUBUNGI", async () => {
    const updated = await h1Repo.updateH1Confirmation("booking-h1-gebang-1", {
      status: ConfirmationStatusH1.SUDAH_DIHUBUNGI,
      notes: "Sudah di-chat via WA"
    }, "user-branch-gebang");

    expect(updated.status).toBe(ConfirmationStatusH1.SUDAH_DIHUBUNGI);
    expect(updated.contactedAt).toBeDefined();
  });

  it("18. should transition H-1 status from SUDAH_DIHUBUNGI to DIKONFIRMASI", async () => {
    const updated = await h1Repo.updateH1Confirmation("booking-h1-gebang-2", {
      status: ConfirmationStatusH1.DIKONFIRMASI,
      notes: "Pasien mengonfirmasi akan hadir jam 10:30"
    }, "user-branch-gebang");

    expect(updated.status).toBe(ConfirmationStatusH1.DIKONFIRMASI);
    expect(updated.confirmedAt).toBeDefined();
  });

  it("19. should transition H-1 status from SUDAH_DIHUBUNGI to MINTA_RESCHEDULE", async () => {
    const updated = await h1Repo.updateH1Confirmation("booking-h1-gebang-2", {
      status: ConfirmationStatusH1.MINTA_RESCHEDULE,
      notes: "Pasien ada rapat mendadak, Minta ganti jam"
    }, "user-branch-gebang");

    expect(updated.status).toBe(ConfirmationStatusH1.MINTA_RESCHEDULE);
  });

  it("20. should transition H-1 status from SUDAH_DIHUBUNGI to BATAL", async () => {
    const updated = await h1Repo.updateH1Confirmation("booking-h1-gebang-2", {
      status: ConfirmationStatusH1.BATAL,
      notes: "Pasien keluar kota"
    }, "user-branch-gebang");

    expect(updated.status).toBe(ConfirmationStatusH1.BATAL);
  });

  it("21. should transition H-1 status from SUDAH_DIHUBUNGI to TIDAK_MERESPONS", async () => {
    const updated = await h1Repo.updateH1Confirmation("booking-h1-gebang-2", {
      status: ConfirmationStatusH1.TIDAK_MERESPONS,
      notes: "WA centang satu, telpon dialihkan"
    }, "user-branch-gebang");

    expect(updated.status).toBe(ConfirmationStatusH1.TIDAK_MERESPONS);
  });

  it("22. should save contactedAt timestamp when status is set to SUDAH_DIHUBUNGI", async () => {
    const updated = await h1Repo.updateH1Confirmation("booking-h1-gebang-1", {
      status: ConfirmationStatusH1.SUDAH_DIHUBUNGI
    }, "user-branch-gebang");

    expect(updated.contactedAt).toBeDefined();
    expect(new Date(updated.contactedAt!).getTime()).not.toBeNaN();
  });

  it("23. should save confirmedAt timestamp when status is set to DIKONFIRMASI", async () => {
    const updated = await h1Repo.updateH1Confirmation("booking-h1-gebang-1", {
      status: ConfirmationStatusH1.DIKONFIRMASI
    }, "user-branch-gebang");

    expect(updated.confirmedAt).toBeDefined();
    expect(new Date(updated.confirmedAt!).getTime()).not.toBeNaN();
  });

  it("24. should ensure H-1 confirmation status updates do not overwrite Booking.status", async () => {
    const bookingBefore = await bookingRepo.getBookingById("booking-h1-gebang-1");
    expect(bookingBefore?.status).toBe(BookingStatus.PENDING);

    await h1Repo.updateH1Confirmation("booking-h1-gebang-1", {
      status: ConfirmationStatusH1.DIKONFIRMASI
    });

    const bookingAfter = await bookingRepo.getBookingById("booking-h1-gebang-1");
    // Booking status remains PENDING until operational transition
    expect(bookingAfter?.status).toBe(BookingStatus.PENDING);
  });

  // ==========================================
  // 4. H-1 DATE FILTERING
  // ==========================================
  it("25. should filter H-1 confirmations to only show bookings scheduled for tomorrow", async () => {
    const tomorrowStr = getTomorrowDateString(); // "2026-09-22"
    const tomorrowBookings = await bookingRepo.getBookingsByDate(tomorrowStr);

    expect(tomorrowBookings.length).toBeGreaterThan(0);
    tomorrowBookings.forEach((b) => {
      expect(b.bookingDateTime.startsWith(tomorrowStr)).toBe(true);
    });
  });

  it("26. should exclude today's bookings from H-1 tomorrow confirmation list", async () => {
    const todayStr = getTodayDateString(); // "2026-09-21"
    const tomorrowStr = getTomorrowDateString(); // "2026-09-22"

    const tomorrowBookings = await bookingRepo.getBookingsByDate(tomorrowStr);
    const hasTodayBooking = tomorrowBookings.some((b) => b.bookingDateTime.startsWith(todayStr));

    expect(hasTodayBooking).toBe(false);
  });

  it("27. should exclude day-after-tomorrow bookings from H-1 tomorrow confirmation list", async () => {
    const dayAfterTomorrowStr = getDayAfterTomorrowDateString(); // "2026-09-23"
    const tomorrowStr = getTomorrowDateString(); // "2026-09-22"

    const tomorrowBookings = await bookingRepo.getBookingsByDate(tomorrowStr);
    const hasDayAfterBooking = tomorrowBookings.some((b) =>
      b.bookingDateTime.startsWith(dayAfterTomorrowStr)
    );

    expect(hasDayAfterBooking).toBe(false);
  });

  // ==========================================
  // 5. VISIT RELATIONSHIP
  // ==========================================
  it("28. should verify that creating a booking does not automatically create a PatientVisit", async () => {
    const initialVisits = await visitRepo.getVisits();
    
    await bookingRepo.createBooking({
      patientId: "patient-1",
      branchId: "branch-gebang",
      doctorId: "doc-syafira",
      bookingDateTime: "2026-10-01T09:00:00Z"
    });

    const updatedVisits = await visitRepo.getVisits();
    expect(updatedVisits.length).toBe(initialVisits.length);
  });

  it("29. should allow creating a PatientVisit with visitType BOOKING when patient arrives for booking", async () => {
    const newVisit = await visitRepo.createVisit({
      patientId: "patient-1",
      branchId: "branch-gebang",
      visitType: VisitType.BOOKING,
      bookingId: "booking-1",
      complaint: "Scaling gigi sesuai booking",
      doctorId: "doc-syafira"
    });

    expect(newVisit.id).toBeDefined();
    expect(newVisit.visitType).toBe(VisitType.BOOKING);
    expect(newVisit.bookingId).toBe("booking-1");
  });

  it("30. should store valid bookingId in PatientVisit when created from booking", async () => {
    const visit = await visitRepo.createVisit({
      patientId: "patient-2",
      branchId: "branch-gebang",
      visitType: VisitType.BOOKING,
      bookingId: "booking-2",
      complaint: "Pemeriksaan geraham linu",
      doctorId: "doc-syafira"
    });

    expect(visit.bookingId).toBe("booking-2");
    expect(visit.visitType).toBe(VisitType.BOOKING);
  });

  // ==========================================
  // 6. CANCELLATION & CONFLICT
  // ==========================================
  it("31. should exclude CANCELLED bookings from active booking queries and conflict checks", async () => {
    // Create a booking
    const b1 = await bookingRepo.createBooking({
      patientId: "patient-1",
      branchId: "branch-gebang",
      doctorId: "doc-syafira",
      bookingDateTime: "2026-10-10T10:00:00Z"
    });

    // Cancel b1
    await bookingRepo.cancelBooking(b1.id);

    // Creating another booking on the SAME slot should succeed now because b1 is CANCELLED
    const b2 = await bookingRepo.createBooking({
      patientId: "patient-2",
      branchId: "branch-gebang",
      doctorId: "doc-syafira",
      bookingDateTime: "2026-10-10T10:00:00Z"
    });

    expect(b2.id).toBeDefined();
    expect(b2.status).toBe(BookingStatus.PENDING);
  });

  it("32. should reject duplicate active booking on same doctor branch date and time slot", async () => {
    await bookingRepo.createBooking({
      patientId: "patient-1",
      branchId: "branch-gebang",
      doctorId: "doc-syafira",
      bookingDateTime: "2026-10-15T14:00:00Z"
    });

    // Attempting to create a second active booking for doc-syafira at the same branch and exact slot
    await expect(
      bookingRepo.createBooking({
        patientId: "patient-2",
        branchId: "branch-gebang",
        doctorId: "doc-syafira",
        bookingDateTime: "2026-10-15T14:00:00Z"
      })
    ).rejects.toThrow("Dokter sudah memiliki jadwal booking aktif pada slot waktu tersebut");
  });
});
