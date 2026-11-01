import { DentalDoctor } from "../types/domain";

type DoctorDisplayNameSource = Pick<DentalDoctor, "name">;
type DoctorDocumentNameSource = Pick<DentalDoctor, "name" | "fullName">;

export const getDoctorDisplayName = (
  doctor?: DoctorDisplayNameSource | null,
  fallback = "Dokter"
): string => doctor?.name?.trim() || fallback;

export const getDoctorDocumentName = (
  doctor?: DoctorDocumentNameSource | null,
  savedName?: string
): string => {
  const savedDocumentName = savedName?.trim();
  const displayName = doctor?.name?.trim();
  if (savedDocumentName && displayName && savedDocumentName !== displayName) {
    return savedDocumentName;
  }

  return doctor?.fullName?.trim() || "";
};
