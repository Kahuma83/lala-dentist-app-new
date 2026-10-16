import { Booking, BookingStatus, QueueItem, QueueStatus, VisitStatus } from "../types/domain";
import { getOperationalDateString } from "./dateUtils";

const ACTIVE_QUEUE_STATUSES = new Set<QueueItem["status"]>([
  QueueStatus.WAITING,
  QueueStatus.IN_PREPARATION,
  QueueStatus.IN_CONSULTATION,
  "CALLING"
]);

export function isActiveQueueStatus(status: QueueItem["status"]): boolean {
  return ACTIVE_QUEUE_STATUSES.has(status);
}

export function getVisitStatusForQueueStatus(status: QueueItem["status"]): VisitStatus | null {
  switch (status) {
    case QueueStatus.WAITING:
    case QueueStatus.IN_PREPARATION:
    case "CALLING":
      return VisitStatus.IN_TRIAGE;
    case QueueStatus.IN_CONSULTATION:
      return VisitStatus.IN_TREATMENT;
    case QueueStatus.COMPLETED:
      return VisitStatus.COMPLETED;
    default:
      return null;
  }
}

export function hasActiveBookingForPatientOnDate(
  bookings: Booking[],
  patientId: string,
  branchId: string,
  referenceTime: string
): boolean {
  const operationalDate = getOperationalDateString(referenceTime);
  return bookings.some((booking) =>
    booking.patientId === patientId &&
    booking.branchId === branchId &&
    getOperationalDateString(booking.bookingDateTime) === operationalDate &&
    (booking.status === BookingStatus.PENDING || booking.status === BookingStatus.CONFIRMED)
  );
}

export function hasActiveQueueForPatientOnDate(
  queueItems: QueueItem[],
  patientId: string,
  branchId: string,
  referenceTime: string,
  exceptVisitId?: string
): boolean {
  const operationalDate = getOperationalDateString(referenceTime);
  return queueItems.some((item) =>
    item.patientId === patientId &&
    item.branchId === branchId &&
    item.visitId !== exceptVisitId &&
    getOperationalDateString(item.arrivalAt || item.checkInTime || item.createdAt) === operationalDate &&
    isActiveQueueStatus(item.status)
  );
}