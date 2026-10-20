CREATE OR REPLACE FUNCTION public.prevent_linked_compensation_accrual_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.journal_entries
    WHERE source_type = 'COMPENSATION'
      AND source_id = OLD.id::TEXT
  ) THEN
    RAISE EXCEPTION 'Akrual ini memiliki riwayat jurnal. Selesaikan koreksi jurnal sebelum menghapus sumbernya.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.payroll_items
    WHERE source_id = OLD.id::TEXT
  ) THEN
    RAISE EXCEPTION 'Akrual ini sudah dimasukkan ke rincian payroll dan tidak dapat dihapus.';
  END IF;

  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_linked_compensation_accrual_delete() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_prevent_linked_compensation_accrual_delete ON public.compensation_accruals;
CREATE TRIGGER trg_prevent_linked_compensation_accrual_delete
  BEFORE DELETE ON public.compensation_accruals
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_linked_compensation_accrual_delete();

CREATE OR REPLACE FUNCTION public.prevent_linked_payroll_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.status <> 'DRAFT' THEN
    RAISE EXCEPTION 'Hanya payroll berstatus DRAFT yang dapat dihapus. Payroll yang sudah masuk tahap Review tidak boleh dihapus.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.journal_entries
    WHERE source_type = 'PAYROLL'
      AND source_id = OLD.id::TEXT
  ) THEN
    RAISE EXCEPTION 'Payroll ini memiliki riwayat jurnal. Selesaikan koreksi jurnal sebelum menghapus sumbernya.';
  END IF;

  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_linked_payroll_delete() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_prevent_linked_payroll_delete ON public.monthly_payrolls;
CREATE TRIGGER trg_prevent_linked_payroll_delete
  BEFORE DELETE ON public.monthly_payrolls
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_linked_payroll_delete();

CREATE OR REPLACE FUNCTION public.delete_unposted_payroll(p_payroll_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payroll public.monthly_payrolls%ROWTYPE;
BEGIN
  SELECT *
  INTO v_payroll
  FROM public.monthly_payrolls
  WHERE id = p_payroll_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  IF v_payroll.status <> 'DRAFT' THEN
    RAISE EXCEPTION 'Hanya payroll berstatus DRAFT yang dapat dihapus. Payroll yang sudah masuk tahap Review tidak boleh dihapus.';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.journal_entries
    WHERE source_type = 'PAYROLL'
      AND source_id = p_payroll_id::TEXT
  ) THEN
    RAISE EXCEPTION 'Payroll ini memiliki riwayat jurnal. Selesaikan koreksi jurnal sebelum menghapus sumbernya.';
  END IF;

  DELETE FROM public.payroll_items
  WHERE payroll_id = p_payroll_id;

  DELETE FROM public.monthly_payrolls
  WHERE id = p_payroll_id;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_unposted_payroll(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_unposted_payroll(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.enforce_journal_reversal_policy()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.status = 'VOID' THEN
      RAISE EXCEPTION 'Jurnal tidak dapat di-VOID tanpa proses jurnal pembalik yang konsisten.';
    END IF;
    IF OLD.status = 'POSTED' AND NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'Jurnal POSTED tidak dapat di-VOID atau diubah status tanpa proses jurnal pembalik yang konsisten.';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status <> 'DRAFT' THEN
    RAISE EXCEPTION 'Jurnal POSTED atau VOID harus dipertahankan sebagai audit trail; hanya draft yang dapat dihapus.';
  END IF;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_journal_reversal_policy() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_enforce_journal_reversal_policy ON public.journal_entries;
CREATE TRIGGER trg_enforce_journal_reversal_policy
  BEFORE UPDATE OF status OR DELETE ON public.journal_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_journal_reversal_policy();

CREATE OR REPLACE FUNCTION public.prevent_posted_journal_line_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.journal_entries
    WHERE id = OLD.journal_entry_id
      AND status <> 'DRAFT'
  ) THEN
    RAISE EXCEPTION 'Baris jurnal POSTED atau VOID tidak dapat dihapus.';
  END IF;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_posted_journal_line_delete() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_prevent_posted_journal_line_delete ON public.journal_lines;
CREATE TRIGGER trg_prevent_posted_journal_line_delete
  BEFORE DELETE ON public.journal_lines
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_posted_journal_line_delete();

CREATE OR REPLACE FUNCTION public.lock_financial_journal_source()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.source_type = 'PAYROLL' THEN
    PERFORM 1
    FROM public.monthly_payrolls
    WHERE id::TEXT = NEW.source_id
    FOR KEY SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Sumber payroll jurnal tidak ditemukan.';
    END IF;
  ELSIF NEW.source_type = 'COMPENSATION' THEN
    PERFORM 1
    FROM public.compensation_accruals
    WHERE id::TEXT = NEW.source_id
    FOR KEY SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Sumber akrual kompensasi jurnal tidak ditemukan.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.lock_financial_journal_source() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_lock_financial_journal_source ON public.journal_entries;
CREATE TRIGGER trg_lock_financial_journal_source
  BEFORE INSERT ON public.journal_entries
  FOR EACH ROW
  WHEN (NEW.source_type IN ('PAYROLL', 'COMPENSATION'))
  EXECUTE FUNCTION public.lock_financial_journal_source();
