import { describe, expect, it, beforeEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { MockDatabase } from "../data/mockData";
import { MockBookingRepository } from "../repositories/mockRepositories";
import { SupabaseBookingRepository } from "../repositories/supabaseRepositories";
import * as supabaseLib from "../lib/supabase";
import {
  BookingStatus,
  BookingSource,
  EmploymentStatus,
  PayrollStatus,
  StaffPosition,
  UserRole
} from "../types/domain";

function setupMockReferralTransfer(accruedAt = new Date().toISOString()) {
  const database = MockDatabase.getInstance();
  const oldStaff = database.staff.find((record) =>
    record.active &&
    record.employmentStatus === EmploymentStatus.ACTIVE &&
    (record.position === StaffPosition.BRANCH_ADMIN || record.position === StaffPosition.ASSISTANT)
  );
  const newStaff = database.staff.find((record) =>
    record.active &&
    record.employmentStatus === EmploymentStatus.ACTIVE &&
    record.id !== oldStaff?.id &&
    (record.position === StaffPosition.BRANCH_ADMIN || record.position === StaffPosition.ASSISTANT)
  );
  const baseBooking = database.bookings[0];
  const baseVisit = database.visits[0];
  const baseTreatment = database.treatmentJobs[0];
  if (!oldStaff || !newStaff || !baseBooking || !baseVisit || !baseTreatment) {
    throw new Error("Mock referral transfer fixtures are incomplete.");
  }

  const bookingId = "booking-referral-transfer";
  const visitId = "visit-referral-transfer";
  const treatmentId = "treatment-referral-transfer";
  const accrualId = "referral-accrual-transfer";
  const booking = { ...baseBooking, id: bookingId, referringStaffId: oldStaff.id };
  const visit = { ...baseVisit, id: visitId, bookingId };
  const treatment = { ...baseTreatment, id: treatmentId, visitId };
  const period = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit"
  }).formatToParts(new Date(accruedAt));
  const year = Number(period.find((part) => part.type === "year")?.value);
  const month = Number(period.find((part) => part.type === "month")?.value);

  database.bookings = [booking];
  database.visits = [visit];
  database.treatmentJobs = [treatment];
  database.accruals = [{
    id: accrualId,
    staffId: oldStaff.id,
    branchId: oldStaff.branchId,
    ruleIdSnapshot: "STAFF_VISIT_REFERRAL_RP3000_V1",
    ruleTypeSnapshot: "STAFF_VISIT_REFERRAL",
    valueSnapshot: 3000,
    baseAmountSnapshot: 100000,
    amount: 3000,
    sourceId: `referral:visit:${visitId}:treatment:${treatmentId}`,
    accruedAt
  }];
  database.payrolls = [];
  database.payrollItems = [];
  database.journals = [];

  return {
    database,
    oldStaff,
    newStaff,
    bookingId,
    accrualId,
    accruedAt,
    year,
    month
  };
}

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

  it("moves an accrued referral and updates both DRAFT payrolls in the mock repository", async () => {
    const {
      database,
      oldStaff,
      newStaff,
      bookingId,
      accrualId,
      accruedAt,
      year,
      month
    } = setupMockReferralTransfer();
    const oldPayrollId = "payroll-old-referrer";
    const newPayrollId = "payroll-new-referrer";

    database.payrolls = [
      {
        id: oldPayrollId,
        staffId: oldStaff.id,
        month,
        year,
        baseSalary: 2500000,
        totalCompensation: 3000,
        totalDeductions: 0,
        netSalary: 2503000,
        status: PayrollStatus.DRAFT,
        branchId: oldStaff.branchId,
        createdAt: accruedAt,
        updatedAt: accruedAt
      },
      {
        id: newPayrollId,
        staffId: newStaff.id,
        month,
        year,
        baseSalary: 2500000,
        totalCompensation: 0,
        totalDeductions: 0,
        netSalary: 2500000,
        status: PayrollStatus.DRAFT,
        branchId: newStaff.branchId,
        createdAt: accruedAt,
        updatedAt: accruedAt
      }
    ];
    database.payrollItems = [
      {
        id: "old-base-item",
        payrollId: oldPayrollId,
        descriptionSnapshot: "Gaji Pokok Periode",
        amountSnapshot: 2500000,
        type: "EARNING"
      },
      {
        id: "old-referral-item",
        payrollId: oldPayrollId,
        descriptionSnapshot: "Insentif Referral Kunjungan",
        amountSnapshot: 3000,
        type: "EARNING",
        sourceId: accrualId
      },
      {
        id: "new-base-item",
        payrollId: newPayrollId,
        descriptionSnapshot: "Gaji Pokok Periode",
        amountSnapshot: 2500000,
        type: "EARNING"
      }
    ];
    database.journals = [];

    const result = await new MockBookingRepository().updateBookingReferral(
      bookingId,
      newStaff.id,
      UserRole.SUPER_ADMIN
    );

    expect(result).toMatchObject({
      booking: { referringStaffId: newStaff.id },
      transferredAccrualCount: 1,
      updatedDraftPayrollCount: 2
    });
    expect(database.accruals[0]).toMatchObject({ staffId: newStaff.id, branchId: newStaff.branchId });
    expect(database.payrollItems.find((item) => item.sourceId === accrualId)?.payrollId).toBe(newPayrollId);
    expect(database.payrolls.find((payroll) => payroll.id === oldPayrollId)).toMatchObject({
      totalCompensation: 0,
      netSalary: 2500000
    });
    expect(database.payrolls.find((payroll) => payroll.id === newPayrollId)).toMatchObject({
      totalCompensation: 3000,
      netSalary: 2503000
    });
  });

  it("rejects referral transfers after the Jakarta payday cutoff", async () => {
    const nowParts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit"
    }).formatToParts(new Date());
    const year = Number(nowParts.find((part) => part.type === "year")?.value);
    const month = Number(nowParts.find((part) => part.type === "month")?.value);
    const accruedAt = new Date(Date.UTC(year, month - 2, 15, 12)).toISOString();
    const { database, oldStaff, newStaff, bookingId, accrualId } = setupMockReferralTransfer(accruedAt);

    await expect(new MockBookingRepository().updateBookingReferral(
      bookingId,
      newStaff.id,
      UserRole.SUPER_ADMIN
    )).rejects.toThrow("melewati batas pemindahan");
    expect(database.bookings[0].referringStaffId).toBe(oldStaff.id);
    expect(database.accruals.find((accrual) => accrual.id === accrualId)?.staffId).toBe(oldStaff.id);
  });

  it("rejects referral transfers when the source payroll is no longer DRAFT", async () => {
    const { database, oldStaff, newStaff, bookingId, accruedAt, year, month } =
      setupMockReferralTransfer();
    database.payrolls = [{
      id: "payroll-under-review",
      staffId: oldStaff.id,
      month,
      year,
      baseSalary: 2500000,
      totalCompensation: 3000,
      totalDeductions: 0,
      netSalary: 2503000,
      status: PayrollStatus.REVIEW,
      branchId: oldStaff.branchId,
      createdAt: accruedAt,
      updatedAt: accruedAt
    }];

    await expect(new MockBookingRepository().updateBookingReferral(
      bookingId,
      newStaff.id,
      UserRole.SUPER_ADMIN
    )).rejects.toThrow("payroll staf lama sudah masuk tahap Review");
    expect(database.bookings[0].referringStaffId).toBe(oldStaff.id);
    expect(database.accruals[0].staffId).toBe(oldStaff.id);
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

  it("stores role-specific configurable treatment referral rates with an active default tariff", () => {
    const migration = fs.readFileSync(
      path.resolve(process.cwd(), "supabase/migrations/20261101000001_staff_referral_incentive_rates.sql"),
      "utf8"
    );
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.staff_referral_incentive_rates");
    expect(migration).toContain("staff_position IN ('BRANCH_ADMIN', 'ASSISTANT')");
    expect(migration).toContain("staff_position, service_name");
    expect(migration).toContain("('BRANCH_ADMIN', NULL, 3000.00)");
    expect(migration).toContain("('ASSISTANT', NULL, 3000.00)");
    expect(migration).not.toContain("'Insersi Behel RA + RB'");
    expect(migration).not.toContain("'Insersi Behel RA atau RB saja'");
    expect(migration).not.toContain("'Insersi GIPAL / Crown PFM'");
    expect(migration).not.toContain("LIKE '%GIPAL%'");
    expect(migration).toContain("public.is_super_admin()");
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

  it("secures shared referral rates and validates clinician-created treatment accruals", () => {
    const migration = fs.readFileSync(
      path.resolve(process.cwd(), "supabase/migrations/20270127000000_secure_shared_referral_incentives.sql"),
      "utf8"
    );
    const repository = fs.readFileSync(
      path.resolve(process.cwd(), "src/repositories/supabaseRepositories.ts"),
      "utf8"
    );

    expect(migration).toContain("CREATE POLICY \"Clinic admins read referral incentive rates\"");
    expect(migration).toContain("REVOKE INSERT, UPDATE, DELETE ON TABLE public.staff_referral_incentive_rates FROM authenticated");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.save_shared_staff_referral_incentive_rate");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.get_treatment_booking_referral_staff");
    expect(migration).toContain("CREATE POLICY \"Validated booking referral accrual insert\"");
    expect(migration).toContain("job.service_name_snapshot");
    expect(migration).toContain("job.status IN ('SELESAI', 'DISERAHKAN')");
    expect(repository).toContain('rpc("save_shared_staff_referral_incentive_rate"');
    expect(repository).toContain('rpc("accrue_visit_staff_incentives"');
    expect(repository).not.toContain('rpc("get_treatment_booking_referral_staff"');
    expect(repository).not.toContain('.from("staff_referral_incentive_rates")\n          .select("id,service_name,amount")');
  });

  it("uses configured maximum incentive tariffs per fully settled visit, not patient payment amounts", () => {
    const migration = fs.readFileSync(
      path.resolve(process.cwd(), "supabase/migrations/20270212000000_visit_level_staff_incentives.sql"),
      "utf8"
    );
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.accrue_visit_staff_incentives");
    expect(migration).toContain("invoice.status <> 'PAID'");
    expect(migration).toContain("job.status NOT IN ('SELESAI', 'DISERAHKAN')");
    expect(migration).toContain("ROW_NUMBER() OVER (ORDER BY rate.amount DESC");
    expect(migration).toContain("public.staff_referral_incentive_rates");
    expect(migration).toContain("public.assistant_treatment_incentive_rates");
    expect(migration).toContain("'STAFF_VISIT_REFERRAL_RP3000_V1'");
    expect(migration).toContain("'ASSISTANT_TREATMENT_BASE_V1'");
    expect(migration).toContain("value_snapshot, base_amount_snapshot, amount, source_id, accrued_at");
    expect(migration).toContain("'STAFF_VISIT_REFERRAL', v_referral_amount, 0, v_referral_amount");
    expect(migration).toContain("'FIXED_PER_TREATMENT', v_assistant_amount, 0, v_assistant_amount");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.compensation_incentive_adjustments");
    expect(migration).toContain("kelebihan bayar tidak dipotong otomatis");
    expect(migration).toContain("FROM public.payroll_items item");
    expect(migration).toContain("journal.source_type = 'COMPENSATION'");
  });

  it("validates clinician referral accrual rates through a narrowly scoped definer function", () => {
    const migration = fs.readFileSync(
      path.resolve(process.cwd(), "supabase/migrations/20270128000000_fix_referral_accrual_rate_policy.sql"),
      "utf8"
    );
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.get_treatment_booking_referral_rate");
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("referral_staff.id = p_staff_id");
    expect(migration).toContain("public.user_can_manage_treatment_branch(v_branch_id)");
    expect(migration).toContain("amount = public.get_treatment_booking_referral_rate(job.id, referral_staff.id)");
  });

  it("transfers booking referral incentives only before payday and refreshes draft payroll snapshots", () => {
    const migration = fs.readFileSync(
      path.resolve(process.cwd(), "supabase/migrations/20270129000000_transfer_booking_referral_incentives.sql"),
      "utf8"
    );
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.transfer_booking_referral_incentives");
    expect(migration).toContain("NOT public.is_super_admin()");
    expect(migration).toContain("accrual.rule_id_snapshot = 'STAFF_VISIT_REFERRAL_RP3000_V1'");
    expect(migration).toContain("AT TIME ZONE 'Asia/Jakarta'");
    expect(migration).toContain("Insentif sudah melewati batas pemindahan sebelum tanggal 1 bulan gajian.");
    expect(migration).toContain("status <> 'DRAFT'");
    expect(migration).toContain("UPDATE public.compensation_accruals");
    expect(migration).toContain("UPDATE public.payroll_items");
    expect(migration).toContain("updated_draft_payroll_count");
  });

  it("uses the guarded database function to update a referral and transfer accrued incentives", async () => {
    vi.spyOn(supabaseLib, "isSupabaseConfigured", "get").mockReturnValue(true);
    const bookingId = "00000000-0000-4000-8000-000000000001";
    const referringStaffId = "00000000-0000-4000-8000-000000000002";
    const rpc = vi.spyOn(supabaseLib.supabase, "rpc").mockResolvedValue({
      data: {
        booking_data: {
          id: bookingId,
          patient_id: "00000000-0000-4000-8000-000000000003",
          branch_id: "00000000-0000-4000-8000-000000000004",
          doctor_id: "00000000-0000-4000-8000-000000000005",
          booking_date_time: "2026-10-15T02:00:00.000Z",
          status: "CONFIRMED",
          referring_staff_id: referringStaffId,
          created_at: "2026-10-01T00:00:00.000Z",
          updated_at: "2026-10-20T00:00:00.000Z"
        },
        transferred_accrual_count: 2,
        updated_draft_payroll_count: 1
      },
      error: null
    } as any);

    const result = await new SupabaseBookingRepository().updateBookingReferral(
      bookingId,
      referringStaffId,
      UserRole.SUPER_ADMIN
    );

    expect(rpc).toHaveBeenCalledWith("transfer_booking_referral_incentives", {
      p_booking_id: bookingId,
      p_referring_staff_id: referringStaffId
    });
    expect(result).toMatchObject({
      booking: { id: bookingId, referringStaffId },
      transferredAccrualCount: 2,
      updatedDraftPayrollCount: 1
    });
  });
});
