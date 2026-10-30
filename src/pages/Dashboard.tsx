import React, { useMemo, useState } from "react";
import { useApp } from "../context/AppContext";
import { getOperationalDateString } from "../utils/dateUtils";
import { getPatientMedicalRecordNumber } from "../utils/rmUtils";
import { useRouter } from "../components/Router";
import { UserRole, QueueStatus, TreatmentJobStatus, ScheduleStatus } from "../types/domain";
import { formatDateTime, formatDate } from "../utils/formatter";
import { AppClock } from "../utils/clock";
import {
  Users,
  CalendarDays,
  ListOrdered,
  Activity,
  ArrowRight,
  Sun,
  Clock,
  Sparkles,
  CalendarRange,
  AlertCircle
} from "lucide-react";

export const Dashboard: React.FC = () => {
  const {
    currentUser,
    selectedBranchId,
    branches,
    patients,
    bookings,
    visits,
    queueItems,
    treatmentJobs,
    doctors,
    doctorSchedules,
    promotions,
    loading,
    error
  } = useApp();

  const { navigate } = useRouter();

  if (!currentUser) return null;

  const isSuper = currentUser.role === UserRole.SUPER_ADMIN;
  // Effective branch context: if branch admin, strictly their assignedBranchId; if super admin, the selectedBranchId (if selected) or null (all branches)
  const effectiveBranchId = isSuper ? selectedBranchId : currentUser.assignedBranchId;

  // Active branch entity if filtered
  const currentBranch = useMemo(() => {
    if (!effectiveBranchId) return null;
    return branches.find((b) => b.id === effectiveBranchId) || null;
  }, [branches, effectiveBranchId]);

  // Current operational date
  const todayStr = useMemo(() => AppClock.todayDateString(), []);
  const todayDateObj = useMemo(() => AppClock.now(), []);

  // Formatted date string for header
  const formattedToday = useMemo(() => {
    const days = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
    const dayName = days[todayDateObj.getDay()];
    return `${dayName}, ${formatDate(todayStr)}`;
  }, [todayDateObj, todayStr]);

  // 1. PASIEN HARI INI (Source: visits filtered by date & branch)
  const todayVisits = useMemo(() => {
    return visits.filter((v) => {
      const vDate = v.visitDateTime ? v.visitDateTime.split("T")[0] : "";
      if (vDate !== todayStr) return false;
      if (effectiveBranchId && v.branchId !== effectiveBranchId) return false;
      return true;
    });
  }, [visits, todayStr, effectiveBranchId]);

  const todayPatientsCount = todayVisits.length;

  // 2. BOOKING HARI INI (Source: bookings filtered by date & branch)
  const todayBookings = useMemo(() => {
    return bookings.filter((b) => {
      const bDate = getOperationalDateString(b.bookingDateTime);
      if (bDate !== todayStr) return false;
      if (effectiveBranchId && b.branchId !== effectiveBranchId) return false;
      return true;
    });
  }, [bookings, todayStr, effectiveBranchId]);

  const todayBookingsCount = todayBookings.length;

  // 3. ANTREAN AKTIF (Source: queueItems filtered by status WAITING / IN_PREPARATION / IN_CONSULTATION & branch)
  const activeQueues = useMemo(() => {
    const activeStatuses = [QueueStatus.WAITING, QueueStatus.IN_PREPARATION, QueueStatus.IN_CONSULTATION];
    return queueItems.filter((q) => {
      if (!activeStatuses.includes(q.status as QueueStatus)) return false;
      if (effectiveBranchId && q.branchId !== effectiveBranchId) return false;
      return true;
    });
  }, [queueItems, effectiveBranchId]);

  const activeQueuesCount = activeQueues.length;

  // 4. TREATMENT BERJALAN (Source: treatmentJobs filtered by DALAM_PROSES & branch)
  const ongoingTreatments = useMemo(() => {
    return treatmentJobs.filter((t) => {
      if (t.status !== TreatmentJobStatus.DALAM_PROSES) return false;
      if (effectiveBranchId && t.branchId !== effectiveBranchId) return false;
      return true;
    });
  }, [treatmentJobs, effectiveBranchId]);

  const ongoingTreatmentsCount = ongoingTreatments.length;

  // 5. PASIEN TERBARU (Source: visits with valid timestamp, sorted newest, linked to PatientProfile)
  const recentPatientsList = useMemo(() => {
    const patientMap = new Map(patients.map((p) => [p.id, p]));
    const branchVisits = visits.filter((v) => {
      if (effectiveBranchId && v.branchId !== effectiveBranchId) return false;
      if (!v.visitDateTime) return false;
      const patient = patientMap.get(v.patientId);
      const patientName = patient?.fullName || patient?.name || "";
      return !/^pasien percobaan(?:\s|$)/i.test(patientName);
    });

    // Sort newest visit first
    const sortedVisits = [...branchVisits].sort((a, b) => {
      return (b.visitDateTime || "").localeCompare(a.visitDateTime || "");
    });

    const branchMap = new Map(branches.map((b) => [b.id, b]));

    return sortedVisits.slice(0, 5).map((v) => {
      const p = patientMap.get(v.patientId);
      const b = branchMap.get(v.branchId);

      // Find if there is an associated treatment job
      const tJob = treatmentJobs.find((t) => t.visitId === v.id);

      return {
        id: v.id,
        patientName: p?.fullName || p?.name || "Pasien",
        rmNumber: p ? getPatientMedicalRecordNumber(p, v.branchId) || "-" : "-",
        serviceName: tJob?.serviceNameSnapshot || v.complaint || "Konsultasi / Kunjungan",
        branchName: b?.name || "Cabang",
        visitDateTime: v.visitDateTime,
        visitType: v.visitType,
        status: v.visitStatus
      };
    });
  }, [visits, patients, branches, treatmentJobs, effectiveBranchId]);

  // 6. JADWAL DOKTER HARI INI (Source: doctorSchedules filtered by todayStr, ACTIVE, and branch)
  const todayDoctorSchedules = useMemo(() => {
    const schedules = doctorSchedules.filter((s) => {
      if (s.date !== todayStr) return false;
      if (s.status !== ScheduleStatus.ACTIVE) return false;
      if (effectiveBranchId && s.branchId !== effectiveBranchId) return false;
      return true;
    });

    const doctorMap = new Map(doctors.map((d) => [d.id, d]));
    const branchMap = new Map(branches.map((b) => [b.id, b]));

    return schedules.map((s) => {
      const doc = doctorMap.get(s.doctorId);
      const br = branchMap.get(s.branchId);
      const photo = doc?.photoUrl || doc?.avatarUrl || doc?.profileImage || null;
      return {
        id: s.id,
        doctorId: s.doctorId,
        doctorName: doc?.name || doc?.fullName || "Dokter Gigi",
        specialization: doc?.specialization || doc?.title || "Dokter Gigi Umum",
        shift: `${s.startTime} - ${s.endTime}`,
        branchName: br?.name || "Cabang",
        photo,
        notes: s.notes || "-"
      };
    });
  }, [doctorSchedules, doctors, branches, todayStr, effectiveBranchId]);

  // 7. AKTIVITAS HARI INI (Source: chronological real events from visits, queues, treatments, bookings for today)
  const todayActivities = useMemo(() => {
    type ActivityItem = {
      id: string;
      title: string;
      description: string;
      isoTime: string;
      category: "Kunjungan" | "Antrean" | "Treatment" | "Booking";
      colorBg: string;
    };

    const items: ActivityItem[] = [];

    // Bookings created or scheduled for today
    todayBookings.forEach((b) => {
      items.push({
        id: `act-bk-${b.id}`,
        title: "Booking Terdaftar",
        description: `${b.patientNameSnapshot || "Pasien"} (${b.complaint || "Pemeriksaan Gigi"})`,
        isoTime: b.bookingDateTime || b.createdAt,
        category: "Booking",
        colorBg: "bg-sky-50 text-sky-700 border-sky-100"
      });
    });

    // Visits today
    todayVisits.forEach((v) => {
      const p = patients.find((pat) => pat.id === v.patientId);
      const name = p?.fullName || p?.name || "Pasien";
      items.push({
        id: `act-vs-${v.id}`,
        title: v.visitType === "WALK_IN" ? "Kunjungan Walk-In" : "Kedatangan Booking",
        description: `${name} — Keluhan: ${v.complaint || "Pemeriksaan"}`,
        isoTime: v.visitDateTime || v.createdAt,
        category: "Kunjungan",
        colorBg: "bg-blue-50 text-blue-700 border-blue-100"
      });
    });

    // Active queues today
    activeQueues.forEach((q) => {
      items.push({
        id: `act-qu-${q.id}`,
        title: `Antrean ${q.queueNumber}`,
        description: `${q.patientNameSnapshot || "Pasien"} — Status: ${q.status}`,
        isoTime: q.arrivalAt || q.createdAt,
        category: "Antrean",
        colorBg: "bg-amber-50 text-amber-700 border-amber-100"
      });
    });

    // Ongoing treatments today
    ongoingTreatments.forEach((t) => {
      items.push({
        id: `act-tr-${t.id}`,
        title: "Tindakan Berjalan",
        description: `${t.serviceNameSnapshot} — Drg: ${t.doctorNameSnapshot}`,
        isoTime: t.startedAt || t.createdAt,
        category: "Treatment",
        colorBg: "bg-emerald-50 text-emerald-700 border-emerald-100"
      });
    });

    // Sort descending by time
    items.sort((a, b) => b.isoTime.localeCompare(a.isoTime));
    return items.slice(0, 6);
  }, [todayBookings, todayVisits, activeQueues, ongoingTreatments, patients]);

  // PROMO & EVENT KLINIK (Source: promotions, filtered by isActive and branch scope: GLOBAL or effectiveBranchId)
  const activePromotions = useMemo(() => {
    return promotions.filter((p) => {
      if (!p.isActive) return false;
      if (!effectiveBranchId) return true;
      return !p.branchId || p.branchId === effectiveBranchId;
    });
  }, [promotions, effectiveBranchId]);

  // Handle route redirection based on role
  const handleViewAllPatients = () => {
    navigate(isSuper ? "/super-admin/patients" : "/branch-admin/patients");
  };

  const handleViewAllQueue = () => {
    navigate(isSuper ? "/super-admin/queue" : "/branch-admin/queue");
  };

  const handleViewAllTreatments = () => {
    navigate(isSuper ? "/super-admin/treatments" : "/branch-admin/treatments");
  };

  const handleViewAllBookings = () => {
    navigate(isSuper ? "/super-admin/bookings" : "/branch-admin/bookings");
  };

  const displayName = currentUser.name.replace(/ \((Super Admin|Admin .*|Dokter .*|Pasien)\)/g, "");

  return (
    <div
      className="min-h-full space-y-5 bg-[linear-gradient(145deg,#fbf8f0_0%,#fffdf9_52%,#f8f3e8_100%)] p-4 sm:p-6"
      id="dashboard-view"
    >
      
      {/* SUPABASE PROFILE NOTICE */}
      {currentUser.isMockFallback && (
        <div className="p-5 bg-amber-50 border border-amber-200 rounded-2xl shadow-sm text-slate-800 space-y-3">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h3 className="font-bold text-amber-900 text-sm">Pemberitahuan Status Profil Akun Administrator</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Akun email <strong className="text-amber-800 font-semibold">{currentUser.email || "superadmin@laladentist.id"}</strong> terautentikasi melalui Supabase Auth, namun pemetaan profil resmi di tabel database <code className="bg-amber-100/60 px-1 py-0.5 rounded text-amber-900 font-mono text-[11px]">public.user_accounts</code> belum terkonfigurasi pada database server.
              </p>
              <p className="text-xs text-slate-600 leading-relaxed">
                Untuk menjaga integritas dan keamanan Row Level Security (RLS), pastikan akun Super Admin resmi (<code className="font-mono text-amber-900 font-semibold">superadmin@laladentist.id</code>) telah terdaftar dan dipetakan dengan role yang sesuai oleh Database Administrator melalui prosedur migrasi resmi.
              </p>
            </div>
          </div>
        </div>
      )}
      
      {/* ERROR ALERT STATE */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-center gap-3 text-rose-700 text-xs font-semibold">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>Gagal memuat data operasional: {error}</span>
        </div>
      )}

      <header className="relative isolate flex min-h-28 flex-col gap-4 overflow-hidden rounded-2xl border border-[#d8bd7d] bg-gradient-to-r from-[#e7d199] via-[#d6b866] to-[#f2e3b8] p-5 shadow-[0_8px_24px_rgba(138,111,39,0.16)] sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="pointer-events-none absolute -right-10 -top-20 -z-10 h-56 w-56 rounded-full bg-white/35 blur-3xl" />
        <div className="pointer-events-none absolute right-4 top-1/2 hidden -translate-y-1/2 text-[#80651f]/15 sm:block">
          <Users className="h-36 w-36 -rotate-12" strokeWidth={1.1} aria-hidden="true" />
        </div>
        <div className="relative flex min-w-0 items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-white/70 bg-gradient-to-br from-[#fffdf8] to-[#e6c875] text-[#8a6f27] shadow-[0_3px_10px_rgba(138,111,39,0.2)] sm:h-[68px] sm:w-[68px]">
            <Sun className="h-6 w-6 sm:h-7 sm:w-7" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/70 bg-white/70 text-[#9b7625]">
                <CalendarDays className="h-4 w-4" />
              </span>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#735b20]">Dashboard Klinik</p>
              {currentBranch && (
                <span className="rounded-full border border-white/60 bg-white/65 px-2.5 py-1 text-[10px] font-bold text-[#735b20]">
                  {currentBranch.name}
                </span>
              )}
            </div>
            <h1 className="mt-1 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
              Selamat Datang, {displayName}
            </h1>
            <p className="mt-1 text-sm text-[#594a2b]">Ringkasan operasional dan aktivitas klinik · {formattedToday}</p>
          </div>
        </div>
        <div className="relative z-10 flex shrink-0 items-center gap-3 rounded-xl border border-white/60 bg-white/75 p-3.5 shadow-sm">
          <div className="rounded-xl bg-[#faf6ec] p-2 text-[#8a6f27]">
            <CalendarRange className="h-5 w-5" />
          </div>
          <div className="text-xs">
            <p className="font-extrabold text-slate-900">{formattedToday}</p>
            <span className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-[#80651f]">
              <Clock className="h-3.5 w-3.5" /> Operasional Aktif
            </span>
          </div>
        </div>
      </header>

      {/* 2. OPERATIONAL SUMMARY: 4 KEY OPERATIONAL KPI CARDS */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        
        {/* KPI 1: Pasien Hari Ini */}
        <div
          onClick={handleViewAllPatients}
          className="group relative flex cursor-pointer flex-col justify-between overflow-hidden rounded-2xl border border-[#eadfc7] bg-white p-5 shadow-[0_8px_24px_rgba(138,111,39,0.06)] transition-all hover:-translate-y-0.5 hover:border-[#d8bd7d] hover:shadow-md"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Pasien Hari Ini</span>
            <div className="shrink-0 rounded-xl bg-[#faf6ec] p-2 text-[#9b7625]">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <p className="text-3xl font-black text-[#17233C]">{loading ? "..." : todayPatientsCount}</p>
          </div>
          <div className="flex items-center justify-between mt-3 border-t border-slate-50 pt-3 text-[10px] text-slate-400 font-medium">
            <span>Kunjungan tercatat hari ini</span>
            <span className="flex items-center gap-0.5 font-bold text-[#9b7625] transition-transform group-hover:translate-x-0.5">
              Lihat <ArrowRight className="w-3 h-3" />
            </span>
          </div>
        </div>

        {/* KPI 2: Antrean Aktif */}
        <div
          onClick={handleViewAllQueue}
          className="group relative flex cursor-pointer flex-col justify-between overflow-hidden rounded-2xl border border-[#eadfc7] bg-white p-5 shadow-[0_8px_24px_rgba(138,111,39,0.06)] transition-all hover:-translate-y-0.5 hover:border-[#d8bd7d] hover:shadow-md"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Antrean Aktif</span>
            <div className="shrink-0 rounded-xl bg-orange-50 p-2 text-orange-600">
              <ListOrdered className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <p className="text-3xl font-black text-[#17233C]">{loading ? "..." : activeQueuesCount}</p>
          </div>
          <div className="flex items-center justify-between mt-3 border-t border-slate-50 pt-3 text-[10px] text-slate-400 font-medium">
            <span>Menunggu & Di Ruang Periksa</span>
            <span className="flex items-center gap-0.5 font-bold text-orange-600 transition-transform group-hover:translate-x-0.5">
              Kelola <ArrowRight className="w-3 h-3" />
            </span>
          </div>
        </div>

        {/* KPI 3: Booking Hari Ini */}
        <div
          onClick={handleViewAllBookings}
          className="group relative flex cursor-pointer flex-col justify-between overflow-hidden rounded-2xl border border-[#eadfc7] bg-white p-5 shadow-[0_8px_24px_rgba(138,111,39,0.06)] transition-all hover:-translate-y-0.5 hover:border-[#d8bd7d] hover:shadow-md"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Booking Hari Ini</span>
            <div className="shrink-0 rounded-xl bg-cyan-50 p-2 text-cyan-700">
              <CalendarDays className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <p className="text-3xl font-black text-[#17233C]">{loading ? "..." : todayBookingsCount}</p>
          </div>
          <div className="flex items-center justify-between mt-3 border-t border-slate-50 pt-3 text-[10px] text-slate-400 font-medium">
            <span>Reservasi terjadwal hari ini</span>
            <span className="flex items-center gap-0.5 font-bold text-cyan-700 transition-transform group-hover:translate-x-0.5">
              Jadwal <ArrowRight className="w-3 h-3" />
            </span>
          </div>
        </div>

        {/* KPI 4: Treatment Berjalan */}
        <div
          onClick={handleViewAllTreatments}
          className="group relative flex cursor-pointer flex-col justify-between overflow-hidden rounded-2xl border border-[#eadfc7] bg-white p-5 shadow-[0_8px_24px_rgba(138,111,39,0.06)] transition-all hover:-translate-y-0.5 hover:border-[#d8bd7d] hover:shadow-md"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Treatment Berjalan</span>
            <div className="shrink-0 rounded-xl bg-emerald-50 p-2 text-emerald-700">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <p className="text-3xl font-black text-[#17233C]">{loading ? "..." : ongoingTreatmentsCount}</p>
          </div>
          <div className="flex items-center justify-between mt-3 border-t border-slate-50 pt-3 text-[10px] text-slate-400 font-medium">
            <span>Sedang ditangani di dental chair</span>
            <span className="flex items-center gap-0.5 font-bold text-emerald-700 transition-transform group-hover:translate-x-0.5">
              Detail <ArrowRight className="w-3 h-3" />
            </span>
          </div>
        </div>

      </div>

      {/* 3. CORE CONTENT GRID SYSTEM (Left: Pasien Terbaru & Jadwal Dokter | Middle: Aktivitas Hari Ini | Right: Promo & Event) */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        
        {/* ==================== LEFT COLUMN (5/12 WIDTH) ==================== */}
        <div className="xl:col-span-5 space-y-6">
          
          {/* A. Pasien Terbaru List Card */}
          <section className="rounded-2xl border border-[#eadfc7] bg-white p-5 shadow-[0_8px_24px_rgba(138,111,39,0.06)] sm:p-6">
            <div className="mb-4 flex items-center justify-between border-b border-[#f1eadb] pb-4">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#eadbb9] bg-[#faf6ec] text-[#8a6f27]">
                  <Users className="h-4 w-4" />
                </span>
                <div>
                <h2 className="text-sm font-bold text-slate-900">Pasien Terbaru</h2>
                <p className="text-[10px] text-slate-400 font-medium mt-0.5">Riwayat kunjungan terbaru pada cabang aktif</p>
                </div>
              </div>
              <button
                onClick={handleViewAllPatients}
                className="flex items-center gap-1 rounded-full bg-gradient-to-r from-[#9b7625] to-[#c5a059] px-3.5 py-2 text-[11px] font-bold text-white shadow-sm transition hover:from-[#80651f] hover:to-[#a98232] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c5a059] focus-visible:ring-offset-2"
              >
                Lihat Semua <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {loading ? (
              <div className="py-8 text-center text-xs text-slate-400 font-medium">Memuat pasien terbaru...</div>
            ) : recentPatientsList.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs font-medium bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                Belum ada pasien terbaru.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-[#eee4cf]">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-[#eee4cf] bg-[#fcfaf5] text-slate-500 font-bold uppercase tracking-wider text-[9px]">
                      <th className="py-2.5 px-3">No</th>
                      <th className="py-2.5 px-3">Nama Pasien</th>
                      <th className="py-2.5 px-3">Layanan / Keluhan</th>
                      <th className="py-2.5 px-3">Waktu</th>
                      <th className="py-2.5 px-3 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentPatientsList.map((p, idx) => (
                      <tr key={p.id} className="border-b border-[#f1eadb] transition-colors hover:bg-[#fcfaf5]">
                        <td className="py-3 px-3 font-semibold text-slate-400">{idx + 1}</td>
                        <td className="py-3 px-3">
                          <p className="font-bold text-[#17233C]">{p.patientName}</p>
                          <span className="text-[9px] text-slate-400 font-semibold">{p.rmNumber}</span>
                        </td>
                        <td className="py-3 px-3 text-slate-600 font-medium truncate max-w-[140px]">{p.serviceName}</td>
                        <td className="py-3 px-3 text-slate-400 font-medium text-[10px]">
                          {formatDateTime(p.visitDateTime)}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <span className="inline-block px-2 py-0.5 rounded-full font-bold text-[9px] border bg-slate-50 text-slate-700 border-slate-200">
                            {p.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* B. Jadwal Dokter Hari Ini Card */}
          <section className="rounded-2xl border border-[#eadfc7] bg-white p-5 shadow-[0_8px_24px_rgba(138,111,39,0.06)] sm:p-6">
            <div className="mb-4 flex items-center justify-between border-b border-[#f1eadb] pb-4">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#eadbb9] bg-[#faf6ec] text-[#8a6f27]">
                  <CalendarDays className="h-4 w-4" />
                </span>
                <div>
                <h2 className="text-sm font-bold text-slate-900">Jadwal Dokter Hari Ini</h2>
                <p className="text-[10px] text-slate-400 font-medium mt-0.5">Dokter bertugas sesuai jadwal operasional</p>
                </div>
              </div>
            </div>

            {loading ? (
              <div className="py-8 text-center text-xs text-slate-400 font-medium">Memuat jadwal dokter...</div>
            ) : todayDoctorSchedules.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs font-medium bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                Belum ada jadwal dokter hari ini.
              </div>
            ) : (
              <div className="space-y-3">
                {todayDoctorSchedules.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between rounded-xl border border-[#eee4cf] bg-[#fcfaf5] p-3 transition-colors hover:border-[#d8bd7d] hover:bg-[#faf6ec]"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#ebd4a8] to-[#c5a059] flex items-center justify-center text-[#17233C] font-black text-xs border border-white shrink-0 overflow-hidden shadow-2xs">
                        {doc.photo ? (
                          <img
                            src={doc.photo}
                            alt={doc.doctorName}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = "none";
                            }}
                          />
                        ) : (
                          <span>{doc.doctorName.replace(/^(drg\.|dr\.)\s*/i, "").charAt(0) || "D"}</span>
                        )}
                      </div>
                      <div>
                        <p className="font-extrabold text-[#17233C] text-[11px]">{doc.doctorName}</p>
                        <p className="text-[9px] text-slate-400 font-bold mt-0.5">{doc.specialization}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 text-right shrink-0">
                      <span className="text-[10px] text-slate-600 font-bold flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-400" /> {doc.shift}
                      </span>
                      <span className="text-[9px] text-slate-400 font-medium">{doc.branchName}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

        </div>

        {/* ==================== MIDDLE COLUMN (4/12 WIDTH) ==================== */}
        <div className="xl:col-span-4 space-y-6">
          
          {/* C. Aktivitas Hari Ini (Timeline) */}
          <section className="rounded-2xl border border-[#eadfc7] bg-white p-5 shadow-[0_8px_24px_rgba(138,111,39,0.06)] sm:p-6">
            <div className="mb-4 flex items-center justify-between border-b border-[#f1eadb] pb-4">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#eadbb9] bg-[#faf6ec] text-[#8a6f27]">
                  <Activity className="h-4 w-4" />
                </span>
                <div>
                <h2 className="text-sm font-bold text-slate-900">Aktivitas Hari Ini</h2>
                <p className="text-[10px] text-slate-400 font-medium mt-0.5">Kronologi kejadian operasional klinik</p>
                </div>
              </div>
            </div>

            {loading ? (
              <div className="py-8 text-center text-xs text-slate-400 font-medium">Memuat aktivitas...</div>
            ) : todayActivities.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs font-medium bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                Belum ada aktivitas hari ini.
              </div>
            ) : (
              <div className="relative border-l border-slate-100 pl-4 ml-2.5 space-y-4">
                {todayActivities.map((act) => (
                  <div key={act.id} className="relative group">
                    {/* Timeline bullet dot */}
                    <div className="absolute -left-[22.5px] top-1.5 w-4 h-4 rounded-full bg-white border-2 border-[#ebd4a8] flex items-center justify-center">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#c5a059]"></span>
                    </div>
                    <div className="flex items-start justify-between gap-3 rounded-xl border border-[#eee4cf] bg-[#fcfaf5] p-2.5 transition-all hover:border-[#d8bd7d]">
                      <div>
                        <p className="font-extrabold text-[#17233C] text-[11px]">{act.title}</p>
                        <p className="text-[10px] text-slate-500 mt-0.5 font-medium leading-relaxed">{act.description}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1.5 shrink-0 text-right">
                        <span className="text-[9px] text-slate-400 font-bold">
                          {act.isoTime && act.isoTime.includes("T") ? act.isoTime.split("T")[1].slice(0, 5) : "-"}
                        </span>
                        <span className={`px-2 py-0.5 rounded-md text-[8px] font-bold border ${act.colorBg}`}>
                          {act.category}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

        </div>

        {/* ==================== RIGHT COLUMN (3/12 WIDTH) ==================== */}
        <div className="xl:col-span-3 space-y-6">
          
          {/* D. Promo & Event Klinik Widget (Source: PromotionRepository / promotions) */}
          <section className="relative flex min-h-[22rem] flex-col justify-between overflow-hidden rounded-2xl border border-[#d6b96f] bg-gradient-to-br from-[#17233C] via-[#21304C] to-[#8a6f27] p-5 text-white shadow-[0_12px_30px_rgba(44,37,21,0.18)]">
            
            {/* Absolute Decorative Curved Gold Ribbon */}
            <div className="absolute right-0 bottom-0 w-32 h-32 bg-gradient-to-tr from-[#ebd4a8]/35 to-transparent rounded-full -mr-8 -mb-8 blur-2xl pointer-events-none" />
            <div className="absolute left-0 top-0 w-16 h-16 bg-[#ebd4a8]/10 rounded-full blur-xl pointer-events-none" />
            
            <div className="relative z-10">
              <span className="text-[#ebd4a8] text-[8px] font-black uppercase tracking-widest bg-white/10 px-2 py-0.5 rounded-full inline-block mb-3 border border-white/10">
                PROMO & EVENT KLINIK
              </span>

              {activePromotions.length > 0 ? (
                <div>
                  {activePromotions[0].imageUrl && (
                    <img
                      src={activePromotions[0].imageUrl}
                      alt={activePromotions[0].title || "Promosi klinik"}
                      loading="lazy"
                      className="mb-3 h-32 w-full rounded-xl border border-white/15 object-cover"
                    />
                  )}
                  <h3 className="text-sm font-black text-white leading-snug tracking-tight">
                    {activePromotions[0].title}
                  </h3>
                  <p className="text-[10px] text-slate-300 font-medium mt-1.5 leading-relaxed">
                    {activePromotions[0].description || "Dapatkan perawatan kesehatan gigi terbaik di Lala Dentist."}
                  </p>
                </div>
              ) : (
                <div className="py-4">
                  <h3 className="text-sm font-black text-white leading-snug tracking-tight">
                    Belum ada promo aktif
                  </h3>
                  <p className="text-[10px] text-slate-300 font-medium mt-1.5 leading-relaxed">
                    Nantikan program promo dan penawaran spesial klinik berikutnya.
                  </p>
                </div>
              )}
            </div>

            {/* Three key pillars */}
            <div className="relative z-10 mt-6 pt-4 border-t border-white/10 grid grid-cols-3 gap-1 text-center">
              <div>
                <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center mx-auto mb-1 text-[#ebd4a8]">
                  <Sparkles className="w-3.5 h-3.5" />
                </div>
                <p className="text-[7.5px] font-bold leading-tight text-slate-200">Pelayanan Profesional</p>
              </div>
              <div>
                <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center mx-auto mb-1 text-[#ebd4a8]">
                  <Activity className="w-3.5 h-3.5" />
                </div>
                <p className="text-[7.5px] font-bold leading-tight text-slate-200">Teknologi Modern</p>
              </div>
              <div>
                <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center mx-auto mb-1 text-[#ebd4a8]">
                  <Users className="w-3.5 h-3.5" />
                </div>
                <p className="text-[7.5px] font-bold leading-tight text-slate-200">Tim Berpengalaman</p>
              </div>
            </div>

          </section>

        </div>

      </div>

      {/* Footer Branding line */}
      <div className="flex flex-col sm:flex-row items-center justify-between text-[10px] text-slate-400 font-medium pt-6 border-t border-slate-100 gap-2">
        <span>Lala Dentist Web Admin <span className="font-bold text-slate-400">v1.0.0</span></span>
        <div className="flex items-center gap-1.5">
          <span>Sistem Manajemen Klinik Gigi</span>
          <span>|</span>
          <span className="font-semibold">© 2026 Lala Dentist</span>
        </div>
      </div>

    </div>
  );
};
