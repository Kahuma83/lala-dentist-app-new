import React, { useState, useMemo } from "react";
import { useApp, SIMULATED_USERS } from "../context/AppContext";
import { AttendanceManager } from "../components/AttendanceManager";
import { OvertimeManager } from "../components/OvertimeManager";
import { DoctorSchedulePosterModal } from "../components/poster/DoctorSchedulePosterModal";
import { DoctorTimetableBoard } from "../components/DoctorTimetableBoard";
import { MockDatabase } from "../data/mockData";
import {
  UserRole,
  StaffPosition,
  EmploymentStatus,
  ScheduleStatus,
  DentalDoctor,
  Staff,
  DoctorSchedule,
  WorkShift,
  StaffShiftAssignment,
  DoctorBranchAssignment,
  UserAccount
} from "../types/domain";
import {
  Users,
  UserCheck,
  Calendar,
  Clock,
  Plus,
  Search,
  Filter,
  AlertCircle,
  CheckCircle2,
  Building2,
  Shield,
  Briefcase,
  Edit2,
  Trash2,
  AlertTriangle,
  X,
  MapPin,
  CalendarRange,
  Phone,
  Mail,
  FileBadge,
  UserPlus,
  Stethoscope,
  Image as ImageIcon,
  KeyRound,
  Lock,
  LayoutGrid,
  List
} from "lucide-react";

export const HRManagement: React.FC = () => {
  const {
    currentUser,
    selectedBranchId,
    branches,
    doctors,
    staff,
    doctorSchedules,
    workShifts,
    staffShiftAssignments,
    doctorBranchAssignments,
    doctorRepo,
    staffRepo,
    doctorScheduleRepo,
    workShiftRepo,
    staffShiftRepo,
    refreshData
  } = useApp();

  const isSuper = currentUser?.role === UserRole.SUPER_ADMIN;
  const userBranchId = currentUser?.role === UserRole.BRANCH_ADMIN ? currentUser.assignedBranchId : selectedBranchId;

  // Active Tab
  const [activeTab, setActiveTab] = useState<"doctors" | "staff" | "schedules" | "shifts" | "attendance" | "overtime">("doctors");

  // Global feedback notifications
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const showSuccess = (msg: string) => {
    setSuccessMessage(msg);
    setErrorMessage(null);
    setTimeout(() => setSuccessMessage(null), 4000);
  };

  const showError = (msg: string) => {
    setErrorMessage(msg);
    setSuccessMessage(null);
  };

  // =========================================================================
  // TAB 1: DOCTORS & MULTI-BRANCH ASSIGNMENTS
  // =========================================================================
  const [doctorSearch, setDoctorSearch] = useState("");
  const [doctorBranchFilter, setDoctorBranchFilter] = useState<string>(userBranchId || "ALL");
  const [isDoctorModalOpen, setIsDoctorModalOpen] = useState(false);
  const [editingDoctor, setEditingDoctor] = useState<DentalDoctor | null>(null);
  const [doctorForm, setDoctorForm] = useState({
    doctorCode: "",
    name: "",
    specialization: "Dokter Gigi Umum",
    phone: "",
    email: "",
    str: "",
    sip: "",
    assignedBranchId: userBranchId || "branch-gebang",
    active: true,
    notes: "",
    bankName: "",
    bankAccountNumber: "",
    bankAccountHolder: "",
    createLoginAccount: false,
    accountEmail: "",
    accountPassword: "",
    accountRole: UserRole.DOCTOR
  });

  // File upload / Doctor Deletion state
  const [doctorToDelete, setDoctorToDelete] = useState<DentalDoctor | null>(null);
  const [isDeletingDoctor, setIsDeletingDoctor] = useState(false);

  // Assign Doctor to Branch Modal
  const [isAssignBranchModalOpen, setIsAssignBranchModalOpen] = useState(false);
  const [selectedDoctorForAssign, setSelectedDoctorForAssign] = useState<DentalDoctor | null>(null);
  const [assignBranchForm, setAssignBranchForm] = useState({
    branchId: branches[0]?.id || "branch-gebang",
    startDate: new Date().toISOString().split("T")[0],
    endDate: "",
    notes: ""
  });

  const filteredDoctors = useMemo(() => {
    return doctors.filter((doc) => {
      // Branch filter
      if (doctorBranchFilter !== "ALL") {
        const hasAssignment = doctorBranchAssignments.some(
          (a) => a.doctorId === doc.id && a.branchId === doctorBranchFilter && a.active !== false
        );
        const isPrimary = doc.assignedBranchId === doctorBranchFilter;
        if (!hasAssignment && !isPrimary) return false;
      }

      // Search filter
      if (doctorSearch.trim()) {
        const query = doctorSearch.toLowerCase();
        const matchesName = (doc.name || doc.fullName || "").toLowerCase().includes(query);
        const matchesCode = (doc.doctorCode || "").toLowerCase().includes(query);
        const matchesSpec = (doc.specialization || "").toLowerCase().includes(query);
        if (!matchesName && !matchesCode && !matchesSpec) return false;
      }

      return true;
    });
  }, [doctors, doctorBranchFilter, doctorSearch, doctorBranchAssignments]);

  const handleOpenDoctorModal = (doc?: DentalDoctor) => {
    const db = MockDatabase.getInstance();
    if (doc) {
      setEditingDoctor(doc);
      const userAcc = db.userAccounts.find(
        (a) => a.doctorId === doc.id || (doc.email && a.email?.toLowerCase() === doc.email.toLowerCase())
      );
      const generatedEmail =
        doc.email || `${(doc.name || doc.fullName || "dokter").toLowerCase().replace(/[^a-z0-9]/g, "")}@laladentist.com`;

      setDoctorForm({
        doctorCode: doc.doctorCode || "",
        name: doc.name || doc.fullName || "",
        specialization: doc.specialization || "Dokter Gigi Umum",
        phone: doc.phone || "",
        email: doc.email || "",
        str: doc.str || "",
        sip: doc.sip || "",
        assignedBranchId: doc.assignedBranchId || userBranchId || branches[0]?.id || "branch-gebang",
        active: doc.active ?? doc.isActive ?? true,
        notes: doc.notes || "",
        bankName: doc.bankName || "",
        bankAccountNumber: doc.bankAccountNumber || "",
        bankAccountHolder: doc.bankAccountHolder || doc.name || doc.fullName || "",
        createLoginAccount: !!userAcc,
        accountEmail: userAcc?.email || generatedEmail,
        accountPassword: userAcc?.password || "123456",
        accountRole: userAcc?.role || UserRole.DOCTOR
      });
    } else {
      setEditingDoctor(null);
      setDoctorForm({
        doctorCode: `DRG-${String(doctors.length + 1).padStart(3, "0")}`,
        name: "",
        specialization: "Dokter Gigi Umum",
        phone: "",
        email: "",
        str: "",
        sip: "",
        assignedBranchId: userBranchId || branches[0]?.id || "branch-gebang",
        active: true,
        notes: "",
        bankName: "",
        bankAccountNumber: "",
        bankAccountHolder: "",
        createLoginAccount: true,
        accountEmail: "",
        accountPassword: "",
        accountRole: UserRole.DOCTOR
      });
    }
    setIsDoctorModalOpen(true);
  };

  const handleSaveDoctor = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      let savedDoctor: DentalDoctor;
      if (editingDoctor) {
        savedDoctor = await doctorRepo.updateDoctor(editingDoctor.id, {
          doctorCode: doctorForm.doctorCode,
          name: doctorForm.name,
          fullName: doctorForm.name,
          specialization: doctorForm.specialization,
          phone: doctorForm.phone,
          email: doctorForm.email,
          str: doctorForm.str,
          sip: doctorForm.sip,
          assignedBranchId: doctorForm.assignedBranchId,
          active: doctorForm.active,
          isActive: doctorForm.active,
          notes: doctorForm.notes,
          bankName: doctorForm.bankName,
          bankAccountNumber: doctorForm.bankAccountNumber,
          bankAccountHolder: doctorForm.bankAccountHolder
        });
        showSuccess(`Data dokter ${doctorForm.name} berhasil diperbarui.`);
      } else {
        savedDoctor = await doctorRepo.createDoctor({
          doctorCode: doctorForm.doctorCode,
          name: doctorForm.name,
          fullName: doctorForm.name,
          specialization: doctorForm.specialization,
          phone: doctorForm.phone,
          email: doctorForm.email,
          str: doctorForm.str,
          sip: doctorForm.sip,
          assignedBranchId: doctorForm.assignedBranchId,
          active: doctorForm.active,
          isActive: doctorForm.active,
          notes: doctorForm.notes,
          bankName: doctorForm.bankName,
          bankAccountNumber: doctorForm.bankAccountNumber,
          bankAccountHolder: doctorForm.bankAccountHolder
        });
        showSuccess(`Dokter baru ${doctorForm.name} berhasil ditambahkan.`);
      }

      // Handle UserAccount creation or update for Doctor
      const db = MockDatabase.getInstance();
      let userAcc = db.userAccounts.find(
        (a) => a.doctorId === savedDoctor.id || (savedDoctor.email && a.email?.toLowerCase() === savedDoctor.email.toLowerCase())
      );

      if (doctorForm.createLoginAccount && doctorForm.accountEmail.trim()) {
        const email = doctorForm.accountEmail.trim().toLowerCase();
        const username = email.split("@")[0].replace(/[^a-z0-9_]/g, "") || "doctor";
        const password = doctorForm.accountPassword.trim() || "123456";

        if (userAcc) {
          userAcc.email = email;
          userAcc.username = username;
          userAcc.password = password;
          userAcc.name = doctorForm.name;
          userAcc.role = doctorForm.accountRole;
          userAcc.branchId = doctorForm.assignedBranchId || null;
          userAcc.doctorId = savedDoctor.id;
          userAcc.active = doctorForm.active;
          userAcc.updatedAt = new Date().toISOString();

          const simUser = SIMULATED_USERS.find((u) => u.id === userAcc!.id);
          if (simUser) {
            simUser.name = `${doctorForm.name} (Dokter Gigi)`;
            simUser.role = doctorForm.accountRole;
            simUser.assignedBranchId = doctorForm.assignedBranchId || null;
            simUser.doctorId = savedDoctor.id;
          }
        } else {
          const newAccId = `user-doc-${savedDoctor.id || Date.now()}`;
          const newAcc: UserAccount = {
            id: newAccId,
            username,
            email,
            password,
            name: doctorForm.name,
            role: doctorForm.accountRole,
            doctorId: savedDoctor.id,
            branchId: doctorForm.assignedBranchId || null,
            active: doctorForm.active,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
          db.userAccounts.push(newAcc);

          if (!SIMULATED_USERS.some((u) => u.id === newAccId)) {
            SIMULATED_USERS.push({
              id: newAccId,
              name: `${doctorForm.name} (Dokter Gigi)`,
              role: doctorForm.accountRole,
              assignedBranchId: doctorForm.assignedBranchId || null,
              doctorId: savedDoctor.id
            });
          }
        }
        db.saveToStorage();
      } else if (!doctorForm.createLoginAccount && userAcc) {
        userAcc.active = false;
        db.saveToStorage();
      }

      setIsDoctorModalOpen(false);
      setEditingDoctor(null);
      await refreshData();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Gagal menyimpan data dokter");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmDeleteDoctor = async () => {
    if (!doctorToDelete || !isSuper) return;
    setIsDeletingDoctor(true);
    try {
      await doctorRepo.deleteDoctor(doctorToDelete.id, currentUser?.role);
      showSuccess(`Dokter "${doctorToDelete.name || doctorToDelete.fullName}" berhasil dihapus dari sistem!`);
      setDoctorToDelete(null);
      if (editingDoctor?.id === doctorToDelete.id) {
        setIsDoctorModalOpen(false);
        setEditingDoctor(null);
      }
      await refreshData();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Gagal menghapus dokter");
    } finally {
      setIsDeletingDoctor(false);
    }
  };

  const handleSaveBranchAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDoctorForAssign) return;
    setIsSubmitting(true);
    try {
      await doctorRepo.assignDoctorToBranch({
        doctorId: selectedDoctorForAssign.id,
        branchId: assignBranchForm.branchId,
        startDate: assignBranchForm.startDate,
        endDate: assignBranchForm.endDate || null,
        active: true,
        notes: assignBranchForm.notes
      });
      showSuccess(`Penugasan cabang untuk ${selectedDoctorForAssign.name} berhasil disimpan.`);
      setIsAssignBranchModalOpen(false);
      setSelectedDoctorForAssign(null);
      await refreshData();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Gagal menugaskan dokter ke cabang");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleDoctorActive = async (doctor: DentalDoctor) => {
    const currentActive = doctor.active ?? doctor.isActive ?? true;
    try {
      await doctorRepo.updateDoctor(doctor.id, {
        active: !currentActive,
        isActive: !currentActive
      });
      showSuccess(`Status dokter ${doctor.name} berhasil diubah menjadi ${!currentActive ? "Aktif" : "Nonaktif"}.`);
      await refreshData();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Gagal mengubah status dokter");
    }
  };

  // =========================================================================
  // TAB 2: MASTER STAFF & SDM (Staff ≠ UserAccount)
  // =========================================================================
  const [staffSearch, setStaffSearch] = useState("");
  const [staffBranchFilter, setStaffBranchFilter] = useState<string>(userBranchId || "ALL");
  const [staffPositionFilter, setStaffPositionFilter] = useState<string>("ALL");
  const [staffStatusFilter, setStaffStatusFilter] = useState<string>("ALL");
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [staffForm, setStaffForm] = useState({
    employeeCode: "",
    fullName: "",
    phone: "",
    position: StaffPosition.ASSISTANT,
    employmentStatus: EmploymentStatus.ACTIVE,
    branchId: userBranchId || "branch-gebang",
    joinDate: new Date().toISOString().split("T")[0],
    active: true,
    notes: "",
    bankName: "",
    bankAccountNumber: "",
    bankAccountHolder: "",
    createLoginAccount: false,
    accountEmail: "",
    accountPassword: "",
    accountRole: UserRole.DOCTOR_ASSISTANT
  });

  const handleOpenStaffModal = (s?: Staff, forceEnableAccount = false) => {
    const db = MockDatabase.getInstance();
    if (s) {
      setEditingStaff(s);
      const userAcc = s.userAccountId ? db.userAccounts.find((a) => a.id === s.userAccountId) : null;
      const defaultRole =
        s.position === StaffPosition.BRANCH_ADMIN
          ? UserRole.BRANCH_ADMIN
          : s.position === StaffPosition.DOCTOR
          ? UserRole.DOCTOR
          : UserRole.DOCTOR_ASSISTANT;

      const generatedEmail = `${s.fullName.toLowerCase().replace(/[^a-z0-9]/g, "") || "staff"}@laladentist.com`;

      setStaffForm({
        employeeCode: s.employeeCode,
        fullName: s.fullName,
        phone: s.phone || "",
        position: s.position,
        employmentStatus: s.employmentStatus,
        branchId: s.branchId || branches[0]?.id || "branch-gebang",
        joinDate: s.joinDate || new Date().toISOString().split("T")[0],
        active: s.active,
        notes: s.notes || "",
        bankName: s.bankName || "",
        bankAccountNumber: s.bankAccountNumber || "",
        bankAccountHolder: s.bankAccountHolder || s.fullName || "",
        createLoginAccount: forceEnableAccount || !!userAcc || !!s.userAccountId,
        accountEmail: userAcc?.email || generatedEmail,
        accountPassword: userAcc?.password || "123456",
        accountRole: userAcc?.role || defaultRole
      });
    } else {
      setEditingStaff(null);
      setStaffForm({
        employeeCode: `STF-${String(staff.length + 1).padStart(3, "0")}`,
        fullName: "",
        phone: "",
        position: StaffPosition.ASSISTANT,
        employmentStatus: EmploymentStatus.ACTIVE,
        branchId: userBranchId || branches[0]?.id || "branch-gebang",
        joinDate: new Date().toISOString().split("T")[0],
        active: true,
        notes: "",
        bankName: "",
        bankAccountNumber: "",
        bankAccountHolder: "",
        createLoginAccount: forceEnableAccount,
        accountEmail: "",
        accountPassword: "",
        accountRole: UserRole.DOCTOR_ASSISTANT
      });
    }
    setIsStaffModalOpen(true);
  };

  // Staff Deletion & Schedule/Shift Confirmation States
  const [staffToDelete, setStaffToDelete] = useState<Staff | null>(null);
  const [isDeletingStaff, setIsDeletingStaff] = useState(false);
  const [scheduleToCancel, setScheduleToCancel] = useState<DoctorSchedule | null>(null);
  const [isCancellingSchedule, setIsCancellingSchedule] = useState(false);
  const [assignmentToRemove, setAssignmentToRemove] = useState<StaffShiftAssignment | null>(null);
  const [isRemovingAssignment, setIsRemovingAssignment] = useState(false);

  const filteredStaff = useMemo(() => {
    return staff.filter((s) => {
      // Branch isolation
      if (currentUser?.role === UserRole.BRANCH_ADMIN && currentUser.assignedBranchId) {
        if (s.branchId && s.branchId !== currentUser.assignedBranchId) return false;
      } else if (staffBranchFilter !== "ALL") {
        if (s.branchId !== staffBranchFilter) return false;
      }

      if (staffPositionFilter !== "ALL" && s.position !== staffPositionFilter) return false;
      if (staffStatusFilter !== "ALL" && s.employmentStatus !== staffStatusFilter) return false;

      if (staffSearch.trim()) {
        const query = staffSearch.toLowerCase();
        const matchesName = s.fullName.toLowerCase().includes(query);
        const matchesCode = s.employeeCode.toLowerCase().includes(query);
        const matchesPhone = (s.phone || "").toLowerCase().includes(query);
        if (!matchesName && !matchesCode && !matchesPhone) return false;
      }

      return true;
    });
  }, [staff, currentUser, staffBranchFilter, staffPositionFilter, staffStatusFilter, staffSearch]);

  const handleSaveStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const db = MockDatabase.getInstance();
      let userAccountId: string | null = editingStaff?.userAccountId || null;

      if (staffForm.createLoginAccount && staffForm.accountEmail.trim()) {
        const email = staffForm.accountEmail.trim().toLowerCase();
        const username = email.split("@")[0].replace(/[^a-z0-9_]/g, "") || "user";
        const password = staffForm.accountPassword.trim() || "123456";

        if (userAccountId) {
          // Update existing user account
          const existingAcc = db.userAccounts.find((a) => a.id === userAccountId);
          if (existingAcc) {
            existingAcc.email = email;
            existingAcc.username = username;
            existingAcc.password = password;
            existingAcc.name = staffForm.fullName;
            existingAcc.role = staffForm.accountRole;
            existingAcc.branchId = staffForm.branchId || null;
            existingAcc.active = staffForm.active;
            existingAcc.updatedAt = new Date().toISOString();
          }

          // Update in SIMULATED_USERS
          const simUser = SIMULATED_USERS.find((u) => u.id === userAccountId);
          if (simUser) {
            simUser.name = `${staffForm.fullName} (${staffForm.accountRole})`;
            simUser.role = staffForm.accountRole;
            simUser.assignedBranchId = staffForm.branchId || null;
          }
        } else {
          // Create new user account
          const newAccId = `user-${editingStaff?.id || `staff-${Date.now()}`}`;
          const newAcc: UserAccount = {
            id: newAccId,
            username,
            email,
            password,
            name: staffForm.fullName,
            role: staffForm.accountRole,
            staffId: editingStaff?.id || null,
            branchId: staffForm.branchId || null,
            active: staffForm.active,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
          db.userAccounts.push(newAcc);
          userAccountId = newAccId;

          // Register in SIMULATED_USERS for runtime role switcher
          if (!SIMULATED_USERS.some((u) => u.id === newAccId)) {
            SIMULATED_USERS.push({
              id: newAccId,
              name: `${staffForm.fullName} (${staffForm.accountRole})`,
              role: staffForm.accountRole,
              assignedBranchId: staffForm.branchId || null,
              staffId: editingStaff?.id
            });
          }
        }
        db.saveToStorage();
      } else if (!staffForm.createLoginAccount && userAccountId) {
        // Disconnect user account
        const existingAcc = db.userAccounts.find((a) => a.id === userAccountId);
        if (existingAcc) {
          existingAcc.active = false;
        }
        userAccountId = null;
        db.saveToStorage();
      }

      if (editingStaff) {
        await staffRepo.updateStaff(
          editingStaff.id,
          {
            employeeCode: staffForm.employeeCode,
            fullName: staffForm.fullName,
            phone: staffForm.phone,
            position: staffForm.position,
            employmentStatus: staffForm.employmentStatus,
            branchId: staffForm.branchId || null,
            joinDate: staffForm.joinDate,
            active: staffForm.active,
            notes: staffForm.notes,
            bankName: staffForm.bankName,
            bankAccountNumber: staffForm.bankAccountNumber,
            bankAccountHolder: staffForm.bankAccountHolder,
            userAccountId
          },
          currentUser?.role,
          currentUser?.assignedBranchId
        );
        showSuccess(`Data staff ${staffForm.fullName} berhasil diperbarui.`);
      } else {
        const createdStaff = await staffRepo.createStaff(
          {
            employeeCode: staffForm.employeeCode,
            fullName: staffForm.fullName,
            phone: staffForm.phone,
            position: staffForm.position,
            employmentStatus: staffForm.employmentStatus,
            branchId: staffForm.branchId || null,
            joinDate: staffForm.joinDate,
            active: staffForm.active,
            notes: staffForm.notes,
            bankName: staffForm.bankName,
            bankAccountNumber: staffForm.bankAccountNumber,
            bankAccountHolder: staffForm.bankAccountHolder,
            userAccountId
          },
          currentUser?.role,
          currentUser?.assignedBranchId
        );

        if (userAccountId) {
          const acc = db.userAccounts.find((a) => a.id === userAccountId);
          if (acc) {
            acc.staffId = createdStaff.id;
          }
          const simUser = SIMULATED_USERS.find((u) => u.id === userAccountId);
          if (simUser) {
            simUser.staffId = createdStaff.id;
          }
          db.saveToStorage();
        }

        showSuccess(`Staff baru ${staffForm.fullName} (${staffForm.employeeCode}) berhasil didaftarkan.`);
      }
      setIsStaffModalOpen(false);
      setEditingStaff(null);
      await refreshData();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Gagal menyimpan data staff");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStaffStatus = async (s: Staff) => {
    try {
      await staffRepo.updateStaff(
        s.id,
        { active: !s.active },
        currentUser?.role,
        currentUser?.assignedBranchId
      );
      showSuccess(`Status staff ${s.fullName} berhasil diubah menjadi ${!s.active ? "Aktif" : "Nonaktif"}.`);
      await refreshData();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Gagal mengubah status staff");
    }
  };

  const handleConfirmDeleteStaff = async () => {
    if (!staffToDelete) return;
    setIsDeletingStaff(true);
    try {
      await staffRepo.deleteStaff(staffToDelete.id, currentUser?.role, currentUser?.assignedBranchId);
      showSuccess(`Staff "${staffToDelete.fullName}" (${staffToDelete.employeeCode}) berhasil dihapus dari database.`);
      setStaffToDelete(null);
      if (editingStaff?.id === staffToDelete.id) {
        setIsStaffModalOpen(false);
        setEditingStaff(null);
      }
      await refreshData();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Gagal menghapus data staff");
    } finally {
      setIsDeletingStaff(false);
    }
  };

  // =========================================================================
  // TAB 3: JADWAL DOKTER (Doctor Schedules & Drag-and-Drop Timetable)
  // =========================================================================
  const [scheduleViewMode, setScheduleViewMode] = useState<"timetable" | "list">("timetable");
  const [scheduleDateFilter, setScheduleDateFilter] = useState<string>(new Date().toISOString().split("T")[0]);
  const [scheduleBranchFilter, setScheduleBranchFilter] = useState<string>(userBranchId || "ALL");
  const [scheduleDoctorFilter, setScheduleDoctorFilter] = useState<string>("ALL");
  const [scheduleStatusFilter, setScheduleStatusFilter] = useState<string>("ALL");
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [isPosterModalOpen, setIsPosterModalOpen] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({
    doctorId: doctors[0]?.id || "",
    branchId: userBranchId || "branch-gebang",
    date: new Date().toISOString().split("T")[0],
    startTime: "08:00",
    endTime: "14:00",
    notes: ""
  });

  const handleTimetableScheduleCreate = async (data: {
    doctorId: string;
    branchId: string;
    date: string;
    startTime: string;
    endTime: string;
    notes?: string;
  }) => {
    await doctorScheduleRepo.createSchedule(
      {
        ...data,
        status: ScheduleStatus.ACTIVE
      },
      currentUser?.role,
      currentUser?.assignedBranchId
    );
    await refreshData();
  };

  const handleTimetableScheduleUpdate = async (id: string, updates: Partial<DoctorSchedule>) => {
    await doctorScheduleRepo.updateSchedule(
      id,
      updates,
      currentUser?.role,
      currentUser?.assignedBranchId
    );
    await refreshData();
  };

  const filteredSchedules = useMemo(() => {
    return doctorSchedules.filter((sched) => {
      // Branch isolation
      if (currentUser?.role === UserRole.BRANCH_ADMIN && currentUser.assignedBranchId) {
        if (sched.branchId !== currentUser.assignedBranchId) return false;
      } else if (scheduleBranchFilter !== "ALL") {
        if (sched.branchId !== scheduleBranchFilter) return false;
      }

      if (scheduleDateFilter && sched.date !== scheduleDateFilter) return false;
      if (scheduleDoctorFilter !== "ALL" && sched.doctorId !== scheduleDoctorFilter) return false;
      if (scheduleStatusFilter !== "ALL" && sched.status !== scheduleStatusFilter) return false;

      return true;
    });
  }, [doctorSchedules, currentUser, scheduleBranchFilter, scheduleDateFilter, scheduleDoctorFilter, scheduleStatusFilter]);

  const handleSaveSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await doctorScheduleRepo.createSchedule(
        {
          doctorId: scheduleForm.doctorId,
          branchId: scheduleForm.branchId,
          date: scheduleForm.date,
          startTime: scheduleForm.startTime,
          endTime: scheduleForm.endTime,
          status: ScheduleStatus.ACTIVE,
          notes: scheduleForm.notes
        },
        currentUser?.role,
        currentUser?.assignedBranchId
      );
      showSuccess("Jadwal dokter berhasil dibuat tanpa bentrok.");
      setIsScheduleModalOpen(false);
      await refreshData();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Gagal membuat jadwal dokter");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelSchedule = (sched: DoctorSchedule) => {
    setScheduleToCancel(sched);
  };

  const handleConfirmCancelSchedule = async () => {
    if (!scheduleToCancel) return;
    setIsCancellingSchedule(true);
    try {
      const docName = doctors.find((d) => d.id === scheduleToCancel.doctorId)?.name || "Dokter";
      await doctorScheduleRepo.cancelSchedule(scheduleToCancel.id, currentUser?.role, currentUser?.assignedBranchId);
      showSuccess(`Jadwal praktek ${docName} berhasil dibatalkan.`);
      setScheduleToCancel(null);
      await refreshData();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Gagal membatalkan jadwal");
    } finally {
      setIsCancellingSchedule(false);
    }
  };

  // =========================================================================
  // TAB 4: SHIFT KERJA & PENUGASAN STAFF
  // =========================================================================
  const [shiftDateFilter, setShiftDateFilter] = useState<string>(new Date().toISOString().split("T")[0]);
  const [shiftBranchFilter, setShiftBranchFilter] = useState<string>(userBranchId || "ALL");
  const [isAssignShiftModalOpen, setIsAssignShiftModalOpen] = useState(false);
  const [assignShiftForm, setAssignShiftForm] = useState({
    staffId: staff.find((s) => s.active)?.id || "",
    branchId: userBranchId || "branch-gebang",
    shiftId: workShifts[0]?.id || "",
    date: new Date().toISOString().split("T")[0],
    notes: ""
  });

  const filteredShiftAssignments = useMemo(() => {
    return staffShiftAssignments.filter((a) => {
      if (currentUser?.role === UserRole.BRANCH_ADMIN && currentUser.assignedBranchId) {
        if (a.branchId !== currentUser.assignedBranchId) return false;
      } else if (shiftBranchFilter !== "ALL") {
        if (a.branchId !== shiftBranchFilter) return false;
      }

      if (shiftDateFilter && a.date !== shiftDateFilter) return false;
      return true;
    });
  }, [staffShiftAssignments, currentUser, shiftBranchFilter, shiftDateFilter]);

  const handleSaveShiftAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await staffShiftRepo.assignStaffShift(
        {
          staffId: assignShiftForm.staffId,
          branchId: assignShiftForm.branchId,
          shiftId: assignShiftForm.shiftId,
          date: assignShiftForm.date,
          active: true,
          notes: assignShiftForm.notes
        },
        currentUser?.role,
        currentUser?.assignedBranchId
      );
      showSuccess("Penugasan shift staff berhasil dicatat.");
      setIsAssignShiftModalOpen(false);
      await refreshData();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Gagal menugaskan shift");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveShiftAssignment = (id: string) => {
    const item = staffShiftAssignments.find((a) => a.id === id);
    if (item) {
      setAssignmentToRemove(item);
    }
  };

  const handleConfirmRemoveAssignment = async () => {
    if (!assignmentToRemove) return;
    setIsRemovingAssignment(true);
    try {
      await staffShiftRepo.removeAssignment(assignmentToRemove.id, currentUser?.role, currentUser?.assignedBranchId);
      showSuccess("Penugasan shift berhasil dihapus.");
      setAssignmentToRemove(null);
      await refreshData();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Gagal menghapus penugasan shift");
    } finally {
      setIsRemovingAssignment(false);
    }
  };

  return (
    <div className="space-y-6 pb-12" id="hr-management-page">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2.5 bg-emerald-50 rounded-xl text-emerald-600">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                SDM & Jadwal Multi-Cabang
              </h1>
              <p className="text-xs text-slate-500">
                Sistem Pengelolaan Dokter, Master Staff, Penjadwalan Dokter & Shift Kerja Lala Dentist
              </p>
            </div>
          </div>
        </div>

        {/* Global Metrics Badge */}
        <div className="flex items-center gap-3">
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl px-4 py-2 text-center">
            <div className="text-xs text-slate-500 font-medium">Total Staff</div>
            <div className="text-lg font-bold text-slate-900">{staff.length}</div>
          </div>
          <div className="bg-emerald-50 border border-emerald-200/80 rounded-xl px-4 py-2 text-center">
            <div className="text-xs text-emerald-600 font-medium">Dokter Aktif</div>
            <div className="text-lg font-bold text-emerald-700">
              {doctors.filter((d) => d.active ?? d.isActive ?? true).length}
            </div>
          </div>
          <div className="bg-blue-50 border border-blue-200/80 rounded-xl px-4 py-2 text-center">
            <div className="text-xs text-blue-600 font-medium">Jadwal Aktif</div>
            <div className="text-lg font-bold text-blue-700">
              {doctorSchedules.filter((s) => s.status === ScheduleStatus.ACTIVE).length}
            </div>
          </div>
        </div>
      </div>

      {/* Global Alerts */}
      {errorMessage && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-start gap-3 text-rose-800 text-xs animate-in fade-in" id="hr-error-alert">
          <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-bold">Perhatian:</span> {errorMessage}
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-rose-500 hover:text-rose-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMessage && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3 text-emerald-800 text-xs animate-in fade-in" id="hr-success-alert">
          <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-bold">Berhasil:</span> {successMessage}
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-500 hover:text-emerald-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Tabs Navigation */}
      <div className="flex border-b border-slate-200 gap-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab("doctors")}
          className={`flex items-center gap-2 px-5 py-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
            activeTab === "doctors"
              ? "border-emerald-600 text-emerald-700 bg-emerald-50/40"
              : "border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300"
          }`}
          id="tab-doctors-button"
        >
          <Stethoscope className="w-4 h-4" />
          Dokter & Penempatan Cabang ({doctors.length})
        </button>

        <button
          onClick={() => setActiveTab("staff")}
          className={`flex items-center gap-2 px-5 py-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
            activeTab === "staff"
              ? "border-emerald-600 text-emerald-700 bg-emerald-50/40"
              : "border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300"
          }`}
          id="tab-staff-button"
        >
          <Users className="w-4 h-4" />
          Master SDM & Staff ({staff.length})
        </button>

        <button
          onClick={() => setActiveTab("schedules")}
          className={`flex items-center gap-2 px-5 py-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
            activeTab === "schedules"
              ? "border-emerald-600 text-emerald-700 bg-emerald-50/40"
              : "border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300"
          }`}
          id="tab-schedules-button"
        >
          <CalendarRange className="w-4 h-4" />
          Jadwal Dokter ({doctorSchedules.length})
        </button>

        <button
          onClick={() => setActiveTab("shifts")}
          className={`flex items-center gap-2 px-5 py-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
            activeTab === "shifts"
              ? "border-emerald-600 text-emerald-700 bg-emerald-50/40"
              : "border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300"
          }`}
          id="tab-shifts-button"
        >
          <Clock className="w-4 h-4" />
          Shift Kerja & Roster Staff
        </button>

        <button
          onClick={() => setActiveTab("attendance")}
          className={`flex items-center gap-2 px-5 py-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
            activeTab === "attendance"
              ? "border-emerald-600 text-emerald-700 bg-emerald-50/40"
              : "border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300"
          }`}
          id="tab-attendance-button"
        >
          <UserCheck className="w-4 h-4" />
          Absensi & Kehadiran (SSOT)
        </button>

        <button
          onClick={() => setActiveTab("overtime")}
          className={`flex items-center gap-2 px-5 py-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
            activeTab === "overtime"
              ? "border-emerald-600 text-emerald-700 bg-emerald-50/40"
              : "border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300"
          }`}
          id="tab-overtime-button"
        >
          <Clock className="w-4 h-4" />
          Overtime Engine & Approval (HR-3)
        </button>
      </div>

      {/* =========================================================================
          TAB 1 CONTENT: DOKTER MULTI-CABANG
      ========================================================================= */}
      {activeTab === "doctors" && (
        <div className="space-y-4" id="doctors-tab-content">
          {/* Controls Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Cari dokter, kode, spesialis..."
                  value={doctorSearch}
                  onChange={(e) => setDoctorSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
                />
              </div>

              {isSuper && (
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                  <select
                    value={doctorBranchFilter}
                    onChange={(e) => setDoctorBranchFilter(e.target.value)}
                    className="text-xs border border-slate-200 rounded-lg px-2.5 py-2 bg-white focus:outline-none focus:border-emerald-600"
                  >
                    <option value="ALL">Semua Cabang Penugasan</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <button
              onClick={() => handleOpenDoctorModal()}
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-xs font-semibold shadow-sm transition-colors"
              id="add-doctor-button"
            >
              <Plus className="w-4 h-4" />
              Tambah Dokter
            </button>
          </div>

          {/* Doctors Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600">
                  <tr>
                    <th className="px-4 py-3">Kode Dokter</th>
                    <th className="px-4 py-3">Nama Lengkap & Gelar</th>
                    <th className="px-4 py-3">Spesialisasi</th>
                    <th className="px-4 py-3">Kontak & Izin (STR / SIP)</th>
                    <th className="px-4 py-3">Penugasan Cabang</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredDoctors.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                        Tidak ada dokter yang cocok dengan pencarian / filter.
                      </td>
                    </tr>
                  ) : (
                    filteredDoctors.map((doc) => {
                      const isActive = doc.active ?? doc.isActive ?? true;
                      const assignments = doctorBranchAssignments.filter(
                        (a) => a.doctorId === doc.id && a.active !== false
                      );

                      return (
                        <tr key={doc.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-4 py-3 font-mono font-bold text-slate-800">
                            {doc.doctorCode || doc.id}
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-semibold text-slate-900">{doc.name || doc.fullName}</div>
                            {doc.notes && <div className="text-[11px] text-slate-400 italic">{doc.notes}</div>}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-700">
                              {doc.specialization}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-[11px] text-slate-600 flex items-center gap-1">
                              <Phone className="w-3 h-3 text-slate-400" /> {doc.phone || "-"}
                            </div>
                            {(doc.str || doc.sip) && (
                              <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                                STR: {doc.str || "-"} | SIP: {doc.sip || "-"}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {assignments.length === 0 ? (
                                <span className="text-[11px] text-slate-400">Belum ditugaskan</span>
                              ) : (
                                assignments.map((a) => {
                                  const br = branches.find((b) => b.id === a.branchId);
                                  return (
                                    <span
                                      key={a.id}
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200"
                                    >
                                      <Building2 className="w-2.5 h-2.5" />
                                      {br?.name || a.branchId}
                                    </span>
                                  );
                                })
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button
                              onClick={() => handleToggleDoctorActive(doc)}
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold transition-colors ${
                                isActive
                                  ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                                  : "bg-slate-200 text-slate-600 hover:bg-slate-300"
                              }`}
                            >
                              {isActive ? "Aktif" : "Nonaktif"}
                            </button>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => {
                                  setSelectedDoctorForAssign(doc);
                                  setAssignBranchForm({
                                    branchId: branches[0]?.id || "branch-gebang",
                                    startDate: new Date().toISOString().split("T")[0],
                                    endDate: "",
                                    notes: ""
                                  });
                                  setIsAssignBranchModalOpen(true);
                                }}
                                title="Atur Penugasan Cabang"
                                className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                              >
                                <MapPin className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleOpenDoctorModal(doc)}
                                title="Edit Dokter"
                                className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              {isSuper && (
                                <button
                                  onClick={() => setDoctorToDelete(doc)}
                                  title={`Hapus Dokter ${doc.name || doc.fullName}`}
                                  className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
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
        </div>
      )}

      {/* =========================================================================
          TAB 2 CONTENT: MASTER STAFF & SDM
      ========================================================================= */}
      {activeTab === "staff" && (
        <div className="space-y-4" id="staff-tab-content">
          {/* Concept Banner: Staff ≠ UserAccount */}
          <div className="bg-amber-50/80 border border-amber-200/90 rounded-xl p-4 flex items-start gap-3 text-amber-900 text-xs">
            <Shield className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Prinsip Desain HR Lala Dentist:</span> Staff adalah data master seluruh SDM operasional (Dokter, Perawat/Asisten, Branch Admin, Front Office, Finance, OB, dll). Staff dapat terdaftar tanpa harus memiliki akun login sistem (contoh: Office Boy).
            </div>
          </div>

          {/* Controls Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-60">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Cari nama staff / NIK..."
                  value={staffSearch}
                  onChange={(e) => setStaffSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
                />
              </div>

              {isSuper && (
                <select
                  value={staffBranchFilter}
                  onChange={(e) => setStaffBranchFilter(e.target.value)}
                  className="text-xs border border-slate-200 rounded-lg px-2.5 py-2 bg-white focus:outline-none focus:border-emerald-600"
                >
                  <option value="ALL">Semua Cabang</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              )}

              <select
                value={staffPositionFilter}
                onChange={(e) => setStaffPositionFilter(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-2.5 py-2 bg-white focus:outline-none focus:border-emerald-600"
              >
                <option value="ALL">Semua Jabatan</option>
                {Object.values(StaffPosition).map((pos) => (
                  <option key={pos} value={pos}>
                    {pos}
                  </option>
                ))}
              </select>

              <select
                value={staffStatusFilter}
                onChange={(e) => setStaffStatusFilter(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-2.5 py-2 bg-white focus:outline-none focus:border-emerald-600"
              >
                <option value="ALL">Semua Status</option>
                {Object.values(EmploymentStatus).map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={() => handleOpenStaffModal()}
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-xs font-semibold shadow-sm transition-colors cursor-pointer"
              id="add-staff-button"
            >
              <UserPlus className="w-4 h-4" />
              Daftar Staff Baru
            </button>
          </div>

          {/* Staff Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600">
                  <tr>
                    <th className="px-4 py-3">Kode Staff</th>
                    <th className="px-4 py-3">Nama Lengkap</th>
                    <th className="px-4 py-3">Jabatan</th>
                    <th className="px-4 py-3">Cabang Kerja</th>
                    <th className="px-4 py-3">Tgl Masuk & Kontak</th>
                    <th className="px-4 py-3 text-center">Akun Login</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredStaff.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                        Tidak ada staff yang cocok dengan kriteria filter.
                      </td>
                    </tr>
                  ) : (
                    filteredStaff.map((s) => {
                      const br = branches.find((b) => b.id === s.branchId);

                      return (
                        <tr key={s.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-4 py-3 font-mono font-bold text-slate-800">
                            {s.employeeCode}
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-semibold text-slate-900">{s.fullName}</div>
                            {s.notes && <div className="text-[11px] text-slate-400 italic">{s.notes}</div>}
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-700">
                              {s.position}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-[11px] text-slate-700 font-medium">
                              {br?.name || "Lintas Cabang / Pusat"}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-[11px] text-slate-600">{s.joinDate || "-"}</div>
                            <div className="text-[10px] text-slate-400">{s.phone || "-"}</div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            {(() => {
                              const db = MockDatabase.getInstance();
                              const userAcc = s.userAccountId ? db.userAccounts.find((a) => a.id === s.userAccountId) : null;
                              if (userAcc) {
                                return (
                                  <button
                                    onClick={() => handleOpenStaffModal(s)}
                                    title={`Akun terhubung: ${userAcc.email || userAcc.username} (${userAcc.role}). Klik untuk mengedit akun login.`}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 transition-colors cursor-pointer"
                                  >
                                    <UserCheck className="w-3 h-3 text-emerald-600" />
                                    <span>{userAcc.role}</span>
                                  </button>
                                );
                              }
                              return (
                                <button
                                  onClick={() => handleOpenStaffModal(s, true)}
                                  title="Staff belum memiliki akun login. Klik untuk membuatkan akun sekarang."
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 transition-colors cursor-pointer"
                                >
                                  <KeyRound className="w-3 h-3 text-amber-600" />
                                  <span>+ Buat Akun</span>
                                </button>
                              );
                            })()}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button
                              onClick={() => handleToggleStaffStatus(s)}
                              title={`Ubah status ${s.fullName} menjadi ${s.active ? "Nonaktif" : "Aktif"}`}
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold cursor-pointer transition-colors ${
                                s.active
                                  ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                                  : "bg-slate-200 text-slate-700 hover:bg-slate-300"
                              }`}
                            >
                              {s.active ? "Aktif" : "Nonaktif"}
                            </button>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handleOpenStaffModal(s)}
                                title="Edit Data Staff"
                                className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setStaffToDelete(s)}
                                title={`Hapus Staff ${s.fullName} dari Database`}
                                className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-md transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
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

      {/* =========================================================================
          TAB 3 CONTENT: JADWAL DOKTER MULTI-CABANG (Timetable & List Views)
      ========================================================================= */}
      {activeTab === "schedules" && (
        <div className="space-y-4" id="schedules-tab-content">
          {/* View Mode Toggle Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200/90 shadow-xs">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-emerald-50 text-emerald-700 rounded-xl">
                <CalendarRange className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  {scheduleViewMode === "timetable" ? "Papan Jadwal Dokter (Drag & Drop)" : "Daftar Jadwal Dokter"}
                </h2>
                <p className="text-[11px] text-slate-500">
                  {scheduleViewMode === "timetable"
                    ? "Tampilan kolom mingguan seperti jadwal pelajaran dengan sistem drag & drop instan"
                    : "Tampilan tabel daftar riwayat dan filter tanggal jadwal praktek dokter"}
                </p>
              </div>
            </div>

            {/* Segmented View Switcher */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setScheduleViewMode("timetable")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  scheduleViewMode === "timetable"
                    ? "bg-white text-emerald-700 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>Jadwal Kolom (Drag &amp; Drop)</span>
              </button>
              <button
                type="button"
                onClick={() => setScheduleViewMode("list")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  scheduleViewMode === "list"
                    ? "bg-white text-emerald-700 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <List className="w-3.5 h-3.5" />
                <span>Tabel Daftar</span>
              </button>
            </div>
          </div>

          {/* 1. TIMETABLE BOARD VIEW */}
          {scheduleViewMode === "timetable" && (
            <DoctorTimetableBoard
              doctors={doctors}
              branches={branches}
              schedules={doctorSchedules}
              currentUser={currentUser}
              selectedBranchId={userBranchId || (scheduleBranchFilter !== "ALL" ? scheduleBranchFilter : null)}
              onScheduleCreate={handleTimetableScheduleCreate}
              onScheduleUpdate={handleTimetableScheduleUpdate}
              onScheduleCancel={handleCancelSchedule}
              onOpenCreateModal={(defaults) => {
                const activeDoc = doctors.find((d) => d.active ?? d.isActive ?? true);
                setScheduleForm({
                  doctorId: defaults?.doctorId || activeDoc?.id || "",
                  branchId: defaults?.branchId || userBranchId || branches[0]?.id || "branch-gebang",
                  date: defaults?.date || new Date().toISOString().split("T")[0],
                  startTime: defaults?.startTime || "08:00",
                  endTime: defaults?.endTime || "14:00",
                  notes: ""
                });
                setIsScheduleModalOpen(true);
              }}
              onOpenPosterModal={isSuper ? () => setIsPosterModalOpen(true) : undefined}
            />
          )}

          {/* 2. TRADITIONAL LIST VIEW */}
          {scheduleViewMode === "list" && (
            <div className="space-y-4 animate-in fade-in">
              {/* Controls Bar */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <input
                      type="date"
                      value={scheduleDateFilter}
                      onChange={(e) => setScheduleDateFilter(e.target.value)}
                      className="text-xs border border-slate-200 rounded-lg px-2.5 py-2 bg-white focus:outline-none focus:border-emerald-600"
                    />
                  </div>

                  {isSuper && (
                    <select
                      value={scheduleBranchFilter}
                      onChange={(e) => setScheduleBranchFilter(e.target.value)}
                      className="text-xs border border-slate-200 rounded-lg px-2.5 py-2 bg-white focus:outline-none focus:border-emerald-600"
                    >
                      <option value="ALL">Semua Cabang</option>
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  )}

                  <select
                    value={scheduleDoctorFilter}
                    onChange={(e) => setScheduleDoctorFilter(e.target.value)}
                    className="text-xs border border-slate-200 rounded-lg px-2.5 py-2 bg-white focus:outline-none focus:border-emerald-600"
                  >
                    <option value="ALL">Semua Dokter</option>
                    {doctors.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name || d.fullName}
                      </option>
                    ))}
                  </select>

                  <select
                    value={scheduleStatusFilter}
                    onChange={(e) => setScheduleStatusFilter(e.target.value)}
                    className="text-xs border border-slate-200 rounded-lg px-2.5 py-2 bg-white focus:outline-none focus:border-emerald-600"
                  >
                    <option value="ALL">Semua Status</option>
                    <option value={ScheduleStatus.ACTIVE}>Aktif</option>
                    <option value={ScheduleStatus.CANCELLED}>Dibatalkan</option>
                  </select>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto">
                  {isSuper && (
                    <button
                      onClick={() => setIsPosterModalOpen(true)}
                      className="w-full sm:w-auto flex items-center justify-center gap-2 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white px-4 py-2 rounded-lg text-xs font-semibold shadow-sm transition-all cursor-pointer"
                      id="btn-poster-jadwal"
                    >
                      <ImageIcon className="w-4 h-4" />
                      Poster Jadwal Dokter
                    </button>
                  )}

                  <button
                    onClick={() => {
                      const activeDoc = doctors.find((d) => d.active ?? d.isActive ?? true);
                      setScheduleForm({
                        doctorId: activeDoc?.id || "",
                        branchId: userBranchId || branches[0]?.id || "branch-gebang",
                        date: scheduleDateFilter || new Date().toISOString().split("T")[0],
                        startTime: "08:00",
                        endTime: "14:00",
                        notes: ""
                      });
                      setIsScheduleModalOpen(true);
                    }}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-xs font-semibold shadow-sm transition-colors cursor-pointer"
                    id="add-schedule-button"
                  >
                    <Plus className="w-4 h-4" />
                    Buat Jadwal Praktek
                  </button>
                </div>
              </div>

              {/* Schedules List */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-700">
                    <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600">
                      <tr>
                        <th className="px-4 py-3">Tanggal</th>
                        <th className="px-4 py-3">Waktu Praktek</th>
                        <th className="px-4 py-3">Dokter</th>
                        <th className="px-4 py-3">Cabang Praktek</th>
                        <th className="px-4 py-3">Catatan</th>
                        <th className="px-4 py-3 text-center">Status</th>
                        <th className="px-4 py-3 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredSchedules.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                            Tidak ada jadwal dokter untuk tanggal / filter yang dipilih.
                          </td>
                        </tr>
                      ) : (
                        filteredSchedules.map((sched) => {
                          const doc = doctors.find((d) => d.id === sched.doctorId);
                          const br = branches.find((b) => b.id === sched.branchId);
                          const isCancelled = sched.status === ScheduleStatus.CANCELLED;

                          return (
                            <tr
                              key={sched.id}
                              className={`hover:bg-slate-50/80 transition-colors ${
                                isCancelled ? "bg-slate-50/50 opacity-60" : ""
                              }`}
                            >
                              <td className="px-4 py-3 font-medium text-slate-900">{sched.date}</td>
                              <td className="px-4 py-3 font-mono font-semibold text-emerald-700">
                                {sched.startTime} - {sched.endTime}
                              </td>
                              <td className="px-4 py-3">
                                <div className="font-semibold text-slate-900">{doc?.name || sched.doctorId}</div>
                                <div className="text-[11px] text-slate-400">{doc?.specialization}</div>
                              </td>
                              <td className="px-4 py-3">
                                <span className="inline-flex items-center gap-1 font-medium text-slate-800">
                                  <Building2 className="w-3 h-3 text-slate-400" />
                                  {br?.name || sched.branchId}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-slate-500">{sched.notes || "-"}</td>
                              <td className="px-4 py-3 text-center">
                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    !isCancelled
                                      ? "bg-emerald-100 text-emerald-800"
                                      : "bg-rose-100 text-rose-800 line-through"
                                  }`}
                                >
                                  {sched.status}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right">
                                {!isCancelled && (
                                  <button
                                    onClick={() => handleCancelSchedule(sched)}
                                    title="Batalkan Jadwal"
                                    className="text-rose-600 hover:text-rose-800 font-medium text-[11px] hover:underline cursor-pointer"
                                  >
                                    Batalkan
                                  </button>
                                )}
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
        </div>
      )}

      {/* =========================================================================
          TAB 4 CONTENT: SHIFT KERJA & ROSTER STAFF
      ========================================================================= */}
      {activeTab === "shifts" && (
        <div className="space-y-6" id="shifts-tab-content">
          {/* Master Shift Information Cards */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-emerald-600" />
              Master Shift Kerja Klinik Lala Dentist
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {workShifts.map((ws) => {
                const br = branches.find((b) => b.id === ws.branchId);
                return (
                  <div key={ws.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-slate-900 text-xs">{ws.name}</span>
                      <span className="font-mono text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                        {ws.startTime} - {ws.endTime}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-1">
                      <Building2 className="w-3 h-3 text-slate-400" />
                      {br?.name || ws.branchId}
                    </div>
                    {ws.notes && <div className="text-[10px] text-slate-400 italic mt-1">{ws.notes}</div>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Roster Controls */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <input
                  type="date"
                  value={shiftDateFilter}
                  onChange={(e) => setShiftDateFilter(e.target.value)}
                  className="text-xs border border-slate-200 rounded-lg px-2.5 py-2 bg-white focus:outline-none focus:border-emerald-600"
                />
              </div>

              {isSuper && (
                <select
                  value={shiftBranchFilter}
                  onChange={(e) => setShiftBranchFilter(e.target.value)}
                  className="text-xs border border-slate-200 rounded-lg px-2.5 py-2 bg-white focus:outline-none focus:border-emerald-600"
                >
                  <option value="ALL">Semua Cabang</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <button
              onClick={() => {
                const activeStaff = staff.find((s) => s.active);
                setAssignShiftForm({
                  staffId: activeStaff?.id || "",
                  branchId: userBranchId || branches[0]?.id || "branch-gebang",
                  shiftId: workShifts[0]?.id || "",
                  date: shiftDateFilter || new Date().toISOString().split("T")[0],
                  notes: ""
                });
                setIsAssignShiftModalOpen(true);
              }}
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-xs font-semibold shadow-sm transition-colors"
              id="assign-shift-button"
            >
              <Plus className="w-4 h-4" />
              Tugaskan Shift ke Staff
            </button>
          </div>

          {/* Shift Assignments Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600">
                  <tr>
                    <th className="px-4 py-3">Tanggal</th>
                    <th className="px-4 py-3">Nama Staff</th>
                    <th className="px-4 py-3">Jabatan</th>
                    <th className="px-4 py-3">Shift Ditugaskan</th>
                    <th className="px-4 py-3">Cabang</th>
                    <th className="px-4 py-3">Catatan</th>
                    <th className="px-4 py-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredShiftAssignments.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                        Tidak ada penugasan shift pada tanggal / filter ini.
                      </td>
                    </tr>
                  ) : (
                    filteredShiftAssignments.map((a) => {
                      const st = staff.find((s) => s.id === a.staffId);
                      const ws = workShifts.find((w) => w.id === a.shiftId);
                      const br = branches.find((b) => b.id === a.branchId);

                      return (
                        <tr key={a.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-4 py-3 font-medium text-slate-900">{a.date}</td>
                          <td className="px-4 py-3">
                            <div className="font-semibold text-slate-900">{st?.fullName || a.staffId}</div>
                            <div className="text-[10px] font-mono text-slate-400">{st?.employeeCode}</div>
                          </td>
                          <td className="px-4 py-3 text-slate-600">{st?.position}</td>
                          <td className="px-4 py-3">
                            <span className="font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded text-[11px] border border-emerald-200">
                              {ws?.name} ({ws?.startTime} - {ws?.endTime})
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-700">{br?.name || a.branchId}</td>
                          <td className="px-4 py-3 text-slate-400">{a.notes || "-"}</td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => handleRemoveShiftAssignment(a.id)}
                              className="text-rose-600 hover:text-rose-800 font-medium text-[11px] hover:underline"
                            >
                              Hapus
                            </button>
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

      {/* =========================================================================
          TAB 5 CONTENT: ABSENSI & KEHADIRAN (SSOT)
      ========================================================================= */}
      {activeTab === "attendance" && (
        <AttendanceManager />
      )}

      {/* =========================================================================
          TAB 6 CONTENT: OVERTIME ENGINE & APPROVAL (HR-3)
      ========================================================================= */}
      {activeTab === "overtime" && (
        <OvertimeManager />
      )}

      {/* =========================================================================
          MODALS
      ========================================================================= */}

      {/* 1. Modal Tambah / Edit Dokter */}
      {isDoctorModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 border border-slate-200 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-sm">
                {editingDoctor ? "Edit Data Dokter" : "Tambah Dokter Baru"}
              </h3>
              <button onClick={() => setIsDoctorModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveDoctor} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-600 font-semibold mb-1">Kode Dokter *</label>
                <input
                  type="text"
                  required
                  value={doctorForm.doctorCode}
                  onChange={(e) => setDoctorForm({ ...doctorForm, doctorCode: e.target.value })}
                  placeholder="Contoh: DOC-009"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">Nama Lengkap & Gelar *</label>
                <input
                  type="text"
                  required
                  value={doctorForm.name}
                  onChange={(e) => setDoctorForm({ ...doctorForm, name: e.target.value })}
                  placeholder="Contoh: drg. Syafira, Sp.KG"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">Spesialisasi</label>
                <input
                  type="text"
                  value={doctorForm.specialization}
                  onChange={(e) => setDoctorForm({ ...doctorForm, specialization: e.target.value })}
                  placeholder="Dokter Gigi Umum / Konservasi Gigi..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Nomor Telepon</label>
                  <input
                    type="text"
                    value={doctorForm.phone}
                    onChange={(e) => setDoctorForm({ ...doctorForm, phone: e.target.value })}
                    placeholder="081..."
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Email</label>
                  <input
                    type="email"
                    value={doctorForm.email}
                    onChange={(e) => setDoctorForm({ ...doctorForm, email: e.target.value })}
                    placeholder="dokter@laladentist.com"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Nomor STR</label>
                  <input
                    type="text"
                    value={doctorForm.str}
                    onChange={(e) => setDoctorForm({ ...doctorForm, str: e.target.value })}
                    placeholder="STR-..."
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Nomor SIP</label>
                  <input
                    type="text"
                    value={doctorForm.sip}
                    onChange={(e) => setDoctorForm({ ...doctorForm, sip: e.target.value })}
                    placeholder="SIP-..."
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">Cabang Penempatan Utama</label>
                <select
                  value={doctorForm.assignedBranchId}
                  onChange={(e) => setDoctorForm({ ...doctorForm, assignedBranchId: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600 bg-white"
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">Catatan</label>
                <textarea
                  rows={2}
                  value={doctorForm.notes}
                  onChange={(e) => setDoctorForm({ ...doctorForm, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
                  placeholder="Catatan tambahan..."
                />
              </div>

              {/* Bank Account Transfer Details */}
              <div className="p-3 bg-emerald-50/50 border border-emerald-100 rounded-xl space-y-2.5">
                <div className="font-bold text-slate-800 text-[11px] flex items-center gap-1.5 text-emerald-900">
                  <span>Informasi Rekening Bank (Slip Gaji & Transfer)</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1 text-[10px]">Nama Bank</label>
                    <input
                      type="text"
                      value={doctorForm.bankName}
                      onChange={(e) => setDoctorForm({ ...doctorForm, bankName: e.target.value })}
                      placeholder="BCA / Mandiri / BRI..."
                      className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1 text-[10px]">Nomor Rekening</label>
                    <input
                      type="text"
                      value={doctorForm.bankAccountNumber}
                      onChange={(e) => setDoctorForm({ ...doctorForm, bankAccountNumber: e.target.value })}
                      placeholder="8830123456"
                      className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600 bg-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1 text-[10px]">Atas Nama (A.N.)</label>
                    <input
                      type="text"
                      value={doctorForm.bankAccountHolder}
                      onChange={(e) => setDoctorForm({ ...doctorForm, bankAccountHolder: e.target.value })}
                      placeholder="drg. Syafira"
                      className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600 bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* Login Account Details for Doctor */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-amber-600" />
                    <span className="font-bold text-slate-800 text-xs">Akun Login Dokter (Akses Web Poli)</span>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={doctorForm.createLoginAccount}
                      onChange={(e) => setDoctorForm({ ...doctorForm, createLoginAccount: e.target.checked })}
                      className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                    />
                    <span className="text-xs font-semibold text-slate-700">Aktifkan Akun Login</span>
                  </label>
                </div>

                {doctorForm.createLoginAccount ? (
                  <div className="space-y-3 pt-2.5 border-t border-slate-200 animate-in fade-in">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-slate-600 font-semibold mb-1 text-[11px]">
                          Alamat Email Login *
                        </label>
                        <input
                          type="email"
                          required={doctorForm.createLoginAccount}
                          value={doctorForm.accountEmail}
                          onChange={(e) => setDoctorForm({ ...doctorForm, accountEmail: e.target.value })}
                          placeholder="dokter@laladentist.com"
                          className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600 bg-white text-xs font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-600 font-semibold mb-1 text-[11px]">
                          Password Login *
                        </label>
                        <input
                          type="password"
                          required={doctorForm.createLoginAccount}
                          value={doctorForm.accountPassword}
                          onChange={(e) => setDoctorForm({ ...doctorForm, accountPassword: e.target.value })}
                          placeholder="Min. 6 karakter"
                          className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600 bg-white text-xs font-mono"
                        />
                      </div>
                    </div>
                    <div className="p-2.5 bg-amber-50/80 border border-amber-200/80 rounded-lg text-[11px] text-amber-900 flex items-start gap-2">
                      <Lock className="w-3.5 h-3.5 text-amber-700 shrink-0 mt-0.5" />
                      <div className="leading-relaxed">
                        Akun ini dapat digunakan oleh Dokter untuk login di <strong>/login</strong> menggunakan Email & Password di atas untuk mengisi Rekam Medis & Odontogram pasien.
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-500 italic">
                    Centang opsi di atas jika dokter membutuhkan akses Web Admin / Rekam Medis.
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100">
                {isSuper && editingDoctor ? (
                  <button
                    type="button"
                    onClick={() => {
                      setDoctorToDelete(editingDoctor);
                    }}
                    className="px-3.5 py-2 text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Hapus Dokter</span>
                  </button>
                ) : <div />}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsDoctorModalOpen(false)}
                    className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 font-medium"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold"
                  >
                    {isSubmitting ? "Menyimpan..." : "Simpan Data Dokter"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Modal Atur Penugasan Multi-Cabang Dokter */}
      {isAssignBranchModalOpen && selectedDoctorForAssign && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 border border-slate-200 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Penugasan Cabang Dokter</h3>
                <p className="text-xs text-slate-500">{selectedDoctorForAssign.name}</p>
              </div>
              <button onClick={() => setIsAssignBranchModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveBranchAssignment} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-600 font-semibold mb-1">Pilih Cabang Penugasan *</label>
                <select
                  value={assignBranchForm.branchId}
                  onChange={(e) => setAssignBranchForm({ ...assignBranchForm, branchId: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600 bg-white"
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">Tanggal Mulai Penugasan *</label>
                <input
                  type="date"
                  required
                  value={assignBranchForm.startDate}
                  onChange={(e) => setAssignBranchForm({ ...assignBranchForm, startDate: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">Tanggal Berakhir (Opsional)</label>
                <input
                  type="date"
                  value={assignBranchForm.endDate}
                  onChange={(e) => setAssignBranchForm({ ...assignBranchForm, endDate: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">Catatan Penugasan</label>
                <input
                  type="text"
                  value={assignBranchForm.notes}
                  onChange={(e) => setAssignBranchForm({ ...assignBranchForm, notes: e.target.value })}
                  placeholder="Contoh: Jadwal praktek hari Selasa & Kamis"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAssignBranchModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 font-medium"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold"
                >
                  {isSubmitting ? "Menyimpan..." : "Simpan Penugasan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. Modal Tambah / Edit Staff */}
      {isStaffModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 border border-slate-200 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-sm">
                {editingStaff ? "Edit Data Staff" : "Daftar Staff Baru"}
              </h3>
              <button onClick={() => setIsStaffModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveStaff} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Kode Staff (NIK) *</label>
                  <input
                    type="text"
                    required
                    value={staffForm.employeeCode}
                    onChange={(e) => setStaffForm({ ...staffForm, employeeCode: e.target.value })}
                    placeholder="STF-010"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Status Kepegawaian</label>
                  <select
                    value={staffForm.employmentStatus}
                    onChange={(e) =>
                      setStaffForm({ ...staffForm, employmentStatus: e.target.value as EmploymentStatus })
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600 bg-white"
                  >
                    {Object.values(EmploymentStatus).map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">Nama Lengkap Staff *</label>
                <input
                  type="text"
                  required
                  value={staffForm.fullName}
                  onChange={(e) => setStaffForm({ ...staffForm, fullName: e.target.value })}
                  placeholder="Nama lengkap..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Jabatan / Peran *</label>
                  <select
                    value={staffForm.position}
                    onChange={(e) => setStaffForm({ ...staffForm, position: e.target.value as StaffPosition })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600 bg-white"
                  >
                    {Object.values(StaffPosition).map((pos) => (
                      <option key={pos} value={pos}>
                        {pos}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Cabang Penempatan</label>
                  <select
                    value={staffForm.branchId}
                    onChange={(e) => setStaffForm({ ...staffForm, branchId: e.target.value })}
                    disabled={currentUser?.role === UserRole.BRANCH_ADMIN}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600 bg-white disabled:bg-slate-100"
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Nomor Telepon</label>
                  <input
                    type="text"
                    value={staffForm.phone}
                    onChange={(e) => setStaffForm({ ...staffForm, phone: e.target.value })}
                    placeholder="081..."
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Tanggal Mulai Bekerja</label>
                  <input
                    type="date"
                    value={staffForm.joinDate}
                    onChange={(e) => setStaffForm({ ...staffForm, joinDate: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">Catatan</label>
                <textarea
                  rows={2}
                  value={staffForm.notes}
                  onChange={(e) => setStaffForm({ ...staffForm, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
                  placeholder="Catatan tambahan..."
                />
              </div>

              {/* Bank Account Transfer Details */}
              <div className="p-3 bg-emerald-50/50 border border-emerald-100 rounded-xl space-y-2.5">
                <div className="font-bold text-slate-800 text-[11px] flex items-center gap-1.5 text-emerald-900">
                  <span>Informasi Rekening Bank (Slip Gaji & Transfer)</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1 text-[10px]">Nama Bank</label>
                    <input
                      type="text"
                      value={staffForm.bankName}
                      onChange={(e) => setStaffForm({ ...staffForm, bankName: e.target.value })}
                      placeholder="BCA / Mandiri / BRI..."
                      className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1 text-[10px]">Nomor Rekening</label>
                    <input
                      type="text"
                      value={staffForm.bankAccountNumber}
                      onChange={(e) => setStaffForm({ ...staffForm, bankAccountNumber: e.target.value })}
                      placeholder="5420987654"
                      className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600 bg-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1 text-[10px]">Atas Nama (A.N.)</label>
                    <input
                      type="text"
                      value={staffForm.bankAccountHolder}
                      onChange={(e) => setStaffForm({ ...staffForm, bankAccountHolder: e.target.value })}
                      placeholder="Claryssa"
                      className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600 bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* Section Akun Login Sistem (User Account) */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-amber-600" />
                    <span className="font-bold text-slate-800 text-xs">Akun Login Sistem (Akses Web Admin)</span>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={staffForm.createLoginAccount}
                      onChange={(e) => setStaffForm({ ...staffForm, createLoginAccount: e.target.checked })}
                      className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                    />
                    <span className="text-xs font-semibold text-slate-700">Aktifkan Akun Login</span>
                  </label>
                </div>

                {staffForm.createLoginAccount ? (
                  <div className="space-y-3 pt-2.5 border-t border-slate-200 animate-in fade-in">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div>
                        <label className="block text-slate-600 font-semibold mb-1 text-[11px]">
                          Alamat Email Login *
                        </label>
                        <input
                          type="email"
                          required={staffForm.createLoginAccount}
                          value={staffForm.accountEmail}
                          onChange={(e) => setStaffForm({ ...staffForm, accountEmail: e.target.value })}
                          placeholder="nama@laladentist.com"
                          className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600 bg-white text-xs font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-600 font-semibold mb-1 text-[11px]">
                          Password Login *
                        </label>
                        <input
                          type="password"
                          required={staffForm.createLoginAccount}
                          value={staffForm.accountPassword}
                          onChange={(e) => setStaffForm({ ...staffForm, accountPassword: e.target.value })}
                          placeholder="Min. 6 karakter"
                          className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600 bg-white text-xs font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-600 font-semibold mb-1 text-[11px]">
                          Hak Akses / Peran (Role) *
                        </label>
                        <select
                          value={staffForm.accountRole}
                          onChange={(e) => setStaffForm({ ...staffForm, accountRole: e.target.value as UserRole })}
                          className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600 bg-white text-xs"
                        >
                          <option value={UserRole.BRANCH_ADMIN}>Branch Admin (Admin Cabang)</option>
                          <option value={UserRole.DOCTOR_ASSISTANT}>Doctor Assistant (Perawat / Asisten Poli)</option>
                          <option value={UserRole.DOCTOR}>Doctor (Dokter Gigi)</option>
                          <option value={UserRole.SUPER_ADMIN}>Super Admin (Pemilik / Manajemen Pusat)</option>
                        </select>
                      </div>
                    </div>
                    <div className="p-2.5 bg-amber-50/80 border border-amber-200/80 rounded-lg text-[11px] text-amber-900 flex items-start gap-2">
                      <Lock className="w-3.5 h-3.5 text-amber-700 shrink-0 mt-0.5" />
                      <div className="leading-relaxed">
                        Akun ini tersimpan dan dapat langsung digunakan untuk login di <strong>/login</strong> dengan Email & Password di atas, atau melalui <strong>Role Switcher</strong> di pojok kanan bawah.
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-500 italic">
                    Centang opsi di atas jika staff ini membutuhkan akses komputer / Web Admin klinik.
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100">
                {editingStaff ? (
                  <button
                    type="button"
                    onClick={() => {
                      setStaffToDelete(editingStaff);
                    }}
                    className="px-3.5 py-2 text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Hapus Staff</span>
                  </button>
                ) : <div />}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsStaffModalOpen(false)}
                    className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 font-medium cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold cursor-pointer disabled:opacity-50"
                  >
                    {isSubmitting ? "Menyimpan..." : "Simpan Data Staff"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. Modal Buat Jadwal Dokter (Multi-Cabang & Conflict Detection) */}
      {isScheduleModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 border border-slate-200 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Buat Jadwal Praktek Dokter</h3>
                <p className="text-xs text-slate-500">Dilengkapi validasi bentrok jam praktek otomatis</p>
              </div>
              <button onClick={() => setIsScheduleModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveSchedule} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-600 font-semibold mb-1">Dokter *</label>
                <select
                  value={scheduleForm.doctorId}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, doctorId: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600 bg-white"
                >
                  {doctors
                    .filter((d) => d.active ?? d.isActive ?? true)
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name || d.fullName} ({d.doctorCode})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">Cabang Praktek *</label>
                <select
                  value={scheduleForm.branchId}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, branchId: e.target.value })}
                  disabled={currentUser?.role === UserRole.BRANCH_ADMIN}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600 bg-white disabled:bg-slate-100"
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">Tanggal Praktek *</label>
                <input
                  type="date"
                  required
                  value={scheduleForm.date}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, date: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Waktu Mulai *</label>
                  <input
                    type="time"
                    required
                    value={scheduleForm.startTime}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, startTime: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Waktu Selesai *</label>
                  <input
                    type="time"
                    required
                    value={scheduleForm.endTime}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, endTime: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">Catatan Jadwal</label>
                <input
                  type="text"
                  value={scheduleForm.notes}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, notes: e.target.value })}
                  placeholder="Contoh: Poli Konservasi Gigi"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsScheduleModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 font-medium"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold"
                >
                  {isSubmitting ? "Validasi & Simpan..." : "Simpan Jadwal"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. Modal Penugasan Shift ke Staff */}
      {isAssignShiftModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 border border-slate-200 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Tugaskan Shift ke Staff</h3>
                <p className="text-xs text-slate-500">Pilih staff aktif dan shift kerja harian</p>
              </div>
              <button onClick={() => setIsAssignShiftModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveShiftAssignment} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-600 font-semibold mb-1">Pilih Staff *</label>
                <select
                  value={assignShiftForm.staffId}
                  onChange={(e) => setAssignShiftForm({ ...assignShiftForm, staffId: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600 bg-white"
                >
                  {staff
                    .filter((s) => s.active && s.employmentStatus !== EmploymentStatus.INACTIVE)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.fullName} ({s.position} - {s.employeeCode})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">Cabang Tugas *</label>
                <select
                  value={assignShiftForm.branchId}
                  onChange={(e) => setAssignShiftForm({ ...assignShiftForm, branchId: e.target.value })}
                  disabled={currentUser?.role === UserRole.BRANCH_ADMIN}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600 bg-white disabled:bg-slate-100"
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">Pilih Shift Kerja *</label>
                <select
                  value={assignShiftForm.shiftId}
                  onChange={(e) => setAssignShiftForm({ ...assignShiftForm, shiftId: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600 bg-white"
                >
                  {workShifts
                    .filter((w) => w.branchId === assignShiftForm.branchId)
                    .map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name} ({w.startTime} - {w.endTime})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">Tanggal Tugas *</label>
                <input
                  type="date"
                  required
                  value={assignShiftForm.date}
                  onChange={(e) => setAssignShiftForm({ ...assignShiftForm, date: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">Catatan Tambahan</label>
                <input
                  type="text"
                  value={assignShiftForm.notes}
                  onChange={(e) => setAssignShiftForm({ ...assignShiftForm, notes: e.target.value })}
                  placeholder="Contoh: Bertugas di Poli Bedah Mulut"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAssignShiftModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 font-medium"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold"
                >
                  {isSubmitting ? "Menyimpan..." : "Tugaskan Shift"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Konfirmasi Hapus Dokter */}
      {doctorToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900 text-center">
              Konfirmasi Hapus Dokter
            </h3>
            <p className="text-xs text-slate-600 text-center mt-2 leading-relaxed">
              Apakah Anda yakin ingin menghapus data dokter <strong>{doctorToDelete.name || doctorToDelete.fullName}</strong>? Seluruh penugasan cabang dan jadwal praktek dokter ini akan dihapus dari sistem. Tindakan ini tidak dapat dibatalkan.
            </p>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={isDeletingDoctor}
                onClick={() => setDoctorToDelete(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isDeletingDoctor}
                onClick={handleConfirmDeleteDoctor}
                className="px-4 py-2 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {isDeletingDoctor ? "Menghapus..." : "Ya, Hapus Dokter"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Konfirmasi Hapus Staff */}
      {staffToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900 text-center">
              Konfirmasi Hapus Staff
            </h3>
            <p className="text-xs text-slate-600 text-center mt-2 leading-relaxed">
              Apakah Anda yakin ingin menghapus data staff <strong>{staffToDelete.fullName}</strong> ({staffToDelete.employeeCode})? Data staff dan akun login terkait akan dihapus secara permanen dari sistem database. Tindakan ini tidak dapat dibatalkan.
            </p>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={isDeletingStaff}
                onClick={() => setStaffToDelete(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isDeletingStaff}
                onClick={handleConfirmDeleteStaff}
                className="px-4 py-2 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {isDeletingStaff ? "Menghapus..." : "Ya, Hapus Staff"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Konfirmasi Batalkan Jadwal Dokter */}
      {scheduleToCancel && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900 text-center">
              Batalkan Jadwal Praktek
            </h3>
            <p className="text-xs text-slate-600 text-center mt-2 leading-relaxed">
              Batalkan jadwal praktek dokter{" "}
              <strong>{doctors.find((d) => d.id === scheduleToCancel.doctorId)?.name || "Dokter"}</strong>{" "}
              pada tanggal <strong>{scheduleToCancel.date}</strong> ({scheduleToCancel.startTime} - {scheduleToCancel.endTime})?
            </p>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={isCancellingSchedule}
                onClick={() => setScheduleToCancel(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Kembali
              </button>
              <button
                type="button"
                disabled={isCancellingSchedule}
                onClick={handleConfirmCancelSchedule}
                className="px-4 py-2 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {isCancellingSchedule ? "Membatalkan..." : "Ya, Batalkan Jadwal"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Konfirmasi Hapus Penugasan Shift */}
      {assignmentToRemove && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900 text-center">
              Hapus Penugasan Shift
            </h3>
            <p className="text-xs text-slate-600 text-center mt-2 leading-relaxed">
              Apakah Anda yakin ingin menghapus penugasan shift staff{" "}
              <strong>{staff.find((s) => s.id === assignmentToRemove.staffId)?.fullName || "Staff"}</strong>{" "}
              pada tanggal <strong>{assignmentToRemove.date}</strong>?
            </p>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={isRemovingAssignment}
                onClick={() => setAssignmentToRemove(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isRemovingAssignment}
                onClick={handleConfirmRemoveAssignment}
                className="px-4 py-2 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {isRemovingAssignment ? "Menghapus..." : "Ya, Hapus Shift"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Doctor Schedule Multi-Branch Poster Modal */}
      <DoctorSchedulePosterModal
        isOpen={isPosterModalOpen}
        onClose={() => setIsPosterModalOpen(false)}
      />
    </div>
  );
};
