import * as XLSX from "xlsx";
import {
  PatientProfile,
  PatientVisit,
  UserRole,
  VisitStatus,
  VisitType
} from "../types/domain";
import { PatientRepository, VisitRepository } from "../repositories/interfaces";
import { getPatientMedicalRecordNumber } from "./rmUtils";

export interface LegacyPatientProfileRow {
  rowNumber: number;
  medicalRecordNumber: string;
  name: string;
  dateOfBirth: string;
  gender: "L" | "P" | "";
  phone: string;
  address: string;
  identityDocumentNumber: string;
  isValid: boolean;
  existingPatientId?: string;
  matchMethod?: "branch_rm" | "identity_document";
  matchingConflict?: boolean;
  errors: string[];
  warnings: string[];
}

export interface LegacyPatientVisitRow {
  rowNumber: number;
  medicalRecordNumber: string;
  visitDateTime: string;
  historicalDetails: string;
  isValid: boolean;
  patientId?: string;
  errors: string[];
}

export interface LegacyPatientHistoryImportPreview {
  sourceDigest: string;
  profileRows: LegacyPatientProfileRow[];
  visitRows: LegacyPatientVisitRow[];
  ignoredSheets: string[];
  blockingReviewIssues: string[];
  reviewWarnings: string[];
}

export interface LegacyPatientHistoryImportResult {
  profilesCreated: number;
  profilesAlreadyPresent: number;
  visitsCreated: number;
  visitsAlreadyImported: number;
  profilesFailed: number;
  visitsFailed: number;
  errors: string[];
}

const normalizeHeader = (value: unknown): string =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const normalizeMedicalRecordNumber = (value: unknown): string =>
  String(value ?? "").trim().replace(/\s+/g, "").toLocaleUpperCase("id-ID");

const cellText = (value: unknown): string => String(value ?? "").trim();

const findColumn = (rows: Record<string, unknown>[], aliases: string[]): string | undefined => {
  const keys = Object.keys(rows[0] || {});
  const normalizedAliases = aliases.map(normalizeHeader);
  return keys.find((key) => normalizedAliases.includes(normalizeHeader(key))) ??
    keys.find((key) => normalizedAliases.some((alias) => normalizeHeader(key).includes(alias)));
};

function parseLegacyDate(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return "";
    return validateDateParts(parsed.y, parsed.m, parsed.d);
  }

  const text = cellText(value);
  if (!text) return "";

  const isoMatch = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (isoMatch) {
    return validateDateParts(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
  }

  const localMatch = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (localMatch) {
    return validateDateParts(Number(localMatch[3]), Number(localMatch[2]), Number(localMatch[1]));
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function validateDateParts(year: number, month: number, day: number): string {
  if (!Number.isInteger(year) || year < 1900 || year > 9999) return "";
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return "";
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function normalizeLegacyGender(value: unknown): "L" | "P" | "" {
  const gender = normalizeHeader(value);
  if (gender === "l" || gender.includes("lakilaki") || gender === "pria") return "L";
  if (gender === "p" || gender.includes("perempuan") || gender === "wanita") return "P";
  return "";
}

async function getDataSheetDigest(rows: Record<string, unknown>[]): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Browser tidak mendukung pemeriksaan keamanan file untuk impor riwayat.");
  }
  const dataBytes = new TextEncoder().encode(JSON.stringify(rows));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", dataBytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function createStableVisitId(sourceDigest: string, rowNumber: number): Promise<string> {
  const input = new TextEncoder().encode(`${sourceDigest}:Data:${rowNumber}`);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", input);
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32)
    .split("");
  hex[12] = "5";
  hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const value = hex.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function sheetRows(workbook: XLSX.WorkBook, desiredName: string): Record<string, unknown>[] {
  const sheetName = workbook.SheetNames.find(
    (name) => normalizeHeader(name) === normalizeHeader(desiredName)
  );
  if (!sheetName) {
    throw new Error(`Lembar "${desiredName}" tidak ditemukan di file Excel.`);
  }
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], {
    defval: "",
    raw: true
  });
  if (rows.length === 0) {
    throw new Error(`Lembar "${desiredName}" tidak memiliki data.`);
  }
  return rows;
}

function uniqueProfileRowsFromData(
  rows: Record<string, unknown>[]
): Array<{ source: Record<string, unknown>; rowNumber: number }> {
  const rmColumn = findColumn(rows, ["NO RM", "NOMOR RM", "NOMOR REKAM MEDIS"]);
  if (!rmColumn) return [];

  const profilesByRm = new Map<string, { source: Record<string, unknown>; rowNumber: number }>();
  rows.forEach((source, index) => {
    const rm = normalizeMedicalRecordNumber(source[rmColumn]);
    if (!rm) return;

    const existing = profilesByRm.get(rm);
    if (!existing) {
      profilesByRm.set(rm, { source: { ...source }, rowNumber: index + 2 });
      return;
    }

    Object.keys(source).forEach((key) => {
      if (!cellText(existing.source[key]) && cellText(source[key])) {
        existing.source[key] = source[key];
      }
    });
  });

  return Array.from(profilesByRm.values());
}

export async function parseLegacyPatientHistoryWorkbook(
  file: File,
  existingPatients: PatientProfile[],
  branchId?: string
): Promise<LegacyPatientHistoryImportPreview> {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: "array", cellDates: false });
  const visitSourceRows = sheetRows(workbook, "Data");
  const sourceDigest = await getDataSheetDigest(visitSourceRows);
  const profileSourceRows = uniqueProfileRowsFromData(visitSourceRows);
  const existingByRm = new Map<string, PatientProfile>();
  const sameRmInOtherBranch = new Set<string>();
  existingPatients.forEach((patient) => {
    const localRm = branchId
      ? getPatientMedicalRecordNumber(patient, branchId)
      : patient.medicalRecordNumber;
    const rm = normalizeMedicalRecordNumber(localRm);
    if (rm) existingByRm.set(rm, patient);

    if (branchId) {
      patient.branchMedicalRecordNumbers
        ?.filter((record) => record.branchId !== branchId)
        .forEach((record) => {
          const otherRm = normalizeMedicalRecordNumber(record.medicalRecordNumber);
          if (otherRm) sameRmInOtherBranch.add(otherRm);
        });
      const registeredBranchId =
        patient.registeredBranchId ||
        patient.branch_id ||
        patient.assignedBranchId ||
        patient.branchId;
      const legacyRm = normalizeMedicalRecordNumber(patient.medicalRecordNumber);
      if (registeredBranchId && registeredBranchId !== branchId && legacyRm) {
        sameRmInOtherBranch.add(legacyRm);
      }
    }
  });

  const profileRowsSource = profileSourceRows.map(({ source }) => source);
  const profileColumn = {
    rm: findColumn(profileRowsSource, ["NO RM", "NOMOR RM", "NOMOR REKAM MEDIS"]),
    name: findColumn(profileRowsSource, ["NAMA PASIEN", "NAMA LENGKAP"]),
    dateOfBirth: findColumn(profileRowsSource, ["TANGGAL LAHIR", "TGL LAHIR"]),
    gender: findColumn(profileRowsSource, ["P/L", "JENIS KELAMIN", "GENDER"]),
    phone: findColumn(profileRowsSource, ["NO HP", "NO TELEPON", "WHATSAPP"]),
    address: findColumn(profileRowsSource, ["ALAMAT PASIEN", "ALAMAT"]),
    identity: findColumn(profileRowsSource, ["NO KTP", "NIK"])
  };

  const profileRows: LegacyPatientProfileRow[] =
    profileColumn.rm && profileColumn.name
      ? profileSourceRows.map(({ source, rowNumber }) => {
          const medicalRecordNumber = normalizeMedicalRecordNumber(source[profileColumn.rm!]);
          const name = cellText(source[profileColumn.name!]);
          const dateOfBirth = parseLegacyDate(
            profileColumn.dateOfBirth ? source[profileColumn.dateOfBirth] : ""
          );
          const gender = normalizeLegacyGender(
            profileColumn.gender ? source[profileColumn.gender] : ""
          );
          const errors: string[] = [];
          const warnings: string[] = [];
          if (!medicalRecordNumber) errors.push("No. RM kosong");
          if (!name) errors.push("Nama pasien kosong");
          if (
            profileColumn.dateOfBirth &&
            cellText(source[profileColumn.dateOfBirth]) &&
            !dateOfBirth
          ) {
            warnings.push("Tanggal lahir tidak dikenali dan tidak akan diimpor");
          }
          if (profileColumn.gender && cellText(source[profileColumn.gender]) && !gender) {
            warnings.push("Jenis kelamin tidak dikenali dan tidak akan diimpor");
          }
          if (!dateOfBirth) warnings.push("Tanggal lahir tidak tersedia");
          if (!gender) warnings.push("Jenis kelamin tidak tersedia");
          const sourcePhone = profileColumn.phone
            ? cellText(source[profileColumn.phone]).replace(/\D/g, "")
            : "";
          const sourceIdentity = profileColumn.identity
            ? cellText(source[profileColumn.identity]).replace(/\s/g, "").toLowerCase()
            : "";
          const identityMatches = sourceIdentity
            ? existingPatients.filter(
                (patient) =>
                  patient.identityDocumentNumber?.replace(/\s/g, "").toLowerCase() ===
                  sourceIdentity
              )
            : [];
          const existing = existingByRm.get(medicalRecordNumber);
          const identityMatch =
            !existing && identityMatches.length === 1 ? identityMatches[0] : undefined;
          const existingIdentity = existing?.identityDocumentNumber
            ?.replace(/\s/g, "")
            .toLowerCase();
          const matchingConflict = !!(
            existing &&
            sourceIdentity &&
            existingIdentity &&
            sourceIdentity !== existingIdentity
          );
          if (matchingConflict) {
            errors.push("No. RM cabang cocok tetapi NIK pada file berbeda dari profil yang ada");
          }
          if (
            branchId &&
            !existingByRm.has(medicalRecordNumber) &&
            !identityMatch &&
            sameRmInOtherBranch.has(medicalRecordNumber)
          ) {
            errors.push("No. RM yang sama tercatat di cabang lain; pasien tidak dicocokkan otomatis");
          }
          if (!existing && identityMatches.length > 1) {
            errors.push("NIK cocok dengan lebih dari satu profil; pilih pasien yang benar sebelum impor");
          }
          if (identityMatch) {
            warnings.push(
              "NIK sama dengan satu profil yang sudah ada; RM cabang akan ditautkan setelah konfirmasi"
            );
          }
          const normalizedName = name
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/\s+/g, " ")
            .trim();
          const possibleGlobalDuplicate =
            branchId &&
            !existing &&
            !identityMatch &&
            existingPatients.some((patient) => {
              const identityMatches =
                sourceIdentity &&
                patient.identityDocumentNumber?.replace(/\s/g, "").toLowerCase() ===
                  sourceIdentity;
              const phoneMatches =
                sourcePhone && patient.phone.replace(/\D/g, "") === sourcePhone;
              const patientName = (patient.fullName || patient.name || "")
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .toLowerCase()
                .replace(/\s+/g, " ")
                .trim();
              return (
                !!identityMatches ||
                !!phoneMatches ||
                (!!normalizedName && patientName === normalizedName)
              );
            });
          if (possibleGlobalDuplicate) {
            errors.push(
              "Profil serupa sudah ada; verifikasi identitas dan tautkan RM cabang secara manual sebelum impor"
            );
          }
          return {
            rowNumber,
            medicalRecordNumber,
            name,
            dateOfBirth,
            gender,
            phone: profileColumn.phone ? cellText(source[profileColumn.phone]) : "",
            address: profileColumn.address ? cellText(source[profileColumn.address]) : "",
            identityDocumentNumber: profileColumn.identity
              ? cellText(source[profileColumn.identity])
              : "",
            isValid: errors.length === 0,
            existingPatientId: existing?.id || identityMatch?.id,
            matchMethod: existing ? "branch_rm" : identityMatch ? "identity_document" : undefined,
            matchingConflict,
            errors,
            warnings
          };
        })
      : [];

  const patientIdByRm = new Map(existingByRm);
  profileRows.forEach((row) => {
    if (row.isValid && row.existingPatientId) {
      const matchedPatient = existingPatients.find((patient) => patient.id === row.existingPatientId);
      if (matchedPatient) patientIdByRm.set(row.medicalRecordNumber, matchedPatient);
    } else if (row.isValid) {
      patientIdByRm.set(row.medicalRecordNumber, {
        id: "",
        medicalRecordNumber: row.medicalRecordNumber,
        name: row.name,
        phone: row.phone,
        dateOfBirth: row.dateOfBirth,
        gender: row.gender,
        address: row.address,
        createdAt: "",
        updatedAt: ""
      });
    }
  });
  profileRows
    .filter((row) => row.matchingConflict)
    .forEach((row) => patientIdByRm.delete(row.medicalRecordNumber));

  const visitColumn = {
    rm: findColumn(visitSourceRows, ["NO RM", "NOMOR RM", "NOMOR REKAM MEDIS"]),
    date: findColumn(visitSourceRows, ["TANGGAL KUNJUNGAN", "TANGGAL", "TGL KUNJUNGAN"]),
    objective: findColumn(visitSourceRows, ["OBJEKTIF", "KELUHAN", "KELUHAN UTAMA"]),
    diagnosis: findColumn(visitSourceRows, ["DIAGNOSA", "DIAGNOSIS"]),
    treatment: findColumn(visitSourceRows, ["TERAPI / TINDAKAN", "TERAPI", "TINDAKAN"]),
    doctor: findColumn(visitSourceRows, ["DOKTER"]),
    status: findColumn(visitSourceRows, ["B/L", "STATUS PASIEN", "BARU/LAMA"])
  };
  if (!visitColumn.rm || !visitColumn.date) {
    throw new Error("Lembar Data harus memiliki kolom No. RM dan Tanggal kunjungan.");
  }

  const visitRows: LegacyPatientVisitRow[] = visitSourceRows.map((source, index) => {
    const medicalRecordNumber = normalizeMedicalRecordNumber(source[visitColumn.rm!]);
    const visitDate = parseLegacyDate(source[visitColumn.date!]);
    const errors: string[] = [];
    if (!medicalRecordNumber) errors.push("No. RM kosong; pasien tidak dapat dicocokkan");
    if (!visitDate) errors.push("Tanggal kunjungan kosong atau tidak valid");
    const matchedPatient = patientIdByRm.get(medicalRecordNumber);
    if (!matchedPatient) errors.push("No. RM tidak ditemukan pada database atau lembar Data");
    const details = [
      "[Riwayat historis impor — bukan rekam medis klinis terverifikasi]",
      visitColumn.objective && cellText(source[visitColumn.objective])
        ? `Objektif: ${cellText(source[visitColumn.objective])}`
        : "",
      visitColumn.diagnosis && cellText(source[visitColumn.diagnosis])
        ? `Diagnosis lama: ${cellText(source[visitColumn.diagnosis])}`
        : "",
      visitColumn.treatment && cellText(source[visitColumn.treatment])
        ? `Tindakan lama (belum dipetakan): ${cellText(source[visitColumn.treatment])}`
        : "",
      visitColumn.doctor && cellText(source[visitColumn.doctor])
        ? `Dokter pada sumber: ${cellText(source[visitColumn.doctor])}`
        : "",
      visitColumn.status && cellText(source[visitColumn.status])
        ? `Status pasien pada sumber: ${cellText(source[visitColumn.status])}`
        : ""
    ].filter(Boolean);

    return {
      rowNumber: index + 2,
      medicalRecordNumber,
      visitDateTime: visitDate ? `${visitDate}T00:00:00.000Z` : "",
      historicalDetails: details.join("\n"),
      isValid: errors.length === 0,
      patientId: matchedPatient?.id || undefined,
      errors
    };
  });

  return {
    sourceDigest,
    profileRows,
    visitRows,
    ignoredSheets: workbook.SheetNames.filter((name) => normalizeHeader(name) !== "data"),
    blockingReviewIssues: [],
    reviewWarnings: []
  };
}

export async function executeLegacyPatientHistoryImport(
  patientRepo: Pick<PatientRepository, "getPatients" | "createPatient" | "registerPatientBranchMedicalRecordNumber">,
  visitRepo: Pick<VisitRepository, "getVisitById" | "createVisit">,
  preview: LegacyPatientHistoryImportPreview,
  branchId: string,
  currentUserRole: UserRole,
  userBranchId?: string | null,
  confirmIdentityMatches = false
): Promise<LegacyPatientHistoryImportResult> {
  if (preview.blockingReviewIssues.length > 0) {
    throw new Error("Impor dihentikan: selesaikan temuan data pada pratinjau dan unggah workbook yang sudah diperbaiki.");
  }
  if (
    preview.profileRows.some((row) => row.isValid && row.matchMethod === "identity_document") &&
    !confirmIdentityMatches
  ) {
    throw new Error("Impor dihentikan: konfirmasi dahulu penautan profil berdasarkan NIK yang sama.");
  }

  const result: LegacyPatientHistoryImportResult = {
    profilesCreated: 0,
    profilesAlreadyPresent: 0,
    visitsCreated: 0,
    visitsAlreadyImported: 0,
    profilesFailed: 0,
    visitsFailed: 0,
    errors: []
  };

  const currentPatients = await patientRepo.getPatients(currentUserRole, userBranchId);
  const patientByRm = new Map(
    currentPatients
      .map((patient) => [
        normalizeMedicalRecordNumber(getPatientMedicalRecordNumber(patient, branchId)),
        patient
      ] as const)
      .filter(([rm]) => !!rm)
  );

  for (const row of preview.profileRows) {
    if (!row.isValid) {
      result.profilesFailed++;
      result.errors.push(`Profil lembar ${row.rowNumber}: ${row.errors.join(", ")}`);
      continue;
    }
    if (patientByRm.has(row.medicalRecordNumber)) {
      result.profilesAlreadyPresent++;
      continue;
    }
    if (row.existingPatientId) {
      const existingPatient = currentPatients.find((patient) => patient.id === row.existingPatientId);
      if (!existingPatient) {
        result.profilesFailed++;
        result.errors.push(`Profil lembar ${row.rowNumber}: profil pasien untuk penautan tidak ditemukan`);
        continue;
      }
      try {
        await patientRepo.registerPatientBranchMedicalRecordNumber(
          existingPatient.id,
          branchId,
          row.medicalRecordNumber,
          currentUserRole,
          userBranchId
        );
        patientByRm.set(row.medicalRecordNumber, {
          ...existingPatient,
          branchMedicalRecordNumbers: [
            ...(existingPatient.branchMedicalRecordNumbers || []).filter(
              (record) => record.branchId !== branchId
            ),
            { branchId, medicalRecordNumber: row.medicalRecordNumber }
          ]
        });
        result.profilesAlreadyPresent++;
      } catch (error) {
        result.profilesFailed++;
        result.errors.push(
          `Profil lembar ${row.rowNumber}: ${error instanceof Error ? error.message : "Gagal menautkan No. RM"}`
        );
      }
      continue;
    }
    try {
      const created = await patientRepo.createPatient(
        {
          name: row.name,
          fullName: row.name,
          medicalRecordNumber: row.medicalRecordNumber,
          phone: row.phone,
          email: "",
          dateOfBirth: row.dateOfBirth,
          gender: row.gender,
          address: row.address || "-",
          identityDocumentNumber: row.identityDocumentNumber,
          registeredBranchId: branchId
        },
        currentUserRole,
        userBranchId
      );
      patientByRm.set(row.medicalRecordNumber, created);
      result.profilesCreated++;
    } catch (error) {
      result.profilesFailed++;
      result.errors.push(
        `Profil lembar ${row.rowNumber}: ${error instanceof Error ? error.message : "Gagal menyimpan profil"}`
      );
    }
  }

  for (const row of preview.visitRows) {
    if (!row.isValid) {
      result.visitsFailed++;
      result.errors.push(`Kunjungan lembar ${row.rowNumber}: ${row.errors.join(", ")}`);
      continue;
    }
    const patient = patientByRm.get(row.medicalRecordNumber);
    if (!patient) {
      result.visitsFailed++;
      result.errors.push(`Kunjungan lembar ${row.rowNumber}: profil pasien belum tersedia`);
      continue;
    }

    try {
      const visitId = await createStableVisitId(preview.sourceDigest, row.rowNumber);
      const existingVisit = await visitRepo.getVisitById(visitId);
      if (existingVisit) {
        result.visitsAlreadyImported++;
        continue;
      }
      const created: PatientVisit = await visitRepo.createVisit(
        {
          id: visitId,
          patientId: patient.id,
          branchId,
          visitDateTime: row.visitDateTime,
          visitType: VisitType.WALK_IN,
          visitStatus: VisitStatus.COMPLETED,
          bookingId: null,
          complaint: row.historicalDetails
        },
        currentUserRole,
        userBranchId
      );
      if (!created.id) {
        throw new Error("Repository tidak mengembalikan ID kunjungan setelah menyimpan.");
      }
      result.visitsCreated++;
    } catch (error) {
      result.visitsFailed++;
      result.errors.push(
        `Kunjungan lembar ${row.rowNumber}: ${error instanceof Error ? error.message : "Gagal menyimpan kunjungan"}`
      );
    }
  }

  return result;
}
