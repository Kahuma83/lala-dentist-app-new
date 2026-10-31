import { beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { MockDatabase } from "../data/mockData";
import { MockConfigurationRepository } from "../repositories/mockRepositories";
import { UserRole } from "../types/domain";

describe("Prescription medicine catalog", () => {
  let repository: MockConfigurationRepository;

  beforeEach(() => {
    MockDatabase.resetInstance();
    repository = new MockConfigurationRepository();
  });

  it("allows doctors to read active medicines and submit additions for approval", async () => {
    const activeMedicine = await repository.createPrescriptionMedicine({
      genericName: "Obat generik",
      brandName: "",
      strength: "10 mg",
      dosageForm: "tablet",
      isActive: true
    }, UserRole.SUPER_ADMIN);
    const inactiveMedicine = await repository.createPrescriptionMedicine({
      genericName: "Obat nonaktif",
      brandName: "",
      strength: "5 mg",
      dosageForm: "tablet",
      isActive: false
    }, UserRole.SUPER_ADMIN);
    const suggestedMedicine = await repository.createPrescriptionMedicine({
      genericName: "Usulan dokter",
      brandName: "",
      strength: "1 mg",
      dosageForm: "tablet",
      isActive: true
    }, UserRole.DOCTOR, "doctor-auth-1");

    await expect(repository.getPrescriptionMedicines(UserRole.DOCTOR, "doctor-auth-1")).resolves.toEqual([
      activeMedicine,
      suggestedMedicine
    ]);
    await expect(repository.getPrescriptionMedicines(UserRole.DOCTOR, "doctor-auth-2")).resolves.toEqual([
      activeMedicine,
      suggestedMedicine
    ]);
    await expect(repository.getPrescriptionMedicines(UserRole.SUPER_ADMIN)).resolves.toEqual([
      activeMedicine,
      inactiveMedicine,
      suggestedMedicine
    ]);
    expect(suggestedMedicine).toMatchObject({
      approvalStatus: "PENDING",
      isActive: false
    });
    await expect(repository.updatePrescriptionMedicine(
      suggestedMedicine.id,
      { approvalStatus: "APPROVED", isActive: true },
      UserRole.DOCTOR
    )).rejects.toThrow("Hanya Super Admin");

    await repository.updatePrescriptionMedicine(
      suggestedMedicine.id,
      { approvalStatus: "APPROVED", isActive: true },
      UserRole.SUPER_ADMIN
    );
    await expect(repository.getPrescriptionMedicines(UserRole.DOCTOR)).resolves.toHaveLength(2);
    await expect(repository.createPrescriptionMedicine({
      genericName: "Tidak berizin",
      brandName: "",
      strength: "1 mg",
      dosageForm: "tablet",
      isActive: true
    }, UserRole.DOCTOR_ASSISTANT)).rejects.toThrow("Hanya dokter");
  });

  it("allows doctors to withdraw only their own pending suggestion", async () => {
    const suggestion = await repository.createPrescriptionMedicine({
      genericName: "Usulan dokter",
      brandName: "",
      strength: "1 mg",
      dosageForm: "tablet",
      isActive: true
    }, UserRole.DOCTOR, "doctor-auth-1");

    await expect(repository.withdrawPrescriptionMedicineSuggestion(
      suggestion.id,
      UserRole.DOCTOR,
      "doctor-auth-2"
    )).rejects.toThrow("tidak ditemukan");

    await repository.withdrawPrescriptionMedicineSuggestion(
      suggestion.id,
      UserRole.DOCTOR,
      "doctor-auth-1"
    );
    await expect(repository.getPrescriptionMedicines(UserRole.DOCTOR, "doctor-auth-1")).resolves.toEqual([]);
    await expect(repository.getPrescriptionMedicines(UserRole.SUPER_ADMIN)).resolves.toMatchObject([
      { id: suggestion.id, approvalStatus: "REJECTED", isActive: false }
    ]);
  });

  it("rejects incomplete and duplicate medicines and can deactivate a catalog item", async () => {
    const medicine = await repository.createPrescriptionMedicine({
      genericName: "Nama generik",
      brandName: "Merek",
      strength: "100 mg",
      dosageForm: "kapsul",
      isActive: true
    }, UserRole.SUPER_ADMIN);

    await expect(repository.createPrescriptionMedicine({
      genericName: " nama GENERIK ",
      brandName: "merek",
      strength: "100 MG",
      dosageForm: "KAPSUL",
      isActive: true
    }, UserRole.SUPER_ADMIN)).rejects.toThrow("sudah ada");
    await expect(repository.createPrescriptionMedicine({
      genericName: "   ",
      brandName: "",
      strength: "1 mg",
      dosageForm: "tablet",
      isActive: true
    }, UserRole.SUPER_ADMIN)).rejects.toThrow("wajib diisi");

    await repository.updatePrescriptionMedicine(medicine.id, { isActive: false }, UserRole.SUPER_ADMIN);
    await expect(repository.getPrescriptionMedicines(UserRole.DOCTOR)).resolves.toEqual([]);
  });

  it("restricts database review to super admins and allows doctor submissions only as pending", () => {
    const migration = fs.readFileSync(
      path.resolve(process.cwd(), "supabase/migrations/20270122000000_doctor_prescription_medicine_suggestions.sql"),
      "utf-8"
    );
    expect(migration).toContain("approval_status = 'APPROVED'");
    expect(migration).toContain("approval_status = 'PENDING'");
    expect(migration).toContain("is_active = false");
    expect(migration).toContain("submitted_by = auth.uid()");
    expect(migration).toContain("WITH CHECK (public.is_super_admin())");
    expect(migration).toContain("USING (public.is_super_admin())");
  });

  it("allows doctors to review pending seeds while keeping all non-pending management restricted", () => {
    const migration = fs.readFileSync(
      path.resolve(process.cwd(), "supabase/migrations/20270125000000_doctors_read_pending_prescription_medicines.sql"),
      "utf-8"
    );
    expect(migration).toContain("OR approval_status = 'PENDING'");
    expect(migration).toContain("approval_status = 'APPROVED' AND is_active = true");
    expect(migration).toContain("approval_status = 'REJECTED' AND submitted_by = auth.uid()");
    expect(migration).not.toContain("FOR UPDATE");
    expect(migration).not.toContain("FOR DELETE");
  });

  it("provides the medicine draft catalog in local demo mode", () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), "src/data/mockData.ts"), "utf-8");
    const seedFactory = source.slice(
      source.indexOf("const createMockPrescriptionMedicineSeeds"),
      source.indexOf("const mockDatabaseStorageKey")
    );
    expect(seedFactory.match(/^\s+\["/gm)).toHaveLength(32);
    expect(seedFactory).toContain('approvalStatus: "PENDING"');
    expect(seedFactory).toContain("submittedBy: null");
    expect(seedFactory).toContain("isActive: false");
    expect(seedFactory).not.toContain("default_instruction");
  });

  it("seeds all CSV medicines as inactive suggestions without prescription instructions", () => {
    const migration = fs.readFileSync(
      path.resolve(process.cwd(), "supabase/migrations/20270123000000_seed_common_prescription_medicines.sql"),
      "utf-8"
    );
    expect(migration.match(/^\s+\('/gm)).toHaveLength(32);
    expect(migration).toContain("'PENDING'");
    expect(migration).toContain("false");
    expect(migration).toContain("submitted_by");
    expect(migration).not.toContain("default_instruction");
    expect(migration).not.toContain("default_qty");
  });

  it("allows withdrawal only through a doctor-scoped security definer function", () => {
    const migration = fs.readFileSync(
      path.resolve(process.cwd(), "supabase/migrations/20270124000000_withdraw_own_prescription_medicine_suggestion.sql"),
      "utf-8"
    );
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("public.get_user_role() IS DISTINCT FROM 'DOCTOR'");
    expect(migration).toContain("submitted_by = auth.uid()");
    expect(migration).toContain("approval_status = 'PENDING'");
    expect(migration).toContain("GRANT EXECUTE");
  });
});
