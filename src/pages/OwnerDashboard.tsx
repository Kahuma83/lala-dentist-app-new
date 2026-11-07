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

interface OwnerDailyTrend {
  date: string;
  completedVisits: number;
  collected: number;
}

interface OwnerWeeklyTrend {
  startDate: string;
  endDate: string;
  days: OwnerDailyTrend[];
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

const addDays = (date: string, amount: number) => {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
};

const getWeeklyTrendRange = () => {
  const endDate = getTodayDateString();
  const startDate = addDays(endDate, -6);
  return { startDate: addDays(startDate, -7), endDate };
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

const isOwnerWeeklyTrend = (value: unknown): value is OwnerWeeklyTrend => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.startDate === "string" &&
    typeof candidate.endDate === "string" &&
    Array.isArray(candidate.days) &&
    candidate.days.every((day: unknown) =>
      !!day && typeof day === "object" &&
      typeof (day as Record<string, unknown>).date === "string" &&
      typeof (day as Record<string, unknown>).completedVisits === "number" &&
      Number.isFinite((day as Record<string, unknown>).completedVisits) &&
      typeof (day as Record<string, unknown>).collected === "number" &&
      Number.isFinite((day as Record<string, unknown>).collected)
    );
};

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
  const [weeklyTrend, setWeeklyTrend] = useState<OwnerWeeklyTrend | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trendError, setTrendError] = useState<string | null>(null);

  const range = useMemo(() => getPeriodRange(period), [period]);
  const weeklyRange = useMemo(() => getWeeklyTrendRange(), []);
  const loadSummary = useCallback(async (isRefresh = false) => {
    setError(null);
    setTrendError(null);
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    const [summaryResult, trendResult] = await Promise.allSettled([
      supabase.rpc("get_owner_dashboard_summary", {
        p_start_date: range.startDate,
        p_end_date: range.endDate
      }),
      supabase.rpc("get_owner_dashboard_weekly_trend", {
        p_start_date: weeklyRange.startDate,
        p_end_date: weeklyRange.endDate
      })
    ]);

    if (summaryResult.status === "rejected") {
      setError(summaryResult.reason instanceof Error
        ? summaryResult.reason.message
        : "Gagal memuat ringkasan Owner.");
    } else if (summaryResult.value.error) {
      setError(`Gagal memuat ringkasan Owner: ${summaryResult.value.error.message}`);
    } else if (!isOwnerDashboardSummary(summaryResult.value.data)) {
      setError("Format ringkasan Owner dari server tidak valid.");
    } else {
      setSummary(summaryResult.value.data);
    }

    if (trendResult.status === "rejected") {
      setTrendError(trendResult.reason instanceof Error
        ? trendResult.reason.message
        : "Grafik trafik mingguan gagal dimuat.");
    } else if (trendResult.value.error) {
      setTrendError("Grafik trafik belum tersedia. Pastikan migrasi tren Owner sudah diterapkan.");
    } else if (!isOwnerWeeklyTrend(trendResult.value.data)) {
      setTrendError("Format data trafik mingguan dari server tidak valid.");
    } else {
      setWeeklyTrend(trendResult.value.data);
    }

    setLoading(false);
    setRefreshing(false);
  }, [range.endDate, range.startDate, weeklyRange.endDate, weeklyRange.startDate]);

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
    { label: "Sisa invoice", value: formatMoney(totals?.outstanding || 0), icon: TrendingUp, tone: "text-amber-700 bg-amber-50" },
    { label: "Antrean aktif", value: formatCount(totals?.activeQueue || 0), icon: Users, tone: "text-violet-700 bg-violet-50" },
    { label: "Treatment terbuka", value: formatCount(totals?.openTreatments || 0), icon: CheckCircle2, tone: "text-cyan-700 bg-cyan-50" },
    { label: "Stok kritis saat ini", value: formatCount(totals?.lowStockItems || 0), icon: Boxes, tone: "text-rose-700 bg-rose-50" }
  ];
  const currentWeekStart = addDays(weeklyRange.endDate, -6);
  const previousWeekStart = addDays(currentWeekStart, -7);
  const trendByDate = new Map((weeklyTrend?.days || []).map((day) => [day.date, day]));
  const weeklyPoints = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(currentWeekStart, index);
    const previousDate = addDays(previousWeekStart, index);
    const currentDay = trendByDate.get(date);
    const previousDay = trendByDate.get(previousDate);
    return {
      label: new Intl.DateTimeFormat("id-ID", { weekday: "short", timeZone: "Asia/Jakarta" })
        .format(new Date(`${date}T00:00:00+07:00`)),
      date,
      previousDate,
      visits: currentDay?.completedVisits || 0,
      previousVisits: previousDay?.completedVisits || 0,
      collected: currentDay?.collected || 0,
      previousCollected: previousDay?.collected || 0
    };
  });
  const currentVisitTotal = weeklyPoints.reduce((total, point) => total + point.visits, 0);
  const previousVisitTotal = weeklyPoints.reduce((total, point) => total + point.previousVisits, 0);
  const currentCollectedTotal = weeklyPoints.reduce((total, point) => total + point.collected, 0);
  const previousCollectedTotal = weeklyPoints.reduce((total, point) => total + point.previousCollected, 0);

  const signInOutText = currentUser?.name || "Owner";

  return (
    <main className="min-h-screen bg-[#f8f7f3] pb-8 text-slate-900">
      <header className="sticky top-0 z-10 border-b border-[#d1bd8c]/25 bg-[#173d35] px-4 py-3.5 text-white shadow-sm sm:px-6">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <img
              src="/owner/lala-dentist-mark.png"
              alt="Logo Lala Dentist"
              className="h-10 w-10 shrink-0 object-contain"
            />
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#e2d3ab]">Lala Dentist</p>
              <h1 className="mt-0.5 truncate text-base font-bold sm:text-lg">Ringkasan Owner</h1>
            </div>
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

      <div className="mx-auto max-w-5xl space-y-4 px-4 py-5 sm:space-y-5 sm:px-6">
        <section className="flex flex-wrap items-end justify-between gap-3 rounded-2xl border border-[#e9e3d4] bg-white/90 p-3.5 shadow-sm sm:p-4">
          <div>
            <label htmlFor="owner-period" className="mb-1.5 block text-xs font-semibold text-slate-600">Periode</label>
            <div className="relative">
              <select
                id="owner-period"
                value={period}
                onChange={(event) => setPeriod(event.target.value as DashboardPeriod)}
                className="min-w-44 appearance-none rounded-xl border border-[#e4dfd2] bg-[#fffefa] py-2.5 pl-3 pr-9 text-sm font-semibold shadow-sm outline-none focus:border-emerald-700"
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
            className="flex items-center gap-2 rounded-xl border border-[#e4dfd2] bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-[#fbfaf6] disabled:opacity-50"
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

        <section aria-label="Pembayaran diterima pada periode pilihan">
          <article className="relative overflow-hidden rounded-2xl border border-[#bca66c]/45 bg-gradient-to-br from-[#173d35] via-[#1d4b40] to-[#285a4a] p-5 text-white shadow-[0_12px_30px_rgba(23,61,53,0.12)] sm:p-6">
            <div className="pointer-events-none absolute -right-10 -top-14 h-44 w-44 rounded-full border border-white/10" />
            <div className="pointer-events-none absolute -right-1 -top-5 h-28 w-28 rounded-full border border-[#d8c28c]/20" />
            <div className="relative flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-[#e2d3ab]">Pembayaran diterima</p>
                <p className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{loading ? "…" : formatMoney(totals?.collected || 0)}</p>
                <p className="mt-1.5 text-[11px] text-emerald-50/75">
                  {period === "today" ? "Hari ini" : `${formatDate(range.startDate)} – ${formatDate(range.endDate)}`}
                </p>
              </div>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#dfca91]/30 bg-white/10">
                <CreditCard className="h-5 w-5 text-[#ead7a4]" />
              </div>
            </div>
          </article>
        </section>

        <section aria-label="Ringkasan operasional semua cabang" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {metricCards.map(({ label, value, icon: Icon, tone }) => (
            <article key={label} className="rounded-2xl border border-[#e9e3d4] bg-white p-3.5 shadow-sm sm:p-4">
              <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-xl ${tone}`}>
                <Icon className="h-[18px] w-[18px]" />
              </div>
              <p className="text-[11px] font-medium text-slate-500">{label}</p>
              <p className="mt-1 break-words text-base font-bold text-slate-900 sm:text-lg">{loading ? "…" : value}</p>
            </article>
          ))}
        </section>

        <section aria-labelledby="owner-weekly-trend-title" className="rounded-2xl border border-[#e9e3d4] bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#927638]">Tren mingguan</p>
              <h2 id="owner-weekly-trend-title" className="mt-1 text-base font-bold text-[#243c34]">Pergerakan Klinik</h2>
              <p className="mt-1 text-[11px] text-slate-500">
                Kunjungan selesai dan pembayaran selama {formatDate(currentWeekStart)} – {formatDate(weeklyRange.endDate)}.
              </p>
            </div>
            <span className="rounded-full border border-[#e8dfc8] bg-[#fcfaf4] px-2.5 py-1 text-[10px] font-semibold text-[#7d6735]">
              Dibanding 7 hari sebelumnya
            </span>
          </div>

          {trendError ? (
            <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs leading-5 text-amber-900">
              {trendError}
            </div>
          ) : loading && !weeklyTrend ? (
            <div className="grid gap-3 md:grid-cols-2" aria-label="Memuat trafik mingguan">
              <div className="h-52 animate-pulse rounded-xl bg-[#f7f6f1]" />
              <div className="h-52 animate-pulse rounded-xl bg-[#f7f6f1]" />
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              <WeeklyTrendCard
                title="Kunjungan selesai"
                currentTotal={currentVisitTotal}
                previousTotal={previousVisitTotal}
                points={weeklyPoints.map((point) => ({
                  label: point.label,
                  date: point.date,
                  previousDate: point.previousDate,
                  currentValue: point.visits,
                  previousValue: point.previousVisits
                }))}
                formatValue={formatCount}
                formatAxisValue={formatCount}
                formatPeriod={(date) => formatDate(date)}
              />
              <WeeklyTrendCard
                title="Pembayaran diterima"
                currentTotal={currentCollectedTotal}
                previousTotal={previousCollectedTotal}
                points={weeklyPoints.map((point) => ({
                  label: point.label,
                  date: point.date,
                  previousDate: point.previousDate,
                  currentValue: point.collected,
                  previousValue: point.previousCollected
                }))}
                formatValue={formatMoney}
                formatAxisValue={(value) => new Intl.NumberFormat("id-ID", {
                  notation: "compact",
                  maximumFractionDigits: 1
                }).format(value)}
                formatPeriod={(date) => formatDate(date)}
              />
            </div>
          )}
          <p className="mt-3 text-[10px] leading-4 text-slate-500">
            Kunjungan menghitung status selesai dilayani; pembayaran menghitung transaksi berhasil pada tanggal transaksi.
          </p>
        </section>

        <section className="rounded-2xl border border-[#e9e3d4] bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold">Perbandingan Cabang</h2>
              <p className="mt-1 text-[11px] text-slate-500">Angka periode pilihan serta status operasional dan stok saat ini.</p>
            </div>
            <Building2 className="h-5 w-5 text-[#8d743c]" />
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

interface WeeklyTrendPoint {
  label: string;
  date: string;
  previousDate: string;
  currentValue: number;
  previousValue: number;
}

interface WeeklyTrendCardProps {
  title: string;
  currentTotal: number;
  previousTotal: number;
  points: WeeklyTrendPoint[];
  formatValue: (value: number) => string;
  formatAxisValue: (value: number) => string;
  formatPeriod: (date: string) => string;
}

const WeeklyTrendCard: React.FC<WeeklyTrendCardProps> = ({
  title,
  currentTotal,
  previousTotal,
  points,
  formatValue,
  formatAxisValue,
  formatPeriod
}) => {
  const change = previousTotal === 0
    ? currentTotal === 0 ? "Stabil dari minggu lalu" : "Baru tercatat"
    : `${currentTotal >= previousTotal ? "+" : ""}${Math.round(((currentTotal - previousTotal) / previousTotal) * 100)}% dari minggu lalu`;
  const maximum = Math.max(...points.flatMap((point) => [point.currentValue, point.previousValue]), 1);
  const chartTop = 16;
  const chartBottom = 112;
  const chartHeight = chartBottom - chartTop;
  const gridValues = [maximum, maximum / 2, 0];

  return (
    <article className="min-w-0 rounded-xl border border-[#eee9dc] bg-[#fffefa] p-3 sm:p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-xs font-bold text-slate-800">{title}</h3>
          <p className="mt-1 text-[10px] text-slate-500">{formatValue(currentTotal)} minggu ini</p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-bold ${
          currentTotal >= previousTotal ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"
        }`}>
          {change}
        </span>
      </div>
      <div className="mt-3 flex items-center gap-3 text-[9px] text-slate-500">
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-[#23604c]" />
          Minggu ini
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-[#d8c28c]" />
          Minggu lalu
        </span>
      </div>
      <svg
        className="mt-1 h-auto w-full"
        viewBox="0 0 350 145"
        role="img"
        aria-label={`${title} harian, minggu ini ${formatValue(currentTotal)}, minggu lalu ${formatValue(previousTotal)}`}
      >
        {gridValues.map((value, index) => {
          const y = chartTop + (chartHeight / 2) * index;
          return (
            <g key={`${value}-${index}`}>
              <line x1="42" x2="342" y1={y} y2={y} stroke="#ebe7dc" strokeDasharray={index === 2 ? undefined : "3 4"} />
              <text x="36" y={y + 3} textAnchor="end" fill="#94a3b8" fontSize="8">
                {formatAxisValue(value)}
              </text>
            </g>
          );
        })}
        {points.map((point, index) => {
          const center = 55 + index * 42;
          const currentHeight = (point.currentValue / maximum) * chartHeight;
          const previousHeight = (point.previousValue / maximum) * chartHeight;
          return (
            <g key={point.date}>
              <rect
                x={center - 12}
                y={chartBottom - currentHeight}
                width="10"
                height={Math.max(currentHeight, point.currentValue > 0 ? 2 : 0)}
                rx="3"
                fill="#23604c"
              >
                <title>{`${formatPeriod(point.date)}: ${formatValue(point.currentValue)}`}</title>
              </rect>
              <rect
                x={center + 2}
                y={chartBottom - previousHeight}
                width="10"
                height={Math.max(previousHeight, point.previousValue > 0 ? 2 : 0)}
                rx="3"
                fill="#d8c28c"
              >
                <title>{`${formatPeriod(point.previousDate)}: ${formatValue(point.previousValue)}`}</title>
              </rect>
              <text x={center} y="132" textAnchor="middle" fill="#64748b" fontSize="8">
                {point.label}
              </text>
            </g>
          );
        })}
      </svg>
    </article>
  );
};
