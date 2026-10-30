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

  it("persists active branch admins or assistants from any branch as booking referrers", async () => {
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
    const crossBranchBooking = await repository.createBooking({
      patientId: "patient-1",
      branchId: "branch-gebang",
      doctorId: "doc-syafira",
      bookingDateTime: "2030-01-04T09:00:00+07:00",
      timeSlot: "09:00",
      referringStaffId: "staff-anisa-ambulu"
    }, UserRole.SUPER_ADMIN);
    expect(crossBranchBooking.referringStaffId).toBe("staff-anisa-ambulu");

    await expect(repository.createBooking({
      patientId: "patient-1",
      branchId: "branch-gebang",
      doctorId: "doc-syafira",
      bookingDateTime: "2030-01-05T09:00:00+07:00",
      timeSlot: "09:00",
      referringStaffId: "staff-doc-syafira"
    }, UserRole.SUPER_ADMIN)).rejects.toThrow("Staf referral harus admin atau asisten aktif.");
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

  it("validates active admin and assistant referrers in both booking server endpoints", () => {
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
      expect(route).not.toContain("referringStaff.branch_id !== payload.branch_id");
    }
  });

  it("allows cross-branch referrers and exposes only the minimal active admin/assistant directory", () => {
    const migration = fs.readFileSync(
      path.resolve(process.cwd(), "supabase/migrations/20270111000000_cross_branch_booking_referral_staff.sql"),
      "utf8"
    );
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.get_booking_referral_staff()");
    expect(migration).toContain("account.role IN ('SUPER_ADMIN', 'BRANCH_ADMIN')");
    expect(migration).toContain("referral_staff.position IN ('BRANCH_ADMIN', 'ASSISTANT')");
    expect(migration).toContain("referral_staff.employment_status = 'ACTIVE'");
    expect(migration).not.toContain("referral_staff.branch_id = NEW.branch_id");
  });
});
