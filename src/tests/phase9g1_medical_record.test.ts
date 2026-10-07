import { describe, it, expect, beforeEach } from "vitest";
import { MockDatabase } from "../data/mockData";
import {
  MockMedicalRecordRepository,
  MockPatientRepository,
  MockVisitRepository,
  MockInvoiceRepository,
  MockAccountingRepository
} from "../repositories/mockRepositories";
import {
  UserRole,
  MedicalRecordStatus,
  VisitType,
  VisitStatus
} from "../types/domain";

describe("Phase 9G.1: Clinical Medical Record Core Tests", () => {
  let mrRepo: MockMedicalRecordRepository;
  let patientRepo: MockPatientRepository;
  let visitRepo: MockVisitRepository;
  let invoiceRepo: MockInvoiceRepository;
  let accountingRepo: MockAccountingRepository;

  beforeEach(() => {
    MockDatabase.resetInstance();
    mrRepo = new MockMedicalRecordRepository();
    patientRepo = new MockPatientRepository();
    visitRepo = new MockVisitRepository();
    invoiceRepo = new MockInvoiceRepository();
    accountingRepo = new MockAccountingRepository();
  });

  // TEST 1: Create Medical Record untuk Visit valid
  it("TEST 1: Create Medical Record untuk Visit valid -> Expected: PASS", async () => {
    const record = await mrRepo.createOrUpdateMedicalRecord(
      {
        visitId: "visit-1",
        patientId: "patient-1",
        branchId: "branch-gebang",
        doctorId: "doc-syafira",
        chiefComplaint: "Gigi ngilu saat minum dingin",
        anamnesis: "Terasa sejak 3 hari yang lalu",
        clinicalExamination: "Karies dentin pada oklusal gigi 36",
        diagnosis: "Pulpitis reversibel gigi 36",
        treatmentPlan: "Penambalan komposit",
        doctorNotes: "Kontrol 1 minggu lagi jika ada keluhan",
        status: MedicalRecordStatus.DRAFT
      },
      UserRole.DOCTOR,
      "branch-gebang"
    );

    expect(record).toBeDefined();
    expect(record.id).toBeDefined();
    expect(record.visitId).toBe("visit-1");
    expect(record.chiefComplaint).toBe("Gigi ngilu saat minum dingin");
    expect(record.diagnosis).toBe("Pulpitis reversibel gigi 36");
    expect(record.status).toBe(MedicalRecordStatus.DRAFT);
  });

  // TEST 2: Medical Record terhubung Patient
  it("TEST 2: Medical Record terhubung Patient -> Expected: PASS", async () => {
    const record = await mrRepo.createOrUpdateMedicalRecord(
      {
        visitId: "visit-1",
        patientId: "patient-1",
        branchId: "branch-gebang",
        doctorId: "doc-syafira",
        chiefComplaint: "Pembersihan karang gigi",
        diagnosis: "Gingivitis kronis e.c. kalkulus",
        status: MedicalRecordStatus.FINAL
      },
      UserRole.DOCTOR,
      "branch-gebang"
    );

    expect(record.patientId).toBe("patient-1");
    const p = await patientRepo.getPatientById("patient-1");
    expect(p).toBeDefined();
    expect(p?.id).toBe(record.patientId);
  });

  // TEST 3: Medical Record terhubung Visit
  it("TEST 3: Medical Record terhubung Visit -> Expected: PASS", async () => {
    await mrRepo.createOrUpdateMedicalRecord(
      {
        visitId: "visit-1",
        patientId: "patient-1",
        branchId: "branch-gebang",
        doctorId: "doc-syafira",
        chiefComplaint: "Sakit gigi geraham",
        diagnosis: "Periodontitis apikalis",
        status: MedicalRecordStatus.DRAFT
      },
      UserRole.DOCTOR,
      "branch-gebang"
    );

    const fetchedByVisit = await mrRepo.getMedicalRecordByVisit("visit-1", UserRole.DOCTOR, "branch-gebang");
    expect(fetchedByVisit).toBeDefined();
    expect(fetchedByVisit?.visitId).toBe("visit-1");
    expect(fetchedByVisit?.patientId).toBe("patient-1");
  });

  // TEST 4: Patient A tidak dapat membaca Medical Record Patient B (Branch/Isolation check)
  it("TEST 4: Patient A / unauthorized user tidak dapat membaca Medical Record di luar scope -> Expected: REJECTED", async () => {
    // Create record in branch-gebang
    await mrRepo.createOrUpdateMedicalRecord(
      {
        visitId: "visit-1",
        patientId: "patient-1",
        branchId: "branch-gebang",
        doctorId: "doc-syafira",
        chiefComplaint: "Pemeriksaan rutin",
        diagnosis: "Kondisi umum baik",
        status: MedicalRecordStatus.FINAL
      },
      UserRole.DOCTOR,
      "branch-gebang"
    );

    // Branch Admin from Muktisari attempts to access Gebang medical record
    await expect(
      mrRepo.getMedicalRecordByVisit("visit-1", UserRole.BRANCH_ADMIN, "branch-muktisari")
    ).rejects.toThrow("Anda tidak memiliki akses ke data ini.");
  });

  // TEST 5: Doctor cabang A tidak dapat membaca Visit cabang B
  it("TEST 5: Doctor cabang A tidak dapat mengakses Visit / Record cabang B -> Expected: REJECTED", async () => {
    await expect(
      mrRepo.createOrUpdateMedicalRecord(
        {
          visitId: "visit-1", // Gebang visit
          patientId: "patient-1",
          branchId: "branch-muktisari", // Mismatch branch
          doctorId: "doc-syafira",
          chiefComplaint: "Keluhan",
          diagnosis: "Diagnosis",
          status: MedicalRecordStatus.DRAFT
        },
        UserRole.DOCTOR,
        "branch-muktisari"
      )
    ).rejects.toThrow("Anda tidak memiliki akses ke data ini.");
  });

  // TEST 6: Create Medical Record tanpa Visit
  it("TEST 6: Create Medical Record tanpa Visit -> Expected: REJECTED", async () => {
    await expect(
      mrRepo.createOrUpdateMedicalRecord(
        {
          visitId: "visit-non-existent-999",
          patientId: "patient-1",
          branchId: "branch-gebang",
          doctorId: "doc-syafira",
          chiefComplaint: "Keluhan fiktif",
          diagnosis: "Diagnosis fiktif",
          status: MedicalRecordStatus.DRAFT
        },
        UserRole.DOCTOR,
        "branch-gebang"
      )
    ).rejects.toThrow("Data kunjungan tidak ditemukan.");
  });

  // TEST 7: Duplicate Medical Record untuk Visit yang sama -> reuse existing record (Duplicate Protection)
  it("TEST 7: Duplicate Medical Record untuk Visit yang sama -> Expected: Reuses and updates existing record (No duplicates)", async () => {
    const db = MockDatabase.getInstance();

    const record1 = await mrRepo.createOrUpdateMedicalRecord(
      {
        visitId: "visit-1",
        patientId: "patient-1",
        branchId: "branch-gebang",
        doctorId: "doc-syafira",
        chiefComplaint: "Keluhan awal",
        diagnosis: "Diagnosis awal",
        status: MedicalRecordStatus.DRAFT
      },
      UserRole.DOCTOR,
      "branch-gebang"
    );

    const initialCount = db.medicalRecords.filter(r => r.visitId === "visit-1").length;
    expect(initialCount).toBe(1);

    // Attempt second save for the same visit
    const record2 = await mrRepo.createOrUpdateMedicalRecord(
      {
        visitId: "visit-1",
        patientId: "patient-1",
        branchId: "branch-gebang",
        doctorId: "doc-syafira",
        chiefComplaint: "Keluhan diperbarui",
        diagnosis: "Diagnosis fix",
        status: MedicalRecordStatus.FINAL
      },
      UserRole.DOCTOR,
      "branch-gebang"
    );

    const afterCount = db.medicalRecords.filter(r => r.visitId === "visit-1").length;
    expect(afterCount).toBe(1); // No new duplicate row created!
    expect(record2.id).toBe(record1.id);
    expect(record2.chiefComplaint).toBe("Keluhan diperbarui");
    expect(record2.diagnosis).toBe("Diagnosis fix");
    expect(record2.status).toBe(MedicalRecordStatus.FINAL);
  });

  // TEST 8: History pasien menampilkan seluruh Medical Record
  it("TEST 8: History pasien menampilkan seluruh Medical Record -> Expected: PASS", async () => {
    const db = MockDatabase.getInstance();

    // Create a 2nd visit for patient-1
    const visit2 = await visitRepo.createVisit(
      {
        bookingId: null,
        patientId: "patient-1",
        branchId: "branch-gebang",
        visitType: VisitType.WALK_IN,
        visitStatus: VisitStatus.COMPLETED,
        complaint: "Kontrol tambalan",
        visitDateTime: "2026-09-22T10:00:00Z"
      },
      UserRole.BRANCH_ADMIN,
      "branch-gebang"
    );

    // Create MR for visit 1
    await mrRepo.createOrUpdateMedicalRecord(
      {
        visitId: "visit-1",
        patientId: "patient-1",
        branchId: "branch-gebang",
        doctorId: "doc-syafira",
        chiefComplaint: "Visit 1 Keluhan",
        diagnosis: "Visit 1 Diagnosis",
        status: MedicalRecordStatus.FINAL
      },
      UserRole.DOCTOR,
      "branch-gebang"
    );

    // Create MR for visit 2
    await mrRepo.createOrUpdateMedicalRecord(
      {
        visitId: visit2.id,
        patientId: "patient-1",
        branchId: "branch-gebang",
        doctorId: "doc-syafira",
        chiefComplaint: "Visit 2 Keluhan Kontrol",
        diagnosis: "Visit 2 Tambalan baik",
        status: MedicalRecordStatus.FINAL
      },
      UserRole.DOCTOR,
      "branch-gebang"
    );

    const patientRecords = await mrRepo.getMedicalRecordsByPatient("patient-1", UserRole.DOCTOR, "branch-gebang");
    expect(patientRecords.length).toBe(2);
  });

  // TEST 9: Medical Record lama tidak tertimpa ketika Visit baru dibuat
  it("TEST 9: Medical Record lama tidak tertimpa ketika Visit baru dibuat -> Expected: PASS", async () => {
    // Visit 1 MR
    const mr1 = await mrRepo.createOrUpdateMedicalRecord(
      {
        visitId: "visit-1",
        patientId: "patient-1",
        branchId: "branch-gebang",
        doctorId: "doc-syafira",
        chiefComplaint: "Gigi ngilu visit 1",
        diagnosis: "Karies visit 1",
        status: MedicalRecordStatus.FINAL
      },
      UserRole.DOCTOR,
      "branch-gebang"
    );

    // New Visit 2
    const visit2 = await visitRepo.createVisit(
      {
        bookingId: null,
        patientId: "patient-1",
        branchId: "branch-gebang",
        visitType: VisitType.WALK_IN,
        visitStatus: VisitStatus.WAITING,
        complaint: "Scaling visit 2",
        visitDateTime: "2026-09-23T11:00:00Z"
      },
      UserRole.BRANCH_ADMIN,
      "branch-gebang"
    );

    // Create Visit 2 MR
    const mr2 = await mrRepo.createOrUpdateMedicalRecord(
      {
        visitId: visit2.id,
        patientId: "patient-1",
        branchId: "branch-gebang",
        doctorId: "doc-syafira",
        chiefComplaint: "Scaling visit 2 keluhan",
        diagnosis: "Kalkulus visit 2",
        status: MedicalRecordStatus.DRAFT
      },
      UserRole.DOCTOR,
      "branch-gebang"
    );

    // Verify Visit 1 MR is untouched
    const fetchedMR1 = await mrRepo.getMedicalRecordByVisit("visit-1", UserRole.DOCTOR, "branch-gebang");
    expect(fetchedMR1?.id).toBe(mr1.id);
    expect(fetchedMR1?.chiefComplaint).toBe("Gigi ngilu visit 1");
    expect(fetchedMR1?.diagnosis).toBe("Karies visit 1");
    expect(fetchedMR1?.status).toBe(MedicalRecordStatus.FINAL);

    // Verify Visit 2 MR exists independently
    const fetchedMR2 = await mrRepo.getMedicalRecordByVisit(visit2.id, UserRole.DOCTOR, "branch-gebang");
    expect(fetchedMR2?.id).toBe(mr2.id);
    expect(fetchedMR2?.chiefComplaint).toBe("Scaling visit 2 keluhan");
    expect(fetchedMR2?.diagnosis).toBe("Kalkulus visit 2");
  });

  // TEST 10: DOCTOR_ASSISTANT tetap mengikuti RBAC existing
  it("TEST 10: DOCTOR_ASSISTANT tetap mengikuti RBAC existing -> Expected: PASS", async () => {
    // Assistant in Gebang can access Gebang visit MR
    await mrRepo.createOrUpdateMedicalRecord(
      {
        visitId: "visit-1",
        patientId: "patient-1",
        branchId: "branch-gebang",
        doctorId: "doc-syafira",
        chiefComplaint: "Pemeriksaan",
        diagnosis: "Gingivitis",
        status: MedicalRecordStatus.DRAFT
      },
      UserRole.DOCTOR_ASSISTANT,
      "branch-gebang"
    );

    const record = await mrRepo.getMedicalRecordByVisit("visit-1", UserRole.DOCTOR_ASSISTANT, "branch-gebang");
    expect(record).toBeDefined();

    // Assistant in Muktisari cannot access Gebang visit MR
    await expect(
      mrRepo.getMedicalRecordByVisit("visit-1", UserRole.DOCTOR_ASSISTANT, "branch-muktisari")
    ).rejects.toThrow("Anda tidak memiliki akses ke data ini.");
  });

  // TEST 11: Medical Record tidak memberikan akses Invoice
  it("TEST 11: Medical Record tidak memberikan akses Invoice -> Expected: PASS", async () => {
    // Assistant/Doctor cannot access invoice repo if RBAC is enforced
    // Doctor attempting invoice access is blocked or restricted
    await expect(
      invoiceRepo.createInvoice(
        {
          visitId: "visit-1",
          patientId: "patient-1",
          branchId: "branch-gebang",
          items: [{ serviceId: "service-scaling", descriptionSnapshot: "Scaling", unitPriceSnapshot: 150000, quantity: 1, amount: 150000 }]
        },
        UserRole.DOCTOR,
        "branch-gebang"
      )
    ).rejects.toThrow();
  });

  // TEST 12: Medical Record tidak memberikan akses Accounting
  it("TEST 12: Medical Record tidak memberikan akses Accounting -> Expected: PASS", async () => {
    // Doctor / Assistant attempting accounting journal creation is blocked
    await expect(
      accountingRepo.createDraftJournal(
        {
          branchId: "branch-gebang",
          journalDate: "2026-09-21",
          description: "Unauthorized journal from medical record",
          sourceType: "MANUAL" as any,
          lines: [
            { accountId: "acc-cash", debit: 100000, credit: 0 },
            { accountId: "acc-rev", debit: 0, credit: 100000 }
          ]
        },
        "doc-syafira",
        UserRole.DOCTOR,
        "branch-gebang"
      )
    ).rejects.toThrow("Akses ditolak: Dokter atau Asisten tidak memiliki wewenang untuk membuat Jurnal Akuntansi");
  });
});
