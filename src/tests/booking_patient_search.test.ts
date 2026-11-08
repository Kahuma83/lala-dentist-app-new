import { describe, expect, it } from "vitest";
import { limitBookingPatientSearchResults } from "../utils/bookingPatientSearch";
import { UserRole } from "../types/domain";

const patients = Array.from({ length: 8 }, (_, index) => `patient-${index}`);

describe("booking patient search result limits", () => {
  it("shows all server search matches to Super Admin", () => {
    expect(limitBookingPatientSearchResults(patients, "Andri", UserRole.SUPER_ADMIN))
      .toEqual(patients);
  });

  it("keeps the existing five-result limit for branch admins", () => {
    expect(limitBookingPatientSearchResults(patients, "Andri", UserRole.BRANCH_ADMIN))
      .toEqual(patients.slice(0, 5));
  });

  it("shows only five suggested patients before searching", () => {
    expect(limitBookingPatientSearchResults(patients, "", UserRole.SUPER_ADMIN))
      .toEqual(patients.slice(0, 5));
  });
});
