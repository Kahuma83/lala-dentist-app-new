import { beforeEach, describe, expect, it, vi } from "vitest";
import { SupabaseStaffShiftAssignmentRepository } from "../repositories/supabaseRepositories";

const mocks = vi.hoisted(() => {
  const query: Record<string, any> = {};
  for (const method of ["eq", "select", "insert", "update", "delete", "order"]) {
    query[method] = vi.fn(() => query);
  }
  query.single = vi.fn();
  return {
    query,
    from: vi.fn(() => query)
  };
});

vi.mock("../lib/supabase", () => ({
  isSupabaseConfigured: true,
  supabase: { from: mocks.from }
}));

describe("Supabase custom staff shift assignments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query.single.mockResolvedValue({
      data: {
        id: "assignment-1",
        staff_id: "staff-1",
        branch_id: "branch-1",
        shift_id: null,
        custom_shift_name: "Jadwal Administrasi",
        custom_start_time: "09:30",
        custom_end_time: "16:30",
        date: "2026-10-29",
        active: true,
        notes: null
      },
      error: null
    });
  });

  it("stores custom shift name and times directly on the assignment", async () => {
    const repository = new SupabaseStaffShiftAssignmentRepository();

    const assignment = await repository.assignStaffShift({
      staffId: "staff-1",
      branchId: "branch-1",
      shiftId: null,
      customShiftName: "Jadwal Administrasi",
      customStartTime: "09:30",
      customEndTime: "16:30",
      date: "2026-10-29",
      active: true
    });

    expect(mocks.from).toHaveBeenCalledWith("staff_shift_assignments");
    expect(mocks.query.insert).toHaveBeenCalledWith(expect.objectContaining({
      shift_id: null,
      custom_shift_name: "Jadwal Administrasi",
      custom_start_time: "09:30",
      custom_end_time: "16:30"
    }));
    expect(assignment.customShiftName).toBe("Jadwal Administrasi");
    expect(assignment.customStartTime).toBe("09:30");
    expect(assignment.customEndTime).toBe("16:30");
  });
});
