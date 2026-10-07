import React, { useState, useEffect, useMemo } from "react";
import { useApp } from "../context/AppContext";
import {
  Booking,
  BookingConfirmationH1,
  ConfirmationStatusH1,
  BookingStatus,
  UserRole
} from "../types/domain";
import {
  getTomorrowDateString,
  getTodayDateString,
  getDayAfterTomorrowDateString,
  formatIndonesianDate
} from "../utils/dateUtils";
import {
  PhoneCall,
  MessageSquare,
  CheckCircle2,
  Clock,
  XCircle,
  Calendar,
  AlertCircle,
  Search,
  Filter,
  User,
  Building2,
  Stethoscope,
  ExternalLink,
  Edit3,
  History,
  RefreshCw,
  HelpCircle,
  ArrowRight
} from "lucide-react";

export const H1ConfirmationPage: React.FC = () => {
  const { repos, currentUser, selectedBranchId, branches, patients } = useApp();

  // Selected date for H-1 workflow (defaults to operational tomorrow date)
  const [targetDateStr, setTargetDateStr] = useState<string>(getTomorrowDateString());
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [doctorFilter, setDoctorFilter] = useState<string>("ALL");
  const [branchFilter, setBranchFilter] = useState<string>("ALL");

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [confirmations, setConfirmations] = useState<Record<string, BookingConfirmationH1>>({});
  const [loading, setLoading] = useState<boolean>(true);

  // Modal State for updating H-1 status
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [selectedConf, setSelectedConf] = useState<BookingConfirmationH1 | null>(null);
  const [updateStatus, setUpdateStatus] = useState<ConfirmationStatusH1>(ConfirmationStatusH1.SUDAH_DIHUBUNGI);
  const [updateNotes, setUpdateNotes] = useState<string>("");
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Active user branch restriction
  const effectiveBranchId = currentUser?.role === UserRole.BRANCH_ADMIN ? currentUser.assignedBranchId : (branchFilter !== "ALL" ? branchFilter : selectedBranchId);

  const loadData = async () => {
    setLoading(true);
    try {
      const results = await Promise.allSettled([
        repos.booking.getBookingsByDate(
          targetDateStr,
          effectiveBranchId || undefined,
          currentUser?.role,
          currentUser?.assignedBranchId
        ),
        repos.h1.listH1Confirmations(
          effectiveBranchId || undefined,
          currentUser?.role,
          currentUser?.assignedBranchId
        )
      ]);

      const bkList = results[0].status === "fulfilled" ? results[0].value : [];
      const confList = results[1].status === "fulfilled" ? results[1].value : [];

      const confMap: Record<string, BookingConfirmationH1> = {};
      confList.forEach((c) => {
        confMap[c.bookingId] = c;
      });

      // Ensure every booking has an initialized confirmation object if missing
      for (const b of bkList) {
        if (!confMap[b.id]) {
          try {
            const initialized = await repos.h1.getH1Confirmation(b.id);
            if (initialized) confMap[b.id] = initialized;
          } catch {
            // ignore initialization error
          }
        }
      }

      setBookings(bkList);
      setConfirmations(confMap);
    } catch (err: any) {
      console.error("Error loading H-1 data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [targetDateStr, effectiveBranchId]);

  // Derived filtered items
  const filteredItems = useMemo(() => {
    return bookings.filter((b) => {
      // Exclude cancelled bookings from H-1 task list if desired or show them clearly
      if (b.status === BookingStatus.CANCELLED) return false;

      const conf = confirmations[b.id];
      const confStatus = conf?.status || conf?.confirmationStatus || ConfirmationStatusH1.BELUM_DIHUBUNGI;

      // Status filter
      if (statusFilter !== "ALL" && confStatus !== statusFilter) {
        return false;
      }

      // Doctor filter
      if (doctorFilter !== "ALL" && b.doctorId !== doctorFilter) {
        return false;
      }

      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const pName = (b.patientNameSnapshot || "").toLowerCase();
        const dName = (b.doctorNameSnapshot || "").toLowerCase();
        const notes = (b.notes || "").toLowerCase();
        const confNotes = (conf?.notes || "").toLowerCase();

        // Also search in patient profile phone
        const patientObj = patients.find((p) => p.id === b.patientId);
        const phone = patientObj?.phone || "";

        return (
          pName.includes(q) ||
          dName.includes(q) ||
          notes.includes(q) ||
          confNotes.includes(q) ||
          phone.includes(q)
        );
      }

      return true;
    });
  }, [bookings, confirmations, statusFilter, doctorFilter, searchQuery, patients]);

  // Metrics summary counts
  const counts = useMemo(() => {
    let belum = 0;
    let sudah = 0;
    let dikonfirmasi = 0;
    let reschedule = 0;
    let batal = 0;
    let noResponse = 0;

    bookings.forEach((b) => {
      if (b.status === BookingStatus.CANCELLED) return;
      const conf = confirmations[b.id];
      const st = conf?.status || conf?.confirmationStatus || ConfirmationStatusH1.BELUM_DIHUBUNGI;

      if (st === ConfirmationStatusH1.BELUM_DIHUBUNGI) belum++;
      else if (st === ConfirmationStatusH1.SUDAH_DIHUBUNGI) sudah++;
      else if (st === ConfirmationStatusH1.DIKONFIRMASI) dikonfirmasi++;
      else if (st === ConfirmationStatusH1.MINTA_RESCHEDULE) reschedule++;
      else if (st === ConfirmationStatusH1.BATAL) batal++;
      else if (st === ConfirmationStatusH1.TIDAK_MERESPONS) noResponse++;
    });

    return {
      total: bookings.filter((b) => b.status !== BookingStatus.CANCELLED).length,
      belum,
      sudah,
      dikonfirmasi,
      reschedule,
      batal,
      noResponse
    };
  }, [bookings, confirmations]);

  const handleOpenModal = (b: Booking) => {
    const conf = confirmations[b.id] || null;
    setSelectedBooking(b);
    setSelectedConf(conf);
    setUpdateStatus(conf?.status || conf?.confirmationStatus || ConfirmationStatusH1.SUDAH_DIHUBUNGI);
    setUpdateNotes(conf?.notes || "");
    setIsModalOpen(true);
    setFeedbackMsg(null);
  };

  const handleSaveH1Status = async () => {
    if (!selectedBooking) return;
    setIsSubmitting(true);
    setFeedbackMsg(null);

    try {
      const updated = await repos.h1.updateH1Confirmation(
        selectedBooking.id,
        {
          status: updateStatus,
          confirmationStatus: updateStatus,
          notes: updateNotes
        },
        currentUser?.id
      );

      setConfirmations((prev) => ({
        ...prev,
        [selectedBooking.id]: updated
      }));

      setFeedbackMsg({
        type: "success",
        text: `Status H-1 berhasil diperbarui menjadi ${updateStatus}`
      });

      setTimeout(() => {
        setIsModalOpen(false);
      }, 700);
    } catch (err: any) {
      setFeedbackMsg({
        type: "error",
        text: err.message || "Gagal memperbarui status H-1"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper to construct WhatsApp link
  const getWhatsAppLink = (booking: Booking) => {
    const patientObj = patients.find((p) => p.id === booking.patientId);
    let phone = patientObj?.phone || "";
    if (!phone) return "#";

    // Clean phone number format for WhatsApp (convert 08... to 628...)
    phone = phone.replace(/[^0-9]/g, "");
    if (phone.startsWith("0")) {
      phone = "62" + phone.slice(1);
    }

    const patientName = patientObj?.fullName || booking.patientNameSnapshot || "Kak";
    const branchName = booking.branchNameSnapshot || "Lala Dentist";
    const doctorName = booking.doctorNameSnapshot || "Dokter Gigi";
    const bookingTime = booking.bookingDateTime.split("T")[1]?.substring(0, 5) || "10:00";
    const formattedDate = formatIndonesianDate(booking.bookingDateTime.split("T")[0]);

    const msg = `Halo Kak ${patientName}, kami dari Klinik Gigi Lala Dentist Cabang ${branchName}.\n\nKami ingin melakukan konfirmasi jadwal kunjungan periksa Kakak untuk besok:\n📅 Hari/Tgl: ${formattedDate}\n⏰ Jam: ${bookingTime} WIB\n👨‍⚕️ Dokter: ${doctorName}\n\nApakah Kakak mengonfirmasi akan hadir tepat waktu besok? Jika ingin melakukan penyesuaian jadwal, mohon kabari kami ya Kak. Terima kasih! 🙏`;

    return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
  };

  const getStatusBadge = (status: ConfirmationStatusH1) => {
    switch (status) {
      case ConfirmationStatusH1.BELUM_DIHUBUNGI:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200" id={`status-badge-${status}`}>
            <Clock className="w-3.5 h-3.5 text-amber-500" />
            Belum Dihubungi
          </span>
        );
      case ConfirmationStatusH1.SUDAH_DIHUBUNGI:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-sky-50 text-sky-700 border border-sky-200" id={`status-badge-${status}`}>
            <PhoneCall className="w-3.5 h-3.5 text-sky-500" />
            Sudah Dihubungi
          </span>
        );
      case ConfirmationStatusH1.DIKONFIRMASI:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200" id={`status-badge-${status}`}>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            Dikonfirmasi
          </span>
        );
      case ConfirmationStatusH1.MINTA_RESCHEDULE:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200" id={`status-badge-${status}`}>
            <Calendar className="w-3.5 h-3.5 text-purple-500" />
            Minta Reschedule
          </span>
        );
      case ConfirmationStatusH1.BATAL:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200" id={`status-badge-${status}`}>
            <XCircle className="w-3.5 h-3.5 text-rose-500" />
            Batal
          </span>
        );
      case ConfirmationStatusH1.TIDAK_MERESPONS:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200" id={`status-badge-${status}`}>
            <HelpCircle className="w-3.5 h-3.5 text-slate-500" />
            Tidak Merespons
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6 pb-12" id="h1-confirmation-page">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-emerald-600 font-semibold text-xs tracking-wider uppercase mb-1">
            <PhoneCall className="w-4 h-4" />
            Alur Konfirmasi H-1 Klinik
          </div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
            Tugas Harian — Konfirmasi Kunjungan Pasien (H-1)
          </h1>
          <p className="text-slate-500 text-xs mt-1 leading-relaxed max-w-2xl">
            Lakukan verifikasi jadwal periksa untuk besok agar slot praktek dokter efektif, mengantisipasi pembatalan awal, dan meminimalkan tingkat <span className="font-semibold text-slate-700">No-Show</span>.
          </p>
        </div>

        {/* Date Selector & Operational Controls */}
        <div className="flex items-center gap-3 bg-slate-50 p-2.5 rounded-xl border border-slate-200 shrink-0">
          <div className="flex items-center gap-2 text-xs text-slate-600 font-medium pl-1">
            <Calendar className="w-4 h-4 text-emerald-600" />
            <span>Target Tanggal:</span>
          </div>

          <div className="flex gap-1">
            <button
              onClick={() => setTargetDateStr(getTomorrowDateString())}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                targetDateStr === getTomorrowDateString()
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
              }`}
              id="btn-target-tomorrow"
            >
              Besok ({getTomorrowDateString()})
            </button>
            <button
              onClick={() => setTargetDateStr(getTodayDateString())}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                targetDateStr === getTodayDateString()
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
              }`}
              id="btn-target-today"
            >
              Hari Ini
            </button>
            <button
              onClick={() => setTargetDateStr(getDayAfterTomorrowDateString())}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                targetDateStr === getDayAfterTomorrowDateString()
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
              }`}
              id="btn-target-day-after"
            >
              Lusa
            </button>
          </div>
        </div>
      </div>

      {/* Metrics Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div
          onClick={() => setStatusFilter("ALL")}
          className={`p-4 rounded-xl border transition-all cursor-pointer ${
            statusFilter === "ALL"
              ? "bg-slate-900 text-white border-slate-900 shadow-sm"
              : "bg-white text-slate-800 border-slate-200 hover:border-slate-300"
          }`}
          id="card-metric-total"
        >
          <div className="text-xs font-medium opacity-80 mb-1">Total Booking</div>
          <div className="text-2xl font-extrabold">{counts.total}</div>
          <div className="text-[10px] mt-1 opacity-70">Target periksa {targetDateStr}</div>
        </div>

        <div
          onClick={() => setStatusFilter(ConfirmationStatusH1.BELUM_DIHUBUNGI)}
          className={`p-4 rounded-xl border transition-all cursor-pointer ${
            statusFilter === ConfirmationStatusH1.BELUM_DIHUBUNGI
              ? "bg-amber-600 text-white border-amber-600 shadow-sm"
              : "bg-white text-slate-800 border-amber-200 hover:border-amber-300"
          }`}
          id="card-metric-belum"
        >
          <div className="text-xs font-medium text-amber-700 font-semibold mb-1 flex items-center justify-between">
            Belum Dihubungi
            <Clock className="w-3.5 h-3.5" />
          </div>
          <div className="text-2xl font-extrabold text-amber-900">{counts.belum}</div>
          <div className="text-[10px] text-amber-600 font-medium mt-1">Perlu segera di-chat</div>
        </div>

        <div
          onClick={() => setStatusFilter(ConfirmationStatusH1.SUDAH_DIHUBUNGI)}
          className={`p-4 rounded-xl border transition-all cursor-pointer ${
            statusFilter === ConfirmationStatusH1.SUDAH_DIHUBUNGI
              ? "bg-sky-600 text-white border-sky-600 shadow-sm"
              : "bg-white text-slate-800 border-sky-200 hover:border-sky-300"
          }`}
          id="card-metric-sudah"
        >
          <div className="text-xs font-medium text-sky-700 font-semibold mb-1 flex items-center justify-between">
            Sudah Dihubungi
            <PhoneCall className="w-3.5 h-3.5" />
          </div>
          <div className="text-2xl font-extrabold text-sky-900">{counts.sudah}</div>
          <div className="text-[10px] text-sky-600 font-medium mt-1">Menunggu respon pasien</div>
        </div>

        <div
          onClick={() => setStatusFilter(ConfirmationStatusH1.DIKONFIRMASI)}
          className={`p-4 rounded-xl border transition-all cursor-pointer ${
            statusFilter === ConfirmationStatusH1.DIKONFIRMASI
              ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
              : "bg-white text-slate-800 border-emerald-200 hover:border-emerald-300"
          }`}
          id="card-metric-dikonfirmasi"
        >
          <div className="text-xs font-medium text-emerald-700 font-semibold mb-1 flex items-center justify-between">
            Dikonfirmasi
            <CheckCircle2 className="w-3.5 h-3.5" />
          </div>
          <div className="text-2xl font-extrabold text-emerald-900">{counts.dikonfirmasi}</div>
          <div className="text-[10px] text-emerald-600 font-medium mt-1">Siap datang besok</div>
        </div>

        <div
          onClick={() => setStatusFilter(ConfirmationStatusH1.MINTA_RESCHEDULE)}
          className={`p-4 rounded-xl border transition-all cursor-pointer ${
            statusFilter === ConfirmationStatusH1.MINTA_RESCHEDULE
              ? "bg-purple-600 text-white border-purple-600 shadow-sm"
              : "bg-white text-slate-800 border-purple-200 hover:border-purple-300"
          }`}
          id="card-metric-reschedule"
        >
          <div className="text-xs font-medium text-purple-700 font-semibold mb-1 flex items-center justify-between">
            Minta Reschedule
            <Calendar className="w-3.5 h-3.5" />
          </div>
          <div className="text-2xl font-extrabold text-purple-900">{counts.reschedule}</div>
          <div className="text-[10px] text-purple-600 font-medium mt-1">Perlu atur ulang jam</div>
        </div>

        <div
          onClick={() => setStatusFilter(ConfirmationStatusH1.BATAL)}
          className={`p-4 rounded-xl border transition-all cursor-pointer ${
            statusFilter === ConfirmationStatusH1.BATAL
              ? "bg-rose-600 text-white border-rose-600 shadow-sm"
              : "bg-white text-slate-800 border-rose-200 hover:border-rose-300"
          }`}
          id="card-metric-batal"
        >
          <div className="text-xs font-medium text-rose-700 font-semibold mb-1 flex items-center justify-between">
            Batal / No-Resp
            <XCircle className="w-3.5 h-3.5" />
          </div>
          <div className="text-2xl font-extrabold text-rose-900">{counts.batal + counts.noResponse}</div>
          <div className="text-[10px] text-rose-600 font-medium mt-1">Slot dibebaskan</div>
        </div>
      </div>

      {/* Filter Bar & Controls */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between">
        {/* Search */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Cari nama pasien, HP, atau dokter..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
            id="input-search-h1"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Status Dropdown */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            id="select-filter-status"
          >
            <option value="ALL">Semua Status H-1</option>
            <option value={ConfirmationStatusH1.BELUM_DIHUBUNGI}>Belum Dihubungi</option>
            <option value={ConfirmationStatusH1.SUDAH_DIHUBUNGI}>Sudah Dihubungi</option>
            <option value={ConfirmationStatusH1.DIKONFIRMASI}>Dikonfirmasi</option>
            <option value={ConfirmationStatusH1.MINTA_RESCHEDULE}>Minta Reschedule</option>
            <option value={ConfirmationStatusH1.BATAL}>Batal</option>
            <option value={ConfirmationStatusH1.TIDAK_MERESPONS}>Tidak Merespons</option>
          </select>

          {/* Super Admin Branch Filter */}
          {currentUser?.role === UserRole.SUPER_ADMIN && (
            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              id="select-filter-branch"
            >
              <option value="ALL">Semua Cabang Klinik</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}

          <button
            onClick={loadData}
            className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors ml-auto md:ml-0"
            title="Refresh Data"
            id="btn-refresh-h1"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-emerald-600" : ""}`} />
          </button>
        </div>
      </div>

      {/* Main Content Table / List */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500">
            <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin mx-auto mb-3" />
            <p className="text-xs font-medium">Memuat jadwal booking & status H-1...</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 mx-auto mb-3">
              <Calendar className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-800">Tidak ada data booking H-1</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              Tidak ditemukan jadwal reservasi pasien untuk tanggal <span className="font-semibold">{formatIndonesianDate(targetDateStr)}</span> dengan kriteria filter saat ini.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse" id="table-h1-list">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                  <th className="py-3.5 px-4">Jam & Dokter</th>
                  <th className="py-3.5 px-4">Pasien & No HP</th>
                  <th className="py-3.5 px-4">Layanan & Cabang</th>
                  <th className="py-3.5 px-4">Status H-1</th>
                  <th className="py-3.5 px-4">Catatan Konfirmasi</th>
                  <th className="py-3.5 px-4 text-right">Aksi Konfirmasi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredItems.map((b) => {
                  const conf = confirmations[b.id];
                  const confStatus = conf?.status || conf?.confirmationStatus || ConfirmationStatusH1.BELUM_DIHUBUNGI;
                  const patientObj = patients.find((p) => p.id === b.patientId);
                  const waLink = getWhatsAppLink(b);
                  const bookingTime = b.bookingDateTime.split("T")[1]?.substring(0, 5) || "10:00";

                  return (
                    <tr key={b.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Jam & Dokter */}
                      <td className="py-3.5 px-4 align-top">
                        <div className="flex items-center gap-1.5 font-extrabold text-slate-900 text-sm">
                          <Clock className="w-4 h-4 text-emerald-600" />
                          {bookingTime} WIB
                        </div>
                        <div className="flex items-center gap-1 text-slate-600 text-xs mt-1">
                          <Stethoscope className="w-3.5 h-3.5 text-slate-400" />
                          {b.doctorNameSnapshot || "drg. Praktek"}
                        </div>
                      </td>

                      {/* Pasien */}
                      <td className="py-3.5 px-4 align-top">
                        <div className="font-bold text-slate-900 text-sm">
                          {patientObj?.fullName || b.patientNameSnapshot || "Pasien"}
                        </div>
                        <div className="text-slate-500 font-mono text-xs mt-0.5">
                          {patientObj?.phone || "No HP -"}
                        </div>
                        {patientObj?.medicalRecordNumber && (
                          <div className="text-[10px] text-emerald-700 bg-emerald-50 inline-block px-1.5 py-0.5 rounded font-mono mt-1">
                            {patientObj.medicalRecordNumber}
                          </div>
                        )}
                      </td>

                      {/* Layanan & Cabang */}
                      <td className="py-3.5 px-4 align-top">
                        <div className="font-medium text-slate-800">
                          {b.notes || "Pemeriksaan Gigi Konsultasi"}
                        </div>
                        <div className="flex items-center gap-1 text-slate-500 text-[11px] mt-1">
                          <Building2 className="w-3 h-3 text-slate-400" />
                          {b.branchNameSnapshot || "Lala Dentist"}
                        </div>
                      </td>

                      {/* Status H-1 */}
                      <td className="py-3.5 px-4 align-top">
                        {getStatusBadge(confStatus)}
                        {conf?.contactedAt && (
                          <div className="text-[10px] text-slate-400 mt-1">
                            Dihubungi: {new Date(conf.contactedAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                          </div>
                        )}
                      </td>

                      {/* Catatan */}
                      <td className="py-3.5 px-4 align-top max-w-xs">
                        <p className="text-slate-600 text-xs italic bg-slate-50 p-2 rounded border border-slate-100 line-clamp-2">
                          {conf?.notes || b.notes || "Belum ada catatan khusus"}
                        </p>
                      </td>

                      {/* Action Buttons */}
                      <td className="py-3.5 px-4 align-top text-right">
                        <div className="flex items-center justify-end gap-2">
                          {/* WhatsApp Direct Link */}
                          <a
                            href={waLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg text-xs transition-colors shadow-sm"
                            title="Buka WhatsApp dengan pesan template konfirmasi"
                            id={`btn-wa-${b.id}`}
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            Hubungi WA
                            <ExternalLink className="w-3 h-3 opacity-70" />
                          </a>

                          {/* Update Status Button */}
                          <button
                            onClick={() => handleOpenModal(b)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg text-xs transition-colors border border-slate-200"
                            id={`btn-update-status-${b.id}`}
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            Update Status
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Update Status H-1 */}
      {isModalOpen && selectedBooking && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in" id="modal-update-h1">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 border border-slate-100 shadow-xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Update Status Konfirmasi H-1
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Pasien: <span className="font-semibold text-slate-800">{selectedBooking.patientNameSnapshot}</span> ({selectedBooking.bookingDateTime.split("T")[1]?.substring(0, 5)} WIB)
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                ✕
              </button>
            </div>

            {feedbackMsg && (
              <div
                className={`p-3 rounded-lg text-xs font-medium ${
                  feedbackMsg.type === "success"
                    ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                    : "bg-rose-50 text-rose-800 border border-rose-200"
                }`}
              >
                {feedbackMsg.text}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">
                  Pilih Hasil Konfirmasi H-1:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    {
                      status: ConfirmationStatusH1.SUDAH_DIHUBUNGI,
                      label: "Sudah Dihubungi",
                      desc: "WA terkirim, menunggu balasan",
                      color: "border-sky-300 bg-sky-50 text-sky-800"
                    },
                    {
                      status: ConfirmationStatusH1.DIKONFIRMASI,
                      label: "Dikonfirmasi",
                      desc: "Pasien pasti datang besok",
                      color: "border-emerald-300 bg-emerald-50 text-emerald-800"
                    },
                    {
                      status: ConfirmationStatusH1.MINTA_RESCHEDULE,
                      label: "Minta Reschedule",
                      desc: "Pasien minta ganti jadwal",
                      color: "border-purple-300 bg-purple-50 text-purple-800"
                    },
                    {
                      status: ConfirmationStatusH1.TIDAK_MERESPONS,
                      label: "Tidak Merespons",
                      desc: "HP mati / WA tidak dibaca",
                      color: "border-slate-300 bg-slate-100 text-slate-800"
                    },
                    {
                      status: ConfirmationStatusH1.BATAL,
                      label: "Batal Datang",
                      desc: "Pasien membatalkan janji",
                      color: "border-rose-300 bg-rose-50 text-rose-800"
                    },
                    {
                      status: ConfirmationStatusH1.BELUM_DIHUBUNGI,
                      label: "Belum Dihubungi",
                      desc: "Reset status",
                      color: "border-amber-300 bg-amber-50 text-amber-800"
                    }
                  ].map((opt) => (
                    <button
                      key={opt.status}
                      type="button"
                      onClick={() => setUpdateStatus(opt.status)}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        updateStatus === opt.status
                          ? `${opt.color} ring-2 ring-emerald-500 font-bold shadow-xs`
                          : "border-slate-200 bg-white hover:bg-slate-50 text-slate-700"
                      }`}
                    >
                      <div className="text-xs font-bold">{opt.label}</div>
                      <div className="text-[10px] opacity-75 mt-0.5">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Catatan Konfirmasi / Alasan:
                </label>
                <textarea
                  rows={3}
                  value={updateNotes}
                  onChange={(e) => setUpdateNotes(e.target.value)}
                  placeholder="Contoh: Pasien respon via WA bilang oke siap hadir, membawa foto rontgen lama."
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveH1Status}
                disabled={isSubmitting}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-colors shadow-sm disabled:opacity-50"
              >
                {isSubmitting ? "Menyimpan..." : "Simpan Status H-1"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
