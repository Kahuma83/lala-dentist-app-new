import React, { useState, useEffect, useMemo } from "react";
import { useApp } from "../context/AppContext";
import {
  PatientProfile,
  PatientVisit,
  VisitType,
  VisitStatus,
  UserRole,
  DentalBranch,
  Booking,
  BookingStatus,
  MedicalRecord,
  MedicalRecordStatus,
  TreatmentJob
} from "../types/domain";
import {
  Search,
  Plus,
  User,
  Phone,
  MapPin,
  Calendar,
  FileText,
  AlertTriangle,
  CheckCircle,
  Clock,
  UserPlus,
  Footprints,
  Eye,
  Edit2,
  Lock,
  ArrowRight,
  Filter,
  RefreshCw,
  X,
  Building2,
  ShieldAlert,
  Trash2,
  FileSpreadsheet,
  Download,
  Upload
} from "lucide-react";
import { formatRupiah, formatDate, formatDateTime } from "../utils/formatter";
import { PatientExcelModal } from "../components/PatientExcelModal";
import { ImportPatientExecutionResult } from "../utils/excelPatientUtils";

export const PatientManagement: React.FC = () => {
  const { currentUser, repos, branches, patients, visits, bookings, refreshData } = useApp();

  // Search and Filtering State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBranchFilter, setSelectedBranchFilter] = useState<string>("ALL");

  // Selected Patient for Detail View
  const [selectedPatient, setSelectedPatient] = useState<PatientProfile | null>(null);
  const [patientVisits, setPatientVisits] = useState<PatientVisit[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Modals visibility
  const [isAddPatientOpen, setIsAddPatientOpen] = useState(false);
  const [isEditPatientOpen, setIsEditPatientOpen] = useState(false);
  const [isWalkInOpen, setIsWalkInOpen] = useState(false);
  const [isBookingVisitOpen, setIsBookingVisitOpen] = useState(false);
  const [isExcelModalOpen, setIsExcelModalOpen] = useState(false);
  const [excelModalTab, setExcelModalTab] = useState<"export" | "import">("import");

  // Patient Form State
  const [patientForm, setPatientForm] = useState({
    id: "",
    name: "",
    medicalRecordNumber: "",
    phone: "",
    email: "",
    dateOfBirth: "1995-01-01",
    gender: "L" as "L" | "P",
    address: "",
    medicalHistoryNotes: ""
  });

  // Duplicate Warning State
  const [duplicateWarning, setDuplicateWarning] = useState<{
    byPhone: PatientProfile[];
    byRM: PatientProfile[];
    byName: PatientProfile[];
    hasDuplicates: boolean;
  } | null>(null);

  // Walk-In Registration Form State
  const [walkInForm, setWalkInForm] = useState({
    patientId: "",
    branchId: currentUser?.role === UserRole.BRANCH_ADMIN ? (currentUser.assignedBranchId || "") : (branches[0]?.id || ""),
    complaint: ""
  });

  // Walk-In Success Confirmation State
  const [walkInConfirmation, setWalkInConfirmation] = useState<{
    visit: PatientVisit;
    patient: PatientProfile;
    branchName: string;
  } | null>(null);

  // Booking Visit Registration Form State
  const [bookingVisitForm, setBookingVisitForm] = useState({
    bookingId: "",
    complaint: ""
  });

  // Medical Record Modal State
  const [selectedVisitForMR, setSelectedVisitForMR] = useState<PatientVisit | null>(null);
  const [mrModalOpen, setMrModalOpen] = useState(false);
  const [loadingMR, setLoadingMR] = useState(false);
  const [existingMR, setExistingMR] = useState<MedicalRecord | null>(null);
  const [visitTreatments, setVisitTreatments] = useState<TreatmentJob[]>([]);
  const [mrForm, setMrForm] = useState({
    chiefComplaint: "",
    anamnesis: "",
    clinicalExamination: "",
    diagnosis: "",
    treatmentPlan: "",
    doctorNotes: "",
    status: MedicalRecordStatus.DRAFT as MedicalRecordStatus | "DRAFT" | "FINAL"
  });
  const [mrError, setMrError] = useState<string | null>(null);
  const [savingMR, setSavingMR] = useState(false);
  const [showFinalConfirm, setShowFinalConfirm] = useState(false);

  // Error & UI Feedback State
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Patient Deletion State
  const [patientToDelete, setPatientToDelete] = useState<PatientProfile | null>(null);
  const [isDeletingPatient, setIsDeletingPatient] = useState(false);

  // Synchronize Walk-In Branch ID if user context changes
  useEffect(() => {
    if (currentUser?.role === UserRole.BRANCH_ADMIN && currentUser.assignedBranchId) {
      setWalkInForm((prev) => ({ ...prev, branchId: currentUser.assignedBranchId! }));
    }
  }, [currentUser]);

  // Load patient's visits when selectedPatient changes
  useEffect(() => {
    if (selectedPatient) {
      setLoadingHistory(true);
      repos.visit
        .getVisitsByPatient(selectedPatient.id)
        .then((list) => {
          setPatientVisits(list.sort((a, b) => new Date(b.visitDateTime).getTime() - new Date(a.visitDateTime).getTime()));
        })
        .finally(() => setLoadingHistory(false));
    } else {
      setPatientVisits([]);
    }
  }, [selectedPatient, visits]);

  // Filtered Patients list
  const filteredPatients = useMemo(() => {
    let list = patients;

    // Filter by branch if user explicitly selected a specific branch
    if (selectedBranchFilter !== "ALL") {
      const branchId = selectedBranchFilter;
      const branchPatientIds = new Set<string>();
      visits.filter((v) => v.branchId === branchId).forEach((v) => { if (v.patientId) branchPatientIds.add(v.patientId); });
      bookings.filter((b) => b.branchId === branchId).forEach((b) => { if (b.patientId) branchPatientIds.add(b.patientId); });
      list = list.filter((p) => branchPatientIds.has(p.id));
    }

    const q = searchQuery.trim().toLowerCase();
    if (!q) return list;

    return list.filter((p) => {
      const nameMatch = (p.name || "").toLowerCase().includes(q) || (p.fullName || "").toLowerCase().includes(q);
      const phoneMatch = (p.phone || "").toLowerCase().includes(q);
      const rmMatch = (p.medicalRecordNumber || "").toLowerCase().includes(q);
      return nameMatch || phoneMatch || rmMatch;
    });
  }, [patients, visits, bookings, searchQuery, selectedBranchFilter]);

  // Map of patient ID to visits count and branch names
  const patientVisitStats = useMemo(() => {
    const stats: Record<string, { count: number; branchNames: string[] }> = {};

    visits.forEach((v) => {
      if (!stats[v.patientId]) {
        stats[v.patientId] = { count: 0, branchNames: [] };
      }
      stats[v.patientId].count += 1;
      const bName = branches.find((b) => b.id === v.branchId)?.name;
      if (bName && !stats[v.patientId].branchNames.includes(bName)) {
        stats[v.patientId].branchNames.push(bName);
      }
    });

    return stats;
  }, [visits, branches]);

  // Helper to open Add Patient Modal
  const handleOpenAddPatient = () => {
    setPatientForm({
      id: "",
      name: "",
      medicalRecordNumber: "",
      phone: "",
      email: "",
      dateOfBirth: "1990-01-01",
      gender: "L",
      address: "",
      medicalHistoryNotes: ""
    });
    setDuplicateWarning(null);
    setFormError(null);
    setIsAddPatientOpen(true);
  };

  // Helper to open Edit Patient Modal
  const handleOpenEditPatient = (p: PatientProfile) => {
    setPatientForm({
      id: p.id,
      name: p.fullName || p.name,
      medicalRecordNumber: p.medicalRecordNumber || "",
      phone: p.phone,
      email: p.email || "",
      dateOfBirth: p.dateOfBirth,
      gender: p.gender,
      address: p.address,
      medicalHistoryNotes: p.medicalHistoryNotes || ""
    });
    setFormError(null);
    setIsEditPatientOpen(true);
  };

  // Save Patient (with Duplicate Check)
  const handleSavePatient = async (forceSave = false) => {
    setFormError(null);
    setIsSubmitting(true);

    try {
      if (!patientForm.name.trim()) {
        throw new Error("Nama pasien wajib diisi");
      }

      // If creating new and not forceSave, check duplicates
      if (!patientForm.id && !forceSave) {
        const dupResult = await repos.patient.checkDuplicates(
          patientForm.phone,
          patientForm.medicalRecordNumber,
          patientForm.name
        );

        if (dupResult.hasDuplicates) {
          setDuplicateWarning(dupResult);
          setIsSubmitting(false);
          return;
        }
      }

      const effBranchId = currentUser?.role === UserRole.BRANCH_ADMIN 
        ? (currentUser.assignedBranchId || branches[0]?.id)
        : (selectedBranchFilter !== "ALL" ? selectedBranchFilter : branches[0]?.id);

      if (patientForm.id) {
        // Update
        await repos.patient.updatePatient(
          patientForm.id,
          {
            fullName: patientForm.name,
            name: patientForm.name,
            medicalRecordNumber: patientForm.medicalRecordNumber,
            phone: patientForm.phone,
            email: patientForm.email,
            dateOfBirth: patientForm.dateOfBirth,
            gender: patientForm.gender,
            address: patientForm.address,
            medicalHistoryNotes: patientForm.medicalHistoryNotes
          },
          currentUser?.role,
          effBranchId
        );
        setFormSuccess("Data pasien berhasil diperbarui.");
      } else {
        // Create
        const newP = await repos.patient.createPatient(
          {
            fullName: patientForm.name,
            name: patientForm.name,
            medicalRecordNumber: patientForm.medicalRecordNumber || undefined,
            phone: patientForm.phone,
            email: patientForm.email,
            dateOfBirth: patientForm.dateOfBirth,
            gender: patientForm.gender,
            address: patientForm.address,
            medicalHistoryNotes: patientForm.medicalHistoryNotes,
            registeredBranchId: effBranchId || undefined
          },
          currentUser?.role,
          effBranchId
        );
        setFormSuccess(`Pasien baru berhasil didaftarkan dengan Nomor RM: ${newP.medicalRecordNumber}`);
        // Auto select new patient if Walk-In modal is pending
        if (isWalkInOpen) {
          setWalkInForm((prev) => ({ ...prev, patientId: newP.id }));
        }
      }

      await refreshData();
      setIsAddPatientOpen(false);
      setIsEditPatientOpen(false);
      setDuplicateWarning(null);
    } catch (err: any) {
      setFormError(err.message || "Gagal menyimpan data pasien.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete Individual Patient
  const handleDeletePatient = async () => {
    if (!patientToDelete) return;
    try {
      setIsDeletingPatient(true);
      await repos.patient.deletePatient(patientToDelete.id, currentUser?.role);
      if (selectedPatient?.id === patientToDelete.id) {
        setSelectedPatient(null);
      }
      setFormSuccess(`Pasien ${patientToDelete.fullName || patientToDelete.name} (${patientToDelete.medicalRecordNumber}) berhasil dihapus.`);
      setPatientToDelete(null);
      setIsEditPatientOpen(false);
      await refreshData();
    } catch (err: any) {
      setFormError(err.message || "Gagal menghapus data pasien.");
    } finally {
      setIsDeletingPatient(false);
    }
  };

  // Open Walk-In Modal for specific patient or general
  const handleOpenWalkIn = (p?: PatientProfile) => {
    setFormError(null);
    setWalkInConfirmation(null);

    const targetBranch = currentUser?.role === UserRole.BRANCH_ADMIN
      ? (currentUser.assignedBranchId || "")
      : (selectedBranchFilter !== "ALL" ? selectedBranchFilter : branches[0]?.id || "");

    setWalkInForm({
      patientId: p ? p.id : (patients[0]?.id || ""),
      branchId: targetBranch,
      complaint: ""
    });
    setIsWalkInOpen(true);
  };

  // Submit Walk-In Registration
  const handleSubmitWalkIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setIsSubmitting(true);

    try {
      if (!walkInForm.patientId) {
        throw new Error("Silakan pilih pasien terlebih dahulu.");
      }
      if (!walkInForm.branchId) {
        throw new Error("Silakan pilih cabang kunjungan.");
      }

      // Create WALK_IN Visit (bookingId MUST be null)
      const createdVisit = await repos.visit.createVisit(
        {
          patientId: walkInForm.patientId,
          branchId: walkInForm.branchId,
          visitType: VisitType.WALK_IN,
          visitStatus: VisitStatus.WAITING,
          bookingId: null, // STRICT RULE: Walk-in has null bookingId
          complaint: walkInForm.complaint,
          visitDateTime: new Date().toISOString()
        },
        currentUser?.role,
        currentUser?.assignedBranchId
      );

      // Automatically check-in visit into live queue
      await repos.queue.checkInVisitToQueue(
        createdVisit.id,
        currentUser?.role,
        currentUser?.assignedBranchId
      );

      const targetPatient = patients.find((p) => p.id === walkInForm.patientId);
      const targetBranch = branches.find((b) => b.id === walkInForm.branchId);

      await refreshData();

      if (targetPatient && targetBranch) {
        setWalkInConfirmation({
          visit: createdVisit,
          patient: targetPatient,
          branchName: targetBranch.name
        });
      }

      setFormSuccess("Pasien Walk-In berhasil didaftarkan ke antrean.");
    } catch (err: any) {
      setFormError(err.message || "Gagal mendaftarkan kunjungan Walk-In.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open Booking Visit Modal
  const handleOpenBookingVisit = () => {
    setFormError(null);
    const availableBookings = bookings.filter((b) => {
      if (currentUser?.role === UserRole.BRANCH_ADMIN && b.branchId !== currentUser.assignedBranchId) return false;
      if (b.status === BookingStatus.CANCELLED || b.status === BookingStatus.COMPLETED) return false;
      return true;
    });

    setBookingVisitForm({
      bookingId: availableBookings[0]?.id || "",
      complaint: ""
    });
    setIsBookingVisitOpen(true);
  };

  // Submit Booking Visit
  const handleSubmitBookingVisit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setIsSubmitting(true);

    try {
      if (!bookingVisitForm.bookingId) {
        throw new Error("Pilih booking referensi terlebih dahulu.");
      }

      const targetBooking = bookings.find((b) => b.id === bookingVisitForm.bookingId);
      if (!targetBooking) {
        throw new Error("Data booking tidak ditemukan.");
      }

      // Create BOOKING Visit (bookingId MUST be valid)
      const createdVisit = await repos.visit.createVisit(
        {
          patientId: targetBooking.patientId,
          branchId: targetBooking.branchId,
          visitType: VisitType.BOOKING,
          visitStatus: VisitStatus.WAITING,
          bookingId: targetBooking.id,
          complaint: bookingVisitForm.complaint || targetBooking.notes || "Kunjungan terkonfirmasi booking",
          doctorId: targetBooking.doctorId,
          visitDateTime: new Date().toISOString()
        },
        currentUser?.role,
        currentUser?.assignedBranchId
      );

      // Automatically check-in booking visit into live queue
      await repos.queue.checkInVisitToQueue(
        createdVisit.id,
        currentUser?.role,
        currentUser?.assignedBranchId,
        {
          doctorId: targetBooking.doctorId
        }
      );

      // Mark booking as COMPLETED/FULFILLED
      try {
        await repos.booking.updateBooking(
          targetBooking.id,
          { status: BookingStatus.COMPLETED },
          currentUser?.role,
          currentUser?.assignedBranchId
        );
      } catch (bErr) {
        console.warn("Update booking status on check-in note:", bErr);
      }

      await refreshData();
      setIsBookingVisitOpen(false);
      setFormSuccess("Kunjungan Booking berhasil dicatat ke antrean.");
    } catch (err: any) {
      setFormError(err.message || "Gagal mencatat kunjungan booking.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open Medical Record Modal for Visit
  const handleOpenMedicalRecord = async (v: PatientVisit) => {
    setSelectedVisitForMR(v);
    setMrModalOpen(true);
    setLoadingMR(true);
    setMrError(null);
    setShowFinalConfirm(false);

    try {
      // 1. Fetch existing Medical Record
      const mr = await repos.medicalRecord.getMedicalRecordByVisit(
        v.id,
        currentUser?.role,
        currentUser?.assignedBranchId
      );
      setExistingMR(mr);

      if (mr) {
        setMrForm({
          chiefComplaint: mr.chiefComplaint || "",
          anamnesis: mr.anamnesis || "",
          clinicalExamination: mr.clinicalExamination || "",
          diagnosis: mr.diagnosis || "",
          treatmentPlan: mr.treatmentPlan || "",
          doctorNotes: mr.doctorNotes || "",
          status: mr.status
        });
      } else {
        setMrForm({
          chiefComplaint: v.complaint || "",
          anamnesis: "",
          clinicalExamination: "",
          diagnosis: "",
          treatmentPlan: "",
          doctorNotes: "",
          status: MedicalRecordStatus.DRAFT
        });
      }

      // 2. Fetch treatments for this visit
      const tList = await repos.treatment.listTreatmentsByVisit(
        v.id,
        currentUser?.role,
        currentUser?.assignedBranchId
      );
      setVisitTreatments(tList);
    } catch (err: any) {
      setMrError(err.message || "Gagal memuat rekam medis.");
    } finally {
      setLoadingMR(false);
    }
  };

  // Save Medical Record
  const handleSaveMedicalRecord = async (overrideStatus?: MedicalRecordStatus | "DRAFT" | "FINAL") => {
    if (!selectedVisitForMR || !selectedPatient) return;

    const targetStatus = overrideStatus || mrForm.status;

    if (
      targetStatus === MedicalRecordStatus.FINAL &&
      !showFinalConfirm &&
      existingMR?.status !== MedicalRecordStatus.FINAL
    ) {
      setShowFinalConfirm(true);
      return;
    }

    setSavingMR(true);
    setMrError(null);

    try {
      if (!mrForm.chiefComplaint.trim()) {
        throw new Error("Keluhan Utama wajib diisi.");
      }
      if (!mrForm.diagnosis.trim()) {
        throw new Error("Diagnosis wajib diisi.");
      }

      const activeDoctorId = currentUser?.doctorId || selectedVisitForMR.doctorId || "doc-syafira";

      const saved = await repos.medicalRecord.createOrUpdateMedicalRecord(
        {
          visitId: selectedVisitForMR.id,
          patientId: selectedPatient.id,
          branchId: selectedVisitForMR.branchId,
          doctorId: activeDoctorId,
          chiefComplaint: mrForm.chiefComplaint,
          anamnesis: mrForm.anamnesis,
          clinicalExamination: mrForm.clinicalExamination,
          diagnosis: mrForm.diagnosis,
          treatmentPlan: mrForm.treatmentPlan,
          doctorNotes: mrForm.doctorNotes,
          status: targetStatus
        },
        currentUser?.role,
        currentUser?.assignedBranchId,
        currentUser?.id
      );

      setExistingMR(saved);
      setMrForm((prev) => ({ ...prev, status: saved.status }));
      setShowFinalConfirm(false);
      setFormSuccess(`Rekam Medis untuk Visit ${selectedVisitForMR.id} berhasil disimpan.`);
    } catch (err: any) {
      setMrError(err.message || "Gagal menyimpan rekam medis.");
    } finally {
      setSavingMR(false);
    }
  };

  return (
    <div className="space-y-6" id="patient-management-root">
      {/* Toast Feedback */}
      {formSuccess && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-xl flex items-center justify-between shadow-sm animate-fade-in">
          <div className="flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            <span className="text-xs font-semibold">{formSuccess}</span>
          </div>
          <button onClick={() => setFormSuccess(null)} className="text-emerald-500 hover:text-emerald-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-slate-800 tracking-tight">Master Pasien Global</h1>
            <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
              {currentUser?.role === UserRole.SUPER_ADMIN ? "Lintas Cabang" : "Branch Scope"}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Data identitas pasien bersifat global (1 Pasien = 1 Rekam Medis). Kunjungan terikat pada cabang operasional.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => {
              setExcelModalTab("export");
              setIsExcelModalOpen(true);
            }}
            className="inline-flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-3.5 py-2.5 rounded-xl border border-slate-200 shadow-2xs transition-all active:scale-95"
            id="btn-export-excel"
            title="Export Data Pasien ke File Excel (.xlsx)"
          >
            <Download className="w-4 h-4 text-emerald-600" /> Export Excel
          </button>

          {currentUser?.role !== UserRole.DOCTOR_ASSISTANT && (
            <button
              onClick={() => {
                setExcelModalTab("import");
                setIsExcelModalOpen(true);
              }}
              className="inline-flex items-center gap-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold px-3.5 py-2.5 rounded-xl border border-emerald-300 shadow-2xs transition-all active:scale-95"
              id="btn-import-excel"
              title="Import Data Pasien dari File Excel / CSV"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" /> Import Excel
            </button>
          )}

          <button
            onClick={() => handleOpenWalkIn()}
            className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-sm transition-all transform active:scale-95"
            id="btn-walkin-quick"
          >
            <Footprints className="w-4 h-4" /> Pasien Walk-In
          </button>

          <button
            onClick={handleOpenBookingVisit}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-sm transition-all transform active:scale-95"
            id="btn-booking-visit"
          >
            <Calendar className="w-4 h-4" /> Kunjungan Booking
          </button>

          {currentUser?.role !== UserRole.DOCTOR_ASSISTANT && currentUser?.role !== UserRole.DOCTOR && (
            <button
              onClick={handleOpenAddPatient}
              className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-sm transition-all transform active:scale-95"
              id="btn-add-patient"
            >
              <UserPlus className="w-4 h-4" /> Tambah Pasien Baru
            </button>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari berdasarkan Nama, WhatsApp, atau No. RM..."
            className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-10 pr-4 py-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            id="input-search-patient"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
          <span className="text-xs font-medium text-slate-500">
            Ditemukan: <strong className="text-slate-800">{filteredPatients.length}</strong> pasien
          </span>
          <button
            onClick={() => refreshData()}
            className="p-2 text-slate-500 hover:text-emerald-600 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors"
            title="Refresh Data"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Content Area: Patients Table & Detail Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Patient List (Spans 2 columns if selectedPatient, else 3) */}
        <div className={selectedPatient ? "lg:col-span-2 space-y-4" : "lg:col-span-3 space-y-4"}>
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse" id="table-patients">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-100 text-slate-500 font-semibold uppercase tracking-wider">
                    <th className="py-3 px-4">No. RM</th>
                    <th className="py-3 px-4">Nama Pasien</th>
                    <th className="py-3 px-4">WhatsApp / HP</th>
                    <th className="py-3 px-4">L/P & Tgl Lahir</th>
                    <th className="py-3 px-4">Kunjungan</th>
                    <th className="py-3 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredPatients.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-12 text-slate-400">
                        <User className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        <p className="font-bold text-slate-700">{patients.length === 0 ? "Belum Ada Data Pasien" : "Pasien tidak ditemukan"}</p>
                        <p className="text-[11px] text-slate-400 mt-1">
                          {patients.length === 0
                            ? "Klik tombol \"+ Tambah Pasien Baru\" di atas untuk mendaftarkan pasien pertama."
                            : "Coba gunakan kata kunci pencarian yang berbeda"}
                        </p>
                      </td>
                    </tr>
                  ) : (
                    filteredPatients.map((p) => {
                      const stats = patientVisitStats[p.id] || { count: 0, branchNames: [] };
                      const isSelected = selectedPatient?.id === p.id;

                      return (
                        <tr
                          key={p.id}
                          className={`hover:bg-slate-50/70 transition-colors ${
                            isSelected ? "bg-emerald-50/50 font-medium" : ""
                          }`}
                        >
                          <td className="py-3.5 px-4 font-mono font-bold text-slate-700">
                            {p.medicalRecordNumber || "RM-000000"}
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-slate-800">{p.fullName || p.name}</div>
                            <div className="text-[10px] text-slate-400 line-clamp-1">{p.address}</div>
                          </td>
                          <td className="py-3.5 px-4 text-slate-600 font-mono">
                            {p.phone ? (
                              <span className="flex items-center gap-1">
                                <Phone className="w-3 h-3 text-slate-400" /> {p.phone}
                              </span>
                            ) : (
                              "-"
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-slate-600">
                            <span className="font-semibold text-slate-700">{p.gender === "L" ? "Laki-laki" : "Perempuan"}</span>
                            <div className="text-[10px] text-slate-400">{p.dateOfBirth}</div>
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 font-bold px-2 py-0.5 rounded text-[10px]">
                              {stats.count} Visit
                            </span>
                            {stats.branchNames.length > 0 && (
                              <div className="text-[10px] text-slate-400 truncate max-w-[120px]" title={stats.branchNames.join(", ")}>
                                {stats.branchNames.join(", ")}
                              </div>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => setSelectedPatient(p)}
                                className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors flex items-center gap-1 ${
                                  isSelected
                                    ? "bg-emerald-600 text-white"
                                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                                }`}
                                title="Lihat Detail & History"
                              >
                                <Eye className="w-3 h-3" /> Detail
                              </button>
                              <button
                                onClick={() => handleOpenWalkIn(p)}
                                className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded text-[11px] font-semibold transition-colors flex items-center gap-1"
                                title="Registrasi Walk-In"
                              >
                                <Footprints className="w-3 h-3" /> Walk-In
                              </button>
                              {currentUser?.role !== UserRole.DOCTOR_ASSISTANT && currentUser?.role !== UserRole.DOCTOR && (
                                <button
                                  onClick={() => handleOpenEditPatient(p)}
                                  className="p-1 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-100 transition-colors"
                                  title="Edit Pasien"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {(currentUser?.role === UserRole.SUPER_ADMIN || currentUser?.role === UserRole.BRANCH_ADMIN) && (
                                <button
                                  onClick={() => setPatientToDelete(p)}
                                  className="p-1 text-rose-400 hover:text-rose-600 rounded hover:bg-rose-50 transition-colors"
                                  title="Hapus Pasien"
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

        {/* Patient Detail & History Panel */}
        {selectedPatient && (
          <div className="lg:col-span-1 space-y-4 bg-white p-5 rounded-xl border border-slate-100 shadow-sm self-start animate-fade-in" id="panel-patient-detail">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <span className="text-[10px] font-mono font-bold text-emerald-600 uppercase tracking-wider block">
                  {selectedPatient.medicalRecordNumber}
                </span>
                <h2 className="text-sm font-bold text-slate-800">{selectedPatient.fullName || selectedPatient.name}</h2>
              </div>
              <button
                onClick={() => setSelectedPatient(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Profile Information */}
            <div className="space-y-2.5 text-xs">
              <div className="flex items-start gap-2.5 text-slate-600">
                <Phone className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
                <div>
                  <span className="text-[10px] text-slate-400 block">WhatsApp / No. Telp</span>
                  <span className="font-mono font-semibold text-slate-700">{selectedPatient.phone || "Tidak diisi"}</span>
                </div>
              </div>

              <div className="flex items-start gap-2.5 text-slate-600">
                <User className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
                <div>
                  <span className="text-[10px] text-slate-400 block">Gender & Tanggal Lahir</span>
                  <span className="font-semibold text-slate-700">
                    {selectedPatient.gender === "L" ? "Laki-laki" : "Perempuan"} ({selectedPatient.dateOfBirth})
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-2.5 text-slate-600">
                <MapPin className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
                <div>
                  <span className="text-[10px] text-slate-400 block">Alamat Tinggal</span>
                  <span className="text-slate-700">{selectedPatient.address || "-"}</span>
                </div>
              </div>

              {selectedPatient.medicalHistoryNotes && (
                <div className="bg-rose-50 border border-rose-100 p-3 rounded-lg text-rose-800">
                  <span className="font-bold flex items-center gap-1 text-[11px] mb-0.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-500" /> Catatan Riwayat Medis / Alergi:
                  </span>
                  <p className="text-[11px] leading-relaxed">{selectedPatient.medicalHistoryNotes}</p>
                </div>
              )}
            </div>

            {/* Visit History Header */}
            <div className="pt-3 border-t border-slate-100">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-emerald-600" /> Riwayat Kunjungan ({patientVisits.length})
                </h3>
                <button
                  onClick={() => handleOpenWalkIn(selectedPatient)}
                  className="text-[11px] font-bold text-amber-600 hover:text-amber-700 flex items-center gap-1"
                >
                  + Walk-In
                </button>
              </div>

              {loadingHistory ? (
                <div className="text-center py-6 text-slate-400 text-xs">
                  <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-1 text-emerald-600" />
                  Memuat riwayat...
                </div>
              ) : patientVisits.length === 0 ? (
                <div className="bg-slate-50 border border-slate-100 rounded-lg p-4 text-center text-slate-400 text-xs">
                  Belum ada riwayat kunjungan dicatat untuk pasien ini.
                </div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1" id="list-visit-history">
                  {patientVisits.map((v) => {
                    const bName = branches.find((b) => b.id === v.branchId)?.name || v.branchId;

                    return (
                      <div key={v.id} className="p-3 bg-slate-50 rounded-lg border border-slate-100 text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-800 flex items-center gap-1">
                            <Building2 className="w-3 h-3 text-slate-400" /> {bName}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                              v.visitType === VisitType.WALK_IN
                                ? "bg-amber-100 text-amber-800 border border-amber-200"
                                : "bg-blue-100 text-blue-800 border border-blue-200"
                            }`}
                          >
                            {v.visitType}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-[11px] text-slate-500">
                          <span>{formatDateTime(v.visitDateTime)}</span>
                          <span className="font-semibold text-slate-600">{v.visitStatus}</span>
                        </div>

                        {v.complaint && (
                          <p className="text-[10px] text-slate-500 bg-white p-1.5 rounded border border-slate-100 italic">
                            "{v.complaint}"
                          </p>
                        )}

                        {v.bookingId && (
                          <div className="text-[9px] text-blue-600 font-mono">Ref Booking: {v.bookingId}</div>
                        )}

                        <div className="pt-1.5 flex items-center justify-end">
                          <button
                            onClick={() => handleOpenMedicalRecord(v)}
                            className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded text-[11px] font-bold flex items-center gap-1 transition-colors"
                          >
                            <FileText className="w-3 h-3" /> Rekam Medis
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ========================================== */}
      {/* MODAL 1: ADD / EDIT PATIENT MODAL          */}
      {/* ========================================== */}
      {(isAddPatientOpen || isEditPatientOpen) && (
        <div className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-2xl max-w-md w-full p-6 space-y-4 animate-scale-in">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-emerald-600" />
                {patientForm.id ? "Edit Data Pasien" : "Pendaftaran Master Pasien Baru"}
              </h2>
              <button
                onClick={() => {
                  setIsAddPatientOpen(false);
                  setIsEditPatientOpen(false);
                  setDuplicateWarning(null);
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Error Message */}
            {formError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            {/* Duplicate Warning Dialog */}
            {duplicateWarning && (
              <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl text-xs space-y-3">
                <div className="flex items-center gap-2 font-bold text-amber-800">
                  <ShieldAlert className="w-4 h-4 text-amber-600 flex-shrink-0" />
                  <span>Peringatan Duplikasi Pasien Terdeteksi</span>
                </div>
                <p className="text-amber-700 leading-relaxed">
                  Sistem menemukan pasien terdaftar yang mirip berdasarkan Nomor WhatsApp, RM, atau Nama:
                </p>

                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {[...duplicateWarning.byPhone, ...duplicateWarning.byRM, ...duplicateWarning.byName].map((dup) => (
                    <div key={dup.id} className="bg-white p-2.5 rounded border border-amber-200 flex items-center justify-between">
                      <div>
                        <div className="font-bold text-slate-800">{dup.fullName || dup.name}</div>
                        <div className="text-[10px] text-slate-500 font-mono">RM: {dup.medicalRecordNumber} | WA: {dup.phone}</div>
                      </div>
                      <button
                        onClick={() => {
                          setSelectedPatient(dup);
                          setIsAddPatientOpen(false);
                          setDuplicateWarning(null);
                        }}
                        className="px-2 py-1 bg-amber-600 text-white font-bold text-[10px] rounded hover:bg-amber-700"
                      >
                        Pilih Pasien
                      </button>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setDuplicateWarning(null)}
                    className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded text-xs font-semibold"
                  >
                    Batal / Edit Form
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSavePatient(true)}
                    className="px-3 py-1.5 bg-amber-600 text-white rounded text-xs font-bold hover:bg-amber-700"
                  >
                    Tetap Buat Pasien Baru
                  </button>
                </div>
              </div>
            )}

            {/* Patient Form */}
            {!duplicateWarning && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSavePatient(false);
                }}
                className="space-y-3 text-xs"
              >
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Nama Lengkap Pasien <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={patientForm.name}
                    onChange={(e) => setPatientForm({ ...patientForm, name: e.target.value })}
                    placeholder="Contoh: Budi Santoso"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    id="input-patient-name"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Nomor RM (Opsional)</label>
                    <input
                      type="text"
                      value={patientForm.medicalRecordNumber}
                      onChange={(e) => setPatientForm({ ...patientForm, medicalRecordNumber: e.target.value })}
                      placeholder="Auto jika kosong"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                      id="input-patient-rm"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">WhatsApp / No. HP</label>
                    <input
                      type="text"
                      value={patientForm.phone}
                      onChange={(e) => setPatientForm({ ...patientForm, phone: e.target.value })}
                      placeholder="08123456789"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                      id="input-patient-phone"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Jenis Kelamin</label>
                    <select
                      value={patientForm.gender}
                      onChange={(e) => setPatientForm({ ...patientForm, gender: e.target.value as "L" | "P" })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    >
                      <option value="L">Laki-laki (L)</option>
                      <option value="P">Perempuan (P)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Tanggal Lahir</label>
                    <input
                      type="date"
                      value={patientForm.dateOfBirth}
                      onChange={(e) => setPatientForm({ ...patientForm, dateOfBirth: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Alamat Lengkap</label>
                  <textarea
                    rows={2}
                    value={patientForm.address}
                    onChange={(e) => setPatientForm({ ...patientForm, address: e.target.value })}
                    placeholder="Alamat tempat tinggal pasien..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Catatan Riwayat Medis / Alergi</label>
                  <input
                    type="text"
                    value={patientForm.medicalHistoryNotes}
                    onChange={(e) => setPatientForm({ ...patientForm, medicalHistoryNotes: e.target.value })}
                    placeholder="Alergi penicillin, hipertensi, dll..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                  {patientForm.id && (currentUser?.role === UserRole.SUPER_ADMIN || currentUser?.role === UserRole.BRANCH_ADMIN) ? (
                    <button
                      type="button"
                      onClick={() => {
                        const target = patients.find((p) => p.id === patientForm.id);
                        if (target) {
                          setPatientToDelete(target);
                        }
                      }}
                      className="px-3 py-2 text-rose-600 hover:bg-rose-50 rounded-lg font-bold text-xs transition-colors inline-flex items-center gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Hapus Pasien
                    </button>
                  ) : (
                    <div />
                  )}

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddPatientOpen(false);
                        setIsEditPatientOpen(false);
                      }}
                      className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-semibold text-xs"
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs transition-all disabled:opacity-50"
                    >
                      {isSubmitting ? "Menyimpan..." : "Simpan Pasien"}
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* MODAL 2: WALK-IN REGISTRATION MODAL        */}
      {/* ========================================== */}
      {isWalkInOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-xl max-w-md w-full p-6 space-y-4 animate-scale-in">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Footprints className="w-4 h-4 text-amber-500" /> Registrasi Pasien Walk-In
              </h2>
              <button onClick={() => setIsWalkInOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Walk-in Success Confirmation Screen */}
            {walkInConfirmation ? (
              <div className="space-y-4 text-center py-2" id="walkin-success-modal">
                <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center text-amber-600 mx-auto">
                  <CheckCircle className="w-6 h-6 animate-bounce" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Walk-In Berhasil Didaftarkan!</h3>
                  <p className="text-xs text-slate-500 mt-1">Kunjungan langsung tanpa booking telah dicatat ke sistem.</p>
                </div>

                <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl text-left text-xs space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Nama Pasien:</span>
                    <strong className="text-slate-800">{walkInConfirmation.patient.fullName || walkInConfirmation.patient.name}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Nomor RM:</span>
                    <strong className="font-mono text-slate-800">{walkInConfirmation.patient.medicalRecordNumber}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Cabang Kunjungan:</span>
                    <strong className="text-slate-800">{walkInConfirmation.branchName}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Tipe Visit:</span>
                    <strong className="text-amber-600 font-bold">WALK_IN (bookingId = null)</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Waktu Kedatangan:</span>
                    <span className="text-slate-700">{formatDateTime(walkInConfirmation.visit.visitDateTime)}</span>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setIsWalkInOpen(false);
                    setWalkInConfirmation(null);
                  }}
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-2.5 rounded-xl text-xs transition-colors"
                >
                  Tutup & Kembali
                </button>
              </div>
            ) : (
              /* Walk-In Form */
              <form onSubmit={handleSubmitWalkIn} className="space-y-3 text-xs" id="form-walkin">
                {formError && (
                  <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" />
                    <span>{formError}</span>
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-slate-700">Pilih Pasien Terdaftar</label>
                    <button
                      type="button"
                      onClick={() => handleOpenAddPatient()}
                      className="text-[11px] text-emerald-600 hover:underline font-bold"
                    >
                      + Pasien Baru
                    </button>
                  </div>
                  <select
                    value={walkInForm.patientId}
                    onChange={(e) => setWalkInForm({ ...walkInForm, patientId: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    id="select-walkin-patient"
                  >
                    {patients.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.fullName || p.name} ({p.medicalRecordNumber || "No RM"}) - {p.phone}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Cabang Kunjungan
                    {currentUser?.role === UserRole.BRANCH_ADMIN && (
                      <span className="text-slate-400 font-normal text-[10px] ml-1">(Locked: Branch Admin Scope)</span>
                    )}
                  </label>
                  {currentUser?.role === UserRole.BRANCH_ADMIN ? (
                    <div className="bg-slate-100 border border-slate-200 rounded-lg p-2.5 text-slate-700 font-bold flex items-center justify-between">
                      <span>{branches.find((b) => b.id === currentUser.assignedBranchId)?.name || "Cabang Anda"}</span>
                      <Lock className="w-3.5 h-3.5 text-slate-400" />
                    </div>
                  ) : (
                    <select
                      value={walkInForm.branchId}
                      onChange={(e) => setWalkInForm({ ...walkInForm, branchId: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                      id="select-walkin-branch"
                    >
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Keluhan Pasien (Walk-In)</label>
                  <textarea
                    rows={2}
                    value={walkInForm.complaint}
                    onChange={(e) => setWalkInForm({ ...walkInForm, complaint: e.target.value })}
                    placeholder="Sakit gigi geraham, mau scaling langsung, dll..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>

                <div className="p-3 bg-amber-50 border border-amber-100 rounded-lg text-[11px] text-amber-800 leading-relaxed">
                  <strong>Prinsip Domain:</strong> Kunjungan Walk-In secara otomatis diatur dengan <code className="font-mono bg-amber-100 px-1 rounded">visitType = WALK_IN</code> dan <code className="font-mono bg-amber-100 px-1 rounded">bookingId = null</code>. Tidak membuat data Booking buatan.
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsWalkInOpen(false)}
                    className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-semibold"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-bold transition-all disabled:opacity-50"
                  >
                    {isSubmitting ? "Mendaftarkan..." : "Daftarkan Walk-In"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* MODAL 3: BOOKING VISIT MODAL               */}
      {/* ========================================== */}
      {isBookingVisitOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-xl max-w-md w-full p-6 space-y-4 animate-scale-in">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-600" /> Registrasi Kunjungan Booking
              </h2>
              <button onClick={() => setIsBookingVisitOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitBookingVisit} className="space-y-3 text-xs">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Pilih Booking Terkonfirmasi</label>
                <select
                  value={bookingVisitForm.bookingId}
                  onChange={(e) => setBookingVisitForm({ ...bookingVisitForm, bookingId: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                >
                  {bookings.map((bk) => {
                    const patient = patients.find((p) => p.id === bk.patientId);
                    const branch = branches.find((b) => b.id === bk.branchId);

                    return (
                      <option key={bk.id} value={bk.id}>
                        [{bk.id}] {patient?.fullName || patient?.name || "Pasien"} - {branch?.name || "Cabang"} ({formatDateTime(bk.bookingDateTime)})
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Catatan Kunjungan Hari Ini</label>
                <textarea
                  rows={2}
                  value={bookingVisitForm.complaint}
                  onChange={(e) => setBookingVisitForm({ ...bookingVisitForm, complaint: e.target.value })}
                  placeholder="Catatan tambahan saat pasien datang..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsBookingVisitOpen(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold transition-all disabled:opacity-50"
                >
                  {isSubmitting ? "Mencatat..." : "Catat Kunjungan Booking"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* ========================================== */}
      {/* MODAL 4: CLINICAL MEDICAL RECORD MODAL     */}
      {/* ========================================== */}
      {mrModalOpen && selectedVisitForMR && selectedPatient && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col animate-scale-in">
            {/* Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono font-bold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded">
                    {selectedPatient.medicalRecordNumber}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 ${
                      existingMR?.status === MedicalRecordStatus.FINAL
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {existingMR?.status === MedicalRecordStatus.FINAL && <Lock className="w-3 h-3" />}
                    {existingMR?.status || "BARU"}
                  </span>
                </div>
                <h2 className="text-base font-bold text-slate-800 mt-1">
                  Rekam Medis: {selectedPatient.fullName || selectedPatient.name}
                </h2>
                <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                  <span>Visit: {formatDateTime(selectedVisitForMR.visitDateTime)}</span>
                  <span>•</span>
                  <span>{branches.find((b) => b.id === selectedVisitForMR.branchId)?.name || selectedVisitForMR.branchId}</span>
                </div>
              </div>
              <button
                onClick={() => setMrModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 overflow-y-auto space-y-4 text-xs flex-1">
              {/* Error Banner */}
              {mrError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" />
                  <span>{mrError}</span>
                </div>
              )}

              {/* Confirmation Banner for Finalization */}
              {showFinalConfirm && (
                <div className="p-3.5 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl space-y-2">
                  <div className="flex items-center gap-2 font-bold text-xs">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    Konfirmasi Finalisasi Rekam Medis
                  </div>
                  <p className="text-xs leading-relaxed">
                    Pastikan data rekam medis sudah benar. Rekam medis yang berstatus FINAL akan dikunci untuk menjaga integritas data klinis.
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => handleSaveMedicalRecord(MedicalRecordStatus.FINAL)}
                      disabled={savingMR}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs"
                    >
                      {savingMR ? "Menyimpan..." : "Ya, Finalisasi & Simpan"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowFinalConfirm(false)}
                      className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-semibold text-xs"
                    >
                      Batal
                    </button>
                  </div>
                </div>
              )}

              {loadingMR ? (
                <div className="py-12 text-center text-slate-400">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-600" />
                  Memuat data rekam medis...
                </div>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSaveMedicalRecord();
                  }}
                  className="space-y-4"
                >
                  {/* Linked Treatments Section */}
                  {visitTreatments.length > 0 && (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
                      <div className="font-bold text-slate-700 flex items-center justify-between text-xs">
                        <span>Tindakan / Pelayanan pada Visit Ini:</span>
                        <span className="text-[10px] text-slate-400 font-normal">{visitTreatments.length} Tindakan terdaftar</span>
                      </div>
                      <div className="space-y-1.5">
                        {visitTreatments.map((t) => (
                          <div
                            key={t.id}
                            className="bg-white p-2.5 rounded-lg border border-slate-100 flex items-center justify-between"
                          >
                            <div>
                              <span className="font-bold text-slate-800">{t.serviceNameSnapshot}</span>
                              <div className="text-[10px] text-slate-400">
                                Dokter: {t.doctorNameSnapshot || "drg. Spesialis"} • Durasi: {t.estimatedDurationMinutes || 30} mnt
                              </div>
                            </div>
                            <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded text-[10px] font-semibold">
                              {t.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Keluhan Utama */}
                  <div>
                    <label className="block font-bold text-slate-700 mb-1 text-xs">
                      Keluhan Utama <span className="text-rose-500">*</span>
                    </label>
                    <textarea
                      rows={2}
                      value={mrForm.chiefComplaint}
                      onChange={(e) => setMrForm({ ...mrForm, chiefComplaint: e.target.value })}
                      disabled={existingMR?.status === MedicalRecordStatus.FINAL}
                      placeholder="Contoh: Gigi geraham kiri bawah ngilu saat minum dingin..."
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:bg-slate-100 disabled:text-slate-500"
                    />
                  </div>

                  {/* Anamnesis */}
                  <div>
                    <label className="block font-bold text-slate-700 mb-1 text-xs">Anamnesis</label>
                    <textarea
                      rows={2}
                      value={mrForm.anamnesis}
                      onChange={(e) => setMrForm({ ...mrForm, anamnesis: e.target.value })}
                      disabled={existingMR?.status === MedicalRecordStatus.FINAL}
                      placeholder="Riwayat penyakit sekarang, onset keluhan, pengobatan sebelumnya..."
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:bg-slate-100 disabled:text-slate-500"
                    />
                  </div>

                  {/* Pemeriksaan Klinis */}
                  <div>
                    <label className="block font-bold text-slate-700 mb-1 text-xs">Pemeriksaan Klinis</label>
                    <textarea
                      rows={2}
                      value={mrForm.clinicalExamination}
                      onChange={(e) => setMrForm({ ...mrForm, clinicalExamination: e.target.value })}
                      disabled={existingMR?.status === MedicalRecordStatus.FINAL}
                      placeholder="Pemeriksaan ekstraoral/intraoral, palpasi, perkusi, CE, sondasi..."
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:bg-slate-100 disabled:text-slate-500"
                    />
                  </div>

                  {/* Diagnosis */}
                  <div>
                    <label className="block font-bold text-slate-700 mb-1 text-xs">
                      Diagnosis <span className="text-rose-500">*</span>
                    </label>
                    <textarea
                      rows={2}
                      value={mrForm.diagnosis}
                      onChange={(e) => setMrForm({ ...mrForm, diagnosis: e.target.value })}
                      disabled={existingMR?.status === MedicalRecordStatus.FINAL}
                      placeholder="Contoh: Pulpitis ireversibel gigi 36, Karies profunda gigi 46..."
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:bg-slate-100 disabled:text-slate-500"
                    />
                  </div>

                  {/* Rencana / Tindakan */}
                  <div>
                    <label className="block font-bold text-slate-700 mb-1 text-xs">Rencana / Tindakan</label>
                    <textarea
                      rows={2}
                      value={mrForm.treatmentPlan}
                      onChange={(e) => setMrForm({ ...mrForm, treatmentPlan: e.target.value })}
                      disabled={existingMR?.status === MedicalRecordStatus.FINAL}
                      placeholder="Rencana perawatan & tindakan yang dilakukan pada kunjungan ini..."
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:bg-slate-100 disabled:text-slate-500"
                    />
                  </div>

                  {/* Catatan Dokter */}
                  <div>
                    <label className="block font-bold text-slate-700 mb-1 text-xs">Catatan Dokter</label>
                    <textarea
                      rows={2}
                      value={mrForm.doctorNotes}
                      onChange={(e) => setMrForm({ ...mrForm, doctorNotes: e.target.value })}
                      disabled={existingMR?.status === MedicalRecordStatus.FINAL}
                      placeholder="Catatan edukasi pasien, instruksi pasca tindakan, atau jadwal kontrol..."
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:bg-slate-100 disabled:text-slate-500"
                    />
                  </div>

                  {/* Status Selection */}
                  {existingMR?.status !== MedicalRecordStatus.FINAL && (
                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 flex items-center justify-between">
                      <div>
                        <span className="font-bold text-slate-700 block text-xs">Status Rekam Medis</span>
                        <span className="text-[10px] text-slate-400">Pilih FINAL jika data klinis sudah lengkap dan selesai</span>
                      </div>
                      <select
                        value={mrForm.status}
                        onChange={(e) => setMrForm({ ...mrForm, status: e.target.value as any })}
                        className="bg-white border border-slate-300 rounded-lg px-3 py-1 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                      >
                        <option value={MedicalRecordStatus.DRAFT}>DRAFT (Dapat Diedit)</option>
                        <option value={MedicalRecordStatus.FINAL}>FINAL (Terkunci)</option>
                      </select>
                    </div>
                  )}

                  {/* Footer Actions */}
                  <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setMrModalOpen(false)}
                      className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-semibold text-xs transition-colors"
                    >
                      Tutup
                    </button>
                    {existingMR?.status !== MedicalRecordStatus.FINAL && (
                      <button
                        type="submit"
                        disabled={savingMR}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs transition-all disabled:opacity-50 flex items-center gap-1.5"
                      >
                        {savingMR ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Menyimpan...
                          </>
                        ) : (
                          <>
                            <FileText className="w-3.5 h-3.5" /> Simpan Rekam Medis
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
      {/* ========================================== */}
      {/* MODAL: DELETE PATIENT CONFIRMATION         */}
      {/* ========================================== */}
      {patientToDelete && (
        <div className="fixed inset-0 z-[70] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-2xl max-w-md w-full p-6 space-y-4 animate-scale-in">
            <div className="flex items-center gap-3 text-rose-600 pb-3 border-b border-slate-100">
              <div className="p-2.5 bg-rose-100 rounded-xl">
                <Trash2 className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800">Konfirmasi Hapus Pasien</h3>
                <span className="text-[11px] text-slate-500">Tindakan ini permanen</span>
              </div>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">No. Rekam Medis:</span>
                <span className="font-mono font-bold text-slate-800">{patientToDelete.medicalRecordNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Nama Pasien:</span>
                <span className="font-bold text-slate-800">{patientToDelete.fullName || patientToDelete.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">WhatsApp / HP:</span>
                <span className="font-mono text-slate-700">{patientToDelete.phone || "-"}</span>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Apakah Anda yakin ingin menghapus data pasien ini beserta riwayat antrian dan booking terkait?
            </p>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setPatientToDelete(null)}
                disabled={isDeletingPatient}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-semibold text-xs transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleDeletePatient}
                disabled={isDeletingPatient}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold text-xs transition-all disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
              >
                {isDeletingPatient ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Menghapus...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" /> Ya, Hapus Pasien
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* MODAL: EXPORT & IMPORT EXCEL PASIEN        */}
      {/* ========================================== */}
      <PatientExcelModal
        isOpen={isExcelModalOpen}
        onClose={() => setIsExcelModalOpen(false)}
        initialTab={excelModalTab}
        allPatients={patients}
        filteredPatients={filteredPatients}
        branches={branches}
        patientRepo={repos.patient}
        currentUserRole={currentUser?.role}
        userBranchId={currentUser?.assignedBranchId}
        onImportSuccess={async (res: ImportPatientExecutionResult) => {
          await refreshData();
          setFormSuccess(
            `Impor Excel Selesai: ${res.imported} pasien baru berhasil didaftarkan, ${res.updated} diperbarui, ${res.skipped} dilewati.`
          );
        }}
      />
    </div>
  );
};
