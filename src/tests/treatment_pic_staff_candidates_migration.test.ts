import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

describe("Doctor treatment PIC staff candidates migration", () => {
  const migration = fs.readFileSync(
    path.resolve(process.cwd(), "supabase/manual-migrations/20270311000000_doctors_read_treatment_pic_candidates.sql"),
    "utf-8"
  );

  it("limits the RPC to authenticated doctors managing the candidate's branch", () => {
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("auth.uid() IS NULL");
    expect(migration).toContain("public.get_user_role() IS DISTINCT FROM 'DOCTOR'");
    expect(migration).toContain("public.user_can_manage_treatment_branch");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.get_treatment_pic_staff_candidates() TO authenticated");
    expect(migration).toContain("FROM PUBLIC, anon");
  });

  it("returns only active assistant and branch-admin fields needed for PIC selection", () => {
    expect(migration).toContain("full_name TEXT");
    expect(migration).toContain("staff_position TEXT");
    expect(migration).toContain("employment_status TEXT");
    expect(migration).toContain("staff.position IN ('ASSISTANT', 'BRANCH_ADMIN')");
    expect(migration).not.toContain("nik");
    expect(migration).not.toContain("phone");
    expect(migration).not.toContain("bank_account_number");
  });
});
