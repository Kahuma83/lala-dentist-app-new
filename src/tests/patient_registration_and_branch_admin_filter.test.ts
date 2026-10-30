import { describe, it, expect, beforeEach } from "vitest";
import { MockPatientRepository } from "../repositories/mockRepositories";
import { UserRole } from "../types/domain";
import { MockDatabase } from "../data/mockData";

describe("Patient Registration & Branch Admin Global Filter", () => {
  let patientRepo: MockPatientRepository;
  let db: MockDatabase;

  beforeEach(() => {
    db = MockDatabase.resetInstance();
    patientRepo = new MockPatientRepository();
  });

  it("1. Branch Admin retrieves all global patient records by default (same as Super Admin)", async () => {
    const superAdminPatients = await patientRepo.getPatients(UserRole.SUPER_ADMIN, null);
    const branchAdminKencongPatients = await patientRepo.getPatients(UserRole.BRANCH_ADMIN, "branch-kencong");
    const branchAdminGebangPatients = await patientRepo.getPatients(UserRole.BRANCH_ADMIN, "branch-gebang");

    expect(superAdminPatients.length).toBeGreaterThan(0);
    expect(branchAdminKencongPatients.length).toBe(superAdminPatients.length);
    expect(branchAdminGebangPatients.length).toBe(superAdminPatients.length);
  });

  it("2. Branch Admin search searches across all global patients", async () => {
    const allPatients = await patientRepo.getPatients(UserRole.SUPER_ADMIN);
    const sample = allPatients[0];

    const searchResults = await patientRepo.searchPatients(
      sample.name.slice(0, 4),
      UserRole.BRANCH_ADMIN,
      "branch-kencong"
    );

    expect(searchResults.some((p) => p.id === sample.id)).toBe(true);
  });

  it("3. Creating a new patient with assigned branch persists registeredBranchId, branch_id, assignedBranchId, branchId", async () => {
    const newPatient = await patientRepo.createPatient(
      {
        name: "Pasien Uji Coba Cabang",
        fullName: "Pasien Uji Coba Cabang",
        phone: "081999888777",
        dateOfBirth: "1998-05-12",
        gender: "L",
        address: "Jl. Kencong No. 10",
        registeredBranchId: "branch-kencong"
      },
      UserRole.BRANCH_ADMIN,
      "branch-kencong"
    );

    expect(newPatient.id).toBeDefined();
    expect(newPatient.registeredBranchId).toBe("branch-kencong");
    expect(newPatient.branch_id).toBe("branch-kencong");
    expect(newPatient.assignedBranchId).toBe("branch-kencong");
    expect(newPatient.branchId).toBe("branch-kencong");

    // Retrieve and verify
    const fetched = await patientRepo.getPatientById(newPatient.id);
    expect(fetched?.registeredBranchId).toBe("branch-kencong");
  });

  it("4. Updating a patient branch updates all branch lineage fields", async () => {
    const created = await patientRepo.createPatient(
      {
        name: "Pasien Mutasi",
        phone: "08123444555",
        dateOfBirth: "2000-01-01",
        gender: "P",
        address: "Jl. Ambulu No. 1",
        registeredBranchId: "branch-ambulu"
      },
      UserRole.BRANCH_ADMIN,
      "branch-ambulu"
    );

    const updated = await patientRepo.updatePatient(
      created.id,
      {
        registeredBranchId: "branch-kampus"
      }
    );

    expect(updated.registeredBranchId).toBe("branch-kampus");
    expect(updated.branch_id).toBe("branch-kampus");
    expect(updated.assignedBranchId).toBe("branch-kampus");
    expect(updated.branchId).toBe("branch-kampus");
  });

  it("records an optional acquisition source and referral name without changing booking channel data", async () => {
    const created = await patientRepo.createPatient({
      name: "Pasien Rujukan",
      phone: "081234567800",
      dateOfBirth: "1995-04-12",
      gender: "P",
      address: "Jl. Contoh",
      acquisitionSource: "REFERRAL",
      referralName: "Dewi",
      registeredBranchId: "branch-gebang"
    });

    expect(created.acquisitionSource).toBe("REFERRAL");
    expect(created.referralName).toBe("Dewi");

    const profileEdit = await patientRepo.updatePatient(created.id, { address: "Jl. Diperbarui" });
    expect(profileEdit.acquisitionSource).toBe("REFERRAL");
    expect(profileEdit.referralName).toBe("Dewi");

    const updated = await patientRepo.updatePatient(created.id, { acquisitionSource: "INSTAGRAM" });
    expect(updated.acquisitionSource).toBe("INSTAGRAM");
    expect(updated.referralName).toBeUndefined();

    const legacy = await patientRepo.createPatient({
      name: "Pasien Sumber Belum Diketahui",
      phone: "081234567801",
      dateOfBirth: "1995-04-12",
      gender: "L",
      address: "Jl. Contoh",
      registeredBranchId: "branch-gebang"
    });
    expect(legacy.acquisitionSource).toBe("UNKNOWN");
  });

  it("persists patient identity and optional social profile fields while keeping legacy profiles readable", async () => {
    const created = await patientRepo.createPatient({
      name: "Pasien Data Lengkap",
      phone: "",
      identityDocumentType: "NIK",
      identityDocumentNumber: "3201010101010001",
      placeOfBirth: "Jember",
      dateOfBirth: "1995-04-12",
      gender: "P",
      address: "Jl. Contoh",
      occupation: "Guru",
      religion: "Islam",
      maritalStatus: "Menikah",
      education: "S1"
    });

    expect(created.identityDocumentType).toBe("NIK");
    expect(created.identityDocumentNumber).toBe("3201010101010001");
    expect(created.placeOfBirth).toBe("Jember");
    expect(created.occupation).toBe("Guru");
    expect(created.religion).toBe("Islam");
    expect(created.maritalStatus).toBe("Menikah");
    expect(created.education).toBe("S1");

    const updated = await patientRepo.updatePatient(created.id, {
      identityDocumentType: "PASSPORT",
      identityDocumentNumber: "AB1234567",
      occupation: "Dokter",
      education: "S2"
    });
    expect(updated.identityDocumentType).toBe("PASSPORT");
    expect(updated.identityDocumentNumber).toBe("AB1234567");
    expect(updated.occupation).toBe("Dokter");
    expect(updated.education).toBe("S2");

    const legacy = await patientRepo.createPatient({
      name: "Profil Online Lama",
      phone: "",
      dateOfBirth: "1990-01-01",
      gender: "L",
      address: ""
    });
    expect(legacy.identityDocumentNumber).toBe("");
    expect((await patientRepo.getPatientById(legacy.id))?.placeOfBirth).toBe("");
  });

  it("allows registering a patient without an identity document and adding it later", async () => {
    const patient = await patientRepo.createPatient({
      name: "Pasien Tanpa KTP",
      phone: "",
      dateOfBirth: "1995-04-12",
      gender: "P",
      address: "Jember"
    });

    expect(patient.identityDocumentNumber).toBe("");

    const completedProfile = await patientRepo.updatePatient(patient.id, {
      identityDocumentType: "NIK",
      identityDocumentNumber: "3201010101900001"
    });

    expect(completedProfile.identityDocumentNumber).toBe("3201010101900001");
  });
});
