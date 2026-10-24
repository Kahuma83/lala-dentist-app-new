import { describe, expect, it } from "vitest";
import { getTreatmentInvoiceUnitPrice } from "../utils/treatmentPricing";

describe("treatment invoice pricing", () => {
  it("uses the treatment's saved price snapshot", () => {
    expect(getTreatmentInvoiceUnitPrice({ priceSnapshot: 225000 }, { basePrice: 150000 })).toBe(225000);
  });

  it("falls back to the master service price for legacy treatments", () => {
    expect(getTreatmentInvoiceUnitPrice({}, { basePrice: 150000 })).toBe(150000);
  });
});
