import { describe, it, expect, beforeEach } from "vitest";
import {
  exportPatientsToExcel,
  downloadPatientExcelTemplate,
  executePatientImport,
  ParsedPatientRow
} from "../utils/excelPatientUtils";
import { MockPatientRepository } from "../repositories/mockRepositories";
import { PatientProfile, DentalBranch, UserRole } from "../types/domain";

describe("Patient Excel Export & Import Utility Suite", () => {
  let patientRepo: MockPatientRepository;
  const mockBranches: DentalBranch[] = [
    {
      id: "branch-gebang",
      name: "Klinik Gigi Gebang",
      branchCode: "GEB",
      address: "Jl. Gebang Raya No. 12",
      phone: "08123456789",
      whatsapp: "08123456789",
      isActive: true,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z"
    }
  ];

  beforeEach(() => {
    patientRepo = new MockPatientRepository();
  });

  it("should have export and template download functions available without errors", () => {
    expect(typeof exportPatientsToExcel).toBe("function");
    expect(typeof downloadPatientExcelTemplate).toBe("function");
  });

  it("should execute import for valid patient rows into repository", async () => {
    const validRows: ParsedPatientRow[] = [
      {
        index: 1,
        name: "Test Pasien Excel 1",
        medicalRecordNumber: "RM-990001",
        gender: "L",
        dateOfBirth: "1992-04-12",
        phone: "081999888771",
        email: "pasien1@test.com",
        address: "Jl. Mastrip Timur No. 5",
        medicalHistoryNotes: "Tidak ada alergi",
        registeredBranchId: "branch-gebang",
        isValid: true,
        errors: [],
        warnings: [],
        isDuplicateRM: false,
        isDuplicatePhone: false
      },
      {
        index: 2,
        name: "Test Pasien Excel 2",
        medicalRecordNumber: "RM-990002",
        gender: "P",
        dateOfBirth: "1998-08-20",
        phone: "081999888772",
        email: "pasien2@test.com",
        address: "Jl. Jawa No. 10",
        medicalHistoryNotes: "Alergi obat amoxicillin",
        registeredBranchId: "branch-gebang",
        isValid: true,
        errors: [],
        warnings: [],
        isDuplicateRM: false,
        isDuplicatePhone: false
      }
    ];

    const result = await executePatientImport(patientRepo, validRows, {
      duplicateStrategy: "skip",
      defaultBranchId: "branch-gebang",
      currentUserRole: UserRole.SUPER_ADMIN
    });

    expect(result.total).toBe(2);
    expect(result.imported).toBe(2);
    expect(result.failed).toBe(0);

    const created1 = (await patientRepo.getPatients()).find(
      (p) => p.medicalRecordNumber === "RM-990001"
    );
    expect(created1).toBeDefined();
    expect(created1?.name).toBe("Test Pasien Excel 1");
    expect(created1?.phone).toBe("081999888771");
  });

  it("should handle duplicate skip strategy appropriately", async () => {
    const existingPatient = (await patientRepo.getPatients())[0];
    expect(existingPatient).toBeDefined();

    const dupRows: ParsedPatientRow[] = [
      {
        index: 1,
        name: existingPatient.name,
        medicalRecordNumber: existingPatient.medicalRecordNumber,
        gender: existingPatient.gender,
        dateOfBirth: existingPatient.dateOfBirth,
        phone: existingPatient.phone,
        address: "Alamat Baru Diubah",
        registeredBranchId: "branch-gebang",
        isValid: true,
        errors: [],
        warnings: ["No RM duplikat"],
        isDuplicateRM: true,
        isDuplicatePhone: true,
        existingPatientMatch: existingPatient
      }
    ];

    const result = await executePatientImport(patientRepo, dupRows, {
      duplicateStrategy: "skip",
      defaultBranchId: "branch-gebang",
      currentUserRole: UserRole.SUPER_ADMIN
    });

    expect(result.skipped).toBe(1);
    expect(result.imported).toBe(0);
    expect(result.updated).toBe(0);
  });

  it("should handle duplicate update strategy to refresh patient info", async () => {
    const existingPatient = (await patientRepo.getPatients())[0];
    expect(existingPatient).toBeDefined();

    const updateRows: ParsedPatientRow[] = [
      {
        index: 1,
        name: existingPatient.name,
        medicalRecordNumber: existingPatient.medicalRecordNumber,
        gender: existingPatient.gender,
        dateOfBirth: existingPatient.dateOfBirth,
        phone: existingPatient.phone,
        address: "Jl. Alamat Diperbarui dari Excel",
        medicalHistoryNotes: "Alergi makanan laut (Updated)",
        registeredBranchId: "branch-gebang",
        isValid: true,
        errors: [],
        warnings: ["No RM duplikat"],
        isDuplicateRM: true,
        isDuplicatePhone: true,
        existingPatientMatch: existingPatient
      }
    ];

    const result = await executePatientImport(patientRepo, updateRows, {
      duplicateStrategy: "update",
      defaultBranchId: "branch-gebang",
      currentUserRole: UserRole.SUPER_ADMIN
    });

    expect(result.updated).toBe(1);
    expect(result.imported).toBe(0);

    const updated = await patientRepo.getPatientById(existingPatient.id);
    expect(updated?.address).toBe("Jl. Alamat Diperbarui dari Excel");
    expect(updated?.medicalHistoryNotes).toContain("Alergi makanan laut (Updated)");
  });
});
