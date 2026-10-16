import { Booking, BookingStatus, QueueItem, QueueStatus } from "../types/domain";
import { isActiveQueueStatus } from "./bookingQueueGuards";
import { getOperationalDateString } from "./dateUtils";
import { getPlannedTreatmentDurationMinutes } from "./plannedTreatmentUtils";

export function calculateQueueEstimates(
  queueItems: QueueItem[],
  bookings: Booking[],
  referenceTime: string,
  operationalDate: string
): QueueItem[] {
  const activeItems = queueItems
    .filter((item) =>
      isActiveQueueStatus(item.status) &&
      getOperationalDateString(item.arrivalAt || item.checkInTime || item.createdAt) === operationalDate
    )
    .sort((a, b) => {
      const rank = (status: string) => {
        if (status === QueueStatus.IN_CONSULTATION) return 1;
        if (status === QueueStatus.IN_PREPARATION) return 2;
        return 3;
      };
      const rankDiff = rank(a.status) - rank(b.status);
      if (rankDiff !== 0) return rankDiff;
      const arrivalDiff = new Date(a.arrivalAt || a.checkInTime || 0).getTime() -
        new Date(b.arrivalAt || b.checkInTime || 0).getTime();
      if (arrivalDiff !== 0) return arrivalDiff;
      return (a.sequenceOrder || 0) - (b.sequenceOrder || 0);
    });

  if (activeItems.length === 0) return [];

  const { branchId, doctorId } = activeItems[0];
  const queuedBookingIds = new Set(activeItems.map((item) => item.bookingId).filter(Boolean));
  const reservedBookings = bookings
    .filter((booking) =>
      booking.branchId === branchId &&
      booking.doctorId === doctorId &&
      getOperationalDateString(booking.bookingDateTime) === operationalDate &&
      (booking.status === BookingStatus.PENDING || booking.status === BookingStatus.CONFIRMED) &&
      !queuedBookingIds.has(booking.id)
    )
    .map((booking) => {
      const startMs = new Date(booking.bookingDateTime).getTime();
      return {
        booking,
        startMs,
        endMs: startMs + getPlannedTreatmentDurationMinutes(booking.plannedTreatments) * 60_000
      };
    })
    .filter((booking) => Number.isFinite(booking.startMs))
    .sort((a, b) => a.startMs - b.startMs);

  const nowMs = new Date(referenceTime).getTime();
  let runningMs = nowMs;

  return activeItems.map((item) => {
    const durationMs = Math.max(1, item.estimatedDurationMinutes || 30) * 60_000;
    if (item.status === QueueStatus.IN_CONSULTATION) {
      const startAt = item.actualServiceStartAt || item.startTime || item.arrivalAt || referenceTime;
      runningMs = Math.max(nowMs, new Date(startAt).getTime() + durationMs);
      return { ...item, estimatedServiceAt: startAt, updatedAt: referenceTime };
    }

    const arrivalMs = new Date(item.arrivalAt || item.checkInTime || referenceTime).getTime();
    let candidateMs = Math.max(arrivalMs, runningMs);
    const linkedBooking = bookings.find((booking) => booking.id === item.bookingId);
    if (linkedBooking && getOperationalDateString(linkedBooking.bookingDateTime) === operationalDate) {
      const bookedStartMs = new Date(linkedBooking.bookingDateTime).getTime();
      if (Number.isFinite(bookedStartMs)) candidateMs = Math.max(candidateMs, bookedStartMs);
    }
    const preferredStartMs = item.preferredServiceAt ? new Date(item.preferredServiceAt).getTime() : NaN;
    if (Number.isFinite(preferredStartMs)) candidateMs = Math.max(candidateMs, preferredStartMs);

    while (true) {
      const conflict = reservedBookings.find(
        (booking) => candidateMs < booking.endMs && candidateMs + durationMs > booking.startMs
      );
      if (!conflict) break;
      candidateMs = conflict.endMs;
    }

    runningMs = candidateMs + durationMs;
    return {
      ...item,
      estimatedServiceAt: new Date(candidateMs).toISOString(),
      updatedAt: referenceTime
    };
  });
}

export function getAvailableWalkInServiceTimes(
  queueItems: QueueItem[],
  bookings: Booking[],
  referenceTime: string,
  operationalDate: string,
  branchId: string,
  doctorId: string,
  durationMinutes: number,
  scheduleStart: string,
  scheduleEnd: string,
  maximumOptions = 8
): string[] {
  const scheduleStartMs = new Date(scheduleStart).getTime();
  const scheduleEndMs = new Date(scheduleEnd).getTime();
  const nowMs = new Date(referenceTime).getTime();
  if (
    !Number.isFinite(scheduleStartMs) ||
    !Number.isFinite(scheduleEndMs) ||
    !Number.isFinite(nowMs) ||
    scheduleEndMs <= scheduleStartMs ||
    durationMinutes <= 0
  ) return [];

  const relevantQueue = queueItems.filter((item) =>
    item.branchId === branchId &&
    item.doctorId === doctorId &&
    isActiveQueueStatus(item.status) &&
    getOperationalDateString(item.arrivalAt || item.checkInTime || item.createdAt) === operationalDate
  );
  const estimates = calculateQueueEstimates(relevantQueue, bookings, referenceTime, operationalDate);
  const queueEndMs = estimates.reduce((endMs, item) => {
    const startMs = new Date(item.estimatedServiceAt || item.arrivalAt).getTime();
    if (!Number.isFinite(startMs)) return endMs;
    return Math.max(endMs, startMs + Math.max(1, item.estimatedDurationMinutes || 30) * 60_000);
  }, nowMs);

  const queuedBookingIds = new Set(relevantQueue.map((item) => item.bookingId).filter(Boolean));
  const reservedBookings = bookings
    .filter((booking) =>
      booking.branchId === branchId &&
      booking.doctorId === doctorId &&
      getOperationalDateString(booking.bookingDateTime) === operationalDate &&
      (booking.status === BookingStatus.PENDING || booking.status === BookingStatus.CONFIRMED) &&
      !queuedBookingIds.has(booking.id)
    )
    .map((booking) => {
      const startMs = new Date(booking.bookingDateTime).getTime();
      return {
        startMs,
        endMs: startMs + getPlannedTreatmentDurationMinutes(booking.plannedTreatments) * 60_000
      };
    })
    .filter((booking) => Number.isFinite(booking.startMs))
    .sort((a, b) => a.startMs - b.startMs);

  const durationMs = durationMinutes * 60_000;
  const intervalMs = 15 * 60_000;
  let candidateMs = Math.max(queueEndMs, nowMs, scheduleStartMs);
  candidateMs = Math.ceil(candidateMs / intervalMs) * intervalMs;

  const results: string[] = [];
  while (results.length < maximumOptions && candidateMs + durationMs <= scheduleEndMs) {
    const conflict = reservedBookings.find(
      (booking) => candidateMs < booking.endMs && candidateMs + durationMs > booking.startMs
    );
    if (conflict) {
      candidateMs = Math.ceil(conflict.endMs / intervalMs) * intervalMs;
      continue;
    }
    results.push(new Date(candidateMs).toISOString());
    candidateMs += intervalMs;
  }

  return results;
}