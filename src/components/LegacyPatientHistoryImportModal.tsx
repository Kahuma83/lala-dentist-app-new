import React, { useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  FileSpreadsheet,
  History,
  LoaderCircle,
  Upload,
  X
} from "lucide-react";
import { DentalBranch, PatientProfile, UserRole } from "../types/domain";
import { PatientRepository, VisitRepository } from "../repositories/interfaces";
import {
  executeLegacyPatientHistoryImport,
  LegacyPatientHistoryImportPreview,
  LegacyPatientHistoryImportResult,
  parseLegacyPatientHistoryWorkbook
} from "../utils/legacyPatientHistoryImport";

interface LegacyPatientHistoryImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  branches: DentalBranch[];
  patients: PatientProfile[];
  patientRepo: PatientRepository;
  visitRepo: VisitRepository;
  currentUserRole: UserRole;
  userBranchId?: string | null;
  onImportComplete: () => Promise<void>;
}

export const LegacyPatientHistoryImportModal: React.FC<LegacyPatientHistoryImportModalProps> = ({
  isOpen,
  onClose,
  branches,
  patients,
  patientRepo,
  visitRepo,
  currentUserRole,
  userBranchId,
  onImportComplete
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [branchId, setBranchId] = useState("");
  const [preview, setPreview] = useState<LegacyPatientHistoryImportPreview | null>(null);
  const [result, setResult] = useState<LegacyPatientHistoryImportResult | null>(null);
  const [error, setError] = useState("");
  const [refreshError, setRefreshError] = useState("");
  const [isReading, setIsReading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [identityMatchesConfirmed, setIdentityMatchesConfirmed] = useState(false);

  const validVisitCount = useMemo(
    () => preview?.visitRows.filter((row) => row.isValid).length || 0,
    [preview]
  );
  const validProfileCount = useMemo(
    () => preview?.profileRows.filter((row) => row.isValid).length || 0,
    [preview]
  );
  const profilesToCreateCount = useMemo(
    () => preview?.profileRows.filter((row) => row.isValid && !row.existingPatientId).length || 0,
    [preview]
  );
  const existingProfileCount = useMemo(
    () => preview?.profileRows.filter((row) => row.isValid && row.existingPatientId).length || 0,
    [preview]
  );
  const identityLinkCount = useMemo(
    () => preview?.profileRows.filter(
      (row) => row.isValid && row.matchMethod === "identity_document"
    ).length || 0,
    [preview]
  );

  if (!isOpen) return null;

  const handleFileChange = async (file?: File, selectedBranchId = branchId) => {
    setSelectedFile(file || null);
    setPreview(null);
    setResult(null);
    setError("");
    setRefreshError("");
    setConfirmed(false);
    setIdentityMatchesConfirmed(false);
    if (!file) return;
    if (!/\.(xlsx|xls)$/i.test(file.name)) {
      setError("Pilih workbook Excel .xlsx atau .xls yang memiliki lembar Data dan Profil Pasien.");
      return;
    }
    if (!selectedBranchId) {
      setError("Pilih cabang terlebih dahulu agar No. RM dicocokkan pada cabang yang benar.");
      return;
    }

    setIsReading(true);
    try {
      const parsed = await parseLegacyPatientHistoryWorkbook(file, patients, selectedBranchId);
      setPreview(parsed);
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : "Gagal membaca file Excel.");
    } finally {
      setIsReading(false);
    }
  };

  const handleImport = async () => {
    if (!preview || !branchId || !confirmed || validVisitCount === 0 || isImporting) return;
    setIsImporting(true);
    setError("");
    setRefreshError("");
    try {
      const importResult = await executeLegacyPatientHistoryImport(
        patientRepo,
        visitRepo,
        preview,
        branchId,
        currentUserRole,
        userBranchId,
        identityMatchesConfirmed
      );
      setResult(importResult);
      try {
        await onImportComplete();
      } catch (refreshFailure) {
        setRefreshError(
          refreshFailure instanceof Error
            ? `Impor selesai, tetapi data layar belum berhasil diperbarui: ${refreshFailure.message}`
            : "Impor selesai, tetapi data layar belum berhasil diperbarui."
        );
      }
    } catch (importFailure) {
      setError(importFailure instanceof Error ? importFailure.message : "Impor riwayat gagal dijalankan.");
    } finally {
      setIsImporting(false);
    }
  };

  const invalidProfiles = preview?.profileRows.filter((row) => !row.isValid) || [];
  const invalidVisits = preview?.visitRows.filter((row) => !row.isValid) || [];
  const previewRows = preview?.visitRows.slice(0, 10) || [];
  const hasBlockingReviewIssues = !!preview?.blockingReviewIssues.length;

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 md:p-6 overflow-y-auto">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-2xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden">
        <div className="bg-gradient-to-r from-indigo-700 to-blue-800 p-5 text-white flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/10 rounded-xl border border-white/20">
              <History className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold">Impor Riwayat Kunjungan Lama</h2>
              <p className="text-xs text-blue-100 mt-0.5">
                Profil dan kunjungan diproses terpisah; pencocokan memakai No. RM pada cabang yang dipilih.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-lg"
            aria-label="Tutup impor riwayat"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 md:p-6 overflow-y-auto flex-1 space-y-5">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
            Impor ini membuat profil pasien yang belum ada dan catatan kunjungan berstatus selesai.
            Diagnosis, objektif, dokter, dan nama tindakan lama disimpan sebagai keterangan historis
            pada kunjungan; tidak dipetakan menjadi tindakan klinis, tagihan, antrean, atau pemakaian stok.
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                File Excel (.xlsx / .xls)
              </label>
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(event) => void handleFileChange(event.target.files?.[0])}
              />
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="w-full border-2 border-dashed border-slate-300 hover:border-indigo-400 rounded-xl p-4 text-left transition-colors"
                disabled={isReading || isImporting}
              >
                <span className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                  {isReading ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4 text-indigo-600" />}
                  {selectedFile ? selectedFile.name : "Pilih workbook yang memiliki lembar Data"}
                </span>
                {selectedFile && (
                  <span className="block mt-1 pl-6 text-[10px] text-slate-500">
                    {(selectedFile.size / 1024).toFixed(1)} KB
                  </span>
                )}
              </button>
            </div>
            <div>
              <label htmlFor="legacy-history-branch" className="block text-xs font-bold text-slate-700 mb-1.5">
                Cabang untuk riwayat lama
              </label>
              <select
                id="legacy-history-branch"
                value={branchId}
                onChange={(event) => {
                  const selectedBranchId = event.target.value;
                  setBranchId(selectedBranchId);
                  setPreview(null);
                  setResult(null);
                  setConfirmed(false);
                  setIdentityMatchesConfirmed(false);
                  setError("");
                  if (selectedFile && selectedBranchId) {
                    void handleFileChange(selectedFile, selectedBranchId);
                  }
                }}
                className="w-full border border-slate-300 rounded-xl p-3 text-xs bg-white"
                disabled={isImporting}
              >
                <option value="">Pilih cabang secara manual</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[10px] text-slate-500">
                RM yang sama di cabang berbeda tidak dicocokkan otomatis.
              </p>
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 flex gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {preview && (
            <div className="space-y-4 border-t border-slate-200 pt-4">
              <div>
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-indigo-600" /> Pratinjau sebelum simpan
                </h3>
                <p className="text-[11px] text-slate-500 mt-1">
                  Hanya isi lembar Data yang dibaca dan diimpor.
                  {preview.ignoredSheets.length > 0 && ` Lembar lain diabaikan: ${preview.ignoredSheets.join(", ")}.`}
                </p>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center">
                <div className="rounded-lg border border-slate-200 p-2">
                  <span className="block text-[10px] text-slate-500">Profil baru</span>
                  <strong className="text-sm text-slate-800">{profilesToCreateCount}</strong>
                </div>
                <div className="rounded-lg border border-slate-200 p-2">
                  <span className="block text-[10px] text-slate-500">Profil sudah ada</span>
                  <strong className="text-sm text-slate-800">{existingProfileCount}</strong>
                </div>
                <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-2">
                  <span className="block text-[10px] text-indigo-700">Kunjungan siap</span>
                  <strong className="text-sm text-indigo-800">{validVisitCount}</strong>
                </div>
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-2">
                  <span className="block text-[10px] text-rose-700">Baris kunjungan perlu cek</span>
                  <strong className="text-sm text-rose-800">{invalidVisits.length}</strong>
                </div>
              </div>

              {invalidProfiles.length > 0 && (
                <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
                  {invalidProfiles.length} baris profil bermasalah tidak dibuat. Tinjau No. RM/Nama pada file sumber.
                </p>
              )}
              {preview.blockingReviewIssues.length > 0 && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-[11px] text-rose-800">
                  <p className="font-bold">Impor ditahan sampai temuan ditinjau:</p>
                  <ul className="mt-1 list-disc pl-4 space-y-1">
                    {preview.blockingReviewIssues.map((issue) => <li key={issue}>{issue}</li>)}
                  </ul>
                  <p className="mt-2">
                    Perbaiki salinan workbook, jangan hapus lembar temuan tanpa meninjau isinya, lalu unggah kembali.
                  </p>
                </div>
              )}
              {preview.reviewWarnings.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-900">
                  <p className="font-bold flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" /> Catatan pemeriksaan
                  </p>
                  <ul className="mt-1 list-disc pl-4 space-y-1">
                    {preview.reviewWarnings.map((warning) => <li key={warning}>{warning}</li>)}
                  </ul>
                </div>
              )}

              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="bg-slate-50 px-3 py-2 text-[11px] font-bold text-slate-700">
                  Contoh maksimal 10 baris kunjungan (data pasien tidak ditampilkan)
                </div>
                <div className="max-h-48 overflow-auto">
                  <table className="w-full text-left text-[11px]">
                    <thead className="sticky top-0 bg-white text-slate-500 border-b border-slate-100">
                      <tr>
                        <th className="p-2">Baris Excel</th>
                        <th className="p-2">Tanggal</th>
                        <th className="p-2">Status</th>
                        <th className="p-2">Catatan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {previewRows.map((row) => (
                        <tr key={row.rowNumber}>
                          <td className="p-2 font-mono">{row.rowNumber}</td>
                          <td className="p-2">{row.visitDateTime ? row.visitDateTime.slice(0, 10) : "—"}</td>
                          <td className={`p-2 font-semibold ${row.isValid ? "text-emerald-700" : "text-rose-700"}`}>
                            {row.isValid ? "Siap" : "Perlu cek"}
                          </td>
                          <td className="p-2 text-slate-600">
                            {row.isValid ? "Detail historis akan disimpan pada catatan kunjungan" : row.errors.join("; ")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {validProfileCount > 0 && (
                <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-700">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(event) => setConfirmed(event.target.checked)}
                    className="mt-0.5 accent-indigo-600"
                    disabled={isImporting || !!result}
                  />
                  <span>
                    Saya sudah meninjau pratinjau, memastikan cabang benar, dan memahami bahwa diagnosis serta
                    tindakan disimpan sebagai keterangan historis—bukan rekam medis klinis terstruktur.
                  </span>
                </label>
              )}

              {identityLinkCount > 0 && (
                <label className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-900">
                  <input
                    type="checkbox"
                    checked={identityMatchesConfirmed}
                    onChange={(event) => setIdentityMatchesConfirmed(event.target.checked)}
                    className="mt-0.5 accent-amber-600"
                    disabled={isImporting || !!result}
                  />
                  <span>
                    {identityLinkCount} profil akan ditautkan ke pasien yang sudah ada karena NIK cocok persis.
                    Saya sudah memverifikasi identitas dan setuju RM cabang dari file ditautkan ke profil tersebut.
                  </span>
                </label>
              )}

              {result && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-2">
                  <h4 className="text-xs font-bold text-emerald-800 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" /> Proses impor selesai
                  </h4>
                  <p className="text-[11px] text-slate-700">
                    Profil dibuat: {result.profilesCreated}; sudah ada: {result.profilesAlreadyPresent}; gagal:
                    {" "}{result.profilesFailed}. Kunjungan dibuat: {result.visitsCreated}; sudah pernah diimpor:
                    {" "}{result.visitsAlreadyImported}; gagal: {result.visitsFailed}.
                  </p>
                  {refreshError && <p className="text-[11px] text-amber-800">{refreshError}</p>}
                  {result.errors.length > 0 && (
                    <details className="text-[11px] text-rose-800">
                      <summary className="cursor-pointer font-semibold">
                        Lihat {result.errors.length} baris yang gagal
                      </summary>
                      <ul className="mt-2 space-y-1 max-h-32 overflow-auto">
                        {result.errors.slice(0, 30).map((item, index) => <li key={index}>{item}</li>)}
                      </ul>
                    </details>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-slate-200 p-4 flex items-center justify-end gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            {result ? "Tutup" : "Batal"}
          </button>
          {!result && (
            <button
              type="button"
              onClick={() => void handleImport()}
              disabled={!preview || hasBlockingReviewIssues || !branchId || !confirmed || (identityLinkCount > 0 && !identityMatchesConfirmed) || validVisitCount === 0 || isImporting || isReading}
              className="px-4 py-2 rounded-lg bg-indigo-700 text-white text-xs font-bold hover:bg-indigo-800 disabled:bg-slate-300 disabled:cursor-not-allowed inline-flex items-center gap-2"
            >
              {isImporting && <LoaderCircle className="w-3.5 h-3.5 animate-spin" />}
              {isImporting
                ? "Menyimpan riwayat..."
                : hasBlockingReviewIssues
                  ? "Selesaikan temuan sebelum impor"
                  : `Impor ${validVisitCount} kunjungan`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
