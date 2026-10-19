import { MockDatabase } from "../../data/mockData";
import { MockInvoiceRepository, AppClock } from "../../repositories/mockRepositories";
import { InvoiceItem, InvoiceStatus, TreatmentJob } from "../../types/domain";

export async function createPaidInvoiceForTreatment(treatmentJobId: string): Promise<void> {
  const db = MockDatabase.getInstance();
  const treatment = db.treatmentJobs.find((job: TreatmentJob) => job.id === treatmentJobId);
  if (!treatment) throw new Error(`Treatment ${treatmentJobId} not found`);

  let invoice = db.invoices.find((candidate) =>
    candidate.visitId === treatment.visitId && candidate.status !== InvoiceStatus.CANCELLED
  );
  if (!invoice) {
    const service = db.services.find((candidate) => candidate.id === treatment.serviceId);
    if (!service) throw new Error(`Service ${treatment.serviceId} not found`);
    invoice = await new MockInvoiceRepository().createInvoice({
      visitId: treatment.visitId,
      patientId: treatment.patientId,
      branchId: treatment.branchId,
      items: [{
        serviceId: treatment.serviceId,
        treatmentJobId: treatment.id,
        descriptionSnapshot: treatment.serviceNameSnapshot,
        unitPriceSnapshot: service.basePrice,
        quantity: 1
      }]
    });
    invoice = db.invoices.find((candidate) => candidate.id === invoice?.id);
    if (!invoice) throw new Error(`Invoice for treatment ${treatmentJobId} was not persisted`);
  } else if (!db.invoiceItems.some((item: InvoiceItem) => item.treatmentJobId === treatment.id)) {
    const service = db.services.find((candidate) => candidate.id === treatment.serviceId);
    if (!service) throw new Error(`Service ${treatment.serviceId} not found`);
    const item: InvoiceItem = {
      id: `test-item-${treatment.id}`,
      invoiceId: invoice.id,
      serviceId: treatment.serviceId,
      treatmentJobId: treatment.id,
      descriptionSnapshot: treatment.serviceNameSnapshot,
      unitPriceSnapshot: service.basePrice,
      quantity: 1,
      amount: service.basePrice,
      createdAt: AppClock.nowISO()
    };
    db.invoiceItems.push(item);
    invoice.totalAmount += item.amount;
    invoice.netAmount = Math.max(0, invoice.totalAmount - invoice.discountAmount + invoice.taxAmount);
  }

  invoice.status = InvoiceStatus.PAID;
  invoice.paidAmount = invoice.netAmount;
  invoice.outstandingAmount = 0;
  invoice.updatedAt = treatment.completedAt || AppClock.nowISO();
}
