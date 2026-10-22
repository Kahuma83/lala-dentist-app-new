import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { PatientProfile, PatientVisit, UserRole, VisitStatus, VisitType } from "../types/domain";
import { PatientRepository, VisitRepository } from "../repositories/interfaces";
import {
  executeLegacyPatientHistoryImport,
  parseLegacyPatientHistoryWorkbook
} from "../utils/legacyPatientHistoryImport";

function createLegacyWorkbook(includeProblemRow = false, includeIdentity = false): File {
  const workbook = XLSX.utils.book_new();
  const visits = XLSX.utils.json_to_sheet([
    {
      "NO RM": "RM-OLD-001",
      TANGGAL: 46244,
      "NAMA PASIEN": "Pasien Contoh",
      OBJEKTIF: "Kontrol rutin",
      DIAGNOSA: "Diagnosis historis",
      "TERAPI / TINDAKAN": "Tindakan lama bebas",
      DOKTER: "Dokter sumber",
      "B/L": "L"
    },
    {
      "NO RM": "RM-OLD-001",
      TANGGAL: "",
      "NAMA PASIEN": "Pasien Contoh"
    },
    {
      "NO RM": "RM-TIDAK-DITEMUKAN",
      TANGGAL: 46244,
      "NAMA PASIEN": "Pasien Tidak Cocok"
    }
  ]);
  const profiles = XLSX.utils.json_to_sheet([
    {
      "NO RM": "RM-OLD-001",
      "NAMA PASIEN": "Pasien Contoh",
      ...(includeIdentity ? { NIK: "3201010101900001" } : {}),
      "TANGGAL LAHIR": "",
      "P/L": "",
      "NO HP": "",
      "ALAMAT PASIEN": ""
    }
  ]);
  XLSX.utils.book_append_sheet(workbook, visits, "Data");
  XLSX.utils.book_append_sheet(workbook, profiles, "Profil Pasien");
  const problems = includeProblemRow
    ? XLSX.utils.aoa_to_sheet([["NO RM", "MASALAH"], ["RM-OLD-001", "Nama perlu verifikasi"]])
    : XLSX.utils.aoa_to_sheet([]);
  XLSX.utils.book_append_sheet(workbook, problems, "Bermasalah");
  const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  return new File([bytes], "legacy-history.xlsx");
}

describe("Legacy patient history import", () => {
  it("previews legacy profile and visit sheets while preserving unmatched and incomplete rows", async () => {
    const preview = await parseLegacyPatientHistoryWorkbook(createLegacyWorkbook(), []);

    expect(preview.profileRows).toHaveLength(1);
    expect(preview.profileRows[0]).toMatchObject({
      medicalRecordNumber: "RM-OLD-001",
      name: "Pasien Contoh",
      dateOfBirth: "",
      gender: "",
      isValid: true
    });
    expect(preview.visitRows).toHaveLength(3);
    expect(preview.visitRows[0]).toMatchObject({
      medicalRecordNumber: "RM-OLD-001",
      visitDateTime: "2026-08-10T00:00:00.000Z",
      isValid: true
    });
    expect(preview.visitRows[0].historicalDetails).toContain("Tindakan lama (belum dipetakan)");
    expect(preview.visitRows[1].errors).toContain("Tanggal kunjungan kosong atau tidak valid");
    expect(preview.visitRows[2].errors).toContain(
      "No. RM tidak ditemukan pada database atau lembar Profil Pasien"
    );
    expect(preview.ignoredSheets).toContain("Bermasalah");
    expect(preview.blockingReviewIssues).toHaveLength(0);
  });

  it("blocks import when unresolved audit rows remain in the workbook", async () => {
    const preview = await parseLegacyPatientHistoryWorkbook(createLegacyWorkbook(true), []);
    expect(preview.blockingReviewIssues).toHaveLength(1);

    await expect(
      executeLegacyPatientHistoryImport(
        {
          getPatients: async () => [],
          createPatient: async () => {
            throw new Error("Should not create a profile while audit issues remain");
          },
          registerPatientBranchMedicalRecordNumber: async () => {}
        },
        {
          getVisitById: async () => null,
          createVisit: async () => {
            throw new Error("Should not create a visit while audit issues remain");
          }
        },
        preview,
        "branch-gebang",
        UserRole.SUPER_ADMIN
      )
    ).rejects.toThrow("Impor dihentikan");
  });

  it("matches imported profiles only against the selected branch RM", async () => {
    const branchA = {
      id: "patient-branch-a",
      medicalRecordNumber: "RM-OLD-001",
      name: "Pasien Cabang A",
      phone: "",
      dateOfBirth: "",
      gender: "",
      address: "",
      registeredBranchId: "branch-a",
      branchMedicalRecordNumbers: [
        { branchId: "branch-a", medicalRecordNumber: "RM-OLD-001" }
      ],
      createdAt: "",
      updatedAt: ""
    } satisfies PatientProfile;
    const branchB = {
      ...branchA,
      id: "patient-branch-b",
      name: "Pasien Cabang B",
      registeredBranchId: "branch-b",
      branchMedicalRecordNumbers: [
        { branchId: "branch-b", medicalRecordNumber: "RM-OLD-001" }
      ]
    } satisfies PatientProfile;

    const preview = await parseLegacyPatientHistoryWorkbook(
      createLegacyWorkbook(),
      [branchA, branchB],
      "branch-a"
    );

    expect(preview.profileRows[0].existingPatientId).toBe("patient-branch-a");
    expect(preview.visitRows[0].patientId).toBe("patient-branch-a");
  });

  it("does not automatically link the same RM found only in another branch", async () => {
    const branchBPatient: PatientProfile = {
      id: "patient-branch-b",
      medicalRecordNumber: "RM-OLD-001",
      name: "Pasien Cabang B",
      phone: "",
      dateOfBirth: "",
      gender: "",
      address: "",
      registeredBranchId: "branch-b",
      branchMedicalRecordNumbers: [
        { branchId: "branch-b", medicalRecordNumber: "RM-OLD-001" }
      ],
      createdAt: "",
      updatedAt: ""
    };

    const preview = await parseLegacyPatientHistoryWorkbook(
      createLegacyWorkbook(),
      [branchBPatient],
      "branch-a"
    );

    expect(preview.profileRows[0].isValid).toBe(false);
    expect(preview.profileRows[0].errors).toContain(
      "No. RM yang sama tercatat di cabang lain; pasien tidak dicocokkan otomatis"
    );
    expect(preview.visitRows[0].isValid).toBe(false);
  });

  it("requires explicit confirmation before linking an existing profile by exact NIK", async () => {
    const existingPatient: PatientProfile = {
      id: "verified-patient",
      medicalRecordNumber: "RM-OTHER-001",
      name: "Pasien Contoh",
      phone: "",
      identityDocumentNumber: "3201010101900001",
      dateOfBirth: "",
      gender: "",
      address: "",
      registeredBranchId: "branch-b",
      branchMedicalRecordNumbers: [
        { branchId: "branch-b", medicalRecordNumber: "RM-OTHER-001" }
      ],
      createdAt: "",
      updatedAt: ""
    };
    const preview = await parseLegacyPatientHistoryWorkbook(
      createLegacyWorkbook(false, true),
      [existingPatient],
      "branch-a"
    );

    expect(preview.profileRows[0]).toMatchObject({
      isValid: true,
      existingPatientId: "verified-patient",
      matchMethod: "identity_document"
    });

    await expect(
      executeLegacyPatientHistoryImport(
        {
          getPatients: async () => [existingPatient],
          createPatient: async () => {
            throw new Error("An existing profile should be linked, not recreated");
          },
          registerPatientBranchMedicalRecordNumber: async () => {}
        },
        {
          getVisitById: async () => null,
          createVisit: async (data) => ({
            ...data,
            id: data.id || "visit",
            visitDateTime: data.visitDateTime || "",
            visitStatus: data.visitStatus || VisitStatus.WAITING,
            createdAt: "",
            updatedAt: ""
          } as PatientVisit)
        },
        preview,
        "branch-a",
        UserRole.SUPER_ADMIN
      )
    ).rejects.toThrow("konfirmasi dahulu");

    let assignedBranchRm = false;
    const linkedResult = await executeLegacyPatientHistoryImport(
      {
        getPatients: async () => [existingPatient],
        createPatient: async () => {
          throw new Error("An existing profile should be linked, not recreated");
        },
        registerPatientBranchMedicalRecordNumber: async (_patientId, branchId, rm) => {
          assignedBranchRm = branchId === "branch-a" && rm === "RM-OLD-001";
        }
      },
      {
        getVisitById: async () => null,
        createVisit: async (data) => ({
          ...data,
          id: data.id || "visit",
          visitDateTime: data.visitDateTime || "",
          visitStatus: data.visitStatus || VisitStatus.WAITING,
          createdAt: "",
          updatedAt: ""
        } as PatientVisit)
      },
      preview,
      "branch-a",
      UserRole.SUPER_ADMIN,
      undefined,
      true
    );

    expect(assignedBranchRm).toBe(true);
    expect(linkedResult.profilesAlreadyPresent).toBe(1);
    expect(linkedResult.visitsCreated).toBe(1);
  });

  it("creates completed historical visits without creating duplicates on retry", async () => {
    const patients: PatientProfile[] = [];
    const visits = new Map<string, PatientVisit>();
    let nextPatientId = 1;

    const patientRepo: Pick<
      PatientRepository,
      "getPatients" | "createPatient" | "registerPatientBranchMedicalRecordNumber"
    > = {
      getPatients: async () => [...patients],
      createPatient: async (data) => {
        const patient: PatientProfile = {
          ...data,
          id: `legacy-patient-${nextPatientId++}`,
          medicalRecordNumber: data.medicalRecordNumber || "",
          createdAt: "2026-10-22T00:00:00.000Z",
          updatedAt: "2026-10-22T00:00:00.000Z"
        };
        patients.push(patient);
        return patient;
      },
      registerPatientBranchMedicalRecordNumber: async () => {}
    };
    const visitRepo: Pick<VisitRepository, "getVisitById" | "createVisit"> = {
      getVisitById: async (id) => visits.get(id) || null,
      createVisit: async (data) => {
        const visit: PatientVisit = {
          ...data,
          id: data.id || "missing-id",
          visitDateTime: data.visitDateTime || "",
          visitStatus: data.visitStatus || VisitStatus.WAITING,
          createdAt: "2026-10-22T00:00:00.000Z",
          updatedAt: "2026-10-22T00:00:00.000Z"
        };
        visits.set(visit.id, visit);
        return visit;
      }
    };
    const firstPreview = await parseLegacyPatientHistoryWorkbook(createLegacyWorkbook(), []);
    const first = await executeLegacyPatientHistoryImport(
      patientRepo,
      visitRepo,
      firstPreview,
      "branch-gebang",
      UserRole.SUPER_ADMIN
    );

    expect(first.profilesCreated).toBe(1);
    expect(first.visitsCreated).toBe(1);
    expect(first.visitsFailed).toBe(2);
    const importedVisit = [...visits.values()][0];
    expect(importedVisit).toMatchObject({
      branchId: "branch-gebang",
      visitType: VisitType.WALK_IN,
      visitStatus: VisitStatus.COMPLETED,
      bookingId: null
    });
    expect(importedVisit.complaint).toContain("Diagnosis lama: Diagnosis historis");
    expect(importedVisit.complaint).toContain("Tindakan lama (belum dipetakan)");

    const retryPreview = await parseLegacyPatientHistoryWorkbook(createLegacyWorkbook(), patients);
    const retry = await executeLegacyPatientHistoryImport(
      patientRepo,
      visitRepo,
      retryPreview,
      "branch-gebang",
      UserRole.SUPER_ADMIN
    );
    expect(retry.profilesCreated).toBe(0);
    expect(retry.visitsCreated).toBe(0);
    expect(retry.visitsAlreadyImported).toBe(1);
    expect(visits.size).toBe(1);
  });
});
