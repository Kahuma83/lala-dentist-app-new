import React, { useState } from "react";
import {
  MonthlyPayroll,
  PayrollItem,
  Staff,
  DentalDoctor,
  DentalBranch,
  ClinicBranding
} from "../../types/domain";
import { PayslipDocument } from "./PayslipDocument";
import {
  createPayslipWhatsAppMessage,
  sanitizeWhatsAppPhone
} from "../../utils/documentUtils";
import { generatePdfFromElement } from "../../utils/pdfGenerator";
import {
  X,
  Printer,
  Download,
  MessageCircle,
  Copy,
  Check,
  Building2,
  Phone,
  Send,
  ExternalLink
} from "lucide-react";

interface PayslipDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  payroll: MonthlyPayroll | null;
  items: PayrollItem[];
  staff?: Staff | null;
  doctor?: DentalDoctor | null;
  branch?: DentalBranch | null;
  branding: ClinicBranding;
  journalNumber?: string;
  payerName?: string;
}

const MONTH_NAMES = [
  "",
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

export const PayslipDocumentModal: React.FC<PayslipDocumentModalProps> = ({
  isOpen,
  onClose,
  payroll,
  items,
  staff,
  doctor,
  branch,
  branding,
  journalNumber,
  payerName = "Manajemen Keuangan Lala Dentist"
}) => {
  if (!isOpen || !payroll) return null;

  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showWaCustomizer, setShowWaCustomizer] = useState(false);

  const recipientName = doctor?.name || staff?.fullName || "Pegawai";
  const rawPhone = doctor?.phone || staff?.phone || "";
  const [targetPhone, setTargetPhone] = useState(rawPhone);

  const periodName = `${MONTH_NAMES[payroll.month] || payroll.month} ${payroll.year}`;
  const slipNumber = `SLIP/${branch?.branchCode || "GEB"}/${payroll.year}${String(payroll.month).padStart(2, "0")}/${payroll.id.replace(/[^0-9]/g, "").slice(-4) || "0001"}`;
  const position = doctor ? (doctor.title || "Dokter Gigi") : (staff?.position || "Staf / Asisten");
  const bankName = payroll.bankNameSnapshot || doctor?.bankName || staff?.bankName || "Bank BCA";
  const bankAccountNumber = payroll.bankAccountNumberSnapshot || doctor?.bankAccountNumber || staff?.bankAccountNumber || "-";
  const bankAccountHolder = payroll.bankAccountHolderSnapshot || doctor?.bankAccountHolder || staff?.bankAccountHolder || recipientName;

  const whatsAppMessage = createPayslipWhatsAppMessage({
    clinicName: branch?.clinicName || branding.name,
    branchName: branch?.name || "Gebang",
    payslipNumber: slipNumber,
    periodName,
    employeeName: recipientName,
    employeeCode: staff?.employeeCode || doctor?.doctorCode,
    position,
    bankName,
    bankAccountNumber,
    bankAccountHolder,
    baseSalary: payroll.baseSalary,
    totalCompensation: payroll.totalCompensation,
    totalDeductions: payroll.totalDeductions,
    netSalary: payroll.netSalary,
    paymentStatus: payroll.status === "PAID" ? "SUDAH DITRANSFER (PAID)" : "SIAP DITRANSFER",
    journalNumber
  });

  const handleCopyMessage = async () => {
    try {
      await navigator.clipboard.writeText(whatsAppMessage);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  const handleDirectWhatsApp = () => {
    const cleanNumber = sanitizeWhatsAppPhone(targetPhone || rawPhone);
    const encoded = encodeURIComponent(whatsAppMessage);
    const waUrl = cleanNumber
      ? `https://wa.me/${cleanNumber}?text=${encoded}`
      : `https://api.whatsapp.com/send?text=${encoded}`;

    window.open(waUrl, "_blank", "noopener,noreferrer");
  };

  const handleDownloadPdf = async () => {
    try {
      setIsGeneratingPdf(true);
      const safeName = recipientName.replace(/[^a-zA-Z0-9]/g, "_");
      const fileName = `Slip_Gaji_${safeName}_${payroll.month}_${payroll.year}.pdf`;
      const el = document.getElementById("payslip-printable-document");
      if (el) {
        await generatePdfFromElement(el, { fileName });
      }
    } catch (e) {
      console.error("PDF generation failed:", e);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handlePrint = () => {
    const el = document.getElementById("payslip-printable-document");
    const docTitle = `Slip_Gaji_${recipientName}_${payroll.month}_${payroll.year}`;
    const prevTitle = document.title;

    try {
      document.title = docTitle;
    } catch {
      // ignore
    }

    const restoreTitle = () => {
      setTimeout(() => {
        try {
          document.title = prevTitle;
        } catch {
          // ignore
        }
      }, 1200);
    };

    // Use isolated invisible iframe to avoid blank page print bugs
    try {
      const existingFrame = document.getElementById("hidden-print-frame");
      if (existingFrame) existingFrame.remove();

      const printFrame = document.createElement("iframe");
      printFrame.id = "hidden-print-frame";
      printFrame.style.position = "fixed";
      printFrame.style.right = "0";
      printFrame.style.bottom = "0";
      printFrame.style.width = "0";
      printFrame.style.height = "0";
      printFrame.style.border = "0";
      printFrame.style.visibility = "hidden";
      document.body.appendChild(printFrame);

      const frameDoc = printFrame.contentWindow?.document || printFrame.contentDocument;
      if (frameDoc && el) {
        frameDoc.open();
        const styleElements = Array.from(document.querySelectorAll("link[rel='stylesheet'], style"))
          .map((node) => node.outerHTML)
          .join("\n");

        frameDoc.write(`
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="UTF-8">
              <title>${docTitle}</title>
              ${styleElements}
              <style>
                @page {
                  size: A4 portrait;
                  margin: 8mm 10mm;
                }
                body {
                  background: white !important;
                  color: black !important;
                  margin: 0 !important;
                  padding: 10px !important;
                  font-family: 'Plus Jakarta Sans', system-ui, sans-serif !important;
                  -webkit-print-color-adjust: exact !important;
                  print-color-adjust: exact !important;
                }
                #payslip-printable-document {
                  box-shadow: none !important;
                  border: none !important;
                  width: 100% !important;
                  max-width: 100% !important;
                  padding: 0 !important;
                  margin: 0 !important;
                }
              </style>
            </head>
            <body>
              ${el.outerHTML}
            </body>
          </html>
        `);
        frameDoc.close();

        setTimeout(() => {
          try {
            printFrame.contentWindow?.focus();
            printFrame.contentWindow?.print();
          } catch (e) {
            console.error("Frame print failed, falling back to window.print", e);
            window.print();
          }
          restoreTitle();
        }, 350);
        return;
      }
    } catch {
      // fallback to window.print()
    }

    window.print();
    restoreTitle();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 print-document-modal-wrapper">
      <div className="relative w-full max-w-4xl bg-slate-100 rounded-2xl shadow-2xl border border-slate-300 flex flex-col max-h-[94vh] overflow-hidden">
        
        {/* Top Header Bar */}
        <div className="modal-topbar bg-white px-4 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-[#8a6f27]">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 leading-none">
                Slip Gaji & Bukti Transfer Bank
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {recipientName} • Periode {periodName}
              </p>
            </div>
          </div>

          {/* Action Buttons Toolbar */}
          <div className="flex items-center flex-wrap gap-2">
            {/* 1. Direct Send WhatsApp Button (Green & Bold) */}
            <button
              type="button"
              onClick={handleDirectWhatsApp}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors cursor-pointer"
              title="Kirim rincian slip gaji langsung ke WhatsApp pegawai"
            >
              <MessageCircle className="w-4 h-4 fill-emerald-100 text-emerald-600" />
              <span>Kirim ke WhatsApp Pegawai</span>
            </button>

            {/* WA Number Customizer toggle */}
            <button
              type="button"
              onClick={() => setShowWaCustomizer(!showWaCustomizer)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-colors cursor-pointer"
              title="Ubah nomor atau lihat format pesan WhatsApp"
            >
              <Phone className="w-3.5 h-3.5 text-slate-500" />
              <span>{showWaCustomizer ? "Tutup WA" : "Opsi WA"}</span>
            </button>

            {/* 2. Copy WA Message */}
            <button
              type="button"
              onClick={handleCopyMessage}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 transition-colors cursor-pointer shadow-2xs"
              title="Salin teks format WhatsApp ke clipboard"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-700 font-semibold">Tersalin!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-500" />
                  <span>Salin Teks</span>
                </>
              )}
            </button>

            {/* 3. Print Button */}
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 transition-colors cursor-pointer shadow-2xs"
            >
              <Printer className="w-3.5 h-3.5 text-slate-600" />
              <span>Cetak / Print</span>
            </button>

            {/* 4. Download PDF */}
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={isGeneratingPdf}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#aa853a] hover:bg-[#8a6f27] text-white transition-colors cursor-pointer disabled:opacity-60 shadow-2xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isGeneratingPdf ? "Menyiapkan PDF..." : "Download PDF"}</span>
            </button>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors ml-1 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* WhatsApp Preview & Customizer Accordion */}
        {showWaCustomizer && (
          <div className="bg-emerald-50/90 border-b border-emerald-200 p-3.5 text-xs">
            <div className="max-w-2xl mx-auto space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-emerald-900 flex items-center gap-1.5">
                  <MessageCircle className="w-4 h-4 text-emerald-700" />
                  Pengiriman Pesan WhatsApp Resmi ke Pegawai
                </span>
                <span className="text-[11px] text-emerald-700">
                  Target: {recipientName}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex-1 flex items-center gap-2 bg-white rounded-lg border border-emerald-300 px-3 py-1.5 shadow-2xs">
                  <Phone className="w-4 h-4 text-emerald-600 shrink-0" />
                  <input
                    type="text"
                    value={targetPhone}
                    onChange={(e) => setTargetPhone(e.target.value)}
                    placeholder="Contoh: 08123456789 atau 628123456789"
                    className="w-full text-xs text-slate-800 focus:outline-hidden font-mono"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleDirectWhatsApp}
                  className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Kirim Sekarang</span>
                  <ExternalLink className="w-3 h-3 ml-0.5 opacity-80" />
                </button>
              </div>

              <div className="bg-white/80 rounded-lg p-2.5 border border-emerald-200 max-h-24 overflow-y-auto font-mono text-[11px] text-slate-700 whitespace-pre-wrap">
                {whatsAppMessage}
              </div>
            </div>
          </div>
        )}

        {/* Printable Document Preview Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-100/70">
          <PayslipDocument
            payroll={payroll}
            items={items}
            staff={staff}
            doctor={doctor}
            branch={branch}
            branding={branding}
            journalNumber={journalNumber}
            payerName={payerName}
          />
        </div>
      </div>
    </div>
  );
};
