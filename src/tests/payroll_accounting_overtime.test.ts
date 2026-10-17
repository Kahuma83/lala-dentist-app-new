import { beforeEach, describe, expect, it } from "vitest";
import { MockDatabase } from "../data/mockData";
import { MockAccountingRepository, MockPayrollRepository } from "../repositories/mockRepositories";
import { AccountingPostingService } from "../services/accountingPostingService";
import { PayrollStatus } from "../types/domain";

describe("Payroll accounting posting", () => {
  let db: MockDatabase;
  let payrollRepo: MockPayrollRepository;
  let accountingRepo: MockAccountingRepository;

  beforeEach(() => {
    db = MockDatabase.resetInstance();
    payrollRepo = new MockPayrollRepository();
    accountingRepo = new MockAccountingRepository();
  });

  it("includes approved overtime snapshot items in the payroll accrual journal", async () => {
    const payroll = await payrollRepo.generateMonthlyPayroll("staff-payroll-posting", 10, 2026, 2_500_000);
    const storedPayroll = db.payrolls.find((item) => item.id === payroll.id);
    if (!storedPayroll) throw new Error("Generated payroll was not stored");
    storedPayroll.status = PayrollStatus.APPROVED;
    storedPayroll.netSalary += 100_000;
    db.payrollItems.push({
      id: "item-overtime-1",
      payrollId: payroll.id,
      descriptionSnapshot: "Lembur Disetujui (4 jam / 2026-10-12)",
      amountSnapshot: 100_000,
      type: "EARNING",
      sourceId: "overtime-1"
    });

    const service = new AccountingPostingService({ accountingRepo, payrollRepo });
    const journal = await service.postPayroll(payroll.id);

    expect(journal.totalDebit).toBe(storedPayroll.netSalary);
    expect(journal.totalCredit).toBe(storedPayroll.netSalary);
    expect(journal.lines).toHaveLength(4);
  });
});
