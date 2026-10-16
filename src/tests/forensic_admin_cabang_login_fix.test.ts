import { describe, it, expect, beforeEach, vi } from "vitest";
import { AuthService, AuthenticatedUserContext } from "../services/authService";
import { MockDatabase } from "../data/mockData";
import { UserRole } from "../types/domain";

// Mock Supabase to false for unit test isolation
vi.mock("../lib/supabase", () => ({
  isSupabaseConfigured: false,
  supabase: null
}));

describe("Forensic Fix Login Admin Cabang & Staff Authentication Integrity", () => {
  beforeEach(() => {
    MockDatabase.resetInstance();
  });

  const superAdminContext: AuthenticatedUserContext = {
    authUserId: "auth-super",
    userAccountId: "user-super",
    role: UserRole.SUPER_ADMIN,
    assignedBranchId: null
  };

  const branchAdminContext: AuthenticatedUserContext = {
    authUserId: "auth-admin",
    userAccountId: "user-admin",
    role: UserRole.BRANCH_ADMIN,
    assignedBranchId: "branch-gebang"
  };

  // 1. Audit Admin Cabang (Cece - Gebang) login
  it("1. Admin Cabang Gebang (Cece) can login with username 'cece' and 'CECE'", async () => {
    const resLower = await AuthService.signIn("cece", "laladentist123");
    expect(resLower.context.role).toBe(UserRole.BRANCH_ADMIN);
    expect(resLower.context.assignedBranchId).toBe("branch-gebang");
    expect(resLower.user.name).toBe("CECE");

    const resUpper = await AuthService.signIn("CECE", "laladentist123");
    expect(resUpper.context.role).toBe(UserRole.BRANCH_ADMIN);
    expect(resUpper.context.assignedBranchId).toBe("branch-gebang");
  });

  // 2. Audit all other branch admins login
  it("2. Other branch admins can login with username and password", async () => {
    const admins = [
      { username: "dinda", branch: "branch-ambulu" },
      { username: "anggel", branch: "branch-gebang" },
      { username: "lilis", branch: "branch-gebang" },
      { username: "ayik", branch: "branch-kampus" },
      { username: "usnake", branch: "branch-kencong" },
      { username: "cyntia", branch: "branch-kencong" },
      { username: "rani", branch: "branch-lengkong-mumbul" },
      { username: "ima", branch: "branch-lengkong-mumbul" }
    ];

    for (const admin of admins) {
      const res = await AuthService.signIn(admin.username, "laladentist123");
      expect(res.context.role).toBe(UserRole.BRANCH_ADMIN);
      expect(res.context.assignedBranchId).toBe(admin.branch);
    }
  });

  // 3. Unregistered username produces clear and expected error message
  it("3. Unregistered username produces 'Username ... tidak terdaftar di sistem'", async () => {
    await expect(AuthService.signIn("nonexistent_user", "password123")).rejects.toThrow(
      "Username 'nonexistent_user' tidak terdaftar di sistem"
    );
  });

  // 4. Inactive staff account is rejected immediately
  it("4. Inactive account is rejected with administrator notification message", async () => {
    const db = MockDatabase.getInstance();
    const cece = db.userAccounts.find((a) => a.username.toLowerCase() === "cece");
    if (cece) {
      cece.active = false;
    }

    await expect(AuthService.signIn("cece", "laladentist123")).rejects.toThrow(
      "Akun Anda tidak aktif. Silakan hubungi administrator."
    );
  });

  // 5. Wrong password produces clear message and does NOT auto-provision
  it("5. Wrong password throws clear password error without auto-provisioning", async () => {
    await expect(AuthService.signIn("cece", "wrongpassword123")).rejects.toThrow(
      "Password yang Anda masukkan salah. Silakan periksa kembali."
    );
  });

  // 6. Username normalization consistency
  it("6. Username normalization is consistent across operations", () => {
    expect(AuthService.normalizeUsername("  CeCe_Admin  ")).toBe("cece_admin");
    expect(AuthService.usernameToInternalEmail("  CeCe_Admin  ")).toBe("cece_admin@laladentist.id");
  });

  // 7. Newly provisioned branch admin can log in with username and password
  it("7. Newly created Branch Admin account by Super Admin logs in seamlessly", async () => {
    const newAcc = await AuthService.createStaffAccount(superAdminContext, {
      username: "admin_forensic_test",
      name: "Admin Forensik",
      role: UserRole.BRANCH_ADMIN,
      branchId: "branch-gebang",
      password: "password123"
    });

    expect(newAcc.username).toBe("admin_forensic_test");

    const loginRes = await AuthService.signIn("admin_forensic_test", "password123");
    expect(loginRes.context.role).toBe(UserRole.BRANCH_ADMIN);
    expect(loginRes.context.assignedBranchId).toBe("branch-gebang");
  });

  // 8. Super Admin login using Email + Password remains intact
  it("8. Super Admin login with email + password works properly", async () => {
    const res = await AuthService.signIn("superadmin@laladentist.id", "laladentist123");
    expect(res.context.role).toBe(UserRole.SUPER_ADMIN);
  });

  // 9. Dedicated account recovery / sync enforces Super Admin authorization
  it("9. recoverOrSyncStaffAccount enforces Super Admin role", async () => {
    await expect(
      AuthService.recoverOrSyncStaffAccount(branchAdminContext, {
        userAccountId: "user-cece-gebang",
        newInitialPassword: "newpassword123"
      })
    ).rejects.toThrow(/Akses ditolak: Hanya Super Admin/i);

    const syncRes = await AuthService.recoverOrSyncStaffAccount(superAdminContext, {
      userAccountId: "user-cece-gebang",
      newInitialPassword: "newpassword123"
    });
    expect(syncRes.success).toBe(true);

    const loginRes = await AuthService.signIn("cece", "newpassword123");
    expect(loginRes.context.role).toBe(UserRole.BRANCH_ADMIN);
  });
});
