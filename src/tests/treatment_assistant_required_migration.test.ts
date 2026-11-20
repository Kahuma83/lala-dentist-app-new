import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

describe("Required treatment assistant migration", () => {
  const migration = fs.readFileSync(
    path.resolve(process.cwd(), "supabase/manual-migrations/20270309000000_require_treatment_assistant_pic.sql"),
    "utf-8"
  );

  it("rejects empty visit PIC assignments", () => {
    expect(migration).toContain("IF NEW.assistant_staff_id IS NULL THEN");
    expect(migration).toContain("treatment_visit_assistant_pic_required");
    expect(migration).toContain("PIC kunjungan wajib diisi sebelum disimpan");
  });

  it("blocks starting a treatment job without a PIC", () => {
    expect(migration).toContain("treatment_job_pic_required_before_start");
    expect(migration).toContain("OLD.pic_assistant_id IS NOT NULL AND NEW.pic_assistant_id IS NULL");
    expect(migration).toContain("NEW.status = 'DALAM_PROSES'");
    expect(migration).toContain("NEW.started_at IS NOT NULL AND OLD.started_at IS NULL");
    expect(migration).toContain("NEW.pic_assistant_id IS NULL");
    expect(migration).toContain("PIC wajib ditetapkan sebelum tindakan dimulai");
  });
});
