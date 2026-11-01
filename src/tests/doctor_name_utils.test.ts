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

  it("always preserves the name saved with a document", () => {
    expect(getDoctorDocumentName(doctor, "drg. Sari")).toBe("drg. Sari");
    expect(getDoctorDocumentName(doctor, "drg. Sari Rahmawati")).toBe("drg. Sari Rahmawati");
  });

  it("preserves an older document's identity if the doctor profile changes", () => {
    expect(getDoctorDocumentName(
      { name: doctor.name, fullName: "drg. Sari Rahmawati yang baru" },
      "drg. Sari Rahmawati"
    )).toBe("drg. Sari Rahmawati");
  });

  it("preserves a saved document name when the doctor is no longer available", () => {
    expect(getDoctorDocumentName(undefined, "drg. Sari")).toBe("drg. Sari");
  });
});
