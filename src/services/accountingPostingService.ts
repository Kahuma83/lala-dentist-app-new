import {
  AccountingRepository,
  InvoiceRepository,
  PaymentRepository,
  CompensationRepository,
  PayrollRepository,
  TreatmentRepository,
  DoctorRepository,
  StaffRepository
} from "../repositories/interfaces";
import {
  MockAccountingRepository,
  MockInvoiceRepository,
  MockPaymentRepository,
  MockCompensationRepository,
  MockPayrollRepository,
  MockTreatmentRepository,
  MockDoctorRepository,
  MockStaffRepository
} from "../repositories/mockRepositories";
import {
  ChartOfAccount,
  JournalEntry,
  JournalSourceType,
  JournalStatus,
  AccountCategory,
  AccountType,
  InvoiceStatus,
  PaymentMethod,
  PayrollStatus,
  RecurringExpenseType,
  UserRole
} from "../types/domain";
import { AppClock } from "../utils/clock";

export type StandardAccountKey =
  | "AR_PATIENT"
  | "CASH"
  | "BANK"
  | "QRIS_CLEARING"
  | "TREATMENT_REVENUE"
  | "OTHER_REVENUE"
  | "SALARY_EXPENSE"
  | "SALARY_PAYABLE"
  | "INCENTIVE_EXPENSE"
  | "INCENTIVE_PAYABLE"
  | "DOCTOR_FEE_EXPENSE"
  | "DOCTOR_PAYABLE"
  | "TAX_PAYABLE";

/**
 * Standard COA Code & Category Resolver
 * Ensures accounts are resolved dynamically from COA configuration without hardcoded IDs,
 * and validates that the target account is active.
 */
export class AccountingAccountResolver {
  private static CODE_MAP: Record<StandardAccountKey, string[]> = {
    AR_PATIENT: ["1100"],
    CASH: ["1000"],
    BANK: ["1010", "1020"],
    QRIS_CLEARING: ["1010", "1015"],
    TREATMENT_REVENUE: ["4000"],
    OTHER_REVENUE: ["4100"],
    SALARY_EXPENSE: ["5000"],
    SALARY_PAYABLE: ["2010"],
    INCENTIVE_EXPENSE: ["5020"],
    INCENTIVE_PAYABLE: ["2030"],
    DOCTOR_FEE_EXPENSE: ["5010"],
    DOCTOR_PAYABLE: ["2020"],
    TAX_PAYABLE: ["2040"]
  };

  private static CATEGORY_MAP: Record<StandardAccountKey, AccountCategory> = {
    AR_PATIENT: AccountCategory.ACCOUNTS_RECEIVABLE,
    CASH: AccountCategory.CASH,
    BANK: AccountCategory.BANK,
    QRIS_CLEARING: AccountCategory.BANK,
    TREATMENT_REVENUE: AccountCategory.TREATMENT_REVENUE,
    OTHER_REVENUE: AccountCategory.OTHER_REVENUE,
    SALARY_EXPENSE: AccountCategory.SALARY_EXPENSE,
    SALARY_PAYABLE: AccountCategory.PAYROLL_PAYABLE,
    INCENTIVE_EXPENSE: AccountCategory.INCENTIVE_EXPENSE,
    INCENTIVE_PAYABLE: AccountCategory.INCENTIVE_PAYABLE,
    DOCTOR_FEE_EXPENSE: AccountCategory.DOCTOR_FEE_EXPENSE,
    DOCTOR_PAYABLE: AccountCategory.DOCTOR_PAYABLE,
    TAX_PAYABLE: AccountCategory.TAX_PAYABLE
  };

  static async resolveAccount(
    accountingRepo: AccountingRepository,
    key: StandardAccountKey
  ): Promise<ChartOfAccount> {
    const accounts = await accountingRepo.getAccounts();
    const candidateCodes = this.CODE_MAP[key] || [];
    const targetCategory = this.CATEGORY_MAP[key];

    // 1. Try finding by matching code first
    let account = accounts.find((a) => candidateCodes.includes(a.code));

    // 2. Fallback to finding by Account Category
    if (!account && targetCategory) {
      account = accounts.find((a) => a.accountCategory === targetCategory);
    }

    if (!account) {
      throw new Error(
        `Account ${key} tidak ditemukan dalam Bagan Akun (Chart of Accounts)`
      );
    }

    if (!account.isActive) {
      throw new Error(
        `Account ${key} (${account.code} - ${account.name}) ditemukan tetapi sedang nonaktif (inactive)`
      );
    }

    return account;
  }

  static async resolveByCode(
    accountingRepo: AccountingRepository,
    code: string
  ): Promise<ChartOfAccount> {
    const account = await accountingRepo.getAccountByCode(code);
    if (!account) {
      throw new Error(`Akun dengan kode "${code}" tidak ditemukan`);
    }
    if (!account.isActive) {
      throw new Error(
        `Akun "${code}" (${account.name}) tidak aktif (inactive)`
      );
    }
    return account;
  }
}

export interface AccountingPostingServiceDeps {
  accountingRepo?: AccountingRepository;
  invoiceRepo?: InvoiceRepository;
  paymentRepo?: PaymentRepository;
  compRepo?: CompensationRepository;
  payrollRepo?: PayrollRepository;
  treatmentRepo?: TreatmentRepository;
  doctorRepo?: DoctorRepository;
  staffRepo?: StaffRepository;
}

/**
 * Automatic Journal Posting Engine (Accounting Phase 2)
 * Orchestrates business transaction lifecycle to double-entry general ledger posting.
 */
export class AccountingPostingService {
  private accountingRepo: AccountingRepository;
  private invoiceRepo: InvoiceRepository;
  private paymentRepo: PaymentRepository;
  private compRepo: CompensationRepository;
  private payrollRepo: PayrollRepository;
  private treatmentRepo: TreatmentRepository;
  private doctorRepo: DoctorRepository;
  private staffRepo: StaffRepository;

  constructor(deps: AccountingPostingServiceDeps = {}) {
    this.accountingRepo = deps.accountingRepo || new MockAccountingRepository();
    this.invoiceRepo = deps.invoiceRepo || new MockInvoiceRepository();
    this.paymentRepo = deps.paymentRepo || new MockPaymentRepository();
    this.compRepo = deps.compRepo || new MockCompensationRepository();
    this.payrollRepo = deps.payrollRepo || new MockPayrollRepository();
    this.treatmentRepo = deps.treatmentRepo || new MockTreatmentRepository();
    this.doctorRepo = deps.doctorRepo || new MockDoctorRepository();
    this.staffRepo = deps.staffRepo || new MockStaffRepository();
  }

  private async getDoctorForStaff(staffId: string) {
    const doctorById = await this.doctorRepo.getDoctorById(staffId);
    if (doctorById?.id === staffId) {
      return doctorById;
    }
    return this.doctorRepo.getDoctorByStaffId(staffId);
  }

  private async getStaffForPayroll(staffId: string) {
    const staff = await this.staffRepo.getStaff();
    return staff.find((item) => item.id === staffId || item.userAccountId === staffId) || null;
  }

  private async resolveStaffBranch(
    staffId: string,
    preferredBranchId?: string | null
  ): Promise<string> {
    if (preferredBranchId) return preferredBranchId;
    const doctor = await this.getDoctorForStaff(staffId);
    if (doctor?.assignedBranchId) return doctor.assignedBranchId;
    const staff = await this.getStaffForPayroll(staffId);
    if (staff?.branchId) return staff.branchId;
    throw new Error(
      `Cabang untuk staff #${staffId} tidak ditemukan. Lengkapi penempatan cabang sebelum memposting jurnal.`
    );
  }

  // =========================================================================
  // 1. INVOICE REVENUE RECOGNITION JOURNAL POSTING
  // =========================================================================
  /**
   * Translates an Invoice into a Revenue Recognition Journal:
   *   Dr Piutang Pasien (AR)
   *      Cr Pendapatan Jasa Medis (Treatment Revenue)
   */
  async postInvoice(
    invoiceId: string,
    currentUserRole: UserRole = UserRole.SUPER_ADMIN,
    userBranchId: string | null = null,
    postedBy: string = "System Auto-Post"
  ): Promise<JournalEntry> {
    const invoice = await this.invoiceRepo.getInvoiceById(
      invoiceId,
      currentUserRole,
      userBranchId
    );
    if (!invoice) {
      throw new Error(`Invoice #${invoiceId} tidak ditemukan`);
    }

    // RBAC Branch Isolation check
    if (
      currentUserRole === UserRole.BRANCH_ADMIN &&
      userBranchId &&
      invoice.branchId !== userBranchId
    ) {
      throw new Error(
        "Akses ditolak: Branch Admin hanya dapat memposting invoice di cabangnya sendiri"
      );
    }

    // Status Validation: Revenue is recognized only when invoice is OPEN, PARTIALLY_PAID, or PAID
    if (
      invoice.status !== InvoiceStatus.OPEN &&
      invoice.status !== InvoiceStatus.PARTIALLY_PAID &&
      invoice.status !== InvoiceStatus.PAID
    ) {
      throw new Error(
        `Invoice #${invoiceId} belum berada pada status yang dapat diakui sebagai revenue (Status: ${invoice.status})`
      );
    }

    // Idempotency: Return existing active journal if already posted
    const existing = await this.accountingRepo.findBySource(
      JournalSourceType.INVOICE,
      invoice.id
    );
    if (existing?.status === JournalStatus.POSTED) {
      return existing;
    }
    if (existing?.status === JournalStatus.DRAFT) {
      const draft = await this.accountingRepo.getJournalById(existing.id);
      const hasBalancedLines = Boolean(
        draft
        && draft.lines.length > 0
        && draft.totalDebit > 0
        && draft.totalDebit === draft.totalCredit
      );
      if (hasBalancedLines) {
        return this.accountingRepo.postJournal(
          existing.id,
          postedBy,
          currentUserRole,
          userBranchId
        );
      }
      const deleted = await this.accountingRepo.deleteDraftJournal(
        existing.id,
        currentUserRole,
        userBranchId
      );
      if (!deleted) {
        throw new Error(`Draft jurnal ${existing.journalNumber} tidak valid dan gagal dibersihkan`);
      }
    }

    // Validate amount: Net Amount (after discount) must be > 0
    const netAmount = invoice.netAmount;
    if (netAmount <= 0) {
      throw new Error(
        `Nominal invoice net (Rp ${netAmount}) harus lebih dari 0 untuk membuat jurnal`
      );
    }

    // Resolve COA accounts
    const arAccount = await AccountingAccountResolver.resolveAccount(
      this.accountingRepo,
      "AR_PATIENT"
    );
    const revAccount = await AccountingAccountResolver.resolveAccount(
      this.accountingRepo,
      "TREATMENT_REVENUE"
    );

    const journalDate = invoice.createdAt ? invoice.createdAt.slice(0, 10) : AppClock.nowISO().slice(0, 10);
    const invoiceReference = invoice.invoiceNumber || "nomor invoice belum tersedia";
    const description = `Pengakuan Pendapatan Invoice #${invoiceReference} - Net: Rp ${netAmount.toLocaleString("id-ID")}`;

    // Create Draft Journal
    const draftJournal = await this.accountingRepo.createDraftJournal(
      {
        journalDate,
        branchId: invoice.branchId,
        description,
        sourceType: JournalSourceType.INVOICE,
        sourceId: invoice.id,
        lines: [
          {
            accountId: arAccount.id,
            debit: netAmount,
            credit: 0,
            branchId: invoice.branchId,
            description: `Piutang Pasien atas Invoice #${invoiceReference}`
          },
          {
            accountId: revAccount.id,
            debit: 0,
            credit: netAmount,
            branchId: invoice.branchId,
            description: `Pendapatan Jasa Medis atas Invoice #${invoiceReference}`
          }
        ]
      },
      postedBy,
      currentUserRole,
      userBranchId
    );

    // Post the journal to General Ledger
    const postedJournal = await this.accountingRepo.postJournal(
      draftJournal.id,
      postedBy,
      currentUserRole,
      userBranchId
    );

    return postedJournal;
  }

  // =========================================================================
  // 2. PAYMENT SETTLEMENT JOURNAL POSTING
  // =========================================================================
  /**
   * Translates a Payment into a Cash/Bank Settlement Journal:
   *   Dr Kas / Bank / QRIS Settlement
   *      Cr Piutang Pasien (AR)
   */
  async postPayment(
    paymentId: string,
    currentUserRole: UserRole = UserRole.SUPER_ADMIN,
    userBranchId: string | null = null,
    postedBy: string = "System Auto-Post"
  ): Promise<JournalEntry> {
    const allPayments = await this.paymentRepo.getPayments();
    const payment = allPayments.find((p) => p.id === paymentId);
    if (!payment) {
      throw new Error(`Transaksi pembayaran #${paymentId} tidak ditemukan`);
    }

    if (payment.status !== "SUCCESS") {
      throw new Error(
        `Pembayaran #${paymentId} tidak valid untuk diposting (Status: ${payment.status})`
      );
    }

    const invoice = await this.invoiceRepo.getInvoiceById(payment.invoiceId);
    if (!invoice) {
      throw new Error(
        `Invoice #${payment.invoiceId} terkait pembayaran #${paymentId} tidak ditemukan`
      );
    }

    // Branch Isolation
    if (
      currentUserRole === UserRole.BRANCH_ADMIN &&
      userBranchId &&
      invoice.branchId !== userBranchId
    ) {
      throw new Error(
        "Akses ditolak: Branch Admin hanya dapat memposting pembayaran invoice di cabangnya sendiri"
      );
    }

    // Idempotency: Return existing active journal if already posted
    const existing = await this.accountingRepo.findBySource(
      JournalSourceType.PAYMENT,
      payment.id
    );
    if (existing?.status === JournalStatus.POSTED) {
      return existing;
    }
    if (existing?.status === JournalStatus.DRAFT) {
      const draft = await this.accountingRepo.getJournalById(existing.id);
      const hasBalancedLines = Boolean(
        draft
        && draft.lines.length > 0
        && draft.totalDebit > 0
        && draft.totalDebit === draft.totalCredit
      );
      if (hasBalancedLines) {
        return this.accountingRepo.postJournal(
          existing.id,
          postedBy,
          currentUserRole,
          userBranchId
        );
      }
      const deleted = await this.accountingRepo.deleteDraftJournal(
        existing.id,
        currentUserRole,
        userBranchId
      );
      if (!deleted) {
        throw new Error(`Draft jurnal ${existing.journalNumber} tidak valid dan gagal dibersihkan`);
      }
    }

    if (payment.amount <= 0) {
      throw new Error(
        `Nominal pembayaran (Rp ${payment.amount}) harus lebih besar dari 0`
      );
    }

    // Resolve Debit Account based on Payment Method
    let debitAccount: ChartOfAccount;
    if (payment.paymentMethod === PaymentMethod.CASH) {
      debitAccount = await AccountingAccountResolver.resolveAccount(
        this.accountingRepo,
        "CASH"
      );
    } else if (payment.paymentMethod === PaymentMethod.QRIS) {
      debitAccount = await AccountingAccountResolver.resolveAccount(
        this.accountingRepo,
        "QRIS_CLEARING"
      );
    } else if (payment.paymentMethod === PaymentMethod.TRANSFER) {
      debitAccount = await AccountingAccountResolver.resolveAccount(
        this.accountingRepo,
        "BANK"
      );
    } else {
      // Fallback for OTHER payment method
      debitAccount = await AccountingAccountResolver.resolveAccount(
        this.accountingRepo,
        "BANK"
      );
    }

    const arAccount = await AccountingAccountResolver.resolveAccount(
      this.accountingRepo,
      "AR_PATIENT"
    );

    const journalDate = (payment.transactionDateTime || payment.createdAt || AppClock.nowISO()).slice(0, 10);
    const invoiceReference = invoice.invoiceNumber || "nomor invoice belum tersedia";
    const receiptReference = payment.receiptNumber || "nomor kwitansi belum tersedia";
    const description = `Penerimaan Pembayaran ${payment.paymentMethod} - Kwitansi #${receiptReference} - Invoice #${invoiceReference} (Rp ${payment.amount.toLocaleString("id-ID")})`;

    const draftJournal = await this.accountingRepo.createDraftJournal(
      {
        journalDate,
        branchId: invoice.branchId,
        description,
        sourceType: JournalSourceType.PAYMENT,
        sourceId: payment.id,
        lines: [
          {
            accountId: debitAccount.id,
            debit: payment.amount,
            credit: 0,
            branchId: invoice.branchId,
            description: `Penerimaan ${debitAccount.name} atas Invoice #${invoiceReference}`
          },
          {
            accountId: arAccount.id,
            debit: 0,
            credit: payment.amount,
            branchId: invoice.branchId,
            description: `Pelunasan Piutang Pasien Invoice #${invoiceReference}`
          }
        ]
      },
      postedBy,
      currentUserRole,
      userBranchId
    );

    const postedJournal = await this.accountingRepo.postJournal(
      draftJournal.id,
      postedBy,
      currentUserRole,
      userBranchId
    );

    return postedJournal;
  }

  // =========================================================================
  // 3. COMPENSATION ACCRUAL JOURNAL POSTING
  // =========================================================================
  /**
   * Translates a Compensation Accrual into an Expense/Liability Journal:
   *   Dr Beban Insentif / Beban Bagi Hasil Dokter
   *      Cr Hutang Insentif / Hutang Jasa Dokter
   */
  async postCompensation(
    compensationId: string,
    currentUserRole: UserRole = UserRole.SUPER_ADMIN,
    userBranchId: string | null = null,
    postedBy: string = "System Auto-Post"
  ): Promise<JournalEntry> {
    const accruals = await this.compRepo.getCompensationAccruals();
    const accrual = accruals.find((a) => a.id === compensationId);
    if (!accrual) {
      throw new Error(
        `Kompensasi akrual #${compensationId} tidak ditemukan`
      );
    }

    // Idempotency: Return existing journal if already posted
    const existingJournals = await this.accountingRepo.getJournalsBySource(
      JournalSourceType.COMPENSATION,
      accrual.id
    );
    const existing = existingJournals.find(
      (journal) => journal.status !== JournalStatus.VOID
    );
    if (existing) {
      return existing;
    }

    if (accrual.amount <= 0) {
      throw new Error(
        `Nominal kompensasi akrual (Rp ${accrual.amount}) harus lebih dari 0`
      );
    }

    const accrualPeriod = accrual.accruedAt?.slice(0, 7).match(/^(\d{4})-(\d{2})$/);
    const accrualYear = accrualPeriod ? Number(accrualPeriod[1]) : NaN;
    const accrualMonth = accrualPeriod ? Number(accrualPeriod[2]) : NaN;
    const payrolls = Number.isInteger(accrualYear) &&
      Number.isInteger(accrualMonth) &&
      accrualMonth >= 1 &&
      accrualMonth <= 12
      ? await this.payrollRepo.getPayrolls(accrualMonth, accrualYear)
      : await this.payrollRepo.getPayrolls();
    const payrollItems = await Promise.all(
      payrolls.map((payroll) => this.payrollRepo.getPayrollItems(payroll.id))
    );
    if (payrollItems.some((items) => items.some((item) => item.sourceId === accrual.id))) {
      throw new Error(
        `Kompensasi akrual #${accrual.id} sudah masuk payroll dan hanya boleh dijurnal melalui payroll`
      );
    }

    let treatmentBranchId: string | null = null;
    if (accrual.sourceId) {
      const treatment = await this.treatmentRepo.getTreatmentJobById(
        accrual.sourceId
      );
      if (treatment) {
        treatmentBranchId = treatment.branchId;
      }
    }
    const doctor = await this.getDoctorForStaff(accrual.staffId);
    const branchId = treatmentBranchId ||
      doctor?.assignedBranchId ||
      (await this.getStaffForPayroll(accrual.staffId))?.branchId ||
      "";
    if (!branchId) {
      throw new Error(
        `Cabang untuk akrual kompensasi staff #${accrual.staffId} tidak ditemukan. Lengkapi penempatan cabang sebelum memposting jurnal.`
      );
    }

    if (
      currentUserRole === UserRole.BRANCH_ADMIN &&
      userBranchId &&
      branchId !== userBranchId
    ) {
      throw new Error(
        "Akses ditolak: Branch Admin hanya dapat memposting kompensasi di cabangnya sendiri"
      );
    }

    const isDoctor = doctor !== null;

    let expenseKey: StandardAccountKey = isDoctor
      ? "DOCTOR_FEE_EXPENSE"
      : "INCENTIVE_EXPENSE";
    let payableKey: StandardAccountKey = isDoctor
      ? "DOCTOR_PAYABLE"
      : "INCENTIVE_PAYABLE";

    const expenseAccount = await AccountingAccountResolver.resolveAccount(
      this.accountingRepo,
      expenseKey
    );
    const payableAccount = await AccountingAccountResolver.resolveAccount(
      this.accountingRepo,
      payableKey
    );

    const journalDate = (accrual.accruedAt || AppClock.nowISO()).slice(0, 10);
    const description = `Akrual Kompensasi Staff #${accrual.staffId} (Ref: ${accrual.sourceId}) - Rp ${accrual.amount.toLocaleString("id-ID")}`;

    const draftJournal = await this.accountingRepo.createDraftJournal(
      {
        journalDate,
        branchId,
        description,
        sourceType: JournalSourceType.COMPENSATION,
        sourceId: accrual.id,
        lines: [
          {
            accountId: expenseAccount.id,
            debit: accrual.amount,
            credit: 0,
            branchId,
            description: `Beban ${expenseAccount.name} #${accrual.staffId}`
          },
          {
            accountId: payableAccount.id,
            debit: 0,
            credit: accrual.amount,
            branchId,
            description: `Hutang ${payableAccount.name} #${accrual.staffId}`
          }
        ]
      },
      postedBy,
      currentUserRole,
      userBranchId
    );

    const postedJournal = await this.accountingRepo.postJournal(
      draftJournal.id,
      postedBy,
      currentUserRole,
      userBranchId
    );

    return postedJournal;
  }

  // =========================================================================
  // 4. MONTHLY PAYROLL ACCRUAL JOURNAL POSTING
  // =========================================================================
  /**
   * Translates an Approved/Paid Monthly Payroll into an Accrual Journal:
   *   Dr Beban Gaji (Salary Expense)
   *   Dr Beban Insentif (Incentive Expense - if any)
   *      Cr Hutang Gaji Staff (Payroll Payable)
   *      Cr Hutang Insentif Staff (Incentive Payable - if any)
   */
  async postPayroll(
    payrollId: string,
    currentUserRole: UserRole = UserRole.SUPER_ADMIN,
    userBranchId: string | null = null,
    postedBy: string = "System Auto-Post"
  ): Promise<JournalEntry> {
    const payroll = await this.payrollRepo.getPayrollById(payrollId);
    if (!payroll) {
      throw new Error(`Payroll #${payrollId} tidak ditemukan`);
    }

    // Status Validation: Must be APPROVED or PAID
    if (
      payroll.status !== PayrollStatus.APPROVED &&
      payroll.status !== PayrollStatus.PAID
    ) {
      throw new Error(
        `Payroll #${payrollId} belum berada pada status yang dapat diakui sebagai beban/liabilitas (Status: ${payroll.status})`
      );
    }

    // Keep the accrual and payment events independently idempotent.
    const sourceJournals = await this.accountingRepo.getJournalsBySource(
      JournalSourceType.PAYROLL,
      payroll.id
    );
    const existing = sourceJournals.find((journal) =>
      journal.status !== JournalStatus.VOID &&
      (journal.event === "ACCRUAL" ||
        (!journal.event && /akrual|accrual/i.test(journal.description) &&
          !/pembayaran|payment/i.test(journal.description)))
    );
    if (existing) {
      return existing.status === JournalStatus.POSTED
        ? existing
        : this.accountingRepo.postJournal(
          existing.id,
          postedBy,
          currentUserRole,
          userBranchId
        );
    }

    const branchId = await this.resolveStaffBranch(payroll.staffId, payroll.branchId);

    if (
      currentUserRole === UserRole.BRANCH_ADMIN &&
      userBranchId &&
      branchId !== userBranchId
    ) {
      throw new Error(
        "Akses ditolak: Branch Admin hanya dapat memposting payroll di cabangnya sendiri"
      );
    }

    // Resolve accounts
    const salaryExpenseAcc = await AccountingAccountResolver.resolveAccount(
      this.accountingRepo,
      "SALARY_EXPENSE"
    );
    const salaryPayableAcc = await AccountingAccountResolver.resolveAccount(
      this.accountingRepo,
      "SALARY_PAYABLE"
    );

    const lines: Array<{
      accountId: string;
      debit: number;
      credit: number;
      branchId: string;
      description?: string;
    }> = [];

    const baseSalary = Math.round(Number(payroll.baseSalary) || 0);
    const payrollItems = await this.payrollRepo.getPayrollItems(payrollId);
    const compensationSourceIds = Array.from(
      new Set(
        payrollItems
          .filter((item) => item.type === "EARNING")
          .map((item) => item.sourceId)
          .filter((sourceId): sourceId is string => Boolean(sourceId))
      )
    );
    const linkedCompensationJournals = await Promise.all(
      compensationSourceIds.map(async (sourceId) => {
        const journals = await this.accountingRepo.getJournalsBySource(
          JournalSourceType.COMPENSATION,
          sourceId
        );
        return journals.some((journal) => journal.status !== JournalStatus.VOID)
          ? sourceId
          : null;
      })
    );
    const alreadyPostedCompensationIds = new Set(
      linkedCompensationJournals.filter((sourceId): sourceId is string => sourceId !== null)
    );
    const unpostedPayrollItems = payrollItems.filter(
      (item) => item.type !== "EARNING" ||
        !item.sourceId ||
        !alreadyPostedCompensationIds.has(item.sourceId)
    );
    const itemCompensation = unpostedPayrollItems
      .filter((item) =>
        item.type === "EARNING" &&
        !/gaji pokok|base salary/i.test(item.descriptionSnapshot)
      )
      .reduce((sum, item) => sum + Math.round(Number(item.amountSnapshot) || 0), 0);
    const totalComp = payrollItems.length > 0
      ? itemCompensation
      : Math.round(Number(payroll.totalCompensation) || 0);

    if (baseSalary <= 0 && totalComp <= 0) {
      throw new Error(
        `Total gaji dan kompensasi payroll #${payrollId} bernilai 0`
      );
    }

    // Base salary component
    if (baseSalary > 0) {
      lines.push({
        accountId: salaryExpenseAcc.id,
        debit: baseSalary,
        credit: 0,
        branchId,
        description: `Beban Gaji Pokok Staff #${payroll.staffId} Periode ${payroll.month}/${payroll.year}`
      });
      lines.push({
        accountId: salaryPayableAcc.id,
        debit: 0,
        credit: baseSalary,
        branchId,
        description: `Hutang Gaji Pokok Staff #${payroll.staffId} Periode ${payroll.month}/${payroll.year}`
      });
    }

    // Compensation/Incentive component
    if (totalComp > 0) {
      const incentiveExpenseAcc = await AccountingAccountResolver.resolveAccount(
        this.accountingRepo,
        "INCENTIVE_EXPENSE"
      );
      const incentivePayableAcc = await AccountingAccountResolver.resolveAccount(
        this.accountingRepo,
        "INCENTIVE_PAYABLE"
      );

      lines.push({
        accountId: incentiveExpenseAcc.id,
        debit: totalComp,
        credit: 0,
        branchId,
        description: `Beban Insentif Kinerja Staff #${payroll.staffId} Periode ${payroll.month}/${payroll.year}`
      });
      lines.push({
        accountId: incentivePayableAcc.id,
        debit: 0,
        credit: totalComp,
        branchId,
        description: `Hutang Insentif Staff #${payroll.staffId} Periode ${payroll.month}/${payroll.year}`
      });
    }

    const journalDate = `${payroll.year}-${String(payroll.month).padStart(2, "0")}-28`;
    const description = `Akrual Gaji & Kompensasi Periode ${payroll.month}/${payroll.year} - Staff #${payroll.staffId} (Total: Rp ${payroll.netSalary.toLocaleString("id-ID")})`;

    const draftJournal = await this.accountingRepo.createDraftJournal(
      {
        journalDate,
        branchId,
        description,
        sourceType: JournalSourceType.PAYROLL,
        sourceId: payroll.id,
        event: "ACCRUAL",
        lines
      },
      postedBy,
      currentUserRole,
      userBranchId
    );

    const postedJournal = await this.accountingRepo.postJournal(
      draftJournal.id,
      postedBy,
      currentUserRole,
      userBranchId
    );

    return postedJournal;
  }

  async postPayrollPayment(
    payrollId: string,
    currentUserRole: UserRole = UserRole.SUPER_ADMIN,
    userBranchId: string | null = null,
    postedBy: string = "System Auto-Post"
  ): Promise<JournalEntry> {
    const payroll = await this.payrollRepo.getPayrollById(payrollId);
    if (!payroll) {
      throw new Error(`Payroll #${payrollId} tidak ditemukan`);
    }
    if (
      payroll.status !== PayrollStatus.APPROVED &&
      payroll.status !== PayrollStatus.PAID
    ) {
      throw new Error(
        `Payroll #${payrollId} harus berstatus APPROVED sebelum pembayaran dapat dijurnal`
      );
    }

    let sourceJournals = await this.accountingRepo.getJournalsBySource(
      JournalSourceType.PAYROLL,
      payroll.id
    );
    const existingPayment = sourceJournals.find((journal) =>
      journal.status !== JournalStatus.VOID &&
      (journal.event === "PAYMENT" ||
        (!journal.event && /pembayaran|payment/i.test(journal.description)))
    );
    if (existingPayment) {
      return existingPayment.status === JournalStatus.POSTED
        ? existingPayment
        : this.accountingRepo.postJournal(
          existingPayment.id,
          postedBy,
          currentUserRole,
          userBranchId
        );
    }

    await this.postPayroll(payrollId, currentUserRole, userBranchId, postedBy);
    sourceJournals = await this.accountingRepo.getJournalsBySource(
      JournalSourceType.PAYROLL,
      payroll.id
    );

    const payrollItems = await this.payrollRepo.getPayrollItems(payrollId);
    const accrualJournalIds = sourceJournals
      .filter((journal) =>
        journal.status !== JournalStatus.VOID &&
        (journal.event === "ACCRUAL" ||
          (!journal.event && /akrual|accrual/i.test(journal.description) &&
            !/pembayaran|payment/i.test(journal.description)))
      )
      .map((journal) => journal.id);
    const linkedCompensationJournals = await Promise.all(
      Array.from(new Set(
        payrollItems
          .filter((item) => item.type === "EARNING")
          .map((item) => item.sourceId)
          .filter((sourceId): sourceId is string => Boolean(sourceId))
      )).map(async (sourceId) => {
        const journals = await this.accountingRepo.getJournalsBySource(
          JournalSourceType.COMPENSATION,
          sourceId
        );
        return journals.filter((journal) => journal.status !== JournalStatus.VOID);
      })
    );
    const settlementJournalIds = Array.from(new Set([
      ...accrualJournalIds,
      ...linkedCompensationJournals.flat().map((journal) => journal.id)
    ]));
    const settlementJournals = await Promise.all(
      settlementJournalIds.map((journalId) => this.accountingRepo.getJournalById(journalId))
    );
    const liabilityTotals = new Map<string, number>();
    let grossLiability = 0;
    for (const journal of settlementJournals) {
      if (!journal || journal.status !== JournalStatus.POSTED) {
        throw new Error(
          `Jurnal akrual payroll belum terposting sempurna; pembayaran payroll #${payrollId} ditunda`
        );
      }
      for (const line of journal.lines) {
        if (line.credit <= 0) continue;
        liabilityTotals.set(
          line.accountId,
          (liabilityTotals.get(line.accountId) || 0) + line.credit
        );
        grossLiability += line.credit;
      }
    }

    const deductions = payrollItems.filter((item) => item.type === "DEDUCTION");
    const deductionTotal = Math.round(Number(payroll.totalDeductions) || 0);
    const itemDeductionTotal = deductions.reduce(
      (sum, item) => sum + Math.round(Number(item.amountSnapshot) || 0),
      0
    );
    if (deductions.some((item) => Number(item.amountSnapshot) < 0) ||
      itemDeductionTotal !== deductionTotal) {
      throw new Error(
        `Rincian potongan payroll #${payrollId} tidak sesuai dengan total potongan (rincian Rp ${itemDeductionTotal.toLocaleString("id-ID")}, total Rp ${deductionTotal.toLocaleString("id-ID")}); jurnal pembayaran tidak dibuat`
      );
    }

    const netSalary = Math.round(Number(payroll.netSalary) || 0);
    if (
      grossLiability <= 0 ||
      netSalary < 0 ||
      deductionTotal < 0 ||
      grossLiability !== netSalary + deductionTotal
    ) {
      throw new Error(
        `Nilai akrual, potongan, dan gaji bersih payroll #${payrollId} tidak seimbang; jurnal pembayaran tidak dibuat`
      );
    }

    const branchId = await this.resolveStaffBranch(payroll.staffId, payroll.branchId);
    if (
      currentUserRole === UserRole.BRANCH_ADMIN &&
      userBranchId &&
      branchId !== userBranchId
    ) {
      throw new Error(
        "Akses ditolak: Branch Admin hanya dapat memposting pembayaran payroll di cabangnya sendiri"
      );
    }

    const paymentLines: Array<{
      accountId: string;
      debit: number;
      credit: number;
      branchId: string;
      description?: string;
    }> = [];
    for (const [accountId, amount] of liabilityTotals) {
      if (amount <= 0) continue;
      paymentLines.push({
        accountId,
        debit: amount,
        credit: 0,
        branchId,
        description: `Pelunasan utang payroll #${payrollId}`
      });
    }

    for (const item of deductions) {
      const amount = Math.round(Number(item.amountSnapshot) || 0);
      if (amount <= 0) continue;
      const description = item.descriptionSnapshot.toLowerCase();
      let accountKey: StandardAccountKey;
      if (/pajak|tax|pph|bpjs/.test(description)) {
        accountKey = "TAX_PAYABLE";
      } else if (/kasbon|pinjaman|piutang|advance/.test(description)) {
        accountKey = "AR_PATIENT";
      } else if (/absen|ketidakhadiran|alpa|terlambat|late/.test(description)) {
        accountKey = "SALARY_EXPENSE";
      } else if (/lembur|overtime|insentif|komisi|bagi hasil/.test(description)) {
        accountKey = "INCENTIVE_EXPENSE";
      } else {
        throw new Error(
          `Akun untuk potongan "${item.descriptionSnapshot}" belum dapat ditentukan; jurnal pembayaran payroll tidak dibuat`
        );
      }
      const deductionAccount = await AccountingAccountResolver.resolveAccount(
        this.accountingRepo,
        accountKey
      );
      paymentLines.push({
        accountId: deductionAccount.id,
        debit: 0,
        credit: amount,
        branchId,
        description: `Potongan payroll: ${item.descriptionSnapshot}`
      });
    }

    if (netSalary > 0) {
      const bankAccount = await AccountingAccountResolver.resolveAccount(
        this.accountingRepo,
        "BANK"
      );
      paymentLines.push({
        accountId: bankAccount.id,
        debit: 0,
        credit: netSalary,
        branchId,
        description: `Pembayaran bersih payroll #${payrollId}`
      });
    }

    const draftJournal = await this.accountingRepo.createDraftJournal(
      {
        journalDate: AppClock.nowISO().slice(0, 10),
        branchId,
        description: `Pembayaran Payroll Bersih Periode ${payroll.month}/${payroll.year} - Staff #${payroll.staffId}`,
        sourceType: JournalSourceType.PAYROLL,
        sourceId: payroll.id,
        event: "PAYMENT",
        lines: paymentLines
      },
      postedBy,
      currentUserRole,
      userBranchId
    );
    return this.accountingRepo.postJournal(
      draftJournal.id,
      postedBy,
      currentUserRole,
      userBranchId
    );
  }

  async postExternalDoctorPayrollPayment(
    entry: {
      id: string;
      doctorName: string;
      branchId: string;
      month: number;
      year: number;
      amount: number;
    },
    currentUserRole: UserRole = UserRole.SUPER_ADMIN,
    userBranchId: string | null = null,
    postedBy: string = "System Auto-Post"
  ): Promise<JournalEntry> {
    if (currentUserRole !== UserRole.SUPER_ADMIN) {
      throw new Error("Hanya Super Admin yang dapat memposting honor dokter eksternal.");
    }
    const amount = Math.round(Number(entry.amount));
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("Nominal honor dokter eksternal harus lebih dari nol.");
    }
    if (!entry.branchId || !Number.isInteger(entry.month) || !Number.isInteger(entry.year)) {
      throw new Error("Periode atau cabang honor dokter eksternal tidak valid.");
    }

    const sourceJournals = await this.accountingRepo.getJournalsBySource(
      JournalSourceType.PAYROLL,
      entry.id
    );
    const existingPayment = sourceJournals.find((journal) =>
      journal.status !== JournalStatus.VOID && journal.event === "PAYMENT"
    );
    if (existingPayment) {
      return existingPayment.status === JournalStatus.POSTED
        ? existingPayment
        : this.accountingRepo.postJournal(existingPayment.id, postedBy, currentUserRole, userBranchId);
    }

    const doctorExpense = await AccountingAccountResolver.resolveAccount(
      this.accountingRepo,
      "DOCTOR_FEE_EXPENSE"
    );
    const doctorPayable = await AccountingAccountResolver.resolveAccount(
      this.accountingRepo,
      "DOCTOR_PAYABLE"
    );
    let accrual = sourceJournals.find((journal) =>
      journal.status !== JournalStatus.VOID && journal.event === "ACCRUAL"
    );
    if (!accrual) {
      const draftAccrual = await this.accountingRepo.createDraftJournal(
        {
          journalDate: `${entry.year}-${String(entry.month).padStart(2, "0")}-28`,
          branchId: entry.branchId,
          description: `Akrual Honor Dokter Eksternal ${entry.doctorName} Periode ${entry.month}/${entry.year}`,
          sourceType: JournalSourceType.PAYROLL,
          sourceId: entry.id,
          event: "ACCRUAL",
          lines: [
            {
              accountId: doctorExpense.id,
              debit: amount,
              credit: 0,
              branchId: entry.branchId,
              description: `Honor dokter eksternal ${entry.doctorName}`
            },
            {
              accountId: doctorPayable.id,
              debit: 0,
              credit: amount,
              branchId: entry.branchId,
              description: `Utang honor dokter eksternal ${entry.doctorName}`
            }
          ]
        },
        postedBy,
        currentUserRole,
        userBranchId
      );
      accrual = await this.accountingRepo.postJournal(
        draftAccrual.id,
        postedBy,
        currentUserRole,
        userBranchId
      );
    } else if (accrual.status !== JournalStatus.POSTED) {
      accrual = await this.accountingRepo.postJournal(
        accrual.id,
        postedBy,
        currentUserRole,
        userBranchId
      );
    }

    const bank = await AccountingAccountResolver.resolveAccount(this.accountingRepo, "BANK");
    const draftPayment = await this.accountingRepo.createDraftJournal(
      {
        journalDate: AppClock.nowISO().slice(0, 10),
        branchId: entry.branchId,
        description: `Pembayaran Honor Dokter Eksternal ${entry.doctorName} Periode ${entry.month}/${entry.year}`,
        sourceType: JournalSourceType.PAYROLL,
        sourceId: entry.id,
        event: "PAYMENT",
        lines: [
          {
            accountId: doctorPayable.id,
            debit: amount,
            credit: 0,
            branchId: entry.branchId,
            description: `Pelunasan honor dokter eksternal ${entry.doctorName}`
          },
          {
            accountId: bank.id,
            debit: 0,
            credit: amount,
            branchId: entry.branchId,
            description: `Transfer honor dokter eksternal ${entry.doctorName}`
          }
        ]
      },
      postedBy,
      currentUserRole,
      userBranchId
    );
    return this.accountingRepo.postJournal(
      draftPayment.id,
      postedBy,
      currentUserRole,
      userBranchId
    );
  }

  // =========================================================================
  // HELPER & SYNCHRONIZATION ALIASES
  // =========================================================================
  async getPostingStatus(
    sourceType: JournalSourceType,
    sourceId: string
  ): Promise<{ isPosted: boolean; journal?: JournalEntry | null }> {
    const journal = await this.accountingRepo.findBySource(
      sourceType,
      sourceId
    );
    return {
      isPosted: !!journal && journal.status === JournalStatus.POSTED,
      journal: journal || null
    };
  }

  async syncInvoiceAccounting(
    invoiceId: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null,
    postedBy?: string
  ): Promise<JournalEntry> {
    return this.postInvoice(invoiceId, currentUserRole, userBranchId, postedBy);
  }

  async syncPaymentAccounting(
    paymentId: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null,
    postedBy?: string
  ): Promise<JournalEntry> {
    return this.postPayment(paymentId, currentUserRole, userBranchId, postedBy);
  }

  async syncCompensationAccounting(
    compensationId: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null,
    postedBy?: string
  ): Promise<JournalEntry> {
    return this.postCompensation(
      compensationId,
      currentUserRole,
      userBranchId,
      postedBy
    );
  }

  async syncPayrollAccounting(
    payrollId: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null,
    postedBy?: string
  ): Promise<JournalEntry> {
    return this.postPayroll(payrollId, currentUserRole, userBranchId, postedBy);
  }

  /**
   * Translates and posts a Branch Operational Expense into an Accounting Journal:
   *   Dr [Expense Account (e.g. Listrik / Beban Lainnya)]
   *      Cr [Payment Account (e.g. Kas / Bank)]
   *
   * Enforces:
   * - Balanced journal
   * - Branch scoped
   * - Branch Admin isolation
   * - Source type EXPENSE
   * - Posted to General Ledger immediately
   */
  async postBranchExpense(
    input: {
      branchId: string;
      expenseAccountId: string;
      paymentAccountId: string;
      amount: number;
      date: string;
      description: string;
      referenceNumber?: string;
    },
    currentUserRole: UserRole = UserRole.SUPER_ADMIN,
    userBranchId: string | null = null,
    postedBy: string = "Staff Admin"
  ): Promise<JournalEntry> {
    if (
      currentUserRole === UserRole.BRANCH_ADMIN &&
      userBranchId &&
      input.branchId !== userBranchId
    ) {
      throw new Error(
        "Akses ditolak: Branch Admin hanya dapat mencatat pengeluaran di cabangnya sendiri"
      );
    }

    if (input.amount <= 0) {
      throw new Error("Nominal pengeluaran harus lebih besar dari 0");
    }

    const expenseAccount = await this.accountingRepo.getAccountById(input.expenseAccountId);
    if (!expenseAccount || !expenseAccount.isActive) {
      throw new Error("Akun beban/pengeluaran tidak valid atau nonaktif");
    }
    if (expenseAccount.accountType !== AccountType.EXPENSE) {
      throw new Error("Akun pengeluaran harus bertipe EXPENSE (Beban)");
    }

    const paymentAccount = await this.accountingRepo.getAccountById(input.paymentAccountId);
    if (!paymentAccount || !paymentAccount.isActive) {
      throw new Error("Akun kas/bank pembayaran tidak valid atau nonaktif");
    }
    if (paymentAccount.accountType !== AccountType.ASSET) {
      throw new Error("Akun pembayaran harus bertipe ASSET (Kas / Bank)");
    }

    const expenseId = input.referenceNumber || `EXP-${Date.now()}`;
    const journalDate = input.date || AppClock.nowISO().slice(0, 10);
    const journalDesc = `Pengeluaran Cabang: ${input.description} [${expenseAccount.name}]`;

    // Create Draft Journal
    const draftJournal = await this.accountingRepo.createDraftJournal(
      {
        journalDate,
        branchId: input.branchId,
        description: journalDesc,
        sourceType: JournalSourceType.EXPENSE,
        sourceId: expenseId,
        lines: [
          {
            accountId: expenseAccount.id,
            debit: input.amount,
            credit: 0,
            branchId: input.branchId,
            description: input.description || `Beban ${expenseAccount.name}`
          },
          {
            accountId: paymentAccount.id,
            debit: 0,
            credit: input.amount,
            branchId: input.branchId,
            description: `Pembayaran via ${paymentAccount.name}`
          }
        ]
      },
      postedBy,
      currentUserRole,
      userBranchId
    );

    // Post the journal to General Ledger
    const postedJournal = await this.accountingRepo.postJournal(
      draftJournal.id,
      postedBy,
      currentUserRole,
      userBranchId
    );

    return postedJournal;
  }

  async postRecurringExpenseSettlement(
    input: {
      planId: string;
      expenseType: RecurringExpenseType;
      branchId: string;
      paymentAccountId: string;
      amount: number;
      date: string;
      referenceNumber?: string;
    },
    currentUserRole: UserRole = UserRole.SUPER_ADMIN,
    userBranchId: string | null = null,
    postedBy = "Staff Admin"
  ): Promise<JournalEntry> {
    if (currentUserRole === UserRole.BRANCH_ADMIN && userBranchId && input.branchId !== userBranchId) {
      throw new Error("Akses ditolak: Branch Admin hanya dapat membayar kewajiban cabangnya sendiri");
    }
    if (!Number.isInteger(input.amount) || input.amount <= 0) {
      throw new Error("Nominal pembayaran harus berupa bilangan rupiah positif");
    }
    const plan = (await this.accountingRepo.getRecurringExpensePlans(input.branchId))
      .find((item) => item.id === input.planId);
    if (!plan || plan.branchId !== input.branchId || plan.expenseType !== input.expenseType) {
      throw new Error("Rencana akrual tidak ditemukan untuk cabang dan jenis kewajiban ini");
    }

    const liabilityCode = input.expenseType === "RENT" ? "2050" : "2060";
    const liabilityAccount = await this.accountingRepo.getAccountByCode(liabilityCode);
    if (!liabilityAccount?.isActive || liabilityAccount.accountType !== AccountType.LIABILITY) {
      throw new Error(`Akun kewajiban ${liabilityCode} tidak ditemukan atau tidak aktif`);
    }
    const paymentAccount = await this.accountingRepo.getAccountById(input.paymentAccountId);
    if (
      !paymentAccount?.isActive
      || paymentAccount.accountType !== AccountType.ASSET
      || ![AccountCategory.CASH, AccountCategory.BANK].includes(paymentAccount.accountCategory)
    ) {
      throw new Error("Akun pembayaran harus berupa akun kas/bank aktif");
    }

    const balance = await this.accountingRepo.getAccountBalance(
      liabilityAccount.id,
      input.branchId,
      undefined,
      currentUserRole,
      userBranchId
    );
    if (input.amount > Math.max(0, balance.balance)) {
      throw new Error(`Pembayaran melebihi akrual yang tersedia (Rp ${Math.max(0, balance.balance).toLocaleString("id-ID")})`);
    }

    const expenseLabel = input.expenseType === "RENT" ? "sewa gedung" : "THR";
    const sourceId = `RECURRING_SETTLEMENT:${input.planId}:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const draft = await this.accountingRepo.createDraftJournal(
      {
        journalDate: input.date || AppClock.nowISO().slice(0, 10),
        branchId: input.branchId,
        description: `Pembayaran akrual ${expenseLabel}${input.referenceNumber ? ` - ${input.referenceNumber}` : ""}`,
        sourceType: JournalSourceType.EXPENSE,
        sourceId,
        event: "PAYMENT",
        lines: [
          {
            accountId: liabilityAccount.id,
            debit: input.amount,
            credit: 0,
            branchId: input.branchId,
            description: `Pembayaran kewajiban ${expenseLabel}`
          },
          {
            accountId: paymentAccount.id,
            debit: 0,
            credit: input.amount,
            branchId: input.branchId,
            description: `Pembayaran melalui ${paymentAccount.name}`
          }
        ]
      },
      postedBy,
      currentUserRole,
      userBranchId
    );
    return this.accountingRepo.postJournal(draft.id, postedBy, currentUserRole, userBranchId);
  }
}
