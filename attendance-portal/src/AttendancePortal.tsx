import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  Clock3,
  LogOut,
  MapPin,
  RefreshCw,
  ShieldCheck
} from "lucide-react";
import { User } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "../../src/lib/supabase";
import { getGeofenceDistanceMeters, isWithinAttendanceGeofence } from "../../src/utils/attendanceGeofence";

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
};
type StaffContext = {
  branchId: string | null;
  doctorId: string | null;
  name: string;
  role: StaffRole;
  staffId: string;
};
type LocationFix = { latitude: number; longitude: number; accuracyMeters: number };

const allowedRoles: StaffRole[] = ["BRANCH_ADMIN", "DOCTOR", "DOCTOR_ASSISTANT", "OB"];
const attendanceColumns = "id,branch_id,date,attendance_status,scheduled_start_at,scheduled_end_at,actual_check_in_at,actual_check_out_at,late_minutes";

function todayWib(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
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

function friendlyError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function getCurrentLocation(): Promise<LocationFix> {
  if (!navigator.geolocation) {
    return Promise.reject(new Error("Browser tidak mendukung GPS. Gunakan browser ponsel yang mendukung lokasi."));
  }
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracyMeters: coords.accuracy
      }),
      (error) => {
        const message = error.code === error.PERMISSION_DENIED
          ? "Izin lokasi ditolak. Aktifkan izin lokasi untuk browser lalu coba lagi."
          : error.code === error.POSITION_UNAVAILABLE
          ? "Lokasi belum tersedia. Aktifkan GPS dan coba di area terbuka."
          : "Pengambilan lokasi melewati batas waktu. Coba kembali.";
        reject(new Error(message));
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 }
    );
  });
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
  const [sessionUser, setSessionUser] = useState<User | null>(null);
  const [staffContext, setStaffContext] = useState<StaffContext | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [attendanceRows, setAttendanceRows] = useState<AttendanceRow[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const pendingAction = useRef<AttendanceAction | null>(null);
  const today = todayWib();
  const monthStart = `${today.slice(0, 7)}-01`;

  const currentBranch = branches.find((branch) => branch.id === selectedBranchId) || null;
  const todayAttendance = attendanceRows.find((row) => row.date === today) || null;
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

    const context: StaffContext = {
      branchId: account.branch_id || null,
      doctorId: account.doctor_id || null,
      name: account.name || user.user_metadata?.name || user.email || "Staf",
      role: account.role as StaffRole,
      staffId: resolvedStaffId
    };
    let branchIds: string[] = [];

    if (context.role === "DOCTOR") {
      let doctorId = context.doctorId;
      if (!doctorId) {
        const { data: doctor, error: doctorError } = await supabase
          .from("dental_doctors")
          .select("id")
          .eq("staff_id", context.staffId)
          .eq("active", true)
          .maybeSingle();
        if (doctorError) throw new Error(`Gagal membaca data dokter: ${doctorError.message}`);
        doctorId = doctor?.id || null;
      }

      if (doctorId) {
        const { data: schedules, error: scheduleError } = await supabase
          .from("doctor_schedules")
          .select("branch_id")
          .eq("doctor_id", doctorId)
          .eq("date", today)
          .eq("status", "ACTIVE");
        if (scheduleError) throw new Error(`Gagal membaca jadwal dokter hari ini: ${scheduleError.message}`);
        branchIds = Array.from(new Set((schedules || []).map((schedule) => schedule.branch_id)));
      }
    } else if (context.branchId) {
      branchIds = [context.branchId];
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

    const { data: history, error: historyError } = await supabase
      .from("attendances")
      .select(attendanceColumns)
      .gte("date", monthStart)
      .lte("date", today)
      .order("date", { ascending: false });
    if (historyError) throw new Error(`Gagal membaca riwayat absensi: ${historyError.message}`);

    const historyBranchId = history?.find((row) => row.date === today)?.branch_id;
    setStaffContext(context);
    setBranches(fetchedBranches.data || []);
    setSelectedBranchId((current) => {
      const availableBranches = fetchedBranches.data || [];
      if (historyBranchId && availableBranches.some((branch) => branch.id === historyBranchId)) {
        return historyBranchId;
      }
      return availableBranches.some((branch) => branch.id === current)
        ? current
        : availableBranches[0]?.id || "";
    });
    setAttendanceRows(history || []);
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
          await loadPortalContext(data.session.user);
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
    } catch (signOutError: unknown) {
      setErrorMessage(friendlyError(signOutError, "Gagal keluar dari portal."));
    } finally {
      setIsSubmitting(false);
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

  const beginAttendance = (action: AttendanceAction) => {
    setErrorMessage(null);
    setSuccessMessage(null);
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
      const location = await getCurrentLocation();
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
      setSuccessMessage(action === "check-in" ? "Absen masuk berhasil disimpan." : "Absen pulang berhasil disimpan.");
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

  if (!sessionUser || !staffContext) {
    return (
      <main className="login-shell">
        <section className="login-card">
          <div className="login-brand">
            <img src="/clinic-logo.jpg" alt="Logo Lala Dentist" />
            <p className="tagline">Absensi Klinik Lala Dentist</p>
          </div>
          <h1>Selamat Datang Kembali</h1>
          <p className="eyebrow">ABSENSI KLINIK LALA DENTIST</p>
          <p className="muted">Gunakan username/email dan password yang sama dengan sistem klinik.</p>
          {errorMessage && <div className="notice error" role="alert"><AlertCircle />{errorMessage}</div>}
          <form onSubmit={(event) => void handleLogin(event)} className="login-form">
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
            <button className="primary-button full-width" type="submit" disabled={isSubmitting || !isSupabaseConfigured}>
              {isSubmitting ? <RefreshCw className="spin" /> : <ShieldCheck />}
              {isSubmitting ? "Memeriksa akun..." : "Login"}
            </button>
          </form>
          <div className="privacy-note"><ShieldCheck />Akses dan lokasi absensi divalidasi oleh server.</div>
        </section>
      </main>
    );
  }

  return (
    <main className="portal-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <img src="/clinic-logo.jpg" alt="" />
          <div><strong>Lala Dentist</strong><span>Absensi Klinik</span></div>
        </div>
        <button className="icon-button" onClick={() => void handleSignOut()} disabled={isSubmitting} aria-label="Keluar">
          <LogOut />
        </button>
      </header>

      <section className="welcome-card">
        <div>
          <h1>Halo, {staffContext.name}</h1>
          <p className="daily-reminder">Jangan lupa absen hari ini</p>
          <p className="muted">{new Intl.DateTimeFormat("id-ID", { dateStyle: "full", timeZone: "Asia/Jakarta" }).format(new Date())}</p>
        </div>
        <div className="live-time">
          <Clock3 />
          <span>{new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit" }).format(new Date())} WIB</span>
        </div>
      </section>

      {errorMessage && <div className="notice error" role="alert"><AlertCircle />{errorMessage}</div>}
      {successMessage && <div className="notice success" role="status"><CheckCircle2 />{successMessage}</div>}

      {staffContext.role === "DOCTOR" && branches.length > 1 && (
        <label className="branch-picker">
          Cabang praktik hari ini
          <select value={selectedBranchId} onChange={(event) => setSelectedBranchId(event.target.value)}>
            {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </select>
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
          {!geofenceConfigured && <div className="notice warning compact"><AlertCircle />Absensi belum dapat dilakukan di cabang ini.</div>}
          <div className="action-buttons">
            <button
              className="primary-button"
              onClick={() => beginAttendance("check-in")}
              disabled={isSubmitting || !geofenceConfigured || !!todayAttendance}
            >
              {isSubmitting ? <RefreshCw className="spin" /> : <Camera />}
              {todayAttendance ? "Masuk tercatat" : "Masuk"}
            </button>
            <button
              className="secondary-button"
              onClick={() => beginAttendance("check-out")}
              disabled={isSubmitting || !geofenceConfigured || !todayAttendance?.actual_check_in_at || !!todayAttendance.actual_check_out_at}
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
                </div>
                <div className="history-times"><span>Masuk {formatTime(row.actual_check_in_at)}</span><span>Pulang {formatTime(row.actual_check_out_at)}</span></div>
              </article>
            ))}
          </div>
        )}
      </section>

      <input
        ref={photoInput}
        className="visually-hidden"
        type="file"
        accept="image/*"
        capture="environment"
        aria-label="Ambil foto bukti absensi"
        onChange={(event) => void handlePhotoSelected(event)}
      />
      <footer>Absensi Lala Dentist · Waktu dan lokasi diverifikasi oleh server.</footer>
    </main>
  );
}
