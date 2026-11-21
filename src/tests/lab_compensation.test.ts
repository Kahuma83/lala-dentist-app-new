import { describe, expect, it } from "vitest";
import { getDoctorShareBaseAmount } from "../utils/labCompensation";

describe("getDoctorShareBaseAmount", () => {
  it("uses the full treatment amount when the service does not require a lab", () => {
    expect(getDoctorShareBaseAmount(1_000_000, false)).toBe(1_000_000);
  });

  it("withholds the doctor's base until a positive lab invoice is recorded", () => {
    expect(getDoctorShareBaseAmount(1_000_000, true)).toBeNull();
    expect(getDoctorShareBaseAmount(1_000_000, true, 0)).toBeNull();
  });

  it("subtracts the lab invoice and never produces a negative share base", () => {
    expect(getDoctorShareBaseAmount(1_000_000, true, 250_000)).toBe(750_000);
    expect(getDoctorShareBaseAmount(100_000, true, 250_000)).toBe(0);
  });
});
