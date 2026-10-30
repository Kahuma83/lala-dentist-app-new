import { beforeEach, describe, expect, it } from "vitest";
import { MockDatabase } from "../data/mockData";
import {
  MockCompensationRepository,
  MockInvoiceRepository,
  MockPaymentRepository,
  MockTreatmentRepository,
  AppClock
} from "../repositories/mockRepositories";
import { PaymentMethod } from "../types/domain";
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

    expect(await accrueCompensationForPaidInvoice(invoice.id, invoiceRepo, compRepo)).toBe(0);
    await paymentRepo.createPayment({
      invoiceId: invoice.id,
      amount: invoice.netAmount,
      paymentMethod: PaymentMethod.CASH,
      staffId: "staff-adm-gebang"
    });

    expect(await accrueCompensationForPaidInvoice(invoice.id, invoiceRepo, compRepo)).toBeGreaterThan(0);
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

    expect(await accrueCompensationForPaidInvoice(invoice.id, invoiceRepo, compRepo)).toBeGreaterThan(0);
  });
});
