import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

describe("Doctor-confirmed visit assistant migration", () => {
  const migration = fs.readFileSync(
    path.resolve(process.cwd(), "supabase/migrations/20270212000000_doctor_confirms_visit_assistant.sql"),
    "utf-8"
  );

  it("persists one nullable assistant choice per visit and backfills visits already started", () => {
    expect(migration).toContain("treatment_visit_assistant_assignments");
    expect(migration).toContain("assistant_staff_id UUID NULL");
    expect(migration).toContain("WHERE job.started_at IS NOT NULL");
    expect(migration).toContain("ON CONFLICT (visit_id) DO NOTHING");
  });

  it("lets only an authorized doctor assign an active assistant before treatment starts", () => {
    expect(migration).toContain("v_user.role <> 'DOCTOR'");
    expect(migration).toContain("public.user_can_manage_treatment_branch(v_visit.branch_id)");
    expect(migration).toContain("assistant.position = 'ASSISTANT'");
    expect(migration).toContain("assistant.employment_status = 'ACTIVE'");
    expect(migration).toContain("assignment.branch_id = v_visit.branch_id");
    expect(migration).toContain("Asisten kunjungan sudah terkunci saat tindakan dimulai");
  });

  it("propagates the confirmed assignment to existing and future visit treatments", () => {
    expect(migration).toContain("SET pic_assistant_id = p_assistant_staff_id");
    expect(migration).toContain("IF v_assignment_exists THEN");
    expect(migration).toContain("NEW.pic_assistant_id := v_staff_id");
    expect(migration).toContain("queue_items_respect_doctor_assistant_confirmation");
    expect(migration).toContain("Asisten PIC kunjungan sudah dikonfirmasi oleh Dokter");
  });
});
