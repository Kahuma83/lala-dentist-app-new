import { describe, expect, it } from "vitest";
import {
  Booking,
  BookingStatus,
  PatientVisit,
  QueueItem,
  QueueStatus,
  VisitStatus,
  VisitType
} from "../types/domain";
import { getNotArrivedDoctorBookings } from "../utils/doctorDashboardUtils";

const makeBooking = (id: string, status: BookingStatus): Booking => ({
  id,
  patientId: `patient-${id}`,
  branchId: "branch-ambulu",
  doctorId: "doctor-ulfa",
  bookingDateTime: "2026-10-31T04:00:00.000Z",
  status,
  createdAt: "",
  updatedAt: ""
});

describe("doctor dashboard booking status", () => {
  it("does not label completed bookings without a linked queue item as not arrived", () => {
    const bookings = [
      makeBooking("completed-booking", BookingStatus.COMPLETED),
      makeBooking("confirmed-booking", BookingStatus.CONFIRMED),
      makeBooking("completed-visit-booking", BookingStatus.CONFIRMED),
      makeBooking("checked-in-booking", BookingStatus.CONFIRMED)
    ];
    const queueItems = [{
      id: "queue-1",
      bookingId: "checked-in-booking",
      status: QueueStatus.COMPLETED
    } as QueueItem];
    const visits = [{
      id: "visit-1",
      patientId: "patient-completed-visit-booking",
      branchId: "branch-ambulu",
      visitDateTime: "2026-10-31T04:00:00.000Z",
      visitType: VisitType.BOOKING,
      visitStatus: VisitStatus.COMPLETED,
      bookingId: "completed-visit-booking",
      createdAt: "",
      updatedAt: ""
    } as PatientVisit];

    expect(getNotArrivedDoctorBookings(bookings, queueItems, visits).map((booking) => booking.id))
      .toEqual(["confirmed-booking"]);
  });
});
