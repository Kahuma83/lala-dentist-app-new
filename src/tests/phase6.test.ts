import { describe, it, expect, beforeEach } from "vitest";
import { MockDatabase } from "../data/mockData";
import {
  MockCompensationRepository,
  MockPayrollRepository,
  MockConfigurationRepository,
  MockTreatmentRepository,
  AppClock
} from "../repositories/mockRepositories";
import {
  AttendanceStatus,
  OvertimeStatus,
  OvertimeType,
  PayrollStatus,
  TreatmentJobStatus,
  UserRole
} from "../types/domain";
import { createPaidInvoiceForTreatment } from "./helpers/paidTreatmentInvoice";

describe("Phase 6: Compensation, Payroll & Master Configuration Test Suite", () => {
  let compRepo: MockCompensationRepository;
  let payrollRepo: MockPayrollRepository;
  let configRepo: MockConfigurationRepository;
  let treatmentRepo: MockTreatmentRepository;

  beforeEach(() => {
    MockDatabase.resetInstance();
    AppClock.reset();
    compRepo = new MockCompensationRepository();
    payrollRepo = new MockPayrollRepository();
    configRepo = new MockConfigurationRepository();
    treatmentRepo = new MockTreatmentRepository();
  });

  it("Test 1: Super Admin can list all compensation rules", async () => {
    const rules = await compRepo.getCompensationRules();
    expect(rules.length).toBeGreaterThan(0);
    expect(rules.some((r) => r.staffId === "assistant-clary")).toBe(true);
  });

  it("Test 2: Create a percentage compensation rule for doctor", async () => {
    const rule = await compRepo.createCompensationRule({
      staffId: "doc-syafira",
      name: "Komisi Dokter Andi 40%",
      ruleTypeSnapshot: "PERCENTAGE",
      valueSnapshot: 40,
      isActive: true
    });

    expect(rule.id).toBeDefined();
    expect(rule.valueSnapshot).toBe(40);
    expect(rule.staffId).toBe("doc-syafira");

    const doctorRules = await compRepo.getCompensationRulesByStaff("doc-syafira");
    expect(doctorRules.some((r) => r.id === rule.id)).toBe(true);
  });

  it("Test 3: Create a fixed per treatment compensation rule for assistant", async () => {
    const rule = await compRepo.createCompensationRule({
      staffId: "assistant-clary",
      name: "Uang Duduk Tindakan",
      ruleTypeSnapshot: "FIXED_PER_TREATMENT",
      valueSnapshot: 25000,
      isActive: true
    });

    expect(rule.ruleTypeSnapshot).toBe("FIXED_PER_TREATMENT");
    expect(rule.valueSnapshot).toBe(25000);
  });

  it("Test 4: Compensation accrual calculation rejects uncompleted treatment jobs", async () => {
    // treatment-job-2 is DALAM_PROSES
    await expect(
      compRepo.calculateAndAccrueForTreatment("treatment-job-2")
    ).rejects.toThrow("Akrual kompensasi hanya dapat dihitung untuk treatment yang sudah SELESAI atau DISERAHKAN");
  });

  it("Test 5: Calculate and accrue compensation for completed treatment (doctor percentage rule)", async () => {
    // Register 30% rule for drg. Andi
    await compRepo.createCompensationRule({
      staffId: "doc-syafira",
      name: "Komisi Perawatan Saluran Akar",
      ruleTypeSnapshot: "PERCENTAGE",
      valueSnapshot: 30, // 30% of 400,000 = 120,000
      isActive: true
    });

    // treatment-job-3 is SELESAI, service-root-canal base price is 400,000
    await createPaidInvoiceForTreatment("treatment-job-3");
    const testDb = MockDatabase.getInstance();
    expect(testDb.invoiceItems.some((item) => item.treatmentJobId === "treatment-job-3")).toBe(true);
    expect(testDb.invoices.some((invoice) => invoice.visitId === "visit-3" && invoice.status === "PAID")).toBe(true);
    const accruals = await compRepo.calculateAndAccrueForTreatment("treatment-job-3");
    expect(accruals.length).toBeGreaterThan(0);

    const docAccrual = accruals.find((a) => a.staffId === "doc-syafira");
    expect(docAccrual).toBeDefined();
    expect(docAccrual?.amount).toBe(120000);
    expect(docAccrual?.baseAmountSnapshot).toBe(400000);

    const repeatedAccruals = await compRepo.calculateAndAccrueForTreatment("treatment-job-3");
    expect(repeatedAccruals).toHaveLength(accruals.length);
  });

  it("Test 6: Calculate and accrue compensation for assistant assigned to completed treatment", async () => {
    // Complete treatment-job-1 (which has picAssistantId = "assistant-clary")
    await treatmentRepo.completeTreatmentJob("treatment-job-1");
    const unpaidAccruals = await compRepo.calculateAndAccrueForTreatment("treatment-job-1");
    expect(unpaidAccruals).toHaveLength(0);
    await createPaidInvoiceForTreatment("treatment-job-1");

    // rule-clary-scaling is 10% of 150,000 = 15,000
    const accruals = await compRepo.calculateAndAccrueForTreatment("treatment-job-1");
    const assistantAccrual = accruals.find((a) => a.staffId === "assistant-clary");
    expect(assistantAccrual).toBeDefined();
    expect(assistantAccrual?.amount).toBe(15000);
  });

  it("calculates sharing from service revenue after discount without including tax", async () => {
    const db = MockDatabase.getInstance();
    const treatment = db.treatmentJobs.find((job) => job.id === "treatment-job-1")!;
    await treatmentRepo.completeTreatmentJob(treatment.id);
    await createPaidInvoiceForTreatment(treatment.id);

    const invoice = db.invoices.find((candidate) => candidate.visitId === treatment.visitId)!;
    const targetItem = db.invoiceItems.find((item) => item.invoiceId === invoice.id && item.treatmentJobId === treatment.id)!;
    db.invoiceItems = db.invoiceItems.filter((item) => item.invoiceId !== invoice.id || item.id === targetItem.id);
    targetItem.amount = 150_000;
    targetItem.unitPriceSnapshot = 150_000;
    db.invoiceItems.push({
      id: "discount-allocation-extra-line",
      invoiceId: invoice.id,
      serviceId: treatment.serviceId,
      descriptionSnapshot: "Layanan lain",
      unitPriceSnapshot: 50_000,
      quantity: 1,
      amount: 50_000,
      createdAt: invoice.createdAt
    });
    invoice.totalAmount = 200_000;
    invoice.discountAmount = 20_000;
    invoice.taxAmount = 30_000;
    invoice.netAmount = 210_000;
    db.accruals = db.accruals.filter((accrual) => accrual.sourceId !== treatment.id);

    const accruals = await compRepo.calculateAndAccrueForTreatment(treatment.id);
    const assistantAccrual = accruals.find((accrual) => accrual.staffId === "assistant-clary");

    expect(assistantAccrual?.baseAmountSnapshot).toBe(135_000);
    expect(assistantAccrual?.amount).toBe(13_500);
  });

  it("uses the fixed doctor absence deduction and excludes doctor overtime from payroll", async () => {
    const db = MockDatabase.getInstance();
    const doctorAttendance = db.attendances.find((attendance) => attendance.staffId === "staff-doc-syafira")!;
    const absenceId = "test-doctor-absence";
    db.attendances.push({
      ...doctorAttendance,
      id: absenceId,
      date: "2026-09-11",
      attendanceStatus: AttendanceStatus.ABSENT
    });
    db.overtimes.push({
      id: "test-doctor-overtime",
      staffId: "staff-doc-syafira",
      branchId: "branch-gebang",
      attendanceId: absenceId,
      date: "2026-09-12",
      scheduledEndAt: "14:00",
      actualEndAt: "15:00",
      overtimeMinutes: 60,
      approvedOvertimeMinutes: 60,
      overtimeHours: 1,
      overtimeType: OvertimeType.AFTER_SHIFT,
      status: OvertimeStatus.APPROVED,
      hourlyRateSnapshot: 15_000,
      overtimeAmountSnapshot: 15_000,
      createdAt: "2026-09-12T15:00:00Z",
      updatedAt: "2026-09-12T15:00:00Z"
    });

    const payroll = await payrollRepo.generateMonthlyPayroll("staff-doc-syafira", 9, 2026, 2_500_000);
    const items = await payrollRepo.getPayrollItems(payroll.id);

    expect(items.find((item) => item.sourceId === absenceId)?.amountSnapshot).toBe(60_000);
    expect(items.some((item) => item.descriptionSnapshot.includes("Lembur Disetujui"))).toBe(false);
  });

  it("records one referral incentive per paid booking visit for its selected branch staff member", async () => {
    const db = MockDatabase.getInstance();
    const treatment = db.treatmentJobs.find((job) => job.id === "treatment-job-1")!;
    const patient = db.patients.find((candidate) => candidate.id === treatment.patientId)!;
    const visit = db.visits.find((candidate) => candidate.id === treatment.visitId)!;
    const booking = db.bookings.find((candidate) => candidate.id === visit.bookingId)!;
    const referringAdmin = db.staff.find((employee) => employee.id === "staff-adm-gebang")!;
    const referringAssistant = db.staff.find((employee) => employee.id === "staff-ast-clary")!;
    patient.referringStaffId = referringAdmin.id;
    booking.referringStaffId = referringAssistant.id;

    const secondBooking = {
      ...booking,
      id: "booking-referral-second",
      referringStaffId: referringAdmin.id
    };
    const secondVisit = {
      ...visit,
      id: "visit-referral-second",
      bookingId: secondBooking.id
    };
    const secondTreatment = {
      ...treatment,
      id: "treatment-referral-second",
      visitId: secondVisit.id,
      completedAt: undefined,
      status: TreatmentJobStatus.DALAM_PROSES
    };
    const sameVisitTreatment = {
      ...treatment,
      id: "treatment-referral-same-visit",
      completedAt: undefined
    };
    db.bookings.push(secondBooking);
    db.visits.push(secondVisit);
    db.treatmentJobs.push(secondTreatment);
    db.treatmentJobs.push(sameVisitTreatment);

    await treatmentRepo.completeTreatmentJob(treatment.id);

    expect(await compRepo.calculateAndAccrueForTreatment(treatment.id)).toHaveLength(0);
    await createPaidInvoiceForTreatment(treatment.id);
    await compRepo.calculateAndAccrueForTreatment(treatment.id);
    await compRepo.calculateAndAccrueForTreatment(treatment.id);
    await treatmentRepo.completeTreatmentJob(sameVisitTreatment.id);
    await createPaidInvoiceForTreatment(sameVisitTreatment.id);
    await compRepo.calculateAndAccrueForTreatment(sameVisitTreatment.id);
    await treatmentRepo.completeTreatmentJob(secondTreatment.id);
    await createPaidInvoiceForTreatment(secondTreatment.id);
    await compRepo.calculateAndAccrueForTreatment(secondTreatment.id);

    const referralAccruals = db.accruals.filter((accrual) =>
      accrual.ruleTypeSnapshot === "STAFF_VISIT_REFERRAL"
    );
    expect(referralAccruals).toHaveLength(2);
    expect(referralAccruals).toEqual(expect.arrayContaining([
      expect.objectContaining({
        staffId: referringAssistant.id,
        amount: 3000,
        sourceId: "referral:visit:visit-1"
      }),
      expect.objectContaining({
        staffId: referringAdmin.id,
        amount: 3000,
        sourceId: "referral:visit:visit-referral-second"
      })
    ]));
  });

  it("Test 7: Generate monthly payroll compiles base salary and accruals accurately", async () => {
    // Complete treatment-job-1 and accrue
    await treatmentRepo.completeTreatmentJob("treatment-job-1");
    await createPaidInvoiceForTreatment("treatment-job-1");
    await compRepo.calculateAndAccrueForTreatment("treatment-job-1");

    const payroll = await payrollRepo.generateMonthlyPayroll("assistant-clary", 9, 2026, 2500000);
    expect(payroll.staffId).toBe("assistant-clary");
    expect(payroll.month).toBe(9);
    expect(payroll.year).toBe(2026);
    expect(payroll.baseSalary).toBe(2500000);
    expect(payroll.totalCompensation).toBeGreaterThanOrEqual(15000);
    expect(payroll.netSalary).toBe(2500000 + payroll.totalCompensation);
    expect(payroll.status).toBe(PayrollStatus.DRAFT);

    const items = await payrollRepo.getPayrollItems(payroll.id);
    expect(items.length).toBeGreaterThanOrEqual(2);
    expect(items.some((i) => i.descriptionSnapshot.includes("Gaji Pokok"))).toBe(true);
    expect(items.some((i) => i.descriptionSnapshot.includes("Kompensasi"))).toBe(true);
  });

  it("deducts unpaid scheduled absence at base salary divided by 25 days without double-counting a date", async () => {
    const db = MockDatabase.getInstance();
    const attendance = {
      id: "absence-2026-09-10",
      staffId: "assistant-clary",
      branchId: "branch-gebang",
      date: "2026-09-10",
      attendanceStatus: AttendanceStatus.LEAVE,
      scheduledStartAt: "08:00",
      scheduledEndAt: "16:00",
      actualCheckInAt: null,
      actualCheckOutAt: null,
      lateMinutes: 0,
      earlyCheckoutMinutes: 0,
      createdAt: "2026-09-10T00:00:00Z",
      updatedAt: "2026-09-10T00:00:00Z"
    };
    db.attendances.push(
      attendance,
      { ...attendance, id: "duplicate-absence-record", attendanceStatus: AttendanceStatus.SICK }
    );

    const payroll = await payrollRepo.generateMonthlyPayroll("assistant-clary", 9, 2026, 2500000);
    const items = await payrollRepo.getPayrollItems(payroll.id);
    const absenceItems = items.filter((item) => item.type === "DEDUCTION");

    expect(absenceItems).toHaveLength(1);
    expect(absenceItems[0].amountSnapshot).toBe(100000);
    expect(payroll.totalDeductions).toBe(100000);
    expect(payroll.netSalary).toBe(2415000);
  });

  it("Test 7b: Doctor payroll generation resolves staff-linked IDs to the active salary rule", async () => {
    await compRepo.createCompensationRule({
      staffId: "doc-syafira",
      name: "Base Salary drg. Syafira",
      ruleTypeSnapshot: "BASE_SALARY",
      valueSnapshot: 4500000,
      isActive: true
    });

    const payroll = await payrollRepo.generateMonthlyPayroll("staff-doc-syafira", 9, 2026);
    expect(payroll.staffId).toBe("staff-doc-syafira");
    expect(payroll.baseSalary).toBe(4500000);
  });

  it("does not create an automatic payroll draft without an active base-salary rule", async () => {
    const db = MockDatabase.getInstance();
    db.rules = db.rules.filter((rule) => rule.staffId !== "staff-ast-clary");
    const payrollsBefore = await payrollRepo.getPayrolls(9, 2026);

    await expect(
      payrollRepo.generateMonthlyPayroll("staff-ast-clary", 9, 2026, undefined, true)
    ).rejects.toThrow("tidak ada aturan gaji pokok aktif");
    expect(await payrollRepo.getPayrolls(9, 2026)).toEqual(payrollsBefore);
  });

  it("preserves an existing draft during automatic payroll preparation", async () => {
    const original = await payrollRepo.generateMonthlyPayroll("staff-ast-clary", 9, 2026, 2500000);
    const originalItems = await payrollRepo.getPayrollItems(original.id);

    const preserved = await payrollRepo.generateMonthlyPayroll("staff-ast-clary", 9, 2026, undefined, true);

    expect(preserved).toEqual(original);
    expect(await payrollRepo.getPayrollItems(original.id)).toEqual(originalItems);
  });

  it("Test 8: Payroll status lifecycle updates properly", async () => {
    const db = MockDatabase.getInstance();
    db.overtimes.push({
      id: "paid-with-payroll-overtime",
      staffId: "assistant-clary",
      branchId: "branch-gebang",
      attendanceId: "paid-with-payroll-attendance",
      date: "2026-09-10",
      scheduledEndAt: "16:00",
      actualEndAt: "17:00",
      overtimeMinutes: 60,
      approvedOvertimeMinutes: 45,
      overtimeHours: 0.75,
      overtimeType: OvertimeType.AFTER_SHIFT,
      status: OvertimeStatus.APPROVED,
      overtimeAmountSnapshot: 11_250,
      createdAt: "2026-09-10T17:00:00Z",
      updatedAt: "2026-09-10T17:00:00Z"
    });
    const payroll = await payrollRepo.generateMonthlyPayroll("assistant-clary", 9, 2026);
    expect(payroll.status).toBe(PayrollStatus.DRAFT);

    const reviewed = await payrollRepo.updatePayrollStatus(payroll.id, PayrollStatus.REVIEW);
    expect(reviewed.status).toBe(PayrollStatus.REVIEW);

    const approved = await payrollRepo.updatePayrollStatus(payroll.id, PayrollStatus.APPROVED);
    expect(approved.status).toBe(PayrollStatus.APPROVED);

    const paid = await payrollRepo.updatePayrollStatus(payroll.id, PayrollStatus.PAID);
    expect(paid.status).toBe(PayrollStatus.PAID);
    expect(db.overtimes.find((overtime) => overtime.id === "paid-with-payroll-overtime")?.status)
      .toBe(OvertimeStatus.PAID);
  });

  it("Test 9: Configuration Repository manages Master Services and custom Branch Tariffs", async () => {
    const services = await configRepo.getServices();
    expect(services.length).toBeGreaterThan(0);

    const newService = await configRepo.createService({
      name: "Implan Gigi Premium",
      description: "Pemasangan implan titanium",
      basePrice: 8000000,
      estimatedDurationMinutes: 90,
      category: "Bedah Mulut",
      isActive: true
    });
    expect(newService.id).toBeDefined();

    // Set custom tariff for Branch Ambulu
    const customTariff = await configRepo.setBranchTariff("branch-ambulu", newService.id, 7500000);
    expect(customTariff.customPrice).toBe(7500000);
    expect(customTariff.branchId).toBe("branch-ambulu");

    const ambuluTariffs = await configRepo.getBranchTariffs("branch-ambulu");
    expect(ambuluTariffs.some((t) => t.serviceId === newService.id && t.customPrice === 7500000)).toBe(true);
  });

  it("Test 10: Update service base price and duration", async () => {
    const updated = await configRepo.updateService("service-scaling", {
      basePrice: 175000,
      estimatedDurationMinutes: 40
    });

    expect(updated.basePrice).toBe(175000);
    expect(updated.estimatedDurationMinutes).toBe(40);
  });
});
