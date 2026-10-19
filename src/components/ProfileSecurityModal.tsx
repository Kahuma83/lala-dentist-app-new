import React, { useState } from "react";
import { useApp } from "../context/AppContext";
import { useRouter } from "../components/Router";
import { AuthService } from "../services/authService";
import {
  User,
  Shield,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowLeft,
  Building,
  Mail,
  Lock
} from "lucide-react";

export const ProfileSecurityModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({
  isOpen,
  onClose
}) => {
  const { currentUser } = useApp();
  const [activeTab, setActiveTab] = useState<"profile" | "security">("security");

  // Form states
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!isOpen || !currentUser) return null;

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!newPassword || newPassword.trim() === "") {
      setError("Password baru wajib diisi");
      return;
    }

    if (newPassword.length < 6) {
      setError("Password baru minimal harus 6 karakter");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Konfirmasi password baru tidak cocok");
      return;
    }

    setLoading(true);
    try {
      await AuthService.changePassword(newPassword, currentPassword, currentUser.email || null);
      setSuccess("Kata sandi berhasil diperbarui. Silakan gunakan kata sandi baru untuk login berikutnya.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setError(err.message || "Gagal memperbarui password. Silakan coba lagi.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-[#17233C] px-6 py-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#ebd4a8] text-[#17233C] font-black flex items-center justify-center text-base shadow-sm">
              {currentUser.name ? currentUser.name.charAt(0).toUpperCase() : "U"}
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>Pengaturan Akun</span>
                <span className="text-[10px] bg-[#ebd4a8]/20 text-[#ebd4a8] px-2 py-0.5 rounded-full font-mono font-semibold uppercase tracking-wider">
                  {currentUser.role.replace("_", " ")}
                </span>
              </h2>
              <p className="text-xs text-slate-300 font-medium">{currentUser.email || currentUser.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer text-lg font-bold"
          >
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-6 pt-2">
          <button
            onClick={() => {
              setActiveTab("profile");
              setError(null);
              setSuccess(null);
            }}
            className={`py-2.5 px-4 text-xs font-bold transition-all border-b-2 flex items-center gap-2 cursor-pointer ${
              activeTab === "profile"
                ? "border-[#c5a059] text-[#17233C]"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <User className="w-3.5 h-3.5 text-[#c5a059]" /> Profil Saya
          </button>
          <button
            onClick={() => {
              setActiveTab("security");
              setError(null);
              setSuccess(null);
            }}
            className={`py-2.5 px-4 text-xs font-bold transition-all border-b-2 flex items-center gap-2 cursor-pointer ${
              activeTab === "security"
                ? "border-[#c5a059] text-[#17233C]"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <Shield className="w-3.5 h-3.5 text-[#c5a059]" /> Keamanan &amp; Kata Sandi
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {activeTab === "profile" ? (
            <div className="space-y-4">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                  <span className="text-xs text-slate-500 font-medium">Nama Lengkap</span>
                  <span className="text-xs font-bold text-slate-800">{currentUser.name}</span>
                </div>
                <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                  <span className="text-xs text-slate-500 font-medium">Email Terdaftar</span>
                  <span className="text-xs font-bold text-slate-800 font-mono">{currentUser.email || "-"}</span>
                </div>
                <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                  <span className="text-xs text-slate-500 font-medium">Hak Akses (Role)</span>
                  <span className="text-xs font-extrabold text-[#c5a059]">{currentUser.role.replace("_", " ")}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500 font-medium">Cabang Bertugas</span>
                  <span className="text-xs font-bold text-slate-800">
                    {currentUser.assignedBranchId || "Akses Global (Seluruh Cabang)"}
                  </span>
                </div>
              </div>

              <div className="p-3 bg-amber-50/60 border border-amber-200 rounded-xl text-[11px] text-amber-800 flex items-start gap-2">
                <Building className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p>
                  Perubahan nama, role, cabang, dan status akun dikelola oleh <strong>Super Admin</strong> melalui modul SDM &amp; Konfigurasi sesuai prinsip perlindungan data dan audit RLS.
                </p>
              </div>
            </div>
          ) : (
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl text-xs text-slate-600 space-y-1">
                <p className="font-bold text-[#17233C] flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-[#c5a059]" />
                  <span>Ubah Kata Sandi Akun</span>
                </p>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Perbarui kata sandi Anda secara berkala untuk menjaga keamanan akun di Supabase Auth.
                </p>
              </div>

              {error && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-start gap-2 animate-in fade-in">
                  <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                  <p className="font-medium">{error}</p>
                </div>
              )}

              {success && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-start gap-2 animate-in fade-in">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <p className="font-medium">{success}</p>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 block">
                  Password Saat Ini
                </label>
                <div className="relative">
                  <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Masukkan password saat ini"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pl-10 pr-3 text-xs text-slate-800 focus:outline-none focus:border-[#c5a059] focus:bg-white transition-all shadow-inner"
                    autoComplete="current-password"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 block">
                  Password Baru *
                </label>
                <div className="relative">
                  <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Minimal 6 karakter"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pl-10 pr-3 text-xs text-slate-800 focus:outline-none focus:border-[#c5a059] focus:bg-white transition-all shadow-inner"
                    autoComplete="new-password"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 block">
                  Konfirmasi Password Baru *
                </label>
                <div className="relative">
                  <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Ulangi password baru"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pl-10 pr-3 text-xs text-slate-800 focus:outline-none focus:border-[#c5a059] focus:bg-white transition-all shadow-inner"
                    autoComplete="new-password"
                    required
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[#17233C] hover:bg-slate-800 text-white font-semibold py-2.5 px-4 rounded-xl text-xs transition-all shadow-md active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-[#ebd4a8]" />
                      <span>Menyimpan Password...</span>
                    </>
                  ) : (
                    <span>Simpan Password Baru</span>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="text-xs font-bold text-slate-600 hover:text-slate-900 px-4 py-2 rounded-lg transition-colors cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
