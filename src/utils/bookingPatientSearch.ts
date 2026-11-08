import { UserRole } from "../types/domain";

export function limitBookingPatientSearchResults<T>(
  results: T[],
  query: string,
  role: UserRole | undefined
): T[] {
  if (query.trim() && role === UserRole.SUPER_ADMIN) return results;
  return results.slice(0, 5);
}
