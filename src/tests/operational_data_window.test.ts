import { describe, expect, it } from "vitest";
import {
  getOperationalDataCutoff,
  isWithinOperationalDataWindow
} from "../utils/operationalDataWindow";

describe("operational data window", () => {
  const now = "2026-07-20T12:00:00.000Z";
  const cutoff = getOperationalDataCutoff(90, now);

  it("uses the configured lookback period", () => {
    expect(cutoff).toBe("2026-04-21T12:00:00.000Z");
  });

  it("keeps recent records and active records outside the window", () => {
    expect(isWithinOperationalDataWindow(
      "2026-07-01T10:00:00.000Z",
      "COMPLETED",
      ["WAITING", "IN_PROGRESS"],
      cutoff
    )).toBe(true);
    expect(isWithinOperationalDataWindow(
      "2025-01-01T10:00:00.000Z",
      "WAITING",
      ["WAITING", "IN_PROGRESS"],
      cutoff
    )).toBe(true);
  });

  it("excludes old terminal records and missing-date records without an active status", () => {
    expect(isWithinOperationalDataWindow(
      "2025-01-01T10:00:00.000Z",
      "COMPLETED",
      ["WAITING", "IN_PROGRESS"],
      cutoff
    )).toBe(false);
    expect(isWithinOperationalDataWindow(
      undefined,
      "COMPLETED",
      ["WAITING", "IN_PROGRESS"],
      cutoff
    )).toBe(false);
  });
});
