import { Booking, BookingStatus, PatientVisit, QueueItem, QueueStatus, VisitStatus } from "../types/domain";

export function getCheckInCancellationBlockReason(
  booking: Booking,
  visits: PatientVisit[],
  queueItems: QueueItem[]
): string | null {
  if (booking.status !== BookingStatus.PENDING && booking.status !== BookingStatus.CONFIRMED) {
    return "Hanya janji temu aktif yang dapat dibatalkan.";
  }

  const linkedVisits = visits.filter((visit) => visit.bookingId === booking.id);
  const activeVisits = linkedVisits.filter(
    (visit) => visit.visitStatus !== VisitStatus.CANCELLED
  );
  if (activeVisits.length === 0) {
    return "Kunjungan aktif yang terkait check-in tidak ditemukan.";
  }
  if (activeVisits.some(
    (visit) => visit.visitStatus !== VisitStatus.WAITING && visit.visitStatus !== VisitStatus.IN_TRIAGE
  )) {
    return "Pemeriksaan atau tindakan sudah dimulai. Check-in tidak dapat dibatalkan dari sini.";
  }

  const visitIds = new Set(linkedVisits.map((visit) => visit.id));
  const linkedQueueItems = queueItems.filter(
    (item) => item.bookingId === booking.id || visitIds.has(item.visitId)
  );
  const activeQueueItems = linkedQueueItems.filter(
    (item) => item.status === QueueStatus.WAITING
      || item.status === QueueStatus.CALLING
      || item.status === QueueStatus.IN_PREPARATION
      || item.status === QueueStatus.IN_CONSULTATION
  );
  if (activeQueueItems.some((item) => item.status !== QueueStatus.WAITING)) {
    return "Antrean sudah dipanggil atau pelayanan telah dimulai. Check-in tidak dapat dibatalkan dari sini.";
  }
  if (linkedQueueItems.some(
    (item) => item.status === QueueStatus.COMPLETED || item.status === QueueStatus.SKIPPED
  )) {
    return "Antrean sudah selesai atau dilewati dan tidak dapat dibatalkan.";
  }

  return null;
}
