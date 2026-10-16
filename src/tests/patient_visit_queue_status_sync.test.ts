import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("Patient visit status synchronization from queue", () => {
  it("backfills existing visits and tracks future queue status changes", () => {
    const migration = fs.readFileSync(
      path.resolve(process.cwd(), "supabase/migrations/20261016000001_sync_patient_visit_status_with_queue.sql"),
      "utf-8"
    );

    expect(migration).toContain("CREATE TRIGGER queue_items_sync_patient_visit_status");
    expect(migration).toContain("AFTER INSERT OR UPDATE OF status ON public.queue_items");
    expect(migration).toContain("WHEN NEW.status IN ('WAITING', 'IN_PREPARATION', 'CALLING') THEN 'IN_TRIAGE'");
    expect(migration).toContain("WHEN NEW.status = 'IN_CONSULTATION' THEN 'IN_TREATMENT'");
    expect(migration).toContain("WHEN NEW.status = 'COMPLETED' THEN 'COMPLETED'");
    expect(migration).toContain("WITH latest_queue_status AS");
  });
});
