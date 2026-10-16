import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, CalendarDays, RefreshCw, UserRoundCheck, UserRoundPlus, Users } from "lucide-react";
import { useApp } from "../context/AppContext";
import { PatientProfile, UserRole } from "../types/domain";
import { getNewPatientAcquisitionSources, getPatientVisitAnalytics } from "../utils/patientVisitAnalytics";

const formatRupiahCount = (value: number) => value.toLocaleString("id-ID");

export const PatientAnalytics: React.FC = () => {
  const { visitRepo, patientRepo } = useApp();
  const [visits, setVisits] = useState<Awaited<ReturnType<typeof visitRepo.getVisitAnalyticsRecords>>>([]);
  const [patients, setPatients] = useState<PatientProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);

  const loadVisits = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [allVisits, allPatients] = await Promise.all([
        visitRepo.getVisitAnalyticsRecords(),
        patientRepo.getPatients(UserRole.SUPER_ADMIN)
      ]);
      setVisits(allVisits);
      setPatients(allPatients);
      setRefreshedAt(new Date());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Gagal memuat analisa kunjungan pasien.");
    } finally {
      setIsLoading(false);
    }
  }, [patientRepo, visitRepo]);

  useEffect(() => {
    void loadVisits();
  }, [loadVisits]);

  const analytics = useMemo(() => getPatientVisitAnalytics(visits), [visits]);
  const acquisitionSources = useMemo(
    () => getNewPatientAcquisitionSources(visits, patients, analytics.lastMonth.month),
    [analytics.lastMonth.month, patients, visits]
  );
  const maxAcquisitionCount = Math.max(1, ...acquisitionSources.map((source) => source.patients));
  const maximumPatients = Math.max(1, ...analytics.months.map((month) => month.uniquePatients));
  const maximumBarHeight = 190;
  const lastMonth = analytics.lastMonth;

  return (
    <div className="space-y-6" id="patient-analytics-page">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center">
              <CalendarDays className="w-5 h-5" />
            </div>
            <h1 className="text-lg font-bold text-slate-900">Analisa Kunjungan Pasien</h1>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            Komposisi pasien baru dan pasien existing dari seluruh cabang, dihitung berdasarkan pasien unik per bulan.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadVisits()}
          disabled={isLoading}
          className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
          Perbarui Data
        </button>
      </div>

      {error && (
        <div className="p-3 bg-rose-50 text-rose-800 rounded-lg border border-rose-200 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="p-3 bg-sky-50 border border-sky-100 rounded-lg text-[11px] text-sky-900 leading-relaxed">
        <strong>Definisi:</strong> Pasien baru adalah pasien pada kunjungan pertama yang tercatat di seluruh klinik. Pasien existing adalah pasien yang pernah berkunjung sebelum bulan analisa dan kembali berkunjung. Seseorang dihitung sekali per bulan, meskipun berkunjung beberapa kali atau ke cabang berbeda. Kunjungan batal tidak dihitung.
      </div>

      {isLoading && visits.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-xs text-slate-500">
          <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
          Memuat riwayat kunjungan seluruh cabang...
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <MetricCard
              icon={<Users className="w-5 h-5" />}
              title="Pasien unik bulan lalu"
              value={lastMonth.uniquePatients}
              note={`${formatRupiahCount(lastMonth.visits)} kunjungan tercatat`}
              color="slate"
            />
            <MetricCard
              icon={<UserRoundPlus className="w-5 h-5" />}
              title="Pasien baru"
              value={lastMonth.newPatients}
              note={`${lastMonth.newPercent.toFixed(1)}% dari pasien unik`}
              color="blue"
            />
            <MetricCard
              icon={<UserRoundCheck className="w-5 h-5" />}
              title="Pasien existing"
              value={lastMonth.existingPatients}
              note={`${lastMonth.existingPercent.toFixed(1)}% kembali berkunjung`}
              color="emerald"
            />
            <MetricCard
              icon={<CalendarDays className="w-5 h-5" />}
              title="Periode analisa"
              value={lastMonth.label}
              note={lastMonth.month}
              color="violet"
              isText
            />
          </div>

          <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-900">Sumber Pasien Baru</h2>
              <p className="text-[11px] text-slate-500 mt-1">
                Pasien yang kunjungan pertamanya tercatat pada {lastMonth.month} · seluruh cabang
              </p>
            </div>
            <div className="p-4">
              {lastMonth.newPatients === 0 ? (
                <p className="text-xs text-slate-500 text-center py-4">
                  Tidak ada pasien baru pada periode ini.
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                  {acquisitionSources.filter((source) => source.patients > 0).map((source) => (
                    <div key={source.source} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-medium text-slate-700">{source.label}</span>
                        <span className="text-slate-500">
                          {formatRupiahCount(source.patients)} ({source.percent.toFixed(1)}%)
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${source.source === "UNKNOWN" ? "bg-amber-400" : "bg-indigo-500"}`}
                          style={{ width: `${source.patients / maxAcquisitionCount * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[10px] text-slate-400 mt-4">
                Sumber kosong atau belum tercatat dihitung sebagai “Belum diketahui”. Angka ini memakai sumber pada profil pasien dan bukan kanal booking.
              </p>
            </div>
          </section>

          <section className="bg-white rounded-xl border border-slate-200 shadow-sm">
            <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Tren Pasien Baru & Existing</h2>
                <p className="text-[11px] text-slate-500 mt-1">12 bulan terakhir yang sudah lengkap · seluruh cabang digabung</p>
              </div>
              <div className="flex items-center gap-4 text-[11px] font-medium text-slate-600">
                <span className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm bg-blue-500" />Baru</span>
                <span className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />Existing</span>
              </div>
            </div>
            <div className="p-4 overflow-x-auto">
              <div className="min-w-[650px]">
                <div className="h-64 flex items-end gap-3 border-b border-slate-200 px-2">
                  {analytics.months.map((month) => {
                    const newHeight = month.newPatients / maximumPatients * 100;
                    const existingHeight = month.existingPatients / maximumPatients * 100;
                    return (
                      <div key={month.month} className="flex-1 h-full flex flex-col justify-end items-center group" title={`${month.month}: ${month.newPatients} baru, ${month.existingPatients} existing`}>
                        <span className="text-[10px] font-semibold text-slate-500 mb-1 opacity-0 group-hover:opacity-100">
                          {month.uniquePatients}
                        </span>
                        <div className="w-full max-w-9 h-[200px] flex flex-col justify-end overflow-hidden rounded-t-md">
                          <div className="bg-emerald-500 shrink-0" style={{ height: `${existingHeight * maximumBarHeight / 100}px` }} />
                          <div className="bg-blue-500 shrink-0" style={{ height: `${newHeight * maximumBarHeight / 100}px` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="grid grid-cols-12 gap-3 px-2 pt-2">
                  {analytics.months.map((month) => (
                    <div key={month.month} className="text-center text-[10px] text-slate-500">
                      {month.label}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-900">Rincian Bulanan</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="text-left font-semibold p-3">Bulan</th>
                    <th className="text-right font-semibold p-3">Pasien baru</th>
                    <th className="text-right font-semibold p-3">Pasien existing</th>
                    <th className="text-right font-semibold p-3">Total pasien unik</th>
                    <th className="text-right font-semibold p-3">% existing</th>
                    <th className="text-right font-semibold p-3">Jumlah kunjungan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[...analytics.months].reverse().map((month) => (
                    <tr key={month.month} className={month.month === lastMonth.month ? "bg-indigo-50/60" : ""}>
                      <td className="p-3 font-semibold text-slate-800">{month.month}</td>
                      <td className="p-3 text-right font-mono">{formatRupiahCount(month.newPatients)}</td>
                      <td className="p-3 text-right font-mono">{formatRupiahCount(month.existingPatients)}</td>
                      <td className="p-3 text-right font-mono font-semibold">{formatRupiahCount(month.uniquePatients)}</td>
                      <td className="p-3 text-right font-mono">{month.existingPercent.toFixed(1)}%</td>
                      <td className="p-3 text-right font-mono">{formatRupiahCount(month.visits)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <p className="text-[10px] text-slate-400">
            Data diperbarui{refreshedAt ? ` ${refreshedAt.toLocaleTimeString("id-ID")}` : ""}. Perhitungan pasien baru bergantung pada kelengkapan riwayat kunjungan yang tersimpan di sistem.
          </p>
        </>
      )}
    </div>
  );
};

const MetricCard: React.FC<{
  icon: React.ReactNode;
  title: string;
  value: number | string;
  note: string;
  color: "slate" | "blue" | "emerald" | "violet";
  isText?: boolean;
}> = ({ icon, title, value, note, color, isText = false }) => {
  const colorClasses = {
    slate: "bg-slate-100 text-slate-700",
    blue: "bg-blue-50 text-blue-700",
    emerald: "bg-emerald-50 text-emerald-700",
    violet: "bg-violet-50 text-violet-700"
  };

  return (
    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-start gap-3">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${colorClasses[color]}`}>{icon}</div>
      <div className="min-w-0">
        <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">{title}</div>
        <div className={`${isText ? "text-base" : "text-xl"} font-bold text-slate-900 mt-1`}>{isText ? value : formatRupiahCount(value as number)}</div>
        <div className="text-[10px] text-slate-400 mt-1">{note}</div>
      </div>
    </div>
  );
};
