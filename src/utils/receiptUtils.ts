import { DentalDoctor, Invoice, PaymentTransaction, TreatmentJob } from "../types/domain";

export interface ReceiptInvoiceSnapshot {
  netAmount: number;
  paidAmount: number;
  outstandingAmount: number;
}

export function getReceiptInvoiceSnapshot(
  payment: Pick<
    PaymentTransaction,
    "invoiceNetAmountSnapshot" | "invoicePaidAmountSnapshot" | "invoiceOutstandingAmountSnapshot"
  >
): ReceiptInvoiceSnapshot | null {
  const { invoiceNetAmountSnapshot, invoicePaidAmountSnapshot, invoiceOutstandingAmountSnapshot } = payment;
  if (
    typeof invoiceNetAmountSnapshot !== "number"
    || typeof invoicePaidAmountSnapshot !== "number"
    || typeof invoiceOutstandingAmountSnapshot !== "number"
    || !Number.isSafeInteger(invoiceNetAmountSnapshot)
    || !Number.isSafeInteger(invoicePaidAmountSnapshot)
    || !Number.isSafeInteger(invoiceOutstandingAmountSnapshot)
    || invoiceNetAmountSnapshot < 0
    || invoicePaidAmountSnapshot < 0
    || invoiceOutstandingAmountSnapshot < 0
    || invoicePaidAmountSnapshot > invoiceNetAmountSnapshot
    || invoiceNetAmountSnapshot - invoicePaidAmountSnapshot !== invoiceOutstandingAmountSnapshot
  ) {
    return null;
  }

  return {
    netAmount: invoiceNetAmountSnapshot,
    paidAmount: invoicePaidAmountSnapshot,
    outstandingAmount: invoiceOutstandingAmountSnapshot
  };
}

export function getInvoiceDoctorName(
  invoice: Invoice | null | undefined,
  treatments: TreatmentJob[],
  doctors: DentalDoctor[]
): string | undefined {
  if (!invoice) return undefined;
  const treatment = treatments.find((item) => item.visitId === invoice.visitId);
  if (treatment?.doctorNameSnapshot) return treatment.doctorNameSnapshot;
  if (!treatment?.doctorId) return undefined;
  const doctor = doctors.find((item) => item.id === treatment.doctorId);
  return doctor?.name || doctor?.fullName || undefined;
}
