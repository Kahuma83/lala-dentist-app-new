import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("Compensation RLS hardening migration", () => {
  const migration = fs.readFileSync(
    path.resolve(process.cwd(), "supabase/migrations/20261017000002_harden_compensation_rls.sql"),
    "utf-8"
  );
  const repository = fs.readFileSync(
    path.resolve(process.cwd(), "src/repositories/supabaseRepositories.ts"),
    "utf-8"
  );

  it("enables RLS and replaces all prior policies on compensation tables", () => {
    expect(migration).toContain("ALTER TABLE public.staff_compensation_rules ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("ALTER TABLE public.compensation_accruals ENABLE ROW LEVEL SECURITY");
    expect(migration).toMatch(/FROM pg_policies[\s\S]*?tablename IN \('staff_compensation_rules', 'compensation_accruals'\)/);
  });

  it("limits compensation rule changes to Super Admin", () => {
    expect(migration).toMatch(
      /CREATE POLICY "Super admin manages compensation rules"[\s\S]*?FOR ALL[\s\S]*?USING \(public\.is_super_admin\(\)\)[\s\S]*?WITH CHECK \(public\.is_super_admin\(\)\)/i
    );
  });

  it("validates accrual writes against completed treatments and the matching rule calculation", () => {
    expect(migration).toMatch(
      /CREATE POLICY "Validated compensation accrual insert"[\s\S]*?job\.status IN \('SELESAI', 'DISERAHKAN'\)[\s\S]*?rule\.is_active[\s\S]*?compensation_accruals\.amount = CASE/i
    );
  });

  it("makes per-treatment accrual creation idempotent under concurrent requests", () => {
    expect(migration).toContain(
      "CREATE UNIQUE INDEX IF NOT EXISTS uq_compensation_accrual_source_staff_rule"
    );
    expect(repository).toMatch(
      /\.from\("compensation_accruals"\)\s*\.upsert\(payload,\s*\{\s*onConflict: "source_id,staff_id,rule_id_snapshot",\s*ignoreDuplicates: true/
    );
  });
});
