ALTER TABLE public.master_services
  ADD COLUMN IF NOT EXISTS code VARCHAR(80);

CREATE UNIQUE INDEX IF NOT EXISTS idx_master_services_code_unique
  ON public.master_services(code);

INSERT INTO public.master_services (
  id,
  code,
  name,
  description,
  base_price,
  estimated_duration_minutes,
  category,
  is_active
)
VALUES
  ('c0000000-0000-4000-8000-000000000001', 'CONSULTATION', 'Konsultasi', 'Konsultasi dan pemeriksaan kondisi gigi & mulut serta perencanaan perawatan.', 0, 15, 'CONSULTATION', true),
  ('c0000000-0000-4000-8000-000000000002', 'SCALING', 'Scaling', 'Pembersihan karang gigi menggunakan ultrasonic scaler diikuti polishing.', 150000, 30, 'PREVENTIVE', true),
  ('c0000000-0000-4000-8000-000000000003', 'FILLING_PERMANENT', 'Tambal permanen', 'Restorasi estetik gigi berlubang menggunakan bahan komposit resin sinar.', 200000, 45, 'RESTORATIVE', true),
  ('c0000000-0000-4000-8000-000000000004', 'EXTRACTION', 'Cabut', 'Pencabutan gigi permanen tanpa komplikasi.', 200000, 30, 'SURGERY', true),
  ('c0000000-0000-4000-8000-000000000005', 'BLEACHING', 'Bleaching', 'Pemutihan gigi estetik in-office.', 1500000, 60, 'AESTHETIC', true),
  ('c0000000-0000-4000-8000-000000000006', 'BRACKET_REMOVE', 'Bracket lepas', 'Pelepasan bracket behel atau penempelan kembali bracket lepas.', 100000, 20, 'ORTHODONTIC', true),
  ('c0000000-0000-4000-8000-000000000007', 'BRACKET_CONTROL_FULL', 'Kontrol behel RA & RB', 'Kontrol dan penggantian karet/kawat behel rahang atas dan rahang bawah.', 200000, 30, 'ORTHODONTIC', true),
  ('c0000000-0000-4000-8000-000000000008', 'BRACKET_CONTROL_SINGLE', 'Kontrol behel RA atau RB saja', 'Kontrol dan penggantian karet/kawat behel satu rahang saja.', 120000, 20, 'ORTHODONTIC', true),
  ('c0000000-0000-4000-8000-000000000009', 'ABSCESS_DRAINAGE', 'Drainase abses', 'Drainase dan evakuasi abses gigi/gusi.', 150000, 25, 'SURGERY', true),
  ('c0000000-0000-4000-8000-000000000010', 'GIPAL_INSERTION', 'Insersi GIPAL / Crown PFM', 'Pemasangan gigi tiruan lepasan akrilik atau mahkota tiruan Porcelain Fused to Metal.', 500000, 40, 'PROSTHODONTIC', true),
  ('c0000000-0000-4000-8000-000000000011', 'GIPAL_CEMENTATION', 'Lem GIPAL / Crown PFM', 'Sementasi ulang atau re-cement mahkota tiruan atau gigi tiruan lepasan.', 100000, 20, 'PROSTHODONTIC', true),
  ('c0000000-0000-4000-8000-000000000012', 'MEDICATION', 'Medikasi', 'Pemberian medikasi lokal, resep obat oral, atau antiseptik intraoral.', 50000, 15, 'TREATMENT', true),
  ('c0000000-0000-4000-8000-000000000013', 'ODONTECTOMY', 'Odontektomi', 'Bedah pencabutan gigi geraham bungsu impaksi.', 1200000, 60, 'SURGERY', true),
  ('c0000000-0000-4000-8000-000000000014', 'WIRE_CUT', 'Potong kawat', 'Pemotongan kawat behel yang menusuk atau berlebih.', 50000, 15, 'ORTHODONTIC', true),
  ('c0000000-0000-4000-8000-000000000015', 'POLYP_REMOVAL', 'Potong polip', 'Eksisi dan kauterisasi polip pulpa atau gingiva.', 150000, 25, 'SURGERY', true),
  ('c0000000-0000-4000-8000-000000000016', 'ROP', 'ROP', 'Root canal obturation and preparation pada perawatan saluran akar.', 150000, 30, 'TREATMENT', true),
  ('c0000000-0000-4000-8000-000000000017', 'VENEER', 'Veneer', 'Veneer direct komposit estetik untuk meratakan warna dan bentuk gigi.', 800000, 60, 'AESTHETIC', true),
  ('c0000000-0000-4000-8000-000000000018', 'GIPAL_SETTLEMENT', 'Pelunasan GIPAL', 'Pelunasan sisa biaya pembuatan gigi tiruan lepasan / crown.', 500000, 15, 'PROSTHODONTIC', true),
  ('c0000000-0000-4000-8000-000000000019', 'ABSCESS', 'Abses', 'Pemeriksaan dan tatalaksana infeksi abses gigi akut.', 100000, 20, 'TREATMENT', true),
  ('c0000000-0000-4000-8000-000000000020', 'OTHER', 'Yang lain', 'Tindakan klinis lainnya sesuai anjuran dan instruksi dokter.', 50000, 15, 'OTHER', true),
  ('c0000000-0000-4000-8000-000000000021', 'ROOT_CANAL', 'Perawatan Saluran Akar (PSA)', 'Perawatan syaraf gigi berlubang besar untuk menghindari pencabutan.', 400000, 60, 'TREATMENT', true)
ON CONFLICT (code) DO NOTHING;