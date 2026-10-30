import { beforeEach, describe, expect, it } from "vitest";
import { MockDatabase } from "../data/mockData";
import { MockPatientRepository } from "../repositories/mockRepositories";
import { UserRole } from "../types/domain";

describe("Mock patient data reset", () => {
  let db: MockDatabase;
  let patientRepo: MockPatientRepository;

  beforeEach(() => {
    db = MockDatabase.resetInstance();
    patientRepo = new MockPatientRepository();
  });

  it("clears patient-linked demo operations while preserving master data", async () => {
    const savedServices = [...db.services];
    const savedBranches = [...db.branches];
    const savedAccounts = [...db.userAccounts];

    await patientRepo.clearAllPatients(UserRole.BRANCH_ADMIN);

    expect(db.patients).toEqual([]);
    expect(db.bookings).toEqual([]);
    expect(db.confirmations).toEqual([]);
    expect(db.visits).toEqual([]);
    expect(db.queueItems).toEqual([]);
    expect(db.treatmentJobs).toEqual([]);
    expect(db.treatmentActivities).toEqual([]);
    expect(db.invoices).toEqual([]);
    expect(db.invoiceItems).toEqual([]);
    expect(db.payments).toEqual([]);
    expect(db.accruals).toEqual([]);
    expect(db.medicalRecords).toEqual([]);
    expect(db.patientMedicalProfiles).toEqual([]);
    expect(db.services).toEqual(savedServices);
    expect(db.branches).toEqual(savedBranches);
    expect(db.userAccounts).toEqual(savedAccounts);
  });

  it("rejects reset requests from non-administrator roles", async () => {
    await expect(patientRepo.clearAllPatients(UserRole.DOCTOR))
      .rejects.toThrow("Akses ditolak");
  });
});
