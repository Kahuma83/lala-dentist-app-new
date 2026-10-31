import { Booking, BookingStatus, PatientVisit, QueueItem, VisitStatus } from "../types/domain";

export function getCompletedDoctorBookings(
  bookings: Booking[],
  queueItems: QueueItem[],
  visits: PatientVisit[]
): Booking[] {
  const queueBookingIds = new Set(
    queueItems.map((item) => item.bookingId).filter((id): id is string => !!id)
  );
  const completedVisitBookingIds = new Set(
    visits
      .filter(
        (visit): visit is PatientVisit & { bookingId: string } =>
          visit.visitStatus === VisitStatus.COMPLETED && visit.bookingId !== null
      )
      .map((visit) => visit.bookingId)
  );
  return bookings.filter(
    (booking) =>
      (booking.status === BookingStatus.COMPLETED || completedVisitBookingIds.has(booking.id)) &&
      !queueBookingIds.has(booking.id)
  );
}

export function getNotArrivedDoctorBookings(
  bookings: Booking[],
  queueItems: QueueItem[],
  visits: PatientVisit[]
): Booking[] {
  const queueBookingIds = new Set(
    queueItems.map((item) => item.bookingId).filter((id): id is string => !!id)
  );
  const completedVisitBookingIds = new Set(
    visits
      .filter(
        (visit): visit is PatientVisit & { bookingId: string } =>
          visit.visitStatus === VisitStatus.COMPLETED && visit.bookingId !== null
      )
      .map((visit) => visit.bookingId)
  );
  return bookings.filter(
    (booking) =>
      booking.status !== BookingStatus.COMPLETED &&
      !queueBookingIds.has(booking.id) &&
      !completedVisitBookingIds.has(booking.id)
  );
}
