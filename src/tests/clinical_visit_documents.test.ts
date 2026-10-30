import { beforeEach, describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { MockDatabase } from "../data/mockData";
import { MockMedicalRecordRepository } from "../repositories/mockRepositories";
import { UserRole } from "../types/domain";

describe("Clinical documents linked to patient visits", () => {
  let repository: MockMedicalRecordRepository;

  beforeEach(() => {
    MockDatabase.resetInstance();
    repository = new MockMedicalRecordRepository();
  });

  it("persists a prescription in the visit history and returns it newest first", async () => {
    const saved = await repository.createClinicalVisitDocument(
      {
        visitId: "visit-1",
        patientId: "patient-1",
        branchId: "branch-gebang",
        doctorId: "doc-syafira",
        type: "PRESCRIPTION",
        formData: {
          patientName: "Pasien Satu",
          prescription: "Obat sesuai instruksi dokter"
        }
      },
      UserRole.DOCTOR,
      "branch-gebang",
      "user-doctor"
    );

    const history = await repository.getClinicalVisitDocuments(
      "visit-1",
      UserRole.DOCTOR,
      "branch-gebang"
    );

    expect(history).toHaveLength(1);
    expect(history[0]).toEqual(saved);
    expect(history[0].patientId).toBe("patient-1");
    expect(history[0].formData.prescription).toBe("Obat sesuai instruksi dokter");
    expect(history[0].createdBy).toBe("user-doctor");
  });

  it("rejects documents linked to another patient or branch", async () => {
    await expect(repository.createClinicalVisitDocument(
      {
        visitId: "visit-1",
        patientId: "patient-2",
        branchId: "branch-gebang",
        doctorId: "doc-syafira",
        type: "REFERRAL",
        formData: {}
      },
      UserRole.DOCTOR,
      "branch-gebang"
    )).rejects.toThrow("Data pasien atau cabang tidak sesuai dengan kunjungan.");
  });

  it("allows document creation only to doctors", async () => {
    await expect(repository.createClinicalVisitDocument(
      {
        visitId: "visit-1",
        patientId: "patient-1",
        branchId: "branch-gebang",
        doctorId: "doc-syafira",
        type: "SICK_NOTE",
        formData: {}
      },
      UserRole.BRANCH_ADMIN,
      "branch-gebang"
    )).rejects.toThrow("Anda tidak memiliki akses ke data ini.");
  });

  it("protects persisted visit documents with an assigned-doctor RLS policy", () => {
    const migration = fs.readFileSync(
      path.resolve(process.cwd(), "supabase/migrations/20270118000000_clinical_visit_documents.sql"),
      "utf-8"
    );
    expect(migration).toContain("ALTER TABLE public.clinical_visit_documents ENABLE ROW LEVEL SECURITY;");
    expect(migration).toContain("public.doctor_can_manage_clinical_visit(visit_id, branch_id, doctor_id)");
    expect(migration).toContain("Dokumen klinis bersifat permanen");
  });
});
