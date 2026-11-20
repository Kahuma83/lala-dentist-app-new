import { describe, expect, it } from "vitest";
import {
  EmploymentStatus,
  StaffPosition,
  TreatmentJobStatus,
  UserRole,
  VisitStatus,
  VisitType,
  type PatientVisit,
  type Staff,
  type TreatmentJob
} from "../types/domain";
import { MockDatabase } from "../data/mockData";
import { MockTreatmentRepository } from "../repositories/mockRepositories";

describe("visit assistant repository assignment", () => {
  it("allows an active branch admin from the visit branch to persist as PIC", async () => {
    const database = MockDatabase.getInstance();
    const original = {
      visits: database.visits,
      treatmentJobs: database.treatmentJobs,
      staff: database.staff,
      assignments: database.visitAssistantAssignments
    };
    const visit: PatientVisit = {
      id: "visit-branch-admin-assignment-test",
      patientId: "patient-test",
      branchId: "branch-1",
      visitDateTime: "2027-02-12T03:00:00.000Z",
      visitType: VisitType.BOOKING,
      visitStatus: VisitStatus.WAITING,
      bookingId: null,
      createdAt: "2027-02-12T03:00:00.000Z",
      updatedAt: "2027-02-12T03:00:00.000Z"
    };
    const treatment: TreatmentJob = {
      id: "treatment-branch-admin-test",
      visitId: visit.id,
      patientId: visit.patientId,
      branchId: visit.branchId,
      doctorId: "doctor-test",
      serviceId: "service-test",
      status: TreatmentJobStatus.BELUM_DIMULAI,
      serviceNameSnapshot: "Treatment",
      doctorNameSnapshot: "Doctor",
      priceSnapshot: 10000,
      estimatedDurationMinutes: 30,
      notes: "",
      createdAt: "2027-02-12T03:00:00.000Z",
      updatedAt: "2027-02-12T03:00:00.000Z"
    };
    const branchAdmin: Staff = {
      id: "branch-admin-test",
      employeeCode: "BA-TEST",
      fullName: "Branch Admin Test",
      phone: "",
      position: StaffPosition.BRANCH_ADMIN,
      employmentStatus: EmploymentStatus.ACTIVE,
      joinDate: "2027-01-01",
      active: true,
      branchId: visit.branchId,
      createdAt: "",
      updatedAt: ""
    };

    try {
      database.visits = [visit];
      database.treatmentJobs = [treatment];
      database.staff = [branchAdmin];
      database.visitAssistantAssignments = [];
      const repository = new MockTreatmentRepository();

      await repository.assignAssistantToVisit(
        visit.id,
        branchAdmin.id,
        UserRole.DOCTOR,
        visit.branchId,
        "doctor-test"
      );

      expect(database.treatmentJobs[0].picAssistantId).toBe(branchAdmin.id);
      expect(database.visitAssistantAssignments[0].assistantStaffId).toBe(branchAdmin.id);
    } finally {
      database.visits = original.visits;
      database.treatmentJobs = original.treatmentJobs;
      database.staff = original.staff;
      database.visitAssistantAssignments = original.assignments;
    }
  });

  it("applies one confirmed PIC to every treatment and locks it once treatment starts", async () => {
    const database = MockDatabase.getInstance();
    const original = {
      visits: database.visits,
      treatmentJobs: database.treatmentJobs,
      staff: database.staff,
      assignments: database.visitAssistantAssignments
    };
    const visit: PatientVisit = {
      id: "visit-assistant-assignment-test",
      patientId: "patient-test",
      branchId: "branch-1",
      visitDateTime: "2027-02-12T03:00:00.000Z",
      visitType: VisitType.BOOKING,
      visitStatus: VisitStatus.WAITING,
      bookingId: null,
      createdAt: "2027-02-12T03:00:00.000Z",
      updatedAt: "2027-02-12T03:00:00.000Z"
    };
    const createTreatment = (id: string): TreatmentJob => ({
      id,
      visitId: visit.id,
      patientId: visit.patientId,
      branchId: visit.branchId,
      doctorId: "doctor-test",
      serviceId: "service-test",
      status: TreatmentJobStatus.BELUM_DIMULAI,
      serviceNameSnapshot: "Treatment",
      doctorNameSnapshot: "Doctor",
      priceSnapshot: 10000,
      estimatedDurationMinutes: 30,
      notes: "",
      createdAt: "2027-02-12T03:00:00.000Z",
      updatedAt: "2027-02-12T03:00:00.000Z"
    });
    const assistant: Staff = {
      id: "assistant-test",
      employeeCode: "AS-TEST",
      fullName: "Assistant Test",
      phone: "",
      position: StaffPosition.ASSISTANT,
      employmentStatus: EmploymentStatus.ACTIVE,
      joinDate: "2027-01-01",
      active: true,
      branchId: visit.branchId,
      createdAt: "",
      updatedAt: ""
    };
    const otherAssistant: Staff = {
      ...assistant,
      id: "other-assistant-test",
      employeeCode: "AS-OTHER",
      fullName: "Other Assistant"
    };

    try {
      database.visits = [visit];
      database.treatmentJobs = [createTreatment("treatment-test-1"), createTreatment("treatment-test-2")];
      database.staff = [assistant, otherAssistant];
      database.visitAssistantAssignments = [];
      const repository = new MockTreatmentRepository();

      await repository.assignAssistantToVisit(
        visit.id,
        assistant.id,
        UserRole.DOCTOR,
        visit.branchId,
        "doctor-test"
      );

      expect(database.treatmentJobs.map((item) => item.picAssistantId)).toEqual([assistant.id, assistant.id]);
      await repository.startTreatmentJob(
        "treatment-test-1",
        UserRole.DOCTOR,
        visit.branchId,
        "doctor-test"
      );
      await expect(repository.assignAssistantToVisit(
        visit.id,
        otherAssistant.id,
        UserRole.DOCTOR,
        visit.branchId,
        "doctor-test"
      )).rejects.toThrow("sudah terkunci");
      expect(database.treatmentJobs[1].picAssistantId).toBe(assistant.id);
    } finally {
      database.visits = original.visits;
      database.treatmentJobs = original.treatmentJobs;
      database.staff = original.staff;
      database.visitAssistantAssignments = original.assignments;
    }
  });

  it("rejects an empty PIC before persisting a visit assignment", async () => {
    const database = MockDatabase.getInstance();
    const original = {
      visits: database.visits,
      treatmentJobs: database.treatmentJobs,
      staff: database.staff,
      assignments: database.visitAssistantAssignments
    };
    const visit: PatientVisit = {
      id: "visit-empty-pic-assignment-test",
      patientId: "patient-test",
      branchId: "branch-1",
      visitDateTime: "2027-02-12T03:00:00.000Z",
      visitType: VisitType.BOOKING,
      visitStatus: VisitStatus.WAITING,
      bookingId: null,
      createdAt: "2027-02-12T03:00:00.000Z",
      updatedAt: "2027-02-12T03:00:00.000Z"
    };

    try {
      database.visits = [visit];
      database.treatmentJobs = [];
      database.staff = [];
      database.visitAssistantAssignments = [];
      const repository = new MockTreatmentRepository();

      await expect(repository.assignAssistantToVisit(
        visit.id,
        "",
        UserRole.DOCTOR,
        visit.branchId,
        "doctor-test"
      )).rejects.toThrow("PIC kunjungan wajib diisi");
      expect(database.visitAssistantAssignments).toHaveLength(0);
    } finally {
      database.visits = original.visits;
      database.treatmentJobs = original.treatmentJobs;
      database.staff = original.staff;
      database.visitAssistantAssignments = original.assignments;
    }
  });
});
