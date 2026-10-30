import { describe, expect, it } from "vitest";
import {
  generateCurrentWeekDoctorSchedules,
  refreshCurrentWeekGeneratedDoctorSchedules
} from "../data/mockData";

describe("Current-week demo doctor schedule refresh", () => {
  it("replaces generated schedules for this week and preserves manual and historical schedules", () => {
    const currentWeekSchedules = generateCurrentWeekDoctorSchedules();
    const firstScheduleDate = new Date(`${currentWeekSchedules[0].date}T00:00:00Z`);
    firstScheduleDate.setUTCDate(firstScheduleDate.getUTCDate() - 1);
    const outdatedGeneratedSchedule = {
      ...currentWeekSchedules[0],
      date: firstScheduleDate.toISOString().slice(0, 10),
      doctorId: "doc-vio",
      notes: "Jadwal demo lama"
    };
    const manualSchedule = {
      ...currentWeekSchedules[0],
      id: "manual-schedule",
      doctorId: "doc-aab"
    };
    const historicalGeneratedSchedule = {
      ...currentWeekSchedules[0],
      id: "sched-curr-historical",
      date: "2020-01-01"
    };

    const refreshedSchedules = refreshCurrentWeekGeneratedDoctorSchedules(
      [outdatedGeneratedSchedule, manualSchedule, historicalGeneratedSchedule],
      currentWeekSchedules
    );

    expect(refreshedSchedules).toContainEqual(manualSchedule);
    expect(refreshedSchedules).toContainEqual(historicalGeneratedSchedule);
    expect(refreshedSchedules).not.toContainEqual(outdatedGeneratedSchedule);
    expect(
      refreshedSchedules.filter((schedule) =>
        schedule.id.startsWith("sched-curr-") &&
        schedule.date >= firstScheduleDate.toISOString().slice(0, 10) &&
        schedule.date <= currentWeekSchedules[currentWeekSchedules.length - 1].date
      )
    ).toEqual(currentWeekSchedules);
  });

  it("keeps generated doctor schedules on their intended weekday", () => {
    const schedules = generateCurrentWeekDoctorSchedules();

    for (const schedule of schedules) {
      const generatedDay = Number(schedule.id.match(/^sched-curr-(\d+)-/)?.[1]);
      const weekday = new Date(`${schedule.date}T00:00:00Z`).getUTCDay();
      expect(weekday).toBe((generatedDay + 1) % 7);
    }

    const fridayGebangDoctors = schedules
      .filter((schedule) =>
        new Date(`${schedule.date}T00:00:00Z`).getUTCDay() === 5 &&
        schedule.branchId === "branch-gebang"
      )
      .map((schedule) => schedule.doctorId);
    expect(fridayGebangDoctors).toContain("doc-syafira");
  });
});
