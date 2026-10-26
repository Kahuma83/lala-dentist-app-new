import React, { useMemo, useState } from "react";
import {
  Building2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Clock3,
  Copy,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X
} from "lucide-react";
import {
  CurrentUser,
  DentalBranch,
  EmploymentStatus,
  Staff,
  StaffPosition,
  StaffShiftAssignment,
  UserRole,
  WorkShift
} from "../types/domain";

export type StaffShiftAssignmentPayload = Pick<
  StaffShiftAssignment,
  | "staffId"
  | "branchId"
  | "shiftId"
  | "customShiftName"
  | "customStartTime"
  | "customEndTime"
  | "date"
  | "active"
  | "notes"
>;

export interface StaffShiftCopyOperation {
  source: StaffShiftAssignment;
  targetDate: string;
}

interface StaffShiftScheduleGridProps {
  staff: Staff[];
  branches: DentalBranch[];
  workShifts: WorkShift[];
  assignments: StaffShiftAssignment[];
  currentUser: CurrentUser | null;
  selectedBranchId: string | null;
  onBranchChange: (branchId: string) => void;
  onSave: (assignment: StaffShiftAssignmentPayload, assignmentId?: string) => Promise<void>;
  onDelete: (assignment: StaffShiftAssignment) => Promise<void>;
  onCopyWeek: (operations: StaffShiftCopyOperation[]) => Promise<{ copied: number; errors: string[] }>;
}

interface WeekDay {
  date: string;
  name: string;
  shortDate: string;
  isToday: boolean;
}

const dateString = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getMonday = (date: Date) => {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const daysSinceMonday = (monday.getDay() + 6) % 7;
  monday.setDate(monday.getDate() - daysSinceMonday);
  return monday;
};

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const normalizeTime = (value: string) => {
  const [hour = "", minute = "00"] = value.split(":");
  return `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
};

const timeLabel = (assignment: StaffShiftAssignment, shiftsById: Map<string, WorkShift>) => {
  const shift = assignment.shiftId ? shiftsById.get(assignment.shiftId) : undefined;
  const name = assignment.customShiftName || shift?.name || "Shift";
  const start = assignment.customStartTime || shift?.startTime || "--:--";
  const end = assignment.customEndTime || shift?.endTime || "--:--";
  return { name, start, end };
};

const isEligibleStaff = (person: Staff) =>
  person.active &&
  person.employmentStatus !== EmploymentStatus.INACTIVE &&
  (person.position === StaffPosition.BRANCH_ADMIN || person.position === StaffPosition.ASSISTANT);

export const StaffShiftScheduleGrid: React.FC<StaffShiftScheduleGridProps> = ({
  staff,
  branches,
  workShifts,
  assignments,
  currentUser,
  selectedBranchId,
  onBranchChange,
  onSave,
  onDelete,
  onCopyWeek
}) => {
  const isSuper = currentUser?.role === UserRole.SUPER_ADMIN;
  const [weekMonday, setWeekMonday] = useState(() => getMonday(new Date()));
  const [branchId, setBranchId] = useState(
    currentUser?.assignedBranchId ||
    (selectedBranchId && selectedBranchId !== "ALL" ? selectedBranchId : "") ||
    (selectedBranchId === "ALL" && currentUser?.role === UserRole.SUPER_ADMIN ? "ALL" : "") ||
    branches.find((branch) => branch.isActive)?.id ||
    ""
  );
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<{
    staff: Staff;
    date: string;
    branchId: string;
    assignment?: StaffShiftAssignment;
  } | null>(null);
  const [shiftValue, setShiftValue] = useState("");
  const [customShiftName, setCustomShiftName] = useState("");
  const [customStartTime, setCustomStartTime] = useState("08:00");
  const [customEndTime, setCustomEndTime] = useState("17:00");
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [copyMessage, setCopyMessage] = useState("");
  const [copyAssignment, setCopyAssignment] = useState<StaffShiftAssignment | null>(null);
  const [copyTargetDates, setCopyTargetDates] = useState<string[]>([]);
  const [copyFormError, setCopyFormError] = useState("");

  React.useEffect(() => {
    if (currentUser?.assignedBranchId) setBranchId(currentUser.assignedBranchId);
    else if (selectedBranchId === "ALL" && currentUser?.role === UserRole.SUPER_ADMIN) setBranchId("ALL");
    else if (selectedBranchId) setBranchId(selectedBranchId);
  }, [currentUser?.assignedBranchId, selectedBranchId]);

  const weekDays = useMemo<WeekDay[]>(() => {
    const names = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];
    const today = dateString(new Date());
    return names.map((name, index) => {
      const date = dateString(addDays(weekMonday, index));
      const [, month, day] = date.split("-");
      return { date, name, shortDate: `${day}/${month}`, isToday: date === today };
    });
  }, [weekMonday]);

  const weekRange = `${weekDays[0]?.shortDate || ""} - ${weekDays[6]?.shortDate || ""} ${weekMonday.getFullYear()}`;

  const visibleStaff = useMemo(() => staff
    .filter((person) => (branchId === "ALL" || person.branchId === branchId) && isEligibleStaff(person))
    .filter((person) => person.fullName.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((left, right) =>
      (left.branchId || "").localeCompare(right.branchId || "") ||
      left.fullName.localeCompare(right.fullName)
    ), [staff, branchId, search]);
  const eligibleStaffIds = useMemo(() => new Set(staff
    .filter((person) => (branchId === "ALL" || person.branchId === branchId) && isEligibleStaff(person))
    .map((person) => person.id)), [staff, branchId]);

  const assignmentLookup = useMemo(() => {
    const map = new Map<string, StaffShiftAssignment[]>();
    const visibleDates = new Set(weekDays.map((day) => day.date));
    assignments.forEach((assignment) => {
      if ((branchId !== "ALL" && assignment.branchId !== branchId) || !visibleDates.has(assignment.date)) return;
      const key = `${assignment.staffId}:${assignment.date}`;
      map.set(key, [...(map.get(key) || []), assignment]);
    });
    return map;
  }, [assignments, branchId, weekDays]);

  const branchShifts = useMemo(() => workShifts
    .filter((shift) => shift.branchId === (selected?.branchId || (branchId === "ALL" ? "" : branchId)) && shift.active)
    .filter((shift) =>
      (normalizeTime(shift.startTime) === "08:00" && normalizeTime(shift.endTime) === "14:00") ||
      (normalizeTime(shift.startTime) === "14:00" && normalizeTime(shift.endTime) === "21:00")
    )
    .sort((left, right) => left.startTime.localeCompare(right.startTime)), [workShifts, branchId, selected?.branchId]);
  const shiftsById = useMemo(() => new Map(workShifts.map((shift) => [shift.id, shift])), [workShifts]);
  const activeAssignments = useMemo(() => assignments.filter((assignment) =>
    (branchId === "ALL" || assignment.branchId === branchId) &&
    eligibleStaffIds.has(assignment.staffId) &&
    assignment.active &&
    weekDays.some((day) => day.date === assignment.date)
  ), [assignments, branchId, eligibleStaffIds, weekDays]);
  const activeBranch = branches.find((branch) => branch.id === branchId);

  const openAssignment = (person: Staff, date: string, assignment?: StaffShiftAssignment) => {
    const assignmentBranchId = assignment?.branchId || person.branchId || (branchId === "ALL" ? "" : branchId);
    setSelected({ staff: person, date, assignment, branchId: assignmentBranchId });
    setShiftValue(assignment?.shiftId || "custom");
    setCustomShiftName(assignment?.customShiftName || "");
    setCustomStartTime(assignment?.customStartTime || "08:00");
    setCustomEndTime(assignment?.customEndTime || "17:00");
    setNotes(assignment?.notes || "");
    setFormError("");
  };

  const closeModal = () => {
    if (isSaving) return;
    setSelected(null);
    setFormError("");
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    const isCustom = shiftValue === "custom";
    if (
      isCustom &&
      (!customShiftName.trim() ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(customStartTime) ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(customEndTime) ||
        customEndTime <= customStartTime)
    ) {
      setFormError("Isi nama shift dan jam yang valid. Jam selesai harus lebih akhir dari jam mulai.");
      return;
    }
    if (!isCustom && !branchShifts.some((shift) => shift.id === shiftValue)) {
      setFormError("Pilih shift standar yang aktif untuk cabang ini.");
      return;
    }

    setIsSaving(true);
    setFormError("");
    try {
      await onSave({
        staffId: selected.staff.id,
        branchId: selected.branchId,
        shiftId: isCustom ? null : shiftValue,
        customShiftName: isCustom ? customShiftName.trim() : null,
        customStartTime: isCustom ? customStartTime : null,
        customEndTime: isCustom ? customEndTime : null,
        date: selected.date,
        active: true,
        notes: notes.trim()
      }, selected.assignment?.id);
      setSelected(null);
    } catch (error: unknown) {
      setFormError(error instanceof Error ? error.message : "Gagal menyimpan jadwal shift.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selected?.assignment) return;
    if (!window.confirm(`Hapus jadwal ${selected.staff.fullName} pada ${selected.date}?`)) return;
    setIsSaving(true);
    setFormError("");
    try {
      await onDelete(selected.assignment);
      setSelected(null);
    } catch (error: unknown) {
      setFormError(error instanceof Error ? error.message : "Gagal menghapus jadwal shift.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopyWeek = async () => {
    if (!activeAssignments.length) return;
    const sourceCounts = new Map<string, number>();
    activeAssignments.forEach((assignment) => {
      const key = `${assignment.staffId}:${assignment.date}`;
      sourceCounts.set(key, (sourceCounts.get(key) || 0) + 1);
    });
    const duplicateSourceCount = [...sourceCounts.values()].filter((count) => count > 1).reduce((sum, count) => sum + count, 0);
    const operations = activeAssignments.filter((source) =>
      sourceCounts.get(`${source.staffId}:${source.date}`) === 1
    ).map((source) => ({
      source,
      targetDate: dateString(addDays(new Date(`${source.date}T12:00:00`), 7))
    }));
    if (!operations.length && !duplicateSourceCount) return;
    if (!window.confirm(`Salin ${operations.length} jadwal aktif ke minggu berikutnya? Jadwal yang sudah ada akan diperbarui, bukan digandakan.${duplicateSourceCount ? ` ${duplicateSourceCount} jadwal sumber duplikat akan dilewati.` : ""}`)) {
      return;
    }
    setIsCopying(true);
    setCopyMessage("");
    try {
      const result = await onCopyWeek(operations);
      const errors = [...result.errors];
      if (duplicateSourceCount) errors.unshift(`${duplicateSourceCount} jadwal sumber dilewati karena ada duplikat.`);
      setCopyMessage(errors.length
        ? `${result.copied} jadwal disalin; ${errors.length} masalah: ${errors[0]}`
        : `${result.copied} jadwal berhasil disalin ke minggu berikutnya.`);
    } catch (error: unknown) {
      setCopyMessage(error instanceof Error ? error.message : "Gagal menyalin jadwal.");
    } finally {
      setIsCopying(false);
    }
  };

  const openCopyAssignment = (assignment: StaffShiftAssignment) => {
    setCopyAssignment(assignment);
    const sourceDayIndex = weekDays.findIndex((day) => day.date === assignment.date);
    const nextDay = sourceDayIndex >= 0 ? weekDays[sourceDayIndex + 1] : undefined;
    setCopyTargetDates(nextDay ? [nextDay.date] : []);
    setCopyFormError("");
  };

  const handleCopyAssignment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!copyAssignment || copyTargetDates.length === 0) {
      setCopyFormError("Pilih setidaknya satu hari tujuan.");
      return;
    }

    setIsCopying(true);
    setCopyFormError("");
    setCopyMessage("");
    try {
      const result = await onCopyWeek(copyTargetDates.map((targetDate) => ({
        source: copyAssignment,
        targetDate
      })));
      if (result.errors.length > 0) {
        setCopyFormError(`${result.copied} jadwal disalin; ${result.errors.length} gagal: ${result.errors[0]}`);
      } else {
        setCopyMessage(`${result.copied} jadwal shift berhasil disalin.`);
        setCopyAssignment(null);
      }
    } catch (error: unknown) {
      setCopyFormError(error instanceof Error ? error.message : "Gagal menyalin jadwal shift.");
    } finally {
      setIsCopying(false);
    }
  };

  return (
    <div className="space-y-4" id="staff-shift-schedule-grid">
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-xl border border-slate-200 bg-slate-100 p-1">
            <button type="button" onClick={() => setWeekMonday((date) => addDays(date, -7))} aria-label="Minggu sebelumnya" className="rounded-lg p-1.5 text-slate-700 hover:bg-white">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => setWeekMonday(getMonday(new Date()))} className="flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-bold text-slate-700 hover:bg-white">
              <RotateCcw className="h-3 w-3" /> Minggu Ini
            </button>
            <button type="button" onClick={() => setWeekMonday((date) => addDays(date, 7))} aria-label="Minggu berikutnya" className="rounded-lg p-1.5 text-slate-700 hover:bg-white">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-1.5">
            <CalendarDays className="h-4 w-4 text-emerald-700" />
            <span className="text-xs font-black text-emerald-900">{weekRange}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isSuper && (
            <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
              <Building2 className="h-3.5 w-3.5 text-slate-400" />
              <span className="font-semibold text-slate-500">Cabang</span>
              <select value={branchId} onChange={(event) => {
                setBranchId(event.target.value);
                onBranchChange(event.target.value);
              }} className="max-w-40 bg-transparent font-bold text-slate-800 outline-none">
                <option value="ALL">Semua Cabang</option>
                {branches.filter((branch) => branch.isActive).map((branch) => (
                  <option key={branch.id} value={branch.id}>{branch.name}</option>
                ))}
              </select>
            </label>
          )}
          <label className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari staf..." className="w-40 rounded-xl border border-slate-200 bg-slate-50 py-2 pl-8 pr-3 text-xs outline-none focus:border-emerald-600" />
          </label>
          <button
            type="button"
            onClick={() => void handleCopyWeek()}
            disabled={isCopying || !activeAssignments.length}
            className="flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Copy className="h-3.5 w-3.5" />
            {isCopying ? "Menyalin..." : "Salin Minggu Depan"}
          </button>
        </div>
        {copyMessage && <p role="status" className="basis-full text-xs text-slate-600 xl:text-right">{copyMessage}</p>}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/80 px-4 py-3 text-[11px] text-slate-600">
          <p>Klik sel kosong untuk menambah jadwal, atau klik jadwal untuk mengubah/menghapus. Duplikat pada satu hari ditampilkan terpisah agar bisa diperiksa.</p>
          <span className="font-semibold">{activeBranch?.name || (branchId === "ALL" ? "Semua Cabang" : "Pilih cabang")} · {visibleStaff.length} Admin/Asisten aktif</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px] border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-100/90 text-xs font-bold text-slate-700">
                <th className="sticky left-0 z-10 w-56 border-r border-slate-200 bg-slate-100 px-4 py-3.5">
                  <span className="uppercase tracking-wider">Nama Admin / Asisten</span>
                </th>
                {weekDays.map((day) => (
                  <th key={day.date} className={`min-w-28 border-r border-slate-200 px-2 py-3 text-center last:border-r-0 ${day.isToday ? "bg-emerald-100 text-emerald-950" : ""}`}>
                    <span className="block">{day.name}</span>
                    <span className="mt-0.5 block text-[10px] font-medium">{day.shortDate}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleStaff.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-400">Tidak ada Admin Cabang atau Asisten aktif di cabang ini.</td>
                </tr>
              ) : visibleStaff.map((person) => (
                <tr key={person.id} className="border-b border-slate-200 last:border-0">
                  <th className="sticky left-0 z-[1] border-r border-slate-200 bg-white px-4 py-3 text-left">
                    <span className="block text-xs font-bold text-slate-900">{person.fullName}</span>
                    <span className="mt-0.5 block text-[10px] font-medium text-slate-500">
                      {person.position === StaffPosition.BRANCH_ADMIN ? "Admin Cabang" : "Asisten"}
                      {branchId === "ALL" && ` · ${branches.find((branch) => branch.id === person.branchId)?.name || "Tanpa cabang"}`}
                    </span>
                  </th>
                  {weekDays.map((day) => {
                    const cellAssignments = assignmentLookup.get(`${person.id}:${day.date}`) || [];
                    return (
                      <td key={day.date} className={`border-r border-slate-200 p-1.5 align-top last:border-r-0 ${day.isToday ? "bg-emerald-50/30" : ""}`}>
                        <div className="min-h-16 space-y-1">
                          {cellAssignments.map((assignment) => {
                            const label = timeLabel(assignment, shiftsById);
                            return (
                              <div key={assignment.id} className="space-y-1">
                                <button
                                  type="button"
                                  onClick={() => openAssignment(person, day.date, assignment)}
                                  className={`w-full rounded-lg border p-2 text-left transition-colors ${assignment.active ? "border-emerald-200 bg-emerald-50 hover:bg-emerald-100" : "border-slate-200 bg-slate-100 text-slate-500"}`}
                                  title="Klik untuk mengubah atau menghapus"
                                >
                                  <span className="flex items-center gap-1 text-[10px] font-extrabold text-slate-800">
                                    <Clock3 className="h-3 w-3 shrink-0" /> {label.name}
                                  </span>
                                  <span className="mt-1 block text-[10px] font-bold text-slate-700">{label.start} - {label.end}</span>
                                  {!assignment.active && <span className="mt-1 block text-[9px] font-semibold text-slate-500">Tidak aktif</span>}
                                </button>
                                {assignment.active && (
                                  <button
                                    type="button"
                                    onClick={() => openCopyAssignment(assignment)}
                                    disabled={isCopying}
                                    className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-white px-1.5 py-1 text-[9px] font-bold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                                    title="Salin jadwal shift ke hari lain"
                                  >
                                    <Copy className="h-3 w-3" />
                                    Salin
                                  </button>
                                )}
                              </div>
                            );
                          })}
                          {cellAssignments.length > 1 && (
                            <p className="rounded bg-amber-50 px-1.5 py-1 text-[9px] font-semibold text-amber-800">Ada {cellAssignments.length} jadwal; periksa duplikat</p>
                          )}
                          {!cellAssignments.length && (
                            <button
                              type="button"
                              onClick={() => openAssignment(person, day.date)}
                              className="flex min-h-16 w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-slate-200 text-[10px] font-medium text-slate-400 transition-colors hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
                            >
                              <Plus className="h-3.5 w-3.5" />
                              Tambah jadwal
                            </button>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeModal();
        }}>
          <form onSubmit={handleSave} className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">{selected.assignment ? "Ubah Jadwal Shift" : "Tambah Jadwal Shift"}</h2>
                <p className="mt-1 text-xs text-slate-500">{selected.staff.fullName} · {selected.date}</p>
              </div>
              <button type="button" onClick={closeModal} aria-label="Tutup" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
                <X className="h-4 w-4" />
              </button>
            </div>

            {formError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">{formError}</p>}

            {selected.assignment && (assignmentLookup.get(`${selected.staff.id}:${selected.date}`)?.length || 0) > 1 && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                Ada lebih dari satu jadwal untuk staf dan tanggal ini. Periksa setiap record; jangan simpan roster bulanan sampai duplikat dibereskan.
              </p>
            )}

            <label className="block text-xs font-semibold text-slate-700">
              Shift
              <select value={shiftValue} onChange={(event) => setShiftValue(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal">
                <option value="custom">Shift khusus / jam manual</option>
                {branchShifts.map((shift) => (
                  <option key={shift.id} value={shift.id}>{shift.name} ({shift.startTime} - {shift.endTime})</option>
                ))}
              </select>
            </label>

            {shiftValue === "custom" && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <label className="text-xs font-semibold text-slate-700 sm:col-span-3">
                  Nama shift
                  <input value={customShiftName} onChange={(event) => setCustomShiftName(event.target.value)} required className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal" />
                </label>
                <label className="text-xs font-semibold text-slate-700">
                  Mulai
                  <input type="time" value={customStartTime} onChange={(event) => setCustomStartTime(event.target.value)} required className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal" />
                </label>
                <label className="text-xs font-semibold text-slate-700">
                  Selesai
                  <input type="time" value={customEndTime} onChange={(event) => setCustomEndTime(event.target.value)} required className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal" />
                </label>
              </div>
            )}

            <label className="block text-xs font-semibold text-slate-700">
              Catatan
              <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal" />
            </label>

            <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
              {selected.assignment ? (
                <button type="button" disabled={isSaving} onClick={() => void handleDelete()} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50">
                  <Trash2 className="h-3.5 w-3.5" /> Hapus
                </button>
              ) : <span />}
              <div className="flex items-center gap-2">
                <button type="button" disabled={isSaving} onClick={closeModal} className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100">Batal</button>
                <button type="submit" disabled={isSaving} className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                  {isSaving ? "Menyimpan..." : "Simpan"}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {copyAssignment && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !isCopying) setCopyAssignment(null);
        }}>
          <form onSubmit={handleCopyAssignment} className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">Salin jadwal shift</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {staff.find((person) => person.id === copyAssignment.staffId)?.fullName || "Staf"} · {timeLabel(copyAssignment, shiftsById).name} · {timeLabel(copyAssignment, shiftsById).start}-{timeLabel(copyAssignment, shiftsById).end}
                </p>
              </div>
              <button type="button" onClick={() => setCopyAssignment(null)} disabled={isCopying} aria-label="Tutup" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-50">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs leading-5 text-slate-600">
              Pilih hari tujuan pada minggu ini. Jika jadwal staf tersebut sudah ada, jadwal akan diperbarui.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {weekDays.filter((day) => day.date !== copyAssignment.date).map((day) => (
                <label key={day.date} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={copyTargetDates.includes(day.date)}
                    onChange={(event) => setCopyTargetDates((current) => event.target.checked
                      ? [...current, day.date]
                      : current.filter((date) => date !== day.date))}
                    disabled={isCopying}
                    className="accent-emerald-700"
                  />
                  <span>{day.name}, {day.shortDate}</span>
                </label>
              ))}
            </div>
            {copyFormError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">{copyFormError}</p>}
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
              <button type="button" onClick={() => setCopyAssignment(null)} disabled={isCopying} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                Batal
              </button>
              <button type="submit" disabled={isCopying || copyTargetDates.length === 0} className="rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-50">
                {isCopying ? "Menyalin..." : `Salin ke ${copyTargetDates.length} hari`}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
