import { describe, it, expect, beforeEach } from "vitest";
import {
  MockAccountingRepository,
  MockInvoiceRepository,
  MockPaymentRepository,
  MockCompensationRepository,
  MockPayrollRepository,
  MockTreatmentRepository,
  MockDoctorRepository
} from "../repositories/mockRepositories";
import {
  AccountingPostingService,
  AccountingAccountResolver
} from "../services/accountingPostingService";
import {
  InvoiceStatus,
  PaymentMethod,
  PayrollStatus,
  JournalSourceType,
  JournalStatus,
  UserRole,
  AccountCategory
} from "../types/domain";
import { MockDatabase } from "../data/mockData";

describe("Accounting Phase 2: Automatic Journal Posting Engine", () => {
  const db = MockDatabase.getInstance();
  let accountingRepo: MockAccountingRepository;
  let invoiceRepo: MockInvoiceRepository;
  let paymentRepo: MockPaymentRepository;
  let compRepo: MockCompensationRepository;
  let payrollRepo: MockPayrollRepository;
  let treatmentRepo: MockTreatmentRepository;
  let doctorRepo: MockDoctorRepository;
  let service: AccountingPostingService;

  beforeEach(() => {
    // Reset or instantiate clean repository references
    accountingRepo = new MockAccountingRepository();
    invoiceRepo = new MockInvoiceRepository();
    paymentRepo = new MockPaymentRepository();
    compRepo = new MockCompensationRepository();
    payrollRepo = new MockPayrollRepository();
    treatmentRepo = new MockTreatmentRepository();
    doctorRepo = new MockDoctorRepository();

    service = new AccountingPostingService({
      accountingRepo,
      invoiceRepo,
      paymentRepo,
      compRepo,
      payrollRepo,
      treatmentRepo,
      doctorRepo
    });
  });

  // =========================================================================
  // 1. INVOICE REVENUE RECOGNITION TESTS
  // =========================================================================
  describe("1. Invoice Revenue Recognition Auto-Posting", () => {
    it("should generate a POSTED revenue recognition journal for an OPEN invoice", async () => {
      const invoice = await invoiceRepo.createInvoice({
        visitId: "visit-test-1",
        patientId: "patient-1",
        branchId: "branch-gebang",
        items: [
          {
            serviceId: "service-scaling",
            descriptionSnapshot: "Scaling & Polishing",
            unitPriceSnapshot: 350000,
            quantity: 1
          }
        ]
      });

      const journal = await service.postInvoice(invoice.id);

      expect(journal).toBeDefined();
      expect(journal.status).toBe(JournalStatus.POSTED);
      expect(journal.sourceType).toBe(JournalSourceType.INVOICE);
      expect(journal.sourceId).toBe(invoice.id);
      expect(journal.branchId).toBe("branch-gebang");
      expect(journal.totalDebit).toBe(350000);
      expect(journal.totalCredit).toBe(350000);
      expect(journal.lines).toHaveLength(2);
    });

    it("should accurately reflect net amount considering discounts and tax", async () => {
      const invoice = await invoiceRepo.createInvoice({
        visitId: "visit-test-discount",
        patientId: "patient-1",
        branchId: "branch-gebang",
        items: [
          {
            serviceId: "service-bleaching",
            descriptionSnapshot: "Bleaching",
            unitPriceSnapshot: 1000000,
            quantity: 1
          }
        ],
        discountAmount: 150000,
        taxAmount: 50000
      });

      // Net amount = 1.000.000 - 150.000 + 50.000 = 900.000
      expect(invoice.netAmount).toBe(900000);

      const journal = await service.postInvoice(invoice.id);
      expect(journal.totalDebit).toBe(900000);
      expect(journal.totalCredit).toBe(900000);

      const debitLine = journal.lines.find((l) => l.debit > 0);
      const creditLine = journal.lines.find((l) => l.credit > 0);

      expect(debitLine?.debit).toBe(900000);
      expect(creditLine?.credit).toBe(900000);
    });

    it("should debit Accounts Receivable and credit Treatment Revenue dynamically via COA", async () => {
      const invoice = await invoiceRepo.createInvoice({
        visitId: "visit-test-coa",
        patientId: "patient-2",
        branchId: "branch-mataram",
        items: [
          {
            serviceId: "service-scaling",
            descriptionSnapshot: "Tambal Gigi Komposit",
            unitPriceSnapshot: 500000,
            quantity: 2
          }
        ]
      });

      const journal = await service.postInvoice(invoice.id);

      const arAccount = await accountingRepo.getAccountByCode("1100");
      const revAccount = await accountingRepo.getAccountByCode("4000");

      const arLine = journal.lines.find((l) => l.accountId === arAccount?.id);
      const revLine = journal.lines.find((l) => l.accountId === revAccount?.id);

      expect(arLine).toBeDefined();
      expect(arLine?.debit).toBe(1000000);
      expect(arLine?.credit).toBe(0);

      expect(revLine).toBeDefined();
      expect(revLine?.debit).toBe(0);
      expect(revLine?.credit).toBe(1000000);
    });

    it("should be idempotent and not create duplicate journals when called multiple times", async () => {
      const invoice = await invoiceRepo.createInvoice({
        visitId: "visit-test-idempotency",
        patientId: "patient-1",
        branchId: "branch-gebang",
        items: [
          {
            serviceId: "service-scaling",
            descriptionSnapshot: "Scaling",
            unitPriceSnapshot: 200000,
            quantity: 1
          }
        ]
      });

      const journal1 = await service.postInvoice(invoice.id);
      const journal2 = await service.postInvoice(invoice.id);

      expect(journal1.id).toBe(journal2.id);
      expect(journal1.journalNumber).toBe(journal2.journalNumber);

      const allInvoiceJournals = (db.journals || []).filter(
        (j: any) => j.sourceType === JournalSourceType.INVOICE && j.sourceId === invoice.id
      );
      expect(allInvoiceJournals).toHaveLength(1);
    });

    it("should reject posting a CANCELLED invoice", async () => {
      const invoice = await invoiceRepo.createInvoice({
        visitId: "visit-test-cancelled",
        patientId: "patient-1",
        branchId: "branch-gebang",
        items: [
          {
            serviceId: "service-scaling",
            descriptionSnapshot: "Scaling",
            unitPriceSnapshot: 200000,
            quantity: 1
          }
        ]
      });

      await invoiceRepo.cancelInvoice(invoice.id);

      await expect(service.postInvoice(invoice.id)).rejects.toThrow(
        /belum berada pada status yang dapat diakui sebagai revenue/
      );
    });

    it("should reject posting an invoice with 0 net amount", async () => {
      // Create invoice with 100% discount
      const invoice = await invoiceRepo.createInvoice({
        visitId: "visit-test-free",
        patientId: "patient-1",
        branchId: "branch-gebang",
        items: [
          {
            serviceId: "service-scaling",
            descriptionSnapshot: "Scaling Gratis",
            unitPriceSnapshot: 100000,
            quantity: 1
          }
        ],
        discountAmount: 100000
      });

      expect(invoice.netAmount).toBe(0);
      await expect(service.postInvoice(invoice.id)).rejects.toThrow(
        /harus lebih dari 0/
      );
    });

    it("should enforce Branch Admin branch isolation on invoice posting", async () => {
      const invoice = await invoiceRepo.createInvoice({
        visitId: "visit-test-branch-iso",
        patientId: "patient-1",
        branchId: "branch-mataram",
        items: [
          {
            serviceId: "service-scaling",
            descriptionSnapshot: "Scaling",
            unitPriceSnapshot: 200000,
            quantity: 1
          }
        ]
      });

      // Branch admin from branch-gebang cannot post invoice for branch-mataram
      await expect(
        service.postInvoice(
          invoice.id,
          UserRole.BRANCH_ADMIN,
          "branch-gebang"
        )
      ).rejects.toThrow(/(Akses ditolak|tidak dapat mengakses)/);
    });

    it("should allow Branch Admin to post invoice belonging to their own branch", async () => {
      const invoice = await invoiceRepo.createInvoice({
        visitId: "visit-test-own-branch",
        patientId: "patient-1",
        branchId: "branch-gebang",
        items: [
          {
            serviceId: "service-scaling",
            descriptionSnapshot: "Scaling",
            unitPriceSnapshot: 200000,
            quantity: 1
          }
        ]
      });

      const journal = await service.postInvoice(
        invoice.id,
        UserRole.BRANCH_ADMIN,
        "branch-gebang"
      );

      expect(journal.status).toBe(JournalStatus.POSTED);
      expect(journal.branchId).toBe("branch-gebang");
    });

    it("should throw a clear error when required account is missing or inactive", async () => {
      const tempAccounts = await accountingRepo.getAccounts();
      const revAcc = tempAccounts.find((a) => a.code === "4000");
      if (revAcc) {
        await accountingRepo.updateAccount(revAcc.id, { isActive: false });
      }

      const invoice = await invoiceRepo.createInvoice({
        visitId: "visit-test-inactive",
        patientId: "patient-1",
        branchId: "branch-gebang",
        items: [
          {
            serviceId: "service-scaling",
            descriptionSnapshot: "Scaling",
            unitPriceSnapshot: 200000,
            quantity: 1
          }
        ]
      });

      await expect(service.postInvoice(invoice.id)).rejects.toThrow(/nonaktif/);

      // Restore account active status
      if (revAcc) {
        await accountingRepo.updateAccount(revAcc.id, { isActive: true });
      }
    });

    it("should support syncInvoiceAccounting convenience alias", async () => {
      const invoice = await invoiceRepo.createInvoice({
        visitId: "visit-test-alias",
        patientId: "patient-1",
        branchId: "branch-gebang",
        items: [
          {
            serviceId: "service-scaling",
            descriptionSnapshot: "Scaling",
            unitPriceSnapshot: 200000,
            quantity: 1
          }
        ]
      });

      const journal = await service.syncInvoiceAccounting(invoice.id);
      expect(journal.status).toBe(JournalStatus.POSTED);
    });
  });

  // =========================================================================
  // 2. PAYMENT SETTLEMENT POSTING TESTS
  // =========================================================================
  describe("2. Payment Settlement Auto-Posting", () => {
    it("should post CASH payment: Debit Kas (1000) and Credit AR (1100)", async () => {
      const invoice = await invoiceRepo.createInvoice({
        visitId: "visit-pay-cash",
        patientId: "patient-1",
        branchId: "branch-gebang",
        items: [
          {
            serviceId: "service-scaling",
            descriptionSnapshot: "Scaling",
            unitPriceSnapshot: 300000,
            quantity: 1
          }
        ]
      });

      const payment = await paymentRepo.createPayment({
        invoiceId: invoice.id,
        amount: 300000,
        paymentMethod: PaymentMethod.CASH,
        staffId: "staff-1"
      });

      const journal = await service.postPayment(payment.id);

      expect(journal.status).toBe(JournalStatus.POSTED);
      expect(journal.sourceType).toBe(JournalSourceType.PAYMENT);
      expect(journal.sourceId).toBe(payment.id);
      expect(journal.totalDebit).toBe(300000);
      expect(journal.totalCredit).toBe(300000);

      const cashAcc = await accountingRepo.getAccountByCode("1000");
      const arAcc = await accountingRepo.getAccountByCode("1100");

      const cashLine = journal.lines.find((l) => l.accountId === cashAcc?.id);
      const arLine = journal.lines.find((l) => l.accountId === arAcc?.id);

      expect(cashLine?.debit).toBe(300000);
      expect(cashLine?.credit).toBe(0);
      expect(arLine?.debit).toBe(0);
      expect(arLine?.credit).toBe(300000);
    });

    it("should post QRIS payment: Debit QRIS Clearing / Bank (1010) and Credit AR (1100)", async () => {
      const invoice = await invoiceRepo.createInvoice({
        visitId: "visit-pay-qris",
        patientId: "patient-1",
        branchId: "branch-gebang",
        items: [
          {
            serviceId: "service-bleaching",
            descriptionSnapshot: "Bleaching",
            unitPriceSnapshot: 1500000,
            quantity: 1
          }
        ]
      });

      const payment = await paymentRepo.createPayment({
        invoiceId: invoice.id,
        amount: 1500000,
        paymentMethod: PaymentMethod.QRIS,
        referenceNumber: "QRIS-TEST-9921",
        staffId: "staff-1"
      });

      const journal = await service.postPayment(payment.id);

      const bankAcc = await accountingRepo.getAccountByCode("1010");
      const bankLine = journal.lines.find((l) => l.accountId === bankAcc?.id);

      expect(bankLine?.debit).toBe(1500000);
      expect(journal.totalDebit).toBe(1500000);
    });

    it("should post TRANSFER payment: Debit Bank (1010) and Credit AR (1100)", async () => {
      const invoice = await invoiceRepo.createInvoice({
        visitId: "visit-pay-trf",
        patientId: "patient-1",
        branchId: "branch-mataram",
        items: [
          {
            serviceId: "service-scaling",
            descriptionSnapshot: "Scaling",
            unitPriceSnapshot: 400000,
            quantity: 1
          }
        ]
      });

      const payment = await paymentRepo.createPayment({
        invoiceId: invoice.id,
        amount: 400000,
        paymentMethod: PaymentMethod.TRANSFER,
        referenceNumber: "BCA-TRF-12345",
        staffId: "staff-1"
      });

      const journal = await service.postPayment(payment.id);

      expect(journal.branchId).toBe("branch-mataram");
      expect(journal.totalDebit).toBe(400000);
      expect(journal.totalCredit).toBe(400000);
    });

    it("should handle partial payment seamlessly with correct partial amount", async () => {
      const invoice = await invoiceRepo.createInvoice({
        visitId: "visit-pay-part",
        patientId: "patient-1",
        branchId: "branch-gebang",
        items: [
          {
            serviceId: "service-bleaching",
            descriptionSnapshot: "Treatment",
            unitPriceSnapshot: 1000000,
            quantity: 1
          }
        ]
      });

      // Partial payment: 400.000 of 1.000.000
      const payment = await paymentRepo.createPayment({
        invoiceId: invoice.id,
        amount: 400000,
        paymentMethod: PaymentMethod.CASH,
        staffId: "staff-1"
      });

      const journal = await service.postPayment(payment.id);

      expect(journal.totalDebit).toBe(400000);
      expect(journal.totalCredit).toBe(400000);
    });

    it("should create distinct journals for multiple partial payments", async () => {
      const invoice = await invoiceRepo.createInvoice({
        visitId: "visit-pay-multi",
        patientId: "patient-1",
        branchId: "branch-gebang",
        items: [
          {
            serviceId: "service-bleaching",
            descriptionSnapshot: "Multi Payment Treatment",
            unitPriceSnapshot: 1000000,
            quantity: 1
          }
        ]
      });

      const payment1 = await paymentRepo.createPayment({
        invoiceId: invoice.id,
        amount: 400000,
        paymentMethod: PaymentMethod.QRIS,
        staffId: "staff-1"
      });

      const payment2 = await paymentRepo.createPayment({
        invoiceId: invoice.id,
        amount: 600000,
        paymentMethod: PaymentMethod.CASH,
        staffId: "staff-1"
      });

      const journal1 = await service.postPayment(payment1.id);
      const journal2 = await service.postPayment(payment2.id);

      expect(journal1.id).not.toBe(journal2.id);
      expect(journal1.sourceId).toBe(payment1.id);
      expect(journal2.sourceId).toBe(payment2.id);
      expect(journal1.totalDebit).toBe(400000);
      expect(journal2.totalDebit).toBe(600000);
    });

    it("should be idempotent for payment posting", async () => {
      const invoice = await invoiceRepo.createInvoice({
        visitId: "visit-pay-idem",
        patientId: "patient-1",
        branchId: "branch-gebang",
        items: [
          {
            serviceId: "service-scaling",
            descriptionSnapshot: "Scaling",
            unitPriceSnapshot: 250000,
            quantity: 1
          }
        ]
      });

      const payment = await paymentRepo.createPayment({
        invoiceId: invoice.id,
        amount: 250000,
        paymentMethod: PaymentMethod.CASH,
        staffId: "staff-1"
      });

      const j1 = await service.postPayment(payment.id);
      const j2 = await service.postPayment(payment.id);

      expect(j1.id).toBe(j2.id);
      expect(j1.journalNumber).toBe(j2.journalNumber);
    });

    it("should inherit the branchId from the associated invoice", async () => {
      const invoice = await invoiceRepo.createInvoice({
        visitId: "visit-pay-branch",
        patientId: "patient-1",
        branchId: "branch-mataram",
        items: [
          {
            serviceId: "service-scaling",
            descriptionSnapshot: "Scaling",
            unitPriceSnapshot: 250000,
            quantity: 1
          }
        ]
      });

      const payment = await paymentRepo.createPayment({
        invoiceId: invoice.id,
        amount: 250000,
        paymentMethod: PaymentMethod.CASH,
        staffId: "staff-1"
      });

      const journal = await service.postPayment(payment.id);
      expect(journal.branchId).toBe("branch-mataram");
    });

    it("should reject payment posting if branch admin attempts cross-branch post", async () => {
      const invoice = await invoiceRepo.createInvoice({
        visitId: "visit-pay-branch-reject",
        patientId: "patient-1",
        branchId: "branch-mataram",
        items: [
          {
            serviceId: "service-scaling",
            descriptionSnapshot: "Scaling",
            unitPriceSnapshot: 250000,
            quantity: 1
          }
        ]
      });

      const payment = await paymentRepo.createPayment({
        invoiceId: invoice.id,
        amount: 250000,
        paymentMethod: PaymentMethod.CASH,
        staffId: "staff-1"
      });

      await expect(
        service.postPayment(
          payment.id,
          UserRole.BRANCH_ADMIN,
          "branch-gebang"
        )
      ).rejects.toThrow(/Akses ditolak/);
    });

    it("should provide posting status query correctly", async () => {
      const invoice = await invoiceRepo.createInvoice({
        visitId: "visit-pay-status-q",
        patientId: "patient-1",
        branchId: "branch-gebang",
        items: [
          {
            serviceId: "service-scaling",
            descriptionSnapshot: "Scaling",
            unitPriceSnapshot: 250000,
            quantity: 1
          }
        ]
      });

      const payment = await paymentRepo.createPayment({
        invoiceId: invoice.id,
        amount: 250000,
        paymentMethod: PaymentMethod.CASH,
        staffId: "staff-1"
      });

      const statusBefore = await service.getPostingStatus(
        JournalSourceType.PAYMENT,
        payment.id
      );
      expect(statusBefore.isPosted).toBe(false);

      await service.postPayment(payment.id);

      const statusAfter = await service.getPostingStatus(
        JournalSourceType.PAYMENT,
        payment.id
      );
      expect(statusAfter.isPosted).toBe(true);
      expect(statusAfter.journal).toBeDefined();
    });

    it("should support syncPaymentAccounting alias", async () => {
      const invoice = await invoiceRepo.createInvoice({
        visitId: "visit-pay-alias",
        patientId: "patient-1",
        branchId: "branch-gebang",
        items: [
          {
            serviceId: "service-scaling",
            descriptionSnapshot: "Scaling",
            unitPriceSnapshot: 250000,
            quantity: 1
          }
        ]
      });

      const payment = await paymentRepo.createPayment({
        invoiceId: invoice.id,
        amount: 250000,
        paymentMethod: PaymentMethod.CASH,
        staffId: "staff-1"
      });

      const journal = await service.syncPaymentAccounting(payment.id);
      expect(journal.status).toBe(JournalStatus.POSTED);
    });
  });

  function createTestAccrual(data: {
    id?: string;
    staffId: string;
    ruleId?: string;
    sourceId?: string;
    amount: number;
    basisAmount?: number;
    percentageSnapshot?: number;
    accruedAt?: string;
  }) {
    const accrual = {
      id: data.id || `accrual-test-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      staffId: data.staffId,
      ruleIdSnapshot: data.ruleId || "rule-default",
      ruleTypeSnapshot: "PERCENTAGE" as const,
      valueSnapshot: data.percentageSnapshot ?? 40,
      baseAmountSnapshot: data.basisAmount ?? data.amount,
      amount: data.amount,
      sourceId: data.sourceId || "treatment-job-1",
      accruedAt: data.accruedAt || "2026-09-21T10:00:00.000Z"
    };
    db.accruals.push(accrual);
    return accrual;
  }

  // =========================================================================
  // 3. COMPENSATION ACCRUAL POSTING TESTS
  // =========================================================================
  describe("3. Compensation Accrual Auto-Posting", () => {
    it("should post compensation accrual for Doctor using Doctor Fee accounts", async () => {
      // Create compensation accrual for doctor
      const accrual = createTestAccrual({
        staffId: "doctor-syarif",
        ruleId: "rule-doctor-scaling",
        sourceId: "treatment-job-1",
        basisAmount: 500000,
        percentageSnapshot: 40,
        amount: 200000,
        accruedAt: "2026-09-21T10:00:00.000Z"
      });

      const journal = await service.postCompensation(accrual.id);

      expect(journal.status).toBe(JournalStatus.POSTED);
      expect(journal.sourceType).toBe(JournalSourceType.COMPENSATION);
      expect(journal.sourceId).toBe(accrual.id);
      expect(journal.totalDebit).toBe(200000);
      expect(journal.totalCredit).toBe(200000);

      // COA: Doctor Fee Expense (5010) / Doctor Payable (2020)
      const docExpAcc = await accountingRepo.getAccountByCode("5010");
      const docPayAcc = await accountingRepo.getAccountByCode("2020");

      const expLine = journal.lines.find((l) => l.accountId === docExpAcc?.id);
      const payLine = journal.lines.find((l) => l.accountId === docPayAcc?.id);

      expect(expLine?.debit).toBe(200000);
      expect(payLine?.credit).toBe(200000);
    });

    it("should post compensation accrual for Assistant using Incentive accounts", async () => {
      const accrual = createTestAccrual({
        staffId: "staff-asst-1",
        ruleId: "rule-asst-scaling",
        sourceId: "treatment-job-1",
        basisAmount: 500000,
        percentageSnapshot: 5,
        amount: 25000,
        accruedAt: "2026-09-21T10:00:00.000Z"
      });

      const journal = await service.postCompensation(accrual.id);

      expect(journal.totalDebit).toBe(25000);
      expect(journal.totalCredit).toBe(25000);

      // COA: Incentive Expense (5020) / Incentive Payable (2030)
      const incExpAcc = await accountingRepo.getAccountByCode("5020");
      const incPayAcc = await accountingRepo.getAccountByCode("2030");

      const expLine = journal.lines.find((l) => l.accountId === incExpAcc?.id);
      const payLine = journal.lines.find((l) => l.accountId === incPayAcc?.id);

      expect(expLine?.debit).toBe(25000);
      expect(payLine?.credit).toBe(25000);
    });

    it("should maintain Model C integrity by preserving snapshot nominal", async () => {
      const accrual = createTestAccrual({
        staffId: "doctor-syarif",
        ruleId: "rule-model-c",
        sourceId: "treatment-cont-part2",
        basisAmount: 800000,
        percentageSnapshot: 35,
        amount: 280000,
        accruedAt: "2026-09-21T10:00:00.000Z"
      });

      const journal = await service.postCompensation(accrual.id);
      expect(journal.totalDebit).toBe(280000);
      expect(journal.totalCredit).toBe(280000);
    });

    it("should be idempotent when posting compensation", async () => {
      const accrual = createTestAccrual({
        staffId: "doctor-syarif",
        ruleId: "rule-idem",
        sourceId: "treatment-job-idem",
        basisAmount: 500000,
        percentageSnapshot: 30,
        amount: 150000
      });

      const j1 = await service.postCompensation(accrual.id);
      const j2 = await service.postCompensation(accrual.id);

      expect(j1.id).toBe(j2.id);
    });

    it("should reject compensation posting if amount is 0", async () => {
      const accrual = createTestAccrual({
        staffId: "doctor-syarif",
        ruleId: "rule-zero",
        sourceId: "treatment-job-zero",
        basisAmount: 0,
        percentageSnapshot: 0,
        amount: 0
      });

      await expect(service.postCompensation(accrual.id)).rejects.toThrow(
        /harus lebih dari 0/
      );
    });

    it("should resolve treatment branch accurately from source treatment", async () => {
      const accrual = createTestAccrual({
        staffId: "doctor-syarif",
        ruleId: "rule-branch-test",
        sourceId: "treatment-job-gebang-1",
        basisAmount: 500000,
        percentageSnapshot: 40,
        amount: 200000
      });

      const journal = await service.postCompensation(accrual.id);
      expect(journal.branchId).toBeDefined();
    });

    it("should support syncCompensationAccounting alias", async () => {
      const accrual = createTestAccrual({
        staffId: "staff-asst-1",
        ruleId: "rule-alias",
        sourceId: "treatment-alias",
        basisAmount: 400000,
        percentageSnapshot: 5,
        amount: 20000
      });

      const journal = await service.syncCompensationAccounting(accrual.id);
      expect(journal.status).toBe(JournalStatus.POSTED);
    });
  });

  // =========================================================================
  // 4. MONTHLY PAYROLL ACCRUAL POSTING TESTS
  // =========================================================================
  describe("4. Monthly Payroll Accrual Auto-Posting", () => {
    it("should post compound accrual journal for APPROVED payroll with base salary and compensation", async () => {
      const testStaffId = "staff-payroll-compound-1";
      // First create compensation accrual so payroll picks it up
      createTestAccrual({
        staffId: testStaffId,
        ruleId: "rule-bonus",
        sourceId: "treatment-bonus-1",
        basisAmount: 3000000,
        percentageSnapshot: 50,
        amount: 1500000,
        accruedAt: "2026-09-20T10:00:00.000Z"
      });

      const payroll = await payrollRepo.generateMonthlyPayroll(
        testStaffId,
        9,
        2026,
        5000000
      );
      await payrollRepo.updatePayrollStatus(payroll.id, PayrollStatus.APPROVED);

      const journal = await service.postPayroll(payroll.id);

      expect(journal.status).toBe(JournalStatus.POSTED);
      expect(journal.sourceType).toBe(JournalSourceType.PAYROLL);
      expect(journal.sourceId).toBe(payroll.id);
      expect(journal.totalDebit).toBe(6500000);
      expect(journal.totalCredit).toBe(6500000);
      expect(journal.lines).toHaveLength(4);

      const salExpAcc = await accountingRepo.getAccountByCode("5000");
      const salPayAcc = await accountingRepo.getAccountByCode("2010");
      const incExpAcc = await accountingRepo.getAccountByCode("5020");
      const incPayAcc = await accountingRepo.getAccountByCode("2030");

      const salExpLine = journal.lines.find((l) => l.accountId === salExpAcc?.id);
      const salPayLine = journal.lines.find((l) => l.accountId === salPayAcc?.id);
      const incExpLine = journal.lines.find((l) => l.accountId === incExpAcc?.id);
      const incPayLine = journal.lines.find((l) => l.accountId === incPayAcc?.id);

      expect(salExpLine?.debit).toBe(5000000);
      expect(salPayLine?.credit).toBe(5000000);
      expect(incExpLine?.debit).toBe(1500000);
      expect(incPayLine?.credit).toBe(1500000);
    });

    it("should post accrual journal for PAID payroll", async () => {
      const payroll = await payrollRepo.generateMonthlyPayroll(
        "doctor-syarif",
        8,
        2026,
        4000000
      );
      await payrollRepo.updatePayrollStatus(payroll.id, PayrollStatus.PAID);

      const journal = await service.postPayroll(payroll.id);
      expect(journal.status).toBe(JournalStatus.POSTED);
      expect(journal.totalDebit).toBe(payroll.netSalary);
      expect(journal.totalCredit).toBe(payroll.netSalary);
    });

    it("should reject posting a DRAFT payroll", async () => {
      const payroll = await payrollRepo.generateMonthlyPayroll(
        "doctor-syarif",
        10,
        2026,
        4000000
      );
      // Status is DRAFT
      expect(payroll.status).toBe(PayrollStatus.DRAFT);

      await expect(service.postPayroll(payroll.id)).rejects.toThrow(
        /belum berada pada status yang dapat diakui/
      );
    });

    it("should be idempotent when posting payroll", async () => {
      const payroll = await payrollRepo.generateMonthlyPayroll(
        "doctor-syarif",
        7,
        2026,
        4500000
      );
      await payrollRepo.updatePayrollStatus(payroll.id, PayrollStatus.APPROVED);

      const j1 = await service.postPayroll(payroll.id);
      const j2 = await service.postPayroll(payroll.id);

      expect(j1.id).toBe(j2.id);
      expect(j1.journalNumber).toBe(j2.journalNumber);
    });

    it("should handle payroll with only base salary (no compensation) cleanly with 2 lines", async () => {
      const payroll = await payrollRepo.generateMonthlyPayroll(
        "doctor-non-accrual",
        6,
        2026,
        3000000
      );
      await payrollRepo.updatePayrollStatus(payroll.id, PayrollStatus.APPROVED);

      const journal = await service.postPayroll(payroll.id);
      expect(journal.lines).toHaveLength(2);
      expect(journal.totalDebit).toBe(3000000);
      expect(journal.totalCredit).toBe(3000000);
    });

    it("should support syncPayrollAccounting alias", async () => {
      const payroll = await payrollRepo.generateMonthlyPayroll(
        "doctor-non-accrual",
        5,
        2026,
        3500000
      );
      await payrollRepo.updatePayrollStatus(payroll.id, PayrollStatus.APPROVED);

      const journal = await service.syncPayrollAccounting(payroll.id);
      expect(journal.status).toBe(JournalStatus.POSTED);
    });
  });

  // =========================================================================
  // 5. GENERAL LEDGER INTEGRATION & RECONCILIATION TESTS
  // =========================================================================
  describe("5. General Ledger Integration & Full Reconciliation", () => {
    it("should accurately reflect debit, credit, and running balance in General Ledger for Invoice + Partial Payments", async () => {
      // 1. Create Invoice Rp 1.000.000
      const invoice = await invoiceRepo.createInvoice({
        visitId: "visit-recon-1",
        patientId: "patient-1",
        branchId: "branch-gebang",
        items: [
          {
            serviceId: "service-bleaching",
            descriptionSnapshot: "Bleaching",
            unitPriceSnapshot: 1000000,
            quantity: 1
          }
        ]
      });
      await service.postInvoice(invoice.id);

      // 2. First Payment Rp 400.000 via QRIS
      const payment1 = await paymentRepo.createPayment({
        invoiceId: invoice.id,
        amount: 400000,
        paymentMethod: PaymentMethod.QRIS,
        referenceNumber: "QRIS-RECON-1",
        staffId: "staff-1"
      });
      await service.postPayment(payment1.id);

      // 3. Second Payment Rp 600.000 via CASH
      const payment2 = await paymentRepo.createPayment({
        invoiceId: invoice.id,
        amount: 600000,
        paymentMethod: PaymentMethod.CASH,
        staffId: "staff-1"
      });
      await service.postPayment(payment2.id);

      // Query General Ledger for Accounts Receivable (1100)
      const arAccount = await accountingRepo.getAccountByCode("1100");
      expect(arAccount).toBeDefined();

      const glEntries = await accountingRepo.getLedgerEntries({
        accountId: arAccount!.id
      });

      // Filter entries related to our test invoice & payments
      const relevantEntries = glEntries.filter(
        (e) =>
          (e.sourceType === JournalSourceType.INVOICE && e.sourceId === invoice.id) ||
          (e.sourceType === JournalSourceType.PAYMENT &&
            (e.sourceId === payment1.id || e.sourceId === payment2.id))
      );

      expect(relevantEntries).toHaveLength(3);

      // First entry: Invoice recognition (Debit 1.000.000)
      const invEntry = relevantEntries.find((e) => e.sourceType === JournalSourceType.INVOICE);
      expect(invEntry?.debit).toBe(1000000);
      expect(invEntry?.credit).toBe(0);

      // Second entry: Payment 1 (Credit 400.000)
      const pmt1Entry = relevantEntries.find((e) => e.sourceId === payment1.id);
      expect(pmt1Entry?.debit).toBe(0);
      expect(pmt1Entry?.credit).toBe(400000);

      // Third entry: Payment 2 (Credit 600.000)
      const pmt2Entry = relevantEntries.find((e) => e.sourceId === payment2.id);
      expect(pmt2Entry?.debit).toBe(0);
      expect(pmt2Entry?.credit).toBe(600000);

      // Net AR for this invoice is completely settled: 1.000.000 - 400.000 - 600.000 = 0
      const totalARDebit = relevantEntries.reduce((sum, e) => sum + e.debit, 0);
      const totalARCredit = relevantEntries.reduce((sum, e) => sum + e.credit, 0);
      expect(totalARDebit).toBe(1000000);
      expect(totalARCredit).toBe(1000000);
      expect(totalARDebit - totalARCredit).toBe(0);
    });

    it("should query General Ledger for Cash and Bank to verify exact settled balances", async () => {
      const invoice = await invoiceRepo.createInvoice({
        visitId: "visit-recon-cash-bank",
        patientId: "patient-1",
        branchId: "branch-gebang",
        items: [
          {
            serviceId: "service-scaling",
            descriptionSnapshot: "Scaling",
            unitPriceSnapshot: 500000,
            quantity: 1
          }
        ]
      });
      await service.postInvoice(invoice.id);

      const paymentCash = await paymentRepo.createPayment({
        invoiceId: invoice.id,
        amount: 200000,
        paymentMethod: PaymentMethod.CASH,
        staffId: "staff-1"
      });
      const paymentBank = await paymentRepo.createPayment({
        invoiceId: invoice.id,
        amount: 300000,
        paymentMethod: PaymentMethod.TRANSFER,
        staffId: "staff-1"
      });

      await service.postPayment(paymentCash.id);
      await service.postPayment(paymentBank.id);

      const cashAcc = await accountingRepo.getAccountByCode("1000");
      const bankAcc = await accountingRepo.getAccountByCode("1010");

      const cashLedger = await accountingRepo.getLedgerEntries({ accountId: cashAcc!.id });
      const bankLedger = await accountingRepo.getLedgerEntries({ accountId: bankAcc!.id });

      const cashEntry = cashLedger.find((e) => e.sourceId === paymentCash.id);
      const bankEntry = bankLedger.find((e) => e.sourceId === paymentBank.id);

      expect(cashEntry?.debit).toBe(200000);
      expect(bankEntry?.debit).toBe(300000);
    });

    it("should preserve source traceability on all generated GL rows", async () => {
      const invoice = await invoiceRepo.createInvoice({
        visitId: "visit-trace",
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
      const journal = await service.postInvoice(invoice.id);

      const gl = await accountingRepo.getLedgerEntries({ branchId: "branch-gebang" });
      const glItem = gl.find((e) => e.journalId === journal.id);

      expect(glItem).toBeDefined();
      expect(glItem?.sourceType).toBe(JournalSourceType.INVOICE);
      expect(glItem?.sourceId).toBe(invoice.id);
      expect(glItem?.journalNumber).toMatch(/^JRN-GEB-\d{8}-\d{4}$/);
    });

    it("should enforce immutability on POSTED automatic journals", async () => {
      const invoice = await invoiceRepo.createInvoice({
        visitId: "visit-immutable",
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
      const journal = await service.postInvoice(invoice.id);

      // Attempting to update or delete a POSTED automatic journal must fail
      await expect(
        accountingRepo.updateDraftJournal(journal.id, { description: "Tampered" })
      ).rejects.toThrow(/Immutability Violation/);

      await expect(
        accountingRepo.deleteDraftJournal(journal.id)
      ).rejects.toThrow(/Immutability Violation/);
    });

    it("should allow voiding an automatic journal and maintaining audit trail", async () => {
      const invoice = await invoiceRepo.createInvoice({
        visitId: "visit-void-test",
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
      const journal = await service.postInvoice(invoice.id);

      const voided = await accountingRepo.voidJournal(
        journal.id,
        "admin-super",
        "Koreksi billing pasien"
      );

      expect(voided.status).toBe(JournalStatus.VOID);
      expect(voided.voidedBy).toBe("admin-super");
      expect(voided.voidReason).toBe("Koreksi billing pasien");

      // Voided journals are excluded from active GL queries
      const gl = await accountingRepo.getLedgerEntries({ branchId: "branch-gebang" });
      const voidedInGL = gl.find((e) => e.journalId === journal.id);
      expect(voidedInGL).toBeUndefined();
    });
  });
});
