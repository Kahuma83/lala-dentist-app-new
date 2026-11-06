import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Boxes,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  CreditCard,
  LogOut,
  RefreshCw,
  TrendingUp,
  Users
} from "lucide-react";
import { useApp } from "../context/AppContext";
import { useRouter } from "../components/Router";
import { supabase } from "../lib/supabase";
import { getTodayDateString } from "../utils/dateUtils";
import { AuthService } from "../services/authService";

type DashboardPeriod = "today" | "7days" | "month";

interface BranchSummary {
  id: string;
  name: string;
  bookings: number;
  visits: number;
  collected: number;
  outstanding: number;
  activeQueue: number;
  openTreatments: number;
  lowStockItems: number;
}

interface OwnerDashboardSummary {
  startDate: string;
  endDate: string;
  totals: Omit<BranchSummary, "id" | "name">;
  branches: BranchSummary[];
}

const getPeriodRange = (period: DashboardPeriod) => {
  const endDate = getTodayDateString();
  if (period === "today") return { startDate: endDate, endDate };
  if (period === "7days") {
    const start = new Date(`${endDate}T00:00:00.000Z`);
    start.setUTCDate(start.getUTCDate() - 6);
    return { startDate: start.toISOString().slice(0, 10), endDate };
  }
  return { startDate: `${endDate.slice(0, 7)}-01`, endDate };
};

const formatCount = (value: number) => new Intl.NumberFormat("id-ID").format(value || 0);
const formatMoney = (value: number) => new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0
}).format(value || 0);

const formatDate = (value: string) => new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Jakarta"
}).format(new Date(`${value}T00:00:00+07:00`));

const isOwnerDashboardSummary = (value: unknown): value is OwnerDashboardSummary => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  if (!candidate.totals || typeof candidate.totals !== "object" || !Array.isArray(candidate.branches)) return false;
  const requiredNumbers = ["bookings", "visits", "collected", "outstanding", "activeQueue", "openTreatments", "lowStockItems"];
  const hasNumbers = (row: Record<string, unknown>) => requiredNumbers.every((key) =>
    typeof row[key] === "number" && Number.isFinite(row[key])
  );
  return hasNumbers(candidate.totals as Record<string, unknown>) && candidate.branches.every((branch: unknown) =>
    !!branch && typeof branch === "object" &&
    typeof (branch as Record<string, unknown>).id === "string" &&
    typeof (branch as Record<string, unknown>).name === "string" &&
    hasNumbers(branch as Record<string, unknown>)
  );
};

export const OwnerDashboard: React.FC = () => {
  const { currentUser, setCurrentUser } = useApp();
  const { navigate } = useRouter();
  const [period, setPeriod] = useState<DashboardPeriod>("today");
  const [summary, setSummary] = useState<OwnerDashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(() => getPeriodRange(period), [period]);
  const loadSummary = useCallback(async (isRefresh = false) => {
    setError(null);
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const { data, error: rpcError } = await supabase.rpc("get_owner_dashboard_summary", {
        p_start_date: range.startDate,
        p_end_date: range.endDate
      });
      if (rpcError) throw new Error(`Gagal memuat ringkasan Owner: ${rpcError.message}`);
      if (!isOwnerDashboardSummary(data)) {
        throw new Error("Format ringkasan Owner dari server tidak valid.");
      }
      setSummary(data);
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : "Gagal memuat ringkasan Owner.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [range.endDate, range.startDate]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    const manifest = document.createElement("link");
    manifest.rel = "manifest";
    manifest.href = "/owner.webmanifest";
    document.head.appendChild(manifest);
    const originalThemeColor = document.querySelector('meta[name="theme-color"]')?.getAttribute("content") || null;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", "#173d35");
    const originalTitle = document.title;
    document.title = "Ringkasan Owner | Lala Dentist";

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/owner/owner-service-worker.js", { scope: "/owner/" })
        .catch((registrationError: unknown) => {
          console.error("Gagal mendaftarkan PWA Owner:", registrationError);
        });
    }

    return () => {
      manifest.remove();
      document.title = originalTitle;
      if (originalThemeColor) {
        document.querySelector('meta[name="theme-color"]')?.setAttribute("content", originalThemeColor);
      }
    };
  }, []);

  const logout = async () => {
    try {
      await AuthService.signOut();
      setCurrentUser(null);
      navigate("/login");
    } catch (signOutError: unknown) {
      setError(signOutError instanceof Error ? signOutError.message : "Gagal keluar dari akun.");
    }
  };

  const totals = summary?.totals;
  const metricCards = [
    { label: "Booking", value: formatCount(totals?.bookings || 0), icon: CalendarDays, tone: "text-blue-700 bg-blue-50" },
    { label: "Kunjungan", value: formatCount(totals?.visits || 0), icon: Users, tone: "text-teal-700 bg-teal-50" },
    { label: "Pembayaran diterima", value: formatMoney(totals?.collected || 0), icon: CreditCard, tone: "text-emerald-700 bg-emerald-50" },
    { label: "Sisa invoice", value: formatMoney(totals?.outstanding || 0), icon: TrendingUp, tone: "text-amber-700 bg-amber-50" },
    { label: "Antrean aktif", value: formatCount(totals?.activeQueue || 0), icon: Users, tone: "text-violet-700 bg-violet-50" },
    { label: "Treatment terbuka", value: formatCount(totals?.openTreatments || 0), icon: CheckCircle2, tone: "text-cyan-700 bg-cyan-50" },
    { label: "Stok kritis saat ini", value: formatCount(totals?.lowStockItems || 0), icon: Boxes, tone: "text-rose-700 bg-rose-50" }
  ];

  const signInOutText = currentUser?.name || "Owner";

  return (
    <main className="min-h-screen bg-[#f5f7f6] pb-8 text-slate-900">
      <header className="sticky top-0 z-10 border-b border-emerald-900/10 bg-[#173d35] px-4 py-4 text-white shadow-sm sm:px-6">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-emerald-100">Lala Dentist</p>
            <h1 className="mt-0.5 text-lg font-bold">Ringkasan Owner</h1>
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            className="flex items-center gap-1.5 rounded-lg border border-white/25 px-3 py-2 text-xs font-semibold hover:bg-white/10"
            aria-label={`Keluar dari akun ${signInOutText}`}
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Keluar</span>
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-5xl space-y-5 px-4 py-5 sm:px-6">
        <section className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <label htmlFor="owner-period" className="mb-1.5 block text-xs font-semibold text-slate-600">Periode</label>
            <div className="relative">
              <select
                id="owner-period"
                value={period}
                onChange={(event) => setPeriod(event.target.value as DashboardPeriod)}
                className="min-w-44 appearance-none rounded-xl border border-slate-200 bg-white py-2.5 pl-3 pr-9 text-sm font-semibold shadow-sm outline-none focus:border-emerald-600"
              >
                <option value="today">Hari ini</option>
                <option value="7days">7 hari terakhir</option>
                <option value="month">Bulan ini</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-slate-500" />
            </div>
            <p className="mt-1.5 text-[11px] text-slate-500">
              {formatDate(range.startDate)} – {formatDate(range.endDate)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadSummary(true)}
            disabled={loading || refreshing}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Perbarui
          </button>
        </section>

        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <section aria-label="Ringkasan semua cabang" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {metricCards.map(({ label, value, icon: Icon, tone }) => (
            <article key={label} className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm sm:p-4">
              <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-xl ${tone}`}>
                <Icon className="h-4.5 w-4.5" />
              </div>
              <p className="text-[11px] font-medium text-slate-500">{label}</p>
              <p className="mt-1 break-words text-base font-bold text-slate-900 sm:text-lg">{loading ? "…" : value}</p>
            </article>
          ))}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold">Perbandingan Cabang</h2>
              <p className="mt-1 text-[11px] text-slate-500">Angka periode pilihan serta status operasional dan stok saat ini.</p>
            </div>
            <Building2 className="h-5 w-5 text-emerald-700" />
          </div>

          {loading ? (
            <div className="space-y-3" aria-label="Memuat ringkasan cabang">
              <div className="h-24 animate-pulse rounded-xl bg-slate-100" />
              <div className="h-24 animate-pulse rounded-xl bg-slate-100" />
            </div>
          ) : summary?.branches.length ? (
            <div className="space-y-3">
              {summary.branches.map((branch) => (
                <article key={branch.id} className="rounded-xl border border-slate-200 p-3.5">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h3 className="text-sm font-bold">{branch.name}</h3>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-600">
                      {formatCount(branch.visits)} kunjungan
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 text-xs sm:grid-cols-4">
                    <BranchMetric label="Booking" value={formatCount(branch.bookings)} />
                    <BranchMetric label="Pembayaran" value={formatMoney(branch.collected)} />
                    <BranchMetric label="Sisa invoice" value={formatMoney(branch.outstanding)} />
                    <BranchMetric label="Antrean aktif" value={formatCount(branch.activeQueue)} />
                    <BranchMetric label="Treatment terbuka" value={formatCount(branch.openTreatments)} />
                    <BranchMetric label="Stok kritis saat ini" value={formatCount(branch.lowStockItems)} />
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              Tidak ada cabang aktif untuk ditampilkan.
            </div>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-3.5 text-[11px] leading-5 text-slate-500">
          <p><strong className="text-slate-700">Pembayaran diterima</strong> dihitung dari transaksi berhasil pada periode yang dipilih.</p>
          <p><strong className="text-slate-700">Sisa invoice</strong> menunjukkan saldo tersisa saat ini pada invoice yang dibuat dalam periode tersebut.</p>
          <p><strong className="text-slate-700">Antrean aktif dan treatment terbuka</strong> menunjukkan status saat dashboard dimuat, tidak dibatasi periode.</p>
          <p><strong className="text-slate-700">Stok kritis</strong> adalah jumlah barang aktif yang stoknya sudah mencapai batas minimum, sebagai snapshot saat ini.</p>
        </section>

        {!loading && summary && (
          <p className="flex items-center justify-center gap-1.5 text-center text-[10px] text-slate-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Data ringkasan diperbarui {new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date())} WIB
          </p>
        )}
      </div>
    </main>
  );
};

const BranchMetric: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <p className="text-[10px] text-slate-500">{label}</p>
    <p className="mt-0.5 break-words font-bold text-slate-800">{value}</p>
  </div>
);
