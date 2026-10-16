/**
 * LALA DENTIST - CENTRAL REPOSITORY BARREL & DATA LAYER PROVIDER
 * Strict Supabase Provider architecture with isolated Mock Repositories.
 *
 * Requirements (Opsi A):
 * 1. Strict Supabase Provider: Ketika kredensial Supabase terkonfigurasi di lingkungan aplikasi,
 *    paksa seluruh modul (Pasien, Booking, Jadwal, Invoice, dll.) untuk menggunakan SupabaseRepository secara eksklusif.
 * 2. Hapus Silent Write Fallback: Nonaktifkan pengalihan otomatis (fallback) penyimpanan data ke MockRepository
 *    jika request Supabase gagal/offline. Sebaliknya, lemparkan (throw) pesan kesalahan yang jelas ke antarmuka pengguna
 *    agar admin mengetahui bahwa data tidak tersimpan akibat masalah koneksi server.
 * 3. Isolasi Mock Repository: Pastikan MockRepository hanya diaktifkan saat pengujian otomatis (test environment)
 *    atau ketika kredensial Supabase sama sekali tidak disediakan di file environment.
 */

export * from "./interfaces";
export * from "./repositoryFactory";
export * from "./supabaseRepositories";
export * from "./mockRepositories";
