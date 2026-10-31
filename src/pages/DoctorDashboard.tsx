import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  Pill,
  Play,
  RefreshCw,
  Stethoscope,
  Users,
  X
} from "lucide-react";
import { useApp } from "../context/AppContext";
import { useRouter } from "../components/Router";
import {
  Booking,
  BookingStatus,
  PatientProfile,
  QueueItem,
  QueueStatus,
  ScheduleStatus
} from "../types/domain";
import { AppClock } from "../utils/clock";
import { formatIndonesianDate, getOperationalDateString } from "../utils/dateUtils";
import {
  ClinicalDocumentType,
  DoctorClinicalDocument
} from "../components/documents/DoctorClinicalDocument";
import { TreatmentManagement } from "./TreatmentManagement";
import {
  getDoctorPracticeBranchIds,
  resolveDoctorPracticeBranchId
} from "../utils/doctorPracticeSchedule";
import { getNotArrivedDoctorBookings } from "../utils/doctorDashboardUtils";

const isWaiting = (item: QueueItem) =>
  item.status === QueueStatus.WAITING ||
  item.status === QueueStatus.IN_PREPARATION ||
  item.status === QueueStatus.CALLING;

const getPatientName = (item: QueueItem, patients: Array<{ id: string; fullName?: string; name: string }>) => {
  const patient = patients.find((candidate) => candidate.id === item.patientId);
  return item.patientNameSnapshot || patient?.fullName || patient?.name || "Nama pasien tidak tersedia";
};

const formatTime = (value?: string | null) => {
  if (!value) return "--:--";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "--:--"
    : new Intl.DateTimeFormat("id-ID", {
      timeZone: "Asia/Jakarta",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).format(date);
};

const getGreeting = () => {
  const hour = Number(new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    hourCycle: "h23"
  }).format(new Date()));
  if (hour < 11) return "Selamat pagi";
  if (hour < 15) return "Selamat siang";
  if (hour < 18) return "Selamat sore";
  return "Selamat malam";
};

export const DoctorDashboard: React.FC = () => {
  const { currentUser, repos, branches, doctors, doctorSchedules, patients, visits, branding } = useApp();
  const { navigate } = useRouter();
  const today = AppClock.todayDateString();
  const doctorId = currentUser?.doctorId || "";
  const assignedBranchId = currentUser?.assignedBranchId || "";
  const scheduledBranchIds = useMemo(
    () => getDoctorPracticeBranchIds(doctorSchedules, doctorId, today).sort((first, second) =>
      (branches.find((branch) => branch.id === first)?.name || first)
        .localeCompare(branches.find((branch) => branch.id === second)?.name || second, "id")
    ),
    [branches, doctorSchedules, doctorId, today]
  );
  const [selectedPracticeBranchId, setSelectedPracticeBranchId] = useState("");
  const branchId = resolveDoctorPracticeBranchId(
    scheduledBranchIds,
    selectedPracticeBranchId,
    assignedBranchId
  );
  const doctor = doctors.find((item) => item.id === doctorId);
  const doctorName = doctor?.fullName || doctor?.name || "";
  const doctorGreeting = doctorName
    ? (/^drg?\./i.test(doctorName) ? doctorName : `dr. ${doctorName}`)
    : "";
  const doctorPhotoUrl = doctor?.photoUrl || doctor?.avatarUrl || doctor?.profileImage || null;
  const [failedDoctorPhotoUrl, setFailedDoctorPhotoUrl] = useState<string | null>(null);
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [queueActionError, setQueueActionError] = useState<string | null>(null);
  const [queueActionSuccess, setQueueActionSuccess] = useState<string | null>(null);
  const [startingQueueId, setStartingQueueId] = useState<string | null>(null);
  const [clinicalDocumentContext, setClinicalDocumentContext] = useState<{
    type: ClinicalDocumentType;
    queueItem: QueueItem;
    patient: PatientProfile;
  } | null>(null);
  const [workflowPatient, setWorkflowPatient] = useState<QueueItem | null>(null);

  const loadToday = useCallback(async (isRefresh = false) => {
    if (!currentUser) return;
    if (!doctorId || !branchId) {
      setQueueItems([]);
      setBookings([]);
      setLoadError("Akun dokter belum terhubung ke data dokter dan cabang praktik.");
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setLoadError(null);
    try {
      const [allQueueItems, allBookings] = await Promise.all([
        repos.queue.getQueueByBranch(
          branchId,
          currentUser.role,
          currentUser.assignedBranchId,
          doctorId
        ),
        repos.booking.getBookings(currentUser.role, currentUser.assignedBranchId)
      ]);
      setQueueItems(allQueueItems.filter((item) =>
        item.doctorId === doctorId &&
        item.branchId === branchId &&
        getOperationalDateString(item.arrivalAt || item.checkInTime) === today
      ));
      setBookings(allBookings.filter((booking) =>
        booking.branchId === branchId &&
        booking.doctorId === doctorId &&
        getOperationalDateString(booking.bookingDateTime) === today &&
        booking.status !== BookingStatus.CANCELLED &&
        booking.status !== BookingStatus.RESCHEDULED &&
        booking.status !== BookingStatus.NO_SHOW
      ));
    } catch (error: unknown) {
      console.error("Gagal memuat dashboard praktik dokter:", error);
      setLoadError(error instanceof Error ? error.message : "Gagal memuat data praktik hari ini.");
      setQueueItems([]);
      setBookings([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [branchId, currentUser, doctorId, repos.booking, repos.queue, today]);

  useEffect(() => {
    void loadToday();
  }, [loadToday]);

  useEffect(() => {
    if (selectedPracticeBranchId && !scheduledBranchIds.includes(selectedPracticeBranchId)) {
      setSelectedPracticeBranchId("");
    }
  }, [scheduledBranchIds, selectedPracticeBranchId]);

  useEffect(() => {
    const handleDemoDatabaseUpdate = () => void loadToday(true);
    window.addEventListener("demo-database-updated", handleDemoDatabaseUpdate);
    return () => window.removeEventListener("demo-database-updated", handleDemoDatabaseUpdate);
  }, [loadToday]);

  const orderedQueue = useMemo(() => [...queueItems].sort((first, second) => {
    const priority = (item: QueueItem) => item.status === QueueStatus.IN_CONSULTATION ? 0 :
      isWaiting(item) ? 1 :
        item.status === QueueStatus.COMPLETED ? 2 :
          item.status === QueueStatus.SKIPPED ? 3 : 4;
    const priorityDifference = priority(first) - priority(second);
    if (priorityDifference !== 0) return priorityDifference;
    const firstOrder = first.sequenceOrder ?? Number.MAX_SAFE_INTEGER;
    const secondOrder = second.sequenceOrder ?? Number.MAX_SAFE_INTEGER;
    if (firstOrder !== secondOrder) return firstOrder - secondOrder;
    return (first.arrivalAt || first.checkInTime || "").localeCompare(second.arrivalAt || second.checkInTime || "");
  }), [queueItems]);

  const activePatient = orderedQueue.find((item) => item.status === QueueStatus.IN_CONSULTATION) || null;
  const waitingPatients = orderedQueue.filter(isWaiting);
  const nextPatient = waitingPatients[0] || null;
  const completedPatients = orderedQueue.filter((item) => item.status === QueueStatus.COMPLETED);
  const queueBookingIds = useMemo(
    () => new Set(queueItems.map((item) => item.bookingId).filter((id): id is string => !!id)),
    [queueItems]
  );
  const todayVisitCount = queueItems.length + bookings.filter((booking) => !queueBookingIds.has(booking.id)).length;
  const notArrivedBookings = useMemo(() =>
    getNotArrivedDoctorBookings(bookings, queueItems, visits)
      .sort((first, second) => first.bookingDateTime.localeCompare(second.bookingDateTime)),
  [bookings, queueItems, visits]);
  const notArrivedBookingCount = notArrivedBookings.length;
  const todaySchedules = doctorSchedules.filter((schedule) =>
    schedule.doctorId === doctorId &&
    schedule.branchId === branchId &&
    schedule.date === today &&
    schedule.status === ScheduleStatus.ACTIVE
  );
  const currentPatientName = activePatient ? getPatientName(activePatient, patients) : null;
  const nextPatientName = nextPatient ? getPatientName(nextPatient, patients) : null;
  const branchName = branches.find((item) => item.id === branchId)?.name || "Cabang praktik";

  const openPatientRecord = (item: QueueItem) => {
    if (!item.patientId || !item.visitId) return;
    const params = new URLSearchParams({
      patientId: item.patientId,
      visitId: item.visitId,
      returnTo: "/doctor/queue"
    });
    navigate(`/doctor/patients?${params.toString()}`);
  };
  const startNextConsultation = async (item: QueueItem) => {
    if (!currentUser || activePatient || startingQueueId) return;
    setQueueActionError(null);
    setQueueActionSuccess(null);
    setStartingQueueId(item.id);
    try {
      const startedPatient = await repos.queue.startService(
        item.id,
        currentUser.role,
        branchId,
        currentUser.id
      );
      setQueueActionSuccess(`${getPatientName(item, patients)} masuk ke pemeriksaan.`);
      setWorkflowPatient(startedPatient);
      await loadToday(true);
    } catch (error: unknown) {
      console.error("Gagal memulai pemeriksaan dari dashboard dokter:", error);
      setQueueActionError(error instanceof Error ? error.message : "Gagal memulai pemeriksaan.");
    } finally {
      setStartingQueueId(null);
    }
  };
  const closePatientWorkflow = () => {
    setWorkflowPatient(null);
    void loadToday(true);
  };
  const openClinicalDocument = (type: ClinicalDocumentType) => {
    if (!activePatient?.patientId || !activePatient.visitId) return;
    const patient = patients.find((item) => item.id === activePatient.patientId);
    if (!patient) return;
    setClinicalDocumentContext({ type, queueItem: activePatient, patient });
  };

  return (
    <div className="min-h-full space-y-5 bg-[linear-gradient(145deg,#fbf8f0_0%,#fffdf9_52%,#f8f3e8_100%)] p-4 sm:p-6" id="doctor-dashboard">
      <header className="relative isolate flex min-h-28 flex-col gap-4 overflow-hidden rounded-2xl border border-[#d6b96f] bg-[radial-gradient(ellipse_at_80%_50%,rgba(255,255,255,0.28),transparent_38%),linear-gradient(112deg,#9b7625_0%,#bd963e_38%,#e0c36f_62%,#9b7625_100%)] p-5 text-white shadow-[0_10px_28px_rgba(138,111,39,0.2)] sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="pointer-events-none absolute -right-10 -top-20 -z-10 h-56 w-56 rounded-full bg-white/25 blur-3xl" />
        <div className="pointer-events-none absolute right-4 top-1/2 hidden -translate-y-1/2 text-white/15 sm:block">
          <Stethoscope className="h-36 w-36 -rotate-12" strokeWidth={1.1} aria-hidden="true" />
        </div>
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-white/70 bg-gradient-to-br from-[#fffdf8] to-[#e6c875] p-1 shadow-[0_3px_10px_rgba(60,43,9,0.25)] sm:h-[68px] sm:w-[68px]">
            {doctorPhotoUrl && failedDoctorPhotoUrl !== doctorPhotoUrl ? (
              <img
                src={doctorPhotoUrl}
                alt={`Foto ${doctorName || "dokter"}`}
                loading="lazy"
                decoding="async"
                onError={() => setFailedDoctorPhotoUrl(doctorPhotoUrl)}
                className="h-full w-full rounded-full object-cover"
              />
            ) : (
              <Stethoscope className="h-6 w-6 text-[#8a6f27] sm:h-7 sm:w-7" aria-hidden="true" />
            )}
          </div>
          <div className="relative min-w-0">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/60 bg-white/80 text-[#9b7625]">
                <Stethoscope className="h-4 w-4" />
              </span>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-white">Dashboard Dokter</p>
            </div>
            <h1 className="mt-1 text-xl font-bold text-white sm:text-2xl">
              {getGreeting()}{doctorGreeting ? `, ${doctorGreeting}` : ""}
            </h1>
            <p className="mt-1 text-sm text-white/85">Ringkasan pelayanan {branchName} · {formatIndonesianDate(today)}</p>
          </div>
        </div>
        <div className="relative z-10 flex flex-wrap items-center gap-3">
          {scheduledBranchIds.length > 1 ? (
            <label className="flex items-center gap-2 rounded-full border border-white/60 bg-white/85 px-3 py-1.5 text-xs font-semibold text-[#735b20]">
              <span>Cabang praktik</span>
              <select
                aria-label="Pilih cabang praktik hari ini"
                value={branchId}
                onChange={(event) => setSelectedPracticeBranchId(event.target.value)}
                className="max-w-40 bg-transparent font-semibold outline-none"
              >
                {scheduledBranchIds.map((scheduledBranchId) => (
                  <option key={scheduledBranchId} value={scheduledBranchId}>
                    {branches.find((item) => item.id === scheduledBranchId)?.name || scheduledBranchId}
                  </option>
                ))}
              </select>
            </label>
          ) : scheduledBranchIds.length === 1 ? (
            <span className="inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/85 px-3 py-2 text-xs font-semibold text-[#735b20]">
              {branchName}
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/85 px-3 py-2 text-xs font-semibold text-[#735b20]">
              Tidak ada jadwal praktik hari ini
            </span>
          )}
          {todaySchedules.length > 0 && (
            <span className="inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/85 px-3 py-2 text-xs font-semibold text-[#735b20]">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Praktik {todaySchedules.map((schedule) => `${schedule.startTime}–${schedule.endTime}`).join(", ")}
            </span>
          )}
          <button
            type="button"
            onClick={() => void loadToday(true)}
            disabled={loading || refreshing}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/60 bg-white/85 px-3 py-2 text-xs font-semibold text-[#735b20] transition hover:bg-white disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Perbarui
          </button>
        </div>
      </header>

      {loadError && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <span className="font-bold">Data belum termuat.</span>
          <span>{loadError}</span>
        </div>
      )}
      {queueActionError && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{queueActionError}</div>
      )}
      {queueActionSuccess && (
        <div role="status" className="rounded-xl border border-[#e5d3aa] bg-[#faf6ec] p-3 text-sm text-[#735b20]">{queueActionSuccess}</div>
      )}

      <section aria-label="Ringkasan pasien hari ini" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Pasien Hari Ini"
          value={todayVisitCount}
          detail={`${bookings.length} booking · ${notArrivedBookingCount} belum check-in`}
          icon={<Users className="h-5 w-5" />}
          iconColor="gold"
          loading={loading}
        />
        <MetricCard
          label="Menunggu"
          value={waitingPatients.length}
          detail="Termasuk yang sudah dipanggil"
          icon={<Clock3 className="h-5 w-5" />}
          iconColor="orange"
          loading={loading}
        />
        <MetricCard
          label="Sedang Diperiksa"
          value={activePatient ? 1 : 0}
          detail={currentPatientName || "Belum ada pemeriksaan aktif"}
          icon={<Stethoscope className="h-5 w-5" />}
          iconColor="teal"
          loading={loading}
        />
        <MetricCard
          label="Selesai Hari Ini"
          value={completedPatients.length}
          detail="Kunjungan selesai"
          icon={<CheckCircle2 className="h-5 w-5" />}
          iconColor="green"
          loading={loading}
        />
      </section>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="overflow-hidden rounded-2xl border border-[#eadfc7] bg-white shadow-[0_8px_24px_rgba(138,111,39,0.06)]">
          <div className="flex items-center justify-between gap-3 bg-gradient-to-r from-[#9b7625] via-[#bd963e] to-[#dfbd69] px-5 py-4 text-white">
            <div>
              <h2 className="font-bold">Kondisi Pasien Hari Ini</h2>
              <p className="mt-0.5 text-xs text-white/80">Antrean aktif dan booking yang belum check-in</p>
            </div>
            <button
              type="button"
              onClick={() => {
                const params = new URLSearchParams({ branchId, date: today });
                navigate(`/doctor/queue/manage?${params.toString()}`);
              }}
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-white/30 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-white/20"
            >
              Lihat semua <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
          {loading ? (
            <div className="space-y-3 p-5" aria-label="Memuat antrean">
              {[0, 1, 2].map((item) => <div key={item} className="h-14 animate-pulse rounded-xl bg-[#f7f2e7]" />)}
            </div>
          ) : (
            <div className="divide-y divide-[#f1eadb]">
              {orderedQueue.length > 0 ? orderedQueue.slice(0, 6).map((item) => {
                const isActive = item.status === QueueStatus.IN_CONSULTATION;
                const isDone = item.status === QueueStatus.COMPLETED;
                const statusText = isActive ? "Sedang diperiksa" : isDone ? "Selesai" :
                  item.status === QueueStatus.SKIPPED ? "Dilewati" :
                    item.status === QueueStatus.CANCELLED ? "Dibatalkan" :
                      item.status === QueueStatus.IN_PREPARATION || item.status === QueueStatus.CALLING ? "Dipanggil" : "Menunggu";
                return (
                  <div key={item.id} className={`flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-[#fcfaf5] ${isActive ? "bg-[#faf6ec]" : ""}`}>
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${isActive ? "bg-[#9b7625] ring-4 ring-[#ebd4a8]/45" : isDone ? "bg-[#cfc7b5]" : "bg-[#c5a059]"}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-xs font-bold text-[#8a6f27]">{item.queueNumber}</span>
                        <span className="truncate text-sm font-semibold text-slate-900">{getPatientName(item, patients)}</span>
                      </div>
                      <p className="mt-1 text-[11px] text-slate-500">
                        Tiba {formatTime(item.arrivalAt || item.checkInTime)} · {item.bookingId ? "Booking" : "Walk-in"}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                      isActive ? "bg-[#ebd4a8] text-[#594516]" :
                        isDone ? "bg-[#f3f0e9] text-slate-600" :
                          item.status === QueueStatus.SKIPPED || item.status === QueueStatus.CANCELLED
                            ? "bg-rose-50 text-rose-700"
                            : "bg-[#faf6ec] text-[#80651f]"
                    }`}>{statusText}</span>
                  </div>
                );
              }) : (
                <div className="px-5 py-8 text-center">
                  <CalendarDays className="mx-auto h-7 w-7 text-slate-300" />
                  <p className="mt-2 text-sm font-semibold text-slate-700">Belum ada pasien check-in</p>
                </div>
              )}
              {notArrivedBookings.slice(0, 5).map((booking) => {
                const patient = patients.find((item) => item.id === booking.patientId);
                return (
                  <div key={booking.id} className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-[#fcfaf5]">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#dfbf78]" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="rounded-md bg-[#faf6ec] px-1.5 py-0.5 text-[10px] font-bold text-[#80651f]">{formatTime(booking.bookingDateTime)}</span>
                        <span className="truncate text-sm font-semibold text-slate-800">
                          {booking.patientNameSnapshot || patient?.fullName || patient?.name || "Nama pasien tidak tersedia"}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-slate-500">Booking · belum check-in</p>
                    </div>
                    <span className="shrink-0 rounded-full border border-[#eadbb9] bg-[#faf6ec] px-2.5 py-1 text-[10px] font-semibold text-[#80651f]">Belum datang</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <div className="space-y-5">
          <section className="relative overflow-hidden rounded-2xl border border-[#e6d5ad] bg-gradient-to-br from-white via-white to-[#faf4e5] p-5 shadow-[0_8px_24px_rgba(138,111,39,0.07)]">
            <div className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full bg-[#ebd4a8]/45 blur-2xl" />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-[#8a6f27]">
                  {activePatient ? "Sedang diperiksa" : "Pasien berikutnya"}
                </p>
                <h2 className="mt-1 text-lg font-bold text-slate-900">
                  {activePatient ? currentPatientName : nextPatientName || "Belum ada pasien"}
                </h2>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-full border border-[#eadbb9] bg-gradient-to-br from-[#fffdf8] to-[#e6c875] text-[#8a6f27] shadow-[0_3px_10px_rgba(138,111,39,0.12)]">
                <Stethoscope className="h-5 w-5" />
              </div>
            </div>
            {activePatient || nextPatient ? (
              <>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-[#80651f]">
                  <span className="rounded-lg border border-[#eee4cf] bg-white/80 px-2.5 py-1.5">Antrean {(activePatient || nextPatient)?.queueNumber}</span>
                  <span className="rounded-lg border border-[#eee4cf] bg-white/80 px-2.5 py-1.5">
                    {activePatient ? `Mulai ${formatTime(activePatient.actualServiceStartAt)}` : `Tiba ${formatTime(nextPatient?.arrivalAt || nextPatient?.checkInTime)}`}
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {!activePatient && nextPatient && (
                    <button
                      type="button"
                      onClick={() => void startNextConsultation(nextPatient)}
                      disabled={startingQueueId !== null}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#9b7625] to-[#c5a059] px-3 py-2.5 text-xs font-bold text-white shadow-sm transition hover:from-[#80651f] hover:to-[#a98232] disabled:opacity-50 sm:col-span-2"
                    >
                      <Play className="h-4 w-4 fill-current" />
                      {startingQueueId === nextPatient.id ? "Memulai pemeriksaan..." : "Mulai Pemeriksaan"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => activePatient && openPatientRecord(activePatient)}
                    disabled={!activePatient?.patientId || !activePatient.visitId}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#bca66c] bg-white/90 px-3 py-2.5 text-xs font-bold text-[#735b20] shadow-sm transition hover:border-[#9b7625] hover:bg-[#faf6ec] disabled:opacity-50"
                  >
                    <FileText className="h-4 w-4" /> Buka Rekam Medis
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!activePatient) return;
                      setQueueActionError(null);
                      setQueueActionSuccess(null);
                      setWorkflowPatient(activePatient);
                    }}
                    disabled={!activePatient?.visitId}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#9b7625] to-[#c5a059] px-3 py-2.5 text-xs font-bold text-white shadow-sm transition hover:from-[#80651f] hover:to-[#a98232] disabled:opacity-50"
                  >
                    <Activity className="h-4 w-4" /> Lanjutkan Pemeriksaan
                  </button>
                </div>
              </>
            ) : (
              <p className="mt-2 text-xs leading-5 text-slate-500">Pasien yang sudah check-in akan muncul di sini.</p>
            )}
          </section>

          <section className="rounded-2xl border border-[#eadfc7] bg-white p-5 shadow-[0_8px_24px_rgba(138,111,39,0.06)]">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#faf6ec] text-[#8a6f27]"><FileText className="h-4 w-4" /></span>
              <h2 className="text-sm font-bold text-slate-900">Dokumen Kunjungan</h2>
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Buat dokumen dari kunjungan aktif. Dokumen tersimpan permanen pada rekam medis pasien dan dapat dicetak.
            </p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <DocumentShortcut icon={<Pill className="h-4 w-4" />} label="Resep" color="rose" disabled={!activePatient?.patientId} onClick={() => openClinicalDocument("prescription")} />
              <DocumentShortcut icon={<FileText className="h-4 w-4" />} label="Surat Sakit" color="green" disabled={!activePatient?.patientId} onClick={() => openClinicalDocument("sick-note")} />
              <DocumentShortcut icon={<ArrowRight className="h-4 w-4" />} label="Rujukan" color="blue" disabled={!activePatient?.patientId} onClick={() => openClinicalDocument("referral")} />
            </div>
            <p className="mt-3 rounded-lg bg-[#fcfaf5] px-2.5 py-2 text-[10px] leading-4 text-[#8a7650]">
              {activePatient?.patientId
                ? `Dokumen akan ditautkan ke ${getPatientName(activePatient, patients)} dan kunjungan yang sedang diperiksa.`
                : "Mulai pemeriksaan pasien terlebih dahulu untuk membuat dokumen klinis."}
            </p>
          </section>

          <section className="rounded-2xl border border-[#eadfc7] bg-white p-5 shadow-[0_8px_24px_rgba(138,111,39,0.06)]">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#faf6ec] text-[#8a6f27]"><CalendarDays className="h-4 w-4" /></span>
              <h2 className="text-sm font-bold text-slate-900">Jadwal Praktik Hari Ini</h2>
            </div>
            {todaySchedules.length > 0 ? (
              <div className="mt-3 flex items-center justify-between rounded-xl border border-[#eee4cf] bg-[#fcfaf5] px-3.5 py-3">
                <div>
                  {todaySchedules.map((schedule) => (
                    <p key={schedule.id} className="text-sm font-semibold text-slate-800">
                      {schedule.startTime} – {schedule.endTime}
                    </p>
                  ))}
                  <p className="mt-0.5 text-xs text-slate-500">{doctor?.fullName || doctor?.name || "Dokter"}</p>
                </div>
                <span className="rounded-full border border-[#e5d3aa] bg-[#faf6ec] px-2.5 py-1 text-[10px] font-semibold text-[#80651f]">Hari ini</span>
              </div>
            ) : (
              <p className="mt-2 text-xs leading-5 text-slate-500">Jadwal praktik hari ini belum tercatat.</p>
            )}
          </section>
        </div>
      </div>
      {workflowPatient?.visitId && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/55 p-2 backdrop-blur-sm sm:p-5"
          role="dialog"
          aria-modal="true"
          aria-labelledby="doctor-visit-workflow-title"
        >
          <section className="flex max-h-[96vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-[#d6b96f] bg-[#fbfaf7] shadow-2xl">
            <header className="flex shrink-0 items-center justify-between gap-4 border-b border-[#eadbb9] bg-gradient-to-r from-[#9b7625] via-[#bd963e] to-[#dfbd69] px-4 py-3 text-white sm:px-6">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/85">Alur pasien dari Dashboard Dokter</p>
                <h2 id="doctor-visit-workflow-title" className="truncate text-base font-bold text-white">
                  {getPatientName(workflowPatient, patients)}
                </h2>
                <p className="text-[11px] text-white/85">
                  Antrean {workflowPatient.queueNumber} · Kelola rencana dan tindakan sampai pemeriksaan selesai
                </p>
              </div>
              <button
                type="button"
                onClick={closePatientWorkflow}
                className="shrink-0 rounded-lg p-2 text-white/85 transition hover:bg-white/15 hover:text-white"
                aria-label="Tutup alur pasien"
              >
                <X className="h-5 w-5" />
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <TreatmentManagement
                key={workflowPatient.visitId}
                embeddedVisitId={workflowPatient.visitId}
                onVisitFinished={(message, error) => {
                  setWorkflowPatient(null);
                  setQueueActionSuccess(message);
                  setQueueActionError(error || null);
                  void loadToday(true);
                }}
              />
            </div>
            <footer className="shrink-0 border-t border-[#eadfc7] bg-white px-4 py-2 text-[10px] text-slate-500 sm:px-6">
              Invoice dan pembayaran tetap diproses Admin/Kasir setelah pemeriksaan.
            </footer>
          </section>
        </div>
      )}
      {clinicalDocumentContext && (
        <DoctorClinicalDocument
          type={clinicalDocumentContext.type}
          visitId={clinicalDocumentContext.queueItem.visitId}
          initialComplaint={
            bookings.find((booking) => booking.id === clinicalDocumentContext.queueItem.bookingId)?.complaint || ""
          }
          patient={clinicalDocumentContext.patient}
          branch={branches.find((item) => item.id === branchId)}
          branding={branding}
          doctor={doctor}
          today={today}
          onClose={() => setClinicalDocumentContext(null)}
        />
      )}
    </div>
  );
};

interface MetricCardProps {
  label: string;
  value: string | number;
  detail: string;
  icon: React.ReactNode;
  iconColor: "gold" | "orange" | "teal" | "green";
  loading: boolean;
}

const MetricCard: React.FC<MetricCardProps> = ({ label, value, detail, icon, iconColor, loading }) => {
  const iconColorClass = {
    gold: "border-[#eadbb9] bg-gradient-to-br from-[#fff8df] to-[#dfbd69] text-[#80651f] shadow-[0_3px_12px_rgba(197,160,89,0.3)]",
    orange: "border-orange-300 bg-gradient-to-br from-orange-400 to-orange-600 text-white shadow-[0_3px_12px_rgba(234,88,12,0.3)]",
    teal: "border-cyan-300 bg-gradient-to-br from-cyan-500 to-teal-700 text-white shadow-[0_3px_12px_rgba(8,145,178,0.3)]",
    green: "border-emerald-300 bg-gradient-to-br from-emerald-400 to-green-700 text-white shadow-[0_3px_12px_rgba(16,185,129,0.3)]"
  }[iconColor];

  return (
  <div className="group flex min-h-28 min-w-0 items-center gap-3 rounded-2xl border border-[#e8dcc3] bg-white p-4 shadow-[0_6px_18px_rgba(74,58,25,0.1)] transition duration-200 hover:-translate-y-0.5 hover:border-[#d8c18f] hover:shadow-[0_10px_24px_rgba(138,111,39,0.15)] sm:gap-4 sm:p-5">
    <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full border ${iconColorClass} transition-transform duration-200 group-hover:scale-105`}>{icon}</div>
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 text-3xl font-bold leading-tight tracking-tight text-slate-900">{loading ? "—" : value}</p>
      <p className="mt-1 truncate text-[11px] text-slate-500">{loading ? "Memuat..." : detail}</p>
    </div>
  </div>
  );
};

const DocumentShortcut: React.FC<{
  icon: React.ReactNode;
  label: string;
  color: "rose" | "green" | "blue";
  disabled?: boolean;
  onClick: () => void;
}> = ({ icon, label, color, disabled = false, onClick }) => {
  const colorClass = {
    rose: "bg-gradient-to-br from-rose-500 to-rose-700 text-white shadow-[0_3px_10px_rgba(225,29,72,0.3)]",
    green: "bg-gradient-to-br from-emerald-500 to-green-700 text-white shadow-[0_3px_10px_rgba(16,185,129,0.3)]",
    blue: "bg-gradient-to-br from-sky-500 to-blue-700 text-white shadow-[0_3px_10px_rgba(2,132,199,0.3)]"
  }[color];

  return (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={`Buat ${label} untuk pasien aktif`}
    className="flex min-h-[72px] flex-col items-center justify-center gap-2 rounded-xl border border-[#eadfc7] bg-gradient-to-b from-white to-[#fcfaf5] px-2 py-2 text-[11px] font-semibold text-[#735b20] transition hover:border-[#c5a059] hover:bg-[#faf6ec] focus:outline-none focus:ring-2 focus:ring-[#c5a059]/30 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-[#eadfc7] disabled:hover:bg-white"
  >
    <span className={`flex h-8 w-8 items-center justify-center rounded-full ${colorClass}`}>{icon}</span>
    {label}
  </button>
  );
};
