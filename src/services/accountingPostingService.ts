import {
  AccountingRepository,
  InvoiceRepository,
  PaymentRepository,
  CompensationRepository,
  PayrollRepository,
  TreatmentRepository,
  DoctorRepository
} from "../repositories/interfaces";
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
  ChartOfAccount,
  JournalEntry,
  JournalSourceType,
  JournalStatus,
  AccountCategory,
  AccountType,
  InvoiceStatus,
  PaymentMethod,
  PayrollStatus,
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

  constructor(deps: AccountingPostingServiceDeps = {}) {
    this.accountingRepo = deps.accountingRepo || new MockAccountingRepository();
    this.invoiceRepo = deps.invoiceRepo || new MockInvoiceRepository();
    this.paymentRepo = deps.paymentRepo || new MockPaymentRepository();
    this.compRepo = deps.compRepo || new MockCompensationRepository();
    this.payrollRepo = deps.payrollRepo || new MockPayrollRepository();
    this.treatmentRepo = deps.treatmentRepo || new MockTreatmentRepository();
    this.doctorRepo = deps.doctorRepo || new MockDoctorRepository();
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
    if (existing && existing.status !== JournalStatus.VOID) {
      return existing;
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
    const description = `Pengakuan Pendapatan Invoice #${invoice.id} - Net: Rp ${netAmount.toLocaleString("id-ID")}`;

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
            description: `Piutang Pasien atas Invoice #${invoice.id}`
          },
          {
            accountId: revAccount.id,
            debit: 0,
            credit: netAmount,
            branchId: invoice.branchId,
            description: `Pendapatan Jasa Medis atas Invoice #${invoice.id}`
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
    if (existing && existing.status !== JournalStatus.VOID) {
      return existing;
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
    const description = `Penerimaan Pembayaran ${payment.paymentMethod} #${payment.id} - Invoice #${payment.invoiceId} (Rp ${payment.amount.toLocaleString("id-ID")})`;

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
            description: `Penerimaan ${debitAccount.name} atas Invoice #${payment.invoiceId}`
          },
          {
            accountId: arAccount.id,
            debit: 0,
            credit: payment.amount,
            branchId: invoice.branchId,
            description: `Pelunasan Piutang Pasien Invoice #${payment.invoiceId}`
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
    const existing = await this.accountingRepo.findBySource(
      JournalSourceType.COMPENSATION,
      accrual.id
    );
    if (existing && existing.status !== JournalStatus.VOID) {
      return existing;
    }

    if (accrual.amount <= 0) {
      throw new Error(
        `Nominal kompensasi akrual (Rp ${accrual.amount}) harus lebih dari 0`
      );
    }

    // Resolve Branch:
    // Lookup source TreatmentJob if available
    let branchId = "branch-gebang";
    if (accrual.sourceId) {
      const treatment = await this.treatmentRepo.getTreatmentJobById(
        accrual.sourceId
      );
      if (treatment) {
        branchId = treatment.branchId;
      }
    }

    // If still not resolved, check doctor assigned branch
    if (!branchId || branchId === "branch-gebang") {
      const doctor = await this.doctorRepo.getDoctorById(accrual.staffId);
      if (doctor?.assignedBranchId) {
        branchId = doctor.assignedBranchId;
      }
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

    // Determine Doctor vs Assistant fee accounts
    const isDoctor = accrual.staffId.startsWith("doctor-") || (await this.doctorRepo.getDoctorById(accrual.staffId)) !== null;

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

    // Idempotency check
    const existing = await this.accountingRepo.findBySource(
      JournalSourceType.PAYROLL,
      payroll.id
    );
    if (existing && existing.status !== JournalStatus.VOID) {
      return existing;
    }

    // Resolve branch
    let branchId = "branch-gebang";
    const doctor = await this.doctorRepo.getDoctorById(payroll.staffId);
    if (doctor?.assignedBranchId) {
      branchId = doctor.assignedBranchId;
    }

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
    const totalComp = Math.round(Number(payroll.totalCompensation) || 0);

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
}
