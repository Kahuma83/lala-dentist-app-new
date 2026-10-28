import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { MockDatabase } from "../data/mockData";
import { MockVisitRepository, MockQueueRepository } from "../repositories/mockRepositories";
import { UserRole, VisitType } from "../types/domain";

describe("patient check-in role restriction", () => {
  it("allows only branch admins and super admins in the server RPC", () => {
    const migration = fs.readFileSync(path.resolve(
      process.cwd(),
      "supabase/migrations/20261228000000_atomic_patient_checkin.sql"
    ), "utf8");

    expect(migration).toContain("v_role NOT IN ('SUPER_ADMIN', 'BRANCH_ADMIN')");
    expect(migration).not.toContain("v_role NOT IN ('SUPER_ADMIN', 'BRANCH_ADMIN', 'DOCTOR'");
    expect(migration).toContain("check-in hanya dapat dilakukan Admin Cabang atau Super Admin");
  });

  it("rejects clinical staff check-in in the mock repository", async () => {
    MockDatabase.resetInstance();
    MockDatabase.getInstance().queueItems = [];
    const visit = await new MockVisitRepository().createVisit({
      patientId: "patient-1",
      branchId: "branch-gebang",
      visitType: VisitType.WALK_IN,
      bookingId: null,
      doctorId: "doc-syafira"
    });

    await expect(new MockQueueRepository().checkInVisitToQueue(
      visit.id,
      UserRole.DOCTOR
    )).rejects.toThrow("Check-in hanya dapat dilakukan Admin Cabang atau Super Admin");
    await expect(new MockQueueRepository().checkInVisitToQueue(
      visit.id,
      UserRole.DOCTOR_ASSISTANT
    )).rejects.toThrow("Check-in hanya dapat dilakukan Admin Cabang atau Super Admin");

    expect(MockDatabase.getInstance().queueItems).toHaveLength(0);
  });
});
