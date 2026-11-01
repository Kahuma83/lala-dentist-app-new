import { Booking, BookingStatus, QueueItem } from "../types/domain";
import { getOperationalDateString, toOperationalDateTime } from "./dateUtils";
import { getPlannedTreatmentDurationMinutes } from "./plannedTreatmentUtils";
import { isActiveQueueStatus } from "./bookingQueueGuards";

export type WalkInDemoSlotResult =
  | { available: true; reason: "available" }
  | { available: false; reason: "past" | "booking_conflict" | "queue_conflict" };

const overlaps = (start: number, end: number, otherStart: number, otherEnd: number) =>
  start < otherEnd && otherStart < end;

export function getWalkInDemoSlotResult({
  branchId,
  doctorId,
  date,
  time,
  bookings,
  queueItems,
  now = Date.now()
}: {
  branchId: string;
  doctorId: string;
  date: string;
  time: string;
  bookings: Booking[];
  queueItems: QueueItem[];
  now?: number;
}): WalkInDemoSlotResult {
  const slotStart = new Date(toOperationalDateTime(`${date}T00:00:00+07:00`, time)).getTime();
  const slotEnd = slotStart + 30 * 60_000;
  if (slotStart <= now) return { available: false, reason: "past" };

  const hasBookingConflict = bookings.some((booking) => {
    if (
      booking.branchId !== branchId ||
      booking.doctorId !== doctorId ||
      (booking.status !== BookingStatus.PENDING && booking.status !== BookingStatus.CONFIRMED)
    ) return false;
    const bookingStart = new Date(booking.bookingDateTime).getTime();
    if (!Number.isFinite(bookingStart)) return false;
    const duration = getPlannedTreatmentDurationMinutes(booking.plannedTreatments || [], 30);
    return overlaps(slotStart, slotEnd, bookingStart, bookingStart + duration * 60_000);
  });
  if (hasBookingConflict) return { available: false, reason: "booking_conflict" };

  const hasQueueConflict = queueItems.some((item) => {
    if (
      item.branchId !== branchId ||
      item.doctorId !== doctorId ||
      !isActiveQueueStatus(item.status)
    ) return false;

    const arrivalAt = item.arrivalAt || item.checkInTime || item.createdAt;
    if (getOperationalDateString(arrivalAt) !== date) return false;

    let serviceStart: number;
    if (item.status === "WAITING") {
      serviceStart = Math.max(new Date(item.estimatedServiceAt || arrivalAt).getTime(), now);
    } else {
      serviceStart = new Date(
        item.actualServiceStartAt || item.estimatedServiceAt || arrivalAt
      ).getTime();
      if (!item.actualServiceStartAt && !item.estimatedServiceAt) {
        serviceStart = Math.max(serviceStart, now);
      }
    }

    if (!Number.isFinite(serviceStart)) return false;
    const serviceEnd = serviceStart + Math.max(item.estimatedDurationMinutes, 1) * 60_000;
    return overlaps(slotStart, slotEnd, serviceStart, serviceEnd);
  });
  if (hasQueueConflict) return { available: false, reason: "queue_conflict" };

  return { available: true, reason: "available" };
}
