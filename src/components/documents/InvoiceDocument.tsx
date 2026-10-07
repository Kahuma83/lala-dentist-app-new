import React from "react";
import {
  Invoice,
  InvoiceItem,
  PatientProfile,
  DentalBranch,
  ClinicBranding,
  InvoiceStatus
} from "../../types/domain";
import { DocumentHeader } from "./DocumentHeader";
import {
  formatRupiah,
  formatIndoDate,
  numberToTerbilang,
  sanitizeStaffName
} from "../../utils/documentUtils";

interface InvoiceDocumentProps {
  invoice: Invoice;
  items: InvoiceItem[];
  patient?: PatientProfile | null;
  branch?: DentalBranch | null;
  branding: ClinicBranding;
  cashierName?: string;
  doctorName?: string;
}

export const InvoiceDocument: React.FC<InvoiceDocumentProps> = ({
  invoice,
  items,
  patient,
  branch,
  branding,
  cashierName = "Admin Kasir",
  doctorName
}) => {
  const invoiceNumber = invoice.invoiceNumber || invoice.id;
  const isPaid = invoice.status === InvoiceStatus.PAID;
  const isPartial = invoice.status === InvoiceStatus.PARTIALLY_PAID;
  const isCancelled = invoice.status === InvoiceStatus.CANCELLED;

  return (
    <div
      id="invoice-printable-document"
      className="bg-white text-slate-800 p-6 max-w-4xl mx-auto shadow-xs border border-slate-200 rounded-lg print:border-none print:shadow-none print:p-0 print:m-0"
      style={{ fontFamily: "'Plus Jakarta Sans', 'Segoe UI', sans-serif" }}
    >
      {/* 1. Header with Clinic Branding & Logo */}
      <DocumentHeader
        branding={branding}
        branch={branch}
        documentType="FAKTUR TAGIHAN"
        documentNumber={invoiceNumber}
        documentDate={formatIndoDate(invoice.createdAt)}
      />

      {/* 2. Patient & Treatment Info Grid */}
      <div className="grid grid-cols-2 gap-4 mb-4 p-3.5 bg-slate-50 rounded-lg border border-slate-100 text-xs">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
            Data Pasien
          </span>
          <div className="text-xs font-bold text-slate-900">{patient?.fullName || "Pasien Umum"}</div>
          <div className="text-slate-600 mt-0.5 text-[11px]">
            <span className="font-semibold text-slate-700">No. Rekam Medis (RM):</span>{" "}
            <span className="font-mono">{patient?.medicalRecordNumber || "-"}</span>
          </div>
          <div className="text-slate-600 mt-0.5 text-[11px]">
            <span className="font-semibold text-slate-700">No. WhatsApp / HP:</span>{" "}
            {patient?.phone || "-"}
          </div>
          {patient?.address && (
            <div className="text-slate-600 mt-0.5 text-[11px] truncate max-w-xs">
              <span className="font-semibold text-slate-700">Alamat:</span> {patient.address}
            </div>
          )}
        </div>

        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
            Informasi Pelayanan
          </span>
          <div className="text-slate-700 text-[11px]">
            <span className="font-semibold text-slate-800">Klinik Cabang:</span>{" "}
            {branch?.name || "Klinik Pusat"}
          </div>
          {doctorName && (
            <div className="text-slate-800 mt-0.5 text-[11px] font-medium">
              <span className="font-semibold text-slate-800">Dokter Menangani:</span>{" "}
              <span className="font-bold text-emerald-800">{doctorName}</span>
            </div>
          )}
          <div className="text-slate-700 mt-0.5 text-[11px]">
            <span className="font-semibold text-slate-800">ID Kunjungan / Visit:</span>{" "}
            <span className="font-mono">{invoice.visitId}</span>
          </div>
          <div className="mt-1.5 flex items-center space-x-2">
            <span className="font-semibold text-slate-800 text-[11px]">Status Faktur:</span>
            {isPaid ? (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                LUNAS (PAID)
              </span>
            ) : isPartial ? (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                DIBAYAR SEBAGIAN
              </span>
            ) : isCancelled ? (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                DIBATALKAN
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-100 text-sky-800 border border-sky-300">
                BELUM LUNAS (OPEN)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 3. Items Table */}
      <div className="overflow-x-auto mb-4">
        <table className="w-full text-xs text-left border-collapse">
          <thead>
            <tr className="border-b-2 border-slate-300 bg-slate-100 text-slate-700 font-bold uppercase tracking-wider text-[11px]">
              <th className="py-2 px-3 text-center w-10">No</th>
              <th className="py-2 px-3">Deskripsi Layanan / Tindakan Medis</th>
              <th className="py-2 px-3 text-center w-16">Qty</th>
              <th className="py-2 px-3 text-right w-28">Tarif Satuan</th>
              <th className="py-2 px-3 text-right w-32">Jumlah</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {items.map((item, idx) => (
              <tr key={item.id || idx} className="hover:bg-slate-50">
                <td className="py-2 px-3 text-center text-slate-500 text-[11px]">{idx + 1}</td>
                <td className="py-2 px-3 font-medium text-slate-800 text-[11px]">
                  {item.descriptionSnapshot}
                </td>
                <td className="py-2 px-3 text-center font-mono text-[11px]">{item.quantity}</td>
                <td className="py-2 px-3 text-right font-mono text-slate-600 text-[11px]">
                  {formatRupiah(item.unitPriceSnapshot)}
                </td>
                <td className="py-2 px-3 text-right font-mono font-semibold text-slate-900 text-[11px]">
                  {formatRupiah(item.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 4. Financial Summary & Terbilang */}
      <div className="grid grid-cols-12 gap-4 mb-6 items-start">
        <div className="col-span-7 bg-slate-50 p-3.5 rounded-lg border border-slate-200 text-xs">
          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
            Terbilang Total Tagihan:
          </div>
          <div className="italic text-slate-800 font-medium text-[11px]">
            "{numberToTerbilang(invoice.netAmount)}"
          </div>
          {branding.footerNote && (
            <div className="mt-3 pt-2.5 border-t border-slate-200 text-[10px] text-slate-500 leading-relaxed">
              {branding.footerNote}
            </div>
          )}
        </div>

        <div className="col-span-5 text-xs space-y-1.5">
          <div className="flex justify-between py-0.5 border-b border-slate-100 text-slate-600 text-[11px]">
            <span>Subtotal Tindakan:</span>
            <span className="font-mono font-medium">{formatRupiah(invoice.totalAmount)}</span>
          </div>
          {invoice.discountAmount > 0 && (
            <div className="flex justify-between py-0.5 border-b border-slate-100 text-emerald-700 text-[11px]">
              <span>Potongan Diskon:</span>
              <span className="font-mono font-medium">- {formatRupiah(invoice.discountAmount)}</span>
            </div>
          )}
          {invoice.taxAmount > 0 && (
            <div className="flex justify-between py-0.5 border-b border-slate-100 text-slate-600 text-[11px]">
              <span>Biaya Tambahan / Pajak:</span>
              <span className="font-mono font-medium">+ {formatRupiah(invoice.taxAmount)}</span>
            </div>
          )}
          <div className="flex justify-between py-1.5 border-b-2 border-slate-900 text-xs font-bold text-slate-900">
            <span>Total Tagihan Bersih:</span>
            <span className="font-mono text-teal-800">{formatRupiah(invoice.netAmount)}</span>
          </div>
          <div className="flex justify-between py-0.5 text-slate-600 text-[11px]">
            <span>Telah Dibayar:</span>
            <span className="font-mono font-medium text-emerald-700">{formatRupiah(invoice.paidAmount)}</span>
          </div>
          <div className="flex justify-between py-1 bg-slate-100 px-2 rounded font-bold text-slate-900 text-xs">
            <span>Sisa Tagihan (Kurang):</span>
            <span
              className={`font-mono ${
                invoice.outstandingAmount > 0 ? "text-rose-600" : "text-emerald-700"
              }`}
            >
              {formatRupiah(invoice.outstandingAmount)}
            </span>
          </div>
        </div>
      </div>

      {/* 5. Signature Block */}
      <div className="grid grid-cols-2 gap-8 text-center text-xs mt-8 pt-5 border-t border-slate-200">
        <div>
          <p className="text-slate-600 font-medium text-[11px]">Pasien / Keluarga Pasien,</p>
          <div className="h-20 flex items-end justify-center">
            {/* Ruang Tanda Tangan Pasien */}
          </div>
          <div className="font-bold text-slate-900 border-t border-slate-400 w-52 mx-auto pt-1.5 text-[11px]">
            ( {patient?.fullName || "Pasien"} )
          </div>
        </div>
        <div>
          <p className="text-slate-600 font-medium text-[11px]">Petugas Kasir Administrasi,</p>
          <div className="h-20 flex items-end justify-center">
            {/* Ruang Tanda Tangan Kasir */}
          </div>
          <div className="font-bold text-slate-900 border-t border-slate-400 w-52 mx-auto pt-1.5 text-[11px]">
            ( {sanitizeStaffName(cashierName)} )
          </div>
        </div>
      </div>

      {/* Printed timestamp */}
      <div className="text-[9px] text-slate-400 text-center mt-4">
        Dokumen ini dicetak secara sah melalui Sistem Manajemen Gigi Terpadu — {branding.name}
      </div>
    </div>
  );
};
