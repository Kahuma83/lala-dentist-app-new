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

    try {
      database.visits = [visit];
      database.treatmentJobs = [createTreatment("treatment-test-1"), createTreatment("treatment-test-2")];
      database.staff = [assistant];
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
        null,
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
});
