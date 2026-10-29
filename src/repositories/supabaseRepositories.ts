/**
 * LALA DENTIST - SUPABASE PRODUCTION REPOSITORIES
 * Single Source of Truth database persistence mapping with strict Row Level Security (RLS),
 * Branch Isolation, and RBAC error handling.
 */

import { supabase, supabaseWriteClient, isSupabaseConfigured } from "../lib/supabase";
import {
  PatientRepository,
  BranchRepository,
  BookingRepository,
  H1ConfirmationRepository,
  VisitRepository,
  QueueRepository,
  TreatmentRepository,
  TreatmentActivityRepository,
  MedicalRecordRepository,
  InvoiceRepository,
  PaymentRepository,
  DoctorRepository,
  ConfigurationRepository,
  StaffRepository,
  DoctorScheduleRepository,
  AttendanceRepository,
  OvertimeRepository,
  PayrollRepository,
  AccountingRepository,
  CompensationRepository,
  WorkShiftRepository,
  StaffShiftAssignmentRepository,
  PromotionRepository,
  MediaStorageRepository,
  BackupRepository,
  DuplicateCheckResult,
  StaffFilter,
  ScheduleFilter,
  CreateAccountInput,
  UpdateAccountInput,
  CreateJournalInput,
  AttendanceFilter,
  CheckInInput,
  CheckOutInput,
  CreateAbsenceInput,
  JournalFilter,
  LedgerQuery,
  StaffShiftAssignmentFilter,
  OvertimeSummary
} from "./interfaces";
import {
  PatientProfile,
  DentalBranch,
  DentalDoctor,
  Booking,
  PatientBookingQueueEstimate,
  PlannedTreatment,
  BookingStatus,
  BookingSource,
  BookingConfirmationH1,
  PatientVisit,
  PatientVisitAnalyticsRecord,
  QueueItem,
  LiveQueueSnapshot,
  TreatmentJob,
  TreatmentJobStatus,
  TreatmentActivity,
  TreatmentActivityType,
  MedicalRecord,
  MedicalRecordStatus,
  OdontogramData,
  PatientMedicalProfile,
  ClinicalConsentDocument,
  ClinicalConsentScope,
  Invoice,
  InvoiceItem,
  InvoiceStatus,
  PaymentTransaction,
  PaymentMethod,
  MonthlyPayroll,
  PayrollItem,
  ChartOfAccount,
  JournalEntry,
  Staff,
  Attendance,
  DoctorSchedule,
  DoctorBranchAssignment,
  WorkShift,
  StaffShiftAssignment,
  StaffShiftRotationTemplate,
  OvertimeRecord,
  CompensationAccrual,
  StaffCompensationRule,
  MasterService,
  BranchServiceTariff,
  ClinicBranding,
  PromotionMedia,
  MediaUploadResult,
  BackupJob,
  BackupType,
  BackupStatus,
  BackupScheduleInterval,
  BackupSystemSummary,
  UserRole,
  EmploymentStatus,
  QueueStatus,
  VisitStatus,
  VisitType,
  ScheduleStatus,
  ConfirmationStatusH1,
  OvertimeType,
  OvertimeStatus,
  JournalSourceType,
  JournalStatus,
  PayrollStatus,
  StaffPosition,
  AttendanceStatus,
  AttendanceMethod,
  AccountType,
  AccountCategory,
  RecurringExpensePlan,
  RecurringExpenseType,
  NormalBalance,
  GeneralLedgerEntry,
  BalanceSheetReport,
  IncomeStatementReport,
  TrialBalanceReport
} from "../types/domain";
import { calculatePayrollTax } from "../utils/payrollTax";
import {
  AccountBalanceResult
} from "./interfaces";
import { AppClock } from "../utils/clock";
import { canViewPatientPhone, redactPatientPhone } from "../utils/patientPrivacy";
import { generateInvoiceNumber, generateReceiptNumber } from "../utils/documentUtils";
import { checkRMUniqueness, getPatientMedicalRecordNumber } from "../utils/rmUtils";

const attendanceSelectColumns = [
  "id", "staff_id", "branch_id", "date", "attendance_status",
  "scheduled_start_at", "scheduled_end_at", "actual_check_in_at",
  "actual_check_out_at", "late_minutes", "early_checkout_minutes",
  "check_in_photo_path", "check_out_photo_path", "check_in_latitude",
  "check_in_longitude", "check_in_accuracy_meters", "check_out_latitude",
  "check_out_longitude", "check_out_accuracy_meters", "check_in_method",
  "check_out_method", "check_out_correction_status", "check_out_correction_requested_at",
  "check_out_correction_requested_by",
  "check_out_correction_approved_at", "check_out_correction_approved_by",
  "check_out_correction_reason", "notes", "created_by", "updated_by", "created_at", "updated_at"
].join(", ");
const legacyAttendanceSelectColumns = [
  "id", "staff_id", "branch_id", "date", "attendance_status",
  "scheduled_start_at", "scheduled_end_at", "actual_check_in_at",
  "actual_check_out_at", "late_minutes", "early_checkout_minutes",
  "check_in_photo_path", "check_out_photo_path", "check_in_latitude",
  "check_in_longitude", "check_in_accuracy_meters", "check_out_latitude",
  "check_out_longitude", "check_out_accuracy_meters", "check_in_method",
  "check_out_method", "notes", "created_by", "updated_by", "created_at", "updated_at"
].join(", ");

async function queryAttendanceWithSchemaFallback<T>(
  query: (columns: string) => PromiseLike<{ data: T; error: { message: string } | null }>
): Promise<{ data: T; error: { message: string } | null }> {
  const result = await query(attendanceSelectColumns);
  const missingCorrectionColumn = result.error?.message &&
    result.error.message.includes("check_out_correction_") &&
    /does not exist|schema cache|could not find/i.test(result.error.message);
  return missingCorrectionColumn ? query(legacyAttendanceSelectColumns) : result;
}

function mapAttendanceFromDb(row: any): Attendance {
  return {
    id: row.id,
    staffId: row.staff_id,
    branchId: row.branch_id,
    date: row.date,
    attendanceStatus: row.attendance_status || AttendanceStatus.PRESENT,
    scheduledStartAt: row.scheduled_start_at || "08:00",
    scheduledEndAt: row.scheduled_end_at || "17:00",
    actualCheckInAt: row.actual_check_in_at,
    actualCheckOutAt: row.actual_check_out_at,
    lateMinutes: row.late_minutes || 0,
    earlyCheckoutMinutes: row.early_checkout_minutes || 0,
    checkInPhotoPath: row.check_in_photo_path,
    checkOutPhotoPath: row.check_out_photo_path,
    checkInLatitude: row.check_in_latitude,
    checkInLongitude: row.check_in_longitude,
    checkInAccuracyMeters: row.check_in_accuracy_meters,
    checkOutLatitude: row.check_out_latitude,
    checkOutLongitude: row.check_out_longitude,
    checkOutAccuracyMeters: row.check_out_accuracy_meters,
    checkInMethod: row.check_in_method,
    checkOutMethod: row.check_out_method,
    checkOutCorrectionStatus: row.check_out_correction_status,
    checkOutCorrectionRequestedAt: row.check_out_correction_requested_at,
    checkOutCorrectionRequestedBy: row.check_out_correction_requested_by,
    checkOutCorrectionApprovedAt: row.check_out_correction_approved_at,
    checkOutCorrectionApprovedBy: row.check_out_correction_approved_by,
    checkOutCorrectionReason: row.check_out_correction_reason,
    notes: row.notes,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at || AppClock.nowISO(),
    updatedAt: row.updated_at || AppClock.nowISO()
  };
}

import { isBranchMatch } from "../utils/branchUtils";
import { allocateInvoiceNetToLines } from "../utils/invoiceLineAllocation";
import { getOperationalDateString, getOperationalTimeString, toOperationalDateTime } from "../utils/dateUtils";
import { getPlannedTreatmentDurationMinutes } from "../utils/plannedTreatmentUtils";
import { hasActiveQueueForPatientOnDate } from "../utils/bookingQueueGuards";
import { calculateQueueEstimates } from "../utils/queueScheduleUtils";
import {
  MOCK_BRANCHES,
  MOCK_DOCTORS,
  MOCK_INVOICES,
  MOCK_INVOICE_ITEMS,
  MOCK_PAYMENTS,
  MOCK_DOCTOR_BRANCH_ASSIGNMENTS,
  MOCK_DOCTOR_SCHEDULES,
  MOCK_QUEUE_ITEMS,
  DEFAULT_CLINIC_BRANDING
} from "../data/mockData";

export function isValidUUID(val?: string | null): boolean {
  if (!val || typeof val !== "string") return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val.trim());
}

export function handleSupabaseReadError<T>(table: string, error: any, defaultReturn: T): T {
  if (!error) return defaultReturn;
  if (error.code === "PGRST116") return defaultReturn; // not found
  throw new Error(`Supabase error reading '${table}': ${error.message}`);
}

function ensureSupabaseConnected() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error("Koneksi ke Supabase belum terkonfigurasi. Data belum dapat disimpan ke server remote.");
  }
}

function useRepositoryTestFallbacks(): boolean {
  return import.meta.env.MODE === "test" ||
    (typeof process !== "undefined" && (process.env.NODE_ENV === "test" || Boolean(process.env.VITEST)));
}

// =====================================================================
// 1. SUPABASE BRANCH REPOSITORY
// =====================================================================
export class SupabaseBranchRepository implements BranchRepository {
  private getFallbackBranches(): DentalBranch[] {
    if (!useRepositoryTestFallbacks()) return [];
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("lala_branches");
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
        }
      } catch (e) {
        console.warn("Error reading branches from localStorage fallback:", e);
      }
    }
    return [...MOCK_BRANCHES];
  }

  private saveFallbackBranches(branches: DentalBranch[]): void {
    if (!useRepositoryTestFallbacks()) return;
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("lala_branches", JSON.stringify(branches));
      } catch (e) {
        console.warn("Error saving fallback branches to localStorage:", e);
      }
    }
  }

  async getBranches(currentUserRole?: UserRole, userBranchId?: string | null): Promise<DentalBranch[]> {
    ensureSupabaseConnected();
    if (
      [UserRole.BRANCH_ADMIN, UserRole.DOCTOR_ASSISTANT, UserRole.OB].includes(currentUserRole as UserRole) &&
      userBranchId &&
      isValidUUID(userBranchId)
    ) {
      const { data, error } = await supabase
        .from("dental_branches")
        .select("*")
        .eq("id", userBranchId);

      if (error) {
        return handleSupabaseReadError("dental_branches", error, []);
      }
      const mapped = (data || []).map(this.mapBranchFromDb);
      return mapped;
    }

    const { data, error } = await supabase
      .from("dental_branches")
      .select("*")
      .order("name", { ascending: true });

    if (error) {
      return handleSupabaseReadError("dental_branches", error, []);
    }

    const mapped = (data || []).map(this.mapBranchFromDb);
    this.saveFallbackBranches(mapped);
    return mapped;
  }

  async getBranchById(id: string): Promise<DentalBranch | null> {
    ensureSupabaseConnected();
    const { data, error } = await supabase
      .from("dental_branches")
      .select("*")
      .eq("id", id)
      .single();

    if (error && error.code !== "PGRST116") return handleSupabaseReadError("dental_branches", error, null);
    if (!data) {
      return null;
    }
    return this.mapBranchFromDb(data);
  }

  async getDoctors(): Promise<DentalDoctor[]> {
    ensureSupabaseConnected();
    const { data, error } = await supabase
      .from("dental_doctors")
      .select("*")
      .order("name", { ascending: true });

    if (error) {
      return handleSupabaseReadError("dental_doctors", error, []);
    }
    return (data || []).map((row: any) => ({
      id: row.id,
      name: row.name,
      fullName: row.name,
      specialization: row.specialization || "Dokter Gigi Umum",
      title: row.title || "Dokter Gigi Umum",
      phone: row.phone || "",
      email: row.email,
      str: row.str,
      sip: row.sip,
      active: row.is_active ?? true,
      isActive: row.is_active ?? true,
      avatarUrl: row.avatar_url,
      photoUrl: row.avatar_url,
      createdAt: row.created_at || AppClock.nowISO(),
      updatedAt: row.updated_at || AppClock.nowISO()
    }));
  }

  async createBranch(
    data: Omit<DentalBranch, "id" | "createdAt" | "updatedAt"> & { id?: string },
    currentUserRole?: UserRole
  ): Promise<DentalBranch> {
    if (currentUserRole !== UserRole.SUPER_ADMIN) {
      throw new Error("Akses ditolak: Hanya Super Admin yang dapat membuat cabang baru.");
    }

    ensureSupabaseConnected();
    const dbPayload: any = {
      name: data.name || data.branchName,
      address: data.address,
      phone: data.phone,
      is_active: data.isActive ?? true
    };
    if (data.branchCode) dbPayload.branch_code = data.branchCode;
    if (data.whatsapp) dbPayload.whatsapp = data.whatsapp;
    if (data.email) dbPayload.email = data.email;
    if (data.operationalHours) dbPayload.operational_hours = data.operationalHours;
    if (data.logoUrl !== undefined) dbPayload.logo_url = data.logoUrl;
    if (data.imageUrl !== undefined) dbPayload.image_url = data.imageUrl;

    const { data: created, error } = await supabase
      .from("dental_branches")
      .insert(dbPayload)
      .select()
      .single();

    if (error) {
      // Fallback if schema doesn't have extended columns yet
      const fallbackPayload = {
        name: data.name || data.branchName,
        address: data.address,
        phone: data.phone,
        is_active: data.isActive ?? true
      };
      const { data: fallbackCreated, error: fbErr } = await supabase
        .from("dental_branches")
        .insert(fallbackPayload)
        .select()
        .single();
      if (fbErr) {
        if (!useRepositoryTestFallbacks()) {
          throw new Error(`Gagal menyimpan cabang di Supabase: ${fbErr.message}`);
        }
        console.warn("[Supabase] createBranch remote failed (e.g. RLS), saving locally:", fbErr.message);
        const fallbackBranch: DentalBranch = {
          id: data.id || `branch-${(data.branchCode || "BRN").toLowerCase()}`,
          name: data.name || data.branchName || "Cabang Baru",
          branchName: data.branchName || data.name || "Cabang Baru",
          branchCode: data.branchCode || "BRN",
          clinicName: data.clinicName || "Lala Dentist",
          address: data.address || "",
          phone: data.phone || "",
          whatsapp: data.whatsapp || data.phone || "",
          email: data.email || "",
          operationalHours: data.operationalHours,
          logoUrl: data.logoUrl || "/logo-lala.svg",
          imageUrl: data.imageUrl || null,
          isActive: data.isActive ?? true,
          active: data.isActive ?? true,
          createdAt: AppClock.nowISO(),
          updatedAt: AppClock.nowISO()
        };
        const existing = this.getFallbackBranches();
        const idx = existing.findIndex((b) => b.id === fallbackBranch.id || b.branchCode === fallbackBranch.branchCode);
        if (idx >= 0) existing[idx] = { ...existing[idx], ...fallbackBranch };
        else existing.push(fallbackBranch);
        this.saveFallbackBranches(existing);
        return fallbackBranch;
      }
      const res = this.mapBranchFromDb(fallbackCreated);
      const existing = this.getFallbackBranches();
      const idx = existing.findIndex((b) => b.id === res.id || b.branchCode === res.branchCode);
      if (idx >= 0) existing[idx] = res;
      else existing.push(res);
      this.saveFallbackBranches(existing);
      return res;
    }
    const res = this.mapBranchFromDb(created);
    const existing = this.getFallbackBranches();
    const idx = existing.findIndex((b) => b.id === res.id || b.branchCode === res.branchCode);
    if (idx >= 0) existing[idx] = res;
    else existing.push(res);
    this.saveFallbackBranches(existing);
    return res;
  }

  async updateBranch(
    id: string,
    updates: Partial<Omit<DentalBranch, "id" | "createdAt" | "updatedAt">>,
    currentUserRole?: UserRole,
    _userBranchId?: string | null
  ): Promise<DentalBranch> {
    if (currentUserRole && currentUserRole !== UserRole.SUPER_ADMIN && !(currentUserRole === UserRole.BRANCH_ADMIN && _userBranchId === id)) {
      throw new Error("Akses ditolak: Hanya Super Admin dan Admin Cabang terkait yang dapat memperbarui data cabang.");
    }

    // If ID is not a valid UUID, handle in fallback storage directly
    if (!isValidUUID(id)) {
      const existing = this.getFallbackBranches();
      const idx = existing.findIndex((b) => b.id === id);
      if (idx >= 0) {
        existing[idx] = { ...existing[idx], ...updates, updatedAt: AppClock.nowISO() };
        this.saveFallbackBranches(existing);
        return existing[idx];
      }
    }

    ensureSupabaseConnected();
    const dbPayload: any = {};
    if (updates.name) dbPayload.name = updates.name;
    if (updates.branchName) dbPayload.name = updates.branchName;
    if (updates.address) dbPayload.address = updates.address;
    if (updates.phone) dbPayload.phone = updates.phone;
    if (updates.branchCode) dbPayload.branch_code = updates.branchCode;
    if (updates.whatsapp) dbPayload.whatsapp = updates.whatsapp;
    if (updates.email) dbPayload.email = updates.email;
    if (updates.operationalHours !== undefined) dbPayload.operational_hours = updates.operationalHours;
    if (updates.logoUrl !== undefined) dbPayload.logo_url = updates.logoUrl;
    if (updates.imageUrl !== undefined) dbPayload.image_url = updates.imageUrl;
    if (updates.isActive !== undefined) dbPayload.is_active = updates.isActive;

    const { data, error } = await supabase
      .from("dental_branches")
      .update(dbPayload)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      // Fallback update core columns only
      const fallbackPayload: any = {};
      if (updates.name) fallbackPayload.name = updates.name;
      if (updates.address) fallbackPayload.address = updates.address;
      if (updates.phone) fallbackPayload.phone = updates.phone;
      if (updates.logoUrl !== undefined) fallbackPayload.logo_url = updates.logoUrl;
      if (updates.imageUrl !== undefined) fallbackPayload.image_url = updates.imageUrl;
      if (updates.isActive !== undefined) fallbackPayload.is_active = updates.isActive;

      const { data: fbData, error: fbErr } = await supabase
        .from("dental_branches")
        .update(fallbackPayload)
        .eq("id", id)
        .select()
        .single();
      if (fbErr) {
        throw new Error(`Gagal memperbarui data cabang di server Supabase: ${fbErr.message}. Data tidak tersimpan akibat masalah koneksi atau hak akses server.`);
      }
      const res = this.mapBranchFromDb(fbData);
      const existing = this.getFallbackBranches();
      const idx = existing.findIndex((b) => b.id === id);
      if (idx >= 0) existing[idx] = { ...existing[idx], ...updates, ...res };
      this.saveFallbackBranches(existing);
      return res;
    }
    const res = this.mapBranchFromDb(data);
    const existing = this.getFallbackBranches();
    const idx = existing.findIndex((b) => b.id === id);
    if (idx >= 0) existing[idx] = { ...existing[idx], ...updates, ...res };
    this.saveFallbackBranches(existing);
    return res;
  }

  async updateBranchBranding(
    id: string,
    brandingUpdates: {
      logoUrl?: string | null;
      imageUrl?: string | null;
      clinicName?: string;
      phone?: string;
      whatsapp?: string;
      email?: string;
      address?: string;
    },
    currentUserRole?: UserRole
  ): Promise<DentalBranch> {
    if (currentUserRole !== UserRole.SUPER_ADMIN) {
      throw new Error("Akses ditolak: Hanya Super Admin yang dapat mengubah identitas cabang.");
    }

    if (!isValidUUID(id)) {
      const existing = this.getFallbackBranches();
      const idx = existing.findIndex((b) => b.id === id);
      if (idx >= 0) {
        existing[idx] = { ...existing[idx], ...brandingUpdates, updatedAt: AppClock.nowISO() };
        this.saveFallbackBranches(existing);
        return existing[idx];
      }
    }

    ensureSupabaseConnected();
    const dbPayload: any = {};
    if (brandingUpdates.logoUrl !== undefined) dbPayload.logo_url = brandingUpdates.logoUrl;
    if (brandingUpdates.imageUrl !== undefined) dbPayload.image_url = brandingUpdates.imageUrl;
    if (brandingUpdates.phone) dbPayload.phone = brandingUpdates.phone;
    if (brandingUpdates.address) dbPayload.address = brandingUpdates.address;

    const { data, error } = await supabase
      .from("dental_branches")
      .update(dbPayload)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      throw new Error(`Gagal memperbarui branding cabang di server Supabase: ${error.message}. Data tidak tersimpan akibat masalah koneksi atau hak akses server.`);
    }
    const res = this.mapBranchFromDb(data);
    const existing = this.getFallbackBranches();
    const idx = existing.findIndex((b) => b.id === id);
    if (idx >= 0) existing[idx] = { ...existing[idx], ...brandingUpdates, ...res };
    this.saveFallbackBranches(existing);
    return res;
  }

  private mapBranchFromDb(row: any): DentalBranch {
    return {
      id: row.id,
      branchCode: row.branch_code || row.name?.substring(0, 3).toUpperCase() || "BRN",
      name: row.name,
      branchName: row.name,
      clinicName: "Lala Dentist",
      address: row.address,
      phone: row.phone,
      whatsapp: row.whatsapp || row.phone,
      email: row.email,
      operationalHours: row.operational_hours || row.notes || undefined,
      isActive: row.is_active ?? true,
      active: row.is_active ?? true,
      logoUrl: row.logo_url,
      imageUrl: row.image_url,
      geofenceLatitude: row.geofence_latitude == null ? null : Number(row.geofence_latitude),
      geofenceLongitude: row.geofence_longitude == null ? null : Number(row.geofence_longitude),
      geofenceRadiusMeters: row.geofence_radius_meters == null ? null : Number(row.geofence_radius_meters),
      createdAt: row.created_at || AppClock.nowISO(),
      updatedAt: row.updated_at || AppClock.nowISO()
    };
  }
}

// =====================================================================
// 2. SUPABASE PATIENT REPOSITORY
// =====================================================================
const PATIENT_COLUMNS_WITHOUT_PHONE = [
  "id",
  "medical_record_number",
  "internal_patient_code",
  "name",
  "full_name",
  "email",
  "date_of_birth",
  "gender",
  "address",
  "created_at",
  "updated_at"
].join(",");

const patientSelectColumns = (role?: UserRole) =>
  canViewPatientPhone(role) ? "*" : PATIENT_COLUMNS_WITHOUT_PHONE;

const PATIENT_ID_QUERY_BATCH_SIZE = 100;

function chunkPatientIds(patientIds: string[]): string[][] {
  const batches: string[][] = [];
  for (let index = 0; index < patientIds.length; index += PATIENT_ID_QUERY_BATCH_SIZE) {
    batches.push(patientIds.slice(index, index + PATIENT_ID_QUERY_BATCH_SIZE));
  }
  return batches;
}

function isMissingPatientProfilesTable(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /patient_profiles.*(not found|does not exist)/i.test(error.message || "")
  );
}

export class SupabasePatientRepository implements PatientRepository {
  async getPatients(currentUserRole?: UserRole, _userBranchId?: string | null): Promise<PatientProfile[]> {
    ensureSupabaseConnected();
    const selectColumns = patientSelectColumns(currentUserRole);

    if (isSupabaseConfigured && supabase) {
      if (currentUserRole === UserRole.DOCTOR) {
        const { data, error } = await supabase.from("patient_profiles").select(selectColumns);
        if (error) {
          throw new Error(`Gagal membaca pasien yang ditugaskan kepada dokter: ${error.message}`);
        }
        const patients = await this.attachMedicalHistoryNotes(
          (data || []).map(this.mapPatientFromDb.bind(this)),
          currentUserRole
        );
        const withBranchRms = await this.attachBranchMedicalRecordNumbers(patients);
        return withBranchRms.map((patient) => redactPatientPhone(patient, currentUserRole));
      }

      // 1. Try querying 'patient_profiles' table first (as requested)
      // RLS scopes branch staff; global portal profiles may have no registered branch.
      const { data, error } = await supabase.from("patient_profiles").select(selectColumns);
      if (error && !isMissingPatientProfilesTable(error)) {
        throw new Error(`Gagal membaca pasien dari patient_profiles: ${error.message}`);
      }
      if (!error && Array.isArray(data)) {
        const patients = await this.attachMedicalHistoryNotes(
          data.map(this.mapPatientFromDb.bind(this)),
          currentUserRole
        );
        const withBranchRms = await this.attachBranchMedicalRecordNumbers(patients);
        return withBranchRms.map((patient) => redactPatientPhone(patient, currentUserRole));
      }

      // 2. Try 'patients' table as fallback query
      try {
        const { data, error } = await supabase.from("patients").select(selectColumns);
        if (!error && Array.isArray(data)) {
          const patients = await this.attachMedicalHistoryNotes(data.map(this.mapPatientFromDb.bind(this)), currentUserRole);
          const withBranchRms = await this.attachBranchMedicalRecordNumbers(patients);
          return withBranchRms.map((patient) => redactPatientPhone(patient, currentUserRole));
        }
      } catch (e) {
        if (e instanceof Error && e.message.startsWith("Gagal membaca No. RM per cabang:")) {
          throw e;
        }
        console.warn("[Supabase] getPatients from 'patients' error:", e);
      }
    }

    return [];
  }

  async getPatientById(
    id: string,
    currentUserRole?: UserRole,
    _userBranchId?: string | null
  ): Promise<PatientProfile | null> {
    ensureSupabaseConnected();
    if (isSupabaseConfigured && supabase) {
      const selectColumns = patientSelectColumns(currentUserRole);
      if (currentUserRole === UserRole.DOCTOR) {
        const { data, error } = await supabase
          .from("patient_profiles")
          .select(selectColumns)
          .eq("id", id)
          .maybeSingle();
        if (error) throw new Error(`Gagal membaca pasien yang ditugaskan kepada dokter: ${error.message}`);
        if (!data) return null;
        const [patient] = await this.attachMedicalHistoryNotes(
          [this.mapPatientFromDb(data)],
          currentUserRole
        );
        if (!patient) return null;
        const [withBranchRms] = await this.attachBranchMedicalRecordNumbers([patient]);
        return withBranchRms ? redactPatientPhone(withBranchRms, currentUserRole) : null;
      }

      let lastError: any = null;
      try {
        const { data, error } = await supabase.from("patients").select(selectColumns).eq("id", id).single();
        if (!error && data) {
          const [patient] = await this.attachMedicalHistoryNotes([this.mapPatientFromDb(data)], currentUserRole);
          const [withBranchRms] = await this.attachBranchMedicalRecordNumbers([patient]);
          return redactPatientPhone(withBranchRms, currentUserRole);
        }
        if (error) lastError = error;
      } catch (e) {
        if (e instanceof Error && e.message.startsWith("Gagal membaca No. RM per cabang:")) {
          throw e;
        }
        lastError = e;
      }

      try {
        const { data, error } = await supabase.from("patient_profiles").select(selectColumns).eq("id", id).single();
        if (!error && data) {
          const [patient] = await this.attachMedicalHistoryNotes([this.mapPatientFromDb(data)], currentUserRole);
          const [withBranchRms] = await this.attachBranchMedicalRecordNumbers([patient]);
          return redactPatientPhone(withBranchRms, currentUserRole);
        }
        if (error) {
          if (error.code === "PGRST116") return null;
          return handleSupabaseReadError("patient_profiles", error, null);
        }
      } catch (e: any) {
        if (e instanceof Error && e.message.startsWith("Gagal membaca No. RM per cabang:")) {
          throw e;
        }
        if (lastError) {
          throw new Error(lastError.message || e.message || "Supabase read error");
        }
        throw e;
      }
    }
    return null;
  }

  async getPatientPhoneForMedicalRecord(
    patientId: string,
    branchId: string,
    currentUserRole?: UserRole
  ): Promise<string> {
    if (currentUserRole !== UserRole.DOCTOR && currentUserRole !== UserRole.SUPER_ADMIN) {
      throw new Error("Akses ditolak untuk membaca nomor telepon rekam medis.");
    }
    if (currentUserRole === UserRole.DOCTOR && !branchId) {
      throw new Error("Cabang kunjungan wajib ditentukan untuk membaca nomor telepon rekam medis.");
    }

    ensureSupabaseConnected();
    if (!isSupabaseConfigured || !supabase) {
      throw new Error("Koneksi Supabase belum terkonfigurasi.");
    }

    const { data, error } = await supabase
      .from("patient_profiles")
      .select("phone")
      .eq("id", patientId)
      .maybeSingle();
    if (error) throw new Error(`Gagal membaca nomor telepon pasien untuk rekam medis: ${error.message}`);
    if (!data) throw new Error("Profil pasien tidak ditemukan saat menyiapkan rekam medis.");
    return data.phone || "";
  }

  async searchPatients(query: string, currentUserRole?: UserRole, userBranchId?: string | null): Promise<PatientProfile[]> {
    const all = await this.getPatients(currentUserRole, userBranchId);
    const q = query.trim().toLowerCase();
    if (!q) return all;

    return all.filter(
      (p) =>
        (p.name || "").toLowerCase().includes(q) ||
        (p.fullName || "").toLowerCase().includes(q) ||
        (p.medicalRecordNumber || "").toLowerCase().includes(q) ||
        (p.internalPatientCode || "").toLowerCase().includes(q) ||
        p.branchMedicalRecordNumbers?.some((record) =>
          record.medicalRecordNumber.toLowerCase().includes(q)
        ) ||
        (p.phone || "").includes(q)
    );
  }

  async createPatient(
    patientData: Omit<PatientProfile, "id" | "medicalRecordNumber" | "createdAt" | "updatedAt"> & { id?: string; medicalRecordNumber?: string; registeredBranchId?: string; branch_id?: string; assignedBranchId?: string; branchId?: string },
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<PatientProfile> {
    ensureSupabaseConnected();
    if (
      patientData.medicalHistoryNotes?.trim() &&
      currentUserRole !== UserRole.DOCTOR &&
      currentUserRole !== UserRole.SUPER_ADMIN
    ) {
      throw new Error("Riwayat medis hanya dapat diubah oleh Dokter atau Super Admin.");
    }

    const nameToUse = (patientData.fullName || patientData.name || "").trim();
    if (!nameToUse) {
      throw new Error("Nama pasien wajib diisi");
    }

    const effBranch = patientData.registeredBranchId || (patientData as any).branch_id || (patientData as any).assignedBranchId || (patientData as any).branchId || userBranchId || null;
    const patientId = patientData.id || (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `pat-${Date.now()}`);

    const existingList = await this.getPatients();

    let finalRM = patientData.medicalRecordNumber ? patientData.medicalRecordNumber.trim() : "";
    if (finalRM) {
      if (!effBranch) {
        throw new Error("Cabang wajib ditentukan untuk mendaftarkan No. RM lokal.");
      }
      const uniqueness = checkRMUniqueness(finalRM, existingList, undefined, effBranch);
      if (!uniqueness.isUnique && uniqueness.conflictPatient) {
        const existingWithRM = uniqueness.conflictPatient;
        throw new Error(`Nomor Rekam Medis (No RM) "${finalRM}" sudah digunakan oleh pasien ${existingWithRM.fullName || existingWithRM.name}`);
      }
    }

    const dbPayload: any = {
      medical_record_number: finalRM || null,
      name: nameToUse,
      full_name: nameToUse,
      phone: patientData.phone || "",
      email: patientData.email || null,
      emergency_contact_name: patientData.emergencyContactName?.trim() || null,
      emergency_contact_phone: patientData.emergencyContactPhone?.trim() || null,
      emergency_contact_relationship: patientData.emergencyContactRelationship?.trim() || null,
      identity_document_type: patientData.identityDocumentType || null,
      identity_document_number: patientData.identityDocumentNumber?.trim() || null,
      place_of_birth: patientData.placeOfBirth?.trim() || null,
      date_of_birth: patientData.dateOfBirth || null,
      gender: patientData.gender || null,
      address: patientData.address || "-",
      occupation: patientData.occupation?.trim() || null,
      religion: patientData.religion?.trim() || null,
      marital_status: patientData.maritalStatus?.trim() || null,
      education: patientData.education?.trim() || null,
      acquisition_source: patientData.acquisitionSource || "UNKNOWN",
      referral_name: patientData.acquisitionSource === "REFERRAL" ? patientData.referralName?.trim() || null : null,
      referring_staff_id: patientData.referringStaffId || null
    };

    if (patientId) {
      dbPayload.id = patientId;
    }
    if (effBranch) {
      dbPayload.registered_branch_id = effBranch;
      dbPayload.branch_id = effBranch;
      dbPayload.assigned_branch_id = effBranch;
    }

    if (isSupabaseConfigured && supabase) {
      const tryInsert = async (table: string, payload: any) => {
        let res = await supabase.from(table).insert(payload).select(patientSelectColumns(currentUserRole)).single();
        if (res.error && res.error.message?.includes("does not exist")) {
          const sanitized = { ...payload };
          if (res.error.message.includes("assigned_branch_id")) delete sanitized.assigned_branch_id;
          if (res.error.message.includes("branch_id")) delete sanitized.branch_id;
          if (res.error.message.includes("registered_branch_id")) delete sanitized.registered_branch_id;
          res = await supabase.from(table).insert(sanitized).select(patientSelectColumns(currentUserRole)).single();
        }
        return res;
      };

      let lastErrorMsg = "";
      let successData: any = null;

      // 1. Try patient_profiles first (as requested)
      const { data: profData, error: profErr } = await tryInsert("patient_profiles", dbPayload);
      if (!profErr && profData) {
        successData = profData;
      } else if (profErr) {
        lastErrorMsg = profErr.message;
      }

      // 2. Also try patients table
      const { data: patData, error: patErr } = await tryInsert("patients", dbPayload);
      if (!patErr && patData) {
        successData = successData || patData;
      } else if (patErr && !lastErrorMsg) {
        lastErrorMsg = patErr.message;
      }

      if (successData) {
        const patient = this.mapPatientFromDb(successData);
        if (patientData.medicalHistoryNotes?.trim()) {
          await this.saveMedicalHistoryNotes(
            patient.id,
            patientData.medicalHistoryNotes,
            currentUserRole === UserRole.DOCTOR ? userBranchId || null : effBranch || null,
            currentUserRole
          );
          patient.medicalHistoryNotes = patientData.medicalHistoryNotes;
        }
        const [withBranchRms] = await this.attachBranchMedicalRecordNumbers([patient]);
        if (finalRM && effBranch && !getPatientMedicalRecordNumber(withBranchRms, effBranch)) {
          throw new Error("Profil tersimpan tetapi No. RM cabang belum berhasil ditautkan. Periksa migrasi RM cabang sebelum melanjutkan.");
        }
        return redactPatientPhone(withBranchRms, currentUserRole);
      }

      throw new Error(lastErrorMsg || "Gagal menyimpan data pasien ke tabel patient_profiles / patients Supabase (RLS/Koneksi bermasalah).");
    }

    throw new Error("Koneksi Supabase belum terkonfigurasi. Data pasien wajib disimpan ke Supabase.");
  }

  async updatePatient(
    id: string,
    updates: Partial<Omit<PatientProfile, "id" | "createdAt" | "updatedAt">> & { registeredBranchId?: string; branch_id?: string; assignedBranchId?: string; branchId?: string },
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<PatientProfile> {
    ensureSupabaseConnected();
    if (
      updates.medicalHistoryNotes?.trim() &&
      currentUserRole !== UserRole.DOCTOR &&
      currentUserRole !== UserRole.SUPER_ADMIN
    ) {
      throw new Error("Riwayat medis hanya dapat diubah oleh Dokter atau Super Admin.");
    }
    const rmBranchId =
      updates.registeredBranchId ||
      updates.branch_id ||
      updates.assignedBranchId ||
      updates.branchId ||
      userBranchId ||
      undefined;
    if (updates.medicalRecordNumber !== undefined) {
      if (!rmBranchId) {
        throw new Error("Cabang wajib ditentukan untuk mengelola No. RM lokal pasien.");
      }
      await this.registerPatientBranchMedicalRecordNumber(
        id,
        rmBranchId,
        updates.medicalRecordNumber,
        currentUserRole,
        userBranchId
      );
    }

    const dbPayload: any = {
      updated_at: AppClock.nowISO()
    };
    if (updates.name || updates.fullName) {
      const n = updates.fullName || updates.name;
      dbPayload.name = n;
      dbPayload.full_name = n;
    }
    if (updates.phone !== undefined) dbPayload.phone = updates.phone;
    if (updates.email !== undefined) dbPayload.email = updates.email;
    if (updates.emergencyContactName !== undefined) dbPayload.emergency_contact_name = updates.emergencyContactName?.trim() || null;
    if (updates.emergencyContactPhone !== undefined) dbPayload.emergency_contact_phone = updates.emergencyContactPhone?.trim() || null;
    if (updates.emergencyContactRelationship !== undefined) dbPayload.emergency_contact_relationship = updates.emergencyContactRelationship?.trim() || null;
    if (updates.identityDocumentType !== undefined) dbPayload.identity_document_type = updates.identityDocumentType || null;
    if (updates.identityDocumentNumber !== undefined) dbPayload.identity_document_number = updates.identityDocumentNumber?.trim() || null;
    if (updates.placeOfBirth !== undefined) dbPayload.place_of_birth = updates.placeOfBirth?.trim() || null;
    if (updates.address !== undefined) dbPayload.address = updates.address;
    if (updates.occupation !== undefined) dbPayload.occupation = updates.occupation?.trim() || null;
    if (updates.religion !== undefined) dbPayload.religion = updates.religion?.trim() || null;
    if (updates.maritalStatus !== undefined) dbPayload.marital_status = updates.maritalStatus?.trim() || null;
    if (updates.education !== undefined) dbPayload.education = updates.education?.trim() || null;
    if (updates.gender !== undefined) dbPayload.gender = updates.gender;
    if (updates.dateOfBirth !== undefined) {
      dbPayload.date_of_birth = updates.dateOfBirth.trim() ? updates.dateOfBirth : null;
    }
    if (updates.acquisitionSource !== undefined) dbPayload.acquisition_source = updates.acquisitionSource;
    if (updates.referringStaffId !== undefined) dbPayload.referring_staff_id = updates.referringStaffId || null;
    if (updates.referralName !== undefined || updates.acquisitionSource !== undefined) {
      dbPayload.referral_name = updates.acquisitionSource === "REFERRAL"
        ? updates.referralName?.trim() || null
        : updates.acquisitionSource === undefined
          ? updates.referralName?.trim() || null
          : null;
    }

    const effBranch = (updates as any).registeredBranchId || (updates as any).branch_id || (updates as any).assignedBranchId || (updates as any).branchId || userBranchId;
    if (effBranch) {
      dbPayload.registered_branch_id = effBranch;
      dbPayload.branch_id = effBranch;
      dbPayload.assigned_branch_id = effBranch;
    }

    if (isSupabaseConfigured && supabase) {
      let updatedData: any = null;
      try {
        const { data: pData } = await supabase.from("patients").update(dbPayload).eq("id", id).select(patientSelectColumns(currentUserRole)).single();
        if (pData) updatedData = pData;
      } catch (e) {
        // ...
      }

      try {
        const { data, error } = await supabase.from("patient_profiles").update(dbPayload).eq("id", id).select(patientSelectColumns(currentUserRole)).single();
        if (!error && data) {
          updatedData = data;
        }
        if (error && !updatedData) throw new Error(error.message);
      } catch (e: any) {
        if (!updatedData) throw new Error(e?.message || "Gagal memperbarui data pasien");
      }

      if (updatedData) {
        const patient = this.mapPatientFromDb(updatedData);
        if (
          updates.medicalHistoryNotes !== undefined &&
          (currentUserRole === UserRole.DOCTOR || currentUserRole === UserRole.SUPER_ADMIN)
        ) {
          await this.saveMedicalHistoryNotes(
            id,
            updates.medicalHistoryNotes,
            currentUserRole === UserRole.DOCTOR ? userBranchId || null : effBranch || null,
            currentUserRole
          );
          patient.medicalHistoryNotes = updates.medicalHistoryNotes;
        }
        const [withBranchRms] = await this.attachBranchMedicalRecordNumbers([patient]);
        return redactPatientPhone(withBranchRms, currentUserRole);
      }
    }

    throw new Error("Koneksi Supabase belum terkonfigurasi");
  }

  async registerPatientBranchMedicalRecordNumber(
    patientId: string,
    branchId: string,
    medicalRecordNumber: string,
    _currentUserRole?: UserRole,
    _userBranchId?: string | null
  ): Promise<void> {
    ensureSupabaseConnected();
    if (!supabase) throw new Error("Koneksi Supabase belum terkonfigurasi.");
    const { error } = await supabase.rpc("register_patient_branch_medical_record_number", {
      target_patient_id: patientId,
      target_branch_id: branchId,
      requested_rm: medicalRecordNumber
    });
    if (error) {
      throw new Error(`Gagal menautkan No. RM ke cabang: ${error.message}`);
    }
  }

  async checkDuplicates(
    phone?: string,
    medicalRecordNumber?: string,
    fullName?: string,
    currentUserRole?: UserRole,
    branchId?: string
  ): Promise<DuplicateCheckResult> {
    const all = await this.getPatients(currentUserRole);
    const cleanPhone = phone ? phone.replace(/\D/g, "") : "";
    const cleanRM = medicalRecordNumber ? medicalRecordNumber.trim().toLowerCase() : "";
    const cleanName = fullName ? fullName.trim().toLowerCase() : "";

    let byPhone: PatientProfile[] = [];
    if (cleanPhone.length >= 6) {
      if (canViewPatientPhone(currentUserRole)) {
        byPhone = all.filter((patient) => (patient.phone || "").replace(/\D/g, "").includes(cleanPhone));
      } else if (isSupabaseConfigured && supabase) {
        let { data, error } = await supabase
          .from("patient_profiles")
          .select(PATIENT_COLUMNS_WITHOUT_PHONE)
          .ilike("phone", `%${cleanPhone}%`);
        if (error) {
          const fallback = await supabase
            .from("patients")
            .select(PATIENT_COLUMNS_WITHOUT_PHONE)
            .ilike("phone", `%${cleanPhone}%`);
          data = fallback.data;
          error = fallback.error;
        }
        if (error) {
          throw new Error(`Gagal memeriksa duplikasi nomor telepon pasien: ${error.message}`);
        }
        byPhone = (data || []).map(this.mapPatientFromDb.bind(this));
      }
    }

    const byRM = cleanRM
      ? all.filter((patient) =>
          getPatientMedicalRecordNumber(patient, branchId).trim().toLowerCase() === cleanRM
        )
      : [];

    const byName = cleanName && cleanName.length >= 3
      ? all.filter((p) => {
          const pName = (p.fullName || p.name || "").trim().toLowerCase();
          return pName === cleanName || pName.includes(cleanName) || cleanName.includes(pName);
        })
      : [];

    return {
      byPhone: byPhone.map((patient) => redactPatientPhone(patient, currentUserRole)),
      byRM: byRM.map((patient) => redactPatientPhone(patient, currentUserRole)),
      byName: byName.map((patient) => redactPatientPhone(patient, currentUserRole)),
      hasDuplicates: byPhone.length > 0 || byRM.length > 0 || byName.length > 0
    };
  }

  async deletePatient(id: string, currentUserRole?: UserRole): Promise<boolean> {
    if (
      currentUserRole &&
      currentUserRole !== UserRole.SUPER_ADMIN &&
      currentUserRole !== UserRole.BRANCH_ADMIN
    ) {
      throw new Error("Akses ditolak: Hanya Super Admin atau Branch Admin yang dapat menghapus data pasien.");
    }

    ensureSupabaseConnected();

    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.from("medical_records").delete().eq("patient_id", id);
      } catch (e) {
        console.warn("[Supabase] delete related medical_records:", e);
      }
      try {
        await supabase.from("patient_visits").delete().eq("patient_id", id);
      } catch (e) {
        console.warn("[Supabase] delete related patient_visits:", e);
      }
      try {
        await supabase.from("bookings").delete().eq("patient_id", id);
      } catch (e) {
        console.warn("[Supabase] delete related bookings:", e);
      }
      try {
        await supabase.from("queue_items").delete().eq("patient_id", id);
      } catch (e) {
        console.warn("[Supabase] delete related queue_items:", e);
      }

      const { error: patientsErr } = await supabase.from("patients").delete().eq("id", id);
      const { error: profileErr } = await supabase.from("patient_profiles").delete().eq("id", id);

      if (patientsErr && profileErr) {
        console.warn("[Supabase] delete patient warning:", patientsErr.message, profileErr.message);
      }
      return true;
    }

    return false;
  }

  async clearAllPatients(currentUserRole?: UserRole): Promise<boolean> {
    if (currentUserRole !== UserRole.SUPER_ADMIN && currentUserRole !== UserRole.BRANCH_ADMIN) {
      throw new Error("Akses ditolak: Hanya Administrator yang berhak mengosongkan seluruh database pasien.");
    }

    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.from("medical_records").delete().neq("id", "00000000-0000-0000-0000-000000000000");
        await supabase.from("patient_visits").delete().neq("id", "00000000-0000-0000-0000-000000000000");
        await supabase.from("bookings").delete().neq("id", "00000000-0000-0000-0000-000000000000");
        await supabase.from("queue_items").delete().neq("id", "00000000-0000-0000-0000-000000000000");
        await supabase.from("patients").delete().neq("id", "00000000-0000-0000-0000-000000000000");
        const { error } = await supabase.from("patient_profiles").delete().neq("id", "00000000-0000-0000-0000-000000000000");
        if (error) console.warn("[Supabase] clearAllPatients remote warning:", error.message);
      } catch (e) {
        console.warn("[Supabase] clearAllPatients remote error:", e);
      }
    }

    return true;
  }

  private mapPatientFromDb(row: any): PatientProfile {
    const branch = row.registered_branch_id || row.branch_id || row.assigned_branch_id || row.assignedBranchId || row.branchId || undefined;
    return {
      id: row.id,
      medicalRecordNumber: row.medical_record_number || row.medicalRecordNumber || "",
      internalPatientCode: row.internal_patient_code || row.internalPatientCode || undefined,
      name: row.name || row.full_name || row.fullName || "Pasien",
      fullName: row.full_name || row.name || row.fullName || "Pasien",
      phone: row.phone || row.phone_number || "",
      email: row.email,
      emergencyContactName: row.emergency_contact_name || row.emergencyContactName || "",
      emergencyContactPhone: row.emergency_contact_phone || row.emergencyContactPhone || "",
      emergencyContactRelationship: row.emergency_contact_relationship || row.emergencyContactRelationship || "",
      identityDocumentType: row.identity_document_type || row.identityDocumentType || undefined,
      identityDocumentNumber: row.identity_document_number || row.identityDocumentNumber || undefined,
      placeOfBirth: row.place_of_birth || row.placeOfBirth || "",
      dateOfBirth: row.date_of_birth || row.dateOfBirth || "",
      gender: row.gender === "L" || row.gender === "P" ? row.gender : "",
      address: row.address || "",
      occupation: row.occupation || "",
      religion: row.religion || "",
      maritalStatus: row.marital_status || row.maritalStatus || "",
      education: row.education || "",
      acquisitionSource: row.acquisition_source || row.acquisitionSource || "UNKNOWN",
      referralName: row.referral_name || row.referralName || undefined,
      referringStaffId: row.referring_staff_id || row.referringStaffId || null,
      registeredBranchId: branch,
      branch_id: branch,
      assignedBranchId: branch,
      branchId: branch,
      createdAt: row.created_at || row.registered_at || AppClock.nowISO(),
      updatedAt: row.updated_at || AppClock.nowISO()
    };
  }

  private async attachBranchMedicalRecordNumbers(
    patients: PatientProfile[]
  ): Promise<PatientProfile[]> {
    if (patients.length === 0) return patients;
    if (!supabase) throw new Error("Koneksi Supabase belum terkonfigurasi.");

    const patientIds = patients.map((patient) => patient.id).filter(Boolean);
    const results = await Promise.all(
      chunkPatientIds(patientIds).map((batch) =>
        supabase
          .from("patient_branch_medical_records")
          .select("patient_id, branch_id, medical_record_number")
          .in("patient_id", batch)
      )
    );
    const failedResult = results.find((result) => result.error);
    if (failedResult?.error) {
      throw new Error(`Gagal membaca No. RM per cabang: ${failedResult.error.message}`);
    }

    const recordsByPatient = new Map<string, Array<{ branchId: string; medicalRecordNumber: string }>>();
    results.flatMap((result) => result.data || []).forEach((row) => {
      const records = recordsByPatient.get(row.patient_id) || [];
      records.push({
        branchId: row.branch_id,
        medicalRecordNumber: row.medical_record_number
      });
      recordsByPatient.set(row.patient_id, records);
    });

    return patients.map((patient) => ({
      ...patient,
      branchMedicalRecordNumbers: recordsByPatient.get(patient.id) || []
    }));
  }

  private async attachMedicalHistoryNotes(
    patients: PatientProfile[],
    currentUserRole?: UserRole
  ): Promise<PatientProfile[]> {
    if (currentUserRole !== UserRole.DOCTOR && currentUserRole !== UserRole.SUPER_ADMIN) {
      return patients;
    }
    const patientIds = patients.map((patient) => patient.id).filter(Boolean);
    if (patientIds.length === 0) return patients;

    const results = await Promise.all(
      chunkPatientIds(patientIds).map((batch) =>
        supabase
          .from("patient_medical_profiles")
          .select("patient_id, medical_history_notes")
          .in("patient_id", batch)
      )
    );
    const failedResult = results.find((result) => result.error);
    if (failedResult?.error) {
      if (!this.isMissingPatientMedicalProfilesTable(failedResult.error)) {
        throw new Error(`Supabase error: ${failedResult.error.message}`);
      }
      const legacyResults = await Promise.all(
        chunkPatientIds(patientIds).map((batch) =>
          supabase
            .from("patient_profiles")
            .select("id, medical_history_notes")
            .in("id", batch)
        )
      );
      const failedLegacyResult = legacyResults.find((result) => result.error);
      if (failedLegacyResult?.error) {
        throw new Error(`Gagal membaca riwayat medis: ${failedLegacyResult.error.message}`);
      }
      const legacyNotesByPatientId = new Map(
        legacyResults
          .flatMap((result) => result.data || [])
          .map((row) => [row.id, row.medical_history_notes || ""])
      );
      return patients.map((patient) => ({
        ...patient,
        medicalHistoryNotes: legacyNotesByPatientId.get(patient.id) || ""
      }));
    }

    const notesByPatientId = new Map(
      results
        .flatMap((result) => result.data || [])
        .map((row) => [row.patient_id, row.medical_history_notes || ""])
    );
    return patients.map((patient) => ({
      ...patient,
      medicalHistoryNotes: notesByPatientId.get(patient.id) || ""
    }));
  }

  private async saveMedicalHistoryNotes(
    patientId: string,
    notes: string,
    branchId: string | null,
    currentUserRole?: UserRole
  ): Promise<void> {
    if (currentUserRole !== UserRole.DOCTOR && currentUserRole !== UserRole.SUPER_ADMIN) {
      throw new Error("Riwayat medis hanya dapat diubah oleh Dokter atau Super Admin.");
    }
    const { error } = await supabase.from("patient_medical_profiles").upsert(
      {
        patient_id: patientId,
        branch_id: branchId,
        medical_history_notes: notes,
        updated_at: AppClock.nowISO()
      },
      { onConflict: "patient_id" }
    );
    if (error && this.isMissingPatientMedicalProfilesTable(error)) {
      const { error: legacyError } = await supabase
        .from("patient_profiles")
        .update({ medical_history_notes: notes })
        .eq("id", patientId);
      if (legacyError) throw new Error(`Gagal menyimpan riwayat medis: ${legacyError.message}`);
      return;
    }
    if (error) throw new Error(`Gagal menyimpan riwayat medis: ${error.message}`);
  }

  private isMissingPatientMedicalProfilesTable(error: { code?: string; message?: string }): boolean {
    return (
      error.code === "42P01" ||
      error.code === "PGRST205" ||
      /patient_medical_profiles.*(not found|does not exist)/i.test(error.message || "")
    );
  }
}

// =====================================================================
// 3. SUPABASE QUEUE REPOSITORY
// =====================================================================
export class SupabaseQueueRepository implements QueueRepository {
  private getFallbackQueue(): QueueItem[] {
    if (!useRepositoryTestFallbacks()) return [];
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("lala_queue_items");
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
        }
      } catch (e) {
        console.warn("Error loading queue items from localStorage:", e);
      }
    }
    return [...MOCK_QUEUE_ITEMS];
  }

  private saveFallbackQueue(items: QueueItem[]): void {
    if (!useRepositoryTestFallbacks()) return;
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("lala_queue_items", JSON.stringify(items));
      } catch (e) {
        console.warn("Error saving queue items to localStorage:", e);
      }
    }
  }

  async getQueueItems(): Promise<QueueItem[]> {
    ensureSupabaseConnected();
    let remoteItems: QueueItem[] = [];
    try {
      const { data, error } = await supabase.from("queue_items").select("*").order("sequence_order", { ascending: true });
      if (!error && data) {
        remoteItems = data.map(this.mapQueueFromDb);
      } else if (error) {
        console.warn("[Supabase] getQueueItems restricted/failed, using local fallback:", error.message);
      }
    } catch (e: any) {
      console.warn("[Supabase] getQueueItems query failed:", e?.message);
    }

    const fallback = this.getFallbackQueue();
    const remoteIds = new Set(remoteItems.map((q) => q.id));
    const localOnly = fallback.filter((q) => !remoteIds.has(q.id));
    return [...remoteItems, ...localOnly];
  }

  async getQueueByBranch(
    branchId: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<QueueItem[]> {
    ensureSupabaseConnected();
    if ((currentUserRole === UserRole.BRANCH_ADMIN || currentUserRole === UserRole.DOCTOR_ASSISTANT) && userBranchId && !isBranchMatch(branchId, userBranchId)) {
      throw new Error("Access denied: Staff is isolated to their assigned branch");
    }

    let remoteItems: QueueItem[] = [];
    if (isValidUUID(branchId)) {
      try {
        const { data, error } = await supabase
          .from("queue_items")
          .select("*")
          .eq("branch_id", branchId)
          .order("sequence_order", { ascending: true });

        if (!error && data) {
          remoteItems = data.map(this.mapQueueFromDb);
        } else if (error) {
          console.warn("[Supabase] getQueueByBranch restricted/failed, using local fallback:", error.message);
        }
      } catch (e: any) {
        console.warn("[Supabase] getQueueByBranch query failed:", e?.message);
      }
    }

    const fallback = this.getFallbackQueue().filter((q) => q.branchId === branchId);
    const remoteIds = new Set(remoteItems.map((q) => q.id));
    const localOnly = fallback.filter((q) => !remoteIds.has(q.id));
    return [...remoteItems, ...localOnly];
  }

  async getQueueByDoctor(
    doctorId: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null,
    currentUserId?: string | null
  ): Promise<QueueItem[]> {
    ensureSupabaseConnected();
    if (currentUserRole === UserRole.DOCTOR && currentUserId && currentUserId !== doctorId) {
      throw new Error("Access denied: Doctor cannot access another doctor queue");
    }

    let remoteItems: QueueItem[] = [];
    if (isValidUUID(doctorId)) {
      try {
        let q = supabase.from("queue_items").select("*").eq("doctor_id", doctorId).order("sequence_order", { ascending: true });
        if ((currentUserRole === UserRole.BRANCH_ADMIN || currentUserRole === UserRole.DOCTOR_ASSISTANT) && userBranchId && isValidUUID(userBranchId)) {
          q = q.eq("branch_id", userBranchId);
        }
        const { data, error } = await q;
        if (!error && data) {
          remoteItems = data.map(this.mapQueueFromDb);
        } else if (error) {
          console.warn("[Supabase] getQueueByDoctor restricted/failed:", error.message);
        }
      } catch (e: any) {
        console.warn("[Supabase] getQueueByDoctor query failed:", e?.message);
      }
    }

    let fallback = this.getFallbackQueue().filter((q) => q.doctorId === doctorId);
    if ((currentUserRole === UserRole.BRANCH_ADMIN || currentUserRole === UserRole.DOCTOR_ASSISTANT) && userBranchId) {
      fallback = fallback.filter((q) => q.branchId === userBranchId);
    }
    const remoteIds = new Set(remoteItems.map((q) => q.id));
    const localOnly = fallback.filter((q) => !remoteIds.has(q.id));
    return [...remoteItems, ...localOnly];
  }

  async getQueueByPatient(
    patientId: string,
    currentUserRole?: UserRole,
    currentUserId?: string | null
  ): Promise<QueueItem[]> {
    ensureSupabaseConnected();
    if (currentUserRole === UserRole.PATIENT && currentUserId && currentUserId !== patientId) {
      throw new Error("Access denied: Patient can only view their own queue");
    }

    let remoteItems: QueueItem[] = [];
    if (isValidUUID(patientId)) {
      try {
        const { data, error } = await supabase
          .from("queue_items")
          .select("id, branch_id, doctor_id, visit_id, booking_id, patient_id, queue_number, status, sequence_order, arrival_at, estimated_service_at, estimated_duration_minutes, created_at, updated_at")
          .eq("patient_id", patientId)
          .order("sequence_order", { ascending: true });
        if (!error && data) {
          remoteItems = data.map(this.mapQueueFromDb);
        } else if (error) {
          throw new Error(`Gagal memuat antrean pasien: ${error.message}`);
        }
      } catch (error) {
        if (!useRepositoryTestFallbacks()) throw error;
      }
    }

    const fallback = this.getFallbackQueue().filter((q) => q.patientId === patientId);
    const remoteIds = new Set(remoteItems.map((q) => q.id));
    const localOnly = fallback.filter((q) => !remoteIds.has(q.id));
    return [...remoteItems, ...localOnly];
  }

  async getLiveQueueSnapshot(
    branchId: string,
    date: string,
    doctorId?: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null,
    currentUserId?: string | null
  ): Promise<LiveQueueSnapshot | null> {
    if ((currentUserRole === UserRole.BRANCH_ADMIN || currentUserRole === UserRole.DOCTOR_ASSISTANT) && userBranchId && !isBranchMatch(branchId, userBranchId)) {
      throw new Error("Access denied: Asisten / Branch Admin tidak dapat mengakses antrean cabang lain");
    }
    if (currentUserRole === UserRole.DOCTOR && currentUserId && doctorId && currentUserId !== doctorId) {
      throw new Error("Access denied: Doctor cannot access another doctor queue");
    }

    const items = await this.getQueueByBranch(branchId, currentUserRole, userBranchId);
    let filtered = items.filter((q) => {
      const qDate = getOperationalDateString(q.arrivalAt || q.checkInTime || q.createdAt);
      return qDate === date;
    });

    if (doctorId && doctorId !== "ALL") {
      filtered = filtered.filter((q) => q.doctorId === doctorId);
    }

    const waitingQueue = filtered.filter((q) => q.status === QueueStatus.WAITING);
    const preparationQueue = filtered.filter((q) => q.status === QueueStatus.IN_PREPARATION);
    const consultationQueue = filtered.filter((q) => q.status === QueueStatus.IN_CONSULTATION);
    const completedQueue = filtered.filter((q) => q.status === QueueStatus.COMPLETED);
    const skippedQueue = filtered.filter((q) => q.status === QueueStatus.SKIPPED);

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
    ensureSupabaseConnected();

    if (currentUserRole && currentUserRole !== UserRole.SUPER_ADMIN && currentUserRole !== UserRole.BRANCH_ADMIN) {
      throw new Error("Check-in hanya dapat dilakukan Admin Cabang atau Super Admin");
    }

    if (!useRepositoryTestFallbacks() &&
      ((!visitId && !options?.bookingId) ||
        (visitId !== null && !isValidUUID(visitId)) ||
        (options?.bookingId && !isValidUUID(options.bookingId)))) {
      throw new Error("ID kunjungan atau booking bukan ID Supabase yang valid. Muat ulang data lalu coba lagi.");
    }
    if (useRepositoryTestFallbacks() && !visitId) {
      throw new Error("Check-in booking memerlukan transaksi Supabase; gunakan repository mock untuk pengujian lokal.");
    }

    const visitRepo = new SupabaseVisitRepository();
    const suppliedVisitContext = Boolean(options?.bookingId || (options?.branchId && options?.patientId));
    const visit = suppliedVisitContext || !visitId ? null : await visitRepo.getVisitById(visitId);

    const branchId = options?.branchId || visit?.branchId || "";
    const patientId = options?.patientId || visit?.patientId || "";
    if (!useRepositoryTestFallbacks() && (!isValidUUID(branchId) || !isValidUUID(patientId))) {
      throw new Error("Data kunjungan tidak memiliki ID cabang atau pasien Supabase yang valid. Muat ulang data lalu coba lagi.");
    }
    if (!visit && !suppliedVisitContext && !useRepositoryTestFallbacks()) {
      throw new Error("Kunjungan tidak ditemukan di Supabase. Kunjungan tidak dapat dimasukkan ke antrean.");
    }
    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId && !isBranchMatch(branchId, userBranchId)) {
      throw new Error("Branch Admin tidak dapat mendaftarkan antrean cabang lain");
    }
    const doctorId = options?.doctorId || visit?.doctorId || "";
    const now = AppClock.nowISO();
    const today = getOperationalDateString(now);

    // Check existing active queue item to avoid duplicate entries
    const fallbackItems = this.getFallbackQueue();
    const existingActive = fallbackItems.find(
      (q) => visitId !== null && q.visitId === visitId && q.status !== QueueStatus.SKIPPED && q.status !== QueueStatus.COMPLETED && q.status !== "CANCELLED"
    );
    if (existingActive) {
      return existingActive;
    }

    if (!options?.bookingId && hasActiveQueueForPatientOnDate(fallbackItems, patientId, branchId, now, visitId || undefined)) {
      throw new Error("Pasien ini sudah berada di antrean aktif hari ini melalui kunjungan lain");
    }

    if (visitId) {
      try {
        const { data: duplicateRemote, error: duplicateRemoteError } = await supabase
          .from("queue_items")
          .select()
          .eq("visit_id", visitId)
          .neq("status", QueueStatus.SKIPPED)
          .neq("status", QueueStatus.COMPLETED)
          .neq("status", "CANCELLED")
          .limit(1);

        if (!duplicateRemoteError && duplicateRemote && duplicateRemote.length > 0) {
          const existingRemote = this.mapQueueFromDb(duplicateRemote[0]);
          const currentList = this.getFallbackQueue();
          const idx = currentList.findIndex((q) => q.id === existingRemote.id);
          if (idx >= 0) currentList[idx] = existingRemote;
          else currentList.unshift(existingRemote);
          this.saveFallbackQueue(currentList);
          return existingRemote;
        }

        const dayStart = new Date(`${today}T00:00:00.000+07:00`).toISOString();
        const nextDayStart = new Date(new Date(dayStart).getTime() + 24 * 60 * 60 * 1000).toISOString();
        const { data: patientQueue, error: patientQueueError } = await supabase
          .from("queue_items")
          .select("id, visit_id, status, arrival_at, patient_id, branch_id")
          .eq("patient_id", patientId)
          .eq("branch_id", branchId)
          .in("status", [QueueStatus.WAITING, QueueStatus.IN_PREPARATION, QueueStatus.IN_CONSULTATION, "CALLING"])
          .gte("arrival_at", dayStart)
          .lt("arrival_at", nextDayStart);

        if (patientQueueError) {
          throw new Error(`Gagal memeriksa antrean aktif pasien: ${patientQueueError.message}`);
        }
        if (patientQueue?.some((item) => item.visit_id !== visitId)) {
          throw new Error("Pasien ini sudah berada di antrean aktif hari ini melalui kunjungan lain");
        }
      } catch (err) {
        if (err instanceof Error && err.message.startsWith("Gagal memeriksa antrean aktif pasien:")) {
          throw err;
        }
        if (err instanceof Error && err.message.startsWith("Pasien ini sudah berada di antrean aktif")) {
          throw err;
        }
        console.warn("[SupabaseQueueRepository] duplicate queue check failed, continuing with create flow:", err);
      }
    }

    if (!useRepositoryTestFallbacks() && !isValidUUID(doctorId)) {
      throw new Error("Dokter untuk kunjungan ini belum memiliki ID Supabase yang valid. Pilih dokter yang terdaftar sebelum check-in.");
    }

    // Local/test fallback sequence. Production sequence assignment is serialized in Supabase.
    const sameScope = fallbackItems.filter((q) => {
      const qDate = getOperationalDateString(q.arrivalAt || q.checkInTime || q.createdAt);
      return q.branchId === branchId && (q.doctorId === doctorId || !doctorId) && qDate === today;
    });
    const highestSequence = sameScope.reduce((highest, item) => Math.max(highest, item.sequenceOrder || 0), 0);
    const sequenceOrder = highestSequence + 1;
    const doctorName = options?.doctorNameSnapshot || doctorId;
    const cleanedDoctorName = doctorName.replace(/^drg\.?\s*/i, "").trim();
    const normalizedDoctorId = doctorId.toLowerCase();
    const doctorPrefix = options?.doctorNameSnapshot
      ? cleanedDoctorName.charAt(0).toUpperCase() || "A"
      : normalizedDoctorId.includes("syafira")
        ? "S"
        : normalizedDoctorId.includes("dimas")
          ? "D"
          : cleanedDoctorName.charAt(0).toUpperCase() || "A";
    const queueNumber = `${doctorPrefix}-${String(sequenceOrder).padStart(2, "0")}`;

    const newId = options?.customId || (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `queue-${Date.now()}`);

    const newQueueItem: QueueItem = {
      id: newId,
      branchId,
      doctorId,
      visitId: visitId || "",
      bookingId: options?.bookingId || visit?.bookingId || null,
      patientId,
      queueNumber,
      status: QueueStatus.WAITING,
      sequenceOrder,
      arrivalAt: now,
      preferredServiceAt: options?.preferredServiceAt,
      patientNameSnapshot: options?.patientNameSnapshot,
      doctorNameSnapshot: options?.doctorNameSnapshot,
      checkInTime: now,
      bookingTimeSnapshot: options?.bookingTimeSnapshot,
      estimatedDurationMinutes: options?.estimatedDurationMinutes ?? getPlannedTreatmentDurationMinutes(options?.plannedTreatments || visit?.plannedTreatments),
      createdAt: now,
      updatedAt: now
    };

    // If visit status is not yet WAITING, update it
    // Attempt remote Supabase insert if IDs are valid UUID and remote accessible
    if (isValidUUID(branchId) && (visitId === null || isValidUUID(visitId))) {
      try {
        const { data, error } = await supabase.rpc("check_in_visit_to_queue", {
          p_queue_id: isValidUUID(newId) ? newId : null,
          p_branch_id: branchId,
          p_doctor_id: doctorId,
          p_visit_id: visitId,
          p_booking_id: options?.bookingId || visit?.bookingId || null,
          p_patient_id: isValidUUID(patientId) ? patientId : null,
          p_arrival_at: now,
          p_preferred_service_at: options?.preferredServiceAt || null,
          p_estimated_duration_minutes: options?.estimatedDurationMinutes ?? getPlannedTreatmentDurationMinutes(options?.plannedTreatments || visit?.plannedTreatments),
          p_booking_time_snapshot: options?.bookingTimeSnapshot || null,
          p_patient_name_snapshot: options?.patientNameSnapshot || null,
          p_doctor_name_snapshot: options?.doctorNameSnapshot || null,
          p_complaint: options?.complaint || null
        });
        if (error) {
          throw new Error(error.message);
        }
        const queueRow = Array.isArray(data) ? data[0] : data;
        if (queueRow) {
          const remoteItem = this.mapQueueFromDb(queueRow);
          const currentList = this.getFallbackQueue();
          const idx = currentList.findIndex((q) => q.id === remoteItem.id || q.id === newId);
          if (idx >= 0) currentList[idx] = remoteItem;
          else currentList.unshift(remoteItem);
          this.saveFallbackQueue(currentList);
          const recalculated = await this.recalculateQueue(branchId, doctorId, today);
          return recalculated.find((item) => item.id === remoteItem.id) || remoteItem;
        }
        throw new Error("Server tidak mengembalikan data antrean setelah check-in.");
      } catch (err: any) {
        if (isSupabaseConfigured) {
          throw new Error(`Gagal membuat nomor antrean di Supabase: ${err?.message || "Koneksi bermasalah"}. Pastikan migrasi antrean terbaru sudah diterapkan.`);
        }
        console.warn("[Supabase] queue_items insert remote call failed, using local fallback:", err?.message);
      }
    } else if (isSupabaseConfigured) {
      throw new Error("Gagal membuat antrean: ID cabang atau kunjungan bukan ID Supabase yang valid.");
    }

    if (useRepositoryTestFallbacks()) {
      const updatedFallback = [newQueueItem, ...fallbackItems.filter((q) => q.id !== newId)];
      this.saveFallbackQueue(updatedFallback);
    }
    return newQueueItem;
  }

  async callQueuePatient(queueId: string): Promise<QueueItem> {
    return this.updateStatus(queueId, QueueStatus.IN_PREPARATION);
  }

  async prepareQueuePatient(queueId: string): Promise<QueueItem> {
    return this.updateStatus(queueId, QueueStatus.IN_PREPARATION);
  }

  async startService(queueId: string): Promise<QueueItem> {
    return this.updateStatus(queueId, QueueStatus.IN_CONSULTATION);
  }

  async finishService(queueId: string): Promise<QueueItem> {
    return this.updateStatus(queueId, QueueStatus.COMPLETED);
  }

  async skipQueuePatient(queueId: string): Promise<QueueItem> {
    return this.updateStatus(queueId, QueueStatus.SKIPPED);
  }

  async cancelQueuePatient(queueId: string): Promise<QueueItem> {
    return this.updateStatus(queueId, QueueStatus.CANCELLED);
  }

  async restoreQueueStatus(queueId: string, status: QueueStatus): Promise<QueueItem> {
    return this.updateStatus(queueId, status);
  }

  async removeQueuePatient(queueId: string): Promise<void> {
    const fallbackList = this.getFallbackQueue();
    const idx = fallbackList.findIndex((q) => q.id === queueId);

    if (isValidUUID(queueId)) {
      try {
        const { error } = await supabase.from("queue_items").delete().eq("id", queueId);
        if (error) {
          if (isSupabaseConfigured) {
            throw new Error(`Gagal menghapus antrean di Supabase: ${error.message}`);
          }
          console.warn("[Supabase] removeQueuePatient remote delete failed:", error.message);
        } else {
          if (idx >= 0) {
            fallbackList.splice(idx, 1);
            this.saveFallbackQueue(fallbackList);
          }
          return;
        }
      } catch (err: any) {
        if (isSupabaseConfigured) {
          const message = err instanceof Error ? err.message : "Kesalahan tidak diketahui";
          throw new Error(`Gagal menghapus antrean di Supabase: ${message}`);
        }
        console.warn("[Supabase] removeQueuePatient remote call failed:", err?.message);
      }
    } else if (isSupabaseConfigured) {
      throw new Error(`ID Antrean '${queueId}' tidak valid untuk database Supabase.`);
    }

    if (idx === -1) {
      throw new Error(`Queue item ${queueId} tidak ditemukan`);
    }
    fallbackList.splice(idx, 1);
    this.saveFallbackQueue(fallbackList);
  }

  async updateEstimatedDuration(
    queueId: string,
    newDurationMinutes: number
  ): Promise<QueueItem> {
    ensureSupabaseConnected();
    const nowIso = AppClock.nowISO();

    // 1. Update local fallback first
    const fallbackList = this.getFallbackQueue();
    const itemIndex = fallbackList.findIndex((q) => q.id === queueId);
    let updatedFallback: QueueItem | null = null;
    if (itemIndex >= 0) {
      fallbackList[itemIndex] = {
        ...fallbackList[itemIndex],
        estimatedDurationMinutes: newDurationMinutes,
        updatedAt: nowIso
      };
      this.saveFallbackQueue(fallbackList);
      updatedFallback = fallbackList[itemIndex];
    }

    // 2. Update remote if UUID
    if (isValidUUID(queueId)) {
      try {
        const { data, error } = await supabase
          .from("queue_items")
          .update({ estimated_duration_minutes: newDurationMinutes, updated_at: nowIso })
          .eq("id", queueId)
          .select()
          .single();

        if (!error && data) {
          const mapped = this.mapQueueFromDb(data);
          if (itemIndex >= 0) {
            fallbackList[itemIndex] = mapped;
            this.saveFallbackQueue(fallbackList);
          }
          const operationalDate = getOperationalDateString(mapped.arrivalAt || mapped.checkInTime || mapped.createdAt);
          const recalculated = await this.recalculateQueue(mapped.branchId, mapped.doctorId, operationalDate);
          return recalculated.find((item) => item.id === mapped.id) || mapped;
        } else if (error) {
          console.warn("[Supabase] updateEstimatedDuration remote restricted:", error.message);
        }
      } catch (err: any) {
        console.warn("[Supabase] updateEstimatedDuration remote failed:", err?.message);
      }
    }

    if (updatedFallback) return updatedFallback;
    throw new Error(`QueueItem ${queueId} tidak ditemukan`);
  }

  async recalculateQueue(branchId: string, doctorId: string, operationalDate: string): Promise<QueueItem[]> {
    const [branchItems, bookings] = await Promise.all([
      this.getQueueByBranch(branchId),
      new SupabaseBookingRepository().getBookings()
    ]);
    const scopedItems = branchItems.filter((item) => item.doctorId === doctorId);
    const nowIso = AppClock.nowISO();
    const recalculated = calculateQueueEstimates(scopedItems, bookings, nowIso, operationalDate);

    const fallbackItems = this.getFallbackQueue();
    for (const item of recalculated) {
      const fallbackIndex = fallbackItems.findIndex((fallback) => fallback.id === item.id);
      if (fallbackIndex >= 0) fallbackItems[fallbackIndex] = item;
    }
    this.saveFallbackQueue(fallbackItems);

    for (const item of recalculated) {
      if (!isValidUUID(item.id) || !item.estimatedServiceAt) continue;
      const { error } = await supabase
        .from("queue_items")
        .update({ estimated_service_at: item.estimatedServiceAt, updated_at: nowIso })
        .eq("id", item.id);
      if (error) {
        throw new Error(`Gagal menyimpan estimasi waktu antrean: ${error.message}`);
      }
    }

    return recalculated;
  }

  private async updateStatus(id: string, status: QueueStatus): Promise<QueueItem> {
    ensureSupabaseConnected();
    const nowIso = AppClock.nowISO();

    // 1. Update fallback list
    const fallbackList = this.getFallbackQueue();
    const idx = fallbackList.findIndex((q) => q.id === id);
    const previousFallback = idx >= 0 ? { ...fallbackList[idx] } : null;
    let updatedFallback: QueueItem | null = null;
    let remoteStatusPersisted = false;
    if (idx >= 0) {
      const extra: Partial<QueueItem> = {};
      if (status === QueueStatus.IN_CONSULTATION) {
        extra.actualServiceStartAt = nowIso;
        extra.startTime = nowIso;
      } else if (status === QueueStatus.COMPLETED) {
        extra.actualServiceEndAt = nowIso;
      }
      fallbackList[idx] = {
        ...fallbackList[idx],
        status,
        ...extra,
        updatedAt: nowIso
      };
      this.saveFallbackQueue(fallbackList);
      updatedFallback = fallbackList[idx];
    }

    // 2. Try remote Supabase
    if (isValidUUID(id)) {
      try {
        const updatePayload: any = { status, updated_at: nowIso };
        if (status === QueueStatus.IN_CONSULTATION) {
          updatePayload.actual_service_start_at = nowIso;
        } else if (status === QueueStatus.COMPLETED) {
          updatePayload.actual_service_end_at = nowIso;
        }

        const { data, error } = await supabase
          .from("queue_items")
          .update(updatePayload)
          .eq("id", id)
          .select()
          .single();

        if (!error && data) {
          const mapped = this.mapQueueFromDb(data);
          remoteStatusPersisted = true;
          if (idx >= 0) {
            fallbackList[idx] = mapped;
            this.saveFallbackQueue(fallbackList);
          }
          const operationalDate = getOperationalDateString(mapped.arrivalAt || mapped.checkInTime || mapped.createdAt);
          const recalculated = await this.recalculateQueue(mapped.branchId, mapped.doctorId, operationalDate);
          return recalculated.find((item) => item.id === mapped.id) || mapped;
        } else if (error) {
          if (isSupabaseConfigured) {
            throw new Error(`Gagal memperbarui status antrean di Supabase: ${error.message}.`);
          }
          console.warn("[Supabase] updateStatus remote restricted:", error.message);
        }
      } catch (err: any) {
        if (isSupabaseConfigured) {
          if (!remoteStatusPersisted && idx >= 0 && previousFallback) {
            fallbackList[idx] = previousFallback;
            this.saveFallbackQueue(fallbackList);
          }
          const message = err instanceof Error ? err.message : "Kesalahan tidak diketahui";
          throw new Error(remoteStatusPersisted
            ? `Status antrean berhasil diperbarui, tetapi estimasi gagal dihitung ulang: ${message}`
            : `Gagal memperbarui status antrean di Supabase: ${message}.`);
        }
        console.warn("[Supabase] updateStatus remote failed:", err?.message);
      }
    } else if (isSupabaseConfigured) {
      throw new Error(`ID Antrean '${id}' tidak valid untuk database Supabase.`);
    }

    if (updatedFallback) return updatedFallback;
    throw new Error(`Queue item ${id} tidak ditemukan`);
  }

  private mapQueueFromDb(row: any): QueueItem {
    return {
      id: row.id,
      branchId: row.branch_id || "branch-gebang",
      doctorId: row.doctor_id || "doc-1",
      externalDoctorId: row.external_doctor_id ?? null,
      visitId: row.visit_id,
      patientId: row.patient_id,
      queueNumber: row.queue_number || "A-01",
      status: row.status || QueueStatus.WAITING,
      sequenceOrder: row.sequence_order || 1,
      arrivalAt: row.arrival_at || row.created_at || AppClock.nowISO(),
      bookingId: row.booking_id || row.bookingId || null,
      bookingTimeSnapshot: row.booking_time_snapshot || row.bookingTimeSnapshot || undefined,
      estimatedServiceAt: row.estimated_service_at,
      preferredServiceAt: row.preferred_service_at,
      actualServiceStartAt: row.actual_start || row.actual_service_start_at,
      actualServiceEndAt: row.actual_end || row.actual_service_end_at,
      estimatedDurationMinutes: row.estimated_duration_minutes || 30,
      patientNameSnapshot: row.patient_name_snapshot ?? undefined,
      doctorNameSnapshot: row.doctor_name_snapshot ?? undefined,
      createdAt: row.created_at || AppClock.nowISO(),
      updatedAt: row.updated_at || AppClock.nowISO()
    };
  }
}

// =====================================================================
// 4. SUPABASE MEDICAL RECORD REPOSITORY
// =====================================================================
export class SupabaseMedicalRecordRepository implements MedicalRecordRepository {
  async getConsentDocumentsByVisit(
    visitId: string,
    currentUserRole?: UserRole,
    _userBranchId?: string | null
  ): Promise<ClinicalConsentDocument[]> {
    this.assertConsentDocumentRole(currentUserRole);
    ensureSupabaseConnected();
    let query = supabase
      .from("clinical_consent_documents")
      .select("*")
      .eq("visit_id", visitId)
      .order("uploaded_at", { ascending: false });
    const { data, error } = await query;
    if (error) throw new Error(`Gagal membaca dokumen consent: ${error.message}`);
    return (data || []).map((row) => this.mapConsentDocumentFromDb(row));
  }

  async uploadConsentDocument(
    data: {
      visitId: string;
      branchId: string;
      scope: ClinicalConsentScope;
      treatmentJobId?: string;
      file: File;
    },
    currentUserRole?: UserRole,
    _userBranchId?: string | null
  ): Promise<ClinicalConsentDocument> {
    this.assertConsentDocumentRole(currentUserRole);
    if (!data.file || data.file.size < 1 || data.file.size > 10 * 1024 * 1024) {
      throw new Error("Dokumen consent harus berukuran maksimal 10 MB dan tidak kosong.");
    }
    const extensionByType: Record<string, string> = {
      "application/pdf": "pdf",
      "image/jpeg": "jpg",
      "image/png": "png"
    };
    const extension = extensionByType[data.file.type];
    if (!extension) throw new Error("Format dokumen consent harus PDF, JPG, atau PNG.");
    if (data.scope === "VISIT" && data.treatmentJobId) {
      throw new Error("Dokumen consent kunjungan tidak boleh ditautkan ke tindakan.");
    }
    if (data.scope === "TREATMENT" && !data.treatmentJobId) {
      throw new Error("Pilih tindakan yang memerlukan consent sebelum mengunggah dokumen.");
    }
    ensureSupabaseConnected();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError) throw new Error(`Gagal memverifikasi pengguna untuk dokumen consent: ${authError.message}`);
    if (!authData.user) throw new Error("Sesi pengguna tidak tersedia untuk mengunggah dokumen consent.");

    let doctorId: string | null = null;
    if (currentUserRole === UserRole.DOCTOR) {
      const { data: account, error: accountError } = await supabase
        .from("user_accounts")
        .select("doctor_id")
        .eq("auth_user_id", authData.user.id)
        .eq("active", true)
        .single();
      if (accountError) throw new Error(`Gagal memeriksa penugasan dokter: ${accountError.message}`);
      doctorId = account.doctor_id;
      if (!doctorId) throw new Error("Akun dokter belum ditautkan ke data dokter.");
    }

    const { data: visit, error: visitError } = await supabase
      .from("patient_visits")
      .select("branch_id, doctor_id")
      .eq("id", data.visitId)
      .single();
    if (visitError) throw new Error(`Gagal memeriksa kunjungan consent: ${visitError.message}`);
    if (visit.branch_id !== data.branchId) throw new Error("Cabang tidak sesuai dengan kunjungan.");

    if (currentUserRole === UserRole.DOCTOR && data.scope === "VISIT" && visit.doctor_id !== doctorId) {
      throw new Error("Unggah consent kunjungan hanya dapat dilakukan dokter yang ditugaskan pada kunjungan ini.");
    }

    if (data.scope === "TREATMENT") {
      const { data: job, error: jobError } = await supabase
        .from("treatment_jobs")
        .select("visit_id, branch_id, service_id, doctor_id, assigned_doctor_id")
        .eq("id", data.treatmentJobId!)
        .single();
      if (jobError) throw new Error(`Gagal memeriksa tindakan consent: ${jobError.message}`);
      if (job.visit_id !== data.visitId || job.branch_id !== data.branchId) {
        throw new Error("Tindakan tidak sesuai dengan kunjungan atau cabang.");
      }
      const { data: service, error: serviceError } = await supabase
        .from("master_services")
        .select("requires_consent")
        .eq("id", job.service_id)
        .single();
      if (serviceError) throw new Error(`Gagal memeriksa persyaratan consent layanan: ${serviceError.message}`);
      if (!service.requires_consent) throw new Error("Layanan ini tidak ditandai wajib consent.");
      if (
        currentUserRole === UserRole.DOCTOR &&
        (job.assigned_doctor_id || job.doctor_id) !== doctorId
      ) {
        throw new Error("Unggah consent tindakan hanya dapat dilakukan dokter yang ditugaskan pada tindakan ini.");
      }
    }

    const safeFileName = data.file.name
      .replace(/[\\/\u0000-\u001f\u007f]/g, "_")
      .trim()
      .slice(0, 255) || `consent.${extension}`;
    const objectPath = `${data.branchId}/${data.visitId}/${authData.user.id}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from("clinical-consent-documents")
      .upload(objectPath, data.file, {
        contentType: data.file.type,
        cacheControl: "0",
        upsert: false
      });
    if (uploadError) throw new Error(`Gagal mengunggah dokumen consent: ${uploadError.message}`);

    const { data: saved, error: saveError } = await supabase
      .from("clinical_consent_documents")
      .insert({
        visit_id: data.visitId,
        branch_id: data.branchId,
        scope: data.scope,
        treatment_job_id: data.treatmentJobId || null,
        object_path: objectPath,
        original_file_name: safeFileName,
        content_type: data.file.type,
        size_bytes: data.file.size,
        uploaded_by: authData.user.id
      })
      .select("*")
      .single();
    if (saveError) {
      const { error: cleanupError } = await supabase.storage
        .from("clinical-consent-documents")
        .remove([objectPath]);
      const cleanupMessage = cleanupError ? ` Penghapusan file sementara juga gagal: ${cleanupError.message}` : "";
      throw new Error(`Gagal mencatat metadata dokumen consent: ${saveError.message}.${cleanupMessage}`);
    }
    return this.mapConsentDocumentFromDb(saved);
  }

  async downloadConsentDocument(
    documentId: string,
    currentUserRole?: UserRole,
    _userBranchId?: string | null
  ): Promise<{ fileName: string; blob: Blob }> {
    this.assertConsentDocumentRole(currentUserRole);
    ensureSupabaseConnected();
    let query = supabase
      .from("clinical_consent_documents")
      .select("branch_id, object_path, original_file_name")
      .eq("id", documentId);
    const { data: document, error: documentError } = await query.single();
    if (documentError) throw new Error(`Gagal memeriksa akses dokumen consent: ${documentError.message}`);
    const { data: blob, error: downloadError } = await supabase.storage
      .from("clinical-consent-documents")
      .download(document.object_path);
    if (downloadError) throw new Error(`Gagal mengunduh dokumen consent: ${downloadError.message}`);
    if (!blob) throw new Error("Dokumen consent tidak ditemukan pada penyimpanan.");
    return { fileName: document.original_file_name, blob };
  }

  private assertConsentDocumentRole(role?: UserRole): void {
    if (role !== UserRole.DOCTOR && role !== UserRole.SUPER_ADMIN) {
      throw new Error("Hanya Dokter atau Super Admin yang dapat mengakses dokumen consent.");
    }
  }

  private mapConsentDocumentFromDb(row: {
    id: string;
    visit_id: string;
    branch_id: string;
    scope: ClinicalConsentScope;
    treatment_job_id: string | null;
    original_file_name: string;
    content_type: string;
    size_bytes: number | string;
    uploaded_at: string;
  }): ClinicalConsentDocument {
    return {
      id: row.id,
      visitId: row.visit_id,
      branchId: row.branch_id,
      scope: row.scope,
      treatmentJobId: row.treatment_job_id || undefined,
      fileName: row.original_file_name,
      contentType: row.content_type,
      sizeBytes: Number(row.size_bytes),
      uploadedAt: row.uploaded_at
    };
  }

  async getPatientMedicalProfile(
    patientId: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<PatientMedicalProfile | null> {
    if (currentUserRole !== UserRole.DOCTOR && currentUserRole !== UserRole.SUPER_ADMIN) {
      throw new Error("Hanya Dokter atau Super Admin yang dapat membaca profil medis pasien.");
    }
    ensureSupabaseConnected();
    const { data, error } = await supabase
      .from("patient_medical_profiles")
      .select("*")
      .eq("patient_id", patientId)
      .maybeSingle();
    if (error) throw new Error(`Gagal membaca profil medis pasien: ${error.message}`);
    if (!data) return null;
    if (
      currentUserRole === UserRole.DOCTOR &&
      data.branch_id &&
      data.branch_id !== userBranchId
    ) {
      throw new Error("Anda tidak memiliki akses ke profil medis pasien ini.");
    }
    return this.mapPatientMedicalProfile(data);
  }

  async savePatientMedicalProfile(
    profile: PatientMedicalProfile,
    currentUserRole?: UserRole,
    userBranchId?: string | null,
    currentUserId?: string | null
  ): Promise<PatientMedicalProfile> {
    if (currentUserRole !== UserRole.DOCTOR && currentUserRole !== UserRole.SUPER_ADMIN) {
      throw new Error("Hanya Dokter atau Super Admin yang dapat mengubah profil medis pasien.");
    }
    ensureSupabaseConnected();
    const existing = await this.getPatientMedicalProfile(profile.patientId, currentUserRole, userBranchId);
    const { data, error } = await supabase
      .from("patient_medical_profiles")
      .upsert(
        {
          patient_id: profile.patientId,
          branch_id: existing?.branchId ?? profile.branchId ?? userBranchId ?? null,
          blood_type: profile.bloodType || null,
          allergies: profile.allergies || null,
          medication_allergies: profile.medicationAllergies || null,
          food_allergies: profile.foodAllergies || null,
          congenital_diseases: profile.congenitalDiseases || null,
          systemic_diseases: profile.systemicDiseases || null,
          routine_medications: profile.routineMedications || null,
          medical_warnings: profile.medicalWarnings || null,
          medical_history_notes: profile.medicalHistoryNotes || null,
          updated_by: currentUserId || null,
          updated_at: AppClock.nowISO()
        },
        { onConflict: "patient_id" }
      )
      .select("*")
      .single();
    if (error) throw new Error(`Gagal menyimpan profil medis pasien: ${error.message}`);
    return this.mapPatientMedicalProfile(data);
  }

  async getMedicalRecordById(id: string): Promise<MedicalRecord | null> {
    ensureSupabaseConnected();
    const { data, error } = await supabase.from("clinical_medical_records").select("*").eq("id", id).single();
    if (error && error.code !== "PGRST116") return handleSupabaseReadError("clinical_medical_records", error, null);
    if (!data) return null;
    return this.mapMedicalRecordFromDb(data);
  }

  async getMedicalRecordByVisit(visitId: string): Promise<MedicalRecord | null> {
    ensureSupabaseConnected();
    const { data, error } = await supabase.from("clinical_medical_records").select("*").eq("visit_id", visitId).single();
    if (error && error.code !== "PGRST116") return handleSupabaseReadError("clinical_medical_records", error, null);
    if (!data) return null;
    return this.mapMedicalRecordFromDb(data);
  }

  async getMedicalRecordsByPatient(patientId: string): Promise<MedicalRecord[]> {
    ensureSupabaseConnected();
    const { data, error } = await supabase
      .from("clinical_medical_records")
      .select("*")
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false });

    if (error) throw new Error(`Supabase error: ${error.message}`);
    return (data || []).map(this.mapMedicalRecordFromDb);
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
      odontogram?: OdontogramData;
      clinicFormData?: MedicalRecord["clinicFormData"];
      vitalSigns?: MedicalRecord["vitalSigns"];
      medicalHistorySnapshot?: PatientMedicalProfile;
      status?: MedicalRecordStatus | "DRAFT" | "FINAL";
      customId?: string;
    }
  ): Promise<MedicalRecord> {
    ensureSupabaseConnected();
    if (data.status === MedicalRecordStatus.FINAL) {
      throw new Error("Simpan sebagai draft terlebih dahulu, lalu gunakan finalisasi oleh dokter penanggung jawab.");
    }
    const existing = await this.getMedicalRecordByVisit(data.visitId);

    if (existing) {
      const { data: updated, error } = await supabase
        .from("clinical_medical_records")
        .update({
          anamnesis: data.anamnesis || "",
          physical_examination: data.clinicalExamination || "",
          treatment_notes: data.treatmentPlan || data.doctorNotes || null,
          chief_complaint: data.chiefComplaint,
          clinical_examination: data.clinicalExamination || "",
          diagnosis: data.diagnosis,
          diagnosis_icd10: data.diagnosisCode
            ? [{ code: data.diagnosisCode, system: "ICD-10-WHO-2019" }]
            : [],
          procedure_icd9cm_codes: data.procedureCodes || [],
          treatment_plan: data.treatmentPlan || null,
          doctor_notes: data.doctorNotes || null,
          odontogram: data.odontogram || { schemaVersion: 1, teeth: {} },
          clinic_form_data: data.clinicFormData || {},
          vital_signs: data.vitalSigns || {},
          medical_history_snapshot: data.medicalHistorySnapshot || {},
          status: MedicalRecordStatus.DRAFT,
          updated_at: AppClock.nowISO()
        })
        .eq("id", existing.id)
        .select()
        .single();

      if (error) throw new Error(`Supabase error: ${error.message}`);
      return this.mapMedicalRecordFromDb(updated);
    }

    const { data: created, error } = await supabase
      .from("clinical_medical_records")
      .insert({
        visit_id: data.visitId,
        patient_id: data.patientId,
        branch_id: data.branchId,
        doctor_id: data.doctorId,
        anamnesis: data.anamnesis || "",
        physical_examination: data.clinicalExamination || "",
        treatment_notes: data.treatmentPlan || data.doctorNotes || null,
        chief_complaint: data.chiefComplaint,
        clinical_examination: data.clinicalExamination || "",
        diagnosis: data.diagnosis,
        diagnosis_icd10: data.diagnosisCode
          ? [{ code: data.diagnosisCode, system: "ICD-10-WHO-2019" }]
          : [],
        procedure_icd9cm_codes: data.procedureCodes || [],
        treatment_plan: data.treatmentPlan || null,
        doctor_notes: data.doctorNotes || null,
        odontogram: data.odontogram || { schemaVersion: 1, teeth: {} },
        clinic_form_data: data.clinicFormData || {},
        vital_signs: data.vitalSigns || {},
        medical_history_snapshot: data.medicalHistorySnapshot || {},
        status: MedicalRecordStatus.DRAFT
      })
      .select()
      .single();

    if (error) throw new Error(`Supabase error: ${error.message}`);
    return this.mapMedicalRecordFromDb(created);
  }

  async finalizeMedicalRecord(
    id: string,
    doctorId: string,
    currentUserRole?: UserRole,
    _userBranchId?: string | null
  ): Promise<MedicalRecord> {
    if (currentUserRole !== UserRole.DOCTOR) {
      throw new Error("Hanya Dokter yang dapat menandatangani & memfinalisasi rekam medis.");
    }

    ensureSupabaseConnected();
    const now = AppClock.nowISO();
    const { data, error } = await supabase
      .from("clinical_medical_records")
      .update({
        status: MedicalRecordStatus.FINAL,
        signed_by_doctor_id: doctorId,
        signed_at: now,
        is_locked: true,
        updated_at: now
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw new Error(`Supabase error: ${error.message}`);
    return this.mapMedicalRecordFromDb(data);
  }

  private mapMedicalRecordFromDb(row: any): MedicalRecord {
    return {
      id: row.id,
      patientId: row.patient_id,
      visitId: row.visit_id,
      branchId: row.branch_id,
      doctorId: row.doctor_id,
      chiefComplaint: row.chief_complaint || row.anamnesis || "",
      anamnesis: row.anamnesis,
      clinicalExamination: row.clinical_examination || row.physical_examination || "",
      diagnosis: row.diagnosis || "",
      diagnosisCode: Array.isArray(row.diagnosis_icd10)
        ? row.diagnosis_icd10.find((entry: any) => typeof entry?.code === "string")?.code
          || row.diagnosis_icd10.find((entry: any) => typeof entry === "string")
        : undefined,
      procedureCodes: Array.isArray(row.procedure_icd9cm_codes)
        ? row.procedure_icd9cm_codes.filter((code: unknown): code is string => typeof code === "string")
        : [],
      treatmentPlan: row.treatment_plan || row.treatment_notes,
      doctorNotes: row.doctor_notes || row.treatment_notes,
      odontogram: this.mapOdontogram(row.odontogram),
      clinicFormData: row.clinic_form_data || {},
      odontogramHistory: Array.isArray(row.odontogram_history)
        ? row.odontogram_history.map((entry: any) => ({
            odontogram: this.mapOdontogram(entry.odontogram),
            changedAt: entry.changed_at,
            changedBy: entry.changed_by || undefined
          }))
        : [],
      vitalSigns: this.mapVitalSigns(row.vital_signs),
      medicalHistorySnapshot: this.mapPatientMedicalProfile(
        row.medical_history_snapshot,
        row.patient_id
      ),
      status: row.status || MedicalRecordStatus.DRAFT,
      signedByDoctorId: row.signed_by_doctor_id || undefined,
      signedAt: row.signed_at || undefined,
      isLocked: Boolean(row.is_locked),
      createdAt: row.created_at || AppClock.nowISO(),
      updatedAt: row.updated_at || AppClock.nowISO()
    };
  }

  private mapOdontogram(value: unknown): OdontogramData {
    if (
      value &&
      typeof value === "object" &&
      "schemaVersion" in value &&
      value.schemaVersion === 1 &&
      "teeth" in value &&
      value.teeth &&
      typeof value.teeth === "object"
    ) {
      return value as OdontogramData;
    }
    return { schemaVersion: 1, teeth: {} };
  }

  private mapPatientMedicalProfile(row: any, patientId?: string): PatientMedicalProfile {
    return {
      patientId: row?.patient_id || patientId || "",
      branchId: row?.branch_id || undefined,
      bloodType: row?.blood_type || undefined,
      allergies: row?.allergies || "",
      medicationAllergies: row?.medication_allergies || "",
      foodAllergies: row?.food_allergies || "",
      congenitalDiseases: row?.congenital_diseases || "",
      systemicDiseases: row?.systemic_diseases || "",
      routineMedications: row?.routine_medications || "",
      medicalWarnings: row?.medical_warnings || "",
      medicalHistoryNotes: row?.medical_history_notes || "",
      updatedAt: row?.updated_at || undefined,
      updatedBy: row?.updated_by || undefined
    };
  }

  private mapVitalSigns(value: unknown): MedicalRecord["vitalSigns"] {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const allowedKeys = [
      "systolicBloodPressure",
      "diastolicBloodPressure",
      "pulseBpm",
      "temperatureCelsius",
      "respiratoryRatePerMinute",
      "oxygenSaturationPercent",
      "weightKg",
      "heightCm"
    ] as const;
    const source = value as Record<string, unknown>;
    return Object.fromEntries(
      allowedKeys.flatMap((key) => {
        const item = source[key];
        return typeof item === "number" && Number.isFinite(item) ? [[key, item]] : [];
      })
    );
  }
}

// =====================================================================
// 5. SUPABASE PROMOTION REPOSITORY
// =====================================================================
export class SupabasePromotionRepository implements PromotionRepository {
  async getPromotions(currentUserRole?: UserRole, userBranchId?: string | null): Promise<PromotionMedia[]> {
    ensureSupabaseConnected();
    let query = supabase.from("promotion_media").select("*").order("display_order", { ascending: true });

    if ((currentUserRole === UserRole.BRANCH_ADMIN || currentUserRole === UserRole.DOCTOR_ASSISTANT) && userBranchId) {
      query = query.or(`branch_id.is.null,branch_id.eq.${userBranchId}`);
    }

    const { data, error } = await query;
    if (error) throw new Error(`Supabase error: ${error.message}`);
    return (data || []).map(this.mapPromoFromDb);
  }

  async getPromotionById(id: string): Promise<PromotionMedia | null> {
    ensureSupabaseConnected();
    const { data, error } = await supabase.from("promotion_media").select("*").eq("id", id).single();
    if (error && error.code !== "PGRST116") return handleSupabaseReadError("promotion_media", error, null);
    if (!data) return null;
    return this.mapPromoFromDb(data);
  }

  async getActivePromotions(branchId?: string | null): Promise<PromotionMedia[]> {
    ensureSupabaseConnected();
    let query = supabase.from("promotion_media").select("*").eq("is_active", true).order("display_order", { ascending: true });

    if (branchId) {
      query = query.or(`branch_id.is.null,branch_id.eq.${branchId}`);
    }

    const { data, error } = await query;
    if (error) throw new Error(`Supabase error: ${error.message}`);
    return (data || []).map(this.mapPromoFromDb);
  }

  async createPromotion(
    data: {
      title?: string;
      description?: string;
      imageUrl: string;
      branchId?: string | null;
      isActive?: boolean;
      displayOrder?: number;
    },
    currentUserRole?: UserRole
  ): Promise<PromotionMedia> {
    if (currentUserRole !== UserRole.SUPER_ADMIN) {
      throw new Error("Akses ditolak: Hanya Super Admin yang dapat menambahkan promosi.");
    }

    ensureSupabaseConnected();
    const dbPayload = {
      title: data.title?.trim() || "",
      description: data.description?.trim() || null,
      image_url: data.imageUrl,
      branch_id: data.branchId || null,
      is_active: data.isActive ?? true,
      display_order: data.displayOrder ?? 1
    };

    const { data: created, error } = await supabase.from("promotion_media").insert(dbPayload).select().single();
    if (error) throw new Error(`Supabase error: ${error.message}`);
    return this.mapPromoFromDb(created);
  }

  async updatePromotion(id: string, updates: Partial<PromotionMedia>, currentUserRole?: UserRole): Promise<PromotionMedia> {
    if (currentUserRole !== UserRole.SUPER_ADMIN) {
      throw new Error("Akses ditolak: Hanya Super Admin yang dapat mengubah data promosi.");
    }

    ensureSupabaseConnected();
    const dbPayload: any = { updated_at: AppClock.nowISO() };
    if (updates.title !== undefined) dbPayload.title = updates.title.trim();
    if (updates.description !== undefined) dbPayload.description = updates.description.trim() || null;
    if (updates.imageUrl) dbPayload.image_url = updates.imageUrl;
    if (updates.branchId !== undefined) dbPayload.branch_id = updates.branchId;
    if (updates.isActive !== undefined) dbPayload.is_active = updates.isActive;
    if (updates.displayOrder !== undefined) dbPayload.display_order = updates.displayOrder;

    const { data, error } = await supabase.from("promotion_media").update(dbPayload).eq("id", id).select().single();
    if (error) throw new Error(`Supabase error: ${error.message}`);
    return this.mapPromoFromDb(data);
  }

  async deletePromotion(id: string, currentUserRole?: UserRole): Promise<boolean> {
    if (currentUserRole !== UserRole.SUPER_ADMIN) {
      throw new Error("Akses ditolak: Hanya Super Admin yang dapat menghapus promosi.");
    }

    ensureSupabaseConnected();
    const { error } = await supabase.from("promotion_media").delete().eq("id", id);
    if (error) throw new Error(`Supabase error: ${error.message}`);
    return true;
  }

  async toggleActive(id: string, isActive: boolean, currentUserRole?: UserRole): Promise<PromotionMedia> {
    return this.updatePromotion(id, { isActive }, currentUserRole);
  }

  async reorderPromotions(orderedIds: string[], currentUserRole?: UserRole): Promise<PromotionMedia[]> {
    if (currentUserRole !== UserRole.SUPER_ADMIN) {
      throw new Error("Akses ditolak: Hanya Super Admin yang dapat mengatur urutan promosi.");
    }

    for (let i = 0; i < orderedIds.length; i++) {
      await this.updatePromotion(orderedIds[i], { displayOrder: i + 1 }, currentUserRole);
    }

    return this.getPromotions(currentUserRole);
  }

  private mapPromoFromDb(row: any): PromotionMedia {
    return {
      id: row.id,
      title: row.title || "",
      description: row.description,
      imageUrl: row.image_url,
      branchId: row.branch_id,
      isActive: row.is_active,
      displayOrder: row.display_order,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}

function dataURLtoBlob(dataurl: string): Blob | null {
  try {
    const arr = dataurl.split(",");
    const mime = arr[0].match(/:(.*?);/)?.[1] || "image/png";
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  } catch {
    return null;
  }
}

// =====================================================================
// 6. SUPABASE STORAGE REPOSITORY
// =====================================================================
export class SupabaseStorageRepository implements MediaStorageRepository {
  async uploadImage(
    file: File | Blob | { name: string; type: string; size: number; base64OrDataUrl?: string; content?: string },
    folder: string = "clinic-media"
  ): Promise<MediaUploadResult> {
    const fileName = (file as any).name || "image.png";
    const mimeType = (file as any).type || "image/png";
    const fileSize = (file as any).size || 0;
    const base64Url = (file as any).base64OrDataUrl;
    const bucketName =
      folder === "branding-logos"
        ? "clinic-branding"
        : folder === "doctor-portraits"
          ? "clinic-doctor-portraits"
          : ["branch-logos", "branch-photos", "promotions"].includes(folder)
            ? "clinic-public-media"
          : "clinic-media";
    const requiresStorageUpload = [
      "clinic-branding",
      "clinic-doctor-portraits",
      "clinic-public-media"
    ].includes(bucketName);

    const path = `${folder}/${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

    if (!isSupabaseConfigured || !supabase) {
      if (base64Url && bucketName !== "clinic-doctor-portraits" && bucketName !== "clinic-public-media") {
        return { url: base64Url, path, fileName, fileSize, mimeType };
      }
      throw new Error("Koneksi ke Supabase belum terkonfigurasi.");
    }

    try {
      let uploadPayload: any = file;
      if (base64Url) {
        const blob = dataURLtoBlob(base64Url);
        if (blob) uploadPayload = blob;
      }

      const { data, error } = await supabase.storage.from(bucketName).upload(path, uploadPayload, { upsert: true });

      if (error) {
        if (requiresStorageUpload) {
          throw new Error(`Supabase Storage upload error: ${error.message}`);
        }
        // If bucket is not created on remote Supabase instance (Bucket not found), fallback safely to Data URL
        if (base64Url) {
          console.warn(`Supabase Storage bucket notice: ${error.message}. Menggunakan format data URL langsung.`);
          return {
            url: base64Url,
            path,
            fileName,
            fileSize,
            mimeType
          };
        }
        throw new Error(`Supabase Storage upload error: ${error.message}`);
      }

      const { data: pubUrl } = supabase.storage.from(bucketName).getPublicUrl(data.path);

      return {
        url: pubUrl.publicUrl,
        path: data.path,
        fileName,
        fileSize,
        mimeType
      };
    } catch (err: any) {
      if (base64Url && !requiresStorageUpload) {
        console.warn(`Storage upload fallback: ${err.message}`);
        return {
          url: base64Url,
          path,
          fileName,
          fileSize,
          mimeType
        };
      }
      throw err;
    }
  }

  async replaceImage(
    oldPathOrUrl: string,
    newFile: File | Blob | { name: string; type: string; size: number; base64OrDataUrl?: string; content?: string },
    folder: string = "clinic-media"
  ): Promise<MediaUploadResult> {
    try {
      await this.deleteImage(oldPathOrUrl);
    } catch (e) {
      console.warn("Replace image delete old warning:", e);
    }
    return this.uploadImage(newFile, folder);
  }

  async deleteImage(pathOrUrl: string): Promise<void> {
    if (!isSupabaseConfigured || !supabase) return;
    try {
      const publicObjectMatch = pathOrUrl.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
      const bucketName = publicObjectMatch?.[1] || "clinic-media";
      const path = publicObjectMatch?.[2] || (pathOrUrl.includes("/") ? pathOrUrl.split("/").pop() || pathOrUrl : pathOrUrl);
      await supabase.storage.from(bucketName).remove([path]);
    } catch (e) {
      console.warn("Delete image warning:", e);
    }
  }

  getPublicUrl(path: string): string {
    if (!isSupabaseConfigured || !supabase) {
      return path;
    }
    try {
      const { data } = supabase.storage.from("clinic-media").getPublicUrl(path);
      return data?.publicUrl || path;
    } catch {
      return path;
    }
  }
}

// =====================================================================
// 7. SUPABASE BOOKING REPOSITORY
// =====================================================================
export class SupabaseBookingRepository implements BookingRepository {
  private getFallbackBookings(): Booking[] {
    if (!useRepositoryTestFallbacks()) return [];
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("lala_bookings");
        if (stored) return JSON.parse(stored);
      } catch (e) {
        console.warn("Error loading bookings from localStorage:", e);
      }
    }
    return [];
  }

  private saveFallbackBookings(bookings: Booking[]): void {
    if (!useRepositoryTestFallbacks()) return;
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("lala_bookings", JSON.stringify(bookings));
      } catch (e) {
        console.warn("Error saving bookings to localStorage:", e);
      }
    }
  }

  private mapBookingFromDb(row: any): Booking {
    const source = (row.source ?? row.booking_source ?? row.channel ?? BookingSource.FRONT_DESK) as BookingSource;
    const canonicalTimeSlot = getOperationalTimeString(row.booking_date_time);
    return {
      id: row.id,
      patientId: row.patient_id,
      branchId: row.branch_id,
      doctorId: row.doctor_id,
      externalDoctorId: row.external_doctor_id ?? null,
      serviceId: row.service_id ?? undefined,
      plannedTreatments: Array.isArray(row.planned_treatments) ? row.planned_treatments : [],
      bookingDateTime: row.booking_date_time,
      timeSlot: canonicalTimeSlot !== "--:--" ? canonicalTimeSlot : row.time_slot ?? undefined,
      complaint: row.complaint ?? undefined,
      notes: row.notes ?? row.complaint ?? undefined,
      patientNameSnapshot: row.patient_name_snapshot ?? undefined,
      doctorNameSnapshot: row.doctor_name_snapshot ?? undefined,
      branchNameSnapshot: row.branch_name_snapshot ?? undefined,
      source,
      channel: source,
      rescheduledFromBookingId: row.rescheduled_from_booking_id ?? undefined,
      rescheduleReason: row.reschedule_reason ?? undefined,
      cancellationReason: row.cancellation_reason ?? undefined,
      status: row.status as BookingStatus,
      enRouteConfirmedAt: row.en_route_confirmed_at ?? undefined,
      lateCheckInRequestedAt: row.late_checkin_requested_at ?? undefined,
      scheduleVerified: row.schedule_verified ?? true,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  async getBookings(currentUserRole?: UserRole, userBranchId?: string | null): Promise<Booking[]> {
    ensureSupabaseConnected();
    let remoteBookings: Booking[] = [];
    try {
      let q = supabase.from("bookings").select("*").order("booking_date_time", { ascending: false });
      if ((currentUserRole === UserRole.BRANCH_ADMIN || currentUserRole === UserRole.DOCTOR_ASSISTANT) && userBranchId && isValidUUID(userBranchId)) {
        q = q.eq("branch_id", userBranchId);
      }
      const { data, error } = await q;
      if (!error && data) {
        remoteBookings = data.map(this.mapBookingFromDb);
      }
    } catch (e) {
      console.warn("[Supabase] getBookings remote error:", e);
    }

    const fallback = this.getFallbackBookings();
    const remoteIds = new Set(remoteBookings.map((b) => b.id));
    const localOnly = fallback.filter((b) => !remoteIds.has(b.id));
    const merged = [...remoteBookings, ...localOnly];

    if ((currentUserRole === UserRole.BRANCH_ADMIN || currentUserRole === UserRole.DOCTOR_ASSISTANT) && userBranchId) {
      return merged.filter((b) => b.branchId === userBranchId);
    }
    return merged;
  }

  async getBookingById(id: string, currentUserRole?: UserRole, userBranchId?: string | null): Promise<Booking | null> {
    ensureSupabaseConnected();
    if (isValidUUID(id)) {
      try {
        let q = supabase.from("bookings").select("*").eq("id", id);
        if ((currentUserRole === UserRole.BRANCH_ADMIN || currentUserRole === UserRole.DOCTOR_ASSISTANT) && userBranchId && isValidUUID(userBranchId)) {
          q = q.eq("branch_id", userBranchId);
        }
        const { data, error } = await q.single();
        if (!error && data) return this.mapBookingFromDb(data);
      } catch (e) {
        console.warn("[Supabase] getBookingById remote error:", e);
      }
    }
    const fallback = this.getFallbackBookings();
    return fallback.find((b) => b.id === id) || null;
  }

  async getBookingsByBranch(branchId: string, currentUserRole?: UserRole, userBranchId?: string | null): Promise<Booking[]> {
    const all = await this.getBookings(currentUserRole, userBranchId);
    const targetBranch = (currentUserRole === UserRole.BRANCH_ADMIN || currentUserRole === UserRole.DOCTOR_ASSISTANT) && userBranchId ? userBranchId : branchId;
    return all.filter((b) => b.branchId === targetBranch);
  }

  async getBookingsByPatient(patientId: string): Promise<Booking[]> {
    ensureSupabaseConnected();
    if (!patientId) {
      throw new Error("ID profil pasien belum tersedia untuk membaca janji temu.");
    }
    if (useRepositoryTestFallbacks()) {
      return this.getFallbackBookings().filter((booking) => booking.patientId === patientId);
    }

    const { data, error } = await supabase
      .from("bookings")
      .select("*")
      .eq("patient_id", patientId)
      .order("booking_date_time", { ascending: true });
    if (error) {
      throw new Error(`Gagal membaca janji temu pasien: ${error.message}`);
    }
    return (data || []).map(this.mapBookingFromDb);
  }

  async getBookingsByDate(dateStr: string, branchId?: string, currentUserRole?: UserRole, userBranchId?: string | null): Promise<Booking[]> {
    const all = await this.getBookings(currentUserRole, userBranchId);
    const targetBranch = (currentUserRole === UserRole.BRANCH_ADMIN || currentUserRole === UserRole.DOCTOR_ASSISTANT) && userBranchId ? userBranchId : branchId;
    return all.filter((b) => {
      const isDate = b.bookingDateTime.startsWith(dateStr);
      if (!isDate) return false;
      if (targetBranch) return b.branchId === targetBranch;
      return true;
    });
  }

  async getPatientAvailableBookingSlots(branchId: string, doctorId: string, operationalDate: string): Promise<string[]> {
    ensureSupabaseConnected();
    if (useRepositoryTestFallbacks()) return [];

    const { data, error } = await supabase.rpc("get_patient_available_booking_slots", {
      p_branch_id: branchId,
      p_doctor_id: doctorId,
      p_operational_date: operationalDate
    });
    if (error) {
      throw new Error(`Gagal memuat slot booking yang tersedia: ${error.message}`);
    }
    return (data || []).map((row: { slot_time: string }) => row.slot_time);
  }

  async confirmPatientEnRoute(bookingId: string): Promise<string> {
    ensureSupabaseConnected();
    if (useRepositoryTestFallbacks()) {
      const booking = this.getFallbackBookings().find((item) => item.id === bookingId);
      if (!booking) throw new Error("Janji temu tidak ditemukan.");
      const confirmedAt = AppClock.nowISO();
      const bookings = this.getFallbackBookings().map((item) =>
        item.id === bookingId ? { ...item, enRouteConfirmedAt: confirmedAt, updatedAt: confirmedAt } : item
      );
      this.saveFallbackBookings(bookings);
      return confirmedAt;
    }

    const { data, error } = await supabase.rpc("patient_confirm_booking_en_route", {
      p_booking_id: bookingId
    });
    if (error) {
      throw new Error(`Gagal mengonfirmasi perjalanan ke klinik: ${error.message}`);
    }
    if (typeof data !== "string") {
      throw new Error("Server tidak mengembalikan waktu konfirmasi perjalanan.");
    }
    return data;
  }

  async getPatientQueueEstimate(bookingId: string): Promise<PatientBookingQueueEstimate> {
    ensureSupabaseConnected();
    if (useRepositoryTestFallbacks()) {
      const booking = this.getFallbackBookings().find((item) => item.id === bookingId);
      if (!booking) throw new Error("Janji temu tidak ditemukan.");
      return {
        patientsAhead: 0,
        estimatedServiceAt: booking.bookingDateTime,
        refreshedAt: AppClock.nowISO()
      };
    }

    const { data, error } = await supabase.rpc("get_patient_booking_queue_estimate", {
      p_booking_id: bookingId
    });
    if (error) {
      throw new Error(`Gagal memuat perkiraan antrean: ${error.message}`);
    }
    const result = Array.isArray(data) ? data[0] : data;
    if (!result || typeof result.estimated_service_at !== "string") {
      throw new Error("Server tidak mengembalikan perkiraan antrean yang valid.");
    }
    return {
      patientsAhead: Number(result.patients_ahead) || 0,
      estimatedServiceAt: result.estimated_service_at,
      refreshedAt: result.refreshed_at
    };
  }

  async requestLateCheckInConfirmation(bookingId: string): Promise<string> {
    ensureSupabaseConnected();
    if (useRepositoryTestFallbacks()) {
      const requestedAt = AppClock.nowISO();
      const bookings = this.getFallbackBookings().map((item) =>
        item.id === bookingId ? { ...item, lateCheckInRequestedAt: requestedAt, updatedAt: requestedAt } : item
      );
      this.saveFallbackBookings(bookings);
      return requestedAt;
    }

    const { data, error } = await supabase.rpc("patient_request_late_checkin_confirmation", {
      p_booking_id: bookingId
    });
    if (error) {
      throw new Error(`Gagal meminta konfirmasi petugas: ${error.message}`);
    }
    if (typeof data !== "string") {
      throw new Error("Server tidak mengembalikan waktu permintaan konfirmasi petugas.");
    }
    return data;
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
    ensureSupabaseConnected();

    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId && !isBranchMatch(bookingData.branchId, userBranchId)) {
      throw new Error("Branch Admin tidak dapat membuat booking untuk cabang lain");
    }

    const timeSlot = bookingData.timeSlot || getOperationalTimeString(bookingData.bookingDateTime);
    const canonicalBookingDateTime = toOperationalDateTime(bookingData.bookingDateTime, timeSlot);
    const bookingDate = getOperationalDateString(canonicalBookingDateTime);
    const dayStart = new Date(`${bookingDate}T00:00:00.000+07:00`);
    if (Number.isNaN(dayStart.getTime())) {
      throw new Error("Tanggal booking tidak valid");
    }
    const requestedSlotStart = new Date(canonicalBookingDateTime);
    if (Number.isNaN(requestedSlotStart.getTime())) {
      throw new Error("Tanggal dan jam booking tidak valid");
    }
    requestedSlotStart.setUTCSeconds(0, 0);
    const nextDayStart = new Date(dayStart);
    nextDayStart.setTime(nextDayStart.getTime() + 24 * 60 * 60 * 1000);

    if (isValidUUID(bookingData.patientId) && isValidUUID(bookingData.branchId)) {
      const activePatientBookingsQuery = supabase
        .from("bookings")
        .select("id")
        .eq("patient_id", bookingData.patientId);
      const { data: activeBookings, error: duplicateCheckError } = currentUserRole === UserRole.PATIENT
        ? await activePatientBookingsQuery
          .in("status", [BookingStatus.PENDING, BookingStatus.CONFIRMED])
          .limit(1)
        : await activePatientBookingsQuery
          .eq("branch_id", bookingData.branchId)
          .in("status", [BookingStatus.PENDING, BookingStatus.CONFIRMED])
          .gte("booking_date_time", dayStart.toISOString())
          .lt("booking_date_time", nextDayStart.toISOString())
          .limit(1);

      if (duplicateCheckError) {
        throw new Error(`Gagal memeriksa booking aktif pasien: ${duplicateCheckError.message}`);
      }
      if (activeBookings && activeBookings.length > 0) {
        throw new Error(currentUserRole === UserRole.PATIENT
          ? "Anda masih memiliki janji temu yang belum selesai. Selesaikan atau batalkan melalui klinik sebelum membuat janji temu baru."
          : "Pasien sudah memiliki booking aktif di cabang ini pada tanggal tersebut");
      }

      const { data: doctorSlotBookings, error: doctorSlotError } = await supabase
        .from("bookings")
        .select("booking_date_time, planned_treatments")
        .eq("doctor_id", bookingData.doctorId)
        .eq("branch_id", bookingData.branchId)
        .gte("booking_date_time", dayStart.toISOString())
        .lt("booking_date_time", nextDayStart.toISOString())
        .in("status", [BookingStatus.PENDING, BookingStatus.CONFIRMED]);

      if (doctorSlotError) {
        throw new Error(`Gagal memeriksa slot dokter: ${doctorSlotError.message}`);
      }
      const requestedDuration = getPlannedTreatmentDurationMinutes(bookingData.plannedTreatments || [], 30);
      const requestedEnd = requestedSlotStart.getTime() + requestedDuration * 60_000;
      const hasDoctorConflict = (doctorSlotBookings || []).some((booking) => {
        const bookedStart = new Date(booking.booking_date_time).getTime();
        const bookedDuration = getPlannedTreatmentDurationMinutes(booking.planned_treatments || [], 30);
        return requestedSlotStart.getTime() < bookedStart + bookedDuration * 60_000 &&
          bookedStart < requestedEnd;
      });
      if (hasDoctorConflict) {
        throw new Error("Dokter sudah memiliki booking aktif yang bertabrakan dengan durasi tindakan ini di cabang tersebut");
      }
    }

    const bookingId = bookingData.id || (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `bk-${Date.now()}`);
    const now = new Date().toISOString();

    const source = bookingData.source || bookingData.channel || BookingSource.FRONT_DESK;
    const fallbackBooking: Booking = {
      id: bookingId,
      patientId: bookingData.patientId,
      branchId: bookingData.branchId,
      doctorId: bookingData.doctorId,
      serviceId: bookingData.serviceId,
      bookingDateTime: canonicalBookingDateTime,
      timeSlot,
      complaint: bookingData.complaint || bookingData.notes || "",
      notes: bookingData.notes || bookingData.complaint || "",
      patientNameSnapshot: bookingData.patientNameSnapshot || "",
      doctorNameSnapshot: bookingData.doctorNameSnapshot || "",
      branchNameSnapshot: bookingData.branchNameSnapshot || "",
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

    // Safely attempt remote insert ONLY if foreign keys are valid UUIDs
    if (isValidUUID(bookingData.patientId) && isValidUUID(bookingData.branchId)) {
      const sourceValue = bookingData.source || bookingData.channel || BookingSource.FRONT_DESK;
      const payload: any = {
        patient_id: bookingData.patientId,
        branch_id: bookingData.branchId,
        booking_date_time: canonicalBookingDateTime,
        time_slot: timeSlot,
        complaint: bookingData.complaint || bookingData.notes || null,
        notes: bookingData.notes || bookingData.complaint || null,
        patient_name_snapshot: bookingData.patientNameSnapshot || null,
        doctor_name_snapshot: bookingData.doctorNameSnapshot || null,
        branch_name_snapshot: bookingData.branchNameSnapshot || null,
        status: bookingData.status || BookingStatus.PENDING,
        schedule_verified: bookingData.scheduleVerified !== undefined ? bookingData.scheduleVerified : true,
        planned_treatments: bookingData.plannedTreatments || [],
        ...(bookingData.rescheduledFromBookingId ? { rescheduled_from_booking_id: bookingData.rescheduledFromBookingId } : {}),
        ...(bookingData.rescheduleReason ? { reschedule_reason: bookingData.rescheduleReason } : {})
      };
      if (isValidUUID(bookingData.doctorId)) payload.doctor_id = bookingData.doctorId;
      if (bookingData.serviceId && isValidUUID(bookingData.serviceId)) payload.service_id = bookingData.serviceId;
      if (isValidUUID(bookingId)) payload.id = bookingId;

      const metadataPayload = {
        ...payload,
        source: sourceValue,
        channel: sourceValue
      };

      const bookingWriteClient = supabaseWriteClient || supabase;

      try {
        if (typeof window !== "undefined" && typeof fetch === "function") {
          const { data: sessionData } = await supabase.auth.getSession();
          const response = await fetch("/api/bookings", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(sessionData.session?.access_token ? { Authorization: `Bearer ${sessionData.session.access_token}` } : {})
            },
            body: JSON.stringify(metadataPayload)
          });

          const result = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(result?.message || `HTTP ${response.status}`);
          }

          if (result?.booking) {
            const res = this.mapBookingFromDb(result.booking);
            const existing = this.getFallbackBookings();
            const idx = existing.findIndex((b) => b.id === res.id);
            if (idx >= 0) existing[idx] = res;
            else existing.unshift(res);
            this.saveFallbackBookings(existing);
            return res;
          }
        }

        const executeInsert = async (requestPayload: any) => bookingWriteClient.from("bookings").insert(requestPayload).select().single();
        let { data, error } = await executeInsert(metadataPayload);
        if (error && typeof error.message === "string" && /column .* does not exist|unknown column/i.test(error.message)) {
          ({ data, error } = await executeInsert(payload));
        }
        if (!error && data) {
          const res = this.mapBookingFromDb(data);
          const existing = this.getFallbackBookings();
          const idx = existing.findIndex((b) => b.id === res.id);
          if (idx >= 0) existing[idx] = res;
          else existing.unshift(res);
          this.saveFallbackBookings(existing);

          // Create H1 confirmation stub
          try {
            await bookingWriteClient.from("booking_confirmations_h1").insert({
              booking_id: data.id,
              branch_id: data.branch_id,
              confirmation_status: "BELUM_DIHUBUNGI"
            });
          } catch {
            // Safe ignore if exists
          }

          return res;
        }
        if (isSupabaseConfigured) {
          throw new Error(`Gagal menyimpan booking ke server Supabase: ${error?.message || "Error"}. Data tidak tersimpan akibat masalah server.`);
        }
        console.warn("[Supabase] createBooking remote error, saving locally:", error?.message);
      } catch (err: any) {
        if (isSupabaseConfigured) {
          throw new Error(`Gagal menghubungi server Supabase saat membuat booking: ${err?.message || "Koneksi bermasalah"}.`);
        }
        console.warn("[Supabase] createBooking remote call failed, saving locally:", err?.message);
      }
    } else if (isSupabaseConfigured) {
      throw new Error("Gagal menyimpan booking: ID Pasien atau ID Cabang tidak valid (Format UUID diperlukan untuk database Supabase).");
    }

    // Save to local fallback persistence
    const existing = this.getFallbackBookings();
    const idx = existing.findIndex((b) => b.id === fallbackBooking.id);
    if (idx >= 0) existing[idx] = fallbackBooking;
    else existing.unshift(fallbackBooking);
    this.saveFallbackBookings(existing);

    return fallbackBooking;
  }

  async updateBooking(
    id: string,
    updates: Partial<Omit<Booking, "id" | "createdAt" | "updatedAt">>,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<Booking> {
    ensureSupabaseConnected();

    if (isValidUUID(id)) {
      const dbPayload: any = {
        updated_at: new Date().toISOString()
      };
      if (updates.patientId && isValidUUID(updates.patientId)) dbPayload.patient_id = updates.patientId;
      if (updates.branchId && isValidUUID(updates.branchId)) {
        if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId && updates.branchId !== userBranchId) {
          throw new Error("Branch Admin tidak dapat memindahkan booking ke cabang lain");
        }
        dbPayload.branch_id = updates.branchId;
      }
      if (updates.doctorId && isValidUUID(updates.doctorId)) dbPayload.doctor_id = updates.doctorId;
      if (updates.serviceId !== undefined && isValidUUID(updates.serviceId)) dbPayload.service_id = updates.serviceId;
      if (updates.bookingDateTime) {
        dbPayload.booking_date_time = updates.bookingDateTime;
        dbPayload.en_route_confirmed_at = null;
        dbPayload.late_checkin_requested_at = null;
      }
      if (updates.timeSlot !== undefined) dbPayload.time_slot = updates.timeSlot;
      if (updates.complaint !== undefined) dbPayload.complaint = updates.complaint;
      if (updates.notes !== undefined) dbPayload.notes = updates.notes;
      if (updates.source !== undefined) dbPayload.source = updates.source;
      if (updates.channel !== undefined) dbPayload.channel = updates.channel;
      if (updates.status) dbPayload.status = updates.status;
      if (updates.enRouteConfirmedAt !== undefined) dbPayload.en_route_confirmed_at = updates.enRouteConfirmedAt;
      if (updates.lateCheckInRequestedAt !== undefined) dbPayload.late_checkin_requested_at = updates.lateCheckInRequestedAt;
      if (updates.scheduleVerified !== undefined) dbPayload.schedule_verified = updates.scheduleVerified;
      if (updates.plannedTreatments !== undefined) dbPayload.planned_treatments = updates.plannedTreatments;
      if (updates.rescheduledFromBookingId !== undefined) dbPayload.rescheduled_from_booking_id = updates.rescheduledFromBookingId;
      if (updates.rescheduleReason !== undefined) dbPayload.reschedule_reason = updates.rescheduleReason;
      if (updates.cancellationReason !== undefined) dbPayload.cancellation_reason = updates.cancellationReason;

      try {
        const executeUpdate = async (requestPayload: any) => {
          let q = supabase.from("bookings").update(requestPayload).eq("id", id);
          if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId) {
            q = q.eq("branch_id", userBranchId);
          }
          return q.select().single();
        };

        let { data, error } = await executeUpdate(dbPayload);
        if (error && typeof error.message === "string" && /column .* does not exist|unknown column/i.test(error.message)) {
          const safePayload = { ...dbPayload };
          delete safePayload.source;
          delete safePayload.channel;
          ({ data, error } = await executeUpdate(safePayload));
        }
        if (!error && data) {
          const res = this.mapBookingFromDb(data);
          const existing = this.getFallbackBookings();
          const idx = existing.findIndex((b) => b.id === res.id);
          if (idx >= 0) existing[idx] = res;
          this.saveFallbackBookings(existing);
          return res;
        } else if (error) {
          if (isSupabaseConfigured) {
            throw new Error(`Gagal memperbarui booking di server Supabase: ${error.message}. Perubahan tidak tersimpan akibat masalah server.`);
          }
        }
      } catch (err: any) {
        if (isSupabaseConfigured) {
          throw new Error(`Gagal menghubungi server Supabase saat memperbarui booking: ${err?.message || "Koneksi bermasalah"}.`);
        }
        console.warn("[Supabase] updateBooking remote error, updating locally:", err?.message);
      }
    } else if (isSupabaseConfigured) {
      throw new Error(`ID Booking '${id}' tidak valid untuk database Supabase.`);
    }

    const existing = this.getFallbackBookings();
    const idx = existing.findIndex((b) => b.id === id);
    if (idx >= 0) {
      const scheduleChangeUpdates = updates.bookingDateTime
        ? { ...updates, enRouteConfirmedAt: null, lateCheckInRequestedAt: null }
        : updates;
      existing[idx] = { ...existing[idx], ...scheduleChangeUpdates, updatedAt: new Date().toISOString() };
      this.saveFallbackBookings(existing);
      return existing[idx];
    }

    throw new Error("Booking tidak ditemukan.");
  }

  async cancelBooking(id: string, currentUserRole?: UserRole, userBranchId?: string | null): Promise<Booking> {
    return this.updateBooking(id, { status: BookingStatus.CANCELLED }, currentUserRole, userBranchId);
  }
}

// =====================================================================
// 8. SUPABASE H-1 CONFIRMATION REPOSITORY
// =====================================================================
export class SupabaseH1ConfirmationRepository implements H1ConfirmationRepository {
  private getFallbackH1(): BookingConfirmationH1[] {
    if (!useRepositoryTestFallbacks()) return [];
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("lala_h1_confirmations");
        if (stored) return JSON.parse(stored);
      } catch (e) {
        console.warn("Error loading H-1 confirmations from localStorage:", e);
      }
    }
    return [];
  }

  private saveFallbackH1(items: BookingConfirmationH1[]): void {
    if (!useRepositoryTestFallbacks()) return;
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("lala_h1_confirmations", JSON.stringify(items));
      } catch (e) {
        console.warn("Error saving H-1 confirmations to localStorage:", e);
      }
    }
  }

  private mapH1FromDb(row: any): BookingConfirmationH1 {
    return {
      id: row.id || `h1-${row.booking_id}`,
      bookingId: row.booking_id,
      confirmationStatus: row.confirmation_status,
      status: row.confirmation_status,
      contactedAt: row.contacted_at,
      confirmedAt: row.confirmed_at,
      staffId: row.staff_id,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  async getH1Confirmation(bookingId: string): Promise<BookingConfirmationH1 | null> {
    ensureSupabaseConnected();
    if (isValidUUID(bookingId)) {
      try {
        const { data, error } = await supabase.from("booking_confirmations_h1").select("*").eq("booking_id", bookingId).single();
        if (!error && data) return this.mapH1FromDb(data);
      } catch (e) {
        console.warn("[Supabase] getH1Confirmation remote error:", e);
      }
    }
    const fallback = this.getFallbackH1();
    return fallback.find((h) => h.bookingId === bookingId) || null;
  }

  async listH1Confirmations(branchId?: string, currentUserRole?: UserRole, userBranchId?: string | null): Promise<BookingConfirmationH1[]> {
    ensureSupabaseConnected();
    let remoteItems: BookingConfirmationH1[] = [];
    try {
      let q = supabase.from("booking_confirmations_h1").select("*");
      const effBranch = (currentUserRole === UserRole.BRANCH_ADMIN || currentUserRole === UserRole.DOCTOR_ASSISTANT) && userBranchId ? userBranchId : branchId;
      if (effBranch && isValidUUID(effBranch)) {
        q = q.eq("branch_id", effBranch);
      }
      const { data, error } = await q.order("created_at", { ascending: false });
      if (!error && data) {
        remoteItems = data.map(this.mapH1FromDb);
      }
    } catch (e) {
      console.warn("[Supabase] listH1Confirmations remote error:", e);
    }

    const fallback = this.getFallbackH1();
    const remoteIds = new Set(remoteItems.map((h) => h.bookingId));
    const localOnly = fallback.filter((h) => !remoteIds.has(h.bookingId));
    return [...remoteItems, ...localOnly];
  }

  async createOrInitializeH1Confirmation(bookingId: string, staffId?: string): Promise<BookingConfirmationH1> {
    ensureSupabaseConnected();
    const existing = await this.getH1Confirmation(bookingId);
    if (existing) return existing;

    let branchId = "00000000-0000-0000-0000-000000000000";
    try {
      const { data: booking } = await supabase.from("bookings").select("branch_id").eq("id", bookingId).maybeSingle();
      if (booking?.branch_id) branchId = booking.branch_id;
    } catch {
      // ignore
    }

    const now = new Date().toISOString();
    const fallbackItem: BookingConfirmationH1 = {
      id: `h1-${bookingId}`,
      bookingId,
      confirmationStatus: ConfirmationStatusH1.BELUM_DIHUBUNGI,
      status: ConfirmationStatusH1.BELUM_DIHUBUNGI,
      staffId: staffId || undefined,
      createdAt: now,
      updatedAt: now
    };

    if (isValidUUID(bookingId) && isValidUUID(branchId)) {
      try {
        const payload: any = {
          booking_id: bookingId,
          branch_id: branchId,
          confirmation_status: ConfirmationStatusH1.BELUM_DIHUBUNGI
        };
        if (staffId && isValidUUID(staffId)) payload.staff_id = staffId;

        const { data, error } = await supabase.from("booking_confirmations_h1").insert(payload).select().single();
        if (!error && data) {
          const res = this.mapH1FromDb(data);
          const existingList = this.getFallbackH1();
          const idx = existingList.findIndex((h) => h.bookingId === res.bookingId);
          if (idx >= 0) existingList[idx] = res;
          else existingList.unshift(res);
          this.saveFallbackH1(existingList);
          return res;
        }
        if (!useRepositoryTestFallbacks()) {
          throw new Error(`Gagal menyimpan konfirmasi booking di Supabase: ${error?.message || "Error tidak diketahui"}`);
        }
      } catch (err: any) {
        if (!useRepositoryTestFallbacks()) throw err;
      }
    }

    if (!useRepositoryTestFallbacks()) {
      throw new Error("Konfirmasi booking tidak tersimpan ke Supabase.");
    }
    const existingList = this.getFallbackH1();
    const idx = existingList.findIndex((h) => h.bookingId === fallbackItem.bookingId);
    if (idx >= 0) existingList[idx] = fallbackItem;
    else existingList.unshift(fallbackItem);
    this.saveFallbackH1(existingList);

    return fallbackItem;
  }

  async updateH1Confirmation(
    bookingId: string,
    updates: Partial<Omit<BookingConfirmationH1, "id" | "bookingId" | "createdAt" | "updatedAt">>,
    staffId?: string
  ): Promise<BookingConfirmationH1> {
    ensureSupabaseConnected();
    const now = new Date().toISOString();

    if (isValidUUID(bookingId)) {
      const payload: any = {
        updated_at: now
      };
      if (updates.confirmationStatus) payload.confirmation_status = updates.confirmationStatus;
      if (updates.contactedAt !== undefined) payload.contacted_at = updates.contactedAt;
      if (updates.confirmedAt !== undefined) payload.confirmed_at = updates.confirmedAt;
      if (updates.notes !== undefined) payload.notes = updates.notes;
      if (staffId && isValidUUID(staffId)) payload.staff_id = staffId;

      try {
        const { data, error } = await supabase.from("booking_confirmations_h1").update(payload).eq("booking_id", bookingId).select().single();
        if (!error && data) {
          const res = this.mapH1FromDb(data);
          const existingList = this.getFallbackH1();
          const idx = existingList.findIndex((h) => h.bookingId === res.bookingId);
          if (idx >= 0) existingList[idx] = res;
          else existingList.unshift(res);
          this.saveFallbackH1(existingList);
          return res;
        }
        console.warn("[Supabase] updateH1Confirmation remote error, updating locally:", error?.message);
      } catch (err: any) {
        console.warn("[Supabase] updateH1Confirmation remote call failed, updating locally:", err?.message);
      }
    }

    const existingList = this.getFallbackH1();
    let item = existingList.find((h) => h.bookingId === bookingId);
    if (!item) {
      item = {
        id: `h1-${bookingId}`,
        bookingId,
        confirmationStatus: updates.confirmationStatus || ConfirmationStatusH1.BELUM_DIHUBUNGI,
        status: updates.confirmationStatus || ConfirmationStatusH1.BELUM_DIHUBUNGI,
        contactedAt: updates.contactedAt,
        confirmedAt: updates.confirmedAt,
        notes: updates.notes,
        createdAt: now,
        updatedAt: now
      };
      existingList.unshift(item);
    } else {
      item.confirmationStatus = updates.confirmationStatus || item.confirmationStatus;
      item.status = item.confirmationStatus;
      if (updates.contactedAt !== undefined) item.contactedAt = updates.contactedAt;
      if (updates.confirmedAt !== undefined) item.confirmedAt = updates.confirmedAt;
      if (updates.notes !== undefined) item.notes = updates.notes;
      item.updatedAt = now;
    }
    this.saveFallbackH1(existingList);
    return item;
  }
}

// =====================================================================
// 9. SUPABASE VISIT REPOSITORY
// =====================================================================
export class SupabaseVisitRepository implements VisitRepository {
  private getFallbackVisits(): PatientVisit[] {
    if (!useRepositoryTestFallbacks()) return [];
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("lala_visits");
        if (stored) return JSON.parse(stored);
      } catch (e) {
        console.warn("Error loading visits from localStorage:", e);
      }
    }
    return [];
  }

  private saveFallbackVisits(visits: PatientVisit[]): void {
    if (!useRepositoryTestFallbacks()) return;
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("lala_visits", JSON.stringify(visits));
      } catch (e) {
        console.warn("Error saving visits to localStorage:", e);
      }
    }
  }

  private mapVisitFromDb(row: any): PatientVisit {
    return {
      id: row.id,
      visitNumber: row.visit_number ?? undefined,
      patientId: row.patient_id,
      branchId: row.branch_id,
      visitDateTime: row.visit_date_time,
      visitType: row.visit_type,
      visitStatus: row.visit_status,
      bookingId: row.booking_id ?? null,
      plannedTreatments: Array.isArray(row.planned_treatments) ? row.planned_treatments : [],
      complaint: row.complaint ?? undefined,
      doctorId: row.doctor_id ?? undefined,
      externalDoctorId: row.external_doctor_id ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  async getVisits(): Promise<PatientVisit[]> {
    ensureSupabaseConnected();
    const { data, error } = await supabase
      .from("patient_visits")
      .select("*")
      .order("visit_date_time", { ascending: false });
    if (error) throw new Error(`Gagal memuat data kunjungan pasien: ${error.message}`);
    const remoteVisits = (data || []).map(this.mapVisitFromDb);

    const fallback = this.getFallbackVisits();
    const remoteIds = new Set(remoteVisits.map((v) => v.id));
    const localOnly = fallback.filter((v) => !remoteIds.has(v.id));
    return [...remoteVisits, ...localOnly];
  }

  async getVisitAnalyticsRecords(): Promise<PatientVisitAnalyticsRecord[]> {
    ensureSupabaseConnected();
    const pageSize = 1000;
    const records: PatientVisitAnalyticsRecord[] = [];
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase
        .from("patient_visits")
        .select("patient_id, visit_date_time, visit_status")
        .order("visit_date_time", { ascending: true })
        .range(offset, offset + pageSize - 1);
      if (error) throw new Error(`Gagal memuat data analisa kunjungan pasien: ${error.message}`);
      const page = data || [];
      records.push(...page.map((row: any) => ({
        patientId: row.patient_id,
        visitDateTime: row.visit_date_time,
        visitStatus: row.visit_status
      })));
      if (page.length < pageSize) break;
    }
    return records;
  }

  async getVisitById(id: string): Promise<PatientVisit | null> {
    ensureSupabaseConnected();
    if (isValidUUID(id)) {
      const { data, error } = await supabase.from("patient_visits").select("*").eq("id", id).maybeSingle();
      if (error) return handleSupabaseReadError("patient_visits", error, null);
      if (data) return this.mapVisitFromDb(data);
    } else if (!useRepositoryTestFallbacks()) {
      throw new Error("ID kunjungan tidak valid untuk database Supabase.");
    }
    if (!useRepositoryTestFallbacks()) return null;
    const fallback = this.getFallbackVisits();
    return fallback.find((v) => v.id === id) || null;
  }

  async getVisitsByPatient(patientId: string): Promise<PatientVisit[]> {
    ensureSupabaseConnected();
    if (useRepositoryTestFallbacks()) {
      return this.getFallbackVisits().filter((visit) => visit.patientId === patientId);
    }
    if (!isValidUUID(patientId)) {
      throw new Error("ID pasien tidak valid untuk memuat riwayat kunjungan.");
    }
    const { data, error } = await supabase
      .from("patient_visits")
      .select("id, visit_number, patient_id, branch_id, visit_date_time, visit_type, visit_status, booking_id, complaint, doctor_id, created_at, updated_at")
      .eq("patient_id", patientId)
      .order("visit_date_time", { ascending: false });
    if (error) throw new Error(`Gagal memuat riwayat kunjungan pasien: ${error.message}`);
    return (data || []).map(this.mapVisitFromDb);
  }

  async getVisitsByBranch(branchId: string, currentUserRole?: UserRole, userBranchId?: string | null): Promise<PatientVisit[]> {
    const all = await this.getVisits();
    const effBranch = (currentUserRole === UserRole.BRANCH_ADMIN || currentUserRole === UserRole.DOCTOR_ASSISTANT) && userBranchId ? userBranchId : branchId;
    return all.filter((v) => isBranchMatch(v.branchId, effBranch));
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
    ensureSupabaseConnected();
    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId && !isBranchMatch(visitData.branchId, userBranchId)) {
      throw new Error("Branch Admin tidak dapat membuat visit untuk cabang lain");
    }

    const visitId = visitData.id || (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `vst-${Date.now()}`);
    const now = new Date().toISOString();

    if (visitData.visitType === VisitType.BOOKING && visitData.bookingId) {
      const existingLocal = this.getFallbackVisits().find(
        (v) =>
          v.bookingId === visitData.bookingId &&
          v.patientId === visitData.patientId &&
          v.branchId === visitData.branchId &&
          v.visitType === VisitType.BOOKING &&
          v.visitStatus !== VisitStatus.CANCELLED
      );
      if (existingLocal) {
        return existingLocal;
      }
    }

    const fallbackVisit: PatientVisit = {
      id: visitId,
      patientId: visitData.patientId,
      branchId: visitData.branchId,
      visitDateTime: visitData.visitDateTime || now,
      visitType: visitData.visitType,
      visitStatus: visitData.visitStatus || VisitStatus.WAITING,
      bookingId: visitData.bookingId || null,
      complaint: visitData.complaint || "",
      doctorId: visitData.doctorId,
      plannedTreatments: visitData.plannedTreatments || [],
      createdAt: now,
      updatedAt: now
    };

    if (isValidUUID(visitData.patientId) && isValidUUID(visitData.branchId)) {
      const payload: any = {
        patient_id: visitData.patientId,
        branch_id: visitData.branchId,
        visit_date_time: visitData.visitDateTime || now,
        visit_type: visitData.visitType,
        visit_status: visitData.visitStatus || VisitStatus.WAITING,
        complaint: visitData.complaint || null,
        planned_treatments: visitData.plannedTreatments || []
      };
      if (visitData.bookingId && isValidUUID(visitData.bookingId)) payload.booking_id = visitData.bookingId;
      if (visitData.doctorId && isValidUUID(visitData.doctorId)) payload.doctor_id = visitData.doctorId;
      if (isValidUUID(visitId)) payload.id = visitId;

      try {
        if (visitData.visitType === VisitType.BOOKING && visitData.bookingId && isValidUUID(visitData.bookingId)) {
          const { data: duplicateData, error: duplicateError } = await supabase
            .from("patient_visits")
            .select()
            .eq("booking_id", visitData.bookingId)
            .eq("patient_id", visitData.patientId)
            .eq("branch_id", visitData.branchId)
            .neq("visit_status", VisitStatus.CANCELLED)
            .limit(1);

          if (!duplicateError && duplicateData && duplicateData.length > 0) {
            const existingDuplicate = this.mapVisitFromDb(duplicateData[0]);
            const existing = this.getFallbackVisits();
            const idx = existing.findIndex((v) => v.id === existingDuplicate.id);
            if (idx >= 0) existing[idx] = existingDuplicate;
            else existing.unshift(existingDuplicate);
            this.saveFallbackVisits(existing);
            return existingDuplicate;
          }
        }

        const { data, error } = await supabase.from("patient_visits").insert(payload).select().single();
        if (!error && data) {
          const res = this.mapVisitFromDb(data);
          const existing = this.getFallbackVisits();
          const idx = existing.findIndex((v) => v.id === res.id);
          if (idx >= 0) existing[idx] = res;
          else existing.unshift(res);
          this.saveFallbackVisits(existing);
          return res;
        }
        if (!useRepositoryTestFallbacks()) {
          throw new Error(`Gagal menyimpan kunjungan ke Supabase: ${error?.message || "Error tidak diketahui"}`);
        }
      } catch (err: any) {
        if (!useRepositoryTestFallbacks()) throw err;
      }
    } else {
      if (!useRepositoryTestFallbacks()) {
        throw new Error("Kunjungan tidak dapat disimpan: ID pasien dan cabang harus berasal dari Supabase.");
      }
    }

    if (!useRepositoryTestFallbacks()) {
      throw new Error("Kunjungan tidak tersimpan ke Supabase.");
    }
    const existing = this.getFallbackVisits();
    const idx = existing.findIndex((v) => v.id === fallbackVisit.id);
    if (idx >= 0) existing[idx] = fallbackVisit;
    else existing.unshift(fallbackVisit);
    this.saveFallbackVisits(existing);

    return fallbackVisit;
  }

  async updateVisitStatus(
    id: string,
    status: VisitStatus,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<PatientVisit> {
    ensureSupabaseConnected();
    if (isValidUUID(id)) {
      try {
        let q = supabase.from("patient_visits").update({ visit_status: status, updated_at: new Date().toISOString() }).eq("id", id);
        if ((currentUserRole === UserRole.BRANCH_ADMIN || currentUserRole === UserRole.DOCTOR_ASSISTANT) && userBranchId && isValidUUID(userBranchId)) {
          q = q.eq("branch_id", userBranchId);
        }
        const { data, error } = await q.select().single();
        if (!error && data) {
          const res = this.mapVisitFromDb(data);
          const existing = this.getFallbackVisits();
          const idx = existing.findIndex((v) => v.id === res.id);
          if (idx >= 0) existing[idx] = res;
          this.saveFallbackVisits(existing);
          return res;
        }
      } catch (e: any) {
        console.warn("[Supabase] updateVisitStatus remote error, updating locally:", e?.message);
      }
    }

    const existing = this.getFallbackVisits();
    const idx = existing.findIndex((v) => v.id === id);
    if (idx >= 0) {
      existing[idx] = { ...existing[idx], visitStatus: status, updatedAt: new Date().toISOString() };
      this.saveFallbackVisits(existing);
      return existing[idx];
    }

    throw new Error("Kunjungan (Visit) tidak ditemukan.");
  }
}

// =====================================================================
// 10. SUPABASE TREATMENT REPOSITORY
// =====================================================================
export class SupabaseTreatmentRepository implements TreatmentRepository {
  private mapTreatmentFromDb(row: any): TreatmentJob {
    return {
      id: row.id,
      visitId: row.visit_id,
      patientId: row.patient_id,
      branchId: row.branch_id,
      doctorId: row.doctor_id,
      externalDoctorId: row.external_doctor_id ?? null,
      serviceId: row.service_id,
      status: row.status as TreatmentJobStatus,
      serviceNameSnapshot: row.service_name_snapshot,
      doctorNameSnapshot: row.doctor_name_snapshot,
      priceSnapshot: row.price_snapshot == null ? undefined : Number(row.price_snapshot),
      estimatedDurationMinutes: row.estimated_duration_minutes,
      notes: row.notes ?? undefined,
      assignedDoctorId: row.assigned_doctor_id ?? undefined,
      picAssistantId: row.pic_assistant_id ?? undefined,
      startedAt: row.started_at ?? undefined,
      completedAt: row.completed_at ?? undefined,
      handedOverAt: row.handed_over_at ?? undefined,
      returnedAt: row.returned_at ?? undefined,
      returnReason: row.return_reason ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  async getTreatmentJobs(): Promise<TreatmentJob[]> {
    ensureSupabaseConnected();
    const { data, error } = await supabase.from("treatment_jobs").select("*").order("created_at", { ascending: false });
    if (error) return handleSupabaseReadError("treatment_jobs", error, []);
    return (data || []).map(this.mapTreatmentFromDb);
  }

  async getTreatmentJobById(id: string): Promise<TreatmentJob | null> {
    return this.getTreatmentById(id);
  }

  async getTreatmentsByVisit(visitId: string): Promise<TreatmentJob[]> {
    ensureSupabaseConnected();
    if (!isValidUUID(visitId)) return [];
    const { data, error } = await supabase.from("treatment_jobs").select("*").eq("visit_id", visitId).order("created_at");
    if (error) return handleSupabaseReadError("treatment_jobs", error, []);
    return (data || []).map(this.mapTreatmentFromDb);
  }

  async listTreatments(currentUserRole?: UserRole, userBranchId?: string | null, currentUserId?: string | null): Promise<TreatmentJob[]> {
    ensureSupabaseConnected();
    let q = supabase.from("treatment_jobs").select("*").order("created_at", { ascending: false });
    if ((currentUserRole === UserRole.BRANCH_ADMIN || currentUserRole === UserRole.DOCTOR_ASSISTANT) && userBranchId && isValidUUID(userBranchId)) {
      q = q.eq("branch_id", userBranchId);
    }
    if (currentUserRole === UserRole.DOCTOR && currentUserId && isValidUUID(currentUserId)) {
      q = q.or(`doctor_id.eq.${currentUserId},assigned_doctor_id.eq.${currentUserId}`);
    }
    const { data, error } = await q;
    if (error) return handleSupabaseReadError("treatment_jobs", error, []);
    return (data || []).map(this.mapTreatmentFromDb);
  }

  async getTreatmentById(id: string, currentUserRole?: UserRole, userBranchId?: string | null, currentUserId?: string | null): Promise<TreatmentJob | null> {
    ensureSupabaseConnected();
    if (!isValidUUID(id)) return null;
    let q = supabase.from("treatment_jobs").select("*").eq("id", id);
    if ((currentUserRole === UserRole.BRANCH_ADMIN || currentUserRole === UserRole.DOCTOR_ASSISTANT) && userBranchId && isValidUUID(userBranchId)) {
      q = q.eq("branch_id", userBranchId);
    }
    if (currentUserRole === UserRole.DOCTOR && currentUserId && isValidUUID(currentUserId)) {
      q = q.or(`doctor_id.eq.${currentUserId},assigned_doctor_id.eq.${currentUserId}`);
    }
    const { data, error } = await q.single();
    if (error) return handleSupabaseReadError("treatment_jobs", error, null);
    return data ? this.mapTreatmentFromDb(data) : null;
  }

  async listTreatmentsByVisit(visitId: string, currentUserRole?: UserRole, userBranchId?: string | null, currentUserId?: string | null): Promise<TreatmentJob[]> {
    return this.getTreatmentsByVisit(visitId);
  }

  async listTreatmentsByBranch(branchId: string, currentUserRole?: UserRole, userBranchId?: string | null, currentUserId?: string | null): Promise<TreatmentJob[]> {
    ensureSupabaseConnected();
    const effBranch = (currentUserRole === UserRole.BRANCH_ADMIN || currentUserRole === UserRole.DOCTOR_ASSISTANT) && userBranchId ? userBranchId : branchId;
    if (!isValidUUID(effBranch)) return [];

    const { data, error } = await supabase.from("treatment_jobs").select("*").eq("branch_id", effBranch).order("created_at", { ascending: false });
    if (error) return handleSupabaseReadError("treatment_jobs", error, []);
    return (data || []).map(this.mapTreatmentFromDb);
  }

  async createTreatmentJob(
    data: {
      visitId: string;
      serviceId: string;
      doctorId: string;
      externalDoctorId?: string | null;
      priceSnapshot?: number;
      estimatedDurationMinutes?: number;
      notes?: string;
      customId?: string;
      branchId?: string;
      patientId?: string;
    },
    currentUserRole?: UserRole,
    userBranchId?: string | null,
    _currentUserId?: string | null
  ): Promise<TreatmentJob> {
    ensureSupabaseConnected();

    // Look up visit to ensure valid branch & patient
    const { data: visit, error: vErr } = await supabase
      .from("patient_visits")
      .select("branch_id, patient_id, doctor_id, external_doctor_id")
      .eq("id", data.visitId)
      .single();
    if (vErr || !visit) throw new Error("Visit tidak ditemukan");

    const branchToUse = data.branchId || visit.branch_id;
    const patientToUse = data.patientId || visit.patient_id;
    const externalDoctorId = data.externalDoctorId ?? visit.external_doctor_id ?? null;
    if (externalDoctorId !== (visit.external_doctor_id ?? null)) {
      throw new Error("Identitas dokter eksternal harus sesuai dengan penugasan pada kunjungan.");
    }
    if (externalDoctorId && currentUserRole === UserRole.DOCTOR) {
      throw new Error("Tindakan dokter eksternal harus dicatat oleh petugas klinik yang berwenang.");
    }
    if (externalDoctorId && currentUserRole !== UserRole.SUPER_ADMIN) {
      throw new Error("Hanya Super Admin yang dapat membuat tindakan untuk dokter eksternal.");
    }
    if (externalDoctorId && data.doctorId !== visit.doctor_id) {
      throw new Error("Dokter referensi tindakan tidak sesuai dengan dokter asal kunjungan.");
    }

    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId && !isBranchMatch(branchToUse, userBranchId)) {
      throw new Error("Branch Admin tidak dapat membuat treatment untuk cabang lain");
    }

    // Look up service and doctor snapshots
    const { data: srv, error: serviceError } = await supabase
      .from("master_services")
      .select("name, base_price, estimated_duration_minutes")
      .eq("id", data.serviceId)
      .single();
    if (serviceError || !srv) {
      throw new Error(`Layanan tindakan tidak ditemukan di Supabase: ${serviceError?.message || data.serviceId}`);
    }
    let doctorName: string;
    if (externalDoctorId) {
      const { data: externalDoctor, error: doctorError } = await supabase
        .from("external_doctor_recipients")
        .select("full_name")
        .eq("id", externalDoctorId)
        .single();
      if (doctorError || !externalDoctor) {
        throw new Error(`Dokter eksternal tidak ditemukan di Supabase: ${doctorError?.message || externalDoctorId}`);
      }
      doctorName = externalDoctor.full_name;
    } else {
      const { data: doctor, error: doctorError } = await supabase
        .from("dental_doctors")
        .select("name")
        .eq("id", data.doctorId)
        .single();
      if (doctorError || !doctor) {
        throw new Error(`Dokter penanggung jawab tidak ditemukan di Supabase: ${doctorError?.message || data.doctorId}`);
      }
      doctorName = doctor.name;
    }

    const serviceName = srv.name;
    const estDur = data.estimatedDurationMinutes || srv.estimated_duration_minutes || 30;
    if (data.priceSnapshot !== undefined && currentUserRole !== UserRole.DOCTOR) {
      throw new Error("Hanya dokter yang dapat menyesuaikan harga tindakan.");
    }
    if (data.priceSnapshot !== undefined && (!Number.isSafeInteger(data.priceSnapshot) || data.priceSnapshot < 0)) {
      throw new Error("Harga tindakan harus berupa angka Rupiah bulat dan tidak boleh negatif.");
    }
    const { data: tariff, error: tariffError } = await supabase
      .from("branch_service_tariffs")
      .select("custom_price")
      .eq("branch_id", branchToUse)
      .eq("service_id", data.serviceId)
      .eq("is_active", true)
      .maybeSingle();
    if (tariffError) throw new Error(`Gagal memuat tarif cabang: ${tariffError.message}`);

    const payload: any = {
      visit_id: data.visitId,
      patient_id: patientToUse,
      branch_id: branchToUse,
      doctor_id: data.doctorId,
      external_doctor_id: externalDoctorId,
      service_id: data.serviceId,
      status: TreatmentJobStatus.BELUM_DIMULAI,
      service_name_snapshot: serviceName,
      doctor_name_snapshot: doctorName,
      price_snapshot: data.priceSnapshot ?? Number(tariff?.custom_price ?? srv.base_price),
      estimated_duration_minutes: estDur,
      notes: data.notes || null
    };
    if (data.customId) payload.id = data.customId;

    const { data: created, error } = await supabase.from("treatment_jobs").insert(payload).select().single();
    if (error) throw new Error(`Supabase error: ${error.message}`);
    return this.mapTreatmentFromDb(created);
  }

  async startTreatmentJob(
    id: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null,
    currentUserId?: string | null,
    actorData?: { actorId?: string; actorRole?: UserRole; actorNameSnapshot?: string; notes?: string }
  ): Promise<TreatmentJob> {
    ensureSupabaseConnected();
    if (currentUserRole === UserRole.DOCTOR_ASSISTANT || currentUserRole === UserRole.SUPER_ADMIN) {
      const { data, error } = await supabase.rpc("start_treatment_job_secure", {
        p_treatment_id: id,
        p_notes: actorData?.notes || "Memulai tindakan medis"
      });
      if (error) throw new Error(`Supabase error: ${error.message}`);
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) throw new Error("Gagal memulai treatment: data tidak ditemukan");
      return this.mapTreatmentFromDb(row);
    }

    const now = new Date().toISOString();
    const q = supabase.from("treatment_jobs").update({
      status: TreatmentJobStatus.DALAM_PROSES,
      started_at: now,
      updated_at: now
    }).eq("id", id);

    const { data, error } = await q.select().single();
    if (error) throw new Error(`Supabase error: ${error.message}`);

    if (actorData) {
      const { error: activityError } = await supabase.from("treatment_activities").insert({
        treatment_id: id,
        actor_id: actorData.actorId || currentUserId || data.doctor_id,
        actor_role: actorData.actorRole || currentUserRole || "DOCTOR",
        actor_name_snapshot: actorData.actorNameSnapshot || "Petugas Medis",
        activity_type: "STARTED",
        branch_id: data.branch_id,
        notes: actorData.notes || null
      });
      if (activityError) {
        throw new Error(`Treatment sudah dimulai, tetapi gagal mencatat aktivitas: ${activityError.message}`);
      }
    }

    return this.mapTreatmentFromDb(data);
  }

  async completeTreatmentJob(
    id: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null,
    currentUserId?: string | null,
    actorData?: { actorId?: string; actorRole?: UserRole; actorNameSnapshot?: string; notes?: string }
  ): Promise<TreatmentJob> {
    ensureSupabaseConnected();
    if (currentUserRole && currentUserRole !== UserRole.DOCTOR) {
      if (currentUserRole !== UserRole.DOCTOR_ASSISTANT && currentUserRole !== UserRole.SUPER_ADMIN) {
        throw new Error("Hanya Dokter atau petugas berwenang pada tindakan dokter eksternal yang dapat menyelesaikan tindakan.");
      }
      const { data: treatment, error: treatmentError } = await supabase
        .from("treatment_jobs")
        .select("external_doctor_id")
        .eq("id", id)
        .single();
      if (treatmentError || !treatment) {
        throw new Error(`Gagal memeriksa penugasan dokter tindakan: ${treatmentError?.message || id}`);
      }
      if (!treatment.external_doctor_id) {
        throw new Error("Hanya Dokter yang dapat menyelesaikan tindakan medis biasa.");
      }
    }

    const { data, error } = await supabase.rpc("complete_treatment_job_secure", {
      p_treatment_id: id,
      p_notes: actorData?.notes || "Penyelesaian tindakan medis"
    });
    if (error) throw new Error(`Supabase error: ${error.message}`);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new Error("Gagal menyelesaikan treatment: data tidak ditemukan");
    return this.mapTreatmentFromDb(row);
  }

  async handOverTreatmentJob(
    id: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null,
    currentUserId?: string | null,
    actorData?: { actorId?: string; actorRole?: UserRole; actorNameSnapshot?: string; notes?: string }
  ): Promise<TreatmentJob> {
    ensureSupabaseConnected();
    if (currentUserRole && currentUserRole !== UserRole.DOCTOR) {
      if (currentUserRole !== UserRole.DOCTOR_ASSISTANT && currentUserRole !== UserRole.SUPER_ADMIN) {
        throw new Error("Role tidak memiliki izin menyerahkan tindakan ke kasir.");
      }
      const { data: treatment, error: treatmentError } = await supabase
        .from("treatment_jobs")
        .select("external_doctor_id")
        .eq("id", id)
        .single();
      if (treatmentError || !treatment) {
        throw new Error(`Gagal memeriksa penugasan dokter tindakan: ${treatmentError?.message || id}`);
      }
      if (!treatment.external_doctor_id) {
        throw new Error("Hanya Dokter yang dapat menyerahkan tindakan biasa ke kasir.");
      }
    }

    const { data, error } = await supabase.rpc("hand_over_treatment_job_secure", {
      p_treatment_id: id,
      p_notes: actorData?.notes || "Tindakan medis diserahkan"
    });
    if (error) throw new Error(`Supabase error: ${error.message}`);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new Error("Gagal menyerahkan treatment: data tidak ditemukan");
    return this.mapTreatmentFromDb(row);
  }

  async returnTreatmentToDoctor(
    id: string,
    reason: string
  ): Promise<TreatmentJob> {
    ensureSupabaseConnected();
    const normalizedReason = reason.trim();
    if (!normalizedReason) throw new Error("Alasan pengembalian wajib diisi.");
    const { data, error } = await supabase.rpc("return_treatment_to_doctor_secure", {
      p_treatment_id: id,
      p_reason: normalizedReason
    });
    if (error) throw new Error(`Gagal mengembalikan tindakan ke dokter: ${error.message}`);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new Error("Gagal mengembalikan tindakan: data tidak ditemukan");
    return this.mapTreatmentFromDb(row);
  }

  async resubmitTreatmentToCashier(id: string, correctedNotes: string): Promise<TreatmentJob> {
    ensureSupabaseConnected();
    const normalizedNotes = correctedNotes.trim();
    if (!normalizedNotes) throw new Error("Catatan tindakan yang sudah dikoreksi wajib diisi.");
    const { data, error } = await supabase.rpc("resubmit_treatment_to_cashier_secure", {
      p_treatment_id: id,
      p_corrected_notes: normalizedNotes
    });
    if (error) throw new Error(`Gagal menyerahkan ulang tindakan ke kasir: ${error.message}`);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new Error("Gagal menyerahkan ulang tindakan: data tidak ditemukan");
    return this.mapTreatmentFromDb(row);
  }
}

// =====================================================================
// 11. SUPABASE TREATMENT ACTIVITY REPOSITORY
// =====================================================================
export class SupabaseTreatmentActivityRepository implements TreatmentActivityRepository {
  private mapActivityFromDb(row: any): TreatmentActivity {
    return {
      id: row.id,
      treatmentId: row.treatment_id,
      actorId: row.actor_id,
      actorRole: row.actor_role as UserRole,
      actorNameSnapshot: row.actor_name_snapshot,
      activityType: row.activity_type as TreatmentActivityType,
      timestamp: row.activity_at || row.created_at,
      activityAt: row.activity_at || row.created_at || new Date().toISOString(),
      branchId: row.branch_id,
      notes: row.notes ?? undefined
    };
  }

  async listActivitiesByTreatment(treatmentId: string): Promise<TreatmentActivity[]> {
    ensureSupabaseConnected();
    const { data, error } = await supabase
      .from("treatment_activities")
      .select("*")
      .eq("treatment_id", treatmentId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(`Supabase error: ${error.message}`);
    return (data || []).map(this.mapActivityFromDb);
  }

  async getActivityById(activityId: string): Promise<TreatmentActivity | null> {
    ensureSupabaseConnected();
    const { data, error } = await supabase.from("treatment_activities").select("*").eq("id", activityId).single();
    if (error) {
      if (error.code === "PGRST116") return null;
      throw new Error(`Supabase error: ${error.message}`);
    }
    return data ? this.mapActivityFromDb(data) : null;
  }

  async addActivity(data: {
    treatmentId: string;
    actorId: string;
    actorRole: UserRole;
    actorNameSnapshot?: string;
    activityType: TreatmentActivityType;
    branchId?: string;
    notes?: string;
  }): Promise<TreatmentActivity> {
    ensureSupabaseConnected();
    const { data: treatment, error: treatmentError } = await supabase
      .from("treatment_jobs")
      .select("branch_id")
      .eq("id", data.treatmentId)
      .single();
    if (treatmentError) throw new Error(`Gagal memverifikasi cabang tindakan: ${treatmentError.message}`);
    if (data.branchId && data.branchId !== treatment.branch_id) {
      throw new Error("Cabang catatan tindakan tidak sesuai dengan cabang treatment.");
    }

    const { data: created, error } = await supabase.from("treatment_activities").insert({
      treatment_id: data.treatmentId,
      actor_id: data.actorId,
      actor_role: data.actorRole,
      actor_name_snapshot: data.actorNameSnapshot || "Petugas Medis",
      activity_type: data.activityType,
      branch_id: treatment.branch_id,
      notes: data.notes || null
    }).select().single();
    if (error) throw new Error(`Supabase error: ${error.message}`);
    return this.mapActivityFromDb(created);
  }
}

// =====================================================================
// 12. SUPABASE INVOICE REPOSITORY
// =====================================================================
export class SupabaseInvoiceRepository implements InvoiceRepository {
  private getFallbackInvoices(): Invoice[] {
    if (!useRepositoryTestFallbacks()) return [];
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("lala_invoices");
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
        }
      } catch (e) {
        console.warn("Error loading invoices from localStorage:", e);
      }
    }
    return [...MOCK_INVOICES];
  }

  private saveFallbackInvoices(items: Invoice[]): void {
    if (!useRepositoryTestFallbacks()) return;
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("lala_invoices", JSON.stringify(items));
      } catch (e) {
        console.warn("Error saving invoices to localStorage:", e);
      }
    }
  }

  private getFallbackInvoiceItems(): InvoiceItem[] {
    if (!useRepositoryTestFallbacks()) return [];
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("lala_invoice_items");
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
        }
      } catch (e) {
        console.warn("Error loading invoice items from localStorage:", e);
      }
    }
    return [...MOCK_INVOICE_ITEMS];
  }

  private saveFallbackInvoiceItems(items: InvoiceItem[]): void {
    if (!useRepositoryTestFallbacks()) return;
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("lala_invoice_items", JSON.stringify(items));
      } catch (e) {
        console.warn("Error saving invoice items to localStorage:", e);
      }
    }
  }

  private mapInvoiceFromDb(row: any): Invoice {
    return {
      id: row.id,
      invoiceNumber: row.invoice_number,
      visitId: row.visit_id,
      visitNumber: row.visit_number ?? undefined,
      patientId: row.patient_id,
      branchId: row.branch_id,
      totalAmount: Number(row.total_amount || 0),
      discountAmount: Number(row.discount_amount || 0),
      taxAmount: Number(row.tax_amount || 0),
      netAmount: Number(row.net_amount || 0),
      paidAmount: Number(row.paid_amount || 0),
      outstandingAmount: Number(row.outstanding_amount || 0),
      status: row.status as InvoiceStatus,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private mapInvoiceItemFromDb(row: any): InvoiceItem {
    return {
      id: row.id,
      invoiceId: row.invoice_id,
      serviceId: row.service_id ?? undefined,
      treatmentJobId: row.treatment_job_id ?? undefined,
      descriptionSnapshot: row.description_snapshot,
      unitPriceSnapshot: Number(row.unit_price_snapshot || 0),
      quantity: row.quantity || 1,
      amount: Number(row.amount || 0),
      createdAt: row.created_at || new Date().toISOString()
    };
  }

  async getInvoices(currentUserRole?: UserRole, userBranchId?: string | null): Promise<Invoice[]> {
    if (useRepositoryTestFallbacks()) {
      const fixtures = this.getFallbackInvoices();
      return (currentUserRole === UserRole.BRANCH_ADMIN || currentUserRole === UserRole.DOCTOR_ASSISTANT) && userBranchId
        ? fixtures.filter((invoice) => invoice.branchId === userBranchId)
        : fixtures;
    }
    ensureSupabaseConnected();
    let q = supabase.from("invoices").select("*").order("created_at", { ascending: false });
    if ((currentUserRole === UserRole.BRANCH_ADMIN || currentUserRole === UserRole.DOCTOR_ASSISTANT) && userBranchId) {
      q = q.eq("branch_id", userBranchId);
    }
    const { data, error } = await q;
    if (error) return handleSupabaseReadError("invoices", error, []);
    return (data || []).map((row: any) => this.mapInvoiceFromDb(row));
  }

  async getInvoiceById(id: string, currentUserRole?: UserRole, userBranchId?: string | null): Promise<Invoice | null> {
    if (useRepositoryTestFallbacks()) {
      const fixture = this.getFallbackInvoices().find((invoice) => invoice.id === id);
      if (fixture && (currentUserRole === UserRole.BRANCH_ADMIN || currentUserRole === UserRole.DOCTOR_ASSISTANT) && userBranchId && fixture.branchId !== userBranchId) return null;
      return fixture || null;
    }
    ensureSupabaseConnected();
    let q = supabase.from("invoices").select("*").eq("id", id);
    if ((currentUserRole === UserRole.BRANCH_ADMIN || currentUserRole === UserRole.DOCTOR_ASSISTANT) && userBranchId) {
      q = q.eq("branch_id", userBranchId);
    }
    const { data, error } = await q.maybeSingle();
    if (error) return handleSupabaseReadError("invoices", error, null);
    return data ? this.mapInvoiceFromDb(data) : null;
  }

  async getInvoiceItems(invoiceId: string): Promise<InvoiceItem[]> {
    let remoteItems: InvoiceItem[] = [];
    if (isSupabaseConfigured && supabase && isValidUUID(invoiceId)) {
      try {
        const { data, error } = await supabase.from("invoice_items").select("*").eq("invoice_id", invoiceId);
        if (!error && data) {
          remoteItems = data.map((row: any) => this.mapInvoiceItemFromDb(row));
        }
      } catch (e: any) {
        console.warn("[Supabase] getInvoiceItems remote read note:", e?.message);
      }
    }

    const fallbackItems = this.getFallbackInvoiceItems().filter((item) => item.invoiceId === invoiceId);
    const remoteIds = new Set(remoteItems.map((item) => item.id));
    const localOnly = fallbackItems.filter((item) => !remoteIds.has(item.id));
    return [...remoteItems, ...localOnly];
  }

  async getInvoiceItemsByInvoices(invoiceIds: string[]): Promise<InvoiceItem[]> {
    if (invoiceIds.length === 0) return [];
    if (useRepositoryTestFallbacks()) {
      const invoiceIdSet = new Set(invoiceIds);
      return this.getFallbackInvoiceItems()
        .filter((item) => invoiceIdSet.has(item.invoiceId));
    }
    ensureSupabaseConnected();
    const { data, error } = await supabase
      .from("invoice_items")
      .select("*")
      .in("invoice_id", invoiceIds);
    if (error) throw new Error(`Gagal memuat rincian invoice pasien: ${error.message}`);
    return (data || []).map((row: any) => this.mapInvoiceItemFromDb(row));
  }

  async getInvoicesByBranch(branchId: string, currentUserRole?: UserRole, userBranchId?: string | null): Promise<Invoice[]> {
    const all = await this.getInvoices(currentUserRole, userBranchId);
    const effBranch = (currentUserRole === UserRole.BRANCH_ADMIN || currentUserRole === UserRole.DOCTOR_ASSISTANT) && userBranchId ? userBranchId : branchId;
    return all.filter((inv) => inv.branchId === effBranch);
  }

  async getInvoicesByPatient(patientId: string): Promise<Invoice[]> {
    if (useRepositoryTestFallbacks()) {
      return this.getFallbackInvoices().filter((invoice) => invoice.patientId === patientId);
    }
    ensureSupabaseConnected();
    if (!isValidUUID(patientId)) {
      throw new Error("ID pasien tidak valid untuk memuat tagihan.");
    }
    const { data, error } = await supabase
      .from("invoices")
      .select("*")
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(`Gagal memuat tagihan pasien: ${error.message}`);
    return (data || []).map((row: any) => this.mapInvoiceFromDb(row));
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
    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId && data.branchId !== userBranchId) {
      throw new Error("Branch Admin tidak dapat membuat invoice untuk cabang lain");
    }

    if (!data.items || data.items.length === 0) {
      throw new Error("Invoice harus memiliki minimal satu item tindakan");
    }

    const now = AppClock.nowISO();
    const normalizedItems = data.items.map((item) => {
      const quantity = Number(item.quantity || 0);
      const unitPriceSnapshot = Number(item.unitPriceSnapshot || 0);
      const expectedAmount = quantity * unitPriceSnapshot;
      const explicitAmount = item.amount !== undefined ? Number(item.amount) : expectedAmount;

      if (!Number.isFinite(explicitAmount) || explicitAmount < 0) {
        throw new Error("Nominal item invoice tidak valid.");
      }

      return {
        ...item,
        quantity,
        unitPriceSnapshot,
        amount: explicitAmount
      };
    });

    const totalAmt = normalizedItems.reduce((sum, item) => sum + item.amount, 0);
    const disc = data.discountAmount || 0;
    const tax = data.taxAmount || 0;
    const netAmt = Math.max(0, totalAmt - disc + tax);

    // Generate resilient identifier and standard invoice number
    const generatedId = (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function")
      ? crypto.randomUUID()
      : `inv-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const invoiceId = data.customId || generatedId;

    const existingInvoices = this.getFallbackInvoices();
    const invoiceNumber = data.customInvoiceNumber || generateInvoiceNumber(data.branchId, now, existingInvoices, MOCK_BRANCHES);

    const fallbackItems: InvoiceItem[] = normalizedItems.map((i, index) => {
      const itemAmount = i.amount;
      return {
        id: (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function")
          ? crypto.randomUUID()
          : `item-${invoiceId}-${index + 1}`,
        invoiceId,
        serviceId: i.serviceId,
        treatmentJobId: i.treatmentJobId,
        descriptionSnapshot: i.descriptionSnapshot,
        unitPriceSnapshot: i.unitPriceSnapshot,
        quantity: i.quantity,
        amount: itemAmount,
        createdAt: now
      };
    });

    const fallbackInvoice: Invoice = {
      id: invoiceId,
      invoiceNumber,
      visitId: data.visitId,
      patientId: data.patientId,
      branchId: data.branchId,
      totalAmount: totalAmt,
      discountAmount: disc,
      taxAmount: tax,
      netAmount: netAmt,
      paidAmount: 0,
      outstandingAmount: netAmt,
      status: netAmt === 0 ? InvoiceStatus.PAID : InvoiceStatus.OPEN,
      items: fallbackItems,
      createdAt: now,
      updatedAt: now
    };

    // Save locally first to guarantee persistence even if Supabase rejects or RLS restricts
    const updatedInvoices = [fallbackInvoice, ...existingInvoices.filter((i) => i.id !== fallbackInvoice.id)];
    this.saveFallbackInvoices(updatedInvoices);

    const existingItems = this.getFallbackInvoiceItems();
    this.saveFallbackInvoiceItems([...fallbackItems, ...existingItems.filter((i) => i.invoiceId !== invoiceId)]);

    // Attempt remote save to Supabase if foreign keys are valid UUIDs
    const isVisitUUID = isValidUUID(data.visitId);
    const isPatientUUID = isValidUUID(data.patientId);
    const isBranchUUID = isValidUUID(data.branchId);

    if (isSupabaseConfigured && supabase && isVisitUUID && isPatientUUID && isBranchUUID) {
      try {
        const hasInvalidItemTotals = normalizedItems.some((item) => item.amount !== item.quantity * item.unitPriceSnapshot);
        if (hasInvalidItemTotals) {
          throw new Error("Total item invoice tidak konsisten dengan harga satuan dan kuantitas yang dikirim oleh client.");
        }
        const payload: any = {
          visit_id: data.visitId,
          patient_id: data.patientId,
          branch_id: data.branchId,
          total_amount: totalAmt,
          discount_amount: disc,
          tax_amount: tax,
          net_amount: netAmt,
          paid_amount: 0,
          outstanding_amount: netAmt,
          status: netAmt === 0 ? InvoiceStatus.PAID : InvoiceStatus.OPEN
        };
        if (isValidUUID(invoiceId)) payload.id = invoiceId;

        const { data: inv, error } = await supabase.from("invoices").insert(payload).select().single();
        if (!error && inv) {
          const savedInvId = inv.id;
          if (fallbackItems.length > 0) {
            const itemsPayload = fallbackItems.map((i) => ({
              id: isValidUUID(i.id) ? i.id : undefined,
              invoice_id: savedInvId,
              service_id: isValidUUID(i.serviceId) ? i.serviceId : null,
              treatment_job_id: isValidUUID(i.treatmentJobId) ? i.treatmentJobId : null,
              description_snapshot: i.descriptionSnapshot,
              unit_price_snapshot: i.unitPriceSnapshot,
              quantity: i.quantity,
              amount: i.amount
            }));
            const { error: itemsErr } = await supabase.from("invoice_items").insert(itemsPayload);
            if (itemsErr) throw new Error(`Gagal menyimpan item invoice di Supabase: ${itemsErr.message}`);
          }
          const remoteMapped = this.mapInvoiceFromDb(inv);
          remoteMapped.items = fallbackItems;

          const idx = updatedInvoices.findIndex((x) => x.id === fallbackInvoice.id);
          if (idx >= 0) {
            updatedInvoices[idx] = { ...updatedInvoices[idx], id: savedInvId };
            this.saveFallbackInvoices(updatedInvoices);
          }
          return remoteMapped;
        } else if (error) {
          if (!useRepositoryTestFallbacks()) {
            throw new Error(`Gagal menyimpan invoice di Supabase: ${error.message}`);
          }
        }
      } catch (err: any) {
        if (!useRepositoryTestFallbacks()) throw err;
      }
    } else {
      if (!useRepositoryTestFallbacks()) {
        throw new Error("Invoice tidak dapat disimpan: ID kunjungan, pasien, dan cabang harus berasal dari Supabase.");
      }
    }

    if (useRepositoryTestFallbacks()) return fallbackInvoice;
    throw new Error("Invoice tidak tersimpan ke Supabase.");
  }

  async updateInvoiceStatus(id: string, status: InvoiceStatus, currentUserRole?: UserRole, userBranchId?: string | null): Promise<Invoice> {
    ensureSupabaseConnected();
    const now = AppClock.nowISO();
    let updatedInv: Invoice | null = null;

    if (isValidUUID(id)) {
      try {
        let q = supabase.from("invoices").update({ status, updated_at: now }).eq("id", id);
        if ((currentUserRole === UserRole.BRANCH_ADMIN || currentUserRole === UserRole.DOCTOR_ASSISTANT) && userBranchId) {
          q = q.eq("branch_id", userBranchId);
        }
        const { data, error } = await q.select().single();
        if (!error && data) {
          updatedInv = this.mapInvoiceFromDb(data);
        } else if (error) {
          console.warn("[Supabase] updateInvoiceStatus remote error/permission denied:", error.message);
        }
      } catch (e: any) {
        console.warn("[Supabase] updateInvoiceStatus error:", e?.message);
      }
    }

    const fallbacks = this.getFallbackInvoices();
    const idx = fallbacks.findIndex((i) => i.id === id);
    if (idx >= 0) {
      fallbacks[idx] = { ...fallbacks[idx], status, updatedAt: now };
      this.saveFallbackInvoices(fallbacks);
      return fallbacks[idx];
    }

    if (updatedInv) return updatedInv;
    throw new Error("Invoice tidak ditemukan");
  }

  async cancelInvoice(id: string, currentUserRole?: UserRole, userBranchId?: string | null): Promise<Invoice> {
    return this.updateInvoiceStatus(id, InvoiceStatus.CANCELLED, currentUserRole, userBranchId);
  }

  async deleteInvoice(id: string, currentUserRole?: UserRole, userBranchId?: string | null): Promise<boolean> {
    ensureSupabaseConnected();
    if (currentUserRole && currentUserRole !== UserRole.SUPER_ADMIN && currentUserRole !== UserRole.BRANCH_ADMIN) {
      throw new Error("Akses ditolak: Hanya Admin yang dapat menghapus invoice");
    }

    if (isValidUUID(id)) {
      try {
        await supabase.from("payment_transactions").delete().eq("invoice_id", id);
        await supabase.from("invoice_items").delete().eq("invoice_id", id);
        const { error } = await supabase.from("invoices").delete().eq("id", id);
        if (error) console.warn("[Supabase] deleteInvoice remote error/permission denied:", error.message);
      } catch (e: any) {
        console.warn("[Supabase] deleteInvoice error:", e?.message);
      }
    }

    // Delete from local fallback
    const fallbacks = this.getFallbackInvoices().filter((i) => i.id !== id);
    this.saveFallbackInvoices(fallbacks);

    const items = this.getFallbackInvoiceItems().filter((item) => item.invoiceId !== id);
    this.saveFallbackInvoiceItems(items);

    return true;
  }
}

// =====================================================================
// 13. SUPABASE PAYMENT REPOSITORY
// =====================================================================
export class SupabasePaymentRepository implements PaymentRepository {
  private getFallbackPayments(): PaymentTransaction[] {
    if (!useRepositoryTestFallbacks()) return [];
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("lala_payments");
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
        }
      } catch (e) {
        console.warn("Error loading payments from localStorage:", e);
      }
    }
    return [...MOCK_PAYMENTS];
  }

  private saveFallbackPayments(items: PaymentTransaction[]): void {
    if (!useRepositoryTestFallbacks()) return;
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("lala_payments", JSON.stringify(items));
      } catch (e) {
        console.warn("Error saving payments to localStorage:", e);
      }
    }
  }

  private getFallbackInvoices(): Invoice[] {
    if (!useRepositoryTestFallbacks()) return [];
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("lala_invoices");
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
        }
      } catch (e) {
        console.warn("Error loading invoices in PaymentRepo:", e);
      }
    }
    return [...MOCK_INVOICES];
  }

  private saveFallbackInvoices(items: Invoice[]): void {
    if (!useRepositoryTestFallbacks()) return;
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("lala_invoices", JSON.stringify(items));
      } catch (e) {
        console.warn("Error saving invoices in PaymentRepo:", e);
      }
    }
  }

  private mapPaymentFromDb(row: any): PaymentTransaction {
    return {
      id: row.id,
      receiptNumber: row.receipt_number ?? undefined,
      invoiceId: row.invoice_id,
      branchId: row.branch_id,
      amount: Number(row.amount || 0),
      invoiceNetAmountSnapshot: row.invoice_net_amount_snapshot != null ? Number(row.invoice_net_amount_snapshot) : undefined,
      invoicePaidAmountSnapshot: row.invoice_paid_amount_snapshot != null ? Number(row.invoice_paid_amount_snapshot) : undefined,
      invoiceOutstandingAmountSnapshot: row.invoice_outstanding_amount_snapshot != null ? Number(row.invoice_outstanding_amount_snapshot) : undefined,
      paymentMethod: row.payment_method as PaymentMethod,
      referenceNumber: row.reference_number ?? undefined,
      transactionDateTime: row.transaction_date_time,
      staffId: row.staff_id,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  async getPayments(currentUserRole?: UserRole, userBranchId?: string | null): Promise<PaymentTransaction[]> {
    if (useRepositoryTestFallbacks()) {
      const fixtures = this.getFallbackPayments();
      return (currentUserRole === UserRole.BRANCH_ADMIN || currentUserRole === UserRole.DOCTOR_ASSISTANT) && userBranchId
        ? fixtures.filter((payment) => payment.branchId === userBranchId)
        : fixtures;
    }
    ensureSupabaseConnected();
    let q = supabase.from("payment_transactions").select("*").order("transaction_date_time", { ascending: false });
    if ((currentUserRole === UserRole.BRANCH_ADMIN || currentUserRole === UserRole.DOCTOR_ASSISTANT) && userBranchId) {
      q = q.eq("branch_id", userBranchId);
    }
    const { data, error } = await q;
    if (error) return handleSupabaseReadError("payment_transactions", error, []);
    return (data || []).map((row: any) => this.mapPaymentFromDb(row));
  }

  async getPaymentsByInvoice(invoiceId: string, currentUserRole?: UserRole, userBranchId?: string | null): Promise<PaymentTransaction[]> {
    if (useRepositoryTestFallbacks()) {
      return this.getFallbackPayments().filter((payment) => payment.invoiceId === invoiceId);
    }
    ensureSupabaseConnected();
    let q = supabase.from("payment_transactions").select("*").eq("invoice_id", invoiceId);
    if ((currentUserRole === UserRole.BRANCH_ADMIN || currentUserRole === UserRole.DOCTOR_ASSISTANT) && userBranchId) {
      q = q.eq("branch_id", userBranchId);
    }
    const { data, error } = await q.order("transaction_date_time", { ascending: false });
    if (error) {
      if (currentUserRole === UserRole.PATIENT) {
        throw new Error(`Gagal memuat kuitansi pasien: ${error.message}`);
      }
      return handleSupabaseReadError("payment_transactions", error, []);
    }
    return (data || []).map((row: any) => this.mapPaymentFromDb(row));
  }

  async getPaymentsByInvoices(invoiceIds: string[], currentUserRole?: UserRole): Promise<PaymentTransaction[]> {
    if (invoiceIds.length === 0) return [];
    if (useRepositoryTestFallbacks()) {
      const invoiceIdSet = new Set(invoiceIds);
      return this.getFallbackPayments().filter((payment) => invoiceIdSet.has(payment.invoiceId));
    }
    ensureSupabaseConnected();
    const { data, error } = await supabase
      .from("payment_transactions")
      .select("*")
      .in("invoice_id", invoiceIds)
      .order("transaction_date_time", { ascending: false });
    if (error) {
      if (currentUserRole === UserRole.PATIENT) {
        throw new Error(`Gagal memuat kuitansi pasien: ${error.message}`);
      }
      return handleSupabaseReadError("payment_transactions", error, []);
    }
    return (data || []).map((row: any) => this.mapPaymentFromDb(row));
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
    _currentUserRole?: UserRole,
    _userBranchId?: string | null
  ): Promise<PaymentTransaction> {
    if (!Number.isSafeInteger(data.amount) || data.amount <= 0) {
      throw new Error("Nominal pembayaran harus berupa angka bulat positif");
    }
    if (!useRepositoryTestFallbacks() && (!isSupabaseConfigured || !supabase)) {
      throw new Error("Koneksi ke Supabase belum terkonfigurasi. Data belum dapat disimpan ke server remote.");
    }

    if (!useRepositoryTestFallbacks()) {
      ensureSupabaseConnected();
      if (!isValidUUID(data.invoiceId) || !isValidUUID(data.staffId)) {
        throw new Error("Pembayaran tidak dapat disimpan: invoice atau staf yang valid tidak ditemukan.");
      }

      const { data: created, error } = await supabase.rpc("record_invoice_payment_atomic", {
        p_invoice_id: data.invoiceId,
        p_amount: data.amount,
        p_payment_method: data.paymentMethod,
        p_reference_number: data.referenceNumber || null,
        p_staff_id: data.staffId,
        p_payment_id: data.customId && isValidUUID(data.customId) ? data.customId : null,
        p_receipt_number: data.customReceiptNumber || null
      });
      if (error) {
        throw new Error(`Gagal menyimpan pembayaran di Supabase: ${error.message}`);
      }
      const paymentRow = Array.isArray(created) ? created[0] : created;
      if (!paymentRow?.id) {
        throw new Error("Supabase tidak mengembalikan data pembayaran yang tersimpan.");
      }
      return this.mapPaymentFromDb(paymentRow);
    }

    const now = AppClock.nowISO();
    const fallbackInvoices = this.getFallbackInvoices();
    const targetInv = fallbackInvoices.find((invoice) => invoice.id === data.invoiceId) || null;
    if (!targetInv || !targetInv.id || !targetInv.branchId) {
      throw new Error("Pembayaran tidak dapat disimpan: invoice yang dituju tidak ditemukan.");
    }
    if (targetInv.status === InvoiceStatus.CANCELLED) {
      throw new Error("Tidak dapat menerima pembayaran untuk invoice yang telah DIBATALKAN");
    }
    if (targetInv.status === InvoiceStatus.PAID || targetInv.outstandingAmount <= 0) {
      throw new Error("Invoice sudah LUNAS (Paid). Tidak ada sisa tagihan yang perlu dibayar");
    }
    if (data.amount > targetInv.outstandingAmount) {
      throw new Error(`Nominal pembayaran (Rp ${data.amount.toLocaleString("id-ID")}) melebihi sisa tagihan (Rp ${targetInv.outstandingAmount.toLocaleString("id-ID")})`);
    }

    const invoiceBranchId = targetInv.branchId;
    const currentPaid = Number(targetInv.paidAmount || 0);
    const currentNet = Number(targetInv.netAmount || 0);
    const newPaid = currentPaid + data.amount;
    const newOutstanding = Math.max(0, currentNet - newPaid);
    const newStatus = newOutstanding <= 0 ? InvoiceStatus.PAID : InvoiceStatus.PARTIALLY_PAID;

    const paymentId = data.customId || (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `pmt-${Date.now()}`);
    const existingPayments = this.getFallbackPayments();
    const receiptNumber = data.customReceiptNumber || generateReceiptNumber(invoiceBranchId, now, existingPayments, MOCK_BRANCHES);
    const invoiceNetAmountSnapshot = Number(targetInv.netAmount || 0);
    const invoicePaidAmountSnapshot = Number(newPaid || 0);
    const invoiceOutstandingAmountSnapshot = Number(newOutstanding || 0);

    const fallbackPayment: PaymentTransaction = {
      id: paymentId,
      receiptNumber,
      invoiceId: data.invoiceId,
      branchId: invoiceBranchId,
      amount: data.amount,
      invoiceNetAmountSnapshot,
      invoicePaidAmountSnapshot,
      invoiceOutstandingAmountSnapshot,
      paymentMethod: data.paymentMethod,
      referenceNumber: data.referenceNumber,
      notes: data.notes,
      transactionDateTime: now,
      staffId: data.staffId,
      status: "SUCCESS",
      createdAt: now,
      updatedAt: now
    };

    const updatedPayments = [fallbackPayment, ...existingPayments.filter((p) => p.id !== paymentId)];
    this.saveFallbackPayments(updatedPayments);
    const updatedInvoices = fallbackInvoices.map((invoice) =>
      invoice.id === data.invoiceId
        ? { ...invoice, paidAmount: newPaid, outstandingAmount: newOutstanding, status: newStatus, updatedAt: now }
        : invoice
    );
    this.saveFallbackInvoices(updatedInvoices);
    return fallbackPayment;
  }

  async deletePayment(id: string, currentUserRole?: UserRole, _userBranchId?: string | null): Promise<boolean> {
    ensureSupabaseConnected();
    if (currentUserRole && currentUserRole !== UserRole.SUPER_ADMIN && currentUserRole !== UserRole.BRANCH_ADMIN) {
      throw new Error("Akses ditolak: Hanya Admin yang dapat menghapus pembayaran");
    }

    let invoiceId: string | null = null;
    const fallbackPayments = this.getFallbackPayments();
    const target = fallbackPayments.find((p) => p.id === id);
    if (target) {
      invoiceId = target.invoiceId;
    }

    // Delete remotely if UUID
    if (isValidUUID(id)) {
      try {
        const { data: pmt, error: fetchError } = await supabase.from("payment_transactions").select("*").eq("id", id).single();
        if (fetchError) {
          throw new Error(fetchError.message);
        }
        if (pmt) {
          invoiceId = pmt.invoice_id;
          const { error: deleteError } = await supabase.from("payment_transactions").delete().eq("id", id);
          if (deleteError) {
            throw new Error(deleteError.message);
          }
        }
      } catch (e: any) {
        console.warn("[Supabase] deletePayment remote error:", e?.message);
        return false;
      }
    }

    // Remove from fallback
    const remainingPayments = fallbackPayments.filter((p) => p.id !== id);
    this.saveFallbackPayments(remainingPayments);

    // Recalculate invoice paid amount
    if (invoiceId) {
      const invPayments = remainingPayments.filter((p) => p.invoiceId === invoiceId);
      const newPaid = invPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);

      const fallbackInvoices = this.getFallbackInvoices();
      const invIdx = fallbackInvoices.findIndex((i) => i.id === invoiceId);
      if (invIdx >= 0) {
        const inv = fallbackInvoices[invIdx];
        const newOutstanding = Math.max(0, Number(inv.netAmount || 0) - newPaid);
        let newStatus = InvoiceStatus.OPEN;
        if (newPaid > 0 && newOutstanding > 0) newStatus = InvoiceStatus.PARTIALLY_PAID;
        else if (newPaid > 0 && newOutstanding <= 0) newStatus = InvoiceStatus.PAID;

        fallbackInvoices[invIdx] = {
          ...inv,
          paidAmount: newPaid,
          outstandingAmount: newOutstanding,
          status: newStatus,
          updatedAt: AppClock.nowISO()
        };
        this.saveFallbackInvoices(fallbackInvoices);

        // Update remote invoice if UUID
        if (isValidUUID(invoiceId)) {
          try {
            const { error: updateError } = await supabase.from("invoices").update({
              paid_amount: newPaid,
              outstanding_amount: newOutstanding,
              status: newStatus,
              updated_at: AppClock.nowISO()
            }).eq("id", invoiceId);
            if (updateError) {
              throw new Error(updateError.message);
            }
          } catch (e: any) {
            console.warn("[Supabase] deletePayment update remote invoice error:", e?.message);
            return false;
          }
        }
      }
    }

    return true;
  }
}

// =====================================================================
// 14. SUPABASE DOCTOR REPOSITORY
// =====================================================================
export class SupabaseDoctorRepository implements DoctorRepository {
  private getFallbackDoctors(): DentalDoctor[] {
    if (!useRepositoryTestFallbacks()) return [];
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("lala_doctors");
        if (saved !== null) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            return parsed.map((d: DentalDoctor) => {
              const photo = d.photoUrl || d.avatarUrl || d.profileImage || null;
              return {
                ...d,
                avatarUrl: photo,
                photoUrl: photo,
                profileImage: photo || undefined
              };
            });
          }
        }
      } catch (e) {
        console.warn("Error reading doctors from localStorage fallback:", e);
      }
    }
    return [...MOCK_DOCTORS];
  }

  private saveFallbackDoctors(doctors: DentalDoctor[]): void {
    if (!useRepositoryTestFallbacks()) return;
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("lala_doctors", JSON.stringify(doctors));
      } catch (e) {
        console.warn("Error saving doctors to localStorage:", e);
      }
    }
  }

  private mapDoctorFromDb(row: any): DentalDoctor {
    return {
      id: row.id,
      staffId: row.staff_id,
      doctorCode: row.doctor_code,
      name: row.name,
      fullName: row.full_name || row.name,
      specialization: row.specialization,
      phone: row.phone,
      email: row.email || "",
      str: row.str || "",
      sip: row.sip || "",
      assignedBranchId: row.assigned_branch_id,
      active: row.active ?? true,
      isActive: row.active ?? true,
      avatarUrl: row.avatar_url || row.photo_url,
      photoUrl: row.avatar_url || row.photo_url,
      notes: row.notes || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  async getDoctors(
    currentUserRole?: UserRole,
    userBranchId?: string | null,
    includeInactive = false
  ): Promise<DentalDoctor[]> {
    if (!useRepositoryTestFallbacks()) ensureSupabaseConnected();
    if (isSupabaseConfigured && supabase) {
      try {
        const canIncludeInactive = includeInactive && currentUserRole === UserRole.SUPER_ADMIN;
        let q = supabase.from("dental_doctors").select("*").order("name");
        if (!canIncludeInactive) q = q.eq("active", true);
        
        // If userBranchId is a valid UUID, query by UUID directly if needed,
        // otherwise do not add invalid UUID filter at Postgres level
        if ((currentUserRole === UserRole.BRANCH_ADMIN || currentUserRole === UserRole.DOCTOR_ASSISTANT) && userBranchId && isValidUUID(userBranchId)) {
          // We do not filter solely by assigned_branch_id at query level because doctors can be assigned
          // via doctor_branch_assignments or schedules
        }

        const { data, error } = await q;
        if (error) {
          return handleSupabaseReadError("dental_doctors", error, []);
        }
        const mapped = (data || []).map(this.mapDoctorFromDb);
        if (mapped.length === 0) return [];

        // If branch filtering requested, filter mapped doctors if any match, otherwise return all mapped active doctors
        if ((currentUserRole === UserRole.BRANCH_ADMIN || currentUserRole === UserRole.DOCTOR_ASSISTANT) && userBranchId) {
          const branchDoctors = mapped.filter((d) => isBranchMatch(d.assignedBranchId, userBranchId, MOCK_BRANCHES));
          if (branchDoctors.length > 0) {
            this.saveFallbackDoctors(branchDoctors);
            return branchDoctors;
          }
        }

        this.saveFallbackDoctors(mapped);
        return mapped;
      } catch (error) {
        if (!useRepositoryTestFallbacks()) throw error;
      }
    }
    const fallback = this.getFallbackDoctors();
    if ((currentUserRole === UserRole.BRANCH_ADMIN || currentUserRole === UserRole.DOCTOR_ASSISTANT) && userBranchId) {
      const matched = fallback.filter((d) => isBranchMatch(d.assignedBranchId, userBranchId, MOCK_BRANCHES));
      return matched.length > 0 ? matched : fallback.filter((d) => d.active ?? d.isActive ?? true);
    }
    return fallback;
  }

  async getDoctorById(id: string): Promise<DentalDoctor | null> {
    if (!useRepositoryTestFallbacks()) ensureSupabaseConnected();
    if (isSupabaseConfigured && supabase && isValidUUID(id)) {
      try {
        const { data, error } = await supabase.from("dental_doctors").select("*").eq("id", id).single();
        if (!error && data) return this.mapDoctorFromDb(data);
        if (error && error.code !== "PGRST116") {
          return handleSupabaseReadError("dental_doctors", error, null);
        }
      } catch (e) {
        if (!useRepositoryTestFallbacks()) throw e;
      }
    }
    const fallback = this.getFallbackDoctors();
    return fallback.find((d) => d.id === id) || null;
  }

  async getDoctorByStaffId(staffId: string): Promise<DentalDoctor | null> {
    if (!useRepositoryTestFallbacks()) ensureSupabaseConnected();
    if (isSupabaseConfigured && supabase && isValidUUID(staffId)) {
      const { data, error } = await supabase
        .from("dental_doctors")
        .select("*")
        .eq("staff_id", staffId)
        .maybeSingle();
      if (error && error.code !== "PGRST116") {
        return handleSupabaseReadError("dental_doctors", error, null);
      }
      if (data) return this.mapDoctorFromDb(data);
    }
    return this.getFallbackDoctors().find((doctor) => doctor.staffId === staffId) || null;
  }

  async getDoctorByCode(code: string): Promise<DentalDoctor | null> {
    if (!useRepositoryTestFallbacks()) ensureSupabaseConnected();
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase.from("dental_doctors").select("*").eq("doctor_code", code).single();
        if (!error && data) return this.mapDoctorFromDb(data);
        if (error && error.code !== "PGRST116") {
          return handleSupabaseReadError("dental_doctors", error, null);
        }
      } catch (e) {
        if (!useRepositoryTestFallbacks()) throw e;
      }
    }
    const fallback = this.getFallbackDoctors();
    return fallback.find((d) => d.doctorCode?.toUpperCase() === code.toUpperCase()) || null;
  }

  async getDoctorsByBranch(branchId: string): Promise<DentalDoctor[]> {
    if (!useRepositoryTestFallbacks()) ensureSupabaseConnected();
    if (isSupabaseConfigured && supabase && isValidUUID(branchId)) {
      try {
        const { data, error } = await supabase.from("dental_doctors").select("*").eq("assigned_branch_id", branchId).order("name");
        if (error) return handleSupabaseReadError("dental_doctors", error, []);
        if (!error && data && data.length > 0) {
          return data.map(this.mapDoctorFromDb);
        }
        if (!error) return [];
      } catch (e) {
        if (!useRepositoryTestFallbacks()) throw e;
      }
    }
    const fallback = this.getFallbackDoctors();
    return fallback.filter((d) => isBranchMatch(d.assignedBranchId, branchId, MOCK_BRANCHES));
  }

  async createDoctor(
    data: Omit<DentalDoctor, "id" | "createdAt" | "updatedAt"> & { id?: string },
    _currentUserRole?: UserRole,
    _userBranchId?: string | null
  ): Promise<DentalDoctor> {
    ensureSupabaseConnected();
    const payload: any = {
      doctor_code: data.doctorCode || `DOC-${(data.name || "NEW").replace(/[^a-zA-Z0-9]/g, "").toUpperCase().substring(0, 8)}`,
      name: data.name,
      full_name: data.fullName || data.name,
      specialization: data.specialization || "Dokter Gigi Umum",
      phone: data.phone || "",
      email: data.email || null,
      str: data.str || null,
      sip: data.sip || null,
      assigned_branch_id: data.assignedBranchId || null,
      active: data.active ?? true,
      avatar_url: data.avatarUrl || data.photoUrl || null,
      notes: data.notes || null
    };
    if (data.staffId !== undefined) payload.staff_id = data.staffId || null;
    if (data.id && isValidUUID(data.id)) payload.id = data.id;

    try {
      const { data: created, error } = await supabase.from("dental_doctors").insert(payload).select().single();
      if (!error && created) {
        const res = this.mapDoctorFromDb(created);
        const existing = this.getFallbackDoctors();
        const idx = existing.findIndex((d) => d.id === res.id);
        if (idx >= 0) existing[idx] = res;
        else existing.unshift(res);
        this.saveFallbackDoctors(existing);
        return res;
      }
      if (!useRepositoryTestFallbacks()) {
        throw new Error(`Gagal menyimpan dokter ke Supabase: ${error?.message || "Tidak ada data yang dikembalikan."}`);
      }
    } catch (err: any) {
      if (!useRepositoryTestFallbacks()) throw err;
    }

    if (!useRepositoryTestFallbacks()) {
      throw new Error("Dokter tidak tersimpan ke Supabase.");
    }
    // Test fallback creation
    const newDoc: DentalDoctor = {
      id: data.id || `doc-${Date.now()}`,
      staffId: data.staffId,
      doctorCode: payload.doctor_code,
      name: data.name,
      fullName: data.fullName || data.name,
      specialization: data.specialization || "Dokter Gigi Umum",
      phone: data.phone || "",
      email: data.email || "",
      str: data.str || "",
      sip: data.sip || "",
      assignedBranchId: data.assignedBranchId || undefined,
      active: data.active ?? true,
      isActive: data.active ?? true,
      avatarUrl: data.avatarUrl || data.photoUrl || undefined,
      photoUrl: data.photoUrl || data.avatarUrl || undefined,
      notes: data.notes || undefined,
      createdAt: AppClock.nowISO(),
      updatedAt: AppClock.nowISO()
    };
    const existing = this.getFallbackDoctors();
    const idx = existing.findIndex((d) => d.id === newDoc.id);
    if (idx >= 0) existing[idx] = newDoc;
    else existing.unshift(newDoc);
    this.saveFallbackDoctors(existing);
    return newDoc;
  }

  async updateDoctor(
    id: string,
    updates: Partial<Omit<DentalDoctor, "id" | "createdAt" | "updatedAt">>,
    _currentUserRole?: UserRole,
    _userBranchId?: string | null
  ): Promise<DentalDoctor> {
    ensureSupabaseConnected();
    if (isValidUUID(id)) {
      try {
        const payload: any = { updated_at: new Date().toISOString() };
        if (updates.name) payload.name = updates.name;
        if (updates.fullName) payload.full_name = updates.fullName;
        if (updates.title !== undefined) payload.title = updates.title || null;
        if (updates.specialization) payload.specialization = updates.specialization;
        if (updates.phone) payload.phone = updates.phone;
        if (updates.email !== undefined) payload.email = updates.email;
        if (updates.str !== undefined) payload.str = updates.str || null;
        if (updates.sip !== undefined) payload.sip = updates.sip || null;
        if (updates.assignedBranchId !== undefined) payload.assigned_branch_id = updates.assignedBranchId;
        if (updates.staffId !== undefined) payload.staff_id = updates.staffId || null;
        if (updates.active !== undefined) payload.active = updates.active;
        if (updates.avatarUrl !== undefined || updates.photoUrl !== undefined || (updates as any).profileImage !== undefined) {
          const photoUrl = updates.photoUrl || updates.avatarUrl || (updates as any).profileImage || null;
          payload.avatar_url = photoUrl;
        }

        const { data, error } = await supabase.from("dental_doctors").update(payload).eq("id", id).select().single();
        if (!error && data) {
          const res = this.mapDoctorFromDb(data);
          const existing = this.getFallbackDoctors();
          const idx = existing.findIndex((d) => d.id === id);
          if (idx >= 0) existing[idx] = { ...existing[idx], ...updates, ...res };
          this.saveFallbackDoctors(existing);
          return res;
        }
      } catch (e) {
        if (!useRepositoryTestFallbacks()) throw e;
      }
    }

    // Local fallback update
    const existing = this.getFallbackDoctors();
    const idx = existing.findIndex((d) => d.id === id);
    if (idx >= 0) {
      existing[idx] = { ...existing[idx], ...updates, updatedAt: AppClock.nowISO() };
      this.saveFallbackDoctors(existing);
      return existing[idx];
    }
    const fallbackDoc: DentalDoctor = {
      id,
      name: updates.name || "Dokter",
      fullName: updates.fullName || updates.name || "Dokter",
      specialization: updates.specialization || "Dokter Gigi Umum",
      phone: updates.phone || "",
      active: updates.active ?? true,
      isActive: updates.active ?? true,
      avatarUrl: updates.photoUrl || updates.avatarUrl || undefined,
      photoUrl: updates.photoUrl || updates.avatarUrl || undefined,
      profileImage: updates.photoUrl || updates.avatarUrl || undefined,
      ...updates,
      createdAt: AppClock.nowISO(),
      updatedAt: AppClock.nowISO()
    };
    if (!useRepositoryTestFallbacks()) {
      throw new Error("Dokter tidak ditemukan di Supabase. Data dokter lokal tidak dibuat.");
    }
    existing.unshift(fallbackDoc);
    this.saveFallbackDoctors(existing);
    return fallbackDoc;
  }

  async updateDoctorPhoto(id: string, photoUrl: string | null): Promise<DentalDoctor> {
    ensureSupabaseConnected();
    if (!isValidUUID(id) && !useRepositoryTestFallbacks()) {
      throw new Error(`ID dokter "${id}" bukan UUID valid; foto tidak diperbarui.`);
    }
    if (isValidUUID(id)) {
      try {
        const { data, error } = await supabase
          .from("dental_doctors")
          .update({ avatar_url: photoUrl, updated_at: new Date().toISOString() })
          .eq("id", id)
          .select()
          .single();
        if (error) {
          throw new Error(`Supabase menolak pembaruan foto dokter (${error.code || "tanpa kode"}): ${error.message}`);
        }
        if (!data) throw new Error("Supabase tidak mengembalikan data dokter setelah foto diperbarui.");
        const res = this.mapDoctorFromDb(data);
        const existing = this.getFallbackDoctors();
        const idx = existing.findIndex((d) => d.id === id);
        if (idx >= 0) existing[idx] = { ...existing[idx], ...res };
        this.saveFallbackDoctors(existing);
        return res;
      } catch (e) {
        if (!useRepositoryTestFallbacks()) throw e;
      }
    }

    if (!useRepositoryTestFallbacks()) {
      throw new Error("Foto dokter tidak dapat diperbarui di Supabase.");
    }
    const existing = this.getFallbackDoctors();
    const idx = existing.findIndex((d) => d.id === id);
    if (idx >= 0) {
      existing[idx] = {
        ...existing[idx],
        avatarUrl: photoUrl || undefined,
        photoUrl: photoUrl || undefined,
        profileImage: photoUrl || undefined,
        updatedAt: AppClock.nowISO()
      };
      this.saveFallbackDoctors(existing);
      return existing[idx];
    }
    return {
      id,
      name: "Dokter",
      fullName: "Dokter",
      specialization: "Dokter Gigi Umum",
      phone: "",
      avatarUrl: photoUrl || undefined,
      photoUrl: photoUrl || undefined,
      profileImage: photoUrl || undefined,
      active: true,
      isActive: true,
      createdAt: AppClock.nowISO(),
      updatedAt: AppClock.nowISO()
    };
  }

  private getFallbackBranches(): DentalBranch[] {
    if (!useRepositoryTestFallbacks()) return [];
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("lala_branches");
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      } catch {}
    }
    return [...MOCK_BRANCHES];
  }

  async getDoctorBranchAssignments(doctorId?: string, branchId?: string): Promise<DoctorBranchAssignment[]> {
    if (isSupabaseConfigured && supabase && !useRepositoryTestFallbacks()) {
      try {
        let q = supabase
          .from("doctor_branch_assignments")
          .select("id, doctor_id, branch_id, start_date, end_date, active, created_at, updated_at");
        if (doctorId && isValidUUID(doctorId)) q = q.eq("doctor_id", doctorId);
        if (branchId) {
          if (isValidUUID(branchId)) {
            q = q.eq("branch_id", branchId);
          } else {
            const cachedBranches = this.getFallbackBranches();
            const matched = cachedBranches.find((b) => isBranchMatch(b.id, branchId, cachedBranches));
            if (matched?.id && isValidUUID(matched.id)) {
              q = q.eq("branch_id", matched.id);
            }
          }
        }
        const { data, error } = await q;
        if (error) return handleSupabaseReadError("doctor_branch_assignments", error, []);
        if (!error && data && data.length > 0) {
          let results = data.map((r: any) => ({
            id: r.id,
            doctorId: r.doctor_id,
            branchId: r.branch_id,
            startDate: r.start_date || new Date().toISOString().split("T")[0],
            active: r.active ?? true,
            notes: r.notes || undefined,
            createdAt: r.created_at,
            updatedAt: r.updated_at
          }));
          if (branchId) {
            const cachedBranches = this.getFallbackBranches();
            results = results.filter((a: DoctorBranchAssignment) => isBranchMatch(a.branchId, branchId, cachedBranches));
          }
          return results;
        }
      } catch (error) {
        if (!useRepositoryTestFallbacks()) throw error;
      }
    }

    if (!useRepositoryTestFallbacks()) return [];

    // Fallback storage
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("lala_doctor_branch_assignments");
        if (saved) {
          const parsed: DoctorBranchAssignment[] = JSON.parse(saved);
          let res = parsed;
          if (doctorId) res = res.filter((a) => a.doctorId === doctorId);
          if (branchId) {
            const cachedBranches = this.getFallbackBranches();
            res = res.filter((a) => isBranchMatch(a.branchId, branchId, cachedBranches));
          }
          if (res.length > 0) return res;
        }
      } catch (e) {}
    }

    // Default mock assignments fallback with flexible matching
    const cachedBranches = useRepositoryTestFallbacks() ? MOCK_BRANCHES : [];
    let mockRes = [...MOCK_DOCTOR_BRANCH_ASSIGNMENTS];
    if (doctorId) mockRes = mockRes.filter((a) => a.doctorId === doctorId);
    if (branchId) mockRes = mockRes.filter((a) => isBranchMatch(a.branchId, branchId, cachedBranches));
    return mockRes;
  }

  async assignDoctorToBranch(data: Omit<DoctorBranchAssignment, "id" | "createdAt" | "updatedAt"> & { id?: string }): Promise<DoctorBranchAssignment> {
    ensureSupabaseConnected();
    const payload: any = {
      doctor_id: data.doctorId,
      branch_id: data.branchId,
      start_date: data.startDate || new Date().toISOString().split("T")[0],
      active: data.active ?? true,
      notes: data.notes || null,
      updated_at: new Date().toISOString()
    };
    if (data.id && isValidUUID(data.id)) payload.id = data.id;

    if (isValidUUID(data.doctorId) && isValidUUID(data.branchId)) {
      try {
        // Check if assignment already exists for doctor + branch
        const { data: existing } = await supabase
          .from("doctor_branch_assignments")
          .select("id")
          .eq("doctor_id", data.doctorId)
          .eq("branch_id", data.branchId);

        if (existing && existing.length > 0) {
          const { data: updated, error } = await supabase
            .from("doctor_branch_assignments")
            .update(payload)
            .eq("id", existing[0].id)
            .select()
            .single();
          if (!error && updated) {
            return {
              id: updated.id,
              doctorId: updated.doctor_id,
              branchId: updated.branch_id,
              startDate: updated.start_date || data.startDate || new Date().toISOString().split("T")[0],
              active: updated.active ?? true,
              notes: updated.notes || undefined,
              createdAt: updated.created_at,
              updatedAt: updated.updated_at
            };
          }
        }

        const { data: created, error } = await supabase.from("doctor_branch_assignments").insert(payload).select().single();
        if (!error && created) {
          return {
            id: created.id,
            doctorId: created.doctor_id,
            branchId: created.branch_id,
            startDate: created.start_date || data.startDate || new Date().toISOString().split("T")[0],
            active: created.active ?? true,
            notes: created.notes || undefined,
            createdAt: created.created_at,
            updatedAt: created.updated_at
          };
        }
      } catch (e) {
        if (!useRepositoryTestFallbacks()) throw e;
      }
    }

    if (!useRepositoryTestFallbacks()) {
      throw new Error("Penugasan cabang dokter tidak tersimpan ke Supabase.");
    }
    // Local fallback
    const now = AppClock.nowISO();
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("lala_doctor_branch_assignments");
        const list: DoctorBranchAssignment[] = saved ? JSON.parse(saved) : [];
        const existingIdx = list.findIndex(a => a.doctorId === data.doctorId && a.branchId === data.branchId);
        if (existingIdx !== -1) {
          list[existingIdx] = {
            ...list[existingIdx],
            startDate: data.startDate || list[existingIdx].startDate,
            active: data.active ?? true,
            notes: data.notes || list[existingIdx].notes,
            updatedAt: now
          };
          localStorage.setItem("lala_doctor_branch_assignments", JSON.stringify(list));
          return list[existingIdx];
        }
        const newAssignment: DoctorBranchAssignment = {
          id: data.id || `dba-${Date.now()}`,
          doctorId: data.doctorId,
          branchId: data.branchId,
          startDate: data.startDate || new Date().toISOString().split("T")[0],
          active: data.active ?? true,
          notes: data.notes || undefined,
          createdAt: now,
          updatedAt: now
        };
        list.push(newAssignment);
        localStorage.setItem("lala_doctor_branch_assignments", JSON.stringify(list));
        return newAssignment;
      } catch (e) {}
    }

    const fallbackAssignment: DoctorBranchAssignment = {
      id: data.id || `dba-${Date.now()}`,
      doctorId: data.doctorId,
      branchId: data.branchId,
      startDate: data.startDate || new Date().toISOString().split("T")[0],
      active: data.active ?? true,
      notes: data.notes || undefined,
      createdAt: now,
      updatedAt: now
    };
    if (!useRepositoryTestFallbacks()) {
      throw new Error("Penugasan cabang dokter tidak tersimpan ke Supabase.");
    }
    return fallbackAssignment;
  }

  async removeDoctorBranchAssignment(id: string): Promise<void> {
    ensureSupabaseConnected();
    if (isValidUUID(id)) {
      const { error } = await supabase.from("doctor_branch_assignments").delete().eq("id", id);
      if (error) throw new Error(`Gagal menghapus penugasan cabang dokter dari Supabase: ${error.message}`);
    } else if (!useRepositoryTestFallbacks()) {
      throw new Error("ID penugasan cabang dokter tidak valid untuk Supabase.");
    }
    if (useRepositoryTestFallbacks() && typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("lala_doctor_branch_assignments");
        if (saved) {
          const list: DoctorBranchAssignment[] = JSON.parse(saved);
          const filtered = list.filter((a) => a.id !== id);
          localStorage.setItem("lala_doctor_branch_assignments", JSON.stringify(filtered));
        }
      } catch (e) {}
    }
  }

  async deleteDoctor(id: string, currentUserRole?: UserRole): Promise<void> {
    if (currentUserRole && currentUserRole !== UserRole.SUPER_ADMIN) {
      throw new Error("Hanya Super Admin yang berwenang menghapus master dokter");
    }
    ensureSupabaseConnected();
    if (!isValidUUID(id)) {
      if (!useRepositoryTestFallbacks()) throw new Error("ID dokter tidak valid untuk Supabase.");
    } else {
      const { error: assignmentError } = await supabase.from("doctor_branch_assignments").delete().eq("doctor_id", id);
      if (assignmentError) throw new Error(`Gagal menghapus penugasan dokter: ${assignmentError.message}`);
      const { error: scheduleError } = await supabase.from("doctor_schedules").delete().eq("doctor_id", id);
      if (scheduleError) throw new Error(`Gagal menghapus jadwal dokter: ${scheduleError.message}`);
      const { error: doctorError } = await supabase.from("dental_doctors").delete().eq("id", id);
      if (doctorError) throw new Error(`Gagal menghapus dokter dari Supabase: ${doctorError.message}`);
    }
    if (!useRepositoryTestFallbacks()) return;
    const existing = this.getFallbackDoctors();
    const filtered = existing.filter((d) => d.id !== id);
    this.saveFallbackDoctors(filtered);

    // Also clean up local branch assignments & schedules
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("lala_doctor_branch_assignments");
        if (saved) {
          const list: DoctorBranchAssignment[] = JSON.parse(saved);
          const updated = list.filter((a) => a.doctorId !== id);
          localStorage.setItem("lala_doctor_branch_assignments", JSON.stringify(updated));
        }
      } catch (e) {}

      try {
        const savedSchedules = localStorage.getItem("lala_doctor_schedules");
        if (savedSchedules) {
          const list = JSON.parse(savedSchedules);
          const updated = list.filter((s: any) => s.doctorId !== id);
          localStorage.setItem("lala_doctor_schedules", JSON.stringify(updated));
        }
      } catch (e) {}
    }
  }
}

// =====================================================================
// 15. SUPABASE CONFIGURATION REPOSITORY
// =====================================================================
export class SupabaseConfigurationRepository implements ConfigurationRepository {
  private mapServiceFromDb(row: any): MasterService {
    return {
      id: row.id,
      code: row.code || undefined,
      name: row.name,
      description: row.description || "",
      basePrice: Number(row.base_price),
      estimatedDurationMinutes: row.estimated_duration_minutes || 30,
      category: row.category,
      clinicalCategory: row.clinical_category || undefined,
      clinicalTarget: row.clinical_target || undefined,
      requiresConsent: Boolean(row.requires_consent),
      isMultiStage: Boolean(row.is_multi_stage),
      tracksMaterialLots: Boolean(row.tracks_material_lots),
      icd9cmCode: row.icd9cm_code || undefined,
      isActive: row.is_active ?? true,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  async getServices(): Promise<MasterService[]> {
    ensureSupabaseConnected();
    const { data, error } = await supabase.from("master_services").select("*").eq("is_active", true).order("created_at");
    if (error) return handleSupabaseReadError("master_services", error, []);
    if (!data || data.length === 0) return [];
    return data.map(this.mapServiceFromDb);
  }

  async createService(data: Omit<MasterService, "id" | "createdAt" | "updatedAt"> & { id?: string }): Promise<MasterService> {
    ensureSupabaseConnected();
    const payload: any = {
      code: data.code || null,
      name: data.name,
      description: data.description || "",
      base_price: data.basePrice,
      estimated_duration_minutes: data.estimatedDurationMinutes,
      category: data.category,
      clinical_category: data.clinicalCategory || null,
      clinical_target: data.clinicalTarget || "NONE",
      requires_consent: data.requiresConsent ?? false,
      is_multi_stage: data.isMultiStage ?? false,
      tracks_material_lots: data.tracksMaterialLots ?? false,
      icd9cm_code: data.icd9cmCode || null,
      is_active: data.isActive ?? true
    };
    if (data.id) payload.id = data.id;
    const { data: created, error } = await supabase.from("master_services").insert(payload).select().single();
    if (error) throw new Error(`Supabase error: ${error.message}`);
    return this.mapServiceFromDb(created);
  }

  async updateService(id: string, updates: Partial<Omit<MasterService, "id" | "createdAt" | "updatedAt">>): Promise<MasterService> {
    ensureSupabaseConnected();
    const payload: any = { updated_at: new Date().toISOString() };
    if (updates.name) payload.name = updates.name;
    if (updates.description !== undefined) payload.description = updates.description;
    if (updates.basePrice !== undefined) payload.base_price = updates.basePrice;
    if (updates.estimatedDurationMinutes !== undefined) payload.estimated_duration_minutes = updates.estimatedDurationMinutes;
    if (updates.category) payload.category = updates.category;
    if (updates.clinicalCategory !== undefined) payload.clinical_category = updates.clinicalCategory || null;
    if (updates.clinicalTarget !== undefined) payload.clinical_target = updates.clinicalTarget;
    if (updates.requiresConsent !== undefined) payload.requires_consent = updates.requiresConsent;
    if (updates.isMultiStage !== undefined) payload.is_multi_stage = updates.isMultiStage;
    if (updates.tracksMaterialLots !== undefined) payload.tracks_material_lots = updates.tracksMaterialLots;
    if (updates.icd9cmCode !== undefined) payload.icd9cm_code = updates.icd9cmCode || null;
    if (updates.isActive !== undefined) payload.is_active = updates.isActive;

    const { data, error } = await supabase.from("master_services").update(payload).eq("id", id).select().single();
    if (error) throw new Error(`Supabase error: ${error.message}`);
    return this.mapServiceFromDb(data);
  }

  async getBranchTariffs(branchId: string): Promise<BranchServiceTariff[]> {
    ensureSupabaseConnected();
    if (!isValidUUID(branchId)) return [];
    const { data, error } = await supabase.from("branch_service_tariffs").select("*").eq("branch_id", branchId).eq("is_active", true);
    if (error) return handleSupabaseReadError("branch_service_tariffs", error, []);
    return (data || []).map((r: any) => ({
      id: r.id,
      branchId: r.branch_id,
      serviceId: r.service_id,
      customPrice: Number(r.custom_price),
      isActive: r.is_active,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    }));
  }

  async setBranchTariff(branchId: string, serviceId: string, customPrice: number): Promise<BranchServiceTariff> {
    ensureSupabaseConnected();
    const { data, error } = await supabase
      .from("branch_service_tariffs")
      .upsert({
        branch_id: branchId,
        service_id: serviceId,
        custom_price: customPrice,
        is_active: true,
        updated_at: new Date().toISOString()
      }, { onConflict: "branch_id,service_id" })
      .select()
      .single();
    if (error) throw new Error(`Supabase error: ${error.message}`);
    return {
      id: data.id,
      branchId: data.branch_id,
      serviceId: data.service_id,
      customPrice: Number(data.custom_price),
      isActive: data.is_active,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    };
  }

  async getClinicBranding(): Promise<ClinicBranding> {
    try {
      const saved = typeof window !== "undefined" ? localStorage.getItem("lala_clinic_branding") : null;
      let cached = saved ? JSON.parse(saved) : null;

      // Check if primary branch in Supabase has updated logo_url/phone/address
      if (isSupabaseConfigured && supabase && !useRepositoryTestFallbacks()) {
        try {
          const { data } = await supabase.from("dental_branches").select("*").order("id", { ascending: true }).limit(1).maybeSingle();
          if (data && data.logo_url) {
            cached = {
              ...(cached || DEFAULT_CLINIC_BRANDING),
              logoUrl: data.logo_url,
              phone: data.phone || cached?.phone || DEFAULT_CLINIC_BRANDING.phone,
              address: data.address || cached?.address || DEFAULT_CLINIC_BRANDING.address
            };
          }
        } catch (e) {
          // Ignore RLS or network warning
        }
      }

      if (cached) {
        return { ...DEFAULT_CLINIC_BRANDING, ...cached };
      }
    } catch (e) {
      console.warn("Error reading clinic branding:", e);
    }
    return DEFAULT_CLINIC_BRANDING;
  }

  async updateClinicBranding(
    updates: Partial<Omit<ClinicBranding, "id" | "updatedAt">>,
    currentUserRole?: UserRole
  ): Promise<ClinicBranding> {
    if (currentUserRole && currentUserRole !== UserRole.SUPER_ADMIN) {
      throw new Error("Hanya Super Admin yang berwenang mengubah identitas dan logo klinik");
    }

    const current = await this.getClinicBranding();
    const updated: ClinicBranding = {
      ...current,
      ...updates,
      updatedAt: AppClock.nowISO()
    };

    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("lala_clinic_branding", JSON.stringify(updated));
      } catch (e) {
        console.warn("Error persisting branding to localStorage:", e);
      }
    }

    // Also persist logoUrl, phone, address to Supabase dental_branches table
    if (isSupabaseConfigured && supabase) {
      const { data: branches, error: branchReadError } = await supabase
        .from("dental_branches")
        .select("id")
        .order("id", { ascending: true })
        .limit(1);
      if (branchReadError) {
        throw new Error(`Gagal membaca cabang untuk menyimpan identitas klinik: ${branchReadError.message}`);
      }
      if (branches && branches.length > 0) {
        const dbPayload: any = {};
        if (updates.logoUrl !== undefined) dbPayload.logo_url = updates.logoUrl;
        if (updates.phone) dbPayload.phone = updates.phone;
        if (updates.address) dbPayload.address = updates.address;
        if (Object.keys(dbPayload).length > 0) {
          const { error: updateError } = await supabase
            .from("dental_branches")
            .update(dbPayload)
            .eq("id", branches[0].id);
          if (updateError) {
            throw new Error(`Gagal menyimpan identitas klinik ke server: ${updateError.message}`);
          }
        }
      } else if (updates.logoUrl !== undefined || updates.phone || updates.address) {
        throw new Error("Tidak ada data cabang untuk menyimpan identitas klinik ke server.");
      }
    }

    return updated;
  }
}

// =====================================================================
// 16. SUPABASE DOCTOR SCHEDULE REPOSITORY
// =====================================================================
export class SupabaseDoctorScheduleRepository implements DoctorScheduleRepository {
  private getFallbackBranches(): DentalBranch[] {
    if (!useRepositoryTestFallbacks()) return [];
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("lala_branches");
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      } catch {}
    }
    return [...MOCK_BRANCHES];
  }

  private getFallbackSchedules(): DoctorSchedule[] {
    if (!useRepositoryTestFallbacks()) return [];
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("lala_doctor_schedules");
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
        }
      } catch (e) {
        console.warn("Error loading doctor schedules from localStorage:", e);
      }
    }
    return [...MOCK_DOCTOR_SCHEDULES];
  }

  private saveFallbackSchedules(items: DoctorSchedule[]): void {
    if (!useRepositoryTestFallbacks()) return;
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("lala_doctor_schedules", JSON.stringify(items));
      } catch (e) {
        console.warn("Error saving doctor schedules to localStorage:", e);
      }
    }
  }

  /**
   * Validates that the Supabase client has an active, legitimate authenticated session.
   * Rejects anonymous calls (anon key without login) and simulated mock sessions.
   */
  private async assertAuthenticatedSession(): Promise<void> {
    if (!supabase) {
      throw new Error("Supabase client belum diinisialisasi.");
    }
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session || !session.user || session.access_token === "mock-token") {
      throw new Error(
        "Sesi Supabase tidak terautentikasi (42501). Operasi penulisan jadwal memerlukan autentikasi resmi ke Supabase Auth (Bukan sesi anonim/demo)."
      );
    }
  }

  async getSchedules(
    filter?: ScheduleFilter,
    currentUserRole?: UserRole,
    userBranchId?: string | null,
    _currentDoctorId?: string | null
  ): Promise<DoctorSchedule[]> {
    if (!useRepositoryTestFallbacks()) ensureSupabaseConnected();
    const cachedBranches = this.getFallbackBranches();

    // 1. Branch Isolation Guard with flexible matching
    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId) {
      if (filter?.branchId && !isBranchMatch(filter.branchId, userBranchId, cachedBranches)) {
        return []; // Branch Admin CANNOT read other branches
      }
    }

    // 2. Production Remote Supabase Execution
    if (isSupabaseConfigured && supabase && !useRepositoryTestFallbacks()) {
      // Select explicit columns granted to both anon and authenticated roles
      // to avoid 42501 permission denied when anon client queries doctor_schedules
      let q = supabase
        .from("doctor_schedules")
        .select("id, doctor_id, branch_id, date, start_time, end_time, status, created_at, updated_at")
        .order("date");

      const effBranch = (currentUserRole === UserRole.BRANCH_ADMIN || currentUserRole === UserRole.DOCTOR_ASSISTANT) && userBranchId ? userBranchId : filter?.branchId;
      if (effBranch) {
        if (isValidUUID(effBranch)) {
          q = q.eq("branch_id", effBranch);
        } else {
          // Resolve UUID using flexible branch matching against catalog
          const matched = cachedBranches.find((b) => isBranchMatch(b.id, effBranch, cachedBranches));
          if (matched?.id && isValidUUID(matched.id)) {
            q = q.eq("branch_id", matched.id);
          }
        }
      }
      if (filter?.doctorId && isValidUUID(filter.doctorId)) q = q.eq("doctor_id", filter.doctorId);
      if (filter?.date) q = q.eq("date", filter.date);
      if (filter?.dateFrom) q = q.gte("date", filter.dateFrom);
      if (filter?.dateTo) q = q.lte("date", filter.dateTo);
      if (filter?.status) q = q.eq("status", filter.status);

      const { data, error } = await q;
      if (error) {
        if (!useRepositoryTestFallbacks()) {
          return handleSupabaseReadError("doctor_schedules", error, []);
        }
      } else if (data) {
        let mapped = data.map((r: any) => ({
          id: r.id,
          doctorId: r.doctor_id,
          branchId: r.branch_id,
          date: r.date,
          startTime: r.start_time,
          endTime: r.end_time,
          status: (r.status as ScheduleStatus) || ScheduleStatus.ACTIVE,
          notes: r.notes || undefined,
          isLocalOnly: false,
          syncStatus: "SYNCED" as const,
          createdAt: r.created_at,
          updatedAt: r.updated_at
        }));

        if (effBranch) {
          mapped = mapped.filter((s: DoctorSchedule) => isBranchMatch(s.branchId, effBranch, cachedBranches));
        }

        return mapped;
      }
    }

    // 3. Fallback Mode with flexible branch matching
    let fallback = this.getFallbackSchedules().map((s) => ({
      ...s,
      isLocalOnly: true,
      syncStatus: "LOCAL_ONLY" as const
    }));
    const effBranch = (currentUserRole === UserRole.BRANCH_ADMIN || currentUserRole === UserRole.DOCTOR_ASSISTANT) && userBranchId ? userBranchId : filter?.branchId;
    if (effBranch) {
      fallback = fallback.filter((s) => isBranchMatch(s.branchId, effBranch, cachedBranches));
    }
    if (filter?.doctorId) {
      fallback = fallback.filter((s) => s.doctorId === filter.doctorId);
    }
    if (filter?.date) {
      fallback = fallback.filter((s) => s.date === filter.date);
    }
    if (filter?.status) {
      fallback = fallback.filter((s) => s.status === filter.status);
    }

    return fallback;
  }

  async getScheduleById(id: string): Promise<DoctorSchedule | null> {
    if (!useRepositoryTestFallbacks()) ensureSupabaseConnected();
    if (isSupabaseConfigured && supabase) {
      if (!isValidUUID(id)) return null;
      const { data, error } = await supabase
        .from("doctor_schedules")
        .select("id, doctor_id, branch_id, date, start_time, end_time, status, notes, created_at, updated_at")
        .eq("id", id)
        .single();
      if (error) {
        if (error.code === "PGRST116") return null;
        if (error.code === "42501" || error.message?.includes("permission denied")) {
          console.warn("[Supabase RLS] Read restricted for schedule ID:", id);
          return null;
        }
        throw new Error(`Gagal membaca jadwal dari Supabase: ${error.message}`);
      }
      return {
        id: data.id,
        doctorId: data.doctor_id,
        branchId: data.branch_id,
        date: data.date,
        startTime: data.start_time,
        endTime: data.end_time,
        status: (data.status as ScheduleStatus) || ScheduleStatus.ACTIVE,
        notes: data.notes || undefined,
        isLocalOnly: false,
        syncStatus: "SYNCED" as const,
        createdAt: data.created_at,
        updatedAt: data.updated_at
      };
    }

    const fallback = this.getFallbackSchedules();
    const item = fallback.find((s) => s.id === id);
    return item ? { ...item, isLocalOnly: true, syncStatus: "LOCAL_ONLY" } : null;
  }

  async createSchedule(
    data: Omit<DoctorSchedule, "id" | "createdAt" | "updatedAt"> & { id?: string },
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<DoctorSchedule> {
    if (!useRepositoryTestFallbacks()) ensureSupabaseConnected();
    const cachedBranches = this.getFallbackBranches();
    // 1. Strict Multi-Branch Isolation Check
    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId && !isBranchMatch(data.branchId, userBranchId, cachedBranches)) {
      throw new Error("Branch Admin tidak diizinkan membuat jadwal untuk cabang lain");
    }

    // 2. Production Remote Supabase Execution
    if (isSupabaseConfigured && supabase) {
      // Authenticated session validation (no anon / simulated writes)
      await this.assertAuthenticatedSession();

      if (!isValidUUID(data.doctorId) || !isValidUUID(data.branchId)) {
        throw new Error("ID Dokter atau ID Cabang tidak valid (Format UUID diperlukan untuk database Supabase).");
      }

      const payload: any = {
        doctor_id: data.doctorId,
        branch_id: data.branchId,
        date: data.date,
        start_time: data.startTime,
        end_time: data.endTime,
        status: data.status || ScheduleStatus.ACTIVE,
        notes: data.notes || null
      };
      if (data.id && isValidUUID(data.id)) payload.id = data.id;

      const { data: created, error } = await supabase.from("doctor_schedules").insert(payload).select().single();
      if (error) {
        if (error.code === "42501" || error.message?.includes("permission denied")) {
          throw new Error(`Akses ditolak (Supabase 42501): Pengguna tidak memiliki izin RLS untuk mengelola jadwal pada cabang '${data.branchId}'.`);
        }
        throw new Error(`Gagal menyimpan jadwal ke Supabase: ${error.message}`);
      }

      return {
        id: created.id,
        doctorId: created.doctor_id,
        branchId: created.branch_id,
        date: created.date,
        startTime: created.start_time,
        endTime: created.end_time,
        status: (created.status as ScheduleStatus) || ScheduleStatus.ACTIVE,
        notes: created.notes || undefined,
        isLocalOnly: false,
        syncStatus: "SYNCED" as const,
        createdAt: created.created_at,
        updatedAt: created.updated_at
      };
    }

    if (!useRepositoryTestFallbacks()) {
      throw new Error("Jadwal dokter tidak tersimpan ke Supabase.");
    }
    // 3. Test fallback mode (explicitly marked as LOCAL_ONLY)
    const now = new Date().toISOString();
    const scheduleId = data.id || (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `sch-${Date.now()}`);
    const localSchedule: DoctorSchedule = {
      id: scheduleId,
      doctorId: data.doctorId,
      branchId: data.branchId,
      date: data.date,
      startTime: data.startTime,
      endTime: data.endTime,
      status: data.status || ScheduleStatus.ACTIVE,
      notes: data.notes,
      isLocalOnly: true,
      syncStatus: "LOCAL_ONLY" as const,
      createdAt: now,
      updatedAt: now
    };

    const existing = this.getFallbackSchedules();
    const updated = [localSchedule, ...existing.filter((s) => s.id !== scheduleId)];
    this.saveFallbackSchedules(updated);
    return localSchedule;
  }

  async updateSchedule(
    id: string,
    updates: Partial<Omit<DoctorSchedule, "id" | "createdAt" | "updatedAt">>,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<DoctorSchedule> {
    if (!useRepositoryTestFallbacks()) ensureSupabaseConnected();
    const cachedBranches = this.getFallbackBranches();
    // 1. Strict Multi-Branch Isolation Check
    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId) {
      const existing = await this.getScheduleById(id);
      if (existing && !isBranchMatch(existing.branchId, userBranchId, cachedBranches)) {
        throw new Error("Branch Admin tidak diizinkan mengubah jadwal cabang lain");
      }
      if (updates.branchId && !isBranchMatch(updates.branchId, userBranchId, cachedBranches)) {
        throw new Error("Branch Admin tidak diizinkan mengubah jadwal ke cabang lain");
      }
    }

    // 2. Production Remote Supabase Execution
    if (isSupabaseConfigured && supabase) {
      await this.assertAuthenticatedSession();

      if (!isValidUUID(id)) {
        throw new Error("ID Jadwal tidak valid (Format UUID diperlukan untuk database Supabase).");
      }

      const payload: any = { updated_at: new Date().toISOString() };
      if (updates.branchId) payload.branch_id = updates.branchId;
      if (updates.doctorId) payload.doctor_id = updates.doctorId;
      if (updates.date) payload.date = updates.date;
      if (updates.startTime) payload.start_time = updates.startTime;
      if (updates.endTime) payload.end_time = updates.endTime;
      if (updates.status) payload.status = updates.status;
      if (updates.notes !== undefined) payload.notes = updates.notes;

      const { data, error } = await supabase.from("doctor_schedules").update(payload).eq("id", id).select().single();
      if (error) {
        if (error.code === "42501" || error.message?.includes("permission denied")) {
          throw new Error(`Akses ditolak (Supabase 42501): Pengguna tidak memiliki izin RLS untuk memperbarui jadwal.`);
        }
        throw new Error(`Gagal memperbarui jadwal di Supabase: ${error.message}`);
      }

      return {
        id: data.id,
        doctorId: data.doctor_id,
        branchId: data.branch_id,
        date: data.date,
        startTime: data.start_time,
        endTime: data.end_time,
        status: (data.status as ScheduleStatus) || ScheduleStatus.ACTIVE,
        notes: data.notes || undefined,
        isLocalOnly: false,
        syncStatus: "SYNCED" as const,
        createdAt: data.created_at,
        updatedAt: data.updated_at
      };
    }

    if (!useRepositoryTestFallbacks()) {
      throw new Error("Jadwal dokter tidak diperbarui di Supabase.");
    }
    // 3. Test fallback mode
    const now = new Date().toISOString();
    const existing = this.getFallbackSchedules();
    const item = existing.find((s) => s.id === id);
    if (!item) {
      throw new Error("Jadwal dokter tidak ditemukan.");
    }

    const updatedItem: DoctorSchedule = {
      ...item,
      ...updates,
      isLocalOnly: true,
      syncStatus: "LOCAL_ONLY" as const,
      updatedAt: now
    };

    const newSchedules = existing.map((s) => (s.id === id ? updatedItem : s));
    this.saveFallbackSchedules(newSchedules);
    return updatedItem;
  }

  async cancelSchedule(
    id: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<DoctorSchedule> {
    return this.updateSchedule(id, { status: ScheduleStatus.CANCELLED }, currentUserRole, userBranchId);
  }
}

export class SupabaseStaffRepository implements StaffRepository {
  private mapStaffFromDb(row: any): Staff {
    return {
      id: row.id,
      employeeCode: row.employee_code,
      nik: row.nik ?? null,
      fullName: row.full_name,
      phone: row.phone,
      position: row.position,
      employmentStatus: row.employment_status,
      joinDate: row.join_date,
      active: row.active,
      notes: row.notes,
      branchId: row.branch_id,
      userAccountId: row.user_account_id,
      profilePhotoPath: row.profile_photo_path ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  async getStaff(filter?: StaffFilter, currentUserRole?: UserRole, userBranchId?: string | null): Promise<Staff[]> {
    ensureSupabaseConnected();
    let q = supabase.from("staff").select("*");
    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId) {
      q = q.eq("branch_id", userBranchId);
    }
    if (filter?.branchId) q = q.eq("branch_id", filter.branchId);
    if (filter?.position) q = q.eq("position", filter.position);
    if (filter?.employmentStatus) q = q.eq("employment_status", filter.employmentStatus);
    if (filter?.activeOnly) q = q.eq("active", true);

    const { data, error } = await q;
    if (error) return handleSupabaseReadError("staff", error, []);
    return (data || []).map(this.mapStaffFromDb);
  }

  async getStaffById(id: string): Promise<Staff | null> {
    ensureSupabaseConnected();
    const { data, error } = await supabase.from("staff").select("*").eq("id", id).maybeSingle();
    if (error) return handleSupabaseReadError("staff", error, null);
    if (!data) return null;
    return this.mapStaffFromDb(data);
  }

  async getStaffByEmployeeCode(employeeCode: string): Promise<Staff | null> {
    ensureSupabaseConnected();
    const { data, error } = await supabase.from("staff").select("*").eq("employee_code", employeeCode).maybeSingle();
    if (error) return handleSupabaseReadError("staff", error, null);
    if (!data) return null;
    return this.mapStaffFromDb(data);
  }

  async createStaff(data: Omit<Staff, "id" | "createdAt" | "updatedAt"> & { id?: string }, currentUserRole?: UserRole, userBranchId?: string | null): Promise<Staff> {
    ensureSupabaseConnected();

    const initialEmployeeCode = (data.employeeCode || "").trim();
    let employeeCode = initialEmployeeCode || `STF-${Date.now().toString().slice(-6)}`;
    let counter = 1;

    while (true) {
      const { data: existing, error } = await supabase
        .from("staff")
        .select("id")
        .eq("employee_code", employeeCode)
        .maybeSingle();

      if (error || !existing) break;
      employeeCode = `STF-${Date.now().toString().slice(-6)}-${String(counter).padStart(3, "0")}`;
      counter += 1;
    }

    const payload: any = {
      employee_code: employeeCode,
      full_name: data.fullName,
      phone: data.phone,
      position: data.position,
      employment_status: data.employmentStatus,
      join_date: data.joinDate,
      active: data.active,
      notes: data.notes,
      branch_id: data.branchId || (currentUserRole === UserRole.BRANCH_ADMIN ? userBranchId : null)
    };
    if (data.nik?.trim()) payload.nik = data.nik.trim();
    if (data.userAccountId !== undefined) payload.user_account_id = data.userAccountId;
    if (data.id) payload.id = data.id;

    const { data: inserted, error } = await supabase.from("staff").insert(payload).select().single();
    if (error) throw new Error(`Gagal membuat staff: ${error.message}`);
    return this.mapStaffFromDb(inserted);
  }

  async updateStaff(id: string, updates: Partial<Omit<Staff, "id" | "createdAt" | "updatedAt">>, currentUserRole?: UserRole, userBranchId?: string | null): Promise<Staff> {
    ensureSupabaseConnected();
    const payload: any = {};
    if (updates.employeeCode) payload.employee_code = updates.employeeCode;
    if (updates.nik?.trim()) payload.nik = updates.nik.trim();
    if (updates.fullName) payload.full_name = updates.fullName;
    if (updates.phone) payload.phone = updates.phone;
    if (updates.position) payload.position = updates.position;
    if (updates.employmentStatus) payload.employment_status = updates.employmentStatus;
    if (updates.joinDate) payload.join_date = updates.joinDate;
    if (updates.active !== undefined) payload.active = updates.active;
    if (updates.notes !== undefined) payload.notes = updates.notes;
    if (updates.branchId !== undefined) payload.branch_id = updates.branchId;
    if (updates.userAccountId !== undefined) payload.user_account_id = updates.userAccountId;

    const { data: updated, error } = await supabase.from("staff").update(payload).eq("id", id).select().single();
    if (error) throw new Error(`Gagal memperbarui staff: ${error.message}`);
    return this.mapStaffFromDb(updated);
  }

  async deactivateStaff(id: string, currentUserRole?: UserRole, userBranchId?: string | null): Promise<Staff> {
    return this.updateStaff(id, { active: false, employmentStatus: EmploymentStatus.INACTIVE }, currentUserRole, userBranchId);
  }

  async deleteStaff(id: string, currentUserRole?: UserRole, userBranchId?: string | null): Promise<boolean> {
    ensureSupabaseConnected();
    const { error } = await supabase.from("staff").delete().eq("id", id);
    return !error;
  }
}

// =====================================================================
// 18. SUPABASE COMPENSATION REPOSITORY
// =====================================================================
export class SupabaseCompensationRepository implements CompensationRepository {
  private mapCompensationRuleFromDb(row: any): StaffCompensationRule {
    return {
      id: row.id,
      staffId: row.staff_id,
      name: row.name,
      ruleTypeSnapshot: row.rule_type_snapshot,
      valueSnapshot: Number(row.value_snapshot) || 0,
      isActive: row.is_active ?? true,
      serviceId: row.service_id ?? null,
      branchId: row.branch_id ?? null,
      effectiveStartDate: row.effective_start_date ?? undefined,
      effectiveEndDate: row.effective_end_date ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private mapCompensationAccrualFromDb(row: any): CompensationAccrual {
    return {
      id: row.id,
      staffId: row.staff_id,
      branchId: row.branch_id ?? null,
      ruleIdSnapshot: row.rule_id_snapshot,
      ruleTypeSnapshot: row.rule_type_snapshot,
      valueSnapshot: Number(row.value_snapshot) || 0,
      baseAmountSnapshot: Number(row.base_amount_snapshot) || 0,
      amount: Number(row.amount) || 0,
      sourceId: row.source_id,
      accruedAt: row.accrued_at
    };
  }

  async getCompensationRules(): Promise<StaffCompensationRule[]> {
    ensureSupabaseConnected();
    const { data, error } = await supabase
      .from("staff_compensation_rules")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) return handleSupabaseReadError("staff_compensation_rules", error, []);
    return (data || []).map((row: any) => this.mapCompensationRuleFromDb(row));
  }
  async getCompensationRulesByStaff(staffId: string): Promise<StaffCompensationRule[]> {
    const all = await this.getCompensationRules();
    const candidateIds = new Set<string>([staffId]);

    const { data: staffData, error: staffError } = await supabase.from("staff").select("id,user_account_id").eq("id", staffId).maybeSingle();
    if (!staffError && staffData) {
      candidateIds.add(staffData.id);
      if (staffData.user_account_id) candidateIds.add(staffData.user_account_id);
    }

    const { data: doctorData, error: doctorError } = await supabase
      .from("dental_doctors")
      .select("id,staff_id")
      .or(`id.eq.${staffId},staff_id.eq.${staffId}`)
      .maybeSingle();
    if (!doctorError && doctorData) {
      candidateIds.add(doctorData.id);
      if (doctorData.staff_id) candidateIds.add(doctorData.staff_id);
    }

    return all.filter((r) => candidateIds.has(r.staffId));
  }
  async createCompensationRule(data: Omit<StaffCompensationRule, "id" | "createdAt" | "updatedAt"> & { id?: string }): Promise<StaffCompensationRule> {
    ensureSupabaseConnected();
    if (!isValidUUID(data.staffId)) {
      throw new Error("Penerima aturan kompensasi harus terhubung ke data karyawan Supabase.");
    }
    if (!data.name.trim()) throw new Error("Nama aturan kompensasi wajib diisi.");
    if (
      !Number.isFinite(data.valueSnapshot) ||
      (data.ruleTypeSnapshot === "TAX_PERCENTAGE" ? data.valueSnapshot < 0 : data.valueSnapshot <= 0)
    ) {
      throw new Error("Nilai kompensasi harus lebih besar dari 0.");
    }
    if (
      (data.ruleTypeSnapshot === "PERCENTAGE" || data.ruleTypeSnapshot === "TAX_PERCENTAGE") &&
      data.valueSnapshot > 100
    ) {
      throw new Error("Persentase kompensasi tidak boleh lebih dari 100%.");
    }
    if (data.ruleTypeSnapshot === "TAX_PERCENTAGE" && !data.branchId) {
      throw new Error("Aturan pajak harus ditetapkan untuk cabang tertentu.");
    }
    if (data.serviceId && !isValidUUID(data.serviceId)) {
      throw new Error("Layanan kompensasi tidak valid. Muat ulang daftar layanan, lalu coba lagi.");
    }
    if (data.branchId && !isValidUUID(data.branchId)) {
      throw new Error("Cabang kompensasi tidak valid. Muat ulang daftar cabang, lalu coba lagi.");
    }

    const now = AppClock.nowISO();
    const payload: Record<string, unknown> = {
      staff_id: data.staffId,
      name: data.name.trim(),
      rule_type_snapshot: data.ruleTypeSnapshot,
      value_snapshot: data.valueSnapshot,
      is_active: data.isActive ?? true,
      service_id: data.serviceId || null,
      branch_id: data.branchId || null,
      effective_start_date: data.effectiveStartDate || null,
      effective_end_date: data.effectiveEndDate || null,
      created_at: now,
      updated_at: now
    };
    if (data.id) {
      if (!isValidUUID(data.id)) throw new Error("ID aturan kompensasi tidak valid.");
      payload.id = data.id;
    }

    const { data: created, error } = await supabase
      .from("staff_compensation_rules")
      .insert(payload)
      .select("*")
      .single();
    if (error) throw new Error(`Gagal menyimpan aturan kompensasi: ${error.message}`);
    return this.mapCompensationRuleFromDb(created);
  }
  async updateCompensationRule(id: string, updates: Partial<Omit<StaffCompensationRule, "id" | "createdAt" | "updatedAt">>): Promise<StaffCompensationRule> {
    ensureSupabaseConnected();
    if (!isValidUUID(id)) throw new Error("ID aturan kompensasi tidak valid.");
    const payload: Record<string, unknown> = { updated_at: AppClock.nowISO() };
    if (updates.staffId !== undefined) {
      if (!isValidUUID(updates.staffId)) throw new Error("Penerima aturan kompensasi tidak valid.");
      payload.staff_id = updates.staffId;
    }
    if (updates.name !== undefined) {
      if (!updates.name.trim()) throw new Error("Nama aturan kompensasi wajib diisi.");
      payload.name = updates.name.trim();
    }
    if (updates.ruleTypeSnapshot !== undefined) payload.rule_type_snapshot = updates.ruleTypeSnapshot;
    if (updates.valueSnapshot !== undefined) {
      if (!Number.isFinite(updates.valueSnapshot) || updates.valueSnapshot <= 0) {
        throw new Error("Nilai kompensasi harus lebih besar dari 0.");
      }
      if (updates.ruleTypeSnapshot === "PERCENTAGE" && updates.valueSnapshot > 100) {
        throw new Error("Persentase kompensasi tidak boleh lebih dari 100%.");
      }
      payload.value_snapshot = updates.valueSnapshot;
    }
    if (updates.isActive !== undefined) payload.is_active = updates.isActive;
    if (updates.serviceId !== undefined) {
      if (updates.serviceId && !isValidUUID(updates.serviceId)) throw new Error("Layanan kompensasi tidak valid.");
      payload.service_id = updates.serviceId || null;
    }
    if (updates.branchId !== undefined) {
      if (updates.branchId && !isValidUUID(updates.branchId)) throw new Error("Cabang kompensasi tidak valid.");
      payload.branch_id = updates.branchId || null;
    }
    if (updates.effectiveStartDate !== undefined) payload.effective_start_date = updates.effectiveStartDate || null;
    if (updates.effectiveEndDate !== undefined) payload.effective_end_date = updates.effectiveEndDate || null;

    const { data, error } = await supabase
      .from("staff_compensation_rules")
      .update(payload)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new Error(`Gagal memperbarui aturan kompensasi: ${error.message}`);
    return this.mapCompensationRuleFromDb(data);
  }
  async getCompensationAccruals(staffId?: string): Promise<CompensationAccrual[]> {
    ensureSupabaseConnected();
    if (!staffId) {
      const { data, error } = await supabase.from("compensation_accruals").select("*").order("accrued_at", { ascending: false });
      if (error) return handleSupabaseReadError("compensation_accruals", error, []);
      return (data || []).map((row: any) => this.mapCompensationAccrualFromDb(row));
    }

    const candidateIds = new Set<string>([staffId]);
    const { data: staffData, error: staffError } = await supabase.from("staff").select("id,user_account_id").eq("id", staffId).maybeSingle();
    if (!staffError && staffData) {
      candidateIds.add(staffData.id);
      if (staffData.user_account_id) candidateIds.add(staffData.user_account_id);
    }

    const { data: doctorData, error: doctorError } = await supabase
      .from("dental_doctors")
      .select("id,staff_id")
      .or(`id.eq.${staffId},staff_id.eq.${staffId}`)
      .maybeSingle();
    if (!doctorError && doctorData) {
      candidateIds.add(doctorData.id);
      if (doctorData.staff_id) candidateIds.add(doctorData.staff_id);
    }

    const { data, error } = await supabase.from("compensation_accruals").select("*").order("accrued_at", { ascending: false });
    if (error) return handleSupabaseReadError("compensation_accruals", error, []);
    return (data || [])
      .filter((row: any) => candidateIds.has(row.staff_id))
      .map((row: any) => this.mapCompensationAccrualFromDb(row));
  }
  async calculateAndAccrueForTreatment(treatmentJobId: string): Promise<CompensationAccrual[]> {
    ensureSupabaseConnected();
    if (!isValidUUID(treatmentJobId)) throw new Error("ID tindakan tidak valid.");

    const { data: job, error: jobError } = await supabase
      .from("treatment_jobs")
      .select("id, doctor_id, external_doctor_id, pic_assistant_id, service_id, branch_id, visit_id, patient_id, status, completed_at")
      .eq("id", treatmentJobId)
      .single();
    if (jobError || !job) throw new Error(`Gagal memuat tindakan untuk menghitung kompensasi: ${jobError?.message || "data tidak ditemukan"}`);
    if (job.status !== TreatmentJobStatus.SELESAI && job.status !== TreatmentJobStatus.DISERAHKAN) {
      throw new Error("Akrual kompensasi hanya dapat dihitung untuk treatment yang sudah SELESAI atau DISERAHKAN");
    }
    if (job.external_doctor_id) return [];

    const { data: invoices, error: invoicesError } = await supabase
      .from("invoices")
      .select("id, patient_id, net_amount, total_amount, discount_amount, updated_at")
      .eq("visit_id", job.visit_id)
      .eq("status", "PAID");
    if (invoicesError) throw new Error(`Gagal memeriksa pelunasan invoice tindakan: ${invoicesError.message}`);
    if (!invoices?.length) return [];
    if (invoices.length > 1) throw new Error("Tindakan terhubung ke lebih dari satu invoice lunas. Periksa data tagihan sebelum menghitung kompensasi.");

    const invoice = invoices[0];
    const { data: invoiceItems, error: invoiceItemsError } = await supabase
      .from("invoice_items")
      .select("id, amount, treatment_job_id")
      .eq("invoice_id", invoice.id);
    if (invoiceItemsError) throw new Error(`Gagal memuat rincian invoice tindakan: ${invoiceItemsError.message}`);
    const linkedItems = (invoiceItems || []).filter((item: any) => item.treatment_job_id === treatmentJobId);
    if (!linkedItems.length) return [];
    if (linkedItems.length > 1) throw new Error("Tindakan tertaut ke lebih dari satu baris invoice.");

    const allocations = allocateInvoiceNetToLines(
      (invoiceItems || []).map((item: any) => ({ id: item.id, amount: Number(item.amount) || 0 })),
      Math.max(0, (Number(invoice.total_amount) || 0) - (Number(invoice.discount_amount) || 0))
    );
    const baseAmount = allocations.get(linkedItems[0].id) || 0;

    let doctorStaffId: string | null = null;
    if (job.doctor_id) {
      const { data: doctor, error: doctorError } = await supabase
        .from("dental_doctors")
        .select("staff_id")
        .eq("id", job.doctor_id)
        .single();
      if (doctorError) throw new Error(`Gagal memuat data dokter untuk kompensasi: ${doctorError.message}`);
      doctorStaffId = doctor?.staff_id || null;
    }

    const staffIds = [...new Set([doctorStaffId, job.pic_assistant_id].filter((id): id is string => Boolean(id)))];

    const { data: ruleRows, error: rulesError } = await supabase
      .from("staff_compensation_rules")
      .select("*")
      .in("staff_id", staffIds);
    if (rulesError) throw new Error(`Gagal memuat aturan kompensasi tindakan: ${rulesError.message}`);

    const treatmentDate = (job.completed_at || invoice.updated_at || AppClock.nowISO()).slice(0, 10);
    const applicableRules = (ruleRows || [])
      .map((row: any) => this.mapCompensationRuleFromDb(row))
      .filter((rule) =>
        rule.isActive
        && rule.ruleTypeSnapshot !== "BASE_SALARY"
        && rule.ruleTypeSnapshot !== "DOCTOR_SITTING_FEE"
        && rule.ruleTypeSnapshot !== "TAX_PERCENTAGE"
        && (!rule.serviceId || rule.serviceId === job.service_id)
        && (!rule.branchId || rule.branchId === job.branch_id)
        && (!rule.effectiveStartDate || rule.effectiveStartDate <= treatmentDate)
        && (!rule.effectiveEndDate || rule.effectiveEndDate >= treatmentDate)
      );
    const { data: existingRows, error: existingError } = await supabase
      .from("compensation_accruals")
      .select("staff_id, rule_id_snapshot")
      .eq("source_id", treatmentJobId);
    if (existingError) throw new Error(`Gagal memeriksa akrual kompensasi yang sudah ada: ${existingError.message}`);

    const existingKeys = new Set((existingRows || []).map((row: any) => `${row.staff_id}:${row.rule_id_snapshot}`));
    const accruedAt = invoice.updated_at || AppClock.nowISO();
    const payload = applicableRules.flatMap((rule) => {
      const staffId = rule.staffId;
      const key = `${staffId}:${rule.id}`;
      if (existingKeys.has(key)) return [];
      const value = Number(rule.valueSnapshot) || 0;
      const amount = rule.ruleTypeSnapshot === "PERCENTAGE"
        ? Math.round((baseAmount * value) / 100)
        : rule.ruleTypeSnapshot === "FIXED_PER_TREATMENT"
          ? Math.round(value)
          : 0;
      if (amount <= 0) return [];
      return [{
        staff_id: staffId,
        branch_id: job.branch_id,
        rule_id_snapshot: rule.id,
        rule_type_snapshot: rule.ruleTypeSnapshot,
        value_snapshot: value,
        base_amount_snapshot: baseAmount,
        amount,
        source_id: treatmentJobId,
        accrued_at: accruedAt
      }];
    });
    let createdAccruals: CompensationAccrual[] = [];
    if (payload.length > 0) {
      const { data: created, error: createError } = await supabase
        .from("compensation_accruals")
        .upsert(payload, {
          onConflict: "source_id,staff_id,rule_id_snapshot",
          ignoreDuplicates: true
        })
        .select("*");
      if (createError) throw new Error(`Gagal mencatat akrual kompensasi: ${createError.message}`);
      createdAccruals = (created || []).map((row: any) => this.mapCompensationAccrualFromDb(row));
    }

    const { data: patient, error: patientError } = await supabase
      .from("patient_profiles")
      .select("referring_staff_id")
      .eq("id", invoice.patient_id)
      .maybeSingle();
    if (patientError) throw new Error(`Gagal memuat Admin perujuk pasien: ${patientError.message}`);
    const referringStaffId = patient?.referring_staff_id;
    if (referringStaffId) {
      const referralSourceId = `referral:${invoice.patient_id}`;
      const referralRuleId = "ADMIN_REFERRAL_RP3000_V1";
      const { data: existingReferral, error: existingReferralError } = await supabase
        .from("compensation_accruals")
        .select("id")
        .eq("source_id", referralSourceId)
        .eq("rule_id_snapshot", referralRuleId)
        .maybeSingle();
      if (existingReferralError) throw new Error(`Gagal memeriksa insentif referral yang sudah ada: ${existingReferralError.message}`);
      if (!existingReferral) {
        const { data: referral, error: referralError } = await supabase
          .from("compensation_accruals")
          .insert({
            staff_id: referringStaffId,
            branch_id: job.branch_id,
            rule_id_snapshot: referralRuleId,
            rule_type_snapshot: "ADMIN_REFERRAL",
            value_snapshot: 3000,
            base_amount_snapshot: Number(invoice.net_amount) || 0,
            amount: 3000,
            source_id: referralSourceId,
            accrued_at: accruedAt
          })
          .select("*")
          .single();
        if (referralError) throw new Error(`Gagal mencatat insentif referral Admin: ${referralError.message}`);
        if (referral) createdAccruals.push(this.mapCompensationAccrualFromDb(referral));
      }
    }

    return createdAccruals;
  }
  async deleteAccrual(id: string, currentUserRole?: UserRole): Promise<boolean> {
    ensureSupabaseConnected();
    if (currentUserRole && currentUserRole !== UserRole.SUPER_ADMIN && currentUserRole !== UserRole.BRANCH_ADMIN) {
      throw new Error("Akses ditolak: Hanya Super Admin atau Branch Admin yang dapat menghapus akrual kompensasi.");
    }
    if (!isValidUUID(id)) throw new Error("ID akrual kompensasi tidak valid.");
    const { data: payrollItems, error: payrollItemsError } = await supabase
      .from("payroll_items")
      .select("id")
      .eq("source_id", id)
      .limit(1);
    if (payrollItemsError) throw new Error(`Gagal memeriksa penggunaan akrual di payroll: ${payrollItemsError.message}`);
    if ((payrollItems || []).length > 0) {
      throw new Error("Akrual ini sudah dimasukkan ke rincian payroll dan tidak dapat dihapus.");
    }
    const { data: journals, error: journalsError } = await supabase
      .from("journal_entries")
      .select("id")
      .eq("source_type", JournalSourceType.COMPENSATION)
      .eq("source_id", id)
      .limit(1);
    if (journalsError) throw new Error(`Gagal memeriksa jurnal akrual: ${journalsError.message}`);
    if ((journals || []).length > 0) {
      throw new Error("Akrual ini sudah memiliki jurnal akuntansi. Batalkan melalui proses koreksi jurnal sebelum menghapus sumbernya.");
    }
    const { data, error } = await supabase
      .from("compensation_accruals")
      .delete()
      .eq("id", id)
      .select("id");
    if (error) throw new Error(`Gagal menghapus akrual kompensasi: ${error.message}`);
    return (data || []).length > 0;
  }
  async deleteCompensationRule(id: string, currentUserRole?: UserRole): Promise<boolean> {
    ensureSupabaseConnected();
    if (currentUserRole && currentUserRole !== UserRole.SUPER_ADMIN) {
      throw new Error("Akses ditolak: Hanya Super Admin yang dapat menghapus aturan kompensasi.");
    }
    if (!isValidUUID(id)) throw new Error("ID aturan kompensasi tidak valid.");
    const { data, error } = await supabase
      .from("staff_compensation_rules")
      .delete()
      .eq("id", id)
      .select("id");
    if (error) throw new Error(`Gagal menghapus aturan kompensasi: ${error.message}`);
    return (data || []).length > 0;
  }
}

// =====================================================================
// 19. SUPABASE PAYROLL REPOSITORY
// =====================================================================
export class SupabasePayrollRepository implements PayrollRepository {
  private mapPayrollFromDb(row: any): MonthlyPayroll {
    return {
      id: row.id,
      staffId: row.staff_id,
      month: row.month,
      year: row.year,
      baseSalary: Number(row.base_salary) || 0,
      totalCompensation: Number(row.total_compensation) || 0,
      totalDeductions: Number(row.total_deductions) || 0,
      netSalary: Number(row.net_salary) || 0,
      status: row.status,
      branchId: row.branch_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private mapPayrollItemFromDb(row: any): PayrollItem {
    return {
      id: row.id,
      payrollId: row.payroll_id,
      descriptionSnapshot: row.description_snapshot || "Item",
      amountSnapshot: Number(row.amount_snapshot) || 0,
      type: row.type || "EARNING",
      sourceId: row.source_id || undefined
    };
  }

  async getPayrolls(month?: number, year?: number): Promise<MonthlyPayroll[]> {
    ensureSupabaseConnected();
    let q = supabase.from("monthly_payrolls").select("*");
    if (month !== undefined) q = q.eq("month", month);
    if (year !== undefined) q = q.eq("year", year);
    const { data, error } = await q;
    if (error) return handleSupabaseReadError("monthly_payrolls", error, []);
    return (data || []).map((row: any) => this.mapPayrollFromDb(row));
  }
  async getPayrollById(id: string): Promise<MonthlyPayroll | null> {
    ensureSupabaseConnected();
    const { data, error } = await supabase.from("monthly_payrolls").select("*").eq("id", id).maybeSingle();
    if (error) return handleSupabaseReadError("monthly_payrolls", error, null);
    return data ? this.mapPayrollFromDb(data) : null;
  }
  async getPayrollItems(payrollId: string): Promise<PayrollItem[]> {
    ensureSupabaseConnected();
    const { data, error } = await supabase.from("payroll_items").select("*").eq("payroll_id", payrollId);
    if (error) return handleSupabaseReadError("payroll_items", error, []);
    return (data || []).map((row: any) => this.mapPayrollItemFromDb(row));
  }
  async getPayrollItemsByPayrollIds(payrollIds: string[]): Promise<PayrollItem[]> {
    ensureSupabaseConnected();
    if (payrollIds.length === 0) return [];
    const { data, error } = await supabase
      .from("payroll_items")
      .select("*")
      .in("payroll_id", payrollIds);
    if (error) return handleSupabaseReadError("payroll_items", error, []);
    return (data || []).map((row: any) => this.mapPayrollItemFromDb(row));
  }
  async generateMonthlyPayroll(
    staffId: string,
    month: number,
    year: number,
    baseSalary?: number,
    preserveExisting = false,
    requestedBranchId?: string | null
  ): Promise<MonthlyPayroll> {
    ensureSupabaseConnected();
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      throw new Error("Periode payroll tidak valid: bulan harus antara 1 dan 12.");
    }
    if (!Number.isInteger(year) || year < 2020) {
      throw new Error("Periode payroll tidak valid: tahun harus 2020 atau lebih baru.");
    }

    let staffQuery = supabase.from("staff").select("id, branch_id, user_account_id, position").eq("id", staffId).maybeSingle();
    let staff = (await staffQuery).data;
    let doctor: any = null;

    if (!staff || staff.position === StaffPosition.DOCTOR) {
      const { data: linkedDoctor, error: doctorError } = await supabase
        .from("dental_doctors")
        .select("id, staff_id, assigned_branch_id")
        .or(`id.eq.${staffId},staff_id.eq.${staffId}`)
        .maybeSingle();
      if (doctorError) throw new Error(`Gagal memuat data karyawan untuk payroll: ${doctorError.message}`);
      doctor = linkedDoctor;
      if (!staff && !doctor?.staff_id) throw new Error("Karyawan tidak ditemukan. Pastikan dokter sudah ditautkan ke data karyawan.");

      if (!staff && doctor?.staff_id) {
        const { data: staffByDoctor, error: staffByDoctorError } = await supabase
          .from("staff")
          .select("id, branch_id, user_account_id, position")
          .eq("id", doctor.staff_id)
          .maybeSingle();
        if (staffByDoctorError) throw new Error(`Gagal memuat data karyawan untuk payroll: ${staffByDoctorError.message}`);
        if (!staffByDoctor) throw new Error("Karyawan tidak ditemukan. Pastikan dokter sudah ditautkan ke data karyawan.");
        staff = staffByDoctor;
      }
    }
    if (!staff) throw new Error("Karyawan tidak ditemukan untuk payroll.");
    const isDoctor = staff.position === StaffPosition.DOCTOR || Boolean(doctor);

    let branchId = requestedBranchId || staff.branch_id || null;
    if (!branchId) {
      branchId = doctor?.assigned_branch_id || null;
    }

    const candidateIds = new Set<string>([staffId]);
    candidateIds.add(staff.id);
    if (staff.user_account_id) candidateIds.add(staff.user_account_id);

    const periodStart = `${year}-${String(month).padStart(2, "0")}-01`;
    const nextMonth = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
    const periodStartTimestamp = new Date(Date.UTC(year, month - 1, 1)).toISOString();
    const nextMonthTimestamp = new Date(Date.UTC(year, month, 1)).toISOString();
    let existingQuery = supabase
      .from("monthly_payrolls")
      .select("*")
      .in("staff_id", [...candidateIds])
      .eq("month", month)
      .eq("year", year);
    existingQuery = branchId
      ? existingQuery.eq("branch_id", branchId)
      : existingQuery.is("branch_id", null);
    let accrualQuery = supabase
      .from("compensation_accruals")
      .select("id, amount, source_id, accrued_at, staff_id, rule_type_snapshot, branch_id")
      .gte("accrued_at", periodStartTimestamp)
      .lt("accrued_at", nextMonthTimestamp);
    if (branchId) accrualQuery = accrualQuery.eq("branch_id", branchId);
    let overtimeQuery = supabase
      .from("overtime_records")
      .select("id, date, overtime_hours, overtime_amount_snapshot, staff_id, branch_id")
      .eq("status", "APPROVED")
      .gte("date", periodStart)
      .lt("date", nextMonth);
    if (branchId) overtimeQuery = overtimeQuery.eq("branch_id", branchId);
    let attendanceQuery = supabase
      .from("attendances")
      .select("id, staff_id, branch_id, date, attendance_status")
      .in("staff_id", [...candidateIds])
      .gte("date", periodStart)
      .lt("date", nextMonth)
      .in("attendance_status", ["PRESENT", "ABSENT", "SICK", "LEAVE"]);
    if (branchId) attendanceQuery = attendanceQuery.eq("branch_id", branchId);
    let replacementQuery = supabase
      .from("staff_replacement_assignments")
      .select("id,covered_date,branch_id,absent_staff_id,absent_base_salary_snapshot,amount_snapshot")
      .eq("replacement_staff_id", staff.id)
      .gte("covered_date", periodStart)
      .lt("covered_date", nextMonth)
      .not("work_confirmed_at", "is", null);
    if (branchId) replacementQuery = replacementQuery.eq("branch_id", branchId);
    const [
      existingResult,
      accrualsResult,
      overtimeResult,
      attendanceResult,
      replacementResult,
      baseRuleResult,
      doctorSchedulesResult
    ] = await Promise.all([
      existingQuery.maybeSingle(),
      accrualQuery,
      overtimeQuery,
      attendanceQuery,
      replacementQuery,
      supabase
        .from("staff_compensation_rules")
        .select("id, value_snapshot, staff_id, rule_type_snapshot, branch_id, effective_start_date, effective_end_date")
        .in("staff_id", [...candidateIds])
        .eq("is_active", true),
      doctor
        ? supabase
            .from("doctor_schedules")
            .select("id, doctor_id, branch_id, date, status")
            .eq("doctor_id", doctor.id)
            .gte("date", periodStart)
            .lt("date", nextMonth)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (existingResult.error) throw new Error(`Gagal memeriksa payroll periode ini: ${existingResult.error.message}`);
    if (accrualsResult.error) throw new Error(`Gagal memuat komisi tindakan periode ini: ${accrualsResult.error.message}`);
    if (overtimeResult.error) throw new Error(`Gagal memuat lembur yang disetujui: ${overtimeResult.error.message}`);
    if (attendanceResult.error) throw new Error(`Gagal memuat ketidakhadiran periode ini: ${attendanceResult.error.message}`);
    if (replacementResult.error) throw new Error(`Gagal memuat penugasan pengganti terkonfirmasi: ${replacementResult.error.message}`);
    if (baseRuleResult.error) throw new Error(`Gagal memuat aturan kompensasi dan gaji: ${baseRuleResult.error.message}`);
    if (doctor && doctorSchedulesResult.error) throw new Error(`Gagal memuat jadwal dokter untuk kompensasi: ${doctorSchedulesResult.error.message}`);

    const existing = existingResult.data;
    if (existing && preserveExisting) return this.mapPayrollFromDb(existing);
    if (existing && existing.status !== PayrollStatus.DRAFT) {
      throw new Error(`Payroll periode ${month}/${year} sudah berstatus ${existing.status} dan tidak dapat dihitung ulang.`);
    }

    const accruals = (accrualsResult.data || []).filter((row: any) =>
      candidateIds.has(row.staff_id) && (!branchId || row.branch_id === branchId)
    );
    const overtimes = (overtimeResult.data || []).filter((row: any) =>
      !isDoctor && candidateIds.has(row.staff_id) && (!branchId || row.branch_id === branchId)
    );
    const absenceByDate = new Map<string, any>();
    for (const row of attendanceResult.data || []) {
      if (
        candidateIds.has(row.staff_id) &&
        (!branchId || row.branch_id === branchId) &&
        [AttendanceStatus.ABSENT, AttendanceStatus.SICK, AttendanceStatus.LEAVE].includes(row.attendance_status) &&
        !absenceByDate.has(row.date)
      ) {
        absenceByDate.set(row.date, row);
      }
    }
    const periodDate = `${year}-${String(month).padStart(2, "0")}-15`;
    const activeRules = (baseRuleResult.data || []).filter((row: any) =>
      candidateIds.has(row.staff_id) &&
      (!row.branch_id || row.branch_id === branchId) &&
      (!row.effective_start_date || row.effective_start_date <= periodDate) &&
      (!row.effective_end_date || row.effective_end_date >= periodDate)
    );
    const preferredRule = (ruleType: string) =>
      activeRules.find((row: any) => row.rule_type_snapshot === ruleType && branchId && row.branch_id === branchId) ||
      activeRules.find((row: any) => row.rule_type_snapshot === ruleType && !row.branch_id);
    const baseRule = preferredRule("BASE_SALARY");
    const sittingRule = preferredRule("DOCTOR_SITTING_FEE");
    const taxRule = preferredRule("TAX_PERCENTAGE");
    if (baseSalary === undefined && preserveExisting && !baseRule) {
      throw new Error("Draft tidak dibuat: tidak ada aturan gaji pokok aktif untuk periode ini.");
    }
    const salary = Number(baseSalary ?? baseRule?.value_snapshot ?? 0);
    if (!Number.isFinite(salary) || salary < 0) {
      throw new Error("Gaji pokok harus berupa nominal nol atau lebih.");
    }
    let totalCompensation = accruals.reduce((sum: number, row: any) => sum + (Number(row.amount) || 0), 0);
    const presentAttendanceCount = (attendanceResult.data || []).filter((row: any) =>
      candidateIds.has(row.staff_id) && row.attendance_status === AttendanceStatus.PRESENT
    ).length;
    const scheduledSessionCount = (doctorSchedulesResult.data || []).filter((row: any) =>
      row.status !== ScheduleStatus.CANCELLED &&
      (!branchId || row.branch_id === branchId)
    ).length;
    const sittingFeeSessionCount = Math.max(presentAttendanceCount, scheduledSessionCount);
    const sittingFeeAmount = sittingRule
      ? sittingFeeSessionCount * (Number(sittingRule.value_snapshot) || 0)
      : 0;
    totalCompensation += sittingFeeAmount;
    const replacementAssignments = replacementResult.data || [];
    const totalReplacementEarnings = replacementAssignments.reduce(
      (sum: number, row: any) => sum + (Number(row.amount_snapshot) || 0),
      0
    );
    const totalEarnings = totalCompensation + totalReplacementEarnings;
    const overtimeTotal = overtimes.reduce(
      (sum: number, row: any) => sum + (Number(row.overtime_amount_snapshot) || 0),
      0
    );
    const dailySalary = Math.round(Math.round(salary) / 25);
    const absenceRows = [...absenceByDate.values()];
    const dailyAbsenceDeduction = isDoctor ? 60000 : dailySalary;
    const absenceDeductions = absenceRows.length * dailyAbsenceDeduction;
    const grossIncome = Math.round(salary) + totalEarnings + overtimeTotal;
    const taxRate = Number(taxRule?.value_snapshot) || 0;
    const taxAmount = taxRule ? calculatePayrollTax(grossIncome, taxRate) : 0;
    const totalDeductions = absenceDeductions + taxAmount;
    if (grossIncome <= 0) {
      throw new Error("Draft tidak dibuat: total gaji pokok dan komponen pembayaran periode ini bernilai nol.");
    }
    const now = AppClock.nowISO();
    const payrollPayload = {
      staff_id: staff.id,
      branch_id: branchId,
      month,
      year,
      base_salary: Math.round(salary),
      total_compensation: totalEarnings,
      total_deductions: totalDeductions,
      net_salary: grossIncome - totalDeductions,
      status: PayrollStatus.DRAFT,
      updated_at: now
    };

    const payrollItems = [
      {
        description_snapshot: `Gaji Pokok Periode ${month}/${year}`,
        amount_snapshot: Math.round(salary),
        type: "EARNING"
      },
      ...accruals.map((row: any) => ({
        description_snapshot: row.rule_type_snapshot === "ADMIN_REFERRAL"
          ? `Insentif Referral Admin (#${row.source_id || row.id})`
          : isDoctor
            ? `Sharing Dokter - Kompensasi Tindakan (#${row.source_id || row.id})`
            : `Insentif Kompensasi Tindakan (#${row.source_id || row.id})`,
        amount_snapshot: Number(row.amount) || 0,
        type: "EARNING",
        source_id: row.id
      })),
      ...(sittingFeeAmount > 0 ? [{
        description_snapshot: `Sharing Dokter - Doctor Sitting Fee (${sittingFeeSessionCount} sesi)`,
        amount_snapshot: sittingFeeAmount,
        type: "EARNING"
      }] : []),
      ...replacementAssignments.map((row: any) => ({
        description_snapshot: `Upah Pengganti (${row.covered_date}; gaji pegawai digantikan Rp${(Number(row.absent_base_salary_snapshot) || 0).toLocaleString("id-ID")} ÷ 25)`,
        amount_snapshot: Number(row.amount_snapshot) || 0,
        type: "EARNING",
        source_id: row.id
      })),
      ...overtimes
        .filter((row: any) => Number(row.overtime_amount_snapshot) > 0)
        .map((row: any) => ({
          description_snapshot: `Lembur Disetujui (${Number(row.overtime_hours) || 0} jam / ${row.date})`,
          amount_snapshot: Number(row.overtime_amount_snapshot),
          type: "EARNING",
          source_id: row.id
        })),
      ...absenceRows.map((row: any) => ({
        description_snapshot: `Potongan Ketidakhadiran (${row.attendance_status} / ${row.date})`,
        amount_snapshot: dailyAbsenceDeduction,
        type: "DEDUCTION",
        source_id: row.id
      })),
      ...(taxRule ? [{
        description_snapshot: `Potongan Pajak (${taxRate}% dari bruto)`,
        amount_snapshot: taxAmount,
        type: "DEDUCTION"
      }] : [])
    ];
    const { data: payrollRow, error: saveError } = await supabase.rpc("save_draft_payroll_with_items", {
      p_payroll_id: existing?.id || null,
      p_payroll_payload: payrollPayload,
      p_payroll_items: payrollItems
    });
    if (saveError) throw new Error(`Gagal menyimpan payroll dan rincian slip secara konsisten: ${saveError.message}`);
    if (!payrollRow) throw new Error("Payroll tidak dapat disimpan: server tidak mengembalikan data payroll.");

    return this.mapPayrollFromDb(payrollRow);
  }
  async updatePayrollStatus(id: string, status: PayrollStatus): Promise<MonthlyPayroll> {
    ensureSupabaseConnected();
    if (status === PayrollStatus.PAID) {
      const { data, error } = await supabase.rpc("mark_payroll_paid_and_overtime", {
        p_payroll_id: id
      });
      if (error) throw new Error(`Gagal menandai payroll dan lembur terkait sebagai PAID: ${error.message}`);
      if (!data) throw new Error("Payroll tidak ditemukan atau tidak dapat ditandai PAID.");
      return this.mapPayrollFromDb(data);
    }
    const { data, error } = await supabase
      .from("monthly_payrolls")
      .update({ status, updated_at: AppClock.nowISO() })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new Error(`Gagal memperbarui status payroll: ${error.message}`);
    return this.mapPayrollFromDb(data);
  }
  async reopenReviewedPayrollForCorrection(id: string, currentUserRole?: UserRole): Promise<MonthlyPayroll> {
    ensureSupabaseConnected();
    if (currentUserRole !== UserRole.SUPER_ADMIN) {
      throw new Error("Akses ditolak: hanya Super Admin yang dapat mengembalikan payroll REVIEW untuk koreksi.");
    }
    if (!isValidUUID(id)) throw new Error("ID payroll tidak valid.");
    const { data, error } = await supabase.rpc("reopen_reviewed_payroll_for_correction", {
      p_payroll_id: id
    });
    if (error) throw new Error(`Gagal mengembalikan payroll ke DRAFT: ${error.message}`);
    if (!data) throw new Error("Payroll tidak ditemukan atau tidak dapat dikembalikan ke DRAFT.");
    return this.mapPayrollFromDb(data);
  }
  async deletePayroll(id: string, currentUserRole?: UserRole): Promise<boolean> {
    ensureSupabaseConnected();
    if (currentUserRole && currentUserRole !== UserRole.SUPER_ADMIN && currentUserRole !== UserRole.BRANCH_ADMIN) {
      throw new Error("Akses ditolak: Hanya Super Admin atau Branch Admin yang dapat menghapus slip gaji.");
    }
    if (!isValidUUID(id)) throw new Error("ID payroll tidak valid.");
    const { data, error } = await supabase.rpc("delete_unposted_payroll", {
      p_payroll_id: id
    });
    if (error) throw new Error(`Gagal menghapus payroll: ${error.message}`);
    return data === true;
  }
}

// =====================================================================
// 20. SUPABASE ACCOUNTING REPOSITORY
// =====================================================================
export class SupabaseAccountingRepository implements AccountingRepository {
  async getAccounts(filterOrActiveOnly?: any): Promise<ChartOfAccount[]> {
    ensureSupabaseConnected();
    let q = supabase.from("chart_of_accounts").select("*").order("code");
    const { data, error } = await q;
    if (error) return handleSupabaseReadError("chart_of_accounts", error, []);
    return (data || []).map((row: any) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      accountType: row.account_type,
      accountCategory: row.account_category,
      normalBalance: row.normal_balance,
      isActive: row.is_active ?? true,
      description: row.description,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }
  async getAccountById(id: string): Promise<ChartOfAccount | null> {
    ensureSupabaseConnected();
    const { data, error } = await supabase.from("chart_of_accounts").select("*").eq("id", id).maybeSingle();
    if (error) return handleSupabaseReadError("chart_of_accounts", error, null);
    if (!data) return null;
    return {
      id: data.id,
      code: data.code,
      name: data.name,
      accountType: data.account_type,
      accountCategory: data.account_category,
      normalBalance: data.normal_balance,
      isActive: data.is_active ?? true,
      description: data.description,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    };
  }
  async getAccountByCode(code: string): Promise<ChartOfAccount | null> {
    ensureSupabaseConnected();
    const { data, error } = await supabase.from("chart_of_accounts").select("*").eq("code", code).maybeSingle();
    if (error) return handleSupabaseReadError("chart_of_accounts", error, null);
    if (!data) return null;
    return {
      id: data.id,
      code: data.code,
      name: data.name,
      accountType: data.account_type,
      accountCategory: data.account_category,
      normalBalance: data.normal_balance,
      isActive: data.is_active ?? true,
      description: data.description,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    };
  }
  async createAccount(data: CreateAccountInput): Promise<ChartOfAccount> {
    ensureSupabaseConnected();
    const payload = {
      code: data.code,
      name: data.name,
      account_type: data.accountType,
      account_category: data.accountCategory,
      normal_balance: data.normalBalance,
      is_active: data.isActive ?? true,
      description: data.description
    };
    const { data: inserted, error } = await supabase.from("chart_of_accounts").insert(payload).select().single();
    if (error) throw new Error(`Gagal membuat account: ${error.message}`);
    return {
      id: inserted.id,
      code: inserted.code,
      name: inserted.name,
      accountType: inserted.account_type,
      accountCategory: inserted.account_category,
      normalBalance: inserted.normal_balance,
      isActive: inserted.is_active ?? true,
      description: inserted.description,
      createdAt: inserted.created_at,
      updatedAt: inserted.updated_at
    };
  }
  async updateAccount(id: string, updates: UpdateAccountInput): Promise<ChartOfAccount> {
    ensureSupabaseConnected();
    const payload: any = {};
    if (updates.name) payload.name = updates.name;
    if (updates.accountType) payload.account_type = updates.accountType;
    if (updates.accountCategory) payload.account_category = updates.accountCategory;
    if (updates.normalBalance) payload.normal_balance = updates.normalBalance;
    if (updates.isActive !== undefined) payload.is_active = updates.isActive;
    if (updates.description !== undefined) payload.description = updates.description;
    const { data: updated, error } = await supabase.from("chart_of_accounts").update(payload).eq("id", id).select().single();
    if (error) throw new Error(`Gagal update account: ${error.message}`);
    return {
      id: updated.id,
      code: updated.code,
      name: updated.name,
      accountType: updated.account_type,
      accountCategory: updated.account_category,
      normalBalance: updated.normal_balance,
      isActive: updated.is_active ?? true,
      description: updated.description,
      createdAt: updated.created_at,
      updatedAt: updated.updated_at
    };
  }
  async getRecurringExpensePlans(branchId?: string): Promise<RecurringExpensePlan[]> {
    ensureSupabaseConnected();
    let query = supabase.from("recurring_expense_plans").select("*").order("expense_type");
    if (branchId && branchId !== "ALL") query = query.eq("branch_id", branchId);
    const { data, error } = await query;
    if (error) throw new Error(`Gagal memuat rencana akrual harian: ${error.message}`);
    const plans = data || [];
    if (plans.length === 0) return [];

    const { data: accrualRows, error: accrualError } = await supabase
      .from("recurring_expense_accruals")
      .select("plan_id, amount")
      .in("plan_id", plans.map((plan: any) => plan.id));
    if (accrualError) throw new Error(`Gagal memuat akumulasi akrual harian: ${accrualError.message}`);
    const totals = new Map<string, number>();
    for (const row of accrualRows || []) {
      totals.set(row.plan_id, (totals.get(row.plan_id) || 0) + Number(row.amount || 0));
    }

    return plans.map((row: any) => ({
      id: row.id,
      branchId: row.branch_id,
      expenseType: row.expense_type as RecurringExpenseType,
      amount: Number(row.amount),
      startsOn: row.starts_on,
      isActive: row.is_active,
      accruedAmount: totals.get(row.id) || 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
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
    ensureSupabaseConnected();
    if (data.amount <= 0 || !Number.isInteger(data.amount)) {
      throw new Error("Nominal rencana harus berupa bilangan rupiah positif");
    }
    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId && data.branchId !== userBranchId) {
      throw new Error("Branch Admin hanya dapat mengatur akrual untuk cabangnya sendiri");
    }
    if (currentUserRole && ![UserRole.BRANCH_ADMIN, UserRole.SUPER_ADMIN].includes(currentUserRole)) {
      throw new Error("Hanya Admin Cabang atau Super Admin yang dapat mengatur akrual rutin");
    }
    const { data: row, error } = await supabase
      .from("recurring_expense_plans")
      .upsert({
        branch_id: data.branchId,
        expense_type: data.expenseType,
        amount: data.amount,
        starts_on: data.startsOn,
        is_active: data.isActive,
        created_by: createdBy,
        updated_at: new Date().toISOString()
      }, { onConflict: "branch_id,expense_type" })
      .select("*")
      .single();
    if (error) throw new Error(`Gagal menyimpan rencana akrual rutin: ${error.message}`);
    return {
      id: row.id,
      branchId: row.branch_id,
      expenseType: row.expense_type,
      amount: Number(row.amount),
      startsOn: row.starts_on,
      isActive: row.is_active,
      accruedAmount: 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
  async getJournals(filter?: JournalFilter): Promise<JournalEntry[]> {
    ensureSupabaseConnected();
    let q = supabase.from("journal_entries").select("*").order("journal_date", { ascending: false });
    const { data, error } = await q;
    if (error) return handleSupabaseReadError("journal_entries", error, []);
    return (data || []).map((row: any) => ({
      id: row.id,
      journalNumber: row.journal_number,
      journalDate: row.journal_date,
      branchId: row.branch_id,
      description: row.description,
      sourceType: row.source_type,
      sourceId: row.source_id,
      event: row.event,
      reversalOfJournalId: row.reversal_of_journal_id,
      reversalReason: row.reversal_reason,
      status: row.status,
      totalDebit: Number(row.total_debit || 0),
      totalCredit: Number(row.total_credit || 0),
      lines: [],
      createdBy: row.created_by || "System",
      createdAt: row.created_at,
      postedAt: row.posted_at,
      postedBy: row.posted_by,
      updatedAt: row.updated_at
    }));
  }
  async getJournalById(id: string): Promise<JournalEntry | null> {
    ensureSupabaseConnected();
    const { data, error } = await supabase.from("journal_entries").select("*").eq("id", id).maybeSingle();
    if (error) return handleSupabaseReadError("journal_entries", error, null);
    if (!data) return null;
    const { data: lineRows, error: linesError } = await supabase
      .from("journal_lines")
      .select("*")
      .eq("journal_entry_id", id);
    if (linesError) throw new Error(`Gagal memuat baris jurnal: ${linesError.message}`);
    return {
      id: data.id,
      journalNumber: data.journal_number,
      journalDate: data.journal_date,
      branchId: data.branch_id,
      description: data.description,
      sourceType: data.source_type,
      sourceId: data.source_id,
      event: data.event,
      reversalOfJournalId: data.reversal_of_journal_id,
      reversalReason: data.reversal_reason,
      status: data.status,
      lines: (lineRows || []).map((line: any) => ({
        id: line.id,
        journalEntryId: line.journal_entry_id,
        accountId: line.account_id,
        branchId: line.branch_id,
        debit: Number(line.debit || 0),
        credit: Number(line.credit || 0),
        description: line.description
      })),
      totalDebit: Number(data.total_debit || 0),
      totalCredit: Number(data.total_credit || 0),
      createdBy: data.created_by || "System",
      createdAt: data.created_at,
      postedAt: data.posted_at,
      postedBy: data.posted_by,
      updatedAt: data.updated_at
    };
  }
  async getJournalsBySource(sourceType: JournalSourceType, sourceId: string): Promise<JournalEntry[]> {
    ensureSupabaseConnected();
    const { data, error } = await supabase.from("journal_entries").select("*").eq("source_type", sourceType).eq("source_id", sourceId);
    if (error) return handleSupabaseReadError("journal_entries", error, []);
    return (data || []).map((row: any) => ({
      id: row.id,
      journalNumber: row.journal_number,
      journalDate: row.journal_date,
      branchId: row.branch_id,
      description: row.description,
      sourceType: row.source_type,
      sourceId: row.source_id,
      event: row.event,
      reversalOfJournalId: row.reversal_of_journal_id,
      reversalReason: row.reversal_reason,
      status: row.status,
      totalDebit: Number(row.total_debit || 0),
      totalCredit: Number(row.total_credit || 0),
      lines: [],
      createdBy: row.created_by || "System",
      createdAt: row.created_at,
      postedAt: row.posted_at,
      postedBy: row.posted_by,
      updatedAt: row.updated_at
    }));
  }
  async createDraftJournal(data: CreateJournalInput, createdBy: string): Promise<JournalEntry> {
    ensureSupabaseConnected();
    if (data.sourceType === JournalSourceType.REVERSAL) {
      throw new Error("Jurnal pembalik hanya dapat dibuat melalui alur koreksi jurnal.");
    }
    const totalDebit = data.lines.reduce((sum, line) => sum + line.debit, 0);
    const totalCredit = data.lines.reduce((sum, line) => sum + line.credit, 0);
    if (
      data.lines.length === 0
      || data.lines.some((line) => line.debit < 0 || line.credit < 0 || (line.debit === 0 && line.credit === 0))
      || totalDebit <= 0
      || totalDebit !== totalCredit
    ) {
      throw new Error("Jurnal harus memiliki baris debit dan kredit yang seimbang sebelum disimpan");
    }

    const payload = {
      journal_number: data.journalNumber || `JRN-${Date.now()}`,
      journal_date: data.journalDate,
      branch_id: data.branchId,
      description: data.description,
      source_type: data.sourceType,
      source_id: data.sourceId,
      event: data.event || null,
      status: "DRAFT",
      total_debit: totalDebit,
      total_credit: totalCredit,
      created_by: createdBy
    };
    const { data: inserted, error } = await supabase.from("journal_entries").insert(payload).select().single();
    if (error) {
      if (error.code === "23505" && data.sourceId) {
        const existingJournals = await this.getJournalsBySource(
          data.sourceType,
          data.sourceId
        );
        const existing = existingJournals.find(
          (journal) => journal.event === data.event
        );
        if (existing) {
          const completeJournal = await this.getJournalById(existing.id);
          if (!completeJournal) {
            throw new Error(
              `Jurnal untuk sumber ${data.sourceType} (${data.sourceId}) sudah dibuat proses lain, tetapi belum dapat dimuat. Coba sinkronkan ulang.`
            );
          }
          if (completeJournal.status === "DRAFT") {
            const actualDebit = completeJournal.lines.reduce((sum, line) => sum + line.debit, 0);
            const actualCredit = completeJournal.lines.reduce((sum, line) => sum + line.credit, 0);
            if (
              completeJournal.lines.length === 0 ||
              actualDebit !== completeJournal.totalDebit ||
              actualCredit !== completeJournal.totalCredit ||
              actualDebit !== actualCredit
            ) {
              throw new Error(
                `Jurnal ${completeJournal.journalNumber} untuk sumber ${data.sourceType} (${data.sourceId}) masih dibuat proses lain dan belum lengkap. Coba sinkronkan ulang.`
              );
            }
          }
          return completeJournal;
        }
      }
      throw new Error(`Gagal membuat draft journal: ${error.message}`);
    }

    const linePayload = data.lines.map((line) => ({
      journal_entry_id: inserted.id,
      account_id: line.accountId,
      branch_id: line.branchId || data.branchId,
      debit: line.debit,
      credit: line.credit,
      description: line.description || null
    }));
    const { error: lineError } = await supabase.from("journal_lines").insert(linePayload);
    if (lineError) {
      const { error: cleanupError } = await supabase.from("journal_entries").delete().eq("id", inserted.id);
      const cleanupMessage = cleanupError
        ? ` Draft jurnal ${inserted.journal_number} juga gagal dibersihkan: ${cleanupError.message}`
        : "";
      throw new Error(`Gagal menyimpan baris jurnal: ${lineError.message}.${cleanupMessage}`);
    }

    return {
      id: inserted.id,
      journalNumber: inserted.journal_number,
      journalDate: inserted.journal_date,
      branchId: inserted.branch_id,
      description: inserted.description,
      sourceType: inserted.source_type,
      sourceId: inserted.source_id,
      event: inserted.event,
      status: inserted.status,
      lines: [],
      totalDebit,
      totalCredit,
      createdBy: inserted.created_by || createdBy,
      createdAt: inserted.created_at,
      updatedAt: inserted.updated_at
    };
  }
  async updateDraftJournal(id: string, data: CreateJournalInput): Promise<JournalEntry> {
    ensureSupabaseConnected();
    const payload: any = {};
    if (data.journalDate) payload.journal_date = data.journalDate;
    if (data.branchId) payload.branch_id = data.branchId;
    if (data.description) payload.description = data.description;
    const { data: updated, error } = await supabase.from("journal_entries").update(payload).eq("id", id).select().single();
    if (error) throw new Error(`Gagal update journal: ${error.message}`);
    return {
      id: updated.id,
      journalNumber: updated.journal_number,
      journalDate: updated.journal_date,
      branchId: updated.branch_id,
      description: updated.description,
      sourceType: updated.source_type,
      sourceId: updated.source_id,
      status: updated.status,
      lines: [],
      totalDebit: 0,
      totalCredit: 0,
      createdBy: "System",
      createdAt: updated.created_at,
      updatedAt: updated.updated_at
    };
  }
  async postJournal(id: string, postedBy: string): Promise<JournalEntry> {
    ensureSupabaseConnected();
    const { data, error } = await supabase.from("journal_entries").update({
      status: "POSTED",
      posted_by: postedBy,
      posted_at: AppClock.nowISO(),
      updated_at: AppClock.nowISO()
    }).eq("id", id).select().single();
    if (error) throw new Error(`Gagal post journal: ${error.message}`);
    return {
      id: data.id,
      journalNumber: data.journal_number,
      journalDate: data.journal_date,
      branchId: data.branch_id,
      description: data.description,
      sourceType: data.source_type,
      sourceId: data.source_id,
      event: data.event,
      status: data.status,
      lines: [],
      totalDebit: Number(data.total_debit || 0),
      totalCredit: Number(data.total_credit || 0),
      createdBy: data.created_by || "System",
      createdAt: data.created_at,
      postedAt: data.posted_at,
      postedBy: data.posted_by,
      updatedAt: data.updated_at
    };
  }
  async voidJournal(id: string, _voidedBy: string, _reason?: string): Promise<JournalEntry> {
    ensureSupabaseConnected();
    const { data: current, error: currentError } = await supabase
      .from("journal_entries")
      .select("status")
      .eq("id", id)
      .maybeSingle();
    if (currentError) throw new Error(`Gagal memeriksa status jurnal sebelum pembatalan: ${currentError.message}`);
    if (!current) throw new Error("Jurnal tidak ditemukan.");
    if (current.status !== JournalStatus.POSTED) {
      throw new Error("Hanya jurnal POSTED yang dapat dikoreksi; draft dapat dihapus tanpa pembatalan.");
    }
    throw new Error("Jurnal POSTED tidak dapat di-VOID langsung. Gunakan jurnal pembalik yang terkait.");
  }
  async reversePostedJournal(
    id: string,
    reason: string,
    reversalDate: string,
    reversedBy: string
  ): Promise<JournalEntry> {
    ensureSupabaseConnected();
    const { data: reversalId, error } = await supabase.rpc("reverse_posted_journal", {
      p_journal_id: id,
      p_reason: reason.trim(),
      p_reversal_date: reversalDate,
      p_reversed_by: reversedBy.trim()
    });
    if (error) {
      if (error.code === "PGRST202") {
        throw new Error(
          "Fungsi jurnal pembalik belum tersedia di server atau skema API belum diperbarui. Terapkan migration 20261203000000_add_journal_reversal_workflow.sql pada project Supabase yang digunakan aplikasi, lalu muat ulang halaman."
        );
      }
      throw new Error(`Gagal membuat jurnal pembalik: ${error.message}`);
    }
    if (typeof reversalId !== "string" || !reversalId) {
      throw new Error("Server tidak mengembalikan jurnal pembalik yang valid.");
    }
    const reversal = await this.getJournalById(reversalId);
    if (!reversal) {
      throw new Error("Jurnal pembalik berhasil dibuat, tetapi detailnya belum dapat dimuat. Muat ulang jurnal sebelum mencoba lagi.");
    }
    return reversal;
  }
  async deleteDraftJournal(id: string): Promise<boolean> {
    ensureSupabaseConnected();
    const { error: lineError } = await supabase.from("journal_lines").delete().eq("journal_entry_id", id);
    if (lineError) throw new Error(`Gagal menghapus baris draft jurnal: ${lineError.message}`);
    const { error } = await supabase.from("journal_entries").delete().eq("id", id);
    if (error) throw new Error(`Gagal menghapus draft jurnal: ${error.message}`);
    return true;
  }
  async deleteJournal(id: string): Promise<boolean> {
    ensureSupabaseConnected();
    const { data: current, error: currentError } = await supabase
      .from("journal_entries")
      .select("status")
      .eq("id", id)
      .maybeSingle();
    if (currentError) throw new Error(`Gagal memeriksa status jurnal sebelum penghapusan: ${currentError.message}`);
    if (!current) return false;
    if (current.status !== JournalStatus.DRAFT) {
      throw new Error("Hanya draft jurnal yang dapat dihapus. Jurnal POSTED atau VOID harus dipertahankan sebagai audit trail.");
    }
    const { error: lineError } = await supabase.from("journal_lines").delete().eq("journal_entry_id", id);
    if (lineError) throw new Error(`Gagal menghapus baris jurnal: ${lineError.message}`);
    const { error } = await supabase.from("journal_entries").delete().eq("id", id);
    if (error) throw new Error(`Gagal menghapus jurnal: ${error.message}`);
    return true;
  }
  async findBySource(sourceType: JournalSourceType, sourceId: string): Promise<JournalEntry | null> {
    const list = await this.getJournalsBySource(sourceType, sourceId);
    return list[0] || null;
  }
  async listByBranch(branchId: string): Promise<JournalEntry[]> {
    ensureSupabaseConnected();
    const { data, error } = await supabase.from("journal_entries").select("*").eq("branch_id", branchId);
    if (error) return handleSupabaseReadError("journal_entries", error, []);
    return (data || []).map((row: any) => ({
      id: row.id,
      journalNumber: row.journal_number,
      journalDate: row.journal_date,
      branchId: row.branch_id,
      description: row.description,
      sourceType: row.source_type,
      sourceId: row.source_id,
      status: row.status,
      totalDebit: Number(row.total_debit || 0),
      totalCredit: Number(row.total_credit || 0),
      lines: [],
      createdBy: row.created_by || "System",
      createdAt: row.created_at,
      postedAt: row.posted_at,
      postedBy: row.posted_by,
      updatedAt: row.updated_at
    }));
  }
  async listByDateRange(dateFrom: string, dateTo: string, branchId?: string): Promise<JournalEntry[]> {
    ensureSupabaseConnected();
    let q = supabase.from("journal_entries").select("*").gte("journal_date", dateFrom).lte("journal_date", dateTo);
    if (branchId) q = q.eq("branch_id", branchId);
    const { data, error } = await q;
    if (error) return handleSupabaseReadError("journal_entries", error, []);
    return (data || []).map((row: any) => ({
      id: row.id,
      journalNumber: row.journal_number,
      journalDate: row.journal_date,
      branchId: row.branch_id,
      description: row.description,
      sourceType: row.source_type,
      sourceId: row.source_id,
      status: row.status,
      totalDebit: Number(row.total_debit || 0),
      totalCredit: Number(row.total_credit || 0),
      lines: [],
      createdBy: row.created_by || "System",
      createdAt: row.created_at,
      postedAt: row.posted_at,
      postedBy: row.posted_by,
      updatedAt: row.updated_at
    }));
  }
  async getLedgerEntries(
    query?: LedgerQuery,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<GeneralLedgerEntry[]> {
    if (
      currentUserRole === UserRole.DOCTOR
      || currentUserRole === UserRole.DOCTOR_ASSISTANT
      || currentUserRole === UserRole.PATIENT
    ) {
      throw new Error("Akses ditolak: Hanya Administrator yang dapat melihat Riwayat Keuangan");
    }

    ensureSupabaseConnected();
    let request = supabase
      .from("journal_lines")
      .select("*, journal:journal_entries!inner(*), account:chart_of_accounts!inner(*)")
      .neq("journal.status", JournalStatus.VOID);

    if (query?.includeDrafts !== true) {
      request = request.eq("journal.status", JournalStatus.POSTED);
    }

    const effectiveBranchId = currentUserRole === UserRole.BRANCH_ADMIN
      ? userBranchId
      : query?.branchId && query.branchId !== "ALL"
        ? query.branchId
        : undefined;
    if (effectiveBranchId) request = request.eq("branch_id", effectiveBranchId);
    if (query?.dateFrom) request = request.gte("journal.journal_date", query.dateFrom);
    if (query?.dateTo) request = request.lte("journal.journal_date", query.dateTo);

    const { data, error } = await request;
    if (error) throw new Error(`Gagal memuat riwayat keuangan: ${error.message}`);

    const invoiceIds = new Set<string>();
    const paymentIds: string[] = [];
    for (const row of data || []) {
      const journal = row.journal;
      if (!journal?.source_id) continue;
      if (journal.source_type === JournalSourceType.INVOICE) {
        invoiceIds.add(journal.source_id);
      } else if (journal.source_type === JournalSourceType.PAYMENT) {
        paymentIds.push(journal.source_id);
      }
    }

    const invoiceNumbers = new Map<string, string>();
    const [{ data: invoiceRows, error: invoiceError }, { data: paymentRows, error: paymentError }] = await Promise.all([
      invoiceIds.size > 0
        ? supabase.from("invoices").select("id, invoice_number").in("id", Array.from(invoiceIds))
        : Promise.resolve({ data: [], error: null }),
      paymentIds.length > 0
        ? supabase.from("payment_transactions").select("id, receipt_number, invoice_id").in("id", paymentIds)
        : Promise.resolve({ data: [], error: null })
    ]);
    if (invoiceError) throw new Error(`Gagal memuat nomor invoice untuk riwayat keuangan: ${invoiceError.message}`);
    if (paymentError) throw new Error(`Gagal memuat nomor kwitansi untuk riwayat keuangan: ${paymentError.message}`);

    for (const row of invoiceRows || []) {
      if (row.invoice_number) invoiceNumbers.set(row.id, row.invoice_number);
    }

    const relatedInvoiceIds = Array.from(new Set(
      (paymentRows || []).map((row) => row.invoice_id).filter((id): id is string => Boolean(id))
    )).filter((id) => !invoiceNumbers.has(id));
    if (relatedInvoiceIds.length > 0) {
      const { data: relatedInvoiceRows, error: relatedInvoiceError } = await supabase
        .from("invoices")
        .select("id, invoice_number")
        .in("id", relatedInvoiceIds);
      if (relatedInvoiceError) {
        throw new Error(`Gagal memuat nomor invoice pembayaran: ${relatedInvoiceError.message}`);
      }
      for (const row of relatedInvoiceRows || []) {
        if (row.invoice_number) invoiceNumbers.set(row.id, row.invoice_number);
      }
    }

    const referenceLabels = new Map<string, string>();
    for (const [invoiceId, invoiceNumber] of invoiceNumbers) {
      referenceLabels.set(invoiceId, invoiceNumber);
    }
    for (const row of paymentRows || []) {
      if (row.receipt_number) referenceLabels.set(row.id, row.receipt_number);
    }

    const mapReferences = (text: string) => {
      let result = text;
      for (const [id, label] of referenceLabels) {
        result = result.split(id).join(label);
      }
      return result;
    };

    const entries = (data || []).flatMap((row: any): GeneralLedgerEntry[] => {
      const journal = row.journal;
      const account = row.account;
      if (!journal || !account || journal.status === JournalStatus.VOID) return [];
      if (currentUserRole === UserRole.BRANCH_ADMIN && journal.branch_id !== userBranchId) return [];
      if (query?.dateFrom && journal.journal_date < query.dateFrom) return [];
      if (query?.dateTo && journal.journal_date > query.dateTo) return [];
      if (query?.includeDrafts !== true && journal.status !== JournalStatus.POSTED) return [];
      if (query?.accountId && query.accountId !== "ALL" && account.id !== query.accountId && account.code !== query.accountId) return [];
      if (query?.accountCode && account.code !== query.accountCode) return [];

      return [{
        journalId: journal.id,
        journalNumber: journal.journal_number,
        journalDate: journal.journal_date,
        lineId: row.id,
        accountId: account.id,
        accountCode: account.code,
        accountName: account.name,
        accountType: account.account_type as AccountType,
        normalBalance: account.normal_balance as NormalBalance,
        branchId: row.branch_id,
        description: mapReferences(row.description || journal.description),
        debit: Number(row.debit || 0),
        credit: Number(row.credit || 0),
        sourceType: journal.source_type as JournalSourceType,
        sourceId: journal.source_id,
        postedAt: journal.posted_at || journal.created_at
      }];
    });

    entries.sort((a, b) =>
      a.journalDate.localeCompare(b.journalDate)
      || a.journalNumber.localeCompare(b.journalNumber)
      || a.lineId.localeCompare(b.lineId)
    );

    const accountBalances = new Map<string, number>();
    return entries.map((entry) => {
      const previousBalance = accountBalances.get(entry.accountId) || 0;
      const runningBalance = previousBalance + (
        entry.normalBalance === NormalBalance.DEBIT
          ? entry.debit - entry.credit
          : entry.credit - entry.debit
      );
      accountBalances.set(entry.accountId, runningBalance);
      return { ...entry, runningBalance };
    });
  }
  async getAccountBalance(
    accountId: string,
    branchId?: string,
    dateTo?: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<AccountBalanceResult> {
    const entries = await this.getLedgerEntries(
      {
        accountId,
        branchId,
        dateTo
      },
      currentUserRole,
      userBranchId
    );

    if (accountId === "ALL") {
      const totalDebit = entries.reduce((sum, entry) => sum + entry.debit, 0);
      const totalCredit = entries.reduce((sum, entry) => sum + entry.credit, 0);
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

    const accounts = await this.getAccounts();
    const account = accounts.find((item) => item.id === accountId || item.code === accountId);
    if (!account) throw new Error(`Akun dengan ID atau kode "${accountId}" tidak ditemukan`);

    const totalDebit = entries.reduce((sum, entry) => sum + entry.debit, 0);
    const totalCredit = entries.reduce((sum, entry) => sum + entry.credit, 0);
    return {
      accountId: account.id,
      accountCode: account.code,
      accountName: account.name,
      accountType: account.accountType,
      accountCategory: account.accountCategory,
      normalBalance: account.normalBalance,
      totalDebit,
      totalCredit,
      balance: account.normalBalance === NormalBalance.DEBIT
        ? totalDebit - totalCredit
        : totalCredit - totalDebit
    };
  }
  async getIncomeStatementReport(
    query?: { branchId?: string; dateFrom?: string; dateTo?: string },
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<IncomeStatementReport> {
    if (
      currentUserRole === UserRole.DOCTOR
      || currentUserRole === UserRole.DOCTOR_ASSISTANT
      || currentUserRole === UserRole.PATIENT
    ) {
      throw new Error("Akses ditolak: Hanya Administrator yang dapat melihat Laporan Keuangan");
    }

    const effectiveBranchId = currentUserRole === UserRole.BRANCH_ADMIN
      ? userBranchId || undefined
      : query?.branchId && query.branchId !== "ALL"
        ? query.branchId
        : undefined;
    const entries = await this.getLedgerEntries(
      {
        branchId: effectiveBranchId,
        dateFrom: query?.dateFrom,
        dateTo: query?.dateTo
      },
      currentUserRole,
      userBranchId
    );
    const accounts = await this.getAccounts();
    const accountMap = new Map(accounts.map((account) => [account.id, account]));
    const revenueTotals = new Map<string, number>();
    const expenseTotals = new Map<string, number>();

    for (const entry of entries) {
      const account = accountMap.get(entry.accountId);
      if (!account) continue;
      if (account.accountType === AccountType.REVENUE) {
        revenueTotals.set(
          account.id,
          (revenueTotals.get(account.id) || 0) + entry.credit - entry.debit
        );
      } else if (account.accountType === AccountType.EXPENSE) {
        expenseTotals.set(
          account.id,
          (expenseTotals.get(account.id) || 0) + entry.debit - entry.credit
        );
      }
    }

    const toReportItems = (totals: Map<string, number>) =>
      Array.from(totals.entries())
        .map(([accountId, amount]) => {
          const account = accountMap.get(accountId)!;
          return {
            accountId,
            accountCode: account.code,
            accountName: account.name,
            accountCategory: account.accountCategory,
            amount
          };
        })
        .sort((a, b) => a.accountCode.localeCompare(b.accountCode));
    const revenues = toReportItems(revenueTotals);
    const expenses = toReportItems(expenseTotals);
    const totalRevenue = revenues.reduce((sum, item) => sum + item.amount, 0);
    const totalExpense = expenses.reduce((sum, item) => sum + item.amount, 0);
    let branchName = "Semua Cabang (Konsolidasi)";

    if (effectiveBranchId) {
      const { data: branch, error } = await supabase
        .from("dental_branches")
        .select("name")
        .eq("id", effectiveBranchId)
        .maybeSingle();
      if (error) throw new Error(`Gagal memuat nama cabang laporan: ${error.message}`);
      branchName = branch?.name || effectiveBranchId;
    }

    return {
      branchId: effectiveBranchId || null,
      branchName,
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
  async getTrialBalanceReport(): Promise<TrialBalanceReport> {
    return { items: [], totalDebit: 0, totalCredit: 0, isBalanced: true, generatedAt: AppClock.nowISO() };
  }
  async getBalanceSheetReport(): Promise<BalanceSheetReport> {
    return { assets: [], liabilities: [], equity: [], totalAssets: 0, totalLiabilities: 0, totalEquity: 0, currentPeriodNetIncome: 0, totalLiabilitiesAndEquity: 0, isBalanced: true, generatedAt: AppClock.nowISO() };
  }
}

// =====================================================================
// 21. SUPABASE WORK SHIFT REPOSITORY
// =====================================================================
export class SupabaseWorkShiftRepository implements WorkShiftRepository {
  async getShifts(branchId?: string): Promise<WorkShift[]> {
    ensureSupabaseConnected();
    let q = supabase.from("work_shifts").select("*");
    if (branchId) q = q.eq("branch_id", branchId);
    const { data, error } = await q;
    if (error) return handleSupabaseReadError("work_shifts", error, []);
    return (data || []).map((row: any) => ({
      id: row.id,
      branchId: row.branch_id,
      name: row.name,
      startTime: row.start_time,
      endTime: row.end_time,
      active: row.active ?? true,
      notes: row.notes,
      createdAt: row.created_at || AppClock.nowISO(),
      updatedAt: row.updated_at || AppClock.nowISO()
    }));
  }
  async getShiftById(id: string): Promise<WorkShift | null> {
    ensureSupabaseConnected();
    const { data, error } = await supabase.from("work_shifts").select("*").eq("id", id).maybeSingle();
    if (error) return handleSupabaseReadError("work_shifts", error, null);
    if (!data) return null;
    return {
      id: data.id,
      branchId: data.branch_id,
      name: data.name,
      startTime: data.start_time,
      endTime: data.end_time,
      active: data.active ?? true,
      notes: data.notes,
      createdAt: data.created_at || AppClock.nowISO(),
      updatedAt: data.updated_at || AppClock.nowISO()
    };
  }
  async createShift(data: Omit<WorkShift, "id" | "createdAt" | "updatedAt"> & { id?: string }): Promise<WorkShift> {
    ensureSupabaseConnected();
    const payload: any = {
      branch_id: data.branchId,
      name: data.name,
      start_time: data.startTime,
      end_time: data.endTime,
      active: data.active ?? true,
      notes: data.notes
    };
    if (data.id) payload.id = data.id;
    const { data: inserted, error } = await supabase.from("work_shifts").insert(payload).select().single();
    if (error) throw new Error(`Gagal membuat work shift: ${error.message}`);
    return {
      id: inserted.id,
      branchId: inserted.branch_id,
      name: inserted.name,
      startTime: inserted.start_time,
      endTime: inserted.end_time,
      active: inserted.active ?? true,
      notes: inserted.notes,
      createdAt: inserted.created_at || AppClock.nowISO(),
      updatedAt: inserted.updated_at || AppClock.nowISO()
    };
  }
  async updateShift(id: string, updates: Partial<Omit<WorkShift, "id" | "createdAt" | "updatedAt">>): Promise<WorkShift> {
    ensureSupabaseConnected();
    const payload: any = {};
    if (updates.branchId) payload.branch_id = updates.branchId;
    if (updates.name) payload.name = updates.name;
    if (updates.startTime) payload.start_time = updates.startTime;
    if (updates.endTime) payload.end_time = updates.endTime;
    if (updates.active !== undefined) payload.active = updates.active;
    if (updates.notes !== undefined) payload.notes = updates.notes;
    const { data: updated, error } = await supabase.from("work_shifts").update(payload).eq("id", id).select().single();
    if (error) throw new Error(`Gagal update work shift: ${error.message}`);
    return {
      id: updated.id,
      branchId: updated.branch_id,
      name: updated.name,
      startTime: updated.start_time,
      endTime: updated.end_time,
      active: updated.active ?? true,
      notes: updated.notes,
      createdAt: updated.created_at || AppClock.nowISO(),
      updatedAt: updated.updated_at || AppClock.nowISO()
    };
  }
}

// =====================================================================
// 22. SUPABASE STAFF SHIFT ASSIGNMENT REPOSITORY
// =====================================================================
export class SupabaseStaffShiftAssignmentRepository implements StaffShiftAssignmentRepository {
  async getAssignments(filter?: StaffShiftAssignmentFilter): Promise<StaffShiftAssignment[]> {
    ensureSupabaseConnected();
    let q = supabase.from("staff_shift_assignments").select("*");
    if (filter?.branchId) q = q.eq("branch_id", filter.branchId);
    if (filter?.staffId) q = q.eq("staff_id", filter.staffId);
    if (filter?.date) q = q.eq("date", filter.date);
    const { data, error } = await q;
    if (error) return handleSupabaseReadError("staff_shift_assignments", error, []);
    return (data || []).map((row: any) => ({
      id: row.id,
      staffId: row.staff_id,
      shiftId: row.shift_id,
      customShiftName: row.custom_shift_name,
      customStartTime: row.custom_start_time,
      customEndTime: row.custom_end_time,
      branchId: row.branch_id,
      date: row.date,
      active: row.active ?? true,
      notes: row.notes,
      createdAt: row.created_at || AppClock.nowISO(),
      updatedAt: row.updated_at || AppClock.nowISO()
    }));
  }
  async getAssignmentById(id: string): Promise<StaffShiftAssignment | null> {
    ensureSupabaseConnected();
    const { data, error } = await supabase.from("staff_shift_assignments").select("*").eq("id", id).maybeSingle();
    if (error) return handleSupabaseReadError("staff_shift_assignments", error, null);
    if (!data) return null;
    return {
      id: data.id,
      staffId: data.staff_id,
      shiftId: data.shift_id,
      customShiftName: data.custom_shift_name,
      customStartTime: data.custom_start_time,
      customEndTime: data.custom_end_time,
      branchId: data.branch_id,
      date: data.date,
      active: data.active ?? true,
      notes: data.notes,
      createdAt: data.created_at || AppClock.nowISO(),
      updatedAt: data.updated_at || AppClock.nowISO()
    };
  }
  async assignStaffShift(data: Omit<StaffShiftAssignment, "id" | "createdAt" | "updatedAt"> & { id?: string }): Promise<StaffShiftAssignment> {
    ensureSupabaseConnected();
    const payload: any = {
      staff_id: data.staffId,
      shift_id: data.shiftId,
      custom_shift_name: data.customShiftName,
      custom_start_time: data.customStartTime,
      custom_end_time: data.customEndTime,
      branch_id: data.branchId,
      date: data.date,
      active: data.active ?? true,
      notes: data.notes
    };
    if (data.id) payload.id = data.id;
    const { data: inserted, error } = await supabase.from("staff_shift_assignments").insert(payload).select().single();
    if (error) throw new Error(`Gagal assign staff shift: ${error.message}`);
    return {
      id: inserted.id,
      staffId: inserted.staff_id,
      shiftId: inserted.shift_id,
      customShiftName: inserted.custom_shift_name,
      customStartTime: inserted.custom_start_time,
      customEndTime: inserted.custom_end_time,
      branchId: inserted.branch_id,
      date: inserted.date,
      active: inserted.active ?? true,
      notes: inserted.notes,
      createdAt: inserted.created_at || AppClock.nowISO(),
      updatedAt: inserted.updated_at || AppClock.nowISO()
    };
  }
  async updateAssignment(id: string, updates: Partial<Omit<StaffShiftAssignment, "id" | "createdAt" | "updatedAt">>): Promise<StaffShiftAssignment> {
    ensureSupabaseConnected();
    const payload: any = {};
    if (updates.staffId) payload.staff_id = updates.staffId;
    if (updates.shiftId !== undefined) payload.shift_id = updates.shiftId;
    if (updates.customShiftName !== undefined) payload.custom_shift_name = updates.customShiftName;
    if (updates.customStartTime !== undefined) payload.custom_start_time = updates.customStartTime;
    if (updates.customEndTime !== undefined) payload.custom_end_time = updates.customEndTime;
    if (updates.branchId) payload.branch_id = updates.branchId;
    if (updates.date) payload.date = updates.date;
    if (updates.active !== undefined) payload.active = updates.active;
    if (updates.notes !== undefined) payload.notes = updates.notes;
    const { data: updated, error } = await supabase.from("staff_shift_assignments").update(payload).eq("id", id).select().single();
    if (error) throw new Error(`Gagal update assignment: ${error.message}`);
    return {
      id: updated.id,
      staffId: updated.staff_id,
      shiftId: updated.shift_id,
      customShiftName: updated.custom_shift_name,
      customStartTime: updated.custom_start_time,
      customEndTime: updated.custom_end_time,
      branchId: updated.branch_id,
      date: updated.date,
      active: updated.active ?? true,
      notes: updated.notes,
      createdAt: updated.created_at || AppClock.nowISO(),
      updatedAt: updated.updated_at || AppClock.nowISO()
    };
  }
  async removeAssignment(id: string): Promise<void> {
    ensureSupabaseConnected();
    const { error } = await supabase.from("staff_shift_assignments").delete().eq("id", id);
    if (error) throw new Error(`Gagal menghapus assignment: ${error.message}`);
  }

  async getRotationTemplates(branchId: string): Promise<StaffShiftRotationTemplate[]> {
    ensureSupabaseConnected();
    const { data, error } = await supabase
      .from("staff_shift_rotation_templates")
      .select("branch_id,staff_id,initial_shift_id,rotation_anchor_monday")
      .eq("branch_id", branchId);
    if (error) throw new Error(`Gagal memuat pola rotasi shift: ${error.message}`);
    return (data || []).map((row) => ({
      branchId: row.branch_id,
      staffId: row.staff_id,
      initialShiftId: row.initial_shift_id,
      rotationAnchorMonday: row.rotation_anchor_monday
    }));
  }

  async saveMonthlyRoster(
    branchId: string,
    rotationAnchorMonday: string,
    templates: StaffShiftRotationTemplate[],
    assignments: Array<Pick<StaffShiftAssignment, "staffId" | "branchId" | "shiftId" | "date" | "active" | "notes">>
  ): Promise<number> {
    ensureSupabaseConnected();
    const { data, error } = await supabase.rpc("save_staff_shift_monthly_roster", {
      p_branch_id: branchId,
      p_rotation_anchor_monday: rotationAnchorMonday,
      p_templates: templates.map((template) => ({
        staff_id: template.staffId,
        initial_shift_id: template.initialShiftId
      })),
      p_assignments: assignments.map((assignment) => ({
        staff_id: assignment.staffId,
        shift_id: assignment.shiftId,
        date: assignment.date,
        active: assignment.active,
        notes: assignment.notes
      }))
    });
    if (error) throw new Error(`Gagal menyimpan roster bulanan: ${error.message}`);
    if (typeof data !== "number") throw new Error("Server tidak mengembalikan jumlah jadwal yang tersimpan.");
    return data;
  }
}

// =====================================================================
// 23. SUPABASE ATTENDANCE REPOSITORY
// =====================================================================
export class SupabaseAttendanceRepository implements AttendanceRepository {
  async getById(id: string, _currentUserRole?: UserRole, _userBranchId?: string | null): Promise<Attendance | null> {
    ensureSupabaseConnected();
    const { data, error } = await queryAttendanceWithSchemaFallback((columns) =>
      supabase.from("attendances").select(columns).eq("id", id).maybeSingle()
    );
    if (error) return handleSupabaseReadError("attendances", error, null);
    return data ? mapAttendanceFromDb(data) : null;
  }
  async getByStaff(staffId: string, currentUserRole?: UserRole, userBranchId?: string | null): Promise<Attendance[]> {
    ensureSupabaseConnected();
    const { data, error } = await queryAttendanceWithSchemaFallback((columns) => {
      let query = supabase.from("attendances").select(columns).eq("staff_id", staffId);
      if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId) {
        query = query.eq("branch_id", userBranchId);
      }
      return query.order("date", { ascending: false });
    });
    if (error) return handleSupabaseReadError("attendances", error, []);
    return (data || []).map(mapAttendanceFromDb);
  }
  async getByDate(
    date: string,
    branchId?: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<Attendance[]> {
    ensureSupabaseConnected();
    const { data, error } = await queryAttendanceWithSchemaFallback((columns) => {
      let query = supabase.from("attendances").select(columns).eq("date", date);
      if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId) {
        query = query.eq("branch_id", userBranchId);
      } else if (branchId) {
        query = query.eq("branch_id", branchId);
      }
      return query;
    });
    if (error) return handleSupabaseReadError("attendances", error, []);
    return (data || []).map(mapAttendanceFromDb);
  }
  async getByBranch(
    branchId: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<Attendance[]> {
    ensureSupabaseConnected();
    const { data, error } = await queryAttendanceWithSchemaFallback((columns) => {
      let query = supabase.from("attendances").select(columns).eq("branch_id", branchId);
      if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId) {
        query = query.eq("branch_id", userBranchId);
      }
      return query.order("date", { ascending: false });
    });
    if (error) return handleSupabaseReadError("attendances", error, []);
    return (data || []).map(mapAttendanceFromDb);
  }
  async list(
    filter?: AttendanceFilter,
    currentUserRole?: UserRole,
    userBranchId?: string | null,
    currentStaffId?: string | null
  ): Promise<Attendance[]> {
    ensureSupabaseConnected();
    const { data, error } = await queryAttendanceWithSchemaFallback((columns) => {
      let query = supabase.from("attendances").select(columns);
      if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId) {
        query = query.eq("branch_id", userBranchId);
      } else if (filter?.branchId) {
        query = query.eq("branch_id", filter.branchId);
      }

      if (
        currentStaffId &&
        [UserRole.DOCTOR, UserRole.DOCTOR_ASSISTANT, UserRole.OB].includes(currentUserRole as UserRole)
      ) {
        query = query.eq("staff_id", currentStaffId);
      } else if (filter?.staffId) {
        query = query.eq("staff_id", filter.staffId);
      }
      if (filter?.date) query = query.eq("date", filter.date);
      if (filter?.dateRange?.startDate) query = query.gte("date", filter.dateRange.startDate);
      if (filter?.dateRange?.endDate) query = query.lte("date", filter.dateRange.endDate);
      if (filter?.attendanceStatus) query = query.eq("attendance_status", filter.attendanceStatus);

      return query.order("date", { ascending: false });
    });
    if (error) return handleSupabaseReadError("attendances", error, []);
    return (data || []).map(mapAttendanceFromDb);
  }
  async checkIn(input: CheckInInput): Promise<Attendance> {
    ensureSupabaseConnected();
    if (!input.branchId || input.latitude == null || input.longitude == null || input.accuracyMeters == null) {
      throw new Error("Cabang dan data GPS yang valid wajib disertakan untuk check-in.");
    }
    const { data, error } = await supabase.rpc("record_staff_attendance_check_in", {
      p_branch_id: input.branchId,
      p_latitude: input.latitude,
      p_longitude: input.longitude,
      p_accuracy_meters: input.accuracyMeters,
      p_photo_path: input.checkInPhotoPath ?? input.photoPath ?? null
    });
    if (error) throw new Error(`Gagal menyimpan check-in: ${error.message}`);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new Error("Supabase tidak mengembalikan catatan check-in yang tersimpan.");
    return mapAttendanceFromDb(row);
  }
  async checkOut(input: CheckOutInput): Promise<Attendance> {
    ensureSupabaseConnected();
    if (
      !input.attendanceId ||
      !input.branchId ||
      input.latitude == null ||
      input.longitude == null ||
      input.accuracyMeters == null
    ) {
      throw new Error("Catatan kehadiran dan data GPS yang valid wajib disertakan untuk check-out.");
    }
    const { data, error } = await supabase.rpc("record_staff_attendance_check_out", {
      p_attendance_id: input.attendanceId,
      p_branch_id: input.branchId,
      p_latitude: input.latitude,
      p_longitude: input.longitude,
      p_accuracy_meters: input.accuracyMeters,
      p_photo_path: input.checkOutPhotoPath ?? input.photoPath ?? null
    });
    if (error) throw new Error(`Gagal menyimpan check-out: ${error.message}`);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new Error("Supabase tidak mengembalikan catatan check-out yang tersimpan.");
    return mapAttendanceFromDb(row);
  }
  async approveCheckOutCorrection(input: {
    attendanceId: string;
    checkOutAt: string;
    notes?: string;
  }): Promise<Attendance> {
    ensureSupabaseConnected();
    if (!input.attendanceId || !input.checkOutAt) {
      throw new Error("Catatan absensi dan waktu pulang yang valid wajib disertakan.");
    }
    const { data, error } = await supabase.rpc("approve_staff_attendance_checkout_correction", {
      p_attendance_id: input.attendanceId,
      p_check_out_at: input.checkOutAt,
      p_notes: input.notes || null
    });
    if (error) throw new Error(`Gagal menyetujui koreksi check-out: ${error.message}`);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new Error("Supabase tidak mengembalikan koreksi check-out yang disetujui.");
    return mapAttendanceFromDb(row);
  }
  async createAbsence(input: CreateAbsenceInput): Promise<Attendance> {
    ensureSupabaseConnected();
    if (!input.branchId) throw new Error("Cabang wajib dipilih untuk mencatat ketidakhadiran.");
    const { data, error } = await supabase.rpc("record_staff_absence", {
      p_staff_id: input.staffId,
      p_branch_id: input.branchId,
      p_date: input.date,
      p_attendance_status: input.attendanceStatus,
      p_notes: input.notes || null
    });
    if (error) throw new Error(`Gagal menyimpan ketidakhadiran: ${error.message}`);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new Error("Supabase tidak mengembalikan catatan ketidakhadiran yang tersimpan.");
    return mapAttendanceFromDb(row);
  }
}

// =====================================================================
// 24. SUPABASE OVERTIME REPOSITORY
// =====================================================================
function mapOvertimeFromDb(row: any): OvertimeRecord {
  return {
    id: row.id,
    staffId: row.staff_id,
    branchId: row.branch_id,
    attendanceId: row.attendance_id,
    date: row.date,
    scheduledEndAt: row.scheduled_end_at || "17:00",
    actualEndAt: row.actual_end_at || "17:00",
    overtimeMinutes: row.overtime_minutes || 0,
    approvedOvertimeMinutes: row.approved_overtime_minutes,
    overtimeHours: row.overtime_hours || 0,
    overtimeType: row.overtime_type || OvertimeType.AFTER_SHIFT,
    isNationalHoliday: row.is_national_holiday || false,
    calculationMethod: row.calculation_method,
    hourlyRateSnapshot: row.hourly_rate_snapshot,
    overtimeAmountSnapshot: row.overtime_amount_snapshot,
    status: row.status || OvertimeStatus.DETECTED,
    notes: row.notes,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    rejectedBy: row.rejected_by,
    rejectedAt: row.rejected_at,
    rejectionReason: row.rejection_reason,
    createdAt: row.created_at || AppClock.nowISO(),
    updatedAt: row.updated_at || AppClock.nowISO(),
    createdBy: row.created_by,
    updatedBy: row.updated_by
  };
}

export class SupabaseOvertimeRepository implements OvertimeRepository {
  async getById(id: string): Promise<OvertimeRecord | null> {
    ensureSupabaseConnected();
    const { data, error } = await supabase.from("overtime_records").select("*").eq("id", id).maybeSingle();
    if (error) return handleSupabaseReadError("overtime_records", error, null);
    return data ? mapOvertimeFromDb(data) : null;
  }
  async getByAttendanceId(attendanceId: string): Promise<OvertimeRecord | null> {
    ensureSupabaseConnected();
    const { data, error } = await supabase.from("overtime_records").select("*").eq("attendance_id", attendanceId).maybeSingle();
    if (error) return handleSupabaseReadError("overtime_records", error, null);
    return data ? mapOvertimeFromDb(data) : null;
  }
  async getByStaff(staffId: string): Promise<OvertimeRecord[]> {
    ensureSupabaseConnected();
    const { data, error } = await supabase.from("overtime_records").select("*").eq("staff_id", staffId);
    if (error) return handleSupabaseReadError("overtime_records", error, []);
    return (data || []).map(mapOvertimeFromDb);
  }
  async getByBranch(branchId: string): Promise<OvertimeRecord[]> {
    ensureSupabaseConnected();
    const { data, error } = await supabase.from("overtime_records").select("*").eq("branch_id", branchId);
    if (error) return handleSupabaseReadError("overtime_records", error, []);
    return (data || []).map(mapOvertimeFromDb);
  }
  async getByDateRange(dateFrom: string, dateTo: string, branchId?: string): Promise<OvertimeRecord[]> {
    ensureSupabaseConnected();
    let q = supabase.from("overtime_records").select("*").gte("date", dateFrom).lte("date", dateTo);
    if (branchId) q = q.eq("branch_id", branchId);
    const { data, error } = await q;
    if (error) return handleSupabaseReadError("overtime_records", error, []);
    return (data || []).map(mapOvertimeFromDb);
  }
  async list(): Promise<OvertimeRecord[]> {
    ensureSupabaseConnected();
    const { data, error } = await supabase.from("overtime_records").select("*");
    if (error) return handleSupabaseReadError("overtime_records", error, []);
    return (data || []).map(mapOvertimeFromDb);
  }
  async detectFromAttendance(attendanceId: string, currentUserRole?: UserRole, userBranchId?: string | null): Promise<OvertimeRecord | null> {
    ensureSupabaseConnected();
    if (currentUserRole !== UserRole.SUPER_ADMIN && currentUserRole !== UserRole.BRANCH_ADMIN) {
      throw new Error("Akses ditolak: hanya Admin Cabang atau Super Admin yang dapat mendeteksi lembur.");
    }
    if (currentUserRole === UserRole.BRANCH_ADMIN && !userBranchId) {
      throw new Error("Cabang Admin tidak memiliki cabang aktif untuk mendeteksi lembur.");
    }
    const existing = await this.getByAttendanceId(attendanceId);
    if (existing) return existing;

    const { data: attendance, error: attendanceError } = await supabase
      .from("attendances")
      .select("id, staff_id, branch_id, date, attendance_status, scheduled_end_at, actual_check_out_at")
      .eq("id", attendanceId)
      .maybeSingle();
    if (attendanceError) throw new Error(`Gagal membaca absensi untuk deteksi lembur: ${attendanceError.message}`);
    if (!attendance || !attendance.actual_check_out_at || !attendance.scheduled_end_at) return null;
    if (!["PRESENT", "LATE"].includes(attendance.attendance_status)) return null;
    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId && attendance.branch_id !== userBranchId) {
      throw new Error("Akses ditolak: Branch Admin hanya dapat mendeteksi lembur cabang sendiri.");
    }

    const { data: staffRow, error: staffError } = await supabase
      .from("staff")
      .select("position")
      .eq("id", attendance.staff_id)
      .maybeSingle();
    if (staffError) throw new Error(`Gagal membaca jabatan staf untuk deteksi lembur: ${staffError.message}`);
    if (!staffRow || !["BRANCH_ADMIN", "ASSISTANT"].includes(staffRow.position)) return null;

    const { data, error } = await supabase.rpc("detect_overtime_from_attendance", {
      p_attendance_id: attendance.id
    });
    if (error) {
      const concurrentRecord = await this.getByAttendanceId(attendanceId);
      if (concurrentRecord) return concurrentRecord;
      throw new Error(`Gagal menyimpan deteksi lembur: ${error.message}`);
    }
    const row = Array.isArray(data) ? data[0] : data;
    return row ? mapOvertimeFromDb(row) : null;
  }
  async submit(id: string, currentUserRole?: UserRole, userBranchId?: string | null): Promise<OvertimeRecord> {
    ensureSupabaseConnected();
    if (currentUserRole !== UserRole.SUPER_ADMIN && currentUserRole !== UserRole.BRANCH_ADMIN) {
      throw new Error("Akses ditolak: hanya Admin Cabang atau Super Admin yang dapat mengajukan lembur.");
    }
    if (currentUserRole === UserRole.BRANCH_ADMIN && !userBranchId) {
      throw new Error("Cabang Admin tidak memiliki cabang aktif untuk mengajukan lembur.");
    }
    const item = await this.getById(id);
    if (!item) throw new Error("Catatan lembur tidak ditemukan.");
    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId && item.branchId !== userBranchId) {
      throw new Error("Akses ditolak: Branch Admin hanya dapat mengajukan lembur cabang sendiri.");
    }
    if (item.status !== OvertimeStatus.DETECTED) throw new Error("Hanya catatan DETECTED yang dapat diajukan.");
    const { data, error } = await supabase.from("overtime_records")
      .update({ status: OvertimeStatus.SUBMITTED, updated_at: AppClock.nowISO() })
      .eq("id", id).eq("status", OvertimeStatus.DETECTED).select("*").maybeSingle();
    if (error) throw new Error(`Gagal mengajukan lembur: ${error.message}`);
    if (!data) throw new Error("Status lembur berubah atau akses tidak diizinkan; muat ulang data dan coba lagi.");
    return mapOvertimeFromDb(data);
  }
  async approve(
    id: string,
    approverName: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null,
    approvedOvertimeMinutes?: number,
    isNationalHoliday = false
  ): Promise<OvertimeRecord> {
    ensureSupabaseConnected();
    if (currentUserRole !== UserRole.SUPER_ADMIN) {
      throw new Error("Akses ditolak: Hanya Super Admin yang dapat menyetujui lembur.");
    }
    if (!approverName.trim()) throw new Error("Nama Super Admin penyetuju wajib diisi.");
    const item = await this.getById(id);
    if (!item) throw new Error("Catatan lembur tidak ditemukan.");
    if (item.status !== OvertimeStatus.SUBMITTED) throw new Error("Hanya catatan SUBMITTED yang dapat disetujui.");
    const { data: staff, error: staffError } = await supabase
      .from("staff")
      .select("position")
      .eq("id", item.staffId)
      .maybeSingle();
    if (staffError) throw new Error(`Gagal memeriksa jabatan staf untuk persetujuan lembur: ${staffError.message}`);
    if (!staff || ![StaffPosition.BRANCH_ADMIN, StaffPosition.ASSISTANT].includes(staff.position)) {
      throw new Error("Lembur hanya dapat disetujui untuk Asisten Dokter dan Admin Cabang.");
    }
    const payableMinutes = approvedOvertimeMinutes ?? item.overtimeMinutes;
    if (!Number.isInteger(payableMinutes) || payableMinutes <= 0 || payableMinutes > item.overtimeMinutes) {
      throw new Error("Durasi lembur yang disetujui harus berupa menit positif dan tidak boleh melebihi durasi aktual.");
    }
    const hourlyRate = isNationalHoliday ? 30000 : 15000;
    const { data, error } = await supabase.from("overtime_records").update({
      status: OvertimeStatus.APPROVED,
      approved_overtime_minutes: payableMinutes,
      overtime_hours: Number((payableMinutes / 60).toFixed(2)),
      is_national_holiday: isNationalHoliday,
      calculation_method: "APPROVED_MINUTES_PRORATED",
      hourly_rate_snapshot: hourlyRate,
      overtime_amount_snapshot: Math.round((payableMinutes * hourlyRate) / 60),
      approved_by: approverName,
      approved_at: AppClock.nowISO(),
      updated_at: AppClock.nowISO(),
      updated_by: approverName
    }).eq("id", id).eq("status", OvertimeStatus.SUBMITTED).select("*").maybeSingle();
    if (error) throw new Error(`Gagal menyetujui lembur: ${error.message}`);
    if (!data) throw new Error("Status lembur berubah atau akses tidak diizinkan; muat ulang data dan coba lagi.");
    return mapOvertimeFromDb(data);
  }
  async reject(id: string, approverName: string, reason: string, currentUserRole?: UserRole, userBranchId?: string | null): Promise<OvertimeRecord> {
    ensureSupabaseConnected();
    if (currentUserRole !== UserRole.SUPER_ADMIN) {
      throw new Error("Akses ditolak: Hanya Super Admin yang dapat menolak lembur.");
    }
    if (!reason.trim()) throw new Error("Alasan penolakan wajib diisi.");
    if (!approverName.trim()) throw new Error("Nama Super Admin penolak wajib diisi.");
    const item = await this.getById(id);
    if (!item) throw new Error("Catatan lembur tidak ditemukan.");
    if (item.status !== OvertimeStatus.SUBMITTED) throw new Error("Hanya catatan SUBMITTED yang dapat ditolak.");
    const { data, error } = await supabase.from("overtime_records").update({
      status: OvertimeStatus.REJECTED,
      rejection_reason: reason.trim(),
      rejected_by: approverName,
      rejected_at: AppClock.nowISO(),
      updated_at: AppClock.nowISO(),
      updated_by: approverName
    }).eq("id", id).eq("status", OvertimeStatus.SUBMITTED).select("*").maybeSingle();
    if (error) throw new Error(`Gagal menolak lembur: ${error.message}`);
    if (!data) throw new Error("Status lembur berubah atau akses tidak diizinkan; muat ulang data dan coba lagi.");
    return mapOvertimeFromDb(data);
  }
  async getSummary(branchId?: string, currentUserRole?: UserRole, userBranchId?: string | null): Promise<OvertimeSummary> {
    if (currentUserRole === UserRole.BRANCH_ADMIN && (!userBranchId || (branchId && branchId !== userBranchId))) {
      throw new Error("Akses ditolak: Branch Admin hanya dapat melihat ringkasan lembur cabang sendiri.");
    }
    const scopedBranchId = currentUserRole === UserRole.BRANCH_ADMIN ? userBranchId : branchId;
    const records = scopedBranchId ? await this.getByBranch(scopedBranchId) : await this.list();
    return records.reduce((summary, record) => {
      const minutes = record.approvedOvertimeMinutes ?? record.overtimeMinutes;
      if (record.status === OvertimeStatus.DETECTED) summary.totalDetectedMinutes += minutes;
      if (record.status === OvertimeStatus.SUBMITTED) summary.totalSubmittedMinutes += minutes;
      if (record.status === OvertimeStatus.APPROVED) summary.totalApprovedMinutes += minutes;
      if (record.status === OvertimeStatus.REJECTED) summary.totalRejectedMinutes += minutes;
      if (record.status === OvertimeStatus.PAID) summary.totalPaidMinutes += minutes;
      return summary;
    }, { totalDetectedMinutes: 0, totalSubmittedMinutes: 0, totalApprovedMinutes: 0, totalRejectedMinutes: 0, totalPaidMinutes: 0 });
  }
}

// =====================================================================
// 25. SUPABASE BACKUP REPOSITORY
// =====================================================================
export class SupabaseBackupRepository implements BackupRepository {
  private mapBackupJob(row: any): BackupJob {
    return {
      id: row.id,
      backupType: row.backup_type as BackupType,
      intervalType: row.interval_type as BackupScheduleInterval,
      startedAt: row.started_at,
      completedAt: row.completed_at || null,
      status: row.status as BackupStatus,
      sizeBytes: row.size_bytes == null ? undefined : Number(row.size_bytes),
      destination: row.destination,
      provider: row.provider === "GOOGLE_DRIVE" ? "GOOGLE_DRIVE" : "LOCAL",
      checksum: row.checksum || null,
      errorMessage: row.error_message || null,
      manifest: row.manifest || null,
      isVerified: row.is_verified ?? false,
      verifiedAt: row.verified_at || null,
      verificationNotes: row.verification_notes || null,
      triggeredBy: row.triggered_by as BackupJob["triggeredBy"],
      createdAt: row.created_at
    };
  }

  async getBackupJobs(): Promise<BackupJob[]> {
    ensureSupabaseConnected();
    const { data, error } = await supabase.from("backup_jobs").select("*");
    if (error) return handleSupabaseReadError("backup_jobs", error, []);
    return (data || []).map((row: any) => this.mapBackupJob(row));
  }
  async getBackupJobById(id: string): Promise<BackupJob | null> {
    ensureSupabaseConnected();
    const { data, error } = await supabase.from("backup_jobs").select("*").eq("id", id).maybeSingle();
    if (error) return handleSupabaseReadError("backup_jobs", error, null);
    return data ? this.mapBackupJob(data) : null;
  }
  async createBackupJob(job: Omit<BackupJob, "id" | "createdAt"> & { id?: string }): Promise<BackupJob> {
    ensureSupabaseConnected();
    const payload = {
      id: job.id || `backup-${Date.now()}`,
      backup_type: job.backupType,
      interval_type: job.intervalType,
      started_at: job.startedAt,
      completed_at: job.completedAt || null,
      status: job.status,
      size_bytes: job.sizeBytes ?? null,
      destination: job.destination,
      provider: job.provider === "GOOGLE_DRIVE" ? "GOOGLE_DRIVE" : "LOCAL",
      checksum: job.checksum || null,
      error_message: job.errorMessage || null,
      manifest: job.manifest || null,
      is_verified: job.isVerified,
      verified_at: job.verifiedAt || null,
      verification_notes: job.verificationNotes || null,
      triggered_by: job.triggeredBy
    };
    const { data, error } = await supabase.from("backup_jobs").insert(payload).select("*").single();
    if (error) throw new Error(`Supabase error writing 'backup_jobs': ${error.message}`);
    if (!data) throw new Error("Supabase tidak mengembalikan data backup job yang baru dibuat.");
    return this.mapBackupJob(data);
  }
  async updateBackupJob(id: string, updates: Partial<BackupJob>): Promise<BackupJob> {
    ensureSupabaseConnected();
    const payload: Record<string, unknown> = {};
    if (updates.backupType !== undefined) payload.backup_type = updates.backupType;
    if (updates.intervalType !== undefined) payload.interval_type = updates.intervalType;
    if (updates.startedAt !== undefined) payload.started_at = updates.startedAt;
    if (updates.completedAt !== undefined) payload.completed_at = updates.completedAt;
    if (updates.status !== undefined) payload.status = updates.status;
    if (updates.sizeBytes !== undefined) payload.size_bytes = updates.sizeBytes;
    if (updates.destination !== undefined) payload.destination = updates.destination;
    if (updates.provider !== undefined) payload.provider = updates.provider === "GOOGLE_DRIVE" ? "GOOGLE_DRIVE" : "LOCAL";
    if (updates.checksum !== undefined) payload.checksum = updates.checksum;
    if (updates.errorMessage !== undefined) payload.error_message = updates.errorMessage;
    if (updates.manifest !== undefined) payload.manifest = updates.manifest;
    if (updates.isVerified !== undefined) payload.is_verified = updates.isVerified;
    if (updates.verifiedAt !== undefined) payload.verified_at = updates.verifiedAt;
    if (updates.verificationNotes !== undefined) payload.verification_notes = updates.verificationNotes;
    if (updates.triggeredBy !== undefined) payload.triggered_by = updates.triggeredBy;
    const { data, error } = await supabase.from("backup_jobs").update(payload).eq("id", id).select("*").single();
    if (error) throw new Error(`Supabase error updating 'backup_jobs': ${error.message}`);
    if (!data) throw new Error(`Backup job '${id}' tidak ditemukan.`);
    return this.mapBackupJob(data);
  }
  async deleteBackupJob(id: string): Promise<boolean> {
    ensureSupabaseConnected();
    const { data, error } = await supabase.from("backup_jobs").delete().eq("id", id).select("id");
    if (error) return handleSupabaseReadError("backup_jobs", error, false);
    return Boolean(data?.length);
  }
  async getLatestDatabaseBackup(): Promise<BackupJob | null> {
    const jobs = await this.getBackupJobs();
    return jobs.find((j) => j.backupType === BackupType.DATABASE) || null;
  }
  async getLatestMediaBackup(): Promise<BackupJob | null> {
    const jobs = await this.getBackupJobs();
    return jobs.find((j) => j.backupType === BackupType.MEDIA) || null;
  }
  async getSystemSummary(): Promise<BackupSystemSummary> {
    const jobs = await this.getBackupJobs();
    const provider = jobs[0]?.provider === "GOOGLE_DRIVE" ? "GOOGLE_DRIVE" : "UNCONFIGURED";
    const systemHealth = jobs.some((job) => job.status === BackupStatus.FAILED)
      ? "CRITICAL"
      : "WARNING";
    return {
      systemHealth,
      provider,
      isConnected: false,
      lastDatabaseBackup: await this.getLatestDatabaseBackup(),
      lastMediaBackup: await this.getLatestMediaBackup(),
      nextScheduledBackupAt: "Belum dikonfigurasi",
      totalBackupsCount: jobs.length,
      storageUsageBytes: 0,
      recentJobs: jobs
    };
  }
}
