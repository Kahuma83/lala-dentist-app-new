import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("Owner weekly activity trend", () => {
  const migration = fs.readFileSync(
    path.resolve(process.cwd(), "supabase/migrations/20270222000000_owner_weekly_activity_trend.sql"),
    "utf-8"
  );
  const dashboard = fs.readFileSync(
    path.resolve(process.cwd(), "src/pages/OwnerDashboard.tsx"),
    "utf-8"
  );

  it("limits the aggregate trend RPC to authenticated active Owner accounts and a bounded date range", () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.get_owner_dashboard_weekly_trend/i);
    expect(migration).toMatch(/auth\.uid\(\) IS NULL OR NOT public\.is_owner\(\)/i);
    expect(migration).toMatch(/p_end_date - p_start_date > 30/i);
    expect(migration).toMatch(/SECURITY DEFINER/i);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_owner_dashboard_weekly_trend\(DATE, DATE\) TO authenticated/i);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.get_owner_dashboard_weekly_trend\(DATE, DATE\) FROM PUBLIC, anon/i);
  });

  it("aggregates only completed visits and successful payments by Jakarta date", () => {
    expect(migration).toMatch(/visit\.visit_status = 'COMPLETED'/i);
    expect(migration).toMatch(/payment\.status = 'SUCCESS'/i);
    expect(migration).toMatch(/AT TIME ZONE 'Asia\/Jakarta'/i);
    expect(migration).toMatch(/'completedVisits', coalesce\(visits\.total, 0\)/i);
    expect(migration).toMatch(/'collected', coalesce\(payments\.total, 0\)/i);
    expect(migration).toMatch(/generate_series\(p_start_date, p_end_date/i);
  });

  it("shows a daily paired comparison for visits and collected payments on the Owner dashboard", () => {
    expect(dashboard).toContain('supabase.rpc("get_owner_dashboard_weekly_trend"');
    expect(dashboard).toContain("Kunjungan selesai");
    expect(dashboard).toContain("Pembayaran diterima");
    expect(dashboard).toContain("Dibanding 7 hari sebelumnya");
    expect(dashboard).toContain("Minggu ini");
    expect(dashboard).toContain("Minggu lalu");
  });
});
