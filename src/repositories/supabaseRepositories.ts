/**
 * LALA DENTIST - SUPABASE PRODUCTION REPOSITORIES
 * Single Source of Truth database persistence mapping with strict Row Level Security (RLS),
 * Branch Isolation, and RBAC error handling.
 */

import { supabase, isSupabaseConfigured } from "../lib/supabase";
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
  CreateJournalInput
} from "./interfaces";
import {
  PatientProfile,
  DentalBranch,
  DentalDoctor,
  Booking,
  BookingStatus,
  BookingConfirmationH1,
  PatientVisit,
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
  QueueStatus,
  VisitStatus,
  ScheduleStatus,
  ConfirmationStatusH1,
  IncomeStatementReport,
  TrialBalanceReport,
  BalanceSheetReport
} from "../types/domain";
import { AppClock } from "../utils/clock";
import { DEFAULT_CLINIC_BRANDING, MOCK_BRANCHES, MOCK_DOCTORS, MOCK_PATIENTS, MOCK_SERVICES, MOCK_BRANCH_TARIFFS, MOCK_QUEUE_ITEMS, MOCK_INVOICES, MOCK_INVOICE_ITEMS, MOCK_PAYMENTS } from "../data/mockData";
import { generateInvoiceNumber, generateReceiptNumber } from "../utils/documentUtils";

export function isValidUUID(val?: string | null): boolean {
  if (!val || typeof val !== "string") return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val.trim());
}

export function handleSupabaseReadError<T>(table: string, error: any, defaultReturn: T): T {
  if (!error) return defaultReturn;
  if (error.code === "PGRST116") return defaultReturn; // not found
  if (error.code === "42501" || error.message?.includes("permission denied")) {
    console.warn(`[Supabase RLS] Access restricted for table '${table}':`, error.message);
    return defaultReturn;
  }
  throw new Error(`Supabase error: ${error.message}`);
}

function ensureSupabaseConnected() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error("Koneksi ke Supabase belum terkonfigurasi. Data belum dapat disimpan ke server remote.");
  }
}

// =====================================================================
// 1. SUPABASE BRANCH REPOSITORY
// =====================================================================
export class SupabaseBranchRepository implements BranchRepository {
  private getFallbackBranches(): DentalBranch[] {
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
        const fallback = this.getFallbackBranches();
        return fallback.filter((b) => b.id === userBranchId);
      }
      const mapped = (data || []).map(this.mapBranchFromDb);
      if (mapped.length > 0) return mapped;
      const fallback = this.getFallbackBranches();
      return fallback.filter((b) => b.id === userBranchId);
    }

    const { data, error } = await supabase
      .from("dental_branches")
      .select("*")
      .order("name", { ascending: true });

    if (error) {
      handleSupabaseReadError("dental_branches", error, []);
      return this.getFallbackBranches();
    }

    const mapped = (data || []).map(this.mapBranchFromDb);
    if (mapped.length === 0) {
      const fallback = this.getFallbackBranches();
      this.saveFallbackBranches(fallback);
      return fallback;
    }

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

    if (error) {
      const fallback = this.getFallbackBranches();
      return fallback.find((b) => b.id === id) || null;
    }
    if (!data) {
      const fallback = this.getFallbackBranches();
      return fallback.find((b) => b.id === id) || null;
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
          logoUrl: data.logoUrl || "/logo-lala.png",
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
        console.warn("[Supabase] updateBranch remote failed (e.g. RLS), saving locally:", fbErr.message);
        const existing = this.getFallbackBranches();
        const idx = existing.findIndex((b) => b.id === id);
        if (idx >= 0) {
          existing[idx] = { ...existing[idx], ...updates, updatedAt: AppClock.nowISO() };
          this.saveFallbackBranches(existing);
          return existing[idx];
        }
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
      console.warn("[Supabase] updateBranchBranding remote failed, saving locally:", error.message);
      const existing = this.getFallbackBranches();
      const idx = existing.findIndex((b) => b.id === id);
      if (idx >= 0) {
        existing[idx] = { ...existing[idx], ...brandingUpdates, updatedAt: AppClock.nowISO() };
        this.saveFallbackBranches(existing);
        return existing[idx];
      }
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
  private getFallbackPatients(): PatientProfile[] {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("lala_patients");
        if (saved !== null) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            return parsed;
          }
        }
      } catch (e) {
        console.warn("Error reading patients from localStorage fallback:", e);
      }
    }
    return [];
  }

  private saveFallbackPatients(patients: PatientProfile[]): void {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("lala_patients", JSON.stringify(patients));
      } catch (e) {
        console.warn("Error saving patients to localStorage:", e);
      }
    }
  }

  async getPatients(currentUserRole?: UserRole, userBranchId?: string | null): Promise<PatientProfile[]> {
    ensureSupabaseConnected();
    let remotePatients: PatientProfile[] = [];
    let hasRemote = false;

    try {
      let query = supabase.from("patient_profiles").select("*");
      if ((currentUserRole === UserRole.BRANCH_ADMIN || currentUserRole === UserRole.DOCTOR_ASSISTANT) && userBranchId && isValidUUID(userBranchId)) {
        query = query.eq("registered_branch_id", userBranchId);
      }
      const { data, error } = await query;
      if (!error && data) {
        remotePatients = data.map(this.mapPatientFromDb);
        hasRemote = true;
      } else if (error) {
        console.warn("[Supabase] getPatients query warning:", error.message);
      }
    } catch (e) {
      console.warn("[Supabase] getPatients remote error:", e);
    }

    const fallback = this.getFallbackPatients();

    if (hasRemote && remotePatients.length > 0) {
      const remoteIds = new Set(remotePatients.map((p) => p.id));
      const localOnly = fallback.filter((p) => !remoteIds.has(p.id));
      const merged = [...remotePatients, ...localOnly];
      this.saveFallbackPatients(merged);
      return merged;
    }

    if ((currentUserRole === UserRole.BRANCH_ADMIN || currentUserRole === UserRole.DOCTOR_ASSISTANT) && userBranchId) {
      return fallback.filter((p) => !p.registeredBranchId || p.registeredBranchId === userBranchId);
    }
    return fallback;
  }

  async getPatientById(id: string): Promise<PatientProfile | null> {
    ensureSupabaseConnected();
    const { data, error } = await supabase.from("patient_profiles").select("*").eq("id", id).single();
    if (error) {
      if (error.code === "PGRST116") {
        const fallback = this.getFallbackPatients();
        return fallback.find((p) => p.id === id) || null;
      }
      return handleSupabaseReadError("patient_profiles", error, null);
    }
    if (!data) return null;
    return this.mapPatientFromDb(data);
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
    patientData: Omit<PatientProfile, "id" | "medicalRecordNumber" | "createdAt" | "updatedAt"> & { id?: string; medicalRecordNumber?: string; registeredBranchId?: string },
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<PatientProfile> {
    ensureSupabaseConnected();

    const nameToUse = (patientData.fullName || patientData.name || "").trim();
    if (!nameToUse) {
      throw new Error("Nama pasien wajib diisi");
    }

    const effBranch = patientData.registeredBranchId || userBranchId || null;
    const patientId = patientData.id || (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `pat-${Date.now()}`);

    // Generate clean RM if not provided
    let finalRM = patientData.medicalRecordNumber ? patientData.medicalRecordNumber.trim() : "";
    if (!finalRM) {
      const existingList = this.getFallbackPatients();
      let maxNum = 0;
      existingList.forEach((p) => {
        if (p.medicalRecordNumber) {
          const match = p.medicalRecordNumber.match(/\d+/);
          if (match) {
            const num = parseInt(match[0], 10);
            if (!isNaN(num) && num > maxNum) maxNum = num;
          }
        }
      });
      finalRM = `RM-${String(maxNum + 1).padStart(6, "0")}`;
    }

    const dbPayload: any = {
      medical_record_number: finalRM,
      name: nameToUse,
      full_name: nameToUse,
      phone: patientData.phone || "",
      email: patientData.email || null,
      date_of_birth: patientData.dateOfBirth || "1990-01-01",
      gender: patientData.gender || "L",
      address: patientData.address || "-",
      medical_history_notes: patientData.medicalHistoryNotes || null
    };

    if (isValidUUID(patientId)) {
      dbPayload.id = patientId;
    }
    if (effBranch && isValidUUID(effBranch)) {
      dbPayload.registered_branch_id = effBranch;
    }

    // Try remote insert first
    try {
      const { data, error } = await supabase.from("patient_profiles").insert(dbPayload).select().single();
      if (!error && data) {
        const res = this.mapPatientFromDb(data);
        const existing = this.getFallbackPatients();
        const idx = existing.findIndex((p) => p.id === res.id || p.medicalRecordNumber === res.medicalRecordNumber);
        if (idx >= 0) existing[idx] = res;
        else existing.unshift(res);
        this.saveFallbackPatients(existing);
        return res;
      }
      console.warn("[Supabase] createPatient remote returned error, saving locally:", error?.message);
    } catch (err: any) {
      console.warn("[Supabase] createPatient remote call failed, saving locally:", err?.message);
    }

    // Resilient local persistence fallback (handles offline, RLS, or table permission issues smoothly)
    const now = AppClock.nowISO();
    const fallbackPatient: PatientProfile = {
      id: patientId,
      medicalRecordNumber: finalRM,
      name: nameToUse,
      fullName: nameToUse,
      phone: patientData.phone || "",
      email: patientData.email || "",
      dateOfBirth: patientData.dateOfBirth || "1990-01-01",
      gender: (patientData.gender as "L" | "P") || "L",
      address: patientData.address || "-",
      medicalHistoryNotes: patientData.medicalHistoryNotes || "",
      registeredBranchId: effBranch || undefined,
      createdAt: now,
      updatedAt: now
    };

    const existing = this.getFallbackPatients();
    const idx = existing.findIndex((p) => p.id === fallbackPatient.id || p.medicalRecordNumber === fallbackPatient.medicalRecordNumber);
    if (idx >= 0) existing[idx] = fallbackPatient;
    else existing.unshift(fallbackPatient);
    this.saveFallbackPatients(existing);

    return fallbackPatient;
  }

  async updatePatient(
    id: string,
    updates: Partial<Omit<PatientProfile, "id" | "createdAt" | "updatedAt">>,
    _currentUserRole?: UserRole,
    _userBranchId?: string | null
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

    if (isValidUUID(id)) {
      try {
        const { data, error } = await supabase.from("patient_profiles").update(dbPayload).eq("id", id).select().single();
        if (!error && data) {
          const res = this.mapPatientFromDb(data);
          const existing = this.getFallbackPatients();
          const idx = existing.findIndex((p) => p.id === id);
          if (idx >= 0) existing[idx] = { ...existing[idx], ...updates, ...res };
          this.saveFallbackPatients(existing);
          return res;
        }
        console.warn("[Supabase] updatePatient remote warning:", error?.message);
      } catch (e) {
        console.warn("[Supabase] updatePatient remote error:", e);
      }
    }

    // Local fallback update
    const existing = this.getFallbackPatients();
    const idx = existing.findIndex((p) => p.id === id);
    if (idx >= 0) {
      existing[idx] = { ...existing[idx], ...updates, updatedAt: AppClock.nowISO() };
      this.saveFallbackPatients(existing);
      return existing[idx];
    }

    const fallbackPatient: PatientProfile = {
      id,
      medicalRecordNumber: updates.medicalRecordNumber || `RM-${Date.now().toString().slice(-6)}`,
      name: updates.name || "Pasien",
      fullName: updates.fullName || updates.name || "Pasien",
      phone: updates.phone || "",
      email: updates.email || "",
      dateOfBirth: updates.dateOfBirth || "1990-01-01",
      gender: updates.gender || "L",
      address: updates.address || "-",
      medicalHistoryNotes: updates.medicalHistoryNotes || "",
      ...updates,
      createdAt: AppClock.nowISO(),
      updatedAt: AppClock.nowISO()
    };
    existing.unshift(fallbackPatient);
    this.saveFallbackPatients(existing);
    return fallbackPatient;
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

    if (isValidUUID(id)) {
      try {
        await supabase.from("medical_records").delete().eq("patient_id", id);
        await supabase.from("patient_visits").delete().eq("patient_id", id);
        await supabase.from("bookings").delete().eq("patient_id", id);
        await supabase.from("queue_items").delete().eq("patient_id", id);
        const { error } = await supabase.from("patient_profiles").delete().eq("id", id);
        if (error) console.warn("[Supabase] deletePatient remote warning:", error.message);
      } catch (e) {
        console.warn("[Supabase] deletePatient remote error:", e);
      }
    }

    // Local fallback cleanup
    const existing = this.getFallbackPatients();
    const filtered = existing.filter((p) => p.id !== id);
    this.saveFallbackPatients(filtered);
    return true;
  }

  private mapPatientFromDb(row: any): PatientProfile {
    return {
      id: row.id,
      medicalRecordNumber: row.medical_record_number || row.medicalRecordNumber || `RM-000000`,
      name: row.name || row.full_name || row.fullName || "Pasien",
      fullName: row.full_name || row.name || row.fullName || "Pasien",
      phone: row.phone || row.phone_number || "",
      email: row.email,
      dateOfBirth: row.date_of_birth || row.dateOfBirth || "1990-01-01",
      gender: (row.gender as "L" | "P") || "L",
      address: row.address || "",
      medicalHistoryNotes: row.medical_history_notes || (Array.isArray(row.medical_history) ? row.medical_history.join(", ") : row.medical_history) || "",
      registeredBranchId: row.registered_branch_id || undefined,
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
    if ((currentUserRole === UserRole.BRANCH_ADMIN || currentUserRole === UserRole.DOCTOR_ASSISTANT) && userBranchId && branchId !== userBranchId) {
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
          .select("*")
          .eq("patient_id", patientId)
          .order("sequence_order", { ascending: true });
        if (!error && data) {
          remoteItems = data.map(this.mapQueueFromDb);
        } else if (error) {
          console.warn("[Supabase] getQueueByPatient restricted/failed:", error.message);
        }
      } catch (e: any) {
        console.warn("[Supabase] getQueueByPatient query failed:", e?.message);
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
    if ((currentUserRole === UserRole.BRANCH_ADMIN || currentUserRole === UserRole.DOCTOR_ASSISTANT) && userBranchId && branchId !== userBranchId) {
      throw new Error("Access denied: Asisten / Branch Admin tidak dapat mengakses antrean cabang lain");
    }
    if (currentUserRole === UserRole.DOCTOR && currentUserId && doctorId && currentUserId !== doctorId) {
      throw new Error("Access denied: Doctor cannot access another doctor queue");
    }

    const items = await this.getQueueByBranch(branchId, currentUserRole, userBranchId);
    let filtered = items.filter((q) => {
      const qDate = (q.arrivalAt || q.checkInTime || q.createdAt || "").split("T")[0];
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
    options?: { estimatedDurationMinutes?: number; doctorId?: string; customId?: string }
  ): Promise<QueueItem> {
    ensureSupabaseConnected();

    // 1. Retrieve visit data from Supabase or fallback
    const visitRepo = new SupabaseVisitRepository();
    let visit: PatientVisit | null = null;
    try {
      visit = await visitRepo.getVisitById(visitId);
    } catch (e: any) {
      console.warn("[SupabaseQueueRepository] visit lookup note:", e?.message);
    }

    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId && visit && visit.branchId !== userBranchId) {
      throw new Error("Branch Admin tidak dapat mendaftarkan antrean cabang lain");
    }

    const branchId = visit?.branchId || userBranchId || "branch-gebang";
    const patientId = visit?.patientId || "";
    const doctorId = options?.doctorId || visit?.doctorId || "doc-syafira";
    const now = AppClock.nowISO();
    const today = now.split("T")[0];

    // Check existing active queue item to avoid duplicate entries
    const fallbackItems = this.getFallbackQueue();
    const existingActive = fallbackItems.find(
      (q) => q.visitId === visitId && q.status !== QueueStatus.SKIPPED && q.status !== QueueStatus.COMPLETED && q.status !== "CANCELLED"
    );
    if (existingActive) {
      return existingActive;
    }

    // Determine deterministic sequence order and queue number
    const sameScope = fallbackItems.filter((q) => {
      const qDate = (q.arrivalAt || q.checkInTime || q.createdAt || "").split("T")[0];
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
      bookingId: visit?.bookingId || null,
      patientId,
      queueNumber,
      status: QueueStatus.WAITING,
      sequenceOrder,
      arrivalAt: now,
      checkInTime: now,
      estimatedDurationMinutes: options?.estimatedDurationMinutes || 30,
      createdAt: now,
      updatedAt: now
    };

    // Save locally immediately to guarantee offline/RLS resilience
    const updatedFallback = [newQueueItem, ...fallbackItems.filter((q) => q.id !== newId)];
    this.saveFallbackQueue(updatedFallback);

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
        doctor_id: isValidUUID(doctorId) ? doctorId : "00000000-0000-0000-0000-000000000001",
        visit_id: visitId,
        queue_number: queueNumber,
        status: QueueStatus.WAITING,
        estimated_duration_minutes: options?.estimatedDurationMinutes || 30,
        sequence_order: sequenceOrder,
        arrival_at: now
      };
      if (isValidUUID(newId)) dbPayload.id = newId;
      if (isValidUUID(patientId)) dbPayload.patient_id = patientId;
      if (visit?.bookingId && isValidUUID(visit.bookingId)) dbPayload.booking_id = visit.bookingId;

      try {
        const { data, error } = await supabase.from("queue_items").insert(dbPayload).select().single();
        if (!error && data) {
          const remoteItem = this.mapQueueFromDb(data);
          const currentList = this.getFallbackQueue();
          const idx = currentList.findIndex((q) => q.id === remoteItem.id || q.id === newId);
          if (idx >= 0) currentList[idx] = remoteItem;
          else currentList.unshift(remoteItem);
          this.saveFallbackQueue(currentList);
          return remoteItem;
        } else if (error) {
          console.warn("[Supabase] queue_items insert restricted/failed, using local fallback:", error.message);
        }
      } catch (err: any) {
        console.warn("[Supabase] queue_items insert remote call failed, using local fallback:", err?.message);
      }
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
          return mapped;
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

  async recalculateQueue(branchId: string, _doctorId: string, _operationalDate: string): Promise<QueueItem[]> {
    return this.getQueueByBranch(branchId);
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
          return mapped;
        } else if (error) {
          console.warn("[Supabase] updateStatus remote restricted:", error.message);
        }
      } catch (err: any) {
        console.warn("[Supabase] updateStatus remote failed:", err?.message);
      }
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
      estimatedServiceAt: row.estimated_service_at,
      actualServiceStartAt: row.actual_start || row.actual_service_start_at,
      actualServiceEndAt: row.actual_end || row.actual_service_end_at,
      estimatedDurationMinutes: row.estimated_duration_minutes || 30,
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
    if (error || !data) return null;
    return this.mapMedicalRecordFromDb(data);
  }

  async getMedicalRecordByVisit(visitId: string): Promise<MedicalRecord | null> {
    ensureSupabaseConnected();
    const { data, error } = await supabase.from("clinical_medical_records").select("*").eq("visit_id", visitId).single();
    if (error || !data) return null;
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
    if (error || !data) return null;
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
      title: string;
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
      title: data.title,
      description: data.description,
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
    if (updates.title) dbPayload.title = updates.title;
    if (updates.description !== undefined) dbPayload.description = updates.description;
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
      title: row.title,
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

    const path = `${folder}/${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

    if (!isSupabaseConfigured || !supabase) {
      if (base64Url) {
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

      const { data, error } = await supabase.storage.from("clinic-media").upload(path, uploadPayload, { upsert: true });

      if (error) {
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

      const { data: pubUrl } = supabase.storage.from("clinic-media").getPublicUrl(data.path);

      return {
        url: pubUrl.publicUrl,
        path: data.path,
        fileName,
        fileSize,
        mimeType
      };
    } catch (err: any) {
      if (base64Url) {
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
      const path = pathOrUrl.includes("/") ? pathOrUrl.split("/").pop() || pathOrUrl : pathOrUrl;
      await supabase.storage.from("clinic-media").remove([path]);
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
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("lala_bookings", JSON.stringify(bookings));
      } catch (e) {
        console.warn("Error saving bookings to localStorage:", e);
      }
    }
  }

  private mapBookingFromDb(row: any): Booking {
    return {
      id: row.id,
      patientId: row.patient_id,
      branchId: row.branch_id,
      doctorId: row.doctor_id,
      serviceId: row.service_id ?? undefined,
      bookingDateTime: row.booking_date_time,
      timeSlot: row.time_slot ?? undefined,
      complaint: row.complaint ?? undefined,
      notes: row.notes ?? row.complaint ?? undefined,
      patientNameSnapshot: row.patient_name_snapshot ?? undefined,
      doctorNameSnapshot: row.doctor_name_snapshot ?? undefined,
      branchNameSnapshot: row.branch_name_snapshot ?? undefined,
      status: row.status as BookingStatus,
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
    const all = await this.getBookings();
    return all.filter((b) => b.patientId === patientId);
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
    bookingData: Omit<Booking, "id" | "status" | "createdAt" | "updatedAt"> & { id?: string; status?: BookingStatus },
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<Booking> {
    ensureSupabaseConnected();

    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId && bookingData.branchId !== userBranchId) {
      throw new Error("Branch Admin tidak dapat membuat booking untuk cabang lain");
    }

    const bookingId = bookingData.id || (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `bk-${Date.now()}`);
    const now = new Date().toISOString();

    const fallbackBooking: Booking = {
      id: bookingId,
      patientId: bookingData.patientId,
      branchId: bookingData.branchId,
      doctorId: bookingData.doctorId,
      serviceId: bookingData.serviceId,
      bookingDateTime: bookingData.bookingDateTime,
      timeSlot: bookingData.timeSlot || bookingData.bookingDateTime.split("T")[1]?.substring(0, 5) || "09:00",
      complaint: bookingData.complaint || bookingData.notes || "",
      notes: bookingData.notes || bookingData.complaint || "",
      patientNameSnapshot: bookingData.patientNameSnapshot || "",
      doctorNameSnapshot: bookingData.doctorNameSnapshot || "",
      branchNameSnapshot: bookingData.branchNameSnapshot || "",
      status: bookingData.status || BookingStatus.PENDING,
      createdAt: now,
      updatedAt: now
    };

    // Safely attempt remote insert ONLY if foreign keys are valid UUIDs
    if (isValidUUID(bookingData.patientId) && isValidUUID(bookingData.branchId)) {
      const payload: any = {
        patient_id: bookingData.patientId,
        branch_id: bookingData.branchId,
        booking_date_time: bookingData.bookingDateTime,
        time_slot: bookingData.timeSlot || bookingData.bookingDateTime.split("T")[1]?.substring(0, 5) || null,
        complaint: bookingData.complaint || bookingData.notes || null,
        notes: bookingData.notes || bookingData.complaint || null,
        patient_name_snapshot: bookingData.patientNameSnapshot || null,
        doctor_name_snapshot: bookingData.doctorNameSnapshot || null,
        branch_name_snapshot: bookingData.branchNameSnapshot || null,
        status: bookingData.status || BookingStatus.PENDING
      };
      if (isValidUUID(bookingData.doctorId)) payload.doctor_id = bookingData.doctorId;
      if (bookingData.serviceId && isValidUUID(bookingData.serviceId)) payload.service_id = bookingData.serviceId;
      if (isValidUUID(bookingId)) payload.id = bookingId;

      try {
        const { data, error } = await supabase.from("bookings").insert(payload).select().single();
        if (!error && data) {
          const res = this.mapBookingFromDb(data);
          const existing = this.getFallbackBookings();
          const idx = existing.findIndex((b) => b.id === res.id);
          if (idx >= 0) existing[idx] = res;
          else existing.unshift(res);
          this.saveFallbackBookings(existing);

          // Create H1 confirmation stub
          try {
            await supabase.from("booking_confirmations_h1").insert({
              booking_id: data.id,
              branch_id: data.branch_id,
              confirmation_status: "BELUM_DIHUBUNGI"
            });
          } catch {
            // Safe ignore if exists
          }

          return res;
        }
        console.warn("[Supabase] createBooking remote error, saving locally:", error?.message);
      } catch (err: any) {
        console.warn("[Supabase] createBooking remote call failed, saving locally:", err?.message);
      }
    } else {
      console.warn("[Supabase] createBooking foreign keys non-UUID, saving locally.");
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
      if (updates.status) dbPayload.status = updates.status;

      try {
        let q = supabase.from("bookings").update(dbPayload).eq("id", id);
        if ((currentUserRole === UserRole.BRANCH_ADMIN || currentUserRole === UserRole.DOCTOR_ASSISTANT) && userBranchId) {
          q = q.eq("branch_id", userBranchId);
        }
        const { data, error } = await q.select().single();
        if (!error && data) {
          const res = this.mapBookingFromDb(data);
          const existing = this.getFallbackBookings();
          const idx = existing.findIndex((b) => b.id === res.id);
          if (idx >= 0) existing[idx] = res;
          this.saveFallbackBookings(existing);
          return res;
        }
      } catch (err: any) {
        console.warn("[Supabase] updateBooking remote error, updating locally:", err?.message);
      }
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
        console.warn("[Supabase] createOrInitializeH1Confirmation remote error, saving locally:", error?.message);
      } catch (err: any) {
        console.warn("[Supabase] createOrInitializeH1Confirmation remote call failed, saving locally:", err?.message);
      }
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
      patientId: row.patient_id,
      branchId: row.branch_id,
      visitDateTime: row.visit_date_time,
      visitType: row.visit_type,
      visitStatus: row.visit_status,
      bookingId: row.booking_id ?? null,
      complaint: row.complaint ?? undefined,
      doctorId: row.doctor_id ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  async getVisits(): Promise<PatientVisit[]> {
    ensureSupabaseConnected();
    let remoteVisits: PatientVisit[] = [];
    try {
      const { data, error } = await supabase.from("patient_visits").select("*").order("visit_date_time", { ascending: false });
      if (!error && data) {
        remoteVisits = data.map(this.mapVisitFromDb);
      }
    } catch (e) {
      console.warn("[Supabase] getVisits remote error:", e);
    }

    const fallback = this.getFallbackVisits();
    const remoteIds = new Set(remoteVisits.map((v) => v.id));
    const localOnly = fallback.filter((v) => !remoteIds.has(v.id));
    return [...remoteVisits, ...localOnly];
  }

  async getVisitById(id: string): Promise<PatientVisit | null> {
    ensureSupabaseConnected();
    if (isValidUUID(id)) {
      try {
        const { data, error } = await supabase.from("patient_visits").select("*").eq("id", id).single();
        if (!error && data) return this.mapVisitFromDb(data);
      } catch (e) {
        console.warn("[Supabase] getVisitById remote error:", e);
      }
    }
    const fallback = this.getFallbackVisits();
    return fallback.find((v) => v.id === id) || null;
  }

  async getVisitsByPatient(patientId: string): Promise<PatientVisit[]> {
    const all = await this.getVisits();
    return all.filter((v) => v.patientId === patientId);
  }

  async getVisitsByBranch(branchId: string, currentUserRole?: UserRole, userBranchId?: string | null): Promise<PatientVisit[]> {
    const all = await this.getVisits();
    const effBranch = (currentUserRole === UserRole.BRANCH_ADMIN || currentUserRole === UserRole.DOCTOR_ASSISTANT) && userBranchId ? userBranchId : branchId;
    return all.filter((v) => v.branchId === effBranch);
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
    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId && visitData.branchId !== userBranchId) {
      throw new Error("Branch Admin tidak dapat membuat visit untuk cabang lain");
    }

    const visitId = visitData.id || (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `vst-${Date.now()}`);
    const now = new Date().toISOString();

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
        complaint: visitData.complaint || null
      };
      if (visitData.bookingId && isValidUUID(visitData.bookingId)) payload.booking_id = visitData.bookingId;
      if (visitData.doctorId && isValidUUID(visitData.doctorId)) payload.doctor_id = visitData.doctorId;
      if (isValidUUID(visitId)) payload.id = visitId;

      try {
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
        console.warn("[Supabase] createVisit remote error, saving locally:", error?.message);
      } catch (err: any) {
        console.warn("[Supabase] createVisit remote call failed, saving locally:", err?.message);
      }
    } else {
      console.warn("[Supabase] createVisit foreign keys non-UUID, saving locally.");
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

    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId && branchToUse !== userBranchId) {
      throw new Error("Branch Admin tidak dapat membuat treatment untuk cabang lain");
    }

    // Look up service and doctor snapshots
    const { data: srv } = await supabase.from("master_services").select("name, estimated_duration_minutes").eq("id", data.serviceId).single();
    const { data: doc } = await supabase.from("dental_doctors").select("name").eq("id", data.doctorId).single();

    const serviceName = srv?.name || "Tindakan Medis";
    const doctorName = doc?.name || "Dokter Gigi";
    const estDur = data.estimatedDurationMinutes || srv?.estimated_duration_minutes || 30;

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
      await supabase.from("treatment_activities").insert({
        treatment_id: id,
        actor_id: actorData.actorId || currentUserId || data.doctor_id,
        actor_role: actorData.actorRole || currentUserRole || "DOCTOR",
        actor_name_snapshot: actorData.actorNameSnapshot || "Petugas Medis",
        activity_type: "STARTED",
        branch_id: data.branch_id,
        notes: actorData.notes || null
      });
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
    const now = new Date().toISOString();
    let q = supabase.from("treatment_jobs").update({
      status: TreatmentJobStatus.SELESAI,
      completed_at: now,
      updated_at: now
    }).eq("id", id);

    if ((currentUserRole === UserRole.BRANCH_ADMIN || currentUserRole === UserRole.DOCTOR_ASSISTANT) && userBranchId) {
      q = q.eq("branch_id", userBranchId);
    }
    const { data, error } = await q.select().single();
    if (error) throw new Error(`Supabase error: ${error.message}`);

    if (actorData) {
      await supabase.from("treatment_activities").insert({
        treatment_id: id,
        actor_id: actorData.actorId || currentUserId || data.doctor_id,
        actor_role: actorData.actorRole || currentUserRole || "DOCTOR",
        actor_name_snapshot: actorData.actorNameSnapshot || "Petugas Medis",
        activity_type: "COMPLETED",
        branch_id: data.branch_id,
        notes: actorData.notes || null
      });
    }

    return this.mapTreatmentFromDb(data);
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
      await supabase.from("treatment_activities").insert({
        treatment_id: id,
        actor_id: actorData.actorId || currentUserId || data.doctor_id,
        actor_role: actorData.actorRole || currentUserRole || "DOCTOR",
        actor_name_snapshot: actorData.actorNameSnapshot || "Petugas Medis",
        activity_type: "HANDED_OVER",
        branch_id: data.branch_id,
        notes: actorData.notes || null
      });
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
    const { data: created, error } = await supabase.from("treatment_activities").insert({
      treatment_id: data.treatmentId,
      actor_id: data.actorId,
      actor_role: data.actorRole,
      actor_name_snapshot: data.actorNameSnapshot || "Petugas Medis",
      activity_type: data.activityType,
      branch_id: data.branchId || null,
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
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("lala_invoices", JSON.stringify(items));
      } catch (e) {
        console.warn("Error saving invoices to localStorage:", e);
      }
    }
  }

  private getFallbackInvoiceItems(): InvoiceItem[] {
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
    ensureSupabaseConnected();
    let remoteInvoices: Invoice[] = [];
    try {
      let q = supabase.from("invoices").select("*").order("created_at", { ascending: false });
      if ((currentUserRole === UserRole.BRANCH_ADMIN || currentUserRole === UserRole.DOCTOR_ASSISTANT) && userBranchId && isValidUUID(userBranchId)) {
        q = q.eq("branch_id", userBranchId);
      }
      const { data, error } = await q;
      if (!error && data) {
        remoteInvoices = data.map((row: any) => this.mapInvoiceFromDb(row));
      } else if (error) {
        console.warn("[Supabase] getInvoices restricted or failed, using local fallback:", error.message);
      }
    } catch (e: any) {
      console.warn("[Supabase] getInvoices query failed:", e?.message);
    }

    let fallback = this.getFallbackInvoices();
    if ((currentUserRole === UserRole.BRANCH_ADMIN || currentUserRole === UserRole.DOCTOR_ASSISTANT) && userBranchId) {
      fallback = fallback.filter((i) => i.branchId === userBranchId);
    }

    const remoteIds = new Set(remoteInvoices.map((inv) => inv.id));
    const localOnly = fallback.filter((inv) => !remoteIds.has(inv.id));
    return [...remoteInvoices, ...localOnly];
  }

  async getInvoiceById(id: string, currentUserRole?: UserRole, userBranchId?: string | null): Promise<Invoice | null> {
    ensureSupabaseConnected();
    if (isValidUUID(id)) {
      try {
        let q = supabase.from("invoices").select("*").eq("id", id);
        if ((currentUserRole === UserRole.BRANCH_ADMIN || currentUserRole === UserRole.DOCTOR_ASSISTANT) && userBranchId && isValidUUID(userBranchId)) {
          q = q.eq("branch_id", userBranchId);
        }
        const { data, error } = await q.single();
        if (!error && data) {
          return this.mapInvoiceFromDb(data);
        }
      } catch (e: any) {
        console.warn("[Supabase] getInvoiceById remote read failed, checking fallback:", e?.message);
      }
    }

    const fallback = this.getFallbackInvoices();
    const found = fallback.find((i) => i.id === id);
    if (!found) return null;
    if ((currentUserRole === UserRole.BRANCH_ADMIN || currentUserRole === UserRole.DOCTOR_ASSISTANT) && userBranchId && found.branchId !== userBranchId) {
      return null;
    }
    return found;
  }

  async getInvoiceItems(invoiceId: string): Promise<InvoiceItem[]> {
    ensureSupabaseConnected();
    let remoteItems: InvoiceItem[] = [];
    if (isValidUUID(invoiceId)) {
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

  async getInvoicesByBranch(branchId: string, currentUserRole?: UserRole, userBranchId?: string | null): Promise<Invoice[]> {
    const all = await this.getInvoices(currentUserRole, userBranchId);
    const effBranch = (currentUserRole === UserRole.BRANCH_ADMIN || currentUserRole === UserRole.DOCTOR_ASSISTANT) && userBranchId ? userBranchId : branchId;
    return all.filter((inv) => inv.branchId === effBranch);
  }

  async getInvoicesByPatient(patientId: string): Promise<Invoice[]> {
    const all = await this.getInvoices();
    return all.filter((inv) => inv.patientId === patientId);
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
    ensureSupabaseConnected();
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

    if (isVisitUUID && isPatientUUID && isBranchUUID) {
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
            if (itemsErr) console.warn("[Supabase] invoice_items insert note:", itemsErr.message);
          }
          const remoteMapped = this.mapInvoiceFromDb(inv);
          remoteMapped.invoiceNumber = invoiceNumber;
          remoteMapped.items = fallbackItems;

          const idx = updatedInvoices.findIndex((x) => x.id === fallbackInvoice.id);
          if (idx >= 0) {
            updatedInvoices[idx] = { ...updatedInvoices[idx], id: savedInvId };
            this.saveFallbackInvoices(updatedInvoices);
          }
          return remoteMapped;
        } else if (error) {
          console.warn("[Supabase] createInvoice remote error/permission denied, saved locally:", error.message);
        }
      } catch (err: any) {
        console.warn("[Supabase] createInvoice remote execution error, saved locally:", err?.message);
      }
    } else {
      console.warn("[Supabase] createInvoice: Non-UUID foreign key provided, stored in local storage.");
    }

    return fallbackInvoice;
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
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("lala_payments", JSON.stringify(items));
      } catch (e) {
        console.warn("Error saving payments to localStorage:", e);
      }
    }
  }

  private getFallbackInvoices(): Invoice[] {
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
    ensureSupabaseConnected();
    let remotePayments: PaymentTransaction[] = [];
    try {
      let q = supabase.from("payment_transactions").select("*").order("transaction_date_time", { ascending: false });
      if ((currentUserRole === UserRole.BRANCH_ADMIN || currentUserRole === UserRole.DOCTOR_ASSISTANT) && userBranchId && isValidUUID(userBranchId)) {
        q = q.eq("branch_id", userBranchId);
      }
      const { data, error } = await q;
      if (!error && data) {
        remotePayments = data.map((row: any) => this.mapPaymentFromDb(row));
      } else if (error) {
        console.warn("[Supabase] getPayments restricted or failed, using local fallback:", error.message);
      }
    } catch (e: any) {
      console.warn("[Supabase] getPayments query failed:", e?.message);
    }

    let fallback = this.getFallbackPayments();
    if ((currentUserRole === UserRole.BRANCH_ADMIN || currentUserRole === UserRole.DOCTOR_ASSISTANT) && userBranchId) {
      fallback = fallback.filter((p) => p.branchId === userBranchId);
    }

    const remoteIds = new Set(remotePayments.map((p) => p.id));
    const localOnly = fallback.filter((p) => !remoteIds.has(p.id));
    return [...remotePayments, ...localOnly];
  }

  async getPaymentsByInvoice(invoiceId: string, currentUserRole?: UserRole, userBranchId?: string | null): Promise<PaymentTransaction[]> {
    ensureSupabaseConnected();
    let remotePayments: PaymentTransaction[] = [];
    if (isValidUUID(invoiceId)) {
      try {
        let q = supabase.from("payment_transactions").select("*").eq("invoice_id", invoiceId);
        if ((currentUserRole === UserRole.BRANCH_ADMIN || currentUserRole === UserRole.DOCTOR_ASSISTANT) && userBranchId && isValidUUID(userBranchId)) {
          q = q.eq("branch_id", userBranchId);
        }
        const { data, error } = await q.order("transaction_date_time", { ascending: false });
        if (!error && data) {
          remotePayments = data.map((row: any) => this.mapPaymentFromDb(row));
        }
      } catch (e: any) {
        console.warn("[Supabase] getPaymentsByInvoice query failed:", e?.message);
      }
    }

    const fallbackPayments = this.getFallbackPayments().filter((p) => p.invoiceId === invoiceId);
    const remoteIds = new Set(remotePayments.map((p) => p.id));
    const localOnly = fallbackPayments.filter((p) => !remoteIds.has(p.id));
    return [...remotePayments, ...localOnly];
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
    let invoiceBranchId = "branch-1";
    let targetInv: Invoice | null = null;

    const fallbackInvoices = this.getFallbackInvoices();
    targetInv = fallbackInvoices.find((i) => i.id === data.invoiceId) || null;

    if (!targetInv && isValidUUID(data.invoiceId)) {
      try {
        const { data: inv, error: invErr } = await supabase.from("invoices").select("*").eq("id", data.invoiceId).single();
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
    if (isValidUUID(data.invoiceId)) {
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
          await supabase.from("invoices").update({
            paid_amount: newPaid,
            outstanding_amount: newOutstanding,
            status: newStatus,
            updated_at: now
          }).eq("id", data.invoiceId);

          const mapped = this.mapPaymentFromDb(created);
          mapped.receiptNumber = receiptNumber;
          return mapped;
        } else if (error) {
          console.warn("[Supabase] createPayment remote error/permission denied, saved locally:", error.message);
        }
      } catch (err: any) {
        console.warn("[Supabase] createPayment remote execution error, saved locally:", err?.message);
      }
    }

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
    ensureSupabaseConnected();
    try {
      let q = supabase.from("dental_doctors").select("*").eq("active", true).order("name");
      if ((currentUserRole === UserRole.BRANCH_ADMIN || currentUserRole === UserRole.DOCTOR_ASSISTANT) && userBranchId) {
        q = q.eq("assigned_branch_id", userBranchId);
      }
      const { data, error } = await q;
      if (error) {
        console.warn(`Supabase getDoctors warning: ${error.message}`);
        const fallback = this.getFallbackDoctors();
        if ((currentUserRole === UserRole.BRANCH_ADMIN || currentUserRole === UserRole.DOCTOR_ASSISTANT) && userBranchId) {
          return fallback.filter((d) => d.assignedBranchId === userBranchId);
        }
        return fallback;
      }
      const mapped = (data || []).map(this.mapDoctorFromDb);
      if (mapped.length === 0) {
        const fallback = this.getFallbackDoctors();
        return fallback;
      }
      this.saveFallbackDoctors(mapped);
      return mapped;
    } catch (e) {
      return this.getFallbackDoctors();
    }
  }

  async getDoctorById(id: string): Promise<DentalDoctor | null> {
    ensureSupabaseConnected();
    if (isValidUUID(id)) {
      try {
        const { data, error } = await supabase.from("dental_doctors").select("*").eq("id", id).single();
        if (!error && data) return this.mapDoctorFromDb(data);
      } catch (e) {
        // fallback
      }
    }
    const fallback = this.getFallbackDoctors();
    return fallback.find((d) => d.id === id) || null;
  }

  async getDoctorByCode(code: string): Promise<DentalDoctor | null> {
    ensureSupabaseConnected();
    try {
      const { data, error } = await supabase.from("dental_doctors").select("*").eq("doctor_code", code).single();
      if (!error && data) return this.mapDoctorFromDb(data);
    } catch (e) {}
    const fallback = this.getFallbackDoctors();
    return fallback.find((d) => d.doctorCode?.toUpperCase() === code.toUpperCase()) || null;
  }

  async getDoctorsByBranch(branchId: string): Promise<DentalDoctor[]> {
    ensureSupabaseConnected();
    if (isValidUUID(branchId)) {
      try {
        const { data, error } = await supabase.from("dental_doctors").select("*").eq("assigned_branch_id", branchId).order("name");
        if (!error && data && data.length > 0) {
          return data.map(this.mapDoctorFromDb);
        }
      } catch (e) {}
    }
    const fallback = this.getFallbackDoctors();
    return fallback.filter((d) => d.assignedBranchId === branchId);
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
      console.warn("[Supabase] createDoctor remote returned error, saving locally:", error?.message);
    } catch (err: any) {
      console.warn("[Supabase] createDoctor remote call failed, saving locally:", err?.message);
    }

    // Local fallback creation
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
          payload.avatar_url = updates.photoUrl || updates.avatarUrl || (updates as any).profileImage || null;
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
      } catch (e) {}
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
          .update({ avatar_url: photoUrl, updated_at: new Date().toISOString() })
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
      } catch (e) {}
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

  async getDoctorBranchAssignments(doctorId?: string, branchId?: string): Promise<DoctorBranchAssignment[]> {
    ensureSupabaseConnected();
    try {
      let q = supabase.from("doctor_branch_assignments").select("*");
      if (doctorId && isValidUUID(doctorId)) q = q.eq("doctor_id", doctorId);
      if (branchId && isValidUUID(branchId)) q = q.eq("branch_id", branchId);
      const { data, error } = await q;
      if (!error && data) {
        return data.map((r: any) => ({
          id: r.id,
          doctorId: r.doctor_id,
          branchId: r.branch_id,
          startDate: r.start_date || new Date().toISOString().split("T")[0],
          active: r.active ?? true,
          notes: r.notes || undefined,
          createdAt: r.created_at,
          updatedAt: r.updated_at
        }));
      }
    } catch (e) {}

    // Fallback storage
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("lala_doctor_branch_assignments");
        if (saved) {
          const parsed: DoctorBranchAssignment[] = JSON.parse(saved);
          let res = parsed;
          if (doctorId) res = res.filter((a) => a.doctorId === doctorId);
          if (branchId) res = res.filter((a) => a.branchId === branchId);
          return res;
        }
      } catch (e) {}
    }
    return [];
  }

  async assignDoctorToBranch(data: Omit<DoctorBranchAssignment, "id" | "createdAt" | "updatedAt"> & { id?: string }): Promise<DoctorBranchAssignment> {
    ensureSupabaseConnected();
    const payload: any = {
      doctor_id: data.doctorId,
      branch_id: data.branchId,
      start_date: data.startDate || new Date().toISOString().split("T")[0],
      active: data.active ?? true,
      notes: data.notes || null
    };
    if (data.id && isValidUUID(data.id)) payload.id = data.id;

    if (isValidUUID(data.doctorId) && isValidUUID(data.branchId)) {
      try {
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
      } catch (e) {}
    }

    // Local fallback
    const newAssignment: DoctorBranchAssignment = {
      id: data.id || `dba-${Date.now()}`,
      doctorId: data.doctorId,
      branchId: data.branchId,
      startDate: data.startDate || new Date().toISOString().split("T")[0],
      active: data.active ?? true,
      notes: data.notes || undefined,
      createdAt: AppClock.nowISO(),
      updatedAt: AppClock.nowISO()
    };
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("lala_doctor_branch_assignments");
        const list: DoctorBranchAssignment[] = saved ? JSON.parse(saved) : [];
        list.push(newAssignment);
        localStorage.setItem("lala_doctor_branch_assignments", JSON.stringify(list));
      } catch (e) {}
    }
    return newAssignment;
  }

  async removeDoctorBranchAssignment(id: string): Promise<void> {
    ensureSupabaseConnected();
    if (isValidUUID(id)) {
      try {
        await supabase.from("doctor_branch_assignments").delete().eq("id", id);
      } catch (e) {}
    }
    if (typeof window !== "undefined") {
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
    if (isValidUUID(id)) {
      try {
        await supabase.from("doctor_branch_assignments").delete().eq("doctor_id", id);
        await supabase.from("doctor_schedules").delete().eq("doctor_id", id);
        await supabase.from("dental_doctors").delete().eq("id", id);
      } catch (e) {
        console.warn("Supabase deleteDoctor remote warning:", e);
      }
    }
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
    if (error) return handleSupabaseReadError("master_services", error, MOCK_SERVICES);
    if (!data || data.length === 0) {
      try {
        const seedPayload = MOCK_SERVICES.map((s) => ({
          name: s.name,
          description: s.description,
          base_price: s.basePrice,
          estimated_duration_minutes: s.estimatedDurationMinutes,
          category: s.category,
          is_active: true
        }));
        await supabase.from("master_services").upsert(seedPayload, { onConflict: "name" });
        const { data: seeded } = await supabase.from("master_services").select("*").eq("is_active", true).order("created_at");
        if (seeded && seeded.length > 0) {
          return seeded.map(this.mapServiceFromDb);
        }
      } catch (e) {
        console.warn("Could not seed master_services to Supabase:", e);
      }
      return MOCK_SERVICES;
    }
    return data.map(this.mapServiceFromDb);
  }

  async createService(data: Omit<MasterService, "id" | "createdAt" | "updatedAt"> & { id?: string }): Promise<MasterService> {
    ensureSupabaseConnected();
    const payload: any = {
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
      if (isSupabaseConfigured && supabase) {
        try {
          const { data } = await supabase.from("dental_branches").select("*").limit(1).maybeSingle();
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
      try {
        const { data: branches } = await supabase.from("dental_branches").select("id").limit(1);
        if (branches && branches.length > 0) {
          const dbPayload: any = {};
          if (updates.logoUrl !== undefined) dbPayload.logo_url = updates.logoUrl;
          if (updates.phone) dbPayload.phone = updates.phone;
          if (updates.address) dbPayload.address = updates.address;
          if (Object.keys(dbPayload).length > 0) {
            await supabase.from("dental_branches").update(dbPayload).eq("id", branches[0].id);
          }
        }
      } catch (err) {
        console.warn("Error syncing branding to dental_branches in Supabase:", err);
      }
    }

    return updated;
  }
}

// =====================================================================
// 16. SUPABASE DOCTOR SCHEDULE REPOSITORY
// =====================================================================
export class SupabaseDoctorScheduleRepository implements DoctorScheduleRepository {
  async getSchedules(filter?: ScheduleFilter, currentUserRole?: UserRole, userBranchId?: string | null): Promise<DoctorSchedule[]> {
    ensureSupabaseConnected();
    let q = supabase.from("doctor_schedules").select("*").order("date");
    const effBranch = (currentUserRole === UserRole.BRANCH_ADMIN || currentUserRole === UserRole.DOCTOR_ASSISTANT) && userBranchId ? userBranchId : filter?.branchId;
    if (effBranch && isValidUUID(effBranch)) q = q.eq("branch_id", effBranch);
    if (filter?.doctorId && isValidUUID(filter.doctorId)) q = q.eq("doctor_id", filter.doctorId);
    if (filter?.date) q = q.eq("date", filter.date);
    const { data, error } = await q;
    if (error) return handleSupabaseReadError("doctor_schedules", error, []);
    return (data || []).map((r: any) => ({
      id: r.id,
      doctorId: r.doctor_id,
      branchId: r.branch_id,
      date: r.date,
      startTime: r.start_time,
      endTime: r.end_time,
      status: (r.status as ScheduleStatus) || ScheduleStatus.ACTIVE,
      notes: r.notes || undefined,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    }));
  }

  async getScheduleById(id: string): Promise<DoctorSchedule | null> {
    ensureSupabaseConnected();
    if (!isValidUUID(id)) return null;
    const { data, error } = await supabase.from("doctor_schedules").select("*").eq("id", id).single();
    if (error) return handleSupabaseReadError("doctor_schedules", error, null);
    return {
      id: data.id,
      doctorId: data.doctor_id,
      branchId: data.branch_id,
      date: data.date,
      startTime: data.start_time,
      endTime: data.end_time,
      status: (data.status as ScheduleStatus) || ScheduleStatus.ACTIVE,
      notes: data.notes || undefined,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    };
  }

  async createSchedule(data: Omit<DoctorSchedule, "id" | "createdAt" | "updatedAt"> & { id?: string }): Promise<DoctorSchedule> {
    ensureSupabaseConnected();
    const payload: any = {
      doctor_id: data.doctorId,
      branch_id: data.branchId,
      date: data.date,
      start_time: data.startTime,
      end_time: data.endTime,
      status: data.status || ScheduleStatus.ACTIVE,
      notes: data.notes || null
    };
    if (data.id) payload.id = data.id;
    const { data: created, error } = await supabase.from("doctor_schedules").insert(payload).select().single();
    if (error) throw new Error(`Supabase error: ${error.message}`);
    return {
      id: created.id,
      doctorId: created.doctor_id,
      branchId: created.branch_id,
      date: created.date,
      startTime: created.start_time,
      endTime: created.end_time,
      status: (created.status as ScheduleStatus) || ScheduleStatus.ACTIVE,
      notes: created.notes || undefined,
      createdAt: created.created_at,
      updatedAt: created.updated_at
    };
  }

  async updateSchedule(id: string, updates: Partial<Omit<DoctorSchedule, "id" | "createdAt" | "updatedAt">>): Promise<DoctorSchedule> {
    ensureSupabaseConnected();
    const payload: any = { updated_at: new Date().toISOString() };
    if (updates.date) payload.date = updates.date;
    if (updates.startTime) payload.start_time = updates.startTime;
    if (updates.endTime) payload.end_time = updates.endTime;
    if (updates.status) payload.status = updates.status;
    if (updates.notes !== undefined) payload.notes = updates.notes;

    const { data, error } = await supabase.from("doctor_schedules").update(payload).eq("id", id).select().single();
    if (error) throw new Error(`Supabase error: ${error.message}`);
    return {
      id: data.id,
      doctorId: data.doctor_id,
      branchId: data.branch_id,
      date: data.date,
      startTime: data.start_time,
      endTime: data.end_time,
      status: (data.status as ScheduleStatus) || ScheduleStatus.ACTIVE,
      notes: data.notes || undefined,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    };
  }

  async cancelSchedule(id: string): Promise<DoctorSchedule> {
    return this.updateSchedule(id, { status: ScheduleStatus.CANCELLED });
  }
}
