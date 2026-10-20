import React, { useEffect, useMemo, useState } from "react";
import { Check, CircleAlert, Plus, Send, Trash2, X } from "lucide-react";
import { InventoryItem } from "../services/inventoryService";
import {
  InventoryTreatmentRecipeChange,
  getApprovedInventoryTreatmentRecipe,
  listInventoryTreatmentRecipeChanges,
  reviewInventoryTreatmentRecipeChange,
  submitInventoryTreatmentRecipeChange
} from "../services/inventoryRecipeService";
import { InventoryRecipeLine, getInventoryTreatmentRecipe } from "../utils/inventoryTreatmentRecipes";
import { MasterService, UserRole } from "../types/domain";

interface InventoryRecipeManagementProps {
  branchId: string | null;
  branchName: string | null;
  services: MasterService[];
  inventoryItems: InventoryItem[];
  role: UserRole;
  userName: string;
  onBranchRequired: () => void;
}

export const InventoryRecipeManagement: React.FC<InventoryRecipeManagementProps> = ({
  branchId,
  branchName,
  services,
  inventoryItems,
  role,
  userName,
  onBranchRequired
}) => {
  const isDoctor = role === UserRole.DOCTOR;
  const isReviewer = isDoctor || role === UserRole.SUPER_ADMIN;
  const canPropose = role === UserRole.SUPER_ADMIN
    || role === UserRole.BRANCH_ADMIN
    || role === UserRole.DOCTOR
    || role === UserRole.DOCTOR_ASSISTANT;
  const availableServices = useMemo(
    () => services.filter((service) => service.isActive && service.code),
    [services]
  );
  const [serviceCode, setServiceCode] = useState("");
  const [materials, setMaterials] = useState<InventoryRecipeLine[]>([]);
  const [note, setNote] = useState("");
  const [changes, setChanges] = useState<InventoryTreatmentRecipeChange[]>([]);
  const [hasApprovedOverride, setHasApprovedOverride] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!serviceCode && availableServices[0]?.code) setServiceCode(availableServices[0].code);
  }, [availableServices, serviceCode]);

  const selectedService = availableServices.find((service) => service.code === serviceCode);

  const reloadChanges = async () => {
    if (!branchId) return;
    setLoading(true);
    setError(null);
    try {
      setChanges(await listInventoryTreatmentRecipeChanges(branchId));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Gagal memuat perubahan resep tindakan.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!branchId) {
      setChanges([]);
      setMaterials([]);
      return;
    }
    void reloadChanges();
  }, [branchId]);

  useEffect(() => {
    let cancelled = false;
    const loadRecipe = async () => {
      if (!serviceCode) return;
      setError(null);
      try {
        const approved = branchId
          ? await getApprovedInventoryTreatmentRecipe(branchId, serviceCode)
          : null;
        if (cancelled) return;
        setHasApprovedOverride(!!approved);
        setMaterials(approved || getInventoryTreatmentRecipe(serviceCode)?.lines || []);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Gagal memuat resep tersimpan.");
          setMaterials(getInventoryTreatmentRecipe(serviceCode)?.lines || []);
        }
      }
    };
    void loadRecipe();
    return () => { cancelled = true; };
  }, [branchId, serviceCode]);

  const submitChange = async () => {
    if (!branchId || !selectedService?.code) {
      setError("Pilih satu cabang dan layanan terlebih dahulu.");
      return;
    }
    const duplicateCodes = materials.filter((line, index) =>
      materials.findIndex((candidate) => candidate.itemCode === line.itemCode) !== index
    );
    if (duplicateCodes.length) {
      setError("Setiap kode barang hanya boleh muncul satu kali dalam resep.");
      return;
    }
    if (materials.some((line) => !inventoryItems.some((item) =>
      item.itemCode === line.itemCode && item.isActive
    ))) {
      setError("Semua kode barang resep harus tersedia dan aktif di cabang ini.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await submitInventoryTreatmentRecipeChange({
        branchId,
        serviceCode: selectedService.code,
        materials,
        note,
        submittedByName: userName,
        submittedByRole: role
      });
      setNote("");
      setSuccess("Usulan resep tersimpan dan menunggu validasi Dokter.");
      await reloadChanges();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Gagal mengajukan perubahan resep.");
    } finally {
      setSubmitting(false);
    }
  };

  const reviewChange = async (change: InventoryTreatmentRecipeChange, approve: boolean) => {
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await reviewInventoryTreatmentRecipeChange(change.id, approve, "", userName, role);
      setSuccess(approve ? "Resep disetujui dan langsung digunakan untuk tindakan berikutnya." : "Usulan resep ditolak.");
      await reloadChanges();
      if (approve && change.serviceCode === serviceCode) {
        setMaterials(change.materials);
        setHasApprovedOverride(true);
      }
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "Gagal memvalidasi perubahan resep.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!branchId) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        <div className="flex items-center gap-2 font-bold"><CircleAlert className="h-4 w-4" />Pilih satu cabang</div>
        <p className="mt-1 text-xs">Pilih cabang pada filter di atas untuk melihat atau mengajukan resep tindakan.</p>
        <button type="button" onClick={onBranchRequired} className="mt-3 rounded-lg bg-[#c5a059] px-3 py-2 text-xs font-bold text-white">
          Pilih cabang
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && <div role="alert" className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700"><CircleAlert className="h-4 w-4 shrink-0" />{error}</div>}
      {success && <div role="status" className="flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800"><Check className="h-4 w-4 shrink-0" />{success}</div>}

      <section className="space-y-4 rounded-2xl border border-[#eadfca] bg-white p-4 shadow-sm sm:p-5">
        <div>
          <h2 className="font-bold text-[#17233C]">Koreksi Resep Bahan Tindakan</h2>
          <p className="mt-1 text-xs text-slate-500">
            {branchName || "Cabang terpilih"} · Perubahan diajukan ke Dokter untuk validasi sebelum dipakai.
          </p>
        </div>

        <label className="block space-y-1 text-xs font-semibold text-slate-600">
          Jenis tindakan
          <select value={serviceCode} onChange={(event) => setServiceCode(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">
            {availableServices.map((service) => <option key={service.code} value={service.code}>{service.name}</option>)}
          </select>
        </label>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-700">{hasApprovedOverride ? "Resep cabang yang disetujui" : "Resep standar saat ini"}</h3>
            <button type="button" onClick={() => setMaterials((current) => [...current, { itemCode: "", quantity: 1 }])} className="inline-flex items-center gap-1 rounded-lg bg-[#faf6ec] px-2.5 py-1.5 text-[11px] font-bold text-[#80652c]">
              <Plus className="h-3.5 w-3.5" /> Tambah bahan
            </button>
          </div>
          {materials.length === 0 && <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">Tidak ada pemakaian bahan standar. Tambahkan bahan jika diperlukan.</p>}
          {materials.map((line, index) => (
            <div key={`${line.itemCode}-${index}`} className="flex gap-2">
              <select
                value={line.itemCode}
                onChange={(event) => setMaterials((current) => current.map((item, row) =>
                  row === index ? { ...item, itemCode: event.target.value } : item
                ))}
                className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs"
              >
                <option value="">Pilih barang cabang</option>
                {inventoryItems.filter((item) => item.isActive).map((item) => (
                  <option key={item.id} value={item.itemCode}>{item.itemCode} · {item.name} ({item.unit})</option>
                ))}
              </select>
              <input
                aria-label="Jumlah bahan per tindakan"
                type="number"
                min="0.01"
                step="0.01"
                value={line.quantity}
                onChange={(event) => setMaterials((current) => current.map((item, row) =>
                  row === index ? { ...item, quantity: Number(event.target.value) } : item
                ))}
                className="w-24 rounded-lg border border-slate-200 px-2.5 py-2 text-xs"
              />
              <button type="button" onClick={() => setMaterials((current) => current.filter((_, row) => row !== index))} aria-label="Hapus bahan dari resep" className="rounded-lg p-2 text-rose-600 hover:bg-rose-50">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          <label className="block space-y-1 text-xs font-semibold text-slate-600">
            Alasan koreksi
            <input value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} placeholder="Contoh: pemakaian aktual per tindakan" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-normal" />
          </label>
          {canPropose && (
            <button type="button" onClick={() => void submitChange()} disabled={submitting || !selectedService} className="inline-flex items-center gap-2 rounded-xl bg-[#c5a059] px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">
              <Send className="h-4 w-4" /> {submitting ? "Menyimpan..." : "Ajukan Koreksi untuk Validasi"}
            </button>
          )}
          <p className="text-[10px] text-slate-500">Resep yang diajukan belum mengubah pengurangan stok sampai disetujui Dokter.</p>
        </div>
      </section>

      <section className="rounded-2xl border border-[#eadfca] bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-[#17233C]">Usulan & Riwayat Validasi</h2>
            <p className="mt-1 text-xs text-slate-500">Perubahan resep cabang {branchName || ""}.</p>
          </div>
          {loading && <span className="text-[10px] text-slate-400">Memuat...</span>}
        </div>
        {changes.length === 0 ? (
          <p className="rounded-xl bg-slate-50 p-4 text-xs text-slate-500">Belum ada usulan perubahan resep.</p>
        ) : (
          <div className="space-y-2">
            {changes.map((change) => {
              const serviceName = availableServices.find((service) => service.code === change.serviceCode)?.name || change.serviceCode;
              return (
                <article key={change.id} className="rounded-xl border border-slate-200 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-xs font-bold text-slate-800">{serviceName}</h3>
                      <p className="mt-0.5 text-[10px] text-slate-500">Diajukan {new Date(change.submittedAt).toLocaleString("id-ID")} oleh {change.submittedByName} ({change.submittedByRole}) · {change.note || "Tanpa catatan"}</p>
                    </div>
                    <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${change.status === "APPROVED" ? "bg-emerald-50 text-emerald-700" : change.status === "REJECTED" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-800"}`}>
                      {change.status === "PENDING" ? "Menunggu validasi" : change.status === "APPROVED" ? "Disetujui" : "Ditolak"}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {change.materials.map((material) => (
                      <span key={material.itemCode} className="rounded-md bg-slate-50 px-2 py-1 text-[10px] text-slate-600">{material.itemCode}: {material.quantity}</span>
                    ))}
                  </div>
                  {change.reviewedAt && <p className="mt-2 text-[10px] text-slate-500">Ditinjau {new Date(change.reviewedAt).toLocaleString("id-ID")} oleh {change.reviewedByName} ({change.reviewedByRole}){change.reviewNote ? ` · ${change.reviewNote}` : ""}</p>}
                  {isReviewer && change.status === "PENDING" && (
                    <div className="mt-3 flex gap-2">
                      <button type="button" disabled={submitting} onClick={() => void reviewChange(change, true)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-[10px] font-bold text-white disabled:opacity-50"><Check className="h-3.5 w-3.5" /> Validasi & Setujui</button>
                      <button type="button" disabled={submitting} onClick={() => void reviewChange(change, false)} className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-1.5 text-[10px] font-bold text-white disabled:opacity-50"><X className="h-3.5 w-3.5" /> Tolak</button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
