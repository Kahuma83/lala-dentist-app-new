export function getDoctorShareBaseAmount(
  treatmentAmount: number,
  requiresLab: boolean,
  labInvoiceAmount?: number | null
): number | null {
  if (!Number.isSafeInteger(treatmentAmount) || treatmentAmount < 0) {
    throw new Error("Nilai tindakan harus berupa rupiah bulat yang tidak negatif.");
  }
  if (!requiresLab) return treatmentAmount;
  if (labInvoiceAmount == null || !Number.isSafeInteger(labInvoiceAmount) || labInvoiceAmount <= 0) return null;
  return Math.max(0, treatmentAmount - labInvoiceAmount);
}
