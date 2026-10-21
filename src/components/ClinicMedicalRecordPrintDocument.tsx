import React from "react";
import {
  MedicalRecord,
  OdontogramTooth,
  PatientMedicalProfile,
  PatientProfile,
  PatientVisit
} from "../types/domain";
import "./ClinicMedicalRecordPrintDocument.css";

const PERMANENT_UPPER = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const PRIMARY_UPPER = [55, 54, 53, 52, 51, 61, 62, 63, 64, 65];
const PRIMARY_LOWER = [85, 84, 83, 82, 81, 71, 72, 73, 74, 75];
const PERMANENT_LOWER = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];

interface ClinicMedicalRecordPrintDocumentProps {
  patient: PatientProfile;
  visit: PatientVisit;
  profile: PatientMedicalProfile;
  record: Pick<
    MedicalRecord,
    | "chiefComplaint"
    | "anamnesis"
    | "clinicalExamination"
    | "diagnosis"
    | "diagnosisCode"
    | "treatmentPlan"
    | "doctorNotes"
    | "odontogram"
    | "clinicFormData"
  >;
  doctorName: string;
}

const formatDate = (value?: string) => {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("id-ID", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
      }).format(date);
};

const assessmentLabels: Record<string, Record<string, string>> = {
  occlusion: { NORMAL: "Normal Bite", CROSS_BITE: "Cross Bite", DEEP_BITE: "Deep Bite" },
  torusPalatinus: {
    NONE: "Tidak Ada",
    SMALL: "Kecil",
    MEDIUM: "Sedang",
    LARGE: "Besar",
    MULTIPLE: "Multiple"
  },
  torusMandibularis: { NONE: "Tidak Ada", LEFT: "Sisi Kiri", RIGHT: "Sisi Kanan", BOTH: "Kedua Sisi" },
  palate: { DALAM: "Dalam", SEDANG: "Sedang", RENDAH: "Rendah" }
};

function valueOrDash(value?: string | number | null) {
  return value === undefined || value === null || String(value).trim() === "" ? "-" : String(value);
}

function ToothMark({ number, tooth }: { number: number; tooth?: OdontogramTooth }) {
  const condition = tooth?.condition || Object.values(tooth?.surfaces || {}).find(Boolean);
  const color = condition === "caries" || condition === "extraction_indicated"
    ? "#c62828"
    : condition
      ? "#245b9e"
      : "#fff";

  return (
    <div className="clinic-print-tooth">
      <span>{number}</span>
      <svg viewBox="0 0 40 40" aria-hidden="true">
        <path d="M8 3 Q20 -1 32 3 Q39 8 36 20 Q34 32 27 37 Q20 41 13 37 Q6 32 4 20 Q1 8 8 3Z" fill={condition ? color : "white"} fillOpacity={condition ? 0.35 : 1} stroke="#222" strokeWidth="1.5" />
        <path d="M2 2 L38 38 M38 2 L2 38" stroke={condition === "missing" ? "#222" : "transparent"} strokeWidth="2" />
      </svg>
    </div>
  );
}

export const ClinicMedicalRecordPrintDocument: React.FC<ClinicMedicalRecordPrintDocumentProps> = ({
  patient,
  visit,
  profile,
  record,
  doctorName
}) => {
  const assessment = record.clinicFormData?.dentalAssessment || {};
  const odontogramTeeth = record.odontogram?.teeth || {};
  const historyAndExam = [
    record.chiefComplaint ? `Keluhan: ${record.chiefComplaint}` : "",
    record.anamnesis,
    record.clinicalExamination
  ].filter((item) => item?.trim()).join("\n");
  const treatmentText = [record.treatmentPlan, record.doctorNotes].filter((item) => item?.trim()).join("\n");
  const medicalDate = formatDate(visit.visitDateTime);

  return (
    <div className="clinic-medical-print">
      <section className="clinic-print-page">
        <header className="clinic-print-header">
          <img className="clinic-print-logo" src="/logo-lala.png" alt="Lala Dentist" />
          <div className="clinic-print-brand">
            <h1>Praktek Dokter Gigi Bersama<br /><strong>LALA DENTIST</strong></h1>
            <p>Jl. Kaca Piring (Ruko Kamajaya No. 5) Jember</p>
            <p>Hp : 0822 8383 1742</p>
          </div>
          <div className="clinic-print-doctors">
            <div>• drg. Siti Muthola'ah</div>
            <div>• drg. Syafira Dwi Astuti</div>
            <div>• drg. Maulida Yuni Lestari</div>
            <div>• drg. Benedicta Regina Phoebe</div>
          </div>
        </header>

        <div className="clinic-print-patient-fields">
          {[
            ["No. Rekam Medis", patient.medicalRecordNumber],
            ["Nama", patient.fullName || patient.name],
            ["Tempat/Tanggal Lahir", [patient.placeOfBirth, formatDate(patient.dateOfBirth)].filter(Boolean).join(" / ")],
            ["Jenis Kelamin", patient.gender === "L" ? "Laki-laki" : "Perempuan"],
            ["Pekerjaan", patient.occupation],
            ["Alamat", patient.address],
            ["Telepon", patient.phone],
            ["Gol. Darah", profile.bloodType],
            ["Penyakit Bawaan", profile.congenitalDiseases || profile.systemicDiseases],
            ["Alergi Obat-Obatan", profile.medicationAllergies || profile.allergies],
            ["Alergi Makanan", profile.foodAllergies]
          ].map(([label, value]) => (
            <div className="clinic-print-patient-line" key={label}>
              <strong>{label}</strong><span>:</span><span className="clinic-print-dotted-value">{valueOrDash(value)}</span>
            </div>
          ))}
        </div>

        <h2 className="clinic-print-title">REKAM MEDIS RAWAT JALAN PERIKSA GIGI</h2>
        <table className="clinic-print-visit-table">
          <colgroup>
            <col className="clinic-print-date-col" />
            <col className="clinic-print-history-col" />
            <col className="clinic-print-diagnosis-col" />
            <col className="clinic-print-treatment-col" />
            <col className="clinic-print-b-col" />
            <col className="clinic-print-l-col" />
            <col className="clinic-print-sign-col" />
          </colgroup>
          <thead>
            <tr>
              <th rowSpan={2}>TGL</th>
              <th rowSpan={2}>ANAMNESA &amp;<br />PEMERIKSAAN FISIK</th>
              <th>DIAGNOSA</th>
              <th>TERAPI</th>
              <th colSpan={2}>KET</th>
              <th rowSpan={2}>PARAF<br />DR</th>
            </tr>
            <tr>
              <th>KODE ICD<br />10</th>
              <th>TINDAKAN</th>
              <th>B</th>
              <th>L</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{medicalDate}</td>
              <td className="clinic-print-pre-wrap">{historyAndExam || record.chiefComplaint || ""}</td>
              <td className="clinic-print-pre-wrap">
                {record.diagnosis}
                {record.diagnosisCode ? `\n${record.diagnosisCode}` : ""}
              </td>
              <td className="clinic-print-pre-wrap">{treatmentText}</td>
              <td className="clinic-print-pre-wrap">{record.clinicFormData?.noteB || ""}</td>
              <td className="clinic-print-pre-wrap">{record.clinicFormData?.noteL || ""}</td>
              <td className="clinic-print-doctor-sign">{doctorName}</td>
            </tr>
          </tbody>
        </table>
        <div className="clinic-print-page-number">LALA DENTIST · REKAM MEDIS PASIEN</div>
      </section>

      <section className="clinic-print-page clinic-print-odontogram-page">
        <h1 className="clinic-print-odontogram-title">FORMULIR PEMERIKSAAN ODONTOGRAM</h1>
        <div className="clinic-print-odontogram-meta">
          <div><strong>NAMA LENGKAP</strong><span>:</span><span>{valueOrDash(patient.fullName || patient.name)}</span></div>
          <div><strong>JENIS KELAMIN</strong><span>:</span><span>{patient.gender === "L" ? "L" : "P"}</span></div>
          <div><strong>NO. REGISTER</strong><span>:</span><span>{valueOrDash(patient.medicalRecordNumber)}</span></div>
          <div><strong>TANGGAL LAHIR</strong><span>:</span><span>{formatDate(patient.dateOfBirth)}</span></div>
        </div>

        <div className="clinic-print-tooth-chart">
          <div className="clinic-print-tooth-row clinic-print-permanent">
            {PERMANENT_UPPER.map((number) => <ToothMark key={number} number={number} tooth={odontogramTeeth[String(number)]} />)}
          </div>
          <div className="clinic-print-tooth-row clinic-print-primary">
            {PRIMARY_UPPER.map((number) => <ToothMark key={number} number={number} tooth={odontogramTeeth[String(number)]} />)}
          </div>
          <div className="clinic-print-tooth-row clinic-print-primary">
            {PRIMARY_LOWER.map((number) => <ToothMark key={number} number={number} tooth={odontogramTeeth[String(number)]} />)}
          </div>
          <div className="clinic-print-tooth-row clinic-print-permanent">
            {PERMANENT_LOWER.map((number) => <ToothMark key={number} number={number} tooth={odontogramTeeth[String(number)]} />)}
          </div>
        </div>

        <div className="clinic-print-assessment-lines">
          <div><strong>Occlusi</strong><span>:</span>{assessmentLabels.occlusion[assessment.occlusion || ""] || "Normal Bite / Cross Bite / Deep Bite"}</div>
          <div><strong>Torus Palatinus</strong><span>:</span>{assessmentLabels.torusPalatinus[assessment.torusPalatinus || ""] || "Tidak Ada / Kecil / Sedang / Besar / Multiple"}</div>
          <div><strong>Torus Mandibularis</strong><span>:</span>{assessmentLabels.torusMandibularis[assessment.torusMandibularis || ""] || "Tidak Ada / Sisi Kiri / Sisi Kanan / Kedua Sisi"}</div>
          <div><strong>Palatum</strong><span>:</span>{assessmentLabels.palate[assessment.palate || ""] || "Dalam / Sedang / Rendah"}</div>
          <div><strong>Diastema</strong><span>:</span>{assessment.diastemaPresent === undefined ? "Tidak Ada / Ada" : assessment.diastemaPresent ? `Ada → ${assessment.diastemaNotes || ""}` : "Tidak Ada"}</div>
          <div><strong>Gigi Anomali</strong><span>:</span>{assessment.gingivalAnomalyPresent === undefined ? "Tidak Ada / Ada" : assessment.gingivalAnomalyPresent ? `Ada → ${assessment.gingivalAnomalyNotes || ""}` : "Tidak Ada"}</div>
          <div><strong>Lain - Lain</strong><span>:</span>{valueOrDash(assessment.otherNotes)}</div>
          <div className="clinic-print-dmf"><span>D: {valueOrDash(assessment.d)}</span><span>M: {valueOrDash(assessment.m)}</span><span>F: {valueOrDash(assessment.f)}</span></div>
        </div>

        <div className="clinic-print-signatures">
          <div><strong>DIPERIKSA OLEH :</strong><span>{doctorName}</span></div>
          <div><strong>TANGGAL PEMERIKSAAN :</strong><span>{medicalDate}</span></div>
          <div><strong>TTD PEMERIKSA:</strong><span></span></div>
        </div>
        <div className="clinic-print-page-number">LALA DENTIST · FORMULIR PEMERIKSAAN ODONTOGRAM</div>
      </section>
    </div>
  );
};
