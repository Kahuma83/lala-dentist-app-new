import { describe, expect, it } from "vitest";
import { getOperationalDateString, getOperationalTimeString } from "../utils/dateUtils";

describe("getOperationalDateString", () => {
  it("uses the WIB date when an ISO timestamp falls on the previous UTC day", () => {
    expect(getOperationalDateString("2026-10-14T18:30:00.000Z")).toBe("2026-10-15");
  });

  it("preserves date-only values", () => {
    expect(getOperationalDateString("2026-10-15")).toBe("2026-10-15");
  });

  it("returns an empty string for missing timestamps", () => {
    expect(getOperationalDateString(undefined)).toBe("");
  });

  it("formats operational activity times in WIB", () => {
    expect(getOperationalTimeString("2026-10-31T18:00:00.000Z")).toBe("01:00");
  });
});
