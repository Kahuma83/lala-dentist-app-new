import { DoctorSchedule } from "../types/domain";

export const DEFAULT_BOOKING_TIME_SLOTS = [
  "08:00",
  "09:00",
  "10:30",
  "11:00",
  "13:00",
  "14:30",
  "15:00",
  "16:00",
  "17:00",
  "18:30",
  "19:00",
  "20:00"
];

export const getScheduledBookingTimeSlots = (schedule?: DoctorSchedule): string[] => {
  if (!schedule) return DEFAULT_BOOKING_TIME_SLOTS;
  const toMinutes = (value: string): number | null => {
    const match = value.match(/^(\d{1,2}):([0-5]\d)/);
    if (!match) return null;
    const hours = Number(match[1]);
    if (hours > 23) return null;
    return hours * 60 + Number(match[2]);
  };
  const formatTime = (minutes: number) =>
    `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  const startMinutes = toMinutes(schedule.startTime);
  const endMinutes = toMinutes(schedule.endTime);
  if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) return [];

  const filtered = DEFAULT_BOOKING_TIME_SLOTS.filter(
    (slot) => {
      const slotMinutes = toMinutes(slot);
      return slotMinutes !== null && slotMinutes >= startMinutes && slotMinutes < endMinutes;
    }
  );
  return filtered.length > 0 ? filtered : [formatTime(startMinutes)];
};
