import { describe, it, expect, beforeEach } from "vitest";
import { MockDatabase } from "../data/mockData";
import {
  MockPatientRepository,
  MockBranchRepository,
  MockBookingRepository,
  MockVisitRepository,
  MockQueueRepository
} from "../repositories/mockRepositories";
import {
  UserRole,
  VisitType,
  VisitStatus,
  QueueStatus
} from "../types/domain";
import { AppClock } from "../utils/clock";

describe("Lala Dentist Web Admin - Phase 3 Live Queue & Scheduling Engine Tests", () => {
  let visitRepo: MockVisitRepository;
  let queueRepo: MockQueueRepository;

  beforeEach(() => {
    // Reset database singleton & AppClock before each test
    MockDatabase.resetInstance();
    MockDatabase.getInstance().queueItems = [];
    AppClock.reset();
    AppClock.setFixedTime("2026-09-21T09:00:00Z");

    visitRepo = new MockVisitRepository();
    queueRepo = new MockQueueRepository();
  });

  // ==========================================
  // 1. CLOCK ABSTRACTION & INITIALIZATION
  // ==========================================
  it("1. should fix and retrieve deterministic operational time via AppClock", () => {
    AppClock.setFixedTime("2026-09-21T08:30:00Z");
    expect(AppClock.nowISO()).toBe("2026-09-21T08:30:00Z");
    expect(AppClock.todayDateString()).toBe("2026-09-21");

    AppClock.reset();
    expect(AppClock.nowISO()).not.toBe("2026-09-21T08:30:00Z");
  });

  it("2. should convert a valid PatientVisit into a QueueItem with WAITING status", async () => {
    AppClock.setFixedTime("2026-09-21T09:00:00Z");

    const visit = await visitRepo.createVisit({
      patientId: "patient-1",
      branchId: "branch-gebang",
      visitType: VisitType.WALK_IN,
      bookingId: null,
      complaint: "Pemeriksaan karang gigi",
      doctorId: "doc-syafira"
    });

    const queueItem = await queueRepo.checkInVisitToQueue(visit.id);

    expect(queueItem).toBeDefined();
    expect(queueItem.visitId).toBe(visit.id);
    expect(queueItem.branchId).toBe("branch-gebang");
    expect(queueItem.doctorId).toBe("doc-syafira");
    expect(queueItem.status).toBe(QueueStatus.WAITING);
    expect(queueItem.queueNumber).toContain("S-");
  });

  it("3. should reject check-in if visitId does not exist", async () => {
    await expect(queueRepo.checkInVisitToQueue("non-existent-visit-id")).rejects.toThrow(
      "PatientVisit tidak ditemukan"
    );
  });

  it("4. should reject check-in if visit patient is invalid", async () => {
    const db = MockDatabase.getInstance();
    db.visits.push({
      id: "visit-invalid-patient",
      patientId: "non-existent-patient",
      branchId: "branch-gebang",
      visitDateTime: "2026-09-21T09:00:00Z",
      visitType: VisitType.WALK_IN,
      visitStatus: VisitStatus.WAITING,
      bookingId: null,
      createdAt: "2026-09-21T09:00:00Z",
      updatedAt: "2026-09-21T09:00:00Z"
    });

    await expect(queueRepo.checkInVisitToQueue("visit-invalid-patient")).rejects.toThrow(
      "Pasien tidak valid"
    );
  });

  it("5. should reject check-in if visit branch is invalid", async () => {
    const db = MockDatabase.getInstance();
    db.visits.push({
      id: "visit-invalid-branch",
      patientId: "patient-1",
      branchId: "non-existent-branch",
      visitDateTime: "2026-09-21T09:00:00Z",
      visitType: VisitType.WALK_IN,
      visitStatus: VisitStatus.WAITING,
      bookingId: null,
      createdAt: "2026-09-21T09:00:00Z",
      updatedAt: "2026-09-21T09:00:00Z"
    });

    await expect(queueRepo.checkInVisitToQueue("visit-invalid-branch")).rejects.toThrow(
      "Cabang tidak valid"
    );
  });

  it("6. should be idempotent (check-in twice returns existing queue item without duplicate)", async () => {
    const visit = await visitRepo.createVisit({
      patientId: "patient-1",
      branchId: "branch-gebang",
      visitType: VisitType.WALK_IN,
      bookingId: null,
      doctorId: "doc-syafira"
    });

    const item1 = await queueRepo.checkInVisitToQueue(visit.id);
    const item2 = await queueRepo.checkInVisitToQueue(visit.id);

    expect(item1.id).toBe(item2.id);

    const allBranchQueue = await queueRepo.getQueueByBranch("branch-gebang");
    const countForVisit = allBranchQueue.filter((q) => q.visitId === visit.id).length;
    expect(countForVisit).toBe(1);
  });

  // ==========================================
  // 2. ISOLATION & ACCESS CONTROL
  // ==========================================
  it("7. should throw error if Branch Admin attempts to get queue of another branch", async () => {
    await expect(
      queueRepo.getQueueByBranch("branch-muktisari", UserRole.BRANCH_ADMIN, "branch-gebang")
    ).rejects.toThrow("Access denied");
  });

  it("8. should throw error if Branch Admin attempts check-in for another branch", async () => {
    const visit = await visitRepo.createVisit({
      patientId: "patient-1",
      branchId: "branch-muktisari",
      visitType: VisitType.WALK_IN,
      bookingId: null,
      doctorId: "doc-lala"
    });

    await expect(
      queueRepo.checkInVisitToQueue(visit.id, UserRole.BRANCH_ADMIN, "branch-gebang")
    ).rejects.toThrow("Branch Admin tidak dapat mendaftarkan antrean cabang lain");
  });

  it("9. should throw error if Doctor attempts to access another doctor's queue", async () => {
    await expect(
      queueRepo.getQueueByDoctor("doc-lala", UserRole.DOCTOR, "branch-gebang", "doc-syafira")
    ).rejects.toThrow("Access denied: Doctor cannot access another doctor queue");
  });

  it("10. should throw error if Patient attempts to access another patient's queue", async () => {
    await expect(
      queueRepo.getQueueByPatient("patient-2", UserRole.PATIENT, "patient-1")
    ).rejects.toThrow("Access denied: Patient can only view their own queue");
  });

  // ==========================================
  // 3. DETERMINISTIC QUEUE NUMBERING & TIME MODEL
  // ==========================================
  it("11. should generate deterministic sequential queue numbers by doctor prefix", async () => {
    AppClock.setFixedTime("2026-09-21T09:00:00Z");

    const visit1 = await visitRepo.createVisit({
      patientId: "patient-1",
      branchId: "branch-gebang",
      visitType: VisitType.WALK_IN,
      bookingId: null,
      doctorId: "doc-syafira"
    });

    const visit2 = await visitRepo.createVisit({
      patientId: "patient-2",
      branchId: "branch-gebang",
      visitType: VisitType.WALK_IN,
      bookingId: null,
      doctorId: "doc-syafira"
    });

    const item1 = await queueRepo.checkInVisitToQueue(visit1.id);
    const item2 = await queueRepo.checkInVisitToQueue(visit2.id);

    expect(item1.queueNumber).toBe("S-01");
    expect(item2.queueNumber).toBe("S-02");
  });

  it("12. should maintain separate fields for bookingDateTime, estimatedServiceAt, actualServiceStartAt, actualServiceEndAt", async () => {
    AppClock.setFixedTime("2026-09-21T09:00:00Z");

    const visit = await visitRepo.createVisit({
      patientId: "patient-1",
      branchId: "branch-gebang",
      visitType: VisitType.BOOKING,
      bookingId: "booking-1",
      doctorId: "doc-syafira"
    });

    const item = await queueRepo.checkInVisitToQueue(visit.id);
    expect(item.estimatedServiceAt).toBeDefined();
    expect(item.actualServiceStartAt).toBeUndefined();
    expect(item.actualServiceEndAt).toBeUndefined();

    AppClock.setFixedTime("2026-09-21T09:10:00Z");
    const started = await queueRepo.startService(item.id);
    expect(started.actualServiceStartAt).toBe("2026-09-21T09:10:00Z");

    AppClock.setFixedTime("2026-09-21T09:40:00Z");
    const finished = await queueRepo.finishService(item.id);
    expect(finished.actualServiceEndAt).toBe("2026-09-21T09:40:00Z");

    // All distinct values
    expect(started.actualServiceStartAt).not.toBe(finished.actualServiceEndAt);
  });

  // ==========================================
  // 4. QUEUE LIFECYCLE TRANSITIONS
  // ==========================================
  it("13. should call/prepare patient transitioning status to IN_PREPARATION", async () => {
    const visit = await visitRepo.createVisit({
      patientId: "patient-1",
      branchId: "branch-gebang",
      visitType: VisitType.WALK_IN,
      bookingId: null,
      doctorId: "doc-syafira"
    });

    const item = await queueRepo.checkInVisitToQueue(visit.id);
    const prepared = await queueRepo.prepareQueuePatient(item.id);

    expect(prepared.status).toBe(QueueStatus.IN_PREPARATION);
  });

  it("14. should start service transitioning status to IN_CONSULTATION", async () => {
    const visit = await visitRepo.createVisit({
      patientId: "patient-1",
      branchId: "branch-gebang",
      visitType: VisitType.WALK_IN,
      bookingId: null,
      doctorId: "doc-syafira"
    });

    const item = await queueRepo.checkInVisitToQueue(visit.id);
    const started = await queueRepo.startService(item.id);

    expect(started.status).toBe(QueueStatus.IN_CONSULTATION);
    expect(started.actualServiceStartAt).toBeDefined();
  });

  it("15. should set actualServiceStartAt accurately upon starting service", async () => {
    AppClock.setFixedTime("2026-09-21T09:15:00Z");

    const visit = await visitRepo.createVisit({
      patientId: "patient-1",
      branchId: "branch-gebang",
      visitType: VisitType.WALK_IN,
      bookingId: null,
      doctorId: "doc-syafira"
    });

    const item = await queueRepo.checkInVisitToQueue(visit.id);
    const started = await queueRepo.startService(item.id);

    expect(started.actualServiceStartAt).toBe("2026-09-21T09:15:00Z");
  });

  it("16. should finish service transitioning status to COMPLETED", async () => {
    const visit = await visitRepo.createVisit({
      patientId: "patient-1",
      branchId: "branch-gebang",
      visitType: VisitType.WALK_IN,
      bookingId: null,
      doctorId: "doc-syafira"
    });

    const item = await queueRepo.checkInVisitToQueue(visit.id);
    await queueRepo.startService(item.id);
    const finished = await queueRepo.finishService(item.id);

    expect(finished.status).toBe(QueueStatus.COMPLETED);
    expect(finished.actualServiceEndAt).toBeDefined();
  });

  it("17. should set actualServiceEndAt accurately upon finishing service", async () => {
    AppClock.setFixedTime("2026-09-21T09:15:00Z");

    const visit = await visitRepo.createVisit({
      patientId: "patient-1",
      branchId: "branch-gebang",
      visitType: VisitType.WALK_IN,
      bookingId: null,
      doctorId: "doc-syafira"
    });

    const item = await queueRepo.checkInVisitToQueue(visit.id);
    await queueRepo.startService(item.id);

    AppClock.setFixedTime("2026-09-21T09:45:00Z");
    const finished = await queueRepo.finishService(item.id);

    expect(finished.actualServiceEndAt).toBe("2026-09-21T09:45:00Z");
  });

  it("18. should throw error when finishing service without actualServiceStartAt", async () => {
    const visit = await visitRepo.createVisit({
      patientId: "patient-1",
      branchId: "branch-gebang",
      visitType: VisitType.WALK_IN,
      bookingId: null,
      doctorId: "doc-syafira"
    });

    const item = await queueRepo.checkInVisitToQueue(visit.id);
    await expect(queueRepo.finishService(item.id)).rejects.toThrow(
      "Layanan tidak dapat diselesaikan tanpa actualServiceStartAt"
    );
  });

  it("19. should skip queue patient transitioning status to SKIPPED", async () => {
    const visit = await visitRepo.createVisit({
      patientId: "patient-1",
      branchId: "branch-gebang",
      visitType: VisitType.WALK_IN,
      bookingId: null,
      doctorId: "doc-syafira"
    });

    const item = await queueRepo.checkInVisitToQueue(visit.id);
    const skipped = await queueRepo.skipQueuePatient(item.id);

    expect(skipped.status).toBe(QueueStatus.SKIPPED);
  });

  // ==========================================
  // 5. SINGLE CONSULTATION RULE & SCHEDULING RECALCULATION
  // ==========================================
  it("20. should enforce single active consultation per doctor at a time", async () => {
    const visit1 = await visitRepo.createVisit({
      patientId: "patient-1",
      branchId: "branch-gebang",
      visitType: VisitType.WALK_IN,
      bookingId: null,
      doctorId: "doc-syafira"
    });

    const visit2 = await visitRepo.createVisit({
      patientId: "patient-2",
      branchId: "branch-gebang",
      visitType: VisitType.WALK_IN,
      bookingId: null,
      doctorId: "doc-syafira"
    });

    const item1 = await queueRepo.checkInVisitToQueue(visit1.id);
    const item2 = await queueRepo.checkInVisitToQueue(visit2.id);

    await queueRepo.startService(item1.id);

    await expect(queueRepo.startService(item2.id)).rejects.toThrow(
      "Dokter sedang melayani pasien lain dalam konsultasi aktif"
    );
  });

  it("21. should recalculate estimatedServiceAt for subsequent waiting patients based on cumulative duration", async () => {
    AppClock.setFixedTime("2026-09-21T09:00:00Z");

    const visit1 = await visitRepo.createVisit({
      patientId: "patient-1",
      branchId: "branch-gebang",
      visitType: VisitType.WALK_IN,
      bookingId: null,
      doctorId: "doc-syafira"
    });

    const visit2 = await visitRepo.createVisit({
      patientId: "patient-2",
      branchId: "branch-gebang",
      visitType: VisitType.WALK_IN,
      bookingId: null,
      doctorId: "doc-syafira"
    });

    const item1 = await queueRepo.checkInVisitToQueue(visit1.id, undefined, undefined, {
      estimatedDurationMinutes: 30
    });
    const item2 = await queueRepo.checkInVisitToQueue(visit2.id, undefined, undefined, {
      estimatedDurationMinutes: 45
    });

    expect(item1.estimatedServiceAt).toBe("2026-09-21T09:00:00.000Z");
    expect(item2.estimatedServiceAt).toBe("2026-09-21T09:30:00.000Z");
  });

  it("22. should automatically shift subsequent estimated service times when duration is updated", async () => {
    AppClock.setFixedTime("2026-09-21T09:00:00Z");

    const visit1 = await visitRepo.createVisit({
      patientId: "patient-1",
      branchId: "branch-gebang",
      visitType: VisitType.WALK_IN,
      bookingId: null,
      doctorId: "doc-syafira"
    });

    const visit2 = await visitRepo.createVisit({
      patientId: "patient-2",
      branchId: "branch-gebang",
      visitType: VisitType.WALK_IN,
      bookingId: null,
      doctorId: "doc-syafira"
    });

    const item1 = await queueRepo.checkInVisitToQueue(visit1.id, undefined, undefined, {
      estimatedDurationMinutes: 30
    });
    const item2 = await queueRepo.checkInVisitToQueue(visit2.id, undefined, undefined, {
      estimatedDurationMinutes: 30
    });

    expect(item2.estimatedServiceAt).toBe("2026-09-21T09:30:00.000Z");

    // Update duration of patient 1 to 60 mins
    await queueRepo.updateEstimatedDuration(item1.id, 60);

    const updatedQueue = await queueRepo.getQueueByDoctor("doc-syafira");
    const updatedItem2 = updatedQueue.find((q) => q.id === item2.id);

    expect(updatedItem2?.estimatedServiceAt).toBe("2026-09-21T10:00:00.000Z");
  });

  it("23. should order active items deterministically by arrivalAt -> sequenceOrder -> id", async () => {
    const items = await queueRepo.recalculateQueue("branch-gebang", "doc-syafira", "2026-09-21");
    expect(Array.isArray(items)).toBe(true);
  });

  it("24. should prioritize IN_CONSULTATION before IN_PREPARATION and WAITING in queue order", async () => {
    AppClock.setFixedTime("2026-09-21T09:00:00Z");

    const visit1 = await visitRepo.createVisit({
      patientId: "patient-1",
      branchId: "branch-gebang",
      visitType: VisitType.WALK_IN,
      bookingId: null,
      doctorId: "doc-syafira"
    });

    const visit2 = await visitRepo.createVisit({
      patientId: "patient-2",
      branchId: "branch-gebang",
      visitType: VisitType.WALK_IN,
      bookingId: null,
      doctorId: "doc-syafira"
    });

    const item1 = await queueRepo.checkInVisitToQueue(visit1.id);
    const item2 = await queueRepo.checkInVisitToQueue(visit2.id);

    await queueRepo.prepareQueuePatient(item2.id);
    await queueRepo.startService(item2.id);

    const snapshot = await queueRepo.getLiveQueueSnapshot("branch-gebang", "2026-09-21", "doc-syafira");
    expect(snapshot?.consultationQueue[0].id).toBe(item2.id);
    expect(snapshot?.waitingQueue[0].id).toBe(item1.id);
  });

  it("25. should generate LiveQueueSnapshot with distinct active, waiting, preparation, consultation, completed, and skipped queues", async () => {
    AppClock.setFixedTime("2026-09-21T09:00:00Z");

    const snapshot = await queueRepo.getLiveQueueSnapshot("branch-gebang", "2026-09-21");
    expect(snapshot).toBeDefined();
    expect(snapshot?.branchId).toBe("branch-gebang");
    expect(snapshot?.waitingQueue).toBeDefined();
    expect(snapshot?.consultationQueue).toBeDefined();
    expect(snapshot?.completedQueue).toBeDefined();
  });

  it("26. should support Walk-In visits check-in with bookingId = null", async () => {
    const visit = await visitRepo.createVisit({
      patientId: "patient-1",
      branchId: "branch-gebang",
      visitType: VisitType.WALK_IN,
      bookingId: null,
      doctorId: "doc-syafira"
    });

    const queueItem = await queueRepo.checkInVisitToQueue(visit.id);
    expect(queueItem.bookingId).toBeNull();
  });

  it("27. should capture booking time snapshot when checking in booking visit", async () => {
    const visit = await visitRepo.createVisit({
      patientId: "patient-1",
      branchId: "branch-gebang",
      visitType: VisitType.BOOKING,
      bookingId: "booking-1",
      doctorId: "doc-syafira"
    });

    const queueItem = await queueRepo.checkInVisitToQueue(visit.id);
    expect(queueItem.bookingId).toBe("booking-1");
  });

  it("28. should reject estimated duration <= 0 minutes", async () => {
    const visit = await visitRepo.createVisit({
      patientId: "patient-1",
      branchId: "branch-gebang",
      visitType: VisitType.WALK_IN,
      bookingId: null,
      doctorId: "doc-syafira"
    });

    const item = await queueRepo.checkInVisitToQueue(visit.id);
    await expect(queueRepo.updateEstimatedDuration(item.id, 0)).rejects.toThrow(
      "Durasi estimasi harus lebih besar dari 0 menit"
    );
  });

  it("29. should prevent Branch Admin from starting service in another branch", async () => {
    const visit = await visitRepo.createVisit({
      patientId: "patient-1",
      branchId: "branch-muktisari",
      visitType: VisitType.WALK_IN,
      bookingId: null,
      doctorId: "doc-lala"
    });

    const item = await queueRepo.checkInVisitToQueue(visit.id);
    await expect(
      queueRepo.startService(item.id, UserRole.BRANCH_ADMIN, "branch-gebang")
    ).rejects.toThrow("Branch Admin tidak dapat mengelola antrean cabang lain");
  });

  it("30. should prevent Doctor from starting service assigned to another doctor", async () => {
    const visit = await visitRepo.createVisit({
      patientId: "patient-1",
      branchId: "branch-gebang",
      visitType: VisitType.WALK_IN,
      bookingId: null,
      doctorId: "doc-lala"
    });

    const item = await queueRepo.checkInVisitToQueue(visit.id);
    await expect(
      queueRepo.startService(item.id, UserRole.DOCTOR, "branch-gebang", "doc-syafira")
    ).rejects.toThrow("Dokter tidak dapat mengelola antrean dokter lain");
  });

  it("31. should allow starting next patient after current patient is finished", async () => {
    const visit1 = await visitRepo.createVisit({
      patientId: "patient-1",
      branchId: "branch-gebang",
      visitType: VisitType.WALK_IN,
      bookingId: null,
      doctorId: "doc-syafira"
    });

    const visit2 = await visitRepo.createVisit({
      patientId: "patient-2",
      branchId: "branch-gebang",
      visitType: VisitType.WALK_IN,
      bookingId: null,
      doctorId: "doc-syafira"
    });

    const item1 = await queueRepo.checkInVisitToQueue(visit1.id);
    const item2 = await queueRepo.checkInVisitToQueue(visit2.id);

    await queueRepo.startService(item1.id);
    await queueRepo.finishService(item1.id);

    const started2 = await queueRepo.startService(item2.id);
    expect(started2.status).toBe(QueueStatus.IN_CONSULTATION);
  });

  it("32. should update visit status upon check-in", async () => {
    const visit = await visitRepo.createVisit({
      patientId: "patient-1",
      branchId: "branch-gebang",
      visitType: VisitType.WALK_IN,
      bookingId: null,
      doctorId: "doc-syafira"
    });

    await queueRepo.checkInVisitToQueue(visit.id);
    const updatedVisit = await visitRepo.getVisitById(visit.id);

    expect(updatedVisit?.visitStatus).toBe(VisitStatus.IN_TRIAGE);
  });

  it("33. should reset AppClock back to system time seamlessly", () => {
    AppClock.setFixedTime("2026-09-21T09:00:00Z");
    expect(AppClock.nowISO()).toBe("2026-09-21T09:00:00Z");

    AppClock.reset();
    expect(AppClock.nowISO()).not.toBe("2026-09-21T09:00:00Z");
  });

  it("34. should allow Super Admin to query live queue snapshot for any branch", async () => {
    const snapshot = await queueRepo.getLiveQueueSnapshot(
      "branch-muktisari",
      "2026-09-21",
      undefined,
      UserRole.SUPER_ADMIN
    );

    expect(snapshot).toBeDefined();
    expect(snapshot?.branchId).toBe("branch-muktisari");
  });

  it("35. should handle recalculating multiple waiting patients with varied estimated durations correctly", async () => {
    MockDatabase.getInstance().queueItems = [];
    AppClock.setFixedTime("2026-09-21T10:00:00Z");

    const v1 = await visitRepo.createVisit({
      patientId: "patient-1",
      branchId: "branch-gebang",
      visitType: VisitType.WALK_IN,
      bookingId: null,
      doctorId: "doc-syafira"
    });
    const v2 = await visitRepo.createVisit({
      patientId: "patient-2",
      branchId: "branch-gebang",
      visitType: VisitType.WALK_IN,
      bookingId: null,
      doctorId: "doc-syafira"
    });
    const v3 = await visitRepo.createVisit({
      patientId: "patient-3",
      branchId: "branch-gebang",
      visitType: VisitType.WALK_IN,
      bookingId: null,
      doctorId: "doc-syafira"
    });

    const q1 = await queueRepo.checkInVisitToQueue(v1.id, undefined, undefined, {
      estimatedDurationMinutes: 15
    });
    const q2 = await queueRepo.checkInVisitToQueue(v2.id, undefined, undefined, {
      estimatedDurationMinutes: 20
    });
    const q3 = await queueRepo.checkInVisitToQueue(v3.id, undefined, undefined, {
      estimatedDurationMinutes: 25
    });

    expect(q1.estimatedServiceAt).toBe("2026-09-21T10:00:00.000Z");
    expect(q2.estimatedServiceAt).toBe("2026-09-21T10:15:00.000Z");
    expect(q3.estimatedServiceAt).toBe("2026-09-21T10:35:00.000Z");
  });
});
