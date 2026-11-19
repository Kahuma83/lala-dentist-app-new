import React, { useCallback, useEffect, useState } from "react";
import { AlertCircle, Banknote, CalendarDays, CheckCircle2, RefreshCw, Wallet, X } from "lucide-react";
import { supabase } from "../lib/supabase";
import { getTodayDateString } from "../utils/dateUtils";

interface OwnerCashBranchSummary {
  id: string;
  name: string;
  total: number;
  qris: number;
  edc: number;
  transfer: number;
  cashCollected: number;
  expenses: number;
  keritingExpenses: number;
  cash: number;
  amountToBring: number;
  roundingToday: number;
  roundingBalance: number | null;
  cashShortfall: number;
  openingConfigured: boolean;
  openingDate: string | null;
}

interface OwnerCashReport {
  date: string;
  totals: Omit<OwnerCashBranchSummary, "id" | "name" | "openingConfigured" | "openingDate" | "roundingBalance"> & {
    roundingBalance: number;
    allBranchesConfigured: boolean;
  };
  branches: OwnerCashBranchSummary[];
}

type KeritingEntryType = "OPENING_BALANCE" | "SETTLEMENT";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const isAmount = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isOwnerCashReport = (value: unknown): value is OwnerCashReport => {
  if (!isRecord(value) || !isRecord(value.totals) || !Array.isArray(value.branches)) return false;
  const amounts = [
    "total", "qris", "edc", "transfer", "cashCollected", "expenses", "keritingExpenses",
    "cash", "amountToBring", "roundingToday", "cashShortfall"
  ];
  const hasAmounts = (row: Record<string, unknown>) => amounts.every((key) => isAmount(row[key]));
  const hasValidBranches = value.branches.every((branch: unknown) =>
    isRecord(branch) &&
    typeof branch.id === "string" &&
    typeof branch.name === "string" &&
    hasAmounts(branch) &&
    typeof branch.openingConfigured === "boolean" &&
    (branch.openingDate === null || typeof branch.openingDate === "string") &&
    (branch.roundingBalance === null || isAmount(branch.roundingBalance))
  );
  return typeof value.date === "string" &&
    hasAmounts(value.totals) &&
  isAmount(value.totals.roundingBalance) &&
    typeof value.totals.allBranchesConfigured === "boolean" &&
    hasValidBranches;
};

const formatMoney = (value: number) => new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0
}).format(value || 0);

interface OwnerDailyCashReportProps {
  branchId?: string;
}

export const OwnerDailyCashReport: React.FC<OwnerDailyCashReportProps> = ({ branchId }) => {
  const today = getTodayDateString();
  const [reportDate, setReportDate] = useState(today);
  const [report, setReport] = useState<OwnerCashReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entryError, setEntryError] = useState<string | null>(null);
  const [entryType, setEntryType] = useState<KeritingEntryType | null>(null);
  const [entryBranch, setEntryBranch] = useState<OwnerCashBranchSummary | null>(null);
  const [entryDate, setEntryDate] = useState(today);
  const [entryAmount, setEntryAmount] = useState("");
  const [entryDescription, setEntryDescription] = useState("");
  const [savingEntry, setSavingEntry] = useState(false);

  const loadReport = useCallback(async (isRefresh = false) => {
    setError(null);
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const { data, error: rpcError } = branchId
        ? await supabase.rpc("get_branch_cash_rounding_report", {
          p_date: reportDate,
          p_branch_id: branchId
        })
        : await supabase.rpc("get_owner_daily_cash_report", {
          p_date: reportDate
        });
      if (rpcError) throw new Error(`Gagal memuat rekap setoran harian: ${rpcError.message}`);
      if (!isOwnerCashReport(data)) throw new Error("Format rekap setoran harian dari server tidak valid.");
      setReport(data);
    } catch (loadError: unknown) {
      setReport(null);
      setError(loadError instanceof Error ? loadError.message : "Gagal memuat rekap setoran harian.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [branchId, reportDate]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const openEntry = (type: KeritingEntryType, branch: OwnerCashBranchSummary) => {
    setEntryType(type);
    setEntryBranch(branch);
    setEntryDate(today);
    setEntryAmount("");
    setEntryDescription("");
    setEntryError(null);
  };

  const saveEntry = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!entryType || !entryBranch) return;
    const amount = Number(entryAmount);
    const isSettlement = entryType === "SETTLEMENT";
    if (
      !Number.isSafeInteger(amount)
      || amount < 0
      || (isSettlement && (amount < 50000 || amount % 50000 !== 0))
    ) {
      setEntryError(isSettlement
        ? "Setoran minimal Rp50.000 dan harus dalam kelipatan Rp50.000."
        : "Masukkan nominal rupiah bulat yang valid.");
      return;
    }
    if (isSettlement && amount > (entryBranch.roundingBalance || 0)) {
      setEntryError("Nominal setoran melebihi saldo uang keriting cabang.");
      return;
    }

    setSavingEntry(true);
    setEntryError(null);
    try {
      const { error: rpcError } = await supabase.rpc("record_owner_cash_rounding_entry", {
        p_branch_id: entryBranch.id,
        p_entry_type: entryType,
        p_entry_date: entryDate,
        p_amount: amount,
        p_description: entryDescription.trim() || null
      });
      if (rpcError) throw new Error(`Gagal menyimpan transaksi uang keriting: ${rpcError.message}`);
      setEntryType(null);
      setEntryBranch(null);
      await loadReport(true);
    } catch (saveError: unknown) {
      setEntryError(saveError instanceof Error ? saveError.message : "Gagal menyimpan transaksi uang keriting.");
    } finally {
      setSavingEntry(false);
    }
  };

  return (
    <section aria-labelledby="owner-daily-cash-title" className="rounded-2xl border border-[#e9e3d4] bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#927638]">
            {branchId ? "Kas cabang Anda" : "Tutup kas cabang"}
          </p>
          <h2 id="owner-daily-cash-title" className="mt-1 text-base font-bold text-[#243c34]">
            {branchId ? "Pengelolaan Kas Harian" : "Rekap Setoran Harian"}
          </h2>
          <p className="mt-1 text-[11px] text-slate-500">
            {branchId
              ? "Pantau saldo dan kelola uang keriting untuk cabang Anda."
              : "Rekap pembayaran, pengeluaran kas, setoran, dan akumulasi uang keriting per cabang."}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-[11px] font-semibold text-slate-600">
            <span className="mb-1 block">Tanggal laporan</span>
            <span className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-2">
              <CalendarDays className="h-4 w-4 text-slate-500" />
              <input
                type="date"
                value={reportDate}
                max={today}
                onChange={(event) => setReportDate(event.target.value)}
                className="min-w-0 bg-transparent text-xs outline-none"
              />
            </span>
          </label>
          <button
            type="button"
            onClick={() => void loadReport(true)}
            disabled={loading || refreshing}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Perbarui
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="mb-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs leading-5 text-rose-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading && !report ? (
        <div className="h-36 animate-pulse rounded-xl bg-slate-100" aria-label="Memuat rekap setoran harian" />
      ) : report ? (
        <>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <CashMetric label="Total" value={report.totals.total} tone="text-slate-900" />
            <CashMetric label="Total QR" value={report.totals.qris} tone="text-emerald-700" />
            <CashMetric label="Total EDC" value={report.totals.edc} tone="text-violet-700" />
            <CashMetric label="Total TF" value={report.totals.transfer} tone="text-blue-700" />
            <CashMetric label="Pengeluaran kas harian" value={report.totals.expenses} tone="text-rose-700" />
            <CashMetric label="Total Cash" value={report.totals.cash} tone="text-amber-700" />
            <CashMetric label="Total yang harus dibawa" value={report.totals.amountToBring} tone="text-[#173d35]" prominent />
            <CashMetric label="Uang keriting hari ini" value={report.totals.roundingToday} tone="text-[#927638]" />
          </div>

          {report.totals.cashShortfall > 0 && (
            <div role="alert" className="mt-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs leading-5 text-rose-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Pengeluaran kas harian melebihi uang cash yang diterima sebesar {formatMoney(report.totals.cashShortfall)}. Periksa transaksi cabang sebelum mencatat setoran.
              </span>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#e8dfc8] bg-[#fcfaf4] px-3.5 py-3">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-[#927638]" />
              <div>
                <p className="text-[11px] font-semibold text-slate-700">Saldo uang keriting terkumpul</p>
                <p className="text-sm font-bold text-[#173d35]">
                  {report.totals.allBranchesConfigured ? formatMoney(report.totals.roundingBalance) : "Belum lengkap"}
                </p>
              </div>
            </div>
            {!report.totals.allBranchesConfigured && (
              <p className="text-[10px] text-amber-800">Saldo akumulasi belum lengkap untuk tanggal ini. Periksa saldo awal dan tanggal mulainya di setiap cabang.</p>
            )}
          </div>

          <div className="mt-4 space-y-3">
            {report.branches.map((branch) => (
              <article key={branch.id} className="rounded-xl border border-slate-200 p-3.5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Banknote className="h-4 w-4 text-[#927638]" />
                    <h3 className="text-sm font-bold">{branch.name}</h3>
                    {(!branch.openingConfigured || branch.roundingBalance === null) && (
                      <span className="rounded-full bg-amber-50 px-2 py-1 text-[9px] font-semibold text-amber-800">
                        {branch.openingConfigured ? "Saldo belum tersedia pada tanggal laporan" : "Saldo awal belum diatur"}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {!branch.openingConfigured ? (
                      <button
                        type="button"
                        onClick={() => openEntry("OPENING_BALANCE", branch)}
                        className="rounded-lg bg-[#173d35] px-3 py-2 text-[10px] font-semibold text-white hover:bg-[#245347]"
                      >
                        Atur saldo awal
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => openEntry("SETTLEMENT", branch)}
                        disabled={!branch.roundingBalance || branch.roundingBalance < 50000}
                        className="rounded-lg border border-[#d1bd8c] px-3 py-2 text-[10px] font-semibold text-[#68572f] hover:bg-[#fcfaf4] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Catat setoran uang keriting
                      </button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 text-xs sm:grid-cols-4">
                  <BranchCashMetric label="Total" value={branch.total} />
                  <BranchCashMetric label="QR" value={branch.qris} />
                  <BranchCashMetric label="EDC" value={branch.edc} />
                  <BranchCashMetric label="TF" value={branch.transfer} />
                  <BranchCashMetric label="Pengeluaran kas harian" value={branch.expenses} />
                  <BranchCashMetric label="Pengeluaran uang keriting" value={branch.keritingExpenses} />
                  <BranchCashMetric label="Total Cash" value={branch.cash} />
                  <BranchCashMetric label="Yang harus dibawa" value={branch.amountToBring} />
                  <BranchCashMetric label="Uang keriting hari ini" value={branch.roundingToday} />
                  <BranchCashMetric
                    label="Saldo uang keriting"
                    value={branch.roundingBalance}
                    unavailable={!branch.openingConfigured || branch.roundingBalance === null}
                  />
                  {branch.cashShortfall > 0 && (
                    <BranchCashMetric label="Kekurangan kas" value={branch.cashShortfall} />
                  )}
                </div>
              </article>
            ))}
          </div>
          <p className="mt-3 text-[10px] leading-4 text-slate-500">
            Total adalah seluruh pembayaran sukses. Total Cash dihitung setelah pengeluaran dari kas harian; nominal yang dibawa dibulatkan turun per cabang ke kelipatan Rp50.000. Pengeluaran dari uang keriting mengurangi saldo akumulasi, bukan setoran kas harian.
          </p>
        </>
      ) : null}

      {entryType && entryBranch && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/45 p-4">
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="keriting-entry-title"
            onSubmit={(event) => void saveEntry(event)}
            className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 id="keriting-entry-title" className="text-base font-bold text-slate-900">
                  {entryType === "OPENING_BALANCE" ? "Saldo awal uang keriting" : "Catat setoran uang keriting"}
                </h3>
                <p className="mt-1 text-xs text-slate-500">{entryBranch.name}</p>
              </div>
              <button
                type="button"
                aria-label="Tutup formulir"
                onClick={() => {
                  setEntryType(null);
                  setEntryBranch(null);
                }}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {entryError && (
              <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-800">
                {entryError}
              </div>
            )}
            <label className="block text-xs font-semibold text-slate-700">
              Tanggal
              <input
                type="date"
                value={entryDate}
                max={today}
                onChange={(event) => setEntryDate(event.target.value)}
                required
                className="mt-1.5 w-full rounded-lg border border-slate-200 p-2.5 font-normal"
              />
              {entryType === "OPENING_BALANCE" && (
                <span className="mt-1 block text-[10px] font-normal text-slate-500">
                  Masukkan saldo pada awal tanggal ini, sebelum transaksi kas hari itu.
                </span>
              )}
            </label>
            <label className="block text-xs font-semibold text-slate-700">
              Nominal (Rp)
              <input
                type="number"
                min={entryType === "OPENING_BALANCE" ? 0 : 50000}
                max={entryType === "SETTLEMENT"
                  ? Math.floor((entryBranch.roundingBalance || 0) / 50000) * 50000
                  : undefined}
                step={entryType === "SETTLEMENT" ? 50000 : 1}
                value={entryAmount}
                onChange={(event) => setEntryAmount(event.target.value)}
                required
                className="mt-1.5 w-full rounded-lg border border-slate-200 p-2.5 font-normal"
              />
              {entryType === "SETTLEMENT" && (
                <span className="mt-1 block text-[10px] font-normal text-slate-500">
                  Setoran dalam kelipatan Rp50.000; sisa pecahan tetap menjadi saldo uang keriting cabang.
                </span>
              )}
            </label>
            <label className="block text-xs font-semibold text-slate-700">
              Catatan (opsional)
              <input
                type="text"
                value={entryDescription}
                onChange={(event) => setEntryDescription(event.target.value)}
                maxLength={300}
                placeholder={entryType === "OPENING_BALANCE" ? "Saldo saat mulai menggunakan fitur" : "Setoran mingguan uang keriting"}
                className="mt-1.5 w-full rounded-lg border border-slate-200 p-2.5 font-normal"
              />
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setEntryType(null);
                  setEntryBranch(null);
                }}
                className="rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-700"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={savingEntry}
                className="rounded-lg bg-[#173d35] px-3.5 py-2 text-xs font-semibold text-white disabled:opacity-50"
              >
                {savingEntry ? "Menyimpan..." : "Simpan"}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
};

const CashMetric: React.FC<{ label: string; value: number; tone: string; prominent?: boolean }> = ({
  label,
  value,
  tone,
  prominent = false
}) => (
  <article className={`rounded-xl border p-3 ${prominent ? "border-[#d1bd8c]/60 bg-[#fcfaf4]" : "border-slate-200 bg-white"}`}>
    <p className="text-[10px] font-medium text-slate-500">{label}</p>
    <p className={`mt-1 break-words text-sm font-bold sm:text-base ${tone}`}>{formatMoney(value)}</p>
  </article>
);

const BranchCashMetric: React.FC<{ label: string; value: number | null; unavailable?: boolean }> = ({
  label,
  value,
  unavailable = false
}) => (
  <div>
    <p className="text-[10px] text-slate-500">{label}</p>
    <p className="mt-0.5 break-words font-bold text-slate-800">
      {unavailable || value === null ? "-" : formatMoney(value)}
    </p>
  </div>
);
