import { describe, it, expect, beforeEach } from "vitest";
import { AuthService } from "../services/authService";
import { MockDatabase } from "../data/mockData";
import { UserRole } from "../types/domain";

describe("Username & Non-Email Login Support", () => {
  beforeEach(() => {
    MockDatabase.resetInstance();
  });

  it("1. Should log in using pure username without @ symbol (e.g. siska_gebang)", async () => {
    const result = await AuthService.signIn("siska_gebang", "123456");
    expect(result.context.role).toBe(UserRole.BRANCH_ADMIN);
    expect(result.context.assignedBranchId).toBe("branch-gebang");
  });

  it("2. Should log in as Doctor Assistant using username (e.g. clary_assistant)", async () => {
    const result = await AuthService.signIn("clary_assistant", "123456");
    expect(result.context.role).toBe(UserRole.DOCTOR_ASSISTANT);
  });

  it("3. Should log in as Super Admin using alias 'lala_super' or 'superadmin'", async () => {
    const res1 = await AuthService.signIn("lala_super", "123456");
    expect(res1.context.role).toBe(UserRole.SUPER_ADMIN);

    const res2 = await AuthService.signIn("superadmin", "123456");
    expect(res2.context.role).toBe(UserRole.SUPER_ADMIN);
  });

  it("4. Should log in using staff phone number if associated", async () => {
    const db = MockDatabase.getInstance();
    const siska = db.staff.find((s) => s.id === "staff-siska");
    if (siska && siska.phone) {
      const res = await AuthService.signIn(siska.phone, "123456");
      expect(res.context.role).toBe(UserRole.BRANCH_ADMIN);
    }
  });

  it("5. Should log in as Dinda (Admin Ambulu) with username 'dinda' and password '123456'", async () => {
    const res = await AuthService.signIn("dinda", "123456");
    expect(res.context.role).toBe(UserRole.BRANCH_ADMIN);
    expect(res.context.assignedBranchId).toBe("branch-ambulu");
    expect(res.context.staffId).toBe("staff-dinda-ambulu");
  });

  it("6. Should log in as Anisa (Asisten Ambulu) with username 'anisa' and password '123456'", async () => {
    const res = await AuthService.signIn("anisa", "123456");
    expect(res.context.role).toBe(UserRole.DOCTOR_ASSISTANT);
    expect(res.context.assignedBranchId).toBe("branch-ambulu");
    expect(res.context.staffId).toBe("staff-anisa-ambulu");
  });

  it("7. Should log in as Marsa (Asisten Ambulu) with username 'marsa' and password '123456'", async () => {
    const res = await AuthService.signIn("marsa", "123456");
    expect(res.context.role).toBe(UserRole.DOCTOR_ASSISTANT);
    expect(res.context.assignedBranchId).toBe("branch-ambulu");
    expect(res.context.staffId).toBe("staff-marsa-ambulu");
  });

  it("8. Should log in all 15 requested users with username and password 'laladentist123'", async () => {
    const requestedUsers = [
      { user: "DINDA", role: UserRole.BRANCH_ADMIN, branch: "branch-ambulu" },
      { user: "ANISA", role: UserRole.DOCTOR_ASSISTANT, branch: "branch-ambulu" },
      { user: "MARSA", role: UserRole.DOCTOR_ASSISTANT, branch: "branch-ambulu" },
      { user: "ANGGEL", role: UserRole.BRANCH_ADMIN, branch: "branch-gebang" },
      { user: "LILIS", role: UserRole.BRANCH_ADMIN, branch: "branch-gebang" },
      { user: "CECE", role: UserRole.BRANCH_ADMIN, branch: "branch-gebang" },
      { user: "LINDA", role: UserRole.DOCTOR_ASSISTANT, branch: "branch-gebang" },
      { user: "NOVI", role: UserRole.DOCTOR_ASSISTANT, branch: "branch-gebang" },
      { user: "AYIK", role: UserRole.BRANCH_ADMIN, branch: "branch-kampus" },
      { user: "USNAKE", role: UserRole.BRANCH_ADMIN, branch: "branch-kencong" },
      { user: "CYNTIA", role: UserRole.BRANCH_ADMIN, branch: "branch-kencong" },
      { user: "KHALISA", role: UserRole.DOCTOR_ASSISTANT, branch: "branch-kencong" },
      { user: "ANITA", role: UserRole.DOCTOR_ASSISTANT, branch: "branch-kencong" },
      { user: "RANI", role: UserRole.BRANCH_ADMIN, branch: "branch-lengkong-mumbul" },
      { user: "IMA", role: UserRole.BRANCH_ADMIN, branch: "branch-lengkong-mumbul" }
    ];

    for (const item of requestedUsers) {
      // Test exact uppercase username
      const resUpper = await AuthService.signIn(item.user, "laladentist123");
      expect(resUpper.context.role).toBe(item.role);
      expect(resUpper.context.assignedBranchId).toBe(item.branch);

      // Test lowercase username
      const resLower = await AuthService.signIn(item.user.toLowerCase(), "laladentist123");
      expect(resLower.context.role).toBe(item.role);
      expect(resLower.context.assignedBranchId).toBe(item.branch);
    }
  });
});
