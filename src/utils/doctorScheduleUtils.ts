import { DentalBranch, DentalDoctor, DoctorSchedule, ScheduleStatus } from "../types/domain";
import { isBranchMatch } from "./branchUtils";

export function getActiveDoctorsForSchedule(
  doctors: DentalDoctor[],
  schedules: DoctorSchedule[],
  branchId: string,
  date: string,
  branches: DentalBranch[]
): DentalDoctor[] {
  const activeSchedules = schedules.filter(
    (schedule) =>
      isBranchMatch(schedule.branchId, branchId, branches) &&
      schedule.date === date &&
      schedule.status === ScheduleStatus.ACTIVE
  );

  if (activeSchedules.length === 0) return [];

  const activeDoctors = doctors.filter((doctor) => doctor.active ?? doctor.isActive ?? true);
  return activeDoctors.filter((doctor) =>
    activeSchedules.some((schedule) => {
      if (schedule.doctorId === doctor.id) return true;
      const cleanDoctorId = doctor.id.toLowerCase().replace(/^doc-/, "");
      const cleanScheduleDoctorId = schedule.doctorId.toLowerCase().replace(/^doc-/, "");
      return cleanDoctorId === cleanScheduleDoctorId ||
        Boolean(doctor.doctorCode && doctor.doctorCode.toLowerCase() === schedule.doctorId.toLowerCase());
    })
  );
}