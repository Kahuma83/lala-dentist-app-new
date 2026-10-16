import { describe, expect, it } from "vitest";
import { MockAccountingRepository } from "../repositories/mockRepositories";
import { AccountingPostingService } from "../services/accountingPostingService";
import { JournalSourceType, JournalStatus, UserRole } from "../types/domain";
import * as fs from "fs";
import * as path from "path";

describe("daily rent and THR accruals", () => {
  it("saves one configurable recurring accrual plan per branch and type", async () => {
    const repository = new MockAccountingRepository();
    const rent = await repository.saveRecurringExpensePlan(
      {
        branchId: "branch-gebang",
        expenseType: "RENT",
        amount: 3000000,
        startsOn: "2026-10-01",
        isActive: true
      },
      "Admin Gebang",
      UserRole.BRANCH_ADMIN,
      "branch-gebang"
    );
    const updated = await repository.saveRecurringExpensePlan(
      {
        branchId: "branch-gebang",
        expenseType: "RENT",
        amount: 3600000,
        startsOn: "2026-10-01",
        isActive: true
      },
      "Admin Gebang",
      UserRole.BRANCH_ADMIN,
      "branch-gebang"
    );

    expect(updated.id).toBe(rent.id);
    expect(updated.amount).toBe(3600000);
    expect(await repository.getRecurringExpensePlans("branch-gebang")).toHaveLength(1);
    expect(await repository.getRecurringExpensePlans("branch-other")).toHaveLength(0);
  });

  it("rejects branch admins attempting to configure another branch", async () => {
    const repository = new MockAccountingRepository();
    await expect(repository.saveRecurringExpensePlan(
      {
        branchId: "branch-other",
        expenseType: "THR",
        amount: 36500000,
        startsOn: "2026-01-01",
        isActive: true
      },
      "Admin Gebang",
      UserRole.BRANCH_ADMIN,
      "branch-gebang"
    )).rejects.toThrow("cabangnya sendiri");
  });

  it("settles an accrued liability against cash without posting a second expense", async () => {
    const repository = new MockAccountingRepository();
    const plan = await repository.saveRecurringExpensePlan(
      {
        branchId: "branch-gebang",
        expenseType: "RENT",
        amount: 3000000,
        startsOn: "2026-10-01",
        isActive: true
      },
      "Super Admin",
      UserRole.SUPER_ADMIN
    );
    const liability = await repository.getAccountByCode("2050");
    const rentExpense = await repository.getAccountByCode("5030");
    if (!liability || !rentExpense) throw new Error("Mock rent accounts are missing");
    const accrual = await repository.createDraftJournal(
      {
        journalDate: "2026-10-31",
        branchId: "branch-gebang",
        description: "Akrual sewa bulan Oktober",
        sourceType: JournalSourceType.EXPENSE,
        sourceId: "RECURRING_ACCRUAL:test",
        lines: [
          { accountId: rentExpense.id, debit: 1000, credit: 0, branchId: "branch-gebang" },
          { accountId: liability.id, debit: 0, credit: 1000, branchId: "branch-gebang" }
        ]
      },
      "System"
    );
    await repository.postJournal(accrual.id, "System");

    const service = new AccountingPostingService({ accountingRepo: repository });
    const settlement = await service.postRecurringExpenseSettlement(
      {
        planId: plan.id,
        expenseType: "RENT",
        branchId: "branch-gebang",
        paymentAccountId: "coa-1000",
        amount: 800,
        date: "2026-11-01",
        referenceNumber: "RENT-NOV"
      },
      UserRole.SUPER_ADMIN
    );

    expect(settlement.status).toBe(JournalStatus.POSTED);
    expect(settlement.event).toBe("PAYMENT");
    expect(settlement.lines.find((line) => line.accountId === liability.id)?.debit).toBe(800);
    expect(settlement.lines.find((line) => line.accountId === "coa-1000")?.credit).toBe(800);
    expect(settlement.lines.some((line) => line.accountId === rentExpense.id)).toBe(false);
    await expect(service.postRecurringExpenseSettlement(
      {
        planId: plan.id,
        expenseType: "RENT",
        branchId: "branch-gebang",
        paymentAccountId: "coa-1000",
        amount: 300,
        date: "2026-11-01"
      },
      UserRole.SUPER_ADMIN
    )).rejects.toThrow("melebihi akrual");
  });

  it("schedules idempotent daily accruals and monthly balanced journals in Supabase", () => {
    const migration = fs.readFileSync(
      path.resolve(process.cwd(), "supabase/migrations/20261029000000_daily_rent_thr_accruals.sql"),
      "utf-8"
    );

    expect(migration).toContain("UNIQUE (plan_id, accrual_date)");
    expect(migration).toContain("ON CONFLICT (plan_id, accrual_date) DO NOTHING");
    expect(migration).toContain("floor(plan_row.amount::numeric");
    expect(migration).toContain("RECURRING_ACCRUAL:");
    expect(migration).toContain("'5 17 * * *'");
    expect(migration).toContain("CREATE EXTENSION IF NOT EXISTS pg_cron");
    expect(migration).toContain("'2050'");
    expect(migration).toContain("'2060'");
  });
});
