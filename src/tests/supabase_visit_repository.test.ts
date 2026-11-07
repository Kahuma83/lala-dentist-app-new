import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SupabaseVisitRepository } from "../repositories/supabaseRepositories";
import * as supabaseLib from "../lib/supabase";
import { UserRole } from "../types/domain";
import { AppClock } from "../utils/clock";

describe("Supabase visit repository", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(supabaseLib, "isSupabaseConfigured", "get").mockReturnValue(true);
  });

  afterEach(() => {
    AppClock.reset();
  });

  it("limits operational visits to recent records and active statuses", async () => {
    const branchId = "123e4567-e89b-12d3-a456-426614174000";
    const row = {
      id: "987e6543-e21b-12d3-a456-426614174000",
      patient_id: "223e4567-e89b-12d3-a456-426614174000",
      branch_id: branchId,
      visit_date_time: "2026-07-01T10:00:00.000Z",
      visit_type: "WALK_IN",
      visit_status: "COMPLETED",
      booking_id: null,
      created_at: "2026-07-01T10:00:00.000Z",
      updated_at: "2026-07-01T10:00:00.000Z"
    };
    const response = { data: [row], error: null };
    const query = {
      select: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      then: (
        resolve: (value: typeof response) => unknown,
        reject?: (reason: unknown) => unknown
      ) => Promise.resolve(response).then(resolve, reject)
    };
    const from = vi.spyOn(supabaseLib.supabase, "from").mockReturnValue(
      query as unknown as ReturnType<typeof supabaseLib.supabase.from>
    );
    AppClock.setFixedTime("2026-07-20T12:00:00.000Z");
    const repository = new SupabaseVisitRepository();

    const visits = await repository.getOperationalVisits(
      branchId,
      UserRole.BRANCH_ADMIN,
      branchId
    );

    expect(from).toHaveBeenCalledWith("patient_visits");
    expect(query.or).toHaveBeenCalledWith(
      "visit_date_time.gte.2026-04-21T12:00:00.000Z,visit_status.in.(WAITING,IN_TRIAGE,IN_TREATMENT)"
    );
    expect(query.eq).toHaveBeenCalledWith("branch_id", branchId);
    expect(visits).toHaveLength(1);
    expect(visits[0].visitStatus).toBe("COMPLETED");
  });

  it("queries a branch directly and shares concurrent reads for that branch", async () => {
    const branchId = "123e4567-e89b-12d3-a456-426614174000";
    const row = {
      id: "987e6543-e21b-12d3-a456-426614174000",
      patient_id: "223e4567-e89b-12d3-a456-426614174000",
      branch_id: branchId,
      visit_date_time: "2026-11-07T10:00:00.000Z",
      visit_type: "WALK_IN",
      visit_status: "COMPLETED",
      booking_id: null,
      created_at: "2026-11-07T10:00:00.000Z",
      updated_at: "2026-11-07T10:00:00.000Z"
    };
    const response = { data: [row], error: null };
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      then: (
        resolve: (value: typeof response) => unknown,
        reject?: (reason: unknown) => unknown
      ) => Promise.resolve(response).then(resolve, reject)
    };
    const from = vi.spyOn(supabaseLib.supabase, "from").mockReturnValue(
      query as unknown as ReturnType<typeof supabaseLib.supabase.from>
    );
    const repository = new SupabaseVisitRepository();

    const [first, second] = await Promise.all([
      repository.getVisitsByBranch(branchId, UserRole.BRANCH_ADMIN, branchId),
      repository.getVisitsByBranch(branchId, UserRole.BRANCH_ADMIN, branchId)
    ]);

    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith("patient_visits");
    expect(query.eq).toHaveBeenCalledWith("branch_id", branchId);
    expect(first).toHaveLength(1);
    expect(second).toEqual(first);
    expect(first[0]).toMatchObject({ branchId, visitStatus: "COMPLETED" });
  });

  it("loads multiple visits with one batched query and preserves requested order", async () => {
    const visitId1 = "987e6543-e21b-12d3-a456-426614174001";
    const visitId2 = "987e6543-e21b-12d3-a456-426614174002";
    const rows = [visitId1, visitId2].map((id) => ({
      id,
      patient_id: "223e4567-e89b-12d3-a456-426614174000",
      branch_id: "123e4567-e89b-12d3-a456-426614174000",
      visit_date_time: "2026-11-07T10:00:00.000Z",
      visit_type: "WALK_IN",
      visit_status: "COMPLETED",
      booking_id: null,
      created_at: "2026-11-07T10:00:00.000Z",
      updated_at: "2026-11-07T10:00:00.000Z"
    }));
    const response = { data: rows, error: null };
    const query = {
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      then: (
        resolve: (value: typeof response) => unknown,
        reject?: (reason: unknown) => unknown
      ) => Promise.resolve(response).then(resolve, reject)
    };
    const from = vi.spyOn(supabaseLib.supabase, "from").mockReturnValue(
      query as unknown as ReturnType<typeof supabaseLib.supabase.from>
    );
    const repository = new SupabaseVisitRepository();

    const visits = await repository.getVisitsByIds([visitId2, visitId1]);

    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith("patient_visits");
    expect(query.in).toHaveBeenCalledWith("id", [visitId2, visitId1]);
    expect(visits.map((visit) => visit.id)).toEqual([visitId2, visitId1]);
  });
});
