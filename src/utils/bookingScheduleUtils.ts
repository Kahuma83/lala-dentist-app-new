import { DoctorSchedule } from "../types/domain";

const SLOT_INTERVAL_MINUTES = 30;
const DEFAULT_START_MINUTES = 8 * 60;
const DEFAULT_END_MINUTES = 20 * 60;

const toMinutes = (value: string): number | null => {
  const match = value.match(/^(\d{1,2}):([0-5]\d)(?::[0-5]\d)?$/);
  if (!match) return null;
  const hours = Number(match[1]);
  if (hours > 23) return null;
  return hours * 60 + Number(match[2]);
};

const createSlots = (startMinutes: number, endMinutes: number): string[] => {
  if (endMinutes <= startMinutes) return [];

  const firstSlot = Math.ceil(startMinutes / SLOT_INTERVAL_MINUTES) * SLOT_INTERVAL_MINUTES;
  const slots: string[] = [];
  for (let minutes = firstSlot; minutes < endMinutes; minutes += SLOT_INTERVAL_MINUTES) {
    slots.push(`${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`);
  }
  return slots;
};

export const DEFAULT_BOOKING_TIME_SLOTS = createSlots(DEFAULT_START_MINUTES, DEFAULT_END_MINUTES);

export const getScheduledBookingTimeSlots = (schedule?: DoctorSchedule): string[] => {
  if (!schedule) return DEFAULT_BOOKING_TIME_SLOTS;

  const startMinutes = toMinutes(schedule.startTime);
  const endMinutes = toMinutes(schedule.endTime);
  if (startMinutes === null || endMinutes === null) return [];

  return createSlots(startMinutes, endMinutes);
};
