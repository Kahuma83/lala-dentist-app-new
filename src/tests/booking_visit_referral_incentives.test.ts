import { describe, expect, it, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { MockDatabase } from "../data/mockData";
import { MockBookingRepository } from "../repositories/mockRepositories";
import { BookingStatus, BookingSource, UserRole } from "../types/domain";

describe("Booking visit referral incentives", () => {
  beforeEach(() => {
    MockDatabase.resetInstance();
  });

  it("persists only active branch admins or assistants as booking referrers", async () => {
    const repository = new MockBookingRepository();
    const booking = await repository.createBooking({
      patientId: "patient-1",
      branchId: "branch-gebang",
      doctorId: "doc-syafira",
      bookingDateTime: "2030-01-03T09:00:00+07:00",
      timeSlot: "09:00",
      referringStaffId: "staff-ast-clary",
      status: BookingStatus.PENDING,
      source: BookingSource.FRONT_DESK
    }, UserRole.SUPER_ADMIN);

    expect(booking.referringStaffId).toBe("staff-ast-clary");
    await expect(repository.createBooking({
      patientId: "patient-1",
      branchId: "branch-gebang",
      doctorId: "doc-syafira",
      bookingDateTime: "2030-01-04T09:00:00+07:00",
      timeSlot: "09:00",
      referringStaffId: "staff-anisa-ambulu"
    }, UserRole.SUPER_ADMIN)).rejects.toThrow("Staf referral harus admin atau asisten aktif pada cabang booking.");
  });

  it("adds booking-level attribution and one-per-visit uniqueness in Supabase", () => {
    const migration = fs.readFileSync(
      path.resolve(process.cwd(), "supabase/migrations/20261029000000_booking_visit_referral_incentives.sql"),
      "utf8"
    );
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS referring_staff_id UUID");
    expect(migration).toContain("position IN ('BRANCH_ADMIN', 'ASSISTANT')");
    expect(migration).toContain("uq_staff_visit_referral_accrual_per_visit");
    expect(migration).toContain("'STAFF_VISIT_REFERRAL_RP3000_V1'");
  });

  it("validates the selected branch staff in both booking server endpoints", () => {
    const server = fs.readFileSync(path.resolve(process.cwd(), "server.js"), "utf8");
    const pagesFunction = fs.readFileSync(
      path.resolve(process.cwd(), "functions/api/bookings.js"),
      "utf8"
    );

    for (const route of [server, pagesFunction]) {
      expect(route).toContain("referring_staff_id");
      expect(route).toContain("BRANCH_ADMIN");
      expect(route).toContain("ASSISTANT");
      expect(route).toContain("employment_status");
      expect(route).toContain("Pasien tidak dapat menetapkan staf referral pada booking.");
    }
  });
});
