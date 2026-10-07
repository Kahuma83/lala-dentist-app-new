import React, { useState, useEffect } from "react";
import { useApp } from "../context/AppContext";
import {
  TreatmentJob,
  TreatmentJobStatus,
  TreatmentActivity,
  TreatmentActivityType,
  UserRole,
  PatientVisit,
  MasterService,
  DentalDoctor,
  DentalBranch
} from "../types/domain";
import {
  Stethoscope,
  Plus,
  Play,
  CheckCircle2,
  Send,
  Clock,
  Search,
  Filter,
  User,
  Building2,
  FileText,
  AlertCircle,
  X,
  Sparkles,
  ChevronRight
} from "lucide-react";
import { TreatmentPicker } from "../components/TreatmentPicker";

export const TreatmentManagement: React.FC = () => {
  const { currentUser, repos, branches, services } = useApp();

  const [treatments, setTreatments] = useState<TreatmentJob[]>([]);
  const [visits, setVisits] = useState<PatientVisit[]>([]);
  const [doctorsList, setDoctorsList] = useState<DentalDoctor[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Create Modal state
  const [isCreateOpen, setIsCreateOpen] = useState<boolean>(false);
  const [selectedVisitId, setSelectedVisitId] = useState<string>("");
  const [selectedServiceId, setSelectedServiceId] = useState<string>("");
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>("");
  const [estimatedDuration, setEstimatedDuration] = useState<number>(30);
  const [treatmentNotes, setTreatmentNotes] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Detail Modal & Activity state
  const [selectedTreatment, setSelectedTreatment] = useState<TreatmentJob | null>(null);
  const [activities, setActivities] = useState<TreatmentActivity[]>([]);
  const [activityType, setActivityType] = useState<TreatmentActivityType>(TreatmentActivityType.PROGRESS);
  const [activityNotes, setActivityNotes] = useState<string>("");
  const [addingActivity, setAddingActivity] = useState<boolean>(false);

  const treatmentRepo = repos.treatment;
  const visitRepo = repos.visit;
  const activityRepo = repos.treatmentActivity;

  const loadActivities = async (treatmentId: string) => {
    try {
      if (!currentUser) return;
      const list = await activityRepo.listActivitiesByTreatment(
        treatmentId,
        currentUser.role,
        currentUser.assignedBranchId,
        currentUser.id
      );
      setActivities(list);
    } catch (err: any) {
      console.error("Gagal memuat activity timeline:", err.message);
    }
  };

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      if (!currentUser) return;

      const [trList, vList, docList] = await Promise.all([
        treatmentRepo.listTreatments(
          currentUser.role,
          currentUser.assignedBranchId,
          currentUser.id
        ),
        visitRepo.getVisitsByBranch(
          currentUser.assignedBranchId || "branch-gebang",
          currentUser.role,
          currentUser.assignedBranchId
        ),
        repos.doctor.getDoctors()
      ]);

      setDoctorsList(docList);
      setTreatments(trList);
      setVisits(vList);

      if (selectedTreatment) {
        await loadActivities(selectedTreatment.id);
      }
    } catch (err: any) {
      setError(err.message || "Gagal memuat data tindakan medis");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentUser]);

  useEffect(() => {
    if (selectedTreatment) {
      loadActivities(selectedTreatment.id);
    } else {
      setActivities([]);
    }
  }, [selectedTreatment]);

  const handleCreateTreatment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVisitId || !selectedServiceId || !selectedDoctorId) {
      setError("Pilih visit, layanan, dan dokter penanggung jawab");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await treatmentRepo.createTreatmentJob(
        {
          visitId: selectedVisitId,
          serviceId: selectedServiceId,
          doctorId: selectedDoctorId,
          estimatedDurationMinutes: estimatedDuration,
          notes: treatmentNotes
        },
        currentUser?.role,
        currentUser?.assignedBranchId,
        currentUser?.id
      );

      setSuccessMsg("Tindakan medis berhasil dibuat");
      setIsCreateOpen(false);
      setSelectedVisitId("");
      setSelectedServiceId("");
      setSelectedDoctorId("");
      setTreatmentNotes("");
      await loadData();
    } catch (err: any) {
      setError(err.message || "Gagal membuat tindakan medis");
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartTreatment = async (id: string) => {
    setError(null);
    try {
      await treatmentRepo.startTreatmentJob(
        id,
        currentUser?.role,
        currentUser?.assignedBranchId,
        currentUser?.id,
        {
          actorId: currentUser?.id,
          actorRole: currentUser?.role,
          actorNameSnapshot: currentUser?.name || "User Klinik",
          notes: "Memulai tindakan medis"
        }
      );
      setSuccessMsg("Status tindakan diubah ke DALAM PROSES");
      await loadData();
    } catch (err: any) {
      setError(err.message || "Gagal memulai tindakan medis");
    }
  };

  const handleCompleteTreatment = async (id: string) => {
    setError(null);
    try {
      await treatmentRepo.completeTreatmentJob(
        id,
        currentUser?.role,
        currentUser?.assignedBranchId,
        currentUser?.id,
        {
          actorId: currentUser?.id,
          actorRole: currentUser?.role,
          actorNameSnapshot: currentUser?.name || "User Klinik",
          notes: "Menyelesaikan tindakan medis"
        }
      );
      setSuccessMsg("Status tindakan diubah ke SELESAI");
      await loadData();
    } catch (err: any) {
      setError(err.message || "Gagal menyelesaikan tindakan medis");
    }
  };

  const handleHandOverTreatment = async (id: string) => {
    setError(null);
    try {
      await treatmentRepo.handOverTreatmentJob(
        id,
        currentUser?.role,
        currentUser?.assignedBranchId,
        currentUser?.id,
        {
          actorId: currentUser?.id,
          actorRole: currentUser?.role,
          actorNameSnapshot: currentUser?.name || "User Klinik",
          notes: "Tindakan medis diserahkan"
        }
      );
      setSuccessMsg("Tindakan medis telah DISERAHKAN (Handed Over)");
      await loadData();
    } catch (err: any) {
      setError(err.message || "Gagal menyerahkan tindakan medis");
    }
  };

  const handleAddManualActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTreatment || !currentUser) return;
    setAddingActivity(true);
    setError(null);
    try {
      await activityRepo.addActivity(
        {
          treatmentId: selectedTreatment.id,
          actorId: currentUser.id,
          actorRole: currentUser.role,
          actorNameSnapshot: currentUser.name || "Staff",
          activityType,
          notes: activityNotes
        },
        currentUser.role,
        currentUser.assignedBranchId,
        currentUser.id
      );
      setSuccessMsg(`Catatan Activity (${activityType}) berhasil ditambahkan`);
      setActivityNotes("");
      await loadActivities(selectedTreatment.id);
    } catch (err: any) {
      setError(err.message || "Gagal menambahkan Activity");
    } finally {
      setAddingActivity(false);
    }
  };

  // Filtered treatments
  const filteredTreatments = treatments.filter((tr) => {
    const matchStatus = statusFilter === "ALL" || tr.status === statusFilter;
    const q = searchQuery.toLowerCase();
    const matchQuery =
      !q ||
      tr.serviceNameSnapshot.toLowerCase().includes(q) ||
      tr.doctorNameSnapshot.toLowerCase().includes(q) ||
      tr.visitId.toLowerCase().includes(q) ||
      (tr.notes && tr.notes.toLowerCase().includes(q));

    return matchStatus && matchQuery;
  });

  const countByStatus = (status: string) =>
    treatments.filter((t) => t.status === status).length;

  const getStatusBadge = (status: TreatmentJobStatus | string) => {
    switch (status) {
      case TreatmentJobStatus.BELUM_DIMULAI:
      case "BELUM_DIMULAI":
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
            <Clock className="w-3 h-3 mr-1 text-slate-500" />
            BELUM DIMULAI
          </span>
        );
      case TreatmentJobStatus.DALAM_PROSES:
      case "DALAM_PROSES":
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <Play className="w-3 h-3 mr-1 text-amber-600 animate-pulse" />
            DALAM PROSES
          </span>
        );
      case TreatmentJobStatus.SELESAI:
      case "SELESAI":
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-600" />
            SELESAI
          </span>
        );
      case TreatmentJobStatus.DISERAHKAN:
      case "DISERAHKAN":
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
            <Send className="w-3 h-3 mr-1 text-purple-600" />
            DISERAHKAN
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Page Title & Controls Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-9 h-9 bg-teal-50 text-teal-600 rounded-xl flex items-center justify-center font-bold">
              <Stethoscope className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">Treatment Core (Tindakan Medis)</h1>
            <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold tracking-wide uppercase bg-teal-100 text-teal-800">
              Phase 4A
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Kelola tindakan medis per visit pasien secara deterministic, snapshot nama dokter & layanan, serta transisi status terkontrol.
          </p>
        </div>

        <button
          onClick={() => {
            setIsCreateOpen(true);
            if (currentUser?.role === UserRole.DOCTOR) {
              setSelectedDoctorId(currentUser.id);
            }
          }}
          className="inline-flex items-center justify-center px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs rounded-xl shadow-sm transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4 mr-1.5" />
          Tambah Treatment Job
        </button>
      </div>

      {/* Messages */}
      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 p-4 rounded-xl text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-500 hover:text-rose-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 p-4 rounded-xl text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-500 hover:text-emerald-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Statistics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div
          onClick={() => setStatusFilter("ALL")}
          className={`p-4 rounded-xl border transition-all cursor-pointer ${
            statusFilter === "ALL"
              ? "bg-slate-900 text-white border-slate-900 shadow-md"
              : "bg-white text-slate-800 border-slate-100 hover:border-slate-300"
          }`}
        >
          <span className="text-[10px] font-semibold uppercase tracking-wider block opacity-70">
            Total Treatment
          </span>
          <span className="text-2xl font-black mt-1 block">{treatments.length}</span>
        </div>

        <div
          onClick={() => setStatusFilter(TreatmentJobStatus.BELUM_DIMULAI)}
          className={`p-4 rounded-xl border transition-all cursor-pointer ${
            statusFilter === TreatmentJobStatus.BELUM_DIMULAI
              ? "bg-slate-800 text-white border-slate-800 shadow-md"
              : "bg-white text-slate-800 border-slate-100 hover:border-slate-300"
          }`}
        >
          <span className="text-[10px] font-semibold uppercase tracking-wider block text-slate-500">
            Belum Dimulai
          </span>
          <span className="text-2xl font-black mt-1 block text-slate-700">
            {countByStatus(TreatmentJobStatus.BELUM_DIMULAI)}
          </span>
        </div>

        <div
          onClick={() => setStatusFilter(TreatmentJobStatus.DALAM_PROSES)}
          className={`p-4 rounded-xl border transition-all cursor-pointer ${
            statusFilter === TreatmentJobStatus.DALAM_PROSES
              ? "bg-amber-600 text-white border-amber-600 shadow-md"
              : "bg-white text-slate-800 border-slate-100 hover:border-slate-300"
          }`}
        >
          <span className="text-[10px] font-semibold uppercase tracking-wider block text-amber-600">
            Dalam Proses
          </span>
          <span className="text-2xl font-black mt-1 block text-amber-700">
            {countByStatus(TreatmentJobStatus.DALAM_PROSES)}
          </span>
        </div>

        <div
          onClick={() => setStatusFilter(TreatmentJobStatus.SELESAI)}
          className={`p-4 rounded-xl border transition-all cursor-pointer ${
            statusFilter === TreatmentJobStatus.SELESAI
              ? "bg-emerald-600 text-white border-emerald-600 shadow-md"
              : "bg-white text-slate-800 border-slate-100 hover:border-slate-300"
          }`}
        >
          <span className="text-[10px] font-semibold uppercase tracking-wider block text-emerald-600">
            Selesai
          </span>
          <span className="text-2xl font-black mt-1 block text-emerald-700">
            {countByStatus(TreatmentJobStatus.SELESAI)}
          </span>
        </div>

        <div
          onClick={() => setStatusFilter(TreatmentJobStatus.DISERAHKAN)}
          className={`p-4 rounded-xl border transition-all cursor-pointer ${
            statusFilter === TreatmentJobStatus.DISERAHKAN
              ? "bg-purple-600 text-white border-purple-600 shadow-md"
              : "bg-white text-slate-800 border-slate-100 hover:border-slate-300"
          }`}
        >
          <span className="text-[10px] font-semibold uppercase tracking-wider block text-purple-600">
            Diserahkan
          </span>
          <span className="text-2xl font-black mt-1 block text-purple-700">
            {countByStatus(TreatmentJobStatus.DISERAHKAN)}
          </span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-100 flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Cari nama tindakan, dokter, visit ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 bg-slate-50/50"
          />
        </div>

        <div className="flex items-center gap-2 text-xs w-full sm:w-auto justify-end">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-slate-500 font-medium">Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            <option value="ALL">Semua Status</option>
            <option value={TreatmentJobStatus.BELUM_DIMULAI}>BELUM DIMULAI</option>
            <option value={TreatmentJobStatus.DALAM_PROSES}>DALAM PROSES</option>
            <option value={TreatmentJobStatus.SELESAI}>SELESAI</option>
            <option value={TreatmentJobStatus.DISERAHKAN}>DISERAHKAN</option>
          </select>
        </div>
      </div>

      {/* Treatment Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-xs font-medium">
            Memuat data tindakan medis...
          </div>
        ) : filteredTreatments.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            <Stethoscope className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            Tidak ada data tindakan medis yang sesuai kriteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-100 text-slate-500 font-semibold uppercase text-[10px] tracking-wider">
                  <th className="py-3.5 px-4">Tindakan Medis (Snapshot)</th>
                  <th className="py-3.5 px-4">Visit & Branch</th>
                  <th className="py-3.5 px-4">Dokter Penanggung Jawab</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">Timestamps</th>
                  <th className="py-3.5 px-4 text-right">Aksi Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredTreatments.map((tr) => (
                  <tr key={tr.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3.5 px-4 font-medium text-slate-900">
                      <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                        {tr.serviceNameSnapshot}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        ID: {tr.id} • Est: {tr.estimatedDurationMinutes || 30} mnt
                      </div>
                      {tr.notes && (
                        <div className="text-[11px] text-teal-700 bg-teal-50 px-2 py-0.5 rounded mt-1 inline-block">
                          Note: {tr.notes}
                        </div>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="font-medium text-slate-800 flex items-center gap-1">
                        <FileText className="w-3.5 h-3.5 text-slate-400" />
                        {tr.visitId}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
                        <Building2 className="w-3 h-3 text-slate-400" />
                        Branch: {tr.branchId}
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="font-medium text-slate-900 flex items-center gap-1">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        {tr.doctorNameSnapshot}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">ID: {tr.doctorId}</div>
                    </td>

                    <td className="py-3.5 px-4">{getStatusBadge(tr.status)}</td>

                    <td className="py-3.5 px-4 text-[11px] text-slate-500 space-y-0.5">
                      <div>Dibuat: {new Date(tr.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                      {tr.startedAt && (
                        <div className="text-amber-700">Mulai: {new Date(tr.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                      )}
                      {tr.completedAt && (
                        <div className="text-emerald-700">Selesai: {new Date(tr.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                      )}
                      {tr.handedOverAt && (
                        <div className="text-purple-700">Diserahkan: {new Date(tr.handedOverAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {tr.status === TreatmentJobStatus.BELUM_DIMULAI && (
                          <button
                            onClick={() => handleStartTreatment(tr.id)}
                            className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-lg text-[11px] transition-colors flex items-center gap-1 cursor-pointer"
                          >
                            <Play className="w-3 h-3" />
                            Mulai
                          </button>
                        )}

                        {tr.status === TreatmentJobStatus.DALAM_PROSES && (
                          <button
                            onClick={() => handleCompleteTreatment(tr.id)}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg text-[11px] transition-colors flex items-center gap-1 cursor-pointer"
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            Selesaikan
                          </button>
                        )}

                        {tr.status === TreatmentJobStatus.SELESAI && (
                          <button
                            onClick={() => handleHandOverTreatment(tr.id)}
                            className="px-2.5 py-1 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg text-[11px] transition-colors flex items-center gap-1 cursor-pointer"
                          >
                            <Send className="w-3 h-3" />
                            Serahkan
                          </button>
                        )}

                        {tr.status === TreatmentJobStatus.DISERAHKAN && (
                          <span className="text-[11px] font-semibold text-slate-400 bg-slate-100 px-2.5 py-1 rounded-lg">
                            Final
                          </span>
                        )}

                        <button
                          onClick={() => setSelectedTreatment(tr)}
                          className="px-2 py-1 text-slate-600 hover:bg-slate-100 rounded-lg text-[11px] font-medium"
                        >
                          Detail
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Treatment Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Stethoscope className="w-4 h-4 text-teal-600" />
                Tambah Treatment Job Baru
              </h3>
              <button
                onClick={() => setIsCreateOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateTreatment} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Pilih Visit Pasien *</label>
                <select
                  value={selectedVisitId}
                  onChange={(e) => setSelectedVisitId(e.target.value)}
                  required
                  className="w-full border border-slate-200 rounded-lg p-2 text-xs bg-white text-slate-800 focus:ring-2 focus:ring-teal-500"
                >
                  <option value="">-- Pilih Visit --</option>
                  {visits.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.id} - Pasien: {v.patientId} ({v.visitType} • Branch: {v.branchId})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1.5 flex items-center justify-between">
                  <span>Pilih Master Jenis Tindakan *</span>
                  {selectedServiceId && (
                    <span className="text-[11px] text-teal-600 font-semibold">
                      Terpilih: {services.find((s) => s.id === selectedServiceId)?.name}
                    </span>
                  )}
                </label>
                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs max-h-64 overflow-y-auto">
                  <TreatmentPicker
                    selectedServiceId={selectedServiceId}
                    branchId={
                      visits.find((v) => v.id === selectedVisitId)?.branchId ||
                      currentUser?.assignedBranchId ||
                      "branch-gebang"
                    }
                    onSelectService={(service) => {
                      setSelectedServiceId(service.id);
                      setEstimatedDuration(service.estimatedDurationMinutes || 30);
                    }}
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Dokter Penanggung Jawab *</label>
                <select
                  value={selectedDoctorId}
                  onChange={(e) => setSelectedDoctorId(e.target.value)}
                  required
                  disabled={currentUser?.role === UserRole.DOCTOR}
                  className="w-full border border-slate-200 rounded-lg p-2 text-xs bg-white text-slate-800 focus:ring-2 focus:ring-teal-500 disabled:bg-slate-100"
                >
                  <option value="">-- Pilih Dokter --</option>
                  {doctorsList.map((d: DentalDoctor) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.specialization})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Estimasi Durasi (Menit)</label>
                <input
                  type="number"
                  min="5"
                  max="300"
                  value={estimatedDuration}
                  onChange={(e) => setEstimatedDuration(Number(e.target.value))}
                  className="w-full border border-slate-200 rounded-lg p-2 text-xs text-slate-800 focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Catatan Klinik / Posisi Gigi (Optional)</label>
                <textarea
                  rows={2}
                  placeholder="Contoh: Tambal gigi molar kanan atas #16"
                  value={treatmentNotes}
                  onChange={(e) => setTreatmentNotes(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg p-2 text-xs text-slate-800 focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 font-medium"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-medium shadow-sm disabled:opacity-50"
                >
                  {submitting ? "Menyimpan..." : "Simpan Treatment Job"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selectedTreatment && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl border border-slate-100 space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Stethoscope className="w-4 h-4 text-teal-600" />
                Detail Treatment Job & Activity Audit Trail
              </h3>
              <button
                onClick={() => setSelectedTreatment(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-700">
              <div className="space-y-3">
                <div className="bg-slate-50 p-3 rounded-xl space-y-1">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Tindakan Medis</div>
                  <div className="font-bold text-slate-900 text-sm">{selectedTreatment.serviceNameSnapshot}</div>
                  <div className="text-[11px] text-slate-500">Service ID: {selectedTreatment.serviceId}</div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="border border-slate-100 p-2.5 rounded-xl">
                    <div className="text-[10px] uppercase text-slate-400 font-semibold">Dokter (Snapshot)</div>
                    <div className="font-semibold text-slate-800 mt-0.5">{selectedTreatment.doctorNameSnapshot}</div>
                  </div>
                  <div className="border border-slate-100 p-2.5 rounded-xl">
                    <div className="text-[10px] uppercase text-slate-400 font-semibold">Status Saat Ini</div>
                    <div className="mt-1">{getStatusBadge(selectedTreatment.status)}</div>
                  </div>
                </div>

                <div className="border border-slate-100 p-2.5 rounded-xl space-y-1">
                  <div className="text-[10px] uppercase text-slate-400 font-semibold">Visit & Patient</div>
                  <div>Visit ID: <span className="font-mono font-semibold">{selectedTreatment.visitId}</span></div>
                  <div>Patient ID: <span className="font-mono">{selectedTreatment.patientId}</span></div>
                  <div>Branch ID: <span className="font-mono">{selectedTreatment.branchId}</span></div>
                </div>

                <div className="border border-amber-100 bg-amber-50/50 p-3 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold text-amber-800 tracking-wider">Durasi Pelayanan</span>
                    <span className="text-xs font-bold text-amber-900 bg-amber-100/80 px-2.5 py-0.5 rounded-full">
                      {selectedTreatment.estimatedDurationMinutes || 30} Menit
                    </span>
                  </div>
                  
                  {(currentUser?.role === UserRole.DOCTOR || currentUser?.role === UserRole.DOCTOR_ASSISTANT || currentUser?.role === UserRole.BRANCH_ADMIN || currentUser?.role === UserRole.SUPER_ADMIN) &&
                   selectedTreatment.status === TreatmentJobStatus.DALAM_PROSES && (
                    <div className="pt-1.5 border-t border-amber-200/50 space-y-1.5">
                      <div className="text-[10px] font-semibold text-amber-800">Tambah Waktu Tindakan:</div>
                      <div className="flex gap-1.5">
                        {[15, 30, 45].map((m) => (
                          <button
                            key={m}
                            type="button"
                            disabled={submitting}
                            onClick={async () => {
                              try {
                                setSubmitting(true);
                                const qItems = await repos.queue.getQueueByBranch(selectedTreatment.branchId);
                                const qItem = qItems.find((q) => q.visitId === selectedTreatment.visitId || q.patientId === selectedTreatment.patientId);
                                const qId = qItem ? qItem.id : `q-${selectedTreatment.id}`;
                                const prevM = selectedTreatment.estimatedDurationMinutes || 30;
                                const newM = prevM + m;

                                await repos.queue.updateEstimatedDuration(
                                  qId,
                                  newM,
                                  currentUser.role,
                                  currentUser.assignedBranchId,
                                  currentUser.id,
                                  {
                                    reason: "Tindakan membutuhkan waktu tambahan",
                                    addedMinutes: m,
                                    previousDurationMinutes: prevM,
                                    actorNameSnapshot: currentUser.name || "User Klinik",
                                    treatmentId: selectedTreatment.id
                                  }
                                );
                                setSuccessMsg(`Berhasil menambah +${m} menit.`);
                                setSelectedTreatment((prev) => prev ? { ...prev, estimatedDurationMinutes: newM } : null);
                                await loadActivities(selectedTreatment.id);
                                await loadData();
                              } catch (err: any) {
                                setError(err.message || "Gagal memperbarui durasi");
                              } finally {
                                setSubmitting(false);
                              }
                            }}
                            className="flex-1 py-1 px-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-[11px] font-bold shadow-2xs transition-all disabled:opacity-50"
                          >
                            +{m}m
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {selectedTreatment.notes && (
                  <div className="bg-teal-50 border border-teal-100 p-2.5 rounded-xl text-teal-800">
                    <div className="text-[10px] uppercase text-teal-600 font-bold">Catatan Clinical</div>
                    <div className="mt-0.5">{selectedTreatment.notes}</div>
                  </div>
                )}
              </div>

              {/* Activity Timeline Section */}
              <div className="border border-slate-100 p-3.5 rounded-xl space-y-3 bg-slate-50/50">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                  <h4 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-teal-600" />
                    Activity Audit Trail ({activities.length})
                  </h4>
                </div>

                {/* Timeline list */}
                <div className="max-h-52 overflow-y-auto space-y-2 pr-1">
                  {activities.length === 0 ? (
                    <div className="text-[11px] text-slate-400 italic py-2 text-center">
                      Belum ada activity audit trail.
                    </div>
                  ) : (
                    activities.map((act) => (
                      <div key={act.id} className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs space-y-1 text-[11px]">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-800 px-2 py-0.5 rounded-md bg-teal-50 text-teal-700 text-[10px]">
                            {act.activityType}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {act.activityAt || act.timestamp}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-slate-700 font-medium">
                          <span>{act.actorNameSnapshot}</span>
                          <span className="text-[9px] font-bold uppercase text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                            {act.actorRole}
                          </span>
                        </div>
                        {act.notes && (
                          <div className="text-slate-500 text-[10px] italic border-t border-slate-100 pt-1 mt-1">
                            "{act.notes}"
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>

                {/* Form Add Activity */}
                <form onSubmit={handleAddManualActivity} className="pt-2 border-t border-slate-200 space-y-2">
                  <div className="font-semibold text-[11px] text-slate-800">Tambah Catatan Activity</div>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={activityType}
                      onChange={(e) => setActivityType(e.target.value as TreatmentActivityType)}
                      className="border border-slate-200 bg-white rounded-lg p-1.5 text-[11px] focus:ring-1 focus:ring-teal-500"
                    >
                      <option value={TreatmentActivityType.PROGRESS}>PROGRESS</option>
                      <option value={TreatmentActivityType.OTHER}>OTHER</option>
                    </select>
                    <button
                      type="submit"
                      disabled={addingActivity}
                      className="bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium text-[11px] py-1.5 px-3 shadow-2xs disabled:opacity-50"
                    >
                      {addingActivity ? "..." : "+ Activity"}
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="Catatan aktivitas..."
                    value={activityNotes}
                    onChange={(e) => setActivityNotes(e.target.value)}
                    className="w-full border border-slate-200 bg-white rounded-lg p-1.5 text-[11px] focus:ring-1 focus:ring-teal-500"
                  />
                </form>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                onClick={() => setSelectedTreatment(null)}
                className="px-4 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg text-xs font-semibold"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
