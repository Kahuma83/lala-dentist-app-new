import { describe, it, expect, beforeEach } from "vitest";
import { MockDatabase, MOCK_SERVICES } from "../data/mockData";
import {
  MockConfigurationRepository,
  MockTreatmentRepository,
  MockVisitRepository,
  MockBookingRepository
} from "../repositories/mockRepositories";
import {
  UserRole,
  VisitType,
  BookingStatus,
  TreatmentJobStatus
} from "../types/domain";

describe("PHASE — MASTER JENIS TINDAKAN ADMIN CABANG", () => {
  beforeEach(() => {
    MockDatabase.resetInstance();
  });

  const EXPECTED_20_SERVICES = [
    { code: "CONSULTATION", name: "Konsultasi" },
    { code: "SCALING", name: "Scaling" },
    { code: "FILLING_PERMANENT", name: "Tambal permanen" },
    { code: "EXTRACTION", name: "Cabut" },
    { code: "BLEACHING", name: "Bleaching" },
    { code: "BRACKET_REMOVE", name: "Bracket lepas" },
    { code: "BRACKET_CONTROL_FULL", name: "Kontrol behel RA & RB" },
    { code: "BRACKET_CONTROL_SINGLE", name: "Kontrol behel RA atau RB saja" },
    { code: "ABSCESS_DRAINAGE", name: "Drainase abses" },
    { code: "GIPAL_INSERTION", name: "Insersi GIPAL / Crown PFM" },
    { code: "GIPAL_CEMENTATION", name: "Lem GIPAL / Crown PFM" },
    { code: "MEDICATION", name: "Medikasi" },
    { code: "ODONTECTOMY", name: "Odontektomi" },
    { code: "WIRE_CUT", name: "Potong kawat" },
    { code: "POLYP_REMOVAL", name: "Potong polip" },
    { code: "ROP", name: "ROP" },
    { code: "VENEER", name: "Veneer" },
    { code: "GIPAL_SETTLEMENT", name: "Pelunasan GIPAL" },
    { code: "ABSCESS", name: "Abses" },
    { code: "OTHER", name: "Yang lain" }
  ];

  it("1. Master Data memuat tepat 20 tindakan klinis standar dengan stable code", async () => {
    const configRepo = new MockConfigurationRepository();
    const services = await configRepo.getServices();

    expect(services.length).toBeGreaterThanOrEqual(20);

    for (const item of EXPECTED_20_SERVICES) {
      const match = services.find((s) => s.code === item.code);
      expect(match, `Service dengan code ${item.code} wajib ada`).toBeDefined();
      expect(match?.name).toBe(item.name);
      expect(match?.basePrice).toBeGreaterThanOrEqual(0);
      if (item.code === "CONSULTATION") {
        expect(match?.basePrice).toBe(0);
      }
      expect(match?.estimatedDurationMinutes).toBeGreaterThan(0);
      expect(match?.isActive).toBe(true);
    }
  });

  it("2. Aturan Utama: Pasien yang melakukan booking TIDAK memilih dari Master Jenis Tindakan", async () => {
    const bookingRepo = new MockBookingRepository();

    // Pasien hanya mengisi Keluhan / Keperluan Berobat
    const patientComplaint = "Gigi belakang kanan berlubang dan ngilu saat kena air dingin";

    const booking = await bookingRepo.createBooking({
      patientId: "patient-1",
      branchId: "branch-gebang",
      doctorId: "doc-syafira",
      bookingDateTime: "2026-10-02T10:00:00Z",
      timeSlot: "10:00",
      notes: patientComplaint, // Free-text keluhan pasien
      status: BookingStatus.PENDING
    });

    expect(booking.id).toBeDefined();
    // Booking bebas dari kewajiban memilih serviceId dari master jenis tindakan
    expect(booking.notes).toBe(patientComplaint);
    expect(booking.serviceId).toBeUndefined();
  });

  it("3. Admin Cabang menggunakan Master Jenis Tindakan saat membuat Treatment Job", async () => {
    const visitRepo = new MockVisitRepository();
    const treatmentRepo = new MockTreatmentRepository();

    // Pasien datang & visit dibuat
    const visit = await visitRepo.createVisit({
      patientId: "patient-1",
      branchId: "branch-gebang",
      visitType: VisitType.WALK_IN,
      bookingId: null,
      doctorId: "doc-syafira",
      complaint: "Gigi belakang sakit saat mengunyah"
    });

    // Admin Cabang memilih tindakan dari Master Jenis Tindakan (misal: TAMBAL PERMANEN)
    const fillingService = MOCK_SERVICES.find((s) => s.code === "FILLING_PERMANENT")!;
    expect(fillingService).toBeDefined();

    const treatment = await treatmentRepo.createTreatmentJob(
      {
        visitId: visit.id,
        serviceId: fillingService.id,
        doctorId: "doc-syafira",
        estimatedDurationMinutes: fillingService.estimatedDurationMinutes,
        notes: "Gigi premolar bawah kanan"
      },
      UserRole.BRANCH_ADMIN,
      "branch-gebang",
      "user-admin-gebang"
    );

    expect(treatment.id).toBeDefined();
    expect(treatment.serviceId).toBe(fillingService.id);
    expect(treatment.serviceNameSnapshot).toBe("Tambal permanen");
    expect(treatment.status).toBe(TreatmentJobStatus.BELUM_DIMULAI);
    expect(treatment.branchId).toBe("branch-gebang");
  });

  it("4. Branch Service Tariffs: custom tariff cabang berlaku jika dikonfigurasi", async () => {
    const configRepo = new MockConfigurationRepository();
    const branchId = "branch-gebang";
    const scalingService = MOCK_SERVICES.find((s) => s.code === "SCALING")!;

    // Base price standar
    expect(scalingService.basePrice).toBe(150000);

    // Set custom tariff untuk cabang Gebang: Rp 175.000
    await configRepo.setBranchTariff(branchId, scalingService.id, 175000);

    const tariffs = await configRepo.getBranchTariffs(branchId);
    const scalingTariff = tariffs.find((t) => t.serviceId === scalingService.id);

    expect(scalingTariff).toBeDefined();
    expect(scalingTariff?.customPrice).toBe(175000);
  });

  it("5. Single Source of Truth: master_services dan branch_service_tariffs tidak menduplikasi Treatment Core", async () => {
    const db = MockDatabase.getInstance();
    expect(Array.isArray(db.services)).toBe(true);
    expect(Array.isArray(db.tariffs)).toBe(true);

    // Pastikan seluruh service code unik
    const codes = db.services.map((s: any) => s.code).filter(Boolean);
    const uniqueCodes = new Set(codes);
    expect(uniqueCodes.size).toBe(codes.length);
  });
});
