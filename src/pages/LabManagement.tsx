import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  FlaskConical,
  Plus,
  ReceiptText,
  RefreshCw,
  Wallet
} from "lucide-react";
import { useApp } from "../context/AppContext";
import { isLabOrderCandidateService } from "../utils/labOrderEligibility";
import {
  AccountCategory,
  AccountType,
  Invoice,
  InvoiceStatus,
  LabOrder,
  LabOrderPayment,
  LabOrderStatus,
  PaymentMethod,
  UserRole
} from "../types/domain";

const today = () => new Date().toISOString().slice(0, 10);
const rupiah = (amount: number) => `Rp ${Math.max(0, amount).toLocaleString("id-ID")}`;

const STATUS_LABELS: Record<LabOrderStatus, string> = {
  ORDERED: "Order dibuat",
  SENT: "Dikirim ke lab",
  IN_PROGRESS: "Dikerjakan lab",
  RECEIVED: "Diterima klinik",
  CANCELLED: "Dibatalkan"
};

const nextStatus: Partial<Record<LabOrderStatus, LabOrderStatus>> = {
  ORDERED: "SENT",
  SENT: "IN_PROGRESS",
  IN_PROGRESS: "RECEIVED"
};

export const LabManagement: React.FC = () => {
  const {
    currentUser,
    selectedBranchId,
    setSelectedBranchId,
    branches,
    patients,
    visits,
    treatmentJobs,
    invoices: contextInvoices,
    payments: contextPayments,
    services,
    accounts,
    accountingPostingService,
    compRepo,
    repos,
    refreshData
  } = useApp();

  const branchAdminBranchId = currentUser?.role === UserRole.BRANCH_ADMIN
    ? currentUser.assignedBranchId || currentUser.branchId || null
    : null;
  const branchFilter = branchAdminBranchId || selectedBranchId;
  const [orders, setOrders] = useState<LabOrder[]>([]);
  const [labInvoices, setLabInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<LabOrderPayment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [selectedTreatmentId, setSelectedTreatmentId] = useState("");
  const [labName, setLabName] = useState("");
  const [expectedAt, setExpectedAt] = useState("");

  const [invoiceOrder, setInvoiceOrder] = useState<LabOrder | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(today());
  const [invoiceAmount, setInvoiceAmount] = useState(0);

  const [paymentOrder, setPaymentOrder] = useState<LabOrder | null>(null);
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paymentDate, setPaymentDate] = useState(today());
  const [expenseAccountId, setExpenseAccountId] = useState("");
  const [paymentAccountId, setPaymentAccountId] = useState("");

  const loadOrders = useCallback(async () => {
    setIsLoading(true);
    setActionError(null);
    try {
      const loadedOrders = await repos.lab.getLabOrders(branchFilter);
      const loadedPayments = await repos.lab.getLabOrderPayments(loadedOrders.map((order) => order.id));
      const branchIds = [...new Set(loadedOrders.map((order) => order.branchId))];
      const invoiceGroups = await Promise.all(branchIds.map((branchId) =>
        repos.invoice.getInvoicesByBranch(branchId, currentUser?.role, branchAdminBranchId)
      ));
      setOrders(loadedOrders);
      setLabInvoices(invoiceGroups.flat());
      setPayments(loadedPayments);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Gagal memuat data laboratorium.");
    } finally {
      setIsLoading(false);
    }
  }, [repos.lab, repos.invoice, branchFilter, currentUser?.role, branchAdminBranchId]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders, contextInvoices, contextPayments]);

  const treatmentById = useMemo(
    () => new Map(treatmentJobs.map((treatment) => [treatment.id, treatment])),
    [treatmentJobs]
  );
  const visitById = useMemo(() => new Map(visits.map((visit) => [visit.id, visit])), [visits]);
  const patientById = useMemo(() => new Map(patients.map((patient) => [patient.id, patient])), [patients]);
  const serviceById = useMemo(() => new Map(services.map((service) => [service.id, service])), [services]);
  const orderTreatmentIds = useMemo(() => new Set(orders.map((order) => order.treatmentJobId)), [orders]);
  const eligibleTreatments = useMemo(
    () => treatmentJobs.filter((treatment) => {
      const service = serviceById.get(treatment.serviceId);
      return Boolean(
        service
        && isLabOrderCandidateService(service)
        && !orderTreatmentIds.has(treatment.id)
        && treatment.status !== "DIBATALKAN"
        && (!branchFilter || treatment.branchId === branchFilter)
      );
    }),
    [treatmentJobs, serviceById, orderTreatmentIds, branchFilter]
  );

  const labExpenseAccounts = useMemo(
    () => accounts.filter((account) =>
      account.accountType === AccountType.EXPENSE
      && account.isActive
      && (account.code === "5095" || /lab|laboratorium/i.test(account.name))
    ),
    [accounts]
  );
  const bankAccounts = useMemo(
    () => accounts.filter((account) =>
      account.accountType === AccountType.ASSET
      && account.accountCategory === AccountCategory.BANK
      && account.isActive
    ),
    [accounts]
  );

  const paymentsForOrder = (orderId: string) => payments.filter((payment) => payment.labOrderId === orderId);
  const paymentTotals = (orderId: string) => paymentsForOrder(orderId).reduce(
    (totals, payment) => {
      if (payment.status === "POSTED") totals.posted += payment.amount;
      else totals.pending += payment.amount;
      return totals;
    },
    { posted: 0, pending: 0 }
  );

  const patientOutstandingByVisit = useMemo(() => {
    const balances = new Map<string, number>();
    for (const invoice of labInvoices) {
      if (invoice.status === InvoiceStatus.CANCELLED) continue;
      balances.set(invoice.visitId, (balances.get(invoice.visitId) || 0) + invoice.outstandingAmount);
    }
    return balances;
  }, [labInvoices]);

  const filteredOrders = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("id-ID");
    if (!query) return orders;
    return orders.filter((order) => {
      const treatment = treatmentById.get(order.treatmentJobId);
      const visit = treatment ? visitById.get(treatment.visitId) : null;
      const patient = visit ? patientById.get(visit.patientId) : null;
      return [
        patient?.fullName,
        treatment?.serviceNameSnapshot,
        order.labName,
        order.invoiceNumber
      ].some((value) => value?.toLocaleLowerCase("id-ID").includes(query));
    });
  }, [orders, search, treatmentById, visitById, patientById]);

  const openNewOrder = () => {
    setActionError(null);
    setSuccessMessage(null);
    setSelectedTreatmentId(eligibleTreatments[0]?.id || "");
    setLabName("");
    setExpectedAt("");
    setIsOrderModalOpen(true);
  };

  const handleCreateOrder = async (event: React.FormEvent) => {
    event.preventDefault();
    const treatment = treatmentById.get(selectedTreatmentId);
    if (!treatment || !labName.trim()) {
      setActionError("Pilih tindakan gigi palsu dan isi nama laboratorium.");
      return;
    }
    setIsSubmitting(true);
    setActionError(null);
    try {
      await repos.lab.createLabOrder({
        treatmentJobId: treatment.id,
        branchId: treatment.branchId,
        labName,
        expectedAt: expectedAt || null,
        createdBy: currentUser?.id
      });
      setIsOrderModalOpen(false);
      setSuccessMessage("Order laboratorium berhasil dibuat.");
      await loadOrders();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Gagal membuat order laboratorium.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAdvanceStatus = async (order: LabOrder) => {
    const status = nextStatus[order.status];
    if (!status) return;
    setIsSubmitting(true);
    setActionError(null);
    try {
      const now = new Date().toISOString();
      await repos.lab.updateLabOrder(order.id, {
        status,
        ...(status === "SENT" ? { sentAt: now } : {}),
        ...(status === "RECEIVED" ? { receivedAt: now } : {})
      });
      setSuccessMessage(`Status order diperbarui: ${STATUS_LABELS[status]}.`);
      await loadOrders();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Gagal memperbarui status order.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const openInvoiceForm = (order: LabOrder) => {
    setActionError(null);
    setInvoiceOrder(order);
    setInvoiceNumber("");
    setInvoiceDate(today());
    setInvoiceAmount(0);
  };

  const handleSaveInvoice = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!invoiceOrder) return;
    if (!invoiceNumber.trim() || !invoiceDate || !Number.isSafeInteger(invoiceAmount) || invoiceAmount <= 0) {
      setActionError("Nomor nota, tanggal, dan nominal nota lab wajib diisi dengan benar.");
      return;
    }
    setIsSubmitting(true);
    setActionError(null);
    try {
      await repos.lab.updateLabOrder(invoiceOrder.id, {
        invoiceReceivedAt: new Date().toISOString(),
        invoiceNumber: invoiceNumber.trim(),
        invoiceDate,
        invoiceAmount
      });
      setInvoiceOrder(null);
      setSuccessMessage("Nota lab tersimpan. Perhitungan jasa Dokter akan memakai biaya lab aktual.");
      await loadOrders();
      try {
        const treatment = treatmentById.get(invoiceOrder.treatmentJobId);
        if (treatment?.status === "SELESAI" || treatment?.status === "DISERAHKAN") {
          const accruals = await compRepo.calculateAndAccrueForTreatment(invoiceOrder.treatmentJobId);
          if (accruals.length > 0) {
            setSuccessMessage(`Nota lab tersimpan dan ${accruals.length} akrual kompensasi berhasil dihitung.`);
          }
        }
      } catch (error) {
        setActionError(
          `Nota lab tersimpan, tetapi kompensasi belum berhasil dihitung: ${
            error instanceof Error ? error.message : "kesalahan tidak diketahui"
          }`
        );
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Gagal menyimpan nota laboratorium.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRecalculateCompensation = async (order: LabOrder) => {
    setIsSubmitting(true);
    setActionError(null);
    try {
      const created = await compRepo.calculateAndAccrueForTreatment(order.treatmentJobId);
      setSuccessMessage(
        created.length > 0
          ? `${created.length} akrual kompensasi baru berhasil dihitung.`
          : "Tidak ada akrual baru. Pastikan tindakan selesai, invoice pasien lunas, atau akrual sudah pernah dibuat."
      );
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Gagal menghitung kompensasi untuk tindakan ini.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const openPaymentForm = (order: LabOrder) => {
    if (!order.invoiceAmount) return;
    if (labExpenseAccounts.length === 0) {
      setActionError("Akun Beban Laboratorium belum tersedia. Tambahkan akun beban khusus Lab pada Bagan Akun sebelum mencatat pembayaran.");
      return;
    }
    const totals = paymentTotals(order.id);
    const remaining = Math.max(0, order.invoiceAmount - totals.posted - totals.pending);
    setActionError(null);
    setPaymentOrder(order);
    setPaymentAmount(remaining);
    setPaymentDate(today());
    setExpenseAccountId(
      labExpenseAccounts.find((account) => account.code === "5095")?.id
      || ""
    );
    setPaymentAccountId(
      bankAccounts.find((account) => account.code === "1010")?.id
      || bankAccounts[0]?.id
      || ""
    );
  };

  const postPendingPayment = async (payment: LabOrderPayment) => {
    const order = orders.find((candidate) => candidate.id === payment.labOrderId);
    if (!order) throw new Error("Order lab untuk pembayaran ini tidak ditemukan.");
    const expenseAccount = accounts.find((account) => account.id === payment.expenseAccountId);
    const bankAccount = accounts.find((account) => account.id === payment.paymentAccountId);
    if (!expenseAccount || !bankAccount) {
      throw new Error("Akun beban lab atau rekening bank tidak ditemukan. Periksa Bagan Akun sebelum mencoba kembali.");
    }

    const journal = await accountingPostingService.postBranchExpense(
      {
        branchId: payment.branchId,
        expenseAccountId: payment.expenseAccountId,
        paymentAccountId: payment.paymentAccountId,
        paymentMethod: PaymentMethod.TRANSFER,
        event: "PAYMENT",
        amount: payment.amount,
        date: payment.paidAt,
        description: `Pembayaran nota lab ${order.invoiceNumber || order.id} - ${order.labName}`,
        referenceNumber: `LAB_PAYMENT:${payment.id}`
      },
      currentUser?.role,
      branchAdminBranchId,
      currentUser?.name || "Admin Cabang"
    );
    await repos.lab.markLabOrderPaymentPosted(payment.id, journal.id);
    await refreshData();
    await loadOrders();
  };

  const handleSavePayment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!paymentOrder?.invoiceAmount) return;
    const totals = paymentTotals(paymentOrder.id);
    const available = paymentOrder.invoiceAmount - totals.posted - totals.pending;
    if (
      !Number.isSafeInteger(paymentAmount)
      || paymentAmount <= 0
      || paymentAmount > available
      || !expenseAccountId
      || !paymentAccountId
    ) {
      setActionError("Nominal pembayaran harus positif dan tidak melebihi sisa tagihan. Pilih akun beban serta rekening bank.");
      return;
    }

    setIsSubmitting(true);
    setActionError(null);
    try {
      const payment = await repos.lab.createLabOrderPayment({
        labOrderId: paymentOrder.id,
        branchId: paymentOrder.branchId,
        amount: paymentAmount,
        paidAt: paymentDate,
        expenseAccountId,
        paymentAccountId,
        createdBy: currentUser?.id || "unknown"
      });
      setPaymentOrder(null);
      await loadOrders();
      try {
        await postPendingPayment(payment);
        setSuccessMessage("Pembayaran lab dicatat sebagai Pengeluaran dan diposting ke jurnal.");
      } catch (error) {
        setActionError(
          `Pembayaran tersimpan sebagai tertunda, tetapi Pengeluaran belum berhasil diposting. Gunakan tombol coba lagi: ${
            error instanceof Error ? error.message : "kesalahan tidak diketahui"
          }`
        );
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Gagal menyiapkan pembayaran laboratorium.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const patientBalanceTotal = useMemo(() => {
    const visitIds = new Set(orders.map((order) => treatmentById.get(order.treatmentJobId)?.visitId).filter(Boolean));
    return labInvoices
      .filter((invoice) => visitIds.has(invoice.visitId) && invoice.status !== InvoiceStatus.CANCELLED)
      .reduce((total, invoice) => total + invoice.outstandingAmount, 0);
  }, [orders, treatmentById, labInvoices]);

  const labPayableTotal = orders.reduce((total, order) => {
    if (!order.invoiceAmount) return total;
    return total + Math.max(0, order.invoiceAmount - paymentTotals(order.id).posted);
  }, 0);

  return (
    <div className="space-y-5" id="lab-management-page">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-slate-900">
            <FlaskConical className="h-6 w-6 text-amber-600" />
            KONTROL LABORATORIUM
          </h1>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-600">
            Pantau order gigi palsu, saldo tagihan pasien, nota dan sisa tagihan lab. Pembayaran lab diposting sebagai Pengeluaran dari rekening bank cabang.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {currentUser?.role === UserRole.SUPER_ADMIN && (
            <select
              aria-label="Filter cabang"
              value={selectedBranchId || "ALL"}
              onChange={(event) => setSelectedBranchId(event.target.value === "ALL" ? null : event.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
            >
              <option value="ALL">Semua Cabang</option>
              {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
          )}
          <button
            type="button"
            onClick={() => void loadOrders()}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            Muat ulang
          </button>
          <button
            type="button"
            onClick={openNewOrder}
            disabled={eligibleTreatments.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Buat Order Lab
          </button>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Order Aktif</p>
          <p className="mt-1 text-xl font-bold text-slate-900">{orders.filter((order) => order.status !== "RECEIVED" && order.status !== "CANCELLED").length}</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-800">Sisa Tagihan Laboratorium</p>
          <p className="mt-1 text-xl font-bold text-amber-950">{rupiah(labPayableTotal)}</p>
        </div>
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-800">Sisa Tagihan Pasien</p>
          <p className="mt-1 text-xl font-bold text-rose-950">{rupiah(patientBalanceTotal)}</p>
        </div>
      </section>

      {(actionError || successMessage) && (
        <div
          role={actionError ? "alert" : "status"}
          className={`flex items-start gap-2 rounded-lg border p-3 text-xs ${
            actionError
              ? "border-rose-200 bg-rose-50 text-rose-800"
              : "border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
        >
          {actionError ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
          <span>{actionError || successMessage}</span>
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-900">Daftar Order dan Tagihan</h2>
          <p className="mt-1 text-[11px] text-slate-500">Admin Cabang memilih kasus yang benar-benar dikirim ke lab. Jasa Dokter kasus tersebut menunggu nota lab dan invoice pasien lunas.</p>
        </div>
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Cari pasien, tindakan, laboratorium..."
          aria-label="Cari order laboratorium"
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs sm:max-w-xs"
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-[1050px] w-full text-left text-xs">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Pasien / Tindakan</th>
              <th className="px-4 py-3">Laboratorium</th>
              <th className="px-4 py-3">Proses</th>
              <th className="px-4 py-3">Nota / Biaya</th>
              <th className="px-4 py-3">Saldo Pasien</th>
              <th className="px-4 py-3">Sisa Tagihan Lab</th>
              <th className="px-4 py-3">Waktu</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-500">Memuat order laboratorium...</td></tr>
            ) : filteredOrders.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                  Belum ada tindakan gigi palsu/prostodonti yang bisa dipilih. Pastikan ada tindakan di cabang ini dan kategorinya sesuai; Admin Cabang memilih per tindakan mana yang benar-benar dikirim ke lab.
                </td>
              </tr>
            ) : filteredOrders.map((order) => {
              const treatment = treatmentById.get(order.treatmentJobId);
              const visit = treatment ? visitById.get(treatment.visitId) : null;
              const patient = visit ? patientById.get(visit.patientId) : null;
              const totals = paymentTotals(order.id);
              const remainingLab = order.invoiceAmount == null ? null : Math.max(0, order.invoiceAmount - totals.posted);
              const pendingPayments = paymentsForOrder(order.id).filter((payment) => payment.status === "PENDING");
              const branchName = branches.find((branch) => branch.id === order.branchId)?.name || order.branchId;
              return (
                <tr key={order.id} className="align-top hover:bg-slate-50/70">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-900">{patient?.fullName || "Pasien tidak ditemukan"}</p>
                    <p className="mt-1 text-[11px] text-slate-600">{treatment?.serviceNameSnapshot || "Tindakan tidak ditemukan"}</p>
                    <p className="mt-1 text-[10px] text-slate-400">{branchName}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{order.labName}</p>
                    {order.expectedAt && <p className="mt-1 text-[10px] text-slate-500">Target: {order.expectedAt}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-semibold ${
                      order.status === "RECEIVED" ? "bg-emerald-50 text-emerald-700"
                        : order.status === "CANCELLED" ? "bg-slate-100 text-slate-500"
                          : "bg-sky-50 text-sky-700"
                    }`}>{STATUS_LABELS[order.status]}</span>
                    {order.status !== "RECEIVED" && order.status !== "CANCELLED" && (
                      <button
                        type="button"
                        disabled={isSubmitting}
                        onClick={() => void handleAdvanceStatus(order)}
                        className="mt-2 block text-[10px] font-semibold text-sky-700 underline disabled:opacity-50"
                      >
                        Tandai {STATUS_LABELS[nextStatus[order.status] || order.status].toLowerCase()}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {order.invoiceAmount != null ? (
                      <>
                        <p className="font-semibold text-slate-800">{rupiah(order.invoiceAmount)}</p>
                        <p className="mt-1 text-[10px] text-slate-500">{order.invoiceNumber} · {order.invoiceDate}</p>
                        <p className="mt-1 text-[10px] text-emerald-700">Nota diterima</p>
                        {(treatment?.status === "SELESAI" || treatment?.status === "DISERAHKAN") && (
                          <button
                            type="button"
                            disabled={isSubmitting}
                            onClick={() => void handleRecalculateCompensation(order)}
                            className="mt-1 block text-[10px] font-semibold text-sky-700 underline disabled:opacity-50"
                          >
                            Coba hitung kompensasi
                          </button>
                        )}
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => openInvoiceForm(order)}
                        className="inline-flex items-center gap-1 font-semibold text-amber-700 hover:text-amber-900"
                      >
                        <ReceiptText className="h-3.5 w-3.5" />
                        Catat nota lab
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {treatment ? rupiah(patientOutstandingByVisit.get(treatment.visitId) || 0) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {remainingLab == null ? (
                      <span className="text-slate-400">Menunggu nota</span>
                    ) : (
                      <>
                        <p className="font-semibold text-slate-800">{rupiah(remainingLab)}</p>
                        <p className="mt-1 text-[10px] text-slate-500">Dibayar: {rupiah(totals.posted)}</p>
                        {totals.pending > 0 && <p className="mt-1 text-[10px] text-amber-700">Pending: {rupiah(totals.pending)}</p>}
                        {remainingLab > 0 && (
                          <button
                            type="button"
                            onClick={() => openPaymentForm(order)}
                            className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 hover:text-emerald-900"
                          >
                            <Wallet className="h-3.5 w-3.5" />
                            Bayar tagihan
                          </button>
                        )}
                        {pendingPayments.map((payment) => (
                          <button
                            key={payment.id}
                            type="button"
                            disabled={isSubmitting}
                            onClick={() => {
                              setIsSubmitting(true);
                              setActionError(null);
                              void postPendingPayment(payment)
                                .then(() => setSuccessMessage("Pengeluaran lab berhasil diposting ke jurnal."))
                                .catch((error: unknown) => setActionError(error instanceof Error ? error.message : "Gagal memposting pembayaran lab."))
                                .finally(() => setIsSubmitting(false));
                            }}
                            className="mt-2 block text-[10px] font-semibold text-amber-700 underline disabled:opacity-50"
                          >
                            Coba lagi posting {rupiah(payment.amount)}
                          </button>
                        ))}
                      </>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-[10px] text-slate-500">Dibuat {new Date(order.createdAt).toLocaleDateString("id-ID")}</p>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {isOrderModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <form onSubmit={handleCreateOrder} className="w-full max-w-lg space-y-4 rounded-xl bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900">Buat Order Laboratorium</h3>
              <button type="button" onClick={() => setIsOrderModalOpen(false)} className="text-slate-500">Tutup</button>
            </div>
            <label className="block text-xs font-semibold text-slate-700">
              Tindakan gigi palsu / prostodonti yang akan dikirim ke lab
              <select value={selectedTreatmentId} onChange={(event) => setSelectedTreatmentId(event.target.value)} required className="mt-1 w-full rounded-lg border border-slate-200 p-2 font-normal">
                {eligibleTreatments.map((treatment) => {
                  const visit = visitById.get(treatment.visitId);
                  const patient = visit ? patientById.get(visit.patientId) : null;
                  return <option key={treatment.id} value={treatment.id}>{patient?.fullName || "Pasien"} — {treatment.serviceNameSnapshot}</option>;
                })}
              </select>
            </label>
            <label className="block text-xs font-semibold text-slate-700">
              Nama laboratorium
              <input value={labName} onChange={(event) => setLabName(event.target.value)} required maxLength={150} className="mt-1 w-full rounded-lg border border-slate-200 p-2 font-normal" />
            </label>
            <label className="block text-xs font-semibold text-slate-700">
              Perkiraan tanggal selesai
              <input type="date" value={expectedAt} onChange={(event) => setExpectedAt(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 p-2 font-normal" />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setIsOrderModalOpen(false)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs">Batal</button>
              <button disabled={isSubmitting || eligibleTreatments.length === 0} className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{isSubmitting ? "Menyimpan..." : "Buat Order"}</button>
            </div>
          </form>
        </div>
      )}

      {invoiceOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <form onSubmit={handleSaveInvoice} className="w-full max-w-md space-y-4 rounded-xl bg-white p-5 shadow-xl">
            <div>
              <h3 className="font-bold text-slate-900">Catat Nota Laboratorium</h3>
              <p className="mt-1 text-xs text-slate-500">{invoiceOrder.labName} — {treatmentById.get(invoiceOrder.treatmentJobId)?.serviceNameSnapshot}</p>
            </div>
            <label className="block text-xs font-semibold text-slate-700">
              Nomor nota
              <input value={invoiceNumber} onChange={(event) => setInvoiceNumber(event.target.value)} required maxLength={100} className="mt-1 w-full rounded-lg border border-slate-200 p-2 font-normal" />
            </label>
            <label className="block text-xs font-semibold text-slate-700">
              Tanggal nota
              <input type="date" value={invoiceDate} onChange={(event) => setInvoiceDate(event.target.value)} required className="mt-1 w-full rounded-lg border border-slate-200 p-2 font-normal" />
            </label>
            <label className="block text-xs font-semibold text-slate-700">
              Biaya aktual lab (Rp)
              <input type="number" min={1} step={1} value={invoiceAmount || ""} onChange={(event) => setInvoiceAmount(Number(event.target.value) || 0)} required className="mt-1 w-full rounded-lg border border-slate-200 p-2 font-normal" />
            </label>
            <p className="rounded-lg bg-amber-50 p-3 text-[11px] leading-5 text-amber-900">
              Setelah nota dicatat, biaya ini menjadi dasar pengurang jasa Dokter. Nomor, tanggal, dan nominal nota tidak dapat diubah setelah disimpan.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setInvoiceOrder(null)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs">Batal</button>
              <button disabled={isSubmitting} className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{isSubmitting ? "Menyimpan..." : "Simpan Nota"}</button>
            </div>
          </form>
        </div>
      )}

      {paymentOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <form onSubmit={handleSavePayment} className="w-full max-w-md space-y-4 rounded-xl bg-white p-5 shadow-xl">
            <div>
              <h3 className="font-bold text-slate-900">Bayar Tagihan Laboratorium</h3>
              <p className="mt-1 text-xs text-slate-500">{paymentOrder.labName} · Nota {paymentOrder.invoiceNumber}</p>
            </div>
            <label className="block text-xs font-semibold text-slate-700">
              Nominal pembayaran (Rp)
              <input type="number" min={1} step={1} value={paymentAmount || ""} onChange={(event) => setPaymentAmount(Number(event.target.value) || 0)} required className="mt-1 w-full rounded-lg border border-slate-200 p-2 font-normal" />
            </label>
            <label className="block text-xs font-semibold text-slate-700">
              Tanggal pembayaran
              <input type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} required className="mt-1 w-full rounded-lg border border-slate-200 p-2 font-normal" />
            </label>
            <label className="block text-xs font-semibold text-slate-700">
              Kategori Pengeluaran
              <select value={expenseAccountId} onChange={(event) => setExpenseAccountId(event.target.value)} required className="mt-1 w-full rounded-lg border border-slate-200 p-2 font-normal">
                <option value="">Pilih akun beban laboratorium</option>
                {labExpenseAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} - {account.name}</option>)}
              </select>
            </label>
            <label className="block text-xs font-semibold text-slate-700">
              Rekening bank cabang
              <select value={paymentAccountId} onChange={(event) => setPaymentAccountId(event.target.value)} required className="mt-1 w-full rounded-lg border border-slate-200 p-2 font-normal">
                {bankAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} - {account.name}</option>)}
              </select>
            </label>
            <p className="rounded-lg bg-sky-50 p-3 text-[11px] leading-5 text-sky-900">
              Transaksi akan dicatat satu kali sebagai Pengeluaran transfer dan ditautkan ke order lab ini.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setPaymentOrder(null)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs">Batal</button>
              <button disabled={isSubmitting || !bankAccounts.length || !expenseAccountId} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{isSubmitting ? "Memproses..." : "Catat & Bayar"}</button>
            </div>
          </form>
        </div>
      )}
      {!bankAccounts.length && <p className="text-[11px] text-amber-700">Belum ada akun rekening bank aktif di Bagan Akun; pembayaran lab belum dapat diposting.</p>}
      {!labExpenseAccounts.length && <p className="text-[11px] text-amber-700">Akun Beban Laboratorium belum tersedia; pembayaran lab belum dapat diposting dengan aman.</p>}
      {orders.length === 0 && eligibleTreatments.length > 0 && !isLoading && (
        <p className="flex items-start gap-2 text-[11px] text-slate-500"><Clock3 className="h-4 w-4 shrink-0" />Ada {eligibleTreatments.length} tindakan layanan lab yang belum dibuatkan order.</p>
      )}
    </div>
  );
};
