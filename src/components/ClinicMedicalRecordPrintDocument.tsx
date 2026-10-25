import React from "react";
import {
  MedicalRecord,
  DentalBranch,
  DentalDoctor,
  OdontogramCondition,
  OdontogramSurface,
  OdontogramTooth,
  PatientMedicalProfile,
  PatientProfile,
  PatientVisit
} from "../types/domain";
import "./ClinicMedicalRecordPrintDocument.css";
import { getPatientMedicalRecordNumber } from "../utils/rmUtils";
import {
  ANTERIOR_TOOTH_DIVIDER_PATH,
  getOdontogramSurfaceShapes,
  usesAnteriorOdontogramPattern
} from "./odontogramToothShapes";

const PERMANENT_UPPER = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const PRIMARY_UPPER = [55, 54, 53, 52, 51, 61, 62, 63, 64, 65];
const PRIMARY_LOWER = [85, 84, 83, 82, 81, 71, 72, 73, 74, 75];
const PERMANENT_LOWER = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
const UPPER_TOOTH_NOTES = [
  ["11 (51)", "(16) 21"],
  ["12 (52)", "(62) 22"],
  ["13 (53)", "(63) 23"],
  ["14 (54)", "(64) 24"],
  ["15 (55)", "(65) 25"],
  ["16", "26"],
  ["17", "27"],
  ["18", "28"]
];
const LOWER_TOOTH_NOTES = [
  ["48", "38"],
  ["47", "37"],
  ["46", "36"],
  ["45 (85)", "(75) 35"],
  ["44 (84)", "(74) 34"],
  ["43 (83)", "(73) 33"],
  ["42 (82)", "(72) 32"],
  ["41 (81)", "(71) 31"]
];
const PRINT_CONDITION_COLORS: Record<OdontogramCondition, string> = {
  caries: "#ef4444",
  filling: "#3b82f6",
  crown: "#8b5cf6",
  root_canal: "#f59e0b",
  missing: "#64748b",
  extraction_indicated: "#ec4899"
};
const PRINT_CONDITION_LABELS: Record<OdontogramCondition, string> = {
  caries: "Karies",
  filling: "Tumpatan",
  crown: "Mahkota",
  root_canal: "Perawatan saluran akar",
  missing: "Hilang",
  extraction_indicated: "Indikasi ekstraksi"
};
const PRINT_SURFACE_LABELS: Record<OdontogramSurface, string> = {
  O: "O",
  M: "M",
  D: "D",
  B: "B",
  L: "L"
};

interface ClinicMedicalRecordPrintDocumentProps {
  patient: PatientProfile;
  visit: PatientVisit;
  branch?: DentalBranch;
  doctor?: DentalDoctor;
  branchDoctors?: DentalDoctor[];
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

function toothFinding(toothNumber: string, tooth?: OdontogramTooth) {
  if (!tooth) return "";
  if (tooth.condition) return `${toothNumber}: ${PRINT_CONDITION_LABELS[tooth.condition]}`;

  const surfacesByCondition = new Map<OdontogramCondition, OdontogramSurface[]>();
  for (const [surface, condition] of Object.entries(tooth.surfaces || {}) as Array<[OdontogramSurface, OdontogramCondition | undefined]>) {
    if (!condition) continue;
    const surfaces = surfacesByCondition.get(condition) || [];
    surfaces.push(surface);
    surfacesByCondition.set(condition, surfaces);
  }

  const findings = Array.from(surfacesByCondition.entries()).map(([condition, surfaces]) =>
    `${PRINT_CONDITION_LABELS[condition]} (${surfaces.map((surface) => PRINT_SURFACE_LABELS[surface]).join(", ")})`
  );
  return findings.length > 0 ? `${toothNumber}: ${findings.join("; ")}` : "";
}

function toothRowFinding(label: string, teeth: Record<string, OdontogramTooth>) {
  return Array.from(label.matchAll(/\d{2}/g))
    .map(([toothNumber]) => toothFinding(toothNumber, teeth[toothNumber]))
    .filter(Boolean)
    .join("; ");
}

function ToothMark({
  number,
  tooth,
  labelPosition = "top"
}: {
  number: number;
  tooth?: OdontogramTooth;
  labelPosition?: "top" | "bottom";
}) {
  const surfaceShapes = getOdontogramSurfaceShapes(number);
  const anteriorPattern = usesAnteriorOdontogramPattern(number);

  return (
    <div className={`clinic-print-tooth${labelPosition === "bottom" ? " clinic-print-tooth-label-bottom" : ""}`}>
      <span className="clinic-print-tooth-number">{number}</span>
      <svg viewBox="0 0 40 40" aria-hidden="true">
          {(Object.keys(surfaceShapes) as OdontogramSurface[]).map((surface) => {
            const condition = tooth?.condition || tooth?.surfaces?.[surface];
            return (
              <polygon
                key={surface}
                points={surfaceShapes[surface]}
                fill={condition ? PRINT_CONDITION_COLORS[condition] : "white"}
                fillOpacity={condition ? 0.75 : 1}
                stroke={anteriorPattern ? "none" : "#222"}
                strokeWidth="1"
              />
            );
          })}
        {anteriorPattern && (
          <path
            d={ANTERIOR_TOOTH_DIVIDER_PATH}
            fill="none"
            stroke="#222"
            strokeWidth="1"
            pointerEvents="none"
          />
        )}
        <path d="M0 0 H40 V40 H0 Z" fill="none" stroke="#222" strokeWidth="1.5" />
        {tooth?.condition === "missing" && (
          <path d="M8 8 L32 32 M32 8 L8 32" stroke="#222" strokeWidth="2" />
        )}
      </svg>
    </div>
  );
}

function ToothMidlineMark({ direction }: { direction: "up" | "down" }) {
  return (
    <span className="clinic-print-tooth-midline" aria-hidden="true">
      {direction === "down" ? "▼" : "▲"}
    </span>
  );
}

export const ClinicMedicalRecordPrintDocument: React.FC<ClinicMedicalRecordPrintDocumentProps> = ({
  patient,
  visit,
  branch,
  doctor,
  branchDoctors = [],
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
  const printedDoctorName = doctor?.fullName || doctor?.name || doctorName;

  return (
    <div className="clinic-medical-print">
      <section className="clinic-print-page">
        <header className="clinic-print-header">
          <img
            className="clinic-print-logo"
            src={branch?.logoUrl || "/logo-lala.svg"}
            alt="Lala Dentist"
            onError={(event) => {
              const image = event.currentTarget;
              if (image.getAttribute("src") !== "/logo-lala.svg") {
                image.src = "/logo-lala.svg";
              }
            }}
          />
          <div className="clinic-print-brand">
            <h1>Praktek Dokter Gigi Bersama<br /><strong>LALA DENTIST</strong></h1>
            <p>{branch?.address || "Alamat cabang belum diatur"}</p>
            <p>Telp: {branch?.phone || "-"}</p>
          </div>
          <div className="clinic-print-doctors">
            {branchDoctors.map((branchDoctor) => (
              <div key={branchDoctor.id}>{branchDoctor.fullName || branchDoctor.name}</div>
            ))}
          </div>
        </header>

        <div className="clinic-print-patient-fields">
          {[
            ["No. Rekam Medis", getPatientMedicalRecordNumber(patient, visit.branchId)],
            ["Nama", patient.fullName || patient.name],
            ["Tempat/Tanggal Lahir", [patient.placeOfBirth, formatDate(patient.dateOfBirth)].filter(Boolean).join(" / ")],
            ["Jenis Kelamin", patient.gender === "L" ? "Laki-laki" : patient.gender === "P" ? "Perempuan" : "Belum diketahui"],
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
          <div><strong>JENIS KELAMIN</strong><span>:</span><span>{patient.gender || "-"}</span></div>
          <div><strong>NO. REGISTER</strong><span>:</span><span>{valueOrDash(getPatientMedicalRecordNumber(patient, visit.branchId))}</span></div>
          <div><strong>TANGGAL LAHIR</strong><span>:</span><span>{formatDate(patient.dateOfBirth)}</span></div>
        </div>

        <table className="clinic-print-tooth-notes clinic-print-upper-tooth-notes">
          <tbody>
            {UPPER_TOOTH_NOTES.map(([left, right]) => (
              <tr key={left}>
                <th>{left}</th>
                <td>{toothRowFinding(left, odontogramTeeth)}</td>
                <td>{toothRowFinding(right, odontogramTeeth)}</td>
                <th>{right}</th>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="clinic-print-tooth-chart">
          <div className="clinic-print-tooth-row clinic-print-permanent">
            {PERMANENT_UPPER.map((number, index) => (
              <React.Fragment key={number}>
                {index === 8 && <ToothMidlineMark direction="down" />}
                <ToothMark number={number} tooth={odontogramTeeth[String(number)]} />
              </React.Fragment>
            ))}
          </div>
          <div className="clinic-print-tooth-row clinic-print-primary">
            {PRIMARY_UPPER.map((number) => <ToothMark key={number} number={number} tooth={odontogramTeeth[String(number)]} />)}
          </div>
          <div className="clinic-print-tooth-row clinic-print-midline-arrows" aria-hidden="true">
            <svg viewBox="0 0 12 20">
              <path d="M6 0 2.5 5h2.25v3h2.5V5H9.5L6 0Zm0 20 3.5-5H7.25v-3h-2.5v3H2.5L6 20Z" />
            </svg>
          </div>
          <div className="clinic-print-tooth-row clinic-print-primary">
            {PRIMARY_LOWER.map((number) => <ToothMark key={number} number={number} tooth={odontogramTeeth[String(number)]} labelPosition="bottom" />)}
          </div>
          <div className="clinic-print-tooth-row clinic-print-permanent">
            {PERMANENT_LOWER.map((number, index) => (
              <React.Fragment key={number}>
                {index === 8 && <ToothMidlineMark direction="up" />}
                <ToothMark number={number} tooth={odontogramTeeth[String(number)]} labelPosition="bottom" />
              </React.Fragment>
            ))}
          </div>
        </div>

        <table className="clinic-print-tooth-notes clinic-print-lower-tooth-notes">
          <tbody>
            {LOWER_TOOTH_NOTES.map(([left, right]) => (
              <tr key={left}>
                <th>{left}</th>
                <td>{toothRowFinding(left, odontogramTeeth)}</td>
                <td>{toothRowFinding(right, odontogramTeeth)}</td>
                <th>{right}</th>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="clinic-print-assessment-lines">
          <div><strong>Occlusi</strong><span>:</span>{assessmentLabels.occlusion[assessment.occlusion || ""] || "-"}</div>
          <div><strong>Torus Palatinus</strong><span>:</span>{assessmentLabels.torusPalatinus[assessment.torusPalatinus || ""] || "-"}</div>
          <div><strong>Torus Mandibularis</strong><span>:</span>{assessmentLabels.torusMandibularis[assessment.torusMandibularis || ""] || "-"}</div>
          <div><strong>Palatum</strong><span>:</span>{assessmentLabels.palate[assessment.palate || ""] || "-"}</div>
          <div><strong>Diastema</strong><span>:</span>{assessment.diastemaPresent === undefined ? "-" : assessment.diastemaPresent ? `Ada → ${assessment.diastemaNotes || ""}` : "Tidak Ada"}</div>
          <div><strong>Gigi Anomali</strong><span>:</span>{assessment.gingivalAnomalyPresent === undefined ? "-" : assessment.gingivalAnomalyPresent ? `Ada → ${assessment.gingivalAnomalyNotes || ""}` : "Tidak Ada"}</div>
          <div><strong>Lain - Lain</strong><span>:</span>{valueOrDash(assessment.otherNotes)}</div>
          <div className="clinic-print-dmf"><span>D: {valueOrDash(assessment.d)}</span><span>M: {valueOrDash(assessment.m)}</span><span>F: {valueOrDash(assessment.f)}</span></div>
        </div>

        <div className="clinic-print-signatures">
          <div><strong>DIPERIKSA OLEH :</strong><span>{printedDoctorName}</span><small>SIP: {doctor?.sip || "-"}</small></div>
          <div><strong>TANGGAL PEMERIKSAAN :</strong><span>{medicalDate}</span></div>
          <div><strong>TTD PEMERIKSA:</strong><span className="clinic-print-signature-space"></span><small>{printedDoctorName}<br />SIP: {doctor?.sip || "-"}</small></div>
        </div>
        <div className="clinic-print-page-number">LALA DENTIST · FORMULIR PEMERIKSAAN ODONTOGRAM</div>
      </section>
    </div>
  );
};
