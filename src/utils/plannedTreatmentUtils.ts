import { MasterService, PlannedTreatment } from "../types/domain";

export function snapshotPlannedTreatments(services: MasterService[]): PlannedTreatment[] {
  return services.map((service) => ({
    serviceId: service.id,
    serviceNameSnapshot: service.name,
    estimatedDurationMinutes: service.estimatedDurationMinutes
  }));
}

export function getPlannedTreatmentDurationMinutes(
  treatments?: PlannedTreatment[] | null,
  fallbackMinutes = 30
): number {
  const total = (treatments || []).reduce(
    (sum, treatment) => sum + Math.max(0, Number(treatment.estimatedDurationMinutes) || 0),
    0
  );
  return total > 0 ? total : fallbackMinutes;
}

export function getPlannedTreatmentSummary(
  treatments?: PlannedTreatment[] | null,
  fallback = "Konsultasi"
): string {
  const names = (treatments || [])
    .map((treatment) => treatment.serviceNameSnapshot.trim())
    .filter(Boolean);
  return names.length > 0 ? names.join(", ") : fallback.trim() || "Konsultasi";
}