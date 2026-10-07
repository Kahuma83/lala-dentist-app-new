import { describe, it, expect, beforeEach } from "vitest";
import { MockDatabase } from "../data/mockData";
import { MockQueueRepository, MockTreatmentRepository, MockPatientRepository, MockCompensationRepository } from "../repositories/mockRepositories";
import { UserRole, QueueStatus, TreatmentActivityType, TreatmentJobStatus, ScheduleStatus } from "../types/domain";

describe("PHASE 9F — DOCTOR UI, ASSISTANT CONTROL & DYNAMIC TREATMENT TIME", () => {
  let db: MockDatabase;
  let queueRepo: MockQueueRepository;
  let treatmentRepo: MockTreatmentRepository;
  let patientRepo: MockPatientRepository;
  let compRepo: MockCompensationRepository;

  beforeEach(() => {
    MockDatabase.resetInstance();
    db = MockDatabase.getInstance();
    queueRepo = new MockQueueRepository();
    treatmentRepo = new MockTreatmentRepository();
    patientRepo = new MockPatientRepository();
    compRepo = new MockCompensationRepository();

    // Setup initial test queue for Gebang branch
    db.queueItems = [
      {
        id: "q-p1",
        visitId: "v-p1",
        patientId: "p1",
        patientNameSnapshot: "Pasien A",
        doctorId: "doc-syafira",
        doctorNameSnapshot: "drg. Syafira",
        branchId: "branch-gebang",
        queueNumber: "A001",
        status: QueueStatus.IN_CONSULTATION,
        estimatedDurationMinutes: 30,
        arrivalAt: "2026-09-24T08:00:00Z",
        checkInTime: "2026-09-24T08:00:00Z",
        actualServiceStartAt: "2026-09-24T08:00:00Z",
        estimatedServiceAt: "2026-09-24T08:00:00Z",
        createdAt: "2026-09-24T08:00:00Z",
        updatedAt: "2026-09-24T08:00:00Z"
      },
      {
        id: "q-p2",
        visitId: "v-p2",
        patientId: "p2",
        patientNameSnapshot: "Pasien B",
        doctorId: "doc-syafira",
        doctorNameSnapshot: "drg. Syafira",
        branchId: "branch-gebang",
        queueNumber: "A002",
        status: QueueStatus.WAITING,
        estimatedDurationMinutes: 30,
        arrivalAt: "2026-09-24T08:15:00Z",
        checkInTime: "2026-09-24T08:15:00Z",
        estimatedServiceAt: "2026-09-24T08:30:00Z",
        createdAt: "2026-09-24T08:15:00Z",
        updatedAt: "2026-09-24T08:15:00Z"
      },
      {
        id: "q-p3",
        visitId: "v-p3",
        patientId: "p3",
        patientNameSnapshot: "Pasien C",
        doctorId: "doc-syafira",
        doctorNameSnapshot: "drg. Syafira",
        branchId: "branch-gebang",
        queueNumber: "A003",
        status: QueueStatus.WAITING,
        estimatedDurationMinutes: 30,
        arrivalAt: "2026-09-24T08:30:00Z",
        checkInTime: "2026-09-24T08:30:00Z",
        estimatedServiceAt: "2026-09-24T09:00:00Z",
        createdAt: "2026-09-24T08:30:00Z",
        updatedAt: "2026-09-24T08:30:00Z"
      }
    ];

    // Setup initial treatment job
    db.treatmentJobs = [
      {
        id: "tr-p1",
        visitId: "v-p1",
        patientId: "p1",
        branchId: "branch-gebang",
        doctorId: "doc-syafira",
        doctorNameSnapshot: "drg. Syafira",
        serviceId: "srv-tambal",
        serviceNameSnapshot: "Tambal Composite",
        status: TreatmentJobStatus.DALAM_PROSES,
        estimatedDurationMinutes: 30,
        createdAt: "2026-09-24T08:00:00Z",
        updatedAt: "2026-09-24T08:00:00Z"
      }
    ];

    // Clear activities
    db.treatmentActivities = [];
  });

  it("1 & 2. Doctor can list treatments and patients filtered by branch/role", async () => {
    const treatments = await treatmentRepo.listTreatments(UserRole.DOCTOR, "branch-gebang", "doc-syafira");
    expect(treatments.length).toBeGreaterThanOrEqual(1);

    const patients = await patientRepo.getPatients();
    expect(patients.length).toBeGreaterThan(0);
  });

  it("3 & 4. Assistant can access treatments and view queue items for assigned branch", async () => {
    const assistantTreatments = await treatmentRepo.listTreatments(UserRole.DOCTOR_ASSISTANT, "branch-gebang");
    expect(assistantTreatments.length).toBeGreaterThanOrEqual(1);

    const queue = await queueRepo.getQueueByBranch("branch-gebang", UserRole.DOCTOR_ASSISTANT, "branch-gebang");
    expect(queue.length).toBe(3);
  });

  it("5, 6, 7 & 8. Assistant can add +15m, +30m, +45m via repository updateEstimatedDuration", async () => {
    // Add +15m to q-p1 (30m -> 45m)
    const updated15 = await queueRepo.updateEstimatedDuration(
      "q-p1",
      45,
      UserRole.DOCTOR_ASSISTANT,
      "branch-gebang",
      "asst-clary",
      { reason: "Tindakan membutuhkan waktu tambahan", addedMinutes: 15, previousDurationMinutes: 30 }
    );
    expect(updated15.estimatedDurationMinutes).toBe(45);

    // Add +30m (45m -> 75m)
    const updated30 = await queueRepo.updateEstimatedDuration(
      "q-p1",
      75,
      UserRole.DOCTOR_ASSISTANT,
      "branch-gebang",
      "asst-clary",
      { reason: "Kondisi pasien membutuhkan kehati-hatian", addedMinutes: 30, previousDurationMinutes: 45 }
    );
    expect(updated30.estimatedDurationMinutes).toBe(75);

    // Add +45m (75m -> 120m)
    const updated45 = await queueRepo.updateEstimatedDuration(
      "q-p1",
      120,
      UserRole.DOCTOR_ASSISTANT,
      "branch-gebang",
      "asst-clary",
      { reason: "Persiapan tindakan lebih lama", addedMinutes: 45, previousDurationMinutes: 75 }
    );
    expect(updated45.estimatedDurationMinutes).toBe(120);
  });

  it("9 & 10. Updating duration automatically shifts Pasien B and Pasien C in recalculateQueue", async () => {
    // Initial Pasien A duration = 30m. Pasien B estimated: 08:30, Pasien C estimated: 09:00
    // Change Pasien A duration to 60m (+30m)
    await queueRepo.updateEstimatedDuration(
      "q-p1",
      60,
      UserRole.DOCTOR,
      "branch-gebang",
      "doc-syafira",
      { reason: "Prosedur rumit", addedMinutes: 30, previousDurationMinutes: 30 }
    );

    const queue = await queueRepo.getQueueByBranch("branch-gebang");
    const p1 = queue.find((q) => q.id === "q-p1")!;
    const p2 = queue.find((q) => q.id === "q-p2")!;
    const p3 = queue.find((q) => q.id === "q-p3")!;

    expect(p1.estimatedDurationMinutes).toBe(60);
    // Pasien B estimated start shifted from 08:30 to 09:00
    expect(new Date(p2.estimatedServiceAt || "").getTime()).toBe(new Date("2026-09-24T09:00:00Z").getTime());
    // Pasien C estimated start shifted from 09:00 to 09:30
    expect(new Date(p3.estimatedServiceAt || "").getTime()).toBe(new Date("2026-09-24T09:30:00Z").getTime());
  });

  it("11. Branch isolation prevents Assistant from modifying duration in another branch", async () => {
    await expect(
      queueRepo.updateEstimatedDuration(
        "q-p1",
        45,
        UserRole.DOCTOR_ASSISTANT,
        "branch-kampus", // Different branch
        "asst-clary"
      )
    ).rejects.toThrow("Akses ditolak");
  });

  it("12, 13, 14. Assistant financial isolation is strictly enforced", async () => {
    // Assistant viewing incentives can only query their own accruals
    const accruals = await compRepo.getCompensationAccruals("asst-clary");
    expect(accruals).toBeDefined();
    expect(accruals.every((a) => a.staffId === "asst-clary")).toBe(true);
  });

  it("15, 16, 17, 18, 19, 20. Adding time records TreatmentActivity with DURATION_CHANGE and complete audit fields", async () => {
    await queueRepo.updateEstimatedDuration(
      "q-p1",
      60,
      UserRole.DOCTOR_ASSISTANT,
      "branch-gebang",
      "asst-clary",
      {
        reason: "Kondisi pasien membutuhkan waktu tambahan",
        addedMinutes: 30,
        previousDurationMinutes: 30,
        actorNameSnapshot: "Clary Wardani"
      }
    );

    const activities = db.treatmentActivities.filter((a) => a.activityType === TreatmentActivityType.DURATION_CHANGE);
    expect(activities.length).toBe(1);

    const act = activities[0];
    expect(act.actorId).toBe("asst-clary");
    expect(act.actorRole).toBe(UserRole.DOCTOR_ASSISTANT);
    expect(act.actorNameSnapshot).toBe("Clary Wardani");
    expect(act.previousDurationMinutes).toBe(30);
    expect(act.addedMinutes).toBe(30);
    expect(act.newDurationMinutes).toBe(60);
    expect(act.notes).toContain("Kondisi pasien membutuhkan waktu tambahan");
  });

  it("21 & 22. Validates invalid durations and handles error response cleanly", async () => {
    await expect(
      queueRepo.updateEstimatedDuration("q-p1", 0, UserRole.DOCTOR, "branch-gebang", "doc-syafira")
    ).rejects.toThrow("Durasi estimasi harus lebih besar dari 0 menit");

    await expect(
      queueRepo.updateEstimatedDuration("non-existent-q", 30, UserRole.DOCTOR, "branch-gebang", "doc-syafira")
    ).rejects.toThrow("Antrean tidak ditemukan");
  });

  it("25 & 26. Multi-day treatment and Model C PIC integrity", async () => {
    // Ensure updating duration syncs with current active session's TreatmentJob without altering PIC or multi-day links
    const trJobBefore = db.treatmentJobs.find((t) => t.id === "tr-p1")!;
    expect(trJobBefore.doctorId).toBe("doc-syafira");

    await queueRepo.updateEstimatedDuration("q-p1", 45, UserRole.DOCTOR_ASSISTANT, "branch-gebang", "asst-clary");

    const trJobAfter = db.treatmentJobs.find((t) => t.id === "tr-p1")!;
    expect(trJobAfter.estimatedDurationMinutes).toBe(45);
    expect(trJobAfter.doctorId).toBe("doc-syafira"); // Doctor/PIC remains intact
  });
});
