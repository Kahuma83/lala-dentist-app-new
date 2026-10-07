import React, { useState, useEffect, useMemo } from "react";
import { useApp } from "../context/AppContext";
import { useRouter } from "../components/Router";
import {
  MonthlyPayroll,
  PayrollItem,
  PayrollStatus,
  UserRole,
  JournalEntry,
  JournalSourceType,
  StaffPosition,
  Staff,
  DentalDoctor,
  DentalBranch,
  StaffCompensationRule,
  ClinicBranding
} from "../types/domain";
import {
  Banknote,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  Send,
  Eye,
  DollarSign,
  User,
  Calendar,
  AlertCircle,
  FileCheck,
  BookOpen,
  ArrowUpRight,
  RefreshCw,
  Stethoscope,
  Briefcase,
  Check,
  Printer,
  MessageCircle,
  Trash2
} from "lucide-react";
import { PayslipDocumentModal } from "../components/documents/PayslipDocumentModal";
import { DEFAULT_CLINIC_BRANDING } from "../data/mockData";
import { createPayslipWhatsAppMessage, sanitizeWhatsAppPhone } from "../utils/documentUtils";

export const Payroll: React.FC = () => {
  const {
    currentUser,
    payrollRepo,
    doctorRepo,
    staffRepo,
    branchRepo,
    compRepo,
    accountingRepo,
    configRepo,
    accountingPostingService
  } = useApp();
  const { navigate } = useRouter();

  const [payrolls, setPayrolls] = useState<MonthlyPayroll[]>([]);
  const [doctors, setDoctors] = useState<DentalDoctor[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [branches, setBranches] = useState<DentalBranch[]>([]);
  const [journals, setJournals] = useState<JournalEntry[]>([]);
  const [branding, setBranding] = useState<ClinicBranding>(DEFAULT_CLINIC_BRANDING);
  const [loading, setLoading] = useState(true);

  const [selectedMonth, setSelectedMonth] = useState<number>(9);
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [showSlipModal, setShowSlipModal] = useState(false);
  const [selectedPayroll, setSelectedPayroll] = useState<MonthlyPayroll | null>(null);
  const [payrollToDelete, setPayrollToDelete] = useState<MonthlyPayroll | null>(null);
  const [isDeletingPayroll, setIsDeletingPayroll] = useState(false);
  const [payrollItems, setPayrollItems] = useState<PayrollItem[]>([]);
  const [payrollJournal, setPayrollJournal] = useState<JournalEntry | null>(null);
  const [syncingPayrollId, setSyncingPayrollId] = useState<string | null>(null);

  // Generate Modal state
  const [genStaffId, setGenStaffId] = useState("");
  const [genBaseSalary, setGenBaseSalary] = useState<number>(2500000);
  const [hasBaseSalaryRule, setHasBaseSalaryRule] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const loadData = async () => {
    setLoading(true);
    try {
      const [pList, dList, sList, bList, jList, brand] = await Promise.all([
        payrollRepo.getPayrolls(selectedMonth, selectedYear),
        doctorRepo.getDoctors(),
        staffRepo.getStaff(),
        branchRepo.getBranches(),
        accountingRepo.getJournals(
          currentUser?.role === UserRole.BRANCH_ADMIN && currentUser.branchId
            ? { branchId: currentUser.branchId }
            : undefined
        ),
        configRepo.getClinicBranding().catch(() => DEFAULT_CLINIC_BRANDING)
      ]);
      setPayrolls(pList);
      setDoctors(dList);
      setStaffList(sList);
      setBranches(bList);
      setJournals(jList);
      if (brand) setBranding(brand);
    } catch (err) {
      console.error("Error loading payroll:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedMonth, selectedYear]);

  const getBranchName = (branchId?: string | null) => {
    if (!branchId) return "";
    const b = branches.find((branch) => branch.id === branchId);
    return b ? b.name : branchId;
  };

  const getStaffAndDoctor = (staffId: string) => {
    const staff = staffList.find(
      (s) => s.id === staffId || s.userAccountId === staffId || (staffId === "assistant-clary" && s.id === "staff-ast-clary")
    );
    const doctor = doctors.find(
      (d) => d.id === staffId || d.staffId === staffId || (staff && d.staffId === staff.id)
    );
    return { staff, doctor };
  };

  const getPayrollBranch = (
    p?: MonthlyPayroll | null,
    staff?: Staff | null,
    doc?: DentalDoctor | null
  ) => {
    if (!p) return null;
    const branchId = p.branchId || staff?.branchId || doc?.assignedBranchId || "branch-gebang";
    return branches.find((b) => b.id === branchId) || branches[0] || null;
  };

  const getStaffInfo = (staffId: string) => {
    const { staff: s, doctor: d } = getStaffAndDoctor(staffId);
    if (s) {
      return {
        name: s.fullName,
        code: s.employeeCode,
        role: s.position,
        branch: getBranchName(s.branchId),
        isDoctor: s.position === StaffPosition.DOCTOR
      };
    }
    if (d) {
      return {
        name: d.name,
        code: d.doctorCode || d.id,
        role: "Dokter Gigi",
        branch: getBranchName(d.assignedBranchId),
        isDoctor: true
      };
    }
    if (staffId === "assistant-clary") {
      return {
        name: "Claryssa",
        code: "EMP-201",
        role: StaffPosition.ASSISTANT,
        branch: "Gebang",
        isDoctor: false
      };
    }
    return {
      name: staffId,
      code: staffId,
      role: "Staff",
      branch: "",
      isDoctor: false
    };
  };

  const availableStaff = useMemo(() => {
    let filteredStaff = [...staffList];
    let filteredDoctors = [...doctors];

    if (currentUser?.role === UserRole.BRANCH_ADMIN && currentUser.branchId) {
      filteredStaff = filteredStaff.filter((s) => s.branchId === currentUser.branchId);
      filteredDoctors = filteredDoctors.filter((d) => d.assignedBranchId === currentUser.branchId);
    }

    return {
      branchAdmins: filteredStaff.filter((s) => s.position === StaffPosition.BRANCH_ADMIN),
      assistants: filteredStaff.filter((s) => s.position === StaffPosition.ASSISTANT),
      officeBoys: filteredStaff.filter((s) => s.position === StaffPosition.OB),
      otherStaff: filteredStaff.filter((s) => s.position === StaffPosition.OTHER),
      doctors: filteredDoctors
    };
  }, [staffList, doctors, currentUser]);

  const handleSelectStaffForPayroll = async (staffId: string) => {
    setGenStaffId(staffId);
    try {
      const rules = await compRepo.getCompensationRulesByStaff(staffId);
      const baseSalaryRule = rules.find((r) => r.ruleTypeSnapshot === "BASE_SALARY" && r.isActive);
      if (baseSalaryRule) {
        setGenBaseSalary(baseSalaryRule.valueSnapshot);
        setHasBaseSalaryRule(true);
      } else {
        setHasBaseSalaryRule(false);
      }
    } catch {
      setHasBaseSalaryRule(false);
    }
  };

  const getPayrollJournal = (payrollId: string) => {
    return journals.find(
      (j) => j.sourceType === JournalSourceType.PAYROLL && j.sourceId === payrollId
    );
  };

  const handleGeneratePayroll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!genStaffId) {
      setErrorMsg("Pilih karyawan atau dokter terlebih dahulu");
      return;
    }
    setIsSubmitting(true);
    setErrorMsg("");
    try {
      await payrollRepo.generateMonthlyPayroll(
        genStaffId,
        selectedMonth,
        selectedYear,
        Number(genBaseSalary)
      );
      setShowGenerateModal(false);
      await loadData();
    } catch (err: any) {
      setErrorMsg(err.message || "Gagal mengenerate slip gaji");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenSlip = async (p: MonthlyPayroll) => {
    setSelectedPayroll(p);
    try {
      const [items, jrn] = await Promise.all([
        payrollRepo.getPayrollItems(p.id),
        accountingRepo.findBySource(JournalSourceType.PAYROLL, p.id)
      ]);
      setPayrollItems(items);
      setPayrollJournal(jrn);
    } catch {
      setPayrollItems([]);
      setPayrollJournal(null);
    }
    setShowSlipModal(true);
  };

  const handleQuickWhatsApp = async (p: MonthlyPayroll) => {
    setSelectedPayroll(p);
    let items: PayrollItem[] = [];
    let jrn: JournalEntry | null = null;
    try {
      const [fetchedItems, fetchedJrn] = await Promise.all([
        payrollRepo.getPayrollItems(p.id),
        accountingRepo.findBySource(JournalSourceType.PAYROLL, p.id)
      ]);
      items = fetchedItems;
      jrn = fetchedJrn;
      setPayrollItems(items);
      setPayrollJournal(jrn);
    } catch {
      setPayrollItems([]);
      setPayrollJournal(null);
    }

    const { staff, doctor } = getStaffAndDoctor(p.staffId);
    const branch = getPayrollBranch(p, staff, doctor);
    const recipientName = doctor?.name || staff?.fullName || "Pegawai";
    const rawPhone = doctor?.phone || staff?.phone || "";
    const position = doctor ? (doctor.title || "Dokter Gigi") : (staff?.position || "Staf");
    const slipNumber = `SLIP/${branch?.branchCode || "GEB"}/${p.year}${String(p.month).padStart(2, "0")}/${p.id.replace(/[^0-9]/g, "").slice(-4) || "0001"}`;
    const MONTH_NAMES = [
      "",
      "Januari",
      "Februari",
      "Maret",
      "April",
      "Mei",
      "Juni",
      "Juli",
      "Agustus",
      "September",
      "Oktober",
      "November",
      "Desember"
    ];
    const periodName = `${MONTH_NAMES[p.month] || p.month} ${p.year}`;

    const msg = createPayslipWhatsAppMessage({
      clinicName: branch?.clinicName || branding.name,
      branchName: branch?.name || "Gebang",
      payslipNumber: slipNumber,
      periodName,
      employeeName: recipientName,
      employeeCode: staff?.employeeCode || doctor?.doctorCode,
      position,
      bankName: p.bankNameSnapshot || doctor?.bankName || staff?.bankName,
      bankAccountNumber: p.bankAccountNumberSnapshot || doctor?.bankAccountNumber || staff?.bankAccountNumber,
      bankAccountHolder: p.bankAccountHolderSnapshot || doctor?.bankAccountHolder || staff?.bankAccountHolder || recipientName,
      baseSalary: p.baseSalary,
      totalCompensation: p.totalCompensation,
      totalDeductions: p.totalDeductions,
      netSalary: p.netSalary,
      paymentStatus: p.status === PayrollStatus.PAID ? "SUDAH DITRANSFER (PAID)" : "SIAP DITRANSFER",
      journalNumber: jrn?.journalNumber
    });

    const cleanNumber = sanitizeWhatsAppPhone(rawPhone);
    const encoded = encodeURIComponent(msg);
    const waUrl = cleanNumber
      ? `https://wa.me/${cleanNumber}?text=${encoded}`
      : `https://api.whatsapp.com/send?text=${encoded}`;

    window.open(waUrl, "_blank", "noopener,noreferrer");
  };

  const handleStatusTransition = async (payrollId: string, nextStatus: PayrollStatus) => {
    try {
      await payrollRepo.updatePayrollStatus(payrollId, nextStatus);

      // Auto post accrual journal on approval or payment
      if (nextStatus === PayrollStatus.APPROVED || nextStatus === PayrollStatus.PAID) {
        try {
          await accountingPostingService.postPayroll(
            payrollId,
            currentUser?.role,
            currentUser?.branchId,
            currentUser?.name || "Admin Payroll"
          );
        } catch (postErr) {
          console.warn("Auto-posting payroll journal:", postErr);
        }
      }

      await loadData();
      if (selectedPayroll && selectedPayroll.id === payrollId) {
        setSelectedPayroll({ ...selectedPayroll, status: nextStatus });
        const updatedJrn = await accountingRepo.findBySource(JournalSourceType.PAYROLL, payrollId);
        setPayrollJournal(updatedJrn);
      }
    } catch (err: any) {
      console.error(err.message || "Gagal mengubah status payroll");
    }
  };

  const handleManualSyncPayroll = async (payrollId: string) => {
    setSyncingPayrollId(payrollId);
    try {
      const jrn = await accountingPostingService.postPayroll(
        payrollId,
        currentUser?.role,
        currentUser?.branchId,
        currentUser?.name || "Admin Payroll"
      );
      setPayrollJournal(jrn);
      await loadData();
    } catch (err: any) {
      console.error(err.message || "Gagal memposting slip gaji ke akuntansi");
    } finally {
      setSyncingPayrollId(null);
    }
  };

  const handleConfirmDeletePayroll = async () => {
    if (!payrollToDelete) return;
    setIsDeletingPayroll(true);
    try {
      setLoading(true);
      await payrollRepo.deletePayroll(payrollToDelete.id, currentUser?.role);
      if (selectedPayroll?.id === payrollToDelete.id) {
        setShowSlipModal(false);
        setSelectedPayroll(null);
      }
      setPayrollToDelete(null);
      await loadData();
    } catch (err: any) {
      console.error("Gagal menghapus slip gaji:", err);
    } finally {
      setIsDeletingPayroll(false);
      setLoading(false);
    }
  };

  const totalPayrollBudget = payrolls.reduce((sum, p) => sum + p.netSalary, 0);
  const totalCommissions = payrolls.reduce((sum, p) => sum + p.totalCompensation, 0);

  const accountingPath = currentUser?.role === UserRole.BRANCH_ADMIN ? "/branch-admin/accounting" : "/super-admin/accounting";

  return (
    <div className="space-y-6" id="payroll-page">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Banknote className="w-6 h-6 text-emerald-600" />
            Penggajian Karyawan & Dokter (Monthly Payroll)
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Kompilasi gaji pokok (Base Salary), akumulasi komisi tindakan, lembur, dan penerbitan slip gaji resmi
          </p>
        </div>

        {currentUser?.role === UserRole.SUPER_ADMIN && (
          <button
            onClick={() => {
              const defaultStaff = availableDoctorsFirst();
              handleSelectStaffForPayroll(defaultStaff);
              setErrorMsg("");
              setShowGenerateModal(true);
            }}
            className="inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-lg text-xs font-semibold shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            Hitung & Generate Payroll Baru
          </button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            <DollarSign className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Total Beban Gaji Bersih</div>
            <div className="text-base font-bold text-slate-900 mt-0.5">
              Rp {totalPayrollBudget.toLocaleString("id-ID")}
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center font-bold">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Total Komisi Tindakan</div>
            <div className="text-base font-bold text-teal-700 mt-0.5">
              Rp {totalCommissions.toLocaleString("id-ID")}
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            <FileCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Slip Terbit Periode Ini</div>
            <div className="text-base font-bold text-slate-900 mt-0.5">
              {payrolls.length} Karyawan / Dokter
            </div>
          </div>
        </div>
      </div>

      {/* Period Filter */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-emerald-600" />
          <span className="text-xs font-bold text-slate-800">Periode Penggajian:</span>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
            className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 bg-slate-50 font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value={1}>Januari</option>
            <option value={2}>Februari</option>
            <option value={3}>Maret</option>
            <option value={4}>April</option>
            <option value={5}>Mei</option>
            <option value={6}>Juni</option>
            <option value={7}>Juli</option>
            <option value={8}>Agustus</option>
            <option value={9}>September</option>
            <option value={10}>Oktober</option>
            <option value={11}>November</option>
            <option value={12}>Desember</option>
          </select>

          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
            className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 bg-slate-50 font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value={2026}>2026</option>
            <option value={2025}>2025</option>
          </select>
        </div>
      </div>

      {/* Payroll Table */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                <th className="py-3 px-4">Karyawan / Dokter</th>
                <th className="py-3 px-4 text-right">Gaji Pokok</th>
                <th className="py-3 px-4 text-right">Komisi Tindakan</th>
                <th className="py-3 px-4 text-right">Potongan</th>
                <th className="py-3 px-4 text-right">Gaji Bersih (THP)</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-center">Jurnal Akuntansi</th>
                <th className="py-3 px-4 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    Memuat data penggajian...
                  </td>
                </tr>
              ) : payrolls.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    Belum ada slip gaji yang digenerate untuk periode ini. Klik tombol di atas untuk generate payroll.
                  </td>
                </tr>
              ) : (
                payrolls.map((p) => {
                  const jrn = getPayrollJournal(p.id);
                  const info = getStaffInfo(p.staffId);
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-4 font-semibold text-slate-900">
                        <div className="flex items-center gap-1.5">
                          {info.isDoctor ? (
                            <Stethoscope className="w-3.5 h-3.5 text-blue-600" />
                          ) : (
                            <Briefcase className="w-3.5 h-3.5 text-slate-400" />
                          )}
                          <span>{info.name}</span>
                        </div>
                        <div className="text-[10px] text-slate-400 font-normal flex items-center gap-1.5 mt-0.5">
                          <span className="font-mono bg-slate-100 px-1 py-0.2 rounded text-[10px]">
                            {info.code}
                          </span>
                          <span>{info.role}</span>
                          {info.branch && <span>• {info.branch}</span>}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right font-medium text-slate-700 font-mono">
                        Rp {p.baseSalary.toLocaleString("id-ID")}
                      </td>
                      <td className="py-3.5 px-4 text-right font-medium text-emerald-700 font-mono">
                        Rp {p.totalCompensation.toLocaleString("id-ID")}
                      </td>
                      <td className="py-3.5 px-4 text-right font-medium text-rose-700 font-mono">
                        Rp {p.totalDeductions.toLocaleString("id-ID")}
                      </td>
                      <td className="py-3.5 px-4 text-right font-bold text-slate-900 font-mono text-sm">
                        Rp {p.netSalary.toLocaleString("id-ID")}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${
                            p.status === PayrollStatus.PAID
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : p.status === PayrollStatus.APPROVED
                              ? "bg-teal-50 text-teal-700 border border-teal-200"
                              : p.status === PayrollStatus.REVIEW
                              ? "bg-blue-50 text-blue-700 border border-blue-200"
                              : "bg-slate-100 text-slate-700 border border-slate-200"
                          }`}
                        >
                          {p.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        {jrn ? (
                          <button
                            onClick={() => navigate(accountingPath)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition-colors"
                            title="Buka jurnal di Akuntansi"
                          >
                            <BookOpen className="w-3 h-3" />
                            {jrn.journalNumber}
                          </button>
                        ) : (p.status === PayrollStatus.APPROVED || p.status === PayrollStatus.PAID) ? (
                          <button
                            onClick={() => handleManualSyncPayroll(p.id)}
                            disabled={syncingPayrollId === p.id}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors disabled:opacity-50"
                            title="Post akrual ke akuntansi"
                          >
                            <RefreshCw className={`w-3 h-3 ${syncingPayrollId === p.id ? "animate-spin" : ""}`} />
                            Sync Jurnal
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-400 italic">Belum disetujui</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <div className="inline-flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => handleOpenSlip(p)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-slate-700 bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 border border-slate-200 rounded-lg text-[11px] font-semibold transition-all shadow-2xs"
                            title="Buka Lembar Slip Gaji & Slip Bank"
                          >
                            <Eye className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Lihat Slip</span>
                          </button>

                          <button
                            onClick={() => handleQuickWhatsApp(p)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-emerald-800 bg-emerald-50 hover:bg-emerald-100 hover:border-emerald-300 border border-emerald-200 rounded-lg text-[11px] font-semibold transition-all shadow-2xs cursor-pointer"
                            title="Kirim rincian slip gaji & bank transfer langsung ke WhatsApp pegawai"
                          >
                            <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Kirim WA</span>
                          </button>

                          {currentUser?.role === UserRole.SUPER_ADMIN && (
                            <>
                              {p.status === PayrollStatus.DRAFT && (
                                <button
                                  onClick={() => handleStatusTransition(p.id, PayrollStatus.REVIEW)}
                                  className="bg-blue-600 hover:bg-blue-700 text-white px-2 py-0.5 rounded text-[10px] font-semibold"
                                >
                                  Review
                                </button>
                              )}
                              {p.status === PayrollStatus.REVIEW && (
                                <button
                                  onClick={() => handleStatusTransition(p.id, PayrollStatus.APPROVED)}
                                  className="bg-teal-600 hover:bg-teal-700 text-white px-2 py-0.5 rounded text-[10px] font-semibold"
                                >
                                  Setujui
                                </button>
                              )}
                              {p.status === PayrollStatus.APPROVED && (
                                <button
                                  onClick={() => handleStatusTransition(p.id, PayrollStatus.PAID)}
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-0.5 rounded text-[10px] font-semibold"
                                >
                                  Bayar
                                </button>
                              )}
                              <button
                                onClick={() => setPayrollToDelete(p)}
                                className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                                title="Hapus Slip Gaji"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
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

      {/* Modal: Generate Payroll */}
      {showGenerateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl border border-slate-100 max-w-md w-full p-6 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Plus className="w-5 h-5 text-emerald-600" />
                Hitung Payroll Periode {selectedMonth}/{selectedYear}
              </h3>
              <button
                onClick={() => setShowGenerateModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleGeneratePayroll} className="space-y-4 mt-4">
              {errorMsg && (
                <div className="p-3 bg-rose-50 text-rose-700 rounded-lg text-xs flex items-center gap-2 border border-rose-100">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">
                  Pilih Karyawan / Dokter *
                </label>
                <select
                  value={genStaffId}
                  onChange={(e) => handleSelectStaffForPayroll(e.target.value)}
                  required
                  className="w-full text-xs border border-slate-200 rounded-lg p-2 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <optgroup label="Branch Admin">
                    {availableStaff.branchAdmins.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.fullName} ({s.employeeCode}) - {getBranchName(s.branchId)}
                      </option>
                    ))}
                  </optgroup>

                  <optgroup label="Dokter Gigi">
                    {availableStaff.doctors.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.specialization}) - {getBranchName(d.assignedBranchId)}
                      </option>
                    ))}
                  </optgroup>

                  <optgroup label="Asisten / Perawat Gigi">
                    {availableStaff.assistants.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.fullName} ({s.employeeCode}) - {getBranchName(s.branchId)}
                      </option>
                    ))}
                  </optgroup>

                  <optgroup label="Office Boy (OB)">
                    {availableStaff.officeBoys.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.fullName} ({s.employeeCode}) - {getBranchName(s.branchId)}
                      </option>
                    ))}
                  </optgroup>

                  {availableStaff.otherStaff.length > 0 && (
                    <optgroup label="Staf Lainnya">
                      {availableStaff.otherStaff.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.fullName} ({s.employeeCode}) - {getBranchName(s.branchId)}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[11px] font-semibold text-slate-700 uppercase">
                    Gaji Pokok Tetap (Rp) *
                  </label>
                  {hasBaseSalaryRule ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                      <Check className="w-3 h-3" />
                      Tersinkron Master Base Salary
                    </span>
                  ) : (
                    <span className="text-[10px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-100">
                      Input Manual
                    </span>
                  )}
                </div>
                <input
                  type="number"
                  min="0"
                  value={genBaseSalary}
                  onChange={(e) => setGenBaseSalary(parseInt(e.target.value) || 0)}
                  className="w-full text-sm font-bold border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                  required
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  * Sistem akan otomatis mengakumulasi komisi tindakan periode ini, lembur yang disetujui, dan membentuk slip gaji.
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowGenerateModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs disabled:opacity-50"
                >
                  {isSubmitting ? "Menghitung..." : "Generate Slip Gaji"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Payslip Document Modal with Direct WhatsApp, Print, PDF & Bank Slip */}
      <PayslipDocumentModal
        isOpen={showSlipModal}
        onClose={() => setShowSlipModal(false)}
        payroll={selectedPayroll}
        items={payrollItems}
        staff={selectedPayroll ? getStaffAndDoctor(selectedPayroll.staffId).staff : null}
        doctor={selectedPayroll ? getStaffAndDoctor(selectedPayroll.staffId).doctor : null}
        branch={selectedPayroll ? getPayrollBranch(selectedPayroll, getStaffAndDoctor(selectedPayroll.staffId).staff, getStaffAndDoctor(selectedPayroll.staffId).doctor) : null}
        branding={branding}
        journalNumber={payrollJournal?.journalNumber}
        payerName={currentUser?.name || "Manajemen Keuangan Lala Dentist"}
      />

      {/* Modal Konfirmasi Hapus Slip Gaji */}
      {payrollToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900 text-center">
              Konfirmasi Hapus Slip Gaji
            </h3>
            <p className="text-xs text-slate-600 text-center mt-2 leading-relaxed">
              Apakah Anda yakin ingin menghapus slip gaji periode <strong>{payrollToDelete.month}/{payrollToDelete.year}</strong> untuk staf{" "}
              <strong>{getStaffAndDoctor(payrollToDelete.staffId).staff?.fullName || getStaffAndDoctor(payrollToDelete.staffId).doctor?.name || "Karyawan"}</strong>{" "}
              (Take Home Pay: Rp {payrollToDelete.netSalary.toLocaleString("id-ID")})? Tindakan ini tidak dapat dibatalkan.
            </p>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={isDeletingPayroll}
                onClick={() => setPayrollToDelete(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isDeletingPayroll}
                onClick={handleConfirmDeletePayroll}
                className="px-4 py-2 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {isDeletingPayroll ? "Menghapus..." : "Ya, Hapus Slip Gaji"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  function availableDoctorsFirst(): string {
    if (availableStaff.doctors.length > 0) return availableStaff.doctors[0].id;
    if (availableStaff.branchAdmins.length > 0) return availableStaff.branchAdmins[0].id;
    if (availableStaff.assistants.length > 0) return availableStaff.assistants[0].id;
    return "";
  }
};
