-- Permanently removes dummy patient data and patient-linked clinical/financial
-- records while preserving branches, staff, doctors, schedules, accounts,
-- catalog, and settings. Patient appointment bookings are removed; doctor
-- availability and work schedules are not touched.
-- Run only in the confirmed disposable Supabase project, after taking a backup.
-- If consent uploads exist, remove them through Supabase Storage first.
-- If a linked inventory movement or payroll item exists, this script aborts
-- rather than silently corrupting stock or payroll balances.

BEGIN;

-- Explicit opt-in gate. Keep this value unchanged only after confirming the
-- selected Supabase project is disposable and all patient data is dummy.
SET LOCAL app.allow_dummy_patient_purge = 'YES_PURGE_DUMMY_PATIENT_DATA';

DO $$
BEGIN
  IF current_setting('app.allow_dummy_patient_purge', TRUE)
     IS DISTINCT FROM 'YES_PURGE_DUMMY_PATIENT_DATA' THEN
    RAISE EXCEPTION 'Purge dinonaktifkan. Pastikan backup dan proyek sudah benar sebelum mengaktifkan konfirmasi purge.';
  END IF;
END;
$$;

CREATE TEMP TABLE purge_patient_ids ON COMMIT DROP AS
SELECT id
FROM public.patient_profiles;

CREATE TEMP TABLE purge_booking_ids ON COMMIT DROP AS
SELECT id
FROM public.bookings
WHERE patient_id IN (SELECT id FROM purge_patient_ids);

CREATE TEMP TABLE purge_visit_ids ON COMMIT DROP AS
SELECT id
FROM public.patient_visits
WHERE patient_id IN (SELECT id FROM purge_patient_ids);

CREATE TEMP TABLE purge_treatment_ids ON COMMIT DROP AS
SELECT id
FROM public.treatment_jobs
WHERE patient_id IN (SELECT id FROM purge_patient_ids)
   OR visit_id IN (SELECT id FROM purge_visit_ids);

CREATE TEMP TABLE purge_invoice_ids ON COMMIT DROP AS
SELECT id
FROM public.invoices
WHERE patient_id IN (SELECT id FROM purge_patient_ids)
   OR visit_id IN (SELECT id FROM purge_visit_ids);

CREATE TEMP TABLE purge_payment_ids ON COMMIT DROP AS
SELECT id
FROM public.payment_transactions
WHERE invoice_id IN (SELECT id FROM purge_invoice_ids);

CREATE TEMP TABLE purge_compensation_ids ON COMMIT DROP AS
SELECT id
FROM public.compensation_accruals
WHERE source_id IN (SELECT id::TEXT FROM purge_treatment_ids);

CREATE TEMP TABLE purge_journal_ids (
  id UUID PRIMARY KEY
) ON COMMIT DROP;

INSERT INTO purge_journal_ids (id)
SELECT journal.id
FROM public.journal_entries AS journal
WHERE (journal.source_type = 'INVOICE'
       AND journal.source_id IN (SELECT id::TEXT FROM purge_invoice_ids))
   OR (journal.source_type = 'PAYMENT'
       AND journal.source_id IN (SELECT id::TEXT FROM purge_payment_ids))
   OR (journal.source_type = 'COMPENSATION'
       AND journal.source_id IN (SELECT id::TEXT FROM purge_compensation_ids));

-- Include reversal entries so the self-referencing journal FK can be removed
-- in child-before-parent order.
INSERT INTO purge_journal_ids (id)
SELECT reversal.id
FROM public.journal_entries AS reversal
WHERE reversal.reversal_of_journal_id IN (SELECT id FROM purge_journal_ids)
ON CONFLICT DO NOTHING;

DO $$
DECLARE
  patient_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO patient_count FROM purge_patient_ids;
  IF patient_count = 0 THEN
    RAISE EXCEPTION 'Tidak ada profil pasien untuk dihapus; transaksi dibatalkan.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.inventory_movements movement
    WHERE movement.patient_visit_id IN (SELECT id FROM purge_visit_ids)
       OR movement.treatment_job_id IN (SELECT id FROM purge_treatment_ids)
  ) THEN
    RAISE EXCEPTION 'Ada pergerakan stok terkait pasien. Transaksi dibatalkan agar saldo stok tidak berubah tanpa rekonsiliasi.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.payroll_items item
    WHERE item.source_id IN (SELECT id::TEXT FROM purge_compensation_ids)
  ) THEN
    RAISE EXCEPTION 'Ada akrual tindakan pasien yang sudah masuk payroll. Transaksi dibatalkan agar payroll tidak berubah tanpa rekonsiliasi.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.clinical_consent_documents document
    JOIN storage.objects object
      ON object.bucket_id = 'clinical-consent-documents'
     AND object.name = document.object_path
    WHERE document.visit_id IN (SELECT id FROM purge_visit_ids)
       OR document.treatment_job_id IN (SELECT id FROM purge_treatment_ids)
  ) THEN
    RAISE EXCEPTION 'Ada file consent di Supabase Storage. Hapus file terkait melalui Dashboard Storage, lalu jalankan ulang skrip. Metadata dokumen akan dihapus oleh skrip ini.';
  END IF;
END;
$$;

-- These application triggers intentionally protect permanent clinical records,
-- consent documents, and posted journals. They are disabled only inside this
-- transaction because the confirmed target dataset is disposable dummy data.
ALTER TABLE public.clinical_medical_records DISABLE TRIGGER USER;
ALTER TABLE public.treatment_job_clinical_details DISABLE TRIGGER USER;
ALTER TABLE public.clinical_consent_documents DISABLE TRIGGER USER;
ALTER TABLE public.journal_entries DISABLE TRIGGER USER;
ALTER TABLE public.journal_lines DISABLE TRIGGER USER;
ALTER TABLE public.user_accounts DISABLE TRIGGER USER;

DELETE FROM public.clinical_consent_documents
WHERE visit_id IN (SELECT id FROM purge_visit_ids)
   OR treatment_job_id IN (SELECT id FROM purge_treatment_ids);

DELETE FROM public.clinical_medical_record_addenda AS addendum
WHERE addendum.medical_record_id IN (
  SELECT record.id
  FROM public.clinical_medical_records AS record
  WHERE record.patient_id IN (SELECT id FROM purge_patient_ids)
     OR record.visit_id IN (SELECT id FROM purge_visit_ids)
);

DELETE FROM public.treatment_job_clinical_details
WHERE treatment_job_id IN (SELECT id FROM purge_treatment_ids);

DELETE FROM public.clinical_medical_records
WHERE patient_id IN (SELECT id FROM purge_patient_ids)
   OR visit_id IN (SELECT id FROM purge_visit_ids);

DELETE FROM public.patient_medical_profiles
WHERE patient_id IN (SELECT id FROM purge_patient_ids);

DELETE FROM public.inventory_treatment_consumptions
WHERE treatment_job_id IN (SELECT id FROM purge_treatment_ids)
   OR patient_visit_id IN (SELECT id FROM purge_visit_ids);

DELETE FROM public.treatment_activities
WHERE treatment_id IN (SELECT id FROM purge_treatment_ids);

DELETE FROM public.treatment_visit_links
WHERE treatment_job_id IN (SELECT id FROM purge_treatment_ids)
   OR visit_id IN (SELECT id FROM purge_visit_ids);

DELETE FROM public.treatment_incentives
WHERE treatment_job_id IN (SELECT id FROM purge_treatment_ids);

DELETE FROM public.invoice_items
WHERE invoice_id IN (SELECT id FROM purge_invoice_ids);

DELETE FROM public.journal_lines
WHERE journal_entry_id IN (SELECT id FROM purge_journal_ids);

DELETE FROM public.journal_entries
WHERE id IN (
  SELECT purge.id
  FROM purge_journal_ids AS purge
  JOIN public.journal_entries AS journal ON journal.id = purge.id
  WHERE journal.reversal_of_journal_id IS NOT NULL
);

DELETE FROM public.journal_entries
WHERE id IN (SELECT id FROM purge_journal_ids);

DELETE FROM public.compensation_accruals
WHERE id IN (SELECT id FROM purge_compensation_ids);

DELETE FROM public.payment_transactions
WHERE id IN (SELECT id FROM purge_payment_ids);

DELETE FROM public.invoices
WHERE id IN (SELECT id FROM purge_invoice_ids);

DELETE FROM public.queue_items
WHERE patient_id IN (SELECT id FROM purge_patient_ids)
   OR visit_id IN (SELECT id FROM purge_visit_ids)
   OR booking_id IN (SELECT id FROM purge_booking_ids);

DELETE FROM public.treatment_jobs
WHERE id IN (SELECT id FROM purge_treatment_ids);

DELETE FROM public.patient_visits
WHERE id IN (SELECT id FROM purge_visit_ids);

DELETE FROM public.booking_confirmations_h1
WHERE booking_id IN (SELECT id FROM purge_booking_ids);

UPDATE public.bookings
SET rescheduled_from_booking_id = NULL
WHERE id IN (SELECT id FROM purge_booking_ids);

DELETE FROM public.bookings
WHERE id IN (SELECT id FROM purge_booking_ids);

-- Keep login accounts but remove links to patient profiles that are deleted.
UPDATE public.user_accounts
SET patient_id = NULL,
    updated_at = timezone('utc'::TEXT, now())
WHERE patient_id IN (SELECT id::TEXT FROM purge_patient_ids);
ALTER TABLE public.user_accounts ENABLE TRIGGER USER;

-- The branch-scoped RM table is created by the migration being prepared, so it
-- may not exist yet if that migration rolled back.
DO $$
BEGIN
  IF to_regclass('public.patient_branch_medical_records') IS NOT NULL THEN
    DELETE FROM public.patient_branch_medical_records
    WHERE patient_id IN (SELECT id FROM purge_patient_ids);
  END IF;
END;
$$;

DELETE FROM public.patient_profiles
WHERE id IN (SELECT id FROM purge_patient_ids);

ALTER TABLE public.clinical_medical_records ENABLE TRIGGER USER;
ALTER TABLE public.treatment_job_clinical_details ENABLE TRIGGER USER;
ALTER TABLE public.clinical_consent_documents ENABLE TRIGGER USER;
ALTER TABLE public.journal_entries ENABLE TRIGGER USER;
ALTER TABLE public.journal_lines ENABLE TRIGGER USER;

COMMIT;
