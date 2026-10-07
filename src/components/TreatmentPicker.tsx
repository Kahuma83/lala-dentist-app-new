import React, { useState, useMemo, useEffect } from "react";
import { MasterService, BranchServiceTariff, ServiceCategory } from "../types/domain";
import { useApp } from "../context/AppContext";
import {
  Search,
  Check,
  Tag,
  Clock,
  Sparkles,
  Stethoscope,
  Filter,
  CheckCircle2,
  AlertCircle
} from "lucide-react";

export interface TreatmentPickerProps {
  selectedServiceId?: string;
  onSelectService?: (service: MasterService, effectivePrice: number) => void;
  branchId?: string | null;
  multiSelect?: boolean;
  selectedServiceIds?: string[];
  onSelectServices?: (services: MasterService[]) => void;
  readOnly?: boolean;
}

export const CATEGORY_LABELS: Record<string, string> = {
  ALL: "Semua",
  CONSULTATION: "Konsultasi",
  PREVENTIVE: "Preventif",
  RESTORATIVE: "Restorasi",
  SURGERY: "Bedah",
  AESTHETIC: "Estetik",
  ORTHODONTIC: "Orthodontic",
  TREATMENT: "Perawatan",
  PROSTHODONTIC: "Prostodontik",
  OTHER: "Lainnya"
};

export const CATEGORY_COLORS: Record<string, string> = {
  CONSULTATION: "bg-blue-50 text-blue-700 border-blue-200",
  PREVENTIVE: "bg-emerald-50 text-emerald-700 border-emerald-200",
  RESTORATIVE: "bg-amber-50 text-amber-700 border-amber-200",
  SURGERY: "bg-rose-50 text-rose-700 border-rose-200",
  AESTHETIC: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200",
  ORTHODONTIC: "bg-indigo-50 text-indigo-700 border-indigo-200",
  TREATMENT: "bg-teal-50 text-teal-700 border-teal-200",
  PROSTHODONTIC: "bg-purple-50 text-purple-700 border-purple-200",
  OTHER: "bg-slate-50 text-slate-700 border-slate-200"
};

export const TreatmentPicker: React.FC<TreatmentPickerProps> = ({
  selectedServiceId,
  onSelectService,
  branchId,
  multiSelect = false,
  selectedServiceIds = [],
  onSelectServices,
  readOnly = false
}) => {
  const { services, repos, selectedBranchId, currentUser } = useApp();

  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [branchTariffs, setBranchTariffs] = useState<BranchServiceTariff[]>([]);
  const [loadingTariffs, setLoadingTariffs] = useState<boolean>(false);

  // Effective branch for tariff lookup (Branch Admin must use their assignedBranchId)
  const effectiveBranch = branchId || currentUser?.assignedBranchId || selectedBranchId || "branch-gebang";

  // Load branch tariffs for pricing lookup
  useEffect(() => {
    let isMounted = true;
    const loadTariffs = async () => {
      if (!effectiveBranch) return;
      setLoadingTariffs(true);
      try {
        const tariffs = await repos.config.getBranchTariffs(effectiveBranch);
        if (isMounted) setBranchTariffs(tariffs);
      } catch (err) {
        console.warn("Gagal memuat tarif cabang:", err);
      } finally {
        if (isMounted) setLoadingTariffs(false);
      }
    };
    loadTariffs();
    return () => {
      isMounted = false;
    };
  }, [effectiveBranch, repos.config]);

  // Helper to get effective price for a service at this branch
  const getTariffInfo = (service: MasterService): { price: number; isCustom: boolean } => {
    const tariff = branchTariffs.find((t) => t.serviceId === service.id && t.isActive !== false);
    if (tariff && typeof tariff.customPrice === "number") {
      return { price: tariff.customPrice, isCustom: true };
    }
    return { price: service.basePrice, isCustom: false };
  };

  // Filter only active services and sort by displayOrder
  const filteredServices = useMemo(() => {
    return services
      .filter((s) => s.isActive !== false) // Only active
      .filter((s) => {
        // Category filter
        if (selectedCategory !== "ALL") {
          const cat = (s.category || "").toUpperCase();
          if (cat !== selectedCategory.toUpperCase()) return false;
        }

        // Search filter: search by name, code, description
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const matchName = (s.name || "").toLowerCase().includes(q);
          const matchCode = (s.code || "").toLowerCase().includes(q);
          const matchDesc = (s.description || "").toLowerCase().includes(q);
          return matchName || matchCode || matchDesc;
        }

        return true;
      })
      .sort((a, b) => (a.displayOrder || 999) - (b.displayOrder || 999));
  }, [services, selectedCategory, searchQuery]);

  const categories = useMemo(() => {
    return [
      "ALL",
      "CONSULTATION",
      "PREVENTIVE",
      "RESTORATIVE",
      "SURGERY",
      "AESTHETIC",
      "ORTHODONTIC",
      "TREATMENT",
      "PROSTHODONTIC",
      "OTHER"
    ];
  }, []);

  const handleCardClick = (service: MasterService) => {
    if (readOnly) return;
    const tariffInfo = getTariffInfo(service);

    if (multiSelect) {
      if (!onSelectServices) return;
      const exists = selectedServiceIds.includes(service.id);
      let updated: MasterService[];
      if (exists) {
        updated = services.filter((s) => selectedServiceIds.includes(s.id) && s.id !== service.id);
      } else {
        const currentSelected = services.filter((s) => selectedServiceIds.includes(s.id));
        updated = [...currentSelected, service];
      }
      onSelectServices(updated);
    } else {
      if (onSelectService) {
        onSelectService(service, tariffInfo.price);
      }
    }
  };

  return (
    <div className="space-y-3.5 bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xs" id="treatment-picker-container">
      {/* Search Bar - Material 3 Style */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="[ Cari tindakan ] (Nama, kode, atau indikasi medis...)"
          className="w-full pl-10 pr-4 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all shadow-2xs"
          id="input-search-treatment"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 font-semibold"
          >
            ✕
          </button>
        )}
      </div>

      {/* Category Pills / Filter Horizontal Scroll */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 scrollbar-thin text-xs no-scrollbar" id="category-filter-chips">
        {categories.map((catKey) => {
          const isSelected = selectedCategory === catKey;
          const label = CATEGORY_LABELS[catKey] || catKey;
          return (
            <button
              key={catKey}
              type="button"
              onClick={() => setSelectedCategory(catKey)}
              className={`px-3 py-1.5 rounded-full text-[11px] font-semibold tracking-wide transition-all whitespace-nowrap cursor-pointer ${
                isSelected
                  ? "bg-slate-900 text-white shadow-xs scale-102"
                  : "bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200/60"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Service List Grid - Touch Friendly */}
      <div className="max-h-72 overflow-y-auto space-y-2 pr-1 scrollbar-thin">
        {filteredServices.length === 0 ? (
          <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
            <Stethoscope className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-xs font-semibold text-slate-600">Tidak ada jenis tindakan yang sesuai</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Coba ubah kata kunci pencarian atau pilih kategori lain</p>
          </div>
        ) : (
          filteredServices.map((service) => {
            const isSelected = multiSelect
              ? selectedServiceIds.includes(service.id)
              : selectedServiceId === service.id;
            const tariffInfo = getTariffInfo(service);
            const categoryBadgeColor = CATEGORY_COLORS[service.category?.toUpperCase()] || CATEGORY_COLORS.OTHER;
            const categoryLabel = CATEGORY_LABELS[service.category?.toUpperCase()] || service.category;

            return (
              <div
                key={service.id}
                onClick={() => handleCardClick(service)}
                className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start justify-between gap-3 ${
                  isSelected
                    ? "bg-emerald-50/70 border-emerald-500 ring-2 ring-emerald-500/20 shadow-xs"
                    : "bg-white hover:bg-slate-50/80 border-slate-200/80"
                }`}
              >
                <div className="space-y-1 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-900 text-xs tracking-tight truncate">
                      {service.name}
                    </span>
                    {service.code && (
                      <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded border border-slate-200">
                        {service.code}
                      </span>
                    )}
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${categoryBadgeColor}`}>
                      {categoryLabel}
                    </span>
                  </div>

                  {service.description && (
                    <p className="text-[11px] text-slate-500 line-clamp-1">
                      {service.description}
                    </p>
                  )}

                  <div className="flex items-center gap-3 text-[11px] text-slate-500 pt-0.5">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-400" />
                      {service.estimatedDurationMinutes} mnt
                    </span>
                    <span className="inline-flex items-center gap-1 font-bold text-slate-800">
                      <Tag className="w-3 h-3 text-slate-400" />
                      Rp {tariffInfo.price.toLocaleString("id-ID")}
                      {tariffInfo.isCustom ? (
                        <span className="ml-1 text-[9px] font-semibold px-1.5 py-0.2 bg-purple-100 text-purple-700 rounded-sm">
                          Tarif Cabang
                        </span>
                      ) : (
                        <span className="ml-1 text-[9px] font-semibold px-1.5 py-0.2 bg-slate-100 text-slate-600 rounded-sm">
                          Standar
                        </span>
                      )}
                    </span>
                  </div>
                </div>

                {!readOnly && (
                  <div className="pt-1 flex items-center justify-center">
                    <div
                      className={`w-5 h-5 rounded-md flex items-center justify-center border transition-all ${
                        isSelected
                          ? "bg-emerald-600 border-emerald-600 text-white shadow-2xs"
                          : "border-slate-300 bg-white"
                      }`}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
