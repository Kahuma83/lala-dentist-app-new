import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const paymentsPage = readFileSync(
  resolve(process.cwd(), "src/pages/Payments.tsx"),
  "utf-8"
);
const repository = readFileSync(
  resolve(process.cwd(), "src/repositories/supabaseRepositories.ts"),
  "utf-8"
);

describe("atomic payment reversal workflow", () => {
  it("requires a reason and only closes the confirmation after reversal succeeds", () => {
    const handler = paymentsPage.slice(
      paymentsPage.indexOf("const handleConfirmReversePayment"),
      paymentsPage.indexOf("useEffect(() =>", paymentsPage.indexOf("const handleConfirmReversePayment"))
    );

    expect(handler).toContain("paymentRepo.reversePayment(");
    expect(handler).toContain("reversalReason.trim()");
    expect(handler.indexOf("await paymentRepo.reversePayment(")).toBeLessThan(handler.indexOf("setPaymentToReverse(null)"));
    expect(paymentsPage).toContain("Gunakan hanya setelah pengembalian dana benar-benar dilakukan.");
    expect(paymentsPage).toContain("Batalkan & Balikkan Pembayaran");
  });

  it("calls the atomic payment reversal RPC and maps the audited result", () => {
    const reverseMethod = repository.slice(
      repository.indexOf("async reversePayment("),
      repository.indexOf("// 14. SUPABASE DOCTOR REPOSITORY")
    );

    expect(reverseMethod).toContain('supabase.rpc("reverse_invoice_payment_atomic"');
    expect(reverseMethod).toContain("p_payment_id: id");
    expect(reverseMethod).toContain("p_reason: cleanReason");
    expect(repository).toContain("reversalReason: row.reversal_reason ?? undefined");
    expect(repository).toContain("reversedAt: row.reversed_at ?? undefined");
  });
});
