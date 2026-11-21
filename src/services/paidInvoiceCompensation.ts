import { CompensationRepository, InvoiceRepository, TreatmentRepository } from "../repositories/interfaces";
import { UserRole, InvoiceStatus, TreatmentJobStatus } from "../types/domain";

export async function accrueCompensationForPaidInvoice(
  invoiceId: string,
  invoiceRepo: InvoiceRepository,
  compRepo: CompensationRepository,
  treatmentRepo: TreatmentRepository,
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
    const treatment = await treatmentRepo.getTreatmentById(
      treatmentJobId,
      currentUserRole,
      userBranchId
    );
    if (!treatment) {
      throw new Error(`Tindakan ${treatmentJobId} pada invoice tidak ditemukan.`);
    }
    if (treatment.status !== TreatmentJobStatus.SELESAI
      && treatment.status !== TreatmentJobStatus.DISERAHKAN) {
      continue;
    }
    accruedCount += (await compRepo.calculateAndAccrueForTreatment(treatmentJobId)).length;
  }
  return accruedCount;
}
