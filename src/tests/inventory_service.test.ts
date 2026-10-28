import { afterEach, describe, expect, it, vi } from "vitest";
import {
  listInventoryItems,
  listInventoryMovements,
  recordInventoryMovement,
  recordTreatmentInventoryUsage,
  saveInventoryItem
} from "../services/inventoryService";
import { getInventoryTreatmentRecipe } from "../utils/inventoryTreatmentRecipes";
import {
  getApprovedInventoryTreatmentRecipe,
  listInventoryTreatmentRecipeChanges,
  reviewInventoryTreatmentRecipeChange,
  submitInventoryTreatmentRecipeChange
} from "../services/inventoryRecipeService";
import * as fs from "node:fs";
import * as path from "node:path";

vi.mock("../lib/supabase", () => ({
  isSupabaseConfigured: false,
  supabase: {}
}));

const localStorageData = new Map<string, string>();

afterEach(() => {
  localStorageData.clear();
  vi.unstubAllGlobals();
});

describe("Inventory service", () => {
  it("tracks inbound and treatment usage as an auditable stock ledger", async () => {
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => localStorageData.get(key) ?? null,
      setItem: (key: string, value: string) => localStorageData.set(key, value)
    });

    const item = await saveInventoryItem({
      branchId: "branch-gebang",
      itemCode: "BAH-001",
      name: "Sarung tangan",
      category: "BAHAN_TINDAKAN",
      unit: "kotak",
      minimumStock: 2,
      storageLocation: "Lemari tindakan"
    }, "Admin");
    await recordInventoryMovement({
      itemId: item.id,
      movementType: "IN",
      quantity: 5,
      userName: "Admin",
      reference: "PO-001"
    });
    await recordInventoryMovement({
      itemId: item.id,
      movementType: "OUT",
      quantity: 2,
      userName: "Dokter",
      patientVisitId: "visit-001",
      treatmentJobId: "treatment-001"
    });

    await expect(listInventoryItems("branch-gebang")).resolves.toMatchObject([
      { id: item.id, currentStock: 3 }
    ]);
    await expect(listInventoryMovements({ itemId: item.id })).resolves.toMatchObject([
      {
        movementType: "OUT",
        previousStock: 5,
        newStock: 3,
        patientVisitId: "visit-001",
        treatmentJobId: "treatment-001",
        performedByName: "Dokter"
      },
      { movementType: "IN", previousStock: 0, newStock: 5, reference: "PO-001" }
    ]);
  });

  it("rejects usage that would make inventory negative", async () => {
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => localStorageData.get(key) ?? null,
      setItem: (key: string, value: string) => localStorageData.set(key, value)
    });
    const item = await saveInventoryItem({
      branchId: "branch-gebang",
      itemCode: "ALM-001",
      name: "Masker",
      category: "ALAT_MEDIS",
      unit: "pcs",
      minimumStock: 1,
      storageLocation: ""
    }, "Admin");

    await expect(recordInventoryMovement({
      itemId: item.id,
      movementType: "OUT",
      quantity: 1,
      userName: "Dokter"
    })).rejects.toThrow("Stok tidak cukup");
  });

  it("deducts a treatment recipe once and accounts for manually recorded usage", async () => {
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => localStorageData.get(key) ?? null,
      setItem: (key: string, value: string) => localStorageData.set(key, value)
    });
    const items = await Promise.all([
      ["AM-001", "Masker", "pcs"],
      ["AM-002", "Sarung Tangan", "pasang"],
      ["BT-013", "Kapas Gulung", "btg"]
    ].map(([itemCode, name, unit]) => saveInventoryItem({
      branchId: "branch-gebang",
      itemCode,
      name,
      category: "BAHAN_TINDAKAN",
      unit,
      minimumStock: 0,
      storageLocation: ""
    }, "Admin")));
    await Promise.all(items.map((item) => recordInventoryMovement({
      itemId: item.id,
      movementType: "IN",
      quantity: 5,
      userName: "Admin"
    })));
    await recordInventoryMovement({
      itemId: items[0].id,
      movementType: "OUT",
      quantity: 1,
      userName: "Dokter",
      patientVisitId: "visit-recipe",
      treatmentJobId: "treatment-recipe"
    });

    const input = {
      treatmentJobId: "treatment-recipe",
      patientVisitId: "visit-recipe",
      branchId: "branch-gebang",
      serviceName: "Konsultasi",
      materials: getInventoryTreatmentRecipe("CONSULTATION")!.lines,
      userName: "Dokter"
    };
    await expect(recordTreatmentInventoryUsage(input)).resolves.toEqual({ alreadyRecorded: false, shortages: [] });
    await expect(recordTreatmentInventoryUsage(input)).resolves.toEqual({ alreadyRecorded: true, shortages: [] });
    await expect(listInventoryItems("branch-gebang")).resolves.toMatchObject([
      { itemCode: "BT-013", currentStock: 3 },
      { itemCode: "AM-001", currentStock: 4 },
      { itemCode: "AM-002", currentStock: 4 }
    ]);
    await expect(listInventoryMovements({ branchId: "branch-gebang" })).resolves.toHaveLength(6);
  });

  it("deducts available stock, reports shortages, and does not deduct twice on retry", async () => {
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => localStorageData.get(key) ?? null,
      setItem: (key: string, value: string) => localStorageData.set(key, value)
    });
    const item = await saveInventoryItem({
      branchId: "branch-gebang",
      itemCode: "BT-009",
      name: "Bahan Tindakan",
      category: "BAHAN_TINDAKAN",
      unit: "ml",
      minimumStock: 0,
      storageLocation: ""
    }, "Admin");
    await recordInventoryMovement({
      itemId: item.id,
      movementType: "IN",
      quantity: 5,
      userName: "Admin"
    });
    const input = {
      treatmentJobId: "treatment-shortage",
      patientVisitId: "visit-shortage",
      branchId: "branch-gebang",
      serviceName: "Tindakan",
      materials: [{ itemCode: "BT-009", quantity: 10 }],
      userName: "Dokter"
    };

    await expect(recordTreatmentInventoryUsage(input)).resolves.toEqual({
      alreadyRecorded: false,
      shortages: [{ itemCode: "BT-009", requested: 10, deducted: 5, shortage: 5 }]
    });
    await expect(recordTreatmentInventoryUsage(input)).resolves.toEqual({
      alreadyRecorded: true,
      shortages: [{ itemCode: "BT-009", requested: 10, deducted: 5, shortage: 5 }]
    });
    await expect(listInventoryItems("branch-gebang")).resolves.toMatchObject([
      { id: item.id, currentStock: 0 }
    ]);
    await expect(listInventoryMovements({ itemId: item.id })).resolves.toHaveLength(2);
  });

  it("reconciles treatment shortages automatically from later stock receipts", async () => {
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => localStorageData.get(key) ?? null,
      setItem: (key: string, value: string) => localStorageData.set(key, value)
    });
    const item = await saveInventoryItem({
      branchId: "branch-gebang",
      itemCode: "BT-010",
      name: "Bahan tindakan tertunda",
      category: "BAHAN_TINDAKAN",
      unit: "ml",
      minimumStock: 0,
      storageLocation: ""
    }, "Admin");
    const input = {
      treatmentJobId: "treatment-pending-shortage",
      patientVisitId: "visit-pending-shortage",
      branchId: "branch-gebang",
      serviceName: "Tindakan",
      materials: [{ itemCode: "BT-010", quantity: 4 }],
      userName: "Dokter"
    };
    const laterTreatmentInput = {
      ...input,
      treatmentJobId: "treatment-later-shortage",
      patientVisitId: "visit-later-shortage",
      materials: [{ itemCode: "BT-010", quantity: 3 }]
    };

    await expect(recordTreatmentInventoryUsage(input)).resolves.toMatchObject({
      alreadyRecorded: false,
      shortages: [{ itemCode: "BT-010", requested: 4, deducted: 0, shortage: 4 }]
    });
    await expect(recordTreatmentInventoryUsage(laterTreatmentInput)).resolves.toMatchObject({
      alreadyRecorded: false,
      shortages: [{ itemCode: "BT-010", requested: 3, deducted: 0, shortage: 3 }]
    });

    await recordInventoryMovement({
      itemId: item.id,
      movementType: "IN",
      quantity: 2,
      userName: "Admin",
      reference: "PO-002"
    });
    await expect(recordTreatmentInventoryUsage(input)).resolves.toMatchObject({
      alreadyRecorded: true,
      shortages: [{ itemCode: "BT-010", requested: 4, deducted: 2, shortage: 2 }]
    });
    await expect(listInventoryItems("branch-gebang")).resolves.toMatchObject([
      { id: item.id, currentStock: 0 }
    ]);

    await recordInventoryMovement({
      itemId: item.id,
      movementType: "IN",
      quantity: 3,
      userName: "Admin",
      reference: "PO-003"
    });
    await expect(recordTreatmentInventoryUsage(input)).resolves.toMatchObject({
      alreadyRecorded: true,
      shortages: [{ itemCode: "BT-010", requested: 4, deducted: 4, shortage: 0 }]
    });
    await expect(recordTreatmentInventoryUsage(laterTreatmentInput)).resolves.toMatchObject({
      alreadyRecorded: true,
      shortages: [{ itemCode: "BT-010", requested: 3, deducted: 1, shortage: 2 }]
    });
    await recordInventoryMovement({
      itemId: item.id,
      movementType: "IN",
      quantity: 3,
      userName: "Admin",
      reference: "PO-004"
    });
    await expect(recordTreatmentInventoryUsage(laterTreatmentInput)).resolves.toMatchObject({
      alreadyRecorded: true,
      shortages: [{ itemCode: "BT-010", requested: 3, deducted: 3, shortage: 0 }]
    });
    await expect(listInventoryItems("branch-gebang")).resolves.toMatchObject([
      { id: item.id, currentStock: 1 }
    ]);
    await expect(listInventoryMovements({ itemId: item.id })).resolves.toMatchObject([
      {
        movementType: "OUT",
        quantity: 2,
        patientVisitId: "visit-later-shortage",
        treatmentJobId: "treatment-later-shortage"
      },
      { movementType: "IN", quantity: 3, reference: "PO-004" },
      {
        movementType: "OUT",
        quantity: 2,
        patientVisitId: "visit-pending-shortage",
        treatmentJobId: "treatment-pending-shortage"
      },
      {
        movementType: "OUT",
        quantity: 1,
        patientVisitId: "visit-later-shortage",
        treatmentJobId: "treatment-later-shortage"
      },
      { movementType: "IN", quantity: 3, reference: "PO-003" },
      {
        movementType: "OUT",
        quantity: 2,
        patientVisitId: "visit-pending-shortage",
        treatmentJobId: "treatment-pending-shortage"
      },
      { movementType: "IN", quantity: 2, reference: "PO-002" }
    ]);
  });

  it("does not reconcile shortages across branches with matching item codes", async () => {
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => localStorageData.get(key) ?? null,
      setItem: (key: string, value: string) => localStorageData.set(key, value)
    });
    const items = await Promise.all(["branch-gebang", "branch-sambiroto"].map((branchId) =>
      saveInventoryItem({
        branchId,
        itemCode: "BT-011",
        name: "Bahan tindakan",
        category: "BAHAN_TINDAKAN",
        unit: "ml",
        minimumStock: 0,
        storageLocation: ""
      }, "Admin")
    ));
    for (const [index, branchId] of ["branch-gebang", "branch-sambiroto"].entries()) {
      await recordTreatmentInventoryUsage({
        treatmentJobId: `treatment-${branchId}`,
        patientVisitId: `visit-${branchId}`,
        branchId,
        serviceName: "Tindakan",
        materials: [{ itemCode: "BT-011", quantity: 2 }],
        userName: "Dokter"
      });
      expect(items[index].branchId).toBe(branchId);
    }

    await recordInventoryMovement({
      itemId: items[0].id,
      movementType: "IN",
      quantity: 2,
      userName: "Admin"
    });

    await expect(recordTreatmentInventoryUsage({
      treatmentJobId: "treatment-branch-gebang",
      patientVisitId: "visit-branch-gebang",
      branchId: "branch-gebang",
      serviceName: "Tindakan",
      materials: [{ itemCode: "BT-011", quantity: 2 }],
      userName: "Dokter"
    })).resolves.toMatchObject({
      alreadyRecorded: true,
      shortages: [{ shortage: 0 }]
    });
    await expect(recordTreatmentInventoryUsage({
      treatmentJobId: "treatment-branch-sambiroto",
      patientVisitId: "visit-branch-sambiroto",
      branchId: "branch-sambiroto",
      serviceName: "Tindakan",
      materials: [{ itemCode: "BT-011", quantity: 2 }],
      userName: "Dokter"
    })).resolves.toMatchObject({
      alreadyRecorded: true,
      shortages: [{ shortage: 2 }]
    });
    await expect(listInventoryItems("branch-gebang")).resolves.toMatchObject([
      { currentStock: 0 }
    ]);
    await expect(listInventoryItems("branch-sambiroto")).resolves.toMatchObject([
      { currentStock: 0 }
    ]);
  });

  it("provides standard recipes for each treatment, with one selected brace material", () => {
    const serviceCodes = [
      "CONSULTATION", "SCALING", "FILLING_PERMANENT", "EXTRACTION", "BLEACHING",
      "BRACKET_REMOVE", "BRACKET_CONTROL_FULL", "BRACKET_CONTROL_SINGLE", "ABSCESS_DRAINAGE",
      "GIPAL_INSERTION", "GIPAL_CEMENTATION", "MEDICATION", "ODONTECTOMY", "WIRE_CUT",
      "POLYP_REMOVAL", "ROP", "VENEER", "GIPAL_SETTLEMENT", "ABSCESS", "OTHER", "ROOT_CANAL"
    ];
    expect(serviceCodes.every((code) => getInventoryTreatmentRecipe(code) !== null)).toBe(true);
    expect(getInventoryTreatmentRecipe("CONSULTATION")?.lines).toEqual([
      { itemCode: "AM-001", quantity: 1 },
      { itemCode: "AM-002", quantity: 1 },
      { itemCode: "BT-013", quantity: 2 }
    ]);
    expect(getInventoryTreatmentRecipe("Konsultasi")).toEqual(getInventoryTreatmentRecipe("CONSULTATION"));
    expect(getInventoryTreatmentRecipe("BRACKET_CONTROL_FULL")?.requiresBraceMaterialChoice).toBe(true);
    expect(getInventoryTreatmentRecipe("GIPAL_SETTLEMENT")?.lines).toEqual([]);
    expect(getInventoryTreatmentRecipe("UNKNOWN_SERVICE")).toBeNull();
  });

  it("requires recipe approval before branch corrections become active", async () => {
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => localStorageData.get(key) ?? null,
      setItem: (key: string, value: string) => localStorageData.set(key, value)
    });
    await submitInventoryTreatmentRecipeChange({
      branchId: "branch-gebang",
      serviceCode: "CONSULTATION",
      materials: [{ itemCode: "AM-001", quantity: 2 }],
      note: "Koreksi pemakaian",
      submittedByName: "Asisten",
      submittedByRole: "DOCTOR_ASSISTANT"
    });
    const [pending] = await listInventoryTreatmentRecipeChanges("branch-gebang");
    expect(pending.status).toBe("PENDING");
    await expect(getApprovedInventoryTreatmentRecipe("branch-gebang", "CONSULTATION")).resolves.toBeNull();

    await reviewInventoryTreatmentRecipeChange(pending.id, true);
    await expect(getApprovedInventoryTreatmentRecipe("branch-gebang", "CONSULTATION")).resolves.toEqual([
      { itemCode: "AM-001", quantity: 2 }
    ]);
    await expect(listInventoryTreatmentRecipeChanges("branch-gebang")).resolves.toMatchObject([
      { status: "APPROVED", reviewedAt: expect.any(String) }
    ]);
  });

  it("does not allow doctors to submit recipe changes", async () => {
    await expect(submitInventoryTreatmentRecipeChange({
      branchId: "branch-gebang",
      serviceCode: "CONSULTATION",
      materials: [{ itemCode: "AM-001", quantity: 2 }],
      note: "Usulan dokter",
      submittedByName: "Dokter",
      submittedByRole: "DOCTOR"
    })).rejects.toThrow("Dokter hanya dapat meninjau dan menyetujui usulan resep bahan.");
  });

  it("defines inventory tables, branch policies, and atomic stock locking", () => {
    const migration = fs.readFileSync(
      path.resolve(process.cwd(), "supabase/migrations/20261124000000_branch_inventory.sql"),
      "utf8"
    );
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS public\.inventory_items/i);
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS public\.inventory_movements/i);
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.record_inventory_movement/i);
    expect(migration).toMatch(/FOR UPDATE/i);
    expect(migration).toMatch(/patient_visit_id UUID REFERENCES public\.patient_visits/i);
    expect(migration).toMatch(/public\.get_user_branch_id\(\)/i);
    const recipeMigration = fs.readFileSync(
      path.resolve(process.cwd(), "supabase/migrations/20261125000000_inventory_treatment_recipes.sql"),
      "utf8"
    );
    expect(recipeMigration).toMatch(/record_inventory_treatment_usage/i);
    expect(recipeMigration).toMatch(/ON CONFLICT \(treatment_job_id\) DO NOTHING/i);
    expect(recipeMigration).toMatch(/FOR UPDATE/i);
    const branchAccessMigration = fs.readFileSync(
      path.resolve(process.cwd(), "supabase/migrations/20261126000000_lock_inventory_to_assigned_branch.sql"),
      "utf8"
    );
    expect(branchAccessMigration).toMatch(/branch_id::TEXT = public\.get_user_branch_id\(\)::TEXT/i);
    expect(branchAccessMigration).toMatch(/v_item\.branch_id::TEXT <> public\.get_user_branch_id\(\)::TEXT/i);
    expect(branchAccessMigration).toMatch(/v_treatment\.branch_id::TEXT <> public\.get_user_branch_id\(\)::TEXT/i);
    expect(branchAccessMigration).not.toMatch(/user_can_manage_treatment_branch/i);
    const recipeReviewMigration = fs.readFileSync(
      path.resolve(process.cwd(), "supabase/migrations/20261127000000_inventory_treatment_recipe_review.sql"),
      "utf8"
    );
    expect(recipeReviewMigration).toMatch(/CREATE TABLE IF NOT EXISTS public\.inventory_treatment_recipes/i);
    expect(recipeReviewMigration).toMatch(/CREATE TABLE IF NOT EXISTS public\.inventory_treatment_recipe_changes/i);
    expect(recipeReviewMigration).toMatch(/v_actor\.role NOT IN \('SUPER_ADMIN', 'DOCTOR'\)/i);
    expect(recipeReviewMigration).toMatch(/Submitted materials do not match the approved recipe/i);
    const doctorRecipeApprovalMigration = fs.readFileSync(
      path.resolve(process.cwd(), "supabase/migrations/20261224000000_doctor_recipe_approval_only.sql"),
      "utf8"
    );
    expect(doctorRecipeApprovalMigration).toMatch(/prevent_doctor_recipe_submissions/i);
    expect(doctorRecipeApprovalMigration).toMatch(/NEW\.submitted_by_role_snapshot = 'DOCTOR'/i);
    const seedMigration = fs.readFileSync(
      path.resolve(process.cwd(), "supabase/migrations/20261128000000_seed_treatment_inventory_items.sql"),
      "utf8"
    );
    expect(seedMigration).toMatch(/CROSS JOIN/i);
    expect(seedMigration).toMatch(/WHERE branch\.is_active = true/i);
    expect(seedMigration).toMatch(/ON CONFLICT \(branch_id, item_code\) DO NOTHING/i);
    expect(seedMigration.match(/\('(AM|BT|OR)-\d{3}'/g)).toHaveLength(16);
    expect(seedMigration).toMatch(/^\s*0,\s*$/m);
    const shortageMigration = fs.readFileSync(
      path.resolve(process.cwd(), "supabase/migrations/20261223000000_allow_treatment_completion_with_stock_shortage.sql"),
      "utf8"
    );
    expect(shortageMigration).toMatch(/shortage_details JSONB NOT NULL DEFAULT '\[\]'/i);
    expect(shortageMigration).toMatch(/LEAST\(v_remaining, v_item\.current_stock\)/i);
    expect(shortageMigration).toMatch(/'shortages', v_shortages/i);
    const shortageReconciliationMigration = fs.readFileSync(
      path.resolve(process.cwd(), "supabase/migrations/20270105000000_reconcile_inventory_shortages_on_stock_in.sql"),
      "utf8"
    );
    expect(shortageReconciliationMigration).toMatch(/movement_type = 'IN' THEN[\s\S]*inventory_treatment_consumptions/i);
    expect(shortageReconciliationMigration).toMatch(/ORDER BY consumption\.created_at, consumption\.treatment_job_id/i);
    expect(shortageReconciliationMigration).toMatch(/Rekonsiliasi kekurangan resep tindakan/i);
    expect(shortageReconciliationMigration).toMatch(/shortage_details = v_updated_shortages/i);
  });
});
