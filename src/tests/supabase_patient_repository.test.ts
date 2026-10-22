import { beforeEach, describe, expect, it, vi } from "vitest";
import { SupabasePatientRepository } from "../repositories/supabaseRepositories";
import * as supabaseLib from "../lib/supabase";
import { UserRole } from "../types/domain";

describe("Supabase patient repository", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(supabaseLib, "isSupabaseConfigured", "get").mockReturnValue(true);
  });

  it("loads patient enrichment data in bounded batches", async () => {
    const patientRows = Array.from({ length: 250 }, (_, index) => ({
      id: `patient-${index + 1}`,
      name: `Patient ${index + 1}`,
      registered_branch_id: "branch-gebang"
    }));
    const queriedIds: Record<string, string[][]> = {
      patient_medical_profiles: [],
      patient_branch_medical_records: []
    };
    const from = vi.spyOn(supabaseLib.supabase, "from").mockImplementation(((table: string) => {
      const result = table === "patient_profiles"
        ? { data: patientRows, error: null }
        : { data: [], error: null };
      const query = {
        select: vi.fn().mockReturnThis(),
        in: vi.fn((_column: string, ids: string[]) => {
          queriedIds[table]?.push(ids);
          return query;
        }),
        then: (
          resolve: (value: typeof result) => unknown,
          reject?: (reason: unknown) => unknown
        ) => Promise.resolve(result).then(resolve, reject)
      };
      return query as unknown as ReturnType<typeof supabaseLib.supabase.from>;
    }) as unknown as typeof supabaseLib.supabase.from);

    const patients = await new SupabasePatientRepository().getPatients(UserRole.SUPER_ADMIN);

    expect(from).toHaveBeenCalledWith("patient_profiles");
    expect(patients).toHaveLength(250);
    expect(queriedIds.patient_medical_profiles.map((batch) => batch.length)).toEqual([100, 100, 50]);
    expect(queriedIds.patient_branch_medical_records.map((batch) => batch.length)).toEqual([100, 100, 50]);
  });
});
