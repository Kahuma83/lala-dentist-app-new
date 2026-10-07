import { describe, it, expect, beforeEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  UserRole,
  BackupType,
  BackupStatus,
  BackupScheduleInterval
} from "../types/domain";
import {
  MockBackupRepository,
  MockPatientRepository,
  MockVisitRepository,
  MockQueueRepository,
  MockTreatmentRepository,
  MockInvoiceRepository,
  MockPaymentRepository,
  MockPayrollRepository,
  MockAccountingRepository
} from "../repositories/mockRepositories";
import {
  SupabasePatientRepository,
  SupabaseQueueRepository,
  SupabaseMedicalRecordRepository,
  SupabasePromotionRepository
} from "../repositories/supabaseRepositories";
import {
  IBackupStorage,
  MockBackupStorage,
  GoogleDriveBackupStorage,
  BackupWorkerService,
  formatBackupFileName,
  computeChecksum
} from "../services/backupService";

describe("PHASE 10A — Supabase Foundation & Automated Google Drive Backup Tests", () => {
  let backupStorage: MockBackupStorage;
  let backupWorker: BackupWorkerService;
  let backupRepo: MockBackupRepository;

  beforeEach(() => {
    backupStorage = new MockBackupStorage();
    backupWorker = new BackupWorkerService(backupStorage);
    backupRepo = new MockBackupRepository();
  });

  // ===================================================================
  // 1. SUPABASE DATABASE SCHEMA MIGRATION & RLS AUDIT
  // ===================================================================
  describe("1. Supabase PostgreSQL Schema & Security RLS Audit", () => {
    const migrationPhase10Path = path.resolve(
      process.cwd(),
      "supabase/migrations/20260924000000_phase10a_medical_promotions_backup_storage.sql"
    );

    it("should have valid Phase 10A migration file with required tables", () => {
      expect(fs.existsSync(migrationPhase10Path)).toBe(true);
      const sql = fs.readFileSync(migrationPhase10Path, "utf-8");

      expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.clinical_medical_records");
      expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.promotion_media");
      expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.backup_jobs");
      expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.storage_objects_meta");
    });

    it("should enforce Row Level Security (RLS) policies on all clinical & backup tables", () => {
      const sql = fs.readFileSync(migrationPhase10Path, "utf-8");

      expect(sql).toContain("ALTER TABLE public.clinical_medical_records ENABLE ROW LEVEL SECURITY;");
      expect(sql).toContain("ALTER TABLE public.promotion_media ENABLE ROW LEVEL SECURITY;");
      expect(sql).toContain("ALTER TABLE public.backup_jobs ENABLE ROW LEVEL SECURITY;");
      expect(sql).toContain("ALTER TABLE public.storage_objects_meta ENABLE ROW LEVEL SECURITY;");

      // Super Admin policy
      expect(sql).toContain("Super Admin full control on backup jobs");
      expect(sql).toContain("SUPER_ADMIN");
    });
  });

  // ===================================================================
  // 2. REPOSITORY CONTRACTS & MAPPER INTEGRITY
  // ===================================================================
  describe("2. Supabase Repository Contracts & Graceful Validation", () => {
    it("should initialize Supabase repository instances conforming to interface contracts", () => {
      const patientRepo = new SupabasePatientRepository();
      const queueRepo = new SupabaseQueueRepository();
      const medRepo = new SupabaseMedicalRecordRepository();
      const promoRepo = new SupabasePromotionRepository();

      expect(typeof patientRepo.getPatients).toBe("function");
      expect(typeof queueRepo.getLiveQueueSnapshot).toBe("function");
      expect(typeof medRepo.finalizeMedicalRecord).toBe("function");
      expect(typeof promoRepo.getActivePromotions).toBe("function");
    });

    it("should throw explicit connection error if Supabase credentials are missing (No silent fallback in production)", async () => {
      const patientRepo = new SupabasePatientRepository();
      // When environment vars are missing or unconfigured, it must throw rather than silently corrupting state
      await expect(patientRepo.getPatientById("patient-nonexistent")).rejects.toThrow();
    });
  });

  // ===================================================================
  // 3. BACKUP FILE NAMING & CHECKSUM
  // ===================================================================
  describe("3. Standardized Backup File Naming & SHA-256 Checksum", () => {
    it("should format database backup filenames according to specifications", () => {
      const testDate = new Date(2026, 8, 24, 2, 0, 0); // 2026-09-24 02:00:00
      const fileName = formatBackupFileName(BackupType.DATABASE, testDate);
      expect(fileName).toBe("lala-dentist-db-2026-09-24-020000.sql.gz");
    });

    it("should format media archive filenames according to specifications", () => {
      const testDate = new Date(2026, 8, 24, 2, 0, 0);
      const fileName = formatBackupFileName(BackupType.MEDIA, testDate);
      expect(fileName).toBe("lala-dentist-media-2026-09-24-020000.tar.gz");
    });

    it("should compute deterministic SHA-256 checksums", () => {
      const payload1 = "Sample database dump content 123";
      const payload2 = "Sample database dump content 123";
      const payload3 = "Different database dump content";

      const hash1 = computeChecksum(payload1);
      const hash2 = computeChecksum(payload2);
      const hash3 = computeChecksum(payload3);

      expect(hash1).toBe(hash2);
      expect(hash1).not.toBe(hash3);
      expect(hash1.startsWith("sha256-")).toBe(true);
    });
  });

  // ===================================================================
  // 4. STORAGE ABSTRACTION & GOOGLE DRIVE DESTINATION
  // ===================================================================
  describe("4. Storage Provider Abstraction (IBackupStorage)", () => {
    it("should correctly upload, list, download, and delete via MockBackupStorage", async () => {
      const destination = "LALA DENTIST BACKUP/DATABASE/DAILY/test-db.sql.gz";
      const content = "-- TEST DUMP --";

      const uploadResult = await backupStorage.upload(destination, content);
      expect(uploadResult.path).toBe(destination);
      expect(uploadResult.sizeBytes).toBeGreaterThan(0);
      expect(uploadResult.checksum).toBeDefined();

      const exists = await backupStorage.exists(destination);
      expect(exists).toBe(true);

      const downloaded = await backupStorage.download(destination);
      expect(downloaded.content).toBe(content);
      expect(downloaded.checksum).toBe(uploadResult.checksum);

      const list = await backupStorage.list("LALA DENTIST BACKUP/DATABASE/DAILY");
      expect(list.length).toBe(1);
      expect(list[0].name).toBe("test-db.sql.gz");

      await backupStorage.delete(destination);
      const existsAfter = await backupStorage.exists(destination);
      expect(existsAfter).toBe(false);
    });

    it("should instantiate GoogleDriveBackupStorage with secure root folder structure", () => {
      const driveStorage = new GoogleDriveBackupStorage({ folderId: "gdrive-folder-123" });
      expect(driveStorage.providerName).toBe("GOOGLE_DRIVE");
    });
  });

  // ===================================================================
  // 5. BACKUP WORKER EXECUTION & MANIFEST VERIFICATION
  // ===================================================================
  describe("5. Backup Worker Execution, Manifest & Verification", () => {
    it("should execute a full database backup, verify checksum, and produce a manifest", async () => {
      const job = await backupWorker.runBackupJob({
        backupType: BackupType.DATABASE,
        intervalType: BackupScheduleInterval.DAILY,
        triggeredBy: "SUPER_ADMIN_MANUAL",
        currentUserRole: UserRole.SUPER_ADMIN
      });

      expect(job.status).toBe(BackupStatus.VERIFIED);
      expect(job.isVerified).toBe(true);
      expect(job.checksum).toBeDefined();
      expect(job.sizeBytes).toBeGreaterThan(0);
      expect(job.destination).toContain("LALA DENTIST BACKUP/DATABASE/DAILY/");
      expect(job.manifest).toBeDefined();
      expect(job.manifest?.tablesIncluded.length).toBeGreaterThan(15);
      expect(job.manifest?.isVerified).toBe(true);

      // Verify manifest file was written to storage
      const manifestPath = `LALA DENTIST BACKUP/MANIFEST/manifest-${job.id}.json`;
      const manifestExists = await backupStorage.exists(manifestPath);
      expect(manifestExists).toBe(true);
    });

    it("should execute media archive backup with separate media manifest", async () => {
      const job = await backupWorker.runBackupJob({
        backupType: BackupType.MEDIA,
        intervalType: BackupScheduleInterval.DAILY,
        triggeredBy: "SUPER_ADMIN_MANUAL",
        currentUserRole: UserRole.SUPER_ADMIN
      });

      expect(job.status).toBe(BackupStatus.VERIFIED);
      expect(job.backupType).toBe(BackupType.MEDIA);
      expect(job.destination).toContain("LALA DENTIST BACKUP/MEDIA/DAILY/");
    });

    it("should reject non-Super Admin users from triggering manual backups", async () => {
      await expect(
        backupWorker.runBackupJob({
          backupType: BackupType.DATABASE,
          currentUserRole: UserRole.BRANCH_ADMIN
        })
      ).rejects.toThrow(/Hanya Super Admin/);

      await expect(
        backupWorker.runBackupJob({
          backupType: BackupType.DATABASE,
          currentUserRole: UserRole.DOCTOR
        })
      ).rejects.toThrow(/Hanya Super Admin/);
    });
  });

  // ===================================================================
  // 6. BACKUP RETENTION POLICY
  // ===================================================================
  describe("6. Backup Retention Policy Enforcement", () => {
    it("should enforce Daily retention limit of 7 backups without deleting prematurely", async () => {
      // Run 9 daily backups
      for (let i = 0; i < 9; i++) {
        await backupWorker.runBackupJob({
          backupType: BackupType.DATABASE,
          intervalType: BackupScheduleInterval.DAILY,
          triggeredBy: "SYSTEM_SCHEDULE",
          currentUserRole: UserRole.SUPER_ADMIN
        });
      }

      const jobs = backupWorker.getJobs().filter(
        (j) => j.backupType === BackupType.DATABASE && j.intervalType === BackupScheduleInterval.DAILY && j.status === BackupStatus.VERIFIED
      );

      // Should retain maximum of 7 verified daily backups
      expect(jobs.length).toBeLessThanOrEqual(7);
    });
  });

  // ===================================================================
  // 7. DISASTER RECOVERY SIMULATION & DATA INTEGRITY
  // ===================================================================
  describe("7. Disaster Recovery Test & Consistency Audit", () => {
    it("should perform non-destructive disaster recovery simulation and verify zero orphans", async () => {
      // 1. Run fresh database backup
      const job = await backupWorker.runBackupJob({
        backupType: BackupType.DATABASE,
        intervalType: BackupScheduleInterval.DAILY,
        currentUserRole: UserRole.SUPER_ADMIN
      });

      // 2. Run DR Simulation
      const drResult = await backupWorker.runDisasterRecoverySimulation(job.id);

      expect(drResult.overallStatus).toBe("PASS");
      expect(drResult.schemaVerified).toBe(true);
      expect(drResult.integrityPassed).toBe(true);
      expect(drResult.orphanCheckPassed).toBe(true);
      expect(drResult.counts.patients).toBeGreaterThan(0);
      expect(drResult.counts.visits).toBeGreaterThan(0);
      expect(drResult.counts.invoices).toBeGreaterThan(0);
      expect(drResult.counts.payments).toBeGreaterThan(0);
      expect(drResult.counts.payrolls).toBeGreaterThan(0);
      expect(drResult.counts.journalEntries).toBeGreaterThan(0);
    });
  });

  // ===================================================================
  // 8. BACKUP REPOSITORY & SYSTEM MONITORING SUMMARY
  // ===================================================================
  describe("8. Super Admin Backup Repository & Monitoring UI Model", () => {
    it("should provide system summary with health and next scheduled time (02:00 WIB)", async () => {
      const summary = await backupRepo.getSystemSummary(UserRole.SUPER_ADMIN);

      expect(summary.systemHealth).toBe("HEALTHY");
      expect(summary.provider).toBe("GOOGLE_DRIVE");
      expect(summary.isConnected).toBe(true);
      expect(summary.nextScheduledBackupAt).toBe("02:00 WIB");
      expect(summary.lastDatabaseBackup).toBeDefined();
      expect(summary.lastMediaBackup).toBeDefined();
      expect(summary.recentJobs.length).toBeGreaterThan(0);
    });

    it("should forbid Branch Admin from reading backup history or trigger backups", async () => {
      await expect(backupRepo.getBackupJobs(UserRole.BRANCH_ADMIN)).rejects.toThrow(/Akses ditolak/);
      await expect(backupRepo.getSystemSummary(UserRole.BRANCH_ADMIN)).rejects.toThrow(/Akses ditolak/);
    });
  });
});
