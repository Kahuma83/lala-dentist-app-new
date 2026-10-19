import { supabase } from "../lib/supabase";

function validateNewPassword(newPassword: string): void {
  if (!newPassword || newPassword.trim() === "") {
    throw new Error("Password baru tidak boleh kosong");
  }
  if (newPassword.length < 6) {
    throw new Error("Password baru minimal harus 6 karakter");
  }
}

export async function changeAuthenticatedPassword(
  newPassword: string,
  currentPassword: string,
  email: string | null
): Promise<void> {
  validateNewPassword(newPassword);
  if (!currentPassword) {
    throw new Error("Password saat ini wajib diisi");
  }
  if (currentPassword === newPassword) {
    throw new Error("Password baru harus berbeda dari password saat ini");
  }
  if (!email?.trim()) {
    throw new Error("Email akun tidak tersedia. Silakan keluar dan masuk kembali sebelum mengubah kata sandi.");
  }

  const normalizedEmail = email.trim().toLowerCase();
  const { data: currentUserData, error: currentUserError } = await supabase.auth.getUser();
  if (currentUserError) {
    throw new Error(currentUserError.message || "Gagal memverifikasi sesi akun.");
  }
  if (currentUserData.user?.email?.trim().toLowerCase() !== normalizedEmail) {
    throw new Error("Email akun tidak sesuai dengan sesi yang sedang aktif. Silakan keluar dan masuk kembali.");
  }

  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: normalizedEmail,
    password: currentPassword
  });
  if (verifyError) {
    if (
      verifyError.message.toLowerCase().includes("invalid login credentials") ||
      verifyError.message.toLowerCase().includes("invalid_credentials")
    ) {
      throw new Error("Password saat ini salah. Silakan periksa kembali.");
    }
    throw new Error(verifyError.message || "Gagal memverifikasi password saat ini.");
  }

  const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
  if (updateError) {
    throw new Error(updateError.message || "Gagal memperbarui password di Supabase Auth");
  }
}

export async function requestPasswordResetEmail(email: string, redirectTo?: string): Promise<void> {
  if (!email || email.trim() === "") {
    throw new Error("Email wajib diisi");
  }

  const cleanEmail = email.trim().toLowerCase();
  if ([
    "superadmin@laladentist.com",
    "super@laladentist.com",
    "nonapresident@gmail.com"
  ].includes(cleanEmail)) {
    throw new Error("Email ini tidak terdaftar sebagai akun aktif.");
  }
  if (/@laladentist\.id$/i.test(cleanEmail)) {
    throw new Error("Akun staf menggunakan email internal, bukan kotak masuk email. Hubungi Super Admin untuk mengatur ulang password.");
  }

  const redirectUrl =
    redirectTo ||
    (typeof window !== "undefined"
      ? `${window.location.origin}/login?mode=recovery`
      : undefined);
  const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
    redirectTo: redirectUrl
  });
  if (error) {
    throw new Error(error.message || "Gagal mengirimkan instruksi pemulihan password");
  }
}

export async function resetAuthenticatedPassword(newPassword: string): Promise<void> {
  validateNewPassword(newPassword);
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) {
    throw new Error(error.message || "Gagal mengatur ulang kata sandi");
  }
}
