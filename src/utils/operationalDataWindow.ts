export const DEFAULT_OPERATIONAL_DATA_LOOKBACK_DAYS = 90;

export function getOperationalDataCutoff(
  lookbackDays = DEFAULT_OPERATIONAL_DATA_LOOKBACK_DAYS,
  now = new Date().toISOString()
): string {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - Math.max(1, Math.trunc(lookbackDays)));
  return cutoff.toISOString();
}

export function isWithinOperationalDataWindow(
  timestamp: string | undefined,
  status: string,
  activeStatuses: readonly string[],
  cutoff: string
): boolean {
  return activeStatuses.includes(status) || Boolean(timestamp && timestamp >= cutoff);
}
