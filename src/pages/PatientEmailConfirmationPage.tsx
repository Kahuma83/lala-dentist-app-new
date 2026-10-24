import React, { useEffect, useState } from "react";
import { CheckCircle2, MailCheck } from "lucide-react";
import { useRouter } from "../components/Router";
import { AuthService } from "../services/authService";

type ConfirmationState = "ready" | "confirming" | "confirmed" | "invalid" | "error";

export const PatientEmailConfirmationPage: React.FC = () => {
  const { navigate } = useRouter();
  const [confirmation] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenHash = params.get("token_hash") || "";
    return {
      tokenHash,
      valid: params.get("type") === "signup" && !!tokenHash
    };
  });
  const [state, setState] = useState<ConfirmationState>(confirmation.valid ? "ready" : "invalid");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (window.location.search) {
      window.history.replaceState(window.history.state, "", window.location.pathname);
    }
  }, []);

  const handleConfirm = async () => {
    setError(null);
    setState("confirming");
    try {
      await AuthService.confirmPatientSignup(confirmation.tokenHash);
      setState("confirmed");
    } catch (confirmationError) {
      setError(confirmationError instanceof Error ? confirmationError.message : "Verifikasi email gagal.");
      setState("error");
    }
  };

  const isConfirmed = state === "confirmed";
  const isInvalid = state === "invalid";

  return (
    <main className="min-h-screen bg-[#fbf8f0] px-4 py-10 flex items-center justify-center">
      <section className="w-full max-w-md rounded-2xl border border-[#e7dec9] bg-white p-8 text-center shadow-lg">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
          {isConfirmed ? <CheckCircle2 className="h-7 w-7" /> : <MailCheck className="h-7 w-7" />}
        </div>
        <h1 className="text-xl font-bold text-[#5c4724]">
          {isConfirmed ? "Email berhasil diverifikasi" : "Verifikasi email pasien"}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          {isConfirmed
            ? "Alamat email Anda sudah dikonfirmasi. Lanjutkan ke portal pasien untuk masuk."
            : isInvalid
              ? "Tautan verifikasi tidak lengkap atau tidak valid. Minta tautan verifikasi baru dari halaman masuk pasien."
              : "Untuk menyelesaikan pendaftaran, tekan tombol di bawah. Email Anda belum diverifikasi sampai Anda menekan tombol ini."}
        </p>

        {error && (
          <p role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-left text-sm text-rose-700">
            {error}
          </p>
        )}

        {state === "ready" || state === "confirming" ? (
          <button
            type="button"
            onClick={handleConfirm}
            disabled={state === "confirming"}
            className="mt-6 w-full rounded-lg bg-[#a47b24] px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#8f691d] disabled:cursor-wait disabled:opacity-60"
          >
            {state === "confirming" ? "Memverifikasi..." : "Konfirmasi email"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => navigate("/patient/login")}
            className="mt-6 w-full rounded-lg bg-[#a47b24] px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#8f691d]"
          >
            {isConfirmed ? "Lanjut ke portal pasien" : "Kembali ke halaman masuk"}
          </button>
        )}
      </section>
    </main>
  );
};
