import React, { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, KeyRound, Mail, ShieldCheck, UserRoundPlus } from "lucide-react";
import { LalaLogo } from "../components/common/LalaLogo";
import { useApp } from "../context/AppContext";
import { useRouter } from "../components/Router";
import { isSupabaseConfigured } from "../lib/supabase";
import { AuthService } from "../services/authService";
import { CurrentUser, UserRole } from "../types/domain";

type PatientAuthMode = "login" | "register" | "forgot" | "recovery";

export const PatientAuthPage: React.FC = () => {
  const { branding, setCurrentUser } = useApp();
  const { navigate, path } = useRouter();
  const [mode, setMode] = useState<PatientAuthMode>(path === "/patient/register" ? "register" : "login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender, setGender] = useState<"" | "L" | "P">("");
  const [address, setAddress] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [canResendConfirmation, setCanResendConfirmation] = useState(false);

  const clinicName = branding?.name || "Lala Dentist";
  const configuredLogoUrl = branding?.logoUrl;
  const usesOriginalLogo = !configuredLogoUrl || configuredLogoUrl === "/logo-lala.svg";
  const logoUrl = usesOriginalLogo ? "/patient-portal-logo.jpg" : configuredLogoUrl;

  useEffect(() => {
    const queryParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const getCallbackParam = (key: string) => queryParams.get(key) || hashParams.get(key);

    if (queryParams.get("type") === "signup-confirmed") {
      setMessage("Email berhasil diverifikasi. Silakan masuk; akun akan ditautkan ke profil yang cocok atau dibuatkan profil baru. Jika email cocok dengan beberapa profil, hubungi klinik untuk pemeriksaan.");
    }
    if (queryParams.get("mode") === "recovery" || getCallbackParam("type") === "recovery") {
      setMode("recovery");
    }

    const callbackError = getCallbackParam("error_code") || getCallbackParam("error");
    const errorDescription = getCallbackParam("error_description") || "";
    if (callbackError) {
      const isExpiredConfirmation = callbackError === "otp_expired"
        || /email link is invalid or has expired/i.test(errorDescription);
      if (isExpiredConfirmation) {
        setError("Tautan verifikasi sudah kedaluwarsa atau tidak valid. Masukkan email pendaftaran yang sama, lalu kirim ulang tautan verifikasi.");
        setCanResendConfirmation(true);
      } else {
        setError(`Verifikasi gagal: ${errorDescription || callbackError}.`);
      }
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    }
  }, []);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setIsSubmitting(true);
    try {
      const { user, context } = await AuthService.signIn(email, password);
      if (context.role !== UserRole.PATIENT) {
        await AuthService.signOut();
        throw new Error("Akun ini bukan akun pasien. Silakan gunakan halaman masuk staf.");
      }

      const currentUser: CurrentUser = {
        id: context.userAccountId,
        authUserId: user.id,
        userAccountId: context.userAccountId,
        name: (user.user_metadata?.name as string) || (user.user_metadata?.full_name as string) || user.email || "Pasien",
        role: UserRole.PATIENT,
        assignedBranchId: null,
        branchId: null,
        patientId: context.patientId || null,
        isMockFallback: context.isMockFallback,
        email: user.email || null
      };
      setCurrentUser(currentUser);
      navigate("/patient/home");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Gagal masuk. Periksa email dan kata sandi Anda.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegister = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    if (password !== confirmPassword) {
      setError("Konfirmasi kata sandi tidak cocok.");
      return;
    }

    setIsSubmitting(true);
    try {
      if (gender !== "L" && gender !== "P") {
        setError("Jenis kelamin wajib dipilih.");
        return;
      }

      await AuthService.registerPatientAccount(email, password, name, {
        phone,
        dateOfBirth,
        gender,
        address
      });
      setMessage("Tautan verifikasi sudah dikirim. Setelah email diverifikasi, akun akan ditautkan ke profil yang cocok atau dibuatkan profil baru. Jika email cocok dengan beberapa profil, klinik perlu memeriksanya. Periksa kotak masuk dan folder spam.");
      setCanResendConfirmation(true);
      setMode("login");
      setPassword("");
      setConfirmPassword("");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Gagal mendaftarkan akun pasien.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendConfirmation = async () => {
    setError(null);
    setMessage(null);
    setIsSubmitting(true);
    try {
      await AuthService.resendPatientConfirmation(email);
      setMessage("Jika email memiliki pendaftaran pasien yang belum diverifikasi, tautan verifikasi baru akan dikirim. Periksa kotak masuk dan folder spam.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Gagal mengirim ulang tautan verifikasi.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setIsSubmitting(true);
    try {
      await AuthService.requestPasswordReset(email, `${window.location.origin}/patient/login?mode=recovery`);
      setMessage("Jika email terdaftar, tautan pemulihan kata sandi akan dikirim ke email tersebut.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Gagal meminta tautan pemulihan.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRecovery = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (resetPassword.length < 8) {
      setError("Kata sandi minimal 8 karakter.");
      return;
    }
    if (resetPassword !== resetPasswordConfirm) {
      setError("Konfirmasi kata sandi tidak cocok.");
      return;
    }
    setIsSubmitting(true);
    try {
      await AuthService.resetPassword(resetPassword);
      setMessage("Kata sandi berhasil diperbarui. Silakan masuk kembali.");
      setMode("login");
      setPassword("");
      setResetPassword("");
      setResetPasswordConfirm("");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Gagal memperbarui kata sandi.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const formHandler = mode === "login"
    ? handleLogin
    : mode === "register"
      ? handleRegister
      : mode === "forgot"
        ? handleForgotPassword
        : handleRecovery;

  return (
    <main className="patient-auth-shell min-h-screen px-4 py-7 text-slate-900 sm:px-6 sm:py-12">
      <div className="pointer-events-none fixed -left-20 -top-20 h-72 w-72 rounded-full bg-[#c7a85e]/10 blur-3xl" />
      <div className="pointer-events-none fixed -bottom-24 -right-20 h-80 w-80 rounded-full bg-[#b58d48]/10 blur-3xl" />
      <section className="relative mx-auto flex min-h-[calc(100svh-3.5rem)] w-full max-w-xl flex-col justify-center py-4 sm:min-h-[calc(100svh-6rem)]">
        <div className="patient-auth-panel rounded-[2rem] px-5 py-7 sm:px-10 sm:py-9">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-3 flex h-28 w-28 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-[0_8px_24px_rgba(121,91,35,0.12)]">
              {usesOriginalLogo ? (
                <img
                  src={logoUrl}
                  alt="Logo Lala Dentist"
                  className="h-full w-full scale-[1.12] object-cover"
                />
              ) : (
                <LalaLogo src={logoUrl} className="h-full w-full object-contain p-2" />
              )}
            </div>
            <p className="text-xl font-extrabold tracking-tight text-[#4f3a19]">{clinicName}</p>
            <p className="mt-1 text-sm font-medium tracking-wide text-[#806b42]">Senyum indah dimulai di Laladentist</p>
          </div>

          <div className="relative mb-6">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#cdb778] bg-white/85 px-3.5 py-2 shadow-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-[#987b3b]" />
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#806326]">Portal Pasien</p>
            </div>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#5a421f] sm:text-3xl">
              {mode === "login" && "Selamat datang kembali"}
              {mode === "register" && "Buat akun pasien"}
              {mode === "forgot" && "Pulihkan kata sandi"}
              {mode === "recovery" && "Atur kata sandi baru"}
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {mode === "login" && "Masuk dengan email pasien yang sudah terverifikasi."}
              {mode === "register" && "Lengkapi data agar profil pasien dapat dibuat otomatis setelah email diverifikasi."}
              {mode === "forgot" && "Kami akan mengirim tautan pemulihan ke email akun Anda."}
              {mode === "recovery" && "Buat kata sandi baru untuk akun pasien Anda."}
            </p>
          </div>

          {!isSupabaseConfigured && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              Portal pasien memerlukan koneksi Supabase dan belum dapat digunakan saat ini.
            </div>
          )}
          {error && <div role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">{error}</div>}
          {message && (
            <div role="status" className="mb-4 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs leading-5 text-emerald-800">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{message}</span>
            </div>
          )}

          <form onSubmit={formHandler} className="patient-auth-form relative space-y-4 rounded-[1.75rem] border border-[#bda465] bg-white p-5 shadow-[0_14px_34px_rgba(106,79,31,0.13)] sm:p-7">
            {mode === "register" && (
              <>
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold text-[#66512b]">Nama lengkap</span>
                  <input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" maxLength={150} required className="patient-auth-input w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm outline-none transition focus:border-[#9a8150] focus:bg-white" />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold text-[#66512b]">Nomor HP / WhatsApp</span>
                  <input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" maxLength={30} required placeholder="08xxxxxxxxxx" className="patient-auth-input w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm outline-none transition focus:border-[#9a8150] focus:bg-white" />
                </label>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="block space-y-1.5">
                    <span className="text-xs font-semibold text-[#66512b]">Tanggal lahir</span>
                    <input type="date" value={dateOfBirth} onChange={(event) => setDateOfBirth(event.target.value)} autoComplete="bday" max={new Date().toISOString().slice(0, 10)} required className="patient-auth-input w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm outline-none transition focus:border-[#9a8150] focus:bg-white" />
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-xs font-semibold text-[#66512b]">Jenis kelamin</span>
                    <select value={gender} onChange={(event) => setGender(event.target.value as "" | "L" | "P")} required className="patient-auth-input w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm outline-none transition focus:border-[#9a8150] focus:bg-white">
                      <option value="" disabled>Pilih</option>
                      <option value="L">Laki-laki</option>
                      <option value="P">Perempuan</option>
                    </select>
                  </label>
                </div>
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold text-[#66512b]">Alamat lengkap</span>
                  <textarea value={address} onChange={(event) => setAddress(event.target.value)} autoComplete="street-address" maxLength={500} required rows={2} placeholder="Alamat tempat tinggal" className="patient-auth-input w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm outline-none transition focus:border-[#9a8150] focus:bg-white" />
                </label>
              </>
            )}

            {mode !== "recovery" && (
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-[#66512b]">Email</span>
                <span className="relative block">
                  <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a88b4e]" />
                  <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required className="patient-auth-input w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-3.5 text-sm outline-none transition focus:border-[#9a8150] focus:bg-white" />
                </span>
              </label>
            )}

            {(mode === "login" || mode === "register") && (
              <label className="block space-y-1.5">
                <span className="flex items-center justify-between text-xs font-semibold text-[#66512b]">
                  Kata sandi
                  {mode === "login" && (
                    <button type="button" onClick={() => { setError(null); setMessage(null); setMode("forgot"); }} className="font-semibold text-[#7b693e] hover:underline">
                      Lupa kata sandi?
                    </button>
                  )}
                </span>
                <span className="relative block">
                  <KeyRound className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a88b4e]" />
                  <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "register" ? 8 : undefined} required className="patient-auth-input w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-3.5 text-sm outline-none transition focus:border-[#9a8150] focus:bg-white" />
                </span>
              </label>
            )}

            {(mode === "register" || mode === "recovery") && (
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-[#66512b]">{mode === "register" ? "Ulangi kata sandi" : "Kata sandi baru"}</span>
                <input
                  type="password"
                  value={mode === "register" ? confirmPassword : resetPassword}
                  onChange={(event) => mode === "register" ? setConfirmPassword(event.target.value) : setResetPassword(event.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  required
                  className="patient-auth-input w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm outline-none transition focus:border-[#9a8150] focus:bg-white"
                />
              </label>
            )}
            {mode === "recovery" && (
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-[#66512b]">Ulangi kata sandi baru</span>
                <input type="password" value={resetPasswordConfirm} onChange={(event) => setResetPasswordConfirm(event.target.value)} autoComplete="new-password" minLength={8} required className="patient-auth-input w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm outline-none transition focus:border-[#9a8150] focus:bg-white" />
              </label>
            )}

            <button
              type="submit"
              disabled={isSubmitting || !isSupabaseConfigured}
              className="patient-auth-submit flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-sm font-bold text-white shadow-md transition disabled:cursor-not-allowed disabled:opacity-50"
            >
              {mode === "register" ? <UserRoundPlus className="h-4 w-4" /> : mode === "recovery" ? <ShieldCheck className="h-4 w-4" /> : <KeyRound className="h-4 w-4" />}
              {isSubmitting ? "Mohon tunggu..." : mode === "login" ? "Masuk ke Portal Pasien" : mode === "register" ? "Daftar dan verifikasi email" : mode === "forgot" ? "Kirim tautan pemulihan" : "Simpan kata sandi baru"}
            </button>
          </form>

          <div className="mt-5 text-center text-sm text-slate-600">
            {mode === "login" ? (
              <>
                Belum punya akun?{" "}
                <button type="button" onClick={() => { setError(null); setMessage(null); setMode("register"); }} className="font-bold text-[#8a6b2d] hover:underline">Daftar pasien</button>
              </>
            ) : (
              <button type="button" onClick={() => { setError(null); setMessage(null); setMode("login"); }} className="inline-flex items-center gap-1.5 font-semibold text-[#8a6b2d] hover:underline">
                <ArrowLeft className="h-4 w-4" /> Kembali ke masuk pasien
              </button>
            )}
          </div>
          {mode === "login" && canResendConfirmation && (
            <div className="mt-3 text-center">
              <button
                type="button"
                disabled={isSubmitting || !isSupabaseConfigured}
                onClick={handleResendConfirmation}
                className="text-xs font-semibold text-[#6d5c35] hover:underline disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? "Mengirim..." : "Kirim ulang tautan verifikasi"}
              </button>
            </div>
          )}
          <div className="mt-6 border-t border-[#e7dec9] pt-4 text-center">
            <button type="button" onClick={() => navigate("/login")} className="text-xs font-medium text-slate-400 hover:text-slate-700">
              Masuk sebagai staf klinik
            </button>
          </div>
        </div>
      </section>
    </main>
  );
};
