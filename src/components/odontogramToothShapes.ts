import { OdontogramSurface } from "../types/domain";

export type OdontogramToothType = "incisor" | "canine" | "premolar" | "molar";

const BOX_SURFACE_SHAPES: Record<OdontogramSurface, string> = {
  B: "0,0 40,0 30,10 10,10",
  D: "40,0 40,40 30,30 30,10",
  L: "0,40 40,40 30,30 10,30",
  M: "0,0 10,10 10,30 0,40",
  O: "10,10 30,10 30,30 10,30"
};

const TRIANGLE_SURFACE_SHAPES: Record<OdontogramSurface, string> = {
  B: "0,0 40,0 30,20 10,20",
  D: "40,0 40,40 30,20",
  L: "0,40 40,40 30,20 10,20",
  M: "0,0 10,20 0,40",
  O: "10,19 30,19 30,21 10,21"
};

export const ANTERIOR_TOOTH_DIVIDER_PATH =
  "M0 0 L10 20 L0 40 M40 0 L30 20 L40 40 M10 20 H30";

export function getOdontogramToothType(toothNumber: number): OdontogramToothType {
  const quadrant = Math.floor(toothNumber / 10);
  const position = toothNumber % 10;
  const isPrimary = quadrant >= 5 && quadrant <= 8;

  if (position === 1 || position === 2) return "incisor";
  if (position === 3) return "canine";
  if (isPrimary) return "molar";
  if (position === 4 || position === 5) return "premolar";
  return "molar";
}

export function usesTriangularOdontogramPattern(toothNumber: number): boolean {
  const quadrant = Math.floor(toothNumber / 10);
  const position = toothNumber % 10;
  const isPrimary = quadrant >= 5 && quadrant <= 8;

  return position <= 3 && (isPrimary || quadrant === 3 || quadrant === 4);
}

export function usesAnteriorOdontogramPattern(toothNumber: number): boolean {
  return usesTriangularOdontogramPattern(toothNumber);
}

export function getOdontogramSurfaceShapes(toothNumber: number): Record<OdontogramSurface, string> {
  return usesTriangularOdontogramPattern(toothNumber)
    ? TRIANGLE_SURFACE_SHAPES
    : BOX_SURFACE_SHAPES;
}
