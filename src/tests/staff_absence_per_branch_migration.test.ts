import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("Staff absence per-branch migration", () => {
  const migration = fs.readFileSync(
    path.resolve(process.cwd(), "supabase/migrations/20270209000000_staff_absence_per_branch.sql"),
    "utf-8"
  );
  const portal = fs.readFileSync(
    path.resolve(process.cwd(), "attendance-portal/src/AttendancePortal.tsx"),
    "utf-8"
  );
  const manager = fs.readFileSync(
    path.resolve(process.cwd(), "src/components/AbsenceRequestManager.tsx"),
    "utf-8"
  );

  it("stores an explicit request branch and backfills only unambiguous legacy requests", () => {
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public\.dental_branches/i);
    expect(migration).toMatch(/HAVING count\(DISTINCT branch_id\) = 1/i);
    expect(migration).toMatch(/CREATE TRIGGER require_absence_request_branch[\s\S]*?BEFORE INSERT/i);
  });

  it("exposes only the applicant's scheduled branches and requires branch-specific submission", () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.get_absence_request_branches/i);
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.submit_staff_absence_request_with_replacement\([\s\S]*?p_branch_id UUID/i);
    expect(migration).toMatch(/schedules\.branch_id = p_branch_id[\s\S]*?schedules\.date BETWEEN p_start_date AND p_end_date/i);
    expect(migration).toMatch(/request\.branch_id = p_branch_id OR request\.branch_id IS NULL/i);
    expect(portal).toMatch(/get_absence_request_branches/);
    expect(portal).toMatch(/p_branch_id: absenceForm\.branchId/);
    expect(portal).toMatch(/branchId: ""/);
  });

  it("limits approval attendance and replacement assignments to the selected branch", () => {
    expect(migration).toMatch(/ssa\.branch_id = v_request\.branch_id/i);
    expect(migration).toMatch(/ds\.branch_id = v_request\.branch_id/i);
    expect(migration).toMatch(/Penugasan pengganti harus berada di cabang yang sama dengan pengajuan/i);
    expect(migration).toMatch(/candidate_schedule\.branch_id = absent_schedule\.branch_id/i);
  });

  it("allows Super Admin to resolve old pending requests whose branch cannot be inferred", () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.assign_staff_absence_request_branch/i);
    expect(manager).toMatch(/assign_staff_absence_request_branch/);
    expect(manager).toMatch(/Cabang pengajuan lama/);
  });

  it("shows branch names in employee absence history and replacement consent inbox", () => {
    expect(portal).toMatch(/name: branch\.branch_name/);
    expect(portal).toMatch(/row\.branchName/);
    expect(portal).toMatch(/request\.branchName/);
    expect(manager).toMatch(/request\.branch_id \? branchById\.get\(request\.branch_id\)/);
  });
});
