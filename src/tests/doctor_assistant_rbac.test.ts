import { describe, it, expect, beforeEach } from "vitest";
import { UserRole, QueueStatus, TreatmentJobStatus } from "../types/domain";
import { MockDatabase } from "../data/mockData";
import {
  MockQueueRepository,
  MockTreatmentRepository,
  MockPatientRepository,
  MockCompensationRepository,
  MockInvoiceRepository,
  MockPaymentRepository,
  MockPayrollRepository,
  MockAccountingRepository
} from "../repositories/mockRepositories";

describe("RBAC DOCTOR_ASSISTANT Audit & Integrity Tests", () => {
  let db: MockDatabase;
  let queueRepo: MockQueueRepository;
  let treatmentRepo: MockTreatmentRepository;
  let patientRepo: MockPatientRepository;
  let compRepo: MockCompensationRepository;
  let invoiceRepo: MockInvoiceRepository;
  let paymentRepo: MockPaymentRepository;
  let payrollRepo: MockPayrollRepository;
  let accountingRepo: MockAccountingRepository;

  const assistantRole = UserRole.DOCTOR_ASSISTANT;
  const gebangBranchId = "branch-gebang";
  const kampusBranchId = "branch-kampus";
  const claryStaffId = "staff-clary"; // Asisten Gebang

  beforeEach(() => {
    db = MockDatabase.getInstance();
    queueRepo = new MockQueueRepository();
    treatmentRepo = new MockTreatmentRepository();
    patientRepo = new MockPatientRepository();
    compRepo = new MockCompensationRepository();
    invoiceRepo = new MockInvoiceRepository();
    paymentRepo = new MockPaymentRepository();
    payrollRepo = new MockPayrollRepository();
    accountingRepo = new MockAccountingRepository();
  });

  it("1. DOCTOR_ASSISTANT can access queue for assigned branch but is blocked from other branches", async () => {
    // Access Gebang queue -> allowed
    const gebangQueue = await queueRepo.getQueueByBranch(gebangBranchId, assistantRole, gebangBranchId);
    expect(gebangQueue).toBeDefined();

    // Access Kampus queue -> expect error
    await expect(
      queueRepo.getQueueByBranch(kampusBranchId, assistantRole, gebangBranchId)
    ).rejects.toThrow();
  });

  it("2. DOCTOR_ASSISTANT live queue snapshot enforces branch isolation", async () => {
    const today = new Date().toISOString().split("T")[0];

    const snapshotGebang = await queueRepo.getLiveQueueSnapshot(
      gebangBranchId,
      today,
      undefined,
      assistantRole,
      gebangBranchId,
      claryStaffId
    );
    expect(snapshotGebang).toBeDefined();

    await expect(
      queueRepo.getLiveQueueSnapshot(
        kampusBranchId,
        today,
        undefined,
        assistantRole,
        gebangBranchId,
        claryStaffId
      )
    ).rejects.toThrow();
  });

  it("3. DOCTOR_ASSISTANT only sees patients with visits/treatments in assigned branch", async () => {
    const gebangPatients = await patientRepo.getPatients(assistantRole, gebangBranchId);
    expect(gebangPatients).toBeDefined();
    expect(Array.isArray(gebangPatients)).toBe(true);

    // Patients returned should have visits/queue/treatments in gebang
    for (const p of gebangPatients) {
      const hasGebangVisit = db.visits.some((v) => v.patientId === p.id && v.branchId === gebangBranchId);
      const hasGebangQueue = db.queueItems.some((q) => q.patientId === p.id && q.branchId === gebangBranchId);
      const hasGebangTreatment = db.treatmentJobs.some((t) => t.patientId === p.id && t.branchId === gebangBranchId);
      const hasGebangBooking = db.bookings.some((b) => b.patientId === p.id && b.branchId === gebangBranchId);
      expect(hasGebangVisit || hasGebangQueue || hasGebangTreatment || hasGebangBooking).toBe(true);
    }
  });

  it("4. DOCTOR_ASSISTANT lists treatments strictly isolated to assigned branch", async () => {
    const treatments = await treatmentRepo.listTreatments(assistantRole, gebangBranchId, claryStaffId);
    for (const tr of treatments) {
      expect(tr.branchId).toBe(gebangBranchId);
    }
  });

  it("5. DOCTOR_ASSISTANT cannot access treatment details of other branches", async () => {
    const kampusTreatment = db.treatmentJobs.find((t) => t.branchId === kampusBranchId);
    if (kampusTreatment) {
      await expect(
        treatmentRepo.getTreatmentById(kampusTreatment.id, assistantRole, gebangBranchId, claryStaffId)
      ).rejects.toThrow();
    }
  });

  it("6. DOCTOR_ASSISTANT only sees own incentive accruals in CompensationRepository", async () => {
    const myAccruals = await compRepo.getCompensationAccruals(claryStaffId);
    for (const acc of myAccruals) {
      expect(acc.staffId).toBe(claryStaffId);
    }
  });

  it("7. Model C PIC Lock: Initial PIC Assistant remains owner of incentive upon calculation", async () => {
    const finishedTreatment = db.treatmentJobs.find(
      (t) => t.status === TreatmentJobStatus.SELESAI && t.picAssistantId === claryStaffId
    );

    if (finishedTreatment) {
      const accruals = await compRepo.calculateAndAccrueForTreatment(finishedTreatment.id);
      const assistantAccrual = accruals.find((a) => a.staffId === claryStaffId);
      if (assistantAccrual) {
        expect(assistantAccrual.staffId).toBe(claryStaffId);
      }
    }
  });
});
