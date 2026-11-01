import React, { useMemo, useState } from "react";
import { CalendarDays, FlaskConical, X } from "lucide-react";
import { Booking, DentalDoctor, DoctorSchedule, QueueItem, ScheduleStatus } from "../types/domain";
import { DEFAULT_BOOKING_TIME_SLOTS } from "../utils/bookingScheduleUtils";
import { getTodayDateString, toOperationalDateTime } from "../utils/dateUtils";
import { getWalkInDemoSlotResult } from "../utils/walkInBookingDemo";

interface WalkInBookingDemoProps {
  branchId: string;
  doctors: DentalDoctor[];
  schedules: DoctorSchedule[];
  bookings: Booking[];
  queueItems: QueueItem[];
}

const slotMessages = {
  past: "Jam ini sudah lewat. Pilih jam yang akan datang.",
  booking_conflict: "Dokter sudah memiliki booking aktif pada waktu ini.",
  queue_conflict: "Waktu ini bertabrakan dengan antrean aktif.",
  available: "Simulasi Walk-In dapat dilanjutkan. Jadwal dokter aktif tidak diwajibkan dalam demo ini."
};

export const WalkInBookingDemo: React.FC<WalkInBookingDemoProps> = ({
  branchId,
  doctors,
  schedules,
  bookings,
  queueItems
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [date, setDate] = useState(getTodayDateString());
  const [doctorId, setDoctorId] = useState("");
  const [time, setTime] = useState("");

  const activeDoctors = doctors.filter((doctor) => doctor.active ?? doctor.isActive ?? true);
  const selectedDoctor = activeDoctors.find((doctor) => doctor.id === doctorId);
  const schedule = schedules.find((item) =>
    item.branchId === branchId &&
    item.doctorId === doctorId &&
    item.date === date &&
    item.status === ScheduleStatus.ACTIVE
  );
  const availableSlots = useMemo(() => {
    if (!date) return [];
    return DEFAULT_BOOKING_TIME_SLOTS.filter((slot) => {
      try {
        return new Date(toOperationalDateTime(`${date}T00:00:00+07:00`, slot)).getTime() > Date.now();
      } catch {
        return false;
      }
    });
  }, [date]);
  const result = doctorId && time
    ? getWalkInDemoSlotResult({ branchId, doctorId, date, time, bookings, queueItems })
    : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-800 hover:bg-violet-100"
      >
        <FlaskConical className="h-3.5 w-3.5" />
        Coba demo Walk-In fleksibel
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4" role="dialog" aria-modal="true" aria-labelledby="walk-in-demo-title">
          <div className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h2 id="walk-in-demo-title" className="flex items-center gap-2 text-base font-bold text-slate-900">
                  <FlaskConical className="h-5 w-5 text-violet-700" />
                  Demo Walk-In fleksibel
                </h2>
                <p className="mt-1 text-xs text-slate-500">Simulasi ini tidak menyimpan atau mengubah booking.</p>
              </div>
              <button type="button" onClick={() => setIsOpen(false)} aria-label="Tutup demo" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="rounded-xl border border-violet-200 bg-violet-50 p-3 text-xs leading-5 text-violet-900">
              Dokter tetap dapat dipilih walaupun belum memiliki jadwal aktif pada tanggal ini. Konflik dengan booking atau antrean aktif tetap diblokir.
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="text-xs font-semibold text-slate-700">
                Tanggal
                <input
                  type="date"
                  min={getTodayDateString()}
                  value={date}
                  onChange={(event) => {
                    setDate(event.target.value);
                    setTime("");
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 font-normal"
                />
              </label>
              <label className="text-xs font-semibold text-slate-700">
                Dokter
                <select
                  value={doctorId}
                  onChange={(event) => setDoctorId(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 font-normal"
                >
                  <option value="">Pilih dokter</option>
                  {activeDoctors.map((doctor) => (
                    <option key={doctor.id} value={doctor.id}>{doctor.name}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-700">
                Jam simulasi
                <select
                  value={time}
                  onChange={(event) => setTime(event.target.value)}
                  disabled={!doctorId || availableSlots.length === 0}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 font-normal disabled:bg-slate-50"
                >
                  <option value="">Pilih jam</option>
                  {availableSlots.map((slot) => <option key={slot} value={slot}>{slot} WIB</option>)}
                </select>
              </label>
            </div>

            {doctorId && date && (
              <p className="flex items-center gap-1.5 text-xs text-slate-600">
                <CalendarDays className="h-3.5 w-3.5" />
                {schedule ? "Dokter memiliki jadwal aktif pada tanggal ini." : "Tidak ada jadwal aktif; simulasi tetap mengizinkan Walk-In."}
              </p>
            )}

            {result && (
              <div
                role={result.available ? "status" : "alert"}
                className={`rounded-xl border p-3 text-xs font-medium ${
                  result.available
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-rose-200 bg-rose-50 text-rose-800"
                }`}
              >
                {slotMessages[result.reason]}
              </div>
            )}

            <div className="flex justify-end border-t border-slate-100 pt-3">
              <button type="button" onClick={() => setIsOpen(false)} className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800">
                Tutup demo
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
