/**
 * Date Utility Helpers for Lala Dentist Operational Workflows
 */

import { AppClock } from "./clock";

/**
 * Date Utility Helpers for Lala Dentist Operational Workflows
 * Supports real-time device time (WIB / Asia/Jakarta) and test mock clock
 */

/**
 * Get current operational date in YYYY-MM-DD format (WIB / real device time)
 */
export function getTodayDateString(): string {
  return AppClock.todayDateString();
}

export function formatCalendarDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Resolve an ISO timestamp to its operational calendar date in WIB.
 */
export function getOperationalDateString(value: string | undefined): string {
  if (!value) return "";
  if (!value.includes("T")) return value.slice(0, 10);

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function getOperationalTimeString(value: string | undefined): string {
  if (!value) return "--:--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).format(date);
}

export function formatAttendanceTime(value: string | null | undefined): string {
  if (!value) return "-";
  if (!value.includes("T")) return value;
  const operationalTime = getOperationalTimeString(value);
  return operationalTime === "--:--" ? value : operationalTime;
}

export function toOperationalDateTime(value: string, time: string): string {
  const operationalDate = getOperationalDateString(value);
  if (!operationalDate || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new Error("Tanggal atau jam booking tidak valid");
  }
  const dateTime = new Date(`${operationalDate}T${time}:00+07:00`);
  if (Number.isNaN(dateTime.getTime())) {
    throw new Error("Tanggal atau jam booking tidak valid");
  }
  return dateTime.toISOString();
}

/**
 * Get tomorrow's date relative to an operational date (YYYY-MM-DD)
 */
export function getTomorrowDateString(baseDateStr?: string): string {
  const baseStr = baseDateStr || AppClock.todayDateString();
  const base = new Date(baseStr + "T00:00:00");
  if (isNaN(base.getTime())) {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split("T")[0];
  }
  const tomorrow = new Date(base);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const yyyy = tomorrow.getFullYear();
  const mm = String(tomorrow.getMonth() + 1).padStart(2, "0");
  const dd = String(tomorrow.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Get day after tomorrow's date string (YYYY-MM-DD)
 */
export function getDayAfterTomorrowDateString(baseDateStr?: string): string {
  const baseStr = baseDateStr || AppClock.todayDateString();
  const base = new Date(baseStr + "T00:00:00");
  if (isNaN(base.getTime())) {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    return d.toISOString().split("T")[0];
  }
  const dayAfter = new Date(base);
  dayAfter.setDate(dayAfter.getDate() + 2);
  const yyyy = dayAfter.getFullYear();
  const mm = String(dayAfter.getMonth() + 1).padStart(2, "0");
  const dd = String(dayAfter.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Compare whether two ISO datetime strings or date strings fall on the exact same calendar date (YYYY-MM-DD)
 */
export function isSameCalendarDate(dateStr1: string, dateStr2: string): boolean {
  if (!dateStr1 || !dateStr2) return false;
  const d1 = dateStr1.split("T")[0];
  const d2 = dateStr2.split("T")[0];
  return d1 === d2;
}

/**
 * Extract HH:mm time string from ISO datetime string
 */
export function extractTimeSlot(isoString: string | undefined): string {
  if (!isoString) return "--:--";
  try {
    const parts = isoString.split("T");
    if (parts.length > 1) {
      return parts[1].substring(0, 5);
    }
    return "--:--";
  } catch (e) {
    return "--:--";
  }
}

/**
 * Format a YYYY-MM-DD or ISO string to Indonesian localized date (e.g. "Selasa, 22 September 2026")
 */
export function formatIndonesianDate(dateStr: string): string {
  if (!dateStr) return "-";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("id-ID", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric"
    });
  } catch {
    return dateStr;
  }
}
