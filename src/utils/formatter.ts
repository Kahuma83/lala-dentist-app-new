/**
 * Presentation Formatter Utilities
 * Decouples raw domain representations from UI display styles
 */

/**
 * Format raw integer Rupiah to currency string (e.g., 150000 -> "Rp 150.000")
 */
export function formatRupiah(amount: number): string {
  const rounded = Math.round(amount);
  return "Rp " + rounded.toLocaleString("id-ID");
}

/**
 * Format ISO datetime string or Date to custom display format
 * Input: "2026-09-21T14:30:00Z" or "2026-09-21T14:30:00"
 * Output: "21 September 2026 14:30"
 */
export function formatDateTime(isoString: string | undefined): string {
  if (!isoString) return "-";
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;

    const day = date.getDate();
    const months = [
      "Januari",
      "Februari",
      "Maret",
      "April",
      "Mei",
      "Juni",
      "Juli",
      "Agustus",
      "September",
      "Oktober",
      "November",
      "Desember"
    ];
    const month = months[date.getMonth()];
    const year = date.getFullYear();

    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");

    return `${day} ${month} ${year} ${hours}:${minutes}`;
  } catch (e) {
    return isoString;
  }
}

/**
 * Format ISO Date (YYYY-MM-DD) to simple display
 * Input: "1995-04-12"
 * Output: "12 September 1995"
 */
export function formatDate(isoString: string | undefined): string {
  if (!isoString) return "-";
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;

    const day = date.getDate();
    const months = [
      "Januari",
      "Februari",
      "Maret",
      "April",
      "Mei",
      "Juni",
      "Juli",
      "Agustus",
      "September",
      "Oktober",
      "November",
      "Desember"
    ];
    const month = months[date.getMonth()];
    const year = date.getFullYear();

    return `${day} ${month} ${year}`;
  } catch (e) {
    return isoString;
  }
}
