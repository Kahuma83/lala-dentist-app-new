import { describe, expect, it } from "vitest";
import { formatShortAccountingReference } from "../utils/accountingDisplay";

describe("formatShortAccountingReference", () => {
  it("shortens UUID references while retaining recognizable ends", () => {
    expect(formatShortAccountingReference("a1b2c3d4-1234-5678-90ab-cdef12345678"))
      .toBe("a1b2c3d4…5678");
  });

  it("shortens reversal journal numbers", () => {
    expect(formatShortAccountingReference("JRN-REV-a1b2c3d41234567890abcdef12345678"))
      .toBe("JRN-REV-a1b2c3…5678");
  });

  it("preserves short references and returns a dash for missing values", () => {
    expect(formatShortAccountingReference("EXP-20261021-0001")).toBe("EXP-20261021-0001");
    expect(formatShortAccountingReference(null)).toBe("-");
  });
});
