export const formatShortAccountingReference = (value?: string | null): string => {
  const reference = value?.trim();
  if (!reference) return "-";

  if (reference.startsWith("JRN-REV-")) {
    const id = reference.slice("JRN-REV-".length);
    if (id.length > 12) return `JRN-REV-${id.slice(0, 6)}…${id.slice(-4)}`;
  }

  if (/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(reference)) {
    return `${reference.slice(0, 8)}…${reference.slice(-4)}`;
  }

  if (reference.length > 24) {
    return `${reference.slice(0, 14)}…${reference.slice(-5)}`;
  }

  return reference;
};
