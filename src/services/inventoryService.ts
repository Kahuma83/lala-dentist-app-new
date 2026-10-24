import { isSupabaseConfigured, supabase } from "../lib/supabase";

export type InventoryCategory =
  | "BAHAN_TINDAKAN"
  | "ALAT_MEDIS"
  | "PERLENGKAPAN_KANTOR"
  | "LAINNYA";
export type InventoryMovementType = "IN" | "OUT";

export interface InventoryItem {
  id: string;
  branchId: string;
  itemCode: string;
  name: string;
  category: InventoryCategory;
  unit: string;
  currentStock: number;
  minimumStock: number;
  storageLocation: string | null;
  isActive: boolean;
  updatedAt: string;
}

export interface InventoryMovement {
  id: string;
  branchId: string;
  itemId: string;
  movementType: InventoryMovementType;
  quantity: number;
  previousStock: number;
  newStock: number;
  unitCost: number | null;
  reference: string | null;
  note: string | null;
  patientVisitId: string | null;
  treatmentJobId: string | null;
  performedByName: string;
  createdAt: string;
}

export interface InventoryItemInput {
  branchId: string;
  itemCode: string;
  name: string;
  category: InventoryCategory;
  unit: string;
  minimumStock: number;
  storageLocation: string;
}

interface StoredInventory {
  items: InventoryItem[];
  movements: InventoryMovement[];
  consumedTreatmentIds?: string[];
  consumedTreatmentShortages?: Record<string, InventoryTreatmentStockShortage[]>;
}

export interface InventoryTreatmentStockShortage {
  itemCode: string;
  requested: number;
  deducted: number;
  shortage: number;
}

const mockStorageKey = "lala-dentist-inventory-v1";

function readMockInventory(): StoredInventory {
  try {
    const value = localStorage.getItem(mockStorageKey);
    if (!value) return { items: [], movements: [] };
    const parsed: unknown = JSON.parse(value);
    if (
      typeof parsed === "object" && parsed !== null
      && "items" in parsed && Array.isArray(parsed.items)
      && "movements" in parsed && Array.isArray(parsed.movements)
    ) {
      return parsed as StoredInventory;
    }
    throw new Error("Data inventori lokal memiliki format yang tidak valid.");
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error("Data inventori lokal rusak dan tidak dapat dibaca.");
    }
    throw error;
  }
}

function writeMockInventory(value: StoredInventory): void {
  localStorage.setItem(mockStorageKey, JSON.stringify(value));
}

function throwSupabaseError(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export async function listInventoryItems(
  branchId?: string | null,
  includeArchived = false
): Promise<InventoryItem[]> {
  if (!isSupabaseConfigured) {
    return readMockInventory().items
      .filter((item) => (includeArchived || item.isActive) && (!branchId || item.branchId === branchId))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  let query = supabase.from("inventory_items").select("*").order("name");
  if (!includeArchived) query = query.eq("is_active", true);
  if (branchId) query = query.eq("branch_id", branchId);
  const { data, error } = await query;
  throwSupabaseError(error);
  return (data || []).map((row) => ({
    id: row.id,
    branchId: row.branch_id,
    itemCode: row.item_code,
    name: row.name,
    category: row.category,
    unit: row.unit,
    currentStock: Number(row.current_stock),
    minimumStock: Number(row.minimum_stock),
    storageLocation: row.storage_location,
    isActive: row.is_active,
    updatedAt: row.updated_at
  }));
}

export async function saveInventoryItem(
  input: InventoryItemInput,
  userName: string,
  itemId?: string
): Promise<InventoryItem> {
  if (!isSupabaseConfigured) {
    const inventory = readMockInventory();
    const existing = itemId ? inventory.items.find((item) => item.id === itemId) : null;
    const duplicate = inventory.items.find((item) =>
      item.branchId === input.branchId
      && item.itemCode.toLowerCase() === input.itemCode.trim().toLowerCase()
      && item.id !== itemId
    );
    if (duplicate) throw new Error("Kode barang sudah digunakan di cabang ini.");
    if (itemId && !existing) throw new Error("Barang inventori tidak ditemukan.");
    const item: InventoryItem = {
      id: itemId || crypto.randomUUID(),
      branchId: input.branchId,
      itemCode: input.itemCode.trim().toUpperCase(),
      name: input.name.trim(),
      category: input.category,
      unit: input.unit.trim(),
      currentStock: existing?.currentStock || 0,
      minimumStock: input.minimumStock,
      storageLocation: input.storageLocation.trim() || null,
      isActive: true,
      updatedAt: new Date().toISOString()
    };
    inventory.items = existing
      ? inventory.items.map((row) => row.id === item.id ? item : row)
      : [...inventory.items, item];
    writeMockInventory(inventory);
    return item;
  }

  const payload = {
    item_code: input.itemCode.trim().toUpperCase(),
    name: input.name.trim(),
    category: input.category,
    unit: input.unit.trim(),
    minimum_stock: input.minimumStock,
    storage_location: input.storageLocation.trim() || null,
    is_active: true
  };
  const query = itemId
    ? supabase.from("inventory_items").update(payload).eq("id", itemId)
    : supabase.from("inventory_items").insert({ ...payload, branch_id: input.branchId });
  const { data, error } = await query.select("*").single();
  throwSupabaseError(error);
  if (!data) throw new Error("Barang tersimpan tanpa data hasil. Muat ulang lalu periksa daftar inventori.");
  return {
    id: data.id,
    branchId: data.branch_id,
    itemCode: data.item_code,
    name: data.name,
    category: data.category,
    unit: data.unit,
    currentStock: Number(data.current_stock),
    minimumStock: Number(data.minimum_stock),
    storageLocation: data.storage_location,
    isActive: data.is_active,
    updatedAt: data.updated_at
  };
}

export async function archiveInventoryItem(itemId: string): Promise<void> {
  if (!isSupabaseConfigured) {
    const inventory = readMockInventory();
    inventory.items = inventory.items.map((item) =>
      item.id === itemId ? { ...item, isActive: false } : item
    );
    writeMockInventory(inventory);
    return;
  }
  const { error } = await supabase.from("inventory_items")
    .update({ is_active: false })
    .eq("id", itemId);
  throwSupabaseError(error);
}

export async function recordInventoryMovement(input: {
  itemId: string;
  movementType: InventoryMovementType;
  quantity: number;
  userName: string;
  note?: string;
  reference?: string;
  unitCost?: number | null;
  patientVisitId?: string | null;
  treatmentJobId?: string | null;
}): Promise<InventoryMovement> {
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    throw new Error("Jumlah pergerakan stok harus lebih besar dari nol.");
  }
  if (!isSupabaseConfigured) {
    const inventory = readMockInventory();
    const item = inventory.items.find((row) => row.id === input.itemId && row.isActive);
    if (!item) throw new Error("Barang inventori tidak ditemukan atau sudah diarsipkan.");
    const previousStock = item.currentStock;
    if (input.movementType === "OUT" && previousStock < input.quantity) {
      throw new Error(`Stok tidak cukup. Tersedia ${previousStock} ${item.unit}.`);
    }
    const newStock = input.movementType === "IN"
      ? previousStock + input.quantity
      : previousStock - input.quantity;
    const movement: InventoryMovement = {
      id: crypto.randomUUID(),
      branchId: item.branchId,
      itemId: item.id,
      movementType: input.movementType,
      quantity: input.quantity,
      previousStock,
      newStock,
      unitCost: input.unitCost ?? null,
      reference: input.reference?.trim() || null,
      note: input.note?.trim() || null,
      patientVisitId: input.patientVisitId || null,
      treatmentJobId: input.treatmentJobId || null,
      performedByName: input.userName,
      createdAt: new Date().toISOString()
    };
    inventory.items = inventory.items.map((row) =>
      row.id === item.id ? { ...row, currentStock: newStock, updatedAt: movement.createdAt } : row
    );
    inventory.movements = [movement, ...inventory.movements];
    writeMockInventory(inventory);
    return movement;
  }

  const { data, error } = await supabase.rpc("record_inventory_movement", {
    p_item_id: input.itemId,
    p_movement_type: input.movementType,
    p_quantity: input.quantity,
    p_note: input.note?.trim() || null,
    p_reference: input.reference?.trim() || null,
    p_unit_cost: input.unitCost ?? null,
    p_patient_visit_id: input.patientVisitId || null,
    p_treatment_job_id: input.treatmentJobId || null
  });
  throwSupabaseError(error);
  if (!data) throw new Error("Perubahan stok tidak mengembalikan data. Muat ulang lalu periksa riwayat.");
  return {
    id: data.id,
    branchId: data.branch_id,
    itemId: data.item_id,
    movementType: data.movement_type,
    quantity: Number(data.quantity),
    previousStock: Number(data.previous_stock),
    newStock: Number(data.new_stock),
    unitCost: data.unit_cost == null ? null : Number(data.unit_cost),
    reference: data.reference,
    note: data.note,
    patientVisitId: data.patient_visit_id,
    treatmentJobId: data.treatment_job_id,
    performedByName: data.performed_by_name_snapshot,
    createdAt: data.created_at
  };
}

export async function recordTreatmentInventoryUsage(input: {
  treatmentJobId: string;
  patientVisitId: string;
  branchId: string;
  serviceName: string;
  materials: Array<{ itemCode: string; quantity: number }>;
  userName: string;
}): Promise<{ alreadyRecorded: boolean; shortages: InventoryTreatmentStockShortage[] }> {
  if (input.materials.length === 0) return { alreadyRecorded: false, shortages: [] };
  if (input.materials.some((material) =>
    !material.itemCode.trim() || !Number.isFinite(material.quantity) || material.quantity <= 0
  )) {
    throw new Error("Resep bahan tindakan memiliki kode atau jumlah yang tidak valid.");
  }

  if (!isSupabaseConfigured) {
    const inventory = readMockInventory();
    const consumedTreatmentIds = inventory.consumedTreatmentIds || [];
    if (consumedTreatmentIds.includes(input.treatmentJobId)) {
      return {
        alreadyRecorded: true,
        shortages: inventory.consumedTreatmentShortages?.[input.treatmentJobId] || []
      };
    }

    const deductions = input.materials.map((material) => {
      const item = inventory.items.find((row) =>
        row.branchId === input.branchId
        && row.itemCode.toUpperCase() === material.itemCode.trim().toUpperCase()
        && row.isActive
      );
      const previouslyUsed = item ? inventory.movements
        .filter((movement) =>
          movement.treatmentJobId === input.treatmentJobId
          && movement.itemId === item.id
          && movement.movementType === "OUT"
        )
        .reduce((total, movement) => total + movement.quantity, 0) : 0;
      const remaining = Math.max(material.quantity - previouslyUsed, 0);
      const available = item?.currentStock || 0;
      const quantity = Math.min(remaining, available);
      return {
        item,
        itemCode: item?.itemCode || material.itemCode.trim().toUpperCase(),
        quantity,
        shortage: Math.max(remaining - quantity, 0),
        requested: remaining
      };
    });
    const shortages = deductions
      .filter(({ shortage }) => shortage > 0)
      .map(({ itemCode, requested, quantity, shortage }) => ({
        itemCode,
        requested,
        deducted: quantity,
        shortage
      }));

    const createdAt = new Date().toISOString();
    const movements: InventoryMovement[] = deductions.flatMap(({ item, quantity }) => {
      if (!item || quantity <= 0) return [];
      return [{
        id: crypto.randomUUID(),
        branchId: item.branchId,
        itemId: item.id,
        movementType: "OUT",
        quantity,
        previousStock: item.currentStock,
        newStock: item.currentStock - quantity,
        unitCost: null,
        reference: `Pasien / tindakan: ${input.treatmentJobId}`,
        note: `Pemakaian standar tindakan ${input.serviceName}`,
        patientVisitId: input.patientVisitId,
        treatmentJobId: input.treatmentJobId,
        performedByName: input.userName,
        createdAt
      }];
    });
    const deductionByItem = new Map<string, number>();
    deductions.forEach(({ item, quantity }) => {
      if (item) deductionByItem.set(item.id, quantity);
    });
    inventory.items = inventory.items.map((item) => {
      const quantity = deductionByItem.get(item.id) || 0;
      return quantity > 0
        ? { ...item, currentStock: item.currentStock - quantity, updatedAt: createdAt }
        : item;
    });
    inventory.movements = [...movements, ...inventory.movements];
    inventory.consumedTreatmentIds = [...consumedTreatmentIds, input.treatmentJobId];
    inventory.consumedTreatmentShortages = {
      ...inventory.consumedTreatmentShortages,
      [input.treatmentJobId]: shortages
    };
    writeMockInventory(inventory);
    return { alreadyRecorded: false, shortages };
  }

  const { data, error } = await supabase.rpc("record_inventory_treatment_usage", {
    p_treatment_job_id: input.treatmentJobId,
    p_materials: input.materials
  });
  throwSupabaseError(error);
  if (!data || typeof data.alreadyRecorded !== "boolean") {
    throw new Error("Respons pemakaian otomatis tidak valid. Periksa riwayat inventori sebelum mencoba lagi.");
  }
  const shortages = Array.isArray(data.shortages) ? data.shortages.map((shortage: any) => ({
    itemCode: String(shortage.itemCode),
    requested: Number(shortage.requested),
    deducted: Number(shortage.deducted),
    shortage: Number(shortage.shortage)
  })) : [];
  return { alreadyRecorded: data.alreadyRecorded, shortages };
}

export async function listInventoryMovements(input: {
  branchId?: string | null;
  itemId?: string | null;
  limit?: number;
} = {}): Promise<InventoryMovement[]> {
  if (!isSupabaseConfigured) {
    return readMockInventory().movements
      .filter((movement) =>
        (!input.branchId || movement.branchId === input.branchId)
        && (!input.itemId || movement.itemId === input.itemId)
      )
      .slice(0, input.limit || 500);
  }
  let query = supabase.from("inventory_movements")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(input.limit || 500);
  if (input.branchId) query = query.eq("branch_id", input.branchId);
  if (input.itemId) query = query.eq("item_id", input.itemId);
  const { data, error } = await query;
  throwSupabaseError(error);
  return (data || []).map((row) => ({
    id: row.id,
    branchId: row.branch_id,
    itemId: row.item_id,
    movementType: row.movement_type,
    quantity: Number(row.quantity),
    previousStock: Number(row.previous_stock),
    newStock: Number(row.new_stock),
    unitCost: row.unit_cost == null ? null : Number(row.unit_cost),
    reference: row.reference,
    note: row.note,
    patientVisitId: row.patient_visit_id,
    treatmentJobId: row.treatment_job_id,
    performedByName: row.performed_by_name_snapshot,
    createdAt: row.created_at
  }));
}
