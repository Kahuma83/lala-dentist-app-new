import { DentalBranch, PromotionMedia } from "../types/domain";
import { isBranchMatch } from "./branchUtils";

export function getVisiblePromotions(
  promotions: PromotionMedia[],
  branchId: string | null,
  branches: DentalBranch[]
): PromotionMedia[] {
  return promotions.filter((promotion) =>
    promotion.isActive && (
      !promotion.branchId
      || (!!branchId && isBranchMatch(promotion.branchId, branchId, branches))
    )
  );
}
