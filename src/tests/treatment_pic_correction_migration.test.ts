import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

describe("Super Admin treatment PIC correction migration", () => {
  const migration = fs.readFileSync(
    path.resolve(process.cwd(), "supabase/manual-migrations/20270313000000_super_admin_correct_treatment_pic.sql"),
    "utf-8"
  );

  it("limits PIC correction to Super Admin and persists an audit record", () => {
    expect(migration).toContain("public.correct_treatment_visit_assistant_pic");
    expect(migration).toContain("NOT public.is_super_admin()");
    expect(migration).toContain("treatment_pic_correction_audit");
    expect(migration).toContain("corrected_by, auth_user_id, reason");
    expect(migration).toContain("FROM PUBLIC, anon");
  });

  it("blocks correction when an old assistant accrual is linked to payroll or a journal", () => {
    expect(migration).toContain("public.payroll_items");
    expect(migration).toContain("journal.source_type = 'COMPENSATION'");
    expect(migration).toContain("insentif sudah masuk rincian payroll atau memiliki jurnal");
    expect(migration).toContain("DELETE FROM public.compensation_accruals");
  });

  it("updates the assignment and all non-cancelled treatments in the visit", () => {
    expect(migration).toContain("INSERT INTO public.treatment_visit_assistant_assignments");
    expect(migration).toContain("UPDATE public.treatment_jobs");
    expect(migration).toContain("WHERE visit_id = p_visit_id");
    expect(migration).toContain("AND status <> 'DIBATALKAN'");
    expect(migration).toContain("Hanya Dokter atau Super Admin yang dapat memuat kandidat PIC tindakan.");
  });
});
