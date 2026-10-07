import { describe, it, expect, beforeEach } from "vitest";
import { MockDatabase } from "../data/mockData";
import {
  MockInvoiceRepository,
  MockPaymentRepository,
  MockTreatmentRepository,
  AppClock
} from "../repositories/mockRepositories";
import {
  UserRole,
  InvoiceStatus,
  PaymentMethod,
  TreatmentJobStatus
} from "../types/domain";

describe("Phase 5: Billing, Invoices & Payments Test Suite", () => {
  let invoiceRepo: MockInvoiceRepository;
  let paymentRepo: MockPaymentRepository;
  let treatmentRepo: MockTreatmentRepository;

  beforeEach(() => {
    MockDatabase.resetInstance();
    AppClock.reset();
    invoiceRepo = new MockInvoiceRepository();
    paymentRepo = new MockPaymentRepository();
    treatmentRepo = new MockTreatmentRepository();
  });

  it("Test 1: Super Admin can list all invoices across branches", async () => {
    const list = await invoiceRepo.getInvoices(UserRole.SUPER_ADMIN, null);
    expect(list.length).toBeGreaterThan(0);
    expect(list.some((i) => i.branchId === "branch-gebang")).toBe(true);
  });

  it("Test 2: Branch Admin only retrieves invoices of their assigned branch", async () => {
    // Create an invoice for branch-kampus
    await invoiceRepo.createInvoice({
      visitId: "visit-2",
      patientId: "patient-2",
      branchId: "branch-kampus",
      items: [
        {
          serviceId: "service-tambal",
          descriptionSnapshot: "Penambalan Komposit",
          unitPriceSnapshot: 200000,
          quantity: 1
        }
      ],
      customId: "inv-kampus-test"
    });

    const gebangList = await invoiceRepo.getInvoices(UserRole.BRANCH_ADMIN, "branch-gebang");
    expect(gebangList.every((i) => i.branchId === "branch-gebang")).toBe(true);
    expect(gebangList.find((i) => i.id === "inv-kampus-test")).toBeUndefined();

    const kampusList = await invoiceRepo.getInvoices(UserRole.BRANCH_ADMIN, "branch-kampus");
    expect(kampusList.some((i) => i.id === "inv-kampus-test")).toBe(true);
  });

  it("Test 3: Branch Admin cannot access or view invoice of another branch", async () => {
    await invoiceRepo.createInvoice({
      visitId: "visit-2",
      patientId: "patient-2",
      branchId: "branch-kampus",
      items: [
        {
          serviceId: "service-tambal",
          descriptionSnapshot: "Penambalan Komposit",
          unitPriceSnapshot: 200000,
          quantity: 1
        }
      ],
      customId: "inv-kampus-secret"
    });

    await expect(
      invoiceRepo.getInvoiceById("inv-kampus-secret", UserRole.BRANCH_ADMIN, "branch-gebang")
    ).rejects.toThrow("Branch Admin tidak dapat mengakses Invoice cabang lain");
  });

  it("Test 4: Creating invoice snapshots item prices and calculates net amount correctly", async () => {
    const invoice = await invoiceRepo.createInvoice({
      visitId: "visit-1",
      patientId: "patient-1",
      branchId: "branch-gebang",
      items: [
        {
          serviceId: "service-scaling",
          descriptionSnapshot: "Scaling & Polishing",
          unitPriceSnapshot: 150000,
          quantity: 2 // 300,000
        },
        {
          serviceId: "service-tambal",
          descriptionSnapshot: "Tambal Gigi",
          unitPriceSnapshot: 200000,
          quantity: 1 // 200,000
        }
      ],
      discountAmount: 50000,
      taxAmount: 0
    });

    expect(invoice.totalAmount).toBe(500000);
    expect(invoice.discountAmount).toBe(50000);
    expect(invoice.netAmount).toBe(450000);
    expect(invoice.paidAmount).toBe(0);
    expect(invoice.outstandingAmount).toBe(450000);
    expect(invoice.status).toBe(InvoiceStatus.OPEN);

    const items = await invoiceRepo.getInvoiceItems(invoice.id);
    expect(items.length).toBe(2);
    expect(items[0].unitPriceSnapshot).toBe(150000);
    expect(items[0].quantity).toBe(2);
    expect(items[0].amount).toBe(300000);
  });

  it("Test 5: Invoice creation fails when no items are provided", async () => {
    await expect(
      invoiceRepo.createInvoice({
        visitId: "visit-1",
        patientId: "patient-1",
        branchId: "branch-gebang",
        items: []
      })
    ).rejects.toThrow("Invoice harus memiliki minimal satu item tindakan/layanan");
  });

  it("Test 6: Branch Admin cannot create invoice for another branch", async () => {
    await expect(
      invoiceRepo.createInvoice(
        {
          visitId: "visit-1",
          patientId: "patient-1",
          branchId: "branch-kampus",
          items: [
            {
              descriptionSnapshot: "Konsultasi",
              unitPriceSnapshot: 50000,
              quantity: 1
            }
          ]
        },
        UserRole.BRANCH_ADMIN,
        "branch-gebang"
      )
    ).rejects.toThrow("Branch Admin hanya dapat membuat Invoice untuk cabangnya sendiri");
  });

  it("Test 7: Partial payment updates paidAmount, outstandingAmount, and sets status to PARTIALLY_PAID", async () => {
    const invoice = await invoiceRepo.createInvoice({
      visitId: "visit-1",
      patientId: "patient-1",
      branchId: "branch-gebang",
      items: [
        {
          serviceId: "service-tambal",
          descriptionSnapshot: "Tambal Gigi",
          unitPriceSnapshot: 300000,
          quantity: 1
        }
      ]
    });

    expect(invoice.netAmount).toBe(300000);
    expect(invoice.outstandingAmount).toBe(300000);

    const payment = await paymentRepo.createPayment({
      invoiceId: invoice.id,
      amount: 100000,
      paymentMethod: PaymentMethod.CASH,
      staffId: "admin-gebang"
    });

    expect(payment.amount).toBe(100000);
    expect(payment.status).toBe("SUCCESS");

    const updatedInv = await invoiceRepo.getInvoiceById(invoice.id);
    expect(updatedInv?.paidAmount).toBe(100000);
    expect(updatedInv?.outstandingAmount).toBe(200000);
    expect(updatedInv?.status).toBe(InvoiceStatus.PARTIALLY_PAID);
  });

  it("Test 8: Full settlement payment sets status to PAID and outstandingAmount to 0", async () => {
    const invoice = await invoiceRepo.createInvoice({
      visitId: "visit-1",
      patientId: "patient-1",
      branchId: "branch-gebang",
      items: [
        {
          serviceId: "service-scaling",
          descriptionSnapshot: "Scaling",
          unitPriceSnapshot: 150000,
          quantity: 1
        }
      ]
    });

    await paymentRepo.createPayment({
      invoiceId: invoice.id,
      amount: 150000,
      paymentMethod: PaymentMethod.QRIS,
      referenceNumber: "QRIS-8827361",
      staffId: "admin-gebang"
    });

    const updatedInv = await invoiceRepo.getInvoiceById(invoice.id);
    expect(updatedInv?.paidAmount).toBe(150000);
    expect(updatedInv?.outstandingAmount).toBe(0);
    expect(updatedInv?.status).toBe(InvoiceStatus.PAID);
  });

  it("Test 9: Multiple partial payments aggregate properly until full settlement", async () => {
    const invoice = await invoiceRepo.createInvoice({
      visitId: "visit-1",
      patientId: "patient-1",
      branchId: "branch-gebang",
      items: [
        {
          descriptionSnapshot: "Paket Behel Gigi",
          unitPriceSnapshot: 5000000,
          quantity: 1
        }
      ]
    });

    // 1st payment: DP 2,000,000
    await paymentRepo.createPayment({
      invoiceId: invoice.id,
      amount: 2000000,
      paymentMethod: PaymentMethod.TRANSFER,
      referenceNumber: "TRF-001",
      staffId: "admin-gebang"
    });

    let inv = await invoiceRepo.getInvoiceById(invoice.id);
    expect(inv?.paidAmount).toBe(2000000);
    expect(inv?.outstandingAmount).toBe(3000000);
    expect(inv?.status).toBe(InvoiceStatus.PARTIALLY_PAID);

    // 2nd payment: Pelunasan 3,000,000
    await paymentRepo.createPayment({
      invoiceId: invoice.id,
      amount: 3000000,
      paymentMethod: PaymentMethod.QRIS,
      referenceNumber: "QRIS-002",
      staffId: "admin-gebang"
    });

    inv = await invoiceRepo.getInvoiceById(invoice.id);
    expect(inv?.paidAmount).toBe(5000000);
    expect(inv?.outstandingAmount).toBe(0);
    expect(inv?.status).toBe(InvoiceStatus.PAID);

    const history = await paymentRepo.getPaymentsByInvoice(invoice.id);
    expect(history.length).toBe(2);
  });

  it("Test 10: Overpayment beyond outstandingAmount is rejected with clear validation error", async () => {
    const invoice = await invoiceRepo.createInvoice({
      visitId: "visit-1",
      patientId: "patient-1",
      branchId: "branch-gebang",
      items: [
        {
          descriptionSnapshot: "Tambal Gigi",
          unitPriceSnapshot: 200000,
          quantity: 1
        }
      ]
    });

    await expect(
      paymentRepo.createPayment({
        invoiceId: invoice.id,
        amount: 250000, // 50,000 too much
        paymentMethod: PaymentMethod.CASH,
        staffId: "admin-gebang"
      })
    ).rejects.toThrow("melebihi sisa tagihan");
  });

  it("Test 11: Payment on already fully paid invoice is rejected", async () => {
    const invoice = await invoiceRepo.createInvoice({
      visitId: "visit-1",
      patientId: "patient-1",
      branchId: "branch-gebang",
      items: [
        {
          descriptionSnapshot: "Pencabutan Gigi",
          unitPriceSnapshot: 150000,
          quantity: 1
        }
      ]
    });

    await paymentRepo.createPayment({
      invoiceId: invoice.id,
      amount: 150000,
      paymentMethod: PaymentMethod.CASH,
      staffId: "admin-gebang"
    });

    await expect(
      paymentRepo.createPayment({
        invoiceId: invoice.id,
        amount: 50000,
        paymentMethod: PaymentMethod.CASH,
        staffId: "admin-gebang"
      })
    ).rejects.toThrow("Invoice sudah LUNAS");
  });

  it("Test 12: Zero or negative payment amounts are rejected", async () => {
    const invoice = await invoiceRepo.createInvoice({
      visitId: "visit-1",
      patientId: "patient-1",
      branchId: "branch-gebang",
      items: [
        {
          descriptionSnapshot: "Scaling",
          unitPriceSnapshot: 150000,
          quantity: 1
        }
      ]
    });

    await expect(
      paymentRepo.createPayment({
        invoiceId: invoice.id,
        amount: 0,
        paymentMethod: PaymentMethod.CASH,
        staffId: "admin-gebang"
      })
    ).rejects.toThrow("Nominal pembayaran harus lebih dari 0");
  });

  it("Test 13: Branch Admin cannot receive payment for an invoice belonging to another branch", async () => {
    const invoice = await invoiceRepo.createInvoice({
      visitId: "visit-2",
      patientId: "patient-2",
      branchId: "branch-kampus",
      items: [
        {
          descriptionSnapshot: "Scaling",
          unitPriceSnapshot: 150000,
          quantity: 1
        }
      ]
    });

    await expect(
      paymentRepo.createPayment(
        {
          invoiceId: invoice.id,
          amount: 150000,
          paymentMethod: PaymentMethod.CASH,
          staffId: "admin-gebang"
        },
        UserRole.BRANCH_ADMIN,
        "branch-gebang"
      )
    ).rejects.toThrow("Branch Admin tidak dapat menerima pembayaran untuk Invoice cabang lain");
  });

  it("Test 14: Cancelling an unpaid invoice changes its status to CANCELLED", async () => {
    const invoice = await invoiceRepo.createInvoice({
      visitId: "visit-1",
      patientId: "patient-1",
      branchId: "branch-gebang",
      items: [
        {
          descriptionSnapshot: "Konsultasi",
          unitPriceSnapshot: 100000,
          quantity: 1
        }
      ]
    });

    const cancelled = await invoiceRepo.cancelInvoice(invoice.id);
    expect(cancelled.status).toBe(InvoiceStatus.CANCELLED);

    // Payments on cancelled invoice must be rejected
    await expect(
      paymentRepo.createPayment({
        invoiceId: invoice.id,
        amount: 100000,
        paymentMethod: PaymentMethod.CASH,
        staffId: "admin-gebang"
      })
    ).rejects.toThrow("Tidak dapat menerima pembayaran untuk invoice yang telah DIBATALKAN");
  });

  it("Test 15: Invoice with paid amount cannot be cancelled without refund", async () => {
    const invoice = await invoiceRepo.createInvoice({
      visitId: "visit-1",
      patientId: "patient-1",
      branchId: "branch-gebang",
      items: [
        {
          descriptionSnapshot: "Scaling",
          unitPriceSnapshot: 200000,
          quantity: 1
        }
      ]
    });

    await paymentRepo.createPayment({
      invoiceId: invoice.id,
      amount: 100000,
      paymentMethod: PaymentMethod.CASH,
      staffId: "admin-gebang"
    });

    await expect(
      invoiceRepo.cancelInvoice(invoice.id)
    ).rejects.toThrow("Invoice yang telah memiliki pembayaran tidak dapat dibatalkan secara langsung");
  });
});
