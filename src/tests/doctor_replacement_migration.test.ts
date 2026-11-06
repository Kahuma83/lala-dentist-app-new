import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("Doctor replacement compensation migration", () => {
  const migration = fs.readFileSync(
    path.resolve(process.cwd(), "supabase/migrations/20261225000000_doctor_replacement_compensation.sql"),
    "utf-8"
  );
  const expenseMigration = fs.readFileSync(
    path.resolve(process.cwd(), "supabase/migrations/20270103000000_external_doctor_replacement_expense.sql"),
    "utf-8"
  );
  const branchSplitMigration = fs.readFileSync(
    path.resolve(process.cwd(), "supabase/migrations/20270104000000_split_external_doctor_expenses_by_branch.sql"),
    "utf-8"
  );
  const adminSelectionMigration = fs.readFileSync(
    path.resolve(process.cwd(), "supabase/migrations/20270213000000_allow_admin_external_doctor_replacement_selection.sql"),
    "utf-8"
  );
  const externalOverrideMigration = fs.readFileSync(
    path.resolve(process.cwd(), "supabase/migrations/20270214000000_enable_admin_external_doctor_override.sql"),
    "utf-8"
  );
  const absenceManager = fs.readFileSync(
    path.resolve(process.cwd(), "src/components/AbsenceRequestManager.tsx"),
    "utf-8"
  );

  it("keeps external doctors in a Super Admin-managed non-staff roster", () => {
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS public\.external_doctor_recipients/i);
    expect(migration).toMatch(/CREATE POLICY "Super Admin manages external doctor recipients"[\s\S]*?public\.is_super_admin\(\)/i);
  });

  it("requires external replacements only when no active internal doctor is available", () => {
    expect(migration).toMatch(/p_replacement_doctor_id IS NOT NULL AND p_external_doctor_id IS NOT NULL/i);
    expect(migration).toMatch(/Dokter internal tersedia pada rentang ini/i);
    expect(migration).toMatch(/p_replacement_doctor_id IS NOT NULL[\s\S]*?amount_snapshot[\s\S]*?60000/i);
  });

  it("stores external daily/action rates and the coverage period", () => {
    expect(migration).toMatch(/daily_fee_snapshot BIGINT NOT NULL DEFAULT 100000/i);
    expect(migration).toMatch(/action_fee_snapshot BIGINT NOT NULL DEFAULT 10000/i);
    expect(migration).toMatch(/EXTRACT\(MONTH FROM v_last_covered_date\)/i);
    expect(migration).toMatch(/EXTRACT\(YEAR FROM v_last_covered_date\)/i);
  });

  it("transfers external doctor identity to clinical records and treatment assignments", () => {
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS external_doctor_id UUID[\s\S]*?REFERENCES public\.external_doctor_recipients/i);
    expect(migration).toMatch(/CREATE TRIGGER inherit_external_doctor_queue_assignment[\s\S]*?public\.inherit_external_doctor_from_visit/i);
    expect(migration).toMatch(/CREATE TRIGGER inherit_external_doctor_treatment_assignment[\s\S]*?public\.inherit_external_doctor_from_visit/i);
    expect(migration).toMatch(/UPDATE public\.queue_items queue[\s\S]*?SET external_doctor_id = p_external_doctor_id,[\s\S]*?doctor_name_snapshot = v_external_doctor\.full_name/i);
    expect(migration).toMatch(/UPDATE public\.treatment_jobs[\s\S]*?SET external_doctor_id = p_external_doctor_id,[\s\S]*?doctor_name_snapshot = v_external_doctor\.full_name/i);
  });

  it("keeps action-count confirmation and honor review restricted to Super Admin", () => {
    expect(migration).toMatch(/confirm_external_doctor_action_count[\s\S]*?public\.is_super_admin\(\)/i);
    expect(migration).toMatch(/review_external_doctor_payroll_entry[\s\S]*?public\.is_super_admin\(\)/i);
  });

  it("allows Super Admin to override an applicant's internal doctor with an external replacement", () => {
    expect(adminSelectionMigration).toMatch(/CREATE OR REPLACE FUNCTION public\.guard_absence_external_replacement_consent/i);
    expect(adminSelectionMigration).toMatch(/NEW\.branch_id IS DISTINCT FROM v_request\.branch_id/i);
    expect(adminSelectionMigration).toMatch(/admin_external_doctor_id UUID/i);
    expect(adminSelectionMigration).toMatch(/review_doctor_absence_request_with_external_override/i);
    expect(adminSelectionMigration).toMatch(/NEW\.external_doctor_id IS DISTINCT FROM v_request\.admin_external_doctor_id/i);
    expect(adminSelectionMigration).toMatch(/admin_external_doctor_id IS NOT NULL[\s\S]*?external_doctor_replacement_assignments/i);
    expect(adminSelectionMigration).toMatch(/NOT public\.is_super_admin\(\)/i);
    expect(absenceManager).toMatch(/Pilihan penugasan Super Admin/);
    expect(absenceManager).toMatch(/replacementType === "EXTERNAL"/);
    expect(externalOverrideMigration).toMatch(/admin_external_doctor_id IS DISTINCT FROM p_external_doctor_id/i);
    expect(externalOverrideMigration).toMatch(/Tidak menemukan validasi ketersediaan dokter internal/i);
    expect(absenceManager).not.toMatch(/optgroup disabled=\{doctorReplacements\.length > 0\}/);
  });

  it("allows Super Admin to correct external doctor roster details", () => {
    expect(absenceManager).toMatch(/const saveExternalDoctor = async/);
    expect(absenceManager).toMatch(/full_name: fullName, phone, updated_at/);
    expect(absenceManager).toMatch(/externalDoctorEditName/);
    expect(absenceManager).toMatch(/externalDoctorEditPhone/);
    expect(absenceManager).toMatch(/>Edit<\/button>/);
  });

  it("adds a dedicated chart-of-accounts category for direct replacement expenses", () => {
    expect(expenseMigration).toMatch(/'5080'\s*,\s*'Beban Dokter Pengganti'/i);
    expect(expenseMigration).toMatch(/'DOCTOR_REPLACEMENT_EXPENSE'/i);
    expect(expenseMigration).toMatch(/ON CONFLICT \(code\) DO UPDATE/i);
  });

  it("splits external doctor expense entries by branch and service month", () => {
    expect(branchSplitMigration).toMatch(/DROP CONSTRAINT IF EXISTS external_doctor_payroll_entries_absence_request_id_key/i);
    expect(branchSplitMigration).toMatch(/uq_external_doctor_payroll_request_branch_period/i);
    expect(branchSplitMigration).toMatch(/GROUP BY[\s\S]*assignment\.branch_id[\s\S]*EXTRACT\(YEAR FROM assignment\.covered_date\)[\s\S]*EXTRACT\(MONTH FROM assignment\.covered_date\)/i);
    expect(branchSplitMigration).toMatch(/CREATE TRIGGER split_external_doctor_payroll_entry_by_branch/i);
    expect(branchSplitMigration).toMatch(/branch_period\.covered_days \* NEW\.daily_fee_snapshot/i);
    expect(branchSplitMigration).toMatch(/IF pg_trigger_depth\(\) > 1 THEN[\s\S]*RETURN NEW/i);
    expect(branchSplitMigration).toMatch(/entry\.status <> 'PENDING_ACTION_COUNT' OR entry\.action_count IS NOT NULL/i);
    expect(branchSplitMigration).toMatch(/entry\.status <> 'PAID'[\s\S]*DELETE FROM public\.external_doctor_payroll_entries/i);
  });

});
