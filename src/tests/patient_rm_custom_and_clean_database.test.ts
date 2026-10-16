import { describe, it, expect, beforeEach } from "vitest";
import { MockDatabase } from "../data/mockData";
import { MockPatientRepository, MockVisitRepository, MockQueueRepository } from "../repositories/mockRepositories";
import { UserRole, VisitStatus, VisitType } from "../types/domain";
import {
  getNextMedicalRecordNumber,
  checkRMUniqueness,
  formatRMNumber
} from "../utils/rmUtils";

describe("Patient Custom RM, Sequential Auto-Generation, and Database Clean Workflow", () => {
  let patientRepo: MockPatientRepository;
  let visitRepo: MockVisitRepository;
  let queueRepo: MockQueueRepository;
  let db: MockDatabase;

  const basePatient = {
    phone: "081234567890",
    dateOfBirth: "1990-01-01",
    gender: "L" as const,
    address: "Jl. Mastrip Jember"
  };

  beforeEach(() => {
    db = MockDatabase.getInstance();
    db.patients = []; // Clean slate
    patientRepo = new MockPatientRepository();
    visitRepo = new MockVisitRepository();
    queueRepo = new MockQueueRepository();
  });

  it("1. Should generate custom starting number (e.g. 3000) when database is empty", () => {
    const nextRM = getNextMedicalRecordNumber([], {
      startingNumber: 3000,
      prefix: "",
      padDigits: 0,
      formatMode: "digits_only"
    });
    expect(nextRM).toBe("3000");
  });

  it("2. Should register a patient with custom manual RM e.g. 3000", async () => {
    const patient1 = await patientRepo.createPatient({
      ...basePatient,
      name: "Pak Bambang (Pasien Lama)",
      fullName: "Pak Bambang (Pasien Lama)",
      medicalRecordNumber: "3000"
    });

    expect(patient1.medicalRecordNumber).toBe("3000");
    expect(db.patients.length).toBe(1);
  });

  it("3. Should leave newly registered patients without an RM until check-in", async () => {
    // 1st patient: manual input 3000
    await patientRepo.createPatient({
      ...basePatient,
      name: "Pasien Lama Pertama",
      fullName: "Pasien Lama Pertama",
      medicalRecordNumber: "3000"
    });

    // The next patient remains unnumbered until a real check-in.
    const patient2 = await patientRepo.createPatient({
      ...basePatient,
      name: "Pasien Baru Kedua",
      fullName: "Pasien Baru Kedua"
    });

    expect(patient2.medicalRecordNumber).toBe("");

    const patient3 = await patientRepo.createPatient({
      ...basePatient,
      name: "Pasien Baru Ketiga",
      fullName: "Pasien Baru Ketiga"
    });

    expect(patient3.medicalRecordNumber).toBe("");
  });

  it("issues an RM when a newly registered patient is checked into a queue", async () => {
    const patient = await patientRepo.createPatient({
      ...basePatient,
      name: "Pasien Check-in"
    });
    expect(patient.medicalRecordNumber).toBe("");

    const branch = db.branches[0];
    const doctor = db.doctors[0];
    const visit = await visitRepo.createVisit({
      patientId: patient.id,
      branchId: branch.id,
      visitType: VisitType.WALK_IN,
      visitStatus: VisitStatus.WAITING,
      bookingId: null,
      doctorId: doctor.id,
      complaint: "Pemeriksaan",
      visitDateTime: new Date().toISOString()
    });

    await queueRepo.checkInVisitToQueue(visit.id);

    const updatedPatient = await patientRepo.getPatientById(patient.id);
    expect(updatedPatient?.medicalRecordNumber).toBe("3000");
  });

  it("4. Should detect and reject duplicate manual RM", async () => {
    await patientRepo.createPatient({
      ...basePatient,
      name: "Pasien Pemilik 3000",
      medicalRecordNumber: "3000"
    });

    // Real-time uniqueness checker
    const check = checkRMUniqueness("3000", db.patients);
    expect(check.isUnique).toBe(false);
    expect(check.conflictPatient?.medicalRecordNumber).toBe("3000");

    // Attempting to create duplicate should throw error
    await expect(
      patientRepo.createPatient({
        ...basePatient,
        name: "Pasien Duplikat",
        medicalRecordNumber: "3000"
      })
    ).rejects.toThrow();
  });

  it("5. Should support existing patients with manually entered RMs while leaving new patients unnumbered", async () => {
    // Patient with 3000 exists
    await patientRepo.createPatient({
      ...basePatient,
      name: "Pasien Tiga Ribu",
      medicalRecordNumber: "3000"
    });

    // Old patient comes with older card 2500
    const oldPatient = await patientRepo.createPatient({
      ...basePatient,
      name: "Pasien Kartu Lama 2500",
      medicalRecordNumber: "2500"
    });
    expect(oldPatient.medicalRecordNumber).toBe("2500");

    // Another old patient with 3050 comes
    const higherOldPatient = await patientRepo.createPatient({
      ...basePatient,
      name: "Pasien Kartu 3050",
      medicalRecordNumber: "3050"
    });
    expect(higherOldPatient.medicalRecordNumber).toBe("3050");

    // A newly registered patient receives no RM before check-in.
    const nextAuto = await patientRepo.createPatient({
      ...basePatient,
      name: "Pasien Baru Otomatis"
    });
    expect(nextAuto.medicalRecordNumber).toBe("");
  });

  it("6. Should allow clearing patient database and starting fresh", async () => {
    // Seed a few patients
    await patientRepo.createPatient({ ...basePatient, name: "Dummy 1", medicalRecordNumber: "100" });
    await patientRepo.createPatient({ ...basePatient, name: "Dummy 2", medicalRecordNumber: "101" });
    expect(db.patients.length).toBe(2);

    // Clear database as admin
    const success = await patientRepo.clearAllPatients(UserRole.BRANCH_ADMIN);
    expect(success).toBe(true);
    expect(db.patients.length).toBe(0);

    // After clearing, manual numbering remains available for an existing patient.
    const newPatient = await patientRepo.createPatient({
      ...basePatient,
      name: "Pasien Pasca Bersih",
      medicalRecordNumber: "3000"
    });
    expect(newPatient.medicalRecordNumber).toBe("3000");

    const follower = await patientRepo.createPatient({
      ...basePatient,
      name: "Pasien Penerus"
    });
    expect(follower.medicalRecordNumber).toBe("");
  });

  it("7. Should support different RM formats according to configuration", () => {
    expect(formatRMNumber(3000, { prefix: "", padDigits: 0 })).toBe("3000");
    expect(formatRMNumber(3000, { prefix: "RM-", padDigits: 0 })).toBe("RM-3000");
    expect(formatRMNumber(3000, { prefix: "RM-", padDigits: 6 })).toBe("RM-003000");
  });
});
