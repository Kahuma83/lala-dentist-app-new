import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { StaffCompensationRule } from "../types/domain";
import { selectMostSpecificTreatmentRules } from "../utils/compensationRules";

const makeRule = (
  id: string,
  overrides: Partial<StaffCompensationRule> = {}
): StaffCompensationRule => ({
  id,
  staffId: "staff-regina",
  name: id,
  ruleTypeSnapshot: "PERCENTAGE",
  valueSnapshot: 24,
  isActive: true,
  serviceId: null,
  branchId: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides
});

describe("Treatment compensation rule selection", () => {
  it("uses the branch-specific rule instead of a matching global rule", () => {
    const globalRule = makeRule("sharing", { valueSnapshot: 24 });
    const branchRule = makeRule("branch-rule", {
      valueSnapshot: 28,
      branchId: "branch-kencong"
    });

    expect(selectMostSpecificTreatmentRules([globalRule, branchRule])).toEqual([branchRule]);
  });

  it("keeps different compensation types while selecting one rule per type", () => {
    const globalPercentage = makeRule("global-percentage");
    const branchPercentage = makeRule("branch-percentage", {
      branchId: "branch-kencong",
      valueSnapshot: 28
    });
    const fixedRule = makeRule("fixed-rule", {
      ruleTypeSnapshot: "FIXED_PER_TREATMENT",
      valueSnapshot: 10_000,
      branchId: "branch-kencong"
    });

    expect(selectMostSpecificTreatmentRules([globalPercentage, branchPercentage, fixedRule]))
      .toEqual([branchPercentage, fixedRule]);
  });

  it("chooses the newest rule when multiple rules have the same scope", () => {
    const olderRule = makeRule("older", {
      createdAt: "2026-01-01T00:00:00.000Z"
    });
    const newerRule = makeRule("newer", {
      createdAt: "2026-02-01T00:00:00.000Z",
      valueSnapshot: 28
    });

    expect(selectMostSpecificTreatmentRules([olderRule, newerRule])).toEqual([newerRule]);
  });

  it("corrects Regina's unposted duplicate accruals and makes database inserts honor rule specificity", () => {
    const migration = fs.readFileSync(
      path.resolve(process.cwd(), "supabase/migrations/20270130000000_prevent_duplicate_treatment_accruals.sql"),
      "utf8"
    );

    expect(migration).toContain("v_obsolete_rule_id UUID := 'b30aa9b9-fb1d-4f56-b497-f5698ee3ecd0'");
    expect(migration).toContain("v_preferred_rule_id UUID := 'ec762140-7cd1-4a41-a143-77fb3ab81072'");
    expect(migration).toContain("Akrual duplikat Regina sudah terkait payroll atau jurnal");
    expect(migration).toContain("value_snapshot = v_preferred_rate");
    expect(migration).toContain("DELETE FROM public.compensation_accruals obsolete");
    expect(migration).toContain("SET is_active = false");
    expect(migration).toContain("AND NOT EXISTS");
    expect(migration).toContain("candidate.created_at > rule.created_at");
  });

  it("deduplicates unposted treatment accruals for all staff using rule scope without changing the winning snapshot", () => {
    const migration = fs.readFileSync(
      path.resolve(process.cwd(), "supabase/migrations/20270131000000_deduplicate_unposted_treatment_accruals.sql"),
      "utf8"
    );

    expect(migration).toContain("PARTITION BY source_id, staff_id, rule_type_snapshot");
    expect(migration).toContain("ORDER BY specificity DESC, created_at DESC");
    expect(migration).toContain("plan.rule_rank > 1");
    expect(migration).toContain("FROM public.payroll_items item");
    expect(migration).toContain("FROM public.journal_entries journal");
    expect(migration).toContain("Migration dibatalkan tanpa menghapus akrual");
    expect(migration).not.toContain("SET amount =");
    expect(migration).not.toContain("SET value_snapshot =");
  });

  it("removes duplicate draft payroll items and recalculates payroll while rejecting posted records", () => {
    const migration = fs.readFileSync(
      path.resolve(process.cwd(), "supabase/migrations/20270201000000_deduplicate_draft_treatment_accruals.sql"),
      "utf8"
    );

    expect(migration).toContain("payroll.status <> 'DRAFT'");
    expect(migration).toContain("ORDER BY specificity DESC, created_at DESC, rule_id DESC");
    expect(migration).toContain("DELETE FROM public.payroll_items item");
    expect(migration).toContain("DELETE FROM public.compensation_accruals accrual");
    expect(migration).toContain("SET total_compensation = v_total_compensation");
    expect(migration).toContain("SET amount_snapshot = v_tax_amount");
    expect(migration).toContain("net_salary = v_gross_income - v_total_deductions");
    expect(migration).toContain("journal.source_type = 'COMPENSATION'");
  });

  it("reconciles duplicates with inactive or missing historical rules and carries draft payroll items to the winner", () => {
    const migration = fs.readFileSync(
      path.resolve(process.cwd(), "supabase/migrations/20270202000000_reconcile_historical_treatment_accruals.sql"),
      "utf8"
    );

    expect(migration).toContain("FROM duplicate_groups");
    expect(migration).toContain("rule.is_active");
    expect(migration).toContain("loser.id <> winner.id");
    expect(migration).toContain("SET source_id = plan.winner_id::TEXT");
    expect(migration).toContain("amount_snapshot = plan.winner_amount");
    expect(migration).toContain("journal.source_type = 'PAYROLL'");
    expect(migration).toContain("payroll.status <> 'DRAFT'");
    expect(migration).toContain("item.source_id IN (plan.loser_id::TEXT, plan.winner_id::TEXT)");
    expect(migration).toContain("DELETE FROM public.compensation_accruals loser");
  });

  it("corrects mismatched percentage snapshots for unposted accruals and recalculates linked draft payroll", () => {
    const migration = fs.readFileSync(
      path.resolve(process.cwd(), "supabase/migrations/20270203000000_correct_unposted_treatment_accrual_rates.sql"),
      "utf8"
    );

    expect(migration).toContain("accrual.rule_type_snapshot = 'PERCENTAGE'");
    expect(migration).toContain("accrual.value_snapshot <> selected.current_value");
    expect(migration).toContain("ROUND(accrual.base_amount_snapshot * selected.current_value / 100)");
    expect(migration).toContain("journal.source_type = 'COMPENSATION'");
    expect(migration).toContain("payroll.status <> 'DRAFT'");
    expect(migration).toContain("SET value_snapshot = plan.current_value");
    expect(migration).toContain("SET amount_snapshot = plan.corrected_amount");
    expect(migration).toContain("SET total_compensation = v_total_compensation");
    expect(migration).toContain("net_salary = v_gross_income - v_total_deductions");
  });
});
