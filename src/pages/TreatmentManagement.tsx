import React, { useState, useEffect, useRef } from "react";
import { useApp } from "../context/AppContext";
import { useRouter } from "../components/Router";
import { isBranchMatch } from "../utils/branchUtils";
import { supabase } from "../lib/supabase";
import {
  TreatmentJob,
  TreatmentJobStatus,
  TreatmentActivity,
  TreatmentActivityType,
  UserRole,
  PatientVisit,
  QueueItem,
  MasterService,
  DentalDoctor,
  DentalBranch
} from "../types/domain";
import {
  Stethoscope,
  Plus,
  Play,
  CheckCircle2,
  Send,
  Clock,
  Search,
  Filter,
  User,
  Building2,
  FileText,
  AlertCircle,
  X,
  Sparkles,
  ChevronRight,
  PackageMinus
} from "lucide-react";
import { TreatmentPicker } from "../components/TreatmentPicker";
import { OperationalHubTabs } from "../components/common/OperationalHubTabs";
import { getActiveDoctorsForSchedule } from "../utils/doctorScheduleUtils";
import { getOperationalDateString } from "../utils/dateUtils";
import { getPatientMedicalRecordNumber } from "../utils/rmUtils";
import { isActiveQueueStatus } from "../utils/bookingQueueGuards";
import {
  InventoryItem,
  InventoryTreatmentStockShortage,
  listInventoryItems,
  recordTreatmentInventoryUsage
} from "../services/inventoryService";
import { InventoryRecipeLine, getInventoryTreatmentRecipe } from "../utils/inventoryTreatmentRecipes";
import { getApprovedInventoryTreatmentRecipe } from "../services/inventoryRecipeService";

export const TreatmentManagement: React.FC = () => {
  const { currentUser, repos, branches, services, patients, bookings, doctorSchedules } = useApp();
  const { navigate } = useRouter();
  const processedVisitQuery = useRef<string | null>(null);

  const [treatments, setTreatments] = useState<TreatmentJob[]>([]);
  const [visits, setVisits] = useState<PatientVisit[]>([]);
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [doctorsList, setDoctorsList] = useState<DentalDoctor[]>([]);
  const [externalDoctors, setExternalDoctors] = useState<{ id: string; full_name: string }[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Create Modal state
  const [isCreateOpen, setIsCreateOpen] = useState<boolean>(false);
  const [selectedVisitId, setSelectedVisitId] = useState<string>("");
  const [lockedVisitId, setLockedVisitId] = useState<string | null>(null);
  const [selectedTreatmentServices, setSelectedTreatmentServices] = useState<MasterService[]>([]);
  const [officialTreatmentPrices, setOfficialTreatmentPrices] = useState<Record<string, number>>({});
  const [treatmentPrices, setTreatmentPrices] = useState<Record<string, number>>({});
  const [treatmentDurations, setTreatmentDurations] = useState<Record<string, number>>({});
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>("");
  const [treatmentNotes, setTreatmentNotes] = useState<string>("");
  const [patientApprovalConfirmed, setPatientApprovalConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [startingTreatmentId, setStartingTreatmentId] = useState<string | null>(null);
  const [processingVisitId, setProcessingVisitId] = useState<string | null>(null);

  // Detail Modal & Activity state
  const [selectedTreatment, setSelectedTreatment] = useState<TreatmentJob | null>(null);
  const [activities, setActivities] = useState<TreatmentActivity[]>([]);
  const [activityType, setActivityType] = useState<TreatmentActivityType>(TreatmentActivityType.PROGRESS);
  const [activityNotes, setActivityNotes] = useState<string>("");
  const [addingActivity, setAddingActivity] = useState<boolean>(false);
  const [cancellationReason, setCancellationReason] = useState("");
  const [cancellationNotPerformedConfirmed, setCancellationNotPerformedConfirmed] = useState(false);
  const [correctedTreatmentNotes, setCorrectedTreatmentNotes] = useState("");
  const [revisedServiceId, setRevisedServiceId] = useState("");
  const [revisedTreatmentPrice, setRevisedTreatmentPrice] = useState(0);
  const [revisionPatientApprovalConfirmed, setRevisionPatientApprovalConfirmed] = useState(false);
  const [loadingRevisionTariff, setLoadingRevisionTariff] = useState(false);
  const [submittingRevision, setSubmittingRevision] = useState(false);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [completingTreatment, setCompletingTreatment] = useState(false);
  const [approvedRecipeMaterials, setApprovedRecipeMaterials] = useState<InventoryRecipeLine[] | null>(null);
  const canManageTreatment = currentUser?.role === UserRole.DOCTOR
    || currentUser?.role === UserRole.DOCTOR_ASSISTANT;
  const canCreateTreatment = canManageTreatment || currentUser?.role === UserRole.SUPER_ADMIN;
  const canStartTreatment = (treatment: TreatmentJob) =>
    canManageTreatment
    || (Boolean(treatment.externalDoctorId) && currentUser?.role === UserRole.SUPER_ADMIN);
  const canCancelTreatment = (treatment: TreatmentJob) =>
    (treatment.status === TreatmentJobStatus.BELUM_DIMULAI
      || treatment.status === TreatmentJobStatus.DALAM_PROSES)
    && (
      (currentUser?.role === UserRole.DOCTOR
        && Boolean(currentUser.doctorId)
        && (treatment.assignedDoctorId || treatment.doctorId) === currentUser.doctorId)
      || (currentUser?.role === UserRole.DOCTOR_ASSISTANT
        && isBranchMatch(currentUser.assignedBranchId, treatment.branchId, branches))
      || (currentUser?.role === UserRole.SUPER_ADMIN && Boolean(treatment.externalDoctorId))
    );
  const canFinalizeTreatment = (treatment: TreatmentJob) =>
    currentUser?.role === UserRole.DOCTOR
    && Boolean(currentUser.doctorId)
    && (treatment.assignedDoctorId || treatment.doctorId) === currentUser.doctorId;
  const canCompleteTreatment = (treatment: TreatmentJob) =>
    canFinalizeTreatment(treatment)
    || (Boolean(treatment.externalDoctorId)
      && (currentUser?.role === UserRole.DOCTOR_ASSISTANT || currentUser?.role === UserRole.SUPER_ADMIN));
  const canReviseTreatment = (treatment: TreatmentJob) =>
    treatment.status === TreatmentJobStatus.PERLU_REVISI && canFinalizeTreatment(treatment);

  const treatmentRepo = repos.treatment;
  const visitRepo = repos.visit;
  const activityRepo = repos.treatmentActivity;

  const loadActivities = async (treatmentId: string) => {
    try {
      if (!currentUser) return;
      const list = await activityRepo.listActivitiesByTreatment(
        treatmentId,
        currentUser.role,
        currentUser.assignedBranchId,
        currentUser.role === UserRole.DOCTOR ? currentUser.doctorId : currentUser.id
      );
      setActivities(list);
    } catch (err: any) {
      console.error("Gagal memuat activity timeline:", err.message);
    }
  };

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      if (!currentUser) return;
      if (currentUser.role === UserRole.DOCTOR && !currentUser.doctorId) {
        throw new Error("Akun dokter belum terhubung ke data dokter di Supabase.");
      }

      const branchId = currentUser.assignedBranchId || "branch-gebang";
      const [trList, docList, queueList, externalDoctorResult] = await Promise.all([
        treatmentRepo.listTreatments(
          currentUser.role,
          currentUser.assignedBranchId,
          currentUser.doctorId
        ),
        repos.doctor.getDoctors(),
        currentUser.role === UserRole.DOCTOR && currentUser.doctorId
          ? repos.queue.getQueueByDoctor(
              currentUser.doctorId,
              currentUser.role,
              currentUser.assignedBranchId,
              currentUser.doctorId
            )
          : currentUser.role === UserRole.SUPER_ADMIN
            ? repos.queue.getQueueItems()
            : repos.queue.getQueueByBranch(branchId, currentUser.role, currentUser.assignedBranchId),
        currentUser.role === UserRole.SUPER_ADMIN
          ? supabase.from("external_doctor_recipients").select("id,full_name").eq("active", true)
          : Promise.resolve({ data: [], error: null })
      ]);
      if (externalDoctorResult.error) {
        throw new Error(`Gagal memuat dokter eksternal: ${externalDoctorResult.error.message}`);
      }
      const vList = currentUser.role === UserRole.DOCTOR
        ? (await Promise.all(
            [...new Set(queueList.map((item) => item.visitId))]
              .map((visitId) => visitRepo.getVisitById(visitId))
          )).filter((visit): visit is PatientVisit => visit !== null)
        : await visitRepo.getVisitsByBranch(
            branchId,
            currentUser.role,
            currentUser.assignedBranchId
          );

      setDoctorsList(docList);
      setExternalDoctors(externalDoctorResult.data || []);
      setTreatments(trList);
      setVisits(vList);
      setQueueItems(queueList);

      if (selectedTreatment) {
        await loadActivities(selectedTreatment.id);
      }
    } catch (err: any) {
      setError(err.message || "Gagal memuat data tindakan medis");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentUser]);

  useEffect(() => {
    const handleDemoDatabaseUpdate = () => void loadData();
    window.addEventListener("demo-database-updated", handleDemoDatabaseUpdate);
    return () => window.removeEventListener("demo-database-updated", handleDemoDatabaseUpdate);
  }, [currentUser]);

  useEffect(() => {
    if (selectedTreatment) {
      setCorrectedTreatmentNotes(selectedTreatment.notes || "");
      setRevisedServiceId(selectedTreatment.serviceId);
      setRevisedTreatmentPrice(selectedTreatment.priceSnapshot ?? 0);
      setRevisionPatientApprovalConfirmed(false);
      setApprovedRecipeMaterials(null);
      loadActivities(selectedTreatment.id);
      void listInventoryItems(selectedTreatment.branchId)
        .then(setInventoryItems)
        .catch((inventoryError: unknown) => {
          setError(inventoryError instanceof Error ? inventoryError.message : "Gagal memuat stok bahan tindakan.");
        });
      const treatmentServiceCode = services.find((service) => service.id === selectedTreatment.serviceId)?.code
        || selectedTreatment.serviceNameSnapshot;
      void getApprovedInventoryTreatmentRecipe(selectedTreatment.branchId, treatmentServiceCode)
        .then(setApprovedRecipeMaterials)
        .catch((recipeError: unknown) => {
          setError(recipeError instanceof Error ? recipeError.message : "Gagal memuat resep bahan cabang.");
        });
    } else {
      setActivities([]);
      setInventoryItems([]);
      setApprovedRecipeMaterials(null);
    }
  }, [selectedTreatment, services]);

  const handleCreateTreatment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVisitId || selectedTreatmentServices.length === 0 || !selectedDoctorId) {
      setError("Pilih kunjungan, minimal satu tindakan, dan dokter penanggung jawab");
      return;
    }
    if (!patientApprovalConfirmed) {
      setError("Catat persetujuan pasien atas rencana tindakan dan estimasi biaya sebelum menyimpan.");
      return;
    }
    const visitHasExternalDoctor = selectedVisit?.externalDoctorId != null;
    if (!visitHasExternalDoctor && !doctorsForVisit.some((doctor) => doctor.id === selectedDoctorId)) {
      setError("Pilih dokter yang terjadwal atau dokter penanggung jawab kunjungan ini.");
      return;
    }
    if (visitHasExternalDoctor && currentUser?.role !== UserRole.SUPER_ADMIN) {
      setError("Hanya Super Admin yang dapat mencatat tindakan atas nama dokter eksternal.");
      return;
    }
    if (!visitHasExternalDoctor && currentUser?.role === UserRole.SUPER_ADMIN) {
      setError("Super Admin hanya dapat membuat tindakan untuk kunjungan yang ditugaskan kepada dokter eksternal.");
      return;
    }
    if (selectedTreatmentServices.some((service) => {
      const duration = treatmentDurations[service.id] ?? service.estimatedDurationMinutes ?? 30;
      return !Number.isSafeInteger(duration) || duration < 5 || duration > 300;
    })) {
      setError("Durasi setiap tindakan harus antara 5 sampai 300 menit.");
      return;
    }
    if (currentUser?.role === UserRole.DOCTOR && selectedTreatmentServices.some((service) => {
      const price = treatmentPrices[service.id] ?? service.basePrice;
      return !Number.isSafeInteger(price) || price < 0;
    })) {
      setError("Harga setiap tindakan harus berupa angka Rupiah bulat dan tidak boleh negatif.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccessMsg(null);
    const createdTreatments: TreatmentJob[] = [];
    try {
      for (const service of selectedTreatmentServices) {
        const createdTreatment = await treatmentRepo.createTreatmentJob(
          {
            visitId: selectedVisitId,
            serviceId: service.id,
            doctorId: selectedDoctorId,
            ...(currentUser?.role === UserRole.DOCTOR
              ? { priceSnapshot: treatmentPrices[service.id] ?? service.basePrice }
              : {}),
            externalDoctorId: selectedVisit?.externalDoctorId ?? null,
            patientApprovalConfirmed: true,
            estimatedDurationMinutes: treatmentDurations[service.id] ?? service.estimatedDurationMinutes ?? 30,
            notes: treatmentNotes
          },
          currentUser?.role,
          currentUser?.assignedBranchId,
          currentUser?.id
        );
        createdTreatments.push(createdTreatment);
      }

      setTreatments((current) => [...createdTreatments, ...current]);
      setSuccessMsg(
        `${createdTreatments.length} rencana tindakan tersimpan. Mulai tindakan setelah pasien menyetujui rencana dan estimasi biaya; invoice hanya memuat tindakan yang selesai.`
      );
      setIsCreateOpen(false);
      setSelectedVisitId("");
      setSelectedTreatmentServices([]);
      setOfficialTreatmentPrices({});
      setTreatmentPrices({});
      setTreatmentDurations({});
      setSelectedDoctorId("");
      setTreatmentNotes("");
      setPatientApprovalConfirmed(false);
    } catch (err: any) {
      if (createdTreatments.length > 0) {
        const createdIds = new Set(createdTreatments.map((treatment) => treatment.serviceId));
        setTreatments((current) => [...createdTreatments, ...current]);
        setSelectedTreatmentServices((current) =>
          current.filter((service) => !createdIds.has(service.id))
        );
        setTreatmentPrices((current) =>
          Object.fromEntries(Object.entries(current).filter(([serviceId]) => !createdIds.has(serviceId)))
        );
        setOfficialTreatmentPrices((current) =>
          Object.fromEntries(Object.entries(current).filter(([serviceId]) => !createdIds.has(serviceId)))
        );
        setTreatmentDurations((current) =>
          Object.fromEntries(Object.entries(current).filter(([serviceId]) => !createdIds.has(serviceId)))
        );
        const detail = err instanceof Error ? err.message : String(err);
        setError(
          `${createdTreatments.length} dari ${selectedTreatmentServices.length} tindakan berhasil dicatat. Tindakan lainnya gagal: ${detail}. Periksa daftar treatment sebelum mencoba lagi.`
        );
      } else {
        setError(err instanceof Error ? err.message : "Gagal membuat tindakan medis.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartTreatment = async (id: string) => {
    const treatment = treatments.find((item) => item.id === id);
    if (!treatment || !canStartTreatment(treatment) || startingTreatmentId) return false;
    setStartingTreatmentId(id);
    setError(null);
    try {
      await treatmentRepo.startTreatmentJob(
        id,
        currentUser?.role,
        currentUser?.assignedBranchId,
        currentUser?.role === UserRole.DOCTOR ? currentUser.doctorId : currentUser?.id,
        {
          actorId: currentUser?.id,
          actorRole: currentUser?.role,
          actorNameSnapshot: currentUser?.name || "User Klinik",
          notes: "Memulai tindakan medis"
        }
      );
      setSuccessMsg("Status tindakan diubah ke DALAM PROSES");
      await loadData();
      return true;
    } catch (err: any) {
      setError(err.message || "Gagal memulai tindakan medis");
      return false;
    } finally {
      setStartingTreatmentId(null);
    }
  };

  const handleStartVisitPlan = async (visitId: string, visitTreatments: TreatmentJob[]) => {
    if (processingVisitId) return;
    const pending = visitTreatments.filter((treatment) =>
      treatment.status === TreatmentJobStatus.BELUM_DIMULAI
    );
    if (!pending.length || pending.some((treatment) => !canStartTreatment(treatment))) return;
    setProcessingVisitId(visitId);
    setError(null);
    let startedCount = 0;
    try {
      for (const treatment of pending) {
        const started = await handleStartTreatment(treatment.id);
        if (!started) {
          setError(`Rencana baru dimulai sebagian (${startedCount} dari ${pending.length} tindakan). Periksa status tiap tindakan sebelum mencoba lagi.`);
          return;
        }
        startedCount += 1;
      }
      setSuccessMsg(`${startedCount} tindakan dalam rencana kunjungan mulai diproses bersama.`);
      await loadData();
    } finally {
      setProcessingVisitId(null);
    }
  };

  const handleCancelTreatment = async (treatment: TreatmentJob) => {
    if (!canCancelTreatment(treatment) || !currentUser || submitting) return;
    const reason = cancellationReason.trim();
    if (!reason) {
      setError("Alasan pembatalan wajib diisi.");
      return;
    }
    if (treatment.status === TreatmentJobStatus.DALAM_PROSES && !cancellationNotPerformedConfirmed) {
      setError("Konfirmasi bahwa tindakan belum dikerjakan dan belum memakai bahan wajib diisi.");
      return;
    }
    setSubmitting(true);
    setError(null);
    let cancellationSaved = false;
    try {
      const cancelledTreatment = await treatmentRepo.cancelTreatmentJob(
        treatment.id,
        reason,
        currentUser.role,
        currentUser.assignedBranchId,
        currentUser.role === UserRole.DOCTOR ? currentUser.doctorId : currentUser.id,
        {
          actorId: currentUser.id,
          actorRole: currentUser.role,
          actorNameSnapshot: currentUser.name || "Petugas Klinik"
        },
        cancellationNotPerformedConfirmed
      );
      cancellationSaved = true;
      setTreatments((current) => current.map((item) =>
        item.id === cancelledTreatment.id ? cancelledTreatment : item
      ));
      setSelectedTreatment(cancelledTreatment);
      setCancellationReason("");
      setCancellationNotPerformedConfirmed(false);

      const visitTreatments = await treatmentRepo.getTreatmentsByVisit(cancelledTreatment.visitId);
      const allPlansClosed = visitTreatments.every((item) =>
        item.status === TreatmentJobStatus.SELESAI
        || item.status === TreatmentJobStatus.DISERAHKAN
        || item.status === TreatmentJobStatus.DIBATALKAN
      );
      if (allPlansClosed) {
        const freshQueueItems = await repos.queue.getQueueByBranch(
          cancelledTreatment.branchId,
          currentUser.role,
          currentUser.assignedBranchId
        );
        const visitQueue = freshQueueItems.find((item) =>
          item.visitId === cancelledTreatment.visitId
        );
        const activeQueue = visitQueue?.status === "IN_CONSULTATION" ? visitQueue : undefined;
        if (activeQueue) {
          await repos.queue.finishService(
            activeQueue.id,
            currentUser.role,
            currentUser.assignedBranchId,
            currentUser.id
          );
        } else if (visitQueue?.status !== "COMPLETED") {
          throw new Error("Rencana berhasil dibatalkan, tetapi antrean kunjungan aktif tidak ditemukan.");
        }
        setSuccessMsg("Rencana dibatalkan, antrean ditutup, dan tindakan ini tidak akan ditagihkan.");
      } else {
        setSuccessMsg("Rencana tindakan dibatalkan dan tidak akan masuk invoice. Lanjutkan rencana lain pada kunjungan ini.");
      }
      await loadData();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Gagal membatalkan rencana tindakan.";
      if (cancellationSaved) {
        await loadData();
        setError(`${message} Rencana sudah dibatalkan; periksa status antrean kunjungan.`);
      } else {
        setError(message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleCompleteTreatment = async (treatment: TreatmentJob): Promise<boolean> => {
    if (!canCompleteTreatment(treatment) || completingTreatment) return false;
    setCompletingTreatment(true);
    setError(null);
    let treatmentCompleted = false;
    let inventoryRecorded = false;
    let stockShortages: InventoryTreatmentStockShortage[] = [];
    const inventoryWarnings: string[] = [];
    let accrualCount = 0;
    let accrualError: string | null = null;
    try {
      const serviceCode = services.find((service) => service.id === treatment.serviceId)?.code
        || treatment.serviceNameSnapshot;
      const recipe = getInventoryTreatmentRecipe(serviceCode);
      if (!recipe) {
        inventoryWarnings.push(`Resep stok untuk layanan "${treatment.serviceNameSnapshot}" belum tersedia; tindakan tetap diselesaikan tanpa pencatatan stok otomatis.`);
      } else if (recipe.lines.length > 0) {
        let approvedMaterials: InventoryRecipeLine[] | null = null;
        try {
          approvedMaterials = await getApprovedInventoryTreatmentRecipe(treatment.branchId, serviceCode || "");
        } catch (recipeError: unknown) {
          const message = recipeError instanceof Error ? recipeError.message : String(recipeError);
          inventoryWarnings.push(`Resep khusus cabang gagal dimuat; resep standar digunakan. ${message}`);
        }
        if (!approvedMaterials && recipe.requiresBraceMaterialChoice) {
          inventoryWarnings.push("Resep khusus cabang belum disetujui; resep standar digunakan untuk tindakan ini.");
        }
        const materials = [...(approvedMaterials || recipe.lines)];
        const result = await recordTreatmentInventoryUsage({
          treatmentJobId: treatment.id,
          patientVisitId: treatment.visitId,
          branchId: treatment.branchId,
          serviceName: treatment.serviceNameSnapshot,
          materials,
          userName: currentUser?.name || "Dokter"
        });
        inventoryRecorded = true;
        stockShortages = result.shortages;
        try {
          setInventoryItems(await listInventoryItems(treatment.branchId));
        } catch (inventoryRefreshError: unknown) {
          const message = inventoryRefreshError instanceof Error ? inventoryRefreshError.message : String(inventoryRefreshError);
          inventoryWarnings.push(`Pemakaian tercatat, tetapi stok terbaru gagal dimuat: ${message}`);
        }
      }
    } catch (inventoryError: unknown) {
      const message = inventoryError instanceof Error ? inventoryError.message : String(inventoryError);
      inventoryWarnings.push(`Pemakaian bahan otomatis gagal dicatat; tindakan tetap diselesaikan dan stok perlu diperiksa: ${message}`);
    }

    const inventoryWarning = inventoryWarnings.length
      ? ` Peringatan stok: ${inventoryWarnings.join(" ")}`
      : "";
    try {
      const completedTreatment = await treatmentRepo.completeTreatmentJob(
        treatment.id,
        currentUser?.role,
        currentUser?.assignedBranchId,
        currentUser?.role === UserRole.DOCTOR ? currentUser.doctorId : currentUser?.id,
        {
          actorId: currentUser?.id,
          actorRole: currentUser?.role,
          actorNameSnapshot: currentUser?.name || "User Klinik",
          notes: "Menyelesaikan tindakan medis"
        }
      );
      treatmentCompleted = true;
      setSelectedTreatment(null);
      try {
        if (!completedTreatment.externalDoctorId) {
          const createdAccruals = await repos.compensation.calculateAndAccrueForTreatment(completedTreatment.id);
          accrualCount = createdAccruals.length;
        }
      } catch (err: any) {
        accrualError = err.message || "Gagal mencatat akrual kompensasi.";
      }
      const visitTreatments = await treatmentRepo.getTreatmentsByVisit(completedTreatment.visitId);
      const unfinishedTreatments = visitTreatments.filter((treatment) =>
        treatment.status !== TreatmentJobStatus.SELESAI
        && treatment.status !== TreatmentJobStatus.DISERAHKAN
        && treatment.status !== TreatmentJobStatus.DIBATALKAN
      );
      if (unfinishedTreatments.length === 0) {
        const activeVisitQueue = queueItems.find((item) =>
          item.visitId === completedTreatment.visitId
          && item.status === "IN_CONSULTATION"
        );
        if (activeVisitQueue) {
          await repos.queue.finishService(
            activeVisitQueue.id,
            currentUser?.role,
            currentUser?.assignedBranchId,
            currentUser?.id
          );
        } else if (!queueItems.some((item) =>
          item.visitId === completedTreatment.visitId
          && item.status === "COMPLETED"
        )) {
          throw new Error("Antrean aktif untuk kunjungan ini tidak ditemukan.");
        }
      }
      const shortageWarning = stockShortages.length
        ? ` Peringatan: stok resep kurang — ${stockShortages.map((shortage) =>
          `${shortage.itemCode} ${shortage.stockDeficit
            ? `minus ${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(shortage.stockDeficit)}`
            : `belum terdaftar, kurang ${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(shortage.shortage)}`}` +
          ` ${inventoryItems.find((item) => item.itemCode.toUpperCase() === shortage.itemCode.toUpperCase())?.unit || ""}`.trim()
        ).join(", ")}.`
        : "";
      setSuccessMsg(
        unfinishedTreatments.length === 0
          ? `Treatment selesai dan antrean ditutup. ${accrualCount} akrual kompensasi dicatat. Tagihan dapat diproses admin.${shortageWarning}${inventoryWarning}`
          : `Treatment selesai. ${accrualCount} akrual kompensasi dicatat. Selesaikan treatment lain pada kunjungan ini sebelum antrean ditutup.${shortageWarning}${inventoryWarning}`
      );
      await loadData();
      if (accrualError) {
        setError(`Treatment selesai, tetapi akrual kompensasi gagal dicatat: ${accrualError}. Admin dapat mencoba sinkronisasi ulang di menu Kompensasi Dokter.`);
      }
      return true;
    } catch (err: any) {
      const shortageWarning = stockShortages.length
        ? ` Stok resep kurang: ${stockShortages.map((shortage) =>
          `${shortage.itemCode} ${shortage.stockDeficit
            ? `minus ${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(shortage.stockDeficit)}`
            : `belum terdaftar, kurang ${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(shortage.shortage)}`}` +
          ` ${inventoryItems.find((item) => item.itemCode.toUpperCase() === shortage.itemCode.toUpperCase())?.unit || ""}`.trim()
        ).join(", ")}.`
        : "";
      setError(treatmentCompleted
        ? `Treatment sudah tersimpan selesai, tetapi antrean belum berhasil ditutup: ${err.message || "kesalahan tidak diketahui"}.${shortageWarning}${inventoryWarning} Silakan muat ulang dan periksa status kunjungan.`
        : inventoryRecorded
          ? `Stok bahan sudah dicatat, tetapi tindakan belum berhasil diselesaikan: ${err.message || "kesalahan tidak diketahui"}.${shortageWarning}${inventoryWarning} Coba Selesaikan kembali; stok tidak akan dipotong ulang.`
          : `${err.message || "Gagal menyelesaikan tindakan medis"}${shortageWarning}${inventoryWarning}`);
      return treatmentCompleted;
    } finally {
      setCompletingTreatment(false);
    }
  };

  const handleCompleteVisitPlan = async (visitId: string, visitTreatments: TreatmentJob[]) => {
    if (processingVisitId || completingTreatment) return;
    const inProgress = visitTreatments.filter((treatment) =>
      treatment.status === TreatmentJobStatus.DALAM_PROSES
    );
    const canFinishTogether = visitTreatments.every((treatment) =>
      treatment.status === TreatmentJobStatus.DALAM_PROSES
      || treatment.status === TreatmentJobStatus.SELESAI
      || treatment.status === TreatmentJobStatus.DISERAHKAN
      || treatment.status === TreatmentJobStatus.DIBATALKAN
    );
    if (!inProgress.length || !canFinishTogether || inProgress.some((treatment) => !canCompleteTreatment(treatment))) return;
    const patientName = getTreatmentPatientName(inProgress[0]);
    if (!window.confirm(
      `Selesaikan bersama ${inProgress.length} tindakan untuk ${patientName}? Pemakaian stok dan pencatatan selesai akan diproses per tindakan.`
    )) return;

    setProcessingVisitId(visitId);
    let completedCount = 0;
    try {
      for (const treatment of inProgress) {
        const completed = await handleCompleteTreatment(treatment);
        if (!completed) {
          setError(`Tindakan selesai sebagian (${completedCount} dari ${inProgress.length}). Periksa status dan stok tiap tindakan sebelum mencoba lagi.`);
          return;
        }
        completedCount += 1;
      }
      setSuccessMsg(`${completedCount} tindakan dalam rencana kunjungan berhasil diselesaikan bersama.`);
      await loadData();
    } finally {
      setProcessingVisitId(null);
    }
  };

  const handleResubmitTreatment = async (treatment: TreatmentJob) => {
    if (!canReviseTreatment(treatment) || submittingRevision) return;
    if (!revisedServiceId) {
      setError("Pilih jenis tindakan hasil koreksi.");
      return;
    }
    if (!Number.isSafeInteger(revisedTreatmentPrice) || revisedTreatmentPrice < 0) {
      setError("Harga tindakan harus berupa angka Rupiah bulat dan tidak boleh negatif.");
      return;
    }
    if (!revisionPatientApprovalConfirmed) {
      setError("Jelaskan harga hasil koreksi dan catat persetujuan lisan pasien sebelum mengirim ulang.");
      return;
    }
    setSubmittingRevision(true);
    setError(null);
    try {
      const updatedTreatment = await treatmentRepo.resubmitTreatmentToCashier(
        treatment.id,
        correctedTreatmentNotes,
        revisedServiceId,
        revisedTreatmentPrice,
        revisionPatientApprovalConfirmed,
        currentUser?.role,
        currentUser?.assignedBranchId,
        currentUser?.doctorId,
        {
          actorId: currentUser?.id,
          actorRole: currentUser?.role,
          actorNameSnapshot: currentUser?.name || "Dokter"
        }
      );
      setSelectedTreatment(updatedTreatment);
      setSuccessMsg("Koreksi tindakan berhasil disimpan. Tindakan kembali siap ditagihkan.");
      await loadData();
    } catch (err: any) {
      setError(err.message || "Gagal mengirim ulang koreksi tindakan");
    } finally {
      setSubmittingRevision(false);
    }
  };

  const handleRevisionServiceChange = async (serviceId: string) => {
    setRevisedServiceId(serviceId);
    setRevisionPatientApprovalConfirmed(false);
    const service = services.find((item) => item.id === serviceId);
    if (!selectedTreatment || !service) return;
    if (serviceId === selectedTreatment.serviceId) {
      setRevisedTreatmentPrice(selectedTreatment.priceSnapshot ?? service.basePrice);
      return;
    }

    setLoadingRevisionTariff(true);
    setError(null);
    try {
      const tariffs = await repos.config.getBranchTariffs(selectedTreatment.branchId);
      const branchTariff = tariffs.find((tariff) =>
        tariff.serviceId === serviceId && tariff.isActive !== false
      );
      setRevisedTreatmentPrice(branchTariff?.customPrice ?? service.basePrice);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat tarif cabang untuk tindakan koreksi.");
    } finally {
      setLoadingRevisionTariff(false);
    }
  };

  const handleAddManualActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTreatment || !currentUser) return;
    setAddingActivity(true);
    setError(null);
    try {
      await activityRepo.addActivity(
        {
          treatmentId: selectedTreatment.id,
          actorId: currentUser.id,
          actorRole: currentUser.role,
          actorNameSnapshot: currentUser.name || "Staff",
          activityType,
          branchId: selectedTreatment.branchId,
          notes: activityNotes
        },
        currentUser.role,
        currentUser.assignedBranchId,
        currentUser.role === UserRole.DOCTOR ? currentUser.doctorId : currentUser.id
      );
      setSuccessMsg(`Catatan Activity (${activityType}) berhasil ditambahkan`);
      setActivityNotes("");
      await loadActivities(selectedTreatment.id);
    } catch (err: any) {
      setError(err.message || "Gagal menambahkan Activity");
    } finally {
      setAddingActivity(false);
    }
  };

  // Filtered treatments
  const activeQueueVisitIds = new Set(
    queueItems.filter((item) => isActiveQueueStatus(item.status)).map((item) => item.visitId)
  );
  const eligibleVisits = visits.filter((visit) => activeQueueVisitIds.has(visit.id));
  const selectedVisit = eligibleVisits.find((visit) => visit.id === selectedVisitId);
  const treatmentVisitDate = getOperationalDateString(selectedVisit?.visitDateTime);
  const scheduledDoctorsForVisit = selectedVisit
    ? getActiveDoctorsForSchedule(
        doctorsList,
        doctorSchedules || [],
        selectedVisit.branchId,
        treatmentVisitDate,
        branches
      )
    : [];
  const visitQueueItem = queueItems.find((item) => item.visitId === selectedVisitId);
  const assignedDoctorId = selectedVisit?.doctorId || visitQueueItem?.doctorId;
  const normalizeDoctorIdentifier = (identifier: string) =>
    identifier.trim().toLowerCase().replace(/^doc-/, "");
  const resolveDoctor = (identifier?: string | null) => {
    if (!identifier) return undefined;
    const normalizedId = normalizeDoctorIdentifier(identifier);
    return doctorsList.find((doctor) =>
      normalizeDoctorIdentifier(doctor.id) === normalizedId
      || (!!doctor.doctorCode && normalizeDoctorIdentifier(doctor.doctorCode) === normalizedId)
    );
  };
  const visitAssignedDoctor = resolveDoctor(assignedDoctorId);
  const doctorsForVisit = visitAssignedDoctor
    && !scheduledDoctorsForVisit.some((doctor) => doctor.id === visitAssignedDoctor.id)
    ? [...scheduledDoctorsForVisit, visitAssignedDoctor]
    : scheduledDoctorsForVisit;

  useEffect(() => {
    if (loading || !currentUser) return;
    const requestedVisitId = new URLSearchParams(window.location.search).get("visitId");
    if (!requestedVisitId || processedVisitQuery.current === requestedVisitId) return;
    if (!eligibleVisits.some((visit) => visit.id === requestedVisitId)) return;

    processedVisitQuery.current = requestedVisitId;
    setLockedVisitId(requestedVisitId);
    setSelectedVisitId(requestedVisitId);
    const queueItem = queueItems.find((item) => item.visitId === requestedVisitId);
    const visit = eligibleVisits.find((item) => item.id === requestedVisitId);
    const requestedDoctor = resolveDoctor(visit?.doctorId || queueItem?.doctorId || currentUser.doctorId);
    setSelectedDoctorId(
      requestedDoctor?.id || ""
    );

    if (treatments.some((treatment) => treatment.visitId === requestedVisitId)) {
      setStatusFilter("ALL");
      setSearchQuery(requestedVisitId);
      setSuccessMsg("Treatment untuk kunjungan ini sudah tersedia. Tinjau atau tambahkan tindakan dari halaman ini.");
      return;
    }

    setIsCreateOpen(true);
  }, [currentUser, eligibleVisits, loading, queueItems, treatments]);

  useEffect(() => {
    if (!selectedDoctorId || !selectedVisitId) return;
    if (!doctorsForVisit.some((doctor) => doctor.id === selectedDoctorId)) {
      setSelectedDoctorId("");
    }
  }, [selectedVisitId, selectedDoctorId, treatmentVisitDate, selectedVisit?.branchId, doctorSchedules, doctorsForVisit]);

  const getTreatmentPatientName = (treatment: TreatmentJob) => {
    const patient = patients.find((item) => item.id === treatment.patientId);
    if (patient?.fullName || patient?.name) return patient.fullName || patient.name;

    const visit = visits.find((item) => item.id === treatment.visitId);
    const bookingName = bookings.find((item) => item.id === visit?.bookingId)?.patientNameSnapshot;
    const queueName = queueItems.find((item) => item.visitId === treatment.visitId)?.patientNameSnapshot;
    return bookingName || queueName || "Nama pasien tidak tersedia";
  };

  const getVisitPatientName = (visit: PatientVisit) => {
    const patient = patients.find((item) => item.id === visit.patientId);
    if (patient?.fullName || patient?.name) return patient.fullName || patient.name;

    const bookingName = bookings.find((item) => item.id === visit.bookingId)?.patientNameSnapshot;
    const queueName = queueItems.find((item) => item.visitId === visit.id)?.patientNameSnapshot;
    return bookingName || queueName || "Nama pasien tidak tersedia";
  };

  const filteredTreatments = treatments.filter((tr) => {
    const isActive = tr.status === TreatmentJobStatus.BELUM_DIMULAI
      || tr.status === TreatmentJobStatus.DALAM_PROSES;
    const matchStatus = statusFilter === "ACTIVE"
      ? isActive
      : statusFilter === "ALL"
        || tr.status === statusFilter
        || (statusFilter === TreatmentJobStatus.SELESAI && tr.status === TreatmentJobStatus.DISERAHKAN);
    const q = searchQuery.toLowerCase();
    const matchQuery =
      !q ||
      tr.serviceNameSnapshot.toLowerCase().includes(q) ||
      tr.doctorNameSnapshot.toLowerCase().includes(q) ||
      tr.visitId.toLowerCase().includes(q) ||
      getTreatmentPatientName(tr).toLowerCase().includes(q) ||
      (tr.notes && tr.notes.toLowerCase().includes(q));

    return matchStatus && matchQuery;
  });
  const matchedTreatmentIds = new Set(filteredTreatments.map((treatment) => treatment.id));
  const filteredTreatmentGroups = Array.from(
    treatments.reduce((groups, treatment) => {
      const current = groups.get(treatment.visitId) || [];
      current.push(treatment);
      groups.set(treatment.visitId, current);
      return groups;
    }, new Map<string, TreatmentJob[]>()).entries()
  )
    .map(([visitId, visitTreatments]) => ({ visitId, treatments: visitTreatments }))
    .filter((group) => group.treatments.some((treatment) => matchedTreatmentIds.has(treatment.id)));

  const countByStatus = (status: string) =>
    treatments.filter((t) =>
      t.status === status ||
      (status === TreatmentJobStatus.SELESAI && t.status === TreatmentJobStatus.DISERAHKAN)
    ).length;

  const formatActivityDateTime = (value?: string) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return new Intl.DateTimeFormat("id-ID", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Jakarta"
    }).format(date);
  };

  const getStatusBadge = (status: TreatmentJobStatus | string) => {
    switch (status) {
      case TreatmentJobStatus.BELUM_DIMULAI:
      case "BELUM_DIMULAI":
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
            <Clock className="w-3 h-3 mr-1 text-slate-500" />
            BELUM DIMULAI
          </span>
        );
      case TreatmentJobStatus.DALAM_PROSES:
      case "DALAM_PROSES":
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <Play className="w-3 h-3 mr-1 text-amber-600 animate-pulse" />
            DALAM PROSES
          </span>
        );
      case TreatmentJobStatus.SELESAI:
      case "SELESAI":
      case TreatmentJobStatus.DISERAHKAN:
      case "DISERAHKAN":
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-600" />
            SELESAI
          </span>
        );
      case TreatmentJobStatus.PERLU_REVISI:
      case "PERLU_REVISI":
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <AlertCircle className="w-3 h-3 mr-1 text-rose-600" />
            PERLU REVISI
          </span>
        );
      case TreatmentJobStatus.DIBATALKAN:
      case "DIBATALKAN":
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
            DIBATALKAN
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">
            {status}
          </span>
        );
    }
  };

  const selectedTreatmentPatient = selectedTreatment
    ? patients.find((patient) => patient.id === selectedTreatment.patientId)
    : undefined;
  const selectedTreatmentVisit = selectedTreatment
    ? visits.find((visit) => visit.id === selectedTreatment.visitId)
    : undefined;
  const selectedTreatmentBranch = selectedTreatment
    ? branches.find((branch) => isBranchMatch(branch.id, selectedTreatment.branchId, branches))
    : undefined;
  const selectedTreatmentServiceCode = selectedTreatment
    ? services.find((service) => service.id === selectedTreatment.serviceId)?.code || selectedTreatment.serviceNameSnapshot
    : undefined;
  const selectedTreatmentRecipe = getInventoryTreatmentRecipe(selectedTreatmentServiceCode);
  const selectedTreatmentRecipeLines = approvedRecipeMaterials || selectedTreatmentRecipe?.lines || [];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {!isCreateOpen && (
        <>
      <OperationalHubTabs hub="queue_treatment" />

      {/* Page Title & Controls Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-9 h-9 bg-teal-50 text-teal-600 rounded-xl flex items-center justify-center font-bold">
              <Stethoscope className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">Daftar Tindakan Medis</h1>
            <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold tracking-wide uppercase bg-teal-100 text-teal-800">
              Phase 4A
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Catat beberapa tindakan dalam satu kunjungan. Dokter memulai tindakan dari daftar ini; setelah semuanya selesai, admin memproses satu invoice.
          </p>
        </div>

        {canCreateTreatment
          && (canManageTreatment || eligibleVisits.some((visit) => Boolean(visit.externalDoctorId)))
          && <button
          onClick={() => {
            setIsCreateOpen(true);
              setPatientApprovalConfirmed(false);
              if (currentUser?.role === UserRole.DOCTOR) {
              setSelectedDoctorId(currentUser.doctorId || "");
            }
          }}
          className="inline-flex items-center justify-center px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs rounded-xl shadow-sm transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4 mr-1.5" />
          Catat Tindakan Kunjungan
        </button>}
      </div>

      {currentUser?.role === UserRole.DOCTOR_ASSISTANT && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-800">
          Asisten dapat memulai treatment dan mencatat aktivitas. Treatment dokter internal hanya dapat diselesaikan oleh dokter penanggung jawab. Untuk treatment dokter eksternal, asisten cabang berwenang dapat menyelesaikannya; stok resep dipotong saat treatment berhasil diselesaikan.
        </div>
      )}

      {/* Messages */}
      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 p-4 rounded-xl text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-500 hover:text-rose-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 p-4 rounded-xl text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-500 hover:text-emerald-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Statistics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <div
          onClick={() => setStatusFilter("ALL")}
          className={`p-4 rounded-xl border transition-all cursor-pointer ${
            statusFilter === "ALL"
              ? "bg-slate-900 text-white border-slate-900 shadow-md"
              : "bg-white text-slate-800 border-slate-100 hover:border-slate-300"
          }`}
        >
          <span className="text-[10px] font-semibold uppercase tracking-wider block opacity-70">
            Total Tindakan
          </span>
          <span className="text-2xl font-black mt-1 block">
            {treatments.length}
          </span>
        </div>

        <div
          onClick={() => setStatusFilter(TreatmentJobStatus.BELUM_DIMULAI)}
          className={`p-4 rounded-xl border transition-all cursor-pointer ${
            statusFilter === TreatmentJobStatus.BELUM_DIMULAI
              ? "bg-slate-800 text-white border-slate-800 shadow-md"
              : "bg-white text-slate-800 border-slate-100 hover:border-slate-300"
          }`}
        >
          <span className="text-[10px] font-semibold uppercase tracking-wider block text-slate-500">
            Belum Dimulai
          </span>
          <span className="text-2xl font-black mt-1 block text-slate-700">
            {countByStatus(TreatmentJobStatus.BELUM_DIMULAI)}
          </span>
        </div>

        <div
          onClick={() => setStatusFilter(TreatmentJobStatus.DALAM_PROSES)}
          className={`p-4 rounded-xl border transition-all cursor-pointer ${
            statusFilter === TreatmentJobStatus.DALAM_PROSES
              ? "bg-amber-600 text-white border-amber-600 shadow-md"
              : "bg-white text-slate-800 border-slate-100 hover:border-slate-300"
          }`}
        >
          <span className="text-[10px] font-semibold uppercase tracking-wider block text-amber-600">
            Dalam Proses
          </span>
          <span className="text-2xl font-black mt-1 block text-amber-700">
            {countByStatus(TreatmentJobStatus.DALAM_PROSES)}
          </span>
        </div>

        <div
          onClick={() => setStatusFilter(TreatmentJobStatus.SELESAI)}
          className={`p-4 rounded-xl border transition-all cursor-pointer ${
            statusFilter === TreatmentJobStatus.SELESAI
              ? "bg-emerald-600 text-white border-emerald-600 shadow-md"
              : "bg-white text-slate-800 border-slate-100 hover:border-slate-300"
          }`}
        >
          <span className="text-[10px] font-semibold uppercase tracking-wider block text-emerald-600">
            Selesai
          </span>
          <span className="text-2xl font-black mt-1 block text-emerald-700">
            {countByStatus(TreatmentJobStatus.SELESAI)}
          </span>
        </div>

        <div
          onClick={() => setStatusFilter(TreatmentJobStatus.PERLU_REVISI)}
          className={`p-4 rounded-xl border transition-all cursor-pointer ${
            statusFilter === TreatmentJobStatus.PERLU_REVISI
              ? "bg-rose-600 text-white border-rose-600 shadow-md"
              : "bg-white text-slate-800 border-slate-100 hover:border-slate-300"
          }`}
        >
          <span className="text-[10px] font-semibold uppercase tracking-wider block text-rose-600">
            Perlu Revisi
          </span>
          <span className="text-2xl font-black mt-1 block text-rose-700">
            {countByStatus(TreatmentJobStatus.PERLU_REVISI)}
          </span>
        </div>

        <div
          onClick={() => setStatusFilter(TreatmentJobStatus.DIBATALKAN)}
          className={`p-4 rounded-xl border transition-all cursor-pointer ${
            statusFilter === TreatmentJobStatus.DIBATALKAN
              ? "bg-slate-600 text-white border-slate-600 shadow-md"
              : "bg-white text-slate-800 border-slate-100 hover:border-slate-300"
          }`}
        >
          <span className="text-[10px] font-semibold uppercase tracking-wider block text-slate-500">
            Dibatalkan
          </span>
          <span className="text-2xl font-black mt-1 block text-slate-600">
            {countByStatus(TreatmentJobStatus.DIBATALKAN)}
          </span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-100 flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Cari nama tindakan, dokter, visit ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 bg-slate-50/50"
          />
        </div>

        <div className="flex items-center gap-2 text-xs w-full sm:w-auto justify-end">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-slate-500 font-medium">Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            <option value="ALL">Semua Status</option>
            <option value="ACTIVE">Tindakan Aktif</option>
            <option value={TreatmentJobStatus.BELUM_DIMULAI}>BELUM DIMULAI</option>
            <option value={TreatmentJobStatus.DALAM_PROSES}>DALAM PROSES</option>
            <option value={TreatmentJobStatus.SELESAI}>SELESAI</option>
            <option value={TreatmentJobStatus.PERLU_REVISI}>PERLU REVISI</option>
            <option value={TreatmentJobStatus.DIBATALKAN}>DIBATALKAN</option>
          </select>
        </div>
      </div>

      {/* Treatment Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-xs font-medium">
            Memuat data tindakan medis...
          </div>
        ) : filteredTreatmentGroups.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            <Stethoscope className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            {treatments.length === 0
              ? "Belum ada tindakan yang dicatat. Pilih Catat Tindakan Kunjungan setelah pasien check-in untuk memilih tindakan."
              : statusFilter === "ACTIVE"
                ? "Tidak ada tindakan aktif. Pilih Semua Status untuk melihat tindakan yang sudah selesai."
                : searchQuery
                  ? "Tidak ada tindakan yang cocok dengan pencarian."
                  : "Tidak ada tindakan dengan status ini."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-100 text-slate-500 font-semibold uppercase text-[10px] tracking-wider">
                  <th className="py-3.5 px-4">Rencana Tindakan Kunjungan</th>
                  <th className="py-3.5 px-4">Status Rencana</th>
                  <th className="py-3.5 px-4 text-right">Aksi Bersama</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredTreatmentGroups.map(({ visitId, treatments: visitTreatments }) => {
                  const firstTreatment = visitTreatments[0];
                  const visit = visits.find((item) => item.id === visitId);
                  const pending = visitTreatments.filter((treatment) =>
                    treatment.status === TreatmentJobStatus.BELUM_DIMULAI
                  );
                  const inProgress = visitTreatments.filter((treatment) =>
                    treatment.status === TreatmentJobStatus.DALAM_PROSES
                  );
                  const canStartTogether = pending.length > 0
                    && visitTreatments.every((treatment) =>
                      treatment.status === TreatmentJobStatus.BELUM_DIMULAI
                      || treatment.status === TreatmentJobStatus.DALAM_PROSES
                      || treatment.status === TreatmentJobStatus.DIBATALKAN
                    )
                    && pending.every(canStartTreatment);
                  const canFinishTogether = inProgress.length > 0
                    && visitTreatments.every((treatment) =>
                      treatment.status === TreatmentJobStatus.DALAM_PROSES
                      || treatment.status === TreatmentJobStatus.SELESAI
                      || treatment.status === TreatmentJobStatus.DISERAHKAN
                      || treatment.status === TreatmentJobStatus.DIBATALKAN
                    )
                    && inProgress.every(canCompleteTreatment);
                  const completedCount = visitTreatments.filter((treatment) =>
                    treatment.status === TreatmentJobStatus.SELESAI
                    || treatment.status === TreatmentJobStatus.DISERAHKAN
                  ).length;
                  const cancelledCount = visitTreatments.filter((treatment) =>
                    treatment.status === TreatmentJobStatus.DIBATALKAN
                  ).length;
                  const groupBusy = processingVisitId === visitId;

                  return (
                    <tr key={visitId}>
                      <td colSpan={3} className="p-3 sm:p-4">
                        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                          <header className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/80 p-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
                            <div>
                              <div className="flex flex-wrap items-center gap-2 font-semibold text-slate-900">
                                <FileText className="h-4 w-4 text-teal-600" />
                                <span>{getTreatmentPatientName(firstTreatment)}</span>
                                <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-bold text-teal-700">
                                  {visitTreatments.length} tindakan dalam satu rencana
                                </span>
                              </div>
                              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-500">
                                <span>Kunjungan: {formatActivityDateTime(visit?.visitDateTime)}</span>
                                <span>{branches.find((branch) => isBranchMatch(branch.id, firstTreatment.branchId, branches))?.name || "Cabang"}</span>
                                <span>{firstTreatment.doctorNameSnapshot}</span>
                                <span>{completedCount} selesai{cancelledCount ? ` · ${cancelledCount} batal` : ""}</span>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {canStartTogether && (
                                <button
                                  type="button"
                                  disabled={Boolean(processingVisitId || startingTreatmentId)}
                                  onClick={() => void handleStartVisitPlan(visitId, visitTreatments)}
                                  className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-2 text-[11px] font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                                >
                                  <Play className="h-3.5 w-3.5" />
                                  {groupBusy ? "Memulai..." : `Mulai ${pending.length} tindakan bersama`}
                                </button>
                              )}
                              {canFinishTogether && (
                                <button
                                  type="button"
                                  disabled={Boolean(processingVisitId || completingTreatment)}
                                  onClick={() => void handleCompleteVisitPlan(visitId, visitTreatments)}
                                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  {groupBusy ? "Menyelesaikan..." : `Selesaikan ${inProgress.length} tindakan bersama`}
                                </button>
                              )}
                            </div>
                          </header>
                          <div className="divide-y divide-slate-100">
                            {visitTreatments.map((treatment) => (
                              <div key={treatment.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-semibold text-slate-900">{treatment.serviceNameSnapshot}</span>
                                    {getStatusBadge(treatment.status)}
                                    {typeof treatment.priceSnapshot === "number" && (
                                      <span className="text-[10px] font-medium text-slate-500">
                                        Rp {treatment.priceSnapshot.toLocaleString("id-ID")}
                                      </span>
                                    )}
                                  </div>
                                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-500">
                                    <span>Estimasi {treatment.estimatedDurationMinutes || 30} menit</span>
                                    <span>Dibuat {formatActivityDateTime(treatment.createdAt)}</span>
                                    {treatment.startedAt && <span>Mulai {formatActivityDateTime(treatment.startedAt)}</span>}
                                    {treatment.completedAt && <span>Selesai {formatActivityDateTime(treatment.completedAt)}</span>}
                                  </div>
                                  {treatment.notes && <p className="mt-1 text-[10px] text-teal-700">{treatment.notes}</p>}
                                  {treatment.returnReason && treatment.status === TreatmentJobStatus.PERLU_REVISI && (
                                    <p className="mt-1 text-[10px] text-rose-700">Koreksi kasir: {treatment.returnReason}</p>
                                  )}
                                  {treatment.cancellationReason && treatment.status === TreatmentJobStatus.DIBATALKAN && (
                                    <p className="mt-1 text-[10px] text-slate-600">Alasan batal: {treatment.cancellationReason}</p>
                                  )}
                                </div>
                                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                                  {canReviseTreatment(treatment) && (
                                    <button
                                      type="button"
                                      onClick={() => setSelectedTreatment(treatment)}
                                      className="rounded-lg bg-rose-600 px-2.5 py-1.5 text-[10px] font-medium text-white hover:bg-rose-700"
                                    >
                                      Perbaiki catatan
                                    </button>
                                  )}
                                  {canCancelTreatment(treatment) && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setCancellationReason("");
                                        setCancellationNotPerformedConfirmed(false);
                                        setSelectedTreatment(treatment);
                                      }}
                                      className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[10px] font-medium text-rose-700 hover:bg-rose-100"
                                    >
                                      Batalkan item
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => setSelectedTreatment(treatment)}
                                    className="rounded-lg px-2.5 py-1.5 text-[10px] font-medium text-slate-600 hover:bg-slate-100"
                                  >
                                    Detail
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </section>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

        </>
      )}

      {isCreateOpen && (
        <main className="space-y-6">
          <OperationalHubTabs hub="queue_treatment" />
          <section className="bg-white rounded-2xl max-w-7xl mx-auto p-4 md:p-6 shadow-sm border border-slate-100 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Stethoscope className="w-4 h-4 text-teal-600" />
                Rencana Tindakan Kunjungan
              </h3>
              <button
                onClick={() => {
                  setIsCreateOpen(false);
                  setPatientApprovalConfirmed(false);
                }}
                className="text-sm text-slate-600 hover:text-slate-900 px-3 py-2 rounded-lg border border-slate-200"
              >
                Kembali
              </button>
            </div>

            <form onSubmit={handleCreateTreatment} className="space-y-4 text-sm">
              {error && (
                <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
              {successMsg && (
                <div role="status" className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{successMsg}</span>
                </div>
              )}

              <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(320px,0.9fr)_minmax(0,1.35fr)] lg:gap-6">
                <div className="bg-gold-card-textured order-2 space-y-3 rounded-2xl border border-amber-300 p-3 shadow-sm md:p-4 lg:order-2">
                  <div>
                    <h4 className="text-sm font-bold text-amber-950">Tindakan Medis</h4>
                    <p className="mt-0.5 text-[11px] text-slate-500">Centang satu atau beberapa tindakan untuk kunjungan ini.</p>
                  </div>
              <div>
                <label className="block text-slate-700 font-semibold mb-1.5 flex items-center justify-between">
                  <span>Pilih Tindakan (bisa lebih dari satu) *</span>
                  {selectedTreatmentServices.length > 0 && (
                    <span className="text-[11px] text-amber-700 font-semibold">
                      {selectedTreatmentServices.length} tindakan dipilih
                    </span>
                  )}
                </label>
                <div className="border border-amber-200 rounded-xl overflow-hidden bg-white shadow-sm max-h-80 overflow-y-auto">
                  <TreatmentPicker
                    multiSelect
                    selectedServiceIds={selectedTreatmentServices.map((service) => service.id)}
                    branchId={
                      visits.find((v) => v.id === selectedVisitId)?.branchId ||
                      currentUser?.assignedBranchId ||
                      "branch-gebang"
                    }
                    onSelectServices={(nextServices, effectivePrices = {}) => {
                      setPatientApprovalConfirmed(false);
                      setSelectedTreatmentServices(nextServices);
                      setOfficialTreatmentPrices((current) => Object.fromEntries(
                        nextServices.map((service) => [
                          service.id,
                          current[service.id] ?? effectivePrices[service.id] ?? service.basePrice
                        ])
                      ));
                      setTreatmentPrices((current) => Object.fromEntries(
                        nextServices.map((service) => [
                          service.id,
                          current[service.id] ?? effectivePrices[service.id] ?? service.basePrice
                        ])
                      ));
                      setTreatmentDurations((current) => Object.fromEntries(
                        nextServices.map((service) => [
                          service.id,
                          current[service.id] ?? service.estimatedDurationMinutes ?? 30
                        ])
                      ));
                    }}
                  />
                </div>
                {services.length === 0 && (
                  <p className="mt-1.5 text-[11px] text-amber-700">
                    Belum ada jenis tindakan aktif yang dapat dibaca dari Supabase. Minta admin memeriksa katalog master tindakan.
                  </p>
                )}
              </div>

                </div>

                <div className="bg-gold-card-textured order-1 space-y-4 rounded-2xl border border-amber-300 p-3 shadow-sm md:p-4 lg:order-1">
                  <div>
                    <h4 className="text-sm font-bold text-amber-950">Data Kunjungan</h4>
                    <p className="mt-0.5 text-[11px] text-slate-500">Pastikan pasien dan dokter penanggung jawab sudah benar.</p>
                  </div>
                  <div>
                    <label className="mb-1 block font-semibold text-slate-700">Pilih Pasien / Kunjungan *</label>
                    <select
                      value={selectedVisitId}
                      onChange={(e) => {
                        setSelectedVisitId(e.target.value);
                        const nextVisit = eligibleVisits.find((visit) => visit.id === e.target.value);
                        const nextQueueItem = queueItems.find((item) => item.visitId === e.target.value);
                        setSelectedDoctorId(
                          nextVisit?.externalDoctorId
                            ? nextVisit.doctorId || nextQueueItem?.doctorId || ""
                            : ""
                        );
                        setSelectedTreatmentServices([]);
                        setOfficialTreatmentPrices({});
                        setTreatmentPrices({});
                        setTreatmentDurations({});
                        setPatientApprovalConfirmed(false);
                      }}
                      required
                      disabled={Boolean(lockedVisitId)}
                      className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-800 focus:ring-2 focus:ring-teal-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-600"
                    >
                      <option value="">-- Pilih Pasien / Kunjungan --</option>
                      {eligibleVisits.map((visit) => (
                        <option key={visit.id} value={visit.id}>
                          {getVisitPatientName(visit)} — {visit.visitType} • {branches.find((branch) => isBranchMatch(branch.id, visit.branchId, branches))?.name || "Cabang"}
                        </option>
                      ))}
                    </select>
                    {lockedVisitId && (
                      <p className="mt-1.5 text-[11px] text-slate-500">
                        Kunjungan dikunci sesuai pasien dari antrean.
                      </p>
                    )}
                    {eligibleVisits.length === 0 && (
                      <p className="mt-1.5 text-[11px] text-amber-700">
                        Belum ada pasien check-in dengan antrean aktif. Pilih pasien setelah check-in di menu Antrean.
                      </p>
                    )}
                  </div>

                  {selectedVisit && (
                    <div className="rounded-xl border border-amber-200 bg-white/80 p-3 text-xs shadow-xs">
                      <div className="text-[10px] font-bold uppercase tracking-wide text-amber-700">Pasien terpilih</div>
                      <div className="mt-1 font-bold text-slate-900">{getVisitPatientName(selectedVisit)}</div>
                      <div className="mt-0.5 text-[11px] text-slate-600">
                        {branches.find((branch) => isBranchMatch(branch.id, selectedVisit.branchId, branches))?.name || "Cabang"} · {selectedVisit.visitType}
                      </div>
                      {selectedVisit.complaint && (
                        <p className="mt-2 border-t border-amber-100 pt-2 text-[11px] leading-relaxed text-slate-600">
                          Keluhan: {selectedVisit.complaint}
                        </p>
                      )}
                    </div>
                  )}

                  <div>
                    <label className="mb-1 block font-semibold text-slate-700">
                      {selectedVisit?.externalDoctorId ? "Dokter Eksternal yang Ditugaskan" : "Dokter Penanggung Jawab *"}
                    </label>
                    {selectedVisit?.externalDoctorId ? (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                        {externalDoctors.find((doctor) => doctor.id === selectedVisit.externalDoctorId)?.full_name
                          || "Dokter eksternal"}
                        <div className="mt-1 text-[11px] text-amber-800">
                          Dokter internal pada data tindakan hanya menjadi referensi kunjungan.
                        </div>
                      </div>
                    ) : (
                      <select
                        value={selectedDoctorId}
                        onChange={(e) => setSelectedDoctorId(e.target.value)}
                        required
                        disabled={currentUser?.role === UserRole.DOCTOR}
                        className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-800 focus:ring-2 focus:ring-teal-500 disabled:bg-slate-100"
                      >
                        <option value="">-- Pilih Dokter --</option>
                        {doctorsForVisit.map((doctor: DentalDoctor) => (
                          <option key={doctor.id} value={doctor.id}>
                            {doctor.name} ({doctor.specialization})
                          </option>
                        ))}
                      </select>
                    )}
                    {selectedVisitId && doctorsForVisit.length === 0 && (
                      <p className="mt-1.5 text-[11px] text-amber-700">
                        Tidak ada dokter yang terjadwal atau terhubung sebagai penanggung jawab kunjungan ini. Periksa data dokter dan jadwal cabang.
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="mb-1 block font-semibold text-slate-700">Catatan Klinik / Posisi Gigi (Opsional)</label>
                    <textarea
                      rows={2}
                      placeholder="Contoh: Tambal gigi molar kanan atas #16"
                      value={treatmentNotes}
                      onChange={(e) => setTreatmentNotes(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 p-2.5 text-xs text-slate-800 focus:ring-2 focus:ring-teal-500"
                    />
                  </div>

              {selectedTreatmentServices.length > 0 && (
                <section className="space-y-3 rounded-xl border border-teal-100 bg-teal-50/40 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="text-xs font-bold text-slate-800">Ringkasan tindakan kunjungan</h4>
                    <span className="text-[11px] font-semibold text-teal-700">
                      {selectedTreatmentServices.length} tindakan
                    </span>
                  </div>
                  <div className="space-y-2">
                    {selectedTreatmentServices.map((service) => (
                      <div key={service.id} className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 bg-white p-3">
                        <div className="min-w-0">
                          <div className="truncate text-xs font-semibold text-slate-800">{service.name}</div>
                          <div className="text-[10px] font-medium text-amber-700">
                            Tarif dasar cabang: Rp {(officialTreatmentPrices[service.id] ?? service.basePrice).toLocaleString("id-ID")}
                          </div>
                        </div>
                        {currentUser?.role === UserRole.DOCTOR && (
                          <label className="text-[10px] font-semibold text-slate-500">
                            Harga tindakan (Rp)
                            <input
                              type="number"
                              min="0"
                              max={Number.MAX_SAFE_INTEGER}
                              step="1"
                              value={treatmentPrices[service.id] ?? officialTreatmentPrices[service.id] ?? service.basePrice}
                              onChange={(event) => {
                                setTreatmentPrices((current) => ({
                                  ...current,
                                  [service.id]: event.target.value === "" ? 0 : Number(event.target.value)
                                }));
                                setPatientApprovalConfirmed(false);
                              }}
                              required
                              className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-xs text-slate-800 focus:ring-2 focus:ring-teal-500"
                            />
                          </label>
                        )}
                        <label className="text-[10px] font-semibold text-slate-500">
                          Estimasi durasi (menit)
                          <input
                            type="number"
                            min="5"
                            max="300"
                            step="1"
                            value={treatmentDurations[service.id] ?? service.estimatedDurationMinutes ?? 30}
                            onChange={(event) => setTreatmentDurations((current) => ({
                              ...current,
                              [service.id]: event.target.value === "" ? 0 : Number(event.target.value)
                            }))}
                            required
                            className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-xs text-slate-800 focus:ring-2 focus:ring-teal-500"
                          />
                        </label>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap justify-between gap-2 border-t border-teal-100 pt-2 text-[11px] font-semibold text-slate-700">
                    <span>
                      Total estimasi: {selectedTreatmentServices.reduce(
                        (total, service) => total + (treatmentDurations[service.id] ?? service.estimatedDurationMinutes ?? 30),
                        0
                      )} menit
                    </span>
                    <span>
                      Estimasi biaya: Rp {selectedTreatmentServices.reduce(
                        (total, service) => total + (treatmentPrices[service.id] ?? service.basePrice),
                        0
                      ).toLocaleString("id-ID")}
                    </span>
                  </div>
                  <p className="text-[10px] leading-relaxed text-slate-500">
                    Tarif cabang menjadi harga awal. Dokter dapat menyesuaikan harga tiap tindakan sesuai kondisi/luas tindakan sebelum menjelaskan estimasi dan mencatat persetujuan lisan pasien. Invoice satu kali per kunjungan hanya memuat tindakan yang selesai.
                  </p>
                </section>
              )}

                  <label className="flex items-start gap-2 rounded-xl border border-amber-200 bg-white/80 p-3 text-[11px] leading-relaxed text-slate-700">
                    <input
                      type="checkbox"
                      checked={patientApprovalConfirmed}
                      onChange={(event) => setPatientApprovalConfirmed(event.target.checked)}
                      required
                      className="mt-0.5 h-4 w-4 shrink-0 accent-amber-600"
                    />
                    <span>
                      Saya mengonfirmasi rencana tindakan dan estimasi biaya telah dijelaskan kepada pasien, dan pasien menyetujuinya. Persetujuan lisan ini akan dicatat sebelum tindakan dimulai.
                    </span>
                  </label>

                  <div className="flex flex-col-reverse justify-end gap-2 border-t border-slate-100 pt-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreateOpen(false);
                    setPatientApprovalConfirmed(false);
                  }}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 font-medium"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting || !selectedVisitId || selectedTreatmentServices.length === 0 || !selectedDoctorId || !doctorsForVisit.length || !patientApprovalConfirmed}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-medium shadow-sm disabled:opacity-50"
                >
                  {submitting ? "Menyimpan..." : "Simpan Rencana Tindakan"}
                </button>
              </div>
                </div>
              </div>
            </form>
          </section>
        </main>
      )}

      {/* Detail Modal */}
      {selectedTreatment && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl border border-slate-100 space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Stethoscope className="w-4 h-4 text-teal-600" />
                Detail Tindakan & Riwayat Aktivitas
              </h3>
              <button
                onClick={() => setSelectedTreatment(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-700">
              <div className="space-y-3">
                <div className="bg-slate-50 p-3 rounded-xl space-y-1">
                <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Tindakan Medis</div>
                <div className="font-bold text-slate-900 text-sm">{selectedTreatment.serviceNameSnapshot}</div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="border border-slate-100 p-2.5 rounded-xl">
                    <div className="text-[10px] uppercase text-slate-400 font-semibold">Dokter (Snapshot)</div>
                    <div className="font-semibold text-slate-800 mt-0.5">{selectedTreatment.doctorNameSnapshot}</div>
                  </div>
                  <div className="border border-slate-100 p-2.5 rounded-xl">
                    <div className="text-[10px] uppercase text-slate-400 font-semibold">Status Saat Ini</div>
                    <div className="mt-1">{getStatusBadge(selectedTreatment.status)}</div>
                  </div>
                </div>

                <div className="border border-slate-100 p-2.5 rounded-xl space-y-1">
                  <div className="text-[10px] uppercase text-slate-400 font-semibold">Informasi Kunjungan</div>
                  <div className="font-semibold text-slate-800">
                    Pasien: {selectedTreatmentPatient?.fullName || selectedTreatmentPatient?.name || (selectedTreatment ? getTreatmentPatientName(selectedTreatment) : "Nama pasien tidak tersedia")}
                  </div>
                  {selectedTreatmentPatient && getPatientMedicalRecordNumber(selectedTreatmentPatient, selectedTreatment.branchId) && (
                    <div>No. Rekam Medis: {getPatientMedicalRecordNumber(selectedTreatmentPatient, selectedTreatment.branchId)}</div>
                  )}
                  <div>
                    Cabang: {selectedTreatmentBranch?.name || "Cabang tidak tersedia"}
                  </div>
                  <div>
                    Tanggal kunjungan: {formatActivityDateTime(selectedTreatmentVisit?.visitDateTime)}
                  </div>
                  {currentUser?.role === UserRole.DOCTOR && selectedTreatment.patientId && (
                    <button
                      type="button"
                      onClick={() => navigate(`/doctor/patients?patientId=${encodeURIComponent(selectedTreatment.patientId)}`)}
                      className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-[11px] font-semibold text-sky-700 transition-colors hover:bg-sky-100"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      Buka Rekam Medis
                    </button>
                  )}
                </div>

                {canCancelTreatment(selectedTreatment) && (
                  <div className="space-y-2 rounded-xl border border-rose-200 bg-rose-50/70 p-3">
                    <div className="text-[11px] font-bold text-rose-800">Batalkan item tindakan</div>
                    <p className="text-[10px] leading-relaxed text-rose-700">
                      Item yang dibatalkan tidak masuk invoice. Tindakan yang sudah dikerjakan atau sudah memakai bahan tidak dapat dibatalkan.
                    </p>
                    {selectedTreatment.status === TreatmentJobStatus.DALAM_PROSES && (
                      <label className="flex items-start gap-2 rounded-lg border border-rose-200 bg-white p-2 text-[10px] leading-relaxed text-rose-800">
                        <input
                          type="checkbox"
                          checked={cancellationNotPerformedConfirmed}
                          onChange={(event) => setCancellationNotPerformedConfirmed(event.target.checked)}
                          className="mt-0.5 h-4 w-4 shrink-0 accent-rose-600"
                        />
                        <span>Saya memastikan item ini belum dikerjakan dan belum ada bahan yang dipakai.</span>
                      </label>
                    )}
                    <textarea
                      value={cancellationReason}
                      onChange={(event) => setCancellationReason(event.target.value)}
                      rows={2}
                      required
                      aria-label="Alasan pembatalan rencana tindakan"
                      placeholder="Alasan pembatalan wajib diisi"
                      className="w-full rounded-lg border border-rose-200 bg-white p-2 text-xs text-slate-800 focus:ring-2 focus:ring-rose-400"
                    />
                    <button
                      type="button"
                      disabled={submitting || !cancellationReason.trim()
                        || (selectedTreatment.status === TreatmentJobStatus.DALAM_PROSES && !cancellationNotPerformedConfirmed)}
                      onClick={() => void handleCancelTreatment(selectedTreatment)}
                      className="rounded-lg bg-rose-600 px-3 py-2 text-[11px] font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {submitting ? "Menyimpan..." : "Konfirmasi Pembatalan"}
                    </button>
                  </div>
                )}

                {selectedTreatment.status === TreatmentJobStatus.DIBATALKAN && selectedTreatment.cancellationReason && (
                  <div className="space-y-1 rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-700">
                    <div className="font-bold">Alasan pembatalan rencana</div>
                    <div>{selectedTreatment.cancellationReason}</div>
                    {selectedTreatment.cancelledAt && (
                      <div className="text-[10px] text-slate-500">
                        Dibatalkan: {formatActivityDateTime(selectedTreatment.cancelledAt)}
                      </div>
                    )}
                  </div>
                )}

                {selectedTreatment.patientApprovedAt && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-[11px] text-emerald-800">
                    Persetujuan lisan pasien dicatat pada {formatActivityDateTime(selectedTreatment.patientApprovedAt)}.
                  </div>
                )}

                {currentUser?.role === UserRole.DOCTOR_ASSISTANT && (
                  <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-[11px] leading-relaxed text-blue-800">
                    {selectedTreatment.externalDoctorId
                      ? "Tindakan ini ditugaskan kepada dokter eksternal. Asisten cabang berwenang dapat menyelesaikannya; stok resep dipotong saat berhasil diselesaikan."
                      : "Tindakan dokter internal hanya dapat diselesaikan oleh dokter penanggung jawab. Asisten tetap dapat menambahkan catatan aktivitas."}
                  </div>
                )}

                <div className="border border-amber-100 bg-amber-50/50 p-3 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold text-amber-800 tracking-wider">Durasi Pelayanan</span>
                    <span className="text-xs font-bold text-amber-900 bg-amber-100/80 px-2.5 py-0.5 rounded-full">
                      {selectedTreatment.estimatedDurationMinutes || 30} Menit
                    </span>
                  </div>
                  
                  {canManageTreatment &&
                   selectedTreatment.status === TreatmentJobStatus.DALAM_PROSES && (
                    <div className="pt-1.5 border-t border-amber-200/50 space-y-1.5">
                      <div className="text-[10px] font-semibold text-amber-800">Tambah Waktu Tindakan:</div>
                      <div className="flex gap-1.5">
                        {[15, 30, 45].map((m) => (
                          <button
                            key={m}
                            type="button"
                            disabled={submitting}
                            onClick={async () => {
                              try {
                                setSubmitting(true);
                                const qItems = await repos.queue.getQueueByBranch(selectedTreatment.branchId);
                                const qItem = qItems.find((q) => q.visitId === selectedTreatment.visitId || q.patientId === selectedTreatment.patientId);
                                const qId = qItem ? qItem.id : `q-${selectedTreatment.id}`;
                                const prevM = selectedTreatment.estimatedDurationMinutes || 30;
                                const newM = prevM + m;

                                await repos.queue.updateEstimatedDuration(
                                  qId,
                                  newM,
                                  currentUser.role,
                                  currentUser.assignedBranchId,
                                  currentUser.id,
                                  {
                                    reason: "Tindakan membutuhkan waktu tambahan",
                                    addedMinutes: m,
                                    previousDurationMinutes: prevM,
                                    actorNameSnapshot: currentUser.name || "User Klinik",
                                    treatmentId: selectedTreatment.id
                                  }
                                );
                                setSuccessMsg(`Berhasil menambah +${m} menit.`);
                                setSelectedTreatment((prev) => prev ? { ...prev, estimatedDurationMinutes: newM } : null);
                                await loadActivities(selectedTreatment.id);
                                await loadData();
                              } catch (err: any) {
                                setError(err.message || "Gagal memperbarui durasi");
                              } finally {
                                setSubmitting(false);
                              }
                            }}
                            className="flex-1 py-1 px-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-[11px] font-bold shadow-2xs transition-all disabled:opacity-50"
                          >
                            +{m}m
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {selectedTreatment.notes && !canReviseTreatment(selectedTreatment) && (
                  <div className="bg-teal-50 border border-teal-100 p-2.5 rounded-xl text-teal-800">
                    <div className="text-[10px] uppercase text-teal-600 font-bold">Catatan Clinical</div>
                    <div className="mt-0.5">{selectedTreatment.notes}</div>
                  </div>
                )}
                {selectedTreatment.status === TreatmentJobStatus.PERLU_REVISI && selectedTreatment.returnReason && (
                  <div className="bg-rose-50 border border-rose-200 p-3 rounded-xl text-rose-800 space-y-1">
                    <div className="text-[10px] uppercase font-bold">Alasan dikembalikan kasir</div>
                    <div>{selectedTreatment.returnReason}</div>
                  </div>
                )}
                {canReviseTreatment(selectedTreatment) && (
                  <div className="rounded-xl border border-rose-200 bg-white p-3 space-y-2">
                    <label htmlFor="treatment-revision-service" className="block text-[10px] uppercase text-rose-800 font-bold">
                      Jenis tindakan hasil koreksi
                    </label>
                    <select
                      id="treatment-revision-service"
                      value={revisedServiceId}
                      onChange={(event) => void handleRevisionServiceChange(event.target.value)}
                      required
                      className="w-full rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-400"
                    >
                      {services
                        .filter((service) => service.isActive || service.id === selectedTreatment.serviceId)
                        .map((service) => (
                          <option key={service.id} value={service.id}>
                            {service.name}{service.isActive ? "" : " (nonaktif)"}
                          </option>
                        ))}
                    </select>
                    <label htmlFor="treatment-revision-price" className="block text-[10px] uppercase text-rose-800 font-bold">
                      Harga tindakan hasil koreksi (Rp)
                    </label>
                    <input
                      id="treatment-revision-price"
                      type="number"
                      min="0"
                      max={Number.MAX_SAFE_INTEGER}
                      step="1"
                      value={revisedTreatmentPrice}
                      disabled={loadingRevisionTariff}
                      onChange={(event) => {
                        setRevisedTreatmentPrice(event.target.value === "" ? 0 : Number(event.target.value));
                        setRevisionPatientApprovalConfirmed(false);
                      }}
                      required
                      className="w-full rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-400"
                    />
                    <p className="text-[10px] text-slate-500">
                      Saat jenis tindakan diganti, nilai awal mengikuti tarif cabang. Dokter dapat menyesuaikannya sesuai kondisi tindakan.
                    </p>
                    <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/60 p-2 text-[10px] leading-relaxed text-slate-700">
                      <input
                        type="checkbox"
                        checked={revisionPatientApprovalConfirmed}
                        onChange={(event) => setRevisionPatientApprovalConfirmed(event.target.checked)}
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-amber-600"
                      />
                      <span>Harga hasil koreksi telah dijelaskan kepada pasien dan disetujui secara lisan.</span>
                    </label>
                    <label htmlFor="treatment-revision-notes" className="text-[10px] uppercase text-rose-800 font-bold">
                      Perbaiki catatan tindakan
                    </label>
                    <textarea
                      id="treatment-revision-notes"
                      value={correctedTreatmentNotes}
                      onChange={(event) => setCorrectedTreatmentNotes(event.target.value)}
                      rows={3}
                      required
                      className="w-full rounded-lg border border-slate-200 p-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-400"
                      placeholder="Tulis catatan tindakan yang sudah dikoreksi"
                    />
                  </div>
                )}

                {selectedTreatment.status === TreatmentJobStatus.DALAM_PROSES && canCompleteTreatment(selectedTreatment) && (
                  <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-emerald-800">
                      <PackageMinus className="h-4 w-4" /> Resep Bahan Otomatis
                    </div>
                    {!selectedTreatmentRecipe ? (
                      <p className="text-[10px] leading-relaxed text-red-700">
                        Kode layanan belum memiliki resep stok. Tindakan tidak dapat diselesaikan otomatis.
                      </p>
                    ) : selectedTreatmentRecipeLines.length === 0 ? (
                      <p className="text-[10px] leading-relaxed text-slate-600">
                        Tidak ada bahan yang dipotong untuk layanan ini.
                      </p>
                    ) : (
                      <>
                        <div className="flex flex-wrap gap-1.5">
                          {selectedTreatmentRecipeLines.map((line) => {
                            const item = inventoryItems.find((row) => row.itemCode.toUpperCase() === line.itemCode);
                            return (
                              <span key={line.itemCode} className="rounded-md bg-white px-2 py-1 text-[10px] text-slate-700">
                                {line.itemCode}: {line.quantity} {item?.unit || ""}
                              </span>
                            );
                          })}
                        </div>
                        {!approvedRecipeMaterials && selectedTreatmentRecipe.requiresBraceMaterialChoice && (
                          <p className="text-[10px] leading-relaxed text-amber-800">
                            Resep khusus cabang belum disetujui. Resep standar digunakan saat tindakan diselesaikan; stok dapat menjadi minus jika persediaan kurang.
                          </p>
                        )}
                        <p className="text-[10px] leading-relaxed text-emerald-800">
                          Stok resep dipotong ketika tindakan diselesaikan. Bahan yang sudah dicatat manual untuk tindakan ini tidak dipotong dua kali.
                        </p>
                      </>
                    )}
                  </div>
                )}

              </div>

              {/* Activity Timeline Section */}
              <div className="border border-slate-100 p-3.5 rounded-xl space-y-3 bg-slate-50/50">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                  <h4 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-teal-600" />
                    Activity Audit Trail ({activities.length})
                  </h4>
                </div>

                {/* Timeline list */}
                <div className="max-h-52 overflow-y-auto space-y-2 pr-1">
                  {activities.length === 0 ? (
                    <div className="text-[11px] text-slate-400 italic py-2 text-center">
                      Belum ada activity audit trail.
                    </div>
                  ) : (
                    activities.map((act) => (
                      <div key={act.id} className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs space-y-1 text-[11px]">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-800 px-2 py-0.5 rounded-md bg-teal-50 text-teal-700 text-[10px]">
                            {act.activityType}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {formatActivityDateTime(act.activityAt || act.timestamp || act.createdAt)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-slate-700 font-medium">
                          <span>{act.actorNameSnapshot}</span>
                          <span className="text-[9px] font-bold uppercase text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                            {act.actorRole}
                          </span>
                        </div>
                        {act.notes && (
                          <div className="text-slate-500 text-[10px] italic border-t border-slate-100 pt-1 mt-1">
                            "{act.notes}"
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>

                {/* Form Add Activity */}
                {canManageTreatment && <form onSubmit={handleAddManualActivity} className="pt-2 border-t border-slate-200 space-y-2">
                  <div className="font-semibold text-[11px] text-slate-800">Tambah Catatan Activity</div>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={activityType}
                      onChange={(e) => setActivityType(e.target.value as TreatmentActivityType)}
                      className="border border-slate-200 bg-white rounded-lg p-1.5 text-[11px] focus:ring-1 focus:ring-teal-500"
                    >
                      <option value={TreatmentActivityType.PROGRESS}>PROGRESS</option>
                      <option value={TreatmentActivityType.OTHER}>OTHER</option>
                    </select>
                    <button
                      type="submit"
                      disabled={addingActivity}
                      className="bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium text-[11px] py-1.5 px-3 shadow-2xs disabled:opacity-50"
                    >
                      {addingActivity ? "..." : "+ Activity"}
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="Catatan aktivitas..."
                    value={activityNotes}
                    onChange={(e) => setActivityNotes(e.target.value)}
                    className="w-full border border-slate-200 bg-white rounded-lg p-1.5 text-[11px] focus:ring-1 focus:ring-teal-500"
                  />
                </form>}
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <div className="flex gap-2">
                <button
                  onClick={() => setSelectedTreatment(null)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg text-xs font-semibold"
                >
                  Tutup
                </button>
                {canCompleteTreatment(selectedTreatment) && selectedTreatment.status === TreatmentJobStatus.DALAM_PROSES && (
                  <button
                    onClick={() => void handleCompleteTreatment(selectedTreatment)}
                      disabled={completingTreatment}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {completingTreatment ? "Menyelesaikan..." : "Selesaikan & Kurangi Stok"}
                  </button>
                )}
                {canReviseTreatment(selectedTreatment) && (
                  <button
                    type="button"
                    onClick={() => void handleResubmitTreatment(selectedTreatment)}
                    disabled={
                      submittingRevision
                      || loadingRevisionTariff
                      || !correctedTreatmentNotes.trim()
                      || !revisedServiceId
                      || !revisionPatientApprovalConfirmed
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
                  >
                    <Send className="h-3.5 w-3.5" />
                    {submittingRevision ? "Menyimpan..." : "Simpan Koreksi"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
