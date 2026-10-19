import { describe, expect, it } from "vitest";
import { allocateInvoiceNetToLines } from "../utils/invoiceLineAllocation";

describe("invoice line net allocation", () => {
  it("allocates global discounts and fees proportionally without losing rupiah", () => {
    const allocation = allocateInvoiceNetToLines([
      { id: "line-a", amount: 100 },
      { id: "line-b", amount: 200 },
      { id: "line-c", amount: 100 }
    ], 301);

    expect(allocation.get("line-a")).toBe(75);
    expect(allocation.get("line-b")).toBe(151);
    expect(allocation.get("line-c")).toBe(75);
    expect(Array.from(allocation.values()).reduce((sum, amount) => sum + amount, 0)).toBe(301);
  });

  it("returns zero allocations for zero-value invoices", () => {
    expect(allocateInvoiceNetToLines([
      { id: "line-a", amount: 100 },
      { id: "line-b", amount: 100 }
    ], 0)).toEqual(new Map([["line-a", 0], ["line-b", 0]]));
  });
});
