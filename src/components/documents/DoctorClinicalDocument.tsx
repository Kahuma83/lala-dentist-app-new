import React, { useEffect, useMemo, useState } from "react";
import { Printer, Save, X } from "lucide-react";
import { useApp } from "../../context/AppContext";
import {
  ClinicalVisitDocument,
  ClinicalVisitDocumentType,
  ClinicBranding,
  DentalBranch,
  DentalDoctor,
  PatientProfile,
  PrescriptionMedicine,
  UserRole
} from "../../types/domain";

export type ClinicalDocumentType = "prescription" | "sick-note" | "referral";

interface DoctorClinicalDocumentProps {
  type: ClinicalDocumentType;
  visitId: string;
  initialDocumentId?: string;
  initialComplaint?: string;
  patient: PatientProfile;
  branch?: DentalBranch;
  branding: ClinicBranding | null;
  doctor: DentalDoctor | undefined;
  today: string;
  onClose: () => void;
}

type ClinicalDocumentFields = Record<string, string> & {
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
};

interface PrescriptionDraftItem {
  medicineId: string;
  medicineName: string;
  brandName: string;
  strength: string;
  dosageForm: string;
  dose: string;
  route: string;
  frequency: string;
  duration: string;
  quantity: string;
  instructions: string;
}

const createEmptyPrescriptionItem = (): PrescriptionDraftItem => ({
  medicineId: "",
  medicineName: "",
  brandName: "",
  strength: "",
  dosageForm: "",
  dose: "",
  route: "",
  frequency: "",
  duration: "",
  quantity: "",
  instructions: ""
});

const parsePrescriptionItems = (value?: string): PrescriptionDraftItem[] => {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === "object" && !Array.isArray(item)
      )
      .filter((item) => typeof item.medicineName === "string")
      .map((item) => ({
        medicineId: typeof item.medicineId === "string" ? item.medicineId : "",
        medicineName: typeof item.medicineName === "string" ? item.medicineName : "",
        brandName: typeof item.brandName === "string" ? item.brandName : "",
        strength: typeof item.strength === "string" ? item.strength : "",
        dosageForm: typeof item.dosageForm === "string" ? item.dosageForm : "",
        dose: typeof item.dose === "string" ? item.dose : "",
        route: typeof item.route === "string" ? item.route : "",
        frequency: typeof item.frequency === "string" ? item.frequency : "",
        duration: typeof item.duration === "string" ? item.duration : "",
        quantity: typeof item.quantity === "string" ? item.quantity : "",
        instructions: typeof item.instructions === "string" ? item.instructions : ""
      }));
  } catch {
    return [];
  }
};

const formatPrescriptionItems = (items: PrescriptionDraftItem[]) => items
  .filter((item) => item.medicineName.trim())
  .map((item, index) => {
    const medicine = [
      item.medicineName.trim(),
      item.brandName.trim() ? `(${item.brandName.trim()})` : "",
      item.strength.trim(),
      item.dosageForm.trim()
    ]
      .filter(Boolean)
      .join(" ");
    const directions = [
      item.dose.trim(),
      item.route.trim(),
      item.frequency.trim(),
      item.duration.trim()
    ].filter(Boolean).join(" · ");
    return [
      `${index + 1}. ${medicine}`,
      `   Aturan pakai: ${directions}`,
      item.quantity.trim() ? `   Jumlah: ${item.quantity.trim()}` : "",
      item.instructions.trim() ? `   Catatan: ${item.instructions.trim()}` : ""
    ].filter(Boolean).join("\n");
  })
  .filter(Boolean)
  .join("\n\n");

const typeToDocumentType: Record<ClinicalDocumentType, ClinicalVisitDocumentType> = {
  prescription: "PRESCRIPTION",
  "sick-note": "SICK_NOTE",
  referral: "REFERRAL"
};

const documentTitles: Record<ClinicalDocumentType, string> = {
  prescription: "Resep Obat",
  "sick-note": "Surat Keterangan Sakit",
  referral: "Surat Rujukan"
};

const calculateAge = (dateOfBirth: string, today: string) => {
  if (!dateOfBirth) return "";
  const birth = new Date(`${dateOfBirth}T00:00:00`);
  const current = new Date(`${today}T00:00:00`);
  if (Number.isNaN(birth.getTime()) || Number.isNaN(current.getTime()) || birth > current) return "";
  let age = current.getFullYear() - birth.getFullYear();
  if (
    current.getMonth() < birth.getMonth() ||
    (current.getMonth() === birth.getMonth() && current.getDate() < birth.getDate())
  ) {
    age -= 1;
  }
  return String(age);
};

const createInitialFields = (
  patient: PatientProfile,
  today: string,
  complaint: string,
  diagnosis = ""
): ClinicalDocumentFields => ({
  patientName: patient.fullName || patient.name,
  age: calculateAge(patient.dateOfBirth, today),
  gender: patient.gender === "L" ? "Laki-laki" : patient.gender === "P" ? "Perempuan" : "",
  occupation: patient.occupation || "",
  address: patient.address || "",
  phone: patient.phone || "",
  restDays: "",
  restStartDate: today,
  prescription: "",
  recipientDentist: "",
  recipientLocation: "",
  complaint,
  diagnosis,
  caseDetail: "",
  therapy: ""
});

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

const formatDateTime = (value: string) => new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Jakarta"
}).format(new Date(value));

const FieldLine: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="grid grid-cols-[7rem_1fr] gap-3 border-b border-dotted border-slate-400 py-1.5 text-sm">
    <span>{label}</span>
    <span className="min-h-5 whitespace-pre-wrap font-medium">{value || "\u00a0"}</span>
  </div>
);

const FormInput: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  readOnly?: boolean;
}> = ({ label, value, onChange, type = "text", readOnly = false }) => (
  <label className="block text-xs font-semibold text-slate-700">
    {label}
    <input
      type={type}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      readOnly={readOnly}
      className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-800 outline-none transition focus:border-[#c5a059] focus:ring-2 focus:ring-[#c5a059]/20 read-only:bg-slate-50"
    />
  </label>
);

const FormTextArea: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  readOnly?: boolean;
  placeholder?: string;
}> = ({ label, value, onChange, rows = 4, readOnly = false, placeholder }) => (
  <label className="block text-xs font-semibold text-slate-700">
    {label}
    <textarea
      value={value}
      onChange={(event) => onChange(event.target.value)}
      rows={rows}
      readOnly={readOnly}
      placeholder={placeholder}
      className="mt-1.5 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-800 outline-none transition focus:border-[#c5a059] focus:ring-2 focus:ring-[#c5a059]/20 read-only:bg-slate-50"
    />
  </label>
);

export const DoctorClinicalDocument: React.FC<DoctorClinicalDocumentProps> = ({
  type,
  visitId,
  initialDocumentId,
  initialComplaint = "",
  patient,
  branch,
  branding,
  doctor,
  today,
  onClose
}) => {
  const { currentUser, repos } = useApp();
  const canCreateDocument = currentUser?.role === UserRole.DOCTOR;
  const [fields, setFields] = useState(() => createInitialFields(patient, today, initialComplaint));
  const [documents, setDocuments] = useState<ClinicalVisitDocument[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<ClinicalVisitDocument | null>(null);
  const [prescriptionItems, setPrescriptionItems] = useState<PrescriptionDraftItem[]>(
    () => type === "prescription" ? [createEmptyPrescriptionItem()] : []
  );
  const [medicineCatalog, setMedicineCatalog] = useState<PrescriptionMedicine[]>([]);
  const [medicineSearch, setMedicineSearch] = useState("");
  const [medicineLoadError, setMedicineLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const clinicName = branch?.clinicName || branding?.name || "Lala Dentist";
  const branchName = branch?.branchName || branch?.name || "";
  const address = branch?.address || branding?.address || "";
  const phone = branch?.phone || branding?.phone || "";
  const doctorName = doctor?.fullName || doctor?.name || "Dokter";
  const logo = branch?.logoUrl || branding?.logoUrl || "/logo-lala.svg";
  const currentDocumentType = typeToDocumentType[type];
  const matchingDocuments = useMemo(
    () => documents.filter((document) => document.type === currentDocumentType),
    [currentDocumentType, documents]
  );
  const isReadOnly = selectedDocument !== null;
  const prescriptionDisplay = prescriptionItems.length
    ? formatPrescriptionItems(prescriptionItems)
    : fields.prescription;
  const completedPrescriptionItems = prescriptionItems.filter((item) => item.medicineName.trim());
  const documentClinicName = fields.__clinicName || clinicName;
  const documentBranchName = fields.__branchName || branchName;
  const documentAddress = fields.__clinicAddress || address;
  const documentPhone = fields.__clinicPhone || phone;
  const documentDoctorName = fields.__doctorName || doctorName;
  const documentDoctorSip = fields.__doctorSip || doctor?.sip || "";
  const documentLogo = fields.__logoUrl || logo;
  const documentDate = fields.__issuedDate || today;

  useEffect(() => {
    if (!currentUser) {
      setLoadError("Sesi pengguna tidak tersedia.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    void Promise.all([
      repos.medicalRecord.getClinicalVisitDocuments(
        visitId,
        currentUser.role,
        currentUser.assignedBranchId
      ),
      repos.medicalRecord.getMedicalRecordByVisit(
        visitId,
        currentUser.role,
        currentUser.assignedBranchId
      )
    ]).then(([savedDocuments, record]) => {
      if (cancelled) return;
      setDocuments(savedDocuments);
      if (initialDocumentId) {
        const existingDocument = savedDocuments.find((document) => document.id === initialDocumentId);
        if (!existingDocument) {
          setLoadError("Dokumen yang dipilih tidak ditemukan pada kunjungan ini.");
          return;
        }
        setSelectedDocument(existingDocument);
        setFields({
          ...createInitialFields(patient, today, initialComplaint),
          ...existingDocument.formData
        });
        loadPrescriptionItemsFromDocument(existingDocument);
        return;
      }
      setFields((current) => ({
        ...current,
        complaint: current.complaint || record?.chiefComplaint || initialComplaint,
        diagnosis: current.diagnosis || record?.diagnosis || ""
      }));
    }).catch((error: unknown) => {
      if (cancelled) return;
      console.error("Gagal memuat dokumen klinis kunjungan:", error);
      setLoadError(error instanceof Error ? error.message : "Gagal memuat data dokumen klinis.");
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [currentUser, initialComplaint, initialDocumentId, patient, repos.medicalRecord, today, visitId]);

  useEffect(() => {
    if (type !== "prescription" || !currentUser) return;
    let cancelled = false;
    setMedicineLoadError(null);
    void repos.config.getPrescriptionMedicines(currentUser.role, currentUser.authUserId || currentUser.id)
      .then((medicines) => {
        if (!cancelled) {
          setMedicineCatalog(medicines.filter((medicine) => medicine.approvalStatus === "APPROVED" && medicine.isActive));
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error("Gagal memuat master obat:", error);
        setMedicineLoadError(error instanceof Error ? error.message : "Master obat gagal dimuat.");
      });
    return () => {
      cancelled = true;
    };
  }, [currentUser, repos.config, type]);

  const changeField = (field: keyof ClinicalDocumentFields) => (value: string) =>
    setFields((current) => ({ ...current, [field]: value }));

  const updatePrescriptionItem = (index: number, updates: Partial<PrescriptionDraftItem>) => {
    setPrescriptionItems((current) => current.map((item, itemIndex) =>
      itemIndex === index ? { ...item, ...updates } : item
    ));
  };

  const loadPrescriptionItemsFromDocument = (document: ClinicalVisitDocument) => {
    setPrescriptionItems(parsePrescriptionItems(document.formData.prescriptionItems));
  };

  const validationError = () => {
    if (type === "prescription") {
      if (prescriptionItems.length === 0) return "Tambahkan minimal satu obat ke resep.";
      const incompleteItem = prescriptionItems.find((item) =>
        !item.medicineName.trim()
        || !item.dose.trim()
        || !item.route.trim()
        || !item.frequency.trim()
        || !item.duration.trim()
        || !item.quantity.trim()
      );
      if (incompleteItem) {
        return "Lengkapi nama obat, dosis, cara pemberian, frekuensi, durasi, dan jumlah untuk setiap obat.";
      }
    }
    if (type === "sick-note") {
      const days = Number(fields.restDays);
      if (!Number.isInteger(days) || days < 1) return "Isi lama istirahat dalam jumlah hari yang valid.";
      if (!fields.restStartDate) return "Pilih tanggal mulai istirahat.";
    }
    if (type === "referral") {
      if (!fields.recipientDentist.trim()) return "Isi dokter atau tenaga medis tujuan rujukan.";
      if (!fields.recipientLocation.trim()) return "Isi fasilitas atau lokasi tujuan rujukan.";
      if (!fields.complaint.trim()) return "Isi keluhan atau anamnesis untuk surat rujukan.";
      if (!fields.diagnosis.trim()) return "Isi diagnosis sementara untuk surat rujukan.";
    }
    return null;
  };

  const startNewDocument = () => {
    setSelectedDocument(null);
    setFields(createInitialFields(
      patient,
      today,
      fields.complaint || initialComplaint,
      fields.diagnosis
    ));
    setPrescriptionItems(type === "prescription" ? [createEmptyPrescriptionItem()] : []);
    setSaveError(null);
    setSaveSuccess(null);
  };

  const selectSavedDocument = (document: ClinicalVisitDocument) => {
    setSelectedDocument(document);
    setFields({
      ...createInitialFields(patient, today, initialComplaint),
      ...document.formData
    });
    loadPrescriptionItemsFromDocument(document);
    setSaveError(null);
    setSaveSuccess(null);
  };

  const saveAndPrint = async () => {
    if (!currentUser || !doctor?.id) {
      setSaveError("Data akun dokter belum lengkap untuk menyimpan dokumen.");
      return;
    }
    const validationMessage = validationError();
    if (validationMessage) {
      setSaveError(validationMessage);
      return;
    }

    setSaving(true);
    setSaveError(null);
    setSaveSuccess(null);
    try {
      const formData: ClinicalDocumentFields = {
        ...fields,
        ...(type === "prescription"
          ? {
            prescription: formatPrescriptionItems(prescriptionItems),
            prescriptionItems: JSON.stringify(prescriptionItems)
          }
          : {}),
        __issuedDate: today,
        __clinicName: clinicName,
        __branchName: branchName,
        __clinicAddress: address,
        __clinicPhone: phone,
        __doctorName: doctorName,
        __doctorSip: doctor?.sip || "",
        __logoUrl: logo
      };
      const saved = await repos.medicalRecord.createClinicalVisitDocument(
        {
          visitId,
          patientId: patient.id,
          branchId: branch?.id || currentUser.assignedBranchId || "",
          doctorId: doctor.id,
          type: currentDocumentType,
          formData
        },
        currentUser.role,
        currentUser.assignedBranchId,
        currentUser.id
      );
      setDocuments((current) => [saved, ...current]);
      setSelectedDocument(saved);
      setFields(formData);
      setPrescriptionItems(parsePrescriptionItems(formData.prescriptionItems));
      setSaveSuccess("Dokumen berhasil disimpan ke rekam medis.");
      window.requestAnimationFrame(() => window.print());
    } catch (error: unknown) {
      console.error("Gagal menyimpan dokumen klinis:", error);
      setSaveError(error instanceof Error ? error.message : "Gagal menyimpan dokumen klinis.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="doctor-clinical-document-wrapper fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-slate-950/60 p-3 backdrop-blur-sm sm:p-6 print:static print:block print:overflow-visible print:bg-white print:p-0"
      role="dialog"
      aria-modal="true"
      aria-labelledby="clinical-document-title"
    >
      <div className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-[#e8dcc3] bg-[#f7f5f0] shadow-2xl print:block print:max-h-none print:overflow-visible print:rounded-none print:border-0 print:bg-white print:shadow-none">
        <div className="modal-topbar flex items-center justify-between gap-3 border-b border-[#d6b96f] bg-gradient-to-r from-[#9b7625] via-[#bd963e] to-[#dfbd69] px-4 py-3 text-white sm:px-6 print:hidden">
          <div className="min-w-0">
            <h2 id="clinical-document-title" className="truncate text-sm font-bold text-white sm:text-base">
              {documentTitles[type]}
            </h2>
            <p className="mt-0.5 text-[11px] text-white/85">
              {patient.fullName || patient.name} · Kunjungan {visitId.slice(0, 8)}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {isReadOnly ? (
              <>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-2 rounded-lg bg-white/90 px-3 py-2 text-xs font-bold text-[#735b20] transition hover:bg-white"
                >
                  <Printer className="h-4 w-4" /> Cetak dokumen
                </button>
                {canCreateDocument && (
                  <button
                    type="button"
                    onClick={startNewDocument}
                    className="rounded-lg border border-white/40 px-3 py-2 text-xs font-bold text-white transition hover:bg-white/15"
                  >
                    Dokumen baru
                  </button>
                )}
              </>
            ) : canCreateDocument ? (
              <button
                type="button"
                onClick={() => void saveAndPrint()}
                disabled={saving || loading}
                className="inline-flex items-center gap-2 rounded-lg bg-white/90 px-3 py-2 text-xs font-bold text-[#735b20] transition hover:bg-white disabled:opacity-60"
              >
                <Save className="h-4 w-4" /> {saving ? "Menyimpan..." : "Simpan & Cetak"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup dokumen"
              className="rounded-lg p-2 text-white/85 transition hover:bg-white/15 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 lg:grid-cols-[minmax(260px,0.75fr)_minmax(0,1.25fr)] lg:p-6 print:block print:overflow-visible print:p-0">
          <section className="rounded-xl border border-slate-200 bg-white p-4 print:hidden">
            <h3 className="text-sm font-bold text-slate-900">{isReadOnly ? "Dokumen tersimpan" : "Data dokumen"}</h3>
            <p className="mb-4 mt-1 text-xs leading-5 text-slate-500">
              Data pasien terisi otomatis. Dokumen yang sudah disimpan tidak dapat diubah; buat dokumen baru untuk revisi.
            </p>
            {loadError && (
              <p role="alert" className="mb-3 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-800">
                {loadError}
              </p>
            )}
            {saveError && (
              <p role="alert" className="mb-3 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-800">
                {saveError}
              </p>
            )}
            {saveSuccess && (
              <p role="status" className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-xs text-emerald-800">
                {saveSuccess}
              </p>
            )}
            <div className="space-y-3">
              <FormInput label="Nama pasien" value={fields.patientName} onChange={changeField("patientName")} readOnly />
              <div className="grid grid-cols-2 gap-3">
                <FormInput label="Umur (tahun)" value={fields.age} onChange={changeField("age")} readOnly />
                <FormInput label="Jenis kelamin" value={fields.gender} onChange={changeField("gender")} readOnly />
              </div>
              {type === "sick-note" && (
                <>
                  <FormInput label="Pekerjaan" value={fields.occupation} onChange={changeField("occupation")} readOnly />
                  <FormInput label="Alamat" value={fields.address} onChange={changeField("address")} readOnly />
                  <div className="grid grid-cols-2 gap-3">
                    <FormInput label="Istirahat (hari)" type="number" value={fields.restDays} onChange={changeField("restDays")} readOnly={isReadOnly} />
                    <FormInput label="Mulai tanggal" type="date" value={fields.restStartDate} onChange={changeField("restStartDate")} readOnly={isReadOnly} />
                  </div>
                </>
              )}
              {type === "prescription" && (
                <>
                  <FormInput label="Alamat pasien" value={fields.address} onChange={changeField("address")} readOnly />
                  {!isReadOnly && (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700">
                          Cari obat di master
                          <input
                            value={medicineSearch}
                            onChange={(event) => setMedicineSearch(event.target.value)}
                            className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal outline-none focus:border-[#c5a059] focus:ring-2 focus:ring-[#c5a059]/20"
                            placeholder="Cari nama generik, dagang, kekuatan..."
                          />
                        </label>
                        <p className="mt-1 text-[10px] leading-4 text-slate-500">
                          Dosis, frekuensi, cara pemberian, dan durasi selalu diisi dokter untuk resep ini.
                        </p>
                      </div>
                      {medicineLoadError && (
                        <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[10px] leading-relaxed text-amber-900">
                          Katalog obat tidak dapat dimuat: {medicineLoadError} Obat masih dapat ditulis manual.
                        </p>
                      )}
                      {medicineCatalog.length === 0 && !medicineLoadError && (
                        <p className="rounded-lg border border-sky-200 bg-sky-50 p-2.5 text-[10px] leading-relaxed text-sky-900">
                          Master obat belum berisi pilihan. Tambahkan obat melalui Pengaturan → Master Obat Resep, atau masukkan obat secara manual.
                        </p>
                      )}
                      {prescriptionItems.map((item, index) => {
                        const searchTerm = medicineSearch.trim().toLocaleLowerCase();
                        const filteredMedicines = medicineCatalog.filter((medicine) =>
                          medicine.id === item.medicineId
                          || !searchTerm
                          || [
                            medicine.genericName,
                            medicine.brandName,
                            medicine.strength,
                            medicine.dosageForm
                          ].some((value) => value.toLocaleLowerCase().includes(searchTerm))
                        );
                        return (
                          <section key={index} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                            <div className="flex items-center justify-between gap-2">
                              <h4 className="text-xs font-bold text-slate-800">Obat {index + 1}</h4>
                              {!isReadOnly && (
                                <button
                                  type="button"
                                  onClick={() => setPrescriptionItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                                  className="rounded-md px-2 py-1 text-[10px] font-semibold text-rose-700 hover:bg-rose-50"
                                >
                                  Hapus
                                </button>
                              )}
                            </div>
                            <label className="block text-[10px] font-semibold text-slate-600">
                              Pilih obat dari master
                              <select
                                value={item.medicineId || (item.medicineName ? "__manual__" : "")}
                                disabled={isReadOnly}
                                onChange={(event) => {
                                  const selectedMedicine = medicineCatalog.find((medicine) => medicine.id === event.target.value);
                                  if (selectedMedicine) {
                                    updatePrescriptionItem(index, {
                                      medicineId: selectedMedicine.id,
                                      medicineName: selectedMedicine.genericName,
                                      brandName: selectedMedicine.brandName,
                                      strength: selectedMedicine.strength,
                                      dosageForm: selectedMedicine.dosageForm
                                    });
                                  } else {
                                    updatePrescriptionItem(index, { medicineId: "" });
                                  }
                                }}
                                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-normal text-slate-800"
                              >
                                <option value="">-- Pilih obat --</option>
                                {filteredMedicines.map((medicine) => (
                                  <option key={medicine.id} value={medicine.id}>
                                    {medicine.genericName}{medicine.brandName ? ` (${medicine.brandName})` : ""} · {medicine.strength} · {medicine.dosageForm}
                                  </option>
                                ))}
                                <option value="__manual__">Obat tidak ada di master (isi manual)</option>
                              </select>
                            </label>
                            {!item.medicineId && (
                              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                                <FormInput label="Nama obat *" value={item.medicineName} onChange={(value) => updatePrescriptionItem(index, { medicineName: value })} readOnly={isReadOnly} />
                                <FormInput label="Kekuatan" value={item.strength} onChange={(value) => updatePrescriptionItem(index, { strength: value })} readOnly={isReadOnly} />
                                <FormInput label="Bentuk" value={item.dosageForm} onChange={(value) => updatePrescriptionItem(index, { dosageForm: value })} readOnly={isReadOnly} />
                              </div>
                            )}
                            <div className="grid grid-cols-2 gap-2">
                              <FormInput label="Dosis *" value={item.dose} onChange={(value) => updatePrescriptionItem(index, { dose: value })} readOnly={isReadOnly} />
                              <FormInput label="Cara pemberian *" value={item.route} onChange={(value) => updatePrescriptionItem(index, { route: value })} readOnly={isReadOnly} />
                              <FormInput label="Frekuensi *" value={item.frequency} onChange={(value) => updatePrescriptionItem(index, { frequency: value })} readOnly={isReadOnly} />
                              <FormInput label="Durasi *" value={item.duration} onChange={(value) => updatePrescriptionItem(index, { duration: value })} readOnly={isReadOnly} />
                              <FormInput label="Jumlah *" value={item.quantity} onChange={(value) => updatePrescriptionItem(index, { quantity: value })} readOnly={isReadOnly} />
                              <FormInput label="Catatan" value={item.instructions} onChange={(value) => updatePrescriptionItem(index, { instructions: value })} readOnly={isReadOnly} />
                            </div>
                          </section>
                        );
                      })}
                      {!isReadOnly && (
                        <button
                          type="button"
                          onClick={() => setPrescriptionItems((current) => [...current, createEmptyPrescriptionItem()])}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-[#d6bd80] bg-[#fffdf8] px-3 py-2 text-xs font-semibold text-[#735b20] hover:bg-[#faf6ec]"
                        >
                          + Tambah obat
                        </button>
                      )}
                    </div>
                  )}
                  {isReadOnly && (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
                      <p className="mb-1 font-semibold text-slate-700">Obat dan aturan pakai</p>
                      <p className="whitespace-pre-wrap leading-6 text-slate-800">{prescriptionDisplay}</p>
                    </div>
                  )}
                </>
              )}
              {type === "referral" && (
                <>
                  <FormInput label="Alamat pasien" value={fields.address} onChange={changeField("address")} readOnly />
                  <FormInput label="No. telepon" value={fields.phone} onChange={changeField("phone")} readOnly />
                  <FormInput label="Dokter / tenaga medis tujuan" value={fields.recipientDentist} onChange={changeField("recipientDentist")} readOnly={isReadOnly} />
                  <FormInput label="Fasilitas / lokasi tujuan" value={fields.recipientLocation} onChange={changeField("recipientLocation")} readOnly={isReadOnly} />
                  <FormTextArea label="Keluhan / anamnesis" value={fields.complaint} onChange={changeField("complaint")} readOnly={isReadOnly} />
                  <FormTextArea label="Diagnosis sementara" value={fields.diagnosis} onChange={changeField("diagnosis")} readOnly={isReadOnly} />
                  <FormTextArea label="Kasus / temuan klinis" value={fields.caseDetail} onChange={changeField("caseDetail")} readOnly={isReadOnly} />
                  <FormTextArea label="Terapi / obat yang telah diberikan" value={fields.therapy} onChange={changeField("therapy")} readOnly={isReadOnly} />
                </>
              )}
            </div>
            {!isReadOnly && canCreateDocument && (
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => void saveAndPrint()}
                  disabled={saving || loading || !!loadError || !doctor?.id}
                  className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-[#9b7625] to-[#c5a059] px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:from-[#80651f] hover:to-[#a98232] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Save className="h-4 w-4" /> {saving ? "Menyimpan..." : "Simpan & Cetak"}
                </button>
              </div>
            )}
            {loading ? (
              <p role="status" className="mt-4 text-xs text-slate-500">Memuat riwayat dokumen...</p>
            ) : matchingDocuments.length > 0 ? (
              <div className="mt-5 border-t border-slate-100 pt-4">
                <h4 className="text-xs font-bold text-slate-800">Riwayat dokumen kunjungan</h4>
                <div className="mt-2 space-y-2">
                  {matchingDocuments.map((document) => (
                    <button
                      key={document.id}
                      type="button"
                      onClick={() => selectSavedDocument(document)}
                      className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-xs transition ${
                        selectedDocument?.id === document.id
                          ? "border-[#c5a059] bg-[#faf6ec] text-[#735b20]"
                          : "border-slate-200 bg-white text-slate-700 hover:border-[#d8bd7d] hover:bg-[#fcfaf5]"
                      }`}
                    >
                      <span className="font-semibold">{documentTitles[type]}</span>
                      <span className="shrink-0 text-[10px] text-slate-500">{formatDateTime(document.createdAt)}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </section>

          <div className="flex justify-center rounded-xl bg-[#e9e7e1] p-3 sm:p-6 print:block print:bg-white print:p-0">
            <article id="doctor-clinical-document" className={`relative w-full bg-white px-7 py-8 text-slate-900 shadow-md sm:px-12 sm:py-10 print:mx-auto print:shadow-none ${type === "prescription" ? "max-w-[158mm] min-h-[205mm] print:min-h-0" : "max-w-[190mm] min-h-[265mm]"}`}>
              <div className={`mb-5 border-b-2 border-slate-800 pb-3 ${type === "prescription" ? "border-b-[3px] border-[#9b7625] print:border-slate-800" : ""}`}>
                <div className="flex items-center gap-3">
                  <img src={documentLogo} alt="" className={`${type === "prescription" ? "h-16 w-16" : "h-14 w-14"} object-contain`} />
                  <div className="min-w-0 flex-1 text-center">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Praktik Dokter Gigi</p>
                    <h1 className="text-lg font-extrabold tracking-wide">{documentClinicName.toUpperCase()}</h1>
                    <p className="text-[10px] leading-4">{documentAddress}{documentBranchName ? ` · ${documentBranchName}` : ""}</p>
                    {documentPhone && <p className="text-[10px]">Telepon: {documentPhone}</p>}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[9px] text-slate-600">
                  <span className="font-semibold">{documentDoctorName}</span>
                  {documentDoctorSip && <span>No. SIP: {documentDoctorSip}</span>}
                </div>
              </div>

              <div className={`mb-5 text-center ${type === "prescription" ? "flex items-center justify-between gap-3 text-left" : ""}`}>
                <span className={`inline-block border px-3 py-1 text-[9px] font-bold tracking-widest ${
                  isReadOnly ? "border-emerald-700 text-emerald-800" : "border-amber-700 text-amber-800"
                }`}>
                  {isReadOnly ? "DOKUMEN TERSIMPAN" : "PRATINJAU · BELUM TERSIMPAN"}
                </span>
                {type === "prescription" ? (
                  <div className="text-right">
                    <h2 className="text-sm font-extrabold tracking-[0.16em] text-slate-900">RESEP</h2>
                    <p className="text-[9px] text-slate-500">
                      Kunjungan {visitId.slice(0, 8).toUpperCase()} · {formatDate(documentDate)}
                    </p>
                  </div>
                ) : (
                  <h2 className="mt-3 text-base font-bold underline underline-offset-4">
                    {type === "sick-note" ? "SURAT KETERANGAN SAKIT" : "SURAT RUJUKAN"}
                  </h2>
                )}
              </div>

              {type === "sick-note" && (
                <div className="space-y-5 text-sm">
                  <div>
                    <FieldLine label="Nama" value={fields.patientName} />
                    <FieldLine label="Umur" value={fields.age ? `${fields.age} tahun` : ""} />
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
                  <p className="text-right">{documentBranchName ? `${documentBranchName}, ` : ""}{formatDate(documentDate)}</p>
                  <div className="ml-auto mt-8 w-56 text-center">
                    <p>Dokter pemeriksa,</p>
                    <div className="h-20" />
                    <p className="border-t border-slate-500 pt-1 font-semibold">{documentDoctorName}</p>
                  </div>
                </div>
              )}

              {type === "prescription" && (
                <div className="prescription-sheet flex min-h-[145mm] flex-col text-[11px] leading-5 print:min-h-0">
                  <section className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 print:border-slate-400 print:bg-white">
                    <div className="grid grid-cols-[4.5rem_1fr] gap-x-3 gap-y-1.5">
                      <span className="text-[9px] font-bold uppercase tracking-wide text-slate-500">Pasien</span>
                      <span className="font-bold text-slate-900">{fields.patientName || "................................................"}</span>
                      <span className="text-[9px] font-bold uppercase tracking-wide text-slate-500">Usia / JK</span>
                      <span className="text-slate-800">
                        {[fields.age ? `${fields.age} tahun` : "", fields.gender].filter(Boolean).join(" · ") || "................................"}
                      </span>
                      {fields.address && (
                        <>
                          <span className="text-[9px] font-bold uppercase tracking-wide text-slate-500">Alamat</span>
                          <span className="text-slate-700">{fields.address}</span>
                        </>
                      )}
                    </div>
                  </section>

                  <section className="mt-5 flex-1">
                    <div className="mb-3 flex items-center gap-3">
                      <span className="font-serif text-3xl italic leading-none text-[#9b7625] print:text-slate-900">R/</span>
                      <div className="h-px flex-1 bg-slate-200 print:bg-slate-400" />
                    </div>

                    {completedPrescriptionItems.length > 0 ? (
                      <ol className="space-y-3">
                        {completedPrescriptionItems.map((item, index) => (
                          <li
                            key={`${item.medicineId || item.medicineName}-${index}`}
                            className="break-inside-avoid rounded-lg border border-slate-200 p-3 print:border-slate-400"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex min-w-0 gap-2.5">
                                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#faf6ec] text-[9px] font-bold text-[#735b20] print:border print:border-slate-400 print:bg-white print:text-slate-900">
                                  {index + 1}
                                </span>
                                <div className="min-w-0">
                                  <p className="font-bold text-slate-900">
                                    {item.medicineName}
                                    {item.brandName && <span className="ml-1 font-normal text-slate-600">({item.brandName})</span>}
                                  </p>
                                  {(item.strength || item.dosageForm) && (
                                    <p className="text-[10px] text-slate-600">
                                      {[item.strength, item.dosageForm].filter(Boolean).join(" · ")}
                                    </p>
                                  )}
                                </div>
                              </div>
                              {item.quantity && (
                                <span className="shrink-0 rounded-md bg-slate-100 px-2 py-0.5 text-[9px] font-semibold text-slate-700 print:border print:border-slate-400 print:bg-white">
                                  Jumlah: {item.quantity}
                                </span>
                              )}
                            </div>
                            <div className="ml-[1.875rem] mt-2 border-t border-dashed border-slate-200 pt-2 print:border-slate-400">
                              <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">Signatura / aturan pakai</p>
                              <p className="mt-0.5 font-medium text-slate-800">
                                {[item.dose, item.route, item.frequency, item.duration].filter(Boolean).join(" · ") || "................................................"}
                              </p>
                              {item.instructions && (
                                <p className="mt-1 text-[10px] text-slate-600">Catatan: {item.instructions}</p>
                              )}
                            </div>
                          </li>
                        ))}
                      </ol>
                    ) : fields.prescription.trim() ? (
                      <div className="whitespace-pre-wrap rounded-lg border border-slate-200 p-4 leading-6 print:border-slate-400">
                        {fields.prescription}
                      </div>
                    ) : (
                      <div className="flex min-h-28 flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-5 py-6 text-center print:border-slate-400 print:bg-white">
                        <p className="text-xs font-semibold text-slate-600">Belum ada obat pada resep</p>
                        <p className="mt-1 max-w-xs text-[10px] leading-4 text-slate-500">
                          Pilih obat dari master atau tulis nama obat secara manual. Rincian resep akan tampil di area ini.
                        </p>
                      </div>
                    )}
                  </section>

                  <footer className="mt-8 border-t border-slate-200 pt-4 print:border-slate-400">
                    <div className="flex items-end justify-between gap-4">
                      <div className="max-w-[55%] space-y-2">
                        <p className="text-[9px] leading-4 text-slate-500">
                          Gunakan obat sesuai aturan pakai. Hubungi klinik apabila muncul reaksi yang tidak diharapkan.
                        </p>
                        {documentPhone && <p className="text-[9px] font-medium text-slate-600">{documentPhone}</p>}
                      </div>
                      <div className="w-44 shrink-0 text-center text-[10px]">
                        <p>{documentBranchName ? `${documentBranchName}, ` : ""}{formatDate(documentDate)}</p>
                        <p className="mt-1">Dokter pemeriksa</p>
                        <div className="h-14" />
                        <p className="border-t border-slate-500 pt-1 font-bold">{documentDoctorName}</p>
                        {documentDoctorSip && <p className="mt-0.5 text-[9px] text-slate-600">SIP: {documentDoctorSip}</p>}
                      </div>
                    </div>
                  </footer>
                </div>
              )}

              {type === "referral" && (
                <div className="space-y-4 text-sm">
                  <div className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-2">
                    <span>Yth. Dokter / Tenaga Medis</span><span className="border-b border-dotted border-slate-500">{fields.recipientDentist}</span>
                    <span>Di</span><span className="border-b border-dotted border-slate-500">{fields.recipientLocation}</span>
                  </div>
                  <p>Mohon pemeriksaan dan penanganan lebih lanjut terhadap pasien:</p>
                  <div>
                    <FieldLine label="Nama Pasien" value={fields.patientName} />
                    <FieldLine label="Jenis Kelamin" value={fields.gender} />
                    <FieldLine label="Umur" value={fields.age ? `${fields.age} tahun` : ""} />
                    <FieldLine label="No. Telepon" value={fields.phone} />
                    <FieldLine label="Alamat Rumah" value={fields.address} />
                  </div>
                  <div className="space-y-2">
                    <FieldLine label="Keluhan / Anamnesis" value={fields.complaint} />
                    <FieldLine label="Diagnosis sementara" value={fields.diagnosis} />
                    <FieldLine label="Kasus / temuan klinis" value={fields.caseDetail} />
                    <FieldLine label="Terapi / obat yang telah diberikan" value={fields.therapy} />
                  </div>
                  <p className="pt-2 text-justify leading-6">
                    Demikian surat rujukan ini kami kirim. Atas perhatian dan kerja sama Bapak/Ibu, kami ucapkan terima kasih.
                  </p>
                  <div className="ml-2 pt-2">
                    <p>Hormat kami,</p>
                    <div className="h-16" />
                    <p className="w-56 border-t border-slate-500 pt-1 font-semibold">{doctorName}</p>
                    <p className="mt-2 text-xs">{documentBranchName ? `${documentBranchName}, ` : ""}{formatDate(documentDate)}</p>
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
