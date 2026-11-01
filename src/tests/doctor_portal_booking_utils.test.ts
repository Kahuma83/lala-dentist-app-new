import { describe, expect, it } from "vitest";
import { getDoctorPortalBookingDateRange } from "../utils/doctorPortalBookingUtils";

describe("doctor portal booking date range", () => {
  it("includes today, tomorrow, and the day after tomorrow using WIB boundaries", () => {
    expect(getDoctorPortalBookingDateRange("2026-11-01")).toEqual({
      dates: ["2026-11-01", "2026-11-02", "2026-11-03"],
      startsAt: "2026-11-01T00:00:00+07:00",
      endsBefore: "2026-11-04T00:00:00+07:00"
    });
  });

  it("handles month and year boundaries", () => {
    expect(getDoctorPortalBookingDateRange("2026-12-31")).toEqual({
      dates: ["2026-12-31", "2027-01-01", "2027-01-02"],
      startsAt: "2026-12-31T00:00:00+07:00",
      endsBefore: "2027-01-03T00:00:00+07:00"
    });
  });
});
