import React, { useState, useEffect } from "react";
import { useApp } from "../context/AppContext";
import { useRouter } from "../components/Router";
import {
  Invoice,
  InvoiceItem,
  InvoiceStatus,
  PaymentMethod,
  UserRole,
  PaymentTransaction,
  JournalEntry,
  JournalSourceType,
  JournalStatus,
  ClinicBranding,
  TreatmentJob
} from "../types/domain";
import {
  Receipt,
  Plus,
  Search,
  Filter,
  CreditCard,
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
  Eye,
  DollarSign,
  Printer,
  ChevronRight,
  ShieldAlert,
  Building2,
  Calendar,
  User,
  FileText,
  BookOpen,
  ArrowUpRight,
  MessageSquare,
  Download,
  Trash2,
  AlertTriangle
} from "lucide-react";
import { InvoiceDocumentModal } from "../components/documents/InvoiceDocumentModal";
import { DEFAULT_CLINIC_BRANDING } from "../data/mockData";

export const Invoices: React.FC = () => {
  const {
    currentUser,
    doctors,
    invoiceRepo,
    paymentRepo,
    patientRepo,
    branchRepo,
    treatmentRepo,
    configRepo,
    accountingRepo,
    accountingPostingService,
    refreshData
  } = useApp();
  const { navigate } = useRouter();

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [patients, setPatients] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [treatments, setTreatments] = useState<TreatmentJob[]>([]);
  const [branding, setBranding] = useState<ClinicBranding>(DEFAULT_CLINIC_BRANDING);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [branchFilter, setBranchFilter] = useState<string>("ALL");

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showDocumentModal, setShowDocumentModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [selectedInvoiceItems, setSelectedInvoiceItems] = useState<InvoiceItem[]>([]);
  const [invoicePayments, setInvoicePayments] = useState<PaymentTransaction[]>([]);
  const [invoiceJournal, setInvoiceJournal] = useState<JournalEntry | null>(null);
  const [isSyncingAccounting, setIsSyncingAccounting] = useState(false);

  // Invoice Deletion & Cancellation State
  const [invoiceToDelete, setInvoiceToDelete] = useState<Invoice | null>(null);
  const [isDeletingInvoice, setIsDeletingInvoice] = useState(false);
  const [deleteInvoiceError, setDeleteInvoiceError] = useState<string | null>(null);
  const [invoiceToCancel, setInvoiceToCancel] = useState<Invoice | null>(null);
  const [isCancellingInvoice, setIsCancellingInvoice] = useState(false);

  // Create Form State
  const [formPatientId, setFormPatientId] = useState("");
  const [formBranchId, setFormBranchId] = useState(
    currentUser?.role === UserRole.BRANCH_ADMIN && currentUser?.branchId
      ? currentUser.branchId
      : "branch-gebang"
  );
  const [formItems, setFormItems] = useState<
    Array<{ serviceId: string; descriptionSnapshot: string; unitPriceSnapshot: number; quantity: number }>
  >([
    { serviceId: "service-scaling", descriptionSnapshot: "Scaling & Polishing", unitPriceSnapshot: 150000, quantity: 1 }
  ]);
  const [formDiscount, setFormDiscount] = useState<number>(0);
  const [formTax, setFormTax] = useState<number>(0);
  const [formError, setFormError] = useState("");

  // Payment Form State
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payMethod, setPayMethod] = useState<PaymentMethod>(PaymentMethod.CASH);
  const [payRef, setPayRef] = useState("");
  const [payError, setPayError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const results = await Promise.allSettled([
        invoiceRepo.getInvoices(currentUser?.role, currentUser?.branchId),
        patientRepo.getPatients(),
        branchRepo.getBranches(),
        configRepo.getServices(),
        configRepo.getClinicBranding(),
        treatmentRepo.listTreatments(currentUser?.role, currentUser?.branchId)
      ]);

      const [invRes, patRes, bRes, sRes, brandRes, trRes] = results;
      if (invRes.status === "fulfilled") setInvoices(invRes.value);
      if (patRes.status === "fulfilled") setPatients(patRes.value);
      if (bRes.status === "fulfilled") setBranches(bRes.value);
      if (sRes.status === "fulfilled") setServices(sRes.value);
      if (brandRes.status === "fulfilled" && brandRes.value) setBranding(brandRes.value);
      if (trRes.status === "fulfilled" && trRes.value) setTreatments(trRes.value);
    } catch (err: any) {
      console.error("Error loading invoice data:", err);
    } finally {
      setLoading(false);
    }
  };

  const getDoctorNameForInvoice = (inv: Invoice | null) => {
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

  const handleConfirmDeleteInvoice = async () => {
    if (!invoiceToDelete) return;
    setIsDeletingInvoice(true);
    setDeleteInvoiceError(null);
    try {
      await invoiceRepo.deleteInvoice(invoiceToDelete.id, currentUser?.role, currentUser?.branchId);
      await loadData();
      if (selectedInvoice?.id === invoiceToDelete.id) {
        setShowDetailModal(false);
        setSelectedInvoice(null);
      }
      setInvoiceToDelete(null);
    } catch (err: any) {
      setDeleteInvoiceError(err.message || "Gagal menghapus invoice");
    } finally {
      setIsDeletingInvoice(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentUser]);

  const getPatientName = (patientId: string) => {
    const p = patients.find((pat) => pat.id === patientId);
    return p ? p.fullName : patientId;
  };

  const getPatient = (patientId: string) => {
    return patients.find((pat) => pat.id === patientId);
  };

  const getBranch = (branchId: string) => {
    return branches.find((br) => br.id === branchId);
  };

  const getBranchName = (branchId: string) => {
    const b = branches.find((br) => br.id === branchId);
    return b ? b.name : branchId;
  };

  // Summary Metrics
  const totalInvoiced = invoices.reduce((sum, i) => sum + (i.status !== InvoiceStatus.CANCELLED ? i.netAmount : 0), 0);
  const totalPaid = invoices.reduce((sum, i) => sum + (i.status !== InvoiceStatus.CANCELLED ? i.paidAmount : 0), 0);
  const totalOutstanding = invoices.reduce((sum, i) => sum + (i.status !== InvoiceStatus.CANCELLED ? i.outstandingAmount : 0), 0);
  const openCount = invoices.filter((i) => i.status === InvoiceStatus.OPEN || i.status === InvoiceStatus.PARTIALLY_PAID).length;

  const filteredInvoices = invoices.filter((inv) => {
    const patName = getPatientName(inv.patientId).toLowerCase();
    const invIdMatch = inv.id.toLowerCase().includes(searchQuery.toLowerCase());
    const invNumMatch = inv.invoiceNumber ? inv.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase()) : false;
    const matchesSearch = invIdMatch || invNumMatch || patName.includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "ALL" || inv.status === statusFilter;
    const matchesBranch = branchFilter === "ALL" || inv.branchId === branchFilter;
    return matchesSearch && matchesStatus && matchesBranch;
  });

  const handleOpenPayment = async (inv: Invoice) => {
    setSelectedInvoice(inv);
    setPayAmount(inv.outstandingAmount);
    setPayMethod(PaymentMethod.CASH);
    setPayRef("");
    setPayError("");
    setShowPaymentModal(true);
  };

  const handleOpenDocument = async (inv: Invoice) => {
    setSelectedInvoice(inv);
    try {
      const items = await invoiceRepo.getInvoiceItems(inv.id);
      setSelectedInvoiceItems(items);
    } catch {
      setSelectedInvoiceItems([]);
    }
    setShowDocumentModal(true);
  };

  const handleOpenDetail = async (inv: Invoice) => {
    setSelectedInvoice(inv);
    try {
      const [pmts, jrn, items] = await Promise.all([
        paymentRepo.getPaymentsByInvoice(
          inv.id,
          currentUser?.role,
          currentUser?.branchId
        ),
        accountingRepo.findBySource(JournalSourceType.INVOICE, inv.id),
        invoiceRepo.getInvoiceItems(inv.id)
      ]);
      setInvoicePayments(pmts);
      setInvoiceJournal(jrn);
      setSelectedInvoiceItems(items);
    } catch {
      setInvoicePayments([]);
      setInvoiceJournal(null);
      setSelectedInvoiceItems([]);
    }
    setShowDetailModal(true);
  };

  const handleSyncInvoiceAccounting = async (inv: Invoice) => {
    setIsSyncingAccounting(true);
    try {
      const journal = await accountingPostingService.postInvoice(
        inv.id,
        currentUser?.role,
        currentUser?.branchId,
        currentUser?.name || "Kasir"
      );
      setInvoiceJournal(journal);
      await refreshData();
    } catch (err: any) {
      console.error(err.message || "Gagal memposting invoice ke akuntansi");
    } finally {
      setIsSyncingAccounting(false);
    }
  };

  const handleAddItem = () => {
    setFormItems([
      ...formItems,
      { serviceId: "service-scaling", descriptionSnapshot: "Scaling & Polishing", unitPriceSnapshot: 150000, quantity: 1 }
    ]);
  };

  const handleRemoveItem = (index: number) => {
    if (formItems.length === 1) return;
    setFormItems(formItems.filter((_, i) => i !== index));
  };

  const handleServiceSelect = (index: number, serviceId: string) => {
    const s = services.find((srv) => srv.id === serviceId);
    if (!s) return;
    const next = [...formItems];
    next[index] = {
      serviceId: s.id,
      descriptionSnapshot: s.name,
      unitPriceSnapshot: s.basePrice,
      quantity: next[index]?.quantity || 1
    };
    setFormItems(next);
  };

  const calculateFormTotal = () => {
    const subtotal = formItems.reduce((sum, item) => sum + item.quantity * item.unitPriceSnapshot, 0);
    return Math.max(0, subtotal - Number(formDiscount || 0) + Number(formTax || 0));
  };

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formPatientId) {
      setFormError("Pilih pasien terlebih dahulu");
      return;
    }
    if (formItems.length === 0) {
      setFormError("Minimal harus ada 1 item tindakan");
      return;
    }

    setIsSubmitting(true);
    setFormError("");
    try {
      const createdInv = await invoiceRepo.createInvoice(
        {
          visitId: `visit-manual-${Date.now()}`,
          patientId: formPatientId,
          branchId: formBranchId,
          items: formItems,
          discountAmount: Number(formDiscount || 0),
          taxAmount: Number(formTax || 0)
        },
        currentUser?.role,
        currentUser?.branchId
      );

      // Automatic Journal Posting
      try {
        await accountingPostingService.postInvoice(
          createdInv.id,
          currentUser?.role,
          currentUser?.branchId,
          currentUser?.name || "Kasir"
        );
      } catch (postErr) {
        console.warn("Auto-posting invoice journal:", postErr);
      }

      setShowCreateModal(false);
      await loadData();
      await refreshData();
    } catch (err: any) {
      setFormError(err.message || "Gagal membuat invoice");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleProcessPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoice) return;
    if (payAmount <= 0) {
      setPayError("Nominal pembayaran harus lebih dari 0");
      return;
    }
    if (payAmount > selectedInvoice.outstandingAmount) {
      setPayError(`Nominal tidak boleh melebihi sisa tagihan Rp ${selectedInvoice.outstandingAmount.toLocaleString("id-ID")}`);
      return;
    }

    setIsSubmitting(true);
    setPayError("");
    try {
      const newPayment = await paymentRepo.createPayment(
        {
          invoiceId: selectedInvoice.id,
          amount: Number(payAmount),
          paymentMethod: payMethod,
          referenceNumber: payRef || undefined,
          staffId: currentUser?.id || "admin"
        },
        currentUser?.role,
        currentUser?.branchId
      );

      // 1. Ensure Invoice Revenue Journal exists so AR balance matches
      try {
        const existingInvJournal = await accountingRepo.findBySource(JournalSourceType.INVOICE, selectedInvoice.id);
        if (!existingInvJournal) {
          await accountingPostingService.postInvoice(
            selectedInvoice.id,
            currentUser?.role,
            currentUser?.branchId,
            currentUser?.name || "Kasir"
          );
        }
      } catch (invPostErr) {
        console.warn("Auto-posting invoice journal before payment settlement:", invPostErr);
      }

      // 2. Automatic Journal Posting for Payment Settlement (Dr Cash/Bank, Cr AR)
      try {
        await accountingPostingService.postPayment(
          newPayment.id,
          currentUser?.role,
          currentUser?.branchId,
          currentUser?.name || "Kasir"
        );
      } catch (postErr) {
        console.warn("Auto-posting payment settlement journal:", postErr);
      }

      setShowPaymentModal(false);
      await loadData();
      await refreshData();
    } catch (err: any) {
      setPayError(err.message || "Gagal memproses pembayaran");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelInvoice = (inv: Invoice) => {
    setInvoiceToCancel(inv);
  };

  const handleConfirmCancelInvoice = async () => {
    if (!invoiceToCancel) return;
    setIsCancellingInvoice(true);
    try {
      await invoiceRepo.cancelInvoice(invoiceToCancel.id, currentUser?.role, currentUser?.branchId);
      await loadData();
      setInvoiceToCancel(null);
      setShowDetailModal(false);
    } catch (err: any) {
      console.error("Gagal membatalkan invoice:", err);
    } finally {
      setIsCancellingInvoice(false);
    }
  };

  return (
    <div className="space-y-6" id="invoices-page">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Receipt className="w-6 h-6 text-emerald-600" />
            Billing & Faktur Pembayaran Pasien
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Manajemen invoice tindakan, status pelunasan kasir, dan penagihan piutang pasien
          </p>
        </div>

        <button
          onClick={() => {
            setFormPatientId(patients[0]?.id || "");
            setFormError("");
            setShowCreateModal(true);
          }}
          className="inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-lg text-xs font-semibold shadow-sm transition-colors"
          id="btn-create-invoice"
        >
          <Plus className="w-4 h-4" />
          Terbitkan Invoice Baru
        </button>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            <DollarSign className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Total Tagihan (Net)</div>
            <div className="text-base font-bold text-slate-900 mt-0.5">
              Rp {totalInvoiced.toLocaleString("id-ID")}
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center font-bold">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Total Terbayar</div>
            <div className="text-base font-bold text-teal-700 mt-0.5">
              Rp {totalPaid.toLocaleString("id-ID")}
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Sisa Piutang Pasien</div>
            <div className="text-base font-bold text-amber-700 mt-0.5">
              Rp {totalOutstanding.toLocaleString("id-ID")}
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Invoice Belum Lunas</div>
            <div className="text-base font-bold text-slate-900 mt-0.5">
              {openCount} Faktur
            </div>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Cari no invoice atau nama pasien..."
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
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="ALL">Semua Status</option>
            <option value={InvoiceStatus.OPEN}>OPEN (Belum Bayar)</option>
            <option value={InvoiceStatus.PARTIALLY_PAID}>PARTIALLY PAID (Cicil)</option>
            <option value={InvoiceStatus.PAID}>PAID (Lunas)</option>
            <option value={InvoiceStatus.CANCELLED}>CANCELLED (Batal)</option>
          </select>
        </div>
      </div>

      {/* Invoice Table */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                <th className="py-3 px-4">No. Faktur</th>
                <th className="py-3 px-4">Pasien</th>
                <th className="py-3 px-4">Cabang</th>
                <th className="py-3 px-4 text-right">Total Netto</th>
                <th className="py-3 px-4 text-right">Sudah Dibayar</th>
                <th className="py-3 px-4 text-right">Sisa Tagihan</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-center">Aksi Kasir</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    Memuat daftar faktur...
                  </td>
                </tr>
              ) : filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    Tidak ada faktur invoice yang cocok dengan kriteria filter.
                  </td>
                </tr>
              ) : (
                filteredInvoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-medium text-slate-900">
                      <div>{inv.invoiceNumber || inv.id}</div>
                      {inv.invoiceNumber && inv.id !== inv.invoiceNumber && (
                        <div className="text-[10px] text-slate-400 font-mono">ID: {inv.id}</div>
                      )}
                      <div className="text-[10px] text-slate-400 font-sans">
                        {new Date(inv.createdAt).toLocaleDateString("id-ID", {
                          day: "numeric",
                          month: "short",
                          year: "numeric"
                        })}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-900">{getPatientName(inv.patientId)}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{inv.patientId}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center gap-1 text-slate-600">
                        <Building2 className="w-3 h-3 text-slate-400" />
                        {getBranchName(inv.branchId)}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-medium text-slate-900">
                      Rp {inv.netAmount.toLocaleString("id-ID")}
                    </td>
                    <td className="py-3.5 px-4 text-right font-medium text-emerald-700">
                      Rp {inv.paidAmount.toLocaleString("id-ID")}
                    </td>
                    <td className="py-3.5 px-4 text-right font-bold text-amber-700">
                      Rp {inv.outstandingAmount.toLocaleString("id-ID")}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${
                          inv.status === InvoiceStatus.PAID
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : inv.status === InvoiceStatus.PARTIALLY_PAID
                            ? "bg-blue-50 text-blue-700 border border-blue-200"
                            : inv.status === InvoiceStatus.CANCELLED
                            ? "bg-rose-50 text-rose-700 border border-rose-200"
                            : "bg-amber-50 text-amber-700 border border-amber-200"
                        }`}
                      >
                        {inv.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          onClick={() => handleOpenDocument(inv)}
                          className="p-1.5 text-teal-700 hover:text-teal-900 hover:bg-teal-50 rounded transition-colors border border-teal-200/60"
                          title="Cetak Faktur / PDF / WhatsApp"
                        >
                          <Printer className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => handleOpenDetail(inv)}
                          className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors"
                          title="Lihat Rincian / Riwayat"
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        {(currentUser?.role === UserRole.SUPER_ADMIN || currentUser?.role === UserRole.BRANCH_ADMIN) && (
                          <button
                            onClick={() => {
                              setDeleteInvoiceError(null);
                              setInvoiceToDelete(inv);
                            }}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                            title="Hapus Invoice (Koreksi Admin)"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}

                        {inv.status !== InvoiceStatus.PAID && inv.status !== InvoiceStatus.CANCELLED && (
                          <button
                            onClick={() => handleOpenPayment(inv)}
                            className="inline-flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 rounded text-[11px] font-semibold transition-colors shadow-xs"
                          >
                            <CreditCard className="w-3.5 h-3.5" />
                            Bayar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Create Invoice */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl border border-slate-100 max-w-xl w-full p-6 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Receipt className="w-5 h-5 text-emerald-600" />
                Terbitkan Faktur Invoice Pasien
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateInvoice} className="space-y-4 mt-4">
              {formError && (
                <div className="p-3 bg-rose-50 text-rose-700 rounded-lg text-xs flex items-center gap-2 border border-rose-100">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">
                    Pasien
                  </label>
                  <select
                    value={formPatientId}
                    onChange={(e) => setFormPatientId(e.target.value)}
                    required
                    className="w-full text-xs border border-slate-200 rounded-lg p-2 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">-- Pilih Pasien --</option>
                    {patients.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.fullName} ({p.nik})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">
                    Cabang Pelayanan
                  </label>
                  <select
                    value={formBranchId}
                    disabled={currentUser?.role === UserRole.BRANCH_ADMIN}
                    onChange={(e) => setFormBranchId(e.target.value)}
                    className="w-full text-xs border border-slate-200 rounded-lg p-2 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-75"
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Items Section */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-[11px] font-semibold text-slate-700 uppercase">
                    Rincian Tindakan & Layanan
                  </label>
                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="text-xs text-emerald-600 font-semibold hover:underline flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Tambah Baris
                  </button>
                </div>

                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {formItems.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 bg-slate-50 rounded-lg border border-slate-200/80 flex items-center gap-2"
                    >
                      <select
                        value={item.serviceId}
                        onChange={(e) => handleServiceSelect(idx, e.target.value)}
                        className="flex-1 text-xs border border-slate-200 rounded p-1.5 bg-white"
                      >
                        {services.map((srv) => (
                          <option key={srv.id} value={srv.id}>
                            {srv.name} (Rp {srv.basePrice.toLocaleString("id-ID")})
                          </option>
                        ))}
                      </select>

                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => {
                          const val = Math.max(1, parseInt(e.target.value) || 1);
                          const next = [...formItems];
                          next[idx].quantity = val;
                          setFormItems(next);
                        }}
                        className="w-16 text-xs border border-slate-200 rounded p-1.5 bg-white text-center"
                        title="Jumlah"
                      />

                      <div className="w-24 text-right text-xs font-semibold text-slate-800">
                        Rp {(item.quantity * item.unitPriceSnapshot).toLocaleString("id-ID")}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveItem(idx)}
                        disabled={formItems.length === 1}
                        className="text-slate-400 hover:text-rose-500 disabled:opacity-30 p-1"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Discount & Tax */}
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">
                    Diskon (Rp)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formDiscount}
                    onChange={(e) => setFormDiscount(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full text-xs border border-slate-200 rounded p-1.5"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">
                    Pajak / Biaya Admin (Rp)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formTax}
                    onChange={(e) => setFormTax(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full text-xs border border-slate-200 rounded p-1.5"
                  />
                </div>
              </div>

              {/* Grand Total Preview */}
              <div className="bg-emerald-50 p-3 rounded-lg flex items-center justify-between border border-emerald-100">
                <span className="text-xs font-bold text-emerald-900">Total Akhir Faktur (Netto):</span>
                <span className="text-base font-extrabold text-emerald-800 font-mono">
                  Rp {calculateFormTotal().toLocaleString("id-ID")}
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs disabled:opacity-50"
                >
                  {isSubmitting ? "Menyimpan..." : "Terbitkan Invoice"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Process Cashier Payment */}
      {showPaymentModal && selectedInvoice && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-100 max-w-md w-full p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-emerald-600" />
                Penerimaan Pembayaran Kasir
              </h3>
              <button
                onClick={() => setShowPaymentModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleProcessPayment} className="space-y-4 mt-4">
              {payError && (
                <div className="p-3 bg-rose-50 text-rose-700 rounded-lg text-xs flex items-center gap-2 border border-rose-100">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{payError}</span>
                </div>
              )}

              <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 space-y-1">
                <div className="text-xs text-slate-500">
                  Faktur: <span className="font-mono font-bold text-slate-800">{selectedInvoice.id}</span>
                </div>
                <div className="text-xs text-slate-500">
                  Pasien: <span className="font-semibold text-slate-800">{getPatientName(selectedInvoice.patientId)}</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-slate-200/60 text-xs">
                  <span className="text-slate-500">Sisa Tagihan:</span>
                  <span className="font-bold text-amber-700">
                    Rp {selectedInvoice.outstandingAmount.toLocaleString("id-ID")}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">
                  Metode Pembayaran
                </label>
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
                  className="w-full text-xs border border-slate-200 rounded-lg p-2 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                >
                  <option value={PaymentMethod.CASH}>Tunai (Cash)</option>
                  <option value={PaymentMethod.QRIS}>QRIS Statis / Dinamis</option>
                  <option value={PaymentMethod.TRANSFER}>Transfer Bank / Kartu Debit</option>
                  <option value={PaymentMethod.OTHER}>Asuransi / Lainnya</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">
                  Nominal Dibayarkan (Rp)
                </label>
                <input
                  type="number"
                  min="1"
                  max={selectedInvoice.outstandingAmount}
                  value={payAmount}
                  onChange={(e) => setPayAmount(parseInt(e.target.value) || 0)}
                  required
                  className="w-full text-sm font-bold border border-slate-200 rounded-lg p-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <div className="flex gap-2 mt-1.5">
                  <button
                    type="button"
                    onClick={() => setPayAmount(selectedInvoice.outstandingAmount)}
                    className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-0.5 rounded font-medium"
                  >
                    Bayar Lunas (100%)
                  </button>
                  {selectedInvoice.outstandingAmount > 100000 && (
                    <button
                      type="button"
                      onClick={() => setPayAmount(Math.round(selectedInvoice.outstandingAmount / 2))}
                      className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-0.5 rounded font-medium"
                    >
                      Bayar 50%
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">
                  Nomor Referensi / Struk EDC / Approval Code
                </label>
                <input
                  type="text"
                  placeholder="Contoh: QRIS-9921 / TRF-BCA-128"
                  value={payRef}
                  onChange={(e) => setPayRef(e.target.value)}
                  className="w-full text-xs border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs disabled:opacity-50"
                >
                  {isSubmitting ? "Memproses..." : "Konfirmasi Pembayaran"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Invoice Detail & Payment History */}
      {showDetailModal && selectedInvoice && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl border border-slate-100 max-w-lg w-full p-6 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <FileText className="w-5 h-5 text-emerald-600" />
                Rincian Faktur #{selectedInvoice.id}
              </h3>
              <button
                onClick={() => setShowDetailModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 mt-4 text-xs">
              <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-lg border border-slate-100">
                <div>
                  <div className="text-slate-400 text-[10px]">Pasien</div>
                  <div className="font-semibold text-slate-800">{getPatientName(selectedInvoice.patientId)}</div>
                </div>
                <div>
                  <div className="text-slate-400 text-[10px]">Cabang</div>
                  <div className="font-semibold text-slate-800">{getBranchName(selectedInvoice.branchId)}</div>
                </div>
                <div>
                  <div className="text-slate-400 text-[10px]">Tanggal Terbit</div>
                  <div className="font-medium text-slate-700">
                    {new Date(selectedInvoice.createdAt).toLocaleString("id-ID")}
                  </div>
                </div>
                <div>
                  <div className="text-slate-400 text-[10px]">Status</div>
                  <div className="font-bold text-emerald-700">{selectedInvoice.status}</div>
                </div>
              </div>

              {/* Financial Breakdown */}
              <div className="border border-slate-200 rounded-lg p-3 space-y-1.5">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal Tindakan:</span>
                  <span>Rp {selectedInvoice.totalAmount.toLocaleString("id-ID")}</span>
                </div>
                {selectedInvoice.discountAmount > 0 && (
                  <div className="flex justify-between text-rose-600">
                    <span>Diskon:</span>
                    <span>- Rp {selectedInvoice.discountAmount.toLocaleString("id-ID")}</span>
                  </div>
                )}
                {selectedInvoice.taxAmount > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>Pajak / Biaya:</span>
                    <span>+ Rp {selectedInvoice.taxAmount.toLocaleString("id-ID")}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-slate-900 pt-1.5 border-t border-slate-100">
                  <span>Total Netto:</span>
                  <span>Rp {selectedInvoice.netAmount.toLocaleString("id-ID")}</span>
                </div>
                <div className="flex justify-between text-emerald-700 font-semibold">
                  <span>Sudah Dibayar:</span>
                  <span>Rp {selectedInvoice.paidAmount.toLocaleString("id-ID")}</span>
                </div>
                <div className="flex justify-between text-amber-700 font-bold text-sm pt-1 border-t border-slate-100">
                  <span>Sisa Piutang:</span>
                  <span>Rp {selectedInvoice.outstandingAmount.toLocaleString("id-ID")}</span>
                </div>
              </div>

              {/* Accounting Journal Integration */}
              <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-800 flex items-center gap-1.5 text-xs">
                    <BookOpen className="w-4 h-4 text-indigo-600" />
                    Status Jurnal Akuntansi (Double-Entry)
                  </h4>
                  {invoiceJournal ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                      <CheckCircle2 className="w-3 h-3" />
                      {invoiceJournal.journalNumber} ({invoiceJournal.status})
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600">
                      <Clock className="w-3 h-3" />
                      Belum Terposting
                    </span>
                  )}
                </div>

                {invoiceJournal ? (
                  <div className="space-y-1.5 pt-1">
                    <div className="text-[11px] text-slate-600 flex justify-between">
                      <span>Keterangan:</span>
                      <span className="font-medium text-slate-900">{invoiceJournal.description}</span>
                    </div>
                    <div className="text-[11px] text-slate-600 flex justify-between">
                      <span>Total Debit / Kredit:</span>
                      <span className="font-mono font-bold text-slate-900">
                        Rp {invoiceJournal.totalDebit.toLocaleString("id-ID")}
                      </span>
                    </div>
                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setShowDetailModal(false);
                          navigate("/accounting");
                        }}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800"
                      >
                        Buka di Buku Besar / Jurnal
                        <ArrowUpRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-slate-500 italic">
                      Jurnal pengakuan pendapatan belum dibentuk.
                    </span>
                    {selectedInvoice.status !== InvoiceStatus.CANCELLED && selectedInvoice.netAmount > 0 && (
                      <button
                        type="button"
                        onClick={() => handleSyncInvoiceAccounting(selectedInvoice)}
                        disabled={isSyncingAccounting}
                        className="inline-flex items-center gap-1 bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1 rounded text-[11px] font-semibold transition-colors disabled:opacity-50"
                      >
                        <BookOpen className="w-3 h-3" />
                        {isSyncingAccounting ? "Memposting..." : "Posting Jurnal"}
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Payment History */}
              <div>
                <h4 className="font-bold text-slate-800 mb-2 flex items-center gap-1.5">
                  <CreditCard className="w-4 h-4 text-slate-500" />
                  Riwayat Pembayaran Kasir ({invoicePayments.length})
                </h4>
                {invoicePayments.length === 0 ? (
                  <p className="text-slate-400 italic">Belum ada transaksi pembayaran untuk faktur ini.</p>
                ) : (
                  <div className="space-y-1.5">
                    {invoicePayments.map((p) => (
                      <div
                        key={p.id}
                        className="p-2 bg-slate-50 rounded border border-slate-100 flex items-center justify-between"
                      >
                        <div>
                          <div className="font-semibold text-slate-800">
                            Rp {p.amount.toLocaleString("id-ID")} ({p.paymentMethod})
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {new Date(p.transactionDateTime).toLocaleString("id-ID")} • Ref: {p.referenceNumber || "-"}
                          </div>
                        </div>
                        <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded text-[10px] font-bold">
                          {p.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                {selectedInvoice.paidAmount === 0 && selectedInvoice.status !== InvoiceStatus.CANCELLED && (
                  <button
                    onClick={() => handleCancelInvoice(selectedInvoice)}
                    className="text-xs text-rose-600 hover:text-rose-700 font-semibold"
                  >
                    Batalkan Invoice
                  </button>
                )}
                <div className="flex gap-2 ml-auto">
                  <button
                    type="button"
                    onClick={() => {
                      setShowDetailModal(false);
                      setShowDocumentModal(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-semibold shadow-xs"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Cetak / PDF / WhatsApp</span>
                  </button>
                  <button
                    onClick={() => setShowDetailModal(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold"
                  >
                    Tutup
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Document Invoice Presentation / Print / PDF / WhatsApp */}
      {showDocumentModal && selectedInvoice && (
        <InvoiceDocumentModal
          isOpen={showDocumentModal}
          onClose={() => setShowDocumentModal(false)}
          invoice={selectedInvoice}
          items={selectedInvoiceItems}
          patient={getPatient(selectedInvoice.patientId)}
          branch={getBranch(selectedInvoice.branchId)}
          branding={branding}
          cashierName={currentUser?.name || "Petugas Kasir"}
          doctorName={getDoctorNameForInvoice(selectedInvoice)}
        />
      )}

      {/* Modal: Delete Invoice Confirmation */}
      {invoiceToDelete && (
        <div className="fixed inset-0 z-[70] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-2.5 bg-rose-50 rounded-xl">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-base">Konfirmasi Hapus Invoice</h3>
                <p className="text-xs text-slate-500">Koreksi Tagihan & Pembukuan Admin</p>
              </div>
            </div>

            {deleteInvoiceError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl font-medium">
                {deleteInvoiceError}
              </div>
            )}

            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">No. Faktur:</span>
                <span className="font-mono font-bold text-slate-900">{invoiceToDelete.invoiceNumber || invoiceToDelete.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Pasien:</span>
                <span className="font-medium text-slate-800">{getPatientName(invoiceToDelete.patientId)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Total Netto:</span>
                <span className="font-bold text-slate-900">Rp {invoiceToDelete.netAmount.toLocaleString("id-ID")}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Sudah Dibayar:</span>
                <span className="font-medium text-emerald-700">Rp {invoiceToDelete.paidAmount.toLocaleString("id-ID")}</span>
              </div>
            </div>

            <p className="text-xs text-slate-600">
              Apakah Anda yakin ingin menghapus invoice ini? Semua rincian item tagihan dan log transaksi pembayaran terkait akan ikut dihapus dari sistem.
            </p>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setInvoiceToDelete(null)}
                disabled={isDeletingInvoice}
                className="px-4 py-2 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteInvoice}
                disabled={isDeletingInvoice}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isDeletingInvoice ? "Menghapus..." : "Ya, Hapus Invoice"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Konfirmasi Batalkan Invoice */}
      {invoiceToCancel && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-xl border border-slate-100">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-2.5 bg-rose-50 rounded-xl">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-slate-900">Batalkan Invoice</h3>
            </div>

            <p className="text-xs text-slate-600">
              Apakah Anda yakin ingin membatalkan tagihan <strong>#{invoiceToCancel.id}</strong>? Status invoice akan diubah menjadi <strong>CANCELLED</strong>. Tindakan ini tidak dapat diurungkan.
            </p>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setInvoiceToCancel(null)}
                disabled={isCancellingInvoice}
                className="px-4 py-2 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-50 cursor-pointer"
              >
                Kembali
              </button>
              <button
                type="button"
                onClick={handleConfirmCancelInvoice}
                disabled={isCancellingInvoice}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
              >
                <span>{isCancellingInvoice ? "Membatalkan..." : "Ya, Batalkan Invoice"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
