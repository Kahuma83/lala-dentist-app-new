import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("retiring automatic recurring expenses", () => {
  it("removes recurring accrual controls while retaining daily expense and keriting flows", () => {
    const expensesPage = fs.readFileSync(
      path.resolve(process.cwd(), "src/pages/Expenses.tsx"),
      "utf-8"
    );

    expect(expensesPage).not.toContain("Penyisihan Harian Otomatis");
    expect(expensesPage).not.toContain("Tambah Rencana");
    expect(expensesPage).not.toContain("Catat Pembayaran");
    expect(expensesPage).toContain("Simpan Pengeluaran");
    expect(expensesPage).toContain("KERITING");
  });

  it("stops the scheduled accrual job and deactivates plans without deleting history", () => {
    const migration = fs.readFileSync(
      path.resolve(
        process.cwd(),
        "supabase/manual-migrations/20270306000000_disable_recurring_expense_accruals.sql"
      ),
      "utf-8"
    );

    expect(migration).toContain("daily-recurring-expense-accrual");
    expect(migration).toContain("cron.unschedule");
    expect(migration).toMatch(/UPDATE\s+public\.recurring_expense_plans[\s\S]*SET\s+is_active\s*=\s*false[\s\S]*WHERE\s+is_active\s+IS\s+TRUE/i);
    expect(migration).not.toMatch(/\b(DELETE|TRUNCATE|DROP)\b/i);
  });
});
