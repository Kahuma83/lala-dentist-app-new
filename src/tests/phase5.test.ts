import { describe, it, expect, beforeEach } from "vitest";
import { MockDatabase } from "../data/mockData";
import {
  MockInvoiceRepository,
  MockPaymentRepository,
  MockTreatmentRepository,
  MockVisitRepository,
  AppClock
} from "../repositories/mockRepositories";
import {
  UserRole,
  InvoiceStatus,
  PaymentMethod,
  TreatmentJobStatus,
  VisitType
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
          serviceId: "service-restoration",
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
          serviceId: "service-restoration",
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
      visitId: "phase5-test-4",
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
          serviceId: "service-restoration",
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

  it("allows only one active invoice per visit and allows replacement after cancellation", async () => {
    const invoiceData = {
      visitId: "visit-unique-invoice-test",
      patientId: "patient-1",
      branchId: "branch-gebang",
      items: [
        {
          serviceId: "service-scaling",
          descriptionSnapshot: "Scaling & Polishing",
          unitPriceSnapshot: 150000,
          quantity: 1
        }
      ]
    };
    const firstInvoice = await invoiceRepo.createInvoice(invoiceData);

    await expect(invoiceRepo.createInvoice(invoiceData))
      .rejects.toThrow("sudah memiliki invoice aktif");

    await invoiceRepo.cancelInvoice(firstInvoice.id, "Koreksi invoice", UserRole.SUPER_ADMIN);
    const replacementInvoice = await invoiceRepo.createInvoice(invoiceData);

    expect(replacementInvoice.id).not.toBe(firstInvoice.id);
    expect(replacementInvoice.status).toBe(InvoiceStatus.OPEN);
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
      visitId: "phase5-test-7",
      patientId: "patient-1",
      branchId: "branch-gebang",
      items: [
        {
          serviceId: "service-restoration",
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

  it("records an authorized backdated payment date separately from its actual creation time", async () => {
    const visitRepo = new MockVisitRepository();
    AppClock.setFixedTime("2026-10-31T05:00:00.000Z");
    const visit = await visitRepo.createVisit({
      patientId: "patient-1",
      branchId: "branch-gebang",
      visitType: VisitType.WALK_IN,
      bookingId: null,
      doctorId: "doc-syafira"
    });
    const treatment = await treatmentRepo.createTreatmentJob({
      visitId: visit.id,
      serviceId: "service-scaling",
      doctorId: "doc-syafira"
    });
    await treatmentRepo.startTreatmentJob(treatment.id);
    await treatmentRepo.completeTreatmentJob(treatment.id);
    AppClock.setFixedTime("2026-11-03T05:00:00.000Z");

    const invoice = await invoiceRepo.createInvoice({
      visitId: visit.id,
      patientId: visit.patientId,
      branchId: visit.branchId,
      invoiceDate: "2026-10-31",
      items: [{
        treatmentJobId: treatment.id,
        serviceId: treatment.serviceId,
        descriptionSnapshot: treatment.serviceNameSnapshot,
        unitPriceSnapshot: treatment.priceSnapshot || 0,
        quantity: 1
      }]
    }, UserRole.SUPER_ADMIN);

    const backdatedPayment = {
      invoiceId: invoice.id,
      amount: invoice.netAmount,
      paymentMethod: PaymentMethod.CASH,
      staffId: "staff-adm-gebang",
      paymentDate: "2026-10-31"
    };
    await expect(paymentRepo.createPayment(backdatedPayment, UserRole.OB))
      .rejects.toThrow("Hanya Super Admin dan Branch Admin");
    await expect(paymentRepo.createPayment(backdatedPayment, UserRole.SUPER_ADMIN))
      .rejects.toThrow("Alasan pencatatan pembayaran mundur");

    const payment = await paymentRepo.createPayment({
      ...backdatedPayment,
      notes: "Diterima tanggal 31 Oktober"
    }, UserRole.SUPER_ADMIN);

    expect(payment.paymentDate).toBe("2026-10-31");
    expect(payment.transactionDateTime).toBe("2026-11-03T05:00:00.000Z");
    expect(payment.receiptNumber).toContain("/202610/");
  });

  it("Test 8: Full settlement payment sets status to PAID and outstandingAmount to 0", async () => {
    const invoice = await invoiceRepo.createInvoice({
      visitId: "phase5-test-8",
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
      visitId: "phase5-test-9",
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
      visitId: "phase5-test-10",
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
      visitId: "phase5-test-11",
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
      visitId: "phase5-test-12",
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
      visitId: "phase5-test-14",
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

    const cancelled = await invoiceRepo.cancelInvoice(invoice.id, "Kesalahan input invoice");
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
      visitId: "phase5-test-15",
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
      invoiceRepo.cancelInvoice(invoice.id, "Koreksi invoice")
    ).rejects.toThrow("Seluruh pembayaran invoice harus dibalik sebelum invoice dibatalkan.");
  });
});
