import React from "react";
import { AlertCircle, ArrowLeft, Lock, ArrowRight } from "lucide-react";
import { useRouter } from "../components/Router";
import { useApp } from "../context/AppContext";

interface PlaceholderPageProps {
  title: string;
  allowedRoles: string[];
}

export const PlaceholderPage: React.FC<PlaceholderPageProps> = ({ title, allowedRoles }) => {
  const { navigate } = useRouter();
  const { currentUser } = useApp();

  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-8 max-w-2xl mx-auto my-8 text-center" id="placeholder-page">
      <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-600 mx-auto mb-5">
        <AlertCircle className="w-6 h-6 animate-pulse" />
      </div>

      <h1 className="text-xl font-bold text-slate-800 tracking-tight">{title}</h1>
      <p className="text-xs font-semibold text-emerald-600 mt-1 uppercase tracking-wider">Modul Terjadwal</p>

      <div className="my-6 max-w-md mx-auto bg-slate-50 border border-slate-100 p-4 rounded-lg text-xs text-slate-500 leading-relaxed">
        <p className="font-bold text-slate-700 mb-1">📅 Rencana Implementasi</p>
        <p>
          Modul ini akan diimplementasikan pada phase berikutnya, disinkronisasikan sepenuhnya dengan model data Lala Dentist Android.
        </p>
      </div>

      {/* Role boundaries visualization */}
      <div className="mb-8 max-w-sm mx-auto text-left text-xs border border-slate-50 rounded-lg p-3.5">
        <span className="font-bold text-slate-700 block mb-2 flex items-center gap-1.5">
          <Lock className="w-3.5 h-3.5 text-slate-400" /> Batasan Akses Peran:
        </span>
        <div className="flex flex-wrap gap-1.5">
          {allowedRoles.map((r) => {
            const hasAccess = currentUser?.role === r;
            return (
              <span
                key={r}
                className={`px-2.5 py-1 rounded text-[10px] font-bold ${
                  hasAccess
                    ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                    : "bg-slate-100 text-slate-400"
                }`}
              >
                {r.replace("_", " ")} {hasAccess && "✓"}
              </span>
            );
          })}
        </div>
      </div>

      <button
        onClick={() => {
          if (currentUser?.role === "SUPER_ADMIN") {
            navigate("/super-admin/dashboard");
          } else {
            navigate("/branch-admin/dashboard");
          }
        }}
        className="inline-flex items-center gap-2 text-xs font-bold text-slate-600 hover:text-emerald-700 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Kembali ke Dashboard
      </button>
    </div>
  );
};
