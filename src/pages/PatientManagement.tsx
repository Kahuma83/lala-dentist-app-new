import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
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
  BookingSource,
  MedicalRecord,
  MedicalRecordStatus,
  TreatmentJob,
  OdontogramData,
  ClinicFormData,
  PatientMedicalProfile,
  ClinicalVitalSigns,
  ClinicalConsentDocument,
  ClinicalConsentScope
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
  Upload,
  History,
  Settings,
  Sparkles,
  Hash,
  Sliders,
  Mail,
  Printer,
  ScanLine
} from "lucide-react";
import { formatRupiah, formatDate, formatDateTime } from "../utils/formatter";
import { PatientExcelModal } from "../components/PatientExcelModal";
import { LegacyPatientHistoryImportModal } from "../components/LegacyPatientHistoryImportModal";
import { Odontogram } from "../components/Odontogram";
import { ClinicDentalAssessmentFields } from "../components/ClinicDentalAssessmentFields";
import { ClinicMedicalRecordPrintDocument } from "../components/ClinicMedicalRecordPrintDocument";
import { ImportPatientExecutionResult } from "../utils/excelPatientUtils";
import { useRouter } from "../components/Router";
import { getPlannedTreatmentDurationMinutes } from "../utils/plannedTreatmentUtils";
import { hasActiveQueueForPatientOnDate } from "../utils/bookingQueueGuards";
import { getOperationalDateString } from "../utils/dateUtils";
import { canViewPatientPhone as isPatientPhoneVisible } from "../utils/patientPrivacy";
import { normalizeIcd10WhoCode, parseIcd9CmProcedureCodes } from "../utils/clinicalCodeUtils";
import {
  getRMConfig,
  saveRMConfig,
  getNextMedicalRecordNumber,
  checkRMUniqueness,
  extractNumberFromRM,
  formatRMNumber,
  getPatientMedicalRecordNumber,
  RMConfig,
  RMFormatMode
} from "../utils/rmUtils";
import { supabase } from "../lib/supabase";

export const PatientManagement: React.FC = () => {
  const {
    currentUser,
    repos,
    branches,
    doctors,
    doctorBranchAssignments,
    patients,
    visits,
    bookings,
    treatmentJobs,
    staff,
    services,
    refreshData
  } = useApp();
  const { path, navigate } = useRouter();
  const canReadMedicalRecords =
    currentUser?.role === UserRole.DOCTOR || currentUser?.role === UserRole.SUPER_ADMIN;
  const canViewPatientPhone = isPatientPhoneVisible(currentUser?.role);
  const canEditMedicalRecords =
    canReadMedicalRecords;
  const canFinalizeMedicalRecords = currentUser?.role === UserRole.DOCTOR;
  const checkInRoutePrefix = currentUser?.role === UserRole.SUPER_ADMIN
    ? "/super-admin"
    : currentUser?.role === UserRole.BRANCH_ADMIN
      ? "/branch-admin"
      : null;

  const navigateToCheckIn = (query?: URLSearchParams) => {
    if (!checkInRoutePrefix) return;
    const suffix = query?.toString();
    navigate(`${checkInRoutePrefix}/check-in${suffix ? `?${suffix}` : ""}`);
  };

  // Search and Filtering State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBranchFilter, setSelectedBranchFilter] = useState<string>("ALL");

  // Selected Patient for Detail View
  const [selectedPatient, setSelectedPatient] = useState<PatientProfile | null>(null);
  const [patientVisits, setPatientVisits] = useState<PatientVisit[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    if (!path.startsWith("/doctor/")) return;
    const requestedPatientId = new URLSearchParams(window.location.search).get("patientId");
    const requestedPatient = patients.find((patient) => patient.id === requestedPatientId);
    if (requestedPatient) setSelectedPatient(requestedPatient);
  }, [path, patients]);

  // Modals visibility
  const [isAddPatientOpen, setIsAddPatientOpen] = useState(false);
  const [isEditPatientOpen, setIsEditPatientOpen] = useState(false);
  const [isBookingVisitOpen, setIsBookingVisitOpen] = useState(false);
  const [isExcelModalOpen, setIsExcelModalOpen] = useState(false);
  const [isLegacyHistoryImportOpen, setIsLegacyHistoryImportOpen] = useState(false);
  const [excelModalTab, setExcelModalTab] = useState<"export" | "import">("import");

  // RM Management & Customization State
  const [rmMode, setRmMode] = useState<"auto" | "manual">("auto");
  const [isRMConfigModalOpen, setIsRMConfigModalOpen] = useState(false);
  const [rmConfigForm, setRmConfigForm] = useState<RMConfig>(getRMConfig());
  const [isClearDbModalOpen, setIsClearDbModalOpen] = useState(false);
  const [clearDbStartingRM, setClearDbStartingRM] = useState<number>(3000);
  const [clearDbConfirmed, setClearDbConfirmed] = useState(false);
  const [isClearingDb, setIsClearingDb] = useState(false);

  // Patient Form State
  const [patientForm, setPatientForm] = useState({
    id: "",
    name: "",
    medicalRecordNumber: "",
    phone: "",
    email: "",
    emergencyContactName: "",
    emergencyContactPhone: "",
    emergencyContactRelationship: "",
    identityDocumentType: "NIK" as "NIK" | "PASSPORT",
    identityDocumentNumber: "",
    placeOfBirth: "",
    dateOfBirth: "",
    gender: "" as "L" | "P" | "",
    address: "",
    occupation: "",
    religion: "",
    maritalStatus: "",
    education: "",
    medicalHistoryNotes: "",
    acquisitionSource: "UNKNOWN" as PatientProfile["acquisitionSource"],
    referralName: "",
    referringStaffId: "",
    registeredBranchId: ""
  });

  // Duplicate Warning State
  const [duplicateWarning, setDuplicateWarning] = useState<{
    byPhone: PatientProfile[];
    byRM: PatientProfile[];
    byName: PatientProfile[];
    hasDuplicates: boolean;
  } | null>(null);

  useEffect(() => {
    if (currentUser?.role === UserRole.BRANCH_ADMIN && selectedBranchFilter === "ALL") {
      setSelectedBranchFilter("ALL");
    }
    if (currentUser?.role === UserRole.DOCTOR && selectedBranchFilter !== "ALL") {
      setSelectedBranchFilter("ALL");
    }
  }, [currentUser?.role, currentUser?.assignedBranchId, selectedBranchFilter]);

  // Booking Visit Registration Form State
  const [bookingVisitForm, setBookingVisitForm] = useState({
    bookingId: "",
    complaint: ""
  });

  // Medical Record Modal State
  const [selectedVisitForMR, setSelectedVisitForMR] = useState<PatientVisit | null>(null);
  const [mrModalOpen, setMrModalOpen] = useState(false);
  const [medicalRecordPrintPatient, setMedicalRecordPrintPatient] = useState<PatientProfile | null>(null);
  const [shouldPrintMedicalRecord, setShouldPrintMedicalRecord] = useState(false);
  const [loadingMR, setLoadingMR] = useState(false);
  const [existingMR, setExistingMR] = useState<MedicalRecord | null>(null);
  const [visitTreatments, setVisitTreatments] = useState<TreatmentJob[]>([]);
  const [consentDocuments, setConsentDocuments] = useState<ClinicalConsentDocument[]>([]);
  const [uploadingConsentKey, setUploadingConsentKey] = useState<string | null>(null);
  const [consentError, setConsentError] = useState<string | null>(null);
  const [medicalProfile, setMedicalProfile] = useState<PatientMedicalProfile>({
    patientId: "",
    allergies: "",
    medicationAllergies: "",
    foodAllergies: "",
    congenitalDiseases: "",
    systemicDiseases: "",
    routineMedications: "",
    medicalWarnings: "",
    medicalHistoryNotes: ""
  });
  const [savingMedicalProfile, setSavingMedicalProfile] = useState(false);
  const [medicalProfileSaved, setMedicalProfileSaved] = useState(false);
  const [mrForm, setMrForm] = useState({
    chiefComplaint: "",
    anamnesis: "",
    clinicalExamination: "",
    diagnosis: "",
    diagnosisCode: "",
    procedureCodesText: "",
    treatmentPlan: "",
    doctorNotes: "",
    odontogram: { schemaVersion: 1, teeth: {} } as OdontogramData,
    clinicFormData: { dentalAssessment: {} } as ClinicFormData,
    vitalSigns: {} as ClinicalVitalSigns,
    status: MedicalRecordStatus.DRAFT as MedicalRecordStatus | "DRAFT" | "FINAL"
  });
  const [mrError, setMrError] = useState<string | null>(null);
  const [savingMR, setSavingMR] = useState(false);
  const [showFinalConfirm, setShowFinalConfirm] = useState(false);

  const updateVitalSign = (key: keyof ClinicalVitalSigns, rawValue: string) => {
    const parsedValue = rawValue.trim() === "" ? undefined : Number(rawValue);
    setMrForm((previous) => ({
      ...previous,
      vitalSigns: {
        ...previous.vitalSigns,
        [key]: parsedValue !== undefined && Number.isFinite(parsedValue) ? parsedValue : undefined
      }
    }));
  };

  // Error & UI Feedback State
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPatientCardScannerOpen, setIsPatientCardScannerOpen] = useState(false);
  const [patientCardScanToken, setPatientCardScanToken] = useState("");
  const [patientCardScanError, setPatientCardScanError] = useState<string | null>(null);
  const [isVerifyingPatientCard, setIsVerifyingPatientCard] = useState(false);
  const [verifiedCardPatient, setVerifiedCardPatient] = useState<PatientProfile | null>(null);
  const [verifiedCardBooking, setVerifiedCardBooking] = useState<{
    id: string;
    bookingDateTime: string;
    timeSlot: string;
    status: BookingStatus;
    branchName: string;
  } | null>(null);

  // Patient Deletion State
  const [patientToDelete, setPatientToDelete] = useState<PatientProfile | null>(null);
  const [isDeletingPatient, setIsDeletingPatient] = useState(false);

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
      list = list.filter((p) => 
        branchPatientIds.has(p.id) ||
        p.registeredBranchId === branchId ||
        p.branch_id === branchId ||
        p.assignedBranchId === branchId ||
        p.branchId === branchId
      );
    }

    const branchScopedList = selectedBranchFilter === "ALL"
      ? list
      : list.map((patient) => ({
          ...patient,
          medicalRecordNumber: getPatientMedicalRecordNumber(patient, selectedBranchFilter)
        }));

    const q = searchQuery.trim().toLowerCase();
    const newestFirst = [...branchScopedList].sort((left, right) =>
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
    );
    if (!q) return newestFirst.slice(0, currentUser?.role === UserRole.DOCTOR ? 5 : 10);

    return newestFirst.filter((p) => {
      const branchRm = getPatientMedicalRecordNumber(
        p,
        selectedBranchFilter === "ALL" ? undefined : selectedBranchFilter
      ).toLowerCase();
      const otherBranchRmMatch = selectedBranchFilter === "ALL" &&
        p.branchMedicalRecordNumbers?.some((record) =>
          record.medicalRecordNumber.toLowerCase().includes(q)
        );
      const globalCodeMatch = p.internalPatientCode?.trim().toLowerCase().includes(q);
      return branchRm.includes(q) || !!otherBranchRmMatch || !!globalCodeMatch;
    });
  }, [patients, visits, currentUser?.role, searchQuery, selectedBranchFilter]);

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

  // Real-time RM uniqueness validation for manual input
  const manualRMValidation = useMemo(() => {
    if (rmMode !== "manual" || !patientForm.medicalRecordNumber.trim()) {
      return null;
    }
    return checkRMUniqueness(
      patientForm.medicalRecordNumber,
      patients,
      patientForm.id || undefined,
      patientForm.registeredBranchId
    );
  }, [rmMode, patientForm.medicalRecordNumber, patientForm.id, patientForm.registeredBranchId, patients]);

  // Helper to open Add Patient Modal
  const handleOpenAddPatient = () => {
    setRmMode("auto");
    const defaultBranchId = currentUser?.assignedBranchId
      || (currentUser as any)?.branch_id
      || (currentUser as any)?.branchId
      || "";

    setPatientForm({
      id: "",
      name: "",
      medicalRecordNumber: "",
      phone: "",
      email: "",
      emergencyContactName: "",
      emergencyContactPhone: "",
      emergencyContactRelationship: "",
      identityDocumentType: "NIK",
      identityDocumentNumber: "",
      placeOfBirth: "",
      dateOfBirth: "",
      gender: "",
      address: "",
      occupation: "",
      religion: "",
      maritalStatus: "",
      education: "",
      medicalHistoryNotes: "",
      acquisitionSource: "UNKNOWN",
      referralName: "",
      referringStaffId: "",
      registeredBranchId: defaultBranchId
    });
    setDuplicateWarning(null);
    setFormError(null);
    setIsAddPatientOpen(true);
  };

  // Helper to open Edit Patient Modal
  const handleOpenEditPatient = (p: PatientProfile) => {
    setRmMode("manual");
    const existingBranchId = p.registeredBranchId 
      || p.branch_id 
      || p.assignedBranchId 
      || p.branchId 
      || currentUser?.assignedBranchId
      || "";

    setPatientForm({
      id: p.id,
      name: p.fullName || p.name,
      medicalRecordNumber: getPatientMedicalRecordNumber(p, existingBranchId),
      phone: p.phone,
      email: p.email || "",
      emergencyContactName: p.emergencyContactName || "",
      emergencyContactPhone: p.emergencyContactPhone || "",
      emergencyContactRelationship: p.emergencyContactRelationship || "",
      identityDocumentType: p.identityDocumentType || "NIK",
      identityDocumentNumber: p.identityDocumentNumber || "",
      placeOfBirth: p.placeOfBirth || "",
      dateOfBirth: p.dateOfBirth,
      gender: p.gender,
      address: p.address,
      occupation: p.occupation || "",
      religion: p.religion || "",
      maritalStatus: p.maritalStatus || "",
      education: p.education || "",
      medicalHistoryNotes: p.medicalHistoryNotes || "",
      acquisitionSource: p.acquisitionSource || "UNKNOWN",
      referralName: p.referralName || "",
      referringStaffId: p.referringStaffId || "",
      registeredBranchId: existingBranchId
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

      const identityNumber = patientForm.identityDocumentNumber.trim().replace(/\s/g, "");
      if (!patientForm.gender) {
        throw new Error("Jenis kelamin wajib dipilih.");
      }
      if (!patientForm.id && (!identityNumber || !patientForm.placeOfBirth.trim() || !patientForm.dateOfBirth)) {
        throw new Error("Identitas (NIK/paspor), tempat dan tanggal lahir wajib diisi untuk pasien baru.");
      }
      if (identityNumber && patientForm.identityDocumentType === "NIK" && !/^\d{16}$/.test(identityNumber)) {
        throw new Error("NIK harus terdiri dari 16 digit angka.");
      }
      if (identityNumber && patientForm.identityDocumentType === "PASSPORT" && !/^[A-Za-z0-9]{6,20}$/.test(identityNumber)) {
        throw new Error("Nomor paspor harus terdiri dari 6–20 huruf atau angka.");
      }
      if (!patientForm.id && patients.some((patient) =>
        patient.identityDocumentType === patientForm.identityDocumentType &&
        patient.identityDocumentNumber?.replace(/\s/g, "").toLowerCase() === identityNumber.toLowerCase()
      )) {
        throw new Error("Nomor identitas ini sudah terdaftar pada pasien lain.");
      }

      const patientEmail = patientForm.email.trim().toLowerCase();
      if (patientEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(patientEmail)) {
        throw new Error("Format email pasien tidak valid.");
      }

      // Check RM uniqueness if manual or modified
      const candidateRM = patientForm.medicalRecordNumber.trim();
      if (candidateRM) {
        const rmCheck = checkRMUniqueness(candidateRM, patients, patientForm.id || undefined);
        if (!rmCheck.isUnique && rmCheck.conflictPatient) {
          throw new Error(`Nomor RM "${candidateRM}" sudah digunakan oleh pasien "${rmCheck.conflictPatient.fullName || rmCheck.conflictPatient.name}". Harap gunakan nomor RM lain.`);
        }
      }

      // If creating new and not forceSave, check duplicates
      if (!patientForm.id && !forceSave) {
        const dupResult = await repos.patient.checkDuplicates(
          patientForm.phone,
          candidateRM,
          patientForm.name,
          currentUser?.role,
          patientForm.registeredBranchId
        );

        if (dupResult.hasDuplicates) {
          setDuplicateWarning(dupResult);
          setIsSubmitting(false);
          return;
        }
      }

      const effBranchId = patientForm.registeredBranchId.trim();
      const rmToSubmit = rmMode === "manual" ? candidateRM : "";
      if (rmToSubmit && !effBranchId) {
        throw new Error("Pilih cabang asal sebelum memasukkan No. RM lokal pasien.");
      }

      if (patientForm.id) {
        // Update
        await repos.patient.updatePatient(
          patientForm.id,
          {
            fullName: patientForm.name,
            name: patientForm.name,
            ...(rmToSubmit ? { medicalRecordNumber: rmToSubmit } : {}),
            phone: patientForm.phone,
            email: patientEmail,
            emergencyContactName: patientForm.emergencyContactName.trim(),
            emergencyContactPhone: patientForm.emergencyContactPhone.trim(),
            emergencyContactRelationship: patientForm.emergencyContactRelationship.trim(),
            identityDocumentType: patientForm.identityDocumentType,
            identityDocumentNumber: identityNumber,
            placeOfBirth: patientForm.placeOfBirth.trim(),
            dateOfBirth: patientForm.dateOfBirth,
            gender: patientForm.gender,
            address: patientForm.address,
            occupation: patientForm.occupation,
            religion: patientForm.religion,
            maritalStatus: patientForm.maritalStatus,
            education: patientForm.education,
            ...(canReadMedicalRecords ? { medicalHistoryNotes: patientForm.medicalHistoryNotes } : {}),
            acquisitionSource: patientForm.acquisitionSource,
            referralName: patientForm.referralName,
            referringStaffId: patientForm.referringStaffId || null,
            registeredBranchId: effBranchId,
            branch_id: effBranchId,
            assignedBranchId: effBranchId,
            branchId: effBranchId
          },
          currentUser?.role,
          currentUser?.assignedBranchId
        );
        setFormSuccess("Data pasien berhasil diperbarui.");
      } else {
        // Create
        const newP = await repos.patient.createPatient(
          {
            fullName: patientForm.name,
            name: patientForm.name,
            medicalRecordNumber: rmToSubmit || undefined,
            phone: patientForm.phone,
            email: patientEmail,
            emergencyContactName: patientForm.emergencyContactName.trim(),
            emergencyContactPhone: patientForm.emergencyContactPhone.trim(),
            emergencyContactRelationship: patientForm.emergencyContactRelationship.trim(),
            identityDocumentType: patientForm.identityDocumentType,
            identityDocumentNumber: identityNumber,
            placeOfBirth: patientForm.placeOfBirth.trim(),
            dateOfBirth: patientForm.dateOfBirth,
            gender: patientForm.gender,
            address: patientForm.address,
            occupation: patientForm.occupation,
            religion: patientForm.religion,
            maritalStatus: patientForm.maritalStatus,
            education: patientForm.education,
            ...(canReadMedicalRecords ? { medicalHistoryNotes: patientForm.medicalHistoryNotes } : {}),
            acquisitionSource: patientForm.acquisitionSource,
            referralName: patientForm.referralName,
            referringStaffId: patientForm.referringStaffId || null,
            registeredBranchId: effBranchId,
            branch_id: effBranchId,
            assignedBranchId: effBranchId,
            branchId: effBranchId
          },
          currentUser?.role,
          currentUser?.assignedBranchId
        );
        setFormSuccess(newP.medicalRecordNumber
          ? `Pasien baru berhasil didaftarkan dengan Nomor RM: ${newP.medicalRecordNumber}`
          : "Pasien baru berhasil didaftarkan. Nomor RM akan diterbitkan saat check-in pertama.");
        // If custom manual RM was entered and higher than starting counter, automatically advance counter
        const extracted = extractNumberFromRM(rmToSubmit);
        if (extracted !== null && extracted >= rmConfigForm.startingNumber) {
          const updatedCfg = { ...rmConfigForm, startingNumber: extracted + 1 };
          saveRMConfig(updatedCfg);
          setRmConfigForm(updatedCfg);
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

  // Clear / Reset All Patients Database
  const handleClearPatientDatabase = async () => {
    try {
      setIsClearingDb(true);
      setFormError(null);
      if (repos.patient.clearAllPatients) {
        await repos.patient.clearAllPatients(currentUser?.role);
      }
      
      // Update RM starting counter to specified value
      const activeCfg = getRMConfig();
      const updatedCfg: RMConfig = {
        ...activeCfg,
        startingNumber: clearDbStartingRM || 3000
      };
      saveRMConfig(updatedCfg);
      setRmConfigForm(updatedCfg);

      setSelectedPatient(null);
      setPatientVisits([]);
      await refreshData();
      setIsClearDbModalOpen(false);
      setClearDbConfirmed(false);
      setFormSuccess(`Database pasien berhasil dikosongkan. Nomor RM otomatis berikutnya telah disiapkan mulai dari ${clearDbStartingRM}.`);
    } catch (err: any) {
      setFormError(err.message || "Gagal mengosongkan database pasien.");
    } finally {
      setIsClearingDb(false);
    }
  };

  // Save RM Configuration
  const handleSaveRMConfig = (newConfig: RMConfig) => {
    saveRMConfig(newConfig);
    setRmConfigForm(newConfig);
    setIsRMConfigModalOpen(false);
    setFormSuccess("Pengaturan preview RM di perangkat ini tersimpan. Penomoran otomatis saat check-in tetap mengikuti nomor RM tertinggi di database.");
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
      setFormSuccess(`Pasien ${patientToDelete.fullName || patientToDelete.name} (${patientToDelete.medicalRecordNumber || "belum memiliki RM"}) berhasil dihapus.`);
      setPatientToDelete(null);
      setIsEditPatientOpen(false);
      await refreshData();
    } catch (err: any) {
      setFormError(err.message || "Gagal menghapus data pasien.");
    } finally {
      setIsDeletingPatient(false);
    }
  };

  const handleOpenWalkInSchedule = (p?: PatientProfile) => {
    if (!checkInRoutePrefix) return;
    const params = new URLSearchParams({ source: BookingSource.WALK_IN });
    if (p) params.set("patientId", p.id);
    navigate(`${checkInRoutePrefix}/bookings?${params.toString()}`);
  };

  const handleVerifyPatientCard = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPatientCardScanError(null);
    setVerifiedCardPatient(null);
    setVerifiedCardBooking(null);
    const token = patientCardScanToken.trim();
    if (!token) {
      setPatientCardScanError("Pindai QR kartu pasien terlebih dahulu.");
      return;
    }

    setIsVerifyingPatientCard(true);
    try {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw new Error(`Gagal memeriksa sesi petugas: ${sessionError.message}`);
      const accessToken = data.session?.access_token;
      if (!accessToken) throw new Error("Sesi petugas tidak ditemukan. Silakan masuk kembali.");

      const response = await fetch("/api/patient-card/verify", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ token })
      });
      const result = await response.json().catch(() => null) as {
        message?: string;
        patient?: { id?: string };
        booking?: {
          id: string;
          bookingDateTime: string;
          timeSlot: string;
          status: BookingStatus;
          branchName: string;
        } | null;
      } | null;
      if (!response.ok) throw new Error(result?.message || "QR pasien gagal diverifikasi.");
      const patient = patients.find((item) => item.id === result?.patient?.id);
      if (!patient) {
        throw new Error("QR valid, tetapi data pasien belum tersedia di daftar. Muat ulang data pasien lalu coba lagi.");
      }
      setVerifiedCardPatient(patient);
      setVerifiedCardBooking(result?.booking || null);
      setPatientCardScanToken("");
    } catch (scanError: unknown) {
      setPatientCardScanError(
        scanError instanceof Error
          ? scanError.message
          : "QR pasien gagal diverifikasi. Silakan coba lagi."
      );
    } finally {
      setIsVerifyingPatientCard(false);
    }
  };

  const handleOpenBookingVisit = () => {
    navigateToCheckIn();
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

      const branchQueue = await repos.queue.getQueueByBranch(
        targetBooking.branchId,
        currentUser?.role,
        currentUser?.assignedBranchId
      );
      if (hasActiveQueueForPatientOnDate(branchQueue, targetBooking.patientId, targetBooking.branchId, new Date().toISOString())) {
        throw new Error("Pasien ini sudah berada di antrean aktif hari ini melalui kunjungan lain.");
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
          plannedTreatments: targetBooking.plannedTreatments || [],
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
          doctorId: targetBooking.doctorId,
          estimatedDurationMinutes: getPlannedTreatmentDurationMinutes(targetBooking.plannedTreatments),
          plannedTreatments: targetBooking.plannedTreatments || []
        }
      );

      await repos.booking.updateBooking(
        targetBooking.id,
        { status: BookingStatus.CONFIRMED },
        currentUser?.role,
        currentUser?.assignedBranchId
      );

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
    if (!selectedPatient) {
      setMrError("Pilih pasien terlebih dahulu sebelum membuka rekam medis.");
      return;
    }
    setSelectedVisitForMR(v);
    setMrModalOpen(true);
    setLoadingMR(true);
    setMrError(null);
    setShowFinalConfirm(false);
    setMedicalProfileSaved(false);
    setConsentDocuments([]);
    setConsentError(null);

    try {
      // 1. Fetch existing Medical Record
      const mr = await repos.medicalRecord.getMedicalRecordByVisit(
        v.id,
        currentUser?.role,
        currentUser?.assignedBranchId
      );
      setExistingMR(mr);

      const profile = await repos.medicalRecord.getPatientMedicalProfile(
        selectedPatient.id,
        currentUser?.role,
        currentUser?.assignedBranchId
      );
      setMedicalProfile({
        patientId: selectedPatient.id,
        branchId: profile?.branchId || v.branchId,
        bloodType: profile?.bloodType || "",
        allergies: profile?.allergies || "",
        medicationAllergies: profile?.medicationAllergies || "",
        foodAllergies: profile?.foodAllergies || "",
        congenitalDiseases: profile?.congenitalDiseases || "",
        systemicDiseases: profile?.systemicDiseases || "",
        routineMedications: profile?.routineMedications || "",
        medicalWarnings: profile?.medicalWarnings || "",
        medicalHistoryNotes: profile?.medicalHistoryNotes || selectedPatient.medicalHistoryNotes || ""
      });

      if (mr) {
        setMrForm({
          chiefComplaint: mr.chiefComplaint || "",
          anamnesis: mr.anamnesis || "",
          clinicalExamination: mr.clinicalExamination || "",
          diagnosis: mr.diagnosis || "",
          diagnosisCode: mr.diagnosisCode || "",
          procedureCodesText: (mr.procedureCodes || []).join("\n"),
          treatmentPlan: mr.treatmentPlan || "",
          doctorNotes: mr.doctorNotes || "",
          odontogram: mr.odontogram || { schemaVersion: 1, teeth: {} },
          clinicFormData: mr.clinicFormData || { dentalAssessment: {} },
          vitalSigns: mr.vitalSigns || {},
          status: mr.status
        });
      } else {
        setMrForm({
          chiefComplaint: v.complaint || "",
          anamnesis: "",
          clinicalExamination: "",
          diagnosis: "",
          diagnosisCode: "",
          procedureCodesText: "",
          treatmentPlan: "",
          doctorNotes: "",
          odontogram: { schemaVersion: 1, teeth: {} },
          clinicFormData: { dentalAssessment: {} },
          vitalSigns: {},
          status: MedicalRecordStatus.DRAFT
        });
      }

      // 2. Fetch treatments for this visit
      const [tList, documentList] = await Promise.all([
        repos.treatment.listTreatmentsByVisit(
          v.id,
          currentUser?.role,
          currentUser?.assignedBranchId
        ),
        repos.medicalRecord.getConsentDocumentsByVisit(
          v.id,
          currentUser?.role,
          currentUser?.assignedBranchId
        )
      ]);
      setVisitTreatments(tList);
      setConsentDocuments(documentList);
    } catch (err: any) {
      setMrError(err.message || "Gagal memuat rekam medis.");
    } finally {
      setLoadingMR(false);
    }
  };

  const handleUploadConsentDocument = async (
    file: File,
    scope: ClinicalConsentScope,
    treatmentJobId?: string
  ) => {
    if (!selectedVisitForMR || !canEditMedicalRecords) return;
    const uploadKey = treatmentJobId || "VISIT";
    setUploadingConsentKey(uploadKey);
    setConsentError(null);
    try {
      const document = await repos.medicalRecord.uploadConsentDocument(
        {
          visitId: selectedVisitForMR.id,
          branchId: selectedVisitForMR.branchId,
          scope,
          treatmentJobId,
          file
        },
        currentUser?.role,
        currentUser?.assignedBranchId
      );
      setConsentDocuments((previous) => [document, ...previous]);
    } catch (error) {
      setConsentError(error instanceof Error ? error.message : "Gagal mengunggah dokumen consent.");
    } finally {
      setUploadingConsentKey(null);
    }
  };

  const handleDownloadConsentDocument = async (document: ClinicalConsentDocument) => {
    setConsentError(null);
    try {
      const downloaded = await repos.medicalRecord.downloadConsentDocument(
        document.id,
        currentUser?.role,
        currentUser?.assignedBranchId
      );
      const objectUrl = URL.createObjectURL(downloaded.blob);
      const anchor = window.document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = downloaded.fileName;
      window.document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (error) {
      setConsentError(error instanceof Error ? error.message : "Gagal mengunduh dokumen consent.");
    }
  };

  const handleSaveMedicalProfile = async () => {
    if (!selectedPatient || !selectedVisitForMR || !canEditMedicalRecords) return;
    setSavingMedicalProfile(true);
    setMrError(null);
    setMedicalProfileSaved(false);
    try {
      const savedProfile = await repos.medicalRecord.savePatientMedicalProfile(
        {
          ...medicalProfile,
          patientId: selectedPatient.id,
          branchId: medicalProfile.branchId || selectedVisitForMR.branchId
        },
        currentUser?.role,
        currentUser?.assignedBranchId,
        currentUser?.id
      );
      setMedicalProfile(savedProfile);
      setMedicalProfileSaved(true);
    } catch (err: any) {
      setMrError(err.message || "Gagal menyimpan profil medis pasien.");
    } finally {
      setSavingMedicalProfile(false);
    }
  };

  // Save Medical Record
  const handleSaveMedicalRecord = async (overrideStatus?: MedicalRecordStatus | "DRAFT" | "FINAL") => {
    if (!selectedVisitForMR || !selectedPatient) return;
    if (!canEditMedicalRecords) {
      setMrError("Hanya dokter yang berwenang menyimpan rekam medis digital.");
      return;
    }

    const targetStatus = overrideStatus || mrForm.status;
    if (targetStatus === MedicalRecordStatus.FINAL && !canFinalizeMedicalRecords) {
      setMrError("Hanya dokter penanggung jawab yang dapat menandatangani dan memfinalisasi rekam medis.");
      return;
    }

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
      const diagnosisCode = normalizeIcd10WhoCode(mrForm.diagnosisCode);
      const procedureCodes = parseIcd9CmProcedureCodes(mrForm.procedureCodesText);
      if (Object.values(mrForm.vitalSigns).some((value) => value !== undefined && (!Number.isFinite(value) || value < 0))) {
        throw new Error("Nilai tanda vital harus berupa angka nol atau lebih.");
      }

      const activeDoctorId = currentUser?.doctorId || selectedVisitForMR.doctorId;
      if (!activeDoctorId) {
        throw new Error("Dokter untuk kunjungan ini belum ditentukan. Tetapkan dokter sebelum menyimpan rekam medis digital.");
      }

      const savedProfile = await repos.medicalRecord.savePatientMedicalProfile(
        {
          ...medicalProfile,
          patientId: selectedPatient.id,
          branchId: medicalProfile.branchId || selectedVisitForMR.branchId
        },
        currentUser?.role,
        currentUser?.assignedBranchId,
        currentUser?.id
      );
      setMedicalProfile(savedProfile);

      const draft = await repos.medicalRecord.createOrUpdateMedicalRecord(
        {
          visitId: selectedVisitForMR.id,
          patientId: selectedPatient.id,
          branchId: selectedVisitForMR.branchId,
          doctorId: activeDoctorId,
          chiefComplaint: mrForm.chiefComplaint,
          anamnesis: mrForm.anamnesis,
          clinicalExamination: mrForm.clinicalExamination,
          diagnosis: mrForm.diagnosis,
          diagnosisCode: diagnosisCode || undefined,
          procedureCodes,
          treatmentPlan: mrForm.treatmentPlan,
          doctorNotes: mrForm.doctorNotes,
          odontogram: mrForm.odontogram,
          clinicFormData: mrForm.clinicFormData,
          vitalSigns: mrForm.vitalSigns,
          medicalHistorySnapshot: savedProfile,
          status: MedicalRecordStatus.DRAFT
        },
        currentUser?.role,
        currentUser?.assignedBranchId,
        currentUser?.id
      );
      const saved = targetStatus === MedicalRecordStatus.FINAL
        ? await repos.medicalRecord.finalizeMedicalRecord(
            draft.id,
            activeDoctorId,
            currentUser?.role,
            currentUser?.assignedBranchId
          )
        : draft;

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

  const handlePrintMedicalRecord = async () => {
    if (!canReadMedicalRecords || !selectedPatient || !selectedVisitForMR) return;
    setMrError(null);
    try {
      const phone = await repos.patient.getPatientPhoneForMedicalRecord(
        selectedPatient.id,
        selectedVisitForMR.branchId,
        currentUser?.role
      );
      setMedicalRecordPrintPatient({ ...selectedPatient, phone });
      setShouldPrintMedicalRecord(true);
    } catch (err) {
      setMrError(err instanceof Error ? err.message : "Gagal menyiapkan nomor telepon untuk rekam medis.");
    }
  };

  useEffect(() => {
    if (!shouldPrintMedicalRecord) return;

    document.body.dataset.printDocument = "clinic-medical-record";
    const handleAfterPrint = () => {
      delete document.body.dataset.printDocument;
      setShouldPrintMedicalRecord(false);
      setMedicalRecordPrintPatient(null);
    };
    window.addEventListener("afterprint", handleAfterPrint, { once: true });
    window.print();

    return () => {
      window.removeEventListener("afterprint", handleAfterPrint);
      delete document.body.dataset.printDocument;
    };
  }, [shouldPrintMedicalRecord]);

  return (
    <div className="space-y-6" id="patient-management-root">
      {mrModalOpen && selectedVisitForMR && selectedPatient && canReadMedicalRecords && createPortal(
        <ClinicMedicalRecordPrintDocument
          patient={medicalRecordPrintPatient || selectedPatient}
          visit={selectedVisitForMR}
          branch={branches.find((branch) => branch.id === selectedVisitForMR.branchId)}
          doctor={doctors.find((doctor) =>
            doctor.id === (existingMR?.doctorId || selectedVisitForMR.doctorId || currentUser?.doctorId)
          )}
          branchDoctors={doctors
            .filter((doctor) =>
              (doctor.active ?? doctor.isActive) &&
              (
                doctor.assignedBranchId === selectedVisitForMR.branchId ||
                doctorBranchAssignments.some((assignment) =>
                  assignment.doctorId === doctor.id &&
                  assignment.branchId === selectedVisitForMR.branchId &&
                  assignment.active
                )
              )
            )
            .sort((first, second) =>
              (first.fullName || first.name).localeCompare(second.fullName || second.name, "id")
            )}
          profile={medicalProfile}
          doctorName={existingMR?.doctorNameSnapshot || currentUser?.name || "Dokter"}
          record={{
            chiefComplaint: mrForm.chiefComplaint,
            anamnesis: mrForm.anamnesis,
            clinicalExamination: mrForm.clinicalExamination,
            diagnosis: mrForm.diagnosis,
            diagnosisCode: mrForm.diagnosisCode,
            treatmentPlan: mrForm.treatmentPlan,
            doctorNotes: mrForm.doctorNotes,
            odontogram: mrForm.odontogram,
            clinicFormData: mrForm.clinicFormData
          }}
        />,
        document.body
      )}
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
            <h1 className="text-lg font-bold text-slate-800 tracking-tight">
              {currentUser?.role === UserRole.DOCTOR ? "Direktori Pasien Global" : "Master Pasien Global"}
            </h1>
            <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
              {currentUser?.role === UserRole.SUPER_ADMIN
                ? "Lintas Cabang"
                : currentUser?.role === UserRole.DOCTOR
                  ? "Lintas Cabang"
                  : "Branch Scope"}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {currentUser?.role === UserRole.DOCTOR
              ? "Tampilkan 5 pasien terbaru, atau masukkan kode global lengkap untuk membuka profil dan riwayat klinis lintas cabang."
              : "Data identitas pasien bersifat global (1 Pasien = 1 Rekam Medis). Kunjungan terikat pada cabang operasional."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {checkInRoutePrefix && (
            <button
              type="button"
              onClick={() => {
                setPatientCardScanToken("");
                setPatientCardScanError(null);
                setVerifiedCardPatient(null);
                setVerifiedCardBooking(null);
                setIsPatientCardScannerOpen(true);
              }}
              className="inline-flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 py-2.5 text-xs font-bold text-emerald-800 shadow-2xs transition-all hover:bg-emerald-100 active:scale-95"
              title="Pindai QR kartu pasien untuk melanjutkan check-in"
            >
              <ScanLine className="h-4 w-4 text-emerald-700" />
              Pindai Kartu Pasien
            </button>
          )}
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

          {currentUser?.role === UserRole.SUPER_ADMIN && (
            <button
              onClick={() => setIsLegacyHistoryImportOpen(true)}
              className="inline-flex items-center gap-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 text-xs font-bold px-3.5 py-2.5 rounded-xl border border-indigo-300 shadow-2xs transition-all active:scale-95"
              id="btn-import-legacy-history"
              title="Impor profil dan riwayat kunjungan dari workbook historis"
            >
              <History className="w-4 h-4 text-indigo-600" /> Impor Riwayat Lama
            </button>
          )}

          <button
            onClick={() => {
              setRmConfigForm(getRMConfig());
              setIsRMConfigModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-3.5 py-2.5 rounded-xl border border-slate-200 shadow-2xs transition-all active:scale-95"
            id="btn-rm-config"
            title="Atur format dan nomor urut awal Rekam Medis (No RM)"
          >
            <Settings className="w-3.5 h-3.5 text-slate-600" /> Format & No RM
          </button>

          {(currentUser?.role === UserRole.SUPER_ADMIN || currentUser?.role === UserRole.BRANCH_ADMIN) && (
            <button
              onClick={() => {
                setClearDbStartingRM(3000);
                setClearDbConfirmed(false);
                setIsClearDbModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold px-3.5 py-2.5 rounded-xl border border-rose-200 shadow-2xs transition-all active:scale-95"
              id="btn-clear-patients"
              title="Kosongkan seluruh data pasien untuk mulai input manual dari awal"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-600" /> Kosongkan Database
            </button>
          )}

          {checkInRoutePrefix && (
            <>
              <button
                onClick={() => handleOpenWalkInSchedule()}
                className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-sm transition-all transform active:scale-95"
                id="btn-walkin-quick"
              >
                <Calendar className="w-4 h-4" /> Jadwalkan Walk-In
              </button>

              <button
                onClick={handleOpenBookingVisit}
                className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-sm transition-all transform active:scale-95"
                id="btn-booking-visit"
              >
                <Calendar className="w-4 h-4" /> Kunjungan Booking
              </button>
            </>
          )}

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
        <div className="flex flex-col sm:flex-row gap-2.5 w-full md:w-auto flex-1 items-stretch sm:items-center">
          <div className="relative flex-1 md:max-w-xs">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari No. RM atau kode global (contoh: GEB-RM4357)..."
              className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-10 pr-8 py-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              id="input-search-patient"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filter Cabang Dropdown (Semua Cabang vs Cabang Tertentu) */}
          {currentUser?.role === UserRole.DOCTOR ? (
            <div className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-800">
              <User className="h-4 w-4" />
              Direktori pasien semua cabang
            </div>
          ) : (
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus-within:ring-2 focus-within:ring-emerald-500/20 focus-within:border-emerald-500">
              <Building2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <label htmlFor="select-branch-filter-toolbar" className="text-[11px] font-semibold text-slate-500 whitespace-nowrap">
                Cabang:
              </label>
              <select
                id="select-branch-filter-toolbar"
                value={selectedBranchFilter}
                onChange={(e) => setSelectedBranchFilter(e.target.value)}
                className="bg-transparent text-xs font-semibold text-slate-800 focus:outline-none cursor-pointer pr-1"
              >
                <option value="ALL">🌐 Semua Cabang (Global)</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    🏥 {b.name}
                  </option>
                ))}
              </select>
              {selectedBranchFilter !== "ALL" && (
                <button
                  type="button"
                  onClick={() => setSelectedBranchFilter("ALL")}
                  className="text-slate-400 hover:text-rose-600 p-0.5 ml-0.5 transition-colors"
                  title="Reset ke Semua Cabang"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
          {selectedBranchFilter !== "ALL" && (
            <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200/80 rounded-full text-[10px] font-bold">
              Filter: {branches.find((b) => b.id === selectedBranchFilter)?.name || selectedBranchFilter}
            </span>
          )}
          <span className="text-xs font-medium text-slate-500">
            {searchQuery.trim()
              ? <>{currentUser?.role === UserRole.DOCTOR ? "Hasil kode global" : "Hasil No. RM"}: <strong className="text-slate-800">{filteredPatients.length}</strong> pasien</>
              : <>Menampilkan <strong className="text-slate-800">{filteredPatients.length}</strong> pasien terbaru{currentUser?.role === UserRole.DOCTOR ? " (maksimal 5)" : ""}</>}
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
                    <th className="py-3 px-4">No. RM / Kode Global</th>
                    <th className="py-3 px-4">Nama Pasien</th>
                    {canViewPatientPhone && <th className="py-3 px-4">WhatsApp / HP</th>}
                    <th className="py-3 px-4">L/P & Tgl Lahir</th>
                    <th className="py-3 px-4">Kunjungan</th>
                    <th className="py-3 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredPatients.length === 0 ? (
                    <tr>
                      <td colSpan={canViewPatientPhone ? 6 : 5} className="text-center py-12 text-slate-400">
                        <User className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        <p className="font-bold text-slate-700">{patients.length === 0 ? "Belum Ada Data Pasien" : searchQuery.trim() ? `Pasien dengan ${currentUser?.role === UserRole.DOCTOR ? "kode global" : "No. RM"} tersebut tidak ditemukan` : "Belum ada data pasien"}</p>
                        <p className="text-[11px] text-slate-400 mt-1">
                          {patients.length === 0
                            ? "Klik tombol \"+ Tambah Pasien Baru\" di atas untuk mendaftarkan pasien pertama."
                            : searchQuery.trim()
                              ? currentUser?.role === UserRole.DOCTOR
                                ? "Periksa kode global pasien, misalnya GEB-RM4357."
                                : "Periksa kembali No. RM atau filter cabang yang dipilih."
                              : currentUser?.role === UserRole.DOCTOR
                                ? "Pasien lainnya dapat dicari menggunakan kode global."
                                : "Pasien lainnya dapat dicari menggunakan No. RM."}
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
                            {p.medicalRecordNumber || "Belum check-in"}
                            <div className="mt-1 text-[10px] font-semibold text-emerald-700">
                              {p.internalPatientCode || "Kode global belum tersedia"}
                            </div>
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-slate-800">{p.fullName || p.name}</div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              {(() => {
                                const pBranchId = p.registeredBranchId || p.branch_id || p.assignedBranchId || p.branchId;
                                const pBranch = branches.find((b) => b.id === pBranchId);
                                return pBranch ? (
                                  <span className="inline-flex items-center gap-1 text-[9px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200/60 px-1.5 py-0.5 rounded">
                                    <Building2 className="w-2.5 h-2.5 text-emerald-600" />
                                    {pBranch.name}
                                  </span>
                                ) : null;
                              })()}
                              {p.address && <span className="text-[10px] text-slate-400 line-clamp-1">{p.address}</span>}
                            </div>
                          </td>
                          {canViewPatientPhone && (
                            <td className="py-3.5 px-4 text-slate-600 font-mono">
                              {p.phone ? (
                                <span className="flex items-center gap-1">
                                  <Phone className="w-3 h-3 text-slate-400" /> {p.phone}
                                </span>
                              ) : "-"}
                            </td>
                          )}
                          <td className="py-3.5 px-4 text-slate-600">
                            <span className="font-semibold text-slate-700">{p.gender === "L" ? "Laki-laki" : p.gender === "P" ? "Perempuan" : "Belum diketahui"}</span>
                            <div className="text-[10px] text-slate-400">{p.dateOfBirth || "Tanggal lahir belum diketahui"}</div>
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
                              {checkInRoutePrefix && (
                                <button
                                  onClick={() => handleOpenWalkInSchedule(p)}
                                  className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded text-[11px] font-semibold transition-colors flex items-center gap-1"
                                  title="Buat jadwal Walk-In untuk pasien ini"
                                >
                                  <Calendar className="w-3 h-3" /> Jadwalkan
                                </button>
                              )}
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
                  {selectedPatient.medicalRecordNumber || "Belum check-in"}
                </span>
                {selectedPatient.internalPatientCode && (
                  <span className="text-[9px] font-mono text-slate-500 block">
                    Kode internal: {selectedPatient.internalPatientCode}
                  </span>
                )}
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
              {canViewPatientPhone && <div className="flex items-start gap-2.5 text-slate-600">
                <Phone className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
                <div>
                  <span className="text-[10px] text-slate-400 block">WhatsApp / No. Telp</span>
                  <span className="font-mono font-semibold text-slate-700">{selectedPatient.phone || "Tidak diisi"}</span>
                </div>
              </div>}
              {(selectedPatient.emergencyContactName || selectedPatient.emergencyContactPhone) && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
                  <span className="mb-1 block text-[10px] font-bold">Kontak Darurat</span>
                  <span className="block text-xs font-semibold">{selectedPatient.emergencyContactName || "Nama tidak diisi"}</span>
                  <span className="font-mono text-[11px]">{selectedPatient.emergencyContactPhone || "Nomor tidak diisi"}</span>
                  {selectedPatient.emergencyContactRelationship && (
                    <span className="ml-2 text-[10px] text-amber-800">({selectedPatient.emergencyContactRelationship})</span>
                  )}
                </div>
              )}

              <div className="flex items-start gap-2.5 text-slate-600">
                <User className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
                <div>
                  <span className="text-[10px] text-slate-400 block">Gender & Tanggal Lahir</span>
                  <span className="font-semibold text-slate-700">
                    {selectedPatient.gender === "L" ? "Laki-laki" : selectedPatient.gender === "P" ? "Perempuan" : "Belum diketahui"} ({selectedPatient.dateOfBirth || "Tanggal lahir belum diketahui"})
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

              <div className="flex items-start gap-2.5 text-slate-600">
                <Building2 className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
                <div>
                  <span className="text-[10px] text-slate-400 block">Cabang Pendaftaran (Master)</span>
                  <span className="font-semibold text-slate-700">
                    {branches.find((b) => b.id === (selectedPatient.registeredBranchId || selectedPatient.branch_id || selectedPatient.assignedBranchId || selectedPatient.branchId))?.name || "Semua Cabang / Tidak Ditentukan"}
                  </span>
                </div>
              </div>

              {canReadMedicalRecords && selectedPatient.medicalHistoryNotes && (
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
                {checkInRoutePrefix && (
                  <button
                    onClick={() => handleOpenWalkInSchedule(selectedPatient)}
                    className="text-[11px] font-bold text-amber-600 hover:text-amber-700 flex items-center gap-1"
                  >
                    + Jadwalkan Walk-In
                  </button>
                )}
              </div>
              {canReadMedicalRecords && (
                <div className="mb-3 rounded-lg border border-teal-100 bg-teal-50 p-3 text-[11px] leading-relaxed text-teal-900">
                  <span className="font-bold">Rekam medis digital bersifat opsional.</span>{" "}
                  Dokter dapat mengisi catatan kunjungan di sini atau tetap menggunakan pencatatan manual. Pilihan ini tidak memblokir treatment maupun alur kunjungan.
                </div>
              )}

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
                          <span>
                            {v.complaint?.startsWith("[Riwayat historis impor")
                              ? formatDate(v.visitDateTime)
                              : formatDateTime(v.visitDateTime)}
                          </span>
                          <span className="font-semibold text-slate-600">{v.visitStatus}</span>
                        </div>

                        {v.complaint && (
                          <p className="text-[10px] text-slate-500 bg-white p-1.5 rounded border border-slate-100 italic whitespace-pre-line">
                            "{v.complaint}"
                          </p>
                        )}

                        {v.bookingId && (
                          <div className="text-[9px] text-blue-600 font-mono">Ref Booking: {v.bookingId}</div>
                        )}

                        {canReadMedicalRecords && (
                          <div className="pt-1.5 flex items-center justify-end">
                            <button
                              onClick={() => handleOpenMedicalRecord(v)}
                              className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded text-[11px] font-bold flex items-center gap-1 transition-colors"
                              title="Buka atau isi rekam medis digital untuk kunjungan ini (opsional)"
                            >
                              <FileText className="w-3 h-3" /> Rekam Medis Digital
                            </button>
                          </div>
                        )}
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
          <div className="bg-white rounded-2xl border border-slate-100 shadow-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4 animate-scale-in">
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
                        <div className="text-[10px] text-slate-500 font-mono">
                          RM: {dup.medicalRecordNumber || "Belum check-in"}
                          {canViewPatientPhone && ` | WA: ${dup.phone}`}
                        </div>
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

                <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3 space-y-3">
                  <div>
                    <h3 className="font-bold text-slate-800">Identitas utama</h3>
                    <p className="mt-0.5 text-[10px] text-slate-500">Wajib diisi untuk pasien baru. Nomor RM tetap diterbitkan saat check-in pertama.</p>
                  </div>
                  <div className="grid grid-cols-[120px_1fr] gap-2">
                    <select
                      value={patientForm.identityDocumentType}
                      onChange={(e) => setPatientForm({ ...patientForm, identityDocumentType: e.target.value as "NIK" | "PASSPORT", identityDocumentNumber: "" })}
                      aria-label="Jenis identitas pasien"
                      className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-slate-800"
                    >
                      <option value="NIK">NIK</option>
                      <option value="PASSPORT">Paspor</option>
                    </select>
                    <input
                      type="text"
                      inputMode={patientForm.identityDocumentType === "NIK" ? "numeric" : "text"}
                      maxLength={patientForm.identityDocumentType === "NIK" ? 16 : 20}
                      value={patientForm.identityDocumentNumber}
                      onChange={(e) => setPatientForm({ ...patientForm, identityDocumentNumber: e.target.value.replace(/\s/g, "") })}
                      placeholder={patientForm.identityDocumentType === "NIK" ? "NIK 16 digit" : "Nomor paspor"}
                      required={!patientForm.id}
                      className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-slate-800"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={patientForm.placeOfBirth}
                      onChange={(e) => setPatientForm({ ...patientForm, placeOfBirth: e.target.value })}
                      placeholder="Tempat lahir"
                      required={!patientForm.id}
                      className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-slate-800"
                    />
                    <input
                      type="date"
                      value={patientForm.dateOfBirth}
                      onChange={(e) => setPatientForm({ ...patientForm, dateOfBirth: e.target.value })}
                      max={getOperationalDateString(new Date().toISOString())}
                      required={!patientForm.id}
                      aria-label="Tanggal lahir pasien"
                      className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Jenis Kelamin <span className="text-rose-500">*</span></label>
                    <select
                      value={patientForm.gender}
                      onChange={(e) => setPatientForm({ ...patientForm, gender: e.target.value as "L" | "P" | "" })}
                      required
                      className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-slate-800"
                    >
                      <option value="">Pilih jenis kelamin</option>
                      <option value="L">Laki-laki (L)</option>
                      <option value="P">Perempuan (P)</option>
                    </select>
                  </div>
                </div>

                {/* Field Dropdown Pilihan Cabang (assigned_branch_id / branch_id) */}
                <div>
                  <label htmlFor="input-patient-branch" className="block font-semibold text-slate-700 mb-1 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-emerald-600" />
                      Cabang Asal Pasien (opsional)
                    </span>
                    {currentUser?.assignedBranchId && (
                      <span className="text-[10px] text-slate-400 font-normal">
                        Default: {branches.find((b) => b.id === currentUser.assignedBranchId)?.name || currentUser.assignedBranchId}
                      </span>
                    )}
                  </label>
                  <select
                    id="input-patient-branch"
                    value={patientForm.registeredBranchId}
                    onChange={(e) => setPatientForm({ ...patientForm, registeredBranchId: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 font-medium text-xs"
                  >
                    <option value="">Belum ditentukan</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        🏥 {b.name} {b.branchCode ? `(${b.branchCode})` : ""}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-slate-500 mt-1">
                    Cabang kunjungan dipilih saat booking atau check-in; profil pasien tidak harus terikat ke satu cabang.
                  </p>
                </div>

                {/* Bagian Nomor Rekam Medis (No RM) */}
                <div className="bg-slate-50/90 p-3 rounded-xl border border-slate-200 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <label className="block font-semibold text-slate-700">
                      Nomor Rekam Medis (No. RM)
                    </label>
                    {!patientForm.id && (
                      <div className="flex items-center gap-1 bg-slate-200/80 p-0.5 rounded-lg text-[10px] font-bold">
                        <button
                          type="button"
                          onClick={() => {
                            setRmMode("auto");
                            setPatientForm({ ...patientForm, medicalRecordNumber: "" });
                          }}
                          className={`px-2 py-0.5 rounded-md transition-all ${
                            rmMode === "auto"
                              ? "bg-white text-emerald-800 shadow-2xs font-extrabold"
                              : "text-slate-600 hover:text-slate-900"
                          }`}
                        >
                          ✨ Terbit saat check-in
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setRmMode("manual");
                            setPatientForm({ ...patientForm, medicalRecordNumber: "" });
                          }}
                          className={`px-2 py-0.5 rounded-md transition-all ${
                            rmMode === "manual"
                              ? "bg-white text-amber-800 shadow-2xs font-extrabold"
                              : "text-slate-600 hover:text-slate-900"
                          }`}
                        >
                          ✏️ Input Manual (Pasien Lama)
                        </button>
                      </div>
                    )}
                  </div>

                  {rmMode === "auto" && !patientForm.id ? (
                    <div className="flex items-center justify-between bg-emerald-50/80 border border-emerald-200 rounded-lg p-2.5">
                      <div>
                        <div className="text-[11px] font-bold text-emerald-800 flex items-center gap-1.5">
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                          <span>No. RM belum diterbitkan</span>
                        </div>
                        <span className="text-[10px] text-emerald-800">Nomor dibuat otomatis saat pasien check-in pertama kali.</span>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="relative">
                        <input
                          type="text"
                          value={patientForm.medicalRecordNumber}
                          onChange={(e) => setPatientForm({ ...patientForm, medicalRecordNumber: e.target.value })}
                          placeholder="Ketik No. RM lama (contoh: 3000, 2500, dll)"
                          className={`w-full bg-white border rounded-lg p-2.5 font-mono text-xs text-slate-800 focus:outline-none focus:ring-2 ${
                            manualRMValidation && !manualRMValidation.isUnique
                              ? "border-rose-400 focus:ring-rose-400/20 bg-rose-50/30"
                              : "border-slate-300 focus:ring-emerald-500/20"
                          }`}
                          id="input-patient-rm"
                          autoFocus={rmMode === "manual"}
                        />
                        {manualRMValidation && (
                          <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                            {manualRMValidation.isUnique ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                                <CheckCircle className="w-3 h-3" /> Unik / Tersedia
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded">
                                <AlertTriangle className="w-3 h-3" /> Duplikat
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Feedback validation note */}
                      {manualRMValidation && !manualRMValidation.isUnique && manualRMValidation.conflictPatient && (
                        <p className="text-[11px] text-rose-600 font-semibold mt-1">
                          ⚠️ No. RM &quot;{patientForm.medicalRecordNumber}&quot; sudah digunakan oleh pasien <strong>{manualRMValidation.conflictPatient.fullName || manualRMValidation.conflictPatient.name}</strong>. Silakan gunakan nomor lain agar tidak ada duplikasi.
                        </p>
                      )}
                      {manualRMValidation && manualRMValidation.isUnique && (
                        <p className="text-[11px] text-emerald-600 font-medium mt-1">
                          ✅ Nomor RM valid. Pasien baru berikutnya akan otomatis melanjutkan dari nomor tertinggi (+1).
                        </p>
                      )}
                      {!manualRMValidation && (
                        <p className="text-[10px] text-slate-500 mt-1">
                          💡 Masukkan nomor rekam medis atau nomor kunjungan pasien terdahulu. Sistem otomatis mencegah nomor duplikat dan meneruskan nomor urut berikutnya.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {canViewPatientPhone && <div>
                  <label className="block font-semibold text-slate-700 mb-1">WhatsApp / No. HP <span className="font-normal text-slate-400">(opsional)</span></label>
                  <input
                    type="text"
                    value={patientForm.phone}
                    onChange={(e) => setPatientForm({ ...patientForm, phone: e.target.value })}
                    placeholder="08123456789"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    id="input-patient-phone"
                  />
                </div>}

                <div>
                  <label htmlFor="input-patient-email" className="block font-semibold text-slate-700 mb-1">
                    Email Pasien <span className="font-normal text-slate-400">(opsional)</span>
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      id="input-patient-email"
                      type="email"
                      autoComplete="email"
                      value={patientForm.email}
                      onChange={(e) => setPatientForm({ ...patientForm, email: e.target.value })}
                      placeholder="nama@email.com"
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 pl-10 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    />
                  </div>
                  <p className="mt-1 text-[10px] text-slate-500">
                    Gunakan email pasien yang sudah diverifikasi di portal agar profil dapat ditautkan otomatis.
                  </p>
                </div>

                <section className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/50 p-3">
                  <div>
                    <h3 className="font-bold text-slate-800">Kontak Darurat <span className="font-normal text-slate-400">(opsional)</span></h3>
                    <p className="mt-0.5 text-[10px] text-slate-500">Orang yang dapat dihubungi bila pasien membutuhkan bantuan.</p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <input
                      type="text"
                      maxLength={150}
                      value={patientForm.emergencyContactName}
                      onChange={(event) => setPatientForm({ ...patientForm, emergencyContactName: event.target.value })}
                      placeholder="Nama kontak"
                      aria-label="Nama kontak darurat"
                      className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-slate-800"
                    />
                    <input
                      type="tel"
                      maxLength={50}
                      value={patientForm.emergencyContactPhone}
                      onChange={(event) => setPatientForm({ ...patientForm, emergencyContactPhone: event.target.value })}
                      placeholder="Nomor telepon"
                      aria-label="Nomor telepon kontak darurat"
                      className="w-full rounded-lg border border-slate-200 bg-white p-2.5 font-mono text-slate-800"
                    />
                    <input
                      type="text"
                      maxLength={80}
                      value={patientForm.emergencyContactRelationship}
                      onChange={(event) => setPatientForm({ ...patientForm, emergencyContactRelationship: event.target.value })}
                      placeholder="Hubungan (keluarga, dll.)"
                      aria-label="Hubungan kontak darurat"
                      className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-slate-800"
                    />
                  </div>
                </section>

                <div>
                  <label htmlFor="input-patient-acquisition-source" className="block font-semibold text-slate-700 mb-1">
                    Sumber Mengetahui Klinik <span className="font-normal text-slate-400">(opsional)</span>
                  </label>
                  <select
                    id="input-patient-acquisition-source"
                    value={patientForm.acquisitionSource || "UNKNOWN"}
                    onChange={(e) => setPatientForm({
                      ...patientForm,
                      acquisitionSource: e.target.value as PatientProfile["acquisitionSource"],
                      referralName: e.target.value === "REFERRAL" ? patientForm.referralName : ""
                    })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  >
                    <option value="UNKNOWN">Belum diketahui</option>
                    <option value="GOOGLE_MAPS">Google / Google Maps</option>
                    <option value="INSTAGRAM">Instagram</option>
                    <option value="FACEBOOK">Facebook</option>
                    <option value="WHATSAPP">WhatsApp / kanal digital lainnya</option>
                    <option value="REFERRAL">Rujukan teman / keluarga</option>
                    <option value="DIRECT">Langsung datang</option>
                    <option value="OTHER">Lainnya</option>
                  </select>
                  <p className="text-[10px] text-slate-500 mt-1">
                    Ini mencatat sumber pasien mengetahui klinik, bukan kanal yang digunakan untuk booking.
                  </p>
                </div>

                {patientForm.acquisitionSource === "REFERRAL" && (
                  <div>
                    <label htmlFor="input-patient-referral-name" className="block font-semibold text-slate-700 mb-1">
                      Nama Pengajak <span className="font-normal text-slate-400">(opsional)</span>
                    </label>
                    <input
                      id="input-patient-referral-name"
                      type="text"
                      value={patientForm.referralName}
                      onChange={(e) => setPatientForm({ ...patientForm, referralName: e.target.value })}
                      placeholder="Nama teman atau keluarga yang mengajak"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    />
                  </div>
                )}

                <div>
                  <label htmlFor="input-patient-referring-staff" className="block font-semibold text-slate-700 mb-1">
                    Admin Perujuk Pasien
                  </label>
                  <select
                    id="input-patient-referring-staff"
                    value={patientForm.referringStaffId}
                    onChange={(e) => setPatientForm({ ...patientForm, referringStaffId: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  >
                    <option value="">Tidak ada / belum dicatat</option>
                    {staff
                      .filter((employee) => employee.position === "BRANCH_ADMIN" && employee.active)
                      .map((employee) => (
                        <option key={employee.id} value={employee.id}>
                          {employee.fullName} ({employee.employeeCode})
                        </option>
                      ))}
                  </select>
                  <p className="text-[10px] text-slate-500 mt-1">
                    Insentif referral Rp3.000 hanya dihitung satu kali setelah tindakan selesai dan invoice lunas.
                  </p>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Alamat Lengkap <span className="font-normal text-slate-400">(opsional)</span></label>
                  <textarea
                    rows={2}
                    value={patientForm.address}
                    onChange={(e) => setPatientForm({ ...patientForm, address: e.target.value })}
                    placeholder="Alamat tempat tinggal pasien..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>

                <div className="rounded-xl border border-slate-200 p-3 space-y-3">
                  <div>
                    <h3 className="font-bold text-slate-800">Data kontak & sosial <span className="font-normal text-slate-400">(opsional)</span></h3>
                    <p className="mt-0.5 text-[10px] text-slate-500">Dapat dilengkapi atau diperbarui kemudian.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={patientForm.occupation}
                      onChange={(e) => setPatientForm({ ...patientForm, occupation: e.target.value })}
                      placeholder="Pekerjaan"
                      aria-label="Pekerjaan pasien"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-800"
                    />
                    <select
                      value={patientForm.religion}
                      onChange={(e) => setPatientForm({ ...patientForm, religion: e.target.value })}
                      aria-label="Agama atau kepercayaan pasien"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-800"
                    >
                      <option value="">Agama / kepercayaan</option>
                      <option value="Islam">Islam</option>
                      <option value="Kristen">Kristen</option>
                      <option value="Katolik">Katolik</option>
                      <option value="Hindu">Hindu</option>
                      <option value="Buddha">Buddha</option>
                      <option value="Konghucu">Konghucu</option>
                      <option value="Kepercayaan lainnya">Kepercayaan lainnya</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={patientForm.maritalStatus}
                      onChange={(e) => setPatientForm({ ...patientForm, maritalStatus: e.target.value })}
                      aria-label="Status pernikahan pasien"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-800"
                    >
                      <option value="">Status pernikahan</option>
                      <option value="Belum menikah">Belum menikah</option>
                      <option value="Menikah">Menikah</option>
                      <option value="Cerai hidup">Cerai hidup</option>
                      <option value="Cerai mati">Cerai mati</option>
                    </select>
                    <select
                      value={patientForm.education}
                      onChange={(e) => setPatientForm({ ...patientForm, education: e.target.value })}
                      aria-label="Pendidikan terakhir pasien"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-800"
                    >
                      <option value="">Pendidikan terakhir</option>
                      <option value="Tidak sekolah">Tidak sekolah</option>
                      <option value="SD/sederajat">SD/sederajat</option>
                      <option value="SMP/sederajat">SMP/sederajat</option>
                      <option value="SMA/sederajat">SMA/sederajat</option>
                      <option value="Diploma">Diploma</option>
                      <option value="S1">S1</option>
                      <option value="S2">S2</option>
                      <option value="S3">S3</option>
                      <option value="Lainnya">Lainnya</option>
                    </select>
                  </div>
                </div>

                {canReadMedicalRecords && (
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Catatan Riwayat Medis / Alergi</label>
                    <input
                      type="text"
                      value={patientForm.medicalHistoryNotes}
                      onChange={(e) => setPatientForm({ ...patientForm, medicalHistoryNotes: e.target.value })}
                      placeholder="Alergi obat, penyakit sistemik, obat rutin..."
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    />
                  </div>
                )}

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
                      disabled={isSubmitting || Boolean(manualRMValidation && !manualRMValidation.isUnique)}
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
                    {selectedPatient.medicalRecordNumber || "Belum check-in"}
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
                  Rekam Medis Digital: {selectedPatient.fullName || selectedPatient.name}
                </h2>
                <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                  <span>Visit: {formatDateTime(selectedVisitForMR.visitDateTime)}</span>
                  <span>•</span>
                  <span>{branches.find((b) => b.id === selectedVisitForMR.branchId)?.name || selectedVisitForMR.branchId}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {canReadMedicalRecords && (
                  <button
                    type="button"
                    onClick={handlePrintMedicalRecord}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-2 text-[11px] font-bold text-slate-700 hover:bg-slate-200"
                    title="Cetak atau simpan sebagai PDF, format formulir klinik A4"
                  >
                    <Printer className="h-4 w-4" /> Cetak / PDF
                  </button>
                )}
                <button
                  onClick={() => setMrModalOpen(false)}
                  className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
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
              <div className="rounded-lg border border-teal-100 bg-teal-50 p-3 text-[11px] leading-relaxed text-teal-900">
                Catatan digital ini opsional untuk kunjungan ini. Jika dokter memilih pencatatan manual, tutup formulir ini; kunjungan dan treatment tetap dapat dilanjutkan.
              </div>
              {!canEditMedicalRecords && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-600">
                  Hanya Dokter dan Super Admin yang dapat membaca isi rekam medis klinis.
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
                  <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-3.5">
                    <div>
                      <h3 className="text-xs font-bold text-slate-800">Identitas Pasien</h3>
                      <p className="mt-0.5 text-[10px] text-slate-500">Data diambil dari profil pasien dan tidak diubah dari formulir kunjungan ini.</p>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {[
                        ["No. Rekam Medis", selectedPatient.medicalRecordNumber || "Belum tersedia"],
                        ["Nama", selectedPatient.fullName || selectedPatient.name],
                        [
                          "Tempat / Tanggal Lahir",
                          [selectedPatient.placeOfBirth, selectedPatient.dateOfBirth].filter(Boolean).join(" / ") || "-"
                        ],
                        ["Jenis Kelamin", selectedPatient.gender === "L" ? "Laki-laki" : selectedPatient.gender === "P" ? "Perempuan" : "Belum diketahui"],
                        ["Pekerjaan", selectedPatient.occupation || "-"],
                        ["Alamat", selectedPatient.address || "-"],
                        ["Telepon", selectedPatient.phone || "-"]
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-lg bg-slate-50 px-3 py-2">
                          <div className="text-[10px] font-semibold text-slate-500">{label}</div>
                          <div className="mt-0.5 whitespace-pre-wrap text-xs text-slate-800">{value}</div>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="space-y-3 rounded-xl border border-rose-100 bg-rose-50/60 p-3.5">
                    <div>
                      <h3 className="text-xs font-bold text-rose-900">Riwayat Medis Pasien</h3>
                      <p className="mt-0.5 text-[10px] text-rose-800">
                        Profil ini berlaku lintas kunjungan dan hanya dapat diubah dokter atau Super Admin.
                      </p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="text-[11px] font-semibold text-slate-700">
                        Golongan darah
                        <select
                          value={medicalProfile.bloodType || ""}
                          disabled={!canEditMedicalRecords || loadingMR}
                          onChange={(event) => setMedicalProfile((profile) => ({ ...profile, bloodType: event.target.value }))}
                          className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs disabled:bg-slate-100"
                        >
                          <option value="">Belum diketahui</option>
                          {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((type) => (
                            <option key={type} value={type}>{type}</option>
                          ))}
                        </select>
                      </label>
                      {[
                        ["Alergi obat-obatan", "medicationAllergies", "Contoh: penisilin, lateks, anestesi lokal"],
                        ["Alergi makanan", "foodAllergies", "Tuliskan jenis makanan pemicu alergi"],
                        ["Penyakit bawaan", "congenitalDiseases", "Tuliskan penyakit bawaan pasien"]
                      ].map(([label, key, placeholder]) => (
                        <label key={key} className="text-[11px] font-semibold text-slate-700">
                          {label}
                          <textarea
                            rows={2}
                            value={medicalProfile[key as keyof PatientMedicalProfile] as string || ""}
                            disabled={!canEditMedicalRecords || loadingMR}
                            onChange={(event) => {
                              setMedicalProfile((profile) => ({ ...profile, [key]: event.target.value }));
                              setMedicalProfileSaved(false);
                            }}
                            placeholder={placeholder}
                            className="mt-1 block w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs disabled:bg-slate-100"
                          />
                        </label>
                      ))}
                      <details className="sm:col-span-2 rounded-lg border border-rose-100 bg-white p-3">
                        <summary className="cursor-pointer text-[11px] font-semibold text-rose-900">
                          Riwayat medis tambahan (opsional)
                        </summary>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      {[
                        ["Alergi lainnya", "allergies", "Alergi lain yang belum tercatat di atas"],
                        ["Penyakit sistemik", "systemicDiseases", "Contoh: diabetes, hipertensi, penyakit jantung"],
                        ["Obat rutin", "routineMedications", "Nama obat, dosis, dan frekuensi bila diketahui"],
                        ["Peringatan medis", "medicalWarnings", "Contoh: penggunaan pengencer darah atau riwayat perdarahan"],
                        ["Riwayat medis tambahan", "medicalHistoryNotes", "Riwayat penyakit, alergi, atau tindakan medis terdahulu"]
                      ].map(([label, key, placeholder]) => (
                        <label key={key} className="text-[11px] font-semibold text-slate-700">
                          {label}
                          <textarea
                            rows={2}
                            value={medicalProfile[key as keyof PatientMedicalProfile] as string || ""}
                            disabled={!canEditMedicalRecords || loadingMR}
                            onChange={(event) => {
                              setMedicalProfile((profile) => ({ ...profile, [key]: event.target.value }));
                              setMedicalProfileSaved(false);
                            }}
                            placeholder={placeholder}
                            className="mt-1 block w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs disabled:bg-slate-100"
                          />
                        </label>
                      ))}
                        </div>
                      </details>
                    </div>
                    {canEditMedicalRecords && (
                      <div className="flex items-center justify-end gap-2">
                        {medicalProfileSaved && <span className="text-[10px] font-semibold text-emerald-700">Profil medis tersimpan</span>}
                        <button
                          type="button"
                          onClick={handleSaveMedicalProfile}
                          disabled={savingMedicalProfile || loadingMR}
                          className="rounded-lg bg-rose-700 px-3 py-2 text-[11px] font-bold text-white hover:bg-rose-800 disabled:opacity-50"
                        >
                          {savingMedicalProfile ? "Menyimpan profil..." : "Simpan Profil Medis"}
                        </button>
                      </div>
                    )}
                  </section>

                  <details className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                    <summary className="cursor-pointer text-xs font-bold text-slate-800">
                      Tanda vital (opsional; isi jika diukur atau diperlukan)
                    </summary>
                    <p className="mt-1 text-[10px] text-slate-500">Bagian ini tidak tercantum pada lembar rekam medis klinik.</p>
                    <div className="grid gap-3 sm:grid-cols-4">
                      {([
                        ["Tekanan darah sistolik", "systolicBloodPressure", "mmHg"],
                        ["Tekanan darah diastolik", "diastolicBloodPressure", "mmHg"],
                        ["Nadi", "pulseBpm", "x/menit"],
                        ["Suhu", "temperatureCelsius", "°C"],
                        ["Laju napas", "respiratoryRatePerMinute", "x/menit"],
                        ["Saturasi oksigen", "oxygenSaturationPercent", "%"],
                        ["Berat badan", "weightKg", "kg"],
                        ["Tinggi badan", "heightCm", "cm"]
                      ] as Array<[string, keyof ClinicalVitalSigns, string]>).map(([label, key, unit]) => (
                        <label key={key} className="text-[10px] font-semibold text-slate-600">
                          {label} ({unit})
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={mrForm.vitalSigns[key] ?? ""}
                            disabled={!canEditMedicalRecords || existingMR?.status === MedicalRecordStatus.FINAL}
                            onChange={(event) => updateVitalSign(key, event.target.value)}
                            className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs disabled:bg-slate-100"
                          />
                        </label>
                      ))}
                    </div>
                  </details>

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

                  {canReadMedicalRecords && (
                    <details className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3.5">
                      <summary className="cursor-pointer text-xs font-bold text-indigo-950">
                        Dokumen informed consent (arsip terpisah)
                        {consentDocuments.length > 0 && ` · ${consentDocuments.length} dokumen`}
                        {visitTreatments.some((treatment) =>
                          services.some((service) => service.id === treatment.serviceId && service.requiresConsent) &&
                          !consentDocuments.some((document) =>
                            document.scope === "TREATMENT" && document.treatmentJobId === treatment.id
                          )
                        ) && <span className="ml-1 text-amber-700">· consent tindakan belum diunggah</span>}
                      </summary>
                      <div className="mt-3 space-y-3">
                        <p className="text-[10px] leading-relaxed text-indigo-900">
                          Unggah dokumen yang sudah disiapkan dan ditandatangani di luar aplikasi. Aplikasi tidak membuat teks consent atau memverifikasi validitas hukumnya. Format PDF/JPG/PNG, maksimal 10 MB.
                        </p>
                      </div>
                      {consentError && (
                        <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-[10px] text-rose-700">
                          {consentError}
                        </div>
                      )}

                      <div className="rounded-lg border border-indigo-100 bg-white p-3 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <div className="text-[11px] font-bold text-slate-800">Consent umum kunjungan</div>
                            <div className="text-[10px] text-slate-500">Berlaku untuk kunjungan ini.</div>
                          </div>
                          {canEditMedicalRecords && (
                            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-indigo-700 px-3 py-2 text-[10px] font-bold text-white hover:bg-indigo-800">
                              <Upload className="h-3.5 w-3.5" />
                              {uploadingConsentKey === "VISIT" ? "Mengunggah..." : "Unggah dokumen"}
                              <input
                                type="file"
                                accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                                className="sr-only"
                                disabled={Boolean(uploadingConsentKey)}
                                onChange={(event) => {
                                  const file = event.currentTarget.files?.[0];
                                  event.currentTarget.value = "";
                                  if (file) void handleUploadConsentDocument(file, "VISIT");
                                }}
                              />
                            </label>
                          )}
                        </div>
                        {consentDocuments
                          .filter((document) => document.scope === "VISIT")
                          .map((document) => (
                            <div key={document.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-slate-50 px-2.5 py-2">
                              <div className="min-w-0">
                                <div className="truncate text-[10px] font-semibold text-slate-700">{document.fileName}</div>
                                <div className="text-[9px] text-slate-500">
                                  {formatDateTime(document.uploadedAt)} · {(document.sizeBytes / 1024).toFixed(0)} KB
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => void handleDownloadConsentDocument(document)}
                                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold text-indigo-700 hover:bg-indigo-50"
                              >
                                <Download className="h-3 w-3" /> Unduh
                              </button>
                            </div>
                          ))}
                        {!consentDocuments.some((document) => document.scope === "VISIT") && (
                          <p className="text-[10px] text-slate-500">Belum ada dokumen consent umum untuk kunjungan ini.</p>
                        )}
                      </div>

                      {visitTreatments
                        .filter((treatment) => services.some((service) => service.id === treatment.serviceId && service.requiresConsent))
                        .map((treatment) => {
                          const treatmentDocuments = consentDocuments.filter(
                            (document) => document.scope === "TREATMENT" && document.treatmentJobId === treatment.id
                          );
                          return (
                            <div key={treatment.id} className="rounded-lg border border-indigo-100 bg-white p-3 space-y-2">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                  <div className="text-[11px] font-bold text-slate-800">Consent tindakan: {treatment.serviceNameSnapshot}</div>
                                  <div className="text-[10px] text-slate-500">Layanan ini ditandai wajib consent.</div>
                                </div>
                                {canEditMedicalRecords && (
                                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-indigo-700 px-3 py-2 text-[10px] font-bold text-white hover:bg-indigo-800">
                                    <Upload className="h-3.5 w-3.5" />
                                    {uploadingConsentKey === treatment.id ? "Mengunggah..." : "Unggah dokumen"}
                                    <input
                                      type="file"
                                      accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                                      className="sr-only"
                                      disabled={Boolean(uploadingConsentKey)}
                                      onChange={(event) => {
                                        const file = event.currentTarget.files?.[0];
                                        event.currentTarget.value = "";
                                        if (file) void handleUploadConsentDocument(file, "TREATMENT", treatment.id);
                                      }}
                                    />
                                  </label>
                                )}
                              </div>
                              {treatmentDocuments.map((document) => (
                                <div key={document.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-slate-50 px-2.5 py-2">
                                  <div className="min-w-0">
                                    <div className="truncate text-[10px] font-semibold text-slate-700">{document.fileName}</div>
                                    <div className="text-[9px] text-slate-500">
                                      {formatDateTime(document.uploadedAt)} · {(document.sizeBytes / 1024).toFixed(0)} KB
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => void handleDownloadConsentDocument(document)}
                                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold text-indigo-700 hover:bg-indigo-50"
                                  >
                                    <Download className="h-3 w-3" /> Unduh
                                  </button>
                                </div>
                              ))}
                              {treatmentDocuments.length === 0 && (
                                <p className="text-[10px] text-amber-700">Belum ada dokumen consent yang diarsipkan untuk tindakan ini.</p>
                              )}
                            </div>
                          );
                        })}
                      {visitTreatments.every((treatment) =>
                        !services.some((service) => service.id === treatment.serviceId && service.requiresConsent)
                      ) && (
                        <p className="text-[10px] text-slate-500">
                          Belum ada tindakan kunjungan ini yang ditandai wajib consent.
                        </p>
                      )}
                    </details>
                  )}

                  <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-3.5">
                    <div>
                      <h3 className="text-xs font-bold text-slate-800">Anamnesa & Pemeriksaan Fisik</h3>
                      <p className="mt-0.5 text-[10px] text-slate-500">
                        Bagian ini mengisi kolom anamnesa dan pemeriksaan fisik pada formulir klinik.
                      </p>
                    </div>
                  {/* Keluhan Utama */}
                  <div>
                    <label className="block font-bold text-slate-700 mb-1 text-xs">
                      Keluhan Utama <span className="text-rose-500">*</span>
                    </label>
                    <textarea
                      rows={2}
                      value={mrForm.chiefComplaint}
                      onChange={(e) => setMrForm({ ...mrForm, chiefComplaint: e.target.value })}
                      disabled={!canEditMedicalRecords || existingMR?.status === MedicalRecordStatus.FINAL}
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
                      disabled={!canEditMedicalRecords || existingMR?.status === MedicalRecordStatus.FINAL}
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
                      disabled={!canEditMedicalRecords || existingMR?.status === MedicalRecordStatus.FINAL}
                      placeholder="Pemeriksaan ekstraoral/intraoral, palpasi, perkusi, CE, sondasi..."
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:bg-slate-100 disabled:text-slate-500"
                    />
                  </div>
                  </section>

                  <details className="rounded-xl border border-cyan-100 bg-cyan-50/40 p-3.5">
                    <summary className="cursor-pointer text-xs font-bold text-cyan-950">
                      Form pemeriksaan odontogram (lembar terpisah)
                    </summary>
                    <div className="mt-3 space-y-3">
                      <Odontogram
                        value={mrForm.odontogram}
                        history={existingMR?.odontogramHistory}
                        disabled={!canEditMedicalRecords || existingMR?.status === MedicalRecordStatus.FINAL}
                        onChange={(odontogram) => setMrForm((previous) => ({ ...previous, odontogram }))}
                      />

                      <ClinicDentalAssessmentFields
                        value={mrForm.clinicFormData.dentalAssessment || {}}
                        disabled={!canEditMedicalRecords || existingMR?.status === MedicalRecordStatus.FINAL}
                        onChange={(dentalAssessment) =>
                          setMrForm((previous) => ({
                            ...previous,
                            clinicFormData: { ...previous.clinicFormData, dentalAssessment }
                          }))
                        }
                      />
                    </div>
                  </details>

                  {/* Diagnosis */}
                  <div>
                    <label className="block font-bold text-slate-700 mb-1 text-xs">
                      Diagnosis <span className="text-rose-500">*</span>
                    </label>
                    <textarea
                      rows={2}
                      value={mrForm.diagnosis}
                      onChange={(e) => setMrForm({ ...mrForm, diagnosis: e.target.value })}
                      disabled={!canEditMedicalRecords || existingMR?.status === MedicalRecordStatus.FINAL}
                      placeholder="Contoh: Pulpitis ireversibel gigi 36, Karies profunda gigi 46..."
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:bg-slate-100 disabled:text-slate-500"
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block font-bold text-slate-700 text-xs">
                      Kode Diagnosis ICD-10 <span className="font-normal text-slate-400">(opsional)</span>
                      <input
                        type="text"
                        value={mrForm.diagnosisCode}
                        onChange={(event) => setMrForm((previous) => ({ ...previous, diagnosisCode: event.target.value }))}
                        disabled={!canEditMedicalRecords || existingMR?.status === MedicalRecordStatus.FINAL}
                        placeholder="Masukkan kode terverifikasi dokter"
                        maxLength={8}
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 font-mono text-xs font-normal text-slate-800 disabled:bg-slate-100"
                      />
                    </label>
                  </div>
                  <details className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <summary className="cursor-pointer text-[11px] font-semibold text-slate-700">
                      Kode prosedur ICD-9-CM (tambahan, opsional)
                    </summary>
                    <label className="mt-3 block font-bold text-slate-700 text-xs">
                      Kode Prosedur ICD-9-CM <span className="font-normal text-slate-400">(satu kode per baris)</span>
                      <textarea
                        rows={2}
                        value={mrForm.procedureCodesText}
                        onChange={(event) => setMrForm((previous) => ({ ...previous, procedureCodesText: event.target.value }))}
                        disabled={!canEditMedicalRecords || existingMR?.status === MedicalRecordStatus.FINAL}
                        placeholder={"Masukkan kode terverifikasi dokter, satu per baris."}
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 font-mono text-xs font-normal text-slate-800 disabled:bg-slate-100"
                      />
                    </label>
                    <p className="mt-2 text-[10px] leading-relaxed text-amber-800">
                      Kode diketik manual; aplikasi hanya memeriksa format, bukan validitas klinis. Pilihan kode dan kecocokannya harus diverifikasi dokter.
                    </p>
                  </details>

                  {/* Rencana / Tindakan */}
                  <div>
                    <label className="block font-bold text-slate-700 mb-1 text-xs">Terapi / Tindakan</label>
                    <textarea
                      rows={2}
                      value={mrForm.treatmentPlan}
                      onChange={(e) => setMrForm({ ...mrForm, treatmentPlan: e.target.value })}
                      disabled={!canEditMedicalRecords || existingMR?.status === MedicalRecordStatus.FINAL}
                      placeholder="Rencana perawatan & tindakan yang dilakukan pada kunjungan ini..."
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:bg-slate-100 disabled:text-slate-500"
                    />
                  </div>

                  <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-3.5">
                    <div>
                      <h3 className="text-xs font-bold text-slate-800">Keterangan Formulir Klinik</h3>
                      <p className="mt-0.5 text-[10px] text-slate-500">Kolom B dan L dipertahankan sesuai label pada formulir asli.</p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {([
                        ["B", mrForm.clinicFormData.noteB, "noteB"],
                        ["L", mrForm.clinicFormData.noteL, "noteL"]
                      ] as const).map(([label, note, key]) => (
                        <label key={key} className="text-[11px] font-semibold text-slate-700">
                          Keterangan {label}
                          <textarea
                            rows={2}
                            value={note || ""}
                            disabled={!canEditMedicalRecords || existingMR?.status === MedicalRecordStatus.FINAL}
                            onChange={(event) =>
                              setMrForm((previous) => ({
                                ...previous,
                                clinicFormData: { ...previous.clinicFormData, [key]: event.target.value }
                              }))
                            }
                            className="mt-1 block w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs font-normal disabled:bg-slate-100"
                          />
                        </label>
                      ))}
                    </div>
                  </section>

                  <details className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <summary className="cursor-pointer text-[11px] font-semibold text-slate-700">
                      Catatan dokter tambahan (opsional)
                    </summary>
                    <label className="mt-3 block font-bold text-slate-700 mb-1 text-xs">Catatan Dokter</label>
                    <textarea
                      rows={2}
                      value={mrForm.doctorNotes}
                      onChange={(e) => setMrForm({ ...mrForm, doctorNotes: e.target.value })}
                      disabled={!canEditMedicalRecords || existingMR?.status === MedicalRecordStatus.FINAL}
                      placeholder="Edukasi pasien, instruksi pasca tindakan, atau jadwal kontrol..."
                      className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:bg-slate-100 disabled:text-slate-500"
                    />
                  </details>

                  {/* Status Selection */}
                  {canEditMedicalRecords && existingMR?.status !== MedicalRecordStatus.FINAL && (
                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 flex items-center justify-between">
                      <div>
                        <span className="font-bold text-slate-700 block text-xs">Status Rekam Medis</span>
                        <span className="text-[10px] text-slate-400">
                          {canFinalizeMedicalRecords
                            ? "Pilih FINAL jika data klinis sudah lengkap; hanya dokter penanggung jawab yang dapat menandatangani."
                            : "Super Admin dapat menyimpan draft; finalisasi tetap dilakukan dokter penanggung jawab."}
                        </span>
                      </div>
                      <select
                        value={mrForm.status}
                        onChange={(e) => setMrForm({ ...mrForm, status: e.target.value as any })}
                        className="bg-white border border-slate-300 rounded-lg px-3 py-1 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                      >
                        <option value={MedicalRecordStatus.DRAFT}>DRAFT (Dapat Diedit)</option>
                        {canFinalizeMedicalRecords && <option value={MedicalRecordStatus.FINAL}>FINAL (Terkunci)</option>}
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
                    {canEditMedicalRecords && existingMR?.status !== MedicalRecordStatus.FINAL && (
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
                <span className="font-mono font-bold text-slate-800">{patientToDelete.medicalRecordNumber || "Belum check-in"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Nama Pasien:</span>
                <span className="font-bold text-slate-800">{patientToDelete.fullName || patientToDelete.name}</span>
              </div>
              {canViewPatientPhone && <div className="flex justify-between">
                <span className="text-slate-500">WhatsApp / HP:</span>
                <span className="font-mono text-slate-700">{patientToDelete.phone || "-"}</span>
              </div>}
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
      {/* MODAL: PENGATURAN FORMAT & NOMOR URUT RM    */}
      {/* ========================================== */}
      {isRMConfigModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-xl max-w-md w-full p-6 space-y-4 animate-scale-in">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Settings className="w-4 h-4 text-emerald-600" />
                Pengaturan Format & Nomor Rekam Medis (No RM)
              </h2>
              <button onClick={() => setIsRMConfigModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">
                  Format Penomoran Rekam Medis
                </label>
                <div className="space-y-2">
                  <label className={`flex items-start gap-3 p-2.5 rounded-xl border cursor-pointer transition-all ${
                    rmConfigForm.formatMode === "digits_only" ? "border-emerald-500 bg-emerald-50/50" : "border-slate-200 hover:bg-slate-50"
                  }`}>
                    <input
                      type="radio"
                      name="formatMode"
                      checked={rmConfigForm.formatMode === "digits_only"}
                      onChange={() => setRmConfigForm({ ...rmConfigForm, formatMode: "digits_only", prefix: "", padDigits: 0 })}
                      className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                    />
                    <div>
                      <div className="font-bold text-slate-800">Angka Saja (Contoh: 3000, 3001)</div>
                      <div className="text-[11px] text-slate-500">Direkomendasikan untuk nomor kunjungan & kartu fisik sederhana</div>
                    </div>
                  </label>

                  <label className={`flex items-start gap-3 p-2.5 rounded-xl border cursor-pointer transition-all ${
                    rmConfigForm.formatMode === "standard_prefix" ? "border-emerald-500 bg-emerald-50/50" : "border-slate-200 hover:bg-slate-50"
                  }`}>
                    <input
                      type="radio"
                      name="formatMode"
                      checked={rmConfigForm.formatMode === "standard_prefix"}
                      onChange={() => setRmConfigForm({ ...rmConfigForm, formatMode: "standard_prefix", prefix: "RM-", padDigits: 0 })}
                      className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                    />
                    <div>
                      <div className="font-bold text-slate-800">Prefix Standar (Contoh: RM-3000, RM-3001)</div>
                      <div className="text-[11px] text-slate-500">Awalan &quot;RM-&quot; tanpa penambahan angka nol di depan</div>
                    </div>
                  </label>

                  <label className={`flex items-start gap-3 p-2.5 rounded-xl border cursor-pointer transition-all ${
                    rmConfigForm.formatMode === "padded_prefix" ? "border-emerald-500 bg-emerald-50/50" : "border-slate-200 hover:bg-slate-50"
                  }`}>
                    <input
                      type="radio"
                      name="formatMode"
                      checked={rmConfigForm.formatMode === "padded_prefix"}
                      onChange={() => setRmConfigForm({ ...rmConfigForm, formatMode: "padded_prefix", prefix: "RM-", padDigits: 6 })}
                      className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                    />
                    <div>
                      <div className="font-bold text-slate-800">Prefix 6 Digit (Contoh: RM-003000, RM-003001)</div>
                      <div className="text-[11px] text-slate-500">Format standar rekam medis dengan leading zeroes</div>
                    </div>
                  </label>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Nomor Urut Awal Preview Lokal
                </label>
                <input
                  type="number"
                  min="1"
                  value={rmConfigForm.startingNumber}
                  onChange={(e) => setRmConfigForm({ ...rmConfigForm, startingNumber: Math.max(1, parseInt(e.target.value) || 1) })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Pengaturan ini hanya untuk preview di perangkat ini. RM saat check-in dibuat oleh database dengan mengikuti RM tertinggi yang sudah ada.
                </p>
              </div>

              {/* Live Preview */}
              <div className="bg-slate-100 p-3 rounded-xl border border-slate-200 space-y-1">
                <span className="text-[11px] font-bold text-slate-600">Preview Lokal (tidak mengatur check-in):</span>
                <div className="font-mono text-base font-black text-emerald-700 tracking-wider">
                  {getNextMedicalRecordNumber(patients, rmConfigForm)}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsRMConfigModalOpen(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-semibold text-xs"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveRMConfig(rmConfigForm)}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs shadow-sm"
                >
                  Simpan Pengaturan
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* MODAL: KOSONGKAN SELURUH DATABASE PASIEN    */}
      {/* ========================================== */}
      {isClearDbModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-xl max-w-md w-full p-6 space-y-4 animate-scale-in">
            <div className="flex items-center gap-3 pb-3 border-b border-rose-100 text-rose-700">
              <div className="w-9 h-9 bg-rose-100 rounded-xl flex items-center justify-center text-rose-600 flex-shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-800">Kosongkan Database Pasien</h2>
                <p className="text-[11px] text-slate-500">Mulai input data pasien manual dari nol</p>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-rose-50 border border-rose-200 p-3 rounded-xl text-rose-800 space-y-1.5">
                <div className="font-bold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                  <span>Peringatan Penghapusan Bersih</span>
                </div>
                <p className="text-[11px] leading-relaxed text-rose-700">
                  Tindakan ini akan mengosongkan seluruh data pasien saat ini ({patients.length} pasien) beserta kunjungan dan rekam medisnya, sehingga Anda dapat mulai menginput data pasien klinik Anda secara manual dari awal.
                </p>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Atur Nomor RM Awal Pasien Baru:
                </label>
                <input
                  type="number"
                  min="1"
                  value={clearDbStartingRM}
                  onChange={(e) => setClearDbStartingRM(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Contoh: Isi <strong>3000</strong> agar nomor RM otomatis selanjutnya mulai dari 3000, 3001, dst.
                </p>
              </div>

              <label className="flex items-start gap-2.5 p-2.5 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={clearDbConfirmed}
                  onChange={(e) => setClearDbConfirmed(e.target.checked)}
                  className="mt-0.5 rounded text-rose-600 focus:ring-rose-500"
                />
                <span className="text-[11px] text-slate-700 font-medium">
                  Saya mengerti tindakan ini akan mengosongkan database pasien untuk mulai penginputan manual dari awal.
                </span>
              </label>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsClearDbModalOpen(false)}
                  disabled={isClearingDb}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-semibold text-xs"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleClearPatientDatabase}
                  disabled={!clearDbConfirmed || isClearingDb}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold text-xs shadow-sm transition-all disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isClearingDb ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Mengosongkan...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" /> Ya, Kosongkan Database
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isPatientCardScannerOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="patient-card-scan-title"
            className="w-full max-w-lg overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
          >
            <div className="flex items-start gap-3 bg-[#17233c] p-5 text-white sm:p-6">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-[#e6c977] ring-1 ring-white/15">
                <ScanLine className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 id="patient-card-scan-title" className="text-base font-bold">Pindai Kartu Pasien</h2>
                <p className="mt-1 text-xs leading-5 text-slate-300">
                  Gunakan pemindai QR 2D mode keyboard/USB untuk membaca QR pada kartu pasien. Booking aktif hari ini di cabang Anda akan ditampilkan bila tersedia.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsPatientCardScannerOpen(false)}
                className="rounded-lg p-1 text-slate-300 transition hover:bg-white/10 hover:text-white"
                aria-label="Tutup pemindai kartu pasien"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 p-5 sm:p-6">
              {!verifiedCardPatient ? (
                <form onSubmit={(event) => void handleVerifyPatientCard(event)} className="space-y-3">
                  <label htmlFor="patient-card-scan-token" className="block text-xs font-bold text-slate-700">
                    QR kartu pasien
                  </label>
                  <input
                    id="patient-card-scan-token"
                    autoFocus
                    autoComplete="off"
                    value={patientCardScanToken}
                    onChange={(event) => setPatientCardScanToken(event.target.value)}
                    placeholder="Arahkan pemindai ke QR atau tempel token di sini"
                    className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-3 font-mono text-xs text-slate-800 outline-none transition placeholder:font-sans placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/10"
                  />
                  <p className="text-[11px] leading-5 text-slate-500">
                    Pastikan pasien membuka kartu digital terbaru. QR akan kedaluwarsa otomatis untuk melindungi identitas pasien.
                  </p>
                  {patientCardScanError && (
                    <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-800">
                      {patientCardScanError}
                    </p>
                  )}
                  <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                    <button
                      type="button"
                      onClick={() => setIsPatientCardScannerOpen(false)}
                      className="rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      disabled={isVerifyingPatientCard || !patientCardScanToken.trim()}
                      className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-55"
                    >
                      {isVerifyingPatientCard ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ShieldAlert className="h-4 w-4" />}
                      {isVerifyingPatientCard ? "Memverifikasi..." : "Verifikasi QR"}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                    <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-700">Identitas terverifikasi</p>
                      <p className="mt-1 break-words text-sm font-extrabold text-slate-900">{verifiedCardPatient.fullName || verifiedCardPatient.name}</p>
                      <p className="mt-1 font-mono text-xs font-bold text-slate-600">Kode RM: {verifiedCardPatient.internalPatientCode || verifiedCardPatient.medicalRecordNumber || "Belum tersedia"}</p>
                    </div>
                  </div>
                  {verifiedCardBooking ? (
                    <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-700">Booking ditemukan hari ini</p>
                      <p className="mt-1 text-sm font-extrabold text-slate-900">
                        {verifiedCardBooking.branchName || "Cabang Anda"} · {verifiedCardBooking.timeSlot || formatDateTime(verifiedCardBooking.bookingDateTime)}
                      </p>
                      <p className="mt-1 text-xs text-slate-600">Status: {verifiedCardBooking.status === BookingStatus.CONFIRMED ? "Dikonfirmasi" : "Menunggu konfirmasi"}</p>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900">
                      Tidak ada booking aktif hari ini di cabang Anda. Jika pasien tetap ingin berobat, lanjutkan melalui alur Walk-In.
                    </div>
                  )}
                  <p className="text-xs leading-5 text-slate-600">
                    Pemindaian hanya memverifikasi identitas dan booking. Kunjungan/antrean belum dibuat sampai petugas melanjutkan check-in.
                  </p>
                  <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3">
                    <button
                      type="button"
                      onClick={() => {
                        setVerifiedCardPatient(null);
                        setVerifiedCardBooking(null);
                        setPatientCardScanToken("");
                      }}
                      className="rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
                    >
                      Pindai pasien lain
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (verifiedCardBooking) {
                          const params = new URLSearchParams({ bookingId: verifiedCardBooking.id });
                          navigateToCheckIn(params);
                        } else {
                          handleOpenWalkInSchedule(verifiedCardPatient);
                        }
                        setIsPatientCardScannerOpen(false);
                      }}
                      className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-800"
                    >
                      {verifiedCardBooking ? "Check-In Booking" : "Lanjutkan Walk-In"}
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>
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
      {currentUser?.role === UserRole.SUPER_ADMIN && (
        <LegacyPatientHistoryImportModal
          isOpen={isLegacyHistoryImportOpen}
          onClose={() => setIsLegacyHistoryImportOpen(false)}
          branches={branches}
          patients={patients}
          patientRepo={repos.patient}
          visitRepo={repos.visit}
          currentUserRole={currentUser.role}
          userBranchId={currentUser.assignedBranchId}
          onImportComplete={async () => {
            await refreshData();
            setFormSuccess("Impor riwayat kunjungan historis selesai. Periksa ringkasan dan baris yang gagal.");
          }}
        />
      )}
    </div>
  );
};
