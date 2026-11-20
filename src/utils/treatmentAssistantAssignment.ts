import {
  Attendance,
  AttendanceStatus,
  EmploymentStatus,
  Staff,
  StaffPosition,
  StaffShiftAssignment,
  TreatmentPicStaffCandidate,
  VisitAssistantAssignment,
  WorkShift
} from "../types/domain";
import { getOperationalDateString, getOperationalTimeString } from "./dateUtils";

export type AssistantAttendanceState = "PRESENT" | "NOT_PRESENT" | "NOT_RECORDED";

export interface VisitAssistantCandidate {
  staffId: string;
  fullName: string;
  position: StaffPosition;
  isScheduledForBooking: boolean;
  attendanceState: AssistantAttendanceState;
}

interface VisitAssistantCandidateInput {
  branchId: string;
  scheduledAt: string;
  actionStartedAt: string;
  staff: TreatmentPicStaffCandidate[];
  assignments: StaffShiftAssignment[];
  shifts: WorkShift[];
  attendances: Attendance[];
}

export const resolveDefaultVisitAssistantId = ({
  assignment,
  treatmentAssistantId,
  queueAssistantId,
  scheduledDefaultStaffId
}: {
  assignment?: VisitAssistantAssignment;
  treatmentAssistantId?: string | null;
  queueAssistantId?: string | null;
  scheduledDefaultStaffId?: string | null;
}): string | null => {
  if (assignment?.assistantStaffId) return assignment.assistantStaffId;
  return treatmentAssistantId
    || queueAssistantId
    || scheduledDefaultStaffId
    || null;
};

const timeToMinutes = (value: string | null | undefined): number | null => {
  const match = value?.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};

const attendanceTimestamp = (value: string | null, date: string): number | null => {
  if (!value) return null;
  const timestamp = /^\d{2}:\d{2}/.test(value)
    ? Date.parse(`${date}T${value.slice(0, 5)}:00+07:00`)
    : Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
};

const shiftContains = (startTime: string, endTime: string, time: string): boolean => {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  const target = timeToMinutes(time);
  if (start === null || end === null || target === null) return false;
  if (start === end) return true;
  return start < end
    ? target >= start && target < end
    : target >= start || target < end;
};

const getAssignmentShift = (
  assignment: StaffShiftAssignment,
  shifts: WorkShift[]
): { startTime: string; endTime: string } | null => {
  if (assignment.customStartTime && assignment.customEndTime) {
    return { startTime: assignment.customStartTime, endTime: assignment.customEndTime };
  }
  const shift = shifts.find((item) =>
    item.id === assignment.shiftId
    && item.branchId === assignment.branchId
    && item.active
  );
  return shift ? { startTime: shift.startTime, endTime: shift.endTime } : null;
};

const isAttendanceActiveAt = (attendance: Attendance, timestamp: number): boolean => {
  if (
    attendance.attendanceStatus !== AttendanceStatus.PRESENT
    && attendance.attendanceStatus !== AttendanceStatus.LATE
  ) return false;
  const checkIn = attendanceTimestamp(attendance.actualCheckInAt, attendance.date);
  const checkOut = attendanceTimestamp(attendance.actualCheckOutAt, attendance.date);
  return checkIn !== null && checkIn <= timestamp && (checkOut === null || checkOut > timestamp);
};

export const getVisitAssistantCandidates = ({
  branchId,
  scheduledAt,
  actionStartedAt,
  staff,
  assignments,
  shifts,
  attendances
}: VisitAssistantCandidateInput): { candidates: VisitAssistantCandidate[]; defaultStaffId: string | null } => {
  const scheduleDate = getOperationalDateString(scheduledAt);
  const scheduleTime = getOperationalTimeString(scheduledAt);
  const actionTimestamp = Date.parse(actionStartedAt);
  if (!scheduleDate || scheduleTime === "--:--" || Number.isNaN(actionTimestamp)) {
    return { candidates: [], defaultStaffId: null };
  }

  const eligibleStaff = staff.filter((item) =>
    item.active
    && item.employmentStatus === EmploymentStatus.ACTIVE
    && (item.position === StaffPosition.ASSISTANT || item.position === StaffPosition.BRANCH_ADMIN)
  );
  const staffById = new Map(eligibleStaff.map((item) => [item.id, item]));
  const dayAssignments = assignments.filter((item) =>
    item.active && item.branchId === branchId && item.date === scheduleDate && staffById.has(item.staffId)
  );
  const scheduledIds = new Set(dayAssignments.filter((assignment) => {
    const shift = getAssignmentShift(assignment, shifts);
    return Boolean(shift && shiftContains(shift.startTime, shift.endTime, scheduleTime));
  }).map((item) => item.staffId));

  const attendanceByStaff = new Map(
    attendances
      .filter((item) => item.branchId === branchId && item.date === scheduleDate)
      .map((item) => [item.staffId, item])
  );
  const presentIds = new Set(
    [...attendanceByStaff.values()]
      .filter((attendance) => isAttendanceActiveAt(attendance, actionTimestamp))
      .map((item) => item.staffId)
  );
  const eligiblePresentIds = [...presentIds].filter((staffId) => {
    const candidate = staffById.get(staffId);
    return candidate?.position === StaffPosition.ASSISTANT
      || candidate?.branchId === branchId
      || dayAssignments.some((assignment) => assignment.staffId === staffId);
  });
  const candidateIds = new Set([
    ...dayAssignments.map((item) => item.staffId),
    ...eligiblePresentIds,
    ...eligibleStaff
      .filter((item) => item.branchId === branchId)
      .map((item) => item.id)
  ].filter((id) => staffById.has(id)));
  const candidates = [...candidateIds]
    .map((staffId) => staffById.get(staffId))
    .filter((item): item is Staff => item !== undefined)
    .map((candidate): VisitAssistantCandidate => {
      const attendance = attendanceByStaff.get(candidate.id);
      return {
        staffId: candidate.id,
        fullName: candidate.fullName,
        position: candidate.position,
        isScheduledForBooking: scheduledIds.has(candidate.id),
        attendanceState: presentIds.has(candidate.id)
          ? "PRESENT"
          : attendance
            ? "NOT_PRESENT"
            : "NOT_RECORDED"
      };
    })
    .sort((left, right) =>
      Number(right.isScheduledForBooking) - Number(left.isScheduledForBooking)
      || left.fullName.localeCompare(right.fullName)
    );

  const scheduledCandidates = candidates.filter((item) =>
    item.position === StaffPosition.ASSISTANT && item.isScheduledForBooking
  );
  const defaultCandidate = scheduledCandidates.length === 1
    ? scheduledCandidates[0]
    : null;

  return { candidates, defaultStaffId: defaultCandidate?.staffId || null };
};
