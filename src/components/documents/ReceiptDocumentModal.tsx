import React from "react";
import { X } from "lucide-react";
import {
  PaymentTransaction,
  Invoice,
  PatientProfile,
  DentalBranch,
  ClinicBranding
} from "../../types/domain";
import { ReceiptDocument } from "./ReceiptDocument";
import { DocumentActionButtons } from "./DocumentActionButtons";
import { createReceiptWhatsAppMessage } from "../../utils/documentUtils";

interface ReceiptDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  payment: PaymentTransaction | null;
  invoice?: Invoice | null;
  patient?: PatientProfile | null;
  branch?: DentalBranch | null;
  branding: ClinicBranding;
  cashierName?: string;
  doctorName?: string;
}

export const ReceiptDocumentModal: React.FC<ReceiptDocumentModalProps> = ({
  isOpen,
  onClose,
  payment,
  invoice,
  patient,
  branch,
  branding,
  cashierName,
  doctorName
}) => {
  if (!isOpen || !payment) return null;

  const receiptNumber = payment.receiptNumber || payment.id;
  const cleanDocNumber = receiptNumber.replace(/[\/\\]/g, "_");
  const fileName = `${cleanDocNumber}.pdf`;

  const waMessage = createReceiptWhatsAppMessage({
    clinicName: branding.name,
    branchName: branch ? branch.name : "Klinik Lala Dentist",
    receiptNumber,
    invoiceNumber: invoice?.invoiceNumber || payment.invoiceId,
    patientName: patient?.fullName || "Pasien",
    doctorName,
    amountPaid: payment.amount,
    paymentMethod: payment.paymentMethod,
    referenceNumber: payment.referenceNumber,
    remainingOutstanding: invoice ? invoice.outstandingAmount : 0,
    dateStr: payment.transactionDateTime || payment.createdAt,
    staffName: cashierName
  });

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto print:p-0 print:static print:bg-white">
      <div className="bg-slate-100 rounded-2xl shadow-2xl max-w-3xl w-full max-h-[92vh] flex flex-col border border-slate-300 print:max-w-none print:w-full print:max-h-none print:shadow-none print:border-none print:bg-white">
        {/* Modal Top Bar */}
        <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200 rounded-t-2xl print:hidden">
          <div className="flex items-center space-x-3">
            <span className="w-3 h-3 rounded-full bg-emerald-600"></span>
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Kwitansi Bukti Pembayaran
              </h2>
              <p className="text-xs text-slate-500 font-mono">
                {receiptNumber}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <DocumentActionButtons
              targetElementId="receipt-printable-document"
              pdfFileName={fileName}
              whatsAppText={waMessage}
              recipientPhone={patient?.phone}
            />

            <button
              id="btn-close-receipt-modal"
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Document Container */}
        <div className="p-6 overflow-y-auto flex-1 bg-slate-100 print:p-0 print:overflow-visible print:bg-white">
          <ReceiptDocument
            payment={payment}
            invoice={invoice}
            patient={patient}
            branch={branch}
            branding={branding}
            cashierName={cashierName}
            doctorName={doctorName}
          />
        </div>
      </div>
    </div>
  );
};
