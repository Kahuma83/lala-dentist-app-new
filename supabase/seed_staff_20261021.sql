BEGIN;

CREATE TEMP TABLE staff_import_rows (
  row_number INTEGER PRIMARY KEY,
  full_name TEXT NOT NULL,
  position TEXT NOT NULL,
  location TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO staff_import_rows (row_number, full_name, position, location) VALUES
  (1, 'ANI', 'BRANCH_ADMIN', 'Lengkong Mumbul'),
  (2, 'MARSA', 'ASSISTANT', 'Ambulu'),
  (3, 'ANISA', 'ASSISTANT', 'Ambulu'),
  (4, 'DINDA', 'BRANCH_ADMIN', 'Ambulu'),
  (5, 'USNAKE', 'BRANCH_ADMIN', 'Kencong'),
  (6, 'KHALISA', 'ASSISTANT', 'Kencong'),
  (7, 'LILIS', 'BRANCH_ADMIN', 'Gebang'),
  (8, 'ANGGEL', 'BRANCH_ADMIN', 'Gebang'),
  (9, 'LINDA', 'ASSISTANT', 'Gebang'),
  (10, 'drg. Yuni', 'DOCTOR', 'Gebang'),
  (11, 'drg. Yuni', 'DOCTOR', 'Ambulu'),
  (12, 'drg. Ulfa', 'DOCTOR', 'Ambulu'),
  (13, 'drg. Ulfa', 'DOCTOR', 'Gebang'),
  (14, 'drg. Dewi', 'DOCTOR', 'Lengkong Mumbul'),
  (15, 'drg. Aab', 'DOCTOR', 'Lengkong Mumbul'),
  (16, 'drg. Aab', 'DOCTOR', 'Kampus'),
  (17, 'drg. Iza', 'DOCTOR', 'Kencong'),
  (18, 'drg. Vio', 'DOCTOR', 'Gebang'),
  (19, 'drg. Vio', 'DOCTOR', 'Kencong'),
  (20, 'AYIK', 'BRANCH_ADMIN', 'Kampus'),
  (21, 'drg. Amel', 'DOCTOR', 'Kencong'),
  (22, 'ANITA', 'ASSISTANT', 'Kencong'),
  (23, 'CYNTIA', 'BRANCH_ADMIN', 'Kencong'),
  (24, 'IMA', 'BRANCH_ADMIN', 'Lengkong Mumbul');

DO $$
DECLARE
  invalid_location TEXT;
BEGIN
  SELECT locations.location
  INTO invalid_location
  FROM (
    SELECT
      roster.location,
      COUNT(branch.id) AS branch_count
    FROM (SELECT DISTINCT location FROM staff_import_rows) AS roster
    LEFT JOIN public.dental_branches AS branch
      ON branch.is_active = true
      AND regexp_replace(lower(branch.name), '[^[:alnum:]]', '', 'g')
        LIKE '%' || regexp_replace(lower(roster.location), '[^[:alnum:]]', '', 'g') || '%'
    GROUP BY roster.location
  ) AS locations
  WHERE locations.branch_count <> 1
  LIMIT 1;

  IF invalid_location IS NOT NULL THEN
    RAISE EXCEPTION 'Lokasi "%" tidak cocok dengan tepat satu cabang aktif.', invalid_location;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM staff_import_rows AS roster
    JOIN public.dental_branches AS branch
      ON branch.is_active = true
      AND regexp_replace(lower(branch.name), '[^[:alnum:]]', '', 'g')
        LIKE '%' || regexp_replace(lower(roster.location), '[^[:alnum:]]', '', 'g') || '%'
    JOIN public.staff AS existing
      ON existing.employee_code = 'LD-STAFF-20261021-' || lpad(roster.row_number::TEXT, 3, '0')
    WHERE existing.full_name <> roster.full_name
      OR existing.position <> roster.position
      OR existing.branch_id IS DISTINCT FROM branch.id
  ) THEN
    RAISE EXCEPTION 'Kode staff LD-STAFF-20261021-xxx sudah digunakan oleh data lain.';
  END IF;
END $$;

INSERT INTO public.staff (
  employee_code,
  full_name,
  phone,
  position,
  employment_status,
  join_date,
  active,
  notes,
  branch_id
)
SELECT
  'LD-STAFF-20261021-' || lpad(roster.row_number::TEXT, 3, '0'),
  roster.full_name,
  '',
  roster.position,
  'ACTIVE',
  CURRENT_DATE,
  true,
  'Data awal dari daftar staff; nomor telepon belum diberikan.',
  branch.id
FROM staff_import_rows AS roster
JOIN public.dental_branches AS branch
  ON branch.is_active = true
  AND regexp_replace(lower(branch.name), '[^[:alnum:]]', '', 'g')
    LIKE '%' || regexp_replace(lower(roster.location), '[^[:alnum:]]', '', 'g') || '%'
WHERE NOT EXISTS (
  SELECT 1
  FROM public.staff AS existing
  WHERE lower(trim(existing.full_name)) = lower(trim(roster.full_name))
    AND existing.position = roster.position
    AND existing.branch_id = branch.id
    AND existing.employment_status <> 'RESIGNED'
)
ON CONFLICT (employee_code) DO NOTHING;

SELECT
  roster.row_number AS no,
  existing.employee_code AS kode_staff,
  existing.full_name AS nama,
  existing.position AS jabatan,
  branch.name AS cabang,
  existing.phone AS telepon,
  existing.join_date AS tanggal_masuk,
  existing.employment_status AS status
FROM staff_import_rows AS roster
JOIN public.dental_branches AS branch
  ON branch.is_active = true
  AND regexp_replace(lower(branch.name), '[^[:alnum:]]', '', 'g')
    LIKE '%' || regexp_replace(lower(roster.location), '[^[:alnum:]]', '', 'g') || '%'
JOIN public.staff AS existing
  ON lower(trim(existing.full_name)) = lower(trim(roster.full_name))
  AND existing.position = roster.position
  AND existing.branch_id = branch.id
  AND existing.employment_status <> 'RESIGNED'
ORDER BY roster.row_number;

COMMIT;
