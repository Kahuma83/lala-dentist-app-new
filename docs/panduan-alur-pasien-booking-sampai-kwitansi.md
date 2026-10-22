# Panduan Alur Pasien: Booking atau Walk-In sampai Kwitansi

Panduan ini menjelaskan alur operasional di Lala Dentist Web Admin, mulai dari membuat janji atau menerima pasien datang langsung sampai kwitansi pembayaran dicetak. Nama menu di bawah mengikuti menu aplikasi untuk setiap jabatan.

## Ringkasan jabatan dan menu

| Jabatan | Menu utama dalam alur |
|---|---|
| Pasien | Portal Pasien untuk mengirim permintaan booking dan memeriksa status antrean. |
| Admin Cabang | Jadwal Pasien, Check-In Pasien, Antrean Klinik, Daftar Treatment, Invoice & Tagihan, Riwayat Pembayaran & Kwitansi, lalu Follow Up & Tindak Lanjut. Admin Cabang juga menjalankan fungsi kasir dalam alur ini. |
| Dokter | Antrean Dokter, Pasien & Rekam Medis, Treatment. |
| Asisten Dokter | Antrean Klinik, Pasien, Treatment. Insentif asisten dikelola di Portal Pegawai, bukan di aplikasi ini. Asisten dapat membantu memulai treatment, tetapi bukan pihak yang menyelesaikan atau menyerahkan treatment ke kasir. |

> Aplikasi tidak memiliki jabatan atau akun Kasir yang terpisah dalam alur ini. Penerimaan pembayaran dilakukan Admin Cabang melalui menu Invoice & Tagihan; riwayat pembayaran dan kwitansi tersedia di Riwayat Pembayaran & Kwitansi.

## A. Pasien dengan booking

### 1. Buat permintaan booking

**Pilihan 1 — pasien membuat sendiri**

1. Pasien masuk ke Portal Pasien dan membuka formulir janji temu.
2. Pilih cabang, dokter, tanggal, dan slot waktu yang tersedia.
3. Isi keluhan/catatan jika ada, lalu kirim permintaan janji temu.
4. Permintaan muncul dengan status menunggu konfirmasi klinik (*Pending*).

**Pilihan 2 — Admin Cabang mencatat booking dari telepon/WhatsApp atau meja depan**

1. Buka **Alur Pasien → Jadwal Pasien**.
2. Klik **Jadwal Baru** atau tombol tambah di kolom tanggal pada kalender mingguan.
3. Cari dan pilih profil pasien. Jika belum ada, pilih **+ Pasien Baru** di formulir jadwal, isi data pasien, lalu simpan dan pilih pasien tersebut.
4. Pilih cabang, dokter, tanggal, dan slot waktu; isi catatan atau rencana tindakan jika diperlukan.
5. Simpan booking. Booking yang dicatat admin tercatat sebagai permintaan *Pending*.

Booking juga dapat dibuat sendiri oleh pasien dari HP melalui alur **Online**. Pencarian pasien pada formulir jadwal hanya untuk menghubungkan janji temu ke profil pasien, bukan untuk mengelola database. Sumber jadwal dicatat sebagai Online, WhatsApp, Front Desk, atau Walk-In.

### 2. Konfirmasi jadwal H-1 (disarankan)

**Penanggung jawab:** Admin Cabang  
**Menu:** **Follow Up & Tindak Lanjut → Konfirmasi Booking H-1**

1. Buka daftar konfirmasi H-1 untuk tanggal operasional yang ditampilkan.
2. Hubungi pasien melalui kanal yang digunakan klinik.
3. Buka aksi/status konfirmasi pada booking yang sesuai.
4. Pilih hasil: **Sudah Dihubungi**, **Dikonfirmasi**, **Minta Reschedule**, **Tidak Merespons**, atau **Batal**.
5. Isi catatan/alasan seperlunya, lalu klik **Simpan Status H-1**.

Status H-1 adalah catatan tindak lanjut petugas. Saat pasien benar-benar datang, tetap lakukan check-in di langkah berikutnya.

Jika pasien meminta perubahan waktu, status **Minta Reschedule** hanya mencatat hasil konfirmasi. Untuk memindahkan jadwal, buka **Jadwal Pasien**, pilih booking yang belum check-in, lalu gunakan **Jadwal Ulang**. Pilih dokter, tanggal, dan slot kosong. Jadwal lama disimpan sebagai riwayat berstatus **Dijadwalkan ulang** dan jadwal baru ditautkan kepadanya; jadwal baru memiliki tindak lanjut H-1 sendiri. Jadwal yang sudah check-in, selesai, atau dibatalkan tidak dapat dijadwalkan ulang.

### 3. Check-in kedatangan dan masuk antrean

**Penanggung jawab:** Admin Cabang  
**Menu utama:** **Alur Pasien → Check-In Pasien**

1. Pada halaman **Check-In Pasien**, pilih jadwal pasien atau visit yang akan dilayani.
2. Untuk Walk-In yang sudah dijadwalkan, pilih jadwal dengan sumber **Walk-In**. Visit lama tanpa booking tetap dapat dipilih sebagai visit.
3. Periksa dokter dan keluhan/rencana kunjungan.
4. Atur estimasi durasi layanan bila perlu.
5. Klik **Check-In Sekarang**.
6. Pastikan muncul pesan berhasil dan pasien tercantum pada **Antrean Klinik**.

Tombol **Check-In** dari detail jadwal pasien mengarahkan petugas ke alur check-in yang sama. Gunakan satu jadwal saja untuk kedatangan yang sama; jangan membuat jadwal Walk-In baru jika pasien sudah mempunyai jadwal aktif.

### 4. Panggil pasien dan mulai konsultasi

**Penanggung jawab klinis:** Dokter; Asisten Dokter membantu persiapan dan operasional antrean.  
**Menu:** Dokter membuka **Antrean Dokter**; Asisten membuka **Antrean Klinik**. Admin Cabang dapat memantau/mengelola antrean melalui **Antrean Klinik**.

1. Cari nomor dan nama pasien yang sesuai di antrean cabang/dokter.
2. Petugas antrean dapat klik **Panggil** untuk memanggil pasien/persiapan.
3. Dokter atau Asisten klik **Mulai Konsultasi** saat konsultasi dimulai.
4. Dokter dapat membuka pasien dari antrean dan melengkapi pemeriksaan di **Pasien & Rekam Medis**.
5. Jika waktu tindakan berubah, gunakan **+ Waktu** atau ubah estimasi sesuai kebutuhan operasional.

### 5. Catat dan selesaikan treatment

**Menu:** **Treatment** untuk Dokter dan Asisten Dokter.

1. Pastikan visit/kunjungan pasien yang benar sedang aktif.
2. Buat *Treatment Job* untuk tindakan yang disetujui: pilih visit, layanan, dokter penanggung jawab, durasi, dan catatan yang diperlukan, lalu simpan.
3. Asisten Dokter dapat klik **Mulai** dan membantu menjalankan tindakan.
4. Dokter memeriksa hasil tindakan dan klik **Selesaikan**.
5. Setelah selesai, Dokter klik **Serahkan ke Kasir**.
6. Bila satu visit memiliki beberapa tindakan, ulangi sampai semua tindakan selesai/diserahkan. Antrean ditutup otomatis setelah seluruh treatment pada visit selesai.

**Pembagian kewenangan:** Asisten dapat membantu memulai treatment, tetapi hanya Dokter yang menyelesaikan tindakan dan menyerahkannya ke kasir. Admin Cabang tidak melakukan keputusan klinis.

### 6. Terbitkan invoice

**Penanggung jawab:** Admin Cabang (fungsi kasir)  
**Menu:** **Kasir → Invoice & Tagihan**

1. Pada bagian **Tindakan Selesai — Siap Ditagihkan**, cari nama pasien dan cabang yang benar.
2. Kunjungan hanya siap ditagihkan jika semua treatment berstatus **SELESAI** atau **DISERAHKAN** dan belum memiliki invoice aktif.
3. Klik **Buat Invoice**.
4. Periksa pasien, tindakan/layanan, tarif, jumlah, diskon, dan pajak.
5. Klik **Terbitkan Invoice**.
6. Pastikan invoice muncul di daftar. Jika perlu, gunakan aksi **Lihat Rincian / Riwayat** atau **Cetak Faktur / PDF / WhatsApp**.

Invoice adalah faktur/tagihan, bukan kwitansi bukti pembayaran.

### 7. Terima pembayaran

**Penanggung jawab:** Admin Cabang (fungsi kasir)  
**Menu:** **Kasir → Invoice & Tagihan**, tombol **Bayar**

1. Pilih invoice yang benar dan klik **Bayar**.
2. Pilih metode pembayaran: **Tunai (Cash)**, **QRIS**, **Transfer Bank / Kartu Debit**, atau **Asuransi / Lainnya**.
3. Masukkan nominal yang diterima. Tombol **Bayar Lunas (100%)** mengisi sisa tagihan; pembayaran sebagian dapat dilakukan jika pasien belum melunasi.
4. Masukkan nomor referensi/struk/approval code bila tersedia.
5. Klik **Konfirmasi Pembayaran**.
6. Pastikan transaksi tercatat. Akun petugas harus tertaut ke data staf; bila muncul pesan akun kasir belum tertaut, minta Super Admin menghubungkan akun tersebut melalui Manajemen SDM.

Pembayaran sebagian meninggalkan sisa tagihan pada invoice. Catat pembayaran berikutnya untuk sisa tersebut. Setiap transaksi pembayaran memiliki kwitansi tersendiri.

### 8. Buka dan cetak kwitansi

**Penanggung jawab:** Admin Cabang (fungsi kasir)  
**Menu:** **Kasir → Riwayat Pembayaran & Kwitansi**

1. Cari transaksi berdasarkan nama pasien, nomor invoice/kwitansi, metode, atau cabang.
2. Pada transaksi yang benar, klik **Kwitansi**.
3. Cocokkan nama pasien, nomor kwitansi, invoice, jumlah diterima, metode pembayaran, dan sisa tagihan.
4. Pilih salah satu aksi:
   - **Cetak (Print)** untuk mencetak melalui dialog printer browser.
   - **Unduh PDF (1 Lembar)** untuk menyimpan atau mencetak file PDF.
   - **Kirim WhatsApp** untuk mengirim ringkasan/dokumen ke pasien; periksa nomor tujuan sebelum mengirim.
5. Untuk pembayaran bertahap, ulangi dari transaksi pembayaran yang bersangkutan agar kwitansi menunjukkan nominal penerimaan transaksi tersebut.

## B. Pasien datang langsung (Walk-In)

Walk-In tidak memiliki janji yang dibuat sebelumnya, tetapi tetap dicatat sebagai jadwal pada slot dokter yang tersedia. Check-in tidak otomatis dilakukan saat jadwal dibuat. Tidak ada formulir Walk-In langsung yang melewati jadwal; semua pasien Walk-In memakai alur jadwal dan check-in yang sama.

1. Buka **Alur Pasien → Jadwal Pasien**, lalu klik **Jadwal Baru**.
2. Cari profil pasien atau tambahkan melalui **+ Pasien Baru** di formulir.
3. Pilih sumber **Walk-In**, lalu pilih dokter dan slot kosong yang tersedia pada jadwal dokter hari itu.
4. Simpan jadwal. Walk-In menempati slot yang sama seperti janji temu; sistem tidak menimpa jadwal pasien lain.
5. Jika waktunya sudah dekat dan pasien siap, lakukan **Check-In** dari detail jadwal. Jadwal Walk-In muncul bersama jadwal lain pada halaman Check-In Pasien. Jika slot masih lama, biarkan pasien terjadwal dan check-in saat waktunya mendekat.
6. Bila semua slot hari itu penuh, tawarkan slot kosong berikutnya. Setelah check-in, lanjutkan dari bagian **Panggil pasien dan mulai konsultasi** pada alur booking.
7. Setelah pemeriksaan dan treatment, lanjutkan dari **Terbitkan invoice**, **Terima pembayaran**, lalu **Buka dan cetak kwitansi**.

Jika aplikasi menyatakan pasien sudah memiliki booking aktif hari ini atau sudah berada dalam antrean, jangan ulangi sebagai Walk-In. Cari jadwal/visit pasien pada halaman Check-In Pasien untuk mencegah kunjungan atau antrean ganda.

## C. Impor profil dan riwayat kunjungan lama

**Penanggung jawab:** Super Admin

**Menu:** **Master Data → Data Pasien → Impor Riwayat Lama**

1. Siapkan workbook Excel dengan lembar **Profil Pasien** (satu baris per No. RM) dan **Data** (satu baris per kunjungan).
2. Unggah file, pilih cabang asal riwayat, lalu periksa jumlah profil dan kunjungan yang siap atau bermasalah.
3. Sistem mencocokkan pasien berdasarkan pasangan cabang dan No. RM lokal. RM yang sama di cabang berbeda tidak dianggap pasien yang sama. Jika RM cabang belum terdaftar, penautan ke profil yang ada hanya ditawarkan bila NIK cocok persis dan perlu konfirmasi khusus; kecocokan nama/telepon saja tidak menautkan pasien.
4. Periksa pratinjau dan konfirmasi sebelum menyimpan. Baris kunjungan tanpa No. RM yang cocok atau tanggal kunjungan valid tidak diimpor.
5. Kunjungan lama ditampilkan di **Riwayat Kunjungan** sebagai kunjungan selesai. Objektif, diagnosis, nama tindakan lama, dokter sumber, dan status lama disimpan sebagai catatan historis; nama tindakan tidak otomatis dipetakan ke katalog.

No. RM otomatis tetap diterbitkan pada check-in pertama di masing-masing cabang. Kode internal pasien dibentuk saat RM pertama terbit, memakai kode cabang dan nomor RM (contoh `GEB-RM0001` untuk Gebang). UUID pasien tetap menjadi identitas global; pasien yang berkunjung ke cabang lain dapat memiliki RM lokal tambahan tanpa mengubah RM lama.

Kode cabang Gebang ditetapkan **GEB**. Sebelum menerapkan migrasi [20261215000000_branch_scoped_patient_medical_record_numbers.sql](../supabase/migrations/20261215000000_branch_scoped_patient_medical_record_numbers.sql) ke database produksi, tinjau pemetaan RM lama untuk memastikan cabang asalnya benar. Migrasi sengaja berhenti jika cabang asal RM lama ambigu atau bertentangan; jangan mengatasi kegagalan dengan menghapus pemeriksaan tersebut.

Impor historis tidak membuat antrean, treatment job, invoice, tagihan, atau pemakaian stok. Impor ulang workbook yang sama tidak membuat kunjungan duplikat. Untuk menyimpan profil dengan tanggal lahir atau jenis kelamin kosong, pastikan migrasi Supabase [20261214000000_allow_incomplete_legacy_patient_profiles.sql](../supabase/migrations/20261214000000_allow_incomplete_legacy_patient_profiles.sql) sudah diterapkan.

## Alur ringkas per jabatan

| Tahap | Jabatan utama | Menu | Aksi utama |
|---|---|---|---|
| Booking online | Pasien | Online | Pilih cabang, dokter, tanggal/jam; kirim permintaan |
| Booking meja depan/telepon/WhatsApp | Admin Cabang | Jadwal Pasien | Cari/tambah profil pasien; pilih slot; catat sumber jadwal |
| Konfirmasi H-1 | Admin Cabang | Follow Up & Tindak Lanjut → Konfirmasi Booking H-1 | Hubungi pasien; pilih hasil dan simpan catatan |
| Kedatangan booking/walk-in | Admin Cabang | Jadwal Pasien → **Check-In** | Check-in saat pasien siap/waktunya mendekat; kunjungan masuk antrean |
| Panggil dan mulai antrean | Admin Cabang / Dokter / Asisten sesuai aksi | Antrean Klinik / Antrean Dokter | **Panggil**; Dokter/Asisten **Mulai Konsultasi** |
| Dokumentasi klinis | Dokter | Pasien & Rekam Medis | Catat pemeriksaan, diagnosis, dan rencana |
| Treatment | Dokter dan Asisten | Treatment | Asisten membantu **Mulai**; Dokter **Selesaikan** dan **Serahkan ke Kasir** |
| Tagihan | Admin Cabang/kasir | Invoice & Tagihan | **Buat Invoice**, cek rincian, **Terbitkan Invoice** |
| Pembayaran | Admin Cabang/kasir | Invoice & Tagihan → **Bayar** | Pilih metode/nominal/referensi; **Konfirmasi Pembayaran** |
| Bukti pembayaran | Admin Cabang/kasir | Riwayat Pembayaran & Kwitansi | Pilih transaksi → **Kwitansi** → cetak/PDF/WhatsApp |

## Pemeriksaan sebelum pasien meninggalkan klinik

- Visit dan antrean pasien yang benar sudah selesai.
- Semua treatment pada kunjungan sudah diselesaikan Dokter dan diserahkan ke kasir.
- Invoice sesuai layanan, tarif, diskon, dan pajak.
- Nominal pembayaran dan metode sesuai uang/konfirmasi yang diterima.
- Status sisa tagihan sudah dijelaskan bila pembayaran belum lunas.
- Kwitansi yang dicetak atau dikirim sesuai transaksi pembayaran yang baru dicatat.
