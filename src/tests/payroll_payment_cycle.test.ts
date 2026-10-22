import { describe, expect, it } from "vitest";
import {
  classifyPayrollPaymentItem,
  createPayrollPaymentSummary,
  getPayrollDueDate,
  getPreviousPayrollPeriod
} from "../utils/payrollPaymentCycle";
import { EmploymentStatus, PayrollStatus, StaffPosition } from "../types/domain";

describe("Payroll payment cycle", () => {
  it("selects the previous payroll period including January year rollover", () => {
    expect(getPreviousPayrollPeriod(new Date(2027, 0, 1))).toEqual({ month: 12, year: 2026 });
    expect(getPreviousPayrollPeriod(new Date(2026, 9, 23))).toEqual({ month: 9, year: 2026 });
  });

  it("sets payment due date to the first day after the payroll period", () => {
    expect(getPayrollDueDate(9, 2026)).toBe("2026-10-01");
    expect(getPayrollDueDate(12, 2026)).toBe("2027-01-01");
  });

  it("separates payroll earnings and deductions into payment categories", () => {
    expect(classifyPayrollPaymentItem({ type: "EARNING", descriptionSnapshot: "Gaji Pokok Periode 9/2026" }, false))
      .toBe("BASE_SALARY");
    expect(classifyPayrollPaymentItem({ type: "EARNING", descriptionSnapshot: "Lembur Disetujui" }, false))
      .toBe("OVERTIME");
    expect(classifyPayrollPaymentItem({ type: "EARNING", descriptionSnapshot: "Kompensasi Tindakan" }, true))
      .toBe("DOCTOR_SHARING");
    expect(classifyPayrollPaymentItem({ type: "EARNING", descriptionSnapshot: "Kompensasi Tindakan" }, false))
      .toBe("INCENTIVE");
    expect(classifyPayrollPaymentItem({ type: "EARNING", descriptionSnapshot: "Insentif Referral Admin" }, false))
      .toBe("INCENTIVE");
    expect(classifyPayrollPaymentItem({ type: "EARNING", descriptionSnapshot: "Upah Pengganti" }, false))
      .toBe("REPLACEMENT");
    expect(classifyPayrollPaymentItem({ type: "DEDUCTION", descriptionSnapshot: "Potongan Ketidakhadiran" }, false))
      .toBe("DEDUCTION");
  });

  it("summarizes recipients and categories without changing existing payroll statuses", () => {
    const summary = createPayrollPaymentSummary(
      [{
        id: "payroll-1",
        staffId: "doctor-staff",
        month: 9,
        year: 2026,
        baseSalary: 2_000_000,
        totalCompensation: 300_000,
        totalDeductions: 50_000,
        netSalary: 2_350_000,
        status: PayrollStatus.REVIEW,
        createdAt: "",
        updatedAt: ""
      }],
      [
        { id: "item-1", payrollId: "payroll-1", descriptionSnapshot: "Gaji Pokok", amountSnapshot: 2_000_000, type: "EARNING" },
        { id: "item-2", payrollId: "payroll-1", descriptionSnapshot: "Sharing Dokter", amountSnapshot: 300_000, type: "EARNING" },
        { id: "item-3", payrollId: "payroll-1", descriptionSnapshot: "Lembur Disetujui", amountSnapshot: 100_000, type: "EARNING" },
        { id: "item-4", payrollId: "payroll-1", descriptionSnapshot: "Potongan", amountSnapshot: 50_000, type: "DEDUCTION" }
      ],
      [{ id: "doctor-staff", employeeCode: "DOC-1", fullName: "Dokter", phone: "", position: StaffPosition.DOCTOR, employmentStatus: EmploymentStatus.ACTIVE, joinDate: "2020-01-01", active: true, notes: "", createdAt: "", updatedAt: "" }],
      [],
      9,
      2026
    );

    expect(summary.dueDate).toBe("2026-10-01");
    expect(summary.recipientCount).toBe(1);
    expect(summary.totalNetPay).toBe(2_350_000);
    expect(summary.statusCounts[PayrollStatus.REVIEW]).toBe(1);
    expect(summary.categoryTotals.BASE_SALARY).toBe(2_000_000);
    expect(summary.categoryTotals.DOCTOR_SHARING).toBe(300_000);
    expect(summary.categoryTotals.OVERTIME).toBe(100_000);
    expect(summary.categoryTotals.DEDUCTION).toBe(50_000);
  });
});
