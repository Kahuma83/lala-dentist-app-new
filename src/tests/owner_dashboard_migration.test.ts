import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("Owner read-only dashboard migration", () => {
  const migration = fs.readFileSync(
    path.resolve(process.cwd(), "supabase/migrations/20270218000000_owner_read_only_dashboard.sql"),
    "utf-8"
  );

  it("adds the Owner role and validates the active Owner identity in the aggregate RPC", () => {
    expect(migration).toMatch(/'OWNER'/);
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.is_owner\(\)/i);
    expect(migration).toMatch(/auth_user_id = auth\.uid\(\)[\s\S]*?role = 'OWNER'[\s\S]*?active = true/i);
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.get_owner_dashboard_summary/i);
    expect(migration).toMatch(/auth\.uid\(\) IS NULL OR NOT public\.is_owner\(\)/i);
    expect(migration).toMatch(/p_end_date - p_start_date > 365/i);
  });

  it("returns only aggregate operational and financial metrics without patient identifiers", () => {
    expect(migration).toMatch(/'bookings', coalesce\(sum\(metrics\.bookings\)/i);
    expect(migration).toMatch(/'visits', coalesce\(sum\(metrics\.visits\)/i);
    expect(migration).toMatch(/'collected', coalesce\(sum\(metrics\.collected\)/i);
    expect(migration).toMatch(/'outstanding', coalesce\(sum\(metrics\.outstanding\)/i);
    expect(migration).toMatch(/'activeQueue', coalesce\(sum\(metrics\.active_queue\)/i);
    expect(migration).toMatch(/'openTreatments', coalesce\(sum\(metrics\.open_treatments\)/i);
    expect(migration).toMatch(/'lowStockItems', coalesce\(sum\(metrics\.low_stock_items\)/i);
    expect(migration).not.toMatch(/'patient(Id|Name|Email|Phone)'/i);
  });

  it("prevents Owner accounts from directly reading business tables", () => {
    expect(migration).toMatch(/ALTER TABLE public\.%I ENABLE ROW LEVEL SECURITY/i);
    expect(migration).toMatch(/CREATE POLICY owner_preserve_preexisting_access[\s\S]*?get_user_role\(\) <> ''OWNER''/i);
    expect(migration).toMatch(/AS RESTRICTIVE FOR ALL TO authenticated/i);
    expect(migration).toMatch(/public\.get_user_role\(\) <> ''OWNER''/i);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_owner_dashboard_summary\(DATE, DATE\) TO authenticated/i);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.get_owner_dashboard_summary\(DATE, DATE\) FROM PUBLIC, anon/i);
  });
});
