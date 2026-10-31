import { describe, expect, it } from "vitest";
import { DentalDoctor, Invoice, InvoiceStatus, TreatmentJob } from "../types/domain";
import { getInvoiceDoctorName, getReceiptInvoiceSnapshot } from "../utils/receiptUtils";

describe("receipt utilities", () => {
  it("uses a complete, internally consistent historical balance snapshot", () => {
    expect(
      getReceiptInvoiceSnapshot({
        invoiceNetAmountSnapshot: 250000,
        invoicePaidAmountSnapshot: 100000,
        invoiceOutstandingAmountSnapshot: 150000
      })
    ).toEqual({
      netAmount: 250000,
      paidAmount: 100000,
      outstandingAmount: 150000
    });
  });

  it("does not substitute invoice balances when a historical snapshot is missing or inconsistent", () => {
    expect(
      getReceiptInvoiceSnapshot({
        invoiceNetAmountSnapshot: undefined,
        invoicePaidAmountSnapshot: undefined,
        invoiceOutstandingAmountSnapshot: undefined
      })
    ).toBeNull();
    expect(
      getReceiptInvoiceSnapshot({
        invoiceNetAmountSnapshot: 250000,
        invoicePaidAmountSnapshot: 100000,
        invoiceOutstandingAmountSnapshot: 100000
      })
    ).toBeNull();
  });

  it("selects only a treatment attached to the invoice visit for the doctor name", () => {
    const invoice: Invoice = {
      id: "invoice-1",
      visitId: "visit-current",
      patientId: "patient-1",
      branchId: "branch-1",
      totalAmount: 100000,
      discountAmount: 0,
      taxAmount: 0,
      netAmount: 100000,
      paidAmount: 0,
      outstandingAmount: 100000,
      status: InvoiceStatus.OPEN,
      createdAt: "2027-01-01T10:00:00Z",
      updatedAt: "2027-01-01T10:00:00Z"
    };
    const staleTreatment: TreatmentJob = {
      id: "treatment-old",
      visitId: "visit-old",
      patientId: invoice.patientId,
      branchId: invoice.branchId,
      doctorId: "doctor-old",
      serviceId: "service-1",
      status: "SELESAI",
      serviceNameSnapshot: "Scaling",
      doctorNameSnapshot: "Dokter Lama",
      createdAt: "2026-12-01T10:00:00Z",
      updatedAt: "2026-12-01T10:00:00Z"
    };
    const matchingTreatment: TreatmentJob = {
      ...staleTreatment,
      id: "treatment-current",
      visitId: invoice.visitId,
      doctorId: "doctor-current",
      doctorNameSnapshot: "Dokter Kunjungan"
    };
    const branchDoctor: DentalDoctor = {
      id: "doctor-old",
      name: "Dokter Cabang",
      specialization: "Umum",
      phone: "",
      active: true,
      isActive: true,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z"
    };

    expect(getInvoiceDoctorName(invoice, [staleTreatment, matchingTreatment], [branchDoctor]))
      .toBe("Dokter Kunjungan");
    expect(getInvoiceDoctorName(invoice, [staleTreatment], [branchDoctor])).toBeUndefined();
  });
});
