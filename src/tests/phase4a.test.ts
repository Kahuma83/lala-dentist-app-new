import { describe, it, expect, beforeEach } from "vitest";
import { MockDatabase } from "../data/mockData";
import {
  MockVisitRepository,
  MockTreatmentRepository
} from "../repositories/mockRepositories";
import {
  UserRole,
  VisitType,
  VisitStatus,
  TreatmentJobStatus
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
