import { describe, expect, it } from "vitest";
import { getDoctorDisplayName, getDoctorDocumentName } from "../utils/doctorNameUtils";

describe("doctor name display rules", () => {
  const doctor = {
    name: "drg. Sari",
    fullName: "drg. Sari Rahmawati, Sp.KG"
  };

  it("uses the display name in the application", () => {
    expect(getDoctorDisplayName(doctor)).toBe("drg. Sari");
  });

  it("uses the full name on documents", () => {
    expect(getDoctorDocumentName(doctor)).toBe("drg. Sari Rahmawati, Sp.KG");
  });

  it("does not mistake the display name for a document name when the full name is missing", () => {
    expect(getDoctorDocumentName({ name: doctor.name })).toBe("");
  });

  it("preserves a saved document name only when it differs from the display name", () => {
    expect(getDoctorDocumentName({ name: doctor.name }, "drg. Sari")).toBe("");
    expect(getDoctorDocumentName({ name: doctor.name }, "drg. Sari Rahmawati")).toBe("drg. Sari Rahmawati");
  });

  it("preserves the full name saved on an older document", () => {
    expect(getDoctorDocumentName(
      { name: doctor.name, fullName: "drg. Sari Rahmawati yang baru" },
      "drg. Sari Rahmawati"
    )).toBe("drg. Sari Rahmawati");
  });

  it("does not trust a saved name when the doctor's display identity is unavailable", () => {
    expect(getDoctorDocumentName(undefined, "drg. Sari")).toBe("");
  });
});
