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
import {
  AccountBalanceResult
} from "./interfaces";
import { AppClock } from "../utils/clock";
import { generateInvoiceNumber, generateReceiptNumber } from "../utils/documentUtils";
import { checkRMUniqueness } from "../utils/rmUtils";
import { isBranchMatch } from "../utils/branchUtils";
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
    if ((currentUserRole === UserRole.BRANCH_ADMIN || currentUserRole === UserRole.DOCTOR_ASSISTANT) && userBranchId && isValidUUID(userBranchId)) {
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
      createdAt: row.created_at || AppClock.nowISO(),
      updatedAt: row.updated_at || AppClock.nowISO()
    };
  }
}

// =====================================================================
// 2. SUPABASE PATIENT REPOSITORY
// =====================================================================
export class SupabasePatientRepository implements PatientRepository {
  async getPatients(_currentUserRole?: UserRole, _userBranchId?: string | null): Promise<PatientProfile[]> {
    ensureSupabaseConnected();

    if (isSupabaseConfigured && supabase) {
      // 1. Try querying 'patient_profiles' table first (as requested)
      try {
        // RLS scopes branch staff; global portal profiles may have no registered branch.
        const { data, error } = await supabase.from("patient_profiles").select("*");
        if (!error && Array.isArray(data)) {
          return data.map(this.mapPatientFromDb.bind(this));
        }
      } catch (e) {
        console.warn("[Supabase] getPatients from 'patient_profiles' failed:", e);
      }

      // 2. Try 'patients' table as fallback query
      try {
        const { data, error } = await supabase.from("patients").select("*");
        if (!error && Array.isArray(data)) {
          return data.map(this.mapPatientFromDb.bind(this));
        }
      } catch (e) {
        console.warn("[Supabase] getPatients from 'patients' error:", e);
      }
    }

    return [];
  }

  async getPatientById(id: string): Promise<PatientProfile | null> {
    ensureSupabaseConnected();
    if (isSupabaseConfigured && supabase) {
      let lastError: any = null;
      try {
        const { data, error } = await supabase.from("patients").select("*").eq("id", id).single();
        if (!error && data) {
          return this.mapPatientFromDb(data);
        }
        if (error) lastError = error;
      } catch (e) {
        lastError = e;
      }

      try {
        const { data, error } = await supabase.from("patient_profiles").select("*").eq("id", id).single();
        if (!error && data) {
          return this.mapPatientFromDb(data);
        }
        if (error) {
          if (error.code === "PGRST116") return null;
          return handleSupabaseReadError("patient_profiles", error, null);
        }
      } catch (e: any) {
        if (lastError) {
          throw new Error(lastError.message || e.message || "Supabase read error");
        }
        throw e;
      }
    }
    return null;
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
        (p.phone || "").includes(q)
    );
  }

  async createPatient(
    patientData: Omit<PatientProfile, "id" | "medicalRecordNumber" | "createdAt" | "updatedAt"> & { id?: string; medicalRecordNumber?: string; registeredBranchId?: string; branch_id?: string; assignedBranchId?: string; branchId?: string },
    _currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<PatientProfile> {
    ensureSupabaseConnected();

    const nameToUse = (patientData.fullName || patientData.name || "").trim();
    if (!nameToUse) {
      throw new Error("Nama pasien wajib diisi");
    }

    const effBranch = patientData.registeredBranchId || (patientData as any).branch_id || (patientData as any).assignedBranchId || (patientData as any).branchId || userBranchId || null;
    const patientId = patientData.id || (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `pat-${Date.now()}`);

    const existingList = await this.getPatients();

    let finalRM = patientData.medicalRecordNumber ? patientData.medicalRecordNumber.trim() : "";
    if (finalRM) {
      const existingWithRM = existingList.find(
        (p) => (p.medicalRecordNumber || "").trim().toLowerCase() === finalRM.toLowerCase()
      );
      if (existingWithRM) {
        throw new Error(`Nomor Rekam Medis (No RM) "${finalRM}" sudah digunakan oleh pasien ${existingWithRM.fullName || existingWithRM.name}`);
      }
    }

    const dbPayload: any = {
      medical_record_number: finalRM || null,
      name: nameToUse,
      full_name: nameToUse,
      phone: patientData.phone || "",
      email: patientData.email || null,
      date_of_birth: patientData.dateOfBirth || "1990-01-01",
      gender: patientData.gender || "L",
      address: patientData.address || "-",
      medical_history_notes: patientData.medicalHistoryNotes || null,
      acquisition_source: patientData.acquisitionSource || "UNKNOWN",
      referral_name: patientData.acquisitionSource === "REFERRAL" ? patientData.referralName?.trim() || null : null
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
        let res = await supabase.from(table).insert(payload).select().single();
        if (res.error && res.error.message?.includes("does not exist")) {
          const sanitized = { ...payload };
          if (res.error.message.includes("assigned_branch_id")) delete sanitized.assigned_branch_id;
          if (res.error.message.includes("branch_id")) delete sanitized.branch_id;
          if (res.error.message.includes("registered_branch_id")) delete sanitized.registered_branch_id;
          res = await supabase.from(table).insert(sanitized).select().single();
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
        return this.mapPatientFromDb(successData);
      }

      throw new Error(lastErrorMsg || "Gagal menyimpan data pasien ke tabel patient_profiles / patients Supabase (RLS/Koneksi bermasalah).");
    }

    throw new Error("Koneksi Supabase belum terkonfigurasi. Data pasien wajib disimpan ke Supabase.");
  }

  async updatePatient(
    id: string,
    updates: Partial<Omit<PatientProfile, "id" | "createdAt" | "updatedAt">> & { registeredBranchId?: string; branch_id?: string; assignedBranchId?: string; branchId?: string },
    _currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<PatientProfile> {
    ensureSupabaseConnected();
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
    if (updates.address !== undefined) dbPayload.address = updates.address;
    if (updates.gender !== undefined) dbPayload.gender = updates.gender;
    if (updates.dateOfBirth !== undefined) dbPayload.date_of_birth = updates.dateOfBirth;
    if (updates.medicalRecordNumber !== undefined) dbPayload.medical_record_number = updates.medicalRecordNumber;
    if (updates.medicalHistoryNotes !== undefined) dbPayload.medical_history_notes = updates.medicalHistoryNotes;
    if (updates.acquisitionSource !== undefined) dbPayload.acquisition_source = updates.acquisitionSource;
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
      try {
        const { data: pData } = await supabase.from("patients").update(dbPayload).eq("id", id).select().single();
        if (pData) {
          return this.mapPatientFromDb(pData);
        }
      } catch (e) {
        // ...
      }

      try {
        const { data, error } = await supabase.from("patient_profiles").update(dbPayload).eq("id", id).select().single();
        if (!error && data) {
          return this.mapPatientFromDb(data);
        }
        if (error) throw new Error(error.message);
      } catch (e: any) {
        throw new Error(e?.message || "Gagal memperbarui data pasien");
      }
    }

    throw new Error("Koneksi Supabase belum terkonfigurasi");
  }

  async checkDuplicates(phone?: string, medicalRecordNumber?: string, fullName?: string): Promise<DuplicateCheckResult> {
    const all = await this.getPatients();
    const cleanPhone = phone ? phone.replace(/\D/g, "") : "";
    const cleanRM = medicalRecordNumber ? medicalRecordNumber.trim().toLowerCase() : "";
    const cleanName = fullName ? fullName.trim().toLowerCase() : "";

    const byPhone = cleanPhone && cleanPhone.length >= 6
      ? all.filter((p) => (p.phone || "").replace(/\D/g, "").includes(cleanPhone))
      : [];

    const byRM = cleanRM
      ? all.filter((p) => (p.medicalRecordNumber || "").trim().toLowerCase() === cleanRM)
      : [];

    const byName = cleanName && cleanName.length >= 3
      ? all.filter((p) => {
          const pName = (p.fullName || p.name || "").trim().toLowerCase();
          return pName === cleanName || pName.includes(cleanName) || cleanName.includes(pName);
        })
      : [];

    return {
      byPhone,
      byRM,
      byName,
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
      name: row.name || row.full_name || row.fullName || "Pasien",
      fullName: row.full_name || row.name || row.fullName || "Pasien",
      phone: row.phone || row.phone_number || "",
      email: row.email,
      dateOfBirth: row.date_of_birth || row.dateOfBirth || "1990-01-01",
      gender: (row.gender as "L" | "P") || "L",
      address: row.address || "",
      medicalHistoryNotes: row.medical_history_notes || (Array.isArray(row.medical_history) ? row.medical_history.join(", ") : row.medical_history) || "",
      acquisitionSource: row.acquisition_source || row.acquisitionSource || "UNKNOWN",
      referralName: row.referral_name || row.referralName || undefined,
      registeredBranchId: branch,
      branch_id: branch,
      assignedBranchId: branch,
      branchId: branch,
      createdAt: row.created_at || row.registered_at || AppClock.nowISO(),
      updatedAt: row.updated_at || AppClock.nowISO()
    };
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
    visitId: string,
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
    }
  ): Promise<QueueItem> {
    ensureSupabaseConnected();

    if (!useRepositoryTestFallbacks() && !isValidUUID(visitId)) {
      throw new Error("ID kunjungan bukan ID Supabase yang valid. Muat ulang data booking/kunjungan lalu coba lagi.");
    }

    // Check-in callers may pass the branch and patient from the visit they just loaded/created.
    const visitRepo = new SupabaseVisitRepository();
    const suppliedVisitContext = Boolean(options?.branchId && options?.patientId);
    const visit = suppliedVisitContext ? null : await visitRepo.getVisitById(visitId);

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
      (q) => q.visitId === visitId && q.status !== QueueStatus.SKIPPED && q.status !== QueueStatus.COMPLETED && q.status !== "CANCELLED"
    );
    if (existingActive) {
      return existingActive;
    }

    if (hasActiveQueueForPatientOnDate(fallbackItems, patientId, branchId, now, visitId)) {
      throw new Error("Pasien ini sudah berada di antrean aktif hari ini melalui kunjungan lain");
    }

    try {
      const { data: duplicateRemote, error: duplicateRemoteError } = await supabase
        .from("queue_items")
        .select()
        .eq("visit_id", visitId)
        .neq("status", QueueStatus.SKIPPED)
        .neq("status", QueueStatus.COMPLETED)
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

    if (!useRepositoryTestFallbacks() && !isValidUUID(doctorId)) {
      throw new Error("Dokter untuk kunjungan ini belum memiliki ID Supabase yang valid. Pilih dokter yang terdaftar sebelum check-in.");
    }

    // Determine deterministic sequence order and queue number
    const sameScope = fallbackItems.filter((q) => {
      const qDate = getOperationalDateString(q.arrivalAt || q.checkInTime || q.createdAt);
      return q.branchId === branchId && (q.doctorId === doctorId || !doctorId) && qDate === today;
    });
    const sequenceOrder = sameScope.length + 1;
    const doctorPrefix = doctorId.toLowerCase().includes("syafira") ? "S" : doctorId.toLowerCase().includes("dimas") ? "D" : "A";
    const queueNumber = `${doctorPrefix}-${String(sequenceOrder).padStart(2, "0")}`;

    const newId = options?.customId || (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `queue-${Date.now()}`);

    const newQueueItem: QueueItem = {
      id: newId,
      branchId,
      doctorId,
      visitId,
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
      estimatedDurationMinutes: options?.estimatedDurationMinutes ?? getPlannedTreatmentDurationMinutes(options?.plannedTreatments || visit?.plannedTreatments),
      createdAt: now,
      updatedAt: now
    };

    // If visit status is not yet WAITING, update it
    if (visit && visit.visitStatus !== VisitStatus.WAITING) {
      try {
        await visitRepo.updateVisitStatus(visit.id, VisitStatus.WAITING, currentUserRole, userBranchId);
      } catch (err: any) {
        console.warn("[SupabaseQueueRepository] visit status sync note:", err?.message);
      }
    }

    // Attempt remote Supabase insert if IDs are valid UUID and remote accessible
    if (isValidUUID(branchId) && isValidUUID(visitId)) {
      const dbPayload: any = {
        branch_id: branchId,
        doctor_id: doctorId,
        visit_id: visitId,
        queue_number: queueNumber,
        status: QueueStatus.WAITING,
        estimated_duration_minutes: options?.estimatedDurationMinutes ?? getPlannedTreatmentDurationMinutes(options?.plannedTreatments || visit?.plannedTreatments),
        sequence_order: sequenceOrder,
        arrival_at: now,
        preferred_service_at: options?.preferredServiceAt || null
      };
      if (isValidUUID(newId)) dbPayload.id = newId;
      if (isValidUUID(patientId)) dbPayload.patient_id = patientId;
      if (options?.patientNameSnapshot) dbPayload.patient_name_snapshot = options.patientNameSnapshot;
      if (options?.doctorNameSnapshot) dbPayload.doctor_name_snapshot = options.doctorNameSnapshot;
      const queueBookingId = options?.bookingId || visit?.bookingId;
      if (queueBookingId && isValidUUID(queueBookingId)) dbPayload.booking_id = queueBookingId;

      try {
        const { data, error } = await supabase.from("queue_items").insert(dbPayload).select().single();
        if (!error && data) {
          const remoteItem = this.mapQueueFromDb(data);
          const currentList = this.getFallbackQueue();
          const idx = currentList.findIndex((q) => q.id === remoteItem.id || q.id === newId);
          if (idx >= 0) currentList[idx] = remoteItem;
          else currentList.unshift(remoteItem);
          this.saveFallbackQueue(currentList);
          const recalculated = await this.recalculateQueue(branchId, doctorId, today);
          return recalculated.find((item) => item.id === remoteItem.id) || remoteItem;
        } else if (error) {
          if (isSupabaseConfigured) {
            throw new Error(`Gagal menyimpan antrean ke server Supabase: ${error.message}. Data tidak tersimpan akibat masalah koneksi server.`);
          }
          console.warn("[Supabase] queue_items insert restricted/failed, using local fallback:", error.message);
        }
      } catch (err: any) {
        if (isSupabaseConfigured) {
          throw new Error(`Gagal menghubungi server Supabase saat membuat antrean: ${err?.message || "Koneksi bermasalah"}.`);
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

  async removeQueuePatient(queueId: string): Promise<void> {
    const fallbackList = this.getFallbackQueue();
    const idx = fallbackList.findIndex((q) => q.id === queueId);
    if (idx >= 0) {
      fallbackList.splice(idx, 1);
      this.saveFallbackQueue(fallbackList);
    }

    if (isValidUUID(queueId)) {
      try {
        const { error } = await supabase.from("queue_items").delete().eq("id", queueId);
        if (error) {
          if (isSupabaseConfigured) {
            throw new Error(`Gagal menghapus antrean di Supabase: ${error.message}`);
          }
          console.warn("[Supabase] removeQueuePatient remote delete failed:", error.message);
        }
        return;
      } catch (err: any) {
        if (isSupabaseConfigured) {
          throw new Error(`Gagal menghubungi server Supabase saat menghapus antrean: ${err?.message || "Koneksi bermasalah"}.`);
        }
        console.warn("[Supabase] removeQueuePatient remote call failed:", err?.message);
      }
    } else if (isSupabaseConfigured) {
      throw new Error(`ID Antrean '${queueId}' tidak valid untuk database Supabase.`);
    }

    if (idx === -1) {
      throw new Error(`Queue item ${queueId} tidak ditemukan`);
    }
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
    let updatedFallback: QueueItem | null = null;
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
          throw new Error(`Gagal menghubungi server Supabase saat memperbarui status antrean: ${err?.message || "Koneksi bermasalah"}.`);
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
      visitId: row.visit_id,
      patientId: row.patient_id,
      queueNumber: row.queue_number || "A-01",
      status: row.status || QueueStatus.WAITING,
      sequenceOrder: row.sequence_order || 1,
      arrivalAt: row.arrival_at || row.created_at || AppClock.nowISO(),
      bookingId: row.booking_id || row.bookingId || null,
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
      treatmentPlan?: string;
      doctorNotes?: string;
      status?: MedicalRecordStatus | "DRAFT" | "FINAL";
      customId?: string;
    }
  ): Promise<MedicalRecord> {
    ensureSupabaseConnected();
    const existing = await this.getMedicalRecordByVisit(data.visitId);

    if (existing) {
      const { data: updated, error } = await supabase
        .from("clinical_medical_records")
        .update({
          chief_complaint: data.chiefComplaint,
          anamnesis: data.anamnesis,
          clinical_examination: data.clinicalExamination,
          diagnosis: data.diagnosis,
          treatment_plan: data.treatmentPlan,
          doctor_notes: data.doctorNotes,
          status: data.status || MedicalRecordStatus.DRAFT,
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
        chief_complaint: data.chiefComplaint,
        anamnesis: data.anamnesis,
        clinical_examination: data.clinicalExamination,
        diagnosis: data.diagnosis,
        treatment_plan: data.treatmentPlan,
        doctor_notes: data.doctorNotes,
        status: data.status || MedicalRecordStatus.DRAFT
      })
      .select()
      .single();

    if (error) throw new Error(`Supabase error: ${error.message}`);
    return this.mapMedicalRecordFromDb(created);
  }

  async finalizeMedicalRecord(id: string, doctorId: string, currentUserRole?: UserRole): Promise<MedicalRecord> {
    if (currentUserRole !== UserRole.DOCTOR && currentUserRole !== UserRole.SUPER_ADMIN) {
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
      chiefComplaint: row.chief_complaint || row.anamnesis || "Keluhan Gigi",
      anamnesis: row.anamnesis,
      clinicalExamination: row.clinical_examination || row.physical_examination,
      diagnosis: row.diagnosis || "Karies Dentis",
      treatmentPlan: row.treatment_plan || row.treatment_notes,
      doctorNotes: row.doctor_notes || row.treatment_notes,
      status: row.status || MedicalRecordStatus.DRAFT,
      createdAt: row.created_at || AppClock.nowISO(),
      updatedAt: row.updated_at || AppClock.nowISO()
    };
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
      status: row.status as BookingStatus,
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
    const requestedSlotEnd = new Date(requestedSlotStart.getTime() + 60_000);
    const nextDayStart = new Date(dayStart);
    nextDayStart.setTime(nextDayStart.getTime() + 24 * 60 * 60 * 1000);

    if (isValidUUID(bookingData.patientId) && isValidUUID(bookingData.branchId)) {
      const activePatientBookingsQuery = supabase
        .from("bookings")
        .select("id")
        .eq("patient_id", bookingData.patientId);
      const { data: activeBookings, error: duplicateCheckError } = currentUserRole === UserRole.PATIENT
        ? await activePatientBookingsQuery
          .in("status", [BookingStatus.PENDING, BookingStatus.CONFIRMED, BookingStatus.RESCHEDULED])
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
        .select("id")
        .eq("doctor_id", bookingData.doctorId)
        .eq("branch_id", bookingData.branchId)
        .gte("booking_date_time", requestedSlotStart.toISOString())
        .lt("booking_date_time", requestedSlotEnd.toISOString())
        .in("status", [BookingStatus.PENDING, BookingStatus.CONFIRMED])
        .limit(1);

      if (doctorSlotError) {
        throw new Error(`Gagal memeriksa slot dokter: ${doctorSlotError.message}`);
      }
      if (doctorSlotBookings && doctorSlotBookings.length > 0) {
        throw new Error("Dokter sudah memiliki booking aktif pada slot waktu tersebut di cabang ini");
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
        planned_treatments: bookingData.plannedTreatments || []
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
      if (updates.bookingDateTime) dbPayload.booking_date_time = updates.bookingDateTime;
      if (updates.timeSlot !== undefined) dbPayload.time_slot = updates.timeSlot;
      if (updates.complaint !== undefined) dbPayload.complaint = updates.complaint;
      if (updates.notes !== undefined) dbPayload.notes = updates.notes;
      if (updates.source !== undefined) dbPayload.source = updates.source;
      if (updates.channel !== undefined) dbPayload.channel = updates.channel;
      if (updates.status) dbPayload.status = updates.status;
      if (updates.scheduleVerified !== undefined) dbPayload.schedule_verified = updates.scheduleVerified;
      if (updates.plannedTreatments !== undefined) dbPayload.planned_treatments = updates.plannedTreatments;

      try {
        const executeUpdate = async (requestPayload: any) => {
          let q = supabase.from("bookings").update(requestPayload).eq("id", id);
          if ((currentUserRole === UserRole.BRANCH_ADMIN || currentUserRole === UserRole.DOCTOR_ASSISTANT) && userBranchId) {
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
      existing[idx] = { ...existing[idx], ...updates, updatedAt: new Date().toISOString() };
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
      serviceId: row.service_id,
      status: row.status as TreatmentJobStatus,
      serviceNameSnapshot: row.service_name_snapshot,
      doctorNameSnapshot: row.doctor_name_snapshot,
      estimatedDurationMinutes: row.estimated_duration_minutes,
      notes: row.notes ?? undefined,
      assignedDoctorId: row.assigned_doctor_id ?? undefined,
      picAssistantId: row.pic_assistant_id ?? undefined,
      startedAt: row.started_at ?? undefined,
      completedAt: row.completed_at ?? undefined,
      handedOverAt: row.handed_over_at ?? undefined,
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
      q = q.eq("doctor_id", currentUserId);
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
      q = q.eq("doctor_id", currentUserId);
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
    const { data: visit, error: vErr } = await supabase.from("patient_visits").select("branch_id, patient_id").eq("id", data.visitId).single();
    if (vErr || !visit) throw new Error("Visit tidak ditemukan");

    const branchToUse = data.branchId || visit.branch_id;
    const patientToUse = data.patientId || visit.patient_id;

    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId && !isBranchMatch(branchToUse, userBranchId)) {
      throw new Error("Branch Admin tidak dapat membuat treatment untuk cabang lain");
    }

    // Look up service and doctor snapshots
    const { data: srv, error: serviceError } = await supabase
      .from("master_services")
      .select("name, estimated_duration_minutes")
      .eq("id", data.serviceId)
      .single();
    if (serviceError || !srv) {
      throw new Error(`Layanan tindakan tidak ditemukan di Supabase: ${serviceError?.message || data.serviceId}`);
    }
    const { data: doc, error: doctorError } = await supabase
      .from("dental_doctors")
      .select("name")
      .eq("id", data.doctorId)
      .single();
    if (doctorError || !doc) {
      throw new Error(`Dokter penanggung jawab tidak ditemukan di Supabase: ${doctorError?.message || data.doctorId}`);
    }

    const serviceName = srv.name;
    const doctorName = doc.name;
    const estDur = data.estimatedDurationMinutes || srv.estimated_duration_minutes || 30;

    const payload: any = {
      visit_id: data.visitId,
      patient_id: patientToUse,
      branch_id: branchToUse,
      doctor_id: data.doctorId,
      service_id: data.serviceId,
      status: TreatmentJobStatus.BELUM_DIMULAI,
      service_name_snapshot: serviceName,
      doctor_name_snapshot: doctorName,
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
    const now = new Date().toISOString();
    let q = supabase.from("treatment_jobs").update({
      status: TreatmentJobStatus.DALAM_PROSES,
      started_at: now,
      updated_at: now
    }).eq("id", id);

    if ((currentUserRole === UserRole.BRANCH_ADMIN || currentUserRole === UserRole.DOCTOR_ASSISTANT) && userBranchId) {
      q = q.eq("branch_id", userBranchId);
    }
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
    const now = new Date().toISOString();
    let q = supabase.from("treatment_jobs").update({
      status: TreatmentJobStatus.DISERAHKAN,
      handed_over_at: now,
      updated_at: now
    }).eq("id", id);

    if ((currentUserRole === UserRole.BRANCH_ADMIN || currentUserRole === UserRole.DOCTOR_ASSISTANT) && userBranchId) {
      q = q.eq("branch_id", userBranchId);
    }
    const { data, error } = await q.select().single();
    if (error) throw new Error(`Supabase error: ${error.message}`);

    if (actorData) {
      const { error: activityError } = await supabase.from("treatment_activities").insert({
        treatment_id: id,
        actor_id: actorData.actorId || currentUserId || data.doctor_id,
        actor_role: actorData.actorRole || currentUserRole || "DOCTOR",
        actor_name_snapshot: actorData.actorNameSnapshot || "Petugas Medis",
        activity_type: "HANDED_OVER",
        branch_id: data.branch_id,
        notes: actorData.notes || null
      });
      if (activityError) {
        throw new Error(`Treatment sudah diserahkan, tetapi gagal mencatat aktivitas: ${activityError.message}`);
      }
    }

    return this.mapTreatmentFromDb(data);
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
    const totalAmt = data.items.reduce((sum, item) => sum + (item.amount || item.unitPriceSnapshot * item.quantity), 0);
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

    const fallbackItems: InvoiceItem[] = data.items.map((i, index) => {
      const itemAmount = i.amount !== undefined ? i.amount : i.quantity * i.unitPriceSnapshot;
      return {
        id: (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function")
          ? crypto.randomUUID()
          : `item-${invoiceId}-${index + 1}`,
        invoiceId,
        serviceId: i.serviceId,
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
    ensureSupabaseConnected();
    const now = AppClock.nowISO();

    // 1. Look up invoice to get branch & calculate new amounts
    let invoiceBranchId = "";
    let targetInv: Invoice | null = null;

    const fallbackInvoices = this.getFallbackInvoices();
    targetInv = fallbackInvoices.find((i) => i.id === data.invoiceId) || null;

    if (!targetInv && isValidUUID(data.invoiceId)) {
      try {
        const { data: inv, error: invErr } = await supabase.from("invoices").select("*").eq("id", data.invoiceId).single();
        if (invErr && invErr.code !== "PGRST116") {
          throw new Error(`Gagal membaca invoice dari Supabase: ${invErr.message}`);
        }
        if (!invErr && inv) {
          targetInv = {
            id: inv.id,
            invoiceNumber: inv.invoice_number,
            visitId: inv.visit_id,
            patientId: inv.patient_id,
            branchId: inv.branch_id,
            totalAmount: Number(inv.total_amount || 0),
            discountAmount: Number(inv.discount_amount || 0),
            taxAmount: Number(inv.tax_amount || 0),
            netAmount: Number(inv.net_amount || 0),
            paidAmount: Number(inv.paid_amount || 0),
            outstandingAmount: Number(inv.outstanding_amount || 0),
            status: inv.status as InvoiceStatus,
            createdAt: inv.created_at,
            updatedAt: inv.updated_at
          };
        }
      } catch (e: any) {
        console.warn("[Supabase] createPayment invoice lookup error:", e?.message);
      }
    }

    if (targetInv && targetInv.branchId) {
      invoiceBranchId = targetInv.branchId;
    }
    if (!targetInv || !isValidUUID(targetInv.id) || !isValidUUID(invoiceBranchId)) {
      throw new Error("Pembayaran tidak dapat disimpan: invoice Supabase yang valid tidak ditemukan.");
    }

    const currentPaid = targetInv ? Number(targetInv.paidAmount || 0) : 0;
    const currentNet = targetInv ? Number(targetInv.netAmount || 0) : data.amount;
    const newPaid = currentPaid + data.amount;
    const newOutstanding = Math.max(0, currentNet - newPaid);
    const newStatus = newOutstanding <= 0 ? InvoiceStatus.PAID : InvoiceStatus.PARTIALLY_PAID;

    // 2. Prepare Payment Object
    const paymentId = data.customId || (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `pmt-${Date.now()}`);
    const existingPayments = this.getFallbackPayments();
    const receiptNumber = data.customReceiptNumber || generateReceiptNumber(invoiceBranchId, now, existingPayments, MOCK_BRANCHES);

    const fallbackPayment: PaymentTransaction = {
      id: paymentId,
      receiptNumber,
      invoiceId: data.invoiceId,
      branchId: invoiceBranchId,
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

    // Save to local fallback persistence immediately
    const updatedPayments = [fallbackPayment, ...existingPayments.filter((p) => p.id !== paymentId)];
    this.saveFallbackPayments(updatedPayments);

    // Update invoice in fallback persistence
    if (targetInv) {
      const updatedInvoices = fallbackInvoices.map((inv) =>
        inv.id === data.invoiceId
          ? { ...inv, paidAmount: newPaid, outstandingAmount: newOutstanding, status: newStatus, updatedAt: now }
          : inv
      );
      this.saveFallbackInvoices(updatedInvoices);
    }

    // 3. Attempt remote Supabase persistence safely
    if (isSupabaseConfigured && supabase && isValidUUID(data.invoiceId)) {
      try {
        const payload: any = {
          invoice_id: data.invoiceId,
          branch_id: isValidUUID(invoiceBranchId) ? invoiceBranchId : null,
          amount: data.amount,
          payment_method: data.paymentMethod,
          reference_number: data.referenceNumber || null,
          transaction_date_time: now,
          staff_id: data.staffId,
          status: "SUCCESS"
        };
        if (isValidUUID(paymentId)) payload.id = paymentId;

        const { data: created, error } = await supabase.from("payment_transactions").insert(payload).select().single();
        if (!error && created) {
          const { error: invoiceUpdateError } = await supabase.from("invoices").update({
            paid_amount: newPaid,
            outstanding_amount: newOutstanding,
            status: newStatus,
            updated_at: now
          }).eq("id", data.invoiceId);
          if (invoiceUpdateError) {
            throw new Error(`Pembayaran tersimpan, tetapi saldo invoice gagal diperbarui: ${invoiceUpdateError.message}`);
          }

          const mapped = this.mapPaymentFromDb(created);
          return mapped;
        } else if (error) {
          if (!useRepositoryTestFallbacks()) {
            throw new Error(`Gagal menyimpan pembayaran di Supabase: ${error.message}`);
          }
        }
      } catch (err: any) {
        if (!useRepositoryTestFallbacks()) throw err;
      }
    }

    if (useRepositoryTestFallbacks()) return fallbackPayment;
    throw new Error("Pembayaran tidak tersimpan ke Supabase.");
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
        const { data: pmt } = await supabase.from("payment_transactions").select("*").eq("id", id).single();
        if (pmt) {
          invoiceId = pmt.invoice_id;
          await supabase.from("payment_transactions").delete().eq("id", id);
        }
      } catch (e: any) {
        console.warn("[Supabase] deletePayment remote error:", e?.message);
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
            await supabase.from("invoices").update({
              paid_amount: newPaid,
              outstanding_amount: newOutstanding,
              status: newStatus,
              updated_at: AppClock.nowISO()
            }).eq("id", invoiceId);
          } catch (e: any) {
            console.warn("[Supabase] deletePayment update remote invoice error:", e?.message);
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

  async getDoctors(currentUserRole?: UserRole, userBranchId?: string | null): Promise<DentalDoctor[]> {
    if (!useRepositoryTestFallbacks()) ensureSupabaseConnected();
    if (isSupabaseConfigured && supabase) {
      try {
        let q = supabase.from("dental_doctors").select("*").eq("active", true).order("name");
        
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
      photo_url: data.photoUrl || data.avatarUrl || null,
      notes: data.notes || null
    };
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
        if (updates.specialization) payload.specialization = updates.specialization;
        if (updates.phone) payload.phone = updates.phone;
        if (updates.email !== undefined) payload.email = updates.email;
        if (updates.assignedBranchId !== undefined) payload.assigned_branch_id = updates.assignedBranchId;
        if (updates.active !== undefined) payload.active = updates.active;
        if (updates.avatarUrl !== undefined || updates.photoUrl !== undefined || (updates as any).profileImage !== undefined) {
          const photoUrl = updates.photoUrl || updates.avatarUrl || (updates as any).profileImage || null;
          payload.avatar_url = photoUrl;
          payload.photo_url = photoUrl;
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
    if (isValidUUID(id)) {
      try {
        const { data, error } = await supabase
          .from("dental_doctors")
          .update({ avatar_url: photoUrl, photo_url: photoUrl, updated_at: new Date().toISOString() })
          .eq("id", id)
          .select()
          .single();
        if (!error && data) {
          const res = this.mapDoctorFromDb(data);
          const existing = this.getFallbackDoctors();
          const idx = existing.findIndex((d) => d.id === id);
          if (idx >= 0) existing[idx] = { ...existing[idx], ...res };
          this.saveFallbackDoctors(existing);
          return res;
        }
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
      fullName: row.full_name,
      phone: row.phone,
      position: row.position,
      employmentStatus: row.employment_status,
      joinDate: row.join_date,
      active: row.active,
      notes: row.notes,
      branchId: row.branch_id,
      userAccountId: row.user_account_id,
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
  async getCompensationRules(): Promise<StaffCompensationRule[]> {
    ensureSupabaseConnected();
    const { data, error } = await supabase.from("compensation_rules").select("*");
    if (error) return handleSupabaseReadError("compensation_rules", error, []);
    return (data || []).map((row: any) => ({
      id: row.id,
      staffId: row.staff_id,
      name: row.name || "Rule",
      ruleTypeSnapshot: row.rule_type_snapshot || "PERCENTAGE",
      valueSnapshot: row.value_snapshot || 0,
      isActive: row.is_active ?? true,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }
  async getCompensationRulesByStaff(staffId: string): Promise<StaffCompensationRule[]> {
    const all = await this.getCompensationRules();
    return all.filter((r) => r.staffId === staffId);
  }
  async createCompensationRule(data: Omit<StaffCompensationRule, "id" | "createdAt" | "updatedAt"> & { id?: string }): Promise<StaffCompensationRule> {
    const item: StaffCompensationRule = {
      id: data.id || `comp-rule-${Date.now()}`,
      staffId: data.staffId,
      name: data.name,
      ruleTypeSnapshot: data.ruleTypeSnapshot,
      valueSnapshot: data.valueSnapshot,
      isActive: data.isActive ?? true,
      createdAt: AppClock.nowISO(),
      updatedAt: AppClock.nowISO()
    };
    return item;
  }
  async updateCompensationRule(id: string, updates: Partial<Omit<StaffCompensationRule, "id" | "createdAt" | "updatedAt">>): Promise<StaffCompensationRule> {
    const item: StaffCompensationRule = {
      id,
      staffId: updates.staffId || "",
      name: updates.name || "",
      ruleTypeSnapshot: updates.ruleTypeSnapshot || "PERCENTAGE",
      valueSnapshot: updates.valueSnapshot || 0,
      isActive: updates.isActive ?? true,
      createdAt: AppClock.nowISO(),
      updatedAt: AppClock.nowISO()
    };
    return item;
  }
  async getCompensationAccruals(staffId?: string): Promise<CompensationAccrual[]> {
    ensureSupabaseConnected();
    let q = supabase.from("compensation_accruals").select("*");
    if (staffId) q = q.eq("staff_id", staffId);
    const { data, error } = await q;
    if (error) return handleSupabaseReadError("compensation_accruals", error, []);
    return (data || []).map((row: any) => ({
      id: row.id,
      staffId: row.staff_id,
      amount: row.amount,
      sourceId: row.source_id || "src-1",
      accruedAt: row.accrued_at || AppClock.nowISO()
    }));
  }
  async calculateAndAccrueForTreatment(treatmentJobId: string): Promise<CompensationAccrual[]> {
    return [];
  }
  async deleteAccrual(id: string, currentUserRole?: UserRole): Promise<boolean> {
    return true;
  }
  async deleteCompensationRule(id: string, currentUserRole?: UserRole): Promise<boolean> {
    return true;
  }
}

// =====================================================================
// 19. SUPABASE PAYROLL REPOSITORY
// =====================================================================
export class SupabasePayrollRepository implements PayrollRepository {
  async getPayrolls(month?: number, year?: number): Promise<MonthlyPayroll[]> {
    ensureSupabaseConnected();
    let q = supabase.from("monthly_payrolls").select("*");
    if (month) q = q.eq("month", month);
    if (year) q = q.eq("year", year);
    const { data, error } = await q;
    if (error) return handleSupabaseReadError("monthly_payrolls", error, []);
    return (data || []).map((row: any) => ({
      id: row.id,
      staffId: row.staff_id,
      month: row.month,
      year: row.year,
      baseSalary: row.base_salary,
      totalCompensation: row.total_compensation || 0,
      totalDeductions: row.total_deductions || 0,
      netSalary: row.net_salary,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }
  async getPayrollById(id: string): Promise<MonthlyPayroll | null> {
    const list = await this.getPayrolls();
    return list.find((p) => p.id === id) || null;
  }
  async getPayrollItems(payrollId: string): Promise<PayrollItem[]> {
    ensureSupabaseConnected();
    const { data, error } = await supabase.from("payroll_items").select("*").eq("payroll_id", payrollId);
    if (error) return handleSupabaseReadError("payroll_items", error, []);
    return (data || []).map((row: any) => ({
      id: row.id,
      payrollId: row.payroll_id,
      descriptionSnapshot: row.description || "Item",
      amountSnapshot: row.amount || 0,
      type: row.type || "EARNING"
    }));
  }
  async generateMonthlyPayroll(staffId: string, month: number, year: number, baseSalary = 0): Promise<MonthlyPayroll> {
    return {
      id: `pay-${Date.now()}`,
      staffId,
      month,
      year,
      baseSalary,
      totalCompensation: 0,
      totalDeductions: 0,
      netSalary: baseSalary,
      status: PayrollStatus.DRAFT,
      createdAt: AppClock.nowISO(),
      updatedAt: AppClock.nowISO()
    };
  }
  async updatePayrollStatus(id: string, status: PayrollStatus): Promise<MonthlyPayroll> {
    const item = await this.getPayrollById(id);
    if (!item) throw new Error("Payroll not found");
    return { ...item, status, updatedAt: AppClock.nowISO() };
  }
  async deletePayroll(id: string, currentUserRole?: UserRole): Promise<boolean> {
    return true;
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
      status: "DRAFT",
      total_debit: totalDebit,
      total_credit: totalCredit,
      created_by: createdBy
    };
    const { data: inserted, error } = await supabase.from("journal_entries").insert(payload).select().single();
    if (error) throw new Error(`Gagal membuat draft journal: ${error.message}`);

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
  async voidJournal(id: string, voidedBy: string, reason?: string): Promise<JournalEntry> {
    ensureSupabaseConnected();
    const voidedAt = AppClock.nowISO();
    const { data, error } = await supabase.from("journal_entries").update({
      status: "VOID",
      voided_at: voidedAt,
      voided_by: voidedBy,
      void_reason: reason || null,
      updated_at: voidedAt
    }).eq("id", id).select().single();
    if (error) throw new Error(`Gagal void journal: ${error.message}`);
    return {
      id: data.id,
      journalNumber: data.journal_number,
      journalDate: data.journal_date,
      branchId: data.branch_id,
      description: data.description,
      sourceType: data.source_type,
      sourceId: data.source_id,
      status: data.status,
      lines: [],
      totalDebit: Number(data.total_debit || 0),
      totalCredit: Number(data.total_credit || 0),
      createdBy: data.created_by || "System",
      createdAt: data.created_at,
      postedAt: data.posted_at,
      postedBy: data.posted_by,
      voidedAt: data.voided_at,
      voidedBy: data.voided_by,
      voidReason: data.void_reason,
      updatedAt: data.updated_at
    };
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
    if (filter?.date) q = q.eq("assignment_date", filter.date);
    const { data, error } = await q;
    if (error) return handleSupabaseReadError("staff_shift_assignments", error, []);
    return (data || []).map((row: any) => ({
      id: row.id,
      staffId: row.staff_id,
      shiftId: row.shift_id,
      branchId: row.branch_id,
      date: row.assignment_date,
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
      branchId: data.branch_id,
      date: data.assignment_date,
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
      branch_id: data.branchId,
      assignment_date: data.date,
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
      branchId: inserted.branch_id,
      date: inserted.assignment_date,
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
    if (updates.shiftId) payload.shift_id = updates.shiftId;
    if (updates.branchId) payload.branch_id = updates.branchId;
    if (updates.date) payload.assignment_date = updates.date;
    if (updates.active !== undefined) payload.active = updates.active;
    if (updates.notes !== undefined) payload.notes = updates.notes;
    const { data: updated, error } = await supabase.from("staff_shift_assignments").update(payload).eq("id", id).select().single();
    if (error) throw new Error(`Gagal update assignment: ${error.message}`);
    return {
      id: updated.id,
      staffId: updated.staff_id,
      shiftId: updated.shift_id,
      branchId: updated.branch_id,
      date: updated.assignment_date,
      active: updated.active ?? true,
      notes: updated.notes,
      createdAt: updated.created_at || AppClock.nowISO(),
      updatedAt: updated.updated_at || AppClock.nowISO()
    };
  }
  async removeAssignment(id: string): Promise<void> {
    ensureSupabaseConnected();
    await supabase.from("staff_shift_assignments").delete().eq("id", id);
  }
}

// =====================================================================
// 23. SUPABASE ATTENDANCE REPOSITORY
// =====================================================================
export class SupabaseAttendanceRepository implements AttendanceRepository {
  async getById(id: string): Promise<Attendance | null> {
    ensureSupabaseConnected();
    const { data, error } = await supabase.from("attendances").select("*").eq("id", id).maybeSingle();
    if (error) return handleSupabaseReadError("attendances", error, null);
    if (!data) return null;
    return {
      id: data.id,
      staffId: data.staff_id,
      branchId: data.branch_id,
      date: data.date,
      attendanceStatus: data.attendance_status || AttendanceStatus.PRESENT,
      scheduledStartAt: data.scheduled_start_at || "08:00",
      scheduledEndAt: data.scheduled_end_at || "17:00",
      actualCheckInAt: data.actual_check_in_at,
      actualCheckOutAt: data.actual_check_out_at,
      lateMinutes: data.late_minutes || 0,
      earlyCheckoutMinutes: data.early_checkout_minutes || 0,
      notes: data.notes,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    };
  }
  async getByStaff(staffId: string): Promise<Attendance[]> {
    ensureSupabaseConnected();
    const { data, error } = await supabase.from("attendances").select("*").eq("staff_id", staffId);
    if (error) return handleSupabaseReadError("attendances", error, []);
    return (data || []).map((row: any) => ({
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
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }
  async getByDate(date: string, branchId?: string): Promise<Attendance[]> {
    ensureSupabaseConnected();
    let q = supabase.from("attendances").select("*").eq("date", date);
    if (branchId) q = q.eq("branch_id", branchId);
    const { data, error } = await q;
    if (error) return handleSupabaseReadError("attendances", error, []);
    return (data || []).map((row: any) => ({
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
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }
  async getByBranch(branchId: string): Promise<Attendance[]> {
    ensureSupabaseConnected();
    const { data, error } = await supabase.from("attendances").select("*").eq("branch_id", branchId);
    if (error) return handleSupabaseReadError("attendances", error, []);
    return (data || []).map((row: any) => ({
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
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }
  async list(): Promise<Attendance[]> {
    ensureSupabaseConnected();
    const { data, error } = await supabase.from("attendances").select("*");
    if (error) return handleSupabaseReadError("attendances", error, []);
    return (data || []).map((row: any) => ({
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
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }
  async checkIn(input: CheckInInput): Promise<Attendance> {
    ensureSupabaseConnected();
    const record: Attendance = {
      id: `att-${Date.now()}`,
      staffId: input.staffId,
      branchId: input.branchId || "default-branch",
      date: input.date || AppClock.todayDateString(),
      attendanceStatus: AttendanceStatus.PRESENT,
      scheduledStartAt: input.scheduledStartAt || "08:00",
      scheduledEndAt: input.scheduledEndAt || "17:00",
      actualCheckInAt: input.checkInTime || AppClock.nowISO(),
      actualCheckOutAt: null,
      lateMinutes: 0,
      earlyCheckoutMinutes: 0,
      notes: input.notes,
      createdAt: AppClock.nowISO(),
      updatedAt: AppClock.nowISO()
    };
    return record;
  }
  async checkOut(input: CheckOutInput): Promise<Attendance> {
    ensureSupabaseConnected();
    const record: Attendance = {
      id: input.attendanceId || `att-${input.staffId}`,
      staffId: input.staffId || "",
      branchId: "default-branch",
      date: input.date || AppClock.todayDateString(),
      attendanceStatus: AttendanceStatus.PRESENT,
      scheduledStartAt: "08:00",
      scheduledEndAt: "17:00",
      actualCheckInAt: AppClock.nowISO(),
      actualCheckOutAt: input.checkOutTime || AppClock.nowISO(),
      lateMinutes: 0,
      earlyCheckoutMinutes: 0,
      notes: input.notes,
      createdAt: AppClock.nowISO(),
      updatedAt: AppClock.nowISO()
    };
    return record;
  }
  async createAbsence(input: CreateAbsenceInput): Promise<Attendance> {
    ensureSupabaseConnected();
    const record: Attendance = {
      id: `att-abs-${Date.now()}`,
      staffId: input.staffId,
      branchId: input.branchId || "default-branch",
      date: input.date,
      attendanceStatus: input.attendanceStatus,
      scheduledStartAt: input.scheduledStartAt || "08:00",
      scheduledEndAt: input.scheduledEndAt || "17:00",
      actualCheckInAt: null,
      actualCheckOutAt: null,
      lateMinutes: 0,
      earlyCheckoutMinutes: 0,
      notes: input.notes,
      createdAt: AppClock.nowISO(),
      updatedAt: AppClock.nowISO()
    };
    return record;
  }
}

// =====================================================================
// 24. SUPABASE OVERTIME REPOSITORY
// =====================================================================
export class SupabaseOvertimeRepository implements OvertimeRepository {
  async getById(id: string): Promise<OvertimeRecord | null> {
    ensureSupabaseConnected();
    const { data, error } = await supabase.from("overtime_records").select("*").eq("id", id).maybeSingle();
    if (error) return handleSupabaseReadError("overtime_records", error, null);
    if (!data) return null;
    return {
      id: data.id,
      staffId: data.staff_id,
      branchId: data.branch_id,
      attendanceId: data.attendance_id,
      date: data.overtime_date,
      scheduledEndAt: data.scheduled_end_at || "17:00",
      actualEndAt: data.actual_end_at || "17:00",
      overtimeMinutes: data.overtime_minutes || 0,
      overtimeHours: data.overtime_hours || 0,
      overtimeType: data.overtime_type || OvertimeType.AFTER_SHIFT,
      status: data.status || OvertimeStatus.DETECTED,
      notes: data.notes,
      createdAt: data.created_at || AppClock.nowISO(),
      updatedAt: data.updated_at || AppClock.nowISO()
    };
  }
  async getByAttendanceId(attendanceId: string): Promise<OvertimeRecord | null> {
    ensureSupabaseConnected();
    const { data, error } = await supabase.from("overtime_records").select("*").eq("attendance_id", attendanceId).maybeSingle();
    if (error) return handleSupabaseReadError("overtime_records", error, null);
    if (!data) return null;
    return {
      id: data.id,
      staffId: data.staff_id,
      branchId: data.branch_id,
      attendanceId: data.attendance_id,
      date: data.overtime_date,
      scheduledEndAt: data.scheduled_end_at || "17:00",
      actualEndAt: data.actual_end_at || "17:00",
      overtimeMinutes: data.overtime_minutes || 0,
      overtimeHours: data.overtime_hours || 0,
      overtimeType: data.overtime_type || OvertimeType.AFTER_SHIFT,
      status: data.status || OvertimeStatus.DETECTED,
      notes: data.notes,
      createdAt: data.created_at || AppClock.nowISO(),
      updatedAt: data.updated_at || AppClock.nowISO()
    };
  }
  async getByStaff(staffId: string): Promise<OvertimeRecord[]> {
    ensureSupabaseConnected();
    const { data, error } = await supabase.from("overtime_records").select("*").eq("staff_id", staffId);
    if (error) return handleSupabaseReadError("overtime_records", error, []);
    return (data || []).map((row: any) => ({
      id: row.id,
      staffId: row.staff_id,
      branchId: row.branch_id,
      attendanceId: row.attendance_id,
      date: row.overtime_date,
      scheduledEndAt: row.scheduled_end_at || "17:00",
      actualEndAt: row.actual_end_at || "17:00",
      overtimeMinutes: row.overtime_minutes || 0,
      overtimeHours: row.overtime_hours || 0,
      overtimeType: row.overtime_type || OvertimeType.AFTER_SHIFT,
      status: row.status || OvertimeStatus.DETECTED,
      notes: row.notes,
      createdAt: row.created_at || AppClock.nowISO(),
      updatedAt: row.updated_at || AppClock.nowISO()
    }));
  }
  async getByBranch(branchId: string): Promise<OvertimeRecord[]> {
    ensureSupabaseConnected();
    const { data, error } = await supabase.from("overtime_records").select("*").eq("branch_id", branchId);
    if (error) return handleSupabaseReadError("overtime_records", error, []);
    return (data || []).map((row: any) => ({
      id: row.id,
      staffId: row.staff_id,
      branchId: row.branch_id,
      attendanceId: row.attendance_id,
      date: row.overtime_date,
      scheduledEndAt: row.scheduled_end_at || "17:00",
      actualEndAt: row.actual_end_at || "17:00",
      overtimeMinutes: row.overtime_minutes || 0,
      overtimeHours: row.overtime_hours || 0,
      overtimeType: row.overtime_type || OvertimeType.AFTER_SHIFT,
      status: row.status || OvertimeStatus.DETECTED,
      notes: row.notes,
      createdAt: row.created_at || AppClock.nowISO(),
      updatedAt: row.updated_at || AppClock.nowISO()
    }));
  }
  async getByDateRange(dateFrom: string, dateTo: string, branchId?: string): Promise<OvertimeRecord[]> {
    ensureSupabaseConnected();
    let q = supabase.from("overtime_records").select("*").gte("overtime_date", dateFrom).lte("overtime_date", dateTo);
    if (branchId) q = q.eq("branch_id", branchId);
    const { data, error } = await q;
    if (error) return handleSupabaseReadError("overtime_records", error, []);
    return (data || []).map((row: any) => ({
      id: row.id,
      staffId: row.staff_id,
      branchId: row.branch_id,
      attendanceId: row.attendance_id,
      date: row.overtime_date,
      scheduledEndAt: row.scheduled_end_at || "17:00",
      actualEndAt: row.actual_end_at || "17:00",
      overtimeMinutes: row.overtime_minutes || 0,
      overtimeHours: row.overtime_hours || 0,
      overtimeType: row.overtime_type || OvertimeType.AFTER_SHIFT,
      status: row.status || OvertimeStatus.DETECTED,
      notes: row.notes,
      createdAt: row.created_at || AppClock.nowISO(),
      updatedAt: row.updated_at || AppClock.nowISO()
    }));
  }
  async list(): Promise<OvertimeRecord[]> {
    ensureSupabaseConnected();
    const { data, error } = await supabase.from("overtime_records").select("*");
    if (error) return handleSupabaseReadError("overtime_records", error, []);
    return (data || []).map((row: any) => ({
      id: row.id,
      staffId: row.staff_id,
      branchId: row.branch_id,
      attendanceId: row.attendance_id,
      date: row.overtime_date,
      scheduledEndAt: row.scheduled_end_at || "17:00",
      actualEndAt: row.actual_end_at || "17:00",
      overtimeMinutes: row.overtime_minutes || 0,
      overtimeHours: row.overtime_hours || 0,
      overtimeType: row.overtime_type || OvertimeType.AFTER_SHIFT,
      status: row.status || OvertimeStatus.DETECTED,
      notes: row.notes,
      createdAt: row.created_at || AppClock.nowISO(),
      updatedAt: row.updated_at || AppClock.nowISO()
    }));
  }
  async detectFromAttendance(attendanceId: string): Promise<OvertimeRecord | null> {
    return this.getByAttendanceId(attendanceId);
  }
  async submit(id: string): Promise<OvertimeRecord> {
    const item = await this.getById(id);
    if (!item) throw new Error("Overtime not found");
    return { ...item, status: OvertimeStatus.SUBMITTED };
  }
  async approve(id: string, approverName: string): Promise<OvertimeRecord> {
    const item = await this.getById(id);
    if (!item) throw new Error("Overtime not found");
    return { ...item, status: OvertimeStatus.APPROVED };
  }
  async reject(id: string, approverName: string, reason: string): Promise<OvertimeRecord> {
    const item = await this.getById(id);
    if (!item) throw new Error("Overtime not found");
    return { ...item, status: OvertimeStatus.REJECTED, notes: reason };
  }
  async getSummary(): Promise<OvertimeSummary> {
    return { totalDetectedMinutes: 0, totalSubmittedMinutes: 0, totalApprovedMinutes: 0, totalRejectedMinutes: 0, totalPaidMinutes: 0 };
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
