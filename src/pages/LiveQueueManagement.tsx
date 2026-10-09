import React, { useState, useEffect } from "react";
import { useApp } from "../context/AppContext";
import { UserRole, QueueStatus, QueueItem, LiveQueueSnapshot, PatientVisit, ScheduleStatus, PatientProfile, Booking, BookingStatus, VisitType, VisitStatus } from "../types/domain";
import { AppClock } from "../utils/clock";
import { formatIndonesianDate } from "../utils/dateUtils";
import {
  ListOrdered,
  Clock,
  UserCheck,
  Play,
  CheckCircle2,
  XCircle,
  Clock3,
  Building2,
  User,
  Activity,
  AlertCircle,
  Plus,
  RefreshCw,
  Edit2,
  X
} from "lucide-react";

export const LiveQueueManagement: React.FC = () => {
  const { currentUser, repos, branches, doctors, doctorSchedules, refreshData } = useApp();

  const isSuper = currentUser?.role === UserRole.SUPER_ADMIN;
  const isBranchAdmin = currentUser?.role === UserRole.BRANCH_ADMIN;
  const isDoctor = currentUser?.role === UserRole.DOCTOR;
  const isAssistant = currentUser?.role === UserRole.DOCTOR_ASSISTANT;
  const isPatient = currentUser?.role === UserRole.PATIENT;

  // Selected filters
  const [selectedBranchId, setSelectedBranchId] = useState<string>(
    currentUser?.assignedBranchId || "branch-gebang"
  );
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>(
    isDoctor ? currentUser?.id || "doc-syafira" : "ALL"
  );
  const [selectedDate, setSelectedDate] = useState<string>(AppClock.todayDateString());

  const [snapshot, setSnapshot] = useState<LiveQueueSnapshot | null>(null);
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [visits, setVisits] = useState<PatientVisit[]>([]);
  const [patientsList, setPatientsList] = useState<PatientProfile[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Modals state
  const [showCheckInModal, setShowCheckInModal] = useState<boolean>(false);
  const [checkInMode, setCheckInMode] = useState<"booking" | "walkin">("booking");
  const [selectedVisitIdForCheckIn, setSelectedVisitIdForCheckIn] = useState<string>("");
  const [walkInPatientId, setWalkInPatientId] = useState<string>("");
  const [walkInComplaint, setWalkInComplaint] = useState<string>("Pemeriksaan Gigi");
  const [walkInDoctorId, setWalkInDoctorId] = useState<string>("");
  const [allBookingsList, setAllBookingsList] = useState<Booking[]>([]);
  const [customDuration, setCustomDuration] = useState<number>(30);

  const [editDurationQueueId, setEditDurationQueueId] = useState<string | null>(null);
  const [newDuration, setNewDuration] = useState<number>(30);

  // Quick Add Time Modal state
  const [addTimeModalItem, setAddTimeModalItem] = useState<QueueItem | null>(null);
  const [addedMinutesChoice, setAddedMinutesChoice] = useState<number>(15);
  const [durationReason, setDurationReason] = useState<string>("Tindakan membutuhkan waktu tambahan");
  const [customReasonNotes, setCustomReasonNotes] = useState<string>("");
  const [submittingDuration, setSubmittingDuration] = useState<boolean>(false);
  const [scheduleWarning, setScheduleWarning] = useState<string | null>(null);

  // Doctor Schedule Warning Check Helper
  const checkDoctorScheduleWarning = (item: QueueItem, addedMinutes: number): string | null => {
    try {
      const opDate = (item.arrivalAt || item.checkInTime || "").split("T")[0];
      const scheds = doctorSchedules || [];
      const doctorSched = scheds.find(
        (s) => s.doctorId === item.doctorId && s.date === opDate && s.status === ScheduleStatus.ACTIVE
      );
      const schedEndTimeStr = doctorSched?.endTime || "17:00"; // Default 17:00 if not set

      // Calculate projected finish time
      const curDur = item.estimatedDurationMinutes || 30;
      const newDur = curDur + addedMinutes;

      let startMs = Date.now();
      if (item.actualServiceStartAt) {
        startMs = new Date(item.actualServiceStartAt).getTime();
      } else if (item.estimatedServiceAt) {
        startMs = new Date(item.estimatedServiceAt).getTime();
      }

      let runningMs = startMs + newDur * 60 * 1000;

      // Add remaining waiting queue items for this doctor
      const remainingItems = queueItems.filter(
        (q) =>
          q.doctorId === item.doctorId &&
          q.id !== item.id &&
          (q.status === QueueStatus.WAITING || q.status === QueueStatus.IN_PREPARATION)
      );
      remainingItems.forEach((rq) => {
        runningMs += (rq.estimatedDurationMinutes || 30) * 60 * 1000;
      });

      const projectedEndDate = new Date(runningMs);
      const [schedH, schedM] = schedEndTimeStr.split(":").map(Number);
      const limitDate = new Date(projectedEndDate);
      limitDate.setHours(schedH || 17, schedM || 0, 0, 0);

      if (projectedEndDate > limitDate) {
        const timeFormatted = projectedEndDate.toLocaleTimeString("id-ID", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false
        });
        return `Perhatian: Perubahan durasi menyebabkan estimasi antrean melewati jam operasional dokter (${schedEndTimeStr}) sampai sekitar ${timeFormatted}.`;
      }
    } catch {
      // Ignore calculation error
    }
    return null;
  };

  const handleOpenAddTimeModal = (item: QueueItem) => {
    setAddTimeModalItem(item);
    setAddedMinutesChoice(15);
    setDurationReason("Tindakan membutuhkan waktu tambahan");
    setCustomReasonNotes("");
    setScheduleWarning(checkDoctorScheduleWarning(item, 15));
  };

  const handleSelectAddedMinutes = (m: number) => {
    setAddedMinutesChoice(m);
    if (addTimeModalItem) {
      setScheduleWarning(checkDoctorScheduleWarning(addTimeModalItem, m));
    }
  };

  const handleConfirmAddTime = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addTimeModalItem) return;

    setSubmittingDuration(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const prevDur = addTimeModalItem.estimatedDurationMinutes || 30;
      const newDur = prevDur + addedMinutesChoice;
      const finalReason =
        durationReason === "Lainnya"
          ? customReasonNotes || "Lainnya"
          : customReasonNotes
          ? `${durationReason}: ${customReasonNotes}`
          : durationReason;

      await repos.queue.updateEstimatedDuration(
        addTimeModalItem.id,
        newDur,
        currentUser?.role,
        currentUser?.assignedBranchId,
        currentUser?.id,
        {
          reason: finalReason,
          addedMinutes: addedMinutesChoice,
          previousDurationMinutes: prevDur,
          actorNameSnapshot: currentUser?.name || "User Klinik"
        }
      );

      setActionSuccess(`Berhasil menambah +${addedMinutesChoice} menit pada antrean pasien ${addTimeModalItem.patientNameSnapshot || ""}.`);
      setAddTimeModalItem(null);
      await loadQueueData();
      await refreshData();
    } catch (err: any) {
      setActionError(err.message || "Gagal menambah waktu tindakan.");
    } finally {
      setSubmittingDuration(false);
    }
  };

  useEffect(() => {
    loadQueueData();
  }, [selectedBranchId, selectedDoctorId, selectedDate, currentUser]);

  const loadQueueData = async () => {
    try {
      setLoading(true);
      setActionError(null);

      const branchId = (isBranchAdmin || isAssistant) ? currentUser?.assignedBranchId || selectedBranchId : selectedBranchId;
      const docId = isDoctor ? currentUser?.id || "doc-syafira" : selectedDoctorId;

      const snap = await repos.queue.getLiveQueueSnapshot(
        branchId,
        selectedDate,
        docId === "ALL" ? undefined : docId,
        currentUser?.role,
        currentUser?.assignedBranchId,
        currentUser?.id
      );

      setSnapshot(snap);

      const items = await repos.queue.getQueueByBranch(
        branchId,
        currentUser?.role,
        currentUser?.assignedBranchId
      );

      const filteredItems = items.filter((q) => {
        const qDate = (q.arrivalAt || q.checkInTime || "").split("T")[0];
        if (qDate !== selectedDate) return false;
        if (docId !== "ALL" && q.doctorId !== docId) return false;
        if (isPatient && currentUser?.id && q.patientId !== currentUser.id) return false;
        return true;
      });

      setQueueItems(filteredItems);

      // Load visits for Check-In dropdown
      let allVisits: PatientVisit[] = [];
      try {
        allVisits = await repos.visit.getVisits();
      } catch (vErr) {
        console.warn("getVisits fallback:", vErr);
        allVisits = await repos.visit.getVisitsByBranch(
          branchId,
          currentUser?.role,
          currentUser?.assignedBranchId
        );
      }

      // Filter eligible visits for current branch
      const eligibleVisits = allVisits.filter((v) => {
        if (branchId && v.branchId && v.branchId !== branchId) return false;
        if (v.visitStatus === VisitStatus.COMPLETED || v.visitStatus === VisitStatus.CANCELLED) return false;
        if (filteredItems.some((q) => q.visitId === v.id)) return false;
        return true;
      });

      // Load bookings for check-in options
      let allBookings: Booking[] = [];
      try {
        allBookings = await repos.booking.getBookings(
          currentUser?.role,
          currentUser?.assignedBranchId
        );
      } catch (bErr) {
        console.warn("getBookings fallback:", bErr);
        allBookings = await repos.booking.getBookingsByBranch(
          branchId,
          currentUser?.role,
          currentUser?.assignedBranchId
        );
      }
      setAllBookingsList(allBookings);

      // Bookings eligible for check-in: matching branch, not cancelled, not already completed or queued
      const eligibleBookings = allBookings.filter((b) => {
        if (branchId && b.branchId && b.branchId !== branchId) return false;
        if (b.status === BookingStatus.CANCELLED || b.status === BookingStatus.COMPLETED) return false;
        if (filteredItems.some((q) => q.bookingId === b.id)) return false;
        return true;
      });

      const visitedBookingIds = new Set(eligibleVisits.map((v) => v.bookingId).filter(Boolean));

      const bookingVisits: PatientVisit[] = eligibleBookings
        .filter((b) => !visitedBookingIds.has(b.id))
        .map((b) => ({
          id: `virtual-visit-${b.id}`,
          patientId: b.patientId,
          branchId: b.branchId,
          visitDateTime: b.bookingDateTime,
          visitType: VisitType.BOOKING,
          visitStatus: VisitStatus.WAITING,
          bookingId: b.id,
          complaint: b.notes || b.complaint || "Konsultasi Booking",
          doctorId: b.doctorId,
          createdAt: b.createdAt,
          updatedAt: b.updatedAt
        }));

      // Sort visits: today's bookings/visits first, then others
      const combined = [...eligibleVisits, ...bookingVisits].sort((a, b) => {
        const aDate = (a.visitDateTime || "").split("T")[0];
        const bDate = (b.visitDateTime || "").split("T")[0];
        if (aDate === selectedDate && bDate !== selectedDate) return -1;
        if (aDate !== selectedDate && bDate === selectedDate) return 1;
        return (a.visitDateTime || "").localeCompare(b.visitDateTime || "");
      });

      setVisits(combined);

      try {
        const pts = await repos.patient.getPatients(currentUser?.role, currentUser?.assignedBranchId);
        setPatientsList(pts);
        if (pts.length > 0 && !walkInPatientId) {
          setWalkInPatientId(pts[0].id);
        }
      } catch {
        // fallback
      }
    } catch (err: any) {
      setActionError(err.message || "Gagal memuat data antrean");
    } finally {
      setLoading(false);
    }
  };

  const handlePrepare = async (queueId: string) => {
    try {
      setActionError(null);
      setActionSuccess(null);
      await repos.queue.prepareQueuePatient(
        queueId,
        currentUser?.role,
        currentUser?.assignedBranchId,
        currentUser?.id
      );
      setActionSuccess("Pasien berhasil dipanggil / dipersiapkan");
      await loadQueueData();
      await refreshData();
    } catch (err: any) {
      setActionError(err.message || "Gagal memanggil pasien");
    }
  };

  const handleStart = async (queueId: string) => {
    try {
      setActionError(null);
      setActionSuccess(null);
      await repos.queue.startService(
        queueId,
        currentUser?.role,
        currentUser?.assignedBranchId,
        currentUser?.id
      );
      setActionSuccess("Konsultasi & tindakan medis dimulai");
      await loadQueueData();
      await refreshData();
    } catch (err: any) {
      setActionError(err.message || "Gagal memulai layanan");
    }
  };

  const handleFinish = async (queueId: string) => {
    try {
      setActionError(null);
      setActionSuccess(null);
      const finishedItem = await repos.queue.finishService(
        queueId,
        currentUser?.role,
        currentUser?.assignedBranchId,
        currentUser?.id
      );

      // If this queue item is linked to a booking, mark the booking as COMPLETED
      try {
        let targetBookingId = finishedItem?.bookingId;
        if (!targetBookingId && finishedItem?.visitId) {
          const v = visits.find((item) => item.id === finishedItem.visitId);
          targetBookingId = v?.bookingId;
        }
        if (targetBookingId) {
          await repos.booking.updateBooking(
            targetBookingId,
            { status: BookingStatus.COMPLETED },
            currentUser?.role,
            currentUser?.assignedBranchId
          );
        }
      } catch (bErr) {
        console.warn("Update booking status on finish error note:", bErr);
      }

      setActionSuccess("Konsultasi selesai");
      await loadQueueData();
      await refreshData();
    } catch (err: any) {
      setActionError(err.message || "Gagal menyelesaikan layanan");
    }
  };

  const handleSkip = async (queueId: string) => {
    try {
      setActionError(null);
      setActionSuccess(null);
      await repos.queue.skipQueuePatient(
        queueId,
        currentUser?.role,
        currentUser?.assignedBranchId,
        currentUser?.id
      );
      setActionSuccess("Antrean pasien dilewati");
      await loadQueueData();
      await refreshData();
    } catch (err: any) {
      setActionError(err.message || "Gagal melewati antrean");
    }
  };

  const handleUpdateDuration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editDurationQueueId) return;
    try {
      setActionError(null);
      setActionSuccess(null);
      await repos.queue.updateEstimatedDuration(
        editDurationQueueId,
        newDuration,
        currentUser?.role,
        currentUser?.assignedBranchId,
        currentUser?.id
      );
      setActionSuccess("Durasi estimasi diperbarui, antrean otomatis dikalkulasi ulang");
      setEditDurationQueueId(null);
      await loadQueueData();
      await refreshData();
    } catch (err: any) {
      setActionError(err.message || "Gagal memperbarui durasi");
    }
  };

  const handleCheckInVisit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setActionError(null);
      setActionSuccess(null);

      const branchId = (isBranchAdmin || isAssistant) ? currentUser?.assignedBranchId || selectedBranchId : selectedBranchId;

      if (checkInMode === "walkin") {
        if (!walkInPatientId) {
          setActionError("Pilih pasien walk-in terlebih dahulu");
          return;
        }

        const newVisit = await repos.visit.createVisit(
          {
            patientId: walkInPatientId,
            branchId: branchId,
            visitType: VisitType.WALK_IN,
            visitDateTime: AppClock.nowISO(),
            bookingId: null,
            doctorId: walkInDoctorId || (selectedDoctorId !== "ALL" ? selectedDoctorId : undefined),
            complaint: walkInComplaint || "Pemeriksaan / Konsultasi Walk-In"
          },
          currentUser?.role,
          currentUser?.assignedBranchId
        );

        await repos.queue.checkInVisitToQueue(
          newVisit.id,
          currentUser?.role,
          currentUser?.assignedBranchId,
          {
            estimatedDurationMinutes: customDuration,
            doctorId: walkInDoctorId || (selectedDoctorId !== "ALL" ? selectedDoctorId : undefined)
          }
        );

        setActionSuccess("Pasien walk-in berhasil didaftarkan dan langsung masuk antrean live!");
        setShowCheckInModal(false);
        setWalkInComplaint("Pemeriksaan Gigi");
        await loadQueueData();
        await refreshData();
        return;
      }

      if (!selectedVisitIdForCheckIn) {
        setActionError("Pilih booking atau kunjungan pasien terlebih dahulu");
        return;
      }

      let visitIdToUse = selectedVisitIdForCheckIn;
      let targetDoctorId = selectedDoctorId !== "ALL" ? selectedDoctorId : undefined;

      if (selectedVisitIdForCheckIn.startsWith("virtual-visit-")) {
        const bookingId = selectedVisitIdForCheckIn.replace("virtual-visit-", "");
        const b = allBookingsList.find((item) => item.id === bookingId) ||
          (await repos.booking.getBookingById(bookingId, currentUser?.role, currentUser?.assignedBranchId));
        if (b) {
          if (!targetDoctorId && b.doctorId) {
            targetDoctorId = b.doctorId;
          }
          const newVisit = await repos.visit.createVisit(
            {
              patientId: b.patientId,
              branchId: b.branchId,
              visitType: VisitType.BOOKING,
              visitDateTime: b.bookingDateTime || AppClock.nowISO(),
              bookingId: b.id,
              doctorId: b.doctorId,
              complaint: b.notes || b.complaint || "Konsultasi Booking"
            },
            currentUser?.role,
            currentUser?.assignedBranchId
          );
          visitIdToUse = newVisit.id;

          // Update booking status to CONFIRMED
          await repos.booking.updateBooking(
            b.id,
            { status: BookingStatus.CONFIRMED },
            currentUser?.role,
            currentUser?.assignedBranchId
          );
        }
      } else {
        const existingVisit = visits.find((v) => v.id === selectedVisitIdForCheckIn);
        if (existingVisit?.doctorId && !targetDoctorId) {
          targetDoctorId = existingVisit.doctorId;
        }
      }

      await repos.queue.checkInVisitToQueue(
        visitIdToUse,
        currentUser?.role,
        currentUser?.assignedBranchId,
        {
          estimatedDurationMinutes: customDuration,
          doctorId: targetDoctorId
        }
      );
      setActionSuccess("Pasien berhasil di-checkin dan masuk antrean live!");
      setShowCheckInModal(false);
      setSelectedVisitIdForCheckIn("");
      await loadQueueData();
      await refreshData();
    } catch (err: any) {
      setActionError(err.message || "Gagal melakukan check-in antrean");
    }
  };

  const formatTime = (isoString?: string) => {
    if (!isoString) return "--:--";
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", hour12: false });
    } catch {
      return "--:--";
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case QueueStatus.IN_CONSULTATION:
      case "IN_CONSULTATION":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200 animate-pulse">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            Konsultasi Aktif
          </span>
        );
      case QueueStatus.IN_PREPARATION:
      case "IN_PREPARATION":
      case "CALLING":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200">
            <UserCheck className="w-3 h-3" />
            Dalam Persiapan
          </span>
        );
      case QueueStatus.WAITING:
      case "WAITING":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <Clock3 className="w-3 h-3" />
            Menunggu
          </span>
        );
      case QueueStatus.COMPLETED:
      case "COMPLETED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
            <CheckCircle2 className="w-3 h-3 text-slate-500" />
            Selesai
          </span>
        );
      case QueueStatus.SKIPPED:
      case "SKIPPED":
      case "CANCELLED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <XCircle className="w-3 h-3" />
            Dilewati
          </span>
        );
      default:
        return <span className="text-xs text-slate-500">{status}</span>;
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6" id="live-queue-page">
      {/* Header Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
              <ListOrdered className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                {isPatient ? "Status Antrean Pasien" : "Live Queue & Scheduling Engine"}
              </h1>
              <p className="text-slate-500 text-xs mt-0.5">
                Pengelolaan antrean terisolasi per cabang &amp; dokter dengan kalkulasi estimasi waktu dinamis
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => loadQueueData()}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-slate-700 shadow-sm transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>

          {(isSuper || isBranchAdmin) && (
            <button
              onClick={() => setShowCheckInModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg text-xs shadow-sm transition-colors"
              id="btn-checkin-queue"
            >
              <Plus className="w-4 h-4" />
              Check-In Pasien ke Antrean
            </button>
          )}
        </div>
      </div>

      {/* Action Messages */}
      {actionError && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0" />
          <span>{actionError}</span>
        </div>
      )}
      {actionSuccess && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Filter Controls Bar */}
      {!isPatient && (
        <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Pilih Cabang Klinik</label>
            <select
              value={selectedBranchId}
              onChange={(e) => setSelectedBranchId(e.target.value)}
              disabled={isBranchAdmin || isAssistant}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Dokter Penanggung Jawab</label>
            <select
              value={selectedDoctorId}
              onChange={(e) => setSelectedDoctorId(e.target.value)}
              disabled={isDoctor}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
            >
              <option value="ALL">Semua Dokter di Cabang</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name || d.fullName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Tanggal Operasional</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
            />
          </div>
        </div>
      )}

      {/* PATIENT VIEW SPECIAL BANNER */}
      {isPatient && (
        <div className="bg-gradient-to-r from-emerald-800 to-teal-900 text-white rounded-2xl p-6 shadow-md space-y-4">
          <div className="flex items-center justify-between border-b border-emerald-700/60 pb-3">
            <span className="text-xs uppercase tracking-wider font-semibold text-emerald-200">
              Antrean Klinik Lala Dentist
            </span>
            <span className="text-xs text-emerald-100">{formatIndonesianDate(selectedDate)}</span>
          </div>

          {queueItems.length === 0 ? (
            <div className="text-center py-6 text-emerald-100 text-xs">
              Anda belum memiliki antrean aktif pada tanggal {formatIndonesianDate(selectedDate)}.
            </div>
          ) : (
            queueItems.map((q) => (
              <div key={q.id} className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
                <div className="text-center md:text-left bg-emerald-950/40 p-4 rounded-xl border border-emerald-700/50">
                  <div className="text-xs text-emerald-300 font-medium">Nomor Antrean Anda</div>
                  <div className="text-4xl font-extrabold text-white mt-1">{q.queueNumber}</div>
                  <div className="mt-2">{getStatusBadge(q.status)}</div>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between border-b border-emerald-700/30 pb-1">
                    <span className="text-emerald-300">Dokter:</span>
                    <span className="font-semibold text-white">{q.doctorNameSnapshot || "Dokter Penanggung Jawab"}</span>
                  </div>
                  <div className="flex justify-between border-b border-emerald-700/30 pb-1">
                    <span className="text-emerald-300">Waktu Datang:</span>
                    <span className="font-semibold text-white">{formatTime(q.arrivalAt || q.checkInTime)} WIB</span>
                  </div>
                  <div className="flex justify-between border-b border-emerald-700/30 pb-1">
                    <span className="text-emerald-300">Selesai/Mulai Aktual:</span>
                    <span className="font-semibold text-white">
                      {q.actualServiceStartAt ? `${formatTime(q.actualServiceStartAt)} WIB` : "Belum mulai"}
                    </span>
                  </div>
                </div>

                <div className="bg-emerald-700/30 p-4 rounded-xl text-center border border-emerald-500/30">
                  {/* CRITICAL WORDING REQUIREMENT: "PERKIRAAN" */}
                  <div className="text-xs font-bold text-amber-300 uppercase tracking-wider mb-1">
                    PERKIRAAN WAKTU DILAYANI
                  </div>
                  <div className="text-2xl font-bold text-white">
                    {formatTime(q.estimatedServiceAt)} WIB
                  </div>
                  <div className="text-[11px] text-emerald-200 mt-1">
                    Perkiraan durasi: {q.estimatedDurationMinutes} menit
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Snapshot Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
          <div className="text-slate-400 text-[11px] font-medium uppercase">Total Dalam Antrean</div>
          <div className="text-2xl font-bold text-slate-800 mt-1">
            {snapshot?.activeQueueItems?.length || queueItems.length}
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm border-l-4 border-l-emerald-500">
          <div className="text-emerald-700 text-[11px] font-medium uppercase">Sedang Konsultasi</div>
          <div className="text-2xl font-bold text-emerald-700 mt-1">
            {snapshot?.consultationQueue?.length || 0}
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm border-l-4 border-l-blue-500">
          <div className="text-blue-700 text-[11px] font-medium uppercase">Dalam Persiapan</div>
          <div className="text-2xl font-bold text-blue-700 mt-1">
            {snapshot?.preparationQueue?.length || 0}
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm border-l-4 border-l-amber-500">
          <div className="text-amber-700 text-[11px] font-medium uppercase">Menunggu</div>
          <div className="text-2xl font-bold text-amber-700 mt-1">
            {snapshot?.waitingQueue?.length || 0}
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm border-l-4 border-l-slate-400">
          <div className="text-slate-500 text-[11px] font-medium uppercase">Selesai / Dilewati</div>
          <div className="text-2xl font-bold text-slate-600 mt-1">
            {(snapshot?.completedQueue?.length || 0) + (snapshot?.skippedQueue?.length || 0)}
          </div>
        </div>
      </div>

      {/* Main Live Queue List Table */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-800">
            Daftar Antrean Hari Ini ({formatIndonesianDate(selectedDate)})
          </h2>
          <span className="text-xs text-slate-500">
            {queueItems.length} antrean terdaftar
          </span>
        </div>

        {queueItems.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            Tidak ada antrean terdaftar untuk kriteria cabang &amp; tanggal ini.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100">
                  <th className="p-3.5 w-12 text-center">Urutan</th>
                  <th className="p-3.5">No. Antrean</th>
                  <th className="p-3.5">Nama Pasien</th>
                  <th className="p-3.5">Dokter</th>
                  <th className="p-3.5">Status</th>
                  <th className="p-3.5">Kedatangan</th>
                  <th className="p-3.5">Perkiraan Dilayani</th>
                  <th className="p-3.5">Aktual Layanan</th>
                  <th className="p-3.5">Durasi</th>
                  {!isPatient && <th className="p-3.5 text-right">Aksi Management</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {queueItems.map((q, idx) => (
                  <tr
                    key={q.id}
                    className={`hover:bg-slate-50 transition-colors ${
                      q.status === QueueStatus.IN_CONSULTATION ? "bg-emerald-50/40" : ""
                    }`}
                  >
                    <td className="p-3.5 text-center font-bold text-slate-400">{idx + 1}</td>
                    <td className="p-3.5 font-bold text-slate-900 text-sm">{q.queueNumber}</td>
                    <td className="p-3.5">
                      <div className="font-semibold text-slate-800">
                        {q.patientNameSnapshot || "Pasien"}
                      </div>
                      {q.bookingId ? (
                        <span className="inline-block text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded mt-0.5">
                          Booking ({formatTime(q.bookingTimeSnapshot)})
                        </span>
                      ) : (
                        <span className="inline-block text-[10px] text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded mt-0.5">
                          Walk-In
                        </span>
                      )}
                    </td>
                    <td className="p-3.5 text-slate-600">{q.doctorNameSnapshot || "Dokter"}</td>
                    <td className="p-3.5">{getStatusBadge(q.status)}</td>
                    <td className="p-3.5 font-mono text-slate-600">
                      {formatTime(q.arrivalAt || q.checkInTime)}
                    </td>
                    <td className="p-3.5 font-mono font-semibold text-emerald-700">
                      {formatTime(q.estimatedServiceAt)}
                    </td>
                    <td className="p-3.5 font-mono text-slate-600">
                      {q.actualServiceStartAt ? (
                        <span className="text-slate-800 font-medium">
                          {formatTime(q.actualServiceStartAt)}
                          {q.actualServiceEndAt && ` - ${formatTime(q.actualServiceEndAt)}`}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[11px]">Belum mulai</span>
                      )}
                    </td>
                    <td className="p-3.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold">{q.estimatedDurationMinutes}m</span>
                        {(isSuper || isBranchAdmin || isDoctor || isAssistant) &&
                          q.status !== QueueStatus.COMPLETED &&
                          q.status !== QueueStatus.SKIPPED && (
                            <button
                              onClick={() => handleOpenAddTimeModal(q)}
                              title="Tambah Waktu Tindakan (+15m, +30m, +45m)"
                              className="px-2 py-0.5 bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold text-[10px] rounded border border-amber-200 transition-colors flex items-center gap-1 shadow-2xs"
                            >
                              <Clock className="w-3 h-3 text-amber-600" /> + Waktu
                            </button>
                          )}
                        {(isSuper || isBranchAdmin || isDoctor) && (
                          <button
                            onClick={() => {
                              setEditDurationQueueId(q.id);
                              setNewDuration(q.estimatedDurationMinutes);
                            }}
                            title="Ubah estimasi durasi"
                            className="p-1 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-100"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </td>

                    {!isPatient && (
                      <td className="p-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {(isSuper || isBranchAdmin || isDoctor || isAssistant) &&
                            q.status === QueueStatus.WAITING && (
                              <button
                                onClick={() => handlePrepare(q.id)}
                                className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-[11px] font-semibold transition-colors shadow-sm"
                              >
                                Panggil
                              </button>
                            )}

                          {(isSuper || isBranchAdmin || isDoctor) &&
                            (q.status === QueueStatus.WAITING ||
                              q.status === QueueStatus.IN_PREPARATION) && (
                              <button
                                onClick={() => handleStart(q.id)}
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-semibold transition-colors shadow-sm flex items-center gap-1"
                              >
                                <Play className="w-3 h-3 fill-current" />
                                Mulai
                              </button>
                            )}

                          {(isSuper || isBranchAdmin || isDoctor) &&
                            q.status === QueueStatus.IN_CONSULTATION && (
                              <button
                                onClick={() => handleFinish(q.id)}
                                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-900 text-white rounded text-[11px] font-semibold transition-colors shadow-sm flex items-center gap-1"
                              >
                                <CheckCircle2 className="w-3 h-3" />
                                Selesai
                              </button>
                            )}

                          {(isSuper || isBranchAdmin || isDoctor) &&
                            q.status !== QueueStatus.COMPLETED &&
                            q.status !== QueueStatus.SKIPPED && (
                              <button
                                onClick={() => handleSkip(q.id)}
                                className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded text-[11px] font-medium transition-colors border border-rose-200"
                              >
                                Lewati
                              </button>
                            )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* CHECK-IN VISIT MODAL */}
      {showCheckInModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-800">
                Check-In Pasien ke Antrean Live
              </h3>
              <button
                type="button"
                onClick={() => setShowCheckInModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                ✕
              </button>
            </div>

            {/* TAB SELECTOR */}
            <div className="flex bg-slate-100 p-1 rounded-lg">
              <button
                type="button"
                onClick={() => setCheckInMode("booking")}
                className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${
                  checkInMode === "booking"
                    ? "bg-white text-emerald-700 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Dari Booking / Visit ({visits.length})
              </button>
              <button
                type="button"
                onClick={() => setCheckInMode("walkin")}
                className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${
                  checkInMode === "walkin"
                    ? "bg-white text-emerald-700 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                + Walk-In Langsung
              </button>
            </div>

            <form onSubmit={handleCheckInVisit} className="space-y-4 text-xs">
              {checkInMode === "booking" ? (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Pilih Kunjungan / Booking Pasien
                  </label>
                  {visits.length === 0 ? (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 space-y-2">
                      <p className="leading-relaxed">
                        Belum ada reservasi booking tertunda untuk cabang ini.
                      </p>
                      <button
                        type="button"
                        onClick={() => setCheckInMode("walkin")}
                        className="font-bold text-emerald-700 hover:text-emerald-800 underline block"
                      >
                        Beralih ke Check-In Walk-In Langsung &rarr;
                      </button>
                    </div>
                  ) : (
                    <select
                      value={selectedVisitIdForCheckIn}
                      onChange={(e) => setSelectedVisitIdForCheckIn(e.target.value)}
                      required
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                    >
                      <option value="">-- Pilih Pasien / Kunjungan ({visits.length} tersedia) --</option>
                      {visits.map((v) => {
                        const pat = patientsList.find((p) => p.id === v.patientId);
                        const patName = pat ? pat.fullName : `Pasien ID: ${v.patientId.slice(0, 8)}...`;
                        const isVirtual = v.id.startsWith("virtual-visit-");
                        const bk = isVirtual ? allBookingsList.find((b) => b.id === v.bookingId) : null;
                        const doc = doctors.find((d) => d.id === v.doctorId);
                        const docName = doc?.name || bk?.doctorNameSnapshot || "Dokter";
                        const dateStr = (v.visitDateTime || "").split("T")[0];
                        const dateTag = dateStr === selectedDate ? "Hari Ini" : dateStr;
                        const timeStr = bk?.timeSlot || v.visitDateTime?.split("T")[1]?.substring(0, 5) || "";

                        return (
                          <option key={v.id} value={v.id}>
                            {isVirtual ? `[Booking ${dateTag}]` : `[Visit]`} {patName} - {docName} {timeStr ? `(${timeStr} WIB)` : ""} - {v.complaint || "Konsultasi"}
                          </option>
                        );
                      })}
                    </select>
                  )}
                </div>
              ) : (
                /* WALK-IN MODE */
                <div className="space-y-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Pilih Pasien Walk-In
                    </label>
                    <select
                      value={walkInPatientId}
                      onChange={(e) => setWalkInPatientId(e.target.value)}
                      required
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                    >
                      <option value="">-- Pilih Profil Pasien --</option>
                      {patientsList.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.fullName} ({p.medicalRecordNumber || p.id.slice(0, 8)}) - {p.phone || "No HP -"}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Keluhan / Tindakan Pasien
                    </label>
                    <input
                      type="text"
                      value={walkInComplaint}
                      onChange={(e) => setWalkInComplaint(e.target.value)}
                      placeholder="Contoh: Sakit gigi, scaling karang gigi, tambal gigi..."
                      required
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Dokter Pemeriksa (Opsional)
                    </label>
                    <select
                      value={walkInDoctorId}
                      onChange={(e) => setWalkInDoctorId(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                    >
                      <option value="">Sesuai Dokter yang Aktif / Bertugas</option>
                      {doctors.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Estimasi Durasi Layanan (Menit)
                </label>
                <input
                  type="number"
                  min="5"
                  max="180"
                  value={customDuration}
                  onChange={(e) => setCustomDuration(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCheckInModal(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={checkInMode === "booking" && visits.length === 0}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg font-semibold transition-colors shadow-xs"
                >
                  Check-In Sekarang
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TAMBAH WAKTU TINDAKAN MODAL */}
      {addTimeModalItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-amber-600 bg-amber-50 px-2 py-0.5 rounded">
                  Quick Action
                </span>
                <h3 className="text-base font-bold text-slate-900 mt-1">
                  Tambah Waktu Tindakan
                </h3>
              </div>
              <button
                onClick={() => setAddTimeModalItem(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-slate-50 p-3 rounded-xl space-y-1 text-xs">
              <div className="font-bold text-slate-800">
                {addTimeModalItem.patientNameSnapshot || "Pasien"} ({addTimeModalItem.queueNumber})
              </div>
              <div className="text-slate-500 text-[11px]">
                Dokter: {addTimeModalItem.doctorNameSnapshot || "Dokter"}
              </div>
              <div className="text-slate-600 font-medium">
                Durasi Saat Ini: <span className="font-bold text-slate-900">{addTimeModalItem.estimatedDurationMinutes} Menit</span>
              </div>
            </div>

            <form onSubmit={handleConfirmAddTime} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-2">
                  Pilih Tambahan Waktu
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[15, 30, 45].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => handleSelectAddedMinutes(m)}
                      className={`py-2 px-3 rounded-xl font-bold text-xs border transition-all ${
                        addedMinutesChoice === m
                          ? "bg-amber-500 text-white border-amber-500 shadow-sm"
                          : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      +{m} Menit
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Alasan Penambahan Waktu
                </label>
                <select
                  value={durationReason}
                  onChange={(e) => setDurationReason(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 focus:ring-1 focus:ring-amber-500 focus:outline-none"
                >
                  <option value="Tindakan membutuhkan waktu tambahan">Tindakan membutuhkan waktu tambahan</option>
                  <option value="Kondisi pasien membutuhkan waktu tambahan">Kondisi pasien membutuhkan waktu tambahan</option>
                  <option value="Persiapan tindakan lebih lama">Persiapan tindakan lebih lama</option>
                  <option value="Dokter membutuhkan waktu tambahan">Dokter membutuhkan waktu tambahan</option>
                  <option value="Lainnya">Lainnya</option>
                </select>
              </div>

              {(durationReason === "Lainnya" || durationReason) && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Catatan Tambahan (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: Pembersihan saluran akar membutuhkan kehati-hatian ekstra"
                    value={customReasonNotes}
                    onChange={(e) => setCustomReasonNotes(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 focus:ring-1 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
              )}

              {/* Summary of Change */}
              <div className="bg-amber-50/60 border border-amber-200/60 p-3 rounded-xl text-xs space-y-1 text-amber-900">
                <div className="font-bold flex items-center justify-between">
                  <span>Hasil Durasi Baru:</span>
                  <span className="text-sm font-extrabold text-amber-800">
                    {(addTimeModalItem.estimatedDurationMinutes || 30) + addedMinutesChoice} Menit (+{addedMinutesChoice}m)
                  </span>
                </div>
              </div>

              {/* Warning if Schedule Exceeded */}
              {scheduleWarning && (
                <div className="bg-rose-50 border border-rose-200 p-3 rounded-xl text-rose-800 text-xs flex items-start gap-2 animate-pulse">
                  <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold">Peringatan Jam Operasional Dokter</div>
                    <div className="text-[11px] mt-0.5">{scheduleWarning}</div>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  disabled={submittingDuration}
                  onClick={() => setAddTimeModalItem(null)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-medium transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submittingDuration}
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold shadow-sm transition-all disabled:opacity-50 flex items-center gap-1.5"
                >
                  {submittingDuration ? "Processing..." : "Konfirmasi Tambah Waktu"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT DURATION MODAL */}
      {editDurationQueueId && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-sm w-full p-6 shadow-xl border border-slate-100 space-y-4">
            <h3 className="text-base font-bold text-slate-800 border-b border-slate-100 pb-3">
              Ubah Estimasi Durasi Pasien
            </h3>

            <form onSubmit={handleUpdateDuration} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Estimasi Durasi Baru (Menit)
                </label>
                <input
                  type="number"
                  min="5"
                  max="180"
                  value={newDuration}
                  onChange={(e) => setNewDuration(Number(e.target.value))}
                  required
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditDurationQueueId(null)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold transition-colors"
                >
                  Simpan &amp; Kalkulasi Ulang
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
