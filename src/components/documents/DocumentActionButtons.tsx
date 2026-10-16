import React, { useState } from "react";
import { Printer, Download, MessageSquare, Check, Copy } from "lucide-react";
import { generatePdfFromElement } from "../../utils/pdfGenerator";
import { sanitizeWhatsAppPhone } from "../../utils/documentUtils";

interface DocumentActionButtonsProps {
  targetElementId: string;
  pdfFileName: string;
  whatsAppText: string;
  recipientPhone?: string;
  onPrintSuccess?: () => void;
}

export const DocumentActionButtons: React.FC<DocumentActionButtonsProps> = ({
  targetElementId,
  pdfFileName,
  whatsAppText,
  recipientPhone,
  onPrintSuccess
}) => {
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [copied, setCopied] = useState(false);
  const [waModalOpen, setWaModalOpen] = useState(false);
  const [targetPhone, setTargetPhone] = useState(recipientPhone || "");

  const handlePrint = () => {
    const el = document.getElementById(targetElementId);
    const docTitle = pdfFileName.replace(/\.pdf$/i, "");
    const prevTitle = document.title;

    try {
      document.title = docTitle;
    } catch {
      // ignore title error if any
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

    if (!el) {
      window.print();
      restoreTitle();
      if (onPrintSuccess) onPrintSuccess();
      return;
    }

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
      if (frameDoc) {
        frameDoc.open();
        const styleElements = Array.from(document.querySelectorAll("link[rel='stylesheet'], style"))
          .map((node) => node.outerHTML)
          .join("\n");

        frameDoc.write(`
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="UTF-8">
              <title>${pdfFileName.replace(/\.pdf$/i, "")}</title>
              ${styleElements}
              <style>
                @page {
                  size: A4 portrait;
                  margin: 8mm 10mm;
                }
                * {
                  box-sizing: border-box;
                }
                body {
                  margin: 0;
                  padding: 0;
                  background: #ffffff !important;
                  color: #0f172a !important;
                  font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif !important;
                  font-size: 11px !important;
                  -webkit-print-color-adjust: exact !important;
                  print-color-adjust: exact !important;
                }
                #${targetElementId} {
                  width: 100% !important;
                  max-width: 100% !important;
                  box-shadow: none !important;
                  border: none !important;
                  margin: 0 !important;
                  padding: 2mm 0 !important;
                  background: #ffffff !important;
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
            if (onPrintSuccess) onPrintSuccess();
          } catch (e) {
            console.warn("Iframe print fallback to window.print", e);
            window.print();
            if (onPrintSuccess) onPrintSuccess();
          } finally {
            restoreTitle();
          }
        }, 300);
        return;
      }
    } catch (e) {
      console.warn("Error setting up iframe print, using window.print", e);
    }

    window.print();
    if (onPrintSuccess) onPrintSuccess();
  };

  const handleDownloadPdf = async () => {
    const el = document.getElementById(targetElementId);
    if (!el) {
      alert("Elemen dokumen tidak ditemukan untuk pembuatan PDF");
      return;
    }

    try {
      setIsGeneratingPdf(true);
      await generatePdfFromElement(el, {
        fileName: pdfFileName,
        forceSinglePage: true,
        orientation: "portrait",
        format: "a4"
      });
    } catch (err) {
      console.error(err);
      alert("Gagal membuat file PDF");
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleOpenWhatsApp = () => {
    const sanitized = sanitizeWhatsAppPhone(targetPhone || recipientPhone);
    const encoded = encodeURIComponent(whatsAppText);
    const url = sanitized
      ? `https://wa.me/${sanitized}?text=${encoded}`
      : `https://wa.me/?text=${encoded}`;

    window.open(url, "_blank");
    setWaModalOpen(false);
  };

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(whatsAppText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Gagal menyalin teks:", err);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden document-actions-bar">
      {/* 1. Print Button */}
      <button
        id="btn-print-document"
        type="button"
        onClick={handlePrint}
        className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition-colors shadow-xs"
      >
        <Printer className="w-4 h-4 text-slate-600" />
        <span>Cetak (Print)</span>
      </button>

      {/* 2. Download PDF Button */}
      <button
        id="btn-download-pdf"
        type="button"
        disabled={isGeneratingPdf}
        onClick={handleDownloadPdf}
        className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-300 transition-colors shadow-xs disabled:opacity-50"
      >
        <Download className="w-4 h-4 text-teal-700" />
        <span>{isGeneratingPdf ? "Menyiapkan PDF..." : "Unduh PDF (1 Lembar)"}</span>
      </button>

      {/* 3. Share to WhatsApp Button */}
      <button
        id="btn-share-whatsapp"
        type="button"
        onClick={() => {
          if (recipientPhone) {
            handleOpenWhatsApp();
          } else {
            setWaModalOpen(true);
          }
        }}
        className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors shadow-xs"
      >
        <MessageSquare className="w-4 h-4" />
        <span>Kirim WhatsApp</span>
      </button>

      {/* WhatsApp Target Phone Modal if needed */}
      {waModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 mb-2">Kirim Dokumen via WhatsApp</h3>
            <p className="text-xs text-slate-500 mb-4">
              Masukkan nomor WhatsApp pasien/penerima atau salin format pesan teks.
            </p>

            <div className="mb-4">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nomor WhatsApp Tujuan:
              </label>
              <input
                type="text"
                value={targetPhone}
                onChange={(e) => setTargetPhone(e.target.value)}
                placeholder="Contoh: 08123456789"
                className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="mb-4">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Preview Pesan Ringkas:
              </label>
              <div className="text-[11px] font-mono bg-slate-50 p-3 rounded-lg border border-slate-200 text-slate-700 max-h-36 overflow-y-auto whitespace-pre-wrap">
                {whatsAppText}
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={handleCopyText}
                className="inline-flex items-center space-x-1 text-xs text-slate-600 hover:text-slate-900 font-medium px-2 py-1"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? "Tersalin!" : "Salin Pesan"}</span>
              </button>

              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={() => setWaModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleOpenWhatsApp}
                  className="px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg"
                >
                  Buka WhatsApp
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
