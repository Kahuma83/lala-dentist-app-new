export function calculatePayrollTax(grossIncome: number, taxRatePercent: number): number {
  if (!Number.isFinite(grossIncome) || grossIncome < 0) {
    throw new Error("Penghasilan bruto untuk perhitungan pajak tidak valid.");
  }
  if (!Number.isFinite(taxRatePercent) || taxRatePercent < 0 || taxRatePercent > 100) {
    throw new Error("Persentase pajak harus berada di antara 0 dan 100.");
  }

  return Math.round(grossIncome * taxRatePercent / 100);
}
