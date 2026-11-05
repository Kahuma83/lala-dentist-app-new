import { describe, expect, it } from "vitest";
import {
  AttendanceStatus,
  EmploymentStatus,
  StaffPosition,
  type Attendance,
  type Staff,
  type StaffShiftAssignment,
  type WorkShift
} from "../types/domain";
import { getVisitAssistantCandidates } from "../utils/treatmentAssistantAssignment";

const staff = (id: string): Staff => ({
  id,
  employeeCode: id,
  fullName: id,
  phone: "",
  position: StaffPosition.ASSISTANT,
  employmentStatus: EmploymentStatus.ACTIVE,
  joinDate: "2027-01-01",
  active: true,
  branchId: "branch-1",
  createdAt: "",
  updatedAt: ""
});

const assignment = (staffId: string, shiftId: string): StaffShiftAssignment => ({
  id: `assignment-${staffId}`,
  staffId,
  branchId: "branch-1",
  shiftId,
  date: "2027-02-12",
  active: true,
  createdAt: "",
  updatedAt: ""
});

const attendance = (staffId: string, checkOut: string | null = null): Attendance => ({
  id: `attendance-${staffId}`,
  staffId,
  branchId: "branch-1",
  date: "2027-02-12",
  attendanceStatus: AttendanceStatus.PRESENT,
  scheduledStartAt: "08:00",
  scheduledEndAt: "14:00",
  actualCheckInAt: "08:00",
  actualCheckOutAt: checkOut,
  lateMinutes: 0,
  earlyCheckoutMinutes: 0,
  createdAt: "",
  updatedAt: ""
});

const shifts: WorkShift[] = [
  { id: "morning", branchId: "branch-1", name: "Pagi", startTime: "08:00", endTime: "14:00", active: true, createdAt: "", updatedAt: "" },
  { id: "afternoon", branchId: "branch-1", name: "Sore", startTime: "14:00", endTime: "20:00", active: true, createdAt: "", updatedAt: "" }
];

const getCandidates = (options: {
  assistants: Staff[];
  assignments: StaffShiftAssignment[];
  attendances?: Attendance[];
}) => getVisitAssistantCandidates({
  branchId: "branch-1",
  scheduledAt: "2027-02-12T03:00:00.000Z",
  actionStartedAt: "2027-02-12T10:00:00.000Z",
  staff: options.assistants,
  assignments: options.assignments,
  shifts,
  attendances: options.attendances || []
});

describe("visit assistant assignment defaults", () => {
  it("defaults to the assistant scheduled for the booking shift when present", () => {
    const result = getCandidates({
      assistants: [staff("morning-assistant"), staff("afternoon-assistant")],
      assignments: [assignment("morning-assistant", "morning"), assignment("afternoon-assistant", "afternoon")],
      attendances: [attendance("morning-assistant")]
    });

    expect(result.defaultStaffId).toBe("morning-assistant");
    expect(result.candidates.map((item) => item.staffId)).toContain("morning-assistant");
  });

  it("does not make missing attendance data block the scheduled default", () => {
    const result = getCandidates({
      assistants: [staff("morning-assistant")],
      assignments: [assignment("morning-assistant", "morning")]
    });

    expect(result.defaultStaffId).toBe("morning-assistant");
    expect(result.candidates[0]?.attendanceState).toBe("NOT_RECORDED");
  });

  it("keeps the scheduled assistant available when treatment starts after shift end and checkout is open", () => {
    const result = getVisitAssistantCandidates({
      branchId: "branch-1",
      scheduledAt: "2027-02-12T03:00:00.000Z",
      actionStartedAt: "2027-02-12T10:30:00.000Z",
      staff: [staff("morning-assistant")],
      assignments: [assignment("morning-assistant", "morning")],
      shifts,
      attendances: [attendance("morning-assistant")]
    });

    expect(result.candidates[0]?.attendanceState).toBe("PRESENT");
    expect(result.defaultStaffId).toBe("morning-assistant");
  });

  it("does not default an assistant who has already checked out", () => {
    const result = getCandidates({
      assistants: [staff("morning-assistant")],
      assignments: [assignment("morning-assistant", "morning")],
      attendances: [attendance("morning-assistant", "16:30")]
    });

    expect(result.defaultStaffId).toBeNull();
    expect(result.candidates[0]?.attendanceState).toBe("NOT_PRESENT");
  });

  it("leaves the choice to the doctor when multiple assistants share the booking shift", () => {
    const result = getCandidates({
      assistants: [staff("assistant-a"), staff("assistant-b")],
      assignments: [assignment("assistant-a", "morning"), assignment("assistant-b", "morning")],
      attendances: [attendance("assistant-a"), attendance("assistant-b")]
    });

    expect(result.defaultStaffId).toBeNull();
    expect(result.candidates).toHaveLength(2);
  });

  it("keeps other assistants assigned to the branch available for an explicit override", () => {
    const result = getCandidates({
      assistants: [staff("morning-assistant"), staff("afternoon-assistant")],
      assignments: [assignment("morning-assistant", "morning"), assignment("afternoon-assistant", "afternoon")]
    });

    expect(result.defaultStaffId).toBe("morning-assistant");
    expect(result.candidates.map((item) => item.staffId)).toContain("afternoon-assistant");
  });
});
