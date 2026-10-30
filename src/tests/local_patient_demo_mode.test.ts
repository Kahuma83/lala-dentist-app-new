import { describe, expect, it } from "vitest";
import { isFullAppDemoPath } from "../utils/localPatientDemo";

describe("Full app demo routing", () => {
  it("recognizes the demo entry and nested app routes", () => {
    expect(isFullAppDemoPath("/demo")).toBe(true);
    expect(isFullAppDemoPath("/demo/doctor/queue")).toBe(true);
    expect(isFullAppDemoPath("/demo/branch-admin/patients")).toBe(true);
  });

  it("does not mistake similarly named operational routes for the demo", () => {
    expect(isFullAppDemoPath("/doctor/queue")).toBe(false);
    expect(isFullAppDemoPath("/demo-treatment")).toBe(false);
    expect(isFullAppDemoPath("/demography")).toBe(false);
  });
});
