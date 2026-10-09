import React, { useState, useMemo } from "react";
import {
  DentalDoctor,
  DentalBranch,
  DoctorSchedule,
  ScheduleStatus,
  CurrentUser,
  UserRole
} from "../types/domain";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Building2,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  X,
  Stethoscope,
  Sparkles,
  RotateCcw,
  AlertTriangle
} from "lucide-react";

interface DoctorExcelScheduleGridProps {
  doctors: DentalDoctor[];
  branches: DentalBranch[];
  schedules: DoctorSchedule[];
  currentUser: CurrentUser | null;
  selectedBranchId: string | null;
  onScheduleCreate: (data: {
    doctorId: string;
    branchId: string;
    date: string;
    startTime: string;
    endTime: string;
    notes?: string;
  }) => Promise<void>;
  onScheduleUpdate: (id: string, updates: Partial<DoctorSchedule>) => Promise<void>;
  onScheduleCancel: (schedule: DoctorSchedule) => void;
  onOpenPosterModal?: () => void;
}

export const DoctorExcelScheduleGrid: React.FC<DoctorExcelScheduleGridProps> = ({
  doctors,
  branches,
  schedules,
  currentUser,
  selectedBranchId,
  onScheduleCreate,
  onScheduleUpdate,
  onScheduleCancel,
  onOpenPosterModal
}) => {
  const isSuper = currentUser?.role === UserRole.SUPER_ADMIN;

  // 1. Current Active Week Anchor (Monday-based week)
  const [currentWeekMonday, setCurrentWeekMonday] = useState<Date>(() => {
    const d = new Date();
    const day = d.getDay(); // 0 is Sunday
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
    const monday = new Date(d.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    return monday;
  });

  // Filter state for branch inside the grid
  const [filterBranchId, setFilterBranchId] = useState<string>(
    selectedBranchId || "ALL"
  );
  const [doctorSearch, setDoctorSearch] = useState<string>("");

  // Quick Cell Modal State (for 1-click scheduling or editing)
  const [activeCellModal, setActiveCellModal] = useState<{
    mode: "create" | "edit";
    doctorId: string;
    doctorName: string;
    date: string;
    dayLabel: string;
    existingSchedule?: DoctorSchedule;
  } | null>(null);

  const [formBranchId, setFormBranchId] = useState<string>("");
  const [formStartTime, setFormStartTime] = useState<string>("08:00");
  const [formEndTime, setFormEndTime] = useState<string>("14:00");
  const [formNotes, setFormNotes] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string>("");

  // Calculate 7 Days of the Week
  const weekDays = useMemo(() => {
    const days: { dateStr: string; dayName: string; formattedDate: string; isToday: boolean }[] = [];
    const dayNames = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];
    const todayStr = new Date().toISOString().split("T")[0];

    for (let i = 0; i < 7; i++) {
      const d = new Date(currentWeekMonday);
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().split("T")[0];
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agt", "Sep", "Okt", "Nov", "Des"];
      const formattedDate = `${d.getDate()} ${monthNames[d.getMonth()]}`;

      days.push({
        dateStr,
        dayName: dayNames[i],
        formattedDate,
        isToday: dateStr === todayStr
      });
    }
    return days;
  }, [currentWeekMonday]);

  // Week range label (e.g. "5 Okt - 11 Okt 2026")
  const weekRangeLabel = useMemo(() => {
    if (weekDays.length === 0) return "";
    const first = weekDays[0];
    const last = weekDays[6];
    const year = new Date(currentWeekMonday).getFullYear();
    return `${first.formattedDate} - ${last.formattedDate} ${year}`;
  }, [weekDays, currentWeekMonday]);

  // Handlers for Week Navigation
  const handlePrevWeek = () => {
    const d = new Date(currentWeekMonday);
    d.setDate(d.getDate() - 7);
    setCurrentWeekMonday(d);
  };

  const handleNextWeek = () => {
    const d = new Date(currentWeekMonday);
    d.setDate(d.getDate() + 7);
    setCurrentWeekMonday(d);
  };

  const handleCurrentWeek = () => {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    setCurrentWeekMonday(monday);
  };

  // Filtered Doctors list
  const activeDoctors = useMemo(() => {
    return doctors
      .filter((doc) => doc.active ?? doc.isActive ?? true)
      .filter((doc) => {
        if (!doctorSearch.trim()) return true;
        const q = doctorSearch.toLowerCase();
        return (
          doc.name.toLowerCase().includes(q) ||
          (doc.fullName && doc.fullName.toLowerCase().includes(q)) ||
          (doc.specialization && doc.specialization.toLowerCase().includes(q))
        );
      });
  }, [doctors, doctorSearch]);

  // Map of schedules by `${doctorId}_${date}` for O(1) cell lookup
  const schedulesLookup = useMemo(() => {
    const map = new Map<string, DoctorSchedule[]>();

    // Mapping table to map any doctor identifier (id, doctorCode, clean name, short ID) to the doctor's active ID in props
    const doctorKeyToId = new Map<string, string>();
    doctors.forEach((d) => {
      doctorKeyToId.set(d.id, d.id);
      if (d.doctorCode) doctorKeyToId.set(d.doctorCode.toLowerCase(), d.id);
      const cleanName = (d.name || d.fullName || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      if (cleanName) doctorKeyToId.set(cleanName, d.id);
      if (d.id.startsWith("doc-")) {
        const short = d.id.replace("doc-", "");
        doctorKeyToId.set(short, d.id);
      }
    });

    schedules.forEach((s) => {
      if (s.status !== ScheduleStatus.ACTIVE) return;
      if (filterBranchId !== "ALL" && s.branchId !== filterBranchId) return;

      // Find matching doctor in current grid
      let targetDocId = s.doctorId;
      if (doctorKeyToId.has(s.doctorId)) {
        targetDocId = doctorKeyToId.get(s.doctorId)!;
      } else if (doctorKeyToId.has(s.doctorId.toLowerCase())) {
        targetDocId = doctorKeyToId.get(s.doctorId.toLowerCase())!;
      } else {
        const cleanS = s.doctorId.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (doctorKeyToId.has(cleanS)) {
          targetDocId = doctorKeyToId.get(cleanS)!;
        }
      }

      const key = `${targetDocId}_${s.date}`;
      const existing = map.get(key) || [];
      existing.push(s);
      map.set(key, existing);

      // Also register original s.doctorId key if different
      if (targetDocId !== s.doctorId) {
        const rawKey = `${s.doctorId}_${s.date}`;
        if (!map.has(rawKey)) map.set(rawKey, existing);
      }
    });
    return map;
  }, [schedules, filterBranchId, doctors]);

  // Open modal for clicking an empty cell
  const handleCellClickEmpty = (doc: DentalDoctor, day: { dateStr: string; dayName: string; formattedDate: string }) => {
    const defaultBranch =
      filterBranchId !== "ALL"
        ? filterBranchId
        : doc.assignedBranchId || branches[0]?.id || "branch-gebang";

    setFormBranchId(defaultBranch);
    setFormStartTime("08:00");
    setFormEndTime("14:00");
    setFormNotes("");
    setFormError("");

    setActiveCellModal({
      mode: "create",
      doctorId: doc.id,
      doctorName: doc.name || doc.fullName || "Dokter",
      date: day.dateStr,
      dayLabel: `${day.dayName}, ${day.formattedDate}`
    });
  };

  // Open modal for clicking an existing schedule cell
  const handleCellClickExisting = (doc: DentalDoctor, day: { dateStr: string; dayName: string; formattedDate: string }, sched: DoctorSchedule) => {
    setFormBranchId(sched.branchId);
    setFormStartTime(sched.startTime);
    setFormEndTime(sched.endTime);
    setFormNotes(sched.notes || "");
    setFormError("");

    setActiveCellModal({
      mode: "edit",
      doctorId: doc.id,
      doctorName: doc.name || doc.fullName || "Dokter",
      date: day.dateStr,
      dayLabel: `${day.dayName}, ${day.formattedDate}`,
      existingSchedule: sched
    });
  };

  // Quick presets for shift time
  const applyPreset = (start: string, end: string) => {
    setFormStartTime(start);
    setFormEndTime(end);
  };

  // Submit Modal
  const handleSaveModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCellModal) return;

    if (formStartTime >= formEndTime) {
      setFormError("Jam mulai harus lebih awal dari jam selesai.");
      return;
    }

    setIsSubmitting(true);
    setFormError("");

    try {
      if (activeCellModal.mode === "create") {
        await onScheduleCreate({
          doctorId: activeCellModal.doctorId,
          branchId: formBranchId,
          date: activeCellModal.date,
          startTime: formStartTime,
          endTime: formEndTime,
          notes: formNotes
        });
      } else if (activeCellModal.mode === "edit" && activeCellModal.existingSchedule) {
        await onScheduleUpdate(activeCellModal.existingSchedule.id, {
          branchId: formBranchId,
          startTime: formStartTime,
          endTime: formEndTime,
          notes: formNotes
        });
      }
      setActiveCellModal(null);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Gagal menyimpan jadwal.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Branch map for quick name lookup
  const branchMap = useMemo(() => {
    return new Map(branches.map((b) => [b.id, b]));
  }, [branches]);

  return (
    <div className="space-y-4 font-sans" id="doctor-excel-schedule-grid">
      
      {/* 1. TOP TOOLBAR: NAVIGATION & FILTERS (Excel Header Style) */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-4 flex flex-col lg:flex-row items-center justify-between gap-4">
        
        {/* Left: Week Navigation Controls */}
        <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
          <div className="flex items-center bg-slate-100 rounded-xl p-1 border border-slate-200">
            <button
              onClick={handlePrevWeek}
              className="p-1.5 hover:bg-white text-slate-700 hover:text-slate-900 rounded-lg transition-all cursor-pointer"
              title="Minggu Sebelumnya"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={handleCurrentWeek}
              className="px-3 py-1 text-xs font-bold text-slate-700 hover:text-emerald-700 hover:bg-white rounded-lg transition-all cursor-pointer flex items-center gap-1.5"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Minggu Ini</span>
            </button>
            <button
              onClick={handleNextWeek}
              className="p-1.5 hover:bg-white text-slate-700 hover:text-slate-900 rounded-lg transition-all cursor-pointer"
              title="Minggu Berikutnya"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-2 bg-emerald-50/70 border border-emerald-200/80 px-3.5 py-1.5 rounded-xl">
            <Calendar className="w-4 h-4 text-emerald-700 shrink-0" />
            <span className="text-xs font-black text-emerald-900 tracking-tight">
              {weekRangeLabel}
            </span>
          </div>
        </div>

        {/* Right: Branch Selector & Actions */}
        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto justify-start lg:justify-end">
          
          {/* Branch Dropdown */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-xs">
            <Building2 className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-500 font-semibold text-[11px]">Cabang:</span>
            <select
              value={filterBranchId}
              onChange={(e) => setFilterBranchId(e.target.value)}
              className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer text-xs pr-2"
              disabled={!isSuper && !!currentUser?.assignedBranchId}
            >
              {isSuper && <option value="ALL">Semua Cabang</option>}
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          {/* Quick Doctor Search input */}
          <div className="relative">
            <input
              type="text"
              placeholder="Cari dokter..."
              value={doctorSearch}
              onChange={(e) => setDoctorSearch(e.target.value)}
              className="text-xs border border-slate-200 bg-slate-50 focus:bg-white focus:border-emerald-600 rounded-xl px-3 py-1.5 focus:outline-none w-36 lg:w-44 transition-all"
            />
          </div>

          {/* Export / Poster button */}
          {onOpenPosterModal && isSuper && (
            <button
              onClick={onOpenPosterModal}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Poster Jadwal</span>
            </button>
          )}

        </div>

      </div>

      {/* 2. EXCEL-STYLE TABLE GRID (Spreadsheet Matrix View) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        
        {/* Table Instructions Subheader */}
        <div className="bg-slate-50/80 px-4 py-2.5 border-b border-slate-200 flex flex-wrap items-center justify-between text-[11px] text-slate-500">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-700 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
              Format Tabel Roster Excel:
            </span>
            <span>Klik pada kotak kosong untuk menambah jadwal • Klik jadwal yang ada untuk mengedit atau menghapus.</span>
          </div>
          <div className="font-semibold text-slate-600">
            Total {activeDoctors.length} Dokter Terdaftar
          </div>
        </div>

        {/* The Matrix Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[900px]">
            
            {/* Table Header: Days of the Week */}
            <thead>
              <tr className="bg-slate-100/90 text-slate-700 text-xs font-bold border-b border-slate-200">
                
                {/* Column 1: Doctor Profile */}
                <th className="py-3.5 px-4 w-56 sticky left-0 bg-slate-100 z-10 border-r border-slate-200 shadow-[1px_0_3px_rgba(0,0,0,0.03)]">
                  <div className="flex items-center gap-2">
                    <Stethoscope className="w-4 h-4 text-emerald-700" />
                    <span className="uppercase tracking-wider text-[11px] font-extrabold text-slate-800">
                      Nama Dokter
                    </span>
                  </div>
                </th>

                {/* Columns 2-8: Monday to Sunday */}
                {weekDays.map((day) => (
                  <th
                    key={day.dateStr}
                    className={`py-3 px-3 text-center border-r border-slate-200 last:border-r-0 transition-colors ${
                      day.isToday ? "bg-emerald-100/70 text-emerald-950 font-black" : ""
                    }`}
                  >
                    <div className="flex flex-col items-center">
                      <span className="uppercase text-[11px] tracking-wide font-extrabold">
                        {day.dayName}
                      </span>
                      <span className={`text-[10px] mt-0.5 px-2 py-0.5 rounded-full ${
                        day.isToday ? "bg-emerald-700 text-white font-bold" : "text-slate-500"
                      }`}>
                        {day.formattedDate}
                      </span>
                    </div>
                  </th>
                ))}

                {/* Column 9: Sesi Summary */}
                <th className="py-3 px-3 text-center w-20 text-[11px] uppercase tracking-wider font-extrabold text-slate-600">
                  Total
                </th>

              </tr>
            </thead>

            {/* Table Body: 1 Row per Doctor */}
            <tbody className="divide-y divide-slate-150 text-xs">
              {activeDoctors.map((doc, docIdx) => {
                let doctorWeeklySessionsCount = 0;

                return (
                  <tr
                    key={doc.id}
                    className={`hover:bg-slate-50/80 transition-colors ${
                      docIdx % 2 === 0 ? "bg-white" : "bg-slate-50/30"
                    }`}
                  >
                    
                    {/* Doctor Header Cell (Sticky on Horizontal Scroll) */}
                    <td className="py-3 px-4 sticky left-0 bg-inherit z-10 border-r border-slate-200 shadow-[1px_0_3px_rgba(0,0,0,0.03)]">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-slate-200 border border-slate-300 overflow-hidden shrink-0 flex items-center justify-center">
                          {doc.photoUrl || doc.avatarUrl ? (
                            <img
                              src={(doc.photoUrl || doc.avatarUrl) as string}
                              alt={doc.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <span className="font-bold text-slate-600 text-xs">
                              {doc.name.charAt(0)}
                            </span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-slate-900 truncate text-xs">
                            {doc.name || doc.fullName}
                          </p>
                          <p className="text-[10px] text-slate-500 truncate">
                            {doc.specialization || "Dokter Gigi Umum"}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* 7 Daily Cells */}
                    {weekDays.map((day) => {
                      const key = `${doc.id}_${day.dateStr}`;
                      const cellSchedules = schedulesLookup.get(key) || [];
                      doctorWeeklySessionsCount += cellSchedules.length;

                      const isHasSchedule = cellSchedules.length > 0;

                      return (
                        <td
                          key={day.dateStr}
                          className={`p-2 border-r border-slate-200 last:border-r-0 align-top transition-colors ${
                            day.isToday ? "bg-emerald-50/20" : ""
                          }`}
                        >
                          {isHasSchedule ? (
                            // Existing Schedule Card(s) in this cell
                            <div className="space-y-1.5">
                              {cellSchedules.map((s) => {
                                const br = branchMap.get(s.branchId);
                                const isMorning = s.startTime < "14:00";

                                return (
                                  <div
                                    key={s.id}
                                    onClick={() => handleCellClickExisting(doc, day, s)}
                                    className={`group p-2 rounded-xl border text-[11px] cursor-pointer transition-all hover:scale-[1.02] hover:shadow-xs relative ${
                                      isMorning
                                        ? "bg-amber-50/80 border-amber-200 text-amber-950 hover:border-amber-300"
                                        : "bg-indigo-50/80 border-indigo-200 text-indigo-950 hover:border-indigo-300"
                                    }`}
                                  >
                                    <div className="flex items-center justify-between gap-1 mb-1">
                                      <span className="font-extrabold flex items-center gap-1">
                                        <Clock className="w-3 h-3 shrink-0" />
                                        {s.startTime} - {s.endTime}
                                      </span>
                                      <span className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-slate-700">
                                        <Edit2 className="w-3 h-3" />
                                      </span>
                                    </div>

                                    {br && (
                                      <div className="flex items-center gap-1 text-[10px] text-slate-600 font-semibold truncate">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 shrink-0"></span>
                                        <span className="truncate">{br.name.replace("Klinik Gigi Lala Dentist - ", "")}</span>
                                      </div>
                                    )}

                                    {s.notes && (
                                      <p className="text-[9px] text-slate-500 italic truncate mt-0.5">
                                        "{s.notes}"
                                      </p>
                                    )}
                                  </div>
                                );
                              })}

                              {/* Button to add another session on the same day if needed */}
                              <button
                                type="button"
                                onClick={() => handleCellClickEmpty(doc, day)}
                                className="w-full py-1 text-[10px] text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg border border-dashed border-slate-200 hover:border-emerald-300 transition-colors flex items-center justify-center gap-1 cursor-pointer"
                                title="Tambah shift lain di hari yang sama"
                              >
                                <Plus className="w-2.5 h-2.5" />
                                <span>Tambah</span>
                              </button>
                            </div>
                          ) : (
                            // Empty Cell: Clickable button to create schedule
                            <button
                              type="button"
                              onClick={() => handleCellClickEmpty(doc, day)}
                              className="w-full h-16 rounded-xl border border-dashed border-slate-200/90 hover:border-emerald-400 hover:bg-emerald-50/60 transition-all flex flex-col items-center justify-center gap-1 text-slate-300 hover:text-emerald-700 group cursor-pointer"
                              title={`Jadwalkan ${doc.name} pada ${day.dayName}`}
                            >
                              <Plus className="w-4 h-4 opacity-40 group-hover:opacity-100 group-hover:scale-110 transition-all" />
                              <span className="text-[10px] font-medium text-slate-400 group-hover:text-emerald-800">
                                — Libur —
                              </span>
                            </button>
                          )}
                        </td>
                      );
                    })}

                    {/* Weekly Total Sessions */}
                    <td className="py-3 px-3 text-center align-middle font-black text-slate-700">
                      <span className={`px-2.5 py-1 rounded-full text-xs ${
                        doctorWeeklySessionsCount > 0
                          ? "bg-emerald-100 text-emerald-800"
                          : "text-slate-400 bg-slate-100"
                      }`}>
                        {doctorWeeklySessionsCount} Sesi
                      </span>
                    </td>

                  </tr>
                );
              })}

              {activeDoctors.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    Tidak ada dokter yang cocok dengan pencarian.
                  </td>
                </tr>
              )}
            </tbody>

          </table>
        </div>

        {/* Legend Footer */}
        <div className="bg-slate-50 px-4 py-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
          <div className="flex flex-wrap items-center gap-4">
            <span className="font-bold text-slate-700">Keterangan Shift:</span>
            <span className="flex items-center gap-1.5 text-[11px]">
              <span className="w-3 h-3 rounded-md bg-amber-100 border border-amber-300"></span>
              Shift Pagi (08:00 - 14:00)
            </span>
            <span className="flex items-center gap-1.5 text-[11px]">
              <span className="w-3 h-3 rounded-md bg-indigo-100 border border-indigo-300"></span>
              Shift Sore / Malam (15:00 - 21:00)
            </span>
            <span className="flex items-center gap-1.5 text-[11px]">
              <span className="w-3 h-3 rounded-md border border-dashed border-slate-300 bg-white"></span>
              Libur (Klik untuk menjadwalkan)
            </span>
          </div>

          <div className="text-[11px] text-slate-500">
            Klinik Gigi Lala Dentist • Manajemen Jadwal
          </div>
        </div>

      </div>

      {/* 3. QUICK 1-CLICK POPUP MODAL (Add / Edit Schedule) */}
      {activeCellModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full overflow-hidden">
            
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-emerald-800 to-teal-900 text-white px-5 py-4 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-emerald-300" />
                  {activeCellModal.mode === "create" ? "Atur Jadwal Praktek" : "Ubah Jadwal Praktek"}
                </h3>
                <p className="text-xs text-emerald-100 mt-0.5">
                  {activeCellModal.doctorName} • {activeCellModal.dayLabel}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveCellModal(null)}
                className="text-emerald-200 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveModal} className="p-5 space-y-4 text-xs">
              
              {formError && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 p-3 rounded-xl flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Quick Shift Presets Buttons */}
              <div>
                <label className="font-bold text-slate-700 block mb-1.5">
                  Pilih Cepat Shift (1-Klik):
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => applyPreset("08:00", "14:00")}
                    className={`p-2 rounded-xl border text-center transition-all cursor-pointer ${
                      formStartTime === "08:00" && formEndTime === "14:00"
                        ? "bg-amber-100 border-amber-400 text-amber-950 font-bold shadow-xs"
                        : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-amber-50"
                    }`}
                  >
                    <span className="block font-bold">Shift Pagi</span>
                    <span className="text-[10px] text-slate-500">08:00 - 14:00</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => applyPreset("15:00", "21:00")}
                    className={`p-2 rounded-xl border text-center transition-all cursor-pointer ${
                      formStartTime === "15:00" && formEndTime === "21:00"
                        ? "bg-indigo-100 border-indigo-400 text-indigo-950 font-bold shadow-xs"
                        : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-indigo-50"
                    }`}
                  >
                    <span className="block font-bold">Shift Sore</span>
                    <span className="text-[10px] text-slate-500">15:00 - 21:00</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => applyPreset("08:00", "20:00")}
                    className={`p-2 rounded-xl border text-center transition-all cursor-pointer ${
                      formStartTime === "08:00" && formEndTime === "20:00"
                        ? "bg-emerald-100 border-emerald-400 text-emerald-950 font-bold shadow-xs"
                        : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-emerald-50"
                    }`}
                  >
                    <span className="block font-bold">Full Day</span>
                    <span className="text-[10px] text-slate-500">08:00 - 20:00</span>
                  </button>
                </div>
              </div>

              {/* Custom Hours Input */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    Jam Mulai Praktek:
                  </label>
                  <input
                    type="time"
                    value={formStartTime}
                    onChange={(e) => setFormStartTime(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold text-slate-800 focus:outline-none focus:border-emerald-600 focus:bg-white"
                    required
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    Jam Selesai Praktek:
                  </label>
                  <input
                    type="time"
                    value={formEndTime}
                    onChange={(e) => setFormEndTime(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold text-slate-800 focus:outline-none focus:border-emerald-600 focus:bg-white"
                    required
                  />
                </div>
              </div>

              {/* Branch Selection */}
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Lokasi Cabang Praktek:
                </label>
                <select
                  value={formBranchId}
                  onChange={(e) => setFormBranchId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-semibold text-slate-800 focus:outline-none focus:border-emerald-600 focus:bg-white"
                  required
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Optional Notes */}
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Catatan Tambahan (Opsional):
                </label>
                <input
                  type="text"
                  placeholder="Misal: Praktek gigi anak, poli bedah..."
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:border-emerald-600 focus:bg-white"
                />
              </div>

              {/* Modal Actions */}
              <div className="pt-2 flex items-center justify-between border-t border-slate-100 gap-3">
                {activeCellModal.mode === "edit" && activeCellModal.existingSchedule ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm("Batalkan / hapus jadwal praktek ini?")) {
                        onScheduleCancel(activeCellModal.existingSchedule!);
                        setActiveCellModal(null);
                      }
                    }}
                    className="px-3 py-2 text-rose-600 hover:bg-rose-50 rounded-xl font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Hapus Jadwal</span>
                  </button>
                ) : (
                  <div></div>
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveCellModal(null)}
                    className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-100 rounded-xl font-bold transition-colors cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{isSubmitting ? "Menyimpan..." : "Simpan Jadwal"}</span>
                  </button>
                </div>
              </div>

            </form>

          </div>
        </div>
      )}

    </div>
  );
};
