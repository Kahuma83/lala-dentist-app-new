INSERT INTO public.chart_of_accounts (
  code,
  name,
  account_type,
  account_category,
  normal_balance,
  is_active,
  description
)
VALUES (
  '5080',
  'Beban Dokter Pengganti',
  'EXPENSE',
  'DOCTOR_REPLACEMENT_EXPENSE',
  'DEBIT',
  true,
  'Honor harian dan insentif tindakan dokter pengganti eksternal'
)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    account_type = EXCLUDED.account_type,
    account_category = EXCLUDED.account_category,
    normal_balance = EXCLUDED.normal_balance,
    is_active = EXCLUDED.is_active,
    description = EXCLUDED.description,
    updated_at = timezone('utc'::text, now());
