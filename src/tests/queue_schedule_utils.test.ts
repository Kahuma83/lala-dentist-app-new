import { describe, expect, it } from "vitest";
import { Booking, BookingStatus, QueueItem, QueueStatus } from "../types/domain";
import { calculateQueueEstimates, getAvailableWalkInServiceTimes } from "../utils/queueScheduleUtils";
import { getVisitStatusForQueueStatus, isActiveQueueStatus } from "../utils/bookingQueueGuards";

const branchId = "branch-gebang";
const doctorId = "doctor-regina";
const operationalDate = "2026-10-15";
const referenceTime = "2026-10-15T08:30:00+07:00";

function queueItem(overrides: Partial<QueueItem>): QueueItem {
  return {
    id: "queue-walk-in",
    visitId: "visit-walk-in",
    branchId,
    doctorId,
    queueNumber: "R-02",
    status: QueueStatus.WAITING,
    sequenceOrder: 2,
    arrivalAt: referenceTime,
    estimatedDurationMinutes: 30,
    createdAt: referenceTime,
    updatedAt: referenceTime,
    ...overrides
  };
}

function booking(overrides: Partial<Booking>): Booking {
  return {
    id: "booking-1",
    patientId: "patient-1",
    branchId,
    doctorId,
    bookingDateTime: "2026-10-15T09:00:00+07:00",
    timeSlot: "09:00",
    status: BookingStatus.PENDING,
    createdAt: referenceTime,
    updatedAt: referenceTime,
    ...overrides
  };
}

describe("calculateQueueEstimates", () => {
  it("treats a called patient as actively queued for treatment", () => {
    expect(isActiveQueueStatus("CALLING")).toBe(true);
  });

  it("maps queue lifecycle changes to patient visit history statuses", () => {
    expect(getVisitStatusForQueueStatus(QueueStatus.IN_PREPARATION)).toBe("IN_TRIAGE");
    expect(getVisitStatusForQueueStatus(QueueStatus.IN_CONSULTATION)).toBe("IN_TREATMENT");
    expect(getVisitStatusForQueueStatus(QueueStatus.COMPLETED)).toBe("COMPLETED");
  });

  it("schedules walk-ins after existing queue work and reserved appointment slots", () => {
    const existingQueue = queueItem({
      id: "queue-existing",
      visitId: "visit-existing",
      status: QueueStatus.IN_CONSULTATION,
      arrivalAt: "2026-10-15T08:00:00+07:00",
      actualServiceStartAt: "2026-10-15T08:00:00+07:00",
      estimatedDurationMinutes: 60
    });
    const walkIn = queueItem({});

    const [estimatedWalkIn] = calculateQueueEstimates(
      [existingQueue, walkIn],
      [booking({})],
      referenceTime,
      operationalDate
    ).filter((item) => item.id === walkIn.id);

    expect(estimatedWalkIn.estimatedServiceAt).toBe("2026-10-15T02:30:00.000Z");
  });

  it("does not reserve a booking slot twice after its patient has joined the queue", () => {
    const bookedQueueItem = queueItem({
      id: "queue-booking",
      visitId: "visit-booking",
      bookingId: "booking-1",
      arrivalAt: referenceTime
    });

    const [estimatedBooking] = calculateQueueEstimates(
      [bookedQueueItem],
      [booking({})],
      referenceTime,
      operationalDate
    );

    expect(estimatedBooking.estimatedServiceAt).toBe("2026-10-15T02:00:00.000Z");
  });

  it("orders checked-in booking patients by appointment time instead of check-in time", () => {
    const laterBooking = booking({
      id: "booking-later",
      bookingDateTime: "2026-10-15T09:30:00+07:00"
    });
    const earlierBooking = booking({
      id: "booking-earlier",
      bookingDateTime: "2026-10-15T09:00:00+07:00"
    });
    const laterAppointmentQueue = queueItem({
      id: "queue-later-booking",
      bookingId: laterBooking.id,
      arrivalAt: "2026-10-15T08:30:00+07:00",
      estimatedDurationMinutes: 30
    });
    const earlierAppointmentQueue = queueItem({
      id: "queue-earlier-booking",
      bookingId: earlierBooking.id,
      arrivalAt: "2026-10-15T08:45:00+07:00",
      estimatedDurationMinutes: 30
    });
    const walkIn = queueItem({
      id: "queue-walk-in",
      bookingId: null,
      arrivalAt: "2026-10-15T08:50:00+07:00",
      estimatedDurationMinutes: 60
    });

    const estimateById = new Map(
      calculateQueueEstimates(
        [laterAppointmentQueue, walkIn, earlierAppointmentQueue],
        [laterBooking, earlierBooking],
        referenceTime,
        operationalDate
      ).map((item) => [item.id, item])
    );

    expect(estimateById.get(earlierAppointmentQueue.id)?.estimatedServiceAt)
      .toBe("2026-10-15T02:00:00.000Z");
    expect(estimateById.get(laterAppointmentQueue.id)?.estimatedServiceAt)
      .toBe("2026-10-15T02:30:00.000Z");
    expect(estimateById.get(walkIn.id)?.estimatedServiceAt)
      .toBe("2026-10-15T03:00:00.000Z");
  });

  it("places a walk-in in a gap when its estimated duration fits before the next booking", () => {
    const appointment = booking({
      bookingDateTime: "2026-10-15T09:30:00+07:00"
    });
    const bookedQueueItem = queueItem({
      id: "queue-booking",
      bookingId: appointment.id,
      arrivalAt: "2026-10-15T08:45:00+07:00",
      estimatedDurationMinutes: 30
    });
    const walkIn = queueItem({
      id: "queue-walk-in",
      bookingId: null,
      arrivalAt: referenceTime,
      estimatedDurationMinutes: 30
    });

    const estimates = calculateQueueEstimates(
      [bookedQueueItem, walkIn],
      [appointment],
      referenceTime,
      operationalDate
    );

    expect(estimates[0].id).toBe(walkIn.id);
    expect(estimates[0].estimatedServiceAt).toBe("2026-10-15T01:30:00.000Z");
    expect(estimates[1].id).toBe(bookedQueueItem.id);
    expect(estimates[1].estimatedServiceAt).toBe("2026-10-15T02:30:00.000Z");
  });

  it("does not estimate waiting patients before now when consultation exceeds its planned duration", () => {
    const currentPatient = queueItem({
      id: "queue-consulting",
      visitId: "visit-consulting",
      status: QueueStatus.IN_CONSULTATION,
      arrivalAt: "2026-10-15T07:00:00+07:00",
      actualServiceStartAt: "2026-10-15T07:00:00+07:00",
      estimatedDurationMinutes: 30
    });
    const waitingPatient = queueItem({
      id: "queue-waiting",
      visitId: "visit-waiting",
      sequenceOrder: 3
    });

    const estimate = calculateQueueEstimates(
      [currentPatient, waitingPatient],
      [],
      "2026-10-15T08:30:00+07:00",
      operationalDate
    ).find((item) => item.id === waitingPatient.id);

    expect(new Date(estimate?.estimatedServiceAt || "").getTime())
      .toBeGreaterThanOrEqual(new Date("2026-10-15T08:30:00+07:00").getTime());
  });

  it("offers available walk-in times around active booking windows", () => {
    const availableTimes = getAvailableWalkInServiceTimes(
      [],
      [booking({ bookingDateTime: "2026-10-15T09:00:00+07:00" })],
      referenceTime,
      operationalDate,
      branchId,
      doctorId,
      30,
      "2026-10-15T08:00:00+07:00",
      "2026-10-15T17:00:00+07:00"
    );

    expect(availableTimes.slice(0, 2)).toEqual([
      "2026-10-15T01:30:00.000Z",
      "2026-10-15T02:30:00.000Z"
    ]);
  });

  it("keeps a walk-in at its requested estimate unless queue or bookings push it later", () => {
    const walkIn = queueItem({ preferredServiceAt: "2026-10-15T10:00:00+07:00" });

    const [estimatedWalkIn] = calculateQueueEstimates(
      [walkIn],
      [booking({ bookingDateTime: "2026-10-15T09:00:00+07:00" })],
      referenceTime,
      operationalDate
    );

    expect(estimatedWalkIn.estimatedServiceAt).toBe("2026-10-15T03:00:00.000Z");
  });
});
