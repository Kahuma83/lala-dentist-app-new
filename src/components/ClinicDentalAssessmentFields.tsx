import React from "react";
import { ClinicDentalAssessment } from "../types/domain";

interface ClinicDentalAssessmentFieldsProps {
  value: ClinicDentalAssessment;
  disabled?: boolean;
  onChange: (value: ClinicDentalAssessment) => void;
}

interface AssessmentSelectProps<T extends string> {
  label: string;
  value?: T;
  options: Array<{ value: T; label: string }>;
  disabled: boolean;
  onChange: (value: T | undefined) => void;
}

function AssessmentSelect<T extends string>({
  label,
  value,
  options,
  disabled,
  onChange
}: AssessmentSelectProps<T>) {
  return (
    <label className="text-[11px] font-semibold text-slate-700">
      {label}
      <select
        value={value || ""}
        disabled={disabled}
        onChange={(event) => {
          const nextValue = options.find((option) => option.value === event.target.value)?.value;
          onChange(nextValue);
        }}
        className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs disabled:bg-slate-100"
      >
        <option value="">Belum diisi</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

export const ClinicDentalAssessmentFields: React.FC<ClinicDentalAssessmentFieldsProps> = ({
  value,
  disabled = false,
  onChange
}) => (
  <section className="space-y-3 rounded-xl border border-cyan-100 bg-cyan-50/40 p-3.5">
    <div>
      <h3 className="text-xs font-bold text-cyan-950">Pemeriksaan Odontogram Klinik</h3>
      <p className="mt-0.5 text-[10px] text-cyan-900">
        Tambahan sesuai formulir klinik; odontogram gigi di atas tetap tersedia seperti sebelumnya.
      </p>
    </div>

    <div className="grid gap-3 sm:grid-cols-2">
      <AssessmentSelect
        label="Occlusi"
        value={value.occlusion}
        disabled={disabled}
        options={[
          { value: "NORMAL", label: "Normal bite" },
          { value: "CROSS_BITE", label: "Cross bite" },
          { value: "DEEP_BITE", label: "Deep bite" }
        ]}
        onChange={(occlusion) => onChange({ ...value, occlusion })}
      />
      <AssessmentSelect
        label="Torus palatinus"
        value={value.torusPalatinus}
        disabled={disabled}
        options={[
          { value: "NONE", label: "Tidak ada" },
          { value: "SMALL", label: "Kecil" },
          { value: "MEDIUM", label: "Sedang" },
          { value: "LARGE", label: "Besar" },
          { value: "MULTIPLE", label: "Multiple" }
        ]}
        onChange={(torusPalatinus) => onChange({ ...value, torusPalatinus })}
      />
      <AssessmentSelect
        label="Torus mandibularis"
        value={value.torusMandibularis}
        disabled={disabled}
        options={[
          { value: "NONE", label: "Tidak ada" },
          { value: "LEFT", label: "Sisi kiri" },
          { value: "RIGHT", label: "Sisi kanan" },
          { value: "BOTH", label: "Kedua sisi" }
        ]}
        onChange={(torusMandibularis) => onChange({ ...value, torusMandibularis })}
      />
      <AssessmentSelect
        label="Palatum"
        value={value.palate}
        disabled={disabled}
        options={[
          { value: "DALAM", label: "Dalam" },
          { value: "SEDANG", label: "Sedang" },
          { value: "RENDAH", label: "Rendah" }
        ]}
        onChange={(palate) => onChange({ ...value, palate })}
      />

      {([
        ["D", "d", value.d],
        ["M", "m", value.m],
        ["F", "f", value.f]
      ] as Array<["D" | "M" | "F", "d" | "m" | "f", number | undefined]>).map(([label, key, count]) => (
        <label key={label} className="text-[11px] font-semibold text-slate-700">
          {label}
          <input
            type="number"
            min="0"
            step="1"
            value={count ?? ""}
            disabled={disabled}
            onChange={(event) => {
              const parsed = event.target.value === "" ? undefined : Number(event.target.value);
              onChange({
                ...value,
                [key]: parsed !== undefined && Number.isInteger(parsed) && parsed >= 0
                  ? parsed
                  : undefined
              });
            }}
            className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs disabled:bg-slate-100"
          />
        </label>
      ))}
    </div>

    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-[11px] font-semibold text-slate-700">
        Diastema
        <select
          value={value.diastemaPresent === undefined ? "" : value.diastemaPresent ? "yes" : "no"}
          disabled={disabled}
          onChange={(event) =>
            onChange({
              ...value,
              diastemaPresent: event.target.value === "" ? undefined : event.target.value === "yes"
            })
          }
          className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs disabled:bg-slate-100"
        >
          <option value="">Belum diisi</option>
          <option value="no">Tidak ada</option>
          <option value="yes">Ada</option>
        </select>
        <input
          type="text"
          value={value.diastemaNotes || ""}
          disabled={disabled}
          onChange={(event) => onChange({ ...value, diastemaNotes: event.target.value })}
          placeholder="Keterangan / lokasi"
          className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-normal disabled:bg-slate-100"
        />
      </label>
      <label className="text-[11px] font-semibold text-slate-700">
        Gigi / gingiva anomali
        <select
          value={value.gingivalAnomalyPresent === undefined ? "" : value.gingivalAnomalyPresent ? "yes" : "no"}
          disabled={disabled}
          onChange={(event) =>
            onChange({
              ...value,
              gingivalAnomalyPresent: event.target.value === "" ? undefined : event.target.value === "yes"
            })
          }
          className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs disabled:bg-slate-100"
        >
          <option value="">Belum diisi</option>
          <option value="no">Tidak ada</option>
          <option value="yes">Ada</option>
        </select>
        <input
          type="text"
          value={value.gingivalAnomalyNotes || ""}
          disabled={disabled}
          onChange={(event) => onChange({ ...value, gingivalAnomalyNotes: event.target.value })}
          placeholder="Keterangan / lokasi"
          className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-normal disabled:bg-slate-100"
        />
      </label>
    </div>

    <label className="block text-[11px] font-semibold text-slate-700">
      Lain-lain
      <textarea
        rows={2}
        value={value.otherNotes || ""}
        disabled={disabled}
        onChange={(event) => onChange({ ...value, otherNotes: event.target.value })}
        className="mt-1 block w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs font-normal disabled:bg-slate-100"
      />
    </label>
  </section>
);
