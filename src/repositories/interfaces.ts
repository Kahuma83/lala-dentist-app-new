import {
  PatientProfile,
  DentalBranch,
  Booking,
  BookingConfirmationH1,
  PatientVisit,
  QueueItem,
  LiveQueueSnapshot,
  TreatmentJob,
  TreatmentActivity,
  TreatmentActivityType,
  Invoice,
  InvoiceItem,
  InvoiceStatus,
  PaymentTransaction,
  PaymentMethod,
  StaffCompensationRule,
  CompensationAccrual,
  MonthlyPayroll,
  PayrollItem,
  PayrollStatus,
  MasterService,
  BranchServiceTariff,
  DentalDoctor,
  Staff,
  StaffPosition,
  EmploymentStatus,
  DoctorBranchAssignment,
  ScheduleStatus,
  DoctorSchedule,
  WorkShift,
  StaffShiftAssignment,
  UserAccount,
  UserRole,
  VisitStatus,
  BookingStatus,
  ConfirmationStatusH1,
  AccountType,
  NormalBalance,
  AccountCategory,
  JournalStatus,
  JournalSourceType,
  ChartOfAccount,
  JournalLine,
  JournalEntry,
  GeneralLedgerEntry,
  Attendance,
  AttendanceStatus,
  AttendanceMethod,
  OvertimeRecord,
  IncomeStatementReport,
  TrialBalanceReport,
  BalanceSheetReport,
  ClinicBranding,
  MediaUploadResult,
  MedicalRecord,
  MedicalRecordStatus,
  PromotionMedia,
  BackupJob,
  BackupManifest,
  BackupType,
  BackupStatus,
  BackupScheduleInterval,
  BackupSystemSummary,
  BackupVerificationResult,
  DisasterRecoveryTestResult
} from "../types/domain";

export interface MediaStorageRepository {
  uploadImage(
    file: File | Blob | { name: string; type: string; size: number; base64OrDataUrl?: string; content?: string },
    folder?: string
  ): Promise<MediaUploadResult>;
  replaceImage(
    oldPathOrUrl: string,
    newFile: File | Blob | { name: string; type: string; size: number; base64OrDataUrl?: string; content?: string },
    folder?: string
  ): Promise<MediaUploadResult>;
  deleteImage(pathOrUrl: string): Promise<void>;
  getPublicUrl(path: string): string;
}

export interface DuplicateCheckResult {
  byPhone: PatientProfile[];
  byRM: PatientProfile[];
  byName: PatientProfile[];
  hasDuplicates: boolean;
}

export interface PatientRepository {
  getPatients(currentUserRole?: UserRole, userBranchId?: string | null): Promise<PatientProfile[]>;
  getPatientById(id: string): Promise<PatientProfile | null>;
  searchPatients(query: string, currentUserRole?: UserRole, userBranchId?: string | null): Promise<PatientProfile[]>;
  createPatient(
    patientData: Omit<PatientProfile, "id" | "medicalRecordNumber" | "createdAt" | "updatedAt"> & { id?: string; medicalRecordNumber?: string },
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<PatientProfile>;
  updatePatient(
    id: string,
    updates: Partial<Omit<PatientProfile, "id" | "createdAt" | "updatedAt">>,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<PatientProfile>;
  checkDuplicates(phone?: string, medicalRecordNumber?: string, fullName?: string): Promise<DuplicateCheckResult>;
  deletePatient(id: string, currentUserRole?: UserRole): Promise<boolean>;
}

export interface BranchRepository {
  getBranches(currentUserRole?: UserRole, userBranchId?: string | null): Promise<DentalBranch[]>;
  getBranchById(id: string): Promise<DentalBranch | null>;
  getDoctors(): Promise<DentalDoctor[]>;
  createBranch(
    data: Omit<DentalBranch, "id" | "createdAt" | "updatedAt"> & { id?: string },
    currentUserRole?: UserRole
  ): Promise<DentalBranch>;
  updateBranch(
    id: string,
    updates: Partial<Omit<DentalBranch, "id" | "createdAt" | "updatedAt">>,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<DentalBranch>;
  updateBranchBranding(
    id: string,
    brandingUpdates: {
      logoUrl?: string | null;
      imageUrl?: string | null;
      clinicName?: string;
      phone?: string;
      whatsapp?: string;
      email?: string;
      address?: string;
    },
    currentUserRole?: UserRole
  ): Promise<DentalBranch>;
}

export interface StaffFilter {
  branchId?: string | null;
  position?: StaffPosition;
  employmentStatus?: EmploymentStatus;
  activeOnly?: boolean;
}

export interface StaffRepository {
  getStaff(filter?: StaffFilter, currentUserRole?: UserRole, userBranchId?: string | null): Promise<Staff[]>;
  getStaffById(id: string): Promise<Staff | null>;
  getStaffByEmployeeCode(employeeCode: string): Promise<Staff | null>;
  createStaff(
    data: Omit<Staff, "id" | "createdAt" | "updatedAt"> & { id?: string },
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<Staff>;
  updateStaff(
    id: string,
    updates: Partial<Omit<Staff, "id" | "createdAt" | "updatedAt">>,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<Staff>;
  deactivateStaff(
    id: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<Staff>;
  deleteStaff(
    id: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<boolean>;
}

export interface DoctorRepository {
  getDoctors(currentUserRole?: UserRole, userBranchId?: string | null): Promise<DentalDoctor[]>;
  getDoctorById(id: string): Promise<DentalDoctor | null>;
  getDoctorByCode(code: string): Promise<DentalDoctor | null>;
  getDoctorsByBranch(branchId: string): Promise<DentalDoctor[]>;
  createDoctor(
    data: Omit<DentalDoctor, "id" | "createdAt" | "updatedAt"> & { id?: string },
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<DentalDoctor>;
  updateDoctor(
    id: string,
    updates: Partial<Omit<DentalDoctor, "id" | "createdAt" | "updatedAt">>,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<DentalDoctor>;
  updateDoctorPhoto(
    id: string,
    photoUrl: string | null,
    currentUserRole?: UserRole
  ): Promise<DentalDoctor>;
  getDoctorBranchAssignments(doctorId?: string, branchId?: string): Promise<DoctorBranchAssignment[]>;
  assignDoctorToBranch(
    data: Omit<DoctorBranchAssignment, "id" | "createdAt" | "updatedAt"> & { id?: string },
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<DoctorBranchAssignment>;
  removeDoctorBranchAssignment(id: string): Promise<void>;
  deleteDoctor(id: string, currentUserRole?: UserRole): Promise<void>;
}

export interface ScheduleFilter {
  date?: string;
  branchId?: string;
  doctorId?: string;
  status?: ScheduleStatus;
}

export interface DoctorScheduleRepository {
  getSchedules(
    filter?: ScheduleFilter,
    currentUserRole?: UserRole,
    userBranchId?: string | null,
    currentDoctorId?: string | null
  ): Promise<DoctorSchedule[]>;
  getScheduleById(id: string): Promise<DoctorSchedule | null>;
  createSchedule(
    data: Omit<DoctorSchedule, "id" | "createdAt" | "updatedAt"> & { id?: string },
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<DoctorSchedule>;
  updateSchedule(
    id: string,
    updates: Partial<Omit<DoctorSchedule, "id" | "createdAt" | "updatedAt">>,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<DoctorSchedule>;
  cancelSchedule(
    id: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<DoctorSchedule>;
}

export interface WorkShiftRepository {
  getShifts(branchId?: string): Promise<WorkShift[]>;
  getShiftById(id: string): Promise<WorkShift | null>;
  createShift(data: Omit<WorkShift, "id" | "createdAt" | "updatedAt"> & { id?: string }): Promise<WorkShift>;
  updateShift(id: string, updates: Partial<Omit<WorkShift, "id" | "createdAt" | "updatedAt">>): Promise<WorkShift>;
}

export interface StaffShiftAssignmentFilter {
  date?: string;
  branchId?: string;
  staffId?: string;
}

export interface StaffShiftAssignmentRepository {
  getAssignments(
    filter?: StaffShiftAssignmentFilter,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<StaffShiftAssignment[]>;
  getAssignmentById(id: string): Promise<StaffShiftAssignment | null>;
  assignStaffShift(
    data: Omit<StaffShiftAssignment, "id" | "createdAt" | "updatedAt"> & { id?: string },
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<StaffShiftAssignment>;
  updateAssignment(
    id: string,
    updates: Partial<Omit<StaffShiftAssignment, "id" | "createdAt" | "updatedAt">>,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<StaffShiftAssignment>;
  removeAssignment(
    id: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<void>;
}

export interface AttendanceFilter {
  branchId?: string;
  staffId?: string;
  date?: string;
  dateRange?: {
    startDate?: string;
    endDate?: string;
  };
  attendanceStatus?: AttendanceStatus;
}

export interface CheckInInput {
  staffId: string;
  branchId?: string;
  date?: string;
  checkInTime?: string;
  photoPath?: string | null;
  checkInPhotoPath?: string | null;
  method?: AttendanceMethod;
  checkInMethod?: AttendanceMethod;
  notes?: string;
  scheduledStartAt?: string;
  scheduledEndAt?: string;
  actorRole?: UserRole;
  actorBranchId?: string | null;
  actorId?: string;
}

export interface CheckOutInput {
  attendanceId?: string;
  staffId?: string;
  date?: string;
  checkOutTime?: string;
  photoPath?: string | null;
  checkOutPhotoPath?: string | null;
  method?: AttendanceMethod;
  checkOutMethod?: AttendanceMethod;
  notes?: string;
  actorRole?: UserRole;
  actorBranchId?: string | null;
  actorId?: string;
}

export interface CreateAbsenceInput {
  staffId: string;
  date: string;
  attendanceStatus: AttendanceStatus.SICK | AttendanceStatus.LEAVE | AttendanceStatus.OFF | AttendanceStatus.ABSENT;
  branchId?: string;
  notes?: string;
  scheduledStartAt?: string;
  scheduledEndAt?: string;
  actorRole?: UserRole;
  actorBranchId?: string | null;
  actorId?: string;
}

export interface AttendanceRepository {
  getById(id: string, currentUserRole?: UserRole, userBranchId?: string | null): Promise<Attendance | null>;
  getByStaff(staffId: string, currentUserRole?: UserRole, userBranchId?: string | null): Promise<Attendance[]>;
  getByDate(date: string, branchId?: string, currentUserRole?: UserRole, userBranchId?: string | null): Promise<Attendance[]>;
  getByBranch(branchId: string, currentUserRole?: UserRole, userBranchId?: string | null): Promise<Attendance[]>;
  list(
    filter?: AttendanceFilter,
    currentUserRole?: UserRole,
    userBranchId?: string | null,
    currentStaffId?: string | null
  ): Promise<Attendance[]>;
  checkIn(input: CheckInInput, currentUserRole?: UserRole, userBranchId?: string | null): Promise<Attendance>;
  checkOut(input: CheckOutInput, currentUserRole?: UserRole, userBranchId?: string | null): Promise<Attendance>;
  createAbsence(input: CreateAbsenceInput, currentUserRole?: UserRole, userBranchId?: string | null): Promise<Attendance>;
}

export interface BookingRepository {
  getBookings(currentUserRole?: UserRole, userBranchId?: string | null): Promise<Booking[]>;
  getBookingById(id: string, currentUserRole?: UserRole, userBranchId?: string | null): Promise<Booking | null>;
  getBookingsByBranch(branchId: string, currentUserRole?: UserRole, userBranchId?: string | null): Promise<Booking[]>;
  getBookingsByPatient(patientId: string): Promise<Booking[]>;
  getBookingsByDate(dateStr: string, branchId?: string, currentUserRole?: UserRole, userBranchId?: string | null): Promise<Booking[]>;
  createBooking(
    bookingData: Omit<Booking, "id" | "status" | "createdAt" | "updatedAt"> & { id?: string; status?: BookingStatus },
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<Booking>;
  updateBooking(
    id: string,
    updates: Partial<Omit<Booking, "id" | "createdAt" | "updatedAt">>,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<Booking>;
  cancelBooking(
    id: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<Booking>;
}

export interface H1ConfirmationRepository {
  getH1Confirmation(bookingId: string): Promise<BookingConfirmationH1 | null>;
  listH1Confirmations(branchId?: string, currentUserRole?: UserRole, userBranchId?: string | null): Promise<BookingConfirmationH1[]>;
  createOrInitializeH1Confirmation(bookingId: string, staffId?: string): Promise<BookingConfirmationH1>;
  updateH1Confirmation(
    bookingId: string,
    updates: Partial<Omit<BookingConfirmationH1, "id" | "bookingId" | "createdAt" | "updatedAt">>,
    staffId?: string
  ): Promise<BookingConfirmationH1>;
}

export interface VisitRepository {
  getVisits(): Promise<PatientVisit[]>;
  getVisitById(id: string): Promise<PatientVisit | null>;
  getVisitsByPatient(patientId: string): Promise<PatientVisit[]>;
  getVisitsByBranch(branchId: string, currentUserRole?: UserRole, userBranchId?: string | null): Promise<PatientVisit[]>;
  createVisit(
    visitData: Omit<PatientVisit, "id" | "visitDateTime" | "visitStatus" | "createdAt" | "updatedAt"> & {
      id?: string;
      visitDateTime?: string;
      visitStatus?: VisitStatus;
    },
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<PatientVisit>;
  updateVisitStatus(
    id: string,
    status: VisitStatus,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<PatientVisit>;
}

export interface QueueRepository {
  getQueueItems(): Promise<QueueItem[]>;
  getQueueByBranch(
    branchId: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<QueueItem[]>;
  getQueueByDoctor(
    doctorId: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null,
    currentUserId?: string | null
  ): Promise<QueueItem[]>;
  getQueueByPatient(
    patientId: string,
    currentUserRole?: UserRole,
    currentUserId?: string | null
  ): Promise<QueueItem[]>;
  getLiveQueueSnapshot(
    branchId: string,
    date: string,
    doctorId?: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null,
    currentUserId?: string | null
  ): Promise<LiveQueueSnapshot | null>;
  checkInVisitToQueue(
    visitId: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null,
    options?: { estimatedDurationMinutes?: number; doctorId?: string; customId?: string }
  ): Promise<QueueItem>;
  callQueuePatient(
    queueId: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null,
    currentUserId?: string | null
  ): Promise<QueueItem>;
  prepareQueuePatient(
    queueId: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null,
    currentUserId?: string | null
  ): Promise<QueueItem>;
  startService(
    queueId: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null,
    currentUserId?: string | null
  ): Promise<QueueItem>;
  finishService(
    queueId: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null,
    currentUserId?: string | null
  ): Promise<QueueItem>;
  skipQueuePatient(
    queueId: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null,
    currentUserId?: string | null
  ): Promise<QueueItem>;
  updateEstimatedDuration(
    queueId: string,
    newDurationMinutes: number,
    currentUserRole?: UserRole,
    userBranchId?: string | null,
    currentUserId?: string | null,
    options?: {
      reason?: string;
      addedMinutes?: number;
      previousDurationMinutes?: number;
      actorNameSnapshot?: string;
      treatmentId?: string;
    }
  ): Promise<QueueItem>;
  recalculateQueue(
    branchId: string,
    doctorId: string,
    operationalDate: string
  ): Promise<QueueItem[]>;
}

export interface TreatmentRepository {
  getTreatmentJobs(): Promise<TreatmentJob[]>;
  getTreatmentJobById(id: string): Promise<TreatmentJob | null>;
  getTreatmentsByVisit(visitId: string): Promise<TreatmentJob[]>;
  listTreatments(
    currentUserRole?: UserRole,
    userBranchId?: string | null,
    currentUserId?: string | null
  ): Promise<TreatmentJob[]>;
  getTreatmentById(
    id: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null,
    currentUserId?: string | null
  ): Promise<TreatmentJob | null>;
  listTreatmentsByVisit(
    visitId: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null,
    currentUserId?: string | null
  ): Promise<TreatmentJob[]>;
  listTreatmentsByBranch(
    branchId: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null,
    currentUserId?: string | null
  ): Promise<TreatmentJob[]>;
  createTreatmentJob(
    data: {
      visitId: string;
      serviceId: string;
      doctorId: string;
      estimatedDurationMinutes?: number;
      notes?: string;
      customId?: string;
      branchId?: string;
      patientId?: string;
    },
    currentUserRole?: UserRole,
    userBranchId?: string | null,
    currentUserId?: string | null
  ): Promise<TreatmentJob>;
  startTreatmentJob(
    id: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null,
    currentUserId?: string | null,
    actorData?: { actorId?: string; actorRole?: UserRole; actorNameSnapshot?: string; notes?: string }
  ): Promise<TreatmentJob>;
  completeTreatmentJob(
    id: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null,
    currentUserId?: string | null,
    actorData?: { actorId?: string; actorRole?: UserRole; actorNameSnapshot?: string; notes?: string }
  ): Promise<TreatmentJob>;
  handOverTreatmentJob(
    id: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null,
    currentUserId?: string | null,
    actorData?: { actorId?: string; actorRole?: UserRole; actorNameSnapshot?: string; notes?: string }
  ): Promise<TreatmentJob>;
}

export interface TreatmentActivityRepository {
  listActivitiesByTreatment(
    treatmentId: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null,
    currentUserId?: string | null
  ): Promise<TreatmentActivity[]>;

  getActivityById(
    activityId: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null,
    currentUserId?: string | null
  ): Promise<TreatmentActivity | null>;

  addActivity(
    data: {
      treatmentId: string;
      actorId: string;
      actorRole: UserRole;
      actorNameSnapshot?: string;
      activityType: TreatmentActivityType;
      notes?: string;
      customId?: string;
    },
    currentUserRole?: UserRole,
    userBranchId?: string | null,
    currentUserId?: string | null
  ): Promise<TreatmentActivity>;
}

export interface MedicalRecordRepository {
  getMedicalRecordById(
    id: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<MedicalRecord | null>;

  getMedicalRecordByVisit(
    visitId: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<MedicalRecord | null>;

  getMedicalRecordsByPatient(
    patientId: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<MedicalRecord[]>;

  createOrUpdateMedicalRecord(
    data: {
      visitId: string;
      patientId: string;
      branchId: string;
      doctorId: string;
      chiefComplaint: string;
      anamnesis?: string;
      clinicalExamination?: string;
      diagnosis: string;
      treatmentPlan?: string;
      doctorNotes?: string;
      status?: MedicalRecordStatus | "DRAFT" | "FINAL";
      customId?: string;
    },
    currentUserRole?: UserRole,
    userBranchId?: string | null,
    currentUserId?: string | null
  ): Promise<MedicalRecord>;
}

export interface InvoiceRepository {
  getInvoices(currentUserRole?: UserRole, userBranchId?: string | null): Promise<Invoice[]>;
  getInvoiceById(id: string, currentUserRole?: UserRole, userBranchId?: string | null): Promise<Invoice | null>;
  getInvoiceItems(invoiceId: string): Promise<InvoiceItem[]>;
  getInvoicesByBranch(branchId: string, currentUserRole?: UserRole, userBranchId?: string | null): Promise<Invoice[]>;
  getInvoicesByPatient(patientId: string): Promise<Invoice[]>;
  createInvoice(
    data: {
      visitId: string;
      patientId: string;
      branchId: string;
      items: Array<{
        serviceId?: string;
        descriptionSnapshot: string;
        unitPriceSnapshot: number;
        quantity: number;
        amount?: number;
      }>;
      discountAmount?: number;
      taxAmount?: number;
      customId?: string;
      customInvoiceNumber?: string;
    },
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<Invoice>;
  updateInvoiceStatus(
    id: string,
    status: InvoiceStatus,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<Invoice>;
  cancelInvoice(
    id: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<Invoice>;
  deleteInvoice(
    id: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<boolean>;
}

export interface PaymentRepository {
  getPayments(currentUserRole?: UserRole, userBranchId?: string | null): Promise<PaymentTransaction[]>;
  getPaymentsByInvoice(invoiceId: string, currentUserRole?: UserRole, userBranchId?: string | null): Promise<PaymentTransaction[]>;
  createPayment(
    data: {
      invoiceId: string;
      amount: number;
      paymentMethod: PaymentMethod;
      referenceNumber?: string;
      staffId: string;
      notes?: string;
      customId?: string;
      customReceiptNumber?: string;
    },
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<PaymentTransaction>;
  deletePayment(
    id: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<boolean>;
}

export interface CompensationRepository {
  getCompensationRules(): Promise<StaffCompensationRule[]>;
  getCompensationRulesByStaff(staffId: string): Promise<StaffCompensationRule[]>;
  createCompensationRule(
    data: Omit<StaffCompensationRule, "id" | "createdAt" | "updatedAt"> & { id?: string }
  ): Promise<StaffCompensationRule>;
  updateCompensationRule(
    id: string,
    updates: Partial<Omit<StaffCompensationRule, "id" | "createdAt" | "updatedAt">>
  ): Promise<StaffCompensationRule>;
  getCompensationAccruals(staffId?: string): Promise<CompensationAccrual[]>;
  calculateAndAccrueForTreatment(treatmentJobId: string): Promise<CompensationAccrual[]>;
  deleteAccrual(id: string, currentUserRole?: UserRole): Promise<boolean>;
  deleteCompensationRule(id: string, currentUserRole?: UserRole): Promise<boolean>;
}

export interface PayrollRepository {
  getPayrolls(month?: number, year?: number): Promise<MonthlyPayroll[]>;
  getPayrollById(id: string): Promise<MonthlyPayroll | null>;
  getPayrollItems(payrollId: string): Promise<PayrollItem[]>;
  generateMonthlyPayroll(
    staffId: string,
    month: number,
    year: number,
    baseSalary?: number
  ): Promise<MonthlyPayroll>;
  updatePayrollStatus(
    id: string,
    status: PayrollStatus
  ): Promise<MonthlyPayroll>;
  deletePayroll(id: string, currentUserRole?: UserRole): Promise<boolean>;
}

export interface ConfigurationRepository {
  getServices(): Promise<MasterService[]>;
  createService(
    data: Omit<MasterService, "id" | "createdAt" | "updatedAt"> & { id?: string }
  ): Promise<MasterService>;
  updateService(
    id: string,
    updates: Partial<Omit<MasterService, "id" | "createdAt" | "updatedAt">>
  ): Promise<MasterService>;
  getBranchTariffs(branchId: string): Promise<BranchServiceTariff[]>;
  setBranchTariff(
    branchId: string,
    serviceId: string,
    customPrice: number
  ): Promise<BranchServiceTariff>;
  getClinicBranding(): Promise<ClinicBranding>;
  updateClinicBranding(
    updates: Partial<Omit<ClinicBranding, "id" | "updatedAt">>,
    currentUserRole?: UserRole
  ): Promise<ClinicBranding>;
}

// ==========================================
// ACCOUNTING REPOSITORY INTERFACES (Phase 1)
// ==========================================

export interface CreateAccountInput {
  id?: string;
  code: string;
  name: string;
  accountType: AccountType;
  accountCategory: AccountCategory;
  normalBalance: NormalBalance;
  isActive?: boolean;
  description?: string;
}

export interface UpdateAccountInput {
  name?: string;
  accountType?: AccountType;
  accountCategory?: AccountCategory;
  normalBalance?: NormalBalance;
  isActive?: boolean;
  description?: string;
}

export interface CreateJournalLineInput {
  id?: string;
  accountId: string;
  debit: number;
  credit: number;
  branchId?: string;
  description?: string;
}

export interface CreateJournalInput {
  id?: string;
  journalNumber?: string;
  journalDate: string; // YYYY-MM-DD
  branchId: string;
  description: string;
  sourceType: JournalSourceType;
  sourceId?: string | null;
  lines: CreateJournalLineInput[];
  event?: "ACCRUAL" | "PAYMENT";
}

export interface UpdateJournalInput {
  journalDate?: string;
  branchId?: string;
  description?: string;
  sourceType?: JournalSourceType;
  sourceId?: string | null;
  lines?: CreateJournalLineInput[];
}

export interface JournalFilter {
  branchId?: string | null;
  status?: JournalStatus;
  sourceType?: JournalSourceType;
  sourceId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

export interface LedgerQuery {
  accountId?: string;
  accountCode?: string;
  branchId?: string | null;
  dateFrom?: string;
  dateTo?: string;
  includeDrafts?: boolean;
}

export interface AccountBalanceResult {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  accountCategory: AccountCategory;
  normalBalance: NormalBalance;
  totalDebit: number;
  totalCredit: number;
  balance: number;
}

export interface AccountingRepository {
  // Chart of Accounts
  getAccounts(
    filterOrActiveOnly?:
      | boolean
      | {
          activeOnly?: boolean;
          isActive?: boolean;
          accountType?: AccountType;
          accountCategory?: AccountCategory;
          search?: string;
        }
  ): Promise<ChartOfAccount[]>;
  getAccountById(id: string): Promise<ChartOfAccount | null>;
  getAccountByCode(code: string): Promise<ChartOfAccount | null>;
  createAccount(data: CreateAccountInput): Promise<ChartOfAccount>;
  updateAccount(id: string, updates: UpdateAccountInput): Promise<ChartOfAccount>;

  // Journal Entries
  getJournals(
    filter?: JournalFilter,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<JournalEntry[]>;
  getJournalById(
    id: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<JournalEntry | null>;
  getJournalsBySource(
    sourceType: JournalSourceType,
    sourceId: string
  ): Promise<JournalEntry[]>;
  createDraftJournal(
    data: CreateJournalInput,
    createdBy: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<JournalEntry>;
  updateDraftJournal(
    id: string,
    data: UpdateJournalInput,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<JournalEntry>;
  postJournal(
    id: string,
    postedBy: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<JournalEntry>;
  voidJournal(
    id: string,
    voidedBy: string,
    reason?: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<JournalEntry>;
  deleteDraftJournal(
    id: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<boolean>;
  deleteJournal(
    id: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<boolean>;
  findBySource(
    sourceType: JournalSourceType,
    sourceId: string
  ): Promise<JournalEntry | null>;
  listByBranch(
    branchId: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<JournalEntry[]>;
  listByDateRange(
    dateFrom: string,
    dateTo: string,
    branchId?: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<JournalEntry[]>;

  // General Ledger
  getLedgerEntries(
    query?: LedgerQuery,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<GeneralLedgerEntry[]>;
  getAccountBalance(
    accountId: string,
    branchId?: string,
    dateTo?: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<AccountBalanceResult>;

  // Financial Reports (Phase 9C.2)
  getIncomeStatementReport(
    query?: { branchId?: string; dateFrom?: string; dateTo?: string },
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<IncomeStatementReport>;
  getTrialBalanceReport(
    query?: { branchId?: string; dateFrom?: string; dateTo?: string },
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<TrialBalanceReport>;
  getBalanceSheetReport(
    query?: { branchId?: string; dateTo?: string },
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<BalanceSheetReport>;
}

export interface OvertimeSummary {
  totalDetectedMinutes: number;
  totalSubmittedMinutes: number;
  totalApprovedMinutes: number;
  totalRejectedMinutes: number;
  totalPaidMinutes: number;
}

export interface OvertimeRepository {
  getById(id: string, currentUserRole?: UserRole, userBranchId?: string | null): Promise<OvertimeRecord | null>;
  getByAttendanceId(attendanceId: string, currentUserRole?: UserRole, userBranchId?: string | null): Promise<OvertimeRecord | null>;
  getByStaff(staffId: string, currentUserRole?: UserRole, userBranchId?: string | null): Promise<OvertimeRecord[]>;
  getByBranch(branchId: string, currentUserRole?: UserRole, userBranchId?: string | null): Promise<OvertimeRecord[]>;
  getByDateRange(dateFrom: string, dateTo: string, branchId?: string, currentUserRole?: UserRole, userBranchId?: string | null): Promise<OvertimeRecord[]>;
  list(currentUserRole?: UserRole, userBranchId?: string | null): Promise<OvertimeRecord[]>;
  detectFromAttendance(attendanceId: string, currentUserRole?: UserRole, userBranchId?: string | null): Promise<OvertimeRecord | null>;
  submit(id: string, currentUserRole?: UserRole, userBranchId?: string | null): Promise<OvertimeRecord>;
  approve(id: string, approverName: string, currentUserRole?: UserRole, userBranchId?: string | null): Promise<OvertimeRecord>;
  reject(id: string, approverName: string, reason: string, currentUserRole?: UserRole, userBranchId?: string | null): Promise<OvertimeRecord>;
  getSummary(branchId?: string, currentUserRole?: UserRole, userBranchId?: string | null): Promise<OvertimeSummary>;
}

export interface PromotionRepository {
  getPromotions(currentUserRole?: UserRole, userBranchId?: string | null): Promise<PromotionMedia[]>;
  getPromotionById(id: string, currentUserRole?: UserRole, userBranchId?: string | null): Promise<PromotionMedia | null>;
  getActivePromotions(branchId?: string | null): Promise<PromotionMedia[]>;
  createPromotion(
    data: {
      title: string;
      description?: string;
      imageUrl: string;
      branchId?: string | null;
      isActive?: boolean;
      displayOrder?: number;
      customId?: string;
    },
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<PromotionMedia>;
  updatePromotion(
    id: string,
    updates: Partial<{
      title: string;
      description: string;
      imageUrl: string;
      branchId: string | null;
      isActive: boolean;
      displayOrder: number;
    }>,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<PromotionMedia>;
  deletePromotion(
    id: string,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<boolean>;
  toggleActive(
    id: string,
    isActive: boolean,
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<PromotionMedia>;
  reorderPromotions(
    orderedIds: string[],
    currentUserRole?: UserRole,
    userBranchId?: string | null
  ): Promise<PromotionMedia[]>;
}

export interface BackupRepository {
  getBackupJobs(currentUserRole?: UserRole): Promise<BackupJob[]>;
  getBackupJobById(id: string, currentUserRole?: UserRole): Promise<BackupJob | null>;
  createBackupJob(
    job: Omit<BackupJob, "id" | "createdAt"> & { id?: string },
    currentUserRole?: UserRole
  ): Promise<BackupJob>;
  updateBackupJob(
    id: string,
    updates: Partial<BackupJob>,
    currentUserRole?: UserRole
  ): Promise<BackupJob>;
  deleteBackupJob(id: string, currentUserRole?: UserRole): Promise<boolean>;
  getLatestDatabaseBackup(currentUserRole?: UserRole): Promise<BackupJob | null>;
  getLatestMediaBackup(currentUserRole?: UserRole): Promise<BackupJob | null>;
  getSystemSummary(currentUserRole?: UserRole): Promise<BackupSystemSummary>;
}

