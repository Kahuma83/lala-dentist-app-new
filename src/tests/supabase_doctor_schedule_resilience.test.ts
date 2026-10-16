import { describe, it, expect, beforeEach, vi } from "vitest";
import { SupabaseDoctorScheduleRepository } from "../repositories/supabaseRepositories";
import { ScheduleStatus, UserRole } from "../types/domain";
import * as supabaseLib from "../lib/supabase";

if (typeof (globalThis as any).localStorage === "undefined") {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, val: string) => store.set(key, String(val)),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    length: 0
  };
}
if (typeof (globalThis as any).window === "undefined") {
  (globalThis as any).window = globalThis;
}

describe("Security Audit: Doctor Schedules RLS & Multi-Branch Isolation", () => {
  let scheduleRepo: SupabaseDoctorScheduleRepository;

  beforeEach(() => {
    (globalThis as any).localStorage.clear();
    scheduleRepo = new SupabaseDoctorScheduleRepository();
    vi.restoreAllMocks();
    vi.spyOn(supabaseLib, "isSupabaseConfigured", "get").mockReturnValue(false);
  });

  // --------------------------------------------------------------------------
  // 1. Pengguna tanpa sesi tidak dapat menulis jadwal
  // --------------------------------------------------------------------------
  it("Scenario 1: Pengguna tanpa sesi Supabase yang valid (anon) DITOLAK saat mencoba menulis jadwal", async () => {
    // Simulate Supabase being configured with an anonymous/mock session
    vi.spyOn(supabaseLib, "isSupabaseConfigured", "get").mockReturnValue(true);
    vi.spyOn(supabaseLib.supabase.auth, "getSession").mockResolvedValue({
      data: { session: null },
      error: null
    });

    await expect(
      scheduleRepo.createSchedule(
        {
          doctorId: "11111111-1111-1111-1111-111111111111",
          branchId: "22222222-2222-2222-2222-222222222222",
          date: "2026-10-12",
          startTime: "08:00",
          endTime: "14:00",
          status: ScheduleStatus.ACTIVE
        },
        UserRole.SUPER_ADMIN,
        null
      )
    ).rejects.toThrow(/tidak terautentikasi|42501/);
  });

  // --------------------------------------------------------------------------
  // 2. Branch Admin tidak dapat membaca atau mengubah jadwal cabang lain
  // --------------------------------------------------------------------------
  it("Scenario 2a: Branch Admin TIDAK DAPAT membaca jadwal cabang lain", async () => {
    const branchA = "branch-gebang";
    const branchB = "branch-kampus";

    // Requesting filter for branch B as branch A admin
    const schedules = await scheduleRepo.getSchedules(
      { branchId: branchB },
      UserRole.BRANCH_ADMIN,
      branchA
    );

    expect(schedules).toEqual([]);
  });

  it("Scenario 2b: Branch Admin DITOLAK saat mencoba membuat jadwal di cabang lain", async () => {
    const branchA = "branch-gebang";
    const branchB = "branch-kampus";

    await expect(
      scheduleRepo.createSchedule(
        {
          doctorId: "doc-1",
          branchId: branchB, // Attempting to schedule in branch B
          date: "2026-10-12",
          startTime: "08:00",
          endTime: "14:00",
          status: ScheduleStatus.ACTIVE
        },
        UserRole.BRANCH_ADMIN,
        branchA // User belongs to branch A
      )
    ).rejects.toThrow("Branch Admin tidak diizinkan membuat jadwal untuk cabang lain");
  });

  it("Scenario 2c: Branch Admin DITOLAK saat mencoba mengubah jadwal cabang lain", async () => {
    const branchA = "branch-gebang";
    const branchB = "branch-kampus";

    // Pre-seed a schedule in branch B in demo storage
    const scheduleInB = await scheduleRepo.createSchedule(
      {
        id: "sch-branch-b-1",
        doctorId: "doc-1",
        branchId: branchB,
        date: "2026-10-12",
        startTime: "08:00",
        endTime: "14:00",
        status: ScheduleStatus.ACTIVE
      },
      UserRole.SUPER_ADMIN,
      null
    );

    // Branch Admin of branch A attempts to modify schedule in branch B
    await expect(
      scheduleRepo.updateSchedule(
        scheduleInB.id,
        { startTime: "09:00" },
        UserRole.BRANCH_ADMIN,
        branchA
      )
    ).rejects.toThrow("Branch Admin tidak diizinkan mengubah jadwal cabang lain");
  });

  // --------------------------------------------------------------------------
  // 3. Pengguna berizin dapat melakukan operasi yang sesuai
  // --------------------------------------------------------------------------
  it("Scenario 3: Branch Admin dapat membuat jadwal di cabangnya sendiri dalam mode demo", async () => {
    const branchA = "branch-gebang";

    const created = await scheduleRepo.createSchedule(
      {
        doctorId: "doc-ulfa",
        branchId: branchA,
        date: "2026-10-15",
        startTime: "08:00",
        endTime: "14:00",
        status: ScheduleStatus.ACTIVE
      },
      UserRole.BRANCH_ADMIN,
      branchA
    );

    expect(created).toBeDefined();
    expect(created.branchId).toBe(branchA);
    expect(created.status).toBe(ScheduleStatus.ACTIVE);
  });

  // --------------------------------------------------------------------------
  // 4. Kegagalan remote tidak dilaporkan sebagai keberhasilan
  // --------------------------------------------------------------------------
  it("Scenario 4: Penolakan dari Supabase (42501 RLS) HARUS dilemparkan sebagai error dan TIDAK disamarkan", async () => {
    vi.spyOn(supabaseLib, "isSupabaseConfigured", "get").mockReturnValue(true);
    vi.spyOn(supabaseLib.supabase.auth, "getSession").mockResolvedValue({
      data: {
        session: {
          access_token: "real-jwt-token-12345",
          user: { id: "auth-user-123" } as any
        } as any
      },
      error: null
    });

    // Mock Supabase from("doctor_schedules").insert(...) to simulate RLS rejection 42501
    const mockSingle = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: "42501",
        message: "new row violates row-level security policy for table doctor_schedules"
      }
    });
    const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
    const mockInsert = vi.fn().mockReturnValue({ select: mockSelect });

    vi.spyOn(supabaseLib.supabase, "from").mockReturnValue({
      insert: mockInsert
    } as any);

    // The repository MUST throw the error and NOT falsely return a saved schedule
    await expect(
      scheduleRepo.createSchedule(
        {
          doctorId: "11111111-1111-1111-1111-111111111111",
          branchId: "22222222-2222-2222-2222-222222222222",
          date: "2026-10-12",
          startTime: "08:00",
          endTime: "14:00",
          status: ScheduleStatus.ACTIVE
        },
        UserRole.SUPER_ADMIN,
        null
      )
    ).rejects.toThrow(/Akses ditolak.*42501/);
  });

  // --------------------------------------------------------------------------
  // 5. Perilaku fallback lokal tidak menyamar sebagai data remote
  // --------------------------------------------------------------------------
  it("Scenario 5: Data fallback demo lokal DITANDAI EKSPLISIT sebagai isLocalOnly dan LOCAL_ONLY", async () => {
    // In local demo mode (Supabase unconfigured)
    vi.spyOn(supabaseLib, "isSupabaseConfigured", "get").mockReturnValue(false);

    const created = await scheduleRepo.createSchedule({
      doctorId: "doc-ulfa",
      branchId: "branch-gebang",
      date: "2026-10-16",
      startTime: "08:00",
      endTime: "14:00",
      status: ScheduleStatus.ACTIVE
    });

    // Must be explicitly marked so UI and consumers know it is NOT persisted remotely
    expect(created.isLocalOnly).toBe(true);
    expect(created.syncStatus).toBe("LOCAL_ONLY");

    const fetched = await scheduleRepo.getScheduleById(created.id);
    expect(fetched?.isLocalOnly).toBe(true);
    expect(fetched?.syncStatus).toBe("LOCAL_ONLY");

    const allSchedules = await scheduleRepo.getSchedules({ branchId: "branch-gebang" });
    const found = allSchedules.find((s) => s.id === created.id);
    expect(found?.isLocalOnly).toBe(true);
    expect(found?.syncStatus).toBe("LOCAL_ONLY");
  });
});
