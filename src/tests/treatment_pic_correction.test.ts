import { describe, expect, it } from "vitest";
import {
  EmploymentStatus,
  StaffPosition,
  TreatmentJobStatus,
  UserRole,
  VisitStatus,
  VisitType,
  type CompensationAccrual,
  type PatientVisit,
  type PayrollItem,
  type Staff,
  type TreatmentJob
} from "../types/domain";
import { MockDatabase } from "../data/mockData";
import { MockTreatmentRepository } from "../repositories/mockRepositories";

const createVisit = (): PatientVisit => ({
  id: "visit-pic-correction-test",
  patientId: "patient-pic-correction-test",
  branchId: "branch-pic-correction-test",
  visitDateTime: "2027-02-12T03:00:00.000Z",
  visitType: VisitType.BOOKING,
  visitStatus: VisitStatus.COMPLETED,
  bookingId: null,
  createdAt: "2027-02-12T03:00:00.000Z",
  updatedAt: "2027-02-12T03:00:00.000Z"
});

const createStaff = (id: string, branchId: string): Staff => ({
  id,
  employeeCode: id,
  fullName: id,
  phone: "",
  position: StaffPosition.ASSISTANT,
  employmentStatus: EmploymentStatus.ACTIVE,
  joinDate: "2027-01-01",
  active: true,
  branchId,
  createdAt: "",
  updatedAt: ""
});

const createTreatment = (
  id: string,
  visit: PatientVisit,
  status: TreatmentJobStatus,
  picAssistantId?: string
): TreatmentJob => ({
  id,
  visitId: visit.id,
  patientId: visit.patientId,
  branchId: visit.branchId,
  doctorId: "doctor-pic-correction-test",
  serviceId: "service-pic-correction-test",
  status,
  serviceNameSnapshot: "Treatment",
  doctorNameSnapshot: "Doctor",
  createdAt: visit.createdAt,
  updatedAt: visit.updatedAt,
  picAssistantId
});

const createAccrual = (id: string, staffId: string, sourceId: string): CompensationAccrual => ({
  id,
  staffId,
  branchId: "branch-pic-correction-test",
  ruleIdSnapshot: "ASSISTANT_TREATMENT_BASE_V1",
  ruleTypeSnapshot: "FIXED_PER_TREATMENT",
  valueSnapshot: 10000,
  baseAmountSnapshot: 0,
  amount: 10000,
  sourceId,
  accruedAt: "2027-02-12T03:00:00.000Z"
});

describe("Super Admin visit PIC correction", () => {
  it("updates every active treatment and removes only unlinked accruals for the old PIC", async () => {
    const database = MockDatabase.getInstance();
    const original = {
      visits: database.visits,
      treatmentJobs: database.treatmentJobs,
      staff: database.staff,
      assignments: database.visitAssistantAssignments,
      accruals: database.accruals,
      payrollItems: database.payrollItems,
      journals: database.journals
    };
    const visit = createVisit();
    const previousAssistant = createStaff("assistant-old-pic", visit.branchId);
    const nextAssistant = createStaff("assistant-new-pic", visit.branchId);
    const completed = createTreatment("treatment-pic-correction-completed", visit, TreatmentJobStatus.SELESAI, previousAssistant.id);
    const inProgress = createTreatment("treatment-pic-correction-active", visit, TreatmentJobStatus.DALAM_PROSES, previousAssistant.id);
    const cancelled = createTreatment("treatment-pic-correction-cancelled", visit, TreatmentJobStatus.DIBATALKAN, previousAssistant.id);
    const accrual = createAccrual("accrual-pic-correction", previousAssistant.id, completed.id);

    try {
      database.visits = [visit];
      database.treatmentJobs = [completed, inProgress, cancelled];
      database.staff = [previousAssistant, nextAssistant];
      database.visitAssistantAssignments = [{
        visitId: visit.id,
        assistantStaffId: previousAssistant.id,
        confirmedBy: "doctor-user",
        confirmedAt: visit.createdAt
      }];
      database.accruals = [accrual];
      database.payrollItems = [];
      database.journals = [];

      const result = await new MockTreatmentRepository().correctVisitAssistantPic(
        visit.id,
        nextAssistant.id,
        "PIC salah input",
        UserRole.SUPER_ADMIN
      );

      expect(result.updatedTreatmentCount).toBe(2);
      expect(result.removedAccrualCount).toBe(1);
      expect(database.treatmentJobs.map((item) => item.picAssistantId)).toEqual([
        nextAssistant.id,
        nextAssistant.id,
        previousAssistant.id
      ]);
      expect(database.visitAssistantAssignments[0].assistantStaffId).toBe(nextAssistant.id);
      expect(database.accruals).toEqual([]);
    } finally {
      database.visits = original.visits;
      database.treatmentJobs = original.treatmentJobs;
      database.staff = original.staff;
      database.visitAssistantAssignments = original.assignments;
      database.accruals = original.accruals;
      database.payrollItems = original.payrollItems;
      database.journals = original.journals;
    }
  });

  it("blocks correction when an old PIC accrual is already in payroll", async () => {
    const database = MockDatabase.getInstance();
    const original = {
      visits: database.visits,
      treatmentJobs: database.treatmentJobs,
      staff: database.staff,
      assignments: database.visitAssistantAssignments,
      accruals: database.accruals,
      payrollItems: database.payrollItems,
      journals: database.journals
    };
    const visit = createVisit();
    const previousAssistant = createStaff("assistant-old-payroll-pic", visit.branchId);
    const nextAssistant = createStaff("assistant-new-payroll-pic", visit.branchId);
    const treatment = createTreatment("treatment-pic-payroll-test", visit, TreatmentJobStatus.SELESAI, previousAssistant.id);
    const accrual = createAccrual("accrual-pic-payroll-test", previousAssistant.id, treatment.id);
    const payrollItem: PayrollItem = {
      id: "payroll-item-pic-test",
      payrollId: "payroll-pic-test",
      descriptionSnapshot: "Insentif tindakan",
      amountSnapshot: accrual.amount,
      type: "EARNING",
      sourceId: accrual.id
    };

    try {
      database.visits = [visit];
      database.treatmentJobs = [treatment];
      database.staff = [previousAssistant, nextAssistant];
      database.visitAssistantAssignments = [{
        visitId: visit.id,
        assistantStaffId: previousAssistant.id,
        confirmedBy: "doctor-user",
        confirmedAt: visit.createdAt
      }];
      database.accruals = [accrual];
      database.payrollItems = [payrollItem];
      database.journals = [];

      await expect(new MockTreatmentRepository().correctVisitAssistantPic(
        visit.id,
        nextAssistant.id,
        "PIC salah input",
        UserRole.SUPER_ADMIN
      )).rejects.toThrow("sudah masuk rincian payroll");
      expect(database.treatmentJobs[0].picAssistantId).toBe(previousAssistant.id);
      expect(database.accruals).toEqual([accrual]);
    } finally {
      database.visits = original.visits;
      database.treatmentJobs = original.treatmentJobs;
      database.staff = original.staff;
      database.visitAssistantAssignments = original.assignments;
      database.accruals = original.accruals;
      database.payrollItems = original.payrollItems;
      database.journals = original.journals;
    }
  });
});
