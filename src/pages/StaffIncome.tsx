import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertCircle,
  ChevronDown,
  CheckCircle2,
  Clock3,
  DollarSign,
  RefreshCw,
  Search,
  Users
} from "lucide-react";
import { useApp } from "../context/AppContext";
import { useRealtimeSync } from "../hooks/useRealtimeSync";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { CompensationAccrual, PayrollStatus } from "../types/domain";
import { getOperationalDateString } from "../utils/dateUtils";

type PayrollIncomeStatus = PayrollStatus | "NOT_IN_PAYROLL" | "UNKNOWN_PAYROLL" | "MIXED";
type PayrollItemRow = {
  id: string;
  payroll_id: string;
  source_id: string | null;
  type: "EARNING" | "DEDUCTION";
  amount_snapshot: number;
  description_snapshot: string;
};
type PayrollRow = {
  id: string;
  month: number;
  year: number;
  status: PayrollStatus;
  staff_id?: string;
  branch_id?: string | null;
};
type PayrollOnlyIncome = {
  id: string;
  staffId: string;
  branchId: string | null;
  sourceId: string | null;
  amount: number;
  description: string;
  period: string;
  occurredAt: string | null;
  sourceDateUnavailable: boolean;
  status: PayrollStatus;
};
type StaffIncomeViewRow = {
  id: string;
  staffId: string;
  branchId: string | null;
  branchName: string;
  sourceId: string;
  ruleType?: string;
  incomeDescription?: string;
  sourceDateUnavailable: boolean;
  amount: number;
  occurredAt: string | null;
  category: "TREATMENT" | "REFERRAL" | "OTHER";
  code: string;
  description: string;
  patientName?: string;
  name: string;
  payroll: { status: PayrollIncomeStatus; period: string | null };
  role: string;
};
type StaffIncomeGroup = {
  id: string;
  staffId: string;
  branchId: string | null;
  branchName: string;
  code: string;
  name: string;
  role: string;
  amount: number;
  componentCount: number;
  payrollStatus: PayrollIncomeStatus;
  rows: StaffIncomeViewRow[];
};

const PAGE_SIZE = 1000;
const QUERY_BATCH_SIZE = 100;
const realtimeTables = ["compensation_accruals", "monthly_payrolls", "payroll_items", "overtime_records", "staff_replacement_assignments"];

function getJakartaMonthBounds(month: string): { start: string; end: string } | null {
  const [year, monthNumber] = month.split("-").map(Number);
  if (!year || !monthNumber || monthNumber < 1 || monthNumber > 12) return null;
  const jakartaOffsetMilliseconds = 7 * 60 * 60 * 1000;
  return {
    start: new Date(Date.UTC(year, monthNumber - 1, 1) - jakartaOffsetMilliseconds).toISOString(),
    end: new Date(Date.UTC(year, monthNumber, 1) - jakartaOffsetMilliseconds).toISOString()
  };
}

function getJakartaDayBounds(day: string): { start: string; end: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const [year, monthNumber, dayNumber] = day.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1, dayNumber));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== monthNumber - 1 || date.getUTCDate() !== dayNumber) return null;
  const jakartaOffsetMilliseconds = 7 * 60 * 60 * 1000;
  return {
    start: new Date(Date.UTC(year, monthNumber - 1, dayNumber) - jakartaOffsetMilliseconds).toISOString(),
    end: new Date(Date.UTC(year, monthNumber - 1, dayNumber + 1) - jakartaOffsetMilliseconds).toISOString()
  };
}

function chunkValues<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function getSourceDateUnavailable(description: string): boolean {
  return /lembur|pengganti/i.test(description);
}

function formatCurrency(amount: number): string {
  return `Rp ${amount.toLocaleString("id-ID")}`;
}

function getIncomeStatusSummary(statuses: PayrollIncomeStatus[]): PayrollIncomeStatus {
  const distinctStatuses = new Set(statuses);
  return distinctStatuses.size === 1 ? statuses[0] : "MIXED";
}

function getRoleLabel(role: string): string {
  const labels: Record<string, string> = {
    DOCTOR: "Dokter",
    ASSISTANT: "Asisten",
    BRANCH_ADMIN: "Admin Cabang",
    SUPER_ADMIN: "Super Admin",
    ADMIN: "Admin",
    HR: "SDM"
  };
  return labels[role] || role.replaceAll("_", " ");
}

function getIncomeCategory(ruleType?: string): "TREATMENT" | "REFERRAL" | "OTHER" {
  if (ruleType === "STAFF_VISIT_REFERRAL" || ruleType?.includes("REFERRAL")) return "REFERRAL";
  if (ruleType === "PERCENTAGE" || ruleType === "FIXED_PER_TREATMENT") return "TREATMENT";
  return "OTHER";
}

function getIncomeCategoryLabel(category: "TREATMENT" | "REFERRAL" | "OTHER"): string {
  if (category === "TREATMENT") return "Jasa tindakan";
  if (category === "REFERRAL") return "Insentif referral";
  return "Insentif lainnya";
}

function getPayrollStatusLabel(status: PayrollIncomeStatus): string {
  if (status === "NOT_IN_PAYROLL") return "Belum masuk payroll";
  if (status === "UNKNOWN_PAYROLL") return "Payroll tidak ditemukan";
  if (status === "MIXED") return "Status campuran";
  if (status === PayrollStatus.DRAFT) return "Draft";
  if (status === PayrollStatus.REVIEW) return "Menunggu review";
  if (status === PayrollStatus.APPROVED) return "Disetujui";
  return "Dibayar";
}

function getPayrollStatusClass(status: PayrollIncomeStatus): string {
  if (status === PayrollStatus.PAID) return "bg-emerald-100 text-emerald-800";
  if (status === PayrollStatus.APPROVED) return "bg-blue-100 text-blue-800";
  if (status === PayrollStatus.REVIEW) return "bg-amber-100 text-amber-800";
  if (status === PayrollStatus.DRAFT) return "bg-slate-100 text-slate-700";
  if (status === "UNKNOWN_PAYROLL") return "bg-rose-100 text-rose-800";
  if (status === "MIXED") return "bg-violet-100 text-violet-800";
  return "bg-orange-100 text-orange-800";
}

function getPayrollStatusRank(status: PayrollStatus): number {
  if (status === PayrollStatus.PAID) return 4;
  if (status === PayrollStatus.APPROVED) return 3;
  if (status === PayrollStatus.REVIEW) return 2;
  return 1;
}

export const StaffIncome: React.FC = () => {
  const { staff, doctors, branches } = useApp();
  const [periodMode, setPeriodMode] = useState<"DAILY" | "MONTHLY">("DAILY");
  const [selectedDate, setSelectedDate] = useState(() => getOperationalDateString(new Date().toISOString()));
  const [selectedMonth, setSelectedMonth] = useState(() => getOperationalDateString(new Date().toISOString()).slice(0, 7));
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [includeStaffWithoutIncome, setIncludeStaffWithoutIncome] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<"ALL" | "TREATMENT" | "REFERRAL" | "OTHER">("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | PayrollIncomeStatus>("ALL");
  const [expandedStaffIds, setExpandedStaffIds] = useState<Set<string>>(new Set());
  const [accruals, setAccruals] = useState<CompensationAccrual[]>([]);
  const [payrollOnlyIncome, setPayrollOnlyIncome] = useState<PayrollOnlyIncome[]>([]);
  const [undatedPayrollIncomeCount, setUndatedPayrollIncomeCount] = useState(0);
  const [staffDirectoryPayrollStatuses, setStaffDirectoryPayrollStatuses] = useState<Map<string, {
    status: PayrollIncomeStatus;
    period: string | null;
  }>>(new Map());
  const [payrollStatusByAccrual, setPayrollStatusByAccrual] = useState<Map<string, {
    status: PayrollIncomeStatus;
    period: string | null;
  }>>(new Map());
  const [treatmentNameById, setTreatmentNameById] = useState<Map<string, string>>(new Map());
  const [patientNameBySourceId, setPatientNameBySourceId] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const requestId = useRef(0);

  const loadData = useCallback(async () => {
    const request = ++requestId.current;
    setLoading(true);
    setErrorMessage(null);

    try {
      if (!isSupabaseConfigured) {
        throw new Error("Laporan pendapatan staf memerlukan koneksi Supabase yang aktif.");
      }

      const monthBounds = periodMode === "MONTHLY" ? getJakartaMonthBounds(selectedMonth) : null;
      const dayBounds = periodMode === "DAILY" ? getJakartaDayBounds(selectedDate) : null;
      if ((periodMode === "MONTHLY" && selectedMonth && !monthBounds) ||
        (periodMode === "DAILY" && !dayBounds)) throw new Error("Periode laporan tidak valid.");
      const filterBounds = periodMode === "DAILY" ? dayBounds : monthBounds;

      const loadedAccrualRows: Record<string, unknown>[] = [];
      for (let offset = 0; ; offset += PAGE_SIZE) {
        let query = supabase
          .from("compensation_accruals")
          .select("id,staff_id,branch_id,rule_id_snapshot,rule_type_snapshot,value_snapshot,base_amount_snapshot,amount,source_id,accrued_at")
          .order("accrued_at", { ascending: false })
          .range(offset, offset + PAGE_SIZE - 1);
        if (filterBounds) query = query.gte("accrued_at", filterBounds.start).lt("accrued_at", filterBounds.end);
        if (selectedBranchId) query = query.eq("branch_id", selectedBranchId);

        const { data, error } = await query;
        if (error) throw new Error(`Gagal memuat akrual pendapatan staf: ${error.message}`);
        const page = (data || []) as Record<string, unknown>[];
        loadedAccrualRows.push(...page);
        if (page.length < PAGE_SIZE) break;
      }

      const loadedAccruals: CompensationAccrual[] = loadedAccrualRows
        .filter((row) => row.rule_type_snapshot !== "BASE_SALARY" && row.rule_type_snapshot !== "TAX_PERCENTAGE")
        .map((row) => ({
          id: String(row.id),
          staffId: String(row.staff_id),
          branchId: typeof row.branch_id === "string" ? row.branch_id : null,
          ruleIdSnapshot: typeof row.rule_id_snapshot === "string" ? row.rule_id_snapshot : undefined,
          ruleTypeSnapshot: typeof row.rule_type_snapshot === "string" ? row.rule_type_snapshot : undefined,
          valueSnapshot: row.value_snapshot == null ? undefined : Number(row.value_snapshot),
          baseAmountSnapshot: row.base_amount_snapshot == null ? undefined : Number(row.base_amount_snapshot),
          amount: Number(row.amount) || 0,
          sourceId: String(row.source_id || ""),
          accruedAt: String(row.accrued_at)
        }));

      const accrualIds = loadedAccruals.map((accrual) => accrual.id);
      const accrualPayrollItems: PayrollItemRow[] = [];
      for (const ids of chunkValues(accrualIds, QUERY_BATCH_SIZE)) {
        const { data, error } = await supabase
          .from("payroll_items")
          .select("id,payroll_id,source_id,type,amount_snapshot,description_snapshot")
          .eq("type", "EARNING")
          .in("source_id", ids);
        if (error) throw new Error(`Gagal membaca relasi akrual ke payroll: ${error.message}`);
        accrualPayrollItems.push(...((data || []) as PayrollItemRow[]));
      }

      const linkedPayrollIds = Array.from(new Set(accrualPayrollItems.map((item) => item.payroll_id)));
      const linkedPayrollRows: PayrollRow[] = [];
      for (const ids of chunkValues(linkedPayrollIds, QUERY_BATCH_SIZE)) {
        const { data, error } = await supabase
          .from("monthly_payrolls")
          .select("id,month,year,status")
          .in("id", ids);
        if (error) throw new Error(`Gagal membaca status payroll pendapatan staf: ${error.message}`);
        linkedPayrollRows.push(...((data || []) as PayrollRow[]));
      }

      const payrollById = new Map(linkedPayrollRows.map((payroll) => [payroll.id, payroll]));
      const statusMap = new Map<string, { status: PayrollIncomeStatus; period: string | null }>();
      for (const item of accrualPayrollItems) {
        const payroll = payrollById.get(item.payroll_id);
        if (!payroll) {
          if (item.source_id) statusMap.set(item.source_id, { status: "UNKNOWN_PAYROLL", period: null });
          continue;
        }
        const period = `${payroll.year}-${String(payroll.month).padStart(2, "0")}`;
        if (!item.source_id) continue;
        const existing = statusMap.get(item.source_id);
        if (!existing || existing.status === "UNKNOWN_PAYROLL" ||
          (existing.status !== "NOT_IN_PAYROLL" && getPayrollStatusRank(payroll.status) > getPayrollStatusRank(existing.status as PayrollStatus))) {
          statusMap.set(item.source_id, { status: payroll.status, period });
        }
      }
      for (const accrual of loadedAccruals) {
        if (!statusMap.has(accrual.id)) statusMap.set(accrual.id, { status: "NOT_IN_PAYROLL", period: null });
      }

      const reportPeriod = periodMode === "DAILY" ? selectedDate.slice(0, 7) : selectedMonth;
      const [reportYear, reportMonth] = reportPeriod.split("-").map(Number);
      const reportPayrollRows: PayrollRow[] = [];
      for (let offset = 0; ; offset += PAGE_SIZE) {
        let query = supabase
          .from("monthly_payrolls")
          .select("id,month,year,status,staff_id,branch_id")
          .order("year", { ascending: false })
          .order("month", { ascending: false })
          .range(offset, offset + PAGE_SIZE - 1);
        if (reportPeriod) query = query.eq("year", reportYear).eq("month", reportMonth);
        if (selectedBranchId) query = query.eq("branch_id", selectedBranchId);
        const { data, error } = await query;
        if (error) throw new Error(`Gagal memuat payroll untuk rincian pendapatan: ${error.message}`);
        const page = (data || []) as PayrollRow[];
        reportPayrollRows.push(...page);
        if (page.length < PAGE_SIZE) break;
      }

      const reportPayrollById = new Map(reportPayrollRows.map((payroll) => [payroll.id, payroll]));
      const reportPayrollItems: PayrollItemRow[] = [];
      for (const ids of chunkValues(reportPayrollRows.map((payroll) => payroll.id), QUERY_BATCH_SIZE)) {
        const { data, error } = await supabase
          .from("payroll_items")
          .select("id,payroll_id,source_id,type,amount_snapshot,description_snapshot")
          .eq("type", "EARNING")
          .in("payroll_id", ids);
        if (error) throw new Error(`Gagal memuat komponen penghasilan payroll: ${error.message}`);
        reportPayrollItems.push(...((data || []) as PayrollItemRow[]));
      }

      const payrollSourceIds = Array.from(new Set(reportPayrollItems
        .map((item) => item.source_id)
        .filter((sourceId): sourceId is string => typeof sourceId === "string" &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sourceId))));
      const linkedAccrualIds = new Set<string>();
      for (const ids of chunkValues(payrollSourceIds, QUERY_BATCH_SIZE)) {
        const { data, error } = await supabase
          .from("compensation_accruals")
          .select("id")
          .in("id", ids);
        if (error) throw new Error(`Gagal mencegah duplikasi akrual dan payroll: ${error.message}`);
        for (const row of data || []) linkedAccrualIds.add(row.id);
      }

      const periodPayrollItems = reportPayrollItems
        .filter((item) => {
          if (Number(item.amount_snapshot) <= 0) return false;
          if (item.description_snapshot.trim().toLocaleLowerCase("id-ID").includes("gaji pokok")) return false;
          if (item.id.endsWith("-base")) return false;
          return !item.source_id || !linkedAccrualIds.has(item.source_id);
        })
        .map((item) => {
          const payroll = reportPayrollById.get(item.payroll_id);
          if (!payroll?.staff_id) {
            throw new Error(`Data staf payroll tidak ditemukan untuk komponen ${item.id}.`);
          }
          return { item, payroll };
        });

      const payrollOnlySourceIds = Array.from(new Set(periodPayrollItems
        .filter(({ item }) => item.source_id && getSourceDateUnavailable(item.description_snapshot))
        .map(({ item }) => item.source_id as string)));
      const sourceDateByPayrollItem = new Map<string, string>();
      for (const ids of chunkValues(payrollOnlySourceIds, QUERY_BATCH_SIZE)) {
        const [overtimeResult, replacementResult] = await Promise.all([
          supabase.from("overtime_records").select("id,date").in("id", ids),
          supabase.from("staff_replacement_assignments").select("id,covered_date").in("id", ids)
        ]);
        if (overtimeResult.error) throw new Error(`Gagal membaca tanggal lembur: ${overtimeResult.error.message}`);
        if (replacementResult.error) throw new Error(`Gagal membaca tanggal upah pengganti: ${replacementResult.error.message}`);
        for (const row of overtimeResult.data || []) sourceDateByPayrollItem.set(row.id, String(row.date));
        for (const row of replacementResult.data || []) sourceDateByPayrollItem.set(row.id, String(row.covered_date));
      }

      const undatedIncomeCount = periodPayrollItems.filter(({ item }) =>
        !item.source_id || !sourceDateByPayrollItem.has(item.source_id)
      ).length;
      const payrollOnlyRows: PayrollOnlyIncome[] = periodPayrollItems
        .map(({ item, payroll }) => {
          const occurredAt = item.source_id && sourceDateByPayrollItem.has(item.source_id)
            ? sourceDateByPayrollItem.get(item.source_id) || null
            : null;
          if (periodMode === "DAILY" && (!occurredAt || occurredAt !== selectedDate)) return null;
          return {
            id: item.id,
            staffId: payroll.staff_id,
            branchId: payroll.branch_id || null,
            sourceId: item.source_id,
            amount: Number(item.amount_snapshot),
            description: item.description_snapshot,
            period: `${payroll.year}-${String(payroll.month).padStart(2, "0")}`,
            occurredAt,
            sourceDateUnavailable: !occurredAt,
            status: payroll.status
          };
        })
        .filter((income): income is PayrollOnlyIncome => income !== null);

      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      const sourceTreatmentIds = new Set<string>();
      const legacyReferralVisitIds = new Set<string>();
      for (const accrual of loadedAccruals) {
        const referralSource = accrual.sourceId.match(/^referral:visit:([^:]+)(?::treatment:([^:]+))?$/);
        if (referralSource?.[2] && uuidPattern.test(referralSource[2])) {
          sourceTreatmentIds.add(referralSource[2]);
        } else if (referralSource?.[1] && uuidPattern.test(referralSource[1])) {
          legacyReferralVisitIds.add(referralSource[1]);
        } else if (uuidPattern.test(accrual.sourceId)) {
          sourceTreatmentIds.add(accrual.sourceId);
        }
      }
      const treatmentNames = new Map<string, string>();
      const treatmentRows = new Map<string, { visitId: string; patientId: string }>();
      const treatmentsByVisit = new Map<string, { patientId: string }[]>();
      const treatmentQueries = [
        ...chunkValues([...sourceTreatmentIds], QUERY_BATCH_SIZE).map((ids) =>
          supabase.from("treatment_jobs").select("id,visit_id,patient_id,service_name_snapshot").in("id", ids)
        ),
        ...chunkValues([...legacyReferralVisitIds], QUERY_BATCH_SIZE).map((ids) =>
          supabase.from("treatment_jobs").select("id,visit_id,patient_id,service_name_snapshot").in("visit_id", ids)
        )
      ];
      const treatmentResults = await Promise.all(treatmentQueries);
      for (const { data, error } of treatmentResults) {
        if (error) throw new Error(`Gagal membaca detail tindakan dan pasien untuk pendapatan: ${error.message}`);
        for (const row of data || []) {
          if (typeof row.id === "string" && typeof row.visit_id === "string" && typeof row.patient_id === "string") {
            treatmentRows.set(row.id, { visitId: row.visit_id, patientId: row.patient_id });
            treatmentsByVisit.set(row.visit_id, [
              ...(treatmentsByVisit.get(row.visit_id) || []),
              { patientId: row.patient_id }
            ]);
          }
          if (typeof row.service_name_snapshot === "string") {
            treatmentNames.set(row.id, row.service_name_snapshot);
          }
        }
      }
      const patientIds = Array.from(new Set([...treatmentRows.values()].map((treatment) => treatment.patientId)));
      const patientNames = new Map<string, string>();
      for (const ids of chunkValues(patientIds, QUERY_BATCH_SIZE)) {
        const { data, error } = await supabase
          .from("patient_profiles")
          .select("id,name,full_name")
          .in("id", ids);
        if (error) throw new Error(`Gagal membaca nama pasien untuk pendapatan staf: ${error.message}`);
        for (const patient of data || []) {
          const name = typeof patient.full_name === "string" && patient.full_name.trim()
            ? patient.full_name
            : patient.name;
          if (typeof patient.id === "string" && typeof name === "string") patientNames.set(patient.id, name);
        }
      }
      const patientNamesBySource = new Map<string, string>();
      for (const accrual of loadedAccruals) {
        const referralSource = accrual.sourceId.match(/^referral:visit:([^:]+)(?::treatment:([^:]+))?$/);
        const patientId = referralSource
          ? referralSource[2]
            ? treatmentRows.get(referralSource[2])?.patientId
            : treatmentsByVisit.get(referralSource[1])?.[0]?.patientId
          : treatmentRows.get(accrual.sourceId)?.patientId;
        const patientName = patientId ? patientNames.get(patientId) : undefined;
        if (patientName) patientNamesBySource.set(accrual.sourceId, patientName);
      }

      if (request !== requestId.current) return;
      setAccruals(loadedAccruals);
      setPayrollOnlyIncome(payrollOnlyRows);
      setUndatedPayrollIncomeCount(periodMode === "DAILY" ? undatedIncomeCount : 0);
      setPayrollStatusByAccrual(statusMap);
      setTreatmentNameById(treatmentNames);
      setPatientNameBySourceId(patientNamesBySource);
      const directoryPayrollStatuses = new Map<string, { status: PayrollIncomeStatus; period: string | null }>();
      for (const payroll of reportPayrollRows) {
        if (payroll.staff_id && !directoryPayrollStatuses.has(payroll.staff_id)) {
          directoryPayrollStatuses.set(payroll.staff_id, {
            status: payroll.status,
            period: `${payroll.year}-${String(payroll.month).padStart(2, "0")}`
          });
        }
      }
      setStaffDirectoryPayrollStatuses(directoryPayrollStatuses);
    } catch (loadError: unknown) {
      if (request !== requestId.current) return;
      setErrorMessage(loadError instanceof Error ? loadError.message : "Gagal memuat pendapatan staf.");
    } finally {
      if (request === requestId.current) setLoading(false);
    }
  }, [periodMode, selectedBranchId, selectedDate, selectedMonth]);

  useEffect(() => {
    void loadData();
    return () => {
      requestId.current += 1;
    };
  }, [loadData]);

  const realtimeStatus = useRealtimeSync({
    branchId: null,
    tables: realtimeTables,
    onAnyChange: () => {
      void loadData();
    }
  });

  const branchNames = useMemo(() => new Map(branches.map((branch) => [branch.id, branch.name])), [branches]);
  const staffIncomeRows = useMemo<StaffIncomeViewRow[]>(() => {
    const query = searchQuery.trim().toLocaleLowerCase("id-ID");
    const incomeRows: StaffIncomeViewRow[] = [
      ...accruals.map((accrual) => ({
        id: accrual.id,
        staffId: accrual.staffId,
        branchId: accrual.branchId || null,
        amount: accrual.amount,
        occurredAt: accrual.accruedAt,
        category: getIncomeCategory(accrual.ruleTypeSnapshot),
        sourceId: accrual.sourceId,
        ruleType: accrual.ruleTypeSnapshot,
        patientName: patientNameBySourceId.get(accrual.sourceId),
        incomeDescription: undefined,
        sourceDateUnavailable: false,
        payroll: payrollStatusByAccrual.get(accrual.id) || { status: "NOT_IN_PAYROLL" as const, period: null }
      })),
      ...payrollOnlyIncome.map((income) => ({
        id: `payroll-${income.id}`,
        staffId: income.staffId,
        branchId: income.branchId,
        amount: income.amount,
        occurredAt: income.occurredAt,
        category: "OTHER" as const,
        sourceId: income.sourceId || "",
        ruleType: undefined,
        incomeDescription: income.description,
        sourceDateUnavailable: income.sourceDateUnavailable,
        payroll: { status: income.status, period: income.period }
      }))
    ].map((line) => {
      const staffRecord = staff.find((item) =>
        item.id === line.staffId || item.userAccountId === line.staffId
      );
      const doctor = doctors.find((item) =>
        item.id === line.staffId || item.staffId === line.staffId
      );
      const name = staffRecord?.fullName || doctor?.name || "Staf tidak ditemukan";
      const code = staffRecord?.employeeCode || doctor?.doctorCode || "";
      const role = getRoleLabel(doctor ? "DOCTOR" : String(staffRecord?.position || "Tidak diketahui"));
      const branchId = line.branchId || staffRecord?.branchId || doctor?.assignedBranchId || null;
      const branchName = branchId ? branchNames.get(branchId) || "Cabang tidak ditemukan" : "Tidak tercatat";
      const description = line.category === "TREATMENT"
        ? treatmentNameById.get(line.sourceId) || "Jasa tindakan"
        : line.category === "REFERRAL"
          ? "Insentif referral kunjungan"
          : line.incomeDescription || line.ruleType || "Insentif lainnya";
      return { ...line, branchId, branchName, code, description, name, role };
    });

    return incomeRows.filter((row) =>
      (!categoryFilter || categoryFilter === "ALL" || row.category === categoryFilter) &&
      (statusFilter === "ALL" || row.payroll.status === statusFilter) &&
      (roleFilter === "ALL" || row.role === roleFilter) &&
      (!selectedBranchId || row.branchId === selectedBranchId) &&
      (!query || [
        row.name,
        row.code,
        row.role,
        row.branchName,
        row.description,
        row.patientName || "",
        getIncomeCategoryLabel(row.category)
      ].some((value) => value.toLocaleLowerCase("id-ID").includes(query)))
    ).sort((first, second) => (second.occurredAt || "").localeCompare(first.occurredAt || ""));
  }, [accruals, branchNames, categoryFilter, doctors, payrollOnlyIncome, payrollStatusByAccrual, patientNameBySourceId, roleFilter, searchQuery, selectedBranchId, staff, statusFilter, treatmentNameById]);

  const staffIncomeGroups = useMemo<StaffIncomeGroup[]>(() => {
    const groups = new Map<string, StaffIncomeGroup>();
    for (const row of staffIncomeRows) {
      const id = `${row.staffId}:${row.branchId || ""}`;
      const existing = groups.get(id);
      if (existing) {
        existing.amount += row.amount;
        existing.componentCount += 1;
        existing.rows.push(row);
        existing.payrollStatus = getIncomeStatusSummary(existing.rows.map((income) => income.payroll.status));
      } else {
        groups.set(id, {
          id,
          staffId: row.staffId,
          branchId: row.branchId,
          branchName: row.branchName,
          code: row.code,
          name: row.name,
          role: row.role,
          amount: row.amount,
          componentCount: 1,
          payrollStatus: row.payroll.status,
          rows: [row]
        });
      }
    }

    if (includeStaffWithoutIncome && categoryFilter === "ALL" && statusFilter === "ALL") {
      const directory = new Map<string, { name: string; code: string; role: string; branchId: string | null }>();
      for (const staffRecord of staff) {
        directory.set(staffRecord.id, {
          name: staffRecord.fullName,
          code: staffRecord.employeeCode,
          role: getRoleLabel(String(staffRecord.position)),
          branchId: staffRecord.branchId || null
        });
      }
      for (const doctor of doctors) {
        const staffId = doctor.staffId || doctor.id;
        const existing = directory.get(staffId);
        directory.set(staffId, {
          name: doctor.name || existing?.name || "Dokter",
          code: doctor.doctorCode || existing?.code || "",
          role: getRoleLabel("DOCTOR"),
          branchId: doctor.assignedBranchId || existing?.branchId || null
        });
      }
      const query = searchQuery.trim().toLocaleLowerCase("id-ID");
      const staffIdsWithIncome = new Set([...groups.values()].map((group) => group.staffId));
      for (const [staffId, person] of directory) {
        const id = `${staffId}:${person.branchId || ""}`;
        if (staffIdsWithIncome.has(staffId)) continue;
        const branchName = person.branchId ? branchNames.get(person.branchId) || "Cabang tidak ditemukan" : "Tidak tercatat";
        const payroll = staffDirectoryPayrollStatuses.get(staffId) || {
          status: "NOT_IN_PAYROLL" as const,
          period: null
        };
        if (roleFilter !== "ALL" && person.role !== roleFilter) continue;
        if (selectedBranchId && person.branchId !== selectedBranchId) continue;
        if (statusFilter !== "ALL" && payroll.status !== statusFilter) continue;
        if (query && ![person.name, person.code, person.role, branchName]
          .some((value) => value.toLocaleLowerCase("id-ID").includes(query))) continue;
        groups.set(id, {
          id,
          staffId,
          branchId: person.branchId,
          branchName,
          code: person.code,
          name: person.name,
          role: person.role,
          amount: 0,
          componentCount: 0,
          payrollStatus: payroll.status,
          rows: []
        });
      }
    }

    return [...groups.values()].sort((first, second) =>
      second.amount - first.amount || first.name.localeCompare(second.name, "id-ID")
    );
  }, [branchNames, categoryFilter, doctors, includeStaffWithoutIncome, roleFilter, searchQuery, selectedBranchId, staff, staffDirectoryPayrollStatuses, staffIncomeRows, statusFilter]);

  const totalAmount = staffIncomeGroups.reduce((total, row) => total + row.amount, 0);
  const unpaidPayrollAmount = staffIncomeGroups.flatMap((group) => group.rows)
    .filter((row) => row.payroll.status !== PayrollStatus.PAID)
    .reduce((total, row) => total + row.amount, 0);
  const staffCount = staffIncomeGroups.length;
  const componentCount = staffIncomeGroups.reduce((total, group) => total + group.componentCount, 0);
  const roleOptions = useMemo(() => Array.from(new Set([
    ...staff.map((item) => getRoleLabel(String(item.position))),
    ...(doctors.length > 0 ? [getRoleLabel("DOCTOR")] : [])
  ])).sort((first, second) => first.localeCompare(second, "id-ID")), [doctors.length, staff]);

  return (
    <main className="space-y-5 pb-10" id="staff-income-page">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-700">Manajemen SDM</p>
          <h1 className="mt-1 text-xl font-bold text-slate-900">Pendapatan Staf</h1>
          <p className="mt-1 text-xs text-slate-500">Ringkasan pendapatan harian seluruh staf dengan rincian per komponen dan status payroll.</p>
        </div>
        <div className={`inline-flex items-center gap-2 self-start rounded-full border px-3 py-1.5 text-[10px] font-semibold ${
          realtimeStatus.isConnected
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : "border-amber-200 bg-amber-50 text-amber-800"
        }`}>
          <span className={`h-2 w-2 rounded-full ${realtimeStatus.isConnected ? "bg-emerald-500" : "animate-pulse bg-amber-500"}`} />
          {realtimeStatus.isConnected ? "Realtime aktif" : "Realtime menyambungkan"}
        </div>
      </header>

      {errorMessage && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}
      {!loading && periodMode === "DAILY" && undatedPayrollIncomeCount > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {undatedPayrollIncomeCount} komponen payroll tidak dimasukkan ke total harian karena tanggal sumbernya tidak tersedia.
            Buka tampilan bulanan untuk melihat komponen tersebut.
          </span>
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-3">
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500"><DollarSign className="h-4 w-4 text-emerald-600" />Total pendapatan non-gaji pokok</div>
          <strong className="mt-2 block text-lg text-emerald-800">Rp {totalAmount.toLocaleString("id-ID")}</strong>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500"><Clock3 className="h-4 w-4 text-amber-600" />Belum dibayar via payroll</div>
          <strong className="mt-2 block text-lg text-amber-800">Rp {unpaidPayrollAmount.toLocaleString("id-ID")}</strong>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500"><Users className="h-4 w-4 text-blue-600" />Staf penerima</div>
          <strong className="mt-2 block text-lg text-slate-900">{staffCount} staf · {componentCount} komponen</strong>
        </article>
      </section>

      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <label className="relative block">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Cari nama, kode staf, layanan..."
              className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </label>
          <select
            aria-label="Filter jabatan staf"
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
          >
            <option value="ALL">Semua jabatan</option>
            {roleOptions.map((role) => <option key={role} value={role}>{role}</option>)}
          </select>
          <select
            aria-label="Filter cabang pendapatan"
            value={selectedBranchId}
            onChange={(event) => setSelectedBranchId(event.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
          >
            <option value="">Semua cabang</option>
            {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </select>
          <div className="flex min-w-0 rounded-lg border border-slate-200 p-0.5">
            <button
              type="button"
              onClick={() => setPeriodMode("DAILY")}
              className={`flex-1 rounded-md px-2 py-1.5 text-[10px] font-semibold ${periodMode === "DAILY" ? "bg-emerald-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}
            >
              Harian
            </button>
            <button
              type="button"
              onClick={() => setPeriodMode("MONTHLY")}
              className={`flex-1 rounded-md px-2 py-1.5 text-[10px] font-semibold ${periodMode === "MONTHLY" ? "bg-emerald-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}
            >
              Bulanan
            </button>
          </div>
          {periodMode === "DAILY" ? (
            <input
              aria-label="Tanggal laporan pendapatan"
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
            />
          ) : (
            <input
              aria-label="Bulan laporan pendapatan"
              type="month"
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(event.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
            />
          )}
          <div className="flex gap-2">
            <select
              aria-label="Filter jenis pendapatan"
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value as typeof categoryFilter)}
              className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
            >
              <option value="ALL">Semua jenis</option>
              <option value="TREATMENT">Jasa tindakan</option>
              <option value="REFERRAL">Referral</option>
              <option value="OTHER">Insentif lainnya</option>
            </select>
            <select
              aria-label="Filter status payroll"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
              className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
            >
              <option value="ALL">Semua status</option>
              <option value="NOT_IN_PAYROLL">Belum masuk payroll</option>
              <option value={PayrollStatus.DRAFT}>Draft</option>
              <option value={PayrollStatus.REVIEW}>Menunggu review</option>
              <option value={PayrollStatus.APPROVED}>Disetujui</option>
              <option value={PayrollStatus.PAID}>Dibayar</option>
              <option value="UNKNOWN_PAYROLL">Payroll tidak ditemukan</option>
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-slate-100 pt-3 text-[10px] text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span>{periodMode === "DAILY" ? `Tanggal ${selectedDate}` : `Bulan ${selectedMonth}`} · Data diperbarui otomatis saat ada perubahan.</span>
            <label className="inline-flex items-center gap-1.5 font-medium text-slate-600">
              <input
                type="checkbox"
                checked={includeStaffWithoutIncome}
                onChange={(event) => setIncludeStaffWithoutIncome(event.target.checked)}
                className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              Tampilkan staf tanpa pendapatan
            </label>
          </div>
          <button
            type="button"
            onClick={() => void loadData()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Segarkan
          </button>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-800"><Activity className="h-4 w-4 text-emerald-600" />Ringkasan pendapatan per staf</div>
          <span className="text-[10px] text-slate-500">{staffIncomeGroups.length} staf · {componentCount} komponen</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                <th className="w-8 px-3 py-3"></th>
                <th className="px-4 py-3">Staf / Jabatan</th>
                <th className="px-4 py-3">Cabang</th>
                <th className="px-4 py-3">Komponen</th>
                <th className="px-4 py-3">Status payroll</th>
                <th className="px-4 py-3 text-right">Nominal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
              {loading ? (
                <tr><td colSpan={6} className="py-12 text-center text-slate-500"><RefreshCw className="mx-auto mb-2 h-5 w-5 animate-spin" />Memuat data pendapatan...</td></tr>
              ) : staffIncomeGroups.length === 0 ? (
                <tr><td colSpan={6} className="py-12 text-center text-slate-500">Tidak ada pendapatan yang cocok dengan filter.</td></tr>
              ) : staffIncomeGroups.map((group) => {
                const isExpanded = expandedStaffIds.has(group.id);
                return (
                  <Fragment key={group.id}>
                    <tr className="bg-white hover:bg-slate-50/70">
                      <td className="px-3 py-3">
                        {group.componentCount > 0 && (
                          <button
                            type="button"
                            aria-label={`${isExpanded ? "Tutup" : "Lihat"} rincian ${group.name}`}
                            aria-expanded={isExpanded}
                            onClick={() => setExpandedStaffIds((current) => {
                              const next = new Set(current);
                              if (next.has(group.id)) next.delete(group.id);
                              else next.add(group.id);
                              return next;
                            })}
                            className="rounded p-1 text-slate-500 hover:bg-slate-200"
                          >
                            <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-slate-900">{group.name}</div>
                        <div className="mt-0.5 text-[10px] text-slate-500">{group.code || "Tanpa kode"} · {group.role}</div>
                      </td>
                      <td className="px-4 py-3.5">{group.branchName}</td>
                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-slate-800">{group.componentCount} komponen</div>
                        {group.componentCount === 0 && <div className="mt-0.5 text-[10px] text-slate-500">Tidak ada pendapatan pada periode ini</div>}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold ${getPayrollStatusClass(group.payrollStatus)}`}>
                          {group.payrollStatus === PayrollStatus.PAID
                            ? <CheckCircle2 className="h-3 w-3" />
                            : group.payrollStatus === "NOT_IN_PAYROLL"
                              ? <Clock3 className="h-3 w-3" />
                              : <DollarSign className="h-3 w-3" />}
                          {getPayrollStatusLabel(group.payrollStatus)}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-right font-bold text-emerald-800">
                        {formatCurrency(group.amount)}
                      </td>
                    </tr>
                    {isExpanded && group.rows.map((row) => (
                      <tr key={row.id} className="bg-slate-50/70 text-[11px]">
                        <td className="px-3 py-2"></td>
                        <td className="px-4 py-2 pl-8">
                          <div className="font-semibold text-slate-800">
                            {row.occurredAt
                              ? new Intl.DateTimeFormat("id-ID", {
                                  timeZone: "Asia/Jakarta",
                                  day: "numeric",
                                  month: "short",
                                  year: "numeric"
                                }).format(new Date(row.occurredAt))
                              : "Tanggal sumber tidak tersedia"}
                          </div>
                          <div className="mt-0.5 text-slate-500">{getIncomeCategoryLabel(row.category)} · {row.description}</div>
                          {row.patientName && (
                            <div className="mt-0.5 font-semibold text-slate-700">Pasien: {row.patientName}</div>
                          )}
                        </td>
                        <td className="px-4 py-2 text-slate-500">{row.branchName}</td>
                        <td className="px-4 py-2 text-slate-500">{row.payroll.period ? `Payroll ${row.payroll.period}` : "Belum terkait payroll"}</td>
                        <td className="px-4 py-2">
                          <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-semibold ${getPayrollStatusClass(row.payroll.status)}`}>
                            {getPayrollStatusLabel(row.payroll.status)}
                          </span>
                          {row.sourceDateUnavailable && <div className="mt-1 text-[9px] text-amber-700">Tanggal sumber belum tersedia</div>}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2 text-right font-semibold text-slate-700">{formatCurrency(row.amount)}</td>
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
};
