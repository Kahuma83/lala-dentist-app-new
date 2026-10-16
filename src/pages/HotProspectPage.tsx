import React, { useState, useEffect, useMemo } from "react";
import * as XLSX from "xlsx";
import { useApp } from "../context/AppContext";
import {
  PatientProfile,
  PatientVisit,
  Booking,
  TreatmentJob,
  UserRole,
  VisitStatus,
  BookingStatus
} from "../types/domain";
import {
  Users,
  Phone,
  Calendar,
  Sparkles,
  Download,
  CheckCircle,
  Clock,
  MessageSquare,
  Filter,
  Search,
  Building2,
  ArrowRight,
  FileSpreadsheet,
  AlertCircle,
  Flame,
  Check,
  X
} from "lucide-react";
import { formatRupiah, formatDate } from "../utils/formatter";
import { OperationalHubTabs } from "../components/common/OperationalHubTabs";

interface HotProspectItem {
  id: string;
  patientId: string;
  patientName: string;
  phone: string;
  medicalRecordNumber: string;
  branchId: string;
  branchName: string;
  lastVisitDate: string;
  lastTreatment: string;
  recommendationNotes: string;
  potentialCategory: "KONTROL_ULANG" | "PERAWATAN_LANJUTAN" | "POTENSI_BARU";
  status: "BELUM_DIHUBUNGI" | "SUDAH_DIHUBUNGI" | "JANJI_KUNJUNGAN" | "SELESAI_DEAL" | "BATAL";
  followUpNotes: string;
  lastContactedAt?: string;
}

export const HotProspectPage: React.FC = () => {
  const { currentUser, patients, visits, bookings, treatmentJobs, branches } = useApp();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBranchFilter, setSelectedBranchFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");

  // Local follow-up state persisted in localStorage
  const [prospectStatusMap, setProspectStatusMap] = useState<Record<string, { status: any; notes: string; contactedAt?: string }>>(() => {
    try {
      const saved = localStorage.getItem("lala_hot_prospect_statuses");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Modal for updating follow-up
  const [activeModalItem, setActiveModalItem] = useState<HotProspectItem | null>(null);
  const [editStatus, setEditStatus] = useState<any>("BELUM_DIHUBUNGI");
  const [editNotes, setEditNotes] = useState("");

  useEffect(() => {
    try {
      localStorage.setItem("lala_hot_prospect_statuses", JSON.stringify(prospectStatusMap));
    } catch (e) {
      console.error(e);
    }
  }, [prospectStatusMap]);

  // Compute Hot Prospect List from patient visit history & treatments
  const hotProspects = useMemo(() => {
    const map = new Map<string, HotProspectItem>();

    // Map branch lookup
    const branchMap = new Map(branches.map((b) => [b.id, b.name]));

    // Sort visits descending
    const sortedVisits = [...visits].sort((a, b) => new Date(b.visitDateTime).getTime() - new Date(a.visitDateTime).getTime());

    // Iterate through patients to build hot prospects
    patients.forEach((patient) => {
      const patientVisits = sortedVisits.filter((v) => v.patientId === patient.id);
      const patientBookings = bookings.filter((b) => b.patientId === patient.id);

      if (patientVisits.length === 0 && patientBookings.length === 0) return;

      const lastVisit = patientVisits[0];
      const branchId = lastVisit?.branchId || patientBookings[0]?.branchId || branches[0]?.id || "";
      const branchName = branchMap.get(branchId) || "Cabang Utama";

      // Check if patient has future active booking already
      const hasActiveBooking = patientBookings.some((b) => b.status === BookingStatus.PENDING || b.status === BookingStatus.CONFIRMED);
      if (hasActiveBooking) {
        // Already booked, skip or mark as booked deal
      }

      // Determine potential category based on last visit / treatments
      let potentialCategory: "KONTROL_ULANG" | "PERAWATAN_LANJUTAN" | "POTENSI_BARU" = "KONTROL_ULANG";
      let recommendationNotes = "Kontrol berkala / pembersihan karang gigi rutin (6 bulan sekali).";
      let lastTreatment = lastVisit?.complaint || "Konsultasi & Pemeriksaan Gigi Umum";

      // Check treatment jobs for unfinished / staged treatments
      const patientJobs = treatmentJobs.filter((j) => patientVisits.some((v) => v.id === j.visitId));
      const hasStaged = patientJobs.some((j) => j.status === "BELUM_DIMULAI" || j.status === "DALAM_PROSES");
      if (hasStaged) {
        potentialCategory = "PERAWATAN_LANJUTAN";
        recommendationNotes = "Ada tahapan perawatan lanjutan yang belum diselesaikan pada kunjungan sebelumnya.";
      } else if (patientVisits.length > 1) {
        potentialCategory = "KONTROL_ULANG";
        recommendationNotes = "Pasien reguler dengan riwayat kunjungan berkala. Waktunya recall check-up.";
      } else {
        potentialCategory = "POTENSI_BARU";
        recommendationNotes = "Pasien baru kunjungan pertama, berpotensi diarahkan ke perawatan lanjutan / perawatan estetik.";
      }

      const itemKey = patient.id;
      const customState = prospectStatusMap[itemKey];

      map.set(itemKey, {
        id: itemKey,
        patientId: patient.id,
        patientName: patient.name || patient.fullName || "Tanpa Nama",
        phone: patient.phone || "-",
        medicalRecordNumber: patient.medicalRecordNumber || "-",
        branchId,
        branchName,
        lastVisitDate: lastVisit?.visitDateTime ? lastVisit.visitDateTime.substring(0, 10) : (patientBookings[0]?.bookingDateTime ? patientBookings[0].bookingDateTime.substring(0, 10) : "2026-01-01"),
        lastTreatment,
        recommendationNotes,
        potentialCategory,
        status: customState?.status || "BELUM_DIHUBUNGI",
        followUpNotes: customState?.notes || "",
        lastContactedAt: customState?.contactedAt
      });
    });

    return Array.from(map.values());
  }, [patients, visits, bookings, treatmentJobs, branches, prospectStatusMap]);

  // Filtered items
  const filteredProspects = useMemo(() => {
    let list = hotProspects;

    if (selectedBranchFilter !== "ALL") {
      list = list.filter((p) => p.branchId === selectedBranchFilter);
    }
    if (statusFilter !== "ALL") {
      list = list.filter((p) => p.status === statusFilter);
    }
    if (categoryFilter !== "ALL") {
      list = list.filter((p) => p.potentialCategory === categoryFilter);
    }

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (p) =>
          p.patientName.toLowerCase().includes(q) ||
          p.phone.toLowerCase().includes(q) ||
          p.medicalRecordNumber.toLowerCase().includes(q) ||
          p.lastTreatment.toLowerCase().includes(q)
      );
    }

    return list;
  }, [hotProspects, selectedBranchFilter, statusFilter, categoryFilter, searchQuery]);

  // Statistics
  const stats = useMemo(() => {
    const total = hotProspects.length;
    const belum = hotProspects.filter((p) => p.status === "BELUM_DIHUBUNGI").length;
    const sudah = hotProspects.filter((p) => p.status === "SUDAH_DIHUBUNGI").length;
    const janji = hotProspects.filter((p) => p.status === "JANJI_KUNJUNGAN" || p.status === "SELESAI_DEAL").length;
    return { total, belum, sudah, janji };
  }, [hotProspects]);

  // Excel Export
  const handleExportExcel = () => {
    try {
      const rows = filteredProspects.map((p, idx) => ({
        No: idx + 1,
        "No. RM": p.medicalRecordNumber,
        "Nama Pasien": p.patientName,
        "No. Telepon": p.phone,
        Cabang: p.branchName,
        "Kunjungan Terakhir": p.lastVisitDate,
        "Tindakan Terakhir": p.lastTreatment,
        "Kategori Potensi": p.potentialCategory,
        "Rekomendasi / Catatan": p.recommendationNotes,
        Status: p.status,
        "Catatan Follow-up": p.followUpNotes || "-"
      }));

      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Hot Prospects");

      // Auto-fit column widths
      const colWidths = [
        { wch: 5 },
        { wch: 15 },
        { wch: 25 },
        { wch: 15 },
        { wch: 20 },
        { wch: 18 },
        { wch: 30 },
        { wch: 22 },
        { wch: 35 },
        { wch: 18 },
        { wch: 30 }
      ];
      worksheet["!cols"] = colWidths;

      const dateStr = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(workbook, `hot-prospect-${dateStr}.xlsx`);
    } catch (err) {
      console.error("Failed to export Excel:", err);
      alert("Gagal mengunduh file Excel Hot Prospect.");
    }
  };

  const handleSaveFollowUp = () => {
    if (!activeModalItem) return;
    setProspectStatusMap((prev) => ({
      ...prev,
      [activeModalItem.id]: {
        status: editStatus,
        notes: editNotes,
        contactedAt: new Date().toISOString()
      }
    }));
    setActiveModalItem(null);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "BELUM_DIHUBUNGI":
        return <span className="bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1"><Clock className="w-3 h-3" /> Belum Dihubungi</span>;
      case "SUDAH_DIHUBUNGI":
        return <span className="bg-sky-50 text-sky-700 border border-sky-200 px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1"><Phone className="w-3 h-3" /> Sudah Dihubungi</span>;
      case "JANJI_KUNJUNGAN":
        return <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1"><Calendar className="w-3 h-3" /> Janji Kunjungan</span>;
      case "SELESAI_DEAL":
        return <span className="bg-purple-50 text-purple-700 border border-purple-200 px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Selesai / Deal</span>;
      case "BATAL":
        return <span className="bg-rose-50 text-rose-700 border border-rose-200 px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1"><X className="w-3 h-3" /> Batal</span>;
      default:
        return null;
    }
  };

  const getCategoryBadge = (cat: string) => {
    switch (cat) {
      case "PERAWATAN_LANJUTAN":
        return <span className="bg-indigo-50 text-indigo-700 font-medium px-2 py-0.5 rounded text-[11px]">Perawatan Lanjutan</span>;
      case "KONTROL_ULANG":
        return <span className="bg-teal-50 text-teal-700 font-medium px-2 py-0.5 rounded text-[11px]">Kontrol Ulang</span>;
      case "POTENSI_BARU":
        return <span className="bg-orange-50 text-orange-700 font-medium px-2 py-0.5 rounded text-[11px]">Potensi Baru</span>;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6 pb-12" id="hot-prospect-page">
      <OperationalHubTabs hub="follow_up" />

      {/* Header Banner */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 bg-amber-50 text-amber-600 rounded-lg">
                <Flame className="w-6 h-6" />
              </span>
              <h1 className="text-xl font-bold text-slate-900">Manajemen Hot Prospect Pasien</h1>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Identifikasi pasien yang pernah berkunjung dan berpotensi melakukan kunjungan ulang berdasarkan riwayat tindakan dan rekomendasi kontrol. (Bukan Konfirmasi H-1).
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleExportExcel}
              className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-4 py-2.5 rounded-lg text-xs transition-colors shadow-sm"
              id="btn-export-hot-prospect-excel"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Download Excel
            </button>
          </div>
        </div>

        {/* Stats Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-slate-100">
          <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
            <p className="text-xs text-slate-500 font-medium">Total Hot Prospect</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{stats.total}</p>
          </div>
          <div className="bg-amber-50/60 p-4 rounded-lg border border-amber-100">
            <p className="text-xs text-amber-700 font-medium">Belum Dihubungi</p>
            <p className="text-2xl font-bold text-amber-800 mt-1">{stats.belum}</p>
          </div>
          <div className="bg-sky-50/60 p-4 rounded-lg border border-sky-100">
            <p className="text-xs text-sky-700 font-medium">Sudah Dihubungi</p>
            <p className="text-2xl font-bold text-sky-800 mt-1">{stats.sudah}</p>
          </div>
          <div className="bg-emerald-50/60 p-4 rounded-lg border border-emerald-100">
            <p className="text-xs text-emerald-700 font-medium">Janji / Deal Kunjungan</p>
            <p className="text-2xl font-bold text-emerald-800 mt-1">{stats.janji}</p>
          </div>
        </div>
      </div>

      {/* Filters & Search Toolbar */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto flex-1">
          {/* Search */}
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama pasien, no. RM, telepon, atau tindakan..."
              className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
            />
          </div>

          {/* Branch Filter */}
          {currentUser?.role === UserRole.SUPER_ADMIN && (
            <select
              value={selectedBranchFilter}
              onChange={(e) => setSelectedBranchFilter(e.target.value)}
              className="py-2 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20"
            >
              <option value="ALL">Semua Cabang</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="py-2 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20"
          >
            <option value="ALL">Semua Status Follow-up</option>
            <option value="BELUM_DIHUBUNGI">Belum Dihubungi</option>
            <option value="SUDAH_DIHUBUNGI">Sudah Dihubungi</option>
            <option value="JANJI_KUNJUNGAN">Janji Kunjungan</option>
            <option value="SELESAI_DEAL">Selesai / Deal</option>
            <option value="BATAL">Batal</option>
          </select>

          {/* Category Filter */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="py-2 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20"
          >
            <option value="ALL">Semua Kategori Potensi</option>
            <option value="PERAWATAN_LANJUTAN">Perawatan Lanjutan</option>
            <option value="KONTROL_ULANG">Kontrol Ulang</option>
            <option value="POTENSI_BARU">Potensi Baru</option>
          </select>
        </div>

        <div className="text-xs text-slate-500 font-medium whitespace-nowrap">
          Menampilkan <span className="font-bold text-slate-800">{filteredProspects.length}</span> hot prospect
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/75 border-b border-slate-100 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="py-3 px-4">Pasien & No. RM</th>
                <th className="py-3 px-4">Cabang</th>
                <th className="py-3 px-4">Kunjungan Terakhir</th>
                <th className="py-3 px-4">Kategori & Rekomendasi</th>
                <th className="py-3 px-4">Status Follow-Up</th>
                <th className="py-3 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
              {filteredProspects.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <Sparkles className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    Tidak ada data hot prospect yang sesuai dengan filter pencarian.
                  </td>
                </tr>
              ) : (
                filteredProspects.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">{p.patientName}</div>
                      <div className="text-slate-500 text-[11px] flex items-center gap-2 mt-0.5">
                        <span>RM: {p.medicalRecordNumber}</span>
                        <span>•</span>
                        <span className="flex items-center gap-1 text-emerald-600 font-medium">
                          <Phone className="w-3 h-3" /> {p.phone}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-slate-800 font-medium">{p.branchName}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-slate-800 font-medium">{formatDate(p.lastVisitDate)}</div>
                      <div className="text-[11px] text-slate-500 truncate max-w-[180px]" title={p.lastTreatment}>
                        {p.lastTreatment}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="mb-1">{getCategoryBadge(p.potentialCategory)}</div>
                      <div className="text-[11px] text-slate-600 max-w-[220px] leading-relaxed">
                        {p.recommendationNotes}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="space-y-1">
                        {getStatusBadge(p.status)}
                        {p.followUpNotes && (
                          <div className="text-[11px] text-slate-500 italic max-w-[180px] truncate" title={p.followUpNotes}>
                            "{p.followUpNotes}"
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <a
                          href={`https://wa.me/${p.phone.replace(/[^0-9]/g, "")}?text=Halo%20Kak%20${encodeURIComponent(p.patientName)},%20kami%20dari%20Lala%20Dentist%20mengingatkan%20perawatan%20atau%20jadwal%20kontrol%20gigi%20berkala%20Anda.%20Apakah%20ingin%20menjadwalkan%20kunjungan%20kembali?`}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-lg transition-colors"
                          title="Kirim Pesan WhatsApp"
                        >
                          <Phone className="w-4 h-4" />
                        </a>
                        <button
                          onClick={() => {
                            setActiveModalItem(p);
                            setEditStatus(p.status);
                            setEditNotes(p.followUpNotes);
                          }}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg text-xs transition-colors"
                        >
                          Follow-Up
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Follow-up Status */}
      {activeModalItem && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900">Update Status Hot Prospect</h3>
              <button
                onClick={() => setActiveModalItem(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <p className="font-semibold text-slate-800 text-sm">{activeModalItem.patientName}</p>
                <p className="text-slate-500">No. RM: {activeModalItem.medicalRecordNumber} • {activeModalItem.phone}</p>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Status Follow-Up</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as any)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                >
                  <option value="BELUM_DIHUBUNGI">Belum Dihubungi</option>
                  <option value="SUDAH_DIHUBUNGI">Sudah Dihubungi</option>
                  <option value="JANJI_KUNJUNGAN">Janji Kunjungan</option>
                  <option value="SELESAI_DEAL">Selesai / Deal</option>
                  <option value="BATAL">Batal</option>
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Catatan Follow-Up / Keterangan</label>
                <textarea
                  rows={3}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Misal: Pasien berencana kontrol minggu depan hari Rabu sore..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setActiveModalItem(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium text-xs transition-colors"
              >
                Batal
              </button>
              <button
                onClick={handleSaveFollowUp}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium text-xs transition-colors shadow-sm"
              >
                Simpan Status
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
