import React, { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Edit2, Plus, Search, X, Check, Ban } from "lucide-react";
import { useApp } from "../context/AppContext";
import { PrescriptionMedicine, UserRole } from "../types/domain";

export const PrescriptionMedicineCatalog: React.FC = () => {
  const { currentUser, configRepo } = useApp();
  const [medicines, setMedicines] = useState<PrescriptionMedicine[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [search, setSearch] = useState("");
  const [editingMedicineId, setEditingMedicineId] = useState<string | null>(null);
  const [genericName, setGenericName] = useState("");
  const [brandName, setBrandName] = useState("");
  const [strength, setStrength] = useState("");
  const [dosageForm, setDosageForm] = useState("");
  const isSuperAdmin = currentUser?.role === UserRole.SUPER_ADMIN;

  const loadMedicines = async () => {
    if (!currentUser) return;
    setLoading(true);
    setError("");
    try {
      setMedicines(await configRepo.getPrescriptionMedicines(
        currentUser.role,
        currentUser.authUserId || currentUser.id
      ));
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : "Gagal memuat master obat.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadMedicines();
  }, [currentUser, configRepo]);

  const visibleMedicines = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return medicines.filter((medicine) => !query || [
      medicine.genericName,
      medicine.brandName,
      medicine.strength,
      medicine.dosageForm
    ].some((value) => value.toLocaleLowerCase().includes(query)));
  }, [medicines, search]);

  const clearForm = () => {
    setEditingMedicineId(null);
    setGenericName("");
    setBrandName("");
    setStrength("");
    setDosageForm("");
  };

  const startEditing = (medicine: PrescriptionMedicine) => {
    setEditingMedicineId(medicine.id);
    setGenericName(medicine.genericName);
    setBrandName(medicine.brandName);
    setStrength(medicine.strength);
    setDosageForm(medicine.dosageForm);
    setError("");
    setSuccess("");
  };

  const saveMedicine = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isSuperAdmin && currentUser?.role !== UserRole.DOCTOR) {
      setError("Hanya dokter yang dapat mengusulkan obat dan Super Admin yang dapat mengelola master obat.");
      return;
    }
    if (!isSuperAdmin && editingMedicineId) {
      setError("Dokter hanya dapat mengusulkan obat baru. Perubahan master dilakukan Super Admin.");
      return;
    }
    if (!genericName.trim() || !strength.trim() || !dosageForm.trim()) {
      setError("Nama generik, kekuatan, dan bentuk sediaan wajib diisi.");
      return;
    }
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const approvalStatus: PrescriptionMedicine["approvalStatus"] = isSuperAdmin ? "APPROVED" : "PENDING";
      const payload = {
        genericName: genericName.trim(),
        brandName: brandName.trim(),
        strength: strength.trim(),
        dosageForm: dosageForm.trim(),
        isActive: isSuperAdmin ? medicines.find((medicine) => medicine.id === editingMedicineId)?.isActive ?? true : false,
        approvalStatus
      };
      if (editingMedicineId) {
        await configRepo.updatePrescriptionMedicine(editingMedicineId, payload, currentUser.role);
        setSuccess("Data obat berhasil diperbarui.");
      } else {
        await configRepo.createPrescriptionMedicine(
          payload,
          currentUser.role,
          currentUser.authUserId || currentUser.id
        );
        setSuccess(isSuperAdmin
          ? "Obat berhasil ditambahkan ke master."
          : "Usulan obat dikirim dan menunggu persetujuan Super Admin.");
      }
      clearForm();
      await loadMedicines();
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "Gagal menyimpan master obat.");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (medicine: PrescriptionMedicine) => {
    if (!isSuperAdmin) return;
    setError("");
    setSuccess("");
    try {
      await configRepo.updatePrescriptionMedicine(
        medicine.id,
        medicine.isActive
          ? { isActive: false }
          : { approvalStatus: "APPROVED", isActive: true },
        UserRole.SUPER_ADMIN
      );
      setSuccess(`Obat "${medicine.genericName}" ${medicine.isActive ? "dinonaktifkan" : "diaktifkan"}.`);
      await loadMedicines();
    } catch (toggleError: unknown) {
      setError(toggleError instanceof Error ? toggleError.message : "Gagal mengubah status obat.");
    }
  };

  const reviewMedicine = async (medicine: PrescriptionMedicine, approvalStatus: "APPROVED" | "REJECTED") => {
    if (!isSuperAdmin) return;
    setError("");
    setSuccess("");
    try {
      await configRepo.updatePrescriptionMedicine(
        medicine.id,
        { approvalStatus, isActive: approvalStatus === "APPROVED" },
        UserRole.SUPER_ADMIN
      );
      setSuccess(approvalStatus === "APPROVED"
        ? `Obat "${medicine.genericName}" disetujui dan aktif untuk dokter.`
        : `Usulan "${medicine.genericName}" ditolak.`);
      await loadMedicines();
    } catch (reviewError: unknown) {
      setError(reviewError instanceof Error ? reviewError.message : "Gagal memproses usulan obat.");
    }
  };

  const withdrawSuggestion = async (medicine: PrescriptionMedicine) => {
    if (!currentUser || currentUser.role !== UserRole.DOCTOR) return;
    setError("");
    setSuccess("");
    try {
      await configRepo.withdrawPrescriptionMedicineSuggestion(
        medicine.id,
        currentUser.role,
        currentUser.authUserId || currentUser.id
      );
      setSuccess(`Usulan "${medicine.genericName}" berhasil ditarik.`);
      await loadMedicines();
    } catch (withdrawError: unknown) {
      setError(withdrawError instanceof Error ? withdrawError.message : "Gagal menarik usulan obat.");
    }
  };

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-sm font-bold text-slate-900">Master Obat Resep</h2>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          {isSuperAdmin
            ? "Katalog membantu dokter memilih obat. Dosis dan aturan pakai tetap ditentukan dokter untuk setiap resep; data obat tidak terhubung ke stok."
            : "Ajukan obat yang belum tersedia. Usulan akan masuk ke Super Admin untuk ditinjau sebelum dapat dipakai bersama. Dosis dan aturan pakai tetap ditentukan dokter pada setiap resep."}
        </p>
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div role="status" className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      <form onSubmit={(event) => void saveMedicine(event)} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-2 xl:grid-cols-5">
        <label className="text-xs font-semibold text-slate-700">
          Nama generik *
          <input value={genericName} onChange={(event) => setGenericName(event.target.value)} required maxLength={160} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal" placeholder="Contoh: Parasetamol" />
        </label>
        <label className="text-xs font-semibold text-slate-700">
          Nama dagang
          <input value={brandName} onChange={(event) => setBrandName(event.target.value)} maxLength={160} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal" placeholder="Opsional" />
        </label>
        <label className="text-xs font-semibold text-slate-700">
          Kekuatan *
          <input value={strength} onChange={(event) => setStrength(event.target.value)} required maxLength={80} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal" placeholder="Contoh: 500 mg" />
        </label>
        <label className="text-xs font-semibold text-slate-700">
          Bentuk sediaan *
          <input value={dosageForm} onChange={(event) => setDosageForm(event.target.value)} required maxLength={80} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal" placeholder="Contoh: tablet" />
        </label>
        <div className="flex items-end gap-2">
          {editingMedicineId && isSuperAdmin && (
            <button type="button" onClick={clearForm} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">
              <X className="h-4 w-4" />
            </button>
          )}
          <button type="submit" disabled={saving} className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#916b1c] to-[#c5a059] px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">
            {editingMedicineId ? <Edit2 className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {saving ? "Menyimpan..." : editingMedicineId ? "Simpan Perubahan" : isSuperAdmin ? "Tambah Obat" : "Ajukan Obat"}
          </button>
        </div>
      </form>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-slate-500">
          {isSuperAdmin
            ? `${medicines.filter((medicine) => medicine.approvalStatus === "PENDING").length} menunggu persetujuan · ${medicines.filter((medicine) => medicine.isActive).length} aktif · ${medicines.length} total`
            : `${medicines.filter((medicine) => medicine.approvalStatus === "APPROVED" && medicine.isActive).length} obat aktif · ${medicines.filter((medicine) => medicine.approvalStatus === "PENDING").length} usulan menunggu persetujuan`}
        </p>
        <label className="relative block sm:w-80">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-xs" placeholder="Cari nama, kekuatan, atau bentuk..." />
        </label>
      </div>

      {loading ? (
        <p role="status" className="rounded-xl border border-slate-200 bg-white p-6 text-center text-xs text-slate-500">Memuat master obat...</p>
      ) : visibleMedicines.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-xs text-slate-500">
          {medicines.length === 0
            ? isSuperAdmin ? "Belum ada obat atau usulan obat. Tambahkan obat yang digunakan klinik melalui formulir di atas." : "Belum ada obat aktif. Anda dapat mengusulkan obat melalui formulir di atas."
            : "Obat tidak ditemukan."}
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className={`hidden ${isSuperAdmin ? "grid-cols-[1.4fr_1fr_0.8fr_0.6fr_auto]" : "grid-cols-[1.5fr_1fr_0.8fr_0.7fr]"} gap-3 bg-slate-50 px-4 py-3 text-[10px] font-bold uppercase tracking-wide text-slate-500 md:grid`}>
            <span>Generik / dagang</span><span>Kekuatan</span><span>Bentuk</span><span>Status</span>{isSuperAdmin && <span>Aksi</span>}
          </div>
          <div className="divide-y divide-slate-100">
            {visibleMedicines.map((medicine) => (
              <div key={medicine.id} className={`grid gap-2 px-4 py-3 text-xs ${isSuperAdmin ? "md:grid-cols-[1.4fr_1fr_0.8fr_0.6fr_auto]" : "md:grid-cols-[1.5fr_1fr_0.8fr_0.7fr]"} md:items-center md:gap-3`}>
                <div>
                  <p className="font-semibold text-slate-800">{medicine.genericName}</p>
                  {medicine.brandName && <p className="mt-0.5 text-[10px] text-slate-500">{medicine.brandName}</p>}
                </div>
                <span className="text-slate-700">{medicine.strength}</span>
                <span className="text-slate-700">{medicine.dosageForm}</span>
                <span className={
                  medicine.approvalStatus === "PENDING" ? "font-semibold text-amber-700"
                    : medicine.approvalStatus === "REJECTED" ? "font-semibold text-rose-600"
                      : medicine.isActive ? "font-semibold text-emerald-700" : "font-semibold text-slate-400"
                }>
                  {medicine.approvalStatus === "PENDING"
                    ? "Menunggu persetujuan"
                    : medicine.approvalStatus === "REJECTED" ? "Ditolak" : medicine.isActive ? "Aktif" : "Nonaktif"}
                </span>
                {isSuperAdmin ? (
                  <div className="flex flex-wrap gap-2">
                    {medicine.approvalStatus === "PENDING" ? (
                      <>
                        <button type="button" onClick={() => void reviewMedicine(medicine, "APPROVED")} className="inline-flex items-center gap-1 rounded-md border border-emerald-200 px-2.5 py-1.5 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-50">
                          <Check className="h-3 w-3" /> Setujui
                        </button>
                        <button type="button" onClick={() => void reviewMedicine(medicine, "REJECTED")} className="inline-flex items-center gap-1 rounded-md border border-rose-200 px-2.5 py-1.5 text-[10px] font-semibold text-rose-700 hover:bg-rose-50">
                          <Ban className="h-3 w-3" /> Tolak
                        </button>
                      </>
                    ) : (
                      <>
                        <button type="button" onClick={() => startEditing(medicine)} className="rounded-md border border-slate-200 px-2.5 py-1.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-50">Edit</button>
                        <button type="button" onClick={() => void toggleActive(medicine)} className="rounded-md border border-slate-200 px-2.5 py-1.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-50">{medicine.isActive ? "Nonaktifkan" : "Aktifkan"}</button>
                      </>
                    )}
                  </div>
                ) : medicine.approvalStatus === "PENDING"
                  && medicine.submittedBy === (currentUser?.authUserId || currentUser?.id) && (
                  <button
                    type="button"
                    onClick={() => void withdrawSuggestion(medicine)}
                    className="w-fit rounded-md border border-rose-200 px-2.5 py-1.5 text-[10px] font-semibold text-rose-700 hover:bg-rose-50"
                  >
                    Tarik usulan
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};
