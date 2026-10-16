import { PatientAcquisitionSource, PatientProfile, PatientVisitAnalyticsRecord, VisitStatus } from "../types/domain";

export interface PatientAcquisitionSourceMetric {
  source: PatientAcquisitionSource;
  label: string;
  patients: number;
  percent: number;
}

export interface PatientVisitMonthMetric {
  month: string;
  label: string;
  newPatients: number;
  existingPatients: number;
  uniquePatients: number;
  visits: number;
  existingPercent: number;
  newPercent: number;
}

export interface PatientVisitAnalytics {
  months: PatientVisitMonthMetric[];
  lastMonth: PatientVisitMonthMetric;
}

const getJakartaMonth = (value: string): string | null => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit"
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return year && month ? `${year}-${month}` : null;
};

const monthLabel = (key: string): string => {
  const [year, month] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("id-ID", { month: "short" }).format(new Date(year, month - 1, 1));
};

const acquisitionSourceLabels: Record<PatientAcquisitionSource, string> = {
  GOOGLE_MAPS: "Google / Google Maps",
  INSTAGRAM: "Instagram",
  FACEBOOK: "Facebook",
  WHATSAPP: "WhatsApp / kanal digital",
  REFERRAL: "Rujukan teman / keluarga",
  DIRECT: "Langsung datang",
  OTHER: "Lainnya",
  UNKNOWN: "Belum diketahui"
};

export const getNewPatientAcquisitionSources = (
  visits: PatientVisitAnalyticsRecord[],
  patients: Pick<PatientProfile, "id" | "acquisitionSource">[],
  month: string
): PatientAcquisitionSourceMetric[] => {
  const firstVisitMonth = new Map<string, string>();
  visits
    .filter((visit) => visit.patientId && visit.visitStatus !== VisitStatus.CANCELLED)
    .map((visit) => ({ visit, month: getJakartaMonth(visit.visitDateTime) }))
    .filter((item): item is { visit: PatientVisitAnalyticsRecord; month: string } => item.month !== null)
    .forEach(({ visit, month: visitMonth }) => {
      const existingMonth = firstVisitMonth.get(visit.patientId);
      if (!existingMonth || visitMonth < existingMonth) firstVisitMonth.set(visit.patientId, visitMonth);
    });

  const patientSources = new Map(patients.map((patient) => [patient.id, patient.acquisitionSource || "UNKNOWN"]));
  const counts = new Map<PatientAcquisitionSource, number>();
  for (const [patientId, firstMonth] of firstVisitMonth) {
    if (firstMonth !== month) continue;
    const rawSource = patientSources.get(patientId) || "UNKNOWN";
    const source = rawSource in acquisitionSourceLabels ? rawSource : "UNKNOWN";
    counts.set(source, (counts.get(source) || 0) + 1);
  }

  const totalNewPatients = [...counts.values()].reduce((total, count) => total + count, 0);
  return (Object.keys(acquisitionSourceLabels) as PatientAcquisitionSource[]).map((source) => {
    const patientsCount = counts.get(source) || 0;
    return {
      source,
      label: acquisitionSourceLabels[source],
      patients: patientsCount,
      percent: totalNewPatients ? patientsCount / totalNewPatients * 100 : 0
    };
  });
};

export const getPatientVisitAnalytics = (
  visits: PatientVisitAnalyticsRecord[],
  now: Date = new Date()
): PatientVisitAnalytics => {
  const todayJakarta = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit"
  }).formatToParts(now);
  const currentYear = Number(todayJakarta.find((part) => part.type === "year")?.value);
  const currentMonth = Number(todayJakarta.find((part) => part.type === "month")?.value);
  const currentMonthStart = new Date(currentYear, currentMonth - 1, 1);
  const monthlyKeys = Array.from({ length: 12 }, (_, index) => {
    const date = new Date(currentMonthStart.getFullYear(), currentMonthStart.getMonth() - 12 + index, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  });
  const requestedMonths = new Set(monthlyKeys);

  const validVisits = visits
    .filter((visit) => visit.patientId && visit.visitStatus !== VisitStatus.CANCELLED)
    .map((visit) => ({ visit, month: getJakartaMonth(visit.visitDateTime) }))
    .filter((item): item is { visit: PatientVisitAnalyticsRecord; month: string } => item.month !== null)
    .sort((a, b) => a.visit.visitDateTime.localeCompare(b.visit.visitDateTime));

  const firstVisitMonth = new Map<string, string>();
  const patientsPerMonth = new Map<string, Set<string>>();
  const newPatientsPerMonth = new Map<string, Set<string>>();
  const existingPatientsPerMonth = new Map<string, Set<string>>();
  const visitsPerMonth = new Map<string, number>();

  for (const { visit, month } of validVisits) {
    const firstMonth = firstVisitMonth.get(visit.patientId);
    if (!firstMonth || month < firstMonth) firstVisitMonth.set(visit.patientId, month);
    if (!requestedMonths.has(month)) continue;

    const patientSet = patientsPerMonth.get(month) || new Set<string>();
    patientSet.add(visit.patientId);
    patientsPerMonth.set(month, patientSet);
    visitsPerMonth.set(month, (visitsPerMonth.get(month) || 0) + 1);
  }

  for (const [patientId, month] of firstVisitMonth) {
    if (!requestedMonths.has(month)) continue;
    const set = newPatientsPerMonth.get(month) || new Set<string>();
    set.add(patientId);
    newPatientsPerMonth.set(month, set);
  }

  for (const [month, patients] of patientsPerMonth) {
    const set = existingPatientsPerMonth.get(month) || new Set<string>();
    for (const patientId of patients) {
      if (firstVisitMonth.get(patientId) !== month) set.add(patientId);
    }
    existingPatientsPerMonth.set(month, set);
  }

  const metrics = monthlyKeys.map((month): PatientVisitMonthMetric => {
    const newPatients = newPatientsPerMonth.get(month)?.size || 0;
    const existingPatients = existingPatientsPerMonth.get(month)?.size || 0;
    const uniquePatients = newPatients + existingPatients;
    return {
      month,
      label: monthLabel(month),
      newPatients,
      existingPatients,
      uniquePatients,
      visits: visitsPerMonth.get(month) || 0,
      existingPercent: uniquePatients ? existingPatients / uniquePatients * 100 : 0,
      newPercent: uniquePatients ? newPatients / uniquePatients * 100 : 0
    };
  });

  return { months: metrics, lastMonth: metrics[metrics.length - 1] };
};
