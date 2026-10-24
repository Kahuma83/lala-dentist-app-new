import { MasterService, TreatmentJob } from "../types/domain";

export const getTreatmentInvoiceUnitPrice = (
  treatment: Pick<TreatmentJob, "priceSnapshot">,
  service: Pick<MasterService, "basePrice">
): number => treatment.priceSnapshot ?? service.basePrice;
