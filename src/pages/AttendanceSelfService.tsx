import React, { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Camera, CheckCircle2, Clock3, MapPin, RefreshCw, UserCheck } from "lucide-react";
import { useApp } from "../context/AppContext";
import { Attendance, AttendanceMethod, AttendanceStatus, ScheduleStatus, UserRole } from "../types/domain";
import { AppClock } from "../utils/clock";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { getGeofenceDistanceMeters, isWithinAttendanceGeofence } from "../utils/attendanceGeofence";

type AttendanceAction = "check-in" | "check-out";
type LocationFix = {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
};

function getCurrentLocation(): Promise<LocationFix> {
  if (!navigator.geolocation) {
    return Promise.reject(new Error("Browser ini tidak mendukung GPS. Gunakan browser ponsel yang mendukung lokasi."));
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

async function compressEvidencePhoto(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("Foto tidak dapat dibaca. Ambil ulang foto dengan kamera ponsel.");
  }

  try {
    const maxDimension = 1440;
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
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

function formatTime(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit" }).format(date);
}

export const AttendanceSelfService: React.FC = () => {
  const {
    currentUser,
    branches,
    doctorSchedules,
    attendances,
    attendanceRepo,
    refreshData
  } = useApp();
  const today = AppClock.todayDateString();
  const [doctorBranchSelection, setDoctorBranchSelection] = useState("");
  const staffId = currentUser?.staffId || "";
  const doctorScheduleBranches = useMemo(
    () => Array.from(new Set(doctorSchedules
      .filter((schedule) =>
        schedule.date === today &&
        schedule.status === ScheduleStatus.ACTIVE &&
        (!currentUser?.doctorId || schedule.doctorId === currentUser.doctorId)
      )
      .map((schedule) => schedule.branchId))),
    [currentUser?.doctorId, doctorSchedules, today]
  );
  useEffect(() => {
    if (currentUser?.role !== UserRole.DOCTOR) return;
    const preferredBranch = currentUser.assignedBranchId || currentUser.branchId || "";
    setDoctorBranchSelection(
      doctorScheduleBranches.includes(preferredBranch)
        ? preferredBranch
        : doctorScheduleBranches[0] || ""
    );
  }, [currentUser?.assignedBranchId, currentUser?.branchId, currentUser?.role, doctorScheduleBranches]);
  const branchId = currentUser?.role === UserRole.DOCTOR
    ? doctorBranchSelection
    : currentUser?.assignedBranchId || currentUser?.branchId || "";
  const branch = branches.find((candidate) => candidate.id === branchId);
  const currentMonth = today.slice(0, 7);
  const photoInput = useRef<HTMLInputElement>(null);
  const pendingAction = useRef<AttendanceAction | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const staffAttendances = useMemo(
    () => attendances
      .filter((attendance) => attendance.staffId === staffId && attendance.date.startsWith(currentMonth))
      .sort((a, b) => b.date.localeCompare(a.date)),
    [attendances, currentMonth, staffId]
  );
  const todayAttendance = staffAttendances.find((attendance) => attendance.date === today) || null;
  const isLocationConfigured = branch?.isActive !== false
    && branch?.geofenceLatitude != null
    && branch?.geofenceLongitude != null
    && branch?.geofenceRadiusMeters != null;
  const isSupportedRole = currentUser != null && [
    UserRole.BRANCH_ADMIN,
    UserRole.DOCTOR,
    UserRole.DOCTOR_ASSISTANT,
    UserRole.OB
  ].includes(currentUser.role);

  const startPhotoCapture = (action: AttendanceAction) => {
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
    if (!file || !action) return;

    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    let uploadedPath: string | null = null;

    try {
      if (!currentUser || !isSupportedRole) {
        throw new Error("Role akun ini tidak memiliki akses ke absensi mandiri.");
      }
      if (!staffId) {
        throw new Error("Akun belum terhubung ke data staf. Hubungi Super Admin.");
      }
      if (!branchId || !branch) {
        throw new Error("Cabang akun tidak ditemukan. Hubungi Super Admin.");
      }
      if (!isLocationConfigured) {
        throw new Error("Geofence cabang ini belum dikonfigurasi atau cabang belum aktif.");
      }
      if (!file.type.startsWith("image/")) {
        throw new Error("Bukti absensi harus berupa foto.");
      }

      const location = await getCurrentLocation();
      const radius = branch.geofenceRadiusMeters!;
      const geofence = {
        latitude: branch.geofenceLatitude!,
        longitude: branch.geofenceLongitude!,
        radiusMeters: radius
      };
      const distance = getGeofenceDistanceMeters(location.latitude, location.longitude, geofence);
      if (location.accuracyMeters > radius) {
        throw new Error(`Akurasi GPS masih ${Math.round(location.accuracyMeters)} m. Batas yang diizinkan ${radius} m; tunggu sinyal lebih baik lalu coba lagi.`);
      }
      if (!isWithinAttendanceGeofence(location, geofence)) {
        throw new Error(`Lokasi Anda sekitar ${Math.round(distance)} m dari cabang, di luar radius ${radius} m.`);
      }

      const photo = await compressEvidencePhoto(file);
      const photoName = `${crypto.randomUUID()}-${action}.jpg`;
      const photoPath = `${branchId}/${staffId}/${photoName}`;

      if (isSupabaseConfigured) {
        const { error: uploadError } = await supabase.storage
          .from("attendance-evidence")
          .upload(photoPath, photo, {
            contentType: "image/jpeg",
            cacheControl: "3600",
            upsert: false
          });
        if (uploadError) throw new Error(`Gagal mengunggah foto bukti: ${uploadError.message}`);
        uploadedPath = photoPath;
      }

      let savedAttendance: Attendance;
      try {
        if (action === "check-in") {
          savedAttendance = await attendanceRepo.checkIn({
            staffId,
            branchId,
            date: today,
            checkInTime: AppClock.nowISO(),
            photoPath: uploadedPath || `mock/${photoName}`,
            method: AttendanceMethod.MOBILE,
            latitude: location.latitude,
            longitude: location.longitude,
            accuracyMeters: location.accuracyMeters
          }, currentUser.role, branchId);
        } else {
          if (!todayAttendance) throw new Error("Check-in hari ini tidak ditemukan.");
          savedAttendance = await attendanceRepo.checkOut({
            attendanceId: todayAttendance.id,
            staffId,
            branchId,
            date: today,
            checkOutTime: AppClock.nowISO(),
            photoPath: uploadedPath || `mock/${photoName}`,
            method: AttendanceMethod.MOBILE,
            latitude: location.latitude,
            longitude: location.longitude,
            accuracyMeters: location.accuracyMeters
          }, currentUser.role, branchId);
        }
      } catch (saveError: unknown) {
        if (uploadedPath) {
          const { error: cleanupError } = await supabase.storage
            .from("attendance-evidence")
            .remove([uploadedPath]);
          if (cleanupError) {
            throw new Error(
              `${saveError instanceof Error ? saveError.message : "Gagal menyimpan absensi."} Foto bukti gagal dibersihkan dari penyimpanan: ${cleanupError.message}`
            );
          }
        }
        throw saveError;
      }

      await refreshData("attendances");
      setSuccessMessage(action === "check-in"
        ? `Check-in tersimpan pada ${formatTime(savedAttendance.actualCheckInAt)}.`
        : `Check-out tersimpan pada ${formatTime(savedAttendance.actualCheckOutAt)}.`);
    } catch (submitError: unknown) {
      setErrorMessage(submitError instanceof Error ? submitError.message : "Gagal menyimpan absensi.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isSupportedRole) {
    return (
      <section className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">
        Role akun ini tidak diizinkan membuka absensi mandiri.
      </section>
    );
  }

  return (
    <main className="mx-auto w-full max-w-4xl space-y-5" id="attendance-self-service">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-emerald-700">
              <UserCheck className="h-4 w-4" />
              Absensi Mandiri
            </div>

            {currentUser?.role === UserRole.DOCTOR && doctorScheduleBranches.length > 1 && (
              <label className="mt-5 block max-w-sm">
                <span className="mb-1 block text-xs font-semibold text-slate-700">Cabang praktik hari ini</span>
                <select
                  value={branchId}
                  onChange={(event) => setDoctorBranchSelection(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  {doctorScheduleBranches.map((scheduledBranchId) => (
                    <option key={scheduledBranchId} value={scheduledBranchId}>
                      {branches.find((candidate) => candidate.id === scheduledBranchId)?.name || scheduledBranchId}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {currentUser?.role === UserRole.DOCTOR && doctorScheduleBranches.length === 0 && (
              <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                Tidak ada jadwal praktik aktif Anda untuk hari ini, sehingga absensi dokter belum dapat dilakukan.
              </div>
            )}
            <h1 className="mt-2 text-2xl font-bold text-slate-900">Halo, {currentUser?.name}</h1>
            <p className="mt-1 text-sm text-slate-500">
              {branch?.name || "Cabang belum ditentukan"} · {today}
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 px-4 py-3 text-right">
            <div className="text-[11px] font-semibold uppercase text-slate-500">Waktu perangkat</div>
            <div className="mt-1 flex items-center justify-end gap-1.5 font-mono text-lg font-bold text-slate-800">
              <Clock3 className="h-4 w-4 text-slate-400" />
              {new Intl.DateTimeFormat("id-ID", {
                timeZone: "Asia/Jakarta",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit"
              }).format(new Date())} WIB
            </div>
            <p className="mt-1 text-[10px] text-slate-400">Waktu tersimpan ditetapkan server.</p>
          </div>
        </div>

        {errorMessage && (
          <div role="alert" className="mt-5 flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}
        {successMessage && (
          <div role="status" className="mt-5 flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {!staffId && (
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Akun ini belum ditautkan ke profil staf. Minta Super Admin menghubungkan akun pada menu Manajemen SDM.
          </div>
        )}
        {branch && !isLocationConfigured && (
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Geofence untuk {branch.name} belum tersedia atau cabang belum aktif. Absensi mandiri akan dibuka setelah koordinat cabang dikonfigurasi.
          </div>
        )}

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <MapPin className="h-4 w-4 text-emerald-600" />
              Validasi lokasi
            </div>
            {isLocationConfigured ? (
              <p className="mt-2 text-xs leading-5 text-slate-500">
                Check-in dan check-out hanya diterima dalam radius {branch?.geofenceRadiusMeters} m dari {branch?.name}. GPS harus memiliki akurasi yang memadai.
              </p>
            ) : (
              <p className="mt-2 text-xs leading-5 text-slate-500">
                Lokasi cabang belum dikonfigurasi.
              </p>
            )}
          </div>
          <div className="rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <Camera className="h-4 w-4 text-emerald-600" />
              Foto bukti
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              Ambil foto baru saat check-in dan check-out. Foto dikompresi dan disimpan secara privat.
            </p>
          </div>
        </div>

        <input
          ref={photoInput}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          aria-label="Ambil foto bukti absensi"
          onChange={(event) => void handlePhotoSelected(event)}
        />

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => startPhotoCapture("check-in")}
            disabled={isSubmitting || !staffId || !isLocationConfigured || !!todayAttendance}
            className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            {todayAttendance ? "Check-in sudah tercatat" : "Foto & Check-In"}
          </button>
          <button
            type="button"
            onClick={() => startPhotoCapture("check-out")}
            disabled={
              isSubmitting ||
              !staffId ||
              !isLocationConfigured ||
              !todayAttendance?.actualCheckInAt ||
              !!todayAttendance.actualCheckOutAt
            }
            className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            {todayAttendance?.actualCheckOutAt
              ? "Check-out sudah tercatat"
              : todayAttendance && !todayAttendance.actualCheckInAt
              ? "Tidak ada check-in hari ini"
              : "Foto & Check-Out"}
          </button>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-bold text-slate-900">Riwayat bulan ini</h2>
          <p className="mt-1 text-xs text-slate-500">Hanya riwayat absensi akun Anda yang ditampilkan.</p>
        </div>
        <div className="divide-y divide-slate-100">
          {staffAttendances.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-slate-400">Belum ada catatan absensi bulan ini.</p>
          ) : staffAttendances.map((attendance) => (
            <AttendanceHistoryRow key={attendance.id} attendance={attendance} />
          ))}
        </div>
      </section>
    </main>
  );
};

const AttendanceHistoryRow: React.FC<{ attendance: Attendance }> = ({ attendance }) => {
  const statusLabels: Record<AttendanceStatus, string> = {
    [AttendanceStatus.PRESENT]: "Hadir",
    [AttendanceStatus.LATE]: `Terlambat ${attendance.lateMinutes} menit`,
    [AttendanceStatus.ABSENT]: "Alpa",
    [AttendanceStatus.SICK]: "Sakit",
    [AttendanceStatus.LEAVE]: "Izin / cuti",
    [AttendanceStatus.OFF]: "Libur"
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
      <div>
        <div className="text-sm font-semibold text-slate-800">{attendance.date}</div>
        <div className="mt-1 text-xs text-slate-500">
          {statusLabels[attendance.attendanceStatus]} · Jadwal {attendance.scheduledStartAt}–{attendance.scheduledEndAt}
        </div>
      </div>
      <div className="text-right text-xs text-slate-600">
        <div>Masuk {formatTime(attendance.actualCheckInAt)}</div>
        <div className="mt-1">Pulang {formatTime(attendance.actualCheckOutAt)}</div>
      </div>
    </div>
  );
};
