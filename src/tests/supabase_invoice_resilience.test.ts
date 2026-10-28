import { describe, it, expect, beforeEach } from "vitest";
import { SupabaseInvoiceRepository, SupabasePaymentRepository } from "../repositories/supabaseRepositories";
import { InvoiceStatus, PaymentMethod } from "../types/domain";

if (typeof (globalThis as any).localStorage === "undefined") {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, val: string) => store.set(key, String(val)),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    length: 0
  };
}
if (typeof (globalThis as any).window === "undefined") {
  (globalThis as any).window = globalThis;
}

describe("Supabase Invoice & Payment Resilience", () => {
  let invoiceRepo: SupabaseInvoiceRepository;
  let paymentRepo: SupabasePaymentRepository;

  beforeEach(() => {
    (globalThis as any).localStorage.clear();
    invoiceRepo = new SupabaseInvoiceRepository();
    paymentRepo = new SupabasePaymentRepository();
  });

  it("should create an invoice gracefully without throwing even if Supabase denies permission", async () => {
    const newInvoice = await invoiceRepo.createInvoice({
      visitId: `visit-manual-${Date.now()}`,
      patientId: "pat-1",
      branchId: "branch-gebang",
      items: [
        {
          serviceId: "service-scaling",
          descriptionSnapshot: "Scaling & Polishing",
          unitPriceSnapshot: 150000,
          quantity: 1
        }
      ],
      discountAmount: 10000,
      taxAmount: 5000
    });

    expect(newInvoice).toBeDefined();
    expect(newInvoice.id).toBeDefined();
    expect(newInvoice.invoiceNumber).toMatch(/^INV\/GEB\/\d{6}\/\d{4}$/);
    expect(newInvoice.totalAmount).toBe(150000);
    expect(newInvoice.netAmount).toBe(145000);
    expect(newInvoice.status).toBe(InvoiceStatus.OPEN);

    // Verify it is retrievable via getInvoices and getInvoiceById
    const allInvoices = await invoiceRepo.getInvoices();
    expect(allInvoices.some((i) => i.id === newInvoice.id)).toBe(true);

    const fetched = await invoiceRepo.getInvoiceById(newInvoice.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.id).toBe(newInvoice.id);
    expect(fetched?.netAmount).toBe(145000);

    // Verify invoice items
    const items = await invoiceRepo.getInvoiceItems(newInvoice.id);
    expect(items.length).toBe(1);
    expect(items[0].descriptionSnapshot).toBe("Scaling & Polishing");
  });

  it("should process payments gracefully and update invoice outstanding amount and status", async () => {
    const inv = await invoiceRepo.createInvoice({
      visitId: "visit-test-1",
      patientId: "pat-2",
      branchId: "branch-kampus",
      items: [
        {
          serviceId: "service-restoration",
          descriptionSnapshot: "Tambal Gigi Komposit",
          unitPriceSnapshot: 200000,
          quantity: 1
        }
      ]
    });

    expect(inv.netAmount).toBe(200000);
    expect(inv.status).toBe(InvoiceStatus.OPEN);

    // Create partial payment
    const payment = await paymentRepo.createPayment({
      invoiceId: inv.id,
      amount: 100000,
      paymentMethod: PaymentMethod.CASH,
      staffId: "staff-1"
    });

    expect(payment).toBeDefined();
    expect(payment.receiptNumber).toMatch(/^KWT\/KMP\/\d{6}\/\d{4}$/);
    expect(payment.amount).toBe(100000);

    // Check updated invoice
    const updatedInv = await invoiceRepo.getInvoiceById(inv.id);
    expect(updatedInv?.paidAmount).toBe(100000);
    expect(updatedInv?.outstandingAmount).toBe(100000);
    expect(updatedInv?.status).toBe(InvoiceStatus.PARTIALLY_PAID);

    // Create second payment to settle
    await paymentRepo.createPayment({
      invoiceId: inv.id,
      amount: 100000,
      paymentMethod: PaymentMethod.QRIS,
      staffId: "staff-1"
    });

    const settledInv = await invoiceRepo.getInvoiceById(inv.id);
    expect(settledInv?.paidAmount).toBe(200000);
    expect(settledInv?.outstandingAmount).toBe(0);
    expect(settledInv?.status).toBe(InvoiceStatus.PAID);
  });

  it("should reject a payment above the current invoice balance without changing payment or invoice data", async () => {
    const inv = await invoiceRepo.createInvoice({
      visitId: `visit-overpayment-${Date.now()}`,
      patientId: "pat-2",
      branchId: "branch-kampus",
      items: [
        {
          serviceId: "service-restoration",
          descriptionSnapshot: "Tambal Gigi Komposit",
          unitPriceSnapshot: 200000,
          quantity: 1
        }
      ]
    });
    const paymentBefore = await paymentRepo.getPaymentsByInvoice(inv.id);

    await expect(paymentRepo.createPayment({
      invoiceId: inv.id,
      amount: inv.outstandingAmount + 1,
      paymentMethod: PaymentMethod.CASH,
      staffId: "staff-1"
    })).rejects.toThrow(/melebihi sisa tagihan/);

    const invoiceAfter = await invoiceRepo.getInvoiceById(inv.id);
    const paymentsAfter = await paymentRepo.getPaymentsByInvoice(inv.id);
    expect(invoiceAfter?.paidAmount).toBe(0);
    expect(invoiceAfter?.outstandingAmount).toBe(inv.outstandingAmount);
    expect(paymentsAfter).toHaveLength(paymentBefore.length);
  });

  it("should accept the doctor-selected treatment price within a price range", async () => {
    const visitId = `visit-doctor-price-${Date.now()}`;
    const invoice = await invoiceRepo.createInvoice({
      visitId,
      patientId: "pat-3",
      branchId: "branch-kampus",
      items: [
        {
          serviceId: "service-crown",
          descriptionSnapshot: "Mahkota Gigi",
          unitPriceSnapshot: 150000,
          quantity: 2,
          amount: 999999
        }
      ]
    });

    expect(invoice.totalAmount).toBe(999999);
    expect(invoice.netAmount).toBe(999999);
    expect(invoice.items?.[0].amount).toBe(999999);
  });

  it("should preserve payment snapshot values for historical receipt reprints", async () => {
    const inv = await invoiceRepo.createInvoice({
      visitId: `visit-receipt-snapshot-${Date.now()}`,
      patientId: "pat-4",
      branchId: "branch-gebang",
      items: [
        {
          serviceId: "service-scaling",
          descriptionSnapshot: "Scaling & Polishing",
          unitPriceSnapshot: 180000,
          quantity: 1
        }
      ]
    });

    const payment = await paymentRepo.createPayment({
      invoiceId: inv.id,
      amount: 60000,
      paymentMethod: PaymentMethod.CASH,
      staffId: "staff-1"
    });

    expect(payment.invoiceNetAmountSnapshot).toBe(180000);
    expect(payment.invoicePaidAmountSnapshot).toBe(60000);
    expect(payment.invoiceOutstandingAmountSnapshot).toBe(120000);
  });
});
