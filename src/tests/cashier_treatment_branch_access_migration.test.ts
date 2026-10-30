import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("Cashier treatment return branch access migration", () => {
  const migration = fs.readFileSync(
    path.resolve(
      process.cwd(),
      "supabase/migrations/20270112000000_fix_cashier_treatment_return_branch_access.sql"
    ),
    "utf-8"
  );

  it("allows branch admins to return treatments only in branches they can access", () => {
    expect(migration).toContain("v_user.role NOT IN ('BRANCH_ADMIN', 'SUPER_ADMIN')");
    expect(migration).toContain("AND NOT public.user_can_access_branch(v_treatment.branch_id)");
    expect(migration).toContain("v_user.role <> 'SUPER_ADMIN'");
    expect(migration).not.toContain("public.user_can_manage_treatment_branch(v_treatment.branch_id)");
  });

  it("preserves return workflow validation and audit activity", () => {
    expect(migration).toContain("v_treatment.status <> 'DISERAHKAN'");
    expect(migration).toContain("invoice.status <> 'CANCELLED'");
    expect(migration).toContain("SET status = 'PERLU_REVISI'");
    expect(migration).toContain("'RETURNED_TO_DOCTOR'");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.return_treatment_to_doctor_secure(UUID, TEXT) FROM PUBLIC, anon");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.return_treatment_to_doctor_secure(UUID, TEXT) TO authenticated, service_role");
  });
});
