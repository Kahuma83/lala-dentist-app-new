import React from "react";
import {
  MonthlyPayroll,
  PayrollItem,
  Staff,
  DentalDoctor,
  DentalBranch,
  ClinicBranding
} from "../../types/domain";
import { DocumentHeader } from "./DocumentHeader";
import {
  formatRupiah,
  formatIndoDate,
  numberToTerbilang
} from "../../utils/documentUtils";
import { CheckCircle2, Building2, CreditCard, User, ShieldCheck } from "lucide-react";

interface PayslipDocumentProps {
  payroll: MonthlyPayroll;
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

export const PayslipDocument: React.FC<PayslipDocumentProps> = ({
  payroll,
  items,
  staff,
  doctor,
  branch,
  branding,
  journalNumber,
  payerName = "Manajemen Keuangan Lala Dentist"
}) => {
  const periodString = `${MONTH_NAMES[payroll.month] || payroll.month} ${payroll.year}`;
  const slipNumber = `SLIP/${branch?.branchCode || "GEB"}/${payroll.year}${String(payroll.month).padStart(2, "0")}/${payroll.id.replace(/[^0-9]/g, "").slice(-4) || "0001"}`;

  const recipientName = doctor?.name || staff?.fullName || "Pegawai Lala Dentist";
  const recipientCode = staff?.employeeCode || doctor?.doctorCode || "EMP-000";
  const recipientPosition = doctor ? (doctor.title || "Dokter Gigi") : (staff?.position || "Staf Medis / Asisten");
  const recipientPhone = doctor?.phone || staff?.phone || "-";

  // Bank Info from payroll snapshot or fallback to staff/doctor profiles
  const bankName = payroll.bankNameSnapshot || doctor?.bankName || staff?.bankName || "Bank Central Asia (BCA)";
  const bankAccountNumber = payroll.bankAccountNumberSnapshot || doctor?.bankAccountNumber || staff?.bankAccountNumber || "143-089-2231";
  const bankAccountHolder = payroll.bankAccountHolderSnapshot || doctor?.bankAccountHolder || staff?.bankAccountHolder || recipientName;

  const earnings = items.filter((i) => i.type === "EARNING");
  const deductions = items.filter((i) => i.type === "DEDUCTION");

  const totalEarningsCalculated = earnings.length > 0 
    ? earnings.reduce((acc, curr) => acc + (curr.amountSnapshot || 0), 0)
    : (payroll.baseSalary + payroll.totalCompensation);

  const totalDeductionsCalculated = deductions.length > 0
    ? deductions.reduce((acc, curr) => acc + (curr.amountSnapshot || 0), 0)
    : payroll.totalDeductions;

  const isPaid = payroll.status === "PAID";

  return (
    <div
      id="payslip-printable-document"
      className="bg-white text-slate-800 p-6 md:p-8 max-w-3xl mx-auto shadow-xs border border-slate-200 rounded-xl print:border-none print:shadow-none print:p-0 print:m-0"
      style={{ fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}
    >
      {/* 1. Header with Official Clinic Branding */}
      <DocumentHeader
        branding={branding}
        branch={branch}
        documentType="SLIP GAJI & TRANSFER BANK"
        documentNumber={slipNumber}
        documentDate={formatIndoDate(payroll.updatedAt || payroll.createdAt)}
      />

      {/* 2. Employee Info & Bank Transfer Card */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5 text-xs">
        {/* Left: Employee Info */}
        <div className="border border-slate-200 rounded-lg p-3.5 bg-slate-50/70">
          <div className="text-[11px] font-bold text-[#8a6f27] uppercase tracking-wider mb-2 flex items-center gap-1.5 border-b border-slate-200 pb-1.5">
            <User className="w-3.5 h-3.5 text-[#c5a059]" />
            Identitas Penerima Gaji
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between">
              <span className="text-slate-500 font-medium">Nama Lengkap:</span>
              <span className="font-bold text-slate-900">{recipientName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 font-medium">NIP / Kode:</span>
              <span className="font-mono font-semibold text-slate-800">{recipientCode}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 font-medium">Jabatan / Profesi:</span>
              <span className="font-semibold text-amber-900 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200/60 text-[11px]">
                {recipientPosition}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 font-medium">Penempatan Cabang:</span>
              <span className="font-medium text-slate-800">{branch?.name || "Lala Dentist Gebang"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 font-medium">No. Telepon / WA:</span>
              <span className="font-medium text-slate-700">{recipientPhone}</span>
            </div>
          </div>
        </div>

        {/* Right: Bank Transfer Account Info */}
        <div className="border border-emerald-200 bg-emerald-50/40 rounded-lg p-3.5">
          <div className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider mb-2 flex items-center justify-between border-b border-emerald-200/60 pb-1.5">
            <span className="flex items-center gap-1.5">
              <CreditCard className="w-3.5 h-3.5 text-emerald-600" />
              Rekening Transfer Bank (Slip Bank)
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-600 text-white shadow-2xs">
              <CheckCircle2 className="w-3 h-3" />
              {isPaid ? "SUDAH DITRANSFER" : "SIAP DITRANSFER"}
            </span>
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between">
              <span className="text-slate-600 font-medium">Bank Tujuan:</span>
              <span className="font-bold text-slate-900 flex items-center gap-1">
                <Building2 className="w-3 h-3 text-emerald-700 inline" />
                {bankName}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600 font-medium">Nomor Rekening:</span>
              <span className="font-mono font-bold text-emerald-950 text-[13px] tracking-wide bg-white px-2 py-0.5 rounded border border-emerald-200">
                {bankAccountNumber}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600 font-medium">Atas Nama (A.N.):</span>
              <span className="font-semibold text-slate-900">{bankAccountHolder}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600 font-medium">Periode Penggajian:</span>
              <span className="font-bold text-slate-800">{periodString}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Breakdown Table */}
      <div className="border border-slate-200 rounded-lg overflow-hidden mb-5">
        <table className="w-full text-xs text-left">
          <thead className="bg-slate-100/90 text-slate-700 font-bold border-b border-slate-200">
            <tr>
              <th className="py-2.5 px-3.5 w-10 text-center">No</th>
              <th className="py-2.5 px-3">Deskripsi Komponen Penghasilan & Komisi</th>
              <th className="py-2.5 px-3 text-center w-28">Kategori</th>
              <th className="py-2.5 px-3.5 text-right w-36">Jumlah (Rp)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {earnings.length > 0 ? (
              earnings.map((item, idx) => (
                <tr key={item.id || idx} className="hover:bg-slate-50/50">
                  <td className="py-2 px-3.5 text-center text-slate-400">{idx + 1}</td>
                  <td className="py-2 px-3 font-medium text-slate-800">
                    {item.descriptionSnapshot}
                  </td>
                  <td className="py-2 px-3 text-center">
                    <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/50">
                      Penghasilan
                    </span>
                  </td>
                  <td className="py-2 px-3.5 text-right font-mono font-semibold text-slate-900">
                    {formatRupiah(item.amountSnapshot)}
                  </td>
                </tr>
              ))
            ) : (
              <>
                <tr>
                  <td className="py-2 px-3.5 text-center text-slate-400">1</td>
                  <td className="py-2 px-3 font-medium text-slate-800">
                    Gaji Pokok / Uang Duduk {periodString}
                  </td>
                  <td className="py-2 px-3 text-center">
                    <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/50">
                      Gaji Pokok
                    </span>
                  </td>
                  <td className="py-2 px-3.5 text-right font-mono font-semibold text-slate-900">
                    {formatRupiah(payroll.baseSalary)}
                  </td>
                </tr>
                {payroll.totalCompensation > 0 && (
                  <tr>
                    <td className="py-2 px-3.5 text-center text-slate-400">2</td>
                    <td className="py-2 px-3 font-medium text-slate-800">
                      Akrual Komisi Pelayanan Medis / Asistensi Pasien
                    </td>
                    <td className="py-2 px-3 text-center">
                      <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200/50">
                        Komisi Medis
                      </span>
                    </td>
                    <td className="py-2 px-3.5 text-right font-mono font-semibold text-slate-900">
                      {formatRupiah(payroll.totalCompensation)}
                    </td>
                  </tr>
                )}
              </>
            )}

            {/* Deductions if any */}
            {deductions.map((item, idx) => (
              <tr key={item.id || `ded-${idx}`} className="bg-rose-50/20">
                <td className="py-2 px-3.5 text-center text-slate-400">
                  {earnings.length + idx + 1}
                </td>
                <td className="py-2 px-3 font-medium text-rose-900">
                  {item.descriptionSnapshot}
                </td>
                <td className="py-2 px-3 text-center">
                  <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200/50">
                    Potongan
                  </span>
                </td>
                <td className="py-2 px-3.5 text-right font-mono font-semibold text-rose-700">
                  - {formatRupiah(item.amountSnapshot)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals Summary Footer */}
        <div className="bg-slate-50 border-t border-slate-200 p-4">
          <div className="space-y-1.5 text-xs max-w-xs ml-auto">
            <div className="flex justify-between text-slate-600">
              <span>Total Penghasilan Bruto:</span>
              <span className="font-mono font-semibold text-slate-800">
                {formatRupiah(totalEarningsCalculated)}
              </span>
            </div>
            {totalDeductionsCalculated > 0 && (
              <div className="flex justify-between text-rose-600">
                <span>Total Potongan:</span>
                <span className="font-mono font-semibold">
                  - {formatRupiah(totalDeductionsCalculated)}
                </span>
              </div>
            )}
            <div className="border-t border-slate-300 pt-2 flex justify-between items-baseline">
              <span className="font-extrabold text-slate-900 text-xs uppercase tracking-tight">
                Take Home Pay (Ditransfer):
              </span>
              <span className="text-base font-extrabold text-teal-800 font-mono">
                {formatRupiah(payroll.netSalary)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Terbilang & Accounting Note Card */}
      <div className="mb-6 p-3.5 bg-amber-50/60 rounded-lg border border-amber-200/70 text-xs">
        <div className="flex items-start gap-2">
          <ShieldCheck className="w-4 h-4 text-[#aa853a] shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="text-[11px] text-[#8a6f27] font-semibold uppercase tracking-wide">
              Jumlah Terbilang:
            </div>
            <div className="text-xs font-bold text-slate-900 italic mt-0.5">
              "{numberToTerbilang(payroll.netSalary)}"
            </div>
            {journalNumber && (
              <div className="text-[11px] text-slate-600 mt-1 font-mono">
                Rujukan Jurnal Buku Besar: <span className="font-semibold text-slate-800">{journalNumber}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 5. Signatures & Digital Authorization Block */}
      <div className="grid grid-cols-2 gap-6 pt-4 border-t border-slate-200 text-center text-xs">
        <div>
          <p className="text-slate-500 font-medium text-[11px]">Penerima Gaji,</p>
          <div className="h-16 flex items-center justify-center">
            <span className="text-[11px] text-slate-400 italic">( Tanda Tangan Pegawai )</span>
          </div>
          <p className="font-bold text-slate-900 border-t border-slate-300 pt-1 inline-block min-w-[160px]">
            {recipientName}
          </p>
          <p className="text-[10px] text-slate-500">{recipientPosition}</p>
        </div>

        <div>
          <p className="text-slate-500 font-medium text-[11px]">
            {branch?.name || "Lala Dentist"} - Manajemen Keuangan,
          </p>
          <div className="h-16 flex flex-col items-center justify-center">
            <div className="w-10 h-10 rounded-full border-2 border-dashed border-emerald-400 bg-emerald-50 flex items-center justify-center text-emerald-700 font-mono text-[9px] font-bold">
              VERIFIED
            </div>
          </div>
          <p className="font-bold text-slate-900 border-t border-slate-300 pt-1 inline-block min-w-[160px]">
            {payerName}
          </p>
          <p className="text-[10px] text-slate-500">Finance & Payroll Officer</p>
        </div>
      </div>

      {/* 6. Footer Legal Note */}
      <div className="mt-6 pt-3 border-t border-slate-100 text-center text-[10px] text-slate-400">
        Slip gaji ini digenerate secara resmi melalui Sistem Informasi Manajemen Terpadu {branding.name}. Harap simpan dokumen ini sebagai bukti pembayaran dan transfer bank yang sah.
      </div>
    </div>
  );
};
