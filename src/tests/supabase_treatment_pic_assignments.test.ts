import { beforeEach, describe, expect, it, vi } from "vitest";
import { SupabaseTreatmentRepository } from "../repositories/supabaseRepositories";
import * as supabaseLib from "../lib/supabase";

describe("Supabase treatment PIC assignments", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(supabaseLib, "isSupabaseConfigured", "get").mockReturnValue(true);
  });

  it("loads assignment IDs in bounded batches", async () => {
    const visitIds = Array.from({ length: 205 }, (_, index) =>
      `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`
    );
    const batches: string[][] = [];
    const query = {
      select: vi.fn().mockReturnThis(),
      in: vi.fn((_column: string, ids: string[]) => {
        batches.push(ids);
        return Promise.resolve({
          data: ids.map((visitId) => ({
            visit_id: visitId,
            assistant_staff_id: null,
            confirmed_by: null
          })),
          error: null
        });
      })
    };
    const from = vi.spyOn(supabaseLib.supabase, "from").mockReturnValue(
      query as unknown as ReturnType<typeof supabaseLib.supabase.from>
    );
    const repository = new SupabaseTreatmentRepository();

    const assignments = await repository.getAssistantAssignmentsForVisits(visitIds);

    expect(from).toHaveBeenCalledTimes(3);
    expect(batches.map((batch) => batch.length)).toEqual([100, 100, 5]);
    expect(Object.keys(assignments)).toHaveLength(visitIds.length);
  });
});
