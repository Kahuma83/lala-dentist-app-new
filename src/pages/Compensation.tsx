import React, { useState, useEffect, useMemo } from "react";
import { useApp } from "../context/AppContext";
import { useRouter } from "../components/Router";
import {
  StaffCompensationRule,
  CompensationAccrual,
  UserRole,
  JournalEntry,
  JournalSourceType,
  StaffPosition,
  Staff,
  DentalDoctor,
  MasterService,
  DentalBranch,
  DoctorBranchAssignment,
  TreatmentJobStatus
} from "../types/domain";
import {
  Award,
  Plus,
  Search,
  Filter,
  Percent,
  CheckCircle2,
  DollarSign,
  User,
  Activity,
  Layers,
  Calendar,
  AlertCircle,
  BookOpen,
  ArrowUpRight,
  RefreshCw,
  Tag,
  Stethoscope,
  Briefcase,
  ToggleLeft,
  ToggleRight,
  Trash2
} from "lucide-react";

export const Compensation: React.FC = () => {
  const {
    currentUser,
    compRepo,
    treatmentRepo,
    doctorRepo,
    staffRepo,
    configRepo,
    branchRepo,
    accountingRepo,
    refreshData
  } = useApp();
  const { navigate } = useRouter();

  const [rules, setRules] = useState<StaffCompensationRule[]>([]);
  const [accruals, setAccruals] = useState<CompensationAccrual[]>([]);
  const [doctors, setDoctors] = useState<DentalDoctor[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [services, setServices] = useState<MasterService[]>([]);
  const [branches, setBranches] = useState<DentalBranch[]>([]);
  const [doctorAssignments, setDoctorAssignments] = useState<DoctorBranchAssignment[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [journals, setJournals] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingAccruals, setSyncingAccruals] = useState(false);

  const [activeTab, setActiveTab] = useState<"RULES" | "ACCRUALS">("RULES");
  const [showRuleModal, setShowRuleModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [ruleTypeFilter, setRuleTypeFilter] = useState<string>("ALL");

  // Deletion modal state (iframe safe without window.confirm)
  const [ruleToDelete, setRuleToDelete] = useState<StaffCompensationRule | null>(null);
  const [isDeletingRule, setIsDeletingRule] = useState(false);
  const [accrualToDelete, setAccrualToDelete] = useState<CompensationAccrual | null>(null);
  const [isDeletingAccrual, setIsDeletingAccrual] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Rule Modal state
  const [formStaffId, setFormStaffId] = useState("");
  const [formName, setFormName] = useState("");
  const [formType, setFormType] = useState<"PERCENTAGE" | "FIXED_PER_TREATMENT" | "BASE_SALARY" | "TAX_PERCENTAGE">("PERCENTAGE");
  const [formValue, setFormValue] = useState<number>(30);
  const [formServiceId, setFormServiceId] = useState<string>("");
  const [formBranchId, setFormBranchId] = useState("");
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isAssistant = currentUser?.role === UserRole.DOCTOR_ASSISTANT;

  const loadData = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const assistantStaffId = isAssistant ? (currentUser?.staffId || currentUser?.id) : undefined;
      const [rList, aList, dList, sList, srvList, bList, jList, assignmentList] = await Promise.all([
        compRepo.getCompensationRules(),
        compRepo.getCompensationAccruals(assistantStaffId),
        doctorRepo.getDoctors(),
        staffRepo.getStaff(),
        configRepo.getServices(),
        branchRepo.getBranches(),
        accountingRepo.getJournals(
          currentUser?.role === UserRole.BRANCH_ADMIN && currentUser.branchId
            ? { branchId: currentUser.branchId }
            : undefined
        ),
        doctorRepo.getDoctorBranchAssignments()
      ]);

      let filteredAccruals = aList;
      if (isAssistant && assistantStaffId) {
        filteredAccruals = aList.filter(
          (a) => a.staffId === assistantStaffId || a.staffId === currentUser?.id || a.staffId === currentUser?.staffId
        );
      }

      setRules(rList);
      setAccruals(filteredAccruals);
      setDoctors(dList);
      setStaffList(sList);
      setServices(srvList);
      setBranches(bList);
      setDoctorAssignments(assignmentList);
      setJournals(jList);
    } catch (err) {
      console.error("Error loading compensation data:", err);
      setErrorMessage(err instanceof Error ? err.message : "Gagal memuat data kompensasi.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser?.role === UserRole.BRANCH_ADMIN && currentUser.branchId) {
      setSelectedBranchId(currentUser.branchId);
    } else if (!selectedBranchId && branches.length > 0) {
      setSelectedBranchId(branches[0].id);
    } else if (selectedBranchId && branches.length > 0 && !branches.some((branch) => branch.id === selectedBranchId)) {
      setSelectedBranchId(branches[0].id);
    }
  }, [currentUser, branches, selectedBranchId]);

  useEffect(() => {
    if (isAssistant) {
      setActiveTab("ACCRUALS");
    }
    loadData();
  }, [currentUser]);

  const getCompensationJournal = (accrualId: string) => {
    return journals.find(
      (j) => j.sourceType === JournalSourceType.COMPENSATION && j.sourceId === accrualId
    );
  };

  const getBranchName = (branchId?: string | null) => {
    if (!branchId) return "";
    const b = branches.find((branch) => branch.id === branchId);
    return b ? b.name : branchId;
  };

  const getServiceName = (serviceId?: string | null) => {
    if (!serviceId) return "Semua Layanan (Global)";
    const s = services.find((srv) => srv.id === serviceId);
    return s ? s.name : serviceId;
  };

  const getStaffInfo = (staffId: string) => {
    // Check in staff
    const s = staffList.find((st) => st.id === staffId || st.userAccountId === staffId);
    if (s) {
      return {
        name: s.fullName,
        code: s.employeeCode,
        role: s.position,
        branch: getBranchName(s.branchId),
        isDoctor: s.position === StaffPosition.DOCTOR
      };
    }
    // Check in doctors
    const d = doctors.find((doc) => doc.id === staffId || doc.staffId === staffId);
    if (d) {
      return {
        name: d.name,
        code: d.doctorCode || d.id,
        role: "Dokter Gigi",
        branch: getBranchName(d.assignedBranchId),
        isDoctor: true
      };
    }
    // Fallback
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

  // Filtered staff for creation based on current role
  const availableStaff = useMemo(() => {
    const branchId = currentUser?.role === UserRole.BRANCH_ADMIN
      ? currentUser.branchId
      : selectedBranchId;
    const filteredStaff = staffList.filter((staff) => !branchId || staff.branchId === branchId);
    const doctorsAssignedToBranch = new Set(
      doctorAssignments
        .filter((assignment) =>
          (!branchId || assignment.branchId === branchId) &&
          assignment.active
        )
        .map((assignment) => assignment.doctorId)
    );
    const filteredDoctors = doctors.filter((doctor) =>
      !branchId ||
      doctor.assignedBranchId === branchId ||
      doctorsAssignedToBranch.has(doctor.id)
    );

    return {
      branchAdmins: filteredStaff.filter((s) => s.position === StaffPosition.BRANCH_ADMIN),
      assistants: filteredStaff.filter((s) => s.position === StaffPosition.ASSISTANT),
      officeBoys: filteredStaff.filter((s) => s.position === StaffPosition.OB),
      otherStaff: filteredStaff.filter((s) => s.position === StaffPosition.OTHER),
      doctors: filteredDoctors
    };
  }, [staffList, doctors, currentUser, doctorAssignments, selectedBranchId]);

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !formStaffId ||
      !formName ||
      !formBranchId ||
      formValue < 0 ||
      (formType !== "TAX_PERCENTAGE" && formValue === 0) ||
      ((formType === "TAX_PERCENTAGE" || formType === "PERCENTAGE") && formValue > 100)
    ) {
      setFormError("Mohon lengkapi semua field dengan benar");
      return;
    }

    setIsSubmitting(true);
    setFormError("");
    try {
      await compRepo.createCompensationRule({
        staffId: formStaffId,
        name: formName,
        ruleTypeSnapshot: formType,
        valueSnapshot: Number(formValue),
        serviceId: formType === "PERCENTAGE" || formType === "FIXED_PER_TREATMENT" ? formServiceId || null : null,
        branchId: formBranchId,
        isActive: true
      });
      setShowRuleModal(false);
      await loadData();
    } catch (err: any) {
      setFormError(err.message || "Gagal membuat aturan kompensasi");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleRuleStatus = async (rule: StaffCompensationRule) => {
    setErrorMessage(null);
    try {
      await compRepo.updateCompensationRule(rule.id, {
        isActive: !rule.isActive
      });
      await loadData();
      setFeedbackMessage(`Status aturan "${rule.name}" berhasil diubah menjadi ${!rule.isActive ? "Aktif" : "Nonaktif"}.`);
    } catch (err: any) {
      setErrorMessage(err.message || "Gagal mengubah status aturan");
    }
  };

  const handleConfirmDeleteRule = async () => {
    if (!ruleToDelete) return;
    setIsDeletingRule(true);
    setErrorMessage(null);
    try {
      const deleted = await compRepo.deleteCompensationRule(ruleToDelete.id, currentUser?.role);
      if (!deleted) throw new Error("Aturan kompensasi tidak ditemukan atau sudah dihapus.");
      setRules((prev) => prev.filter((r) => r.id !== ruleToDelete.id));
      setFeedbackMessage(`Aturan kompensasi "${ruleToDelete.name}" berhasil dihapus dari database.`);
      setRuleToDelete(null);
      await loadData();
      if (typeof refreshData === "function") await refreshData();
    } catch (err: any) {
      setErrorMessage(err.message || "Gagal menghapus aturan kompensasi");
    } finally {
      setIsDeletingRule(false);
    }
  };

  const handleConfirmDeleteAccrual = async () => {
    if (!accrualToDelete) return;
    setIsDeletingAccrual(true);
    setErrorMessage(null);
    try {
      const deleted = await compRepo.deleteAccrual(accrualToDelete.id, currentUser?.role);
      if (!deleted) throw new Error("Akrual kompensasi tidak ditemukan atau sudah dihapus.");
      setAccruals((prev) => prev.filter((a) => a.id !== accrualToDelete.id));
      setFeedbackMessage("Akrual kompensasi berhasil dihapus.");
      setAccrualToDelete(null);
      await loadData();
    } catch (err: any) {
      setErrorMessage(err.message || "Gagal menghapus akrual kompensasi");
    } finally {
      setIsDeletingAccrual(false);
    }
  };

  const handleSyncCompletedTreatmentAccruals = async () => {
    if (currentUser?.role !== UserRole.SUPER_ADMIN || syncingAccruals) return;
    setSyncingAccruals(true);
    setErrorMessage(null);
    setFeedbackMessage(null);
    try {
      const treatments = await treatmentRepo.listTreatments(currentUser.role, currentUser.branchId, currentUser.doctorId);
      const completedTreatments = treatments.filter((treatment) =>
        treatment.status === TreatmentJobStatus.SELESAI || treatment.status === TreatmentJobStatus.DISERAHKAN
      );
      let createdCount = 0;
      const failures: string[] = [];
      for (const treatment of completedTreatments) {
        try {
          createdCount += (await compRepo.calculateAndAccrueForTreatment(treatment.id)).length;
        } catch (err) {
          failures.push(`${treatment.id}: ${err instanceof Error ? err.message : "kesalahan tidak diketahui"}`);
        }
      }

      await loadData();
      setFeedbackMessage(
        createdCount > 0
          ? `${createdCount} akrual kompensasi berhasil disinkronkan dari tindakan selesai dengan invoice lunas.`
          : `Tidak ada akrual baru dari ${completedTreatments.length} tindakan selesai. Pastikan invoice terkait sudah LUNAS serta aturan kompensasi aktif dan tanggal berlakunya sesuai.`
      );
      if (failures.length > 0) {
        setErrorMessage(`${failures.length} tindakan gagal disinkronkan. Contoh: ${failures[0]}`);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Gagal menyinkronkan akrual tindakan selesai.");
    } finally {
      setSyncingAccruals(false);
    }
  };

  const filteredRules = useMemo(() => {
    return rules.filter((r) => {
      if (selectedBranchId && r.branchId !== selectedBranchId) return false;
      if (ruleTypeFilter !== "ALL" && r.ruleTypeSnapshot !== ruleTypeFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const staffInfo = getStaffInfo(r.staffId);
        const matchesName = r.name.toLowerCase().includes(q);
        const matchesStaff = staffInfo.name.toLowerCase().includes(q) || staffInfo.code.toLowerCase().includes(q);
        const matchesService = getServiceName(r.serviceId).toLowerCase().includes(q);
        return matchesName || matchesStaff || matchesService;
      }
      return true;
    });
  }, [rules, ruleTypeFilter, searchQuery, staffList, doctors, services, selectedBranchId]);

  const getBranchStaffCount = (branchId: string) => {
    const staffIds = new Set(
      staffList
        .filter((staff) => staff.branchId === branchId && staff.active)
        .map((staff) => staff.id)
    );
    doctors.forEach((doctor) => {
      const hasAssignment = doctorAssignments.some(
        (assignment) => assignment.doctorId === doctor.id && assignment.branchId === branchId && assignment.active
      );
      if (doctor.active && doctor.isActive && (doctor.assignedBranchId === branchId || hasAssignment)) {
        staffIds.add(doctor.staffId || doctor.id);
      }
    });
    return staffIds.size;
  };

  const visibleBranches = branches.filter((branch) =>
    currentUser?.role !== UserRole.BRANCH_ADMIN || branch.id === currentUser.branchId
  );

  const totalAccruedAmount = accruals.reduce((sum, a) => sum + a.amount, 0);

  return (
    <div className="space-y-6" id="compensation-page">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Award className="w-6 h-6 text-emerald-600" />
            {isAssistant ? "Insentif Saya" : "Pengaturan Penggajian per Cabang"}
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {isAssistant
              ? "Daftar rincian insentif dan komisi dari pelayanan tindakan medis yang telah Anda kerjakan"
              : "Pilih cabang untuk mengatur gaji pokok, sharing dokter, serta insentif admin cabang dan asisten. Setiap cabang menerbitkan slip payrollnya sendiri."}
          </p>
        </div>

        {(currentUser?.role === UserRole.SUPER_ADMIN || currentUser?.role === UserRole.BRANCH_ADMIN) && (
          <button
            onClick={() => {
              const defaultStaff = availableDoctorsFirst();
              setFormStaffId(defaultStaff);
              setFormName("");
              setFormType("BASE_SALARY");
              setFormValue(2500000);
              setFormServiceId("");
              setFormBranchId(currentUser?.role === UserRole.BRANCH_ADMIN ? currentUser.branchId || "" : selectedBranchId);
              setFormError("");
              setShowRuleModal(true);
            }}
            className="inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-lg text-xs font-semibold shadow-sm transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Tambah Aturan Penggajian
          </button>
        )}
      </div>

      {/* Feedback & Error Banners */}
      {feedbackMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-xl text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{feedbackMessage}</span>
          </div>
          <button
            onClick={() => setFeedbackMessage(null)}
            className="text-emerald-700 hover:text-emerald-900 font-bold ml-3 text-xs"
          >
            ✕
          </button>
        </div>
      )}
      {errorMessage && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-xl text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-rose-700 hover:text-rose-900 font-bold ml-3 text-xs"
          >
            ✕
          </button>
        </div>
      )}

      {!isAssistant && (
        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Kebijakan Penggajian Cabang</h2>
            <p className="mt-1 text-xs text-slate-500">
              Pilih cabang untuk melihat dan mengatur aturan gaji seluruh karyawan yang bekerja di cabang tersebut.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {visibleBranches.map((branch) => {
              const activeRuleCount = rules.filter(
                (rule) => rule.branchId === branch.id && rule.isActive
              ).length;
              const staffCount = getBranchStaffCount(branch.id);
              const isSelected = selectedBranchId === branch.id;
              return (
                <button
                  key={branch.id}
                  type="button"
                  onClick={() => setSelectedBranchId(branch.id)}
                  className={`rounded-xl border p-4 text-left transition-colors ${
                    isSelected
                      ? "border-emerald-500 bg-emerald-50/70 shadow-sm ring-1 ring-emerald-200"
                      : "border-slate-200 bg-white hover:border-emerald-300 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-bold text-slate-900">{branch.name}</div>
                      <div className="mt-1 text-[11px] text-slate-500">
                        Pengaturan payroll khusus cabang
                      </div>
                    </div>
                    <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${
                      isSelected ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
                    }`}>
                      {isSelected ? "Dipilih" : "Pilih cabang"}
                    </span>
                  </div>
                  <div className="mt-4 flex items-center gap-5 border-t border-slate-200/70 pt-3">
                    <div>
                      <div className="text-base font-bold text-slate-900">{staffCount}</div>
                      <div className="text-[10px] text-slate-500">dokter & staf</div>
                    </div>
                    <div>
                      <div className="text-base font-bold text-emerald-700">{activeRuleCount}</div>
                      <div className="text-[10px] text-slate-500">aturan aktif</div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {!isAssistant && (
          <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Aturan Kompensasi Aktif</div>
              <div className="text-base font-bold text-slate-900 mt-0.5">
                {rules.filter((r) => r.isActive).length} Skema Terdaftar
              </div>
            </div>
          </div>
        )}

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center font-bold">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
              {isAssistant ? "Total Tindakan Berinsentif" : "Total Akrual Tercatat"}
            </div>
            <div className="text-base font-bold text-teal-700 mt-0.5">
              {accruals.length} Transaksi Tindakan
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            <DollarSign className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
              {isAssistant ? "Akumulasi Insentif Saya" : "Akumulasi Nilai Komisi"}
            </div>
            <div className="text-base font-bold text-blue-700 mt-0.5">
              Rp {totalAccruedAmount.toLocaleString("id-ID")}
            </div>
          </div>
        </div>
      </div>

      {/* Tab Selector */}
      {!isAssistant && (
        <div className="flex border-b border-slate-200">
          <button
            onClick={() => setActiveTab("RULES")}
            className={`pb-3 px-4 text-xs font-bold border-b-2 transition-colors ${
              activeTab === "RULES"
                ? "border-emerald-600 text-emerald-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            Master Aturan Kompensasi & Gaji Pokok ({rules.length})
          </button>
          <button
            onClick={() => setActiveTab("ACCRUALS")}
            className={`pb-3 px-4 text-xs font-bold border-b-2 transition-colors ${
              activeTab === "ACCRUALS"
                ? "border-emerald-600 text-emerald-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            Log Akrual Tindakan Selesai ({accruals.length})
          </button>
        </div>
      )}

      {/* Tab: RULES */}
      {activeTab === "RULES" && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200/80 shadow-xs">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Cari skema, nama staff, kode karyawan..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-xs pl-9 pr-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-xs text-slate-500 font-medium">Tipe:</span>
              <select
                value={ruleTypeFilter}
                onChange={(e) => setRuleTypeFilter(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="ALL">Semua Tipe Aturan</option>
                <option value="BASE_SALARY">Gaji Pokok (Base Salary)</option>
                <option value="PERCENTAGE">Persentase (%)</option>
                <option value="FIXED_PER_TREATMENT">Flat Fee (Rp)</option>
                <option value="TAX_PERCENTAGE">Pajak Payroll (%)</option>
              </select>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                  <th className="py-3 px-4">Nama Skema / Aturan</th>
                  <th className="py-3 px-4">Karyawan / Dokter Penerima</th>
                  <th className="py-3 px-4">Cakupan Layanan</th>
                  <th className="py-3 px-4">Tipe Aturan</th>
                  <th className="py-3 px-4 text-right">Nilai / Nominal</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  {(currentUser?.role === UserRole.SUPER_ADMIN || currentUser?.role === UserRole.BRANCH_ADMIN) && (
                    <th className="py-3 px-4 text-center">Aksi</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                {loading ? (
                  <tr>
                    <td colSpan={currentUser?.role === UserRole.SUPER_ADMIN || currentUser?.role === UserRole.BRANCH_ADMIN ? 7 : 6} className="py-8 text-center text-slate-400">
                      Memuat data aturan kompensasi...
                    </td>
                  </tr>
                ) : filteredRules.length === 0 ? (
                  <tr>
                    <td colSpan={currentUser?.role === UserRole.SUPER_ADMIN || currentUser?.role === UserRole.BRANCH_ADMIN ? 7 : 6} className="py-8 text-center text-slate-400">
                      {rules.length === 0
                        ? "Belum ada aturan kompensasi. Tambahkan skema untuk mulai menghitung fee dokter dan staf."
                        : "Tidak ada aturan kompensasi yang sesuai filter."}
                    </td>
                  </tr>
                ) : (
                  filteredRules.map((r) => {
                    const info = getStaffInfo(r.staffId);
                    const canManageRule =
                      currentUser?.role === UserRole.SUPER_ADMIN ||
                      (currentUser?.role === UserRole.BRANCH_ADMIN && r.branchId === currentUser.branchId);
                    return (
                      <tr key={r.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3.5 px-4 font-semibold text-slate-900">
                          <div>{r.name}</div>
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">{r.id}</div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                            {info.isDoctor ? (
                              <Stethoscope className="w-3.5 h-3.5 text-blue-600" />
                            ) : (
                              <Briefcase className="w-3.5 h-3.5 text-slate-400" />
                            )}
                            {info.name}
                          </div>
                          <div className="text-[10px] text-slate-500 flex items-center gap-2 mt-0.5">
                            <span className="font-mono bg-slate-100 px-1.5 py-0.2 rounded text-[10px]">
                              {info.code}
                            </span>
                            <span>{info.role}</span>
                            {(getBranchName(r.branchId) || info.branch) && (
                              <span className="text-slate-400">• {getBranchName(r.branchId) || info.branch}</span>
                            )}
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          {r.ruleTypeSnapshot === "TAX_PERCENTAGE" ? (
                            <span className="text-slate-500 text-[11px] italic">Seluruh penghasilan bruto</span>
                          ) : r.serviceId ? (
                            <span className="inline-flex items-center gap-1 font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded text-[11px] border border-emerald-100">
                              <Tag className="w-3 h-3" />
                              {getServiceName(r.serviceId)}
                            </span>
                          ) : (
                            <span className="text-slate-500 text-[11px] italic">
                              Global (Semua Layanan)
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          {r.ruleTypeSnapshot === "BASE_SALARY" ? (
                            <span className="inline-flex items-center gap-1 font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded text-[11px] border border-indigo-100">
                              Gaji Pokok (Base Salary)
                            </span>
                          ) : r.ruleTypeSnapshot === "TAX_PERCENTAGE" ? (
                            <span className="inline-flex items-center gap-1 font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded text-[11px] border border-rose-100">
                              Potongan Pajak Payroll
                            </span>
                          ) : r.ruleTypeSnapshot === "PERCENTAGE" ? (
                            <span className="inline-flex items-center gap-1 font-medium text-teal-700 bg-teal-50 px-2 py-0.5 rounded text-[11px]">
                              Bagi Hasil Persentase
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                              Fee Flat per Tindakan
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right font-bold">
                          {r.ruleTypeSnapshot === "PERCENTAGE" || r.ruleTypeSnapshot === "TAX_PERCENTAGE" ? (
                            <span className="text-teal-700 font-mono text-sm">{r.valueSnapshot}%</span>
                          ) : r.ruleTypeSnapshot === "BASE_SALARY" ? (
                            <span className="text-indigo-800 font-mono text-sm">
                              Rp {r.valueSnapshot.toLocaleString("id-ID")} /bln
                            </span>
                          ) : (
                            <span className="text-emerald-700 font-mono text-sm">
                              Rp {r.valueSnapshot.toLocaleString("id-ID")}
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                              r.isActive
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {r.isActive ? "Aktif" : "Nonaktif"}
                          </span>
                        </td>
                        {(currentUser?.role === UserRole.SUPER_ADMIN || currentUser?.role === UserRole.BRANCH_ADMIN) && (
                          <td className="py-3.5 px-4 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              {canManageRule && (
                                <button
                                  onClick={() => handleToggleRuleStatus(r)}
                                  className="text-slate-400 hover:text-slate-700 text-[11px] font-medium"
                                  title={r.isActive ? "Nonaktifkan aturan" : "Aktifkan aturan"}
                                >
                                  {r.isActive ? (
                                    <ToggleRight className="w-5 h-5 text-emerald-600 inline" />
                                  ) : (
                                    <ToggleLeft className="w-5 h-5 text-slate-400 inline" />
                                  )}
                                </button>
                              )}
                              {currentUser?.role === UserRole.SUPER_ADMIN && (
                                <button
                                  onClick={() => setRuleToDelete(r)}
                                  className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                                  title="Hapus Aturan Kompensasi"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab: ACCRUALS */}
      {activeTab === "ACCRUALS" && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
          {currentUser?.role === UserRole.SUPER_ADMIN && (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 border-b border-slate-100">
              <p className="text-xs text-slate-500">
                Sinkronkan kompensasi tindakan yang sudah selesai dan invoice-nya lunas. Akrual yang sudah ada tidak diduplikasi.
              </p>
              <button
                type="button"
                onClick={handleSyncCompletedTreatmentAccruals}
                disabled={syncingAccruals}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${syncingAccruals ? "animate-spin" : ""}`} />
                {syncingAccruals ? "Menyinkronkan..." : "Sinkronkan Tindakan Lunas"}
              </button>
            </div>
          )}
          <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                <th className="py-3 px-4">Waktu Akrual</th>
                <th className="py-3 px-4">Staff Penerima</th>
                <th className="py-3 px-4">Sumber Tindakan (Job ID)</th>
                <th className="py-3 px-4 text-right">Tarif Dasar</th>
                <th className="py-3 px-4 text-right">Skema Snapshot</th>
                <th className="py-3 px-4 text-right">Akrual Komisi</th>
                <th className="py-3 px-4 text-center">{isAssistant ? "Status" : "Jurnal Akuntansi"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    Memuat akrual kompensasi...
                  </td>
                </tr>
              ) : accruals.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    Belum ada akrual kompensasi tercatat. Akrual hanya dihitung setelah tindakan selesai dan invoice LUNAS; Super Admin dapat menyinkronkan tindakan yang memenuhi syarat.
                  </td>
                </tr>
              ) : (
                accruals.map((a) => {
                  const jrn = getCompensationJournal(a.id);
                  const info = getStaffInfo(a.staffId);
                  return (
                    <tr key={a.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-4 font-mono text-slate-500">
                        {new Date(a.accruedAt).toLocaleDateString("id-ID", {
                          day: "numeric",
                          month: "short",
                          year: "numeric"
                        })}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-slate-900">
                        <div>{info.name}</div>
                        <div className="text-[10px] text-slate-400 font-normal">{info.role}</div>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-emerald-700 font-medium">
                        {a.sourceId}
                      </td>
                      <td className="py-3.5 px-4 text-right font-medium text-slate-600">
                        Rp {(a.baseAmountSnapshot ?? a.amount).toLocaleString("id-ID")}
                      </td>
                      <td className="py-3.5 px-4 text-right font-medium text-slate-700">
                        {a.ruleTypeSnapshot === "PERCENTAGE" ? `${a.valueSnapshot ?? 0}%` : `Flat Rp ${(a.valueSnapshot ?? a.amount).toLocaleString("id-ID")}`}
                      </td>
                      <td className="py-3.5 px-4 text-right font-bold text-emerald-800">
                        Rp {a.amount.toLocaleString("id-ID")}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {isAssistant ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              Tercatat
                            </span>
                          ) : jrn ? (
                            <button
                              onClick={() => navigate("/super-admin/accounting")}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition-colors"
                              title="Buka jurnal di Akuntansi"
                            >
                              <BookOpen className="w-3 h-3" />
                              {jrn.journalNumber}
                            </button>
                          ) : (
                            <span
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200"
                              title="Jurnal kompensasi diposting melalui payroll"
                            >
                              Menunggu payroll
                            </span>
                          )}
                          {currentUser?.role === UserRole.SUPER_ADMIN && (
                            <button
                              onClick={() => setAccrualToDelete(a)}
                              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                              title="Hapus Akrual Kompensasi"
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
      )}

      {/* Modal: Add Compensation Rule */}
      {showRuleModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl border border-slate-100 max-w-md w-full p-6 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Plus className="w-5 h-5 text-emerald-600" />
                Tambah Aturan Kompensasi & Gaji Pokok
              </h3>
              <button
                onClick={() => setShowRuleModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateRule} className="space-y-4 mt-4">
              {formError && (
                <div className="p-3 bg-rose-50 text-rose-700 rounded-lg text-xs flex items-center gap-2 border border-rose-100">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Staff Selector */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">
                  Pilih Karyawan / Dokter Penerima *
                </label>
                <select
                  value={formStaffId}
                  onChange={(e) => setFormStaffId(e.target.value)}
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
                      <option key={d.id} value={d.staffId || ""} disabled={!d.staffId}>
                        {d.name} ({d.specialization}) - {getBranchName(d.assignedBranchId)}
                        {!d.staffId ? " - Belum terhubung ke data karyawan" : ""}
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

              {/* Rule Type */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">
                  Tipe Aturan Kompensasi *
                </label>
                <select
                  value={formType}
                  onChange={(e) => {
                    const nextType = e.target.value as "PERCENTAGE" | "FIXED_PER_TREATMENT" | "BASE_SALARY" | "TAX_PERCENTAGE";
                    setFormType(nextType);
                    if (nextType === "TAX_PERCENTAGE" && (formValue <= 0 || formValue > 100)) {
                      setFormValue(2.5);
                    } else if (nextType === "BASE_SALARY" && formValue < 1000000) {
                      setFormValue(2500000);
                    } else if (nextType === "PERCENTAGE" && formValue > 100) {
                      setFormValue(35);
                    } else if (nextType === "FIXED_PER_TREATMENT" && formValue <= 100) {
                      setFormValue(50000);
                    }
                  }}
                  className="w-full text-xs border border-slate-200 rounded-lg p-2 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="PERCENTAGE">Bagi Hasil Persentase Tindakan (%)</option>
                  <option value="FIXED_PER_TREATMENT">Nominal Flat Fee per Tindakan (Rp)</option>
                  <option value="BASE_SALARY">Gaji Pokok Tetap Bulanan / Base Salary (Rp)</option>
                  <option value="TAX_PERCENTAGE">Potongan Pajak Payroll (%)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">
                  Cabang *
                </label>
                <select
                  value={formBranchId}
                  required
                  disabled
                  className="w-full text-xs border border-slate-200 rounded-lg p-2 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:text-slate-500"
                >
                  {branches
                    .filter((branch) => currentUser?.role !== UserRole.BRANCH_ADMIN || branch.id === currentUser.branchId)
                    .map((branch) => (
                      <option key={branch.id} value={branch.id}>{branch.name}</option>
                    ))}
                </select>
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Cabang mengikuti kartu cabang yang dipilih di halaman ini. Untuk membuat aturan di cabang lain, tutup formulir lalu pilih cabang tersebut.
                </span>
              </div>

              {/* Service Target (Optional for commissions, disabled for base salary) */}
              {(formType === "PERCENTAGE" || formType === "FIXED_PER_TREATMENT") && (
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">
                    Cakupan Layanan Tindakan
                  </label>
                  <select
                    value={formServiceId}
                    onChange={(e) => setFormServiceId(e.target.value)}
                    className="w-full text-xs border border-slate-200 rounded-lg p-2 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">Semua Layanan Tindakan (Global)</option>
                    {services.map((srv) => (
                      <option key={srv.id} value={srv.id}>
                        {srv.name} (Dasar: Rp {srv.basePrice.toLocaleString("id-ID")})
                      </option>
                    ))}
                  </select>
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    * Kosongkan jika skema berlaku untuk seluruh tindakan dokter/asisten.
                  </span>
                </div>
              )}

              {/* Rule Name */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">
                  Nama Skema / Deskripsi *
                </label>
                <input
                  type="text"
                  placeholder={
                    formType === "BASE_SALARY"
                      ? "Contoh: Gaji Pokok Tetap Staff Admin"
                      : formType === "TAX_PERCENTAGE"
                      ? "Contoh: Pajak Dokter Cabang Gebang"
                      : "Contoh: Komisi Tindakan Scaling 35%"
                  }
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  required
                  className="w-full text-xs border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Value Input */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">
                  {formType === "TAX_PERCENTAGE"
                    ? "Persentase Pajak (%) *"
                    : formType === "PERCENTAGE"
                    ? "Persentase Komisi (%) *"
                    : formType === "BASE_SALARY"
                    ? "Nominal Gaji Pokok Bulanan (Rp) *"
                    : "Nominal Flat per Tindakan (Rp) *"}
                </label>
                <input
                  type="number"
                  min={formType === "TAX_PERCENTAGE" ? "0" : "1"}
                  max={formType === "PERCENTAGE" || formType === "TAX_PERCENTAGE" ? 100 : undefined}
                  step={formType === "PERCENTAGE" || formType === "TAX_PERCENTAGE" ? "0.1" : "1"}
                  value={formValue}
                  onChange={(e) => setFormValue(parseFloat(e.target.value) || 0)}
                  required
                  className="w-full text-sm font-bold border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                />
                {formType === "BASE_SALARY" && (
                  <span className="text-[10px] text-indigo-600 mt-1 block">
                    * Nominal ini akan otomatis ditarik sebagai default gaji pokok saat payroll bulanan di-generate.
                  </span>
                )}
                {formType === "TAX_PERCENTAGE" && (
                  <span className="text-[10px] text-rose-600 mt-1 block">
                    Persentase dipotong dari penghasilan bruto dokter pada slip cabang ini; tidak ada porsi pajak yang dibebankan ke klinik.
                  </span>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowRuleModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs disabled:opacity-50"
                >
                  {isSubmitting ? "Menyimpan..." : "Simpan Skema"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Konfirmasi Hapus Aturan Kompensasi */}
      {ruleToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900 text-center">
              Konfirmasi Hapus Skema Kompensasi
            </h3>
            <p className="text-xs text-slate-600 text-center mt-2 leading-relaxed">
              Apakah Anda yakin ingin menghapus aturan kompensasi <strong>{ruleToDelete.name}</strong>? Skema ini akan dihapus secara permanen dari database sistem. Tindakan ini tidak dapat dibatalkan.
            </p>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={isDeletingRule}
                onClick={() => setRuleToDelete(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isDeletingRule}
                onClick={handleConfirmDeleteRule}
                className="px-4 py-2 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {isDeletingRule ? "Menghapus..." : "Ya, Hapus Aturan"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Konfirmasi Hapus Akrual Kompensasi */}
      {accrualToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900 text-center">
              Konfirmasi Hapus Akrual
            </h3>
            <p className="text-xs text-slate-600 text-center mt-2 leading-relaxed">
              Apakah Anda yakin ingin menghapus catatan akrual kompensasi sebesar{" "}
              <strong>Rp {accrualToDelete.amount.toLocaleString("id-ID")}</strong>? Akrual yang sudah masuk payroll atau memiliki jurnal tidak dapat dihapus.
            </p>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={isDeletingAccrual}
                onClick={() => setAccrualToDelete(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isDeletingAccrual}
                onClick={handleConfirmDeleteAccrual}
                className="px-4 py-2 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {isDeletingAccrual ? "Menghapus..." : "Ya, Hapus Akrual"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  function availableDoctorsFirst(): string {
    const linkedDoctor = availableStaff.doctors.find((doctor) => doctor.staffId);
    if (linkedDoctor?.staffId) return linkedDoctor.staffId;
    if (availableStaff.branchAdmins.length > 0) return availableStaff.branchAdmins[0].id;
    if (availableStaff.assistants.length > 0) return availableStaff.assistants[0].id;
    return "";
  }
};
