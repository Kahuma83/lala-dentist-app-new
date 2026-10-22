import { Staff, StaffPosition, StaffShiftAssignment, StaffShiftRotationTemplate, WorkShift } from "../types/domain";

export interface IndonesiaHoliday {
  date: string;
  name: string;
  type: "national_holiday" | "joint_leave" | "local";
}

export interface MonthlyRosterRow {
  staffId: string;
  branchId: string;
  shiftId: string;
  date: string;
  active: true;
  notes: string;
  previousShiftId?: string;
}

const isEligibleStaff = (staff: Staff) =>
  staff.active &&
  staff.employmentStatus !== "INACTIVE" &&
  (staff.position === StaffPosition.BRANCH_ADMIN || staff.position === StaffPosition.ASSISTANT);

const dateFromParts = (year: number, monthIndex: number, day: number) =>
  new Date(Date.UTC(year, monthIndex, day));

const toDateString = (date: Date) => date.toISOString().slice(0, 10);

export const getMondayOnOrBefore = (dateString: string) => {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - daysSinceMonday);
  return toDateString(date);
};

export const fetchIndonesiaHolidays = async (
  year: number,
  month: number,
  signal?: AbortSignal
): Promise<IndonesiaHoliday[]> => {
  const requestController = new AbortController();
  const timeoutId = setTimeout(() => requestController.abort(), 10000);
  const abortRequest = () => requestController.abort();
  signal?.addEventListener("abort", abortRequest, { once: true });
  let response: Response;
  try {
    response = await fetch(
      `https://indonesian-holidays.ahrulsyamil.com/holidays/${year}/${month}`,
      { signal: requestController.signal, headers: { Accept: "application/json" } }
    );
  } catch (error: unknown) {
    if (signal?.aborted) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Waktu tunggu kalender libur habis; coba muat ulang atau tandai tanggal secara manual.");
    }
    throw new Error("Tidak dapat terhubung ke layanan kalender libur.");
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener("abort", abortRequest);
  }
  if (!response.ok) {
    throw new Error(`Kalender libur nasional gagal dimuat (HTTP ${response.status}).`);
  }

  const payload: unknown = await response.json();
  if (!payload || typeof payload !== "object" || !("data" in payload) || !Array.isArray(payload.data)) {
    throw new Error("Format respons kalender libur nasional tidak dikenali.");
  }

  return payload.data.map((item: unknown) => {
    if (
      !item ||
      typeof item !== "object" ||
      !("date" in item) ||
      typeof item.date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(item.date) ||
      !item.date.startsWith(`${year}-${String(month).padStart(2, "0")}-`) ||
      !("name" in item) ||
      typeof item.name !== "string" ||
      !("type" in item) ||
      (item.type !== "national_holiday" && item.type !== "joint_leave")
    ) {
      throw new Error("Data kalender libur nasional berisi entri yang tidak valid.");
    }
    return { date: item.date, name: item.name, type: item.type };
  });
};

export const buildMonthlyRosterPreview = ({
  month,
  branchId,
  staff,
  shifts,
  templates,
  assignments,
  holidays
}: {
  month: string;
  branchId: string;
  staff: Staff[];
  shifts: WorkShift[];
  templates: StaffShiftRotationTemplate[];
  assignments: StaffShiftAssignment[];
  holidays: IndonesiaHoliday[];
}): MonthlyRosterRow[] => {
  const monthMatch = /^(\d{4})-(\d{2})$/.exec(month);
  if (!monthMatch) throw new Error("Bulan jadwal tidak valid.");

  const year = Number(monthMatch[1]);
  const monthIndex = Number(monthMatch[2]) - 1;
  const firstDate = dateFromParts(year, monthIndex, 1);
  const daysInMonth = dateFromParts(year, monthIndex + 1, 0).getUTCDate();
  const holidayDates = new Set(holidays.map((holiday) => holiday.date));
  const eligibleStaff = staff
    .filter((person) => person.branchId === branchId && isEligibleStaff(person))
    .sort((left, right) => left.fullName.localeCompare(right.fullName));
  const branchShifts = shifts.filter((shift) => shift.branchId === branchId && shift.active);
  const morningShift = branchShifts.find((shift) => shift.startTime === "08:00" && shift.endTime === "14:00");
  const afternoonShift = branchShifts.find((shift) => shift.startTime === "14:00" && shift.endTime === "21:00");
  if (!eligibleStaff.length) throw new Error("Tidak ada Admin Cabang atau Asisten aktif di cabang ini.");
  if (!morningShift || !afternoonShift) throw new Error("Shift Pagi dan Shift Sore aktif harus disiapkan untuk cabang ini.");

  const templateByStaff = new Map(templates.map((template) => [template.staffId, template]));
  if (eligibleStaff.some((person) => !templateByStaff.has(person.id))) {
    throw new Error("Pola rotasi belum lengkap. Atur shift awal untuk setiap Admin Cabang dan Asisten.");
  }

  const existingByStaffDate = new Map(assignments.map((assignment) => [
    `${assignment.staffId}:${assignment.date}`,
    assignment
  ]));
  const rows: MonthlyRosterRow[] = [];
  const anchorMonday = templates[0]?.rotationAnchorMonday;
  if (!anchorMonday) throw new Error("Tanggal awal rotasi belum ditentukan.");
  if (getMondayOnOrBefore(anchorMonday) !== anchorMonday) {
    throw new Error("Tanggal awal rotasi harus hari Senin.");
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = toDateString(dateFromParts(year, monthIndex, day));
    const dayOfWeek = dateFromParts(year, monthIndex, day).getUTCDay();
    if (dayOfWeek === 0 || holidayDates.has(date)) continue;

    const weekMonday = getMondayOnOrBefore(date);
    const weekOffset = Math.floor(
      (Date.parse(`${weekMonday}T00:00:00.000Z`) - Date.parse(`${anchorMonday}T00:00:00.000Z`)) /
      (7 * 24 * 60 * 60 * 1000)
    );

    for (const person of eligibleStaff) {
      const template = templateByStaff.get(person.id)!;
      if (template.branchId !== branchId) {
        throw new Error(`Pola rotasi untuk ${person.fullName} tersimpan pada cabang yang berbeda.`);
      }
      const initialShiftId = template.initialShiftId;
      if (initialShiftId !== morningShift.id && initialShiftId !== afternoonShift.id) {
        throw new Error(`Shift awal untuk ${person.fullName} bukan Shift Pagi atau Shift Sore aktif.`);
      }
      const shiftId = weekOffset % 2 === 0
        ? initialShiftId
        : initialShiftId === morningShift.id ? afternoonShift.id : morningShift.id;
      const existing = existingByStaffDate.get(`${person.id}:${date}`);
      rows.push({
        staffId: person.id,
        branchId,
        shiftId,
        date,
        active: true,
        notes: existing?.notes || `Rotasi minggu ${weekOffset + 1}`,
        previousShiftId: existing?.shiftId
      });
    }
  }

  return rows;
};
