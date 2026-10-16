import { describe, expect, it } from "vitest";
import { PromotionMedia } from "../types/domain";
import { getVisiblePromotions } from "../utils/promotionUtils";

const promotions: PromotionMedia[] = [
  {
    id: "global-active",
    title: "Global aktif",
    imageUrl: "/global.jpg",
    branchId: null,
    isActive: true,
    displayOrder: 1,
    createdAt: "",
    updatedAt: ""
  },
  {
    id: "gebang-active",
    title: "Gebang aktif",
    imageUrl: "/gebang.jpg",
    branchId: "branch-gebang",
    isActive: true,
    displayOrder: 2,
    createdAt: "",
    updatedAt: ""
  },
  {
    id: "ambulu-active",
    title: "Ambulu aktif",
    imageUrl: "/ambulu.jpg",
    branchId: "branch-ambulu",
    isActive: true,
    displayOrder: 3,
    createdAt: "",
    updatedAt: ""
  },
  {
    id: "global-inactive",
    title: "Global nonaktif",
    imageUrl: "/inactive.jpg",
    branchId: null,
    isActive: false,
    displayOrder: 4,
    createdAt: "",
    updatedAt: ""
  }
];

describe("Patient portal promotional banners", () => {
  it("shows active global and matching branch promotions only", () => {
    expect(getVisiblePromotions(promotions, "branch-gebang", []).map((promo) => promo.id))
      .toEqual(["global-active", "gebang-active"]);
  });

  it("shows only global promotions when the patient has no known branch", () => {
    expect(getVisiblePromotions(promotions, null, []).map((promo) => promo.id))
      .toEqual(["global-active"]);
  });
});
