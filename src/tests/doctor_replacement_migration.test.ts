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
