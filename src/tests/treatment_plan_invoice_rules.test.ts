import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MockDatabase } from "../data/mockData";
import {
  MockInvoiceRepository,
  MockTreatmentRepository,
  MockVisitRepository
} from "../repositories/mockRepositories";
import { InvoiceStatus, TreatmentJobStatus, UserRole, VisitType } from "../types/domain";
import { AppClock } from "../utils/clock";
import { getOperationalDateString, isValidCalendarDateString } from "../utils/dateUtils";

describe("Treatment plan invoice rules", () => {
  beforeEach(() => {
    MockDatabase.resetInstance();
    AppClock.reset();
  });

  afterEach(() => {
    AppClock.reset();
  });

  it("supports an authorized backdated invoice and rejects a date after treatment completion", async () => {
    const visitRepo = new MockVisitRepository();
    const treatmentRepo = new MockTreatmentRepository();
    const invoiceRepo = new MockInvoiceRepository();
    AppClock.setFixedTime("2027-02-04T05:00:00.000Z");
    const visit = await visitRepo.createVisit({
      patientId: "patient-1",
      branchId: "branch-gebang",
      visitType: VisitType.WALK_IN,
      bookingId: null,
      doctorId: "doc-syafira"
    });
    const treatment = await treatmentRepo.createTreatmentJob({
      visitId: visit.id,
      serviceId: "service-scaling",
      doctorId: "doc-syafira"
    });
    await treatmentRepo.startTreatmentJob(treatment.id);
    await treatmentRepo.completeTreatmentJob(treatment.id);
    AppClock.setFixedTime("2027-02-05T05:00:00.000Z");

    const invoiceInput = {
      visitId: visit.id,
      patientId: visit.patientId,
      branchId: visit.branchId,
      invoiceDate: "2027-02-03",
      items: [{
        treatmentJobId: treatment.id,
        serviceId: treatment.serviceId,
        descriptionSnapshot: treatment.serviceNameSnapshot,
        unitPriceSnapshot: treatment.priceSnapshot || 0,
        quantity: 1
      }]
    };
    await expect(invoiceRepo.createInvoice(invoiceInput, UserRole.OB))
      .rejects.toThrow("Hanya Super Admin dan Admin Cabang");
    const invoice = await invoiceRepo.createInvoice(invoiceInput, UserRole.SUPER_ADMIN);
    expect(invoice.invoiceDate).toBe("2027-02-03");

    await expect(invoiceRepo.createInvoice({
      ...invoiceInput,
      invoiceDate: "2027-02-05"
    }, UserRole.SUPER_ADMIN)).rejects.toThrow("setelah tanggal tindakan terakhir selesai");
    await expect(invoiceRepo.createInvoice({
      ...invoiceInput,
      invoiceDate: "2027-02-06"
    }, UserRole.SUPER_ADMIN)).rejects.toThrow("melebihi tanggal hari ini");
  });

  it("validates real calendar dates and resolves treatment timestamps in WIB", () => {
    expect(isValidCalendarDateString("2027-02-28")).toBe(true);
    expect(isValidCalendarDateString("2027-02-30")).toBe(false);
    expect(getOperationalDateString("2027-02-03T18:00:00.000Z")).toBe("2027-02-04");
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
    })).rejects.toThrow("sudah memiliki invoice aktif");
  });

  it("allows cancellation of an unbilled legacy plan after a different treatment was invoiced", async () => {
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
    const billedTreatment = await treatmentRepo.createTreatmentJob({
      visitId: visit.id,
      serviceId: "service-scaling",
      doctorId: "doc-syafira"
    });
    const alternateService = database.services.find(
      (service) => service.id !== billedTreatment.serviceId && service.isActive
    );
    if (!alternateService) throw new Error("Fixture requires a second active treatment service");
    const unbilledTreatment = await treatmentRepo.createTreatmentJob({
      visitId: visit.id,
      serviceId: alternateService.id,
      doctorId: "doc-syafira"
    });
    await treatmentRepo.startTreatmentJob(billedTreatment.id);
    await treatmentRepo.completeTreatmentJob(billedTreatment.id);
    await treatmentRepo.cancelTreatmentJob(unbilledTreatment.id, "Pasien menunda tindakan");

    const invoice = await invoiceRepo.createInvoice({
      visitId: visit.id,
      patientId: visit.patientId,
      branchId: visit.branchId,
      items: [{
        treatmentJobId: billedTreatment.id,
        serviceId: billedTreatment.serviceId,
        descriptionSnapshot: billedTreatment.serviceNameSnapshot,
        unitPriceSnapshot: billedTreatment.priceSnapshot || 0,
        quantity: 1
      }]
    });
    const invoiceRecord = database.invoices.find((item) => item.id === invoice.id);
    if (!invoiceRecord) throw new Error("Fixture invoice was not saved");
    invoiceRecord.status = InvoiceStatus.PAID;
    invoiceRecord.paidAmount = invoiceRecord.netAmount;
    invoiceRecord.outstandingAmount = 0;

    const legacyUnbilledTreatment = database.treatmentJobs.find((item) => item.id === unbilledTreatment.id);
    if (!legacyUnbilledTreatment) throw new Error("Fixture treatment was not saved");
    legacyUnbilledTreatment.status = TreatmentJobStatus.BELUM_DIMULAI;
    legacyUnbilledTreatment.cancelledAt = undefined;
    legacyUnbilledTreatment.cancelledBy = undefined;
    legacyUnbilledTreatment.cancellationReason = undefined;

    const cancelled = await treatmentRepo.cancelTreatmentJob(
      unbilledTreatment.id,
      "Rencana ini tidak jadi dilakukan",
      UserRole.DOCTOR,
      "branch-gebang",
      "doc-syafira"
    );

    expect(cancelled.status).toBe(TreatmentJobStatus.DIBATALKAN);
    expect(invoiceRecord.status).toBe(InvoiceStatus.PAID);
    expect((await invoiceRepo.getInvoiceItems(invoice.id)).map((item) => item.treatmentJobId))
      .toEqual([billedTreatment.id]);
  });

  it("keeps cancellation blocked when an active legacy invoice has unlinked items", async () => {
    const visitRepo = new MockVisitRepository();
    const treatmentRepo = new MockTreatmentRepository();
    const invoiceRepo = new MockInvoiceRepository();
    const visit = await visitRepo.createVisit({
      patientId: "patient-1",
      branchId: "branch-gebang",
      visitType: VisitType.WALK_IN,
      bookingId: null,
      doctorId: "doc-syafira"
    });
    const treatment = await treatmentRepo.createTreatmentJob({
      visitId: visit.id,
      serviceId: "service-scaling",
      doctorId: "doc-syafira"
    });
    await invoiceRepo.createInvoice({
      visitId: visit.id,
      patientId: visit.patientId,
      branchId: visit.branchId,
      items: [{
        serviceId: treatment.serviceId,
        descriptionSnapshot: treatment.serviceNameSnapshot,
        unitPriceSnapshot: treatment.priceSnapshot || 0,
        quantity: 1
      }]
    });

    await expect(treatmentRepo.cancelTreatmentJob(
      treatment.id,
      "Rencana ini tidak jadi dilakukan",
      UserRole.DOCTOR,
      "branch-gebang",
      "doc-syafira"
    )).rejects.toThrow("setelah invoice diterbitkan");
  });

  it("does not allow adding a treatment to a visit that already has an active invoice", async () => {
    const visitRepo = new MockVisitRepository();
    const treatmentRepo = new MockTreatmentRepository();
    const invoiceRepo = new MockInvoiceRepository();
    const visit = await visitRepo.createVisit({
      patientId: "patient-1",
      branchId: "branch-gebang",
      visitType: VisitType.WALK_IN,
      bookingId: null,
      doctorId: "doc-syafira"
    });
    const completedTreatment = await treatmentRepo.createTreatmentJob({
      visitId: visit.id,
      serviceId: "service-scaling",
      doctorId: "doc-syafira"
    });
    await treatmentRepo.startTreatmentJob(completedTreatment.id);
    await treatmentRepo.completeTreatmentJob(completedTreatment.id);
    await invoiceRepo.createInvoice({
      visitId: visit.id,
      patientId: visit.patientId,
      branchId: visit.branchId,
      items: [{
        treatmentJobId: completedTreatment.id,
        serviceId: completedTreatment.serviceId,
        descriptionSnapshot: completedTreatment.serviceNameSnapshot,
        unitPriceSnapshot: completedTreatment.priceSnapshot || 0,
        quantity: 1
      }]
    });

    await expect(treatmentRepo.createTreatmentJob({
      visitId: visit.id,
      serviceId: "service-bracket-control-single",
      doctorId: "doc-syafira"
    })).rejects.toThrow("sudah memiliki invoice aktif");
  });
});
