import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("Doctor replacement compensation migration", () => {
  const migration = fs.readFileSync(
    path.resolve(process.cwd(), "supabase/migrations/20261225000000_doctor_replacement_compensation.sql"),
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

  it("stores external daily/action rates and places the payout in the month of the final covered date", () => {
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

  it("requires Super Admin action-count confirmation and reviewed payroll status transitions", () => {
    expect(migration).toMatch(/confirm_external_doctor_action_count[\s\S]*?public\.is_super_admin\(\)/i);
    expect(migration).toMatch(/review_external_doctor_payroll_entry[\s\S]*?public\.is_super_admin\(\)/i);
    expect(migration).toMatch(/mark_external_doctor_payroll_paid[\s\S]*?public\.is_super_admin\(\)/i);
  });
});
