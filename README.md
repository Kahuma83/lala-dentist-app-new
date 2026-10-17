# Lala Dentist

Aplikasi web klinik dengan Supabase sebagai database dan autentikasi.

## Menjalankan aplikasi secara lokal

Prerequisite: Node.js dan akses ke project Supabase.

1. Pasang dependencies:

   ```powershell
   npm install
   ```

2. Salin `.env.example` menjadi `.env.local`, lalu isi:

   - `VITE_SUPABASE_URL`: Project URL dari Supabase **Project Settings → API**.
   - `VITE_SUPABASE_ANON_KEY`: publishable/anon key dari Supabase.
   - `SUPABASE_SERVICE_ROLE_KEY`: diperlukan oleh `server.js` untuk pencarian username sebelum login staf dan pembuatan akun login. Jangan beri nama `VITE_*` dan jangan masukkan ke kode browser.

   Untuk Cloudflare Pages, atur `SUPABASE_URL` sebagai variable dan `SUPABASE_SECRET_KEY` sebagai secret server-side pada **Settings → Variables and Secrets** untuk Production (dan Preview bila diperlukan). Gunakan Secret API key baru Supabase (`sb_secret_...`) untuk Pages Function `functions/api/auth/lookup-user.js`; function mengirim key tersebut hanya melalui header `apikey`. `SUPABASE_SERVICE_ROLE_KEY` masih didukung sebagai opsi kompatibilitas untuk key legacy. Jangan gunakan prefix `VITE_` pada secret apa pun.

   Agar logo identitas klinik tersimpan sebagai file publik (bukan data URL lokal), terapkan migration `20261016000002_create_clinic_branding_storage.sql` di Supabase. Setelah deployment, unggah ulang logo melalui **Konfigurasi → Identitas Dokumen** dan simpan agar login staf menggunakan URL logo yang dapat dibaca semua perangkat. Untuk foto dokter, foto/logo cabang, dan gambar promosi, terapkan migrations `20261016000003_create_clinic_doctor_portraits_storage.sql` dan `20261016000004_create_clinic_public_media_storage.sql`. Setelah deployment, sebagai Super Admin buka **Konfigurasi → Dokter** dan pilih **Pindahkan gambar base64 ke Storage**. Foto/gambar yang berhasil dipindahkan tetap ditampilkan melalui URL publik; gambar yang gagal tidak dihapus dari sumber.

   `.env.local` diabaikan oleh Git. Jangan kirim atau commit file ini.

3. Pastikan skema database aplikasi sudah diterapkan pada project Supabase. Jalankan migration SQL dari `supabase/migrations/` melalui Supabase CLI atau SQL Editor, secara berurutan. Migration `20261014000000_enable_app_realtime.sql` menambahkan tabel aplikasi ke publication `supabase_realtime`, `20261015000000_link_user_accounts_to_doctors.sql` menambahkan relasi akun login dokter, `20261015000001_prevent_duplicate_doctor_booking_slots.sql` mencegah booking aktif dokter pada cabang dan waktu yang sama termasuk permintaan bersamaan, `20261015000002_match_doctor_booking_slots_to_displayed_minute.sql` menyamakan validasi slot sampai presisi menit seperti yang ditampilkan di aplikasi, `20261015000003_add_walkin_preferred_service_time.sql` menyimpan perkiraan jam layanan walk-in yang dipilih, `20261015000004_fix_treatment_job_rls_for_clinical_staff.sql` memperbaiki izin RLS agar dokter/asisten dokter dapat mengelola job tindakan sesuai cabang dan visit, serta `20261015000005_create_secure_treatment_completion_rpc.sql` menyediakan RPC atomik untuk menyelesaikan job tindakan. Migration `20261016000000_fix_patient_visit_branch_rls.sql` memperbaiki validasi akses cabang untuk kunjungan dan antrean, `20261017000000_fix_clinical_branch_access.sql` memperbaiki pembacaan nama pasien serta akses tindakan medis per cabang, `20261018000000_allow_doctors_global_patient_history.sql` mengizinkan dokter aktif membaca profil pasien, kunjungan, dan rekam medis lintas cabang tanpa memperluas izin perubahan data, `20261019000000_fix_invoice_branch_rls.sql` memperbaiki validasi akses invoice berdasarkan cabang serta menghapus kebijakan fallback invoice yang terlalu permisif, `20261022000000_add_readable_invoice_and_visit_numbers.sql` menambahkan nomor invoice dan kunjungan yang mudah dibaca tanpa mengganti UUID internal, `20261023000000_fix_payment_transaction_branch_rls.sql` memperbaiki akses transaksi pembayaran per cabang serta memastikan cabang transaksi sama dengan cabang invoice, `20261024000000_add_readable_receipt_numbers.sql` menambahkan nomor kwitansi tersimpan dengan format yang mudah dibaca, `20261025000000_seed_standard_accounting_chart.sql` menambahkan akun standar yang dibutuhkan posting otomatis invoice, pembayaran, gaji, dan kompensasi tanpa menimpa COA yang sudah ada, `20261026000000_fix_chart_of_accounts_access.sql` memberi pengguna terautentikasi akses baca Bagan Akun global sambil membatasi perubahan akun kepada Super Admin, `20261027000000_secure_accounting_journal_rls.sql` memberi akses jurnal terbatas per cabang serta memvalidasi keseimbangan debit/kredit sebelum posting, `20261028000000_fix_branch_admin_journal_access.sql` memperbaiki resolusi cabang admin untuk kebijakan akses jurnal, dan `20261029000000_daily_rent_thr_accruals.sql` menambahkan pengaturan penyisihan harian sewa/THR, jurnal ringkasan bulanan, serta jadwal otomatis Supabase Cron pukul 00.05 WIB.

   Terapkan migration `20261017000001_extend_compensation_rule_scope.sql` untuk menambahkan cakupan layanan/cabang dan masa berlaku aturan kompensasi, lalu `20261017000002_harden_compensation_rls.sql` sebelum deploy versi kompensasi ini. Migration kedua membatasi akses aturan dan akrual dengan RLS serta memvalidasi akrual terhadap tindakan selesai dan aturan yang cocok. Aturan fee tindakan membutuhkan data dokter yang terhubung ke data karyawan melalui `dental_doctors.staff_id`. Akrual dibuat saat tindakan diselesaikan; tombol **Sinkronkan Akrual Tindakan** di tab log kompensasi dapat digunakan Super Admin untuk mencatat akrual yang tertinggal tanpa menggandakan akrual yang sudah ada.

   Migration lanjutan `20261030000000_add_patient_acquisition_source.sql` menambahkan sumber pasien yang opsional (berbeda dari kanal booking) dan nama pengajak untuk rujukan. Jalankan migration ini di Supabase sebelum memakai versi aplikasi yang memuat kolom tersebut.

   Migration `20261031000000_patient_portal_accounts.sql` membuat pemetaan akun pasien dari trigger Supabase Auth; role pasien ditentukan di database dan tidak dapat dipilih dari browser. Migration `20261101000000_auto_link_verified_patient_accounts.sql` menautkan akun pasien yang emailnya telah diverifikasi hanya jika email cocok tepat dengan satu profil pasien dan profil belum tertaut ke akun lain. Migration `20261102000000_provision_patient_profile_after_signup.sql` membuat profil klinik otomatis setelah email diverifikasi; data nama, nomor HP, tanggal lahir, jenis kelamin, dan alamat dikumpulkan saat pendaftaran. Migration `20261103000000_allow_verified_patient_auto_link.sql` mengizinkan hanya fungsi auto-link internal yang telah divalidasi untuk mengisi `patient_id`, sambil mempertahankan perlindungan terhadap perubahan langsung dari pengguna. Migration `20261104000000_issue_patient_rm_on_first_checkin.sql` membolehkan RM kosong sampai antrean check-in pertama dibuat; saat itu RM unik diterbitkan secara atomik dan dipertahankan pada check-in berikutnya. Booking yang dibatalkan sebelum check-in tidak menerbitkan RM. Migration `20261105000000_enable_patient_portal_booking.sql` mengaktifkan pengajuan janji temu dari portal pasien, mencatat kanal `PATIENT_PORTAL`, dan membatasi pasien agar hanya dapat membuat booking untuk profil tertautnya sendiri pada jadwal dokter aktif; pasien tidak dapat mengubah atau menghapus booking langsung. Profil pasien tetap global tanpa cabang wajib; pasien memilih salah satu cabang aktif saat booking, dan cabang dicatat pada booking atau kunjungan aktual. Endpoint server `/api/bookings` memvalidasi sesi, kepemilikan profil, cabang, dokter, dan jadwal. Karena itu, `SUPABASE_SERVICE_ROLE_KEY` harus tersedia hanya di lingkungan server dan tidak boleh memakai prefix `VITE_` atau dikirim ke browser. Email yang cocok dengan beberapa profil tidak ditautkan atau dibuatkan duplikat, sehingga perlu pemeriksaan staf. Untuk mengaktifkan pendaftaran, jalankan migration secara berurutan, aktifkan **Confirm email** pada Supabase Auth, dan tambahkan URL aplikasi beserta callback `/patient/login?type=signup-confirmed` ke daftar Redirect URLs Auth. Gunakan SMTP yang terkonfigurasi untuk mengirim tautan verifikasi. Halaman pasien terpisah dari staf: `/patient/login` dan `/patient/register`; halaman staf tetap `/login`.

   Terapkan migration `20261106000000_expose_scheduled_doctors_to_patient_portal.sql` setelah migration booking portal. Lalu terapkan `20261107000000_fix_patient_schedule_rls_recursion.sql`; migration lanjutan ini mencegah rekursi RLS saat portal membaca daftar dokter. Pasien dapat membaca jadwal aktif pada cabang aktif dan dokter aktif; booking tetap divalidasi hanya untuk slot jadwal yang cocok.

   Terapkan juga `20261108000000_patient_portal_history_access.sql` sebelum menggunakan versi portal yang menampilkan status antrean, riwayat kunjungan, invoice, dan kuitansi. Data dibatasi ke profil pasien yang sedang login; kebijakan database membatasi pasien ke akses baca untuk data tersebut dan mempertahankan pengelolaan pada staf klinik.

   Terapkan `20261109000000_prevent_multiple_active_patient_portal_bookings.sql` untuk membatasi pasien pada satu janji temu aktif sampai booking tersebut selesai, dibatalkan, atau ditandai tidak hadir. Pembatasan berlaku lintas tanggal dan cabang, serta diperiksa di portal, endpoint server, dan trigger database.

   Portal pasien memiliki dashboard responsif dan aset PWA tersendiri. Hostname `pasien.laladentist.id` otomatis membuka pengalaman pasien. Untuk hostname lain, atur `VITE_PATIENT_PORTAL_HOST` pada konfigurasi build/deployment. Daftarkan domain HTTPS portal dan callback `/patient/login?type=signup-confirmed` di Supabase Auth Redirect URLs. Manifest dan service worker hanya diaktifkan pada hostname portal yang dipilih; service worker tidak menyimpan respons API, sesi, atau data pasien offline.

   Untuk mengurangi transfer data, portal pasien hanya memuat data cabang, dokter, janji temu, kunjungan, antrean, invoice, dan pembayaran milik pasien, serta branding yang dibutuhkan. Sinkronisasi realtime mengelompokkan perubahan selama 500 ms dan menyegarkan cache tabel yang berubah, bukan seluruh data operasional.

4. Di Supabase Dashboard, pastikan Realtime aktif dan policies RLS pada tabel memberikan akses yang sesuai. Perubahan Realtime hanya dikirim kepada user yang berhak membaca baris berdasarkan policies tersebut.

5. Jalankan frontend dan backend lokal:

   ```powershell
   npm run dev
   ```

   Buka aplikasi di `http://localhost:3000`. `npm run dev` juga menjalankan backend pada port `3001`.

Jika konfigurasi Supabase belum diisi, aplikasi menolak login dan tidak menggunakan akun simulasi atau data lokal. Database kosong ditampilkan sebagai kosong; aplikasi tidak mengisi data contoh otomatis. Operasi di browser selalu menggunakan anon key dan tetap tunduk pada RLS; service-role key hanya boleh digunakan di server.

Data dokter dan staf dibuat dari menu data personel. Pembuatan akun login terpisah melalui aksi **Buat Akun**, dan membutuhkan `SUPABASE_SERVICE_ROLE_KEY` yang hanya tersedia di backend serta sesi Super Admin Supabase yang valid.

## Validasi

```powershell
npm test
npm run lint
npm run build
```

## Website informasi utama

Website publik yang terpisah dari aplikasi staf berada di folder `website/`. Beranda menampilkan banner Portal Pasien sebagai latar hero utama dengan manfaat booking online, pemantauan antrean, dan informasi kunjungan. Bagian “Start Your Smile Journey” berisi artikel panduan behel yang dapat dibaca langsung dengan satu tautan opsional untuk menjadwalkan konsultasi; foto ruang klinik menjadi media pendukung. Bagian cabang mencantumkan alamat dan jam operasional empat cabang aktif serta cabang Kampus yang segera hadir. Tombol WhatsApp menghubungkan pengunjung ke admin pada nomor klinik yang ditentukan di `website/index.html`. Logo dan foto menggunakan aset lokal di `website/assets/`. Tombol “Unduh aplikasi” membuka halaman pemasangan terpisah `/patient-install.html` di hostname portal pasien. Tombol “Pasang” meminta prompt instalasi PWA native jika browser mendukung; jika tidak, halaman menampilkan petunjuk pemasangan manual. Ini bukan aplikasi Android native atau unduhan APK. Untuk membuat Cloudflare Pages project tersendiri dari repository ini, gunakan branch `main`, set **Root directory** ke `website`, dan **Build output directory** ke `.`. Tidak diperlukan build command. Tambahkan variable `SUPABASE_URL` dan `SUPABASE_ANON_KEY` pada Cloudflare Pages project website agar fungsi `functions/api/site-content.js` dapat membaca konten terbit secara aman melalui RLS. Nilai anon key memang digunakan sebagai kunci publik; jangan gunakan service-role/secret key di website. Endpoint konten di-cache di edge Cloudflare selama 5 menit dan gambar CMS melalui `functions/api/site-media.js` selama 1 tahun dengan nama file unik, sehingga kunjungan berulang ke edge yang sama tidak mengunduh ulang konten/gambar dari Supabase. Cache miss, edge baru, atau penghapusan cache tetap dapat menimbulkan egress Supabase; caching mengurangi egress, bukan menjamin nol mutlak.

Pengelolaan hero, promosi, serta artikel tersedia di **Web Admin → Kelola Website** khusus Super Admin. Terapkan migration `20261113000000_public_website_cms.sql` pada project Supabase aplikasi sebelum memakai menu tersebut. Upload gambar CMS memakai bucket publik `clinic-public-media`, yang dibuat oleh migration `20261016000004_create_clinic_public_media_storage.sql`. Pengunjung hanya dapat membaca hero, promosi yang sedang dalam periode tayang, dan artikel yang sudah terbit; draft tetap tersembunyi oleh RLS. Promosi dan artikel mendukung tanggal tayang terjadwal. Jika konten website tidak muncul setelah migration diterapkan, periksa variable Cloudflare dan deployment Pages project website.

Tombol pemasangan di website utama membuka halaman mandiri `/patient-install.html` pada hostname Portal Pasien. Halaman ini memuat manifest sebelum meminta pemasangan; prompt native muncul bila didukung browser. Safari iPhone menampilkan petunjuk **Bagikan → Tambahkan ke Layar Utama**. Setelah prompt diterima, halaman pemasangan tetap terbuka dan menampilkan konfirmasi; login tersedia melalui tautan Login terpisah.
