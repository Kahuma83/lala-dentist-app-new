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

  it("searches a bounded patient page on the server and includes identity numbers for admins", async () => {
    const patientRow = {
      id: "patient-1",
      name: "Andri Kiswanto",
      full_name: "Andri Kiswanto",
      identity_document_type: "NIK",
      identity_document_number: "3509092705890002"
    };
    const patientRange = vi.fn();
    const patientOr = vi.fn();
    const from = vi.spyOn(supabaseLib.supabase, "from").mockImplementation(((table: string) => {
      const result = table === "patient_profiles"
        ? { data: [patientRow], count: 21, error: null }
        : { data: [], count: 0, error: null };
      const query = {
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: patientRange.mockReturnThis(),
        or: patientOr.mockReturnThis(),
        ilike: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        then: (
          resolve: (value: typeof result) => unknown,
          reject?: (reason: unknown) => unknown
        ) => Promise.resolve(result).then(resolve, reject)
      };
      return query as unknown as ReturnType<typeof supabaseLib.supabase.from>;
    }) as unknown as typeof supabaseLib.supabase.from);

    const result = await new SupabasePatientRepository().searchPatientsPage(
      "3509092705890002",
      UserRole.SUPER_ADMIN,
      null,
      10,
      10
    );

    expect(from).toHaveBeenCalledWith("patient_profiles");
    expect(patientRange).toHaveBeenCalledWith(10, 19);
    expect(patientOr).toHaveBeenCalledWith(
      expect.stringContaining("identity_document_number.ilike.%3509092705890002%")
    );
    expect(result.totalCount).toBe(21);
    expect(result.patients).toHaveLength(1);
    expect(result.patients[0].identityDocumentNumber).toBe("3509092705890002");
  });

  it("uses the restricted global booking lookup for branch admins", async () => {
    const rpc = vi.spyOn(supabaseLib.supabase, "rpc").mockResolvedValue({
      data: [{
        id: "patient-global-1",
        name: "Andri Kiswanto",
        full_name: "Andri Kiswanto",
        phone: "08123456789",
        medical_record_number: "1584",
        internal_patient_code: "GB-1584",
        registered_branch_id: null,
        booking_lookup_only: true,
        match_count: 1
      }],
      error: null
    } as never);
    const from = vi.spyOn(supabaseLib.supabase, "from");

    const result = await new SupabasePatientRepository().searchPatientsPage(
      "Andri Kiswanto",
      UserRole.BRANCH_ADMIN,
      "branch-gebang",
      0,
      10,
      "booking"
    );

    expect(rpc).toHaveBeenCalledWith("search_patients_for_branch_admin_booking", {
      p_query: "Andri Kiswanto",
      p_offset: 0,
      p_limit: 10
    });
    expect(from).not.toHaveBeenCalled();
    expect(result.totalCount).toBe(1);
    expect(result.patients[0]).toMatchObject({
      id: "patient-global-1",
      fullName: "Andri Kiswanto",
      phone: "08123456789",
      medicalRecordNumber: "1584",
      bookingLookupOnly: true
    });
  });

  it("uses the regular paginated directory query for branch-admin patient search", async () => {
    const rpc = vi.spyOn(supabaseLib.supabase, "rpc");
    const patientOr = vi.fn();
    vi.spyOn(supabaseLib.supabase, "from").mockImplementation(((table: string) => {
      const result = table === "patient_profiles"
        ? {
            data: [{
              id: "patient-1",
              name: "Andri Kiswanto",
              full_name: "Andri Kiswanto",
              phone: "08123456789"
            }],
            count: 1,
            error: null
          }
        : { data: [], error: null };
      const query = {
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockReturnThis(),
        or: patientOr.mockReturnThis(),
        ilike: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        then: (
          resolve: (value: typeof result) => unknown,
          reject?: (reason: unknown) => unknown
        ) => Promise.resolve(result).then(resolve, reject)
      };
      return query as unknown as ReturnType<typeof supabaseLib.supabase.from>;
    }) as unknown as typeof supabaseLib.supabase.from);

    const result = await new SupabasePatientRepository().searchPatientsPage(
      "Andri",
      UserRole.BRANCH_ADMIN,
      "branch-gebang",
      0,
      10,
      "directory"
    );

    expect(rpc).not.toHaveBeenCalled();
    expect(patientOr).toHaveBeenCalledWith(
      expect.stringContaining("name.ilike.%Andri%")
    );
    expect(result.totalCount).toBe(1);
    expect(result.patients[0]).toMatchObject({
      id: "patient-1",
      fullName: "Andri Kiswanto",
      phone: "08123456789"
    });
  });

  it("does not search hidden phone or identity fields for roles without phone access", async () => {
    const patientOr = vi.fn();
    vi.spyOn(supabaseLib.supabase, "from").mockImplementation(((table: string) => {
      const result = { data: [], count: 0, error: null };
      const query = {
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockReturnThis(),
        or: patientOr.mockReturnThis(),
        then: (
          resolve: (value: typeof result) => unknown,
          reject?: (reason: unknown) => unknown
        ) => Promise.resolve(result).then(resolve, reject)
      };
      return query as unknown as ReturnType<typeof supabaseLib.supabase.from>;
    }) as unknown as typeof supabaseLib.supabase.from);

    await new SupabasePatientRepository().searchPatientsPage(
      "andri",
      UserRole.DOCTOR,
      null,
      0,
      10
    );

    const searchFilter = patientOr.mock.calls[0][0] as string;
    expect(searchFilter).not.toContain("phone");
    expect(searchFilter).not.toContain("identity_document_number");
  });
});
