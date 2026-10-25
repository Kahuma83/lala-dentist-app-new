import React, { useState, useEffect, useMemo, useRef } from "react";
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
  DoctorBranchAssignment,
  StaffCompensationRule,
  ClinicBranding
} from "../types/domain";
import { DEFAULT_CLINIC_BRANDING } from "../data/mockData";
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
import { isSupabaseConfigured, supabase } from "../lib/supabase";

import { createPayslipWhatsAppMessage, sanitizeWhatsAppPhone } from "../utils/documentUtils";
import {
  createPayrollPaymentSummary,
  getPreviousPayrollPeriod
} from "../utils/payrollPaymentCycle";

function isDoctorAssignmentActiveForPeriod(
  assignment: DoctorBranchAssignment,
  month: number,
  year: number
): boolean {
  const periodStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const periodEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return assignment.active &&
    assignment.startDate <= periodEnd &&
    (!assignment.endDate || assignment.endDate >= periodStart);
}

type ExternalDoctorPayrollEntry = {
  id: string;
  external_doctor_id: string;
  branch_id: string;
  payroll_month: number;
  payroll_year: number;
  covered_days: number;
  action_count: number | null;
  amount_snapshot: number;
  status: "PENDING_ACTION_COUNT" | "DRAFT" | "APPROVED" | "PAID";
  external_doctor_recipients: { full_name: string; phone: string } | null;
  staff_absence_requests: { start_date: string; end_date: string } | null;
};

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
  const currentYear = new Date().getFullYear();
  const previousPayrollPeriod = getPreviousPayrollPeriod(new Date());

  const [payrolls, setPayrolls] = useState<MonthlyPayroll[]>([]);
  const [externalDoctorPayrollEntries, setExternalDoctorPayrollEntries] = useState<ExternalDoctorPayrollEntry[]>([]);
  const [periodPayrollItems, setPeriodPayrollItems] = useState<PayrollItem[]>([]);
  const [doctors, setDoctors] = useState<DentalDoctor[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [branches, setBranches] = useState<DentalBranch[]>([]);
  const [doctorAssignments, setDoctorAssignments] = useState<DoctorBranchAssignment[]>([]);
  const [journals, setJournals] = useState<JournalEntry[]>([]);
  const [branding, setBranding] = useState<ClinicBranding>(DEFAULT_CLINIC_BRANDING);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedMonth, setSelectedMonth] = useState<number>(() => previousPayrollPeriod.month);
  const [selectedYear, setSelectedYear] = useState<number>(() => previousPayrollPeriod.year);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [showSlipModal, setShowSlipModal] = useState(false);
  const [selectedPayroll, setSelectedPayroll] = useState<MonthlyPayroll | null>(null);
  const [payrollToDelete, setPayrollToDelete] = useState<MonthlyPayroll | null>(null);
  const [payrollToReopen, setPayrollToReopen] = useState<MonthlyPayroll | null>(null);
  const [payrollToConfirmPayment, setPayrollToConfirmPayment] = useState<MonthlyPayroll | null>(null);
  const [correctionPayrollId, setCorrectionPayrollId] = useState<string | null>(null);
  const [isDeletingPayroll, setIsDeletingPayroll] = useState(false);
  const [payrollItems, setPayrollItems] = useState<PayrollItem[]>([]);
  const [payrollJournal, setPayrollJournal] = useState<JournalEntry | null>(null);
  const [syncingPayrollId, setSyncingPayrollId] = useState<string | null>(null);
  const [isPreparingCycle, setIsPreparingCycle] = useState(false);
  const [preparationResult, setPreparationResult] = useState<{
    prepared: string[];
    skipped: string[];
    failed: string[];
  } | null>(null);
  const [preparationRetry, setPreparationRetry] = useState(0);
  const attemptedPreparationRef = useRef<string | null>(null);

  // Generate Modal state
  const [genStaffId, setGenStaffId] = useState("");
  const [genBranchId, setGenBranchId] = useState("");
  const [genBaseSalary, setGenBaseSalary] = useState<number>(2500000);
  const [hasBaseSalaryRule, setHasBaseSalaryRule] = useState<boolean>(false);
  const [genTaxRate, setGenTaxRate] = useState<number | null>(null);
  const [loadingBaseSalaryRule, setLoadingBaseSalaryRule] = useState(false);
  const [baseSalaryRuleLoadError, setBaseSalaryRuleLoadError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const baseSalaryRequestRef = useRef(0);
  const availableYears = useMemo(
    () => Array.from({ length: Math.max(1, currentYear - 2019) }, (_, index) => currentYear - index),
    [currentYear]
  );

  const loadData = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [pList, dList, sList, bList, jList, brand, assignments, externalPayrollResult] = await Promise.all([
        payrollRepo.getPayrolls(selectedMonth, selectedYear),
        doctorRepo.getDoctors(),
        staffRepo.getStaff(),
        branchRepo.getBranches(),
        accountingRepo.getJournals(
          currentUser?.role === UserRole.BRANCH_ADMIN && currentUser.branchId
            ? { branchId: currentUser.branchId }
            : undefined
        ),
        configRepo.getClinicBranding().catch(() => DEFAULT_CLINIC_BRANDING),
        doctorRepo.getDoctorBranchAssignments(),
        isSupabaseConfigured && currentUser?.role === UserRole.SUPER_ADMIN
          ? supabase.from("external_doctor_payroll_entries")
              .select("id,external_doctor_id,branch_id,payroll_month,payroll_year,covered_days,action_count,amount_snapshot,status,external_doctor_recipients(full_name,phone),staff_absence_requests(start_date,end_date)")
              .eq("payroll_month", selectedMonth)
              .eq("payroll_year", selectedYear)
              .order("created_at", { ascending: false })
          : Promise.resolve({ data: [], error: null })
      ]);
      if (externalPayrollResult.error) {
        throw new Error(`Gagal memuat honor dokter eksternal: ${externalPayrollResult.error.message}`);
      }
      const items = await payrollRepo.getPayrollItemsByPayrollIds(pList.map((payroll) => payroll.id));
      setPayrolls(pList);
      setExternalDoctorPayrollEntries((externalPayrollResult.data || []) as ExternalDoctorPayrollEntry[]);
      setPeriodPayrollItems(items);
      setDoctors(dList);
      setStaffList(sList);
      setBranches(bList);
      setDoctorAssignments(assignments);
      setJournals(jList);
      if (brand) setBranding(brand);
    } catch (err) {
      console.error("Error loading payroll:", err);
      setLoadError(`Gagal memuat data payroll: ${err instanceof Error ? err.message : "Kesalahan tidak diketahui."}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedMonth, selectedYear, currentUser?.role]);

  useEffect(() => {
    const periodKey = `${selectedYear}-${selectedMonth}`;
    if (
      loading ||
      loadError ||
      currentUser?.role !== UserRole.SUPER_ADMIN ||
      selectedMonth !== previousPayrollPeriod.month ||
      selectedYear !== previousPayrollPeriod.year ||
      attemptedPreparationRef.current === periodKey
    ) {
      return;
    }

    attemptedPreparationRef.current = periodKey;
    setIsPreparingCycle(true);
    setPreparationResult(null);
    void (async () => {
      const existingPayrollKeys = new Set(
        payrolls.map((payroll) => `${payroll.staffId}|${payroll.branchId || ""}`)
      );
      const recipients = new Map<string, { staffId: string; branchId: string | null }>();
      const addRecipient = (staffId: string, branchId: string | null) => {
        recipients.set(`${staffId}|${branchId || ""}`, { staffId, branchId });
      };
      staffList.filter((staff) => staff.active).forEach((staff) => addRecipient(staff.id, staff.branchId || null));
      doctors.filter((doctor) => doctor.active && doctor.isActive).forEach((doctor) => {
        const branchIds = new Set(
          doctorAssignments
            .filter((assignment) =>
              assignment.doctorId === doctor.id &&
              isDoctorAssignmentActiveForPeriod(assignment, selectedMonth, selectedYear)
            )
            .map((assignment) => assignment.branchId)
        );
        if (doctor.assignedBranchId) branchIds.add(doctor.assignedBranchId);
        if (branchIds.size === 0) addRecipient(doctor.staffId || doctor.id, null);
        else branchIds.forEach((branchId) => addRecipient(doctor.staffId || doctor.id, branchId));
      });

      const prepared: string[] = [];
      const skipped: string[] = [];
      const failed: string[] = [];
      for (const recipientEntry of recipients.values()) {
        if (existingPayrollKeys.has(`${recipientEntry.staffId}|${recipientEntry.branchId || ""}`)) continue;
        const staffId = recipientEntry.staffId;
        const recipient = getStaffInfo(staffId).name;
        try {
          await payrollRepo.generateMonthlyPayroll(
            staffId,
            selectedMonth,
            selectedYear,
            undefined,
            true,
            recipientEntry.branchId
          );
          const branchName = recipientEntry.branchId ? getBranchName(recipientEntry.branchId) : "";
          prepared.push(branchName ? `${recipient} (${branchName})` : recipient);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Kesalahan tidak diketahui.";
          const branchName = recipientEntry.branchId ? getBranchName(recipientEntry.branchId) : "";
          const recipientLabel = branchName ? `${recipient} (${branchName})` : recipient;
          if (/tidak ada gaji pokok aktif|tidak ada gaji pokok|base salary/i.test(message)) {
            skipped.push(`${recipientLabel}: belum memiliki aturan gaji pokok aktif`);
          } else if (/tidak ditemukan|ditautkan/i.test(message)) {
            skipped.push(`${recipientLabel}: belum terhubung dengan data karyawan`);
          } else {
            failed.push(`${recipientLabel}: ${message}`);
          }
        }
      }
      setPreparationResult({ prepared, skipped, failed });
      if (prepared.length > 0) await loadData();
    })().catch((error) => {
      const message = error instanceof Error ? error.message : "Kesalahan tidak diketahui.";
      setLoadError(`Gagal menyiapkan draft payroll otomatis: ${message}`);
    }).finally(() => setIsPreparingCycle(false));
  }, [
    loading,
    loadError,
    currentUser?.role,
    selectedMonth,
    selectedYear,
    previousPayrollPeriod.month,
    previousPayrollPeriod.year,
    payrolls,
    staffList,
    doctors,
    doctorAssignments,
    branches,
    preparationRetry
  ]);

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
      const assignedDoctorIds = new Set(
        doctorAssignments
          .filter((assignment) =>
            assignment.branchId === currentUser.branchId &&
            isDoctorAssignmentActiveForPeriod(assignment, selectedMonth, selectedYear)
          )
          .map((assignment) => assignment.doctorId)
      );
      filteredDoctors = filteredDoctors.filter(
        (doctor) => doctor.assignedBranchId === currentUser.branchId || assignedDoctorIds.has(doctor.id)
      );
    }

    return {
      branchAdmins: filteredStaff.filter((s) => s.position === StaffPosition.BRANCH_ADMIN),
      assistants: filteredStaff.filter((s) => s.position === StaffPosition.ASSISTANT),
      officeBoys: filteredStaff.filter((s) => s.position === StaffPosition.OB),
      otherStaff: filteredStaff.filter((s) => s.position === StaffPosition.OTHER),
      doctors: filteredDoctors
    };
  }, [staffList, doctors, currentUser, doctorAssignments, selectedMonth, selectedYear]);

  const payrollBranchOptions = useMemo(() => {
    const doctor = doctors.find((item) => item.id === genStaffId || item.staffId === genStaffId);
    if (!doctor) {
      const staff = staffList.find((item) => item.id === genStaffId || item.userAccountId === genStaffId);
      return branches.filter((branch) =>
        currentUser?.role === UserRole.BRANCH_ADMIN
          ? branch.id === currentUser.branchId
          : !staff?.branchId || branch.id === staff.branchId
      );
    }

    const assignedIds = new Set(
      doctorAssignments
        .filter((assignment) =>
          assignment.doctorId === doctor.id &&
          isDoctorAssignmentActiveForPeriod(assignment, selectedMonth, selectedYear)
        )
        .map((assignment) => assignment.branchId)
    );
    if (doctor.assignedBranchId) assignedIds.add(doctor.assignedBranchId);
    const linkedStaff = staffList.find((staff) => staff.id === doctor.staffId);
    if (linkedStaff?.branchId) assignedIds.add(linkedStaff.branchId);
    if (currentUser?.role === UserRole.BRANCH_ADMIN) {
      return branches.filter((branch) => branch.id === currentUser.branchId && assignedIds.has(branch.id));
    }
    return branches.filter((branch) => assignedIds.has(branch.id));
  }, [doctors, doctorAssignments, branches, genStaffId, staffList, currentUser, selectedMonth, selectedYear]);

  const handleSelectStaffForPayroll = async (staffId: string) => {
    setGenStaffId(staffId);
    setGenBaseSalary(0);
    setHasBaseSalaryRule(false);
    setGenTaxRate(null);
    setBaseSalaryRuleLoadError(false);
    setErrorMsg("");
    const requestId = ++baseSalaryRequestRef.current;
    setLoadingBaseSalaryRule(true);

    try {
      const rules = await compRepo.getCompensationRulesByStaff(staffId);
      if (requestId !== baseSalaryRequestRef.current) return;
      const periodDate = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}-15`;
      const selectedStaff = staffList.find((staff) => staff.id === staffId || staff.userAccountId === staffId);
      const selectedDoctor = doctors.find((doctor) => doctor.id === staffId || doctor.staffId === staffId);
      const configuredBranchId = rules.find((rule) =>
        rule.ruleTypeSnapshot === "BASE_SALARY" &&
        rule.isActive &&
        rule.branchId &&
        (!rule.effectiveStartDate || rule.effectiveStartDate <= periodDate) &&
        (!rule.effectiveEndDate || rule.effectiveEndDate >= periodDate)
      )?.branchId;
      const branchId = currentUser?.role === UserRole.BRANCH_ADMIN
        ? currentUser.branchId || ""
        : selectedDoctor?.assignedBranchId || selectedStaff?.branchId || configuredBranchId || "";
      setGenBranchId(branchId);
      const matchesPeriod = (rule: StaffCompensationRule) =>
        rule.isActive &&
        (!rule.effectiveStartDate || rule.effectiveStartDate <= periodDate) &&
        (!rule.effectiveEndDate || rule.effectiveEndDate >= periodDate);
      const baseSalaryRule = rules.find((rule) =>
        rule.ruleTypeSnapshot === "BASE_SALARY" &&
        matchesPeriod(rule) &&
        rule.branchId === branchId
      ) || rules.find((rule) =>
        rule.ruleTypeSnapshot === "BASE_SALARY" && matchesPeriod(rule) && !rule.branchId
      );
      const taxRule = rules.find((rule) =>
        rule.ruleTypeSnapshot === "TAX_PERCENTAGE" &&
        matchesPeriod(rule) &&
        rule.branchId === branchId
      );
      setGenTaxRate(taxRule?.valueSnapshot ?? null);
      if (baseSalaryRule) {
        setGenBaseSalary(baseSalaryRule.valueSnapshot);
        setHasBaseSalaryRule(true);
      } else if (selectedStaff?.branchId || selectedDoctor?.assignedBranchId) {
        setGenBaseSalary(0);
      }
    } catch (error) {
      if (requestId === baseSalaryRequestRef.current) {
        setBaseSalaryRuleLoadError(true);
        setErrorMsg(`Gagal memuat aturan gaji pokok: ${error instanceof Error ? error.message : "Kesalahan tidak diketahui."}`);
      }
    } finally {
      if (requestId === baseSalaryRequestRef.current) setLoadingBaseSalaryRule(false);
    }
  };

  const handleSelectPayrollBranch = async (branchId: string) => {
    setGenBranchId(branchId);
    setHasBaseSalaryRule(false);
    setGenTaxRate(null);
    setBaseSalaryRuleLoadError(false);
    const requestId = ++baseSalaryRequestRef.current;
    setLoadingBaseSalaryRule(true);
    try {
      const rules = await compRepo.getCompensationRulesByStaff(genStaffId);
      if (requestId !== baseSalaryRequestRef.current) return;
      const periodDate = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}-15`;
      const matchesPeriod = (rule: StaffCompensationRule) =>
        rule.isActive &&
        (!rule.effectiveStartDate || rule.effectiveStartDate <= periodDate) &&
        (!rule.effectiveEndDate || rule.effectiveEndDate >= periodDate);
      const baseRule = rules.find((rule) =>
        rule.ruleTypeSnapshot === "BASE_SALARY" && matchesPeriod(rule) && rule.branchId === branchId
      ) || rules.find((rule) =>
        rule.ruleTypeSnapshot === "BASE_SALARY" && matchesPeriod(rule) && !rule.branchId
      );
      const taxRule = rules.find((rule) =>
        rule.ruleTypeSnapshot === "TAX_PERCENTAGE" && matchesPeriod(rule) && rule.branchId === branchId
      );
      setGenTaxRate(taxRule?.valueSnapshot ?? null);
      if (baseRule) {
        setGenBaseSalary(baseRule.valueSnapshot);
        setHasBaseSalaryRule(true);
      } else {
        setGenBaseSalary(0);
      }
    } catch (error) {
      if (requestId === baseSalaryRequestRef.current) {
        setBaseSalaryRuleLoadError(true);
        setErrorMsg(`Gagal memuat aturan payroll cabang: ${error instanceof Error ? error.message : "Kesalahan tidak diketahui."}`);
      }
    } finally {
      if (requestId === baseSalaryRequestRef.current) setLoadingBaseSalaryRule(false);
    }
  };

  const selectPayrollJournal = (
    payroll: MonthlyPayroll,
    sourceJournals: JournalEntry[]
  ) => {
    const matchingJournals = sourceJournals.filter(
      (journal) =>
        journal.sourceType === JournalSourceType.PAYROLL &&
        journal.sourceId === payroll.id &&
        journal.status !== "VOID"
    );
    const desiredEvent = payroll.status === PayrollStatus.PAID ? "PAYMENT" : "ACCRUAL";
    const eventJournal = matchingJournals.find((journal) => journal.event === desiredEvent) ||
      matchingJournals.find((journal) =>
        !journal.event &&
        (desiredEvent === "PAYMENT"
          ? /pembayaran|payment/i.test(journal.description)
          : /akrual|accrual/i.test(journal.description) &&
            !/pembayaran|payment/i.test(journal.description))
      );
    return eventJournal || (payroll.status === PayrollStatus.PAID ? null : matchingJournals[0] || null);
  };

  const getPayrollJournal = (payroll: MonthlyPayroll) => {
    return selectPayrollJournal(
      payroll,
      journals.filter(
        (journal) =>
          journal.sourceType === JournalSourceType.PAYROLL &&
          journal.sourceId === payroll.id
      )
    );
  };

  const handleGeneratePayroll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loadingBaseSalaryRule || baseSalaryRuleLoadError) {
      setErrorMsg("Aturan gaji pokok belum berhasil dimuat. Pilih ulang karyawan atau dokter, lalu coba kembali.");
      return;
    }
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
        Number(genBaseSalary),
        false,
        genBranchId || null
      );
      setCorrectionPayrollId(null);
      setShowGenerateModal(false);
      await loadData();
    } catch (err: any) {
      setErrorMsg(err.message || "Gagal mengenerate slip gaji");
    } finally {
      setIsSubmitting(false);
    }
  };

  const closeGenerateModal = () => {
    setShowGenerateModal(false);
    setCorrectionPayrollId(null);
    setErrorMsg("");
  };

  const handleReopenReviewedPayroll = async () => {
    if (!payrollToReopen) return;
    const payroll = payrollToReopen;
    setSyncingPayrollId(payroll.id);
    setLoadError(null);

    try {
      const rules = await compRepo.getCompensationRulesByStaff(payroll.staffId);
      const periodDate = `${payroll.year}-${String(payroll.month).padStart(2, "0")}-15`;
      const baseSalaryRule = rules.find((rule) =>
        rule.ruleTypeSnapshot === "BASE_SALARY" &&
        rule.isActive &&
        rule.branchId === payroll.branchId &&
        (!rule.effectiveStartDate || rule.effectiveStartDate <= periodDate) &&
        (!rule.effectiveEndDate || rule.effectiveEndDate >= periodDate)
      ) || rules.find((rule) =>
        rule.ruleTypeSnapshot === "BASE_SALARY" &&
        rule.isActive &&
        !rule.branchId &&
        (!rule.effectiveStartDate || rule.effectiveStartDate <= periodDate) &&
        (!rule.effectiveEndDate || rule.effectiveEndDate >= periodDate)
      );
      const taxRule = rules.find((rule) =>
        rule.ruleTypeSnapshot === "TAX_PERCENTAGE" &&
        rule.isActive &&
        rule.branchId === payroll.branchId &&
        (!rule.effectiveStartDate || rule.effectiveStartDate <= periodDate) &&
        (!rule.effectiveEndDate || rule.effectiveEndDate >= periodDate)
      );

      await payrollRepo.reopenReviewedPayrollForCorrection(payroll.id, currentUser?.role);

      baseSalaryRequestRef.current += 1;
      setLoadingBaseSalaryRule(false);
      setBaseSalaryRuleLoadError(false);
      setGenStaffId(payroll.staffId);
      setGenBranchId(payroll.branchId || "");
      setGenBaseSalary(payroll.baseSalary);
      setGenTaxRate(taxRule?.valueSnapshot ?? null);
      setHasBaseSalaryRule(Boolean(baseSalaryRule && baseSalaryRule.valueSnapshot === payroll.baseSalary));
      setCorrectionPayrollId(payroll.id);
      setErrorMsg("");
      setPayrollToReopen(null);
      setShowGenerateModal(true);
      await loadData();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Kesalahan tidak diketahui.";
      setLoadError(`Payroll belum dapat dibuka untuk koreksi: ${message}`);
    } finally {
      setSyncingPayrollId(null);
    }
  };

  const handleOpenSlip = async (p: MonthlyPayroll) => {
    setSelectedPayroll(p);
    try {
      const [items, sourceJournals] = await Promise.all([
        payrollRepo.getPayrollItems(p.id),
        accountingRepo.getJournalsBySource(JournalSourceType.PAYROLL, p.id)
      ]);
      setPayrollItems(items);
      setPayrollJournal(selectPayrollJournal(p, sourceJournals));
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
      const [fetchedItems, sourceJournals] = await Promise.all([
        payrollRepo.getPayrollItems(p.id),
        accountingRepo.getJournalsBySource(JournalSourceType.PAYROLL, p.id)
      ]);
      items = fetchedItems;
      jrn = selectPayrollJournal(p, sourceJournals);
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
    setSyncingPayrollId(payrollId);
    setLoadError(null);
    let statusUpdated = false;
    let approvalPostingComplete = false;
    try {
      if (nextStatus === PayrollStatus.PAID) {
        await accountingPostingService.postPayrollPayment(
          payrollId,
          currentUser?.role,
          currentUser?.branchId,
          currentUser?.name || "Admin Payroll"
        );
        await payrollRepo.updatePayrollStatus(payrollId, nextStatus);
        statusUpdated = true;
      } else {
        await payrollRepo.updatePayrollStatus(payrollId, nextStatus);
        statusUpdated = true;
        if (nextStatus === PayrollStatus.APPROVED) {
          await accountingPostingService.postPayroll(
            payrollId,
            currentUser?.role,
            currentUser?.branchId,
            currentUser?.name || "Admin Payroll"
          );
          approvalPostingComplete = true;
        }
      }

      await loadData();
      if (selectedPayroll && selectedPayroll.id === payrollId) {
        setSelectedPayroll({ ...selectedPayroll, status: nextStatus });
        const sourceJournals = await accountingRepo.getJournalsBySource(
          JournalSourceType.PAYROLL,
          payrollId
        );
        setPayrollJournal(
          selectPayrollJournal({ ...selectedPayroll, status: nextStatus }, sourceJournals)
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Kesalahan tidak diketahui.";
      let rollbackError: string | null = null;
      if (nextStatus === PayrollStatus.APPROVED && statusUpdated && !approvalPostingComplete) {
        try {
          await payrollRepo.updatePayrollStatus(payrollId, PayrollStatus.REVIEW);
          statusUpdated = false;
          if (selectedPayroll?.id === payrollId) {
            setSelectedPayroll({ ...selectedPayroll, status: PayrollStatus.REVIEW });
          }
        } catch (rollbackErr) {
          rollbackError = rollbackErr instanceof Error
            ? rollbackErr.message
            : "Kesalahan tidak diketahui.";
        }
      }
      await loadData();
      setLoadError(
        nextStatus === PayrollStatus.PAID
          ? `Payroll belum dapat ditandai PAID karena jurnal pembayaran gagal atau status tidak tersimpan: ${message}`
          : rollbackError
            ? `Jurnal akrual gagal diposting dan status payroll gagal dikembalikan ke REVIEW. Status mungkin masih APPROVED; periksa status dan jurnal sebelum mencoba lagi. Error posting: ${message}. Error pemulihan: ${rollbackError}`
            : statusUpdated
              ? `Status payroll berubah, tetapi data terbaru gagal dimuat: ${message}`
              : nextStatus === PayrollStatus.APPROVED && !approvalPostingComplete
                ? `Persetujuan dibatalkan dan payroll dikembalikan ke REVIEW karena jurnal akrual gagal diposting: ${message}`
                : `Gagal mengubah status payroll: ${message}`
      );
    } finally {
      setSyncingPayrollId(null);
    }
  };

  const handleManualSyncPayroll = async (payrollId: string) => {
    setSyncingPayrollId(payrollId);
    try {
      const payroll = payrolls.find((item) => item.id === payrollId);
      if (!payroll) throw new Error("Payroll tidak ditemukan pada daftar saat ini.");
      const jrn = payroll.status === PayrollStatus.PAID
        ? await accountingPostingService.postPayrollPayment(
          payrollId,
          currentUser?.role,
          currentUser?.branchId,
          currentUser?.name || "Admin Payroll"
        )
        : await accountingPostingService.postPayroll(
          payrollId,
          currentUser?.role,
          currentUser?.branchId,
          currentUser?.name || "Admin Payroll"
        );
      setPayrollJournal(jrn);
      await loadData();
    } catch (err) {
      setLoadError(`Gagal memposting slip gaji ke akuntansi: ${err instanceof Error ? err.message : "Kesalahan tidak diketahui."}`);
    } finally {
      setSyncingPayrollId(null);
    }
  };

  const reviewExternalDoctorPayroll = async (entry: ExternalDoctorPayrollEntry) => {
    setSyncingPayrollId(entry.id);
    setLoadError(null);
    try {
      const { error } = await supabase.rpc("review_external_doctor_payroll_entry", {
        p_entry_id: entry.id,
        p_approve: true
      });
      if (error) throw new Error(error.message);
      await loadData();
    } catch (error: unknown) {
      setLoadError(`Gagal menyetujui honor dokter eksternal: ${error instanceof Error ? error.message : "Kesalahan tidak diketahui."}`);
    } finally {
      setSyncingPayrollId(null);
    }
  };

  const payExternalDoctorPayroll = async (entry: ExternalDoctorPayrollEntry) => {
    if (entry.status !== "PAID" && !window.confirm("Pastikan transfer honor dokter eksternal benar-benar berhasil. Konfirmasi ini akan membuat jurnal pembayaran dan menandai honor sebagai PAID.")) {
      return;
    }
    setSyncingPayrollId(entry.id);
    setLoadError(null);
    try {
      await accountingPostingService.postExternalDoctorPayrollPayment(
        {
          id: entry.id,
          doctorName: entry.external_doctor_recipients?.full_name || "Dokter eksternal",
          branchId: entry.branch_id,
          month: entry.payroll_month,
          year: entry.payroll_year,
          amount: Number(entry.amount_snapshot)
        },
        currentUser?.role,
        currentUser?.branchId,
        currentUser?.name || "Admin Payroll"
      );
      if (entry.status !== "PAID") {
        const { error } = await supabase.rpc("mark_external_doctor_payroll_paid", {
          p_entry_id: entry.id
        });
        if (error) throw new Error(`Jurnal berhasil dibuat tetapi status pembayaran belum tersimpan: ${error.message}`);
      }
      await loadData();
    } catch (error: unknown) {
      setLoadError(`Gagal mencatat pembayaran honor dokter eksternal: ${error instanceof Error ? error.message : "Kesalahan tidak diketahui."}`);
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
      setLoadError(`Gagal menghapus slip gaji: ${err instanceof Error ? err.message : "Kesalahan tidak diketahui."}`);
    } finally {
      setIsDeletingPayroll(false);
      setLoading(false);
    }
  };

  const confirmedExternalDoctorAmount = externalDoctorPayrollEntries
    .filter((entry) => entry.status !== "PENDING_ACTION_COUNT")
    .reduce((sum, entry) => sum + Number(entry.amount_snapshot || 0), 0);
  const totalPayrollBudget = payrolls.reduce((sum, p) => sum + p.netSalary, confirmedExternalDoctorAmount);
  const totalCommissions = payrolls.reduce((sum, p) => sum + p.totalCompensation, 0);
  const paymentSummary = useMemo(
    () => createPayrollPaymentSummary(payrolls, periodPayrollItems, staffList, doctors, selectedMonth, selectedYear),
    [payrolls, periodPayrollItems, staffList, doctors, selectedMonth, selectedYear]
  );

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

        {(currentUser?.role === UserRole.SUPER_ADMIN || currentUser?.role === UserRole.BRANCH_ADMIN) && (
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

      {loadError && (
        <div role="alert" className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{loadError}</span>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            <DollarSign className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Payroll Bersih + Honor Eksternal</div>
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
            {availableYears.map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
        </div>
      </div>

      <section className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Ringkasan Pembayaran Periode {selectedMonth}/{selectedYear}</h2>
            <p className="text-xs text-slate-500 mt-1">
              Jatuh tempo {new Intl.DateTimeFormat("id-ID", {
                day: "numeric",
                month: "long",
                year: "numeric",
                timeZone: "UTC"
              }).format(new Date(`${paymentSummary.dueDate}T00:00:00Z`))}
              {" · "}Transfer dilakukan manual setelah payroll disetujui.
            </p>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Total bersih</div>
            <div className="text-lg font-bold text-slate-900">Rp {paymentSummary.totalNetPay.toLocaleString("id-ID")}</div>
            <div className="text-[10px] text-slate-500">
              {paymentSummary.recipientCount} penerima · {paymentSummary.statusCounts[PayrollStatus.DRAFT]} draft ·{" "}
              {paymentSummary.statusCounts[PayrollStatus.REVIEW]} review ·{" "}
              {paymentSummary.statusCounts[PayrollStatus.APPROVED]} disetujui ·{" "}
              {paymentSummary.statusCounts[PayrollStatus.PAID]} dibayar
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 mt-4">
          {([
            ["Gaji pokok", paymentSummary.categoryTotals.BASE_SALARY],
            ["Sharing dokter", paymentSummary.categoryTotals.DOCTOR_SHARING],
            ["Lembur", paymentSummary.categoryTotals.OVERTIME],
            ["Insentif", paymentSummary.categoryTotals.INCENTIVE],
            ["Pengganti", paymentSummary.categoryTotals.REPLACEMENT],
            ["Potongan", paymentSummary.categoryTotals.DEDUCTION],
            ["Lainnya", paymentSummary.categoryTotals.OTHER]
          ] as const).map(([label, amount]) => (
            <div key={label} className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2">
              <div className="text-[10px] text-slate-500">{label}</div>
              <div className="text-xs font-bold text-slate-800 mt-1">Rp {amount.toLocaleString("id-ID")}</div>
            </div>
          ))}
        </div>
      </section>

      {currentUser?.role === UserRole.SUPER_ADMIN && (
        <section
          className={`rounded-xl border p-3 text-xs ${
            preparationResult?.failed.length
              ? "border-rose-200 bg-rose-50 text-rose-800"
              : preparationResult?.skipped.length
                ? "border-amber-200 bg-amber-50 text-amber-800"
                : "border-blue-200 bg-blue-50 text-blue-800"
          }`}
          aria-live="polite"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <strong>
              {isPreparingCycle
                ? "Menyiapkan draft pembayaran periode sebelumnya..."
                : preparationResult
                  ? `${preparationResult.prepared.length} draft disiapkan otomatis`
                  : "Draft payroll periode sebelumnya disiapkan saat halaman dibuka."}
            </strong>
            {!isPreparingCycle && (preparationResult?.skipped.length || preparationResult?.failed.length) ? (
              <button
                type="button"
                onClick={() => {
                  attemptedPreparationRef.current = null;
                  setPreparationRetry((attempt) => attempt + 1);
                }}
                className="font-semibold underline underline-offset-2"
              >
                Coba lagi
              </button>
            ) : null}
          </div>
          {preparationResult?.skipped.map((warning) => (
            <p key={warning} className="mt-1">{warning}</p>
          ))}
          {preparationResult?.failed.map((failure) => (
            <p key={failure} className="mt-1">{failure}</p>
          ))}
          {preparationResult?.prepared.length ? (
            <p className="mt-1">Draft baru: {preparationResult.prepared.join(", ")}.</p>
          ) : null}
        </section>
      )}

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
                  const jrn = getPayrollJournal(p);
                  const info = getStaffInfo(p.staffId);
                  const hasPayrollItems = periodPayrollItems.some((item) => item.payrollId === p.id);
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
                          {(getBranchName(p.branchId) || info.branch) && (
                            <span>• {getBranchName(p.branchId) || info.branch}</span>
                          )}
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
                            title={p.status === PayrollStatus.PAID ? "Post pembayaran payroll ke akuntansi" : "Post akrual payroll ke akuntansi"}
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

                          {(currentUser?.role === UserRole.SUPER_ADMIN || currentUser?.role === UserRole.BRANCH_ADMIN) && (
                            <>
                              {p.status === PayrollStatus.DRAFT && (
                                <button
                                  onClick={() => handleStatusTransition(p.id, PayrollStatus.REVIEW)}
                                  disabled={syncingPayrollId === p.id || !hasPayrollItems}
                                  title={hasPayrollItems ? "Kirim payroll untuk ditinjau" : "Hitung ulang payroll terlebih dahulu sebelum dikirim untuk ditinjau"}
                                  className="bg-blue-600 hover:bg-blue-700 text-white px-2 py-0.5 rounded text-[10px] font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {syncingPayrollId === p.id ? "Memproses..." : "Review"}
                                </button>
                              )}
                              {p.status === PayrollStatus.REVIEW && (
                                currentUser?.role === UserRole.SUPER_ADMIN && (
                                  <>
                                    <button
                                      onClick={() => setPayrollToReopen(p)}
                                      disabled={syncingPayrollId === p.id}
                                      className="bg-amber-100 hover:bg-amber-200 text-amber-800 px-2 py-0.5 rounded text-[10px] font-semibold"
                                      title="Kembalikan payroll ke DRAFT untuk koreksi dan hitung ulang"
                                    >
                                      Koreksi
                                    </button>
                                    <button
                                      onClick={() => handleStatusTransition(p.id, PayrollStatus.APPROVED)}
                                      disabled={syncingPayrollId === p.id}
                                      className="bg-teal-600 hover:bg-teal-700 text-white px-2 py-0.5 rounded text-[10px] font-semibold"
                                    >
                                      {syncingPayrollId === p.id ? "Memproses..." : "Setujui"}
                                    </button>
                                  </>
                                )
                              )}
                              {p.status === PayrollStatus.APPROVED && currentUser?.role === UserRole.SUPER_ADMIN && (
                                <button
                                  onClick={() => setPayrollToConfirmPayment(p)}
                                  disabled={syncingPayrollId === p.id}
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-0.5 rounded text-[10px] font-semibold"
                                >
                                  {syncingPayrollId === p.id ? "Memproses..." : "Bayar"}
                                </button>
                              )}
                              {p.status === PayrollStatus.DRAFT && (
                                <button
                                  onClick={() => setPayrollToDelete(p)}
                                  className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                                  title="Hapus Slip DRAFT yang belum memiliki jurnal"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
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

      {currentUser?.role === UserRole.SUPER_ADMIN && (
        <section className="overflow-hidden rounded-xl border border-indigo-200 bg-white shadow-sm">
          <div className="border-b border-indigo-100 bg-indigo-50/70 px-4 py-3">
            <h2 className="text-sm font-bold text-indigo-950">Honor Dokter Eksternal · Periode {selectedMonth}/{selectedYear}</h2>
            <p className="mt-1 text-[11px] text-indigo-800">Pembayaran penerima non-staf, terpisah dari payroll pegawai. Jurnal dibuat saat pembayaran dikonfirmasi.</p>
          </div>
          {externalDoctorPayrollEntries.length === 0 ? (
            <p className="p-5 text-center text-xs text-slate-500">Belum ada honor dokter eksternal pada periode ini.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-xs">
                <thead className="border-b border-slate-100 bg-slate-50 text-[10px] uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Penerima</th>
                    <th className="px-4 py-3 text-right">Hari</th>
                    <th className="px-4 py-3 text-right">Tindakan</th>
                    <th className="px-4 py-3 text-right">Honor</th>
                    <th className="px-4 py-3 text-center">Status / Jurnal</th>
                    <th className="px-4 py-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {externalDoctorPayrollEntries.map((entry) => {
                    const journal = journals.find((item) =>
                      item.sourceType === JournalSourceType.PAYROLL &&
                      item.sourceId === entry.id &&
                      item.event === "PAYMENT" &&
                      item.status !== "VOID"
                    );
                    return (
                      <tr key={entry.id}>
                        <td className="px-4 py-3">
                          <strong className="text-slate-900">{entry.external_doctor_recipients?.full_name || "Dokter eksternal"}</strong>
                          {entry.external_doctor_recipients?.phone && <div className="mt-0.5 text-[10px] text-slate-500">{entry.external_doctor_recipients.phone}</div>}
                          <div className="mt-0.5 text-[10px] text-slate-500">
                            {entry.staff_absence_requests?.start_date || "Tanggal tidak tersedia"}{entry.staff_absence_requests?.end_date && entry.staff_absence_requests.end_date !== entry.staff_absence_requests.start_date ? ` – ${entry.staff_absence_requests.end_date}` : ""}
                            {" · "}{getBranchName(entry.branch_id) || "Cabang"}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">{entry.covered_days}</td>
                        <td className="px-4 py-3 text-right">{entry.action_count ?? "—"}</td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-900">Rp {Number(entry.amount_snapshot).toLocaleString("id-ID")}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`font-bold ${entry.status === "PAID" ? "text-emerald-700" : entry.status === "APPROVED" ? "text-teal-700" : "text-amber-700"}`}>{entry.status}</span>
                          {journal && <button type="button" onClick={() => navigate(accountingPath)} className="ml-2 inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-700"><BookOpen className="h-3 w-3" />{journal.journalNumber}</button>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {entry.status === "DRAFT" && (
                            <button type="button" disabled={syncingPayrollId === entry.id} onClick={() => void reviewExternalDoctorPayroll(entry)} className="rounded bg-teal-600 px-2.5 py-1.5 font-semibold text-white disabled:opacity-50">
                              {syncingPayrollId === entry.id ? "Memproses..." : "Setujui"}
                            </button>
                          )}
                          {entry.status === "APPROVED" && (
                            <button type="button" disabled={syncingPayrollId === entry.id} onClick={() => void payExternalDoctorPayroll(entry)} className="rounded bg-emerald-600 px-2.5 py-1.5 font-semibold text-white disabled:opacity-50">
                              {syncingPayrollId === entry.id ? "Memproses..." : "Konfirmasi transfer"}
                            </button>
                          )}
                          {entry.status === "PENDING_ACTION_COUNT" && <span className="text-[10px] text-slate-500">Lengkapi tindakan di Pengajuan Izin/Sakit</span>}
                          {entry.status === "PAID" && !journal && (
                            <button type="button" disabled={syncingPayrollId === entry.id} onClick={() => void payExternalDoctorPayroll(entry)} className="rounded border border-slate-200 px-2.5 py-1.5 font-semibold text-slate-700 disabled:opacity-50">Sinkronkan jurnal</button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Modal: Generate Payroll */}
      {showGenerateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl border border-slate-100 max-w-md w-full p-6 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Plus className="w-5 h-5 text-emerald-600" />
                {correctionPayrollId ? "Koreksi Payroll" : "Hitung Payroll"} Periode {selectedMonth}/{selectedYear}
              </h3>
              <button
                onClick={closeGenerateModal}
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

              {correctionPayrollId && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-900">
                  Payroll sudah kembali ke DRAFT. Pastikan koreksi pada data sumber sudah dilakukan, lalu hitung ulang untuk memperbarui total dan rincian slip.
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
                  disabled={Boolean(correctionPayrollId)}
                  className="w-full text-xs border border-slate-200 rounded-lg p-2 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-100 disabled:text-slate-500"
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
                      <option key={d.id} value={d.staffId || d.id}>
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
                <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">
                  Cabang Penerbit Slip *
                </label>
                <select
                  value={genBranchId}
                  onChange={(e) => void handleSelectPayrollBranch(e.target.value)}
                  required={Boolean(doctors.some((doctor) => doctor.id === genStaffId || doctor.staffId === genStaffId))}
                  disabled={
                    Boolean(correctionPayrollId) ||
                    currentUser?.role === UserRole.BRANCH_ADMIN ||
                    !doctors.some((doctor) => doctor.id === genStaffId || doctor.staffId === genStaffId)
                  }
                  className="w-full text-xs border border-slate-200 rounded-lg p-2 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-100 disabled:text-slate-500"
                >
                  {payrollBranchOptions.map((branch) => (
                      <option key={branch.id} value={branch.id}>{branch.name}</option>
                    ))}
                </select>
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Slip, gaji pokok, sharing tindakan, dan pajak dihitung terpisah sesuai cabang ini.
                </span>
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
                  disabled={loadingBaseSalaryRule || hasBaseSalaryRule || baseSalaryRuleLoadError}
                  className="w-full text-sm font-bold border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono disabled:bg-slate-100 disabled:text-slate-500"
                  required
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  {loadingBaseSalaryRule
                    ? "Memuat aturan gaji pokok untuk periode ini..."
                    : hasBaseSalaryRule
                      ? "Nominal mengikuti aturan gaji pokok aktif yang berlaku pada periode payroll ini."
                      : "Belum ada aturan gaji pokok aktif untuk periode ini. Masukkan nominal secara manual."}
                  {" "}Sistem juga mengakumulasi komisi tindakan dan lembur yang disetujui.
                </span>
              </div>
              {genTaxRate !== null && (
                <div className="rounded-lg border border-rose-100 bg-rose-50 p-3 text-[11px] text-rose-800">
                  Pajak cabang: <strong>{genTaxRate}%</strong> dari penghasilan bruto, dipotong seluruhnya dari gaji dokter.
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={closeGenerateModal}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || loadingBaseSalaryRule || baseSalaryRuleLoadError}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs disabled:opacity-50"
                >
                  {isSubmitting
                    ? "Menghitung..."
                    : correctionPayrollId
                      ? "Hitung Ulang & Simpan Koreksi"
                      : "Generate Slip Gaji"}
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

      {payrollToConfirmPayment && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 max-w-md w-full p-6">
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto mb-4">
              <Banknote className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900 text-center">Konfirmasi Transfer Payroll</h3>
            <p className="text-xs text-slate-600 text-center mt-2 leading-relaxed">
              Status PAID hanya boleh dicatat setelah transfer nyata berhasil dilakukan. Konfirmasi pembayaran{" "}
              <strong>{getStaffInfo(payrollToConfirmPayment.staffId).name}</strong> sebesar{" "}
              <strong>Rp {payrollToConfirmPayment.netSalary.toLocaleString("id-ID")}</strong>?
            </p>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={syncingPayrollId === payrollToConfirmPayment.id}
                onClick={() => setPayrollToConfirmPayment(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Belum transfer
              </button>
              <button
                type="button"
                disabled={syncingPayrollId === payrollToConfirmPayment.id}
                onClick={() => {
                  const payrollId = payrollToConfirmPayment.id;
                  setPayrollToConfirmPayment(null);
                  void handleStatusTransition(payrollId, PayrollStatus.PAID);
                }}
                className="px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl disabled:opacity-50"
              >
                {syncingPayrollId === payrollToConfirmPayment.id ? "Memproses..." : "Ya, transfer berhasil"}
              </button>
            </div>
          </div>
        </div>
      )}

      {payrollToReopen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 max-w-md w-full p-6">
            <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center mx-auto mb-4">
              <RefreshCw className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900 text-center">Kembalikan Payroll untuk Koreksi?</h3>
            <p className="text-xs text-slate-600 text-center mt-2 leading-relaxed">
              Payroll <strong>{getStaffInfo(payrollToReopen.staffId).name}</strong> periode{" "}
              <strong>{payrollToReopen.month}/{payrollToReopen.year}</strong> akan kembali ke status DRAFT.
              Setelah dikonfirmasi, periksa atau perbarui data sumber lalu pilih <strong>Hitung Ulang &amp; Simpan Koreksi</strong>.
              Payroll yang sudah memiliki jurnal tidak dapat dibuka kembali.
            </p>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={syncingPayrollId === payrollToReopen.id}
                onClick={() => setPayrollToReopen(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={syncingPayrollId === payrollToReopen.id}
                onClick={() => void handleReopenReviewedPayroll()}
                className="px-4 py-2 text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white rounded-xl disabled:opacity-50"
              >
                {syncingPayrollId === payrollToReopen.id ? "Memproses..." : "Ya, Buka untuk Koreksi"}
              </button>
            </div>
          </div>
        </div>
      )}

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
              (Take Home Pay: Rp {payrollToDelete.netSalary.toLocaleString("id-ID")})? Hanya payroll DRAFT tanpa jurnal yang dapat dihapus.
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
    if (availableStaff.doctors.length > 0) return availableStaff.doctors[0].staffId || availableStaff.doctors[0].id;
    if (availableStaff.branchAdmins.length > 0) return availableStaff.branchAdmins[0].id;
    if (availableStaff.assistants.length > 0) return availableStaff.assistants[0].id;
    return "";
  }
};
