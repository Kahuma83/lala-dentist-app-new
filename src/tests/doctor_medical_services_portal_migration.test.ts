import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("Doctor medical services portal migration", () => {
  const migration = fs.readFileSync(
    path.resolve(process.cwd(), "supabase/migrations/20261226000000_doctor_medical_services_portal.sql"),
    "utf-8"
  );

  it("restricts the summary endpoint to the active doctor's own staff record", () => {
    expect(migration).toContain("public.get_user_role() IS DISTINCT FROM 'DOCTOR'");
    expect(migration).toContain("v_staff_id := public.get_user_staff_id()");
    expect(migration).toContain("accrual.staff_id = v_staff_id");
    expect(migration).toContain("doctor.staff_id = v_staff_id");
    expect(migration).toContain("FROM PUBLIC, anon");
    expect(migration).toContain("TO authenticated");
  });

  it("returns only completed treatment service, branch, date, and compensation totals", () => {
    expect(migration).toContain("job.status IN ('SELESAI', 'DISERAHKAN')");
    expect(migration).toContain("accrual.rule_type_snapshot IN ('PERCENTAGE', 'FIXED_PER_TREATMENT')");
    expect(migration).toContain("SUM(accrual.amount)::BIGINT AS amount");
    expect(migration).not.toMatch(/patient_(?:id|name)|medical_record|phone/i);
  });

  it("bounds page sizes and uses a stable cursor to limit returned details", () => {
    expect(migration).toContain("p_end_date - p_start_date > 31");
    expect(migration).toContain("p_limit > 50");
    expect(migration).toContain("p_limit + 1");
    expect(migration).toContain("source_id < p_before_source_id");
    expect(migration).toContain("'hasMore', v_has_more");
  });
});
