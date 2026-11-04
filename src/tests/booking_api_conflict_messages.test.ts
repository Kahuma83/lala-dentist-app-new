import { describe, expect, it } from "vitest";
import { getBookingConflictMessage } from "../../functions/_shared/booking-conflicts.js";
import { getBookingPlannedDurationMinutes } from "../../functions/_shared/booking-duration.js";

describe("booking API conflict messages", () => {
  it("explains when a doctor's active booking overlaps the requested slot", () => {
    expect(getBookingConflictMessage({
      message: "Dokter sudah memiliki booking aktif yang bertabrakan dengan durasi tindakan ini di cabang tersebut"
    }, "09:30")).toContain("Slot 09:30 bentrok");
  });

  it("explains when a patient's active booking overlaps the requested time", () => {
    expect(getBookingConflictMessage({
      message: "Pasien sudah memiliki booking aktif yang bertabrakan dengan waktu ini"
    })).toBe("Waktu booking bertabrakan dengan janji temu aktif pasien. Pilih slot lain yang tidak bertumpuk.");
  });

  it("uses the same default and maximum duration as the database booking guard", () => {
    expect(getBookingPlannedDurationMinutes([])).toBe(30);
    expect(getBookingPlannedDurationMinutes([{ estimatedDurationMinutes: 45 }, { estimatedDurationMinutes: 30 }])).toBe(75);
    expect(getBookingPlannedDurationMinutes([{ estimatedDurationMinutes: 2000 }])).toBe(1440);
  });

  it("does not mislabel an unknown unique conflict as a recently taken time slot", () => {
    expect(getBookingConflictMessage({ message: "duplicate key value violates unique constraint" }))
      .toContain("konflik pada data booking");
  });
});
