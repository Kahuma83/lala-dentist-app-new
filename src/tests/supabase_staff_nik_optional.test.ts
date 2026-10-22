import { beforeEach, describe, expect, it, vi } from "vitest";
import { SupabaseStaffRepository } from "../repositories/supabaseRepositories";
import { EmploymentStatus, StaffPosition, UserRole } from "../types/domain";

const mocks = vi.hoisted(() => {
  const query: Record<string, any> = {};
  for (const method of ["select", "eq", "insert", "update", "single", "maybeSingle"]) {
    query[method] = vi.fn(() => query);
  }
  query.single = vi.fn();
  query.maybeSingle = vi.fn();
  return {
    query,
    from: vi.fn(() => query)
  };
});

vi.mock("../lib/supabase", () => ({
  isSupabaseConfigured: true,
  supabase: { from: mocks.from }
}));

const staffRow = {
  id: "staff-id",
  employee_code: "STF-003",
  full_name: "Tes Dokter",
  phone: "",
  position: "DOCTOR",
  employment_status: "ACTIVE",
  join_date: "2026-10-22",
  active: true,
  branch_id: "branch-gebang",
  user_account_id: null
};

describe("Supabase staff NIK optional field", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query.maybeSingle.mockResolvedValue({ data: null, error: null });
    mocks.query.single.mockResolvedValue({ data: staffRow, error: null });
  });

  it("does not send an empty NIK when creating a staff record", async () => {
    const repository = new SupabaseStaffRepository();

    await repository.createStaff({
      employeeCode: "STF-003",
      nik: "",
      fullName: "Tes Dokter",
      phone: "",
      position: StaffPosition.DOCTOR,
      employmentStatus: EmploymentStatus.ACTIVE,
      joinDate: "2026-10-22",
      active: true,
      branchId: "branch-gebang"
    }, UserRole.SUPER_ADMIN);

    expect(mocks.query.insert).toHaveBeenCalledWith(expect.not.objectContaining({ nik: expect.anything() }));
  });

  it("persists the NIK when the optional value is provided", async () => {
    const repository = new SupabaseStaffRepository();

    await repository.createStaff({
      employeeCode: "STF-003",
      nik: "3201010101900001",
      fullName: "Tes Dokter",
      phone: "",
      position: StaffPosition.DOCTOR,
      employmentStatus: EmploymentStatus.ACTIVE,
      joinDate: "2026-10-22",
      active: true,
      branchId: "branch-gebang"
    }, UserRole.SUPER_ADMIN);

    expect(mocks.query.insert).toHaveBeenCalledWith(expect.objectContaining({
      nik: "3201010101900001"
    }));
  });
});
