import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, ChevronDown, LoaderCircle, RefreshCw, Save, X } from "lucide-react";
import { useApp } from "../context/AppContext";
import { StaffPosition, StaffShiftRotationTemplate, UserRole } from "../types/domain";
import {
  buildMonthlyRosterPreview,
  fetchIndonesiaHolidays,
  getMondayOnOrBefore,
  IndonesiaHoliday,
  MonthlyRosterRow
} from "../utils/staffShiftRotation";

interface MonthlyStaffRosterPlannerProps {
  initialBranchId: string;
  onClose: () => void;
  onSaved: (savedCount: number) => void;
}

const currentMonth = () => new Date().toISOString().slice(0, 7);
const firstDayOfMonth = (month: string) => `${month}-01`;

export const MonthlyStaffRosterPlanner: React.FC<MonthlyStaffRosterPlannerProps> = ({
  initialBranchId,
  onClose,
  onSaved
}) => {
  const {
    currentUser,
    branches,
    staff,
    workShifts,
    staffShiftAssignments,
    staffShiftRepo,
    refreshData
  } = useApp();
  const [branchId, setBranchId] = useState(initialBranchId);
  const [month, setMonth] = useState(currentMonth);
  const [rotationAnchorMonday, setRotationAnchorMonday] = useState(() =>
    getMondayOnOrBefore(firstDayOfMonth(currentMonth()))
  );
  const [initialShiftByStaff, setInitialShiftByStaff] = useState<Record<string, string>>({});
  const [holidayList, setHolidayList] = useState<IndonesiaHoliday[]>([]);
  const [includedHolidayDates, setIncludedHolidayDates] = useState<Set<string>>(new Set());
  const [localHolidayDate, setLocalHolidayDate] = useState("");
  const [localHolidayName, setLocalHolidayName] = useState("");
  const [holidayLoading, setHolidayLoading] = useState(false);
  const [holidayError, setHolidayError] = useState<string | null>(null);
  const [manualCalendarVerified, setManualCalendarVerified] = useState(false);
  const [previewRows, setPreviewRows] = useState<MonthlyRosterRow[] | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);

  const eligibleStaff = useMemo(() => staff
    .filter((person) =>
      person.branchId === branchId &&
      person.active &&
      person.employmentStatus !== "INACTIVE" &&
      [StaffPosition.BRANCH_ADMIN, StaffPosition.ASSISTANT].includes(person.position)
    )
    .sort((left, right) => left.fullName.localeCompare(right.fullName)), [staff, branchId]);

  const branchShifts = useMemo(() => workShifts.filter((shift) =>
    shift.branchId === branchId && shift.active &&
    ((shift.startTime === "08:00" && shift.endTime === "14:00") ||
      (shift.startTime === "14:00" && shift.endTime === "21:00"))
  ), [workShifts, branchId]);

  const morningShift = branchShifts.find((shift) => shift.startTime === "08:00");
  const afternoonShift = branchShifts.find((shift) => shift.startTime === "14:00");
  const activeBranch = branches.find((branch) => branch.id === branchId);
  const holidaysForPreview = useMemo(() => holidayList.filter((holiday) =>
    includedHolidayDates.has(holiday.date)
  ), [holidayList, includedHolidayDates]);
  const excludedDates = useMemo(() => holidaysForPreview.map((holiday) => holiday.date), [holidaysForPreview]);
  const existingShiftChanges = useMemo(() => {
    if (!previewRows) return 0;
    return previewRows.filter((row) =>
      row.previousShiftId && row.previousShiftId !== row.shiftId
    ).length;
  }, [previewRows]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setHolidayLoading(true);
    setHolidayError(null);
    setManualCalendarVerified(false);
    setHolidayList([]);
    setIncludedHolidayDates(new Set());
    setLocalHolidayDate("");
    setLocalHolidayName("");
    setPreviewRows(null);

    const [year, monthNumber] = month.split("-").map(Number);
    fetchIndonesiaHolidays(year, monthNumber, controller.signal)
      .then((holidays) => {
        if (!active) return;
        setHolidayList(holidays);
        setIncludedHolidayDates(new Set(holidays.map((holiday) => holiday.date)));
      })
      .catch((error: unknown) => {
        if (!active || (error instanceof Error && error.name === "AbortError")) return;
        setHolidayError(error instanceof Error ? error.message : "Tidak dapat memuat kalender hari libur.");
      })
      .finally(() => {
        if (active) setHolidayLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [month]);

  useEffect(() => {
    let active = true;
    setPreviewRows(null);
    setPageError(null);
    setInitialShiftByStaff({});

    staffShiftRepo.getRotationTemplates(branchId)
      .then((templates) => {
        if (!active) return;
        const stored = new Map(templates.map((template) => [template.staffId, template]));
        const firstWeekEnd = new Date(`${firstDayOfMonth(month)}T00:00:00.000Z`);
        firstWeekEnd.setUTCDate(firstWeekEnd.getUTCDate() + 6);
        const firstWeekAssignments = staffShiftAssignments.filter((assignment) =>
          assignment.branchId === branchId &&
          assignment.date >= firstDayOfMonth(month) &&
          assignment.date <= firstWeekEnd.toISOString().slice(0, 10)
        );
        const nextInitialShifts: Record<string, string> = {};
        eligibleStaff.forEach((person, index) => {
          const savedTemplate = stored.get(person.id);
          const existingAssignment = firstWeekAssignments.find((assignment) =>
            assignment.staffId === person.id
          );
          nextInitialShifts[person.id] = savedTemplate?.initialShiftId ||
            existingAssignment?.shiftId ||
            (index % 2 === 0 ? morningShift?.id : afternoonShift?.id) ||
            morningShift?.id ||
            "";
        });
        const savedAnchorMonday = templates.find((template) => template.rotationAnchorMonday)?.rotationAnchorMonday;
        if (savedAnchorMonday) {
          setRotationAnchorMonday(savedAnchorMonday);
        } else {
          setRotationAnchorMonday(getMondayOnOrBefore(firstDayOfMonth(month)));
        }
        setInitialShiftByStaff(nextInitialShifts);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setPageError(error instanceof Error ? error.message : "Gagal memuat pola rotasi cabang.");
      });

    return () => {
      active = false;
    };
  }, [branchId, month, eligibleStaff, staffShiftRepo, staffShiftAssignments, morningShift?.id, afternoonShift?.id]);

  const handleMonthChange = (nextMonth: string) => {
    setMonth(nextMonth);
    setRotationAnchorMonday(getMondayOnOrBefore(firstDayOfMonth(nextMonth)));
  };

  const toggleHoliday = (date: string, include: boolean) => {
    setIncludedHolidayDates((current) => {
      const next = new Set(current);
      if (include) next.add(date);
      else next.delete(date);
      return next;
    });
    setPreviewRows(null);
  };

  const handleAddLocalHoliday = () => {
    if (!localHolidayDate || !localHolidayDate.startsWith(`${month}-`)) {
      setPageError("Tanggal libur khusus harus berada dalam bulan yang dipilih.");
      return;
    }
    if (!localHolidayName.trim()) {
      setPageError("Isi keterangan tanggal libur khusus cabang.");
      return;
    }
    const localHoliday = { date: localHolidayDate, name: localHolidayName.trim(), type: "local" as const };
    setHolidayList((current) => [
      ...current.filter((holiday) => holiday.date !== localHolidayDate || holiday.type !== "local"),
      localHoliday
    ]);
    setIncludedHolidayDates((current) => new Set(current).add(localHolidayDate));
    setLocalHolidayDate("");
    setLocalHolidayName("");
    setManualCalendarVerified(false);
    setPageError(null);
    setPreviewRows(null);
  };

  const handleCreatePreview = () => {
    setPageError(null);
    if (!branchId) {
      setPageError("Pilih cabang terlebih dahulu.");
      return;
    }
    if (holidayError && !manualCalendarVerified) {
      setPageError("Kalender API tidak dapat dimuat. Periksa kalender resmi secara manual dan centang konfirmasi sebelum membuat pratinjau.");
      return;
    }
    try {
      const templates: StaffShiftRotationTemplate[] = eligibleStaff.map((person) => ({
        branchId,
        staffId: person.id,
        initialShiftId: initialShiftByStaff[person.id] || "",
        rotationAnchorMonday
      }));
      const rows = buildMonthlyRosterPreview({
        month,
        branchId,
        staff,
        shifts: workShifts,
        templates,
        assignments: staffShiftAssignments,
        holidays: holidayList.filter((holiday) => includedHolidayDates.has(holiday.date))
      });
      setPreviewRows(rows);
    } catch (error: unknown) {
      setPageError(error instanceof Error ? error.message : "Gagal menyusun pratinjau jadwal bulanan.");
      setPreviewRows(null);
    }
  };

  const handlePreviewShiftChange = (staffId: string, date: string, shiftId: string) => {
    setPreviewRows((current) => current?.map((row) =>
      row.staffId === staffId && row.date === date ? { ...row, shiftId } : row
    ) || null);
  };

  const handleSave = async () => {
    if (!previewRows?.length) {
      setPageError("Pratinjau tidak memiliki jadwal untuk disimpan.");
      return;
    }

    setIsSaving(true);
    setPageError(null);
    try {
      const templates: StaffShiftRotationTemplate[] = eligibleStaff.map((person) => ({
        branchId,
        staffId: person.id,
        initialShiftId: initialShiftByStaff[person.id] || "",
        rotationAnchorMonday
      }));
      const savedCount = await staffShiftRepo.saveMonthlyRoster(
        branchId,
        rotationAnchorMonday,
        templates,
        previewRows.map(({ staffId, branchId: rowBranchId, shiftId, date, active, notes }) => ({
          staffId,
          branchId: rowBranchId,
          shiftId,
          date,
          active,
          notes
        }))
      );
      if (savedCount !== previewRows.length) {
        throw new Error(`Jumlah tersimpan (${savedCount}) berbeda dengan jumlah pratinjau (${previewRows.length}).`);
      }
      await refreshData("staff_shift_assignments");
      onSaved(savedCount);
      onClose();
    } catch (error: unknown) {
      setPageError(error instanceof Error ? error.message : "Gagal menyimpan jadwal bulanan.");
    } finally {
      setIsSaving(false);
    }
  };

  if (!branchId) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
        <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-slate-900">Jadwal Rotasi Bulanan</h2>
            <button type="button" onClick={onClose} aria-label="Tutup"><X className="h-4 w-4" /></button>
          </div>
          <p className="mt-4 text-sm text-rose-700">Tidak ada cabang yang bisa dipilih.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3 sm:p-6">
      <div className="flex max-h-[95vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
              <CalendarDays className="h-5 w-5 text-emerald-600" />
              Isi Jadwal Shift Bulanan
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Pasangan pagi/sore bertukar setiap Senin. Minggu dan tanggal merah dikecualikan.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Tutup" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {pageError && (
            <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{pageError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="text-xs font-semibold text-slate-700">
              Bulan
              <input
                type="month"
                value={month}
                onChange={(event) => handleMonthChange(event.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 font-normal"
              />
            </label>
            <label className="text-xs font-semibold text-slate-700">
              Cabang
              <select
                value={branchId}
                onChange={(event) => setBranchId(event.target.value)}
                disabled={currentUser?.role === UserRole.BRANCH_ADMIN}
                className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 font-normal disabled:bg-slate-100"
              >
                {branches.filter((branch) => branch.isActive).map((branch) => (
                  <option key={branch.id} value={branch.id}>{branch.name}</option>
                ))}
              </select>
            </label>
            <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-xs text-emerald-900">
              <div className="font-bold">{activeBranch?.name || branchId}</div>
              <div className="mt-1">{eligibleStaff.length} Admin/Asisten aktif</div>
              <div>{morningShift?.name || "Shift Pagi"} ↔ {afternoonShift?.name || "Shift Sore"}</div>
            </div>
          </div>

          <section className="rounded-xl border border-slate-200">
            <div className="border-b border-slate-100 px-4 py-3">
              <h3 className="text-sm font-bold text-slate-900">Atur shift pada minggu acuan</h3>
              <p className="mt-1 text-[11px] text-slate-500">
                Pegawai dengan shift awal yang sama berada dalam satu kelompok. Kelompok bertukar shift setiap Senin dari tanggal acuan.
              </p>
            </div>
            {eligibleStaff.length ? (
              <div className="grid grid-cols-1 gap-px bg-slate-100 sm:grid-cols-2">
                {eligibleStaff.map((person) => (
                  <label key={person.id} className="flex items-center justify-between gap-3 bg-white px-4 py-2.5 text-xs">
                    <span>
                      <span className="block font-semibold text-slate-800">{person.fullName}</span>
                      <span className="text-[10px] text-slate-500">
                        {person.position === StaffPosition.BRANCH_ADMIN ? "Admin Cabang" : "Asisten"}
                      </span>
                    </span>
                    <span className="relative">
                      <select
                        aria-label={`Shift awal ${person.fullName}`}
                        value={initialShiftByStaff[person.id] || ""}
                        onChange={(event) => {
                          setInitialShiftByStaff((current) => ({ ...current, [person.id]: event.target.value }));
                          setPreviewRows(null);
                        }}
                        className="appearance-none rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-8 text-xs"
                      >
                        <option value="">Pilih shift awal</option>
                        {morningShift && <option value={morningShift.id}>Minggu acuan - Pagi</option>}
                        {afternoonShift && <option value={afternoonShift.id}>Minggu acuan - Sore</option>}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="p-4 text-xs text-amber-700">Tidak ada Admin Cabang atau Asisten aktif untuk cabang ini.</p>
            )}
            <div className="border-t border-slate-100 px-4 py-3 text-[11px] text-slate-500">
              Rotasi dihitung mulai Senin {rotationAnchorMonday} dan berlanjut konsisten lintas bulan. Jadwal yang sudah ada akan ditampilkan pada pratinjau dan diperbarui saat disimpan.
            </div>
          </section>

          <section className="rounded-xl border border-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Tanggal merah</h3>
                <p className="mt-1 text-[11px] text-slate-500">Periksa hari libur nasional/cuti bersama, lalu tambahkan libur khusus cabang.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  const [year, monthNumber] = month.split("-").map(Number);
                  setHolidayLoading(true);
                  setHolidayError(null);
                  fetchIndonesiaHolidays(year, monthNumber)
                    .then((holidays) => {
                      setHolidayList((current) => [
                        ...current.filter((holiday) => holiday.type === "local"),
                        ...holidays
                      ]);
                      setIncludedHolidayDates((current) => new Set([
                        ...Array.from(current).filter((date) => holidayList.some((holiday) => holiday.type === "local" && holiday.date === date)),
                        ...holidays.map((holiday) => holiday.date)
                      ]));
                      setManualCalendarVerified(false);
                    })
                    .catch((error: unknown) => setHolidayError(error instanceof Error ? error.message : "Gagal memuat kalender hari libur."))
                    .finally(() => setHolidayLoading(false));
                }}
                disabled={holidayLoading}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 disabled:opacity-50"
              >
                {holidayLoading ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Muat ulang
              </button>
            </div>

            {holidayError && (
              <div className="space-y-3 p-4">
                <p role="alert" className="text-xs text-amber-800">
                  Kalender online tidak tersedia: {holidayError} Anda masih dapat menandai hari libur manual, tetapi verifikasi kalender nasional/cuti bersama sebelum membuat pratinjau.
                </p>
                <label className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
                  <input
                    type="checkbox"
                    checked={manualCalendarVerified}
                    onChange={(event) => setManualCalendarVerified(event.target.checked)}
                    className="mt-0.5"
                  />
                  <span>Saya sudah memeriksa kalender resmi dan menandai semua libur nasional/cuti bersama bulan ini.</span>
                </label>
              </div>
            )}
            {holidayList.length ? (
              <div className="max-h-44 divide-y divide-slate-100 overflow-y-auto">
                {holidayList.map((holiday) => (
                  <label key={`${holiday.type}:${holiday.date}:${holiday.name}`} className="flex items-center gap-3 px-4 py-2 text-xs">
                    <input
                      type="checkbox"
                      checked={includedHolidayDates.has(holiday.date)}
                      onChange={(event) => toggleHoliday(holiday.date, event.target.checked)}
                    />
                    <span className="min-w-24 font-mono text-slate-600">{holiday.date}</span>
                    <span className="flex-1 text-slate-800">{holiday.name}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">
                      {holiday.type === "joint_leave" ? "Cuti bersama" : holiday.type === "local" ? "Cabang" : "Nasional"}
                    </span>
                  </label>
                ))}
              </div>
            ) : !holidayError && !holidayLoading ? (
              <p className="p-4 text-xs text-slate-500">Tidak ada hari libur nasional/cuti bersama terdata pada bulan ini.</p>
            ) : null}

            <div className="grid grid-cols-1 gap-2 border-t border-slate-100 p-3 sm:grid-cols-[1fr_2fr_auto]">
              <input
                type="date"
                aria-label="Tanggal libur khusus cabang"
                min={firstDayOfMonth(month)}
                max={`${month}-${new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate().toString().padStart(2, "0")}`}
                value={localHolidayDate}
                onChange={(event) => setLocalHolidayDate(event.target.value)}
                className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs"
              />
              <input
                type="text"
                aria-label="Keterangan libur cabang"
                placeholder="Keterangan libur khusus cabang"
                value={localHolidayName}
                onChange={(event) => setLocalHolidayName(event.target.value)}
                className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs"
              />
              <button type="button" onClick={handleAddLocalHoliday} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800">
                Tambah libur
              </button>
            </div>
          </section>

          {previewRows && (
            <section className="overflow-hidden rounded-xl border border-emerald-200">
              <div className="flex flex-wrap items-center justify-between gap-2 bg-emerald-50 px-4 py-3">
                <div>
                  <h3 className="text-sm font-bold text-emerald-950">Pratinjau jadwal</h3>
                  <p className="text-[11px] text-emerald-800">
                    {previewRows.length} penugasan · {excludedDates.length} tanggal merah dikecualikan
                    {existingShiftChanges ? ` · ${existingShiftChanges} jadwal lama berubah` : ""}
                  </p>
                </div>
                <span className="text-[11px] text-emerald-800">Ubah shift pada daftar sebelum menyimpan.</span>
              </div>
              {existingShiftChanges > 0 && (
                <p className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-[11px] text-amber-900">
                  Jadwal yang sudah ada pada orang/tanggal yang sama akan diperbarui. Jadwal Minggu atau tanggal merah yang sudah ada tidak dihapus.
                </p>
              )}
              <div className="max-h-80 overflow-auto">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-3 py-2">Tanggal</th>
                      <th className="px-3 py-2">Pegawai</th>
                      <th className="px-3 py-2">Shift</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {previewRows.map((row) => {
                      const person = eligibleStaff.find((member) => member.id === row.staffId);
                      return (
                        <tr key={`${row.date}:${row.staffId}`}>
                          <td className="whitespace-nowrap px-3 py-2 font-mono text-slate-600">{row.date}</td>
                          <td className="px-3 py-2 font-medium text-slate-800">{person?.fullName || row.staffId}</td>
                          <td className="px-3 py-2">
                            <select
                              aria-label={`Shift ${person?.fullName || row.staffId} ${row.date}`}
                              value={row.shiftId}
                              onChange={(event) => handlePreviewShiftChange(row.staffId, row.date, event.target.value)}
                              className="rounded-md border border-slate-200 px-2 py-1.5"
                            >
                              {morningShift && <option value={morningShift.id}>Pagi ({morningShift.startTime}–{morningShift.endTime})</option>}
                              {afternoonShift && <option value={afternoonShift.id}>Sore ({afternoonShift.startTime}–{afternoonShift.endTime})</option>}
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:justify-between">
          <button type="button" onClick={onClose} disabled={isSaving} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50">
            Batal
          </button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <button
              type="button"
              onClick={handleCreatePreview}
              disabled={holidayLoading || !eligibleStaff.length || !morningShift || !afternoonShift}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-white px-4 py-2 text-xs font-semibold text-emerald-800 disabled:opacity-50"
            >
              <CalendarDays className="h-4 w-4" />
              Buat Pratinjau
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={!previewRows?.length || isSaving}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {isSaving ? "Menyimpan..." : `Simpan ${previewRows?.length || ""} Jadwal`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
