-- Read-only check of the live treatment return/revision functions.
-- This does not depend on Supabase CLI migration history being enabled.
WITH expected_functions(
  migration_version,
  function_signature,
  expected_fragments
) AS (
  VALUES
    (
      '20270112000000',
      'public.return_treatment_to_doctor_secure(uuid,text)',
      ARRAY[
        'user_can_access_branch(v_treatment.branch_id)',
        'status = ''PERLU_REVISI''',
        'RETURNED_TO_DOCTOR'
      ]::TEXT[]
    ),
    (
      '20270113000000',
      'public.resubmit_treatment_to_cashier_secure(uuid,text,uuid,bigint)',
      ARRAY[
        'service_id = p_service_id',
        'price_snapshot = p_price_snapshot',
        'status = ''PERLU_REVISI''',
        'REVISION_RESUBMITTED'
      ]::TEXT[]
    )
),
live_functions AS (
  SELECT
    expected.migration_version,
    expected.function_signature,
    expected.expected_fragments,
    to_regprocedure(expected.function_signature) AS function_oid
  FROM expected_functions AS expected
),
function_definitions AS (
  SELECT
    live.*,
    CASE
      WHEN live.function_oid IS NULL THEN NULL
      ELSE pg_get_functiondef(live.function_oid)
    END AS function_definition
  FROM live_functions AS live
),
normalized_definitions AS (
  SELECT
    definitions.*,
    lower(regexp_replace(function_definition, '\s+', '', 'g')) AS normalized_definition
  FROM function_definitions AS definitions
)
SELECT
  migration_version,
  function_signature,
  CASE
    WHEN function_oid IS NULL THEN 'FUNGSI BELUM ADA'
    ELSE 'FUNGSI ADA'
  END AS function_status,
  CASE
    WHEN function_oid IS NULL THEN 'TIDAK DAPAT DIPERIKSA'
    WHEN (
      SELECT bool_and(
        position(lower(regexp_replace(fragment, '\s+', '', 'g')) IN normalized_definition) > 0
      )
      FROM unnest(expected_fragments) AS fragment
    ) THEN 'LOGIKA YANG DIHARAPKAN SUDAH TERPASANG'
    ELSE 'LOGIKA YANG DIHARAPKAN BELUM LENGKAP'
  END AS logic_status,
  CASE
    WHEN function_oid IS NULL THEN 'Fungsi tidak ditemukan'
    ELSE COALESCE((
      SELECT string_agg(fragment, '; ')
      FROM unnest(expected_fragments) AS fragment
      WHERE position(
        lower(regexp_replace(fragment, '\s+', '', 'g'))
        IN normalized_definition
      ) = 0
    ), 'Tidak ada bagian yang hilang')
  END AS missing_logic_fragments,
  CASE
    WHEN to_regclass('supabase_migrations.schema_migrations') IS NULL
      THEN 'Tabel riwayat migration CLI tidak tersedia; hasil memeriksa fungsi aktif.'
    ELSE 'Hasil memeriksa fungsi aktif; tabel riwayat migration tidak dibaca.'
  END AS check_note
FROM normalized_definitions
ORDER BY migration_version;
