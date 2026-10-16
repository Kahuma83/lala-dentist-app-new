import { describe, expect, it } from "vitest";
import { PatientVisit, VisitStatus, VisitType } from "../types/domain";
import { getNewPatientAcquisitionSources, getPatientVisitAnalytics } from "../utils/patientVisitAnalytics";

const visit = (
  id: string,
  patientId: string,
  branchId: string,
  visitDateTime: string,
  visitStatus = VisitStatus.COMPLETED
): PatientVisit => ({
  id,
  patientId,
  branchId,
  visitDateTime,
  visitType: VisitType.WALK_IN,
  visitStatus,
  bookingId: null,
  createdAt: visitDateTime,
  updatedAt: visitDateTime
});

describe("patient visit analytics", () => {
  it("counts clinic-wide first-time patients and returning unique patients for the previous month", () => {
    const result = getPatientVisitAnalytics([
      visit("old-visit", "existing-patient", "branch-a", "2026-04-02T10:00:00+07:00"),
      visit("return-a", "existing-patient", "branch-b", "2026-09-03T10:00:00+07:00"),
      visit("return-b", "existing-patient", "branch-a", "2026-09-12T10:00:00+07:00"),
      visit("new-a", "new-patient", "branch-b", "2026-09-04T10:00:00+07:00"),
      visit("new-b", "new-patient", "branch-c", "2026-09-15T10:00:00+07:00"),
      visit("cancelled", "cancelled-only-patient", "branch-a", "2026-09-10T10:00:00+07:00", VisitStatus.CANCELLED)
    ], new Date("2026-10-15T12:00:00+07:00"));

    expect(result.months).toHaveLength(12);
    expect(result.lastMonth.month).toBe("2026-09");
    expect(result.lastMonth.newPatients).toBe(1);
    expect(result.lastMonth.existingPatients).toBe(1);
    expect(result.lastMonth.uniquePatients).toBe(2);
    expect(result.lastMonth.visits).toBe(4);
    expect(result.lastMonth.newPercent).toBe(50);
    expect(result.lastMonth.existingPercent).toBe(50);
  });

  it("uses the first non-cancelled visit across all available history", () => {
    const result = getPatientVisitAnalytics([
      visit("cancelled-first", "patient-1", "branch-a", "2026-02-10T09:00:00+07:00", VisitStatus.CANCELLED),
      visit("actual-first", "patient-1", "branch-a", "2026-05-10T09:00:00+07:00"),
      visit("return", "patient-1", "branch-c", "2026-09-10T09:00:00+07:00")
    ], new Date("2026-10-15T12:00:00+07:00"));

    expect(result.lastMonth.newPatients).toBe(0);
    expect(result.lastMonth.existingPatients).toBe(1);
    expect(result.months.find((month) => month.month === "2026-05")?.newPatients).toBe(1);
  });

  it("returns zero percentages when no patients visited during the month", () => {
    const result = getPatientVisitAnalytics([], new Date("2026-10-15T12:00:00+07:00"));

    expect(result.lastMonth.uniquePatients).toBe(0);
    expect(result.lastMonth.existingPercent).toBe(0);
    expect(result.lastMonth.newPercent).toBe(0);
  });

  it("breaks down first-time patients by acquisition source and includes unknown sources", () => {
    const visits = [
      visit("new-google", "patient-google", "branch-a", "2026-09-04T10:00:00+07:00"),
      visit("new-referral", "patient-referral", "branch-b", "2026-09-08T10:00:00+07:00"),
      visit("new-referral-return", "patient-referral", "branch-a", "2026-09-15T10:00:00+07:00"),
      visit("new-unknown", "patient-unknown", "branch-a", "2026-09-12T10:00:00+07:00"),
      visit("cancelled-only", "cancelled-patient", "branch-a", "2026-09-12T10:00:00+07:00", VisitStatus.CANCELLED)
    ];
    const sources = getNewPatientAcquisitionSources(visits, [
      { id: "patient-google", acquisitionSource: "GOOGLE_MAPS" },
      { id: "patient-referral", acquisitionSource: "REFERRAL" }
    ], "2026-09");

    expect(sources.find((source) => source.source === "GOOGLE_MAPS")?.patients).toBe(1);
    expect(sources.find((source) => source.source === "REFERRAL")?.patients).toBe(1);
    expect(sources.find((source) => source.source === "UNKNOWN")?.patients).toBe(1);
    expect(sources.find((source) => source.source === "UNKNOWN")?.percent).toBeCloseTo(33.33, 1);
    expect(sources.reduce((total, source) => total + source.patients, 0)).toBe(3);
  });

  it("does not count existing patients in the new-patient acquisition breakdown", () => {
    const sources = getNewPatientAcquisitionSources([
      visit("old-visit", "existing-patient", "branch-a", "2026-05-01T10:00:00+07:00"),
      visit("return", "existing-patient", "branch-b", "2026-09-04T10:00:00+07:00")
    ], [
      { id: "existing-patient", acquisitionSource: "INSTAGRAM" }
    ], "2026-09");

    expect(sources.reduce((total, source) => total + source.patients, 0)).toBe(0);
  });
});
