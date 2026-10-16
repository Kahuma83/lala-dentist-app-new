import { describe, it, expect, beforeEach } from "vitest";
import { MockDatabase } from "../data/mockData";
import { MockAccountingRepository, AppClock } from "../repositories/mockRepositories";
import {
  AccountType,
  AccountCategory,
  NormalBalance,
  JournalStatus,
  JournalSourceType,
  UserRole
} from "../types/domain";

describe("Accounting Phase 1: Chart of Accounts, Journal Engine & General Ledger Test Suite", () => {
  let accountingRepo: MockAccountingRepository;

  beforeEach(() => {
    MockDatabase.resetInstance();
    AppClock.reset();
    accountingRepo = new MockAccountingRepository();
  });

  // =========================================================================
  // 1. CHART OF ACCOUNTS (COA) TESTS
  // =========================================================================
  it("Test 1: List all default initial Chart of Accounts", async () => {
    const accounts = await accountingRepo.getAccounts();
    expect(accounts.length).toBeGreaterThanOrEqual(14);
    expect(accounts.some((a) => a.code === "1000")).toBe(true); // Kas
    expect(accounts.some((a) => a.code === "4000")).toBe(true); // Pendapatan
    expect(accounts.some((a) => a.code === "5000")).toBe(true); // Beban Gaji
  });

  it("Test 2: Create a new Asset account with DEBIT normal balance", async () => {
    const acc = await accountingRepo.createAccount({
      code: "1030",
      name: "Kas Kecil Cabang Muktisari",
      accountType: AccountType.ASSET,
      accountCategory: AccountCategory.CASH,
      normalBalance: NormalBalance.DEBIT,
      description: "Kas operasional kasir cabang Muktisari",
      isActive: true
    });

    expect(acc.id).toBeDefined();
    expect(acc.code).toBe("1030");
    expect(acc.accountType).toBe(AccountType.ASSET);
    expect(acc.normalBalance).toBe(NormalBalance.DEBIT);

    const fetched = await accountingRepo.getAccountById(acc.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.name).toBe("Kas Kecil Cabang Muktisari");
  });

  it("Test 3: Create a new Liability account with CREDIT normal balance", async () => {
    const acc = await accountingRepo.createAccount({
      code: "2050",
      name: "Hutang PPh 21 Dokter",
      accountType: AccountType.LIABILITY,
      accountCategory: AccountCategory.TAX_PAYABLE,
      normalBalance: NormalBalance.CREDIT,
      description: "Titipan pajak penghasilan dokter",
      isActive: true
    });

    expect(acc.code).toBe("2050");
    expect(acc.accountType).toBe(AccountType.LIABILITY);
    expect(acc.normalBalance).toBe(NormalBalance.CREDIT);
  });

  it("Test 4: Create a new Expense account with DEBIT normal balance", async () => {
    const acc = await accountingRepo.createAccount({
      code: "5070",
      name: "Beban Pelatihan & Seminar Dokter",
      accountType: AccountType.EXPENSE,
      accountCategory: AccountCategory.OTHER_OPERATING_EXPENSE,
      normalBalance: NormalBalance.DEBIT,
      description: "Biaya workshop & seminar berkelanjutan dokter gigi",
      isActive: true
    });

    expect(acc.code).toBe("5070");
    expect(acc.accountType).toBe(AccountType.EXPENSE);
    expect(acc.normalBalance).toBe(NormalBalance.DEBIT);
  });

  it("Test 5: Validation - Reject duplicate account code", async () => {
    await expect(
      accountingRepo.createAccount({
        code: "1000", // Already exists (Kas)
        name: "Kas Duplikat",
        accountType: AccountType.ASSET,
        accountCategory: AccountCategory.CASH,
        normalBalance: NormalBalance.DEBIT
      })
    ).rejects.toThrow(/sudah digunakan/i);
  });

  it("Test 6: Validation - Reject empty code or name", async () => {
    await expect(
      accountingRepo.createAccount({
        code: "",
        name: "Kas Tanpa Kode",
        accountType: AccountType.ASSET,
        accountCategory: AccountCategory.CASH,
        normalBalance: NormalBalance.DEBIT
      })
    ).rejects.toThrow(/wajib diisi/i);

    await expect(
      accountingRepo.createAccount({
        code: "1099",
        name: "",
        accountType: AccountType.ASSET,
        accountCategory: AccountCategory.CASH,
        normalBalance: NormalBalance.DEBIT
      })
    ).rejects.toThrow(/wajib diisi/i);
  });

  it("Test 7: Update account information and toggle active status", async () => {
    const acc = await accountingRepo.getAccountByCode("1000");
    expect(acc).not.toBeNull();

    const updated = await accountingRepo.updateAccount(acc!.id, {
      name: "Kas Tunai Utama Klinik",
      description: "Kas kasir dan brankas fisik",
      isActive: false
    });

    expect(updated.name).toBe("Kas Tunai Utama Klinik");
    expect(updated.description).toBe("Kas kasir dan brankas fisik");
    expect(updated.isActive).toBe(false);

    // Filter active only
    const activeAccounts = await accountingRepo.getAccounts({ isActive: true });
    expect(activeAccounts.some((a) => a.id === acc!.id)).toBe(false);
  });

  it("Test 8: Filter accounts by AccountType", async () => {
    const assets = await accountingRepo.getAccounts({ accountType: AccountType.ASSET });
    expect(assets.length).toBeGreaterThan(0);
    expect(assets.every((a) => a.accountType === AccountType.ASSET)).toBe(true);

    const expenses = await accountingRepo.getAccounts({ accountType: AccountType.EXPENSE });
    expect(expenses.length).toBeGreaterThan(0);
    expect(expenses.every((a) => a.accountType === AccountType.EXPENSE)).toBe(true);
  });

  // =========================================================================
  // 2. JOURNAL DOUBLE-ENTRY & VALIDATION TESTS
  // =========================================================================
  it("Test 9: Create draft journal with balanced lines successfully", async () => {
    const journal = await accountingRepo.createDraftJournal(
      {
        journalDate: "2026-03-31",
        branchId: "branch-gebang",
        description: "Penerimaan kas tindakan scaling",
        sourceType: JournalSourceType.MANUAL,
        lines: [
          {
            accountId: "coa-1000", // Kas
            debit: 250000,
            credit: 0,
            description: "Penerimaan tunai pasien"
          },
          {
            accountId: "coa-4000", // Pendapatan Tindakan
            debit: 0,
            credit: 250000,
            description: "Pendapatan scaling"
          }
        ]
      },
      "Super Admin"
    );

    expect(journal.id).toBeDefined();
    expect(journal.journalNumber).toMatch(/^JRN-GEB-\d{8}-\d{4}$/);
    expect(journal.status).toBe(JournalStatus.DRAFT);
    expect(journal.totalDebit).toBe(250000);
    expect(journal.totalCredit).toBe(250000);
    expect(journal.lines.length).toBe(2);
  });

  it("Test 10: Validation - Reject journal with fewer than 2 lines", async () => {
    await expect(
      accountingRepo.createDraftJournal(
        {
          journalDate: "2026-03-31",
          branchId: "branch-gebang",
          description: "Jurnal 1 baris",
          sourceType: JournalSourceType.MANUAL,
          lines: [
            {
              accountId: "coa-1000",
              debit: 100000,
              credit: 0
            }
          ]
        },
        "Super Admin"
      )
    ).rejects.toThrow(/minimal 2 baris/i);
  });

  it("Test 11: Validation - Reject unbalanced journal (Debit != Credit)", async () => {
    await expect(
      accountingRepo.createDraftJournal(
        {
          journalDate: "2026-03-31",
          branchId: "branch-gebang",
          description: "Jurnal tidak seimbang",
          sourceType: JournalSourceType.MANUAL,
          lines: [
            {
              accountId: "coa-1000",
              debit: 300000,
              credit: 0
            },
            {
              accountId: "coa-4000",
              debit: 0,
              credit: 250000
            }
          ]
        },
        "Super Admin"
      )
    ).rejects.toThrow(/tidak seimbang/i);
  });

  it("Test 12: Validation - Reject zero or negative debit/credit amounts", async () => {
    await expect(
      accountingRepo.createDraftJournal(
        {
          journalDate: "2026-03-31",
          branchId: "branch-gebang",
          description: "Jurnal nilai negatif",
          sourceType: JournalSourceType.MANUAL,
          lines: [
            {
              accountId: "coa-1000",
              debit: -100000,
              credit: 0
            },
            {
              accountId: "coa-4000",
              debit: 0,
              credit: -100000
            }
          ]
        },
        "Super Admin"
      )
    ).rejects.toThrow(/tidak boleh bernilai negatif/i);
  });

  it("Test 13: Validation - Reject line with both debit > 0 and credit > 0", async () => {
    await expect(
      accountingRepo.createDraftJournal(
        {
          journalDate: "2026-03-31",
          branchId: "branch-gebang",
          description: "Jurnal debit dan credit sekaligus",
          sourceType: JournalSourceType.MANUAL,
          lines: [
            {
              accountId: "coa-1000",
              debit: 100000,
              credit: 50000
            },
            {
              accountId: "coa-4000",
              debit: 0,
              credit: 50000
            }
          ]
        },
        "Super Admin"
      )
    ).rejects.toThrow(/tidak boleh memuat nilai debit dan kredit sekaligus/i);
  });

  it("Test 14: Validation - Reject non-existent account ID", async () => {
    await expect(
      accountingRepo.createDraftJournal(
        {
          journalDate: "2026-03-31",
          branchId: "branch-gebang",
          description: "Jurnal akun fiktif",
          sourceType: JournalSourceType.MANUAL,
          lines: [
            {
              accountId: "coa-9999-invalid",
              debit: 100000,
              credit: 0
            },
            {
              accountId: "coa-4000",
              debit: 0,
              credit: 100000
            }
          ]
        },
        "Super Admin"
      )
    ).rejects.toThrow(/tidak ditemukan/i);
  });

  it("Test 15: Create multi-line balanced compound journal", async () => {
    // Payment split: 150k Cash + 100k QRIS Bank = 250k Revenue
    const compound = await accountingRepo.createDraftJournal(
      {
        journalDate: "2026-03-31",
        branchId: "branch-gebang",
        description: "Penerimaan pembayaran split kas + transfer",
        sourceType: JournalSourceType.MANUAL,
        lines: [
          {
            accountId: "coa-1000", // Kas
            debit: 150000,
            credit: 0
          },
          {
            accountId: "coa-1010", // Bank BCA
            debit: 100000,
            credit: 0
          },
          {
            accountId: "coa-4000", // Pendapatan
            debit: 0,
            credit: 250000
          }
        ]
      },
      "Super Admin"
    );

    expect(compound.lines.length).toBe(3);
    expect(compound.totalDebit).toBe(250000);
    expect(compound.totalCredit).toBe(250000);
  });

  // =========================================================================
  // 3. JOURNAL LIFECYCLE & IMMUTABILITY TESTS
  // =========================================================================
  it("Test 16: Update a DRAFT journal", async () => {
    const draft = await accountingRepo.createDraftJournal(
      {
        journalDate: "2026-03-31",
        branchId: "branch-gebang",
        description: "Draft awal",
        sourceType: JournalSourceType.MANUAL,
        lines: [
          { accountId: "coa-1000", debit: 100000, credit: 0 },
          { accountId: "coa-4000", debit: 0, credit: 100000 }
        ]
      },
      "Super Admin"
    );

    const updated = await accountingRepo.updateDraftJournal(
      draft.id,
      {
        description: "Draft diperbarui dengan nominal revisi",
        lines: [
          { accountId: "coa-1000", debit: 175000, credit: 0 },
          { accountId: "coa-4000", debit: 0, credit: 175000 }
        ]
      },
      UserRole.SUPER_ADMIN
    );

    expect(updated.description).toBe("Draft diperbarui dengan nominal revisi");
    expect(updated.totalDebit).toBe(175000);
    expect(updated.totalCredit).toBe(175000);
  });

  it("Test 17: Post a DRAFT journal to POSTED status", async () => {
    const draft = await accountingRepo.createDraftJournal(
      {
        journalDate: "2026-03-31",
        branchId: "branch-gebang",
        description: "Draft siap posting",
        sourceType: JournalSourceType.MANUAL,
        lines: [
          { accountId: "coa-1000", debit: 200000, credit: 0 },
          { accountId: "coa-4000", debit: 0, credit: 200000 }
        ]
      },
      "Super Admin"
    );

    const posted = await accountingRepo.postJournal(
      draft.id,
      "Drg. Syarif",
      UserRole.SUPER_ADMIN
    );

    expect(posted.status).toBe(JournalStatus.POSTED);
    expect(posted.postedBy).toBe("Drg. Syarif");
    expect(posted.postedAt).toBeDefined();
  });

  it("Test 18: Immutability - Reject updating a POSTED journal", async () => {
    const draft = await accountingRepo.createDraftJournal(
      {
        journalDate: "2026-03-31",
        branchId: "branch-gebang",
        description: "Draft untuk diposting",
        sourceType: JournalSourceType.MANUAL,
        lines: [
          { accountId: "coa-1000", debit: 100000, credit: 0 },
          { accountId: "coa-4000", debit: 0, credit: 100000 }
        ]
      },
      "Super Admin"
    );

    await accountingRepo.postJournal(draft.id, "Drg. Syarif", UserRole.SUPER_ADMIN);

    // Attempt update
    await expect(
      accountingRepo.updateDraftJournal(
        draft.id,
        {
          description: "Mencoba edit jurnal posted"
        },
        UserRole.SUPER_ADMIN
      )
    ).rejects.toThrow(/POSTED/i);
  });

  it("Test 19: Immutability - Reject deleting a POSTED journal", async () => {
    const draft = await accountingRepo.createDraftJournal(
      {
        journalDate: "2026-03-31",
        branchId: "branch-gebang",
        description: "Draft hapus test",
        sourceType: JournalSourceType.MANUAL,
        lines: [
          { accountId: "coa-1000", debit: 50000, credit: 0 },
          { accountId: "coa-4000", debit: 0, credit: 50000 }
        ]
      },
      "Super Admin"
    );

    await accountingRepo.postJournal(draft.id, "Drg. Syarif", UserRole.SUPER_ADMIN);

    await expect(
      accountingRepo.deleteDraftJournal(draft.id, UserRole.SUPER_ADMIN)
    ).rejects.toThrow(/POSTED/i);
  });

  it("Test 20: Delete a DRAFT journal successfully", async () => {
    const draft = await accountingRepo.createDraftJournal(
      {
        journalDate: "2026-03-31",
        branchId: "branch-gebang",
        description: "Draft dihapus",
        sourceType: JournalSourceType.MANUAL,
        lines: [
          { accountId: "coa-1000", debit: 50000, credit: 0 },
          { accountId: "coa-4000", debit: 0, credit: 50000 }
        ]
      },
      "Super Admin"
    );

    await accountingRepo.deleteDraftJournal(draft.id, UserRole.SUPER_ADMIN);

    const fetched = await accountingRepo.getJournalById(draft.id);
    expect(fetched).toBeNull();
  });

  it("Test 21: Void a POSTED journal with reason and audit trail", async () => {
    const draft = await accountingRepo.createDraftJournal(
      {
        journalDate: "2026-03-31",
        branchId: "branch-gebang",
        description: "Jurnal salah input akan dibatalkan",
        sourceType: JournalSourceType.MANUAL,
        lines: [
          { accountId: "coa-1000", debit: 500000, credit: 0 },
          { accountId: "coa-4000", debit: 0, credit: 500000 }
        ]
      },
      "Super Admin"
    );

    await accountingRepo.postJournal(draft.id, "Drg. Syarif", UserRole.SUPER_ADMIN);

    const voided = await accountingRepo.voidJournal(
      draft.id,
      "Drg. Syarif",
      "Koreksi: Salah input cabang transaksi",
      UserRole.SUPER_ADMIN
    );

    expect(voided.status).toBe(JournalStatus.VOID);
    expect(voided.voidedBy).toBe("Drg. Syarif");
    expect(voided.voidReason).toBe("Koreksi: Salah input cabang transaksi");
    expect(voided.voidedAt).toBeDefined();

    // Reject voiding twice
    await expect(
      accountingRepo.voidJournal(
        draft.id,
        "Drg. Syarif",
        "Void lagi",
        UserRole.SUPER_ADMIN
      )
    ).rejects.toThrow(/sudah dalam status VOID/i);
  });

  // =========================================================================
  // 4. SOURCE TRANSACTION PROTECTION (IDEMPOTENCY)
  // =========================================================================
  it("Test 22: Link journal to transaction source (e.g. INVOICE)", async () => {
    const invJournal = await accountingRepo.createDraftJournal(
      {
        journalDate: "2026-03-31",
        branchId: "branch-gebang",
        description: "Pengakuan Piutang & Pendapatan Invoice INV-2026-001",
        sourceType: JournalSourceType.INVOICE,
        sourceId: "inv-2026-001",
        lines: [
          { accountId: "coa-1100", debit: 450000, credit: 0 }, // Piutang Pasien
          { accountId: "coa-4000", debit: 0, credit: 450000 } // Pendapatan
        ]
      },
      "System"
    );

    expect(invJournal.sourceType).toBe(JournalSourceType.INVOICE);
    expect(invJournal.sourceId).toBe("inv-2026-001");

    const found = await accountingRepo.getJournalsBySource(
      JournalSourceType.INVOICE,
      "inv-2026-001"
    );
    expect(found.length).toBe(1);
    expect(found[0].id).toBe(invJournal.id);
  });

  it("Test 23: Source protection - Reject creating duplicate journal for same sourceId", async () => {
    await accountingRepo.createDraftJournal(
      {
        journalDate: "2026-03-31",
        branchId: "branch-gebang",
        description: "Jurnal Invoice Pertama",
        sourceType: JournalSourceType.INVOICE,
        sourceId: "inv-duplicate-test",
        lines: [
          { accountId: "coa-1100", debit: 100000, credit: 0 },
          { accountId: "coa-4000", debit: 0, credit: 100000 }
        ]
      },
      "System"
    );

    // Attempt duplicate
    await expect(
      accountingRepo.createDraftJournal(
        {
          journalDate: "2026-03-31",
          branchId: "branch-gebang",
          description: "Jurnal Invoice Duplikat",
          sourceType: JournalSourceType.INVOICE,
          sourceId: "inv-duplicate-test",
          lines: [
            { accountId: "coa-1100", debit: 100000, credit: 0 },
            { accountId: "coa-4000", debit: 0, credit: 100000 }
          ]
        },
        "System"
      )
    ).rejects.toThrow(/sudah tercatat/i);
  });

  // =========================================================================
  // 5. BRANCH ISOLATION & RBAC TESTS
  // =========================================================================
  it("Test 24: Super Admin can query journals across all branches", async () => {
    // Initial mock data contains journals from branch-gebang and branch-muktisari
    const allJournals = await accountingRepo.getJournals(
      {},
      UserRole.SUPER_ADMIN,
      null
    );

    expect(allJournals.length).toBeGreaterThanOrEqual(3);
    expect(allJournals.some((j) => j.branchId === "branch-gebang")).toBe(true);
    expect(allJournals.some((j) => j.branchId === "branch-muktisari")).toBe(true);
  });

  it("Test 25: Branch Admin is strictly isolated to their own branch", async () => {
    const gebangJournals = await accountingRepo.getJournals(
      {},
      UserRole.BRANCH_ADMIN,
      "branch-gebang"
    );

    expect(gebangJournals.length).toBeGreaterThan(0);
    expect(gebangJournals.every((j) => j.branchId === "branch-gebang")).toBe(true);
    expect(gebangJournals.some((j) => j.branchId === "branch-muktisari")).toBe(false);
  });

  it("Test 26: Branch Admin cannot create journal for a different branch", async () => {
    await expect(
      accountingRepo.createDraftJournal(
        {
          journalDate: "2026-03-31",
          branchId: "branch-muktisari", // Admin Gebang tries to create for Muktisari
          description: "Illegal cross-branch journal",
          sourceType: JournalSourceType.MANUAL,
          lines: [
            { accountId: "coa-1000", debit: 100000, credit: 0 },
            { accountId: "coa-4000", debit: 0, credit: 100000 }
          ]
        },
        "Admin Gebang",
        UserRole.BRANCH_ADMIN,
        "branch-gebang"
      )
    ).rejects.toThrow(/cabang/i);
  });

  it("Test 27: Branch Admin cannot post or void journal belonging to another branch", async () => {
    // Find a journal from branch-muktisari
    const muktisariJournals = await accountingRepo.getJournals(
      { branchId: "branch-muktisari" },
      UserRole.SUPER_ADMIN
    );
    expect(muktisariJournals.length).toBeGreaterThan(0);
    const mJournal = muktisariJournals[0];

    // Branch Admin Gebang tries to void it
    await expect(
      accountingRepo.voidJournal(
        mJournal.id,
        "Admin Gebang",
        "Unauthorized void",
        UserRole.BRANCH_ADMIN,
        "branch-gebang"
      )
    ).rejects.toThrow(/cabangnya sendiri/i);
  });

  // =========================================================================
  // 6. GENERAL LEDGER & RUNNING BALANCE TESTS
  // =========================================================================
  it("Test 28: General Ledger only includes POSTED journals", async () => {
    // Create draft and void journals for coa-1000
    const draft = await accountingRepo.createDraftJournal(
      {
        journalDate: "2026-03-31",
        branchId: "branch-gebang",
        description: "Draft tidak boleh masuk ledger",
        sourceType: JournalSourceType.MANUAL,
        lines: [
          { accountId: "coa-1000", debit: 999999, credit: 0 },
          { accountId: "coa-4000", debit: 0, credit: 999999 }
        ]
      },
      "Admin"
    );

    const ledger = await accountingRepo.getLedgerEntries({ accountId: "coa-1000" });

    // The draft amount must NOT appear in the ledger
    expect(ledger.some((e) => e.journalNumber === draft.journalNumber)).toBe(false);
  });

  it("Test 29: Calculate correct balance for ASSET account (Normal Debit)", async () => {
    // Kas (1000): Normal Debit -> Balance = Total Debit - Total Credit
    const balance = await accountingRepo.getAccountBalance("coa-1000");

    expect(balance.accountCode).toBe("1000");
    expect(balance.accountType).toBe(AccountType.ASSET);
    expect(balance.normalBalance).toBe(NormalBalance.DEBIT);
    expect(balance.totalDebit).toBeGreaterThan(0);
    expect(balance.balance).toBe(balance.totalDebit - balance.totalCredit);
  });

  it("Test 30: Calculate correct balance for REVENUE account (Normal Credit)", async () => {
    // Pendapatan (4000): Normal Credit -> Balance = Total Credit - Total Debit
    const balance = await accountingRepo.getAccountBalance("coa-4000");

    expect(balance.accountCode).toBe("4000");
    expect(balance.accountType).toBe(AccountType.REVENUE);
    expect(balance.normalBalance).toBe(NormalBalance.CREDIT);
    expect(balance.totalCredit).toBeGreaterThan(0);
    expect(balance.balance).toBe(balance.totalCredit - balance.totalDebit);
  });

  it("Test 31: Calculate correct balance for EXPENSE account (Normal Debit)", async () => {
    // Beban Gaji (5000): Normal Debit -> Balance = Total Debit - Total Credit
    const balance = await accountingRepo.getAccountBalance("coa-5000");

    expect(balance.accountCode).toBe("5000");
    expect(balance.accountType).toBe(AccountType.EXPENSE);
    expect(balance.normalBalance).toBe(NormalBalance.DEBIT);
    expect(balance.balance).toBe(balance.totalDebit - balance.totalCredit);
  });

  it("Test 32: Ledger running balance accumulates sequentially", async () => {
    const entries = await accountingRepo.getLedgerEntries({ accountId: "coa-1000" });
    expect(entries.length).toBeGreaterThanOrEqual(2);

    // Verify chronological order and running balances
    for (let i = 0; i < entries.length; i++) {
      expect(entries[i].runningBalance).toBeDefined();
      if (i > 0) {
        const prev = entries[i - 1].runningBalance ?? 0;
        const currentDebit = entries[i].debit;
        const currentCredit = entries[i].credit;
        // Asset account: runningBalance = prev + debit - credit
        expect(entries[i].runningBalance).toBe(prev + currentDebit - currentCredit);
      }
    }
  });

  it("Test 33: Ledger query supports date filtering (dateFrom & dateTo)", async () => {
    const all = await accountingRepo.getLedgerEntries({ accountId: "coa-1000" });
    expect(all.length).toBeGreaterThan(0);

    const filtered = await accountingRepo.getLedgerEntries({
      accountId: "coa-1000",
      dateFrom: "2026-09-01",
      dateTo: "2026-09-30"
    });

    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.every((e) => e.journalDate >= "2026-09-01" && e.journalDate <= "2026-09-30")).toBe(
      true
    );
  });

  it("Test 34: Branch-specific ledger isolation", async () => {
    const gebangLedger = await accountingRepo.getLedgerEntries(
      { accountId: "coa-1000", branchId: "branch-gebang" },
      UserRole.BRANCH_ADMIN,
      "branch-gebang"
    );

    expect(gebangLedger.every((e) => e.branchId === "branch-gebang")).toBe(true);

    const muktisariLedger = await accountingRepo.getLedgerEntries(
      { accountId: "coa-1000", branchId: "branch-muktisari" },
      UserRole.BRANCH_ADMIN,
      "branch-muktisari"
    );

    expect(muktisariLedger.every((e) => e.branchId === "branch-muktisari")).toBe(true);
  });
});
