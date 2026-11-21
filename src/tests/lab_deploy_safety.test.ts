import { beforeEach, describe, expect, it } from "vitest";
import { MockDatabase } from "../data/mockData";
import { MockTreatmentRepository, MockVisitRepository } from "../repositories/mockRepositories";
import { AccountingPostingService } from "../services/accountingPostingService";
import {
  InvoiceStatus,
  JournalSourceType,
  JournalStatus,
  PaymentMethod,
  TreatmentJobStatus,
  UserRole,
  VisitType
} from "../types/domain";
import { AppClock } from "../utils/clock";

describe("Lab deployment safety", () => {
  beforeEach(() => {
    MockDatabase.resetInstance();
    AppClock.reset();
    AppClock.setFixedTime("2027-03-13T09:00:00.000Z");
  });

  it("does not let completion change a treatment price already billed to the patient", async () => {
    const visit = await new MockVisitRepository().createVisit({
      patientId: "patient-1",
      branchId: "branch-gebang",
      visitType: VisitType.WALK_IN,
      bookingId: null,
      doctorId: "doc-syafira"
    });
    const treatmentRepo = new MockTreatmentRepository();
    const treatment = await treatmentRepo.createTreatmentJob({
      visitId: visit.id,
      serviceId: "service-scaling",
      doctorId: "doc-syafira",
      priceSnapshot: 600000
    }, UserRole.DOCTOR, visit.branchId, "doc-syafira");
    const db = MockDatabase.getInstance();
    const storedTreatment = db.treatmentJobs.find((item) => item.id === treatment.id)!;
    storedTreatment.status = TreatmentJobStatus.MENUNGGU_LAB;
    storedTreatment.startedAt = AppClock.nowISO();
    const now = AppClock.nowISO();

    db.labOrders.push({
      id: "lab-order-price-lock",
      treatmentJobId: treatment.id,
      branchId: visit.branchId,
      labName: "Laboratorium Gigi",
      status: "RECEIVED",
      invoiceReceivedAt: now,
      invoiceAmount: 100000,
      createdAt: now,
      updatedAt: now
    });
    db.invoices.push({
      id: "invoice-price-lock",
      visitId: visit.id,
      patientId: visit.patientId,
      branchId: visit.branchId,
      totalAmount: 600000,
      discountAmount: 0,
      taxAmount: 0,
      netAmount: 600000,
      paidAmount: 0,
      outstandingAmount: 600000,
      status: InvoiceStatus.OPEN,
      createdAt: now,
      updatedAt: now
    });
    db.invoiceItems.push({
      id: "invoice-item-price-lock",
      invoiceId: "invoice-price-lock",
      treatmentJobId: treatment.id,
      descriptionSnapshot: "Gigi tiruan",
      unitPriceSnapshot: 600000,
      quantity: 1,
      amount: 600000,
      createdAt: now
    });

    await expect(treatmentRepo.completeTreatmentJob(
      treatment.id,
      UserRole.DOCTOR,
      visit.branchId,
      "doc-syafira",
      undefined,
      { finalPriceSnapshot: 700000, patientApprovalConfirmed: true }
    )).rejects.toThrow("Harga final tidak boleh berbeda dari invoice aktif");

    expect(storedTreatment.status).toBe(TreatmentJobStatus.MENUNGGU_LAB);
    expect(storedTreatment.priceSnapshot).toBe(600000);
  });

  it("allows completion at the price already billed to the patient", async () => {
    const visit = await new MockVisitRepository().createVisit({
      patientId: "patient-1",
      branchId: "branch-gebang",
      visitType: VisitType.WALK_IN,
      bookingId: null,
      doctorId: "doc-syafira"
    });
    const treatmentRepo = new MockTreatmentRepository();
    const treatment = await treatmentRepo.createTreatmentJob({
      visitId: visit.id,
      serviceId: "service-scaling",
      doctorId: "doc-syafira",
      priceSnapshot: 600000
    }, UserRole.DOCTOR, visit.branchId, "doc-syafira");
    const db = MockDatabase.getInstance();
    const storedTreatment = db.treatmentJobs.find((item) => item.id === treatment.id)!;
    storedTreatment.status = TreatmentJobStatus.MENUNGGU_LAB;
    storedTreatment.startedAt = AppClock.nowISO();
    const now = AppClock.nowISO();

    db.labOrders.push({
      id: "lab-order-price-match",
      treatmentJobId: treatment.id,
      branchId: visit.branchId,
      labName: "Laboratorium Gigi",
      status: "RECEIVED",
      invoiceReceivedAt: now,
      invoiceAmount: 100000,
      createdAt: now,
      updatedAt: now
    });
    db.invoices.push({
      id: "invoice-price-match",
      visitId: visit.id,
      patientId: visit.patientId,
      branchId: visit.branchId,
      totalAmount: 600000,
      discountAmount: 0,
      taxAmount: 0,
      netAmount: 600000,
      paidAmount: 0,
      outstandingAmount: 600000,
      status: InvoiceStatus.OPEN,
      createdAt: now,
      updatedAt: now
    });
    db.invoiceItems.push({
      id: "invoice-item-price-match",
      invoiceId: "invoice-price-match",
      treatmentJobId: treatment.id,
      descriptionSnapshot: "Gigi tiruan",
      unitPriceSnapshot: 600000,
      quantity: 1,
      amount: 600000,
      createdAt: now
    });

    const completed = await treatmentRepo.completeTreatmentJob(
      treatment.id,
      UserRole.DOCTOR,
      visit.branchId,
      "doc-syafira",
      undefined,
      { finalPriceSnapshot: 600000, patientApprovalConfirmed: true }
    );

    expect(completed.status).toBe(TreatmentJobStatus.SELESAI);
    expect(completed.priceSnapshot).toBe(600000);
  });

  it("blocks lab payment journals from generic expense corrections", async () => {
    const db = MockDatabase.getInstance();
    db.journals.push({
      id: "lab-payment-journal",
      journalNumber: "JRN-GEB-20270313-0001",
      journalDate: "2027-03-13",
      branchId: "branch-gebang",
      description: "Pembayaran nota lab",
      sourceType: JournalSourceType.EXPENSE,
      sourceId: "LAB_PAYMENT:payment-1",
      status: JournalStatus.POSTED,
      totalDebit: 100000,
      totalCredit: 100000,
      lines: [],
      createdBy: "admin",
      createdAt: AppClock.nowISO()
    });

    await expect(new AccountingPostingService().correctPostedExpense({
      journalId: "lab-payment-journal",
      correctionDate: "2027-03-13",
      reason: "Koreksi pembayaran laboratorium",
      expenseAccountId: "expense-account",
      paymentAccountId: "bank-account",
      paymentMethod: PaymentMethod.TRANSFER,
      amount: 100000,
      description: "Koreksi nota"
    })).rejects.toThrow("Pembayaran nota lab tidak dapat dikoreksi melalui Pengeluaran umum");
  });
});
