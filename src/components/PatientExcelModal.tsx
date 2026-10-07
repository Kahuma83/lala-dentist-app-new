import React, { useState, useRef } from "react";
import {
  X,
  FileSpreadsheet,
  Download,
  Upload,
  FileDown,
  CheckCircle,
  AlertTriangle,
  AlertCircle,
  HelpCircle,
  RefreshCw,
  Search,
  Filter,
  Users,
  ShieldCheck,
  ChevronRight,
  Database,
  Building2
} from "lucide-react";
import { PatientProfile, DentalBranch, UserRole } from "../types/domain";
import {
  ParsedPatientResult,
  ParsedPatientRow,
  ImportPatientOptions,
  ImportPatientExecutionResult,
  exportPatientsToExcel,
  downloadPatientExcelTemplate,
  parsePatientExcelFile,
  executePatientImport
} from "../utils/excelPatientUtils";
import { PatientRepository } from "../repositories/interfaces";

interface PatientExcelModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: "export" | "import";
  allPatients: PatientProfile[];
  filteredPatients: PatientProfile[];
  branches: DentalBranch[];
  patientRepo: PatientRepository;
  currentUserRole?: UserRole;
  userBranchId?: string | null;
  onImportSuccess: (result: ImportPatientExecutionResult) => void;
}

export const PatientExcelModal: React.FC<PatientExcelModalProps> = ({
  isOpen,
  onClose,
  initialTab = "import",
  allPatients,
  filteredPatients,
  branches,
  patientRepo,
  currentUserRole,
  userBranchId,
  onImportSuccess
}) => {
  const [activeTab, setActiveTab] = useState<"export" | "import">(initialTab);

  // EXPORT STATE
  const [exportScope, setExportScope] = useState<"all" | "filtered">("all");
  const [exportCustomFilename, setExportCustomFilename] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccessMsg, setExportSuccessMsg] = useState<string | null>(null);

  // IMPORT STATE
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsingLoading, setParsingLoading] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parseResult, setParseResult] = useState<ParsedPatientResult | null>(null);

  // Import options
  const [duplicateStrategy, setDuplicateStrategy] = useState<"skip" | "update" | "create_new_rm">("skip");
  const [defaultBranchId, setDefaultBranchId] = useState<string>(
    userBranchId || branches[0]?.id || "branch-gebang"
  );
  const [previewFilter, setPreviewFilter] = useState<"all" | "valid" | "duplicate" | "invalid">("all");
  const [previewSearch, setPreviewSearch] = useState("");

  // Execution state
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<number>(0);
  const [importResult, setImportResult] = useState<ImportPatientExecutionResult | null>(null);

  if (!isOpen) return null;

  // Handle Export Action
  const handleDoExport = () => {
    setIsExporting(true);
    setExportSuccessMsg(null);
    try {
      const dataToExport = exportScope === "all" ? allPatients : filteredPatients;
      const today = new Date().toISOString().split("T")[0];
      const customName = exportCustomFilename.trim()
        ? `${exportCustomFilename.trim().replace(/\.xlsx$/i, "")}.xlsx`
        : `Data-Pasien-Lala-Dentist-${exportScope === "filtered" ? "Filter-" : ""}${today}.xlsx`;

      exportPatientsToExcel(dataToExport, branches, customName);
      setExportSuccessMsg(`Berhasil mengekspor ${dataToExport.length} data pasien ke file "${customName}"`);
    } catch (err: any) {
      alert(err.message || "Gagal melakukan export Excel");
    } finally {
      setIsExporting(false);
    }
  };

  // Handle File Selected for Import
  const handleFileChange = async (file: File) => {
    if (!file) return;
    setSelectedFile(file);
    setParsingLoading(true);
    setParseError(null);
    setParseResult(null);
    setImportResult(null);

    try {
      const res = await parsePatientExcelFile(file, allPatients, branches, defaultBranchId);
      setParseResult(res);
    } catch (err: any) {
      setParseError(err.message || "Gagal membaca file Excel. Pastikan format file sesuai.");
    } finally {
      setParsingLoading(false);
    }
  };

  // Drag & Drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  // Handle Execute Import
  const handleDoImport = async () => {
    if (!parseResult || parseResult.validRows.length === 0) return;

    setIsImporting(true);
    setImportProgress(10);

    try {
      const options: ImportPatientOptions = {
        duplicateStrategy,
        defaultBranchId,
        currentUserRole,
        userBranchId
      };

      setImportProgress(40);
      const result = await executePatientImport(patientRepo, parseResult.validRows, options);
      setImportProgress(100);
      setImportResult(result);
      onImportSuccess(result);
    } catch (err: any) {
      setParseError(err.message || "Gagal memproses impor data pasien.");
    } finally {
      setIsImporting(false);
    }
  };

  // Filtered rows for preview table
  const previewRows = (parseResult?.rawRows || []).map((_, idx) => {
    const allParsed = [...(parseResult?.validRows || []), ...(parseResult?.invalidRows || [])];
    return allParsed.find((r) => r.index === idx + 1);
  }).filter((r): r is ParsedPatientRow => {
    if (!r) return false;
    if (previewFilter === "valid" && !r.isValid) return false;
    if (previewFilter === "duplicate" && !r.isDuplicateRM && !r.isDuplicatePhone) return false;
    if (previewFilter === "invalid" && r.isValid) return false;

    if (previewSearch.trim()) {
      const q = previewSearch.toLowerCase();
      const matchName = (r.name || "").toLowerCase().includes(q);
      const matchPhone = (r.phone || "").toLowerCase().includes(q);
      const matchRM = (r.medicalRecordNumber || "").toLowerCase().includes(q);
      return matchName || matchPhone || matchRM;
    }
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 md:p-6 overflow-y-auto">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-2xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-scale-in">
        
        {/* MODAL HEADER */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-700 p-5 text-white flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/10 backdrop-blur-md rounded-xl border border-white/20">
              <FileSpreadsheet className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold flex items-center gap-2">
                Export & Import Data Pasien Excel
                <span className="bg-white/20 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">
                  .xlsx / .csv
                </span>
              </h2>
              <p className="text-xs text-emerald-100 mt-0.5">
                Kelola data pasien lama dan integrasikan riwayat rekam medis dengan mudah
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* TAB NAVIGATION */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-5 pt-3 gap-2 flex-shrink-0">
          <button
            onClick={() => setActiveTab("import")}
            className={`pb-3 px-4 text-xs font-bold flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === "import"
                ? "border-emerald-600 text-emerald-700 bg-white rounded-t-lg"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <Upload className="w-4 h-4" /> Import Pasien dari Excel
          </button>
          <button
            onClick={() => setActiveTab("export")}
            className={`pb-3 px-4 text-xs font-bold flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === "export"
                ? "border-emerald-600 text-emerald-700 bg-white rounded-t-lg"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <Download className="w-4 h-4" /> Export Data Pasien (.xlsx)
          </button>
        </div>

        {/* MODAL BODY */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">

          {/* ==================================================== */}
          {/* TAB 1: IMPORT DARI EXCEL                             */}
          {/* ==================================================== */}
          {activeTab === "import" && (
            <div className="space-y-6">
              
              {/* STEP 1: Download Template */}
              <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-emerald-600 text-white rounded-lg mt-0.5 flex-shrink-0">
                    <FileDown className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-emerald-900">1. Unduh Template Standar Excel</h4>
                    <p className="text-[11px] text-emerald-700 mt-0.5">
                      Gunakan template resmi kami yang sudah dilengkapi petunjuk kolom (No RM, Nama, Jenis Kelamin, Tgl Lahir, No HP, Alamat, Alergi, Cabang).
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={downloadPatientExcelTemplate}
                  className="inline-flex items-center gap-2 bg-white hover:bg-emerald-100 text-emerald-800 border border-emerald-300 px-3.5 py-2 rounded-lg text-xs font-bold shadow-2xs transition-colors flex-shrink-0"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-600" /> Download Template (.xlsx)
                </button>
              </div>

              {/* STEP 2: Upload Excel File */}
              <div>
                <h4 className="text-xs font-bold text-slate-800 mb-2 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-slate-800 text-white flex items-center justify-center text-[10px]">2</span>
                  Pilih atau Tarik File Excel (.xlsx, .xls, .csv)
                </h4>

                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
                    isDragging
                      ? "border-emerald-500 bg-emerald-50/50 scale-[1.01]"
                      : selectedFile
                      ? "border-emerald-400 bg-emerald-50/30"
                      : "border-slate-200 hover:border-emerald-400 hover:bg-slate-50/80"
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx, .xls, .csv"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleFileChange(e.target.files[0]);
                      }
                    }}
                  />

                  <div className="flex flex-col items-center justify-center gap-2">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shadow-xs">
                      <Upload className="w-6 h-6" />
                    </div>
                    {selectedFile ? (
                      <div>
                        <p className="text-xs font-bold text-slate-800">{selectedFile.name}</p>
                        <p className="text-[11px] text-slate-500">
                          {(selectedFile.size / 1024).toFixed(1)} KB • Klik untuk ganti file
                        </p>
                      </div>
                    ) : (
                      <div>
                        <p className="text-xs font-bold text-slate-700">
                          Klik untuk memilih file atau seret & lepas ke area ini
                        </p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Mendukung format Microsoft Excel (.xlsx, .xls) dan CSV (.csv)
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {parsingLoading && (
                  <div className="flex items-center justify-center gap-2 mt-3 text-xs text-emerald-700 bg-emerald-50 p-2.5 rounded-lg border border-emerald-200">
                    <RefreshCw className="w-4 h-4 animate-spin text-emerald-600" />
                    <span>Menganalisis dan memvalidasi data Excel...</span>
                  </div>
                )}

                {parseError && (
                  <div className="flex items-start gap-2 mt-3 text-xs text-rose-800 bg-rose-50 p-3 rounded-lg border border-rose-200">
                    <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                    <span>{parseError}</span>
                  </div>
                )}
              </div>

              {/* STEP 3: Preview and Options (If File Parsed) */}
              {parseResult && (
                <div className="space-y-4 pt-2 border-t border-slate-200">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                    <div>
                      <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-full bg-slate-800 text-white flex items-center justify-center text-[10px]">3</span>
                        Hasil Analisis & Opsi Impor
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        Total {parseResult.totalRows} baris ditemukan dari file Excel.
                      </p>
                    </div>

                    {/* Stats Badges */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="bg-emerald-100 text-emerald-800 text-[11px] font-bold px-2.5 py-1 rounded-lg border border-emerald-200">
                        ✓ {parseResult.validRows.length} Baris Siap
                      </span>
                      {parseResult.duplicateCount > 0 && (
                        <span className="bg-amber-100 text-amber-800 text-[11px] font-bold px-2.5 py-1 rounded-lg border border-amber-200">
                          ⚠️ {parseResult.duplicateCount} Duplikat
                        </span>
                      )}
                      {parseResult.invalidRows.length > 0 && (
                        <span className="bg-rose-100 text-rose-800 text-[11px] font-bold px-2.5 py-1 rounded-lg border border-rose-200">
                          ✕ {parseResult.invalidRows.length} Tidak Lengkap
                        </span>
                      )}
                    </div>
                  </div>

                  {/* IMPORT OPTIONS PANEL */}
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1.5">
                        Penanganan Data Duplikat (No RM / No HP sama)
                      </label>
                      <select
                        value={duplicateStrategy}
                        onChange={(e: any) => setDuplicateStrategy(e.target.value)}
                        className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium"
                      >
                        <option value="skip">
                          🔄 Lewati (Skip) - Jangan masukkan data yang sudah ada
                        </option>
                        <option value="update">
                          ✏️ Perbarui (Update) - Timpa biodata lama dengan data Excel baru
                        </option>
                        <option value="create_new_rm">
                          ➕ Tetap Impor Semua & Buat No. RM Baru Otomatis
                        </option>
                      </select>
                      <p className="text-[10px] text-slate-500 mt-1">
                        Sistem mendeteksi kecocokan berdasarkan Nomor Rekam Medis (RM) atau No. WhatsApp.
                      </p>
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1.5">
                        Cabang Default (Jika di Excel kosong)
                      </label>
                      <select
                        value={defaultBranchId}
                        onChange={(e) => setDefaultBranchId(e.target.value)}
                        className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium"
                      >
                        {branches.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name} ({b.branchCode || b.id})
                          </option>
                        ))}
                      </select>
                      <p className="text-[10px] text-slate-500 mt-1">
                        Jika kolom "Cabang" di file Excel sudah diisi, cabang asli tetap diprioritaskan.
                      </p>
                    </div>
                  </div>

                  {/* PREVIEW TABLE WITH FILTER */}
                  <div>
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setPreviewFilter("all")}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                            previewFilter === "all"
                              ? "bg-slate-800 text-white"
                              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                          }`}
                        >
                          Semua ({parseResult.totalRows})
                        </button>
                        <button
                          type="button"
                          onClick={() => setPreviewFilter("valid")}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                            previewFilter === "valid"
                              ? "bg-emerald-700 text-white"
                              : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                          }`}
                        >
                          Siap Impor ({parseResult.validRows.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setPreviewFilter("duplicate")}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                            previewFilter === "duplicate"
                              ? "bg-amber-600 text-white"
                              : "bg-amber-50 text-amber-700 hover:bg-amber-100"
                          }`}
                        >
                          Duplikat ({parseResult.duplicateCount})
                        </button>
                        {parseResult.invalidRows.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setPreviewFilter("invalid")}
                            className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                              previewFilter === "invalid"
                                ? "bg-rose-700 text-white"
                                : "bg-rose-50 text-rose-700 hover:bg-rose-100"
                            }`}
                          >
                            Error ({parseResult.invalidRows.length})
                          </button>
                        )}
                      </div>

                      <div className="relative w-full sm:w-48">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={previewSearch}
                          onChange={(e) => setPreviewSearch(e.target.value)}
                          placeholder="Cari di preview..."
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-2 py-1 text-[11px] text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                      </div>
                    </div>

                    {/* Table Container */}
                    <div className="border border-slate-200 rounded-xl overflow-hidden max-h-56 overflow-y-auto">
                      <table className="w-full text-left text-[11px]">
                        <thead className="bg-slate-100 text-slate-700 sticky top-0 font-bold border-b border-slate-200">
                          <tr>
                            <th className="py-2 px-3 w-10 text-center">#</th>
                            <th className="py-2 px-3">Status</th>
                            <th className="py-2 px-3">No. RM</th>
                            <th className="py-2 px-3">Nama Lengkap Pasien</th>
                            <th className="py-2 px-3">JK</th>
                            <th className="py-2 px-3">No HP / WhatsApp</th>
                            <th className="py-2 px-3">Tgl Lahir</th>
                            <th className="py-2 px-3">Cabang</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {previewRows.length === 0 ? (
                            <tr>
                              <td colSpan={8} className="py-6 text-center text-slate-400">
                                Tidak ada data yang sesuai filter
                              </td>
                            </tr>
                          ) : (
                            previewRows.map((row) => (
                              <tr
                                key={row.index}
                                className={`hover:bg-slate-50/80 ${
                                  !row.isValid
                                    ? "bg-rose-50/40"
                                    : row.isDuplicateRM || row.isDuplicatePhone
                                    ? "bg-amber-50/40"
                                    : ""
                                }`}
                              >
                                <td className="py-2 px-3 text-center text-slate-400 font-mono">
                                  {row.index}
                                </td>
                                <td className="py-2 px-3">
                                  {!row.isValid ? (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded" title={row.errors.join(", ")}>
                                      <AlertCircle className="w-3 h-3" /> Error
                                    </span>
                                  ) : row.isDuplicateRM || row.isDuplicatePhone ? (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded" title={row.warnings.join(", ")}>
                                      <AlertTriangle className="w-3 h-3" /> Duplikat
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                                      <CheckCircle className="w-3 h-3" /> Siap
                                    </span>
                                  )}
                                </td>
                                <td className="py-2 px-3 font-mono font-bold text-slate-700">
                                  {row.medicalRecordNumber || <span className="text-slate-400 italic">Otomatis</span>}
                                </td>
                                <td className="py-2 px-3 font-semibold text-slate-800">
                                  {row.name || <span className="text-rose-500 italic">(Kosong)</span>}
                                </td>
                                <td className="py-2 px-3">
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                    row.gender === "L" ? "bg-blue-100 text-blue-700" : "bg-pink-100 text-pink-700"
                                  }`}>
                                    {row.gender}
                                  </span>
                                </td>
                                <td className="py-2 px-3 font-mono text-slate-600">
                                  {row.phone || <span className="text-rose-500 italic">(Kosong)</span>}
                                </td>
                                <td className="py-2 px-3 text-slate-600">
                                  {row.dateOfBirth}
                                </td>
                                <td className="py-2 px-3 text-slate-600">
                                  {row.branchNameHint || "-"}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* IMPORT RESULT REPORT (If Executed) */}
                  {importResult && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-2 animate-fade-in">
                      <div className="flex items-center gap-2 text-emerald-800 font-bold text-xs">
                        <CheckCircle className="w-5 h-5 text-emerald-600" />
                        <span>Impor Data Pasien Berhasil Diselesaikan!</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-center text-xs">
                        <div className="bg-white p-2 rounded-lg border border-emerald-200">
                          <span className="text-[10px] text-slate-500 block">Total Diproses</span>
                          <span className="font-bold text-slate-800">{importResult.total}</span>
                        </div>
                        <div className="bg-white p-2 rounded-lg border border-emerald-200">
                          <span className="text-[10px] text-emerald-600 block">Pasien Baru Ditambah</span>
                          <span className="font-bold text-emerald-700">{importResult.imported}</span>
                        </div>
                        <div className="bg-white p-2 rounded-lg border border-emerald-200">
                          <span className="text-[10px] text-blue-600 block">Data Diperbarui</span>
                          <span className="font-bold text-blue-700">{importResult.updated}</span>
                        </div>
                        <div className="bg-white p-2 rounded-lg border border-emerald-200">
                          <span className="text-[10px] text-slate-500 block">Dilewati (Duplikat)</span>
                          <span className="font-bold text-slate-700">{importResult.skipped}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ==================================================== */}
          {/* TAB 2: EXPORT KE EXCEL                               */}
          {/* ==================================================== */}
          {activeTab === "export" && (
            <div className="space-y-6">
              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-4">
                <h4 className="text-xs font-bold text-slate-800 flex items-center gap-2">
                  <Database className="w-4 h-4 text-emerald-600" />
                  Pilih Lingkup Data yang Akan Diekspor
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label
                    onClick={() => setExportScope("all")}
                    className={`p-4 rounded-xl border-2 cursor-pointer transition-all flex items-start gap-3 ${
                      exportScope === "all"
                        ? "border-emerald-600 bg-white shadow-xs"
                        : "border-slate-200 bg-slate-100/50 hover:bg-white"
                    }`}
                  >
                    <input
                      type="radio"
                      name="exportScope"
                      checked={exportScope === "all"}
                      onChange={() => setExportScope("all")}
                      className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                    />
                    <div>
                      <span className="text-xs font-bold text-slate-800 block">
                        Seluruh Master Pasien
                      </span>
                      <span className="text-[11px] text-slate-500">
                        Ekspor seluruh {allPatients.length} data pasien terdaftar di seluruh cabang.
                      </span>
                    </div>
                  </label>

                  <label
                    onClick={() => setExportScope("filtered")}
                    className={`p-4 rounded-xl border-2 cursor-pointer transition-all flex items-start gap-3 ${
                      exportScope === "filtered"
                        ? "border-emerald-600 bg-white shadow-xs"
                        : "border-slate-200 bg-slate-100/50 hover:bg-white"
                    }`}
                  >
                    <input
                      type="radio"
                      name="exportScope"
                      checked={exportScope === "filtered"}
                      onChange={() => setExportScope("filtered")}
                      className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                    />
                    <div>
                      <span className="text-xs font-bold text-slate-800 block">
                        Data Terfilter Saat Ini
                      </span>
                      <span className="text-[11px] text-slate-500">
                        Ekspor {filteredPatients.length} data pasien yang cocok dengan filter cabang/pencarian aktif.
                      </span>
                    </div>
                  </label>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Nama File Excel (Opsional)
                  </label>
                  <input
                    type="text"
                    value={exportCustomFilename}
                    onChange={(e) => setExportCustomFilename(e.target.value)}
                    placeholder={`Data-Pasien-Lala-Dentist-${new Date().toISOString().split("T")[0]}.xlsx`}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Export Columns Overview */}
              <div className="bg-white p-4 rounded-xl border border-slate-200">
                <h5 className="text-xs font-bold text-slate-700 mb-2">
                  Kolom yang Akan Disertakan dalam File Excel:
                </h5>
                <div className="flex flex-wrap gap-1.5 text-[11px]">
                  {[
                    "No",
                    "No. Rekam Medis (No RM)",
                    "Nama Lengkap Pasien",
                    "Jenis Kelamin (L/P)",
                    "Tanggal Lahir",
                    "Usia",
                    "Nomor Telepon / WhatsApp",
                    "Email",
                    "Alamat Lengkap",
                    "Riwayat Medis / Alergi",
                    "Cabang Terdaftar",
                    "Tanggal Terdaftar"
                  ].map((col, i) => (
                    <span
                      key={i}
                      className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded-md border border-slate-200 font-medium"
                    >
                      {col}
                    </span>
                  ))}
                </div>
              </div>

              {exportSuccessMsg && (
                <div className="flex items-center gap-2 text-xs text-emerald-800 bg-emerald-50 p-3 rounded-lg border border-emerald-200 animate-fade-in">
                  <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <span>{exportSuccessMsg}</span>
                </div>
              )}
            </div>
          )}

        </div>

        {/* MODAL FOOTER */}
        <div className="bg-slate-50 p-4 border-t border-slate-200 flex items-center justify-between flex-shrink-0">
          <div className="text-[11px] text-slate-500">
            {activeTab === "import" ? (
              parseResult ? (
                <span>
                  <strong>{parseResult.validRows.length}</strong> pasien siap dimasukkan ke database
                </span>
              ) : (
                <span>Silakan pilih file Excel untuk memulai</span>
              )
            ) : (
              <span>
                Total:{" "}
                <strong>
                  {exportScope === "all" ? allPatients.length : filteredPatients.length}
                </strong>{" "}
                pasien akan diekspor
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-xl text-xs font-semibold transition-colors"
            >
              {importResult ? "Tutup" : "Batal"}
            </button>

            {activeTab === "export" ? (
              <button
                type="button"
                onClick={handleDoExport}
                disabled={isExporting}
                className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-5 py-2 rounded-xl shadow-sm transition-all transform active:scale-95 disabled:opacity-50"
              >
                {isExporting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" /> Sedang Mengekspor...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" /> Download File Excel
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleDoImport}
                disabled={
                  !parseResult ||
                  parseResult.validRows.length === 0 ||
                  isImporting
                }
                className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-5 py-2 rounded-xl shadow-sm transition-all transform active:scale-95 disabled:opacity-50"
              >
                {isImporting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" /> Mengimpor ({importProgress}%)...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" /> Mulai Impor Data Pasien
                  </>
                )}
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
