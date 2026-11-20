import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

describe("Doctor treatment shift visibility migration", () => {
  const migration = fs.readFileSync(
    path.resolve(process.cwd(), "supabase/manual-migrations/20270310000000_doctors_read_treatment_shifts.sql"),
    "utf-8"
  );

  it("allows doctors to read shift assignments only for manageable treatment branches", () => {
    expect(migration).toContain("ON public.staff_shift_assignments");
    expect(migration).toContain("FOR SELECT");
    expect(migration).toContain("public.get_user_role() = 'DOCTOR'");
    expect(migration).toContain("public.user_can_manage_treatment_branch(branch_id)");
  });

  it("allows doctors to read work shifts only for manageable treatment branches", () => {
    expect(migration).toContain("ON public.work_shifts");
    expect(migration).toContain("FOR SELECT");
    expect(migration).toContain("public.get_user_role() = 'DOCTOR'");
    expect(migration).toContain("public.user_can_manage_treatment_branch(branch_id)");
  });
});
