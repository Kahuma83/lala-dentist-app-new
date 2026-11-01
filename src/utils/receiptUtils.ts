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
  const savedDoctorName = treatment?.doctorNameSnapshot?.trim();
  if (!treatment?.doctorId) return savedDoctorName || undefined;
  const doctor = doctors.find((item) => item.id === treatment.doctorId);
  if (
    doctor?.fullName?.trim()
    && savedDoctorName
    && savedDoctorName === doctor.name?.trim()
  ) {
    return doctor.fullName.trim();
  }
  if (savedDoctorName) return savedDoctorName;
  return doctor?.fullName?.trim() || doctor?.name?.trim() || undefined;
}
