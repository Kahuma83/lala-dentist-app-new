import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("Doctor booking duration overlap protection", () => {
  const migration = fs.readFileSync(
    path.resolve(process.cwd(), "supabase/migrations/20261230000000_prevent_overlapping_doctor_bookings.sql"),
    "utf-8"
  );

  it("rejects overlapping time intervals using planned treatment durations", () => {
    expect(migration).toContain("planned_treatments");
    expect(migration).toContain("public.booking_planned_duration_minutes(b.planned_treatments)");
    expect(migration).toContain("make_interval(mins => new_duration_minutes)");
    expect(migration).toContain("NEW.booking_date_time < b.booking_date_time + make_interval(mins => public.booking_planned_duration_minutes(b.planned_treatments))");
    expect(migration).toContain("b.booking_date_time < new_end_at");
    expect(migration).toContain("pg_advisory_xact_lock(doctor_lock_key)");
    expect(migration).not.toContain("date_trunc('minute'");
    expect(migration).toContain("public.get_patient_available_booking_slots");
    expect(migration).toContain("public.queue_items queue");
  });

  it("rechecks conflicts when the planned treatment duration changes", () => {
    expect(migration).toContain("UPDATE OF branch_id, doctor_id, booking_date_time, status, planned_treatments");
  });
});