import { beforeEach, describe, expect, it, vi } from "vitest";
import { SupabaseAttendanceRepository } from "../repositories/supabaseRepositories";
import * as supabaseLib from "../lib/supabase";
import { AttendanceStatus } from "../types/domain";

describe("Supabase attendance repository", () => {
  let attendanceRepo: SupabaseAttendanceRepository;
  const attendanceRow = {
    id: "attendance-1",
    staff_id: "staff-1",
    branch_id: "branch-gebang",
    date: "2026-10-16",
    attendance_status: "PRESENT",
    scheduled_start_at: "08:00",
    scheduled_end_at: "14:00",
    actual_check_in_at: "2026-10-16T00:55:00.000Z",
    actual_check_out_at: null,
    late_minutes: 0,
    early_checkout_minutes: 0,
    check_in_latitude: -8.16,
    check_in_longitude: 113.68,
    check_in_accuracy_meters: 12,
    check_out_latitude: null,
    check_out_longitude: null,
    check_out_accuracy_meters: null
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(supabaseLib, "isSupabaseConfigured", "get").mockReturnValue(true);
    attendanceRepo = new SupabaseAttendanceRepository();
  });

  it("loads attendance from the production attendances table", async () => {
    const query = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn(),
      then: (resolve: (result: { data: unknown[]; error: null }) => unknown) =>
        Promise.resolve({
          data: [attendanceRow],
          error: null
        }).then(resolve)
    };
    query.order.mockReturnValue(query);
    const from = vi.spyOn(supabaseLib.supabase, "from").mockReturnValue(query as any);

    const attendances = await attendanceRepo.list();

    expect(from).toHaveBeenCalledWith("attendances");
    expect(attendances[0].date).toBe("2026-10-16");
    expect(attendances[0].checkInLatitude).toBe(-8.16);
  });

  it("filters attendance by branch, staff, and date range in Supabase", async () => {
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      then: (resolve: (result: { data: unknown[]; error: null }) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(resolve)
    };
    const from = vi.spyOn(supabaseLib.supabase, "from").mockReturnValue(query as any);

    await attendanceRepo.list({
      branchId: "branch-gebang",
      staffId: "staff-1",
      dateRange: { startDate: "2026-10-01", endDate: "2026-10-16" }
    });

    expect(from).toHaveBeenCalledWith("attendances");
    expect(query.eq).toHaveBeenCalledWith("branch_id", "branch-gebang");
    expect(query.eq).toHaveBeenCalledWith("staff_id", "staff-1");
    expect(query.gte).toHaveBeenCalledWith("date", "2026-10-01");
    expect(query.lte).toHaveBeenCalledWith("date", "2026-10-16");
    expect(query.order).toHaveBeenCalledWith("date", { ascending: false });
  });

  it("persists check-in through the secure RPC and returns database values", async () => {
    const rpc = vi.spyOn(supabaseLib.supabase, "rpc").mockResolvedValue({
      data: attendanceRow as any,
      error: null
    } as any);

    const attendance = await attendanceRepo.checkIn({
      staffId: "staff-1",
      branchId: "branch-gebang",
      photoPath: "branch-gebang/staff-1/check-in.jpg",
      latitude: -8.16,
      longitude: 113.68,
      accuracyMeters: 12
    });

    expect(rpc).toHaveBeenCalledWith("record_staff_attendance_check_in", {
      p_branch_id: "branch-gebang",
      p_latitude: -8.16,
      p_longitude: 113.68,
      p_accuracy_meters: 12,
      p_photo_path: "branch-gebang/staff-1/check-in.jpg"
    });
    expect(attendance.id).toBe("attendance-1");
    expect(attendance.checkInAccuracyMeters).toBe(12);
  });

  it("rejects check-in when location evidence is missing", async () => {
    await expect(attendanceRepo.checkIn({
      staffId: "staff-1",
      branchId: "branch-gebang",
      photoPath: "check-in.jpg"
    })).rejects.toThrow(/GPS yang valid/i);
  });

  it("persists check-out through the secure RPC", async () => {
    const checkedOutRow = {
      ...attendanceRow,
      actual_check_out_at: "2026-10-16T06:00:00.000Z",
      check_out_latitude: -8.16,
      check_out_longitude: 113.68,
      check_out_accuracy_meters: 10
    };
    const rpc = vi.spyOn(supabaseLib.supabase, "rpc").mockResolvedValue({
      data: checkedOutRow as any,
      error: null
    } as any);

    const attendance = await attendanceRepo.checkOut({
      attendanceId: "attendance-1",
      branchId: "branch-gebang",
      photoPath: "branch-gebang/staff-1/check-out.jpg",
      latitude: -8.16,
      longitude: 113.68,
      accuracyMeters: 10
    });

    expect(rpc).toHaveBeenCalledWith("record_staff_attendance_check_out", {
      p_attendance_id: "attendance-1",
      p_branch_id: "branch-gebang",
      p_latitude: -8.16,
      p_longitude: 113.68,
      p_accuracy_meters: 10,
      p_photo_path: "branch-gebang/staff-1/check-out.jpg"
    });
    expect(attendance.checkOutAccuracyMeters).toBe(10);
  });

  it("persists staff absence through the secure RPC", async () => {
    const absenceRow = {
      ...attendanceRow,
      attendance_status: "SICK",
      actual_check_in_at: null,
      actual_check_out_at: null,
      notes: "Izin sakit"
    };
    const rpc = vi.spyOn(supabaseLib.supabase, "rpc").mockResolvedValue({
      data: absenceRow as any,
      error: null
    } as any);

    const attendance = await attendanceRepo.createAbsence({
      staffId: "staff-1",
      branchId: "branch-gebang",
      date: "2026-10-16",
      attendanceStatus: AttendanceStatus.SICK,
      notes: "Izin sakit"
    });

    expect(rpc).toHaveBeenCalledWith("record_staff_absence", {
      p_staff_id: "staff-1",
      p_branch_id: "branch-gebang",
      p_date: "2026-10-16",
      p_attendance_status: AttendanceStatus.SICK,
      p_notes: "Izin sakit"
    });
    expect(attendance.attendanceStatus).toBe(AttendanceStatus.SICK);
  });
});
