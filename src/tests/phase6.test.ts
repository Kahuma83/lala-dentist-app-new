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
  PayrollStatus,
  TreatmentJobStatus,
  UserRole
} from "../types/domain";

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
    const accruals = await compRepo.calculateAndAccrueForTreatment("treatment-job-3");
    expect(accruals.length).toBeGreaterThan(0);

    const docAccrual = accruals.find((a) => a.staffId === "doc-syafira");
    expect(docAccrual).toBeDefined();
    expect(docAccrual?.amount).toBe(120000);
    expect(docAccrual?.baseAmountSnapshot).toBe(400000);
  });

  it("Test 6: Calculate and accrue compensation for assistant assigned to completed treatment", async () => {
    // Complete treatment-job-1 (which has picAssistantId = "assistant-clary")
    await treatmentRepo.completeTreatmentJob("treatment-job-1");

    // rule-clary-scaling is 10% of 150,000 = 15,000
    const accruals = await compRepo.calculateAndAccrueForTreatment("treatment-job-1");
    const assistantAccrual = accruals.find((a) => a.staffId === "assistant-clary");
    expect(assistantAccrual).toBeDefined();
    expect(assistantAccrual?.amount).toBe(15000);
  });

  it("Test 7: Generate monthly payroll compiles base salary and accruals accurately", async () => {
    // Complete treatment-job-1 and accrue
    await treatmentRepo.completeTreatmentJob("treatment-job-1");
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
    expect(items.some((i) => i.descriptionSnapshot.includes("Komisi"))).toBe(true);
  });

  it("Test 8: Payroll status lifecycle updates properly", async () => {
    const payroll = await payrollRepo.generateMonthlyPayroll("assistant-clary", 9, 2026);
    expect(payroll.status).toBe(PayrollStatus.DRAFT);

    const reviewed = await payrollRepo.updatePayrollStatus(payroll.id, PayrollStatus.REVIEW);
    expect(reviewed.status).toBe(PayrollStatus.REVIEW);

    const approved = await payrollRepo.updatePayrollStatus(payroll.id, PayrollStatus.APPROVED);
    expect(approved.status).toBe(PayrollStatus.APPROVED);

    const paid = await payrollRepo.updatePayrollStatus(payroll.id, PayrollStatus.PAID);
    expect(paid.status).toBe(PayrollStatus.PAID);
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
