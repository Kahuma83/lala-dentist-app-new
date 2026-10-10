import React, { useState, useEffect } from "react";
import { useApp } from "../context/AppContext";
import { useRouter } from "../components/Router";
import {
  PaymentTransaction,
  PaymentMethod,
  UserRole,
  Invoice,
  JournalEntry,
  JournalSourceType,
  ClinicBranding,
  TreatmentJob
} from "../types/domain";
import {
  CreditCard,
  Search,
  CheckCircle2,
  Building2,
  DollarSign,
  QrCode,
  Smartphone,
  Landmark,
  TrendingUp,
  BookOpen,
  RefreshCw,
  Printer,
  Trash2,
  AlertTriangle
} from "lucide-react";
import { ReceiptDocumentModal } from "../components/documents/ReceiptDocumentModal";
import { DEFAULT_CLINIC_BRANDING } from "../data/mockData";
import { OperationalHubTabs } from "../components/common/OperationalHubTabs";

export const Payments: React.FC = () => {
  const {
    currentUser,
    doctors,
    paymentRepo,
    invoiceRepo,
    patientRepo,
    branchRepo,
    treatmentRepo,
    configRepo,
    accountingRepo,
    accountingPostingService,
    refreshData
  } = useApp();
  const { navigate } = useRouter();

  const [payments, setPayments] = useState<PaymentTransaction[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [patients, setPatients] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [treatments, setTreatments] = useState<TreatmentJob[]>([]);
  const [journals, setJournals] = useState<JournalEntry[]>([]);
  const [branding, setBranding] = useState<ClinicBranding>(DEFAULT_CLINIC_BRANDING);
  const [loading, setLoading] = useState(true);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<PaymentTransaction | null>(null);
  const [paymentToDelete, setPaymentToDelete] = useState<PaymentTransaction | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [methodFilter, setMethodFilter] = useState<string>("ALL");
  const [branchFilter, setBranchFilter] = useState<string>("ALL");

  const loadData = async () => {
    setLoading(true);
    try {
      const results = await Promise.allSettled([
        paymentRepo.getPayments(currentUser?.role, currentUser?.branchId),
        invoiceRepo.getInvoices(currentUser?.role, currentUser?.branchId),
        patientRepo.getPatients(),
        branchRepo.getBranches(),
        accountingRepo.getJournals(
          currentUser?.role === UserRole.BRANCH_ADMIN && currentUser.branchId
            ? { branchId: currentUser.branchId }
            : undefined
        ),
        configRepo.getClinicBranding(),
        treatmentRepo.listTreatments(currentUser?.role, currentUser?.branchId)
      ]);

      const [pmtRes, invRes, patRes, bRes, jRes, brandRes, trRes] = results;
      if (pmtRes.status === "fulfilled") setPayments(pmtRes.value);
      if (invRes.status === "fulfilled") setInvoices(invRes.value);
      if (patRes.status === "fulfilled") setPatients(patRes.value);
      if (bRes.status === "fulfilled") setBranches(bRes.value);
      if (jRes.status === "fulfilled") setJournals(jRes.value);
      if (brandRes.status === "fulfilled" && brandRes.value) setBranding(brandRes.value);
      if (trRes.status === "fulfilled" && trRes.value) setTreatments(trRes.value);
    } catch (err: any) {
      console.error("Error loading payments:", err);
    } finally {
      setLoading(false);
    }
  };

  const getDoctorNameForInvoice = (invoiceId?: string) => {
    if (!invoiceId) return undefined;
    const inv = invoices.find((i) => i.id === invoiceId);
    if (!inv) return undefined;
    const tr = treatments.find(
      (t) => t.visitId === inv.visitId || (t.patientId === inv.patientId && t.branchId === inv.branchId)
    );
    if (tr?.doctorNameSnapshot) return tr.doctorNameSnapshot;
    if (tr?.doctorId) {
      const doc = doctors.find((d) => d.id === tr.doctorId);
      if (doc) return doc.name || doc.fullName;
    }
    const branchDoc = doctors.find((d) => d.assignedBranchId === inv.branchId && (d.active ?? true));
    if (branchDoc) return branchDoc.name || branchDoc.fullName;
    return undefined;
  };

  const getPaymentJournal = (paymentId: string) => {
    return journals.find(
      (j) => j.sourceType === JournalSourceType.PAYMENT && j.sourceId === paymentId
    );
  };

  const handleSyncPayment = async (paymentId: string) => {
    setSyncingId(paymentId);
    try {
      await accountingPostingService.postPayment(
        paymentId,
        currentUser?.role,
        currentUser?.branchId,
        currentUser?.name || "Kasir"
      );
      await loadData();
      await refreshData();
    } catch (err: any) {
      console.error(err.message || "Gagal memposting pembayaran ke akuntansi");
    } finally {
      setSyncingId(null);
    }
  };

  const handleConfirmDeletePayment = async () => {
    if (!paymentToDelete) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await paymentRepo.deletePayment(paymentToDelete.id, currentUser?.role, currentUser?.branchId);
      await loadData();
      await refreshData();
      setPaymentToDelete(null);
    } catch (err: any) {
      setDeleteError(err.message || "Gagal menghapus transaksi pembayaran");
    } finally {
      setIsDeleting(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentUser]);

  const getInvoice = (invoiceId: string) => {
    return invoices.find((inv) => inv.id === invoiceId);
  };

  const getPatientForInvoice = (invoiceId: string) => {
    const inv = getInvoice(invoiceId);
    if (!inv) return null;
    return patients.find((p) => p.id === inv.patientId) || null;
  };

  const getPatientNameForInvoice = (invoiceId: string) => {
    const p = getPatientForInvoice(invoiceId);
    return p ? p.fullName : "Pasien";
  };

  const getBranchForInvoice = (invoiceId: string) => {
    const inv = getInvoice(invoiceId);
    if (!inv) return null;
    return branches.find((b) => b.id === inv.branchId) || null;
  };

  const getBranchNameForInvoice = (invoiceId: string) => {
    const b = getBranchForInvoice(invoiceId);
    return b ? b.name : "Klinik";
  };

  // Metrics
  const totalCollected = payments.reduce((sum, p) => sum + p.amount, 0);
  const qrisCollected = payments
    .filter((p) => p.paymentMethod === PaymentMethod.QRIS)
    .reduce((sum, p) => sum + p.amount, 0);
  const cashCollected = payments
    .filter((p) => p.paymentMethod === PaymentMethod.CASH)
    .reduce((sum, p) => sum + p.amount, 0);
  const cardCollected = payments
    .filter(
      (p) =>
        p.paymentMethod === PaymentMethod.TRANSFER ||
        p.paymentMethod === PaymentMethod.OTHER
    )
    .reduce((sum, p) => sum + p.amount, 0);

  const filteredPayments = payments.filter((p) => {
    const inv = getInvoice(p.invoiceId);
    const patName = getPatientNameForInvoice(p.invoiceId).toLowerCase();
    const matchesSearch =
      p.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.receiptNumber && p.receiptNumber.toLowerCase().includes(searchQuery.toLowerCase())) ||
      p.invoiceId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (inv?.invoiceNumber && inv.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase())) ||
      patName.includes(searchQuery.toLowerCase()) ||
      (p.referenceNumber && p.referenceNumber.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesMethod = methodFilter === "ALL" || p.paymentMethod === methodFilter;
    const matchesBranch =
      branchFilter === "ALL" || (inv && inv.branchId === branchFilter);

    return matchesSearch && matchesMethod && matchesBranch;
  });

  const handleOpenReceipt = (payment: PaymentTransaction) => {
    setSelectedPayment(payment);
    setShowReceiptModal(true);
  };

  const getMethodIcon = (method: PaymentMethod) => {
    switch (method) {
      case PaymentMethod.QRIS:
        return <QrCode className="w-3.5 h-3.5 text-emerald-600" />;
      case PaymentMethod.CASH:
        return <DollarSign className="w-3.5 h-3.5 text-amber-600" />;
      case PaymentMethod.TRANSFER:
        return <Landmark className="w-3.5 h-3.5 text-purple-600" />;
      default:
        return <Smartphone className="w-3.5 h-3.5 text-teal-600" />;
    }
  };

  return (
    <div className="space-y-6" id="payments-page">
      <OperationalHubTabs hub="cashier" />

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <CreditCard className="w-6 h-6 text-emerald-600" />
          Penerimaan Kasir & Transaksi Pembayaran
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Rekapitulasi log pembayaran real-time dari seluruh kanal kasir (Tunai, QRIS, Debit, Transfer) & Kwitansi Resmi
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Total Kas Diterima</div>
            <div className="text-base font-bold text-slate-900 mt-0.5">
              Rp {totalCollected.toLocaleString("id-ID")}
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center font-bold">
            <QrCode className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">QRIS Digital</div>
            <div className="text-base font-bold text-teal-700 mt-0.5">
              Rp {qrisCollected.toLocaleString("id-ID")}
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
            <DollarSign className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Tunai (Cash Fisik)</div>
            <div className="text-base font-bold text-amber-700 mt-0.5">
              Rp {cashCollected.toLocaleString("id-ID")}
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            <CreditCard className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Kartu & Transfer Bank</div>
            <div className="text-base font-bold text-blue-700 mt-0.5">
              Rp {cardCollected.toLocaleString("id-ID")}
            </div>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Cari transaksi, no kwitansi, no faktur, ref, atau pasien..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {currentUser?.role === UserRole.SUPER_ADMIN && (
            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="ALL">Semua Cabang Klinik</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}

          <select
            value={methodFilter}
            onChange={(e) => setMethodFilter(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="ALL">Semua Metode Bayar</option>
            <option value={PaymentMethod.CASH}>Tunai (Cash)</option>
            <option value={PaymentMethod.QRIS}>QRIS</option>
            <option value={PaymentMethod.TRANSFER}>Transfer / Kartu</option>
            <option value={PaymentMethod.OTHER}>Lainnya / Asuransi</option>
          </select>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                <th className="py-3 px-4">Waktu Transaksi</th>
                <th className="py-3 px-4">No. Kwitansi / Transaksi</th>
                <th className="py-3 px-4">Rujukan No. Faktur</th>
                <th className="py-3 px-4">Pasien & Cabang</th>
                <th className="py-3 px-4">Metode & Ref</th>
                <th className="py-3 px-4 text-right">Nominal</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-center">Jurnal</th>
                <th className="py-3 px-4 text-center">Aksi Kwitansi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400">
                    Memuat data kasir...
                  </td>
                </tr>
              ) : filteredPayments.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400">
                    Belum ada transaksi pembayaran yang cocok.
                  </td>
                </tr>
              ) : (
                filteredPayments.map((p) => {
                  const jrn = getPaymentJournal(p.id);
                  const linkedInv = getInvoice(p.invoiceId);
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-4 font-mono text-slate-500">
                        <div>
                          {new Date(p.transactionDateTime).toLocaleDateString("id-ID", {
                            day: "numeric",
                            month: "short",
                            year: "numeric"
                          })}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {new Date(p.transactionDateTime).toLocaleTimeString("id-ID", {
                            hour: "2-digit",
                            minute: "2-digit"
                          })}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono font-medium text-slate-900">
                        <div className="text-slate-900 font-bold">{p.receiptNumber || p.id}</div>
                        {p.receiptNumber && p.receiptNumber !== p.id && (
                          <div className="text-[10px] text-slate-400">ID: {p.id}</div>
                        )}
                        <div className="text-[10px] text-slate-400">Kasir: {p.staffId}</div>
                      </td>
                      <td className="py-3.5 px-4 font-mono font-semibold text-emerald-700">
                        <div>{linkedInv?.invoiceNumber || p.invoiceId}</div>
                        {linkedInv?.invoiceNumber && linkedInv.invoiceNumber !== p.invoiceId && (
                          <div className="text-[10px] text-slate-400 font-mono">ID: {p.invoiceId}</div>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900">
                          {getPatientNameForInvoice(p.invoiceId)}
                        </div>
                        <div className="text-[10px] text-slate-400 flex items-center gap-1">
                          <Building2 className="w-3 h-3" />
                          {getBranchNameForInvoice(p.invoiceId)}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center gap-1.5 font-medium text-slate-800">
                          {getMethodIcon(p.paymentMethod)}
                          {p.paymentMethod}
                        </span>
                        {p.referenceNumber && (
                          <div className="text-[10px] font-mono text-slate-400">
                            Ref: {p.referenceNumber}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right font-bold text-slate-900">
                        Rp {p.amount.toLocaleString("id-ID")}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3" />
                          {p.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        {jrn ? (
                          <button
                            onClick={() => navigate("/accounting")}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition-colors"
                            title="Buka jurnal di Akuntansi"
                          >
                            <BookOpen className="w-3 h-3" />
                            {jrn.journalNumber}
                          </button>
                        ) : (
                          <button
                            onClick={() => handleSyncPayment(p.id)}
                            disabled={syncingId === p.id}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors disabled:opacity-50"
                            title="Post settlement ke akuntansi"
                          >
                            <RefreshCw className={`w-3 h-3 ${syncingId === p.id ? "animate-spin" : ""}`} />
                            Sync
                          </button>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => handleOpenReceipt(p)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 transition-colors"
                            title="Cetak Kwitansi / PDF / WhatsApp"
                          >
                            <Printer className="w-3.5 h-3.5 text-teal-600" />
                            <span>Kwitansi</span>
                          </button>
                          {(currentUser?.role === UserRole.SUPER_ADMIN || currentUser?.role === UserRole.BRANCH_ADMIN) && (
                            <button
                              onClick={() => {
                                setDeleteError(null);
                                setPaymentToDelete(p);
                              }}
                              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                              title="Hapus Transaksi (Koreksi Admin)"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Receipt Document Presentation / Print / PDF / WhatsApp */}
      {showReceiptModal && selectedPayment && (
        <ReceiptDocumentModal
          isOpen={showReceiptModal}
          onClose={() => setShowReceiptModal(false)}
          payment={selectedPayment}
          invoice={getInvoice(selectedPayment.invoiceId)}
          patient={getPatientForInvoice(selectedPayment.invoiceId)}
          branch={getBranchForInvoice(selectedPayment.invoiceId)}
          branding={branding}
          cashierName={currentUser?.name || selectedPayment.staffId || "Petugas Kasir"}
          doctorName={getDoctorNameForInvoice(selectedPayment.invoiceId)}
        />
      )}

      {/* Modal: Delete Payment Confirmation */}
      {paymentToDelete && (
        <div className="fixed inset-0 z-[70] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-2.5 bg-rose-50 rounded-xl">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-base">Konfirmasi Hapus Pembayaran</h3>
                <p className="text-xs text-slate-500">Koreksi Transaksi Keuangan Admin</p>
              </div>
            </div>

            {deleteError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl font-medium">
                {deleteError}
              </div>
            )}

            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">No. Kwitansi:</span>
                <span className="font-mono font-bold text-slate-900">{paymentToDelete.receiptNumber || paymentToDelete.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Nominal:</span>
                <span className="font-bold text-slate-900">Rp {paymentToDelete.amount.toLocaleString("id-ID")}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Metode Bayar:</span>
                <span className="font-medium text-slate-800">{paymentToDelete.paymentMethod}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Pasien:</span>
                <span className="font-medium text-slate-800">{getPatientNameForInvoice(paymentToDelete.invoiceId)}</span>
              </div>
            </div>

            <p className="text-xs text-slate-600">
              Apakah Anda yakin ingin menghapus transaksi pembayaran ini? Sisa tagihan pada invoice terkait akan dikalkulasi ulang secara otomatis.
            </p>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setPaymentToDelete(null)}
                disabled={isDeleting}
                className="px-4 py-2 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmDeletePayment}
                disabled={isDeleting}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isDeleting ? "Menghapus..." : "Ya, Hapus Transaksi"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
