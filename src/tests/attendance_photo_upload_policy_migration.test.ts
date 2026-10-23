import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("Attendance photo upload policy migration", () => {
  const migration = fs.readFileSync(
    path.resolve(process.cwd(), "supabase/migrations/20261218000000_fix_attendance_photo_upload_policy.sql"),
    "utf-8"
  );

  it("checks a doctor's scheduled branch against the uploaded object's path", () => {
    expect(migration).toContain("storage.foldername(storage.objects.name))[1]");
    expect(migration).not.toContain("storage.foldername((dd.name)::text)");
    expect(migration).toContain("ds.date = (NOW() AT TIME ZONE 'Asia/Jakarta')::DATE");
    expect(migration).toContain("ds.status = 'ACTIVE'");
  });

  it("keeps uploads limited to the authenticated staff member and attendance bucket", () => {
    expect(migration).toContain("bucket_id = 'attendance-evidence'");
    expect(migration).toContain("(storage.foldername(name))[2] = public.get_user_staff_id()::TEXT");
    expect(migration).toContain("FOR INSERT TO authenticated");
  });
});
