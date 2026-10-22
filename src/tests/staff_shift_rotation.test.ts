import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildMonthlyRosterPreview,
  fetchIndonesiaHolidays,
  getMondayOnOrBefore
} from "../utils/staffShiftRotation";
import {
  EmploymentStatus,
  Staff,
  StaffPosition,
  StaffShiftAssignment,
  StaffShiftRotationTemplate,
  WorkShift
} from "../types/domain";

const branchId = "branch-gebang";
const morningShift: WorkShift = {
  id: "shift-morning",
  branchId,
  name: "Shift Pagi",
  startTime: "08:00",
  endTime: "14:00",
  active: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
};
const afternoonShift: WorkShift = {
  id: "shift-afternoon",
  branchId,
  name: "Shift Sore",
  startTime: "14:00",
  endTime: "21:00",
  active: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
};

const createStaff = (
  id: string,
  fullName: string,
  position: StaffPosition,
  assignedBranchId = branchId,
  active = true
): Staff => ({
  id,
  employeeCode: `CODE-${id}`,
  fullName,
  phone: "",
  position,
  employmentStatus: active ? EmploymentStatus.ACTIVE : EmploymentStatus.INACTIVE,
  joinDate: "2026-01-01",
  active,
  branchId: assignedBranchId,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
});

const people = [
  createStaff("assistant-a", "Anisa", StaffPosition.ASSISTANT),
  createStaff("admin-b", "Budi", StaffPosition.BRANCH_ADMIN),
  createStaff("inactive-c", "Citra", StaffPosition.ASSISTANT, branchId, false),
  createStaff("other-branch", "Dina", StaffPosition.ASSISTANT, "branch-ambulu")
];

const templates: StaffShiftRotationTemplate[] = [
  {
    branchId,
    staffId: "assistant-a",
    initialShiftId: morningShift.id,
    rotationAnchorMonday: "2026-10-19"
  },
  {
    branchId,
    staffId: "admin-b",
    initialShiftId: afternoonShift.id,
    rotationAnchorMonday: "2026-10-19"
  }
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("staff shift rotation", () => {
  it("finds Monday on or before a date using calendar dates", () => {
    expect(getMondayOnOrBefore("2026-10-19")).toBe("2026-10-19");
    expect(getMondayOnOrBefore("2026-10-22")).toBe("2026-10-19");
    expect(getMondayOnOrBefore("2026-10-18")).toBe("2026-10-12");
  });

  it("alternates the assigned groups every Monday and skips Sundays and holidays", () => {
    const previousAssignment: StaffShiftAssignment = {
      id: "existing",
      staffId: "assistant-a",
      branchId,
      shiftId: morningShift.id,
      date: "2026-10-26",
      active: true,
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z"
    };
    const rows = buildMonthlyRosterPreview({
      month: "2026-10",
      branchId,
      staff: people,
      shifts: [morningShift, afternoonShift],
      templates,
      assignments: [previousAssignment],
      holidays: [{ date: "2026-10-21", name: "Libur cabang", type: "local" }]
    });
    const rowFor = (staffId: string, date: string) => rows.find((row) => row.staffId === staffId && row.date === date);

    expect(rows).toHaveLength(52);
    expect(rowFor("assistant-a", "2026-10-18")).toBeUndefined();
    expect(rowFor("assistant-a", "2026-10-21")).toBeUndefined();
    expect(rowFor("assistant-a", "2026-10-19")?.shiftId).toBe(morningShift.id);
    expect(rowFor("admin-b", "2026-10-19")?.shiftId).toBe(afternoonShift.id);
    expect(rowFor("assistant-a", "2026-10-26")).toMatchObject({
      shiftId: afternoonShift.id,
      previousShiftId: morningShift.id
    });
    expect(rowFor("admin-b", "2026-10-26")?.shiftId).toBe(morningShift.id);
    expect(rows.every((row) => row.staffId !== "inactive-c" && row.staffId !== "other-branch")).toBe(true);
  });

  it("rejects incomplete templates instead of silently assigning shifts", () => {
    expect(() => buildMonthlyRosterPreview({
      month: "2026-10",
      branchId,
      staff: people,
      shifts: [morningShift, afternoonShift],
      templates: [templates[0]],
      assignments: [],
      holidays: []
    })).toThrow("Pola rotasi belum lengkap");
  });

  it("rejects API errors and malformed holiday data", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response("Unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ date: "2026-10-01" }] }), { status: 200 })));

    await expect(fetchIndonesiaHolidays(2026, 10)).rejects.toThrow("HTTP 503");
    await expect(fetchIndonesiaHolidays(2026, 10)).rejects.toThrow("entri yang tidak valid");
  });

  it("loads Indonesian national and joint leave dates from the API response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [
        { date: "2026-10-01", name: "Hari nasional", type: "national_holiday" },
        { date: "2026-10-02", name: "Cuti bersama", type: "joint_leave" }
      ]
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchIndonesiaHolidays(2026, 10)).resolves.toEqual([
      { date: "2026-10-01", name: "Hari nasional", type: "national_holiday" },
      { date: "2026-10-02", name: "Cuti bersama", type: "joint_leave" }
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://indonesian-holidays.ahrulsyamil.com/holidays/2026/10",
      {
        signal: expect.any(AbortSignal),
        headers: { Accept: "application/json" }
      }
    );
  });
});
