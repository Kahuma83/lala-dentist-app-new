import { describe, it, expect, beforeEach } from "vitest";
import { MockDatabase } from "../data/mockData";
import { MockBranchRepository, MockStaffRepository, MockDoctorRepository } from "../repositories/mockRepositories";
import { UserRole, StaffPosition, EmploymentStatus } from "../types/domain";
import { AuthService } from "../services/authService";

describe("Branch Logo & Login Account Management", () => {
  let db: MockDatabase;
  let branchRepo: MockBranchRepository;
  let staffRepo: MockStaffRepository;
  let doctorRepo: MockDoctorRepository;

  beforeEach(() => {
    MockDatabase.resetInstance();
    db = MockDatabase.getInstance();
    branchRepo = new MockBranchRepository();
    staffRepo = new MockStaffRepository();
    doctorRepo = new MockDoctorRepository();
  });

  it("1. Should allow Super Admin and Branch Admin to update branch logo", async () => {
    const branchId = "branch-gebang";
    const newLogoUrl = "https://laladentist.com/media/gebang-new-logo.png";

    // Super Admin update
    const updatedBySuper = await branchRepo.updateBranch(
      branchId,
      { logoUrl: newLogoUrl },
      UserRole.SUPER_ADMIN,
      null
    );
    expect(updatedBySuper.logoUrl).toBe(newLogoUrl);

    // Branch Admin of branch-gebang update
    const newLogoUrl2 = "https://laladentist.com/media/gebang-logo-v2.png";
    const updatedByBranchAdmin = await branchRepo.updateBranch(
      branchId,
      { logoUrl: newLogoUrl2 },
      UserRole.BRANCH_ADMIN,
      branchId
    );
    expect(updatedByBranchAdmin.logoUrl).toBe(newLogoUrl2);
  });

  it("2. Should reject Branch Admin of a different branch from modifying another branch logo", async () => {
    await expect(
      branchRepo.updateBranch(
        "branch-gebang",
        { logoUrl: "https://evil.com/fake.png" },
        UserRole.BRANCH_ADMIN,
        "branch-kampus"
      )
    ).rejects.toThrow("Akses ditolak");
  });

  it("3. Should create Staff login account with password and authenticate successfully via AuthService", async () => {
    const email = "budi.staff@laladentist.com";
    const password = "Password123!";
    const newStaffCode = "STF-999";

    // Create Staff in repo
    const staff = await staffRepo.createStaff({
      employeeCode: newStaffCode,
      fullName: "Budi Perawat",
      position: StaffPosition.ASSISTANT,
      employmentStatus: EmploymentStatus.ACTIVE,
      branchId: "branch-gebang",
      active: true
    }, UserRole.SUPER_ADMIN);

    // Create UserAccount with password
    const userAccId = `user-${staff.id}`;
    db.userAccounts.push({
      id: userAccId,
      username: "budi.staff",
      email,
      password,
      name: "Budi Perawat",
      role: UserRole.DOCTOR_ASSISTANT,
      staffId: staff.id,
      branchId: "branch-gebang",
      active: true
    });

    // Valid authentication
    const authResult = await AuthService.signIn(email, password);
    expect(authResult.context.userAccountId).toBe(userAccId);
    expect(authResult.context.role).toBe(UserRole.DOCTOR_ASSISTANT);

    // Invalid password authentication
    await expect(AuthService.signIn(email, "WrongPassword!")).rejects.toThrow("Password yang Anda masukkan salah");
  });

  it("4. Should create Doctor login account with password and authenticate successfully", async () => {
    const docEmail = "drg.syafira@laladentist.com";
    const docPassword = "DoctorSecret123!";

    const doctor = await doctorRepo.createDoctor({
      doctorCode: "DRG-888",
      name: "drg. Syafira Restu",
      fullName: "drg. Syafira Restu",
      specialization: "Ortodonti",
      assignedBranchId: "branch-gebang",
      active: true
    });

    const userAccId = `user-doc-${doctor.id}`;
    db.userAccounts.push({
      id: userAccId,
      username: "drg.syafira",
      email: docEmail,
      password: docPassword,
      name: "drg. Syafira Restu",
      role: UserRole.DOCTOR,
      doctorId: doctor.id,
      branchId: "branch-gebang",
      active: true
    });

    const authResult = await AuthService.signIn(docEmail, docPassword);
    expect(authResult.context.userAccountId).toBe(userAccId);
    expect(authResult.context.role).toBe(UserRole.DOCTOR);
  });
});
