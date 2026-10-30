import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

describe("Invoice after treatment completion migration", () => {
  const migration = fs.readFileSync(
    path.resolve(
      process.cwd(),
      "supabase/migrations/20270114000000_invoice_after_treatment_completion.sql"
    ),
    "utf-8"
  );

  it("allows administrators to return completed or legacy handed-over treatments before invoicing", () => {
    expect(migration).toContain("v_treatment.status NOT IN ('SELESAI', 'DISERAHKAN')");
    expect(migration).toContain("invoice.status <> 'CANCELLED'");
    expect(migration).toContain("SET status = 'PERLU_REVISI'");
    expect(migration).toContain("public.user_can_access_branch(v_treatment.branch_id)");
  });

  it("keeps a corrected treatment completed and eligible for invoicing", () => {
    expect(migration).toContain("status = 'SELESAI'");
    expect(migration).not.toContain("status = 'DISERAHKAN'");
    expect(migration).toContain("'REVISION_RESUBMITTED'");
    expect(migration).toContain("TO authenticated, service_role");
  });
});
