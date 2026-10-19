import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, CalendarDays, CheckCircle2, RefreshCw, ShieldCheck, UserRound, XCircle } from "lucide-react";
import { useApp } from "../context/AppContext";
import { supabase } from "../lib/supabase";
import { StaffPosition, UserRole } from "../types/domain";

type AbsenceRequest = {
  id: string;
  staff_id: string;
  request_type: "SICK" | "LEAVE" | "PERMISSION";
  start_date: string;
  end_date: string;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reviewer_note: string | null;
  created_at: string;
};

type ReplacementAssignment = {
  id: string;
  absence_request_id: string;
  covered_date: string;
  branch_id: string;
  absent_staff_id: string;
  replacement_staff_id: string;
  absent_base_salary_snapshot: number;
  amount_snapshot: number;
  work_confirmed_at: string | null;
};

const requestTypeLabel: Record<AbsenceRequest["request_type"], string> = {
  SICK: "Sakit",
  LEAVE: "Cuti",
  PERMISSION: "Izin"
};

const money = (amount: number) => `Rp${Math.round(amount).toLocaleString("id-ID")}`;

export const AbsenceRequestManager: React.FC = () => {
  const { currentUser, staff, branches } = useApp();
  const [requests, setRequests] = useState<AbsenceRequest[]>([]);
  const [assignments, setAssignments] = useState<ReplacementAssignment[]>([]);
  const [replacementByRequest, setReplacementByRequest] = useState<Record<string, string>>({});
  const [reviewNoteByRequest, setReviewNoteByRequest] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const [requestsResult, assignmentsResult] = await Promise.all([
        supabase.from("staff_absence_requests")
          .select("id,staff_id,request_type,start_date,end_date,reason,status,reviewer_note,created_at")
          .order("created_at", { ascending: false }).limit(100),
        supabase.from("staff_replacement_assignments")
          .select("id,absence_request_id,covered_date,branch_id,absent_staff_id,replacement_staff_id,absent_base_salary_snapshot,amount_snapshot,work_confirmed_at")
          .order("covered_date", { ascending: false }).limit(100)
      ]);
      if (requestsResult.error) throw new Error(`Gagal memuat pengajuan: ${requestsResult.error.message}`);
      if (assignmentsResult.error) throw new Error(`Gagal memuat penugasan pengganti: ${assignmentsResult.error.message}`);
      setRequests((requestsResult.data || []) as AbsenceRequest[]);
      setAssignments((assignmentsResult.data || []) as ReplacementAssignment[]);
    } catch (loadError: unknown) {
      setErrorMessage(loadError instanceof Error ? loadError.message : "Gagal memuat pengajuan ketidakhadiran.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const staffById = useMemo(() => new Map(staff.map((person) => [person.id, person])), [staff]);
  const branchById = useMemo(() => new Map(branches.map((branch) => [branch.id, branch.name])), [branches]);

  if (currentUser?.role !== UserRole.SUPER_ADMIN) {
    return <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800">Hanya Super Admin yang dapat meninjau pengajuan dan penugasan pengganti.</div>;
  }

  const eligibleReplacements = (request: AbsenceRequest) => {
    const absent = staffById.get(request.staff_id);
    if (!absent || !absent.branchId || ![StaffPosition.BRANCH_ADMIN, StaffPosition.ASSISTANT].includes(absent.position)) return [];
    return staff.filter((candidate) =>
      candidate.active &&
      candidate.id !== absent.id &&
      candidate.branchId === absent.branchId &&
      candidate.position === absent.position
    );
  };

  const reviewRequest = async (request: AbsenceRequest, approve: boolean) => {
    const reviewerNote = (reviewNoteByRequest[request.id] || "").trim();
    if (!approve && reviewerNote.length < 3) {
      setErrorMessage("Alasan penolakan wajib diisi (minimal 3 karakter).");
      return;
    }
    setBusyId(request.id);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const { error } = await supabase.rpc("review_staff_absence_request", {
        p_request_id: request.id,
        p_approve: approve,
        p_reviewer_note: reviewerNote || null,
        p_replacement_staff_id: approve ? replacementByRequest[request.id] || null : null
      });
      if (error) throw new Error(`Gagal memproses pengajuan: ${error.message}`);
      setSuccessMessage(approve ? "Pengajuan disetujui; absensi terjadwal dan penugasan yang dipilih telah dicatat." : "Pengajuan ditolak.");
      await loadData();
    } catch (reviewError: unknown) {
      setErrorMessage(reviewError instanceof Error ? reviewError.message : "Gagal memproses pengajuan.");
    } finally {
      setBusyId(null);
    }
  };

  const confirmReplacementWork = async (assignment: ReplacementAssignment) => {
    if (!window.confirm("Pastikan pegawai benar-benar telah menyelesaikan tugas pada tanggal ini. Konfirmasi tidak dapat dibatalkan dan akan memasukkan earning ke payroll.")) {
      return;
    }
    setBusyId(assignment.id);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const { error } = await supabase.rpc("confirm_staff_replacement_work", { p_assignment_id: assignment.id });
      if (error) throw new Error(`Gagal mengonfirmasi tugas pengganti: ${error.message}`);
      setSuccessMessage("Tugas pengganti dikonfirmasi; earning akan masuk pada payroll periode tanggal tugas.");
      await loadData();
    } catch (confirmError: unknown) {
      setErrorMessage(confirmError instanceof Error ? confirmError.message : "Gagal mengonfirmasi tugas pengganti.");
    } finally {
      setBusyId(null);
    }
  };

  const pending = requests.filter((request) => request.status === "PENDING");

  return (
    <section className="space-y-5" id="absence-request-manager">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><CalendarDays className="h-5 w-5 text-blue-600" />Pengajuan Cuti, Izin & Sakit</h2>
          <p className="mt-1 text-xs text-slate-500">Semua pengajuan diputuskan Super Admin. Absensi disimpan hanya untuk hari kerja terjadwal.</p>
        </div>
        <button type="button" onClick={() => void loadData()} disabled={isLoading} className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 disabled:opacity-50" aria-label="Muat ulang pengajuan">
          <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
        </button>
      </div>
      {errorMessage && <div role="alert" className="flex gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800"><AlertCircle className="h-4 w-4 shrink-0" />{errorMessage}</div>}
      {successMessage && <div role="status" className="flex gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800"><CheckCircle2 className="h-4 w-4 shrink-0" />{successMessage}</div>}

      {isLoading ? <div className="py-8 text-center text-xs text-slate-500"><RefreshCw className="mx-auto mb-2 h-5 w-5 animate-spin" />Memuat data...</div> : pending.length === 0
        ? <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-xs text-slate-500">Tidak ada pengajuan yang menunggu persetujuan.</div>
        : <div className="grid gap-3">
          {pending.map((request) => {
            const person = staffById.get(request.staff_id);
            const replacements = eligibleReplacements(request);
            const currentReplacement = replacementByRequest[request.id] || "";
            return (
              <article key={request.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-2 text-sm font-bold text-slate-900"><UserRound className="h-4 w-4 text-slate-400" />{person?.fullName || request.staff_id}</p>
                    <p className="mt-1 text-xs text-slate-600">{requestTypeLabel[request.request_type]} · {request.start_date}{request.end_date !== request.start_date ? ` – ${request.end_date}` : ""}</p>
                    <p className="mt-2 whitespace-pre-wrap text-xs text-slate-700">{request.reason}</p>
                  </div>
                  <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800">Menunggu</span>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <label className="grid gap-1 text-xs font-semibold text-slate-700">
                    Pengganti (opsional)
                    <select
                      value={currentReplacement}
                      onChange={(event) => setReplacementByRequest((current) => ({ ...current, [request.id]: event.target.value }))}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 font-normal"
                    >
                      <option value="">Tanpa pengganti</option>
                      {replacements.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.fullName} · {branchById.get(candidate.branchId || "") || "Cabang"}</option>)}
                    </select>
                    <span className="font-normal text-slate-500">
                      {replacements.length
                        ? "Upah per hari = gaji pokok pegawai yang digantikan ÷ 25; Super Admin perlu mengonfirmasi hari kerja untuk membayarkannya."
                        : "Pengganti hanya dapat dipilih untuk Admin Cabang/Asisten dengan jabatan dan cabang yang sama."}
                    </span>
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-slate-700">
                    Catatan keputusan
                    <textarea
                      rows={2}
                      value={reviewNoteByRequest[request.id] || ""}
                      onChange={(event) => setReviewNoteByRequest((current) => ({ ...current, [request.id]: event.target.value }))}
                      placeholder="Wajib diisi jika menolak"
                      className="rounded-lg border border-slate-200 px-3 py-2 font-normal"
                    />
                  </label>
                </div>
                <div className="mt-3 flex justify-end gap-2">
                  <button type="button" disabled={busyId === request.id} onClick={() => void reviewRequest(request, false)} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 disabled:opacity-50"><XCircle className="h-4 w-4" />Tolak</button>
                  <button type="button" disabled={busyId === request.id} onClick={() => void reviewRequest(request, true)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"><ShieldCheck className="h-4 w-4" />Setujui</button>
                </div>
              </article>
            );
          })}
        </div>}

      <div className="border-t border-slate-200 pt-5">
        <h3 className="text-sm font-bold text-slate-900">Penugasan Pengganti</h3>
        <p className="mt-1 text-xs text-slate-500">Tugas harus dikonfirmasi selesai sebelum earning ditambahkan ke payroll pengganti.</p>
        {assignments.length === 0 ? <p className="py-6 text-center text-xs text-slate-500">Belum ada penugasan pengganti.</p> : (
          <div className="mt-3 grid gap-2">
            {assignments.map((assignment) => (
              <article key={assignment.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3">
                <div className="text-xs">
                  <strong>{staffById.get(assignment.replacement_staff_id)?.fullName || assignment.replacement_staff_id}</strong>
                  <span className="ml-2 text-slate-500">menggantikan {staffById.get(assignment.absent_staff_id)?.fullName || assignment.absent_staff_id}</span>
                  <div className="mt-1 text-slate-600">{assignment.covered_date} · {branchById.get(assignment.branch_id) || "Cabang"} · Tarif harian {money(assignment.amount_snapshot)} (gaji snapshot {money(assignment.absent_base_salary_snapshot)} ÷ 25)</div>
                </div>
                {assignment.work_confirmed_at
                  ? <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">Dikonfirmasi bekerja</span>
                  : <button type="button" disabled={busyId === assignment.id} onClick={() => void confirmReplacementWork(assignment)} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Konfirmasi bekerja</button>}
              </article>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-slate-200 pt-5">
        <h3 className="text-sm font-bold text-slate-900">Riwayat Pengajuan</h3>
        <div className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {requests.filter((request) => request.status !== "PENDING").length === 0
            ? <p className="p-5 text-center text-xs text-slate-500">Belum ada pengajuan yang diputuskan.</p>
            : requests.filter((request) => request.status !== "PENDING").map((request) => (
              <div key={request.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-xs">
                <span><strong>{staffById.get(request.staff_id)?.fullName || request.staff_id}</strong> · {requestTypeLabel[request.request_type]} · {request.start_date}{request.end_date !== request.start_date ? ` – ${request.end_date}` : ""}</span>
                <span className={request.status === "APPROVED" ? "font-semibold text-emerald-700" : "font-semibold text-rose-700"}>{request.status === "APPROVED" ? "Disetujui" : "Ditolak"}{request.reviewer_note ? ` · ${request.reviewer_note}` : ""}</span>
              </div>
            ))}
        </div>
      </div>
    </section>
  );
};
