import React, { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import html2canvas from "html2canvas";
import {
  AlertCircle,
  Building2,
  CalendarClock,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock,
  CreditCard,
  Download,
  FileText,
  Heart,
  History,
  Home,
  KeyRound,
  ListOrdered,
  Lock,
  LogOut,
  MapPin,
  Navigation,
  Printer,
  Receipt,
  Send,
  ShieldCheck,
  Stethoscope,
  UserRound
} from "lucide-react";
import { useApp } from "../context/AppContext";
import { useRouter } from "../components/Router";
import { AuthService } from "../services/authService";
import { LalaLogo } from "../components/common/LalaLogo";
import {
  Booking,
  BookingSource,
  BookingStatus,
  DentalDoctor,
  DoctorSchedule,
  Invoice,
  InvoiceStatus,
  PaymentMethod,
  PaymentTransaction,
  PatientVisit,
  PatientBookingQueueEstimate,
  QueueItem,
  QueueStatus,
  ScheduleStatus,
  UserRole
} from "../types/domain";
import { getTodayDateString, getTomorrowDateString, getOperationalDateString, toOperationalDateTime } from "../utils/dateUtils";
import { getVisitStatusForQueueStatus } from "../utils/bookingQueueGuards";
import { getVisiblePromotions } from "../utils/promotionUtils";
import { supabase } from "../lib/supabase";
import { isLocalPatientDemoEnabled } from "../utils/localPatientDemo";

interface PatientCardDetails {
  name: string;
  fullName: string;
  dateOfBirth: string;
  medicalRecordNumber: string;
  internalPatientCode: string;
  address: string;
  phone: string;
}

type PatientSection = "home" | "appointments" | "queue" | "history" | "profile";

const patientNavigation: { id: PatientSection; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "home", label: "Beranda", icon: Home },
  { id: "appointments", label: "Buat Janji", icon: CalendarDays },
  { id: "queue", label: "Antrean", icon: ListOrdered },
  { id: "history", label: "Riwayat", icon: History },
  { id: "profile", label: "Profil", icon: UserRound }
];

const activeBookingStatuses = new Set([BookingStatus.PENDING, BookingStatus.CONFIRMED]);
const activeQueueStatuses = new Set<string>([
  QueueStatus.WAITING,
  QueueStatus.IN_PREPARATION,
  QueueStatus.IN_CONSULTATION,
  "CALLING"
]);

const formatAppointmentDate = (dateTime: string): string => {
  const date = new Date(dateTime);
  if (Number.isNaN(date.getTime())) return "Tanggal belum tersedia";
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).format(date);
};

const bookingStatusLabel: Record<BookingStatus, string> = {
  [BookingStatus.PENDING]: "Menunggu konfirmasi",
  [BookingStatus.CONFIRMED]: "Dikonfirmasi",
  [BookingStatus.COMPLETED]: "Selesai",
  [BookingStatus.CANCELLED]: "Dibatalkan",
  [BookingStatus.RESCHEDULED]: "Dijadwalkan ulang",
  [BookingStatus.NO_SHOW]: "Tidak hadir"
};

const queueStatusLabel: Record<string, string> = {
  WAITING: "Menunggu giliran",
  CALLING: "Sedang dipanggil",
  IN_PREPARATION: "Persiapan perawatan",
  IN_CONSULTATION: "Sedang diperiksa",
  COMPLETED: "Pelayanan selesai",
  SKIPPED: "Antrean dilewati",
  CANCELLED: "Antrean dibatalkan"
};

const invoiceStatusLabel: Record<InvoiceStatus, string> = {
  [InvoiceStatus.DRAFT]: "Tagihan disiapkan",
  [InvoiceStatus.OPEN]: "Belum dibayar",
  [InvoiceStatus.PARTIALLY_PAID]: "Dibayar sebagian",
  [InvoiceStatus.PAID]: "Lunas",
  [InvoiceStatus.CANCELLED]: "Dibatalkan"
};

const paymentMethodLabel: Record<PaymentMethod, string> = {
  [PaymentMethod.CASH]: "Tunai",
  [PaymentMethod.TRANSFER]: "Transfer",
  [PaymentMethod.QRIS]: "QRIS",
  [PaymentMethod.OTHER]: "Lainnya"
};

const formatCurrency = (amount: number): string =>
  `Rp ${amount.toLocaleString("id-ID")}`;

export const PatientPortalHome: React.FC = () => {
  const {
    currentUser,
    setCurrentUser,
    branding,
    bookingRepo,
    branches,
    doctors,
    repos,
    bookings,
    setBookings,
    visits,
    queueItems,
    realtimeSyncStatus,
    promotions,
    invoices,
    payments,
    loading,
    loadWarnings
  } = useApp();
  const { navigate } = useRouter();
  const [section, setSection] = useState<PatientSection>("home");
  const [formBranchId, setFormBranchId] = useState("");
  const [formDate, setFormDate] = useState(getTomorrowDateString());
  const [formDoctorId, setFormDoctorId] = useState("");
  const [formTimeSlot, setFormTimeSlot] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [activeSchedules, setActiveSchedules] = useState<DoctorSchedule[]>([]);
  const [availableTimeSlots, setAvailableTimeSlots] = useState<string[]>([]);
  const [isLoadingSchedules, setIsLoadingSchedules] = useState(false);
  const [isLoadingAvailableTimeSlots, setIsLoadingAvailableTimeSlots] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [slotAvailabilityError, setSlotAvailabilityError] = useState<string | null>(null);
  const [bookingSubmitError, setBookingSubmitError] = useState<string | null>(null);
  const [bookingSubmitSuccess, setBookingSubmitSuccess] = useState<string | null>(null);
  const [isSubmittingBooking, setIsSubmittingBooking] = useState(false);
  const [arrivalConfirmingBookingId, setArrivalConfirmingBookingId] = useState<string | null>(null);
  const [lateCheckInRequestingBookingId, setLateCheckInRequestingBookingId] = useState<string | null>(null);
  const [arrivalConfirmationError, setArrivalConfirmationError] = useState<string | null>(null);
  const [arrivalConfirmationSuccess, setArrivalConfirmationSuccess] = useState<string | null>(null);
  const [bookingQueueEstimate, setBookingQueueEstimate] = useState<PatientBookingQueueEstimate | null>(null);
  const [bookingQueueEstimateError, setBookingQueueEstimateError] = useState<string | null>(null);
  const [portalClock, setPortalClock] = useState(Date.now());
  const [invoiceItemsById, setInvoiceItemsById] = useState<Record<string, Awaited<ReturnType<typeof repos.invoice.getInvoiceItems>>>>({});
  const [invoiceItemsError, setInvoiceItemsError] = useState<string | null>(null);
  const [activePromotionIndex, setActivePromotionIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [patientCardProfile, setPatientCardProfile] = useState<PatientCardDetails | null>(null);
  const [patientCardProfileError, setPatientCardProfileError] = useState<string | null>(null);
  const [isLoadingPatientCardProfile, setIsLoadingPatientCardProfile] = useState(false);
  const [patientCardQrCode, setPatientCardQrCode] = useState<string | null>(null);
  const [patientCardRefreshKey, setPatientCardRefreshKey] = useState(0);
  const [isDownloadingPatientCard, setIsDownloadingPatientCard] = useState(false);
  const [patientCardDownloadError, setPatientCardDownloadError] = useState<string | null>(null);
  const patientCardRef = useRef<HTMLElement | null>(null);
  const portalContentRef = useRef<HTMLDivElement | null>(null);
  const isLoadingBookings = loading;
  const bookingError = loadWarnings.includes("bookings")
    ? "Gagal memuat janji temu pasien. Silakan coba muat ulang."
    : null;
  const clinicName = branding?.name || "Lala Dentist";
  const patientName = currentUser?.name || "Pasien";
  const initials = patientName.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "P";
  const activeBranches = branches.filter((branch) => branch.isActive && branch.active !== false);

  useEffect(() => {
    if (portalContentRef.current) portalContentRef.current.scrollTop = 0;
  }, [section]);

  useEffect(() => {
    const patientId = currentUser?.patientId;
    if (isLocalPatientDemoEnabled) {
      setPatientCardProfile(null);
      setPatientCardQrCode(null);
      setPatientCardProfileError(null);
      setIsLoadingPatientCardProfile(false);
      return;
    }
    if (!patientId) {
      setPatientCardProfile(null);
      setPatientCardQrCode(null);
      setPatientCardProfileError(null);
      setIsLoadingPatientCardProfile(false);
      return;
    }

    let active = true;
    let requestInFlight = false;
    const loadPatientCard = async () => {
      if (!active || requestInFlight) return;
      requestInFlight = true;
      setIsLoadingPatientCardProfile(!patientCardProfile);
      setPatientCardProfileError(null);
      try {
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw new Error(`Gagal memeriksa sesi pasien: ${sessionError.message}`);
        const accessToken = data.session?.access_token;
        if (!accessToken) throw new Error("Sesi login tidak ditemukan. Silakan masuk kembali.");

        const response = await fetch("/api/patient-card/token", {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        const result = await response.json().catch(() => null) as {
          message?: string;
          token?: string;
          expiresInSeconds?: number;
          patient?: PatientCardDetails;
        } | null;
        if (!response.ok) throw new Error(result?.message || "Gagal membuat QR verifikasi pasien.");
        if (
          !result ||
          !result.patient ||
          typeof result.patient.medicalRecordNumber !== "string" ||
          typeof result.patient.internalPatientCode !== "string"
        ) {
          throw new Error("Respons kartu pasien dari server tidak lengkap.");
        }

        const qrCode = result.patient.internalPatientCode
          ? await QRCode.toDataURL(result.patient.internalPatientCode, {
              errorCorrectionLevel: "M",
              margin: 1,
              width: 220,
              color: { dark: "#17233c", light: "#ffffff" }
            })
          : null;
        if (!active) return;
        setPatientCardProfile(result.patient);
        setPatientCardQrCode(qrCode);
      } catch (loadError: unknown) {
        if (!active) return;
        setPatientCardProfile(null);
        setPatientCardQrCode(null);
        setPatientCardProfileError(
          loadError instanceof Error
            ? `Kartu pasien gagal dimuat: ${loadError.message}`
            : "Kartu pasien gagal dimuat. Silakan coba lagi."
        );
      } finally {
        requestInFlight = false;
        if (active) setIsLoadingPatientCardProfile(false);
      }
    };

    void loadPatientCard();
    const refreshTimer = window.setInterval(() => void loadPatientCard(), 60_000);
    return () => {
      active = false;
      window.clearInterval(refreshTimer);
    };
  }, [currentUser?.patientId, patientCardRefreshKey]);

  const handleDownloadPatientCard = async () => {
    const card = patientCardRef.current;
    if (!card || !patientCardProfile?.internalPatientCode) return;

    setIsDownloadingPatientCard(true);
    setPatientCardDownloadError(null);
    const exportHost = document.createElement("div");
    exportHost.style.position = "fixed";
    exportHost.style.left = "-10000px";
    exportHost.style.top = "0";
    exportHost.style.width = "720px";
    exportHost.setAttribute("aria-hidden", "true");

    try {
      const cardCopy = card.cloneNode(true) as HTMLElement;
      cardCopy.style.width = "720px";
      cardCopy.style.maxWidth = "720px";
      cardCopy.style.height = "454px";
      cardCopy.style.aspectRatio = "auto";
      exportHost.append(cardCopy);
      document.body.append(exportHost);
      const canvas = await html2canvas(cardCopy, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
        windowWidth: 800
      });
      const link = document.createElement("a");
      link.download = `kartu-pasien-${patientCardProfile.internalPatientCode}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (downloadError: unknown) {
      setPatientCardDownloadError(
        downloadError instanceof Error
          ? `Kartu pasien gagal diunduh: ${downloadError.message}`
          : "Kartu pasien gagal diunduh. Silakan coba lagi."
      );
    } finally {
      exportHost.remove();
      setIsDownloadingPatientCard(false);
    }
  };

  const handlePrintPatientCard = () => {
    if (!patientCardProfile?.internalPatientCode) return;
    window.print();
  };

  const patientVisits = useMemo(
    () => visits.filter((visit) => visit.patientId === currentUser?.patientId),
    [visits, currentUser?.patientId]
  );
  const patientQueueItems = useMemo(
    () => queueItems.filter((item) => item.patientId === currentUser?.patientId),
    [queueItems, currentUser?.patientId]
  );
  const patientInvoices = useMemo(
    () => invoices.filter((invoice) => invoice.patientId === currentUser?.patientId),
    [invoices, currentUser?.patientId]
  );
  const patientInvoiceIds = useMemo(() => new Set(patientInvoices.map((invoice) => invoice.id)), [patientInvoices]);
  const patientPayments = useMemo(
    () => payments.filter((payment) => patientInvoiceIds.has(payment.invoiceId)),
    [payments, patientInvoiceIds]
  );
  const activePatientQueue = patientQueueItems
    .filter((item) =>
      activeQueueStatuses.has(item.status)
      && getOperationalDateString(item.arrivalAt) === getTodayDateString()
    )
    .sort((a, b) => new Date(b.arrivalAt).getTime() - new Date(a.arrivalAt).getTime())[0];
  const mostRecentQueue = [...patientQueueItems]
    .sort((a, b) => new Date(b.arrivalAt).getTime() - new Date(a.arrivalAt).getTime())[0];

  useEffect(() => {
    let active = true;
    if (section !== "history" || !currentUser?.patientId || patientInvoices.length === 0) {
      setInvoiceItemsById({});
      setInvoiceItemsError(null);
      return () => {
        active = false;
      };
    }

    repos.invoice.getInvoiceItemsByInvoices(patientInvoices.map((invoice) => invoice.id))
      .then((items) => {
        if (!active) return;
        const grouped = items.reduce<Record<string, typeof items>>((result, item) => {
          result[item.invoiceId] = [...(result[item.invoiceId] || []), item];
          return result;
        }, {});
        setInvoiceItemsById(grouped);
      })
      .catch((itemsError: unknown) => {
        if (active) {
          setInvoiceItemsError(itemsError instanceof Error ? itemsError.message : "Gagal memuat rincian invoice.");
          setInvoiceItemsById({});
        }
      });

    return () => {
      active = false;
    };
  }, [currentUser?.patientId, patientInvoices, repos.invoice, section]);

  useEffect(() => {
    let active = true;
    if (!currentUser?.patientId || !formBranchId || !formDate) {
      setActiveSchedules([]);
      setIsLoadingSchedules(false);
      setScheduleError(null);
      return () => {
        active = false;
      };
    }

    setIsLoadingSchedules(true);
    setActiveSchedules([]);
    setScheduleError(null);
    repos.doctorSchedule.getSchedules({
      branchId: formBranchId,
      date: formDate,
      status: ScheduleStatus.ACTIVE
    }, UserRole.PATIENT)
      .then((schedules) => {
        if (active) setActiveSchedules(schedules.filter((schedule) => schedule.status === ScheduleStatus.ACTIVE));
      })
      .catch((loadError: unknown) => {
        if (active) {
          setScheduleError(loadError instanceof Error ? loadError.message : "Gagal memuat jadwal dokter.");
          setActiveSchedules([]);
        }
      })
      .finally(() => {
        if (active) setIsLoadingSchedules(false);
      });

    return () => {
      active = false;
    };
  }, [currentUser?.patientId, formBranchId, formDate, repos.doctorSchedule]);

  const availableDoctors = useMemo(() => {
    const scheduledDoctorIds = new Set(activeSchedules.map((schedule) => schedule.doctorId.toLowerCase()));
    const scheduledDoctorKeys = new Set(activeSchedules.map((schedule) => schedule.doctorId.toLowerCase().replace(/^doc-/, "")));
    return doctors.filter((doctor) => {
      if (!(doctor.active ?? doctor.isActive ?? true)) return false;
      const doctorId = doctor.id.toLowerCase();
      const doctorKey = doctorId.replace(/^doc-/, "");
      const doctorCode = doctor.doctorCode?.toLowerCase();
      return scheduledDoctorIds.has(doctorId)
        || scheduledDoctorKeys.has(doctorKey)
        || (!!doctorCode && scheduledDoctorIds.has(doctorCode));
    });
  }, [activeSchedules, doctors]);

  const selectedDoctor = availableDoctors.find((doctor) => doctor.id === formDoctorId);
  const selectedSchedule = activeSchedules.find((schedule) => {
    if (!selectedDoctor || schedule.branchId !== formBranchId || schedule.date !== formDate) return false;
    const scheduleDoctorId = schedule.doctorId.toLowerCase();
    const doctorId = selectedDoctor.id.toLowerCase();
    const doctorCode = selectedDoctor.doctorCode?.toLowerCase();
    return scheduleDoctorId === doctorId
      || scheduleDoctorId.replace(/^doc-/, "") === doctorId.replace(/^doc-/, "")
      || (!!doctorCode && scheduleDoctorId === doctorCode);
  });
  useEffect(() => {
    let active = true;
    let hasLoaded = false;

    const loadAvailableTimeSlots = async () => {
      if (!currentUser?.patientId || !formBranchId || !formDate || !formDoctorId || !selectedSchedule) {
        setAvailableTimeSlots([]);
        setSlotAvailabilityError(null);
        setIsLoadingAvailableTimeSlots(false);
        return;
      }

      if (!hasLoaded) setIsLoadingAvailableTimeSlots(true);
      try {
        const slots = await bookingRepo.getPatientAvailableBookingSlots(formBranchId, formDoctorId, formDate);
        if (active) {
          setAvailableTimeSlots(slots);
          setSlotAvailabilityError(null);
        }
      } catch (loadError) {
        if (active) {
          setAvailableTimeSlots([]);
          setSlotAvailabilityError(loadError instanceof Error ? loadError.message : "Gagal memuat slot booking yang tersedia.");
        }
      } finally {
        hasLoaded = true;
        if (active) setIsLoadingAvailableTimeSlots(false);
      }
    };

    void loadAvailableTimeSlots();
    const refreshTimer = window.setInterval(() => void loadAvailableTimeSlots(), 30_000);

    return () => {
      active = false;
      window.clearInterval(refreshTimer);
    };
  }, [currentUser?.patientId, formBranchId, formDate, formDoctorId, selectedSchedule?.id, bookingRepo]);

  useEffect(() => {
    if (!availableDoctors.some((doctor) => doctor.id === formDoctorId)) {
      setFormDoctorId("");
      setFormTimeSlot("");
    }
  }, [availableDoctors, formDoctorId]);

  useEffect(() => {
    if (!availableTimeSlots.includes(formTimeSlot)) {
      setFormTimeSlot(availableTimeSlots[0] || "");
    }
  }, [availableTimeSlots, formTimeSlot]);

  const upcomingBooking = bookings
    .filter((booking) => activeBookingStatuses.has(booking.status) && new Date(booking.bookingDateTime).getTime() >= Date.now())
    .sort((a, b) => new Date(a.bookingDateTime).getTime() - new Date(b.bookingDateTime).getTime())[0];
  const mostRecentBooking = [...bookings]
    .sort((a, b) => new Date(b.bookingDateTime).getTime() - new Date(a.bookingDateTime).getTime())[0];
  const recentVisit = [...patientVisits].sort((a, b) =>
    new Date(b.visitDateTime).getTime() - new Date(a.visitDateTime).getTime()
  )[0];
  const promotionBranchId = activePatientQueue?.branchId
    || mostRecentQueue?.branchId
    || upcomingBooking?.branchId
    || mostRecentBooking?.branchId
    || recentVisit?.branchId
    || currentUser?.assignedBranchId
    || currentUser?.branchId
    || null;
  const visiblePromotions = useMemo(
    () => getVisiblePromotions(promotions, promotionBranchId, branches),
    [promotions, promotionBranchId, branches]
  );

  useEffect(() => {
    if (activePromotionIndex >= visiblePromotions.length) {
      setActivePromotionIndex(0);
      return;
    }
    if (visiblePromotions.length < 2) return;
    const timer = window.setInterval(() => {
      setActivePromotionIndex((index) => (index + 1) % visiblePromotions.length);
    }, 6000);
    return () => window.clearInterval(timer);
  }, [visiblePromotions.length, activePromotionIndex]);

  const activePromotion = visiblePromotions[activePromotionIndex];
  const activePatientBooking = currentUser?.patientId
    ? bookings
      .filter((booking) =>
        booking.patientId === currentUser.patientId
        && activeBookingStatuses.has(booking.status)
      )
      .sort((a, b) => new Date(a.bookingDateTime).getTime() - new Date(b.bookingDateTime).getTime())[0]
    : undefined;

  useEffect(() => {
    const timer = window.setInterval(() => setPortalClock(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    const isOnlineBooking = activePatientBooking?.source === BookingSource.PATIENT_PORTAL
      || activePatientBooking?.source === BookingSource.ANDROID;
    const shouldLoadEstimate = Boolean(
      activePatientBooking
      && isOnlineBooking
      && !activePatientQueue
      && ["home", "appointments", "queue"].includes(section)
      && getOperationalDateString(activePatientBooking.bookingDateTime) === getTodayDateString()
    );
    if (!activePatientBooking || !shouldLoadEstimate) {
      setBookingQueueEstimate(null);
      setBookingQueueEstimateError(null);
      return () => {
        active = false;
      };
    }

    const loadEstimate = async () => {
      try {
        const estimate = await bookingRepo.getPatientQueueEstimate(activePatientBooking.id);
        if (active) {
          setBookingQueueEstimate(estimate);
          setBookingQueueEstimateError(null);
        }
      } catch (estimateError) {
        if (active) {
          setBookingQueueEstimateError(estimateError instanceof Error ? estimateError.message : "Gagal memuat estimasi antrean.");
        }
      }
    };

    void loadEstimate();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadEstimate();
    }, 5 * 60 * 1000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void loadEstimate();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [activePatientBooking?.id, activePatientBooking?.bookingDateTime, activePatientBooking?.source, activePatientQueue?.id, bookingRepo, section]);

  const handleConfirmArrival = async (booking: Booking) => {
    setArrivalConfirmationError(null);
    setArrivalConfirmationSuccess(null);
    setArrivalConfirmingBookingId(booking.id);
    try {
      const confirmedAt = await bookingRepo.confirmPatientEnRoute(booking.id);
      setBookings((existing) => existing.map((item) =>
        item.id === booking.id ? { ...item, enRouteConfirmedAt: confirmedAt } : item
      ));
      setArrivalConfirmationSuccess(`Konfirmasi menuju klinik tercatat pukul ${formatAppointmentDate(confirmedAt)}.`);
    } catch (confirmError) {
      setArrivalConfirmationError(confirmError instanceof Error ? confirmError.message : "Gagal mengirim konfirmasi menuju klinik.");
    } finally {
      setArrivalConfirmingBookingId(null);
    }
  };

  const handleRequestLateCheckInConfirmation = async (booking: Booking) => {
    setArrivalConfirmationError(null);
    setArrivalConfirmationSuccess(null);
    setLateCheckInRequestingBookingId(booking.id);
    try {
      const requestedAt = await bookingRepo.requestLateCheckInConfirmation(booking.id);
      setBookings((existing) => existing.map((item) =>
        item.id === booking.id ? { ...item, lateCheckInRequestedAt: requestedAt } : item
      ));
      setArrivalConfirmationSuccess("Permintaan konfirmasi check-in sudah dikirim ke klinik.");
    } catch (requestError) {
      setArrivalConfirmationError(requestError instanceof Error ? requestError.message : "Gagal meminta konfirmasi petugas.");
    } finally {
      setLateCheckInRequestingBookingId(null);
    }
  };

  const handleSignOut = async () => {
    setIsSigningOut(true);
    setError(null);
    try {
      await AuthService.signOut();
      setCurrentUser(null);
      navigate("/patient/login");
    } catch (signOutError) {
      setError(signOutError instanceof Error ? signOutError.message : "Gagal keluar dari akun.");
    } finally {
      setIsSigningOut(false);
    }
  };

  const handleChangePassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);
    if (newPassword.length < 8) {
      setPasswordError("Kata sandi baru minimal 8 karakter.");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordError("Konfirmasi kata sandi baru tidak cocok.");
      return;
    }

    setIsChangingPassword(true);
    try {
      await AuthService.changePassword(newPassword, currentPassword, currentUser?.email || null);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      setPasswordSuccess("Kata sandi berhasil diperbarui.");
    } catch (changeError) {
      setPasswordError(changeError instanceof Error ? changeError.message : "Gagal memperbarui kata sandi.");
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleCreatePatientBooking = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBookingSubmitError(null);
    setBookingSubmitSuccess(null);

    if (!currentUser?.patientId) {
      setBookingSubmitError("Profil pasien belum tertaut. Hubungi klinik untuk membantu pencocokan akun Anda.");
      return;
    }

    if (activePatientBooking) {
      setBookingSubmitError("Anda masih memiliki janji temu yang belum selesai. Selesaikan atau batalkan melalui klinik sebelum membuat janji temu baru.");
      return;
    }

    const selectedBranch = activeBranches.find((branch) => branch.id === formBranchId);
    if (!selectedBranch) {
      setBookingSubmitError("Pilih cabang klinik yang masih aktif.");
      return;
    }

    if (
      !selectedDoctor
      || !selectedSchedule
      || selectedSchedule.branchId !== formBranchId
      || selectedSchedule.date !== formDate
      || !formTimeSlot
    ) {
      setBookingSubmitError("Pilih tanggal, dokter, dan slot waktu yang tersedia.");
      return;
    }

    if (formDate < getTodayDateString()) {
      setBookingSubmitError("Tanggal booking tidak boleh di masa lalu.");
      return;
    }

      const currentAvailableSlots = await bookingRepo.getPatientAvailableBookingSlots(formBranchId, formDoctorId, formDate);
      if (!currentAvailableSlots.includes(formTimeSlot)) {
        setAvailableTimeSlots(currentAvailableSlots);
        throw new Error("Slot ini baru saja tidak tersedia. Silakan pilih jam lain.");
      }

    let bookingDateTime: string;
    try {
      bookingDateTime = toOperationalDateTime(`${formDate}T00:00:00+07:00`, formTimeSlot);
    } catch (dateError) {
      setBookingSubmitError(dateError instanceof Error ? dateError.message : "Tanggal booking tidak valid.");
      return;
    }

    setIsSubmittingBooking(true);
    try {
      const createdBooking = await bookingRepo.createBooking({
        patientId: currentUser.patientId,
        branchId: selectedBranch.id,
        doctorId: selectedDoctor.id,
        bookingDateTime,
        timeSlot: formTimeSlot,
        notes: formNotes.trim(),
        complaint: formNotes.trim(),
        plannedTreatments: [],
        source: BookingSource.PATIENT_PORTAL,
        channel: BookingSource.PATIENT_PORTAL,
        status: BookingStatus.PENDING,
        patientNameSnapshot: patientName,
        doctorNameSnapshot: selectedDoctor.name,
        branchNameSnapshot: selectedBranch.name,
        scheduleVerified: true
      }, UserRole.PATIENT);

      setBookings((existing) => [createdBooking, ...existing.filter((booking) => booking.id !== createdBooking.id)]
        .sort((a, b) => new Date(a.bookingDateTime).getTime() - new Date(b.bookingDateTime).getTime()));
      setBookingSubmitSuccess("Permintaan janji temu berhasil dikirim. Statusnya menunggu konfirmasi klinik.");
      setFormNotes("");
    } catch (submitError) {
      setBookingSubmitError(submitError instanceof Error ? submitError.message : "Gagal mengirim permintaan janji temu.");
    } finally {
      setIsSubmittingBooking(false);
    }
  };

  const renderBookingCard = (booking: Booking, featured = false) => (
    (() => {
      const isOnlineBooking = booking.source === BookingSource.PATIENT_PORTAL || booking.source === BookingSource.ANDROID;
      const estimate = activePatientBooking?.id === booking.id ? bookingQueueEstimate : null;
      const scheduledAt = new Date(booking.bookingDateTime).getTime();
      const estimateAt = estimate ? new Date(estimate.estimatedServiceAt).getTime() : scheduledAt;
      const checkInDeadline = Math.max(scheduledAt + 15 * 60 * 1000, estimateAt + 15 * 60 * 1000);
      const isActiveBooking = activeBookingStatuses.has(booking.status);
      const canConfirmArrival = isOnlineBooking
        && isActiveBooking
        && portalClock >= scheduledAt - 60 * 60 * 1000
        && portalClock <= checkInDeadline;
      const needsStaffConfirmation = isOnlineBooking && isActiveBooking && portalClock > checkInDeadline;
      const bookingDoctorId = booking.doctorId.trim().toLowerCase();
      const normalizedBookingDoctorId = bookingDoctorId.replace(/^doc-/, "");
      const bookingDoctor = doctors.find((doctor) => {
        const doctorId = doctor.id.trim().toLowerCase();
        const doctorCode = doctor.doctorCode?.trim().toLowerCase();
        return doctorId === bookingDoctorId
          || doctorId.replace(/^doc-/, "") === normalizedBookingDoctorId
          || doctorCode === bookingDoctorId
          || doctorCode?.replace(/^doc-/, "") === normalizedBookingDoctorId;
      });
      const doctorPhotoUrl = bookingDoctor?.avatarUrl || bookingDoctor?.photoUrl || bookingDoctor?.profileImage;
      const doctorInitials = (bookingDoctor?.name || booking.doctorNameSnapshot || "Dokter")
        .replace(/^drg?\.?\s*/i, "")
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join("") || "D";
      return (
      <article key={booking.id} className={`${featured ? "patient-portal-upcoming-card h-full bg-gradient-to-r from-[var(--patient-gold-deep)] via-[var(--patient-gold-mid-light)] via-[var(--patient-gold-highlight)] to-[var(--patient-gold-deep)]" : "patient-portal-card bg-white"} relative rounded-2xl border border-[var(--patient-gold-edge)] p-5 shadow-sm`}>
        {featured && (
          <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]" aria-hidden="true">
            <div className="absolute inset-0 opacity-40">
              <svg className="h-full w-full" viewBox="0 0 1000 80" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
                <path d="M-100,60 C150,-10 350,90 550,20 C750,-50 850,100 1150,40" stroke="url(#patientCardSilkWhiteGradient)" strokeWidth="2.5" />
                <path d="M-50,70 C200,10 400,100 600,30 C800,-40 900,110 1200,50" stroke="url(#patientCardSilkWhiteGradient)" strokeWidth="1" />
                <defs>
                  <linearGradient id="patientCardSilkWhiteGradient" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#ffffff" stopOpacity="0.1" />
                    <stop offset="50%" stopColor="#ffffff" stopOpacity="0.6" />
                    <stop offset="100%" stopColor="#ffffff" stopOpacity="0.1" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <div className="absolute inset-y-0 left-1/3 w-1/4 skew-x-12 bg-gradient-to-r from-transparent via-white/15 to-transparent" />
          </div>
        )}
        <div className={featured ? "patient-portal-upcoming-content relative z-[1]" : undefined}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className={`text-xs font-bold uppercase tracking-wider ${featured ? "text-[#171717]" : "text-slate-400"}`}>{featured ? "Konsultasi mendatang" : "Janji temu"}</p>
            <h3 className="mt-1 text-base font-bold text-slate-900">
              {booking.plannedTreatments?.map((item) => item.serviceNameSnapshot).filter(Boolean).join(", ") || "Perawatan gigi"}
            </h3>
          </div>
          <span className="rounded-full bg-[var(--patient-gold-light)] px-3 py-1 text-[10px] font-bold text-[var(--patient-gold-ink)]">
            {bookingStatusLabel[booking.status]}
          </span>
        </div>
        <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
          <div className="flex items-start gap-2 text-slate-600">
            <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-[var(--patient-gold-deep)]" />
            <div>
              <dt className={`font-semibold ${featured ? "text-[#171717]" : "text-slate-400"}`}>Waktu</dt>
              <dd className={`mt-0.5 font-medium ${featured ? "text-[#171717]" : "text-slate-700"}`}>{formatAppointmentDate(booking.bookingDateTime)}</dd>
            </div>
          </div>
          <div className="flex items-start gap-2 text-slate-600">
            {featured ? (
              <span className="patient-portal-doctor-photo relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[var(--patient-gold-light)] text-base font-extrabold text-[var(--patient-gold-ink)] sm:h-24 sm:w-24">
                {doctorInitials}
                {doctorPhotoUrl && (
                  <img
                    src={doctorPhotoUrl}
                    alt={`Foto ${bookingDoctor?.name || booking.doctorNameSnapshot || "dokter"}`}
                    className="absolute inset-0 h-full w-full object-cover"
                    loading="lazy"
                    onError={(event) => {
                      event.currentTarget.style.display = "none";
                    }}
                  />
                )}
              </span>
            ) : (
              <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-[var(--patient-gold-deep)]" />
            )}
            <div>
              <dt className={`font-semibold ${featured ? "text-[#171717]" : "text-slate-400"}`}>{featured ? "Dokter konsultasi" : "Dokter dan cabang"}</dt>
              <dd className={`mt-0.5 font-medium ${featured ? "text-[#171717]" : "text-slate-700"}`}>
                {bookingDoctor?.name || booking.doctorNameSnapshot || "Dokter"}
              </dd>
              {featured && bookingDoctor?.specialization && (
                <dd className="mt-0.5 text-[11px] text-[#171717]">{bookingDoctor.specialization}</dd>
              )}
              {featured && (
                <dd className="mt-0.5 text-[11px] text-[#171717]">{booking.branchNameSnapshot || "Cabang klinik"}</dd>
              )}
              {!featured && (
                <dd className="mt-0.5 font-medium text-slate-700">{booking.branchNameSnapshot || "Cabang klinik"}</dd>
              )}
            </div>
          </div>
        </dl>
        {isOnlineBooking && isActiveBooking && (
          <div className="mt-4 rounded-xl border border-[var(--patient-gold-edge)] bg-[#fcfaf5] p-3.5">
            <div className="flex items-start gap-2">
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-[var(--patient-gold-deep)]" />
              <div className="min-w-0">
                <p className="text-xs font-bold text-[var(--patient-gold-ink)]">
                  {estimate
                    ? `Perkiraan dilayani ${formatAppointmentDate(estimate.estimatedServiceAt)}`
                    : "Perkiraan panggilan mengikuti jadwal booking"}
                </p>
                {estimate && (
                  <p className="mt-1 text-[11px] text-slate-600">
                    Sekitar {estimate.patientsAhead} pasien atau booking sebelum Anda. Diperbarui {formatAppointmentDate(estimate.refreshedAt)}.
                  </p>
                )}
                {!estimate && getOperationalDateString(booking.bookingDateTime) !== getTodayDateString() && (
                  <p className="mt-1 text-[11px] text-slate-500">Estimasi antrean diperbarui pada hari kunjungan.</p>
                )}
                {bookingQueueEstimateError && activePatientBooking?.id === booking.id && (
                  <p role="alert" className="mt-1 text-[11px] text-rose-700">{bookingQueueEstimateError}</p>
                )}
              </div>
            </div>
            <p className="mt-3 text-[11px] leading-5 text-slate-600">
              {featured
                ? "Check-in resmi dilakukan petugas setelah Anda tiba, mulai 60 menit sebelum hingga 15 menit setelah jadwal. Jika melewati batas, hubungi petugas; janji tidak otomatis dibatalkan."
                : "Setelah tiba, minta petugas melakukan check-in resmi mulai 60 menit sebelum sampai 15 menit setelah jadwal. Jika antrean klinik mundur, ikuti estimasi terbaru. Booking tidak otomatis dibatalkan; jika melewati batas, hubungi petugas untuk konfirmasi."}
            </p>
            {arrivalConfirmationError && (
              <p role="alert" className="mt-2 text-[11px] text-rose-700">{arrivalConfirmationError}</p>
            )}
            {arrivalConfirmationSuccess && (
              <p role="status" className="mt-2 text-[11px] text-emerald-700">{arrivalConfirmationSuccess}</p>
            )}
            {booking.enRouteConfirmedAt ? (
              <p role="status" className="mt-3 flex items-center gap-2 text-xs font-semibold text-emerald-700">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                Konfirmasi menuju klinik tercatat {formatAppointmentDate(booking.enRouteConfirmedAt)}.
              </p>
            ) : canConfirmArrival ? (
              <button
                type="button"
                onClick={() => void handleConfirmArrival(booking)}
                disabled={arrivalConfirmingBookingId === booking.id}
                className="mt-3 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[var(--patient-gold-ink)] px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-[var(--patient-gold-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--patient-gold-edge)] focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70"
              >
                <Navigation className="h-4 w-4" />
                {arrivalConfirmingBookingId === booking.id ? "Mengirim konfirmasi..." : "Saya sedang menuju klinik"}
              </button>
            ) : needsStaffConfirmation ? (
              booking.lateCheckInRequestedAt ? (
                <p role="status" className="mt-3 rounded-lg bg-amber-100 px-3 py-2 text-[11px] font-semibold leading-5 text-amber-900">
                  Permintaan konfirmasi check-in telah dikirim ke klinik pada {formatAppointmentDate(booking.lateCheckInRequestedAt)}. Booking tidak dibatalkan otomatis; tunggu konfirmasi petugas.
                </p>
              ) : (
                <div className="mt-3">
                  <p className="rounded-lg bg-amber-100 px-3 py-2 text-[11px] font-semibold leading-5 text-amber-900">
                    Batas check-in telah lewat. Booking tidak dibatalkan otomatis; minta petugas memastikan jadwal Anda.
                  </p>
                  <button
                    type="button"
                    onClick={() => void handleRequestLateCheckInConfirmation(booking)}
                    disabled={lateCheckInRequestingBookingId === booking.id}
                    className="mt-2 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-amber-300 bg-white px-4 py-2 text-xs font-bold text-amber-900 transition hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70"
                  >
                    {lateCheckInRequestingBookingId === booking.id ? "Mengirim permintaan..." : "Minta konfirmasi petugas"}
                  </button>
                </div>
              )
            ) : null}
          </div>
        )}
        </div>
      </article>
      );
    })()
  );

  const renderQueueStatus = (item: QueueItem, featured = false) => {
    const queueDoctorId = item.doctorId.trim().toLowerCase();
    const normalizedQueueDoctorId = queueDoctorId.replace(/^doc-/, "");
    const queueDoctor = doctors.find((doctor) => {
      const doctorId = doctor.id.trim().toLowerCase();
      const doctorCode = doctor.doctorCode?.trim().toLowerCase();
      return doctorId === queueDoctorId
        || doctorId.replace(/^doc-/, "") === normalizedQueueDoctorId
        || doctorCode === queueDoctorId
        || doctorCode?.replace(/^doc-/, "") === normalizedQueueDoctorId;
    });
    const doctorSnapshot = item.doctorNameSnapshot?.trim();
    const doctorName = queueDoctor?.name
      || (doctorSnapshot && !["dokter", "dokter klinik"].includes(doctorSnapshot.toLowerCase())
        ? doctorSnapshot
        : "Dokter belum ditentukan");

    return (
    <article key={item.id} className={`patient-portal-queue-card ${featured ? "patient-portal-queue-featured" : ""} rounded-3xl border p-5 sm:p-6`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--patient-gold-ink)]">{featured ? "Status antrean" : "Antrean klinik"}</p>
          <h3 className={`${featured ? "mt-2 text-4xl" : "mt-1 text-xl"} font-extrabold tracking-tight text-[var(--patient-gold-ink)]`}>
            {featured ? item.queueNumber : `Nomor antrean ${item.queueNumber}`}
          </h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-[var(--patient-gold-edge)]/30 bg-white/75 px-3 py-1 text-[10px] font-bold text-[var(--patient-gold-ink)]">
            {queueStatusLabel[item.status] || item.status}
          </span>
          <span
            className={`rounded-full px-3 py-1 text-[10px] font-bold ${
              realtimeSyncStatus.isConnected
                ? "bg-emerald-50 text-emerald-700"
                : "bg-slate-100 text-slate-500"
            }`}
            aria-label={realtimeSyncStatus.isConnected ? "Pembaruan realtime aktif" : "Pembaruan realtime tidak terhubung"}
          >
            {realtimeSyncStatus.isConnected ? "REALTIME AKTIF" : "TIDAK LIVE"}
          </span>
        </div>
      </div>
      <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
        <div>
          <dt className="font-semibold text-[var(--patient-gold-ink)]">Dokter</dt>
          <dd className="mt-1 font-semibold text-[var(--patient-gold-ink)]">{doctorName}</dd>
        </div>
        <div>
          <dt className="font-semibold text-[var(--patient-gold-ink)]">Perkiraan giliran</dt>
          <dd className="mt-1 font-semibold text-[var(--patient-gold-ink)]">
            {item.estimatedServiceAt
              ? formatAppointmentDate(item.estimatedServiceAt)
              : "Menunggu perhitungan antrean"}
          </dd>
        </div>
      </dl>
      <p className="mt-3 text-[10px] leading-5 text-[var(--patient-gold-ink)]">
        Perkiraan giliran dapat berubah mengikuti kondisi pelayanan di klinik.
      </p>
    </article>
    );
  };

  const renderVisitCard = (visit: PatientVisit) => {
    const latestQueueItem = patientQueueItems
      .filter((item) => item.visitId === visit.id)
      .sort((a, b) => (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt))[0];
    const visitStatus = latestQueueItem
      ? getVisitStatusForQueueStatus(latestQueueItem.status) || visit.visitStatus
      : visit.visitStatus;

    return (
      <article key={visit.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
              {visit.visitType === "BOOKING" ? "Kunjungan dari janji temu" : "Kunjungan langsung"}
            </p>
            <h3 className="mt-1 text-sm font-bold text-slate-900">
              {visit.visitNumber ? `Kunjungan ${visit.visitNumber}` : "Riwayat kunjungan"}
            </h3>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold text-slate-700">
            {visitStatus.replaceAll("_", " ")}
          </span>
        </div>
        <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
          <div>
            <dt className="font-semibold text-slate-400">Tanggal</dt>
            <dd className="mt-1 font-medium text-slate-700">{formatAppointmentDate(visit.visitDateTime)}</dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-400">Keluhan</dt>
            <dd className="mt-1 font-medium text-slate-700">{visit.complaint || "Tidak ada catatan keluhan."}</dd>
          </div>
        </dl>
      </article>
    );
  };

  const renderInvoiceCard = (invoice: Invoice) => {
    const invoicePayments = patientPayments
      .filter((payment) => payment.invoiceId === invoice.id)
      .sort((a, b) => new Date(b.transactionDateTime).getTime() - new Date(a.transactionDateTime).getTime());

    return (
      <article key={invoice.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Invoice</p>
            <h3 className="mt-1 text-sm font-bold text-slate-900">{invoice.invoiceNumber || "Tagihan perawatan"}</h3>
            <p className="mt-1 text-[11px] text-slate-500">{formatAppointmentDate(invoice.createdAt)}</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-[10px] font-bold ${
            invoice.status === InvoiceStatus.PAID
              ? "bg-emerald-50 text-emerald-800"
              : invoice.status === InvoiceStatus.CANCELLED
                ? "bg-slate-100 text-slate-600"
                : "bg-amber-50 text-amber-800"
          }`}>
            {invoiceStatusLabel[invoice.status]}
          </span>
        </div>
        <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-3">
          <div>
            <dt className="font-semibold text-slate-400">Total tagihan</dt>
            <dd className="mt-1 font-bold text-slate-800">{formatCurrency(invoice.netAmount)}</dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-400">Sudah dibayar</dt>
            <dd className="mt-1 font-medium text-slate-700">{formatCurrency(invoice.paidAmount)}</dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-400">Sisa tagihan</dt>
            <dd className="mt-1 font-medium text-slate-700">{formatCurrency(invoice.outstandingAmount)}</dd>
          </div>
        </dl>
        {(invoiceItemsById[invoice.id]?.length ?? 0) > 0 && (
          <ul className="mt-4 divide-y divide-slate-100 border-t border-slate-100 text-xs">
            {invoiceItemsById[invoice.id].map((item) => (
              <li key={item.id} className="flex justify-between gap-4 py-2">
                <span className="text-slate-600">{item.descriptionSnapshot} × {item.quantity}</span>
                <span className="shrink-0 font-semibold text-slate-700">{formatCurrency(item.amount)}</span>
              </li>
            ))}
          </ul>
        )}
        {invoicePayments.length > 0 && (
          <div className="mt-4 border-t border-slate-100 pt-3">
            <p className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-700">
              <Receipt className="h-4 w-4 text-[var(--patient-gold-deep)]" /> Kuitansi pembayaran
            </p>
            <ul className="space-y-2">
              {invoicePayments.map((payment: PaymentTransaction) => (
                <li key={payment.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-[11px]">
                  <span className="font-semibold text-slate-700">{payment.receiptNumber || "Kuitansi"} · {paymentMethodLabel[payment.paymentMethod]}</span>
                  <span className="text-slate-600">{formatCurrency(payment.amount)} · {formatAppointmentDate(payment.transactionDateTime)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </article>
    );
  };

  const renderLinkNotice = (feature: string) => (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
        <div>
          <h3 className="text-sm font-bold text-amber-950">Profil pasien belum terhubung</h3>
          <p className="mt-1 text-xs leading-5 text-amber-900">
            {feature} belum dapat ditampilkan karena akun portal ini belum ditautkan oleh klinik ke profil pasien. Hubungi staf klinik untuk membantu pencocokan identitas dengan aman.
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <main className="patient-portal-shell min-h-screen w-full min-w-0 pb-28 text-slate-900 md:pb-0">
      <header className="patient-portal-header sticky top-0 z-10 min-h-20 border-b border-[var(--patient-gold-edge)]/40">
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          <div className="absolute inset-0 opacity-40">
            <svg className="h-full w-full" viewBox="0 0 1000 80" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
              <path d="M-100,60 C150,-10 350,90 550,20 C750,-50 850,100 1150,40" stroke="url(#patientSilkWhiteGradient)" strokeWidth="2.5" />
              <path d="M-50,70 C200,10 400,100 600,30 C800,-40 900,110 1200,50" stroke="url(#patientSilkWhiteGradient)" strokeWidth="1" />
              <defs>
                <linearGradient id="patientSilkWhiteGradient" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="var(--patient-gold-light)" stopOpacity="0.14" />
                  <stop offset="50%" stopColor="var(--patient-gold-light)" stopOpacity="0.72" />
                  <stop offset="100%" stopColor="var(--patient-gold-light)" stopOpacity="0.14" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <div className="absolute inset-y-0 left-1/3 w-1/4 skew-x-12 bg-gradient-to-r from-transparent via-[var(--patient-gold-light)]/25 to-transparent" />
        </div>
        <div className="relative z-[1] mx-auto flex min-h-20 max-w-6xl items-center justify-between gap-2 px-3 py-2 sm:gap-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white p-1 shadow-sm sm:h-11 sm:w-11">
              <LalaLogo src={branding?.logoUrl || "/logo-lala.svg"} className="h-full w-full scale-[1.25]" />
            </div>
            <div className="min-w-0 drop-shadow-[0_1px_2px_rgba(70,50,17,0.25)]">
              <p className="truncate text-xs font-extrabold tracking-tight text-[var(--patient-gold-ink)] sm:text-base">{clinicName}</p>
              <p className="mt-0.5 text-[8px] font-semibold tracking-wide text-[var(--patient-gold-ink)] sm:text-[10px]">Senyum indah dimulai di Laladentist</p>
            </div>
          </div>
          <nav aria-label="Navigasi portal pasien" className="patient-portal-desktop-nav hidden items-center gap-1 rounded-2xl border p-1 md:flex">
            {patientNavigation.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                aria-current={section === id ? "page" : undefined}
                onClick={() => setSection(id)}
                className={`patient-portal-nav-item inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition ${
                  section === id ? "patient-portal-nav-active text-[var(--patient-gold-ink)]" : "text-[var(--patient-gold-ink)]/80 hover:bg-white/40 hover:text-[var(--patient-gold-ink)]"
                }`}
              >
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
          </nav>
          <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-white/60 bg-white/95 py-1 pl-2 pr-1 shadow-sm sm:gap-2 sm:pl-3 sm:pr-1.5">
            <span className="block max-w-20 text-right sm:max-w-40">
              <span className="block truncate text-[9px] font-semibold text-[var(--patient-gold-ink)] sm:text-[10px]">Halo, Kak</span>
              <span className="block truncate text-[10px] font-semibold text-[var(--patient-gold-ink)] sm:text-xs">{patientName}</span>
            </span>
            <span className="patient-portal-avatar flex h-8 w-8 items-center justify-center rounded-full text-xs font-extrabold text-[var(--patient-gold-ink)] sm:h-9 sm:w-9 sm:text-sm" aria-label={`Inisial ${initials}`}>
              {initials}
            </span>
            <button
              type="button"
              onClick={() => void handleSignOut()}
              disabled={isSigningOut}
              aria-label={isSigningOut ? "Sedang keluar" : "Keluar"}
              className="patient-portal-signout inline-flex h-8 w-8 items-center justify-center rounded-full border transition disabled:opacity-50 sm:h-9 sm:w-auto sm:rounded-xl sm:px-3"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">{isSigningOut ? "Keluar..." : "Keluar"}</span>
            </button>
          </div>
        </div>
      </header>

      <div ref={portalContentRef} className="patient-portal-content mx-auto w-full min-w-0 max-w-6xl px-3 py-6 sm:px-6 sm:py-9">
        {error && <div role="alert" className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">{error}</div>}
        {bookingError && <div role="alert" className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">{bookingError}</div>}
        {section === "home" && loadWarnings.includes("promotion_media") && (
          <div role="alert" className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            Media promosi belum dapat dimuat. Coba muat ulang halaman.
          </div>
        )}

        {section === "home" && (
          <>
            <section
              className={`patient-portal-hero relative flex w-full min-w-0 flex-col justify-end overflow-hidden rounded-[1.5rem] text-white shadow-lg ${
                activePromotion ? "aspect-[16/8] min-h-[180px] px-4 py-4 sm:aspect-[16/5] sm:min-h-[220px] sm:px-8 sm:py-6" : "min-h-[120px] px-4 py-4 sm:px-8 sm:py-5"
              }`}
              aria-label={activePromotion?.title ? `Promosi: ${activePromotion.title}` : "Informasi portal pasien"}
            >
              {activePromotion && (
                <>
                  <img
                    src={activePromotion.imageUrl}
                    alt={activePromotion.title || "Banner promosi Lala Dentist"}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                </>
              )}
              <div className="absolute -right-10 -top-20 h-64 w-64 rounded-full border border-white/10" />
              <div className="absolute -bottom-28 right-28 h-52 w-52 rounded-full border border-white/10" />
              <div className="patient-portal-hero-copy relative max-w-2xl">
                {activePromotion ? (
                  <>
                    {activePromotion.title && (
                      <h1 className="patient-portal-promo-title text-2xl font-bold leading-tight sm:text-3xl">{activePromotion.title}</h1>
                    )}
                    {activePromotion.description && (
                      <p className={`patient-portal-promo-description ${activePromotion.title ? "mt-2" : "mt-0"} max-w-xl text-sm leading-6`}>{activePromotion.description}</p>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--patient-gold-soft)]">Portal pasien {clinicName}</p>
                    <h1 className="mt-1 text-2xl font-extrabold leading-tight sm:text-3xl">Halo, {patientName}</h1>
                    <p className="mt-1 max-w-xl text-xs leading-5 text-white/85 sm:text-sm">
                      Atur janji temu, pantau antrean, dan lihat informasi perawatan Anda dari satu tempat.
                    </p>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setSection("appointments")}
                  className="patient-portal-booking-cta mt-3 inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-xs font-bold transition hover:-translate-y-0.5"
                >
                  <CalendarPlus className="h-4 w-4" /> Buat Janji
                </button>
              </div>
              {visiblePromotions.length > 1 && (
                <div className="patient-portal-promo-controls absolute right-4 top-4 flex items-center gap-1.5 rounded-full border p-1 sm:right-6 sm:top-6">
                  <button
                    type="button"
                    onClick={() => setActivePromotionIndex((index) => (index - 1 + visiblePromotions.length) % visiblePromotions.length)}
                    aria-label="Promosi sebelumnya"
                    className="rounded-full p-1.5 text-white transition hover:bg-white/15"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="min-w-10 text-center text-[10px] font-bold text-white">
                    {activePromotionIndex + 1} / {visiblePromotions.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => setActivePromotionIndex((index) => (index + 1) % visiblePromotions.length)}
                    aria-label="Promosi berikutnya"
                    className="rounded-full p-1.5 text-white transition hover:bg-white/15"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              )}
            </section>

            <nav aria-label="Menu beranda pasien" className="patient-portal-home-menu mt-4 grid grid-cols-4 gap-2 sm:mt-5 sm:gap-3">
              {patientNavigation.filter(({ id }) => id !== "home").map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSection(id)}
                  className="patient-portal-home-menu-item flex min-w-0 flex-col items-center justify-center gap-2 rounded-2xl border border-[var(--patient-gold-edge)] bg-white px-1 py-3 text-center text-[10px] font-semibold text-[var(--patient-gold-ink)] shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--patient-gold-edge)] hover:bg-[var(--patient-gold-light)] sm:gap-2.5 sm:rounded-3xl sm:py-4 sm:text-xs"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[var(--patient-gold-light)] text-[var(--patient-gold-deep)] sm:h-11 sm:w-11">
                    <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
                  </span>
                  <span className="truncate">{label}</span>
                </button>
              ))}
            </nav>

            <section className="patient-portal-home-patient-card mt-5 max-w-3xl" aria-labelledby="home-patient-card-heading">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#17233c] text-[var(--patient-gold-mid)] shadow-sm">
                    <CreditCard className="h-4 w-4" />
                  </span>
                  <div>
                    <h2 id="home-patient-card-heading" className="text-sm font-bold text-slate-900">Kartu Pasien Digital</h2>
                    <p className="mt-0.5 text-[10px] text-slate-500">Identitas pasien dan QR verifikasi klinik.</p>
                  </div>
                </div>
                {patientCardProfile?.internalPatientCode && patientCardQrCode && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handlePrintPatientCard}
                      aria-label="Cetak kartu pasien"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--patient-gold-edge)] bg-white text-[var(--patient-gold-ink)] shadow-sm transition hover:bg-[var(--patient-gold-light)] sm:h-auto sm:w-auto sm:gap-2 sm:px-3 sm:text-xs sm:font-bold"
                    >
                      <Printer className="h-4 w-4" />
                      <span className="hidden sm:inline">Cetak</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDownloadPatientCard()}
                      disabled={isDownloadingPatientCard}
                      aria-label={isDownloadingPatientCard ? "Menyiapkan kartu pasien" : "Unduh kartu pasien"}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--patient-gold-edge)] bg-white text-[var(--patient-gold-ink)] shadow-sm transition hover:bg-[var(--patient-gold-light)] disabled:opacity-60 sm:h-auto sm:w-auto sm:gap-2 sm:px-3 sm:text-xs sm:font-bold"
                    >
                      <Download className="h-4 w-4" />
                      <span className="hidden sm:inline">{isDownloadingPatientCard ? "Menyiapkan..." : "Unduh"}</span>
                    </button>
                  </div>
                )}
              </div>
              {isLoadingPatientCardProfile && !patientCardProfile ? (
                <div role="status" className="rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-500 shadow-sm">
                  Memuat kartu pasien...
                </div>
              ) : patientCardProfileError ? (
                <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900">
                  <p>{patientCardProfileError}</p>
                  <button
                    type="button"
                    onClick={() => setPatientCardRefreshKey((key) => key + 1)}
                    className="mt-2 font-bold underline underline-offset-2"
                  >
                    Coba muat ulang
                  </button>
                </div>
              ) : patientCardProfile ? (
                <>
                  <article id="patient-card-printable" ref={patientCardRef} className="patient-portal-digital-card mx-auto rounded-3xl" aria-label="Kartu identitas pasien digital">
                    <div className="patient-portal-digital-card-header relative flex h-[30%] items-center gap-2.5 overflow-hidden px-4 sm:gap-3 sm:px-6">
                      <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white p-1 shadow-sm ring-1 ring-[var(--patient-gold-edge)] sm:h-14 sm:w-14">
                        <LalaLogo src={branding?.logoUrl || "/logo-lala.svg"} className="h-full w-full" />
                      </span>
                      <div className="relative min-w-0 flex-1">
                        <p className="truncate text-base font-extrabold tracking-wide text-[var(--patient-gold-ink)] sm:text-2xl">{clinicName}</p>
                        <p className="mt-0.5 truncate text-[7px] font-medium tracking-[0.12em] text-[var(--patient-gold-ink)] sm:text-[10px] sm:tracking-[0.2em]">Senyum indah dimulai di Laladentist</p>
                      </div>
                      <div className="relative ml-auto shrink-0 text-right">
                        <p className="text-[8px] font-extrabold uppercase tracking-[0.16em] text-[var(--patient-gold-deep)] sm:text-xs">Kartu Pasien</p>
                        <p className="text-[7px] uppercase tracking-[0.18em] text-[var(--patient-gold-deep)] sm:text-[10px]">Patient Card</p>
                      </div>
                    </div>
                    <div className="patient-portal-digital-card-body relative z-[1] grid h-[70%] min-h-0 grid-cols-[minmax(0,1fr)_auto] gap-2 px-4 pb-3 pt-2 sm:gap-4 sm:px-6 sm:pb-5 sm:pt-3">
                      <div className="flex min-w-0 flex-col justify-between">
                        <div className="min-w-0">
                          <p className="text-[8px] font-medium tracking-[0.08em] text-[var(--patient-gold-ink)] sm:text-sm">Nama Pasien</p>
                          <p className="mt-0.5 break-words text-sm font-bold leading-tight text-[#292722] sm:text-3xl">
                            {patientCardProfile.fullName || patientCardProfile.name || "Pasien"}
                          </p>
                          <div className="mt-2 flex min-w-0 items-start divide-x divide-[var(--patient-gold-edge)] sm:mt-3">
                            <div className="min-w-0 pr-2 sm:pr-4">
                              <p className="text-[7px] text-[var(--patient-gold-ink)] sm:text-xs">No. Pasien</p>
                              <p className="mt-0.5 break-all text-[10px] font-semibold leading-tight text-[#292722] sm:text-xl">
                                {patientCardProfile.internalPatientCode || "Akan diterbitkan"}
                              </p>
                            </div>
                            <div className="min-w-0 pl-2 sm:pl-4">
                              <p className="text-[7px] text-[var(--patient-gold-ink)] sm:text-xs">Tanggal Lahir</p>
                              <p className="mt-0.5 text-[10px] font-semibold leading-tight text-[#292722] sm:text-xl">
                                {patientCardProfile.dateOfBirth
                                  ? new Intl.DateTimeFormat("id-ID", {
                                      day: "numeric",
                                      month: "short",
                                      year: "numeric"
                                    }).format(new Date(`${patientCardProfile.dateOfBirth}T00:00:00`))
                                  : "—"}
                              </p>
                            </div>
                          </div>
                        </div>
                        <p className="max-w-[150px] pb-0.5 text-[7px] leading-3 tracking-wide text-[var(--patient-gold-ink)] sm:max-w-[220px] sm:text-sm sm:leading-5">
                          Perawatan terbaik<br />untuk senyum Anda
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-center justify-center gap-2">
                        {patientCardQrCode ? (
                          <img
                            src={patientCardQrCode}
                            alt="QR kartu pasien berdasarkan kode RM"
                            className="h-[clamp(3.5rem,18vw,5.5rem)] w-[clamp(3.5rem,18vw,5.5rem)] rounded-xl border border-[var(--patient-gold-edge)] bg-white p-1 sm:h-20 sm:w-20"
                          />
                        ) : (
                          <div className="flex h-[clamp(3.5rem,18vw,5.5rem)] w-[clamp(3.5rem,18vw,5.5rem)] items-center justify-center rounded-xl border border-dashed border-[var(--patient-gold-edge)] bg-white/90 p-1 text-center text-[7px] font-semibold leading-3 text-[var(--patient-gold-ink)] sm:h-20 sm:w-20 sm:text-[8px]">
                            QR muncul<br />setelah RM<br />diterbitkan
                          </div>
                        )}
                        <div className="flex items-center gap-1.5 text-[var(--patient-gold-ink)] sm:gap-2.5">
                          <div className="flex flex-col items-center">
                            <ShieldCheck className="h-3.5 w-3.5 sm:h-6 sm:w-6" />
                            <span className="mt-0.5 text-[6px] sm:text-[9px]">Profesional</span>
                          </div>
                          <span className="h-6 w-px bg-[var(--patient-gold-edge)]/60" />
                          <div className="flex flex-col items-center">
                            <Heart className="h-3.5 w-3.5 sm:h-6 sm:w-6" />
                            <span className="mt-0.5 text-[6px] sm:text-[9px]">Modern</span>
                          </div>
                          <span className="h-6 w-px bg-[var(--patient-gold-edge)]/60" />
                          <div className="flex flex-col items-center">
                            <CheckCircle2 className="h-3.5 w-3.5 sm:h-6 sm:w-6" />
                            <span className="mt-0.5 text-[6px] sm:text-[9px]">Terpercaya</span>
                          </div>
                        </div>
                        <a href="https://laladentist.id" target="_blank" rel="noreferrer" className="text-[6px] font-semibold tracking-[0.08em] text-[var(--patient-gold-ink)] sm:text-[9px]">
                          laladentist.id
                        </a>
                      </div>
                    </div>
                  </article>
                  {patientCardProfile.internalPatientCode ? (
                    <div className="mx-auto mt-3 flex max-w-xl items-start gap-2.5 rounded-2xl border border-emerald-100 bg-emerald-50/80 p-3 text-[10px] leading-4 text-emerald-950 sm:text-xs sm:leading-5">
                      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
                      <p>Tunjukkan QR ini kepada petugas klinik saat verifikasi pasien.</p>
                    </div>
                  ) : (
                    <div role="status" className="mx-auto mt-3 flex max-w-xl items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-[10px] leading-4 text-amber-900 sm:text-xs sm:leading-5">
                      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                      <p>
                        {patientCardProfile.medicalRecordNumber.trim()
                          ? "No. RM sudah ada, tetapi kode cabang belum tertaut. Minta admin memeriksa data RM cabang."
                          : "Kartu akan aktif setelah check-in pertama berhasil menerbitkan No. RM cabang."}
                        <button
                          type="button"
                          onClick={() => setPatientCardRefreshKey((key) => key + 1)}
                          className="ml-1 font-bold underline underline-offset-2"
                        >
                          Periksa lagi
                        </button>
                      </p>
                    </div>
                  )}
                  {patientCardDownloadError && (
                    <p role="alert" className="mx-auto mt-2 max-w-xl text-xs text-rose-700">{patientCardDownloadError}</p>
                  )}
                </>
              ) : (
                renderLinkNotice("Kartu pasien digital")
              )}
            </section>

            <section className="patient-portal-home-panels mt-5 grid items-stretch gap-4 md:grid-cols-2" aria-label="Antrean dan konsultasi">
              {loadWarnings.includes("queue_items") ? (
                <article className="patient-portal-card rounded-3xl border border-rose-200 bg-white p-5 sm:p-6">
                  <p className="text-xs font-bold uppercase tracking-wider text-[var(--patient-gold-ink)]">Status antrean</p>
                  <p role="alert" className="mt-3 rounded-xl bg-red-50 p-4 text-xs text-red-700">Status antrean gagal dimuat. Muat ulang halaman atau coba kembali nanti.</p>
                </article>
              ) : activePatientQueue ? (
                renderQueueStatus(activePatientQueue, true)
              ) : (
                <article className="patient-portal-queue-panel patient-portal-card overflow-hidden rounded-3xl border border-[var(--patient-gold-edge)] bg-white p-5 sm:p-6">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-[var(--patient-gold-ink)]">Status antrean</p>
                      <h2 className="mt-1 text-base font-bold text-slate-900">Antrean klinik</h2>
                    </div>
                    <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--patient-gold-light)] to-[var(--patient-gold-light)] text-[var(--patient-gold-deep)]">
                      <ListOrdered className="h-5 w-5" />
                    </span>
                  </div>
                  {activePatientBooking ? (
                    <div className="patient-portal-queue-preview rounded-2xl border p-4">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs font-semibold text-[var(--patient-gold-ink)]">Nomor antrean</span>
                        <span className="rounded-full bg-white/80 px-2.5 py-1 text-[10px] font-bold text-[var(--patient-gold-ink)]">Belum check-in</span>
                      </div>
                      <p className="mt-1 text-4xl font-extrabold tracking-tight text-[var(--patient-gold-ink)]">—</p>
                      <p className="mt-2 text-xs font-semibold text-[var(--patient-gold-ink)]">
                        {bookingQueueEstimate
                          ? `Estimasi ${bookingQueueEstimate.patientsAhead} pasien sebelum Anda`
                          : "Nomor resmi diberikan petugas setelah check-in"}
                      </p>
                      {bookingQueueEstimate?.estimatedServiceAt && (
                        <p className="mt-1 text-[11px] text-[var(--patient-gold-ink)]">Perkiraan dilayani {formatAppointmentDate(bookingQueueEstimate.estimatedServiceAt)}</p>
                      )}
                      <p className="mt-3 border-t border-[var(--patient-gold-edge)]/20 pt-3 text-[10px] leading-5 text-[var(--patient-gold-ink)]">
                        {bookingQueueEstimate
                          ? "Estimasi diperbarui berkala dan dapat berubah mengikuti kondisi klinik."
                          : "Setelah tiba, minta petugas klinik melakukan check-in resmi."}
                      </p>
                      {bookingQueueEstimateError && (
                        <p role="alert" className="mt-2 text-[11px] text-rose-700">{bookingQueueEstimateError}</p>
                      )}
                    </div>
                  ) : currentUser?.patientId ? (
                    <div className="patient-portal-queue-preview rounded-2xl border p-4">
                      <span className="rounded-full bg-white/80 px-2.5 py-1 text-[10px] font-bold text-[var(--patient-gold-ink)]">Belum ada antrean aktif</span>
                      <p className="mt-3 text-sm font-semibold text-[var(--patient-gold-ink)]">Nomor antrean tampil setelah check-in di klinik.</p>
                      <button
                        type="button"
                        onClick={() => setSection("appointments")}
                        className="patient-portal-primary mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition hover:brightness-95"
                      >
                        <CalendarPlus className="h-4 w-4" /> Buat janji
                      </button>
                    </div>
                  ) : (
                    renderLinkNotice("Status antrean")
                  )}
                </article>
              )}

              <div className="patient-portal-consultation-panel">
                {isLoadingBookings ? (
                  <div className="h-full rounded-3xl border border-[var(--patient-gold-edge)] bg-white p-5 text-xs text-slate-500">Memuat janji temu...</div>
                ) : upcomingBooking || activePatientBooking ? (
                  renderBookingCard(upcomingBooking || activePatientBooking!, true)
                ) : currentUser?.patientId ? (
                  <article className="patient-portal-upcoming-empty flex h-full min-h-52 flex-col items-start justify-between rounded-3xl border p-5 sm:p-6">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-[var(--patient-gold-ink)]">Konsultasi mendatang</p>
                      <h2 className="mt-2 text-lg font-bold text-[var(--patient-gold-ink)]">Belum ada jadwal konsultasi</h2>
                      <p className="mt-2 text-xs leading-5 text-[var(--patient-gold-ink)]">Janji temu yang dikonfirmasi klinik akan tampil di sini.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSection("appointments")}
                      className="patient-portal-primary mt-5 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition hover:brightness-95"
                    >
                      <CalendarPlus className="h-4 w-4" /> Buat janji
                    </button>
                  </article>
                ) : (
                  renderLinkNotice("Jadwal dan riwayat janji temu")
                )}
                {upcomingBooking && (
                  <button
                    type="button"
                    onClick={() => setSection("appointments")}
                    className="mt-3 inline-flex items-center gap-2 text-xs font-bold text-[var(--patient-gold-ink)] hover:underline"
                  >
                    Buka semua janji temu <span aria-hidden="true">→</span>
                  </button>
                )}
              </div>
            </section>

            <section className="mt-4 grid gap-4 lg:grid-cols-[1.35fr_0.85fr]">
              <article className="patient-portal-card rounded-3xl border border-[var(--patient-gold-edge)] bg-white p-5 sm:p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Aktivitas</p>
                    <h2 className="mt-1 text-lg font-bold text-slate-900">Riwayat perawatan</h2>
                  </div>
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--patient-gold-light)] to-[var(--patient-gold-light)] text-[var(--patient-gold-deep)]">
                    <History className="h-5 w-5" />
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setSection("history")}
                  className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-[var(--patient-gold-ink)] hover:underline"
                >
                  Buka riwayat perawatan <span aria-hidden="true">→</span>
                </button>
              </article>

              <article className="patient-portal-card rounded-3xl border border-[var(--patient-gold-edge)] bg-white p-5 sm:p-6">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--patient-gold-light)] to-[var(--patient-gold-light)] text-[var(--patient-gold-deep)]">
                    <UserRound className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Akun Anda</p>
                    <h2 className="text-base font-bold text-slate-900">Informasi profil</h2>
                  </div>
                </div>
                <p className="mt-4 text-xs leading-5 text-slate-500">Periksa nama dan email yang digunakan untuk masuk ke portal pasien.</p>
                <button
                  type="button"
                  onClick={() => setSection("profile")}
                className="mt-4 rounded-xl border border-[var(--patient-gold-edge)] px-4 py-2.5 text-xs font-bold text-[var(--patient-gold-ink)] transition hover:bg-[var(--patient-gold-light)]"
                >
                  Buka profil
                </button>
              </article>
            </section>

            <section className="patient-portal-card mt-4 flex flex-col gap-3 rounded-2xl border border-[var(--patient-gold-edge)] bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--patient-gold-soft)] text-[var(--patient-gold-deep)]">
                  <CircleHelp className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Butuh bantuan?</h2>
                  <p className="mt-1 text-xs leading-5 text-slate-500">Hubungi staf klinik untuk bantuan akun atau perubahan janji temu.</p>
                </div>
              </div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Dukungan pasien</span>
            </section>
          </>
        )}

        {section === "appointments" && (
          <section>
            <div className="patient-portal-page-heading mb-3 sm:mb-6">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--patient-gold-deep)]">Portal pasien</p>
              <h1 className="mt-0.5 text-xl font-extrabold tracking-tight text-slate-900 sm:mt-1 sm:text-2xl">Buat Janji</h1>
              <p className="mt-1 text-xs text-slate-500 sm:mt-2 sm:text-sm">Pilih cabang klinik, dokter, tanggal, dan waktu untuk mengajukan janji temu.</p>
            </div>
            {currentUser?.patientId ? (
              <>
              {activeBranches.length === 0 && (
                <p role="alert" className="mb-4 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                  Belum ada cabang aktif yang dapat dipilih. Silakan hubungi klinik.
                </p>
              )}
              {!isLoadingBookings && activePatientBooking && (
                <p role="alert" className="mb-4 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                  Anda masih memiliki janji temu aktif berstatus <strong>{bookingStatusLabel[activePatientBooking.status]}</strong> pada {formatAppointmentDate(activePatientBooking.bookingDateTime)}. Hubungi klinik untuk menyelesaikan atau membatalkannya sebelum membuat janji temu baru.
                </p>
              )}
              <form onSubmit={handleCreatePatientBooking} className="patient-portal-card mb-4 rounded-2xl border border-[var(--patient-gold-edge)] bg-white p-3 sm:mb-6 sm:rounded-3xl sm:p-6">
                <div className="mb-3 flex items-start gap-2.5 sm:mb-5 sm:gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--patient-gold-soft)] text-[var(--patient-gold-deep)] sm:h-10 sm:w-10">
                    <CalendarPlus className="h-4 w-4 sm:h-5 sm:w-5" />
                  </span>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900 sm:text-base">Buat Janji</h2>
                    <p className="mt-0.5 text-[10px] leading-4 text-slate-500 sm:mt-1 sm:text-xs sm:leading-5">Pilih salah satu cabang aktif. Permintaan akan dikirim ke klinik untuk dikonfirmasi.</p>
                  </div>
                </div>
                <div className="patient-portal-booking-fields grid grid-cols-2 gap-x-2 gap-y-2.5 sm:gap-4">
                  <label className="block min-w-0 text-[10px] font-semibold text-slate-700 sm:text-xs">
                    <span className="mb-1 flex min-h-4 items-center gap-1.5 sm:mb-1.5 sm:gap-2"><Building2 className="h-3.5 w-3.5 shrink-0 text-[var(--patient-gold-deep)] sm:h-4 sm:w-4" /> Cabang klinik</span>
                    <select
                      required
                      value={formBranchId}
                      onChange={(event) => {
                        setFormBranchId(event.target.value);
                        setFormDoctorId("");
                        setFormTimeSlot("");
                        setBookingSubmitError(null);
                      }}
                      disabled={activeBranches.length === 0}
                      className="h-10 w-full min-w-0 rounded-lg border border-[var(--patient-gold-edge)] bg-white px-2 py-2 text-xs font-medium text-slate-800 outline-none transition focus:border-[var(--patient-gold-edge)] focus:ring-2 focus:ring-[var(--patient-gold-light)] sm:h-auto sm:rounded-xl sm:px-3 sm:py-3 sm:text-sm"
                    >
                      <option value="">Pilih cabang</option>
                      {activeBranches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                    </select>
                  </label>
                  <label className="block min-w-0 text-[10px] font-semibold text-slate-700 sm:text-xs">
                    <span className="mb-1 flex min-h-4 items-center gap-1.5 sm:mb-1.5 sm:gap-2"><CalendarDays className="h-3.5 w-3.5 shrink-0 text-[var(--patient-gold-deep)] sm:h-4 sm:w-4" /> Tanggal</span>
                    <input
                      type="date"
                      required
                      min={getTodayDateString()}
                      value={formDate}
                      onChange={(event) => {
                        setFormDate(event.target.value);
                        setFormDoctorId("");
                        setFormTimeSlot("");
                        setBookingSubmitError(null);
                      }}
                      className="h-10 w-full min-w-0 rounded-lg border border-[var(--patient-gold-edge)] bg-white px-2 py-2 text-xs font-medium text-slate-800 outline-none transition focus:border-[var(--patient-gold-edge)] focus:ring-2 focus:ring-[var(--patient-gold-light)] sm:h-auto sm:rounded-xl sm:px-3 sm:py-3 sm:text-sm"
                    />
                  </label>
                  <label className="block min-w-0 text-[10px] font-semibold text-slate-700 sm:text-xs">
                    <span className="mb-1 flex min-h-4 items-center gap-1.5 sm:mb-1.5 sm:gap-2"><Stethoscope className="h-3.5 w-3.5 shrink-0 text-[var(--patient-gold-deep)] sm:h-4 sm:w-4" /> Dokter</span>
                    <select
                      required
                      value={formDoctorId}
                      onChange={(event) => {
                        setFormDoctorId(event.target.value);
                        setFormTimeSlot("");
                      }}
                      disabled={!formBranchId || isLoadingSchedules || availableDoctors.length === 0}
                      className="h-10 w-full min-w-0 rounded-lg border border-[var(--patient-gold-edge)] bg-white px-2 py-2 text-xs font-medium text-slate-800 outline-none transition focus:border-[var(--patient-gold-edge)] focus:ring-2 focus:ring-[var(--patient-gold-light)] disabled:bg-slate-50 disabled:text-slate-400 sm:h-auto sm:rounded-xl sm:px-3 sm:py-3 sm:text-sm"
                    >
                      <option value="">{isLoadingSchedules ? "Memuat dokter..." : "Pilih dokter"}</option>
                      {availableDoctors.map((doctor: DentalDoctor) => <option key={doctor.id} value={doctor.id}>{doctor.name}</option>)}
                    </select>
                  </label>
                  <label className="block min-w-0 text-[10px] font-semibold text-slate-700 sm:text-xs">
                    <span className="mb-1 flex min-h-4 items-center gap-1.5 sm:mb-1.5 sm:gap-2"><Clock className="h-3.5 w-3.5 shrink-0 text-[var(--patient-gold-deep)] sm:h-4 sm:w-4" /> Waktu</span>
                    <select
                      required
                      value={formTimeSlot}
                      onChange={(event) => setFormTimeSlot(event.target.value)}
                      disabled={!formDoctorId || isLoadingAvailableTimeSlots || availableTimeSlots.length === 0 || Boolean(slotAvailabilityError)}
                      className="h-10 w-full min-w-0 rounded-lg border border-[var(--patient-gold-edge)] bg-white px-2 py-2 text-xs font-medium text-slate-800 outline-none transition focus:border-[var(--patient-gold-edge)] focus:ring-2 focus:ring-[var(--patient-gold-light)] disabled:bg-slate-50 disabled:text-slate-400 sm:h-auto sm:rounded-xl sm:px-3 sm:py-3 sm:text-sm"
                    >
                      <option value="">
                        {isLoadingAvailableTimeSlots
                          ? "Memuat slot tersedia..."
                          : availableTimeSlots.length
                            ? "Pilih waktu"
                            : "Tidak ada waktu tersedia"}
                      </option>
                      {availableTimeSlots.map((slot) => <option key={slot} value={slot}>{slot} WIB</option>)}
                    </select>
                  </label>
                </div>
                {formBranchId && !isLoadingSchedules && !scheduleError && availableDoctors.length === 0 && (
                  <p className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> Belum ada jadwal dokter aktif pada cabang dan tanggal ini. Silakan pilih tanggal lain.
                  </p>
                )}
                {scheduleError && (
                  <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-xs leading-5 text-red-700">{scheduleError}</p>
                )}
                {slotAvailabilityError && (
                  <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-xs leading-5 text-red-700">{slotAvailabilityError}</p>
                )}
                {formDoctorId && availableTimeSlots.length === 0 && !isLoadingSchedules && !isLoadingAvailableTimeSlots && !slotAvailabilityError && (
                  <p className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                    <Clock className="mt-0.5 h-4 w-4 shrink-0" /> Tidak ada slot waktu mendatang untuk dokter ini pada tanggal tersebut.
                  </p>
                )}
                <label className="mt-2.5 block text-[10px] font-semibold text-slate-700 sm:mt-4 sm:text-xs">
                  <span className="mb-1 flex items-center gap-1.5 sm:mb-1.5 sm:gap-2"><MapPin className="h-3.5 w-3.5 text-[var(--patient-gold-deep)] sm:h-4 sm:w-4" /> Keluhan atau catatan (opsional)</span>
                  <textarea
                    value={formNotes}
                    onChange={(event) => setFormNotes(event.target.value)}
                    maxLength={1000}
                    rows={2}
                    placeholder="Ceritakan singkat keluhan atau kebutuhan perawatan Anda"
                    className="min-h-16 w-full resize-y rounded-lg border border-[var(--patient-gold-edge)] bg-white px-2.5 py-2 text-xs font-medium text-slate-800 outline-none transition placeholder:font-normal placeholder:text-slate-400 focus:border-[var(--patient-gold-edge)] focus:ring-2 focus:ring-[var(--patient-gold-light)] sm:min-h-20 sm:rounded-xl sm:px-3 sm:py-3 sm:text-sm"
                  />
                </label>
                {bookingSubmitError && <p role="alert" className="mt-2 rounded-xl bg-red-50 p-2.5 text-[11px] leading-4 text-red-700 sm:mt-4 sm:p-3 sm:text-xs sm:leading-5">{bookingSubmitError}</p>}
                {bookingSubmitSuccess && (
                  <p role="status" className="mt-2 flex items-start gap-2 rounded-xl bg-emerald-50 p-2.5 text-[11px] leading-4 text-emerald-800 sm:mt-4 sm:p-3 sm:text-xs sm:leading-5">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> {bookingSubmitSuccess}
                  </p>
                )}
                <div className="mt-3 flex flex-col gap-2 sm:mt-5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                  <p className="text-[10px] leading-4 text-slate-400 sm:text-[11px] sm:leading-5">Slot dikonfirmasi oleh sistem saat permintaan dikirim. Janji temu Anda berstatus menunggu konfirmasi klinik.</p>
                  <button
                    type="submit"
                    disabled={isSubmittingBooking || isLoadingBookings || isLoadingSchedules || !currentUser.patientId || activeBranches.length === 0 || !!activePatientBooking}
                    className="patient-portal-primary inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl px-4 py-2 text-xs font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-50 sm:px-5 sm:py-3"
                  >
                    <Send className="h-4 w-4" /> {isSubmittingBooking ? "Mengirim..." : isLoadingBookings ? "Memeriksa janji..." : "Ajukan janji temu"}
                  </button>
                </div>
              </form>
              </>
            ) : renderLinkNotice("Pembuatan janji temu")}
            {isLoadingBookings ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Memuat janji temu...</div>
            ) : !currentUser?.patientId ? (
              renderLinkNotice("Janji temu")
            ) : bookings.length ? (
              <div className="space-y-3">{bookings.map((booking) => renderBookingCard(booking))}</div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-7 text-center">
                <CalendarClock className="mx-auto h-8 w-8 text-[var(--patient-gold-deep)]" />
                <h2 className="mt-3 text-sm font-bold text-slate-900">Belum ada janji temu</h2>
                <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-slate-500">Gunakan formulir di atas untuk mengajukan jadwal kunjungan pertama Anda.</p>
              </div>
            )}
            {currentUser?.patientId && (
              <div className="mt-5">
                {loadWarnings.includes("queue_items") ? (
                  <p role="alert" className="rounded-xl bg-red-50 p-4 text-xs text-red-700">Status antrean gagal dimuat. Silakan muat ulang halaman.</p>
                ) : activePatientQueue ? (
                  renderQueueStatus(activePatientQueue)
                ) : null}
              </div>
            )}
            <p className="mt-5 text-xs leading-5 text-slate-400">Untuk perubahan atau pembatalan janji temu, silakan hubungi cabang klinik yang dipilih.</p>
          </section>
        )}

        {section === "queue" && (
          <section aria-label="Antrean pasien">
            <div className="patient-portal-page-heading mb-6">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--patient-gold-deep)]">Portal pasien</p>
              <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900">Antrean klinik</h1>
              <p className="mt-2 text-sm text-slate-500">Pantau status dan perkiraan giliran antrean Anda hari ini.</p>
            </div>
            {!currentUser?.patientId ? renderLinkNotice("Status antrean") : loadWarnings.includes("queue_items") ? (
              <p role="alert" className="rounded-xl bg-red-50 p-4 text-xs text-red-700">Status antrean gagal dimuat. Silakan muat ulang halaman atau coba kembali nanti.</p>
            ) : activePatientQueue ? (
              renderQueueStatus(activePatientQueue)
            ) : (
              <article className="rounded-2xl border border-dashed border-slate-300 bg-white p-7 text-center">
                <ListOrdered className="mx-auto h-8 w-8 text-[var(--patient-gold-deep)]" />
                <h2 className="mt-3 text-sm font-bold text-slate-900">Belum ada antrean aktif</h2>
                <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-slate-500">
                  Nomor antrean dan estimasi giliran akan tampil setelah Anda check-in di cabang klinik.
                </p>
                {mostRecentQueue && (
                  <p className="mt-3 text-[11px] text-slate-400">
                    Antrean terakhir: nomor {mostRecentQueue.queueNumber} · {queueStatusLabel[mostRecentQueue.status] || mostRecentQueue.status}
                  </p>
                )}
              </article>
            )}
          </section>
        )}

        {section === "history" && (
          <section>
            <div className="patient-portal-page-heading mb-6">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--patient-gold-deep)]">Portal pasien</p>
              <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900">Riwayat perawatan</h1>
              <p className="mt-2 text-sm text-slate-500">Kunjungan dan tindakan perawatan di klinik.</p>
            </div>
            {!currentUser?.patientId ? renderLinkNotice("Riwayat perawatan") : (
              <div className="space-y-8">
                {loadWarnings.some((table) => ["patient_visits", "invoices", "payment_transactions"].includes(table)) && (
                  <p role="alert" className="rounded-xl bg-red-50 p-4 text-xs leading-5 text-red-700">
                    Sebagian riwayat gagal dimuat ({loadWarnings.filter((table) => ["patient_visits", "invoices", "payment_transactions"].includes(table)).join(", ")}). Data yang tampil mungkin belum lengkap.
                  </p>
                )}

                <section>
                  <div className="mb-3 flex items-center gap-2">
                    <History className="h-5 w-5 text-[var(--patient-gold-deep)]" />
                    <h2 className="text-base font-bold text-slate-900">Kunjungan</h2>
                  </div>
                  {patientVisits.length ? (
                    <div className="space-y-3">{patientVisits.map(renderVisitCard)}</div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-xs text-slate-500">
                      Belum ada kunjungan yang tercatat.
                    </div>
                  )}
                </section>

                <section>
                  <div className="mb-3 flex items-center gap-2">
                    <FileText className="h-5 w-5 text-[var(--patient-gold-deep)]" />
                    <h2 className="text-base font-bold text-slate-900">Tagihan dan kuitansi</h2>
                  </div>
                  {invoiceItemsError && <p role="alert" className="mb-3 rounded-xl bg-red-50 p-3 text-xs text-red-700">{invoiceItemsError}</p>}
                  {patientInvoices.length ? (
                    <div className="space-y-3">{patientInvoices.map(renderInvoiceCard)}</div>
                  ) : loadWarnings.includes("invoices") ? (
                    <p role="alert" className="rounded-xl bg-red-50 p-4 text-xs text-red-700">Tagihan gagal dimuat. Silakan coba lagi nanti.</p>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center">
                      <Receipt className="mx-auto h-7 w-7 text-[var(--patient-gold-deep)]" />
                      <p className="mt-2 text-xs text-slate-500">Belum ada tagihan atau kuitansi.</p>
                    </div>
                  )}
                </section>
              </div>
            )}
          </section>
        )}

        {section === "profile" && (
          <section>
            <div className="patient-portal-page-heading mb-6">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--patient-gold-deep)]">Portal pasien</p>
              <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900">Profil</h1>
              <p className="mt-2 text-sm text-slate-500">Informasi akun yang digunakan untuk masuk ke portal pasien.</p>
            </div>
            <section className="mb-6 max-w-3xl" aria-labelledby="patient-card-heading">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#17233c] text-[var(--patient-gold-mid)] shadow-sm">
                    <CreditCard className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 id="patient-card-heading" className="text-base font-bold text-slate-900">Kartu Pasien Digital</h2>
                    <p className="mt-0.5 text-xs text-slate-500">Identitas pasien dan QR untuk verifikasi di klinik.</p>
                  </div>
                </div>
                {patientCardProfile?.internalPatientCode && patientCardQrCode && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handlePrintPatientCard}
                      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[var(--patient-gold-edge)] bg-white px-4 py-2 text-xs font-bold text-[var(--patient-gold-ink)] shadow-sm transition hover:border-[var(--patient-gold-edge)] hover:bg-[var(--patient-gold-light)]"
                    >
                      <Printer className="h-4 w-4" />
                      Cetak kartu
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDownloadPatientCard()}
                      disabled={isDownloadingPatientCard}
                      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[var(--patient-gold-edge)] bg-white px-4 py-2 text-xs font-bold text-[var(--patient-gold-ink)] shadow-sm transition hover:border-[var(--patient-gold-edge)] hover:bg-[var(--patient-gold-light)] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Download className="h-4 w-4" />
                      {isDownloadingPatientCard ? "Menyiapkan kartu..." : "Unduh kartu PNG"}
                    </button>
                  </div>
                )}
              </div>
              {isLoadingPatientCardProfile && !patientCardProfile ? (
                <div role="status" className="rounded-2xl border border-slate-200 bg-white p-5 text-xs text-slate-500 shadow-sm">
                  Memuat kartu pasien...
                </div>
              ) : patientCardProfileError ? (
                <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900">
                  <p>{patientCardProfileError}</p>
                  <button
                    type="button"
                    onClick={() => setPatientCardRefreshKey((key) => key + 1)}
                    className="mt-2 font-bold underline underline-offset-2"
                  >
                    Coba muat ulang
                  </button>
                </div>
              ) : patientCardProfile ? (
                <>
                  <article id="patient-card-printable" ref={patientCardRef} className="patient-portal-digital-card mx-auto rounded-3xl" aria-label="Kartu identitas pasien digital">
                    <div className="patient-portal-digital-card-header relative flex h-[30%] items-center gap-2.5 overflow-hidden px-4 sm:gap-3 sm:px-6">
                      <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white p-1 shadow-sm ring-1 ring-[var(--patient-gold-edge)] sm:h-14 sm:w-14">
                        <LalaLogo src={branding?.logoUrl || "/logo-lala.svg"} className="h-full w-full" />
                      </span>
                      <div className="relative min-w-0 flex-1">
                        <p className="truncate text-base font-extrabold tracking-wide text-[var(--patient-gold-ink)] sm:text-2xl">{clinicName}</p>
                        <p className="mt-0.5 truncate text-[7px] font-medium tracking-[0.12em] text-[var(--patient-gold-ink)] sm:text-[10px] sm:tracking-[0.2em]">Senyum indah dimulai di Laladentist</p>
                      </div>
                      <div className="relative ml-auto shrink-0 text-right">
                        <p className="text-[8px] font-extrabold uppercase tracking-[0.16em] text-[var(--patient-gold-deep)] sm:text-xs">Kartu Pasien</p>
                        <p className="text-[7px] uppercase tracking-[0.18em] text-[var(--patient-gold-deep)] sm:text-[10px]">Patient Card</p>
                      </div>
                    </div>
                    <div className="patient-portal-digital-card-body relative z-[1] grid h-[70%] min-h-0 grid-cols-[minmax(0,1fr)_auto] gap-2 px-4 pb-3 pt-2 sm:gap-4 sm:px-6 sm:pb-5 sm:pt-3">
                      <div className="flex min-w-0 flex-col justify-between">
                        <div className="min-w-0">
                          <p className="text-[8px] font-medium tracking-[0.08em] text-[var(--patient-gold-ink)] sm:text-sm">Nama Pasien</p>
                          <p className="mt-0.5 break-words text-sm font-bold leading-tight text-[#292722] sm:text-3xl">
                            {patientCardProfile.fullName || patientCardProfile.name || "Pasien"}
                          </p>
                          <div className="mt-2 flex min-w-0 items-start divide-x divide-[var(--patient-gold-edge)] sm:mt-3">
                            <div className="min-w-0 pr-2 sm:pr-4">
                              <p className="text-[7px] text-[var(--patient-gold-ink)] sm:text-xs">No. Pasien</p>
                              <p className="mt-0.5 break-all text-[10px] font-semibold leading-tight text-[#292722] sm:text-xl">
                                {patientCardProfile.internalPatientCode || "Akan diterbitkan"}
                              </p>
                            </div>
                            <div className="min-w-0 pl-2 sm:pl-4">
                              <p className="text-[7px] text-[var(--patient-gold-ink)] sm:text-xs">Tanggal Lahir</p>
                              <p className="mt-0.5 text-[10px] font-semibold leading-tight text-[#292722] sm:text-xl">
                                {patientCardProfile.dateOfBirth
                                  ? new Intl.DateTimeFormat("id-ID", {
                                      day: "numeric",
                                      month: "short",
                                      year: "numeric"
                                    }).format(new Date(`${patientCardProfile.dateOfBirth}T00:00:00`))
                                  : "—"}
                              </p>
                            </div>
                          </div>
                        </div>
                        <p className="max-w-[150px] pb-0.5 text-[7px] leading-3 tracking-wide text-[var(--patient-gold-ink)] sm:max-w-[220px] sm:text-sm sm:leading-5">
                          Perawatan terbaik<br />untuk senyum Anda
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-center justify-center gap-2">
                        {patientCardQrCode ? (
                          <img
                            src={patientCardQrCode}
                            alt="QR kartu pasien berdasarkan kode RM"
                            className="h-[clamp(3.5rem,18vw,5.5rem)] w-[clamp(3.5rem,18vw,5.5rem)] rounded-xl border border-[var(--patient-gold-edge)] bg-white p-1 sm:h-20 sm:w-20"
                          />
                        ) : (
                          <div className="flex h-[clamp(3.5rem,18vw,5.5rem)] w-[clamp(3.5rem,18vw,5.5rem)] items-center justify-center rounded-xl border border-dashed border-[var(--patient-gold-edge)] bg-white/90 p-1 text-center text-[7px] font-semibold leading-3 text-[var(--patient-gold-ink)] sm:h-20 sm:w-20 sm:text-[8px]">
                            QR muncul<br />setelah RM<br />diterbitkan
                          </div>
                        )}
                        <div className="flex items-center gap-1.5 text-[var(--patient-gold-ink)] sm:gap-2.5">
                          <div className="flex flex-col items-center">
                            <ShieldCheck className="h-3.5 w-3.5 sm:h-6 sm:w-6" />
                            <span className="mt-0.5 text-[6px] sm:text-[9px]">Profesional</span>
                          </div>
                          <span className="h-6 w-px bg-[var(--patient-gold-edge)]/60" />
                          <div className="flex flex-col items-center">
                            <Heart className="h-3.5 w-3.5 sm:h-6 sm:w-6" />
                            <span className="mt-0.5 text-[6px] sm:text-[9px]">Modern</span>
                          </div>
                          <span className="h-6 w-px bg-[var(--patient-gold-edge)]/60" />
                          <div className="flex flex-col items-center">
                            <CheckCircle2 className="h-3.5 w-3.5 sm:h-6 sm:w-6" />
                            <span className="mt-0.5 text-[6px] sm:text-[9px]">Terpercaya</span>
                          </div>
                        </div>
                        <a
                          href="https://laladentist.id"
                          target="_blank"
                          rel="noreferrer"
                          className="text-[6px] font-semibold tracking-[0.08em] text-[var(--patient-gold-ink)] sm:text-[9px]"
                        >
                          laladentist.id
                        </a>
                      </div>
                    </div>
                  </article>
                  {patientCardProfile.internalPatientCode ? (
                    <div className="mx-auto mt-4 flex max-w-xl items-start gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/80 p-3.5 text-xs leading-5 text-emerald-950">
                      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
                      <p>Tunjukkan atau cetak kartu ini. QR berisi kode RM bercabang dan dapat dipindai di cabang lain; petugas akan memeriksa booking hari ini sebelum melanjutkan check-in.</p>
                    </div>
                  ) : (
                    <div role="status" className="mx-auto mt-4 flex max-w-xl items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-3.5 text-xs leading-5 text-amber-900">
                      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                      <p>
                        {patientCardProfile.medicalRecordNumber.trim()
                          ? "No. RM sudah ada, tetapi kode cabang belum tertaut. Minta admin memeriksa data RM cabang."
                          : "Kartu akan aktif setelah check-in pertama berhasil menerbitkan No. RM cabang."}
                        <button
                          type="button"
                          onClick={() => setPatientCardRefreshKey((key) => key + 1)}
                          className="ml-1 font-bold underline underline-offset-2"
                        >
                          Periksa lagi
                        </button>
                      </p>
                    </div>
                  )}
                  {patientCardDownloadError && (
                    <p role="alert" className="mx-auto mt-2 max-w-xl text-xs text-rose-700">{patientCardDownloadError}</p>
                  )}
                </>
              ) : (
                renderLinkNotice("Kartu pasien digital")
              )}
            </section>
            <article className="mt-5 max-w-2xl rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
              <div className="flex items-center gap-3 border-b border-slate-100 pb-5">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--patient-gold-light)] text-sm font-bold text-[var(--patient-gold-ink)]">{initials}</span>
                <div>
                  <h2 className="text-base font-bold text-slate-900">{patientName}</h2>
                  <p className="text-xs text-slate-500">Akun pasien</p>
                </div>
              </div>
              <dl className="mt-5 space-y-4">
                <div>
                  <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Nama</dt>
                  <dd className="mt-1 break-words text-sm font-medium text-slate-700">{patientName}</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Email akun</dt>
                  <dd className="mt-1 break-all text-sm font-medium text-slate-700">{currentUser?.email || "—"}</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Keterhubungan profil pasien</dt>
                  <dd className="mt-1 text-sm font-medium text-slate-700">
                    {currentUser?.patientId ? "Terhubung" : "Belum ditautkan oleh klinik"}
                  </dd>
                </div>
              </dl>
              <div className="mt-5 flex items-start gap-2 rounded-xl bg-emerald-50 p-3 text-[11px] leading-5 text-emerald-800">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                <p>Untuk melindungi privasi, rekam medis hanya ditampilkan setelah klinik memastikan akun terhubung ke profil pasien yang benar.</p>
              </div>
              <form onSubmit={(event) => void handleChangePassword(event)} className="mt-6 space-y-4 border-t border-slate-100 pt-5">
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                    <Lock className="h-4 w-4 text-[var(--patient-gold-deep)]" />
                    Ubah Kata Sandi
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-slate-500">Verifikasi dengan kata sandi saat ini sebelum menyimpan yang baru.</p>
                </div>
                {passwordError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-xs text-red-700">{passwordError}</p>}
                {passwordSuccess && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-xs text-emerald-700">{passwordSuccess}</p>}
                <label className="block space-y-1.5 text-xs font-semibold text-slate-600">
                  Kata sandi saat ini
                  <span className="relative block">
                    <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="password"
                      autoComplete="current-password"
                      value={currentPassword}
                      onChange={(event) => setCurrentPassword(event.target.value)}
                      required
                      disabled={isChangingPassword}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-3 text-sm text-slate-800 outline-none transition focus:border-[var(--patient-gold-deep)] focus:bg-white"
                    />
                  </span>
                </label>
                <label className="block space-y-1.5 text-xs font-semibold text-slate-600">
                  Kata sandi baru
                  <span className="relative block">
                    <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="password"
                      autoComplete="new-password"
                      minLength={8}
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      required
                      disabled={isChangingPassword}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-3 text-sm text-slate-800 outline-none transition focus:border-[var(--patient-gold-deep)] focus:bg-white"
                    />
                  </span>
                </label>
                <label className="block space-y-1.5 text-xs font-semibold text-slate-600">
                  Konfirmasi kata sandi baru
                  <span className="relative block">
                    <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="password"
                      autoComplete="new-password"
                      minLength={8}
                      value={confirmNewPassword}
                      onChange={(event) => setConfirmNewPassword(event.target.value)}
                      required
                      disabled={isChangingPassword}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-3 text-sm text-slate-800 outline-none transition focus:border-[var(--patient-gold-deep)] focus:bg-white"
                    />
                  </span>
                </label>
                <button
                  type="submit"
                  disabled={isChangingPassword}
                  className="patient-portal-primary inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isChangingPassword ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <Lock className="h-4 w-4" />}
                  {isChangingPassword ? "Menyimpan..." : "Simpan Kata Sandi Baru"}
                </button>
              </form>
            </article>
          </section>
        )}

        <footer className="patient-portal-footer py-7 text-center text-[10px] text-slate-400">
          © {new Date().getFullYear()} {clinicName} · Portal Pasien
        </footer>
      </div>

      <nav aria-label="Navigasi portal pasien" className="patient-portal-mobile-nav fixed inset-x-0 bottom-0 z-20 border-t px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 backdrop-blur md:hidden">
        <div className="mx-auto flex w-full max-w-lg items-center justify-around">
          {patientNavigation.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              aria-current={section === id ? "page" : undefined}
              onClick={() => setSection(id)}
              className={`patient-portal-nav-item flex min-w-0 flex-1 flex-col items-center gap-1 rounded-2xl px-1 py-2 text-[10px] font-semibold transition ${
                section === id ? "patient-portal-nav-active text-[var(--patient-gold-ink)]" : "text-[var(--patient-gold-ink)] hover:bg-white/45 hover:text-[var(--patient-gold-ink)]"
              }`}
            >
              <Icon className={`h-5 w-5 ${section === id ? "text-[var(--patient-gold-ink)]" : "text-[var(--patient-gold-ink)]"}`} />
              {label}
            </button>
          ))}
        </div>
      </nav>
    </main>
  );
};
