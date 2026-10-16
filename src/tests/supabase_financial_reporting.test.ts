import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountType, JournalSourceType, UserRole } from "../types/domain";

const { mockSupabase } = vi.hoisted(() => ({
  mockSupabase: { from: vi.fn() }
}));

vi.mock("../lib/supabase", () => ({
  supabase: mockSupabase,
  supabaseWriteClient: mockSupabase,
  isSupabaseConfigured: true
}));

import { SupabaseAccountingRepository } from "../repositories/supabaseRepositories";

const gebangBranchId = "00000000-0000-4000-8000-000000000001";
const invoiceId = "00000000-0000-4000-8000-000000000020";
const paymentId = "00000000-0000-4000-8000-000000000021";
const revenueAccount = {
  id: "00000000-0000-4000-8000-000000000010",
  code: "4000",
  name: "Pendapatan Tindakan Medis",
  account_type: AccountType.REVENUE,
  account_category: "TREATMENT_REVENUE",
  normal_balance: "CREDIT",
  is_active: true
};
const receivableAccount = {
  id: "00000000-0000-4000-8000-000000000011",
  code: "1100",
  name: "Piutang Pasien",
  account_type: AccountType.ASSET,
  account_category: "ACCOUNTS_RECEIVABLE",
  normal_balance: "DEBIT",
  is_active: true
};
const ledgerRows = [
  {
    id: "line-invoice-revenue",
    branch_id: gebangBranchId,
    debit: 0,
    credit: 1700000,
    description: `Pendapatan Jasa Medis atas Invoice #${invoiceId}`,
    journal: {
      id: "journal-invoice",
      journal_number: "JRN-GEB-20261015-0001",
      journal_date: "2026-10-15",
      branch_id: gebangBranchId,
      description: "Pengakuan invoice",
      source_type: JournalSourceType.INVOICE,
      source_id: invoiceId,
      status: "POSTED",
      posted_at: "2026-10-15T09:00:00Z",
      created_at: "2026-10-15T09:00:00Z"
    },
    account: revenueAccount
  },
  {
    id: "line-invoice-ar",
    branch_id: gebangBranchId,
    debit: 1700000,
    credit: 0,
    description: `Piutang Pasien atas Invoice #${invoiceId}`,
    journal: {
      id: "journal-invoice",
      journal_number: "JRN-GEB-20261015-0001",
      journal_date: "2026-10-15",
      branch_id: gebangBranchId,
      description: "Pengakuan invoice",
      source_type: JournalSourceType.INVOICE,
      source_id: invoiceId,
      status: "POSTED",
      posted_at: "2026-10-15T09:00:00Z",
      created_at: "2026-10-15T09:00:00Z"
    },
    account: receivableAccount
  },
  {
    id: "line-payment-ar",
    branch_id: gebangBranchId,
    debit: 0,
    credit: 1700000,
    description: `Pelunasan Piutang Pasien Invoice #${invoiceId} - Pembayaran #${paymentId}`,
    journal: {
      id: "journal-payment",
      journal_number: "JRN-GEB-20261015-0002",
      journal_date: "2026-10-15",
      branch_id: gebangBranchId,
      description: "Penerimaan kas",
      source_type: JournalSourceType.PAYMENT,
      source_id: paymentId,
      status: "POSTED",
      posted_at: "2026-10-15T09:10:00Z",
      created_at: "2026-10-15T09:10:00Z"
    },
    account: receivableAccount
  }
];

describe("Supabase financial reporting", () => {
  const repository = new SupabaseAccountingRepository();

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase.from.mockImplementation((table: string) => {
      const rows = table === "journal_lines"
        ? ledgerRows
        : table === "chart_of_accounts"
          ? [revenueAccount, receivableAccount]
          : table === "invoices"
            ? [{ id: invoiceId, invoice_number: "INV/GEB/202610/0001" }]
            : table === "payment_transactions"
              ? [{ id: paymentId, receipt_number: "KWT/GEB/202610/0001", invoice_id: invoiceId }]
          : [];
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        neq: vi.fn(() => query),
        gte: vi.fn(() => query),
        lte: vi.fn(() => query),
        order: vi.fn(() => query),
        in: vi.fn(() => query),
        maybeSingle: vi.fn(async () => ({
          data: table === "dental_branches" ? { name: "Cabang Gebang" } : null,
          error: null
        })),
        then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
          Promise.resolve({ data: rows, error: null }).then(resolve, reject)
      };
      return query;
    });
  });

  it("builds branch-scoped ledger history from posted journal lines", async () => {
    const entries = await repository.getLedgerEntries(
      { branchId: gebangBranchId },
      UserRole.BRANCH_ADMIN,
      gebangBranchId
    );

    expect(entries).toHaveLength(3);
    expect(entries.every((entry) => entry.branchId === gebangBranchId)).toBe(true);
    expect(entries.find((entry) =>
      entry.sourceType === JournalSourceType.INVOICE && entry.accountCode === "4000"
    )?.credit).toBe(1700000);
    expect(entries.find((entry) => entry.sourceType === JournalSourceType.PAYMENT)?.journalNumber)
      .toBe("JRN-GEB-20261015-0002");
    expect(entries.find((entry) => entry.accountCode === "4000")?.description)
      .toContain("INV/GEB/202610/0001");
    expect(entries.find((entry) => entry.sourceType === JournalSourceType.PAYMENT)?.description)
      .toContain("INV/GEB/202610/0001");
    expect(entries.find((entry) => entry.sourceType === JournalSourceType.PAYMENT)?.description)
      .toContain("KWT/GEB/202610/0001");
    expect(entries.find((entry) => entry.sourceType === JournalSourceType.PAYMENT)?.description)
      .not.toContain(invoiceId);
  });

  it("calculates P&L from posted revenue/expense lines and excludes balance-sheet accounts", async () => {
    const report = await repository.getIncomeStatementReport(
      { branchId: gebangBranchId },
      UserRole.BRANCH_ADMIN,
      gebangBranchId
    );

    expect(report.branchName).toBe("Cabang Gebang");
    expect(report.totalRevenue).toBe(1700000);
    expect(report.totalExpense).toBe(0);
    expect(report.netIncome).toBe(1700000);
    expect(report.revenues).toHaveLength(1);
  });

  it("calculates account balances from the matching account's ledger movements", async () => {
    const balance = await repository.getAccountBalance(
      revenueAccount.id,
      gebangBranchId,
      undefined,
      UserRole.BRANCH_ADMIN,
      gebangBranchId
    );

    expect(balance.accountCode).toBe("4000");
    expect(balance.totalCredit).toBe(1700000);
    expect(balance.balance).toBe(1700000);
  });
});
