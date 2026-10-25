import React from "react";
import {
  OdontogramCondition,
  OdontogramData,
  OdontogramHistoryEntry,
  OdontogramSurface,
  OdontogramTooth
} from "../types/domain";
import {
  ANTERIOR_TOOTH_DIVIDER_PATH,
  getOdontogramSurfaceShapes,
  usesAnteriorOdontogramPattern
} from "./odontogramToothShapes";

const TOOTH_ROWS = [
  { label: "Rahang atas permanen", numberPosition: "top", midline: "down", teeth: [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28] },
  { label: "Rahang atas sulung", numberPosition: "top", midline: null, teeth: [55, 54, 53, 52, 51, 61, 62, 63, 64, 65] },
  { label: "Rahang bawah sulung", numberPosition: "top", midline: null, teeth: [85, 84, 83, 82, 81, 71, 72, 73, 74, 75] },
  { label: "Rahang bawah permanen", numberPosition: "bottom", midline: "up", teeth: [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38] }
];
export const ODONTOGRAM_TOOTH_NUMBERS = TOOTH_ROWS.flatMap((row) => row.teeth);

const CONDITIONS: Array<{ value: OdontogramCondition; label: string; color: string }> = [
  { value: "caries", label: "Karies", color: "#ef4444" },
  { value: "filling", label: "Tumpatan", color: "#3b82f6" },
  { value: "crown", label: "Mahkota", color: "#8b5cf6" },
  { value: "root_canal", label: "Perawatan saluran akar", color: "#f59e0b" },
  { value: "missing", label: "Hilang", color: "#64748b" },
  { value: "extraction_indicated", label: "Indikasi ekstraksi", color: "#ec4899" }
];

const SURFACES: Array<{ value: OdontogramSurface | "ALL"; label: string }> = [
  { value: "ALL", label: "Seluruh gigi" },
  { value: "O", label: "Oklusal / insisal" },
  { value: "M", label: "Mesial" },
  { value: "D", label: "Distal" },
  { value: "B", label: "Bukal / labial" },
  { value: "L", label: "Lingual / palatal" }
];

const CONDITION_LABEL: Record<OdontogramCondition, string> = {
  caries: "Karies",
  crown: "Mahkota",
  extraction_indicated: "Indikasi ekstraksi",
  filling: "Tumpatan",
  missing: "Hilang",
  root_canal: "Perawatan saluran akar"
};

const CONDITION_COLOR = Object.fromEntries(
  CONDITIONS.map(({ value, color }) => [value, color])
) as Record<OdontogramCondition, string>;

interface OdontogramProps {
  value?: OdontogramData;
  history?: OdontogramHistoryEntry[];
  disabled?: boolean;
  onChange: (value: OdontogramData) => void;
}

function ToothDiagram({
  toothNumber,
  tooth,
  selectedCondition,
  selectedSurface,
  selected
}: {
  toothNumber: number;
  tooth?: OdontogramTooth;
  selectedCondition: OdontogramCondition;
  selectedSurface: OdontogramSurface | "ALL";
  selected: boolean;
}) {
  const surfaceShapes = getOdontogramSurfaceShapes(toothNumber);
  const anteriorPattern = usesAnteriorOdontogramPattern(toothNumber);

  return (
    <svg viewBox="0 0 40 40" className="h-9 w-9" aria-hidden="true">
      {(Object.keys(surfaceShapes) as OdontogramSurface[]).map((surface) => {
          const condition = tooth?.condition || tooth?.surfaces?.[surface];
          const activeSelection =
            !tooth && (selectedSurface === "ALL" || selectedSurface === surface);
          return (
            <polygon
              key={surface}
              points={surfaceShapes[surface]}
              fill={condition ? CONDITION_COLOR[condition] : activeSelection ? CONDITION_COLOR[selectedCondition] : "white"}
              fillOpacity={condition ? 0.82 : activeSelection ? 0.08 : 1}
              stroke={anteriorPattern ? "none" : "#64748b"}
              strokeWidth="0.9"
            />
          );
        })}
      {anteriorPattern && (
        <path
          d={ANTERIOR_TOOTH_DIVIDER_PATH}
          fill="none"
          stroke="#64748b"
          strokeWidth="0.9"
          pointerEvents="none"
        />
      )}
      <path
        d="M0 0 H40 V40 H0 Z"
        fill="none"
        stroke={selected ? "#0f766e" : "#64748b"}
        strokeWidth={selected ? 2 : 1.25}
      />
      {tooth?.condition === "missing" && (
        <path d="M10 10 L30 30 M30 10 L10 30" stroke={CONDITION_COLOR.missing} strokeWidth="3" />
      )}
    </svg>
  );
}

export const Odontogram: React.FC<OdontogramProps> = ({ value, history = [], disabled = false, onChange }) => {
  const odontogram = value || { schemaVersion: 1 as const, teeth: {} };
  const [condition, setCondition] = React.useState<OdontogramCondition>("caries");
  const [surface, setSurface] = React.useState<OdontogramSurface | "ALL">("ALL");
  const [selectedTooth, setSelectedTooth] = React.useState<number | null>(null);

  const markTooth = (toothNumber: number) => {
    if (disabled) return;
    const updatedTeeth = { ...odontogram.teeth };
    const current = updatedTeeth[String(toothNumber)] || {};
    if (surface === "ALL") {
      updatedTeeth[String(toothNumber)] = { condition, updatedAt: new Date().toISOString() };
    } else {
      const surfaces = current.condition
        ? {
            O: current.condition,
            M: current.condition,
            D: current.condition,
            B: current.condition,
            L: current.condition,
            ...current.surfaces,
            [surface]: condition
          }
        : { ...current.surfaces, [surface]: condition };
      updatedTeeth[String(toothNumber)] = {
        ...current,
        condition: undefined,
        surfaces,
        updatedAt: new Date().toISOString()
      };
    }
    setSelectedTooth(toothNumber);
    onChange({ schemaVersion: 1, teeth: updatedTeeth });
  };

  const clearTooth = () => {
    if (disabled || selectedTooth === null) return;
    const updatedTeeth = { ...odontogram.teeth };
    delete updatedTeeth[String(selectedTooth)];
    onChange({ schemaVersion: 1, teeth: updatedTeeth });
  };

  const toothCount = Object.keys(odontogram.teeth).length;
  const selectedToothRecord = selectedTooth === null
    ? undefined
    : odontogram.teeth[String(selectedTooth)];

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-bold text-slate-800">Odontogram FDI</h3>
          <p className="text-[11px] text-slate-500">Pilih kondisi dan permukaan, lalu tekan gambar gigi untuk menandai.</p>
        </div>
        <span className="rounded-full bg-teal-50 px-2.5 py-1 text-[10px] font-bold text-teal-800">
          {toothCount} gigi bertanda
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-[11px] font-semibold text-slate-600">
          Kondisi
          <select
            value={condition}
            disabled={disabled}
            onChange={(event) => setCondition(event.target.value as OdontogramCondition)}
            className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs"
          >
            {CONDITIONS.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </label>
        <label className="text-[11px] font-semibold text-slate-600">
          Bagian gigi
          <select
            value={surface}
            disabled={disabled}
            onChange={(event) => setSurface(event.target.value as OdontogramSurface | "ALL")}
            className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs"
          >
            {SURFACES.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="space-y-2 overflow-x-auto rounded-lg bg-slate-50 p-3">
        {TOOTH_ROWS.map((row, rowIndex) => (
          <React.Fragment key={row.label}>
            {rowIndex === 2 && (
              <div className="flex h-5 items-center justify-center" aria-hidden="true">
                <svg viewBox="0 0 12 20" className="h-5 w-3 text-slate-700" fill="currentColor">
                  <path d="M6 0 2.5 5h2.25v3h2.5V5H9.5L6 0Zm0 20 3.5-5H7.25v-3h-2.5v3H2.5L6 20Z" />
                </svg>
              </div>
            )}
            <div>
              <p className="mb-1 text-center text-[9px] font-semibold uppercase tracking-wide text-slate-400">{row.label}</p>
              <div className="flex min-w-max justify-center gap-0">
                {row.teeth.map((toothNumber, toothIndex) => {
                  const tooth = odontogram.teeth[String(toothNumber)];
                  const isSelected = selectedTooth === toothNumber;
                  return (
                    <React.Fragment key={toothNumber}>
                      {toothIndex === 8 && row.midline && (
                        <span className={`flex w-3 self-stretch items-center text-[10px] font-bold leading-none text-slate-800 ${
                          row.midline === "down" ? "items-start pt-3" : "items-end pb-2"
                        }`} aria-hidden="true">
                          {row.midline === "down" ? "▼" : "▲"}
                        </span>
                      )}
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => markTooth(toothNumber)}
                        aria-label={`Tandai gigi ${toothNumber} sebagai ${CONDITION_LABEL[condition]}`}
                        aria-pressed={isSelected}
                        className={`flex w-9 flex-col items-center px-0 transition-colors ${
                          isSelected ? "bg-teal-100" : "hover:bg-white"
                        } disabled:cursor-not-allowed`}
                      >
                        {row.numberPosition === "top" && (
                          <span className="text-[9px] font-semibold text-slate-600">{toothNumber}</span>
                        )}
                        <ToothDiagram
                          toothNumber={toothNumber}
                          tooth={tooth}
                          selectedCondition={condition}
                          selectedSurface={surface}
                          selected={isSelected}
                        />
                        {row.numberPosition === "bottom" && (
                          <span className="text-[9px] font-semibold text-slate-600">{toothNumber}</span>
                        )}
                      </button>
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          </React.Fragment>
        ))}
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {CONDITIONS.map((item) => (
          <span key={item.value} className="flex items-center gap-1 text-[10px] text-slate-600">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: item.color }} />
            {item.label}
          </span>
        ))}
      </div>

      {selectedTooth !== null && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-[11px]">
          <div>
            <span className="font-bold text-slate-700">Gigi {selectedTooth}</span>
            {selectedToothRecord?.condition && (
              <span className="ml-2 text-slate-600">{CONDITION_LABEL[selectedToothRecord.condition]}</span>
            )}
            {selectedToothRecord?.surfaces && (
              <span className="ml-2 text-slate-500">
                {Object.entries(selectedToothRecord.surfaces)
                  .map(([surfaceName, conditionName]) => `${surfaceName}: ${CONDITION_LABEL[conditionName]}`)
                  .join(" · ")}
              </span>
            )}
          </div>
          {!disabled && selectedToothRecord && (
            <button type="button" onClick={clearTooth} className="font-semibold text-rose-700 hover:text-rose-800">
              Hapus tanda gigi
            </button>
          )}
        </div>
      )}
      {history.length > 0 && (
        <details className="rounded-lg border border-slate-100 px-3 py-2">
          <summary className="cursor-pointer text-[11px] font-semibold text-slate-700">
            Histori perubahan odontogram ({history.length})
          </summary>
          <ol className="mt-2 max-h-32 space-y-1 overflow-y-auto">
            {[...history].reverse().map((entry, index) => (
              <li key={`${entry.changedAt}-${index}`} className="text-[10px] text-slate-500">
                <div>
                  {new Date(entry.changedAt).toLocaleString("id-ID")}
                  {entry.changedBy ? ` · ${entry.changedBy}` : ""}
                </div>
                <div className="mt-0.5 text-slate-600">
                  Sebelumnya: {Object.entries(entry.odontogram.teeth)
                    .map(([number, tooth]) => {
                      const details = tooth.condition
                        ? CONDITION_LABEL[tooth.condition]
                        : Object.entries(tooth.surfaces || {})
                            .map(([surfaceName, conditionName]) => `${surfaceName} ${CONDITION_LABEL[conditionName]}`)
                            .join(", ");
                      return details ? `${number} (${details})` : number;
                    })
                    .join(" · ") || "Belum ada gigi bertanda"}
                </div>
              </li>
            ))}
          </ol>
        </details>
      )}
    </section>
  );
};
