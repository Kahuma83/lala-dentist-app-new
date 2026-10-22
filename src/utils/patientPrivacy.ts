import { PatientProfile, UserRole } from "../types/domain";

export function canViewPatientPhone(role?: UserRole): boolean {
  return role === UserRole.SUPER_ADMIN || role === UserRole.BRANCH_ADMIN;
}

export function redactPatientPhone(patient: PatientProfile, role?: UserRole): PatientProfile {
  return canViewPatientPhone(role) ? patient : { ...patient, phone: "" };
}
