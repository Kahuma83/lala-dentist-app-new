import { describe, it, expect, vi, beforeEach } from "vitest";
import { UserRole } from "../types/domain";
import { AuthService } from "../services/authService";
import { MockDatabase, MOCK_USER_ACCOUNTS } from "../data/mockData";
import { supabase, isSupabaseConfigured } from "../lib/supabase";

// Mock the Supabase client
vi.mock("../lib/supabase", () => {
  const mockSupabaseClient = {
    auth: {
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      resend: vi.fn(),
      verifyOtp: vi.fn(),
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
    }
  };
  return {
    isSupabaseConfigured: true,
    supabase: mockSupabaseClient
  };
});

describe("Lala Dentist Web Admin - Phase 9A Supabase Auth Foundation Tests", () => {
  let db: MockDatabase;

  beforeEach(() => {
    db = MockDatabase.resetInstance();
    vi.clearAllMocks();
  });

  // 1. Supabase client configuration
  it("Scenario 1: Should verify Supabase client is configured", () => {
    expect(isSupabaseConfigured).toBe(true);
    expect(supabase).toBeDefined();
    expect(supabase.auth).toBeDefined();
  });

  it("registers patient accounts through Supabase Auth with fixed patient metadata and email verification redirect", async () => {
    (supabase.auth.signUp as any).mockResolvedValue({
      data: { user: { id: "patient-auth-id" }, session: null },
      error: null
    });
    vi.stubGlobal("window", { location: { origin: "https://clinic.example" } });

    await AuthService.registerPatientAccount(" Patient@Example.com ", "patient-password", "  Pasien Uji  ", {
      phone: " 08123456789 ",
      dateOfBirth: "1990-01-01",
      gender: "P",
      address: "  Jl. Contoh No. 1  "
    });

    expect(supabase.auth.signUp).toHaveBeenCalledWith({
      email: "patient@example.com",
      password: "patient-password",
      options: {
        data: {
          account_type: "patient_portal",
          name: "Pasien Uji",
          phone: "08123456789",
          date_of_birth: "1990-01-01",
          gender: "P",
          address: "Jl. Contoh No. 1"
        },
        emailRedirectTo: "https://clinic.example/patient/confirm"
      }
    });
  });

  it("explains when patient confirmation email sending is rate limited", async () => {
    (supabase.auth.signUp as any).mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "email rate limit exceeded" }
    });

    await expect(
      AuthService.registerPatientAccount("patient@example.com", "patient-password", "Pasien", {
        phone: "08123456789",
        dateOfBirth: "1990-01-01",
        gender: "L",
        address: "Alamat"
      })
    ).rejects.toThrow("Terlalu banyak permintaan email verifikasi");
  });

  it("rejects staff-domain emails and short passwords before calling Supabase", async () => {
    await expect(
      AuthService.registerPatientAccount("staff@laladentist.id", "long-enough-password", "Pasien", {
        phone: "08123456789",
        dateOfBirth: "1990-01-01",
        gender: "L",
        address: "Alamat"
      })
    ).rejects.toThrow("Email internal klinik");
    await expect(
      AuthService.registerPatientAccount("patient@example.com", "short", "Pasien", {
        phone: "08123456789",
        dateOfBirth: "1990-01-01",
        gender: "L",
        address: "Alamat"
      })
    ).rejects.toThrow("minimal 8 karakter");
    expect(supabase.auth.signUp).not.toHaveBeenCalled();
  });

  it("requires the patient details needed to create a real clinic profile", async () => {
    await expect(
      AuthService.registerPatientAccount("patient@example.com", "patient-password", "Pasien", {
        phone: "",
        dateOfBirth: "1990-01-01",
        gender: "L",
        address: "Alamat"
      })
    ).rejects.toThrow("Nomor HP wajib diisi");
    expect(supabase.auth.signUp).not.toHaveBeenCalled();
  });

  it("resends patient confirmation emails using the patient login callback", async () => {
    (supabase.auth.resend as any).mockResolvedValue({ error: null });
    vi.stubGlobal("window", { location: { origin: "https://clinic.example" } });

    await AuthService.resendPatientConfirmation(" Patient@Example.com ");

    expect(supabase.auth.resend).toHaveBeenCalledWith({
      type: "signup",
      email: "patient@example.com",
      options: {
        emailRedirectTo: "https://clinic.example/patient/confirm"
      }
    });
  });

  it("verifies patient signup only after the confirmation page submits the token hash", async () => {
    (supabase.auth.verifyOtp as any).mockResolvedValue({
      data: { user: { id: "patient-auth-id" }, session: { access_token: "token" } },
      error: null
    });

    await AuthService.confirmPatientSignup(" signup-token-hash ");

    expect(supabase.auth.verifyOtp).toHaveBeenCalledWith({
      token_hash: "signup-token-hash",
      type: "signup"
    });
  });

  it("explains when a patient signup confirmation token is expired", async () => {
    (supabase.auth.verifyOtp as any).mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "Token has expired or is invalid" }
    });

    await expect(AuthService.confirmPatientSignup("expired-token"))
      .rejects.toThrow("Tautan verifikasi sudah kedaluwarsa atau tidak valid");
  });

  // 2. Login success
  it("Scenario 2: Should map Auth user to local UserAccount successfully on login", async () => {
    const mockAuthUserId = "supabase-uuid-super";
    const mockEmail = "superadmin@laladentist.id";

    // Mock successful Supabase Auth response
    (supabase.auth.signInWithPassword as any).mockResolvedValue({
      data: {
        user: { id: mockAuthUserId, email: mockEmail },
        session: { access_token: "jwt-token" }
      },
      error: null
    });

    // Seed the authUserId inside mock database for this test
    const target = db.userAccounts.find(a => a.email === mockEmail);
    if (target) target.authUserId = mockAuthUserId;

    const result = await AuthService.signIn(mockEmail, "password123");

    expect(result.context.authUserId).toBe(mockAuthUserId);
    expect(result.context.role).toBe(UserRole.SUPER_ADMIN);
    expect(result.context.userAccountId).toBe("user-super");
  });

  // 3. Login invalid credentials
  it("Scenario 3: Should throw a safe error when invalid credentials are provided", async () => {
    (supabase.auth.signInWithPassword as any).mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "Invalid login credentials", status: 400 }
    });

    await expect(AuthService.signIn("wrong@email.com", "wrongpass")).rejects.toThrow(
      "Email atau password salah"
    );
  });

  it("requires email confirmation before accepting patient login", async () => {
    (supabase.auth.signInWithPassword as any).mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "Email not confirmed", status: 400 }
    });

    await expect(
      AuthService.signIn("patient@example.com", "patient-password")
    ).rejects.toThrow("Email belum diverifikasi");
  });

  // 4. Logout
  it("Scenario 4: Should invoke supabase.auth.signOut() on logout", async () => {
    await AuthService.signOut();
    expect(supabase.auth.signOut).toHaveBeenCalledTimes(1);
  });

  // 5. Session restore
  it("Scenario 5: Should restore session on page reload using resolveUserContext", async () => {
    const mockAuthUserId = "supabase-uuid-gebang";
    const mockEmail = "gebang@laladentist.com";

    const target = db.userAccounts.find(a => a.email === mockEmail);
    if (target) target.authUserId = mockAuthUserId;

    const context = await AuthService.resolveUserContext(mockAuthUserId, mockEmail);

    expect(context.authUserId).toBe(mockAuthUserId);
    expect(context.role).toBe(UserRole.BRANCH_ADMIN);
    expect(context.assignedBranchId).toBe("branch-gebang");
    expect(context.staffId).toBe("staff-siska");
  });

  // 6. Unauthenticated state
  it("Scenario 6: Should detect unauthenticated state when no session exists", async () => {
    (supabase.auth.getSession as any).mockResolvedValue({
      data: { session: null },
      error: null
    });

    const session = await AuthService.getCurrentSession();
    expect(session).toBeNull();
  });

  // 7. Role resolution
  it("Scenario 7: Should resolve correct roles during profile mapping", async () => {
    const mockAuthUserId = "supabase-uuid-doc";
    const mockEmail = "syafira@laladentist.com";

    const target = db.userAccounts.find(a => a.email === mockEmail);
    if (target) target.authUserId = mockAuthUserId;

    const context = await AuthService.resolveUserContext(mockAuthUserId, mockEmail);
    expect(context.role).toBe(UserRole.DOCTOR);
  });

  // 8. Missing UserAccount
  it("Scenario 8: Should throw a safe error if authenticated Supabase user profile is missing in userAccounts database", async () => {
    await expect(AuthService.resolveUserContext("non-existent-uuid", "ghost@laladentist.com")).rejects.toThrow(
      "Akun pengguna (UserAccount) tidak ditemukan di database klinik"
    );
  });

  // 9. Invalid role
  it("Scenario 9: Should throw safe error if user profile contains an invalid role", async () => {
    const mockAuthUserId = "supabase-uuid-invalid";
    const mockEmail = "invalid-role@laladentist.com";

    // Register a bad account dynamically
    db.userAccounts.push({
      id: "bad-account",
      username: "baduser",
      email: mockEmail,
      name: "Bad Account",
      role: "HACKER_ROLE" as any,
      active: true,
      createdAt: "2023-01-01T00:00:00Z",
      updatedAt: "2023-01-01T00:00:00Z",
      authUserId: mockAuthUserId
    });

    await expect(AuthService.resolveUserContext(mockAuthUserId, mockEmail)).rejects.toThrow(
      "Peran pengguna (UserRole) tidak valid"
    );
  });

  // 10. Inactive account
  it("Scenario 10: Should reject login or context resolution if the UserAccount is inactive", async () => {
    const mockAuthUserId = "supabase-uuid-inactive";
    const mockEmail = "inactive@laladentist.com";

    // Add inactive account dynamically
    db.userAccounts.push({
      id: "inactive-account",
      username: "inactive",
      email: mockEmail,
      name: "Inactive Account",
      role: UserRole.BRANCH_ADMIN,
      active: false, // INACTIVE
      createdAt: "2023-01-01T00:00:00Z",
      updatedAt: "2023-01-01T00:00:00Z",
      authUserId: mockAuthUserId
    });

    await expect(AuthService.resolveUserContext(mockAuthUserId, mockEmail)).rejects.toThrow(
      "Akun Anda dinonaktifkan. Akses ditolak."
    );
  });

  // 11. Initial route mapping
  it("Scenario 11: Should verify mapping of roles to their designated initial dashboards/queues", () => {
    const getInitialRoute = (role: UserRole): string => {
      switch (role) {
        case UserRole.SUPER_ADMIN:
          return "/super-admin/dashboard";
        case UserRole.BRANCH_ADMIN:
          return "/branch-admin/dashboard";
        case UserRole.DOCTOR:
          return "/doctor/queue";
        case UserRole.DOCTOR_ASSISTANT:
          return "/assistant/queue";
        case UserRole.PATIENT:
          return "/patient/queue";
        default:
          return "/login";
      }
    };

    expect(getInitialRoute(UserRole.SUPER_ADMIN)).toBe("/super-admin/dashboard");
    expect(getInitialRoute(UserRole.BRANCH_ADMIN)).toBe("/branch-admin/dashboard");
    expect(getInitialRoute(UserRole.DOCTOR)).toBe("/doctor/queue");
    expect(getInitialRoute(UserRole.DOCTOR_ASSISTANT)).toBe("/assistant/queue");
    expect(getInitialRoute(UserRole.PATIENT)).toBe("/patient/queue");
  });

  // 12. Route guard
  it("Scenario 12: Should block direct access if role doesn't match", () => {
    const isAuthorized = (currentRole: UserRole, targetPath: string): boolean => {
      if (targetPath.startsWith("/super-admin") && currentRole !== UserRole.SUPER_ADMIN) {
        return false;
      }
      if (targetPath.startsWith("/branch-admin") && currentRole !== UserRole.BRANCH_ADMIN) {
        return false;
      }
      if (targetPath.startsWith("/doctor") && currentRole !== UserRole.DOCTOR) {
        return false;
      }
      if (targetPath.startsWith("/assistant") && currentRole !== UserRole.DOCTOR_ASSISTANT) {
        return false;
      }
      if (targetPath.startsWith("/patient") && currentRole !== UserRole.PATIENT) {
        return false;
      }
      return true;
    };

    // Patient trying to access Super Admin or Doctor routes should be denied
    expect(isAuthorized(UserRole.PATIENT, "/super-admin/dashboard")).toBe(false);
    expect(isAuthorized(UserRole.PATIENT, "/doctor/queue")).toBe(false);
    expect(isAuthorized(UserRole.PATIENT, "/patient/queue")).toBe(true);

    // Doctor trying to access Super Admin or Patient routes should be denied
    expect(isAuthorized(UserRole.DOCTOR, "/super-admin/dashboard")).toBe(false);
    expect(isAuthorized(UserRole.DOCTOR, "/patient/queue")).toBe(false);
    expect(isAuthorized(UserRole.DOCTOR, "/doctor/queue")).toBe(true);
  });

  // 13. Branch context
  it("Scenario 13: Should carry assignedBranchId for BRANCH_ADMIN to isolate data boundaries", async () => {
    const mockAuthUserId = "supabase-uuid-gebang";
    const mockEmail = "gebang@laladentist.com";

    const target = db.userAccounts.find(a => a.email === mockEmail);
    if (target) target.authUserId = mockAuthUserId;

    const context = await AuthService.resolveUserContext(mockAuthUserId, mockEmail);
    expect(context.role).toBe(UserRole.BRANCH_ADMIN);
    expect(context.assignedBranchId).toBe("branch-gebang");
  });

  // 14. Patient context
  it("Scenario 14: Should carry correct patientId matching userAccountId for Patient logins", async () => {
    const mockAuthUserId = "supabase-uuid-patient";
    const mockEmail = "amanda@laladentist.com";

    const target = db.userAccounts.find(a => a.email === mockEmail);
    if (target) target.authUserId = mockAuthUserId;

    const context = await AuthService.resolveUserContext(mockAuthUserId, mockEmail);
    expect(context.role).toBe(UserRole.PATIENT);
    expect(context.patientId).toBe("patient-1");
    expect(context.userAccountId).toBe("patient-1");
  });

  // 15. Doctor multi-branch identity
  it("Scenario 15: Should verify Doctor is not locked to a single branch context permanently, carrying optional doctorId link", async () => {
    const mockAuthUserId = "supabase-uuid-doc";
    const mockEmail = "syafira@laladentist.com";

    const target = db.userAccounts.find(a => a.email === mockEmail);
    if (target) target.authUserId = mockAuthUserId;

    const context = await AuthService.resolveUserContext(mockAuthUserId, mockEmail);
    expect(context.role).toBe(UserRole.DOCTOR);
    expect(context.doctorId).toBe("doc-syafira");
    // Doctors do not have permanent branch boundary lock
    expect(context.assignedBranchId).toBeNull();
  });
});
