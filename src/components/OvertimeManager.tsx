import React, { useState, useMemo } from "react";
import { useApp } from "../context/AppContext";
import { UserRole, OvertimeStatus, OvertimeRecord, Attendance } from "../types/domain";
import {
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Search,
  Filter,
  ArrowUpRight,
  ShieldCheck,
  UserCheck,
  Building2,
  Calendar,
  Send,
  Check,
  X
} from "lucide-react";

export const OvertimeManager: React.FC = () => {
  const {
    currentUser,
    selectedBranchId,
    branches,
    staff,
    attendances,
    overtimes,
    overtimeRepo,
    refreshData
  } = useApp();

  const isBranchAdmin = currentUser?.role === UserRole.BRANCH_ADMIN;
  const userBranchId = isBranchAdmin ? currentUser?.assignedBranchId : selectedBranchId;

  // Filter states
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");
  const [selectedBranch, setSelectedBranch] = useState<string>(userBranchId || "ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Feedback states
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Modals for Approve / Reject
  const [approvalModalRecord, setApprovalModalRecord] = useState<OvertimeRecord | null>(null);
  const [approverName, setApproverName] = useState(currentUser?.name || "HR Admin");

  const [rejectionModalRecord, setRejectionModalRecord] = useState<OvertimeRecord | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  const showSuccess = (msg: string) => {
    setSuccessMessage(msg);
    setErrorMessage(null);
    setTimeout(() => setSuccessMessage(null), 4000);
  };

  const showError = (msg: string) => {
    setErrorMessage(msg);
    setSuccessMessage(null);
  };

  // 1. Trigger automatic detection for all completed attendances
  const handleRunDetection = async () => {
    setIsSubmitting(true);
    try {
      let detectedCount = 0;
      for (const att of attendances) {
        if (att.actualCheckOutAt && att.scheduledEndAt && att.scheduledEndAt !== "-") {
          const existing = overtimes.find(o => o.attendanceId === att.id);
          if (!existing) {
            const res = await overtimeRepo.detectFromAttendance(att.id, currentUser?.role, userBranchId);
            if (res) detectedCount++;
          }
        }
      }
      await refreshData();
      showSuccess(`Pemeriksaan selesai. Berhasil mendeteksi ${detectedCount} catatan lembur baru.`);
    } catch (err: any) {
      showError(err.message || "Gagal melakukan deteksi lembur.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // 2. Submit Overtime
  const handleSubmitOvertime = async (id: string) => {
    setIsSubmitting(true);
    try {
      await overtimeRepo.submit(id, currentUser?.role, userBranchId);
      await refreshData();
      showSuccess("Catatan lembur berhasil diajukan (SUBMITTED).");
    } catch (err: any) {
      showError(err.message || "Gagal mengajukan lembur.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // 3. Approve Overtime
  const handleApprove = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!approvalModalRecord) return;
    setIsSubmitting(true);
    try {
      await overtimeRepo.approve(approvalModalRecord.id, approverName, currentUser?.role, userBranchId);
      await refreshData();
      setApprovalModalRecord(null);
      showSuccess("Lembur berhasil disetujui (APPROVED).");
    } catch (err: any) {
      showError(err.message || "Gagal menyetujui lembur.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // 4. Reject Overtime
  const handleReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectionModalRecord) return;
    if (!rejectionReason.trim()) {
      showError("Alasan penolakan wajib diisi.");
      return;
    }
    setIsSubmitting(true);
    try {
      await overtimeRepo.reject(rejectionModalRecord.id, approverName, rejectionReason, currentUser?.role, userBranchId);
      await refreshData();
      setRejectionModalRecord(null);
      setRejectionReason("");
      showSuccess("Lembur berhasil ditolak (REJECTED).");
    } catch (err: any) {
      showError(err.message || "Gagal menolak lembur.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filtered overtime list
  const filteredOvertimes = useMemo(() => {
    let items = [...overtimes];

    // Branch isolation / filter
    if (isBranchAdmin && userBranchId) {
      items = items.filter(o => o.branchId === userBranchId);
    } else if (selectedBranch !== "ALL") {
      items = items.filter(o => o.branchId === selectedBranch);
    }

    // Status filter
    if (selectedStatus !== "ALL") {
      items = items.filter(o => o.status === selectedStatus);
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter(o => {
        const stf = staff.find(s => s.id === o.staffId);
        const name = stf ? stf.fullName.toLowerCase() : "";
        const code = stf ? stf.employeeCode.toLowerCase() : "";
        return name.includes(q) || code.includes(q) || o.date.includes(q);
      });
    }

    return items.sort((a, b) => b.date.localeCompare(a.date));
  }, [overtimes, isBranchAdmin, userBranchId, selectedBranch, selectedStatus, searchQuery, staff]);

  // Summary Metrics
  const summary = useMemo(() => {
    const list = isBranchAdmin && userBranchId ? overtimes.filter(o => o.branchId === userBranchId) : overtimes;
    const detected = list.filter(o => o.status === OvertimeStatus.DETECTED).reduce((acc, o) => acc + o.overtimeMinutes, 0);
    const submitted = list.filter(o => o.status === OvertimeStatus.SUBMITTED).reduce((acc, o) => acc + o.overtimeMinutes, 0);
    const approved = list.filter(o => o.status === OvertimeStatus.APPROVED).reduce((acc, o) => acc + o.overtimeMinutes, 0);
    const rejected = list.filter(o => o.status === OvertimeStatus.REJECTED).reduce((acc, o) => acc + o.overtimeMinutes, 0);

    return { detected, submitted, approved, rejected };
  }, [overtimes, isBranchAdmin, userBranchId]);

  return (
    <div className="space-y-6" id="overtime-manager">
      {/* Header & Scan Button */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Clock className="w-5 h-5 text-emerald-600" />
            Overtime Engine & Approval (HR-3)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Otomatis mendeteksi lembur dari kehadiran staff (Attendance SSOT) dan mengelola persetujuan berjenjang.
          </p>
        </div>
        <button
          onClick={handleRunDetection}
          disabled={isSubmitting}
          className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-4 py-2.5 rounded-xl transition-all shadow-sm shadow-emerald-600/20 active:scale-95 disabled:opacity-50"
        >
          <Search className="w-4 h-4" />
          {isSubmitting ? "Memindai Absensi..." : "Scan & Deteksi Lembur Otomatis"}
        </button>
      </div>

      {/* Notifications */}
      {successMessage && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3 text-emerald-800 text-xs animate-in fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
          <div className="flex-1">{successMessage}</div>
        </div>
      )}
      {errorMessage && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-start gap-3 text-rose-800 text-xs animate-in fade-in">
          <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
          <div className="flex-1">{errorMessage}</div>
        </div>
      )}

      {/* Summary Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Detected (Belum Diajukan)</p>
            <h4 className="text-lg font-bold text-slate-900 mt-0.5">
              {(summary.detected / 60).toFixed(1)} <span className="text-xs font-normal text-slate-500">Jam ({summary.detected} mnt)</span>
            </h4>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center shrink-0">
            <Send className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Submitted (Menunggu)</p>
            <h4 className="text-lg font-bold text-slate-900 mt-0.5">
              {(summary.submitted / 60).toFixed(1)} <span className="text-xs font-normal text-slate-500">Jam ({summary.submitted} mnt)</span>
            </h4>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Approved (Disetujui)</p>
            <h4 className="text-lg font-bold text-slate-900 mt-0.5">
              {(summary.approved / 60).toFixed(1)} <span className="text-xs font-normal text-slate-500">Jam ({summary.approved} mnt)</span>
            </h4>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
            <XCircle className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Rejected (Ditolak)</p>
            <h4 className="text-lg font-bold text-slate-900 mt-0.5">
              {(summary.rejected / 60).toFixed(1)} <span className="text-xs font-normal text-slate-500">Jam ({summary.rejected} mnt)</span>
            </h4>
          </div>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Status Filter */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs">
            <span className="font-medium text-slate-500">Status:</span>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="bg-transparent font-semibold text-slate-800 focus:outline-none cursor-pointer"
            >
              <option value="ALL">Semua Status</option>
              <option value={OvertimeStatus.DETECTED}>Detected</option>
              <option value={OvertimeStatus.SUBMITTED}>Submitted</option>
              <option value={OvertimeStatus.APPROVED}>Approved</option>
              <option value={OvertimeStatus.REJECTED}>Rejected</option>
            </select>
          </div>

          {/* Branch Filter (Super Admin Only) */}
          {!isBranchAdmin && (
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs">
              <Building2 className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                className="bg-transparent font-semibold text-slate-800 focus:outline-none cursor-pointer"
              >
                <option value="ALL">Semua Cabang</option>
                {branches.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Search */}
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Cari staff / kode pegawai..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-emerald-600 bg-slate-50/50"
          />
        </div>
      </div>

      {/* Overtime Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-500 border-b border-slate-200 font-semibold">
                <th className="py-3 px-4">Tanggal & Staff</th>
                <th className="py-3 px-4">Cabang</th>
                <th className="py-3 px-4">Jadwal Selesai vs Aktual</th>
                <th className="py-3 px-4">Durasi Lembur</th>
                <th className="py-3 px-4">Status Workflow</th>
                <th className="py-3 px-4">Persetujuan / Catatan</th>
                <th className="py-3 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredOvertimes.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <Clock className="w-8 h-8 mx-auto mb-2 text-slate-300 stroke-1" />
                    Belum ada catatan lembur yang terdeteksi atau sesuai filter.
                  </td>
                </tr>
              ) : (
                filteredOvertimes.map((ot) => {
                  const stf = staff.find(s => s.id === ot.staffId);
                  const branch = branches.find(b => b.id === ot.branchId);

                  return (
                    <tr key={ot.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-800">{stf?.fullName || "Staff Tidak Dikenal"}</div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                          <span>{stf?.employeeCode}</span>
                          <span>•</span>
                          <span>{ot.date}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center gap-1 font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md">
                          <Building2 className="w-3 h-3 text-slate-400" />
                          {branch?.name || ot.branchId}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600">
                        <div>Selesai: {ot.scheduledEndAt}</div>
                        <div className="text-[11px] text-emerald-600 font-medium">
                          Aktual: {new Date(ot.actualEndAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-900">
                        {ot.overtimeMinutes} Menit <span className="text-[11px] text-slate-500 font-normal">({ot.overtimeHours.toFixed(1)} Jam)</span>
                      </td>
                      <td className="py-3 px-4">
                        {ot.status === OvertimeStatus.DETECTED && (
                          <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200/60 px-2.5 py-1 rounded-full font-semibold text-[11px]">
                            <Clock className="w-3 h-3" /> DETECTED
                          </span>
                        )}
                        {ot.status === OvertimeStatus.SUBMITTED && (
                          <span className="inline-flex items-center gap-1 bg-sky-50 text-sky-700 border border-sky-200/60 px-2.5 py-1 rounded-full font-semibold text-[11px]">
                            <Send className="w-3 h-3" /> SUBMITTED
                          </span>
                        )}
                        {ot.status === OvertimeStatus.APPROVED && (
                          <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200/60 px-2.5 py-1 rounded-full font-semibold text-[11px]">
                            <CheckCircle2 className="w-3 h-3" /> APPROVED
                          </span>
                        )}
                        {ot.status === OvertimeStatus.REJECTED && (
                          <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-700 border border-rose-200/60 px-2.5 py-1 rounded-full font-semibold text-[11px]">
                            <XCircle className="w-3 h-3" /> REJECTED
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-600 max-w-xs truncate">
                        {ot.status === OvertimeStatus.APPROVED && (
                          <div className="text-[11px]">
                            <span className="font-semibold text-emerald-800">Oleh: {ot.approvedBy}</span>
                          </div>
                        )}
                        {ot.status === OvertimeStatus.REJECTED && (
                          <div className="text-[11px]">
                            <span className="font-semibold text-rose-800">Ditolak: {ot.rejectionReason}</span>
                          </div>
                        )}
                        {ot.status === OvertimeStatus.SUBMITTED && (
                          <span className="text-slate-400 italic">Menunggu persetujuan...</span>
                        )}
                        {ot.status === OvertimeStatus.DETECTED && (
                          <span className="text-slate-400 italic">Belum diajukan</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {ot.status === OvertimeStatus.DETECTED && (
                            <button
                              onClick={() => handleSubmitOvertime(ot.id)}
                              disabled={isSubmitting}
                              className="px-2.5 py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-700 rounded-lg font-semibold transition-colors flex items-center gap-1"
                              title="Ajukan Lembur"
                            >
                              <Send className="w-3 h-3" /> Submit
                            </button>
                          )}
                          {ot.status === OvertimeStatus.SUBMITTED && (
                            <>
                              <button
                                onClick={() => setApprovalModalRecord(ot)}
                                className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg font-semibold transition-colors flex items-center gap-1"
                                title="Setujui Lembur"
                              >
                                <Check className="w-3 h-3" /> Approve
                              </button>
                              <button
                                onClick={() => {
                                  setRejectionModalRecord(ot);
                                  setRejectionReason("");
                                }}
                                className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg font-semibold transition-colors flex items-center gap-1"
                                title="Tolak Lembur"
                              >
                                <X className="w-3 h-3" /> Reject
                              </button>
                            </>
                          )}
                          {ot.status === OvertimeStatus.APPROVED && (
                            <span className="text-emerald-600 font-semibold text-[11px] flex items-center gap-1">
                              <ShieldCheck className="w-3.5 h-3.5" /> Selesai
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* APPROVAL MODAL */}
      {approvalModalRecord && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 border border-slate-200 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Persetujuan Lembur (Approve Overtime)</h3>
                <p className="text-xs text-slate-500">Konfirmasi persetujuan jam lembur staff</p>
              </div>
              <button onClick={() => setApprovalModalRecord(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleApprove} className="space-y-3 text-xs">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1">
                <div><span className="font-semibold">Tanggal:</span> {approvalModalRecord.date}</div>
                <div><span className="font-semibold">Durasi:</span> {approvalModalRecord.overtimeMinutes} Menit ({approvalModalRecord.overtimeHours.toFixed(1)} Jam)</div>
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">Nama Penyetuju (Approver) *</label>
                <input
                  type="text"
                  required
                  value={approverName}
                  onChange={(e) => setApproverName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setApprovalModalRecord(null)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 font-medium"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold"
                >
                  {isSubmitting ? "Menyetujui..." : "Setujui Lembur"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* REJECTION MODAL */}
      {rejectionModalRecord && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 border border-slate-200 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Penolakan Lembur (Reject Overtime)</h3>
                <p className="text-xs text-slate-500">Wajib memberikan alasan penolakan</p>
              </div>
              <button onClick={() => setRejectionModalRecord(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleReject} className="space-y-3 text-xs">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1">
                <div><span className="font-semibold">Tanggal:</span> {rejectionModalRecord.date}</div>
                <div><span className="font-semibold">Durasi:</span> {rejectionModalRecord.overtimeMinutes} Menit</div>
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">Alasan Penolakan (Wajib) *</label>
                <textarea
                  required
                  rows={3}
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Contoh: Lembur tidak diinstruksikan oleh Supervisor / Kepala Cabang"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setRejectionModalRecord(null)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 font-medium"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-semibold"
                >
                  {isSubmitting ? "Menolak..." : "Konfirmasi Penolakan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
