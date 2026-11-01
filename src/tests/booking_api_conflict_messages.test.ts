import { describe, expect, it } from "vitest";
import { getBookingConflictMessage } from "../../functions/_shared/booking-conflicts.js";

describe("booking API conflict messages", () => {
  it("explains when a doctor's active booking overlaps the requested slot", () => {
    expect(getBookingConflictMessage({
      message: "Dokter sudah memiliki booking aktif yang bertabrakan dengan durasi tindakan ini di cabang tersebut"
    }, "09:30")).toContain("Slot 09:30 bentrok");
  });

  it("identifies a patient's active booking on the same branch and date", () => {
    expect(getBookingConflictMessage({
      message: "Pasien sudah memiliki booking aktif di cabang ini pada tanggal tersebut"
    })).toBe("Pasien sudah memiliki booking aktif di cabang ini pada tanggal tersebut.");
  });

  it("does not mislabel an unknown unique conflict as a recently taken time slot", () => {
    expect(getBookingConflictMessage({ message: "duplicate key value violates unique constraint" }))
      .toContain("konflik pada data booking");
  });
});
