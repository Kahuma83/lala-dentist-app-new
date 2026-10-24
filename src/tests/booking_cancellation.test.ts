import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { Booking, BookingStatus, PatientVisit, QueueItem, QueueStatus, VisitStatus } from "../types/domain";
import { getCheckInCancellationBlockReason } from "../utils/bookingCancellation";

const booking: Booking = {
  id: "booking-1",
  patientId: "patient-1",
  branchId: "branch-1",
  doctorId: "doctor-1",
  bookingDateTime: "2026-10-25T01:30:00.000Z",
  status: BookingStatus.CONFIRMED,
  createdAt: "",
  updatedAt: ""
};

const visit: PatientVisit = {
  id: "visit-1",
  patientId: booking.patientId,
  branchId: booking.branchId,
  visitDateTime: booking.bookingDateTime,
  visitType: "BOOKING" as PatientVisit["visitType"],
  visitStatus: VisitStatus.WAITING,
  bookingId: booking.id,
  createdAt: "",
  updatedAt: ""
};

const queueItem: QueueItem = {
  id: "queue-1",
  visitId: visit.id,
  bookingId: booking.id,
  branchId: booking.branchId,
  doctorId: booking.doctorId,
  patientId: booking.patientId,
  patientNameSnapshot: "Pasien",
  queueNumber: "A-01",
  sequenceOrder: 1,
  estimatedDurationMinutes: 30,
  status: QueueStatus.WAITING,
  arrivalAt: booking.bookingDateTime,
  createdAt: "",
  updatedAt: ""
};

describe("accidental check-in cancellation safeguards", () => {
  it("allows cancellation when the linked visit and queue are still waiting", () => {
    expect(getCheckInCancellationBlockReason(booking, [visit], [queueItem])).toBeNull();
  });

  it("allows cancellation when check-in has set the visit to triage but the queue is still waiting", () => {
    expect(getCheckInCancellationBlockReason(
      booking,
      [{ ...visit, visitStatus: VisitStatus.IN_TRIAGE }],
      [queueItem]
    )).toBeNull();
  });

  it("blocks cancellation after the queue has been called", () => {
    expect(getCheckInCancellationBlockReason(
      booking,
      [visit],
      [{ ...queueItem, status: QueueStatus.IN_PREPARATION }]
    )).toContain("sudah dipanggil");
  });

  it("blocks cancellation after treatment has started", () => {
    expect(getCheckInCancellationBlockReason(
      booking,
      [{ ...visit, visitStatus: VisitStatus.IN_TREATMENT }],
      [queueItem]
    )).toContain("Pemeriksaan atau tindakan sudah dimulai");
  });

  it("blocks cancellation without an active linked visit", () => {
    expect(getCheckInCancellationBlockReason(
      booking,
      [{ ...visit, visitStatus: VisitStatus.CANCELLED }],
      [queueItem]
    )).toContain("Kunjungan aktif");
  });

  it("allows cancellation when check-in created a visit but no queue record is available", () => {
    expect(getCheckInCancellationBlockReason(booking, [visit], [])).toBeNull();
  });

  it("blocks cancellation for a booking that is no longer active", () => {
    expect(getCheckInCancellationBlockReason(
      { ...booking, status: BookingStatus.CANCELLED },
      [visit],
      [queueItem]
    )).toContain("janji temu aktif");
  });

  it("adds a persistent cancellation-reason column for Supabase bookings", () => {
    const migration = fs.readFileSync(path.resolve(
      process.cwd(),
      "supabase/migrations/20261221000000_add_booking_cancellation_reason.sql"
    ), "utf8");
    const schema = fs.readFileSync(path.resolve(
      process.cwd(),
      "supabase/migrations/consolidated_lala_dentist_production_schema.sql"
    ), "utf8");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS cancellation_reason TEXT");
    expect(schema).toContain("cancellation_reason TEXT");
  });
});
