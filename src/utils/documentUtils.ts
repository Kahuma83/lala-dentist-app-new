import { DentalBranch, Invoice, PaymentTransaction, ClinicBranding, PatientProfile } from "../types/domain";

/**
 * Standard Branch Codes for Lala Dentist:
 * GEB (Gebang)
 * KEN (Kencong)
 * AMB (Ambulu)
 * KMP (Kampus)
 * MKS (Muktisari)
 * LMB (Lengkong Mumbul)
 */
export function getBranchCode(branchId: string, branches?: DentalBranch[]): string {
  const map: Record<string, string> = {
    "branch-gebang": "GEB",
    "branch-kencong": "KEN",
    "branch-ambulu": "AMB",
    "branch-kampus": "KMP",
    "branch-muktisari": "MKS",
    "branch-lengkong-mumbul": "LMB"
  };

  if (map[branchId]) {
    return map[branchId];
  }

  if (branches && branches.length > 0) {
    const b = branches.find((item) => item.id === branchId);
    if (b) {
      const nameUpper = b.name.toUpperCase();
      if (nameUpper.includes("GEBANG")) return "GEB";
      if (nameUpper.includes("KENCONG")) return "KEN";
      if (nameUpper.includes("AMBULU")) return "AMB";
      if (nameUpper.includes("KAMPUS")) return "KMP";
      if (nameUpper.includes("MUKTISARI")) return "MKS";
      if (nameUpper.includes("LENGKONG") || nameUpper.includes("MUMBUL")) return "LMB";
    }
  }

  const cleaned = branchId.replace(/^branch-/, "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return cleaned.slice(0, 3) || "GEB";
}

/**
 * Generate Invoice Number
 * Format: INV/{BRANCH_CODE}/{YYYYMM}/{RUNNING_4_DIGIT}
 * Example: INV/GEB/202609/0001
 */
export function generateInvoiceNumber(
  branchId: string,
  dateStr: string,
  existingInvoices: Invoice[],
  branches?: DentalBranch[]
): string {
  const branchCode = getBranchCode(branchId, branches);
  const date = dateStr ? new Date(dateStr) : new Date();
  const year = isNaN(date.getFullYear()) ? 2026 : date.getFullYear();
  const month = isNaN(date.getMonth()) ? "09" : String(date.getMonth() + 1).padStart(2, "0");
  const yyyymm = `${year}${month}`;
  const prefix = `INV/${branchCode}/${yyyymm}/`;

  let maxSeq = 0;
  for (const inv of existingInvoices || []) {
    if (inv.invoiceNumber && inv.invoiceNumber.startsWith(prefix)) {
      const parts = inv.invoiceNumber.split("/");
      if (parts.length >= 4) {
        const seq = parseInt(parts[3], 10);
        if (!isNaN(seq) && seq > maxSeq) {
          maxSeq = seq;
        }
      }
    }
  }

  let nextSeq = maxSeq + 1;
  let candidate = `${prefix}${String(nextSeq).padStart(4, "0")}`;
  while ((existingInvoices || []).some((i) => i.invoiceNumber === candidate)) {
    nextSeq++;
    candidate = `${prefix}${String(nextSeq).padStart(4, "0")}`;
  }

  return candidate;
}

/**
 * Generate Receipt / Kwitansi Number
 * Format: KWT/{BRANCH_CODE}/{YYYYMM}/{RUNNING_4_DIGIT}
 * Example: KWT/GEB/202609/0001
 */
export function generateReceiptNumber(
  branchId: string,
  dateStr: string,
  existingPayments: PaymentTransaction[],
  branches?: DentalBranch[]
): string {
  const branchCode = getBranchCode(branchId, branches);
  const date = dateStr ? new Date(dateStr) : new Date();
  const year = isNaN(date.getFullYear()) ? 2026 : date.getFullYear();
  const month = isNaN(date.getMonth()) ? "09" : String(date.getMonth() + 1).padStart(2, "0");
  const yyyymm = `${year}${month}`;
  const prefix = `KWT/${branchCode}/${yyyymm}/`;

  let maxSeq = 0;
  for (const pmt of existingPayments || []) {
    if (pmt.receiptNumber && pmt.receiptNumber.startsWith(prefix)) {
      const parts = pmt.receiptNumber.split("/");
      if (parts.length >= 4) {
        const seq = parseInt(parts[3], 10);
        if (!isNaN(seq) && seq > maxSeq) {
          maxSeq = seq;
        }
      }
    }
  }

  let nextSeq = maxSeq + 1;
  let candidate = `${prefix}${String(nextSeq).padStart(4, "0")}`;
  while ((existingPayments || []).some((p) => p.receiptNumber === candidate)) {
    nextSeq++;
    candidate = `${prefix}${String(nextSeq).padStart(4, "0")}`;
  }

  return candidate;
}

/**
 * Convert Indonesian Rupiah amount to Words (Terbilang)
 */
export function numberToTerbilang(nominal: number): string {
  if (nominal === 0) return "Nol Rupiah";
  if (nominal < 0) return `Minus ${numberToTerbilang(Math.abs(nominal))}`;

  const angka = ["", "Satu", "Dua", "Tiga", "Empat", "Lima", "Enam", "Tujuh", "Delapan", "Sembilan", "Sepuluh", "Sebelas"];

  function bilang(n: number): string {
    if (n < 12) return angka[n];
    if (n < 20) return `${bilang(n - 10)} Belas`;
    if (n < 100) return `${bilang(Math.floor(n / 10))} Puluh ${bilang(n % 10)}`.trim();
    if (n < 200) return `Seratus ${bilang(n - 100)}`.trim();
    if (n < 1000) return `${bilang(Math.floor(n / 100))} Ratus ${bilang(n % 100)}`.trim();
    if (n < 2000) return `Seribu ${bilang(n - 1000)}`.trim();
    if (n < 1000000) return `${bilang(Math.floor(n / 1000))} Ribu ${bilang(n % 1000)}`.trim();
    if (n < 1000000000) return `${bilang(Math.floor(n / 1000000))} Juta ${bilang(n % 1000000)}`.trim();
    if (n < 1000000000000) return `${bilang(Math.floor(n / 1000000000))} Milyar ${bilang(n % 1000000000)}`.trim();
    return `${bilang(Math.floor(n / 1000000000000))} Triliun ${bilang(n % 1000000000000)}`.trim();
  }

  return `${bilang(Math.floor(nominal)).trim()} Rupiah`;
}

/**
 * Currency Formatter for Indonesian Rupiah
 */
export function formatRupiah(amount: number): string {
  return `Rp ${Math.round(amount || 0).toLocaleString("id-ID")}`;
}

/**
 * Format standard Indonesian Date
 */
export function formatIndoDate(dateStr: string): string {
  if (!dateStr) return "-";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric"
    });
  } catch {
    return dateStr;
  }
}

/**
 * Format standard Indonesian DateTime
 */
export function formatIndoDateTime(dateStr: string): string {
  if (!dateStr) return "-";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return dateStr;
  }
}

/**
 * Clean phone number for WhatsApp wa.me links
 * e.g. "08123456789" -> "628123456789"
 */
export function sanitizeWhatsAppPhone(phone?: string): string {
  if (!phone) return "";
  let clean = phone.replace(/[^0-9]/g, "");
  if (clean.startsWith("0")) {
    clean = "62" + clean.substring(1);
  } else if (clean.startsWith("+62")) {
    clean = clean.substring(1);
  }
  return clean;
}

/**
 * Generate formatted WhatsApp message for Invoice
 */
export function createInvoiceWhatsAppMessage(params: {
  clinicName: string;
  branchName: string;
  invoiceNumber: string;
  patientName: string;
  doctorName?: string;
  totalAmount: number;
  discountAmount?: number;
  taxAmount?: number;
  netAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  status: string;
  dateStr: string;
}): string {
  const {
    clinicName,
    branchName,
    invoiceNumber,
    patientName,
    doctorName,
    totalAmount,
    discountAmount = 0,
    taxAmount = 0,
    netAmount,
    paidAmount,
    outstandingAmount,
    status,
    dateStr
  } = params;

  let msg = `*FAKTUR TAGIHAN PELAYANAN MEDIS*\n`;
  msg += `*${clinicName.toUpperCase()} — ${branchName.toUpperCase()}*\n`;
  msg += `-----------------------------------------\n`;
  msg += `No. Faktur : ${invoiceNumber}\n`;
  msg += `Tanggal    : ${formatIndoDate(dateStr)}\n`;
  msg += `Pasien     : ${patientName}\n`;
  if (doctorName) {
    msg += `Dokter     : ${doctorName}\n`;
  }
  msg += `Status     : *${status}*\n`;
  msg += `-----------------------------------------\n`;
  msg += `Subtotal   : ${formatRupiah(totalAmount)}\n`;
  if (discountAmount > 0) {
    msg += `Diskon     : - ${formatRupiah(discountAmount)}\n`;
  }
  if (taxAmount > 0) {
    msg += `Biaya/Pjk  : + ${formatRupiah(taxAmount)}\n`;
  }
  msg += `*Total Tagihan : ${formatRupiah(netAmount)}*\n`;
  msg += `Telah Dibayar : ${formatRupiah(paidAmount)}\n`;
  msg += `*Sisa Tagihan : ${formatRupiah(outstandingAmount)}*\n`;
  msg += `-----------------------------------------\n`;
  if (outstandingAmount === 0) {
    msg += `✅ *TAGIHAN INI TELAH LUNAS*\n`;
  } else {
    msg += `Mohon segera menyelesaikan pembayaran sisa tagihan di kasir klinik.\n`;
  }
  msg += `\nTerima kasih telah mempercayakan kesehatan gigi & mulut Anda pada ${clinicName}.`;

  return msg;
}

/**
 * Clean cashier/staff name by stripping any role or branch in parentheses.
 * e.g. "Siska Wardani (Admin Gebang)" -> "Siska Wardani"
 * e.g. "Dr. Anita Rahma (Super Admin)" -> "Dr. Anita Rahma"
 */
export function sanitizeStaffName(name?: string): string {
  if (!name) return "Admin Kasir";
  return name.replace(/\s*\([^)]*\)/g, "").trim() || "Admin Kasir";
}

/**
 * Generate formatted WhatsApp message for Receipt (Kwitansi)
 */
export function createReceiptWhatsAppMessage(params: {
  clinicName: string;
  branchName: string;
  receiptNumber: string;
  invoiceNumber?: string;
  patientName: string;
  doctorName?: string;
  amountPaid: number;
  paymentMethod: string;
  referenceNumber?: string;
  remainingOutstanding: number;
  dateStr: string;
  staffName?: string;
}): string {
  const {
    clinicName,
    branchName,
    receiptNumber,
    invoiceNumber,
    patientName,
    doctorName,
    amountPaid,
    paymentMethod,
    referenceNumber,
    remainingOutstanding,
    dateStr,
    staffName
  } = params;

  let msg = `*KWITANSI BUKTI PEMBAYARAN SAH*\n`;
  msg += `*${clinicName.toUpperCase()} — ${branchName.toUpperCase()}*\n`;
  msg += `-----------------------------------------\n`;
  msg += `No. Kwitansi : ${receiptNumber}\n`;
  if (invoiceNumber) {
    msg += `No. Faktur   : ${invoiceNumber}\n`;
  }
  msg += `Tanggal      : ${formatIndoDateTime(dateStr)}\n`;
  msg += `Diterima Dari: ${patientName}\n`;
  if (doctorName) {
    msg += `Dokter       : ${doctorName}\n`;
  }
  msg += `-----------------------------------------\n`;
  msg += `*Jumlah Bayar : ${formatRupiah(amountPaid)}*\n`;
  msg += `Terbilang    : _${numberToTerbilang(amountPaid)}_\n`;
  msg += `Metode Bayar : ${paymentMethod}\n`;
  if (referenceNumber) {
    msg += `No. Ref/EDC  : ${referenceNumber}\n`;
  }
  if (staffName) {
    msg += `Petugas Kasir: ${staffName}\n`;
  }
  msg += `-----------------------------------------\n`;
  if (remainingOutstanding === 0) {
    msg += `Status Tagihan: *LUNAS (Paid)*\n`;
  } else {
    msg += `Sisa Tagihan  : *${formatRupiah(remainingOutstanding)}*\n`;
  }
  msg += `-----------------------------------------\n`;
  msg += `Bukti pembayaran ini sah dan diterbitkan secara digital oleh sistem ${clinicName}.\n`;
  msg += `\nSemoga lekas sembuh dan senyum sehat selalu! ✨`;

  return msg;
}

/**
 * Generate formatted WhatsApp message for Payslip & Bank Transfer Slip
 */
export function createPayslipWhatsAppMessage(params: {
  clinicName: string;
  branchName: string;
  payslipNumber: string;
  periodName: string; // e.g. "September 2026"
  employeeName: string;
  employeeCode?: string;
  position: string;
  bankName?: string;
  bankAccountNumber?: string;
  bankAccountHolder?: string;
  baseSalary: number;
  totalCompensation: number;
  totalDeductions: number;
  netSalary: number;
  paymentStatus: string;
  journalNumber?: string;
}): string {
  const {
    clinicName,
    branchName,
    payslipNumber,
    periodName,
    employeeName,
    employeeCode,
    position,
    bankName,
    bankAccountNumber,
    bankAccountHolder,
    baseSalary,
    totalCompensation,
    totalDeductions,
    netSalary,
    paymentStatus,
    journalNumber
  } = params;

  let msg = `🦷 *SLIP GAJI & TRANSFER BANK RESMI* 🦷\n`;
  msg += `*${clinicName.toUpperCase()} — ${branchName.toUpperCase()}*\n`;
  msg += `=========================================\n`;
  msg += `📄 *No. Slip:* ${payslipNumber}\n`;
  msg += `📅 *Periode:* ${periodName}\n`;
  msg += `👤 *Penerima:* ${employeeName}${employeeCode ? ` (${employeeCode})` : ""}\n`;
  msg += `💼 *Posisi:* ${position}\n`;
  msg += `-----------------------------------------\n`;
  msg += `🏦 *INFORMASI TRANSFER BANK:*\n`;
  msg += `• Bank Tujuan   : *${bankName || "Bank Transfer"}*\n`;
  msg += `• No. Rekening  : *${bankAccountNumber || "-"}*\n`;
  msg += `• Atas Nama     : *${bankAccountHolder || employeeName}*\n`;
  msg += `• Status Gaji   : *${paymentStatus.toUpperCase()}* ✅\n`;
  msg += `-----------------------------------------\n`;
  msg += `💵 *RINCIAN PENGHASILAN:*\n`;
  msg += `➕ Gaji Pokok   : ${formatRupiah(baseSalary)}\n`;
  if (totalCompensation > 0) {
    msg += `➕ Komisi/Jasa  : + ${formatRupiah(totalCompensation)}\n`;
  }
  if (totalDeductions > 0) {
    msg += `➖ Potongan     : - ${formatRupiah(totalDeductions)}\n`;
  }
  msg += `=========================================\n`;
  msg += `💰 *TOTAL DITERIMA (THP) : ${formatRupiah(netSalary)}*\n`;
  msg += `_Terbilang: ${numberToTerbilang(netSalary)}_\n`;
  msg += `=========================================\n`;
  if (journalNumber) {
    msg += `🔖 *No. Jurnal Akuntansi:* ${journalNumber}\n`;
  }
  msg += `\nSlip gaji dan bukti transfer ini sah dan diterbitkan secara digital oleh Manajemen ${clinicName}.\n`;
  msg += `Terima kasih atas dedikasi dan kerja keras Anda! 🙏✨`;

  return msg;
}
