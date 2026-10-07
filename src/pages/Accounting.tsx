import React, { useState, useEffect, useMemo } from "react";
import { useApp } from "../context/AppContext";
import {
  AccountType,
  AccountCategory,
  NormalBalance,
  JournalStatus,
  JournalSourceType,
  ChartOfAccount,
  JournalLine,
  JournalEntry,
  GeneralLedgerEntry,
  UserRole,
  IncomeStatementReport
} from "../types/domain";
import {
  CreateAccountInput,
  UpdateAccountInput,
  CreateJournalInput,
  CreateJournalLineInput,
  AccountBalanceResult
} from "../repositories/interfaces";
import {
  BookOpen,
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
  RotateCcw,
  Edit2,
  Trash2,
  Eye,
  Check,
  X,
  Scale,
  RefreshCw,
  Info,
  TrendingUp,
  TrendingDown,
  DollarSign
} from "lucide-react";

export const Accounting: React.FC = () => {
  const {
    currentUser,
    selectedBranchId,
    branches,
    accountingRepo,
    accounts,
    journals,
    refreshData
  } = useApp();

  const isSuper = currentUser?.role === UserRole.SUPER_ADMIN;
  const userBranchId = currentUser?.role === UserRole.BRANCH_ADMIN ? currentUser.assignedBranchId : selectedBranchId;

  const [activeTab, setActiveTab] = useState<"journals" | "coa" | "ledger" | "profit_loss">("journals");
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filter States for Journals
  const [journalSearch, setJournalSearch] = useState("");
  const [journalStatusFilter, setJournalStatusFilter] = useState<string>("ALL");
  const [journalSourceFilter, setJournalSourceFilter] = useState<string>("ALL");
  const [journalBranchFilter, setJournalBranchFilter] = useState<string>(userBranchId || "ALL");
  const [journalDateFrom, setJournalDateFrom] = useState<string>("");
  const [journalDateTo, setJournalDateTo] = useState<string>("");

  // COA Filter States
  const [coaSearch, setCoaSearch] = useState("");
  const [coaTypeFilter, setCoaTypeFilter] = useState<string>("ALL");

  // Ledger Filter States
  const [ledgerAccountId, setLedgerAccountId] = useState<string>("ALL");
  const [ledgerBranchFilter, setLedgerBranchFilter] = useState<string>(userBranchId || "ALL");
  const [ledgerDateFrom, setLedgerDateFrom] = useState<string>("");
  const [ledgerDateTo, setLedgerDateTo] = useState<string>("");
  const [ledgerEntries, setLedgerEntries] = useState<GeneralLedgerEntry[]>([]);
  const [ledgerBalance, setLedgerBalance] = useState<AccountBalanceResult | null>(null);

  // Profit & Loss Filter States
  const [plBranchFilter, setPlBranchFilter] = useState<string>(userBranchId || "ALL");
  const [plDateFrom, setPlDateFrom] = useState<string>("");
  const [plDateTo, setPlDateTo] = useState<string>("");
  const [incomeReport, setIncomeReport] = useState<IncomeStatementReport | null>(null);
  const [perBranchReports, setPerBranchReports] = useState<
    Array<{ branchId: string; branchName: string; totalRevenue: number; totalExpense: number; netIncome: number }>
  >([]);

  // Modals & Drawers
  const [selectedJournal, setSelectedJournal] = useState<JournalEntry | null>(null);
  const [isCreateJournalOpen, setIsCreateJournalOpen] = useState(false);
  const [isEditAccountOpen, setIsEditAccountOpen] = useState(false);
  const [selectedAccountForEdit, setSelectedAccountForEdit] = useState<ChartOfAccount | null>(null);
  const [isCreateAccountOpen, setIsCreateAccountOpen] = useState(false);
  const [voidReasonModalOpen, setVoidReasonModalOpen] = useState(false);
  const [voidReasonText, setVoidReasonText] = useState("");
  const [journalToDelete, setJournalToDelete] = useState<{ id: string; isDraft: boolean; number: string } | null>(null);
  const [isDeletingJournal, setIsDeletingJournal] = useState(false);

  // Form State for Journal
  const [journalFormDate, setJournalFormDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [journalFormBranchId, setJournalFormBranchId] = useState<string>(
    userBranchId || branches[0]?.id || "branch-gebang"
  );
  const [journalFormDesc, setJournalFormDesc] = useState<string>("");
  const [journalFormSourceType, setJournalFormSourceType] = useState<JournalSourceType>(
    JournalSourceType.MANUAL
  );
  const [journalFormLines, setJournalFormLines] = useState<
    Array<{ accountId: string; description: string; debit: number; credit: number }>
  >([
    { accountId: accounts[0]?.id || "coa-1000", description: "", debit: 0, credit: 0 },
    { accountId: accounts[1]?.id || "coa-1010", description: "", debit: 0, credit: 0 }
  ]);

  // Form State for Account (COA)
  const [accountFormCode, setAccountFormCode] = useState("");
  const [accountFormName, setAccountFormName] = useState("");
  const [accountFormType, setAccountFormType] = useState<AccountType>(AccountType.ASSET);
  const [accountFormCategory, setAccountFormCategory] = useState<AccountCategory>(
    AccountCategory.CASH
  );
  const [accountFormNormalBalance, setAccountFormNormalBalance] = useState<NormalBalance>(
    NormalBalance.DEBIT
  );
  const [accountFormDesc, setAccountFormDesc] = useState("");
  const [accountFormIsActive, setAccountFormIsActive] = useState(true);

  // Sync branches for form
  useEffect(() => {
    if (userBranchId) {
      setJournalFormBranchId(userBranchId);
      setJournalBranchFilter(userBranchId);
      setLedgerBranchFilter(userBranchId);
      setPlBranchFilter(userBranchId);
    }
  }, [userBranchId]);

  // Set default ledger account
  useEffect(() => {
    if (!ledgerAccountId) {
      setLedgerAccountId("ALL");
    }
  }, [ledgerAccountId]);

  // Load Ledger Entries when Ledger filters change
  useEffect(() => {
    if (activeTab === "ledger" && ledgerAccountId) {
      loadLedgerData();
    }
  }, [activeTab, ledgerAccountId, ledgerBranchFilter, ledgerDateFrom, ledgerDateTo]);

  // Load Income Statement Data when P&L filters change
  useEffect(() => {
    if (activeTab === "profit_loss") {
      loadIncomeStatementData();
    }
  }, [activeTab, plBranchFilter, plDateFrom, plDateTo]);

  const loadIncomeStatementData = async () => {
    try {
      setLoading(true);
      const effectiveBranch = isSuper
        ? plBranchFilter === "ALL"
          ? undefined
          : plBranchFilter
        : (currentUser?.assignedBranchId || userBranchId || undefined);

      const report = await accountingRepo.getIncomeStatementReport(
        {
          branchId: effectiveBranch,
          dateFrom: plDateFrom || undefined,
          dateTo: plDateTo || undefined
        },
        currentUser?.role,
        currentUser?.assignedBranchId || undefined
      );
      setIncomeReport(report);

      if (isSuper) {
        const branchSummaries = await Promise.all(
          branches.map(async (b) => {
            const r = await accountingRepo.getIncomeStatementReport(
              {
                branchId: b.id,
                dateFrom: plDateFrom || undefined,
                dateTo: plDateTo || undefined
              },
              currentUser?.role,
              currentUser?.assignedBranchId || undefined
            );
            return {
              branchId: b.id,
              branchName: b.name,
              totalRevenue: r.totalRevenue,
              totalExpense: r.totalExpense,
              netIncome: r.netIncome
            };
          })
        );
        setPerBranchReports(branchSummaries);
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setActionError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const loadLedgerData = async () => {
    try {
      setLoading(true);
      const branchIdParam = ledgerBranchFilter === "ALL" ? undefined : ledgerBranchFilter;
      const entries = await accountingRepo.getLedgerEntries(
        {
          accountId: ledgerAccountId,
          branchId: branchIdParam,
          dateFrom: ledgerDateFrom || undefined,
          dateTo: ledgerDateTo || undefined
        },
        currentUser?.role,
        currentUser?.assignedBranchId
      );
      setLedgerEntries(entries);

      try {
        const bal = await accountingRepo.getAccountBalance(
          ledgerAccountId,
          branchIdParam,
          ledgerDateTo || undefined,
          currentUser?.role,
          currentUser?.assignedBranchId
        );
        setLedgerBalance(bal);
      } catch {
        setLedgerBalance(null);
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setActionError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  // Filtered Journals List
  const filteredJournals = useMemo(() => {
    return journals.filter((j) => {
      // Branch isolation
      if (currentUser?.role === UserRole.BRANCH_ADMIN && currentUser.assignedBranchId) {
        if (j.branchId !== currentUser.assignedBranchId) return false;
      } else if (journalBranchFilter !== "ALL" && j.branchId !== journalBranchFilter) {
        return false;
      }

      // Status
      if (journalStatusFilter !== "ALL" && j.status !== journalStatusFilter) {
        return false;
      }

      // Source Type
      if (journalSourceFilter !== "ALL" && j.sourceType !== journalSourceFilter) {
        return false;
      }

      // Dates
      if (journalDateFrom && j.journalDate < journalDateFrom) return false;
      if (journalDateTo && j.journalDate > journalDateTo) return false;

      // Search
      if (journalSearch) {
        const q = journalSearch.toLowerCase();
        const matchNum = j.journalNumber.toLowerCase().includes(q);
        const matchDesc = j.description.toLowerCase().includes(q);
        const matchSrc = j.sourceId?.toLowerCase().includes(q);
        const matchLine = j.lines.some((l) => l.description?.toLowerCase().includes(q));
        if (!matchNum && !matchDesc && !matchSrc && !matchLine) return false;
      }

      return true;
    });
  }, [
    journals,
    currentUser,
    journalBranchFilter,
    journalStatusFilter,
    journalSourceFilter,
    journalDateFrom,
    journalDateTo,
    journalSearch
  ]);

  // Filtered COA List
  const filteredAccounts = useMemo(() => {
    return accounts.filter((a) => {
      if (coaTypeFilter !== "ALL" && a.accountType !== coaTypeFilter) {
        return false;
      }
      if (coaSearch) {
        const q = coaSearch.toLowerCase();
        const matchCode = a.code.toLowerCase().includes(q);
        const matchName = a.name.toLowerCase().includes(q);
        const matchCat = a.accountCategory.toLowerCase().includes(q);
        if (!matchCode && !matchName && !matchCat) return false;
      }
      return true;
    });
  }, [accounts, coaTypeFilter, coaSearch]);

  // Helper for Category Selection depending on Type
  const availableCategories = useMemo(() => {
    switch (accountFormType) {
      case AccountType.ASSET:
        return [
          { value: AccountCategory.CASH, label: "Kas (Cash)" },
          { value: AccountCategory.BANK, label: "Bank & QRIS Settlement" },
          { value: AccountCategory.ACCOUNTS_RECEIVABLE, label: "Piutang Pasien" },
          { value: AccountCategory.INVENTORY, label: "Persediaan Bahan Medis" },
          { value: AccountCategory.PREPAID_EXPENSE, label: "Beban Dibayar Dimuka" },
          { value: AccountCategory.FIXED_ASSET, label: "Aset Tetap & Peralatan Dental" },
          { value: AccountCategory.OTHER_ASSET, label: "Aset Lainnya" }
        ];
      case AccountType.LIABILITY:
        return [
          { value: AccountCategory.ACCOUNTS_PAYABLE, label: "Hutang Usaha & Supplier" },
          { value: AccountCategory.PAYROLL_PAYABLE, label: "Hutang Gaji Staff" },
          { value: AccountCategory.DOCTOR_PAYABLE, label: "Hutang Jasa Dokter" },
          { value: AccountCategory.INCENTIVE_PAYABLE, label: "Hutang Insentif & Kompensasi" },
          { value: AccountCategory.TAX_PAYABLE, label: "Hutang Pajak" },
          { value: AccountCategory.OTHER_LIABILITY, label: "Kewajiban Lainnya" }
        ];
      case AccountType.EQUITY:
        return [
          { value: AccountCategory.OWNER_CAPITAL, label: "Modal Pemilik" },
          { value: AccountCategory.RETAINED_EARNINGS, label: "Laba Ditahan" },
          { value: AccountCategory.OTHER_EQUITY, label: "Ekuitas Lainnya" }
        ];
      case AccountType.REVENUE:
        return [
          { value: AccountCategory.TREATMENT_REVENUE, label: "Pendapatan Tindakan Medis" },
          { value: AccountCategory.OTHER_REVENUE, label: "Pendapatan Lain-lain" }
        ];
      case AccountType.EXPENSE:
        return [
          { value: AccountCategory.SALARY_EXPENSE, label: "Beban Gaji Staff" },
          { value: AccountCategory.DOCTOR_FEE_EXPENSE, label: "Beban Bagi Hasil Dokter" },
          { value: AccountCategory.INCENTIVE_EXPENSE, label: "Beban Insentif Staff" },
          { value: AccountCategory.RENT_EXPENSE, label: "Beban Sewa Gedung & Tempat" },
          { value: AccountCategory.UTILITIES_EXPENSE, label: "Beban Listrik, Air & Internet" },
          { value: AccountCategory.SUPPLIES_EXPENSE, label: "Beban Bahan & Perlengkapan Medis" },
          { value: AccountCategory.MARKETING_EXPENSE, label: "Beban Pemasaran & Iklan" },
          { value: AccountCategory.OTHER_OPERATING_EXPENSE, label: "Beban Operasional Lainnya" }
        ];
      default:
        return [];
    }
  }, [accountFormType]);

  // When type changes, auto-set default normal balance and first category
  const handleAccountTypeChange = (newType: AccountType) => {
    setAccountFormType(newType);
    if (newType === AccountType.ASSET || newType === AccountType.EXPENSE) {
      setAccountFormNormalBalance(NormalBalance.DEBIT);
    } else {
      setAccountFormNormalBalance(NormalBalance.CREDIT);
    }
    // Set default category
    if (newType === AccountType.ASSET) setAccountFormCategory(AccountCategory.CASH);
    else if (newType === AccountType.LIABILITY) setAccountFormCategory(AccountCategory.ACCOUNTS_PAYABLE);
    else if (newType === AccountType.EQUITY) setAccountFormCategory(AccountCategory.OWNER_CAPITAL);
    else if (newType === AccountType.REVENUE) setAccountFormCategory(AccountCategory.TREATMENT_REVENUE);
    else if (newType === AccountType.EXPENSE) setAccountFormCategory(AccountCategory.SALARY_EXPENSE);
  };

  // Journal Line Form helpers
  const formTotalDebit = useMemo(() => {
    return journalFormLines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  }, [journalFormLines]);

  const formTotalCredit = useMemo(() => {
    return journalFormLines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  }, [journalFormLines]);

  const isFormBalanced = formTotalDebit > 0 && formTotalDebit === formTotalCredit;

  const handleAddJournalLine = () => {
    setJournalFormLines([
      ...journalFormLines,
      { accountId: accounts[0]?.id || "coa-1000", description: "", debit: 0, credit: 0 }
    ]);
  };

  const handleRemoveJournalLine = (index: number) => {
    if (journalFormLines.length <= 2) {
      setActionError("Jurnal harus memiliki minimal 2 baris akun");
      return;
    }
    setJournalFormLines(journalFormLines.filter((_, i) => i !== index));
  };

  const handleUpdateJournalLine = (
    index: number,
    field: "accountId" | "description" | "debit" | "credit",
    value: any
  ) => {
    const updated = [...journalFormLines];
    if (field === "debit") {
      const num = Math.max(0, parseInt(value) || 0);
      updated[index].debit = num;
      if (num > 0) updated[index].credit = 0; // mutually exclusive per line
    } else if (field === "credit") {
      const num = Math.max(0, parseInt(value) || 0);
      updated[index].credit = num;
      if (num > 0) updated[index].debit = 0; // mutually exclusive per line
    } else {
      updated[index][field] = value;
    }
    setJournalFormLines(updated);
  };

  // Submit Create Journal
  const handleCreateJournal = async (autoPost: boolean = false) => {
    setActionError(null);
    try {
      if (!journalFormDesc.trim()) {
        throw new Error("Deskripsi jurnal wajib diisi");
      }
      if (journalFormLines.length < 2) {
        throw new Error("Jurnal harus memiliki minimal 2 baris transaksi");
      }
      if (autoPost && !isFormBalanced) {
        throw new Error("Jurnal tidak seimbang. Total Debit harus sama dengan Total Kredit untuk memposting.");
      }

      setLoading(true);
      const input: CreateJournalInput = {
        journalDate: journalFormDate,
        branchId: journalFormBranchId,
        description: journalFormDesc.trim(),
        sourceType: journalFormSourceType,
        lines: journalFormLines.map((l) => ({
          accountId: l.accountId,
          description: l.description.trim() || undefined,
          debit: l.debit,
          credit: l.credit,
          branchId: journalFormBranchId
        }))
      };

      const created = await accountingRepo.createDraftJournal(
        input,
        currentUser?.name || "Admin",
        currentUser?.role,
        currentUser?.assignedBranchId
      );

      if (autoPost) {
        await accountingRepo.postJournal(
          created.id,
          currentUser?.name || "Admin",
          currentUser?.role,
          currentUser?.assignedBranchId
        );
        setSuccessMessage(`Jurnal ${created.journalNumber} berhasil dibuat dan diposting.`);
      } else {
        setSuccessMessage(`Draft jurnal ${created.journalNumber} berhasil disimpan.`);
      }

      await refreshData();
      setIsCreateJournalOpen(false);
      resetJournalForm();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setActionError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const resetJournalForm = () => {
    setJournalFormDate(new Date().toISOString().split("T")[0]);
    setJournalFormBranchId(userBranchId || branches[0]?.id || "branch-gebang");
    setJournalFormDesc("");
    setJournalFormSourceType(JournalSourceType.MANUAL);
    setJournalFormLines([
      { accountId: accounts[0]?.id || "coa-1000", description: "", debit: 0, credit: 0 },
      { accountId: accounts[1]?.id || "coa-1010", description: "", debit: 0, credit: 0 }
    ]);
  };

  // Post an existing draft journal
  const handlePostJournal = async (journalId: string) => {
    setActionError(null);
    try {
      setLoading(true);
      const posted = await accountingRepo.postJournal(
        journalId,
        currentUser?.name || "Admin",
        currentUser?.role,
        currentUser?.assignedBranchId
      );
      setSuccessMessage(`Jurnal ${posted.journalNumber} berhasil diposting.`);
      await refreshData();
      if (selectedJournal && selectedJournal.id === journalId) {
        setSelectedJournal(posted);
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setActionError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  // Void a journal
  const handleVoidJournal = async () => {
    if (!selectedJournal) return;
    setActionError(null);
    try {
      setLoading(true);
      const voided = await accountingRepo.voidJournal(
        selectedJournal.id,
        currentUser?.name || "Admin",
        voidReasonText.trim() || "Dibatalkan oleh admin",
        currentUser?.role,
        currentUser?.assignedBranchId
      );
      setSuccessMessage(`Jurnal ${voided.journalNumber} berhasil dibatalkan (VOID).`);
      setVoidReasonModalOpen(false);
      setVoidReasonText("");
      await refreshData();
      setSelectedJournal(voided);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setActionError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  // Delete / Koreksi journal (Super Admin / Draft)
  const handleConfirmDeleteJournal = async () => {
    if (!journalToDelete) return;
    setActionError(null);
    try {
      setIsDeletingJournal(true);
      if (journalToDelete.isDraft) {
        await accountingRepo.deleteDraftJournal(
          journalToDelete.id,
          currentUser?.role,
          currentUser?.assignedBranchId
        );
        setSuccessMessage(`Draft jurnal ${journalToDelete.number} berhasil dihapus.`);
      } else {
        await accountingRepo.deleteJournal(
          journalToDelete.id,
          currentUser?.role,
          currentUser?.assignedBranchId
        );
        setSuccessMessage(`Transaksi jurnal ${journalToDelete.number} berhasil dihapus.`);
      }
      if (selectedJournal?.id === journalToDelete.id) {
        setSelectedJournal(null);
      }
      setJournalToDelete(null);
      await refreshData();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setActionError(err.message);
      }
    } finally {
      setIsDeletingJournal(false);
    }
  };

  // Create new Account (COA)
  const handleCreateAccount = async () => {
    setActionError(null);
    try {
      if (!accountFormCode.trim()) throw new Error("Kode akun wajib diisi");
      if (!accountFormName.trim()) throw new Error("Nama akun wajib diisi");

      setLoading(true);
      const input: CreateAccountInput = {
        code: accountFormCode.trim(),
        name: accountFormName.trim(),
        accountType: accountFormType,
        accountCategory: accountFormCategory,
        normalBalance: accountFormNormalBalance,
        description: accountFormDesc.trim(),
        isActive: accountFormIsActive
      };

      const created = await accountingRepo.createAccount(input);
      setSuccessMessage(`Akun ${created.code} - ${created.name} berhasil dibuat.`);
      await refreshData();
      setIsCreateAccountOpen(false);
      resetAccountForm();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setActionError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  // Update Account (COA)
  const handleUpdateAccount = async () => {
    if (!selectedAccountForEdit) return;
    setActionError(null);
    try {
      if (!accountFormName.trim()) throw new Error("Nama akun wajib diisi");

      setLoading(true);
      const updates: UpdateAccountInput = {
        name: accountFormName.trim(),
        accountType: accountFormType,
        accountCategory: accountFormCategory,
        normalBalance: accountFormNormalBalance,
        description: accountFormDesc.trim(),
        isActive: accountFormIsActive
      };

      const updated = await accountingRepo.updateAccount(selectedAccountForEdit.id, updates);
      setSuccessMessage(`Akun ${updated.code} - ${updated.name} berhasil diperbarui.`);
      await refreshData();
      setIsEditAccountOpen(false);
      setSelectedAccountForEdit(null);
      resetAccountForm();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setActionError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const openEditAccountModal = (acc: ChartOfAccount) => {
    setSelectedAccountForEdit(acc);
    setAccountFormCode(acc.code);
    setAccountFormName(acc.name);
    setAccountFormType(acc.accountType);
    setAccountFormCategory(acc.accountCategory);
    setAccountFormNormalBalance(acc.normalBalance);
    setAccountFormDesc(acc.description || "");
    setAccountFormIsActive(acc.isActive);
    setIsEditAccountOpen(true);
  };

  const resetAccountForm = () => {
    setAccountFormCode("");
    setAccountFormName("");
    setAccountFormType(AccountType.ASSET);
    setAccountFormCategory(AccountCategory.CASH);
    setAccountFormNormalBalance(NormalBalance.DEBIT);
    setAccountFormDesc("");
    setAccountFormIsActive(true);
  };

  const getBranchName = (bId: string) => {
    const b = branches.find((item) => item.id === bId);
    return b ? b.name : bId;
  };

  const getAccountInfo = (accId: string) => {
    const a = accounts.find((item) => item.id === accId || item.code === accId);
    return a ? { code: a.code, name: a.name } : { code: accId, name: "Unknown" };
  };

  const formatRupiah = (val: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0
    }).format(val || 0);
  };

  const totalPostedJournals = useMemo(() => {
    return filteredJournals.filter((j) => j.status === JournalStatus.POSTED).length;
  }, [filteredJournals]);

  const totalDraftJournals = useMemo(() => {
    return filteredJournals.filter((j) => j.status === JournalStatus.DRAFT).length;
  }, [filteredJournals]);

  const totalVolumeRupiah = useMemo(() => {
    return filteredJournals
      .filter((j) => j.status === JournalStatus.POSTED)
      .reduce((s, j) => s + j.totalDebit, 0);
  }, [filteredJournals]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6" id="accounting-page">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-600 uppercase tracking-wider">
            <BookOpen className="w-4 h-4" />
            <span>{isSuper ? "Accounting Core & Journal Engine" : "Laporan Keuangan Cabang"}</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">
            {isSuper ? "Akuntansi & Buku Besar" : "Laporan Keuangan & Pencatatan Cabang"}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {isSuper
              ? "Fondasi Chart of Accounts, Jurnal Umum double-entry, validasi debit/kredit, dan Buku Besar."
              : "Ringkasan pendapatan, pengeluaran, serta riwayat pencatatan keuangan operasional cabang."}
          </p>
        </div>

        {/* Action button */}
        <div className="flex items-center gap-2">
          {activeTab === "journals" && isSuper && (
            <button
              id="btn-create-journal"
              onClick={() => {
                resetJournalForm();
                setIsCreateJournalOpen(true);
              }}
              className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-4 py-2.5 rounded-lg shadow-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Buat Jurnal Manual</span>
            </button>
          )}

          {activeTab === "coa" && isSuper && (
            <button
              id="btn-create-account"
              onClick={() => {
                resetAccountForm();
                setIsCreateAccountOpen(true);
              }}
              className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-4 py-2.5 rounded-lg shadow-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Akun (COA)</span>
            </button>
          )}

          <button
            onClick={() => refreshData()}
            title="Refresh Data"
            className="p-2.5 text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Notifications */}
      {actionError && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-lg flex items-start gap-3 text-sm">
          <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-semibold">Perhatian:</span> {actionError}
          </div>
          <button onClick={() => setActionError(null)} className="text-rose-400 hover:text-rose-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-lg flex items-start gap-3 text-sm">
          <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
          <div className="flex-1 font-medium">{successMessage}</div>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-400 hover:text-emerald-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200 gap-6">
        <button
          id="tab-journals"
          onClick={() => setActiveTab("journals")}
          className={`pb-3 font-semibold text-sm transition-colors relative flex items-center gap-2 ${
            activeTab === "journals"
              ? "text-emerald-600 border-b-2 border-emerald-600"
              : "text-slate-500 hover:text-slate-800"
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>{isSuper ? "Jurnal Umum" : "Pencatatan Keuangan"}</span>
          <span className="ml-1 px-2 py-0.5 text-xs rounded-full bg-slate-100 text-slate-700">
            {filteredJournals.length}
          </span>
        </button>

        <button
          id="tab-coa"
          onClick={() => setActiveTab("coa")}
          className={`pb-3 font-semibold text-sm transition-colors relative flex items-center gap-2 ${
            activeTab === "coa"
              ? "text-emerald-600 border-b-2 border-emerald-600"
              : "text-slate-500 hover:text-slate-800"
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>{isSuper ? "Chart of Accounts" : "Daftar Jenis Akun"}</span>
          <span className="ml-1 px-2 py-0.5 text-xs rounded-full bg-slate-100 text-slate-700">
            {accounts.length}
          </span>
        </button>

        <button
          id="tab-ledger"
          onClick={() => setActiveTab("ledger")}
          className={`pb-3 font-semibold text-sm transition-colors relative flex items-center gap-2 ${
            activeTab === "ledger"
              ? "text-emerald-600 border-b-2 border-emerald-600"
              : "text-slate-500 hover:text-slate-800"
          }`}
        >
          <Scale className="w-4 h-4" />
          <span>{isSuper ? "Buku Besar (General Ledger)" : "Riwayat Keuangan"}</span>
        </button>

        <button
          id="tab-profit-loss"
          onClick={() => setActiveTab("profit_loss")}
          className={`pb-3 font-semibold text-sm transition-colors relative flex items-center gap-2 ${
            activeTab === "profit_loss"
              ? "text-emerald-600 border-b-2 border-emerald-600"
              : "text-slate-500 hover:text-slate-800"
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          <span>Laba Rugi</span>
        </button>
      </div>

      {/* TAB 1: JURNAL UMUM */}
      {activeTab === "journals" && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-xs font-semibold text-slate-500 uppercase">Total Jurnal Terdaftar</span>
              <p className="text-2xl font-bold text-slate-900 mt-1">{filteredJournals.length}</p>
              <span className="text-xs text-slate-400">Semua status dalam filter</span>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-xs font-semibold text-emerald-600 uppercase">Jurnal Posted</span>
              <p className="text-2xl font-bold text-emerald-700 mt-1">{totalPostedJournals}</p>
              <span className="text-xs text-slate-400">Sah & Masuk Buku Besar</span>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-xs font-semibold text-amber-600 uppercase">Draft Belum Diposting</span>
              <p className="text-2xl font-bold text-amber-700 mt-1">{totalDraftJournals}</p>
              <span className="text-xs text-slate-400">Dapat diedit atau dihapus</span>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-xs font-semibold text-slate-500 uppercase">Total Nilai Debit/Kredit</span>
              <p className="text-2xl font-bold text-slate-900 mt-1">{formatRupiah(totalVolumeRupiah)}</p>
              <span className="text-xs text-slate-400">Total mutasi jurnal posted</span>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
              {/* Search */}
              <div className="relative min-w-[220px] flex-1 max-w-sm">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Cari nomor jurnal, deskripsi..."
                  value={journalSearch}
                  onChange={(e) => setJournalSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Branch Filter */}
              {isSuper && (
                <div className="min-w-[140px]">
                  <select
                    id="filter-journal-branch"
                    value={journalBranchFilter}
                    onChange={(e) => setJournalBranchFilter(e.target.value)}
                    className="w-full py-1.5 px-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="ALL">Semua Cabang</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Status Filter */}
              <div className="min-w-[120px]">
                <select
                  id="filter-journal-status"
                  value={journalStatusFilter}
                  onChange={(e) => setJournalStatusFilter(e.target.value)}
                  className="w-full py-1.5 px-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-emerald-500"
                >
                  <option value="ALL">Semua Status</option>
                  <option value={JournalStatus.POSTED}>POSTED</option>
                  <option value={JournalStatus.DRAFT}>DRAFT</option>
                  <option value={JournalStatus.VOID}>VOID</option>
                </select>
              </div>

              {/* Source Type Filter */}
              <div className="min-w-[130px]">
                <select
                  id="filter-journal-source"
                  value={journalSourceFilter}
                  onChange={(e) => setJournalSourceFilter(e.target.value)}
                  className="w-full py-1.5 px-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-emerald-500"
                >
                  <option value="ALL">Semua Sumber</option>
                  <option value={JournalSourceType.MANUAL}>MANUAL</option>
                  <option value={JournalSourceType.INVOICE}>INVOICE</option>
                  <option value={JournalSourceType.PAYMENT}>PAYMENT</option>
                  <option value={JournalSourceType.COMPENSATION}>COMPENSATION</option>
                  <option value={JournalSourceType.PAYROLL}>PAYROLL</option>
                  <option value={JournalSourceType.EXPENSE}>EXPENSE</option>
                  <option value={JournalSourceType.ADJUSTMENT}>ADJUSTMENT</option>
                </select>
              </div>
            </div>

            {/* Date Range */}
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500">Tgl:</span>
              <input
                type="date"
                value={journalDateFrom}
                onChange={(e) => setJournalDateFrom(e.target.value)}
                className="py-1 px-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none"
              />
              <span className="text-slate-400">-</span>
              <input
                type="date"
                value={journalDateTo}
                onChange={(e) => setJournalDateTo(e.target.value)}
                className="py-1 px-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none"
              />
              {(journalSearch ||
                journalStatusFilter !== "ALL" ||
                journalSourceFilter !== "ALL" ||
                (isSuper && journalBranchFilter !== "ALL") ||
                journalDateFrom ||
                journalDateTo) && (
                <button
                  onClick={() => {
                    setJournalSearch("");
                    setJournalStatusFilter("ALL");
                    setJournalSourceFilter("ALL");
                    if (isSuper) setJournalBranchFilter("ALL");
                    setJournalDateFrom("");
                    setJournalDateTo("");
                  }}
                  className="text-xs text-rose-600 hover:underline ml-1"
                >
                  Reset
                </button>
              )}
            </div>
          </div>

          {/* Journals Table */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <th className="py-3 px-4">Nomor Jurnal</th>
                    <th className="py-3 px-4">Tanggal</th>
                    <th className="py-3 px-4">Cabang</th>
                    <th className="py-3 px-4">Deskripsi / Sumber</th>
                    <th className="py-3 px-4">Tipe Sumber</th>
                    <th className="py-3 px-4 text-right">Debit (Rp)</th>
                    <th className="py-3 px-4 text-right">Kredit (Rp)</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredJournals.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-400">
                        Tidak ada transaksi jurnal yang sesuai filter
                      </td>
                    </tr>
                  ) : (
                    filteredJournals.map((j) => {
                      const isDraft = j.status === JournalStatus.DRAFT;
                      const isPosted = j.status === JournalStatus.POSTED;
                      const isVoid = j.status === JournalStatus.VOID;

                      return (
                        <tr key={j.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4 font-mono font-semibold text-slate-900">
                            {j.journalNumber}
                          </td>
                          <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                            {j.journalDate}
                          </td>
                          <td className="py-3 px-4 text-slate-700 whitespace-nowrap font-medium">
                            {getBranchName(j.branchId)}
                          </td>
                          <td className="py-3 px-4 text-slate-800 max-w-xs truncate" title={j.description}>
                            <div>{j.description}</div>
                            {j.sourceId && (
                              <span className="text-[10px] text-slate-400 font-mono">
                                Ref: {j.sourceId}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700">
                              {j.sourceType}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-medium text-slate-900 whitespace-nowrap">
                            {formatRupiah(j.totalDebit)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-medium text-slate-900 whitespace-nowrap">
                            {formatRupiah(j.totalCredit)}
                          </td>
                          <td className="py-3 px-4 text-center whitespace-nowrap">
                            {isPosted && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800">
                                <CheckCircle2 className="w-3 h-3" />
                                POSTED
                              </span>
                            )}
                            {isDraft && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800">
                                <Info className="w-3 h-3" />
                                DRAFT
                              </span>
                            )}
                            {isVoid && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600 line-through">
                                <XCircle className="w-3 h-3" />
                                VOID
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => setSelectedJournal(j)}
                                className="p-1.5 text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 rounded transition-colors"
                                title="Lihat Detail Jurnal"
                              >
                                <Eye className="w-4 h-4" />
                              </button>

                                {isDraft && (
                                <>
                                  <button
                                    onClick={() => handlePostJournal(j.id)}
                                    className="p-1.5 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 rounded transition-colors cursor-pointer"
                                    title="Posting Jurnal"
                                  >
                                    <Check className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => setJournalToDelete({ id: j.id, isDraft: true, number: j.journalNumber })}
                                    className="p-1.5 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                                    title="Hapus Draft"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </>
                              )}

                              {isSuper && !isDraft && (
                                <button
                                  onClick={() => setJournalToDelete({ id: j.id, isDraft: false, number: j.journalNumber })}
                                  className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                                  title="Hapus / Koreksi Transaksi Jurnal"
                                >
                                  <Trash2 className="w-4 h-4" />
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
        </div>
      )}

      {/* TAB 2: CHART OF ACCOUNTS (COA) */}
      {activeTab === "coa" && (
        <div className="space-y-6">
          {/* COA Filters Bar */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
              <div className="relative min-w-[220px] flex-1 max-w-sm">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Cari kode akun, nama, kategori..."
                  value={coaSearch}
                  onChange={(e) => setCoaSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="min-w-[140px]">
                <select
                  value={coaTypeFilter}
                  onChange={(e) => setCoaTypeFilter(e.target.value)}
                  className="w-full py-1.5 px-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-emerald-500"
                >
                  <option value="ALL">Semua Tipe Akun</option>
                  <option value={AccountType.ASSET}>ASSET (Aset / Aktiva)</option>
                  <option value={AccountType.LIABILITY}>LIABILITY (Kewajiban)</option>
                  <option value={AccountType.EQUITY}>EQUITY (Modal)</option>
                  <option value={AccountType.REVENUE}>REVENUE (Pendapatan)</option>
                  <option value={AccountType.EXPENSE}>EXPENSE (Beban / Biaya)</option>
                </select>
              </div>
            </div>

            <div className="text-xs text-slate-500">
              Total <span className="font-semibold text-slate-800">{filteredAccounts.length}</span> akun terdaftar
            </div>
          </div>

          {/* COA Table */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <th className="py-3 px-4">Kode Akun</th>
                    <th className="py-3 px-4">Nama Akun</th>
                    <th className="py-3 px-4">Tipe Akun</th>
                    <th className="py-3 px-4">Kategori Akun</th>
                    <th className="py-3 px-4 text-center">Saldo Normal</th>
                    <th className="py-3 px-4">Deskripsi</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    {isSuper && <th className="py-3 px-4 text-center">Aksi</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredAccounts.map((a) => {
                    const isAsset = a.accountType === AccountType.ASSET;
                    const isLiability = a.accountType === AccountType.LIABILITY;
                    const isEquity = a.accountType === AccountType.EQUITY;
                    const isRevenue = a.accountType === AccountType.REVENUE;
                    const isExpense = a.accountType === AccountType.EXPENSE;

                    return (
                      <tr key={a.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-slate-900">
                          {a.code}
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-800">
                          {a.name}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${
                              isAsset
                                ? "bg-blue-100 text-blue-800"
                                : isLiability
                                ? "bg-amber-100 text-amber-800"
                                : isEquity
                                ? "bg-purple-100 text-purple-800"
                                : isRevenue
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-rose-100 text-rose-800"
                            }`}
                          >
                            {a.accountType}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-600 text-[11px]">
                          {a.accountCategory}
                        </td>
                        <td className="py-3 px-4 text-center font-mono font-semibold">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[10px] ${
                              a.normalBalance === NormalBalance.DEBIT
                                ? "bg-indigo-50 text-indigo-700"
                                : "bg-orange-50 text-orange-700"
                            }`}
                          >
                            {a.normalBalance}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-500 text-[11px] max-w-xs truncate">
                          {a.description || "-"}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {a.isActive ? (
                            <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700">
                              Aktif
                            </span>
                          ) : (
                            <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-500">
                              Nonaktif
                            </span>
                          )}
                        </td>
                        {isSuper && (
                          <td className="py-3 px-4 text-center">
                            <button
                              onClick={() => openEditAccountModal(a)}
                              className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded transition-colors"
                              title="Edit Akun"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: BUKU BESAR (GENERAL LEDGER) */}
      {activeTab === "ledger" && (
        <div className="space-y-6">
          {/* Ledger Filter & Account Selection */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3 flex-1">
              {/* Account Dropdown */}
              <div className="min-w-[260px] flex-1 max-w-md">
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Pilih Akun Buku Besar:
                </label>
                <select
                  id="select-ledger-account"
                  value={ledgerAccountId}
                  onChange={(e) => setLedgerAccountId(e.target.value)}
                  className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-900 focus:outline-none focus:border-emerald-500 font-semibold"
                >
                  <option value="ALL">Semua Akun (Konsolidasi)</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} - {a.name} ({a.accountType})
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
                  <span>💡 Pembayaran Gaji/Payroll dicatat via <strong className="text-emerald-700 font-semibold">1010 - Bank</strong>, <strong className="text-emerald-700 font-semibold">2010 - Hutang Gaji</strong>, atau <strong className="text-emerald-700 font-semibold">5000 - Beban Gaji</strong>.</span>
                </p>
              </div>

              {/* Branch Filter */}
              {isSuper ? (
                <div className="min-w-[150px]">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Cabang:
                  </label>
                  <select
                    id="filter-ledger-branch"
                    value={ledgerBranchFilter}
                    onChange={(e) => setLedgerBranchFilter(e.target.value)}
                    className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-emerald-500 font-medium"
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
                <div className="min-w-[150px]">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Cabang:
                  </label>
                  <div className="py-2 px-3 bg-slate-100 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800">
                    {getBranchName(userBranchId || "")}
                  </div>
                </div>
              )}

              {/* Date Filters */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Dari Tgl:
                </label>
                <input
                  type="date"
                  value={ledgerDateFrom}
                  onChange={(e) => setLedgerDateFrom(e.target.value)}
                  className="py-1.5 px-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Sampai Tgl:
                </label>
                <input
                  type="date"
                  value={ledgerDateTo}
                  onChange={(e) => setLedgerDateTo(e.target.value)}
                  className="py-1.5 px-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Account Balance Summary Card */}
          {ledgerBalance && (
            <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white p-5 rounded-xl shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs px-2 py-0.5 bg-emerald-500/20 text-emerald-300 rounded font-bold">
                    {ledgerAccountId === "ALL" ? "ALL" : ledgerBalance.accountCode}
                  </span>
                  <span className="text-xs text-slate-300">
                    {ledgerAccountId === "ALL"
                      ? "Semua Akun • Mutasi Buku Besar"
                      : `${ledgerBalance.accountType} • Saldo Normal: ${ledgerBalance.normalBalance}`}
                  </span>
                </div>
                <h3 className="text-xl font-bold mt-1 text-white">
                  {ledgerAccountId === "ALL" ? "Semua Mutasi Akun" : ledgerBalance.accountName}
                </h3>
              </div>

              <div className="flex items-center gap-6 divide-x divide-slate-700">
                <div className="pr-2">
                  <span className="text-[11px] text-slate-400 block uppercase">Total Debit</span>
                  <span className="text-sm font-semibold font-mono text-emerald-400">
                    {formatRupiah(ledgerBalance.totalDebit)}
                  </span>
                </div>
                <div className="pl-6 pr-2">
                  <span className="text-[11px] text-slate-400 block uppercase">Total Kredit</span>
                  <span className="text-sm font-semibold font-mono text-rose-400">
                    {formatRupiah(ledgerBalance.totalCredit)}
                  </span>
                </div>
                {ledgerAccountId !== "ALL" && (
                  <div className="pl-6">
                    <span className="text-[11px] text-slate-400 block uppercase">Saldo Akhir</span>
                    <span className="text-lg font-bold font-mono text-white">
                      {formatRupiah(ledgerBalance.balance)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Ledger Table */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <th className="py-3 px-4">Tanggal</th>
                    <th className="py-3 px-4">Nomor Jurnal</th>
                    {ledgerAccountId === "ALL" && <th className="py-3 px-4">Akun (COA)</th>}
                    <th className="py-3 px-4">Cabang</th>
                    <th className="py-3 px-4">Keterangan</th>
                    <th className="py-3 px-4">Sumber</th>
                    <th className="py-3 px-4 text-right">Debit (Rp)</th>
                    <th className="py-3 px-4 text-right">Kredit (Rp)</th>
                    <th className="py-3 px-4 text-right">Saldo Berjalan (Rp)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ledgerEntries.length === 0 ? (
                    <tr>
                      <td colSpan={ledgerAccountId === "ALL" ? 9 : 8} className="py-8 text-center text-slate-400">
                        Tidak ada mutasi buku besar untuk akun dan periode yang dipilih
                      </td>
                    </tr>
                  ) : (
                    ledgerEntries.map((e) => (
                      <tr key={e.lineId} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                          {e.journalDate}
                        </td>
                        <td className="py-3 px-4 font-mono font-semibold text-emerald-700 whitespace-nowrap">
                          {e.journalNumber}
                        </td>
                        {ledgerAccountId === "ALL" && (
                          <td className="py-3 px-4 font-medium text-slate-900 whitespace-nowrap">
                            <span className="font-mono text-xs font-bold text-slate-600 mr-1.5">{e.accountCode}</span>
                            <span>{e.accountName}</span>
                          </td>
                        )}
                        <td className="py-3 px-4 text-slate-700 whitespace-nowrap">
                          {getBranchName(e.branchId)}
                        </td>
                        <td className="py-3 px-4 text-slate-800 max-w-sm">
                          {e.description}
                        </td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700">
                            {e.sourceType}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-medium text-slate-900 whitespace-nowrap">
                          {e.debit > 0 ? formatRupiah(e.debit) : "-"}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-medium text-slate-900 whitespace-nowrap">
                          {e.credit > 0 ? formatRupiah(e.credit) : "-"}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 whitespace-nowrap bg-slate-50/50">
                          {formatRupiah(e.runningBalance || 0)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: LABA RUGI (INCOME STATEMENT) */}
      {activeTab === "profit_loss" && (
        <div className="space-y-6">
          {/* Filters */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3 flex-1">
              {isSuper ? (
                <div className="min-w-[200px]">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Cabang:
                  </label>
                  <select
                    id="filter-pl-branch"
                    value={plBranchFilter}
                    onChange={(e) => setPlBranchFilter(e.target.value)}
                    className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-emerald-500 font-semibold"
                  >
                    <option value="ALL">Semua Cabang (Konsolidasi)</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="min-w-[180px]">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Cabang:
                  </label>
                  <div className="py-2 px-3 bg-slate-100 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800">
                    {getBranchName(userBranchId || "")}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Periode Dari:
                </label>
                <input
                  type="date"
                  value={plDateFrom}
                  onChange={(e) => setPlDateFrom(e.target.value)}
                  className="py-1.5 px-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Periode Sampai:
                </label>
                <input
                  type="date"
                  value={plDateTo}
                  onChange={(e) => setPlDateTo(e.target.value)}
                  className="py-1.5 px-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none"
                />
              </div>
            </div>

            <div className="text-xs text-slate-500 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
              Source of Truth: <strong className="text-emerald-700">Jurnal POSTED</strong>
            </div>
          </div>

          {incomeReport && (
            <>
              {/* KPI Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                  <div>
                    <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                      Total Pendapatan (Revenue)
                    </span>
                    <span className="text-xl font-bold font-mono text-emerald-700 mt-1 block">
                      {formatRupiah(incomeReport.totalRevenue)}
                    </span>
                  </div>
                  <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                    <TrendingUp className="w-6 h-6" />
                  </div>
                </div>

                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                  <div>
                    <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                      Total Beban Operasional (Expense)
                    </span>
                    <span className="text-xl font-bold font-mono text-rose-700 mt-1 block">
                      {formatRupiah(incomeReport.totalExpense)}
                    </span>
                  </div>
                  <div className="w-11 h-11 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
                    <TrendingDown className="w-6 h-6" />
                  </div>
                </div>

                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                  <div>
                    <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                      Laba / (Rugi) Bersih
                    </span>
                    <span
                      className={`text-xl font-bold font-mono mt-1 block ${
                        incomeReport.netIncome >= 0 ? "text-emerald-700" : "text-rose-700"
                      }`}
                    >
                      {formatRupiah(incomeReport.netIncome)}
                    </span>
                  </div>
                  <div
                    className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold ${
                      incomeReport.netIncome >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                    }`}
                  >
                    <DollarSign className="w-6 h-6" />
                  </div>
                </div>
              </div>

              {/* Income Statement Detailed Breakdown */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Revenue Table (4xxx) */}
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
                  <div className="bg-emerald-50/70 border-b border-emerald-200/80 px-4 py-3 flex items-center justify-between">
                    <h3 className="font-bold text-xs uppercase tracking-wider text-emerald-900 flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-emerald-600" />
                      Pendapatan (Revenue - Akun 4xxx)
                    </h3>
                    <span className="font-mono font-bold text-xs text-emerald-800">
                      {formatRupiah(incomeReport.totalRevenue)}
                    </span>
                  </div>

                  <div className="p-4 flex-1">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                          <th className="py-2">Kode</th>
                          <th className="py-2">Nama Akun</th>
                          <th className="py-2 text-right">Nominal (Rp)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {incomeReport.revenues.length === 0 ? (
                          <tr>
                            <td colSpan={3} className="py-6 text-center text-slate-400 italic">
                              Tidak ada transaksi pendapatan POSTED dalam periode ini
                            </td>
                          </tr>
                        ) : (
                          incomeReport.revenues.map((r) => (
                            <tr key={r.accountId} className="hover:bg-slate-50">
                              <td className="py-2.5 font-mono font-semibold text-slate-700">{r.accountCode}</td>
                              <td className="py-2.5 text-slate-800 font-medium">{r.accountName}</td>
                              <td className="py-2.5 text-right font-mono font-bold text-slate-900">
                                {formatRupiah(r.amount)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-slate-300 font-bold text-slate-900">
                          <td colSpan={2} className="py-3">TOTAL PENDAPATAN</td>
                          <td className="py-3 text-right font-mono text-emerald-700">
                            {formatRupiah(incomeReport.totalRevenue)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                {/* Expense Table (5xxx) */}
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
                  <div className="bg-rose-50/70 border-b border-rose-200/80 px-4 py-3 flex items-center justify-between">
                    <h3 className="font-bold text-xs uppercase tracking-wider text-rose-900 flex items-center gap-2">
                      <TrendingDown className="w-4 h-4 text-rose-600" />
                      Beban Operasional & Gaji (Expense - Akun 5xxx)
                    </h3>
                    <span className="font-mono font-bold text-xs text-rose-800">
                      {formatRupiah(incomeReport.totalExpense)}
                    </span>
                  </div>

                  <div className="p-4 flex-1">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                          <th className="py-2">Kode</th>
                          <th className="py-2">Nama Akun</th>
                          <th className="py-2 text-right">Nominal (Rp)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {incomeReport.expenses.length === 0 ? (
                          <tr>
                            <td colSpan={3} className="py-6 text-center text-slate-400 italic">
                              Tidak ada transaksi beban POSTED dalam periode ini
                            </td>
                          </tr>
                        ) : (
                          incomeReport.expenses.map((e) => (
                            <tr key={e.accountId} className="hover:bg-slate-50">
                              <td className="py-2.5 font-mono font-semibold text-slate-700">{e.accountCode}</td>
                              <td className="py-2.5 text-slate-800 font-medium">{e.accountName}</td>
                              <td className="py-2.5 text-right font-mono font-bold text-slate-900">
                                {formatRupiah(e.amount)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-slate-300 font-bold text-slate-900">
                          <td colSpan={2} className="py-3">TOTAL BEBAN OPERASIONAL</td>
                          <td className="py-3 text-right font-mono text-rose-700">
                            {formatRupiah(incomeReport.totalExpense)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </div>

              {/* Super Admin: Per-Branch Summary Matrix */}
              {isSuper && (
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-emerald-600" />
                        Ringkasan Laba Rugi per Cabang (Per-Branch Profit & Loss)
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Kompilasi performa finansial per lokasi cabang berdasarkan Jurnal POSTED
                      </p>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold">
                          <th className="py-3 px-4">Cabang</th>
                          <th className="py-3 px-4 text-right">Pendapatan (Rp)</th>
                          <th className="py-3 px-4 text-right">Beban Operasional (Rp)</th>
                          <th className="py-3 px-4 text-right">Laba / (Rugi) Bersih (Rp)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {perBranchReports.map((b) => (
                          <tr key={b.branchId} className="hover:bg-slate-50">
                            <td className="py-3 px-4 font-semibold text-slate-900">{b.branchName}</td>
                            <td className="py-3 px-4 text-right font-mono text-emerald-700 font-medium">
                              {formatRupiah(b.totalRevenue)}
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-rose-700 font-medium">
                              {formatRupiah(b.totalExpense)}
                            </td>
                            <td
                              className={`py-3 px-4 text-right font-mono font-bold ${
                                b.netIncome >= 0 ? "text-emerald-700" : "text-rose-700"
                              }`}
                            >
                              {formatRupiah(b.netIncome)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-slate-100 border-t-2 border-slate-300 font-bold text-slate-900">
                          <td className="py-3 px-4">TOTAL KONSOLIDASI SELURUH CABANG</td>
                          <td className="py-3 px-4 text-right font-mono text-emerald-700">
                            {formatRupiah(
                              perBranchReports.reduce((s, r) => s + r.totalRevenue, 0)
                            )}
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-rose-700">
                            {formatRupiah(
                              perBranchReports.reduce((s, r) => s + r.totalExpense, 0)
                            )}
                          </td>
                          <td
                            className={`py-3 px-4 text-right font-mono ${
                              perBranchReports.reduce((s, r) => s + r.netIncome, 0) >= 0
                                ? "text-emerald-700"
                                : "text-rose-700"
                            }`}
                          >
                            {formatRupiah(
                              perBranchReports.reduce((s, r) => s + r.netIncome, 0)
                            )}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: JOURNAL DETAIL & AUDIT TRAIL */}
      {/* ============================================================ */}
      {selectedJournal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-3xl w-full max-h-[90vh] overflow-y-auto flex flex-col">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-200 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold text-slate-900">
                    {selectedJournal.journalNumber}
                  </span>
                  {selectedJournal.status === JournalStatus.POSTED && (
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                      POSTED
                    </span>
                  )}
                  {selectedJournal.status === JournalStatus.DRAFT && (
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
                      DRAFT
                    </span>
                  )}
                  {selectedJournal.status === JournalStatus.VOID && (
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 line-through">
                      VOID
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-1">{selectedJournal.description}</p>
              </div>
              <button
                onClick={() => setSelectedJournal(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6 flex-1 text-xs">
              {/* Journal Info Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
                <div>
                  <span className="text-slate-500 block">Tanggal Jurnal</span>
                  <span className="font-semibold text-slate-800">{selectedJournal.journalDate}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Cabang</span>
                  <span className="font-semibold text-slate-800">
                    {getBranchName(selectedJournal.branchId)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Tipe Sumber</span>
                  <span className="font-semibold text-slate-800">{selectedJournal.sourceType}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Ref Transaksi</span>
                  <span className="font-mono font-semibold text-slate-800">
                    {selectedJournal.sourceId || "-"}
                  </span>
                </div>
              </div>

              {/* Void Reason if VOID */}
              {selectedJournal.status === JournalStatus.VOID && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs">
                  <span className="font-bold">Alasan Pembatalan (VOID):</span>{" "}
                  {selectedJournal.voidReason || "Tidak ada alasan tercatat."} &bull; Oleh:{" "}
                  {selectedJournal.voidedBy || "System"} ({selectedJournal.voidedAt})
                </div>
              )}

              {/* Journal Lines Table */}
              <div>
                <h4 className="font-bold text-slate-900 text-sm mb-2 flex items-center justify-between">
                  <span>Rincian Baris Akun (Double Entry)</span>
                  <span className="text-xs font-normal text-slate-500">
                    {selectedJournal.lines.length} baris transaksi
                  </span>
                </h4>

                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 font-semibold">
                        <th className="py-2.5 px-3">Kode Akun</th>
                        <th className="py-2.5 px-3">Nama Akun</th>
                        <th className="py-2.5 px-3">Keterangan Baris</th>
                        <th className="py-2.5 px-3 text-right">Debit (Rp)</th>
                        <th className="py-2.5 px-3 text-right">Kredit (Rp)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedJournal.lines.map((l, idx) => {
                        const acc = getAccountInfo(l.accountId);
                        return (
                          <tr key={l.id || idx} className="hover:bg-slate-50">
                            <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                              {acc.code}
                            </td>
                            <td className="py-2.5 px-3 font-medium text-slate-800">
                              {acc.name}
                            </td>
                            <td className="py-2.5 px-3 text-slate-600">
                              {l.description || "-"}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-slate-900 font-semibold">
                              {l.debit > 0 ? formatRupiah(l.debit) : "-"}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-slate-900 font-semibold">
                              {l.credit > 0 ? formatRupiah(l.credit) : "-"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-50 font-bold border-t border-slate-200 text-slate-900">
                        <td colSpan={3} className="py-2.5 px-3 text-right">
                          Total:
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-emerald-700">
                          {formatRupiah(selectedJournal.totalDebit)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-emerald-700">
                          {formatRupiah(selectedJournal.totalCredit)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Balance validation badge */}
                <div className="mt-2 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    {selectedJournal.totalDebit === selectedJournal.totalCredit ? (
                      <span className="text-emerald-700 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="w-4 h-4" />
                        Jurnal Seimbang (Debit == Kredit)
                      </span>
                    ) : (
                      <span className="text-rose-700 font-semibold flex items-center gap-1">
                        <AlertCircle className="w-4 h-4" />
                        Jurnal Tidak Seimbang! Selisih:{" "}
                        {formatRupiah(
                          Math.abs(selectedJournal.totalDebit - selectedJournal.totalCredit)
                        )}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Audit trail */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-500 space-y-1">
                <div>
                  <span className="font-semibold text-slate-700">Dibuat:</span>{" "}
                  {selectedJournal.createdBy || "Admin"} pada {selectedJournal.createdAt}
                </div>
                {selectedJournal.postedAt && (
                  <div>
                    <span className="font-semibold text-slate-700">Diposting:</span>{" "}
                    {selectedJournal.postedBy || "Admin"} pada {selectedJournal.postedAt}
                  </div>
                )}
                {selectedJournal.voidedAt && (
                  <div>
                    <span className="font-semibold text-slate-700">Dibatalkan (VOID):</span>{" "}
                    {selectedJournal.voidedBy || "Admin"} pada {selectedJournal.voidedAt}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer Actions */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {selectedJournal.status === JournalStatus.POSTED && (
                  <button
                    onClick={() => {
                      setVoidReasonText("");
                      setVoidReasonModalOpen(true);
                    }}
                    className="px-3 py-2 text-amber-700 hover:bg-amber-50 border border-amber-300 rounded-lg text-xs font-semibold transition-colors"
                  >
                    Void / Batalkan Jurnal
                  </button>
                )}
                {isSuper && (
                  <button
                    onClick={() => setJournalToDelete({ id: selectedJournal.id, isDraft: false, number: selectedJournal.journalNumber })}
                    className="px-3 py-2 text-rose-700 hover:bg-rose-50 border border-rose-300 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Hapus Transaksi Jurnal
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                {selectedJournal.status === JournalStatus.DRAFT && (
                  <>
                    <button
                      onClick={() => setJournalToDelete({ id: selectedJournal.id, isDraft: true, number: selectedJournal.journalNumber })}
                      className="px-3 py-2 text-rose-700 hover:bg-rose-50 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                    >
                      Hapus Draft
                    </button>
                    <button
                      onClick={() => handlePostJournal(selectedJournal.id)}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
                    >
                      Posting Jurnal Sekarang
                    </button>
                  </>
                )}
                <button
                  onClick={() => setSelectedJournal(null)}
                  className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg text-xs font-semibold transition-colors"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: CREATE MANUAL JOURNAL */}
      {/* ============================================================ */}
      {isCreateJournalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-4xl w-full max-h-[92vh] overflow-y-auto flex flex-col">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Buat Jurnal Manual (Double Entry)</h3>
                <p className="text-xs text-slate-500">
                  Input baris transaksi debit dan kredit yang seimbang.
                </p>
              </div>
              <button
                onClick={() => setIsCreateJournalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5 flex-1 text-xs">
              {/* Top Form Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Tanggal Jurnal *</label>
                  <input
                    type="date"
                    value={journalFormDate}
                    onChange={(e) => setJournalFormDate(e.target.value)}
                    className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Cabang *</label>
                  <select
                    value={journalFormBranchId}
                    onChange={(e) => setJournalFormBranchId(e.target.value)}
                    disabled={currentUser?.role === UserRole.BRANCH_ADMIN}
                    className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-emerald-500 disabled:opacity-60"
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Tipe Sumber</label>
                  <select
                    value={journalFormSourceType}
                    onChange={(e) => setJournalFormSourceType(e.target.value as JournalSourceType)}
                    className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-emerald-500"
                  >
                    <option value={JournalSourceType.MANUAL}>MANUAL</option>
                    <option value={JournalSourceType.ADJUSTMENT}>ADJUSTMENT (Penyesuaian)</option>
                    <option value={JournalSourceType.EXPENSE}>EXPENSE (Beban Operasional)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Deskripsi / Keterangan Jurnal *</label>
                <input
                  type="text"
                  placeholder="Contoh: Pembelian perlengkapan medis tunai cabang Gebang"
                  value={journalFormDesc}
                  onChange={(e) => setJournalFormDesc(e.target.value)}
                  className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Dynamic Lines */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-slate-800 text-xs">Baris Akun Transaksi</span>
                  <button
                    type="button"
                    onClick={handleAddJournalLine}
                    className="inline-flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-800 font-semibold"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Tambah Baris
                  </button>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 font-semibold">
                        <th className="py-2.5 px-3 min-w-[220px]">Akun *</th>
                        <th className="py-2.5 px-3">Keterangan Baris</th>
                        <th className="py-2.5 px-3 text-right w-36">Debit (Rp)</th>
                        <th className="py-2.5 px-3 text-right w-36">Kredit (Rp)</th>
                        <th className="py-2.5 px-2 text-center w-12">Hapus</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {journalFormLines.map((line, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/60">
                          <td className="py-2 px-3">
                            <select
                              value={line.accountId}
                              onChange={(e) => handleUpdateJournalLine(idx, "accountId", e.target.value)}
                              className="w-full py-1.5 px-2 bg-white border border-slate-200 rounded text-xs text-slate-800 focus:outline-none focus:border-emerald-500 font-medium"
                            >
                              {accounts.map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.code} - {a.name} ({a.accountType})
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-2 px-3">
                            <input
                              type="text"
                              placeholder="Keterangan opsional"
                              value={line.description}
                              onChange={(e) => handleUpdateJournalLine(idx, "description", e.target.value)}
                              className="w-full py-1.5 px-2 bg-white border border-slate-200 rounded text-xs text-slate-800 focus:outline-none focus:border-emerald-500"
                            />
                          </td>
                          <td className="py-2 px-3 text-right">
                            <input
                              type="number"
                              min="0"
                              step="1000"
                              value={line.debit || ""}
                              onChange={(e) => handleUpdateJournalLine(idx, "debit", e.target.value)}
                              placeholder="0"
                              className="w-full py-1.5 px-2 bg-white border border-slate-200 rounded text-xs font-mono text-right text-slate-900 focus:outline-none focus:border-emerald-500"
                            />
                          </td>
                          <td className="py-2 px-3 text-right">
                            <input
                              type="number"
                              min="0"
                              step="1000"
                              value={line.credit || ""}
                              onChange={(e) => handleUpdateJournalLine(idx, "credit", e.target.value)}
                              placeholder="0"
                              className="w-full py-1.5 px-2 bg-white border border-slate-200 rounded text-xs font-mono text-right text-slate-900 focus:outline-none focus:border-emerald-500"
                            />
                          </td>
                          <td className="py-2 px-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveJournalLine(idx)}
                              disabled={journalFormLines.length <= 2}
                              className="p-1 text-slate-400 hover:text-rose-600 disabled:opacity-30 rounded"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-50 font-bold border-t border-slate-200 text-slate-900">
                        <td colSpan={2} className="py-2.5 px-3 text-right">
                          Total Mutasi:
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-emerald-700">
                          {formatRupiah(formTotalDebit)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-emerald-700">
                          {formatRupiah(formTotalCredit)}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Live validation feedback */}
                <div className="mt-3 flex items-center justify-between">
                  {isFormBalanced ? (
                    <span className="text-emerald-700 font-semibold flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" />
                      Status: Seimbang (Total Debit == Total Kredit)
                    </span>
                  ) : (
                    <span className="text-amber-700 font-semibold flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4" />
                      Status: Belum Seimbang. Selisih: {formatRupiah(Math.abs(formTotalDebit - formTotalCredit))}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setIsCreateJournalOpen(false)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg text-xs font-semibold transition-colors"
              >
                Batal
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleCreateJournal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
                >
                  Simpan sebagai Draft
                </button>
                <button
                  type="button"
                  onClick={() => handleCreateJournal(true)}
                  disabled={!isFormBalanced}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
                >
                  Simpan & Posting Langsung
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: CREATE / EDIT CHART OF ACCOUNT (COA) */}
      {/* ============================================================ */}
      {(isCreateAccountOpen || isEditAccountOpen) && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-bold text-slate-900 text-sm">
                {isEditAccountOpen ? "Edit Akun (COA)" : "Tambah Akun Baru (COA)"}
              </h3>
              <button
                onClick={() => {
                  setIsCreateAccountOpen(false);
                  setIsEditAccountOpen(false);
                }}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Kode Akun *</label>
                <input
                  type="text"
                  placeholder="Contoh: 1020, 5070"
                  disabled={isEditAccountOpen}
                  value={accountFormCode}
                  onChange={(e) => setAccountFormCode(e.target.value)}
                  className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-emerald-500 disabled:opacity-50"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nama Akun *</label>
                <input
                  type="text"
                  placeholder="Contoh: Kas Kecil Cabang Muktisari"
                  value={accountFormName}
                  onChange={(e) => setAccountFormName(e.target.value)}
                  className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Tipe Akun *</label>
                  <select
                    value={accountFormType}
                    onChange={(e) => handleAccountTypeChange(e.target.value as AccountType)}
                    className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-emerald-500 font-medium"
                  >
                    <option value={AccountType.ASSET}>ASSET</option>
                    <option value={AccountType.LIABILITY}>LIABILITY</option>
                    <option value={AccountType.EQUITY}>EQUITY</option>
                    <option value={AccountType.REVENUE}>REVENUE</option>
                    <option value={AccountType.EXPENSE}>EXPENSE</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Saldo Normal *</label>
                  <select
                    value={accountFormNormalBalance}
                    onChange={(e) => setAccountFormNormalBalance(e.target.value as NormalBalance)}
                    className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-emerald-500 font-mono font-semibold"
                  >
                    <option value={NormalBalance.DEBIT}>DEBIT</option>
                    <option value={NormalBalance.CREDIT}>CREDIT</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Kategori Akun *</label>
                <select
                  value={accountFormCategory}
                  onChange={(e) => setAccountFormCategory(e.target.value as AccountCategory)}
                  className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-emerald-500"
                >
                  {availableCategories.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label} ({c.value})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Deskripsi</label>
                <textarea
                  rows={2}
                  placeholder="Keterangan fungsi akun"
                  value={accountFormDesc}
                  onChange={(e) => setAccountFormDesc(e.target.value)}
                  className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="acc-is-active"
                  checked={accountFormIsActive}
                  onChange={(e) => setAccountFormIsActive(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-emerald-500"
                />
                <label htmlFor="acc-is-active" className="text-xs text-slate-800 font-medium">
                  Akun Aktif (Dapat dipilih dalam pembuatan jurnal)
                </label>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsCreateAccountOpen(false);
                  setIsEditAccountOpen(false);
                }}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg text-xs font-semibold"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={isEditAccountOpen ? handleUpdateAccount : handleCreateAccount}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-sm"
              >
                {isEditAccountOpen ? "Simpan Perubahan" : "Buat Akun"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: VOID REASON PROMPT */}
      {/* ============================================================ */}
      {voidReasonModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-bold text-rose-800 text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600" />
                Konfirmasi Pembatalan Jurnal (VOID)
              </h3>
              <button onClick={() => setVoidReasonModalOpen(false)} className="p-1 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-slate-600 leading-relaxed">
              Jurnal yang telah di-VOID tidak akan dihitung dalam saldo Buku Besar. Catatan audit trail akan tetap tersimpan.
            </p>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Alasan Pembatalan *
              </label>
              <textarea
                rows={3}
                placeholder="Contoh: Kesalahan penginputan nominal atau pembatalan transaksi kasir"
                value={voidReasonText}
                onChange={(e) => setVoidReasonText(e.target.value)}
                className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-rose-500"
              />
            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setVoidReasonModalOpen(false)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg text-xs font-semibold"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleVoidJournal}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold shadow-sm"
              >
                Konfirmasi VOID
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Konfirmasi Hapus Jurnal */}
      {journalToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900 text-center">
              {journalToDelete.isDraft ? "Hapus Draft Jurnal" : "Hapus Transaksi Jurnal"}
            </h3>
            <p className="text-xs text-slate-600 text-center mt-2 leading-relaxed">
              Apakah Anda yakin ingin menghapus {journalToDelete.isDraft ? "draft jurnal" : "transaksi jurnal"}{" "}
              <strong>{journalToDelete.number}</strong>? Tindakan ini akan menghapus catatan pembukuan tersebut secara permanen.
            </p>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={isDeletingJournal}
                onClick={() => setJournalToDelete(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isDeletingJournal}
                onClick={handleConfirmDeleteJournal}
                className="px-4 py-2 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {isDeletingJournal ? "Menghapus..." : "Ya, Hapus Jurnal"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
