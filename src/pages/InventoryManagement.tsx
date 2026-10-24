import React, { FormEvent, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Boxes,
  Check,
  ChevronRight,
  CircleAlert,
  ClipboardList,
  Clock3,
  Edit3,
  History,
  PackagePlus,
  Plus,
  Search,
  Trash2,
  X
} from "lucide-react";
import { useApp } from "../context/AppContext";
import { useRouter } from "../components/Router";
import { UserRole } from "../types/domain";
import {
  archiveInventoryItem,
  InventoryCategory,
  InventoryItem,
  InventoryMovement,
  InventoryMovementType,
  listInventoryItems,
  listInventoryMovements,
  recordInventoryMovement,
  saveInventoryItem
} from "../services/inventoryService";
import { InventoryRecipeManagement } from "./InventoryRecipeManagement";

const categoryOptions: Array<{ value: InventoryCategory; label: string }> = [
  { value: "BAHAN_TINDAKAN", label: "Bahan Tindakan" },
  { value: "ALAT_MEDIS", label: "Alat Medis" },
  { value: "PERLENGKAPAN_KANTOR", label: "Perlengkapan Kantor" },
  { value: "LAINNYA", label: "Lainnya" }
];

const emptyForm = {
  itemCode: "",
  name: "",
  category: "BAHAN_TINDAKAN" as InventoryCategory,
  unit: "pcs",
  minimumStock: "0",
  storageLocation: "",
  initialStock: "0"
};

function formatQuantity(value: number): string {
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(value);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta"
  }).format(new Date(value));
}

function statusFor(item: InventoryItem): { label: string; className: string } {
  if (item.currentStock <= 0) return { label: "Kritis", className: "bg-rose-50 text-rose-700 border-rose-200" };
  if (item.currentStock <= item.minimumStock) return { label: "Menipis", className: "bg-amber-50 text-amber-800 border-amber-200" };
  return { label: "Aman", className: "bg-emerald-50 text-emerald-700 border-emerald-200" };
}

export const InventoryManagement: React.FC = () => {
  const { currentUser, branches, selectedBranchId, patients, visits, services } = useApp();
  const { path, navigate } = useRouter();
  const isSuper = currentUser?.role === UserRole.SUPER_ADMIN;
  const canManage = isSuper || currentUser?.role === UserRole.BRANCH_ADMIN;
  const rolePrefix = isSuper
    ? "/super-admin"
    : currentUser?.role === UserRole.BRANCH_ADMIN
      ? "/branch-admin"
      : currentUser?.role === UserRole.DOCTOR
        ? "/doctor"
        : "/assistant";
  const branchScope = currentUser?.role === UserRole.BRANCH_ADMIN
    || currentUser?.role === UserRole.DOCTOR
    || currentUser?.role === UserRole.DOCTOR_ASSISTANT
    ? currentUser.assignedBranchId || currentUser.branchId || null
    : null;
  const [branchFilter, setBranchFilter] = useState<string>(
    branchScope || selectedBranchId || "ALL"
  );
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [search, setSearch] = useState("");
  const [historyItemFilter, setHistoryItemFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [showItemForm, setShowItemForm] = useState(false);
  const [movementItem, setMovementItem] = useState<InventoryItem | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [movementType, setMovementType] = useState<InventoryMovementType>("IN");
  const [movementQuantity, setMovementQuantity] = useState("");
  const [movementCost, setMovementCost] = useState("");
  const [movementReference, setMovementReference] = useState("");
  const [movementNote, setMovementNote] = useState("");

  const activeView = path.endsWith("/history")
    ? "history"
    : path.endsWith("/low-stock")
      ? "low-stock"
      : path.endsWith("/recipes")
        ? "recipes"
      : path.endsWith("/new")
        ? "list"
        : "list";
  const effectiveBranchId = isSuper
    ? branchFilter === "ALL" ? null : branchFilter
    : branchScope;
  const selectedBranch = branches.find((branch) => branch.id === effectiveBranchId);

  const loadInventory = async () => {
    if (!isSuper && !branchScope) {
      setItems([]);
      setMovements([]);
      setError("Akun Anda belum ditautkan ke cabang. Hubungi Super Admin untuk memperbaiki akses.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [itemRows, movementRows] = await Promise.all([
        listInventoryItems(effectiveBranchId, activeView === "history"),
        listInventoryMovements({ branchId: effectiveBranchId, itemId: historyItemFilter })
      ]);
      setItems(itemRows);
      setMovements(movementRows);
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : "Gagal memuat data inventori.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadInventory();
  }, [effectiveBranchId, activeView, historyItemFilter, isSuper, branchScope]);

  useEffect(() => {
    if (!isSuper) setBranchFilter(branchScope || "ALL");
  }, [isSuper, branchScope]);

  useEffect(() => {
    if (path.endsWith("/new") && canManage) {
      setEditingItem(null);
      setForm(emptyForm);
      setShowItemForm(true);
    }
  }, [path, canManage]);

  const filteredItems = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return items.filter((item) => {
      const matchesSearch = !normalizedSearch
        || item.itemCode.toLowerCase().includes(normalizedSearch)
        || item.name.toLowerCase().includes(normalizedSearch);
      const matchesLowStock = activeView !== "low-stock" || item.currentStock <= item.minimumStock;
      return matchesSearch && matchesLowStock;
    });
  }, [activeView, items, search]);

  const lowStockCount = items.filter((item) => item.currentStock <= item.minimumStock).length;

  const openCreateForm = () => {
    setError(null);
    setSuccess(null);
    setEditingItem(null);
    setForm(emptyForm);
    setShowItemForm(true);
  };

  const openEditForm = (item: InventoryItem) => {
    setError(null);
    setEditingItem(item);
    setForm({
      itemCode: item.itemCode,
      name: item.name,
      category: item.category,
      unit: item.unit,
      minimumStock: String(item.minimumStock),
      storageLocation: item.storageLocation || "",
      initialStock: "0"
    });
    setShowItemForm(true);
  };

  const handleSaveItem = async (event: FormEvent) => {
    event.preventDefault();
    if (!isSuper && !branchScope) {
      setError("Akun Anda belum ditautkan ke cabang.");
      return;
    }
    const targetBranchId = isSuper
      ? editingItem?.branchId || effectiveBranchId || selectedBranchId || branches[0]?.id
      : branchScope;
    const minimumStock = Number(form.minimumStock);
    const initialStock = Number(form.initialStock);
    if (!targetBranchId) {
      setError("Pilih cabang terlebih dahulu sebelum menambah barang.");
      return;
    }
    if (!form.itemCode.trim() || !form.name.trim() || !form.unit.trim()) {
      setError("Kode, nama barang, dan satuan wajib diisi.");
      return;
    }
    if (!Number.isFinite(minimumStock) || minimumStock < 0 || !Number.isFinite(initialStock) || initialStock < 0) {
      setError("Stok minimum dan stok awal harus berupa angka nol atau lebih.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const saved = await saveInventoryItem({
        branchId: targetBranchId,
        itemCode: form.itemCode,
        name: form.name,
        category: form.category,
        unit: form.unit,
        minimumStock,
        storageLocation: form.storageLocation
      }, currentUser?.name || "Pengguna", editingItem?.id);
      let stockMovementError: string | null = null;
      if (initialStock > 0) {
        try {
          await recordInventoryMovement({
            itemId: saved.id,
            movementType: "IN",
            quantity: initialStock,
            userName: currentUser?.name || "Pengguna",
            reference: editingItem ? "Penambahan stok dari edit barang" : "Stok awal",
            note: editingItem
              ? `Penambahan stok melalui edit barang ${saved.itemCode}`
              : "Saldo awal saat barang didaftarkan"
          });
        } catch (movementError: unknown) {
          stockMovementError = movementError instanceof Error
            ? movementError.message
            : "Kesalahan tidak diketahui saat mencatat penambahan stok.";
        }
      }
      setShowItemForm(false);
      setSuccess(stockMovementError
        ? `Data barang berhasil disimpan, tetapi penambahan stok belum tercatat. Periksa saldo stok dan riwayat. Alasan: ${stockMovementError}`
        : editingItem ? "Data barang berhasil diperbarui." : "Barang inventori berhasil ditambahkan.");
      await loadInventory();
      if (path.endsWith("/new")) navigate(`${rolePrefix}/inventory`);
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "Gagal menyimpan barang inventori.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleArchive = async (item: InventoryItem) => {
    if (!window.confirm(`Arsipkan ${item.name}? Riwayat pergerakan stok tetap disimpan.`)) return;
    setError(null);
    setSuccess(null);
    try {
      await archiveInventoryItem(item.id);
      setSuccess(`${item.name} berhasil diarsipkan. Riwayatnya tetap tersimpan.`);
      await loadInventory();
    } catch (archiveError: unknown) {
      setError(archiveError instanceof Error ? archiveError.message : "Gagal mengarsipkan barang.");
    }
  };

  const handleMovement = async (event: FormEvent) => {
    event.preventDefault();
    if (!movementItem) return;
    const quantity = Number(movementQuantity);
    const unitCost = movementCost.trim() ? Number(movementCost) : null;
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setError("Jumlah harus lebih besar dari nol.");
      return;
    }
    if (unitCost !== null && (!Number.isFinite(unitCost) || unitCost < 0)) {
      setError("Harga satuan harus nol atau lebih.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await recordInventoryMovement({
        itemId: movementItem.id,
        movementType,
        quantity,
        userName: currentUser?.name || "Pengguna",
        unitCost,
        reference: movementReference,
        note: movementNote
      });
      setMovementItem(null);
      setMovementQuantity("");
      setMovementCost("");
      setMovementReference("");
      setMovementNote("");
      setSuccess(movementType === "IN" ? "Stok masuk berhasil dicatat." : "Pemakaian stok berhasil dicatat.");
      await loadInventory();
    } catch (movementError: unknown) {
      setError(movementError instanceof Error ? movementError.message : "Gagal mencatat pergerakan stok.");
    } finally {
      setSubmitting(false);
    }
  };

  const patientNameForMovement = (movement: InventoryMovement) => {
    const visit = visits.find((row) => row.id === movement.patientVisitId);
    return patients.find((patient) => patient.id === visit?.patientId)?.fullName;
  };

  const sections = [
    { id: "list", label: "Daftar Stok", href: `${rolePrefix}/inventory`, icon: Boxes },
    ...(canManage ? [{ id: "new", label: "Tambah Barang", href: `${rolePrefix}/inventory/new`, icon: PackagePlus }] : []),
    { id: "recipes", label: "Resep Tindakan", href: `${rolePrefix}/inventory/recipes`, icon: ClipboardList },
    { id: "history", label: "Riwayat Perubahan", href: `${rolePrefix}/inventory/history`, icon: History },
    { id: "low-stock", label: `Stok Menipis${lowStockCount ? ` (${lowStockCount})` : ""}`, href: `${rolePrefix}/inventory/low-stock`, icon: AlertTriangle }
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-[#9a7a35]">
            <Boxes className="h-4 w-4" /> OPERASIONAL KLINIK
          </div>
          <h1 className="mt-1 text-2xl font-black text-[#17233C]">Inventori Stok</h1>
          <p className="mt-1 text-sm text-slate-500">Pantau bahan tindakan dan perlengkapan klinik per cabang.</p>
        </div>
        {canManage && (
          <button type="button" onClick={openCreateForm} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#c5a059] px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-[#ad873b]">
            <Plus className="h-4 w-4" /> Tambah Barang
          </button>
        )}
      </div>

      <nav aria-label="Menu inventori" className="flex gap-2 overflow-x-auto rounded-2xl border border-[#eadfca] bg-white p-2 shadow-sm">
        {sections.map((section) => {
          const Icon = section.icon;
          const active = (section.id === "history" && activeView === "history")
            || (section.id === "low-stock" && activeView === "low-stock")
            || (section.id === "recipes" && activeView === "recipes")
            || (section.id === "list" && activeView === "list" && !path.endsWith("/new"));
          return (
            <button key={section.id} type="button" onClick={() => navigate(section.href)} className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2.5 text-xs font-bold transition-colors ${active ? "bg-[#17233C] text-white shadow-sm" : "text-slate-600 hover:bg-[#faf6ec] hover:text-[#8a6f27]"}`}>
              <Icon className={`h-4 w-4 ${active ? "text-[#ebd4a8]" : "text-[#b18a3b]"}`} />
              {section.label}
            </button>
          );
        })}
      </nav>

      {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
      {success && <div role="status" className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"><Check className="mt-0.5 h-4 w-4 shrink-0" />{success}</div>}

      <section className="rounded-2xl border border-[#eadfca] bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="font-bold text-[#17233C]">{activeView === "history" ? "Riwayat Perubahan Stok" : activeView === "low-stock" ? "Barang yang Perlu Segera Dipesan" : activeView === "recipes" ? "Koreksi Resep Bahan Tindakan" : "Daftar Barang"}</h2>
            <p className="mt-1 text-xs text-slate-500">{selectedBranch?.name || (effectiveBranchId ? "Cabang dipilih" : "Semua cabang")}</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            {isSuper && (
              <select value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-[#c5a059] focus:outline-none">
                <option value="ALL">Semua Cabang</option>
                {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </select>
            )}
            {activeView !== "history" && (
              <label className="relative block">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari kode atau nama barang" className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm focus:border-[#c5a059] focus:outline-none sm:w-64" />
              </label>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500"><Clock3 className="h-4 w-4 animate-spin" /> Memuat inventori...</div>
        ) : activeView === "recipes" ? (
          <InventoryRecipeManagement
            branchId={effectiveBranchId}
            branchName={selectedBranch?.name || null}
            services={services}
            inventoryItems={items}
            role={currentUser?.role || UserRole.PATIENT}
            userName={currentUser?.name || "Pengguna klinik"}
            onBranchRequired={() => setBranchFilter(branches[0]?.id || "ALL")}
          />
        ) : activeView === "history" ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-xs">
              <thead className="bg-[#faf6ec] text-[10px] uppercase tracking-wider text-[#80652c]">
                <tr>{["Waktu", "Barang", "Perubahan", "Saldo", "Petugas", "Pasien / Tindakan", "Catatan"].map((heading) => <th key={heading} className="px-3 py-3 font-bold">{heading}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {historyItemFilter && (
                  <tr>
                    <td colSpan={7} className="bg-white px-3 py-2 text-[11px] text-slate-500">
                      Riwayat difilter untuk {items.find((item) => item.id === historyItemFilter)?.name || "barang terpilih"}.
                      <button type="button" onClick={() => setHistoryItemFilter(null)} className="ml-2 font-bold text-[#8a6f27]">Tampilkan semua</button>
                    </td>
                  </tr>
                )}
                {movements.map((movement) => {
                  const item = items.find((row) => row.id === movement.itemId);
                  return (
                    <tr key={movement.id} className="hover:bg-slate-50/70">
                      <td className="whitespace-nowrap px-3 py-3 text-slate-500">{formatDate(movement.createdAt)}</td>
                      <td className="px-3 py-3"><div className="font-bold text-slate-800">{item?.name || "Barang diarsipkan"}</div><div className="text-slate-400">{item?.itemCode}</div></td>
                      <td className={`whitespace-nowrap px-3 py-3 font-bold ${movement.movementType === "IN" ? "text-emerald-700" : "text-rose-700"}`}>{movement.movementType === "IN" ? "+" : "−"}{formatQuantity(movement.quantity)} {item?.unit}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-slate-600">{formatQuantity(movement.previousStock)} → <b>{formatQuantity(movement.newStock)}</b></td>
                      <td className="px-3 py-3 text-slate-600">{movement.performedByName}</td>
                      <td className="px-3 py-3 text-slate-600">{patientNameForMovement(movement) || movement.reference || "—"}{movement.treatmentJobId && <div className="text-[10px] text-[#9a7a35]">Terkait tindakan pasien</div>}</td>
                      <td className="max-w-48 px-3 py-3 text-slate-500">{movement.note || "—"}</td>
                    </tr>
                  );
                })}
                {movements.length === 0 && <tr><td colSpan={7} className="py-12 text-center text-slate-400">Belum ada riwayat pergerakan stok.</td></tr>}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-left text-xs">
              <thead className="bg-[#faf6ec] text-[10px] uppercase tracking-wider text-[#80652c]">
                <tr>{["Kode Barang", "Nama Barang", "Kategori", "Satuan", "Stok Saat Ini", "Batas Minimum", "Lokasi / Cabang", "Status", "Aksi"].map((heading) => <th key={heading} className="px-3 py-3 font-bold">{heading}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredItems.map((item) => {
                  const status = statusFor(item);
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/70">
                      <td className="whitespace-nowrap px-3 py-3 font-bold text-[#8a6f27]">{item.itemCode}</td>
                      <td className="px-3 py-3 font-bold text-slate-800">{item.name}</td>
                      <td className="px-3 py-3 text-slate-600">{categoryOptions.find((option) => option.value === item.category)?.label || item.category}</td>
                      <td className="px-3 py-3 text-slate-600">{item.unit}</td>
                      <td className={`whitespace-nowrap px-3 py-3 text-sm font-black ${item.currentStock <= 0 ? "text-rose-700" : item.currentStock <= item.minimumStock ? "text-amber-700" : "text-emerald-700"}`}>{formatQuantity(item.currentStock)}</td>
                      <td className="px-3 py-3 text-slate-600">{formatQuantity(item.minimumStock)} {item.unit}</td>
                      <td className="px-3 py-3 text-slate-600">{item.storageLocation || "—"}<div className="text-[10px] text-slate-400">{branches.find((branch) => branch.id === item.branchId)?.name || "Cabang"}</div></td>
                      <td className="px-3 py-3"><span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-bold ${status.className}`}>{status.label}</span></td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1">
                          {canManage && <button type="button" title="Ubah barang" onClick={() => openEditForm(item)} className="rounded-lg p-2 text-slate-500 hover:bg-[#faf6ec] hover:text-[#8a6f27]"><Edit3 className="h-4 w-4" /></button>}
                          {canManage && <button type="button" title="Arsipkan barang" onClick={() => void handleArchive(item)} className="rounded-lg p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>}
                          <button type="button" title={canManage ? "Catat stok masuk/keluar" : "Catat pemakaian stok"} onClick={() => { setMovementItem(item); setMovementType(canManage ? "IN" : "OUT"); }} className={`rounded-lg p-2 text-slate-500 ${canManage ? "hover:bg-emerald-50 hover:text-emerald-700" : "hover:bg-rose-50 hover:text-rose-700"}`}>{canManage ? <ArrowUpRight className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}</button>
                          <button type="button" title="Lihat riwayat barang" onClick={() => { setHistoryItemFilter(item.id); navigate(`${rolePrefix}/inventory/history`); }} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"><ChevronRight className="h-4 w-4" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredItems.length === 0 && <tr><td colSpan={9} className="py-12 text-center text-slate-400">{activeView === "low-stock" ? "Tidak ada barang yang sedang menipis." : "Barang inventori belum tersedia."}</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        {activeView !== "history" && (
          <div className="mt-4 flex flex-wrap gap-4 border-t border-slate-100 pt-3 text-[11px] text-slate-500">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />Aman</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" />Menipis (stok ≤ minimum)</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-rose-500" />Kritis (stok habis)</span>
          </div>
        )}
      </section>

      {showItemForm && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-slate-950/40 p-4">
          <form onSubmit={(event) => void handleSaveItem(event)} className="my-8 w-full max-w-xl space-y-4 rounded-2xl border border-[#eadfca] bg-white p-5 shadow-xl sm:p-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div><h2 className="font-bold text-[#17233C]">{editingItem ? "Ubah Barang" : "Tambah Barang Inventori"}</h2><p className="mt-1 text-xs text-slate-500">Isi data barang dan batas peringatan stok.</p></div>
              <button type="button" onClick={() => { setShowItemForm(false); if (path.endsWith("/new")) navigate(`${rolePrefix}/inventory`); }} aria-label="Tutup" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
            </div>
            {isSuper && (
              <label className="block space-y-1 text-xs font-semibold text-slate-600">Cabang
                <select value={editingItem?.branchId || effectiveBranchId || selectedBranchId || branches[0]?.id || ""} onChange={(event) => setBranchFilter(event.target.value)} disabled={!!editingItem} required className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
                  <option value="">Pilih cabang</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                </select>
              </label>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-xs font-semibold text-slate-600">Kode Barang<input value={form.itemCode} onChange={(event) => setForm({ ...form, itemCode: event.target.value })} required maxLength={40} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" placeholder="BAH-001" /></label>
              <label className="space-y-1 text-xs font-semibold text-slate-600">Nama Barang<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required maxLength={160} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" placeholder="Contoh: Sarung tangan nitril" /></label>
              <label className="space-y-1 text-xs font-semibold text-slate-600">Kategori<select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value as InventoryCategory })} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">{categoryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
              <label className="space-y-1 text-xs font-semibold text-slate-600">Satuan<input value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })} required maxLength={30} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" placeholder="pcs, kotak, botol" /></label>
              <label className="space-y-1 text-xs font-semibold text-slate-600">Batas Minimum Stok<input type="number" min="0" step="0.01" value={form.minimumStock} onChange={(event) => setForm({ ...form, minimumStock: event.target.value })} required className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" /></label>
              <label className="space-y-1 text-xs font-semibold text-slate-600">{editingItem ? `Tambah Stok (${editingItem.unit})` : "Stok Awal"}
                <input type="number" min="0" step="0.01" value={form.initialStock} onChange={(event) => setForm({ ...form, initialStock: event.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
                <span className="block text-[10px] font-normal text-slate-400">{editingItem ? "Jumlah ini akan ditambahkan ke stok saat ini dan dicatat di riwayat stok masuk. Isi 0 jika tidak menambah stok." : "Dicatat sebagai transaksi stok masuk."}</span>
              </label>
              <label className="space-y-1 text-xs font-semibold text-slate-600 sm:col-span-2">Lokasi Penyimpanan<input value={form.storageLocation} onChange={(event) => setForm({ ...form, storageLocation: event.target.value })} maxLength={160} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" placeholder="Contoh: Lemari steril lantai 1" /></label>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
              <button type="button" onClick={() => setShowItemForm(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600">Batal</button>
              <button type="submit" disabled={submitting} className="rounded-xl bg-[#c5a059] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{submitting ? "Menyimpan..." : "Simpan Barang"}</button>
            </div>
          </form>
        </div>
      )}

      {movementItem && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-slate-950/40 p-4">
          <form onSubmit={(event) => void handleMovement(event)} className="my-8 w-full max-w-lg space-y-4 rounded-2xl border border-[#eadfca] bg-white p-5 shadow-xl sm:p-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div><h2 className="font-bold text-[#17233C]">Catat Perubahan Stok</h2><p className="mt-1 text-xs text-slate-500">{movementItem.itemCode} · {movementItem.name} · tersedia {formatQuantity(movementItem.currentStock)} {movementItem.unit}</p></div>
              <button type="button" onClick={() => setMovementItem(null)} aria-label="Tutup" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {canManage && <button type="button" onClick={() => setMovementType("IN")} className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-bold ${movementType === "IN" ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-slate-200 text-slate-500"}`}><ArrowDownLeft className="h-4 w-4" />Barang Masuk</button>}
              <button type="button" onClick={() => setMovementType("OUT")} className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-bold ${movementType === "OUT" ? "border-rose-300 bg-rose-50 text-rose-800" : "border-slate-200 text-slate-500"}`}><ArrowUpRight className="h-4 w-4" />Pemakaian</button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-xs font-semibold text-slate-600">Jumlah ({movementItem.unit})<input autoFocus type="number" min="0.01" step="0.01" required value={movementQuantity} onChange={(event) => setMovementQuantity(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" /></label>
              {movementType === "IN" && <label className="space-y-1 text-xs font-semibold text-slate-600">Harga Satuan (opsional)<input type="number" min="0" step="0.01" value={movementCost} onChange={(event) => setMovementCost(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" /></label>}
              <label className="space-y-1 text-xs font-semibold text-slate-600 sm:col-span-2">Referensi<input value={movementReference} onChange={(event) => setMovementReference(event.target.value)} maxLength={160} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" placeholder={movementType === "IN" ? "Nomor nota / pemasok" : "Alasan pengeluaran"}/></label>
              <label className="space-y-1 text-xs font-semibold text-slate-600 sm:col-span-2">Catatan<textarea value={movementNote} onChange={(event) => setMovementNote(event.target.value)} rows={2} maxLength={500} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" /></label>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
              <button type="button" onClick={() => setMovementItem(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600">Batal</button>
              <button type="submit" disabled={submitting} className="rounded-xl bg-[#17233C] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{submitting ? "Mencatat..." : "Simpan Perubahan"}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
