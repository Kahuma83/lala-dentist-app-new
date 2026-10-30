import { beforeEach, describe, expect, it } from "vitest";
import { MockDatabase } from "../data/mockData";
import {
  MockTreatmentActivityRepository,
  MockTreatmentRepository
} from "../repositories/mockRepositories";
import {
  InvoiceStatus,
  TreatmentActivityType,
  TreatmentJobStatus,
  UserRole
} from "../types/domain";

describe("Cashier treatment revision workflow", () => {
  let db: MockDatabase;
  let treatmentRepo: MockTreatmentRepository;
  let activityRepo: MockTreatmentActivityRepository;

  beforeEach(() => {
    MockDatabase.resetInstance();
    db = MockDatabase.getInstance();
    treatmentRepo = new MockTreatmentRepository();
    activityRepo = new MockTreatmentActivityRepository();
    const treatment = db.treatmentJobs.find((job) => job.id === "treatment-job-3");
    if (!treatment) throw new Error("Revision test treatment fixture is missing");
    treatment.visitId = "visit-for-cashier-revision";
    treatment.status = TreatmentJobStatus.DISERAHKAN;
    treatment.notes = "Catatan tindakan awal";
  });

  it("cashier returns a handed-over treatment with a required reason and audit activity", async () => {
    const returned = await treatmentRepo.returnTreatmentToDoctor(
      "treatment-job-3",
      "Mohon koreksi ejaan pada catatan tindakan",
      UserRole.BRANCH_ADMIN,
      "branch-gebang",
      "admin-test",
      { actorId: "admin-test", actorRole: UserRole.BRANCH_ADMIN, actorNameSnapshot: "Admin Kasir" }
    );

    expect(returned.status).toBe(TreatmentJobStatus.PERLU_REVISI);
    expect(returned.returnReason).toBe("Mohon koreksi ejaan pada catatan tindakan");
    expect(returned.returnedAt).toBeDefined();
    const activities = await activityRepo.listActivitiesByTreatment(returned.id);
    expect(activities.at(-1)?.activityType).toBe(TreatmentActivityType.RETURNED_TO_DOCTOR);
  });

  it("rejects return by non-cashier roles and after an invoice has been issued", async () => {
    await expect(
      treatmentRepo.returnTreatmentToDoctor(
        "treatment-job-3",
        "Koreksi",
        UserRole.DOCTOR,
        "branch-gebang",
        "doc-syafira"
      )
    ).rejects.toThrow("Hanya petugas kasir");

    const treatment = db.treatmentJobs.find((job) => job.id === "treatment-job-3");
    const invoice = db.invoices[0];
    if (!treatment || !invoice) throw new Error("Invoice test fixture is missing");
    db.invoices.push({
      ...invoice,
      id: "invoice-for-cashier-revision",
      visitId: treatment.visitId,
      status: InvoiceStatus.OPEN
    });

    await expect(
      treatmentRepo.returnTreatmentToDoctor(
        treatment.id,
        "Koreksi",
        UserRole.BRANCH_ADMIN,
        "branch-gebang",
        "admin-test"
      )
    ).rejects.toThrow("setelah invoice diterbitkan");
  });

  it("assigned doctor corrects notes and resubmits without re-completing the treatment", async () => {
    await treatmentRepo.returnTreatmentToDoctor(
      "treatment-job-3",
      "Perbaiki ejaan catatan",
      UserRole.BRANCH_ADMIN,
      "branch-gebang",
      "admin-test"
    );
    const completedAt = db.treatmentJobs.find((job) => job.id === "treatment-job-3")?.completedAt;

    await expect(
      treatmentRepo.resubmitTreatmentToCashier(
        "treatment-job-3",
        "Catatan diperbaiki",
        "service-scaling",
        175000,
        UserRole.DOCTOR,
        "branch-gebang",
        "doctor-lain"
      )
    ).rejects.toThrow("dokter penanggung jawab");

    const resubmitted = await treatmentRepo.resubmitTreatmentToCashier(
      "treatment-job-3",
      "Catatan tindakan telah diperbaiki",
      "service-scaling",
      175000,
      UserRole.DOCTOR,
      "branch-gebang",
      "doc-syafira",
      { actorId: "doc-syafira", actorRole: UserRole.DOCTOR, actorNameSnapshot: "drg. Syafira" }
    );

    expect(resubmitted.status).toBe(TreatmentJobStatus.DISERAHKAN);
    expect(resubmitted.notes).toBe("Catatan tindakan telah diperbaiki");
    expect(resubmitted.serviceId).toBe("service-scaling");
    expect(resubmitted.serviceNameSnapshot).toBe("Scaling");
    expect(resubmitted.priceSnapshot).toBe(175000);
    expect(resubmitted.completedAt).toBe(completedAt);
    const activities = await activityRepo.listActivitiesByTreatment(resubmitted.id);
    expect(activities.at(-1)?.activityType).toBe(TreatmentActivityType.REVISION_RESUBMITTED);
  });
});
