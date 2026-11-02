import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

describe("Shared assistant treatment incentive migration", () => {
  const migration = fs.readFileSync(
    path.resolve(process.cwd(), "supabase/migrations/20270208000000_shared_assistant_treatment_incentives.sql"),
    "utf-8"
  );

  it("creates service-specific shared rates managed by Super Admin", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.assistant_treatment_incentive_rates");
    expect(migration).toContain("service_id UUID NOT NULL REFERENCES public.master_services(id)");
    expect(migration).toContain("UNIQUE (service_id)");
    expect(migration).toContain("save_shared_assistant_treatment_incentive_rate");
    expect(migration).toContain("public.is_super_admin()");
  });

  it("validates shared accruals against the assigned active assistant, paid treatment, and configured rate", () => {
    expect(migration).toContain("Validated shared assistant treatment incentive insert");
    expect(migration).toContain("job.pic_assistant_id");
    expect(migration).toContain("invoice.status = 'PAID'");
    expect(migration).toContain("assistant.employment_status = 'ACTIVE'");
    expect(migration).toContain("NOT EXISTS");
    expect(migration).toContain("ASSISTANT_TREATMENT_BASE_V1");
  });
});
