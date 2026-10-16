import { describe, it, expect, beforeEach, vi } from "vitest";
import { UserRole } from "../types/domain";
import { AuthService, AuthenticatedUserContext } from "../services/authService";
import { MockDatabase } from "../data/mockData";

describe("Lala Dentist Web Admin - Phase 9A.1 Supabase RLS & Role Escalation Security Tests", () => {
  let db: MockDatabase;

  // Contexts
  let superAdminContext: AuthenticatedUserContext;
  let branchAdminContext: AuthenticatedUserContext;
  let doctorContext: AuthenticatedUserContext;
  let assistantContext: AuthenticatedUserContext;
  let patientContext: AuthenticatedUserContext;

  beforeEach(() => {
    db = MockDatabase.resetInstance();
    vi.clearAllMocks();

    // Setup accounts
    const superAcc = db.userAccounts.find((a) => a.role === UserRole.SUPER_ADMIN)!;
    superAcc.authUserId = "auth-super-123";
    superAdminContext = {
      authUserId: superAcc.authUserId,
      userAccountId: superAcc.id,
      role: UserRole.SUPER_ADMIN,
      staffId: superAcc.staffId,
      assignedBranchId: superAcc.branchId
    };

    const branchAcc = db.userAccounts.find((a) => a.role === UserRole.BRANCH_ADMIN)!;
    branchAcc.authUserId = "auth-branch-123";
    branchAdminContext = {
      authUserId: branchAcc.authUserId,
      userAccountId: branchAcc.id,
      role: UserRole.BRANCH_ADMIN,
      staffId: branchAcc.staffId,
      assignedBranchId: branchAcc.branchId
    };

    const docAcc = db.userAccounts.find((a) => a.role === UserRole.DOCTOR)!;
    docAcc.authUserId = "auth-doc-123";
    doctorContext = {
      authUserId: docAcc.authUserId,
      userAccountId: docAcc.id,
      role: UserRole.DOCTOR,
      staffId: docAcc.staffId,
      doctorId: docAcc.doctorId,
      assignedBranchId: null
    };

    const asstAcc = db.userAccounts.find((a) => a.role === UserRole.DOCTOR_ASSISTANT)!;
    asstAcc.authUserId = "auth-asst-123";
    assistantContext = {
      authUserId: asstAcc.authUserId,
      userAccountId: asstAcc.id,
      role: UserRole.DOCTOR_ASSISTANT,
      staffId: asstAcc.staffId,
      assignedBranchId: asstAcc.branchId
    };

    const patientAcc = db.userAccounts.find((a) => a.role === UserRole.PATIENT)!;
    patientAcc.authUserId = "auth-pat-123";
    patientContext = {
      authUserId: patientAcc.authUserId,
      userAccountId: patientAcc.id,
      role: UserRole.PATIENT,
      patientId: patientAcc.id,
      assignedBranchId: null
    };
  });

  // ===================================================================
  // SECTION 1: ROLE ESCALATION PREVENTION TESTS
  // ===================================================================

  it("Security Test 1: PATIENT attempting to escalate role to SUPER_ADMIN MUST be rejected", async () => {
    await expect(
      AuthService.updateUserAccount(patientContext, patientContext.userAccountId, {
        role: UserRole.SUPER_ADMIN
      })
    ).rejects.toThrow("Privilege escalation rejected: role modification is restricted to SUPER_ADMIN.");
  });

  it("Security Test 2: DOCTOR attempting to escalate role to SUPER_ADMIN MUST be rejected", async () => {
    await expect(
      AuthService.updateUserAccount(doctorContext, doctorContext.userAccountId, {
        role: UserRole.SUPER_ADMIN
      })
    ).rejects.toThrow("Privilege escalation rejected: role modification is restricted to SUPER_ADMIN.");
  });

  it("Security Test 3: DOCTOR_ASSISTANT attempting to escalate role to SUPER_ADMIN MUST be rejected", async () => {
    await expect(
      AuthService.updateUserAccount(assistantContext, assistantContext.userAccountId, {
        role: UserRole.SUPER_ADMIN
      })
    ).rejects.toThrow("Privilege escalation rejected: role modification is restricted to SUPER_ADMIN.");
  });

  it("Security Test 4: BRANCH_ADMIN attempting to escalate role to SUPER_ADMIN MUST be rejected", async () => {
    await expect(
      AuthService.updateUserAccount(branchAdminContext, branchAdminContext.userAccountId, {
        role: UserRole.SUPER_ADMIN
      })
    ).rejects.toThrow("Privilege escalation rejected: role modification is restricted to SUPER_ADMIN.");
  });

  // ===================================================================
  // SECTION 2: PATIENT AUTHORIZATION TAMPERING TESTS
  // ===================================================================

  it("Security Test 5: PATIENT attempting to self-assign staff_id MUST be rejected", async () => {
    await expect(
      AuthService.updateUserAccount(patientContext, patientContext.userAccountId, {
        staffId: "staff-injected-id"
      })
    ).rejects.toThrow("Authorization tampering rejected: staff_id modification is restricted to SUPER_ADMIN.");
  });

  it("Security Test 6: PATIENT attempting to alter patient_id to victim patient MUST be rejected", async () => {
    await expect(
      AuthService.updateUserAccount(patientContext, patientContext.userAccountId, {
        patientId: "pat-victim-999"
      })
    ).rejects.toThrow("Authorization tampering rejected: patient_id modification is restricted to SUPER_ADMIN.");
  });

  it("Security Test 7: PATIENT attempting to alter branch_id MUST be rejected", async () => {
    await expect(
      AuthService.updateUserAccount(patientContext, patientContext.userAccountId, {
        branchId: "branch-surabaya-east"
      })
    ).rejects.toThrow("Authorization tampering rejected: branch_id modification is restricted to SUPER_ADMIN.");
  });

  it("Security Test 8: PATIENT attempting to tamper with active status flag MUST be rejected", async () => {
    await expect(
      AuthService.updateUserAccount(patientContext, patientContext.userAccountId, {
        active: false
      })
    ).rejects.toThrow("Status tampering rejected: account active status modification is restricted to SUPER_ADMIN.");
  });

  it("Security Test 9: PATIENT attempting to hijack auth_user_id MUST be rejected", async () => {
    await expect(
      AuthService.updateUserAccount(patientContext, patientContext.userAccountId, {
        authUserId: "auth-hijacked-super"
      })
    ).rejects.toThrow("Identity tampering rejected: auth_user_id is immutable.");
  });

  it("Security Test 10: PATIENT attempting to tamper with primary id MUST be rejected", async () => {
    await expect(
      AuthService.updateUserAccount(patientContext, patientContext.userAccountId, {
        id: "id-hijacked-uuid"
      })
    ).rejects.toThrow("Identity tampering rejected: id is immutable.");
  });

  it("Security Test 11: PATIENT attempting to update another user account row MUST be rejected by RLS", async () => {
    await expect(
      AuthService.updateUserAccount(patientContext, doctorContext.userAccountId, {
        name: "Tampered Doctor Name"
      })
    ).rejects.toThrow("Permission denied: Cannot update other user accounts (RLS violation)");
  });

  it("Security Test 12: PATIENT updating allowed non-authorization profile field (name) MUST succeed", async () => {
    const updated = await AuthService.updateUserAccount(patientContext, patientContext.userAccountId, {
      name: "Budi Updated Patient"
    });
    expect(updated.name).toBe("Budi Updated Patient");
    expect(updated.role).toBe(UserRole.PATIENT);
  });

  // ===================================================================
  // SECTION 3: DOCTOR, ASSISTANT, AND BRANCH ADMIN SPECIFIC TESTS
  // ===================================================================

  it("Security Test 13: DOCTOR attempting to modify branch_id or role MUST be rejected", async () => {
    await expect(
      AuthService.updateUserAccount(doctorContext, doctorContext.userAccountId, {
        branchId: "branch-central"
      })
    ).rejects.toThrow("Authorization tampering rejected: branch_id modification is restricted to SUPER_ADMIN.");
  });

  it("Security Test 14: DOCTOR_ASSISTANT attempting to assign staffId or role MUST be rejected", async () => {
    await expect(
      AuthService.updateUserAccount(assistantContext, assistantContext.userAccountId, {
        role: UserRole.DOCTOR
      })
    ).rejects.toThrow("Privilege escalation rejected: role modification is restricted to SUPER_ADMIN.");
  });

  it("Security Test 15: BRANCH_ADMIN attempting to update another branch admin or doctor row MUST be rejected by RLS", async () => {
    await expect(
      AuthService.updateUserAccount(branchAdminContext, superAdminContext.userAccountId, {
        name: "Hacked Super Admin"
      })
    ).rejects.toThrow("Permission denied: Cannot update other user accounts (RLS violation)");
  });

  // ===================================================================
  // SECTION 4: SUPER_ADMIN ADMINISTRATIVE AUTHORIZATION TESTS
  // ===================================================================

  it("Security Test 16: SUPER_ADMIN MUST be allowed to update user role", async () => {
    const target = assistantContext.userAccountId;
    const updated = await AuthService.updateUserAccount(superAdminContext, target, {
      role: UserRole.DOCTOR
    });
    expect(updated.role).toBe(UserRole.DOCTOR);
  });

  it("Security Test 17: SUPER_ADMIN MUST be allowed to activate or deactivate account", async () => {
    const target = patientContext.userAccountId;
    const deactivated = await AuthService.updateUserAccount(superAdminContext, target, {
      active: false
    });
    expect(deactivated.active).toBe(false);

    const reactivated = await AuthService.updateUserAccount(superAdminContext, target, {
      active: true
    });
    expect(reactivated.active).toBe(true);
  });

  it("Security Test 18: SUPER_ADMIN MUST be allowed to assign staff_id", async () => {
    const target = assistantContext.userAccountId;
    const updated = await AuthService.updateUserAccount(superAdminContext, target, {
      staffId: "staff-assigned-by-super"
    });
    expect(updated.staffId).toBe("staff-assigned-by-super");
  });

  it("Security Test 19: SUPER_ADMIN MUST be allowed to assign patient_id", async () => {
    const target = patientContext.userAccountId;
    const updated = await AuthService.updateUserAccount(superAdminContext, target, {
      patientId: "pat-assigned-by-super"
    });
    expect(updated.patientId).toBe("pat-assigned-by-super");
  });

  it("Security Test 20: SUPER_ADMIN MUST be allowed to assign branch_id", async () => {
    const target = branchAdminContext.userAccountId;
    const updated = await AuthService.updateUserAccount(superAdminContext, target, {
      branchId: "branch-new-subbranch"
    });
    expect(updated.branchId).toBe("branch-new-subbranch");
  });
});
