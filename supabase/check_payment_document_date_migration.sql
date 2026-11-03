-- Read-only check of the live payment document-date migration.
-- This does not rely on Supabase CLI migration history.
WITH expected_payment_function AS (
  SELECT
    to_regprocedure(
      'public.record_invoice_payment_atomic(uuid,bigint,text,text,uuid,uuid,text,date,text)'
    ) AS function_oid,
    ARRAY[
      'p_payment_date DATE DEFAULT NULL',
      'v_payment_date > v_today',
      'v_payment_date < v_invoice.invoice_date',
      'Alasan pencatatan pembayaran mundur wajib diisi',
      'transaction_date_time,',
      'payment_date,',
      'notes,'
    ]::TEXT[] AS expected_fragments
),
payment_function AS (
  SELECT
    expected.*,
    CASE
      WHEN expected.function_oid IS NULL THEN NULL
      ELSE pg_get_functiondef(expected.function_oid)
    END AS function_definition
  FROM expected_payment_function AS expected
),
normalized_payment_function AS (
  SELECT
    payment_function.*,
    lower(regexp_replace(function_definition, '\s+', '', 'g'))
      AS normalized_definition
  FROM payment_function
),
payment_columns AS (
  SELECT
    bool_or(column_name = 'payment_date') AS has_payment_date,
    bool_or(column_name = 'notes') AS has_notes,
    bool_or(column_name = 'payment_date' AND is_nullable = 'NO') AS payment_date_not_null
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'payment_transactions'
),
payment_trigger AS (
  SELECT EXISTS (
    SELECT 1
    FROM pg_trigger trigger_row
    WHERE trigger_row.tgrelid = to_regclass('public.payment_transactions')
      AND NOT trigger_row.tgisinternal
      AND trigger_row.tgenabled <> 'D'
      AND trigger_row.tgfoid = to_regprocedure('public.assign_payment_receipt_number()')
  ) AS trigger_is_enabled
),
checks AS (
  SELECT
    'payment_transactions table'::TEXT AS check_name,
    to_regclass('public.payment_transactions') IS NOT NULL AS passed,
    CASE
      WHEN to_regclass('public.payment_transactions') IS NULL THEN 'Tabel tidak ditemukan'
      ELSE 'Tabel tersedia'
    END AS details
  UNION ALL
  SELECT
    'payment_date column',
    COALESCE(pc.has_payment_date, false),
    CASE WHEN COALESCE(pc.has_payment_date, false)
      THEN 'Kolom tersedia'
      ELSE 'Kolom belum ada'
    END
  FROM payment_columns AS pc
  UNION ALL
  SELECT
    'payment_date NOT NULL',
    COALESCE(pc.payment_date_not_null, false),
    CASE WHEN COALESCE(pc.payment_date_not_null, false)
      THEN 'Constraint NOT NULL aktif'
      ELSE 'Kolom belum ada atau masih nullable'
    END
  FROM payment_columns AS pc
  UNION ALL
  SELECT
    'notes column',
    COALESCE(pc.has_notes, false),
    CASE WHEN COALESCE(pc.has_notes, false)
      THEN 'Kolom tersedia'
      ELSE 'Kolom belum ada'
    END
  FROM payment_columns AS pc
  UNION ALL
  SELECT
    'record_invoice_payment_atomic function',
    payment_function.function_oid IS NOT NULL,
    CASE WHEN payment_function.function_oid IS NOT NULL
      THEN 'Signature migrasi tersedia'
      ELSE 'Signature migrasi belum ditemukan'
    END
  FROM normalized_payment_function AS payment_function
  UNION ALL
  SELECT
    'payment function logic',
    COALESCE((
      SELECT bool_and(
        position(
          lower(regexp_replace(fragment, '\s+', '', 'g'))
          IN payment_function.normalized_definition
        ) > 0
      )
      FROM unnest(payment_function.expected_fragments) AS fragment
    ), false),
    CASE
      WHEN payment_function.function_oid IS NULL THEN 'Fungsi tidak ditemukan'
      ELSE COALESCE((
        SELECT 'Bagian belum ditemukan: ' || string_agg(fragment, '; ')
        FROM unnest(payment_function.expected_fragments) AS fragment
        WHERE position(
          lower(regexp_replace(fragment, '\s+', '', 'g'))
          IN payment_function.normalized_definition
        ) = 0
      ), 'Validasi tanggal dan alasan pembayaran mundur ditemukan')
    END
  FROM normalized_payment_function AS payment_function
  UNION ALL
  SELECT
    'receipt-number trigger',
    payment_trigger.trigger_is_enabled,
    CASE WHEN payment_trigger.trigger_is_enabled
      THEN 'Trigger aktif menggunakan assign_payment_receipt_number'
      ELSE 'Trigger tidak ditemukan atau dinonaktifkan'
    END
  FROM payment_trigger
)
SELECT
  CASE WHEN passed THEN 'OK' ELSE 'BELUM SESUAI' END AS status,
  check_name,
  details
FROM checks
ORDER BY passed, check_name;
