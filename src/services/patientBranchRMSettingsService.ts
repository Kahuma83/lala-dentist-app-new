import { supabase } from "../lib/supabase";
import { MockDatabase } from "../data/mockData";
import { getPatientMedicalRecordNumber } from "../utils/rmUtils";
import {
  LocalBranchRMFormat,
  getStoredBranchRMFormat,
  saveStoredBranchRMFormat
} from "../utils/branchRMSettings";
import { isLocalPatientDemoEnabled } from "../utils/localPatientDemo";

export type BranchRMSettings = {
  branchId: string;
  padDigits: number;
  nextNumber: string;
  highestNumber: string | null;
  previewRM: string;
};

function parseSettings(value: unknown): BranchRMSettings {
  if (!value || typeof value !== "object") {
    throw new Error("Data pengaturan RM cabang tidak valid.");
  }

  const row = value as Record<string, unknown>;
  if (
    typeof row.branch_id !== "string" ||
    typeof row.pad_digits !== "number" ||
    typeof row.next_number !== "string" ||
    (row.highest_number !== null && typeof row.highest_number !== "string") ||
    typeof row.preview_rm !== "string"
  ) {
    throw new Error("Data pengaturan RM cabang tidak lengkap.");
  }

  return {
    branchId: row.branch_id,
    padDigits: row.pad_digits,
    nextNumber: row.next_number,
    highestNumber: row.highest_number,
    previewRM: row.preview_rm
  };
}

export async function getBranchRMSettings(branchId: string): Promise<BranchRMSettings> {
  if (isLocalPatientDemoEnabled) {
    const patients = MockDatabase.getInstance().patients;
    const branchRecords = patients
      .map((patient) => getPatientMedicalRecordNumber(patient, branchId))
      .filter(Boolean)
      .map((medicalRecordNumber) => ({
        medicalRecordNumber,
        number: Number(medicalRecordNumber.match(/(\d+)$/)?.[1] || 0)
      }))
      .filter((record) => Number.isSafeInteger(record.number) && record.number > 0)
      .sort((left, right) => right.number - left.number);
    const highestRecord = branchRecords[0];
    const stored = getStoredBranchRMFormat(branchId);
    const detectedFormat = highestRecord?.medicalRecordNumber.match(/(\d+)$/);
    const detectedDigits = detectedFormat?.[1] || "";
    const padDigits = stored?.padDigits ?? (
      detectedDigits.length > 1 && detectedDigits.startsWith("0") ? detectedDigits.length : 0
    );
    const nextNumber = Math.max(stored?.nextNumber || 3000, (highestRecord?.number || 2999) + 1);
    const format: LocalBranchRMFormat = { padDigits, nextNumber };
    if (!stored) saveStoredBranchRMFormat(branchId, format);

    return {
      branchId,
      ...format,
      nextNumber: String(nextNumber),
      highestNumber: highestRecord?.number ? String(highestRecord.number) : null,
      previewRM: String(nextNumber).padStart(padDigits, "0")
    };
  }

  const { data, error } = await supabase.rpc("get_patient_branch_rm_settings", {
    target_branch_id: branchId
  });
  if (error) {
    throw new Error(`Gagal memuat pengaturan RM cabang: ${error.message}`);
  }
  return parseSettings(data);
}

export async function saveBranchRMSettings(
  branchId: string,
  settings: Pick<BranchRMSettings, "padDigits" | "nextNumber">
): Promise<BranchRMSettings> {
  if (isLocalPatientDemoEnabled) {
    const currentSettings = await getBranchRMSettings(branchId);
    const requestedNumber = Number(settings.nextNumber);
    if (!/^\d{1,18}$/.test(settings.nextNumber) || !Number.isSafeInteger(requestedNumber)) {
      throw new Error("Nomor berikutnya harus berupa angka 1 sampai 18 digit.");
    }
    if (!Number.isInteger(settings.padDigits) || settings.padDigits < 0 || settings.padDigits > 18) {
      throw new Error("Jumlah digit padding harus antara 0 sampai 18.");
    }
    if (currentSettings.highestNumber && requestedNumber <= Number(currentSettings.highestNumber)) {
      throw new Error(`Nomor berikutnya harus lebih besar dari No. RM tertinggi (${currentSettings.highestNumber}) di cabang ini.`);
    }

    saveStoredBranchRMFormat(branchId, {
      padDigits: settings.padDigits,
      nextNumber: requestedNumber
    });
    return getBranchRMSettings(branchId);
  }

  const { data, error } = await supabase.rpc("save_patient_branch_rm_settings", {
    target_branch_id: branchId,
    requested_prefix: "",
    requested_pad_digits: settings.padDigits,
    requested_next_number: settings.nextNumber
  });
  if (error) {
    throw new Error(`Gagal menyimpan pengaturan RM cabang: ${error.message}`);
  }
  return parseSettings(data);
}
