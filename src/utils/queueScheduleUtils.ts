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
      if (rank(a.status) === 3) {
        const aBooking = bookings.find((booking) => booking.id === a.bookingId);
        const bBooking = bookings.find((booking) => booking.id === b.bookingId);
        const aBookingTime = aBooking?.bookingDateTime || a.bookingTimeSnapshot;
        const bBookingTime = bBooking?.bookingDateTime || b.bookingTimeSnapshot;
        if (aBookingTime && bBookingTime) {
          const bookingDiff = new Date(aBookingTime).getTime() - new Date(bBookingTime).getTime();
          if (Number.isFinite(bookingDiff) && bookingDiff !== 0) return bookingDiff;
        } else if (aBookingTime || bBookingTime) {
          return aBookingTime ? -1 : 1;
        }
      }
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
  const scheduledItems: QueueItem[] = [];

  const scheduleItem = (item: QueueItem, isWalkIn: boolean): QueueItem => {
    const durationMs = Math.max(1, item.estimatedDurationMinutes || 30) * 60_000;
    if (item.status === QueueStatus.IN_CONSULTATION) {
      const startAt = item.actualServiceStartAt || item.startTime || item.arrivalAt || referenceTime;
      runningMs = Math.max(nowMs, new Date(startAt).getTime() + durationMs);
      return { ...item, estimatedServiceAt: startAt, updatedAt: referenceTime };
    }

    const arrivalMs = new Date(item.arrivalAt || item.checkInTime || referenceTime).getTime();
    let candidateMs = Math.max(arrivalMs, runningMs);
    const linkedBooking = bookings.find((booking) => booking.id === item.bookingId);
    const bookingTime = linkedBooking?.bookingDateTime || item.bookingTimeSnapshot;
    if (bookingTime && getOperationalDateString(bookingTime) === operationalDate) {
      const bookedStartMs = new Date(bookingTime).getTime();
      if (Number.isFinite(bookedStartMs)) candidateMs = Math.max(candidateMs, bookedStartMs);
    }
    const preferredStartMs = item.preferredServiceAt ? new Date(item.preferredServiceAt).getTime() : NaN;
    if (Number.isFinite(preferredStartMs)) candidateMs = Math.max(candidateMs, preferredStartMs);

    const conflictingBookings = isWalkIn
      ? reservedBookings
      : reservedBookings.filter((booking) => booking.booking.id !== linkedBooking?.id);
    while (true) {
      const conflict = conflictingBookings.find(
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
  };

  const inProgressItems = activeItems.filter((item) =>
    item.status === QueueStatus.IN_CONSULTATION || item.status === QueueStatus.IN_PREPARATION
  );
  const appointmentItems = activeItems.filter((item) =>
    item.status !== QueueStatus.IN_CONSULTATION &&
    item.status !== QueueStatus.IN_PREPARATION &&
    Boolean(item.bookingId)
  );
  const walkInItems = activeItems.filter((item) =>
    item.status !== QueueStatus.IN_CONSULTATION &&
    item.status !== QueueStatus.IN_PREPARATION &&
    !item.bookingId
  ).sort((a, b) => {
    const aArrival = new Date(a.arrivalAt || a.checkInTime || referenceTime).getTime();
    const bArrival = new Date(b.arrivalAt || b.checkInTime || referenceTime).getTime();
    const aPreferred = a.preferredServiceAt ? new Date(a.preferredServiceAt).getTime() : aArrival;
    const bPreferred = b.preferredServiceAt ? new Date(b.preferredServiceAt).getTime() : bArrival;
    return Math.max(aArrival, aPreferred) - Math.max(bArrival, bPreferred);
  });

  inProgressItems.forEach((item) => scheduledItems.push(scheduleItem(item, false)));

  const pendingWalkIns = [...walkInItems];
  for (const appointment of appointmentItems) {
    const appointmentBooking = bookings.find((booking) => booking.id === appointment.bookingId);
    const appointmentStartMs = appointmentBooking
      ? new Date(appointmentBooking.bookingDateTime).getTime()
      : appointment.bookingTimeSnapshot
        ? new Date(appointment.bookingTimeSnapshot).getTime()
      : Number.NaN;

    while (pendingWalkIns.length > 0) {
      const fittingWalkInIndex = pendingWalkIns.findIndex((walkIn) => {
        const arrivalMs = new Date(walkIn.arrivalAt || walkIn.checkInTime || referenceTime).getTime();
        const preferredStartMs = walkIn.preferredServiceAt
          ? new Date(walkIn.preferredServiceAt).getTime()
          : Number.NaN;
        let walkInStartMs = Math.max(
          runningMs,
          Number.isFinite(arrivalMs) ? arrivalMs : nowMs,
          Number.isFinite(preferredStartMs) ? preferredStartMs : nowMs
        );
        const durationMs = Math.max(1, walkIn.estimatedDurationMinutes || 30) * 60_000;
        while (true) {
          const conflict = reservedBookings.find(
            (booking) => walkInStartMs < booking.endMs && walkInStartMs + durationMs > booking.startMs
          );
          if (!conflict) break;
          walkInStartMs = conflict.endMs;
        }
        return Number.isFinite(appointmentStartMs) && walkInStartMs + durationMs <= appointmentStartMs;
      });

      if (fittingWalkInIndex < 0) break;
      const [walkIn] = pendingWalkIns.splice(fittingWalkInIndex, 1);
      scheduledItems.push(scheduleItem(walkIn, true));
    }

    scheduledItems.push(scheduleItem(appointment, false));
  }

  pendingWalkIns.forEach((item) => scheduledItems.push(scheduleItem(item, true)));
  return scheduledItems;
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