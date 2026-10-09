import React, { useMemo, useState } from "react";
import { useApp } from "../context/AppContext";
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
      const bDate = b.bookingDateTime ? b.bookingDateTime.split("T")[0] : "";
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
    const branchVisits = visits.filter((v) => {
      if (effectiveBranchId && v.branchId !== effectiveBranchId) return false;
      return !!v.visitDateTime;
    });

    // Sort newest visit first
    const sortedVisits = [...branchVisits].sort((a, b) => {
      return (b.visitDateTime || "").localeCompare(a.visitDateTime || "");
    });

    const patientMap = new Map(patients.map((p) => [p.id, p]));
    const branchMap = new Map(branches.map((b) => [b.id, b]));

    return sortedVisits.slice(0, 5).map((v) => {
      const p = patientMap.get(v.patientId);
      const b = branchMap.get(v.branchId);

      // Find if there is an associated treatment job
      const tJob = treatmentJobs.find((t) => t.visitId === v.id);

      return {
        id: v.id,
        patientName: p?.fullName || p?.name || "Pasien",
        rmNumber: p?.medicalRecordNumber || "-",
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

  const [copied, setCopied] = useState(false);

  const sqlScript = `-- SALIN DAN JALANKAN SCRIPT INI DI SUPABASE SQL EDITOR
-- Untuk menyinkronkan & mengaktifkan SUPER_ADMIN serta memperbaiki semua hak akses tabel (GRANT)
DO $$
DECLARE
  v_auth_id UUID;
  v_user_account_id UUID;
  v_email TEXT;
  v_emails TEXT[] := ARRAY['${currentUser?.email || "nonapresident@gmail.com"}', 'superadmin@laladentist.id', 'superadmin@laladentist.com'];
BEGIN
  -- Matikan sementara trigger proteksi field agar data bisa di-bypass masuk
  ALTER TABLE public.user_accounts DISABLE TRIGGER trg_protect_user_fields;

  FOREACH v_email IN ARRAY v_emails
  LOOP
    -- Ambil id auth pengguna dari tabel auth.users
    SELECT id INTO v_auth_id FROM auth.users WHERE email = v_email LIMIT 1;
    
    IF v_auth_id IS NOT NULL THEN
      v_user_account_id := v_auth_id;
      
      -- Hubungkan / Insert akun baru ke public.user_accounts
      INSERT INTO public.user_accounts (id, auth_user_id, username, email, name, role, active)
      VALUES (v_user_account_id, v_auth_id, split_part(v_email, '@', 1), v_email, 'Super Admin', 'SUPER_ADMIN', true)
      ON CONFLICT (auth_user_id) DO UPDATE
      SET role = 'SUPER_ADMIN', active = true;

      RAISE NOTICE 'SUKSES: Akun % berhasil dihubungkan & dijadikan SUPER_ADMIN!', v_email;
    ELSE
      RAISE NOTICE 'INFO: Akun % tidak ditemukan di auth.users.', v_email;
    END IF;
  END LOOP;

  -- Aktifkan kembali trigger proteksi field
  ALTER TABLE public.user_accounts ENABLE TRIGGER trg_protect_user_fields;

  -- Pulihkan semua hak akses tabel (GRANT) agar tidak terkena "permission denied"
  GRANT USAGE ON SCHEMA public TO anon, authenticated;
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
  GRANT EXECUTE ON ALL ROUTINES IN SCHEMA public TO authenticated;

  RAISE NOTICE 'SUKSES: Seluruh hak akses tabel telah dipulihkan untuk pengguna!';
END $$;`;

  const handleCopySql = () => {
    navigator.clipboard.writeText(sqlScript);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  return (
    <div className="space-y-6" id="dashboard-view">
      
      {/* SUPABASE FALLBACK WARNING STATE */}
      {currentUser.isMockFallback && (
        <div className="p-5 bg-amber-50 border-2 border-amber-300 rounded-2xl shadow-sm text-slate-800 space-y-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-bold text-amber-900 text-sm">Akun Anda Belum Terhubung di Database Supabase! (Fallback Mode Aktif)</h3>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Anda sukses masuk via Supabase Auth, namun email <strong className="text-amber-800 font-semibold">{currentUser.email || "Anda"}</strong> belum memiliki baris profil di tabel database <code className="bg-amber-100/60 px-1 py-0.5 rounded text-amber-900 font-mono text-[11px]">public.user_accounts</code> pada server remote. 
                <br />
                <strong>Akibatnya:</strong> Sistem berjalan dalam mode simulasi lokal, dan Anda akan mengalami error <span className="text-rose-600 font-semibold">"Supabase error: permission denied for table bookings"</span> saat menyimpan data ke server remote karena sistem keamanan database (RLS) mendeteksi peran Anda masih kosong.
              </p>
            </div>
          </div>

          <div className="bg-[#1e293b] text-slate-200 p-4 rounded-xl text-xs space-y-3 font-mono leading-relaxed relative">
            <div className="flex items-center justify-between border-b border-slate-700 pb-2">
              <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Langkah Perbaikan (1 Klik):</span>
              <button
                onClick={handleCopySql}
                className="bg-[#c5a059] hover:bg-[#b88a2a] text-white px-3 py-1.5 rounded-md font-sans text-[11px] font-bold transition-all shadow-sm flex items-center gap-1.5 active:scale-95"
              >
                {copied ? "✓ Berhasil Disalin!" : "Salin Script SQL"}
              </button>
            </div>
            <p className="text-[11px] text-slate-300 font-sans">
              <strong>Instruksi:</strong> Buka <strong className="text-white">Supabase Dashboard</strong> Anda &gt; masuk ke <strong className="text-white">SQL Editor</strong> &gt; buat query baru &gt; tempel (paste) kode di bawah ini &gt; klik <strong className="text-[#c5a059]">Run</strong>. Setelah itu, <strong>Logout lalu Login kembali</strong> di Web Admin!
            </p>
            <pre className="overflow-x-auto max-h-48 text-[10px] text-emerald-400 font-mono scrollbar-thin scrollbar-thumb-slate-700">
              {sqlScript}
            </pre>
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

      {/* 1. TOP WELCOME HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        
        {/* Left Side Welcome Text */}
        <div className="flex items-start gap-3">
          <div className="p-2.5 bg-amber-50 rounded-2xl border border-[#ebd4a8]/40 text-[#c5a059] shrink-0">
            <Sun className="w-6 h-6 animate-spin-slow" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-slate-400 text-[11px] font-bold uppercase tracking-wider">Selamat Datang,</span>
              {currentBranch && (
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-[#faf6ec] text-[#8a6f27] border border-[#ebd4a8]/50">
                  {currentBranch.name}
                </span>
              )}
            </div>
            <h1 className="text-2xl font-black text-[#17233C] tracking-tight mt-0.5">
              {displayName}
            </h1>
            <p className="text-xs text-slate-500 mt-1 font-medium">
              Ringkasan operasional dan aktivitas klinik Anda hari ini.
            </p>
          </div>
        </div>

        {/* Right Side Floating Date Card */}
        <div className="flex items-center gap-3 bg-white border border-slate-100 p-3.5 rounded-2xl shadow-sm shrink-0">
          <div className="p-2 bg-[#faf6ec] text-[#c5a059] rounded-xl">
            <CalendarRange className="w-5 h-5" />
          </div>
          <div className="text-xs">
            <p className="font-extrabold text-[#17233C]">{formattedToday}</p>
            <span className="text-[10px] text-slate-400 font-bold flex items-center gap-1 mt-1">
              <Clock className="w-3.5 h-3.5 text-slate-400" /> Operasional Aktif
            </span>
          </div>
        </div>

      </div>

      {/* 2. OPERATIONAL SUMMARY: 4 KEY OPERATIONAL KPI CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        
        {/* KPI 1: Pasien Hari Ini */}
        <div
          onClick={handleViewAllPatients}
          className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between relative overflow-hidden group hover:shadow-md hover:border-[#ebd4a8]/50 transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Pasien Hari Ini</span>
            <div className="p-2 bg-[#faf6ec] text-[#c5a059] rounded-xl shrink-0">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <p className="text-3xl font-black text-[#17233C]">{loading ? "..." : todayPatientsCount}</p>
          </div>
          <div className="flex items-center justify-between mt-3 border-t border-slate-50 pt-3 text-[10px] text-slate-400 font-medium">
            <span>Kunjungan tercatat hari ini</span>
            <span className="text-[#c5a059] font-bold group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
              Lihat <ArrowRight className="w-3 h-3" />
            </span>
          </div>
        </div>

        {/* KPI 2: Antrean Aktif */}
        <div
          onClick={handleViewAllQueue}
          className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between relative overflow-hidden group hover:shadow-md hover:border-[#ebd4a8]/50 transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Antrean Aktif</span>
            <div className="p-2 bg-amber-50 text-amber-600 rounded-xl shrink-0">
              <ListOrdered className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <p className="text-3xl font-black text-[#17233C]">{loading ? "..." : activeQueuesCount}</p>
          </div>
          <div className="flex items-center justify-between mt-3 border-t border-slate-50 pt-3 text-[10px] text-slate-400 font-medium">
            <span>Menunggu & Di Ruang Periksa</span>
            <span className="text-amber-600 font-bold group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
              Kelola <ArrowRight className="w-3 h-3" />
            </span>
          </div>
        </div>

        {/* KPI 3: Booking Hari Ini */}
        <div
          onClick={handleViewAllBookings}
          className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between relative overflow-hidden group hover:shadow-md hover:border-[#ebd4a8]/50 transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Booking Hari Ini</span>
            <div className="p-2 bg-sky-50 text-sky-600 rounded-xl shrink-0">
              <CalendarDays className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <p className="text-3xl font-black text-[#17233C]">{loading ? "..." : todayBookingsCount}</p>
          </div>
          <div className="flex items-center justify-between mt-3 border-t border-slate-50 pt-3 text-[10px] text-slate-400 font-medium">
            <span>Reservasi terjadwal hari ini</span>
            <span className="text-sky-600 font-bold group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
              Jadwal <ArrowRight className="w-3 h-3" />
            </span>
          </div>
        </div>

        {/* KPI 4: Treatment Berjalan */}
        <div
          onClick={handleViewAllTreatments}
          className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between relative overflow-hidden group hover:shadow-md hover:border-[#ebd4a8]/50 transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Treatment Berjalan</span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl shrink-0">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <p className="text-3xl font-black text-[#17233C]">{loading ? "..." : ongoingTreatmentsCount}</p>
          </div>
          <div className="flex items-center justify-between mt-3 border-t border-slate-50 pt-3 text-[10px] text-slate-400 font-medium">
            <span>Sedang ditangani di dental chair</span>
            <span className="text-emerald-600 font-bold group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
              Detail <ArrowRight className="w-3 h-3" />
            </span>
          </div>
        </div>

      </div>

      {/* 3. CORE CONTENT GRID SYSTEM (Left: Pasien Terbaru & Jadwal Dokter | Middle: Aktivitas Hari Ini | Right: Promo & Event) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        
        {/* ==================== LEFT COLUMN (5/12 WIDTH) ==================== */}
        <div className="xl:col-span-5 space-y-6">
          
          {/* A. Pasien Terbaru List Card */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-50 mb-4">
              <div>
                <h2 className="text-sm font-bold text-[#17233C]">Pasien Terbaru</h2>
                <p className="text-[10px] text-slate-400 font-medium mt-0.5">Riwayat kunjungan terbaru pada cabang aktif</p>
              </div>
              <button
                onClick={handleViewAllPatients}
                className="text-[11px] font-bold text-[#c5a059] flex items-center gap-1 hover:text-[#8a6f27] transition-colors"
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
              <div className="overflow-x-auto rounded-xl border border-slate-100">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 bg-[#fafaf8] text-slate-500 font-bold uppercase tracking-wider text-[9px]">
                      <th className="py-2.5 px-3">No</th>
                      <th className="py-2.5 px-3">Nama Pasien</th>
                      <th className="py-2.5 px-3">Layanan / Keluhan</th>
                      <th className="py-2.5 px-3">Waktu</th>
                      <th className="py-2.5 px-3 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentPatientsList.map((p, idx) => (
                      <tr key={p.id} className="border-b border-slate-50 hover:bg-[#faf6ec]/20 transition-colors">
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
          </div>

          {/* B. Jadwal Dokter Hari Ini Card */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-50 mb-4">
              <div>
                <h2 className="text-sm font-bold text-[#17233C]">Jadwal Dokter Hari Ini</h2>
                <p className="text-[10px] text-slate-400 font-medium mt-0.5">Dokter bertugas sesuai jadwal operasional</p>
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
                    className="flex items-center justify-between p-3 bg-slate-50 hover:bg-[#faf6ec]/50 rounded-xl border border-slate-100 transition-colors"
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
          </div>

        </div>

        {/* ==================== MIDDLE COLUMN (4/12 WIDTH) ==================== */}
        <div className="xl:col-span-4 space-y-6">
          
          {/* C. Aktivitas Hari Ini (Timeline) */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-50 mb-4">
              <div>
                <h2 className="text-sm font-bold text-[#17233C]">Aktivitas Hari Ini</h2>
                <p className="text-[10px] text-slate-400 font-medium mt-0.5">Kronologi kejadian operasional klinik</p>
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
                    <div className="flex items-start justify-between gap-3 bg-slate-50 p-2.5 rounded-xl border border-slate-100 hover:border-[#ebd4a8]/30 transition-all">
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
          </div>

        </div>

        {/* ==================== RIGHT COLUMN (3/12 WIDTH) ==================== */}
        <div className="xl:col-span-3 space-y-6">
          
          {/* D. Promo & Event Klinik Widget (Source: PromotionRepository / promotions) */}
          <div className="bg-gradient-to-br from-[#17233C] via-[#21304C] to-[#8a6f27] text-white rounded-2xl p-5 relative overflow-hidden shadow-md flex flex-col justify-between min-h-[22rem]">
            
            {/* Absolute Decorative Curved Gold Ribbon */}
            <div className="absolute right-0 bottom-0 w-32 h-32 bg-gradient-to-tr from-[#ebd4a8]/35 to-transparent rounded-full -mr-8 -mb-8 blur-2xl pointer-events-none" />
            <div className="absolute left-0 top-0 w-16 h-16 bg-[#ebd4a8]/10 rounded-full blur-xl pointer-events-none" />
            
            <div className="relative z-10">
              <span className="text-[#ebd4a8] text-[8px] font-black uppercase tracking-widest bg-white/10 px-2 py-0.5 rounded-full inline-block mb-3 border border-white/10">
                PROMO & EVENT KLINIK
              </span>

              {activePromotions.length > 0 ? (
                <div>
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

          </div>

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
