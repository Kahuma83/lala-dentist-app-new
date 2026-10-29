# Modul Inventori Stok

## Pemasangan database

Jalankan berurutan:

1. `supabase/migrations/20261124000000_branch_inventory.sql` setelah seluruh migration dasar.
2. `supabase/migrations/20261125000000_inventory_treatment_recipes.sql` untuk pemakaian resep otomatis.
3. `supabase/migrations/20261126000000_lock_inventory_to_assigned_branch.sql` untuk mengunci akses inventori ke cabang akun.
4. `supabase/migrations/20261127000000_inventory_treatment_recipe_review.sql` untuk koreksi resep, validasi Dokter, dan audit perubahan.
5. `supabase/migrations/20261128000000_seed_treatment_inventory_items.sql` untuk menambahkan 16 master barang resep ke seluruh cabang aktif.
6. `supabase/migrations/20270110000000_allow_negative_treatment_stock.sql` untuk mengizinkan stok minus dari pemakaian treatment dan mengonversi kekurangan lama tanpa pemotongan ganda.

Di Supabase, gunakan migration workflow proyek atau buka SQL Editor, tempel seluruh isi file migration secara berurutan, lalu jalankan. Migration membuat:

- `inventory_items` untuk master barang dan saldo per cabang.
- `inventory_movements` sebagai ledger masuk/keluar yang tidak dapat diedit langsung oleh klien.
- RLS per cabang dan RPC `record_inventory_movement` untuk mengunci saldo serta menyimpan saldo sebelum/sesudah secara atomik. Pengeluaran manual tetap ditolak jika stok tidak cukup; pemakaian treatment boleh membuat stok minus.
- Migration pembatas akses memastikan semua pengguna selain Super Admin hanya dapat membaca serta membuat transaksi inventori pada cabang akun mereka. Pembatasan diterapkan pada RLS dan RPC, bukan hanya filter UI.
- RPC `record_inventory_treatment_usage` untuk mengurangi semua bahan resep dalam satu transaksi, mencegah pemotongan ganda, dan memperhitungkan pemakaian manual yang telah dicatat pada tindakan tersebut.
- Resep khusus cabang tersimpan pada `inventory_treatment_recipes`; usulan dan audit review tersimpan pada `inventory_treatment_recipe_changes`. Hanya resep yang disetujui yang dipakai untuk pengurangan otomatis.
- Jumlah resep standar untuk 21 jenis tindakan sesuai tabel klinik dikonfigurasi di `src/utils/inventoryTreatmentRecipes.ts`; kode barang pada inventori cabang harus sama dengan kode resep.
- Migration seed membuat barang dengan saldo dan stok minimum 0 supaya bisa dipilih untuk koreksi resep, tetapi tidak mengklaim stok fisik tersedia. Catat stok awal/pengadaan berdasarkan hasil hitung nyata sebelum tindakan memakai resep tersebut. Barang berkode sama yang sudah ada tidak ditimpa.

## Akses menu

- Super Admin: dapat melihat semua cabang dan memilih cabang; dapat membuat/mengubah/mengarsipkan barang serta mencatat pengadaan.
- Admin Cabang: hanya cabang akun sendiri; dapat mengelola master dan pengadaan cabang tersebut.
- Dokter dan Asisten Dokter: hanya dapat melihat stok cabang akun sendiri dan mencatat pemakaian di cabang tersebut. Pemakaian dari detail treatment otomatis ditautkan ke pasien, kunjungan, tindakan, petugas, dan waktu.
- Asisten Dokter, Dokter, Admin Cabang, dan Super Admin dapat mengajukan koreksi resep untuk cabang yang diizinkan. Dokter cabang atau Super Admin memvalidasi; usulan baru aktif setelah disetujui dan setiap status tersimpan untuk audit.

## Alur kerja

1. Buka **Inventori Stok → Tambah Barang**, tentukan cabang, kode, kategori, satuan, stok minimum, lokasi, dan saldo awal.
2. Catat penerimaan barang melalui aksi perubahan stok. Cantumkan referensi pengadaan dan harga satuan jika tersedia.
3. Di detail tindakan yang sedang berlangsung, periksa resep bahan otomatis. Untuk kontrol behel, pilih satu kode kawat/karet OR-003 sampai OR-006 yang benar-benar dipakai.
4. Klik **Selesaikan & Kurangi Stok**. Tindakan tetap dapat diselesaikan saat stok kurang; seluruh pemakaian resep dicatat sehingga saldo barang dapat menjadi minus. Jika kode barang belum terdaftar atau pemakaian otomatis gagal, tindakan tetap diselesaikan dan aplikasi menampilkan peringatan agar stok/data inventori diperiksa.
5. Stok masuk berikutnya menaikkan saldo minus secara alami. Kekurangan lama untuk barang yang belum terdaftar tetap direkonsiliasi saat barang dan stoknya tersedia. Pemakaian yang sudah dicatat manual untuk tindakan yang sama diperhitungkan agar jumlah resep tidak terpotong dua kali. Layanan Pelunasan GIPAL tidak mengurangi stok.
6. Buka **Inventori Stok → Resep Tindakan** untuk mengajukan koreksi bahan dan jumlah per layanan. Resep yang disetujui berlaku hanya di cabang tersebut.
7. Pantau status Aman, Menipis, atau Kritis dan buka Riwayat Perubahan untuk audit.

Jika aplikasi berjalan tanpa konfigurasi Supabase, data inventori disimpan lokal pada browser untuk mode pengembangan. Data lokal tersebut tidak tersinkron ke database produksi.
