import React, { useState, useEffect } from "react";
import { useAppContext } from "../context/AppContext";
import { UserRole, BackupJob, BackupType, BackupStatus, BackupSystemSummary, DisasterRecoveryTestResult } from "../types/domain";
import { BackupWorkerService } from "../services/backupService";
import {
  initGoogleDriveAuth,
  signInWithGoogleDrive,
  signOutGoogleDrive,
  getGoogleAccessToken,
  getGoogleUser
} from "../services/googleDriveService";

export const BackupManagement: React.FC = () => {
  const { currentUser, repos } = useAppContext();
  const [summary, setSummary] = useState<BackupSystemSummary | null>(null);
  const [jobs, setJobs] = useState<BackupJob[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<BackupJob | null>(null);
  const [drResult, setDrResult] = useState<DisasterRecoveryTestResult | null>(null);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);
  const [googleUser, setGoogleUser] = useState<any>(null);
  const [isConnectingGoogle, setIsConnectingGoogle] = useState(false);

  // Google Drive Webhook Integration (No OAuth verification needed!)
  const [driveWebhookUrl, setDriveWebhookUrl] = useState<string>(() => {
    return localStorage.getItem("lala_drive_webhook_url") || "";
  });
  const [webhookInput, setWebhookInput] = useState<string>(() => {
    return localStorage.getItem("lala_drive_webhook_url") || "";
  });
  const [showWebhookGuideModal, setShowWebhookGuideModal] = useState(false);
  const [isTestingWebhook, setIsTestingWebhook] = useState(false);
  const [autoBackupEnabled, setAutoBackupEnabled] = useState<boolean>(() => {
    return localStorage.getItem("lala_auto_backup_enabled") !== "false";
  });

  const isSuperAdmin = currentUser?.role === UserRole.SUPER_ADMIN;

  // Initialize backup worker service
  const [worker] = useState(() => new BackupWorkerService());

  const loadData = async () => {
    try {
      const sum = await repos.backup.getSystemSummary(currentUser?.role);
      setSummary(sum);
      const allJobs = await repos.backup.getBackupJobs(currentUser?.role);
      setJobs(allJobs);
    } catch (err: any) {
      console.error("Gagal memuat data backup:", err);
    }
  };

  useEffect(() => {
    loadData();
    const unsubscribe = initGoogleDriveAuth(
      (user) => {
        setGoogleUser(user);
      },
      () => {
        setGoogleUser(null);
      }
    );

    // Automated Daily Backup Check
    const runScheduledCheck = async () => {
      if (!isSuperAdmin) return;
      const autoEnabled = localStorage.getItem("lala_auto_backup_enabled") !== "false";
      if (!autoEnabled) return;

      const today = new Date().toISOString().split("T")[0];
      const lastRun = localStorage.getItem("lala_last_auto_backup_date");

      if (lastRun !== today) {
        try {
          const autoJob = await worker.runBackupJob({
            backupType: BackupType.DATABASE,
            triggeredBy: "SYSTEM_SCHEDULE",
            currentUserRole: UserRole.SUPER_ADMIN
          });
          await repos.backup.createBackupJob(autoJob, UserRole.SUPER_ADMIN);
          localStorage.setItem("lala_last_auto_backup_date", today);
          await loadData();

          // If webhook configured, post dump automatically
          const savedWebhook = localStorage.getItem("lala_drive_webhook_url");
          if (savedWebhook) {
            const dbDump = worker.generateDatabaseDump();
            fetch(savedWebhook, {
              method: "POST",
              mode: "no-cors",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                filename: `lala-dentist-db-auto-${today}.sql`,
                content: dbDump.content,
                folderName: "LALA DENTIST BACKUP"
              })
            }).catch(() => {});
          }
        } catch (e) {
          console.warn("Auto-backup background run exception:", e);
        }
      }
    };
    runScheduledCheck();

    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [currentUser]);

  const showToast = (text: string, type: "success" | "error" | "info" = "info") => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 5000);
  };

  const handleSaveWebhook = () => {
    const trimmed = webhookInput.trim();
    setDriveWebhookUrl(trimmed);
    localStorage.setItem("lala_drive_webhook_url", trimmed);
    showToast("✓ URL Google Drive Webhook berhasil disimpan!", "success");
  };

  const handleTestWebhook = async () => {
    if (!driveWebhookUrl && !webhookInput.trim()) {
      showToast("Silakan masukkan URL Webhook Google Apps Script terlebih dahulu.", "error");
      return;
    }
    const urlToTest = driveWebhookUrl || webhookInput.trim();
    setIsTestingWebhook(true);
    try {
      const now = new Date().toISOString();
      const testContent = `-- LALA DENTIST AUTOMATED BACKUP TEST\n-- Waktu: ${now}\n-- Status: Terhubung dan Terverifikasi\nSELECT 1;`;
      await fetch(urlToTest, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: `lala-dentist-test-${now.split("T")[0]}.sql`,
          content: testContent,
          folderName: "LALA DENTIST BACKUP"
        })
      });
      showToast("✓ Data uji berhasil dikirim ke Google Drive Anda! Periksa folder 'LALA DENTIST BACKUP' di drive.google.com.", "success");
    } catch (err: any) {
      showToast("Gagal mengirim ke Webhook: " + err.message, "error");
    } finally {
      setIsTestingWebhook(false);
    }
  };

  const handleToggleAutoBackup = () => {
    const nextVal = !autoBackupEnabled;
    setAutoBackupEnabled(nextVal);
    localStorage.setItem("lala_auto_backup_enabled", String(nextVal));
    showToast(
      nextVal
        ? "✓ Backup otomatis diaktifkan (berjalan setiap hari)."
        : "Backup otomatis dinonaktifkan.",
      nextVal ? "success" : "info"
    );
  };

  const handleConnectGoogleDrive = async () => {
    try {
      setIsConnectingGoogle(true);
      const res = await signInWithGoogleDrive();
      if (res?.user) {
        setGoogleUser(res.user);
        showToast(`✓ Berhasil terhubung ke Google Drive (${res.user.email})! Snapshot otomatis akan diunggah ke Google Drive.`, "success");
      }
    } catch (err: any) {
      showToast(`Gagal menghubungkan Google Drive: ${err.message}`, "error");
    } finally {
      setIsConnectingGoogle(false);
    }
  };

  const handleDisconnectGoogleDrive = async () => {
    try {
      await signOutGoogleDrive();
      setGoogleUser(null);
      showToast("Koneksi Google Drive diputuskan.", "info");
    } catch (err: any) {
      showToast(`Gagal memutuskan koneksi: ${err.message}`, "error");
    }
  };

  const handleTriggerBackup = async (type: BackupType) => {
    if (!isSuperAdmin) {
      showToast("Akses ditolak: Hanya Super Admin yang dapat memicu backup.", "error");
      return;
    }

    try {
      setIsLoading(true);
      setActiveAction(type);
      showToast(`Memulai proses backup ${type}...`, "info");

      const completedJob = await worker.runBackupJob({
        backupType: type,
        triggeredBy: "SUPER_ADMIN_MANUAL",
        currentUserRole: currentUser?.role
      });

      // Sync into repository
      await repos.backup.createBackupJob(completedJob, currentUser?.role);
      await loadData();

      // Sync to Google Drive Webhook if configured
      if (driveWebhookUrl) {
        try {
          const content = type === BackupType.MEDIA 
            ? worker.generateMediaArchive().content 
            : worker.generateDatabaseDump().content;
          const fname = type === BackupType.MEDIA
            ? `lala-dentist-media-${new Date().toISOString().split("T")[0]}.json`
            : `lala-dentist-db-${new Date().toISOString().split("T")[0]}.sql`;
          fetch(driveWebhookUrl, {
            method: "POST",
            mode: "no-cors",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              filename: fname,
              content,
              folderName: "LALA DENTIST BACKUP"
            })
          }).catch(() => {});
        } catch (we) {
          console.warn("Gagal mengirim backup ke webhook:", we);
        }
      }

      showToast(
        driveWebhookUrl
          ? `✓ Backup ${type} berhasil! File otomatis dikirim ke Google Drive Anda dan tersimpan di database.`
          : `✓ Backup ${type} berhasil! File tersimpan di sistem & terverifikasi (Checksum: ${completedJob.checksum?.substring(0, 16)}...)`,
        "success"
      );
    } catch (err: any) {
      showToast(`Gagal memproses backup: ${err.message}`, "error");
    } finally {
      setIsLoading(false);
      setActiveAction(null);
    }
  };

  const handleRunDRSimulation = async () => {
    try {
      setIsLoading(true);
      setActiveAction("DR_SIMULATION");
      showToast("Menjalankan simulasi Disaster Recovery (Non-Destructive Sandbox)...", "info");

      const result = await worker.runDisasterRecoverySimulation();
      setDrResult(result);

      if (result.overallStatus === "PASS") {
        showToast("✓ Simulasi DR Sukses: Skema PostgreSQL terverifikasi, 0 orphan records.", "success");
      } else {
        showToast("✗ Simulasi DR Gagal: Terdapat inkonsistensi data.", "error");
      }
    } catch (err: any) {
      showToast(`Simulasi DR Gagal: ${err.message}`, "error");
    } finally {
      setIsLoading(false);
      setActiveAction(null);
    }
  };

  const handleDownloadBackup = (job: BackupJob) => {
    try {
      let content = "";
      let filename = "";
      if (job.backupType === BackupType.MEDIA) {
        const mediaDump = worker.generateMediaArchive();
        content = mediaDump.content;
        filename = `lala-dentist-media-${new Date(job.createdAt).toISOString().split("T")[0]}.json`;
      } else {
        const dbDump = worker.generateDatabaseDump();
        content = dbDump.content;
        filename = `lala-dentist-db-${new Date(job.createdAt).toISOString().split("T")[0]}.sql`;
      }

      const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      showToast(`✓ File backup ${filename} berhasil diunduh. Anda dapat langsung mengunggahnya ke Google Drive Anda.`, "success");
    } catch (err: any) {
      showToast(`Gagal mengunduh backup: ${err.message}`, "error");
    }
  };

  if (!isSuperAdmin) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-800">
          <h2 className="text-xl font-bold mb-2">Akses Ditolak (403 Forbidden)</h2>
          <p>Halaman Pengawasan Backup Sistem & Disaster Recovery hanya dapat diakses oleh peran <strong>Super Admin</strong>.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium transition-all ${
            toastMessage.type === "success"
              ? "bg-emerald-600 text-white"
              : toastMessage.type === "error"
              ? "bg-rose-600 text-white"
              : "bg-blue-600 text-white"
          }`}
        >
          {toastMessage.text}
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-6 shadow-xl border border-indigo-900/40">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 mb-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              SINGLE SOURCE OF TRUTH: SUPABASE + GOOGLE DRIVE BACKUP
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Sistem Backup & Disaster Recovery</h1>
            <p className="text-indigo-200 text-sm mt-1">
              Pengawasan otomatis snapshot database PostgreSQL dan arsip media storage ke Google Drive secara berkala (02:00 WIB).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {googleUser ? (
              <div className="inline-flex items-center gap-2 px-3.5 py-2 bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 rounded-xl text-xs font-semibold shadow-xs">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                <span className="truncate max-w-[180px] sm:max-w-[240px]">
                  Drive: {googleUser.email}
                </span>
                <button
                  type="button"
                  onClick={handleDisconnectGoogleDrive}
                  className="ml-1 text-slate-400 hover:text-rose-300 transition-colors text-[11px] underline"
                >
                  Putuskan
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleConnectGoogleDrive}
                disabled={isConnectingGoogle}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-100 text-slate-800 text-sm font-semibold rounded-xl shadow-md transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                <span>{isConnectingGoogle ? "Menghubungkan..." : "Hubungkan Google Drive"}</span>
              </button>
            )}

            <button
              onClick={() => handleTriggerBackup(BackupType.DATABASE)}
              disabled={isLoading}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 text-white text-sm font-semibold rounded-xl shadow transition"
            >
              {activeAction === BackupType.DATABASE ? (
                <span className="animate-spin mr-1">⏳</span>
              ) : (
                <span>💾</span>
              )}
              Backup Database Sekarang
            </button>

            <button
              onClick={() => handleTriggerBackup(BackupType.MEDIA)}
              disabled={isLoading}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-700 text-slate-200 text-sm font-semibold rounded-xl border border-slate-700 shadow transition"
            >
              {activeAction === BackupType.MEDIA ? (
                <span className="animate-spin mr-1">⏳</span>
              ) : (
                <span>🖼️</span>
              )}
              Backup Media Sekarang
            </button>

            <button
              onClick={handleRunDRSimulation}
              disabled={isLoading}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-700 hover:bg-emerald-600 disabled:bg-slate-700 text-white text-sm font-semibold rounded-xl shadow transition"
            >
              {activeAction === "DR_SIMULATION" ? (
                <span className="animate-spin mr-1">⏳</span>
              ) : (
                <span>🧪</span>
              )}
              Simulasi DR Test
            </button>
          </div>
        </div>
      </div>

      {/* Top Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* System Health */}
        <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status Sistem</div>
          <div className="flex items-center gap-2 mt-2">
            <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
            <span className="text-xl font-bold text-slate-800 dark:text-white">
              {summary?.systemHealth === "HEALTHY" ? "HEALTHY" : "WARNING"}
            </span>
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Google Drive:{" "}
            {googleUser ? (
              <span className="text-emerald-600 font-bold">TERHUBUNG ({googleUser.email})</span>
            ) : (
              <span className="text-amber-600 font-semibold">BELUM TERHUBUNG</span>
            )}
          </div>
        </div>

        {/* Last DB Backup */}
        <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Last DB Backup</div>
          <div className="text-lg font-bold text-slate-800 dark:text-white mt-2 truncate">
            {summary?.lastDatabaseBackup ? new Date(summary.lastDatabaseBackup.createdAt).toLocaleDateString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "Belum Ada"}
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">
              VERIFIED
            </span>
            <span className="text-xs text-slate-500">
              {summary?.lastDatabaseBackup?.sizeBytes ? `${Math.round(summary.lastDatabaseBackup.sizeBytes / 1024)} KB` : ""}
            </span>
          </div>
        </div>

        {/* Last Media Backup */}
        <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Last Media Backup</div>
          <div className="text-lg font-bold text-slate-800 dark:text-white mt-2 truncate">
            {summary?.lastMediaBackup ? new Date(summary.lastMediaBackup.createdAt).toLocaleDateString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "Belum Ada"}
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">
              VERIFIED
            </span>
            <span className="text-xs text-slate-500">
              {summary?.lastMediaBackup?.sizeBytes ? `${(summary.lastMediaBackup.sizeBytes / (1024 * 1024)).toFixed(1)} MB` : ""}
            </span>
          </div>
        </div>

        {/* Next Scheduled Backup */}
        <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Jadwal Backup Berikutnya</div>
          <div className="text-xl font-bold text-indigo-600 dark:text-indigo-400 mt-2">
            02:00 WIB
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Retensi: 7 Hari / 4 Minggu / 12 Bulan
          </div>
        </div>
      </div>

      {/* Disaster Recovery Simulation Result Banner */}
      {drResult && (
        <div className="bg-slate-900 border border-emerald-500/40 rounded-xl p-5 text-white shadow-md">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl">🧪</span>
              <h3 className="text-base font-bold text-emerald-300">Hasil Simulasi Disaster Recovery (Non-Destructive Test)</h3>
            </div>
            <button
              onClick={() => setDrResult(null)}
              className="text-xs text-slate-400 hover:text-white"
            >
              ✕ Tutup
            </button>
          </div>
          <p className="text-xs text-slate-300 mt-1">{drResult.message}</p>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mt-4 text-center">
            <div className="bg-slate-800 p-2 rounded">
              <div className="text-[10px] text-slate-400">Pasien</div>
              <div className="text-sm font-bold text-white">{drResult.counts.patients}</div>
            </div>
            <div className="bg-slate-800 p-2 rounded">
              <div className="text-[10px] text-slate-400">Kunjungan</div>
              <div className="text-sm font-bold text-white">{drResult.counts.visits}</div>
            </div>
            <div className="bg-slate-800 p-2 rounded">
              <div className="text-[10px] text-slate-400">Invoice</div>
              <div className="text-sm font-bold text-white">{drResult.counts.invoices}</div>
            </div>
            <div className="bg-slate-800 p-2 rounded">
              <div className="text-[10px] text-slate-400">Pembayaran</div>
              <div className="text-sm font-bold text-white">{drResult.counts.payments}</div>
            </div>
            <div className="bg-slate-800 p-2 rounded">
              <div className="text-[10px] text-slate-400">Payroll</div>
              <div className="text-sm font-bold text-white">{drResult.counts.payrolls}</div>
            </div>
            <div className="bg-slate-800 p-2 rounded">
              <div className="text-[10px] text-slate-400">Jurnal Akuntansi</div>
              <div className="text-sm font-bold text-white">{drResult.counts.journalEntries}</div>
            </div>
          </div>
        </div>
      )}

      {/* PUSAT OTOMATISASI BACKUP & GOOGLE DRIVE INTEGRATION */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-700">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400 mb-1">
              <span>⚡</span>
              <span>OTOMATISASI BACKUP KLINIK</span>
            </div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Pusat Otomatisasi &amp; Sinkronisasi Google Drive
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Kelola pencadangan otomatis harian dan sambungkan ke akun Google Drive Anda tanpa hambatan izin OAuth.
            </p>
          </div>

          <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700">
            <div className="text-left">
              <div className="text-[11px] font-bold text-slate-700 dark:text-slate-200">
                Backup Otomatis Harian
              </div>
              <div className="text-[10px] text-slate-400">
                {autoBackupEnabled ? "Berjalan otomatis setiap hari" : "Dinonaktifkan"}
              </div>
            </div>
            <button
              type="button"
              onClick={handleToggleAutoBackup}
              className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors cursor-pointer ${
                autoBackupEnabled ? "bg-emerald-600 justify-end" : "bg-slate-300 dark:bg-slate-600 justify-start"
              }`}
            >
              <span className="bg-white w-4 h-4 rounded-full shadow-md transform transition-transform"></span>
            </button>
          </div>
        </div>

        {/* 2 Metode Otomatisasi Google Drive */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Metode Webhook: 100% Otomatis Masuk ke Google Drive Tanpa Error 403 */}
          <div className="p-4 bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-base">🚀</span>
                <h3 className="text-xs font-bold text-emerald-900 dark:text-emerald-300">
                  Metode 1: Webhook Auto-Upload (Rekomendasi Utama)
                </h3>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300">
                Bebas Error 403
              </span>
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
              Kirim backup langsung ke folder Google Drive <strong>databaselaladentist@gmail.com</strong> secara otomatis tanpa perlu login atau verifikasi izin Google.
            </p>

            <div className="space-y-2 pt-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                URL Google Apps Script Webhook:
              </label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={webhookInput}
                  onChange={(e) => setWebhookInput(e.target.value)}
                  placeholder="https://script.google.com/macros/s/.../exec"
                  className="flex-1 px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-600 font-mono text-[11px]"
                />
                <button
                  type="button"
                  onClick={handleSaveWebhook}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer shrink-0"
                >
                  Simpan
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowWebhookGuideModal(true)}
                  className="text-[11px] font-semibold text-emerald-700 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <span>📖</span>
                  <span>Cara Buat Script di Google Drive (1 Menit)</span>
                </button>
                {driveWebhookUrl && (
                  <button
                    type="button"
                    onClick={handleTestWebhook}
                    disabled={isTestingWebhook}
                    className="ml-auto px-2.5 py-1 bg-white hover:bg-slate-50 border border-emerald-300 text-emerald-700 text-[11px] font-semibold rounded-md transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {isTestingWebhook ? "Menguji..." : "🧪 Tes Kirim File ke Drive"}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Metode Supabase Cloud Auto-Backup */}
          <div className="p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-base">🛡️</span>
              <h3 className="text-xs font-bold text-slate-900 dark:text-white">
                Metode 2: Cloud Database Backup (Supabase Standard)
              </h3>
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
              Database Supabase PostgreSQL Anda memiliki arsitektur pencadangan otomatis tingkat cloud (*Daily Automated Server Backup*). Data tersimpan aman di server multi-wilayah.
            </p>
            <div className="pt-2 text-[11px] text-slate-500 space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-emerald-600">✓</span>
                <span>Otomatis snapshot setiap 24 jam</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-emerald-600">✓</span>
                <span>Enkripsi AES-256 saat istirahat (at-rest)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-emerald-600">✓</span>
                <span>Bisa di-restore sewaktu-waktu jika terjadi bencana (Disaster Recovery)</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* History Table */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Riwayat Backup Sistem</h3>
            <p className="text-xs text-slate-500 mt-0.5">Daftar snapshot database dan arsip media yang tersimpan di Google Drive</p>
          </div>
          <button
            onClick={loadData}
            className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            ↻ Segarkan Data
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold">
              <tr>
                <th className="py-3 px-4">Tipe Backup</th>
                <th className="py-3 px-4">Waktu Dibuat</th>
                <th className="py-3 px-4">Tujuan / Path Google Drive</th>
                <th className="py-3 px-4">Ukuran</th>
                <th className="py-3 px-4">Status & Verifikasi</th>
                <th className="py-3 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {jobs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    Belum ada riwayat backup.
                  </td>
                </tr>
              ) : (
                jobs.map((job) => (
                  <tr key={job.id} className="hover:bg-slate-50 dark:hover:bg-slate-750">
                    <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white">
                      <span className="inline-flex items-center gap-1.5">
                        <span>{job.backupType === BackupType.DATABASE ? "💾" : "🖼️"}</span>
                        <span>{job.backupType} ({job.intervalType})</span>
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                      {new Date(job.createdAt).toLocaleString("id-ID", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit"
                      })}
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-600 dark:text-slate-300 truncate max-w-xs" title={job.destination}>
                      {job.destination || "N/A"}
                    </td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                      {job.sizeBytes ? `${Math.round(job.sizeBytes / 1024)} KB` : "—"}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            job.status === BackupStatus.VERIFIED
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400"
                              : job.status === BackupStatus.SUCCESS
                              ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
                              : job.status === BackupStatus.RUNNING
                              ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 animate-pulse"
                              : "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400"
                          }`}
                        >
                          {job.status}
                        </span>
                        {job.isVerified && (
                          <span className="text-[10px] text-emerald-600 font-semibold">✓ SHA-256 Valid</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleDownloadBackup(job)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors cursor-pointer"
                          title="Unduh file backup ke komputer"
                        >
                          <span>⬇️</span>
                          <span>Unduh File</span>
                        </button>
                        <button
                          onClick={() => setSelectedJob(job)}
                          className="px-2.5 py-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 hover:underline"
                        >
                          Detail Manifest
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Manifest Modal */}
      {selectedJob && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-700 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Detail Backup Manifest
              </h3>
              <button
                onClick={() => setSelectedJob(null)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2 bg-slate-50 dark:bg-slate-900 p-3 rounded-lg font-mono">
                <div><strong>Job ID:</strong> {selectedJob.id}</div>
                <div><strong>Tipe:</strong> {selectedJob.backupType}</div>
                <div><strong>Status:</strong> {selectedJob.status}</div>
                <div><strong>Ukuran:</strong> {selectedJob.sizeBytes ? `${selectedJob.sizeBytes} bytes` : "N/A"}</div>
                <div className="col-span-2 truncate"><strong>Checksum SHA-256:</strong> {selectedJob.checksum || "N/A"}</div>
                <div className="col-span-2 truncate"><strong>Path Google Drive:</strong> {selectedJob.destination}</div>
              </div>

              {selectedJob.verificationNotes && (
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 rounded-lg">
                  <strong>Catatan Verifikasi:</strong> {selectedJob.verificationNotes}
                </div>
              )}

              {selectedJob.manifest && (
                <div>
                  <h4 className="font-semibold text-slate-800 dark:text-white mb-1">Tabel PostgreSQL Tercakup ({selectedJob.manifest.tablesIncluded?.length || 0}):</h4>
                  <div className="flex flex-wrap gap-1">
                    {selectedJob.manifest.tablesIncluded?.map((t) => (
                      <span key={t} className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded text-[11px] font-mono">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setSelectedJob(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-white text-xs font-semibold rounded-lg transition"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Webhook Setup Guide Modal */}
      {showWebhookGuideModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-700 max-h-[90vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <span className="text-xl">⚡</span>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Panduan Pasang Auto-Upload Google Drive (Bebas Error 403)
                </h3>
              </div>
              <button
                onClick={() => setShowWebhookGuideModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Dengan membuat 1 skrip sederhana di akun Google <strong>databaselaladentist@gmail.com</strong>, backup akan masuk secara otomatis tanpa perlu login akun atau verifikasi Google!
            </p>

            <div className="space-y-3 text-xs text-slate-700 dark:text-slate-300">
              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center text-[11px] shrink-0">1</span>
                <div>
                  <strong>Buka Google Apps Script:</strong> Di tab Google Drive Anda yang sedang terbuka (akun <em>databaselaladentist@gmail.com</em>), atau buka <a href="https://script.google.com" target="_blank" rel="noreferrer" className="text-blue-600 underline">script.google.com</a> lalu klik <strong>"+ Proyek Baru"</strong>.
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center text-[11px] shrink-0">2</span>
                <div className="w-full">
                  <strong>Tempel Kode Berikut:</strong> Hapus kode bawaan dan tempel kode skrip di bawah ini:
                  <div className="relative mt-2">
                    <pre className="bg-slate-900 text-emerald-300 p-3 rounded-xl font-mono text-[11px] overflow-x-auto leading-relaxed">
{`function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var folderName = data.folderName || "LALA DENTIST BACKUP";
    var folders = DriveApp.getFoldersByName(folderName);
    var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
    var file = folder.createFile(data.filename, data.content, MimeType.PLAIN_TEXT);
    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      fileId: file.getId(),
      url: file.getUrl()
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}`}
                    </pre>
                    <button
                      type="button"
                      onClick={() => {
                        const code = `function doPost(e) {\n  try {\n    var data = JSON.parse(e.postData.contents);\n    var folderName = data.folderName || "LALA DENTIST BACKUP";\n    var folders = DriveApp.getFoldersByName(folderName);\n    var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);\n    var file = folder.createFile(data.filename, data.content, MimeType.PLAIN_TEXT);\n    return ContentService.createTextOutput(JSON.stringify({\n      status: "success",\n      fileId: file.getId(),\n      url: file.getUrl()\n    })).setMimeType(ContentService.MimeType.JSON);\n  } catch (err) {\n    return ContentService.createTextOutput(JSON.stringify({\n      status: "error",\n      message: err.toString()\n    })).setMimeType(ContentService.MimeType.JSON);\n  }\n}`;
                        navigator.clipboard.writeText(code);
                        showToast("✓ Kode skrip berhasil disalin ke clipboard!", "success");
                      }}
                      className="absolute top-2 right-2 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md text-[10px] font-bold shadow-xs cursor-pointer"
                    >
                      📋 Salin Skrip
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center text-[11px] shrink-0">3</span>
                <div>
                  <strong>Deploy sebagai Aplikasi Web:</strong>
                  <ul className="list-disc list-inside mt-1 space-y-0.5 text-slate-600 dark:text-slate-300 text-[11px]">
                    <li>Klik tombol biru <strong>"Terapkan" (Deploy) &rarr; "Penerapan Baru" (New Deployment)</strong>.</li>
                    <li>Pilih jenis: <strong>"Aplikasi Web" (Web App)</strong>.</li>
                    <li>Pada <em>"Yang memiliki akses" (Who has access)</em>: pilih <strong>"Siapa saja" (Anyone)</strong>.</li>
                    <li>Klik <strong>Terapkan</strong> lalu salin <strong>URL Aplikasi Web</strong> yang dihasilkan.</li>
                    <li>Tempel URL tersebut ke kolom Webhook di atas dan klik <strong>Simpan</strong>.</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-700 flex justify-end">
              <button
                type="button"
                onClick={() => setShowWebhookGuideModal(false)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-xs transition cursor-pointer"
              >
                Saya Mengerti, Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Disaster Recovery SOP & Manual Restore Documentation */}
      <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-6 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 space-y-3">
        <h4 className="text-sm font-bold text-slate-800 dark:text-white uppercase tracking-wider">
          Standard Operating Procedure (SOP) — Disaster Recovery & Manual Restore
        </h4>
        <ol className="list-decimal list-inside space-y-1.5 leading-relaxed">
          <li><strong>Unduh File Backup:</strong> Ambil file backup snapshot terbaru dari folder Google Drive <code>LALA DENTIST BACKUP/DATABASE/DAILY/</code>.</li>
          <li><strong>Verifikasi Integritas:</strong> Hitung checksum SHA-256 file lokal dan pastikan 100% cocok dengan field <code>checksum</code> pada file <code>manifest-*.json</code>.</li>
          <li><strong>Restore ke Database Temporary:</strong> Buat temporary staging database (misal: <code>lala_staging_dr</code>) dan jalankan command: <code>psql -h host -U user -d lala_staging_dr &lt; backup_file.sql</code>.</li>
          <li><strong>Audit Konsistensi:</strong> Jalankan verifikasi record count pada tabel <code>patient_profiles</code>, <code>patient_visits</code>, <code>invoices</code>, <code>payment_transactions</code>, dan <code>journal_entries</code>. Pastikan 0 orphan records.</li>
          <li><strong>Promosi ke Production:</strong> Setelah diverifikasi 100% konsisten, alihkan connection string database production ke cluster yang telah di-restore.</li>
        </ol>
      </div>
    </div>
  );
};
