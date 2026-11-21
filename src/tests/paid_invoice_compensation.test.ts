import { beforeEach, describe, expect, it } from "vitest";
import { MockDatabase } from "../data/mockData";
import {
  MockCompensationRepository,
  MockInvoiceRepository,
  MockLabRepository,
  MockPaymentRepository,
  MockTreatmentRepository,
  MockVisitRepository,
  AppClock
} from "../repositories/mockRepositories";
import { InvoiceStatus, PaymentMethod, TreatmentJobStatus, UserRole, VisitType } from "../types/domain";
import { accrueCompensationForPaidInvoice } from "../services/paidInvoiceCompensation";

describe("Automatic compensation for paid invoices", () => {
  beforeEach(() => {
    MockDatabase.resetInstance();
    AppClock.reset();
  });

  it("accrues compensation when a later payment settles a completed treatment invoice", async () => {
    const invoiceRepo = new MockInvoiceRepository();
    const paymentRepo = new MockPaymentRepository();
    const compRepo = new MockCompensationRepository();
    const treatment = MockDatabase.getInstance().treatmentJobs.find((job) => job.id === "treatment-job-1")!;
    treatment.visitId = "visit-compensation-test";
    const treatmentRepo = new MockTreatmentRepository();
    await treatmentRepo.completeTreatmentJob(treatment.id);

    const invoice = await invoiceRepo.createInvoice({
      visitId: treatment.visitId,
      patientId: treatment.patientId,
      branchId: treatment.branchId,
      items: [{
        treatmentJobId: treatment.id,
        serviceId: treatment.serviceId,
        descriptionSnapshot: treatment.serviceNameSnapshot,
        unitPriceSnapshot: 150_000,
        quantity: 1
      }]
    });

    expect(await accrueCompensationForPaidInvoice(invoice.id, invoiceRepo, compRepo, treatmentRepo)).toBe(0);
    await paymentRepo.createPayment({
      invoiceId: invoice.id,
      amount: invoice.netAmount,
      paymentMethod: PaymentMethod.CASH,
      staffId: "staff-adm-gebang"
    });

    expect(await accrueCompensationForPaidInvoice(invoice.id, invoiceRepo, compRepo, treatmentRepo)).toBeGreaterThan(0);
    expect(await compRepo.calculateAndAccrueForTreatment(treatment.id)).toHaveLength(1);
  });

  it("handles zero-balance invoices that are already marked paid", async () => {
    const invoiceRepo = new MockInvoiceRepository();
    const compRepo = new MockCompensationRepository();
    const treatment = MockDatabase.getInstance().treatmentJobs.find((job) => job.id === "treatment-job-1")!;
    treatment.visitId = "visit-compensation-test";
    const treatmentRepo = new MockTreatmentRepository();
    await treatmentRepo.completeTreatmentJob(treatment.id);
    const invoice = await invoiceRepo.createInvoice({
      visitId: treatment.visitId,
      patientId: treatment.patientId,
      branchId: treatment.branchId,
      items: [{
        treatmentJobId: treatment.id,
        serviceId: treatment.serviceId,
        descriptionSnapshot: treatment.serviceNameSnapshot,
        unitPriceSnapshot: 0,
        quantity: 1
      }]
    });

    expect(await accrueCompensationForPaidInvoice(invoice.id, invoiceRepo, compRepo, treatmentRepo)).toBeGreaterThan(0);
  });

  it("allows a lab-pending treatment invoice and defers compensation until lab completion", async () => {
    const visitRepo = new MockVisitRepository();
    const treatmentRepo = new MockTreatmentRepository();
    const invoiceRepo = new MockInvoiceRepository();
    const paymentRepo = new MockPaymentRepository();
    const labRepo = new MockLabRepository();
    const compRepo = new MockCompensationRepository();
    const visit = await visitRepo.createVisit({
      patientId: "patient-1",
      branchId: "branch-gebang",
      visitType: VisitType.WALK_IN,
      bookingId: null,
      doctorId: "doc-syafira"
    });
    const treatment = await treatmentRepo.createTreatmentJob({
      visitId: visit.id,
      serviceId: "service-gipal-insertion",
      doctorId: "doc-syafira"
    });
    MockDatabase.getInstance().rules.push({
      id: "rule-test-doctor-lab-share",
      staffId: "doc-syafira",
      name: "Tes share dokter gigi tiruan",
      ruleTypeSnapshot: "PERCENTAGE",
      valueSnapshot: 40,
      isActive: true,
      serviceId: treatment.serviceId,
      createdAt: AppClock.nowISO(),
      updatedAt: AppClock.nowISO()
    });
    await treatmentRepo.startTreatmentJob(treatment.id);
    const labOrder = await labRepo.createLabOrder({
      treatmentJobId: treatment.id,
      branchId: visit.branchId,
      labName: "Lab Gigi"
    });
    await treatmentRepo.markTreatmentWaitingForLab(
      treatment.id,
      UserRole.DOCTOR,
      visit.branchId,
      "doc-syafira"
    );

    const invoice = await invoiceRepo.createInvoice({
      visitId: visit.id,
      patientId: visit.patientId,
      branchId: visit.branchId,
      items: [{
        treatmentJobId: treatment.id,
        serviceId: treatment.serviceId,
        descriptionSnapshot: treatment.serviceNameSnapshot,
        unitPriceSnapshot: 150_000,
        quantity: 1
      }]
    });
    expect(invoice.status).toBe(InvoiceStatus.OPEN);
    expect((await invoiceRepo.getInvoiceItems(invoice.id))[0]?.treatmentJobId).toBe(treatment.id);

    await paymentRepo.createPayment({
      invoiceId: invoice.id,
      amount: 50_000,
      paymentMethod: PaymentMethod.CASH,
      staffId: "staff-adm-gebang"
    });
    expect(await accrueCompensationForPaidInvoice(invoice.id, invoiceRepo, compRepo, treatmentRepo)).toBe(0);

    await paymentRepo.createPayment({
      invoiceId: invoice.id,
      amount: 100_000,
      paymentMethod: PaymentMethod.CASH,
      staffId: "staff-adm-gebang"
    });
    expect(await accrueCompensationForPaidInvoice(invoice.id, invoiceRepo, compRepo, treatmentRepo)).toBe(0);

    await labRepo.updateLabOrder(labOrder.id, {
      status: "RECEIVED",
      invoiceReceivedAt: AppClock.nowISO(),
      invoiceNumber: "LAB-TEST-1",
      invoiceDate: AppClock.todayDateString(),
      invoiceAmount: 20_000
    });
    const completedTreatment = await treatmentRepo.completeTreatmentJob(
      treatment.id,
      UserRole.DOCTOR,
      visit.branchId,
      "doc-syafira",
      undefined,
      { finalPriceSnapshot: 150_000, patientApprovalConfirmed: true }
    );
    expect(completedTreatment.status).toBe(TreatmentJobStatus.SELESAI);
    expect(await accrueCompensationForPaidInvoice(invoice.id, invoiceRepo, compRepo, treatmentRepo)).toBeGreaterThan(0);
    const doctorAccrual = MockDatabase.getInstance().accruals.find(
      (accrual) => accrual.ruleIdSnapshot === "rule-test-doctor-lab-share"
    );
    expect(doctorAccrual?.baseAmountSnapshot).toBe(130_000);
    expect(doctorAccrual?.amount).toBe(52_000);
  });
});
