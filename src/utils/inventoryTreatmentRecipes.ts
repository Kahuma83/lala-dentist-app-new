export interface InventoryRecipeLine {
  itemCode: string;
  quantity: number;
}

export interface InventoryTreatmentRecipe {
  lines: InventoryRecipeLine[];
  requiresBraceMaterialChoice?: boolean;
}

const commonSingleUse = [
  { itemCode: "AM-001", quantity: 1 },
  { itemCode: "AM-002", quantity: 1 }
];
const cotton = (quantity: number) => ({ itemCode: "BT-013", quantity });

const recipes: Record<string, InventoryTreatmentRecipe> = {
  CONSULTATION: { lines: [...commonSingleUse, cotton(2)] },
  SCALING: {
    lines: [...commonSingleUse, { itemCode: "BT-006", quantity: 0.5 }, { itemCode: "BT-008", quantity: 1 }, cotton(3)]
  },
  FILLING_PERMANENT: {
    lines: [...commonSingleUse, { itemCode: "BT-001", quantity: 0.25 }, { itemCode: "BT-002", quantity: 0.1 }, { itemCode: "BT-003", quantity: 0.1 }, cotton(4)]
  },
  EXTRACTION: {
    lines: [...commonSingleUse, { itemCode: "AM-003", quantity: 1 }, { itemCode: "AM-004", quantity: 1 }, { itemCode: "BT-009", quantity: 5 }, cotton(6)]
  },
  BLEACHING: { lines: [...commonSingleUse, cotton(4)] },
  BRACKET_REMOVE: {
    lines: [...commonSingleUse, cotton(3), { itemCode: "OR-012", quantity: 0.05 }]
  },
  BRACKET_CONTROL_FULL: { lines: [...commonSingleUse, cotton(3)], requiresBraceMaterialChoice: true },
  BRACKET_CONTROL_SINGLE: { lines: [...commonSingleUse, cotton(2)], requiresBraceMaterialChoice: true },
  ABSCESS_DRAINAGE: {
    lines: [{ itemCode: "AM-001", quantity: 1 }, { itemCode: "AM-002", quantity: 2 }, { itemCode: "AM-003", quantity: 1 }, { itemCode: "AM-004", quantity: 2 }, { itemCode: "BT-009", quantity: 10 }, cotton(8)]
  },
  GIPAL_INSERTION: {
    lines: [...commonSingleUse, cotton(5), { itemCode: "BT-002", quantity: 0.15 }, { itemCode: "BT-003", quantity: 0.15 }, { itemCode: "OR-012", quantity: 0.5 }]
  },
  GIPAL_CEMENTATION: {
    lines: [...commonSingleUse, cotton(4), { itemCode: "OR-012", quantity: 0.3 }]
  },
  MEDICATION: {
    lines: [...commonSingleUse, { itemCode: "BT-009", quantity: 10 }, cotton(3)]
  },
  ODONTECTOMY: {
    lines: [{ itemCode: "AM-001", quantity: 2 }, { itemCode: "AM-002", quantity: 2 }, { itemCode: "AM-003", quantity: 2 }, { itemCode: "AM-004", quantity: 2 }, { itemCode: "BT-009", quantity: 15 }, cotton(10)]
  },
  WIRE_CUT: { lines: [...commonSingleUse, cotton(2)] },
  POLYP_REMOVAL: {
    lines: [{ itemCode: "AM-001", quantity: 1 }, { itemCode: "AM-002", quantity: 2 }, { itemCode: "AM-003", quantity: 1 }, { itemCode: "AM-004", quantity: 1 }, { itemCode: "BT-009", quantity: 10 }, cotton(6)]
  },
  ROP: {
    lines: [...commonSingleUse, { itemCode: "BT-002", quantity: 0.2 }, { itemCode: "BT-003", quantity: 0.2 }, cotton(5)]
  },
  VENEER: {
    lines: [...commonSingleUse, { itemCode: "BT-001", quantity: 0.5 }, { itemCode: "BT-002", quantity: 0.2 }, { itemCode: "BT-003", quantity: 0.2 }, cotton(6)]
  },
  GIPAL_SETTLEMENT: { lines: [] },
  ABSCESS: {
    lines: [...commonSingleUse, { itemCode: "AM-003", quantity: 1 }, { itemCode: "AM-004", quantity: 1 }, { itemCode: "BT-009", quantity: 10 }, cotton(5)]
  },
  OTHER: { lines: [...commonSingleUse, cotton(2)] },
  ROOT_CANAL: {
    lines: [...commonSingleUse, { itemCode: "BT-002", quantity: 0.2 }, { itemCode: "BT-003", quantity: 0.2 }, { itemCode: "BT-009", quantity: 5 }, cotton(6)]
  }
};

const serviceNameAliases: Record<string, string> = {
  "KONSULTASI": "CONSULTATION",
  "SCALING": "SCALING",
  "TAMBAL PERMANEN": "FILLING_PERMANENT",
  "CABUT": "EXTRACTION",
  "BLEACHING": "BLEACHING",
  "BRACKET LEPAS": "BRACKET_REMOVE",
  "KONTROL BEHEL RA RB": "BRACKET_CONTROL_FULL",
  "KONTROL BEHEL RA ATAU RB SAJA": "BRACKET_CONTROL_SINGLE",
  "DRAINASE ABSES": "ABSCESS_DRAINAGE",
  "INSERSI GIPAL CROWN PFM": "GIPAL_INSERTION",
  "LEM GIPAL CROWN PFM": "GIPAL_CEMENTATION",
  "MEDIKASI": "MEDICATION",
  "ODONTEKTOMI": "ODONTECTOMY",
  "POTONG KAWAT": "WIRE_CUT",
  "POTONG POLIP": "POLYP_REMOVAL",
  "ROP": "ROP",
  "VENEER": "VENEER",
  "PELUNASAN GIPAL": "GIPAL_SETTLEMENT",
  "ABSES": "ABSCESS",
  "YANG LAIN": "OTHER",
  "PERAWATAN SALURAN AKAR PSA": "ROOT_CANAL",
  "SCALING POLISHING PEMBERSIHAN KARANG": "SCALING"
};

export function getInventoryTreatmentRecipe(serviceCodeOrName: string | undefined): InventoryTreatmentRecipe | null {
  if (!serviceCodeOrName) return null;
  const directMatch = recipes[serviceCodeOrName.trim().toUpperCase()];
  if (directMatch) return directMatch;
  const normalized = serviceCodeOrName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
  const recipeCode = recipes[normalized] ? normalized : serviceNameAliases[normalized];
  return recipeCode ? recipes[recipeCode] : null;
}
