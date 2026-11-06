import React, { useCallback, useEffect, useState } from "react";
import { AlertCircle, KeyRound, Plus, RefreshCw, ShieldCheck, UserRound, UserX } from "lucide-react";
import { AuthService, AuthenticatedUserContext } from "../services/authService";
import { UserAccount, UserRole } from "../types/domain";

interface OwnerAccountManagementProps {
  actor: AuthenticatedUserContext;
}

export const OwnerAccountManagement: React.FC<OwnerAccountManagementProps> = ({ actor }) => {
  const [accounts, setAccounts] = useState<UserAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", username: "", password: "" });
  const [editing, setEditing] = useState<UserAccount | null>(null);
  const [credentials, setCredentials] = useState({ username: "", password: "" });

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const allAccounts = await AuthService.listUserAccounts();
      setAccounts(allAccounts.filter((account) => account.role === UserRole.OWNER));
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : "Gagal memuat akun Owner.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  const createAccount = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const account = await AuthService.createStaffAccountSecure(actor, {
        name: form.name,
        username: form.username,
        password: form.password,
        role: UserRole.OWNER
      });
      setAccounts((previous) => [...previous, account]);
      setForm({ name: "", username: "", password: "" });
      setMessage(`Akun Owner ${account.name} berhasil dibuat. Login melalui /owner.`);
    } catch (createError: unknown) {
      setError(createError instanceof Error ? createError.message : "Gagal membuat akun Owner.");
    } finally {
      setSaving(false);
    }
  };

  const saveCredentials = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const updated = await AuthService.updateStaffLoginCredentials(actor, {
        accountId: editing.id,
        username: credentials.username,
        password: credentials.password
      });
      setAccounts((previous) => previous.map((account) => account.id === updated.id ? updated : account));
      setEditing(null);
      setCredentials({ username: "", password: "" });
      setMessage(`Kredensial ${updated.name} berhasil diperbarui.`);
    } catch (updateError: unknown) {
      setError(updateError instanceof Error ? updateError.message : "Gagal memperbarui kredensial Owner.");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (account: UserAccount) => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const updated = await AuthService.updateUserAccount(actor, account.id, { active: !account.active });
      setAccounts((previous) => previous.map((item) => item.id === updated.id ? updated : item));
      setMessage(`Akun ${account.name} ${updated.active ? "diaktifkan" : "dinonaktifkan"}.`);
    } catch (updateError: unknown) {
      setError(updateError instanceof Error ? updateError.message : "Gagal mengubah status akun Owner.");
    } finally {
      setSaving(false);
    }
  };

  if (actor.role !== UserRole.SUPER_ADMIN) {
    return <p className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">Hanya Super Admin yang dapat mengelola akun Owner.</p>;
  }

  return (
    <section className="space-y-5">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs leading-5 text-emerald-900">
        <div className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Akun Owner memiliki akses baca ke ringkasan seluruh cabang saja. Data pasien dan transaksi terperinci tidak ditampilkan. Akun dibuat khusus oleh Super Admin dan tidak terhubung ke cabang atau data pegawai.</p>
        </div>
      </div>

      {error && <div role="alert" className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}
      {message && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">{message}</div>}

      <form onSubmit={createAccount} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-4">
        <div className="md:col-span-4">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900"><Plus className="h-4 w-4 text-emerald-700" />Buat akun Owner</h2>
        </div>
        <label className="text-xs font-semibold text-slate-600">
          Nama Owner
          <input required maxLength={150} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 font-normal text-slate-900 outline-none focus:border-emerald-600" />
        </label>
        <label className="text-xs font-semibold text-slate-600">
          Username
          <input required minLength={3} maxLength={64} pattern="[a-zA-Z0-9_.-]+" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value.toLowerCase() })} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 font-normal text-slate-900 outline-none focus:border-emerald-600" />
        </label>
        <label className="text-xs font-semibold text-slate-600">
          Kata sandi awal
          <input required minLength={6} type="password" autoComplete="new-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 font-normal text-slate-900 outline-none focus:border-emerald-600" />
        </label>
        <div className="flex items-end">
          <button type="submit" disabled={saving} className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-3 py-2.5 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-50">
            {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <UserRound className="h-4 w-4" />}
            Buat akun
          </button>
        </div>
      </form>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-bold text-slate-900">Akun Owner terdaftar</h2>
          <button type="button" onClick={() => void loadAccounts()} disabled={loading} className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-emerald-700 disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />Muat ulang
          </button>
        </div>
        {loading ? (
          <p className="p-5 text-xs text-slate-500">Memuat akun Owner…</p>
        ) : accounts.length === 0 ? (
          <p className="p-5 text-xs text-slate-500">Belum ada akun Owner.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {accounts.map((account) => (
              <li key={account.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{account.name}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{account.username} · {account.active ? "Aktif" : "Nonaktif"}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" disabled={saving || !account.active} onClick={() => {
                    setEditing(account);
                    setCredentials({ username: account.username, password: "" });
                  }} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                    <KeyRound className="h-3.5 w-3.5" />Kredensial
                  </button>
                  <button type="button" disabled={saving} onClick={() => void toggleActive(account)} className={`flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[11px] font-semibold ${account.active ? "bg-rose-50 text-rose-700 hover:bg-rose-100" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"}`}>
                    {account.active ? <UserX className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                    {account.active ? "Nonaktifkan" : "Aktifkan"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <form onSubmit={saveCredentials} className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5 shadow-xl">
            <div>
              <h3 className="text-base font-bold text-slate-900">Ubah kredensial Owner</h3>
              <p className="mt-1 text-xs text-slate-500">{editing.name}</p>
            </div>
            <label className="block text-xs font-semibold text-slate-600">
              Username
              <input required minLength={3} maxLength={64} pattern="[a-zA-Z0-9_.-]+" value={credentials.username} onChange={(event) => setCredentials({ ...credentials, username: event.target.value.toLowerCase() })} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 font-normal text-slate-900 outline-none focus:border-emerald-600" />
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              Kata sandi baru <span className="font-normal text-slate-400">(kosongkan jika tidak diubah)</span>
              <input minLength={6} type="password" autoComplete="new-password" value={credentials.password} onChange={(event) => setCredentials({ ...credentials, password: event.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 font-normal text-slate-900 outline-none focus:border-emerald-600" />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" disabled={saving} onClick={() => setEditing(null)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">Batal</button>
              <button type="submit" disabled={saving} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{saving ? "Menyimpan…" : "Simpan"}</button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
};
