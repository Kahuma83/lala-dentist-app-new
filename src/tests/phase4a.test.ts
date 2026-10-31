import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MockDatabase } from "../data/mockData";
import {
  MockVisitRepository,
  MockTreatmentRepository,
  MockTreatmentActivityRepository
} from "../repositories/mockRepositories";
import {
  UserRole,
  VisitType,
  VisitStatus,
  TreatmentJobStatus,
  TreatmentActivityType
} from "../types/domain";
import { AppClock } from "../utils/clock";

describe("Lala Dentist Web Admin - Phase 4A Treatment Core Tests", () => {
  let visitRepo: MockVisitRepository;
  let treatmentRepo: MockTreatmentRepository;

  beforeEach(() => {
    MockDatabase.resetInstance();
    AppClock.reset();
    AppClock.setFixedTime("2026-09-21T09:00:00Z");

    visitRepo = new MockVisitRepository();
    treatmentRepo = new MockTreatmentRepository();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ==========================================
  // CREATION (1-10)
  // ==========================================

  it("1. Create treatment berhasil with valid data", async () => {
    const visit = await visitRepo.createVisit({
      patientId: "patient-1",
      branchId: "branch-gebang",
      visitType: VisitType.WALK_IN,
      bookingId: null,
      doctorId: "doc-syafira"
    });

    const treatment = await treatmentRepo.createTreatmentJob({
      visitId: visit.id,
      serviceId: "service-scaling",
      doctorId: "doc-syafira"
    });

    expect(treatment).toBeDefined();
    expect(treatment.id).toBeDefined();
    expect(treatment.visitId).toBe(visit.id);
    expect(treatment.patientId).toBe("patient-1");
    expect(treatment.branchId).toBe("branch-gebang");
    expect(treatment.doctorId).toBe("doc-syafira");
    expect(treatment.serviceId).toBe("service-scaling");
    expect(treatment.status).toBe(TreatmentJobStatus.BELUM_DIMULAI);
  });

  it("uses the official branch tariff when creating a treatment", async () => {
    const visit = await visitRepo.createVisit({
      patientId: "patient-1",
      branchId: "branch-gebang",
      visitType: VisitType.WALK_IN,
      bookingId: null,
      doctorId: "doc-syafira"
    });

    const treatment = await treatmentRepo.createTreatmentJob({
      visitId: visit.id,
      serviceId: "service-scaling",
      doctorId: "doc-syafira",
      patientApprovalConfirmed: true
    }, UserRole.DOCTOR, "branch-gebang", "doc-syafira");

    const officialTariff = MockDatabase.getInstance().tariffs.find(
      (tariff) => tariff.branchId === visit.branchId && tariff.serviceId === "service-scaling" && tariff.isActive
    );
    expect(treatment.priceSnapshot).toBe(officialTariff?.customPrice ?? MockDatabase.getInstance().services.find((service) => service.id === "service-scaling")?.basePrice);
    expect(treatment.patientApprovalMethod).toBe("VERBAL");
    expect(treatment.patientApprovedBy).toBe("doc-syafira");
  });

  it("allows the assigned doctor to adjust the treatment price and records an audit activity", async () => {
    const visit = await visitRepo.createVisit({
      patientId: "patient-1",
      branchId: "branch-gebang",
      visitType: VisitType.WALK_IN,
      bookingId: null,
      doctorId: "doc-syafira"
    });

    await expect(
      treatmentRepo.createTreatmentJob(
        {
          visitId: visit.id,
          serviceId: "service-scaling",
          doctorId: "doc-syafira",
          priceSnapshot: 175_000,
          patientApprovalConfirmed: true
        },
        UserRole.DOCTOR,
        "branch-gebang",
        "user-drg-syafira"
      )
    ).resolves.toMatchObject({ priceSnapshot: 175_000 });

    const treatment = MockDatabase.getInstance().treatmentJobs.at(-1);
    if (!treatment) throw new Error("Treatment price adjustment fixture was not created");
    const activities = await new MockTreatmentActivityRepository().listActivitiesByTreatment(treatment.id);
    expect(activities.some((activity) =>
      activity.activityType === TreatmentActivityType.OTHER
      && activity.notes?.includes("175.000")
    )).toBe(true);
  });

  it("does not allow an assistant to override a treatment price", async () => {
    const visit = await visitRepo.createVisit({
      patientId: "patient-1",
      branchId: "branch-gebang",
      visitType: VisitType.WALK_IN,
      bookingId: null,
      doctorId: "doc-syafira"
    });

    await expect(treatmentRepo.createTreatmentJob({
      visitId: visit.id,
      serviceId: "service-scaling",
      doctorId: "doc-syafira",
      priceSnapshot: 1
    }, UserRole.DOCTOR_ASSISTANT, "branch-gebang", "assistant-clary"))
      .rejects.toThrow("Hanya dokter yang dapat menyesuaikan harga tindakan");
  });

  it("cancels only an unstarted plan and records the reason", async () => {
    const visit = await visitRepo.createVisit({
      patientId: "patient-1",
      branchId: "branch-gebang",
      visitType: VisitType.WALK_IN,
      bookingId: null,
      doctorId: "doc-syafira"
    });
    const treatment = await treatmentRepo.createTreatmentJob({
      visitId: visit.id,
      serviceId: "service-scaling",
      doctorId: "doc-syafira"
    });

    const cancelled = await treatmentRepo.cancelTreatmentJob(
      treatment.id,
      "Pasien memilih menunda tindakan",
      UserRole.DOCTOR,
      "branch-gebang",
      "doc-syafira"
    );

    expect(cancelled.status).toBe(TreatmentJobStatus.DIBATALKAN);
    expect(cancelled.cancellationReason).toBe("Pasien memilih menunda tindakan");
    const activities = await new MockTreatmentActivityRepository().listActivitiesByTreatment(cancelled.id);
    expect(activities.at(-1)?.activityType).toBe(TreatmentActivityType.CANCELLED);
  });

  it("requires explicit confirmation to cancel an in-progress item", async () => {
    const visit = await visitRepo.createVisit({
      patientId: "patient-1",
      branchId: "branch-gebang",
      visitType: VisitType.WALK_IN,
      bookingId: null,
      doctorId: "doc-syafira"
    });
    const treatment = await treatmentRepo.createTreatmentJob({
      visitId: visit.id,
      serviceId: "service-scaling",
      doctorId: "doc-syafira"
    });
    await treatmentRepo.startTreatmentJob(treatment.id);

    await expect(treatmentRepo.cancelTreatmentJob(
      treatment.id,
      "Pasien menunda item ini",
      UserRole.DOCTOR,
      "branch-gebang",
      "doc-syafira"
    )).rejects.toThrow("Konfirmasi bahwa tindakan belum dikerjakan");
  });

  it("cancels an in-progress item only when it has no recorded material usage", async () => {
    const inventoryStorage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => inventoryStorage.get(key) ?? null,
      setItem: (key: string, value: string) => inventoryStorage.set(key, value)
    });
    const visit = await visitRepo.createVisit({
      patientId: "patient-1",
      branchId: "branch-gebang",
      visitType: VisitType.WALK_IN,
      bookingId: null,
      doctorId: "doc-syafira"
    });
    const treatment = await treatmentRepo.createTreatmentJob({
      visitId: visit.id,
      serviceId: "service-scaling",
      doctorId: "doc-syafira"
    });
    await treatmentRepo.startTreatmentJob(treatment.id);

    await expect(treatmentRepo.cancelTreatmentJob(
      treatment.id,
      "Item ini tidak jadi dikerjakan",
      UserRole.DOCTOR,
      "branch-gebang",
      "doc-syafira",
      undefined,
      true
    )).resolves.toMatchObject({ status: TreatmentJobStatus.DIBATALKAN });

    const clinicallyProgressedTreatment = await treatmentRepo.createTreatmentJob({
      visitId: visit.id,
      serviceId: "service-scaling",
      doctorId: "doc-syafira"
    });
    await treatmentRepo.startTreatmentJob(clinicallyProgressedTreatment.id);
    await new MockTreatmentActivityRepository().addActivity({
      treatmentId: clinicallyProgressedTreatment.id,
      actorId: "doc-syafira",
      actorRole: UserRole.DOCTOR,
      actorNameSnapshot: "dr. Syafira",
      activityType: TreatmentActivityType.PROGRESS,
      notes: "Tindakan sudah dikerjakan"
    });

    await expect(treatmentRepo.cancelTreatmentJob(
      clinicallyProgressedTreatment.id,
      "Item ini tidak jadi dikerjakan",
      UserRole.DOCTOR,
      "branch-gebang",
      "doc-syafira",
      undefined,
      true
    )).rejects.toThrow("aktivitas tindakan selain mulai sudah tercatat");

    const usedTreatment = await treatmentRepo.createTreatmentJob({
      visitId: visit.id,
      serviceId: "service-scaling",
      doctorId: "doc-syafira"
    });
    await treatmentRepo.startTreatmentJob(usedTreatment.id);
    inventoryStorage.set("lala-dentist-inventory-v1", JSON.stringify({
      items: [],
      movements: [],
      consumedTreatmentIds: [usedTreatment.id]
    }));

    await expect(treatmentRepo.cancelTreatmentJob(
      usedTreatment.id,
      "Item ini tidak jadi dikerjakan",
      UserRole.DOCTOR,
      "branch-gebang",
      "doc-syafira",
      undefined,
      true
    )).rejects.toThrow("pemakaian bahan sudah tercatat");
  });

  it("2. Visit wajib valid (non-existent visit ID rejected)", async () => {
    await expect(
      treatmentRepo.createTreatmentJob({
        visitId: "non-existent-visit",
        serviceId: "service-scaling",
        doctorId: "doc-syafira"
      })
    ).rejects.toThrow("Visit tidak ditemukan");
  });

  it("3. Patient berasal dari Visit", async () => {
    const visit = await visitRepo.createVisit({
      patientId: "patient-1",
      branchId: "branch-gebang",
      visitType: VisitType.WALK_IN,
      bookingId: null,
      doctorId: "doc-syafira"
    });

    const treatment = await treatmentRepo.createTreatmentJob({
      visitId: visit.id,
      serviceId: "service-scaling",
      doctorId: "doc-syafira"
    });

    expect(treatment.patientId).toBe(visit.patientId);
  });

  it("4. Service wajib valid (non-existent service ID rejected)", async () => {
    const visit = await visitRepo.createVisit({
      patientId: "patient-1",
      branchId: "branch-gebang",
      visitType: VisitType.WALK_IN,
      bookingId: null,
      doctorId: "doc-syafira"
    });

    await expect(
      treatmentRepo.createTreatmentJob({
        visitId: visit.id,
        serviceId: "non-existent-service",
        doctorId: "doc-syafira"
      })
    ).rejects.toThrow("Master Service tidak ditemukan");
  });

  it("5. Doctor wajib valid (non-existent doctor ID rejected)", async () => {
    const visit = await visitRepo.createVisit({
      patientId: "patient-1",
      branchId: "branch-gebang",
      visitType: VisitType.WALK_IN,
      bookingId: null,
      doctorId: "doc-syafira"
    });

    await expect(
      treatmentRepo.createTreatmentJob({
        visitId: visit.id,
        serviceId: "service-scaling",
        doctorId: "non-existent-doctor"
      })
    ).rejects.toThrow("Dokter tidak ditemukan");
  });

  it("6. Branch wajib valid (treatment branch derived from visit)", async () => {
    const visit = await visitRepo.createVisit({
      patientId: "patient-1",
      branchId: "branch-muktisari",
      visitType: VisitType.WALK_IN,
      bookingId: null,
      doctorId: "doc-syafira"
    });

    const treatment = await treatmentRepo.createTreatmentJob({
      visitId: visit.id,
      serviceId: "service-scaling",
      doctorId: "doc-syafira"
    });

    expect(treatment.branchId).toBe("branch-muktisari");
  });

  it("7. Treatment branch harus sama dengan Visit (mismatched branch ID rejected)", async () => {
    const visit = await visitRepo.createVisit({
      patientId: "patient-1",
      branchId: "branch-gebang",
      visitType: VisitType.WALK_IN,
      bookingId: null,
      doctorId: "doc-syafira"
    });

    await expect(
      treatmentRepo.createTreatmentJob({
        visitId: visit.id,
        serviceId: "service-scaling",
        doctorId: "doc-syafira",
        branchId: "branch-muktisari"
      })
    ).rejects.toThrow("Branch ID treatment harus sama dengan Visit");
  });

  it("8. Patient harus konsisten dengan Visit (mismatched patient ID rejected)", async () => {
    const visit = await visitRepo.createVisit({
      patientId: "patient-1",
      branchId: "branch-gebang",
      visitType: VisitType.WALK_IN,
      bookingId: null,
      doctorId: "doc-syafira"
    });

    await expect(
      treatmentRepo.createTreatmentJob({
        visitId: visit.id,
        serviceId: "service-scaling",
        doctorId: "doc-syafira",
        patientId: "patient-2"
      })
    ).rejects.toThrow("Patient ID tidak cocok dengan Visit");
  });

  it("9. serviceNameSnapshot tersimpan", async () => {
    const visit = await visitRepo.createVisit({
      patientId: "patient-1",
      branchId: "branch-gebang",
      visitType: VisitType.WALK_IN,
      bookingId: null,
      doctorId: "doc-syafira"
    });

    const treatment = await treatmentRepo.createTreatmentJob({
      visitId: visit.id,
      serviceId: "service-scaling",
      doctorId: "doc-syafira"
    });

    expect(treatment.serviceNameSnapshot).toBe("Scaling");
  });

  it("10. doctorNameSnapshot tersimpan", async () => {
    const visit = await visitRepo.createVisit({
      patientId: "patient-1",
      branchId: "branch-gebang",
      visitType: VisitType.WALK_IN,
      bookingId: null,
      doctorId: "doc-syafira"
    });

    const treatment = await treatmentRepo.createTreatmentJob({
      visitId: visit.id,
      serviceId: "service-scaling",
      doctorId: "doc-syafira"
    });

    expect(treatment.doctorNameSnapshot).toBe("drg. Syafira");
  });

  // ==========================================
  // MULTIPLE TREATMENT (11-12)
  // ==========================================

  it("11. Satu Visit dapat memiliki multiple TreatmentJob", async () => {
    const visit = await visitRepo.createVisit({
      patientId: "patient-1",
      branchId: "branch-gebang",
      visitType: VisitType.WALK_IN,
      bookingId: null,
      doctorId: "doc-syafira"
    });

    const t1 = await treatmentRepo.createTreatmentJob({
      visitId: visit.id,
      serviceId: "service-scaling",
      doctorId: "doc-syafira"
    });

    const t2 = await treatmentRepo.createTreatmentJob({
      visitId: visit.id,
      serviceId: "service-restoration",
      doctorId: "doc-syafira"
    });

    const list = await treatmentRepo.getTreatmentsByVisit(visit.id);
    expect(list.length).toBe(2);
    expect(list.map((t) => t.id)).toContain(t1.id);
    expect(list.map((t) => t.id)).toContain(t2.id);
  });

  it("12. Treatment berbeda dapat menggunakan service yang sama jika memang valid", async () => {
    const visit = await visitRepo.createVisit({
      patientId: "patient-1",
      branchId: "branch-gebang",
      visitType: VisitType.WALK_IN,
      bookingId: null,
      doctorId: "doc-syafira"
    });

    const t1 = await treatmentRepo.createTreatmentJob({
      visitId: visit.id,
      serviceId: "service-restoration",
      doctorId: "doc-syafira",
      notes: "Tambal gigi #11"
    });

    const t2 = await treatmentRepo.createTreatmentJob({
      visitId: visit.id,
      serviceId: "service-restoration",
      doctorId: "doc-syafira",
      notes: "Tambal gigi #21"
    });

    expect(t1.id).not.toBe(t2.id);
    expect(t1.serviceId).toBe("service-restoration");
    expect(t2.serviceId).toBe("service-restoration");

    const list = await treatmentRepo.getTreatmentsByVisit(visit.id);
    expect(list.length).toBe(2);
  });

  // ==========================================
  // STATE MACHINE & TRANSITIONS (13-21)
  // ==========================================

  it("13. Default status BELUM_DIMULAI", async () => {
    const visit = await visitRepo.createVisit({
      patientId: "patient-1",
      branchId: "branch-gebang",
      visitType: VisitType.WALK_IN,
      bookingId: null,
      doctorId: "doc-syafira"
    });

    const t = await treatmentRepo.createTreatmentJob({
      visitId: visit.id,
      serviceId: "service-scaling",
      doctorId: "doc-syafira"
    });

    expect(t.status).toBe(TreatmentJobStatus.BELUM_DIMULAI);
  });

  it("14. BELUM_DIMULAI -> DALAM_PROSES", async () => {
    const visit = await visitRepo.createVisit({
      patientId: "patient-1",
      branchId: "branch-gebang",
      visitType: VisitType.WALK_IN,
      bookingId: null,
      doctorId: "doc-syafira"
    });

    const t = await treatmentRepo.createTreatmentJob({
      visitId: visit.id,
      serviceId: "service-scaling",
      doctorId: "doc-syafira"
    });

    const started = await treatmentRepo.startTreatmentJob(t.id);
    expect(started.status).toBe(TreatmentJobStatus.DALAM_PROSES);
    expect(started.startedAt).toBeDefined();
  });

  it("allows the assigned doctor to start treatment using the linked doctor ID", async () => {
    const visit = await visitRepo.createVisit({
      patientId: "patient-1",
      branchId: "branch-gebang",
      visitType: VisitType.WALK_IN,
      bookingId: null,
      doctorId: "doc-syafira"
    });
    const treatment = await treatmentRepo.createTreatmentJob({
      visitId: visit.id,
      serviceId: "service-scaling",
      doctorId: "doc-syafira"
    });

    await expect(treatmentRepo.startTreatmentJob(
      treatment.id,
      UserRole.DOCTOR,
      "branch-gebang",
      "doc-syafira"
    )).resolves.toMatchObject({ status: TreatmentJobStatus.DALAM_PROSES });
  });

  it("15. DALAM_PROSES -> SELESAI", async () => {
    const visit = await visitRepo.createVisit({
      patientId: "patient-1",
      branchId: "branch-gebang",
      visitType: VisitType.WALK_IN,
      bookingId: null,
      doctorId: "doc-syafira"
    });

    const t = await treatmentRepo.createTreatmentJob({
      visitId: visit.id,
      serviceId: "service-scaling",
      doctorId: "doc-syafira"
    });

    await treatmentRepo.startTreatmentJob(t.id);
    const completed = await treatmentRepo.completeTreatmentJob(t.id);

    expect(completed.status).toBe(TreatmentJobStatus.SELESAI);
    expect(completed.completedAt).toBeDefined();
  });

  it("records the final price and an audit activity when the assigned doctor completes treatment", async () => {
    const visit = await visitRepo.createVisit({
      patientId: "patient-1",
      branchId: "branch-gebang",
      visitType: VisitType.WALK_IN,
      bookingId: null,
      doctorId: "doc-syafira"
    });
    const treatment = await treatmentRepo.createTreatmentJob({
      visitId: visit.id,
      serviceId: "service-scaling",
      doctorId: "doc-syafira",
      patientApprovalConfirmed: true
    }, UserRole.DOCTOR, "branch-gebang", "doc-syafira");
    await treatmentRepo.startTreatmentJob(treatment.id, UserRole.DOCTOR, "branch-gebang", "doc-syafira");

    const completed = await treatmentRepo.completeTreatmentJob(
      treatment.id,
      UserRole.DOCTOR,
      "branch-gebang",
      "doc-syafira",
      { actorId: "doc-syafira", actorRole: UserRole.DOCTOR, notes: "Selesai" },
      { finalPriceSnapshot: 125_000, patientApprovalConfirmed: true }
    );

    expect(completed).toMatchObject({
      status: TreatmentJobStatus.SELESAI,
      priceSnapshot: 125_000
    });
    const activities = await new MockTreatmentActivityRepository().listActivitiesByTreatment(treatment.id);
    expect(activities.some((activity) =>
      activity.activityType === TreatmentActivityType.OTHER
      && activity.notes?.includes("Harga final Rp 125.000 dicatat setelah tindakan")
    )).toBe(true);
  });

  it("rejects final-price completion without recorded patient approval", async () => {
    const visit = await visitRepo.createVisit({
      patientId: "patient-1",
      branchId: "branch-gebang",
      visitType: VisitType.WALK_IN,
      bookingId: null,
      doctorId: "doc-syafira"
    });
    const treatment = await treatmentRepo.createTreatmentJob({
      visitId: visit.id,
      serviceId: "service-scaling",
      doctorId: "doc-syafira",
      patientApprovalConfirmed: true
    }, UserRole.DOCTOR, "branch-gebang", "doc-syafira");
    await treatmentRepo.startTreatmentJob(treatment.id, UserRole.DOCTOR, "branch-gebang", "doc-syafira");

    await expect(treatmentRepo.completeTreatmentJob(
      treatment.id,
      UserRole.DOCTOR,
      "branch-gebang",
      "doc-syafira",
      undefined,
      { finalPriceSnapshot: 125_000, patientApprovalConfirmed: false }
    )).rejects.toThrow("harga final sebelum tindakan");
    await expect(treatmentRepo.getTreatmentJobById(treatment.id)).resolves.toMatchObject({
      status: TreatmentJobStatus.DALAM_PROSES
    });
  });

  it("16. SELESAI -> DISERAHKAN", async () => {
    const visit = await visitRepo.createVisit({
      patientId: "patient-1",
      branchId: "branch-gebang",
      visitType: VisitType.WALK_IN,
      bookingId: null,
      doctorId: "doc-syafira"
    });

    const t = await treatmentRepo.createTreatmentJob({
      visitId: visit.id,
      serviceId: "service-scaling",
      doctorId: "doc-syafira"
    });

    await treatmentRepo.startTreatmentJob(t.id);
    await treatmentRepo.completeTreatmentJob(t.id);
    const handedOver = await treatmentRepo.handOverTreatmentJob(t.id);

    expect(handedOver.status).toBe(TreatmentJobStatus.DISERAHKAN);
    expect(handedOver.handedOverAt).toBeDefined();
  });

  it("17. Invalid BELUM_DIMULAI -> SELESAI ditolak", async () => {
    const visit = await visitRepo.createVisit({
      patientId: "patient-1",
      branchId: "branch-gebang",
      visitType: VisitType.WALK_IN,
      bookingId: null,
      doctorId: "doc-syafira"
    });

    const t = await treatmentRepo.createTreatmentJob({
      visitId: visit.id,
      serviceId: "service-scaling",
      doctorId: "doc-syafira"
    });

    await expect(treatmentRepo.completeTreatmentJob(t.id)).rejects.toThrow();
  });

  it("18. Invalid BELUM_DIMULAI -> DISERAHKAN ditolak", async () => {
    const visit = await visitRepo.createVisit({
      patientId: "patient-1",
      branchId: "branch-gebang",
      visitType: VisitType.WALK_IN,
      bookingId: null,
      doctorId: "doc-syafira"
    });

    const t = await treatmentRepo.createTreatmentJob({
      visitId: visit.id,
      serviceId: "service-scaling",
      doctorId: "doc-syafira"
    });

    await expect(treatmentRepo.handOverTreatmentJob(t.id)).rejects.toThrow();
  });

  it("19. Invalid DALAM_PROSES -> DISERAHKAN ditolak", async () => {
    const visit = await visitRepo.createVisit({
      patientId: "patient-1",
      branchId: "branch-gebang",
      visitType: VisitType.WALK_IN,
      bookingId: null,
      doctorId: "doc-syafira"
    });

    const t = await treatmentRepo.createTreatmentJob({
      visitId: visit.id,
      serviceId: "service-scaling",
      doctorId: "doc-syafira"
    });

    await treatmentRepo.startTreatmentJob(t.id);
    await expect(treatmentRepo.handOverTreatmentJob(t.id)).rejects.toThrow();
  });

  it("20. Invalid SELESAI -> DALAM_PROSES ditolak", async () => {
    const visit = await visitRepo.createVisit({
      patientId: "patient-1",
      branchId: "branch-gebang",
      visitType: VisitType.WALK_IN,
      bookingId: null,
      doctorId: "doc-syafira"
    });

    const t = await treatmentRepo.createTreatmentJob({
      visitId: visit.id,
      serviceId: "service-scaling",
      doctorId: "doc-syafira"
    });

    await treatmentRepo.startTreatmentJob(t.id);
    await treatmentRepo.completeTreatmentJob(t.id);

    await expect(treatmentRepo.startTreatmentJob(t.id)).rejects.toThrow();
  });

  it("21. Invalid DISERAHKAN -> state lain ditolak", async () => {
    const visit = await visitRepo.createVisit({
      patientId: "patient-1",
      branchId: "branch-gebang",
      visitType: VisitType.WALK_IN,
      bookingId: null,
      doctorId: "doc-syafira"
    });

    const t = await treatmentRepo.createTreatmentJob({
      visitId: visit.id,
      serviceId: "service-scaling",
      doctorId: "doc-syafira"
    });

    await treatmentRepo.startTreatmentJob(t.id);
    await treatmentRepo.completeTreatmentJob(t.id);
    await treatmentRepo.handOverTreatmentJob(t.id);

    await expect(treatmentRepo.startTreatmentJob(t.id)).rejects.toThrow();
    await expect(treatmentRepo.completeTreatmentJob(t.id)).rejects.toThrow();
    await expect(treatmentRepo.handOverTreatmentJob(t.id)).rejects.toThrow();
  });

  // ==========================================
  // TIMESTAMPS (22-25)
  // ==========================================

  it("22. Start menggunakan AppClock", async () => {
    AppClock.setFixedTime("2026-09-21T09:30:00Z");

    const visit = await visitRepo.createVisit({
      patientId: "patient-1",
      branchId: "branch-gebang",
      visitType: VisitType.WALK_IN,
      bookingId: null,
      doctorId: "doc-syafira"
    });

    const t = await treatmentRepo.createTreatmentJob({
      visitId: visit.id,
      serviceId: "service-scaling",
      doctorId: "doc-syafira"
    });

    AppClock.setFixedTime("2026-09-21T09:40:00Z");
    const started = await treatmentRepo.startTreatmentJob(t.id);

    expect(started.startedAt).toBe("2026-09-21T09:40:00Z");
  });

  it("23. Complete menggunakan AppClock", async () => {
    AppClock.setFixedTime("2026-09-21T09:30:00Z");

    const visit = await visitRepo.createVisit({
      patientId: "patient-1",
      branchId: "branch-gebang",
      visitType: VisitType.WALK_IN,
      bookingId: null,
      doctorId: "doc-syafira"
    });

    const t = await treatmentRepo.createTreatmentJob({
      visitId: visit.id,
      serviceId: "service-scaling",
      doctorId: "doc-syafira"
    });

    await treatmentRepo.startTreatmentJob(t.id);

    AppClock.setFixedTime("2026-09-21T10:15:00Z");
    const completed = await treatmentRepo.completeTreatmentJob(t.id);

    expect(completed.completedAt).toBe("2026-09-21T10:15:00Z");
  });

  it("24. Handover menggunakan AppClock", async () => {
    AppClock.setFixedTime("2026-09-21T09:30:00Z");

    const visit = await visitRepo.createVisit({
      patientId: "patient-1",
      branchId: "branch-gebang",
      visitType: VisitType.WALK_IN,
      bookingId: null,
      doctorId: "doc-syafira"
    });

    const t = await treatmentRepo.createTreatmentJob({
      visitId: visit.id,
      serviceId: "service-scaling",
      doctorId: "doc-syafira"
    });

    await treatmentRepo.startTreatmentJob(t.id);
    await treatmentRepo.completeTreatmentJob(t.id);

    AppClock.setFixedTime("2026-09-21T10:20:00Z");
    const handedOver = await treatmentRepo.handOverTreatmentJob(t.id);

    expect(handedOver.handedOverAt).toBe("2026-09-21T10:20:00Z");
  });

  it("25. Complete membutuhkan startedAt", async () => {
    const visit = await visitRepo.createVisit({
      patientId: "patient-1",
      branchId: "branch-gebang",
      visitType: VisitType.WALK_IN,
      bookingId: null,
      doctorId: "doc-syafira"
    });

    const t = await treatmentRepo.createTreatmentJob({
      visitId: visit.id,
      serviceId: "service-scaling",
      doctorId: "doc-syafira"
    });

    // Directly trying to complete without start will fail due to status check and startedAt check
    await expect(treatmentRepo.completeTreatmentJob(t.id)).rejects.toThrow();
  });

  // ==========================================
  // BRANCH & DOCTOR SECURITY (26-28)
  // ==========================================

  it("26. Branch Admin tidak dapat mengakses/membuat treatment branch lain", async () => {
    const visitGebang = await visitRepo.createVisit({
      patientId: "patient-1",
      branchId: "branch-gebang",
      visitType: VisitType.WALK_IN,
      bookingId: null,
      doctorId: "doc-syafira"
    });

    // Branch Admin Muktisari trying to create treatment for Gebang visit
    await expect(
      treatmentRepo.createTreatmentJob(
        {
          visitId: visitGebang.id,
          serviceId: "service-scaling",
          doctorId: "doc-syafira"
        },
        UserRole.BRANCH_ADMIN,
        "branch-muktisari"
      )
    ).rejects.toThrow("Branch Admin tidak dapat membuat treatment untuk cabang lain");

    // Super Admin creates treatment for Gebang
    const tGebang = await treatmentRepo.createTreatmentJob(
      {
        visitId: visitGebang.id,
        serviceId: "service-scaling",
        doctorId: "doc-syafira"
      },
      UserRole.SUPER_ADMIN
    );

    // Branch Admin Muktisari trying to get treatment from Gebang
    await expect(
      treatmentRepo.getTreatmentById(
        tGebang.id,
        UserRole.BRANCH_ADMIN,
        "branch-muktisari"
      )
    ).rejects.toThrow("Branch Admin tidak dapat mengakses treatment cabang lain");
  });

  it("27. Doctor tidak dapat mengakses/membuat treatment doctor lain", async () => {
    const visit = await visitRepo.createVisit({
      patientId: "patient-1",
      branchId: "branch-gebang",
      visitType: VisitType.WALK_IN,
      bookingId: null,
      doctorId: "doc-syafira"
    });

    // Doctor Budi trying to create treatment assigned to Doctor Andi
    await expect(
      treatmentRepo.createTreatmentJob(
        {
          visitId: visit.id,
          serviceId: "service-scaling",
          doctorId: "doc-syafira"
        },
        UserRole.DOCTOR,
        "branch-gebang",
        "doctor-budi"
      )
    ).rejects.toThrow("Dokter tidak dapat membuat treatment untuk dokter lain");

    // Doctor Andi creates treatment for himself
    const tAndi = await treatmentRepo.createTreatmentJob(
      {
        visitId: visit.id,
        serviceId: "service-scaling",
        doctorId: "doc-syafira"
      },
      UserRole.DOCTOR,
      "branch-gebang",
      "doc-syafira"
    );

    // Doctor Budi trying to manage Doctor Andi's treatment
    await expect(
      treatmentRepo.startTreatmentJob(
        tAndi.id,
        UserRole.DOCTOR,
        "branch-gebang",
        "doctor-budi"
      )
    ).rejects.toThrow("Dokter tidak dapat mengelola treatment dokter lain");
  });

  it("28. Super Admin dapat melihat cross branch", async () => {
    const visitGebang = await visitRepo.createVisit({
      patientId: "patient-1",
      branchId: "branch-gebang",
      visitType: VisitType.WALK_IN,
      bookingId: null,
      doctorId: "doc-syafira"
    });

    const visitMuktisari = await visitRepo.createVisit({
      patientId: "patient-2",
      branchId: "branch-muktisari",
      visitType: VisitType.WALK_IN,
      bookingId: null,
      doctorId: "doc-lala"
    });

    await treatmentRepo.createTreatmentJob({
      visitId: visitGebang.id,
      serviceId: "service-scaling",
      doctorId: "doc-syafira"
    });

    await treatmentRepo.createTreatmentJob({
      visitId: visitMuktisari.id,
      serviceId: "service-restoration",
      doctorId: "doc-lala"
    });

    const allTreatments = await treatmentRepo.listTreatments(UserRole.SUPER_ADMIN);
    expect(allTreatments.length).toBeGreaterThanOrEqual(2);
  });

  // ==========================================
  // SNAPSHOT INTEGRITY (29-30)
  // ==========================================

  it("29. Perubahan MasterService tidak mengubah serviceNameSnapshot treatment lama", async () => {
    const db = MockDatabase.getInstance();
    const service = db.services.find((s) => s.id === "service-scaling");
    expect(service).toBeDefined();

    const originalName = service!.name;

    const visit = await visitRepo.createVisit({
      patientId: "patient-1",
      branchId: "branch-gebang",
      visitType: VisitType.WALK_IN,
      bookingId: null,
      doctorId: "doc-syafira"
    });

    const t = await treatmentRepo.createTreatmentJob({
      visitId: visit.id,
      serviceId: "service-scaling",
      doctorId: "doc-syafira"
    });

    expect(t.serviceNameSnapshot).toBe(originalName);

    // Simulate updating MasterService name in master DB
    service!.name = "Scaling & Polishing Premium Ultra";

    const fetched = await treatmentRepo.getTreatmentJobById(t.id);
    expect(fetched!.serviceNameSnapshot).toBe(originalName);
    expect(fetched!.serviceNameSnapshot).not.toBe("Scaling & Polishing Premium Ultra");
  });

  it("30. Perubahan nama Doctor tidak mengubah doctorNameSnapshot treatment lama", async () => {
    const db = MockDatabase.getInstance();
    const doctor = db.doctors.find((d) => d.id === "doc-syafira");
    expect(doctor).toBeDefined();

    const originalDoctorName = doctor!.name;

    const visit = await visitRepo.createVisit({
      patientId: "patient-1",
      branchId: "branch-gebang",
      visitType: VisitType.WALK_IN,
      bookingId: null,
      doctorId: "doc-syafira"
    });

    const t = await treatmentRepo.createTreatmentJob({
      visitId: visit.id,
      serviceId: "service-scaling",
      doctorId: "doc-syafira"
    });

    expect(t.doctorNameSnapshot).toBe(originalDoctorName);

    // Simulate updating doctor's name in master DB
    doctor!.name = "drg. Syafira, Sp.KG";

    const fetched = await treatmentRepo.getTreatmentJobById(t.id);
    expect(fetched!.doctorNameSnapshot).toBe(originalDoctorName);
    expect(fetched!.doctorNameSnapshot).not.toBe("drg. Syafira, Sp.KG");
  });
});
