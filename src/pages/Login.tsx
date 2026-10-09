import React, { useState } from "react";
import { useApp } from "../context/AppContext";
import { useRouter } from "../components/Router";
import {
  Mail,
  KeyRound,
  AlertCircle,
  Loader2,
  Lock
} from "lucide-react";
import { UserRole, CurrentUser } from "../types/domain";
import { LalaLogo } from "../components/common/LalaLogo";
import { AuthService } from "../services/authService";

export const Login: React.FC = () => {
  const { setCurrentUser, branding } = useApp();
  const { navigate } = useRouter();

  const activeLogo =
    (branding?.logoUrl && branding.logoUrl !== "/logo-lala.png" ? branding.logoUrl : null) ||
    branding?.logoUrl ||
    "/logo.png";
  const displayClinicName = branding?.name || "Lala Dentist";
  const displayTagline = branding?.tagline || "Senyum Indah dimulai di Laladentist";

  // Real auth states
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const navigateToRoleDashboard = (role: UserRole) => {
    switch (role) {
      case UserRole.SUPER_ADMIN:
        navigate("/super-admin/dashboard");
        break;
      case UserRole.BRANCH_ADMIN:
        navigate("/branch-admin/dashboard");
        break;
      case UserRole.DOCTOR:
        navigate("/doctor/queue");
        break;
      case UserRole.DOCTOR_ASSISTANT:
        navigate("/assistant/queue");
        break;
      case UserRole.PATIENT:
        navigate("/patient/queue");
        break;
      default:
        navigate("/branch-admin/dashboard");
        break;
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setLoginError("Email dan password wajib diisi");
      return;
    }

    setLoginLoading(true);
    setLoginError(null);

    try {
      const { user, context } = await AuthService.signIn(email, password);
      const resolvedUser: CurrentUser = {
        id: context.userAccountId,
        name: (user.user_metadata?.name as string) || (user.user_metadata?.full_name as string) || user.email || "User",
        role: context.role,
        assignedBranchId: context.assignedBranchId ?? null,
        branchId: context.assignedBranchId ?? null,
        staffId: context.staffId ?? null,
        doctorId: context.role === UserRole.DOCTOR ? context.userAccountId : null,
        isMockFallback: context.isMockFallback,
        email: user.email || null
      };

      localStorage.setItem("mock_user_id", resolvedUser.id);
      localStorage.removeItem("mock_user_logged_out");
      setCurrentUser(resolvedUser);
      navigateToRoleDashboard(context.role);
    } catch (err: any) {
      setLoginError(err.message || "Gagal masuk. Silakan periksa kembali kredensial email & password Anda.");
    } finally {
      setLoginLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 md:p-8" id="login-screen">
      <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200/80 shadow-lg p-8">
        
        {/* Header Branding */}
        <div className="text-center mb-6">
          <div className="w-20 h-20 rounded-2xl bg-white flex items-center justify-center border-2 border-[#ebd4a8] shadow-md mx-auto mb-4 transition-transform hover:scale-105 duration-300 p-2">
            <LalaLogo src={activeLogo} className="w-14 h-14" />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-[#17233C]">
            {displayClinicName} <span className="text-[#c5a059] font-medium">Web Admin</span>
          </h1>
          <p className="text-xs text-[#8a6f27] font-semibold mt-1 tracking-wide">
            "{displayTagline}"
          </p>
          <p className="text-xs text-slate-400 mt-1.5">
            Portal Masuk Resmi Sistem Manajemen &amp; Operasional Klinik
          </p>
        </div>

        {/* EMAIL & PASSWORD AUTH FORM */}
        <form onSubmit={handleLogin} className="space-y-4" id="real-login-form">
          <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl text-xs text-slate-700">
            <p className="font-bold mb-0.5 flex items-center gap-1.5 text-[#17233C]">
              <Lock className="w-3.5 h-3.5 text-[#c5a059]" />
              <span>Autentikasi Terenkripsi Klinik</span>
            </p>
            <p className="leading-relaxed text-slate-500 text-[11px]">
              Silakan masuk dengan akun terdaftar (Username, No. HP, atau Email) beserta Kata Sandi Anda.
            </p>
          </div>

          {loginError && (
            <div className="bg-rose-50 border border-rose-200 p-3 rounded-xl text-xs text-rose-700 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <p className="font-medium">{loginError}</p>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block">
              Username / No. HP / Email
            </label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Masukkan username, no. hp, atau email"
                autoComplete="username"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-10 pr-4 text-sm text-slate-800 focus:outline-none focus:border-[#c5a059] focus:bg-white transition-all shadow-inner"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block">
              Kata Sandi / PIN
            </label>
            <div className="relative">
              <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-10 pr-4 text-sm text-slate-800 focus:outline-none focus:border-[#c5a059] focus:bg-white transition-all shadow-inner"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loginLoading}
            className="w-full bg-[#17233C] hover:bg-slate-800 text-white font-semibold py-3 px-4 rounded-xl text-sm transition-all shadow-md active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50 mt-2 cursor-pointer"
          >
            {loginLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Memverifikasi Akses...</span>
              </>
            ) : (
              <span>Masuk ke Aplikasi</span>
            )}
          </button>
        </form>

        {/* Footer info */}
        <p className="text-center text-[10px] text-slate-400 mt-8">
          Lala Dentist Web Admin • Production &amp; Clinical Management
        </p>
      </div>
    </div>
  );
};
