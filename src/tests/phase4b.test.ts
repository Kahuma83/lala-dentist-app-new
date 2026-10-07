import { describe, it, expect, beforeEach } from "vitest";
import { MockDatabase } from "../data/mockData";
import {
  MockTreatmentRepository,
  MockTreatmentActivityRepository
} from "../repositories/mockRepositories";
import {
  UserRole,
  TreatmentJobStatus,
  TreatmentActivityType
} from "../types/domain";
import { AppClock } from "../utils/clock";

describe("Phase 4B — TreatmentActivity & Actor Audit Trail", () => {
  let treatmentRepo: MockTreatmentRepository;
  let activityRepo: MockTreatmentActivityRepository;

  beforeEach(() => {
    AppClock.reset();
    MockDatabase.resetInstance();
    treatmentRepo = new MockTreatmentRepository();
    activityRepo = new MockTreatmentActivityRepository();
  });

  // 1. Basic Creation & Validations
  it("Test 1: Activity can be created successfully", async () => {
    const act = await activityRepo.addActivity({
      treatmentId: "treatment-job-1",
      actorId: "doc-syafira",
      actorRole: UserRole.DOCTOR,
      actorNameSnapshot: "drg. Syafira",
      activityType: TreatmentActivityType.PROGRESS,
      notes: "Pembersihan karang gigi bawah"
    });

    expect(act).toBeDefined();
    expect(act.id).toBeDefined();
    expect(act.notes).toBe("Pembersihan karang gigi bawah");
  });

  it("Test 2: Activity has treatmentId pointing to TreatmentJob", async () => {
    const act = await activityRepo.addActivity({
      treatmentId: "treatment-job-1",
      actorId: "assistant-clary",
      actorRole: UserRole.DOCTOR_ASSISTANT,
      actorNameSnapshot: "Siti Clary",
      activityType: TreatmentActivityType.STARTED
    });

    expect(act.treatmentId).toBe("treatment-job-1");
  });

  it("Test 3: Treatment must be valid (reject orphan activity)", async () => {
    await expect(
      activityRepo.addActivity({
        treatmentId: "non-existent-treatment-999",
        actorId: "doc-syafira",
        actorRole: UserRole.DOCTOR,
        activityType: TreatmentActivityType.PROGRESS
      })
    ).rejects.toThrow("TreatmentJob tidak ditemukan");
  });

  it("Test 4: Actor ID and Role must be provided", async () => {
    await expect(
      activityRepo.addActivity({
        treatmentId: "treatment-job-1",
        actorId: "",
        actorRole: UserRole.DOCTOR,
        activityType: TreatmentActivityType.PROGRESS
      })
    ).rejects.toThrow("Actor ID dan Actor Role wajib diisi");
  });

  it("Test 5: Actor role must be valid UserRole", async () => {
    const act = await activityRepo.addActivity({
      treatmentId: "treatment-job-1",
      actorId: "admin-1",
      actorRole: UserRole.BRANCH_ADMIN,
      activityType: TreatmentActivityType.OTHER,
      notes: "Log verifikasi admin"
    });

    expect(act.actorRole).toBe(UserRole.BRANCH_ADMIN);
  });

  it("Test 6: actorNameSnapshot is stored and preserved", async () => {
    const act = await activityRepo.addActivity({
      treatmentId: "treatment-job-1",
      actorId: "assistant-clary",
      actorRole: UserRole.DOCTOR_ASSISTANT,
      actorNameSnapshot: "Siti Clary (Assistant)",
      activityType: TreatmentActivityType.PROGRESS
    });

    expect(act.actorNameSnapshot).toBe("Siti Clary (Assistant)");
  });

  it("Test 7: activityAt uses AppClock timestamp", async () => {
    AppClock.setFixedTime("2026-09-21T10:15:00Z");
    const act = await activityRepo.addActivity({
      treatmentId: "treatment-job-1",
      actorId: "doc-syafira",
      actorRole: UserRole.DOCTOR,
      activityType: TreatmentActivityType.PROGRESS
    });

    expect(act.activityAt).toBe("2026-09-21T10:15:00Z");
  });

  it("Test 8: activityType must be valid", async () => {
    await expect(
      activityRepo.addActivity({
        treatmentId: "treatment-job-1",
        actorId: "doc-syafira",
        actorRole: UserRole.DOCTOR,
        activityType: "INVALID_TYPE" as any
      })
    ).rejects.toThrow("Jenis activityType tidak valid");
  });

  // 2. Activity Types Enum Validation
  it("Test 9: STARTED activity type valid", async () => {
    const act = await activityRepo.addActivity({
      treatmentId: "treatment-job-1",
      actorId: "doc-syafira",
      actorRole: UserRole.DOCTOR,
      activityType: TreatmentActivityType.STARTED
    });
    expect(act.activityType).toBe(TreatmentActivityType.STARTED);
  });

  it("Test 10: CONTINUED activity type valid", async () => {
    const act = await activityRepo.addActivity({
      treatmentId: "treatment-job-1",
      actorId: "doc-syafira",
      actorRole: UserRole.DOCTOR,
      activityType: TreatmentActivityType.CONTINUED
    });
    expect(act.activityType).toBe(TreatmentActivityType.CONTINUED);
  });

  it("Test 11: PROGRESS activity type valid", async () => {
    const act = await activityRepo.addActivity({
      treatmentId: "treatment-job-1",
      actorId: "doc-syafira",
      actorRole: UserRole.DOCTOR,
      activityType: TreatmentActivityType.PROGRESS
    });
    expect(act.activityType).toBe(TreatmentActivityType.PROGRESS);
  });

  it("Test 12: COMPLETED activity type valid", async () => {
    const act = await activityRepo.addActivity({
      treatmentId: "treatment-job-1",
      actorId: "doc-syafira",
      actorRole: UserRole.DOCTOR,
      activityType: TreatmentActivityType.COMPLETED
    });
    expect(act.activityType).toBe(TreatmentActivityType.COMPLETED);
  });

  it("Test 13: HANDED_OVER activity type valid", async () => {
    const act = await activityRepo.addActivity({
      treatmentId: "treatment-job-1",
      actorId: "doc-syafira",
      actorRole: UserRole.DOCTOR,
      activityType: TreatmentActivityType.HANDED_OVER
    });
    expect(act.activityType).toBe(TreatmentActivityType.HANDED_OVER);
  });

  it("Test 14: OTHER activity type valid", async () => {
    const act = await activityRepo.addActivity({
      treatmentId: "treatment-job-1",
      actorId: "doc-syafira",
      actorRole: UserRole.DOCTOR,
      activityType: TreatmentActivityType.OTHER
    });
    expect(act.activityType).toBe(TreatmentActivityType.OTHER);
  });

  // 3. Immutability
  it("Test 15: Activity repository does not expose update method (append-only)", () => {
    expect((activityRepo as any).updateActivity).toBeUndefined();
    expect((activityRepo as any).updateTreatmentActivity).toBeUndefined();
  });

  it("Test 16: Activity repository does not expose delete method (append-only)", () => {
    expect((activityRepo as any).deleteActivity).toBeUndefined();
    expect((activityRepo as any).deleteTreatmentActivity).toBeUndefined();
  });

  it("Test 17: Actor snapshot remains fixed even if doctor name in database is modified", async () => {
    const act = await activityRepo.addActivity({
      treatmentId: "treatment-job-1",
      actorId: "doc-syafira",
      actorRole: UserRole.DOCTOR,
      actorNameSnapshot: "drg. Syafira Original",
      activityType: TreatmentActivityType.STARTED
    });

    // Mutate mock database doctor list
    const doc = MockDatabase.getInstance().doctors.find((d) => d.id === "doc-syafira");
    if (doc) doc.name = "drg. Syafira Renamed";

    const retrieved = await activityRepo.getActivityById(act.id);
    expect(retrieved?.actorNameSnapshot).toBe("drg. Syafira Original");
  });

  it("Test 18: Activity timestamp is preserved on retrieval", async () => {
    AppClock.setFixedTime("2026-09-21T08:30:00Z");
    const act = await activityRepo.addActivity({
      treatmentId: "treatment-job-1",
      actorId: "doc-syafira",
      actorRole: UserRole.DOCTOR,
      activityType: TreatmentActivityType.PROGRESS
    });

    AppClock.setFixedTime("2026-09-21T12:00:00Z");
    const retrieved = await activityRepo.getActivityById(act.id);
    expect(retrieved?.activityAt).toBe("2026-09-21T08:30:00Z");
  });

  it("Test 19: Activity type remains fixed", async () => {
    const act = await activityRepo.addActivity({
      treatmentId: "treatment-job-1",
      actorId: "doc-syafira",
      actorRole: UserRole.DOCTOR,
      activityType: TreatmentActivityType.STARTED
    });

    const list = await activityRepo.listActivitiesByTreatment("treatment-job-1");
    const found = list.find((a) => a.id === act.id);
    expect(found?.activityType).toBe(TreatmentActivityType.STARTED);
  });

  it("Test 20: TreatmentId remains fixed and immutable", async () => {
    const act = await activityRepo.addActivity({
      treatmentId: "treatment-job-1",
      actorId: "doc-syafira",
      actorRole: UserRole.DOCTOR,
      activityType: TreatmentActivityType.PROGRESS
    });

    expect(act.treatmentId).toBe("treatment-job-1");
  });

  // 4. Automatic System Activities & State Machine Integration
  it("Test 21: startTreatmentJob automatically creates a STARTED activity", async () => {
    AppClock.setFixedTime("2026-09-21T09:00:00Z");
    await treatmentRepo.startTreatmentJob(
      "treatment-job-2",
      UserRole.DOCTOR,
      "branch-gebang",
      "doc-syafira",
      {
        actorId: "doc-syafira",
        actorRole: UserRole.DOCTOR,
        actorNameSnapshot: "drg. Syafira",
        notes: "Mulai penambalan"
      }
    );

    const list = await activityRepo.listActivitiesByTreatment("treatment-job-2");
    const startedAct = list.find((a) => a.activityType === TreatmentActivityType.STARTED);
    expect(startedAct).toBeDefined();
    expect(startedAct?.actorId).toBe("doc-syafira");
    expect(startedAct?.actorNameSnapshot).toBe("drg. Syafira");
    expect(startedAct?.notes).toBe("Mulai penambalan");
  });

  it("Test 22: completeTreatmentJob automatically creates a COMPLETED activity", async () => {
    AppClock.setFixedTime("2026-09-21T09:00:00Z");
    await treatmentRepo.startTreatmentJob("treatment-job-2", UserRole.SUPER_ADMIN);

    AppClock.setFixedTime("2026-09-21T09:45:00Z");
    await treatmentRepo.completeTreatmentJob("treatment-job-2", UserRole.SUPER_ADMIN);

    const list = await activityRepo.listActivitiesByTreatment("treatment-job-2");
    const completedAct = list.find((a) => a.activityType === TreatmentActivityType.COMPLETED);
    expect(completedAct).toBeDefined();
    expect(completedAct?.activityAt).toBe("2026-09-21T09:45:00Z");
  });

  it("Test 23: handOverTreatmentJob automatically creates a HANDED_OVER activity", async () => {
    AppClock.setFixedTime("2026-09-21T10:00:00Z");
    await treatmentRepo.handOverTreatmentJob("treatment-job-3", UserRole.SUPER_ADMIN);

    const list = await activityRepo.listActivitiesByTreatment("treatment-job-3");
    const handoverAct = list.find((a) => a.activityType === TreatmentActivityType.HANDED_OVER);
    expect(handoverAct).toBeDefined();
    expect(handoverAct?.activityAt).toBe("2026-09-21T10:00:00Z");
  });

  it("Test 24: Failed transition does NOT create any activity", async () => {
    const initialList = await activityRepo.listActivitiesByTreatment("treatment-job-2");

    // Try completing a job that hasn't been started (status = BELUM_DIMULAI)
    await expect(
      treatmentRepo.completeTreatmentJob("treatment-job-2", UserRole.SUPER_ADMIN)
    ).rejects.toThrow();

    const currentList = await activityRepo.listActivitiesByTreatment("treatment-job-2");
    expect(currentList.length).toBe(initialList.length);
  });

  it("Test 25: Double startTreatmentJob is rejected and does not duplicate STARTED activity", async () => {
    await treatmentRepo.startTreatmentJob("treatment-job-2", UserRole.SUPER_ADMIN);

    const listAfterFirst = await activityRepo.listActivitiesByTreatment("treatment-job-2");
    const startedCountInitial = listAfterFirst.filter(a => a.activityType === TreatmentActivityType.STARTED).length;

    // Second start call must fail
    await expect(
      treatmentRepo.startTreatmentJob("treatment-job-2", UserRole.SUPER_ADMIN)
    ).rejects.toThrow();

    const listAfterSecond = await activityRepo.listActivitiesByTreatment("treatment-job-2");
    const startedCountFinal = listAfterSecond.filter(a => a.activityType === TreatmentActivityType.STARTED).length;

    expect(startedCountFinal).toBe(startedCountInitial);
  });

  it("Test 26: Double completeTreatmentJob is rejected", async () => {
    await treatmentRepo.startTreatmentJob("treatment-job-2", UserRole.SUPER_ADMIN);
    await treatmentRepo.completeTreatmentJob("treatment-job-2", UserRole.SUPER_ADMIN);

    await expect(
      treatmentRepo.completeTreatmentJob("treatment-job-2", UserRole.SUPER_ADMIN)
    ).rejects.toThrow();
  });

  it("Test 27: Double handOverTreatmentJob is rejected", async () => {
    await treatmentRepo.handOverTreatmentJob("treatment-job-3", UserRole.SUPER_ADMIN);

    await expect(
      treatmentRepo.handOverTreatmentJob("treatment-job-3", UserRole.SUPER_ADMIN)
    ).rejects.toThrow();
  });

  // 5. Security Isolation
  it("Test 28: Branch Admin cannot view or add Activity for treatments in another branch", async () => {
    // treatment-job-4 is in branch-ambulu
    await expect(
      activityRepo.listActivitiesByTreatment(
        "treatment-job-4",
        UserRole.BRANCH_ADMIN,
        "branch-gebang"
      )
    ).rejects.toThrow("Branch Admin tidak dapat mengakses Activity cabang lain");

    await expect(
      activityRepo.addActivity(
        {
          treatmentId: "treatment-job-4",
          actorId: "admin-gebang",
          actorRole: UserRole.BRANCH_ADMIN,
          activityType: TreatmentActivityType.PROGRESS
        },
        UserRole.BRANCH_ADMIN,
        "branch-gebang"
      )
    ).rejects.toThrow("Branch Admin tidak dapat menambahkan Activity ke treatment cabang lain");
  });

  it("Test 29: Doctor cannot view or add Activity for treatment of another doctor", async () => {
    // treatment-job-4 is assigned to doctor-budi
    await expect(
      activityRepo.listActivitiesByTreatment(
        "treatment-job-4",
        UserRole.DOCTOR,
        "branch-ambulu",
        "doc-syafira" // doc-syafira is trying to access doctor-budi's treatment
      )
    ).rejects.toThrow("Dokter tidak dapat mengakses Activity treatment dokter lain");

    await expect(
      activityRepo.addActivity(
        {
          treatmentId: "treatment-job-4",
          actorId: "doc-syafira",
          actorRole: UserRole.DOCTOR,
          activityType: TreatmentActivityType.PROGRESS
        },
        UserRole.DOCTOR,
        "branch-ambulu",
        "doc-syafira"
      )
    ).rejects.toThrow("Dokter tidak dapat menambahkan Activity pada treatment dokter lain");
  });

  it("Test 30: Super Admin can access Activity across all branches", async () => {
    const listGebang = await activityRepo.listActivitiesByTreatment(
      "treatment-job-1",
      UserRole.SUPER_ADMIN
    );
    expect(listGebang).toBeDefined();

    const listAmbulu = await activityRepo.listActivitiesByTreatment(
      "treatment-job-4",
      UserRole.SUPER_ADMIN
    );
    expect(listAmbulu).toBeDefined();
  });

  // 6. Additional Functional & Model C Integrity Tests
  it("Test 31: Activity Actor can differ from PIC Assistant without altering picAssistantId", async () => {
    const tr = MockDatabase.getInstance().treatmentJobs.find((t) => t.id === "treatment-job-1");
    if (tr) tr.picAssistantId = "assistant-original";

    await activityRepo.addActivity({
      treatmentId: "treatment-job-1",
      actorId: "assistant-budi", // Different actor
      actorRole: UserRole.DOCTOR_ASSISTANT,
      actorNameSnapshot: "Budi (Asisten B)",
      activityType: TreatmentActivityType.PROGRESS
    });

    const refreshedTr = MockDatabase.getInstance().treatmentJobs.find((t) => t.id === "treatment-job-1");
    expect(refreshedTr?.picAssistantId).toBe("assistant-original");
  });

  it("Test 32: Timeline ordering sorts activities chronologically by activityAt", async () => {
    AppClock.setFixedTime("2026-09-21T08:00:00Z");
    await activityRepo.addActivity({
      treatmentId: "treatment-job-2",
      actorId: "assistant-1",
      actorRole: UserRole.DOCTOR_ASSISTANT,
      activityType: TreatmentActivityType.STARTED,
      customId: "act-order-1"
    });

    AppClock.setFixedTime("2026-09-21T08:15:00Z");
    await activityRepo.addActivity({
      treatmentId: "treatment-job-2",
      actorId: "doc-syafira",
      actorRole: UserRole.DOCTOR,
      activityType: TreatmentActivityType.PROGRESS,
      customId: "act-order-2"
    });

    AppClock.setFixedTime("2026-09-21T08:30:00Z");
    await activityRepo.addActivity({
      treatmentId: "treatment-job-2",
      actorId: "assistant-1",
      actorRole: UserRole.DOCTOR_ASSISTANT,
      activityType: TreatmentActivityType.COMPLETED,
      customId: "act-order-3"
    });

    const list = await activityRepo.listActivitiesByTreatment("treatment-job-2");
    expect(list[0].id).toBe("act-order-1");
    expect(list[1].id).toBe("act-order-2");
    expect(list[2].id).toBe("act-order-3");
  });

  it("Test 33: getActivityById enforces branch security", async () => {
    const act = await activityRepo.addActivity({
      treatmentId: "treatment-job-4", // branch-ambulu
      actorId: "doctor-budi",
      actorRole: UserRole.DOCTOR,
      activityType: TreatmentActivityType.PROGRESS
    });

    await expect(
      activityRepo.getActivityById(
        act.id,
        UserRole.BRANCH_ADMIN,
        "branch-gebang" // Wrong branch
      )
    ).rejects.toThrow("Branch Admin tidak dapat mengakses Activity cabang lain");
  });

  it("Test 34: Doctor Assistant can add activity for treatment in their branch", async () => {
    const act = await activityRepo.addActivity(
      {
        treatmentId: "treatment-job-1", // branch-gebang
        actorId: "assistant-clary",
        actorRole: UserRole.DOCTOR_ASSISTANT,
        actorNameSnapshot: "Siti Clary",
        activityType: TreatmentActivityType.PROGRESS,
        notes: "Membantu irigasi saluran akar"
      },
      UserRole.DOCTOR_ASSISTANT,
      "branch-gebang"
    );

    expect(act.actorRole).toBe(UserRole.DOCTOR_ASSISTANT);
    expect(act.notes).toBe("Membantu irigasi saluran akar");
  });

  it("Test 35: Reset instance clears custom test activities", async () => {
    await activityRepo.addActivity({
      treatmentId: "treatment-job-1",
      actorId: "actor-temp",
      actorRole: UserRole.SUPER_ADMIN,
      activityType: TreatmentActivityType.OTHER,
      customId: "temp-act-reset"
    });

    MockDatabase.resetInstance();
    const repo2 = new MockTreatmentActivityRepository();
    const list = await repo2.listActivitiesByTreatment("treatment-job-1");
    expect(list.find((a) => a.id === "temp-act-reset")).toBeUndefined();
  });
});
