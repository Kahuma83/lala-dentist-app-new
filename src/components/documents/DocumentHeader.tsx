import React, { useState, useEffect } from "react";
import { ClinicBranding, DentalBranch } from "../../types/domain";
import { LalaLogo } from "../common/LalaLogo";

interface DocumentHeaderProps {
  branding: ClinicBranding;
  branch?: DentalBranch | null;
  documentType: "FAKTUR TAGIHAN" | "KWITANSI PEMBAYARAN" | "SLIP GAJI & TRANSFER BANK" | string;
  documentNumber: string;
  documentDate: string;
}

export const DocumentHeader: React.FC<DocumentHeaderProps> = ({
  branding,
  branch,
  documentType,
  documentNumber,
  documentDate
}) => {
  const [imgError, setImgError] = useState(false);

  const displayLogo = branch?.logoUrl || branding.logoUrl;
  const displayClinicName = branch?.clinicName || branding.name;
  const displayBranchName = branch?.branchName || branch?.name;
  const displayAddress = branch?.address || branding.address;
  const displayPhone = branch?.phone || branding.phone;
  const displayWhatsapp = branch?.whatsapp || branding.whatsapp;
  const displayEmail = branch?.email || branding.email;

  useEffect(() => {
    setImgError(false);
  }, [displayLogo]);

  return (
    <div className="border-b-2 border-slate-900 pb-4 mb-5">
      <div className="flex items-start justify-between">
        <div className="flex items-center space-x-3.5">
          {/* Logo container: Priority to provided logo image, fallback to crisp LalaLogo SVG */}
          <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-amber-50/60 to-white border border-[#ebd4a8] flex items-center justify-center p-1.5 shadow-xs shrink-0 overflow-hidden">
            {!imgError && displayLogo ? (
              <img
                src={displayLogo}
                alt={displayClinicName}
                className="max-h-full max-w-full object-contain"
                onError={() => setImgError(true)}
              />
            ) : (
              <LalaLogo className="w-12 h-12" />
            )}
          </div>

          <div>
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight leading-tight">
              {displayClinicName}
            </h1>
            {displayBranchName && displayBranchName !== displayClinicName && (
              <p className="text-xs text-[#8a6f27] font-bold tracking-wide uppercase">{displayBranchName}</p>
            )}
            <p className="text-xs text-slate-600 mt-0.5 max-w-md">
              {displayAddress}
            </p>
            <div className="flex items-center space-x-3 text-xs text-slate-500 mt-0.5">
              <span>Telp: {displayPhone}</span>
              {displayWhatsapp && (
                <>
                  <span>•</span>
                  <span>WA: {displayWhatsapp}</span>
                </>
              )}
              {displayEmail && (
                <>
                  <span>•</span>
                  <span>{displayEmail}</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="text-right">
          <span className="inline-block px-3 py-1 rounded bg-slate-900 text-white text-xs font-bold tracking-wider uppercase mb-1">
            {documentType}
          </span>
          <div className="text-sm font-mono font-bold text-slate-900 mt-1">
            {documentNumber}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            Tgl: {documentDate}
          </div>
        </div>
      </div>
    </div>
  );
};
