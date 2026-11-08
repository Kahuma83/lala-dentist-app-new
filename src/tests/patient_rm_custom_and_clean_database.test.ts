import { describe, it, expect, beforeEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { MockDatabase } from "../data/mockData";
import { MockPatientRepository, MockVisitRepository, MockQueueRepository } from "../repositories/mockRepositories";
import { PatientProfile, UserRole, VisitStatus, VisitType } from "../types/domain";
import {
  getNextMedicalRecordNumber,
  checkRMUniqueness,
  formatRMNumber,
  formatInternalPatientCode,
  getPatientMedicalRecordNumber
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
    expect(updatedPatient?.branchMedicalRecordNumbers).toEqual([
      { branchId: branch.id, medicalRecordNumber: "3000" }
    ]);
    expect(updatedPatient?.internalPatientCode).toBe(`${branch.branchCode}-RM3000`);

    const otherBranch = db.branches.find((candidate) => candidate.id !== branch.id);
    expect(otherBranch).toBeDefined();
    const secondVisit = await visitRepo.createVisit({
      patientId: patient.id,
      branchId: otherBranch!.id,
      visitType: VisitType.WALK_IN,
      visitStatus: VisitStatus.WAITING,
      bookingId: null,
      doctorId: doctor.id,
      complaint: "Kunjungan cabang lain",
      visitDateTime: new Date().toISOString()
    });

    await queueRepo.checkInVisitToQueue(secondVisit.id);

    const patientWithTwoBranchRms = await patientRepo.getPatientById(patient.id);
    expect(patientWithTwoBranchRms?.branchMedicalRecordNumbers).toHaveLength(2);
    expect(
      patientWithTwoBranchRms?.branchMedicalRecordNumbers?.find(
        (record) => record.branchId === otherBranch!.id
      )?.medicalRecordNumber
    ).toBe("3000");
    expect(patientWithTwoBranchRms?.internalPatientCode).toBe(`${branch.branchCode}-RM3000`);
    expect(patientWithTwoBranchRms?.medicalRecordNumber).toBe("3000");
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

  it("scopes RM uniqueness to a branch and forms an internal code from the first branch RM", () => {
    const existingPatient: PatientProfile = {
      id: "patient-a",
      medicalRecordNumber: "0001",
      name: "Pasien",
      phone: "",
      dateOfBirth: "",
      gender: "",
      address: "",
      registeredBranchId: "branch-a",
      branchMedicalRecordNumbers: [
        { branchId: "branch-a", medicalRecordNumber: "0001" }
      ],
      createdAt: "",
      updatedAt: ""
    };

    expect(checkRMUniqueness("0001", [existingPatient], undefined, "branch-a").isUnique).toBe(false);
    expect(checkRMUniqueness("0001", [existingPatient], undefined, "branch-b").isUnique).toBe(true);
    expect(getPatientMedicalRecordNumber(existingPatient, "branch-b")).toBe("");
    expect(formatInternalPatientCode("GBG", "0001")).toBe("GBG-RM0001");
    expect(formatInternalPatientCode("GBG", "RM-0001")).toBe("GBG-RM-0001");

    const firstRmIssuedAtAnotherBranch: PatientProfile = {
      ...existingPatient,
      medicalRecordNumber: "3000",
      branchMedicalRecordNumbers: [
        { branchId: "branch-b", medicalRecordNumber: "3000" }
      ]
    };
    expect(getPatientMedicalRecordNumber(firstRmIssuedAtAnotherBranch, "branch-a")).toBe("");
    expect(getPatientMedicalRecordNumber(firstRmIssuedAtAnotherBranch, "branch-b")).toBe("3000");
    expect(
      checkRMUniqueness("3000", [firstRmIssuedAtAnotherBranch], undefined, "branch-a").isUnique
    ).toBe(true);
  });

  it("allows a branch admin to change an existing RM and keeps the branch code in sync", async () => {
    const branch = db.branches[0];
    const patient = await patientRepo.createPatient({
      ...basePatient,
      name: "Pasien RM Diubah",
      registeredBranchId: branch.id,
      medicalRecordNumber: "4100"
    }, UserRole.BRANCH_ADMIN, branch.id);

    const updated = await patientRepo.updatePatient(patient.id, {
      medicalRecordNumber: "4101",
      registeredBranchId: branch.id
    }, UserRole.BRANCH_ADMIN, branch.id);

    expect(getPatientMedicalRecordNumber(updated, branch.id)).toBe("4101");
    expect(updated.medicalRecordNumber).toBe("4101");
    expect(updated.internalPatientCode).toBe(`${branch.branchCode}-RM4101`);
  });

  it("rejects an RM already used by another patient in the same branch", async () => {
    const branch = db.branches[0];
    const firstPatient = await patientRepo.createPatient({
      ...basePatient,
      name: "Pasien Pemilik RM",
      registeredBranchId: branch.id,
      medicalRecordNumber: "4200"
    }, UserRole.BRANCH_ADMIN, branch.id);
    const secondPatient = await patientRepo.createPatient({
      ...basePatient,
      name: "Pasien Pengganti RM",
      registeredBranchId: branch.id,
      medicalRecordNumber: "4201"
    }, UserRole.BRANCH_ADMIN, branch.id);

    await expect(patientRepo.updatePatient(secondPatient.id, {
      medicalRecordNumber: "4200",
      registeredBranchId: branch.id
    }, UserRole.BRANCH_ADMIN, branch.id)).rejects.toThrow("No. RM sudah digunakan pasien lain di cabang ini.");

    expect(getPatientMedicalRecordNumber(
      (await patientRepo.getPatientById(secondPatient.id))!,
      branch.id
    )).toBe("4201");
    expect(getPatientMedicalRecordNumber(
      (await patientRepo.getPatientById(firstPatient.id))!,
      branch.id
    )).toBe("4200");
  });

  it("rejects branch admins changing an RM outside their assigned branch", async () => {
    const [branch, otherBranch] = db.branches;
    const patient = await patientRepo.createPatient({
      ...basePatient,
      name: "Pasien Cabang Terbatas",
      registeredBranchId: otherBranch.id,
      medicalRecordNumber: "4300"
    }, UserRole.BRANCH_ADMIN, otherBranch.id);

    await expect(patientRepo.updatePatient(patient.id, {
      medicalRecordNumber: "4301",
      registeredBranchId: otherBranch.id
    }, UserRole.BRANCH_ADMIN, branch.id)).rejects.toThrow(
      "Admin cabang hanya dapat mengelola No. RM cabangnya sendiri."
    );

    expect(getPatientMedicalRecordNumber(
      (await patientRepo.getPatientById(patient.id))!,
      otherBranch.id
    )).toBe("4300");
  });

  it("rejects clinical users from changing an RM", async () => {
    const branch = db.branches[0];
    const patient = await patientRepo.createPatient({
      ...basePatient,
      name: "Pasien Hanya Admin RM",
      registeredBranchId: branch.id,
      medicalRecordNumber: "4320"
    }, UserRole.BRANCH_ADMIN, branch.id);

    await expect(patientRepo.updatePatient(patient.id, {
      medicalRecordNumber: "4321",
      registeredBranchId: branch.id
    }, UserRole.DOCTOR, branch.id)).rejects.toThrow(
      "Hanya Admin Cabang atau Super Admin yang dapat mengubah No. RM."
    );

    expect(getPatientMedicalRecordNumber(
      (await patientRepo.getPatientById(patient.id))!,
      branch.id
    )).toBe("4320");
  });

  it("lets a branch admin manage their local RM without changing the patient's registered branch", async () => {
    const [branch, registeredBranch] = db.branches;
    const patient = await patientRepo.createPatient({
      ...basePatient,
      name: "Pasien Lintas Cabang",
      registeredBranchId: registeredBranch.id,
      medicalRecordNumber: "4350"
    }, UserRole.BRANCH_ADMIN, registeredBranch.id);

    const updated = await patientRepo.updatePatient(patient.id, {
      name: "Pasien Lintas Cabang Diperbarui",
      medicalRecordNumber: "4351",
      registeredBranchId: branch.id
    }, UserRole.BRANCH_ADMIN, branch.id);

    expect(updated.registeredBranchId).toBe(registeredBranch.id);
    expect(getPatientMedicalRecordNumber(updated, registeredBranch.id)).toBe("4350");
    expect(getPatientMedicalRecordNumber(updated, branch.id)).toBe("4351");
    expect(updated.medicalRecordNumber).toBe("4350");
  });

  it("allows the first RM to be assigned through the edit flow", async () => {
    const branch = db.branches[0];
    const patient = await patientRepo.createPatient({
      ...basePatient,
      name: "Pasien Belum Memiliki RM"
    }, UserRole.BRANCH_ADMIN, branch.id);

    const updated = await patientRepo.updatePatient(patient.id, {
      medicalRecordNumber: "4400",
      registeredBranchId: branch.id
    }, UserRole.BRANCH_ADMIN, branch.id);

    expect(updated.medicalRecordNumber).toBe("4400");
    expect(getPatientMedicalRecordNumber(updated, branch.id)).toBe("4400");
    expect(updated.internalPatientCode).toBe(`${branch.branchCode}-RM4400`);
  });

  it("defines a secured atomic RPC for changing branch-scoped RMs", () => {
    const migration = fs.readFileSync(path.resolve(
      process.cwd(),
      "supabase/migrations/20270221000000_edit_branch_patient_medical_record_number.sql"
    ), "utf8");

    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.update_patient_branch_medical_record_number/i);
    expect(migration).toContain("COALESCE(public.get_user_role(), '') <> 'BRANCH_ADMIN'");
    expect(migration).toContain("FOR UPDATE");
    expect(migration).toContain("WHEN unique_violation");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.update_patient_branch_medical_record_number");
    expect(migration).toContain("FROM PUBLIC, anon");
  });

  it("supports turning branch-level automatic RM issuance off and on", () => {
    const migration = fs.readFileSync(path.resolve(
      process.cwd(),
      "supabase/migrations/20270223000000_branch_rm_auto_issue_toggle.sql"
    ), "utf8");
    const databaseTest = fs.readFileSync(path.resolve(
      process.cwd(),
      "supabase/tests/20261215000000_branch_scoped_patient_medical_record_numbers_test.sql"
    ), "utf8");

    expect(migration).toContain("ADD COLUMN IF NOT EXISTS auto_issue_enabled BOOLEAN NOT NULL DEFAULT TRUE");
    expect(migration).toContain("'auto_issue_enabled', COALESCE(config_row.auto_issue_enabled, TRUE)");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.save_patient_branch_rm_settings");
    expect(migration).toContain("setting.auto_issue_enabled = FALSE");
    expect(migration).toContain("requested_auto_issue_enabled");
    expect(databaseTest).toContain("A branch with automatic issuance disabled must allow check-in without issuing an RM.");
    expect(databaseTest).toContain("Re-enabling automatic issuance must resume branch numbering");
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
