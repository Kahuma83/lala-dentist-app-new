import { describe, it, expect, beforeEach } from "vitest";
import { MockDatabase } from "../data/mockData";
import { seedMonthlyDummyData, resetMonthlyDummyData, SeedMonthlyReport } from "../services/seedMonthlyDataService";
import {
  MockInvoiceRepository,
  MockPaymentRepository,
  MockPayrollRepository,
  MockTreatmentRepository
} from "../repositories/mockRepositories";
import { UserRole, InvoiceStatus, PayrollStatus, PaymentMethod } from "../types/domain";

describe("PHASE — FULL MONTH DUMMY DATA / END-TO-END SYSTEM VERIFICATION (01-30 Sept 2026)", () => {
  let report: SeedMonthlyReport;

  beforeEach(async () => {
    report = await seedMonthlyDummyData();
  });

  it("1. Should successfully seed 1 full month of operational data with PASS status", () => {
    expect(report.seedStatus).toBe("PASS");
    expect(report.period).toBe("01 September 2026 - 30 September 2026");
  });

  it("2. Should satisfy all volume targets for UI testing and operational pipeline", () => {
    expect(report.counts.patients).toBeGreaterThanOrEqual(100);
    expect(report.counts.bookings).toBeGreaterThanOrEqual(70);
    expect(report.counts.visits).toBeGreaterThanOrEqual(100);
    expect(report.counts.queueItems).toBeGreaterThanOrEqual(100);
    expect(report.counts.treatments).toBeGreaterThanOrEqual(100);
    expect(report.counts.treatmentActivities).toBeGreaterThanOrEqual(100);
    expect(report.counts.assistantActivities).toBeGreaterThanOrEqual(10);
    expect(report.counts.invoices).toBeGreaterThanOrEqual(80);
    expect(report.counts.payments).toBeGreaterThanOrEqual(60);
    expect(report.counts.partialPaidInvoices).toBeGreaterThanOrEqual(5);
    expect(report.counts.paidInvoices).toBeGreaterThanOrEqual(50);
    expect(report.counts.treatmentIncentives).toBeGreaterThanOrEqual(30);
    expect(report.counts.assistantIncentives).toBeGreaterThanOrEqual(10);
    expect(report.counts.attendances).toBeGreaterThanOrEqual(100);
    expect(report.counts.overtimes).toBeGreaterThanOrEqual(5);
    expect(report.counts.payrolls).toBeGreaterThanOrEqual(5);
    expect(report.counts.payrollPaid).toBeGreaterThanOrEqual(5);
    expect(report.counts.payslips).toBeGreaterThanOrEqual(5);
  });

  it("3. Model C: Assistant Incentive flow should accrue and reflect in PAID payroll and slip", () => {
    expect(report.verifications.assistantModelC).toBe("PASS");
    expect(report.assistantModelCTestSample).toBeDefined();
    expect(report.assistantModelCTestSample!.assistantName).toContain("Clary");
    expect(report.assistantModelCTestSample!.status).toBe("PAID");
    expect(report.assistantModelCTestSample!.incentiveAmount).toBeGreaterThan(0);
    expect(report.assistantModelCTestSample!.slipStatus).toBe("AVAILABLE");
  });

  it("4. Doctor Compensation flow should accrue and reflect in PAID payroll and slip", () => {
    expect(report.verifications.doctorCompensation).toBe("PASS");
    expect(report.doctorTestSample).toBeDefined();
    expect(report.doctorTestSample!.doctorName).toContain("Syafira");
    expect(report.doctorTestSample!.status).toBe("PAID");
    expect(report.doctorTestSample!.compensationTotal).toBeGreaterThan(0);
  });

  it("5. Partial Payment and Multiple Payment installment test", async () => {
    expect(report.verifications.partialPayment).toBe("PASS");
    expect(report.verifications.fullPayment).toBe("PASS");
  });

  it("6. Overpayment protection should strictly reject payments exceeding outstanding balance", async () => {
    expect(report.verifications.overpaymentProtection).toBe("PASS");
    const paymentRepo = new MockPaymentRepository();
    const invoiceRepo = new MockInvoiceRepository();
    const inv = (await invoiceRepo.getInvoices()).find(i => i.status === InvoiceStatus.OPEN);
    if (inv) {
      await expect(
        paymentRepo.createPayment({
          invoiceId: inv.id,
          amount: inv.outstandingAmount + 100000,
          paymentMethod: PaymentMethod.CASH,
          staffId: "staff-siska"
        })
      ).rejects.toThrow(/melebihi sisa tagihan/);
    }
  });

  it("7. Invoice and Payroll Snapshots should remain immutable", () => {
    expect(report.verifications.invoiceSnapshot).toBe("PASS");
    expect(report.verifications.payrollSnapshot).toBe("PASS");
  });

  it("8. Branch isolation: Branch Admin Gebang should only see Gebang data", async () => {
    expect(report.verifications.branchIsolation).toBe("PASS");
    const invoiceRepo = new MockInvoiceRepository();
    const gebangInvoices = await invoiceRepo.getInvoices(UserRole.BRANCH_ADMIN, "branch-gebang");
    for (const inv of gebangInvoices) {
      expect(inv.branchId).toBe("branch-gebang");
    }
  });

  it("9. Reset mechanism should remove demo records without touching master data", async () => {
    const db = MockDatabase.getInstance();
    const originalBranchCount = db.branches.length;
    const originalStaffCount = db.staff.length;
    const originalDoctorCount = db.doctors.length;

    await resetMonthlyDummyData();

    // Verify all DEMO-SEP-2026 data is purged
    expect(db.patients.some(p => p.id.startsWith("DEMO-SEP-2026"))).toBe(false);
    expect(db.visits.some(v => v.id.startsWith("DEMO-SEP-2026"))).toBe(false);
    expect(db.invoices.some(i => i.id.startsWith("DEMO-SEP-2026"))).toBe(false);
    expect(db.payrolls.some(p => p.id.startsWith("DEMO-SEP-2026"))).toBe(false);

    // Verify master data remains intact
    expect(db.branches.length).toBe(originalBranchCount);
    expect(db.staff.length).toBe(originalStaffCount);
    expect(db.doctors.length).toBe(originalDoctorCount);
  });
});
