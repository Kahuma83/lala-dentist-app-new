import { describe, it, expect, beforeEach } from "vitest";
import { UserRole, PromotionMedia } from "../types/domain";
import {
  MockBranchRepository,
  MockPromotionRepository
} from "../repositories/mockRepositories";

describe("PHASE 9H.1 — Branch Admin Profile & Promotion Media Management", () => {
  let branchRepo: MockBranchRepository;
  let promoRepo: MockPromotionRepository;

  beforeEach(() => {
    branchRepo = new MockBranchRepository();
    promoRepo = new MockPromotionRepository();
  });

  describe("1. Branch Admin Profile Access & Strict Read-Only Policy", () => {
    it("should allow Branch Admin to view their assigned branch profile", async () => {
      const branches = await branchRepo.getBranches(UserRole.BRANCH_ADMIN, "branch-gebang");
      expect(branches).toHaveLength(1);
      expect(branches[0].id).toBe("branch-gebang");
      expect(branches[0].branchCode).toBe("GEB");
      expect(branches[0].phone).toBeDefined();
      expect(branches[0].whatsapp).toBeDefined();
      expect(branches[0].address).toBeDefined();
    });

    it("should reject Branch Admin from creating new branches", async () => {
      await expect(
        branchRepo.createBranch(
          {
            branchCode: "NEW",
            name: "Lala Dentist Baru",
            branchName: "Lala Dentist Baru",
            clinicName: "Lala Dentist",
            address: "Jl. Baru No. 1",
            phone: "081234567899",
            whatsapp: "081234567899",
            email: "baru@laladentist.com",
            isActive: true
          },
          UserRole.BRANCH_ADMIN
        )
      ).rejects.toThrow(/Hanya Super Admin yang berwenang/);
    });

    it("should reject Branch Admin from mutating branch profile (Strict Super Admin Only)", async () => {
      await expect(
        branchRepo.updateBranch(
          "branch-gebang",
          {
            name: "Hacked Branch Name"
          },
          UserRole.BRANCH_ADMIN,
          "branch-gebang"
        )
      ).rejects.toThrow(/Hanya Super Admin yang berwenang/);
    });

    it("should reject Branch Admin from modifying branch branding or logos", async () => {
      await expect(
        branchRepo.updateBranchBranding(
          "branch-gebang",
          {
            logoUrl: "https://evil.com/fake-logo.png"
          },
          UserRole.BRANCH_ADMIN
        )
      ).rejects.toThrow(/Hanya Super Admin yang berwenang/);
    });

    it("should allow Super Admin to update branch master data and photos", async () => {
      const updated = await branchRepo.updateBranch(
        "branch-gebang",
        {
          name: "Lala Dentist Gebang Updated",
          imageUrl: "https://laladentist.com/photos/gebang-new.jpg"
        },
        UserRole.SUPER_ADMIN
      );

      expect(updated.name).toBe("Lala Dentist Gebang Updated");
      expect(updated.imageUrl).toBe("https://laladentist.com/photos/gebang-new.jpg");
    });
  });

  describe("2. Promotion Media Management (Super Admin & Scope Isolation)", () => {
    it("should return seeded active promotions", async () => {
      const promos = await promoRepo.getPromotions(UserRole.SUPER_ADMIN);
      expect(promos.length).toBeGreaterThanOrEqual(2);
      expect(promos.some((p) => p.branchId === null)).toBe(true); // Global promo
      expect(promos.some((p) => p.branchId === "branch-gebang")).toBe(true); // Branch promo
    });

    it("should allow Super Admin to create a new GLOBAL promotion", async () => {
      const newPromo = await promoRepo.createPromotion(
        {
          title: "Promo Akhir Tahun Semua Cabang",
          description: "Diskon 25% untuk seluruh perawatan gigi",
          imageUrl: "https://laladentist.com/promos/year-end.jpg",
          branchId: null,
          isActive: true,
          displayOrder: 99
        },
        UserRole.SUPER_ADMIN
      );

      expect(newPromo.id).toBeDefined();
      expect(newPromo.title).toBe("Promo Akhir Tahun Semua Cabang");
      expect(newPromo.branchId).toBeNull();
      expect(newPromo.isActive).toBe(true);
      expect(newPromo.displayOrder).toBe(99);
    });

    it("should allow Super Admin to create a BRANCH-SPECIFIC promotion", async () => {
      const branchPromo = await promoRepo.createPromotion(
        {
          title: "Spesial Pembukaan Cabang Ambulu",
          description: "Free konsultasi khusus pasien Cabang Ambulu",
          imageUrl: "https://laladentist.com/promos/ambulu-open.jpg",
          branchId: "branch-ambulu",
          isActive: true,
          displayOrder: 3
        },
        UserRole.SUPER_ADMIN
      );

      expect(branchPromo.branchId).toBe("branch-ambulu");
      expect(branchPromo.title).toBe("Spesial Pembukaan Cabang Ambulu");
    });

    it("should isolate promotions for branch users / patients (Global + Assigned Branch Only)", async () => {
      // Create a specific Ambulu promo
      await promoRepo.createPromotion(
        {
          title: "Ambulu Exclusive",
          imageUrl: "https://laladentist.com/ambulu.jpg",
          branchId: "branch-ambulu",
          isActive: true,
          displayOrder: 5
        },
        UserRole.SUPER_ADMIN
      );

      // Gebang user queries promotions
      const gebangPromos = await promoRepo.getPromotions(UserRole.BRANCH_ADMIN, "branch-gebang");
      expect(gebangPromos.some((p) => p.title === "Ambulu Exclusive")).toBe(false);
      expect(gebangPromos.some((p) => p.branchId === null)).toBe(true); // Global included
      expect(gebangPromos.some((p) => p.branchId === "branch-gebang")).toBe(true); // Gebang included

      // Ambulu user queries promotions
      const ambuluPromos = await promoRepo.getPromotions(UserRole.BRANCH_ADMIN, "branch-ambulu");
      expect(ambuluPromos.some((p) => p.title === "Ambulu Exclusive")).toBe(true);
      expect(ambuluPromos.some((p) => p.branchId === "branch-gebang")).toBe(false);
    });

    it("should reject Non-Super Admin from creating promotions", async () => {
      await expect(
        promoRepo.createPromotion(
          {
            title: "Unauthorized Promo",
            imageUrl: "https://evil.com/promo.jpg",
            branchId: null,
            isActive: true,
            displayOrder: 1
          },
          UserRole.BRANCH_ADMIN
        )
      ).rejects.toThrow(/Hanya Super Admin/);

      await expect(
        promoRepo.createPromotion(
          {
            title: "Doctor Promo",
            imageUrl: "https://evil.com/promo.jpg",
            branchId: null,
            isActive: true,
            displayOrder: 1
          },
          UserRole.DOCTOR
        )
      ).rejects.toThrow(/Hanya Super Admin/);
    });

    it("should allow Super Admin to update promotion details", async () => {
      const promos = await promoRepo.getPromotions(UserRole.SUPER_ADMIN);
      const targetPromo = promos[0];

      const updated = await promoRepo.updatePromotion(
        targetPromo.id,
        {
          title: "Judul Promo Terupdate",
          displayOrder: 10
        },
        UserRole.SUPER_ADMIN
      );

      expect(updated.title).toBe("Judul Promo Terupdate");
      expect(updated.displayOrder).toBe(10);
    });

    it("should allow Super Admin to toggle active/nonactive status", async () => {
      const promos = await promoRepo.getPromotions(UserRole.SUPER_ADMIN);
      const targetPromo = promos[0];
      const initialStatus = targetPromo.isActive;

      const toggled = await promoRepo.toggleActive(targetPromo.id, !initialStatus, UserRole.SUPER_ADMIN);
      expect(toggled.isActive).toBe(!initialStatus);
    });

    it("should allow Super Admin to delete a promotion", async () => {
      const created = await promoRepo.createPromotion(
        {
          title: "Promo Akan Dihapus",
          imageUrl: "https://laladentist.com/del.jpg",
          branchId: null,
          isActive: true,
          displayOrder: 99
        },
        UserRole.SUPER_ADMIN
      );

      await promoRepo.deletePromotion(created.id, UserRole.SUPER_ADMIN);
      const fetched = await promoRepo.getPromotionById(created.id);
      expect(fetched).toBeNull();
    });

    it("should reject Non-Super Admin from deleting promotions", async () => {
      const promos = await promoRepo.getPromotions(UserRole.SUPER_ADMIN);
      await expect(
        promoRepo.deletePromotion(promos[0].id, UserRole.BRANCH_ADMIN)
      ).rejects.toThrow(/Hanya Super Admin/);
    });
  });
});
