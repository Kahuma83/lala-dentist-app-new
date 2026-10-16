import { beforeEach, describe, expect, it, vi } from "vitest";
import { SupabaseAttendanceRepository } from "../repositories/supabaseRepositories";
import * as supabaseLib from "../lib/supabase";

describe("Supabase attendance repository", () => {
  let attendanceRepo: SupabaseAttendanceRepository;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(supabaseLib, "isSupabaseConfigured", "get").mockReturnValue(true);
    attendanceRepo = new SupabaseAttendanceRepository();
  });

  it("loads attendance from the production attendances table", async () => {
    const query = {
      select: vi.fn().mockReturnThis(),
      then: (resolve: (result: { data: unknown[]; error: null }) => unknown) =>
        Promise.resolve({
          data: [{
            id: "attendance-1",
            staff_id: "staff-1",
            branch_id: "branch-gebang",
            date: "2026-10-16"
          }],
          error: null
        }).then(resolve)
    };
    const from = vi.spyOn(supabaseLib.supabase, "from").mockReturnValue(query as any);

    const attendances = await attendanceRepo.list();

    expect(from).toHaveBeenCalledWith("attendances");
    expect(attendances[0].date).toBe("2026-10-16");
  });

  it("filters attendance dates using the production date column", async () => {
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      then: (resolve: (result: { data: unknown[]; error: null }) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(resolve)
    };
    const from = vi.spyOn(supabaseLib.supabase, "from").mockReturnValue(query as any);

    await attendanceRepo.getByDate("2026-10-16", "branch-gebang");

    expect(from).toHaveBeenCalledWith("attendances");
    expect(query.eq).toHaveBeenNthCalledWith(1, "date", "2026-10-16");
    expect(query.eq).toHaveBeenNthCalledWith(2, "branch_id", "branch-gebang");
  });
});
