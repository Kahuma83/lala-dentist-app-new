import {
  PatientRepository,
  BranchRepository,
  DoctorRepository,
  BookingRepository,
  H1ConfirmationRepository,
  VisitRepository,
  QueueRepository,
  TreatmentRepository,
  TreatmentActivityRepository,
  InvoiceRepository,
  PaymentRepository,
  CompensationRepository,
  PayrollRepository,
  ConfigurationRepository,
  AccountingRepository,
  StaffRepository,
  StaffFilter,
  DoctorScheduleRepository,
  ScheduleFilter,
  WorkShiftRepository,
  StaffShiftAssignmentRepository,
  StaffShiftAssignmentFilter,
  CreateAccountInput,
  UpdateAccountInput,
  CreateJournalLineInput,
  CreateJournalInput,
  UpdateJournalInput,
  JournalFilter,
  LedgerQuery,
  AccountBalanceResult,
  DuplicateCheckResult,
  AttendanceRepository,
  AttendanceFilter,
  CheckInInput,
  CheckOutInput,
  CreateAbsenceInput,
  OvertimeRepository,
  OvertimeSummary,
  MediaStorageRepository,
  MedicalRecordRepository,
  PromotionRepository,
  BackupRepository
} from "./interfaces";

import { MockDatabase, MOCK_SERVICES, MOCK_BRANCH_TARIFFS, MOCK_DOCTORS, MOCK_BRANCHES } from "../data/mockData";
import { formatInternalPatientCode, getPatientMedicalRecordNumber } from "../utils/rmUtils";
import { advanceStoredBranchRM, getNextStoredBranchRM } from "../utils/branchRMSettings";
import { calculatePayrollTax } from "../utils/payrollTax";
import {
  PatientProfile,
  DentalBranch,
  Booking,
  PlannedTreatment,
  BookingConfirmationH1,
  PatientVisit,
  QueueItem,
  LiveQueueSnapshot,
  TreatmentJob,
  TreatmentActivity,
  TreatmentActivityType,
  Invoice,
  InvoiceItem,
  InvoiceStatus,
  PaymentTransaction,
  PaymentMethod,
  StaffCompensationRule,
  CompensationAccrual,
  MonthlyPayroll,
  PayrollItem,
  PayrollStatus,
  MasterService,
  BranchServiceTariff,
  DentalDoctor,
  Staff,
  StaffPosition,
  EmploymentStatus,
  DoctorBranchAssignment,
  ScheduleStatus,
  DoctorSchedule,
  WorkShift,
  StaffShiftAssignment,
  StaffShiftRotationTemplate,
  UserAccount,
  UserRole,
  VisitType,
  VisitStatus,
  BookingStatus,
  BookingSource,
  ConfirmationStatusH1,
  QueueStatus,
  TreatmentJobStatus,
  ClinicalConsentDocument,
  ClinicalConsentScope,
  AccountType,
  NormalBalance,
  AccountCategory,
  JournalStatus,
  JournalSourceType,
  ChartOfAccount,
  JournalLine,
  JournalEntry,
  RecurringExpensePlan,
  RecurringExpenseType,
  GeneralLedgerEntry,
  Attendance,
  AttendanceStatus,
  AttendanceMethod,
  OvertimeRecord,
  OvertimeStatus,
  OvertimeType,
  StaffReplacementAssignment,
  IncomeStatementReport,
  TrialBalanceReport,
  BalanceSheetReport,
  IncomeStatementReportItem,
  TrialBalanceItem,
  ClinicBranding,
  MediaUploadResult,
  MedicalRecord,
  PatientMedicalProfile,
  MedicalRecordStatus,
  PromotionMedia,
  BackupJob,
  BackupType,
  BackupStatus,
  BackupScheduleInterval,
  BackupSystemSummary
} from "../types/domain";
import { AppClock } from "../utils/clock";
export { AppClock } from "../utils/clock";
import { redactPatientPhone } from "../utils/patientPrivacy";
import { generateInvoiceNumber, generateReceiptNumber } from "../utils/documentUtils";
import { getPlannedTreatmentDurationMinutes } from "../utils/plannedTreatmentUtils";
import { getScheduledBookingTimeSlots } from "../utils/bookingScheduleUtils";
import { getVisitStatusForQueueStatus, hasActiveQueueForPatientOnDate } from "../utils/bookingQueueGuards";
import { calculateQueueEstimates } from "../utils/queueScheduleUtils";
import { getNextMedicalRecordNumber, checkRMUniqueness } from "../utils/rmUtils";
import { isBranchMatch } from "../utils/branchUtils";
import { allocateInvoiceNetToLines } from "../utils/invoiceLineAllocation";
import { getOperationalDateString, toOperationalDateTime } from "../utils/dateUtils";
import { hasMockRecordedTreatmentInventoryUsage } from "../services/inventoryService";

const db = MockDatabase.getInstance();

function canReadPatientMedicalNotes(
  patient: PatientProfile,
  currentUserRole?: UserRole,
  userBranchId?: string | null
): boolean {
  if (currentUserRole === UserRole.SUPER_ADMIN) return true;
  if (currentUserRole !== UserRole.DOCTOR || !userBranchId) return false;
  if (
    patient.registeredBranchId === userBranchId ||
    patient.branch_id === userBranchId ||
    patient.assignedBranchId === userBranchId ||
    patient.branchId === userBranchId
  ) {
    return true;
  }
  return db.visits.some((visit) => visit.patientId === patient.id && visit.branchId === userBranchId);
}

export class MockPatientRepository implements PatientRepository {
  async getPatients(currentUserRole?: UserRole, userBranchId?: string | null): Promise<PatientProfile[]> {
    const hasExplicitBranchMetadata = db.patients.some(
      (p) => !!(p.registeredBranchId || p.branch_id || p.assignedBranchId || p.branchId)
    );

    const isDoctorAssistantScopedUser = currentUserRole === UserRole.DOCTOR_ASSISTANT && !!userBranchId;
    const isBranchScopedRequest = !!userBranchId && (
      currentUserRole === UserRole.BRANCH_ADMIN ||
      currentUserRole === UserRole.DOCTOR_ASSISTANT
    );

    if (isDoctorAssistantScopedUser || (isBranchScopedRequest && hasExplicitBranchMetadata)) {
      const branchPatientIds = new Set<string>();
      db.visits.filter((v) => v.branchId === userBranchId).forEach((v) => { if (v.patientId) branchPatientIds.add(v.patientId); });
      db.bookings.filter((b) => b.branchId === userBranchId).forEach((b) => { if (b.patientId) branchPatientIds.add(b.patientId); });
      db.queueItems.filter((q) => q.branchId === userBranchId).forEach((q) => { if (q.patientId) branchPatientIds.add(q.patientId); });
      db.treatmentJobs.filter((t) => t.branchId === userBranchId).forEach((t) => { if (t.patientId) branchPatientIds.add(t.patientId); });
      const patients = db.patients.filter((p) =>
        branchPatientIds.has(p.id) ||
        p.registeredBranchId === userBranchId ||
        p.branch_id === userBranchId ||
        p.assignedBranchId === userBranchId ||
        p.branchId === userBranchId
      );
      return patients.map((patient) =>
        redactPatientPhone(
          canReadPatientMedicalNotes(patient, currentUserRole, userBranchId)
            ? { ...patient }
            : { ...patient, medicalHistoryNotes: undefined },
          currentUserRole
        )
      );
    }

    // Branch Admins and super-admins should see the full global patient registry by default.
    return db.patients.map((patient) =>
      redactPatientPhone(
        canReadPatientMedicalNotes(patient, currentUserRole, userBranchId)
          ? { ...patient }
          : { ...patient, medicalHistoryNotes: undefined },
        currentUserRole
      )
    );
  }

  async getPatientById(
    id: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<PatientProfile | null> {
    const patient = db.patients.find((p) => p.id === id);
    if (!patient) return null;
    return redactPatientPhone(
      canReadPatientMedicalNotes(patient, currentUserRole, userBranchId)
        ? { ...patient }
        : { ...patient, medicalHistoryNotes: undefined },
      currentUserRole
    );
  }

  async getPatientPhoneForMedicalRecord(
    patientId: string,
    branchId: string,
    currentUserRole?: UserRole
  ): Promise<string> {
    if (currentUserRole !== UserRole.DOCTOR && currentUserRole !== UserRole.SUPER_ADMIN) {
      throw new Error("Akses ditolak untuk membaca nomor telepon rekam medis.");
    }
    const patient = db.patients.find((item) => item.id === patientId);
    if (!patient) throw new Error("Profil pasien tidak ditemukan saat menyiapkan rekam medis.");
    if (
      currentUserRole === UserRole.DOCTOR &&
      (!branchId || !db.visits.some((visit) => visit.patientId === patientId && visit.branchId === branchId))
    ) {
      throw new Error("Dokter tidak memiliki akses ke nomor telepon pasien pada cabang kunjungan ini.");
    }
    return patient.phone || "";
  }

  async searchPatients(query: string, currentUserRole?: UserRole, userBranchId?: string | null): Promise<PatientProfile[]> {
    const all = await this.getPatients(currentUserRole, userBranchId);
    const q = query.trim().toLowerCase();
    if (!q) {
      return all;
    }

    return all.filter((p) => {
      const nameMatch = (p.name || "").toLowerCase().includes(q) || (p.fullName || "").toLowerCase().includes(q);
      const phoneMatch = (p.phone || "").toLowerCase().includes(q);
      const rmMatch =
        (p.medicalRecordNumber || "").toLowerCase().includes(q) ||
        (p.internalPatientCode || "").toLowerCase().includes(q) ||
        p.branchMedicalRecordNumbers?.some((record) =>
          record.medicalRecordNumber.toLowerCase().includes(q)
        );
      return nameMatch || phoneMatch || rmMatch;
    });
  }

  async checkDuplicates(
    phone?: string,
    medicalRecordNumber?: string,
    fullName?: string,
    currentUserRole?: UserRole,
    branchId?: string
  ): Promise<DuplicateCheckResult> {
    const cleanPhone = phone ? phone.replace(/\D/g, "") : "";
    const cleanRM = medicalRecordNumber ? medicalRecordNumber.trim().toLowerCase() : "";
    const cleanName = fullName ? fullName.trim().toLowerCase() : "";

    const byPhone = cleanPhone && cleanPhone.length >= 6
      ? db.patients.filter((p) => p.phone.replace(/\D/g, "").includes(cleanPhone))
      : [];

    const byRM = cleanRM
      ? db.patients.filter((patient) =>
          getPatientMedicalRecordNumber(patient, branchId).trim().toLowerCase() === cleanRM
        )
      : [];

    const byName = cleanName && cleanName.length >= 3
      ? db.patients.filter((p) => {
          const pName = (p.fullName || p.name || "").trim().toLowerCase();
          return pName === cleanName || pName.includes(cleanName) || cleanName.includes(pName);
        })
      : [];

    return {
      byPhone: byPhone.map((patient) => redactPatientPhone({ ...patient, medicalHistoryNotes: undefined }, currentUserRole)),
      byRM: byRM.map((patient) => redactPatientPhone({ ...patient, medicalHistoryNotes: undefined }, currentUserRole)),
      byName: byName.map((patient) => redactPatientPhone({ ...patient, medicalHistoryNotes: undefined }, currentUserRole)),
      hasDuplicates: byPhone.length > 0 || byRM.length > 0 || byName.length > 0
    };
  }

  async createPatient(
    patientData: Omit<PatientProfile, "id" | "medicalRecordNumber" | "createdAt" | "updatedAt"> & { id?: string; medicalRecordNumber?: string; registeredBranchId?: string; branch_id?: string; assignedBranchId?: string; branchId?: string },
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<PatientProfile> {
    const nameToUse = (patientData.fullName || patientData.name || "").trim();
    if (!nameToUse) {
      throw new Error("Nama pasien wajib diisi");
    }

    const effBranch = patientData.registeredBranchId || (patientData as any).branch_id || (patientData as any).assignedBranchId || (patientData as any).branchId || userBranchId || undefined;
    if (
      patientData.medicalHistoryNotes?.trim() &&
      (currentUserRole !== UserRole.DOCTOR && currentUserRole !== UserRole.SUPER_ADMIN)
    ) {
      throw new Error("Riwayat medis hanya dapat diubah oleh Dokter atau Super Admin.");
    }
    if (
      patientData.medicalHistoryNotes?.trim() &&
      currentUserRole === UserRole.DOCTOR &&
      (!userBranchId || effBranch !== userBranchId)
    ) {
      throw new Error("Dokter hanya dapat mengubah riwayat medis dalam cabang yang diizinkan.");
    }

    // Keep new records unnumbered until a visit is checked in.
    let finalRM = patientData.medicalRecordNumber ? patientData.medicalRecordNumber.trim() : "";
    if (finalRM) {
      const existingWithRM = db.patients.find(
        (patient) =>
          getPatientMedicalRecordNumber(patient, effBranch).trim().toLowerCase() === finalRM.toLowerCase()
      );
      if (existingWithRM) {
        throw new Error("Medical record number already exists");
      }
    }

    const now = new Date().toISOString();
    const newPatient: PatientProfile = {
      id: patientData.id || `patient-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      medicalRecordNumber: finalRM,
      internalPatientCode: finalRM && effBranch
        ? formatInternalPatientCode(
            db.branches.find((branch) => branch.id === effBranch)?.branchCode || effBranch.slice(0, 3),
            finalRM
          )
        : undefined,
      branchMedicalRecordNumbers: finalRM && effBranch
        ? [{ branchId: effBranch, medicalRecordNumber: finalRM }]
        : [],
      name: nameToUse,
      fullName: nameToUse,
      phone: patientData.phone || "",
      email: patientData.email || "",
      emergencyContactName: patientData.emergencyContactName?.trim() || "",
      emergencyContactPhone: patientData.emergencyContactPhone?.trim() || "",
      emergencyContactRelationship: patientData.emergencyContactRelationship?.trim() || "",
      identityDocumentType: patientData.identityDocumentType,
      identityDocumentNumber: patientData.identityDocumentNumber?.trim() || "",
      placeOfBirth: patientData.placeOfBirth?.trim() || "",
      dateOfBirth: patientData.dateOfBirth || "",
      gender: patientData.gender || "",
      address: patientData.address || "",
      occupation: patientData.occupation?.trim() || "",
      religion: patientData.religion?.trim() || "",
      maritalStatus: patientData.maritalStatus?.trim() || "",
      education: patientData.education?.trim() || "",
      medicalHistoryNotes: patientData.medicalHistoryNotes || "",
      acquisitionSource: patientData.acquisitionSource || "UNKNOWN",
      referralName: patientData.acquisitionSource === "REFERRAL" ? patientData.referralName?.trim() || undefined : undefined,
      referringStaffId: patientData.referringStaffId || null,
      registeredBranchId: effBranch,
      branch_id: effBranch,
      assignedBranchId: effBranch,
      branchId: effBranch,
      createdAt: now,
      updatedAt: now
    };

    db.patients.push(newPatient);
    db.saveToStorage();
    return redactPatientPhone(newPatient, currentUserRole);
  }

  async updatePatient(
    id: string,
    updates: Partial<Omit<PatientProfile, "id" | "createdAt" | "updatedAt">> & { registeredBranchId?: string; branch_id?: string; assignedBranchId?: string; branchId?: string },
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<PatientProfile> {
    if (
      updates.medicalHistoryNotes?.trim() &&
      currentUserRole !== UserRole.DOCTOR &&
      currentUserRole !== UserRole.SUPER_ADMIN
    ) {
      throw new Error("Riwayat medis hanya dapat diubah oleh Dokter atau Super Admin.");
    }
    const index = db.patients.findIndex((p) => p.id === id);
    if (index === -1) {
      throw new Error("Patient not found");
    }

    const existing = db.patients[index];
    if (
      updates.medicalHistoryNotes?.trim() &&
      currentUserRole === UserRole.DOCTOR &&
      !canReadPatientMedicalNotes(existing, currentUserRole, userBranchId)
    ) {
      throw new Error("Dokter hanya dapat mengubah riwayat medis dalam cabang yang diizinkan.");
    }

    const effectiveBranchId =
      updates.registeredBranchId ||
      updates.branch_id ||
      updates.assignedBranchId ||
      updates.branchId ||
      existing.registeredBranchId ||
      existing.branch_id ||
      existing.assignedBranchId ||
      existing.branchId;
    if (updates.medicalRecordNumber) {
      const newRM = updates.medicalRecordNumber.trim();
      const duplicateRM = db.patients.find(
        (patient) =>
          patient.id !== id &&
          getPatientMedicalRecordNumber(patient, effectiveBranchId).trim().toLowerCase() === newRM.toLowerCase()
      );
      if (duplicateRM) {
        throw new Error("Medical record number already exists");
      }
    }

    const nameToUse = updates.fullName || updates.name || existing.fullName || existing.name;
    const effBranch = (updates as any).registeredBranchId || (updates as any).branch_id || (updates as any).assignedBranchId || (updates as any).branchId || existing.registeredBranchId;

    const updatedPatient: PatientProfile = {
      ...existing,
      ...updates,
      ...(updates.medicalRecordNumber && effectiveBranchId
        ? {
            internalPatientCode: existing.internalPatientCode || formatInternalPatientCode(
              db.branches.find((branch) => branch.id === effectiveBranchId)?.branchCode || effectiveBranchId.slice(0, 3),
              updates.medicalRecordNumber
            ),
            branchMedicalRecordNumbers: [
              ...(existing.branchMedicalRecordNumbers || []).filter(
                (record) => record.branchId !== effectiveBranchId
              ),
              { branchId: effectiveBranchId, medicalRecordNumber: updates.medicalRecordNumber.trim() }
            ]
          }
        : {}),
      name: nameToUse,
      fullName: nameToUse,
      acquisitionSource: updates.acquisitionSource ?? existing.acquisitionSource ?? "UNKNOWN",
      referralName: updates.acquisitionSource === undefined
        ? updates.referralName ?? existing.referralName
        : updates.acquisitionSource === "REFERRAL"
          ? updates.referralName?.trim() || undefined
          : undefined,
      referringStaffId: updates.referringStaffId === undefined
        ? existing.referringStaffId
        : updates.referringStaffId || null,
      registeredBranchId: effBranch,
      branch_id: effBranch,
      assignedBranchId: effBranch,
      branchId: effBranch,
      updatedAt: new Date().toISOString()
    };

    db.patients[index] = updatedPatient;
    db.saveToStorage();
    return redactPatientPhone(updatedPatient, currentUserRole);
  }

  async registerPatientBranchMedicalRecordNumber(
    patientId: string,
    branchId: string,
    medicalRecordNumber: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<void> {
    if (currentUserRole !== UserRole.SUPER_ADMIN && currentUserRole !== UserRole.BRANCH_ADMIN) {
      throw new Error("Hanya administrator yang dapat menautkan No. RM ke cabang.");
    }
    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId !== branchId) {
      throw new Error("Admin cabang hanya dapat mengelola No. RM cabangnya sendiri.");
    }

    const patient = db.patients.find((item) => item.id === patientId);
    if (!patient) throw new Error("Profil pasien tidak ditemukan.");
    const cleanRm = medicalRecordNumber.trim();
    if (!cleanRm) throw new Error("No. RM wajib diisi.");

    const currentBranchRm = getPatientMedicalRecordNumber(patient, branchId);
    if (currentBranchRm) {
      if (currentBranchRm.toLowerCase() !== cleanRm.toLowerCase()) {
        throw new Error("No. RM cabang yang sudah terdaftar tidak dapat diganti.");
      }
      return;
    }

    const duplicate = db.patients.find(
      (candidate) =>
        candidate.id !== patientId &&
        getPatientMedicalRecordNumber(candidate, branchId).trim().toLowerCase() === cleanRm.toLowerCase()
    );
    if (duplicate) throw new Error("No. RM sudah digunakan pasien lain di cabang ini.");

    const branch = db.branches.find((item) => item.id === branchId);
    if (!branch) throw new Error("Cabang tidak ditemukan.");
    patient.branchMedicalRecordNumbers = [
      ...(patient.branchMedicalRecordNumbers || []),
      { branchId, medicalRecordNumber: cleanRm }
    ];
    if (!patient.medicalRecordNumber) patient.medicalRecordNumber = cleanRm;
    if (!patient.internalPatientCode) {
      patient.internalPatientCode = formatInternalPatientCode(branch.branchCode || "BRN", cleanRm);
    }
    patient.updatedAt = new Date().toISOString();
    db.saveToStorage();
  }

  async deletePatient(id: string, currentUserRole?: UserRole): Promise<boolean> {
    if (
      currentUserRole &&
      currentUserRole !== UserRole.SUPER_ADMIN &&
      currentUserRole !== UserRole.BRANCH_ADMIN
    ) {
      throw new Error("Akses ditolak: Hanya Super Admin atau Branch Admin yang dapat menghapus data pasien.");
    }

    const index = db.patients.findIndex((p) => p.id === id);
    if (index === -1) {
      return false;
    }

    // Remove patient
    db.patients.splice(index, 1);
    // Cascade clean related records
    db.visits = db.visits.filter((v) => v.patientId !== id);
    db.bookings = db.bookings.filter((b) => b.patientId !== id);
    db.queueItems = db.queueItems.filter((q) => q.patientId !== id);
    db.treatmentJobs = db.treatmentJobs.filter((t) => t.patientId !== id);
    db.medicalRecords = db.medicalRecords.filter((m) => m.patientId !== id);
    db.saveToStorage();
    return true;
  }

  async clearAllPatients(currentUserRole?: UserRole): Promise<boolean> {
    if (currentUserRole !== UserRole.SUPER_ADMIN && currentUserRole !== UserRole.BRANCH_ADMIN) {
      throw new Error("Akses ditolak: Hanya Administrator yang berhak mengosongkan seluruh database pasien.");
    }
    db.patients = [];
    db.visits = [];
    db.bookings = [];
    db.confirmations = [];
    db.queueItems = [];
    db.treatmentJobs = [];
    db.treatmentActivities = [];
    db.invoices = [];
    db.invoiceItems = [];
    db.payments = [];
    db.accruals = [];
    db.medicalRecords = [];
    db.patientMedicalProfiles = [];
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        window.localStorage.removeItem("lala_patients");
        window.localStorage.setItem("lala_patients", "[]");
        window.localStorage.setItem("lala_patients_cleaned", "true");
      } catch {
        // ignore
      }
    }
    db.saveToStorage();
    return true;
  }
}

export class MockMediaStorageRepository implements MediaStorageRepository {
  private uploadedFiles: Map<string, MediaUploadResult> = new Map();

  async uploadImage(
    file: File | Blob | { name: string; type: string; size: number; base64OrDataUrl?: string; content?: string },
    folder: string = "general"
  ): Promise<MediaUploadResult> {
    const fileName = (file as any).name || `media-${Date.now()}.png`;
    const mimeType = (file as any).type || "image/png";
    const fileSize = (file as any).size || 1024;

    // Validate file type
    const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/svg+xml"];
    const validExts = [".jpg", ".jpeg", ".png", ".webp", ".svg"];
    const hasValidType = validTypes.includes(mimeType.toLowerCase()) || mimeType.startsWith("image/");
    const hasValidExt = validExts.some((ext) => fileName.toLowerCase().endsWith(ext));

    if (!hasValidType && !hasValidExt) {
      throw new Error("Format file tidak didukung. Harap upload format JPG, JPEG, PNG, atau WEBP");
    }

    // Validate file size: 5MB maximum
    const MAX_SIZE = 5 * 1024 * 1024; // 5MB
    if (fileSize > MAX_SIZE) {
      throw new Error("Ukuran file melebihi batas maksimal 5MB");
    }

    const cleanName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `dental-media/${folder}/${Date.now()}-${cleanName}`;
    const url = (file as any).base64OrDataUrl || `/storage/v1/object/public/${path}`;

    const result: MediaUploadResult = {
      url,
      path,
      fileName,
      fileSize,
      mimeType
    };

    this.uploadedFiles.set(path, result);
    this.uploadedFiles.set(url, result);
    return result;
  }

  async replaceImage(
    oldPathOrUrl: string,
    newFile: File | Blob | { name: string; type: string; size: number; base64OrDataUrl?: string; content?: string },
    folder: string = "general"
  ): Promise<MediaUploadResult> {
    if (oldPathOrUrl) {
      await this.deleteImage(oldPathOrUrl);
    }
    return this.uploadImage(newFile, folder);
  }

  async deleteImage(pathOrUrl: string): Promise<void> {
    if (pathOrUrl) {
      this.uploadedFiles.delete(pathOrUrl);
    }
  }

  getPublicUrl(path: string): string {
    if (path.startsWith("http://") || path.startsWith("https://") || path.startsWith("data:") || path.startsWith("/")) {
      return path;
    }
    return `/storage/v1/object/public/${path}`;
  }
}

export class MockBranchRepository implements BranchRepository {
  private syncFromStorage(): void {
    if (typeof process !== "undefined" && (process.env.NODE_ENV === "test" || process.env.VITEST)) {
      return;
    }
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("lala_branches");
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            db.branches = parsed;
          }
        }
      } catch (e) {
        console.warn("Error reading branches from localStorage:", e);
      }
    }
  }

  private saveToStorage(): void {
    if (typeof process !== "undefined" && (process.env.NODE_ENV === "test" || process.env.VITEST)) {
      return;
    }
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("lala_branches", JSON.stringify(db.branches));
      } catch (e) {
        console.warn("Error saving branches to localStorage:", e);
      }
    }
  }

  async getBranches(currentUserRole?: UserRole, userBranchId?: string | null): Promise<DentalBranch[]> {
    this.syncFromStorage();
    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId) {
      // In branch admin isolated view, they can only view their own assigned branch
      return db.branches
        .filter((b: DentalBranch) => b.id === userBranchId)
        .map((b: DentalBranch) => ({ ...b }));
    }
    return db.branches.map((b: DentalBranch) => ({ ...b }));
  }

  async getBranchById(id: string): Promise<DentalBranch | null> {
    this.syncFromStorage();
    const branch = db.branches.find((b: DentalBranch) => b.id === id);
    return branch ? { ...branch } : null;
  }

  async getDoctors(): Promise<DentalDoctor[]> {
    return db.doctors.map((d: DentalDoctor) => ({ ...d }));
  }

  async createBranch(
    data: Omit<DentalBranch, "id" | "createdAt" | "updatedAt"> & { id?: string },
    currentUserRole?: UserRole
  ): Promise<DentalBranch> {
    if (currentUserRole && currentUserRole !== UserRole.SUPER_ADMIN) {
      throw new Error("Hanya Super Admin yang berwenang membuat cabang klinik baru");
    }

    this.syncFromStorage();

    const branchName = (data.branchName || data.name || "").trim();
    if (!branchName) {
      throw new Error("Nama cabang wajib diisi");
    }

    if (!data.address) {
      throw new Error("Alamat cabang wajib diisi");
    }

    if (!data.phone) {
      throw new Error("Nomor telepon cabang wajib diisi");
    }

    if (data.branchCode) {
      const existing = db.branches.find(
        (b: DentalBranch) => (b.branchCode || "").toUpperCase() === data.branchCode!.toUpperCase()
      );
      if (existing) {
        throw new Error("Kode cabang sudah digunakan oleh cabang lain");
      }
    }

    const now = new Date().toISOString();
    const branchCode = (data.branchCode || branchName.substring(0, 3).toUpperCase()).toUpperCase();
    const id = data.id || `branch-${branchCode.toLowerCase()}`;
    const isActive = data.isActive ?? data.active ?? true;

    const newBranch: DentalBranch = {
      id,
      name: branchName,
      branchName: branchName,
      branchCode,
      clinicName: data.clinicName || "Lala Dentist",
      address: data.address,
      phone: data.phone,
      whatsapp: data.whatsapp || data.phone,
      email: data.email || `${branchCode.toLowerCase()}@laladentist.com`,
      operationalHours: data.operationalHours,
      logoUrl: data.logoUrl !== undefined ? data.logoUrl : "/logo-lala.svg",
      imageUrl: data.imageUrl || null,
      isActive,
      active: isActive,
      createdAt: now,
      updatedAt: now
    };

    db.branches.push(newBranch);
    this.saveToStorage();
    return { ...newBranch };
  }

  async updateBranch(
    id: string,
    updates: Partial<Omit<DentalBranch, "id" | "createdAt" | "updatedAt">>,
    currentUserRole?: UserRole,
    _userBranchId?: string | null
  ): Promise<DentalBranch> {
    if (currentUserRole && currentUserRole !== UserRole.SUPER_ADMIN) {
      // Branch Admin is only allowed to update contact/branding fields, not core master details
      const restrictedFields = ["name", "branchName", "branchCode", "isActive", "active", "clinicName"];
      const isTryingToModifyRestricted = Object.keys(updates).some((k) => restrictedFields.includes(k));

      if (isTryingToModifyRestricted) {
        throw new Error("Akses ditolak: Hanya Super Admin yang berwenang mengubah identitas cabang");
      }

      if (!(currentUserRole === UserRole.BRANCH_ADMIN && _userBranchId === id)) {
        throw new Error("Akses ditolak: Hanya Super Admin dan Admin Cabang terkait yang berwenang mengubah profil dan logo cabang");
      }
    }

    this.syncFromStorage();

    const index = db.branches.findIndex((b: DentalBranch) => b.id === id);
    if (index === -1) {
      throw new Error("Cabang tidak ditemukan");
    }

    const current = db.branches[index];

    // Branch ID is strictly immutable
    const preservedId = current.id;

    // Validate branchCode if changed
    if (updates.branchCode && updates.branchCode !== current.branchCode) {
      const existingCode = db.branches.find(
        (b: DentalBranch) => b.id !== id && (b.branchCode || "").toUpperCase() === updates.branchCode!.toUpperCase()
      );
      if (existingCode) {
        throw new Error("Kode cabang sudah digunakan");
      }
    }

    const name = updates.name || updates.branchName || current.name;
    const branchName = updates.branchName || updates.name || current.branchName || name;
    let isActiveVal = current.isActive;
    if (updates.isActive !== undefined) isActiveVal = updates.isActive;
    if (updates.active !== undefined) isActiveVal = updates.active;

    const updated: DentalBranch = {
      ...current,
      ...updates,
      id: preservedId, // enforce immutability of branch ID
      name,
      branchName,
      isActive: isActiveVal,
      active: isActiveVal,
      updatedAt: new Date().toISOString()
    };

    db.branches[index] = updated;
    this.saveToStorage();
    return { ...updated };
  }

  async updateBranchBranding(
    id: string,
    brandingUpdates:
      | {
          logoUrl?: string | null;
          imageUrl?: string | null;
          clinicName?: string;
          phone?: string;
          whatsapp?: string;
          email?: string;
          address?: string;
        }
      | string
      | null,
    currentUserRole?: UserRole
  ): Promise<DentalBranch> {
    if (currentUserRole && currentUserRole !== UserRole.SUPER_ADMIN) {
      throw new Error("Hanya Super Admin yang berwenang mengubah identitas cabang");
    }

    this.syncFromStorage();

    const index = db.branches.findIndex((b: DentalBranch) => b.id === id);
    if (index === -1) {
      throw new Error("Cabang tidak ditemukan");
    }

    const current = db.branches[index];
    const updates =
      typeof brandingUpdates === "string" || brandingUpdates === null
        ? { logoUrl: brandingUpdates }
        : brandingUpdates;

    const updated: DentalBranch = {
      ...current,
      ...updates,
      updatedAt: new Date().toISOString()
    };

    db.branches[index] = updated;
    this.saveToStorage();
    return { ...updated };
  }
}

export class MockDoctorRepository implements DoctorRepository {
  private syncFromStorage(): void {
    if (typeof process !== "undefined" && (process.env.NODE_ENV === "test" || process.env.VITEST)) {
      return;
    }
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("lala_doctors");
        if (saved !== null) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.some((d: DentalDoctor) => d.id === "doc-aab")) {
            db.doctors = parsed.map((d: DentalDoctor) => {
              const photo = d.photoUrl || d.avatarUrl || d.profileImage || null;
              return {
                ...d,
                avatarUrl: photo,
                photoUrl: photo,
                profileImage: photo || undefined
              };
            });
          } else {
            // Update outdated storage with official doctors
            localStorage.setItem("lala_doctors", JSON.stringify(db.doctors));
          }
        }
      } catch (e) {
        console.warn("Error reading doctors from localStorage:", e);
      }
    }
  }

  private saveToStorage(): void {
    if (typeof process !== "undefined" && (process.env.NODE_ENV === "test" || process.env.VITEST)) {
      return;
    }
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("lala_doctors", JSON.stringify(db.doctors));
      } catch (e) {
        console.warn("Error saving doctors to localStorage:", e);
      }
    }
  }

  async getDoctors(
    currentUserRole?: UserRole,
    userBranchId?: string | null,
    _includeInactive = false
  ): Promise<DentalDoctor[]> {
    this.syncFromStorage();
    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId) {
      // Return doctors assigned to this branch via assignments or default branch
      const activeAssignments = db.doctorBranchAssignments.filter(
        (a: DoctorBranchAssignment) => isBranchMatch(a.branchId, userBranchId, db.branches) && a.active !== false
      );
      const assignedDoctorIds = new Set(activeAssignments.map((a: DoctorBranchAssignment) => a.doctorId));

      // Also include doctors with active schedules on this branch
      db.doctorSchedules.forEach((s: DoctorSchedule) => {
        if (isBranchMatch(s.branchId, userBranchId, db.branches) && s.status !== ScheduleStatus.CANCELLED) {
          assignedDoctorIds.add(s.doctorId);
        }
      });

      const branchDoctors = db.doctors.filter(
        (d: DentalDoctor) =>
          isBranchMatch(d.assignedBranchId, userBranchId, db.branches) ||
          assignedDoctorIds.has(d.id) ||
          (d.doctorCode && assignedDoctorIds.has(d.doctorCode.toLowerCase()))
      );

      // Fallback: If no doctors are strictly matched to the branch, return all active doctors
      // so Branch Admin never sees an empty roster (0 dokter)
      if (branchDoctors.length > 0) {
        return branchDoctors.map((d: DentalDoctor) => ({ ...d }));
      }
      return db.doctors
        .filter((d: DentalDoctor) => d.active ?? d.isActive ?? true)
        .map((d: DentalDoctor) => ({ ...d }));
    }
    return db.doctors.map((d: DentalDoctor) => ({ ...d }));
  }

  async getDoctorById(id: string): Promise<DentalDoctor | null> {
    let doctor = db.doctors.find((d: DentalDoctor) => d.id === id);
    if (!doctor && id) {
      const cleanTarget = id.toLowerCase().trim();
      doctor = db.doctors.find(
        (d: DentalDoctor) =>
          d.id.toLowerCase() === cleanTarget ||
          (d.doctorCode && d.doctorCode.toLowerCase() === cleanTarget) ||
          (d.name && d.name.toLowerCase().includes(cleanTarget)) ||
          (d.fullName && d.fullName.toLowerCase().includes(cleanTarget))
      );
    }
    if (!doctor && id) {
      const cleanTarget = id.toLowerCase().trim();
      const mockDoc = MOCK_DOCTORS.find(
        (d) =>
          d.id === id ||
          d.id.toLowerCase() === cleanTarget ||
          (d.doctorCode && d.doctorCode.toLowerCase() === cleanTarget)
      );
      if (mockDoc) {
        if (!db.doctors.some((d: DentalDoctor) => d.id === mockDoc.id)) {
          db.doctors.push(mockDoc);
        }
        doctor = mockDoc;
      }
    }
    return doctor ? { ...doctor } : null;
  }

  async getDoctorByStaffId(staffId: string): Promise<DentalDoctor | null> {
    const doctor = db.doctors.find((item: DentalDoctor) => item.staffId === staffId);
    return doctor ? { ...doctor } : null;
  }

  async getDoctorByCode(code: string): Promise<DentalDoctor | null> {
    const cleanCode = code.trim().toLowerCase();
    const doctor = db.doctors.find(
      (d: DentalDoctor) => (d.doctorCode || "").trim().toLowerCase() === cleanCode
    );
    return doctor ? { ...doctor } : null;
  }

  async getDoctorsByBranch(branchId: string): Promise<DentalDoctor[]> {
    const activeAssignments = db.doctorBranchAssignments.filter(
      (a: DoctorBranchAssignment) => a.branchId === branchId && a.active !== false
    );
    const assignedDoctorIds = new Set(activeAssignments.map((a: DoctorBranchAssignment) => a.doctorId));
    return db.doctors
      .filter((d: DentalDoctor) => d.assignedBranchId === branchId || assignedDoctorIds.has(d.id))
      .map((d: DentalDoctor) => ({ ...d }));
  }

  async createDoctor(
    data: Omit<DentalDoctor, "id" | "createdAt" | "updatedAt"> & { id?: string },
    currentUserRole?: UserRole,
    _userBranchId?: string | null
  ): Promise<DentalDoctor> {
    if (currentUserRole && currentUserRole !== UserRole.SUPER_ADMIN) {
      throw new Error("Hanya Super Admin yang berwenang menambah master dokter");
    }

    if (!data.name && !data.fullName) {
      throw new Error("Nama dokter wajib diisi");
    }

    if (data.doctorCode) {
      const existing = db.doctors.find(
        (d: DentalDoctor) => (d.doctorCode || "").trim().toLowerCase() === data.doctorCode!.trim().toLowerCase()
      );
      if (existing) {
        throw new Error("Kode dokter sudah terdaftar");
      }
    }

    const now = new Date().toISOString();
    const docId = data.id || `doc-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const isActive = data.isActive ?? data.active ?? true;
    const photo = data.photoUrl || data.avatarUrl || data.profileImage || null;

    const newDoc: DentalDoctor = {
      id: docId,
      staffId: data.staffId,
      doctorCode: data.doctorCode,
      name: data.name || data.fullName || "",
      fullName: data.fullName || data.name || "",
      title: data.title || data.specialization || "Dokter Gigi Umum",
      specialization: data.specialization || "Dokter Gigi Umum",
      phone: data.phone || "",
      email: data.email || "",
      str: data.str,
      sip: data.sip,
      assignedBranchId: data.assignedBranchId,
      active: isActive,
      isActive: isActive,
      avatarUrl: photo,
      photoUrl: photo,
      profileImage: photo,
      notes: data.notes,
      createdAt: now,
      updatedAt: now
    };

    db.doctors.push(newDoc);

    // If assignedBranchId is given, automatically create a DoctorBranchAssignment if none exists
    if (data.assignedBranchId) {
      const existingAssign = db.doctorBranchAssignments.find(
        (a: DoctorBranchAssignment) => a.doctorId === docId && a.branchId === data.assignedBranchId
      );
      if (!existingAssign) {
        db.doctorBranchAssignments.push({
          id: `dba-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          doctorId: docId,
          branchId: data.assignedBranchId,
          startDate: now.split("T")[0],
          active: true,
          notes: "Penempatan utama dokter",
          createdAt: now,
          updatedAt: now
        });
      }
    }

    this.saveToStorage();
    return { ...newDoc };
  }

  async updateDoctorPhoto(
    id: string,
    photoUrl: string | null,
    currentUserRole?: UserRole
  ): Promise<DentalDoctor> {
    if (currentUserRole && currentUserRole !== UserRole.SUPER_ADMIN) {
      throw new Error("Hanya Super Admin yang berwenang mengubah foto dokter");
    }

    let docIndex = db.doctors.findIndex((d: DentalDoctor) => d.id === id);
    if (docIndex === -1 && id) {
      const cleanTarget = id.toLowerCase().trim();
      docIndex = db.doctors.findIndex(
        (d: DentalDoctor) =>
          d.id.toLowerCase() === cleanTarget ||
          (d.doctorCode && d.doctorCode.toLowerCase() === cleanTarget)
      );
    }
    if (docIndex === -1 && id) {
      const cleanTarget = id.toLowerCase().trim();
      const mockDoc = MOCK_DOCTORS.find(
        (d) =>
          d.id === id ||
          d.id.toLowerCase() === cleanTarget ||
          (d.doctorCode && d.doctorCode.toLowerCase() === cleanTarget)
      );
      if (mockDoc) {
        db.doctors.push(mockDoc);
        docIndex = db.doctors.length - 1;
      }
    }
    if (docIndex === -1) {
      throw new Error("Dokter tidak ditemukan");
    }

    const current = db.doctors[docIndex];
    const photo = photoUrl || null;

    const updated: DentalDoctor = {
      ...current,
      photoUrl: photo,
      avatarUrl: photo,
      profileImage: photo,
      updatedAt: new Date().toISOString()
    };

    db.doctors[docIndex] = updated;
    this.saveToStorage();
    return { ...updated };
  }

  async updateDoctor(
    id: string,
    updates: Partial<Omit<DentalDoctor, "id" | "createdAt" | "updatedAt">>,
    currentUserRole?: UserRole,
    _userBranchId?: string | null
  ): Promise<DentalDoctor> {
    if (currentUserRole && currentUserRole !== UserRole.SUPER_ADMIN && currentUserRole !== UserRole.BRANCH_ADMIN && currentUserRole !== UserRole.DOCTOR) {
      throw new Error("Hanya Admin atau Dokter yang bersangkutan yang berwenang mengubah data dokter");
    }

    let docIndex = db.doctors.findIndex((d: DentalDoctor) => d.id === id);
    if (docIndex === -1 && id) {
      const cleanTarget = id.toLowerCase().trim();
      docIndex = db.doctors.findIndex(
        (d: DentalDoctor) =>
          d.id.toLowerCase() === cleanTarget ||
          (d.doctorCode && d.doctorCode.toLowerCase() === cleanTarget)
      );
    }
    if (docIndex === -1 && id) {
      const cleanTarget = id.toLowerCase().trim();
      const mockDoc = MOCK_DOCTORS.find(
        (d) =>
          d.id === id ||
          d.id.toLowerCase() === cleanTarget ||
          (d.doctorCode && d.doctorCode.toLowerCase() === cleanTarget)
      );
      if (mockDoc) {
        db.doctors.push(mockDoc);
        docIndex = db.doctors.length - 1;
      }
    }
    if (docIndex === -1) {
      throw new Error("Dokter tidak ditemukan");
    }

    if (updates.doctorCode) {
      const existing = db.doctors.find(
        (d: DentalDoctor) =>
          d.id !== id && (d.doctorCode || "").trim().toLowerCase() === updates.doctorCode!.trim().toLowerCase()
      );
      if (existing) {
        throw new Error("Kode dokter sudah terdaftar");
      }
    }

    const current = db.doctors[docIndex];
    let activeVal = current.active;
    if (updates.active !== undefined) activeVal = updates.active;
    if (updates.isActive !== undefined) activeVal = updates.isActive;

    let photo = current.photoUrl ?? current.avatarUrl;
    if (updates.photoUrl !== undefined) photo = updates.photoUrl;
    else if (updates.avatarUrl !== undefined) photo = updates.avatarUrl;
    else if (updates.profileImage !== undefined) photo = updates.profileImage;

    const updated: DentalDoctor = {
      ...current,
      ...updates,
      photoUrl: photo,
      avatarUrl: photo,
      profileImage: photo,
      active: activeVal,
      isActive: activeVal,
      updatedAt: new Date().toISOString()
    };

    db.doctors[docIndex] = updated;
    this.saveToStorage();
    return { ...updated };
  }

  async getDoctorBranchAssignments(doctorId?: string, branchId?: string): Promise<DoctorBranchAssignment[]> {
    return db.doctorBranchAssignments
      .filter((a: DoctorBranchAssignment) => {
        if (doctorId && a.doctorId !== doctorId) return false;
        if (branchId && !isBranchMatch(a.branchId, branchId, db.branches)) return false;
        return true;
      })
      .map((a: DoctorBranchAssignment) => ({ ...a }));
  }

  async assignDoctorToBranch(
    data: Omit<DoctorBranchAssignment, "id" | "createdAt" | "updatedAt"> & { id?: string },
    _currentUserRole?: UserRole,
    _userBranchId?: string | null
  ): Promise<DoctorBranchAssignment> {
    let doctor = db.doctors.find((d: DentalDoctor) => d.id === data.doctorId);
    if (!doctor && data.doctorId) {
      const cleanTarget = data.doctorId.toLowerCase().trim();
      doctor = db.doctors.find(
        (d: DentalDoctor) =>
          d.id.toLowerCase() === cleanTarget ||
          (d.doctorCode && d.doctorCode.toLowerCase() === cleanTarget)
      );
    }
    if (!doctor && data.doctorId) {
      const cleanTarget = data.doctorId.toLowerCase().trim();
      const mockDoc = MOCK_DOCTORS.find(
        (d) =>
          d.id === data.doctorId ||
          d.id.toLowerCase() === cleanTarget ||
          (d.doctorCode && d.doctorCode.toLowerCase() === cleanTarget)
      );
      if (mockDoc) {
        db.doctors.push(mockDoc);
        doctor = mockDoc;
      }
    }
    if (!doctor) {
      throw new Error("Dokter tidak ditemukan");
    }

    const branch = db.branches.find((b: DentalBranch) => b.id === data.branchId);
    if (!branch) {
      throw new Error("Cabang tidak ditemukan");
    }

    // Check if assignment already exists
    const existingIndex = db.doctorBranchAssignments.findIndex(
      (a: DoctorBranchAssignment) => a.doctorId === data.doctorId && a.branchId === data.branchId
    );

    const now = new Date().toISOString();
    if (existingIndex !== -1) {
      db.doctorBranchAssignments[existingIndex] = {
        ...db.doctorBranchAssignments[existingIndex],
        ...data,
        active: true,
        updatedAt: now
      };
      this.saveToStorage();
      return { ...db.doctorBranchAssignments[existingIndex] };
    }

    const newAssignment: DoctorBranchAssignment = {
      id: data.id || `dba-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      doctorId: data.doctorId,
      branchId: data.branchId,
      startDate: data.startDate || now.split("T")[0],
      endDate: data.endDate || null,
      active: data.active ?? true,
      notes: data.notes,
      createdAt: now,
      updatedAt: now
    };

    db.doctorBranchAssignments.push(newAssignment);
    this.saveToStorage();
    return { ...newAssignment };
  }

  async removeDoctorBranchAssignment(id: string): Promise<void> {
    const index = db.doctorBranchAssignments.findIndex((a: DoctorBranchAssignment) => a.id === id);
    if (index !== -1) {
      db.doctorBranchAssignments[index].active = false;
      db.doctorBranchAssignments[index].updatedAt = new Date().toISOString();
      this.saveToStorage();
    }
  }

  async deleteDoctor(id: string, currentUserRole?: UserRole): Promise<void> {
    if (currentUserRole && currentUserRole !== UserRole.SUPER_ADMIN) {
      throw new Error("Hanya Super Admin yang berwenang menghapus master dokter");
    }
    this.syncFromStorage();
    db.doctors = db.doctors.filter((d: DentalDoctor) => d.id !== id);
    db.doctorBranchAssignments = db.doctorBranchAssignments.filter(
      (a: DoctorBranchAssignment) => a.doctorId !== id
    );
    db.doctorSchedules = db.doctorSchedules.filter(
      (s: DoctorSchedule) => s.doctorId !== id
    );
    this.saveToStorage();
  }
}

export class MockStaffRepository implements StaffRepository {
  async getStaff(
    filter?: StaffFilter,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<Staff[]> {
    return db.staff
      .filter((s: Staff) => {
        // Branch admin branch isolation
        if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId) {
          if (s.branchId && s.branchId !== userBranchId) return false;
        }

        if (filter?.branchId && s.branchId !== filter.branchId) return false;
        if (filter?.position && s.position !== filter.position) return false;
        if (filter?.employmentStatus && s.employmentStatus !== filter.employmentStatus) return false;
        if (filter?.activeOnly && !s.active) return false;

        return true;
      })
      .map((s: Staff) => ({ ...s }));
  }

  async getStaffById(id: string): Promise<Staff | null> {
    const item = db.staff.find((s: Staff) => s.id === id);
    return item ? { ...item } : null;
  }

  async getStaffByEmployeeCode(employeeCode: string): Promise<Staff | null> {
    const cleanCode = employeeCode.trim().toLowerCase();
    const item = db.staff.find((s: Staff) => s.employeeCode.trim().toLowerCase() === cleanCode);
    return item ? { ...item } : null;
  }

  async createStaff(
    data: Omit<Staff, "id" | "createdAt" | "updatedAt"> & { id?: string },
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<Staff> {
    if (!data.fullName || !data.fullName.trim()) {
      throw new Error("Nama staff wajib diisi");
    }

    if (!data.employeeCode || !data.employeeCode.trim()) {
      throw new Error("Kode staff wajib diisi");
    }

    const nik = data.nik?.trim() || null;
    if (nik && !/^\d{16}$/.test(nik)) {
      throw new Error("NIK harus terdiri dari 16 digit angka");
    }
    if (nik && db.staff.some((s: Staff) => s.nik === nik)) {
      throw new Error("NIK sudah terdaftar");
    }

    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId) {
      if (data.branchId && data.branchId !== userBranchId) {
        throw new Error("Branch Admin hanya dapat mendaftarkan staff untuk cabangnya sendiri");
      }
    }

    const cleanCode = data.employeeCode.trim().toLowerCase();
    const existing = db.staff.find((s: Staff) => s.employeeCode.trim().toLowerCase() === cleanCode);
    if (existing) {
      throw new Error("Kode staff sudah terdaftar");
    }

    const now = new Date().toISOString();
    const active = data.active ?? (data.employmentStatus !== EmploymentStatus.INACTIVE);
    const employmentStatus = data.employmentStatus || (active ? EmploymentStatus.ACTIVE : EmploymentStatus.INACTIVE);

    const newStaff: Staff = {
      id: data.id || `staff-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      employeeCode: data.employeeCode.trim(),
      nik,
      fullName: data.fullName.trim(),
      phone: data.phone || "",
      position: data.position || StaffPosition.OTHER,
      employmentStatus,
      joinDate: data.joinDate || now.split("T")[0],
      active,
      notes: data.notes,
      branchId: data.branchId || (currentUserRole === UserRole.BRANCH_ADMIN ? userBranchId : null),
      userAccountId: data.userAccountId || null,
      createdAt: now,
      updatedAt: now
    };

    db.staff.push(newStaff);
    db.saveToStorage();
    return { ...newStaff };
  }

  async updateStaff(
    id: string,
    updates: Partial<Omit<Staff, "id" | "createdAt" | "updatedAt">>,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<Staff> {
    const index = db.staff.findIndex((s: Staff) => s.id === id);
    if (index === -1) {
      throw new Error("Staff tidak ditemukan");
    }

    const current = db.staff[index];
    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId) {
      if (current.branchId && current.branchId !== userBranchId) {
        throw new Error("Branch Admin tidak memiliki akses mengubah staff di cabang lain");
      }
    }

    if (updates.employeeCode) {
      const cleanCode = updates.employeeCode.trim().toLowerCase();
      const existing = db.staff.find(
        (s: Staff) => s.id !== id && s.employeeCode.trim().toLowerCase() === cleanCode
      );
      if (existing) {
        throw new Error("Kode staff sudah terdaftar");
      }
    }

    if (updates.nik !== undefined) {
      const nik = updates.nik?.trim() || null;
      if (nik && !/^\d{16}$/.test(nik)) {
        throw new Error("NIK harus terdiri dari 16 digit angka");
      }
      if (nik && db.staff.some((s: Staff) => s.id !== id && s.nik === nik)) {
        throw new Error("NIK sudah terdaftar");
      }
      updates = { ...updates, nik };
    }

    let active = current.active;
    let employmentStatus = current.employmentStatus;

    if (updates.active !== undefined) {
      active = updates.active;
      employmentStatus = active ? EmploymentStatus.ACTIVE : EmploymentStatus.INACTIVE;
    }
    if (updates.employmentStatus !== undefined) {
      employmentStatus = updates.employmentStatus;
      active = employmentStatus === EmploymentStatus.ACTIVE;
    }

    const updated: Staff = {
      ...current,
      ...updates,
      active,
      employmentStatus,
      updatedAt: new Date().toISOString()
    };

    db.staff[index] = updated;
    return { ...updated };
  }

  async deactivateStaff(
    id: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<Staff> {
    return this.updateStaff(
      id,
      {
        active: false,
        employmentStatus: EmploymentStatus.INACTIVE
      },
      currentUserRole,
      userBranchId
    );
  }

  async deleteStaff(
    id: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<boolean> {
    const index = db.staff.findIndex((s: Staff) => s.id === id);
    if (index === -1) return false;

    const current = db.staff[index];
    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId && current.branchId && current.branchId !== userBranchId) {
      throw new Error("Branch Admin tidak memiliki akses menghapus staff di cabang lain");
    }

    db.staff.splice(index, 1);
    if (current.userAccountId) {
      db.userAccounts = db.userAccounts.filter((u) => u.id !== current.userAccountId);
    }
    db.saveToStorage();
    return true;
  }
}

export class MockDoctorScheduleRepository implements DoctorScheduleRepository {
  async getSchedules(
    filter?: ScheduleFilter,
    currentUserRole?: UserRole,
    userBranchId?: string | null,
    currentDoctorId?: string | null
  ): Promise<DoctorSchedule[]> {
    return db.doctorSchedules
      .filter((s: DoctorSchedule) => {
        // Branch Admin isolation with flexible branch matching
        if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId) {
          if (!isBranchMatch(s.branchId, userBranchId, db.branches)) return false;
        }

        // Doctor isolation
        if (currentUserRole === UserRole.DOCTOR && currentDoctorId) {
          if (s.doctorId !== currentDoctorId) return false;
        }

        if (filter?.date && s.date !== filter.date) return false;
        if (filter?.dateFrom && s.date < filter.dateFrom) return false;
        if (filter?.dateTo && s.date > filter.dateTo) return false;
        if (filter?.branchId && !isBranchMatch(s.branchId, filter.branchId, db.branches)) return false;
        if (filter?.doctorId && s.doctorId !== filter.doctorId) return false;
        if (filter?.status && s.status !== filter.status) return false;

        return true;
      })
      .map((s: DoctorSchedule) => ({ ...s }));
  }

  async getScheduleById(id: string): Promise<DoctorSchedule | null> {
    const item = db.doctorSchedules.find((s: DoctorSchedule) => s.id === id);
    return item ? { ...item } : null;
  }

  async createSchedule(
    data: Omit<DoctorSchedule, "id" | "createdAt" | "updatedAt"> & { id?: string },
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<DoctorSchedule> {
    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId && !isBranchMatch(data.branchId, userBranchId, db.branches)) {
      throw new Error("Branch Admin hanya dapat membuat jadwal untuk cabangnya sendiri");
    }

    // 1. Validasi Jam Mulai dan Selesai
    if (data.startTime >= data.endTime) {
      throw new Error("Waktu mulai harus lebih awal dari waktu selesai");
    }

    // 2. Validasi Keberadaan dan Keaktifan Dokter (Multi-Source Resolver)
    let doctor = db.doctors.find((d: DentalDoctor) => d.id === data.doctorId);
    if (!doctor) {
      doctor = db.doctors.find(
        (d: DentalDoctor) => d.doctorCode && data.doctorId && d.doctorCode.toLowerCase() === data.doctorId.toLowerCase()
      );
    }
    // Check localStorage "lala_doctors" (where Supabase or runtime doctors are cached)
    if (!doctor && typeof window !== "undefined") {
      try {
        const savedDocsStr = localStorage.getItem("lala_doctors");
        if (savedDocsStr) {
          const parsed: DentalDoctor[] = JSON.parse(savedDocsStr);
          if (Array.isArray(parsed)) {
            const foundInStorage = parsed.find(
              (d) =>
                d.id === data.doctorId ||
                (d.doctorCode && d.doctorCode.toLowerCase() === data.doctorId.toLowerCase()) ||
                (d.name && d.name.toLowerCase() === data.doctorId.toLowerCase())
            );
            if (foundInStorage) {
              doctor = foundInStorage;
              if (!db.doctors.some((d: DentalDoctor) => d.id === foundInStorage.id)) {
                db.doctors.push(foundInStorage);
              }
            }
          }
        }
      } catch (e) {}
    }
    // Check MOCK_DOCTORS fallback
    if (!doctor) {
      const foundInMock = MOCK_DOCTORS.find(
        (d) =>
          d.id === data.doctorId ||
          (d.doctorCode && d.doctorCode.toLowerCase() === data.doctorId.toLowerCase()) ||
          d.id.includes(data.doctorId) ||
          data.doctorId.includes(d.id)
      );
      if (foundInMock) {
        doctor = foundInMock;
        if (!db.doctors.some((d: DentalDoctor) => d.id === foundInMock.id)) {
          db.doctors.push(foundInMock);
        }
      }
    }
    // Check by partial name or clean string matching
    if (!doctor && data.doctorId) {
      const cleanTarget = data.doctorId.toLowerCase().replace(/[^a-z0-9]/g, "");
      doctor = db.doctors.find((d: DentalDoctor) => {
        const cleanName = (d.name || d.fullName || "").toLowerCase().replace(/[^a-z0-9]/g, "");
        const cleanId = (d.id || "").toLowerCase().replace(/[^a-z0-9]/g, "");
        return (cleanName && (cleanName.includes(cleanTarget) || cleanTarget.includes(cleanName))) ||
               (cleanId && (cleanId.includes(cleanTarget) || cleanTarget.includes(cleanId)));
      });
    }

    // Self-healing: if doctor ID was provided from frontend, register it into db.doctors
    if (!doctor && data.doctorId) {
      const newDoc: DentalDoctor = {
        id: data.doctorId,
        doctorCode: `DOC-${data.doctorId.substring(0, 8).toUpperCase()}`,
        name: "drg. Dokter",
        fullName: "drg. Dokter",
        specialization: "Dokter Gigi Umum",
        phone: "081234567890",
        active: true,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      db.doctors.push(newDoc);
      doctor = newDoc;
    }

    if (!doctor) {
      throw new Error("Dokter tidak ditemukan");
    }
    const isDoctorActive = doctor.active ?? doctor.isActive ?? true;
    if (!isDoctorActive) {
      throw new Error("Dokter berstatus tidak aktif tidak dapat dijadwalkan");
    }

    // 3. Validasi Keberadaan Cabang (Multi-Source Resolver)
    let branch = db.branches.find((b: DentalBranch) => b.id === data.branchId);
    if (!branch) {
      branch = db.branches.find(
        (b: DentalBranch) => b.branchCode && data.branchId && b.branchCode.toLowerCase() === data.branchId.toLowerCase()
      );
    }
    if (!branch) {
      const foundMockBranch = MOCK_BRANCHES.find(
        (b) =>
          b.id === data.branchId ||
          (b.branchCode && b.branchCode.toLowerCase() === data.branchId.toLowerCase()) ||
          (b.name && b.name.toLowerCase().includes(data.branchId.toLowerCase()))
      );
      if (foundMockBranch) {
        branch = foundMockBranch;
        if (!db.branches.some((b: DentalBranch) => b.id === foundMockBranch.id)) {
          db.branches.push(foundMockBranch);
        }
      }
    }
    if (!branch && data.branchId) {
      branch = db.branches[0] || MOCK_BRANCHES[0];
    }
    if (!branch) {
      throw new Error("Cabang tidak valid");
    }

    // 4. Validasi Bentrok Jadwal Dokter (Overlapping Time Slots on the Same Date)
    // Dua rentang [startA, endA) dan [startB, endB) bentrok jika startA < endB && startB < endA
    const activeDoctorSchedulesOnDate = db.doctorSchedules.filter(
      (s: DoctorSchedule) =>
        s.doctorId === data.doctorId &&
        s.date === data.date &&
        s.status === ScheduleStatus.ACTIVE
    );

    const hasConflict = activeDoctorSchedulesOnDate.some((existing: DoctorSchedule) => {
      return data.startTime < existing.endTime && existing.startTime < data.endTime;
    });

    if (hasConflict) {
      throw new Error("Jadwal dokter bentrok dengan jadwal aktif yang sudah ada pada waktu tersebut");
    }

    const now = new Date().toISOString();
    const newSchedule: DoctorSchedule = {
      id: data.id || `sched-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      doctorId: data.doctorId,
      branchId: data.branchId,
      date: data.date,
      startTime: data.startTime,
      endTime: data.endTime,
      status: data.status || ScheduleStatus.ACTIVE,
      notes: data.notes,
      createdAt: now,
      updatedAt: now
    };

    db.doctorSchedules.push(newSchedule);
    db.saveToStorage();
    return { ...newSchedule };
  }

  async updateSchedule(
    id: string,
    updates: Partial<Omit<DoctorSchedule, "id" | "createdAt" | "updatedAt">>,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<DoctorSchedule> {
    const index = db.doctorSchedules.findIndex((s: DoctorSchedule) => s.id === id);
    if (index === -1) {
      throw new Error("Jadwal dokter tidak ditemukan");
    }

    const current = db.doctorSchedules[index];
    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId && !isBranchMatch(current.branchId, userBranchId, db.branches)) {
      throw new Error("Branch Admin tidak memiliki akses mengubah jadwal di cabang lain");
    }
    if (updates.branchId && currentUserRole === UserRole.BRANCH_ADMIN && userBranchId && !isBranchMatch(updates.branchId, userBranchId, db.branches)) {
      throw new Error("Branch Admin tidak memiliki akses mengubah jadwal ke cabang lain");
    }

    const startTime = updates.startTime || current.startTime;
    const endTime = updates.endTime || current.endTime;
    const date = updates.date || current.date;
    const doctorId = updates.doctorId || current.doctorId;
    const status = updates.status || current.status;

    if (startTime >= endTime) {
      throw new Error("Waktu mulai harus lebih awal dari waktu selesai");
    }

    // Overlap collision check if schedule is ACTIVE
    if (status === ScheduleStatus.ACTIVE) {
      const activeDoctorSchedulesOnDate = db.doctorSchedules.filter(
        (s: DoctorSchedule) =>
          s.id !== id &&
          s.doctorId === doctorId &&
          s.date === date &&
          s.status === ScheduleStatus.ACTIVE
      );

      const hasConflict = activeDoctorSchedulesOnDate.some((existing: DoctorSchedule) => {
        return startTime < existing.endTime && existing.startTime < endTime;
      });

      if (hasConflict) {
        throw new Error("Jadwal dokter bentrok dengan jadwal aktif yang sudah ada pada waktu tersebut");
      }
    }

    const updated: DoctorSchedule = {
      ...current,
      ...updates,
      startTime,
      endTime,
      date,
      doctorId,
      status,
      updatedAt: new Date().toISOString()
    };

    db.doctorSchedules[index] = updated;
    db.saveToStorage();
    return { ...updated };
  }

  async cancelSchedule(
    id: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<DoctorSchedule> {
    const index = db.doctorSchedules.findIndex((s: DoctorSchedule) => s.id === id);
    if (index === -1) {
      throw new Error("Jadwal dokter tidak ditemukan");
    }

    const current = db.doctorSchedules[index];
    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId && current.branchId !== userBranchId) {
      throw new Error("Branch Admin tidak memiliki akses membatalkan jadwal di cabang lain");
    }

    const updated: DoctorSchedule = {
      ...current,
      status: ScheduleStatus.CANCELLED,
      updatedAt: new Date().toISOString()
    };

    db.doctorSchedules[index] = updated;
    db.saveToStorage();
    return { ...updated };
  }
}

export class MockWorkShiftRepository implements WorkShiftRepository {
  async getShifts(branchId?: string): Promise<WorkShift[]> {
    return db.workShifts
      .filter((w: WorkShift) => !branchId || w.branchId === branchId)
      .map((w: WorkShift) => ({ ...w }));
  }

  async getShiftById(id: string): Promise<WorkShift | null> {
    const item = db.workShifts.find((w: WorkShift) => w.id === id);
    return item ? { ...item } : null;
  }

  async createShift(data: Omit<WorkShift, "id" | "createdAt" | "updatedAt"> & { id?: string }): Promise<WorkShift> {
    if (data.startTime >= data.endTime) {
      throw new Error("Waktu mulai harus lebih awal dari waktu selesai");
    }

    const now = new Date().toISOString();
    const newShift: WorkShift = {
      id: data.id || `shift-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      branchId: data.branchId,
      name: data.name,
      startTime: data.startTime,
      endTime: data.endTime,
      active: data.active ?? true,
      notes: data.notes,
      createdAt: now,
      updatedAt: now
    };

    db.workShifts.push(newShift);
    return { ...newShift };
  }

  async updateShift(
    id: string,
    updates: Partial<Omit<WorkShift, "id" | "createdAt" | "updatedAt">>
  ): Promise<WorkShift> {
    const index = db.workShifts.findIndex((w: WorkShift) => w.id === id);
    if (index === -1) {
      throw new Error("Shift tidak ditemukan");
    }

    const current = db.workShifts[index];
    const startTime = updates.startTime || current.startTime;
    const endTime = updates.endTime || current.endTime;

    if (startTime >= endTime) {
      throw new Error("Waktu mulai harus lebih awal dari waktu selesai");
    }

    const updated: WorkShift = {
      ...current,
      ...updates,
      startTime,
      endTime,
      updatedAt: new Date().toISOString()
    };

    db.workShifts[index] = updated;
    return { ...updated };
  }
}

export class MockStaffShiftAssignmentRepository implements StaffShiftAssignmentRepository {
  async getAssignments(
    filter?: StaffShiftAssignmentFilter,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<StaffShiftAssignment[]> {
    return db.staffShiftAssignments
      .filter((a: StaffShiftAssignment) => {
        if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId) {
          if (a.branchId !== userBranchId) return false;
        }

        if (filter?.date && a.date !== filter.date) return false;
        if (filter?.branchId && a.branchId !== filter.branchId) return false;
        if (filter?.staffId && a.staffId !== filter.staffId) return false;

        return true;
      })
      .map((a: StaffShiftAssignment) => ({ ...a }));
  }

  async getAssignmentById(id: string): Promise<StaffShiftAssignment | null> {
    const item = db.staffShiftAssignments.find((a: StaffShiftAssignment) => a.id === id);
    return item ? { ...item } : null;
  }

  async assignStaffShift(
    data: Omit<StaffShiftAssignment, "id" | "createdAt" | "updatedAt"> & { id?: string },
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<StaffShiftAssignment> {
    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId && data.branchId !== userBranchId) {
      throw new Error("Branch Admin hanya dapat menugaskan shift untuk cabangnya sendiri");
    }

    // Validate staff exists and is active
    const staff = db.staff.find((s: Staff) => s.id === data.staffId);
    if (!staff) {
      throw new Error("Staff tidak ditemukan");
    }
    if (!staff.active || staff.employmentStatus === EmploymentStatus.INACTIVE) {
      throw new Error("Staff berstatus tidak aktif tidak dapat ditugaskan shift");
    }

    const hasCustomShiftDetails = Boolean(data.customShiftName || data.customStartTime || data.customEndTime);
    if (
      (!data.shiftId && (
        !data.customShiftName?.trim() ||
        !/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(data.customStartTime || "") ||
        !/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(data.customEndTime || "") ||
        (data.customEndTime || "") <= (data.customStartTime || "")
      )) ||
      (data.shiftId && hasCustomShiftDetails)
    ) {
      throw new Error("Jadwal custom harus memiliki nama dan jam valid tanpa shift master.");
    }

    const now = new Date().toISOString();
    const newAssignment: StaffShiftAssignment = {
      id: data.id || `ssa-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      staffId: data.staffId,
      branchId: data.branchId,
      shiftId: data.shiftId,
      customShiftName: data.customShiftName,
      customStartTime: data.customStartTime,
      customEndTime: data.customEndTime,
      date: data.date,
      active: data.active ?? true,
      notes: data.notes,
      createdAt: now,
      updatedAt: now
    };

    db.staffShiftAssignments.push(newAssignment);
    return { ...newAssignment };
  }

  async updateAssignment(
    id: string,
    updates: Partial<Omit<StaffShiftAssignment, "id" | "createdAt" | "updatedAt">>,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<StaffShiftAssignment> {
    const index = db.staffShiftAssignments.findIndex((a: StaffShiftAssignment) => a.id === id);
    if (index === -1) {
      throw new Error("Penugasan shift tidak ditemukan");
    }

    const current = db.staffShiftAssignments[index];
    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId && current.branchId !== userBranchId) {
      throw new Error("Branch Admin tidak memiliki akses mengubah penugasan shift di cabang lain");
    }

    const updated: StaffShiftAssignment = {
      ...current,
      ...updates,
      updatedAt: new Date().toISOString()
    };

    db.staffShiftAssignments[index] = updated;
    return { ...updated };
  }

  async removeAssignment(
    id: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<void> {
    const index = db.staffShiftAssignments.findIndex((a: StaffShiftAssignment) => a.id === id);
    if (index !== -1) {
      const current = db.staffShiftAssignments[index];
      if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId && current.branchId !== userBranchId) {
        throw new Error("Branch Admin tidak memiliki akses menghapus penugasan shift di cabang lain");
      }
      db.staffShiftAssignments.splice(index, 1);
    }
  }

  async getRotationTemplates(branchId: string): Promise<StaffShiftRotationTemplate[]> {
    return db.staffShiftRotationTemplates
      .filter((template) => template.branchId === branchId)
      .map((template) => ({ ...template }));
  }

  async saveMonthlyRoster(
    branchId: string,
    rotationAnchorMonday: string,
    templates: StaffShiftRotationTemplate[],
    assignments: Array<Pick<StaffShiftAssignment, "staffId" | "branchId" | "shiftId" | "date" | "active" | "notes">>
  ): Promise<number> {
    const savedAt = new Date().toISOString();
    const currentTemplates = db.staffShiftRotationTemplates.filter((template) => template.branchId !== branchId);
    db.staffShiftRotationTemplates = [
      ...currentTemplates,
      ...templates.map((template) => ({
        ...template,
        branchId,
        rotationAnchorMonday
      }))
    ];

    for (const assignment of assignments) {
      const existing = db.staffShiftAssignments.find((item) =>
        item.branchId === branchId &&
        item.staffId === assignment.staffId &&
        item.date === assignment.date
      );
      if (existing) {
        Object.assign(existing, assignment, { updatedAt: savedAt });
      } else {
        db.staffShiftAssignments.push({
          ...assignment,
          id: `ssa-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
          createdAt: savedAt,
          updatedAt: savedAt
        });
      }
    }
    return assignments.length;
  }
}

export class MockBookingRepository implements BookingRepository {
  async getBookings(currentUserRole?: UserRole, userBranchId?: string | null): Promise<Booking[]> {
    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId) {
      return db.bookings.filter((b) => b.branchId === userBranchId).map((b) => ({ ...b }));
    }
    return db.bookings.map((b) => ({ ...b }));
  }

  async getBookingById(
    id: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<Booking | null> {
    const booking = db.bookings.find((b) => b.id === id);
    if (!booking) return null;

    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId && booking.branchId !== userBranchId) {
      throw new Error("Branch Admin tidak memiliki akses melihat booking di cabang lain");
    }

    return { ...booking };
  }

  async getBookingsByBranch(
    branchId: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<Booking[]> {
    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId && branchId !== userBranchId) {
      throw new Error("Branch Admin tidak memiliki akses melihat booking di cabang lain");
    }
    return db.bookings.filter((b) => b.branchId === branchId).map((b) => ({ ...b }));
  }

  async getBookingsByPatient(patientId: string): Promise<Booking[]> {
    return db.bookings.filter((b) => b.patientId === patientId).map((b) => ({ ...b }));
  }

  async getBookingsByDate(
    dateStr: string,
    branchId?: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<Booking[]> {
    return db.bookings
      .filter((b) => {
        const matchesDate = b.bookingDateTime.startsWith(dateStr);
        if (!matchesDate) return false;

        if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId) {
          if (b.branchId !== userBranchId) return false;
        } else if (branchId) {
          if (b.branchId !== branchId) return false;
        }
        return true;
      })
      .map((b) => ({ ...b }));
  }

  async getPatientAvailableBookingSlots(branchId: string, doctorId: string, operationalDate: string): Promise<string[]> {
    const schedule = db.doctorSchedules.find((item) =>
      item.branchId === branchId && item.doctorId === doctorId && item.date === operationalDate && item.status === ScheduleStatus.ACTIVE
    );
    const now = new Date(AppClock.nowISO()).getTime();

    return getScheduledBookingTimeSlots(schedule).filter((slot) => {
      const startAt = new Date(toOperationalDateTime(`${operationalDate}T00:00:00+07:00`, slot)).getTime();
      const endAt = startAt + 30 * 60_000;
      if (startAt <= now) return false;

      const hasBookingConflict = db.bookings.some((booking) => {
        if (
          booking.branchId !== branchId ||
          booking.doctorId !== doctorId ||
          ![BookingStatus.PENDING, BookingStatus.CONFIRMED].includes(booking.status)
        ) return false;
        const bookingStart = new Date(booking.bookingDateTime).getTime();
        const bookingEnd = bookingStart + getPlannedTreatmentDurationMinutes(booking.plannedTreatments || [], 30) * 60_000;
        return startAt < bookingEnd && bookingStart < endAt;
      });
      if (hasBookingConflict) return false;

      return !db.queueItems.some((queue) => {
        if (
          queue.branchId !== branchId ||
          queue.doctorId !== doctorId ||
          !["WAITING", "IN_PREPARATION", "IN_CONSULTATION", "CALLING"].includes(queue.status) ||
          getOperationalDateString(queue.arrivalAt) !== operationalDate
        ) return false;
        const queueStart = new Date(queue.actualServiceStartAt || queue.estimatedServiceAt || queue.arrivalAt).getTime();
        const queueEnd = queueStart + Math.max(1, queue.estimatedDurationMinutes) * 60_000;
        return startAt < queueEnd && queueStart < endAt;
      });
    });
  }

  async confirmPatientEnRoute(bookingId: string): Promise<string> {
    const booking = db.bookings.find((item) => item.id === bookingId);
    if (!booking || ![BookingStatus.PENDING, BookingStatus.CONFIRMED].includes(booking.status)) {
      throw new Error("Janji temu aktif tidak ditemukan.");
    }
    const confirmedAt = AppClock.nowISO();
    booking.enRouteConfirmedAt = confirmedAt;
    booking.updatedAt = confirmedAt;
    db.saveToStorage();
    return confirmedAt;
  }

  async requestLateCheckInConfirmation(bookingId: string): Promise<string> {
    const booking = db.bookings.find((item) => item.id === bookingId);
    if (!booking || ![BookingStatus.PENDING, BookingStatus.CONFIRMED].includes(booking.status)) {
      throw new Error("Janji temu aktif tidak ditemukan.");
    }
    const requestedAt = AppClock.nowISO();
    booking.lateCheckInRequestedAt = requestedAt;
    booking.updatedAt = requestedAt;
    db.saveToStorage();
    return requestedAt;
  }

  async getPatientQueueEstimate(bookingId: string) {
    const booking = db.bookings.find((item) => item.id === bookingId);
    if (!booking) throw new Error("Janji temu tidak ditemukan.");
    const now = AppClock.nowISO();
    const queueBefore = db.queueItems.filter((item) =>
      item.branchId === booking.branchId
      && item.doctorId === booking.doctorId
      && item.bookingId !== bookingId
      && item.arrivalAt <= booking.bookingDateTime
      && item.status !== QueueStatus.COMPLETED
      && item.status !== QueueStatus.SKIPPED
      && item.status !== "CANCELLED"
    );
    const bookedBefore = db.bookings.filter((item) =>
      item.id !== bookingId
      && item.branchId === booking.branchId
      && item.doctorId === booking.doctorId
      && item.bookingDateTime < booking.bookingDateTime
      && [BookingStatus.PENDING, BookingStatus.CONFIRMED].includes(item.status)
      && !db.queueItems.some((queueItem) =>
        queueItem.bookingId === item.id
        && queueItem.status !== QueueStatus.COMPLETED
        && queueItem.status !== QueueStatus.SKIPPED
        && queueItem.status !== "CANCELLED"
      )
    );
    const queueFinishTimes = queueBefore.map((item) => {
      const start = new Date(item.estimatedServiceAt || item.arrivalAt).getTime();
      return start + Math.max(0, item.estimatedDurationMinutes) * 60_000;
    }).filter(Number.isFinite);
    const bookedDuration = bookedBefore.reduce((sum, item) =>
      sum + (item.plannedTreatments?.reduce((duration, treatment) => duration + treatment.estimatedDurationMinutes, 0) || 30), 0);
    const queueFinish = Math.max(Date.parse(now), ...queueFinishTimes) + bookedDuration * 60_000;
    return {
      patientsAhead: queueBefore.length + bookedBefore.length,
      estimatedServiceAt: new Date(Math.max(Date.parse(booking.bookingDateTime), queueFinish)).toISOString(),
      refreshedAt: now
    };
  }

  async createBooking(
    bookingData: Omit<Booking, "id" | "status" | "createdAt" | "updatedAt"> & {
      id?: string;
      status?: BookingStatus;
      source?: BookingSource;
      channel?: BookingSource;
    },
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<Booking> {
    // 1. Patient validation
    if (!bookingData.patientId) {
      throw new Error("Patient ID wajib diisi");
    }
    const patient = db.patients.find((p) => p.id === bookingData.patientId);
    if (!patient) {
      throw new Error("Pasien tidak ditemukan dalam Master Patient Profile");
    }

    // 2. Branch validation
    if (!bookingData.branchId) {
      throw new Error("Branch ID wajib diisi");
    }
    const branch = db.branches.find((b) => b.id === bookingData.branchId);
    if (!branch) {
      throw new Error("Cabang tidak ditemukan dalam sistem");
    }

    // 3. Doctor validation
    if (!bookingData.doctorId) {
      throw new Error("Dokter wajib diisi");
    }
    const doctor = db.doctors.find((d) => d.id === bookingData.doctorId);
    if (!doctor) {
      throw new Error("Dokter tidak ditemukan dalam sistem");
    }

    // 4. Date & time validation
    if (!bookingData.bookingDateTime || isNaN(new Date(bookingData.bookingDateTime).getTime())) {
      throw new Error("Tanggal dan jam booking wajib valid");
    }

    // 5. Branch security
    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId && bookingData.branchId !== userBranchId) {
      throw new Error("Branch Admin tidak dapat membuat booking untuk cabang lain");
    }
    if (bookingData.referringStaffId) {
      const referringStaff = db.staff.find((staff) =>
        staff.id === bookingData.referringStaffId &&
        staff.active &&
        staff.employmentStatus === "ACTIVE" &&
        (staff.position === StaffPosition.BRANCH_ADMIN || staff.position === StaffPosition.ASSISTANT)
      );
      if (!referringStaff) {
        throw new Error("Staf referral harus admin atau asisten aktif.");
      }
    }

    const bookingDate = bookingData.bookingDateTime.slice(0, 10);
    const existingPatientBooking = db.bookings.find((booking) =>
      booking.patientId === bookingData.patientId &&
      booking.branchId === bookingData.branchId &&
      booking.bookingDateTime.slice(0, 10) === bookingDate &&
      (booking.status === BookingStatus.PENDING || booking.status === BookingStatus.CONFIRMED)
    );

    if (existingPatientBooking) {
      throw new Error("Pasien sudah memiliki booking aktif di cabang ini pada tanggal tersebut");
    }

    // 6. Slot conflict validation (Section 22)
    const requestedStart = new Date(bookingData.bookingDateTime).getTime();
    const requestedDuration = getPlannedTreatmentDurationMinutes(bookingData.plannedTreatments || [], 30);
    const requestedEnd = requestedStart + requestedDuration * 60_000;
    const existingConflict = db.bookings.find((b) => {
      if (b.status !== BookingStatus.PENDING && b.status !== BookingStatus.CONFIRMED) return false;
      if (b.doctorId !== bookingData.doctorId || b.branchId !== bookingData.branchId) return false;
      const bookedStart = new Date(b.bookingDateTime).getTime();
      if (!Number.isFinite(bookedStart) || !Number.isFinite(requestedStart)) return false;
      const bookedDuration = getPlannedTreatmentDurationMinutes(b.plannedTreatments || [], 30);
      return requestedStart < bookedStart + bookedDuration * 60_000 && bookedStart < requestedEnd;
    });

    if (existingConflict) {
      throw new Error("Jadwal dokter bertabrakan dengan booking aktif lain di cabang ini");
    }

    const now = new Date().toISOString();
    const source = bookingData.source || bookingData.channel || BookingSource.FRONT_DESK;
    const newBooking: Booking = {
      id: bookingData.id || `booking-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      patientId: bookingData.patientId,
      branchId: bookingData.branchId,
      doctorId: bookingData.doctorId,
      serviceId: bookingData.serviceId,
      bookingDateTime: bookingData.bookingDateTime,
      timeSlot: bookingData.timeSlot || bookingData.bookingDateTime.split("T")[1]?.substring(0, 5),
      notes: bookingData.notes || bookingData.complaint || "",
      complaint: bookingData.complaint || bookingData.notes || "",
      patientNameSnapshot: patient.fullName || patient.name,
      doctorNameSnapshot: doctor.name,
      branchNameSnapshot: branch.name,
      referringStaffId: bookingData.referringStaffId || null,
      source,
      channel: source,
      rescheduledFromBookingId: bookingData.rescheduledFromBookingId,
      rescheduleReason: bookingData.rescheduleReason,
      status: bookingData.status || BookingStatus.PENDING,
      scheduleVerified: bookingData.scheduleVerified !== undefined ? bookingData.scheduleVerified : true,
      plannedTreatments: bookingData.plannedTreatments || [],
      createdAt: now,
      updatedAt: now
    };

    db.bookings.push(newBooking);

    // Automatically initialize default H-1 Confirmation
    const existingConfIndex = db.confirmations.findIndex((c) => c.bookingId === newBooking.id);
    if (existingConfIndex === -1) {
      db.confirmations.push({
        id: `conf-${newBooking.id}`,
        bookingId: newBooking.id,
        confirmationStatus: ConfirmationStatusH1.BELUM_DIHUBUNGI,
        status: ConfirmationStatusH1.BELUM_DIHUBUNGI,
        createdAt: now,
        updatedAt: now
      });
    }

    db.saveToStorage();
    return { ...newBooking };
  }

  async updateBooking(
    id: string,
    updates: Partial<Omit<Booking, "id" | "createdAt" | "updatedAt">>,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<Booking> {
    const index = db.bookings.findIndex((b) => b.id === id);
    if (index === -1) {
      throw new Error("Booking tidak ditemukan");
    }

    const existing = db.bookings[index];

    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId && existing.branchId !== userBranchId) {
      throw new Error("Branch Admin tidak dapat mengubah booking cabang lain");
    }

    const now = new Date().toISOString();
    const updated: Booking = {
      ...existing,
      ...updates,
      updatedAt: now
    };

    db.bookings[index] = updated;
    return { ...updated };
  }

  async cancelBooking(
    id: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<Booking> {
    const index = db.bookings.findIndex((b) => b.id === id);
    if (index === -1) {
      throw new Error("Booking tidak ditemukan");
    }

    const existing = db.bookings[index];

    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId && existing.branchId !== userBranchId) {
      throw new Error("Branch Admin tidak dapat membatalkan booking cabang lain");
    }

    const now = new Date().toISOString();
    const updated: Booking = {
      ...existing,
      status: BookingStatus.CANCELLED,
      updatedAt: now
    };

    db.bookings[index] = updated;
    return { ...updated };
  }
}

export class MockH1ConfirmationRepository implements H1ConfirmationRepository {
  async getH1Confirmation(bookingId: string): Promise<BookingConfirmationH1 | null> {
    let conf = db.confirmations.find((c) => c.bookingId === bookingId);
    if (!conf) {
      const now = new Date().toISOString();
      conf = {
        id: `conf-${bookingId}`,
        bookingId,
        confirmationStatus: ConfirmationStatusH1.BELUM_DIHUBUNGI,
        status: ConfirmationStatusH1.BELUM_DIHUBUNGI,
        createdAt: now,
        updatedAt: now
      };
      db.confirmations.push(conf);
    }
    return { ...conf };
  }

  async listH1Confirmations(
    branchId?: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<BookingConfirmationH1[]> {
    return db.confirmations
      .filter((conf) => {
        const bk = db.bookings.find((b) => b.id === conf.bookingId);
        if (!bk) return false;

        if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId) {
          if (bk.branchId !== userBranchId) return false;
        } else if (branchId) {
          if (bk.branchId !== branchId) return false;
        }
        return true;
      })
      .map((c) => ({ ...c }));
  }

  async createOrInitializeH1Confirmation(bookingId: string, staffId?: string): Promise<BookingConfirmationH1> {
    let conf = db.confirmations.find((c) => c.bookingId === bookingId);
    const now = new Date().toISOString();
    if (!conf) {
      conf = {
        id: `conf-${bookingId}`,
        bookingId,
        confirmationStatus: ConfirmationStatusH1.BELUM_DIHUBUNGI,
        status: ConfirmationStatusH1.BELUM_DIHUBUNGI,
        staffId,
        contactByStaffId: staffId,
        createdAt: now,
        updatedAt: now
      };
      db.confirmations.push(conf);
    }
    return { ...conf };
  }

  async updateH1Confirmation(
    bookingId: string,
    updates: Partial<Omit<BookingConfirmationH1, "id" | "bookingId" | "createdAt" | "updatedAt">>,
    staffId?: string
  ): Promise<BookingConfirmationH1> {
    let index = db.confirmations.findIndex((c) => c.bookingId === bookingId);
    const now = new Date().toISOString();

    if (index === -1) {
      const newConf: BookingConfirmationH1 = {
        id: `conf-${bookingId}`,
        bookingId,
        confirmationStatus: updates.confirmationStatus || updates.status || ConfirmationStatusH1.BELUM_DIHUBUNGI,
        status: updates.status || updates.confirmationStatus || ConfirmationStatusH1.BELUM_DIHUBUNGI,
        staffId,
        contactByStaffId: staffId,
        createdAt: now,
        updatedAt: now
      };
      db.confirmations.push(newConf);
      index = db.confirmations.length - 1;
    }

    const existing = db.confirmations[index];
    const newStatus = updates.confirmationStatus || updates.status || existing.status;

    let contactedAt = updates.contactedAt || updates.calledAt || existing.contactedAt || existing.calledAt;
    let confirmedAt = updates.confirmedAt || existing.confirmedAt;

    if (newStatus === ConfirmationStatusH1.SUDAH_DIHUBUNGI && !contactedAt) {
      contactedAt = now;
    }
    if (newStatus === ConfirmationStatusH1.DIKONFIRMASI && !confirmedAt) {
      confirmedAt = now;
      if (!contactedAt) contactedAt = now;
    }

    const updated: BookingConfirmationH1 = {
      ...existing,
      ...updates,
      confirmationStatus: newStatus,
      status: newStatus,
      calledAt: contactedAt,
      contactedAt,
      confirmedAt,
      staffId: staffId || updates.staffId || existing.staffId,
      contactByStaffId: staffId || updates.contactByStaffId || existing.contactByStaffId,
      notes: updates.notes !== undefined ? updates.notes : existing.notes,
      updatedAt: now
    };

    db.confirmations[index] = updated;
    return { ...updated };
  }
}

export class MockVisitRepository implements VisitRepository {
  async getVisits(): Promise<PatientVisit[]> {
    return [...db.visits];
  }

  async getVisitAnalyticsRecords() {
    return db.visits.map(({ patientId, visitDateTime, visitStatus }) => ({
      patientId,
      visitDateTime,
      visitStatus
    }));
  }

  async getVisitById(id: string): Promise<PatientVisit | null> {
    const visit = db.visits.find((v) => v.id === id);
    return visit ? { ...visit } : null;
  }

  async getVisitsByPatient(patientId: string): Promise<PatientVisit[]> {
    return db.visits.filter((v) => v.patientId === patientId);
  }

  async getVisitsByBranch(
    branchId: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<PatientVisit[]> {
    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId && branchId !== userBranchId) {
      throw new Error("Branch Admin cannot access visits for another branch");
    }
    return db.visits.filter((v) => v.branchId === branchId);
  }

  async createVisit(
    visitData: Omit<PatientVisit, "id" | "visitDateTime" | "visitStatus" | "createdAt" | "updatedAt"> & {
      id?: string;
      visitDateTime?: string;
      visitStatus?: VisitStatus;
    },
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<PatientVisit> {
    // 1. Validate Patient
    const patientExists = db.patients.some((p) => p.id === visitData.patientId);
    if (!patientExists) {
      throw new Error("Invalid patientId: Patient not found");
    }

    // 2. Validate Branch
    const branchExists = db.branches.some((b) => b.id === visitData.branchId);
    if (!branchExists) {
      throw new Error("Invalid branchId: Branch not found");
    }

    // 3. Branch Admin Security Check
    if (currentUserRole === UserRole.BRANCH_ADMIN) {
      if (!userBranchId || visitData.branchId !== userBranchId) {
        throw new Error("Branch Admin cannot create visit for another branch");
      }
    }

    // 4. Visit Type & Booking Validations
    if (visitData.visitType === VisitType.BOOKING) {
      if (!visitData.bookingId) {
        throw new Error("Invalid bookingId for BOOKING visit type");
      }
      const bookingExists = db.bookings.some((b) => b.id === visitData.bookingId);
      if (!bookingExists) {
        throw new Error("Invalid bookingId for BOOKING visit type");
      }
    } else if (visitData.visitType === VisitType.WALK_IN) {
      if (visitData.bookingId !== null && visitData.bookingId !== undefined) {
        throw new Error("WALK_IN visit must have bookingId = null");
      }
    }

    if (visitData.visitType === VisitType.BOOKING && visitData.bookingId) {
      const existingVisitForBooking = db.visits.find(
        (v) =>
          v.bookingId === visitData.bookingId &&
          v.patientId === visitData.patientId &&
          v.branchId === visitData.branchId &&
          v.visitType === VisitType.BOOKING &&
          v.visitStatus !== VisitStatus.CANCELLED
      );
      if (existingVisitForBooking) {
        return existingVisitForBooking;
      }
    }

    const now = AppClock.nowISO();
    const newVisit: PatientVisit = {
      id: visitData.id || `visit-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      patientId: visitData.patientId,
      branchId: visitData.branchId,
      visitDateTime: visitData.visitDateTime || now,
      visitType: visitData.visitType,
      visitStatus: visitData.visitStatus || VisitStatus.WAITING,
      bookingId: visitData.visitType === VisitType.WALK_IN ? null : (visitData.bookingId || null),
      complaint: visitData.complaint || "",
      doctorId: visitData.doctorId,
      plannedTreatments: visitData.plannedTreatments || [],
      createdAt: now,
      updatedAt: now
    };

    db.visits.push(newVisit);
    db.saveToStorage();
    return newVisit;
  }

  async updateVisitStatus(
    id: string,
    status: VisitStatus,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<PatientVisit> {
    const index = db.visits.findIndex((v) => v.id === id);
    if (index === -1) {
      throw new Error("Visit not found");
    }

    const visit = db.visits[index];

    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId && visit.branchId !== userBranchId) {
      throw new Error("Branch Admin cannot update visit for another branch");
    }

    const updatedVisit: PatientVisit = {
      ...visit,
      visitStatus: status,
      updatedAt: new Date().toISOString()
    };

    db.visits[index] = updatedVisit;
    db.saveToStorage();
    return updatedVisit;
  }
}

export class MockQueueRepository implements QueueRepository {
  private isDoctorAssignedToQueue(doctorId: string, currentUserId: string): boolean {
    return doctorId === currentUserId || db.userAccounts.some(
      (account) => account.id === currentUserId && account.doctorId === doctorId
    );
  }

  private async syncVisitStatus(item: QueueItem, role?: UserRole, branchId?: string | null): Promise<void> {
    const visitStatus = getVisitStatusForQueueStatus(item.status);
    if (!visitStatus) return;
    await new MockVisitRepository().updateVisitStatus(item.visitId, visitStatus, role, branchId);
  }

  async getQueueItems(): Promise<QueueItem[]> {
    return [...db.queueItems];
  }

  async getQueueByBranch(
    branchId: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<QueueItem[]> {
    if (
      (currentUserRole === UserRole.BRANCH_ADMIN ||
        currentUserRole === UserRole.DOCTOR ||
        currentUserRole === UserRole.DOCTOR_ASSISTANT) &&
      userBranchId &&
      branchId !== userBranchId
    ) {
      throw new Error("Access denied: Staff is isolated to their assigned branch");
    }
    return db.queueItems.filter((q) => q.branchId === branchId);
  }

  async getQueueByDoctor(
    doctorId: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null,
    currentUserId?: string | null
  ): Promise<QueueItem[]> {
    if (currentUserRole === UserRole.DOCTOR && currentUserId && !this.isDoctorAssignedToQueue(doctorId, currentUserId)) {
      throw new Error("Access denied: Doctor cannot access another doctor queue");
    }
    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId) {
      return db.queueItems.filter((q) => q.doctorId === doctorId && q.branchId === userBranchId);
    }
    return db.queueItems.filter((q) => q.doctorId === doctorId);
  }

  async getQueueByPatient(
    patientId: string,
    currentUserRole?: UserRole,
    currentUserId?: string | null
  ): Promise<QueueItem[]> {
    if (currentUserRole === UserRole.PATIENT && currentUserId && currentUserId !== patientId) {
      throw new Error("Access denied: Patient can only view their own queue");
    }
    return db.queueItems.filter((q) => q.patientId === patientId);
  }

  async getLiveQueueSnapshot(
    branchId: string,
    date: string,
    doctorId?: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null,
    currentUserId?: string | null
  ): Promise<LiveQueueSnapshot | null> {
    if ((currentUserRole === UserRole.BRANCH_ADMIN || currentUserRole === UserRole.DOCTOR_ASSISTANT) && userBranchId && branchId !== userBranchId) {
      throw new Error("Access denied: Asisten / Branch Admin tidak dapat mengakses antrean cabang lain");
    }
    if (currentUserRole === UserRole.DOCTOR && currentUserId && doctorId && !this.isDoctorAssignedToQueue(doctorId, currentUserId)) {
      throw new Error("Access denied: Doctor cannot access another doctor queue");
    }

    let items = db.queueItems.filter((q) => {
      const qDate = (q.arrivalAt || q.checkInTime || "").split("T")[0];
      return q.branchId === branchId && qDate === date;
    });

    if (doctorId && doctorId !== "ALL") {
      items = items.filter((q) => q.doctorId === doctorId);
    }

    const waitingQueue = items.filter((q) => q.status === QueueStatus.WAITING);
    const preparationQueue = items.filter((q) => q.status === QueueStatus.IN_PREPARATION);
    const consultationQueue = items.filter((q) => q.status === QueueStatus.IN_CONSULTATION);
    const completedQueue = items.filter((q) => q.status === QueueStatus.COMPLETED);
    const skippedQueue = items.filter((q) => q.status === QueueStatus.SKIPPED);

    const currentQueue = consultationQueue[0] || preparationQueue[0] || null;
    const nowIso = AppClock.nowISO();

    return {
      id: `snapshot-${branchId}-${doctorId || "ALL"}-${date}`,
      branchId,
      doctorId: doctorId || "ALL",
      operationalDate: date,
      currentQueue,
      waitingQueue,
      preparationQueue,
      consultationQueue,
      completedQueue,
      skippedQueue,
      generatedAt: nowIso,
      date,
      activeQueueItems: [...waitingQueue, ...preparationQueue, ...consultationQueue],
      lastUpdated: nowIso
    };
  }

  async checkInVisitToQueue(
    visitId: string | null,
    currentUserRole?: UserRole,
    userBranchId?: string | null,
    options?: {
      estimatedDurationMinutes?: number;
      preferredServiceAt?: string;
      plannedTreatments?: PlannedTreatment[];
      bookingId?: string | null;
      doctorId?: string;
      customId?: string;
      branchId?: string;
      patientId?: string;
      patientNameSnapshot?: string;
      doctorNameSnapshot?: string;
      bookingTimeSnapshot?: string;
      complaint?: string;
    }
  ): Promise<QueueItem> {
    if (currentUserRole && currentUserRole !== UserRole.SUPER_ADMIN && currentUserRole !== UserRole.BRANCH_ADMIN) {
      throw new Error("Check-in hanya dapat dilakukan Admin Cabang atau Super Admin");
    }

    let resolvedVisitId = visitId;
    let visit = visitId ? db.visits.find((v) => v.id === visitId) : undefined;
    let linkedBooking = options?.bookingId
      ? db.bookings.find((candidate) => candidate.id === options.bookingId)
      : visit?.bookingId
        ? db.bookings.find((candidate) => candidate.id === visit?.bookingId)
        : undefined;

    if (options?.bookingId && !linkedBooking) {
      throw new Error("Booking yang dipilih tidak ditemukan");
    }

    if (linkedBooking) {
      if (linkedBooking.status !== BookingStatus.PENDING && linkedBooking.status !== BookingStatus.CONFIRMED) {
        throw new Error("Booking sudah tidak aktif dan tidak dapat di-check-in");
      }
      if ((options?.branchId && options.branchId !== linkedBooking.branchId) ||
        (options?.patientId && options.patientId !== linkedBooking.patientId) ||
        (options?.doctorId && options.doctorId !== linkedBooking.doctorId)) {
        throw new Error("Data check-in tidak sesuai dengan booking");
      }
      if (getOperationalDateString(linkedBooking.bookingDateTime) !== getOperationalDateString(AppClock.nowISO())) {
        throw new Error("Booking hanya dapat di-check-in pada tanggal operasional yang sama");
      }
      if (visit && (
        visit.bookingId !== linkedBooking.id ||
        visit.patientId !== linkedBooking.patientId ||
        visit.branchId !== linkedBooking.branchId ||
        (visit.doctorId && visit.doctorId !== linkedBooking.doctorId)
      )) {
        throw new Error("Relasi booking, pasien, dokter, cabang, dan kunjungan tidak sesuai");
      }
      visit = db.visits.find((candidate) =>
        candidate.bookingId === linkedBooking?.id &&
        candidate.visitStatus !== VisitStatus.COMPLETED &&
        candidate.visitStatus !== VisitStatus.CANCELLED
      ) || visit;
      if (!visit) {
        if (db.visits.some((candidate) => candidate.bookingId === linkedBooking?.id)) {
          throw new Error("Booking sudah memiliki kunjungan yang ditutup dan tidak dapat di-check-in ulang");
        }
        if (hasActiveQueueForPatientOnDate(
          db.queueItems,
          linkedBooking.patientId,
          linkedBooking.branchId,
          AppClock.nowISO()
        )) {
          throw new Error("Pasien ini sudah berada di antrean aktif hari ini melalui kunjungan lain");
        }
        visit = await new MockVisitRepository().createVisit({
          patientId: linkedBooking.patientId,
          branchId: linkedBooking.branchId,
          visitType: VisitType.BOOKING,
          bookingId: linkedBooking.id,
          doctorId: linkedBooking.doctorId,
          complaint: options?.complaint || linkedBooking.complaint || linkedBooking.notes,
          plannedTreatments: linkedBooking.plannedTreatments || []
        }, currentUserRole, userBranchId);
      }
      resolvedVisitId = visit.id;
    }

    // 1. Visit validation
    if (!visit) {
      throw new Error("PatientVisit tidak ditemukan");
    }

    // 2. Patient validation
    const patient = db.patients.find((p) => p.id === visit.patientId);
    if (!patient) {
      throw new Error("Pasien tidak valid dalam Master Patient Profile");
    }

    // 3. Branch validation
    const branch = db.branches.find((b) => b.id === visit.branchId);
    if (!branch) {
      throw new Error("Cabang tidak valid");
    }

    // 4. Branch Admin Security
    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId && visit.branchId !== userBranchId) {
      throw new Error("Branch Admin tidak dapat mendaftarkan antrean cabang lain");
    }

    // 5. Idempotency Check
    const existingQueue = db.queueItems.find(
      (q) => q.visitId === resolvedVisitId && q.status !== QueueStatus.SKIPPED && q.status !== "CANCELLED"
    );
    if (existingQueue) {
      return existingQueue;
    }

    if (visit.visitStatus !== VisitStatus.WAITING && visit.visitStatus !== VisitStatus.IN_TRIAGE) {
      throw new Error("Status kunjungan tidak mengizinkan check-in");
    }

    if (hasActiveQueueForPatientOnDate(db.queueItems, visit.patientId, visit.branchId, AppClock.nowISO(), resolvedVisitId || undefined)) {
      throw new Error("Pasien ini sudah berada di antrean aktif hari ini melalui kunjungan lain");
    }

    if (!getPatientMedicalRecordNumber(patient, visit.branchId)) {
      const branchPatients = db.patients.map((candidate) => ({
        ...candidate,
        medicalRecordNumber: getPatientMedicalRecordNumber(candidate, visit.branchId)
      }));
      const localRm = getNextStoredBranchRM(visit.branchId, branchPatients)
        || getNextMedicalRecordNumber(branchPatients);
      patient.branchMedicalRecordNumbers = [
        ...(patient.branchMedicalRecordNumbers || []),
        { branchId: visit.branchId, medicalRecordNumber: localRm }
      ];
      if (!patient.medicalRecordNumber) patient.medicalRecordNumber = localRm;
      if (!patient.internalPatientCode) {
        patient.internalPatientCode = formatInternalPatientCode(branch.branchCode || "BRN", localRm);
      }
      advanceStoredBranchRM(visit.branchId, localRm);
    }

    // 6. Doctor Determination & Validation
    const doctorId = options?.doctorId || visit.doctorId || db.doctors[0]?.id || "doc-syafira";
    let doctor = db.doctors.find((d) => d.id === doctorId);
    if (!doctor && doctorId) {
      const cleanTarget = doctorId.toLowerCase().trim();
      doctor = db.doctors.find(
        (d) =>
          d.id.toLowerCase() === cleanTarget ||
          (d.doctorCode && d.doctorCode.toLowerCase() === cleanTarget)
      );
    }
    if (!doctor && doctorId) {
      const cleanTarget = doctorId.toLowerCase().trim();
      const mockDoc = MOCK_DOCTORS.find(
        (d) =>
          d.id === doctorId ||
          d.id.toLowerCase() === cleanTarget ||
          (d.doctorCode && d.doctorCode.toLowerCase() === cleanTarget)
      );
      if (mockDoc) {
        db.doctors.push(mockDoc);
        doctor = mockDoc;
      }
    }
    if (!doctor) {
      doctor = db.doctors[0] || MOCK_DOCTORS[0];
    }
    if (!doctor) {
      throw new Error("Dokter tidak ditemukan");
    }

    const now = AppClock.nowISO();
    const operationalDate = now.split("T")[0];

    // 7. Deterministic sequence order & queue number prefix
    const sameScope = db.queueItems.filter((q) => {
      const qDate = (q.arrivalAt || q.checkInTime || "").split("T")[0];
      return q.branchId === visit.branchId && q.doctorId === doctorId && qDate === operationalDate;
    });

    const sequenceOrder = sameScope.reduce((highest, item) => Math.max(highest, item.sequenceOrder || 0), 0) + 1;
    const doctorPrefix = doctor.name ? doctor.name.replace(/^drg\.\s*/i, "").charAt(0).toUpperCase() : "A";
    const queueNumber = `${doctorPrefix}-${String(sequenceOrder).padStart(2, "0")}`;

    const estimatedDurationMinutes = options?.estimatedDurationMinutes ?? getPlannedTreatmentDurationMinutes(options?.plannedTreatments || visit.plannedTreatments);

    let bookingTimeSnapshot: string | undefined = options?.bookingTimeSnapshot;
    if (visit.bookingId) {
      const bk = db.bookings.find((b) => b.id === visit.bookingId);
      if (bk && !bookingTimeSnapshot) {
        bookingTimeSnapshot = bk.bookingDateTime;
      }
    }

    const newItem: QueueItem = {
      id: options?.customId || `queue-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      branchId: visit.branchId,
      doctorId,
      visitId: visit.id,
      bookingId: visit.bookingId || null,
      patientId: visit.patientId,
      queueNumber,
      status: QueueStatus.WAITING,
      sequenceOrder,
      arrivalAt: now,
      preferredServiceAt: options?.preferredServiceAt,
      checkInTime: now,
      estimatedDurationMinutes,
      patientNameSnapshot: patient.fullName || patient.name,
      doctorNameSnapshot: doctor.name,
      branchNameSnapshot: branch.name,
      bookingTimeSnapshot,
      createdAt: now,
      updatedAt: now
    };

    db.queueItems.push(newItem);

    if (visit.visitStatus === VisitStatus.WAITING) {
      visit.visitStatus = VisitStatus.IN_TRIAGE;
      visit.updatedAt = now;
    }
    if (linkedBooking && linkedBooking.status === BookingStatus.PENDING) {
      linkedBooking.status = BookingStatus.CONFIRMED;
      linkedBooking.updatedAt = now;
    }

    await this.recalculateQueue(visit.branchId, doctorId, operationalDate);

    db.saveToStorage();
    const updatedItem = db.queueItems.find((q) => q.id === newItem.id);
    return updatedItem || newItem;
  }

  async recalculateQueue(
    branchId: string,
    doctorId: string,
    operationalDate: string
  ): Promise<QueueItem[]> {
    const nowIso = AppClock.nowISO();
    const scopeItems = db.queueItems.filter(
      (item) => item.branchId === branchId && item.doctorId === doctorId
    );
    const recalculated = calculateQueueEstimates(scopeItems, db.bookings, nowIso, operationalDate);

    recalculated.forEach((updated) => {
      const index = db.queueItems.findIndex((item) => item.id === updated.id);
      if (index >= 0) db.queueItems[index] = updated;
    });

    return recalculated;
  }

  async callQueuePatient(
    queueId: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null,
    currentUserId?: string | null
  ): Promise<QueueItem> {
    return this.prepareQueuePatient(queueId, currentUserRole, userBranchId, currentUserId);
  }

  async prepareQueuePatient(
    queueId: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null,
    currentUserId?: string | null
  ): Promise<QueueItem> {
    const item = db.queueItems.find((q) => q.id === queueId);
    if (!item) {
      throw new Error("Antrean tidak ditemukan");
    }

    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId && item.branchId !== userBranchId) {
      throw new Error("Branch Admin tidak dapat mengelola antrean cabang lain");
    }
    if (currentUserRole === UserRole.DOCTOR && currentUserId && !this.isDoctorAssignedToQueue(item.doctorId, currentUserId)) {
      throw new Error("Dokter tidak dapat mengelola antrean dokter lain");
    }

    this.assertTreatmentRoomAvailable(item);
    item.status = QueueStatus.IN_PREPARATION;
    item.updatedAt = AppClock.nowISO();
    await this.syncVisitStatus(item, currentUserRole, userBranchId);

    const opDate = (item.arrivalAt || item.checkInTime || "").split("T")[0];
    await this.recalculateQueue(item.branchId, item.doctorId, opDate);

    return { ...item };
  }

  async startService(
    queueId: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null,
    currentUserId?: string | null
  ): Promise<QueueItem> {
    const item = db.queueItems.find((q) => q.id === queueId);
    if (!item) {
      throw new Error("Antrean tidak ditemukan");
    }

    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId && item.branchId !== userBranchId) {
      throw new Error("Branch Admin tidak dapat mengelola antrean cabang lain");
    }
    if (currentUserRole === UserRole.DOCTOR && currentUserId && !this.isDoctorAssignedToQueue(item.doctorId, currentUserId)) {
      throw new Error("Dokter tidak dapat mengelola antrean dokter lain");
    }

    if (item.status === QueueStatus.COMPLETED || item.status === QueueStatus.SKIPPED) {
      throw new Error("Antrean yang sudah selesai atau dilewati tidak dapat dimulai ulang");
    }

    const opDate = (item.arrivalAt || item.checkInTime || "").split("T")[0];

    const otherInConsultation = db.queueItems.find((q) => {
      const qDate = (q.arrivalAt || q.checkInTime || q.actualServiceStartAt || "").split("T")[0];
      return (
        q.id !== queueId &&
        q.branchId === item.branchId &&
        q.doctorId === item.doctorId &&
        (!opDate || !qDate || qDate === opDate) &&
        q.status === QueueStatus.IN_CONSULTATION
      );
    });

    if (otherInConsultation) {
      throw new Error("Dokter sedang melayani pasien lain dalam konsultasi aktif");
    }

    this.assertTreatmentRoomAvailable(item);
    const now = AppClock.nowISO();
    item.status = QueueStatus.IN_CONSULTATION;
    item.actualServiceStartAt = now;
    item.startTime = now;
    item.updatedAt = now;
    await this.syncVisitStatus(item, currentUserRole, userBranchId);

    await this.recalculateQueue(item.branchId, item.doctorId, opDate);

    return { ...item };
  }

  private assertTreatmentRoomAvailable(queueItem: QueueItem): void {
    const operationalDate = (queueItem.arrivalAt || queueItem.checkInTime || "").split("T")[0];
    const occupiedQueue = db.queueItems.find((item) => {
      const itemDate = (item.arrivalAt || item.checkInTime || item.actualServiceStartAt || "").split("T")[0];
      return item.id !== queueItem.id
        && item.branchId === queueItem.branchId
        && item.doctorId === queueItem.doctorId
        && (!operationalDate || !itemDate || itemDate === operationalDate)
        && (item.status === QueueStatus.IN_PREPARATION || item.status === QueueStatus.IN_CONSULTATION);
    });

    if (!occupiedQueue) return;

    const unfinishedTreatment = db.treatmentJobs.some((treatment) =>
      treatment.visitId === occupiedQueue.visitId
      && treatment.status !== TreatmentJobStatus.SELESAI
      && treatment.status !== TreatmentJobStatus.DISERAHKAN
      && treatment.status !== TreatmentJobStatus.DIBATALKAN
    );
    if (unfinishedTreatment) {
      throw new Error("Treatment pasien sebelumnya belum selesai. Selesaikan semua treatment sebelum memanggil pasien berikutnya.");
    }

    throw new Error("Pasien lain masih berada di ruang tindakan. Selesaikan kunjungan sebelum memanggil pasien berikutnya.");
  }

  async finishService(
    queueId: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null,
    currentUserId?: string | null
  ): Promise<QueueItem> {
    const item = db.queueItems.find((q) => q.id === queueId);
    if (!item) {
      throw new Error("Antrean tidak ditemukan");
    }

    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId && item.branchId !== userBranchId) {
      throw new Error("Branch Admin tidak dapat mengelola antrean cabang lain");
    }
    if (currentUserRole === UserRole.DOCTOR && currentUserId && !this.isDoctorAssignedToQueue(item.doctorId, currentUserId)) {
      throw new Error("Dokter tidak dapat mengelola antrean dokter lain");
    }

    if (!item.actualServiceStartAt && !item.startTime) {
      throw new Error("Layanan tidak dapat diselesaikan tanpa actualServiceStartAt");
    }

    const now = AppClock.nowISO();
    item.status = QueueStatus.COMPLETED;
    item.actualServiceEndAt = now;
    item.endTime = now;
    item.updatedAt = now;
    await this.syncVisitStatus(item, currentUserRole, userBranchId);

    const opDate = (item.arrivalAt || item.checkInTime || "").split("T")[0];
    await this.recalculateQueue(item.branchId, item.doctorId, opDate);

    return { ...item };
  }

  async skipQueuePatient(
    queueId: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null,
    currentUserId?: string | null
  ): Promise<QueueItem> {
    const item = db.queueItems.find((q) => q.id === queueId);
    if (!item) {
      throw new Error("Antrean tidak ditemukan");
    }

    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId && item.branchId !== userBranchId) {
      throw new Error("Branch Admin tidak dapat mengelola antrean cabang lain");
    }
    if (currentUserRole === UserRole.DOCTOR && currentUserId && !this.isDoctorAssignedToQueue(item.doctorId, currentUserId)) {
      throw new Error("Dokter tidak dapat mengelola antrean dokter lain");
    }
    if (item.status === QueueStatus.IN_PREPARATION || item.status === QueueStatus.IN_CONSULTATION) {
      throw new Error("Pasien yang sudah berada di ruang tindakan tidak dapat dilewati");
    }

    item.status = QueueStatus.SKIPPED;
    item.updatedAt = AppClock.nowISO();

    const opDate = (item.arrivalAt || item.checkInTime || "").split("T")[0];
    await this.recalculateQueue(item.branchId, item.doctorId, opDate);

    return { ...item };
  }

  async cancelQueuePatient(
    queueId: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null,
    currentUserId?: string | null
  ): Promise<QueueItem> {
    const item = db.queueItems.find((queueItem) => queueItem.id === queueId);
    if (!item) throw new Error("Antrean tidak ditemukan");
    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId && item.branchId !== userBranchId) {
      throw new Error("Branch Admin tidak dapat mengelola antrean cabang lain");
    }
    if (currentUserRole === UserRole.DOCTOR && currentUserId && !this.isDoctorAssignedToQueue(item.doctorId, currentUserId)) {
      throw new Error("Dokter tidak dapat mengelola antrean dokter lain");
    }
    if (item.status === QueueStatus.IN_PREPARATION || item.status === QueueStatus.IN_CONSULTATION) {
      throw new Error("Pasien yang sudah berada di ruang tindakan tidak dapat dibatalkan dari antrean");
    }

    item.status = QueueStatus.CANCELLED;
    item.updatedAt = AppClock.nowISO();
    const operationalDate = (item.arrivalAt || item.checkInTime || "").split("T")[0];
    await this.recalculateQueue(item.branchId, item.doctorId, operationalDate);
    return { ...item };
  }

  async restoreQueueStatus(
    queueId: string,
    status: QueueStatus,
    currentUserRole?: UserRole,
    userBranchId?: string | null,
    currentUserId?: string | null
  ): Promise<QueueItem> {
    const item = db.queueItems.find((queueItem) => queueItem.id === queueId);
    if (!item) throw new Error("Antrean tidak ditemukan");
    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId && item.branchId !== userBranchId) {
      throw new Error("Branch Admin tidak dapat mengelola antrean cabang lain");
    }
    if (currentUserRole === UserRole.DOCTOR && currentUserId && !this.isDoctorAssignedToQueue(item.doctorId, currentUserId)) {
      throw new Error("Dokter tidak dapat mengelola antrean dokter lain");
    }

    item.status = status;
    item.updatedAt = AppClock.nowISO();
    const operationalDate = (item.arrivalAt || item.checkInTime || "").split("T")[0];
    await this.recalculateQueue(item.branchId, item.doctorId, operationalDate);
    const updatedItem = db.queueItems.find((queueItem) => queueItem.id === queueId);
    return { ...(updatedItem || item) };
  }

  async removeQueuePatient(
    queueId: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null,
    currentUserId?: string | null
  ): Promise<void> {
    const itemIndex = db.queueItems.findIndex((q) => q.id === queueId);
    if (itemIndex === -1) {
      throw new Error("Antrean tidak ditemukan");
    }

    const item = db.queueItems[itemIndex];
    if (item.status === QueueStatus.IN_PREPARATION || item.status === QueueStatus.IN_CONSULTATION) {
      throw new Error("Pasien yang sudah berada di ruang tindakan tidak dapat dihapus dari antrean");
    }
    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId && item.branchId !== userBranchId) {
      throw new Error("Branch Admin tidak dapat menghapus antrean cabang lain");
    }
    if (currentUserRole === UserRole.DOCTOR && currentUserId && !this.isDoctorAssignedToQueue(item.doctorId, currentUserId)) {
      throw new Error("Dokter tidak dapat menghapus antrean dokter lain");
    }

    db.queueItems.splice(itemIndex, 1);
    db.saveToStorage();
  }

  async updateEstimatedDuration(
    queueId: string,
    newDurationMinutes: number,
    currentUserRole?: UserRole,
    userBranchId?: string | null,
    currentUserId?: string | null,
    options?: {
      reason?: string;
      addedMinutes?: number;
      previousDurationMinutes?: number;
      actorNameSnapshot?: string;
      treatmentId?: string;
    }
  ): Promise<QueueItem> {
    const item = db.queueItems.find((q) => q.id === queueId);
    if (!item) {
      throw new Error("Antrean tidak ditemukan");
    }

    if (
      (currentUserRole === UserRole.BRANCH_ADMIN || currentUserRole === UserRole.DOCTOR_ASSISTANT) &&
      userBranchId &&
      item.branchId !== userBranchId
    ) {
      throw new Error("Akses ditolak: Asisten / Branch Admin tidak dapat mengelola antrean cabang lain");
    }
    if (currentUserRole === UserRole.DOCTOR && currentUserId && !this.isDoctorAssignedToQueue(item.doctorId, currentUserId)) {
      throw new Error("Dokter tidak dapat mengelola antrean dokter lain");
    }

    if (newDurationMinutes <= 0) {
      throw new Error("Durasi estimasi harus lebih besar dari 0 menit");
    }

    const previousDurationMinutes = options?.previousDurationMinutes ?? item.estimatedDurationMinutes;
    const addedMinutes = options?.addedMinutes ?? (newDurationMinutes - previousDurationMinutes);

    item.estimatedDurationMinutes = newDurationMinutes;
    item.updatedAt = AppClock.nowISO();

    // Sync matching treatment job if exists
    const trJob = db.treatmentJobs.find(
      (t) =>
        t.id === options?.treatmentId ||
        t.visitId === item.visitId ||
        (t.patientId === item.patientId && t.branchId === item.branchId && t.status === TreatmentJobStatus.DALAM_PROSES)
    );

    if (trJob) {
      trJob.estimatedDurationMinutes = newDurationMinutes;
      trJob.updatedAt = AppClock.nowISO();
    }

    // Record TreatmentActivity audit trail for duration change
    const actorName = options?.actorNameSnapshot || (currentUserRole === UserRole.DOCTOR_ASSISTANT ? "Asisten Dokter" : "User Klinik");
    const reasonText = options?.reason || "Tindakan membutuhkan waktu tambahan";
    const nowIso = AppClock.nowISO();

    const activity: TreatmentActivity = {
      id: `act-dur-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      treatmentId: trJob ? trJob.id : (item.visitId || item.id),
      actorId: currentUserId || "system",
      actorRole: currentUserRole || UserRole.DOCTOR,
      actorNameSnapshot: actorName,
      activityType: TreatmentActivityType.DURATION_CHANGE,
      activityAt: nowIso,
      notes: `Durasi diubah (${previousDurationMinutes}m -> ${newDurationMinutes}m, +${addedMinutes}m). Alasan: ${reasonText}`,
      branchId: item.branchId,
      queueId: item.id,
      patientId: item.patientId,
      doctorId: item.doctorId,
      previousDurationMinutes,
      addedMinutes,
      newDurationMinutes,
      createdAt: nowIso
    };
    db.treatmentActivities.push(activity);

    const opDate = (item.arrivalAt || item.checkInTime || "").split("T")[0];
    await this.recalculateQueue(item.branchId, item.doctorId, opDate);

    return { ...item };
  }
}

export class MockTreatmentRepository implements TreatmentRepository {
  async getTreatmentJobs(): Promise<TreatmentJob[]> {
    return db.treatmentJobs.map((t) => ({ ...t }));
  }

  async getTreatmentJobById(id: string): Promise<TreatmentJob | null> {
    const job = db.treatmentJobs.find((t) => t.id === id);
    return job ? { ...job } : null;
  }

  async getTreatmentsByVisit(visitId: string): Promise<TreatmentJob[]> {
    return db.treatmentJobs.filter((t) => t.visitId === visitId).map((t) => ({ ...t }));
  }

  async listTreatments(
    currentUserRole?: UserRole,
    userBranchId?: string | null,
    currentUserId?: string | null
  ): Promise<TreatmentJob[]> {
    let list = db.treatmentJobs;
    if ((currentUserRole === UserRole.BRANCH_ADMIN || currentUserRole === UserRole.DOCTOR_ASSISTANT) && userBranchId) {
      list = list.filter((t) => t.branchId === userBranchId);
    } else if (currentUserRole === UserRole.DOCTOR && currentUserId) {
      list = list.filter((t) => t.doctorId === currentUserId || t.assignedDoctorId === currentUserId);
    }
    return list.map((t) => ({ ...t }));
  }

  async getTreatmentById(
    id: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null,
    currentUserId?: string | null
  ): Promise<TreatmentJob | null> {
    const job = db.treatmentJobs.find((t) => t.id === id);
    if (!job) return null;

    if ((currentUserRole === UserRole.BRANCH_ADMIN || currentUserRole === UserRole.DOCTOR_ASSISTANT) && userBranchId && job.branchId !== userBranchId) {
      throw new Error("Asisten / Branch Admin tidak dapat mengakses treatment cabang lain");
    }
    if (
      currentUserRole === UserRole.DOCTOR &&
      currentUserId &&
      job.doctorId !== currentUserId &&
      job.assignedDoctorId !== currentUserId
    ) {
      throw new Error("Dokter tidak dapat mengakses treatment dokter lain");
    }

    return { ...job };
  }

  async listTreatmentsByVisit(
    visitId: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null,
    currentUserId?: string | null
  ): Promise<TreatmentJob[]> {
    const visit = db.visits.find((v) => v.id === visitId);
    if (!visit) {
      throw new Error("Visit tidak ditemukan");
    }

    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId && visit.branchId !== userBranchId) {
      throw new Error("Branch Admin tidak dapat mengakses visit/treatment cabang lain");
    }

    let list = db.treatmentJobs.filter((t) => t.visitId === visitId);
    if (currentUserRole === UserRole.DOCTOR && currentUserId) {
      list = list.filter((t) => t.doctorId === currentUserId || t.assignedDoctorId === currentUserId);
    }
    return list.map((t) => ({ ...t }));
  }

  async listTreatmentsByBranch(
    branchId: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null,
    currentUserId?: string | null
  ): Promise<TreatmentJob[]> {
    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId && branchId !== userBranchId) {
      throw new Error("Branch Admin tidak dapat mengakses treatment cabang lain");
    }

    let list = db.treatmentJobs.filter((t) => t.branchId === branchId);
    if (currentUserRole === UserRole.DOCTOR && currentUserId) {
      list = list.filter((t) => t.doctorId === currentUserId || t.assignedDoctorId === currentUserId);
    }
    return list.map((t) => ({ ...t }));
  }

  async createTreatmentJob(
    data: {
      visitId: string;
      serviceId: string;
      doctorId: string;
      priceSnapshot?: number;
      patientApprovalConfirmed?: boolean;
      estimatedDurationMinutes?: number;
      notes?: string;
      customId?: string;
      branchId?: string;
      patientId?: string;
    },
    currentUserRole?: UserRole,
    userBranchId?: string | null,
    currentUserId?: string | null
  ): Promise<TreatmentJob> {
    // 1. Validate Visit
    const visit = db.visits.find((v) => v.id === data.visitId);
    if (!visit) {
      throw new Error("Visit tidak ditemukan");
    }

    // 2. Validate Branch Consistency
    if (data.branchId && data.branchId !== visit.branchId) {
      throw new Error("Branch ID treatment harus sama dengan Visit");
    }

    // 3. Validate Patient Consistency
    if (data.patientId && data.patientId !== visit.patientId) {
      throw new Error("Patient ID tidak cocok dengan Visit");
    }

    // 4. Security Check: Branch Admin
    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId && visit.branchId !== userBranchId) {
      throw new Error("Branch Admin tidak dapat membuat treatment untuk cabang lain");
    }

    // 5. Validate Doctor & Security
    let doctor = db.doctors.find((d) => d.id === data.doctorId);
    if (!doctor && data.doctorId) {
      const cleanTarget = data.doctorId.toLowerCase().trim();
      doctor = db.doctors.find(
        (d) =>
          d.id.toLowerCase() === cleanTarget ||
          (d.doctorCode && d.doctorCode.toLowerCase() === cleanTarget)
      );
    }
    if (!doctor && data.doctorId) {
      const cleanTarget = data.doctorId.toLowerCase().trim();
      const mockDoc = MOCK_DOCTORS.find(
        (d) =>
          d.id === data.doctorId ||
          d.id.toLowerCase() === cleanTarget ||
          (d.doctorCode && d.doctorCode.toLowerCase() === cleanTarget)
      );
      if (mockDoc) {
        db.doctors.push(mockDoc);
        doctor = mockDoc;
      }
    }
    if (!doctor) {
      throw new Error("Dokter tidak ditemukan");
    }
    const currentDoctorId = currentUserId
      ? db.userAccounts.find((account) => account.id === currentUserId)?.doctorId || currentUserId
      : null;
    if (currentUserRole === UserRole.DOCTOR && currentDoctorId && data.doctorId !== currentDoctorId) {
      throw new Error("Dokter tidak dapat membuat treatment untuk dokter lain");
    }

    // 6. Validate Service
    const service = db.services.find((s) => s.id === data.serviceId);
    if (!service) {
      throw new Error("Master Service tidak ditemukan");
    }
    if (service.isActive === false) {
      throw new Error("Master Service tidak aktif");
    }

    if (data.priceSnapshot !== undefined && currentUserRole !== UserRole.DOCTOR) {
      throw new Error("Hanya dokter yang dapat menyesuaikan harga tindakan.");
    }
    if (data.priceSnapshot !== undefined && currentUserRole === UserRole.DOCTOR
      && (!currentDoctorId || data.doctorId !== currentDoctorId)) {
      throw new Error("Hanya dokter penanggung jawab yang dapat menyesuaikan harga tindakan.");
    }
    if (data.priceSnapshot !== undefined && (
      !Number.isSafeInteger(data.priceSnapshot)
      || data.priceSnapshot < 0
      || data.priceSnapshot > Number.MAX_SAFE_INTEGER
    )) {
      throw new Error("Harga tindakan harus berupa angka Rupiah bulat dan tidak boleh negatif.");
    }
    const branchTariff = db.tariffs.find(
      (tariff) => tariff.branchId === visit.branchId && tariff.serviceId === service.id && tariff.isActive
    );

    const now = AppClock.nowISO();
    const newItem: TreatmentJob = {
      id: data.customId || `treatment-job-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      visitId: visit.id,
      patientId: visit.patientId,
      branchId: visit.branchId,
      doctorId: doctor.id,
      assignedDoctorId: doctor.id,
      serviceId: service.id,
      status: TreatmentJobStatus.BELUM_DIMULAI,
      serviceNameSnapshot: service.name,
      doctorNameSnapshot: doctor.name,
      priceSnapshot: data.priceSnapshot ?? branchTariff?.customPrice ?? service.basePrice,
      ...(data.patientApprovalConfirmed ? {
        patientApprovalMethod: "VERBAL" as const,
        patientApprovedAt: now,
        patientApprovedBy: currentUserId || undefined
      } : {}),
      estimatedDurationMinutes: data.estimatedDurationMinutes || service.estimatedDurationMinutes || 30,
      notes: data.notes || "",
      createdAt: now,
      updatedAt: now
    };

    db.treatmentJobs.push(newItem);
    const officialPrice = branchTariff?.customPrice ?? service.basePrice;
    if (newItem.priceSnapshot !== officialPrice) {
      await new MockTreatmentActivityRepository().addActivity({
        treatmentId: newItem.id,
        actorId: currentUserId || doctor.id,
        actorRole: currentUserRole || UserRole.DOCTOR,
        actorNameSnapshot: doctor.name,
        activityType: TreatmentActivityType.OTHER,
        notes: `Harga tindakan disesuaikan dari tarif cabang Rp ${officialPrice.toLocaleString("id-ID")} menjadi Rp ${newItem.priceSnapshot?.toLocaleString("id-ID")}.`
      });
    }
    return { ...newItem };
  }

  async startTreatmentJob(
    id: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null,
    currentUserId?: string | null,
    actorData?: { actorId?: string; actorRole?: UserRole; actorNameSnapshot?: string; notes?: string }
  ): Promise<TreatmentJob> {
    const job = db.treatmentJobs.find((t) => t.id === id);
    if (!job) {
      throw new Error("TreatmentJob tidak ditemukan");
    }

    // Security Checks
    if (
      currentUserRole === UserRole.DOCTOR &&
      currentUserId &&
      job.doctorId !== currentUserId &&
      job.assignedDoctorId !== currentUserId
    ) {
      throw new Error("Dokter tidak dapat mengelola treatment dokter lain");
    }

    // State Transition Check: MUST be BELUM_DIMULAI
    if (job.status !== TreatmentJobStatus.BELUM_DIMULAI) {
      throw new Error("Transisi status tidak valid: Treatment hanya dapat dimulai dari status BELUM_DIMULAI");
    }

    const now = AppClock.nowISO();
    job.status = TreatmentJobStatus.DALAM_PROSES;
    job.startedAt = now;
    job.updatedAt = now;

    // Automatic Activity Logging
    const actRepo = new MockTreatmentActivityRepository();
    const actorId = actorData?.actorId || currentUserId || job.doctorId || "actor-system";
    const actorRole = actorData?.actorRole || currentUserRole || UserRole.DOCTOR;
    const actorNameSnapshot =
      actorData?.actorNameSnapshot ||
      job.doctorNameSnapshot ||
      "Petugas Klinik";

    await actRepo.addActivity(
      {
        treatmentId: job.id,
        actorId,
        actorRole,
        actorNameSnapshot,
        activityType: TreatmentActivityType.STARTED,
        notes: actorData?.notes || "Memulai tindakan medis"
      },
      currentUserRole,
      userBranchId,
      currentUserId
    );

    return { ...job };
  }

  async cancelTreatmentJob(
    id: string,
    reason: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null,
    currentUserId?: string | null,
    actorData?: { actorId?: string; actorRole?: UserRole; actorNameSnapshot?: string },
    notPerformedConfirmed = false
  ): Promise<TreatmentJob> {
    const job = db.treatmentJobs.find((treatment) => treatment.id === id);
    if (!job) throw new Error("TreatmentJob tidak ditemukan");
    const normalizedReason = reason.trim();
    if (!normalizedReason) throw new Error("Alasan pembatalan wajib diisi.");
    const currentDoctorId = currentUserId
      ? db.userAccounts.find((account) => account.id === currentUserId)?.doctorId || currentUserId
      : null;
    if (currentUserRole === UserRole.DOCTOR
      && (!currentDoctorId || (job.assignedDoctorId || job.doctorId) !== currentDoctorId)) {
      throw new Error("Dokter tidak ditugaskan pada tindakan ini.");
    }
    if (currentUserRole === UserRole.DOCTOR_ASSISTANT && userBranchId !== job.branchId) {
      throw new Error("Asisten tidak memiliki izin tindakan di cabang ini.");
    }
    if (currentUserRole && ![
      UserRole.DOCTOR,
      UserRole.DOCTOR_ASSISTANT,
      UserRole.SUPER_ADMIN
    ].includes(currentUserRole)) {
      throw new Error("Role tidak memiliki izin membatalkan rencana tindakan.");
    }
    if (currentUserRole === UserRole.SUPER_ADMIN && !job.externalDoctorId) {
      throw new Error("Super Admin hanya dapat mengelola tindakan dokter eksternal.");
    }
    if (job.status !== TreatmentJobStatus.BELUM_DIMULAI
      && job.status !== TreatmentJobStatus.DALAM_PROSES) {
      throw new Error("Hanya rencana yang belum dimulai atau belum dikerjakan yang dapat dibatalkan.");
    }
    if (job.status === TreatmentJobStatus.DALAM_PROSES) {
      if (!notPerformedConfirmed) {
        throw new Error("Konfirmasi bahwa tindakan belum dikerjakan dan belum memakai bahan wajib diisi.");
      }
      if (hasMockRecordedTreatmentInventoryUsage(job.id)) {
        throw new Error("Item tidak dapat dibatalkan karena pemakaian bahan sudah tercatat.");
      }
      if (db.treatmentActivities.some((activity) =>
        (activity.treatmentId === job.id || activity.treatmentJobId === job.id)
        && activity.activityType !== TreatmentActivityType.STARTED
      )) {
        throw new Error("Item tidak dapat dibatalkan karena aktivitas tindakan selain mulai sudah tercatat.");
      }
    }
    if (db.invoices.some((invoice) =>
      invoice.visitId === job.visitId && invoice.status !== InvoiceStatus.CANCELLED
    )) {
      throw new Error("Rencana tindakan tidak dapat dibatalkan setelah invoice diterbitkan.");
    }

    const now = AppClock.nowISO();
    job.status = TreatmentJobStatus.DIBATALKAN;
    job.cancelledAt = now;
    job.cancelledBy = actorData?.actorId || currentUserId || undefined;
    job.cancellationReason = normalizedReason;
    job.updatedAt = now;

    const activityRepo = new MockTreatmentActivityRepository();
    await activityRepo.addActivity({
      treatmentId: job.id,
      actorId: actorData?.actorId || currentUserId || job.doctorId || "actor-system",
      actorRole: actorData?.actorRole || currentUserRole || UserRole.DOCTOR,
      actorNameSnapshot: actorData?.actorNameSnapshot || job.doctorNameSnapshot,
      activityType: TreatmentActivityType.CANCELLED,
      notes: normalizedReason
    }, currentUserRole, userBranchId, currentUserId);
    return { ...job };
  }

  async completeTreatmentJob(
    id: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null,
    currentUserId?: string | null,
    actorData?: { actorId?: string; actorRole?: UserRole; actorNameSnapshot?: string; notes?: string }
  ): Promise<TreatmentJob> {
    const job = db.treatmentJobs.find((t) => t.id === id);
    if (!job) {
      throw new Error("TreatmentJob tidak ditemukan");
    }

    if (currentUserRole === UserRole.DOCTOR) {
      if (!currentUserId || (job.assignedDoctorId || job.doctorId) !== currentUserId) {
        throw new Error("Dokter tidak ditugaskan pada tindakan ini");
      }
    } else if (
      currentUserRole &&
      !(job.externalDoctorId && (
        currentUserRole === UserRole.DOCTOR_ASSISTANT || currentUserRole === UserRole.SUPER_ADMIN
      ))
    ) {
      throw new Error("Hanya Dokter atau petugas berwenang pada tindakan dokter eksternal yang dapat menyelesaikan tindakan.");
    }

    if (
      job.externalDoctorId &&
      currentUserRole === UserRole.DOCTOR_ASSISTANT &&
      userBranchId !== job.branchId
    ) {
      throw new Error("Asisten tidak memiliki izin tindakan di cabang ini");
    }

    // State Transition Check: MUST be DALAM_PROSES
    if (job.status !== TreatmentJobStatus.DALAM_PROSES) {
      throw new Error("Transisi status tidak valid: Treatment hanya dapat diselesaikan dari status DALAM_PROSES");
    }
    if (!job.startedAt) {
      throw new Error("Treatment tidak dapat diselesaikan tanpa startedAt");
    }

    const now = AppClock.nowISO();
    job.status = TreatmentJobStatus.SELESAI;
    job.completedAt = now;
    job.updatedAt = now;

    // Automatic Activity Logging
    const actRepo = new MockTreatmentActivityRepository();
    const actorId = actorData?.actorId || currentUserId || job.doctorId || "actor-system";
    const actorRole = actorData?.actorRole || currentUserRole || UserRole.DOCTOR;
    const actorNameSnapshot =
      actorData?.actorNameSnapshot ||
      job.doctorNameSnapshot ||
      "Petugas Klinik";

    await actRepo.addActivity(
      {
        treatmentId: job.id,
        actorId,
        actorRole,
        actorNameSnapshot,
        activityType: TreatmentActivityType.COMPLETED,
        notes: actorData?.notes || "Menyelesaikan tindakan medis"
      },
      currentUserRole,
      userBranchId,
      currentUserId
    );

    return { ...job };
  }

  async handOverTreatmentJob(
    id: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null,
    currentUserId?: string | null,
    actorData?: { actorId?: string; actorRole?: UserRole; actorNameSnapshot?: string; notes?: string }
  ): Promise<TreatmentJob> {
    const job = db.treatmentJobs.find((t) => t.id === id);
    if (!job) {
      throw new Error("TreatmentJob tidak ditemukan");
    }

    if (currentUserRole === UserRole.DOCTOR) {
      if (!currentUserId || (job.assignedDoctorId || job.doctorId) !== currentUserId) {
        throw new Error("Dokter tidak ditugaskan pada tindakan ini");
      }
    } else if (
      currentUserRole &&
      !(job.externalDoctorId && (
        currentUserRole === UserRole.DOCTOR_ASSISTANT || currentUserRole === UserRole.SUPER_ADMIN
      ))
    ) {
      throw new Error("Hanya Dokter atau petugas berwenang pada tindakan dokter eksternal yang dapat menyerahkan tindakan ke kasir.");
    }

    if (
      job.externalDoctorId &&
      currentUserRole === UserRole.DOCTOR_ASSISTANT &&
      userBranchId !== job.branchId
    ) {
      throw new Error("Asisten tidak memiliki izin tindakan di cabang ini");
    }

    // State Transition Check: MUST be SELESAI
    if (job.status !== TreatmentJobStatus.SELESAI) {
      throw new Error("Transisi status tidak valid: Treatment hanya dapat diserahkan dari status SELESAI");
    }

    const now = AppClock.nowISO();
    job.status = TreatmentJobStatus.DISERAHKAN;
    job.handedOverAt = now;
    job.updatedAt = now;

    // Automatic Activity Logging
    const actRepo = new MockTreatmentActivityRepository();
    const actorId = actorData?.actorId || currentUserId || job.doctorId || "actor-system";
    const actorRole = actorData?.actorRole || currentUserRole || UserRole.DOCTOR;
    const actorNameSnapshot =
      actorData?.actorNameSnapshot ||
      job.doctorNameSnapshot ||
      "Petugas Klinik";

    await actRepo.addActivity(
      {
        treatmentId: job.id,
        actorId,
        actorRole,
        actorNameSnapshot,
        activityType: TreatmentActivityType.HANDED_OVER,
        notes: actorData?.notes || "Tindakan medis diserahkan"
      },
      currentUserRole,
      userBranchId,
      currentUserId
    );

    return { ...job };
  }

  async returnTreatmentToDoctor(
    id: string,
    reason: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null,
    currentUserId?: string | null,
    actorData?: { actorId?: string; actorRole?: UserRole; actorNameSnapshot?: string }
  ): Promise<TreatmentJob> {
    const job = db.treatmentJobs.find((treatment) => treatment.id === id);
    if (!job) throw new Error("TreatmentJob tidak ditemukan");
    if (currentUserRole !== UserRole.BRANCH_ADMIN && currentUserRole !== UserRole.SUPER_ADMIN) {
      throw new Error("Hanya petugas kasir yang dapat mengembalikan tindakan ke dokter.");
    }
    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId !== job.branchId) {
      throw new Error("Admin Cabang tidak dapat mengakses treatment cabang lain");
    }
    const normalizedReason = reason.trim();
    if (!normalizedReason) throw new Error("Alasan pengembalian wajib diisi.");
    if (job.status !== TreatmentJobStatus.SELESAI && job.status !== TreatmentJobStatus.DISERAHKAN) {
      throw new Error("Hanya tindakan yang sudah selesai dan belum ditagihkan yang dapat dikembalikan.");
    }

    const visitInvoices = db.invoices.filter((invoice) => invoice.visitId === job.visitId);
    if (visitInvoices.some((invoice) => invoice.status !== InvoiceStatus.CANCELLED)) {
      throw new Error("Tindakan tidak dapat dikembalikan setelah invoice diterbitkan.");
    }
    if (db.payments.some((payment) => visitInvoices.some((invoice) => invoice.id === payment.invoiceId))) {
      throw new Error("Tindakan tidak dapat dikembalikan setelah ada pembayaran.");
    }

    const now = AppClock.nowISO();
    job.status = TreatmentJobStatus.PERLU_REVISI;
    job.returnedAt = now;
    job.returnReason = normalizedReason;
    job.updatedAt = now;

    const activityRepo = new MockTreatmentActivityRepository();
    await activityRepo.addActivity({
      treatmentId: job.id,
      actorId: actorData?.actorId || currentUserId || "actor-system",
      actorRole: actorData?.actorRole || currentUserRole,
      actorNameSnapshot: actorData?.actorNameSnapshot,
      activityType: TreatmentActivityType.RETURNED_TO_DOCTOR,
      notes: normalizedReason
    });
    return { ...job };
  }

  async resubmitTreatmentToCashier(
    id: string,
    correctedNotes: string,
    serviceId: string,
    priceSnapshot: number,
    patientApprovalConfirmed: boolean,
    currentUserRole?: UserRole,
    userBranchId?: string | null,
    currentUserId?: string | null,
    actorData?: { actorId?: string; actorRole?: UserRole; actorNameSnapshot?: string }
  ): Promise<TreatmentJob> {
    const job = db.treatmentJobs.find((treatment) => treatment.id === id);
    if (!job) throw new Error("TreatmentJob tidak ditemukan");
    if (currentUserRole !== UserRole.DOCTOR
      || !currentUserId
      || (job.assignedDoctorId || job.doctorId) !== currentUserId) {
      throw new Error("Hanya dokter penanggung jawab yang dapat mengirim ulang tindakan ini.");
    }
    if (userBranchId && userBranchId !== job.branchId) {
      throw new Error("Dokter tidak memiliki izin tindakan di cabang ini.");
    }
    const normalizedNotes = correctedNotes.trim();
    if (!normalizedNotes) throw new Error("Catatan tindakan yang sudah dikoreksi wajib diisi.");
    if (!patientApprovalConfirmed) {
      throw new Error("Persetujuan lisan pasien atas harga koreksi wajib dicatat.");
    }
    if (job.status !== TreatmentJobStatus.PERLU_REVISI) {
      throw new Error("Tindakan tidak sedang menunggu revisi dokter.");
    }
    const service = db.services.find((item) => item.id === serviceId && item.isActive);
    if (!service) throw new Error("Jenis tindakan aktif tidak ditemukan.");
    if (!Number.isSafeInteger(priceSnapshot) || priceSnapshot < 0 || priceSnapshot > Number.MAX_SAFE_INTEGER) {
      throw new Error("Harga tindakan harus berupa angka Rupiah bulat dan tidak boleh negatif.");
    }
    const branchTariff = db.tariffs.find(
      (tariff) => tariff.branchId === job.branchId && tariff.serviceId === service.id && tariff.isActive
    );
    const officialPrice = branchTariff?.customPrice ?? service.basePrice;
    const previousPrice = job.priceSnapshot ?? officialPrice;

    const now = AppClock.nowISO();
    job.notes = normalizedNotes;
    job.serviceId = service.id;
    job.serviceNameSnapshot = service.name;
    job.priceSnapshot = priceSnapshot;
    job.patientApprovalMethod = "VERBAL";
    job.patientApprovedAt = now;
    job.patientApprovedBy = actorData?.actorId || currentUserId;
    job.status = TreatmentJobStatus.SELESAI;
    job.updatedAt = now;

    const activityRepo = new MockTreatmentActivityRepository();
    await activityRepo.addActivity({
      treatmentId: job.id,
      actorId: actorData?.actorId || currentUserId,
      actorRole: actorData?.actorRole || currentUserRole,
      actorNameSnapshot: actorData?.actorNameSnapshot,
      activityType: TreatmentActivityType.REVISION_RESUBMITTED,
      notes: `Dokter memperbarui catatan tindakan; tarif dasar cabang Rp ${officialPrice.toLocaleString("id-ID")}, harga tindakan Rp ${priceSnapshot.toLocaleString("id-ID")} (sebelumnya Rp ${previousPrice.toLocaleString("id-ID")}); tindakan siap ditagihkan.`
    });
    return { ...job };
  }
}

export class MockTreatmentActivityRepository implements TreatmentActivityRepository {
  async listActivitiesByTreatment(
    treatmentId: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null,
    currentUserId?: string | null
  ): Promise<TreatmentActivity[]> {
    const job = db.treatmentJobs.find((t) => t.id === treatmentId);
    if (!job) {
      throw new Error("TreatmentJob tidak ditemukan: tidak dapat memuat Activity untuk treatment yang tidak ada");
    }

    // Security
    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId && job.branchId !== userBranchId) {
      throw new Error("Branch Admin tidak dapat mengakses Activity cabang lain");
    }
    if (
      currentUserRole === UserRole.DOCTOR &&
      currentUserId &&
      job.doctorId !== currentUserId &&
      job.assignedDoctorId !== currentUserId
    ) {
      throw new Error("Dokter tidak dapat mengakses Activity treatment dokter lain");
    }
    if (currentUserRole === UserRole.DOCTOR_ASSISTANT && userBranchId && job.branchId !== userBranchId) {
      throw new Error("Asisten tidak dapat mengakses Activity cabang lain");
    }

    const items = db.treatmentActivities.filter(
      (a: TreatmentActivity) => a.treatmentId === treatmentId || a.treatmentJobId === treatmentId
    );

    return items
      .map((item: TreatmentActivity) => ({ ...item }))
      .sort((a: TreatmentActivity, b: TreatmentActivity) => {
        const timeA = a.activityAt || a.timestamp || "";
        const timeB = b.activityAt || b.timestamp || "";
        if (timeA === timeB) {
          return a.id.localeCompare(b.id);
        }
        return timeA.localeCompare(timeB);
      });
  }

  async getActivityById(
    activityId: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null,
    currentUserId?: string | null
  ): Promise<TreatmentActivity | null> {
    const act = db.treatmentActivities.find((a) => a.id === activityId);
    if (!act) return null;

    const trId = act.treatmentId || act.treatmentJobId;
    if (trId) {
      const job = db.treatmentJobs.find((t) => t.id === trId);
      if (job) {
        if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId && job.branchId !== userBranchId) {
          throw new Error("Branch Admin tidak dapat mengakses Activity cabang lain");
        }
        if (
          currentUserRole === UserRole.DOCTOR &&
          currentUserId &&
          job.doctorId !== currentUserId &&
          job.assignedDoctorId !== currentUserId
        ) {
          throw new Error("Dokter tidak dapat mengakses Activity treatment dokter lain");
        }
        if (currentUserRole === UserRole.DOCTOR_ASSISTANT && userBranchId && job.branchId !== userBranchId) {
          throw new Error("Asisten tidak dapat mengakses Activity cabang lain");
        }
      }
    }

    return { ...act };
  }

  async addActivity(
    data: {
      treatmentId: string;
      actorId: string;
      actorRole: UserRole;
      actorNameSnapshot?: string;
      activityType: TreatmentActivityType;
      notes?: string;
      customId?: string;
    },
    currentUserRole?: UserRole,
    userBranchId?: string | null,
    currentUserId?: string | null
  ): Promise<TreatmentActivity> {
    if (!data.treatmentId) {
      throw new Error("treatmentId wajib diisi");
    }

    const job = db.treatmentJobs.find((t) => t.id === data.treatmentId);
    if (!job) {
      throw new Error("TreatmentJob tidak ditemukan: Activity tidak boleh orphan");
    }

    // Security
    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId && job.branchId !== userBranchId) {
      throw new Error("Branch Admin tidak dapat menambahkan Activity ke treatment cabang lain");
    }
    if (
      currentUserRole === UserRole.DOCTOR &&
      currentUserId &&
      job.doctorId !== currentUserId &&
      job.assignedDoctorId !== currentUserId
    ) {
      throw new Error("Dokter tidak dapat menambahkan Activity pada treatment dokter lain");
    }
    if (currentUserRole === UserRole.DOCTOR_ASSISTANT && userBranchId && job.branchId !== userBranchId) {
      throw new Error("Asisten tidak dapat menambahkan Activity pada cabang lain");
    }

    // Validate Actor
    if (!data.actorId || !data.actorRole) {
      throw new Error("Actor ID dan Actor Role wajib diisi");
    }

    // Validate Activity Type
    const validTypes = Object.values(TreatmentActivityType);
    if (!data.activityType || !validTypes.includes(data.activityType)) {
      throw new Error("Jenis activityType tidak valid");
    }

    // Actor Name Snapshot
    let actorNameSnapshot: string = data.actorNameSnapshot || "";
    if (!actorNameSnapshot) {
      const doc = db.doctors.find((d: any) => d.id === data.actorId);
      if (doc) {
        actorNameSnapshot = doc.name;
      } else if (data.actorRole === UserRole.SUPER_ADMIN) {
        actorNameSnapshot = "Super Admin";
      } else if (data.actorRole === UserRole.BRANCH_ADMIN) {
        actorNameSnapshot = "Branch Admin";
      } else {
        actorNameSnapshot = data.actorId || "Petugas Klinik";
      }
    }

    const now = AppClock.nowISO();
    const newActivity: TreatmentActivity = {
      id: data.customId || `act-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      treatmentId: job.id,
      treatmentJobId: job.id,
      actorId: data.actorId,
      actorRole: data.actorRole,
      actorNameSnapshot,
      activityType: data.activityType,
      activityAt: now,
      notes: data.notes || "",
      branchId: job.branchId,

      // Aliases
      performerId: data.actorId,
      performerRole: data.actorRole,
      description: data.notes || data.activityType,
      timestamp: now
    };

    db.treatmentActivities.push(newActivity);
    return { ...newActivity };
  }
}

export class MockInvoiceRepository implements InvoiceRepository {
  async getInvoices(currentUserRole?: UserRole, userBranchId?: string | null): Promise<Invoice[]> {
    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId) {
      return db.invoices.filter((i: Invoice) => i.branchId === userBranchId).map((i: Invoice) => ({ ...i }));
    }
    return db.invoices.map((i: Invoice) => ({ ...i }));
  }

  async getInvoiceById(id: string, currentUserRole?: UserRole, userBranchId?: string | null): Promise<Invoice | null> {
    const inv = db.invoices.find((i: Invoice) => i.id === id);
    if (!inv) return null;

    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId && inv.branchId !== userBranchId) {
      throw new Error("Branch Admin tidak dapat mengakses Invoice cabang lain");
    }

    return { ...inv };
  }

  async getInvoiceItems(invoiceId: string): Promise<InvoiceItem[]> {
    return db.invoiceItems
      .filter((item: InvoiceItem) => item.invoiceId === invoiceId)
      .map((item: InvoiceItem) => ({ ...item }));
  }

  async getInvoiceItemsByInvoices(invoiceIds: string[]): Promise<InvoiceItem[]> {
    const invoiceIdSet = new Set(invoiceIds);
    return db.invoiceItems
      .filter((item: InvoiceItem) => invoiceIdSet.has(item.invoiceId))
      .map((item: InvoiceItem) => ({ ...item }));
  }

  async getInvoicesByBranch(branchId: string, currentUserRole?: UserRole, userBranchId?: string | null): Promise<Invoice[]> {
    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId && branchId !== userBranchId) {
      throw new Error("Branch Admin tidak dapat mengakses Invoice cabang lain");
    }
    return db.invoices.filter((i: Invoice) => i.branchId === branchId).map((i: Invoice) => ({ ...i }));
  }

  async getInvoicesByPatient(patientId: string): Promise<Invoice[]> {
    return db.invoices.filter((i: Invoice) => i.patientId === patientId).map((i: Invoice) => ({ ...i }));
  }

  async createInvoice(
    data: {
      visitId: string;
      patientId: string;
      branchId: string;
      items: Array<{
        serviceId?: string;
        treatmentJobId?: string;
        descriptionSnapshot: string;
        unitPriceSnapshot: number;
        quantity: number;
        amount?: number;
      }>;
      discountAmount?: number;
      taxAmount?: number;
      customId?: string;
      customInvoiceNumber?: string;
    },
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<Invoice> {
    if (currentUserRole === UserRole.DOCTOR || currentUserRole === UserRole.DOCTOR_ASSISTANT) {
      throw new Error("Akses ditolak: Dokter atau Asisten tidak memiliki wewenang untuk membuat Invoice");
    }

    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId && data.branchId !== userBranchId) {
      throw new Error("Branch Admin hanya dapat membuat Invoice untuk cabangnya sendiri");
    }

    if (!data.items || data.items.length === 0) {
      throw new Error("Invoice harus memiliki minimal satu item tindakan/layanan");
    }

    const linkedTreatmentIds = data.items.flatMap((item) =>
      item.treatmentJobId ? [item.treatmentJobId] : []
    );
    if (linkedTreatmentIds.length > 0) {
      const visitTreatments = db.treatmentJobs.filter((treatment) => treatment.visitId === data.visitId);
      const completedTreatments = visitTreatments.filter((treatment) =>
        treatment.status === TreatmentJobStatus.SELESAI
        || treatment.status === TreatmentJobStatus.DISERAHKAN
      );
      const planIsClosed = visitTreatments.every((treatment) =>
        treatment.status === TreatmentJobStatus.SELESAI
        || treatment.status === TreatmentJobStatus.DISERAHKAN
        || treatment.status === TreatmentJobStatus.DIBATALKAN
      );
      const linkedIds = new Set(linkedTreatmentIds);
      if (!planIsClosed || completedTreatments.length === 0) {
        throw new Error("Invoice hanya dapat dibuat setelah semua rencana selesai atau dibatalkan dan ada tindakan yang selesai.");
      }
      if (linkedIds.size !== completedTreatments.length
        || completedTreatments.some((treatment) => !linkedIds.has(treatment.id))) {
        throw new Error("Invoice harus memuat seluruh tindakan selesai dan tidak boleh memuat rencana yang dibatalkan.");
      }
    }

    const now = AppClock.nowISO();
    const invoiceId = data.customId || `inv-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    let totalAmount = 0;
    const createdItems: InvoiceItem[] = [];

    data.items.forEach((item, index) => {
      const itemAmount = item.amount !== undefined ? item.amount : item.quantity * item.unitPriceSnapshot;
      totalAmount += itemAmount;

      const invoiceItem: InvoiceItem = {
        id: `item-${invoiceId}-${index + 1}`,
        invoiceId,
        serviceId: item.serviceId,
        treatmentJobId: item.treatmentJobId,
        descriptionSnapshot: item.descriptionSnapshot,
        unitPriceSnapshot: item.unitPriceSnapshot,
        quantity: item.quantity,
        amount: itemAmount,
        createdAt: now
      };
      createdItems.push(invoiceItem);
      db.invoiceItems.push(invoiceItem);
    });

    const discountAmount = data.discountAmount || 0;
    const taxAmount = data.taxAmount || 0;
    const netAmount = Math.max(0, totalAmount - discountAmount + taxAmount);
    const invoiceNumber = data.customInvoiceNumber || generateInvoiceNumber(data.branchId, now, db.invoices, db.branches);

    const newInvoice: Invoice = {
      id: invoiceId,
      invoiceNumber,
      visitId: data.visitId,
      patientId: data.patientId,
      branchId: data.branchId,
      totalAmount,
      discountAmount,
      taxAmount,
      netAmount,
      paidAmount: 0,
      outstandingAmount: netAmount,
      status: netAmount === 0 ? InvoiceStatus.PAID : InvoiceStatus.OPEN,
      createdAt: now,
      updatedAt: now
    };

    db.invoices.push(newInvoice);
    return { ...newInvoice };
  }

  async updateInvoiceStatus(
    id: string,
    status: InvoiceStatus,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<Invoice> {
    const inv = db.invoices.find((i: Invoice) => i.id === id);
    if (!inv) {
      throw new Error("Invoice tidak ditemukan");
    }

    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId && inv.branchId !== userBranchId) {
      throw new Error("Branch Admin tidak dapat mengubah status Invoice cabang lain");
    }

    inv.status = status;
    inv.updatedAt = AppClock.nowISO();
    return { ...inv };
  }

  async cancelInvoice(
    id: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<Invoice> {
    const inv = db.invoices.find((i: Invoice) => i.id === id);
    if (!inv) {
      throw new Error("Invoice tidak ditemukan");
    }

    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId && inv.branchId !== userBranchId) {
      throw new Error("Branch Admin tidak dapat membatalkan Invoice cabang lain");
    }

    if (inv.paidAmount > 0) {
      throw new Error("Invoice yang telah memiliki pembayaran tidak dapat dibatalkan secara langsung. Lakukan void/refund pembayaran terlebih dahulu");
    }

    inv.status = InvoiceStatus.CANCELLED;
    inv.updatedAt = AppClock.nowISO();
    return { ...inv };
  }

  async deleteInvoice(
    id: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<boolean> {
    if (currentUserRole && currentUserRole !== UserRole.SUPER_ADMIN && currentUserRole !== UserRole.BRANCH_ADMIN) {
      throw new Error("Akses ditolak: Hanya Admin yang dapat menghapus invoice");
    }

    const index = db.invoices.findIndex((i: Invoice) => i.id === id);
    if (index === -1) return false;

    const targetInv = db.invoices[index];
    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId && targetInv.branchId !== userBranchId) {
      throw new Error("Branch Admin tidak dapat menghapus Invoice cabang lain");
    }

    db.invoiceItems = db.invoiceItems.filter((item: InvoiceItem) => item.invoiceId !== id);
    db.invoices.splice(index, 1);

    const relatedPayments = db.payments.filter((p: PaymentTransaction) => p.invoiceId === id);
    db.payments = db.payments.filter((p: PaymentTransaction) => p.invoiceId !== id);

    relatedPayments.forEach((p) => {
      db.journals = db.journals.filter((j) => j.sourceId !== p.id);
    });
    db.journals = db.journals.filter((j) => j.sourceId !== id);

    db.saveToStorage();
    return true;
  }
}

export class MockPaymentRepository implements PaymentRepository {
  async getPayments(currentUserRole?: UserRole, userBranchId?: string | null): Promise<PaymentTransaction[]> {
    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId) {
      const branchInvoices = new Set(
        db.invoices.filter((i: Invoice) => i.branchId === userBranchId).map((i: Invoice) => i.id)
      );
      return db.payments.filter((p: PaymentTransaction) => branchInvoices.has(p.invoiceId)).map((p: PaymentTransaction) => ({ ...p }));
    }
    return db.payments.map((p: PaymentTransaction) => ({ ...p }));
  }

  async getPaymentsByInvoice(invoiceId: string, currentUserRole?: UserRole, userBranchId?: string | null): Promise<PaymentTransaction[]> {
    const inv = db.invoices.find((i: Invoice) => i.id === invoiceId);
    if (!inv) {
      return [];
    }

    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId && inv.branchId !== userBranchId) {
      throw new Error("Branch Admin tidak dapat mengakses pembayaran Invoice cabang lain");
    }

    return db.payments
      .filter((p: PaymentTransaction) => p.invoiceId === invoiceId)
      .map((p: PaymentTransaction) => ({ ...p }));
  }

  async getPaymentsByInvoices(invoiceIds: string[]): Promise<PaymentTransaction[]> {
    const invoiceIdSet = new Set(invoiceIds);
    return db.payments
      .filter((payment: PaymentTransaction) => invoiceIdSet.has(payment.invoiceId))
      .map((payment: PaymentTransaction) => ({ ...payment }));
  }

  async createPayment(
    data: {
      invoiceId: string;
      amount: number;
      paymentMethod: PaymentMethod;
      referenceNumber?: string;
      staffId: string;
      notes?: string;
      customId?: string;
      customReceiptNumber?: string;
    },
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<PaymentTransaction> {
    const inv = db.invoices.find((i: Invoice) => i.id === data.invoiceId);
    if (!inv) {
      throw new Error("Invoice tidak ditemukan");
    }

    if (
      currentUserRole &&
      currentUserRole !== UserRole.SUPER_ADMIN &&
      currentUserRole !== UserRole.BRANCH_ADMIN
    ) {
      throw new Error("Akses ditolak: Hanya Super Admin dan Branch Admin yang dapat menerima pembayaran");
    }

    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId && inv.branchId !== userBranchId) {
      throw new Error("Branch Admin tidak dapat menerima pembayaran untuk Invoice cabang lain");
    }

    if (inv.status === InvoiceStatus.CANCELLED) {
      throw new Error("Tidak dapat menerima pembayaran untuk invoice yang telah DIBATALKAN");
    }

    if (inv.status === InvoiceStatus.PAID || inv.outstandingAmount <= 0) {
      throw new Error("Invoice sudah LUNAS (Paid). Tidak ada sisa tagihan yang perlu dibayar");
    }

    if (data.amount <= 0) {
      throw new Error("Nominal pembayaran harus lebih dari 0");
    }

    if (data.amount > inv.outstandingAmount) {
      throw new Error(`Nominal pembayaran (Rp ${data.amount.toLocaleString("id-ID")}) melebihi sisa tagihan (Rp ${inv.outstandingAmount.toLocaleString("id-ID")})`);
    }

    const now = AppClock.nowISO();
    const paymentId = data.customId || `pay-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const branchId = inv.branchId || "branch-gebang";
    const receiptNumber = data.customReceiptNumber || generateReceiptNumber(branchId, now, db.payments, db.branches);

    const newPayment: PaymentTransaction = {
      id: paymentId,
      receiptNumber,
      invoiceId: data.invoiceId,
      branchId,
      amount: data.amount,
      paymentMethod: data.paymentMethod,
      referenceNumber: data.referenceNumber,
      notes: data.notes,
      transactionDateTime: now,
      staffId: data.staffId,
      status: "SUCCESS",
      createdAt: now,
      updatedAt: now
    };

    db.payments.push(newPayment);

    // Update invoice balance & status
    inv.paidAmount += data.amount;
    inv.outstandingAmount = Math.max(0, inv.netAmount - inv.paidAmount);

    if (inv.outstandingAmount === 0) {
      inv.status = InvoiceStatus.PAID;
    } else {
      inv.status = InvoiceStatus.PARTIALLY_PAID;
    }
    inv.updatedAt = now;
    db.saveToStorage();

    return { ...newPayment };
  }

  async deletePayment(
    id: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<boolean> {
    if (currentUserRole && currentUserRole !== UserRole.SUPER_ADMIN && currentUserRole !== UserRole.BRANCH_ADMIN) {
      throw new Error("Akses ditolak: Hanya Admin yang dapat menghapus pembayaran");
    }

    const index = db.payments.findIndex((p: PaymentTransaction) => p.id === id);
    if (index === -1) return false;

    const pmt = db.payments[index];
    const inv = db.invoices.find((i: Invoice) => i.id === pmt.invoiceId);

    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId && inv && inv.branchId !== userBranchId) {
      throw new Error("Branch Admin tidak dapat menghapus Pembayaran cabang lain");
    }

    db.payments.splice(index, 1);

    if (inv) {
      const remainingPayments = db.payments.filter((p: PaymentTransaction) => p.invoiceId === inv.id);
      const newPaid = remainingPayments.reduce((sum, p) => sum + p.amount, 0);
      inv.paidAmount = newPaid;
      inv.outstandingAmount = Math.max(0, inv.netAmount - newPaid);
      if (newPaid === 0) {
        inv.status = InvoiceStatus.OPEN;
      } else if (inv.outstandingAmount <= 0) {
        inv.status = InvoiceStatus.PAID;
      } else {
        inv.status = InvoiceStatus.PARTIALLY_PAID;
      }
      inv.updatedAt = AppClock.nowISO();
    }

    db.journals = db.journals.filter((j) => j.sourceId !== id);
    db.saveToStorage();
    return true;
  }
}

function validateAndCheckRuleOverlap(
  existingRules: StaffCompensationRule[],
  staffId: string,
  ruleType: string,
  startDate?: string,
  endDate?: string | null,
  serviceId?: string | null,
  branchId?: string | null,
  excludeRuleId?: string
): void {
  const isSingleInstanceType = ruleType === "BASE_SALARY" || ruleType === "DOCTOR_SITTING_FEE" || ruleType === "TAX_PERCENTAGE";
  if (!isSingleInstanceType && !serviceId) {
    return;
  }

  const start = startDate || "1970-01-01";
  const end = endDate || "9999-12-31";

  if (startDate && endDate && startDate > endDate) {
    throw new Error("Tanggal mulai berlaku (Effective From) tidak boleh melebihi tanggal berakhir (Effective Until)");
  }

  const matchingRules = existingRules.filter((r) => {
    if (excludeRuleId && r.id === excludeRuleId) return false;
    if (!r.isActive) return false;
    if (r.staffId !== staffId) return false;
    if (r.ruleTypeSnapshot !== ruleType) return false;

    // Check service matching
    if (serviceId) {
      if (r.serviceId !== serviceId) return false;
    }

    // Check branch matching
    const rBranch = r.branchId || null;
    const targetBranch = branchId || null;
    if (rBranch && targetBranch && rBranch !== targetBranch) return false;

    return true;
  });

  for (const r of matchingRules) {
    const rStart = r.effectiveStartDate || "1970-01-01";
    const rEnd = r.effectiveEndDate || "9999-12-31";

    if (start <= rEnd && rStart <= end) {
      throw new Error(
        `Aturan kompensasi bertabrakan (overlap) dengan aturan aktif "${r.name}" (${rStart} s/d ${r.effectiveEndDate || "selamanya"})`
      );
    }
  }
}

export class MockCompensationRepository implements CompensationRepository {
  async getCompensationRules(): Promise<StaffCompensationRule[]> {
    return db.rules.map((r: StaffCompensationRule) => ({ ...r }));
  }

  async getCompensationRulesByStaff(staffId: string): Promise<StaffCompensationRule[]> {
    const candidateIds = new Set<string>([staffId]);
    const doctor = (db.doctors || []).find((d: DentalDoctor) => d.id === staffId || d.staffId === staffId);
    const staff = (db.staff || []).find((s: Staff) => s.id === staffId || s.userAccountId === staffId);

    if (doctor) {
      candidateIds.add(doctor.id);
      if (doctor.staffId) candidateIds.add(doctor.staffId);
    }
    if (staff) {
      candidateIds.add(staff.id);
      if (staff.userAccountId) candidateIds.add(staff.userAccountId);
    }

    return db.rules
      .filter((r: StaffCompensationRule) => candidateIds.has(r.staffId))
      .map((r: StaffCompensationRule) => ({ ...r }));
  }

  async createCompensationRule(
    data: Omit<StaffCompensationRule, "id" | "createdAt" | "updatedAt"> & { id?: string }
  ): Promise<StaffCompensationRule> {
    if (
      !Number.isFinite(data.valueSnapshot) ||
      (data.ruleTypeSnapshot === "TAX_PERCENTAGE" ? data.valueSnapshot < 0 : data.valueSnapshot <= 0)
    ) {
      throw new Error("Nilai kompensasi tidak valid.");
    }
    if (
      (data.ruleTypeSnapshot === "PERCENTAGE" || data.ruleTypeSnapshot === "TAX_PERCENTAGE") &&
      data.valueSnapshot > 100
    ) {
      throw new Error("Persentase tidak boleh lebih dari 100%.");
    }
    if (data.ruleTypeSnapshot === "TAX_PERCENTAGE" && !data.branchId) {
      throw new Error("Aturan pajak harus ditetapkan untuk cabang tertentu.");
    }
    // Validate Doctor Sitting Fee
    if (data.ruleTypeSnapshot === "DOCTOR_SITTING_FEE") {
      const isDoc = (db.doctors || []).some((d: DentalDoctor) => d.id === data.staffId) ||
                    (db.staff || []).some((s: Staff) => s.id === data.staffId && s.position === StaffPosition.DOCTOR);
      if (!isDoc) {
        throw new Error("Doctor Sitting Fee hanya dapat diterapkan untuk Dokter");
      }
    }

    const isActive = data.isActive !== undefined ? data.isActive : true;
    if (isActive) {
      validateAndCheckRuleOverlap(
        db.rules,
        data.staffId,
        data.ruleTypeSnapshot,
        data.effectiveStartDate,
        data.effectiveEndDate,
        data.serviceId,
        data.branchId
      );
    }

    const now = AppClock.nowISO();
    const newRule: StaffCompensationRule = {
      id: data.id || `rule-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      staffId: data.staffId,
      name: data.name,
      ruleTypeSnapshot: data.ruleTypeSnapshot,
      valueSnapshot: data.valueSnapshot,
      isActive,
      serviceId: data.serviceId || null,
      branchId: data.branchId || null,
      effectiveStartDate: data.effectiveStartDate || undefined,
      effectiveEndDate: data.effectiveEndDate || null,
      createdAt: now,
      updatedAt: now
    };

    db.rules.push(newRule);
    db.saveToStorage();
    return { ...newRule };
  }

  async updateCompensationRule(
    id: string,
    updates: Partial<Omit<StaffCompensationRule, "id" | "createdAt" | "updatedAt">>
  ): Promise<StaffCompensationRule> {
    const rule = db.rules.find((r: StaffCompensationRule) => r.id === id);
    if (!rule) {
      throw new Error("Aturan kompensasi tidak ditemukan");
    }

    const nextStaffId = updates.staffId || rule.staffId;
    const nextType = updates.ruleTypeSnapshot || rule.ruleTypeSnapshot;
    const nextActive = updates.isActive !== undefined ? updates.isActive : rule.isActive;
    const nextStart = updates.effectiveStartDate !== undefined ? updates.effectiveStartDate : rule.effectiveStartDate;
    const nextEnd = updates.effectiveEndDate !== undefined ? updates.effectiveEndDate : rule.effectiveEndDate;
    const nextService = updates.serviceId !== undefined ? updates.serviceId : rule.serviceId;
    const nextBranch = updates.branchId !== undefined ? updates.branchId : rule.branchId;

    if (nextType === "DOCTOR_SITTING_FEE") {
      const isDoc = (db.doctors || []).some((d: DentalDoctor) => d.id === nextStaffId) ||
                    (db.staff || []).some((s: Staff) => s.id === nextStaffId && s.position === StaffPosition.DOCTOR);
      if (!isDoc) {
        throw new Error("Doctor Sitting Fee hanya dapat diterapkan untuk Dokter");
      }
    }

    if (nextActive) {
      validateAndCheckRuleOverlap(
        db.rules,
        nextStaffId,
        nextType,
        nextStart,
        nextEnd,
        nextService,
        nextBranch,
        id
      );
    }

    Object.assign(rule, updates, { updatedAt: AppClock.nowISO() });
    db.saveToStorage();
    return { ...rule };
  }

  async getCompensationAccruals(staffId?: string): Promise<CompensationAccrual[]> {
    if (staffId) {
      const candidateIds = new Set<string>([staffId]);
      const doctor = (db.doctors || []).find((d: DentalDoctor) => d.id === staffId || d.staffId === staffId);
      const staff = (db.staff || []).find((s: Staff) => s.id === staffId || s.userAccountId === staffId);

      if (doctor) {
        candidateIds.add(doctor.id);
        if (doctor.staffId) candidateIds.add(doctor.staffId);
      }
      if (staff) {
        candidateIds.add(staff.id);
        if (staff.userAccountId) candidateIds.add(staff.userAccountId);
      }

      return db.accruals
        .filter((a: CompensationAccrual) => candidateIds.has(a.staffId))
        .map((a: CompensationAccrual) => ({ ...a }));
    }
    return db.accruals.map((a: CompensationAccrual) => ({ ...a }));
  }

  async calculateAndAccrueForTreatment(treatmentJobId: string): Promise<CompensationAccrual[]> {
    const job = db.treatmentJobs.find((t: TreatmentJob) => t.id === treatmentJobId);
    if (!job) {
      throw new Error("Treatment job tidak ditemukan");
    }

    if (job.status !== TreatmentJobStatus.SELESAI && job.status !== TreatmentJobStatus.DISERAHKAN) {
      throw new Error("Akrual kompensasi hanya dapat dihitung untuk treatment yang sudah SELESAI atau DISERAHKAN");
    }

    const paidInvoices = db.invoices.filter((invoice: Invoice) =>
      invoice.visitId === job.visitId && invoice.status === InvoiceStatus.PAID
    );
    if (paidInvoices.length > 1) {
      throw new Error("Tindakan terhubung ke lebih dari satu invoice lunas. Periksa data tagihan sebelum menghitung kompensasi.");
    }
    const invoice = paidInvoices[0];
    if (!invoice) return [];
    const invoiceItems = db.invoiceItems.filter((item: InvoiceItem) => item.invoiceId === invoice.id);
    const linkedItems = invoiceItems.filter((item: InvoiceItem) => item.treatmentJobId === job.id);
    if (linkedItems.length === 0) return [];
    if (linkedItems.length > 1) throw new Error("Tindakan tertaut ke lebih dari satu baris invoice.");
    const allocations = allocateInvoiceNetToLines(
      invoiceItems.map((item: InvoiceItem) => ({ id: item.id, amount: item.amount })),
      Math.max(0, invoice.totalAmount - invoice.discountAmount)
    );
    const baseAmount = allocations.get(linkedItems[0].id) || 0;
    const now = invoice.updatedAt || AppClock.nowISO();
    const treatmentDate = job.completedAt ? job.completedAt.split("T")[0] : now.split("T")[0];
    const existingAccruals = db.accruals.filter((accrual: CompensationAccrual) => accrual.sourceId === job.id);
    const existingRuleKeys = new Set(existingAccruals.map((accrual) => `${accrual.staffId}:${accrual.ruleIdSnapshot}`));
    const createdAccruals: CompensationAccrual[] = [...existingAccruals];

    const isRuleEffectiveOnDate = (rule: StaffCompensationRule, dateStr: string) => {
      if (!rule.isActive) return false;
      if (rule.effectiveStartDate && rule.effectiveStartDate > dateStr) return false;
      if (rule.effectiveEndDate && rule.effectiveEndDate < dateStr) return false;
      return true;
    };

    // Find rules for doctor (excluding BASE_SALARY and DOCTOR_SITTING_FEE)
    const doctor = (db.doctors || []).find((d: DentalDoctor) => d.id === job.doctorId || d.staffId === job.doctorId);
    const doctorCandidateIds = new Set<string>([job.doctorId]);
    if (doctor) {
      doctorCandidateIds.add(doctor.id);
      if (doctor.staffId) doctorCandidateIds.add(doctor.staffId);
    }

    const doctorRules = db.rules.filter((r: StaffCompensationRule) =>
      doctorCandidateIds.has(r.staffId) &&
      (!r.branchId || r.branchId === job.branchId) &&
      isRuleEffectiveOnDate(r, treatmentDate)
    );
    for (const rule of doctorRules) {
      if (rule.ruleTypeSnapshot === "BASE_SALARY" || rule.ruleTypeSnapshot === "DOCTOR_SITTING_FEE" || rule.ruleTypeSnapshot === "TAX_PERCENTAGE") continue;
      if (rule.serviceId && rule.serviceId !== job.serviceId) continue;
      if (existingRuleKeys.has(`${job.doctorId}:${rule.id}`)) continue;

      let amount = 0;
      if (rule.ruleTypeSnapshot === "PERCENTAGE") {
        amount = Math.round((baseAmount * rule.valueSnapshot) / 100);
      } else if (rule.ruleTypeSnapshot === "FIXED_PER_TREATMENT") {
        amount = rule.valueSnapshot;
      }

      const accrual: CompensationAccrual = {
        id: `accrual-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        staffId: job.doctorId,
        branchId: job.branchId,
        ruleIdSnapshot: rule.id,
        ruleTypeSnapshot: rule.ruleTypeSnapshot,
        valueSnapshot: rule.valueSnapshot,
        baseAmountSnapshot: baseAmount,
        amount,
        sourceId: job.id,
        accruedAt: now
      };

      db.accruals.push(accrual);
      createdAccruals.push(accrual);
      existingRuleKeys.add(`${job.doctorId}:${rule.id}`);
    }

    // Find rules for assistant if assigned
    if (job.picAssistantId) {
      const assistantRules = db.rules.filter((r: StaffCompensationRule) =>
        r.staffId === job.picAssistantId &&
        (!r.branchId || r.branchId === job.branchId) &&
        isRuleEffectiveOnDate(r, treatmentDate)
      );
      for (const rule of assistantRules) {
        if (rule.ruleTypeSnapshot === "BASE_SALARY" || rule.ruleTypeSnapshot === "DOCTOR_SITTING_FEE" || rule.ruleTypeSnapshot === "TAX_PERCENTAGE") continue;
        if (rule.serviceId && rule.serviceId !== job.serviceId) continue;
        if (existingRuleKeys.has(`${job.picAssistantId}:${rule.id}`)) continue;

        let amount = 0;
        if (rule.ruleTypeSnapshot === "PERCENTAGE") {
          amount = Math.round((baseAmount * rule.valueSnapshot) / 100);
        } else if (rule.ruleTypeSnapshot === "FIXED_PER_TREATMENT") {
          amount = rule.valueSnapshot;
        }

        const accrual: CompensationAccrual = {
          id: `accrual-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
          staffId: job.picAssistantId,
          branchId: job.branchId,
          ruleIdSnapshot: rule.id,
          ruleTypeSnapshot: rule.ruleTypeSnapshot,
          valueSnapshot: rule.valueSnapshot,
          baseAmountSnapshot: baseAmount,
          amount,
          sourceId: job.id,
          accruedAt: now
        };

        db.accruals.push(accrual);
        createdAccruals.push(accrual);
        existingRuleKeys.add(`${job.picAssistantId}:${rule.id}`);
      }
    }

    const visit = db.visits.find((item) => item.id === job.visitId);
    const booking = visit?.bookingId
      ? db.bookings.find((item) => item.id === visit.bookingId)
      : undefined;
    if (visit && booking?.referringStaffId) {
      const referralSourceId = `referral:visit:${visit.id}`;
      const referralRuleId = "STAFF_VISIT_REFERRAL_RP3000_V1";
      const referralExists = db.accruals.some((accrual: CompensationAccrual) =>
        accrual.sourceId === referralSourceId && accrual.ruleIdSnapshot === referralRuleId
      );
      if (!referralExists) {
        const referralAccrual: CompensationAccrual = {
          id: `accrual-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
          staffId: booking.referringStaffId,
          ruleIdSnapshot: referralRuleId,
          ruleTypeSnapshot: "STAFF_VISIT_REFERRAL",
          valueSnapshot: 3000,
          baseAmountSnapshot: invoice.netAmount,
          amount: 3000,
          sourceId: referralSourceId,
          accruedAt: now
        };
        db.accruals.push(referralAccrual);
        createdAccruals.push(referralAccrual);
      }
    }

    return createdAccruals;
  }

  async deleteAccrual(id: string, currentUserRole?: UserRole): Promise<boolean> {
    if (currentUserRole && currentUserRole !== UserRole.SUPER_ADMIN && currentUserRole !== UserRole.BRANCH_ADMIN) {
      throw new Error("Akses ditolak: Hanya Super Admin atau Branch Admin yang dapat menghapus akrual kompensasi.");
    }
    const idx = (db.accruals || []).findIndex((a: CompensationAccrual) => a.id === id);
    if (idx === -1) return false;
    if ((db.payrollItems || []).some((item: PayrollItem) => item.sourceId === id)) {
      throw new Error("Akrual ini sudah dimasukkan ke rincian payroll dan tidak dapat dihapus.");
    }
    if ((db.journals || []).some((journal: JournalEntry) =>
      journal.sourceType === JournalSourceType.COMPENSATION && journal.sourceId === id
    )) {
      throw new Error("Akrual ini sudah memiliki jurnal akuntansi. Batalkan melalui proses koreksi jurnal sebelum menghapus sumbernya.");
    }
    db.accruals.splice(idx, 1);
    db.saveToStorage();
    return true;
  }

  async deleteCompensationRule(id: string, currentUserRole?: UserRole): Promise<boolean> {
    if (currentUserRole && currentUserRole !== UserRole.SUPER_ADMIN) {
      throw new Error("Akses ditolak: Hanya Super Admin yang dapat menghapus aturan kompensasi.");
    }
    const idx = (db.rules || []).findIndex((r: StaffCompensationRule) => r.id === id);
    if (idx === -1) return false;
    db.rules.splice(idx, 1);
    db.saveToStorage();
    return true;
  }
}

export class MockPayrollRepository implements PayrollRepository {
  async getPayrolls(month?: number, year?: number): Promise<MonthlyPayroll[]> {
    let list = [...db.payrolls];
    if (month !== undefined) {
      list = list.filter((p: MonthlyPayroll) => p.month === month);
    }
    if (year !== undefined) {
      list = list.filter((p: MonthlyPayroll) => p.year === year);
    }
    return list.map((p: MonthlyPayroll) => ({ ...p }));
  }

  async getPayrollById(id: string): Promise<MonthlyPayroll | null> {
    const p = db.payrolls.find((item: MonthlyPayroll) => item.id === id);
    return p ? { ...p } : null;
  }

  async getPayrollItems(payrollId: string): Promise<PayrollItem[]> {
    return db.payrollItems.filter((item: PayrollItem) => item.payrollId === payrollId).map((item: PayrollItem) => ({ ...item }));
  }

  async getPayrollItemsByPayrollIds(payrollIds: string[]): Promise<PayrollItem[]> {
    const ids = new Set(payrollIds);
    return db.payrollItems
      .filter((item: PayrollItem) => ids.has(item.payrollId))
      .map((item: PayrollItem) => ({ ...item }));
  }

  async generateMonthlyPayroll(
    staffId: string,
    month: number,
    year: number,
    baseSalary?: number,
    preserveExisting = false,
    requestedBranchId?: string | null
  ): Promise<MonthlyPayroll> {
    const now = AppClock.nowISO();
    const staff = db.staff.find(s => s.id === staffId || s.userAccountId === staffId);
    const doctor = db.doctors.find(d => d.id === staffId || d.staffId === staffId);
    const candidateIds = new Set<string>([staffId]);
    if (staff) {
      candidateIds.add(staff.id);
      if (staff.userAccountId) candidateIds.add(staff.userAccountId);
    }
    if (doctor) {
      candidateIds.add(doctor.id);
      if (doctor.staffId) candidateIds.add(doctor.staffId);
    }

    const payrollKeyId = staff?.id || doctor?.staffId || doctor?.id || staffId;
    const staffBranchId = requestedBranchId || staff?.branchId || doctor?.assignedBranchId || null;
    const payrollId = `payroll-${payrollKeyId}-${staffBranchId || "global"}-${year}-${month}`;
    const periodDate = `${year}-${String(month).padStart(2, "0")}-15`;

    // Check if payroll already exists
    let existingIndex = db.payrolls.findIndex((p: MonthlyPayroll) =>
      (p.id === payrollId || (p.staffId === staffId && p.month === month && p.year === year)) &&
      (p.branchId || null) === staffBranchId
    );
    if (preserveExisting && existingIndex >= 0) {
      return { ...db.payrolls[existingIndex] };
    }

    const activeRules = (db.rules || []).filter((r: StaffCompensationRule) =>
      candidateIds.has(r.staffId) &&
      r.isActive &&
      (!r.branchId || r.branchId === staffBranchId) &&
      (!r.effectiveStartDate || r.effectiveStartDate <= periodDate) &&
      (!r.effectiveEndDate || r.effectiveEndDate >= periodDate)
    );
    const getApplicableRule = (ruleType: StaffCompensationRule["ruleTypeSnapshot"]) =>
      activeRules.find((rule) => rule.ruleTypeSnapshot === ruleType && Boolean(staffBranchId) && rule.branchId === staffBranchId) ||
      activeRules.find((rule) => rule.ruleTypeSnapshot === ruleType && !rule.branchId);
    const activeBaseRule = getApplicableRule("BASE_SALARY");
    if (baseSalary === undefined && preserveExisting && !activeBaseRule) {
      throw new Error("Draft tidak dibuat: tidak ada aturan gaji pokok aktif untuk periode ini.");
    }
    const effectiveBaseSalary = baseSalary !== undefined ? baseSalary : activeBaseRule?.valueSnapshot ?? 2500000;
    const isDoctor = staff?.position === StaffPosition.DOCTOR || !!doctor;

    // Calculate accruals for the same person only within the target month.
    const staffAccruals = db.accruals.filter((a: CompensationAccrual) => {
      if (!candidateIds.has(a.staffId)) return false;
      if (requestedBranchId && a.branchId !== requestedBranchId) return false;
      if (!a.accruedAt) return false;
      const [accYear, accMonth] = a.accruedAt.slice(0, 7).split("-").map((part) => parseInt(part, 10));
      return accYear === year && accMonth === month;
    });
    let totalCompensation = staffAccruals.reduce((sum: number, a: CompensationAccrual) => sum + a.amount, 0);
    const replacementAssignments = db.replacementAssignments.filter((assignment: StaffReplacementAssignment) => {
      const [assignmentYear, assignmentMonth] = assignment.coveredDate.split("-").map(Number);
      return assignment.replacementStaffId === (staff?.id || staffId)
        && Boolean(assignment.workConfirmedAt)
        && (!staffBranchId || assignment.branchId === staffBranchId)
        && assignmentYear === year
        && assignmentMonth === month;
    });
    totalCompensation += replacementAssignments.reduce(
      (sum: number, assignment: StaffReplacementAssignment) => sum + assignment.amountSnapshot,
      0
    );

    // Calculate Doctor Sitting Fee if applicable
    let doctorSittingFeeAmount = 0;
    let sittingFeeSessionCount = 0;
    const activeSittingRule = getApplicableRule("DOCTOR_SITTING_FEE");
    const taxRule = getApplicableRule("TAX_PERCENTAGE");

    if (activeSittingRule) {
      const monthlySchedules = (db.doctorSchedules || []).filter((sch: DoctorSchedule) => {
        if (sch.doctorId !== staffId && sch.doctorId !== doctor?.id && sch.doctorId !== doctor?.staffId) return false;
        if (staffBranchId && sch.branchId !== staffBranchId) return false;
        if (sch.status === ScheduleStatus.CANCELLED) return false;
        const [sYear, sMonth] = sch.date.split("-").map(n => parseInt(n, 10));
        return sYear === year && sMonth === month;
      });

      const monthlyAttendances = (db.attendances || []).filter((att: Attendance) => {
        if (att.staffId !== staffId && att.staffId !== staff?.id && att.staffId !== doctor?.staffId && att.staffId !== doctor?.id) return false;
        if (staffBranchId && att.branchId !== staffBranchId) return false;
        if (att.attendanceStatus !== AttendanceStatus.PRESENT) return false;
        const [aYear, aMonth] = att.date.split("-").map(n => parseInt(n, 10));
        return aYear === year && aMonth === month;
      });

      sittingFeeSessionCount = Math.max(monthlySchedules.length, monthlyAttendances.length);
      if (sittingFeeSessionCount > 0) {
        doctorSittingFeeAmount = sittingFeeSessionCount * activeSittingRule.valueSnapshot;
        totalCompensation += doctorSittingFeeAmount;
      }
    }

    // PHASE HR-4: Fetch APPROVED overtime records for this staff in this month/year period
    const approvedOvertimes = db.overtimes.filter((o: OvertimeRecord) => {
      const matchesStaff = o.staffId === staffId || (staff && o.staffId === staff.id) || (doctor && (o.staffId === doctor.id || o.staffId === doctor.staffId));
      if (isDoctor || !matchesStaff || o.status !== OvertimeStatus.APPROVED || (staffBranchId && o.branchId !== staffBranchId)) {
        return false;
      }
      const parts = o.date.split("-");
      if (parts.length >= 2) {
        const oYear = parseInt(parts[0], 10);
        const oMonth = parseInt(parts[1], 10);
        return oYear === year && oMonth === month;
      }
      return false;
    });

    let totalOvertimeAmount = 0;
    const validOvertimeRecords: OvertimeRecord[] = [];
    for (const ot of approvedOvertimes) {
      if (ot.overtimeAmountSnapshot !== null && ot.overtimeAmountSnapshot !== undefined) {
        totalOvertimeAmount += ot.overtimeAmountSnapshot;
        validOvertimeRecords.push(ot);
      }
    }

    const absenceByDate = new Map<string, Attendance>();
    for (const attendance of db.attendances as Attendance[]) {
      const matchesStaff = candidateIds.has(attendance.staffId);
      const [attendanceYear, attendanceMonth] = attendance.date.split("-").map(Number);
      if (
        matchesStaff
        && attendanceYear === year
        && attendanceMonth === month
        && (!staffBranchId || attendance.branchId === staffBranchId)
        && [AttendanceStatus.ABSENT, AttendanceStatus.SICK, AttendanceStatus.LEAVE].includes(attendance.attendanceStatus)
        && !absenceByDate.has(attendance.date)
      ) {
        absenceByDate.set(attendance.date, attendance);
      }
    }
    const dailySalary = Math.round(effectiveBaseSalary / 25);
    const absenceRecords = [...absenceByDate.values()];
    const dailyAbsenceDeduction = isDoctor ? 60000 : dailySalary;
    const absenceDeductions = absenceRecords.length * dailyAbsenceDeduction;
    const grossIncome = effectiveBaseSalary + totalCompensation + totalOvertimeAmount;
    const taxRate = taxRule?.valueSnapshot || 0;
    const taxAmount = taxRule ? calculatePayrollTax(grossIncome, taxRate) : 0;
    const totalDeductions = absenceDeductions + taxAmount;
    const netSalary = grossIncome - totalDeductions;
    if (grossIncome <= 0) {
      throw new Error("Draft tidak dibuat: total gaji pokok dan komponen pembayaran periode ini bernilai nol.");
    }

    const payroll: MonthlyPayroll = {
      id: payrollId,
      staffId,
      month,
      year,
      baseSalary: effectiveBaseSalary,
      totalCompensation,
      totalDeductions,
      netSalary,
      status: PayrollStatus.DRAFT,
      branchId: staffBranchId || null,
      bankNameSnapshot: staff?.bankName || doctor?.bankName || null,
      bankAccountNumberSnapshot: staff?.bankAccountNumber || doctor?.bankAccountNumber || null,
      bankAccountHolderSnapshot: staff?.bankAccountHolder || doctor?.bankAccountHolder || staff?.fullName || doctor?.name || null,
      createdAt: now,
      updatedAt: now
    };

    if (existingIndex >= 0) {
      db.payrolls[existingIndex] = payroll;
    } else {
      db.payrolls.push(payroll);
    }

    // Remove existing payroll items for this payroll
    db.payrollItems = db.payrollItems.filter((item: PayrollItem) => item.payrollId !== payrollId);

    // Add Base salary item
    db.payrollItems.push({
      id: `item-${payrollId}-base`,
      payrollId,
      descriptionSnapshot: `Gaji Pokok Periode ${month}/${year}`,
      amountSnapshot: effectiveBaseSalary,
      type: "EARNING"
    });

    // Add Doctor Sitting Fee item if applicable
    if (activeSittingRule && sittingFeeSessionCount > 0 && doctorSittingFeeAmount > 0) {
      db.payrollItems.push({
        id: `item-${payrollId}-sitting-fee`,
        payrollId,
        descriptionSnapshot: `Doctor Sitting Fee (${sittingFeeSessionCount} sesi @ Rp${activeSittingRule.valueSnapshot.toLocaleString("id-ID")})`,
        amountSnapshot: doctorSittingFeeAmount,
        type: "EARNING",
        sourceId: activeSittingRule.id
      });
    }

    // Add Accrual items
    staffAccruals.forEach((accrual: CompensationAccrual, idx: number) => {
      db.payrollItems.push({
        id: `item-${payrollId}-accrual-${idx + 1}`,
        payrollId,
        descriptionSnapshot: accrual.ruleTypeSnapshot === "STAFF_VISIT_REFERRAL"
          ? `Insentif Referral Kunjungan (#${accrual.sourceId})`
          : isDoctor
            ? `Sharing Dokter - Kompensasi Tindakan (#${accrual.sourceId})`
            : `Insentif Kompensasi Tindakan (#${accrual.sourceId})`,
        amountSnapshot: accrual.amount,
        type: "EARNING",
        sourceId: accrual.id
      });
    });

    replacementAssignments.forEach((assignment: StaffReplacementAssignment) => {
      db.payrollItems.push({
        id: `item-${payrollId}-replacement-${assignment.id}`,
        payrollId,
        descriptionSnapshot: `Upah Pengganti (${assignment.coveredDate}; gaji pegawai digantikan Rp${assignment.absentBaseSalarySnapshot.toLocaleString("id-ID")} ÷ 25)`,
        amountSnapshot: assignment.amountSnapshot,
        type: "EARNING",
        sourceId: assignment.id
      });
    });

    // Add Approved Overtime items using snapshot values
    validOvertimeRecords.forEach((ot: OvertimeRecord, idx: number) => {
      db.payrollItems.push({
        id: `item-${payrollId}-ot-${idx + 1}`,
        payrollId,
        descriptionSnapshot: `Lembur Disetujui (${ot.overtimeHours} jam / ${ot.date})`,
        amountSnapshot: ot.overtimeAmountSnapshot || 0,
        type: "EARNING",
        sourceId: ot.id
      });
    });

    absenceRecords.forEach((attendance: Attendance) => {
      db.payrollItems.push({
        id: `item-${payrollId}-absence-${attendance.id}`,
        payrollId,
        descriptionSnapshot: `Potongan Ketidakhadiran (${attendance.attendanceStatus} / ${attendance.date})`,
        amountSnapshot: dailyAbsenceDeduction,
        type: "DEDUCTION",
        sourceId: attendance.id
      });
    });

    if (taxRule) {
      db.payrollItems.push({
        id: `item-${payrollId}-tax`,
        payrollId,
        descriptionSnapshot: `Potongan Pajak (${taxRate}% dari bruto)`,
        amountSnapshot: taxAmount,
        type: "DEDUCTION",
        sourceId: taxRule?.id
      });
    }

    return { ...payroll };
  }

  async updatePayrollStatus(
    id: string,
    status: PayrollStatus
  ): Promise<MonthlyPayroll> {
    const p = db.payrolls.find((item: MonthlyPayroll) => item.id === id);
    if (!p) {
      throw new Error("Payroll tidak ditemukan");
    }

    const oldStatus = p.status;
    p.status = status;
    p.updatedAt = AppClock.nowISO();

    // Trigger Accounting Integration
    if (oldStatus !== status) {
      await this.handlePayrollAccounting(p);
    }
    if (status === PayrollStatus.PAID && oldStatus !== PayrollStatus.PAID) {
      const overtimeIds = new Set(
        db.payrollItems
          .filter((item) => item.payrollId === p.id && item.descriptionSnapshot.startsWith("Lembur Disetujui"))
          .map((item) => item.sourceId)
          .filter((sourceId): sourceId is string => Boolean(sourceId))
      );
      db.overtimes.forEach((overtime) => {
        if (overtimeIds.has(overtime.id) && overtime.status === OvertimeStatus.APPROVED) {
          overtime.status = OvertimeStatus.PAID;
          overtime.updatedAt = AppClock.nowISO();
        }
      });
    }

    return { ...p };
  }

  async reopenReviewedPayrollForCorrection(id: string, currentUserRole?: UserRole): Promise<MonthlyPayroll> {
    if (currentUserRole !== UserRole.SUPER_ADMIN) {
      throw new Error("Akses ditolak: hanya Super Admin yang dapat mengembalikan payroll REVIEW untuk koreksi.");
    }
    const payroll = db.payrolls.find((item: MonthlyPayroll) => item.id === id);
    if (!payroll) throw new Error("Payroll tidak ditemukan.");
    if (payroll.status !== PayrollStatus.REVIEW) {
      throw new Error("Hanya payroll berstatus REVIEW yang dapat dikembalikan ke DRAFT.");
    }
    if (db.journals.some((journal) =>
      journal.sourceType === JournalSourceType.PAYROLL && journal.sourceId === id
    )) {
      throw new Error("Payroll memiliki riwayat jurnal dan tidak dapat dibuka kembali untuk koreksi.");
    }
    db.payrollItems = db.payrollItems.filter((item: PayrollItem) => item.payrollId !== id);
    payroll.status = PayrollStatus.DRAFT;
    payroll.totalCompensation = 0;
    payroll.totalDeductions = 0;
    payroll.netSalary = 0;
    payroll.updatedAt = AppClock.nowISO();
    return { ...payroll };
  }

  private async handlePayrollAccounting(payroll: MonthlyPayroll) {
    const journalRepo = new MockAccountingRepository();
    const staff = db.staff.find(s => s.id === payroll.staffId);
    const staffName = staff ? staff.name : "Staff";
    const branchId = payroll.branchId || staff?.branchId || "default-branch";
    const dateStr = AppClock.nowISO().split("T")[0]; // YYYY-MM-DD

    if (payroll.status === PayrollStatus.APPROVED) {
      // 1. ACCRUAL JOURNAL
      const existingAccrual = db.journals.find(
        j =>
          j.sourceType === JournalSourceType.PAYROLL &&
          j.sourceId === payroll.id &&
          (j.event === "ACCRUAL" || j.description.includes("Accrual") || j.description.includes("Akrual")) &&
          j.status !== JournalStatus.VOID
      );
      if (existingAccrual) return;

      const items = db.payrollItems.filter(item => item.payrollId === payroll.id);
      if (items.length === 0) return;

      const journalLines: any[] = [];

      for (const item of items) {
        if (item.type !== "EARNING") continue;
        const amount = item.amountSnapshot;
        if (amount <= 0) continue;

        let expenseAccount = "coa-5000"; // Beban Gaji Staff (Salary Expense)
        let payableAccount = "coa-2010"; // Hutang Gaji Staff (Payroll Payable)

        const desc = item.descriptionSnapshot.toLowerCase();
        if (desc.includes("komisi") || desc.includes("bagi hasil") || item.id.includes("-accrual-")) {
          expenseAccount = "coa-5020"; // Beban Insentif Staff (Incentive Expense)
          payableAccount = "coa-2030"; // Hutang Insentif & Kompensasi (Incentive Payable)
        } else if (desc.includes("lembur") || desc.includes("overtime") || item.id.includes("-ot-")) {
          expenseAccount = "coa-5020"; // Beban Insentif Staff (Incentive Expense)
          payableAccount = "coa-2030"; // Hutang Insentif & Kompensasi (Incentive Payable)
        }

        // Debit: Expense Account
        journalLines.push({
          accountId: expenseAccount,
          debit: amount,
          credit: 0,
          branchId,
          description: `Akrual ${item.descriptionSnapshot}`
        });

        // Credit: Payable Account
        journalLines.push({
          accountId: payableAccount,
          debit: 0,
          credit: amount,
          branchId,
          description: `Akrual Kewajiban ${item.descriptionSnapshot}`
        });
      }

      if (journalLines.length > 0) {
        const draftJournal = await journalRepo.createDraftJournal(
          {
            journalDate: dateStr,
            branchId,
            description: `Accrual Gaji Bulanan - ${staffName} (Periode ${payroll.month}/${payroll.year})`,
            sourceType: JournalSourceType.PAYROLL,
            sourceId: payroll.id,
            lines: journalLines,
            event: "ACCRUAL"
          },
          "System Accounting Trigger"
        );

        await journalRepo.postJournal(draftJournal.id, "System Accounting Trigger");
      }

    } else if (payroll.status === PayrollStatus.PAID) {
      // 2. PAYMENT JOURNAL
      const existingPayment = db.journals.find(
        j =>
          j.sourceType === JournalSourceType.PAYROLL &&
          j.sourceId === payroll.id &&
          (j.event === "PAYMENT" || j.description.includes("Payment") || j.description.includes("Pembayaran")) &&
          j.status !== JournalStatus.VOID
      );
      if (existingPayment) return;

      const netAmt = payroll.netSalary;
      if (netAmt <= 0) return;

      const items = db.payrollItems.filter(item => item.payrollId === payroll.id);
      
      const baseSalary = items.find(item => item.id.endsWith("-base") && item.type === "EARNING")?.amountSnapshot || 0;
      const otherEarnings = items.filter(item => !item.id.endsWith("-base") && item.type === "EARNING").reduce((sum, item) => sum + item.amountSnapshot, 0);

      const journalLines: any[] = [];

      if (baseSalary > 0) {
        journalLines.push({
          accountId: "coa-2010", // Hutang Gaji Staff
          debit: baseSalary,
          credit: 0,
          branchId,
          description: `Pelunasan Hutang Gaji Pokok - ${staffName} (Periode ${payroll.month}/${payroll.year})`
        });
      }

      if (otherEarnings > 0) {
        journalLines.push({
          accountId: "coa-2030", // Hutang Insentif & Kompensasi
          debit: otherEarnings,
          credit: 0,
          branchId,
          description: `Pelunasan Hutang Insentif & Komisi - ${staffName} (Periode ${payroll.month}/${payroll.year})`
        });
      }

      // If no itemized earnings exist (fallback to netSalary directly on coa-2010)
      if (journalLines.length === 0) {
        journalLines.push({
          accountId: "coa-2010", // Hutang Gaji Staff (Payroll Payable)
          debit: netAmt,
          credit: 0,
          branchId,
          description: `Pelunasan Hutang Gaji Bulanan - ${staffName} (Periode ${payroll.month}/${payroll.year})`
        });
      }

      // Bank Payment Credit
      journalLines.push({
        accountId: "coa-1010", // Bank
        debit: 0,
        credit: netAmt,
        branchId,
        description: `Pembayaran Gaji Bulanan - ${staffName} via Bank (Periode ${payroll.month}/${payroll.year})`
      });

      // Deduction mapping to balance the gross debit vs net credit
      const deductionItems = items.filter(item => item.type === "DEDUCTION");
      let mappedDeductionsTotal = 0;

      for (const ded of deductionItems) {
        if (ded.amountSnapshot <= 0) continue;
        
        let targetAccount = "coa-4100"; // Default: Pendapatan Lain-lain (Other Revenue)
        const desc = ded.descriptionSnapshot.toLowerCase();
        
        if (desc.includes("pajak") || desc.includes("tax") || desc.includes("pph") || desc.includes("bpjs")) {
          targetAccount = "coa-2040"; // Hutang Pajak (Tax Payable)
        } else if (desc.includes("kasbon") || desc.includes("piutang") || desc.includes("advance")) {
          targetAccount = "coa-1100"; // Piutang Pasien / Receivables recovery
        }

        journalLines.push({
          accountId: targetAccount,
          debit: 0,
          credit: ded.amountSnapshot,
          branchId,
          description: `Withholding / Potongan ${ded.descriptionSnapshot} - ${staffName} (Periode ${payroll.month}/${payroll.year})`
        });
        mappedDeductionsTotal += ded.amountSnapshot;
      }

      const remainingDeduction = (payroll.totalDeductions || 0) - mappedDeductionsTotal;
      if (remainingDeduction > 0) {
        journalLines.push({
          accountId: "coa-4100", // Pendapatan Lain-lain
          debit: 0,
          credit: remainingDeduction,
          branchId,
          description: `Potongan Gaji Lainnya - ${staffName} (Periode ${payroll.month}/${payroll.year})`
        });
      }

      const draftJournal = await journalRepo.createDraftJournal(
        {
          journalDate: dateStr,
          branchId,
          description: `Payment Gaji Bulanan - ${staffName} (Periode ${payroll.month}/${payroll.year})`,
          sourceType: JournalSourceType.PAYROLL,
          sourceId: payroll.id,
          lines: journalLines,
          event: "PAYMENT"
        },
        "System Accounting Trigger"
      );

      await journalRepo.postJournal(draftJournal.id, "System Accounting Trigger");
    }
  }

  async deletePayroll(id: string, currentUserRole?: UserRole): Promise<boolean> {
    if (currentUserRole && currentUserRole !== UserRole.SUPER_ADMIN && currentUserRole !== UserRole.BRANCH_ADMIN) {
      throw new Error("Akses ditolak: Hanya Super Admin atau Branch Admin yang dapat menghapus slip gaji.");
    }
    const idx = (db.payrolls || []).findIndex((p: MonthlyPayroll) => p.id === id);
    if (idx === -1) return false;
    if (db.payrolls[idx].status !== PayrollStatus.DRAFT) {
      throw new Error("Hanya payroll berstatus DRAFT yang dapat dihapus. Payroll yang sudah masuk tahap Review tidak boleh dihapus.");
    }
    if ((db.journals || []).some((journal: JournalEntry) =>
      journal.sourceType === JournalSourceType.PAYROLL && journal.sourceId === id
    )) {
      throw new Error("Payroll ini sudah memiliki jurnal akuntansi dan tidak dapat dihapus sebelum koreksi jurnal diselesaikan.");
    }
    db.payrolls.splice(idx, 1);
    db.payrollItems = (db.payrollItems || []).filter((item: PayrollItem) => item.payrollId !== id);
    return true;
  }
}

export class MockConfigurationRepository implements ConfigurationRepository {
  async getServices(): Promise<MasterService[]> {
    if (!db.services || !Array.isArray(db.services) || db.services.length === 0) {
      db.services = JSON.parse(JSON.stringify(MOCK_SERVICES));
      db.saveToStorage();
    }
    return db.services.map((s: MasterService) => ({ ...s }));
  }

  async createService(
    data: Omit<MasterService, "id" | "createdAt" | "updatedAt"> & { id?: string }
  ): Promise<MasterService> {
    const now = AppClock.nowISO();
    const newService: MasterService = {
      id: data.id || `service-${Date.now()}`,
      code: data.code,
      name: data.name,
      description: data.description || "",
      basePrice: data.basePrice,
      estimatedDurationMinutes: data.estimatedDurationMinutes,
      category: data.category,
      displayOrder: data.displayOrder || db.services.length + 1,
      isActive: data.isActive !== undefined ? data.isActive : true,
      createdAt: now,
      updatedAt: now
    };

    db.services.push(newService);
    db.saveToStorage();
    return { ...newService };
  }

  async updateService(
    id: string,
    updates: Partial<Omit<MasterService, "id" | "createdAt" | "updatedAt">>
  ): Promise<MasterService> {
    const s = db.services.find((item: MasterService) => item.id === id);
    if (!s) {
      throw new Error("Layanan tidak ditemukan");
    }

    Object.assign(s, updates, { updatedAt: AppClock.nowISO() });
    db.saveToStorage();
    return { ...s };
  }

  async getBranchTariffs(branchId: string): Promise<BranchServiceTariff[]> {
    if (!db.tariffs || !Array.isArray(db.tariffs) || db.tariffs.length === 0) {
      db.tariffs = JSON.parse(JSON.stringify(MOCK_BRANCH_TARIFFS));
      db.saveToStorage();
    }
    return db.tariffs.filter((t: BranchServiceTariff) => t.branchId === branchId).map((t: BranchServiceTariff) => ({ ...t }));
  }

  async setBranchTariff(
    branchId: string,
    serviceId: string,
    customPrice: number
  ): Promise<BranchServiceTariff> {
    const now = AppClock.nowISO();
    let tariff = db.tariffs.find((t: BranchServiceTariff) => t.branchId === branchId && t.serviceId === serviceId);

    if (tariff) {
      tariff.customPrice = customPrice;
      tariff.updatedAt = now;
      db.saveToStorage();
      return { ...tariff };
    }

    const newTariff: BranchServiceTariff = {
      id: `tariff-${branchId}-${serviceId}`,
      branchId,
      serviceId,
      customPrice,
      isActive: true,
      createdAt: now,
      updatedAt: now
    };

    db.tariffs.push(newTariff);
    db.saveToStorage();
    return { ...newTariff };
  }

  async getClinicBranding(): Promise<ClinicBranding> {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("lala_clinic_branding");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          Object.assign(db.clinicBranding, parsed);
        } catch (e) {}
      }
    }
    return { ...db.clinicBranding };
  }

  async updateClinicBranding(
    updates: Partial<Omit<ClinicBranding, "id" | "updatedAt">>,
    currentUserRole?: UserRole
  ): Promise<ClinicBranding> {
    if (currentUserRole && currentUserRole !== UserRole.SUPER_ADMIN) {
      throw new Error("Hanya Super Admin yang berwenang mengubah identitas dan logo klinik");
    }

    const now = AppClock.nowISO();
    Object.assign(db.clinicBranding, updates, { updatedAt: now });
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("lala_clinic_branding", JSON.stringify(db.clinicBranding));
      } catch (e) {}
    }
    return { ...db.clinicBranding };
  }
}

// ==========================================
// ACCOUNTING REPOSITORY IMPLEMENTATION (Phase 1)
// ==========================================

function getBranchCode(branchId: string): string {
  const map: Record<string, string> = {
    "branch-gebang": "GEB",
    "branch-kampus": "KAM",
    "branch-muktisari": "MUK",
    "branch-ambulu": "AMB",
    "branch-lengkong-mumbul": "LEN",
    "branch-kencong": "KNC"
  };
  if (map[branchId]) return map[branchId];
  const cleaned = branchId.replace(/^branch-/, "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return cleaned.slice(0, 3) || "GEN";
}

function generateJournalNumber(branchId: string, dateStr: string): string {
  const branchCode = getBranchCode(branchId);
  const cleanDate = (dateStr || "2026-09-21").replace(/-/g, "");
  const prefix = `JRN-${branchCode}-${cleanDate}-`;
  const existingCount = (db.journals || []).filter((j: JournalEntry) => j.journalNumber?.startsWith(prefix)).length;
  let seq = existingCount + 1;
  let candidate = `${prefix}${String(seq).padStart(4, "0")}`;
  while ((db.journals || []).some((j: JournalEntry) => j.journalNumber === candidate)) {
    seq++;
    candidate = `${prefix}${String(seq).padStart(4, "0")}`;
  }
  return candidate;
}

function validateAndNormalizeLines(
  rawLines: CreateJournalLineInput[],
  journalBranchId: string,
  journalId: string
): { lines: JournalLine[]; totalDebit: number; totalCredit: number } {
  if (!rawLines || rawLines.length < 2) {
    throw new Error("Jurnal harus memiliki minimal 2 baris akun (double-entry)");
  }

  let totalDebit = 0;
  let totalCredit = 0;
  const processedLines: JournalLine[] = [];

  for (let idx = 0; idx < rawLines.length; idx++) {
    const raw = rawLines[idx];
    const account = (db.accounts || []).find(
      (a: ChartOfAccount) => a.id === raw.accountId || a.code === raw.accountId
    );
    if (!account) {
      throw new Error(`Akun dengan ID atau kode "${raw.accountId}" tidak ditemukan`);
    }

    const debit = Math.round(Number(raw.debit) || 0);
    const credit = Math.round(Number(raw.credit) || 0);

    if (debit < 0 || credit < 0) {
      throw new Error("Nilai debit dan kredit tidak boleh bernilai negatif");
    }

    if (debit > 0 && credit > 0) {
      throw new Error("Satu baris jurnal tidak boleh memuat nilai debit dan kredit sekaligus");
    }

    if (debit === 0 && credit === 0) {
      throw new Error("Setiap baris jurnal harus memiliki nilai debit atau kredit lebih dari 0");
    }

    totalDebit += debit;
    totalCredit += credit;

    processedLines.push({
      id: raw.id || `jrnl-${journalId}-${idx + 1}-${Date.now()}`,
      journalEntryId: journalId,
      accountId: account.id,
      debit,
      credit,
      branchId: raw.branchId || journalBranchId,
      description: raw.description
    });
  }

  if (totalDebit !== totalCredit) {
    throw new Error(
      `Jurnal tidak seimbang (Unbalanced): Total Debit (Rp ${totalDebit.toLocaleString("id-ID")}) harus sama persis dengan Total Kredit (Rp ${totalCredit.toLocaleString("id-ID")})`
    );
  }

  return { lines: processedLines, totalDebit, totalCredit };
}

export class MockAccountingRepository implements AccountingRepository {
  private recurringExpensePlans: RecurringExpensePlan[] = [];

  // -------------------------------------------------------------
  // Chart of Accounts
  // -------------------------------------------------------------
  async getAccounts(
    filterOrActiveOnly?: boolean | { activeOnly?: boolean; isActive?: boolean; accountType?: AccountType; accountCategory?: AccountCategory; search?: string }
  ): Promise<ChartOfAccount[]> {
    let list: ChartOfAccount[] = [...(db.accounts || [])];

    if (typeof filterOrActiveOnly === "boolean") {
      if (filterOrActiveOnly) {
        list = list.filter((a: ChartOfAccount) => a.isActive);
      }
    } else if (filterOrActiveOnly && typeof filterOrActiveOnly === "object") {
      const activeFilter = (filterOrActiveOnly as any).activeOnly ?? (filterOrActiveOnly as any).isActive;
      if (activeFilter === true) {
        list = list.filter((a: ChartOfAccount) => a.isActive);
      } else if (activeFilter === false) {
        list = list.filter((a: ChartOfAccount) => !a.isActive);
      }
      if (filterOrActiveOnly.accountType) {
        list = list.filter((a: ChartOfAccount) => a.accountType === filterOrActiveOnly.accountType);
      }
      if (filterOrActiveOnly.accountCategory) {
        list = list.filter((a: ChartOfAccount) => a.accountCategory === filterOrActiveOnly.accountCategory);
      }
      if (filterOrActiveOnly.search) {
        const q = filterOrActiveOnly.search.toLowerCase().trim();
        list = list.filter(
          (a: ChartOfAccount) =>
            a.code.toLowerCase().includes(q) ||
            a.name.toLowerCase().includes(q) ||
            a.description?.toLowerCase().includes(q)
        );
      }
    }

    list.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
    return list.map((a: ChartOfAccount) => ({ ...a }));
  }

  async getRecurringExpensePlans(branchId?: string): Promise<RecurringExpensePlan[]> {
    return this.recurringExpensePlans
      .filter((plan) => !branchId || branchId === "ALL" || plan.branchId === branchId)
      .map((plan) => ({ ...plan }));
  }

  async saveRecurringExpensePlan(
    data: {
      branchId: string;
      expenseType: RecurringExpenseType;
      amount: number;
      startsOn: string;
      isActive: boolean;
    },
    createdBy: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<RecurringExpensePlan> {
    if (data.amount <= 0 || !Number.isInteger(data.amount)) {
      throw new Error("Nominal rencana harus berupa bilangan rupiah positif");
    }
    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId && data.branchId !== userBranchId) {
      throw new Error("Branch Admin hanya dapat mengatur akrual untuk cabangnya sendiri");
    }
    const existing = this.recurringExpensePlans.find(
      (plan) => plan.branchId === data.branchId && plan.expenseType === data.expenseType
    );
    const now = AppClock.nowISO();
    const plan: RecurringExpensePlan = {
      id: existing?.id || `recurring-${data.branchId}-${data.expenseType}`,
      branchId: data.branchId,
      expenseType: data.expenseType,
      amount: data.amount,
      startsOn: data.startsOn,
      isActive: data.isActive,
      accruedAmount: existing?.accruedAmount || 0,
      createdAt: existing?.createdAt || now,
      updatedAt: now
    };
    this.recurringExpensePlans = existing
      ? this.recurringExpensePlans.map((item) => item.id === existing.id ? plan : item)
      : [...this.recurringExpensePlans, plan];
    void createdBy;
    return { ...plan };
  }

  async getAccountById(id: string): Promise<ChartOfAccount | null> {
    const acc = (db.accounts || []).find((a: ChartOfAccount) => a.id === id);
    return acc ? { ...acc } : null;
  }

  async getAccountByCode(code: string): Promise<ChartOfAccount | null> {
    const acc = (db.accounts || []).find((a: ChartOfAccount) => a.code === code);
    return acc ? { ...acc } : null;
  }

  async createAccount(data: CreateAccountInput): Promise<ChartOfAccount> {
    if (!data.code || !data.code.trim()) {
      throw new Error("Kode akun wajib diisi");
    }
    if (!data.name || !data.name.trim()) {
      throw new Error("Nama akun wajib diisi");
    }
    if (!data.accountType) {
      throw new Error("Tipe akun (Account Type) wajib dipilih");
    }
    if (!data.accountCategory) {
      throw new Error("Kategori akun (Account Category) wajib dipilih");
    }
    if (!data.normalBalance) {
      throw new Error("Saldo normal (Normal Balance) wajib dipilih");
    }

    const trimmedCode = data.code.trim();
    const existing = (db.accounts || []).find((a: ChartOfAccount) => a.code.trim() === trimmedCode);
    if (existing) {
      throw new Error(`Kode akun "${trimmedCode}" sudah digunakan oleh akun "${existing.name}"`);
    }

    const now = AppClock.nowISO();
    const newAccount: ChartOfAccount = {
      id: data.id || `coa-${trimmedCode}`,
      code: trimmedCode,
      name: data.name.trim(),
      accountType: data.accountType,
      accountCategory: data.accountCategory,
      normalBalance: data.normalBalance,
      isActive: data.isActive !== undefined ? data.isActive : true,
      description: data.description?.trim() || "",
      createdAt: now,
      updatedAt: now
    };

    db.accounts.push(newAccount);
    return { ...newAccount };
  }

  async updateAccount(id: string, updates: UpdateAccountInput): Promise<ChartOfAccount> {
    const acc = (db.accounts || []).find((a: ChartOfAccount) => a.id === id);
    if (!acc) {
      throw new Error(`Akun dengan ID "${id}" tidak ditemukan`);
    }

    const now = AppClock.nowISO();
    if (updates.name !== undefined) acc.name = updates.name.trim();
    if (updates.accountType !== undefined) acc.accountType = updates.accountType;
    if (updates.accountCategory !== undefined) acc.accountCategory = updates.accountCategory;
    if (updates.normalBalance !== undefined) acc.normalBalance = updates.normalBalance;
    if (updates.isActive !== undefined) acc.isActive = updates.isActive;
    if (updates.description !== undefined) acc.description = updates.description.trim();
    acc.updatedAt = now;

    return { ...acc };
  }

  // -------------------------------------------------------------
  // Journal Entries
  // -------------------------------------------------------------
  async getJournals(
    filter?: JournalFilter,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<JournalEntry[]> {
    let list: JournalEntry[] = [...(db.journals || [])];

    // Branch Isolation
    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId) {
      list = list.filter((j: JournalEntry) => j.branchId === userBranchId);
    } else if (filter?.branchId) {
      list = list.filter((j: JournalEntry) => j.branchId === filter.branchId);
    }

    if (filter?.status) {
      list = list.filter((j: JournalEntry) => j.status === filter.status);
    }

    if (filter?.sourceType) {
      list = list.filter((j: JournalEntry) => j.sourceType === filter.sourceType);
    }

    if (filter?.sourceId) {
      list = list.filter((j: JournalEntry) => j.sourceId === filter.sourceId);
    }

    if (filter?.dateFrom) {
      list = list.filter((j: JournalEntry) => j.journalDate >= filter.dateFrom!);
    }

    if (filter?.dateTo) {
      list = list.filter((j: JournalEntry) => j.journalDate <= filter.dateTo!);
    }

    if (filter?.search) {
      const q = filter.search.toLowerCase();
      list = list.filter((j: JournalEntry) =>
        j.journalNumber.toLowerCase().includes(q) ||
        j.description.toLowerCase().includes(q) ||
        (j.sourceId && j.sourceId.toLowerCase().includes(q)) ||
        j.lines.some((l: JournalLine) => l.description?.toLowerCase().includes(q))
      );
    }

    // Sort descending by journalDate, then createdAt
    list.sort((a, b) => {
      if (a.journalDate !== b.journalDate) {
        return b.journalDate.localeCompare(a.journalDate);
      }
      return b.createdAt.localeCompare(a.createdAt);
    });

    return JSON.parse(JSON.stringify(list));
  }

  async getJournalById(
    id: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<JournalEntry | null> {
    const journal = (db.journals || []).find((j: JournalEntry) => j.id === id);
    if (!journal) return null;

    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId && journal.branchId !== userBranchId) {
      return null;
    }

    return JSON.parse(JSON.stringify(journal));
  }

  async getJournalsBySource(
    sourceType: JournalSourceType,
    sourceId: string
  ): Promise<JournalEntry[]> {
    const list = (db.journals || []).filter(
      (j: JournalEntry) => j.sourceType === sourceType && j.sourceId === sourceId
    );
    return JSON.parse(JSON.stringify(list));
  }

  async createDraftJournal(
    data: CreateJournalInput,
    createdBy: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<JournalEntry> {
    if (data.sourceType === JournalSourceType.REVERSAL) {
      throw new Error("Jurnal pembalik hanya dapat dibuat melalui alur koreksi jurnal.");
    }
    if (currentUserRole === UserRole.DOCTOR || currentUserRole === UserRole.DOCTOR_ASSISTANT) {
      throw new Error("Akses ditolak: Dokter atau Asisten tidak memiliki wewenang untuk membuat Jurnal Akuntansi");
    }

    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId && data.branchId !== userBranchId) {
      throw new Error("Akses ditolak: Branch Admin hanya dapat membuat jurnal untuk cabangnya sendiri");
    }

    if (data.sourceType && data.sourceType !== JournalSourceType.MANUAL && data.sourceId) {
      const duplicate = (db.journals || []).find(
        (j: JournalEntry) => {
          if (j.status === JournalStatus.VOID) return false;
          if (j.sourceType !== data.sourceType || j.sourceId !== data.sourceId) return false;
          
          if (
            data.sourceType === JournalSourceType.PAYROLL ||
            data.sourceType === JournalSourceType.EXPENSE
          ) {
            const getEvent = (event?: JournalEntry["event"], description?: string) => {
              if (event) return event;
              if (description && /(pembayaran|payment|paid)/i.test(description)) return "PAYMENT";
              if (description && /(akrual|accrual)/i.test(description)) return "ACCRUAL";
              return null;
            };
            const dataEvent = getEvent(data.event, data.description);
            const existingEvent = getEvent(j.event, j.description);
            if (dataEvent && existingEvent && dataEvent !== existingEvent) return false;
          }
          return true;
        }
      );
      if (duplicate) {
        throw new Error(`Transaksi sumber ${data.sourceType} (${data.sourceId}) sudah tercatat pada jurnal ${duplicate.journalNumber}`);
      }
    }

    const id = data.id || `jrn-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const journalNumber = data.journalNumber || generateJournalNumber(data.branchId, data.journalDate);
    const { lines, totalDebit, totalCredit } = validateAndNormalizeLines(data.lines, data.branchId, id);

    const now = AppClock.nowISO();
    const newJournal: JournalEntry = {
      id,
      journalNumber,
      journalDate: data.journalDate,
      branchId: data.branchId,
      description: data.description || "Jurnal Manual",
      sourceType: data.sourceType || JournalSourceType.MANUAL,
      sourceId: data.sourceId || null,
      status: JournalStatus.DRAFT,
      totalDebit,
      totalCredit,
      lines,
      createdBy,
      createdAt: now,
      updatedAt: now,
      event: data.event
    };

    db.journals.push(newJournal);
    db.saveToStorage();
    return JSON.parse(JSON.stringify(newJournal));
  }

  async updateDraftJournal(
    id: string,
    data: UpdateJournalInput,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<JournalEntry> {
    const journal = (db.journals || []).find((j: JournalEntry) => j.id === id);
    if (!journal) {
      throw new Error("Jurnal tidak ditemukan");
    }

    if (journal.status === JournalStatus.POSTED) {
      throw new Error("Immutability Violation: Jurnal yang telah diposting (POSTED) tidak dapat diubah");
    }

    if (journal.status === JournalStatus.VOID) {
      throw new Error("Immutability Violation: Jurnal yang telah dibatalkan (VOID) tidak dapat diubah");
    }

    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId && journal.branchId !== userBranchId) {
      throw new Error("Akses ditolak: Branch Admin hanya dapat mengubah jurnal di cabangnya sendiri");
    }

    const now = AppClock.nowISO();
    if (data.journalDate) journal.journalDate = data.journalDate;
    if (data.branchId) journal.branchId = data.branchId;
    if (data.description !== undefined) journal.description = data.description;
    if (data.sourceType) journal.sourceType = data.sourceType;
    if (data.sourceId !== undefined) journal.sourceId = data.sourceId;

    if (data.lines) {
      const { lines, totalDebit, totalCredit } = validateAndNormalizeLines(data.lines, journal.branchId, journal.id);
      journal.lines = lines;
      journal.totalDebit = totalDebit;
      journal.totalCredit = totalCredit;
    }

    journal.updatedAt = now;
    db.saveToStorage();
    return JSON.parse(JSON.stringify(journal));
  }

  async postJournal(
    id: string,
    postedBy: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<JournalEntry> {
    const journal = (db.journals || []).find((j: JournalEntry) => j.id === id);
    if (!journal) {
      throw new Error("Jurnal tidak ditemukan");
    }

    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId && journal.branchId !== userBranchId) {
      throw new Error("Akses ditolak: Branch Admin hanya dapat memposting jurnal di cabangnya sendiri");
    }

    if (journal.status === JournalStatus.POSTED) {
      return JSON.parse(JSON.stringify(journal));
    }

    if (journal.status === JournalStatus.VOID) {
      throw new Error("Jurnal yang telah dibatalkan (VOID) tidak dapat diposting");
    }

    const debitSum = journal.lines.reduce((sum: number, l: JournalLine) => sum + (l.debit || 0), 0);
    const creditSum = journal.lines.reduce((sum: number, l: JournalLine) => sum + (l.credit || 0), 0);

    if (debitSum !== creditSum) {
      throw new Error(`Jurnal tidak seimbang (Unbalanced): Total Debit (${debitSum}) tidak sama dengan Total Kredit (${creditSum})`);
    }

    if (debitSum <= 0) {
      throw new Error("Jurnal dengan nilai 0 tidak dapat diposting");
    }

    if (journal.lines.length < 2) {
      throw new Error("Jurnal harus memiliki minimal 2 baris transaksi");
    }

    // Duplicate source protection for posted journals
    if (journal.sourceType && journal.sourceType !== JournalSourceType.MANUAL && journal.sourceId) {
      const duplicate = (db.journals || []).find(
        (j: JournalEntry) => {
          if (j.id === journal.id) return false;
          if (j.status !== JournalStatus.POSTED) return false;
          if (j.sourceType !== journal.sourceType || j.sourceId !== journal.sourceId) return false;
          
          if (journal.sourceType === JournalSourceType.PAYROLL) {
            const isDataAccrual = journal.description?.includes("Accrual") || journal.description?.includes("Akrual");
            const isDataPayment = journal.description?.includes("Payment") || journal.description?.includes("Pembayaran") || journal.description?.includes("Paid");
            const isJAccrual = j.description?.includes("Accrual") || j.description?.includes("Akrual");
            const isJPayment = j.description?.includes("Payment") || j.description?.includes("Pembayaran") || j.description?.includes("Paid");
            if (isDataAccrual && isJPayment) return false;
            if (isDataPayment && isJAccrual) return false;
          }
          return true;
        }
      );
      if (duplicate) {
        throw new Error(`Transaksi sumber ${journal.sourceType} (${journal.sourceId}) sudah pernah diposting dalam jurnal ${duplicate.journalNumber}`);
      }
    }

    const now = AppClock.nowISO();
    journal.status = JournalStatus.POSTED;
    journal.postedAt = now;
    journal.postedBy = postedBy;
    journal.totalDebit = debitSum;
    journal.totalCredit = creditSum;
    journal.updatedAt = now;
    db.saveToStorage();

    return JSON.parse(JSON.stringify(journal));
  }

  async voidJournal(
    id: string,
    voidedBy: string,
    reason?: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<JournalEntry> {
    const journal = (db.journals || []).find((j: JournalEntry) => j.id === id);
    if (!journal) {
      throw new Error("Jurnal tidak ditemukan");
    }

    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId && journal.branchId !== userBranchId) {
      throw new Error("Akses ditolak: Branch Admin hanya dapat membatalkan jurnal di cabangnya sendiri");
    }

    if (journal.status === JournalStatus.VOID) {
      throw new Error("Jurnal sudah dalam status VOID");
    }
    if (journal.status === JournalStatus.POSTED) {
      throw new Error("Jurnal POSTED tidak dapat di-VOID langsung. Gunakan jurnal pembalik yang terkait.");
    }

    const now = AppClock.nowISO();
    journal.status = JournalStatus.VOID;
    journal.voidedAt = now;
    journal.voidedBy = voidedBy;
    journal.voidReason = reason || "Dibatalkan oleh user";
    journal.updatedAt = now;
    db.saveToStorage();

    return JSON.parse(JSON.stringify(journal));
  }

  async reversePostedJournal(
    id: string,
    reason: string,
    reversalDate: string,
    reversedBy: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<JournalEntry> {
    const original = (db.journals || []).find((journal: JournalEntry) => journal.id === id);
    if (!original) throw new Error("Jurnal asal tidak ditemukan.");
    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId && original.branchId !== userBranchId) {
      throw new Error("Akses ditolak: jurnal berada di luar cabang yang dapat diakses.");
    }
    if (original.status !== JournalStatus.POSTED) {
      throw new Error("Hanya jurnal POSTED yang dapat dibalik.");
    }
    if (![JournalSourceType.EXPENSE, JournalSourceType.MANUAL, JournalSourceType.ADJUSTMENT].includes(original.sourceType)) {
      throw new Error("Jurnal transaksi invoice, pembayaran, payroll, atau kompensasi harus dikoreksi dari transaksi sumber.");
    }
    if (original.sourceType === JournalSourceType.EXPENSE && original.sourceId?.startsWith("RECURRING_SETTLEMENT:")) {
      throw new Error("Pembayaran penyisihan berulang harus dikoreksi melalui alur rencana akrual.");
    }
    if (reason.trim().length < 5 || reason.trim().length > 500) {
      throw new Error("Alasan koreksi wajib diisi 5 sampai 500 karakter.");
    }
    if (!reversalDate || reversalDate < original.journalDate) {
      throw new Error("Tanggal jurnal pembalik tidak boleh sebelum tanggal jurnal asal.");
    }
    if (original.lines.length < 2) throw new Error("Baris jurnal asal tidak ditemukan.");
    if ((db.journals || []).some((journal: JournalEntry) => journal.reversalOfJournalId === original.id)) {
      throw new Error("Jurnal ini sudah memiliki jurnal pembalik.");
    }

    const now = AppClock.nowISO();
    const reversalId = `journal-reversal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const lines: JournalLine[] = original.lines.map((line, index) => ({
      id: `${reversalId}-line-${index + 1}`,
      journalEntryId: reversalId,
      accountId: line.accountId,
      branchId: original.branchId,
      debit: line.credit,
      credit: line.debit,
      description: line.description ? `Pembalik: ${line.description}` : "Jurnal pembalik"
    }));
    const totalDebit = lines.reduce((total, line) => total + line.debit, 0);
    const totalCredit = lines.reduce((total, line) => total + line.credit, 0);
    if (totalDebit <= 0 || totalDebit !== totalCredit) {
      throw new Error("Jurnal asal tidak seimbang; jurnal pembalik tidak dapat dibuat.");
    }

    const reversal: JournalEntry = {
      id: reversalId,
      journalNumber: generateJournalNumber(original.branchId, reversalDate),
      journalDate: reversalDate,
      branchId: original.branchId,
      description: `Pembalik ${original.journalNumber}: ${reason.trim()}`,
      sourceType: JournalSourceType.REVERSAL,
      sourceId: original.id,
      status: JournalStatus.POSTED,
      totalDebit,
      totalCredit,
      lines,
      createdBy: reversedBy,
      createdAt: now,
      postedAt: now,
      postedBy: reversedBy,
      reversalOfJournalId: original.id,
      reversalReason: reason.trim(),
      updatedAt: now
    };
    (db.journals || []).push(reversal);
    db.saveToStorage();
    return JSON.parse(JSON.stringify(reversal));
  }

  async deleteDraftJournal(
    id: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<boolean> {
    const index = (db.journals || []).findIndex((j: JournalEntry) => j.id === id);
    if (index === -1) {
      throw new Error("Jurnal tidak ditemukan");
    }

    const journal = db.journals[index];
    if (journal.status !== JournalStatus.DRAFT) {
      throw new Error("Hanya draft jurnal yang dapat dihapus. Jurnal POSTED atau VOID harus dipertahankan sebagai audit trail.");
    }

    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId && journal.branchId !== userBranchId) {
      throw new Error("Akses ditolak: Branch Admin hanya dapat menghapus jurnal di cabangnya sendiri");
    }

    db.journals.splice(index, 1);
    return true;
  }

  async deleteJournal(
    id: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<boolean> {
    const index = (db.journals || []).findIndex((j: JournalEntry) => j.id === id);
    if (index === -1) {
      return false;
    }
    const journal = db.journals[index];
    if (journal.status !== JournalStatus.DRAFT) {
      throw new Error("Hanya draft jurnal yang dapat dihapus. Jurnal POSTED atau VOID harus dipertahankan sebagai audit trail.");
    }
    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId && journal.branchId !== userBranchId) {
      throw new Error("Akses ditolak: Branch Admin hanya dapat menghapus jurnal di cabangnya sendiri");
    }
    db.journals.splice(index, 1);
    return true;
  }

  async findBySource(
    sourceType: JournalSourceType,
    sourceId: string
  ): Promise<JournalEntry | null> {
    const journal = (db.journals || []).find(
      (j: JournalEntry) =>
        j.status !== JournalStatus.VOID &&
        j.sourceType === sourceType &&
        j.sourceId === sourceId
    );
    return journal ? JSON.parse(JSON.stringify(journal)) : null;
  }

  async listByBranch(
    branchId: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<JournalEntry[]> {
    return this.getJournals({ branchId }, currentUserRole, userBranchId);
  }

  async listByDateRange(
    dateFrom: string,
    dateTo: string,
    branchId?: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<JournalEntry[]> {
    return this.getJournals({ dateFrom, dateTo, branchId }, currentUserRole, userBranchId);
  }

  // -------------------------------------------------------------
  // General Ledger
  // -------------------------------------------------------------
  async getLedgerEntries(
    query?: LedgerQuery,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<GeneralLedgerEntry[]> {
    const allowedBranchId = currentUserRole === UserRole.BRANCH_ADMIN ? userBranchId : query?.branchId;
    const includeDrafts = query?.includeDrafts === true;

    const validJournals = (db.journals || []).filter((j: JournalEntry) => {
      if (!includeDrafts && j.status !== JournalStatus.POSTED) return false;
      if (includeDrafts && j.status === JournalStatus.VOID) return false;
      if (allowedBranchId && j.branchId !== allowedBranchId) return false;
      if (query?.dateFrom && j.journalDate < query.dateFrom) return false;
      if (query?.dateTo && j.journalDate > query.dateTo) return false;
      return true;
    });

    // Sort journals chronologically
    validJournals.sort((a: JournalEntry, b: JournalEntry) => {
      if (a.journalDate !== b.journalDate) return a.journalDate.localeCompare(b.journalDate);
      return a.journalNumber.localeCompare(b.journalNumber);
    });

    const accountMap = new Map<string, ChartOfAccount>();
    (db.accounts || []).forEach((acc: ChartOfAccount) => {
      accountMap.set(acc.id, acc);
      accountMap.set(acc.code, acc);
    });

    const rawEntries: GeneralLedgerEntry[] = [];
    for (const j of validJournals) {
      for (const l of j.lines) {
        const acc = accountMap.get(l.accountId);
        if (!acc) continue;

        if (query?.accountId && query.accountId !== "ALL" && acc.id !== query.accountId && acc.code !== query.accountId) continue;
        if (query?.accountCode && acc.code !== query.accountCode) continue;

        rawEntries.push({
          journalId: j.id,
          journalNumber: j.journalNumber,
          journalDate: j.journalDate,
          lineId: l.id,
          accountId: acc.id,
          accountCode: acc.code,
          accountName: acc.name,
          accountType: acc.accountType,
          normalBalance: acc.normalBalance,
          branchId: l.branchId || j.branchId,
          description: l.description || j.description,
          debit: l.debit,
          credit: l.credit,
          sourceType: j.sourceType,
          sourceId: j.sourceId,
          postedAt: j.postedAt || j.createdAt
        });
      }
    }

    // Compute running balance per account
    const accountBalances = new Map<string, number>();
    const results: GeneralLedgerEntry[] = rawEntries.map((entry) => {
      const currentBal = accountBalances.get(entry.accountId) || 0;
      let nextBal = currentBal;
      if (entry.normalBalance === NormalBalance.DEBIT) {
        nextBal += (entry.debit - entry.credit);
      } else {
        nextBal += (entry.credit - entry.debit);
      }
      accountBalances.set(entry.accountId, nextBal);
      return {
        ...entry,
        runningBalance: nextBal
      };
    });

    return results;
  }

  async getAccountBalance(
    accountId: string,
    branchId?: string,
    dateTo?: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<AccountBalanceResult> {
    if (accountId === "ALL") {
      const entries = await this.getLedgerEntries(
        { accountId: "ALL", branchId, dateTo },
        currentUserRole,
        userBranchId
      );
      const totalDebit = entries.reduce((s, e) => s + e.debit, 0);
      const totalCredit = entries.reduce((s, e) => s + e.credit, 0);
      return {
        accountId: "ALL",
        accountCode: "ALL",
        accountName: "Semua Akun (Konsolidasi)",
        accountType: AccountType.ASSET,
        accountCategory: AccountCategory.CASH,
        normalBalance: NormalBalance.DEBIT,
        totalDebit,
        totalCredit,
        balance: totalDebit - totalCredit
      };
    }

    const account = (db.accounts || []).find(
      (a: ChartOfAccount) => a.id === accountId || a.code === accountId
    );
    if (!account) {
      throw new Error(`Akun dengan ID "${accountId}" tidak ditemukan`);
    }

    const entries = await this.getLedgerEntries(
      {
        accountId: account.id,
        branchId,
        dateTo
      },
      currentUserRole,
      userBranchId
    );

    const totalDebit = entries.reduce((s, e) => s + e.debit, 0);
    const totalCredit = entries.reduce((s, e) => s + e.credit, 0);
    let balance = 0;
    if (account.normalBalance === NormalBalance.DEBIT) {
      balance = totalDebit - totalCredit;
    } else {
      balance = totalCredit - totalDebit;
    }

    return {
      accountId: account.id,
      accountCode: account.code,
      accountName: account.name,
      accountType: account.accountType,
      accountCategory: account.accountCategory,
      normalBalance: account.normalBalance,
      totalDebit,
      totalCredit,
      balance
    };
  }

  async getIncomeStatementReport(
    query?: { branchId?: string; dateFrom?: string; dateTo?: string },
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<IncomeStatementReport> {
    if (
      currentUserRole === UserRole.DOCTOR ||
      currentUserRole === UserRole.DOCTOR_ASSISTANT ||
      currentUserRole === UserRole.PATIENT
    ) {
      throw new Error("Akses ditolak: Hanya Administrator yang dapat melihat Laporan Keuangan");
    }

    const effectiveBranchId =
      currentUserRole === UserRole.BRANCH_ADMIN
        ? userBranchId
        : query?.branchId === "ALL"
        ? undefined
        : query?.branchId;

    // Filter valid POSTED journals
    const validJournals = (db.journals || []).filter((j: JournalEntry) => {
      if (j.status !== JournalStatus.POSTED) return false;
      if (effectiveBranchId && j.branchId !== effectiveBranchId) return false;
      if (query?.dateFrom && j.journalDate < query.dateFrom) return false;
      if (query?.dateTo && j.journalDate > query.dateTo) return false;
      return true;
    });

    const accountMap = new Map<string, ChartOfAccount>();
    (db.accounts || []).forEach((a: ChartOfAccount) => {
      accountMap.set(a.id, a);
      accountMap.set(a.code, a);
    });

    const revenueMap = new Map<string, { code: string; name: string; category: AccountCategory; amount: number }>();
    const expenseMap = new Map<string, { code: string; name: string; category: AccountCategory; amount: number }>();

    for (const j of validJournals) {
      for (const l of j.lines) {
        const acc = accountMap.get(l.accountId);
        if (!acc) continue;

        if (acc.accountType === AccountType.REVENUE) {
          // Revenue normal balance CREDIT (Credit - Debit)
          const netCredit = l.credit - l.debit;
          const curr = revenueMap.get(acc.id) || { code: acc.code, name: acc.name, category: acc.accountCategory, amount: 0 };
          curr.amount += netCredit;
          revenueMap.set(acc.id, curr);
        } else if (acc.accountType === AccountType.EXPENSE) {
          // Expense normal balance DEBIT (Debit - Credit)
          const netDebit = l.debit - l.credit;
          const curr = expenseMap.get(acc.id) || { code: acc.code, name: acc.name, category: acc.accountCategory, amount: 0 };
          curr.amount += netDebit;
          expenseMap.set(acc.id, curr);
        }
      }
    }

    const revenues: IncomeStatementReportItem[] = Array.from(revenueMap.entries())
      .map(([id, item]) => ({
        accountId: id,
        accountCode: item.code,
        accountName: item.name,
        accountCategory: item.category,
        amount: item.amount
      }))
      .sort((a, b) => a.accountCode.localeCompare(b.accountCode));

    const expenses: IncomeStatementReportItem[] = Array.from(expenseMap.entries())
      .map(([id, item]) => ({
        accountId: id,
        accountCode: item.code,
        accountName: item.name,
        accountCategory: item.category,
        amount: item.amount
      }))
      .sort((a, b) => a.accountCode.localeCompare(b.accountCode));

    const totalRevenue = revenues.reduce((s, r) => s + r.amount, 0);
    const totalExpense = expenses.reduce((s, e) => s + e.amount, 0);

    const branch = effectiveBranchId ? (db.branches || []).find(b => b.id === effectiveBranchId) : null;

    return {
      branchId: effectiveBranchId || null,
      branchName: branch ? branch.name : "Semua Cabang (Konsolidasi)",
      dateFrom: query?.dateFrom,
      dateTo: query?.dateTo,
      revenues,
      totalRevenue,
      expenses,
      totalExpense,
      netIncome: totalRevenue - totalExpense,
      generatedAt: AppClock.nowISO()
    };
  }

  async getTrialBalanceReport(
    query?: { branchId?: string; dateFrom?: string; dateTo?: string },
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<TrialBalanceReport> {
    if (
      currentUserRole === UserRole.DOCTOR ||
      currentUserRole === UserRole.DOCTOR_ASSISTANT ||
      currentUserRole === UserRole.PATIENT
    ) {
      throw new Error("Akses ditolak: Hanya Administrator yang dapat melihat Laporan Keuangan");
    }

    const effectiveBranchId =
      currentUserRole === UserRole.BRANCH_ADMIN
        ? userBranchId
        : query?.branchId === "ALL"
        ? undefined
        : query?.branchId;

    const validJournals = (db.journals || []).filter((j: JournalEntry) => {
      if (j.status !== JournalStatus.POSTED) return false;
      if (effectiveBranchId && j.branchId !== effectiveBranchId) return false;
      if (query?.dateFrom && j.journalDate < query.dateFrom) return false;
      if (query?.dateTo && j.journalDate > query.dateTo) return false;
      return true;
    });

    const accountTotals = new Map<string, { debit: number; credit: number }>();
    for (const j of validJournals) {
      for (const l of j.lines) {
        const curr = accountTotals.get(l.accountId) || { debit: 0, credit: 0 };
        curr.debit += l.debit;
        curr.credit += l.credit;
        accountTotals.set(l.accountId, curr);
      }
    }

    const items: TrialBalanceItem[] = (db.accounts || [])
      .filter((acc: ChartOfAccount) => acc.isActive)
      .map((acc: ChartOfAccount) => {
        const t = accountTotals.get(acc.id) || { debit: 0, credit: 0 };
        let endingBalance = 0;
        if (acc.normalBalance === NormalBalance.DEBIT) {
          endingBalance = t.debit - t.credit;
        } else {
          endingBalance = t.credit - t.debit;
        }

        return {
          accountId: acc.id,
          accountCode: acc.code,
          accountName: acc.name,
          accountType: acc.accountType,
          accountCategory: acc.accountCategory,
          normalBalance: acc.normalBalance,
          debit: t.debit,
          credit: t.credit,
          endingBalance
        };
      })
      .sort((a, b) => a.accountCode.localeCompare(b.accountCode));

    const totalDebit = items.reduce((s, i) => s + i.debit, 0);
    const totalCredit = items.reduce((s, i) => s + i.credit, 0);

    const branch = effectiveBranchId ? (db.branches || []).find(b => b.id === effectiveBranchId) : null;

    return {
      branchId: effectiveBranchId || null,
      branchName: branch ? branch.name : "Semua Cabang (Konsolidasi)",
      dateFrom: query?.dateFrom,
      dateTo: query?.dateTo,
      items,
      totalDebit,
      totalCredit,
      isBalanced: totalDebit === totalCredit,
      generatedAt: AppClock.nowISO()
    };
  }

  async getBalanceSheetReport(
    query?: { branchId?: string; dateTo?: string },
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<BalanceSheetReport> {
    if (
      currentUserRole === UserRole.DOCTOR ||
      currentUserRole === UserRole.DOCTOR_ASSISTANT ||
      currentUserRole === UserRole.PATIENT
    ) {
      throw new Error("Akses ditolak: Hanya Administrator yang dapat melihat Laporan Keuangan");
    }

    const effectiveBranchId =
      currentUserRole === UserRole.BRANCH_ADMIN
        ? userBranchId
        : query?.branchId === "ALL"
        ? undefined
        : query?.branchId;

    const validJournals = (db.journals || []).filter((j: JournalEntry) => {
      if (j.status !== JournalStatus.POSTED) return false;
      if (effectiveBranchId && j.branchId !== effectiveBranchId) return false;
      if (query?.dateTo && j.journalDate > query.dateTo) return false;
      return true;
    });

    const accountMap = new Map<string, ChartOfAccount>();
    (db.accounts || []).forEach((a: ChartOfAccount) => {
      accountMap.set(a.id, a);
      accountMap.set(a.code, a);
    });

    const assetMap = new Map<string, { code: string; name: string; category: AccountCategory; amount: number }>();
    const liabilityMap = new Map<string, { code: string; name: string; category: AccountCategory; amount: number }>();
    const equityMap = new Map<string, { code: string; name: string; category: AccountCategory; amount: number }>();
    let totalRevenue = 0;
    let totalExpense = 0;

    for (const j of validJournals) {
      for (const l of j.lines) {
        const acc = accountMap.get(l.accountId);
        if (!acc) continue;

        if (acc.accountType === AccountType.ASSET) {
          const netDebit = l.debit - l.credit;
          const curr = assetMap.get(acc.id) || { code: acc.code, name: acc.name, category: acc.accountCategory, amount: 0 };
          curr.amount += netDebit;
          assetMap.set(acc.id, curr);
        } else if (acc.accountType === AccountType.LIABILITY) {
          const netCredit = l.credit - l.debit;
          const curr = liabilityMap.get(acc.id) || { code: acc.code, name: acc.name, category: acc.accountCategory, amount: 0 };
          curr.amount += netCredit;
          liabilityMap.set(acc.id, curr);
        } else if (acc.accountType === AccountType.EQUITY) {
          const netCredit = l.credit - l.debit;
          const curr = equityMap.get(acc.id) || { code: acc.code, name: acc.name, category: acc.accountCategory, amount: 0 };
          curr.amount += netCredit;
          equityMap.set(acc.id, curr);
        } else if (acc.accountType === AccountType.REVENUE) {
          totalRevenue += (l.credit - l.debit);
        } else if (acc.accountType === AccountType.EXPENSE) {
          totalExpense += (l.debit - l.credit);
        }
      }
    }

    const currentPeriodNetIncome = totalRevenue - totalExpense;

    const assets: IncomeStatementReportItem[] = Array.from(assetMap.entries())
      .map(([id, item]) => ({
        accountId: id,
        accountCode: item.code,
        accountName: item.name,
        accountCategory: item.category,
        amount: item.amount
      }))
      .sort((a, b) => a.accountCode.localeCompare(b.accountCode));

    const liabilities: IncomeStatementReportItem[] = Array.from(liabilityMap.entries())
      .map(([id, item]) => ({
        accountId: id,
        accountCode: item.code,
        accountName: item.name,
        accountCategory: item.category,
        amount: item.amount
      }))
      .sort((a, b) => a.accountCode.localeCompare(b.accountCode));

    const equity: IncomeStatementReportItem[] = Array.from(equityMap.entries())
      .map(([id, item]) => ({
        accountId: id,
        accountCode: item.code,
        accountName: item.name,
        accountCategory: item.category,
        amount: item.amount
      }))
      .sort((a, b) => a.accountCode.localeCompare(b.accountCode));

    const totalAssets = assets.reduce((s, a) => s + a.amount, 0);
    const totalLiabilities = liabilities.reduce((s, l) => s + l.amount, 0);
    const totalBaseEquity = equity.reduce((s, e) => s + e.amount, 0);
    const totalEquity = totalBaseEquity + currentPeriodNetIncome;
    const totalLiabilitiesAndEquity = totalLiabilities + totalEquity;

    const branch = effectiveBranchId ? (db.branches || []).find(b => b.id === effectiveBranchId) : null;

    return {
      branchId: effectiveBranchId || null,
      branchName: branch ? branch.name : "Semua Cabang (Konsolidasi)",
      dateTo: query?.dateTo,
      assets,
      totalAssets,
      liabilities,
      totalLiabilities,
      equity,
      currentPeriodNetIncome,
      totalEquity,
      totalLiabilitiesAndEquity,
      isBalanced: totalAssets === totalLiabilitiesAndEquity,
      generatedAt: AppClock.nowISO()
    };
  }
}

// ==========================================
// ATTENDANCE REPOSITORY IMPLEMENTATION (HR-2A)
// ==========================================

function parseTimeToMinutes(timeOrIso: string): number {
  if (!timeOrIso) return 0;
  let timeStr = timeOrIso;
  if (timeOrIso.includes("T")) {
    const parts = timeOrIso.split("T");
    if (parts.length > 1) {
      timeStr = parts[1];
    }
  }
  timeStr = timeStr.replace(/Z|[+-]\d{2}:\d{2}$/, "");
  const segments = timeStr.split(":");
  const hours = parseInt(segments[0], 10) || 0;
  const minutes = parseInt(segments[1], 10) || 0;
  return hours * 60 + minutes;
}

export class MockAttendanceRepository implements AttendanceRepository {
  async getById(id: string, currentUserRole?: UserRole, userBranchId?: string | null): Promise<Attendance | null> {
    const item = db.attendances.find(a => a.id === id);
    if (!item) return null;

    // Branch isolation for Branch Admin
    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId && item.branchId !== userBranchId) {
      return null;
    }

    return JSON.parse(JSON.stringify(item));
  }

  async getByStaff(staffId: string, currentUserRole?: UserRole, userBranchId?: string | null): Promise<Attendance[]> {
    // Resolve doctorId to staffId if needed
    let targetStaffId = staffId;
    const doc = db.doctors.find(d => d.id === staffId);
    if (doc && doc.staffId) {
      targetStaffId = doc.staffId;
    }

    let items = db.attendances.filter(a => a.staffId === targetStaffId || a.staffId === staffId);

    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId) {
      items = items.filter(a => a.branchId === userBranchId);
    }

    return JSON.parse(JSON.stringify(items)).sort(
      (a: Attendance, b: Attendance) => b.date.localeCompare(a.date)
    );
  }

  async getByDate(
    date: string,
    branchId?: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<Attendance[]> {
    let effectiveBranchId = branchId;
    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId) {
      effectiveBranchId = userBranchId;
    }

    let items = db.attendances.filter(a => a.date === date);
    if (effectiveBranchId) {
      items = items.filter(a => a.branchId === effectiveBranchId);
    }

    return JSON.parse(JSON.stringify(items));
  }

  async getByBranch(branchId: string, currentUserRole?: UserRole, userBranchId?: string | null): Promise<Attendance[]> {
    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId && branchId !== userBranchId) {
      return [];
    }

    const items = db.attendances.filter(a => a.branchId === branchId);
    return JSON.parse(JSON.stringify(items)).sort(
      (a: Attendance, b: Attendance) => b.date.localeCompare(a.date)
    );
  }

  async list(
    filter?: AttendanceFilter,
    currentUserRole?: UserRole,
    userBranchId?: string | null,
    currentStaffId?: string | null
  ): Promise<Attendance[]> {
    let items = [...db.attendances];

    // Branch Isolation
    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId) {
      items = items.filter(a => a.branchId === userBranchId);
    } else if (filter?.branchId) {
      items = items.filter(a => a.branchId === filter.branchId);
    }

    // Doctor/Staff Personal View Isolation
    if (currentUserRole === UserRole.DOCTOR && currentStaffId) {
      let resolvedId = currentStaffId;
      const doc = db.doctors.find(d => d.id === currentStaffId);
      if (doc && doc.staffId) resolvedId = doc.staffId;
      items = items.filter(a => a.staffId === resolvedId || a.staffId === currentStaffId);
    } else if (filter?.staffId) {
      let filterStaffId = filter.staffId;
      const doc = db.doctors.find(d => d.id === filter.staffId);
      if (doc && doc.staffId) filterStaffId = doc.staffId;
      items = items.filter(a => a.staffId === filterStaffId || a.staffId === filter.staffId);
    }

    if (filter?.date) {
      items = items.filter(a => a.date === filter.date);
    }

    if (filter?.dateRange) {
      if (filter.dateRange.startDate) {
        items = items.filter(a => a.date >= filter.dateRange!.startDate!);
      }
      if (filter.dateRange.endDate) {
        items = items.filter(a => a.date <= filter.dateRange!.endDate!);
      }
    }

    if (filter?.attendanceStatus) {
      items = items.filter(a => a.attendanceStatus === filter.attendanceStatus);
    }

    return JSON.parse(JSON.stringify(items)).sort((a: Attendance, b: Attendance) => {
      const dateCmp = b.date.localeCompare(a.date);
      if (dateCmp !== 0) return dateCmp;
      return a.staffId.localeCompare(b.staffId);
    });
  }

  async checkIn(input: CheckInInput, currentUserRole?: UserRole, userBranchId?: string | null): Promise<Attendance> {
    const date = input.date || AppClock.todayDateString();

    // 1. Resolve Staff
    let staff = db.staff.find(s => s.id === input.staffId);
    let doctor = db.doctors.find(d => d.id === input.staffId || d.staffId === input.staffId);
    if (!staff && doctor && doctor.staffId) {
      staff = db.staff.find(s => s.id === doctor.staffId);
    }
    if (!staff) {
      const userStaff = db.staff.find(s => s.userAccountId === input.staffId);
      if (userStaff) staff = userStaff;
    }
    if (!staff) {
      throw new Error(`Staff dengan ID "${input.staffId}" tidak ditemukan`);
    }

    // 2. Validate Staff Active
    if (!staff.active || staff.employmentStatus === EmploymentStatus.INACTIVE) {
      throw new Error("Staff berstatus tidak aktif tidak dapat melakukan absensi");
    }

    // 3. Branch Isolation for actor
    const effectiveRole = input.actorRole || currentUserRole;
    const effectiveBranch = input.actorBranchId || userBranchId;
    if (effectiveRole === UserRole.BRANCH_ADMIN && effectiveBranch) {
      if (input.branchId && input.branchId !== effectiveBranch) {
        throw new Error("Branch Admin hanya dapat mencatat absensi di cabangnya sendiri");
      }
      if (staff.assignedBranchId && staff.assignedBranchId !== effectiveBranch && staff.position !== StaffPosition.DOCTOR) {
        throw new Error("Branch Admin tidak dapat mencatat kehadiran staff cabang lain");
      }
    }

    // 4. Duplicate Check-in Check
    // 5. Determine Schedule & Snapshot
    let scheduledStartAt = input.scheduledStartAt || "";
    let scheduledEndAt = input.scheduledEndAt || "";
    let targetBranchId = input.branchId || "";

    const isDoctor = staff.position === StaffPosition.DOCTOR || !!doctor;

    if (scheduledStartAt && scheduledEndAt) {
      targetBranchId = targetBranchId || staff.assignedBranchId || effectiveBranch || "branch-gebang";
    } else if (isDoctor) {
      // Doctor -> DoctorSchedule -> Attendance
      const docId = doctor?.id || db.doctors.find(d => d.staffId === staff!.id)?.id || staff.id;
      const schedules = db.doctorSchedules.filter(s =>
        (s.doctorId === docId || s.doctorId === staff!.id) &&
        s.date === date &&
        s.status === ScheduleStatus.ACTIVE
      );

      let matchedSchedule = schedules[0];
      if (targetBranchId) {
        const byBranch = schedules.find(s => s.branchId === targetBranchId);
        if (byBranch) matchedSchedule = byBranch;
      }

      if (!matchedSchedule) {
        throw new Error("Dokter tidak memiliki jadwal aktif pada tanggal tersebut");
      }

      if (targetBranchId && matchedSchedule.branchId !== targetBranchId) {
        throw new Error("Cabang check-in tidak sesuai dengan jadwal dokter");
      }

      scheduledStartAt = matchedSchedule.startTime;
      scheduledEndAt = matchedSchedule.endTime;
      targetBranchId = matchedSchedule.branchId;
    } else {
      // Staff -> StaffShiftAssignment -> WorkShift -> Attendance
      const assignments = db.staffShiftAssignments.filter(a =>
        a.staffId === staff!.id &&
        a.date === date &&
        a.active !== false
      );

      let matchedAssignment = assignments[0];
      if (targetBranchId) {
        const byBranch = assignments.find(a => a.branchId === targetBranchId);
        if (byBranch) matchedAssignment = byBranch;
      }

      if (!matchedAssignment) {
        throw new Error("Staff tidak memiliki jadwal/shift aktif pada tanggal tersebut");
      }

      const shift = db.workShifts.find(w => w.id === matchedAssignment.shiftId);
      if (!shift) {
        throw new Error("WorkShift tidak ditemukan");
      }

      scheduledStartAt = shift.startTime;
      scheduledEndAt = shift.endTime;
      targetBranchId = matchedAssignment.branchId || shift.branchId;
    }

    if (!targetBranchId) {
      targetBranchId = staff.assignedBranchId || "branch-gebang";
    }
    if (!scheduledStartAt) scheduledStartAt = "08:00";
    if (!scheduledEndAt) scheduledEndAt = "14:00";

    const existing = db.attendances.find(
      (attendance) => attendance.staffId === staff!.id &&
        attendance.date === date &&
        attendance.branchId === targetBranchId
    );
    if (existing) {
      throw new Error("Staff sudah melakukan absensi di cabang ini pada tanggal tersebut");
    }

    if (effectiveRole === UserRole.BRANCH_ADMIN && effectiveBranch && targetBranchId !== effectiveBranch) {
      throw new Error("Branch Admin hanya dapat mencatat absensi di cabangnya sendiri");
    }

    const openAttendanceAtSameBranch = db.attendances.find(
      (attendance) => attendance.staffId === staff!.id &&
        attendance.date === date &&
        attendance.branchId === targetBranchId &&
        attendance.actualCheckInAt &&
        !attendance.actualCheckOutAt
    );
    if (openAttendanceAtSameBranch) {
      throw new Error("Check-out di cabang ini harus diselesaikan sebelum check-in berikutnya.");
    }

    db.attendances
      .filter((attendance) => attendance.staffId === staff!.id &&
        attendance.date === date &&
        attendance.branchId !== targetBranchId &&
        attendance.actualCheckInAt &&
        !attendance.actualCheckOutAt)
      .forEach((attendance) => {
        attendance.checkOutCorrectionStatus = "PENDING";
        attendance.checkOutCorrectionRequestedAt ||= AppClock.nowISO();
        attendance.checkOutCorrectionRequestedBy ||= input.actorId || null;
        attendance.checkOutCorrectionReason ||= `Lupa check-out sebelum check-in di cabang ${targetBranchId}.`;
        attendance.updatedAt = AppClock.nowISO();
      });

    // 6. Timestamps & Late Minutes
    const actualCheckInAt = input.checkInTime || AppClock.nowISO();
    const schedMins = parseTimeToMinutes(scheduledStartAt);
    const actualMins = parseTimeToMinutes(actualCheckInAt);
    const lateMinutes = Math.max(0, actualMins - schedMins);

    const attendanceStatus = lateMinutes > 0 ? AttendanceStatus.LATE : AttendanceStatus.PRESENT;

    const newAttendance: Attendance = {
      id: `att-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      staffId: staff.id,
      branchId: targetBranchId,
      date,
      attendanceStatus,
      scheduledStartAt,
      scheduledEndAt,
      actualCheckInAt,
      actualCheckOutAt: null,
      lateMinutes,
      earlyCheckoutMinutes: 0,
      checkInPhotoPath: input.checkInPhotoPath ?? input.photoPath ?? null,
      checkInLatitude: input.latitude ?? null,
      checkInLongitude: input.longitude ?? null,
      checkInAccuracyMeters: input.accuracyMeters ?? null,
      checkOutPhotoPath: null,
      checkInMethod: input.checkInMethod ?? input.method ?? AttendanceMethod.WEB,
      checkOutMethod: null,
      notes: input.notes,
      createdAt: AppClock.nowISO(),
      updatedAt: AppClock.nowISO(),
      createdBy: input.actorId || "system",
      updatedBy: input.actorId || "system"
    };

    db.attendances.push(newAttendance);
    return JSON.parse(JSON.stringify(newAttendance));
  }

  async checkOut(input: CheckOutInput, currentUserRole?: UserRole, userBranchId?: string | null): Promise<Attendance> {
    // 1. Find Attendance
    let attendance: Attendance | undefined;
    if (input.attendanceId) {
      attendance = db.attendances.find(a => a.id === input.attendanceId);
    } else if (input.staffId) {
      const targetDate = input.date || AppClock.todayDateString();
      let sId = input.staffId;
      const doc = db.doctors.find(d => d.id === input.staffId);
      if (doc && doc.staffId) sId = doc.staffId;

      attendance = db.attendances.find(a => (a.staffId === sId || a.staffId === input.staffId) && a.date === targetDate);
    }

    if (!attendance) {
      throw new Error("Data absensi tidak ditemukan");
    }

    // 2. Validate Staff
    if (input.staffId) {
      const isMatch = attendance.staffId === input.staffId ||
        db.doctors.some(d => d.id === input.staffId && d.staffId === attendance!.staffId);
      if (!isMatch) {
        throw new Error("Staff ID tidak sesuai dengan data absensi");
      }
    }

    // 3. Validate Check-in & Idempotency
    if (attendance.actualCheckOutAt) {
      throw new Error("Absensi sudah melakukan checkout sebelumnya");
    }

    if (!attendance.actualCheckInAt) {
      throw new Error("Tidak dapat melakukan checkout tanpa check-in");
    }

    // 4. Branch Isolation
    const effectiveRole = input.actorRole || currentUserRole;
    const effectiveBranch = input.actorBranchId || userBranchId;
    if (effectiveRole === UserRole.BRANCH_ADMIN && effectiveBranch && attendance.branchId !== effectiveBranch) {
      throw new Error("Branch Admin tidak memiliki akses checkout untuk cabang lain");
    }

    // 5. Time validation
    const actualCheckOutAt = input.checkOutTime || AppClock.nowISO();
    const inMins = parseTimeToMinutes(attendance.actualCheckInAt);
    const outMins = parseTimeToMinutes(actualCheckOutAt);

    if (outMins < inMins) {
      throw new Error("Waktu checkout tidak boleh sebelum waktu check-in");
    }

    // 6. Early Checkout Calculation
    const schedEndMins = parseTimeToMinutes(attendance.scheduledEndAt);
    const earlyCheckoutMinutes = Math.max(0, schedEndMins - outMins);

    // 7. Update Record (Overtime is not calculated as money/payroll here)
    attendance.actualCheckOutAt = actualCheckOutAt;
    if (attendance.checkOutCorrectionStatus === "PENDING") {
      attendance.checkOutCorrectionStatus = "RESOLVED";
    }
    attendance.earlyCheckoutMinutes = earlyCheckoutMinutes;
    if (input.checkOutPhotoPath !== undefined || input.photoPath !== undefined) {
      attendance.checkOutPhotoPath = input.checkOutPhotoPath ?? input.photoPath ?? null;
    }
    if (input.latitude !== undefined) attendance.checkOutLatitude = input.latitude;
    if (input.longitude !== undefined) attendance.checkOutLongitude = input.longitude;
    if (input.accuracyMeters !== undefined) attendance.checkOutAccuracyMeters = input.accuracyMeters;
    if (input.checkOutMethod || input.method) {
      attendance.checkOutMethod = input.checkOutMethod ?? input.method;
    }
    if (input.notes) {
      attendance.notes = attendance.notes ? `${attendance.notes}; ${input.notes}` : input.notes;
    }
    attendance.updatedAt = AppClock.nowISO();
    attendance.updatedBy = input.actorId || "system";

    return JSON.parse(JSON.stringify(attendance));
  }

  async approveCheckOutCorrection(input: {
    attendanceId: string;
    checkOutAt: string;
    notes?: string;
    actorRole?: UserRole;
    actorId?: string;
  }): Promise<Attendance> {
    if (input.actorRole !== UserRole.SUPER_ADMIN) {
      throw new Error("Hanya Super Admin yang dapat menyetujui koreksi check-out.");
    }
    const attendance = db.attendances.find((row) => row.id === input.attendanceId);
    if (!attendance || attendance.checkOutCorrectionStatus !== "PENDING" || attendance.actualCheckOutAt) {
      throw new Error("Permintaan koreksi check-out tidak ditemukan atau sudah diproses.");
    }
    const checkOutAt = input.checkOutAt.includes("T")
      ? new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Jakarta",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23"
      }).format(new Date(input.checkOutAt))
      : input.checkOutAt;
    if (parseTimeToMinutes(checkOutAt) < parseTimeToMinutes(attendance.actualCheckInAt || "")) {
      throw new Error("Waktu checkout tidak boleh sebelum waktu check-in.");
    }
    attendance.actualCheckOutAt = checkOutAt;
    attendance.earlyCheckoutMinutes = Math.max(
      0,
      parseTimeToMinutes(attendance.scheduledEndAt) - parseTimeToMinutes(checkOutAt)
    );
    attendance.checkOutCorrectionStatus = "APPROVED";
    attendance.checkOutCorrectionApprovedAt = AppClock.nowISO();
    attendance.checkOutCorrectionApprovedBy = input.actorId || "system";
    if (input.notes) {
      attendance.checkOutCorrectionReason = attendance.checkOutCorrectionReason
        ? `${attendance.checkOutCorrectionReason} Catatan: ${input.notes}`
        : input.notes;
    }
    attendance.updatedAt = AppClock.nowISO();
    attendance.updatedBy = input.actorId || "system";
    return JSON.parse(JSON.stringify(attendance));
  }

  async createAbsence(
    input: CreateAbsenceInput,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<Attendance> {
    // 1. Resolve Staff
    let staff = db.staff.find(s => s.id === input.staffId);
    let doctor = db.doctors.find(d => d.id === input.staffId || d.staffId === input.staffId);
    if (!staff && doctor && doctor.staffId) {
      staff = db.staff.find(s => s.id === doctor.staffId);
    }
    if (!staff) {
      throw new Error(`Staff dengan ID "${input.staffId}" tidak ditemukan`);
    }

    // 2. Validate Active
    if (!staff.active || staff.employmentStatus === EmploymentStatus.INACTIVE) {
      throw new Error("Staff berstatus tidak aktif tidak dapat membuat attendance baru");
    }

    // 3. Branch Isolation
    const effectiveRole = input.actorRole || currentUserRole;
    const effectiveBranch = input.actorBranchId || userBranchId;
    if (effectiveRole === UserRole.BRANCH_ADMIN && effectiveBranch) {
      if (input.branchId && input.branchId !== effectiveBranch) {
        throw new Error("Branch Admin hanya dapat mencatat absensi di cabangnya sendiri");
      }
      if (staff.assignedBranchId && staff.assignedBranchId !== effectiveBranch && staff.position !== StaffPosition.DOCTOR) {
        throw new Error("Branch Admin tidak dapat mencatat kehadiran staff cabang lain");
      }
    }

    // 4. Duplicate Check
    const existing = db.attendances.find(a => a.staffId === staff.id && a.date === input.date);
    if (existing) {
      throw new Error("Staff sudah memiliki catatan kehadiran pada tanggal ini");
    }

    // 5. Schedule Check for ABSENT
    const isDoctor = staff.position === StaffPosition.DOCTOR || !!doctor;
    let scheduledStartAt = input.scheduledStartAt || "-";
    let scheduledEndAt = input.scheduledEndAt || "-";
    let targetBranchId = input.branchId || staff.assignedBranchId || effectiveBranch || "branch-gebang";

    let isScheduled = false;
    if (isDoctor) {
      const docId = doctor?.id || db.doctors.find(d => d.staffId === staff!.id)?.id || staff.id;
      const schedules = db.doctorSchedules.filter(s =>
        (s.doctorId === docId || s.doctorId === staff!.id) &&
        s.date === input.date &&
        s.status === ScheduleStatus.ACTIVE
      );
      if (schedules.length > 0) {
        isScheduled = true;
        scheduledStartAt = schedules[0].startTime;
        scheduledEndAt = schedules[0].endTime;
        targetBranchId = schedules[0].branchId;
      }
    } else {
      const assignments = db.staffShiftAssignments.filter(a =>
        a.staffId === staff!.id &&
        a.date === input.date &&
        a.active !== false
      );
      if (assignments.length > 0) {
        isScheduled = true;
        const shift = db.workShifts.find(w => w.id === assignments[0].shiftId);
        if (shift) {
          scheduledStartAt = shift.startTime;
          scheduledEndAt = shift.endTime;
          targetBranchId = assignments[0].branchId || shift.branchId;
        }
      }
    }

    if (input.attendanceStatus === AttendanceStatus.ABSENT && !isScheduled) {
      throw new Error("Status ABSENT hanya dapat ditetapkan jika staff memiliki jadwal/shift pada tanggal tersebut");
    }

    const newAttendance: Attendance = {
      id: `att-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      staffId: staff.id,
      branchId: targetBranchId,
      date: input.date,
      attendanceStatus: input.attendanceStatus,
      scheduledStartAt,
      scheduledEndAt,
      actualCheckInAt: null,
      actualCheckOutAt: null,
      lateMinutes: 0,
      earlyCheckoutMinutes: 0,
      checkInPhotoPath: null,
      checkOutPhotoPath: null,
      checkInMethod: AttendanceMethod.MANUAL,
      checkOutMethod: null,
      notes: input.notes,
      createdAt: AppClock.nowISO(),
      updatedAt: AppClock.nowISO(),
      createdBy: input.actorId || "system",
      updatedBy: input.actorId || "system"
    };

    db.attendances.push(newAttendance);
    return JSON.parse(JSON.stringify(newAttendance));
  }
}

export class MockOvertimeRepository implements OvertimeRepository {
  async getById(id: string, currentUserRole?: UserRole, userBranchId?: string | null): Promise<OvertimeRecord | null> {
    const db = MockDatabase.getInstance();
    const record = db.overtimes.find(o => o.id === id);
    if (!record) return null;
    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId && record.branchId !== userBranchId) {
      return null;
    }
    return JSON.parse(JSON.stringify(record));
  }

  async getByAttendanceId(attendanceId: string, currentUserRole?: UserRole, userBranchId?: string | null): Promise<OvertimeRecord | null> {
    const db = MockDatabase.getInstance();
    const record = db.overtimes.find(o => o.attendanceId === attendanceId);
    if (!record) return null;
    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId && record.branchId !== userBranchId) {
      return null;
    }
    return JSON.parse(JSON.stringify(record));
  }

  async getByStaff(staffId: string, currentUserRole?: UserRole, userBranchId?: string | null): Promise<OvertimeRecord[]> {
    const db = MockDatabase.getInstance();
    let items = db.overtimes.filter(o => o.staffId === staffId);
    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId) {
      items = items.filter(o => o.branchId === userBranchId);
    }
    return JSON.parse(JSON.stringify(items));
  }

  async getByBranch(branchId: string, currentUserRole?: UserRole, userBranchId?: string | null): Promise<OvertimeRecord[]> {
    const db = MockDatabase.getInstance();
    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId && branchId !== userBranchId) {
      throw new Error("Akses ditolak: Branch Admin hanya dapat mengakses cabang sendiri");
    }
    let items = db.overtimes.filter(o => o.branchId === branchId);
    return JSON.parse(JSON.stringify(items));
  }

  async getByDateRange(dateFrom: string, dateTo: string, branchId?: string, currentUserRole?: UserRole, userBranchId?: string | null): Promise<OvertimeRecord[]> {
    const db = MockDatabase.getInstance();
    let items = db.overtimes.filter(o => o.date >= dateFrom && o.date <= dateTo);
    if (branchId) {
      if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId && branchId !== userBranchId) {
        throw new Error("Akses ditolak: Branch Admin hanya dapat mengakses cabang sendiri");
      }
      items = items.filter(o => o.branchId === branchId);
    } else if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId) {
      items = items.filter(o => o.branchId === userBranchId);
    }
    return JSON.parse(JSON.stringify(items));
  }

  async list(currentUserRole?: UserRole, userBranchId?: string | null): Promise<OvertimeRecord[]> {
    const db = MockDatabase.getInstance();
    let items = [...db.overtimes];
    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId) {
      items = items.filter(o => o.branchId === userBranchId);
    }
    return JSON.parse(JSON.stringify(items));
  }

  async detectFromAttendance(attendanceId: string, currentUserRole?: UserRole, userBranchId?: string | null): Promise<OvertimeRecord | null> {
    const db = MockDatabase.getInstance();
    if (currentUserRole !== UserRole.SUPER_ADMIN && currentUserRole !== UserRole.BRANCH_ADMIN) {
      throw new Error("Akses ditolak: hanya Admin Cabang atau Super Admin yang dapat mendeteksi lembur.");
    }
    if (currentUserRole === UserRole.BRANCH_ADMIN && !userBranchId) {
      throw new Error("Cabang Admin tidak memiliki cabang aktif untuk mendeteksi lembur.");
    }
    const attendance = db.attendances.find(a => a.id === attendanceId);
    if (!attendance) {
      throw new Error("Attendance record tidak ditemukan");
    }

    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId && attendance.branchId !== userBranchId) {
      throw new Error("Akses ditolak: Branch Admin hanya dapat mengakses attendance cabang sendiri");
    }

    if (
      ![AttendanceStatus.PRESENT, AttendanceStatus.LATE].includes(attendance.attendanceStatus) ||
      !attendance.actualCheckOutAt ||
      !attendance.scheduledEndAt ||
      attendance.scheduledEndAt === "-"
    ) {
      return null;
    }

    const staff = db.staff.find(s => s.id === attendance.staffId);
    if (!staff || ![StaffPosition.BRANCH_ADMIN, StaffPosition.ASSISTANT].includes(staff.position)) return null;
    const doctor = db.doctors.find(d => d.staffId === attendance.staffId || d.id === attendance.staffId);
    if (doctor) {
      return null;
    }

    const existing = db.overtimes.find(o => o.attendanceId === attendanceId);
    if (existing) {
      return JSON.parse(JSON.stringify(existing));
    }

    const schedEndDate = new Date(toOperationalDateTime(attendance.date, attendance.scheduledEndAt.padStart(5, "0")));
    const actualEndDate = new Date(attendance.actualCheckOutAt);
    const diffMs = actualEndDate.getTime() - schedEndDate.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const overtimeMinutes = Math.max(0, diffMinutes);

    if (overtimeMinutes <= 0) {
      return null;
    }

    const newRecord: OvertimeRecord = {
      id: `ot-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      staffId: attendance.staffId,
      branchId: attendance.branchId,
      attendanceId: attendance.id,
      date: attendance.date,
      scheduledEndAt: attendance.scheduledEndAt,
      actualEndAt: attendance.actualCheckOutAt,
      overtimeMinutes,
      overtimeHours: Number((overtimeMinutes / 60).toFixed(2)),
      overtimeType: OvertimeType.AFTER_SHIFT,
      isNationalHoliday: false,
      calculationMethod: null,
      hourlyRateSnapshot: null,
      overtimeAmountSnapshot: null,
      status: OvertimeStatus.DETECTED,
      notes: null,
      approvedBy: null,
      approvedAt: null,
      rejectedBy: null,
      rejectedAt: null,
      rejectionReason: null,
      createdAt: AppClock.nowISO(),
      updatedAt: AppClock.nowISO(),
      createdBy: "system",
      updatedBy: "system"
    };

    db.overtimes.push(newRecord);
    return JSON.parse(JSON.stringify(newRecord));
  }

  async submit(id: string, currentUserRole?: UserRole, userBranchId?: string | null): Promise<OvertimeRecord> {
    const db = MockDatabase.getInstance();
    if (currentUserRole !== UserRole.SUPER_ADMIN && currentUserRole !== UserRole.BRANCH_ADMIN) {
      throw new Error("Akses ditolak: hanya Admin Cabang atau Super Admin yang dapat mengajukan lembur.");
    }
    if (currentUserRole === UserRole.BRANCH_ADMIN && !userBranchId) {
      throw new Error("Cabang Admin tidak memiliki cabang aktif untuk mengajukan lembur.");
    }
    const record = db.overtimes.find(o => o.id === id);
    if (!record) {
      throw new Error("OvertimeRecord tidak ditemukan");
    }
    const overtimeStaff = db.staff.find((staff) => staff.id === record.staffId);
    if (!overtimeStaff || ![StaffPosition.BRANCH_ADMIN, StaffPosition.ASSISTANT].includes(overtimeStaff.position)) {
      throw new Error("Lembur hanya berlaku untuk Asisten Dokter dan Admin Cabang.");
    }
    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId && record.branchId !== userBranchId) {
      throw new Error("Akses ditolak: Branch Admin hanya dapat submit overtime cabang sendiri");
    }
    if (record.status !== OvertimeStatus.DETECTED) {
      throw new Error(`Overtime record dengan status ${record.status} tidak dapat disubmit`);
    }

    record.status = OvertimeStatus.SUBMITTED;
    record.updatedAt = AppClock.nowISO();
    record.updatedBy = currentUserRole || "system";
    return JSON.parse(JSON.stringify(record));
  }

  async approve(
    id: string,
    approverName: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null,
    approvedOvertimeMinutes?: number,
    isNationalHoliday = false
  ): Promise<OvertimeRecord> {
    const db = MockDatabase.getInstance();
    if (currentUserRole !== UserRole.SUPER_ADMIN) {
      throw new Error("Akses ditolak: Hanya Super Admin yang dapat menyetujui lembur.");
    }
    if (!approverName.trim()) throw new Error("Nama Super Admin penyetuju wajib diisi.");
    const record = db.overtimes.find(o => o.id === id);
    if (!record) {
      throw new Error("OvertimeRecord tidak ditemukan");
    }
    const overtimeStaff = db.staff.find((staff) => staff.id === record.staffId);
    if (!overtimeStaff || ![StaffPosition.BRANCH_ADMIN, StaffPosition.ASSISTANT].includes(overtimeStaff.position)) {
      throw new Error("Lembur hanya dapat disetujui untuk Asisten Dokter dan Admin Cabang.");
    }
    if (record.status !== OvertimeStatus.SUBMITTED) {
      throw new Error(`Overtime record dengan status ${record.status} tidak dapat diapprove (harus SUBMITTED)`);
    }
    const payableMinutes = approvedOvertimeMinutes ?? record.overtimeMinutes;
    if (!Number.isInteger(payableMinutes) || payableMinutes <= 0 || payableMinutes > record.overtimeMinutes) {
      throw new Error("Durasi lembur yang disetujui harus berupa menit positif dan tidak boleh melebihi durasi aktual.");
    }

    record.status = OvertimeStatus.APPROVED;
    record.approvedOvertimeMinutes = payableMinutes;
    record.overtimeHours = Number((payableMinutes / 60).toFixed(2));
    record.isNationalHoliday = isNationalHoliday;
    record.hourlyRateSnapshot = isNationalHoliday ? 30000 : 15000;
    record.overtimeAmountSnapshot = Math.round((payableMinutes * record.hourlyRateSnapshot) / 60);
    record.calculationMethod = "APPROVED_MINUTES_PRORATED";
    record.approvedBy = approverName;
    record.approvedAt = AppClock.nowISO();
    record.updatedAt = AppClock.nowISO();
    record.updatedBy = approverName;
    return JSON.parse(JSON.stringify(record));
  }

  async reject(id: string, approverName: string, reason: string, currentUserRole?: UserRole, userBranchId?: string | null): Promise<OvertimeRecord> {
    const db = MockDatabase.getInstance();
    if (currentUserRole !== UserRole.SUPER_ADMIN) {
      throw new Error("Akses ditolak: Hanya Super Admin yang dapat menolak lembur.");
    }
    if (!approverName.trim()) throw new Error("Nama Super Admin penolak wajib diisi.");
    if (!reason || reason.trim() === "") {
      throw new Error("Alasan penolakan (rejection reason) wajib diisi");
    }
    const record = db.overtimes.find(o => o.id === id);
    if (!record) {
      throw new Error("OvertimeRecord tidak ditemukan");
    }
    if (record.status !== OvertimeStatus.SUBMITTED) {
      throw new Error(`Overtime record dengan status ${record.status} tidak dapat direject (harus SUBMITTED)`);
    }

    record.status = OvertimeStatus.REJECTED;
    record.rejectedBy = approverName;
    record.rejectedAt = AppClock.nowISO();
    record.rejectionReason = reason;
    record.updatedAt = AppClock.nowISO();
    record.updatedBy = approverName;
    return JSON.parse(JSON.stringify(record));
  }

  async getSummary(branchId?: string, currentUserRole?: UserRole, userBranchId?: string | null): Promise<OvertimeSummary> {
    const db = MockDatabase.getInstance();
    let items = [...db.overtimes];
    if (branchId) {
      if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId && branchId !== userBranchId) {
        throw new Error("Akses ditolak");
      }
      items = items.filter(o => o.branchId === branchId);
    } else if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId) {
      items = items.filter(o => o.branchId === userBranchId);
    }

    const summary: OvertimeSummary = {
      totalDetectedMinutes: items.filter(o => o.status === OvertimeStatus.DETECTED).reduce((acc, o) => acc + o.overtimeMinutes, 0),
      totalSubmittedMinutes: items.filter(o => o.status === OvertimeStatus.SUBMITTED).reduce((acc, o) => acc + o.overtimeMinutes, 0),
      totalApprovedMinutes: items.filter(o => o.status === OvertimeStatus.APPROVED).reduce((acc, o) => acc + (o.approvedOvertimeMinutes ?? o.overtimeMinutes), 0),
      totalRejectedMinutes: items.filter(o => o.status === OvertimeStatus.REJECTED).reduce((acc, o) => acc + o.overtimeMinutes, 0),
      totalPaidMinutes: items.filter(o => o.status === OvertimeStatus.PAID).reduce((acc, o) => acc + (o.approvedOvertimeMinutes ?? o.overtimeMinutes), 0),
    };
    return summary;
  }
}

function assertMedicalRecordRole(currentUserRole: UserRole | undefined): void {
  if (currentUserRole !== UserRole.DOCTOR && currentUserRole !== UserRole.SUPER_ADMIN) {
    throw new Error("Anda tidak memiliki akses ke data ini.");
  }
}

function assertMedicalRecordAccess(
  currentUserRole: UserRole | undefined,
  userBranchId: string | null | undefined,
  recordBranchId: string
): void {
  assertMedicalRecordRole(currentUserRole);
  if (currentUserRole === UserRole.SUPER_ADMIN) return;
  if (!userBranchId || recordBranchId !== userBranchId) {
    throw new Error("Anda tidak memiliki akses ke data ini.");
  }
}

export class MockMedicalRecordRepository implements MedicalRecordRepository {
  async getConsentDocumentsByVisit(
    visitId: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<ClinicalConsentDocument[]> {
    assertMedicalRecordRole(currentUserRole);
    const db = MockDatabase.getInstance();
    const visit = db.visits.find((item) => item.id === visitId);
    if (!visit) throw new Error("Data kunjungan tidak ditemukan.");
    assertMedicalRecordAccess(currentUserRole, userBranchId, visit.branchId);
    return [];
  }

  async uploadConsentDocument(
    _data: {
      visitId: string;
      branchId: string;
      scope: ClinicalConsentScope;
      treatmentJobId?: string;
      file: File;
    },
    currentUserRole?: UserRole
  ): Promise<ClinicalConsentDocument> {
    assertMedicalRecordRole(currentUserRole);
    throw new Error("Unggah dokumen consent hanya tersedia pada koneksi Supabase.");
  }

  async downloadConsentDocument(
    _documentId: string,
    currentUserRole?: UserRole
  ): Promise<{ fileName: string; blob: Blob }> {
    assertMedicalRecordRole(currentUserRole);
    throw new Error("Unduh dokumen consent hanya tersedia pada koneksi Supabase.");
  }

  async getPatientMedicalProfile(
    patientId: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ) {
    assertMedicalRecordRole(currentUserRole);
    const db = MockDatabase.getInstance();
    const profile = db.patientMedicalProfiles.find((item) => item.patientId === patientId);
    if (currentUserRole !== UserRole.SUPER_ADMIN) {
      const canAccessBranch = profile?.branchId
        ? profile.branchId === userBranchId
        : db.visits.some((visit) => visit.patientId === patientId && visit.branchId === userBranchId);
      if (!userBranchId || !canAccessBranch) throw new Error("Anda tidak memiliki akses ke data ini.");
    }
    if (profile) return JSON.parse(JSON.stringify(profile));
    const patient = db.patients.find((item) => item.id === patientId);
    return patient
      ? { patientId, medicalHistoryNotes: patient.medicalHistoryNotes || "" }
      : null;
  }

  async savePatientMedicalProfile(
    profile: PatientMedicalProfile,
    currentUserRole?: UserRole,
    userBranchId?: string | null,
    currentUserId?: string | null
  ) {
    assertMedicalRecordRole(currentUserRole);
    const db = MockDatabase.getInstance();
    const existing = db.patientMedicalProfiles.find((item) => item.patientId === profile.patientId);
    const profileBranchId = existing?.branchId ?? profile.branchId;
    const canAccessBranch = currentUserRole === UserRole.SUPER_ADMIN ||
      (Boolean(userBranchId) && (
        profileBranchId
          ? profileBranchId === userBranchId
          : db.visits.some((visit) => visit.patientId === profile.patientId && visit.branchId === userBranchId)
      ));
    if (!canAccessBranch) throw new Error("Anda tidak memiliki akses ke data ini.");

    const saved = {
      ...existing,
      ...profile,
      branchId: existing?.branchId ?? profile.branchId ?? userBranchId,
      updatedAt: AppClock.nowISO(),
      updatedBy: currentUserId || undefined
    };
    if (existing) Object.assign(existing, saved);
    else db.patientMedicalProfiles.push(saved);
    db.saveToStorage();
    return JSON.parse(JSON.stringify(saved));
  }

  async getMedicalRecordById(
    id: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<MedicalRecord | null> {
    assertMedicalRecordRole(currentUserRole);
    const db = MockDatabase.getInstance();
    const record = db.medicalRecords.find((r) => r.id === id);
    if (!record) return null;
    assertMedicalRecordAccess(currentUserRole, userBranchId, record.branchId);

    return JSON.parse(JSON.stringify(record));
  }

  async getMedicalRecordByVisit(
    visitId: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<MedicalRecord | null> {
    assertMedicalRecordRole(currentUserRole);
    const db = MockDatabase.getInstance();
    const record = db.medicalRecords.find((r) => r.visitId === visitId);
    if (!record) return null;
    assertMedicalRecordAccess(currentUserRole, userBranchId, record.branchId);

    return JSON.parse(JSON.stringify(record));
  }

  async getMedicalRecordsByPatient(
    patientId: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<MedicalRecord[]> {
    assertMedicalRecordRole(currentUserRole);
    const db = MockDatabase.getInstance();
    let records = db.medicalRecords.filter((r) => r.patientId === patientId);
    if (currentUserRole === UserRole.SUPER_ADMIN) {
      // Super Admin can read across branches.
    } else if (currentUserRole === UserRole.DOCTOR && userBranchId) {
      records = records.filter((r) => r.branchId === userBranchId);
    } else {
      throw new Error("Anda tidak memiliki akses ke data ini.");
    }

    records.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return JSON.parse(JSON.stringify(records));
  }

  async createOrUpdateMedicalRecord(
    data: {
      visitId: string;
      patientId: string;
      branchId: string;
      doctorId: string;
      chiefComplaint: string;
      anamnesis?: string;
      clinicalExamination?: string;
      diagnosis: string;
      diagnosisCode?: string;
      procedureCodes?: string[];
      treatmentPlan?: string;
      doctorNotes?: string;
      odontogram?: MedicalRecord["odontogram"];
      clinicFormData?: MedicalRecord["clinicFormData"];
      vitalSigns?: MedicalRecord["vitalSigns"];
      medicalHistorySnapshot?: MedicalRecord["medicalHistorySnapshot"];
      status?: MedicalRecordStatus | "DRAFT" | "FINAL";
      customId?: string;
    },
    currentUserRole?: UserRole,
    userBranchId?: string | null,
    currentUserId?: string | null
  ): Promise<MedicalRecord> {
    assertMedicalRecordRole(currentUserRole);
    const db = MockDatabase.getInstance();

    const visit = db.visits.find((v) => v.id === data.visitId);
    if (!visit) {
      throw new Error("Data kunjungan tidak ditemukan.");
    }

    if (visit.patientId !== data.patientId) {
      throw new Error("Pasien tidak sesuai dengan kunjungan.");
    }

    if (visit.branchId !== data.branchId) {
      throw new Error("Cabang tidak sesuai dengan kunjungan.");
    }
    assertMedicalRecordAccess(currentUserRole, userBranchId, visit.branchId);
    const targetStatus = data.status || MedicalRecordStatus.DRAFT;
    if (targetStatus === MedicalRecordStatus.FINAL && currentUserRole !== UserRole.DOCTOR) {
      throw new Error("Hanya dokter yang dapat menandatangani & memfinalisasi rekam medis.");
    }

    if (targetStatus !== MedicalRecordStatus.DRAFT && targetStatus !== MedicalRecordStatus.FINAL) {
      throw new Error("Anda tidak memiliki akses ke data ini.");
    }

    const patientName = db.patients.find((p) => p.id === data.patientId)?.name || "Pasien";
    const doctorName = db.doctors.find((d) => d.id === data.doctorId)?.name || "Dokter";
    const branchName = db.branches.find((b) => b.id === data.branchId)?.name || "Cabang";

    const existingIndex = db.medicalRecords.findIndex((r) => r.visitId === data.visitId);
    const nowIso = AppClock.nowISO();

    if (existingIndex >= 0) {
      const existing = db.medicalRecords[existingIndex];
      if (existing.status === MedicalRecordStatus.FINAL || existing.isLocked) {
        throw new Error("Rekam medis final terkunci; gunakan addendum untuk koreksi.");
      }
      existing.chiefComplaint = data.chiefComplaint;
      existing.anamnesis = data.anamnesis || existing.anamnesis || "";
      existing.clinicalExamination = data.clinicalExamination || existing.clinicalExamination || "";
      existing.diagnosis = data.diagnosis;
      existing.diagnosisCode = data.diagnosisCode;
      existing.procedureCodes = data.procedureCodes || [];
      existing.treatmentPlan = data.treatmentPlan || existing.treatmentPlan || "";
      existing.doctorNotes = data.doctorNotes || existing.doctorNotes || "";
      existing.odontogram = data.odontogram || existing.odontogram || { schemaVersion: 1, teeth: {} };
      existing.clinicFormData = data.clinicFormData || existing.clinicFormData;
      existing.vitalSigns = data.vitalSigns || {};
      existing.medicalHistorySnapshot = data.medicalHistorySnapshot || existing.medicalHistorySnapshot;
      existing.status = targetStatus;
      existing.signedByDoctorId = targetStatus === MedicalRecordStatus.FINAL ? data.doctorId : undefined;
      existing.signedAt = targetStatus === MedicalRecordStatus.FINAL ? nowIso : undefined;
      existing.isLocked = targetStatus === MedicalRecordStatus.FINAL;
      existing.updatedAt = nowIso;
      existing.patientNameSnapshot = patientName;
      existing.doctorNameSnapshot = doctorName;
      existing.branchNameSnapshot = branchName;

      db.saveToStorage();
      return JSON.parse(JSON.stringify(existing));
    } else {
      const newRecord: MedicalRecord = {
        id: data.customId || `mr-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        visitId: data.visitId,
        patientId: data.patientId,
        branchId: data.branchId,
        doctorId: data.doctorId,
        chiefComplaint: data.chiefComplaint,
        anamnesis: data.anamnesis || "",
        clinicalExamination: data.clinicalExamination || "",
        diagnosis: data.diagnosis,
        diagnosisCode: data.diagnosisCode,
        procedureCodes: data.procedureCodes || [],
        treatmentPlan: data.treatmentPlan || "",
        doctorNotes: data.doctorNotes || "",
        odontogram: data.odontogram || { schemaVersion: 1, teeth: {} },
        odontogramHistory: [],
        clinicFormData: data.clinicFormData,
        vitalSigns: data.vitalSigns || {},
        medicalHistorySnapshot: data.medicalHistorySnapshot,
        status: targetStatus,
        signedByDoctorId: targetStatus === MedicalRecordStatus.FINAL ? data.doctorId : undefined,
        signedAt: targetStatus === MedicalRecordStatus.FINAL ? nowIso : undefined,
        isLocked: targetStatus === MedicalRecordStatus.FINAL,
        createdAt: nowIso,
        updatedAt: nowIso,
        patientNameSnapshot: patientName,
        doctorNameSnapshot: doctorName,
        branchNameSnapshot: branchName
      };

      db.medicalRecords.push(newRecord);
      db.saveToStorage();
      return JSON.parse(JSON.stringify(newRecord));
    }
  }

  async finalizeMedicalRecord(
    id: string,
    doctorId: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<MedicalRecord> {
    if (currentUserRole !== UserRole.DOCTOR) {
      throw new Error("Hanya Dokter yang dapat menandatangani & memfinalisasi rekam medis.");
    }

    const db = MockDatabase.getInstance();
    const record = db.medicalRecords.find((item) => item.id === id);
    if (!record) throw new Error("Rekam medis tidak ditemukan.");
    assertMedicalRecordAccess(currentUserRole, userBranchId, record.branchId);
    if (record.status === MedicalRecordStatus.FINAL || record.isLocked) {
      throw new Error("Rekam medis sudah final dan terkunci.");
    }
    if (record.doctorId !== doctorId) {
      throw new Error("Hanya dokter penanggung jawab yang dapat menandatangani rekam medis.");
    }

    const nowIso = AppClock.nowISO();
    record.status = MedicalRecordStatus.FINAL;
    record.signedByDoctorId = doctorId;
    record.signedAt = nowIso;
    record.isLocked = true;
    record.updatedAt = nowIso;
    return JSON.parse(JSON.stringify(record));
  }
}

export class MockPromotionRepository implements PromotionRepository {
  async getPromotions(currentUserRole?: UserRole, userBranchId?: string | null): Promise<PromotionMedia[]> {
    let items = [...db.promotions];
    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId) {
      items = items.filter((p) => !p.branchId || p.branchId === userBranchId);
    }
    return items
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((p) => ({ ...p }));
  }

  async getPromotionById(id: string, currentUserRole?: UserRole, userBranchId?: string | null): Promise<PromotionMedia | null> {
    const item = db.promotions.find((p) => p.id === id);
    if (!item) return null;
    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId && item.branchId && item.branchId !== userBranchId) {
      return null;
    }
    return { ...item };
  }

  async getActivePromotions(branchId?: string | null): Promise<PromotionMedia[]> {
    return db.promotions
      .filter((p) => {
        if (!p.isActive) return false;
        if (!branchId) return true; // all active
        return !p.branchId || p.branchId === branchId; // global or matched branch
      })
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((p) => ({ ...p }));
  }

  async createPromotion(
    data: {
      title?: string;
      description?: string;
      imageUrl: string;
      branchId?: string | null;
      isActive?: boolean;
      displayOrder?: number;
      customId?: string;
    },
    currentUserRole?: UserRole,
    _userBranchId?: string | null
  ): Promise<PromotionMedia> {
    if (currentUserRole !== UserRole.SUPER_ADMIN) {
      throw new Error("Anda tidak memiliki akses. Hanya Super Admin yang dapat membuat promosi.");
    }

    if (!data.imageUrl || !data.imageUrl.trim()) {
      throw new Error("Gambar promosi wajib diupload");
    }

    if (data.branchId) {
      const branchExists = db.branches.some((b) => b.id === data.branchId);
      if (!branchExists) {
        throw new Error("Cabang tidak ditemukan.");
      }
    }

    const now = AppClock.nowISO();
    const nextOrder = data.displayOrder ?? (db.promotions.length > 0 ? Math.max(...db.promotions.map((p) => p.displayOrder)) + 1 : 1);

    const newPromo: PromotionMedia = {
      id: data.customId || `promo-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      title: data.title?.trim() || "",
      description: data.description?.trim() || "",
      imageUrl: data.imageUrl,
      branchId: data.branchId || null,
      isActive: data.isActive !== undefined ? data.isActive : true,
      displayOrder: nextOrder,
      createdAt: now,
      updatedAt: now
    };

    db.promotions.push(newPromo);
    return { ...newPromo };
  }

  async updatePromotion(
    id: string,
    updates: Partial<{
      title: string;
      description: string;
      imageUrl: string;
      branchId: string | null;
      isActive: boolean;
      displayOrder: number;
    }>,
    currentUserRole?: UserRole,
    _userBranchId?: string | null
  ): Promise<PromotionMedia> {
    if (currentUserRole !== UserRole.SUPER_ADMIN) {
      throw new Error("Anda tidak memiliki akses. Hanya Super Admin yang dapat mengubah promosi.");
    }

    const index = db.promotions.findIndex((p) => p.id === id);
    if (index === -1) {
      throw new Error("Promosi tidak ditemukan");
    }

    if (updates.branchId) {
      const branchExists = db.branches.some((b) => b.id === updates.branchId);
      if (!branchExists) {
        throw new Error("Cabang tidak ditemukan.");
      }
    }

    const current = db.promotions[index];
    const updated: PromotionMedia = {
      ...current,
      ...updates,
      title: updates.title !== undefined ? updates.title.trim() : current.title,
      description: updates.description !== undefined ? updates.description.trim() : current.description,
      branchId: updates.branchId !== undefined ? updates.branchId : current.branchId,
      updatedAt: AppClock.nowISO()
    };

    db.promotions[index] = updated;
    return { ...updated };
  }

  async deletePromotion(
    id: string,
    currentUserRole?: UserRole,
    _userBranchId?: string | null
  ): Promise<boolean> {
    if (currentUserRole !== UserRole.SUPER_ADMIN) {
      throw new Error("Anda tidak memiliki akses. Hanya Super Admin yang dapat menghapus promosi.");
    }

    const index = db.promotions.findIndex((p) => p.id === id);
    if (index === -1) {
      throw new Error("Promosi tidak ditemukan");
    }

    db.promotions.splice(index, 1);
    return true;
  }

  async toggleActive(
    id: string,
    isActive: boolean,
    currentUserRole?: UserRole,
    _userBranchId?: string | null
  ): Promise<PromotionMedia> {
    if (currentUserRole !== UserRole.SUPER_ADMIN) {
      throw new Error("Anda tidak memiliki akses. Hanya Super Admin yang dapat mengubah status promosi.");
    }

    const promo = db.promotions.find((p) => p.id === id);
    if (!promo) {
      throw new Error("Promosi tidak ditemukan");
    }

    promo.isActive = isActive;
    promo.updatedAt = AppClock.nowISO();
    return { ...promo };
  }

  async reorderPromotions(
    orderedIds: string[],
    currentUserRole?: UserRole,
    _userBranchId?: string | null
  ): Promise<PromotionMedia[]> {
    if (currentUserRole !== UserRole.SUPER_ADMIN) {
      throw new Error("Anda tidak memiliki akses. Hanya Super Admin yang dapat mengatur urutan promosi.");
    }

    orderedIds.forEach((id, idx) => {
      const p = db.promotions.find((item) => item.id === id);
      if (p) {
        p.displayOrder = idx + 1;
        p.updatedAt = AppClock.nowISO();
      }
    });

    return db.promotions
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((p) => ({ ...p }));
  }
}

export class MockBackupRepository implements BackupRepository {
  private backupJobs: BackupJob[] = [];

  constructor() {
    this.seedInitialHistory();
  }

  private seedInitialHistory() {
    const now = AppClock.now();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

    this.backupJobs.push(
      {
        id: "backup-job-db-yesterday",
        backupType: BackupType.DATABASE,
        intervalType: BackupScheduleInterval.DAILY,
        startedAt: yesterday.toISOString(),
        completedAt: new Date(yesterday.getTime() + 15000).toISOString(),
        status: BackupStatus.VERIFIED,
        sizeBytes: 2516582, // ~2.4 MB
        destination: "LALA DENTIST BACKUP/DATABASE/DAILY/lala-dentist-db-2026-09-23-020000.sql.gz",
        provider: "GOOGLE_DRIVE",
        checksum: "sha256-a1b2c3d4e5f67890123456789abcdef0",
        errorMessage: null,
        isVerified: true,
        verifiedAt: new Date(yesterday.getTime() + 16000).toISOString(),
        verificationNotes: "Checksum verified, all 22 clinical tables intact, schema validated.",
        triggeredBy: "SYSTEM_SCHEDULE",
        createdAt: yesterday.toISOString(),
        manifest: {
          backupId: "backup-job-db-yesterday",
          createdAt: yesterday.toISOString(),
          backupType: BackupType.DATABASE,
          intervalType: BackupScheduleInterval.DAILY,
          databaseVersion: "PostgreSQL 15.1",
          schemaVersion: "20260923000000_business_schema_foundation",
          fileName: "lala-dentist-db-2026-09-23-020000.sql.gz",
          fileSize: 2516582,
          checksum: "sha256-a1b2c3d4e5f67890123456789abcdef0",
          tablesIncluded: [
            "dental_branches",
            "master_services",
            "staff",
            "dental_doctors",
            "doctor_schedules",
            "work_shifts",
            "patient_profiles",
            "bookings",
            "patient_visits",
            "queue_items",
            "treatment_jobs",
            "treatment_activities",
            "medical_records",
            "invoices",
            "invoice_items",
            "payment_transactions",
            "monthly_payrolls",
            "attendances",
            "overtime_records",
            "chart_of_accounts",
            "journal_entries",
            "journal_lines"
          ],
          status: BackupStatus.VERIFIED,
          isVerified: true,
          durationMs: 15420,
          destinationPath: "LALA DENTIST BACKUP/DATABASE/DAILY/lala-dentist-db-2026-09-23-020000.sql.gz",
          provider: "GOOGLE_DRIVE",
          notes: "Automated daily 02:00 WIB backup"
        }
      },
      {
        id: "backup-job-media-yesterday",
        backupType: BackupType.MEDIA,
        intervalType: BackupScheduleInterval.DAILY,
        startedAt: twoDaysAgo.toISOString(),
        completedAt: new Date(twoDaysAgo.getTime() + 22000).toISOString(),
        status: BackupStatus.VERIFIED,
        sizeBytes: 15518924, // ~14.8 MB
        destination: "LALA DENTIST BACKUP/MEDIA/DAILY/lala-dentist-media-2026-09-22-020000.tar.gz",
        provider: "GOOGLE_DRIVE",
        checksum: "sha256-f9e8d7c6b5a432109876543210fedcba",
        errorMessage: null,
        isVerified: true,
        verifiedAt: new Date(twoDaysAgo.getTime() + 23000).toISOString(),
        verificationNotes: "Storage bucket object count: 18 media items verified.",
        triggeredBy: "SYSTEM_SCHEDULE",
        createdAt: twoDaysAgo.toISOString()
      }
    );
  }

  async getBackupJobs(currentUserRole?: UserRole): Promise<BackupJob[]> {
    if (currentUserRole && currentUserRole !== UserRole.SUPER_ADMIN) {
      throw new Error("Akses ditolak: Hanya Super Admin yang dapat mengakses riwayat backup sistem.");
    }
    return [...this.backupJobs].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getBackupJobById(id: string, currentUserRole?: UserRole): Promise<BackupJob | null> {
    if (currentUserRole && currentUserRole !== UserRole.SUPER_ADMIN) {
      throw new Error("Akses ditolak: Hanya Super Admin yang dapat mengakses detail backup.");
    }
    const found = this.backupJobs.find((j) => j.id === id);
    return found ? { ...found } : null;
  }

  async createBackupJob(
    job: Omit<BackupJob, "id" | "createdAt"> & { id?: string },
    currentUserRole?: UserRole
  ): Promise<BackupJob> {
    if (currentUserRole && currentUserRole !== UserRole.SUPER_ADMIN) {
      throw new Error("Akses ditolak: Hanya Super Admin yang dapat membuat entri backup.");
    }
    const newJob: BackupJob = {
      ...job,
      id: job.id || `backup-job-${Date.now()}`,
      createdAt: AppClock.nowISO()
    };
    this.backupJobs.unshift(newJob);
    return { ...newJob };
  }

  async updateBackupJob(
    id: string,
    updates: Partial<BackupJob>,
    currentUserRole?: UserRole
  ): Promise<BackupJob> {
    if (currentUserRole && currentUserRole !== UserRole.SUPER_ADMIN) {
      throw new Error("Akses ditolak: Hanya Super Admin yang dapat memperbarui entri backup.");
    }
    const idx = this.backupJobs.findIndex((j) => j.id === id);
    if (idx === -1) {
      throw new Error("Job backup tidak ditemukan");
    }
    this.backupJobs[idx] = {
      ...this.backupJobs[idx],
      ...updates
    };
    return { ...this.backupJobs[idx] };
  }

  async deleteBackupJob(id: string, currentUserRole?: UserRole): Promise<boolean> {
    if (currentUserRole && currentUserRole !== UserRole.SUPER_ADMIN) {
      throw new Error("Akses ditolak: Hanya Super Admin yang dapat menghapus entri backup.");
    }
    const idx = this.backupJobs.findIndex((j) => j.id === id);
    if (idx === -1) return false;
    this.backupJobs.splice(idx, 1);
    return true;
  }

  async getLatestDatabaseBackup(currentUserRole?: UserRole): Promise<BackupJob | null> {
    const jobs = await this.getBackupJobs(currentUserRole);
    return jobs.find((j) => j.backupType === BackupType.DATABASE && j.status === BackupStatus.VERIFIED) || null;
  }

  async getLatestMediaBackup(currentUserRole?: UserRole): Promise<BackupJob | null> {
    const jobs = await this.getBackupJobs(currentUserRole);
    return jobs.find((j) => j.backupType === BackupType.MEDIA && j.status === BackupStatus.VERIFIED) || null;
  }

  async getSystemSummary(currentUserRole?: UserRole): Promise<BackupSystemSummary> {
    const jobs = await this.getBackupJobs(currentUserRole);
    const lastDb = jobs.find((j) => j.backupType === BackupType.DATABASE && j.status === BackupStatus.VERIFIED) || null;
    const lastMedia = jobs.find((j) => j.backupType === BackupType.MEDIA && j.status === BackupStatus.VERIFIED) || null;
    const storageUsage = jobs.reduce((sum, j) => sum + (j.sizeBytes || 0), 0);

    const hasFailed = jobs.slice(0, 5).some((j) => j.status === BackupStatus.FAILED);

    return {
      systemHealth: hasFailed ? "WARNING" : "HEALTHY",
      provider: "GOOGLE_DRIVE",
      isConnected: true,
      lastDatabaseBackup: lastDb,
      lastMediaBackup: lastMedia,
      nextScheduledBackupAt: "02:00 WIB",
      totalBackupsCount: jobs.length,
      storageUsageBytes: storageUsage,
      recentJobs: jobs.slice(0, 10)
    };
  }
}
