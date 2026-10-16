import { describe, it, expect, beforeEach } from "vitest";
import { MockDatabase } from "../data/mockData";
import {
  MockInvoiceRepository,
  MockPaymentRepository,
  MockConfigurationRepository,
  MockBranchRepository
} from "../repositories/mockRepositories";
import {
  UserRole,
  PaymentMethod,
  InvoiceStatus,
  ClinicBranding,
  Invoice,
  PaymentTransaction
} from "../types/domain";
import {
  formatRupiah,
  formatIndoDate,
  formatIndoDateTime,
  numberToTerbilang,
  generateInvoiceNumber,
  generateReceiptNumber,
  getBranchCode,
  createInvoiceWhatsAppMessage,
  createReceiptWhatsAppMessage,
  sanitizeWhatsAppPhone
} from "../utils/documentUtils";

describe("Phase 9D Document Layer, Invoices, Kwitansi, PDF & WhatsApp Tests", () => {
  let invoiceRepo: MockInvoiceRepository;
  let paymentRepo: MockPaymentRepository;
  let configRepo: MockConfigurationRepository;
  let branchRepo: MockBranchRepository;
  let db: MockDatabase;

  beforeEach(() => {
    MockDatabase.resetInstance();
    db = MockDatabase.getInstance();
    invoiceRepo = new MockInvoiceRepository();
    paymentRepo = new MockPaymentRepository();
    configRepo = new MockConfigurationRepository();
    branchRepo = new MockBranchRepository();
  });

  describe("1. Document Number Formatting & Generation", () => {
    it("should generate standardized Invoice numbers with INV/BRANCH_CODE/YYYYMM/XXXX format", () => {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const dateStr = `${year}-${month}-01T10:00:00Z`;
      
      const invNum = generateInvoiceNumber("branch-gebang", dateStr, []);
      expect(invNum).toBe(`INV/GEB/${year}${month}/0001`);
    });

    it("should generate standardized Kwitansi/Receipt numbers with KWT/BRANCH_CODE/YYYYMM/XXXX format", () => {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const dateStr = `${year}-${month}-01T10:00:00Z`;

      const kwtNum = generateReceiptNumber("branch-kencong", dateStr, []);
      expect(kwtNum).toBe(`KWT/KEN/${year}${month}/0001`);
    });

    it("should automatically assign invoiceNumber on createInvoice in standard format", async () => {
      const created = await invoiceRepo.createInvoice({
        visitId: "visit-test-1",
        patientId: "patient-1",
        branchId: "branch-gebang",
        items: [
          {
            serviceId: "service-scaling",
            descriptionSnapshot: "Pembersihan Karang Gigi (Scaling)",
            quantity: 1,
            unitPriceSnapshot: 250000,
            amount: 250000
          }
        ],
        discountAmount: 0,
        taxAmount: 0
      });

      expect(created.invoiceNumber).toBeDefined();
      expect(created.invoiceNumber).toMatch(/^INV\/GEB\/\d{6}\/\d{4}$/);
    });

    it("should automatically assign receiptNumber on createPayment in standard format", async () => {
      const invoices = await invoiceRepo.getInvoices(UserRole.SUPER_ADMIN);
      const targetInv = invoices.find((i) => i.branchId === "branch-gebang" && i.outstandingAmount > 0)!;

      const pmt = await paymentRepo.createPayment({
        invoiceId: targetInv.id,
        amount: 50000,
        paymentMethod: PaymentMethod.QRIS,
        referenceNumber: "QRIS-TEST-9988",
        staffId: "cashier-1"
      });

      expect(pmt.receiptNumber).toBeDefined();
      expect(pmt.receiptNumber).toMatch(/^KWT\/GEB\/\d{6}\/\d{4}$/);
    });
  });

  describe("2. Document Utilities: Currency, Date, Phone, and Terbilang in Indonesian", () => {
    it("should format currency in standard Indonesian Rupiah (Rp)", () => {
      expect(formatRupiah(250000)).toBe("Rp 250.000");
      expect(formatRupiah(0)).toBe("Rp 0");
      expect(formatRupiah(1500000)).toBe("Rp 1.500.000");
    });

    it("should convert numbers into Indonesian Terbilang words", () => {
      expect(numberToTerbilang(0)).toBe("Nol Rupiah");
      expect(numberToTerbilang(250000)).toBe("Dua Ratus Lima Puluh Ribu Rupiah");
      expect(numberToTerbilang(1500000)).toBe("Satu Juta Lima Ratus Ribu Rupiah");
      expect(numberToTerbilang(35000)).toBe("Tiga Puluh Lima Ribu Rupiah");
    });

    it("should format document date and datetime into Indonesian locale", () => {
      const dateStr = "2026-09-22T14:30:00Z";
      const formattedDate = formatIndoDate(dateStr);
      expect(formattedDate).toBeDefined();
      expect(formattedDate).toContain("2026");

      const formattedDateTime = formatIndoDateTime(dateStr);
      expect(formattedDateTime).toBeDefined();
      expect(formattedDateTime).toContain("2026");
    });

    it("should sanitize phone numbers for wa.me URL format", () => {
      expect(sanitizeWhatsAppPhone("081234567890")).toBe("6281234567890");
      expect(sanitizeWhatsAppPhone("+6281234567890")).toBe("6281234567890");
      expect(sanitizeWhatsAppPhone("0811-2233-4455")).toBe("6281122334455");
    });
  });

  describe("3. WhatsApp Message Generator", () => {
    it("should generate formatted WhatsApp message for Invoices", () => {
      const waMsg = createInvoiceWhatsAppMessage({
        clinicName: "Lala Dentist Clinic",
        branchName: "Cabang Gebang",
        invoiceNumber: "INV/GEB/202609/0001",
        patientName: "Budi Santoso",
        totalAmount: 250000,
        discountAmount: 0,
        taxAmount: 0,
        netAmount: 250000,
        paidAmount: 0,
        outstandingAmount: 250000,
        status: "MENUNGGU PEMBAYARAN",
        dateStr: "2026-09-22"
      });

      expect(waMsg).toContain("Lala Dentist Clinic");
      expect(waMsg).toContain("Budi Santoso");
      expect(waMsg).toContain("INV/GEB/202609/0001");
      expect(waMsg).toContain("Rp 250.000");
    });

    it("should generate formatted WhatsApp message for Receipts (Kwitansi)", () => {
      const waMsg = createReceiptWhatsAppMessage({
        clinicName: "Lala Dentist Clinic",
        branchName: "Cabang Gebang",
        receiptNumber: "KWT/GEB/202609/0001",
        invoiceNumber: "INV/GEB/202609/0001",
        patientName: "Budi Santoso",
        amountPaid: 250000,
        paymentMethod: "QRIS",
        referenceNumber: "QRIS-12345",
        remainingOutstanding: 0,
        dateStr: "2026-09-22T14:30:00Z",
        staffName: "Kasir Gebang"
      });

      expect(waMsg).toContain("KWITANSI BUKTI PEMBAYARAN SAH");
      expect(waMsg).toContain("KWT/GEB/202609/0001");
      expect(waMsg).toContain("QRIS");
      expect(waMsg).toContain("Rp 250.000");
      expect(waMsg).toContain("LUNAS");
    });
  });

  describe("4. Clinic Branding Configuration & RBAC Management", () => {
    it("should allow fetching default clinic branding", async () => {
      const brand = await configRepo.getClinicBranding();
      expect(brand).toBeDefined();
      expect(brand.name.toUpperCase()).toContain("LALA DENTIST");
      expect(brand.tagline).toBeDefined();
      expect(brand.footerNote).toBeDefined();
    });

    it("should allow Super Admin to update clinic branding", async () => {
      const updatedBrand: Partial<ClinicBranding> = {
        name: "Lala Dental Care & Aesthetic",
        tagline: "Pusat Perawatan Gigi Terpercaya",
        phone: "0812-9988-7766",
        email: "contact@laladental.id",
        address: "Jl. Veteran No. 88, Jember",
        logoUrl: "https://example.com/new-logo.png",
        footerNote: "Struk / Faktur ini sah dan diterbitkan secara digital."
      };

      const result = await configRepo.updateClinicBranding(
        updatedBrand,
        UserRole.SUPER_ADMIN
      );

      expect(result.name).toBe("Lala Dental Care & Aesthetic");
      expect(result.tagline).toBe("Pusat Perawatan Gigi Terpercaya");

      const fetched = await configRepo.getClinicBranding();
      expect(fetched.name).toBe("Lala Dental Care & Aesthetic");
    });

    it("should reject Branch Admin from modifying clinic branding", async () => {
      const updatedBrand: Partial<ClinicBranding> = {
        name: "Branch Hacked",
        tagline: "Unauthorized"
      };

      await expect(
        configRepo.updateClinicBranding(updatedBrand, UserRole.BRANCH_ADMIN)
      ).rejects.toThrow(/Super Admin/);
    });
  });

  describe("5. Branch Isolation and Document Access Control", () => {
    it("should restrict Branch Admin to invoices only within their branch", async () => {
      const gebangInvoices = await invoiceRepo.getInvoices(
        UserRole.BRANCH_ADMIN,
        "branch-gebang"
      );

      expect(gebangInvoices.length).toBeGreaterThan(0);
      gebangInvoices.forEach((inv) => {
        expect(inv.branchId).toBe("branch-gebang");
      });
    });

    it("should restrict Branch Admin to payments only within their branch", async () => {
      const gebangPayments = await paymentRepo.getPayments(
        UserRole.BRANCH_ADMIN,
        "branch-gebang"
      );

      expect(gebangPayments.length).toBeGreaterThan(0);
      for (const pmt of gebangPayments) {
        const inv = await invoiceRepo.getInvoiceById(pmt.invoiceId);
        expect(inv?.branchId).toBe("branch-gebang");
      }
    });

    it("should allow Super Admin to access all invoices across branches", async () => {
      // Create an invoice in another branch to ensure multi-branch presence
      await invoiceRepo.createInvoice({
        visitId: "visit-kencong-1",
        patientId: "patient-1",
        branchId: "branch-kencong",
        items: [
          {
            serviceId: "service-scaling",
            descriptionSnapshot: "Scaling Kencong",
            quantity: 1,
            unitPriceSnapshot: 150000,
            amount: 150000
          }
        ]
      });

      const allInvoices = await invoiceRepo.getInvoices(UserRole.SUPER_ADMIN);
      const branchIds = new Set(allInvoices.map((i) => i.branchId));

      expect(branchIds.size).toBeGreaterThan(1);
    });
  });

  describe("6. Document Immutability and Snapshotting", () => {
    it("should preserve snapshot descriptions and prices in invoice items", async () => {
      const created = await invoiceRepo.createInvoice({
        visitId: "visit-snap-1",
        patientId: "patient-1",
        branchId: "branch-gebang",
        items: [
          {
            serviceId: "service-scaling",
            descriptionSnapshot: "Scaling Karang Gigi Promosi",
            quantity: 2,
            unitPriceSnapshot: 200000,
            amount: 400000
          }
        ],
        discountAmount: 50000,
        taxAmount: 0
      });

      const fetched = await invoiceRepo.getInvoiceById(created.id);
      expect(fetched).toBeDefined();
      expect(fetched?.netAmount).toBe(350000);
      expect(fetched?.discountAmount).toBe(50000);

      const items = await invoiceRepo.getInvoiceItems(created.id);
      expect(items.length).toBe(1);
      expect(items[0].descriptionSnapshot).toBe("Scaling Karang Gigi Promosi");
      expect(items[0].unitPriceSnapshot).toBe(200000);
      expect(items[0].amount).toBe(400000);
    });
  });
});
