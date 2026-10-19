import React, { useEffect, useMemo, useState } from "react";
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
  FileText,
  History,
  Home,
  KeyRound,
  ListOrdered,
  Lock,
  LogOut,
  MapPin,
  Receipt,
  Send,
  ShieldCheck,
  Sparkles,
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
  QueueItem,
  QueueStatus,
  ScheduleStatus,
  UserRole
} from "../types/domain";
import { getTodayDateString, getTomorrowDateString, getOperationalDateString, toOperationalDateTime } from "../utils/dateUtils";
import { getScheduledBookingTimeSlots } from "../utils/bookingScheduleUtils";
import { getVisitStatusForQueueStatus } from "../utils/bookingQueueGuards";
import { getVisiblePromotions } from "../utils/promotionUtils";

type PatientSection = "home" | "appointments" | "queue" | "history" | "profile";

const patientNavigation: { id: PatientSection; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "home", label: "Beranda", icon: Home },
  { id: "appointments", label: "Buat Janji", icon: CalendarDays },
  { id: "queue", label: "Antrean", icon: ListOrdered },
  { id: "history", label: "Riwayat", icon: History },
  { id: "profile", label: "Profil", icon: UserRound }
];

const activeBookingStatuses = new Set([BookingStatus.PENDING, BookingStatus.CONFIRMED, BookingStatus.RESCHEDULED]);
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
  const [isLoadingSchedules, setIsLoadingSchedules] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [bookingSubmitError, setBookingSubmitError] = useState<string | null>(null);
  const [bookingSubmitSuccess, setBookingSubmitSuccess] = useState<string | null>(null);
  const [isSubmittingBooking, setIsSubmittingBooking] = useState(false);
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
  const isLoadingBookings = loading;
  const bookingError = loadWarnings.includes("bookings")
    ? "Gagal memuat janji temu pasien. Silakan coba muat ulang."
    : null;
  const clinicName = branding?.name || "Lala Dentist";
  const patientName = currentUser?.name || "Pasien";
  const initials = patientName.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "P";
  const activeBranches = branches.filter((branch) => branch.isActive && branch.active !== false);
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
  const availableTimeSlots = getScheduledBookingTimeSlots(selectedSchedule).filter((slot) => {
    if (!formDate) return false;
    const slotDateTime = new Date(`${formDate}T${slot}:00+07:00`);
    return !Number.isNaN(slotDateTime.getTime()) && slotDateTime.getTime() > Date.now();
  });

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
      .filter((booking) => activeBookingStatuses.has(booking.status))
      .sort((a, b) => new Date(a.bookingDateTime).getTime() - new Date(b.bookingDateTime).getTime())[0]
    : undefined;

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

  const renderBookingCard = (booking: Booking) => (
    <article key={booking.id} className="patient-portal-card rounded-2xl border border-[#d8c79d] bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Janji temu</p>
          <h3 className="mt-1 text-base font-bold text-slate-900">
            {booking.plannedTreatments?.map((item) => item.serviceNameSnapshot).filter(Boolean).join(", ") || "Perawatan gigi"}
          </h3>
        </div>
        <span className="rounded-full bg-[#f3e8c9] px-3 py-1 text-[10px] font-bold text-[#775a21]">
          {bookingStatusLabel[booking.status]}
        </span>
      </div>
      <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
        <div className="flex items-start gap-2 text-slate-600">
          <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-[#987b3b]" />
          <div>
            <dt className="font-semibold text-slate-400">Waktu</dt>
            <dd className="mt-0.5 font-medium text-slate-700">{formatAppointmentDate(booking.bookingDateTime)}</dd>
          </div>
        </div>
        <div className="flex items-start gap-2 text-slate-600">
          <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-[#987b3b]" />
          <div>
            <dt className="font-semibold text-slate-400">Dokter dan cabang</dt>
            <dd className="mt-0.5 font-medium text-slate-700">
              {booking.doctorNameSnapshot || "Dokter"} · {booking.branchNameSnapshot || "Cabang klinik"}
            </dd>
          </div>
        </div>
      </dl>
    </article>
  );

  const renderQueueStatus = (item: QueueItem) => {
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
    <article key={item.id} className="patient-portal-queue-card rounded-3xl border p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#76591f]">Antrean klinik</p>
          <h3 className="mt-1 text-xl font-extrabold tracking-tight text-[#493919]">Nomor antrean {item.queueNumber}</h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-[#b28a3d]/30 bg-white/75 px-3 py-1 text-[10px] font-bold text-[#684b16]">
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
          <dt className="font-semibold text-[#76591f]">Dokter</dt>
          <dd className="mt-1 font-semibold text-[#493919]">{doctorName}</dd>
        </div>
        <div>
          <dt className="font-semibold text-[#76591f]">Perkiraan giliran</dt>
          <dd className="mt-1 font-semibold text-[#493919]">
            {item.estimatedServiceAt
              ? formatAppointmentDate(item.estimatedServiceAt)
              : "Menunggu perhitungan antrean"}
          </dd>
        </div>
      </dl>
      <p className="mt-3 text-[10px] leading-5 text-[#76591f]">
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
              <Receipt className="h-4 w-4 text-[#987b3b]" /> Kuitansi pembayaran
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
    <main className="patient-portal-shell min-h-screen pb-28 text-slate-900 md:pb-0">
      <header className="patient-portal-header sticky top-0 z-10 border-b border-[#e3d6b8] bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <div className="patient-portal-logo-mark flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full">
              <LalaLogo src={branding?.logoUrl || "/logo-lala.svg"} className="h-full w-full scale-[1.4]" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-extrabold tracking-tight text-[#59421f] sm:text-base">{clinicName}</p>
              <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-[#806b42] sm:text-[10px]">Portal Pasien</p>
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
                  section === id ? "patient-portal-nav-active text-[#493919]" : "text-[#69552f] hover:bg-white/60 hover:text-[#493919]"
                }`}
              >
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
          </nav>
          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden text-right sm:block">
              <span className="block max-w-40 truncate text-xs font-semibold text-slate-700">{patientName}</span>
              <span className="block text-[10px] text-slate-400">Akun pasien</span>
            </span>
            <span className="patient-portal-avatar flex h-10 w-10 items-center justify-center rounded-full text-sm font-extrabold text-[#684b16]" aria-label={`Inisial ${initials}`}>
              {initials}
            </span>
            <button
              type="button"
              onClick={() => void handleSignOut()}
              disabled={isSigningOut}
              aria-label={isSigningOut ? "Sedang keluar" : "Keluar"}
              className="patient-portal-signout ml-1 inline-flex h-10 w-10 items-center justify-center rounded-xl border transition disabled:opacity-50 sm:w-auto sm:px-3"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">{isSigningOut ? "Keluar..." : "Keluar"}</span>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-9">
        {error && <div role="alert" className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">{error}</div>}
        {bookingError && <div role="alert" className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">{bookingError}</div>}
        {section === "home" && loadWarnings.includes("promotion_media") && (
          <div role="alert" className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            Media promosi belum dapat dimuat. Coba muat ulang halaman.
          </div>
        )}

        {section === "home" && (
          <>
            <div className="patient-portal-welcome mb-5 overflow-hidden rounded-3xl border border-[#eadfc9] bg-white px-5 py-4 shadow-sm sm:px-6 sm:py-5">
              <div className="relative z-[1] flex items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#fff8e8] to-[#ead7aa] text-[#92702d] shadow-inner">
                  <Sparkles className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#806b42]">Selamat datang kembali</p>
                  <h1 className="mt-0.5 truncate text-xl font-extrabold tracking-tight text-[#59421f] sm:text-2xl">
                    Halo Kak <span className="text-[#8a6729]">{patientName}</span>
                  </h1>
                  <p className="mt-0.5 font-serif text-sm italic tracking-wide text-[#5c5548] sm:text-base">
                    Senyum indahmu berawal dari sini
                  </p>
                </div>
              </div>
              <span className="patient-portal-welcome-orb" aria-hidden="true" />
            </div>
            <section
              className={`patient-portal-hero relative flex flex-col justify-end overflow-hidden rounded-[2rem] text-white shadow-lg ${
                activePromotion ? "min-h-[340px] px-5 pb-7 pt-20 sm:min-h-[380px] sm:px-8 sm:pb-9" : "min-h-[132px] px-5 py-5 sm:px-8 sm:py-6"
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
                  <div className="patient-portal-promo-overlay absolute inset-0" />
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
                  null
                )}
                <button
                  type="button"
                  onClick={() => setSection("appointments")}
                  className="patient-portal-booking-cta mt-5 inline-flex items-center gap-2 rounded-full border px-4 py-3 text-xs font-bold transition hover:-translate-y-0.5"
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

            {currentUser?.patientId && (
              <section className="mt-4" aria-label="Status antrean pasien">
                {loadWarnings.includes("queue_items") ? (
                  <p role="alert" className="rounded-xl bg-red-50 p-4 text-xs text-red-700">Status antrean gagal dimuat. Muat ulang halaman atau coba kembali nanti.</p>
                ) : activePatientQueue ? (
                  renderQueueStatus(activePatientQueue)
                ) : (
                  <article className="patient-portal-queue-card rounded-3xl border p-5">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#76591f]">Antrean klinik</p>
                    <p className="mt-1 text-xl font-extrabold tracking-tight text-[#493919]">Belum ada antrean aktif</p>
                    <p className="mt-2 max-w-xl text-sm leading-6 text-[#493919]">Nomor antrean akan tampil di sini setelah check-in di cabang klinik.</p>
                  </article>
                )}
              </section>
            )}

            <section className="mt-6 grid gap-4 lg:grid-cols-[1.35fr_0.85fr]">
              <article className="patient-portal-card rounded-3xl border border-[#e8dcc2] bg-white p-5 sm:p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Janji temu</p>
                    <h2 className="mt-1 text-lg font-bold text-slate-900">Jadwal berikutnya</h2>
                  </div>
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#fbf5e6] to-[#efe0bd] text-[#876a2d]">
                    <CalendarDays className="h-5 w-5" />
                  </span>
                </div>
                <div className="mt-5">
                  {isLoadingBookings ? (
                    <p className="rounded-xl bg-slate-50 px-4 py-5 text-xs text-slate-500">Memuat janji temu...</p>
                  ) : upcomingBooking ? (
                    renderBookingCard(upcomingBooking)
                  ) : currentUser?.patientId ? (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5">
                      <p className="text-sm font-semibold text-slate-800">Belum ada janji temu mendatang</p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">Janji temu yang sudah dibuat akan tampil di sini.</p>
                    </div>
                  ) : (
                    renderLinkNotice("Jadwal dan riwayat janji temu")
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setSection("appointments")}
                  className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-[#806326] hover:underline"
                >
                  Buka semua janji temu <span aria-hidden="true">→</span>
                </button>
              </article>

              <article className="patient-portal-card rounded-3xl border border-[#e8dcc2] bg-white p-5 sm:p-6">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#fbf5e6] to-[#efe0bd] text-[#876a2d]">
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
                className="mt-4 rounded-xl border border-[#ded2b7] px-4 py-2.5 text-xs font-bold text-[#66512b] transition hover:bg-[#faf7ef]"
                >
                  Buka profil
                </button>
              </article>
            </section>

            <section className="patient-portal-card mt-4 flex flex-col gap-3 rounded-2xl border border-[#d8c79d] bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f4ebd6] text-[#876a2d]">
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
            <div className="patient-portal-page-heading mb-6">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#a1844d]">Portal pasien</p>
              <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900">Buat Janji</h1>
              <p className="mt-2 text-sm text-slate-500">Pilih cabang klinik, dokter, tanggal, dan waktu untuk mengajukan janji temu.</p>
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
              <form onSubmit={handleCreatePatientBooking} className="patient-portal-card mb-6 rounded-3xl border border-[#e8dcc2] bg-white p-5 sm:p-6">
                <div className="mb-5 flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f4ebd6] text-[#876a2d]">
                    <CalendarPlus className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className="text-base font-bold text-slate-900">Buat Janji</h2>
                    <p className="mt-1 text-xs leading-5 text-slate-500">Pilih salah satu cabang aktif. Permintaan akan dikirim ke klinik untuk dikonfirmasi.</p>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-xs font-semibold text-slate-700">
                    <span className="mb-1.5 flex items-center gap-2"><Building2 className="h-4 w-4 text-[#987b3b]" /> Cabang klinik</span>
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
                      className="w-full rounded-xl border border-[#ded2b7] bg-white px-3 py-3 text-sm font-medium text-slate-800 outline-none transition focus:border-[#b3934d] focus:ring-2 focus:ring-[#f5ecd5]"
                    >
                      <option value="">Pilih cabang</option>
                      {activeBranches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                    </select>
                  </label>
                  <label className="block text-xs font-semibold text-slate-700">
                    <span className="mb-1.5 flex items-center gap-2"><CalendarDays className="h-4 w-4 text-[#987b3b]" /> Tanggal</span>
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
                      className="w-full rounded-xl border border-[#ded2b7] bg-white px-3 py-3 text-sm font-medium text-slate-800 outline-none transition focus:border-[#b3934d] focus:ring-2 focus:ring-[#f5ecd5]"
                    />
                  </label>
                  <label className="block text-xs font-semibold text-slate-700">
                    <span className="mb-1.5 flex items-center gap-2"><Stethoscope className="h-4 w-4 text-[#987b3b]" /> Dokter</span>
                    <select
                      required
                      value={formDoctorId}
                      onChange={(event) => {
                        setFormDoctorId(event.target.value);
                        setFormTimeSlot("");
                      }}
                      disabled={!formBranchId || isLoadingSchedules || availableDoctors.length === 0}
                      className="w-full rounded-xl border border-[#ded2b7] bg-white px-3 py-3 text-sm font-medium text-slate-800 outline-none transition focus:border-[#b3934d] focus:ring-2 focus:ring-[#f5ecd5] disabled:bg-slate-50 disabled:text-slate-400"
                    >
                      <option value="">{isLoadingSchedules ? "Memuat dokter..." : "Pilih dokter"}</option>
                      {availableDoctors.map((doctor: DentalDoctor) => <option key={doctor.id} value={doctor.id}>{doctor.name}</option>)}
                    </select>
                  </label>
                  <label className="block text-xs font-semibold text-slate-700">
                    <span className="mb-1.5 flex items-center gap-2"><Clock className="h-4 w-4 text-[#987b3b]" /> Waktu</span>
                    <select
                      required
                      value={formTimeSlot}
                      onChange={(event) => setFormTimeSlot(event.target.value)}
                      disabled={!formDoctorId || availableTimeSlots.length === 0}
                      className="w-full rounded-xl border border-[#ded2b7] bg-white px-3 py-3 text-sm font-medium text-slate-800 outline-none transition focus:border-[#b3934d] focus:ring-2 focus:ring-[#f5ecd5] disabled:bg-slate-50 disabled:text-slate-400"
                    >
                      <option value="">{availableTimeSlots.length ? "Pilih waktu" : "Tidak ada waktu tersedia"}</option>
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
                {formDoctorId && availableTimeSlots.length === 0 && !isLoadingSchedules && (
                  <p className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                    <Clock className="mt-0.5 h-4 w-4 shrink-0" /> Tidak ada slot waktu mendatang untuk dokter ini pada tanggal tersebut.
                  </p>
                )}
                <label className="mt-4 block text-xs font-semibold text-slate-700">
                  <span className="mb-1.5 flex items-center gap-2"><MapPin className="h-4 w-4 text-[#987b3b]" /> Keluhan atau catatan (opsional)</span>
                  <textarea
                    value={formNotes}
                    onChange={(event) => setFormNotes(event.target.value)}
                    maxLength={1000}
                    rows={3}
                    placeholder="Ceritakan singkat keluhan atau kebutuhan perawatan Anda"
                    className="w-full resize-y rounded-xl border border-[#ded2b7] bg-white px-3 py-3 text-sm font-medium text-slate-800 outline-none transition placeholder:font-normal placeholder:text-slate-400 focus:border-[#b3934d] focus:ring-2 focus:ring-[#f5ecd5]"
                  />
                </label>
                {bookingSubmitError && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-xs leading-5 text-red-700">{bookingSubmitError}</p>}
                {bookingSubmitSuccess && (
                  <p role="status" className="mt-4 flex items-start gap-2 rounded-xl bg-emerald-50 p-3 text-xs leading-5 text-emerald-800">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> {bookingSubmitSuccess}
                  </p>
                )}
                <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-[11px] leading-5 text-slate-400">Slot dikonfirmasi oleh sistem saat permintaan dikirim. Janji temu Anda berstatus menunggu konfirmasi klinik.</p>
                  <button
                    type="submit"
                    disabled={isSubmittingBooking || isLoadingBookings || isLoadingSchedules || !currentUser.patientId || activeBranches.length === 0 || !!activePatientBooking}
                    className="patient-portal-primary inline-flex shrink-0 items-center justify-center gap-2 rounded-xl px-5 py-3 text-xs font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-50"
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
                <CalendarClock className="mx-auto h-8 w-8 text-[#987b3b]" />
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
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#a1844d]">Portal pasien</p>
              <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900">Antrean klinik</h1>
              <p className="mt-2 text-sm text-slate-500">Pantau status dan perkiraan giliran antrean Anda hari ini.</p>
            </div>
            {!currentUser?.patientId ? renderLinkNotice("Status antrean") : loadWarnings.includes("queue_items") ? (
              <p role="alert" className="rounded-xl bg-red-50 p-4 text-xs text-red-700">Status antrean gagal dimuat. Silakan muat ulang halaman atau coba kembali nanti.</p>
            ) : activePatientQueue ? (
              renderQueueStatus(activePatientQueue)
            ) : (
              <article className="rounded-2xl border border-dashed border-slate-300 bg-white p-7 text-center">
                <ListOrdered className="mx-auto h-8 w-8 text-[#987b3b]" />
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
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#a1844d]">Portal pasien</p>
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
                    <History className="h-5 w-5 text-[#987b3b]" />
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
                    <FileText className="h-5 w-5 text-[#987b3b]" />
                    <h2 className="text-base font-bold text-slate-900">Tagihan dan kuitansi</h2>
                  </div>
                  {invoiceItemsError && <p role="alert" className="mb-3 rounded-xl bg-red-50 p-3 text-xs text-red-700">{invoiceItemsError}</p>}
                  {patientInvoices.length ? (
                    <div className="space-y-3">{patientInvoices.map(renderInvoiceCard)}</div>
                  ) : loadWarnings.includes("invoices") ? (
                    <p role="alert" className="rounded-xl bg-red-50 p-4 text-xs text-red-700">Tagihan gagal dimuat. Silakan coba lagi nanti.</p>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center">
                      <Receipt className="mx-auto h-7 w-7 text-[#987b3b]" />
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
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#a1844d]">Portal pasien</p>
              <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900">Profil</h1>
              <p className="mt-2 text-sm text-slate-500">Informasi akun yang digunakan untuk masuk ke portal pasien.</p>
            </div>
            <article className="max-w-2xl rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
              <div className="flex items-center gap-3 border-b border-slate-100 pb-5">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#f2e6c8] text-sm font-bold text-[#775a21]">{initials}</span>
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
                    <Lock className="h-4 w-4 text-[#987b3b]" />
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
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-3 text-sm text-slate-800 outline-none transition focus:border-[#987b3b] focus:bg-white"
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
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-3 text-sm text-slate-800 outline-none transition focus:border-[#987b3b] focus:bg-white"
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
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-3 text-sm text-slate-800 outline-none transition focus:border-[#987b3b] focus:bg-white"
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

        <footer className="py-7 text-center text-[10px] text-slate-400">
          © {new Date().getFullYear()} {clinicName} · Portal Pasien
        </footer>
      </div>

      <nav aria-label="Navigasi portal pasien" className="patient-portal-mobile-nav fixed inset-x-0 bottom-0 z-20 border-t px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-lg items-center justify-around">
          {patientNavigation.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              aria-current={section === id ? "page" : undefined}
              onClick={() => setSection(id)}
              className={`patient-portal-nav-item flex min-w-16 flex-col items-center gap-1 rounded-2xl px-3 py-2 text-[10px] font-semibold transition ${
                section === id ? "patient-portal-nav-active text-[#493919]" : "text-[#69552f] hover:bg-white/45 hover:text-[#493919]"
              }`}
            >
              <Icon className={`h-5 w-5 ${section === id ? "text-[#76551a]" : "text-[#806a42]"}`} />
              {label}
            </button>
          ))}
        </div>
      </nav>
    </main>
  );
};
