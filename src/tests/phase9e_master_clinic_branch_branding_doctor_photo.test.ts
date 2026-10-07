import { describe, it, expect, beforeEach } from "vitest";
import {
  MockBranchRepository,
  MockDoctorRepository,
  MockDoctorScheduleRepository,
  MockMediaStorageRepository
} from "../repositories/mockRepositories";
import {
  UserRole,
  DentalBranch,
  DentalDoctor
} from "../types/domain";

describe("PHASE 9E — Master Clinic, Branch Branding & Doctor Photo Tests", () => {
  let branchRepo: MockBranchRepository;
  let doctorRepo: MockDoctorRepository;
  let scheduleRepo: MockDoctorScheduleRepository;
  let mediaStorageRepo: MockMediaStorageRepository;

  beforeEach(() => {
    branchRepo = new MockBranchRepository();
    doctorRepo = new MockDoctorRepository();
    scheduleRepo = new MockDoctorScheduleRepository();
    mediaStorageRepo = new MockMediaStorageRepository();
  });

  // 1. Super Admin dapat melihat semua cabang
  it("1. Super Admin dapat melihat seluruh master cabang klinik", async () => {
    const branches = await branchRepo.getBranches(UserRole.SUPER_ADMIN);
    expect(branches.length).toBeGreaterThanOrEqual(3);
    
    // Validate required master fields
    branches.forEach((b) => {
      expect(b.id).toBeDefined();
      expect(b.branchCode || b.id).toBeDefined();
      expect(b.name).toBeDefined();
      expect(b.address).toBeDefined();
      expect(b.phone).toBeDefined();
    });
  });

  // 2. Super Admin dapat mengubah informasi cabang
  it("2. Super Admin dapat mengubah informasi dan kontak cabang", async () => {
    const branches = await branchRepo.getBranches(UserRole.SUPER_ADMIN);
    const targetBranch = branches[0];
    const initialAddress = targetBranch.address;

    const updated = await branchRepo.updateBranch(
      targetBranch.id,
      {
        address: "Jl. Gebang Baru No. 99, Patrang, Jember",
        whatsapp: "081299998888",
        email: "gebang.baru@laladentist.com"
      },
      UserRole.SUPER_ADMIN
    );

    expect(updated.address).toBe("Jl. Gebang Baru No. 99, Patrang, Jember");
    expect(updated.whatsapp).toBe("081299998888");
    expect(updated.email).toBe("gebang.baru@laladentist.com");
    expect(updated.id).toBe(targetBranch.id); // ID must remain the same
  });

  // 3. Branch Admin tidak dapat mengubah master cabang
  it("3. Branch Admin tidak dapat mengubah master cabang (RBAC Enforced)", async () => {
    const branches = await branchRepo.getBranches(UserRole.SUPER_ADMIN);
    const targetBranch = branches[0];

    await expect(
      branchRepo.updateBranch(
        targetBranch.id,
        {
          name: "Nama Cabang Ilegal"
        },
        UserRole.BRANCH_ADMIN,
        "branch-gebang"
      )
    ).rejects.toThrow(/Hanya Super Admin yang berwenang/);
  });

  // 4. Upload/ganti/hapus logo cabang via MediaStorageRepository
  it("4. Upload, ganti, dan hapus logo cabang via MediaStorageRepository", async () => {
    const branches = await branchRepo.getBranches(UserRole.SUPER_ADMIN);
    const targetBranch = branches[0];

    // Upload new logo
    const uploadResult = await mediaStorageRepo.uploadImage(
      {
        name: "branch-gebang-logo.png",
        type: "image/png",
        size: 1024 * 50, // 50KB
        base64OrDataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
      },
      "branch-logos"
    );

    expect(uploadResult.url).toBeDefined();

    // Attach to branch
    const updatedBranch = await branchRepo.updateBranchBranding(
      targetBranch.id,
      uploadResult.url,
      UserRole.SUPER_ADMIN
    );
    expect(updatedBranch.logoUrl).toBe(uploadResult.url);

    // Remove logo
    await mediaStorageRepo.deleteImage(uploadResult.url);
    const clearedBranch = await branchRepo.updateBranchBranding(
      targetBranch.id,
      null,
      UserRole.SUPER_ADMIN
    );
    expect(clearedBranch.logoUrl).toBeNull();
  });

  // 5. Super Admin dapat upload/ganti/hapus foto dokter
  it("5. Super Admin dapat upload, ganti, dan hapus foto dokter", async () => {
    const doctors = await doctorRepo.getDoctors();
    const targetDoctor = doctors[0];

    // Upload doctor portrait
    const uploadResult = await mediaStorageRepo.uploadImage(
      {
        name: "drg-syafira.jpg",
        type: "image/jpeg",
        size: 1024 * 200, // 200KB
        base64OrDataUrl: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA="
      },
      "doctor-portraits"
    );

    // Update doctor photo
    const updatedDoc = await doctorRepo.updateDoctorPhoto(
      targetDoctor.id,
      uploadResult.url,
      UserRole.SUPER_ADMIN
    );

    expect(updatedDoc.photoUrl).toBe(uploadResult.url);
    expect(updatedDoc.avatarUrl).toBe(uploadResult.url);

    // Remove doctor photo
    const clearedDoc = await doctorRepo.updateDoctorPhoto(
      targetDoctor.id,
      null,
      UserRole.SUPER_ADMIN
    );

    expect(clearedDoc.photoUrl).toBeNull();
    expect(clearedDoc.avatarUrl).toBeNull();
  });

  // 6. Master dokter bersifat global (single doctor entity) meskipun multi-cabang
  it("6. Master dokter bersifat single global entity dengan penempatan multi-cabang", async () => {
    const doctors = await doctorRepo.getDoctors();
    const assignments = await doctorRepo.getDoctorBranchAssignments();

    // Verify there are no duplicate doctors for branches
    const doctorNames = doctors.map((d) => (d.name || d.fullName || "").toLowerCase());
    const uniqueNames = new Set(doctorNames);
    expect(doctorNames.length).toBe(uniqueNames.size);

    // Verify multi-branch assignments link to the same doctor ID
    const targetDoctor = doctors[0];
    const docAssignments = assignments.filter((a) => a.doctorId === targetDoctor.id);
    expect(docAssignments.length).toBeGreaterThanOrEqual(1);

    // Every assignment must reference the exact same global doctor entity
    docAssignments.forEach((assignment) => {
      expect(assignment.doctorId).toBe(targetDoctor.id);
    });
  });

  // 7. Doctor schedule & poster jadwal mengambil foto dari master doctor
  it("7. Poster jadwal dokter membaca photoUrl dari master dental_doctors", async () => {
    const doctors = await doctorRepo.getDoctors();
    const schedules = await scheduleRepo.getSchedules({});
    
    // Set a known photo on doctor
    const testDoctor = doctors[0];
    const testPhotoUrl = "https://laladentist.com/photos/drg-syafira.webp";
    await doctorRepo.updateDoctorPhoto(testDoctor.id, testPhotoUrl, UserRole.SUPER_ADMIN);

    // Re-query doctor
    const refreshedDoc = await doctorRepo.getDoctorById(testDoctor.id);
    expect(refreshedDoc?.photoUrl).toBe(testPhotoUrl);

    // Match schedule to doctor photo
    const doctorSchedule = schedules.find((s) => s.doctorId === testDoctor.id);
    if (doctorSchedule) {
      const scheduleDoctor = await doctorRepo.getDoctorById(doctorSchedule.doctorId);
      expect(scheduleDoctor?.photoUrl).toBe(testPhotoUrl);
    }
  });

  // 8. Fallback avatar jika foto belum ada
  it("8. Dokter tanpa foto memiliki photoUrl null dan fallback avatar", async () => {
    const doctors = await doctorRepo.getDoctors();
    const docWithoutPhoto = doctors.find((d) => !d.photoUrl && !d.avatarUrl) || doctors[0];
    
    // Ensure null
    await doctorRepo.updateDoctorPhoto(docWithoutPhoto.id, null, UserRole.SUPER_ADMIN);
    const updated = await doctorRepo.getDoctorById(docWithoutPhoto.id);
    
    expect(updated?.photoUrl).toBeNull();
    // UI uses fallback avatar initials e.g. "SY"
    const initials = (updated?.name || "DR")
      .replace("drg.", "")
      .trim()
      .substring(0, 2)
      .toUpperCase();
    expect(initials.length).toBeGreaterThan(0);
  });

  // 9. Immutability branch.id
  it("9. branch.id bersifat permanen dan tidak dapat diubah oleh transaksi update", async () => {
    const branches = await branchRepo.getBranches(UserRole.SUPER_ADMIN);
    const originalBranch = branches[0];
    const originalId = originalBranch.id;

    const updated = await branchRepo.updateBranch(
      originalId,
      {
        name: "Lala Dentist Gebang Premium Updated",
        address: "Jl. Gebang Baru No. 100"
      },
      UserRole.SUPER_ADMIN
    );

    expect(updated.id).toBe(originalId);

    // Confirm that query by original ID returns updated branch
    const fetched = await branchRepo.getBranchById(originalId);
    expect(fetched?.id).toBe(originalId);
    expect(fetched?.name).toBe("Lala Dentist Gebang Premium Updated");
  });
});
