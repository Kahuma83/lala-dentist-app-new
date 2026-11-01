import { StaffCompensationRule } from "../types/domain";

export function selectMostSpecificTreatmentRules(
  rules: StaffCompensationRule[]
): StaffCompensationRule[] {
  const selectedRules = new Map<string, { rule: StaffCompensationRule; specificity: number }>();

  for (const rule of rules) {
    const key = `${rule.staffId}:${rule.ruleTypeSnapshot}`;
    const specificity = (rule.serviceId ? 2 : 0) + (rule.branchId ? 1 : 0);
    const current = selectedRules.get(key);
    const isNewer = current && (
      rule.createdAt > current.rule.createdAt ||
      (rule.createdAt === current.rule.createdAt && rule.id > current.rule.id)
    );

    if (!current || specificity > current.specificity || (specificity === current.specificity && isNewer)) {
      selectedRules.set(key, { rule, specificity });
    }
  }

  return [...selectedRules.values()].map(({ rule }) => rule);
}
