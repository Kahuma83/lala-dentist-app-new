import * as XLSX from "xlsx";
import { PatientProfile, DentalBranch, UserRole } from "../types/domain";
import { PatientRepository } from "../repositories/interfaces";

export interface ParsedPatientRow {
  index: number;
  medicalRecordNumber?: string;
  name: string;
  gender: "L" | "P";
  dateOfBirth: string; // YYYY-MM-DD
  phone: string;
  email?: string;
  address: string;
  medicalHistoryNotes?: string;
  registeredBranchId?: string;
  branchNameHint?: string;
  // Validation status
  isValid: boolean;
  errors: string[];
  warnings: string[];
  isDuplicateRM: boolean;
  isDuplicatePhone: boolean;
  existingPatientMatch?: PatientProfile;
}

export interface ParsedPatientResult {
  totalRows: number;
  validRows: ParsedPatientRow[];
  invalidRows: ParsedPatientRow[];
  duplicateCount: number;
  rawRows: any[];
}

/**
 * Normalizes gender input into "L" or "P"
 */
function normalizeGender(val: any): "L" | "P" {
  if (!val) return "L";
  const str = String(val).trim().toUpperCase();
  if (str.startsWith("P") || str.includes("PEREMPUAN") || str.includes("FEMALE") || str.includes("WANITA") || str === "F") {
    return "P";
  }
  return "L";
}

/**
 * Normalizes date string or Excel serial number into YYYY-MM-DD
 */
function normalizeDate(val: any): string {
  if (!val) return "1995-01-01";

  // If numeric (Excel serial date)
  if (typeof val === "number") {
    try {
      const date = XLSX.SSF.parse_date_code(val);
      if (date) {
        const y = String(date.y).padStart(4, "0");
        const m = String(date.m).padStart(2, "0");
        const d = String(date.d).padStart(2, "0");
        return `${y}-${m}-${d}`;
      }
    } catch {
      // fallback
    }
  }

  const str = String(val).trim();

  // Pattern YYYY-MM-DD or YYYY/MM/DD
  if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(str)) {
    const parts = str.split(/[-/.]/);
    return `${parts[0]}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}`;
  }

  // Pattern DD/MM/YYYY or DD-MM-YYYY
  if (/^\d{1,2}[-/.]\d{1,2}[-/.]\d{4}$/.test(str)) {
    const parts = str.split(/[-/.]/);
    return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
  }

  // Try Date.parse
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split("T")[0];
  }

  return "1995-01-01";
}

/**
 * Normalizes Indonesian phone number
 */
function normalizePhone(val: any): string {
  if (!val) return "";
  let str = String(val).trim().replace(/\D/g, "");
  if (str.startsWith("62")) {
    str = "0" + str.substring(2);
  }
  return str;
}

/**
 * Find matching object key by keywords
 */
function findKey(obj: any, keywords: string[]): string | undefined {
  const keys = Object.keys(obj);
  return keys.find((k) => {
    const cleanKey = k.toLowerCase().replace(/[^a-z0-9]/g, "");
    return keywords.some((kw) => cleanKey.includes(kw));
  });
}

/**
 * Exports patient list to Excel file (.xlsx)
 */
export function exportPatientsToExcel(
  patients: PatientProfile[],
  branches: DentalBranch[],
  filename?: string
): void {
  const rows = patients.map((p, idx) => {
    const branch = branches.find((b) => b.id === p.registeredBranchId);
    const birthYear = p.dateOfBirth ? parseInt(p.dateOfBirth.split("-")[0], 10) : null;
    const age = birthYear && !isNaN(birthYear) ? new Date().getFullYear() - birthYear : "-";

    return {
      "No": idx + 1,
      "No. Rekam Medis (No RM)": p.medicalRecordNumber || "-",
      "Nama Lengkap Pasien": p.name || p.fullName || "-",
      "Jenis Kelamin (L/P)": p.gender === "L" ? "L (Laki-laki)" : "P (Perempuan)",
      "Tanggal Lahir": p.dateOfBirth || "-",
      "Usia": age,
      "Nomor Telepon / WhatsApp": p.phone || "-",
      "Email": p.email || "-",
      "Alamat Lengkap": p.address || "-",
      "Riwayat Medis / Alergi": p.medicalHistoryNotes || "-",
      "Cabang Terdaftar": branch ? branch.name : "Lintas Cabang / Pusat",
      "Tanggal Terdaftar": p.createdAt ? p.createdAt.split("T")[0] : "-"
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(rows);

  // Column widths
  worksheet["!cols"] = [
    { wch: 6 },
    { wch: 18 },
    { wch: 28 },
    { wch: 16 },
    { wch: 14 },
    { wch: 8 },
    { wch: 18 },
    { wch: 24 },
    { wch: 32 },
    { wch: 28 },
    { wch: 22 },
    { wch: 16 }
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Data Pasien");

  const finalName =
    filename || `Data-Pasien-Lala-Dentist-${new Date().toISOString().split("T")[0]}.xlsx`;

  XLSX.writeFile(workbook, finalName);
}

/**
 * Downloads standard Excel template for importing patients
 */
export function downloadPatientExcelTemplate(): void {
  const templateRows = [
    {
      "No RM (Opsional - Kosongkan jika ingin dibuat otomatis)": "RM-000101",
      "Nama Lengkap Pasien *": "Budi Santoso",
      "Jenis Kelamin (L/P) *": "L",
      "Tanggal Lahir (YYYY-MM-DD) *": "1990-05-15",
      "Nomor Telepon / WhatsApp *": "081234567890",
      "Email": "budi.santoso@gmail.com",
      "Alamat Lengkap": "Jl. Kalimantan No. 45, Sumbersari, Jember",
      "Riwayat Medis / Alergi": "Alergi obat Amoxicillin",
      "Cabang (Gebang / Kampus / Ambulu / Kencong / Lengkong / Muktisari)": "Gebang"
    },
    {
      "No RM (Opsional - Kosongkan jika ingin dibuat otomatis)": "RM-000102",
      "Nama Lengkap Pasien *": "Siti Nurhaliza",
      "Jenis Kelamin (L/P) *": "P",
      "Tanggal Lahir (YYYY-MM-DD) *": "1996-11-20",
      "Nomor Telepon / WhatsApp *": "085712345678",
      "Email": "siti.nur@gmail.com",
      "Alamat Lengkap": "Jl. Mastrip Timur No. 10, Jember",
      "Riwayat Medis / Alergi": "Riwayat hipertensi ringan",
      "Cabang (Gebang / Kampus / Ambulu / Kencong / Lengkong / Muktisari)": "Kampus"
    },
    {
      "No RM (Opsional - Kosongkan jika ingin dibuat otomatis)": "",
      "Nama Lengkap Pasien *": "Ahmad Fauzi",
      "Jenis Kelamin (L/P) *": "L",
      "Tanggal Lahir (YYYY-MM-DD) *": "2002-03-08",
      "Nomor Telepon / WhatsApp *": "082198765432",
      "Email": "ahmad.fauzi@yahoo.com",
      "Alamat Lengkap": "Jl. Gajah Mada No. 88, Kaliwates, Jember",
      "Riwayat Medis / Alergi": "Tidak ada alergi",
      "Cabang (Gebang / Kampus / Ambulu / Kencong / Lengkong / Muktisari)": "Ambulu"
    }
  ];

  const worksheet = XLSX.utils.json_to_sheet(templateRows);

  worksheet["!cols"] = [
    { wch: 32 },
    { wch: 25 },
    { wch: 22 },
    { wch: 26 },
    { wch: 26 },
    { wch: 25 },
    { wch: 38 },
    { wch: 28 },
    { wch: 32 }
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Template Pasien");
  XLSX.writeFile(workbook, "Template-Import-Pasien-Lala-Dentist.xlsx");
}

/**
 * Parses uploaded Excel / CSV file containing patient records
 */
export async function parsePatientExcelFile(
  file: File,
  existingPatients: PatientProfile[],
  branches: DentalBranch[],
  defaultBranchId?: string
): Promise<ParsedPatientResult> {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: "array" });

  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error("File Excel tidak memiliki lembar kerja (worksheet).");
  }

  const worksheet = workbook.Sheets[firstSheetName];
  const rawRows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

  if (rawRows.length === 0) {
    throw new Error("File Excel kosong, tidak ditemukan baris data pasien.");
  }

  const validRows: ParsedPatientRow[] = [];
  const invalidRows: ParsedPatientRow[] = [];
  let duplicateCount = 0;

  // Track seen in current file
  const seenRMInFile = new Set<string>();
  const seenPhoneInFile = new Set<string>();

  rawRows.forEach((row, idx) => {
    // Smart Header Detection
    const nameKey = findKey(row, ["nama", "name", "pasien", "fullname"]);
    const rmKey = findKey(row, ["norm", "rekam", "medicalrecord", "rm", "nomorrm"]);
    const phoneKey = findKey(row, ["telepon", "phone", "hp", "wa", "whatsapp", "kontak", "nohp"]);
    const emailKey = findKey(row, ["email", "surel", "mail"]);
    const dobKey = findKey(row, ["lahir", "dob", "birth", "tgllahir", "tanggallahir"]);
    const genderKey = findKey(row, ["gender", "kelamin", "jk", "sex", "jeniskelamin"]);
    const addressKey = findKey(row, ["alamat", "address", "domisili", "kota"]);
    const notesKey = findKey(row, ["riwayat", "alergi", "catatan", "penyakit", "history", "notes"]);
    const diagnosaKey = findKey(row, ["diagnosa", "diagnosis"]);
    const terapiKey = findKey(row, ["terapi", "tindakan", "treatment"]);
    const tanggalKunjunganKey = findKey(row, ["tanggal", "tgl", "visitdate", "kunjungan"]);
    const blKey = findKey(row, ["b/l", "baru/lama", "bl", "statuspasien"]);
    const branchKey = findKey(row, ["cabang", "branch", "lokasi"]);

    const rawName = nameKey ? String(row[nameKey]).trim() : "";
    const rawRM = rmKey ? String(row[rmKey]).trim() : "";
    const rawPhone = phoneKey ? normalizePhone(row[phoneKey]) : "";
    const rawEmail = emailKey ? String(row[emailKey]).trim() : "";
    const rawDob = dobKey ? normalizeDate(row[dobKey]) : "1995-01-01";
    const rawGender = genderKey ? normalizeGender(row[genderKey]) : "L";
    const rawAddress = addressKey ? String(row[addressKey]).trim() : "";
    let rawNotes = notesKey ? String(row[notesKey]).trim() : "";
    const rawBranch = branchKey ? String(row[branchKey]).trim() : "";

    // Parse and integrate clinical visit details from the user's Excel format
    const rawDiagnosa = diagnosaKey ? String(row[diagnosaKey]).trim() : "";
    const rawTerapi = terapiKey ? String(row[terapiKey]).trim() : "";
    const rawTanggal = tanggalKunjunganKey ? String(row[tanggalKunjunganKey]).trim() : "";
    const rawBL = blKey ? String(row[blKey]).trim() : "";

    const extraNotesParts: string[] = [];
    if (rawDiagnosa) extraNotesParts.push(`Diagnosa: ${rawDiagnosa}`);
    if (rawTerapi) extraNotesParts.push(`Terapi/Tindakan: ${rawTerapi}`);
    if (rawTanggal) {
      let formattedTanggal = rawTanggal;
      if (!isNaN(Number(rawTanggal)) && Number(rawTanggal) > 30000) {
        formattedTanggal = normalizeDate(Number(rawTanggal));
      }
      extraNotesParts.push(`Tgl Kunjungan: ${formattedTanggal}`);
    }
    if (rawBL) {
      const blText = rawBL.toUpperCase() === "B" ? "Baru" : rawBL.toUpperCase() === "L" ? "Lama" : rawBL;
      extraNotesParts.push(`Status Kunjungan: ${blText}`);
    }

    if (extraNotesParts.length > 0) {
      const joinedExtra = extraNotesParts.join(" | ");
      if (rawNotes) {
        rawNotes = `${rawNotes}\n[Riwayat Kunjungan] ${joinedExtra}`;
      } else {
        rawNotes = `[Riwayat Kunjungan] ${joinedExtra}`;
      }
    }

    // Determine Branch
    let branchId = defaultBranchId || branches[0]?.id || "branch-gebang";
    if (rawBranch) {
      const matched = branches.find((b) =>
        b.name.toLowerCase().includes(rawBranch.toLowerCase()) ||
        rawBranch.toLowerCase().includes(b.name.toLowerCase()) ||
        b.id.toLowerCase().includes(rawBranch.toLowerCase())
      );
      if (matched) {
        branchId = matched.id;
      }
    }

    const errors: string[] = [];
    const warnings: string[] = [];

    // Validation
    if (!rawName) {
      errors.push("Nama lengkap pasien wajib diisi");
    }

    if (!rawPhone) {
      errors.push("Nomor telepon / WhatsApp wajib diisi");
    } else if (rawPhone.length < 8) {
      warnings.push("Nomor telepon terlalu pendek (< 8 digit)");
    }

    // Check Duplicate against existing database
    const existingRM = rawRM
      ? existingPatients.find(
          (p) => (p.medicalRecordNumber || "").trim().toLowerCase() === rawRM.toLowerCase()
        )
      : undefined;

    const existingPhone = rawPhone
      ? existingPatients.find(
          (p) => normalizePhone(p.phone) === rawPhone
        )
      : undefined;

    const isDuplicateRM = !!existingRM || (rawRM ? seenRMInFile.has(rawRM.toLowerCase()) : false);
    const isDuplicatePhone = !!existingPhone || (rawPhone ? seenPhoneInFile.has(rawPhone) : false);

    if (existingRM) {
      warnings.push(`No RM "${rawRM}" sudah terdaftar atas nama ${existingRM.name}`);
    }
    if (existingPhone) {
      warnings.push(`No HP "${rawPhone}" sudah terdaftar atas nama ${existingPhone.name}`);
    }
    if (rawRM && seenRMInFile.has(rawRM.toLowerCase())) {
      warnings.push(`No RM "${rawRM}" duplikat dalam file Excel yang sama`);
    }

    if (isDuplicateRM || isDuplicatePhone) {
      duplicateCount++;
    }

    if (rawRM) seenRMInFile.add(rawRM.toLowerCase());
    if (rawPhone) seenPhoneInFile.add(rawPhone);

    const parsedRow: ParsedPatientRow = {
      index: idx + 1,
      name: rawName,
      medicalRecordNumber: rawRM || undefined,
      gender: rawGender,
      dateOfBirth: rawDob,
      phone: rawPhone,
      email: rawEmail || undefined,
      address: rawAddress || "-",
      medicalHistoryNotes: rawNotes || undefined,
      registeredBranchId: branchId,
      branchNameHint: rawBranch || branches.find((b) => b.id === branchId)?.name,
      isValid: errors.length === 0,
      errors,
      warnings,
      isDuplicateRM,
      isDuplicatePhone,
      existingPatientMatch: existingRM || existingPhone
    };

    if (parsedRow.isValid) {
      validRows.push(parsedRow);
    } else {
      invalidRows.push(parsedRow);
    }
  });

  return {
    totalRows: rawRows.length,
    validRows,
    invalidRows,
    duplicateCount,
    rawRows
  };
}

export interface ImportPatientOptions {
  duplicateStrategy: "skip" | "update" | "create_new_rm";
  defaultBranchId?: string;
  currentUserRole?: UserRole;
  userBranchId?: string | null;
}

export interface ImportPatientExecutionResult {
  total: number;
  imported: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: { row: number; name: string; error: string }[];
}

/**
 * Executes patient batch import into repository
 */
export async function executePatientImport(
  patientRepo: PatientRepository,
  rowsToImport: ParsedPatientRow[],
  options: ImportPatientOptions
): Promise<ImportPatientExecutionResult> {
  const result: ImportPatientExecutionResult = {
    total: rowsToImport.length,
    imported: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    errors: []
  };

  for (const row of rowsToImport) {
    if (!row.isValid) {
      result.failed++;
      result.errors.push({
        row: row.index,
        name: row.name,
        error: row.errors.join(", ")
      });
      continue;
    }

    try {
      // Dynamic duplicate lookup to handle records that are created/updated during this loop
      let activeMatch = row.existingPatientMatch;
      
      if (options.duplicateStrategy !== "create_new_rm") {
        const currentDbPatients = await patientRepo.getPatients(options.currentUserRole, options.userBranchId);
        
        if (row.medicalRecordNumber) {
          const matchedByRM = currentDbPatients.find(
            (p) => (p.medicalRecordNumber || "").trim().toLowerCase() === row.medicalRecordNumber!.trim().toLowerCase()
          );
          if (matchedByRM) {
            activeMatch = matchedByRM;
          }
        }
        
        if (!activeMatch && row.phone) {
          const normPhone = row.phone.replace(/\D/g, "");
          const matchedByPhone = currentDbPatients.find(
            (p) => (p.phone || "").replace(/\D/g, "") === normPhone
          );
          if (matchedByPhone) {
            activeMatch = matchedByPhone;
          }
        }
      }

      if (activeMatch) {
        if (options.duplicateStrategy === "skip") {
          result.skipped++;
          continue;
        } else if (options.duplicateStrategy === "update") {
          // Fetch the freshest notes from database/repository to append rather than overwrite
          const freshPatient = await patientRepo.getPatientById(activeMatch.id);
          const currentNotes = freshPatient?.medicalHistoryNotes || activeMatch.medicalHistoryNotes || "";
          
          let mergedNotes = currentNotes;
          if (row.medicalHistoryNotes) {
            if (!currentNotes.includes(row.medicalHistoryNotes)) {
              mergedNotes = currentNotes
                ? `${currentNotes}\n${row.medicalHistoryNotes}`
                : row.medicalHistoryNotes;
            }
          }

          await patientRepo.updatePatient(
            activeMatch.id,
            {
              name: row.name,
              fullName: row.name,
              phone: row.phone || activeMatch.phone,
              email: row.email || activeMatch.email,
              dateOfBirth: row.dateOfBirth || activeMatch.dateOfBirth,
              gender: row.gender || activeMatch.gender,
              address: row.address !== "-" ? row.address : activeMatch.address,
              medicalHistoryNotes: mergedNotes
            },
            options.currentUserRole,
            options.userBranchId
          );
          result.updated++;
          continue;
        }
        // If strategy is "create_new_rm", continue below without specifying RM to get auto-generated RM
      }

      const rmToUse =
        options.duplicateStrategy === "create_new_rm" && activeMatch
          ? undefined
          : row.medicalRecordNumber;

      await patientRepo.createPatient(
        {
          name: row.name,
          fullName: row.name,
          medicalRecordNumber: rmToUse,
          phone: row.phone,
          email: row.email || "",
          dateOfBirth: row.dateOfBirth,
          gender: row.gender,
          address: row.address || "-",
          medicalHistoryNotes: row.medicalHistoryNotes || ""
        },
        options.currentUserRole,
        options.userBranchId
      );
      result.imported++;
    } catch (err: any) {
      result.failed++;
      result.errors.push({
        row: row.index,
        name: row.name,
        error: err.message || "Gagal menyimpan pasien"
      });
    }
  }

  return result;
}
