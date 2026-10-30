import React, { useState } from "react";
import { Printer, X } from "lucide-react";
import { ClinicBranding, DentalBranch, DentalDoctor } from "../../types/domain";

export type ClinicalDocumentType = "prescription" | "sick-note" | "referral";

interface DoctorClinicalDocumentExampleProps {
  type: ClinicalDocumentType;
  branch?: DentalBranch;
  branding: ClinicBranding | null;
  doctor: DentalDoctor | undefined;
  today: string;
  onClose: () => void;
}

interface ExampleFields {
  patientName: string;
  age: string;
  gender: string;
  occupation: string;
  address: string;
  phone: string;
  restDays: string;
  restStartDate: string;
  prescription: string;
  recipientDentist: string;
  recipientLocation: string;
  complaint: string;
  diagnosis: string;
  caseDetail: string;
  therapy: string;
}

const initialFields: ExampleFields = {
  patientName: "",
  age: "",
  gender: "",
  occupation: "",
  address: "",
  phone: "",
  restDays: "",
  restStartDate: "",
  prescription: "",
  recipientDentist: "",
  recipientLocation: "",
  complaint: "",
  diagnosis: "",
  caseDetail: "",
  therapy: ""
};

const documentTitles: Record<ClinicalDocumentType, string> = {
  prescription: "Contoh Resep Obat",
  "sick-note": "Contoh Surat Keterangan Sakit",
  referral: "Contoh Surat Rujukan"
};

const formatDate = (value: string) => {
  if (!value) return "........................";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Asia/Jakarta"
    }).format(date);
};

const FieldLine: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="grid grid-cols-[7rem_1fr] gap-3 border-b border-dotted border-slate-400 py-1.5 text-sm">
    <span>{label}</span>
    <span className="min-h-5 font-medium">{value || "\u00a0"}</span>
  </div>
);

const FormInput: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}> = ({ label, value, onChange, type = "text" }) => (
  <label className="block text-xs font-semibold text-slate-700">
    {label}
    <input
      type={type}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-800 outline-none transition focus:border-[#c5a059] focus:ring-2 focus:ring-[#c5a059]/20"
    />
  </label>
);

export const DoctorClinicalDocumentExample: React.FC<DoctorClinicalDocumentExampleProps> = ({
  type,
  branch,
  branding,
  doctor,
  today,
  onClose
}) => {
  const [fields, setFields] = useState(initialFields);
  const clinicName = branch?.clinicName || branding?.name || "Lala Dentist";
  const branchName = branch?.branchName || branch?.name || "";
  const address = branch?.address || branding?.address || "";
  const phone = branch?.phone || branding?.phone || "";
  const doctorName = doctor?.fullName || doctor?.name || "Dokter";
  const logo = branch?.logoUrl || branding?.logoUrl || "/logo-lala.svg";
  const changeField = (field: keyof ExampleFields) => (value: string) =>
    setFields((current) => ({ ...current, [field]: value }));

  return (
    <div
      className="doctor-clinical-document-wrapper fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-slate-950/60 p-3 backdrop-blur-sm sm:p-6 print:static print:block print:overflow-visible print:bg-white print:p-0"
      role="dialog"
      aria-modal="true"
      aria-labelledby="clinical-example-title"
    >
      <div className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-[#e8dcc3] bg-[#f7f5f0] shadow-2xl print:block print:max-h-none print:overflow-visible print:rounded-none print:border-0 print:bg-white print:shadow-none">
        <div className="modal-topbar flex items-center justify-between gap-3 border-b border-[#e8dcc3] bg-white px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <h2 id="clinical-example-title" className="truncate text-sm font-bold text-slate-900 sm:text-base">
              {documentTitles[type]}
            </h2>
            <p className="mt-0.5 text-[11px] text-slate-500">Pratinjau format berdasarkan contoh surat klinik</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-lg bg-[#8a6f27] px-3 py-2 text-xs font-bold text-white transition hover:bg-[#735b20]"
            >
              <Printer className="h-4 w-4" /> Cetak contoh
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup pratinjau"
              className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 lg:grid-cols-[minmax(260px,0.75fr)_minmax(0,1.25fr)] lg:p-6 print:block print:overflow-visible print:p-0">
          <section className="rounded-xl border border-slate-200 bg-white p-4 print:hidden">
            <h3 className="text-sm font-bold text-slate-900">Isi contoh</h3>
            <p className="mb-4 mt-1 text-xs leading-5 text-slate-500">
              Isian hanya untuk pratinjau dan tidak disimpan ke rekam medis.
            </p>
            <div className="space-y-3">
              <FormInput label="Nama pasien" value={fields.patientName} onChange={changeField("patientName")} />
              {type !== "prescription" && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <FormInput label="Umur" value={fields.age} onChange={changeField("age")} />
                    <FormInput label="Jenis kelamin" value={fields.gender} onChange={changeField("gender")} />
                  </div>
                  {type === "sick-note" && (
                    <>
                      <FormInput label="Pekerjaan" value={fields.occupation} onChange={changeField("occupation")} />
                      <FormInput label="Alamat" value={fields.address} onChange={changeField("address")} />
                      <div className="grid grid-cols-2 gap-3">
                        <FormInput label="Istirahat (hari)" type="number" value={fields.restDays} onChange={changeField("restDays")} />
                        <FormInput label="Mulai tanggal" type="date" value={fields.restStartDate} onChange={changeField("restStartDate")} />
                      </div>
                    </>
                  )}
                  {type === "referral" && (
                    <>
                      <FormInput label="Alamat pasien" value={fields.address} onChange={changeField("address")} />
                      <FormInput label="No. telepon" value={fields.phone} onChange={changeField("phone")} />
                      <FormInput label="Dokter gigi tujuan" value={fields.recipientDentist} onChange={changeField("recipientDentist")} />
                      <FormInput label="Tempat tujuan" value={fields.recipientLocation} onChange={changeField("recipientLocation")} />
                      <FormInput label="Keluhan / anamnesa" value={fields.complaint} onChange={changeField("complaint")} />
                      <FormInput label="Diagnosis sementara" value={fields.diagnosis} onChange={changeField("diagnosis")} />
                      <FormInput label="Kasus" value={fields.caseDetail} onChange={changeField("caseDetail")} />
                      <FormInput label="Terapi / obat yang diberikan" value={fields.therapy} onChange={changeField("therapy")} />
                    </>
                  )}
                </>
              )}
              {type === "prescription" && (
                <>
                  <FormInput label="Umur" value={fields.age} onChange={changeField("age")} />
                  <FormInput label="Alamat" value={fields.address} onChange={changeField("address")} />
                  <label className="block text-xs font-semibold text-slate-700">
                    Catatan resep (contoh)
                    <textarea
                      value={fields.prescription}
                      onChange={(event) => changeField("prescription")(event.target.value)}
                      rows={5}
                      placeholder="Area kosong untuk instruksi dokter"
                      className="mt-1.5 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-800 outline-none transition focus:border-[#c5a059] focus:ring-2 focus:ring-[#c5a059]/20"
                    />
                  </label>
                </>
              )}
            </div>
            <p className="mt-4 rounded-lg border border-[#eadbb9] bg-[#faf6ec] p-3 text-[11px] leading-5 text-[#735b20]">
              Ini hanya contoh tampilan. Belum menjadi dokumen resmi, belum tersimpan, dan tidak menggantikan pemeriksaan atau instruksi dokter.
            </p>
          </section>

          <div className="flex justify-center rounded-xl bg-[#e9e7e1] p-3 sm:p-6 print:block print:bg-white print:p-0">
            <article id="doctor-clinical-document" className={`relative w-full bg-white px-7 py-8 text-slate-900 shadow-md sm:px-12 sm:py-10 print:mx-auto print:shadow-none ${type === "prescription" ? "max-w-[148mm] min-h-[205mm]" : "max-w-[190mm] min-h-[265mm]"}`}>
              <div className="mb-5 border-b-2 border-slate-800 pb-3">
                <div className="flex items-center gap-3">
                  <img src={logo} alt="" className="h-14 w-14 object-contain" />
                  <div className="min-w-0 flex-1 text-center">
                    <p className="text-sm font-semibold">Praktek Dokter Gigi Bersama</p>
                    <h1 className="text-xl font-extrabold tracking-wide">{clinicName.toUpperCase()}</h1>
                    <p className="text-xs">{address}{branchName ? ` · ${branchName}` : ""}</p>
                    {phone && <p className="text-xs">Hp: {phone}</p>}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[9px]">
                  <span>{doctorName}</span>
                </div>
              </div>

              <div className="mb-5 text-center">
                <span className="inline-block border border-amber-700 px-3 py-1 text-[9px] font-bold tracking-widest text-amber-800">
                  CONTOH FORMAT · BUKAN DOKUMEN RESMI
                </span>
                {type !== "prescription" && (
                  <h2 className="mt-3 text-base font-bold underline underline-offset-4">
                    {type === "sick-note" ? "SURAT KETERANGAN SAKIT" : "SURAT RUJUKAN"}
                  </h2>
                )}
              </div>

              {type === "sick-note" && (
                <div className="space-y-5 text-sm">
                  <div>
                    <FieldLine label="Nama" value={fields.patientName} />
                    <FieldLine label="Umur" value={fields.age} />
                    <FieldLine label="Jenis Kelamin" value={fields.gender} />
                    <FieldLine label="Pekerjaan" value={fields.occupation} />
                    <FieldLine label="Alamat" value={fields.address} />
                  </div>
                  <p className="text-justify leading-7">
                    Berdasarkan pemeriksaan yang dilakukan hari ini, pasien atas nama tersebut di atas dalam kondisi sakit dan memerlukan istirahat selama{" "}
                    <span className="inline-block min-w-8 border-b border-dotted border-slate-500 text-center font-semibold">{fields.restDays || "..."}</span>{" "}
                    hari, terhitung mulai tanggal{" "}
                    <span className="font-semibold">{formatDate(fields.restStartDate)}</span>.
                  </p>
                  <p className="text-right">Jember, {formatDate(today)}</p>
                  <div className="ml-auto mt-8 w-56 text-center">
                    <p>Dokter pemeriksa,</p>
                    <div className="h-20" />
                    <p className="border-t border-slate-500 pt-1 font-semibold">{doctorName}</p>
                  </div>
                </div>
              )}

              {type === "prescription" && (
                <div className="flex min-h-[145mm] flex-col text-sm">
                  <p className="mb-4 text-2xl font-serif italic">R/</p>
                  <div className="min-h-32 whitespace-pre-wrap leading-7">{fields.prescription}</div>
                  <div className="mt-auto space-y-3 pt-8">
                    <FieldLine label="Pro" value={fields.patientName} />
                    <FieldLine label="Usia" value={fields.age} />
                    <FieldLine label="Alamat" value={fields.address} />
                    <p className="rounded-md border border-slate-700 px-3 py-2 text-center font-serif italic">
                      Obat tidak boleh diganti tanpa seizin dokter
                    </p>
                    <p className="text-center text-base font-bold italic">Semoga Anda Lekas Sembuh</p>
                    <p className="pt-2 text-right">Jember, {formatDate(today)}</p>
                    <div className="ml-auto w-56 text-center">
                      <p>Dokter,</p>
                      <div className="h-14" />
                      <p className="border-t border-slate-500 pt-1 font-semibold">{doctorName}</p>
                    </div>
                  </div>
                </div>
              )}

              {type === "referral" && (
                <div className="space-y-4 text-sm">
                  <div className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-2">
                    <span>Yth. Dokter Gigi</span><span className="border-b border-dotted border-slate-500">{fields.recipientDentist}</span>
                    <span>Di</span><span className="border-b border-dotted border-slate-500">{fields.recipientLocation}</span>
                  </div>
                  <p>Mohon pemeriksaan dan penanganan lebih lanjut terhadap penderita,</p>
                  <div>
                    <FieldLine label="Nama Pasien" value={fields.patientName} />
                    <FieldLine label="Jenis Kelamin" value={fields.gender} />
                    <FieldLine label="Umur" value={fields.age} />
                    <FieldLine label="No. Telpon" value={fields.phone} />
                    <FieldLine label="Alamat Rumah" value={fields.address} />
                  </div>
                  <div className="space-y-2">
                    <FieldLine label="Anamnesa / Keluhan" value={fields.complaint} />
                    <FieldLine label="Diagnosa sementara" value={fields.diagnosis} />
                    <FieldLine label="Kasus" value={fields.caseDetail} />
                    <FieldLine label="Terapi/obat yang telah diberikan" value={fields.therapy} />
                  </div>
                  <p className="pt-2 text-justify leading-6">
                    Demikianlah surat rujukan ini kami kirim, kami mohon balasan atas surat rujukan ini. Atas perhatian Bapak/Ibu kami ucapkan terima kasih.
                  </p>
                  <div className="ml-2 pt-2">
                    <p>Hormat kami,</p>
                    <div className="h-16" />
                    <p className="w-56 border-t border-slate-500 pt-1 font-semibold">{doctorName}</p>
                    <p className="mt-2 text-xs">Jember, {formatDate(today)}</p>
                  </div>
                </div>
              )}
            </article>
          </div>
        </div>
      </div>
    </div>
  );
};
