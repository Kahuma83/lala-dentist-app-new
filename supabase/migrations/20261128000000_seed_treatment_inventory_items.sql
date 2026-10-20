INSERT INTO public.inventory_items (
  branch_id,
  item_code,
  name,
  category,
  unit,
  current_stock,
  minimum_stock,
  is_active
)
SELECT
  branch.id,
  item.item_code,
  item.name,
  item.category,
  item.unit,
  0,
  0,
  true
FROM public.dental_branches branch
CROSS JOIN (
  VALUES
    ('AM-001', 'Masker Medis', 'ALAT_MEDIS', 'pcs'),
    ('AM-002', 'Sarung Tangan Medis', 'ALAT_MEDIS', 'pasang'),
    ('AM-003', 'Jarum Suntik', 'ALAT_MEDIS', 'pcs'),
    ('AM-004', 'Spuit/Suntikan', 'ALAT_MEDIS', 'pcs'),
    ('BT-001', 'Komposit Resin', 'BAHAN_TINDAKAN', 'porsi'),
    ('BT-002', 'Etching Gel', 'BAHAN_TINDAKAN', 'porsi'),
    ('BT-003', 'Bahan Bonding', 'BAHAN_TINDAKAN', 'porsi'),
    ('BT-006', 'Fluoride Gel', 'BAHAN_TINDAKAN', 'porsi'),
    ('BT-008', 'Bubuk Scaling', 'BAHAN_TINDAKAN', 'sachet'),
    ('BT-009', 'Larutan Antiseptik', 'BAHAN_TINDAKAN', 'ml'),
    ('BT-013', 'Kapas Gulung', 'BAHAN_TINDAKAN', 'btg'),
    ('OR-003', 'Kawat/Karet Behel OR-003', 'BAHAN_TINDAKAN', 'bungkus/pasang'),
    ('OR-004', 'Kawat/Karet Behel OR-004', 'BAHAN_TINDAKAN', 'bungkus/pasang'),
    ('OR-005', 'Kawat/Karet Behel OR-005', 'BAHAN_TINDAKAN', 'bungkus/pasang'),
    ('OR-006', 'Kawat/Karet Behel OR-006', 'BAHAN_TINDAKAN', 'bungkus/pasang'),
    ('OR-012', 'Lem/Semen Gigi Tiruan', 'BAHAN_TINDAKAN', 'porsi')
) AS item(item_code, name, category, unit)
WHERE branch.is_active = true
ON CONFLICT (branch_id, item_code) DO NOTHING;
