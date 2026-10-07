/**
 * LALA DENTIST - CENTRAL REPOSITORY FACTORY
 * Single Source of Truth for instantiating Domain Repositories.
 * 
 * Rules:
 * - In Production with Supabase configured: Uses SupabaseRepositories against PostgreSQL.
 * - In Test (Vitest) environment: Uses MockRepositories for deterministic unit testing.
 * - No silent fallback: If Supabase fails, exceptions bubble up clearly with descriptive error messaging.
 */

import { isSupabaseConfigured } from "../lib/supabase";
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
  DoctorScheduleRepository,
  WorkShiftRepository,
  StaffShiftAssignmentRepository,
  AttendanceRepository,
  OvertimeRepository,
  MediaStorageRepository,
  MedicalRecordRepository,
  PromotionRepository,
  BackupRepository
} from "./interfaces";

import {
  MockPatientRepository,
  MockBranchRepository,
  MockDoctorRepository,
  MockBookingRepository,
  MockH1ConfirmationRepository,
  MockVisitRepository,
  MockQueueRepository,
  MockTreatmentRepository,
  MockTreatmentActivityRepository,
  MockInvoiceRepository,
  MockPaymentRepository,
  MockCompensationRepository,
  MockPayrollRepository,
  MockConfigurationRepository,
  MockAccountingRepository,
  MockStaffRepository,
  MockDoctorScheduleRepository,
  MockWorkShiftRepository,
  MockStaffShiftAssignmentRepository,
  MockAttendanceRepository,
  MockOvertimeRepository,
  MockMediaStorageRepository,
  MockMedicalRecordRepository,
  MockPromotionRepository,
  MockBackupRepository
} from "./mockRepositories";

import {
  SupabasePatientRepository,
  SupabaseBranchRepository,
  SupabaseDoctorRepository,
  SupabaseBookingRepository,
  SupabaseH1ConfirmationRepository,
  SupabaseVisitRepository,
  SupabaseQueueRepository,
  SupabaseTreatmentRepository,
  SupabaseInvoiceRepository,
  SupabasePaymentRepository,
  SupabaseConfigurationRepository,
  SupabaseStorageRepository,
  SupabaseMedicalRecordRepository,
  SupabasePromotionRepository
} from "./supabaseRepositories";

export interface RepositoryContainer {
  patient: PatientRepository;
  branch: BranchRepository;
  doctor: DoctorRepository;
  booking: BookingRepository;
  h1: H1ConfirmationRepository;
  visit: VisitRepository;
  queue: QueueRepository;
  treatment: TreatmentRepository;
  treatmentActivity: TreatmentActivityRepository;
  invoice: InvoiceRepository;
  payment: PaymentRepository;
  compensation: CompensationRepository;
  payroll: PayrollRepository;
  config: ConfigurationRepository;
  accounting: AccountingRepository;
  staff: StaffRepository;
  doctorSchedule: DoctorScheduleRepository;
  workShift: WorkShiftRepository;
  staffShift: StaffShiftAssignmentRepository;
  attendance: AttendanceRepository;
  overtime: OvertimeRepository;
  mediaStorage: MediaStorageRepository;
  medicalRecord: MedicalRecordRepository;
  promotion: PromotionRepository;
  backup: BackupRepository;
}

export type ActiveDataSource = "SUPABASE" | "MOCK";

export interface RuntimeDataSourceInfo {
  activeDataSource: ActiveDataSource;
  isSupabaseConfigured: boolean;
  isTestEnvironment: boolean;
}

export function isTestEnv(): boolean {
  if (typeof process !== "undefined" && (process.env.NODE_ENV === "test" || process.env.VITEST)) {
    return true;
  }
  return false;
}

export function getRuntimeDataSourceInfo(): RuntimeDataSourceInfo {
  const testMode = isTestEnv();
  return {
    activeDataSource: !testMode && isSupabaseConfigured ? "SUPABASE" : "MOCK",
    isSupabaseConfigured,
    isTestEnvironment: testMode
  };
}

/**
 * Creates the complete repository suite based on active environment.
 */
export function createRepositorySuite(forceMock = false): RepositoryContainer {
  const useMock = forceMock || isTestEnv() || !isSupabaseConfigured;

  if (useMock) {
    return {
      patient: new MockPatientRepository(),
      branch: new MockBranchRepository(),
      doctor: new MockDoctorRepository(),
      booking: new MockBookingRepository(),
      h1: new MockH1ConfirmationRepository(),
      visit: new MockVisitRepository(),
      queue: new MockQueueRepository(),
      treatment: new MockTreatmentRepository(),
      treatmentActivity: new MockTreatmentActivityRepository(),
      invoice: new MockInvoiceRepository(),
      payment: new MockPaymentRepository(),
      compensation: new MockCompensationRepository(),
      payroll: new MockPayrollRepository(),
      config: new MockConfigurationRepository(),
      accounting: new MockAccountingRepository(),
      staff: new MockStaffRepository(),
      doctorSchedule: new MockDoctorScheduleRepository(),
      workShift: new MockWorkShiftRepository(),
      staffShift: new MockStaffShiftAssignmentRepository(),
      attendance: new MockAttendanceRepository(),
      overtime: new MockOvertimeRepository(),
      mediaStorage: new MockMediaStorageRepository(),
      medicalRecord: new MockMedicalRecordRepository(),
      promotion: new MockPromotionRepository(),
      backup: new MockBackupRepository()
    };
  }

  // Supabase production repository suite (Connected to PostgreSQL Production)
  return {
    patient: new SupabasePatientRepository(),
    branch: new SupabaseBranchRepository(),
    doctor: new SupabaseDoctorRepository(),
    booking: new SupabaseBookingRepository(),
    h1: new SupabaseH1ConfirmationRepository(),
    visit: new SupabaseVisitRepository(),
    queue: new SupabaseQueueRepository(),
    treatment: new SupabaseTreatmentRepository(),
    treatmentActivity: new MockTreatmentActivityRepository(),
    invoice: new SupabaseInvoiceRepository(),
    payment: new SupabasePaymentRepository(),
    compensation: new MockCompensationRepository(),
    payroll: new MockPayrollRepository(),
    config: new SupabaseConfigurationRepository(),
    accounting: new MockAccountingRepository(),
    staff: new MockStaffRepository(),
    doctorSchedule: new MockDoctorScheduleRepository(),
    workShift: new MockWorkShiftRepository(),
    staffShift: new MockStaffShiftAssignmentRepository(),
    attendance: new MockAttendanceRepository(),
    overtime: new MockOvertimeRepository(),
    mediaStorage: new SupabaseStorageRepository(),
    medicalRecord: new SupabaseMedicalRecordRepository(),
    promotion: new SupabasePromotionRepository(),
    backup: new MockBackupRepository()
  };
}
