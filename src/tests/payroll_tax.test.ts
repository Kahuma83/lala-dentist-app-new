import { describe, expect, it } from "vitest";
import { calculatePayrollTax } from "../utils/payrollTax";
import { MockDatabase } from "../data/mockData";
import { MockPayrollRepository } from "../repositories/mockRepositories";
import { AttendanceStatus, StaffCompensationRule } from "../types/domain";

describe("calculatePayrollTax", () => {
  it("calculates flexible percentage deductions from gross income", () => {
    expect(calculatePayrollTax(10_000_000, 2.5)).toBe(250_000);
    expect(calculatePayrollTax(10_000_000, 5)).toBe(500_000);
  });

  it("rounds to whole rupiah and allows a zero rate", () => {
    expect(calculatePayrollTax(101, 2.5)).toBe(3);
    expect(calculatePayrollTax(10_000, 0)).toBe(0);
  });

  it("rejects invalid income and rates", () => {
    expect(() => calculatePayrollTax(-1, 2.5)).toThrow();
    expect(() => calculatePayrollTax(100, 101)).toThrow();
  });

  it("generates separate branch payslips with each branch's tax rate", async () => {
    const db = MockDatabase.resetInstance();
    const payrollRepo = new MockPayrollRepository();
    const staffId = "staff-doc-syafira";
    const makeRule = (
      id: string,
      branchId: string,
      ruleTypeSnapshot: StaffCompensationRule["ruleTypeSnapshot"],
      valueSnapshot: number
    ): StaffCompensationRule => ({
      id,
      staffId,
      name: `${ruleTypeSnapshot} ${branchId}`,
      ruleTypeSnapshot,
      valueSnapshot,
      isActive: true,
      branchId,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    });
    db.rules.push(
      makeRule("salary-gebang", "branch-gebang", "BASE_SALARY", 1_000_000),
      makeRule("salary-kampus", "branch-kampus", "BASE_SALARY", 2_000_000),
      makeRule("tax-gebang", "branch-gebang", "TAX_PERCENTAGE", 2.5),
      makeRule("tax-kampus", "branch-kampus", "TAX_PERCENTAGE", 5)
    );
    db.accruals.push(
      {
        id: "sharing-gebang",
        staffId: "doc-syafira",
        branchId: "branch-gebang",
        amount: 200_000,
        sourceId: "treatment-gebang",
        accruedAt: "2026-10-15T00:00:00.000Z"
      },
      {
        id: "sharing-kampus",
        staffId: "doc-syafira",
        branchId: "branch-kampus",
        amount: 600_000,
        sourceId: "treatment-kampus",
        accruedAt: "2026-10-15T00:00:00.000Z"
      }
    );

    const gebang = await payrollRepo.generateMonthlyPayroll(staffId, 10, 2026, undefined, false, "branch-gebang");
    const kampus = await payrollRepo.generateMonthlyPayroll(staffId, 10, 2026, undefined, false, "branch-kampus");
    const gebangItems = await payrollRepo.getPayrollItems(gebang.id);
    const kampusItems = await payrollRepo.getPayrollItems(kampus.id);
    const gebangGross = gebangItems.filter((item) => item.type === "EARNING").reduce((sum, item) => sum + item.amountSnapshot, 0);
    const kampusGross = kampusItems.filter((item) => item.type === "EARNING").reduce((sum, item) => sum + item.amountSnapshot, 0);
    const gebangTax = gebangItems.find((item) => item.descriptionSnapshot.startsWith("Potongan Pajak"));
    const kampusTax = kampusItems.find((item) => item.descriptionSnapshot.startsWith("Potongan Pajak"));

    expect(gebang.id).not.toBe(kampus.id);
    expect(gebang.branchId).toBe("branch-gebang");
    expect(kampus.branchId).toBe("branch-kampus");
    expect(gebang.baseSalary).toBe(1_000_000);
    expect(kampus.baseSalary).toBe(2_000_000);
    expect(gebangItems.some((item) => item.sourceId === "sharing-gebang")).toBe(true);
    expect(gebangItems.some((item) => item.sourceId === "sharing-kampus")).toBe(false);
    expect(kampusItems.some((item) => item.sourceId === "sharing-kampus")).toBe(true);
    expect(kampusItems.some((item) => item.sourceId === "sharing-gebang")).toBe(false);
    expect(gebangTax?.amountSnapshot).toBe(Math.round(gebangGross * 0.025));
    expect(kampusTax?.amountSnapshot).toBe(Math.round(kampusGross * 0.05));
  });

  it("counts doctor sitting-fee attendance only for the payroll branch", async () => {
    const db = MockDatabase.resetInstance();
    const payrollRepo = new MockPayrollRepository();
    const staffId = "staff-doc-syafira";
    const doctor = db.doctors.find((candidate) => candidate.staffId === staffId)!;
    db.doctorSchedules = db.doctorSchedules.filter((schedule) => schedule.doctorId !== doctor.id);
    db.attendances = db.attendances.filter((attendance) =>
      attendance.staffId !== staffId && attendance.staffId !== doctor.id
    );
    db.rules = db.rules.filter((rule) =>
      rule.staffId !== staffId && rule.staffId !== doctor.id
    );
    db.rules.push(
      {
        id: "sitting-gebang",
        staffId,
        name: "Sitting Gebang",
        ruleTypeSnapshot: "DOCTOR_SITTING_FEE",
        valueSnapshot: 10_000,
        isActive: true,
        branchId: "branch-gebang",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
      },
      {
        id: "sitting-kampus",
        staffId,
        name: "Sitting Kampus",
        ruleTypeSnapshot: "DOCTOR_SITTING_FEE",
        valueSnapshot: 20_000,
        isActive: true,
        branchId: "branch-kampus",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
      }
    );
    const attendanceTemplate = db.attendances[0];
    for (const [index, branchId] of ["branch-gebang", "branch-gebang", "branch-kampus"].entries()) {
      db.attendances.push({
        ...attendanceTemplate,
        id: `sitting-attendance-${index}`,
        staffId,
        branchId,
        date: `2026-10-${String(index + 1).padStart(2, "0")}`,
        attendanceStatus: AttendanceStatus.PRESENT
      });
    }

    const gebang = await payrollRepo.generateMonthlyPayroll(staffId, 10, 2026, 1_000_000, false, "branch-gebang");
    const kampus = await payrollRepo.generateMonthlyPayroll(staffId, 10, 2026, 1_000_000, false, "branch-kampus");
    const gebangSittingFee = (await payrollRepo.getPayrollItems(gebang.id))
      .find((item) => item.descriptionSnapshot.includes("Sitting Fee"));
    const kampusSittingFee = (await payrollRepo.getPayrollItems(kampus.id))
      .find((item) => item.descriptionSnapshot.includes("Sitting Fee"));

    expect(gebangSittingFee?.amountSnapshot).toBe(20_000);
    expect(kampusSittingFee?.amountSnapshot).toBe(20_000);
  });
});
