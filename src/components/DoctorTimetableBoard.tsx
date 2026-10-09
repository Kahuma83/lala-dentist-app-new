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
  GripVertical,
  Trash2,
  Edit2,
  Stethoscope,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Image as ImageIcon,
  RotateCcw
} from "lucide-react";

export interface ShiftSlot {
  id: string;
  name: string;
  periodLabel: string;
  startTime: string;
  endTime: string;
  badgeColor: string;
  headerBg: string;
}

export interface WeekDayInfo {
  dateStr: string;
  dayName: string;
  formattedDate: string;
  fullLabel: string;
  isToday: boolean;
}

export const CLINIC_SHIFTS: ShiftSlot[] = [
  {
    id: "shift-pagi",
    name: "Shift Pagi",
    periodLabel: "08:00 - 14:00",
    startTime: "08:00",
    endTime: "14:00",
    badgeColor: "bg-amber-100 text-amber-900 border-amber-300",
    headerBg: "bg-amber-50/80 text-amber-900 border-amber-200"
  },
  {
    id: "shift-sore",
    name: "Shift Sore / Malam",
    periodLabel: "15:00 - 21:00",
    startTime: "15:00",
    endTime: "21:00",
    badgeColor: "bg-indigo-100 text-indigo-900 border-indigo-300",
    headerBg: "bg-indigo-50/80 text-indigo-900 border-indigo-200"
  },
  {
    id: "shift-fullday",
    name: "Full Day / Fleksibel",
    periodLabel: "08:00 - 20:00",
    startTime: "08:00",
    endTime: "20:00",
    badgeColor: "bg-emerald-100 text-emerald-900 border-emerald-300",
    headerBg: "bg-emerald-50/80 text-emerald-900 border-emerald-200"
  }
];

interface DoctorTimetableBoardProps {
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
  onOpenCreateModal: (defaultValues?: {
    date?: string;
    branchId?: string;
    startTime?: string;
    endTime?: string;
    doctorId?: string;
  }) => void;
  onOpenPosterModal?: () => void;
}

export const DoctorTimetableBoard: React.FC<DoctorTimetableBoardProps> = ({
  doctors,
  branches,
  schedules,
  currentUser,
  selectedBranchId,
  onScheduleCreate,
  onScheduleUpdate,
  onScheduleCancel,
  onOpenCreateModal,
  onOpenPosterModal
}) => {
  const isSuper = currentUser?.role === UserRole.SUPER_ADMIN;
  const userBranchId = currentUser?.role === UserRole.BRANCH_ADMIN ? currentUser.assignedBranchId : null;

  // Selected branch filter for timetable
  const [activeBranchId, setActiveBranchId] = useState<string>(
    userBranchId || selectedBranchId || (branches[0]?.id || "branch-gebang")
  );

  // Selected doctor filter (optional highlight)
  const [highlightDoctorId, setHighlightDoctorId] = useState<string>("ALL");

  // Reference date for the week (defaults to today)
  const [currentWeekDate, setCurrentWeekDate] = useState<Date>(() => new Date());

  // Drag & drop state
  const [draggedDoctorId, setDraggedDoctorId] = useState<string | null>(null);
  const [draggedScheduleId, setDraggedScheduleId] = useState<string | null>(null);
  const [activeDropTarget, setActiveDropTarget] = useState<string | null>(null); // "dateStr_shiftId"
  const [isProcessing, setIsProcessing] = useState(false);
  const [boardFeedback, setBoardFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Calculate 7 days of the selected week starting from Monday
  const weekDays = useMemo(() => {
    const ref = new Date(currentWeekDate);
    const day = ref.getDay();
    // Monday as day 1. If day is 0 (Sunday), diff is -6. Otherwise 1 - day
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const monday = new Date(ref);
    monday.setDate(ref.getDate() + diffToMonday);

    const dayNames = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];
    const days: WeekDayInfo[] = [];

    const todayStr = new Date().toISOString().split("T")[0];

    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const dateStr = d.toISOString().split("T")[0];
      days.push({
        dateStr,
        dayName: dayNames[i],
        formattedDate: `${d.getDate()} ${d.toLocaleDateString("id-ID", { month: "short" })}`,
        fullLabel: d.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
        isToday: dateStr === todayStr
      });
    }

    return days;
  }, [currentWeekDate]);

  // Navigate weeks
  const handlePrevWeek = () => {
    setCurrentWeekDate((prev) => {
      const next = new Date(prev);
      next.setDate(prev.getDate() - 7);
      return next;
    });
  };

  const handleNextWeek = () => {
    setCurrentWeekDate((prev) => {
      const next = new Date(prev);
      next.setDate(prev.getDate() + 7);
      return next;
    });
  };

  const handleResetToCurrentWeek = () => {
    setCurrentWeekDate(new Date());
  };

  const showNotification = (type: "success" | "error", message: string) => {
    setBoardFeedback({ type, message });
    setTimeout(() => {
      setBoardFeedback(null);
    }, 4500);
  };

  // Drag handlers for Palette Doctor
  const handleDoctorDragStart = (e: React.DragEvent, doctorId: string) => {
    setDraggedDoctorId(doctorId);
    setDraggedScheduleId(null);
    e.dataTransfer.setData("application/json", JSON.stringify({ type: "NEW_DOCTOR", doctorId }));
    e.dataTransfer.effectAllowed = "copyMove";
  };

  // Drag handlers for existing Schedule card
  const handleScheduleDragStart = (e: React.DragEvent, schedule: DoctorSchedule) => {
    setDraggedScheduleId(schedule.id);
    setDraggedDoctorId(null);
    e.dataTransfer.setData(
      "application/json",
      JSON.stringify({ type: "MOVE_SCHEDULE", scheduleId: schedule.id, originalDate: schedule.date })
    );
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragEnd = () => {
    setDraggedDoctorId(null);
    setDraggedScheduleId(null);
    setActiveDropTarget(null);
  };

  const handleDragOver = (e: React.DragEvent, dateStr: string, shift: ShiftSlot) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = draggedDoctorId ? "copy" : "move";
    const targetKey = `${dateStr}_${shift.id}`;
    if (activeDropTarget !== targetKey) {
      setActiveDropTarget(targetKey);
    }
  };

  const handleDragLeave = (e: React.DragEvent, dateStr: string, shift: ShiftSlot) => {
    const targetKey = `${dateStr}_${shift.id}`;
    if (activeDropTarget === targetKey) {
      setActiveDropTarget(null);
    }
  };

  const handleDrop = async (e: React.DragEvent, dateStr: string, shift: ShiftSlot) => {
    e.preventDefault();
    setActiveDropTarget(null);
    setIsProcessing(true);

    try {
      const dataJson = e.dataTransfer.getData("application/json");
      if (!dataJson) return;

      const payload = JSON.parse(dataJson);
      const targetBranch = activeBranchId === "ALL" ? (userBranchId || branches[0]?.id || "branch-gebang") : activeBranchId;
      const branchObj = branches.find((b) => b.id === targetBranch);

      if (payload.type === "NEW_DOCTOR") {
        let doctor = doctors.find((d) => d.id === payload.doctorId);
        if (!doctor && payload.doctorId) {
          const targetClean = String(payload.doctorId).toLowerCase().trim();
          doctor = doctors.find(
            (d) =>
              d.id.toLowerCase() === targetClean ||
              (d as any).doctorCode?.toLowerCase() === targetClean ||
              (d.name && d.name.toLowerCase().includes(targetClean)) ||
              (d.fullName && d.fullName.toLowerCase().includes(targetClean))
          );
        }
        if (!doctor && doctors.length > 0) {
          doctor = doctors[0];
        }
        if (!doctor) throw new Error("Dokter tidak ditemukan");

        await onScheduleCreate({
          doctorId: doctor.id,
          branchId: targetBranch,
          date: dateStr,
          startTime: shift.startTime,
          endTime: shift.endTime,
          notes: `Jadwal ${shift.name} di ${branchObj?.name || targetBranch}`
        });

        const dayInfo = weekDays.find((w) => w.dateStr === dateStr);
        showNotification(
          "success",
          `Berhasil menjadwalkan ${doctor.name} pada hari ${dayInfo?.dayName || dateStr}, ${shift.name} (${shift.periodLabel}) di ${branchObj?.name || ""}.`
        );
      } else if (payload.type === "MOVE_SCHEDULE") {
        const existingSchedule = schedules.find((s) => s.id === payload.scheduleId);
        if (!existingSchedule) throw new Error("Jadwal tidak ditemukan");

        let doctor = doctors.find((d) => d.id === existingSchedule.doctorId);
        if (!doctor && existingSchedule.doctorId) {
          const targetClean = String(existingSchedule.doctorId).toLowerCase().trim();
          doctor = doctors.find(
            (d) =>
              d.id.toLowerCase() === targetClean ||
              (d as any).doctorCode?.toLowerCase() === targetClean ||
              (d.name && d.name.toLowerCase().includes(targetClean)) ||
              (d.fullName && d.fullName.toLowerCase().includes(targetClean))
          );
        }
        if (!doctor && doctors.length > 0) {
          doctor = doctors[0];
        }

        await onScheduleUpdate(payload.scheduleId, {
          date: dateStr,
          branchId: targetBranch,
          startTime: shift.startTime,
          endTime: shift.endTime
        });

        const dayInfo = weekDays.find((w) => w.dateStr === dateStr);
        showNotification(
          "success",
          `Jadwal ${doctor?.name || "Dokter"} berhasil dipindahkan ke hari ${dayInfo?.dayName || dateStr}, ${shift.name} (${shift.periodLabel}).`
        );
      }
    } catch (err: unknown) {
      showNotification("error", err instanceof Error ? err.message : "Gagal memproses jadwal dokter");
    } finally {
      setIsProcessing(false);
      setDraggedDoctorId(null);
      setDraggedScheduleId(null);
    }
  };

  // Group schedules by date and shift
  const schedulesByCell = useMemo(() => {
    const map = new Map<string, DoctorSchedule[]>();

    schedules.forEach((sched) => {
      // Filter branch
      if (activeBranchId !== "ALL" && sched.branchId !== activeBranchId) {
        return;
      }
      // Filter status
      if (sched.status === ScheduleStatus.CANCELLED) {
        return;
      }
      // Filter highlight doctor if any
      if (highlightDoctorId !== "ALL" && sched.doctorId !== highlightDoctorId) {
        return;
      }

      // Determine matching shift
      let matchedShiftId = "shift-fullday";
      if (sched.startTime >= "06:00" && sched.endTime <= "14:30") {
        matchedShiftId = "shift-pagi";
      } else if (sched.startTime >= "14:00" && sched.endTime <= "22:00") {
        matchedShiftId = "shift-sore";
      }

      const key = `${sched.date}_${matchedShiftId}`;
      const list = map.get(key) || [];
      list.push(sched);
      map.set(key, list);
    });

    return map;
  }, [schedules, activeBranchId, highlightDoctorId]);

  const activeDoctors = doctors.filter((d) => d.active ?? d.isActive ?? true);

  return (
    <div className="space-y-4" id="doctor-timetable-board">
      {/* Toast Notification */}
      {boardFeedback && (
        <div
          className={`p-3.5 rounded-xl text-xs font-semibold flex items-center justify-between shadow-md animate-in fade-in ${
            boardFeedback.type === "success"
              ? "bg-emerald-50 border border-emerald-200 text-emerald-900"
              : "bg-rose-50 border border-rose-200 text-rose-900"
          }`}
        >
          <div className="flex items-center gap-2">
            {boardFeedback.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{boardFeedback.message}</span>
          </div>
          <button onClick={() => setBoardFeedback(null)} className="text-slate-400 hover:text-slate-600 ml-3">
            ✕
          </button>
        </div>
      )}

      {/* 1. TOP CONTROL BAR */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        {/* Left: Week Navigator */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="inline-flex items-center bg-slate-100/90 p-1 rounded-xl border border-slate-200">
            <button
              onClick={handlePrevWeek}
              className="p-1.5 hover:bg-white text-slate-700 hover:text-slate-900 rounded-lg transition-colors cursor-pointer"
              title="Minggu Sebelumnya"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="px-3 text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-emerald-600" />
              <span>
                {weekDays[0].formattedDate} – {weekDays[6].formattedDate} {currentWeekDate.getFullYear()}
              </span>
            </div>
            <button
              onClick={handleNextWeek}
              className="p-1.5 hover:bg-white text-slate-700 hover:text-slate-900 rounded-lg transition-colors cursor-pointer"
              title="Minggu Berikutnya"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={handleResetToCurrentWeek}
            className="inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold text-slate-600 hover:text-emerald-700 bg-white hover:bg-emerald-50/60 border border-slate-200 rounded-xl transition-colors cursor-pointer"
            title="Kembali ke minggu berjalan"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Minggu Ini</span>
          </button>
        </div>

        {/* Middle & Right Filters and Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Branch Selector */}
          {isSuper ? (
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl">
              <Building2 className="w-3.5 h-3.5 text-slate-500" />
              <select
                value={activeBranchId}
                onChange={(e) => setActiveBranchId(e.target.value)}
                className="text-xs bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer"
              >
                <option value="ALL">Semua Cabang Klinik</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50/80 border border-emerald-200 rounded-xl text-xs font-bold text-emerald-900">
              <Building2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>{branches.find((b) => b.id === userBranchId)?.name || "Cabang Anda"}</span>
            </div>
          )}

          {/* Filter Highlight Doctor */}
          <select
            value={highlightDoctorId}
            onChange={(e) => setHighlightDoctorId(e.target.value)}
            className="text-xs border border-slate-200 rounded-xl px-3 py-2 bg-white text-slate-700 focus:outline-none focus:border-emerald-600 cursor-pointer"
          >
            <option value="ALL">Semua Dokter</option>
            {activeDoctors.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>

          {/* Poster Button */}
          {isSuper && onOpenPosterModal && (
            <button
              onClick={onOpenPosterModal}
              className="inline-flex items-center gap-1.5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white px-3.5 py-2 rounded-xl text-xs font-semibold shadow-xs transition-all cursor-pointer"
              title="Buat Poster Gambar Jadwal Dokter Mingguan"
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Poster Jadwal</span>
            </button>
          )}

          {/* Manual Modal Button */}
          <button
            onClick={() => {
              onOpenCreateModal({
                branchId: activeBranchId === "ALL" ? (branches[0]?.id || "branch-gebang") : activeBranchId,
                date: weekDays[0]?.dateStr || new Date().toISOString().split("T")[0]
              });
            }}
            className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            id="btn-add-schedule-timetable"
          >
            <Plus className="w-4 h-4" />
            <span>Buat Jadwal</span>
          </button>
        </div>
      </div>

      {/* 2. DRAGGABLE DOCTOR PALETTE (Palet Dokter Siap Dijadwalkan) */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950 text-white p-4 rounded-2xl shadow-sm border border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-emerald-500/20 text-emerald-300 rounded-lg border border-emerald-500/30">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-white tracking-wide flex items-center gap-1.5">
                <span>Palet Dokter (Drag &amp; Drop Jadwal)</span>
                <span className="text-[10px] font-normal px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  {activeDoctors.length} Dokter Siap
                </span>
              </h3>
              <p className="text-[11px] text-slate-300">
                Tarik nama dokter di bawah ini langsung ke dalam kolom <strong>Hari &amp; Shift</strong> pada tabel jadwal:
              </p>
            </div>
          </div>
          <div className="text-[10px] text-emerald-200/80 hidden md:flex items-center gap-1 bg-white/5 px-2.5 py-1 rounded-lg border border-white/10">
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Tarik ke slot untuk menjadwalkan atau geser jadwal yang sudah ada</span>
          </div>
        </div>

        {/* Doctor Badges */}
        <div className="flex items-center gap-2.5 pt-3 overflow-x-auto pb-1">
          {activeDoctors.map((doc) => {
            const isDragging = draggedDoctorId === doc.id;
            return (
              <div
                key={doc.id}
                draggable={!isProcessing}
                onDragStart={(e) => handleDoctorDragStart(e, doc.id)}
                onDragEnd={handleDragEnd}
                className={`group flex items-center gap-2 px-3 py-2 bg-white/10 hover:bg-white/20 active:bg-emerald-600/50 border border-white/15 hover:border-emerald-400 rounded-xl text-xs font-semibold text-white transition-all cursor-grab active:cursor-grabbing select-none shrink-0 shadow-xs ${
                  isDragging ? "opacity-40 scale-95 border-emerald-400 bg-emerald-900/50" : ""
                }`}
                title={`Tarik ${doc.name} ke kolom hari untuk membuat jadwal praktek`}
              >
                <GripVertical className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-300 transition-colors" />
                <div className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-[10px] border border-white/20 shrink-0 overflow-hidden">
                  {doc.photoUrl || doc.avatarUrl || doc.profileImage ? (
                    <img
                      src={doc.photoUrl || doc.avatarUrl || doc.profileImage || ""}
                      alt={doc.name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <span>{doc.name.replace(/^(drg\.|dr\.)\s*/i, "").charAt(0)}</span>
                  )}
                </div>
                <div className="text-left">
                  <div className="font-bold text-[11px] leading-tight text-white group-hover:text-emerald-200">
                    {doc.name}
                  </div>
                  <div className="text-[9px] text-slate-300 font-normal truncate max-w-[130px]">
                    {doc.specialization || "Dokter Gigi"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. TIMETABLE GRID TABLE (JADWAL PELAJARAN 7 HARI x SHIFT) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left min-w-[950px]">
            {/* Table Header: 7 Days of the Week */}
            <thead>
              <tr className="bg-slate-900 text-white border-b border-slate-800">
                <th className="w-44 p-3.5 text-xs font-bold text-slate-300 uppercase tracking-wider border-r border-slate-800 bg-slate-950/90 text-center">
                  <div className="flex items-center justify-center gap-1.5">
                    <Clock className="w-4 h-4 text-emerald-400" />
                    <span>Waktu / Shift</span>
                  </div>
                </th>
                {weekDays.map((day) => (
                  <th
                    key={day.dateStr}
                    className={`p-3 text-center border-r border-slate-800 last:border-r-0 transition-colors ${
                      day.isToday ? "bg-emerald-950/90 text-emerald-200 border-b-2 border-b-emerald-400" : ""
                    }`}
                  >
                    <div className="text-[11px] font-black uppercase tracking-wider">
                      {day.dayName}
                    </div>
                    <div className="text-xs font-bold mt-0.5 flex items-center justify-center gap-1 text-slate-200">
                      <span>{day.formattedDate}</span>
                      {day.isToday && (
                        <span className="px-1.5 py-0.2 rounded text-[9px] bg-emerald-500 text-slate-950 font-extrabold uppercase">
                          Hari Ini
                        </span>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            {/* Table Body: Shift Rows */}
            <tbody className="divide-y divide-slate-200">
              {CLINIC_SHIFTS.map((shift) => (
                <tr key={shift.id} className="hover:bg-slate-50/40 transition-colors">
                  {/* Shift Label Cell (Row Header) */}
                  <td className={`p-3.5 border-r border-slate-200 align-top ${shift.headerBg}`}>
                    <div className="font-bold text-xs flex items-center gap-1.5">
                      <span>{shift.name}</span>
                    </div>
                    <div className="text-[11px] font-mono mt-1 font-semibold flex items-center gap-1 opacity-80">
                      <Clock className="w-3 h-3 shrink-0" />
                      <span>{shift.periodLabel}</span>
                    </div>
                    <p className="text-[10px] mt-2 opacity-70 leading-tight">
                      {shift.id === "shift-pagi"
                        ? "Praktek poli pagi"
                        : shift.id === "shift-sore"
                        ? "Praktek poli malam"
                        : "Sesi panjang / khusus"}
                    </p>
                  </td>

                  {/* 7 Days Dropzone Cells */}
                  {weekDays.map((day) => {
                    const cellKey = `${day.dateStr}_${shift.id}`;
                    const isTargetActive = activeDropTarget === cellKey;
                    const cellSchedules = schedulesByCell.get(cellKey) || [];

                    return (
                      <td
                        key={day.dateStr}
                        onDragOver={(e) => handleDragOver(e, day.dateStr, shift)}
                        onDragLeave={(e) => handleDragLeave(e, day.dateStr, shift)}
                        onDrop={(e) => handleDrop(e, day.dateStr, shift)}
                        className={`p-2 border-r border-slate-200 last:border-r-0 align-top transition-all min-h-[120px] ${
                          day.isToday ? "bg-emerald-50/20" : "bg-white"
                        } ${
                          isTargetActive
                            ? "bg-emerald-100/70 ring-2 ring-emerald-500 ring-inset shadow-inner"
                            : ""
                        }`}
                      >
                        <div className="min-h-[100px] flex flex-col justify-between gap-2">
                          {/* Schedule Cards in Cell */}
                          <div className="space-y-1.5">
                            {cellSchedules.map((sched) => {
                              const doc = doctors.find((d) => d.id === sched.doctorId);
                              const br = branches.find((b) => b.id === sched.branchId);
                              const isDraggingThis = draggedScheduleId === sched.id;

                              return (
                                <div
                                  key={sched.id}
                                  draggable={!isProcessing}
                                  onDragStart={(e) => handleScheduleDragStart(e, sched)}
                                  onDragEnd={handleDragEnd}
                                  className={`group/card relative bg-white border border-slate-200/90 hover:border-emerald-500 rounded-xl p-2 shadow-xs hover:shadow-md transition-all cursor-grab active:cursor-grabbing select-none ${
                                    isDraggingThis ? "opacity-30 scale-95 border-emerald-400" : ""
                                  }`}
                                  title="Geser kartu ini ke hari/shift lain untuk memindahkan jadwal"
                                >
                                  {/* Doctor Info */}
                                  <div className="flex items-start gap-1.5">
                                    <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[9px] flex items-center justify-center shrink-0 border border-emerald-200 overflow-hidden mt-0.5">
                                      {doc?.photoUrl || doc?.avatarUrl || doc?.profileImage ? (
                                        <img
                                          src={doc.photoUrl || doc.avatarUrl || doc.profileImage || ""}
                                          alt=""
                                          className="w-full h-full object-cover"
                                          onError={(e) => {
                                            (e.target as HTMLElement).style.display = "none";
                                          }}
                                        />
                                      ) : (
                                        <span>{doc?.name ? doc.name.replace(/^(drg\.|dr\.)\s*/i, "").charAt(0) : "D"}</span>
                                      )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="font-bold text-[11px] text-slate-900 truncate leading-tight group-hover/card:text-emerald-700">
                                        {doc?.name || sched.doctorId}
                                      </div>
                                      <div className="text-[9px] text-slate-400 truncate">
                                        {doc?.specialization || "Dokter Gigi"}
                                      </div>
                                    </div>

                                    {/* Action button */}
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onScheduleCancel(sched);
                                      }}
                                      className="text-slate-300 hover:text-rose-600 p-0.5 rounded transition-colors cursor-pointer"
                                      title="Batalkan Jadwal"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>

                                  {/* Time & Branch Badges */}
                                  <div className="mt-1.5 flex items-center justify-between gap-1 text-[9px] pt-1 border-t border-slate-100 font-mono">
                                    <span className="font-semibold text-emerald-700 bg-emerald-50 px-1 py-0.5 rounded">
                                      {sched.startTime}-{sched.endTime}
                                    </span>
                                    <span className="text-slate-500 font-sans truncate max-w-[70px] text-[8px]" title={br?.name}>
                                      {br?.name?.replace("Cabang ", "") || sched.branchId}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}

                            {/* Drop highlight helper message */}
                            {isTargetActive && (
                              <div className="p-2 border-2 border-dashed border-emerald-500 rounded-xl bg-emerald-50/90 text-emerald-800 text-[10px] font-bold text-center animate-pulse">
                                ⬇ Lepaskan di sini
                              </div>
                            )}
                          </div>

                          {/* Quick Add Button on Hover when cell is empty or has items */}
                          <button
                            type="button"
                            onClick={() => {
                              onOpenCreateModal({
                                date: day.dateStr,
                                startTime: shift.startTime,
                                endTime: shift.endTime,
                                branchId: activeBranchId === "ALL" ? (branches[0]?.id || "branch-gebang") : activeBranchId
                              });
                            }}
                            className="w-full py-1 text-[10px] font-semibold text-slate-400 hover:text-emerald-700 hover:bg-emerald-50/70 border border-dashed border-transparent hover:border-emerald-300 rounded-lg transition-all flex items-center justify-center gap-1 opacity-0 hover:opacity-100 focus:opacity-100 cursor-pointer"
                            title={`Tambah jadwal dokter pada ${day.dayName}, ${shift.name}`}
                          >
                            <Plus className="w-3 h-3" />
                            <span>+ Jadwalkan</span>
                          </button>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Timetable Footer Guidance */}
        <div className="p-3.5 bg-slate-50 border-t border-slate-200 text-xs text-slate-600 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-ping" />
            <span className="font-medium text-[11px]">
              💡 <strong>Tips Cepat:</strong> Anda dapat menarik (*drag &amp; drop*) dokter dari palet hitam di atas langsung ke kolom hari, atau menggeser kartu dokter antar-hari/shift secara instan.
            </span>
          </div>
          <div className="text-[11px] font-bold text-slate-700">
            Total Sesi Aktif Minggu Ini:{" "}
            <span className="text-emerald-700 font-mono">
              {Array.from(schedulesByCell.values()).reduce((acc, list) => acc + list.length, 0)} Sesi
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
