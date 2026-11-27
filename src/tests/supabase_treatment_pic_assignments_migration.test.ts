import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

describe("Super Admin treatment PIC assignment migration", () => {
  const migration = fs.readFileSync(
    path.resolve(process.cwd(), "supabase/manual-migrations/20270314000000_super_admin_read_treatment_pic_assignments.sql"),
    "utf-8"
  );

  it("adds a read policy for Super Admin without replacing branch access", () => {
    expect(migration).toContain("GRANT SELECT ON public.treatment_visit_assistant_assignments TO authenticated");
    expect(migration).toContain('CREATE POLICY "Super Admin reads treatment PIC assignments"');
    expect(migration).toContain("USING (public.is_super_admin())");
  });
});
