import {
  PatientProfile,
  DentalBranch,
  DentalDoctor,
  DoctorAssistantPairing,
  MasterService,
  BranchServiceTariff,
  Booking,
  BookingConfirmationH1,
  PatientVisit,
  QueueItem,
  LiveQueueSnapshot,
  TreatmentJob,
  TreatmentActivity,
  TreatmentActivityType,
  TreatmentIncentive,
  Invoice,
  InvoiceItem,
  PaymentTransaction,
  StaffCompensationRule,
  CompensationAccrual,
  MonthlyPayroll,
  PayrollItem,
  UserRole,
  VisitType,
  VisitStatus,
  QueueStatus,
  BookingStatus,
  ConfirmationStatusH1,
  TreatmentJobStatus,
  IncentiveStatus,
  InvoiceStatus,
  PaymentMethod,
  PayrollStatus,
  Staff,
  StaffPosition,
  EmploymentStatus,
  DoctorBranchAssignment,
  ScheduleStatus,
  DoctorSchedule,
  WorkShift,
  StaffShiftAssignment,
  UserAccount,
  AccountType,
  NormalBalance,
  AccountCategory,
  JournalStatus,
  JournalSourceType,
  ChartOfAccount,
  JournalLine,
  JournalEntry,
  Attendance,
  AttendanceStatus,
  AttendanceMethod,
  OvertimeRecord,
  OvertimeStatus,
  OvertimeType,
  ClinicBranding,
  MedicalRecord,
  MedicalRecordStatus,
  PromotionMedia
} from "../types/domain";

// ==========================================
// MOCK DATABASE STORE (In-Memory)
// ==========================================

export const MOCK_BRANCHES: DentalBranch[] = [
  {
    id: "branch-gebang",
    name: "Cabang Gebang",
    branchName: "Lala Dentist Gebang",
    branchCode: "GEB",
    clinicName: "Lala Dentist",
    address: "Jl. Kacapiring Ruko Kamajaya No.5 Gebang",
    phone: "081234567800",
    whatsapp: "081234567800",
    email: "gebang@laladentist.com",
    operationalHours: "Senin-Sabtu: 08.00-21.00, Minggu: 08.00-17.00",
    logoUrl: "/logo-lala.png",
    imageUrl: "https://images.unsplash.com/photo-1629909613654-28e377c37b09?auto=format&fit=crop&q=80&w=600",
    isActive: true,
    active: true,
    createdAt: "2026-01-10T08:00:00Z",
    updatedAt: "2026-01-10T08:00:00Z"
  },
  {
    id: "branch-ambulu",
    name: "Cabang Ambulu",
    branchName: "Lala Dentist Ambulu",
    branchCode: "AMB",
    clinicName: "Lala Dentist",
    address: "Jl. Raya Suyitman No. 126 Ambulu",
    phone: "081234567801",
    whatsapp: "081234567801",
    email: "ambulu@laladentist.com",
    operationalHours: "Senin-Sabtu: 08.00-21.00",
    logoUrl: "/logo-lala.png",
    imageUrl: "https://images.unsplash.com/photo-1538108149393-fbbd81895907?auto=format&fit=crop&q=80&w=600",
    isActive: true,
    active: true,
    createdAt: "2026-01-10T08:00:00Z",
    updatedAt: "2026-01-10T08:00:00Z"
  },
  {
    id: "branch-lengkong-mumbul",
    name: "Cabang Lengkong Mumbul",
    branchName: "Lala Dentist Lengkong Mumbul",
    branchCode: "LEN",
    clinicName: "Lala Dentist",
    address: "Jl. Soekarno Hatta No.36 Lengkong Mumbul",
    phone: "081234567802",
    whatsapp: "081234567802",
    email: "lengkong@laladentist.com",
    operationalHours: "Senin-Sabtu: 08.00-19.00",
    logoUrl: "/logo-lala.png",
    imageUrl: "https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?auto=format&fit=crop&q=80&w=600",
    isActive: true,
    active: true,
    createdAt: "2026-02-01T08:00:00Z",
    updatedAt: "2026-02-01T08:00:00Z"
  },
  {
    id: "branch-kencong",
    name: "Cabang Kencong",
    branchName: "Lala Dentist Kencong",
    branchCode: "KEN",
    clinicName: "Lala Dentist",
    address: "Jl. RA. KARTINI NO.110, KENCONG-JEMBER (PAS DISAMPING C'BEZT KENCONG)",
    phone: "081234567804",
    whatsapp: "081234567804",
    email: "kencong@laladentist.com",
    operationalHours: "Senin-Sabtu: 08.00-21.00",
    logoUrl: "/logo-lala.png",
    imageUrl: "https://images.unsplash.com/photo-1516549655169-df83a0774514?auto=format&fit=crop&q=80&w=600",
    isActive: true,
    active: true,
    createdAt: "2026-02-20T08:00:00Z",
    updatedAt: "2026-02-20T08:00:00Z"
  },
  {
    id: "branch-kampus",
    name: "Cabang Kampus",
    branchName: "Lala Dentist Kampus",
    branchCode: "KAM",
    clinicName: "Lala Dentist",
    address: "Jl. Tidar",
    phone: "081234567805",
    whatsapp: "081234567805",
    email: "kampus@laladentist.com",
    operationalHours: "Senin-Sabtu: 08.00-21.00, Minggu: 08.00-17.00",
    logoUrl: "/logo-lala.png",
    imageUrl: "https://images.unsplash.com/photo-1504813184591-01572f98c85f?auto=format&fit=crop&q=80&w=600",
    isActive: true,
    active: true,
    createdAt: "2026-03-01T08:00:00Z",
    updatedAt: "2026-03-01T08:00:00Z"
  },
  {
    id: "branch-muktisari",
    name: "Cabang Muktisari",
    branchName: "Lala Dentist Muktisari",
    branchCode: "MUK",
    clinicName: "Lala Dentist",
    address: "Jl. Muktisari No. 12, Tegal Besar, Jember",
    phone: "081234567806",
    whatsapp: "081234567806",
    email: "muktisari@laladentist.com",
    operationalHours: "Senin-Sabtu: 08.00-21.00",
    logoUrl: "/logo-lala.png",
    imageUrl: "https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&q=80&w=600",
    isActive: true,
    active: true,
    createdAt: "2026-01-15T08:00:00Z",
    updatedAt: "2026-01-15T08:00:00Z"
  }
];

export const MOCK_PATIENTS: PatientProfile[] = [
  {
    id: "patient-1",
    medicalRecordNumber: "RM-000001",
    name: "Amanda Lestari",
    fullName: "Amanda Lestari",
    phone: "081299887766",
    email: "amanda@example.com",
    dateOfBirth: "1995-04-12",
    gender: "P",
    address: "Perum Tegal Besar, Jember",
    medicalHistoryNotes: "Alergi obat penicillin",
    createdAt: "2026-05-10T09:00:00Z",
    updatedAt: "2026-05-10T09:00:00Z"
  },
  {
    id: "patient-2",
    medicalRecordNumber: "RM-000002",
    name: "Budi Setiawan",
    fullName: "Budi Setiawan",
    phone: "081344556677",
    email: "budi.setiawan@example.com",
    dateOfBirth: "1988-11-23",
    gender: "L",
    address: "Jl. Mastrip No. 15, Jember",
    medicalHistoryNotes: "Hipertensi terkontrol",
    createdAt: "2026-05-11T10:00:00Z",
    updatedAt: "2026-05-11T10:00:00Z"
  },
  {
    id: "patient-3",
    medicalRecordNumber: "RM-000003",
    name: "Charles Christian",
    fullName: "Charles Christian",
    phone: "081122334455",
    email: "charles.c@example.com",
    dateOfBirth: "2000-01-30",
    gender: "L",
    address: "Jl. Jawa Gang IV No. 9, Jember",
    medicalHistoryNotes: "Tidak ada riwayat alergi",
    createdAt: "2026-05-12T11:00:00Z",
    updatedAt: "2026-05-12T11:00:00Z"
  },
  {
    id: "patient-4",
    medicalRecordNumber: "RM-000004",
    name: "Diana Putri",
    fullName: "Diana Putri",
    phone: "081827364519",
    email: "diana.putri@example.com",
    dateOfBirth: "1992-08-15",
    gender: "P",
    address: "Kecamatan Ambulu, Jember",
    medicalHistoryNotes: "Pernah pendarahan pasca cabut gigi",
    createdAt: "2026-05-14T08:30:00Z",
    updatedAt: "2026-05-14T08:30:00Z"
  }
];

export const MOCK_DOCTORS: DentalDoctor[] = [
  {
    id: "doc-ulfa",
    doctorCode: "DOC-ULFA",
    name: "drg. Ulfa",
    fullName: "drg. Ulfa",
    specialization: "Dokter Gigi Umum",
    phone: "081234567815",
    email: "ulfa@laladentist.com",
    assignedBranchId: "branch-gebang",
    str: "STR-ULFA-2025",
    sip: "SIP-ULFA-2025",
    avatarUrl: "https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&q=80&w=300",
    photoUrl: "https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&q=80&w=300",
    profileImage: "https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&q=80&w=300",
    active: true,
    isActive: true,
    staffId: "staff-doc-ulfa",
    notes: "Dokter Gigi Umum praktek Gebang",
    createdAt: "2026-01-10T08:00:00Z",
    updatedAt: "2026-01-10T08:00:00Z"
  },
  {
    id: "doc-amel",
    doctorCode: "DOC-AMEL",
    name: "drg. Amel",
    fullName: "drg. Amel",
    specialization: "Dokter Gigi Umum",
    phone: "081234567818",
    email: "amel@laladentist.com",
    assignedBranchId: "branch-kencong",
    str: "STR-AMEL-2024",
    sip: "SIP-AMEL-2024",
    avatarUrl: null,
    photoUrl: null,
    profileImage: undefined,
    active: true,
    isActive: true,
    staffId: "staff-doc-amel",
    notes: "Dokter Gigi Umum praktek Kencong",
    createdAt: "2026-01-10T08:00:00Z",
    updatedAt: "2026-01-10T08:00:00Z"
  },
  {
    id: "doc-iza",
    doctorCode: "DOC-IZA",
    name: "drg. Iza",
    fullName: "drg. Iza",
    specialization: "Dokter Gigi Umum",
    phone: "081234567817",
    email: "iza@laladentist.com",
    assignedBranchId: "branch-kencong",
    str: "STR-IZA-2025",
    sip: "SIP-IZA-2025",
    avatarUrl: "https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?auto=format&fit=crop&q=80&w=300",
    photoUrl: "https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?auto=format&fit=crop&q=80&w=300",
    profileImage: "https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?auto=format&fit=crop&q=80&w=300",
    active: true,
    isActive: true,
    staffId: "staff-doc-iza",
    notes: "Dokter Gigi Umum praktek Kencong",
    createdAt: "2026-01-10T08:00:00Z",
    updatedAt: "2026-01-10T08:00:00Z"
  },
  {
    id: "doc-regina",
    doctorCode: "DOC-REGINA",
    name: "drg. Regina",
    fullName: "drg. Regina",
    specialization: "Dokter Gigi Umum",
    phone: "081234567816",
    email: "regina@laladentist.com",
    assignedBranchId: "branch-lengkong-mumbul",
    str: "STR-REGI-2024",
    sip: "SIP-REGI-2024",
    avatarUrl: "https://images.unsplash.com/photo-1567532939604-b6b5b0db2604?auto=format&fit=crop&q=80&w=300",
    photoUrl: "https://images.unsplash.com/photo-1567532939604-b6b5b0db2604?auto=format&fit=crop&q=80&w=300",
    profileImage: "https://images.unsplash.com/photo-1567532939604-b6b5b0db2604?auto=format&fit=crop&q=80&w=300",
    active: true,
    isActive: true,
    staffId: "staff-doc-regina",
    notes: "Dokter Gigi Umum praktek Lengkong Mumbul",
    createdAt: "2026-01-10T08:00:00Z",
    updatedAt: "2026-01-10T08:00:00Z"
  },
  {
    id: "doc-vio",
    doctorCode: "DOC-VIO",
    name: "drg. Vio",
    fullName: "drg. Vio",
    specialization: "Dokter Gigi Umum",
    phone: "081234567813",
    email: "vio@laladentist.com",
    assignedBranchId: "branch-kencong",
    str: "STR-VIO-2024",
    sip: "SIP-VIO-2024",
    avatarUrl: "https://images.unsplash.com/photo-1614608682850-e0d6ed316d47?auto=format&fit=crop&q=80&w=300",
    photoUrl: "https://images.unsplash.com/photo-1614608682850-e0d6ed316d47?auto=format&fit=crop&q=80&w=300",
    profileImage: "https://images.unsplash.com/photo-1614608682850-e0d6ed316d47?auto=format&fit=crop&q=80&w=300",
    active: true,
    isActive: true,
    staffId: "staff-doc-vio",
    notes: "Dokter Gigi Umum praktek Kencong",
    createdAt: "2026-01-10T08:00:00Z",
    updatedAt: "2026-01-10T08:00:00Z"
  },
  {
    id: "doc-yuni",
    doctorCode: "DOC-YUNI",
    name: "drg. Yuni",
    fullName: "drg. Yuni",
    specialization: "Dokter Gigi Umum",
    phone: "081234567814",
    email: "yuni@laladentist.com",
    assignedBranchId: "branch-gebang",
    str: "STR-YUNI-2023",
    sip: "SIP-YUNI-2023",
    avatarUrl: "https://images.unsplash.com/photo-1594824813566-88855ce78c80?auto=format&fit=crop&q=80&w=300",
    photoUrl: "https://images.unsplash.com/photo-1594824813566-88855ce78c80?auto=format&fit=crop&q=80&w=300",
    profileImage: "https://images.unsplash.com/photo-1594824813566-88855ce78c80?auto=format&fit=crop&q=80&w=300",
    active: true,
    isActive: true,
    staffId: "staff-doc-yuni",
    notes: "Dokter Gigi Umum praktek Gebang",
    createdAt: "2026-01-10T08:00:00Z",
    updatedAt: "2026-01-10T08:00:00Z"
  },
  {
    id: "doc-aab",
    doctorCode: "DOC-DRGAAB",
    name: "drg. Aab",
    fullName: "drg. Aab",
    specialization: "Dokter Gigi Umum",
    phone: "081234567819",
    email: "aab@laladentist.com",
    assignedBranchId: "branch-lengkong-mumbul",
    str: "STR-AAB-2024",
    sip: "SIP-AAB-2024",
    avatarUrl: "https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&q=80&w=300",
    photoUrl: "https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&q=80&w=300",
    profileImage: "https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&q=80&w=300",
    active: true,
    isActive: true,
    staffId: "staff-doc-aab",
    notes: "Dokter Gigi Umum praktek Lengkong",
    createdAt: "2026-01-10T08:00:00Z",
    updatedAt: "2026-01-10T08:00:00Z"
  },
  {
    id: "doc-lala",
    doctorCode: "DOC-LALA",
    name: "drg. Lala",
    fullName: "drg. Lala",
    specialization: "Dokter Gigi Umum",
    phone: "081234567812",
    email: "lala@laladentist.com",
    assignedBranchId: "",
    str: "STR-LALA-2023",
    sip: "SIP-LALA-2023",
    avatarUrl: "https://images.unsplash.com/photo-1582750433449-648ed127bb54?auto=format&fit=crop&q=80&w=300",
    photoUrl: "https://images.unsplash.com/photo-1582750433449-648ed127bb54?auto=format&fit=crop&q=80&w=300",
    profileImage: "https://images.unsplash.com/photo-1582750433449-648ed127bb54?auto=format&fit=crop&q=80&w=300",
    active: true,
    isActive: true,
    staffId: "staff-doc-lala",
    notes: "Owner & Dokter Gigi Umum",
    createdAt: "2026-01-10T08:00:00Z",
    updatedAt: "2026-01-10T08:00:00Z"
  },
  {
    id: "doc-syafira",
    doctorCode: "DOC-SYAFIRA",
    name: "drg. Syafira",
    fullName: "drg. Syafira",
    specialization: "Dokter Gigi Umum",
    phone: "081234567811",
    email: "syafira@laladentist.com",
    assignedBranchId: "branch-gebang",
    str: "STR-SYAF-2024",
    sip: "SIP-SYAF-2024",
    avatarUrl: "https://images.unsplash.com/photo-1594824813566-88855ce78c80?auto=format&fit=crop&q=80&w=300",
    photoUrl: "https://images.unsplash.com/photo-1594824813566-88855ce78c80?auto=format&fit=crop&q=80&w=300",
    profileImage: "https://images.unsplash.com/photo-1594824813566-88855ce78c80?auto=format&fit=crop&q=80&w=300",
    active: true,
    isActive: true,
    staffId: "staff-doc-syafira",
    notes: "Dokter Gigi Umum praktek Gebang",
    createdAt: "2026-01-10T08:00:00Z",
    updatedAt: "2026-01-10T08:00:00Z"
  }
];

export const MOCK_SERVICES: MasterService[] = [
  {
    id: "service-consultation",
    code: "CONSULTATION",
    name: "Konsultasi",
    description: "Konsultasi dan pemeriksaan kondisi gigi & mulut serta perencanaan perawatan.",
    basePrice: 0,
    estimatedDurationMinutes: 15,
    category: "CONSULTATION",
    displayOrder: 1,
    isActive: true,
    createdAt: "2026-01-01T08:00:00Z",
    updatedAt: "2026-01-01T08:00:00Z"
  },
  {
    id: "service-scaling",
    code: "SCALING",
    name: "Scaling",
    description: "Pembersihan karang gigi menggunakan ultrasonic scaler diikuti polishing.",
    basePrice: 150000,
    estimatedDurationMinutes: 30,
    category: "PREVENTIVE",
    displayOrder: 2,
    isActive: true,
    createdAt: "2026-01-01T08:00:00Z",
    updatedAt: "2026-01-01T08:00:00Z"
  },
  {
    id: "service-restoration",
    code: "FILLING_PERMANENT",
    name: "Tambal permanen",
    description: "Restorasi estetik gigi berlubang menggunakan bahan komposit resin sinar.",
    basePrice: 200000,
    estimatedDurationMinutes: 45,
    category: "RESTORATIVE",
    displayOrder: 3,
    isActive: true,
    createdAt: "2026-01-01T08:00:00Z",
    updatedAt: "2026-01-01T08:00:00Z"
  },
  {
    id: "service-extraction",
    code: "EXTRACTION",
    name: "Cabut",
    description: "Pencabutan gigi permanen tanpa komplikasi.",
    basePrice: 200000,
    estimatedDurationMinutes: 30,
    category: "SURGERY",
    displayOrder: 4,
    isActive: true,
    createdAt: "2026-01-01T08:00:00Z",
    updatedAt: "2026-01-01T08:00:00Z"
  },
  {
    id: "service-bleaching",
    code: "BLEACHING",
    name: "Bleaching",
    description: "Pemutihan gigi estetik in-office.",
    basePrice: 1500000,
    estimatedDurationMinutes: 60,
    category: "AESTHETIC",
    displayOrder: 5,
    isActive: true,
    createdAt: "2026-01-01T08:00:00Z",
    updatedAt: "2026-01-01T08:00:00Z"
  },
  {
    id: "service-bracket-remove",
    code: "BRACKET_REMOVE",
    name: "Bracket lepas",
    description: "Pelepasan bracket behel atau penempelan kembali bracket lepas.",
    basePrice: 100000,
    estimatedDurationMinutes: 20,
    category: "ORTHODONTIC",
    displayOrder: 6,
    isActive: true,
    createdAt: "2026-01-01T08:00:00Z",
    updatedAt: "2026-01-01T08:00:00Z"
  },
  {
    id: "service-bracket-control-full",
    code: "BRACKET_CONTROL_FULL",
    name: "Kontrol behel RA & RB",
    description: "Kontrol dan penggantian karet/kawat behel rahang atas dan rahang bawah.",
    basePrice: 200000,
    estimatedDurationMinutes: 30,
    category: "ORTHODONTIC",
    displayOrder: 7,
    isActive: true,
    createdAt: "2026-01-01T08:00:00Z",
    updatedAt: "2026-01-01T08:00:00Z"
  },
  {
    id: "service-bracket-control-single",
    code: "BRACKET_CONTROL_SINGLE",
    name: "Kontrol behel RA atau RB saja",
    description: "Kontrol dan penggantian karet/kawat behel satu rahang saja.",
    basePrice: 120000,
    estimatedDurationMinutes: 20,
    category: "ORTHODONTIC",
    displayOrder: 8,
    isActive: true,
    createdAt: "2026-01-01T08:00:00Z",
    updatedAt: "2026-01-01T08:00:00Z"
  },
  {
    id: "service-abscess-drainage",
    code: "ABSCESS_DRAINAGE",
    name: "Drainase abses",
    description: "Drainase dan evakuasi abses gigi/gusi.",
    basePrice: 150000,
    estimatedDurationMinutes: 25,
    category: "SURGERY",
    displayOrder: 9,
    isActive: true,
    createdAt: "2026-01-01T08:00:00Z",
    updatedAt: "2026-01-01T08:00:00Z"
  },
  {
    id: "service-gipal-insertion",
    code: "GIPAL_INSERTION",
    name: "Insersi GIPAL / Crown PFM",
    description: "Pemasangan gigi tiruan lepasan akrilik atau mahkota tiruan Porcelain Fused to Metal.",
    basePrice: 500000,
    estimatedDurationMinutes: 40,
    category: "PROSTHODONTIC",
    displayOrder: 10,
    isActive: true,
    createdAt: "2026-01-01T08:00:00Z",
    updatedAt: "2026-01-01T08:00:00Z"
  },
  {
    id: "service-gipal-cementation",
    code: "GIPAL_CEMENTATION",
    name: "Lem GIPAL / Crown PFM",
    description: "Sementasi ulang atau re-cement mahkota tiruan atau gigi tiruan lepasan.",
    basePrice: 100000,
    estimatedDurationMinutes: 20,
    category: "PROSTHODONTIC",
    displayOrder: 11,
    isActive: true,
    createdAt: "2026-01-01T08:00:00Z",
    updatedAt: "2026-01-01T08:00:00Z"
  },
  {
    id: "service-medication",
    code: "MEDICATION",
    name: "Medikasi",
    description: "Pemberian medikasi lokal, resep obat oral, atau antiseptik intraoral.",
    basePrice: 50000,
    estimatedDurationMinutes: 15,
    category: "TREATMENT",
    displayOrder: 12,
    isActive: true,
    createdAt: "2026-01-01T08:00:00Z",
    updatedAt: "2026-01-01T08:00:00Z"
  },
  {
    id: "service-odontectomy",
    code: "ODONTECTOMY",
    name: "Odontektomi",
    description: "Bedah pencabutan gigi geraham bungsu impaksi.",
    basePrice: 1200000,
    estimatedDurationMinutes: 60,
    category: "SURGERY",
    displayOrder: 13,
    isActive: true,
    createdAt: "2026-01-01T08:00:00Z",
    updatedAt: "2026-01-01T08:00:00Z"
  },
  {
    id: "service-wire-cut",
    code: "WIRE_CUT",
    name: "Potong kawat",
    description: "Pemotongan kawat behel yang menusuk atau berlebih.",
    basePrice: 50000,
    estimatedDurationMinutes: 15,
    category: "ORTHODONTIC",
    displayOrder: 14,
    isActive: true,
    createdAt: "2026-01-01T08:00:00Z",
    updatedAt: "2026-01-01T08:00:00Z"
  },
  {
    id: "service-polyp-removal",
    code: "POLYP_REMOVAL",
    name: "Potong polip",
    description: "Eksisi dan kauterisasi polip pulpa atau gingiva.",
    basePrice: 150000,
    estimatedDurationMinutes: 25,
    category: "SURGERY",
    displayOrder: 15,
    isActive: true,
    createdAt: "2026-01-01T08:00:00Z",
    updatedAt: "2026-01-01T08:00:00Z"
  },
  {
    id: "service-rop",
    code: "ROP",
    name: "ROP",
    description: "Root canal obturation and preparation pada perawatan saluran akar.",
    basePrice: 150000,
    estimatedDurationMinutes: 30,
    category: "TREATMENT",
    displayOrder: 16,
    isActive: true,
    createdAt: "2026-01-01T08:00:00Z",
    updatedAt: "2026-01-01T08:00:00Z"
  },
  {
    id: "service-veneer",
    code: "VENEER",
    name: "Veneer",
    description: "Veneer direct komposit estetik untuk meratakan warna dan bentuk gigi.",
    basePrice: 800000,
    estimatedDurationMinutes: 60,
    category: "AESTHETIC",
    displayOrder: 17,
    isActive: true,
    createdAt: "2026-01-01T08:00:00Z",
    updatedAt: "2026-01-01T08:00:00Z"
  },
  {
    id: "service-gipal-settlement",
    code: "GIPAL_SETTLEMENT",
    name: "Pelunasan GIPAL",
    description: "Pelunasan sisa biaya pembuatan gigi tiruan lepasan / crown.",
    basePrice: 500000,
    estimatedDurationMinutes: 15,
    category: "PROSTHODONTIC",
    displayOrder: 18,
    isActive: true,
    createdAt: "2026-01-01T08:00:00Z",
    updatedAt: "2026-01-01T08:00:00Z"
  },
  {
    id: "service-abscess",
    code: "ABSCESS",
    name: "Abses",
    description: "Pemeriksaan dan tatalaksana infeksi abses gigi akut.",
    basePrice: 100000,
    estimatedDurationMinutes: 20,
    category: "TREATMENT",
    displayOrder: 19,
    isActive: true,
    createdAt: "2026-01-01T08:00:00Z",
    updatedAt: "2026-01-01T08:00:00Z"
  },
  {
    id: "service-other",
    code: "OTHER",
    name: "Yang lain",
    description: "Tindakan klinis lainnya sesuai anjuran dan instruksi dokter.",
    basePrice: 50000,
    estimatedDurationMinutes: 15,
    category: "OTHER",
    displayOrder: 20,
    isActive: true,
    createdAt: "2026-01-01T08:00:00Z",
    updatedAt: "2026-01-01T08:00:00Z"
  },
  {
    id: "service-root-canal",
    code: "ROOT_CANAL",
    name: "Perawatan Saluran Akar (PSA)",
    description: "Perawatan syaraf gigi berlubang besar untuk menghindari pencabutan.",
    basePrice: 400000,
    estimatedDurationMinutes: 60,
    category: "TREATMENT",
    displayOrder: 21,
    isActive: true,
    createdAt: "2026-01-01T08:00:00Z",
    updatedAt: "2026-01-01T08:00:00Z"
  },
  {
    id: "service-tambal",
    code: "FILLING_COMPOSITE",
    name: "Tambal permanen",
    description: "Restorasi estetik gigi berlubang menggunakan bahan komposit resin sinar.",
    basePrice: 200000,
    estimatedDurationMinutes: 45,
    category: "RESTORATIVE",
    displayOrder: 22,
    isActive: true,
    createdAt: "2026-01-01T08:00:00Z",
    updatedAt: "2026-01-01T08:00:00Z"
  }
];

export const MOCK_BRANCH_TARIFFS: BranchServiceTariff[] = [
  // Cabang Kampus has premium pricing
  {
    id: "tariff-1",
    branchId: "branch-kampus",
    serviceId: "service-scaling",
    customPrice: 180000,
    isActive: true,
    createdAt: "2026-03-01T08:00:00Z",
    updatedAt: "2026-03-01T08:00:00Z"
  },
  {
    id: "tariff-2",
    branchId: "branch-kampus",
    serviceId: "service-extraction",
    customPrice: 220000,
    isActive: true,
    createdAt: "2026-03-01T08:00:00Z",
    updatedAt: "2026-03-01T08:00:00Z"
  }
];

export const MOCK_BOOKINGS: Booking[] = [
  {
    id: "booking-1",
    patientId: "patient-1",
    branchId: "branch-gebang",
    serviceId: "service-scaling",
    doctorId: "doc-syafira",
    bookingDateTime: "2026-09-21T09:00:00Z",
    notes: "Ingin scaling pagi",
    status: BookingStatus.CONFIRMED,
    patientNameSnapshot: "Ahmad Dahlan",
    doctorNameSnapshot: "drg. Syafira",
    branchNameSnapshot: "Gebang",
    createdAt: "2026-09-20T10:00:00Z",
    updatedAt: "2026-09-20T15:00:00Z"
  },
  {
    id: "booking-2",
    patientId: "patient-2",
    branchId: "branch-gebang",
    serviceId: "service-restoration",
    doctorId: "doc-syafira",
    bookingDateTime: "2026-09-21T10:30:00Z",
    notes: "Gigi geraham kiri bawah linu",
    status: BookingStatus.PENDING,
    patientNameSnapshot: "Budi Setiawan",
    doctorNameSnapshot: "drg. Syafira",
    branchNameSnapshot: "Gebang",
    createdAt: "2026-09-20T11:00:00Z",
    updatedAt: "2026-09-20T11:00:00Z"
  },
  {
    id: "booking-3",
    patientId: "patient-3",
    branchId: "branch-kampus",
    serviceId: "service-root-canal",
    doctorId: "doc-lala",
    bookingDateTime: "2026-09-21T14:00:00Z",
    notes: "Kunjungan ke-2 PSA",
    status: BookingStatus.CONFIRMED,
    patientNameSnapshot: "Charles Christian",
    doctorNameSnapshot: "drg. Lala",
    branchNameSnapshot: "Muktisari",
    createdAt: "2026-09-19T09:00:00Z",
    updatedAt: "2026-09-20T08:00:00Z"
  },
  // H-1 Bookings for Tomorrow (2026-09-22)
  {
    id: "booking-h1-gebang-1",
    patientId: "patient-1",
    branchId: "branch-gebang",
    serviceId: "service-scaling",
    doctorId: "doc-syafira",
    bookingDateTime: "2026-09-22T09:00:00Z",
    notes: "Pembersihan karang gigi tahunan",
    status: BookingStatus.PENDING,
    patientNameSnapshot: "Ahmad Dahlan",
    doctorNameSnapshot: "drg. Syafira",
    branchNameSnapshot: "Gebang",
    createdAt: "2026-09-20T08:00:00Z",
    updatedAt: "2026-09-20T08:00:00Z"
  },
  {
    id: "booking-h1-gebang-2",
    patientId: "patient-2",
    branchId: "branch-gebang",
    serviceId: "service-restoration",
    doctorId: "doc-syafira",
    bookingDateTime: "2026-09-22T10:30:00Z",
    notes: "Tambal gigi komposit depan",
    status: BookingStatus.PENDING,
    patientNameSnapshot: "Budi Setiawan",
    doctorNameSnapshot: "drg. Syafira",
    branchNameSnapshot: "Gebang",
    createdAt: "2026-09-20T09:00:00Z",
    updatedAt: "2026-09-20T09:00:00Z"
  },
  {
    id: "booking-h1-gebang-3",
    patientId: "patient-3",
    branchId: "branch-gebang",
    serviceId: "service-extraction",
    doctorId: "doc-syafira",
    bookingDateTime: "2026-09-22T13:00:00Z",
    notes: "Pencabutan gigi bungsu ringan",
    status: BookingStatus.CONFIRMED,
    patientNameSnapshot: "Charles Christian",
    doctorNameSnapshot: "drg. Syafira",
    branchNameSnapshot: "Gebang",
    createdAt: "2026-09-20T10:00:00Z",
    updatedAt: "2026-09-20T10:00:00Z"
  },
  {
    id: "booking-h1-kampus-1",
    patientId: "patient-4",
    branchId: "branch-kampus",
    serviceId: "service-root-canal",
    doctorId: "doc-lala",
    bookingDateTime: "2026-09-22T14:30:00Z",
    notes: "Akar gigi infeksi",
    status: BookingStatus.PENDING,
    patientNameSnapshot: "Diana Putri",
    doctorNameSnapshot: "drg. Lala",
    branchNameSnapshot: "Muktisari",
    createdAt: "2026-09-20T11:00:00Z",
    updatedAt: "2026-09-20T11:00:00Z"
  }
];

export const MOCK_CONFIRMATIONS: BookingConfirmationH1[] = [
  {
    id: "conf-1",
    bookingId: "booking-1",
    confirmationStatus: ConfirmationStatusH1.DIKONFIRMASI,
    status: ConfirmationStatusH1.DIKONFIRMASI,
    calledAt: "2026-09-20T14:30:00Z",
    contactedAt: "2026-09-20T14:30:00Z",
    confirmedAt: "2026-09-20T14:35:00Z",
    notes: "Pasien mengonfirmasi kedatangan jam 9 pagi",
    staffId: "admin-gebang-1",
    contactByStaffId: "admin-gebang-1",
    createdAt: "2026-09-20T14:30:00Z",
    updatedAt: "2026-09-20T14:35:00Z"
  },
  {
    id: "conf-2",
    bookingId: "booking-2",
    confirmationStatus: ConfirmationStatusH1.BELUM_DIHUBUNGI,
    status: ConfirmationStatusH1.BELUM_DIHUBUNGI,
    notes: "Nomor sibuk saat ditelpon",
    staffId: "admin-gebang-1",
    createdAt: "2026-09-20T15:00:00Z",
    updatedAt: "2026-09-20T15:00:00Z"
  },
  {
    id: "conf-h1-1",
    bookingId: "booking-h1-gebang-1",
    confirmationStatus: ConfirmationStatusH1.BELUM_DIHUBUNGI,
    status: ConfirmationStatusH1.BELUM_DIHUBUNGI,
    createdAt: "2026-09-21T08:00:00Z",
    updatedAt: "2026-09-21T08:00:00Z"
  },
  {
    id: "conf-h1-2",
    bookingId: "booking-h1-gebang-2",
    confirmationStatus: ConfirmationStatusH1.SUDAH_DIHUBUNGI,
    status: ConfirmationStatusH1.SUDAH_DIHUBUNGI,
    contactedAt: "2026-09-21T09:15:00Z",
    calledAt: "2026-09-21T09:15:00Z",
    notes: "Pesan WA terkirim, menunggu balasan",
    staffId: "user-branch-gebang",
    createdAt: "2026-09-21T09:15:00Z",
    updatedAt: "2026-09-21T09:15:00Z"
  },
  {
    id: "conf-h1-3",
    bookingId: "booking-h1-gebang-3",
    confirmationStatus: ConfirmationStatusH1.DIKONFIRMASI,
    status: ConfirmationStatusH1.DIKONFIRMASI,
    contactedAt: "2026-09-21T10:00:00Z",
    calledAt: "2026-09-21T10:00:00Z",
    confirmedAt: "2026-09-21T10:05:00Z",
    notes: "Pasien siap datang tepat waktu",
    staffId: "user-branch-gebang",
    createdAt: "2026-09-21T10:00:00Z",
    updatedAt: "2026-09-21T10:05:00Z"
  },
  {
    id: "conf-h1-4",
    bookingId: "booking-h1-kampus-1",
    confirmationStatus: ConfirmationStatusH1.MINTA_RESCHEDULE,
    status: ConfirmationStatusH1.MINTA_RESCHEDULE,
    contactedAt: "2026-09-21T11:00:00Z",
    calledAt: "2026-09-21T11:00:00Z",
    notes: "Minta pindah ke lusa jam 16:00",
    staffId: "user-branch-kampus",
    createdAt: "2026-09-21T11:00:00Z",
    updatedAt: "2026-09-21T11:00:00Z"
  }
];

// Patient-Visit and Booking-Visit design principles
// WALK_IN has bookingId = null, Patient can have multiple visits
export const MOCK_VISITS: PatientVisit[] = [
  {
    id: "visit-1",
    patientId: "patient-1",
    branchId: "branch-gebang",
    visitDateTime: "2026-09-21T09:05:00Z",
    visitType: VisitType.BOOKING,
    visitStatus: VisitStatus.IN_TREATMENT,
    bookingId: "booking-1",
    complaint: "Scaling rutin tahunan",
    createdAt: "2026-09-21T09:05:00Z",
    updatedAt: "2026-09-21T09:05:00Z"
  },
  {
    id: "visit-2",
    patientId: "patient-4",
    branchId: "branch-gebang",
    visitDateTime: "2026-09-21T09:30:00Z",
    visitType: VisitType.WALK_IN, // Walk-In Visit Type
    visitStatus: VisitStatus.WAITING,
    bookingId: null, // bookingId is null
    complaint: "Sakit gigi geraham kanan atas mendadak semalam",
    createdAt: "2026-09-21T09:30:00Z",
    updatedAt: "2026-09-21T09:30:00Z"
  },
  {
    id: "visit-3",
    patientId: "patient-2", // Budi Setiawan
    branchId: "branch-gebang",
    visitDateTime: "2026-09-18T10:00:00Z",
    visitType: VisitType.WALK_IN,
    visitStatus: VisitStatus.COMPLETED,
    bookingId: null,
    complaint: "Konsultasi behel dan pembersihan",
    createdAt: "2026-09-18T10:00:00Z",
    updatedAt: "2026-09-18T11:00:00Z"
  },
  {
    id: "visit-4",
    patientId: "patient-2", // Budi Setiawan
    branchId: "branch-muktisari",
    visitDateTime: "2026-09-21T10:30:00Z",
    visitType: VisitType.BOOKING,
    visitStatus: VisitStatus.WAITING,
    bookingId: "booking-2",
    complaint: "Tambal gigi geraham bawah",
    createdAt: "2026-09-20T11:00:00Z",
    updatedAt: "2026-09-20T11:00:00Z"
  },
  {
    id: "visit-5",
    patientId: "patient-2", // Budi Setiawan
    branchId: "branch-ambulu",
    visitDateTime: "2026-09-20T14:00:00Z",
    visitType: VisitType.WALK_IN,
    visitStatus: VisitStatus.COMPLETED,
    bookingId: null,
    complaint: "Pemeriksaan darurat pasca pencabutan",
    createdAt: "2026-09-20T14:00:00Z",
    updatedAt: "2026-09-20T14:45:00Z"
  }
];

export const MOCK_QUEUE_ITEMS: QueueItem[] = [
  {
    id: "queue-1",
    branchId: "branch-gebang",
    visitId: "visit-1",
    patientId: "patient-1",
    doctorId: "doc-syafira",
    queueNumber: "A-01",
    sequenceOrder: 1,
    status: QueueStatus.COMPLETED,
    arrivalAt: "2026-09-21T09:05:00Z",
    checkInTime: "2026-09-21T09:05:00Z",
    estimatedServiceAt: "2026-09-21T09:15:00Z",
    estimatedDurationMinutes: 30,
    startTime: "2026-09-21T09:15:00Z",
    createdAt: "2026-09-21T09:05:00Z",
    updatedAt: "2026-09-21T09:15:00Z"
  },
  {
    id: "queue-2",
    branchId: "branch-gebang",
    visitId: "visit-2",
    patientId: "patient-2",
    doctorId: "doc-syafira",
    queueNumber: "A-02",
    sequenceOrder: 2,
    status: QueueStatus.WAITING,
    arrivalAt: "2026-09-21T09:30:00Z",
    checkInTime: "2026-09-21T09:30:00Z",
    estimatedServiceAt: "2026-09-21T09:45:00Z",
    estimatedDurationMinutes: 30,
    createdAt: "2026-09-21T09:30:00Z",
    updatedAt: "2026-09-21T09:30:00Z"
  }
];

export const MOCK_TREATMENT_JOBS: TreatmentJob[] = [
  {
    id: "treatment-job-1",
    visitId: "visit-1",
    patientId: "patient-1",
    branchId: "branch-gebang",
    doctorId: "doc-syafira",
    serviceId: "service-scaling",
    picAssistantId: "assistant-clary",
    assignedDoctorId: "doc-syafira",
    status: TreatmentJobStatus.DALAM_PROSES,
    serviceNameSnapshot: "Scaling & Polishing (Pembersihan Karang)",
    doctorNameSnapshot: "drg. Syafira",
    estimatedDurationMinutes: 30,
    createdAt: "2026-09-21T09:20:00Z",
    startedAt: "2026-09-21T09:25:00Z",
    updatedAt: "2026-09-21T09:25:00Z"
  },
  {
    id: "treatment-job-2",
    visitId: "visit-1",
    patientId: "patient-1",
    branchId: "branch-gebang",
    doctorId: "doc-syafira",
    serviceId: "service-restoration",
    assignedDoctorId: "doc-syafira",
    status: TreatmentJobStatus.BELUM_DIMULAI,
    serviceNameSnapshot: "Tambal Gigi Composite (Sinar)",
    doctorNameSnapshot: "drg. Syafira",
    estimatedDurationMinutes: 45,
    notes: "Tambal gigi molar kanan atas #16",
    createdAt: "2026-09-21T09:20:00Z",
    updatedAt: "2026-09-21T09:20:00Z"
  },
  {
    id: "treatment-job-3",
    visitId: "visit-2",
    patientId: "patient-2",
    branchId: "branch-gebang",
    doctorId: "doc-syafira",
    serviceId: "service-root-canal",
    assignedDoctorId: "doc-syafira",
    status: TreatmentJobStatus.SELESAI,
    serviceNameSnapshot: "Perawatan Saluran Akar (PSA)",
    doctorNameSnapshot: "drg. Syafira",
    estimatedDurationMinutes: 60,
    createdAt: "2026-09-18T10:00:00Z",
    startedAt: "2026-09-18T10:10:00Z",
    completedAt: "2026-09-18T11:10:00Z",
    updatedAt: "2026-09-18T11:10:00Z"
  },
  {
    id: "treatment-job-4",
    visitId: "visit-5",
    patientId: "patient-2",
    branchId: "branch-ambulu",
    doctorId: "doctor-budi",
    serviceId: "service-extraction",
    assignedDoctorId: "doctor-budi",
    status: TreatmentJobStatus.DISERAHKAN,
    serviceNameSnapshot: "Pencabutan Gigi Sederhana",
    doctorNameSnapshot: "drg. Budi Santoso",
    estimatedDurationMinutes: 30,
    createdAt: "2026-09-20T14:00:00Z",
    startedAt: "2026-09-20T14:05:00Z",
    completedAt: "2026-09-20T14:35:00Z",
    handedOverAt: "2026-09-20T14:40:00Z",
    updatedAt: "2026-09-20T14:40:00Z"
  }
];

export const DEFAULT_CLINIC_BRANDING: ClinicBranding = {
  id: "branding-main",
  name: "LALA DENTIST",
  tagline: "Senyum Indah dimulai di Laladentist",
  logoUrl: "/logo-lala.png",
  address: "Jl. Gebang Raya No. 42, Patrang, Jember, Jawa Timur",
  phone: "0812-3456-7800",
  whatsapp: "6281234567800",
  email: "info@laladentist.com",
  website: "www.laladentist.com",
  footerNote: "Terima kasih atas kepercayaan Anda merawat kesehatan gigi & mulut di Klinik Lala Dentist. Senyum Indah dimulai di Laladentist.",
  updatedAt: "2026-01-01T00:00:00Z",
  updatedBy: "super-admin"
};

export const MOCK_INVOICES: Invoice[] = [
  {
    id: "invoice-1",
    invoiceNumber: "INV/GEB/202609/0001",
    visitId: "visit-1",
    patientId: "patient-1",
    branchId: "branch-gebang",
    totalAmount: 150000,
    discountAmount: 0,
    taxAmount: 0,
    netAmount: 150000,
    paidAmount: 50000, // Invoice != Payment (Outstanding != Paid)
    outstandingAmount: 100000,
    status: InvoiceStatus.PARTIALLY_PAID,
    createdAt: "2026-09-21T09:50:00Z",
    updatedAt: "2026-09-21T10:00:00Z"
  }
];

export const MOCK_INVOICE_ITEMS: InvoiceItem[] = [
  {
    id: "inv-item-1",
    invoiceId: "invoice-1",
    serviceId: "service-scaling",
    descriptionSnapshot: "Scaling & Polishing (Pembersihan Karang)", // historical snapshot
    unitPriceSnapshot: 150000,
    quantity: 1,
    amount: 150000,
    createdAt: "2026-09-21T09:50:00Z"
  }
];

export const MOCK_PAYMENTS: PaymentTransaction[] = [
  {
    id: "payment-1",
    receiptNumber: "KWT/GEB/202609/0001",
    invoiceId: "invoice-1",
    branchId: "branch-gebang",
    amount: 50000, // Partial payment
    paymentMethod: PaymentMethod.QRIS,
    referenceNumber: "QRIS991823901",
    transactionDateTime: "2026-09-21T10:00:00Z",
    staffId: "admin-gebang-1",
    status: "SUCCESS",
    createdAt: "2026-09-21T10:00:00Z",
    updatedAt: "2026-09-21T10:00:00Z"
  }
];

export const MOCK_RULES: StaffCompensationRule[] = [
  {
    id: "rule-clary-scaling",
    staffId: "assistant-clary",
    name: "Komisi Scaling Clary",
    ruleTypeSnapshot: "PERCENTAGE",
    valueSnapshot: 10, // 10%
    isActive: true,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z"
  }
];

export const MOCK_ACCRUALS: CompensationAccrual[] = [
  {
    id: "accrual-1",
    staffId: "assistant-clary",
    ruleIdSnapshot: "rule-clary-scaling",
    ruleTypeSnapshot: "PERCENTAGE",
    valueSnapshot: 10,
    baseAmountSnapshot: 150000,
    amount: 15000, // 10% of 150000 = 15000
    sourceId: "treatment-job-1",
    accruedAt: "2026-09-21T10:15:00Z"
  }
];

export const MOCK_PAYROLLS: MonthlyPayroll[] = [
  {
    id: "payroll-clary-sep",
    staffId: "assistant-clary",
    month: 9,
    year: 2026,
    baseSalary: 2500000,
    totalCompensation: 15000,
    totalDeductions: 0,
    netSalary: 2515000,
    status: PayrollStatus.DRAFT,
    branchId: "branch-gebang",
    bankNameSnapshot: "Bank Central Asia (BCA)",
    bankAccountNumberSnapshot: "143-089-2231",
    bankAccountHolderSnapshot: "Claryssa Putri",
    createdAt: "2026-09-21T02:00:00Z",
    updatedAt: "2026-09-21T02:00:00Z"
  },
  {
    id: "payroll-syafira-sep",
    staffId: "doc-syafira",
    month: 9,
    year: 2026,
    baseSalary: 4500000,
    totalCompensation: 1250000,
    totalDeductions: 0,
    netSalary: 5750000,
    status: PayrollStatus.DRAFT,
    branchId: "branch-gebang",
    bankNameSnapshot: "Bank Mandiri",
    bankAccountNumberSnapshot: "143-00-9876543-2",
    bankAccountHolderSnapshot: "drg. Syafira Al-Zahra",
    createdAt: "2026-09-21T02:00:00Z",
    updatedAt: "2026-09-21T02:00:00Z"
  }
];

export const MOCK_PAYROLL_ITEMS: PayrollItem[] = [
  {
    id: "payroll-item-1",
    payrollId: "payroll-clary-sep",
    descriptionSnapshot: "Gaji Pokok September 2026",
    amountSnapshot: 2500000,
    type: "EARNING"
  },
  {
    id: "payroll-item-2",
    payrollId: "payroll-clary-sep",
    descriptionSnapshot: "Komisi Asistensi Scaling Pasien (Accrual #accrual-1)",
    amountSnapshot: 15000,
    type: "EARNING",
    sourceId: "accrual-1"
  },
  {
    id: "payroll-item-3",
    payrollId: "payroll-syafira-sep",
    descriptionSnapshot: "Gaji Pokok / Uang Duduk Dokter September 2026",
    amountSnapshot: 4500000,
    type: "EARNING"
  },
  {
    id: "payroll-item-4",
    payrollId: "payroll-syafira-sep",
    descriptionSnapshot: "Bagi Hasil Medis / Komisi Tindakan Scaling & Restorasi Pasien",
    amountSnapshot: 1250000,
    type: "EARNING"
  }
];

export const MOCK_TREATMENT_ACTIVITIES: TreatmentActivity[] = [
  {
    id: "act-1",
    treatmentId: "treatment-job-1",
    treatmentJobId: "treatment-job-1",
    actorId: "assistant-clary",
    actorRole: UserRole.DOCTOR_ASSISTANT,
    actorNameSnapshot: "Siti Clary (Asisten)",
    activityType: TreatmentActivityType.STARTED,
    activityAt: "2026-09-21T09:25:00Z",
    notes: "Memulai persiapan instrumen scaling",
    branchId: "branch-gebang"
  },
  {
    id: "act-2",
    treatmentId: "treatment-job-1",
    treatmentJobId: "treatment-job-1",
    actorId: "doc-syafira",
    actorRole: UserRole.DOCTOR,
    actorNameSnapshot: "drg. Syafira",
    activityType: TreatmentActivityType.PROGRESS,
    activityAt: "2026-09-21T09:30:00Z",
    notes: "Pembersihan karang kuadran 1 dan 2 selesai",
    branchId: "branch-gebang"
  },
  {
    id: "act-3",
    treatmentId: "treatment-job-3",
    treatmentJobId: "treatment-job-3",
    actorId: "doc-syafira",
    actorRole: UserRole.DOCTOR,
    actorNameSnapshot: "drg. Syafira",
    activityType: TreatmentActivityType.STARTED,
    activityAt: "2026-09-18T10:10:00Z",
    branchId: "branch-gebang"
  },
  {
    id: "act-4",
    treatmentId: "treatment-job-3",
    treatmentJobId: "treatment-job-3",
    actorId: "doc-syafira",
    actorRole: UserRole.DOCTOR,
    actorNameSnapshot: "drg. Syafira",
    activityType: TreatmentActivityType.COMPLETED,
    activityAt: "2026-09-18T11:10:00Z",
    notes: "Ekstirpasi jaringan pulpa & pengisian saluran akar selesai",
    branchId: "branch-gebang"
  }
];

// ==========================================
// ACCOUNTING MOCK DATA (Phase 1)
// ==========================================

export const MOCK_CHART_OF_ACCOUNTS: ChartOfAccount[] = [
  // ASSET (1000 - 1999) - Normal: DEBIT
  {
    id: "coa-1000",
    code: "1000",
    name: "Kas (Cash)",
    accountType: AccountType.ASSET,
    accountCategory: AccountCategory.CASH,
    normalBalance: NormalBalance.DEBIT,
    isActive: true,
    description: "Kas fisik kasir & operasional cabang",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z"
  },
  {
    id: "coa-1010",
    code: "1010",
    name: "Bank & QRIS Settlement",
    accountType: AccountType.ASSET,
    accountCategory: AccountCategory.BANK,
    normalBalance: NormalBalance.DEBIT,
    isActive: true,
    description: "Rekening bank operasional klinik & penampungan QRIS",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z"
  },
  {
    id: "coa-1100",
    code: "1100",
    name: "Piutang Pasien (Accounts Receivable)",
    accountType: AccountType.ASSET,
    accountCategory: AccountCategory.ACCOUNTS_RECEIVABLE,
    normalBalance: NormalBalance.DEBIT,
    isActive: true,
    description: "Tagihan invoice perawatan pasien yang belum lunas",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z"
  },
  {
    id: "coa-1200",
    code: "1200",
    name: "Persediaan Bahan Medis (Inventory)",
    accountType: AccountType.ASSET,
    accountCategory: AccountCategory.INVENTORY,
    normalBalance: NormalBalance.DEBIT,
    isActive: true,
    description: "Stok obat, komposit, anestesi, dan bahan medis habis pakai",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z"
  },
  {
    id: "coa-1300",
    code: "1300",
    name: "Beban Dibayar Dimuka (Prepaid Expense)",
    accountType: AccountType.ASSET,
    accountCategory: AccountCategory.PREPAID_EXPENSE,
    normalBalance: NormalBalance.DEBIT,
    isActive: true,
    description: "Sewa gedung dan asuransi dibayar di muka",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z"
  },
  {
    id: "coa-1500",
    code: "1500",
    name: "Aset Tetap & Peralatan Dental (Fixed Asset)",
    accountType: AccountType.ASSET,
    accountCategory: AccountCategory.FIXED_ASSET,
    normalBalance: NormalBalance.DEBIT,
    isActive: true,
    description: "Dental unit chair, autoclave, scaler, dan perlengkapan klinik",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z"
  },

  // LIABILITY (2000 - 2999) - Normal: CREDIT
  {
    id: "coa-2000",
    code: "2000",
    name: "Hutang Usaha & Supplier (Accounts Payable)",
    accountType: AccountType.LIABILITY,
    accountCategory: AccountCategory.ACCOUNTS_PAYABLE,
    normalBalance: NormalBalance.CREDIT,
    isActive: true,
    description: "Kewajiban pembayaran kepada supplier dan vendor dental",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z"
  },
  {
    id: "coa-2010",
    code: "2010",
    name: "Hutang Gaji Staff (Payroll Payable)",
    accountType: AccountType.LIABILITY,
    accountCategory: AccountCategory.PAYROLL_PAYABLE,
    normalBalance: NormalBalance.CREDIT,
    isActive: true,
    description: "Akrual gaji bulanan karyawan/perawat yang belum dibayarkan",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z"
  },
  {
    id: "coa-2020",
    code: "2020",
    name: "Hutang Jasa Dokter (Doctor Payable)",
    accountType: AccountType.LIABILITY,
    accountCategory: AccountCategory.DOCTOR_PAYABLE,
    normalBalance: NormalBalance.CREDIT,
    isActive: true,
    description: "Bagi hasil dan honor medis dokter gigi terakrual",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z"
  },
  {
    id: "coa-2030",
    code: "2030",
    name: "Hutang Insentif & Kompensasi (Incentive Payable)",
    accountType: AccountType.LIABILITY,
    accountCategory: AccountCategory.INCENTIVE_PAYABLE,
    normalBalance: NormalBalance.CREDIT,
    isActive: true,
    description: "Kewajiban bonus dan insentif asisten dokter",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z"
  },
  {
    id: "coa-2040",
    code: "2040",
    name: "Hutang Pajak (Tax Payable)",
    accountType: AccountType.LIABILITY,
    accountCategory: AccountCategory.TAX_PAYABLE,
    normalBalance: NormalBalance.CREDIT,
    isActive: true,
    description: "PPN dan PPh 21/23 yang belum disetorkan",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z"
  },

  // EQUITY (3000 - 3999) - Normal: CREDIT
  {
    id: "coa-3000",
    code: "3000",
    name: "Modal Pemilik (Owner Capital)",
    accountType: AccountType.EQUITY,
    accountCategory: AccountCategory.OWNER_CAPITAL,
    normalBalance: NormalBalance.CREDIT,
    isActive: true,
    description: "Setoran modal awal pendirian klinik Lala Dentist",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z"
  },
  {
    id: "coa-3100",
    code: "3100",
    name: "Laba Ditahan (Retained Earnings)",
    accountType: AccountType.EQUITY,
    accountCategory: AccountCategory.RETAINED_EARNINGS,
    normalBalance: NormalBalance.CREDIT,
    isActive: true,
    description: "Akumulasi laba bersih periode sebelumnya",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z"
  },

  // REVENUE (4000 - 4999) - Normal: CREDIT
  {
    id: "coa-4000",
    code: "4000",
    name: "Pendapatan Tindakan Medis (Treatment Revenue)",
    accountType: AccountType.REVENUE,
    accountCategory: AccountCategory.TREATMENT_REVENUE,
    normalBalance: NormalBalance.CREDIT,
    isActive: true,
    description: "Pendapatan dari layanan scaling, tambal, behel, bleaching, dll",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z"
  },
  {
    id: "coa-4100",
    code: "4100",
    name: "Pendapatan Lain-lain (Other Revenue)",
    accountType: AccountType.REVENUE,
    accountCategory: AccountCategory.OTHER_REVENUE,
    normalBalance: NormalBalance.CREDIT,
    isActive: true,
    description: "Pendapatan penjualan dental care merchandise dan admin fee",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z"
  },

  // EXPENSE (5000 - 5999) - Normal: DEBIT
  {
    id: "coa-5000",
    code: "5000",
    name: "Beban Gaji Staff (Salary Expense)",
    accountType: AccountType.EXPENSE,
    accountCategory: AccountCategory.SALARY_EXPENSE,
    normalBalance: NormalBalance.DEBIT,
    isActive: true,
    description: "Beban gaji pokok staff admin, kasir, dan asisten",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z"
  },
  {
    id: "coa-5010",
    code: "5010",
    name: "Beban Bagi Hasil Dokter (Doctor Fee Expense)",
    accountType: AccountType.EXPENSE,
    accountCategory: AccountCategory.DOCTOR_FEE_EXPENSE,
    normalBalance: NormalBalance.DEBIT,
    isActive: true,
    description: "Beban komisi dan fee dokter gigi atas tindakan klinis",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z"
  },
  {
    id: "coa-5020",
    code: "5020",
    name: "Beban Insentif Staff (Incentive Expense)",
    accountType: AccountType.EXPENSE,
    accountCategory: AccountCategory.INCENTIVE_EXPENSE,
    normalBalance: NormalBalance.DEBIT,
    isActive: true,
    description: "Beban bonus pendampingan dan insentif kinerja staff",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z"
  },
  {
    id: "coa-5030",
    code: "5030",
    name: "Beban Sewa Gedung & Tempat (Rent Expense)",
    accountType: AccountType.EXPENSE,
    accountCategory: AccountCategory.RENT_EXPENSE,
    normalBalance: NormalBalance.DEBIT,
    isActive: true,
    description: "Beban sewa lokasi klinik cabang",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z"
  },
  {
    id: "coa-5040",
    code: "5040",
    name: "Beban Listrik, Air & Internet (Utilities Expense)",
    accountType: AccountType.EXPENSE,
    accountCategory: AccountCategory.UTILITIES_EXPENSE,
    normalBalance: NormalBalance.DEBIT,
    isActive: true,
    description: "Tagihan operasional rutin utilitas klinik",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z"
  },
  {
    id: "coa-5050",
    code: "5050",
    name: "Beban Bahan & Perlengkapan Medis (Supplies Expense)",
    accountType: AccountType.EXPENSE,
    accountCategory: AccountCategory.SUPPLIES_EXPENSE,
    normalBalance: NormalBalance.DEBIT,
    isActive: true,
    description: "Pemakaian masker, sarung tangan, jarum, dan bahan steril",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z"
  },
  {
    id: "coa-5060",
    code: "5060",
    name: "Beban Pemasaran & Iklan (Marketing Expense)",
    accountType: AccountType.EXPENSE,
    accountCategory: AccountCategory.MARKETING_EXPENSE,
    normalBalance: NormalBalance.DEBIT,
    isActive: true,
    description: "Promosi medsos, brosur, event, dan branding Lala Dentist",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z"
  },
  {
    id: "coa-5090",
    code: "5090",
    name: "Beban Operasional Lainnya (Other Operating Expense)",
    accountType: AccountType.EXPENSE,
    accountCategory: AccountCategory.OTHER_OPERATING_EXPENSE,
    normalBalance: NormalBalance.DEBIT,
    isActive: true,
    description: "Beban kebersihan, ATK, pemeliharaan gedung, dan lain-lain",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z"
  }
];

export const MOCK_JOURNAL_ENTRIES: JournalEntry[] = [
  {
    id: "jrn-1",
    journalNumber: "JRN-GEB-20260901-0001",
    journalDate: "2026-09-01",
    branchId: "branch-gebang",
    description: "Setoran modal awal operasional Cabang Gebang",
    sourceType: JournalSourceType.MANUAL,
    sourceId: null,
    status: JournalStatus.POSTED,
    totalDebit: 50000000,
    totalCredit: 50000000,
    lines: [
      {
        id: "jrnl-1-1",
        journalEntryId: "jrn-1",
        accountId: "coa-1010", // Bank
        debit: 50000000,
        credit: 0,
        branchId: "branch-gebang",
        description: "Penyetoran kas modal ke rekening bank cabang Gebang"
      },
      {
        id: "jrnl-1-2",
        journalEntryId: "jrn-1",
        accountId: "coa-3000", // Modal Pemilik
        debit: 0,
        credit: 50000000,
        branchId: "branch-gebang",
        description: "Ekuitas modal awal pemilik"
      }
    ],
    createdBy: "superadmin-1",
    createdAt: "2026-09-01T08:00:00Z",
    postedAt: "2026-09-01T08:00:00Z",
    postedBy: "superadmin-1"
  },
  {
    id: "jrn-2",
    journalNumber: "JRN-GEB-20260918-0002",
    journalDate: "2026-09-18",
    branchId: "branch-gebang",
    description: "Pengakuan piutang & pendapatan perawatan gigi INV-GEB-20260918-0001",
    sourceType: JournalSourceType.INVOICE,
    sourceId: "inv-1",
    status: JournalStatus.POSTED,
    totalDebit: 388500,
    totalCredit: 388500,
    lines: [
      {
        id: "jrnl-2-1",
        journalEntryId: "jrn-2",
        accountId: "coa-1100", // Piutang Pasien
        debit: 388500,
        credit: 0,
        branchId: "branch-gebang",
        description: "Piutang perawatan Budi Santoso"
      },
      {
        id: "jrnl-2-2",
        journalEntryId: "jrn-2",
        accountId: "coa-4000", // Pendapatan Tindakan Medis
        debit: 0,
        credit: 388500,
        branchId: "branch-gebang",
        description: "Pendapatan tindakan scaling & tambal komposit"
      }
    ],
    createdBy: "admin-gebang-1",
    createdAt: "2026-09-18T10:45:00Z",
    postedAt: "2026-09-18T10:45:00Z",
    postedBy: "admin-gebang-1"
  },
  {
    id: "jrn-3",
    journalNumber: "JRN-GEB-20260918-0003",
    journalDate: "2026-09-18",
    branchId: "branch-gebang",
    description: "Penerimaan pembayaran kasir QRIS transaksi PAY-GEB-20260918-0001",
    sourceType: JournalSourceType.PAYMENT,
    sourceId: "pay-1",
    status: JournalStatus.POSTED,
    totalDebit: 388500,
    totalCredit: 388500,
    lines: [
      {
        id: "jrnl-3-1",
        journalEntryId: "jrn-3",
        accountId: "coa-1010", // Bank / QRIS Settlement
        debit: 388500,
        credit: 0,
        branchId: "branch-gebang",
        description: "Penerimaan settlement QRIS invoice INV-GEB-20260918-0001"
      },
      {
        id: "jrnl-3-2",
        journalEntryId: "jrn-3",
        accountId: "coa-1100", // Piutang Pasien
        debit: 0,
        credit: 388500,
        branchId: "branch-gebang",
        description: "Pelunasan piutang pasien Budi Santoso"
      }
    ],
    createdBy: "admin-gebang-1",
    createdAt: "2026-09-18T11:00:00Z",
    postedAt: "2026-09-18T11:00:00Z",
    postedBy: "admin-gebang-1"
  },
  {
    id: "jrn-4",
    journalNumber: "JRN-KAM-20260901-0001",
    journalDate: "2026-09-01",
    branchId: "branch-kampus",
    description: "Setoran modal awal operasional Cabang Kampus",
    sourceType: JournalSourceType.MANUAL,
    sourceId: null,
    status: JournalStatus.POSTED,
    totalDebit: 30000000,
    totalCredit: 30000000,
    lines: [
      {
        id: "jrnl-4-1",
        journalEntryId: "jrn-4",
        accountId: "coa-1010", // Bank
        debit: 30000000,
        credit: 0,
        branchId: "branch-kampus",
        description: "Penyetoran kas modal ke rekening bank cabang Kampus"
      },
      {
        id: "jrnl-4-2",
        journalEntryId: "jrn-4",
        accountId: "coa-3000", // Modal Pemilik
        debit: 0,
        credit: 30000000,
        branchId: "branch-kampus",
        description: "Ekuitas modal awal pemilik"
      }
    ],
    createdBy: "superadmin-1",
    createdAt: "2026-09-01T08:00:00Z",
    postedAt: "2026-09-01T08:00:00Z",
    postedBy: "superadmin-1"
  },
  {
    id: "jrn-5",
    journalNumber: "JRN-MUK-20260901-0001",
    journalDate: "2026-09-01",
    branchId: "branch-muktisari",
    description: "Setoran kas awal kasir operasional Cabang Muktisari",
    sourceType: JournalSourceType.MANUAL,
    sourceId: null,
    status: JournalStatus.POSTED,
    totalDebit: 15000000,
    totalCredit: 15000000,
    lines: [
      {
        id: "jrnl-5-1",
        journalEntryId: "jrn-5",
        accountId: "coa-1000", // Kas
        debit: 15000000,
        credit: 0,
        branchId: "branch-muktisari",
        description: "Pengisian kas kasir fisik cabang Muktisari"
      },
      {
        id: "jrnl-5-2",
        journalEntryId: "jrn-5",
        accountId: "coa-3000", // Modal Pemilik
        debit: 0,
        credit: 15000000,
        branchId: "branch-muktisari",
        description: "Modal awal pemilik cabang Muktisari"
      }
    ],
    createdBy: "superadmin-1",
    createdAt: "2026-09-01T08:00:00Z",
    postedAt: "2026-09-01T08:00:00Z",
    postedBy: "superadmin-1"
  },
  {
    id: "jrn-6",
    journalNumber: "JRN-GEB-20260919-0004",
    journalDate: "2026-09-19",
    branchId: "branch-gebang",
    description: "Penerimaan pembayaran tunai kasir perawatan scaling",
    sourceType: JournalSourceType.MANUAL,
    sourceId: null,
    status: JournalStatus.POSTED,
    totalDebit: 300000,
    totalCredit: 300000,
    lines: [
      {
        id: "jrnl-6-1",
        journalEntryId: "jrn-6",
        accountId: "coa-1000", // Kas
        debit: 300000,
        credit: 0,
        branchId: "branch-gebang",
        description: "Penerimaan kas tunai"
      },
      {
        id: "jrnl-6-2",
        journalEntryId: "jrn-6",
        accountId: "coa-4000", // Pendapatan
        debit: 0,
        credit: 300000,
        branchId: "branch-gebang",
        description: "Pendapatan perawatan gigi tunai"
      }
    ],
    createdBy: "admin-gebang-1",
    createdAt: "2026-09-19T14:00:00Z",
    postedAt: "2026-09-19T14:00:00Z",
    postedBy: "admin-gebang-1"
  }
];

// ==========================================
// PHASE HR-1 SEED DATA
// ==========================================

export const MOCK_STAFF: Staff[] = [
  // Doctors
  {
    id: "staff-doc-syafira",
    employeeCode: "EMP-001",
    fullName: "drg. Syafira",
    phone: "081234567811",
    position: StaffPosition.DOCTOR,
    employmentStatus: EmploymentStatus.ACTIVE,
    joinDate: "2024-01-10",
    active: true,
    branchId: "branch-gebang",
    userAccountId: "user-doc-syafira",
    bankName: "Bank Mandiri",
    bankAccountNumber: "143-00-9876543-2",
    bankAccountHolder: "drg. Syafira Al-Zahra",
    notes: "Dokter Gigi Umum Gebang & Ambulu",
    createdAt: "2024-01-10T08:00:00Z",
    updatedAt: "2024-01-10T08:00:00Z"
  },
  {
    id: "staff-doc-lala",
    employeeCode: "EMP-002",
    fullName: "drg. Lala",
    phone: "081234567812",
    position: StaffPosition.DOCTOR,
    employmentStatus: EmploymentStatus.ACTIVE,
    joinDate: "2023-05-15",
    active: true,
    branchId: "branch-gebang",
    userAccountId: "user-doc-lala",
    notes: "Spesialis Orthodonti",
    createdAt: "2023-05-15T08:00:00Z",
    updatedAt: "2023-05-15T08:00:00Z"
  },
  {
    id: "staff-doc-vio",
    employeeCode: "EMP-003",
    fullName: "drg. Vio",
    phone: "081234567813",
    position: StaffPosition.DOCTOR,
    employmentStatus: EmploymentStatus.ACTIVE,
    joinDate: "2024-02-01",
    active: true,
    branchId: "branch-gebang",
    userAccountId: "user-doc-vio",
    notes: "Dokter Gigi Umum Gebang & Kencong",
    createdAt: "2024-02-01T08:00:00Z",
    updatedAt: "2024-02-01T08:00:00Z"
  },
  {
    id: "staff-doc-yuni",
    employeeCode: "EMP-004",
    fullName: "drg. Yuni",
    phone: "081234567814",
    position: StaffPosition.DOCTOR,
    employmentStatus: EmploymentStatus.ACTIVE,
    joinDate: "2023-08-10",
    active: true,
    branchId: "branch-ambulu",
    userAccountId: "user-doc-yuni",
    notes: "Dokter Gigi Spesialis Anak multi-cabang",
    createdAt: "2023-08-10T08:00:00Z",
    updatedAt: "2023-08-10T08:00:00Z"
  },
  {
    id: "staff-doc-ulfa",
    employeeCode: "EMP-005",
    fullName: "drg. Ulfa",
    phone: "081234567815",
    position: StaffPosition.DOCTOR,
    employmentStatus: EmploymentStatus.ACTIVE,
    joinDate: "2025-01-05",
    active: true,
    branchId: "branch-ambulu",
    userAccountId: "user-doc-ulfa",
    notes: "Dokter Gigi Umum Ambulu",
    createdAt: "2025-01-05T08:00:00Z",
    updatedAt: "2025-01-05T08:00:00Z"
  },
  {
    id: "staff-doc-regina",
    employeeCode: "EMP-006",
    fullName: "drg. Regina",
    phone: "081234567816",
    position: StaffPosition.DOCTOR,
    employmentStatus: EmploymentStatus.ACTIVE,
    joinDate: "2024-03-20",
    active: true,
    branchId: "branch-lengkong-mumbul",
    userAccountId: "user-doc-regina",
    notes: "Dokter Gigi Periodonti",
    createdAt: "2024-03-20T08:00:00Z",
    updatedAt: "2024-03-20T08:00:00Z"
  },
  {
    id: "staff-doc-iza",
    employeeCode: "EMP-007",
    fullName: "drg. Iza",
    phone: "081234567817",
    position: StaffPosition.DOCTOR,
    employmentStatus: EmploymentStatus.ACTIVE,
    joinDate: "2025-02-01",
    active: true,
    branchId: "branch-kencong",
    userAccountId: "user-doc-iza",
    notes: "Dokter Gigi Umum Kencong",
    createdAt: "2025-02-01T08:00:00Z",
    updatedAt: "2025-02-01T08:00:00Z"
  },
  {
    id: "staff-doc-amel",
    employeeCode: "EMP-008",
    fullName: "drg. Amel",
    phone: "081234567818",
    position: StaffPosition.DOCTOR,
    employmentStatus: EmploymentStatus.ACTIVE,
    joinDate: "2024-06-01",
    active: true,
    branchId: "branch-kencong",
    userAccountId: "user-doc-amel",
    notes: "Dokter Gigi Prosthodonti Kencong",
    createdAt: "2024-06-01T08:00:00Z",
    updatedAt: "2024-06-01T08:00:00Z"
  },

  // Branch Admins
  {
    id: "staff-adm-gebang",
    employeeCode: "EMP-101",
    fullName: "Siska Wardani",
    phone: "081999888101",
    position: StaffPosition.BRANCH_ADMIN,
    employmentStatus: EmploymentStatus.ACTIVE,
    joinDate: "2023-04-01",
    active: true,
    branchId: "branch-gebang",
    userAccountId: "admin-gebang-1",
    notes: "Branch Admin Gebang",
    createdAt: "2023-04-01T08:00:00Z",
    updatedAt: "2023-04-01T08:00:00Z"
  },
  {
    id: "staff-adm-kampus",
    employeeCode: "EMP-102",
    fullName: "Rian Hidayat",
    phone: "081999888102",
    position: StaffPosition.BRANCH_ADMIN,
    employmentStatus: EmploymentStatus.ACTIVE,
    joinDate: "2023-04-01",
    active: true,
    branchId: "branch-kampus",
    userAccountId: "admin-kampus-1",
    notes: "Branch Admin Kampus",
    createdAt: "2023-04-01T08:00:00Z",
    updatedAt: "2023-04-01T08:00:00Z"
  },
  {
    id: "staff-adm-ambulu",
    employeeCode: "EMP-103",
    fullName: "Maya Indah",
    phone: "081999888103",
    position: StaffPosition.BRANCH_ADMIN,
    employmentStatus: EmploymentStatus.ACTIVE,
    joinDate: "2023-06-01",
    active: true,
    branchId: "branch-ambulu",
    userAccountId: "admin-ambulu-1",
    notes: "Branch Admin Ambulu",
    createdAt: "2023-06-01T08:00:00Z",
    updatedAt: "2023-06-01T08:00:00Z"
  },
  {
    id: "staff-adm-kencong",
    employeeCode: "EMP-104",
    fullName: "Dwi Lestari",
    phone: "081999888104",
    position: StaffPosition.BRANCH_ADMIN,
    employmentStatus: EmploymentStatus.ACTIVE,
    joinDate: "2023-06-01",
    active: true,
    branchId: "branch-kencong",
    userAccountId: "admin-kencong-1",
    notes: "Branch Admin Kencong",
    createdAt: "2023-06-01T08:00:00Z",
    updatedAt: "2023-06-01T08:00:00Z"
  },
  {
    id: "staff-adm-lengkong",
    employeeCode: "EMP-105",
    fullName: "Bayu Nugraha",
    phone: "081999888105",
    position: StaffPosition.BRANCH_ADMIN,
    employmentStatus: EmploymentStatus.ACTIVE,
    joinDate: "2023-07-01",
    active: true,
    branchId: "branch-lengkong-mumbul",
    userAccountId: "admin-lengkong-1",
    notes: "Branch Admin Lengkong Mumbul",
    createdAt: "2023-07-01T08:00:00Z",
    updatedAt: "2023-07-01T08:00:00Z"
  },
  {
    id: "staff-adm-muktisari",
    employeeCode: "EMP-106",
    fullName: "Fajar Ramadhan",
    phone: "081999888106",
    position: StaffPosition.BRANCH_ADMIN,
    employmentStatus: EmploymentStatus.ACTIVE,
    joinDate: "2023-08-01",
    active: true,
    branchId: "branch-muktisari",
    userAccountId: "admin-muktisari-1",
    notes: "Branch Admin Muktisari",
    createdAt: "2023-08-01T08:00:00Z",
    updatedAt: "2023-08-01T08:00:00Z"
  },

  // Assistants
  {
    id: "staff-ast-clary",
    employeeCode: "EMP-201",
    fullName: "Clary",
    phone: "081777666201",
    position: StaffPosition.ASSISTANT,
    employmentStatus: EmploymentStatus.ACTIVE,
    joinDate: "2023-05-01",
    active: true,
    branchId: "branch-gebang",
    userAccountId: "assistant-clary",
    bankName: "Bank Central Asia (BCA)",
    bankAccountNumber: "143-089-2231",
    bankAccountHolder: "Claryssa Putri",
    notes: "Dental Assistant Gebang",
    createdAt: "2023-05-01T08:00:00Z",
    updatedAt: "2023-05-01T08:00:00Z"
  },
  {
    id: "staff-ast-nanda",
    employeeCode: "EMP-202",
    fullName: "Nanda",
    phone: "081777666202",
    position: StaffPosition.ASSISTANT,
    employmentStatus: EmploymentStatus.ACTIVE,
    joinDate: "2023-06-15",
    active: true,
    branchId: "branch-ambulu",
    notes: "Dental Assistant Ambulu",
    createdAt: "2023-06-15T08:00:00Z",
    updatedAt: "2023-06-15T08:00:00Z"
  },
  {
    id: "staff-dinda-ambulu",
    employeeCode: "EMP-107",
    fullName: "Dinda",
    phone: "081234567831",
    position: StaffPosition.BRANCH_ADMIN,
    employmentStatus: EmploymentStatus.ACTIVE,
    joinDate: "2024-01-15",
    active: true,
    branchId: "branch-ambulu",
    userAccountId: "user-dinda-ambulu",
    notes: "Branch Admin Cabang Ambulu (Resepsionis & Kasir)",
    createdAt: "2024-01-15T08:00:00Z",
    updatedAt: "2024-01-15T08:00:00Z"
  },
  {
    id: "staff-anisa-ambulu",
    employeeCode: "EMP-203",
    fullName: "Anisa",
    phone: "081234567832",
    position: StaffPosition.ASSISTANT,
    employmentStatus: EmploymentStatus.ACTIVE,
    joinDate: "2024-02-01",
    active: true,
    branchId: "branch-ambulu",
    userAccountId: "user-anisa-ambulu",
    notes: "Asisten Dokter Gigi Cabang Ambulu",
    createdAt: "2024-02-01T08:00:00Z",
    updatedAt: "2024-02-01T08:00:00Z"
  },
  {
    id: "staff-marsa-ambulu",
    employeeCode: "EMP-204",
    fullName: "Marsa",
    phone: "081234567833",
    position: StaffPosition.ASSISTANT,
    employmentStatus: EmploymentStatus.ACTIVE,
    joinDate: "2024-02-15",
    active: true,
    branchId: "branch-ambulu",
    userAccountId: "user-marsa-ambulu",
    notes: "Asisten Dokter Gigi Cabang Ambulu",
    createdAt: "2024-02-15T08:00:00Z",
    updatedAt: "2024-02-15T08:00:00Z"
  },
  {
    id: "staff-anggel-gebang",
    employeeCode: "EMP-108",
    fullName: "ANGGEL",
    phone: "081234567834",
    position: StaffPosition.BRANCH_ADMIN,
    employmentStatus: EmploymentStatus.ACTIVE,
    joinDate: "2024-01-10",
    active: true,
    branchId: "branch-gebang",
    userAccountId: "user-anggel-gebang",
    notes: "Branch Admin Cabang Gebang",
    createdAt: "2024-01-10T08:00:00Z",
    updatedAt: "2024-01-10T08:00:00Z"
  },
  {
    id: "staff-lilis-gebang",
    employeeCode: "EMP-109",
    fullName: "LILIS",
    phone: "081234567835",
    position: StaffPosition.BRANCH_ADMIN,
    employmentStatus: EmploymentStatus.ACTIVE,
    joinDate: "2024-01-10",
    active: true,
    branchId: "branch-gebang",
    userAccountId: "user-lilis-gebang",
    notes: "Branch Admin Cabang Gebang",
    createdAt: "2024-01-10T08:00:00Z",
    updatedAt: "2024-01-10T08:00:00Z"
  },
  {
    id: "staff-cece-gebang",
    employeeCode: "EMP-110",
    fullName: "CECE",
    phone: "081234567836",
    position: StaffPosition.BRANCH_ADMIN,
    employmentStatus: EmploymentStatus.ACTIVE,
    joinDate: "2024-01-10",
    active: true,
    branchId: "branch-gebang",
    userAccountId: "user-cece-gebang",
    notes: "Branch Admin Cabang Gebang",
    createdAt: "2024-01-10T08:00:00Z",
    updatedAt: "2024-01-10T08:00:00Z"
  },
  {
    id: "staff-linda-gebang",
    employeeCode: "EMP-205",
    fullName: "LINDA",
    phone: "081234567837",
    position: StaffPosition.ASSISTANT,
    employmentStatus: EmploymentStatus.ACTIVE,
    joinDate: "2024-02-01",
    active: true,
    branchId: "branch-gebang",
    userAccountId: "user-linda-gebang",
    notes: "Asisten Dokter Gigi Cabang Gebang",
    createdAt: "2024-02-01T08:00:00Z",
    updatedAt: "2024-02-01T08:00:00Z"
  },
  {
    id: "staff-novi-gebang",
    employeeCode: "EMP-206",
    fullName: "NOVI",
    phone: "081234567838",
    position: StaffPosition.ASSISTANT,
    employmentStatus: EmploymentStatus.ACTIVE,
    joinDate: "2024-02-01",
    active: true,
    branchId: "branch-gebang",
    userAccountId: "user-novi-gebang",
    notes: "Asisten Dokter Gigi Cabang Gebang",
    createdAt: "2024-02-01T08:00:00Z",
    updatedAt: "2024-02-01T08:00:00Z"
  },
  {
    id: "staff-ayik-kampus",
    employeeCode: "EMP-111",
    fullName: "AYIK",
    phone: "081234567839",
    position: StaffPosition.BRANCH_ADMIN,
    employmentStatus: EmploymentStatus.ACTIVE,
    joinDate: "2024-01-15",
    active: true,
    branchId: "branch-kampus",
    userAccountId: "user-ayik-kampus",
    notes: "Branch Admin Cabang Kampus",
    createdAt: "2024-01-15T08:00:00Z",
    updatedAt: "2024-01-15T08:00:00Z"
  },
  {
    id: "staff-usnake-kencong",
    employeeCode: "EMP-112",
    fullName: "USNAKE",
    phone: "081234567840",
    position: StaffPosition.BRANCH_ADMIN,
    employmentStatus: EmploymentStatus.ACTIVE,
    joinDate: "2024-01-15",
    active: true,
    branchId: "branch-kencong",
    userAccountId: "user-usnake-kencong",
    notes: "Branch Admin Cabang Kencong",
    createdAt: "2024-01-15T08:00:00Z",
    updatedAt: "2024-01-15T08:00:00Z"
  },
  {
    id: "staff-cyntia-kencong",
    employeeCode: "EMP-113",
    fullName: "CYNTIA",
    phone: "081234567841",
    position: StaffPosition.BRANCH_ADMIN,
    employmentStatus: EmploymentStatus.ACTIVE,
    joinDate: "2024-01-15",
    active: true,
    branchId: "branch-kencong",
    userAccountId: "user-cyntia-kencong",
    notes: "Branch Admin Cabang Kencong",
    createdAt: "2024-01-15T08:00:00Z",
    updatedAt: "2024-01-15T08:00:00Z"
  },
  {
    id: "staff-khalisa-kencong",
    employeeCode: "EMP-207",
    fullName: "KHALISA",
    phone: "081234567842",
    position: StaffPosition.ASSISTANT,
    employmentStatus: EmploymentStatus.ACTIVE,
    joinDate: "2024-02-01",
    active: true,
    branchId: "branch-kencong",
    userAccountId: "user-khalisa-kencong",
    notes: "Asisten Dokter Gigi Cabang Kencong",
    createdAt: "2024-02-01T08:00:00Z",
    updatedAt: "2024-02-01T08:00:00Z"
  },
  {
    id: "staff-anita-kencong",
    employeeCode: "EMP-208",
    fullName: "ANITA",
    phone: "081234567843",
    position: StaffPosition.ASSISTANT,
    employmentStatus: EmploymentStatus.ACTIVE,
    joinDate: "2024-02-01",
    active: true,
    branchId: "branch-kencong",
    userAccountId: "user-anita-kencong",
    notes: "Asisten Dokter Gigi Cabang Kencong",
    createdAt: "2024-02-01T08:00:00Z",
    updatedAt: "2024-02-01T08:00:00Z"
  },
  {
    id: "staff-rani-lengkong",
    employeeCode: "EMP-114",
    fullName: "RANI",
    phone: "081234567844",
    position: StaffPosition.BRANCH_ADMIN,
    employmentStatus: EmploymentStatus.ACTIVE,
    joinDate: "2024-01-15",
    active: true,
    branchId: "branch-lengkong-mumbul",
    userAccountId: "user-rani-lengkong",
    notes: "Branch Admin Cabang Lengkong Mumbul",
    createdAt: "2024-01-15T08:00:00Z",
    updatedAt: "2024-01-15T08:00:00Z"
  },
  {
    id: "staff-ima-lengkong",
    employeeCode: "EMP-115",
    fullName: "IMA",
    phone: "081234567845",
    position: StaffPosition.BRANCH_ADMIN,
    employmentStatus: EmploymentStatus.ACTIVE,
    joinDate: "2024-01-15",
    active: true,
    branchId: "branch-lengkong-mumbul",
    userAccountId: "user-ima-lengkong",
    notes: "Branch Admin Cabang Lengkong Mumbul",
    createdAt: "2024-01-15T08:00:00Z",
    updatedAt: "2024-01-15T08:00:00Z"
  },
  {
    id: "staff-ast-dina",
    employeeCode: "EMP-203",
    fullName: "Dina",
    phone: "081777666203",
    position: StaffPosition.ASSISTANT,
    employmentStatus: EmploymentStatus.ACTIVE,
    joinDate: "2023-07-01",
    active: true,
    branchId: "branch-kencong",
    notes: "Dental Assistant Kencong",
    createdAt: "2023-07-01T08:00:00Z",
    updatedAt: "2023-07-01T08:00:00Z"
  },
  {
    id: "staff-ast-putri",
    employeeCode: "EMP-204",
    fullName: "Putri",
    phone: "081777666204",
    position: StaffPosition.ASSISTANT,
    employmentStatus: EmploymentStatus.ACTIVE,
    joinDate: "2023-08-01",
    active: true,
    branchId: "branch-kampus",
    notes: "Dental Assistant Kampus",
    createdAt: "2023-08-01T08:00:00Z",
    updatedAt: "2023-08-01T08:00:00Z"
  },

  // Office Boy (Staff without User Account, per section 4 & 10)
  {
    id: "staff-ob-gebang",
    employeeCode: "EMP-301",
    fullName: "Pak Joko",
    phone: "081555444301",
    position: StaffPosition.OB,
    employmentStatus: EmploymentStatus.ACTIVE,
    joinDate: "2023-02-01",
    active: true,
    branchId: "branch-gebang",
    userAccountId: null,
    notes: "Office Boy Cabang Gebang - Tidak memiliki akun login",
    createdAt: "2023-02-01T08:00:00Z",
    updatedAt: "2023-02-01T08:00:00Z"
  },
  {
    id: "staff-ob-ambulu",
    employeeCode: "EMP-302",
    fullName: "Pak Slamet",
    phone: "081555444302",
    position: StaffPosition.OB,
    employmentStatus: EmploymentStatus.ACTIVE,
    joinDate: "2023-03-01",
    active: true,
    branchId: "branch-ambulu",
    userAccountId: null,
    notes: "Office Boy Cabang Ambulu - Tidak memiliki akun login",
    createdAt: "2023-03-01T08:00:00Z",
    updatedAt: "2023-03-01T08:00:00Z"
  },
  {
    id: "staff-ob-lengkong",
    employeeCode: "EMP-303",
    fullName: "Mas Anto",
    phone: "081555444303",
    position: StaffPosition.OB,
    employmentStatus: EmploymentStatus.ACTIVE,
    joinDate: "2023-04-10",
    active: true,
    branchId: "branch-lengkong-mumbul",
    userAccountId: null,
    notes: "Office Boy Cabang Lengkong Mumbul - Tidak memiliki akun login",
    createdAt: "2023-04-10T08:00:00Z",
    updatedAt: "2023-04-10T08:00:00Z"
  },
  {
    id: "staff-ob-kencong",
    employeeCode: "EMP-304",
    fullName: "Mas Rudi",
    phone: "081555444304",
    position: StaffPosition.OB,
    employmentStatus: EmploymentStatus.ACTIVE,
    joinDate: "2023-05-01",
    active: true,
    branchId: "branch-kencong",
    userAccountId: null,
    notes: "Office Boy Cabang Kencong - Tidak memiliki akun login",
    createdAt: "2023-05-01T08:00:00Z",
    updatedAt: "2023-05-01T08:00:00Z"
  },
  {
    id: "staff-ob-kampus",
    employeeCode: "EMP-305",
    fullName: "Pak Bambang",
    phone: "081555444305",
    position: StaffPosition.OB,
    employmentStatus: EmploymentStatus.ACTIVE,
    joinDate: "2023-05-15",
    active: true,
    branchId: "branch-kampus",
    userAccountId: null,
    notes: "Office Boy Cabang Kampus - Tidak memiliki akun login",
    createdAt: "2023-05-15T08:00:00Z",
    updatedAt: "2023-05-15T08:00:00Z"
  },
  {
    id: "staff-ob-muktisari",
    employeeCode: "EMP-306",
    fullName: "Mas Eko",
    phone: "081555444306",
    position: StaffPosition.OB,
    employmentStatus: EmploymentStatus.ACTIVE,
    joinDate: "2023-06-01",
    active: true,
    branchId: "branch-muktisari",
    userAccountId: null,
    notes: "Office Boy Cabang Muktisari - Tidak memiliki akun login",
    createdAt: "2023-06-01T08:00:00Z",
    updatedAt: "2023-06-01T08:00:00Z"
  }
];

export const MOCK_DOCTOR_BRANCH_ASSIGNMENTS: DoctorBranchAssignment[] = [
  // drg. Ulfa -> Gebang
  {
    id: "dba-ulfa-geb",
    doctorId: "doc-ulfa",
    branchId: "branch-gebang",
    startDate: "2025-01-05",
    active: true,
    notes: "Penempatan Cabang Gebang",
    createdAt: "2025-01-05T08:00:00Z",
    updatedAt: "2025-01-05T08:00:00Z"
  },
  // drg. Amel -> Kencong
  {
    id: "dba-amel-ken",
    doctorId: "doc-amel",
    branchId: "branch-kencong",
    startDate: "2024-06-01",
    active: true,
    notes: "Penempatan Cabang Kencong",
    createdAt: "2024-06-01T08:00:00Z",
    updatedAt: "2024-06-01T08:00:00Z"
  },
  // drg. Iza -> Kencong
  {
    id: "dba-iza-ken",
    doctorId: "doc-iza",
    branchId: "branch-kencong",
    startDate: "2025-02-01",
    active: true,
    notes: "Penempatan Cabang Kencong",
    createdAt: "2025-02-01T08:00:00Z",
    updatedAt: "2025-02-01T08:00:00Z"
  },
  // drg. Regina -> Lengkong Mumbul
  {
    id: "dba-regi-len",
    doctorId: "doc-regina",
    branchId: "branch-lengkong-mumbul",
    startDate: "2024-03-20",
    active: true,
    notes: "Penempatan Cabang Lengkong Mumbul",
    createdAt: "2024-03-20T08:00:00Z",
    updatedAt: "2024-03-20T08:00:00Z"
  },
  // drg. Vio -> Kencong
  {
    id: "dba-vio-ken",
    doctorId: "doc-vio",
    branchId: "branch-kencong",
    startDate: "2024-02-10",
    active: true,
    notes: "Penempatan Cabang Kencong",
    createdAt: "2024-02-10T08:00:00Z",
    updatedAt: "2024-02-10T08:00:00Z"
  },
  // drg. Yuni -> Gebang
  {
    id: "dba-yuni-geb",
    doctorId: "doc-yuni",
    branchId: "branch-gebang",
    startDate: "2023-09-10",
    active: true,
    notes: "Penempatan Cabang Gebang",
    createdAt: "2023-09-10T08:00:00Z",
    updatedAt: "2023-09-10T08:00:00Z"
  },
  // drg. Aab -> Lengkong Mumbul
  {
    id: "dba-aab-len",
    doctorId: "doc-aab",
    branchId: "branch-lengkong-mumbul",
    startDate: "2024-05-01",
    active: true,
    notes: "Penempatan Cabang Lengkong Mumbul",
    createdAt: "2024-05-01T08:00:00Z",
    updatedAt: "2024-05-01T08:00:00Z"
  },
  // drg. Syafira -> Gebang
  {
    id: "dba-syaf-geb",
    doctorId: "doc-syafira",
    branchId: "branch-gebang",
    startDate: "2024-01-10",
    active: true,
    notes: "Penempatan utama Cabang Gebang",
    createdAt: "2024-01-10T08:00:00Z",
    updatedAt: "2024-01-10T08:00:00Z"
  }
];

export const MOCK_WORK_SHIFTS: WorkShift[] = [
  // Gebang
  {
    id: "shift-geb-1",
    branchId: "branch-gebang",
    name: "Shift 1",
    startTime: "08:00",
    endTime: "14:00",
    active: true,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z"
  },
  {
    id: "shift-geb-2",
    branchId: "branch-gebang",
    name: "Shift 2",
    startTime: "14:00",
    endTime: "21:00",
    active: true,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z"
  },

  // Kencong
  {
    id: "shift-ken-1",
    branchId: "branch-kencong",
    name: "Shift 1",
    startTime: "08:00",
    endTime: "14:00",
    active: true,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z"
  },
  {
    id: "shift-ken-2",
    branchId: "branch-kencong",
    name: "Shift 2",
    startTime: "14:00",
    endTime: "21:00",
    active: true,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z"
  },

  // Ambulu
  {
    id: "shift-amb-1",
    branchId: "branch-ambulu",
    name: "Shift 1",
    startTime: "08:00",
    endTime: "14:00",
    active: true,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z"
  },
  {
    id: "shift-amb-2",
    branchId: "branch-ambulu",
    name: "Shift 2",
    startTime: "14:00",
    endTime: "21:00",
    active: true,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z"
  },

  // Kampus
  {
    id: "shift-kam-1",
    branchId: "branch-kampus",
    name: "Shift 1",
    startTime: "08:00",
    endTime: "14:00",
    active: true,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z"
  },
  {
    id: "shift-kam-2",
    branchId: "branch-kampus",
    name: "Shift 2",
    startTime: "14:00",
    endTime: "21:00",
    active: true,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z"
  },

  // Muktisari
  {
    id: "shift-muk-1",
    branchId: "branch-muktisari",
    name: "Shift 1",
    startTime: "08:00",
    endTime: "14:00",
    active: true,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z"
  },
  {
    id: "shift-muk-2",
    branchId: "branch-muktisari",
    name: "Shift 2",
    startTime: "14:00",
    endTime: "21:00",
    active: true,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z"
  },

  // Lengkong Mumbul (CRITICAL: Shift 2 ends at 19:00, not 21:00)
  {
    id: "shift-len-1",
    branchId: "branch-lengkong-mumbul",
    name: "Shift 1",
    startTime: "08:00",
    endTime: "14:00",
    active: true,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z"
  },
  {
    id: "shift-len-2",
    branchId: "branch-lengkong-mumbul",
    name: "Shift 2",
    startTime: "14:00",
    endTime: "19:00",
    active: true,
    notes: "Cabang Lengkong Mumbul tutup pukul 19:00",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z"
  }
];

export const MOCK_DOCTOR_SCHEDULES: DoctorSchedule[] = [
  // CABANG GEBANG (2026-09-21)
  {
    id: "sched-geb-1",
    doctorId: "doc-syafira",
    branchId: "branch-gebang",
    date: "2026-09-21",
    startTime: "08:00",
    endTime: "14:00",
    status: ScheduleStatus.ACTIVE,
    notes: "Jadwal Pagi Cabang Gebang",
    createdAt: "2026-09-15T08:00:00Z",
    updatedAt: "2026-09-15T08:00:00Z"
  },
  {
    id: "sched-geb-2",
    doctorId: "doc-lala",
    branchId: "branch-gebang",
    date: "2026-09-21",
    startTime: "14:00",
    endTime: "17:00",
    status: ScheduleStatus.ACTIVE,
    notes: "Jadwal Siang Cabang Gebang",
    createdAt: "2026-09-15T08:00:00Z",
    updatedAt: "2026-09-15T08:00:00Z"
  },
  {
    id: "sched-geb-3",
    doctorId: "doc-vio",
    branchId: "branch-gebang",
    date: "2026-09-21",
    startTime: "14:00",
    endTime: "19:00",
    status: ScheduleStatus.ACTIVE,
    notes: "Jadwal Sore Cabang Gebang",
    createdAt: "2026-09-15T08:00:00Z",
    updatedAt: "2026-09-15T08:00:00Z"
  },
  {
    id: "sched-geb-4",
    doctorId: "doc-yuni",
    branchId: "branch-gebang",
    date: "2026-09-21",
    startTime: "17:00",
    endTime: "21:00",
    status: ScheduleStatus.ACTIVE,
    notes: "Jadwal Malam Cabang Gebang",
    createdAt: "2026-09-15T08:00:00Z",
    updatedAt: "2026-09-15T08:00:00Z"
  },

  // CABANG AMBULU (2026-09-21)
  {
    id: "sched-amb-1",
    doctorId: "doc-ulfa",
    branchId: "branch-ambulu",
    date: "2026-09-21",
    startTime: "08:00",
    endTime: "13:00",
    status: ScheduleStatus.ACTIVE,
    notes: "Jadwal Pagi Cabang Ambulu",
    createdAt: "2026-09-15T08:00:00Z",
    updatedAt: "2026-09-15T08:00:00Z"
  },
  {
    id: "sched-amb-2",
    doctorId: "doc-yuni",
    branchId: "branch-ambulu",
    date: "2026-09-21",
    startTime: "13:00",
    endTime: "17:00",
    status: ScheduleStatus.ACTIVE,
    notes: "Jadwal Siang Cabang Ambulu",
    createdAt: "2026-09-15T08:00:00Z",
    updatedAt: "2026-09-15T08:00:00Z"
  },
  {
    id: "sched-amb-3",
    doctorId: "doc-syafira",
    branchId: "branch-ambulu",
    date: "2026-09-21",
    startTime: "17:00",
    endTime: "21:00",
    status: ScheduleStatus.ACTIVE,
    notes: "Jadwal Malam Cabang Ambulu",
    createdAt: "2026-09-15T08:00:00Z",
    updatedAt: "2026-09-15T08:00:00Z"
  },

  // CABANG LENGKONG MUMBUL (2026-09-21)
  {
    id: "sched-len-1",
    doctorId: "doc-yuni",
    branchId: "branch-lengkong-mumbul",
    date: "2026-09-21",
    startTime: "08:00",
    endTime: "13:00",
    status: ScheduleStatus.ACTIVE,
    notes: "Jadwal Pagi Cabang Lengkong Mumbul",
    createdAt: "2026-09-15T08:00:00Z",
    updatedAt: "2026-09-15T08:00:00Z"
  },
  {
    id: "sched-len-2",
    doctorId: "doc-regina",
    branchId: "branch-lengkong-mumbul",
    date: "2026-09-21",
    startTime: "13:00",
    endTime: "19:00",
    status: ScheduleStatus.ACTIVE,
    notes: "Jadwal Siang-Sore Cabang Lengkong Mumbul",
    createdAt: "2026-09-15T08:00:00Z",
    updatedAt: "2026-09-15T08:00:00Z"
  },

  // CABANG KENCONG (2026-09-21)
  {
    id: "sched-ken-1",
    doctorId: "doc-vio",
    branchId: "branch-kencong",
    date: "2026-09-21",
    startTime: "08:00",
    endTime: "13:00",
    status: ScheduleStatus.ACTIVE,
    notes: "Jadwal Pagi Cabang Kencong",
    createdAt: "2026-09-15T08:00:00Z",
    updatedAt: "2026-09-15T08:00:00Z"
  },
  {
    id: "sched-ken-2",
    doctorId: "doc-iza",
    branchId: "branch-kencong",
    date: "2026-09-21",
    startTime: "13:00",
    endTime: "17:00",
    status: ScheduleStatus.ACTIVE,
    notes: "Jadwal Siang Cabang Kencong",
    createdAt: "2026-09-15T08:00:00Z",
    updatedAt: "2026-09-15T08:00:00Z"
  },
  {
    id: "sched-ken-3",
    doctorId: "doc-amel",
    branchId: "branch-kencong",
    date: "2026-09-21",
    startTime: "17:00",
    endTime: "21:00",
    status: ScheduleStatus.ACTIVE,
    notes: "Jadwal Malam Cabang Kencong",
    createdAt: "2026-09-15T08:00:00Z",
    updatedAt: "2026-09-15T08:00:00Z"
  },

  // CABANG KAMPUS (2026-09-22)
  {
    id: "sched-kam-1",
    doctorId: "doc-yuni",
    branchId: "branch-kampus",
    date: "2026-09-22",
    startTime: "08:00",
    endTime: "13:00",
    status: ScheduleStatus.ACTIVE,
    notes: "Jadwal Pagi Cabang Kampus",
    createdAt: "2026-09-15T08:00:00Z",
    updatedAt: "2026-09-15T08:00:00Z"
  },
  {
    id: "sched-kam-2",
    doctorId: "doc-regina",
    branchId: "branch-kampus",
    date: "2026-09-22",
    startTime: "13:00",
    endTime: "19:00",
    status: ScheduleStatus.ACTIVE,
    notes: "Jadwal Siang Cabang Kampus",
    createdAt: "2026-09-15T08:00:00Z",
    updatedAt: "2026-09-15T08:00:00Z"
  },

  // CABANG MUKTISARI (2026-09-22)
  {
    id: "sched-muk-1",
    doctorId: "doc-lala",
    branchId: "branch-muktisari",
    date: "2026-09-22",
    startTime: "14:00",
    endTime: "17:00",
    status: ScheduleStatus.ACTIVE,
    notes: "Jadwal Siang Cabang Muktisari",
    createdAt: "2026-09-15T08:00:00Z",
    updatedAt: "2026-09-15T08:00:00Z"
  }
];

export const MOCK_STAFF_SHIFT_ASSIGNMENTS: StaffShiftAssignment[] = [
  // Gebang
  {
    id: "ssa-1",
    staffId: "staff-adm-gebang",
    branchId: "branch-gebang",
    shiftId: "shift-geb-1",
    date: "2026-09-21",
    active: true,
    notes: "Piket Pagi Admin Gebang",
    createdAt: "2026-09-15T08:00:00Z",
    updatedAt: "2026-09-15T08:00:00Z"
  },
  {
    id: "ssa-2",
    staffId: "staff-adm-gebang",
    branchId: "branch-gebang",
    shiftId: "shift-geb-2",
    date: "2026-09-22",
    active: true,
    notes: "Piket Siang Admin Gebang",
    createdAt: "2026-09-15T08:00:00Z",
    updatedAt: "2026-09-15T08:00:00Z"
  },
  {
    id: "ssa-3",
    staffId: "staff-ast-clary",
    branchId: "branch-gebang",
    shiftId: "shift-geb-1",
    date: "2026-09-21",
    active: true,
    notes: "Perawat Shift Pagi",
    createdAt: "2026-09-15T08:00:00Z",
    updatedAt: "2026-09-15T08:00:00Z"
  },
  {
    id: "ssa-4",
    staffId: "staff-ob-gebang",
    branchId: "branch-gebang",
    shiftId: "shift-geb-1",
    date: "2026-09-21",
    active: true,
    notes: "OB Kebersihan Pagi Gebang",
    createdAt: "2026-09-15T08:00:00Z",
    updatedAt: "2026-09-15T08:00:00Z"
  },

  // Ambulu
  {
    id: "ssa-5",
    staffId: "staff-ob-ambulu",
    branchId: "branch-ambulu",
    shiftId: "shift-amb-1",
    date: "2026-09-21",
    active: true,
    notes: "OB Kebersihan Ambulu",
    createdAt: "2026-09-15T08:00:00Z",
    updatedAt: "2026-09-15T08:00:00Z"
  },

  // Lengkong Mumbul
  {
    id: "ssa-6",
    staffId: "staff-ob-lengkong",
    branchId: "branch-lengkong-mumbul",
    shiftId: "shift-len-2",
    date: "2026-09-21",
    active: true,
    notes: "OB Shift 2 Lengkong (tutup jam 19:00)",
    createdAt: "2026-09-15T08:00:00Z",
    updatedAt: "2026-09-15T08:00:00Z"
  }
];

export const MOCK_ATTENDANCES: Attendance[] = [
  // 1. drg. Syafira (Dokter Gebang - Tepat Waktu)
  {
    id: "att-geb-1",
    staffId: "staff-doc-syafira",
    branchId: "branch-gebang",
    date: "2026-09-21",
    attendanceStatus: AttendanceStatus.PRESENT,
    scheduledStartAt: "08:00",
    scheduledEndAt: "13:00",
    actualCheckInAt: "2026-09-21T07:55:00Z",
    actualCheckOutAt: "2026-09-21T13:05:00Z",
    lateMinutes: 0,
    earlyCheckoutMinutes: 0,
    checkInPhotoPath: "attendance/2026/09/21/staff-doc-syafira/checkin.jpg",
    checkOutPhotoPath: "attendance/2026/09/21/staff-doc-syafira/checkout.jpg",
    checkInMethod: AttendanceMethod.WEB,
    checkOutMethod: AttendanceMethod.WEB,
    notes: "Praktek Pagi Gebang",
    createdAt: "2026-09-21T07:55:00Z",
    updatedAt: "2026-09-21T13:05:00Z",
    createdBy: "staff-doc-syafira",
    updatedBy: "staff-doc-syafira"
  },
  // 2. drg. Lala (Dokter Gebang - Terlambat 14 menit)
  {
    id: "att-geb-2",
    staffId: "staff-doc-lala",
    branchId: "branch-gebang",
    date: "2026-09-21",
    attendanceStatus: AttendanceStatus.LATE,
    scheduledStartAt: "13:00",
    scheduledEndAt: "17:00",
    actualCheckInAt: "2026-09-21T13:14:00Z",
    actualCheckOutAt: "2026-09-21T17:00:00Z",
    lateMinutes: 14,
    earlyCheckoutMinutes: 0,
    checkInPhotoPath: "attendance/2026/09/21/staff-doc-lala/checkin.jpg",
    checkOutPhotoPath: null,
    checkInMethod: AttendanceMethod.WEB,
    checkOutMethod: AttendanceMethod.WEB,
    notes: "Praktek Siang Gebang",
    createdAt: "2026-09-21T13:14:00Z",
    updatedAt: "2026-09-21T17:00:00Z",
    createdBy: "staff-doc-lala",
    updatedBy: "staff-doc-lala"
  },
  // 3. Siska Wardani (Admin Gebang - Tepat Waktu)
  {
    id: "att-geb-3",
    staffId: "staff-adm-gebang",
    branchId: "branch-gebang",
    date: "2026-09-21",
    attendanceStatus: AttendanceStatus.PRESENT,
    scheduledStartAt: "08:00",
    scheduledEndAt: "14:00",
    actualCheckInAt: "2026-09-21T07:50:00Z",
    actualCheckOutAt: "2026-09-21T14:15:00Z",
    lateMinutes: 0,
    earlyCheckoutMinutes: 0,
    checkInPhotoPath: null,
    checkOutPhotoPath: null,
    checkInMethod: AttendanceMethod.WEB,
    checkOutMethod: AttendanceMethod.WEB,
    notes: "Admin Pagi Gebang",
    createdAt: "2026-09-21T07:50:00Z",
    updatedAt: "2026-09-21T14:15:00Z",
    createdBy: "admin-gebang-1",
    updatedBy: "admin-gebang-1"
  },
  // 4. Clary (Assistant Gebang - Terlambat 5 menit, Early Checkout 15 menit)
  {
    id: "att-geb-4",
    staffId: "staff-ast-clary",
    branchId: "branch-gebang",
    date: "2026-09-21",
    attendanceStatus: AttendanceStatus.LATE,
    scheduledStartAt: "08:00",
    scheduledEndAt: "14:00",
    actualCheckInAt: "2026-09-21T08:05:00Z",
    actualCheckOutAt: "2026-09-21T13:45:00Z",
    lateMinutes: 5,
    earlyCheckoutMinutes: 15,
    checkInPhotoPath: null,
    checkOutPhotoPath: null,
    checkInMethod: AttendanceMethod.WEB,
    checkOutMethod: AttendanceMethod.WEB,
    notes: "Izin pulang cepat 15 menit",
    createdAt: "2026-09-21T08:05:00Z",
    updatedAt: "2026-09-21T13:45:00Z",
    createdBy: "admin-gebang-1",
    updatedBy: "admin-gebang-1"
  },
  // 5. Pak Joko (OB Gebang - Tanpa User Account, Aktif bekerja)
  {
    id: "att-geb-5",
    staffId: "staff-ob-gebang",
    branchId: "branch-gebang",
    date: "2026-09-21",
    attendanceStatus: AttendanceStatus.PRESENT,
    scheduledStartAt: "08:00",
    scheduledEndAt: "14:00",
    actualCheckInAt: "2026-09-21T07:30:00Z",
    actualCheckOutAt: null,
    lateMinutes: 0,
    earlyCheckoutMinutes: 0,
    checkInPhotoPath: null,
    checkOutPhotoPath: null,
    checkInMethod: AttendanceMethod.WEB,
    checkOutMethod: null,
    notes: "OB Kebersihan Pagi Gebang",
    createdAt: "2026-09-21T07:30:00Z",
    updatedAt: "2026-09-21T07:30:00Z",
    createdBy: "admin-gebang-1",
    updatedBy: "admin-gebang-1"
  },
  // 6. drg. Iza (Dokter Kencong - Tepat Waktu)
  {
    id: "att-ken-1",
    staffId: "staff-doc-iza",
    branchId: "branch-kencong",
    date: "2026-09-21",
    attendanceStatus: AttendanceStatus.PRESENT,
    scheduledStartAt: "13:00",
    scheduledEndAt: "17:00",
    actualCheckInAt: "2026-09-21T12:58:00Z",
    actualCheckOutAt: "2026-09-21T17:02:00Z",
    lateMinutes: 0,
    earlyCheckoutMinutes: 0,
    checkInPhotoPath: null,
    checkOutPhotoPath: null,
    checkInMethod: AttendanceMethod.WEB,
    checkOutMethod: AttendanceMethod.WEB,
    notes: "Praktek Siang Kencong",
    createdAt: "2026-09-21T12:58:00Z",
    updatedAt: "2026-09-21T17:02:00Z",
    createdBy: "admin-kencong-1",
    updatedBy: "admin-kencong-1"
  },
  // 7. Pak Slamet (OB Ambulu - Sakit / SICK)
  {
    id: "att-amb-1",
    staffId: "staff-ob-ambulu",
    branchId: "branch-ambulu",
    date: "2026-09-21",
    attendanceStatus: AttendanceStatus.SICK,
    scheduledStartAt: "08:00",
    scheduledEndAt: "14:00",
    actualCheckInAt: null,
    actualCheckOutAt: null,
    lateMinutes: 0,
    earlyCheckoutMinutes: 0,
    checkInPhotoPath: null,
    checkOutPhotoPath: null,
    checkInMethod: AttendanceMethod.MANUAL,
    checkOutMethod: null,
    notes: "Sakit demam, surat keterangan dokter terlampir",
    createdAt: "2026-09-21T08:00:00Z",
    updatedAt: "2026-09-21T08:00:00Z",
    createdBy: "admin-ambulu-1",
    updatedBy: "admin-ambulu-1"
  }
];

export const MOCK_USER_ACCOUNTS: UserAccount[] = [
  {
    id: "user-super",
    username: "lala_super",
    email: "superadmin@laladentist.id",
    password: "laladentist123",
    name: "Drg. Lala (Super Admin)",
    role: UserRole.SUPER_ADMIN,
    active: true,
    createdAt: "2023-01-01T08:00:00Z",
    updatedAt: "2023-01-01T08:00:00Z"
  },
  // 15 Users strictly as specified in company credentials
  {
    id: "user-dinda-ambulu",
    username: "DINDA",
    email: "dinda@laladentist.com",
    password: "laladentist123",
    name: "DINDA",
    role: UserRole.BRANCH_ADMIN,
    branchId: "branch-ambulu",
    staffId: "staff-dinda-ambulu",
    active: true,
    createdAt: "2024-01-15T08:00:00Z",
    updatedAt: "2024-01-15T08:00:00Z"
  },
  {
    id: "user-anisa-ambulu",
    username: "ANISA",
    email: "anisa@laladentist.com",
    password: "laladentist123",
    name: "ANISA",
    role: UserRole.DOCTOR_ASSISTANT,
    branchId: "branch-ambulu",
    staffId: "staff-anisa-ambulu",
    active: true,
    createdAt: "2024-02-01T08:00:00Z",
    updatedAt: "2024-02-01T08:00:00Z"
  },
  {
    id: "user-marsa-ambulu",
    username: "MARSA",
    email: "marsa@laladentist.com",
    password: "laladentist123",
    name: "MARSA",
    role: UserRole.DOCTOR_ASSISTANT,
    branchId: "branch-ambulu",
    staffId: "staff-marsa-ambulu",
    active: true,
    createdAt: "2024-02-15T08:00:00Z",
    updatedAt: "2024-02-15T08:00:00Z"
  },
  {
    id: "user-anggel-gebang",
    username: "ANGGEL",
    email: "anggel@laladentist.com",
    password: "laladentist123",
    name: "ANGGEL",
    role: UserRole.BRANCH_ADMIN,
    branchId: "branch-gebang",
    staffId: "staff-anggel-gebang",
    active: true,
    createdAt: "2024-01-10T08:00:00Z",
    updatedAt: "2024-01-10T08:00:00Z"
  },
  {
    id: "user-lilis-gebang",
    username: "LILIS",
    email: "lilis@laladentist.com",
    password: "laladentist123",
    name: "LILIS",
    role: UserRole.BRANCH_ADMIN,
    branchId: "branch-gebang",
    staffId: "staff-lilis-gebang",
    active: true,
    createdAt: "2024-01-10T08:00:00Z",
    updatedAt: "2024-01-10T08:00:00Z"
  },
  {
    id: "user-cece-gebang",
    username: "CECE",
    email: "cece@laladentist.com",
    password: "laladentist123",
    name: "CECE",
    role: UserRole.BRANCH_ADMIN,
    branchId: "branch-gebang",
    staffId: "staff-cece-gebang",
    active: true,
    createdAt: "2024-01-10T08:00:00Z",
    updatedAt: "2024-01-10T08:00:00Z"
  },
  {
    id: "user-linda-gebang",
    username: "LINDA",
    email: "linda@laladentist.com",
    password: "laladentist123",
    name: "LINDA",
    role: UserRole.DOCTOR_ASSISTANT,
    branchId: "branch-gebang",
    staffId: "staff-linda-gebang",
    active: true,
    createdAt: "2024-02-01T08:00:00Z",
    updatedAt: "2024-02-01T08:00:00Z"
  },
  {
    id: "user-novi-gebang",
    username: "NOVI",
    email: "novi@laladentist.com",
    password: "laladentist123",
    name: "NOVI",
    role: UserRole.DOCTOR_ASSISTANT,
    branchId: "branch-gebang",
    staffId: "staff-novi-gebang",
    active: true,
    createdAt: "2024-02-01T08:00:00Z",
    updatedAt: "2024-02-01T08:00:00Z"
  },
  {
    id: "user-ayik-kampus",
    username: "AYIK",
    email: "ayik@laladentist.com",
    password: "laladentist123",
    name: "AYIK",
    role: UserRole.BRANCH_ADMIN,
    branchId: "branch-kampus",
    staffId: "staff-ayik-kampus",
    active: true,
    createdAt: "2024-01-15T08:00:00Z",
    updatedAt: "2024-01-15T08:00:00Z"
  },
  {
    id: "user-usnake-kencong",
    username: "USNAKE",
    email: "usnake@laladentist.com",
    password: "laladentist123",
    name: "USNAKE",
    role: UserRole.BRANCH_ADMIN,
    branchId: "branch-kencong",
    staffId: "staff-usnake-kencong",
    active: true,
    createdAt: "2024-01-15T08:00:00Z",
    updatedAt: "2024-01-15T08:00:00Z"
  },
  {
    id: "user-cyntia-kencong",
    username: "CYNTIA",
    email: "cyntia@laladentist.com",
    password: "laladentist123",
    name: "CYNTIA",
    role: UserRole.BRANCH_ADMIN,
    branchId: "branch-kencong",
    staffId: "staff-cyntia-kencong",
    active: true,
    createdAt: "2024-01-15T08:00:00Z",
    updatedAt: "2024-01-15T08:00:00Z"
  },
  {
    id: "user-khalisa-kencong",
    username: "KHALISA",
    email: "khalisa@laladentist.com",
    password: "laladentist123",
    name: "KHALISA",
    role: UserRole.DOCTOR_ASSISTANT,
    branchId: "branch-kencong",
    staffId: "staff-khalisa-kencong",
    active: true,
    createdAt: "2024-02-01T08:00:00Z",
    updatedAt: "2024-02-01T08:00:00Z"
  },
  {
    id: "user-anita-kencong",
    username: "ANITA",
    email: "anita@laladentist.com",
    password: "laladentist123",
    name: "ANITA",
    role: UserRole.DOCTOR_ASSISTANT,
    branchId: "branch-kencong",
    staffId: "staff-anita-kencong",
    active: true,
    createdAt: "2024-02-01T08:00:00Z",
    updatedAt: "2024-02-01T08:00:00Z"
  },
  {
    id: "user-rani-lengkong",
    username: "RANI",
    email: "rani@laladentist.com",
    password: "laladentist123",
    name: "RANI",
    role: UserRole.BRANCH_ADMIN,
    branchId: "branch-lengkong-mumbul",
    staffId: "staff-rani-lengkong",
    active: true,
    createdAt: "2024-01-15T08:00:00Z",
    updatedAt: "2024-01-15T08:00:00Z"
  },
  {
    id: "user-ima-lengkong",
    username: "IMA",
    email: "ima@laladentist.com",
    password: "laladentist123",
    name: "IMA",
    role: UserRole.BRANCH_ADMIN,
    branchId: "branch-lengkong-mumbul",
    staffId: "staff-ima-lengkong",
    active: true,
    createdAt: "2024-01-15T08:00:00Z",
    updatedAt: "2024-01-15T08:00:00Z"
  },
  // Additional system / test accounts
  {
    id: "user-branch-gebang",
    username: "siska_gebang",
    email: "gebang@laladentist.com",
    password: "laladentist123",
    name: "Siska Wardani (Admin Gebang)",
    role: UserRole.BRANCH_ADMIN,
    branchId: "branch-gebang",
    staffId: "staff-siska",
    active: true,
    createdAt: "2023-01-01T08:00:00Z",
    updatedAt: "2023-01-01T08:00:00Z"
  },
  {
    id: "user-branch-kampus",
    username: "rian_kampus",
    email: "kampus@laladentist.com",
    password: "laladentist123",
    name: "Rian Hidayat (Admin Kampus)",
    role: UserRole.BRANCH_ADMIN,
    branchId: "branch-kampus",
    staffId: "staff-rian",
    active: true,
    createdAt: "2023-01-01T08:00:00Z",
    updatedAt: "2023-01-01T08:00:00Z"
  },
  {
    id: "user-branch-lengkong",
    username: "putri_lengkong",
    email: "lengkong@laladentist.com",
    password: "laladentist123",
    name: "Putri Anggraini (Admin Lengkong Mumbul)",
    role: UserRole.BRANCH_ADMIN,
    branchId: "branch-lengkong",
    staffId: "staff-putri",
    active: true,
    createdAt: "2023-01-01T08:00:00Z",
    updatedAt: "2023-01-01T08:00:00Z"
  },
  {
    id: "user-drg-syafira",
    username: "syafira_doc",
    email: "syafira@laladentist.com",
    password: "laladentist123",
    name: "drg. Syafira (Dokter Spesialis Konservasi)",
    role: UserRole.DOCTOR,
    doctorId: "doc-syafira",
    staffId: "staff-syafira",
    active: true,
    createdAt: "2023-01-01T08:00:00Z",
    updatedAt: "2023-01-01T08:00:00Z"
  },
  {
    id: "assistant-clary",
    username: "clary_assistant",
    email: "clary@laladentist.com",
    password: "laladentist123",
    name: "Clary (Perawat Gigi / Asisten Gebang)",
    role: UserRole.DOCTOR_ASSISTANT,
    staffId: "staff-clary",
    active: true,
    createdAt: "2023-01-01T08:00:00Z",
    updatedAt: "2023-01-01T08:00:00Z"
  },
  {
    id: "patient-1",
    username: "amanda_patient",
    email: "amanda@laladentist.com",
    password: "laladentist123",
    name: "Amanda Lestari (Pasien)",
    role: UserRole.PATIENT,
    active: true,
    createdAt: "2023-01-01T08:00:00Z",
    updatedAt: "2023-01-01T08:00:00Z"
  }
];

export const MOCK_PROMOTIONS: PromotionMedia[] = [
  {
    id: "promo-1",
    title: "Promo Scaling Gigi September Ceria",
    description: "Dapatkan pembersihan karang gigi lengkap & konsultasi dokter gigi dengan diskon spesial.",
    imageUrl: "https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?auto=format&fit=crop&q=80&w=600",
    branchId: null, // GLOBAL
    isActive: true,
    displayOrder: 1,
    createdAt: "2026-09-01T08:00:00Z",
    updatedAt: "2026-09-01T08:00:00Z"
  },
  {
    id: "promo-2",
    title: "Promo Pemasangan Behel Cabang Gebang",
    description: "Paket behel orthodontic estetik dengan cicilan ringan khusus cabang Gebang.",
    imageUrl: "https://images.unsplash.com/photo-1606811841689-23dfddce3e95?auto=format&fit=crop&q=80&w=600",
    branchId: "branch-gebang", // Branch-specific
    isActive: true,
    displayOrder: 2,
    createdAt: "2026-09-05T08:00:00Z",
    updatedAt: "2026-09-05T08:00:00Z"
  },
  {
    id: "promo-3",
    title: "Veneer Gigi Putih Berkilau",
    description: "Senyum percaya diri dengan teknologi direct veneer modern.",
    imageUrl: "https://images.unsplash.com/photo-1598256989800-fe5f95da9787?auto=format&fit=crop&q=80&w=600",
    branchId: null, // GLOBAL
    isActive: false,
    displayOrder: 3,
    createdAt: "2026-09-10T08:00:00Z",
    updatedAt: "2026-09-10T08:00:00Z"
  }
];

const isRunningTestEnv = typeof process !== "undefined" && (process.env.NODE_ENV === "test" || Boolean(process.env.VITEST));

// Helper database object to easily export everything and allow CRUD in simulation
export class MockDatabase {
  userAccounts: UserAccount[] = JSON.parse(JSON.stringify(MOCK_USER_ACCOUNTS));
  branches = JSON.parse(JSON.stringify(MOCK_BRANCHES));
  patients: PatientProfile[] = isRunningTestEnv ? JSON.parse(JSON.stringify(MOCK_PATIENTS)) : [];
  doctors = JSON.parse(JSON.stringify(MOCK_DOCTORS));
  services = JSON.parse(JSON.stringify(MOCK_SERVICES));
  tariffs = JSON.parse(JSON.stringify(MOCK_BRANCH_TARIFFS));
  bookings: Booking[] = isRunningTestEnv ? JSON.parse(JSON.stringify(MOCK_BOOKINGS)) : [];
  confirmations: BookingConfirmationH1[] = isRunningTestEnv ? JSON.parse(JSON.stringify(MOCK_CONFIRMATIONS)) : [];
  visits: PatientVisit[] = isRunningTestEnv ? JSON.parse(JSON.stringify(MOCK_VISITS)) : [];
  queueItems: QueueItem[] = isRunningTestEnv ? JSON.parse(JSON.stringify(MOCK_QUEUE_ITEMS)) : [];
  treatmentJobs: TreatmentJob[] = isRunningTestEnv ? JSON.parse(JSON.stringify(MOCK_TREATMENT_JOBS)) : [];
  treatmentActivities: TreatmentActivity[] = isRunningTestEnv ? JSON.parse(JSON.stringify(MOCK_TREATMENT_ACTIVITIES)) : [];
  invoices: Invoice[] = isRunningTestEnv ? JSON.parse(JSON.stringify(MOCK_INVOICES)) : [];
  invoiceItems: InvoiceItem[] = isRunningTestEnv ? JSON.parse(JSON.stringify(MOCK_INVOICE_ITEMS)) : [];
  payments: PaymentTransaction[] = isRunningTestEnv ? JSON.parse(JSON.stringify(MOCK_PAYMENTS)) : [];
  rules = JSON.parse(JSON.stringify(MOCK_RULES));
  accruals: CompensationAccrual[] = isRunningTestEnv ? JSON.parse(JSON.stringify(MOCK_ACCRUALS)) : [];
  payrolls = isRunningTestEnv ? JSON.parse(JSON.stringify(MOCK_PAYROLLS)) : [];
  payrollItems = isRunningTestEnv ? JSON.parse(JSON.stringify(MOCK_PAYROLL_ITEMS)) : [];
  accounts = JSON.parse(JSON.stringify(MOCK_CHART_OF_ACCOUNTS));
  journals = isRunningTestEnv ? JSON.parse(JSON.stringify(MOCK_JOURNAL_ENTRIES)) : [];
  staff = JSON.parse(JSON.stringify(MOCK_STAFF));
  doctorBranchAssignments = JSON.parse(JSON.stringify(MOCK_DOCTOR_BRANCH_ASSIGNMENTS));
  doctorSchedules = JSON.parse(JSON.stringify(MOCK_DOCTOR_SCHEDULES));
  workShifts = JSON.parse(JSON.stringify(MOCK_WORK_SHIFTS));
  staffShiftAssignments = JSON.parse(JSON.stringify(MOCK_STAFF_SHIFT_ASSIGNMENTS));
  attendances: Attendance[] = isRunningTestEnv ? JSON.parse(JSON.stringify(MOCK_ATTENDANCES)) : [];
  overtimes: OvertimeRecord[] = [];
  medicalRecords: MedicalRecord[] = [];
  clinicBranding: ClinicBranding = JSON.parse(JSON.stringify(DEFAULT_CLINIC_BRANDING));
  promotions: PromotionMedia[] = JSON.parse(JSON.stringify(MOCK_PROMOTIONS));

  // Singleton instance
  private static instance: MockDatabase;
  static getInstance(): MockDatabase {
    if (!this.instance) {
      this.instance = new MockDatabase();
      this.instance.loadFromStorage();
    }
    return this.instance;
  }

  loadFromStorage(): void {
    if (isRunningTestEnv || typeof window === "undefined" || !window.localStorage) {
      return;
    }
    try {
      const dataStr = window.localStorage.getItem("lala_dentist_db_v1");
      if (dataStr) {
        const stored = JSON.parse(dataStr);
        if (Array.isArray(stored.rules)) this.rules = stored.rules;
        if (Array.isArray(stored.staff)) {
          const existingIds = new Set(stored.staff.map((s: any) => s.id));
          const missingStaff = MOCK_STAFF.filter((s) => !existingIds.has(s.id));
          this.staff = [...stored.staff, ...missingStaff];
        }
        if (Array.isArray(stored.doctors) && stored.doctors.length > 0) {
          const storedDoctorMap = new Map(stored.doctors.map((d: any) => [d.id, d]));
          const missingBase = MOCK_DOCTORS.filter((baseDoc) => !storedDoctorMap.has(baseDoc.id));
          this.doctors = [...stored.doctors, ...missingBase];
        } else {
          this.doctors = JSON.parse(JSON.stringify(MOCK_DOCTORS));
        }
        if (Array.isArray(stored.userAccounts)) {
          const storedMap = new Map(stored.userAccounts.map((a: any) => [a.id, a]));
          // Merge mock accounts and keep password and username synchronized
          const mergedAccounts = MOCK_USER_ACCOUNTS.map((mockAcc) => {
            const storedAcc = storedMap.get(mockAcc.id) as any;
            if (storedAcc) {
              return { ...storedAcc, ...mockAcc, password: mockAcc.password || storedAcc.password };
            }
            return mockAcc;
          });
          const mockIds = new Set(MOCK_USER_ACCOUNTS.map((a) => a.id));
          const extraAccounts = stored.userAccounts.filter((a: any) => !mockIds.has(a.id));
          this.userAccounts = [...mergedAccounts, ...extraAccounts];
        }
        if (Array.isArray(stored.patients)) this.patients = stored.patients;
        if (Array.isArray(stored.branches)) {
          if (stored.branches.some((b: any) => b.id === "branch-muktisari") || stored.branches.length !== MOCK_BRANCHES.length) {
            this.branches = JSON.parse(JSON.stringify(MOCK_BRANCHES));
          } else {
            this.branches = stored.branches;
          }
        } else {
          this.branches = JSON.parse(JSON.stringify(MOCK_BRANCHES));
        }
        if (Array.isArray(stored.services) && stored.services.length > 0) {
          this.services = stored.services;
        } else {
          this.services = JSON.parse(JSON.stringify(MOCK_SERVICES));
        }
        if (Array.isArray(stored.tariffs)) this.tariffs = stored.tariffs;
        if (Array.isArray(stored.bookings)) this.bookings = stored.bookings;
        if (Array.isArray(stored.confirmations)) this.confirmations = stored.confirmations;
        if (Array.isArray(stored.visits)) this.visits = stored.visits;
        if (Array.isArray(stored.queueItems)) this.queueItems = stored.queueItems;
        if (Array.isArray(stored.treatmentJobs)) this.treatmentJobs = stored.treatmentJobs;
        if (Array.isArray(stored.treatmentActivities)) this.treatmentActivities = stored.treatmentActivities;
        if (Array.isArray(stored.invoices)) this.invoices = stored.invoices;
        if (Array.isArray(stored.invoiceItems)) this.invoiceItems = stored.invoiceItems;
        if (Array.isArray(stored.payments)) this.payments = stored.payments;
        if (Array.isArray(stored.accruals)) this.accruals = stored.accruals;
        if (Array.isArray(stored.payrolls)) this.payrolls = stored.payrolls;
        if (Array.isArray(stored.payrollItems)) this.payrollItems = stored.payrollItems;
        if (Array.isArray(stored.accounts)) this.accounts = stored.accounts;
        if (Array.isArray(stored.journals)) this.journals = stored.journals;
        if (Array.isArray(stored.doctorBranchAssignments) && stored.doctorBranchAssignments.length > 0) {
          this.doctorBranchAssignments = stored.doctorBranchAssignments;
        } else {
          this.doctorBranchAssignments = JSON.parse(JSON.stringify(MOCK_DOCTOR_BRANCH_ASSIGNMENTS));
        }
        if (Array.isArray(stored.doctorSchedules)) this.doctorSchedules = stored.doctorSchedules;
        if (Array.isArray(stored.workShifts)) this.workShifts = stored.workShifts;
        if (Array.isArray(stored.staffShiftAssignments)) this.staffShiftAssignments = stored.staffShiftAssignments;
        if (Array.isArray(stored.attendances)) this.attendances = stored.attendances;
        if (Array.isArray(stored.overtimes)) this.overtimes = stored.overtimes;
        if (Array.isArray(stored.medicalRecords)) this.medicalRecords = stored.medicalRecords;
        if (Array.isArray(stored.promotions)) this.promotions = stored.promotions;
        if (stored.clinicBranding) this.clinicBranding = stored.clinicBranding;
      }
    } catch (e) {
      console.warn("Could not load from localStorage:", e);
    }
  }

  saveToStorage(): void {
    if (isRunningTestEnv || typeof window === "undefined" || !window.localStorage) {
      return;
    }
    try {
      const dataToSave = {
        rules: this.rules,
        staff: this.staff,
        doctors: this.doctors,
        userAccounts: this.userAccounts,
        patients: this.patients,
        branches: this.branches,
        services: this.services,
        tariffs: this.tariffs,
        bookings: this.bookings,
        confirmations: this.confirmations,
        visits: this.visits,
        queueItems: this.queueItems,
        treatmentJobs: this.treatmentJobs,
        treatmentActivities: this.treatmentActivities,
        invoices: this.invoices,
        invoiceItems: this.invoiceItems,
        payments: this.payments,
        accruals: this.accruals,
        payrolls: this.payrolls,
        payrollItems: this.payrollItems,
        accounts: this.accounts,
        journals: this.journals,
        doctorBranchAssignments: this.doctorBranchAssignments,
        doctorSchedules: this.doctorSchedules,
        workShifts: this.workShifts,
        staffShiftAssignments: this.staffShiftAssignments,
        attendances: this.attendances,
        overtimes: this.overtimes,
        medicalRecords: this.medicalRecords,
        promotions: this.promotions,
        clinicBranding: this.clinicBranding,
      };
      window.localStorage.setItem("lala_dentist_db_v1", JSON.stringify(dataToSave));
    } catch (e) {
      console.warn("Could not save to localStorage:", e);
    }
  }

  static resetInstance(): MockDatabase {
    if (!this.instance) {
      this.instance = new MockDatabase();
    }
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        window.localStorage.removeItem("lala_dentist_db_v1");
      } catch {
        // ignore
      }
    }
    this.instance.userAccounts = JSON.parse(JSON.stringify(MOCK_USER_ACCOUNTS));
    this.instance.branches = JSON.parse(JSON.stringify(MOCK_BRANCHES));
    this.instance.patients = JSON.parse(JSON.stringify(MOCK_PATIENTS));
    this.instance.doctors = JSON.parse(JSON.stringify(MOCK_DOCTORS));
    this.instance.services = JSON.parse(JSON.stringify(MOCK_SERVICES));
    this.instance.tariffs = JSON.parse(JSON.stringify(MOCK_BRANCH_TARIFFS));
    this.instance.bookings = JSON.parse(JSON.stringify(MOCK_BOOKINGS));
    this.instance.confirmations = JSON.parse(JSON.stringify(MOCK_CONFIRMATIONS));
    this.instance.visits = JSON.parse(JSON.stringify(MOCK_VISITS));
    this.instance.queueItems = JSON.parse(JSON.stringify(MOCK_QUEUE_ITEMS));
    this.instance.treatmentJobs = JSON.parse(JSON.stringify(MOCK_TREATMENT_JOBS));
    this.instance.treatmentActivities = JSON.parse(JSON.stringify(MOCK_TREATMENT_ACTIVITIES));
    this.instance.invoices = JSON.parse(JSON.stringify(MOCK_INVOICES));
    this.instance.invoiceItems = JSON.parse(JSON.stringify(MOCK_INVOICE_ITEMS));
    this.instance.payments = JSON.parse(JSON.stringify(MOCK_PAYMENTS));
    this.instance.rules = JSON.parse(JSON.stringify(MOCK_RULES));
    this.instance.accruals = JSON.parse(JSON.stringify(MOCK_ACCRUALS));
    this.instance.payrolls = JSON.parse(JSON.stringify(MOCK_PAYROLLS));
    this.instance.payrollItems = JSON.parse(JSON.stringify(MOCK_PAYROLL_ITEMS));
    this.instance.accounts = JSON.parse(JSON.stringify(MOCK_CHART_OF_ACCOUNTS));
    this.instance.journals = JSON.parse(JSON.stringify(MOCK_JOURNAL_ENTRIES));
    this.instance.staff = JSON.parse(JSON.stringify(MOCK_STAFF));
    this.instance.doctorBranchAssignments = JSON.parse(JSON.stringify(MOCK_DOCTOR_BRANCH_ASSIGNMENTS));
    this.instance.doctorSchedules = JSON.parse(JSON.stringify(MOCK_DOCTOR_SCHEDULES));
    this.instance.workShifts = JSON.parse(JSON.stringify(MOCK_WORK_SHIFTS));
    this.instance.staffShiftAssignments = JSON.parse(JSON.stringify(MOCK_STAFF_SHIFT_ASSIGNMENTS));
    this.instance.attendances = JSON.parse(JSON.stringify(MOCK_ATTENDANCES));
    this.instance.overtimes = [];
    this.instance.medicalRecords = [];
    this.instance.clinicBranding = JSON.parse(JSON.stringify(DEFAULT_CLINIC_BRANDING));
    this.instance.promotions = JSON.parse(JSON.stringify(MOCK_PROMOTIONS));
    return this.instance;
  }

  static clearOperationalSimulationData(): MockDatabase {
    const db = MockDatabase.getInstance();
    db.patients = [];
    db.bookings = [];
    db.confirmations = [];
    db.visits = [];
    db.queueItems = [];
    db.treatmentJobs = [];
    db.treatmentActivities = [];
    db.invoices = [];
    db.invoiceItems = [];
    db.payments = [];
    db.accruals = [];
    db.medicalRecords = [];
    db.overtimes = [];
    return db;
  }
}
