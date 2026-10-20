const ICD10_WHO_CODE_PATTERN = /^[A-Z][0-9][A-Z0-9](?:\.?[A-Z0-9]{1,4})?$/;
const ICD9_CM_PROCEDURE_CODE_PATTERN = /^\d{2}(?:\.\d{1,2})?$/;

export function normalizeIcd10WhoCode(value: string): string | undefined {
  const code = value.trim().toUpperCase();
  if (!code) return undefined;
  if (!ICD10_WHO_CODE_PATTERN.test(code)) {
    throw new Error("Format kode diagnosis ICD-10 tidak sesuai. Periksa kembali kode yang dimasukkan.");
  }
  return code;
}

export function parseIcd9CmProcedureCodes(value: string): string[] {
  const codes = [...new Set(
    value
      .split(/[\n,;]+/)
      .map((code) => code.trim().toUpperCase())
      .filter(Boolean)
  )];
  if (codes.some((code) => !ICD9_CM_PROCEDURE_CODE_PATTERN.test(code))) {
    throw new Error("Setiap kode prosedur ICD-9-CM harus berformat angka seperti 23.09. Pastikan kode diverifikasi dokter.");
  }
  return codes;
}
