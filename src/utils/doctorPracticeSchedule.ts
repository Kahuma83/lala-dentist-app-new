import { DoctorSchedule, ScheduleStatus } from "../types/domain";

export function getDoctorPracticeBranchIds(
  schedules: DoctorSchedule[],
  doctorId: string,
  date: string
): string[] {
  return [...new Set(
    schedules
      .filter((schedule) =>
        schedule.doctorId === doctorId &&
        schedule.date === date &&
        schedule.status === ScheduleStatus.ACTIVE
      )
      .map((schedule) => schedule.branchId)
      .filter(Boolean)
  )].sort();
}

export function resolveDoctorPracticeBranchId(
  scheduledBranchIds: string[],
  selectedBranchId: string,
  assignedBranchId: string
): string {
  if (scheduledBranchIds.includes(selectedBranchId)) return selectedBranchId;
  if (scheduledBranchIds.includes(assignedBranchId)) return assignedBranchId;
  return scheduledBranchIds[0] || assignedBranchId;
}
