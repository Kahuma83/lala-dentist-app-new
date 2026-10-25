import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { InventoryRecipeLine } from "../utils/inventoryTreatmentRecipes";

export interface InventoryTreatmentRecipeChange {
  id: string;
  branchId: string;
  serviceCode: string;
  materials: InventoryRecipeLine[];
  status: "PENDING" | "APPROVED" | "REJECTED";
  submittedByName: string;
  submittedByRole: string;
  note: string | null;
  reviewedByName: string | null;
  reviewedByRole: string | null;
  reviewNote: string | null;
  submittedAt: string;
  reviewedAt: string | null;
}

interface LocalRecipeChange extends InventoryTreatmentRecipeChange {
  submittedByRole: string;
}

interface LocalRecipeData {
  changes: LocalRecipeChange[];
  approved: Array<{ branchId: string; serviceCode: string; materials: InventoryRecipeLine[] }>;
}

const localStorageKey = "lala-dentist-inventory-recipes-v1";

function readLocalData(): LocalRecipeData {
  const value = localStorage.getItem(localStorageKey);
  if (!value) return { changes: [], approved: [] };
  const parsed: unknown = JSON.parse(value);
  if (
    typeof parsed !== "object" || parsed === null
    || !("changes" in parsed) || !Array.isArray(parsed.changes)
    || !("approved" in parsed) || !Array.isArray(parsed.approved)
  ) {
    throw new Error("Data resep inventori lokal memiliki format tidak valid.");
  }
  return parsed as LocalRecipeData;
}

function throwIfError(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

function mapChange(row: Record<string, unknown>): InventoryTreatmentRecipeChange {
  return {
    id: String(row.id),
    branchId: String(row.branch_id),
    serviceCode: String(row.service_code),
    materials: row.proposed_materials as InventoryRecipeLine[],
    status: row.status as InventoryTreatmentRecipeChange["status"],
    submittedByName: String(row.submitted_by_name_snapshot),
    submittedByRole: String(row.submitted_by_role_snapshot),
    note: row.note == null ? null : String(row.note),
    reviewedByName: row.reviewed_by_name_snapshot == null ? null : String(row.reviewed_by_name_snapshot),
    reviewedByRole: row.reviewed_by_role_snapshot == null ? null : String(row.reviewed_by_role_snapshot),
    reviewNote: row.review_note == null ? null : String(row.review_note),
    submittedAt: String(row.submitted_at),
    reviewedAt: row.reviewed_at == null ? null : String(row.reviewed_at)
  };
}

export async function getApprovedInventoryTreatmentRecipe(
  branchId: string,
  serviceCode: string
): Promise<InventoryRecipeLine[] | null> {
  if (!isSupabaseConfigured) {
    return readLocalData().approved.find((recipe) =>
      recipe.branchId === branchId && recipe.serviceCode === serviceCode
    )?.materials || null;
  }
  const { data, error } = await supabase
    .from("inventory_treatment_recipes")
    .select("materials")
    .eq("branch_id", branchId)
    .eq("service_code", serviceCode)
    .maybeSingle();
  throwIfError(error);
  return data?.materials as InventoryRecipeLine[] || null;
}

export async function listInventoryTreatmentRecipeChanges(
  branchId: string
): Promise<InventoryTreatmentRecipeChange[]> {
  if (!isSupabaseConfigured) {
    return readLocalData().changes
      .filter((change) => change.branchId === branchId)
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  }
  const { data, error } = await supabase
    .from("inventory_treatment_recipe_changes")
    .select("*")
    .eq("branch_id", branchId)
    .order("submitted_at", { ascending: false });
  throwIfError(error);
  return (data || []).map((row) => mapChange(row));
}

export async function submitInventoryTreatmentRecipeChange(input: {
  branchId: string;
  serviceCode: string;
  materials: InventoryRecipeLine[];
  note: string;
  submittedByName: string;
  submittedByRole: string;
}): Promise<void> {
  if (input.submittedByRole === "DOCTOR") {
    throw new Error("Dokter hanya dapat meninjau dan menyetujui usulan resep bahan.");
  }
  if (input.materials.some((material) =>
    !material.itemCode.trim() || !Number.isFinite(material.quantity) || material.quantity <= 0
  )) {
    throw new Error("Semua bahan harus memiliki kode dan jumlah lebih dari nol.");
  }
  if (!isSupabaseConfigured) {
    const data = readLocalData();
    if (data.changes.some((change) =>
      change.branchId === input.branchId
      && change.serviceCode === input.serviceCode
      && change.status === "PENDING"
    )) {
      throw new Error("Masih ada perubahan resep yang menunggu validasi untuk tindakan ini.");
    }
    data.changes.push({
      id: crypto.randomUUID(),
      branchId: input.branchId,
      serviceCode: input.serviceCode,
      materials: input.materials,
      status: "PENDING",
      submittedByName: input.submittedByName,
      submittedByRole: input.submittedByRole,
      note: input.note.trim() || null,
      reviewedByName: null,
      reviewedByRole: null,
      reviewNote: null,
      submittedAt: new Date().toISOString(),
      reviewedAt: null
    });
    localStorage.setItem(localStorageKey, JSON.stringify(data));
    return;
  }
  const { error } = await supabase.rpc("submit_inventory_treatment_recipe_change", {
    p_branch_id: input.branchId,
    p_service_code: input.serviceCode,
    p_materials: input.materials,
    p_note: input.note.trim() || null
  });
  throwIfError(error);
}

export async function reviewInventoryTreatmentRecipeChange(
  changeId: string,
  approve: boolean,
  reviewNote = "",
  reviewerName = "Dokter",
  reviewerRole = "DOCTOR"
): Promise<void> {
  if (!isSupabaseConfigured) {
    const data = readLocalData();
    const change = data.changes.find((row) => row.id === changeId);
    if (!change || change.status !== "PENDING") {
      throw new Error("Perubahan resep tidak ditemukan atau sudah ditinjau.");
    }
    change.status = approve ? "APPROVED" : "REJECTED";
    change.reviewedByName = reviewerName;
    change.reviewedByRole = reviewerRole;
    change.reviewNote = reviewNote.trim() || null;
    change.reviewedAt = new Date().toISOString();
    if (approve) {
      const existing = data.approved.find((row) =>
        row.branchId === change.branchId && row.serviceCode === change.serviceCode
      );
      if (existing) existing.materials = change.materials;
      else data.approved.push({
        branchId: change.branchId,
        serviceCode: change.serviceCode,
        materials: change.materials
      });
    }
    localStorage.setItem(localStorageKey, JSON.stringify(data));
    return;
  }
  const { error } = await supabase.rpc("review_inventory_treatment_recipe_change", {
    p_change_id: changeId,
    p_approve: approve,
    p_review_note: reviewNote.trim() || null
  });
  throwIfError(error);
}
