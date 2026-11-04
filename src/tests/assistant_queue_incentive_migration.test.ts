import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

describe("Assistant treatment incentive queue migration", () => {
  const migration = fs.readFileSync(
    path.resolve(process.cwd(), "supabase/migrations/20270211000000_assistant_treatment_incentive_from_queue_call.sql"),
    "utf-8"
  );

  it("only lets the active assistant claim a visit in their accessible branch", () => {
    expect(migration).toContain("public.get_user_role() IS DISTINCT FROM 'DOCTOR_ASSISTANT'");
    expect(migration).toContain("public.get_user_staff_id()");
    expect(migration).toContain("assistant.position = 'ASSISTANT'");
    expect(migration).toContain("assistant.employment_status = 'ACTIVE'");
    expect(migration).toContain("public.user_can_manage_treatment_branch(v_queue.branch_id)");
    expect(migration).toContain("FOR UPDATE");
  });

  it("assigns the assistant to all non-cancelled treatments in the visit and new treatments", () => {
    expect(migration).toContain("WHERE visit_id = v_queue.visit_id");
    expect(migration).toContain("AND status <> 'DIBATALKAN'");
    expect(migration).toContain("CREATE TRIGGER treatment_jobs_inherit_queue_assistant");
  });

  it("does not allow retroactive attribution after a linked invoice is paid", () => {
    expect(migration).toContain("invoice.status = 'PAID'");
    expect(migration).toContain("asisten pendamping tidak dapat ditetapkan secara retroaktif");
  });
});
