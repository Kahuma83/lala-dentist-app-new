import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

describe("Unperformed treatment cancellation migration", () => {
  const migration = fs.readFileSync(
    path.resolve(
      process.cwd(),
      "supabase/migrations/20270117000000_allow_cancellation_of_unperformed_treatments.sql"
    ),
    "utf-8"
  );

  it("locks the treatment and requires confirmation for an in-progress item", () => {
    expect(migration).toMatch(/WHERE id = p_treatment_id\s+FOR UPDATE/);
    expect(migration).toContain("p_not_performed_confirmed IS DISTINCT FROM TRUE");
    expect(migration).toContain("v_treatment.status NOT IN ('BELUM_DIMULAI', 'DALAM_PROSES')");
  });

  it("rejects cancellation after material usage or clinical activity", () => {
    expect(migration).toContain("FROM public.inventory_treatment_consumptions");
    expect(migration).toContain("movement.movement_type = 'OUT'");
    expect(migration).toContain("activity.activity_type <> 'STARTED'");
  });
});
