import { describe, expect, it } from "vitest";
import { isLabOrderCandidateService } from "../utils/labOrderEligibility";

describe("isLabOrderCandidateService", () => {
  it("allows branch admins to select prosthodontic and denture treatments", () => {
    expect(isLabOrderCandidateService({
      name: "Insersi GIPAL / Crown PFM",
      category: "PROSTHODONTIC"
    })).toBe(true);
    expect(isLabOrderCandidateService({
      name: "Gigi Tiruan Lepasan",
      category: "TREATMENT"
    })).toBe(true);
  });

  it("keeps unrelated services out of the lab order picker unless explicitly flagged", () => {
    expect(isLabOrderCandidateService({
      name: "Scaling Gigi",
      category: "PREVENTIVE"
    })).toBe(false);
    expect(isLabOrderCandidateService({
      name: "Perawatan Khusus",
      category: "OTHER",
      requiresLab: true
    })).toBe(true);
  });
});
