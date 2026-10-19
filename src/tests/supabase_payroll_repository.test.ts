import { beforeEach, describe, expect, it, vi } from "vitest";
import { SupabaseOvertimeRepository, SupabasePayrollRepository } from "../repositories/supabaseRepositories";
import * as supabaseLib from "../lib/supabase";
import { UserRole } from "../types/domain";

interface QueryCall {
  table: string;
  action: string;
  filters: Array<[string, string, unknown]>;
  payload?: unknown;
}

function createQuery(
  table: string,
  calls: QueryCall[],
  resolve: (call: QueryCall) => { data: any; error: null | { message: string } }
) {
  const call: QueryCall = { table, action: "select", filters: [] };
  calls.push(call);
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn((column: string, value: unknown) => {
      call.filters.push(["eq", column, value]);
      return query;
    }),
    in: vi.fn((column: string, value: unknown) => {
      call.filters.push(["in", column, value]);
      return query;
    }),
    gte: vi.fn((column: string, value: unknown) => {
      call.filters.push(["gte", column, value]);
      return query;
    }),
    lt: vi.fn((column: string, value: unknown) => {
      call.filters.push(["lt", column, value]);
      return query;
    }),
    not: vi.fn((column: string, operator: string, value: unknown) => {
      call.filters.push(["not", `${column}.${operator}`, value]);
      return query;
    }),
    insert: vi.fn((payload: unknown) => {
      call.action = "insert";
      call.payload = payload;
      return query;
    }),
    update: vi.fn((payload: unknown) => {
      call.action = "update";
      call.payload = payload;
      return query;
    }),
    delete: vi.fn(() => {
      call.action = "delete";
      return query;
    }),
    maybeSingle: vi.fn(() => Promise.resolve(resolve(call))),
    single: vi.fn(() => Promise.resolve(resolve(call))),
    then: (onFulfilled: (result: unknown) => unknown, onRejected?: (error: unknown) => unknown) =>
      Promise.resolve(resolve(call)).then(onFulfilled, onRejected)
  };
  return query;
}

describe("Supabase payroll repository", () => {
  let payrollRepo: SupabasePayrollRepository;
  let calls: QueryCall[];

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(supabaseLib, "isSupabaseConfigured", "get").mockReturnValue(true);
    payrollRepo = new SupabasePayrollRepository();
    calls = [];
  });

  describe("Supabase overtime repository", () => {
    let overtimeRepo: SupabaseOvertimeRepository;
    let calls: QueryCall[];

    beforeEach(() => {
      vi.restoreAllMocks();
      vi.spyOn(supabaseLib, "isSupabaseConfigured", "get").mockReturnValue(true);
      overtimeRepo = new SupabaseOvertimeRepository();
      calls = [];
    });

    it("persists submission status to the overtime record", async () => {
      const record = {
        id: "overtime-1",
        staff_id: "staff-1",
        branch_id: "branch-1",
        attendance_id: "attendance-1",
        date: "2026-10-12",
        scheduled_end_at: "16:00",
        actual_end_at: "17:00",
        overtime_minutes: 60,
        overtime_hours: 1,
        status: "DETECTED"
      };
      vi.spyOn(supabaseLib.supabase, "from").mockImplementation(((table: string) =>
        createQuery(table, calls, (call) => ({
          data: call.action === "update" ? { ...record, ...(call.payload as Record<string, unknown>) } : record,
          error: null
        }))) as any);

      const submitted = await overtimeRepo.submit("overtime-1", UserRole.SUPER_ADMIN);

      expect(submitted.status).toBe("SUBMITTED");
      expect(calls.find((call) => call.table === "overtime_records" && call.action === "update")?.payload)
        .toMatchObject({ status: "SUBMITTED" });
    });

    it("persists a Super Admin's approved duration, holiday rate, and rounded pay snapshot", async () => {
      const record = {
        id: "overtime-1",
        staff_id: "staff-1",
        branch_id: "branch-1",
        attendance_id: "attendance-1",
        date: "2026-10-04",
        scheduled_end_at: "16:00",
        actual_end_at: "17:20",
        overtime_minutes: 80,
        overtime_hours: 1.33,
        status: "SUBMITTED"
      };
      vi.spyOn(supabaseLib.supabase, "from").mockImplementation(((table: string) =>
        createQuery(table, calls, (call) => ({
          data: call.action === "update" ? { ...record, ...(call.payload as Record<string, unknown>) } : record,
          error: null
        }))) as any);

      const approved = await overtimeRepo.approve(
        "overtime-1",
        "Super Admin",
        UserRole.SUPER_ADMIN,
        undefined,
        65,
        true
      );

      expect(approved).toMatchObject({
        status: "APPROVED",
        approvedOvertimeMinutes: 65,
        isNationalHoliday: true,
        hourlyRateSnapshot: 30000,
        overtimeAmountSnapshot: 32500
      });
      expect(calls.find((call) => call.table === "overtime_records" && call.action === "update")?.payload)
        .toMatchObject({
          approved_overtime_minutes: 65,
          is_national_holiday: true,
          hourly_rate_snapshot: 30000,
          overtime_amount_snapshot: 32500
        });
    });

    it("rejects approval from anyone other than Super Admin", async () => {
      await expect(overtimeRepo.approve("overtime-1", "Branch Admin", UserRole.BRANCH_ADMIN, "branch-1"))
        .rejects.toThrow(/Super Admin/);
      expect(calls).toHaveLength(0);
    });
  });

  it("persists payroll and period earnings using the production snapshot columns", async () => {
    const insertedPayroll = {
      id: "payroll-1",
      staff_id: "staff-1",
      branch_id: "branch-1",
      month: 10,
      year: 2026,
      base_salary: 2_500_000,
      total_compensation: 90_000,
      total_deductions: 0,
      net_salary: 2_615_000,
      status: "DRAFT",
      created_at: "2026-10-01T00:00:00.000Z",
      updated_at: "2026-10-01T00:00:00.000Z"
    };
    vi.spyOn(supabaseLib.supabase, "from").mockImplementation(((table: string) =>
      createQuery(table, calls, (call) => {
        if (call.table === "staff") return { data: { id: "staff-1", branch_id: "branch-1" }, error: null };
        if (call.table === "monthly_payrolls" && call.action === "select") return { data: null, error: null };
        if (call.table === "monthly_payrolls" && call.action === "insert") return { data: insertedPayroll, error: null };
        if (call.table === "compensation_accruals") {
          return {
            data: [{
              id: "accrual-1",
              source_id: "treatment-1",
              staff_id: "staff-1",
              rule_type_snapshot: "FIXED_PER_TREATMENT",
              amount: 50_000
            }],
            error: null
          };
        }
        if (call.table === "overtime_records") {
          return {
            data: [{
              id: "overtime-1",
              staff_id: "staff-1",
              date: "2026-10-12",
              overtime_hours: 2,
              overtime_amount_snapshot: 25_000
            }],
            error: null
          };
        }
        if (call.table === "staff_replacement_assignments") {
          return {
            data: [{
              id: "replacement-1",
              covered_date: "2026-10-12",
              absent_staff_id: "staff-2",
              absent_base_salary_snapshot: 1_000_000,
              amount_snapshot: 40_000
            }],
            error: null
          };
        }
        return { data: null, error: null };
      })) as any);

    const payroll = await payrollRepo.generateMonthlyPayroll("staff-1", 10, 2026, 2_500_000);

    expect(payroll).toMatchObject({
      id: "payroll-1",
      branchId: "branch-1",
      totalCompensation: 90_000,
      netSalary: 2_615_000
    });
    expect(calls.find((call) => call.table === "monthly_payrolls" && call.action === "insert")?.payload)
      .toMatchObject({ staff_id: "staff-1", branch_id: "branch-1", total_compensation: 90_000, net_salary: 2_615_000 });
    expect(calls.find((call) => call.table === "payroll_items" && call.action === "insert")?.payload)
      .toMatchObject([
        { description_snapshot: "Gaji Pokok Periode 10/2026", amount_snapshot: 2_500_000, type: "EARNING" },
        { description_snapshot: "Kompensasi Tindakan (#treatment-1)", amount_snapshot: 50_000, source_id: "accrual-1" },
        { description_snapshot: "Upah Pengganti (2026-10-12; gaji pegawai digantikan Rp1.000.000 ÷ 25)", amount_snapshot: 40_000, source_id: "replacement-1" },
        { description_snapshot: "Lembur Disetujui (2 jam / 2026-10-12)", amount_snapshot: 25_000, source_id: "overtime-1" }
      ]);
    expect(calls.find((call) => call.table === "compensation_accruals")?.filters).toContainEqual([
      "gte",
      "accrued_at",
      "2026-10-01T00:00:00.000Z"
    ]);
    expect(calls.find((call) => call.table === "overtime_records")?.filters).toContainEqual([
      "eq",
      "status",
      "APPROVED"
    ]);
    expect(calls.find((call) => call.table === "staff_replacement_assignments")?.filters).toContainEqual([
      "not",
      "work_confirmed_at.is",
      null
    ]);
  });

  it("does not recalculate a payroll that has moved beyond draft", async () => {
    vi.spyOn(supabaseLib.supabase, "from").mockImplementation(((table: string) =>
      createQuery(table, calls, (call) => {
        if (call.table === "staff") return { data: { id: "staff-1", branch_id: "branch-1" }, error: null };
        if (call.table === "monthly_payrolls") {
          return { data: { id: "payroll-1", status: "APPROVED" }, error: null };
        }
        return { data: [], error: null };
      })) as any);

    await expect(payrollRepo.generateMonthlyPayroll("staff-1", 10, 2026, 2_500_000))
      .rejects.toThrow("sudah berstatus APPROVED");
    expect(calls.some((call) => call.action === "insert" || call.action === "update" || call.action === "delete"))
      .toBe(false);
  });

  it("maps payroll item snapshots using their database column names", async () => {
    vi.spyOn(supabaseLib.supabase, "from").mockImplementation(((table: string) =>
      createQuery(table, calls, () => ({
        data: [{
          id: "item-1",
          payroll_id: "payroll-1",
          description_snapshot: "Gaji Pokok",
          amount_snapshot: 2_500_000,
          type: "EARNING",
          source_id: "source-1"
        }],
        error: null
      }))) as any);

    await expect(payrollRepo.getPayrollItems("payroll-1")).resolves.toEqual([{
      id: "item-1",
      payrollId: "payroll-1",
      descriptionSnapshot: "Gaji Pokok",
      amountSnapshot: 2_500_000,
      type: "EARNING",
      sourceId: "source-1"
    }]);
  });
});
