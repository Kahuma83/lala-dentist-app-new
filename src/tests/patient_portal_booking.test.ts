import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { DoctorSchedule, ScheduleStatus } from "../types/domain";
import { getScheduledBookingTimeSlots } from "../utils/bookingScheduleUtils";

const schedule: DoctorSchedule = {
  id: "schedule-1",
  doctorId: "doctor-1",
  branchId: "branch-1",
  date: "2026-11-05",
  startTime: "09:30",
  endTime: "15:00",
  status: ScheduleStatus.ACTIVE,
  createdAt: "",
  updatedAt: ""
};

describe("patient portal booking time slots", () => {
  it("only returns standard slots within the doctor's schedule", () => {
    expect(getScheduledBookingTimeSlots(schedule)).toEqual(["10:30", "11:00", "13:00", "14:30"]);
  });

  it("offers the schedule start when no standard slot falls inside its hours", () => {
    expect(getScheduledBookingTimeSlots({ ...schedule, startTime: "08:15", endTime: "08:45" })).toEqual(["08:15"]);
  });

  it("normalizes database time values that include seconds", () => {
    expect(getScheduledBookingTimeSlots({ ...schedule, startTime: "09:00:00", endTime: "11:00:00" })).toEqual(["09:00", "10:30"]);
  });

  it("restricts patient inserts to their own pending booking on a valid schedule", () => {
    const migration = fs.readFileSync(path.resolve(
      process.cwd(),
      "supabase/migrations/20261105000000_enable_patient_portal_booking.sql"
    ), "utf8");
    const patientPolicyStart = migration.indexOf('CREATE POLICY "Booking patient create own scheduled request"');
    const patientPolicy = migration.slice(patientPolicyStart);

    expect(patientPolicy).toContain("FOR INSERT");
    expect(migration).toContain("public.get_user_role() IS DISTINCT FROM 'PATIENT'");
    expect(migration).toContain("p_patient_id::TEXT IS DISTINCT FROM public.get_user_patient_id()::TEXT");
    expect(migration).toContain("p_status IS DISTINCT FROM 'PENDING'");
    expect(migration).toContain("schedule.status = 'ACTIVE'");
    expect(patientPolicy).toContain("source = 'PATIENT_PORTAL'");
    expect(patientPolicy).toContain("channel = 'PATIENT_PORTAL'");
    expect(migration).toContain("public.get_user_role() IS DISTINCT FROM 'PATIENT'");
    expect(migration).toContain("CREATE POLICY \"Booking branch isolation select\"");
    expect(migration).toContain("Booking staff branch isolation manage");
  });

  it("validates the authenticated patient's linked profile in the booking API", () => {
    const server = fs.readFileSync(path.resolve(process.cwd(), "server.js"), "utf8");
    const bookingsRouteStart = server.indexOf("app.post('/api/bookings'");
    const bookingsRouteEnd = server.indexOf("app.listen(", bookingsRouteStart);
    const bookingsRoute = server.slice(bookingsRouteStart, bookingsRouteEnd);

    expect(bookingsRoute).toContain("actorAccount.patient_id");
    expect(bookingsRoute).toContain("payload.patient_id");
    expect(bookingsRoute).toContain("actorAccount.role === 'PATIENT'");
    expect(bookingsRoute).toContain("payload.source = 'PATIENT_PORTAL'");
  });

  it("allows only one unfinished patient-portal booking across dates and branches", () => {
    const migration = fs.readFileSync(path.resolve(
      process.cwd(),
      "supabase/migrations/20261109000000_prevent_multiple_active_patient_portal_bookings.sql"
    ), "utf8");
    const portal = fs.readFileSync(path.resolve(process.cwd(), "src/pages/PatientPortalHome.tsx"), "utf8");
    const server = fs.readFileSync(path.resolve(process.cwd(), "server.js"), "utf8");

    expect(migration).toContain("NEW.source IS DISTINCT FROM 'PATIENT_PORTAL'");
    expect(migration).toContain("hashtextextended(NEW.patient_id::TEXT, 0)");
    expect(migration).toContain("b.status IN ('PENDING', 'CONFIRMED', 'RESCHEDULED')");
    expect(migration).not.toContain("b.branch_id = NEW.branch_id");
    expect(migration).not.toContain("booking_day");
    expect(portal).toContain("const activePatientBooking = currentUser?.patientId");
    expect(portal).toContain("|| !!activePatientBooking");
    expect(server).toContain(".in('status', ['PENDING', 'CONFIRMED', 'RESCHEDULED'])");
    expect(server).toContain("Anda masih memiliki janji temu yang belum selesai.");
  });

  it("allows completed bookings and marks bookings completed when their queue visit is completed", () => {
    const migration = fs.readFileSync(path.resolve(
      process.cwd(),
      "supabase/migrations/20261110000000_complete_bookings_after_queue_service.sql"
    ), "utf8");
    const schema = fs.readFileSync(path.resolve(
      process.cwd(),
      "supabase/migrations/consolidated_lala_dentist_production_schema.sql"
    ), "utf8");

    expect(migration).toContain("'CONFIRMED', 'COMPLETED', 'CANCELLED'");
    expect(migration).toContain("IF NEW.status = 'COMPLETED' THEN");
    expect(migration).toContain("SET status = 'COMPLETED'");
    expect(migration).toContain("latest.status = 'COMPLETED'");
    expect(schema).toContain("'CONFIRMED', 'COMPLETED', 'CANCELLED', 'RESCHEDULED'");
  });

  it("makes active branch schedules and their active doctors visible to portal patients", () => {
    const migration = fs.readFileSync(path.resolve(
      process.cwd(),
      "supabase/migrations/20261106000000_expose_scheduled_doctors_to_patient_portal.sql"
    ), "utf8");

    expect(migration).toContain("public.get_user_role() = 'PATIENT'");
    expect(migration).toContain("AND status = 'ACTIVE'");
    expect(migration).toContain("AND public.is_active_branch(branch_id)");
    expect(migration).toContain("AND public.is_active_doctor(doctor_id)");
    expect(migration).toContain("FROM public.doctor_schedules schedule");
    expect(migration).toContain("schedule.doctor_id = dental_doctors.id");
    expect(migration).toContain("schedule.date = operational_datetime::DATE");
    expect(migration).not.toContain("OR NOT public.is_valid_doctor_schedule(p_doctor_id, p_branch_id)");
  });

  it("avoids recursive RLS by checking scheduled doctors through a security definer helper", () => {
    const migration = fs.readFileSync(path.resolve(
      process.cwd(),
      "supabase/migrations/20261107000000_fix_patient_schedule_rls_recursion.sql"
    ), "utf8");

    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("public.doctor_has_active_portal_schedule(id)");
    expect(migration).toContain("FROM public.doctor_schedules schedule");
    expect(migration).not.toContain("AND EXISTS (");
  });

  it("limits portal history reads to the linked patient and keeps visit and queue writes staff-only", () => {
    const migration = fs.readFileSync(path.resolve(
      process.cwd(),
      "supabase/migrations/20261108000000_patient_portal_history_access.sql"
    ), "utf8");
    const repository = fs.readFileSync(path.resolve(process.cwd(), "src/repositories/supabaseRepositories.ts"), "utf8");
    const visitRead = migration.slice(
      migration.indexOf('CREATE POLICY "Patient visit read own or staff branch"'),
      migration.indexOf('CREATE POLICY "Staff manage visits by branch"')
    );
    const queueRead = migration.slice(
      migration.indexOf('CREATE POLICY "Patient queue read own or staff branch"'),
      migration.indexOf('CREATE POLICY "Staff manage queue by branch"')
    );
    const paymentRead = migration.slice(
      migration.indexOf('CREATE POLICY "Payment read own invoice or staff branch"'),
      migration.indexOf('CREATE POLICY "Staff manage payments by branch"')
    );
    const getVisitsByPatient = repository.slice(
      repository.indexOf("async getVisitsByPatient("),
      repository.indexOf("async getVisitsByBranch(", repository.indexOf("async getVisitsByPatient("))
    );
    const getInvoicesByPatient = repository.slice(
      repository.indexOf("async getInvoicesByPatient("),
      repository.indexOf("async createInvoice(", repository.indexOf("async getInvoicesByPatient("))
    );
    const getInvoiceItemsByInvoices = repository.slice(
      repository.indexOf("async getInvoiceItemsByInvoices("),
      repository.indexOf("async getInvoicesByBranch(", repository.indexOf("async getInvoiceItemsByInvoices("))
    );
    const getPaymentsByInvoices = repository.slice(
      repository.indexOf("async getPaymentsByInvoices("),
      repository.indexOf("async createPayment(", repository.indexOf("async getPaymentsByInvoices("))
    );

    expect(visitRead).toContain("patient_id::TEXT = public.get_user_patient_id()::TEXT");
    expect(queueRead).toContain("patient_id::TEXT = public.get_user_patient_id()::TEXT");
    expect(paymentRead).toContain("invoice.patient_id::TEXT = public.get_user_patient_id()::TEXT");
    expect(migration).toContain("CREATE POLICY \"Invoice items read own or staff branch\"");
    expect(getVisitsByPatient).toContain('.eq("patient_id", patientId)');
    expect(getVisitsByPatient).not.toContain("await this.getVisits()");
    expect(getInvoicesByPatient).toContain('.eq("patient_id", patientId)');
    expect(getInvoicesByPatient).not.toContain("await this.getInvoices()");
    expect(getInvoiceItemsByInvoices).toContain('.in("invoice_id", invoiceIds)');
    expect(getPaymentsByInvoices).toContain('.in("invoice_id", invoiceIds)');
  });
});
