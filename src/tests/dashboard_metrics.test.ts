import { describe, expect, it } from "vitest";
import {
  Booking,
  BookingStatus,
  PatientVisit,
  QueueItem,
  QueueStatus,
  TreatmentJob,
  TreatmentJobStatus,
  VisitStatus,
  VisitType
} from "../types/domain";
import { getDashboardTodayRecords } from "../utils/dashboardMetrics";

describe("dashboard daily metrics", () => {
  it("limits visits, bookings, active queues, and ongoing treatments to today and the selected branch", () => {
    const visit = (id: string, branchId: string, visitDateTime: string): PatientVisit => ({
      id,
      patientId: `patient-${id}`,
      branchId,
      visitDateTime,
      visitType: VisitType.BOOKING,
      visitStatus: VisitStatus.WAITING,
      bookingId: null,
      createdAt: visitDateTime,
      updatedAt: visitDateTime
    });
    const booking = (id: string, branchId: string, bookingDateTime: string): Booking => ({
      id,
      patientId: `patient-${id}`,
      branchId,
      doctorId: "doctor-1",
      bookingDateTime,
      status: BookingStatus.CONFIRMED,
      createdAt: bookingDateTime,
      updatedAt: bookingDateTime
    });
    const queueItem = (id: string, branchId: string, arrivalAt: string, status: QueueStatus): QueueItem => ({
      id,
      branchId,
      doctorId: "doctor-1",
      visitId: `visit-${id}`,
      queueNumber: "A-01",
      status,
      arrivalAt,
      estimatedDurationMinutes: 30,
      createdAt: arrivalAt,
      updatedAt: arrivalAt
    });
    const treatment = (id: string, branchId: string, startedAt: string): TreatmentJob => ({
      id,
      visitId: `visit-${id}`,
      patientId: `patient-${id}`,
      branchId,
      doctorId: "doctor-1",
      serviceId: "service-1",
      status: TreatmentJobStatus.DALAM_PROSES,
      serviceNameSnapshot: "Pemeriksaan",
      doctorNameSnapshot: "Dokter",
      createdAt: startedAt,
      startedAt,
      updatedAt: startedAt
    });

    const records = getDashboardTodayRecords({
      today: "2026-11-01",
      branchId: "branch-gebang",
      visits: [
        visit("today", "branch-gebang", "2026-10-31T18:00:00.000Z"),
        visit("yesterday", "branch-gebang", "2026-10-31T10:00:00.000Z"),
        visit("other-branch", "branch-ambulu", "2026-10-31T18:00:00.000Z")
      ],
      bookings: [
        booking("today", "branch-gebang", "2026-10-31T18:00:00.000Z"),
        booking("yesterday", "branch-gebang", "2026-10-31T10:00:00.000Z")
      ],
      queueItems: [
        queueItem("today", "branch-gebang", "2026-10-31T18:00:00.000Z", QueueStatus.WAITING),
        queueItem("yesterday", "branch-gebang", "2026-10-31T10:00:00.000Z", QueueStatus.WAITING),
        queueItem("completed", "branch-gebang", "2026-10-31T18:00:00.000Z", QueueStatus.COMPLETED)
      ],
      treatmentJobs: [
        treatment("today", "branch-gebang", "2026-10-31T18:00:00.000Z"),
        treatment("yesterday", "branch-gebang", "2026-10-31T10:00:00.000Z")
      ]
    });

    expect(records.todayVisits.map((record) => record.id)).toEqual(["today"]);
    expect(records.todayBookings.map((record) => record.id)).toEqual(["today"]);
    expect(records.activeQueues.map((record) => record.id)).toEqual(["today"]);
    expect(records.ongoingTreatments.map((record) => record.id)).toEqual(["today"]);
  });
});
