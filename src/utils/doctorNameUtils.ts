import { Booking, DentalDoctor } from "../types/domain";

type DoctorDisplayNameSource = Pick<DentalDoctor, "name">;
type DoctorDocumentNameSource = Pick<DentalDoctor, "name" | "fullName">;

export const getDoctorDisplayName = (
  doctor?: DoctorDisplayNameSource | null,
  fallback = "Dokter"
): string => doctor?.name?.trim() || fallback;

export const getBookingDoctorDisplayName = (
  booking: Pick<Booking, "doctorId" | "externalDoctorId" | "doctorNameSnapshot">,
  doctors: readonly Pick<DentalDoctor, "id" | "name">[],
  fallback = "Dokter"
): string => {
  const savedName = booking.doctorNameSnapshot?.trim();
  if (booking.externalDoctorId && savedName) return savedName;
  const currentDoctor = doctors.find((doctor) => doctor.id === booking.doctorId);
  return getDoctorDisplayName(currentDoctor, savedName || fallback);
};

export const getDoctorDocumentName = (
  doctor?: DoctorDocumentNameSource | null,
  savedName?: string
): string => {
  const savedDocumentName = savedName?.trim();
  if (savedDocumentName) return savedDocumentName;
  return doctor?.fullName?.trim() || "";
};
