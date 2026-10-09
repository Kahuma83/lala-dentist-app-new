import React, { useState, useEffect, useRef } from "react";
import { useApp } from "../context/AppContext";
import {
  MasterService,
  BranchServiceTariff,
  UserRole,
  ClinicBranding,
  DentalBranch,
  DentalDoctor,
  DoctorBranchAssignment,
  PromotionMedia
} from "../types/domain";
import {
  Settings,
  Plus,
  Search,
  Filter,
  Building2,
  Tag,
  Clock,
  CheckCircle2,
  DollarSign,
  Edit2,
  AlertCircle,
  Sparkles,
  Image as ImageIcon,
  Globe,
  Phone,
  Mail,
  MapPin,
  Save,
  Check,
  UserCheck,
  Upload,
  Trash2,
  RefreshCw,
  Eye,
  Camera,
  Briefcase,
  Award,
  ShieldCheck,
  FileText,
  Power,
  ArrowUp,
  ArrowDown,
  Database
} from "lucide-react";
import { DocumentHeader } from "../components/documents/DocumentHeader";
import { LalaLogo } from "../components/common/LalaLogo";
import { BackupManagement } from "./BackupManagement";
import { MOCK_BRANCHES, MOCK_DOCTORS, MOCK_SERVICES } from "../data/mockData";

export const Configuration: React.FC = () => {
  const {
    currentUser,
    configRepo,
    branchRepo,
    doctorRepo,
    mediaStorageRepo,
    promotionRepo,
    setBranding: setAppBranding,
    refreshData
  } = useApp();

  const [services, setServices] = useState<MasterService[]>([]);
  const [branches, setBranches] = useState<DentalBranch[]>([]);
  const [doctors, setDoctors] = useState<DentalDoctor[]>([]);
  const [doctorAssignments, setDoctorAssignments] = useState<DoctorBranchAssignment[]>([]);
  const [promotions, setPromotions] = useState<PromotionMedia[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>("branch-gebang");
  const [branchTariffs, setBranchTariffs] = useState<BranchServiceTariff[]>([]);
  const [loading, setLoading] = useState(true);

  // Tab State with URL query param support
  const [activeTab, setActiveTab] = useState<"BRANCHES" | "DOCTORS" | "PROMOTIONS" | "SERVICES" | "TARIFFS" | "BRANDING" | "BACKUP">(() => {
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get("tab")?.toUpperCase();
    if (tabParam === "BRANCHES") return "BRANCHES";
    if (tabParam === "DOCTORS") return "DOCTORS";
    if (tabParam === "PROMOTIONS") return "PROMOTIONS";
    if (tabParam === "SERVICES") return "SERVICES";
    if (tabParam === "TARIFFS") return "TARIFFS";
    if (tabParam === "BRANDING") return "BRANDING";
    if (tabParam === "BACKUP") return "BACKUP";
    return "BRANCHES";
  });

  // Modals state
  const [showServiceModal, setShowServiceModal] = useState(false);
  const [showTariffModal, setShowTariffModal] = useState(false);
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [showDoctorModal, setShowDoctorModal] = useState(false);
  const [showPromoModal, setShowPromoModal] = useState(false);

  // Filter and Search states
  const [branchSearch, setBranchSearch] = useState("");
  const [doctorSearch, setDoctorSearch] = useState("");
  const [promoSearch, setPromoSearch] = useState("");

  // Branch Form State
  const [editingBranch, setEditingBranch] = useState<DentalBranch | null>(null);
  const [branchFormCode, setBranchFormCode] = useState("");
  const [branchFormName, setBranchFormName] = useState("");
  const [branchFormClinicName, setBranchFormClinicName] = useState("Lala Dentist");
  const [branchFormAddress, setBranchFormAddress] = useState("");
  const [branchFormPhone, setBranchFormPhone] = useState("");
  const [branchFormWhatsapp, setBranchFormWhatsapp] = useState("");
  const [branchFormEmail, setBranchFormEmail] = useState("");
  const [branchFormOperationalHours, setBranchFormOperationalHours] = useState("");
  const [branchFormLogoUrl, setBranchFormLogoUrl] = useState<string | null>("/logo-lala.png");
  const [branchFormImageUrl, setBranchFormImageUrl] = useState<string | null>(null);
  const [branchFormActive, setBranchFormActive] = useState(true);

  // Promotion Form State
  const [editingPromo, setEditingPromo] = useState<PromotionMedia | null>(null);
  const [promoFormTitle, setPromoFormTitle] = useState("");
  const [promoFormDescription, setPromoFormDescription] = useState("");
  const [promoFormImageUrl, setPromoFormImageUrl] = useState("");
  const [promoFormBranchId, setPromoFormBranchId] = useState<string | null>(null);
  const [promoFormIsActive, setPromoFormIsActive] = useState(true);
  const [promoFormDisplayOrder, setPromoFormDisplayOrder] = useState<number>(1);
  const [uploadingPromoMedia, setUploadingPromoMedia] = useState(false);
  const [isSubmittingPromo, setIsSubmittingPromo] = useState(false);
  const [deletingPromoId, setDeletingPromoId] = useState<string | null>(null);
  const [promoToDelete, setPromoToDelete] = useState<PromotionMedia | null>(null);
  const [togglingPromoId, setTogglingPromoId] = useState<string | null>(null);
  const promoFileInputRef = useRef<HTMLInputElement | null>(null);
  const branchImageFileInputRef = useRef<HTMLInputElement | null>(null);

  // Doctor Form State
  const [editingDoctor, setEditingDoctor] = useState<DentalDoctor | null>(null);
  const [doctorFormCode, setDoctorFormCode] = useState("");
  const [doctorFormName, setDoctorFormName] = useState("");
  const [doctorFormTitle, setDoctorFormTitle] = useState("");
  const [doctorFormSpecialization, setDoctorFormSpecialization] = useState("Dokter Gigi Umum");
  const [doctorFormPhone, setDoctorFormPhone] = useState("");
  const [doctorFormEmail, setDoctorFormEmail] = useState("");
  const [doctorFormStr, setDoctorFormStr] = useState("");
  const [doctorFormSip, setDoctorFormSip] = useState("");
  const [doctorFormPhotoUrl, setDoctorFormPhotoUrl] = useState<string | null>(null);
  const [doctorFormActive, setDoctorFormActive] = useState(true);
  const [doctorToDelete, setDoctorToDelete] = useState<DentalDoctor | null>(null);
  const [isDeletingDoctor, setIsDeletingDoctor] = useState(false);

  // File upload refs
  const branchFileInputRef = useRef<HTMLInputElement | null>(null);
  const doctorFileInputRef = useRef<HTMLInputElement | null>(null);
  const brandingFileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [uploadingBrandingLogo, setUploadingBrandingLogo] = useState(false);

  // Service form state
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formPrice, setFormPrice] = useState<number>(150000);
  const [formDuration, setFormDuration] = useState<number>(30);
  const [formCategory, setFormCategory] = useState("Pencegahan & Estetika");
  const [formServiceId, setFormServiceId] = useState<string | null>(null);

  // Tariff form state
  const [tariffServiceId, setTariffServiceId] = useState("");
  const [tariffCustomPrice, setTariffCustomPrice] = useState<number>(200000);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Branding state
  const [branding, setBranding] = useState<ClinicBranding>({
    id: "branding-main",
    name: "LALA DENTIST",
    tagline: "Senyum Indah dimulai di Laladentist",
    logoUrl: "/logo-lala.png",
    address: "Jl. Gebang Raya No. 42, Patrang, Jember, Jawa Timur",
    phone: "0812-3456-7800",
    whatsapp: "6281234567800",
    email: "info@laladentist.com",
    website: "www.laladentist.com",
    footerNote: "Terima kasih atas kepercayaan Anda merawat kesehatan gigi & mulut di Klinik Lala Dentist. Senyum Indah dimulai di Laladentist.",
    updatedAt: "2026-01-01T00:00:00Z"
  });
  const [brandingSuccess, setBrandingSuccess] = useState(false);
  const [brandingError, setBrandingError] = useState("");

  // Sync tab with URL search parameter if changes externally
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get("tab")?.toUpperCase();
      if (tabParam && ["BRANCHES", "DOCTORS", "PROMOTIONS", "SERVICES", "TARIFFS", "BRANDING", "BACKUP"].includes(tabParam)) {
        setActiveTab(tabParam as any);
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const changeTab = (tab: "BRANCHES" | "DOCTORS" | "PROMOTIONS" | "SERVICES" | "TARIFFS" | "BRANDING" | "BACKUP") => {
    setActiveTab(tab);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab.toLowerCase());
    window.history.replaceState({}, "", url.toString());
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const results = await Promise.allSettled([
        configRepo.getServices(),
        branchRepo.getBranches(currentUser?.role, currentUser?.assignedBranchId),
        doctorRepo.getDoctors(),
        doctorRepo.getDoctorBranchAssignments(),
        configRepo.getClinicBranding(),
        promotionRepo.getPromotions(currentUser?.role, currentUser?.assignedBranchId)
      ]);

      const [sRes, bRes, dRes, dbaRes, brandRes, pRes] = results;

      const sList = sRes.status === "fulfilled" && sRes.value.length > 0 ? sRes.value : MOCK_SERVICES;
      const rawBList = bRes.status === "fulfilled" ? bRes.value : [];
      const bList = rawBList.length > 0 ? rawBList : MOCK_BRANCHES;
      const rawDList = dRes.status === "fulfilled" ? dRes.value : [];
      const dList = rawDList.length > 0 ? rawDList : MOCK_DOCTORS;
      const dbaList = dbaRes.status === "fulfilled" ? dbaRes.value : [];
      const brand = brandRes.status === "fulfilled" ? brandRes.value : null;
      const pList = pRes.status === "fulfilled" ? pRes.value : [];

      setServices(sList);
      setBranches(bList);
      setDoctors(dList);
      setDoctorAssignments(dbaList);
      setPromotions(pList);
      if (brand) setBranding(brand);

      if (selectedBranchId && bList.some((b) => b.id === selectedBranchId)) {
        try {
          const tList = await configRepo.getBranchTariffs(selectedBranchId);
          setBranchTariffs(tList);
        } catch (tErr) {
          console.warn("Could not load branch tariffs:", tErr);
          setBranchTariffs([]);
        }
      } else if (bList.length > 0) {
        setSelectedBranchId(bList[0].id);
        try {
          const tList = await configRepo.getBranchTariffs(bList[0].id);
          setBranchTariffs(tList);
        } catch (tErr) {
          console.warn("Could not load branch tariffs:", tErr);
          setBranchTariffs([]);
        }
      }
    } catch (err) {
      console.error("Error loading configuration:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedBranchId]);

  // ==========================================
  // BRANCH MANAGEMENT HANDLERS
  // ==========================================
  const handleOpenBranchModal = (branch?: DentalBranch) => {
    setErrorMsg("");
    setSuccessMsg("");
    if (branch) {
      setEditingBranch(branch);
      setBranchFormCode(branch.branchCode || branch.id.replace("branch-", "").toUpperCase());
      setBranchFormName(branch.branchName || branch.name);
      setBranchFormClinicName(branch.clinicName || "Lala Dentist");
      setBranchFormAddress(branch.address);
      setBranchFormPhone(branch.phone);
      setBranchFormWhatsapp(branch.whatsapp || branch.phone);
      setBranchFormEmail(branch.email || "");
      setBranchFormOperationalHours(branch.operationalHours || "");
      setBranchFormLogoUrl(branch.logoUrl || "/logo-lala.png");
      setBranchFormImageUrl(branch.imageUrl || null);
      setBranchFormActive(branch.isActive ?? branch.active ?? true);
    } else {
      setEditingBranch(null);
      setBranchFormCode("");
      setBranchFormName("");
      setBranchFormClinicName("Lala Dentist");
      setBranchFormAddress("");
      setBranchFormPhone("");
      setBranchFormWhatsapp("");
      setBranchFormEmail("");
      setBranchFormOperationalHours("Senin-Sabtu: 08.00-21.00");
      setBranchFormLogoUrl("/logo-lala.png");
      setBranchFormImageUrl(null);
      setBranchFormActive(true);
    }
    setShowBranchModal(true);
  };

  const handleBranchFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg("Ukuran file logo cabang melebihi batas maksimal 5MB");
      return;
    }

    setUploadingMedia(true);
    setErrorMsg("");
    try {
      // Read as Data URL for instant rendering in simulation
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64Url = reader.result as string;
          const uploadRes = await mediaStorageRepo.uploadImage(
            {
              name: file.name,
              type: file.type,
              size: file.size,
              base64OrDataUrl: base64Url
            },
            "branch-logos"
          );
          setBranchFormLogoUrl(uploadRes.url);
          setSuccessMsg("Logo cabang berhasil diunggah!");
          setTimeout(() => setSuccessMsg(""), 3000);
        } catch (err: any) {
          setErrorMsg(err.message || "Gagal mengunggah gambar logo");
        } finally {
          setUploadingMedia(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      setErrorMsg(err.message || "Gagal memproses file");
      setUploadingMedia(false);
    }
  };

  const handleRemoveBranchLogo = async () => {
    if (branchFormLogoUrl) {
      try {
        await mediaStorageRepo.deleteImage(branchFormLogoUrl);
      } catch (e) {
        console.warn("Delete media warning:", e);
      }
    }
    setBranchFormLogoUrl(null);
  };

  const handleBranchImageFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg("Ukuran foto cabang melebihi batas maksimal 5MB");
      return;
    }

    setUploadingMedia(true);
    setErrorMsg("");
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64Url = reader.result as string;
          const uploadRes = await mediaStorageRepo.uploadImage(
            {
              name: file.name,
              type: file.type,
              size: file.size,
              base64OrDataUrl: base64Url
            },
            "branch-photos"
          );
          setBranchFormImageUrl(uploadRes.url);
          setSuccessMsg("Foto cabang berhasil diunggah!");
          setTimeout(() => setSuccessMsg(""), 3000);
        } catch (err: any) {
          setErrorMsg(err.message || "Gagal mengunggah foto cabang");
        } finally {
          setUploadingMedia(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      setErrorMsg(err.message || "Gagal memproses file foto cabang");
      setUploadingMedia(false);
    }
  };

  const handleRemoveBranchImage = async () => {
    if (branchFormImageUrl) {
      try {
        await mediaStorageRepo.deleteImage(branchFormImageUrl);
      } catch (e) {
        console.warn("Delete media warning:", e);
      }
    }
    setBranchFormImageUrl(null);
  };

  const handleBrandingFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setBrandingError("Ukuran file logo klinik melebihi batas maksimal 5MB");
      return;
    }

    setUploadingBrandingLogo(true);
    setBrandingError("");
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64Url = reader.result as string;
          const uploadRes = await mediaStorageRepo.uploadImage(
            {
              name: file.name,
              type: file.type,
              size: file.size,
              base64OrDataUrl: base64Url
            },
            "branding-logos"
          );
          setBranding((prev) => ({ ...prev, logoUrl: uploadRes.url }));
          setAppBranding((prev) => (prev ? { ...prev, logoUrl: uploadRes.url } : null));
          setBrandingSuccess(true);
          setTimeout(() => setBrandingSuccess(false), 3000);
        } catch (err: any) {
          setBrandingError(err.message || "Gagal mengunggah gambar logo");
        } finally {
          setUploadingBrandingLogo(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      setBrandingError(err.message || "Gagal memproses file");
      setUploadingBrandingLogo(false);
    }
  };

  const handleRemoveBrandingLogo = async () => {
    if (branding.logoUrl) {
      try {
        await mediaStorageRepo.deleteImage(branding.logoUrl);
      } catch (e) {
        console.warn("Delete media warning:", e);
      }
    }
    setBranding((prev) => ({ ...prev, logoUrl: null }));
  };

  const handleSaveBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (currentUser?.role !== UserRole.SUPER_ADMIN) {
      setErrorMsg("Hanya Super Admin yang berwenang mengubah profil dan identitas master cabang");
      return;
    }

    if (!branchFormName.trim()) {
      setErrorMsg("Nama cabang wajib diisi");
      return;
    }
    if (!branchFormAddress.trim()) {
      setErrorMsg("Alamat cabang wajib diisi");
      return;
    }
    if (!branchFormPhone.trim()) {
      setErrorMsg("Nomor telepon cabang wajib diisi");
      return;
    }

    setIsSubmitting(true);
    setErrorMsg("");
    try {
      if (editingBranch) {
        // Update existing branch (branch.id is strictly immutable)
        await branchRepo.updateBranch(
          editingBranch.id,
          {
            name: branchFormName.trim(),
            branchName: branchFormName.trim(),
            clinicName: branchFormClinicName.trim(),
            address: branchFormAddress.trim(),
            phone: branchFormPhone.trim(),
            whatsapp: branchFormWhatsapp.trim() || branchFormPhone.trim(),
            email: branchFormEmail.trim(),
            operationalHours: branchFormOperationalHours.trim() || undefined,
            logoUrl: branchFormLogoUrl,
            imageUrl: branchFormImageUrl,
            isActive: branchFormActive,
            active: branchFormActive
          },
          currentUser.role,
          currentUser.assignedBranchId
        );
      } else {
        // Create new branch
        if (!branchFormCode.trim()) {
          setErrorMsg("Kode cabang wajib diisi untuk cabang baru");
          setIsSubmitting(false);
          return;
        }

        await branchRepo.createBranch(
          {
            branchCode: branchFormCode.trim().toUpperCase(),
            name: branchFormName.trim(),
            branchName: branchFormName.trim(),
            clinicName: branchFormClinicName.trim(),
            address: branchFormAddress.trim(),
            phone: branchFormPhone.trim(),
            whatsapp: branchFormWhatsapp.trim() || branchFormPhone.trim(),
            email: branchFormEmail.trim() || `${branchFormCode.trim().toLowerCase()}@laladentist.com`,
            operationalHours: branchFormOperationalHours.trim() || undefined,
            logoUrl: branchFormLogoUrl,
            imageUrl: branchFormImageUrl,
            isActive: branchFormActive,
            active: branchFormActive
          },
          currentUser.role
        );
      }

      setShowBranchModal(false);
      await loadData();
      await refreshData();
      setSuccessMsg(`Cabang "${branchFormName}" berhasil disimpan!`);
      setTimeout(() => setSuccessMsg(""), 3000);
    } catch (err: any) {
      setErrorMsg(err.message || "Gagal menyimpan data cabang");
    } finally {
      setIsSubmitting(false);
    }
  };

  const [isSeedingBranches, setIsSeedingBranches] = useState(false);

  const handleSeedDefaultBranches = async () => {
    if (currentUser?.role !== UserRole.SUPER_ADMIN) return;
    setIsSeedingBranches(true);
    setErrorMsg("");
    try {
      const defaultList = [
        {
          branchCode: "AMB",
          name: "Cabang Ambulu",
          branchName: "Lala Dentist Ambulu",
          clinicName: "Lala Dentist",
          address: "Jl. Raya Suyitman No. 126 Ambulu",
          phone: "0812-3456-7801",
          whatsapp: "081234567801",
          email: "ambulu@laladentist.com",
          operationalHours: "Senin-Sabtu: 08.00-21.00",
          isActive: true
        },
        {
          branchCode: "GEB",
          name: "Cabang Gebang",
          branchName: "Lala Dentist Gebang",
          clinicName: "Lala Dentist",
          address: "Jl. Kacapiring Ruko Kamajaya No.5 Gebang",
          phone: "0812-3456-7800",
          whatsapp: "081234567800",
          email: "gebang@laladentist.com",
          operationalHours: "Senin-Sabtu: 08.00-21.00, Minggu: 08.00-17.00",
          isActive: true
        },
        {
          branchCode: "LEN",
          name: "Cabang Lengkong Mumbul",
          branchName: "Lala Dentist Lengkong Mumbul",
          clinicName: "Lala Dentist",
          address: "Jl. Soekarno Hatta No.36 Lengkong Mumbul",
          phone: "0812-3456-7802",
          whatsapp: "081234567802",
          email: "lengkong@laladentist.com",
          operationalHours: "Senin-Sabtu: 08.00-19.00",
          isActive: true
        },
        {
          branchCode: "KEN",
          name: "Cabang Kencong",
          branchName: "Lala Dentist Kencong",
          clinicName: "Lala Dentist",
          address: "Jl. RA. KARTINI NO.110, KENCONG-JEMBER (PAS DISAMPING C'BEZT KENCONG)",
          phone: "0812-3456-7804",
          whatsapp: "081234567804",
          email: "kencong@laladentist.com",
          operationalHours: "Senin-Sabtu: 08.00-21.00",
          isActive: true
        },
        {
          branchCode: "KAM",
          name: "Cabang Kampus",
          branchName: "Lala Dentist Kampus",
          clinicName: "Lala Dentist",
          address: "Jl. Tidar",
          phone: "0812-3456-7805",
          whatsapp: "081234567805",
          email: "kampus@laladentist.com",
          operationalHours: "Senin-Sabtu: 08.00-21.00, Minggu: 08.00-17.00",
          isActive: true
        }
      ];

      const currentBranches = await branchRepo.getBranches(currentUser?.role);

      for (const b of defaultList) {
        try {
          const existing = currentBranches.find(
            (curr) =>
              (curr.branchCode && curr.branchCode.toUpperCase() === b.branchCode.toUpperCase()) ||
              curr.name.toLowerCase().includes(b.name.toLowerCase().replace("cabang ", ""))
          );

          if (existing) {
            await branchRepo.updateBranch(
              existing.id,
              {
                name: b.name,
                branchName: b.branchName,
                clinicName: b.clinicName,
                address: b.address,
                phone: b.phone,
                whatsapp: b.whatsapp,
                email: b.email,
                operationalHours: b.operationalHours,
                isActive: b.isActive,
                active: b.isActive
              },
              currentUser?.role
            );
          } else {
            await branchRepo.createBranch(b as any, currentUser?.role);
          }
        } catch (itemErr) {
          console.warn(`Error processing branch ${b.name}:`, itemErr);
        }
      }
      setBranches(defaultList.map((d, i) => ({
        id: `branch-${d.branchCode.toLowerCase()}`,
        name: d.name,
        branchName: d.branchName,
        branchCode: d.branchCode,
        clinicName: d.clinicName,
        address: d.address,
        phone: d.phone,
        whatsapp: d.whatsapp,
        email: d.email,
        operationalHours: d.operationalHours,
        isActive: d.isActive,
        active: d.isActive,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })));
      setSuccessMsg("5 Cabang terbaru berhasil disinkronkan ke database!");
      await loadData();
      await refreshData();
      setTimeout(() => setSuccessMsg(""), 3000);
    } catch (err: any) {
      setErrorMsg(err.message || "Gagal menginisialisasi cabang");
    } finally {
      setIsSeedingBranches(false);
    }
  };

  // ==========================================
  // PROMOTION MANAGEMENT HANDLERS (SUPER_ADMIN)
  // ==========================================
  const handleOpenPromoModal = (promo?: PromotionMedia) => {
    setErrorMsg("");
    setSuccessMsg("");
    if (promo) {
      setEditingPromo(promo);
      setPromoFormTitle(promo.title);
      setPromoFormDescription(promo.description || "");
      setPromoFormImageUrl(promo.imageUrl);
      setPromoFormBranchId(promo.branchId || null);
      setPromoFormIsActive(promo.isActive);
      setPromoFormDisplayOrder(promo.displayOrder);
    } else {
      setEditingPromo(null);
      setPromoFormTitle("");
      setPromoFormDescription("");
      setPromoFormImageUrl("");
      setPromoFormBranchId(null);
      setPromoFormIsActive(true);
      setPromoFormDisplayOrder(promotions.length > 0 ? Math.max(...promotions.map((p) => p.displayOrder)) + 1 : 1);
    }
    setShowPromoModal(true);
  };

  const handlePromoFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg("Ukuran gambar promosi melebihi batas maksimal 5MB");
      return;
    }

    setUploadingPromoMedia(true);
    setErrorMsg("");
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64Url = reader.result as string;
          const uploadRes = await mediaStorageRepo.uploadImage(
            {
              name: file.name,
              type: file.type,
              size: file.size,
              base64OrDataUrl: base64Url
            },
            "promotions"
          );
          setPromoFormImageUrl(uploadRes.url);
          setSuccessMsg("Gambar promosi berhasil diunggah!");
          setTimeout(() => setSuccessMsg(""), 3000);
        } catch (err: any) {
          setErrorMsg(err.message || "Gagal mengunggah gambar promosi");
        } finally {
          setUploadingPromoMedia(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      setErrorMsg(err.message || "Gagal memproses file gambar promosi");
      setUploadingPromoMedia(false);
    }
  };

  const handleRemovePromoImage = async () => {
    if (promoFormImageUrl) {
      try {
        await mediaStorageRepo.deleteImage(promoFormImageUrl);
      } catch (e) {
        console.warn("Delete media warning:", e);
      }
    }
    setPromoFormImageUrl("");
  };

  const handleSavePromo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (currentUser?.role !== UserRole.SUPER_ADMIN) {
      setErrorMsg("Hanya Super Admin yang berwenang mengelola promosi");
      return;
    }

    if (!promoFormTitle.trim()) {
      setErrorMsg("Judul promosi wajib diisi");
      return;
    }

    if (!promoFormImageUrl.trim()) {
      setErrorMsg("Gambar promosi wajib diunggah");
      return;
    }

    setIsSubmittingPromo(true);
    setErrorMsg("");
    try {
      if (editingPromo) {
        await promotionRepo.updatePromotion(
          editingPromo.id,
          {
            title: promoFormTitle.trim(),
            description: promoFormDescription.trim(),
            imageUrl: promoFormImageUrl.trim(),
            branchId: promoFormBranchId || null,
            isActive: promoFormIsActive,
            displayOrder: promoFormDisplayOrder
          },
          currentUser.role
        );
      } else {
        await promotionRepo.createPromotion(
          {
            title: promoFormTitle.trim(),
            description: promoFormDescription.trim(),
            imageUrl: promoFormImageUrl.trim(),
            branchId: promoFormBranchId || null,
            isActive: promoFormIsActive,
            displayOrder: promoFormDisplayOrder
          },
          currentUser.role
        );
      }

      await loadData();
      await refreshData();
      setShowPromoModal(false);
      setSuccessMsg(`Promosi "${promoFormTitle}" berhasil disimpan!`);
      setTimeout(() => setSuccessMsg(""), 3000);
    } catch (err: any) {
      setErrorMsg(err.message || "Gagal menyimpan data promosi");
    } finally {
      setIsSubmittingPromo(false);
    }
  };

  const handleTogglePromoActive = async (promo: PromotionMedia) => {
    if (currentUser?.role !== UserRole.SUPER_ADMIN) return;
    setTogglingPromoId(promo.id);
    setErrorMsg("");
    try {
      await promotionRepo.toggleActive(promo.id, !promo.isActive, currentUser.role);
      await loadData();
      await refreshData();
      setSuccessMsg(`Status promosi "${promo.title}" berhasil diubah!`);
      setTimeout(() => setSuccessMsg(""), 3000);
    } catch (err: any) {
      setErrorMsg(err.message || "Gagal mengubah status promosi");
    } finally {
      setTogglingPromoId(null);
    }
  };

  const handleConfirmDeletePromo = async () => {
    if (!promoToDelete || currentUser?.role !== UserRole.SUPER_ADMIN) return;

    setDeletingPromoId(promoToDelete.id);
    setErrorMsg("");
    try {
      await promotionRepo.deletePromotion(promoToDelete.id, currentUser.role);
      setSuccessMsg(`Promosi "${promoToDelete.title}" berhasil dihapus!`);
      setPromoToDelete(null);
      await loadData();
      await refreshData();
      setTimeout(() => setSuccessMsg(""), 3000);
    } catch (err: any) {
      setErrorMsg(err.message || "Gagal menghapus promosi");
    } finally {
      setDeletingPromoId(null);
    }
  };

  // ==========================================
  // DOCTOR & PHOTO MANAGEMENT HANDLERS
  // ==========================================
  const handleOpenDoctorModal = (doctor?: DentalDoctor) => {
    setErrorMsg("");
    setSuccessMsg("");
    if (doctor) {
      setEditingDoctor(doctor);
      setDoctorFormCode(doctor.doctorCode || doctor.id.toUpperCase());
      setDoctorFormName(doctor.name || doctor.fullName || "");
      setDoctorFormTitle(doctor.title || doctor.specialization || "Dokter Gigi Umum");
      setDoctorFormSpecialization(doctor.specialization || "Dokter Gigi Umum");
      setDoctorFormPhone(doctor.phone || "");
      setDoctorFormEmail(doctor.email || "");
      setDoctorFormStr(doctor.str || "");
      setDoctorFormSip(doctor.sip || "");
      setDoctorFormPhotoUrl(doctor.photoUrl || doctor.avatarUrl || doctor.profileImage || null);
      setDoctorFormActive(doctor.isActive ?? doctor.active ?? true);
    } else {
      setEditingDoctor(null);
      setDoctorFormCode("");
      setDoctorFormName("");
      setDoctorFormTitle("Dokter Gigi Umum");
      setDoctorFormSpecialization("Dokter Gigi Umum");
      setDoctorFormPhone("");
      setDoctorFormEmail("");
      setDoctorFormStr("");
      setDoctorFormSip("");
      setDoctorFormPhotoUrl(null);
      setDoctorFormActive(true);
    }
    setShowDoctorModal(true);
  };

  const handleDoctorFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg("Ukuran foto dokter melebihi batas maksimal 5MB");
      return;
    }

    setUploadingMedia(true);
    setErrorMsg("");
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64Url = reader.result as string;
          const uploadRes = await mediaStorageRepo.uploadImage(
            {
              name: file.name,
              type: file.type,
              size: file.size,
              base64OrDataUrl: base64Url
            },
            "doctor-portraits"
          );
          setDoctorFormPhotoUrl(uploadRes.url);
          setSuccessMsg("Foto dokter berhasil diunggah!");
          setTimeout(() => setSuccessMsg(""), 3000);
        } catch (err: any) {
          setErrorMsg(err.message || "Gagal mengunggah foto dokter");
        } finally {
          setUploadingMedia(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      setErrorMsg(err.message || "Gagal memproses file foto");
      setUploadingMedia(false);
    }
  };

  const handleRemoveDoctorPhoto = async () => {
    if (doctorFormPhotoUrl) {
      try {
        await mediaStorageRepo.deleteImage(doctorFormPhotoUrl);
      } catch (e) {
        console.warn("Delete media warning:", e);
      }
    }
    setDoctorFormPhotoUrl(null);
  };

  const handleSaveDoctor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (currentUser?.role !== UserRole.SUPER_ADMIN) {
      setErrorMsg("Hanya Super Admin yang berwenang mengubah master dokter dan foto");
      return;
    }

    if (!doctorFormName.trim()) {
      setErrorMsg("Nama dokter wajib diisi");
      return;
    }

    setIsSubmitting(true);
    setErrorMsg("");
    try {
      if (editingDoctor) {
        // Update existing doctor photo and details
        await doctorRepo.updateDoctor(
          editingDoctor.id,
          {
            name: doctorFormName.trim(),
            fullName: doctorFormName.trim(),
            title: doctorFormTitle.trim() || doctorFormSpecialization,
            specialization: doctorFormSpecialization,
            phone: doctorFormPhone.trim(),
            email: doctorFormEmail.trim(),
            str: doctorFormStr.trim(),
            sip: doctorFormSip.trim(),
            photoUrl: doctorFormPhotoUrl,
            avatarUrl: doctorFormPhotoUrl,
            profileImage: doctorFormPhotoUrl,
            isActive: doctorFormActive,
            active: doctorFormActive
          },
          currentUser.role,
          currentUser.assignedBranchId
        );
      } else {
        // Create new doctor
        await doctorRepo.createDoctor(
          {
            doctorCode: doctorFormCode.trim().toUpperCase() || undefined,
            name: doctorFormName.trim(),
            fullName: doctorFormName.trim(),
            title: doctorFormTitle.trim() || doctorFormSpecialization,
            specialization: doctorFormSpecialization,
            phone: doctorFormPhone.trim(),
            email: doctorFormEmail.trim(),
            str: doctorFormStr.trim(),
            sip: doctorFormSip.trim(),
            photoUrl: doctorFormPhotoUrl,
            avatarUrl: doctorFormPhotoUrl,
            profileImage: doctorFormPhotoUrl,
            isActive: doctorFormActive,
            active: doctorFormActive
          },
          currentUser.role,
          currentUser.assignedBranchId
        );
      }

      setShowDoctorModal(false);
      await loadData();
      await refreshData();
      setSuccessMsg("Master dokter & foto berhasil diperbarui!");
      setTimeout(() => setSuccessMsg(""), 3000);
    } catch (err: any) {
      setErrorMsg(err.message || "Gagal menyimpan data dokter");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmDeleteDoctor = async () => {
    if (!doctorToDelete || currentUser?.role !== UserRole.SUPER_ADMIN) return;
    setIsDeletingDoctor(true);
    setErrorMsg("");
    try {
      await doctorRepo.deleteDoctor(doctorToDelete.id, currentUser.role);
      if (editingDoctor?.id === doctorToDelete.id) {
        setShowDoctorModal(false);
        setEditingDoctor(null);
      }
      const deletedName = doctorToDelete.name || doctorToDelete.fullName;
      setDoctorToDelete(null);
      await loadData();
      await refreshData();
      setSuccessMsg(`Dokter "${deletedName}" berhasil dihapus dari sistem!`);
      setTimeout(() => setSuccessMsg(""), 3000);
    } catch (err: any) {
      setErrorMsg(err.message || "Gagal menghapus dokter");
    } finally {
      setIsDeletingDoctor(false);
    }
  };

  // ==========================================
  // SERVICES & TARIFFS & BRANDING HANDLERS
  // ==========================================
  const handleSaveService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName || formPrice <= 0) {
      setErrorMsg("Nama layanan dan tarif dasar harus diisi");
      return;
    }

    setIsSubmitting(true);
    setErrorMsg("");
    try {
      if (formServiceId) {
        await configRepo.updateService(formServiceId, {
          name: formName,
          description: formDesc,
          basePrice: Number(formPrice),
          estimatedDurationMinutes: Number(formDuration),
          category: formCategory
        });
      } else {
        await configRepo.createService({
          name: formName,
          description: formDesc,
          basePrice: Number(formPrice),
          estimatedDurationMinutes: Number(formDuration),
          category: formCategory,
          isActive: true
        });
      }
      setShowServiceModal(false);
      await loadData();
    } catch (err: any) {
      setErrorMsg(err.message || "Gagal menyimpan layanan");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveTariff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tariffServiceId || tariffCustomPrice <= 0) {
      setErrorMsg("Pilih layanan dan tarif cabang dengan benar");
      return;
    }

    setIsSubmitting(true);
    setErrorMsg("");
    try {
      await configRepo.setBranchTariff(selectedBranchId, tariffServiceId, Number(tariffCustomPrice));
      setShowTariffModal(false);
      await loadData();
    } catch (err: any) {
      setErrorMsg(err.message || "Gagal mengatur tarif cabang");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveBranding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (currentUser?.role !== UserRole.SUPER_ADMIN) {
      setBrandingError("Hanya Super Admin yang berwenang mengubah konfigurasi identitas dokumen");
      return;
    }

    setIsSubmitting(true);
    setBrandingError("");
    setBrandingSuccess(false);

    try {
      const updated = await configRepo.updateClinicBranding(
        {
          name: branding.name,
          tagline: branding.tagline,
          logoUrl: branding.logoUrl,
          address: branding.address,
          phone: branding.phone,
          whatsapp: branding.whatsapp,
          email: branding.email,
          website: branding.website,
          footerNote: branding.footerNote
        },
        currentUser?.role
      );
      setBranding(updated);
      setAppBranding(updated);
      setBrandingSuccess(true);
      await refreshData();
      setTimeout(() => setBrandingSuccess(false), 3000);
    } catch (err: any) {
      setBrandingError(err.message || "Gagal menyimpan konfigurasi identitas");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getBranchTariffForService = (serviceId: string) => {
    return branchTariffs.find((t) => t.serviceId === serviceId);
  };

  const filteredBranches = branches.filter((b) => {
    const q = branchSearch.toLowerCase();
    return (
      (b.name && b.name.toLowerCase().includes(q)) ||
      (b.branchName && b.branchName.toLowerCase().includes(q)) ||
      (b.branchCode && b.branchCode.toLowerCase().includes(q)) ||
      (b.address && b.address.toLowerCase().includes(q)) ||
      (b.phone && b.phone.toLowerCase().includes(q))
    );
  });

  const filteredDoctors = doctors.filter((d) => {
    const q = doctorSearch.toLowerCase();
    const docName = d.name || d.fullName || "";
    return (
      docName.toLowerCase().includes(q) ||
      (d.doctorCode && d.doctorCode.toLowerCase().includes(q)) ||
      (d.specialization && d.specialization.toLowerCase().includes(q)) ||
      (d.title && d.title.toLowerCase().includes(q)) ||
      (d.phone && d.phone.toLowerCase().includes(q))
    );
  });

  const filteredPromotions = promotions.filter((p) => {
    const q = promoSearch.toLowerCase();
    const branch = branches.find((b) => b.id === p.branchId);
    const branchName = branch ? branch.name : "";
    return (
      p.title.toLowerCase().includes(q) ||
      (p.description && p.description.toLowerCase().includes(q)) ||
      branchName.toLowerCase().includes(q) ||
      (!p.branchId && "semua cabang global".includes(q))
    );
  });

  return (
    <div className="space-y-6" id="configuration-page">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#c5a059]/20 to-[#916b1c]/10 border border-[#ebd4a8] flex items-center justify-center text-[#916b1c]">
              {currentUser?.role === UserRole.BRANCH_ADMIN ? (
                <Building2 className="w-5 h-5" />
              ) : (
                <Settings className="w-5 h-5" />
              )}
            </div>
            {currentUser?.role === UserRole.BRANCH_ADMIN
              ? "Profil Cabang Lala Dentist"
              : "Pengaturan & Master Lala Dentist"}
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {currentUser?.role === UserRole.BRANCH_ADMIN
              ? "Informasi profil resmi, kontak, alamat, logo, dan foto gedung cabang Anda (Mode Baca)."
              : "Single Source of Truth (SSOT) untuk Master Cabang Klinik, Foto Dokter, Media Promosi, dan Katalog Layanan."}
          </p>
        </div>

        {/* Action button based on active tab */}
        {currentUser?.role === UserRole.SUPER_ADMIN && (
          <div className="flex gap-2">
            {activeTab === "BRANCHES" && (
              <button
                onClick={() => handleOpenBranchModal()}
                className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-[#916b1c] to-[#c5a059] hover:from-[#7c5b16] hover:to-[#b38f4a] text-white px-4 py-2.5 rounded-xl text-xs font-semibold shadow-xs transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Tambah Cabang Klinik
              </button>
            )}

            {activeTab === "DOCTORS" && (
              <button
                onClick={() => handleOpenDoctorModal()}
                className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-[#916b1c] to-[#c5a059] hover:from-[#7c5b16] hover:to-[#b38f4a] text-white px-4 py-2.5 rounded-xl text-xs font-semibold shadow-xs transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Tambah Master Dokter
              </button>
            )}

            {activeTab === "PROMOTIONS" && (
              <button
                onClick={() => handleOpenPromoModal()}
                className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-[#916b1c] to-[#c5a059] hover:from-[#7c5b16] hover:to-[#b38f4a] text-white px-4 py-2.5 rounded-xl text-xs font-semibold shadow-xs transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Tambah Promosi
              </button>
            )}

            {activeTab === "SERVICES" && (
              <button
                onClick={() => {
                  setFormServiceId(null);
                  setFormName("");
                  setFormDesc("");
                  setFormPrice(200000);
                  setFormDuration(30);
                  setErrorMsg("");
                  setShowServiceModal(true);
                }}
                className="inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Tambah Master Layanan
              </button>
            )}
          </div>
        )}
      </div>

      {/* Global Toast / Feedback */}
      {successMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2.5 shadow-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="font-semibold">{successMsg}</span>
        </div>
      )}

      {/* Tabs Navigation */}
      <div className="flex border-b border-slate-200 gap-2 overflow-x-auto">
        <button
          onClick={() => changeTab("BRANCHES")}
          className={`pb-3 px-4 text-xs font-bold border-b-2 transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
            activeTab === "BRANCHES"
              ? "border-[#916b1c] text-[#916b1c]"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>
            {currentUser?.role === UserRole.BRANCH_ADMIN
              ? "Profil Cabang"
              : `Cabang Klinik (${branches.length})`}
          </span>
        </button>

        {currentUser?.role === UserRole.SUPER_ADMIN && (
          <>
            <button
              onClick={() => changeTab("DOCTORS")}
              className={`pb-3 px-4 text-xs font-bold border-b-2 transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
                activeTab === "DOCTORS"
                  ? "border-[#916b1c] text-[#916b1c]"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              <UserCheck className="w-4 h-4" />
              <span>Dokter & Foto Media ({doctors.length})</span>
            </button>

            <button
              onClick={() => changeTab("PROMOTIONS")}
              className={`pb-3 px-4 text-xs font-bold border-b-2 transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
                activeTab === "PROMOTIONS"
                  ? "border-[#916b1c] text-[#916b1c]"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              <Sparkles className="w-4 h-4 text-[#916b1c]" />
              <span>Media Promosi ({promotions.length})</span>
            </button>

            <button
              onClick={() => changeTab("SERVICES")}
              className={`pb-3 px-4 text-xs font-bold border-b-2 transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
                activeTab === "SERVICES"
                  ? "border-emerald-600 text-emerald-600"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              <Briefcase className="w-4 h-4" />
              <span>Katalog Layanan ({services.length})</span>
            </button>

            <button
              onClick={() => changeTab("TARIFFS")}
              className={`pb-3 px-4 text-xs font-bold border-b-2 transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
                activeTab === "TARIFFS"
                  ? "border-emerald-600 text-emerald-600"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              <Tag className="w-4 h-4" />
              <span>Tarif Khusus Cabang</span>
            </button>

            <button
              onClick={() => changeTab("BRANDING")}
              className={`pb-3 px-4 text-xs font-bold border-b-2 transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
                activeTab === "BRANDING"
                  ? "border-emerald-600 text-emerald-600"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>Identitas Dokumen</span>
            </button>

            <button
              onClick={() => changeTab("BACKUP")}
              className={`pb-3 px-4 text-xs font-bold border-b-2 transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
                activeTab === "BACKUP"
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              <Database className="w-4 h-4 text-indigo-600" />
              <span>Sistem Backup & DR</span>
            </button>
          </>
        )}
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: MASTER CABANG KLINIK                                              */}
      {/* ========================================================================= */}
      {activeTab === "BRANCHES" && (
        <div className="space-y-4">
          {/* Access Banner for Branch Admin */}
          {currentUser?.role === UserRole.BRANCH_ADMIN && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                Mode Pratinjau Profil Cabang: Perubahan identitas cabang, kontak resmi, dan logo dikelola terpusat oleh <strong>Super Admin</strong>.
              </span>
            </div>
          )}

          {/* Search Bar & Branch Overview Cards */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={branchSearch}
                onChange={(e) => setBranchSearch(e.target.value)}
                placeholder="Cari kode cabang, nama, alamat, telepon..."
                className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c5a059]"
              />
            </div>

            <div className="flex items-center gap-4 text-xs text-slate-600 w-full sm:w-auto justify-between sm:justify-end">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                <span>Aktif: <strong>{branches.filter((b) => b.isActive !== false && b.active !== false).length}</strong></span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-300"></span>
                <span>Total Cabang: <strong>{branches.length}</strong></span>
              </div>
            </div>
          </div>

          {/* Branches Grid & Table */}
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200/80 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                  <th className="py-3 px-4">Kode & Logo</th>
                  <th className="py-3 px-4">Nama Cabang & Klinik</th>
                  <th className="py-3 px-4">Alamat Cabang</th>
                  <th className="py-3 px-4">Kontak (Telepon & WA)</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      Memuat data master cabang klinik...
                    </td>
                  </tr>
                ) : filteredBranches.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center">
                      <div className="max-w-md mx-auto space-y-3 px-4">
                        <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto text-[#916b1c]">
                          <Building2 className="w-6 h-6" />
                        </div>
                        <h3 className="text-sm font-bold text-slate-800">
                          {branchSearch ? "Tidak ada cabang yang cocok" : "Database Supabase Belum Memiliki Cabang"}
                        </h3>
                        <p className="text-xs text-slate-500 leading-relaxed">
                          {branchSearch
                            ? `Tidak ditemukan cabang klinik dengan kata kunci "${branchSearch}".`
                            : "Database Supabase production Anda masih bersih. Tambahkan cabang klinik Anda sekarang atau klik muat data cabang awal."}
                        </p>
                        {currentUser?.role === UserRole.SUPER_ADMIN && !branchSearch && (
                          <div className="flex flex-wrap justify-center gap-2.5 pt-2">
                            <button
                              type="button"
                              onClick={() => handleOpenBranchModal()}
                              className="px-4 py-2 text-xs font-bold text-white bg-gradient-to-r from-[#916b1c] to-[#c5a059] rounded-xl shadow-xs hover:opacity-95 transition-opacity cursor-pointer flex items-center gap-1.5"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              Tambah Cabang Baru
                            </button>
                            <button
                              type="button"
                              disabled={isSeedingBranches}
                              onClick={handleSeedDefaultBranches}
                              className="px-4 py-2 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                            >
                              <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                              {isSeedingBranches ? "Menyimpan ke Supabase..." : "Muat 5 Cabang Terbaru"}
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredBranches.map((b) => {
                    const code = b.branchCode || b.id.replace("branch-", "").substring(0, 3).toUpperCase();
                    const active = b.isActive ?? b.active ?? true;
                    return (
                      <tr key={b.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3.5 px-4 font-semibold text-slate-900">
                          <div className="flex items-center gap-3">
                            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-50 to-white border border-[#ebd4a8] flex items-center justify-center p-1 shadow-2xs shrink-0 overflow-hidden">
                              {b.logoUrl ? (
                                <img
                                  src={b.logoUrl}
                                  alt={b.name}
                                  className="max-h-full max-w-full object-contain"
                                  onError={(e) => {
                                    (e.target as HTMLElement).style.display = "none";
                                  }}
                                />
                              ) : (
                                <LalaLogo className="w-7 h-7" />
                              )}
                            </div>
                            <div>
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-[#17233C] text-[#e1b951] tracking-wider">
                                {code}
                              </span>
                              <div className="text-[10px] text-slate-400 mt-0.5 font-mono">
                                ID: {b.id}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="font-bold text-slate-900 text-xs">
                            {b.branchName || b.name}
                          </div>
                          <div className="text-[11px] text-[#8a6f27] font-medium mt-0.5">
                            {b.clinicName || "Lala Dentist"}
                          </div>
                        </td>

                        <td className="py-3.5 px-4 max-w-xs text-slate-600">
                          <div className="flex items-start gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                            <span>{b.address || "-"}</span>
                          </div>
                          {b.operationalHours && (
                            <div className="flex items-start gap-1.5 mt-1.5 text-[11px] text-[#8a6f27] font-medium bg-amber-50/60 px-2 py-0.5 rounded border border-amber-200/50">
                              <Clock className="w-3 h-3 text-[#916b1c] shrink-0 mt-0.5" />
                              <span>{b.operationalHours}</span>
                            </div>
                          )}
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5 text-slate-700">
                              <Phone className="w-3.5 h-3.5 text-slate-400" />
                              <span>{b.phone || "-"}</span>
                            </div>
                            {b.whatsapp && b.whatsapp !== b.phone && (
                              <div className="text-[11px] text-emerald-700 font-medium">
                                WA: {b.whatsapp}
                              </div>
                            )}
                            {b.email && (
                              <div className="text-[10px] text-slate-400 flex items-center gap-1">
                                <Mail className="w-3 h-3" />
                                <span>{b.email}</span>
                              </div>
                            )}
                          </div>
                        </td>

                        <td className="py-3.5 px-4 text-center">
                          {active ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              AKTIF
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                              NON-AKTIF
                            </span>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-center">
                          <button
                            onClick={() => handleOpenBranchModal(b)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-[#17233C] hover:text-white text-slate-700 rounded-lg text-xs font-semibold transition-all cursor-pointer"
                            title={currentUser?.role === UserRole.SUPER_ADMIN ? "Edit Cabang" : "Lihat Profil"}
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            <span>{currentUser?.role === UserRole.SUPER_ADMIN ? "Edit Cabang" : "Lihat Profil"}</span>
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
      )}

      {/* ========================================================================= */}
      {/* TAB 2: MASTER DOKTER & FOTO MEDIA                                        */}
      {/* ========================================================================= */}
      {activeTab === "DOCTORS" && (
        <div className="space-y-4">
          <div className="p-3 bg-gradient-to-r from-amber-50/80 via-white to-amber-50/50 border border-[#ebd4a8] rounded-xl text-xs text-slate-700 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Award className="w-4 h-4 text-[#916b1c] shrink-0" />
              <span>
                <strong>Single Global Master:</strong> Foto dokter dan identitas profesional terpusat berlaku di seluruh cabang assignment & poster jadwal praktek.
              </span>
            </div>
            <span className="text-[11px] font-bold text-[#916b1c]">
              Total: {doctors.length} Dokter Terdaftar
            </span>
          </div>

          {/* Search & Stats Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={doctorSearch}
                onChange={(e) => setDoctorSearch(e.target.value)}
                placeholder="Cari nama dokter, spesialisasi, SIP, STR..."
                className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c5a059]"
              />
            </div>
          </div>

          {/* Doctors Grid Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredDoctors.map((doc) => {
              const photo = doc.photoUrl || doc.avatarUrl || doc.profileImage;
              const docName = doc.name || doc.fullName || "Dokter Gigi";
              const title = doc.title || doc.specialization || "Dokter Gigi Umum";

              // Find assigned branches for this doctor
              const assignedBranchIds = doctorAssignments
                .filter((a) => a.doctorId === doc.id && a.active !== false)
                .map((a) => a.branchId);

              const assignedBranchList = branches.filter((b) =>
                assignedBranchIds.includes(b.id) || b.id === doc.assignedBranchId
              );

              return (
                <div
                  key={doc.id}
                  className="bg-white rounded-xl border border-slate-200/80 shadow-xs hover:shadow-md transition-shadow p-5 flex flex-col justify-between"
                >
                  <div className="flex items-start gap-4">
                    {/* Doctor Avatar / Portrait */}
                    <div className="relative shrink-0">
                      <div className="w-16 h-16 rounded-full ring-2 ring-[#c5a059]/40 bg-gradient-to-br from-amber-50 to-white flex items-center justify-center overflow-hidden shadow-xs relative">
                        {photo ? (
                          <img
                            src={photo}
                            alt={docName}
                            className="w-full h-full object-cover object-center"
                            onError={(e) => {
                              const target = e.target as HTMLElement;
                              target.style.display = "none";
                              const fallback = target.nextElementSibling as HTMLElement;
                              if (fallback) fallback.style.display = "flex";
                            }}
                          />
                        ) : null}
                        <div
                          style={{ display: photo ? "none" : "flex" }}
                          className="w-full h-full bg-[#17233C] text-[#e1b951] font-bold text-lg items-center justify-center"
                        >
                          {docName
                            .replace(/^(drg\.|dr\.)\s*/i, "")
                            .trim()
                            .substring(0, 2)
                            .toUpperCase() || "DR"}
                        </div>
                      </div>
                      <div className="absolute -bottom-1 -right-1 bg-white p-0.5 rounded-full shadow-xs">
                        <span className="w-3.5 h-3.5 rounded-full bg-emerald-500 block border-2 border-white"></span>
                      </div>
                    </div>

                    {/* Doctor Info */}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-bold text-slate-900 truncate">
                        {docName}
                      </h3>
                      <p className="text-xs text-[#8a6f27] font-semibold truncate mt-0.5">
                        {title}
                      </p>
                      <div className="mt-2 space-y-0.5 text-[11px] text-slate-500">
                        {doc.str && <div>STR: <span className="font-mono text-slate-700">{doc.str}</span></div>}
                        {doc.sip && <div>SIP: <span className="font-mono text-slate-700">{doc.sip}</span></div>}
                      </div>
                    </div>
                  </div>

                  {/* Branch Assignments Badges */}
                  <div className="mt-4 pt-3 border-t border-slate-100">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">
                      Penempatan Praktek Cabang:
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {assignedBranchList.length > 0 ? (
                        assignedBranchList.map((ab) => (
                          <span
                            key={ab.id}
                            className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-[#8a6f27] border border-[#ebd4a8]"
                          >
                            {ab.branchCode || ab.name}
                          </span>
                        ))
                      ) : (
                        <span className="text-[10px] text-slate-400 italic">
                          Belum ada jadwal penempatan aktif
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Action Button */}
                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-[10px] text-slate-400 font-mono">
                      {doc.doctorCode || doc.id}
                    </span>
                    <div className="flex items-center gap-2">
                      {currentUser?.role === UserRole.SUPER_ADMIN && (
                        <button
                          type="button"
                          onClick={() => setDoctorToDelete(doc)}
                          title={`Hapus Dokter ${doc.name || doc.fullName}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-rose-600 hover:bg-rose-50 hover:text-rose-700 rounded-lg text-xs font-semibold border border-rose-200 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Hapus</span>
                        </button>
                      )}
                      <button
                        onClick={() => handleOpenDoctorModal(doc)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#17233C] hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                      >
                        <Camera className="w-3.5 h-3.5 text-[#e1b951]" />
                        <span>{currentUser?.role === UserRole.SUPER_ADMIN ? "Kelola Foto & Profil" : "Lihat Profil"}</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB: MEDIA PROMOSI & BANNER ANDROID (SUPER ADMIN)                         */}
      {/* ========================================================================= */}
      {activeTab === "PROMOTIONS" && currentUser?.role === UserRole.SUPER_ADMIN && (
        <div className="space-y-4" id="promotions-tab">
          <div className="p-3.5 bg-gradient-to-r from-amber-50 via-white to-amber-50/50 border border-[#ebd4a8] rounded-xl text-xs text-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-2xs">
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-4 h-4 text-[#916b1c] shrink-0" />
              <span>
                <strong>Master Data Promosi:</strong> Pengelolaan banner promosi terpusat yang tampil di halaman utama aplikasi Android Pasien Lala Dentist.
              </span>
            </div>
            <span className="text-[11px] font-bold text-[#916b1c] shrink-0">
              Total: {promotions.filter((p) => p.isActive).length} Aktif / {promotions.length} Promosi
            </span>
          </div>

          {/* Search Bar & Action */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={promoSearch}
                onChange={(e) => setPromoSearch(e.target.value)}
                placeholder="Cari judul promosi, cabang, deskripsi..."
                className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c5a059]"
              />
            </div>

            <button
              onClick={() => handleOpenPromoModal()}
              className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-[#916b1c] to-[#c5a059] hover:from-[#7c5b16] hover:to-[#b38f4a] text-white px-4 py-2 rounded-xl text-xs font-semibold shadow-xs transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Tambah Promosi
            </button>
          </div>

          {/* Promotion Grid */}
          {loading ? (
            <div className="bg-white rounded-xl border border-slate-200/80 p-12 text-center text-xs text-slate-400">
              Memuat data media promosi...
            </div>
          ) : filteredPromotions.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200/80 p-12 text-center text-xs text-slate-400">
              Belum ada media promosi yang terdaftar. Klik <strong>+ Tambah Promosi</strong> untuk mengunggah banner promosi pertama.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredPromotions.map((promo) => {
                const promoBranch = branches.find((b) => b.id === promo.branchId);
                const scopeLabel = promo.branchId
                  ? (promoBranch ? promoBranch.name : promo.branchId)
                  : "Semua Cabang";
                const isDeleting = deletingPromoId === promo.id;
                const isToggling = togglingPromoId === promo.id;

                return (
                  <div
                    key={promo.id}
                    className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden flex flex-col transition-all hover:shadow-md"
                  >
                    {/* Image Preview */}
                    <div className="relative w-full h-44 bg-slate-100 flex items-center justify-center overflow-hidden border-b border-slate-100">
                      {promo.imageUrl ? (
                        <img
                          src={promo.imageUrl}
                          alt={promo.title}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = "none";
                          }}
                        />
                      ) : (
                        <div className="flex flex-col items-center gap-1 text-slate-400">
                          <ImageIcon className="w-8 h-8" />
                          <span className="text-[10px]">Tidak ada gambar</span>
                        </div>
                      )}

                      {/* Status Badge */}
                      <div className="absolute top-3 right-3 flex items-center gap-1.5">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold shadow-xs ${
                            promo.isActive
                              ? "bg-emerald-500 text-white"
                              : "bg-slate-700 text-slate-200"
                          }`}
                        >
                          {promo.isActive ? "AKTIF" : "NONAKTIF"}
                        </span>
                      </div>

                      {/* Order Badge */}
                      <div className="absolute top-3 left-3">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[10px] font-extrabold bg-[#17233C]/85 text-[#e1b951] backdrop-blur-xs shadow-xs">
                          Urutan: #{promo.displayOrder}
                        </span>
                      </div>
                    </div>

                    {/* Content */}
                    <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                      <div className="space-y-1">
                        <h3 className="font-bold text-slate-900 text-sm line-clamp-1">
                          {promo.title}
                        </h3>
                        {promo.description && (
                          <p className="text-xs text-slate-500 line-clamp-2">
                            {promo.description}
                          </p>
                        )}
                      </div>

                      <div className="space-y-2 pt-2 border-t border-slate-100">
                        <div className="flex items-center justify-between text-[11px] text-slate-600">
                          <span className="font-medium text-slate-400">Target Scope:</span>
                          <span className="inline-flex items-center gap-1 font-semibold text-slate-800">
                            {promo.branchId ? (
                              <Building2 className="w-3.5 h-3.5 text-[#916b1c]" />
                            ) : (
                              <Globe className="w-3.5 h-3.5 text-blue-600" />
                            )}
                            {scopeLabel}
                          </span>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center justify-between gap-1.5 pt-2 border-t border-slate-100">
                          <button
                            onClick={() => handleOpenPromoModal(promo)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            <span>Edit</span>
                          </button>

                          <button
                            onClick={() => handleTogglePromoActive(promo)}
                            disabled={isToggling}
                            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 ${
                              promo.isActive
                                ? "bg-amber-50 hover:bg-amber-100 text-amber-800"
                                : "bg-emerald-50 hover:bg-emerald-100 text-emerald-800"
                            }`}
                          >
                            <Power className="w-3.5 h-3.5" />
                            <span>
                              {isToggling
                                ? "Memproses..."
                                : promo.isActive
                                ? "Nonaktifkan"
                                : "Aktifkan"}
                            </span>
                          </button>

                          <button
                            onClick={() => setPromoToDelete(promo)}
                            disabled={isDeleting}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Hapus</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: BRANDING & KOP SURAT FAKTUR / KWITANSI                            */}
      {/* ========================================================================= */}
      {activeTab === "BRANDING" && (
        <div className="space-y-6">
          {currentUser?.role !== UserRole.SUPER_ADMIN && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                Mode Pratinjau (Read-Only): Hanya <strong>Super Admin</strong> yang memiliki hak akses untuk mengubah identitas, logo, dan teks resmi dokumen.
              </span>
            </div>
          )}

          {brandingSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Pengaturan identitas klinik & dokumen berhasil diperbarui.</span>
            </div>
          )}

          {brandingError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{brandingError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Form Column */}
            <form onSubmit={handleSaveBranding} className="lg:col-span-7 bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
              <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">
                Informasi Utama Identitas Dokumen
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">
                    Nama Resmi Klinik *
                  </label>
                  <input
                    type="text"
                    value={branding.name}
                    disabled={currentUser?.role !== UserRole.SUPER_ADMIN}
                    onChange={(e) => setBranding({ ...branding, name: e.target.value })}
                    required
                    className="w-full text-xs border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">
                    Slogan / Sub-judul
                  </label>
                  <input
                    type="text"
                    value={branding.tagline || ""}
                    disabled={currentUser?.role !== UserRole.SUPER_ADMIN}
                    onChange={(e) => setBranding({ ...branding, tagline: e.target.value })}
                    placeholder="Contoh: Senyum Indah dimulai di Laladentist"
                    className="w-full text-xs border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">
                  Logo Resmi Klinik & Kop Dokumen
                </label>
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-xl bg-white border border-slate-200 flex items-center justify-center p-2 shadow-2xs overflow-hidden shrink-0">
                    {branding.logoUrl ? (
                      <img
                        src={branding.logoUrl}
                        alt="Logo Klinik"
                        className="max-h-full max-w-full object-contain"
                      />
                    ) : (
                      <LalaLogo className="w-10 h-10" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0 space-y-2">
                    <input
                      type="file"
                      ref={brandingFileInputRef}
                      onChange={handleBrandingFileUpload}
                      accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
                      className="hidden"
                    />

                    {currentUser?.role === UserRole.SUPER_ADMIN && (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={uploadingBrandingLogo}
                          onClick={() => brandingFileInputRef.current?.click()}
                          className="px-3 py-1.5 text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg border border-emerald-200 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                          {uploadingBrandingLogo ? "Mengunggah..." : "Upload Logo Asli"}
                        </button>

                        {branding.logoUrl && (
                          <button
                            type="button"
                            onClick={handleRemoveBrandingLogo}
                            className="px-2.5 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-lg border border-rose-200 transition-colors flex items-center gap-1 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Hapus
                          </button>
                        )}
                      </div>
                    )}

                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={branding.logoUrl || ""}
                        disabled={currentUser?.role !== UserRole.SUPER_ADMIN}
                        onChange={(e) => setBranding({ ...branding, logoUrl: e.target.value })}
                        placeholder="/logo.png atau URL eksternal https://..."
                        className="flex-1 text-xs border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-50"
                      />
                    </div>
                  </div>
                </div>
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Format didukung: PNG (transparan disarankan), JPG, SVG, WebP. Maksimal 5MB. Logo akan ditampilkan pada header admin, faktur, kwitansi, dan kop dokumen.
                </span>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">
                  Alamat Kantor Pusat / Klinik Utama *
                </label>
                <textarea
                  rows={2}
                  value={branding.address}
                  disabled={currentUser?.role !== UserRole.SUPER_ADMIN}
                  onChange={(e) => setBranding({ ...branding, address: e.target.value })}
                  required
                  className="w-full text-xs border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-50"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">
                    No. Telepon Resmi *
                  </label>
                  <input
                    type="text"
                    value={branding.phone}
                    disabled={currentUser?.role !== UserRole.SUPER_ADMIN}
                    onChange={(e) => setBranding({ ...branding, phone: e.target.value })}
                    required
                    className="w-full text-xs border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">
                    No. WhatsApp Resmi (CS/Klinik) *
                  </label>
                  <input
                    type="text"
                    value={branding.whatsapp}
                    disabled={currentUser?.role !== UserRole.SUPER_ADMIN}
                    onChange={(e) => setBranding({ ...branding, whatsapp: e.target.value })}
                    required
                    className="w-full text-xs border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">
                    Email Kontak
                  </label>
                  <input
                    type="email"
                    value={branding.email || ""}
                    disabled={currentUser?.role !== UserRole.SUPER_ADMIN}
                    onChange={(e) => setBranding({ ...branding, email: e.target.value })}
                    className="w-full text-xs border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">
                    Website Resmi
                  </label>
                  <input
                    type="text"
                    value={branding.website || ""}
                    disabled={currentUser?.role !== UserRole.SUPER_ADMIN}
                    onChange={(e) => setBranding({ ...branding, website: e.target.value })}
                    className="w-full text-xs border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">
                  Catatan Kaki Dokumen (Footer Note)
                </label>
                <textarea
                  rows={2}
                  value={branding.footerNote || ""}
                  disabled={currentUser?.role !== UserRole.SUPER_ADMIN}
                  onChange={(e) => setBranding({ ...branding, footerNote: e.target.value })}
                  placeholder="Pesan ucapan terima kasih atau ketentuan pembayaran..."
                  className="w-full text-xs border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-50"
                />
              </div>

              {currentUser?.role === UserRole.SUPER_ADMIN && (
                <div className="pt-4 border-t border-slate-100 flex justify-end">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    <Save className="w-4 h-4" />
                    <span>{isSubmitting ? "Menyimpan..." : "Simpan Pengaturan Dokumen"}</span>
                  </button>
                </div>
              )}
            </form>

            {/* Live Preview Column */}
            <div className="lg:col-span-5 space-y-4">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-3">
                  Live Preview Kop Surat Faktur / Kwitansi
                </span>
                <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-xs">
                  <DocumentHeader
                    branding={branding}
                    branch={branches.find((b) => b.id === selectedBranchId) || null}
                    documentType="FAKTUR TAGIHAN"
                    documentNumber="INV/GEB/202609/0001"
                    documentDate="23 September 2026"
                  />
                  <div className="py-6 border-b border-dashed border-slate-200 text-center text-xs text-slate-400 italic">
                    [ Konten invoice & rincian tindakan medis pasien ]
                  </div>
                  <div className="text-[10px] text-slate-500 mt-3 italic">
                    {branding.footerNote}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: SERVICES                                                           */}
      {/* ========================================================================= */}
      {activeTab === "SERVICES" && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                <th className="py-3 px-4">Nama Layanan & Kategori</th>
                <th className="py-3 px-4">Deskripsi Tindakan</th>
                <th className="py-3 px-4 text-center">Estimasi Durasi</th>
                <th className="py-3 px-4 text-right">Tarif Dasar (Standard)</th>
                <th className="py-3 px-4 text-center">Status</th>
                {currentUser?.role === UserRole.SUPER_ADMIN && (
                  <th className="py-3 px-4 text-center">Aksi</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    Memuat katalog master layanan...
                  </td>
                </tr>
              ) : (
                services.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3.5 px-4 font-semibold text-slate-900">
                      <div>{s.name}</div>
                      <span className="inline-block mt-0.5 px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] rounded font-medium">
                        {s.category}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-500 max-w-xs truncate">
                      {s.description || "-"}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span className="inline-flex items-center gap-1 text-slate-600 font-medium">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        {s.estimatedDurationMinutes} Menit
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-bold text-slate-900">
                      Rp {s.basePrice.toLocaleString("id-ID")}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Aktif
                      </span>
                    </td>
                    {currentUser?.role === UserRole.SUPER_ADMIN && (
                      <td className="py-3.5 px-4 text-center">
                        <button
                          onClick={() => {
                            setFormServiceId(s.id);
                            setFormName(s.name);
                            setFormDesc(s.description);
                            setFormPrice(s.basePrice);
                            setFormDuration(s.estimatedDurationMinutes);
                            setFormCategory(s.category);
                            setErrorMsg("");
                            setShowServiceModal(true);
                          }}
                          className="p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-slate-100 rounded cursor-pointer"
                          title="Edit Layanan"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: BRANCH TARIFF OVERRIDES                                            */}
      {/* ========================================================================= */}
      {activeTab === "TARIFFS" && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-emerald-600" />
              <span className="text-xs font-bold text-slate-800">Pilih Lokasi Cabang:</span>
              <select
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 bg-slate-50 font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.address})
                  </option>
                ))}
              </select>
            </div>

            {currentUser?.role === UserRole.SUPER_ADMIN && (
              <button
                onClick={() => {
                  setTariffServiceId(services[0]?.id || "");
                  setTariffCustomPrice(services[0]?.basePrice || 200000);
                  setErrorMsg("");
                  setShowTariffModal(true);
                }}
                className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Atur Tarif Khusus Cabang Ini
              </button>
            )}
          </div>

          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                  <th className="py-3 px-4">Nama Layanan</th>
                  <th className="py-3 px-4 text-right">Tarif Dasar Pusat</th>
                  <th className="py-3 px-4 text-right">Tarif Berlaku di Cabang Ini</th>
                  <th className="py-3 px-4 text-center">Status Tarif</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                {services.map((s) => {
                  const custom = getBranchTariffForService(s.id);
                  return (
                    <tr key={s.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-4 font-semibold text-slate-900">{s.name}</td>
                      <td className="py-3.5 px-4 text-right font-medium text-slate-500">
                        Rp {s.basePrice.toLocaleString("id-ID")}
                      </td>
                      <td className="py-3.5 px-4 text-right font-bold text-slate-900">
                        {custom ? (
                          <span className="text-emerald-700">
                            Rp {custom.customPrice.toLocaleString("id-ID")}
                          </span>
                        ) : (
                          <span className="text-slate-600">
                            Rp {s.basePrice.toLocaleString("id-ID")}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        {custom ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                            <Sparkles className="w-3 h-3" />
                            Tarif Khusus Cabang
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600">
                            Tarif Standar Pusat
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 7: BACKUP & DISASTER RECOVERY (SUPER ADMIN ONLY)                      */}
      {/* ========================================================================= */}
      {activeTab === "BACKUP" && currentUser?.role === UserRole.SUPER_ADMIN && (
        <BackupManagement />
      )}

      {/* ========================================================================= */}
      {/* MODAL: BRANCH FORM (CREATE & EDIT)                                       */}
      {/* ========================================================================= */}
      {showBranchModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 max-w-xl w-full p-6 my-8">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-50 to-amber-100 border border-[#ebd4a8] flex items-center justify-center text-[#916b1c]">
                  <Building2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {editingBranch ? `Edit Identitas Cabang ${editingBranch.name}` : "Tambah Master Cabang Klinik"}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Source of Truth identitas cabang untuk Web Admin & Android
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowBranchModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveBranch} className="space-y-4 mt-4">
              {errorMsg && (
                <div className="p-3 bg-rose-50 text-rose-700 rounded-xl text-xs flex items-center gap-2 border border-rose-100">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {currentUser?.role === UserRole.BRANCH_ADMIN && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-center gap-2.5">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    Anda sedang melihat profil cabang dalam mode <strong>Baca Saja</strong>. Perubahan profil resmi dikelola oleh Super Admin.
                  </span>
                </div>
              )}

              {/* Logo / Image upload block */}
              <div className="p-4 bg-slate-50/70 rounded-xl border border-slate-200/80 space-y-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-2">
                    Logo Resmi Cabang
                  </label>
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-xl bg-white border border-slate-200 flex items-center justify-center p-2 shadow-2xs overflow-hidden shrink-0">
                      {branchFormLogoUrl ? (
                        <img
                          src={branchFormLogoUrl}
                          alt="Logo Cabang"
                          className="max-h-full max-w-full object-contain"
                        />
                      ) : (
                        <LalaLogo className="w-10 h-10" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0 space-y-2">
                      <input
                        type="file"
                        ref={branchFileInputRef}
                        onChange={handleBranchFileUpload}
                        accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
                        className="hidden"
                      />

                      {(currentUser?.role === UserRole.SUPER_ADMIN || (currentUser?.role === UserRole.BRANCH_ADMIN && editingBranch?.id === currentUser?.assignedBranchId)) && (
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={uploadingMedia}
                            onClick={() => branchFileInputRef.current?.click()}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#17233C] hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shadow-2xs transition-colors disabled:opacity-50 cursor-pointer"
                          >
                            <Upload className="w-3.5 h-3.5 text-[#e1b951]" />
                            <span>{branchFormLogoUrl ? "Ganti Logo" : "Upload File Logo"}</span>
                          </button>

                          {branchFormLogoUrl && (
                            <button
                              type="button"
                              onClick={handleRemoveBranchLogo}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Hapus</span>
                            </button>
                          )}
                        </div>
                      )}

                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={branchFormLogoUrl || ""}
                          disabled={currentUser?.role !== UserRole.SUPER_ADMIN && !(currentUser?.role === UserRole.BRANCH_ADMIN && editingBranch?.id === currentUser?.assignedBranchId)}
                          onChange={(e) => setBranchFormLogoUrl(e.target.value)}
                          placeholder="/logo-lala.png atau URL eksternal https://..."
                          className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-100"
                        />
                      </div>

                      <span className="text-[10px] text-slate-400 block">
                        Format: PNG, JPG, WEBP, SVG (Maksimal 5MB) atau URL Gambar.
                      </span>
                    </div>
                  </div>
                </div>

                {/* Branch Building Photo */}
                <div className="pt-3 border-t border-slate-200">
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-2">
                    Foto Gedung / Bangunan Cabang
                  </label>
                  <div className="flex items-center gap-4">
                    <div className="w-20 h-16 rounded-xl bg-white border border-slate-200 flex items-center justify-center p-1 shadow-2xs overflow-hidden shrink-0">
                      {branchFormImageUrl ? (
                        <img
                          src={branchFormImageUrl}
                          alt="Foto Gedung Cabang"
                          className="w-full h-full object-cover rounded-lg"
                        />
                      ) : (
                        <Building2 className="w-8 h-8 text-slate-300" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0 space-y-2">
                      <input
                        type="file"
                        ref={branchImageFileInputRef}
                        onChange={handleBranchImageFileUpload}
                        accept="image/png,image/jpeg,image/jpg,image/webp"
                        className="hidden"
                      />

                      {(currentUser?.role === UserRole.SUPER_ADMIN || (currentUser?.role === UserRole.BRANCH_ADMIN && editingBranch?.id === currentUser?.assignedBranchId)) && (
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={uploadingMedia}
                            onClick={() => branchImageFileInputRef.current?.click()}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#17233C] hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shadow-2xs transition-colors disabled:opacity-50 cursor-pointer"
                          >
                            <Camera className="w-3.5 h-3.5 text-[#e1b951]" />
                            <span>{branchFormImageUrl ? "Ganti Foto Gedung" : "Upload Foto Gedung"}</span>
                          </button>

                          {branchFormImageUrl && (
                            <button
                              type="button"
                              onClick={handleRemoveBranchImage}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Hapus</span>
                            </button>
                          )}
                        </div>
                      )}

                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={branchFormImageUrl || ""}
                          disabled={currentUser?.role !== UserRole.SUPER_ADMIN && !(currentUser?.role === UserRole.BRANCH_ADMIN && editingBranch?.id === currentUser?.assignedBranchId)}
                          onChange={(e) => setBranchFormImageUrl(e.target.value)}
                          placeholder="URL Foto Gedung https://..."
                          className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-100"
                        />
                      </div>

                      <span className="text-[10px] text-slate-400 block">
                        Format foto: landscape JPG/PNG (Maksimal 5MB) atau URL Foto.
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">
                    Kode Cabang * {editingBranch && <span className="text-[10px] text-amber-600 font-normal">(Read-only)</span>}
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: GEB, AMB, KMP"
                    value={branchFormCode}
                    disabled={!!editingBranch || currentUser?.role !== UserRole.SUPER_ADMIN}
                    onChange={(e) => setBranchFormCode(e.target.value.toUpperCase())}
                    required
                    maxLength={10}
                    className="w-full text-xs font-mono font-bold uppercase border border-slate-200 rounded-lg p-2.5 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#c5a059] disabled:opacity-75"
                  />
                  {editingBranch && (
                    <span className="text-[10px] text-slate-400 mt-0.5 block">
                      Kode cabang permanen untuk integritas riwayat transaksi.
                    </span>
                  )}
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">
                    Nama Resmi Klinik
                  </label>
                  <input
                    type="text"
                    value={branchFormClinicName}
                    disabled={currentUser?.role !== UserRole.SUPER_ADMIN}
                    onChange={(e) => setBranchFormClinicName(e.target.value)}
                    required
                    className="w-full text-xs border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-[#c5a059] disabled:bg-slate-50 font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">
                  Nama Cabang *
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Lala Dentist Gebang"
                  value={branchFormName}
                  disabled={currentUser?.role !== UserRole.SUPER_ADMIN}
                  onChange={(e) => setBranchFormName(e.target.value)}
                  required
                  className="w-full text-xs border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-[#c5a059] disabled:bg-slate-50 font-bold text-slate-900"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">
                  Alamat Lengkap Cabang *
                </label>
                <textarea
                  rows={2}
                  value={branchFormAddress}
                  disabled={currentUser?.role !== UserRole.SUPER_ADMIN}
                  onChange={(e) => setBranchFormAddress(e.target.value)}
                  required
                  placeholder="Jl. Gebang Raya No. 42, Jember..."
                  className="w-full text-xs border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-[#c5a059] disabled:bg-slate-50"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">
                    Nomor Telepon Cabang *
                  </label>
                  <input
                    type="text"
                    value={branchFormPhone}
                    disabled={currentUser?.role !== UserRole.SUPER_ADMIN}
                    onChange={(e) => setBranchFormPhone(e.target.value)}
                    required
                    placeholder="081234567801"
                    className="w-full text-xs border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-[#c5a059] disabled:bg-slate-50 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">
                    Nomor WhatsApp Cabang
                  </label>
                  <input
                    type="text"
                    value={branchFormWhatsapp}
                    disabled={currentUser?.role !== UserRole.SUPER_ADMIN}
                    onChange={(e) => setBranchFormWhatsapp(e.target.value)}
                    placeholder="081234567801"
                    className="w-full text-xs border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-[#c5a059] disabled:bg-slate-50 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">
                  Jam Operasional Cabang
                </label>
                <input
                  type="text"
                  value={branchFormOperationalHours}
                  disabled={currentUser?.role !== UserRole.SUPER_ADMIN}
                  onChange={(e) => setBranchFormOperationalHours(e.target.value)}
                  placeholder="Contoh: Senin-Sabtu: 08.00-21.00, Minggu: 08.00-17.00"
                  className="w-full text-xs border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-[#c5a059] disabled:bg-slate-50"
                />
                <span className="text-[10px] text-slate-400 mt-0.5 block">
                  Jadwal operasional yang ditampilkan kepada pasien di aplikasi dan profil cabang.
                </span>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">
                  Email Cabang
                </label>
                <input
                  type="email"
                  value={branchFormEmail}
                  disabled={currentUser?.role !== UserRole.SUPER_ADMIN}
                  onChange={(e) => setBranchFormEmail(e.target.value)}
                  placeholder="gebang@laladentist.com"
                  className="w-full text-xs border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-[#c5a059] disabled:bg-slate-50"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="branchActiveToggle"
                  checked={branchFormActive}
                  disabled={currentUser?.role !== UserRole.SUPER_ADMIN}
                  onChange={(e) => setBranchFormActive(e.target.checked)}
                  className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 disabled:opacity-75"
                />
                <label htmlFor="branchActiveToggle" className="text-xs font-semibold text-slate-800">
                  Status Cabang Aktif (Dapat menerima booking & transaksi)
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowBranchModal(false)}
                  className="px-4 py-2.5 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  {currentUser?.role === UserRole.SUPER_ADMIN ? "Batal" : "Tutup"}
                </button>
                {currentUser?.role === UserRole.SUPER_ADMIN && (
                  <button
                    type="submit"
                    disabled={isSubmitting || uploadingMedia}
                    className="px-5 py-2.5 bg-gradient-to-r from-[#916b1c] to-[#c5a059] hover:from-[#7c5b16] hover:to-[#b38f4a] text-white rounded-xl text-xs font-semibold shadow-xs disabled:opacity-50 cursor-pointer"
                  >
                    {isSubmitting ? "Menyimpan..." : "Simpan Identitas Cabang"}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: DOCTOR & PHOTO FORM                                               */}
      {/* ========================================================================= */}
      {showDoctorModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 max-w-xl w-full p-6 my-8">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-50 to-amber-100 border border-[#ebd4a8] flex items-center justify-center text-[#916b1c]">
                  <UserCheck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {editingDoctor ? `Kelola Foto & Profil ${editingDoctor.name}` : "Tambah Master Dokter Gigi"}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Source of Truth foto dokter untuk Web Admin, Android & Poster Jadwal
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowDoctorModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveDoctor} className="space-y-4 mt-4">
              {errorMsg && (
                <div className="p-3 bg-rose-50 text-rose-700 rounded-xl text-xs flex items-center gap-2 border border-rose-100">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Photo Upload Card Section */}
              <div className="p-4 bg-gradient-to-br from-amber-50/50 via-slate-50 to-white rounded-xl border border-[#ebd4a8]/80">
                <span className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-3">
                  Foto Resmi Dokter (Portrait)
                </span>
                <div className="flex items-center gap-5">
                  <div className="w-24 h-24 rounded-2xl ring-2 ring-[#c5a059]/40 bg-white flex items-center justify-center overflow-hidden shadow-sm shrink-0">
                    {doctorFormPhotoUrl ? (
                      <img
                        src={doctorFormPhotoUrl}
                        alt="Foto Dokter"
                        className="w-full h-full object-cover object-center"
                      />
                    ) : (
                      <div className="w-full h-full bg-[#17233C] text-[#e1b951] font-bold text-xl flex items-center justify-center">
                        {doctorFormName ? doctorFormName.replace("drg.", "").trim().substring(0, 2).toUpperCase() : "DR"}
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0 space-y-2">
                    <input
                      type="file"
                      ref={doctorFileInputRef}
                      onChange={handleDoctorFileUpload}
                      accept="image/png,image/jpeg,image/jpg,image/webp"
                      className="hidden"
                    />

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={currentUser?.role !== UserRole.SUPER_ADMIN || uploadingMedia}
                        onClick={() => doctorFileInputRef.current?.click()}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#17233C] hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shadow-2xs transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        <Camera className="w-3.5 h-3.5 text-[#e1b951]" />
                        <span>{doctorFormPhotoUrl ? "Ganti Foto" : "Upload Foto"}</span>
                      </button>

                      {doctorFormPhotoUrl && currentUser?.role === UserRole.SUPER_ADMIN && (
                        <button
                          type="button"
                          onClick={handleRemoveDoctorPhoto}
                          className="inline-flex items-center gap-1.5 px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Hapus Foto</span>
                        </button>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-500 block">
                      Foto rasio 1:1 atau potret formal. Otomatis terhubung ke seluruh cabang & poster jadwal.
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">
                    Nama Dokter *
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: drg. Syafira"
                    value={doctorFormName}
                    disabled={currentUser?.role !== UserRole.SUPER_ADMIN}
                    onChange={(e) => setDoctorFormName(e.target.value)}
                    required
                    className="w-full text-xs font-bold text-slate-900 border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-[#c5a059] disabled:bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">
                    Gelar / Title Profesional
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: Dokter Gigi Umum / Spesialis Ortodonti"
                    value={doctorFormTitle}
                    disabled={currentUser?.role !== UserRole.SUPER_ADMIN}
                    onChange={(e) => setDoctorFormTitle(e.target.value)}
                    className="w-full text-xs border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-[#c5a059] disabled:bg-slate-50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">
                    Spesialisasi
                  </label>
                  <select
                    value={doctorFormSpecialization}
                    disabled={currentUser?.role !== UserRole.SUPER_ADMIN}
                    onChange={(e) => setDoctorFormSpecialization(e.target.value)}
                    className="w-full text-xs border border-slate-200 rounded-lg p-2.5 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#c5a059] disabled:bg-slate-50"
                  >
                    <option value="Dokter Gigi Umum">Dokter Gigi Umum</option>
                    <option value="Spesialis Orthodonti">Spesialis Orthodonti (Sp.Ort)</option>
                    <option value="Spesialis Kedokteran Gigi Anak">Spesialis Kedokteran Gigi Anak (Sp.KGA)</option>
                    <option value="Spesialis Konservasi Gigi">Spesialis Konservasi Gigi (Sp.KG)</option>
                    <option value="Spesialis Periodonsia">Spesialis Periodonsia (Sp.Perio)</option>
                    <option value="Spesialis Bedah Mulut">Spesialis Bedah Mulut (Sp.BM)</option>
                    <option value="Spesialis Prostodonsia">Spesialis Prostodonsia (Sp.Pros)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">
                    Nomor WhatsApp / HP
                  </label>
                  <input
                    type="text"
                    value={doctorFormPhone}
                    disabled={currentUser?.role !== UserRole.SUPER_ADMIN}
                    onChange={(e) => setDoctorFormPhone(e.target.value)}
                    placeholder="081234567811"
                    className="w-full text-xs border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-[#c5a059] disabled:bg-slate-50 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">
                    Nomor STR
                  </label>
                  <input
                    type="text"
                    value={doctorFormStr}
                    disabled={currentUser?.role !== UserRole.SUPER_ADMIN}
                    onChange={(e) => setDoctorFormStr(e.target.value)}
                    placeholder="STR-SYAF-2024"
                    className="w-full text-xs border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-[#c5a059] disabled:bg-slate-50 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">
                    Nomor SIP
                  </label>
                  <input
                    type="text"
                    value={doctorFormSip}
                    disabled={currentUser?.role !== UserRole.SUPER_ADMIN}
                    onChange={(e) => setDoctorFormSip(e.target.value)}
                    placeholder="SIP-SYAF-2024"
                    className="w-full text-xs border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-[#c5a059] disabled:bg-slate-50 font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="doctorActiveToggle"
                  checked={doctorFormActive}
                  disabled={currentUser?.role !== UserRole.SUPER_ADMIN}
                  onChange={(e) => setDoctorFormActive(e.target.checked)}
                  className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                />
                <label htmlFor="doctorActiveToggle" className="text-xs font-semibold text-slate-800">
                  Status Dokter Aktif (Dapat dijadwalkan dalam shift)
                </label>
              </div>

              <div className="flex items-center justify-between gap-2 pt-4 border-t border-slate-100">
                {currentUser?.role === UserRole.SUPER_ADMIN && editingDoctor ? (
                  <button
                    type="button"
                    onClick={() => {
                      setDoctorToDelete(editingDoctor);
                    }}
                    className="px-3.5 py-2 text-rose-600 hover:bg-rose-50 rounded-xl text-xs font-semibold border border-rose-200 flex items-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Hapus Dokter</span>
                  </button>
                ) : <div />}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowDoctorModal(false)}
                    className="px-4 py-2.5 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                  >
                    {currentUser?.role === UserRole.SUPER_ADMIN ? "Batal" : "Tutup"}
                  </button>
                  {currentUser?.role === UserRole.SUPER_ADMIN && (
                    <button
                      type="submit"
                      disabled={isSubmitting || uploadingMedia}
                      className="px-5 py-2.5 bg-gradient-to-r from-[#916b1c] to-[#c5a059] hover:from-[#7c5b16] hover:to-[#b38f4a] text-white rounded-xl text-xs font-semibold shadow-xs disabled:opacity-50 cursor-pointer"
                    >
                      {isSubmitting ? "Menyimpan..." : "Simpan Master Dokter"}
                    </button>
                  )}
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: SERVICE FORM */}
      {showServiceModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-100 max-w-md w-full p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Settings className="w-5 h-5 text-emerald-600" />
                {formServiceId ? "Edit Layanan Medis" : "Tambah Master Layanan Medis"}
              </h3>
              <button
                onClick={() => setShowServiceModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveService} className="space-y-4 mt-4">
              {errorMsg && (
                <div className="p-3 bg-rose-50 text-rose-700 rounded-lg text-xs flex items-center gap-2 border border-rose-100">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">
                  Nama Tindakan / Layanan
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Scaling & Polishing Gigi"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  required
                  className="w-full text-xs border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">
                  Kategori Pelayanan
                </label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  className="w-full text-xs border border-slate-200 rounded-lg p-2 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="Pencegahan & Estetika">Pencegahan & Estetika</option>
                  <option value="Restorative / Tambal">Restorative / Tambal</option>
                  <option value="Endodontic / PSA">Endodontic / PSA</option>
                  <option value="Bedah Mulut & Ekstraksi">Bedah Mulut & Ekstraksi</option>
                  <option value="Ortodonti / Kawat Gigi">Ortodonti / Kawat Gigi</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">
                    Tarif Dasar (Rp)
                  </label>
                  <input
                    type="number"
                    min="1000"
                    value={formPrice}
                    onChange={(e) => setFormPrice(parseInt(e.target.value) || 0)}
                    required
                    className="w-full text-xs font-bold border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">
                    Durasi (Menit)
                  </label>
                  <input
                    type="number"
                    min="5"
                    step="5"
                    value={formDuration}
                    onChange={(e) => setFormDuration(parseInt(e.target.value) || 30)}
                    required
                    className="w-full text-xs font-bold border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">
                  Deskripsi / Keterangan Prosedur
                </label>
                <textarea
                  rows={2}
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  className="w-full text-xs border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowServiceModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? "Menyimpan..." : "Simpan Layanan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: TARIFF FORM */}
      {showTariffModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-100 max-w-md w-full p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-emerald-600" />
                Atur Tarif Khusus Cabang
              </h3>
              <button
                onClick={() => setShowTariffModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveTariff} className="space-y-4 mt-4">
              {errorMsg && (
                <div className="p-3 bg-rose-50 text-rose-700 rounded-lg text-xs flex items-center gap-2 border border-rose-100">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">
                  Pilih Layanan Medis
                </label>
                <select
                  value={tariffServiceId}
                  onChange={(e) => {
                    setTariffServiceId(e.target.value);
                    const s = services.find((srv) => srv.id === e.target.value);
                    if (s) setTariffCustomPrice(s.basePrice);
                  }}
                  className="w-full text-xs border border-slate-200 rounded-lg p-2 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} (Dasar: Rp {s.basePrice.toLocaleString("id-ID")})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">
                  Tarif Khusus untuk Cabang Ini (Rp)
                </label>
                <input
                  type="number"
                  min="1000"
                  value={tariffCustomPrice}
                  onChange={(e) => setTariffCustomPrice(parseInt(e.target.value) || 0)}
                  required
                  className="w-full text-sm font-bold border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowTariffModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? "Menyimpan..." : "Terapkan Tarif"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: PROMOTION MEDIA FORM (CREATE & EDIT)                               */}
      {/* ========================================================================= */}
      {showPromoModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 max-w-lg w-full p-6 my-8">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-50 to-amber-100 border border-[#ebd4a8] flex items-center justify-center text-[#916b1c]">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {editingPromo ? "Edit Banner Promosi" : "Tambah Banner Promosi Baru"}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Media promosi yang tampil di beranda aplikasi Android Pasien
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowPromoModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSavePromo} className="space-y-4 mt-4">
              {errorMsg && (
                <div className="p-3 bg-rose-50 text-rose-700 rounded-xl text-xs flex items-center gap-2 border border-rose-100">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Promo Banner Image upload block */}
              <div className="p-4 bg-slate-50/70 rounded-xl border border-slate-200/80 space-y-3">
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                  Gambar Banner Promosi *
                </label>

                {/* Banner Preview */}
                <div className="relative w-full h-44 rounded-xl bg-white border-2 border-dashed border-slate-300 flex items-center justify-center overflow-hidden">
                  {promoFormImageUrl ? (
                    <img
                      src={promoFormImageUrl}
                      alt="Preview Banner Promosi"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-1.5 text-slate-400 p-4 text-center">
                      <ImageIcon className="w-8 h-8 text-slate-300" />
                      <span className="text-xs font-medium text-slate-600">Belum ada gambar promosi</span>
                      <span className="text-[10px] text-slate-400">Rekomendasi rasio: 16:9 atau landscape (PNG/JPG max 5MB)</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    ref={promoFileInputRef}
                    onChange={handlePromoFileUpload}
                    accept="image/png,image/jpeg,image/jpg,image/webp"
                    className="hidden"
                  />

                  <button
                    type="button"
                    disabled={uploadingPromoMedia}
                    onClick={() => promoFileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#17233C] hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shadow-2xs transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5 text-[#e1b951]" />
                    <span>{promoFormImageUrl ? "Ganti Gambar Banner" : "Upload Gambar Banner"}</span>
                  </button>

                  {promoFormImageUrl && (
                    <button
                      type="button"
                      onClick={handleRemovePromoImage}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Hapus</span>
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">
                  Judul Promosi *
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Promo Scaling Gigi Bulan September"
                  value={promoFormTitle}
                  onChange={(e) => setPromoFormTitle(e.target.value)}
                  required
                  className="w-full text-xs font-bold border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-[#c5a059]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">
                  Deskripsi / Keterangan Promosi
                </label>
                <textarea
                  rows={2}
                  placeholder="Contoh: Dapatkan diskon 20% pembersihan karang gigi untuk pasien umum dan reservasi online."
                  value={promoFormDescription}
                  onChange={(e) => setPromoFormDescription(e.target.value)}
                  className="w-full text-xs border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-[#c5a059]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">
                    Target Cabang (Scope)
                  </label>
                  <select
                    value={promoFormBranchId || ""}
                    onChange={(e) => setPromoFormBranchId(e.target.value || null)}
                    className="w-full text-xs border border-slate-200 rounded-lg p-2.5 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#c5a059]"
                  >
                    <option value="">Semua Cabang (Global)</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        Cabang {b.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">
                    Urutan Tampil (Display Order)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={promoFormDisplayOrder}
                    onChange={(e) => setPromoFormDisplayOrder(parseInt(e.target.value) || 1)}
                    required
                    className="w-full text-xs font-bold border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-[#c5a059]"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="promoActiveToggle"
                  checked={promoFormIsActive}
                  onChange={(e) => setPromoFormIsActive(e.target.checked)}
                  className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                />
                <label htmlFor="promoActiveToggle" className="text-xs font-semibold text-slate-800">
                  Status Promosi Aktif (Ditampilkan di aplikasi Android)
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowPromoModal(false)}
                  className="px-4 py-2.5 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingPromo || uploadingPromoMedia}
                  className="px-5 py-2.5 bg-gradient-to-r from-[#916b1c] to-[#c5a059] hover:from-[#7c5b16] hover:to-[#b38f4a] text-white rounded-xl text-xs font-semibold shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {isSubmittingPromo ? "Menyimpan..." : "Simpan Promosi"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* MODAL: DELETE DOCTOR CONFIRMATION */}
      {doctorToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900 text-center">
              Konfirmasi Hapus Master Dokter
            </h3>
            <p className="text-xs text-slate-600 text-center mt-2 leading-relaxed">
              Apakah Anda yakin ingin menghapus data dokter <strong>{doctorToDelete.name || doctorToDelete.fullName}</strong>? Seluruh penugasan cabang dan jadwal praktek terkait dokter ini akan dihapus dari sistem. Tindakan ini tidak dapat dibatalkan.
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

      {/* Modal Konfirmasi Hapus Promosi */}
      {promoToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900 text-center">
              Konfirmasi Hapus Promosi
            </h3>
            <p className="text-xs text-slate-600 text-center mt-2 leading-relaxed">
              Apakah Anda yakin ingin menghapus promosi <strong>"{promoToDelete.title}"</strong>? Media dan poster promosi ini akan dihapus dari aplikasi.
            </p>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={deletingPromoId === promoToDelete.id}
                onClick={() => setPromoToDelete(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={deletingPromoId === promoToDelete.id}
                onClick={handleConfirmDeletePromo}
                className="px-4 py-2 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {deletingPromoId === promoToDelete.id ? "Menghapus..." : "Ya, Hapus Promosi"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
