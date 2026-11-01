export interface DoctorPortalBookingDateRange {
  dates: [string, string];
  startsAt: string;
  endsBefore: string;
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function getDoctorPortalBookingDateRange(today: string): DoctorPortalBookingDateRange {
  const tomorrow = addDays(today, 1);
  const dayAfterTomorrow = addDays(today, 2);
  return {
    dates: [tomorrow, dayAfterTomorrow],
    startsAt: `${tomorrow}T00:00:00+07:00`,
    endsBefore: `${addDays(dayAfterTomorrow, 1)}T00:00:00+07:00`
  };
}
