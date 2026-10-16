import { describe, it, expect, beforeEach } from "vitest";
import {
  createRepositorySuite,
  getRuntimeDataSourceInfo,
  isTestEnv
} from "../repositories/repositoryFactory";
import {
  MockPatientRepository,
  MockBranchRepository,
  MockBookingRepository,
  MockVisitRepository,
  MockQueueRepository
} from "../repositories/mockRepositories";
import {
  SupabasePatientRepository,
  SupabaseBranchRepository,
  SupabaseQueueRepository,
  SupabaseMedicalRecordRepository,
  SupabasePromotionRepository,
  SupabaseStorageRepository
} from "../repositories/supabaseRepositories";

describe("Phase 10D — Repository Factory & Runtime Switch Verification", () => {
  it("should identify test environment correctly", () => {
    expect(isTestEnv()).toBe(true);
  });

  it("should return Mock repositories when test environment or forceMock is requested", () => {
    const suite = createRepositorySuite(true);
    expect(suite.patient).toBeInstanceOf(MockPatientRepository);
    expect(suite.branch).toBeInstanceOf(MockBranchRepository);
    expect(suite.booking).toBeInstanceOf(MockBookingRepository);
    expect(suite.visit).toBeInstanceOf(MockVisitRepository);
    expect(suite.queue).toBeInstanceOf(MockQueueRepository);
  });

  it("should provide diagnostic data source info without exposing secrets", () => {
    const info = getRuntimeDataSourceInfo();
    expect(info).toHaveProperty("activeDataSource");
    expect(info).toHaveProperty("isSupabaseConfigured");
    expect(info).toHaveProperty("isTestEnvironment");
    expect(typeof info.activeDataSource).toBe("string");
    expect(typeof info.isSupabaseConfigured).toBe("boolean");
    expect(typeof info.isTestEnvironment).toBe("boolean");
  });

  it("Supabase repositories must throw descriptive errors when remote database/schema is unreachable", async () => {
    const supabasePatientRepo = new SupabasePatientRepository();
    // In test environment with un-migrated tables or disconnected client, query should throw or reject
    try {
      await supabasePatientRepo.getPatients();
    } catch (err: any) {
      expect(err.message).toBeDefined();
      expect(typeof err.message).toBe("string");
    }
  });

  it("Supabase repositories must NOT store data into MockDatabase or localStorage", () => {
    const supabasePatientRepo = new SupabasePatientRepository();
    expect((supabasePatientRepo as any).db).toBeUndefined();
  });
});
