import React, { useState, useMemo } from "react";
import { useApp } from "../context/AppContext";
import {
  UserRole,
  StaffPosition,
  AttendanceStatus,
  AttendanceMethod,
  Attendance
} from "../types/domain";
import {
  Clock,
  UserCheck,
  Calendar,
  Search,
  Filter,
  Plus,
  AlertCircle,
  CheckCircle2,
  X,
  LogOut,
  Camera,
  FileText,
  UserX,
  Building2,
  AlertTriangle
} from "lucide-react";
import { AppClock } from "../utils/clock";

export const AttendanceManager: React.FC = () => {
  const {
    currentUser,
    selectedBranchId,
    branches,
    doctors,
    staff,
    attendances,
    attendanceRepo,
    refreshData
  } = useApp();

  const isSuper = currentUser?.role === UserRole.SUPER_ADMIN;
  const isBranchAdmin = currentUser?.role === UserRole.BRANCH_ADMIN;
  const isDoctor = currentUser?.role === UserRole.DOCTOR;
  const userBranchId = isBranchAdmin ? currentUser?.assignedBranchId : selectedBranchId;

  // Filter States
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBranch, setSelectedBranch] = useState<string>(userBranchId || "ALL");
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");

  // Feedback notifications
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Modals
  const [isCheckInModalOpen, setIsCheckInModalOpen] = useState(false);
  const [isCheckOutModalOpen, setIsCheckOutModalOpen] = useState(false);
  const [isAbsenceModalOpen, setIsAbsenceModalOpen] = useState(false);
  const [targetAttendanceForCheckout, setTargetAttendanceForCheckout] = useState<Attendance | null>(null);

  // CheckIn Form
  const [checkInForm, setCheckInForm] = useState({
    staffId: "",
    branchId: userBranchId || "branch-gebang",
    date: AppClock.todayDateString(),
    checkInTime: "07:55",
    method: AttendanceMethod.WEB,
    photoPath: "",
    notes: ""
  });

  // CheckOut Form
  const [checkOutForm, setCheckOutForm] = useState({
    attendanceId: "",
    checkOutTime: "14:00",
    method: AttendanceMethod.WEB,
    photoPath: "",
    notes: ""
  });

  // Absence Form
  const [absenceForm, setAbsenceForm] = useState({
    staffId: "",
    branchId: userBranchId || "branch-gebang",
    date: AppClock.todayDateString(),
    attendanceStatus: AttendanceStatus.SICK as AttendanceStatus.SICK | AttendanceStatus.LEAVE | AttendanceStatus.OFF | AttendanceStatus.ABSENT,
    notes: ""
  });

  const showSuccess = (msg: string) => {
    setSuccessMessage(msg);
    setErrorMessage(null);
    setTimeout(() => setSuccessMessage(null), 4000);
  };

  const showError = (msg: string) => {
    setErrorMessage(msg);
    setSuccessMessage(null);
  };

  // Find active staff accessible to current user
  const accessibleStaff = useMemo(() => {
    let list = staff.filter((s) => s.active);
    if (isBranchAdmin && userBranchId) {
      list = list.filter((s) => !s.branchId || s.branchId === userBranchId);
    }
    return list;
  }, [staff, isBranchAdmin, userBranchId]);

  // Filtered attendances
  const filteredAttendances = useMemo(() => {
    let items = [...attendances];

    // Branch isolation
    if (isBranchAdmin && userBranchId) {
      items = items.filter((a) => a.branchId === userBranchId);
    } else if (selectedBranch !== "ALL") {
      items = items.filter((a) => a.branchId === selectedBranch);
    }

    // Doctor isolation
    if (isDoctor && currentUser?.staffId) {
      items = items.filter((a) => a.staffId === currentUser.staffId);
    }

    // Date filter
    if (selectedDate) {
      items = items.filter((a) => a.date === selectedDate);
    }

    // Status filter
    if (selectedStatus !== "ALL") {
      items = items.filter((a) => a.attendanceStatus === selectedStatus);
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter((a) => {
        const stf = staff.find((s) => s.id === a.staffId);
        const name = stf ? stf.fullName.toLowerCase() : "";
        const code = stf ? stf.employeeCode.toLowerCase() : "";
        return name.includes(q) || code.includes(q) || a.notes?.toLowerCase().includes(q);
      });
    }

    return items.sort((a, b) => {
      const dateCmp = b.date.localeCompare(a.date);
      if (dateCmp !== 0) return dateCmp;
      return (b.actualCheckInAt || "").localeCompare(a.actualCheckInAt || "");
    });
  }, [attendances, isBranchAdmin, userBranchId, selectedBranch, isDoctor, currentUser, selectedDate, selectedStatus, searchQuery, staff]);

  // Handlers
  const handleCheckInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkInForm.staffId) {
      showError("Pilih staff atau dokter yang akan check-in");
      return;
    }

    try {
      setIsSubmitting(true);
      await attendanceRepo.checkIn(
        {
          staffId: checkInForm.staffId,
          branchId: checkInForm.branchId || undefined,
          date: checkInForm.date,
          checkInTime: checkInForm.checkInTime,
          photoPath: checkInForm.photoPath || null,
          method: checkInForm.method,
          notes: checkInForm.notes || undefined,
          actorRole: currentUser?.role,
          actorBranchId: userBranchId,
          actorId: currentUser?.id
        },
        currentUser?.role,
        userBranchId
      );

      await refreshData();
      showSuccess("Check-in berhasil dicatat sebagai fakta kehadiran!");
      setIsCheckInModalOpen(false);
      setCheckInForm({
        staffId: "",
        branchId: userBranchId || "branch-gebang",
        date: AppClock.todayDateString(),
        checkInTime: "07:55",
        method: AttendanceMethod.WEB,
        photoPath: "",
        notes: ""
      });
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Gagal melakukan check-in");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenCheckoutModal = (att: Attendance) => {
    setTargetAttendanceForCheckout(att);
    setCheckOutForm({
      attendanceId: att.id,
      checkOutTime: "14:00",
      method: AttendanceMethod.WEB,
      photoPath: "",
      notes: ""
    });
    setIsCheckOutModalOpen(true);
  };

  const handleCheckOutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkOutForm.attendanceId) {
      showError("Data absensi tidak valid");
      return;
    }

    try {
      setIsSubmitting(true);
      await attendanceRepo.checkOut(
        {
          attendanceId: checkOutForm.attendanceId,
          checkOutTime: checkOutForm.checkOutTime,
          photoPath: checkOutForm.photoPath || null,
          method: checkOutForm.method,
          notes: checkOutForm.notes || undefined,
          actorRole: currentUser?.role,
          actorBranchId: userBranchId,
          actorId: currentUser?.id
        },
        currentUser?.role,
        userBranchId
      );

      await refreshData();
      showSuccess("Check-out berhasil dicatat!");
      setIsCheckOutModalOpen(false);
      setTargetAttendanceForCheckout(null);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Gagal melakukan check-out");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAbsenceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!absenceForm.staffId) {
      showError("Pilih staff atau dokter");
      return;
    }

    try {
      setIsSubmitting(true);
      await attendanceRepo.createAbsence(
        {
          staffId: absenceForm.staffId,
          date: absenceForm.date,
          attendanceStatus: absenceForm.attendanceStatus,
          branchId: absenceForm.branchId || undefined,
          notes: absenceForm.notes || undefined,
          actorRole: currentUser?.role,
          actorBranchId: userBranchId,
          actorId: currentUser?.id
        },
        currentUser?.role,
        userBranchId
      );

      await refreshData();
      showSuccess(`Pencatatan status ${absenceForm.attendanceStatus} berhasil disimpan!`);
      setIsAbsenceModalOpen(false);
      setAbsenceForm({
        staffId: "",
        branchId: userBranchId || "branch-gebang",
        date: AppClock.todayDateString(),
        attendanceStatus: AttendanceStatus.SICK,
        notes: ""
      });
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Gagal mencatat ketidakhadiran");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4" id="attendance-module-container">
      {/* Alerts */}
      {errorMessage && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-start gap-3 text-rose-800 text-xs animate-in fade-in" id="att-error-alert">
          <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
          <div className="flex-1 font-medium">{errorMessage}</div>
          <button onClick={() => setErrorMessage(null)} className="text-rose-500 hover:text-rose-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMessage && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3 text-emerald-800 text-xs animate-in fade-in" id="att-success-alert">
          <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
          <div className="flex-1 font-medium">{successMessage}</div>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-500 hover:text-emerald-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Action and Filter Header */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative w-full sm:w-60">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Cari staff, kode, catatan..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              id="att-search-input"
            />
          </div>

          {/* Branch Filter */}
          {isSuper && (
            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-2.5 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                id="att-branch-select"
              >
                <option value="ALL">Semua Cabang</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Date Filter */}
          <div className="flex items-center gap-1">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-2.5 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              id="att-date-input"
            />
            {selectedDate && (
              <button
                onClick={() => setSelectedDate("")}
                className="text-slate-400 hover:text-slate-600 p-1 text-xs"
                title="Reset Tanggal"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Status Filter */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-2.5 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            id="att-status-select"
          >
            <option value="ALL">Semua Status</option>
            <option value={AttendanceStatus.PRESENT}>Hadir (PRESENT)</option>
            <option value={AttendanceStatus.LATE}>Terlambat (LATE)</option>
            <option value={AttendanceStatus.ABSENT}>Alpa (ABSENT)</option>
            <option value={AttendanceStatus.SICK}>Sakit (SICK)</option>
            <option value={AttendanceStatus.LEAVE}>Cuti / Izin (LEAVE)</option>
            <option value={AttendanceStatus.OFF}>Libur (OFF)</option>
          </select>
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsAbsenceModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 transition-colors"
            id="btn-open-absence-modal"
          >
            <UserX className="w-3.5 h-3.5 text-amber-600" />
            Catat Izin / Sakit / Alpha
          </button>

          <button
            onClick={() => setIsCheckInModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-colors"
            id="btn-open-checkin-modal"
          >
            <Plus className="w-3.5 h-3.5" />
            Catat Check-In
          </button>
        </div>
      </div>

      {/* Attendance SSOT Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700" id="att-table">
            <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600">
              <tr>
                <th className="px-4 py-3">Tanggal</th>
                <th className="px-4 py-3">Staff / Dokter</th>
                <th className="px-4 py-3">Cabang & Jadwal Snapshot</th>
                <th className="px-4 py-3 text-center">Status Kehadiran</th>
                <th className="px-4 py-3">Waktu Check-In</th>
                <th className="px-4 py-3">Waktu Check-Out</th>
                <th className="px-4 py-3">Keterangan</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredAttendances.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                    Tidak ada catatan kehadiran yang sesuai dengan filter.
                  </td>
                </tr>
              ) : (
                filteredAttendances.map((att) => {
                  const stf = staff.find((s) => s.id === att.staffId);
                  const br = branches.find((b) => b.id === att.branchId);

                  return (
                    <tr key={att.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-900 whitespace-nowrap">
                        {att.date}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{stf?.fullName || att.staffId}</div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                          <span>{stf?.employeeCode || "-"}</span>
                          <span>•</span>
                          <span>{stf?.position || "Staff"}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-800">{br?.name || att.branchId}</div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          {att.scheduledStartAt} - {att.scheduledEndAt}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {att.attendanceStatus === AttendanceStatus.PRESENT && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                            HADIR
                          </span>
                        )}
                        {att.attendanceStatus === AttendanceStatus.LATE && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                            TELAT (+{att.lateMinutes}m)
                          </span>
                        )}
                        {att.attendanceStatus === AttendanceStatus.ABSENT && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                            ALPA
                          </span>
                        )}
                        {att.attendanceStatus === AttendanceStatus.SICK && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">
                            SAKIT
                          </span>
                        )}
                        {att.attendanceStatus === AttendanceStatus.LEAVE && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800">
                            CUTI/IZIN
                          </span>
                        )}
                        {att.attendanceStatus === AttendanceStatus.OFF && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                            LIBUR
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {att.actualCheckInAt ? (
                          <div>
                            <div className="font-semibold text-slate-900 font-mono">
                              {att.actualCheckInAt.includes("T")
                                ? att.actualCheckInAt.split("T")[1]?.substring(0, 5)
                                : att.actualCheckInAt}
                            </div>
                            <div className="text-[10px] text-slate-400 flex items-center gap-1">
                              <span>{att.checkInMethod}</span>
                              {att.checkInPhotoPath && <Camera className="w-3 h-3 text-emerald-600" />}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {att.actualCheckOutAt ? (
                          <div>
                            <div className="font-semibold text-slate-900 font-mono">
                              {att.actualCheckOutAt.includes("T")
                                ? att.actualCheckOutAt.split("T")[1]?.substring(0, 5)
                                : att.actualCheckOutAt}
                            </div>
                            <div className="text-[10px] text-slate-400 flex items-center gap-1">
                              <span>{att.checkOutMethod || "WEB"}</span>
                              {att.earlyCheckoutMinutes > 0 && (
                                <span className="text-amber-600 font-medium">
                                  (pulang cepat -{att.earlyCheckoutMinutes}m)
                                </span>
                              )}
                              {att.checkOutPhotoPath && <Camera className="w-3 h-3 text-emerald-600" />}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Belum checkout</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600 max-w-xs truncate">
                        {att.notes || "-"}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {att.actualCheckInAt && !att.actualCheckOutAt ? (
                          <button
                            onClick={() => handleOpenCheckoutModal(att)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200"
                            id={`btn-checkout-${att.id}`}
                          >
                            <LogOut className="w-3.5 h-3.5" />
                            Check-Out
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-400">Selesai</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* =========================================================================
          MODAL 1: CHECK-IN
      ========================================================================= */}
      {isCheckInModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-100 animate-in fade-in">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Clock className="w-4 h-4 text-emerald-600" />
                Pencatatan Check-In Kehadiran
              </h3>
              <button
                onClick={() => setIsCheckInModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCheckInSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Pilih Staff / Dokter *
                </label>
                <select
                  required
                  value={checkInForm.staffId}
                  onChange={(e) => setCheckInForm({ ...checkInForm, staffId: e.target.value })}
                  className="w-full text-xs border border-slate-200 rounded-lg p-2.5 focus:ring-2 focus:ring-emerald-500/20"
                  id="checkin-staff-select"
                >
                  <option value="">-- Pilih Staff --</option>
                  {accessibleStaff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.fullName} ({s.position} - {s.employeeCode})
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-400 mt-1">
                  Jadwal shift / doctor schedule akan otomatis di-snapshot sebagai SSOT.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Tanggal *</label>
                  <input
                    type="date"
                    required
                    value={checkInForm.date}
                    onChange={(e) => setCheckInForm({ ...checkInForm, date: e.target.value })}
                    className="w-full text-xs border border-slate-200 rounded-lg p-2 focus:ring-2 focus:ring-emerald-500/20"
                    id="checkin-date-input"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Waktu Check-In *</label>
                  <input
                    type="text"
                    required
                    placeholder="HH:mm (misal 07:55)"
                    value={checkInForm.checkInTime}
                    onChange={(e) => setCheckInForm({ ...checkInForm, checkInTime: e.target.value })}
                    className="w-full text-xs border border-slate-200 rounded-lg p-2 focus:ring-2 focus:ring-emerald-500/20 font-mono"
                    id="checkin-time-input"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Cabang Check-In</label>
                <select
                  value={checkInForm.branchId}
                  onChange={(e) => setCheckInForm({ ...checkInForm, branchId: e.target.value })}
                  className="w-full text-xs border border-slate-200 rounded-lg p-2.5 focus:ring-2 focus:ring-emerald-500/20"
                  disabled={isBranchAdmin}
                  id="checkin-branch-select"
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Path Foto Metadata (Simulasi Kamera)
                </label>
                <input
                  type="text"
                  placeholder="uploads/attendance/checkin.jpg"
                  value={checkInForm.photoPath}
                  onChange={(e) => setCheckInForm({ ...checkInForm, photoPath: e.target.value })}
                  className="w-full text-xs border border-slate-200 rounded-lg p-2 focus:ring-2 focus:ring-emerald-500/20"
                  id="checkin-photo-input"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Catatan</label>
                <textarea
                  rows={2}
                  placeholder="Catatan tambahan (misal: izin ganti jadwal, dsb)"
                  value={checkInForm.notes}
                  onChange={(e) => setCheckInForm({ ...checkInForm, notes: e.target.value })}
                  className="w-full text-xs border border-slate-200 rounded-lg p-2 focus:ring-2 focus:ring-emerald-500/20"
                  id="checkin-notes-input"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCheckInModalOpen(false)}
                  className="px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-sm disabled:opacity-50"
                  id="btn-submit-checkin"
                >
                  {isSubmitting ? "Menyimpan..." : "Simpan Check-In"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 2: CHECK-OUT
      ========================================================================= */}
      {isCheckOutModalOpen && targetAttendanceForCheckout && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-100 animate-in fade-in">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <LogOut className="w-4 h-4 text-amber-600" />
                Catat Check-Out Kehadiran
              </h3>
              <button
                onClick={() => setIsCheckOutModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCheckOutSubmit} className="mt-4 space-y-4">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                <div className="font-semibold text-slate-800">
                  {staff.find((s) => s.id === targetAttendanceForCheckout.staffId)?.fullName}
                </div>
                <div className="text-slate-500 mt-0.5">
                  Tanggal: {targetAttendanceForCheckout.date} • Jadwal:{" "}
                  {targetAttendanceForCheckout.scheduledStartAt} - {targetAttendanceForCheckout.scheduledEndAt}
                </div>
                <div className="text-slate-500">
                  Waktu Check-In: {targetAttendanceForCheckout.actualCheckInAt}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Waktu Check-Out *</label>
                <input
                  type="text"
                  required
                  placeholder="HH:mm (misal 14:05)"
                  value={checkOutForm.checkOutTime}
                  onChange={(e) => setCheckOutForm({ ...checkOutForm, checkOutTime: e.target.value })}
                  className="w-full text-xs border border-slate-200 rounded-lg p-2.5 focus:ring-2 focus:ring-amber-500/20 font-mono"
                  id="checkout-time-input"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Path Foto Metadata (Simulasi Kamera)
                </label>
                <input
                  type="text"
                  placeholder="uploads/attendance/checkout.jpg"
                  value={checkOutForm.photoPath}
                  onChange={(e) => setCheckOutForm({ ...checkOutForm, photoPath: e.target.value })}
                  className="w-full text-xs border border-slate-200 rounded-lg p-2 focus:ring-2 focus:ring-amber-500/20"
                  id="checkout-photo-input"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Catatan Tambahan</label>
                <textarea
                  rows={2}
                  value={checkOutForm.notes}
                  onChange={(e) => setCheckOutForm({ ...checkOutForm, notes: e.target.value })}
                  className="w-full text-xs border border-slate-200 rounded-lg p-2 focus:ring-2 focus:ring-amber-500/20"
                  id="checkout-notes-input"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCheckOutModalOpen(false)}
                  className="px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white rounded-lg shadow-sm disabled:opacity-50"
                  id="btn-submit-checkout"
                >
                  {isSubmitting ? "Menyimpan..." : "Simpan Check-Out"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 3: KETIDAKHADIRAN (SICK / LEAVE / OFF / ABSENT)
      ========================================================================= */}
      {isAbsenceModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-100 animate-in fade-in">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <UserX className="w-4 h-4 text-purple-600" />
                Pencatatan Ketidakhadiran Staff
              </h3>
              <button
                onClick={() => setIsAbsenceModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAbsenceSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Pilih Staff / Dokter *
                </label>
                <select
                  required
                  value={absenceForm.staffId}
                  onChange={(e) => setAbsenceForm({ ...absenceForm, staffId: e.target.value })}
                  className="w-full text-xs border border-slate-200 rounded-lg p-2.5 focus:ring-2 focus:ring-purple-500/20"
                  id="absence-staff-select"
                >
                  <option value="">-- Pilih Staff --</option>
                  {accessibleStaff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.fullName} ({s.position} - {s.employeeCode})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Tanggal *</label>
                  <input
                    type="date"
                    required
                    value={absenceForm.date}
                    onChange={(e) => setAbsenceForm({ ...absenceForm, date: e.target.value })}
                    className="w-full text-xs border border-slate-200 rounded-lg p-2 focus:ring-2 focus:ring-purple-500/20"
                    id="absence-date-input"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Status *</label>
                  <select
                    value={absenceForm.attendanceStatus}
                    onChange={(e) =>
                      setAbsenceForm({
                        ...absenceForm,
                        attendanceStatus: e.target.value as any
                      })
                    }
                    className="w-full text-xs border border-slate-200 rounded-lg p-2 focus:ring-2 focus:ring-purple-500/20"
                    id="absence-status-select"
                  >
                    <option value={AttendanceStatus.SICK}>Sakit (SICK)</option>
                    <option value={AttendanceStatus.LEAVE}>Cuti / Izin (LEAVE)</option>
                    <option value={AttendanceStatus.OFF}>Hari Libur (OFF)</option>
                    <option value={AttendanceStatus.ABSENT}>Alpa / Mangkir (ABSENT)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Alasan / Catatan</label>
                <textarea
                  rows={2}
                  required
                  placeholder="Keterangan surat dokter, persetujuan cuti, dsb..."
                  value={absenceForm.notes}
                  onChange={(e) => setAbsenceForm({ ...absenceForm, notes: e.target.value })}
                  className="w-full text-xs border border-slate-200 rounded-lg p-2 focus:ring-2 focus:ring-purple-500/20"
                  id="absence-notes-input"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAbsenceModalOpen(false)}
                  className="px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 text-xs font-semibold bg-purple-600 hover:bg-purple-700 text-white rounded-lg shadow-sm disabled:opacity-50"
                  id="btn-submit-absence"
                >
                  {isSubmitting ? "Menyimpan..." : "Simpan Ketidakhadiran"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
