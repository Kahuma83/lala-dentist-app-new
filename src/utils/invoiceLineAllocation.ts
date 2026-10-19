export interface InvoiceLineAmount {
  id: string;
  amount: number;
}

export function allocateInvoiceNetToLines(
  lines: InvoiceLineAmount[],
  netAmount: number
): Map<string, number> {
  const amounts = new Map<string, number>();
  const normalizedNet = Math.max(0, Math.round(netAmount));
  const normalizedLines = lines.map((line) => ({
    id: line.id,
    amount: Math.max(0, Number.isFinite(line.amount) ? line.amount : 0)
  }));
  const subtotal = normalizedLines.reduce((sum, line) => sum + line.amount, 0);
  if (subtotal <= 0 || normalizedNet === 0) {
    normalizedLines.forEach((line) => amounts.set(line.id, 0));
    return amounts;
  }

  const allocations = normalizedLines.map((line) => {
    const exact = normalizedNet * line.amount / subtotal;
    const base = Math.floor(exact);
    amounts.set(line.id, base);
    return { id: line.id, remainder: exact - base };
  });
  let remainder = normalizedNet - Array.from(amounts.values()).reduce((sum, value) => sum + value, 0);
  allocations.sort((left, right) =>
    right.remainder - left.remainder || left.id.localeCompare(right.id)
  );
  for (let index = 0; index < remainder; index++) {
    const line = allocations[index];
    if (line) amounts.set(line.id, (amounts.get(line.id) || 0) + 1);
  }

  return amounts;
}
