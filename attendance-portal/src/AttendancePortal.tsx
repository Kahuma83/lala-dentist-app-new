import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BadgeCheck,
  CalendarDays,
  AlertCircle,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  Home,
  KeyRound,
  LogOut,
  MapPin,
  MessagesSquare,
  RefreshCw,
  Settings,
  ShieldCheck,
  Timer,
  UserRound,
  Upload,
  WalletCards
} from "lucide-react";
import { User } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "../../src/lib/supabase";
import {
  changeAuthenticatedPassword,
  resetAuthenticatedPassword
} from "../../src/services/passwordService";
import {
  getCurrentAttendanceLocation,
  getGeofenceDistanceMeters,
  isWithinAttendanceGeofence
} from "../../src/utils/attendanceGeofence";
import { loadOwnStaffProfilePhoto, uploadStaffProfilePhoto } from "../../src/utils/staffProfilePhoto";
import { DoctorGroupChat } from "./DoctorGroupChat";

type StaffRole = "BRANCH_ADMIN" | "DOCTOR" | "DOCTOR_ASSISTANT" | "OB";
type AttendanceAction = "check-in" | "check-out";
type Branch = {
  id: string;
  name: string;
  is_active: boolean;
  geofence_latitude: number | null;
  geofence_longitude: number | null;
  geofence_radius_meters: number | null;
};
type AttendanceRow = {
  branch_id: string;
  id: string;
  date: string;
  attendance_status: string;
  scheduled_start_at: string;
  scheduled_end_at: string;
  actual_check_in_at: string | null;
  actual_check_out_at: string | null;
  late_minutes: number;
  check_out_correction_status: "PENDING" | "APPROVED" | "RESOLVED" | null;
  check_out_correction_reason: string | null;
};
type StaffContext = {
  branchId: string | null;
  doctorId: string | null;
  name: string;
  role: StaffRole;
  staffId: string;
  userAccountId: string;
};
type PortalTab = "home" | "attendance" | "schedule" | "absence" | "overtime" | "payroll" | "chat" | "profile";
type AbsenceRequestType = "SICK" | "LEAVE" | "PERMISSION";
type PortalAbsenceRequest = {
  id: string;
  requestType: AbsenceRequestType;
  startDate: string;
  endDate: string;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reviewerNote: string | null;
  createdAt: string;
};
type PortalReplacementAssignment = {
  id: string;
  coveredDate: string;
  branchName: string;
  amountSnapshot: number;
  workConfirmedAt: string | null;
};
type PortalSchedule = {
  id: string;
  date: string;
  branchId: string;
  branchName: string;
  startTime: string;
  endTime: string;
  shiftName: string;
  notes: string | null;
};
type PortalOvertime = {
  id: string;
  date: string;
  minutes: number;
  hours: number;
  status: string;
  amount: number | null;
  notes: string | null;
  rejectionReason: string | null;
};
type PortalPayroll = {
  id: string;
  month: number;
  year: number;
  baseSalary: number;
  totalCompensation: number;
  totalDeductions: number;
  netSalary: number;
  status: string;
};
type PortalPayrollItem = {
  id: string;
  payrollId: string;
  description: string;
  amount: number;
  type: string;
};
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};
type PasswordView = "login" | "forgot" | "recovery";

function getInitialPasswordView(): PasswordView {
  const params = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return params.get("mode") === "recovery" || params.get("type") === "recovery" || hash.get("type") === "recovery"
    ? "recovery"
    : "login";
}

const allowedRoles: StaffRole[] = ["BRANCH_ADMIN", "DOCTOR", "DOCTOR_ASSISTANT", "OB"];
const fiveDayScheduleRoles: StaffRole[] = ["BRANCH_ADMIN", "DOCTOR_ASSISTANT"];
const legacyAttendanceColumns = "id,branch_id,date,attendance_status,scheduled_start_at,scheduled_end_at,actual_check_in_at,actual_check_out_at,late_minutes";
const attendanceColumns = `${legacyAttendanceColumns},check_out_correction_status,check_out_correction_reason`;
const portalTabs: { id: PortalTab; label: string; icon: typeof Home }[] = [
  { id: "home", label: "Beranda", icon: Home },
  { id: "attendance", label: "Absensi", icon: BadgeCheck },
  { id: "schedule", label: "Jadwal Saya", icon: CalendarDays },
  { id: "absence", label: "Cuti & Izin", icon: CalendarDays },
  { id: "overtime", label: "Lembur Saya", icon: Timer },
  { id: "payroll", label: "Gaji Saya", icon: WalletCards },
  { id: "chat", label: "Chat Grup", icon: MessagesSquare }
];

function todayWib(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function startOfWeek(date: string): string {
  const value = new Date(`${date}T12:00:00Z`);
  const daysSinceMonday = (value.getUTCDay() + 6) % 7;
  value.setUTCDate(value.getUTCDate() - daysSinceMonday);
  return value.toISOString().slice(0, 10);
}

function formatTime(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(new Date(`${value}T12:00:00+07:00`));
}

function formatRupiah(value: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(value);
}

function friendlyError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

async function compressPhoto(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("Foto tidak dapat dibaca. Ambil ulang foto dengan kamera ponsel.");
  }

  try {
    const scale = Math.min(1, 1440 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Browser tidak dapat menyiapkan kompresi foto.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error("Foto gagal diproses. Ambil ulang foto.")),
        "image/jpeg",
        0.78
      );
    });
  } finally {
    bitmap.close();
  }
}

async function removeOlderPolicyPhotos(staffId: string, keepPath: string): Promise<void> {
  const { data: rows, error: historyError } = await supabase
    .from("attendances")
    .select("check_in_photo_path,check_out_photo_path")
    .eq("staff_id", staffId)
    .or("check_in_photo_path.like.%/latest-%,check_out_photo_path.like.%/latest-%");
  if (historyError) throw new Error(`Gagal membaca foto absensi lama: ${historyError.message}`);

  const oldPaths = Array.from(new Set((rows || []).flatMap((row) => [
    row.check_in_photo_path,
    row.check_out_photo_path
  ]).filter((path): path is string => !!path && path !== keepPath)));

  for (let index = 0; index < oldPaths.length; index += 100) {
    const { error: removeError } = await supabase.storage
      .from("attendance-evidence")
      .remove(oldPaths.slice(index, index + 100));
    if (removeError) throw new Error(`Gagal menghapus foto absensi lama: ${removeError.message}`);
  }

  const { error: clearError } = await supabase.rpc("clear_old_self_attendance_photo_paths", {
    p_keep_photo_path: keepPath
  });
  if (clearError) throw new Error(`Gagal memperbarui referensi foto lama: ${clearError.message}`);
}

export function AttendancePortal() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installScreenDismissed, setInstallScreenDismissed] = useState(false);
  const [isAppInstalled, setIsAppInstalled] = useState(
    () => window.matchMedia("(display-mode: standalone)").matches ||
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  );
  const [installHelpMessage, setInstallHelpMessage] = useState("");
  const [sessionUser, setSessionUser] = useState<User | null>(null);
  const [staffContext, setStaffContext] = useState<StaffContext | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [attendanceRows, setAttendanceRows] = useState<AttendanceRow[]>([]);
  const [activeTab, setActiveTab] = useState<PortalTab>("home");
  const [isPanelLoading, setIsPanelLoading] = useState(false);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [scheduleRows, setScheduleRows] = useState<PortalSchedule[]>([]);
  const [scheduleWeekStart, setScheduleWeekStart] = useState(() => startOfWeek(todayWib()));
  const [absenceRows, setAbsenceRows] = useState<PortalAbsenceRequest[]>([]);
  const [replacementRows, setReplacementRows] = useState<PortalReplacementAssignment[]>([]);
  const [absenceForm, setAbsenceForm] = useState({
    requestType: "LEAVE" as AbsenceRequestType,
    startDate: todayWib(),
    endDate: todayWib(),
    reason: ""
  });
  const [overtimeRows, setOvertimeRows] = useState<PortalOvertime[]>([]);
  const [payrollRows, setPayrollRows] = useState<PortalPayroll[]>([]);
  const [payrollItems, setPayrollItems] = useState<PortalPayrollItem[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [passwordView, setPasswordView] = useState<PasswordView>(getInitialPasswordView);
  const [newRecoveryPassword, setNewRecoveryPassword] = useState("");
  const [confirmRecoveryPassword, setConfirmRecoveryPassword] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null);
  const [profilePhotoError, setProfilePhotoError] = useState<string | null>(null);
  const [isProfilePhotoSubmitting, setIsProfilePhotoSubmitting] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [attendanceSuccess, setAttendanceSuccess] = useState<AttendanceAction | null>(null);
  const [correctionSchemaAvailable, setCorrectionSchemaAvailable] = useState(true);
  const photoInput = useRef<HTMLInputElement>(null);
  const profilePhotoInput = useRef<HTMLInputElement>(null);
  const pendingAction = useRef<AttendanceAction | null>(null);
  const today = todayWib();
  const monthStart = `${today.slice(0, 7)}-01`;

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const handleAppInstalled = () => {
      setIsAppInstalled(true);
      setInstallScreenDismissed(true);
    };
    const standaloneQuery = window.matchMedia("(display-mode: standalone)");
    const handleDisplayModeChange = () => setIsAppInstalled(standaloneQuery.matches);

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    standaloneQuery.addEventListener("change", handleDisplayModeChange);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
      standaloneQuery.removeEventListener("change", handleDisplayModeChange);
    };
  }, []);

  const currentBranch = branches.find((branch) => branch.id === selectedBranchId) || null;
  const todayAttendances = attendanceRows.filter((row) => row.date === today);
  const todayAttendance = todayAttendances.find((row) => row.branch_id === selectedBranchId) || null;
  const unfinishedTodayRecords = todayAttendances.filter((row) => row.actual_check_in_at && !row.actual_check_out_at);
  const unfinishedTodayAttendance = unfinishedTodayRecords.find(
    (row) => row.check_out_correction_status === "PENDING"
  ) || unfinishedTodayRecords
    .slice()
    .sort((a, b) => String(b.actual_check_in_at).localeCompare(String(a.actual_check_in_at)))[0] || null;
  const unfinishedCurrentBranchAttendance = todayAttendances.find(
    (row) => row.branch_id === selectedBranchId && row.actual_check_in_at && !row.actual_check_out_at
  ) || null;
  const currentMonthRows = useMemo(
    () => attendanceRows.filter((row) => row.date >= monthStart && row.date <= today),
    [attendanceRows, monthStart, today]
  );
  const geofenceConfigured = Boolean(
    currentBranch?.is_active &&
    currentBranch.geofence_latitude != null &&
    currentBranch.geofence_longitude != null &&
    currentBranch.geofence_radius_meters != null
  );

  useEffect(() => {
    return () => {
      if (profilePhotoUrl) URL.revokeObjectURL(profilePhotoUrl);
    };
  }, [profilePhotoUrl]);

  const loadPortalContext = useCallback(async (user: User) => {
    const { data: account, error: accountError } = await supabase
      .from("user_accounts")
      .select("id,role,branch_id,doctor_id,name,active")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    if (accountError) throw new Error(`Gagal membaca profil akun: ${accountError.message}`);
    if (!account || !account.active || !allowedRoles.includes(account.role as StaffRole)) {
      await supabase.auth.signOut();
      throw new Error("Portal ini hanya untuk akun staf yang berhak melakukan absensi.");
    }

    const { data: resolvedStaffId, error: staffError } = await supabase.rpc("get_user_staff_id");
    if (staffError) throw new Error(`Gagal membaca tautan staf akun: ${staffError.message}`);
    if (!resolvedStaffId) throw new Error("Akun belum terhubung ke data staf. Hubungi Super Admin.");

    const { data: staffProfile, error: staffProfileError } = await supabase
      .from("staff")
      .select("full_name")
      .eq("id", resolvedStaffId)
      .maybeSingle();
    if (staffProfileError) throw new Error(`Gagal membaca nama pegawai: ${staffProfileError.message}`);

    const context: StaffContext = {
      branchId: account.branch_id || null,
      doctorId: account.doctor_id || null,
      name: staffProfile?.full_name?.trim() || account.name || user.user_metadata?.name || user.email || "Staf",
      role: account.role as StaffRole,
      staffId: resolvedStaffId,
      userAccountId: account.id
    };
    let branchIds: string[] = [];

    if (context.role === "DOCTOR") {
      const { data: doctor, error: doctorError } = await supabase
        .from("dental_doctors")
        .select("id")
        .eq("staff_id", context.staffId)
        .eq("active", true)
        .maybeSingle();
      if (doctorError) throw new Error(`Gagal membaca data dokter: ${doctorError.message}`);
      const doctorId = doctor?.id || context.doctorId;

      if (doctorId) {
        context.doctorId = doctorId;
        const { data: schedules, error: scheduleError } = await supabase
          .from("doctor_schedules")
          .select("branch_id,start_time")
          .eq("doctor_id", doctorId)
          .eq("date", today)
          .eq("status", "ACTIVE")
          .order("start_time", { ascending: true });
        if (scheduleError) throw new Error(`Gagal membaca jadwal dokter hari ini: ${scheduleError.message}`);
        branchIds = Array.from(new Set((schedules || []).map((schedule) => schedule.branch_id)));
      }
    } else if (context.role === "BRANCH_ADMIN") {
      if (context.branchId) branchIds = [context.branchId];
    } else {
      const { data: assignments, error: assignmentError } = await supabase
        .from("staff_shift_assignments")
        .select("branch_id")
        .eq("staff_id", context.staffId)
        .eq("date", today)
        .eq("active", true);
      if (assignmentError) throw new Error(`Gagal membaca penempatan cabang hari ini: ${assignmentError.message}`);
      branchIds = Array.from(new Set((assignments || []).map((assignment) => assignment.branch_id)));
      if (branchIds.length === 0 && context.branchId) branchIds = [context.branchId];
    }

    const fetchedBranches = branchIds.length
      ? await supabase
        .from("dental_branches")
        .select("id,name,is_active,geofence_latitude,geofence_longitude,geofence_radius_meters")
        .in("id", branchIds)
      : { data: [], error: null };
    if (fetchedBranches.error) {
      throw new Error(`Gagal membaca cabang absensi: ${fetchedBranches.error.message}`);
    }

    let { data: history, error: historyError } = await supabase
      .from("attendances")
      .select(attendanceColumns)
      .eq("staff_id", context.staffId)
      .gte("date", monthStart)
      .lte("date", today)
      .order("date", { ascending: false });
    if (
      historyError?.message.includes("check_out_correction_status") ||
      historyError?.message.includes("check_out_correction_reason")
    ) {
      const fallbackHistory = await supabase
        .from("attendances")
        .select(legacyAttendanceColumns)
        .eq("staff_id", context.staffId)
        .gte("date", monthStart)
        .lte("date", today)
        .order("date", { ascending: false });
      if (fallbackHistory.error) {
        throw new Error(`Gagal membaca riwayat absensi: ${fallbackHistory.error.message}`);
      }
      history = (fallbackHistory.data || []).map((row) => ({
        ...row,
        check_out_correction_status: null,
        check_out_correction_reason: null
      }));
      historyError = null;
      setCorrectionSchemaAvailable(false);
    } else if (!historyError) {
      setCorrectionSchemaAvailable(true);
    }
    if (historyError) throw new Error(`Gagal membaca riwayat absensi: ${historyError.message}`);

    const todayRows = (history || []).filter((row) => row.date === today);
    const unfinishedTodayRecord = todayRows
      .filter((row) => row.actual_check_in_at && !row.actual_check_out_at)
      .sort((a, b) => String(b.actual_check_in_at).localeCompare(String(a.actual_check_in_at)))[0];
    const historyBranchId = unfinishedTodayRecord?.branch_id;
    setStaffContext(context);
    setBranches(fetchedBranches.data || []);
    setSelectedBranchId((current) => {
      const availableBranches = fetchedBranches.data || [];
      if (historyBranchId && availableBranches.some((branch) => branch.id === historyBranchId)) {
        return historyBranchId;
      }
      if (unfinishedTodayRecord && availableBranches.some((branch) => branch.id === unfinishedTodayRecord.branch_id)) {
        return unfinishedTodayRecord.branch_id;
      }
      if (availableBranches.some((branch) => branch.id === current)) return current;
      const preferredBranchId = branchIds.find((branchId) => availableBranches.some((branch) => branch.id === branchId));
      return preferredBranchId || availableBranches[0]?.id || "";
    });
    setAttendanceRows(history || []);
    try {
      setProfilePhotoUrl(await loadOwnStaffProfilePhoto(context.staffId));
      setProfilePhotoError(null);
    } catch (photoError: unknown) {
      setProfilePhotoError(friendlyError(photoError, "Gagal memuat foto profil."));
    }
  }, [monthStart, today]);

  useEffect(() => {
    let active = true;
    const initialize = async () => {
      if (!isSupabaseConfigured) {
        setErrorMessage("Portal absensi belum dikonfigurasi. Hubungi administrator.");
        setIsLoading(false);
        return;
      }
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (data.session && active) {
          setSessionUser(data.session.user);
          if (getInitialPasswordView() !== "recovery") {
            await loadPortalContext(data.session.user);
          }
        }
      } catch (loadError: unknown) {
        if (active) setErrorMessage(friendlyError(loadError, "Gagal memuat data absensi."));
      } finally {
        if (active) setIsLoading(false);
      }
    };

    void initialize();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSessionUser(nextSession?.user || null);
      if (!nextSession) {
        setStaffContext(null);
        setBranches([]);
        setAttendanceRows([]);
        setActiveTab("home");
        setScheduleRows([]);
        setAbsenceRows([]);
        setReplacementRows([]);
        setOvertimeRows([]);
        setPayrollRows([]);
        setPayrollItems([]);
        setProfilePhotoUrl(null);
        setProfilePhotoError(null);
      }
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [loadPortalContext]);

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsSubmitting(true);
    try {
      const identifier = username.trim().toLowerCase();
      let email = identifier;
      if (!identifier.includes("@")) {
        const response = await fetch("/api/auth/lookup-user", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ usernameOrEmail: identifier })
        });
        if (response.ok) {
          const payload = await response.json();
          if (payload?.account?.active === false) throw new Error("Akun Anda tidak aktif. Hubungi administrator.");
          email = payload?.account?.email || `${identifier.replace(/[^a-z0-9_.-]/g, "")}@laladentist.id`;
        } else if (response.status === 404) {
          throw new Error("Username tidak ditemukan.");
        } else {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload?.message || "Gagal membaca akun login.");
        }
      }

      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw new Error(
        error.message.toLowerCase().includes("invalid login credentials")
          ? "Username/email atau password salah."
          : error.message
      );
      if (!data.user || !data.session) throw new Error("Sesi login tidak berhasil dibuat.");
      setSessionUser(data.user);
      await loadPortalContext(data.user);
      setPassword("");
    } catch (loginError: unknown) {
      setErrorMessage(friendlyError(loginError, "Gagal masuk ke portal absensi."));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetPassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    if (newRecoveryPassword.length < 6) {
      setErrorMessage("Password baru minimal harus 6 karakter.");
      return;
    }
    if (newRecoveryPassword !== confirmRecoveryPassword) {
      setErrorMessage("Konfirmasi password baru tidak cocok.");
      return;
    }

    setIsSubmitting(true);
    try {
      await resetAuthenticatedPassword(newRecoveryPassword);
      const { error } = await supabase.auth.signOut();
      if (error) throw new Error(`Password berhasil diperbarui, tetapi sesi belum berhasil diakhiri: ${error.message}`);
      setSessionUser(null);
      setStaffContext(null);
      setNewRecoveryPassword("");
      setConfirmRecoveryPassword("");
      setPasswordView("login");
      window.history.replaceState({}, "", window.location.pathname);
      setSuccessMessage("Password berhasil diperbarui. Silakan login menggunakan password baru.");
    } catch (resetError: unknown) {
      setErrorMessage(friendlyError(resetError, "Gagal memperbarui password. Tautan mungkin sudah kedaluwarsa."));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChangePassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    if (newPassword.length < 6) {
      setErrorMessage("Password baru minimal harus 6 karakter.");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setErrorMessage("Konfirmasi password baru tidak cocok.");
      return;
    }

    setIsSubmitting(true);
    try {
      await changeAuthenticatedPassword(newPassword, currentPassword, sessionUser?.email || null);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      setSuccessMessage("Password berhasil diperbarui. Gunakan password baru saat login berikutnya.");
    } catch (changeError: unknown) {
      setErrorMessage(friendlyError(changeError, "Gagal memperbarui password."));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw new Error(`Gagal keluar dari portal: ${error.message}`);
      setSessionUser(null);
      setStaffContext(null);
      setBranches([]);
      setAttendanceRows([]);
      setActiveTab("home");
      setScheduleRows([]);
      setOvertimeRows([]);
      setPayrollRows([]);
      setPayrollItems([]);
      setProfilePhotoUrl(null);
      setProfilePhotoError(null);
    } catch (signOutError: unknown) {
      setErrorMessage(friendlyError(signOutError, "Gagal keluar dari portal."));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInstallClick = async () => {
    setInstallHelpMessage("");
    if (!installPrompt) {
      const isAppleMobile = /iPhone|iPad|iPod/.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      setInstallHelpMessage(isAppleMobile
        ? "Di iPhone/iPad, ketuk tombol Bagikan di browser lalu pilih “Tambahkan ke Layar Utama”."
        : "Browser ini belum menampilkan prompt pemasangan. Coba buka portal melalui Chrome atau Edge terbaru, lalu pilih Pasang aplikasi dari menu browser.");
      return;
    }

    const promptEvent = installPrompt;
    setInstallPrompt(null);
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    if (choice.outcome === "accepted") {
      setInstallScreenDismissed(true);
      setSuccessMessage("Aplikasi berhasil dipasang. Silakan login untuk melanjutkan.");
    } else {
      setInstallHelpMessage("Pemasangan belum dilanjutkan. Anda tetap dapat membuka portal melalui browser.");
    }
  };

  const continueWithoutInstall = () => {
    setInstallScreenDismissed(true);
  };

  const handleProfilePhotoChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setIsProfilePhotoSubmitting(true);
    setProfilePhotoError(null);
    try {
      const cleanupWarning = await uploadStaffProfilePhoto(file, staffContext!.staffId);
      setProfilePhotoUrl(await loadOwnStaffProfilePhoto(staffContext!.staffId));
      setSuccessMessage(cleanupWarning || "Foto profil berhasil diperbarui.");
    } catch (photoError: unknown) {
      setProfilePhotoError(friendlyError(photoError, "Gagal memperbarui foto profil."));
    } finally {
      setIsProfilePhotoSubmitting(false);
    }
  };

  const reloadContext = async () => {
    if (!sessionUser) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await loadPortalContext(sessionUser);
    } catch (refreshError: unknown) {
      setErrorMessage(friendlyError(refreshError, "Gagal menyegarkan data."));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTabChange = async (tab: PortalTab, requestedWeekStart = scheduleWeekStart) => {
    setActiveTab(tab);
    setPanelError(null);
    if (tab === "home" || tab === "attendance" || tab === "chat" || tab === "profile") return;

    setIsPanelLoading(true);
    try {
      if (tab === "absence") {
        const [{ data, error }, { data: assignmentData, error: assignmentError }] = await Promise.all([
          supabase
            .from("staff_absence_requests")
            .select("id,request_type,start_date,end_date,reason,status,reviewer_note,created_at")
            .eq("staff_id", staffContext!.staffId)
            .order("created_at", { ascending: false })
            .limit(50),
          supabase
            .from("staff_replacement_assignments")
            .select("id,covered_date,branch_id,amount_snapshot,work_confirmed_at")
            .eq("replacement_staff_id", staffContext!.staffId)
            .order("covered_date", { ascending: false })
            .limit(50)
        ]);
        if (error) throw new Error(`Gagal memuat pengajuan cuti/izin: ${error.message}`);
        if (assignmentError) throw new Error(`Gagal memuat penugasan pengganti: ${assignmentError.message}`);
        setAbsenceRows((data || []).map((row) => ({
          id: row.id,
          requestType: row.request_type,
          startDate: row.start_date,
          endDate: row.end_date,
          reason: row.reason,
          status: row.status,
          reviewerNote: row.reviewer_note,
          createdAt: row.created_at
        })));
        const branchNames = new Map(branches.map((branch) => [branch.id, branch.name]));
        setReplacementRows((assignmentData || []).map((row) => ({
          id: row.id,
          coveredDate: row.covered_date,
          branchName: branchNames.get(row.branch_id) || "Cabang",
          amountSnapshot: Number(row.amount_snapshot),
          workConfirmedAt: row.work_confirmed_at
        })));
      } else if (tab === "schedule") {
        let nextSchedules: PortalSchedule[] = [];
        const isFiveDaySchedule = fiveDayScheduleRoles.includes(staffContext!.role);
        if (staffContext?.role === "DOCTOR") {
          if (!staffContext.doctorId) throw new Error("Data dokter belum tertaut ke akun ini. Hubungi Super Admin.");
          const scheduleEnd = addDays(today, 2);
          const { data, error } = await supabase
            .from("doctor_schedules")
            .select("id,date,branch_id,start_time,end_time,notes")
            .eq("doctor_id", staffContext.doctorId)
            .eq("status", "ACTIVE")
            .gte("date", today)
            .lte("date", scheduleEnd)
            .order("date", { ascending: true })
            .order("start_time", { ascending: true });
          if (error) throw new Error(`Gagal memuat jadwal praktik: ${error.message}`);
          nextSchedules = (data || []).map((row) => ({
            id: row.id,
            date: row.date,
            branchId: row.branch_id,
            branchName: "",
            startTime: row.start_time,
            endTime: row.end_time,
            shiftName: "Jadwal praktik",
            notes: row.notes
          }));
        } else {
          const assignmentStart = isFiveDaySchedule ? today : requestedWeekStart;
          const assignmentEnd = isFiveDaySchedule ? addDays(today, 4) : addDays(requestedWeekStart, 6);
          const { data: assignments, error: assignmentError } = await supabase
            .from("staff_shift_assignments")
            .select("id,date,branch_id,shift_id,custom_shift_name,custom_start_time,custom_end_time,notes")
            .eq("staff_id", staffContext!.staffId)
            .eq("active", true)
            .gte("date", assignmentStart)
            .lte("date", assignmentEnd)
            .order("date", { ascending: true });
          if (assignmentError) throw new Error(`Gagal memuat jadwal shift: ${assignmentError.message}`);

          const shiftIds = Array.from(new Set((assignments || [])
            .map((row) => row.shift_id)
            .filter((shiftId): shiftId is string => Boolean(shiftId))));
          const shiftsResult = shiftIds.length
            ? await supabase.from("work_shifts").select("id,name,start_time,end_time").in("id", shiftIds)
            : { data: [], error: null };
          if (shiftsResult.error) throw new Error(`Gagal membaca detail shift: ${shiftsResult.error.message}`);
          const shiftsById = new Map<string, { id: string; name: string; start_time: string; end_time: string }>(
            (shiftsResult.data || []).map((shift): [string, { id: string; name: string; start_time: string; end_time: string }] => [shift.id, shift])
          );
          nextSchedules = (assignments || []).flatMap((assignment) => {
            const shift = assignment.shift_id ? shiftsById.get(assignment.shift_id) : undefined;
            const startTime = assignment.custom_start_time || shift?.start_time;
            const endTime = assignment.custom_end_time || shift?.end_time;
            return startTime && endTime ? [{
              id: assignment.id,
              date: assignment.date,
              branchId: assignment.branch_id,
              branchName: "",
              startTime,
              endTime,
              shiftName: assignment.custom_shift_name || shift?.name || "Jadwal custom",
              notes: assignment.notes
            }] : [];
          });
        }

        const branchIds = Array.from(new Set(nextSchedules.map((row) => row.branchId)));
        const branchesResult = branchIds.length
          ? await supabase.from("dental_branches").select("id,name").in("id", branchIds)
          : { data: [], error: null };
        if (branchesResult.error) throw new Error(`Gagal membaca nama cabang jadwal: ${branchesResult.error.message}`);
        const branchNames = new Map<string, string>(
          (branchesResult.data || []).map((branch): [string, string] => [branch.id, branch.name])
        );
        setScheduleRows(nextSchedules
          .map((row) => ({ ...row, branchName: branchNames.get(row.branchId) || "Cabang" }))
          .sort((left, right) => left.date.localeCompare(right.date) || left.startTime.localeCompare(right.startTime)));
      } else if (tab === "overtime") {
        const { data, error } = await supabase
          .from("overtime_records")
          .select("id,date,overtime_minutes,overtime_hours,status,overtime_amount_snapshot,notes,rejection_reason")
          .eq("staff_id", staffContext!.staffId)
          .order("date", { ascending: false })
          .limit(50);
        if (error) throw new Error(`Gagal memuat riwayat lembur: ${error.message}`);
        setOvertimeRows((data || []).map((row) => ({
          id: row.id,
          date: row.date,
          minutes: row.overtime_minutes,
          hours: Number(row.overtime_hours) || 0,
          status: row.status,
          amount: row.overtime_amount_snapshot == null ? null : Number(row.overtime_amount_snapshot),
          notes: row.notes,
          rejectionReason: row.rejection_reason
        })));
      } else {
        const { data, error } = await supabase
          .from("monthly_payrolls")
          .select("id,month,year,base_salary,total_compensation,total_deductions,net_salary,status")
          .eq("staff_id", staffContext!.staffId)
          .in("status", ["APPROVED", "PAID"])
          .order("year", { ascending: false })
          .order("month", { ascending: false })
          .limit(24);
        if (error) throw new Error(`Gagal memuat slip gaji: ${error.message}`);
        const nextPayrolls = (data || []).map((row) => ({
          id: row.id,
          month: row.month,
          year: row.year,
          baseSalary: Number(row.base_salary) || 0,
          totalCompensation: Number(row.total_compensation) || 0,
          totalDeductions: Number(row.total_deductions) || 0,
          netSalary: Number(row.net_salary) || 0,
          status: row.status
        }));
        setPayrollRows(nextPayrolls);
        const payrollIds = nextPayrolls.map((row) => row.id);
        if (!payrollIds.length) {
          setPayrollItems([]);
        } else {
          const { data: items, error: itemsError } = await supabase
            .from("payroll_items")
            .select("id,payroll_id,description_snapshot,amount_snapshot,type")
            .in("payroll_id", payrollIds);
          if (itemsError) throw new Error(`Gagal memuat rincian slip gaji: ${itemsError.message}`);
          setPayrollItems((items || []).map((item) => ({
            id: item.id,
            payrollId: item.payroll_id,
            description: item.description_snapshot,
            amount: Number(item.amount_snapshot) || 0,
            type: item.type
          })));
        }
      }
    } catch (loadError: unknown) {
      setPanelError(friendlyError(loadError, "Gagal memuat data portal pegawai."));
    } finally {
      setIsPanelLoading(false);
    }
  };

  const submitAbsenceRequest = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!staffContext) return;
    if (absenceForm.endDate < absenceForm.startDate) {
      setErrorMessage("Tanggal akhir tidak boleh lebih awal dari tanggal mulai.");
      return;
    }
    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const { error } = await supabase.rpc("submit_staff_absence_request", {
        p_request_type: absenceForm.requestType,
        p_start_date: absenceForm.startDate,
        p_end_date: absenceForm.endDate,
        p_reason: absenceForm.reason.trim()
      });
      if (error) throw new Error(`Pengajuan tidak dapat dikirim: ${error.message}`);
      setAbsenceForm((form) => ({ ...form, reason: "" }));
      setSuccessMessage("Pengajuan berhasil dikirim dan menunggu persetujuan Super Admin.");
      await handleTabChange("absence");
    } catch (requestError: unknown) {
      setErrorMessage(friendlyError(requestError, "Gagal mengirim pengajuan."));
    } finally {
      setIsSubmitting(false);
    }
  };

  const changeScheduleWeek = (offset: number) => {
    if (staffContext && fiveDayScheduleRoles.includes(staffContext.role)) return;
    const nextWeekStart = addDays(scheduleWeekStart, offset * 7);
    setScheduleWeekStart(nextWeekStart);
    if (activeTab === "schedule") void handleTabChange("schedule", nextWeekStart);
  };

  const beginAttendance = (action: AttendanceAction) => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setAttendanceSuccess(null);
    pendingAction.current = action;
    photoInput.current?.click();
  };

  const handlePhotoSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const action = pendingAction.current;
    event.target.value = "";
    pendingAction.current = null;
    if (!file || !action || !staffContext || !currentBranch) return;

    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    let uploadedPath: string | null = null;
    try {
      if (!file.type.startsWith("image/")) throw new Error("Bukti absensi harus berupa foto.");
      if (!geofenceConfigured) throw new Error("Geofence cabang belum dikonfigurasi atau cabang belum aktif.");
      const location = await getCurrentAttendanceLocation(currentBranch.geofence_radius_meters!);
      const geofence = {
        latitude: currentBranch.geofence_latitude!,
        longitude: currentBranch.geofence_longitude!,
        radiusMeters: currentBranch.geofence_radius_meters!
      };
      const distance = getGeofenceDistanceMeters(location.latitude, location.longitude, geofence);
      if (location.accuracyMeters > geofence.radiusMeters) {
        throw new Error(`Akurasi GPS ${Math.round(location.accuracyMeters)} m; batas ${geofence.radiusMeters} m. Tunggu sinyal lebih baik.`);
      }
      if (!isWithinAttendanceGeofence(location, geofence)) {
        throw new Error(`Anda sekitar ${Math.round(distance)} m dari cabang, di luar radius ${geofence.radiusMeters} m.`);
      }

      const photo = await compressPhoto(file);
      const photoPath = `${currentBranch.id}/${staffContext.staffId}/latest-${crypto.randomUUID()}-${action}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from("attendance-evidence")
        .upload(photoPath, photo, {
          contentType: "image/jpeg",
          cacheControl: "3600",
          upsert: false
        });
      if (uploadError) throw new Error(`Gagal mengunggah foto bukti: ${uploadError.message}`);
      uploadedPath = photoPath;

      if (action === "check-out" && !todayAttendance?.actual_check_in_at) {
        throw new Error("Check-in hari ini tidak ditemukan.");
      }
      const rpcName = action === "check-in"
        ? "record_staff_attendance_check_in"
        : "record_staff_attendance_check_out";
      const rpcArgs = action === "check-in"
        ? {
          p_branch_id: currentBranch.id,
          p_latitude: location.latitude,
          p_longitude: location.longitude,
          p_accuracy_meters: location.accuracyMeters,
          p_photo_path: photoPath
        }
        : {
          p_attendance_id: todayAttendance?.id,
          p_branch_id: currentBranch.id,
          p_latitude: location.latitude,
          p_longitude: location.longitude,
          p_accuracy_meters: location.accuracyMeters,
          p_photo_path: photoPath
        };

      const { error: saveError } = await supabase.rpc(rpcName, rpcArgs);
      if (saveError) throw new Error(saveError.message);
      uploadedPath = null;
      let cleanupWarning: string | null = null;
      try {
        await removeOlderPolicyPhotos(staffContext.staffId, photoPath);
      } catch (cleanupError: unknown) {
        cleanupWarning = `Absensi tersimpan, tetapi foto lama belum berhasil dibersihkan: ${friendlyError(cleanupError, "Kesalahan tidak diketahui.")}`;
      }
      await loadPortalContext(sessionUser!);
      setAttendanceSuccess(action);
      if (cleanupWarning) setErrorMessage(cleanupWarning);
    } catch (submitError: unknown) {
      if (uploadedPath) {
        const { error: cleanupError } = await supabase.storage.from("attendance-evidence").remove([uploadedPath]);
        if (cleanupError) {
          setErrorMessage(`${friendlyError(submitError, "Gagal menyimpan absensi.")} Foto bukti gagal dibersihkan: ${cleanupError.message}`);
        } else {
          setErrorMessage(friendlyError(submitError, "Gagal menyimpan absensi."));
        }
      } else {
        setErrorMessage(friendlyError(submitError, "Gagal menyimpan absensi."));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return <main className="center-state"><RefreshCw className="spin" /><span>Memeriksa sesi absensi...</span></main>;
  }

  if (!isAppInstalled && !installScreenDismissed) {
    return (
      <main className="install-shell">
        <section className="install-card">
          <img className="install-logo" src="/portal-brand.png" alt="Logo Lala Dentist" />
          <p className="install-eyebrow">AKSES LEBIH MUDAH</p>
          <h1>MyLala</h1>
          <p className="install-description">Portal Pegawai Lala Dentist untuk membuka absensi, jadwal, dan informasi kerja dengan cepat.</p>
          <button className="install-button" type="button" onClick={() => void handleInstallClick()}>
            <Download />
            Pasang Sekarang
          </button>
          {installHelpMessage && <p className="install-help" role="status">{installHelpMessage}</p>}
          <button className="install-continue" type="button" onClick={continueWithoutInstall}>Lanjutkan lewat browser</button>
          <p className="install-note">Pemasangan gratis dan tidak mengubah akun staf Anda.</p>
        </section>
      </main>
    );
  }

  if (!sessionUser || !staffContext) {
    return (
      <main className="login-shell">
        <section className="login-card">
          <div className="login-brand">
            <img src="/portal-brand.png" alt="Logo Lala Dentist" />
          </div>
          <div className="login-heading">
            <h1>Selamat Datang Kembali</h1>
            <p className="muted">Masuk untuk mengakses absensi, jadwal, dan informasi kerja Anda.</p>
          </div>
          {errorMessage && <div className="notice error" role="alert"><AlertCircle />{errorMessage}</div>}
          {successMessage && <div className="notice success" role="status"><CheckCircle2 />{successMessage}</div>}
          {passwordView === "login" && <form onSubmit={(event) => void handleLogin(event)} className="login-form">
            <label>
              Username atau email
              <input
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                required
                disabled={isSubmitting}
              />
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                disabled={isSubmitting}
              />
            </label>
            <button
              className="forgot-password-link"
              type="button"
              onClick={() => {
                setErrorMessage(null);
                setSuccessMessage(null);
                setPasswordView("forgot");
              }}
            >
              Lupa password?
            </button>
            <button className="primary-button full-width" type="submit" disabled={isSubmitting || !isSupabaseConfigured}>
              {isSubmitting ? <RefreshCw className="spin" /> : <ShieldCheck />}
              {isSubmitting ? "Memeriksa akun..." : "Login"}
            </button>
          </form>}
          {passwordView === "forgot" && (
            <section className="login-form" aria-live="polite">
              <div className="notice warning">
                <KeyRound />
                <span>Akun staf masuk dengan username dan email internal, sehingga tautan pemulihan tidak dapat dikirim ke kotak masuk. Hubungi Super Admin untuk mengatur ulang password.</span>
              </div>
              <button className="text-button" type="button" onClick={() => { setErrorMessage(null); setPasswordView("login"); }}>
                Kembali ke login
              </button>
            </section>
          )}
          {passwordView === "recovery" && (
            <form onSubmit={(event) => void handleResetPassword(event)} className="login-form">
              <p className="muted">Buat password baru untuk akun pegawai Anda. Minimal 6 karakter.</p>
              <label>
                Password baru
                <input type="password" autoComplete="new-password" minLength={6} value={newRecoveryPassword} onChange={(event) => setNewRecoveryPassword(event.target.value)} required disabled={isSubmitting} />
              </label>
              <label>
                Konfirmasi password baru
                <input type="password" autoComplete="new-password" minLength={6} value={confirmRecoveryPassword} onChange={(event) => setConfirmRecoveryPassword(event.target.value)} required disabled={isSubmitting} />
              </label>
              <button className="primary-button full-width" type="submit" disabled={isSubmitting || !isSupabaseConfigured}>
                {isSubmitting ? <RefreshCw className="spin" /> : <KeyRound />}
                {isSubmitting ? "Menyimpan..." : "Simpan Password Baru"}
              </button>
            </form>
          )}
          <div className="privacy-note"><ShieldCheck />Akses dan lokasi absensi divalidasi oleh server.</div>
        </section>
      </main>
    );
  }

  return (
    <main className={`portal-shell${activeTab === "chat" && staffContext.role === "DOCTOR" ? " portal-shell-chat" : ""}`}>
      {!(activeTab === "chat" && staffContext.role === "DOCTOR") && <header className="topbar">
        <div className="brand-lockup">
          <img src="/portal-brand.png" alt="" />
          <div><strong>Lala Dentist</strong><span>Portal Pegawai</span></div>
        </div>
        <details className="account-menu">
          <summary aria-label="Buka menu profil">
            <Settings aria-hidden="true" />
            <span>Profil</span>
          </summary>
          <div className="account-menu-popover">
            <div className="account-menu-person">
              <strong>{staffContext.name}</strong>
              <span>Portal Pegawai</span>
            </div>
            <button type="button" onClick={(event) => {
              setActiveTab("profile");
              event.currentTarget.closest("details")?.removeAttribute("open");
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}>
              <UserRound />
              Profil Saya
            </button>
            <button type="button" onClick={(event) => {
              event.currentTarget.closest("details")?.removeAttribute("open");
              void handleSignOut();
            }} disabled={isSubmitting}>
              <LogOut />
              Keluar
            </button>
          </div>
        </details>
      </header>}

      {!(activeTab === "chat" && staffContext.role === "DOCTOR") && <section className="welcome-card">
        <div className="welcome-profile">
          <div className="profile-photo-wrap">
            {profilePhotoUrl
              ? <img className="profile-photo" src={profilePhotoUrl} alt="Foto profil Anda" />
              : <span className="profile-photo-placeholder" aria-hidden="true"><UserRound /></span>}
            <button
              className="profile-photo-button"
              type="button"
              onClick={() => profilePhotoInput.current?.click()}
              disabled={isProfilePhotoSubmitting}
              aria-label="Ubah foto profil"
              title="Ubah foto profil"
            >
              {isProfilePhotoSubmitting ? <RefreshCw className="spin" /> : <Upload />}
            </button>
            <input
              ref={profilePhotoInput}
              className="visually-hidden"
              type="file"
              accept="image/*"
              onChange={(event) => void handleProfilePhotoChange(event)}
            />
          </div>
          <div>
            <h1>Halo, {staffContext.name}</h1>
            <p className="daily-reminder">Jangan lupa absen hari ini</p>
            <p className="muted">{new Intl.DateTimeFormat("id-ID", { dateStyle: "full", timeZone: "Asia/Jakarta" }).format(new Date())}</p>
            {profilePhotoError && <p className="profile-photo-error" role="status">{profilePhotoError}</p>}
          </div>
        </div>
        <div className="live-time">
          <Clock3 />
          <span>{new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit" }).format(new Date())} WIB</span>
        </div>
      </section>}

      {!(activeTab === "chat" && staffContext.role === "DOCTOR") && errorMessage && <div className="notice error" role="alert"><AlertCircle />{errorMessage}</div>}
      {!(activeTab === "chat" && staffContext.role === "DOCTOR") && successMessage && <div className="notice success" role="status"><CheckCircle2 />{successMessage}</div>}
      {!(activeTab === "chat" && staffContext.role === "DOCTOR") && attendanceSuccess && (
        <div className="attendance-success" role="status" aria-live="polite">
          <CheckCircle2 aria-hidden="true" />
          <div className="attendance-success-copy">
            <strong>{attendanceSuccess === "check-in" ? "Absen masuk berhasil" : "Absen pulang selesai"}</strong>
            <span>{attendanceSuccess === "check-in"
              ? "Siap melayani! Semoga lancar hari ini."
              : "Waktunya istirahat! Sampai ketemu lagi besok 😊"}</span>
          </div>
        </div>
      )}

      {!(activeTab === "chat" && staffContext.role === "DOCTOR") && <nav className="portal-nav" aria-label="Menu portal pegawai">
        {portalTabs
          .filter(({ id }) => id !== "chat" || staffContext.role === "DOCTOR")
          .map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className={`portal-nav-item${activeTab === id ? " active" : ""}`}
            aria-current={activeTab === id ? "page" : undefined}
            aria-disabled={isPanelLoading}
            onClick={() => {
              if (!isPanelLoading) void handleTabChange(id);
            }}
          >
            <Icon />
            <span>{label}</span>
          </button>
          ))}
      </nav>}

      {activeTab === "home" && (
        <section className="portal-panel">
          <div className="panel-heading">
            <div><p className="eyebrow">RINGKASAN PEGAWAI</p><h2>Aktivitas hari ini</h2></div>
            <span className="status-badge">{staffContext.role === "DOCTOR"
              ? branches.length ? `${todayAttendances.length}/${branches.length} cabang tercatat` : "Belum ada jadwal"
              : todayAttendance?.actual_check_out_at ? "Selesai" : todayAttendance?.actual_check_in_at ? "Sudah masuk" : "Belum absen"}</span>
          </div>
          <div className="summary-grid">
            <div className="summary-card"><span>Masuk · {staffContext.role === "DOCTOR" ? currentBranch?.name || "cabang terpilih" : "hari ini"}</span><strong>{formatTime(todayAttendance?.actual_check_in_at || null)}</strong></div>
            <div className="summary-card"><span>Pulang · {staffContext.role === "DOCTOR" ? currentBranch?.name || "cabang terpilih" : "hari ini"}</span><strong>{formatTime(todayAttendance?.actual_check_out_at || null)}</strong></div>
            <div className="summary-card"><span>{staffContext.role === "DOCTOR" ? "Cabang sudah diabsen" : "Riwayat bulan ini"}</span><strong>{staffContext.role === "DOCTOR" ? `${todayAttendances.length} dari ${branches.length}` : `${currentMonthRows.length} hari`}</strong></div>
          </div>
          <div className="quick-links">
            <button type="button" className="portal-shortcut" onClick={() => void handleTabChange("attendance")}><BadgeCheck /><span><strong>Absensi Saya</strong><small>Absen masuk, pulang, dan lihat riwayat</small></span></button>
            <button type="button" className="portal-shortcut" onClick={() => void handleTabChange("schedule")}><CalendarDays /><span><strong>Jadwal Saya</strong><small>Lihat jadwal praktik atau shift</small></span></button>
            <button type="button" className="portal-shortcut" onClick={() => void handleTabChange("absence")}><CalendarDays /><span><strong>Cuti & Izin</strong><small>Ajukan sakit, cuti, atau izin</small></span></button>
            <button type="button" className="portal-shortcut" onClick={() => void handleTabChange("payroll")}><WalletCards /><span><strong>Gaji Saya</strong><small>Lihat slip yang sudah disetujui</small></span></button>
          </div>
          <p className="portal-footnote">Menu pegawai menampilkan data dari sistem klinik dan hanya untuk akun Anda.</p>
        </section>
      )}

      {activeTab === "chat" && staffContext.role === "DOCTOR" && (
        <DoctorGroupChat
          currentUserId={staffContext.userAccountId}
          onBack={() => setActiveTab("home")}
        />
      )}

      {activeTab === "attendance" && (
        <>
      {branches.length > 1 && (
        <label className="branch-picker">
          Cabang praktik hari ini
        <select
          value={selectedBranchId}
          onChange={(event) => setSelectedBranchId(event.target.value)}
        >
          {branches.map((branch) => {
            const branchAttendance = todayAttendances.find((row) => row.branch_id === branch.id);
            const status = branchAttendance?.check_out_correction_status === "PENDING"
              ? "Perlu koreksi"
              : branchAttendance?.actual_check_out_at
              ? "Selesai"
              : branchAttendance?.actual_check_in_at
              ? "Sudah masuk"
              : branchAttendance
              ? "Sudah dicatat"
              : "Belum absen";
            return <option key={branch.id} value={branch.id}>{branch.name} · {status}</option>;
          })}
        </select>
        <span className="branch-picker-note">{unfinishedTodayAttendance
          ? `Check-out ${branches.find((branch) => branch.id === unfinishedTodayAttendance.branch_id)?.name || "cabang sebelumnya"} belum tercatat. Anda tetap dapat check-in di cabang lain; absensi ini akan menunggu koreksi Super Admin.`
          : "Setiap cabang memiliki catatan masuk dan pulang terpisah. Selesaikan check-in dan check-out di cabang yang sama sebelum berpindah."}</span>
        </label>
      )}

      {branches.length === 0 ? (
        <div className="notice warning">
          <MapPin />
          <span>{staffContext.role === "DOCTOR"
            ? "Tidak ada jadwal praktik aktif Anda hari ini."
            : "Cabang akun Anda belum tersedia. Hubungi Super Admin."}</span>
        </div>
      ) : (
        <section className="action-card">
          <div className="location-heading"><MapPin /><div><strong>{currentBranch?.name}</strong><span>{geofenceConfigured
            ? `Radius absensi ${currentBranch?.geofence_radius_meters} meter`
            : "Geofence belum dikonfigurasi"}</span></div></div>
          {unfinishedCurrentBranchAttendance && (
            <div className="notice warning compact"><AlertCircle />Absensi Aktif</div>
          )}
          {unfinishedTodayAttendance && unfinishedTodayAttendance.branch_id !== currentBranch?.id && (
            <div className="notice warning compact"><AlertCircle />Check-out di {branches.find((branch) => branch.id === unfinishedTodayAttendance.branch_id)?.name || "cabang sebelumnya"} belum tercatat. Check-in di cabang ini akan menandai absensi sebelumnya untuk koreksi Super Admin.</div>
          )}
          {!geofenceConfigured && <div className="notice warning compact"><AlertCircle />Absensi belum dapat dilakukan di cabang ini.</div>}
          {!correctionSchemaAvailable && unfinishedTodayAttendance && unfinishedTodayAttendance.branch_id !== currentBranch?.id && (
            <div className="notice warning compact"><AlertCircle />Database belum diperbarui. Check-in di cabang berbeda sementara belum dapat diproses. Hubungi Super Admin untuk menerapkan pembaruan database.</div>
          )}
          <div className="action-buttons">
            <button
              className={todayAttendance ? "secondary-button" : "primary-button"}
              onClick={() => beginAttendance("check-in")}
              disabled={isSubmitting || !geofenceConfigured || !!todayAttendance || !!unfinishedCurrentBranchAttendance || (!correctionSchemaAvailable && !!unfinishedTodayAttendance && unfinishedTodayAttendance.branch_id !== currentBranch?.id)}
            >
              {isSubmitting ? <RefreshCw className="spin" /> : <Camera />}
              {todayAttendance?.actual_check_in_at ? "Masuk tercatat" : "Masuk"}
            </button>
            <button
              className={todayAttendance?.actual_check_in_at && !todayAttendance.actual_check_out_at ? "primary-button" : "secondary-button"}
              onClick={() => beginAttendance("check-out")}
              disabled={isSubmitting || !geofenceConfigured || !todayAttendance?.actual_check_in_at || currentBranch?.id !== todayAttendance.branch_id || !!todayAttendance.actual_check_out_at}
            >
              <Camera />
              {todayAttendance?.actual_check_out_at
                ? "Pulang tercatat"
                : todayAttendance && !todayAttendance.actual_check_in_at
                ? "Belum masuk hari ini"
                : "Pulang"}
            </button>
          </div>
          <p className="camera-note">Foto dan lokasi GPS diminta setiap kali absensi. Pastikan izin kamera dan lokasi aktif.</p>
        </section>
      )}

      <section className="history-card">
        <div className="section-heading">
          <div><h2>Riwayat bulan ini</h2><p>Data yang tampil hanya riwayat akun Anda.</p></div>
          <button className="icon-button light" onClick={() => void reloadContext()} disabled={isSubmitting} aria-label="Muat ulang riwayat">
            <RefreshCw />
          </button>
        </div>
        {currentMonthRows.length === 0 ? (
          <p className="empty-state">Belum ada catatan absensi bulan ini.</p>
        ) : (
          <div className="history-list">
            {currentMonthRows.map((row) => (
              <article className="history-row" key={row.id}>
                <div>
                  <strong>{new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short" }).format(new Date(`${row.date}T12:00:00+07:00`))}</strong>
                  <span>{row.attendance_status === "LATE" ? `Terlambat ${row.late_minutes} menit` : row.attendance_status === "PRESENT" ? "Hadir" : row.attendance_status}</span>
                  {branches.find((branch) => branch.id === row.branch_id) && <small>{branches.find((branch) => branch.id === row.branch_id)?.name}</small>}
                </div>
                <div className="history-times">
                  <span>Masuk {formatTime(row.actual_check_in_at)}</span>
                  <span>Pulang {formatTime(row.actual_check_out_at)}</span>
                  {row.check_out_correction_status === "PENDING" && <small className="correction-pending">Menunggu persetujuan koreksi Super Admin</small>}
                  {row.check_out_correction_status === "APPROVED" && <small className="correction-approved">Koreksi disetujui Super Admin</small>}
                  {row.check_out_correction_status === "RESOLVED" && <small>Pulang tercatat langsung di cabang</small>}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
        </>
      )}

      {activeTab === "schedule" && (
        <section className="portal-panel">
          <div className="panel-heading schedule-heading">
            <div><p className="eyebrow">JADWAL KERJA</p><h2>Jadwal Saya</h2></div>
            {staffContext?.role === "DOCTOR" || (staffContext && fiveDayScheduleRoles.includes(staffContext.role)) ? (
              <span className="schedule-date-range">{formatDate(today)} – {formatDate(addDays(today, staffContext.role === "DOCTOR" ? 2 : 4))}</span>
            ) : (
              <div className="schedule-week-controls" aria-label="Navigasi minggu jadwal">
              <button type="button" className="icon-button light" onClick={() => changeScheduleWeek(-1)} disabled={isPanelLoading} aria-label="Minggu sebelumnya">
                <ChevronLeft />
              </button>
              <span>{formatDate(scheduleWeekStart)} – {formatDate(addDays(scheduleWeekStart, 6))}</span>
              <button type="button" className="icon-button light" onClick={() => changeScheduleWeek(1)} disabled={isPanelLoading} aria-label="Minggu berikutnya">
                <ChevronRight />
              </button>
              {scheduleWeekStart !== startOfWeek(today) && (
                <button type="button" className="schedule-current-week" onClick={() => {
                  const currentWeek = startOfWeek(today);
                  setScheduleWeekStart(currentWeek);
                  if (activeTab === "schedule") void handleTabChange("schedule", currentWeek);
                }} disabled={isPanelLoading}>
                  Minggu ini
                </button>
              )}
              </div>
            )}
          </div>
          {isPanelLoading ? <p className="empty-state"><RefreshCw className="spin" /> Memuat jadwal...</p> : panelError ? <div className="notice error" role="alert"><AlertCircle />{panelError}</div> : (
            <>
              {scheduleRows.length === 0 && <p className="schedule-empty-note">{staffContext?.role === "DOCTOR"
                ? "Belum ada jadwal dokter yang ditetapkan untuk tiga hari ini."
                : staffContext && fiveDayScheduleRoles.includes(staffContext.role)
                ? "Belum ada jadwal yang ditetapkan untuk lima hari ini."
                : "Belum ada jadwal yang ditetapkan untuk minggu ini."}</p>}
              <div className="schedule-week-list">
                {Array.from(
                  { length: staffContext?.role === "DOCTOR" ? 3 : staffContext && fiveDayScheduleRoles.includes(staffContext.role) ? 5 : 7 },
                  (_, index) => staffContext?.role === "DOCTOR" || (staffContext && fiveDayScheduleRoles.includes(staffContext.role))
                    ? addDays(today, index)
                    : addDays(scheduleWeekStart, index)
                ).map((date) => {
                  const daySchedules = scheduleRows.filter((row) => row.date === date);
                  return (
                    <section className="schedule-day" key={date}>
                      <h3>{new Intl.DateTimeFormat("id-ID", {
                        timeZone: "Asia/Jakarta",
                        weekday: "long",
                        day: "numeric",
                        month: "long"
                      }).format(new Date(`${date}T12:00:00+07:00`))}</h3>
                      {daySchedules.length === 0 ? <p>Tidak ada jadwal</p> : daySchedules.map((row) => (
                        <article className="schedule-day-row" key={row.id}>
                          <div>
                            <strong>{row.shiftName}</strong>
                            <span>{row.branchName}</span>
                            {row.notes && !/^salinan mingguan\b/i.test(row.notes.trim()) && <small>{row.notes}</small>}
                          </div>
                          <strong className="portal-list-value schedule-time">{row.startTime}–{row.endTime}</strong>
                        </article>
                      ))}
                    </section>
                  );
                })}
              </div>
            </>
          )}
        </section>
      )}

      {activeTab === "absence" && (
        <section className="portal-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">PENGAJUAN KETIDAKHADIRAN</p>
              <h2>Cuti, Izin & Sakit</h2>
              <p className="muted">Pengajuan ditinjau Super Admin. Absensi dan payroll baru diperbarui setelah disetujui.</p>
            </div>
          </div>
          <form className="absence-request-form" onSubmit={submitAbsenceRequest}>
            <label>
              Jenis pengajuan
              <select
                value={absenceForm.requestType}
                onChange={(event) => setAbsenceForm({ ...absenceForm, requestType: event.target.value as AbsenceRequestType })}
                disabled={isSubmitting}
              >
                <option value="LEAVE">Cuti</option>
                <option value="PERMISSION">Izin</option>
                <option value="SICK">Sakit</option>
              </select>
            </label>
            <label>
              Dari tanggal
              <input
                type="date"
                required
                value={absenceForm.startDate}
                onChange={(event) => setAbsenceForm({ ...absenceForm, startDate: event.target.value })}
                disabled={isSubmitting}
              />
            </label>
            <label>
              Sampai tanggal
              <input
                type="date"
                required
                min={absenceForm.startDate}
                value={absenceForm.endDate}
                onChange={(event) => setAbsenceForm({ ...absenceForm, endDate: event.target.value })}
                disabled={isSubmitting}
              />
            </label>
            <label className="absence-request-reason">
              Alasan / keterangan
              <textarea
                required
                minLength={3}
                maxLength={2000}
                rows={3}
                value={absenceForm.reason}
                onChange={(event) => setAbsenceForm({ ...absenceForm, reason: event.target.value })}
                placeholder="Jelaskan alasan pengajuan. Untuk sakit mendadak, pengajuan dapat dikirim setelah tanggal kejadian."
                disabled={isSubmitting}
              />
            </label>
            <button className="primary-button" type="submit" disabled={isSubmitting}>
              {isSubmitting ? <RefreshCw className="spin" /> : <CalendarDays />}
              {isSubmitting ? "Mengirim..." : "Kirim Pengajuan"}
            </button>
          </form>
          <div className="panel-heading absence-history-heading">
            <div><p className="eyebrow">RIWAYAT</p><h2>Pengajuan Saya</h2></div>
          </div>
          {isPanelLoading ? <p className="empty-state"><RefreshCw className="spin" /> Memuat pengajuan...</p> : panelError ? <div className="notice error" role="alert"><AlertCircle />{panelError}</div> : absenceRows.length === 0 ? <p className="empty-state">Belum ada pengajuan ketidakhadiran.</p> : (
            <div className="portal-list">
              {absenceRows.map((row) => (
                <article className="portal-list-row" key={row.id}>
                  <div>
                    <strong>{({ SICK: "Sakit", LEAVE: "Cuti", PERMISSION: "Izin" } as const)[row.requestType]} · {formatDate(row.startDate)}{row.endDate !== row.startDate ? ` – ${formatDate(row.endDate)}` : ""}</strong>
                    <span>{row.reason}</span>
                    {row.reviewerNote && <small>Catatan Super Admin: {row.reviewerNote}</small>}
                  </div>
                  <div className="portal-list-end">
                    <span className={`status-badge status-${row.status.toLowerCase()}`}>
                      {({ PENDING: "Menunggu", APPROVED: "Disetujui", REJECTED: "Ditolak" } as const)[row.status]}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          )}
          <p className="portal-footnote">Jika disetujui, hari kerja terjadwal akan tercatat pada absensi. Hari tanpa jadwal tidak mengurangi payroll.</p>
          <div className="panel-heading absence-history-heading">
            <div><p className="eyebrow">PENUGASAN</p><h2>Tugas Pengganti Saya</h2></div>
          </div>
          {replacementRows.length === 0 ? <p className="empty-state">Tidak ada penugasan pengganti.</p> : (
            <div className="portal-list">
              {replacementRows.map((row) => (
                <article className="portal-list-row" key={row.id}>
                  <div>
                    <strong>{formatDate(row.coveredDate)} · {row.branchName}</strong>
                    <span>Tugas pengganti</span>
                    <small>{row.workConfirmedAt ? "Pekerjaan dikonfirmasi Super Admin" : "Menunggu konfirmasi pekerjaan"}</small>
                  </div>
                  <div className="portal-list-end"><strong className="portal-list-value">{formatRupiah(row.amountSnapshot)}</strong></div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === "overtime" && (
        <section className="portal-panel">
          <div className="panel-heading"><div><p className="eyebrow">CATATAN KERJA TAMBAHAN</p><h2>Lembur Saya</h2></div></div>
          {isPanelLoading ? <p className="empty-state"><RefreshCw className="spin" /> Memuat data lembur...</p> : panelError ? <div className="notice error" role="alert"><AlertCircle />{panelError}</div> : overtimeRows.length === 0 ? <p className="empty-state">Belum ada catatan lembur untuk akun Anda.</p> : (
            <div className="portal-list">
              {overtimeRows.map((row) => (
                <article className="portal-list-row" key={row.id}>
                  <div><strong>{formatDate(row.date)}</strong><span>{row.hours.toLocaleString("id-ID")} jam · {row.minutes} menit</span>{(row.rejectionReason || row.notes) && <small>{row.rejectionReason || row.notes}</small>}</div>
                  <div className="portal-list-end"><span className={`status-badge status-${row.status.toLowerCase()}`}>{({ DETECTED: "Terdeteksi", SUBMITTED: "Diajukan", APPROVED: "Disetujui", REJECTED: "Ditolak", PAID: "Dibayar" } as Record<string, string>)[row.status] || row.status}</span>{row.amount != null && <strong className="portal-list-value">{formatRupiah(row.amount)}</strong>}</div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === "payroll" && (
        <section className="portal-panel">
          <div className="panel-heading"><div><p className="eyebrow">SLIP GAJI</p><h2>Gaji Saya</h2><p className="muted">Hanya slip yang sudah disetujui atau dibayar yang ditampilkan.</p></div></div>
          {isPanelLoading ? <p className="empty-state"><RefreshCw className="spin" /> Memuat slip gaji...</p> : panelError ? <div className="notice error" role="alert"><AlertCircle />{panelError}</div> : payrollRows.length === 0 ? <p className="empty-state">Belum ada slip gaji yang disetujui.</p> : (
            <div className="portal-list">
              {payrollRows.map((row) => (
                <article className="payroll-card" key={row.id}>
                  <div className="panel-heading">
                    <div><strong>{new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(new Date(row.year, row.month - 1, 1))}</strong><span className={`status-badge status-${row.status.toLowerCase()}`}>{row.status === "PAID" ? "Dibayar" : "Disetujui"}</span></div>
                    <strong className="payroll-total">{formatRupiah(row.netSalary)}</strong>
                  </div>
                  <div className="summary-grid payroll-summary">
                    <div className="summary-card"><span>Gaji pokok</span><strong>{formatRupiah(row.baseSalary)}</strong></div>
                    <div className="summary-card"><span>Tambahan</span><strong>{formatRupiah(row.totalCompensation)}</strong></div>
                    <div className="summary-card"><span>Potongan</span><strong>{formatRupiah(row.totalDeductions)}</strong></div>
                  </div>
                  {payrollItems.filter((item) => item.payrollId === row.id).length > 0 && (
                    <details className="payroll-details">
                      <summary>Rincian slip</summary>
                      {payrollItems.filter((item) => item.payrollId === row.id).map((item) => (
                        <div className="payroll-item" key={item.id}><span>{item.description}</span><strong>{item.type === "DEDUCTION" ? "−" : "+"}{formatRupiah(item.amount)}</strong></div>
                      ))}
                    </details>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === "profile" && (
        <section className="portal-panel">
          <div className="panel-heading"><div><p className="eyebrow">AKUN PEGAWAI</p><h2>Profil Saya</h2></div></div>
          <div className="profile-details">
            <div><span>Nama</span><strong>{staffContext.name}</strong></div>
            <div><span>Jabatan</span><strong>{{ BRANCH_ADMIN: "Branch Admin", DOCTOR: "Dokter", DOCTOR_ASSISTANT: "Asisten Dokter", OB: "Staf" }[staffContext.role]}</strong></div>
            <div><span>Penempatan</span><strong>{branches.find((branch) => branch.id === staffContext.branchId)?.name || "Sesuai penugasan"}</strong></div>
          </div>
          {profilePhotoError && <div className="notice error" role="alert"><AlertCircle />{profilePhotoError}</div>}
          <form className="password-form" onSubmit={(event) => void handleChangePassword(event)}>
            <div className="panel-heading">
              <div><p className="eyebrow">KEAMANAN AKUN</p><h2>Ubah Password</h2></div>
            </div>
            <p className="muted">Masukkan password saat ini untuk memverifikasi identitas sebelum menyimpan password baru.</p>
            <label>
              Password saat ini
              <input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required disabled={isSubmitting} />
            </label>
            <label>
              Password baru
              <input type="password" autoComplete="new-password" minLength={6} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required disabled={isSubmitting} />
            </label>
            <label>
              Konfirmasi password baru
              <input type="password" autoComplete="new-password" minLength={6} value={confirmNewPassword} onChange={(event) => setConfirmNewPassword(event.target.value)} required disabled={isSubmitting} />
            </label>
            <button className="primary-button full-width" type="submit" disabled={isSubmitting}>
              {isSubmitting ? <RefreshCw className="spin" /> : <ShieldCheck />}
              {isSubmitting ? "Menyimpan..." : "Simpan Password Baru"}
            </button>
          </form>
        </section>
      )}

      {activeTab !== "schedule" && activeTab !== "overtime" && activeTab !== "payroll" && activeTab !== "profile" && activeTab !== "chat" && isPanelLoading && (
        <div className="notice warning compact"><RefreshCw className="spin" /> Memuat data portal...</div>
      )}

      <input
        ref={photoInput}
        className="visually-hidden"
        type="file"
        accept="image/*"
        capture="environment"
        aria-label="Ambil foto bukti absensi"
        onChange={(event) => void handlePhotoSelected(event)}
      />
      {activeTab !== "chat" && <footer>Portal Pegawai Lala Dentist · Waktu dan lokasi absensi diverifikasi oleh server.</footer>}
    </main>
  );
}
