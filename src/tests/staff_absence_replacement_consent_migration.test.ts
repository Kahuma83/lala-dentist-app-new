import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("Staff absence replacement consent migration", () => {
  const migration = fs.readFileSync(
    path.resolve(process.cwd(), "supabase/migrations/20270201000000_staff_absence_replacement_consent.sql"),
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

  it("stores the applicant's replacement choice and the recipient's recorded response", () => {
    expect(migration).toMatch(/proposed_replacement_staff_id UUID/i);
    expect(migration).toMatch(/replacement_response_status TEXT NOT NULL DEFAULT 'NOT_REQUIRED'/i);
    expect(migration).toMatch(/replacement_responded_by UUID/i);
    expect(migration).toMatch(/replacement_responded_at TIMESTAMPTZ/i);
    expect(migration).toMatch(/replacement_selection_finalized BOOLEAN NOT NULL DEFAULT false/i);
  });

  it("offers only active same-position replacements with schedule availability", () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.get_absence_replacement_candidates/i);
    expect(migration).toMatch(/candidate\.position = v_requester\.position/i);
    expect(migration).toMatch(/candidate_account\.active[\s\S]*?candidate_account\.auth_user_id IS NOT NULL/i);
    expect(migration).toMatch(/candidate\.branch_id = v_requester\.branch_id/i);
    expect(migration).toMatch(/candidate_schedule\.date = absent_schedule\.date/i);
    expect(migration).toMatch(/candidate_assignment\.date = absent_assignment\.date/i);
  });

  it("lets only the proposed replacement respond and exposes that request in the employee portal", () => {
    expect(migration).toMatch(/proposed_replacement_staff_id = public\.get_user_staff_id\(\)/i);
    expect(migration).toMatch(/replacement_response_status = CASE WHEN p_accept THEN 'ACCEPTED' ELSE 'DECLINED' END/i);
    expect(migration).toMatch(/proposed_replacement_staff_id = public\.get_user_staff_id\(\)[\s\S]*?OR public\.is_super_admin\(\)/i);
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.submit_staff_absence_request\([\s\S]*?submit_staff_absence_request_with_replacement/i);
    expect(portal).toMatch(/submit_staff_absence_request_with_replacement/);
    expect(portal).toMatch(/get_staff_absence_replacement_inbox/);
    expect(portal).toMatch(/respond_to_staff_absence_replacement/);
  });

  it("prevents approval or assignment until the selected replacement consents", () => {
    expect(migration).toMatch(/v_request\.replacement_response_status <> 'ACCEPTED'/i);
    expect(migration).toMatch(/verify_absence_replacement_consent[\s\S]*?DEFERRABLE INITIALLY DEFERRED/i);
    expect(manager).toMatch(/replacement_response_status === "ACCEPTED"/);
    expect(manager).toMatch(/disabled=\{busyId === request\.id \|\| !canApprove\}/);
  });
});
