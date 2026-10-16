/**
 * LALA DENTIST - BRANCH RESOLUTION & MATCHING UTILITY
 * Handles flexible matching between UUIDs, branch codes (e.g. "GEB", "KEN", "AMB"),
 * branch slugs (e.g. "branch-gebang", "branch-kencong"), and names.
 */

import { DentalBranch } from "../types/domain";
import { MOCK_BRANCHES } from "../data/mockData";

/**
 * Normalizes branch strings for fuzzy comparison.
 */
function normalizeStr(val?: string | null): string {
  if (!val) return "";
  return String(val)
    .trim()
    .toLowerCase()
    .replace(/^branch-/, "")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Known mapping of branch abbreviations / aliases to canonical identifiers.
 */
const KNOWN_BRANCH_ALIASES: Record<string, string[]> = {
  gebang: ["geb", "gebang", "branch-gebang", "e3f2e047-387a-45a0-b0fb-300a856c871c"],
  ambulu: ["amb", "ambulu", "branch-ambulu", "c66ee612-79d1-42ee-b989-c79955549b07"],
  kencong: ["ken", "kencong", "branch-kencong", "ac82d768-4ea8-4d9a-9e59-454ce9db03b4"],
  kenjeran: ["kenj", "kenjeran", "branch-kenjeran"],
  kampus: ["kam", "kmp", "kampus", "branch-kampus", "28889bbf-dfd2-4b11-9fd1-71a8a5cadd59"],
  lengkong: ["len", "lengkong", "lengkongmumbul", "branch-lengkong", "branch-lengkong-mumbul", "5ab53f34-8673-438a-8a34-840507469586"],
  muktisari: ["muk", "muktisari", "branch-muktisari"]
};

function resolveCatalogBranches(branchList?: DentalBranch[]): DentalBranch[] {
  if (branchList && branchList.length > 0) return branchList;
  if (typeof window !== "undefined") {
    try {
      const saved = localStorage.getItem("lala_branches");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
  }
  return MOCK_BRANCHES;
}

/**
 * Checks whether two branch identifiers match.
 * Resolves across:
 * - Direct equality (UUID == UUID, slug == slug)
 * - Branch code matching ("GEB" == "branch-gebang")
 * - Name matching ("Cabang Gebang" == "GEB")
 * - Alias/prefix matching ("KEN" == "branch-kencong")
 */
export function isBranchMatch(
  branchA?: string | null,
  branchB?: string | null,
  branchList?: DentalBranch[]
): boolean {
  if (!branchA && !branchB) return true;
  if (!branchA || !branchB) return false;

  const rawA = String(branchA).trim();
  const rawB = String(branchB).trim();

  // 1. Direct or case-insensitive match
  if (rawA.toLowerCase() === rawB.toLowerCase()) return true;

  // 2. Wildcard "ALL"
  if (rawA.toUpperCase() === "ALL" || rawB.toUpperCase() === "ALL") return true;

  const normA = normalizeStr(rawA);
  const normB = normalizeStr(rawB);

  if (normA && normA === normB) return true;

  // 3. Resolve using available branch catalog (provided list, localStorage cache, or MOCK_BRANCHES fallback)
  const branches = resolveCatalogBranches(branchList);

  const findBranch = (identifier: string): DentalBranch | undefined => {
    const raw = identifier.trim().toLowerCase();
    const norm = normalizeStr(raw);

    return branches.find((b) => {
      if (b.id && b.id.toLowerCase() === raw) return true;
      if (b.branchCode && b.branchCode.toLowerCase() === raw) return true;
      if (b.name && b.name.toLowerCase() === raw) return true;
      if (b.branchName && b.branchName.toLowerCase() === raw) return true;

      const normId = normalizeStr(b.id);
      const normCode = normalizeStr(b.branchCode);
      const normName = normalizeStr(b.name);

      if (norm && (norm === normId || norm === normCode || norm === normName)) return true;

      // Prefix/substring check for 3-letter codes like "geb" in "gebang"
      if (norm && norm.length >= 3 && normCode && (norm === normCode || norm.startsWith(normCode) || normCode.startsWith(norm))) {
        return true;
      }

      return false;
    });
  };

  const branchObjA = findBranch(rawA);
  const branchObjB = findBranch(rawB);

  if (branchObjA && branchObjB) {
    if (branchObjA.id === branchObjB.id) return true;
    if (branchObjA.branchCode && branchObjB.branchCode && branchObjA.branchCode.toUpperCase() === branchObjB.branchCode.toUpperCase()) {
      return true;
    }
  }

  // Cross-match if one resolved and the other matches its properties
  if (branchObjA) {
    if (branchObjA.id.toLowerCase() === rawB.toLowerCase()) return true;
    if (branchObjA.branchCode && branchObjA.branchCode.toLowerCase() === rawB.toLowerCase()) return true;
    if (normalizeStr(branchObjA.id) === normB) return true;
    if (branchObjA.branchCode && normalizeStr(branchObjA.branchCode) === normB) return true;
  }

  if (branchObjB) {
    if (branchObjB.id.toLowerCase() === rawA.toLowerCase()) return true;
    if (branchObjB.branchCode && branchObjB.branchCode.toLowerCase() === rawA.toLowerCase()) return true;
    if (normalizeStr(branchObjB.id) === normA) return true;
    if (branchObjB.branchCode && normalizeStr(branchObjB.branchCode) === normA) return true;
  }

  // 4. Known aliases fallback (e.g. "geb" <-> "gebang", "ken" <-> "kencong")
  for (const group of Object.values(KNOWN_BRANCH_ALIASES)) {
    const hasA = group.some((alias) => normA === alias || normA.includes(alias) || alias.includes(normA));
    const hasB = group.some((alias) => normB === alias || normB.includes(alias) || alias.includes(normB));
    if (hasA && hasB) return true;
  }

  return false;
}
