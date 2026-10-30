import React, { useState, useEffect, useMemo } from "react";
import { useApp } from "../context/AppContext";
import {
  Booking,
  BookingStatus,
  BookingSource,
  ScheduleStatus,
  UserRole,
  StaffPosition,
  PatientProfile,
  DentalDoctor,
  DoctorSchedule,
  VisitType,
  QueueItem,
  QueueStatus,
  PatientVisit,
  VisitStatus,
  MasterService,
  Staff
} from "../types/domain";
import {
  getTodayDateString,
  getTomorrowDateString,
  formatIndonesianDate,
  getOperationalDateString,
  getOperationalTimeString,
  toOperationalDateTime
} from "../utils/dateUtils";
import { isBranchMatch } from "../utils/branchUtils";
import { canViewPatientPhone } from "../utils/patientPrivacy";
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
  AlertCircle,
  UserCheck,
  RefreshCw,
  FileText,
  ChevronRight
} from "lucide-react";
import { useRouter } from "../components/Router";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { TreatmentPicker } from "../components/TreatmentPicker";
import { getPlannedTreatmentDurationMinutes, getPlannedTreatmentSummary, snapshotPlannedTreatments } from "../utils/plannedTreatmentUtils";
import { DEFAULT_BOOKING_TIME_SLOTS, getScheduledBookingTimeSlots } from "../utils/bookingScheduleUtils";
import { hasActiveBookingForPatientOnDate, hasActiveQueueForPatientOnDate, isActiveQueueStatus } from "../utils/bookingQueueGuards";
import { getPatientMedicalRecordNumber } from "../utils/rmUtils";
import { getCheckInCancellationBlockReason } from "../utils/bookingCancellation";

const addCalendarDays = (date: string, days: number) => {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

const getWeekStart = (date: string) => {
  const value = new Date(`${date}T12:00:00Z`);
  const offsetFromMonday = (value.getUTCDay() + 6) % 7;
  value.setUTCDate(value.getUTCDate() - offsetFromMonday);
  return value.toISOString().slice(0, 10);
};

const formatCalendarDate = (date: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("id-ID", { ...options, timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));

type BookingReferralStaffOption = Pick<Staff, "id" | "fullName" | "position" | "branchId">;

const isBookingReferralStaffOption = (value: unknown): value is {
  id: string;
  full_name: string;
  position: StaffPosition.BRANCH_ADMIN | StaffPosition.ASSISTANT;
  branch_id: string | null;
} => {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "string"
    && typeof row.full_name === "string"
    && (row.position === StaffPosition.BRANCH_ADMIN || row.position === StaffPosition.ASSISTANT)
    && (typeof row.branch_id === "string" || row.branch_id === null);
};

const getMinutesOfDay = (time: string) => {
  const match = time.match(/^(\d{1,2}):([0-5]\d)/);
  if (!match) return null;
  const hours = Number(match[1]);
  if (hours > 23) return null;
  return hours * 60 + Number(match[2]);
};

export const BookingManagement: React.FC = () => {
  const { repos, currentUser, selectedBranchId, branches, patients, staff, refreshData } = useApp();
  const canViewPatientPhoneNumber = canViewPatientPhone(currentUser?.role);
  const { navigate, path } = useRouter();

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [visits, setVisits] = useState<PatientVisit[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [branchFilter, setBranchFilter] = useState<string>("ALL");
  const [calendarWeekStart, setCalendarWeekStart] = useState(() => getWeekStart(getTodayDateString()));
  const [viewMode, setViewMode] = useState<"calendar" | "list">("calendar");
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [isRescheduleOpen, setIsRescheduleOpen] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleDoctorId, setRescheduleDoctorId] = useState("");
  const [rescheduleTimeSlot, setRescheduleTimeSlot] = useState("");
  const [rescheduleReason, setRescheduleReason] = useState("");
  const [rescheduleSchedules, setRescheduleSchedules] = useState<DoctorSchedule[]>([]);
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);
  const [rescheduleSuccess, setRescheduleSuccess] = useState<string | null>(null);
  const [isRescheduling, setIsRescheduling] = useState(false);

  // Create Booking Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [patientSearch, setPatientSearch] = useState<string>("");
  const [selectedPatient, setSelectedPatient] = useState<PatientProfile | null>(null);
  const [formBranchId, setFormBranchId] = useState<string>("");
  const [formDoctorId, setFormDoctorId] = useState<string>("");
  const [formDate, setFormDate] = useState<string>(getTomorrowDateString());
  const [formTimeSlot, setFormTimeSlot] = useState<string>("");
  const [formReferringStaffId, setFormReferringStaffId] = useState("");
  const [referringStaffSearch, setReferringStaffSearch] = useState("");
  const [referralStaffOptions, setReferralStaffOptions] = useState<BookingReferralStaffOption[]>([]);
  const [referralStaffLoading, setReferralStaffLoading] = useState(false);
  const [referralStaffError, setReferralStaffError] = useState<string | null>(null);
  const [formNotes, setFormNotes] = useState<string>("");
  const [plannedServices, setPlannedServices] = useState<MasterService[]>([]);
  const [bookingSource, setBookingSource] = useState<BookingSource>(BookingSource.FRONT_DESK);
  const [showNewPatientForm, setShowNewPatientForm] = useState(false);
  const [newPatientForm, setNewPatientForm] = useState({
    fullName: "",
    medicalRecordNumber: "",
    phone: "",
    identityDocumentType: "NIK" as "NIK" | "PASSPORT",
    identityDocumentNumber: "",
    placeOfBirth: "",
    dateOfBirth: "",
    gender: "" as "L" | "P" | "",
    address: "",
    occupation: "",
    religion: "",
    maritalStatus: "",
    education: ""
  });
  const [isCreatingPatient, setIsCreatingPatient] = useState(false);
  const [isPatientEditorOpen, setIsPatientEditorOpen] = useState(false);
  const [isPatientLoading, setIsPatientLoading] = useState(false);
  const [isPatientSaving, setIsPatientSaving] = useState(false);
  const [patientEditError, setPatientEditError] = useState<string | null>(null);
  const [patientEditSuccess, setPatientEditSuccess] = useState<string | null>(null);
  const [patientEditInitialRM, setPatientEditInitialRM] = useState("");
  const [patientEditDraft, setPatientEditDraft] = useState({
    fullName: "",
    medicalRecordNumber: "",
    phone: "",
    identityDocumentType: "NIK" as "NIK" | "PASSPORT",
    identityDocumentNumber: "",
    placeOfBirth: "",
    dateOfBirth: "",
    gender: "L" as "L" | "P",
    address: "",
    occupation: "",
    religion: "",
    maritalStatus: "",
    education: ""
  });
  const [doctorsList, setDoctorsList] = useState<DentalDoctor[]>([]);
  const [schedulesList, setSchedulesList] = useState<DoctorSchedule[]>([]);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [bookingCheckInError, setBookingCheckInError] = useState<string | null>(null);
  const [isCheckInSubmitting, setIsCheckInSubmitting] = useState(false);

  const [bookingToCancel, setBookingToCancel] = useState<Booking | null>(null);
  const [bookingToCancelCheckIn, setBookingToCancelCheckIn] = useState<Booking | null>(null);
  const [checkInCancellationReason, setCheckInCancellationReason] = useState("");
  const [checkInCancellationError, setCheckInCancellationError] = useState<string | null>(null);
  const [isCancellingCheckIn, setIsCancellingCheckIn] = useState(false);
  const [isCancellingBooking, setIsCancellingBooking] = useState<boolean>(false);
  const [bookingToClose, setBookingToClose] = useState<Booking | null>(null);
  const [isClosingBooking, setIsClosingBooking] = useState(false);
  const [bookingCloseError, setBookingCloseError] = useState<string | null>(null);
  const [bookingCloseFeedback, setBookingCloseFeedback] = useState<{ bookingId: string; message: string } | null>(null);

  const effectiveBranchId = currentUser?.role === UserRole.BRANCH_ADMIN ? currentUser.assignedBranchId : (branchFilter !== "ALL" ? branchFilter : selectedBranchId);
  const selectedReferringStaff = referralStaffOptions.find((employee) => employee.id === formReferringStaffId);
  const availableReferringStaff = useMemo(() => {
    const query = referringStaffSearch.trim().toLocaleLowerCase("id");
    if (!query || formReferringStaffId) return [];
    return referralStaffOptions
      .filter((employee) => {
        const branchName = branches.find((branch) => isBranchMatch(branch.id, employee.branchId, branches))?.name || "";
        const positionName = employee.position === StaffPosition.BRANCH_ADMIN ? "admin" : "asisten";
        return `${employee.fullName} ${positionName} ${branchName}`.toLocaleLowerCase("id").includes(query);
      })
      .slice(0, 8);
  }, [branches, formReferringStaffId, referralStaffOptions, referringStaffSearch]);

  useEffect(() => {
    let isCurrent = true;
    const isBookingAdmin = currentUser?.role === UserRole.BRANCH_ADMIN || currentUser?.role === UserRole.SUPER_ADMIN;
    if (!currentUser || !isBookingAdmin) {
      setReferralStaffOptions([]);
      setReferralStaffError(null);
      setReferralStaffLoading(false);
      return () => {
        isCurrent = false;
      };
    }

    if (!isSupabaseConfigured) {
      setReferralStaffOptions(
        staff
          .filter((employee) =>
            employee.active &&
            employee.employmentStatus === "ACTIVE" &&
            (employee.position === StaffPosition.BRANCH_ADMIN || employee.position === StaffPosition.ASSISTANT)
          )
          .map(({ id, fullName, position, branchId }) => ({ id, fullName, position, branchId }))
          .sort((a, b) => a.fullName.localeCompare(b.fullName, "id"))
      );
      setReferralStaffError(null);
      setReferralStaffLoading(false);
      return () => {
        isCurrent = false;
      };
    }

    setReferralStaffLoading(true);
    setReferralStaffError(null);
    setReferralStaffOptions([]);
    void (async () => {
      try {
        const { data, error } = await supabase.rpc("get_booking_referral_staff");
        if (error) throw new Error(error.message);
        if (!Array.isArray(data) || !data.every(isBookingReferralStaffOption)) {
          throw new Error("Format daftar staf referral dari server tidak valid.");
        }
        if (!isCurrent) return;
        setReferralStaffOptions(
          data
            .map((row) => ({
              id: row.id,
              fullName: row.full_name,
              position: row.position,
              branchId: row.branch_id
            }))
            .sort((a, b) => a.fullName.localeCompare(b.fullName, "id"))
        );
      } catch (error: unknown) {
        if (!isCurrent) return;
        const message = error instanceof Error ? error.message : String(error);
        setReferralStaffOptions([]);
        setReferralStaffError(`Gagal memuat pilihan referral semua cabang: ${message}`);
      } finally {
        if (isCurrent) setReferralStaffLoading(false);
      }
    })();

    return () => {
      isCurrent = false;
    };
  }, [currentUser?.id, currentUser?.role, staff]);
  const patientProfileForDetail = selectedBooking
    ? patients.find((patient) => patient.id === selectedBooking.patientId)
    : undefined;

  const loadData = async () => {
    setLoading(true);
    try {
      const results = await Promise.allSettled([
        repos.booking.getBookings(
          currentUser?.role,
          currentUser?.assignedBranchId
        ),
        repos.doctor.getDoctors(),
        repos.queue.getQueueItems(),
        repos.visit.getVisits()
      ]);

      const [bkRes, docRes, qRes, visRes] = results;
      if (bkRes.status === "fulfilled") setBookings(bkRes.value);
      if (docRes.status === "fulfilled") {
        setDoctorsList(docRes.value);
      }
      if (qRes.status === "fulfilled") setQueueItems(qRes.value);
      if (visRes.status === "fulfilled") setVisits(visRes.value);
    } catch (err: any) {
      console.error("Error loading bookings:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [effectiveBranchId]);

  useEffect(() => {
    let active = true;
    if (!isModalOpen || !formBranchId || !formDate) {
      setSchedulesList([]);
      return () => {
        active = false;
      };
    }

    setSchedulesList([]);
    repos.doctorSchedule.getSchedules(
      { branchId: formBranchId, date: formDate, status: ScheduleStatus.ACTIVE },
      currentUser?.role,
      currentUser?.assignedBranchId,
      currentUser?.doctorId
    ).then((schedules) => {
      if (active) setSchedulesList(schedules);
    }).catch((error: unknown) => {
      if (!active) return;
      console.error("Gagal memuat jadwal dokter untuk booking:", error);
      setFormError(error instanceof Error ? error.message : "Gagal memuat jadwal dokter.");
    });

    return () => {
      active = false;
    };
  }, [
    isModalOpen,
    formBranchId,
    formDate,
    repos.doctorSchedule,
    currentUser?.role,
    currentUser?.assignedBranchId,
    currentUser?.doctorId
  ]);

  useEffect(() => {
    let active = true;
    if (!isRescheduleOpen || !selectedBooking || !rescheduleDate) {
      setRescheduleSchedules([]);
      return () => {
        active = false;
      };
    }

    setRescheduleSchedules([]);
    repos.doctorSchedule.getSchedules(
      { branchId: selectedBooking.branchId, date: rescheduleDate, status: ScheduleStatus.ACTIVE },
      currentUser?.role,
      currentUser?.assignedBranchId,
      currentUser?.doctorId
    ).then((schedules) => {
      if (active) setRescheduleSchedules(schedules);
    }).catch((error: unknown) => {
      if (!active) return;
      console.error("Gagal memuat jadwal dokter untuk jadwal ulang:", error);
      setRescheduleError(error instanceof Error ? error.message : "Gagal memuat jadwal dokter.");
    });

    return () => {
      active = false;
    };
  }, [
    isRescheduleOpen,
    selectedBooking,
    rescheduleDate,
    repos.doctorSchedule,
    currentUser?.role,
    currentUser?.assignedBranchId,
    currentUser?.doctorId
  ]);

  // Set default form branch with flexible branch matching for Branch Admin
  useEffect(() => {
    if (currentUser?.role === UserRole.BRANCH_ADMIN && currentUser.assignedBranchId) {
      const match = branches.find((b) => isBranchMatch(b.id, currentUser.assignedBranchId, branches));
      setFormBranchId(match ? match.id : currentUser.assignedBranchId);
    } else if (branches.length > 0 && !formBranchId) {
      setFormBranchId(branches[0].id);
    }
  }, [currentUser, branches, formBranchId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("source") !== BookingSource.WALK_IN) return;

    const requestedPatientId = params.get("patientId");
    const patient = requestedPatientId
      ? patients.find((item) => item.id === requestedPatientId)
      : undefined;
    if (requestedPatientId && !patient) return;

    setFormBranchId(
      currentUser?.role === UserRole.BRANCH_ADMIN
        ? currentUser.assignedBranchId || ""
        : selectedBranchId || branches[0]?.id || ""
    );
    setFormDate(getTodayDateString());
    setFormDoctorId("");
    setFormTimeSlot("");
    setFormReferringStaffId("");
    setReferringStaffSearch("");
    setSelectedPatient(patient || null);
    setPatientSearch("");
    setShowNewPatientForm(false);
    setBookingSource(BookingSource.WALK_IN);
    setFormError(null);
    setFormSuccess(null);
    setPlannedServices([]);
    setIsModalOpen(true);
    navigate(path);
  }, [branches, currentUser, navigate, path, patients, selectedBranchId]);

  // Active schedules flexibly filtered by selected branch, date, and status ACTIVE
  const activeSchedulesForBranchAndDate = useMemo(() => {
    if (!formBranchId || !formDate) return [];
    return schedulesList.filter(
      (s) => isBranchMatch(s.branchId, formBranchId, branches) && s.date === formDate && s.status === "ACTIVE"
    );
  }, [schedulesList, formBranchId, formDate, branches]);

  const hasScheduleForBranchAndDate = activeSchedulesForBranchAndDate.length > 0;

  // Available doctors: ONLY doctors who have an ACTIVE schedule at formBranchId on formDate
  const availableDoctors = useMemo(() => {
    if (!formBranchId || !formDate || activeSchedulesForBranchAndDate.length === 0) {
      return [];
    }
    const scheduledDocIds = new Set(activeSchedulesForBranchAndDate.map((s) => s.doctorId));
    const activeDocs = doctorsList.filter((d) => d.active ?? d.isActive ?? true);
    return activeDocs.filter((d) => {
      if (scheduledDocIds.has(d.id)) return true;
      return activeSchedulesForBranchAndDate.some((s) => {
        const cleanD = d.id.toLowerCase().replace(/^doc-/, "");
        const cleanS = s.doctorId.toLowerCase().replace(/^doc-/, "");
        return cleanD === cleanS || (d.doctorCode && d.doctorCode.toLowerCase() === s.doctorId.toLowerCase());
      });
    });
  }, [doctorsList, formBranchId, formDate, activeSchedulesForBranchAndDate]);

  // Sync formDoctorId when availableDoctors changes
  useEffect(() => {
    if (formDoctorId && !availableDoctors.some((d) => d.id === formDoctorId)) {
      setFormDoctorId("");
    }
  }, [availableDoctors, formDoctorId]);

  // Calculate available time slots based on selected doctor's schedule or default clinic slots
  const availableTimeSlots = useMemo(() => {
    if (hasScheduleForBranchAndDate && formDoctorId) {
      const docSchedule = activeSchedulesForBranchAndDate.find((s) => s.doctorId === formDoctorId);
      if (docSchedule) {
        const requestedDuration = getPlannedTreatmentDurationMinutes(snapshotPlannedTreatments(plannedServices), 30);
        const scheduleEnd = getMinutesOfDay(docSchedule.endTime);
        return getScheduledBookingTimeSlots(docSchedule).filter((slot) => {
          const candidateStart = getMinutesOfDay(slot);
          if (candidateStart === null || (scheduleEnd !== null && candidateStart + requestedDuration > scheduleEnd)) return false;
          return !bookings.some((booking) => {
            if (
              (booking.status !== BookingStatus.PENDING && booking.status !== BookingStatus.CONFIRMED) ||
              booking.doctorId !== formDoctorId ||
              !isBranchMatch(booking.branchId, formBranchId, branches) ||
              getOperationalDateString(booking.bookingDateTime) !== formDate
            ) return false;
            const bookedStart = getMinutesOfDay(booking.timeSlot || getOperationalTimeString(booking.bookingDateTime));
            if (bookedStart === null) return false;
            const bookedDuration = getPlannedTreatmentDurationMinutes(booking.plannedTreatments || [], 30);
            return candidateStart < bookedStart + bookedDuration && bookedStart < candidateStart + requestedDuration;
          });
        });
      }
    }
    return DEFAULT_BOOKING_TIME_SLOTS;
  }, [hasScheduleForBranchAndDate, formDoctorId, activeSchedulesForBranchAndDate, bookings, formBranchId, formDate, branches, plannedServices]);

  const rescheduleDoctors = useMemo(() => {
    return doctorsList.filter((doctor) => doctor.active && rescheduleSchedules.some((schedule) => {
      const doctorId = doctor.id.toLowerCase().replace(/^doc-/, "");
      const scheduleId = schedule.doctorId.toLowerCase().replace(/^doc-/, "");
      return doctorId === scheduleId || (!!doctor.doctorCode && doctor.doctorCode.toLowerCase() === schedule.doctorId.toLowerCase());
    }));
  }, [doctorsList, rescheduleSchedules]);

  const rescheduleTimeSlots = useMemo(() => {
    if (!selectedBooking || !rescheduleDoctorId || !rescheduleDate) return [];
    const selectedDoctor = doctorsList.find((doctor) => doctor.id === rescheduleDoctorId);
    const schedule = rescheduleSchedules.find((item) => {
      const doctorId = (selectedDoctor?.id || "").toLowerCase().replace(/^doc-/, "");
      const scheduleId = item.doctorId.toLowerCase().replace(/^doc-/, "");
      return item.doctorId === rescheduleDoctorId || doctorId === scheduleId ||
        (!!selectedDoctor?.doctorCode && selectedDoctor.doctorCode.toLowerCase() === item.doctorId.toLowerCase());
    });
    if (!schedule) return [];
    const duration = getPlannedTreatmentDurationMinutes(selectedBooking.plannedTreatments || [], 30);
    const scheduleEnd = getMinutesOfDay(schedule.endTime);

    return getScheduledBookingTimeSlots(schedule).filter((slot) => {
      const candidateStart = getMinutesOfDay(slot);
      if (candidateStart === null || (scheduleEnd !== null && candidateStart + duration > scheduleEnd)) return false;
      return !bookings.some((booking) => {
        if (
          booking.id === selectedBooking.id ||
          (booking.status !== BookingStatus.PENDING && booking.status !== BookingStatus.CONFIRMED) ||
          booking.doctorId !== rescheduleDoctorId ||
          !isBranchMatch(booking.branchId, selectedBooking.branchId, branches) ||
          getOperationalDateString(booking.bookingDateTime) !== rescheduleDate
        ) return false;
        const bookedStart = getMinutesOfDay(booking.timeSlot || getOperationalTimeString(booking.bookingDateTime));
        if (bookedStart === null) return false;
        const bookedDuration = getPlannedTreatmentDurationMinutes(booking.plannedTreatments || [], 30);
        return candidateStart < bookedStart + bookedDuration && bookedStart < candidateStart + duration;
      });
    });
  }, [selectedBooking, rescheduleDoctorId, rescheduleDate, rescheduleSchedules, doctorsList, bookings, branches]);

  useEffect(() => {
    if (rescheduleTimeSlot && !rescheduleTimeSlots.includes(rescheduleTimeSlot)) {
      setRescheduleTimeSlot(rescheduleTimeSlots[0] || "");
    } else if (!rescheduleTimeSlot && rescheduleTimeSlots.length > 0) {
      setRescheduleTimeSlot(rescheduleTimeSlots[0]);
    }
  }, [rescheduleTimeSlots, rescheduleTimeSlot]);

  // Sync formTimeSlot when availableTimeSlots changes
  useEffect(() => {
    if (formTimeSlot && !availableTimeSlots.includes(formTimeSlot)) {
      setFormTimeSlot(availableTimeSlots[0] || "");
    } else if (!formTimeSlot && availableTimeSlots.length > 0) {
      setFormTimeSlot(availableTimeSlots[0]);
    }
  }, [availableTimeSlots, formTimeSlot]);

  // Track bookings whose queue or visit has finished
  const completedBookingIds = useMemo(() => {
    const ids = new Set<string>();
    queueItems.forEach((q) => {
      if (q.status === QueueStatus.COMPLETED || q.status === QueueStatus.SKIPPED) {
        if (q.bookingId) ids.add(q.bookingId);
        if (q.visitId) {
          const v = visits.find((vis) => vis.id === q.visitId);
          if (v?.bookingId) ids.add(v.bookingId);
        }
      }
    });
    visits.forEach((v) => {
      if (v.visitStatus === VisitStatus.COMPLETED && v.bookingId) {
        ids.add(v.bookingId);
      }
    });
    return ids;
  }, [queueItems, visits]);

  const checkedInBookingIds = useMemo(() => {
    const ids = new Set<string>();
    visits.forEach((visit) => {
      if (visit.bookingId) ids.add(visit.bookingId);
    });
    queueItems.forEach((queueItem) => {
      if (queueItem.bookingId) ids.add(queueItem.bookingId);
      if (queueItem.visitId) {
        const visit = visits.find((item) => item.id === queueItem.visitId);
        if (visit?.bookingId) ids.add(visit.bookingId);
      }
    });
    return ids;
  }, [queueItems, visits]);

  const getStaleBookingCloseBlockReason = (booking: Booking): string | null => {
    if (
      (booking.status !== BookingStatus.PENDING && booking.status !== BookingStatus.CONFIRMED) ||
      getOperationalDateString(booking.bookingDateTime) >= getTodayDateString()
    ) {
      return "Hanya booking aktif yang tanggalnya sudah lewat yang dapat ditutup.";
    }
    if (completedBookingIds.has(booking.id)) {
      return "Kunjungan ini sudah selesai atau dilewati. Riwayatnya tidak dapat dibatalkan dari sini.";
    }

    const linkedVisits = visits.filter((visit) => visit.bookingId === booking.id);
    if (!linkedVisits.some((visit) => visit.visitStatus !== VisitStatus.COMPLETED && visit.visitStatus !== VisitStatus.CANCELLED)) {
      return "Kunjungan aktif yang terkait booking ini tidak ditemukan.";
    }

    const linkedVisitIds = new Set(linkedVisits.map((visit) => visit.id));
    const activeQueueItems = queueItems.filter((item) =>
      (item.bookingId === booking.id || linkedVisitIds.has(item.visitId)) &&
      isActiveQueueStatus(item.status)
    );
    return null;
  };

  // Calculate statistics for active, completed, cancelled
  const bookingStats = useMemo(() => {
    let active = 0;
    let completed = 0;
    let cancelled = 0;
    bookings.forEach((b) => {
      if (b.status === BookingStatus.CANCELLED) {
        cancelled++;
      } else if (b.status === BookingStatus.COMPLETED || completedBookingIds.has(b.id)) {
        completed++;
      } else if (b.status !== BookingStatus.RESCHEDULED) {
        active++;
      }
    });
    return { active, completed, cancelled, total: bookings.length };
  }, [bookings, completedBookingIds]);

  // Filtered patients for booking creation search
  const searchedPatients = useMemo(() => {
    if (!patientSearch.trim()) return patients.slice(0, 5);
    const q = patientSearch.toLowerCase();
    return patients.filter(
      (p) =>
        (p.fullName || p.name || "").toLowerCase().includes(q) ||
        (canViewPatientPhoneNumber && (p.phone || "").includes(q)) ||
        getPatientMedicalRecordNumber(p, formBranchId || effectiveBranchId).toLowerCase().includes(q) ||
        (p.internalPatientCode || "").toLowerCase().includes(q)
    ).slice(0, 5);
  }, [patientSearch, patients, canViewPatientPhoneNumber, formBranchId, effectiveBranchId]);

  const handleCreatePatientForSchedule = async () => {
    const fullName = newPatientForm.fullName.trim();
    const medicalRecordNumber = newPatientForm.medicalRecordNumber.trim();
    const phone = newPatientForm.phone.trim();
    const documentNumber = newPatientForm.identityDocumentNumber.trim().replace(/\s/g, "");
    if (!fullName || !documentNumber || !newPatientForm.placeOfBirth.trim() || !newPatientForm.dateOfBirth || !newPatientForm.gender) {
      setFormError("Nama, identitas (NIK/paspor), tempat/tanggal lahir, dan jenis kelamin wajib diisi.");
      return;
    }
    if (newPatientForm.identityDocumentType === "NIK" && !/^\d{16}$/.test(documentNumber)) {
      setFormError("NIK harus terdiri dari 16 digit angka.");
      return;
    }
    if (newPatientForm.identityDocumentType === "PASSPORT" && !/^[A-Za-z0-9]{6,20}$/.test(documentNumber)) {
      setFormError("Nomor paspor harus terdiri dari 6–20 huruf atau angka.");
      return;
    }

    try {
      const duplicates = await repos.patient.checkDuplicates(
        phone || undefined,
        undefined,
        fullName,
        currentUser?.role,
        formBranchId || undefined
      );
      const matchingPatients = duplicates.byPhone
        .filter((patient, index, all) => all.findIndex((item) => item.id === patient.id) === index);
      const existingIdentity = patients.find((patient) =>
        patient.identityDocumentType === newPatientForm.identityDocumentType &&
        patient.identityDocumentNumber?.replace(/\s/g, "").toLowerCase() === documentNumber.toLowerCase()
      );
      if (matchingPatients.length > 0 || existingIdentity) {
        if (existingIdentity) {
          setFormError("Nomor identitas ini sudah terdaftar. Pilih profil pasien yang sudah ada agar tidak membuat data ganda.");
          setPatientSearch(existingIdentity.phone || existingIdentity.fullName || existingIdentity.name);
        } else {
          setFormError("Nomor HP ini sudah terdaftar. Pilih profil pasien yang sudah ada agar tidak membuat data ganda.");
          setPatientSearch(phone);
        }
        setShowNewPatientForm(false);
        return;
      }

      setIsCreatingPatient(true);
      const branchId = formBranchId || currentUser?.assignedBranchId || "";
      const patient = await repos.patient.createPatient(
        {
          name: fullName,
          fullName,
          medicalRecordNumber: medicalRecordNumber || undefined,
          phone,
          email: "",
          identityDocumentType: newPatientForm.identityDocumentType,
          identityDocumentNumber: documentNumber,
          placeOfBirth: newPatientForm.placeOfBirth.trim(),
          dateOfBirth: newPatientForm.dateOfBirth,
          gender: newPatientForm.gender,
          address: newPatientForm.address.trim(),
          occupation: newPatientForm.occupation.trim(),
          religion: newPatientForm.religion.trim(),
          maritalStatus: newPatientForm.maritalStatus,
          education: newPatientForm.education,
          medicalHistoryNotes: "",
          acquisitionSource: "UNKNOWN",
          referralName: "",
          referringStaffId: null,
          registeredBranchId: branchId || undefined
        },
        currentUser?.role,
        currentUser?.assignedBranchId
      );
      await refreshData();
      setSelectedPatient(patient);
      setPatientSearch("");
      setShowNewPatientForm(false);
      setNewPatientForm({
        fullName: "", medicalRecordNumber: "", phone: "", identityDocumentType: "NIK", identityDocumentNumber: "",
        placeOfBirth: "", dateOfBirth: "", gender: "", address: "", occupation: "",
        religion: "", maritalStatus: "", education: ""
      });
      setFormError(null);
    } catch (error) {
      console.error("Gagal menambahkan pasien dari formulir jadwal:", error);
      setFormError(error instanceof Error ? error.message : "Gagal menambahkan pasien baru.");
    } finally {
      setIsCreatingPatient(false);
    }
  };

  const handleOpenPatientEditor = async () => {
    if (!selectedBooking) return;
    setPatientEditError(null);
    setPatientEditSuccess(null);
    setPatientEditInitialRM("");
    setIsPatientEditorOpen(true);
    setIsPatientLoading(true);
    try {
      const patient = await repos.patient.getPatientById(
        selectedBooking.patientId,
        currentUser?.role,
        currentUser?.assignedBranchId
      );
      if (!patient) throw new Error("Profil pasien tidak ditemukan.");
      const branchRM = getPatientMedicalRecordNumber(patient, selectedBooking.branchId);
      setPatientEditInitialRM(branchRM);
      setPatientEditDraft({
        fullName: patient.fullName || patient.name || "",
        medicalRecordNumber: branchRM,
        phone: patient.phone || "",
        identityDocumentType: patient.identityDocumentType || "NIK",
        identityDocumentNumber: patient.identityDocumentNumber || "",
        placeOfBirth: patient.placeOfBirth || "",
        dateOfBirth: patient.dateOfBirth || "",
        gender: patient.gender || "L",
        address: patient.address || "",
        occupation: patient.occupation || "",
        religion: patient.religion || "",
        maritalStatus: patient.maritalStatus || "",
        education: patient.education || ""
      });
    } catch (error) {
      console.error("Gagal memuat profil untuk dilengkapi:", error);
      setPatientEditError(error instanceof Error ? error.message : "Gagal memuat data pasien.");
    } finally {
      setIsPatientLoading(false);
    }
  };

  const handleSavePatientProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    setPatientEditError(null);
    if (!selectedBooking) return;
    const documentNumber = patientEditDraft.identityDocumentNumber.trim().replace(/\s/g, "");
    if (!patientEditDraft.fullName.trim() || !documentNumber || !patientEditDraft.placeOfBirth.trim() || !patientEditDraft.dateOfBirth) {
      setPatientEditError("Nama, identitas (NIK/paspor), tempat dan tanggal lahir wajib diisi.");
      return;
    }
    if (patientEditDraft.identityDocumentType === "NIK" && !/^\d{16}$/.test(documentNumber)) {
      setPatientEditError("NIK harus terdiri dari 16 digit angka.");
      return;
    }
    if (patientEditDraft.identityDocumentType === "PASSPORT" && !/^[A-Za-z0-9]{6,20}$/.test(documentNumber)) {
      setPatientEditError("Nomor paspor harus terdiri dari 6–20 huruf atau angka.");
      return;
    }

    setIsPatientSaving(true);
    try {
      const medicalRecordNumber = patientEditDraft.medicalRecordNumber.trim();
      if (
        medicalRecordNumber &&
        !patientEditInitialRM &&
        (currentUser?.role === UserRole.BRANCH_ADMIN || currentUser?.role === UserRole.SUPER_ADMIN)
      ) {
        await repos.patient.registerPatientBranchMedicalRecordNumber(
          selectedBooking.patientId,
          selectedBooking.branchId,
          medicalRecordNumber,
          currentUser.role,
          currentUser.assignedBranchId
        );
      }
      await repos.patient.updatePatient(
        selectedBooking.patientId,
        {
          name: patientEditDraft.fullName.trim(),
          fullName: patientEditDraft.fullName.trim(),
          phone: patientEditDraft.phone.trim(),
          identityDocumentType: patientEditDraft.identityDocumentType,
          identityDocumentNumber: documentNumber,
          placeOfBirth: patientEditDraft.placeOfBirth.trim(),
          dateOfBirth: patientEditDraft.dateOfBirth,
          gender: patientEditDraft.gender,
          address: patientEditDraft.address.trim(),
          occupation: patientEditDraft.occupation.trim(),
          religion: patientEditDraft.religion.trim(),
          maritalStatus: patientEditDraft.maritalStatus,
          education: patientEditDraft.education
        },
        currentUser?.role,
        currentUser?.assignedBranchId
      );
      await refreshData();
      setIsPatientEditorOpen(false);
      setPatientEditSuccess("Data pasien berhasil diperbarui.");
    } catch (error) {
      console.error("Gagal menyimpan kelengkapan profil pasien:", error);
      setPatientEditError(error instanceof Error ? error.message : "Gagal menyimpan data pasien.");
    } finally {
      setIsPatientSaving(false);
    }
  };

  // Filtered booking list for main table
  const filteredBookings = useMemo(() => {
    return bookings.filter((b) => {
      // Branch filter
      if (currentUser?.role === UserRole.BRANCH_ADMIN && currentUser.assignedBranchId) {
        if (!isBranchMatch(b.branchId, currentUser.assignedBranchId, branches)) return false;
      } else if (branchFilter !== "ALL" && !isBranchMatch(b.branchId, branchFilter, branches)) {
        return false;
      }

      // Status filter
      const isCompleted = b.status === BookingStatus.COMPLETED || completedBookingIds.has(b.id);
      if (statusFilter === "ACTIVE") {
        // By default: Hide cancelled and hide completed bookings so the table stays clean!
        if (b.status === BookingStatus.CANCELLED || b.status === BookingStatus.RESCHEDULED) return false;
        if (isCompleted) return false;
      } else if (statusFilter === BookingStatus.COMPLETED) {
        if (!isCompleted) return false;
      } else if (statusFilter === BookingStatus.CANCELLED) {
        if (b.status !== BookingStatus.CANCELLED) return false;
      } else if (statusFilter !== "ALL" && b.status !== statusFilter) {
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
  }, [bookings, branchFilter, statusFilter, searchQuery, currentUser, completedBookingIds]);

  const calendarDates = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addCalendarDays(calendarWeekStart, index)),
    [calendarWeekStart]
  );

  const calendarBookingsByDate = useMemo(() => {
    const grouped = new Map<string, Booking[]>();
    calendarDates.forEach((date) => grouped.set(date, []));
    filteredBookings.forEach((booking) => {
      const date = getOperationalDateString(booking.bookingDateTime);
      grouped.get(date)?.push(booking);
    });
    grouped.forEach((dayBookings) => dayBookings.sort((a, b) =>
      getOperationalTimeString(a.bookingDateTime).localeCompare(getOperationalTimeString(b.bookingDateTime))
    ));
    return grouped;
  }, [calendarDates, filteredBookings]);

  const calendarWeekStats = useMemo(() => {
    const weekBookings = filteredBookings.filter((booking) => {
      const date = getOperationalDateString(booking.bookingDateTime);
      return date >= calendarWeekStart && date <= calendarDates[6];
    });
    return {
      total: weekBookings.length,
      confirmed: weekBookings.filter((booking) => booking.status === BookingStatus.CONFIRMED && !completedBookingIds.has(booking.id) && !checkedInBookingIds.has(booking.id)).length,
      pending: weekBookings.filter((booking) => booking.status === BookingStatus.PENDING && !completedBookingIds.has(booking.id)).length,
      checkedIn: weekBookings.filter((booking) => checkedInBookingIds.has(booking.id) && !completedBookingIds.has(booking.id)).length,
      completed: weekBookings.filter((booking) => booking.status === BookingStatus.COMPLETED || completedBookingIds.has(booking.id)).length,
      cancelled: weekBookings.filter((booking) => booking.status === BookingStatus.CANCELLED).length,
      rescheduled: weekBookings.filter((booking) => booking.status === BookingStatus.RESCHEDULED).length
    };
  }, [filteredBookings, calendarWeekStart, calendarDates, completedBookingIds, checkedInBookingIds]);

  const handleCreateBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    if (!selectedPatient) {
      setFormError("Pilih pasien terdaftar atau tambahkan pasien baru terlebih dahulu.");
      return;
    }

    if (!formBranchId) {
      setFormError("Pilih cabang klinik");
      return;
    }

    if (!formDoctorId) {
      if (availableDoctors.length === 0) {
        setFormError("Tidak ada dokter yang bertugas di tanggal dan cabang ini. Silakan pilih tanggal atau cabang lain.");
      } else {
        setFormError("Pilih dokter pemeriksa");
      }
      return;
    }

    if (!formDate || !formTimeSlot) {
      setFormError("Tanggal dan slot jam booking wajib diisi");
      return;
    }

    const fullISOString = toOperationalDateTime(`${formDate}T00:00:00+07:00`, formTimeSlot);

    const selectedDoc = doctorsList.find((d) => d.id === formDoctorId);
    const selectedBr = branches.find((b) => b.id === formBranchId);

    setIsSubmitting(true);
    try {
      if (bookingSource === BookingSource.WALK_IN) {
        const [latestBookings, latestQueue] = await Promise.all([
          repos.booking.getBookings(currentUser?.role, currentUser?.assignedBranchId),
          repos.queue.getQueueByBranch(formBranchId, currentUser?.role, currentUser?.assignedBranchId)
        ]);
        if (hasActiveBookingForPatientOnDate(latestBookings, selectedPatient.id, formBranchId, fullISOString)) {
          throw new Error("Pasien sudah memiliki jadwal aktif pada tanggal ini. Pilih jadwal tersebut untuk check-in, jangan buat jadwal Walk-In baru.");
        }
        if (hasActiveQueueForPatientOnDate(latestQueue, selectedPatient.id, formBranchId, fullISOString)) {
          throw new Error("Pasien sudah berada dalam antrean pada tanggal ini.");
        }
      }

      await repos.booking.createBooking(
        {
          patientId: selectedPatient.id,
          branchId: formBranchId,
          doctorId: formDoctorId,
          bookingDateTime: fullISOString,
          timeSlot: formTimeSlot,
          notes: formNotes,
          plannedTreatments: snapshotPlannedTreatments(plannedServices),
          source: bookingSource,
          channel: bookingSource,
          status: BookingStatus.PENDING,
          patientNameSnapshot: selectedPatient.fullName || selectedPatient.name || "Pasien",
          doctorNameSnapshot: selectedDoc?.name || "Dokter",
          branchNameSnapshot: selectedBr?.name || "Cabang",
          referringStaffId: formReferringStaffId || null,
          scheduleVerified: hasScheduleForBranchAndDate
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
        setFormReferringStaffId("");
        setReferringStaffSearch("");
        setPlannedServices([]);
        setBookingSource(BookingSource.FRONT_DESK);
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

  const handleCancelCheckInAndBooking = async () => {
    if (!bookingToCancelCheckIn) return;
    setIsCancellingCheckIn(true);
    setCheckInCancellationError(null);

    try {
      const [latestBooking, latestVisits, latestQueueItems] = await Promise.all([
        repos.booking.getBookingById(
          bookingToCancelCheckIn.id,
          currentUser?.role,
          currentUser?.assignedBranchId
        ),
        repos.visit.getVisits(),
        repos.queue.getQueueItems()
      ]);
      if (!latestBooking) throw new Error("Janji temu tidak ditemukan. Muat ulang halaman dan periksa kembali.");
      if (!checkInCancellationReason.trim()) {
        throw new Error("Masukkan alasan pembatalan check-in.");
      }

      const blockReason = getCheckInCancellationBlockReason(latestBooking, latestVisits, latestQueueItems);
      if (blockReason) throw new Error(blockReason);

      const linkedVisits = latestVisits.filter(
        (visit) => visit.bookingId === latestBooking.id && visit.visitStatus !== VisitStatus.CANCELLED
      );
      const linkedVisitIds = new Set(linkedVisits.map((visit) => visit.id));
      const linkedQueueItems = latestQueueItems.filter(
        (item) => (item.bookingId === latestBooking.id || linkedVisitIds.has(item.visitId)) &&
          item.status === QueueStatus.WAITING
      );
      const changedQueues: Array<{ id: string; status: QueueStatus }> = [];
      const changedVisits: PatientVisit[] = [];

      try {
        for (const item of linkedQueueItems) {
          changedQueues.push({ id: item.id, status: item.status as QueueStatus });
          await repos.queue.cancelQueuePatient(
            item.id,
            currentUser?.role,
            currentUser?.assignedBranchId,
            currentUser?.id
          );
        }
        for (const visit of linkedVisits) {
          changedVisits.push(visit);
          await repos.visit.updateVisitStatus(
            visit.id,
            VisitStatus.CANCELLED,
            currentUser?.role,
            currentUser?.assignedBranchId
          );
        }
        await repos.booking.updateBooking(
          latestBooking.id,
          {
            status: BookingStatus.CANCELLED,
            cancellationReason: checkInCancellationReason.trim()
          },
          currentUser?.role,
          currentUser?.assignedBranchId
        );
      } catch (updateError) {
        const rollbackFailures: string[] = [];
        for (const item of [...changedQueues].reverse()) {
          try {
            await repos.queue.restoreQueueStatus(
              item.id,
              item.status,
              currentUser?.role,
              currentUser?.assignedBranchId,
              currentUser?.id
            );
          } catch (rollbackError) {
            rollbackFailures.push(item.id);
            console.error(`Gagal memulihkan antrean ${item.id}:`, rollbackError);
          }
        }
        for (const visit of [...changedVisits].reverse()) {
          try {
            await repos.visit.updateVisitStatus(
              visit.id,
              visit.visitStatus,
              currentUser?.role,
              currentUser?.assignedBranchId
            );
          } catch (rollbackError) {
            rollbackFailures.push(visit.id);
            console.error(`Gagal memulihkan kunjungan ${visit.id}:`, rollbackError);
          }
        }
        try {
          await repos.booking.updateBooking(
            latestBooking.id,
            { status: latestBooking.status },
            currentUser?.role,
            currentUser?.assignedBranchId
          );
        } catch (rollbackError) {
          rollbackFailures.push(latestBooking.id);
          console.error(`Gagal memulihkan janji temu ${latestBooking.id}:`, rollbackError);
        }
        if (rollbackFailures.length > 0) {
          throw new Error("Pembatalan gagal dan sebagian status mungkin belum pulih. Periksa kembali janji, antrean, dan kunjungan pasien.");
        }
        throw updateError;
      }

      setBookings((current) => current.map((booking) =>
        booking.id === latestBooking.id ? { ...booking, status: BookingStatus.CANCELLED } : booking
      ));
      setVisits((current) => current.map((visit) =>
        linkedVisitIds.has(visit.id) ? { ...visit, visitStatus: VisitStatus.CANCELLED } : visit
      ));
      setQueueItems((current) => current.map((item) =>
        linkedQueueItems.some((linked) => linked.id === item.id)
          ? { ...item, status: QueueStatus.CANCELLED }
          : item
      ));
      setSelectedBooking({
        ...latestBooking,
        status: BookingStatus.CANCELLED,
        cancellationReason: checkInCancellationReason.trim()
      });
      setBookingToCancelCheckIn(null);
      setCheckInCancellationReason("");
      await loadData();
    } catch (error) {
      console.error("Gagal membatalkan check-in dan janji:", error);
      setCheckInCancellationError(
        error instanceof Error ? error.message : "Gagal membatalkan check-in dan janji."
      );
      await loadData();
    } finally {
      setIsCancellingCheckIn(false);
    }
  };

  const handleCloseStaleBooking = async () => {
    if (!bookingToClose) return;
    setIsClosingBooking(true);
    setBookingCloseError(null);

    try {
      const [latestBooking, latestVisits, latestQueueItems] = await Promise.all([
        repos.booking.getBookingById(bookingToClose.id, currentUser?.role, currentUser?.assignedBranchId),
        repos.visit.getVisits(),
        repos.queue.getQueueItems()
      ]);

      if (!latestBooking) throw new Error("Booking tidak ditemukan. Muat ulang halaman dan periksa kembali.");
      if (
        (latestBooking.status !== BookingStatus.PENDING && latestBooking.status !== BookingStatus.CONFIRMED) ||
        getOperationalDateString(latestBooking.bookingDateTime) >= getTodayDateString()
      ) {
        throw new Error("Booking ini tidak lagi memenuhi syarat untuk ditutup.");
      }

      const linkedVisits = latestVisits.filter((visit) => visit.bookingId === latestBooking.id);
      const activeVisits = linkedVisits.filter((visit) =>
        visit.visitStatus !== VisitStatus.COMPLETED && visit.visitStatus !== VisitStatus.CANCELLED
      );
      const linkedVisitIds = new Set(linkedVisits.map((visit) => visit.id));

      if (activeVisits.length === 0) {
        throw new Error("Tidak ditemukan kunjungan aktif yang perlu ditutup.");
      }
      if (latestVisits.some((visit) => visit.bookingId === latestBooking.id && visit.visitStatus === VisitStatus.COMPLETED)) {
        throw new Error("Booking memiliki kunjungan yang sudah selesai dan tidak dapat ditutup melalui tindakan ini.");
      }

      const activeQueueItems = latestQueueItems.filter((item) =>
        (item.bookingId === latestBooking.id || linkedVisitIds.has(item.visitId)) &&
        isActiveQueueStatus(item.status)
      );

      const visitsBeingUpdated: PatientVisit[] = [];
      const queuesBeingUpdated: Array<{ id: string; status: QueueStatus }> = [];
      try {
        for (const queueItem of activeQueueItems) {
          const previousStatus = Object.values(QueueStatus).find((status) => status === queueItem.status);
          if (!previousStatus) {
            throw new Error(`Status antrean ${queueItem.queueNumber} tidak dikenali dan tidak dapat dibatalkan dengan aman.`);
          }
          queuesBeingUpdated.push({ id: queueItem.id, status: previousStatus });
          await repos.queue.cancelQueuePatient(
            queueItem.id,
            currentUser?.role,
            currentUser?.assignedBranchId,
            currentUser?.id
          );
        }
        for (const visit of activeVisits) {
          visitsBeingUpdated.push(visit);
          await repos.visit.updateVisitStatus(
            visit.id,
            VisitStatus.CANCELLED,
            currentUser?.role,
            currentUser?.assignedBranchId
          );
        }
        await repos.booking.updateBooking(
          latestBooking.id,
          { status: BookingStatus.CANCELLED },
          currentUser?.role,
          currentUser?.assignedBranchId
        );
      } catch (updateError) {
        const rollbackFailures: string[] = [];
        try {
          await repos.booking.updateBooking(
            latestBooking.id,
            { status: latestBooking.status },
            currentUser?.role,
            currentUser?.assignedBranchId
          );
        } catch (rollbackError) {
          rollbackFailures.push(latestBooking.id);
          console.error(`Gagal memulihkan status booking ${latestBooking.id}:`, rollbackError);
        }
        for (const queueItem of [...queuesBeingUpdated].reverse()) {
          try {
            await repos.queue.restoreQueueStatus(
              queueItem.id,
              queueItem.status,
              currentUser?.role,
              currentUser?.assignedBranchId,
              currentUser?.id
            );
          } catch (rollbackError) {
            rollbackFailures.push(queueItem.id);
            console.error(`Gagal memulihkan status antrean ${queueItem.id}:`, rollbackError);
          }
        }
        for (const visit of [...visitsBeingUpdated].reverse()) {
          try {
            await repos.visit.updateVisitStatus(
              visit.id,
              visit.visitStatus,
              currentUser?.role,
              currentUser?.assignedBranchId
            );
          } catch (rollbackError) {
            rollbackFailures.push(visit.id);
            console.error(`Gagal memulihkan status kunjungan ${visit.id}:`, rollbackError);
          }
        }

        if (rollbackFailures.length > 0) {
          throw new Error("Penutupan booking gagal dan sebagian status booking, antrean, atau kunjungan mungkin belum pulih. Periksa kembali data sebelum mencoba lagi.");
        }
        throw updateError;
      }

      const successMessage = "Jadwal lama berhasil dibatalkan, termasuk antrean aktif terkait. Profil pasien dan riwayat tetap tersimpan.";
      setBookings((current) => current.map((booking) =>
        booking.id === latestBooking.id ? { ...booking, status: BookingStatus.CANCELLED } : booking
      ));
      setVisits((current) => current.map((visit) =>
        visit.bookingId === latestBooking.id && visit.visitStatus !== VisitStatus.COMPLETED && visit.visitStatus !== VisitStatus.CANCELLED
          ? { ...visit, visitStatus: VisitStatus.CANCELLED }
          : visit
      ));
      setSelectedBooking({ ...latestBooking, status: BookingStatus.CANCELLED });
      setBookingCloseFeedback({ bookingId: latestBooking.id, message: successMessage });
      setBookingToClose(null);
      await loadData();
    } catch (error) {
      console.error("Gagal menutup booking lama:", error);
      setBookingCloseError(error instanceof Error ? error.message : "Gagal menutup booking lama. Silakan coba lagi.");
      await loadData();
    } finally {
      setIsClosingBooking(false);
    }
  };

  const handleOpenCheckInModal = async (b: Booking) => {
    const routePrefix = currentUser?.role === UserRole.SUPER_ADMIN
      ? "/super-admin"
      : currentUser?.role === UserRole.BRANCH_ADMIN
        ? "/branch-admin"
        : null;

    if (!routePrefix) return;

    setBookingCheckInError(null);
    setIsCheckInSubmitting(true);
    try {
      if (checkedInBookingIds.has(b.id)) {
        setBookingCheckInError("Jadwal ini sudah masuk antrean. Buka menu Antrean Klinik untuk melihat status pasien.");
        return;
      }
      if (b.status === BookingStatus.CANCELLED || b.status === BookingStatus.RESCHEDULED || b.status === BookingStatus.COMPLETED) {
        throw new Error("Jadwal ini sudah tidak aktif dan tidak dapat di-check-in.");
      }

      await repos.queue.checkInVisitToQueue(
        null,
        currentUser?.role,
        currentUser?.assignedBranchId,
        {
          estimatedDurationMinutes: getPlannedTreatmentDurationMinutes(b.plannedTreatments),
          plannedTreatments: b.plannedTreatments || [],
          doctorId: b.doctorId,
          bookingTimeSnapshot: b.bookingDateTime,
          bookingId: b.id,
          branchId: b.branchId,
          patientId: b.patientId,
          patientNameSnapshot: b.patientNameSnapshot,
          doctorNameSnapshot: b.doctorNameSnapshot
        }
      );

      const successMessage = `Pasien ${b.patientNameSnapshot || "pasien"} berhasil di-check-in dan masuk antrean live!`;
      const queuePath = currentUser?.role === UserRole.SUPER_ADMIN ? "/super-admin/queue" : "/branch-admin/queue";
      const params = new URLSearchParams({ checkInSuccess: successMessage });
      if (currentUser?.role === UserRole.SUPER_ADMIN) params.set("branchId", b.branchId);
      navigate(`${queuePath}?${params.toString()}`);
    } catch (error) {
      console.error("Gagal check-in pasien dari jadwal:", error);
      setBookingCheckInError(error instanceof Error ? error.message : "Gagal memproses check-in pasien.");
    } finally {
      setIsCheckInSubmitting(false);
    }
  };

  const handleOpenNewBooking = (date = getTomorrowDateString()) => {
    setFormDate(date);
    setFormReferringStaffId("");
    setReferringStaffSearch("");
    setSelectedPatient(null);
    setPatientSearch("");
    setShowNewPatientForm(false);
    setBookingSource(BookingSource.FRONT_DESK);
    setFormError(null);
    setFormSuccess(null);
    setPlannedServices([]);
    setIsModalOpen(true);
  };

  const handleOpenReschedule = (booking: Booking) => {
    if (
      (booking.status !== BookingStatus.PENDING && booking.status !== BookingStatus.CONFIRMED) ||
      checkedInBookingIds.has(booking.id) ||
      completedBookingIds.has(booking.id)
    ) return;

    setRescheduleDate(getOperationalDateString(booking.bookingDateTime));
    setRescheduleDoctorId(booking.doctorId);
    setRescheduleTimeSlot("");
    setRescheduleReason("");
    setRescheduleError(null);
    setRescheduleSuccess(null);
    setIsRescheduleOpen(true);
  };

  useEffect(() => {
    if (!isRescheduleOpen || rescheduleSchedules.length === 0) return;
    if (!rescheduleDoctors.some((doctor) => doctor.id === rescheduleDoctorId)) {
      setRescheduleDoctorId(rescheduleDoctors[0]?.id || "");
    }
  }, [isRescheduleOpen, rescheduleSchedules, rescheduleDoctors, rescheduleDoctorId]);

  const handleSaveReschedule = async (event: React.FormEvent) => {
    event.preventDefault();
    setRescheduleError(null);
    if (!selectedBooking || isRescheduling) return;
    if (
      (selectedBooking.status !== BookingStatus.PENDING && selectedBooking.status !== BookingStatus.CONFIRMED) ||
      checkedInBookingIds.has(selectedBooking.id) ||
      completedBookingIds.has(selectedBooking.id)
    ) {
      setRescheduleError("Jadwal ini sudah tidak dapat dijadwalkan ulang.");
      return;
    }
    if (!rescheduleDoctorId || !rescheduleDate || !rescheduleTimeSlot || !rescheduleTimeSlots.includes(rescheduleTimeSlot)) {
      setRescheduleError("Pilih dokter, tanggal, dan slot yang masih tersedia.");
      return;
    }

    const nextDoctor = doctorsList.find((doctor) => doctor.id === rescheduleDoctorId);
    if (!nextDoctor) {
      setRescheduleError("Dokter yang dipilih tidak tersedia.");
      return;
    }
    const nextDateTime = toOperationalDateTime(`${rescheduleDate}T00:00:00+07:00`, rescheduleTimeSlot);
    let originalStatus = selectedBooking.status;
    setIsRescheduling(true);

    try {
      const latestBooking = await repos.booking.getBookingById(
        selectedBooking.id,
        currentUser?.role,
        currentUser?.assignedBranchId
      );
      if (
        !latestBooking ||
        (latestBooking.status !== BookingStatus.PENDING && latestBooking.status !== BookingStatus.CONFIRMED)
      ) {
        throw new Error("Jadwal ini sudah berubah atau tidak lagi dapat dijadwalkan ulang.");
      }
      const latestVisits = await repos.visit.getVisits();
      if (latestVisits.some((visit) => visit.bookingId === latestBooking.id)) {
        throw new Error("Pasien sudah check-in. Jadwal ini tidak dapat dijadwalkan ulang.");
      }
      originalStatus = latestBooking.status;

      await repos.booking.updateBooking(
        selectedBooking.id,
        { status: BookingStatus.RESCHEDULED },
        currentUser?.role,
        currentUser?.assignedBranchId
      );

      let newBooking: Booking;
      try {
        newBooking =         newBooking = await repos.booking.createBooking(
          {
            patientId: selectedBooking.patientId,
            branchId: selectedBooking.branchId,
            doctorId: rescheduleDoctorId,
            bookingDateTime: nextDateTime,
            timeSlot: rescheduleTimeSlot,
            notes: selectedBooking.notes || selectedBooking.complaint || "",
            complaint: selectedBooking.complaint,
            plannedTreatments: selectedBooking.plannedTreatments || [],
            source: selectedBooking.source || selectedBooking.channel || BookingSource.FRONT_DESK,
            channel: selectedBooking.source || selectedBooking.channel || BookingSource.FRONT_DESK,
            status: originalStatus,
            patientNameSnapshot: selectedBooking.patientNameSnapshot || "Pasien",
            doctorNameSnapshot: nextDoctor.name || "Dokter",
            branchNameSnapshot: selectedBooking.branchNameSnapshot || "Cabang",
            scheduleVerified: true,
            rescheduledFromBookingId: selectedBooking.id,
            rescheduleReason: rescheduleReason.trim() || undefined,
            referringStaffId: selectedBooking.referringStaffId || null
          },
          currentUser?.role,
          currentUser?.assignedBranchId
        );
      } catch (createError) {
        try {
          await repos.booking.updateBooking(
            selectedBooking.id,
            { status: originalStatus },
            currentUser?.role,
            currentUser?.assignedBranchId
          );
        } catch (restoreError) {
          console.error("Gagal memulihkan status jadwal setelah pembuatan jadwal ulang gagal:", restoreError);
          throw new Error(
            `Jadwal baru gagal dibuat dan status jadwal lama gagal dipulihkan. Perlu pemeriksaan admin. ` +
            `${createError instanceof Error ? createError.message : "Kesalahan pembuatan jadwal."}`
          );
        }
        throw createError;
      }

      const rescheduledBooking = { ...selectedBooking, status: BookingStatus.RESCHEDULED };
      setBookings((current) => [newBooking, ...current.map((booking) => booking.id === selectedBooking.id ? rescheduledBooking : booking)]);
      setSelectedBooking(rescheduledBooking);
      setIsRescheduleOpen(false);
      let confirmationWarning = "";
      try {
        await repos.h1.createOrInitializeH1Confirmation(newBooking.id, currentUser?.id);
      } catch (confirmationError) {
        console.error("Jadwal tersimpan tetapi konfirmasi H-1 gagal dibuat:", confirmationError);
        confirmationWarning = " Konfirmasi H-1 belum berhasil dibuat; hubungi admin untuk menindaklanjuti.";
      }
      setRescheduleSuccess(`Jadwal berhasil dipindahkan. Riwayat jadwal lama tetap tersimpan.${confirmationWarning}`);
      void refreshData();
      loadData();
    } catch (error) {
      console.error("Gagal menjadwalkan ulang booking:", error);
      setRescheduleError(error instanceof Error ? error.message : "Gagal menyimpan jadwal ulang.");
    } finally {
      setIsRescheduling(false);
    }
  };

  return (
    <div className="space-y-6 pb-12" id="booking-management-page">
      {/* SUPABASE PROFILE NOTICE */}
      {currentUser?.isMockFallback && (
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
      {/* Header Banner */}
      <div className="relative overflow-hidden bg-white rounded-2xl p-5 sm:p-6 border border-slate-200 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-emerald-500 to-amber-400" />
        <div>
          <div className="flex items-center gap-2 text-emerald-700 font-bold text-[10px] tracking-[0.16em] uppercase mb-2">
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-emerald-50 border border-emerald-100">
              <Calendar className="w-4 h-4" />
            </span>
            Pengelolaan kunjungan
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Jadwal Pasien
          </h1>
          <p className="text-slate-500 text-sm mt-1 max-w-2xl">
            Atur jadwal dari Online, WhatsApp, front desk, atau Walk-In. Walk-In menempati slot dokter yang kosong; Check-In dilakukan saat pasien siap.
          </p>
        </div>

        <button
          onClick={() => handleOpenNewBooking()}
          className="inline-flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold py-3 px-5 rounded-xl text-sm transition-all shadow-sm hover:shadow-md active:scale-[0.98]"
          id="btn-create-booking-modal"
        >
          <Plus className="w-4 h-4" />
          Jadwal Baru
        </button>
      </div>

      {/* Weekly overview */}
      <section aria-label="Ringkasan jadwal mingguan" className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {[
          { label: "Total jadwal", value: calendarWeekStats.total, hint: "Minggu terpilih", icon: Calendar, tone: "slate" },
          { label: "Menunggu", value: calendarWeekStats.pending, hint: "Belum dikonfirmasi", icon: Clock, tone: "amber" },
          { label: "Sudah check-in", value: calendarWeekStats.checkedIn, hint: "Sedang dalam alur layanan", icon: UserCheck, tone: "violet" },
          { label: "Selesai dilayani", value: calendarWeekStats.completed, hint: `${calendarWeekStats.cancelled} batal · ${calendarWeekStats.rescheduled} dijadwalkan ulang`, icon: CheckCircle2, tone: "emerald" }
        ].map(({ label, value, hint, icon: Icon, tone }) => {
          const color = tone === "amber"
            ? "text-amber-700 bg-amber-50 border-amber-100"
            : tone === "violet"
              ? "text-violet-700 bg-violet-50 border-violet-100"
              : tone === "emerald"
                ? "text-emerald-700 bg-emerald-50 border-emerald-100"
                : "text-slate-700 bg-slate-50 border-slate-200";
          return (
            <div key={label} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-slate-500">{label}</p>
                <p className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900">{value}</p>
                <p className="mt-1 text-[10px] text-slate-400">{hint}</p>
              </div>
              <span className={`inline-flex w-9 h-9 items-center justify-center rounded-xl border ${color}`}>
                <Icon className="w-4 h-4" />
              </span>
            </div>
          );
        })}
      </section>

      {/* Filter & Controls */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-4">
        {/* Quick Filter Status Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
            <button
              type="button"
              onClick={() => setStatusFilter("ACTIVE")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                statusFilter === "ACTIVE"
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
              id="filter-btn-active"
            >
              <Clock className="w-3.5 h-3.5" />
              Booking Aktif (Menunggu)
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${statusFilter === "ACTIVE" ? "bg-emerald-700 text-white" : "bg-slate-200 text-slate-700"}`}>
                {bookingStats.active}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter(BookingStatus.COMPLETED)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                statusFilter === BookingStatus.COMPLETED
                  ? "bg-blue-600 text-white shadow-xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
              id="filter-btn-completed"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Selesai Antrean
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${statusFilter === BookingStatus.COMPLETED ? "bg-blue-700 text-white" : "bg-slate-200 text-slate-700"}`}>
                {bookingStats.completed}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter(BookingStatus.CANCELLED)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                statusFilter === BookingStatus.CANCELLED
                  ? "bg-rose-600 text-white shadow-xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
              id="filter-btn-cancelled"
            >
              <XCircle className="w-3.5 h-3.5" />
              Dibatalkan
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${statusFilter === BookingStatus.CANCELLED ? "bg-rose-700 text-white" : "bg-slate-200 text-slate-700"}`}>
                {bookingStats.cancelled}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter("ALL")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                statusFilter === "ALL"
                  ? "bg-slate-800 text-white shadow-xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
              id="filter-btn-all"
            >
              Semua Riwayat
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${statusFilter === "ALL" ? "bg-slate-700 text-white" : "bg-slate-200 text-slate-700"}`}>
                {bookingStats.total}
              </span>
            </button>
          </div>

          <div className="text-[11px] text-slate-500 font-medium">
            {statusFilter === "ACTIVE" ? (
              <span className="text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                Tampilan aktif: jadwal selesai, batal, dan dijadwalkan ulang disembunyikan
              </span>
            ) : statusFilter === "ALL" ? (
              <span>Menampilkan seluruh riwayat</span>
            ) : statusFilter === BookingStatus.COMPLETED ? (
              <span className="text-blue-700 font-semibold bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                Riwayat pasien yang sudah selesai diperiksa
              </span>
            ) : statusFilter === BookingStatus.RESCHEDULED ? (
              <span className="text-violet-700 font-semibold bg-violet-50 px-2 py-0.5 rounded border border-violet-200">
                Riwayat jadwal lama yang sudah dipindahkan
              </span>
            ) : (
              <span className="text-rose-700 font-semibold bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                Riwayat janji temu yang dibatalkan
              </span>
            )}
          </div>
        </div>

        {/* Search & Dropdown Filters */}
        <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
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
            {/* Status filter dropdown */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
              id="select-filter-booking-status"
            >
              <option value="ACTIVE">Booking Aktif (Menunggu Kedatangan) - {bookingStats.active}</option>
              <option value="ALL">Semua Riwayat Booking ({bookingStats.total})</option>
              <option value={BookingStatus.PENDING}>Pending (Terjadwal)</option>
              <option value={BookingStatus.CONFIRMED}>Confirmed (Dikonfirmasi)</option>
              <option value={BookingStatus.COMPLETED}>Selesai Dilayani ({bookingStats.completed})</option>
              <option value={BookingStatus.CANCELLED}>Cancelled / Dibatalkan ({bookingStats.cancelled})</option>
              <option value={BookingStatus.RESCHEDULED}>Jadwal lama yang dijadwalkan ulang</option>
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
      </div>

      <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCalendarWeekStart(addCalendarDays(calendarWeekStart, -7))}
            aria-label="Tampilkan minggu sebelumnya"
            className="px-3 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:border-emerald-200 hover:bg-emerald-50"
          >
            Minggu lalu
          </button>
          <button
            type="button"
            onClick={() => setCalendarWeekStart(getWeekStart(getTodayDateString()))}
            className="px-3 py-2 rounded-lg bg-slate-900 text-xs font-bold text-white hover:bg-slate-800"
          >
            Hari ini
          </button>
          <button
            type="button"
            onClick={() => setCalendarWeekStart(addCalendarDays(calendarWeekStart, 7))}
            aria-label="Tampilkan minggu berikutnya"
            className="px-3 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:border-emerald-200 hover:bg-emerald-50"
          >
            Minggu depan
          </button>
          <span className="ml-2 text-sm font-extrabold text-slate-800">
            {formatCalendarDate(calendarWeekStart, { day: "numeric", month: "short" })} – {formatCalendarDate(calendarDates[6], { day: "numeric", month: "long", year: "numeric" })}
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[11px] text-slate-500">
            <span><strong className="text-slate-800">{calendarWeekStats.total}</strong> jadwal</span>
            <span className="text-amber-700">{calendarWeekStats.pending} menunggu</span>
            <span className="text-emerald-700">{calendarWeekStats.confirmed} dikonfirmasi</span>
            <span className="text-blue-700">{calendarWeekStats.completed} selesai</span>
            <span className="text-rose-700">{calendarWeekStats.cancelled} batal</span>
          </div>
          <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("calendar")}
              className={`px-3 py-1.5 rounded-md text-[11px] font-bold ${viewMode === "calendar" ? "bg-white text-emerald-800 shadow-sm" : "text-slate-600 hover:bg-white"}`}
            >
              Mingguan
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`px-3 py-1.5 rounded-md text-[11px] font-bold ${viewMode === "list" ? "bg-white text-emerald-800 shadow-sm" : "text-slate-600 hover:bg-white"}`}
            >
              Daftar
            </button>
          </div>
        </div>
      </div>

      {viewMode === "calendar" && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-1" aria-label="Legenda status jadwal">
          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Status</span>
          {[
            ["Terjadwal", "bg-amber-100 text-amber-800"],
            ["Dikonfirmasi", "bg-sky-100 text-sky-800"],
            ["Check-In", "bg-violet-100 text-violet-800"],
            ["Selesai", "bg-emerald-100 text-emerald-800"],
            ["Dibatalkan", "bg-rose-100 text-rose-800"],
            ["Jadwal ulang", "bg-slate-100 text-slate-600"]
          ].map(([label, style]) => (
            <span key={label} className="inline-flex items-center gap-1.5 text-[10px] font-medium text-slate-600">
              <span className={`w-2 h-2 rounded-full ${style.split(" ")[0]}`} />
              {label}
            </span>
          ))}
        </div>
      )}

      {viewMode === "calendar" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7 gap-3" id="patient-week-calendar">
          {calendarDates.map((date) => {
            const dayBookings = calendarBookingsByDate.get(date) || [];
            const isToday = date === getTodayDateString();
            return (
              <section key={date} className={`min-h-[360px] bg-white rounded-2xl border shadow-sm overflow-hidden flex flex-col transition-all hover:-translate-y-0.5 hover:shadow-md ${isToday ? "border-slate-200 ring-1 ring-slate-100" : "border-slate-200"}`}>
                <header
                  className="relative overflow-hidden border-b border-slate-200 px-3.5 py-2"
                  style={{
                    backgroundImage: "linear-gradient(90deg, #916b1c 0%, #ebd4a8 34%, #e1b951 68%, #916b1c 100%)"
                  }}
                >
                  <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
                    <div className="absolute inset-0 opacity-40">
                      <svg className="h-full w-full" viewBox="0 0 1000 80" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
                        <path d="M-100,60 C150,-10 350,90 550,20 C750,-50 850,100 1150,40" stroke={`url(#silkWhiteGradient-${date})`} strokeWidth="2.5" fill="none" />
                        <path d="M-50,70 C200,10 400,100 600,30 C800,-40 900,110 1200,50" stroke={`url(#silkWhiteGradient-${date})`} strokeWidth="1" fill="none" />
                        <defs>
                          <linearGradient id={`silkWhiteGradient-${date}`} x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.1" />
                            <stop offset="50%" stopColor="#ffffff" stopOpacity="0.6" />
                            <stop offset="100%" stopColor="#ffffff" stopOpacity="0.1" />
                          </linearGradient>
                        </defs>
                      </svg>
                    </div>
                    <div className="absolute left-1/3 top-0 bottom-0 w-1/4 -skew-x-12 bg-gradient-to-r from-transparent via-white/15 to-transparent" />
                  </div>
                  <div className="relative z-10 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div
                        className={`relative flex h-10 w-10 shrink-0 flex-col items-center justify-center overflow-hidden rounded-xl border border-white/60 shadow-sm ${isToday ? "bg-white/25 text-white" : "bg-white/50 text-[#5d451d]"}`}
                      >
                        <span className="text-[9px] font-extrabold uppercase leading-none tracking-wide">{formatCalendarDate(date, { weekday: "short" })}</span>
                        <span className="mt-0.5 text-sm font-extrabold leading-none">{formatCalendarDate(date, { day: "numeric" })}</span>
                      </div>
                      <div>
                        <div className="text-xs font-extrabold leading-tight tracking-tight text-white drop-shadow-sm">{formatCalendarDate(date, { weekday: "long" })}</div>
                        <div className="mt-0 text-[10px] font-semibold leading-tight text-white/90 drop-shadow-sm">{formatCalendarDate(date, { month: "long", year: "numeric" })}</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleOpenNewBooking(date)}
                      aria-label={`Tambah jadwal ${formatCalendarDate(date, { weekday: "long", day: "numeric", month: "long" })}`}
                      title="Tambah jadwal"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/70 bg-white/80 text-[#76551a] shadow-sm transition-all hover:border-white hover:bg-white hover:text-[#4f3811]"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="relative z-10 mt-1.5 flex items-center justify-between">
                    <span className="text-[10px] font-bold leading-tight text-white drop-shadow-sm">
                      {dayBookings.length === 1 ? "1 jadwal" : `${dayBookings.length} jadwal`}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${dayBookings.length ? "border border-white/70 bg-white/75 text-[#5d451d]" : "text-white/85"}`}>
                      {dayBookings.length ? "Terisi" : "Kosong"}
                    </span>
                  </div>
                </header>
                <div className="flex-1 space-y-2 p-2.5 max-h-[520px] overflow-y-auto">
                  {dayBookings.length === 0 ? (
                    <button
                      type="button"
                      onClick={() => handleOpenNewBooking(date)}
                      className="group flex min-h-44 w-full flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-3 text-center transition-colors hover:border-emerald-300 hover:bg-emerald-50/50"
                    >
                      <span className="mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-white border border-slate-200 text-slate-400 group-hover:border-emerald-200 group-hover:text-emerald-700">
                        <Plus className="h-4 w-4" />
                      </span>
                      <span className="text-[11px] font-semibold text-slate-500 group-hover:text-emerald-800">Belum ada jadwal</span>
                      <span className="mt-1 text-[10px] text-slate-400">Tambah kunjungan pasien</span>
                    </button>
                  ) : dayBookings.map((booking) => {
                    const isCompleted = booking.status === BookingStatus.COMPLETED || completedBookingIds.has(booking.id);
                    const isCheckedIn = checkedInBookingIds.has(booking.id);
                    const source = booking.source || booking.channel;
                    const sourceLabel = source === BookingSource.PATIENT_PORTAL || source === BookingSource.ANDROID
                      ? "Online"
                      : source === BookingSource.WHATSAPP
                        ? "WhatsApp"
                        : source === BookingSource.WALK_IN
                          ? "Walk-In"
                          : "Meja resepsionis";
                    const statusLabel = booking.status === BookingStatus.RESCHEDULED
                      ? "Jadwal ulang"
                      : booking.status === BookingStatus.CANCELLED
                        ? "Dibatalkan"
                        : isCompleted
                          ? "Selesai"
                          : isCheckedIn
                            ? "Check-In"
                            : booking.status === BookingStatus.CONFIRMED
                              ? "Dikonfirmasi"
                              : "Terjadwal";
                    const statusStyle = booking.status === BookingStatus.CANCELLED
                      ? "bg-rose-50 text-rose-700 border-rose-100"
                      : booking.status === BookingStatus.RESCHEDULED
                        ? "bg-slate-100 text-slate-600 border-slate-200"
                        : isCompleted
                          ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                          : isCheckedIn
                            ? "bg-violet-50 text-violet-700 border-violet-100"
                            : booking.status === BookingStatus.CONFIRMED
                              ? "bg-sky-50 text-sky-700 border-sky-100"
                              : "bg-amber-50 text-amber-800 border-amber-100";
                    const cardAccent = booking.status === BookingStatus.CANCELLED
                      ? "before:bg-rose-400"
                      : booking.status === BookingStatus.RESCHEDULED
                        ? "before:bg-slate-300"
                        : isCompleted
                          ? "before:bg-emerald-500"
                          : isCheckedIn
                            ? "before:bg-violet-500"
                            : booking.status === BookingStatus.CONFIRMED
                              ? "before:bg-sky-500"
                              : "before:bg-amber-400";
                    return (
                      <button
                        key={booking.id}
                        type="button"
                        onClick={() => setSelectedBooking(booking)}
                        className={`group relative w-full overflow-hidden rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-left shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all before:absolute before:inset-y-0 before:left-0 before:w-[3px] ${cardAccent} hover:border-emerald-200 hover:bg-slate-50/50 hover:shadow-sm`}
                      >
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span className="inline-flex shrink-0 items-center gap-1 text-xs font-extrabold leading-4 text-slate-900">
                            <Clock className="h-3 w-3 text-slate-400" aria-hidden="true" />
                            {getOperationalTimeString(booking.bookingDateTime)}
                          </span>
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                          <span className="min-w-0 flex-1 truncate text-xs font-bold leading-4 text-slate-800">
                            {booking.patientNameSnapshot || "Pasien"}
                          </span>
                          <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-bold leading-none ${statusStyle}`}>{statusLabel}</span>
                        </div>
                        <div className="mt-1 flex min-w-0 items-center gap-1.5 pl-[18px] text-[10px] leading-3.5 text-slate-500">
                          <Stethoscope className="h-3 w-3 shrink-0 text-slate-400" aria-hidden="true" />
                          <span className="truncate">{booking.doctorNameSnapshot || "Dokter"}</span>
                          {booking.plannedTreatments && booking.plannedTreatments.length > 0 && (
                            <>
                              <span className="shrink-0 text-slate-300">·</span>
                              <span className="min-w-0 truncate text-slate-400">{getPlannedTreatmentSummary(booking.plannedTreatments)}</span>
                            </>
                          )}
                        </div>
                        <div className="mt-1 flex min-w-0 items-center justify-between gap-2 pl-[18px] text-[9px] leading-3 text-slate-400">
                          <span className="truncate">{sourceLabel}</span>
                          <span className="shrink-0 truncate">{booking.branchNameSnapshot || ""}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
      /* Bookings List */
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
                  const dateStr = getOperationalDateString(b.bookingDateTime);
                  const timeSlot = getOperationalTimeString(b.bookingDateTime);
                  const isCompleted = b.status === BookingStatus.COMPLETED || completedBookingIds.has(b.id);
                  const isRescheduled = b.status === BookingStatus.RESCHEDULED;

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
                        {(() => {
                          const assignedDoc = doctorsList.find((d) => d.id === b.doctorId);
                          const docPhoto = assignedDoc?.photoUrl || assignedDoc?.avatarUrl || assignedDoc?.profileImage;
                          return (
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center justify-center shrink-0 border border-emerald-200 overflow-hidden shadow-2xs">
                                {docPhoto ? (
                                  <img
                                    src={docPhoto}
                                    alt={b.doctorNameSnapshot || "Dokter"}
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                      (e.target as HTMLElement).style.display = "none";
                                    }}
                                  />
                                ) : (
                                  <span>{(b.doctorNameSnapshot || "D").replace(/^(drg\.|dr\.)\s*/i, "").charAt(0) || "D"}</span>
                                )}
                              </div>
                              <div>
                                <div className="font-semibold text-slate-800 flex items-center gap-1">
                                  {b.doctorNameSnapshot || "drg. Praktek"}
                                </div>
                                <div className="text-slate-500 text-[11px] mt-0.5 flex items-center gap-1">
                                  <Building2 className="w-3 h-3 text-slate-400" />
                                  {b.branchNameSnapshot || "Lala Dentist"}
                                </div>
                                {b.scheduleVerified === false && (
                                  <div className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200" title="Jadwal tanggal ini belum dibuat, dokter belum dikonfirmasi">
                                    <AlertTriangle className="w-3 h-3 text-amber-500" />
                                    Dokter belum dikonfirmasi
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })()}
                      </td>

                      <td className="py-3.5 px-4 align-top max-w-xs">
                        {b.plannedTreatments && b.plannedTreatments.length > 0 && (
                          <p className="text-emerald-800 text-xs font-semibold mb-1">
                            Rencana: {getPlannedTreatmentSummary(b.plannedTreatments)} · {getPlannedTreatmentDurationMinutes(b.plannedTreatments)} menit
                          </p>
                        )}
                        <p className="text-slate-600 text-xs italic bg-slate-50 p-2 rounded border border-slate-100 line-clamp-2">
                          {b.notes || b.complaint || "Keluhan belum dicatat"}
                        </p>
                      </td>

                      <td className="py-3.5 px-4 align-top">
                        {isCompleted && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                            <CheckCircle2 className="w-3.5 h-3.5 text-blue-500" />
                            Selesai Dilayani
                          </span>
                        )}
                        {!isCompleted && b.status === BookingStatus.CONFIRMED && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                            Confirmed
                          </span>
                        )}
                        {!isCompleted && b.status === BookingStatus.PENDING && (
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
                        {isRescheduled && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-violet-50 text-violet-700 border border-violet-200">
                            <RefreshCw className="w-3.5 h-3.5" />
                            Dijadwalkan ulang
                          </span>
                        )}
                        <div className="mt-2">
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold border bg-slate-100 text-slate-700 border-slate-200">
                            {(b.source || b.channel) === BookingSource.PATIENT_PORTAL || (b.source || b.channel) === BookingSource.ANDROID ? "Online" : (b.source || b.channel) === BookingSource.WHATSAPP ? "WhatsApp" : (b.source || b.channel) === BookingSource.WALK_IN ? "Walk-In" : "Front Desk"}
                          </span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 align-top text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {isCompleted ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-500 bg-slate-100 rounded-lg border border-slate-200">
                              <CheckCircle2 className="w-3.5 h-3.5 text-blue-500" />
                              Sudah Selesai
                            </span>
                          ) : b.status === BookingStatus.CANCELLED || isRescheduled ? (
                            <span className="text-[11px] font-medium text-rose-400 bg-rose-50/50 px-2.5 py-1 rounded-lg border border-rose-100">
                              {isRescheduled ? "Jadwal lama" : "Dibatalkan"}
                            </span>
                          ) : (
                            <>
                              <button
                                onClick={() => handleOpenCheckInModal(b)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold rounded-lg text-xs transition-colors border border-emerald-200 cursor-pointer"
                                title="Lanjut ke Check-In Pasien untuk memasukkan booking ke antrean"
                                id={`btn-checkin-${b.id}`}
                              >
                                <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                                Check-In
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
      )}

      {/* Create Booking Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in" id="modal-create-booking">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 border border-slate-100 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-emerald-600" />
                Buat Jadwal Pasien
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
                  1. Cari Pasien
                </label>
                {selectedPatient ? (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
                    <div>
                      <div className="font-bold text-emerald-900 text-xs">
                        {selectedPatient.fullName}
                      </div>
                      <div className="text-[11px] text-emerald-700">
                        {canViewPatientPhoneNumber && selectedPatient.phone ? `${selectedPatient.phone} — ` : ""}
                        {getPatientMedicalRecordNumber(selectedPatient, formBranchId) || "No RM"}
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
                      placeholder={canViewPatientPhoneNumber ? "Ketik nama, HP, atau No RM pasien..." : "Ketik nama atau No RM pasien..."}
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
                            {canViewPatientPhoneNumber && p.phone && <span className="text-slate-500 ml-2">({p.phone})</span>}
                          </div>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {getPatientMedicalRecordNumber(p, formBranchId) ||
                              p.internalPatientCode ||
                              "No. RM belum tersedia"}
                          </span>
                        </div>
                      ))}
                      {searchedPatients.length === 0 && patientSearch.trim() && (
                        <p className="p-3 text-[11px] text-slate-500">Pasien tidak ditemukan. Tambahkan pasien baru untuk melanjutkan.</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setShowNewPatientForm((open) => !open);
                        setFormError(null);
                      }}
                      className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800"
                    >
                      {showNewPatientForm ? "− Tutup form pasien baru" : "+ Pasien Baru"}
                    </button>
                    {showNewPatientForm && (
                      <div className="p-3 rounded-lg border border-emerald-200 bg-emerald-50/60 space-y-3">
                        <div>
                          <p className="text-[11px] font-bold text-emerald-900">Identitas utama pasien</p>
                          <p className="mt-0.5 text-[10px] text-slate-500">Data kontak dan sosial bersifat opsional.</p>
                        </div>
                        <input
                          type="text"
                          value={newPatientForm.fullName}
                          onChange={(event) => setNewPatientForm((form) => ({ ...form, fullName: event.target.value }))}
                          placeholder="Nama lengkap sesuai KTP/KK *"
                          className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2.5"
                          required
                        />
                        <div>
                          <input
                            type="text"
                            value={newPatientForm.medicalRecordNumber}
                            onChange={(event) => setNewPatientForm((form) => ({ ...form, medicalRecordNumber: event.target.value }))}
                            placeholder="No. RM pasien lama (opsional)"
                            aria-label="Nomor rekam medis pasien"
                            maxLength={50}
                            className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2.5"
                          />
                          <p className="mt-1 text-[10px] text-slate-500">Isi jika pasien sudah memiliki No. RM; jika kosong, sistem akan mengaturnya saat check-in.</p>
                        </div>
                        <div className="grid grid-cols-[110px_1fr] gap-2">
                          <select
                            value={newPatientForm.identityDocumentType}
                            onChange={(event) => setNewPatientForm((form) => ({
                              ...form,
                              identityDocumentType: event.target.value as "NIK" | "PASSPORT",
                              identityDocumentNumber: ""
                            }))}
                            aria-label="Jenis identitas pasien"
                            className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2.5"
                          >
                            <option value="NIK">NIK</option>
                            <option value="PASSPORT">Paspor</option>
                          </select>
                          <input
                            type="text"
                            inputMode={newPatientForm.identityDocumentType === "NIK" ? "numeric" : "text"}
                            maxLength={newPatientForm.identityDocumentType === "NIK" ? 16 : 20}
                            value={newPatientForm.identityDocumentNumber}
                            onChange={(event) => setNewPatientForm((form) => ({ ...form, identityDocumentNumber: event.target.value.replace(/\s/g, "") }))}
                            placeholder={newPatientForm.identityDocumentType === "NIK" ? "16 digit NIK *" : "Nomor paspor *"}
                            className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2.5"
                            required
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="text"
                            value={newPatientForm.placeOfBirth}
                            onChange={(event) => setNewPatientForm((form) => ({ ...form, placeOfBirth: event.target.value }))}
                            placeholder="Tempat lahir *"
                            className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2.5"
                            required
                          />
                          <input
                            type="date"
                            value={newPatientForm.dateOfBirth}
                            onChange={(event) => setNewPatientForm((form) => ({ ...form, dateOfBirth: event.target.value }))}
                            aria-label="Tanggal lahir pasien"
                            max={getTodayDateString()}
                            className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2.5"
                            required
                          />
                        </div>
                        <select
                          value={newPatientForm.gender}
                          onChange={(event) => setNewPatientForm((form) => ({ ...form, gender: event.target.value as "L" | "P" | "" }))}
                          aria-label="Jenis kelamin pasien"
                          required
                          className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2.5"
                        >
                          <option value="">Pilih jenis kelamin *</option>
                          <option value="L">Laki-laki</option>
                          <option value="P">Perempuan</option>
                        </select>
                        <div className="border-t border-emerald-200 pt-2">
                          <p className="text-[11px] font-bold text-slate-700">Data kontak & sosial <span className="font-normal text-slate-500">(opsional)</span></p>
                        </div>
                        {canViewPatientPhoneNumber && <input
                          type="tel"
                          value={newPatientForm.phone}
                          onChange={(event) => setNewPatientForm((form) => ({ ...form, phone: event.target.value }))}
                          placeholder="Nomor HP/WhatsApp"
                          className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2.5"
                        />}
                        <input
                          type="text"
                          value={newPatientForm.address}
                          onChange={(event) => setNewPatientForm((form) => ({ ...form, address: event.target.value }))}
                          placeholder="Alamat lengkap"
                          className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2.5"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="text"
                            value={newPatientForm.occupation}
                            onChange={(event) => setNewPatientForm((form) => ({ ...form, occupation: event.target.value }))}
                            placeholder="Pekerjaan"
                            className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2.5"
                          />
                          <select
                            value={newPatientForm.religion}
                            onChange={(event) => setNewPatientForm((form) => ({ ...form, religion: event.target.value }))}
                            aria-label="Agama atau kepercayaan pasien"
                            className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2.5"
                          >
                            <option value="">Agama / kepercayaan</option>
                            <option value="Islam">Islam</option>
                            <option value="Kristen">Kristen</option>
                            <option value="Katolik">Katolik</option>
                            <option value="Hindu">Hindu</option>
                            <option value="Buddha">Buddha</option>
                            <option value="Konghucu">Konghucu</option>
                            <option value="Kepercayaan lainnya">Kepercayaan lainnya</option>
                          </select>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <select
                            value={newPatientForm.maritalStatus}
                            onChange={(event) => setNewPatientForm((form) => ({ ...form, maritalStatus: event.target.value }))}
                            aria-label="Status pernikahan pasien"
                            className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2.5"
                          >
                            <option value="">Status pernikahan</option>
                            <option value="Belum menikah">Belum menikah</option>
                            <option value="Menikah">Menikah</option>
                            <option value="Cerai hidup">Cerai hidup</option>
                            <option value="Cerai mati">Cerai mati</option>
                          </select>
                          <select
                            value={newPatientForm.education}
                            onChange={(event) => setNewPatientForm((form) => ({ ...form, education: event.target.value }))}
                            aria-label="Pendidikan terakhir pasien"
                            className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2.5"
                          >
                            <option value="">Pendidikan terakhir</option>
                            <option value="Tidak sekolah">Tidak sekolah</option>
                            <option value="SD/sederajat">SD/sederajat</option>
                            <option value="SMP/sederajat">SMP/sederajat</option>
                            <option value="SMA/sederajat">SMA/sederajat</option>
                            <option value="Diploma">Diploma</option>
                            <option value="S1">S1</option>
                            <option value="S2">S2</option>
                            <option value="S3">S3</option>
                            <option value="Lainnya">Lainnya</option>
                          </select>
                        </div>
                        <button
                          type="button"
                          onClick={handleCreatePatientForSchedule}
                          disabled={isCreatingPatient || !newPatientForm.fullName.trim() || !newPatientForm.identityDocumentNumber.trim() || !newPatientForm.placeOfBirth.trim() || !newPatientForm.dateOfBirth || !newPatientForm.gender}
                          className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-[11px] font-bold disabled:opacity-50"
                        >
                          {isCreatingPatient ? "Menyimpan pasien..." : "Simpan & Pilih Pasien"}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Sumber Jadwal</label>
                <select
                  value={bookingSource}
                  onChange={(event) => setBookingSource(event.target.value as BookingSource)}
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg p-2.5 font-medium"
                >
                  <option value={BookingSource.PATIENT_PORTAL}>Online</option>
                  <option value={BookingSource.WHATSAPP}>WhatsApp</option>
                  <option value={BookingSource.FRONT_DESK}>Front Desk</option>
                  <option value={BookingSource.WALK_IN}>Walk-In</option>
                </select>
                {bookingSource === BookingSource.WALK_IN && (
                  <p className="mt-1 text-[10px] text-slate-500">Walk-In tetap dijadwalkan pada slot dokter yang tersedia. Check-In dilakukan saat pasien siap atau waktunya mendekat.</p>
                )}
              </div>

              <div>
                <label htmlFor="search-booking-referring-staff" className="block text-xs font-bold text-slate-700 mb-1">
                  Referral (opsional)
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    id="search-booking-referring-staff"
                    type="text"
                    value={selectedReferringStaff?.fullName || referringStaffSearch}
                    onChange={(event) => {
                      setFormReferringStaffId("");
                      setReferringStaffSearch(event.target.value);
                    }}
                    placeholder="Cari nama admin/asisten dari semua cabang"
                    autoComplete="off"
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-20 text-xs font-medium"
                  />
                  {formReferringStaffId && (
                    <button
                      type="button"
                      onClick={() => {
                        setFormReferringStaffId("");
                        setReferringStaffSearch("");
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-[10px] font-semibold text-slate-500 hover:bg-slate-200"
                    >
                      Hapus pilihan
                    </button>
                  )}
                  {availableReferringStaff.length > 0 && (
                    <div className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
                      {availableReferringStaff.map((employee) => (
                        <button
                          key={employee.id}
                          type="button"
                          onClick={() => {
                            setFormReferringStaffId(employee.id);
                            setReferringStaffSearch(employee.fullName);
                          }}
                          className="flex w-full items-start justify-between gap-3 rounded-md px-2.5 py-2 text-left hover:bg-violet-50"
                        >
                          <span className="text-xs font-semibold text-slate-800">{employee.fullName}</span>
                          <span className="shrink-0 text-[10px] text-slate-500">
                            {employee.position === StaffPosition.BRANCH_ADMIN ? "Admin" : "Asisten"}
                            {" · "}
                            {branches.find((branch) => isBranchMatch(branch.id, employee.branchId, branches))?.name || (employee.branchId ? employee.branchId : "Cabang belum ditetapkan")}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {selectedReferringStaff && (
                  <p className="mt-1 text-[10px] font-medium text-violet-700">
                    {selectedReferringStaff.position === StaffPosition.BRANCH_ADMIN ? "Admin" : "Asisten"}
                    {" · "}
                    {branches.find((branch) => isBranchMatch(branch.id, selectedReferringStaff.branchId, branches))?.name || (selectedReferringStaff.branchId ? selectedReferringStaff.branchId : "Cabang belum ditetapkan")}
                  </p>
                )}
                {referralStaffLoading && <p className="mt-1 text-[10px] text-slate-500">Memuat daftar referral semua cabang...</p>}
                {referralStaffError && <p role="alert" className="mt-1 text-[10px] text-rose-700">{referralStaffError}</p>}
                {!referralStaffLoading && referringStaffSearch.trim() && !formReferringStaffId && availableReferringStaff.length === 0 && (
                  <p className="mt-1 text-[10px] text-slate-500">Tidak ada admin atau asisten aktif yang cocok.</p>
                )}
                <p className="mt-1 text-[10px] text-slate-500">
                  Cari admin atau asisten aktif dari cabang mana pun. Insentif Rp3.000 dicatat satu kali setelah tindakan selesai dan invoice lunas.
                </p>
              </div>

              {/* Step 2: Branch & Doctor */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    2. Cabang Klinik:
                  </label>
                  <select
                    value={(() => {
                      const matched = branches.find((b) => isBranchMatch(b.id, formBranchId, branches));
                      return matched ? matched.id : formBranchId;
                    })()}
                    onChange={(e) => {
                      setFormBranchId(e.target.value);
                    }}
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
                    {availableDoctors.length === 0 ? (
                      <option value="" disabled>
                        Tidak ada dokter yang bertugas di tanggal/cabang ini
                      </option>
                    ) : (
                      <>
                        <option value="">-- Pilih Dokter --</option>
                        {availableDoctors.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name} ({d.specialization})
                          </option>
                        ))}
                      </>
                    )}
                  </select>
                  {availableDoctors.length === 0 && (
                    <div className="mt-1.5 p-2 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-800 flex items-center gap-1.5" id="alert-schedule-unconfirmed">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span>Tidak ada dokter yang bertugas di tanggal/cabang ini</span>
                    </div>
                  )}
                  {(() => {
                    const selDoc = doctorsList.find((d) => d.id === formDoctorId);
                    if (!selDoc) return null;
                    const photo = selDoc.photoUrl || selDoc.avatarUrl || selDoc.profileImage;
                    return (
                      <div className="mt-2 flex items-center gap-2 p-1.5 bg-slate-50 rounded-lg border border-slate-200 text-xs">
                        <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px] flex items-center justify-center shrink-0 border border-emerald-200 overflow-hidden">
                          {photo ? (
                            <img
                              src={photo}
                              alt={selDoc.name}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = "none";
                              }}
                            />
                          ) : (
                            <span>{selDoc.name.replace(/^(drg\.|dr\.)\s*/i, "").charAt(0) || "D"}</span>
                          )}
                        </div>
                        <div className="truncate">
                          <span className="font-semibold text-slate-800">{selDoc.name}</span>
                          <span className="text-[10px] text-slate-400 block truncate">{selDoc.specialization}</span>
                        </div>
                      </div>
                    );
                  })()}
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
                    {availableTimeSlots.map((slot) => (
                      <option key={slot} value={slot}>
                        {slot} WIB
                      </option>
                    ))}
                    {availableTimeSlots.length === 0 && (
                      <option value="" disabled>Tidak ada slot kosong pada jadwal dokter ini</option>
                    )}
                  </select>
                  {formDoctorId && availableTimeSlots.length === 0 && (
                    <p className="mt-1 text-[10px] text-amber-700">Semua slot dokter ini sudah terisi. Pilih tanggal atau dokter lain untuk melihat slot yang tersedia.</p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  6. Rencana Tindakan untuk Estimasi Antrean:
                </label>
                <TreatmentPicker
                  multiSelect
                  selectedServiceIds={plannedServices.map((service) => service.id)}
                  onSelectServices={setPlannedServices}
                  branchId={formBranchId}
                />
                <p className="text-[11px] text-emerald-800 font-semibold mt-2">
                  Total estimasi rencana: {getPlannedTreatmentDurationMinutes(snapshotPlannedTreatments(plannedServices), 0)} menit
                  {plannedServices.length === 0 ? " (belum dipilih; antrean memakai default 30 menit)" : ""}
                </p>
              </div>

              {/* Step 5: Complaint / Reason */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  7. Keluhan / Keperluan Berobat:
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
                  Pasien menyampaikan keluhan. Rencana tindakan dicatat Admin Cabang untuk estimasi; keputusan klinis tetap pada Dokter.
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
                  disabled={isSubmitting || isCreatingPatient || !selectedPatient || !formTimeSlot || availableTimeSlots.length === 0}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-colors shadow-sm disabled:opacity-50"
                  id="btn-submit-booking"
                >
                  {isSubmitting ? "Menyimpan..." : "Simpan Jadwal"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedBooking && (
        <div className="fixed inset-0 z-[150] flex justify-end bg-slate-900/35 backdrop-blur-[2px]" onClick={() => setSelectedBooking(null)}>
          <aside
            className="flex h-full w-full max-w-[440px] flex-col border-l border-[#d9bf8f] bg-[#fcfbf8] shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-label="Detail jadwal pasien"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-[#d9bf8f]/70 bg-gradient-to-r from-[#916b1c] via-[#ebd4a8] via-[#e1b951] to-[#916b1c] px-5 py-4 shadow-sm">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/70 bg-white/90 text-base font-extrabold text-[#76591f] shadow-sm">
                  {(patientProfileForDetail?.fullName || patientProfileForDetail?.name || selectedBooking.patientNameSnapshot || "P").trim().charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#604718]">Detail Jadwal</p>
                  <h2 className="mt-0.5 truncate text-base font-extrabold text-[#35270f]">{patientProfileForDetail?.fullName || patientProfileForDetail?.name || selectedBooking.patientNameSnapshot || "Pasien"}</h2>
                  <p className="mt-1 flex items-center gap-1.5 text-[11px] font-semibold text-[#594725]">
                    <Calendar className="h-3.5 w-3.5 text-[#76591f]" />
                    {formatIndonesianDate(getOperationalDateString(selectedBooking.bookingDateTime))}
                    <span className="text-[#76591f]">·</span>
                    {getOperationalTimeString(selectedBooking.bookingDateTime)} WIB
                  </p>
                </div>
              </div>
              <button type="button" onClick={() => setSelectedBooking(null)} aria-label="Tutup detail" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/70 bg-white/85 text-slate-500 transition-colors hover:border-white hover:bg-white hover:text-[#76591f]">✕</button>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {rescheduleSuccess && (
                <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                  {rescheduleSuccess}
                </div>
              )}
              {bookingCheckInError && (
                <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  {bookingCheckInError}
                </div>
              )}
              {patientEditSuccess && (
                <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                  {patientEditSuccess}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${selectedBooking.status === BookingStatus.CANCELLED ? "bg-rose-100 text-rose-700" : selectedBooking.status === BookingStatus.RESCHEDULED ? "bg-violet-100 text-violet-700" : selectedBooking.status === BookingStatus.COMPLETED || completedBookingIds.has(selectedBooking.id) ? "bg-blue-100 text-blue-700" : checkedInBookingIds.has(selectedBooking.id) ? "bg-emerald-100 text-emerald-700" : selectedBooking.status === BookingStatus.CONFIRMED ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"}`}>
                  {selectedBooking.status === BookingStatus.CANCELLED ? "Dibatalkan" : selectedBooking.status === BookingStatus.RESCHEDULED ? "Dijadwalkan ulang" : selectedBooking.status === BookingStatus.COMPLETED || completedBookingIds.has(selectedBooking.id) ? "Selesai" : checkedInBookingIds.has(selectedBooking.id) ? "Sudah Check-In" : selectedBooking.status === BookingStatus.CONFIRMED ? "Dikonfirmasi" : "Terjadwal"}
                </span>
                <span className="px-2.5 py-1 rounded-full border border-slate-200 bg-white text-slate-600 text-[10px] font-bold">
                  {(selectedBooking.source || selectedBooking.channel) === BookingSource.PATIENT_PORTAL || (selectedBooking.source || selectedBooking.channel) === BookingSource.ANDROID ? "Online" : (selectedBooking.source || selectedBooking.channel) === BookingSource.WHATSAPP ? "WhatsApp" : (selectedBooking.source || selectedBooking.channel) === BookingSource.WALK_IN ? "Walk-In" : "Front Desk"}
                </span>
              </div>
              {selectedBooking.enRouteConfirmedAt && (
                <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                  Pasien mengonfirmasi sedang menuju klinik pada {formatIndonesianDate(getOperationalDateString(selectedBooking.enRouteConfirmedAt))} pukul {getOperationalTimeString(selectedBooking.enRouteConfirmedAt)} WIB.
                </div>
              )}
              {selectedBooking.lateCheckInRequestedAt && !checkedInBookingIds.has(selectedBooking.id) && (
                <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold leading-5 text-amber-900">
                  Pasien meminta konfirmasi check-in terlambat pada {formatIndonesianDate(getOperationalDateString(selectedBooking.lateCheckInRequestedAt))} pukul {getOperationalTimeString(selectedBooking.lateCheckInRequestedAt)} WIB. Booking tidak dibatalkan otomatis; hubungi pasien atau bantu proses check-in.
                </div>
              )}
              {selectedBooking.status === BookingStatus.CANCELLED && selectedBooking.cancellationReason && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                  <span className="font-bold">Alasan pembatalan check-in:</span> {selectedBooking.cancellationReason}
                </div>
              )}
              <section className="rounded-2xl border border-amber-200/80 bg-white p-3.5 shadow-sm shadow-amber-900/[0.03]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-xs font-extrabold text-slate-800">Data pasien</h3>
                    <p className="mt-0.5 text-[10px] text-slate-500">Identitas dan informasi kontak pasien.</p>
                  </div>
                  {!isPatientEditorOpen && (
                    <button
                      type="button"
                      onClick={handleOpenPatientEditor}
                      className="shrink-0 rounded-lg border border-amber-200 bg-amber-50/60 px-2.5 py-1.5 text-[10px] font-bold text-amber-800 transition-colors hover:bg-amber-100"
                    >
                      Edit data pasien
                    </button>
                  )}
                </div>
                {isPatientEditorOpen ? (
                  <form onSubmit={handleSavePatientProfile} className="mt-3 space-y-2.5">
                    {patientEditError && (
                      <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-2 text-[11px] text-rose-700">{patientEditError}</div>
                    )}
                    {isPatientLoading ? (
                      <p className="py-3 text-center text-xs text-slate-500">Memuat data pasien...</p>
                    ) : (
                      <>
                        {(currentUser?.role === UserRole.BRANCH_ADMIN || currentUser?.role === UserRole.SUPER_ADMIN) && (
                          <label className="block text-[10px] font-semibold text-slate-700">
                            Nomor Rekam Medis (No. RM)
                            <input
                              type="text"
                              value={patientEditDraft.medicalRecordNumber}
                              onChange={(event) => setPatientEditDraft((draft) => ({ ...draft, medicalRecordNumber: event.target.value }))}
                              placeholder="Isi No. RM pasien"
                              aria-label="Nomor Rekam Medis pasien"
                              maxLength={50}
                              readOnly={Boolean(patientEditInitialRM)}
                              className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2 text-xs read-only:bg-slate-100"
                            />
                            <span className="mt-1 block font-normal text-slate-500">
                              No. RM yang sudah terdaftar di cabang tidak dapat diganti.
                            </span>
                          </label>
                        )}
                        <input
                          type="text"
                          value={patientEditDraft.fullName}
                          onChange={(event) => setPatientEditDraft((draft) => ({ ...draft, fullName: event.target.value }))}
                          placeholder="Nama lengkap *"
                          aria-label="Nama lengkap pasien"
                          required
                          className="w-full rounded-lg border border-slate-200 bg-white p-2 text-xs"
                        />
                        <div className="grid grid-cols-[90px_1fr] gap-2">
                          <select
                            value={patientEditDraft.identityDocumentType}
                            onChange={(event) => setPatientEditDraft((draft) => ({
                              ...draft,
                              identityDocumentType: event.target.value as "NIK" | "PASSPORT",
                              identityDocumentNumber: ""
                            }))}
                            aria-label="Jenis identitas pasien"
                            className="w-full rounded-lg border border-slate-200 bg-white p-2 text-xs"
                          >
                            <option value="NIK">NIK</option>
                            <option value="PASSPORT">Paspor</option>
                          </select>
                          <input
                            type="text"
                            inputMode={patientEditDraft.identityDocumentType === "NIK" ? "numeric" : "text"}
                            maxLength={patientEditDraft.identityDocumentType === "NIK" ? 16 : 20}
                            value={patientEditDraft.identityDocumentNumber}
                            onChange={(event) => setPatientEditDraft((draft) => ({ ...draft, identityDocumentNumber: event.target.value.replace(/\s/g, "") }))}
                            placeholder={patientEditDraft.identityDocumentType === "NIK" ? "NIK 16 digit *" : "Nomor paspor *"}
                            aria-label="Nomor identitas pasien"
                            required
                            className="w-full rounded-lg border border-slate-200 bg-white p-2 text-xs"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="text"
                            value={patientEditDraft.placeOfBirth}
                            onChange={(event) => setPatientEditDraft((draft) => ({ ...draft, placeOfBirth: event.target.value }))}
                            placeholder="Tempat lahir *"
                            aria-label="Tempat lahir pasien"
                            required
                            className="w-full rounded-lg border border-slate-200 bg-white p-2 text-xs"
                          />
                          <input
                            type="date"
                            value={patientEditDraft.dateOfBirth}
                            onChange={(event) => setPatientEditDraft((draft) => ({ ...draft, dateOfBirth: event.target.value }))}
                            max={getTodayDateString()}
                            aria-label="Tanggal lahir pasien"
                            required
                            className="w-full rounded-lg border border-slate-200 bg-white p-2 text-xs"
                          />
                        </div>
                        <select
                          value={patientEditDraft.gender}
                          onChange={(event) => setPatientEditDraft((draft) => ({ ...draft, gender: event.target.value as "L" | "P" }))}
                          aria-label="Jenis kelamin pasien"
                          className="w-full rounded-lg border border-slate-200 bg-white p-2 text-xs"
                        >
                          <option value="L">Laki-laki</option>
                          <option value="P">Perempuan</option>
                        </select>
                        <div className="border-t border-emerald-200 pt-2">
                          <p className="text-[10px] font-bold text-slate-700">Data kontak & sosial (opsional)</p>
                        </div>
                        {canViewPatientPhoneNumber && <input
                          type="tel"
                          value={patientEditDraft.phone}
                          onChange={(event) => setPatientEditDraft((draft) => ({ ...draft, phone: event.target.value }))}
                          placeholder="Nomor HP/WhatsApp"
                          aria-label="Nomor telepon pasien"
                          className="w-full rounded-lg border border-slate-200 bg-white p-2 text-xs"
                        />}
                        <input
                          type="text"
                          value={patientEditDraft.address}
                          onChange={(event) => setPatientEditDraft((draft) => ({ ...draft, address: event.target.value }))}
                          placeholder="Alamat lengkap"
                          aria-label="Alamat pasien"
                          className="w-full rounded-lg border border-slate-200 bg-white p-2 text-xs"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="text"
                            value={patientEditDraft.occupation}
                            onChange={(event) => setPatientEditDraft((draft) => ({ ...draft, occupation: event.target.value }))}
                            placeholder="Pekerjaan"
                            aria-label="Pekerjaan pasien"
                            className="w-full rounded-lg border border-slate-200 bg-white p-2 text-xs"
                          />
                          <select
                            value={patientEditDraft.religion}
                            onChange={(event) => setPatientEditDraft((draft) => ({ ...draft, religion: event.target.value }))}
                            aria-label="Agama atau kepercayaan pasien"
                            className="w-full rounded-lg border border-slate-200 bg-white p-2 text-xs"
                          >
                            <option value="">Agama / kepercayaan</option>
                            <option value="Islam">Islam</option>
                            <option value="Kristen">Kristen</option>
                            <option value="Katolik">Katolik</option>
                            <option value="Hindu">Hindu</option>
                            <option value="Buddha">Buddha</option>
                            <option value="Konghucu">Konghucu</option>
                            <option value="Kepercayaan lainnya">Kepercayaan lainnya</option>
                          </select>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <select
                            value={patientEditDraft.maritalStatus}
                            onChange={(event) => setPatientEditDraft((draft) => ({ ...draft, maritalStatus: event.target.value }))}
                            aria-label="Status pernikahan pasien"
                            className="w-full rounded-lg border border-slate-200 bg-white p-2 text-xs"
                          >
                            <option value="">Status pernikahan</option>
                            <option value="Belum menikah">Belum menikah</option>
                            <option value="Menikah">Menikah</option>
                            <option value="Cerai hidup">Cerai hidup</option>
                            <option value="Cerai mati">Cerai mati</option>
                          </select>
                          <select
                            value={patientEditDraft.education}
                            onChange={(event) => setPatientEditDraft((draft) => ({ ...draft, education: event.target.value }))}
                            aria-label="Pendidikan terakhir pasien"
                            className="w-full rounded-lg border border-slate-200 bg-white p-2 text-xs"
                          >
                            <option value="">Pendidikan terakhir</option>
                            <option value="Tidak sekolah">Tidak sekolah</option>
                            <option value="SD/sederajat">SD/sederajat</option>
                            <option value="SMP/sederajat">SMP/sederajat</option>
                            <option value="SMA/sederajat">SMA/sederajat</option>
                            <option value="Diploma">Diploma</option>
                            <option value="S1">S1</option>
                            <option value="S2">S2</option>
                            <option value="S3">S3</option>
                            <option value="Lainnya">Lainnya</option>
                          </select>
                        </div>
                        <div className="flex justify-end gap-2 pt-1">
                          <button type="button" onClick={() => { setIsPatientEditorOpen(false); setPatientEditError(null); }} className="rounded-lg bg-slate-100 px-3 py-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-200">
                            Batal
                          </button>
                          <button type="submit" disabled={isPatientSaving} className="rounded-lg bg-emerald-600 px-3 py-2 text-[11px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
                            {isPatientSaving ? "Menyimpan..." : "Simpan data pasien"}
                          </button>
                        </div>
                      </>
                    )}
                  </form>
                ) : (
                  <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
                    <div><span className="block text-[9px] font-bold uppercase text-slate-400">No. RM</span><span className="text-slate-700">{patientProfileForDetail ? getPatientMedicalRecordNumber(patientProfileForDetail, selectedBooking?.branchId) || "Belum ada" : "Belum ada"}</span></div>
                    <div><span className="block text-[9px] font-bold uppercase text-slate-400">Identitas</span><span className="text-slate-700">{patientProfileForDetail?.identityDocumentType || "Belum diisi"}{patientProfileForDetail?.identityDocumentNumber ? ` ••••${patientProfileForDetail.identityDocumentNumber.slice(-4)}` : ""}</span></div>
                    <div><span className="block text-[9px] font-bold uppercase text-slate-400">Tempat, tanggal lahir</span><span className="text-slate-700">{patientProfileForDetail?.placeOfBirth || "Belum diisi"}{patientProfileForDetail?.dateOfBirth ? `, ${patientProfileForDetail.dateOfBirth}` : ""}</span></div>
                    <div><span className="block text-[9px] font-bold uppercase text-slate-400">Jenis kelamin</span><span className="text-slate-700">{patientProfileForDetail?.gender === "P" ? "Perempuan" : patientProfileForDetail?.gender === "L" ? "Laki-laki" : "Belum diisi"}</span></div>
                    {canViewPatientPhoneNumber && <div><span className="block text-[9px] font-bold uppercase text-slate-400">Telepon</span><span className="text-slate-700">{patientProfileForDetail?.phone || "Belum diisi"}</span></div>}
                    <div><span className="block text-[9px] font-bold uppercase text-slate-400">Alamat</span><span className="text-slate-700">{patientProfileForDetail?.address || "Belum diisi"}</span></div>
                    <div><span className="block text-[9px] font-bold uppercase text-slate-400">Pekerjaan</span><span className="text-slate-700">{patientProfileForDetail?.occupation || "Belum diisi"}</span></div>
                    <div><span className="block text-[9px] font-bold uppercase text-slate-400">Agama / kepercayaan</span><span className="text-slate-700">{patientProfileForDetail?.religion || "Belum diisi"}</span></div>
                    <div><span className="block text-[9px] font-bold uppercase text-slate-400">Status pernikahan</span><span className="text-slate-700">{patientProfileForDetail?.maritalStatus || "Belum diisi"}</span></div>
                    <div><span className="block text-[9px] font-bold uppercase text-slate-400">Pendidikan</span><span className="text-slate-700">{patientProfileForDetail?.education || "Belum diisi"}</span></div>
                  </div>
                )}
              </section>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm shadow-slate-900/[0.02]">
                  <span className="block text-[9px] font-bold uppercase tracking-wide text-slate-400">Dokter</span>
                  <span className="mt-1 block truncate text-xs font-bold text-slate-800">{selectedBooking.doctorNameSnapshot || "Dokter"}</span>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm shadow-slate-900/[0.02]">
                  <span className="block text-[9px] font-bold uppercase tracking-wide text-slate-400">Cabang</span>
                  <span className="mt-1 block truncate text-xs font-bold text-slate-800">{selectedBooking.branchNameSnapshot || "Klinik"}</span>
                </div>
              </div>
              <section className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm shadow-slate-900/[0.02]">
                <h3 className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Keluhan / Catatan</h3>
                <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed text-slate-700">{selectedBooking.notes || selectedBooking.complaint || "Belum dicatat"}</p>
              </section>
              {selectedBooking.referringStaffId && (
                <section className="rounded-2xl border border-violet-200 bg-violet-50/60 p-3.5">
                  <h3 className="text-[10px] font-bold uppercase tracking-wide text-violet-700">Referral</h3>
                  <p className="mt-1.5 text-xs font-semibold text-slate-700">
                    {referralStaffOptions.find((employee) => employee.id === selectedBooking.referringStaffId)?.fullName
                      || staff.find((employee) => employee.id === selectedBooking.referringStaffId)?.fullName
                      || "Staf tidak ditemukan"}
                  </p>
                  <p className="mt-0.5 text-[10px] text-slate-500">
                    {(() => {
                      const referralStaff = referralStaffOptions.find((employee) => employee.id === selectedBooking.referringStaffId);
                      return referralStaff
                        ? branches.find((branch) => isBranchMatch(branch.id, referralStaff.branchId, branches))?.name || (referralStaff.branchId || "Cabang belum ditetapkan")
                        : "";
                    })()}
                  </p>
                </section>
              )}
              {selectedBooking.plannedTreatments && selectedBooking.plannedTreatments.length > 0 && (
                <section className="rounded-2xl border border-amber-200/80 bg-amber-50/50 p-3.5">
                  <h3 className="text-[10px] font-bold uppercase tracking-wide text-amber-800">Rencana tindakan · Estimasi</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-700">{getPlannedTreatmentSummary(selectedBooking.plannedTreatments)} · {getPlannedTreatmentDurationMinutes(selectedBooking.plannedTreatments)} menit</p>
                </section>
              )}
              {selectedBooking.rescheduledFromBookingId && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3.5 text-xs">
                  <p className="font-bold text-amber-900">Jadwal pengganti</p>
                  <p className="mt-1 text-slate-700">
                    Menggantikan jadwal {(() => {
                      const previousBooking = bookings.find((booking) => booking.id === selectedBooking.rescheduledFromBookingId);
                      return previousBooking
                        ? `${formatIndonesianDate(getOperationalDateString(previousBooking.bookingDateTime))} pukul ${getOperationalTimeString(previousBooking.bookingDateTime)}`
                        : "sebelumnya";
                    })()}.
                  </p>
                  {selectedBooking.rescheduleReason && <p className="mt-1 text-slate-600">Alasan: {selectedBooking.rescheduleReason}</p>}
                </div>
              )}
              {selectedBooking.status === BookingStatus.RESCHEDULED && (() => {
                const replacement = bookings.find((booking) => booking.rescheduledFromBookingId === selectedBooking.id);
                return replacement ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3.5 text-xs">
                    <p className="font-bold text-amber-900">Jadwal pengganti</p>
                    <p className="mt-1 text-slate-700">
                      {formatIndonesianDate(getOperationalDateString(replacement.bookingDateTime))} pukul {getOperationalTimeString(replacement.bookingDateTime)} · {replacement.doctorNameSnapshot || "Dokter"}
                    </p>
                    {replacement.rescheduleReason && <p className="mt-1 text-slate-600">Alasan: {replacement.rescheduleReason}</p>}
                  </div>
                ) : null;
              })()}
            </div>
            {(selectedBooking.status === BookingStatus.PENDING || selectedBooking.status === BookingStatus.CONFIRMED) &&
              !checkedInBookingIds.has(selectedBooking.id) &&
              !completedBookingIds.has(selectedBooking.id) && (
                <div className="space-y-2.5 border-t border-[#e7d8b4] bg-white p-4 shadow-[0_-8px_24px_-20px_rgba(120,85,25,0.24)]">
                  <button
                    type="button"
                    onClick={() => handleOpenReschedule(selectedBooking)}
                    className="group flex min-h-[52px] w-full items-center gap-3 rounded-xl border border-[#d8bd7d] bg-gradient-to-r from-[#fff8e8] via-[#f3e4bd] to-[#fff8e8] px-3.5 py-2.5 text-left shadow-sm shadow-amber-900/[0.06] transition-all hover:border-[#c5a059] hover:from-[#f8edcf] hover:via-[#ead39b] hover:to-[#f8edcf] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c5a059] focus-visible:ring-offset-2 active:from-[#f0dfb4] active:via-[#e4cc8e] active:to-[#f0dfb4]"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#d8bd7d] bg-white/80 text-[#80602a] shadow-sm">
                      <RefreshCw className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-extrabold leading-5 text-[#594217]">Jadwal Ulang</span>
                      <span className="block text-[10px] font-medium leading-4 text-[#75684f]">Pilih waktu kunjungan yang baru</span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-[#80602a] transition-transform group-hover:translate-x-0.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBookingToCancel(selectedBooking);
                      setSelectedBooking(null);
                    }}
                    className="group flex min-h-[52px] w-full items-center gap-3 rounded-xl border border-rose-200 bg-gradient-to-r from-rose-50 via-rose-100 to-rose-50 px-3.5 py-2.5 text-left shadow-sm shadow-rose-900/[0.05] transition-all hover:border-rose-300 hover:from-rose-100 hover:via-rose-200 hover:to-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-2 active:from-rose-200 active:via-rose-200 active:to-rose-200"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-rose-200 bg-white/75 text-rose-700 shadow-sm">
                      <XCircle className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-extrabold leading-5 text-rose-900">Batalkan Jadwal</span>
                      <span className="block text-[10px] font-medium leading-4 text-rose-800/75">Batalkan kunjungan pasien ini</span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-rose-600 transition-transform group-hover:translate-x-0.5 group-hover:text-rose-800" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleOpenCheckInModal(selectedBooking);
                    }}
                    disabled={isCheckInSubmitting}
                    className="flex min-h-[76px] w-full items-center justify-center gap-3 rounded-2xl border border-[#916b1c]/40 bg-gradient-to-r from-[#916b1c] via-[#ebd4a8] via-[#e1b951] to-[#916b1c] px-4 py-5 text-base font-extrabold text-[#493610] shadow-md shadow-[#916b1c]/20 transition-all hover:brightness-105 hover:shadow-lg hover:shadow-[#916b1c]/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c5a059] focus-visible:ring-offset-2 active:brightness-95 disabled:cursor-wait disabled:opacity-70"
                  >
                    {isCheckInSubmitting
                      ? <RefreshCw className="h-5 w-5 shrink-0 animate-spin" />
                      : <UserCheck className="h-7 w-7 shrink-0" />}
                    <span>{isCheckInSubmitting ? "Memproses Check-In..." : "Check-In Pasien"}</span>
                  </button>
                </div>
              )}
            {(selectedBooking.status === BookingStatus.PENDING || selectedBooking.status === BookingStatus.CONFIRMED) &&
              (checkedInBookingIds.has(selectedBooking.id) || completedBookingIds.has(selectedBooking.id)) && (
                <div className="border-t border-amber-100 bg-white p-4">
                  <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    {completedBookingIds.has(selectedBooking.id)
                      ? "Jadwal ini sudah selesai dilayani, jadi tidak dapat dijadwalkan ulang."
                      : "Pasien sudah Check-In, jadi jadwal ini tidak dapat dijadwalkan ulang."}
                  </p>
                  {checkedInBookingIds.has(selectedBooking.id) &&
                    !completedBookingIds.has(selectedBooking.id) &&
                    getOperationalDateString(selectedBooking.bookingDateTime) >= getTodayDateString() && (() => {
                      const cancellationBlockReason = getCheckInCancellationBlockReason(
                        selectedBooking,
                        visits,
                        queueItems
                      );
                      return (
                        <button
                          type="button"
                          disabled={Boolean(cancellationBlockReason)}
                          onClick={() => {
                            setCheckInCancellationError(null);
                            setCheckInCancellationReason("Check-in tidak sengaja; pasien belum datang.");
                            setBookingToCancelCheckIn(selectedBooking);
                          }}
                          className="mt-3 w-full rounded-xl border border-rose-200 bg-rose-600 px-4 py-3 text-left text-white shadow-sm transition hover:bg-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 disabled:shadow-none"
                        >
                          <span className="block text-xs font-bold">Batalkan Check-In &amp; Janji</span>
                          <span className={`mt-1 block text-[10px] leading-relaxed ${cancellationBlockReason ? "text-slate-600" : "text-rose-50"}`}>
                            {cancellationBlockReason || "Batalkan antrean, kunjungan, dan janji secara bersamaan. Riwayat tetap tersimpan."}
                          </span>
                        </button>
                      );
                    })()}
                  {checkedInBookingIds.has(selectedBooking.id) &&
                    !completedBookingIds.has(selectedBooking.id) &&
                    getOperationalDateString(selectedBooking.bookingDateTime) < getTodayDateString() && (() => {
                      const closeBlockReason = getStaleBookingCloseBlockReason(selectedBooking);
                      return (
                    <button
                      type="button"
                      disabled={Boolean(closeBlockReason)}
                      onClick={() => {
                        setBookingCloseError(null);
                        setBookingToClose(selectedBooking);
                      }}
                      className="mt-3 w-full rounded-xl border border-rose-200 bg-rose-600 px-4 py-3 text-left text-white shadow-sm transition hover:bg-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 disabled:shadow-none"
                    >
                      <span className="block text-xs font-bold">Batalkan Jadwal Tertinggal</span>
                      <span className={`mt-1 block text-[10px] leading-relaxed ${closeBlockReason ? "text-slate-600" : "text-rose-50"}`}>
                        {closeBlockReason || "Batalkan booking dan antrean aktif terkait; profil serta riwayat pasien tetap disimpan."}
                      </span>
                    </button>
                      );
                    })()}
                </div>
              )}
            {bookingCloseFeedback?.bookingId === selectedBooking.id && (
              <div role="status" className="border-t border-emerald-100 bg-white p-4">
                <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                  {bookingCloseFeedback.message}
                </p>
              </div>
            )}
          </aside>
        </div>
      )}

      {isRescheduleOpen && selectedBooking && (
        <div
          className="fixed inset-0 z-[190] bg-slate-900/50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Jadwalkan ulang pasien"
          onClick={() => !isRescheduling && setIsRescheduleOpen(false)}
        >
          <form
            onSubmit={handleSaveReschedule}
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden"
          >
            <header className="p-5 border-b border-slate-200">
              <h2 className="text-lg font-extrabold text-slate-900">Jadwal Ulang</h2>
              <p className="mt-1 text-xs text-slate-500">
                Jadwal lama pasien {selectedBooking.patientNameSnapshot || "Pasien"} akan disimpan sebagai riwayat.
              </p>
            </header>
            <div className="p-5 space-y-4">
              {rescheduleError && (
                <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  {rescheduleError}
                </div>
              )}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Cabang</label>
                <div className="w-full rounded-lg bg-slate-100 border border-slate-200 px-3 py-2.5 text-sm text-slate-600">
                  {selectedBooking.branchNameSnapshot || "Cabang pasien (tetap)"}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="reschedule-date" className="block text-xs font-bold text-slate-700 mb-1">Tanggal baru</label>
                  <input
                    id="reschedule-date"
                    type="date"
                    required
                    value={rescheduleDate}
                    onChange={(event) => {
                      setRescheduleDate(event.target.value);
                      setRescheduleDoctorId("");
                      setRescheduleTimeSlot("");
                    }}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="reschedule-doctor" className="block text-xs font-bold text-slate-700 mb-1">Dokter</label>
                  <select
                    id="reschedule-doctor"
                    required
                    value={rescheduleDoctorId}
                    onChange={(event) => {
                      setRescheduleDoctorId(event.target.value);
                      setRescheduleTimeSlot("");
                    }}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"
                  >
                    <option value="">Pilih dokter</option>
                    {rescheduleDoctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label htmlFor="reschedule-slot" className="block text-xs font-bold text-slate-700 mb-1">Slot waktu tersedia</label>
                <select
                  id="reschedule-slot"
                  required
                  value={rescheduleTimeSlot}
                  onChange={(event) => setRescheduleTimeSlot(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"
                >
                  <option value="">Pilih slot waktu</option>
                  {rescheduleTimeSlots.map((slot) => <option key={slot} value={slot}>{slot} WIB</option>)}
                </select>
                {rescheduleDate && rescheduleSchedules.length === 0 && (
                  <p className="mt-1 text-[11px] text-amber-700">Tidak ada jadwal dokter aktif di cabang ini pada tanggal tersebut.</p>
                )}
                {rescheduleDoctorId && rescheduleTimeSlots.length === 0 && rescheduleSchedules.length > 0 && (
                  <p className="mt-1 text-[11px] text-amber-700">Tidak ada slot kosong untuk durasi tindakan ini. Pilih tanggal atau dokter lain.</p>
                )}
              </div>
              <div>
                <label htmlFor="reschedule-reason" className="block text-xs font-bold text-slate-700 mb-1">Alasan (opsional)</label>
                <textarea
                  id="reschedule-reason"
                  rows={2}
                  maxLength={500}
                  value={rescheduleReason}
                  onChange={(event) => setRescheduleReason(event.target.value)}
                  placeholder="Contoh: pasien meminta perubahan jadwal"
                  className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"
                />
              </div>
            </div>
            <footer className="flex justify-end gap-2 p-4 bg-slate-50 border-t border-slate-200">
              <button
                type="button"
                disabled={isRescheduling}
                onClick={() => setIsRescheduleOpen(false)}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={isRescheduling || !rescheduleTimeSlot || rescheduleTimeSlots.length === 0}
                className="rounded-lg bg-violet-600 px-4 py-2 text-xs font-bold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isRescheduling ? "Menyimpan..." : "Simpan Jadwal Baru"}
              </button>
            </footer>
          </form>
        </div>
      )}

      {/* Check-in Modal */}
      {bookingToClose && (
        <div
          className="fixed inset-0 z-[210] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="close-stale-booking-title"
          onClick={() => !isClosingBooking && setBookingToClose(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-100 bg-white p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            {(() => {
              const linkedVisitIds = new Set(
                visits.filter((visit) => visit.bookingId === bookingToClose.id).map((visit) => visit.id)
              );
              const hasInConsultationQueue = queueItems.some((item) =>
                (item.bookingId === bookingToClose.id || linkedVisitIds.has(item.visitId)) &&
                item.status === QueueStatus.IN_CONSULTATION
              );
              return (
                <>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-600">
              <XCircle className="h-6 w-6" />
            </div>
            <h3 id="close-stale-booking-title" className="text-center text-base font-bold text-slate-900">
              {hasInConsultationQueue ? "Batalkan Walau Berstatus Konsultasi?" : "Tutup Booking Tertinggal?"}
            </h3>
            <p className="mt-2 text-center text-xs leading-relaxed text-slate-600">
              Booking <strong>{bookingToClose.patientNameSnapshot || "Pasien"}</strong> tanggal{" "}
              <strong>{formatIndonesianDate(getOperationalDateString(bookingToClose.bookingDateTime))}</strong> akan
              dibatalkan bersama antrean dan kunjungan aktif terkait. Data profil dan riwayat tetap disimpan.
            </p>
            {hasInConsultationQueue && (
              <p role="alert" className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
                Perhatian: status antrean menunjukkan pasien sedang dalam konsultasi. Gunakan pembatalan paksa ini hanya jika status tersebut tertinggal dan pasien sudah tidak sedang dilayani.
              </p>
            )}
            {bookingCloseError && (
              <p role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                {bookingCloseError}
              </p>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                disabled={isClosingBooking}
                onClick={() => setBookingToClose(null)}
                className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50"
              >
                Kembali
              </button>
              <button
                type="button"
                disabled={isClosingBooking}
                onClick={handleCloseStaleBooking}
                className="flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-rose-700 disabled:cursor-wait disabled:opacity-50"
              >
                {isClosingBooking ? "Membatalkan..." : hasInConsultationQueue ? "Ya, Batalkan Paksa" : "Ya, Tutup Booking"}
              </button>
            </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
      {bookingToCancelCheckIn && (
        <div
          className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-checkin-title"
          onClick={() => !isCancellingCheckIn && setBookingToCancelCheckIn(null)}
        >
          <form
            className="w-full max-w-md rounded-2xl border border-slate-100 bg-white p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              void handleCancelCheckInAndBooking();
            }}
          >
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-600">
              <XCircle className="h-6 w-6" />
            </div>
            <h3 id="cancel-checkin-title" className="text-center text-base font-bold text-slate-900">
              Batalkan Check-In &amp; Janji?
            </h3>
            <p className="mt-2 text-center text-xs leading-relaxed text-slate-600">
              Check-in untuk <strong>{bookingToCancelCheckIn.patientNameSnapshot || "Pasien"}</strong> akan dibatalkan bersama antrean, kunjungan, dan janji temu pada{" "}
              <strong>{formatIndonesianDate(getOperationalDateString(bookingToCancelCheckIn.bookingDateTime))}</strong>. Riwayat tetap tersimpan dan pasien dapat membuat janji baru.
            </p>
            <label className="mt-4 block text-xs font-semibold text-slate-700">
              Alasan pembatalan
              <textarea
                required
                maxLength={500}
                rows={3}
                value={checkInCancellationReason}
                onChange={(event) => setCheckInCancellationReason(event.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-normal text-slate-800 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
                placeholder="Contoh: Check-in tidak sengaja; pasien belum datang."
              />
            </label>
            {checkInCancellationError && (
              <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                {checkInCancellationError}
              </p>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                disabled={isCancellingCheckIn}
                onClick={() => setBookingToCancelCheckIn(null)}
                className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50"
              >
                Kembali
              </button>
              <button
                type="submit"
                disabled={isCancellingCheckIn || !checkInCancellationReason.trim()}
                className="flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-rose-700 disabled:cursor-wait disabled:opacity-50"
              >
                {isCancellingCheckIn ? "Membatalkan..." : "Ya, Batalkan"}
              </button>
            </div>
          </form>
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
              Apakah Anda yakin ingin membatalkan jadwal booking pasien <strong>{bookingToCancel.patientNameSnapshot || "Pasien"}</strong> pada tanggal <strong>{formatIndonesianDate(getOperationalDateString(bookingToCancel.bookingDateTime))}</strong> jam <strong>{getOperationalTimeString(bookingToCancel.bookingDateTime)}</strong> WIB?
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
