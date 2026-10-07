import React from "react";
import {
  PaymentTransaction,
  Invoice,
  PatientProfile,
  DentalBranch,
  ClinicBranding
} from "../../types/domain";
import { DocumentHeader } from "./DocumentHeader";
import {
  formatRupiah,
  formatIndoDateTime,
  numberToTerbilang,
  sanitizeStaffName
} from "../../utils/documentUtils";

interface ReceiptDocumentProps {
  payment: PaymentTransaction;
  invoice?: Invoice | null;
  patient?: PatientProfile | null;
  branch?: DentalBranch | null;
  branding: ClinicBranding;
  cashierName?: string;
  doctorName?: string;
}

export const ReceiptDocument: React.FC<ReceiptDocumentProps> = ({
  payment,
  invoice,
  patient,
  branch,
  branding,
  cashierName = "Admin Kasir",
  doctorName
}) => {
  const receiptNumber = payment.receiptNumber || payment.id;
  const invoiceNumber = invoice?.invoiceNumber || payment.invoiceId;
  const remainingOutstanding = invoice ? invoice.outstandingAmount : 0;
  const isFullySettled = invoice ? invoice.outstandingAmount === 0 : true;

  return (
    <div
      id="receipt-printable-document"
      className="bg-white text-slate-800 p-6 max-w-3xl mx-auto shadow-xs border border-slate-200 rounded-lg print:border-none print:shadow-none print:p-0 print:m-0"
      style={{ fontFamily: "'Plus Jakarta Sans', 'Segoe UI', sans-serif" }}
    >
      {/* 1. Header with Clinic Branding & Logo */}
      <DocumentHeader
        branding={branding}
        branch={branch}
        documentType="KWITANSI PEMBAYARAN"
        documentNumber={receiptNumber}
        documentDate={formatIndoDateTime(payment.transactionDateTime || payment.createdAt)}
      />

      {/* 2. Main Receipt Details Form-style */}
      <div className="space-y-3 mb-5 text-xs border border-slate-200 rounded-lg p-4 bg-slate-50">
        <div className="grid grid-cols-12 gap-2 items-center py-1 border-b border-slate-200">
          <div className="col-span-3 font-semibold text-slate-600 text-[11px]">Telah Diterima Dari :</div>
          <div className="col-span-9 font-bold text-slate-900 text-xs">
            {patient?.fullName || "Pasien Umum"}
            {patient?.medicalRecordNumber && (
              <span className="ml-2 font-mono text-[11px] font-normal text-slate-500">
                (No. RM: {patient.medicalRecordNumber})
              </span>
            )}
          </div>
        </div>

        {doctorName && (
          <div className="grid grid-cols-12 gap-2 items-center py-1 border-b border-slate-200">
            <div className="col-span-3 font-semibold text-slate-600 text-[11px]">Dokter Menangani :</div>
            <div className="col-span-9 font-bold text-slate-900 text-xs text-emerald-800">
              {doctorName}
            </div>
          </div>
        )}

        <div className="grid grid-cols-12 gap-2 items-start py-1 border-b border-slate-200">
          <div className="col-span-3 font-semibold text-slate-600 text-[11px]">Uang Sejumlah :</div>
          <div className="col-span-9">
            <div className="text-sm font-extrabold text-teal-800 font-mono">
              {formatRupiah(payment.amount)}
            </div>
            <div className="italic text-slate-700 bg-teal-50/70 p-1.5 rounded border border-teal-100 mt-1 font-medium text-[11px]">
              "{numberToTerbilang(payment.amount)}"
            </div>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-2 items-center py-1 border-b border-slate-200">
          <div className="col-span-3 font-semibold text-slate-600 text-[11px]">Untuk Pembayaran :</div>
          <div className="col-span-9 font-medium text-slate-800 text-[11px]">
            Pembayaran Pelayanan Medis / Perawatan Gigi
            {invoiceNumber && (
              <span className="block text-slate-500 font-mono text-[10px] mt-0.5">
                Rujukan No. Faktur Tagihan: {invoiceNumber}
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-12 gap-2 items-center py-1 border-b border-slate-200">
          <div className="col-span-3 font-semibold text-slate-600 text-[11px]">Metode Pembayaran :</div>
          <div className="col-span-9 flex items-center space-x-3">
            <span className="px-2 py-0.5 rounded font-bold bg-slate-900 text-white text-[10px]">
              {payment.paymentMethod}
            </span>
            {payment.referenceNumber && (
              <span className="text-slate-600 text-[11px]">
                Ref / No. Transaksi: <span className="font-mono font-medium">{payment.referenceNumber}</span>
              </span>
            )}
          </div>
        </div>

        {payment.notes && (
          <div className="grid grid-cols-12 gap-2 items-center py-1 border-b border-slate-200">
            <div className="col-span-3 font-semibold text-slate-600 text-[11px]">Catatan :</div>
            <div className="col-span-9 text-slate-700 italic text-[11px]">{payment.notes}</div>
          </div>
        )}
      </div>

      {/* 3. Invoice Summary Status Box (if linked to an invoice) */}
      {invoice && (
        <div className="mb-5 p-3 rounded-lg bg-slate-100 border border-slate-200 text-xs">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
            Ringkasan Status Tagihan Faktur ({invoiceNumber})
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <span className="text-slate-500 block text-[10px]">Total Tagihan Bersih:</span>
              <span className="font-mono font-bold text-slate-800 text-[11px]">{formatRupiah(invoice.netAmount)}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">Total Telah Dibayar:</span>
              <span className="font-mono font-bold text-emerald-700 text-[11px]">{formatRupiah(invoice.paidAmount)}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">Sisa Tagihan Sekarang:</span>
              <span
                className={`font-mono font-bold text-[11px] ${
                  remainingOutstanding > 0 ? "text-rose-600" : "text-emerald-700"
                }`}
              >
                {formatRupiah(remainingOutstanding)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 4. Stamp and Signature Section */}
      <div className="grid grid-cols-2 gap-6 items-end text-xs mt-6">
        <div className="flex flex-col items-center justify-center p-3 border border-dashed border-teal-300 rounded-lg bg-teal-50/40">
          <div className="w-8 h-8 rounded-full bg-teal-700 text-white flex items-center justify-center font-bold text-sm mb-0.5">
            ✓
          </div>
          <div className="text-teal-900 font-extrabold uppercase tracking-widest text-xs">
            {isFullySettled ? "LUNAS / PAID" : "PEMBAYARAN DITERIMA"}
          </div>
          <div className="text-[9px] text-teal-700 mt-0.5">
            Sistem Digital {branding.name}
          </div>
        </div>

        <div className="text-center">
          <p className="text-slate-600 font-medium text-[11px]">
            {branch ? branch.name : "Jember"},{" "}
            {formatIndoDateTime(payment.transactionDateTime || payment.createdAt).split(",")[0]}
          </p>
          <p className="text-slate-500 text-[10px] mt-0.5">Petugas Kasir Administrasi,</p>
          <div className="h-16 flex items-end justify-center">
            {/* Ruang Tanda Tangan Kasir */}
          </div>
          <div className="font-bold text-slate-900 border-t border-slate-400 w-48 mx-auto pt-1.5 text-[11px]">
            ( {sanitizeStaffName(cashierName)} )
          </div>
        </div>
      </div>

      {/* Printed timestamp */}
      <div className="text-[9px] text-slate-400 text-center mt-4">
        Kwitansi tanda terima ini sah dan diterbitkan secara elektronik oleh {branding.name}
      </div>
    </div>
  );
};
