/**
 * LALA DENTIST WEB ADMIN - DOMAIN TYPES
 * Consistent with Lala Dentist Android Domain Models
 */

// ==========================================
// ENUMS
// ==========================================

export enum UserRole {
  SUPER_ADMIN = "SUPER_ADMIN",
  BRANCH_ADMIN = "BRANCH_ADMIN",
  DOCTOR = "DOCTOR",
  DOCTOR_ASSISTANT = "DOCTOR_ASSISTANT",
  PATIENT = "PATIENT"
}

export enum VisitType {
  BOOKING = "BOOKING",
  WALK_IN = "WALK_IN"
}

export enum VisitStatus {
  WAITING = "WAITING",
  IN_TRIAGE = "IN_TRIAGE",
  IN_TREATMENT = "IN_TREATMENT",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED"
}

export enum BookingStatus {
  PENDING = "PENDING",
  CONFIRMED = "CONFIRMED",
  CANCELLED = "CANCELLED",
  RESCHEDULED = "RESCHEDULED",
  NO_SHOW = "NO_SHOW"
}

export enum ConfirmationStatusH1 {
  BELUM_DIHUBUNGI = "BELUM_DIHUBUNGI",
  SUDAH_DIHUBUNGI = "SUDAH_DIHUBUNGI",
  DIKONFIRMASI = "DIKONFIRMASI",
  MINTA_RESCHEDULE = "MINTA_RESCHEDULE",
  BATAL = "BATAL",
  TIDAK_MERESPONS = "TIDAK_MERESPONS"
}

export enum QueueStatus {
  WAITING = "WAITING",
  IN_PREPARATION = "IN_PREPARATION",
  IN_CONSULTATION = "IN_CONSULTATION",
  COMPLETED = "COMPLETED",
  SKIPPED = "SKIPPED"
}

export enum TreatmentJobStatus {
  BELUM_DIMULAI = "BELUM_DIMULAI",
  DALAM_PROSES = "DALAM_PROSES",
  SELESAI = "SELESAI",
  DISERAHKAN = "DISERAHKAN"
}

export enum TreatmentActivityType {
  STARTED = "STARTED",
  CONTINUED = "CONTINUED",
  PROGRESS = "PROGRESS",
  COMPLETED = "COMPLETED",
  HANDED_OVER = "HANDED_OVER",
  DURATION_CHANGE = "DURATION_CHANGE",
  OTHER = "OTHER"
}

export enum IncentiveStatus {
  PENDING = "PENDING",
  ELIGIBLE = "ELIGIBLE",
  APPROVED = "APPROVED",
  PAID = "PAID"
}

export enum InvoiceStatus {
  DRAFT = "DRAFT",
  OPEN = "OPEN",
  PARTIALLY_PAID = "PARTIALLY_PAID",
  PAID = "PAID",
  CANCELLED = "CANCELLED"
}

export enum PaymentMethod {
  CASH = "CASH",
  TRANSFER = "TRANSFER",
  QRIS = "QRIS",
  OTHER = "OTHER"
}

export enum PayrollStatus {
  DRAFT = "DRAFT",
  REVIEW = "REVIEW",
  APPROVED = "APPROVED",
  PAID = "PAID"
}

export enum StaffPosition {
  DOCTOR = "DOCTOR",
  ASSISTANT = "ASSISTANT",
  BRANCH_ADMIN = "BRANCH_ADMIN",
  OB = "OB",
  OTHER = "OTHER"
}

export enum EmploymentStatus {
  ACTIVE = "ACTIVE",
  INACTIVE = "INACTIVE"
}

export enum ScheduleStatus {
  ACTIVE = "ACTIVE",
  CANCELLED = "CANCELLED"
}

export enum MedicalRecordStatus {
  DRAFT = "DRAFT",
  FINAL = "FINAL"
}

export enum AccountType {
  ASSET = "ASSET",
  LIABILITY = "LIABILITY",
  EQUITY = "EQUITY",
  REVENUE = "REVENUE",
  EXPENSE = "EXPENSE"
}

export enum NormalBalance {
  DEBIT = "DEBIT",
  CREDIT = "CREDIT"
}

export enum AccountCategory {
  // ASSET
  CASH = "CASH",
  BANK = "BANK",
  ACCOUNTS_RECEIVABLE = "ACCOUNTS_RECEIVABLE",
  INVENTORY = "INVENTORY",
  PREPAID_EXPENSE = "PREPAID_EXPENSE",
  FIXED_ASSET = "FIXED_ASSET",
  OTHER_ASSET = "OTHER_ASSET",

  // LIABILITY
  ACCOUNTS_PAYABLE = "ACCOUNTS_PAYABLE",
  PAYROLL_PAYABLE = "PAYROLL_PAYABLE",
  DOCTOR_PAYABLE = "DOCTOR_PAYABLE",
  INCENTIVE_PAYABLE = "INCENTIVE_PAYABLE",
  TAX_PAYABLE = "TAX_PAYABLE",
  OTHER_LIABILITY = "OTHER_LIABILITY",

  // EQUITY
  OWNER_CAPITAL = "OWNER_CAPITAL",
  RETAINED_EARNINGS = "RETAINED_EARNINGS",
  OTHER_EQUITY = "OTHER_EQUITY",

  // REVENUE
  TREATMENT_REVENUE = "TREATMENT_REVENUE",
  OTHER_REVENUE = "OTHER_REVENUE",

  // EXPENSE
  SALARY_EXPENSE = "SALARY_EXPENSE",
  DOCTOR_FEE_EXPENSE = "DOCTOR_FEE_EXPENSE",
  INCENTIVE_EXPENSE = "INCENTIVE_EXPENSE",
  RENT_EXPENSE = "RENT_EXPENSE",
  UTILITIES_EXPENSE = "UTILITIES_EXPENSE",
  SUPPLIES_EXPENSE = "SUPPLIES_EXPENSE",
  MARKETING_EXPENSE = "MARKETING_EXPENSE",
  OTHER_OPERATING_EXPENSE = "OTHER_OPERATING_EXPENSE"
}

export enum JournalStatus {
  DRAFT = "DRAFT",
  POSTED = "POSTED",
  VOID = "VOID"
}

export enum JournalSourceType {
  MANUAL = "MANUAL",
  INVOICE = "INVOICE",
  PAYMENT = "PAYMENT",
  COMPENSATION = "COMPENSATION",
  PAYROLL = "PAYROLL",
  EXPENSE = "EXPENSE",
  ADJUSTMENT = "ADJUSTMENT"
}

export enum AttendanceStatus {
  PRESENT = "PRESENT",
  LATE = "LATE",
  ABSENT = "ABSENT",
  SICK = "SICK",
  LEAVE = "LEAVE",
  OFF = "OFF"
}

export enum AttendanceMethod {
  MANUAL = "MANUAL",
  WEB = "WEB",
  MOBILE = "MOBILE"
}

// ==========================================
// DOMAIN ENTITIES
// ==========================================

export interface PatientProfile {
  id: string; // stable identifier
  medicalRecordNumber: string; // Nomor RM (e.g. "RM-000001")
  name: string;
  fullName?: string; // Optional alias for name
  phone: string;
  email?: string;
  dateOfBirth: string; // ISO format (YYYY-MM-DD)
  gender: "L" | "P";
  address: string;
  medicalHistoryNotes?: string;
  registeredBranchId?: string;
  createdAt: string; // ISO 8601 (e.g. 2026-09-21T14:30:00Z)
  updatedAt: string;
}

export interface DentalBranch {
  id: string;
  name: string;
  branchName?: string; // e.g. "Lala Dentist Gebang"
  branchCode?: string; // e.g. "GEB", "KMP", "AMB", "MUK", "LEN", "KEN"
  clinicName?: string; // e.g. "Lala Dentist"
  address: string;
  phone: string;
  whatsapp?: string;
  email?: string;
  operationalHours?: string; // e.g. "Senin-Sabtu: 08.00-21.00, Minggu: 08.00-17.00"
  logoUrl?: string | null;
  imageUrl?: string | null;
  isActive: boolean;
  active?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DentalDoctor {
  id: string;
  staffId?: string; // Optional link to Staff record
  doctorCode?: string; // e.g. "DOC-SYAFIRA"
  name: string; // Doctor name, e.g. "drg. Syafira"
  fullName?: string; // Alias for name
  title?: string; // e.g. "Dokter Gigi Umum", "Spesialis Orthodonti"
  specialization: string;
  phone: string;
  email?: string;
  str?: string; // Surat Tanda Registrasi
  sip?: string; // Surat Izin Praktik
  assignedBranchId?: string; // Fallback default branch
  active: boolean; // Status active flag
  isActive: boolean; // Backward compat with existing tests
  avatarUrl?: string | null; // Optional doctor portrait photo URL
  photoUrl?: string | null; // Alias for photo
  profileImage?: string | null; // Alias for profile photo
  bankName?: string; // e.g. "BCA", "Mandiri", "BRI", "BNI", "BSI"
  bankAccountNumber?: string; // e.g. "143-089-2231"
  bankAccountHolder?: string; // e.g. "drg. Syafira Al-Zahra"
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MediaUploadResult {
  url: string;
  path: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

export interface MediaStorageItem {
  id: string;
  path: string;
  url: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  folder: string;
  createdAt: string;
  updatedAt: string;
}

export interface Staff {
  id: string;
  employeeCode: string; // Unique, e.g. "EMP-001"
  fullName: string;
  phone: string;
  position: StaffPosition;
  employmentStatus: EmploymentStatus;
  joinDate: string; // YYYY-MM-DD
  active: boolean;
  notes?: string;
  branchId?: string | null; // Primary or default branch placement
  userAccountId?: string | null; // Optional link to UserAccount
  bankName?: string; // e.g. "BCA", "Mandiri", "BRI", "BNI", "BSI"
  bankAccountNumber?: string; // e.g. "143-089-2231"
  bankAccountHolder?: string; // e.g. "Claryssa Putri"
  createdAt: string;
  updatedAt: string;
}

export interface DoctorBranchAssignment {
  id: string;
  doctorId: string;
  branchId: string;
  startDate: string; // YYYY-MM-DD
  endDate?: string | null; // Optional end date
  active: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DoctorSchedule {
  id: string;
  doctorId: string;
  branchId: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm (e.g. "08:00")
  endTime: string; // HH:mm (e.g. "14:00")
  status: ScheduleStatus; // ACTIVE or CANCELLED
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkShift {
  id: string;
  branchId: string;
  name: string; // e.g. "Shift 1", "Shift 2"
  startTime: string; // HH:mm (e.g. "08:00")
  endTime: string; // HH:mm (e.g. "14:00" or "19:00" for Lengkong Mumbul Shift 2)
  active: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StaffShiftAssignment {
  id: string;
  staffId: string;
  branchId: string;
  shiftId: string;
  date: string; // YYYY-MM-DD
  active: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Attendance {
  id: string;
  staffId: string;
  branchId: string;
  date: string; // YYYY-MM-DD
  attendanceStatus: AttendanceStatus;
  scheduledStartAt: string; // e.g. "08:00"
  scheduledEndAt: string;   // e.g. "14:00"
  actualCheckInAt: string | null;  // e.g. "07:42" or ISO string
  actualCheckOutAt: string | null; // e.g. "16:17" or null
  lateMinutes: number;
  earlyCheckoutMinutes: number;
  checkInPhotoPath?: string | null;
  checkOutPhotoPath?: string | null;
  checkInMethod?: AttendanceMethod;
  checkOutMethod?: AttendanceMethod | null;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
}

export interface UserAccount {
  id: string;
  username: string;
  email?: string;
  password?: string;
  name: string;
  role: UserRole;
  staffId?: string | null;
  patientId?: string | null;
  doctorId?: string | null;
  branchId?: string | null;
  active: boolean;
  authUserId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DoctorAssistantPairing {
  id: string;
  doctorId: string;
  assistantId: string; // refers to staffId/userId
  assignedBranchId: string;
  pairingDate: string; // ISO date
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export enum ServiceCategory {
  CONSULTATION = "CONSULTATION",
  PREVENTIVE = "PREVENTIVE",
  RESTORATIVE = "RESTORATIVE",
  SURGERY = "SURGERY",
  AESTHETIC = "AESTHETIC",
  ORTHODONTIC = "ORTHODONTIC",
  TREATMENT = "TREATMENT",
  PROSTHODONTIC = "PROSTHODONTIC",
  OTHER = "OTHER"
}

export interface MasterService {
  id: string;
  code?: string;
  name: string;
  description: string;
  basePrice: number; // integer (rupiah)
  estimatedDurationMinutes: number;
  category: string;
  displayOrder?: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BranchServiceTariff {
  id: string;
  branchId: string;
  serviceId: string;
  customPrice: number; // integer (rupiah), can override basePrice
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Booking {
  id: string;
  patientId: string;
  branchId: string;
  serviceId?: string;
  doctorId: string;
  bookingDateTime: string; // ISO date-time (e.g. 2026-09-21T14:30:00Z)
  timeSlot?: string; // Optional time slot string (e.g. "09:00")
  notes?: string;
  complaint?: string;
  patientNameSnapshot?: string;
  doctorNameSnapshot?: string;
  branchNameSnapshot?: string;
  status: BookingStatus;
  createdAt: string;
  updatedAt: string;
}

export interface BookingConfirmationH1 {
  id: string;
  bookingId: string;
  confirmationStatus: ConfirmationStatusH1;
  status: ConfirmationStatusH1;
  calledAt?: string; // ISO date-time alias
  contactedAt?: string; // ISO date-time
  confirmedAt?: string; // ISO date-time when confirmed
  contactByStaffId?: string;
  staffId?: string; // the admin caller ID
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PatientVisit {
  id: string;
  patientId: string;
  branchId: string;
  visitDateTime: string; // ISO date-time
  visitType: VisitType; // BOOKING or WALK_IN
  visitStatus: VisitStatus;
  bookingId: string | null; // WALK_IN has bookingId = null (PATIENT != VISIT, BOOKING != VISIT)
  complaint?: string;
  doctorId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface QueueItem {
  id: string;
  branchId: string;
  doctorId: string;
  visitId: string;
  bookingId?: string | null;
  patientId?: string;
  queueNumber: string; // e.g. "A-01", "B-04"
  status: QueueStatus | "WAITING" | "IN_PREPARATION" | "IN_CONSULTATION" | "COMPLETED" | "SKIPPED" | "CALLING" | "CANCELLED";
  sequenceOrder?: number;
  arrivalAt: string; // ISO date-time
  estimatedServiceAt?: string; // ISO date-time
  actualServiceStartAt?: string; // ISO date-time
  actualServiceEndAt?: string; // ISO date-time
  estimatedDurationMinutes: number;

  // Backward compatibility fields
  checkInTime?: string; // ISO date-time
  startTime?: string; // ISO date-time
  endTime?: string; // ISO date-time

  createdAt: string;
  updatedAt: string;

  // Snapshots for UI
  patientNameSnapshot?: string;
  doctorNameSnapshot?: string;
  branchNameSnapshot?: string;
  bookingTimeSnapshot?: string;
}

export interface LiveQueueSnapshot {
  id?: string;
  branchId: string;
  doctorId: string;
  operationalDate: string; // YYYY-MM-DD
  currentQueue: QueueItem | null;
  waitingQueue: QueueItem[];
  preparationQueue: QueueItem[];
  consultationQueue: QueueItem[];
  completedQueue: QueueItem[];
  skippedQueue: QueueItem[];
  generatedAt: string; // ISO date-time

  // Backward compatibility fields
  date?: string;
  activeQueueItems?: QueueItem[];
  lastUpdated?: string;
}

export interface TreatmentJob {
  id: string;
  visitId: string;
  patientId: string;
  branchId: string;
  doctorId: string;
  serviceId: string;
  status: TreatmentJobStatus | "BELUM_DIMULAI" | "DALAM_PROSES" | "SELESAI" | "DISERAHKAN";
  serviceNameSnapshot: string;
  doctorNameSnapshot: string;
  estimatedDurationMinutes?: number;
  notes?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  handedOverAt?: string;
  updatedAt: string;

  // Backward compatibility & future phase fields
  assignedDoctorId?: string;
  picAssistantId?: string;
}

export interface TreatmentActivity {
  id: string;
  treatmentId: string;
  actorId: string;
  actorRole: UserRole;
  actorNameSnapshot: string;
  activityType: TreatmentActivityType;
  activityAt: string; // ISO 8601 date-time
  notes?: string;
  branchId?: string;

  // Duration change audit fields
  queueId?: string;
  patientId?: string;
  doctorId?: string;
  previousDurationMinutes?: number;
  addedMinutes?: number;
  newDurationMinutes?: number;

  // Backward compatibility aliases
  createdAt?: string;
  treatmentJobId?: string;
  performerId?: string;
  performerRole?: UserRole;
  description?: string;
  timestamp?: string;
}

export interface TreatmentVisitLink {
  id: string;
  treatmentJobId: string;
  visitId: string;
  linkedAt: string; // ISO date-time
}

export interface MedicalRecord {
  id: string;
  patientId: string;
  visitId: string;
  branchId: string;
  doctorId: string;
  chiefComplaint: string; // Keluhan Utama
  anamnesis?: string; // Anamnesis
  clinicalExamination?: string; // Pemeriksaan Klinis
  diagnosis: string; // Diagnosis
  treatmentPlan?: string; // Rencana / Tindakan
  doctorNotes?: string; // Catatan Dokter
  status: MedicalRecordStatus | "DRAFT" | "FINAL";
  createdAt: string;
  updatedAt: string;

  // UI snapshot fields
  patientNameSnapshot?: string;
  doctorNameSnapshot?: string;
  branchNameSnapshot?: string;
}

export interface TreatmentIncentive {
  id: string;
  treatmentJobId: string;
  receiverId: string; // Assistant or Doctor
  amount: number; // integer (rupiah)
  status: IncentiveStatus;
  approvedAt?: string; // ISO date-time
  paidAt?: string; // ISO date-time
  createdAt: string;
  updatedAt: string;
}

export interface Invoice {
  id: string;
  invoiceNumber?: string; // Standard format: INV/{BRANCH_CODE}/{YYYYMM}/{RUNNING_4_DIGIT}
  visitId: string;
  patientId: string;
  branchId: string;
  totalAmount: number; // Sum of items - integer
  discountAmount: number; // integer
  taxAmount: number; // integer
  netAmount: number; // integer
  paidAmount: number; // integer
  outstandingAmount: number; // integer (Invoice != Payment)
  status: InvoiceStatus;
  items?: InvoiceItem[];
  itemsSnapshot?: InvoiceItem[];
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceItem {
  id: string;
  invoiceId: string;
  serviceId?: string;
  descriptionSnapshot: string; // Snapshot Principle
  unitPriceSnapshot: number; // Snapshot Principle
  quantity: number;
  amount: number; // quantity * unitPriceSnapshot - discount, integer
  createdAt: string;
}

export interface PaymentTransaction {
  id: string;
  receiptNumber?: string; // Standard format: KWT/{BRANCH_CODE}/{YYYYMM}/{RUNNING_4_DIGIT}
  invoiceId: string;
  branchId?: string;
  amount: number; // integer (Payment != Payroll)
  paymentMethod: PaymentMethod;
  referenceNumber?: string;
  notes?: string;
  transactionDateTime: string; // ISO date-time
  staffId: string; // recorded by whom
  status: "SUCCESS" | "REFUNDED" | "FAILED";
  createdAt: string;
  updatedAt: string;
}

export interface StaffCompensationRule {
  id: string;
  staffId: string;
  name: string;
  ruleTypeSnapshot: "PERCENTAGE" | "FIXED_PER_TREATMENT" | "BASE_SALARY" | "DOCTOR_SITTING_FEE";
  valueSnapshot: number; // percentage or flat amount
  isActive: boolean;
  serviceId?: string | null;
  branchId?: string | null;
  effectiveStartDate?: string; // YYYY-MM-DD
  effectiveEndDate?: string | null; // YYYY-MM-DD or null
  createdAt: string;
  updatedAt: string;
}

export interface CompensationAccrual {
  id: string;
  staffId: string;
  ruleIdSnapshot?: string; // Snapshot Principle
  ruleTypeSnapshot?: string; // Snapshot Principle
  valueSnapshot?: number; // Snapshot Principle
  baseAmountSnapshot?: number; // Snapshot Principle
  amount: number; // calculated accrual - integer
  sourceId: string; // e.g. treatmentJobId
  accruedAt: string; // ISO date-time
}

export interface MonthlyPayroll {
  id: string;
  staffId: string;
  month: number; // 1-12
  year: number;
  baseSalary: number; // integer
  totalCompensation: number; // accumulated compensation
  totalDeductions: number; // deductions
  netSalary: number; // integer (Payment != Payroll)
  status: PayrollStatus;
  branchId?: string | null;
  bankNameSnapshot?: string;
  bankAccountNumberSnapshot?: string;
  bankAccountHolderSnapshot?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PayrollItem {
  id: string;
  payrollId: string;
  descriptionSnapshot: string; // Snapshot Principle
  amountSnapshot: number; // Snapshot Principle
  type: "EARNING" | "DEDUCTION";
  sourceId?: string; // referencing trigger event, e.g., compensationAccrualId
}

// ==========================================
// ACCOUNTING DOMAIN ENTITIES (Phase 1)
// ==========================================

export interface ChartOfAccount {
  id: string;
  code: string; // Unique, e.g. "1000"
  name: string; // e.g. "Kas (Cash)"
  accountType: AccountType;
  accountCategory: AccountCategory;
  normalBalance: NormalBalance;
  isActive: boolean;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface JournalLine {
  id: string;
  journalEntryId: string;
  accountId: string;
  debit: number; // Integer rupiah >= 0
  credit: number; // Integer rupiah >= 0
  branchId: string;
  description?: string;
}

export interface JournalEntry {
  id: string;
  journalNumber: string; // Unique, e.g. "JRN-GEB-20260921-0001"
  journalDate: string; // YYYY-MM-DD
  branchId: string;
  description: string;
  sourceType: JournalSourceType;
  sourceId?: string | null;
  status: JournalStatus;
  totalDebit: number; // Sum of debits (integer rupiah)
  totalCredit: number; // Sum of credits (integer rupiah)
  lines: JournalLine[];
  createdBy: string;
  createdAt: string;
  postedAt?: string | null;
  postedBy?: string | null;
  voidedAt?: string | null;
  voidedBy?: string | null;
  voidReason?: string | null;
  updatedAt?: string;
  event?: "ACCRUAL" | "PAYMENT";
}

export interface GeneralLedgerEntry {
  journalId: string;
  journalNumber: string;
  journalDate: string;
  lineId: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  normalBalance: NormalBalance;
  branchId: string;
  description: string;
  debit: number;
  credit: number;
  sourceType: JournalSourceType;
  sourceId?: string | null;
  postedAt: string;
  runningBalance?: number;
}

// ==========================================
// OVERTIME CORE (Phase HR-3)
// ==========================================

export enum OvertimeStatus {
  DETECTED = "DETECTED",
  SUBMITTED = "SUBMITTED",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
  PAID = "PAID"
}

export enum OvertimeType {
  AFTER_SHIFT = "AFTER_SHIFT"
}

export interface OvertimeRecord {
  id: string;
  staffId: string;
  branchId: string;
  attendanceId: string;
  date: string; // YYYY-MM-DD
  scheduledEndAt: string; // HH:mm
  actualEndAt: string; // HH:mm
  overtimeMinutes: number;
  overtimeHours: number;
  overtimeType: OvertimeType;
  calculationMethod?: string | null;
  hourlyRateSnapshot?: number | null;
  overtimeAmountSnapshot?: number | null;
  status: OvertimeStatus;
  notes?: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  rejectedBy?: string | null;
  rejectedAt?: string | null;
  rejectionReason?: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy?: string | null;
  updatedBy?: string | null;
}

// ==========================================
// CURRENT USER STATE CONTEXT
// ==========================================

export interface CurrentUser {
  id: string;
  name: string;
  role: UserRole;
  assignedBranchId: string | null; // null for SUPER_ADMIN, required for BRANCH_ADMIN
  branchId?: string | null; // alias for assignedBranchId
  staffId?: string | null;
  doctorId?: string | null;
}

// ==========================================
// FINANCIAL REPORT ENTITIES (Phase 9C.2)
// ==========================================

export interface IncomeStatementReportItem {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountCategory: AccountCategory;
  amount: number;
}

export interface IncomeStatementReport {
  branchId?: string | null;
  branchName?: string;
  dateFrom?: string;
  dateTo?: string;
  revenues: IncomeStatementReportItem[];
  totalRevenue: number;
  expenses: IncomeStatementReportItem[];
  totalExpense: number;
  netIncome: number; // totalRevenue - totalExpense
  generatedAt: string;
}

export interface TrialBalanceItem {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  accountCategory: AccountCategory;
  normalBalance: NormalBalance;
  debit: number;
  credit: number;
  endingBalance: number;
}

export interface TrialBalanceReport {
  branchId?: string | null;
  branchName?: string;
  dateFrom?: string;
  dateTo?: string;
  items: TrialBalanceItem[];
  totalDebit: number;
  totalCredit: number;
  isBalanced: boolean;
  generatedAt: string;
}

export interface BalanceSheetReport {
  branchId?: string | null;
  branchName?: string;
  dateTo?: string;
  assets: IncomeStatementReportItem[];
  totalAssets: number;
  liabilities: IncomeStatementReportItem[];
  totalLiabilities: number;
  equity: IncomeStatementReportItem[];
  currentPeriodNetIncome: number;
  totalEquity: number;
  totalLiabilitiesAndEquity: number;
  isBalanced: boolean;
  generatedAt: string;
}

export interface ClinicBranding {
  id: string;
  name: string;
  tagline?: string;
  logoUrl?: string | null;
  address: string;
  phone: string;
  whatsapp: string;
  email?: string;
  website?: string;
  footerNote?: string;
  updatedAt: string;
  updatedBy?: string;
}

export interface PromotionMedia {
  id: string;
  title: string;
  description?: string;
  imageUrl: string;
  branchId?: string | null; // null/undefined = GLOBAL (Semua Cabang), or specific branch ID (e.g. "branch-gebang")
  isActive: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

// ==========================================
// PHASE 10A: BACKUP & STORAGE DOMAIN TYPES
// ==========================================

export enum BackupType {
  DATABASE = "DATABASE",
  MEDIA = "MEDIA",
  FULL = "FULL"
}

export enum BackupStatus {
  PENDING = "PENDING",
  RUNNING = "RUNNING",
  SUCCESS = "SUCCESS",
  FAILED = "FAILED",
  VERIFIED = "VERIFIED"
}

export enum BackupScheduleInterval {
  DAILY = "DAILY",
  WEEKLY = "WEEKLY",
  MONTHLY = "MONTHLY"
}

export interface BackupManifest {
  backupId: string;
  createdAt: string;
  backupType: BackupType;
  intervalType: BackupScheduleInterval;
  databaseVersion: string;
  schemaVersion: string;
  fileName: string;
  fileSize: number; // in bytes
  checksum: string; // SHA-256 hash
  tablesIncluded: string[];
  mediaCount?: number;
  mediaIncluded?: string[];
  status: BackupStatus;
  isVerified: boolean;
  durationMs: number;
  destinationPath: string;
  provider: "GOOGLE_DRIVE" | "MOCK_STORAGE" | "LOCAL";
  notes?: string;
}

export interface BackupJob {
  id: string;
  backupType: BackupType;
  intervalType: BackupScheduleInterval;
  startedAt: string;
  completedAt?: string | null;
  status: BackupStatus;
  sizeBytes?: number;
  destination: string;
  provider: "GOOGLE_DRIVE" | "MOCK_STORAGE" | "LOCAL";
  checksum?: string | null;
  errorMessage?: string | null;
  manifest?: BackupManifest | null;
  verifiedAt?: string | null;
  verificationNotes?: string | null;
  isVerified: boolean;
  triggeredBy: "SYSTEM_SCHEDULE" | "SUPER_ADMIN_MANUAL";
  createdAt: string;
}

export interface BackupStorageItem {
  name: string;
  path: string;
  sizeBytes: number;
  updatedAt: string;
  checksum?: string;
  mimeType?: string;
}

export interface BackupVerificationResult {
  isValid: boolean;
  fileExists: boolean;
  sizeValid: boolean;
  checksumMatches: boolean;
  schemaMarkersPresent: boolean;
  recordCountValid: boolean;
  details: string[];
}

export interface DisasterRecoveryTestResult {
  testId: string;
  executedAt: string;
  backupId: string;
  schemaVerified: boolean;
  integrityPassed: boolean;
  counts: {
    patients: number;
    visits: number;
    queueItems: number;
    treatments: number;
    medicalRecords: number;
    invoices: number;
    payments: number;
    payrolls: number;
    journalEntries: number;
  };
  orphanCheckPassed: boolean;
  overallStatus: "PASS" | "FAIL";
  message: string;
}

export interface BackupSystemSummary {
  systemHealth: "HEALTHY" | "WARNING" | "CRITICAL";
  provider: "GOOGLE_DRIVE" | "MOCK_STORAGE";
  isConnected: boolean;
  lastDatabaseBackup: BackupJob | null;
  lastMediaBackup: BackupJob | null;
  nextScheduledBackupAt: string; // e.g. 02:00 WIB
  totalBackupsCount: number;
  storageUsageBytes: number;
  recentJobs: BackupJob[];
}


