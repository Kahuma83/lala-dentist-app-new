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
import { ODONTOGRAM_TOOTH_NUMBERS } from "../components/Odontogram";
import {
  ANTERIOR_TOOTH_DIVIDER_PATH,
  getOdontogramSurfaceShapes,
  getOdontogramToothType,
  usesAnteriorOdontogramPattern,
  usesTriangularOdontogramPattern
} from "../components/odontogramToothShapes";
import { normalizeIcd10WhoCode, parseIcd9CmProcedureCodes } from "../utils/clinicalCodeUtils";

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

  it("allows a visit to proceed without creating an optional digital medical record", async () => {
    const visit = await visitRepo.createVisit(
      {
        bookingId: null,
        patientId: "patient-1",
        branchId: "branch-gebang",
        visitType: VisitType.WALK_IN,
        visitStatus: VisitStatus.WAITING,
        complaint: "Kontrol rutin",
        visitDateTime: "2026-09-23T11:00:00Z"
      },
      UserRole.BRANCH_ADMIN,
      "branch-gebang"
    );

    expect(visit).toBeDefined();
    await expect(
      mrRepo.getMedicalRecordByVisit(visit.id, UserRole.DOCTOR, "branch-gebang")
    ).resolves.toBeNull();
  });

  it("saves odontogram findings per visit", async () => {
    const record = await mrRepo.createOrUpdateMedicalRecord(
      {
        visitId: "visit-1",
        patientId: "patient-1",
        branchId: "branch-gebang",
        doctorId: "doc-syafira",
        chiefComplaint: "Ngilu",
        diagnosis: "Karies gigi 36",
        diagnosisCode: "K02.1",
        procedureCodes: ["23.09", "23.11"],
        odontogram: {
          schemaVersion: 1,
          teeth: {
            "36": {
              surfaces: { O: "caries" },
              updatedAt: "2026-10-20T10:00:00.000Z"
            }
          }
        },
        clinicFormData: {
          dentalAssessment: {
            occlusion: "CROSS_BITE",
            diastemaPresent: true,
            diastemaNotes: "Diastema anterior",
            d: 1,
            m: 2,
            f: 3
          },
          noteB: "Keterangan B"
        }
      },
      UserRole.DOCTOR,
      "branch-gebang"
    );

    const saved = await mrRepo.getMedicalRecordByVisit(
      "visit-1",
      UserRole.DOCTOR,
      "branch-gebang"
    );
    expect(record.odontogram?.teeth["36"]?.surfaces?.O).toBe("caries");
    expect(record.diagnosisCode).toBe("K02.1");
    expect(record.procedureCodes).toEqual(["23.09", "23.11"]);
    expect(record.clinicFormData?.dentalAssessment?.occlusion).toBe("CROSS_BITE");
    expect(record.clinicFormData?.dentalAssessment?.d).toBe(1);
    expect(record.clinicFormData?.noteB).toBe("Keterangan B");
    expect(saved?.odontogram?.teeth["36"]?.surfaces?.O).toBe("caries");
    expect(saved?.diagnosisCode).toBe("K02.1");
    expect(saved?.procedureCodes).toEqual(["23.09", "23.11"]);
    expect(saved?.clinicFormData?.dentalAssessment?.diastemaNotes).toBe("Diastema anterior");
    expect(saved?.clinicFormData?.dentalAssessment?.f).toBe(3);
  });

  it("saves a private patient medical profile and visit vital-sign snapshot", async () => {
    const profile = await mrRepo.savePatientMedicalProfile(
      {
        patientId: "patient-1",
        branchId: "branch-gebang",
        bloodType: "O+",
        allergies: "Penisilin",
        medicationAllergies: "Amoksisilin",
        foodAllergies: "Udang",
        congenitalDiseases: "Tidak ada",
        systemicDiseases: "Diabetes melitus",
        routineMedications: "Metformin",
        medicalWarnings: "Konfirmasi kadar gula darah"
      },
      UserRole.DOCTOR,
      "branch-gebang",
      "doc-syafira"
    );
    const savedProfile = await mrRepo.getPatientMedicalProfile(
      "patient-1",
      UserRole.DOCTOR,
      "branch-gebang"
    );
    const record = await mrRepo.createOrUpdateMedicalRecord(
      {
        visitId: "visit-1",
        patientId: "patient-1",
        branchId: "branch-gebang",
        doctorId: "doc-syafira",
        chiefComplaint: "Kontrol",
        diagnosis: "Kontrol rutin",
        vitalSigns: {
          systolicBloodPressure: 120,
          diastolicBloodPressure: 80,
          pulseBpm: 72,
          temperatureCelsius: 36.7
        },
        medicalHistorySnapshot: profile
      },
      UserRole.DOCTOR,
      "branch-gebang"
    );

    expect(savedProfile?.allergies).toBe("Penisilin");
    expect(savedProfile?.medicationAllergies).toBe("Amoksisilin");
    expect(savedProfile?.foodAllergies).toBe("Udang");
    expect(savedProfile?.congenitalDiseases).toBe("Tidak ada");
    expect(record.vitalSigns?.systolicBloodPressure).toBe(120);
    expect(record.vitalSigns?.diastolicBloodPressure).toBe(80);
    expect(record.medicalHistorySnapshot?.systemicDiseases).toBe("Diabetes melitus");
    await expect(
      mrRepo.getPatientMedicalProfile("patient-1", UserRole.DOCTOR, "branch-not-assigned")
    ).rejects.toThrow("Anda tidak memiliki akses");
  });

  it("shows all 52 permanent and primary teeth using FDI numbering without duplicates", () => {
    expect(ODONTOGRAM_TOOTH_NUMBERS).toHaveLength(52);
    expect(new Set(ODONTOGRAM_TOOTH_NUMBERS).size).toBe(52);
    expect(ODONTOGRAM_TOOTH_NUMBERS).toContain(11);
    expect(ODONTOGRAM_TOOTH_NUMBERS).toContain(48);
    expect(ODONTOGRAM_TOOTH_NUMBERS).toContain(51);
    expect(ODONTOGRAM_TOOTH_NUMBERS).toContain(85);
  });

  it("uses distinct tooth shapes for different tooth types in the clinic form", () => {
    expect(getOdontogramToothType(63)).toBe("canine");
    expect(getOdontogramToothType(64)).toBe("molar");
    expect(usesTriangularOdontogramPattern(63)).toBe(true);
    expect(usesTriangularOdontogramPattern(64)).toBe(false);
    expect(getOdontogramToothType(14)).toBe("premolar");
    expect(getOdontogramToothType(11)).toBe("incisor");
    expect(getOdontogramToothType(16)).toBe("molar");
  });

  it("draws surface shapes with proportions matching the odontogram chart", () => {
    expect(getOdontogramSurfaceShapes(18).O).toBe("10,10 30,10 30,30 10,30");
    expect(getOdontogramSurfaceShapes(18).B).toBe("0,0 40,0 30,10 10,10");
    expect(getOdontogramSurfaceShapes(43).O).toBe("10,19 30,19 30,21 10,21");
    expect(getOdontogramSurfaceShapes(43).B).toBe("0,0 40,0 30,20 10,20");
    expect(ANTERIOR_TOOTH_DIVIDER_PATH).toBe("M0 0 L10 20 L0 40 M40 0 L30 20 L40 40 M10 20 H30");
  });

  it("uses the matching anterior tooth pattern for the requested permanent and primary teeth", () => {
    const anteriorTeeth = [
      51, 52, 53, 61, 62, 63,
      82, 81, 71, 72, 73,
      41, 42, 43, 31, 32, 33
    ];

    for (const toothNumber of anteriorTeeth) {
      expect(usesTriangularOdontogramPattern(toothNumber), `tooth ${toothNumber}`).toBe(true);
      expect(usesAnteriorOdontogramPattern(toothNumber), `tooth ${toothNumber}`).toBe(true);
      expect(getOdontogramSurfaceShapes(toothNumber).O).toBe(getOdontogramSurfaceShapes(51).O);
    }
  });

  it("normalizes manually entered clinical codes and rejects malformed formats", () => {
    expect(normalizeIcd10WhoCode(" k02.1 ")).toBe("K02.1");
    expect(normalizeIcd10WhoCode("")).toBeUndefined();
    expect(parseIcd9CmProcedureCodes("23.09\n23.11\n23.09")).toEqual(["23.09", "23.11"]);
    expect(() => normalizeIcd10WhoCode("invalid")).toThrow("Format kode diagnosis ICD-10");
    expect(() => parseIcd9CmProcedureCodes("23.09\nABC")).toThrow("kode prosedur ICD-9-CM");
  });

  it("does not expose patient medical history notes to branch staff", async () => {
    const branchStaffPatients = await patientRepo.getPatients(
      UserRole.BRANCH_ADMIN,
      "branch-gebang"
    );
    const doctorPatients = await patientRepo.getPatients(
      UserRole.DOCTOR,
      "branch-gebang"
    );
    const otherBranchDoctorPatients = await patientRepo.getPatients(
      UserRole.DOCTOR,
      "branch-muktisari"
    );

    expect(branchStaffPatients.find((patient) => patient.id === "patient-1")?.medicalHistoryNotes).toBeUndefined();
    expect(doctorPatients.find((patient) => patient.id === "patient-1")?.medicalHistoryNotes).toBeTruthy();
    expect(otherBranchDoctorPatients.find((patient) => patient.id === "patient-1")?.medicalHistoryNotes).toBeUndefined();
  });

  it("exposes patient phone numbers only to super admins and branch admins", async () => {
    const superAdminPatient = await patientRepo.getPatientById("patient-1", UserRole.SUPER_ADMIN);
    const branchAdminPatient = await patientRepo.getPatientById("patient-1", UserRole.BRANCH_ADMIN, "branch-gebang");
    const doctorPatient = await patientRepo.getPatientById("patient-1", UserRole.DOCTOR, "branch-gebang");
    const assistantPatient = await patientRepo.getPatientById("patient-1", UserRole.DOCTOR_ASSISTANT, "branch-gebang");
    const doctorDuplicates = await patientRepo.checkDuplicates("081299887766", undefined, undefined, UserRole.DOCTOR);
    const medicalRecordPhone = await patientRepo.getPatientPhoneForMedicalRecord(
      "patient-1",
      "branch-gebang",
      UserRole.DOCTOR
    );

    expect(superAdminPatient?.phone).toBe("081299887766");
    expect(branchAdminPatient?.phone).toBe("081299887766");
    expect(doctorPatient?.phone).toBe("");
    expect(assistantPatient?.phone).toBe("");
    expect(doctorDuplicates.byPhone[0]?.phone).toBe("");
    expect(doctorDuplicates.byPhone[0]?.medicalHistoryNotes).toBeUndefined();
    expect(medicalRecordPhone).toBe("081299887766");
    await expect(
      patientRepo.getPatientPhoneForMedicalRecord("patient-1", "branch-gebang", UserRole.DOCTOR_ASSISTANT)
    ).rejects.toThrow("Akses ditolak");
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

  // TEST 5: Doctor tidak dapat menyimpan rekam medis di luar cabang yang diizinkan
  it("TEST 5: Doctor tidak dapat mengakses Record cabang lain -> Expected: REJECTED", async () => {
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
    ).rejects.toThrow("Cabang tidak sesuai dengan kunjungan.");
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

  // TEST 10: Isi klinis hanya dapat dibaca oleh Dokter dan Super Admin
  it("TEST 10: DOCTOR_ASSISTANT tidak dapat membaca atau menulis rekam medis -> Expected: REJECTED", async () => {
    await expect(
      mrRepo.createOrUpdateMedicalRecord(
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
      )
    ).rejects.toThrow("Anda tidak memiliki akses ke data ini.");

    await expect(
      mrRepo.getMedicalRecordByVisit("visit-1", UserRole.DOCTOR_ASSISTANT, "branch-muktisari")
    ).rejects.toThrow("Anda tidak memiliki akses ke data ini.");
  });

  it("allows only the responsible doctor to finalize a draft and locks it", async () => {
    const draft = await mrRepo.createOrUpdateMedicalRecord(
      {
        visitId: "visit-1",
        patientId: "patient-1",
        branchId: "branch-gebang",
        doctorId: "doc-syafira",
        chiefComplaint: "Pemeriksaan",
        diagnosis: "Gingivitis",
        status: MedicalRecordStatus.DRAFT
      },
      UserRole.DOCTOR,
      "branch-gebang"
    );

    await expect(
      mrRepo.finalizeMedicalRecord(draft.id, "doc-syafira", UserRole.SUPER_ADMIN)
    ).rejects.toThrow("Hanya Dokter");

    const finalized = await mrRepo.finalizeMedicalRecord(
      draft.id,
      "doc-syafira",
      UserRole.DOCTOR,
      "branch-gebang"
    );
    expect(finalized.status).toBe(MedicalRecordStatus.FINAL);
    expect(finalized.signedByDoctorId).toBe("doc-syafira");
    expect(finalized.isLocked).toBe(true);
    await expect(
      mrRepo.createOrUpdateMedicalRecord(
        {
          visitId: "visit-1",
          patientId: "patient-1",
          branchId: "branch-gebang",
          doctorId: "doc-syafira",
          chiefComplaint: "Perubahan",
          diagnosis: "Perubahan",
          status: MedicalRecordStatus.DRAFT
        },
        UserRole.DOCTOR,
        "branch-gebang"
      )
    ).rejects.toThrow(/rekam medis final terkunci/i);
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
