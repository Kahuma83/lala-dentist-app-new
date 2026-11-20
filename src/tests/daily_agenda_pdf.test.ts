import { afterEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { Booking, BookingStatus } from "../types/domain";
import {
  buildDailyAgendaRows,
  createDailyAgendaPdf,
  getDailyAgendaPdfFileName
} from "../utils/dailyAgendaPdf";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const makeBooking = ({
  id,
  bookingDateTime,
  ...overrides
}: Partial<Booking> & Pick<Booking, "id" | "bookingDateTime">): Booking => ({
  id,
  patientId: `patient-${id}`,
  branchId: "branch-gebang",
  doctorId: "doctor-1",
  bookingDateTime,
  status: BookingStatus.PENDING,
  createdAt: "2026-11-18T00:00:00.000Z",
  updatedAt: "2026-11-18T00:00:00.000Z",
  ...overrides
});

describe("daily agenda PDF data", () => {
  it("shows a date-specific PDF download action in the weekly calendar", () => {
    const bookingsPage = fs.readFileSync(
      path.resolve(process.cwd(), "src/pages/BookingManagement.tsx"),
      "utf-8"
    );

    expect(bookingsPage).toContain("Unduh agenda PDF");
    expect(bookingsPage).toContain("handleDownloadDailyAgendaPdf(date)");
  });

  it("includes only active bookings for the requested operational date and sorts them by time", () => {
    const rows = buildDailyAgendaRows({
      bookings: [
        makeBooking({
          id: "later",
          bookingDateTime: "2026-11-19T03:30:00.000Z",
          patientNameSnapshot: "Budi",
          doctorId: "doctor-1",
          plannedTreatments: [
            { serviceId: "service-1", serviceNameSnapshot: "Tambal Gigi", estimatedDurationMinutes: 30 }
          ]
        }),
        makeBooking({
          id: "earlier",
          bookingDateTime: "2026-11-19T02:00:00.000Z",
          status: BookingStatus.CONFIRMED,
          patientNameSnapshot: "Ani"
        }),
        makeBooking({
          id: "cancelled",
          bookingDateTime: "2026-11-19T01:00:00.000Z",
          status: BookingStatus.CANCELLED
        }),
        makeBooking({
          id: "completed",
          bookingDateTime: "2026-11-19T01:30:00.000Z",
          status: BookingStatus.PENDING
        }),
        makeBooking({
          id: "other-date",
          bookingDateTime: "2026-11-20T02:00:00.000Z"
        })
      ],
      agendaDate: "2026-11-19",
      doctors: [{ id: "doctor-1", name: "drg. Sari" }],
      patients: [],
      checkedInBookingIds: new Set(["later"]),
      completedBookingIds: new Set(["completed"])
    });

    expect(rows).toEqual([
      {
        time: "09:00",
        patientName: "Ani",
        treatment: "Konsultasi",
        doctorName: "drg. Sari",
        status: "Dikonfirmasi"
      },
      {
        time: "10:30",
        patientName: "Budi",
        treatment: "Tambal Gigi",
        doctorName: "drg. Sari",
        status: "Check-in"
      }
    ]);
  });

  it("uses patient and doctor snapshots when current master records are unavailable", () => {
    const [row] = buildDailyAgendaRows({
      bookings: [
        makeBooking({
          id: "snapshot",
          bookingDateTime: "2026-11-19T02:00:00.000Z",
          patientNameSnapshot: "Pasien Lama",
          doctorId: "removed-doctor",
          doctorNameSnapshot: "drg. Dokter Lama"
        })
      ],
      agendaDate: "2026-11-19",
      doctors: [],
      patients: [],
      checkedInBookingIds: new Set(),
      completedBookingIds: new Set()
    });

    expect(row).toMatchObject({
      patientName: "Pasien Lama",
      doctorName: "drg. Dokter Lama"
    });
  });

  it("creates a multi-page PDF with a branch-and-date filename", async () => {
    class MockImage {
      src = "";
      decode = async () => undefined;
    }

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"></svg>'
    }));
    vi.stubGlobal("Image", MockImage);
    vi.stubGlobal("document", {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => ({ drawImage: vi.fn() }),
        toDataURL: () => "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4////fwAJ+wP9KobjigAAAABJRU5ErkJggg=="
      })
    });

    const rows = Array.from({ length: 40 }, (_, index) => ({
      time: `${String(8 + Math.floor(index / 4)).padStart(2, "0")}:${String((index % 4) * 15).padStart(2, "0")}`,
      patientName: `Pasien ${index + 1}`,
      treatment: "Pemeriksaan dan perawatan gigi",
      doctorName: "drg. Sari",
      status: "Terjadwal"
    }));

    const pdf = await createDailyAgendaPdf({
      branch: { name: "Cabang Gebang", address: "Jl. Contoh No. 1", branchCode: "GEB" },
      agendaDate: "2026-11-19",
      rows
    });

    expect(getDailyAgendaPdfFileName(
      { name: "Cabang Gebang", branchCode: "GEB" },
      "2026-11-19"
    )).toBe("agenda-jadwal-geb-2026-11-19.pdf");
    expect(pdf.internal.pageSize.getWidth()).toBeLessThan(pdf.internal.pageSize.getHeight());
    expect(pdf.getNumberOfPages()).toBeGreaterThan(1);
    expect(pdf.output("arraybuffer").byteLength).toBeGreaterThan(0);
  });
});
