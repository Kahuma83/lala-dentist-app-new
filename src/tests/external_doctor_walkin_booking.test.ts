import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { getBookingDoctorDisplayName } from "../utils/doctorNameUtils";

describe("External doctor Walk-In booking", () => {
  const migration = fs.readFileSync(
    path.resolve(process.cwd(), "supabase/migrations/20270215000000_enable_approved_external_doctor_walk_in_booking.sql"),
    "utf-8"
  );
  const bookingPage = fs.readFileSync(
    path.resolve(process.cwd(), "src/pages/BookingManagement.tsx"),
    "utf-8"
  );
  const bookingRepository = fs.readFileSync(
    path.resolve(process.cwd(), "src/repositories/supabaseRepositories.ts"),
    "utf-8"
  );
  const bookingApi = fs.readFileSync(
    path.resolve(process.cwd(), "functions/api/bookings.js"),
    "utf-8"
  );

  it("only exposes active approved assignments for the user's branch and today's date", () => {
    expect(migration).toMatch(/get_walkin_external_doctors/i);
    expect(migration).toMatch(/request\.status = 'APPROVED'/i);
    expect(migration).toMatch(/assignment\.branch_id = p_branch_id/i);
    expect(migration).toMatch(/assignment\.covered_date = p_covered_date/i);
    expect(migration).toMatch(/user_can_access_branch\(p_branch_id\)/i);
    expect(migration).toMatch(/p_covered_date IS DISTINCT FROM \(timezone\('Asia\/Jakarta', now\(\)\)\)::DATE/i);
  });

  it("validates external assignments in both database and booking API writes", () => {
    expect(migration).toMatch(/guard_external_doctor_booking_assignment/i);
    expect(migration).toMatch(/assignment\.external_doctor_id = NEW\.external_doctor_id/i);
    expect(migration).toMatch(/assignment\.branch_id = NEW\.branch_id/i);
    expect(bookingApi).toContain("/rest/v1/rpc/get_walkin_external_doctors");
    expect(bookingApi).toMatch(/payload\.source !== "WALK_IN"/);
    expect(bookingApi).toMatch(/assignment\.doctor_id === payload\.doctor_id/);
  });

  it("passes the assigned external doctor through Walk-In booking creation", () => {
    expect(bookingPage).toContain('supabase.rpc("get_walkin_external_doctors"');
    expect(bookingPage).toContain("externalDoctorId: selectedExternalDoctor?.external_doctor_id ?? null");
    expect(bookingRepository).toContain("external_doctor_id = bookingData.externalDoctorId");
  });

  it("shows the external provider snapshot instead of the absent internal doctor", () => {
    expect(getBookingDoctorDisplayName(
      {
        doctorId: "absent-doctor",
        externalDoctorId: "external-imanda",
        doctorNameSnapshot: "drg. Imanda"
      },
      [{ id: "absent-doctor", name: "drg. AAB" }]
    )).toBe("drg. Imanda");
  });
});
