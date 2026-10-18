import { beforeEach, describe, expect, it, vi } from "vitest";
import { SupabaseDoctorRepository } from "../repositories/supabaseRepositories";
import { UserRole } from "../types/domain";

const mocks = vi.hoisted(() => {
  const query: Record<string, any> = {};
  for (const method of ["eq", "select", "update", "insert", "order", "single"]) {
    query[method] = vi.fn(() => query);
  }
  query.single = vi.fn();
  return {
    query,
    from: vi.fn(() => query)
  };
});

vi.mock("../lib/supabase", () => ({
  isSupabaseConfigured: true,
  supabase: { from: mocks.from }
}));

describe("Supabase doctor staff relation persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query.single.mockResolvedValue({
      data: {
        id: "11111111-1111-4111-8111-111111111111",
        staff_id: "22222222-2222-4222-8222-222222222222",
        doctor_code: "DOC-001",
        name: "Drg. Regina",
        full_name: "Drg. Regina",
        specialization: "Dokter Gigi Umum",
        phone: "081234567890",
        active: true
      },
      error: null
    });
  });

  it("persists staff_id when linking a doctor to an employee record", async () => {
    const repository = new SupabaseDoctorRepository();

    await repository.updateDoctor(
      "11111111-1111-4111-8111-111111111111",
      { staffId: "22222222-2222-4222-8222-222222222222" },
      UserRole.SUPER_ADMIN
    );

    expect(mocks.from).toHaveBeenCalledWith("dental_doctors");
    expect(mocks.query.update).toHaveBeenCalledWith(expect.objectContaining({
      staff_id: "22222222-2222-4222-8222-222222222222"
    }));
  });
});
