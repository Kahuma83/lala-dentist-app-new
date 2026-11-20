import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

describe("Branch admin treatment PIC migration", () => {
  const migration = fs.readFileSync(
    path.resolve(process.cwd(), "supabase/manual-migrations/20270226000000_allow_branch_admin_treatment_pic.sql"),
    "utf-8"
  );
  const queueClaimMigration = fs.readFileSync(
    path.resolve(process.cwd(), "supabase/migrations/20270211000000_assistant_treatment_incentive_from_queue_call.sql"),
    "utf-8"
  );

  it("allows doctors to assign active assistants or branch admins assigned to the visit branch", () => {
    expect(migration).toContain("v_user.role <> 'DOCTOR'");
    expect(migration).toContain("assistant.position IN ('ASSISTANT', 'BRANCH_ADMIN')");
    expect(migration).toContain("assistant.employment_status = 'ACTIVE'");
    expect(migration).toContain("assistant.branch_id = v_visit.branch_id");
    expect(migration).toContain("assignment.branch_id = v_visit.branch_id");
    expect(migration).toContain("assignment.date = (v_visit.visit_date_time AT TIME ZONE 'Asia/Jakarta')::DATE");
    expect(migration).toContain("PIC kunjungan sudah terkunci saat tindakan dimulai");
  });

  it("validates the shared treatment tariff for branch admins as well as assistants", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.accrue_visit_staff_incentives");
    expect(migration).toContain("assistant.position IN ('ASSISTANT', 'BRANCH_ADMIN')");
    expect(migration).toContain("rate.service_id = job.service_id");
    expect(migration).toContain("assistant.position <> 'BRANCH_ADMIN'");
    expect(migration).toContain("public.assistant_treatment_incentive_rates");
    expect(migration).toContain("rate.amount = compensation_accruals.amount");
    expect(migration).toContain("Validated shared assistant treatment incentive insert");
  });

  it("keeps queue self-claim restricted to assistant staff", () => {
    expect(queueClaimMigration).toContain("assistant.position = 'ASSISTANT'");
    expect(queueClaimMigration).toContain("Hanya asisten yang dapat mencatat diri");
  });
});
