import { describe, expect, it } from "vitest";
import { Booking, BookingStatus, QueueItem, QueueStatus } from "../types/domain";
import { getWalkInDemoSlotResult } from "../utils/walkInBookingDemo";

const commonBooking = {
  id: "booking-1",
  patientId: "patient-1",
  branchId: "branch-1",
  doctorId: "doctor-1",
  bookingDateTime: "2026-11-02T02:00:00.000Z",
  timeSlot: "09:00",
  status: BookingStatus.PENDING,
  createdAt: "",
  updatedAt: ""
} satisfies Booking;

const commonQueueItem = {
  id: "queue-1",
  branchId: "branch-1",
  doctorId: "doctor-1",
  visitId: "visit-1",
  queueNumber: "A-01",
  status: QueueStatus.IN_CONSULTATION,
  arrivalAt: "2026-11-02T01:00:00.000Z",
  actualServiceStartAt: "2026-11-02T02:00:00.000Z",
  estimatedDurationMinutes: 45,
  createdAt: "",
  updatedAt: ""
} satisfies QueueItem;

describe("Walk-In booking demo", () => {
  const base = {
    branchId: "branch-1",
    doctorId: "doctor-1",
    date: "2026-11-02",
    time: "09:00",
    bookings: [] as Booking[],
    queueItems: [] as QueueItem[],
    now: new Date("2026-11-01T00:00:00.000Z").getTime()
  };

  it("allows a future Walk-In simulation even without a schedule requirement", () => {
    expect(getWalkInDemoSlotResult(base)).toEqual({ available: true, reason: "available" });
  });

  it("blocks overlaps with an active booking", () => {
    expect(getWalkInDemoSlotResult({ ...base, bookings: [commonBooking] }))
      .toEqual({ available: false, reason: "booking_conflict" });
  });

  it("blocks overlaps with an active queue", () => {
    expect(getWalkInDemoSlotResult({ ...base, queueItems: [commonQueueItem] }))
      .toEqual({ available: false, reason: "queue_conflict" });
  });

  it("blocks time slots that have already passed", () => {
    expect(getWalkInDemoSlotResult({
      ...base,
      date: "2026-11-01",
      time: "08:00",
      now: new Date("2026-11-01T02:00:00.000Z").getTime()
    })).toEqual({ available: false, reason: "past" });
  });
});
