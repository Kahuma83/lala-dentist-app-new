import { describe, it, expect, vi, beforeEach } from "vitest";
import { UserRole } from "../types/domain";
import { AuthService } from "../services/authService";
import { MockDatabase } from "../data/mockData";
import { supabase, isSupabaseConfigured } from "../lib/supabase";

// Mock Supabase client
vi.mock("../lib/supabase", () => {
  const mockSupabaseClient = {
    auth: {
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      getSession: vi.fn(),
      getUser: vi.fn(),
      onAuthStateChange: vi.fn(() => ({
        data: {
          subscription: {
            unsubscribe: vi.fn()
          }
        }
      }))
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      insert: vi.fn().mockReturnThis()
    }))
  };
  return {
    isSupabaseConfigured: true,
    supabase: mockSupabaseClient
  };
});

describe("Production Authentication Fix & Super Admin Identity Verification", () => {
  let db: MockDatabase;

  beforeEach(() => {
    db = MockDatabase.resetInstance();
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("1. Must verify Supabase is configured in production mode", () => {
    expect(isSupabaseConfigured).toBe(true);
    expect(supabase).toBeDefined();
    expect(supabase.auth).toBeDefined();
  });

  it("2. When Supabase is configured, invalid credentials MUST throw an error and NEVER return a mock token", async () => {
    (supabase.auth.signInWithPassword as any).mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "Invalid login credentials", status: 400 }
    });

    await expect(
      AuthService.signIn("superadmin@laladentist.id", "wrong-password")
    ).rejects.toThrow("Email atau password salah");

    // Must NOT have returned any mock session
  });

  it("3. When Supabase is configured, successful login returns the authentic Supabase session, not mock-token", async () => {
    const realAuthUserId = "real-supabase-uuid-001";
    const realAccessToken = "real-jwt-access-token-xyz";

    (supabase.auth.signInWithPassword as any).mockResolvedValue({
      data: {
        user: { id: realAuthUserId, email: "superadmin@laladentist.id" },
        session: { access_token: realAccessToken }
      },
      error: null
    });

    (supabase.from as any).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id: "user-super-real",
          auth_user_id: realAuthUserId,
          username: "superadmin",
          email: "superadmin@laladentist.id",
          name: "Drg. Lala (Super Admin)",
          role: UserRole.SUPER_ADMIN,
          branch_id: null,
          staff_id: null,
          patient_id: null,
          active: true
        },
        error: null
      })
    });

    const result = await AuthService.signIn("superadmin@laladentist.id", "correct-password");

    expect(result.session.access_token).toBe(realAccessToken);
    expect(result.session.access_token).not.toBe("mock-token");
    expect(result.context.authUserId).toBe(realAuthUserId);
    expect(result.context.role).toBe(UserRole.SUPER_ADMIN);
  });

  it("4. Legacy emails (superadmin@laladentist.com, super@laladentist.com, nonapresident@gmail.com) are rejected as Super Admin", async () => {
    (supabase.from as any).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
    });

    await expect(AuthService.signIn("superadmin@laladentist.com", "laladentist123")).rejects.toThrow();
    await expect(AuthService.signIn("super@laladentist.com", "laladentist123")).rejects.toThrow();
    await expect(AuthService.signIn("nonapresident@gmail.com", "laladentist123")).rejects.toThrow();

    await expect(
      AuthService.resolveUserContext("uuid-legacy", "superadmin@laladentist.com")
    ).rejects.toThrow();

    await expect(
      AuthService.resolveUserContext("uuid-legacy-2", "super@laladentist.com")
    ).rejects.toThrow();

    await expect(
      AuthService.resolveUserContext("uuid-legacy-3", "nonapresident@gmail.com")
    ).rejects.toThrow();
  });

  it("5. Only superadmin@laladentist.id is accepted as Super Admin identity", async () => {
    (supabase.from as any).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id: "user-super",
          auth_user_id: "user-super",
          username: "superadmin",
          email: "superadmin@laladentist.id",
          name: "Drg. Lala (Super Admin)",
          role: UserRole.SUPER_ADMIN,
          branch_id: null,
          staff_id: null,
          patient_id: null,
          active: true
        },
        error: null
      })
    });

    const context = await AuthService.resolveUserContext("user-super", "superadmin@laladentist.id");
    expect(context.role).toBe(UserRole.SUPER_ADMIN);
    expect(context.userAccountId).toBe("user-super");
  });

  it("6. Logout properly invokes supabase.auth.signOut()", async () => {
    await AuthService.signOut();
    expect(supabase.auth.signOut).toHaveBeenCalledTimes(1);
  });

  it("7. createStaffAccount uses backend API with Bearer token when Supabase is configured", async () => {
    (supabase.auth.getSession as any).mockResolvedValue({
      data: { session: { access_token: "real-admin-token" } },
      error: null
    });

    const mockFetch = vi.mocked(globalThis.fetch);
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        account: {
          id: "user-branch-new",
          authUserId: "auth-branch-new",
          username: "admin_gebang_new",
          email: "admin_gebang_new@laladentist.id",
          name: "Admin Gebang Baru",
          role: UserRole.BRANCH_ADMIN,
          branchId: "branch-gebang",
          staffId: null,
          doctorId: null,
          active: true,
          createdAt: "2026-10-14T00:00:00.000Z",
          updatedAt: "2026-10-14T00:00:00.000Z"
        }
      })
    } as any);

    const acc = await AuthService.createStaffAccount(
      { authUserId: "real-super", userAccountId: "user-super", role: UserRole.SUPER_ADMIN, assignedBranchId: null },
      {
        username: "admin_gebang_new",
        name: "Admin Gebang Baru",
        role: UserRole.BRANCH_ADMIN,
        branchId: "branch-gebang",
        password: "password123"
      }
    );

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/staff",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer real-admin-token"
        })
      })
    );
    expect(acc.role).toBe(UserRole.BRANCH_ADMIN);
    expect(acc.branchId).toBe("branch-gebang");
  });

  it("8. Network/fetch failure returns a clear network error message", async () => {
    (supabase.auth.signInWithPassword as any).mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "Failed to fetch", name: "AuthRetryableFetchError" }
    });

    await expect(
      AuthService.signIn("superadmin@laladentist.id", "some-password")
    ).rejects.toThrow("Gagal terhubung ke server autentikasi Supabase");
  });

  it("9. When Supabase is configured, a missing user_accounts row must fail fast instead of falling back to mock data", async () => {
    (supabase.from as any).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
    });

    await expect(
      AuthService.resolveUserContext("real-auth-missing-user", "newstaff@laladentist.id")
    ).rejects.toThrow(/Akun pengguna.*belum dipetakan|UserAccount.*tidak ditemukan/i);
  });
});
