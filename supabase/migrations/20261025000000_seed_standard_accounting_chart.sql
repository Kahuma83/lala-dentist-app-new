-- Seed the global chart of accounts required by automatic invoice,
-- payment, payroll, and compensation journal posting.
INSERT INTO public.chart_of_accounts (
  code,
  name,
  account_type,
  account_category,
  normal_balance,
  is_active,
  description
)
VALUES
  ('1000', 'Kas (Cash)', 'ASSET', 'CASH', 'DEBIT', true, 'Kas fisik kasir dan operasional cabang'),
  ('1010', 'Bank & QRIS Settlement', 'ASSET', 'BANK', 'DEBIT', true, 'Rekening bank operasional dan penampungan QRIS'),
  ('1100', 'Piutang Pasien (Accounts Receivable)', 'ASSET', 'ACCOUNTS_RECEIVABLE', 'DEBIT', true, 'Tagihan invoice perawatan pasien'),
  ('2000', 'Hutang Usaha & Supplier', 'LIABILITY', 'ACCOUNTS_PAYABLE', 'CREDIT', true, 'Kewajiban pembayaran supplier dan vendor'),
  ('2010', 'Hutang Gaji Staff', 'LIABILITY', 'PAYROLL_PAYABLE', 'CREDIT', true, 'Akrual gaji staff yang belum dibayarkan'),
  ('2020', 'Hutang Jasa Dokter', 'LIABILITY', 'DOCTOR_PAYABLE', 'CREDIT', true, 'Bagi hasil dan honor dokter yang belum dibayarkan'),
  ('2030', 'Hutang Insentif & Kompensasi', 'LIABILITY', 'INCENTIVE_PAYABLE', 'CREDIT', true, 'Kewajiban bonus dan insentif staff'),
  ('2040', 'Hutang Pajak', 'LIABILITY', 'TAX_PAYABLE', 'CREDIT', true, 'Pajak yang belum disetorkan'),
  ('3000', 'Modal Pemilik', 'EQUITY', 'OWNER_CAPITAL', 'CREDIT', true, 'Setoran modal klinik'),
  ('3100', 'Laba Ditahan', 'EQUITY', 'RETAINED_EARNINGS', 'CREDIT', true, 'Akumulasi laba bersih periode sebelumnya'),
  ('4000', 'Pendapatan Tindakan Medis', 'REVENUE', 'TREATMENT_REVENUE', 'CREDIT', true, 'Pendapatan dari layanan medis klinik'),
  ('4100', 'Pendapatan Lain-lain', 'REVENUE', 'OTHER_REVENUE', 'CREDIT', true, 'Pendapatan lain di luar layanan medis'),
  ('5000', 'Beban Gaji Staff', 'EXPENSE', 'SALARY_EXPENSE', 'DEBIT', true, 'Beban gaji pokok staff'),
  ('5010', 'Beban Bagi Hasil Dokter', 'EXPENSE', 'DOCTOR_FEE_EXPENSE', 'DEBIT', true, 'Beban komisi dan fee dokter'),
  ('5020', 'Beban Insentif Staff', 'EXPENSE', 'INCENTIVE_EXPENSE', 'DEBIT', true, 'Beban bonus dan insentif staff'),
  ('5030', 'Beban Sewa Gedung', 'EXPENSE', 'RENT_EXPENSE', 'DEBIT', true, 'Beban sewa lokasi klinik'),
  ('5040', 'Beban Utilitas', 'EXPENSE', 'UTILITIES_EXPENSE', 'DEBIT', true, 'Beban listrik, air, dan internet'),
  ('5050', 'Beban Bahan & Perlengkapan Medis', 'EXPENSE', 'SUPPLIES_EXPENSE', 'DEBIT', true, 'Pemakaian bahan medis dan perlengkapan'),
  ('5060', 'Beban Pemasaran & Iklan', 'EXPENSE', 'MARKETING_EXPENSE', 'DEBIT', true, 'Beban promosi dan pemasaran'),
  ('5090', 'Beban Operasional Lainnya', 'EXPENSE', 'OTHER_OPERATING_EXPENSE', 'DEBIT', true, 'Beban operasional klinik lainnya')
ON CONFLICT (code) DO NOTHING;
