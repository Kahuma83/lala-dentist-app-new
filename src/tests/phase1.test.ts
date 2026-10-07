import { describe, it, expect, beforeEach } from "vitest";
import { UserRole, VisitType, VisitStatus, PatientProfile } from "../types/domain";
import { MockPatientRepository, MockVisitRepository, MockBranchRepository } from "../repositories/mockRepositories";
import { MockDatabase } from "../data/mockData";

describe("Lala Dentist Web Admin - Phase 1 Operational Core Tests", () => {
  let patientRepo: MockPatientRepository;
  let visitRepo: MockVisitRepository;
  let branchRepo: MockBranchRepository;

  beforeEach(() => {
    // Reset database singleton to clean state before each test
    MockDatabase.resetInstance();
    patientRepo = new MockPatientRepository();
    visitRepo = new MockVisitRepository();
    branchRepo = new MockBranchRepository();
  });

  // Test 1: Global Patient Profile (1 Patient Profile, 3 Visits across different branches)
  it("should support 1 global PatientProfile with multiple PatientVisits across Gebang, Muktisari, Ambulu", async () => {
    const patients = await patientRepo.getPatients();
    const budi = patients.find((p) => p.name === "Budi Setiawan");
    expect(budi).toBeDefined();

    const visits = await visitRepo.getVisitsByPatient(budi!.id);
    expect(visits.length).toBeGreaterThanOrEqual(3);

    const branchIds = visits.map((v) => v.branchId);
    expect(branchIds).toContain("branch-gebang");
    expect(branchIds).toContain("branch-muktisari");
    expect(branchIds).toContain("branch-ambulu");
  });

  // Test 2: Search Patient by RM Number (Case Insensitive)
  it("should search patients by Medical Record Number (case-insensitive)", async () => {
    const resultUpper = await patientRepo.searchPatients("RM-000001");
    expect(resultUpper.length).toBe(1);
    expect(resultUpper[0].name).toBe("Amanda Lestari");

    const resultLower = await patientRepo.searchPatients("rm-000001");
    expect(resultLower.length).toBe(1);
    expect(resultLower[0].name).toBe("Amanda Lestari");
  });

  // Test 3: Search Patient by WhatsApp / Phone Number
  it("should search patients by Phone Number", async () => {
    const results = await patientRepo.searchPatients("081299887766");
    expect(results.length).toBe(1);
    expect(results[0].name).toBe("Amanda Lestari");
  });

  // Test 4: Search Patient by Name (Partial & Case Insensitive)
  it("should search patients by partial Name case-insensitively", async () => {
    const results = await patientRepo.searchPatients("budi");
    expect(results.length).toBe(1);
    expect(results[0].name).toBe("Budi Setiawan");
  });

  // Test 5: Duplicate Detection Warning - Phone Number
  it("should detect potential duplicate patient by phone number", async () => {
    const dupCheck = await patientRepo.checkDuplicates("081299887766", undefined, undefined);
    expect(dupCheck.hasDuplicates).toBe(true);
    expect(dupCheck.byPhone.length).toBe(1);
    expect(dupCheck.byPhone[0].name).toBe("Amanda Lestari");
  });

  // Test 6: Duplicate Detection Warning - Medical Record Number
  it("should detect duplicate patient by Medical Record Number", async () => {
    const dupCheck = await patientRepo.checkDuplicates(undefined, "RM-000002", undefined);
    expect(dupCheck.hasDuplicates).toBe(true);
    expect(dupCheck.byRM.length).toBe(1);
    expect(dupCheck.byRM[0].name).toBe("Budi Setiawan");
  });

  // Test 7: Duplicate Detection Warning - Name
  it("should detect duplicate patient by exact or partial Name match", async () => {
    const dupCheck = await patientRepo.checkDuplicates(undefined, undefined, "Budi Setiawan");
    expect(dupCheck.hasDuplicates).toBe(true);
    expect(dupCheck.byName.length).toBe(1);
    expect(dupCheck.byName[0].name).toBe("Budi Setiawan");
  });

  // Test 8: Create Patient - Require Name
  it("should throw error if patient name is empty", async () => {
    await expect(
      patientRepo.createPatient({
        name: "   ",
        phone: "081999888777",
        dateOfBirth: "1990-01-01",
        gender: "L",
        address: "Jember"
      })
    ).rejects.toThrow("Nama pasien wajib diisi");
  });

  // Test 9: Create Patient - Auto Generate Medical Record Number (RM-000005)
  it("should auto-generate medical record number if not specified", async () => {
    const newPatient = await patientRepo.createPatient({
      name: "Eko Prasetyo",
      phone: "081999888777",
      dateOfBirth: "1990-01-01",
      gender: "L",
      address: "Jember"
    });

    expect(newPatient.medicalRecordNumber).toBe("RM-000005");
    expect(newPatient.id).toBeDefined();
  });

  // Test 10: Create Patient - Reject Duplicate RM Number
  it("should throw error if manually entered RM number already exists", async () => {
    await expect(
      patientRepo.createPatient({
        medicalRecordNumber: "RM-000001", // Already belongs to Amanda
        name: "Amanda Duplikat",
        phone: "081999111222",
        dateOfBirth: "1995-01-01",
        gender: "P",
        address: "Jember"
      })
    ).rejects.toThrow("Medical record number already exists");
  });

  // Test 11: Create Walk-In Visit - Must have bookingId = null
  it("should create WALK_IN visit with bookingId = null and status = WAITING", async () => {
    const patients = await patientRepo.getPatients();
    const patient = patients[0];

    const visit = await visitRepo.createVisit(
      {
        patientId: patient.id,
        branchId: "branch-gebang",
        visitType: VisitType.WALK_IN,
        visitStatus: VisitStatus.WAITING,
        bookingId: null,
        complaint: "Pemeriksaan sakit gigi mendadak"
      },
      UserRole.SUPER_ADMIN,
      null
    );

    expect(visit.visitType).toBe(VisitType.WALK_IN);
    expect(visit.bookingId).toBeNull();
    expect(visit.visitStatus).toBe(VisitStatus.WAITING);
    expect(visit.complaint).toBe("Pemeriksaan sakit gigi mendadak");
  });

  // Test 12: Reject Walk-In Visit with Non-Null bookingId
  it("should throw error if WALK_IN visit attempts to include a non-null bookingId", async () => {
    const patients = await patientRepo.getPatients();

    await expect(
      visitRepo.createVisit(
        {
          patientId: patients[0].id,
          branchId: "branch-gebang",
          visitType: VisitType.WALK_IN,
          bookingId: "booking-fake-123", // FORBIDDEN for WALK_IN
          complaint: "Walk in illegal booking id"
        },
        UserRole.SUPER_ADMIN,
        null
      )
    ).rejects.toThrow("WALK_IN visit must have bookingId = null");
  });

  // Test 13: Create BOOKING Visit - Require valid bookingId
  it("should create BOOKING visit when valid bookingId is supplied", async () => {
    const patients = await patientRepo.getPatients();

    const visit = await visitRepo.createVisit(
      {
        patientId: patients[0].id,
        branchId: "branch-gebang",
        visitType: VisitType.BOOKING,
        bookingId: "booking-1", // Valid existing booking
        complaint: "Konsultasi booking terkonfirmasi"
      },
      UserRole.SUPER_ADMIN,
      null
    );

    expect(visit.visitType).toBe(VisitType.BOOKING);
    expect(visit.bookingId).toBe("booking-1");
  });

  // Test 14: Reject BOOKING Visit without bookingId or with invalid bookingId
  it("should throw error when BOOKING visit has missing or invalid bookingId", async () => {
    const patients = await patientRepo.getPatients();

    await expect(
      visitRepo.createVisit(
        {
          patientId: patients[0].id,
          branchId: "branch-gebang",
          visitType: VisitType.BOOKING,
          bookingId: "non-existent-booking-id",
          complaint: "Booking tidak valid"
        },
        UserRole.SUPER_ADMIN,
        null
      )
    ).rejects.toThrow("Invalid bookingId for BOOKING visit type");
  });

  // Test 15: Branch Admin Security - Cannot create visit for another branch
  it("should prevent BRANCH_ADMIN from creating a visit for another branch", async () => {
    const patients = await patientRepo.getPatients();

    await expect(
      visitRepo.createVisit(
        {
          patientId: patients[0].id,
          branchId: "branch-muktisari", // Target is Muktisari
          visitType: VisitType.WALK_IN,
          bookingId: null,
          complaint: "Mencoba melewati cabang"
        },
        UserRole.BRANCH_ADMIN,
        "branch-gebang" // Admin assigned to Gebang
      )
    ).rejects.toThrow("Branch Admin cannot create visit for another branch");
  });

  // Test 16: Branch Admin Security - Allowed to create visit for assigned branch
  it("should allow BRANCH_ADMIN to create visit for assigned branch", async () => {
    const patients = await patientRepo.getPatients();

    const visit = await visitRepo.createVisit(
      {
        patientId: patients[0].id,
        branchId: "branch-gebang",
        visitType: VisitType.WALK_IN,
        bookingId: null,
        complaint: "Kunjungan resmi cabang Gebang"
      },
      UserRole.BRANCH_ADMIN,
      "branch-gebang"
    );

    expect(visit.branchId).toBe("branch-gebang");
  });

  // Test 17: Branch Admin Security - Cannot access visits for another branch via getVisitsByBranch
  it("should throw error if BRANCH_ADMIN accesses visits of another branch", async () => {
    await expect(
      visitRepo.getVisitsByBranch("branch-ambulu", UserRole.BRANCH_ADMIN, "branch-gebang")
    ).rejects.toThrow("Branch Admin cannot access visits for another branch");
  });

  // Test 18: Super Admin can create visit for any branch
  it("should allow SUPER_ADMIN to create visit for any branch", async () => {
    const patients = await patientRepo.getPatients();

    const visitGebang = await visitRepo.createVisit(
      {
        patientId: patients[0].id,
        branchId: "branch-gebang",
        visitType: VisitType.WALK_IN,
        bookingId: null
      },
      UserRole.SUPER_ADMIN,
      null
    );

    const visitAmb = await visitRepo.createVisit(
      {
        patientId: patients[1].id,
        branchId: "branch-ambulu",
        visitType: VisitType.WALK_IN,
        bookingId: null
      },
      UserRole.SUPER_ADMIN,
      null
    );

    expect(visitGebang.branchId).toBe("branch-gebang");
    expect(visitAmb.branchId).toBe("branch-ambulu");
  });

  // Test 19: Reject Visit Creation for non-existent Patient ID
  it("should reject visit creation if patientId does not exist", async () => {
    await expect(
      visitRepo.createVisit(
        {
          patientId: "non-existent-patient-999",
          branchId: "branch-gebang",
          visitType: VisitType.WALK_IN,
          bookingId: null
        },
        UserRole.SUPER_ADMIN,
        null
      )
    ).rejects.toThrow("Invalid patientId: Patient not found");
  });

  // Test 20: Reject Visit Creation for non-existent Branch ID
  it("should reject visit creation if branchId does not exist", async () => {
    const patients = await patientRepo.getPatients();

    await expect(
      visitRepo.createVisit(
        {
          patientId: patients[0].id,
          branchId: "non-existent-branch-999",
          visitType: VisitType.WALK_IN,
          bookingId: null
        },
        UserRole.SUPER_ADMIN,
        null
      )
    ).rejects.toThrow("Invalid branchId: Branch not found");
  });

  // Test 21: Update Patient Information
  it("should update patient profile information correctly", async () => {
    const patients = await patientRepo.getPatients();
    const target = patients[0];

    const updated = await patientRepo.updatePatient(target.id, {
      address: "Jl. Riau No. 45, Jember Baru",
      medicalHistoryNotes: "Diperbarui: Alergi penicillin & aspirin"
    });

    expect(updated.address).toBe("Jl. Riau No. 45, Jember Baru");
    expect(updated.medicalHistoryNotes).toBe("Diperbarui: Alergi penicillin & aspirin");
  });

  // Test 22: Update Visit Status
  it("should update visit status successfully", async () => {
    const visits = await visitRepo.getVisits();
    const targetVisit = visits[0];

    const updated = await visitRepo.updateVisitStatus(
      targetVisit.id,
      VisitStatus.IN_TREATMENT,
      UserRole.SUPER_ADMIN,
      null
    );

    expect(updated.visitStatus).toBe(VisitStatus.IN_TREATMENT);
  });

  // Test 23: Branch Admin Security - Cannot update visit status of another branch
  it("should prevent BRANCH_ADMIN from updating visit status of another branch", async () => {
    const visits = await visitRepo.getVisits();
    // Find visit in Muktisari
    const muktisariVisit = visits.find((v) => v.branchId === "branch-muktisari");
    expect(muktisariVisit).toBeDefined();

    await expect(
      visitRepo.updateVisitStatus(
        muktisariVisit!.id,
        VisitStatus.COMPLETED,
        UserRole.BRANCH_ADMIN,
        "branch-gebang" // Admin assigned to Gebang
      )
    ).rejects.toThrow("Branch Admin cannot update visit for another branch");
  });

  // Test 24: Patient Profile maintains stable ID across branch visits
  it("should verify patient ID remains stable across visits in different branches", async () => {
    const patients = await patientRepo.getPatients();
    const budi = patients.find((p) => p.name === "Budi Setiawan");

    const budiVisits = await visitRepo.getVisitsByPatient(budi!.id);
    budiVisits.forEach((v) => {
      expect(v.patientId).toBe(budi!.id);
    });
  });

  // Test 25: Ensure Walk-In Flow never creates a Booking record
  it("should ensure Walk-In registration never creates a fake booking record in database", async () => {
    const initialBookingsCount = MockDatabase.getInstance().bookings.length;
    const patients = await patientRepo.getPatients();

    await visitRepo.createVisit(
      {
        patientId: patients[0].id,
        branchId: "branch-gebang",
        visitType: VisitType.WALK_IN,
        bookingId: null,
        complaint: "Pemeriksaan cepat"
      },
      UserRole.SUPER_ADMIN,
      null
    );

    const finalBookingsCount = MockDatabase.getInstance().bookings.length;
    expect(finalBookingsCount).toBe(initialBookingsCount); // Zero new booking entries created
  });
});
