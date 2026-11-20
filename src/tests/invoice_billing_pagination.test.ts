import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { MockInvoiceRepository } from "../repositories/mockRepositories";
import { InvoiceStatus } from "../types/domain";
import { MockDatabase } from "../data/mockData";

describe("invoice billing pagination", () => {
  it("returns only the requested page while preserving filtered totals", async () => {
    const repository = new MockInvoiceRepository();
    const allInvoices = await repository.getInvoices();

    const firstPage = await repository.getInvoicePage({
      offset: 0,
      limit: 1,
      status: "ALL"
    });

    expect(firstPage.totalCount).toBe(allInvoices.length);
    expect(firstPage.invoices).toHaveLength(Math.min(1, allInvoices.length));
    expect(firstPage.summary.totalInvoiced).toBe(
      allInvoices.reduce((sum, invoice) =>
        sum + (invoice.status === InvoiceStatus.CANCELLED ? 0 : invoice.netAmount), 0)
    );
  });

  it("restricts the all-date unpaid view to open and partially paid invoices", async () => {
    const repository = new MockInvoiceRepository();

    const unpaidPage = await repository.getInvoicePage({
      offset: 0,
      limit: 100,
      status: "UNPAID"
    });

    expect(unpaidPage.invoices.every((invoice) =>
      invoice.status === InvoiceStatus.OPEN || invoice.status === InvoiceStatus.PARTIALLY_PAID
    )).toBe(true);
    expect(unpaidPage.summary.openCount).toBe(unpaidPage.totalCount);
  });

  it("searches invoice pages by patient name", async () => {
    const repository = new MockInvoiceRepository();
    const database = MockDatabase.getInstance();
    const invoice = database.invoices.find((item) =>
      database.patients.some((patient) =>
        patient.id === item.patientId && Boolean(patient.fullName || patient.name)
      )
    );
    expect(invoice).toBeDefined();
    const patient = database.patients.find((item) => item.id === invoice?.patientId);
    const patientName = patient?.fullName || patient?.name || "";

    const result = await repository.getInvoicePage({
      offset: 0,
      limit: 50,
      search: patientName
    });

    expect(result.invoices.some((item) => item.id === invoice?.id)).toBe(true);
  });

  it("uses a security-invoker RPC with server-side filtering and paging", () => {
    const migration = fs.readFileSync(
      path.resolve(process.cwd(), "supabase/manual-migrations/20270307000000_invoice_billing_pagination.sql"),
      "utf-8"
    );

    expect(migration).toContain("SECURITY INVOKER");
    expect(migration).toContain("auth.uid() IS NULL");
    expect(migration).toContain("i.invoice_date >= p_start_date");
    expect(migration).toContain("patient.full_name");
    expect(migration).toContain("OFFSET p_offset");
    expect(migration).toContain("LIMIT p_limit");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.get_invoice_billing_page");
  });
});
