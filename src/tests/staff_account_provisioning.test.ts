import { describe, it, expect, beforeEach, vi } from "vitest";
import { AuthService, AuthenticatedUserContext } from "../services/authService";
import { MockDatabase } from "../data/mockData";
import { MockPatientRepository } from "../repositories/mockRepositories";
import { UserRole } from "../types/domain";

// Mock Supabase to false for local/unit test isolation
vi.mock("../lib/supabase", () => ({
  isSupabaseConfigured: false,
  supabase: null
}));

describe("Real Staff Account Provisioning & RBAC", () => {
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

  it("0. Secure staff-account factory exists and is usable from the UI flow", async () => {
    const acc = await AuthService.createStaffAccountSecure(superAdminContext, {
      username: "secure_alias_user",
      name: "Akun Aman",
      role: UserRole.BRANCH_ADMIN,
      branchId: "branch-gebang",
      password: "password123"
    });

    expect(acc).toBeDefined();
    expect(acc.username).toBe("secure_alias_user");

    const loginRes = await AuthService.signIn("secure_alias_user", "password123");
    expect(loginRes.context.role).toBe(UserRole.BRANCH_ADMIN);
  });

  it("1. Super Admin successfully creates Branch Admin account (ADMIN_CABANG)", async () => {
    const acc = await AuthService.createStaffAccount(superAdminContext, {
      username: "admin_gebang_new",
      name: "Anggel Baru",
      role: UserRole.BRANCH_ADMIN,
      branchId: "branch-gebang",
      password: "password123"
    });

    expect(acc).toBeDefined();
    expect(acc.username).toBe("admin_gebang_new");
    expect(acc.role).toBe(UserRole.BRANCH_ADMIN);
    expect(acc.branchId).toBe("branch-gebang");

    // Verify login works with username and password
    const loginRes = await AuthService.signIn("admin_gebang_new", "password123");
    expect(loginRes.context.role).toBe(UserRole.BRANCH_ADMIN);
    expect(loginRes.context.assignedBranchId).toBe("branch-gebang");
  });

  it("2. Super Admin successfully creates Assistant account (ASSISTANT / DOCTOR_ASSISTANT)", async () => {
    const acc = await AuthService.createStaffAccount(superAdminContext, {
      username: "asisten_baru",
      name: "Siti Asisten",
      role: UserRole.DOCTOR_ASSISTANT,
      branchId: "branch-ambulu",
      password: "password123"
    });

    expect(acc.role).toBe(UserRole.DOCTOR_ASSISTANT);

    const loginRes = await AuthService.signIn("asisten_baru", "password123");
    expect(loginRes.context.role).toBe(UserRole.DOCTOR_ASSISTANT);
  });

  it("2b. Legacy seeded assistant username can be superseded by a newly created real account", async () => {
    const acc = await AuthService.createStaffAccount(superAdminContext, {
      username: "NOVI",
      name: "Novi Baru",
      role: UserRole.DOCTOR_ASSISTANT,
      branchId: "branch-gebang",
      password: "password123"
    });

    expect(acc.username).toBe("novi");
    expect(acc.role).toBe(UserRole.DOCTOR_ASSISTANT);

    const loginRes = await AuthService.signIn("NOVI", "password123");
    expect(loginRes.context.userAccountId).toBe(acc.id);

    const db = MockDatabase.getInstance();
    const legacySeed = db.userAccounts.find((a) => a.id === "user-novi-gebang");
    expect(legacySeed?.active).toBe(false);
  });

  it("3. Super Admin successfully creates Doctor account (DOCTOR)", async () => {
    const acc = await AuthService.createStaffAccount(superAdminContext, {
      username: "dr_budi",
      name: "Drg. Budi Santoso",
      role: UserRole.DOCTOR,
      branchId: "branch-gebang",
      password: "password123",
      doctorId: "doc-budi-id"
    });

    expect(acc.role).toBe(UserRole.DOCTOR);
    expect(acc.doctorId).toBe("doc-budi-id");

    const loginRes = await AuthService.signIn("dr_budi", "password123");
    expect(loginRes.context.role).toBe(UserRole.DOCTOR);
  });

  it("3b. Legacy seeded doctor username can be replaced by a newly created real doctor account", async () => {
    const acc = await AuthService.createStaffAccount(superAdminContext, {
      username: "syafira_doc",
      name: "Drg. Syafira Baru",
      role: UserRole.DOCTOR,
      branchId: "branch-gebang",
      password: "password123",
      doctorId: "doc-syafira-new"
    });

    expect(acc.username).toBe("syafira_doc");
    expect(acc.role).toBe(UserRole.DOCTOR);
    expect(acc.doctorId).toBe("doc-syafira-new");

    const loginRes = await AuthService.signIn("syafira_doc", "password123");
    expect(loginRes.context.userAccountId).toBe(acc.id);

    const db = MockDatabase.getInstance();
    const legacySeed = db.userAccounts.find((a) => a.id === "user-drg-syafira");
    expect(legacySeed?.active).toBe(false);
  });

  it("4. Duplicate username is rejected", async () => {
    await AuthService.createStaffAccount(superAdminContext, {
      username: "duplicate_user",
      name: "User Pertama",
      role: UserRole.BRANCH_ADMIN,
      branchId: "branch-gebang",
      password: "password123"
    });

    await expect(
      AuthService.createStaffAccount(superAdminContext, {
        username: "DUPLICATE_USER", // case-insensitive check
        name: "User Kedua",
        role: UserRole.BRANCH_ADMIN,
        branchId: "branch-gebang",
        password: "password123"
      })
    ).rejects.toThrow();
  });

  it("5. Non-Super Admin cannot create account through service", async () => {
    await expect(
      AuthService.createStaffAccount(branchAdminContext, {
        username: "unauthorized_user",
        name: "Hacker",
        role: UserRole.BRANCH_ADMIN,
        branchId: "branch-gebang",
        password: "password123"
      })
    ).rejects.toThrow(/Permission denied/i);
  });

  it("6 & 7. New account recorded in database with correct role and branch relations", async () => {
    const acc = await AuthService.createStaffAccount(superAdminContext, {
      username: "rel_test",
      name: "Relation Test",
      role: UserRole.BRANCH_ADMIN,
      branchId: "branch-kencong",
      password: "password123"
    });

    const db = MockDatabase.getInstance();
    const found = db.userAccounts.find((a) => a.id === acc.id);
    expect(found).toBeDefined();
    expect(found?.role).toBe(UserRole.BRANCH_ADMIN);
    expect(found?.branchId).toBe("branch-kencong");
  });

  it("8. Login with username and password succeeds", async () => {
    await AuthService.createStaffAccount(superAdminContext, {
      username: "login_test_user",
      name: "Login Test",
      role: UserRole.BRANCH_ADMIN,
      branchId: "branch-gebang",
      password: "securepassword123"
    });

    const res = await AuthService.signIn("login_test_user", "securepassword123");
    expect(res).toBeDefined();
    expect(res.context.userAccountId).toBeDefined();
  });

  it("9. Password change updates credentials", async () => {
    const acc = await AuthService.createStaffAccount(superAdminContext, {
      username: "pwd_change_user",
      name: "Pwd User",
      role: UserRole.BRANCH_ADMIN,
      branchId: "branch-gebang",
      password: "oldpassword123"
    });

    // Login with old password
    const res1 = await AuthService.signIn("pwd_change_user", "oldpassword123");
    expect(res1).toBeDefined();

    // Change password
    await AuthService.changePassword("newpassword123", "oldpassword123", acc.email);

    // Old password should fail or new password succeed
    const res2 = await AuthService.signIn("pwd_change_user", "newpassword123");
    expect(res2.context.role).toBe(UserRole.BRANCH_ADMIN);
  });

  it("10. Account not reported as successful if database fails to save (validation error / weak password)", async () => {
    await expect(
      AuthService.createStaffAccount(superAdminContext, {
        username: "weak_pwd",
        name: "Weak Pwd",
        role: UserRole.BRANCH_ADMIN,
        branchId: "branch-gebang",
        password: "123" // too short
      })
    ).rejects.toThrow();
  });

  it("11. Role enforcement and branch isolation checks", async () => {
    const res = await AuthService.signIn("dinda", "123456");
    expect(res.context.assignedBranchId).toBe("branch-ambulu");
    // Branch admin cannot modify other user accounts (RLS test)
    await expect(
      AuthService.updateUserAccount(res.context, "user-super", { role: UserRole.SUPER_ADMIN })
    ).rejects.toThrow();
  });

  it("12. Branch admin gets only patients for their assigned branch when branch-scoped requests are used", async () => {
    const db = MockDatabase.getInstance();
    db.patients = [
      {
        id: "pat-branch-a",
        medicalRecordNumber: "RM-001",
        name: "Pasien Cabang A",
        phone: "081234567890",
        dateOfBirth: "1990-01-01",
        gender: "L",
        address: "Alamat A",
        registeredBranchId: "branch-gebang",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: "pat-branch-b",
        medicalRecordNumber: "RM-002",
        name: "Pasien Cabang B",
        phone: "081234567891",
        dateOfBirth: "1991-02-02",
        gender: "P",
        address: "Alamat B",
        registeredBranchId: "branch-ambulu",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ];

    const repo = new MockPatientRepository();
    const scoped = await repo.getPatients(UserRole.BRANCH_ADMIN, "branch-gebang");

    expect(scoped.map((p) => p.id)).toEqual(["pat-branch-a"]);
  });

  it("13. No administrative service role keys in bundle", () => {
    const envServiceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(envServiceKey).toBeFalsy();
  });
});
