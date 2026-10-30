import { beforeEach, describe, expect, it } from "vitest";
import { MockDatabase } from "../data/mockData";
import {
  MockInvoiceRepository,
  MockTreatmentRepository,
  MockVisitRepository
} from "../repositories/mockRepositories";
import { TreatmentJobStatus, VisitType } from "../types/domain";

describe("Treatment plan invoice rules", () => {
  beforeEach(() => {
    MockDatabase.resetInstance();
  });

  it("waits for all plans to be closed and bills completed treatments only", async () => {
    const visitRepo = new MockVisitRepository();
    const treatmentRepo = new MockTreatmentRepository();
    const invoiceRepo = new MockInvoiceRepository();
    const database = MockDatabase.getInstance();
    const visit = await visitRepo.createVisit({
      patientId: "patient-1",
      branchId: "branch-gebang",
      visitType: VisitType.WALK_IN,
      bookingId: null,
      doctorId: "doc-syafira"
    });
    const completedPlan = await treatmentRepo.createTreatmentJob({
      visitId: visit.id,
      serviceId: "service-scaling",
      doctorId: "doc-syafira"
    });
    const alternateService = database.services.find(
      (service) => service.id !== completedPlan.serviceId && service.isActive
    );
    if (!alternateService) throw new Error("Fixture requires a second active treatment service");
    const cancelledPlan = await treatmentRepo.createTreatmentJob({
      visitId: visit.id,
      serviceId: alternateService.id,
      doctorId: "doc-syafira"
    });
    await treatmentRepo.startTreatmentJob(completedPlan.id);
    await treatmentRepo.completeTreatmentJob(completedPlan.id);

    const completedItem = {
      treatmentJobId: completedPlan.id,
      serviceId: completedPlan.serviceId,
      descriptionSnapshot: completedPlan.serviceNameSnapshot,
      unitPriceSnapshot: completedPlan.priceSnapshot || 0,
      quantity: 1
    };
    const invoiceInput = {
      visitId: visit.id,
      patientId: visit.patientId,
      branchId: visit.branchId,
      items: [completedItem]
    };

    await expect(invoiceRepo.createInvoice(invoiceInput)).rejects.toThrow(
      "semua rencana selesai atau dibatalkan"
    );

    await treatmentRepo.cancelTreatmentJob(cancelledPlan.id, "Pasien menunda tindakan");
    const invoice = await invoiceRepo.createInvoice(invoiceInput);
    const invoiceItems = await invoiceRepo.getInvoiceItems(invoice.id);

    expect(invoiceItems).toHaveLength(1);
    expect(invoiceItems[0]?.treatmentJobId).toBe(completedPlan.id);
    expect(MockDatabase.getInstance().treatmentJobs.find((job) => job.id === cancelledPlan.id)?.status)
      .toBe(TreatmentJobStatus.DIBATALKAN);

    await expect(invoiceRepo.createInvoice({
      ...invoiceInput,
      items: [{
        ...completedItem,
        treatmentJobId: cancelledPlan.id,
        serviceId: cancelledPlan.serviceId,
        descriptionSnapshot: cancelledPlan.serviceNameSnapshot
      }]
    })).rejects.toThrow("seluruh tindakan selesai");
  });
});
