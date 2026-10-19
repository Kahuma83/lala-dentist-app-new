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
      updateUser: vi.fn(),
      resetPasswordForEmail: vi.fn(),
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
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis()
    }))
  };
  return {
    isSupabaseConfigured: true,
    supabase: mockSupabaseClient
  };
});

describe("Password Management & Recovery (Supabase Auth)", () => {
  let db: MockDatabase;

  beforeEach(() => {
    db = MockDatabase.resetInstance();
    vi.clearAllMocks();
  });

  describe("A. Change Password (Ubah Password Sendiri)", () => {
    it("1. Should reject empty or short new passwords", async () => {
      await expect(
        AuthService.changePassword("", "current123", "superadmin@laladentist.id")
      ).rejects.toThrow("Password baru tidak boleh kosong");

      await expect(
        AuthService.changePassword("12345", "current123", "superadmin@laladentist.id")
      ).rejects.toThrow("Password baru minimal harus 6 karakter");
    });

    it("2. Should require the current password and account email", async () => {
      await expect(
        AuthService.changePassword("newSecurePass123", "", "user@example.com")
      ).rejects.toThrow("Password saat ini wajib diisi");

      await expect(
        AuthService.changePassword("currentPass123", "currentPass123", "user@example.com")
      ).rejects.toThrow("Password baru harus berbeda");

      await expect(
        AuthService.changePassword("newSecurePass123", "currentPass123", null)
      ).rejects.toThrow("Email akun tidak tersedia");

      expect(supabase.auth.signInWithPassword).not.toHaveBeenCalled();
      expect(supabase.auth.updateUser).not.toHaveBeenCalled();
    });

    it("3. Should verify the current password before updating", async () => {
      (supabase.auth.getUser as any).mockResolvedValue({
        data: { user: { email: "superadmin@laladentist.id" } },
        error: null
      });
      (supabase.auth.signInWithPassword as any).mockResolvedValue({
        data: { user: { id: "test-user-id" }, session: {} },
        error: null
      });
      (supabase.auth.updateUser as any).mockResolvedValue({
        data: { user: { id: "test-user-id" } },
        error: null
      });

      await AuthService.changePassword(
        "newSecurePass123",
        "currentPass123",
        "superadmin@laladentist.id"
      );

      expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
        email: "superadmin@laladentist.id",
        password: "currentPass123"
      });
      expect(supabase.auth.getUser).toHaveBeenCalled();
      expect(supabase.auth.updateUser).toHaveBeenCalledWith({
        password: "newSecurePass123"
      });
    });

    it("4. Should reject if current password verification fails", async () => {
      (supabase.auth.getUser as any).mockResolvedValue({
        data: { user: { email: "superadmin@laladentist.id" } },
        error: null
      });
      (supabase.auth.signInWithPassword as any).mockResolvedValue({
        data: { user: null, session: null },
        error: { message: "Invalid login credentials", status: 400 }
      });

      await expect(
        AuthService.changePassword(
          "newSecurePass123",
          "wrongCurrentPass",
          "superadmin@laladentist.id"
        )
      ).rejects.toThrow("Password saat ini salah");

      expect(supabase.auth.updateUser).not.toHaveBeenCalled();
    });

    it("5. Should propagate Supabase error if updateUser fails", async () => {
      (supabase.auth.getUser as any).mockResolvedValue({
        data: { user: { email: "superadmin@laladentist.id" } },
        error: null
      });
      (supabase.auth.signInWithPassword as any).mockResolvedValue({
        data: { user: { id: "test-id" }, session: {} },
        error: null
      });
      (supabase.auth.updateUser as any).mockResolvedValue({
        data: { user: null },
        error: { message: "Auth session missing or expired" }
      });

      await expect(
        AuthService.changePassword(
          "newSecurePass123",
          "currentPass123",
          "superadmin@laladentist.id"
        )
      ).rejects.toThrow("Auth session missing or expired");
    });

    it("6. Should reject if the account email does not match the active session", async () => {
      (supabase.auth.getUser as any).mockResolvedValue({
        data: { user: { email: "other-user@example.com" } },
        error: null
      });

      await expect(
        AuthService.changePassword(
          "newSecurePass123",
          "currentPass123",
          "superadmin@laladentist.id"
        )
      ).rejects.toThrow("Email akun tidak sesuai");

      expect(supabase.auth.signInWithPassword).not.toHaveBeenCalled();
      expect(supabase.auth.updateUser).not.toHaveBeenCalled();
    });
  });

  describe("B. Password Recovery & Reset (Lupa Password)", () => {
    it("5. Should reject empty email for reset request", async () => {
      await expect(AuthService.requestPasswordReset("")).rejects.toThrow(
        "Email wajib diisi"
      );
    });

    it("6. Should reject deprecated admin aliases", async () => {
      await expect(
        AuthService.requestPasswordReset("superadmin@laladentist.com")
      ).rejects.toThrow("tidak terdaftar");

      await expect(
        AuthService.requestPasswordReset("nonapresident@gmail.com")
      ).rejects.toThrow("tidak terdaftar");
    });

    it("7. Should explain that internal staff emails cannot receive recovery links", async () => {
      await expect(
        AuthService.requestPasswordReset("cece@laladentist.id")
      ).rejects.toThrow("email internal");

      expect(supabase.auth.resetPasswordForEmail).not.toHaveBeenCalled();
    });

    it("8. Should invoke supabase.auth.resetPasswordForEmail with proper redirectTo", async () => {
      (supabase.auth.resetPasswordForEmail as any).mockResolvedValue({
        data: {},
        error: null
      });

      await AuthService.requestPasswordReset(
        "user@example.com",
        "https://example.com/login?mode=recovery"
      );

      expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith(
        "user@example.com",
        { redirectTo: "https://example.com/login?mode=recovery" }
      );
    });

    it("9. Resetting password after recovery token updates user password via Supabase Auth", async () => {
      (supabase.auth.updateUser as any).mockResolvedValue({
        data: { user: { id: "user-recovered" } },
        error: null
      });

      await AuthService.resetPassword("brandNewPassword123");

      expect(supabase.auth.updateUser).toHaveBeenCalledWith({
        password: "brandNewPassword123"
      });
    });

    it("10. Resetting password rejects short passwords", async () => {
      await expect(AuthService.resetPassword("123")).rejects.toThrow(
        "minimal harus 6 karakter"
      );
    });
  });
});
