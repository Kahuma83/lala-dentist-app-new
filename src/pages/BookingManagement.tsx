import React, { useState, useEffect, useMemo } from "react";
import { useApp } from "../context/AppContext";
import {
  Booking,
  BookingStatus,
  UserRole,
  PatientProfile,
  DentalDoctor,
  VisitType
} from "../types/domain";
import {
  getTodayDateString,
  getTomorrowDateString,
  formatIndonesianDate
} from "../utils/dateUtils";
import {
  Calendar,
  Clock,
  Plus,
  Search,
  Filter,
  User,
  Building2,
  Stethoscope,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  UserCheck,
  RefreshCw,
  FileText,
  ChevronRight
} from "lucide-react";

export const BookingManagement: React.FC = () => {
  const { repos, currentUser, selectedBranchId, branches, patients } = useApp();

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [branchFilter, setBranchFilter] = useState<string>("ALL");

  // Create Booking Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [patientSearch, setPatientSearch] = useState<string>("");
  const [selectedPatient, setSelectedPatient] = useState<PatientProfile | null>(null);
  const [formBranchId, setFormBranchId] = useState<string>("");
  const [formDoctorId, setFormDoctorId] = useState<string>("doc-syafira");
  const [formDate, setFormDate] = useState<string>(getTomorrowDateString());
  const [formTimeSlot, setFormTimeSlot] = useState<string>("09:00");
  const [formNotes, setFormNotes] = useState<string>("");
  const [doctorsList, setDoctorsList] = useState<DentalDoctor[]>([]);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  // Check-in Modal State (creating Visit from Booking)
  const [checkInBooking, setCheckInBooking] = useState<Booking | null>(null);
  const [checkInComplaint, setCheckInComplaint] = useState<string>("");
  const [isCheckInModalOpen, setIsCheckInModalOpen] = useState<boolean>(false);
  const [bookingToCancel, setBookingToCancel] = useState<Booking | null>(null);
  const [isCancellingBooking, setIsCancellingBooking] = useState<boolean>(false);

  const effectiveBranchId = currentUser?.role === UserRole.BRANCH_ADMIN ? currentUser.assignedBranchId : (branchFilter !== "ALL" ? branchFilter : selectedBranchId);

  const loadData = async () => {
    setLoading(true);
    try {
      const results = await Promise.allSettled([
        repos.booking.getBookings(
          currentUser?.role,
          currentUser?.assignedBranchId
        ),
        repos.branch.getDoctors()
      ]);

      const [bkRes, docRes] = results;
      if (bkRes.status === "fulfilled") setBookings(bkRes.value);
      if (docRes.status === "fulfilled") setDoctorsList(docRes.value);
    } catch (err: any) {
      console.error("Error loading bookings:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [effectiveBranchId]);

  // Set default form branch
  useEffect(() => {
    if (currentUser?.role === UserRole.BRANCH_ADMIN && currentUser.assignedBranchId) {
      setFormBranchId(currentUser.assignedBranchId);
    } else if (branches.length > 0) {
      setFormBranchId(branches[0].id);
    }
  }, [currentUser, branches]);

  // Filtered patients for booking creation search
  const searchedPatients = useMemo(() => {
    if (!patientSearch.trim()) return patients.slice(0, 5);
    const q = patientSearch.toLowerCase();
    return patients.filter(
      (p) =>
        (p.fullName || p.name || "").toLowerCase().includes(q) ||
        (p.phone || "").includes(q) ||
        (p.medicalRecordNumber || "").toLowerCase().includes(q)
    ).slice(0, 5);
  }, [patientSearch, patients]);

  // Filtered booking list for main table
  const filteredBookings = useMemo(() => {
    return bookings.filter((b) => {
      // Branch filter
      if (currentUser?.role === UserRole.BRANCH_ADMIN && currentUser.assignedBranchId) {
        if (b.branchId !== currentUser.assignedBranchId) return false;
      } else if (branchFilter !== "ALL" && b.branchId !== branchFilter) {
        return false;
      }

      // Status filter
      if (statusFilter !== "ALL" && b.status !== statusFilter) {
        return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const pName = (b.patientNameSnapshot || "").toLowerCase();
        const dName = (b.doctorNameSnapshot || "").toLowerCase();
        const notes = (b.notes || "").toLowerCase();
        return pName.includes(q) || dName.includes(q) || notes.includes(q);
      }

      return true;
    });
  }, [bookings, branchFilter, statusFilter, searchQuery, currentUser]);

  const handleCreateBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    if (!selectedPatient) {
      setFormError("Pilih pasien terlebih dahulu dari Master Patients Profile");
      return;
    }

    if (!formBranchId) {
      setFormError("Pilih cabang klinik");
      return;
    }

    if (!formDoctorId) {
      setFormError("Pilih dokter pemeriksa");
      return;
    }

    if (!formDate || !formTimeSlot) {
      setFormError("Tanggal dan slot jam booking wajib diisi");
      return;
    }

    const fullISOString = `${formDate}T${formTimeSlot}:00Z`;

    setIsSubmitting(true);
    try {
      await repos.booking.createBooking(
        {
          patientId: selectedPatient.id,
          branchId: formBranchId,
          doctorId: formDoctorId,
          bookingDateTime: fullISOString,
          timeSlot: formTimeSlot,
          notes: formNotes,
          status: BookingStatus.PENDING
        },
        currentUser?.role,
        currentUser?.assignedBranchId
      );

      setFormSuccess("Booking reservasi berhasil dibuat!");
      loadData();

      setTimeout(() => {
        setIsModalOpen(false);
        setSelectedPatient(null);
        setPatientSearch("");
        setFormNotes("");
        setFormSuccess(null);
      }, 800);
    } catch (err: any) {
      setFormError(err.message || "Gagal membuat booking");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmCancelBooking = async () => {
    if (!bookingToCancel) return;
    setIsCancellingBooking(true);
    try {
      await repos.booking.cancelBooking(bookingToCancel.id, currentUser?.role, currentUser?.assignedBranchId);
      setBookingToCancel(null);
      loadData();
    } catch (err: any) {
      console.error("Gagal membatalkan booking:", err);
    } finally {
      setIsCancellingBooking(false);
    }
  };

  const handleOpenCheckInModal = (b: Booking) => {
    setCheckInBooking(b);
    setCheckInComplaint(b.notes || "Kunjungan periksa sesuai jadwal booking");
    setIsCheckInModalOpen(true);
  };

  const handleConfirmCheckIn = async () => {
    if (!checkInBooking) return;
    setIsSubmitting(true);
    try {
      // Create visit associated with this booking
      await repos.visit.createVisit({
        patientId: checkInBooking.patientId,
        branchId: checkInBooking.branchId,
        visitType: VisitType.BOOKING,
        bookingId: checkInBooking.id,
        doctorId: checkInBooking.doctorId,
        complaint: checkInComplaint
      });

      // Update booking status to CONFIRMED / ARRIVED
      await repos.booking.updateBooking(
        checkInBooking.id,
        { status: BookingStatus.CONFIRMED },
        currentUser?.role,
        currentUser?.assignedBranchId
      );

      setFormSuccess(`Pasien ${checkInBooking.patientNameSnapshot} berhasil di-checkin untuk kedatangan hari ini!`);
      setIsCheckInModalOpen(false);
      loadData();
    } catch (err: any) {
      setFormError(err.message || "Gagal memproses kedatangan pasien");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 pb-12" id="booking-management-page">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-emerald-600 font-semibold text-xs tracking-wider uppercase mb-1">
            <Calendar className="w-4 h-4" />
            Manajemen Booking & Reservasi
          </div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
            Jadwal Booking Pasien Klinik
          </h1>
          <p className="text-slate-500 text-xs mt-1">
            Kelola pendaftaran janji periksa, periksa ketersediaan slot dokter, dan proses kedatangan pasien.
          </p>
        </div>

        <button
          onClick={() => {
            setIsModalOpen(true);
            setFormError(null);
            setFormSuccess(null);
          }}
          className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-4 rounded-xl text-xs transition-colors shadow-sm"
          id="btn-create-booking-modal"
        >
          <Plus className="w-4 h-4" />
          Buat Booking Baru
        </button>
      </div>

      {/* Filter & Controls */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Cari pasien, dokter, atau keluhan..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
            id="input-search-booking"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            id="select-filter-booking-status"
          >
            <option value="ALL">Semua Status Booking</option>
            <option value={BookingStatus.PENDING}>Pending (Terjadwal)</option>
            <option value={BookingStatus.CONFIRMED}>Confirmed (Dikonfirmasi)</option>
            <option value={BookingStatus.CANCELLED}>Cancelled (Dibatalkan)</option>
          </select>

          {/* Super Admin Branch filter */}
          {currentUser?.role === UserRole.SUPER_ADMIN && (
            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              id="select-filter-booking-branch"
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
            title="Refresh List"
            id="btn-refresh-booking"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-emerald-600" : ""}`} />
          </button>
        </div>
      </div>

      {/* Bookings Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500">
            <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin mx-auto mb-3" />
            <p className="text-xs font-medium">Memuat data booking...</p>
          </div>
        ) : filteredBookings.length === 0 ? (
          <div className="p-12 text-center">
            <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-slate-800">Tidak ada jadwal booking</h3>
            <p className="text-xs text-slate-500 mt-1">
              Tidak ada data booking yang sesuai dengan kriteria pencarian Anda.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse" id="table-booking-list">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                  <th className="py-3.5 px-4">Tanggal & Jam Slot</th>
                  <th className="py-3.5 px-4">Nama Pasien</th>
                  <th className="py-3.5 px-4">Dokter & Cabang</th>
                  <th className="py-3.5 px-4">Catatan / Keluhan</th>
                  <th className="py-3.5 px-4">Status Booking</th>
                  <th className="py-3.5 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredBookings.map((b) => {
                  const dateStr = b.bookingDateTime.split("T")[0];
                  const timeSlot = b.timeSlot || b.bookingDateTime.split("T")[1]?.substring(0, 5) || "09:00";

                  return (
                    <tr key={b.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 align-top">
                        <div className="font-extrabold text-slate-900 text-sm flex items-center gap-1.5">
                          <Clock className="w-4 h-4 text-emerald-600" />
                          {timeSlot} WIB
                        </div>
                        <div className="text-slate-500 text-[11px] mt-0.5">
                          {formatIndonesianDate(dateStr)}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 align-top">
                        <div className="font-bold text-slate-900 text-sm">
                          {b.patientNameSnapshot || "Pasien"}
                        </div>
                        <div className="text-slate-400 font-mono text-[10px] mt-0.5">
                          ID: {b.patientId}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 align-top">
                        <div className="font-medium text-slate-800 flex items-center gap-1">
                          <Stethoscope className="w-3.5 h-3.5 text-slate-400" />
                          {b.doctorNameSnapshot || "drg. Praktek"}
                        </div>
                        <div className="text-slate-500 text-[11px] mt-1 flex items-center gap-1">
                          <Building2 className="w-3 h-3 text-slate-400" />
                          {b.branchNameSnapshot || "Lala Dentist"}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 align-top max-w-xs">
                        <p className="text-slate-600 text-xs italic bg-slate-50 p-2 rounded border border-slate-100 line-clamp-2">
                          {b.notes || b.complaint || "Tidak ada catatan"}
                        </p>
                      </td>

                      <td className="py-3.5 px-4 align-top">
                        {b.status === BookingStatus.CONFIRMED && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                            Confirmed
                          </span>
                        )}
                        {b.status === BookingStatus.PENDING && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                            <Clock className="w-3.5 h-3.5 text-amber-500" />
                            Pending
                          </span>
                        )}
                        {b.status === BookingStatus.CANCELLED && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                            <XCircle className="w-3.5 h-3.5 text-rose-500" />
                            Cancelled
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 align-top text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {b.status !== BookingStatus.CANCELLED && (
                            <>
                              <button
                                onClick={() => handleOpenCheckInModal(b)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold rounded-lg text-xs transition-colors border border-emerald-200"
                                title="Proses Kedatangan Pasien di Klinik"
                                id={`btn-checkin-${b.id}`}
                              >
                                <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                                Check-in Kedatangan
                              </button>

                              <button
                                onClick={() => setBookingToCancel(b)}
                                className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors border border-transparent hover:border-rose-200 cursor-pointer"
                                title="Batalkan Booking"
                                id={`btn-cancel-${b.id}`}
                              >
                                <XCircle className="w-4 h-4" />
                              </button>
                            </>
                          )}
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

      {/* Create Booking Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in" id="modal-create-booking">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 border border-slate-100 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-emerald-600" />
                Buat Booking Reservasi Baru
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                ✕
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-rose-50 text-rose-800 border border-rose-200 rounded-lg text-xs font-medium flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            {formSuccess && (
              <div className="p-3 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-medium flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>{formSuccess}</span>
              </div>
            )}

            <form onSubmit={handleCreateBooking} className="space-y-4">
              {/* Step 1: Patient Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  1. Cari Pasien dari Master Patient Profile:
                </label>
                {selectedPatient ? (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
                    <div>
                      <div className="font-bold text-emerald-900 text-xs">
                        {selectedPatient.fullName}
                      </div>
                      <div className="text-[11px] text-emerald-700">
                        {selectedPatient.phone} — {selectedPatient.medicalRecordNumber || "No RM"}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedPatient(null)}
                      className="text-xs text-emerald-700 hover:underline font-semibold"
                    >
                      Ganti
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <input
                      type="text"
                      placeholder="Ketik nama, HP, atau No RM pasien..."
                      value={patientSearch}
                      onChange={(e) => setPatientSearch(e.target.value)}
                      className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      id="input-modal-patient-search"
                    />
                    <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-36 overflow-y-auto bg-slate-50/50">
                      {searchedPatients.map((p) => (
                        <div
                          key={p.id}
                          onClick={() => setSelectedPatient(p)}
                          className="p-2 text-xs hover:bg-emerald-50 cursor-pointer transition-colors flex items-center justify-between"
                        >
                          <div>
                            <span className="font-bold text-slate-800">{p.fullName}</span>
                            <span className="text-slate-500 ml-2">({p.phone})</span>
                          </div>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {p.medicalRecordNumber || p.id}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Step 2: Branch & Doctor */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    2. Cabang Klinik:
                  </label>
                  <select
                    value={formBranchId}
                    onChange={(e) => setFormBranchId(e.target.value)}
                    disabled={currentUser?.role === UserRole.BRANCH_ADMIN}
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg p-2.5 font-medium disabled:opacity-75"
                    id="select-modal-branch"
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    3. Dokter Pemeriksa:
                  </label>
                  <select
                    value={formDoctorId}
                    onChange={(e) => setFormDoctorId(e.target.value)}
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg p-2.5 font-medium"
                    id="select-modal-doctor"
                  >
                    {doctorsList.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Step 3: Date & Slot Time */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    4. Tanggal Booking:
                  </label>
                  <input
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg p-2.5 font-medium"
                    id="input-modal-date"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    5. Jam Slot Praktek:
                  </label>
                  <select
                    value={formTimeSlot}
                    onChange={(e) => setFormTimeSlot(e.target.value)}
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg p-2.5 font-medium"
                    id="select-modal-timeslot"
                  >
                    <option value="09:00">09:00 WIB</option>
                    <option value="10:30">10:30 WIB</option>
                    <option value="13:00">13:00 WIB</option>
                    <option value="14:30">14:30 WIB</option>
                    <option value="16:00">16:00 WIB</option>
                    <option value="18:30">18:30 WIB</option>
                  </select>
                </div>
              </div>

              {/* Step 4: Complaint / Reason */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  6. Keluhan / Keperluan Berobat:
                </label>
                <textarea
                  rows={2}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Contoh: Gigi belakang sakit saat mengunyah"
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  id="textarea-modal-notes"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Pasien hanya menyampaikan keluhan/keperluan berobat. Jenis tindakan medis ditentukan oleh Admin Cabang & Dokter di klinik.
                </p>
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
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-colors shadow-sm disabled:opacity-50"
                  id="btn-submit-booking"
                >
                  {isSubmitting ? "Menyimpan..." : "Simpan Booking"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Check-in Modal */}
      {isCheckInModalOpen && checkInBooking && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in" id="modal-checkin">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 border border-slate-100 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-emerald-600" />
                Check-in Kedatangan Pasien
              </h3>
              <button onClick={() => setIsCheckInModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                ✕
              </button>
            </div>

            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl space-y-1">
              <div className="font-bold text-emerald-900 text-sm">
                {checkInBooking.patientNameSnapshot}
              </div>
              <div className="text-xs text-emerald-700">
                Jadwal Booking: {checkInBooking.bookingDateTime.split("T")[1]?.substring(0, 5)} WIB ({checkInBooking.doctorNameSnapshot})
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Keluhan Utama Kedatangan Aktual:
              </label>
              <textarea
                rows={3}
                value={checkInComplaint}
                onChange={(e) => setCheckInComplaint(e.target.value)}
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsCheckInModalOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmCheckIn}
                disabled={isSubmitting}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-colors shadow-sm disabled:opacity-50"
                id="btn-confirm-checkin"
              >
                {isSubmitting ? "Memproses..." : "Konfirmasi Kedatangan"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Konfirmasi Batalkan Booking */}
      {bookingToCancel && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-4">
              <XCircle className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900 text-center">
              Batalkan Booking Pasien
            </h3>
            <p className="text-xs text-slate-600 text-center mt-2 leading-relaxed">
              Apakah Anda yakin ingin membatalkan jadwal booking pasien <strong>{bookingToCancel.patientNameSnapshot || "Pasien"}</strong> pada tanggal <strong>{bookingToCancel.bookingDateTime ? bookingToCancel.bookingDateTime.split("T")[0] : "-"}</strong> jam <strong>{bookingToCancel.timeSlot || "-"}</strong>?
            </p>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={isCancellingBooking}
                onClick={() => setBookingToCancel(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Kembali
              </button>
              <button
                type="button"
                disabled={isCancellingBooking}
                onClick={handleConfirmCancelBooking}
                className="px-4 py-2 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {isCancellingBooking ? "Membatalkan..." : "Ya, Batalkan Booking"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
