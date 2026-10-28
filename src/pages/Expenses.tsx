import React, { useState, useEffect, useMemo } from "react";
import { useApp } from "../context/AppContext";
import { useRouter } from "../components/Router";
import {
  AccountType,
  AccountCategory,
  JournalStatus,
  JournalSourceType,
  ChartOfAccount,
  JournalEntry,
  DentalBranch,
  UserRole,
  RecurringExpensePlan,
  RecurringExpenseType
} from "../types/domain";
import {
  ArrowDownRight,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  XCircle,
  FileText,
  Building2,
  Calendar,
  Layers,
  ArrowUpDown,
  BookOpen,
  ArrowUpRight,
  RefreshCw,
  Info,
  DollarSign,
  Receipt,
  RotateCcw,
  Eye,
  Trash2,
  X
} from "lucide-react";
import { OperationalHubTabs } from "../components/common/OperationalHubTabs";
import { formatShortAccountingReference } from "../utils/accountingDisplay";

export const Expenses: React.FC = () => {
  const {
    currentUser,
    selectedBranchId,
    branches,
    accounts,
    journals,
    accountingRepo,
    accountingPostingService,
    refreshData
  } = useApp();
  const { navigate } = useRouter();

  const isSuper = currentUser?.role === UserRole.SUPER_ADMIN;
  const userBranchId = currentUser?.role === UserRole.BRANCH_ADMIN
    ? currentUser.assignedBranchId || currentUser.branchId
    : selectedBranchId;

  // Filter States
  const [searchQuery, setSearchQuery] = useState("");
  const [branchFilter, setBranchFilter] = useState<string>(userBranchId || "ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedExpenseJournal, setSelectedExpenseJournal] = useState<JournalEntry | null>(null);
  const [isReversalModalOpen, setIsReversalModalOpen] = useState(false);
  const [expenseToDelete, setExpenseToDelete] = useState<JournalEntry | null>(null);
  const [isDeletingExpense, setIsDeletingExpense] = useState(false);
  const [reversalReason, setReversalReason] = useState("");
  const [reversalDate, setReversalDate] = useState(new Date().toISOString().slice(0, 10));
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form State
  const [formDate, setFormDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [formBranchId, setFormBranchId] = useState<string>(
    userBranchId || branches[0]?.id || "branch-gebang"
  );
  const [formExpenseAccountId, setFormExpenseAccountId] = useState<string>("");
  const [formPaymentAccountId, setFormPaymentAccountId] = useState<string>("");
  const [formAmount, setFormAmount] = useState<number>(0);
  const [formDescription, setFormDescription] = useState<string>("");
  const [formRefNumber, setFormRefNumber] = useState<string>("");
  const [recurringPlans, setRecurringPlans] = useState<RecurringExpensePlan[]>([]);
  const [recurringBalances, setRecurringBalances] = useState<Record<string, number>>({});
  const [isRecurringLoading, setIsRecurringLoading] = useState(false);
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<RecurringExpensePlan | null>(null);
  const [planType, setPlanType] = useState<RecurringExpenseType>("RENT");
  const [planBranchId, setPlanBranchId] = useState("");
  const [planAmount, setPlanAmount] = useState(0);
  const [planStartsOn, setPlanStartsOn] = useState(new Date().toISOString().slice(0, 10));
  const [planIsActive, setPlanIsActive] = useState(true);
  const [selectedPlanForPayment, setSelectedPlanForPayment] = useState<RecurringExpensePlan | null>(null);
  const [settlementAmount, setSettlementAmount] = useState(0);
  const [settlementPaymentAccountId, setSettlementPaymentAccountId] = useState("");
  const [settlementDate, setSettlementDate] = useState(new Date().toISOString().slice(0, 10));
  const [settlementReference, setSettlementReference] = useState("");

  // Available Accounts from existing COA (Filter out Payroll & Compensation accounts to prevent double counting)
  const expenseAccounts = useMemo(() => {
    return accounts.filter((a) => {
      if (a.accountType !== AccountType.EXPENSE || !a.isActive) return false;
      
      const code = a.code;
      const nameLower = a.name.toLowerCase();
      const isPayrollOrComp =
        code === "5000" ||
        code === "5010" ||
        code === "5080" ||
        code === "5020" ||
        a.accountCategory === AccountCategory.DOCTOR_REPLACEMENT_EXPENSE ||
        nameLower.includes("gaji") ||
        nameLower.includes("insentif") ||
        nameLower.includes("biaya dokter") ||
        nameLower.includes("jasa dokter");
      const isManagedByRecurringAccrual = code === "5030" || code === "5070";

      return !isPayrollOrComp && !isManagedByRecurringAccrual;
    });
  }, [accounts]);

  const paymentAccounts = useMemo(() => {
    return accounts.filter(
      (a) =>
        a.accountType === AccountType.ASSET &&
        [AccountCategory.CASH, AccountCategory.BANK].includes(a.accountCategory) &&
        a.isActive
    );
  }, [accounts]);

  const loadRecurringPlans = async () => {
    setIsRecurringLoading(true);
    try {
      const branchId = currentUser?.role === UserRole.BRANCH_ADMIN
        ? currentUser.assignedBranchId || currentUser.branchId || undefined
        : branchFilter === "ALL" ? undefined : branchFilter;
      const plans = await accountingRepo.getRecurringExpensePlans(branchId);
      setRecurringPlans(plans);
      const balances: Record<string, number> = {};
      for (const plan of plans) {
        const liabilityCode = plan.expenseType === "RENT" ? "2050" : "2060";
        const liabilityAccount = accounts.find((account) => account.code === liabilityCode);
        if (!liabilityAccount) continue;
        const result = await accountingRepo.getAccountBalance(
          liabilityAccount.id,
          plan.branchId,
          undefined,
          currentUser?.role,
          currentUser?.role === UserRole.BRANCH_ADMIN
            ? currentUser.assignedBranchId || currentUser.branchId
            : null
        );
        balances[plan.id] = Math.max(0, result.balance);
      }
      setRecurringBalances(balances);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Gagal memuat rencana akrual rutin.");
    } finally {
      setIsRecurringLoading(false);
    }
  };

  useEffect(() => {
    void loadRecurringPlans();
  }, [accountingRepo, branchFilter, currentUser, accounts]);

  // Set default accounts when form opens
  useEffect(() => {
    if (expenseAccounts.length > 0 && !expenseAccounts.some((account) => account.id === formExpenseAccountId)) {
      // Default to Beban Listrik, Air & Internet (5040) or first expense account
      const defaultExp = expenseAccounts.find((a) => a.code === "5040") || expenseAccounts[0];
      setFormExpenseAccountId(defaultExp.id);
    }
    if (paymentAccounts.length > 0 && !formPaymentAccountId) {
      // Default to Kas (1000) or Bank BCA (1010)
      const defaultPay = paymentAccounts.find((a) => a.code === "1000") || paymentAccounts[0];
      setFormPaymentAccountId(defaultPay.id);
    }
  }, [expenseAccounts, paymentAccounts, formExpenseAccountId, formPaymentAccountId]);

  // Sync Branch ID for Branch Admin
  useEffect(() => {
    if (currentUser?.role === UserRole.BRANCH_ADMIN) {
      const fixedBranch = currentUser.assignedBranchId || currentUser.branchId || "branch-gebang";
      setFormBranchId(fixedBranch);
      setBranchFilter(fixedBranch);
    }
  }, [currentUser]);

  // Filter Expense Journals
  const expenseJournals = useMemo(() => {
    return journals.filter((j) => {
      // Only Expense Source
      if (j.sourceType !== JournalSourceType.EXPENSE) return false;

      // Branch isolation
      if (currentUser?.role === UserRole.BRANCH_ADMIN) {
        const allowedBranch = currentUser.assignedBranchId || currentUser.branchId;
        if (allowedBranch && j.branchId !== allowedBranch) return false;
      } else if (branchFilter !== "ALL" && j.branchId !== branchFilter) {
        return false;
      }

      // Status filter
      if (statusFilter !== "ALL" && j.status !== statusFilter) {
        return false;
      }

      // Date range filter
      if (dateFrom && j.journalDate < dateFrom) return false;
      if (dateTo && j.journalDate > dateTo) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesDesc = j.description.toLowerCase().includes(q);
        const matchesNum = j.journalNumber.toLowerCase().includes(q);
        const matchesSrc = j.sourceId ? j.sourceId.toLowerCase().includes(q) : false;
        return matchesDesc || matchesNum || matchesSrc;
      }

      return true;
    });
  }, [journals, currentUser, branchFilter, statusFilter, dateFrom, dateTo, searchQuery]);

  const reversedExpenseJournalIds = useMemo(
    () => new Set(journals.map((journal) => journal.reversalOfJournalId).filter((id): id is string => Boolean(id))),
    [journals]
  );

  // Financial Stats for Current Filter
  const stats = useMemo(() => {
    let totalExpense = 0;
    let postedCount = 0;
    let voidCount = 0;

    for (const j of expenseJournals) {
      if (j.status === JournalStatus.POSTED) {
        if (!j.sourceId?.startsWith("RECURRING_SETTLEMENT:") && !reversedExpenseJournalIds.has(j.id)) {
          totalExpense += j.totalDebit;
          postedCount++;
        }
      } else if (j.status === JournalStatus.VOID) {
        voidCount++;
      }
    }

    return { totalExpense, postedCount, voidCount };
  }, [expenseJournals, reversedExpenseJournalIds]);

  const getBranchName = (branchId?: string | null) => {
    if (!branchId) return "Semua Cabang";
    const b = branches.find((br) => br.id === branchId);
    return b ? b.name : branchId;
  };

  const getAccountName = (accountId: string) => {
    const a = accounts.find((acc) => acc.id === accountId);
    return a ? `${a.code} - ${a.name}` : accountId;
  };

  const handleOpenCreateModal = () => {
    setActionError(null);
    setSuccessMessage(null);
    setFormDate(new Date().toISOString().split("T")[0]);
    if (currentUser?.role === UserRole.BRANCH_ADMIN) {
      setFormBranchId(currentUser.assignedBranchId || currentUser.branchId || "branch-gebang");
    } else {
      setFormBranchId(branchFilter !== "ALL" ? branchFilter : branches[0]?.id || "branch-gebang");
    }
    setFormAmount(0);
    setFormDescription("");
    setFormRefNumber("");
    setIsCreateOpen(true);
  };

  const openPlanModal = (plan?: RecurringExpensePlan) => {
    setActionError(null);
    setEditingPlan(plan || null);
    setPlanType(plan?.expenseType || "RENT");
    setPlanBranchId(plan?.branchId || (branchFilter !== "ALL" ? branchFilter : branches[0]?.id || ""));
    setPlanAmount(plan?.amount || 0);
    setPlanStartsOn(plan?.startsOn || new Date().toISOString().slice(0, 10));
    setPlanIsActive(plan?.isActive ?? true);
    setIsPlanModalOpen(true);
  };

  const handleSavePlan = async (event: React.FormEvent) => {
    event.preventDefault();
    setActionError(null);
    const branchId = currentUser?.role === UserRole.BRANCH_ADMIN
      ? currentUser.assignedBranchId || currentUser.branchId
      : planBranchId;
    if (!branchId) {
      setActionError("Pilih cabang untuk rencana akrual.");
      return;
    }
    setIsSubmitting(true);
    try {
      await accountingRepo.saveRecurringExpensePlan(
        {
          branchId,
          expenseType: planType,
          amount: Number(planAmount),
          startsOn: planStartsOn,
          isActive: planIsActive
        },
        currentUser?.name || "Admin",
        currentUser?.role,
        currentUser?.role === UserRole.BRANCH_ADMIN
          ? currentUser.assignedBranchId || currentUser.branchId
          : null
      );
      setIsPlanModalOpen(false);
      setSuccessMessage("Rencana akrual tersimpan. Sistem akan mulai menghitung otomatis setiap hari.");
      await loadRecurringPlans();
      await refreshData();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Gagal menyimpan rencana akrual.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSettleRecurringExpense = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedPlanForPayment) return;
    setActionError(null);
    setIsSubmitting(true);
    try {
      await accountingPostingService.postRecurringExpenseSettlement(
        {
          planId: selectedPlanForPayment.id,
          expenseType: selectedPlanForPayment.expenseType,
          branchId: selectedPlanForPayment.branchId,
          paymentAccountId: settlementPaymentAccountId,
          amount: Number(settlementAmount),
          date: settlementDate,
          referenceNumber: settlementReference.trim() || undefined
        },
        currentUser?.role,
        currentUser?.role === UserRole.BRANCH_ADMIN
          ? currentUser.assignedBranchId || currentUser.branchId
          : null,
        currentUser?.name || "Admin"
      );
      setSelectedPlanForPayment(null);
      setSuccessMessage("Pembayaran kewajiban berhasil dicatat tanpa membebankan biaya dua kali.");
      await refreshData();
      await loadRecurringPlans();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Gagal mencatat pembayaran akrual.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    setSuccessMessage(null);

    if (formAmount <= 0) {
      setActionError("Nominal pengeluaran harus lebih besar dari 0");
      return;
    }
    if (!formDescription.trim()) {
      setActionError("Catatan / Keterangan pengeluaran wajib diisi");
      return;
    }
    if (!expenseAccounts.some((account) => account.id === formExpenseAccountId) || !formPaymentAccountId) {
      setActionError("Pilih kategori pengeluaran dan akun pembayaran kas/bank");
      return;
    }

    setIsSubmitting(true);
    try {
      const activeBranch = currentUser?.role === UserRole.BRANCH_ADMIN
        ? currentUser.assignedBranchId || currentUser.branchId || formBranchId
        : formBranchId;

      const postedJournal = await accountingPostingService.postBranchExpense(
        {
          branchId: activeBranch,
          expenseAccountId: formExpenseAccountId,
          paymentAccountId: formPaymentAccountId,
          amount: Number(formAmount),
          date: formDate,
          description: formDescription.trim(),
          referenceNumber: formRefNumber.trim() || undefined
        },
        currentUser?.role,
        currentUser?.role === UserRole.BRANCH_ADMIN ? (currentUser.assignedBranchId || currentUser.branchId) : null,
        currentUser?.name || "Staff Admin"
      );

      await refreshData();
      setIsCreateOpen(false);
      setSuccessMessage(
        `Pengeluaran berhasil dicatat & diposting ke Jurnal Umum (${formatShortAccountingReference(postedJournal.journalNumber)}) senilai Rp ${Number(formAmount).toLocaleString("id-ID")}`
      );
    } catch (err: any) {
      setActionError(err.message || "Gagal mencatat pengeluaran");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenReversalModal = (journal: JournalEntry) => {
    setSelectedExpenseJournal(journal);
    setReversalReason("");
    setReversalDate(new Date().toISOString().slice(0, 10));
    setActionError(null);
    setIsReversalModalOpen(true);
  };

  const handleReverseExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedExpenseJournal) return;
    if (reversalReason.trim().length < 5) {
      setActionError("Alasan koreksi minimal 5 karakter.");
      return;
    }

    setIsSubmitting(true);
    setActionError(null);
    try {
      const reversal = await accountingRepo.reversePostedJournal(
        selectedExpenseJournal.id,
        reversalReason.trim(),
        reversalDate,
        currentUser?.name || "Admin",
        currentUser?.role,
        currentUser?.role === UserRole.BRANCH_ADMIN ? (currentUser.assignedBranchId || currentUser.branchId) : null
      );

      await refreshData();
      setIsReversalModalOpen(false);
      setSelectedExpenseJournal(null);
      setSuccessMessage(`Jurnal pembalik ${formatShortAccountingReference(reversal.journalNumber)} berhasil diposting. Jurnal asal tetap tersimpan sebagai jejak audit.`);
    } catch (err: any) {
      setActionError(err.message || "Gagal membatalkan transaksi pengeluaran");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmDeleteExpense = async () => {
    if (!expenseToDelete) return;
    setIsDeletingExpense(true);
    setActionError(null);
    setSuccessMessage(null);
    try {
      await accountingRepo.deleteJournal(
        expenseToDelete.id,
        currentUser?.role,
        currentUser?.role === UserRole.BRANCH_ADMIN ? (currentUser.assignedBranchId || currentUser.branchId) : null
      );
      await refreshData();
      setSuccessMessage(`Transaksi pengeluaran ${formatShortAccountingReference(expenseToDelete.journalNumber)} berhasil dihapus dari sistem.`);
      setExpenseToDelete(null);
    } catch (err: any) {
      setActionError(err.message || "Gagal menghapus transaksi pengeluaran");
    } finally {
      setIsDeletingExpense(false);
    }
  };

  const accountingPath = currentUser?.role === UserRole.BRANCH_ADMIN
    ? "/branch-admin/accounting"
    : "/super-admin/accounting";

  return (
    <div className="space-y-6" id="expenses-page">
      <OperationalHubTabs hub="cashier" />

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <ArrowDownRight className="w-6 h-6 text-rose-600" />
            PENGELUARAN CABANG
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Catat pengeluaran operasional klinik seperti listrik, air, ATK, sewa, dan kebutuhan lainnya. Setiap pengeluaran yang disimpan akan otomatis masuk ke pencatatan keuangan.
          </p>
        </div>

        <button
          onClick={handleOpenCreateModal}
          className="inline-flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-700 text-white px-4 py-2.5 rounded-lg text-xs font-semibold shadow-sm transition-colors"
        >
          <Plus className="w-4 h-4" />
          Catat Pengeluaran
        </button>
      </div>

      {/* Guidance Notice Box: PERLU DIINGAT */}
      <div className="bg-amber-50/80 border border-amber-200/90 rounded-xl p-4 text-xs text-amber-950 space-y-2">
        <div className="flex items-center gap-2 font-bold text-amber-900 uppercase tracking-wide text-[11px]">
          <Info className="w-4 h-4 text-amber-700 shrink-0" />
          <span>PERLU DIINGAT</span>
        </div>
        <p className="text-slate-700 leading-relaxed">
          Gaji karyawan, insentif, komisi, dan pembayaran jasa dokter <strong>tidak perlu dicatat di halaman ini</strong>. Data tersebut diproses otomatis melalui Penggajian dan sistem insentif.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1 border-t border-amber-200/60 text-[11px]">
          <div className="flex items-center gap-1.5 text-emerald-800 font-medium">
            <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-[10px]">✓</span>
            <span>Catat di sini: Listrik, Air, ATK, Perbaikan, Promosi, dan operasional lainnya.</span>
          </div>
          <div className="flex items-center gap-1.5 text-rose-800 font-medium">
            <span className="w-4 h-4 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center font-bold text-[10px]">✕</span>
            <span>Gaji dan insentif melalui Penggajian. Sewa/THR yang punya rencana otomatis dibayar melalui kartu akrual agar tidak dihitung dua kali.</span>
          </div>
        </div>
      </div>

      {/* Notifications */}
      {successMessage && (
        <div className="p-3 bg-emerald-50 text-emerald-800 rounded-lg text-xs flex items-center justify-between border border-emerald-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-600 hover:text-emerald-800">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {actionError && (
        <div className="p-3 bg-rose-50 text-rose-800 rounded-lg text-xs flex items-center justify-between border border-rose-200">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{actionError}</span>
          </div>
          <button onClick={() => setActionError(null)} className="text-rose-600 hover:text-rose-800">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
            <DollarSign className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">TOTAL PENGELUARAN</div>
            <div className="text-base font-bold text-slate-900 mt-0.5 font-mono">
              Rp {stats.totalExpense.toLocaleString("id-ID")}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">Jumlah seluruh pengeluaran yang tercatat pada periode ini.</div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">TRANSAKSI TERCATAT</div>
            <div className="text-base font-bold text-emerald-700 mt-0.5">
              {stats.postedCount} Transaksi
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">Jumlah pengeluaran yang sudah disimpan.</div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
            <RotateCcw className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">TRANSAKSI DIBATALKAN</div>
            <div className="text-base font-bold text-amber-700 mt-0.5">
              {stats.voidCount} Transaksi
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">Jumlah pengeluaran yang dibatalkan.</div>
          </div>
        </div>
      </div>

      <section className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Penyisihan Harian Otomatis</h2>
            <p className="text-[11px] text-slate-500 mt-1">
              Sistem mengakru setiap hari dan membuat jurnal ringkasan bulanan. Uang belum dianggap dibayar sampai pembayaran dicatat.
            </p>
          </div>
          <button
            type="button"
            onClick={() => openPlanModal()}
            className="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-3 py-2 rounded-lg text-xs font-semibold"
          >
            <Plus className="w-4 h-4" />
            Atur Rencana
          </button>
        </div>
        {isRecurringLoading ? (
          <div className="p-6 text-center text-xs text-slate-500">Memuat rencana akrual...</div>
        ) : recurringPlans.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500">
            Belum ada rencana sewa atau THR. Atur nominal dan tanggal mulai agar sistem mulai menyisihkan otomatis.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 p-4">
            {recurringPlans.map((plan) => {
              const isRent = plan.expenseType === "RENT";
              const today = new Date();
              const divisor = isRent
                ? new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
                : ((today.getFullYear() % 4 === 0 && today.getFullYear() % 100 !== 0) || today.getFullYear() % 400 === 0 ? 366 : 365);
              const dailyAmount = Math.round(plan.amount / divisor);
              const postedLiability = recurringBalances[plan.id] || 0;
              return (
                <article key={plan.id} className="border border-slate-200 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-bold text-slate-900">{isRent ? "Sewa Gedung" : "THR"}</div>
                      <div className="text-[11px] text-slate-500">{getBranchName(plan.branchId)} · mulai {plan.startsOn}</div>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${plan.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                      {plan.isActive ? "AKTIF" : "NONAKTIF"}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mt-4">
                    <div className="bg-slate-50 rounded-lg p-3">
                      <div className="text-[10px] text-slate-500 uppercase">{isRent ? "Sewa per bulan" : "Target THR per tahun"}</div>
                      <div className="font-mono font-bold text-slate-900 mt-1">Rp {plan.amount.toLocaleString("id-ID")}</div>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3">
                      <div className="text-[10px] text-slate-500 uppercase">Perkiraan penyisihan harian</div>
                      <div className="font-mono font-bold text-indigo-700 mt-1">Rp {dailyAmount.toLocaleString("id-ID")}</div>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3">
                      <div className="text-[10px] text-slate-500 uppercase">Akumulasi akrual</div>
                      <div className="font-mono font-bold text-slate-900 mt-1">Rp {plan.accruedAmount.toLocaleString("id-ID")}</div>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3">
                      <div className="text-[10px] text-slate-500 uppercase">Kewajiban sudah dijurnal</div>
                      <div className="font-mono font-bold text-amber-700 mt-1">Rp {postedLiability.toLocaleString("id-ID")}</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2 mt-3">
                    <button type="button" onClick={() => openPlanModal(plan)} className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                      Ubah Rencana
                    </button>
                    <button
                      type="button"
                      disabled={postedLiability <= 0 || paymentAccounts.length === 0}
                      onClick={() => {
                        setSelectedPlanForPayment(plan);
                        setSettlementAmount(0);
                        setSettlementPaymentAccountId(formPaymentAccountId || paymentAccounts[0]?.id || "");
                        setSettlementDate(new Date().toISOString().slice(0, 10));
                        setSettlementReference("");
                      }}
                      className="px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700 disabled:opacity-40"
                    >
                      Catat Pembayaran
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-2">
                    Pembayaran hanya dapat mengurangi kewajiban yang sudah masuk jurnal bulanan.
                  </p>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex-1 max-w-sm relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Cari transaksi pengeluaran, nomor jurnal, kwitansi..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full text-xs pl-9 pr-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Branch Filter */}
          {isSuper ? (
            <div className="flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={branchFilter}
                onChange={(e) => setBranchFilter(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-rose-500"
              >
                <option value="ALL">Semua Cabang</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 rounded-lg text-xs font-semibold text-slate-700 border border-slate-200">
              <Building2 className="w-3.5 h-3.5 text-slate-500" />
              <span>{getBranchName(userBranchId)}</span>
            </div>
          )}

          {/* Status Filter */}
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-rose-500"
            >
              <option value="ALL">Semua Status</option>
              <option value={JournalStatus.POSTED}>POSTED (Aktif)</option>
              <option value={JournalStatus.VOID}>VOID (Batal)</option>
            </select>
          </div>

          {/* Date Range */}
          <div className="flex items-center gap-1 text-xs">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-slate-50 focus:outline-none"
            />
            <span className="text-slate-400">-</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-slate-50 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Expenses Table */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                <th className="py-3 px-4">Tanggal & Ref</th>
                <th className="py-3 px-4">Cabang</th>
                <th className="py-3 px-4">Keterangan Pengeluaran</th>
                <th className="py-3 px-4">Jenis & Sumber Pembayaran</th>
                <th className="py-3 px-4 text-right">Jumlah</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
              {expenseJournals.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-400">
                    <Receipt className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                    Belum ada pengeluaran operasional cabang yang tercatat. Klik "Catat Pengeluaran" untuk membuat transaksi.
                  </td>
                </tr>
              ) : (
                expenseJournals.map((j) => {
                  const debitLine = j.lines.find((l) => l.debit > 0);
                  const creditLine = j.lines.find((l) => l.credit > 0);
                  const isVoid = j.status === JournalStatus.VOID;
                  const reversal = journals.find((entry) => entry.reversalOfJournalId === j.id);
                  const isReversed = Boolean(reversal);

                  return (
                    <tr
                      key={j.id}
                      className={`hover:bg-slate-50/70 transition-colors ${
                        isVoid || isReversed ? "opacity-70 bg-slate-50/40" : ""
                      }`}
                    >
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900 font-mono">
                          <span title={j.journalNumber}>{formatShortAccountingReference(j.journalNumber)}</span>
                        </div>
                        <div className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          <span>{j.journalDate}</span>
                          {j.sourceId && (
                            <span className="font-mono bg-slate-100 px-1 py-0.2 rounded text-[10px] text-slate-600" title={`Ref lengkap: ${j.sourceId}`}>
                              Ref: {formatShortAccountingReference(j.sourceId)}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center gap-1 font-medium text-slate-800 bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                          <Building2 className="w-3 h-3 text-slate-400" />
                          {getBranchName(j.branchId)}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 max-w-xs">
                        <div className="font-medium text-slate-900">{j.description}</div>
                        {isVoid && j.voidReason && (
                          <div className="text-[10px] text-rose-600 mt-0.5 italic">
                            Alasan Batal: {j.voidReason}
                          </div>
                        )}
                        {reversal && (
                          <div className="text-[10px] text-amber-700 mt-0.5">
                            Dibalik oleh <span title={reversal.journalNumber}>{formatShortAccountingReference(reversal.journalNumber)}</span>: {reversal.reversalReason}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-[11px]">
                        {debitLine && (
                          <div className="text-slate-800 font-medium">
                            <span className="text-emerald-700 font-bold">{isSuper ? "DR:" : "Jenis:"}</span>{" "}
                            {getAccountName(debitLine.accountId)}
                          </div>
                        )}
                        {creditLine && (
                          <div className="text-slate-600 mt-0.5">
                            <span className="text-blue-700 font-bold">{isSuper ? "CR:" : "Sumber:"}</span>{" "}
                            {getAccountName(creditLine.accountId)}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right font-bold font-mono text-sm">
                        <span className={isVoid || isReversed ? "line-through text-slate-400" : "text-rose-700"}>
                          Rp {j.totalDebit.toLocaleString("id-ID")}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded text-[10px] font-bold ${
                            isVoid
                              ? "bg-rose-50 text-rose-700 border border-rose-200"
                              : isReversed
                              ? "bg-amber-50 text-amber-800 border border-amber-200"
                              : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          }`}
                        >
                          {isReversed
                            ? "Dikoreksi"
                            : j.status === JournalStatus.POSTED
                            ? "Tercatat"
                            : j.status === JournalStatus.VOID
                            ? "Dibatalkan"
                            : j.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            onClick={() => navigate(accountingPath)}
                            className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                            title="Buka di Jurnal Umum / Buku Besar"
                          >
                            <BookOpen className="w-3.5 h-3.5" />
                          </button>

                          {j.status === JournalStatus.POSTED && !isReversed && !j.sourceId?.startsWith("RECURRING_SETTLEMENT:") && (
                            <button
                              type="button"
                              onClick={() => handleOpenReversalModal(j)}
                              className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 rounded transition-colors"
                              title="Buat jurnal pembalik dan pertahankan jurnal asal"
                            >
                              <RotateCcw className="w-3 h-3" />
                              Koreksi
                            </button>
                          )}

                          {j.status === JournalStatus.DRAFT && (currentUser?.role === UserRole.SUPER_ADMIN || currentUser?.role === UserRole.BRANCH_ADMIN) && (
                            <button
                              onClick={() => setExpenseToDelete(j)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                              title="Hapus draft pengeluaran"
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

      {/* Modal: Catat Pengeluaran Cabang */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl border border-slate-100 max-w-md w-full p-6 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Receipt className="w-5 h-5 text-rose-600" />
                Catat Pengeluaran Cabang
              </h3>
              <button
                onClick={() => setIsCreateOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-600 my-3 leading-relaxed">
              Formulir ini untuk pengeluaran operasional yang sudah dibayar. <strong>Sewa gedung dan THR tidak dicatat di sini</strong>; atur target penyisihannya di bagian Penyisihan Harian Otomatis.
            </div>

            <form onSubmit={handleCreateExpense} className="space-y-4 text-xs">
              {actionError && (
                <div className="p-3 bg-rose-50 text-rose-700 rounded-lg flex items-center gap-2 border border-rose-100">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{actionError}</span>
                </div>
              )}

              {/* Tanggal & Cabang */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">
                    Tanggal Pengeluaran *
                  </label>
                  <input
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    required
                    className="w-full border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">Gunakan tanggal saat pengeluaran terjadi.</span>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">
                    Cabang Klinik *
                  </label>
                  {isSuper ? (
                    <select
                      value={formBranchId}
                      onChange={(e) => setFormBranchId(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg p-2 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-rose-500"
                    >
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="w-full border border-slate-200 bg-slate-100 rounded-lg p-2 font-semibold text-slate-700">
                      {getBranchName(formBranchId)}
                    </div>
                  )}
                </div>
              </div>

              {/* Jenis Pengeluaran */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">
                  Jenis Pengeluaran *
                </label>
                <select
                  value={formExpenseAccountId}
                  onChange={(e) => setFormExpenseAccountId(e.target.value)}
                  required
                  className="w-full border border-slate-200 rounded-lg p-2 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-rose-500"
                >
                  {expenseAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
                <span className="text-[10px] text-slate-400 mt-0.5 block">
                  Pilih sesuai kebutuhan yang dibayar oleh cabang.
                </span>
              </div>

              {/* Dibayar Menggunakan */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">
                  Dibayar Menggunakan *
                </label>
                <select
                  value={formPaymentAccountId}
                  onChange={(e) => setFormPaymentAccountId(e.target.value)}
                  required
                  className="w-full border border-slate-200 rounded-lg p-2 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-rose-500"
                >
                  {paymentAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
                <span className="text-[10px] text-slate-400 mt-0.5 block">
                  Pilih uang tunai atau rekening yang digunakan untuk membayar.
                </span>
              </div>

              {/* Jumlah */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">
                  Jumlah (Rp) *
                </label>
                <input
                  type="number"
                  min="1"
                  value={formAmount || ""}
                  onChange={(e) => setFormAmount(parseInt(e.target.value) || 0)}
                  placeholder="0"
                  required
                  className="w-full text-base font-bold border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-rose-500 font-mono"
                />
                <span className="text-[10px] text-slate-400 mt-0.5 block">Masukkan jumlah yang benar-benar dibayarkan.</span>
              </div>

              {/* Keterangan */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">
                  Keterangan *
                </label>
                <textarea
                  rows={2}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Contoh: Pembayaran listrik PLN bulan ini"
                  required
                  className="w-full border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              {/* Bukti / No Referensi / Kwitansi (Opsional) */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">
                  Bukti / No. Referensi / Kwitansi (Opsional)
                </label>
                <input
                  type="text"
                  value={formRefNumber}
                  onChange={(e) => setFormRefNumber(e.target.value)}
                  placeholder="Contoh: KWT-PLN-202609"
                  className="w-full border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 border border-slate-200 rounded-lg font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-semibold shadow-xs disabled:opacity-50"
                >
                  {isSubmitting ? "Menyimpan..." : "Simpan Pengeluaran"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isPlanModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-100 max-w-md w-full p-6">
            <h3 className="text-base font-bold text-slate-900">{editingPlan ? "Ubah Rencana Akrual" : "Atur Penyisihan Otomatis"}</h3>
            <p className="text-[11px] text-slate-500 mt-1 mb-4">
              Sewa menggunakan nominal bulanan. THR menggunakan target total setahun, bukan nominal pembayaran harian.
            </p>
            <form onSubmit={handleSavePlan} className="space-y-3 text-xs">
              {actionError && <div className="p-2 rounded bg-rose-50 text-rose-700">{actionError}</div>}
              {isSuper && (
                <label className="block">
                  <span className="block font-semibold mb-1">Cabang *</span>
                  <select required value={planBranchId} onChange={(event) => setPlanBranchId(event.target.value)} className="w-full border border-slate-200 rounded-lg p-2 bg-white">
                    {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                  </select>
                </label>
              )}
              {!isSuper && <div className="p-2 bg-slate-50 rounded-lg font-semibold">{getBranchName(planBranchId)}</div>}
              <label className="block">
                <span className="block font-semibold mb-1">Jenis penyisihan *</span>
                <select required disabled={Boolean(editingPlan)} value={planType} onChange={(event) => setPlanType(event.target.value as RecurringExpenseType)} className="w-full border border-slate-200 rounded-lg p-2 bg-white disabled:bg-slate-100">
                  <option value="RENT">Sewa Gedung (nominal per bulan)</option>
                  <option value="THR">THR (target tahunan)</option>
                </select>
              </label>
              <label className="block">
                <span className="block font-semibold mb-1">{planType === "RENT" ? "Nominal sewa per bulan (Rp) *" : "Target THR setahun (Rp) *"}</span>
                <input required type="number" min="1" step="1" value={planAmount || ""} onChange={(event) => setPlanAmount(Number(event.target.value) || 0)} className="w-full border border-slate-200 rounded-lg p-2 font-mono" />
              </label>
              <label className="block">
                <span className="block font-semibold mb-1">Mulai dihitung dari tanggal *</span>
                <input required type="date" value={planStartsOn} onChange={(event) => setPlanStartsOn(event.target.value)} className="w-full border border-slate-200 rounded-lg p-2" />
                <span className="block mt-1 text-[10px] text-amber-700">Tanggal lampau akan dihitung susulan saat jadwal otomatis berjalan.</span>
              </label>
              {editingPlan && (
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={planIsActive} onChange={(event) => setPlanIsActive(event.target.checked)} />
                  Aktifkan penyisihan otomatis
                </label>
              )}
              <div className="flex justify-end gap-2 pt-3 border-t">
                <button type="button" onClick={() => setIsPlanModalOpen(false)} className="px-4 py-2 border rounded-lg">Batal</button>
                <button disabled={isSubmitting} type="submit" className="px-4 py-2 bg-rose-600 text-white rounded-lg font-semibold disabled:opacity-50">{isSubmitting ? "Menyimpan..." : "Simpan Rencana"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedPlanForPayment && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-100 max-w-md w-full p-6">
            <h3 className="text-base font-bold text-slate-900">Catat Pembayaran {selectedPlanForPayment.expenseType === "RENT" ? "Sewa" : "THR"}</h3>
            <p className="text-[11px] text-slate-500 mt-1 mb-4">
              Dicatat sebagai pengurangan utang dan kas/bank, bukan beban baru.
              Kewajiban yang sudah dijurnal: Rp {(recurringBalances[selectedPlanForPayment.id] || 0).toLocaleString("id-ID")}.
            </p>
            <form onSubmit={handleSettleRecurringExpense} className="space-y-3 text-xs">
              {actionError && <div className="p-2 rounded bg-rose-50 text-rose-700">{actionError}</div>}
              <label className="block">
                <span className="block font-semibold mb-1">Tanggal pembayaran *</span>
                <input required type="date" value={settlementDate} onChange={(event) => setSettlementDate(event.target.value)} className="w-full border border-slate-200 rounded-lg p-2" />
              </label>
              <label className="block">
                <span className="block font-semibold mb-1">Dibayar dari *</span>
                <select required value={settlementPaymentAccountId} onChange={(event) => setSettlementPaymentAccountId(event.target.value)} className="w-full border border-slate-200 rounded-lg p-2 bg-white">
                  {paymentAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} - {account.name}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="block font-semibold mb-1">Jumlah pembayaran (Rp) *</span>
                <input required type="number" min="1" max={recurringBalances[selectedPlanForPayment.id] || 0} step="1" value={settlementAmount || ""} onChange={(event) => setSettlementAmount(Number(event.target.value) || 0)} className="w-full border border-slate-200 rounded-lg p-2 font-mono" />
              </label>
              <label className="block">
                <span className="block font-semibold mb-1">Referensi / bukti (opsional)</span>
                <input value={settlementReference} onChange={(event) => setSettlementReference(event.target.value)} className="w-full border border-slate-200 rounded-lg p-2" />
              </label>
              <div className="flex justify-end gap-2 pt-3 border-t">
                <button type="button" onClick={() => setSelectedPlanForPayment(null)} className="px-4 py-2 border rounded-lg">Batal</button>
                <button disabled={isSubmitting || settlementAmount <= 0} type="submit" className="px-4 py-2 bg-rose-600 text-white rounded-lg font-semibold disabled:opacity-50">{isSubmitting ? "Menyimpan..." : "Catat Pembayaran"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Reverse Posted Expense */}
      {isReversalModalOpen && selectedExpenseJournal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-100 max-w-md w-full p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-amber-800 flex items-center gap-2">
                <RotateCcw className="w-5 h-5 text-rose-600" />
                Koreksi dengan Jurnal Pembalik
              </h3>
              <button
                type="button"
                onClick={() => setIsReversalModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
                aria-label="Tutup koreksi jurnal"
              >
                ✕
              </button>
            </div>

            <form onSubmit={(event) => void handleReverseExpense(event)} className="space-y-4 mt-4 text-xs">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 space-y-1">
                <div className="font-bold flex items-center gap-1">
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                  Jurnal asal tidak akan dihapus
                </div>
                <p className="text-[11px]">
                  Sistem membuat jurnal baru dengan debit dan kredit terbalik, lalu mem-postingnya. Jurnal asal tetap tersimpan. Untuk memperbaiki kategori, catat ulang pengeluaran dengan kategori yang benar setelah pembalikan.
                </p>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">
                  Transaksi Pengeluaran
                </label>
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                  <div className="font-bold text-slate-900 font-mono">
                    <span title={selectedExpenseJournal.journalNumber}>
                      {formatShortAccountingReference(selectedExpenseJournal.journalNumber)}
                    </span>
                  </div>
                  <div className="text-slate-600 mt-0.5">{selectedExpenseJournal.description}</div>
                  <div className="font-bold text-rose-700 mt-1 font-mono">
                    Rp {selectedExpenseJournal.totalDebit.toLocaleString("id-ID")}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">
                  Tanggal Jurnal Pembalik *
                </label>
                <input
                  type="date"
                  value={reversalDate}
                  min={selectedExpenseJournal.journalDate}
                  onChange={(event) => setReversalDate(event.target.value)}
                  required
                  className="w-full border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Koreksi akan memengaruhi laporan pada tanggal ini.
                </p>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">
                  Alasan Koreksi (Wajib Diisi) *
                </label>
                <textarea
                  rows={3}
                  value={reversalReason}
                  onChange={(e) => setReversalReason(e.target.value)}
                  minLength={5}
                  maxLength={500}
                  placeholder="Contoh: kategori pengeluaran pada jurnal asal keliru"
                  required
                  className="w-full border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsReversalModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 rounded-lg font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || reversalReason.trim().length < 5}
                  className="px-4 py-2 bg-amber-700 hover:bg-amber-800 text-white rounded-lg font-semibold shadow-xs disabled:opacity-50"
                >
                  {isSubmitting ? "Membuat jurnal..." : "Buat Jurnal Pembalik"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Konfirmasi Hapus Transaksi Pengeluaran */}
      {expenseToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900 text-center">
              Konfirmasi Hapus Pengeluaran
            </h3>
            <p className="text-xs text-slate-600 text-center mt-2 leading-relaxed">
              Apakah Anda yakin ingin menghapus transaksi pengeluaran <strong title={expenseToDelete.journalNumber}>{formatShortAccountingReference(expenseToDelete.journalNumber)}</strong> ({expenseToDelete.description})? Transaksi dan ayat jurnal ini akan dihapus dari sistem pembukuan secara permanen.
            </p>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={isDeletingExpense}
                onClick={() => setExpenseToDelete(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isDeletingExpense}
                onClick={handleConfirmDeleteExpense}
                className="px-4 py-2 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {isDeletingExpense ? "Menghapus..." : "Ya, Hapus Pengeluaran"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
