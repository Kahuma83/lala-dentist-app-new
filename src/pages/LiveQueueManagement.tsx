import React, { useState, useEffect, useMemo } from "react";
import { useApp } from "../context/AppContext";
import { UserRole, QueueStatus, QueueItem, LiveQueueSnapshot, PatientVisit, ScheduleStatus, PatientProfile, Booking, BookingStatus, VisitType, VisitStatus } from "../types/domain";
import { AppClock } from "../utils/clock";
import { formatIndonesianDate, getOperationalDateString, getOperationalTimeString, toOperationalDateTime } from "../utils/dateUtils";
import { isValidUUID } from "../repositories/supabaseRepositories";
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
  FileText,
  AlertCircle,
  Plus,
  RefreshCw,
  Edit2,
  X
} from "lucide-react";
import { OperationalHubTabs } from "../components/common/OperationalHubTabs";
import { useRouter } from "../components/Router";
import { isBranchMatch } from "../utils/branchUtils";
import { getPlannedTreatmentDurationMinutes, getPlannedTreatmentSummary, snapshotPlannedTreatments } from "../utils/plannedTreatmentUtils";
import { hasActiveQueueForPatientOnDate } from "../utils/bookingQueueGuards";

export const LiveQueueManagement: React.FC = () => {
  const { currentUser, repos, branches, doctors, doctorSchedules, refreshData } = useApp();
  const { path, navigate } = useRouter();
  const isCheckInPage = path === "/super-admin/check-in" || path === "/branch-admin/check-in";
  const queuePagePath = path.startsWith("/super-admin") ? "/super-admin/queue" : "/branch-admin/queue";

  const isSuper = currentUser?.role === UserRole.SUPER_ADMIN;
  const isBranchAdmin = currentUser?.role === UserRole.BRANCH_ADMIN;
  const isDoctor = currentUser?.role === UserRole.DOCTOR;
  const isAssistant = currentUser?.role === UserRole.DOCTOR_ASSISTANT;
  const isPatient = currentUser?.role === UserRole.PATIENT;
  const checkInParams = new URLSearchParams(window.location.search);
  const requestedBookingId = isCheckInPage ? checkInParams.get("bookingId") : null;

  // Selected filters
  const [selectedBranchId, setSelectedBranchId] = useState<string>(
    (isSuper ? checkInParams.get("branchId") : null) ||
      currentUser?.assignedBranchId ||
      "branch-gebang"
  );
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>(
    isDoctor ? currentUser?.doctorId || "" : "ALL"
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
  const [selectedVisitIdForCheckIn, setSelectedVisitIdForCheckIn] = useState<string>("");
  const [selectedBookingIdForCheckIn, setSelectedBookingIdForCheckIn] = useState<string>("");
  const [allBookingsList, setAllBookingsList] = useState<Booking[]>([]);
  const requestedBooking = requestedBookingId
    ? allBookingsList.find((booking) => booking.id === requestedBookingId)
    : undefined;
  const eligibleCheckInBookings = allBookingsList.filter((booking) =>
    (!booking.branchId || isBranchMatch(booking.branchId, selectedBranchId, branches)) &&
    booking.status !== BookingStatus.CANCELLED &&
    booking.status !== BookingStatus.COMPLETED
  );
  const eligibleUnbookedVisits = visits.filter((visit) => !visit.bookingId && isValidUUID(visit.id));
  const [customDuration, setCustomDuration] = useState<number>(30);
  const [isCheckInSubmitting, setIsCheckInSubmitting] = useState<boolean>(false);
  const [queueActionLoadingId, setQueueActionLoadingId] = useState<string | null>(null);

  const [editDurationQueueId, setEditDurationQueueId] = useState<string | null>(null);
  const [newDuration, setNewDuration] = useState<number>(30);

  // Quick Add Time Modal state
  const [addTimeModalItem, setAddTimeModalItem] = useState<QueueItem | null>(null);
  const [addedMinutesChoice, setAddedMinutesChoice] = useState<number>(15);
  const [durationReason, setDurationReason] = useState<string>("Tindakan membutuhkan waktu tambahan");
  const [customReasonNotes, setCustomReasonNotes] = useState<string>("");
  const [submittingDuration, setSubmittingDuration] = useState<boolean>(false);
  const [scheduleWarning, setScheduleWarning] = useState<string | null>(null);

  useEffect(() => {
    if (isDoctor && currentUser?.doctorId) {
      setSelectedDoctorId(currentUser.doctorId);
    }
  }, [isDoctor, currentUser?.doctorId]);

  // Doctor Schedule Warning Check Helper
  const checkDoctorScheduleWarning = (item: QueueItem, addedMinutes: number): string | null => {
    try {
      const opDate = getOperationalDateString(item.arrivalAt || item.checkInTime);
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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const successMessage = params.get("checkInSuccess");
    if (!successMessage) return;

    setActionSuccess(successMessage);
    params.delete("checkInSuccess");
    const remainingQuery = params.toString();
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${remainingQuery ? `?${remainingQuery}` : ""}${window.location.hash}`
    );
  }, []);

  const loadQueueData = async () => {
    try {
      setLoading(true);
      setActionError(null);

      const requestedBranchId = (isBranchAdmin || isAssistant)
        ? currentUser?.assignedBranchId || selectedBranchId
        : selectedBranchId;
      const branchId = branches.find((branch) => isBranchMatch(branch.id, requestedBranchId, branches))?.id || requestedBranchId;
      const docId = isDoctor ? currentUser?.doctorId || "" : selectedDoctorId;
      if (isDoctor && !docId) {
        throw new Error("Akun dokter belum terhubung ke data dokter di Supabase.");
      }

      const snap = await repos.queue.getLiveQueueSnapshot(
        branchId,
        selectedDate,
        docId === "ALL" ? undefined : docId,
        currentUser?.role,
        currentUser?.assignedBranchId,
        currentUser?.doctorId
      );

      setSnapshot(snap);

      const items = await repos.queue.getQueueByBranch(
        branchId,
        currentUser?.role,
        currentUser?.assignedBranchId
      );

      const filteredItems = items.filter((q) => {
        const qDate = getOperationalDateString(q.arrivalAt || q.checkInTime);
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
          plannedTreatments: b.plannedTreatments || [],
          createdAt: b.createdAt,
          updatedAt: b.updatedAt
        }));

      // Sort visits: today's bookings/visits first, then others
      const combined = [...eligibleVisits, ...bookingVisits].sort((a, b) => {
        const aDate = getOperationalDateString(a.visitDateTime);
        const bDate = getOperationalDateString(b.visitDateTime);
        if (aDate === selectedDate && bDate !== selectedDate) return -1;
        if (aDate !== selectedDate && bDate === selectedDate) return 1;
        return (a.visitDateTime || "").localeCompare(b.visitDateTime || "");
      });

      setVisits(combined);

      try {
        const pts = await repos.patient.getPatients(currentUser?.role, currentUser?.assignedBranchId);
        setPatientsList(pts);
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
    if (!isDoctor && !isAssistant) return;
    if (queueActionLoadingId) return;
    try {
      setActionError(null);
      setActionSuccess(null);
      setQueueActionLoadingId(queueId);
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
    } finally {
      setQueueActionLoadingId(null);
    }
  };

  const handleStart = async (queueId: string) => {
    if (!isDoctor && !isAssistant) return;
    if (queueActionLoadingId) return;
    try {
      setActionError(null);
      setActionSuccess(null);
      setQueueActionLoadingId(queueId);
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
    } finally {
      setQueueActionLoadingId(null);
    }
  };

  const handleSkip = async (queueId: string) => {
    if (queueActionLoadingId) return;
    try {
      setActionError(null);
      setActionSuccess(null);
      setQueueActionLoadingId(queueId);
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
    } finally {
      setQueueActionLoadingId(null);
    }
  };

  const handleRemoveQueue = async (queueId: string) => {
    if (queueActionLoadingId) return;
    const confirmed = window.confirm("Apakah Anda yakin ingin menghapus antrean ini? Pasien akan dikeluarkan dari daftar tunggu.");
    if (!confirmed) return;

    try {
      setActionError(null);
      setActionSuccess(null);
      setQueueActionLoadingId(queueId);
      await repos.queue.removeQueuePatient(
        queueId,
        currentUser?.role,
        currentUser?.assignedBranchId,
        currentUser?.id
      );
      setActionSuccess("Antrean berhasil dihapus");
      await loadQueueData();
      await refreshData();
    } catch (err: any) {
      setActionError(err.message || "Gagal menghapus antrean");
    } finally {
      setQueueActionLoadingId(null);
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

  const handleOpenCheckInModal = () => {
    const selectedBooking = requestedBookingId
      ? eligibleCheckInBookings.find((booking) => booking.id === requestedBookingId)
      : eligibleCheckInBookings[0];
    const selectedVisit = selectedBooking ? undefined : eligibleUnbookedVisits[0];

    setSelectedBookingIdForCheckIn(selectedBooking?.id || requestedBookingId || "");
    setCustomDuration(getPlannedTreatmentDurationMinutes(selectedBooking?.plannedTreatments || selectedVisit?.plannedTreatments));
    setSelectedVisitIdForCheckIn(selectedVisit?.id || "");
    setShowCheckInModal(true);
  };

  useEffect(() => {
    if (isCheckInPage) {
      handleOpenCheckInModal();
    }
  }, [isCheckInPage]);

  const handleCheckInVisit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isCheckInSubmitting) return;

    try {
      setActionError(null);
      setActionSuccess(null);
      setIsCheckInSubmitting(true);

      const requestedBranchId = (isBranchAdmin || isAssistant)
        ? currentUser?.assignedBranchId || selectedBranchId
        : selectedBranchId;
      const branchId = branches.find((branch) => isBranchMatch(branch.id, requestedBranchId, branches))?.id || requestedBranchId;

      let visitIdToUse = selectedVisitIdForCheckIn;
      let visitForQueue: PatientVisit | undefined;
      let targetDoctorId = selectedDoctorId !== "ALL" ? selectedDoctorId : undefined;

      const bookingIdToCheckIn = requestedBookingId || selectedBookingIdForCheckIn;
      if (bookingIdToCheckIn) {
        if (!bookingIdToCheckIn) {
          setActionError("Pilih booking pasien terlebih dahulu");
          return;
        }

        const booking = allBookingsList.find((item) => item.id === bookingIdToCheckIn)
          || await repos.booking.getBookingById(bookingIdToCheckIn, currentUser?.role, currentUser?.assignedBranchId);

        if (!booking) {
          setActionError("Booking yang dipilih tidak ditemukan");
          return;
        }

        if (!targetDoctorId && booking.doctorId) {
          targetDoctorId = booking.doctorId;
        }

        const bookingBranchId = branches.find((branch) => isBranchMatch(branch.id, booking.branchId, branches))?.id || booking.branchId;
        if ((isBranchAdmin || isAssistant) && !isBranchMatch(bookingBranchId, branchId, branches)) {
          throw new Error("Booking berasal dari cabang lain dan tidak dapat dimasukkan ke antrean cabang ini.");
        }
        if (hasActiveQueueForPatientOnDate(queueItems, booking.patientId, bookingBranchId, AppClock.nowISO())) {
          throw new Error("Pasien ini sudah berada di antrean aktif hari ini melalui kunjungan lain.");
        }
        const existingVisit = visits.find(
          (v) => isValidUUID(v.id) &&
            v.bookingId === booking.id &&
            v.patientId === booking.patientId &&
            isBranchMatch(v.branchId, bookingBranchId, branches)
        );

        if (existingVisit) {
          visitIdToUse = existingVisit.id;
          visitForQueue = existingVisit;
        } else {
          const newVisit = await repos.visit.createVisit(
            {
              patientId: booking.patientId,
              branchId: bookingBranchId,
              visitType: VisitType.BOOKING,
              visitDateTime: booking.bookingDateTime || AppClock.nowISO(),
              bookingId: booking.id,
              doctorId: booking.doctorId,
              complaint: booking.notes || booking.complaint || "Konsultasi Booking",
              plannedTreatments: booking.plannedTreatments || []
            },
            currentUser?.role,
            branchId
          );
          visitIdToUse = newVisit.id;
          visitForQueue = newVisit;
        }

        await repos.booking.updateBooking(
          booking.id,
          { status: BookingStatus.CONFIRMED },
          currentUser?.role,
          branchId
        );
        setCustomDuration(getPlannedTreatmentDurationMinutes(booking.plannedTreatments));
      } else {
        if (!selectedVisitIdForCheckIn) {
          setActionError("Pilih kunjungan pasien terlebih dahulu");
          return;
        }

        const existingVisit = visits.find((v) => v.id === selectedVisitIdForCheckIn);
        visitForQueue = existingVisit;
        if (existingVisit?.doctorId && !targetDoctorId) {
          targetDoctorId = existingVisit.doctorId;
        }
      }

      await repos.queue.checkInVisitToQueue(
        visitIdToUse,
        currentUser?.role,
        branchId,
        {
          estimatedDurationMinutes: customDuration,
          plannedTreatments: visitForQueue?.plannedTreatments || [],
          bookingId: visitForQueue?.bookingId || null,
          doctorId: targetDoctorId,
          branchId: visitForQueue?.branchId,
          patientId: visitForQueue?.patientId,
          patientNameSnapshot: patientsList.find((patient) => patient.id === visitForQueue?.patientId)?.fullName,
          doctorNameSnapshot: doctors.find((doctor) => doctor.id === targetDoctorId)?.name,
          bookingTimeSnapshot: allBookingsList.find((booking) => booking.id === visitForQueue?.bookingId)?.bookingDateTime
        }
      );
      setActionSuccess("Pasien berhasil di-checkin dan masuk antrean live!");
      setShowCheckInModal(false);
      if (isCheckInPage) navigate(queuePagePath);
      setSelectedVisitIdForCheckIn("");
      setSelectedBookingIdForCheckIn("");
      await loadQueueData();
      await refreshData();
    } catch (err: any) {
      setActionError(err.message || "Gagal melakukan check-in antrean");
    } finally {
      setIsCheckInSubmitting(false);
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
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <XCircle className="w-3 h-3" />
            Dilewati
          </span>
        );
      case QueueStatus.CANCELLED:
      case "CANCELLED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <XCircle className="w-3 h-3" />
            Dibatalkan
          </span>
        );
      default:
        return <span className="text-xs text-slate-500">{status}</span>;
    }
  };

  return (
    <>
    {!isCheckInPage && <div className="p-6 max-w-7xl mx-auto space-y-6" id="live-queue-page">
      <OperationalHubTabs hub="queue_treatment" />

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
                        {q.patientNameSnapshot || patientsList.find((patient) => patient.id === q.patientId)?.fullName || "Nama pasien tidak tersedia"}
                      </div>
                      {q.bookingId ? (
                        <span className="inline-block text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded mt-0.5">
                          {(() => {
                            const bookingTime = q.bookingTimeSnapshot
                              || allBookingsList.find((booking) => booking.id === q.bookingId)?.bookingDateTime;
                            return bookingTime ? `Booking (${formatTime(bookingTime)})` : "Booking";
                          })()}
                        </span>
                      ) : (
                        <span className="inline-block text-[10px] text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded mt-0.5">
                          Walk-In
                        </span>
                      )}
                    </td>
                    <td className="p-3.5 text-slate-600">{q.doctorNameSnapshot || doctors.find((doctor) => doctor.id === q.doctorId)?.name || "Dokter belum terhubung"}</td>
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
                          {(isDoctor || isAssistant) &&
                            q.status === QueueStatus.WAITING && (
                              <button
                                onClick={() => handlePrepare(q.id)}
                                className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-[11px] font-semibold transition-colors shadow-sm"
                              >
                                Panggil
                              </button>
                            )}

                          {(isDoctor || isAssistant) &&
                            (q.status === QueueStatus.WAITING ||
                              q.status === QueueStatus.IN_PREPARATION) && (
                              <button
                                onClick={() => handleStart(q.id)}
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-semibold transition-colors shadow-sm flex items-center gap-1"
                              >
                                <Play className="w-3 h-3 fill-current" />
                                Mulai Konsultasi
                              </button>
                            )}

                          {isDoctor && q.patientId && q.status === QueueStatus.IN_CONSULTATION && (
                            <button
                              onClick={() => navigate(`/doctor/patients?patientId=${encodeURIComponent(q.patientId || "")}`)}
                              className="px-2.5 py-1 bg-sky-50 hover:bg-sky-100 text-sky-700 rounded text-[11px] font-semibold transition-colors border border-sky-200 flex items-center gap-1"
                              title="Lihat riwayat kunjungan dan rekam medis pasien"
                            >
                              <FileText className="w-3 h-3" />
                              Riwayat
                            </button>
                          )}

                          {(isDoctor || isAssistant) &&
                            q.status === QueueStatus.IN_CONSULTATION && (
                              <button
                                onClick={() => navigate(`/${isDoctor ? "doctor" : "assistant"}/treatments?visitId=${encodeURIComponent(q.visitId)}`)}
                                className="px-2.5 py-1 bg-teal-600 hover:bg-teal-700 text-white rounded text-[11px] font-semibold transition-colors shadow-sm flex items-center gap-1"
                              >
                                <Activity className="w-3 h-3" />
                                Buka Treatment
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

                          {(isSuper || isBranchAdmin || isDoctor || isAssistant) && (
                            <button
                              onClick={() => handleRemoveQueue(q.id)}
                              disabled={queueActionLoadingId === q.id}
                              className="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-700 rounded text-[11px] font-medium transition-colors border border-red-200 disabled:opacity-50"
                            >
                              {queueActionLoadingId === q.id ? "Menghapus..." : "Hapus"}
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
    </div>}

      {/* CHECK-IN VISIT MODAL */}
      {showCheckInModal && (
          <div className={isCheckInPage ? "p-6 max-w-3xl mx-auto" : "fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4"}>
            {isCheckInPage && (
              <div className="mb-5">
                <OperationalHubTabs hub="queue_treatment" />
                <h1 className="text-2xl font-bold text-slate-900">Check-In Pasien</h1>
                <p className="text-slate-500 text-xs mt-1">Check-in pasien dari jadwal atau visit yang sudah tercatat.</p>
              </div>
            )}
            <div className={`bg-white rounded-xl w-full p-6 shadow-xl border border-slate-100 space-y-4 ${isCheckInPage ? "max-w-2xl mx-auto" : "max-w-md"}`}>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-800">
                Check-In Pasien ke Antrean Live
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowCheckInModal(false);
                  if (isCheckInPage) navigate(queuePagePath);
                }}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCheckInVisit} className="space-y-4 text-xs">
              {actionError && (
                <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-rose-700">
                  {actionError}
                </div>
              )}
              {requestedBookingId ? (() => {
                if (!requestedBooking && loading) {
                  return <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-500">Memuat jadwal pasien...</div>;
                }
                if (!requestedBooking) {
                  return <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-700">Jadwal pasien tidak ditemukan atau tidak dapat diakses. Silakan kembali ke Jadwal Pasien dan buka Check-In dari jadwal yang aktif.</div>;
                }
                const patient = patientsList.find((item) => item.id === requestedBooking.patientId);
                const doctor = doctors.find((item) => item.id === requestedBooking.doctorId);
                return (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Check-In untuk jadwal terpilih</p>
                    <p className="mt-1 text-sm font-extrabold text-slate-900">{patient?.fullName || patient?.name || requestedBooking.patientNameSnapshot || "Pasien"}</p>
                    <p className="mt-1 text-xs text-slate-600">
                      {formatIndonesianDate(getOperationalDateString(requestedBooking.bookingDateTime))} · {getOperationalTimeString(requestedBooking.bookingDateTime)} WIB
                    </p>
                    <p className="text-xs text-slate-600">{doctor?.name || requestedBooking.doctorNameSnapshot || "Dokter"}</p>
                    <p className="mt-2 border-t border-emerald-200 pt-2 text-[11px] font-medium text-emerald-800">
                      Rencana: {getPlannedTreatmentSummary(requestedBooking.plannedTreatments, requestedBooking.notes || requestedBooking.complaint || "Konsultasi")} · {getPlannedTreatmentDurationMinutes(requestedBooking.plannedTreatments)} menit
                    </p>
                  </div>
                );
              })() : (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Pilih Jadwal atau Visit Pasien</label>
                  {eligibleCheckInBookings.length === 0 && eligibleUnbookedVisits.length === 0 ? (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 space-y-2">
                      <p className="leading-relaxed">
                        Belum ada jadwal atau kunjungan yang bisa di-check-in. Daftarkan pasien Walk-In melalui Jadwal Pasien dengan sumber Walk-In.
                      </p>
                    </div>
                  ) : (
                    <select
                      value={
                        selectedBookingIdForCheckIn
                          ? `booking:${selectedBookingIdForCheckIn}`
                          : selectedVisitIdForCheckIn
                            ? `visit:${selectedVisitIdForCheckIn}`
                            : ""
                      }
                      onChange={(e) => {
                        const [type, id] = e.target.value.split(":", 2);
                        if (type === "booking") {
                          const selectedBooking = eligibleCheckInBookings.find((booking) => booking.id === id);
                          setSelectedBookingIdForCheckIn(id);
                          setSelectedVisitIdForCheckIn("");
                          setCustomDuration(getPlannedTreatmentDurationMinutes(selectedBooking?.plannedTreatments));
                        } else if (type === "visit") {
                          const selectedVisit = eligibleUnbookedVisits.find((visit) => visit.id === id);
                          setSelectedBookingIdForCheckIn("");
                          setSelectedVisitIdForCheckIn(id);
                          setCustomDuration(getPlannedTreatmentDurationMinutes(selectedVisit?.plannedTreatments));
                        } else {
                          setSelectedBookingIdForCheckIn("");
                          setSelectedVisitIdForCheckIn("");
                        }
                      }}
                      required
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                    >
                      <option value="">-- Pilih Jadwal / Visit --</option>
                      {eligibleCheckInBookings.length > 0 && (
                        <optgroup label="Jadwal Pasien">
                          {eligibleCheckInBookings.map((booking) => {
                            const patient = patientsList.find((item) => item.id === booking.patientId);
                            const doctor = doctors.find((item) => item.id === booking.doctorId);
                            return (
                              <option key={booking.id} value={`booking:${booking.id}`}>
                                {patient?.fullName || patient?.name || booking.patientNameSnapshot || "Pasien"} - {doctor?.name || booking.doctorNameSnapshot || "Dokter"} - {getOperationalTimeString(booking.bookingDateTime)} WIB - {getPlannedTreatmentSummary(booking.plannedTreatments, booking.notes || booking.complaint || "Konsultasi")}
                              </option>
                            );
                          })}
                        </optgroup>
                      )}
                      {eligibleUnbookedVisits.length > 0 && (
                        <optgroup label="Visit tanpa jadwal">
                          {eligibleUnbookedVisits.map((visit) => {
                            const patient = patientsList.find((item) => item.id === visit.patientId);
                            const doctor = doctors.find((item) => item.id === visit.doctorId);
                            return (
                              <option key={visit.id} value={`visit:${visit.id}`}>
                                {patient?.fullName || patient?.name || "Pasien"} - {doctor?.name || "Dokter"} - {getOperationalTimeString(visit.visitDateTime)} WIB
                              </option>
                            );
                          })}
                        </optgroup>
                      )}
                    </select>
                  )}
                  {selectedBookingIdForCheckIn && (() => {
                    const selectedBooking = allBookingsList.find((booking) => booking.id === selectedBookingIdForCheckIn);
                    const planned = selectedBooking?.plannedTreatments || [];
                    return planned.length > 0 ? (
                      <p className="mt-2 text-[11px] text-emerald-800">
                        Rencana: {planned.map((item) => item.serviceNameSnapshot).join(", ")} · {getPlannedTreatmentDurationMinutes(planned)} menit
                      </p>
                    ) : null;
                  })()}
                  {selectedVisitIdForCheckIn && (() => {
                    const selectedVisit = eligibleUnbookedVisits.find((visit) => visit.id === selectedVisitIdForCheckIn);
                    return selectedVisit ? (
                      <p className="mt-2 text-[11px] text-emerald-800">
                        Visit tanpa jadwal · {selectedVisit.complaint || "Kunjungan Walk-In"}
                      </p>
                    ) : null;
                  })()}
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
                  onClick={() => {
                    setShowCheckInModal(false);
                    if (isCheckInPage) navigate(queuePagePath);
                  }}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isCheckInSubmitting || (
                    requestedBookingId
                      ? !requestedBooking || requestedBooking.status === BookingStatus.CANCELLED || requestedBooking.status === BookingStatus.COMPLETED
                      : !selectedBookingIdForCheckIn && !selectedVisitIdForCheckIn
                  )}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg font-semibold transition-colors shadow-xs"
                >
                  {isCheckInSubmitting ? "Memproses..." : "Check-In Sekarang"}
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
    </>
  );
};
