export function normalizeReferralServiceName(serviceName: string | null | undefined): string {
  return (serviceName || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}
