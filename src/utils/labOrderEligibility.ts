import { MasterService } from "../types/domain";

export function isLabOrderCandidateService(
  service: Pick<MasterService, "name" | "category" | "clinicalCategory" | "requiresLab">
): boolean {
  if (service.requiresLab) return true;

  const categories = [service.category, service.clinicalCategory]
    .filter((category): category is string => Boolean(category))
    .map((category) => category.toUpperCase().replace(/[^A-Z0-9]/g, ""));

  return categories.some((category) => category.includes("PROSTHODONTIC") || category === "GIGIPALSU")
    || /\b(gigi\s*(palsu|tiruan)|denture)\b/i.test(service.name);
}
