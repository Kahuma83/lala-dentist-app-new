import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("Financial compensation policy migration", () => {
  const migration = fs.readFileSync(
    path.resolve(process.cwd(), "supabase/migrations/20270101000000_align_financial_compensation_policies.sql"),
    "utf-8"
  );

  it("validates accrual bases using service revenue after discounts and before tax", () => {
    expect(migration).toContain("invoice.total_amount - invoice.discount_amount");
    expect(migration).toContain("invoice_line_amount_after_discount(invoice.id, invoice_item.id)");
    expect(migration).toContain("invoice.status = 'PAID'");
    expect(migration).not.toContain("invoice.net_amount");
    expect(migration).not.toContain("service.base_price");
  });

  it("keeps the percentage amount consistent with the validated service-revenue snapshot", () => {
    expect(migration).toContain(
      "ROUND(compensation_accruals.base_amount_snapshot * rule.value_snapshot / 100)::BIGINT"
    );
    expect(migration).toContain("rule.rule_type_snapshot IN ('PERCENTAGE', 'FIXED_PER_TREATMENT')");
  });

  it("blocks approved overtime for positions outside assistants and branch admins", () => {
    expect(migration).toContain("public.guard_overtime_eligible_position()");
    expect(migration).toContain("employee.position IN ('BRANCH_ADMIN', 'ASSISTANT')");
    expect(migration).toContain("BEFORE INSERT OR UPDATE ON public.overtime_records");
  });

  it("adds transactional RPCs for draft payroll replacement and paid overtime tracking", () => {
    const payrollMigration = fs.readFileSync(
      path.resolve(process.cwd(), "supabase/migrations/20270102000000_atomic_payroll_generation_and_overtime_paid.sql"),
      "utf-8"
    );

    expect(payrollMigration).toContain("public.save_draft_payroll_with_items");
    expect(payrollMigration).toContain("FOR UPDATE");
    expect(payrollMigration).toContain("DELETE FROM public.payroll_items");
    expect(payrollMigration).toContain("INSERT INTO public.payroll_items");
    expect(payrollMigration).toContain("public.mark_payroll_paid_and_overtime");
    expect(payrollMigration).toContain("overtime.status = 'APPROVED'");
    expect(payrollMigration).toContain("SET status = 'PAID'");
  });
});
