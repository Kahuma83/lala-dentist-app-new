import { PatientProfile } from "../types/domain";
import { extractNumberFromRM, formatRMNumber, getPatientMedicalRecordNumber } from "./rmUtils";

export type LocalBranchRMFormat = {
  padDigits: number;
  nextNumber: number;
};

const STORAGE_KEY = "lala_branch_rm_settings_v1";

function readAllSettings(): Record<string, LocalBranchRMFormat> {
  if (typeof window === "undefined" || !window.localStorage) return {};
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return {};

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Format penyimpanan pengaturan RM lokal tidak valid.");
    }
    return parsed as Record<string, LocalBranchRMFormat>;
  } catch (error) {
    console.warn("Pengaturan RM lokal tidak dapat dibaca:", error);
    return {};
  }
}

export function getStoredBranchRMFormat(branchId: string): LocalBranchRMFormat | null {
  const value = readAllSettings()[branchId];
  if (
    !value ||
    typeof value.padDigits !== "number" ||
    typeof value.nextNumber !== "number" ||
    !Number.isSafeInteger(value.nextNumber) ||
    value.nextNumber < 1
  ) {
    return null;
  }
  return value;
}

export function saveStoredBranchRMFormat(branchId: string, value: LocalBranchRMFormat): void {
  if (typeof window === "undefined" || !window.localStorage) {
    throw new Error("Penyimpanan lokal tidak tersedia di perangkat ini.");
  }
  const allSettings = readAllSettings();
  allSettings[branchId] = value;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(allSettings));
  } catch (error) {
    throw new Error(`Pengaturan RM lokal tidak dapat disimpan: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function getNextStoredBranchRM(
  branchId: string,
  patients: PatientProfile[]
): string | null {
  const format = getStoredBranchRMFormat(branchId);
  if (!format) return null;

  const highestNumber = patients.reduce((highest, patient) => {
    const rm = getPatientMedicalRecordNumber(patient, branchId);
    return Math.max(highest, extractNumberFromRM(rm) || 0);
  }, 0);

  return formatRMNumber(
    Math.max(format.nextNumber, highestNumber + 1),
    { prefix: "", padDigits: format.padDigits }
  );
}

export function advanceStoredBranchRM(branchId: string, assignedRM: string): void {
  const format = getStoredBranchRMFormat(branchId);
  const assignedNumber = extractNumberFromRM(assignedRM);
  if (!format || assignedNumber === null || assignedNumber < format.nextNumber) return;

  saveStoredBranchRMFormat(branchId, {
    ...format,
    nextNumber: assignedNumber + 1
  });
}
