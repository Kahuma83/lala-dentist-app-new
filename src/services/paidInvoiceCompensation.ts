import { CompensationRepository, InvoiceRepository } from "../repositories/interfaces";
import { UserRole, InvoiceStatus } from "../types/domain";

export async function accrueCompensationForPaidInvoice(
  invoiceId: string,
  invoiceRepo: InvoiceRepository,
  compRepo: CompensationRepository,
  currentUserRole?: UserRole,
  userBranchId?: string | null
): Promise<number> {
  const invoice = await invoiceRepo.getInvoiceById(invoiceId, currentUserRole, userBranchId);
  if (!invoice || invoice.status !== InvoiceStatus.PAID) return 0;

  const items = await invoiceRepo.getInvoiceItems(invoiceId);
  const treatmentJobIds = new Set(
    items.map((item) => item.treatmentJobId).filter((id): id is string => Boolean(id))
  );
  let accruedCount = 0;
  for (const treatmentJobId of treatmentJobIds) {
    accruedCount += (await compRepo.calculateAndAccrueForTreatment(treatmentJobId)).length;
  }
  return accruedCount;
}
