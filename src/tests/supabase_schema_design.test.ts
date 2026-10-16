import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("Lala Dentist Web Admin - Phase 9B.1 Supabase Database Schema & Relationship Design Tests", () => {
  const migrationPath = path.resolve(
    process.cwd(),
    "supabase/migrations/20260923000000_business_schema_foundation.sql"
  );
  let migrationContent = "";

  it("Step 1: Migration file 20260923000000_business_schema_foundation.sql must exist", () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
    migrationContent = fs.readFileSync(migrationPath, "utf-8");
    expect(migrationContent.length).toBeGreaterThan(1000);
  });

  // ===================================================================
  // SECTION 1: MASTER & RELATIONSHIP TABLES
  // ===================================================================

  it("Test 1: All required master and relationship tables must be defined", () => {
    const requiredTables = [
      "dental_branches",
      "master_services",
      "branch_service_tariffs",
      "staff",
      "dental_doctors",
      "doctor_branch_assignments",
      "doctor_schedules",
      "doctor_assistant_pairings",
      "work_shifts",
      "staff_shift_assignments",
      "patient_profiles"
    ];

    for (const table of requiredTables) {
      const tableRegex = new RegExp(`CREATE TABLE (IF NOT EXISTS )?public\\.${table}\\s*\\(`, "i");
      expect(
        tableRegex.test(migrationContent),
        `Table public.${table} must be defined in migration`
      ).toBe(true);
    }
  });

  // ===================================================================
  // SECTION 2: OPERATIONAL, CLINICAL & TRANSACTIONAL TABLES
  // ===================================================================

  it("Test 2: All required transactional, billing, HR, and accounting tables must be defined", () => {
    const requiredTables = [
      "bookings",
      "booking_confirmations_h1",
      "patient_visits",
      "queue_items",
      "treatment_jobs",
      "treatment_activities",
      "treatment_visit_links",
      "treatment_incentives",
      "invoices",
      "invoice_items",
      "payment_transactions",
      "staff_compensation_rules",
      "compensation_accruals",
      "attendances",
      "overtime_records",
      "monthly_payrolls",
      "payroll_items",
      "chart_of_accounts",
      "journal_entries",
      "journal_lines",
      "branch_expenses"
    ];

    for (const table of requiredTables) {
      const tableRegex = new RegExp(`CREATE TABLE (IF NOT EXISTS )?public\\.${table}\\s*\\(`, "i");
      expect(
        tableRegex.test(migrationContent),
        `Table public.${table} must be defined in migration`
      ).toBe(true);
    }
  });

  // ===================================================================
  // SECTION 3: PRIMARY KEY & UUID GENERATION
  // ===================================================================

  it("Test 3: Tables must use UUID primary keys with gen_random_uuid()", () => {
    const tables = [
      "dental_branches",
      "master_services",
      "staff",
      "dental_doctors",
      "patient_profiles",
      "bookings",
      "patient_visits",
      "treatment_jobs",
      "invoices",
      "payment_transactions",
      "attendances",
      "monthly_payrolls",
      "journal_entries",
      "journal_lines"
    ];

    for (const table of tables) {
      const pkRegex = new RegExp(
        `public\\.${table}[\\s\\S]*?id UUID PRIMARY KEY DEFAULT gen_random_uuid\\(\\)`,
        "i"
      );
      expect(
        pkRegex.test(migrationContent),
        `Table public.${table} must define 'id UUID PRIMARY KEY DEFAULT gen_random_uuid()'`
      ).toBe(true);
    }
  });

  // ===================================================================
  // SECTION 4: BRANCH ISOLATION & GLOBAL SCOPE VERIFICATION
  // ===================================================================

  it("Test 4: Branch-scoped tables must contain branch_id column", () => {
    const branchScopedTables = [
      "branch_service_tariffs",
      "doctor_branch_assignments",
      "doctor_schedules",
      "work_shifts",
      "staff_shift_assignments",
      "bookings",
      "booking_confirmations_h1",
      "patient_visits",
      "queue_items",
      "treatment_jobs",
      "treatment_incentives",
      "invoices",
      "payment_transactions",
      "attendances",
      "overtime_records",
      "monthly_payrolls",
      "journal_entries",
      "journal_lines",
      "branch_expenses"
    ];

    for (const table of branchScopedTables) {
      const branchColRegex = new RegExp(
        `public\\.${table}\\s*\\([\\s\\S]*?\\bbranch_id\\b`,
        "i"
      );
      expect(
        branchColRegex.test(migrationContent),
        `Branch-scoped table public.${table} must have 'branch_id' column`
      ).toBe(true);
    }
  });

  it("Test 5: PatientProfile must be GLOBAL and must NOT have permanent branch_id", () => {
    const patientTableMatch = migrationContent.match(
      /CREATE TABLE (?:IF NOT EXISTS )?public\.patient_profiles\s*\(([\s\S]*?)\);/i
    );
    expect(patientTableMatch).not.toBeNull();
    const patientBody = patientTableMatch![1];
    expect(
      /\bbranch_id\b/i.test(patientBody),
      "patient_profiles MUST NOT have permanent branch_id"
    ).toBe(false);
  });

  // ===================================================================
  // SECTION 5: SNAPSHOT FIELDS INTEGRITY
  // ===================================================================

  it("Test 6: Historical snapshot fields must be defined to preserve historical integrity", () => {
    // Treatment job snapshots
    expect(migrationContent).toContain("service_name_snapshot");
    expect(migrationContent).toContain("doctor_name_snapshot");

    // Invoice item snapshots
    expect(migrationContent).toContain("unit_price_snapshot");
    expect(migrationContent).toContain("description_snapshot");

    // Queue item snapshots
    expect(migrationContent).toContain("patient_name_snapshot");
    expect(migrationContent).toContain("branch_name_snapshot");

    // Payroll item snapshots
    expect(migrationContent).toContain("amount_snapshot");

    // Compensation snapshots
    expect(migrationContent).toContain("rule_type_snapshot");
    expect(migrationContent).toContain("value_snapshot");
    expect(migrationContent).toContain("base_amount_snapshot");

    // Overtime snapshots
    expect(migrationContent).toContain("hourly_rate_snapshot");
    expect(migrationContent).toContain("overtime_amount_snapshot");
  });

  // ===================================================================
  // SECTION 6: MODEL C & TREATMENT LOGGING
  // ===================================================================

  it("Test 7: TreatmentJob must support Model C PIC Assistant and separate Activity Actor", () => {
    const treatmentJobMatch = migrationContent.match(
      /CREATE TABLE (?:IF NOT EXISTS )?public\.treatment_jobs\s*\(([\s\S]*?)\);/i
    );
    expect(treatmentJobMatch).not.toBeNull();
    const jobBody = treatmentJobMatch![1];

    expect(jobBody).toContain("pic_assistant_id");
    expect(jobBody).toContain("assigned_doctor_id");

    const activityMatch = migrationContent.match(
      /CREATE TABLE (?:IF NOT EXISTS )?public\.treatment_activities\s*\(([\s\S]*?)\);/i
    );
    expect(activityMatch).not.toBeNull();
    const actBody = activityMatch![1];

    expect(actBody).toContain("actor_id");
    expect(actBody).toContain("actor_role");
    expect(actBody).toContain("activity_type");
  });

  it("Test 8: Multi-day treatment continuation must use treatment_visit_links with unique constraint", () => {
    const linkMatch = migrationContent.match(
      /CREATE TABLE (?:IF NOT EXISTS )?public\.treatment_visit_links\s*\(([\s\S]*?)\);/i
    );
    expect(linkMatch).not.toBeNull();
    const linkBody = linkMatch![1];

    expect(linkBody).toContain("treatment_job_id");
    expect(linkBody).toContain("visit_id");
    expect(linkBody).toMatch(/UNIQUE\s*\(\s*treatment_job_id\s*,\s*visit_id\s*\)/i);
  });

  // ===================================================================
  // SECTION 7: CLINICAL WALK-IN & H-1 CONFIRMATION
  // ===================================================================

  it("Test 9: PatientVisit walk-in constraint must enforce booking_id NULL for WALK_IN", () => {
    const visitMatch = migrationContent.match(
      /CREATE TABLE (?:IF NOT EXISTS )?public\.patient_visits\s*\(([\s\S]*?)\);/i
    );
    expect(visitMatch).not.toBeNull();
    const visitBody = visitMatch![1];

    expect(visitBody).toContain("visit_type");
    expect(visitBody).toContain("booking_id");
    expect(visitBody).toMatch(/visit_type\s*=\s*'WALK_IN'\s*AND\s*booking_id\s+IS\s+NULL/i);
  });

  it("Test 10: H-1 confirmation must be a separate entity with all 6 required statuses", () => {
    const h1Match = migrationContent.match(
      /CREATE TABLE (?:IF NOT EXISTS )?public\.booking_confirmations_h1\s*\(([\s\S]*?)\);/i
    );
    expect(h1Match).not.toBeNull();
    const h1Body = h1Match![1];

    const expectedStatuses = [
      "BELUM_DIHUBUNGI",
      "SUDAH_DIHUBUNGI",
      "DIKONFIRMASI",
      "MINTA_RESCHEDULE",
      "BATAL",
      "TIDAK_MERESPONS"
    ];

    for (const st of expectedStatuses) {
      expect(h1Body).toContain(st);
    }
  });

  // ===================================================================
  // SECTION 8: DOCTOR MULTI-BRANCH DESIGN
  // ===================================================================

  it("Test 11: Doctor multi-branch must be supported via doctor_branch_assignments and doctor_schedules", () => {
    expect(migrationContent).toContain("public.doctor_branch_assignments");
    expect(migrationContent).toContain("public.doctor_schedules");

    const assignMatch = migrationContent.match(
      /CREATE TABLE (?:IF NOT EXISTS )?public\.doctor_branch_assignments\s*\(([\s\S]*?)\);/i
    );
    expect(assignMatch![1]).toContain("doctor_id");
    expect(assignMatch![1]).toContain("branch_id");

    const schedMatch = migrationContent.match(
      /CREATE TABLE (?:IF NOT EXISTS )?public\.doctor_schedules\s*\(([\s\S]*?)\);/i
    );
    expect(schedMatch![1]).toContain("doctor_id");
    expect(schedMatch![1]).toContain("branch_id");
    expect(schedMatch![1]).toContain("date");
  });

  // ===================================================================
  // SECTION 9: ACCOUNTING INTEGRITY & BRANCH ISOLATION
  // ===================================================================

  it("Test 12: Accounting journals must enforce branch_id, balance check, and lines must be non-zero", () => {
    const journalMatch = migrationContent.match(
      /CREATE TABLE (?:IF NOT EXISTS )?public\.journal_entries\s*\(([\s\S]*?)\);/i
    );
    expect(journalMatch).not.toBeNull();
    const jBody = journalMatch![1];

    expect(jBody).toContain("branch_id");
    expect(jBody).toContain("total_debit");
    expect(jBody).toContain("total_credit");
    expect(jBody).toMatch(/status\s*!=\s*'POSTED'\s*OR\s*total_debit\s*=\s*total_credit/i);

    const lineMatch = migrationContent.match(
      /CREATE TABLE (?:IF NOT EXISTS )?public\.journal_lines\s*\(([\s\S]*?)\);/i
    );
    expect(lineMatch).not.toBeNull();
    const lBody = lineMatch![1];

    expect(lBody).toContain("branch_id");
    expect(lBody).toContain("account_id");
    expect(lBody).toContain("debit");
    expect(lBody).toContain("credit");
    expect(lBody).toMatch(/debit\s*>\s*0\s*OR\s*credit\s*>\s*0/i);
  });

  it("Test 13: General Ledger view v_general_ledger must be defined to derive reports per branch", () => {
    expect(migrationContent).toContain("public.v_general_ledger");
    expect(migrationContent).toContain("WHERE je.status = 'POSTED'");
  });

  // ===================================================================
  // SECTION 10: FOREIGN KEY SAFETY & IMMUTABILITY
  // ===================================================================

  it("Test 14: Historical business entities must NOT use ON DELETE CASCADE for master deletions", () => {
    // Invoices must restrict deletion of visits/patients/branches
    const invoiceBlock = migrationContent.match(
      /CREATE TABLE (?:IF NOT EXISTS )?public\.invoices\s*\(([\s\S]*?)\);/i
    );
    expect(invoiceBlock![1]).not.toMatch(/REFERENCES\s+public\.(?:dental_branches|patient_profiles|patient_visits)[^;]*?ON\s+DELETE\s+CASCADE/i);

    // Payments must restrict deletion of invoices/branches/staff
    const paymentBlock = migrationContent.match(
      /CREATE TABLE (?:IF NOT EXISTS )?public\.payment_transactions\s*\(([\s\S]*?)\);/i
    );
    expect(paymentBlock![1]).not.toMatch(/ON\s+DELETE\s+CASCADE/i);

    // Journal entries must restrict deletion of branches
    const journalBlock = migrationContent.match(
      /CREATE TABLE (?:IF NOT EXISTS )?public\.journal_entries\s*\(([\s\S]*?)\);/i
    );
    expect(journalBlock![1]).not.toMatch(/ON\s+DELETE\s+CASCADE/i);

    // Treatment jobs must restrict deletion of visits/patients/doctors/services
    const treatmentBlock = migrationContent.match(
      /CREATE TABLE (?:IF NOT EXISTS )?public\.treatment_jobs\s*\(([\s\S]*?)\);/i
    );
    expect(treatmentBlock![1]).not.toMatch(/ON\s+DELETE\s+CASCADE/i);
  });

  it("Test 15: Critical unique constraints must be declared", () => {
    expect(migrationContent).toMatch(/employee_code\s+VARCHAR\([0-9]+\)\s+NOT\s+NULL\s+UNIQUE/i);
    expect(migrationContent).toMatch(/doctor_code\s+VARCHAR\([0-9]+\)\s+NOT\s+NULL\s+UNIQUE/i);
    expect(migrationContent).toMatch(/medical_record_number\s+VARCHAR\([0-9]+\)\s+NOT\s+NULL\s+UNIQUE/i);
    expect(migrationContent).toMatch(/code\s+VARCHAR\([0-9]+\)\s+NOT\s+NULL\s+UNIQUE/i);
    expect(migrationContent).toMatch(/journal_number\s+VARCHAR\([0-9]+\)\s+NOT\s+NULL\s+UNIQUE/i);
    expect(migrationContent).toMatch(/uq_monthly_payroll\s+UNIQUE\s*\(\s*staff_id\s*,\s*month\s*,\s*year\s*\)/i);
    expect(migrationContent).toMatch(/uq_branch_service_tariff\s+UNIQUE\s*\(\s*branch_id\s*,\s*service_id\s*\)/i);
  });
});
