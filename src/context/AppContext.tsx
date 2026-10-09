import React, { createContext, useContext, useState, useEffect, useMemo } from "react";
import {
  CurrentUser,
  UserRole,
  DentalBranch,
  PatientProfile,
  Booking,
  PatientVisit,
  QueueItem,
  TreatmentJob,
  Invoice,
  PaymentTransaction,
  MonthlyPayroll,
  MasterService,
  ChartOfAccount,
  JournalEntry,
  DentalDoctor,
  Staff,
  DoctorSchedule,
  WorkShift,
  StaffShiftAssignment,
  DoctorBranchAssignment,
  Attendance,
  OvertimeRecord,
  PromotionMedia,
  ClinicBranding
} from "../types/domain";
import {
  PatientRepository,
  BranchRepository,
  DoctorRepository,
  BookingRepository,
  H1ConfirmationRepository,
  VisitRepository,
  QueueRepository,
  TreatmentRepository,
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
} from "../repositories/interfaces";
import {
  createRepositorySuite,
  RepositoryContainer,
  getRuntimeDataSourceInfo,
  RuntimeDataSourceInfo
} from "../repositories/repositoryFactory";
import { AccountingPostingService } from "../services/accountingPostingService";
import { isSupabaseConfigured } from "../lib/supabase";
import { AuthService } from "../services/authService";
import { MOCK_BRANCHES, MOCK_DOCTORS, MOCK_SERVICES, MOCK_USER_ACCOUNTS } from "../data/mockData";

// Initialize repositories using Repository Factory
const suite = createRepositorySuite();
const patientRepo = suite.patient;
const branchRepo = suite.branch;
const doctorRepo = suite.doctor;
const bookingRepo = suite.booking;
const h1Repo = suite.h1;
const visitRepo = suite.visit;
const queueRepo = suite.queue;
const treatmentRepo = suite.treatment;
const treatmentActivityRepo = suite.treatmentActivity;
const invoiceRepo = suite.invoice;
const paymentRepo = suite.payment;
const compensationRepo = suite.compensation;
const payrollRepo = suite.payroll;
const configRepo = suite.config;
const accountingRepo = suite.accounting;
const staffRepo = suite.staff;
const doctorScheduleRepo = suite.doctorSchedule;
const workShiftRepo = suite.workShift;
const staffShiftRepo = suite.staffShift;
const attendanceRepo = suite.attendance;
const overtimeRepo = suite.overtime;
const mediaStorageRepo = suite.mediaStorage;
const medicalRecordRepo = suite.medicalRecord;
const promotionRepo = suite.promotion;
const backupRepo = suite.backup;

const accountingPostingService = new AccountingPostingService({
  accountingRepo,
  invoiceRepo,
  paymentRepo,
  compRepo: compensationRepo,
  payrollRepo,
  treatmentRepo,
  doctorRepo
});

interface AppContextType {
  currentUser: CurrentUser | null;
  setCurrentUser: (user: CurrentUser | null) => void;
  selectedBranchId: string | null;
  setSelectedBranchId: (branchId: string | null) => void;
  dataSourceInfo: RuntimeDataSourceInfo;
  
  // Direct Repositories (Interface-based)
  patientRepo: PatientRepository;
  branchRepo: BranchRepository;
  doctorRepo: DoctorRepository;
  bookingRepo: BookingRepository;
  h1Repo: H1ConfirmationRepository;
  visitRepo: VisitRepository;
  queueRepo: QueueRepository;
  treatmentRepo: TreatmentRepository;
  invoiceRepo: InvoiceRepository;
  paymentRepo: PaymentRepository;
  compRepo: CompensationRepository;
  payrollRepo: PayrollRepository;
  configRepo: ConfigurationRepository;
  accountingRepo: AccountingRepository;
  staffRepo: StaffRepository;
  doctorScheduleRepo: DoctorScheduleRepository;
  workShiftRepo: WorkShiftRepository;
  staffShiftRepo: StaffShiftAssignmentRepository;
  attendanceRepo: AttendanceRepository;
  overtimeRepo: OvertimeRepository;
  mediaStorageRepo: MediaStorageRepository;
  promotionRepo: PromotionRepository;
  backupRepo: BackupRepository;
  accountingPostingService: AccountingPostingService;

  // Repositories container
  repos: RepositoryContainer;

  // State caches (SSOT)
  branches: DentalBranch[];
  patients: PatientProfile[];
  doctors: DentalDoctor[];
  staff: Staff[];
  doctorSchedules: DoctorSchedule[];
  workShifts: WorkShift[];
  staffShiftAssignments: StaffShiftAssignment[];
  doctorBranchAssignments: DoctorBranchAssignment[];
  attendances: Attendance[];
  overtimes: OvertimeRecord[];
  bookings: Booking[];
  visits: PatientVisit[];
  queueItems: QueueItem[];
  treatmentJobs: TreatmentJob[];
  invoices: Invoice[];
  payments: PaymentTransaction[];
  payrolls: MonthlyPayroll[];
  services: MasterService[];
  accounts: ChartOfAccount[];
  journals: JournalEntry[];
  promotions: PromotionMedia[];
  branding: ClinicBranding | null;
  setBranding: React.Dispatch<React.SetStateAction<ClinicBranding | null>>;

  // App States
  loading: boolean;
  error: string | null;
  refreshData: () => Promise<void>;

  // Auth States
  authStatus: "loading" | "authenticated" | "unauthenticated" | "error";
  authError: string | null;
  authLoading: boolean;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

// Pre-configured users matching company credentials
export const SIMULATED_USERS: CurrentUser[] = [
  {
    id: "user-super",
    name: "Drg. Lala (Super Admin)",
    role: UserRole.SUPER_ADMIN,
    assignedBranchId: null
  },
  // 15 Users as strictly defined
  {
    id: "user-dinda-ambulu",
    name: "DINDA",
    role: UserRole.BRANCH_ADMIN,
    assignedBranchId: "branch-ambulu",
    staffId: "staff-dinda-ambulu"
  },
  {
    id: "user-anisa-ambulu",
    name: "ANISA",
    role: UserRole.DOCTOR_ASSISTANT,
    assignedBranchId: "branch-ambulu",
    staffId: "staff-anisa-ambulu"
  },
  {
    id: "user-marsa-ambulu",
    name: "MARSA",
    role: UserRole.DOCTOR_ASSISTANT,
    assignedBranchId: "branch-ambulu",
    staffId: "staff-marsa-ambulu"
  },
  {
    id: "user-anggel-gebang",
    name: "ANGGEL",
    role: UserRole.BRANCH_ADMIN,
    assignedBranchId: "branch-gebang",
    staffId: "staff-anggel-gebang"
  },
  {
    id: "user-lilis-gebang",
    name: "LILIS",
    role: UserRole.BRANCH_ADMIN,
    assignedBranchId: "branch-gebang",
    staffId: "staff-lilis-gebang"
  },
  {
    id: "user-cece-gebang",
    name: "CECE",
    role: UserRole.BRANCH_ADMIN,
    assignedBranchId: "branch-gebang",
    staffId: "staff-cece-gebang"
  },
  {
    id: "user-linda-gebang",
    name: "LINDA",
    role: UserRole.DOCTOR_ASSISTANT,
    assignedBranchId: "branch-gebang",
    staffId: "staff-linda-gebang"
  },
  {
    id: "user-novi-gebang",
    name: "NOVI",
    role: UserRole.DOCTOR_ASSISTANT,
    assignedBranchId: "branch-gebang",
    staffId: "staff-novi-gebang"
  },
  {
    id: "user-ayik-kampus",
    name: "AYIK",
    role: UserRole.BRANCH_ADMIN,
    assignedBranchId: "branch-kampus",
    staffId: "staff-ayik-kampus"
  },
  {
    id: "user-usnake-kencong",
    name: "USNAKE",
    role: UserRole.BRANCH_ADMIN,
    assignedBranchId: "branch-kencong",
    staffId: "staff-usnake-kencong"
  },
  {
    id: "user-cyntia-kencong",
    name: "CYNTIA",
    role: UserRole.BRANCH_ADMIN,
    assignedBranchId: "branch-kencong",
    staffId: "staff-cyntia-kencong"
  },
  {
    id: "user-khalisa-kencong",
    name: "KHALISA",
    role: UserRole.DOCTOR_ASSISTANT,
    assignedBranchId: "branch-kencong",
    staffId: "staff-khalisa-kencong"
  },
  {
    id: "user-anita-kencong",
    name: "ANITA",
    role: UserRole.DOCTOR_ASSISTANT,
    assignedBranchId: "branch-kencong",
    staffId: "staff-anita-kencong"
  },
  {
    id: "user-rani-lengkong",
    name: "RANI",
    role: UserRole.BRANCH_ADMIN,
    assignedBranchId: "branch-lengkong-mumbul",
    staffId: "staff-rani-lengkong"
  },
  {
    id: "user-ima-lengkong",
    name: "IMA",
    role: UserRole.BRANCH_ADMIN,
    assignedBranchId: "branch-lengkong-mumbul",
    staffId: "staff-ima-lengkong"
  },
  // Additional system / test accounts
  {
    id: "user-branch-gebang",
    name: "Siska Wardani (Admin Gebang)",
    role: UserRole.BRANCH_ADMIN,
    assignedBranchId: "branch-gebang",
    staffId: "staff-siska"
  },
  {
    id: "user-branch-kampus",
    name: "Rian Hidayat (Admin Kampus)",
    role: UserRole.BRANCH_ADMIN,
    assignedBranchId: "branch-kampus"
  },
  {
    id: "user-branch-lengkong",
    name: "Putri Anggraini (Admin Lengkong Mumbul)",
    role: UserRole.BRANCH_ADMIN,
    assignedBranchId: "branch-lengkong",
    staffId: "staff-putri"
  },
  {
    id: "user-drg-syafira",
    name: "drg. Syafira (Dokter Spesialis Konservasi)",
    role: UserRole.DOCTOR,
    assignedBranchId: "branch-gebang",
    doctorId: "doc-syafira",
    staffId: "staff-syafira"
  },
  {
    id: "assistant-clary",
    name: "Clary (Perawat Gigi / Asisten Gebang)",
    role: UserRole.DOCTOR_ASSISTANT,
    assignedBranchId: "branch-gebang",
    staffId: "staff-clary"
  },
  {
    id: "patient-1",
    name: "Amanda Lestari (Pasien)",
    role: UserRole.PATIENT,
    assignedBranchId: "branch-gebang"
  }
];

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(() => {
    if (typeof window === "undefined" || isSupabaseConfigured) return null;
    if (localStorage.getItem("mock_user_logged_out") === "true") return null;
    const saved = localStorage.getItem("mock_user_id");
    if (saved) {
      const foundSim = SIMULATED_USERS.find((u) => u.id === saved);
      if (foundSim) return foundSim;
      const foundMock = MOCK_USER_ACCOUNTS.find((a) => a.id === saved);
      if (foundMock) {
        return {
          id: foundMock.id,
          name: foundMock.name,
          role: foundMock.role,
          assignedBranchId: foundMock.branchId || null,
          staffId: foundMock.staffId || null,
          doctorId: foundMock.doctorId || null
        };
      }
    }
    return null;
  });
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);

  const [authStatus, setAuthStatus] = useState<"loading" | "authenticated" | "unauthenticated" | "error">(
    isSupabaseConfigured ? "loading" : (currentUser ? "authenticated" : "unauthenticated")
  );
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(isSupabaseConfigured);

  const [branches, setBranches] = useState<DentalBranch[]>([]);
  const [patients, setPatients] = useState<PatientProfile[]>([]);
  const [doctors, setDoctors] = useState<DentalDoctor[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [doctorSchedules, setDoctorSchedules] = useState<DoctorSchedule[]>([]);
  const [workShifts, setWorkShifts] = useState<WorkShift[]>([]);
  const [staffShiftAssignments, setStaffShiftAssignments] = useState<StaffShiftAssignment[]>([]);
  const [doctorBranchAssignments, setDoctorBranchAssignments] = useState<DoctorBranchAssignment[]>([]);
  const [attendances, setAttendances] = useState<Attendance[]>([]);
  const [overtimes, setOvertimes] = useState<OvertimeRecord[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [visits, setVisits] = useState<PatientVisit[]>([]);
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [treatmentJobs, setTreatmentJobs] = useState<TreatmentJob[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<PaymentTransaction[]>([]);
  const [payrolls, setPayrolls] = useState<MonthlyPayroll[]>([]);
  const [services, setServices] = useState<MasterService[]>([]);
  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
  const [journals, setJournals] = useState<JournalEntry[]>([]);
  const [promotions, setPromotions] = useState<PromotionMedia[]>([]);
  const [branding, setBranding] = useState<ClinicBranding | null>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Grouped repository instances
  const repos = useMemo(() => ({
    patient: patientRepo,
    branch: branchRepo,
    doctor: doctorRepo,
    booking: bookingRepo,
    h1: h1Repo,
    visit: visitRepo,
    queue: queueRepo,
    treatment: treatmentRepo,
    treatmentActivity: treatmentActivityRepo,
    invoice: invoiceRepo,
    payment: paymentRepo,
    compensation: compensationRepo,
    payroll: payrollRepo,
    config: configRepo,
    accounting: accountingRepo,
    staff: staffRepo,
    doctorSchedule: doctorScheduleRepo,
    workShift: workShiftRepo,
    staffShift: staffShiftRepo,
    attendance: attendanceRepo,
    overtime: overtimeRepo,
    mediaStorage: mediaStorageRepo,
    medicalRecord: medicalRecordRepo,
    promotion: promotionRepo,
    backup: backupRepo
  }), []);

  const refreshData = async () => {
    setLoading(true);
    setError(null);
    try {
      const results = await Promise.allSettled([
        branchRepo.getBranches(),
        patientRepo.getPatients(),
        doctorRepo.getDoctors(),
        staffRepo.getStaff(),
        doctorScheduleRepo.getSchedules(),
        workShiftRepo.getShifts(),
        staffShiftRepo.getAssignments(),
        doctorRepo.getDoctorBranchAssignments(),
        attendanceRepo.list(),
        overtimeRepo.list(),
        bookingRepo.getBookings(),
        visitRepo.getVisits(),
        queueRepo.getQueueItems(),
        treatmentRepo.getTreatmentJobs(),
        invoiceRepo.getInvoices(),
        paymentRepo.getPayments(),
        payrollRepo.getPayrolls(),
        configRepo.getServices(),
        accountingRepo.getAccounts(),
        accountingRepo.getJournals(),
        promotionRepo.getPromotions(),
        configRepo.getClinicBranding()
      ]);

      const [
        bRes, pRes, docRes, stfRes, schedRes, sftRes, ssaRes, dbaRes, attRes, otRes,
        bkRes, vRes, qRes, tRes, invRes, payRes, prRes, srvRes, accRes, jrnRes, prmRes, brandRes
      ] = results;

      if (bRes.status === "fulfilled") setBranches(bRes.value.length > 0 ? bRes.value : MOCK_BRANCHES);
      if (pRes.status === "fulfilled") setPatients(pRes.value);
      if (docRes.status === "fulfilled") {
        const hasCustomDoctorStore = typeof window !== "undefined" && localStorage.getItem("lala_doctors") !== null;
        setDoctors(docRes.value.length > 0 ? docRes.value : (hasCustomDoctorStore ? docRes.value : MOCK_DOCTORS));
      }
      if (stfRes.status === "fulfilled") setStaff(stfRes.value);
      if (schedRes.status === "fulfilled") setDoctorSchedules(schedRes.value);
      if (sftRes.status === "fulfilled") setWorkShifts(sftRes.value);
      if (ssaRes.status === "fulfilled") setStaffShiftAssignments(ssaRes.value);
      if (dbaRes.status === "fulfilled") setDoctorBranchAssignments(dbaRes.value);
      if (attRes.status === "fulfilled") setAttendances(attRes.value);
      if (otRes.status === "fulfilled") setOvertimes(otRes.value);
      if (bkRes.status === "fulfilled") setBookings(bkRes.value);
      if (vRes.status === "fulfilled") setVisits(vRes.value);
      if (qRes.status === "fulfilled") setQueueItems(qRes.value);
      if (tRes.status === "fulfilled") setTreatmentJobs(tRes.value);
      if (invRes.status === "fulfilled") setInvoices(invRes.value);
      if (payRes.status === "fulfilled") setPayments(payRes.value);
      if (prRes.status === "fulfilled") setPayrolls(prRes.value);
      if (srvRes.status === "fulfilled") setServices(srvRes.value && srvRes.value.length > 0 ? srvRes.value : MOCK_SERVICES);
      if (accRes.status === "fulfilled") setAccounts(accRes.value);
      if (jrnRes.status === "fulfilled") setJournals(jrnRes.value);
      if (prmRes.status === "fulfilled") setPromotions(prmRes.value);
      if (brandRes.status === "fulfilled") setBranding(brandRes.value);

      // Collect any rejected errors to display safely
      const rejected = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
      if (rejected.length > 0) {
        const errorMsgs = rejected.map((r) => r.reason?.message || "Error").filter(Boolean);
        console.warn("Sebagian data operasional gagal dimuat:", errorMsgs);
      }
    } catch (e: unknown) {
      if (e instanceof Error) {
        setError(e.message);
      } else {
        setError("Terjadi kesalahan yang tidak diketahui saat memuat data.");
      }
    } finally {
      setLoading(false);
    }
  };

  // Load user session on bootstrap
  useEffect(() => {
    let active = true;

    const bootstrapAuth = async () => {
      if (!isSupabaseConfigured) {
        const isLoggedOut = localStorage.getItem("mock_user_logged_out") === "true";
        const savedMockUserId = localStorage.getItem("mock_user_id");
        if (isLoggedOut) {
          setCurrentUser(null);
          setAuthStatus("unauthenticated");
        } else if (savedMockUserId) {
          const savedUser = SIMULATED_USERS.find(u => u.id === savedMockUserId);
          if (savedUser) {
            setCurrentUser(savedUser);
            setAuthStatus("authenticated");
          } else {
            const foundMock = MOCK_USER_ACCOUNTS.find((a) => a.id === savedMockUserId);
            if (foundMock) {
              setCurrentUser({
                id: foundMock.id,
                name: foundMock.name,
                role: foundMock.role,
                assignedBranchId: foundMock.branchId || null,
                staffId: foundMock.staffId || null,
                doctorId: foundMock.doctorId || null
              });
              setAuthStatus("authenticated");
            } else {
              setCurrentUser(null);
              setAuthStatus("unauthenticated");
            }
          }
        } else {
          setCurrentUser(null);
          setAuthStatus("unauthenticated");
        }
        setAuthLoading(false);
        return;
      }

      setAuthLoading(true);
      setAuthStatus("loading");
      try {
        const session = await AuthService.getCurrentSession();
        if (session && session.user && active) {
          const context = await AuthService.resolveUserContext(session.user.id, session.user.email || null);
          const userName = (session.user.user_metadata?.name as string) || (session.user.user_metadata?.full_name as string) || session.user.email || "User";
          const resolvedUser: CurrentUser = {
            id: context.userAccountId,
            name: userName,
            role: context.role,
            assignedBranchId: context.assignedBranchId ?? null,
            branchId: context.assignedBranchId ?? null,
            staffId: context.staffId ?? null,
            doctorId: context.role === UserRole.DOCTOR ? context.userAccountId : null,
            isMockFallback: context.isMockFallback,
            email: session.user.email || null
          };
          setCurrentUser(resolvedUser);
          setAuthStatus("authenticated");
        } else {
          setCurrentUser(null);
          setAuthStatus("unauthenticated");
        }
      } catch (err: any) {
        console.error("Auth bootstrap failed:", err.message);
        if (active) {
          setError(err.message);
          setAuthStatus("error");
          setAuthError(err.message);
          setCurrentUser(null);
        }
      } finally {
        if (active) {
          setAuthLoading(false);
        }
      }
    };

    bootstrapAuth();

    let subscription: { unsubscribe: () => void } | null = null;
    if (isSupabaseConfigured) {
      subscription = AuthService.onAuthStateChange(async (event, session) => {
        if (!active) return;
        if (event === "SIGNED_IN" && session?.user) {
          try {
            const context = await AuthService.resolveUserContext(session.user.id, session.user.email || null);
            const userName = (session.user.user_metadata?.name as string) || (session.user.user_metadata?.full_name as string) || session.user.email || "User";
            setCurrentUser({
              id: context.userAccountId,
              name: userName,
              role: context.role,
              assignedBranchId: context.assignedBranchId ?? null,
              branchId: context.assignedBranchId ?? null,
              staffId: context.staffId ?? null,
              doctorId: context.role === UserRole.DOCTOR ? context.userAccountId : null,
              isMockFallback: context.isMockFallback,
              email: session.user.email || null
            });
            setAuthStatus("authenticated");
          } catch (err: any) {
            setError(err.message);
            setAuthStatus("error");
            setAuthError(err.message);
            setCurrentUser(null);
          }
        } else if (event === "SIGNED_OUT") {
          setCurrentUser(null);
          setAuthStatus("unauthenticated");
        }
      });
    }

    return () => {
      active = false;
      if (subscription) {
        subscription.unsubscribe();
      }
    };
  }, []);

  // Enforce branch boundaries automatically
  useEffect(() => {
    if (currentUser) {
      if (currentUser.role === UserRole.BRANCH_ADMIN) {
        // Branch Admin is locked to their assigned branch ID
        setSelectedBranchId(currentUser.assignedBranchId);
      } else {
        // Super Admin defaults to null (all branches) or keeps their selection
      }
    } else {
      setSelectedBranchId(null);
    }
  }, [currentUser]);

  // Load initial data
  useEffect(() => {
    refreshData();
  }, []);

  const value = useMemo(() => ({
    currentUser,
    setCurrentUser,
    selectedBranchId,
    setSelectedBranchId,
    dataSourceInfo: getRuntimeDataSourceInfo(),
    repos,
    patientRepo,
    branchRepo,
    doctorRepo,
    bookingRepo,
    h1Repo,
    visitRepo,
    queueRepo,
    treatmentRepo,
    invoiceRepo,
    paymentRepo,
    compRepo: compensationRepo,
    payrollRepo,
    configRepo,
    accountingRepo,
    staffRepo,
    doctorScheduleRepo,
    workShiftRepo,
    staffShiftRepo,
    attendanceRepo,
    overtimeRepo,
    mediaStorageRepo,
    promotionRepo,
    backupRepo,
    accountingPostingService,
    branches,
    patients,
    doctors,
    staff,
    doctorSchedules,
    workShifts,
    staffShiftAssignments,
    doctorBranchAssignments,
    attendances,
    overtimes,
    bookings,
    visits,
    queueItems,
    treatmentJobs,
    invoices,
    payments,
    payrolls,
    services,
    accounts,
    journals,
    promotions,
    branding,
    setBranding,
    loading,
    error,
    refreshData,
    authStatus,
    authError,
    authLoading
  }), [
    currentUser,
    selectedBranchId,
    repos,
    branches,
    patients,
    doctors,
    staff,
    doctorSchedules,
    workShifts,
    staffShiftAssignments,
    doctorBranchAssignments,
    attendances,
    overtimes,
    bookings,
    visits,
    queueItems,
    treatmentJobs,
    invoices,
    payments,
    payrolls,
    services,
    accounts,
    journals,
    promotions,
    branding,
    loading,
    error,
    authStatus,
    authError,
    authLoading
  ]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error("useApp must be used within an AppProvider");
  }
  return context;
};

export const useAppContext = useApp;

