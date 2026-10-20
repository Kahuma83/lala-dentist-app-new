import { beforeEach, describe, expect, it } from "vitest";
import { MockDatabase } from "../data/mockData";
import { MockBookingRepository } from "../repositories/mockRepositories";
import { BookingStatus, BookingSource } from "../types/domain";

describe("Booking rescheduling history", () => {
  let bookingRepository: MockBookingRepository;

  beforeEach(() => {
    MockDatabase.resetInstance();
    bookingRepository = new MockBookingRepository();
  });

  it("keeps the previous booking as history and links the replacement", async () => {
    const previous = await bookingRepository.createBooking({
      patientId: "patient-1",
      branchId: "branch-gebang",
      doctorId: "doc-syafira",
      bookingDateTime: "2026-10-25T02:00:00.000Z",
      timeSlot: "09:00",
      source: BookingSource.WHATSAPP,
      status: BookingStatus.CONFIRMED
    });

    await bookingRepository.updateBooking(previous.id, { status: BookingStatus.RESCHEDULED });
    const replacement = await bookingRepository.createBooking({
      patientId: previous.patientId,
      branchId: previous.branchId,
      doctorId: previous.doctorId,
      bookingDateTime: "2026-10-25T03:00:00.000Z",
      timeSlot: "10:00",
      source: BookingSource.WHATSAPP,
      status: BookingStatus.CONFIRMED,
      rescheduledFromBookingId: previous.id,
      rescheduleReason: "Pasien meminta perubahan waktu"
    });

    expect((await bookingRepository.getBookingById(previous.id))?.status).toBe(BookingStatus.RESCHEDULED);
    expect(replacement.status).toBe(BookingStatus.CONFIRMED);
    expect(replacement.rescheduledFromBookingId).toBe(previous.id);
    expect(replacement.rescheduleReason).toBe("Pasien meminta perubahan waktu");
    expect(replacement.source).toBe(BookingSource.WHATSAPP);
  });

  it("rejects a replacement slot that overlaps another active booking", async () => {
    await bookingRepository.createBooking({
      patientId: "patient-1",
      branchId: "branch-gebang",
      doctorId: "doc-syafira",
      bookingDateTime: "2026-10-25T02:00:00.000Z",
      timeSlot: "09:00",
      status: BookingStatus.CONFIRMED
    });

    await expect(bookingRepository.createBooking({
      patientId: "patient-2",
      branchId: "branch-gebang",
      doctorId: "doc-syafira",
      bookingDateTime: "2026-10-25T02:15:00.000Z",
      timeSlot: "09:15",
      status: BookingStatus.PENDING
    })).rejects.toThrow("bertabrakan");
  });
});
