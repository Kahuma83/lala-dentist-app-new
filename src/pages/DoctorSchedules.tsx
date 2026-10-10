import React, { useState, useMemo } from "react";
import { useApp } from "../context/AppContext";
import { DoctorExcelScheduleGrid } from "../components/DoctorExcelScheduleGrid";
import { DoctorSchedulePosterModal } from "../components/poster/DoctorSchedulePosterModal";
import { OperationalHubTabs } from "../components/common/OperationalHubTabs";
import {
  CalendarRange,
  Plus,
  Copy,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Building2,
  Clock,
  X,
  UserCheck,
  Info
} from "lucide-react";
import {
  DoctorSchedule,
  ScheduleStatus,
  UserRole
} from "../types/domain";

export const DoctorSchedules: React.FC = () => {
  const {
    currentUser,
    selectedBranchId,
    branches,
    doctors,
    doctorSchedules,
    doctorScheduleRepo,
    refreshData
  } = useApp();

  const isSuper = currentUser?.role === UserRole.SUPER_ADMIN;
  const userBranchId = currentUser?.role === UserRole.BRANCH_ADMIN ? currentUser.assignedBranchId : selectedBranchId;

  // Notification Toast
  const [toastMessage, setToastMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const showToast = (text: string, type: "success" | "error" = "success") => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  // Poster Modal
  const [isPosterModalOpen, setIsPosterModalOpen] = useState(false);

  // Quick Add Schedule Modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    doctorId: doctors[0]?.id || "",
    branchId: userBranchId || branches[0]?.id || "branch-gebang",
    date: new Date().toISOString().split("T")[0],
    startTime: "08:00",
    endTime: "14:00",
    notes: ""
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Copy Week Schedule State
  const [isCopyingWeek, setIsCopyingWeek] = useState(false);

  // Handlers for Schedule Actions
  const handleScheduleCreate = async (data: {
    doctorId: string;
    branchId: string;
    date: string;
    startTime: string;
    endTime: string;
    notes?: string;
  }) => {
    try {
      await doctorScheduleRepo.createSchedule(
        {
          doctorId: data.doctorId,
          branchId: data.branchId,
          date: data.date,
          startTime: data.startTime,
          endTime: data.endTime,
          status: ScheduleStatus.ACTIVE,
          notes: data.notes
        },
        currentUser?.role,
        userBranchId
      );
      await refreshData();
      showToast("Jadwal dokter berhasil disimpan!");
    } catch (err: any) {
      showToast(err.message || "Gagal menyimpan jadwal", "error");
      throw err;
    }
  };

  const handleScheduleUpdate = async (id: string, updates: Partial<DoctorSchedule>) => {
    try {
      await doctorScheduleRepo.updateSchedule(
        id,
        updates,
        currentUser?.role,
        userBranchId
      );
      await refreshData();
      showToast("Jadwal dokter berhasil diperbarui!");
    } catch (err: any) {
      showToast(err.message || "Gagal memperbarui jadwal", "error");
      throw err;
    }
  };

  const handleScheduleCancel = async (schedule: DoctorSchedule) => {
    if (!window.confirm(`Yakin ingin membatalkan/menghapus jadwal dokter pada tanggal ${schedule.date}?`)) {
      return;
    }
    try {
      await doctorScheduleRepo.cancelSchedule(
        schedule.id,
        currentUser?.role,
        userBranchId
      );
      await refreshData();
      showToast("Jadwal dokter berhasil dibatalkan");
    } catch (err: any) {
      showToast(err.message || "Gagal membatalkan jadwal", "error");
    }
  };

  // Duplicate current active week's schedules to the next week (Super practical!)
  const handleCopyWeekToNextWeek = async () => {
    const activeSchedules = doctorSchedules.filter((s) => s.status === ScheduleStatus.ACTIVE);
    if (activeSchedules.length === 0) {
      showToast("Belum ada jadwal dokter aktif yang bisa disalin", "error");
      return;
    }

    if (!window.confirm("Salin seluruh jadwal dokter minggu ini ke minggu berikutnya (+7 hari)? Jadwal yang bentrok akan dilewati.")) {
      return;
    }

    setIsCopyingWeek(true);
    let successCount = 0;
    let skippedCount = 0;

    try {
      for (const s of activeSchedules) {
        const currentDate = new Date(s.date);
        currentDate.setDate(currentDate.getDate() + 7);
        const nextDateStr = currentDate.toISOString().split("T")[0];

        try {
          await doctorScheduleRepo.createSchedule(
            {
              doctorId: s.doctorId,
              branchId: s.branchId,
              date: nextDateStr,
              startTime: s.startTime,
              endTime: s.endTime,
              status: ScheduleStatus.ACTIVE,
              notes: s.notes || "Salinan mingguan"
            },
            currentUser?.role,
            userBranchId
          );
          successCount++;
        } catch {
          skippedCount++;
        }
      }

      await refreshData();
      showToast(`Berhasil menyalin ${successCount} jadwal ke minggu depan! (${skippedCount} dilewati/bentrok)`);
    } catch (err: any) {
      showToast("Terjadi kendala saat menyalin jadwal", "error");
    } finally {
      setIsCopyingWeek(false);
    }
  };

  const handleManualAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (addForm.startTime >= addForm.endTime) {
      showToast("Jam mulai harus lebih awal dari jam selesai", "error");
      return;
    }
    setIsSubmitting(true);
    try {
      await handleScheduleCreate({
        doctorId: addForm.doctorId,
        branchId: addForm.branchId,
        date: addForm.date,
        startTime: addForm.startTime,
        endTime: addForm.endTime,
        notes: addForm.notes
      });
      setIsAddModalOpen(false);
      setAddForm((prev) => ({ ...prev, notes: "" }));
    } catch {
      // Toast already shown in handleScheduleCreate
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      <OperationalHubTabs hub="patient_schedule" />

      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg border text-xs font-bold animate-in slide-in-from-bottom-2 ${
            toastMessage.type === "success"
              ? "bg-emerald-900 text-white border-emerald-700"
              : "bg-rose-900 text-white border-rose-700"
          }`}
        >
          {toastMessage.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* 1. Header Page Title & Quick Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-[#faf6ec] text-[#8a6f27] rounded-xl border border-[#ebd4a8]/50">
              <CalendarRange className="w-6 h-6 text-[#c5a059]" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-[#17233C] tracking-tight">
                Jadwal Praktik Dokter
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Format kolom Excel sederhana — klik kotak hari untuk menambah atau mengubah jadwal praktik secara instan.
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Quick Add Button */}
          <button
            onClick={() => {
              setAddForm({
                doctorId: doctors.find((d) => d.active ?? d.isActive ?? true)?.id || doctors[0]?.id || "",
                branchId: userBranchId || branches[0]?.id || "branch-gebang",
                date: new Date().toISOString().split("T")[0],
                startTime: "08:00",
                endTime: "14:00",
                notes: ""
              });
              setIsAddModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-[#c5a059] hover:bg-[#b88a2a] text-white rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Jadwal</span>
          </button>

          {/* Copy Week Button */}
          <button
            onClick={handleCopyWeekToNextWeek}
            disabled={isCopyingWeek}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all border border-slate-200 cursor-pointer disabled:opacity-50"
            title="Duplikasi jadwal minggu ini ke minggu depan"
          >
            <Copy className="w-3.5 h-3.5 text-slate-500" />
            <span>{isCopyingWeek ? "Menyalin..." : "Salin ke Minggu Depan"}</span>
          </button>

          {/* Poster Button */}
          {isSuper && (
            <button
              onClick={() => setIsPosterModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Studio Poster</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Quick Tips Bar */}
      <div className="bg-[#faf6ec]/70 border border-[#ebd4a8]/50 rounded-xl px-4 py-3 flex items-center gap-3 text-xs text-[#8a6f27]">
        <Info className="w-4 h-4 text-[#c5a059] shrink-0" />
        <div className="flex-1">
          <span className="font-bold">Tips Cepat:</span> Klik langsung pada sel hari di bawah untuk menambahkan atau mengubah jam praktik dokter. Data otomatis tersimpan dan diperbarui.
        </div>
      </div>

      {/* 3. The Excel-Style Schedule Grid Component */}
      <DoctorExcelScheduleGrid
        doctors={doctors}
        branches={branches}
        schedules={doctorSchedules}
        currentUser={currentUser}
        selectedBranchId={userBranchId}
        onScheduleCreate={handleScheduleCreate}
        onScheduleUpdate={handleScheduleUpdate}
        onScheduleCancel={handleScheduleCancel}
        onOpenPosterModal={isSuper ? () => setIsPosterModalOpen(true) : undefined}
      />

      {/* 4. Manual Quick Add Schedule Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CalendarRange className="w-4 h-4 text-[#c5a059]" />
                <h3 className="font-bold text-sm text-[#17233C]">Tambah Jadwal Dokter</h3>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleManualAddSubmit} className="p-5 space-y-4">
              {/* Doctor Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Pilih Dokter</label>
                <select
                  value={addForm.doctorId}
                  onChange={(e) => setAddForm({ ...addForm, doctorId: e.target.value })}
                  className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2.5 bg-white focus:outline-none focus:border-[#c5a059] font-semibold"
                  required
                >
                  {doctors
                    .filter((d) => d.active ?? d.isActive ?? true)
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name || d.fullName} ({d.specialization || "Umum"})
                      </option>
                    ))}
                </select>
              </div>

              {/* Branch Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Cabang Klinik</label>
                <select
                  value={addForm.branchId}
                  onChange={(e) => setAddForm({ ...addForm, branchId: e.target.value })}
                  disabled={!isSuper && !!currentUser?.assignedBranchId}
                  className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2.5 bg-white focus:outline-none focus:border-[#c5a059] font-semibold disabled:bg-slate-50"
                  required
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Date Input */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Tanggal Praktik</label>
                <input
                  type="date"
                  value={addForm.date}
                  onChange={(e) => setAddForm({ ...addForm, date: e.target.value })}
                  className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2.5 bg-white focus:outline-none focus:border-[#c5a059] font-semibold"
                  required
                />
              </div>

              {/* Time Slots */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Jam Mulai</label>
                  <input
                    type="time"
                    value={addForm.startTime}
                    onChange={(e) => setAddForm({ ...addForm, startTime: e.target.value })}
                    className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2.5 bg-white focus:outline-none focus:border-[#c5a059] font-semibold"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Jam Selesai</label>
                  <input
                    type="time"
                    value={addForm.endTime}
                    onChange={(e) => setAddForm({ ...addForm, endTime: e.target.value })}
                    className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2.5 bg-white focus:outline-none focus:border-[#c5a059] font-semibold"
                    required
                  />
                </div>
              </div>

              {/* Quick Preset Buttons */}
              <div className="flex items-center gap-2 pt-1">
                <span className="text-[11px] text-slate-500 font-semibold">Preset Jam:</span>
                <button
                  type="button"
                  onClick={() => setAddForm({ ...addForm, startTime: "08:00", endTime: "14:00" })}
                  className="text-[10px] px-2 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 font-bold hover:bg-amber-100"
                >
                  Pagi (08-14)
                </button>
                <button
                  type="button"
                  onClick={() => setAddForm({ ...addForm, startTime: "14:00", endTime: "20:00" })}
                  className="text-[10px] px-2 py-1 rounded-lg bg-indigo-50 text-indigo-800 border border-indigo-200 font-bold hover:bg-indigo-100"
                >
                  Sore (14-20)
                </button>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Catatan (Opsional)</label>
                <input
                  type="text"
                  placeholder="Misal: Khusus scaling & behel"
                  value={addForm.notes}
                  onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })}
                  className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2.5 bg-white focus:outline-none focus:border-[#c5a059]"
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 text-xs font-bold text-white bg-[#c5a059] hover:bg-[#b88a2a] rounded-xl shadow-xs transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? "Menyimpan..." : "Simpan Jadwal"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. Studio Poster Modal */}
      {isPosterModalOpen && (
        <DoctorSchedulePosterModal
          isOpen={isPosterModalOpen}
          onClose={() => setIsPosterModalOpen(false)}
        />
      )}
    </div>
  );
};
