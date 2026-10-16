import { describe, expect, it } from "vitest";
import { formatCalendarDate, getOperationalDateString, getOperationalTimeString, toOperationalDateTime } from "../utils/dateUtils";

describe("operational booking time formatting", () => {
  it("formats schedule calendar dates without converting local midnight to UTC", () => {
    const localCalendarDate = new Date(2026, 9, 17);

    expect(formatCalendarDate(localCalendarDate)).toBe("2026-10-17");
  });

  it("formats Supabase UTC timestamps as Asia/Jakarta wall-clock time", () => {
    const timestamp = "2026-10-16T11:00:00+00:00";

    expect(getOperationalDateString(timestamp)).toBe("2026-10-16");
    expect(getOperationalTimeString(timestamp)).toBe("18:00");
  });

  it("formats booking timestamps already expressed in WIB without shifting the displayed time", () => {
    expect(getOperationalTimeString("2026-10-16T11:00:00+07:00")).toBe("11:00");
  });

  it("normalizes the selected local slot even when the incoming timestamp was encoded as UTC", () => {
    expect(toOperationalDateTime("2026-10-16T11:00:00Z", "11:00")).toBe("2026-10-16T04:00:00.000Z");
  });
});
