import {
  DentalDoctor,
  MonthlyPayroll,
  PayrollItem,
  PayrollStatus,
  Staff,
  StaffPosition
} from "../types/domain";

export type PayrollPaymentCategory =
  | "BASE_SALARY"
  | "DOCTOR_SHARING"
  | "OVERTIME"
  | "INCENTIVE"
  | "REPLACEMENT"
  | "DEDUCTION"
  | "OTHER";

export interface PayrollPaymentSummary {
  dueDate: string;
  payrollCount: number;
  recipientCount: number;
  totalNetPay: number;
  statusCounts: Record<PayrollStatus, number>;
  categoryTotals: Record<PayrollPaymentCategory, number>;
}

export function getPreviousPayrollPeriod(date: Date): { month: number; year: number } {
  const previousMonth = new Date(date.getFullYear(), date.getMonth() - 1, 1);
  return { month: previousMonth.getMonth() + 1, year: previousMonth.getFullYear() };
}

export function getPayrollDueDate(month: number, year: number): string {
  const dueDate = new Date(Date.UTC(year, month, 1));
  return dueDate.toISOString().slice(0, 10);
}

export function classifyPayrollPaymentItem(
  item: Pick<PayrollItem, "type" | "descriptionSnapshot">,
  isDoctor: boolean
): PayrollPaymentCategory {
  if (item.type === "DEDUCTION") return "DEDUCTION";

  const description = item.descriptionSnapshot.trim().toLowerCase();
  if (/gaji pokok|base salary/.test(description)) return "BASE_SALARY";
  if (/lembur|overtime/.test(description)) return "OVERTIME";
  if (/upah pengganti|replacement/.test(description)) return "REPLACEMENT";
  if (/referral|insentif|incentive|bonus/.test(description)) return "INCENTIVE";
  if (/sharing|komisi|sitting fee/.test(description)) return "DOCTOR_SHARING";
  if (/kompensasi tindakan/.test(description)) return isDoctor ? "DOCTOR_SHARING" : "INCENTIVE";
  return "OTHER";
}

export function createPayrollPaymentSummary(
  payrolls: MonthlyPayroll[],
  items: PayrollItem[],
  staff: Staff[],
  doctors: DentalDoctor[],
  periodMonth: number,
  periodYear: number
): PayrollPaymentSummary {
  const payrollById = new Map(payrolls.map((payroll) => [payroll.id, payroll]));
  const staffById = new Map(staff.map((record) => [record.id, record]));
  const doctorStaffIds = new Set(
    doctors.flatMap((doctor) => [doctor.id, doctor.staffId].filter((id): id is string => Boolean(id)))
  );
  const statusCounts: Record<PayrollStatus, number> = {
    [PayrollStatus.DRAFT]: 0,
    [PayrollStatus.REVIEW]: 0,
    [PayrollStatus.APPROVED]: 0,
    [PayrollStatus.PAID]: 0
  };
  const categoryTotals: Record<PayrollPaymentCategory, number> = {
    BASE_SALARY: 0,
    DOCTOR_SHARING: 0,
    OVERTIME: 0,
    INCENTIVE: 0,
    REPLACEMENT: 0,
    DEDUCTION: 0,
    OTHER: 0
  };

  payrolls.forEach((payroll) => {
    statusCounts[payroll.status] += 1;
  });

  items.forEach((item) => {
    const payroll = payrollById.get(item.payrollId);
    if (!payroll) return;
    const payrollStaff = staffById.get(payroll.staffId);
    const isDoctor = payrollStaff?.position === StaffPosition.DOCTOR || doctorStaffIds.has(payroll.staffId);
    const category = classifyPayrollPaymentItem(item, isDoctor);
    categoryTotals[category] += Math.round(Number(item.amountSnapshot) || 0);
  });

  return {
    dueDate: getPayrollDueDate(periodMonth, periodYear),
    payrollCount: payrolls.length,
    recipientCount: new Set(payrolls.map((payroll) => payroll.staffId)).size,
    totalNetPay: payrolls.reduce((sum, payroll) => sum + Math.round(Number(payroll.netSalary) || 0), 0),
    statusCounts,
    categoryTotals
  };
}
