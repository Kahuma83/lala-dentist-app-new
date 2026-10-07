import React, { useState } from "react";
import { LalaLogo } from "../components/common/LalaLogo";
import { useApp, SIMULATED_USERS } from "../context/AppContext";
import { useRouter, Link } from "../components/Router";
import { UserRole } from "../types/domain";
import { AuthService } from "../services/authService";
import {
  LayoutDashboard,
  Users,
  CalendarRange,
  Clock,
  ListOrdered,
  Activity,
  Receipt,
  CreditCard,
  Percent,
  DollarSign,
  ArrowDownRight,
  Briefcase,
  Tag,
  Hourglass,
  FileText,
  MapPin,
  UserCheck,
  Settings,
  Menu,
  X,
  ChevronDown,
  Lock,
  RefreshCw,
  LogOut,
  User,
  Building2,
  BookOpen,
  Search,
  Bell,
  Sparkles,
  Trash2,
  AlertTriangle
} from "lucide-react";

interface AdminLayoutProps {
  children: React.ReactNode;
}

export const AdminLayout: React.FC<AdminLayoutProps> = ({ children }) => {
  const {
    currentUser,
    setCurrentUser,
    selectedBranchId,
    setSelectedBranchId,
    branches,
    branding,
    loading
  } = useApp();

  const { path, navigate } = useRouter();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-100 max-w-md w-full text-center">
          <Building2 className="w-12 h-12 text-[#c5a059] mx-auto mb-4" />
          <h2 className="text-xl font-bold text-[#17233C]">Sesi Berakhir</h2>
          <p className="text-slate-500 mt-2 mb-6">Silakan masuk kembali untuk mengakses Web Admin.</p>
          <button
            onClick={() => navigate("/login")}
            className="w-full bg-[#c5a059] hover:bg-[#b88a2a] text-white font-semibold py-2.5 px-4 rounded-lg transition-colors shadow-sm"
          >
            Masuk Sekarang
          </button>
        </div>
      </div>
    );
  }

  const isSuper = currentUser.role === UserRole.SUPER_ADMIN;
  const currentBranch = branches.find((b) => b.id === (selectedBranchId || currentUser.assignedBranchId));
  
  // Prioritize active branch custom logo or clinic branding logo
  const activeLogo =
    (currentBranch?.logoUrl && currentBranch.logoUrl !== "/logo-lala.png" ? currentBranch.logoUrl : null) ||
    (branding?.logoUrl && branding.logoUrl !== "/logo-lala.png" ? branding.logoUrl : null) ||
    currentBranch?.logoUrl ||
    branding?.logoUrl ||
    "/logo-lala.png";

  const displayClinicName = branding?.name || "Lala Dentist";
  const displayTagline = branding?.tagline || "Senyum Indah dimulai di Laladentist";

  // Custom defined menu categories representing the EXACT options visible in the image
  const superAdminMenu = [
    {
      title: "DASHBOARD",
      items: [{ name: "Dashboard", path: "/super-admin/dashboard", icon: LayoutDashboard }]
    },
    {
      title: "OPERASIONAL",
      items: [
        { name: "Pasien", path: "/super-admin/patients", icon: Users },
        { name: "Booking", path: "/super-admin/bookings", icon: CalendarRange },
        { name: "Konfirmasi H-1", path: "/super-admin/h1-confirmation", icon: Clock },
        { name: "Antrean", path: "/super-admin/queue", icon: ListOrdered },
        { name: "Treatment", path: "/super-admin/treatments", icon: Activity }
      ]
    },
    {
      title: "KEUANGAN",
      items: [
        { name: "Invoice", path: "/super-admin/invoices", icon: Receipt },
        { name: "Pembayaran", path: "/super-admin/payments", icon: CreditCard },
        { name: "Pengeluaran", path: "/super-admin/expenses", icon: ArrowDownRight },
        { name: "Compensation", path: "/super-admin/compensation", icon: Percent },
        { name: "Payroll", path: "/super-admin/payroll", icon: DollarSign },
        { name: "Accounting", path: "/super-admin/accounting", icon: BookOpen }
      ]
    },
    {
      title: "PENGATURAN & MASTER",
      items: [
        { name: "Cabang Klinik", path: "/super-admin/configuration?tab=branches", icon: Building2 },
        { name: "Dokter", path: "/super-admin/configuration?tab=doctors", icon: UserCheck },
        { name: "Media Promosi", path: "/super-admin/configuration?tab=promotions", icon: Sparkles },
        { name: "Layanan", path: "/super-admin/configuration?tab=services", icon: Briefcase },
        { name: "Tarif Cabang", path: "/super-admin/configuration?tab=tariffs", icon: Tag },
        { name: "Identitas Dokumen", path: "/super-admin/configuration?tab=branding", icon: FileText },
        { name: "Manajemen SDM", path: "/super-admin/hr", icon: Users }
      ]
    }
  ];

  const branchAdminMenu = [
    {
      title: "DASHBOARD",
      items: [{ name: "Dashboard", path: "/branch-admin/dashboard", icon: LayoutDashboard }]
    },
    {
      title: "OPERASIONAL",
      items: [
        { name: "Pasien", path: "/branch-admin/patients", icon: Users },
        { name: "Booking", path: "/branch-admin/bookings", icon: CalendarRange },
        { name: "Konfirmasi H-1", path: "/branch-admin/h1-confirmation", icon: Clock },
        { name: "Antrean", path: "/branch-admin/queue", icon: ListOrdered },
        { name: "Treatment", path: "/branch-admin/treatments", icon: Activity }
      ]
    },
    {
      title: "KEUANGAN",
      items: [
        { name: "Invoice", path: "/branch-admin/invoices", icon: Receipt },
        { name: "Pembayaran", path: "/branch-admin/payments", icon: CreditCard },
        { name: "Pengeluaran", path: "/branch-admin/expenses", icon: ArrowDownRight },
        { name: "Laporan Keuangan", path: "/branch-admin/accounting", icon: BookOpen }
      ]
    },
    {
      title: "MANAJEMEN SDM",
      items: [
        { name: "Manajemen SDM", path: "/branch-admin/hr", icon: UserCheck }
      ]
    },
    {
      title: "PENGATURAN",
      items: [
        { name: "Profil Cabang", path: "/branch-admin/configuration?tab=branches", icon: Building2 }
      ]
    }
  ];

  const doctorMenu = [
    {
      title: "PRAKTEK DOKTER",
      items: [
        { name: "Live Antrean Dokter", path: "/doctor/queue", icon: ListOrdered },
        { name: "Pasien", path: "/doctor/patients", icon: Users },
        { name: "Treatment", path: "/doctor/treatments", icon: Activity }
      ]
    }
  ];

  const assistantMenu = [
    {
      title: "ASISTEN DOKTER",
      items: [
        { name: "Live Antrean Klinik", path: "/assistant/queue", icon: ListOrdered },
        { name: "Pasien", path: "/assistant/patients", icon: Users },
        { name: "Treatment", path: "/assistant/treatments", icon: Activity },
        { name: "Insentif Saya", path: "/assistant/incentives", icon: Percent }
      ]
    }
  ];

  const patientMenu = [
    {
      title: "PORTAL PASIEN",
      items: [{ name: "Antrean Saya", path: "/patient/queue", icon: ListOrdered }]
    }
  ];

  let activeMenu = branchAdminMenu;
  if (currentUser.role === UserRole.SUPER_ADMIN) activeMenu = superAdminMenu;
  else if (currentUser.role === UserRole.DOCTOR) activeMenu = doctorMenu;
  else if (currentUser.role === UserRole.DOCTOR_ASSISTANT) activeMenu = assistantMenu;
  else if (currentUser.role === UserRole.PATIENT) activeMenu = patientMenu;

  const handleUserSwitch = (userId: string) => {
    const found = SIMULATED_USERS.find((u) => u.id === userId);
    if (found) {
      setCurrentUser(found);
      if (found.role === UserRole.SUPER_ADMIN) {
        navigate("/super-admin/dashboard");
      } else if (found.role === UserRole.BRANCH_ADMIN) {
        navigate("/branch-admin/dashboard");
      } else if (found.role === UserRole.DOCTOR) {
        navigate("/doctor/queue");
      } else if (found.role === UserRole.DOCTOR_ASSISTANT) {
        navigate("/assistant/queue");
      } else if (found.role === UserRole.PATIENT) {
        navigate("/patient/queue");
      }
    }
  };

  const currentBranchName = branches.find((b) => b.id === selectedBranchId)?.name || "Semua Cabang";

  return (
    <div className="min-h-screen bg-[#fafaf8] text-slate-800 font-sans flex flex-col" id="app-container">
      
      {/* 1. PREMIUM FULL-WIDTH NAVIGATION HEADER WITH GOLDEN SILK GRADIENT */}
      <header className="h-20 bg-gradient-to-r from-[#916b1c] via-[#ebd4a8] via-[#e1b951] to-[#916b1c] flex items-center justify-between px-6 sticky top-0 z-50 shadow-md relative">
        
        {/* Absolute Shimmering Silk Wave Lines & Decorators in a clipped wrapper container */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute inset-0 opacity-40">
            <svg className="w-full h-full" viewBox="0 0 1000 80" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
              <path d="M-100,60 C150,-10 350,90 550,20 C750,-50 850,100 1150,40" stroke="url(#silkWhiteGradient)" strokeWidth="2.5" fill="none" />
              <path d="M-50,70 C200,10 400,100 600,30 C800,-40 900,110 1200,50" stroke="url(#silkWhiteGradient)" strokeWidth="1" fill="none" />
              <defs>
                <linearGradient id="silkWhiteGradient" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#ffffff" stopOpacity="0.1" />
                  <stop offset="50%" stopColor="#ffffff" stopOpacity="0.6" />
                  <stop offset="100%" stopColor="#ffffff" stopOpacity="0.1" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <div className="absolute left-1/3 top-0 bottom-0 w-1/4 bg-gradient-to-r from-transparent via-white/15 to-transparent skew-x-12" />
        </div>

        {/* Brand & Branch Selector (Left Area) */}
        <div className="flex items-center gap-6 relative z-10">
          
          {/* Mobile Menu Trigger */}
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-1 text-slate-300 hover:text-white md:hidden"
            aria-label="Buka Menu"
          >
            <Menu className="w-6 h-6" />
          </button>

          {/* Logo Brand exactly as requested */}
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate(isSuper ? "/super-admin/dashboard" : "/branch-admin/dashboard")}>
            <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-sm shrink-0 p-1">
              <LalaLogo src={activeLogo} className="w-7 h-7" />
            </div>
            <div className="hidden sm:block">
              <h1 className="text-base font-extrabold text-white leading-none tracking-tight">{displayClinicName}</h1>
              <span className="text-[9px] text-[#ebd4a8] font-medium block mt-0.5 tracking-wider">{displayTagline}</span>
            </div>
          </div>

          {/* White Capsule Branch Context Selector */}
          <div className="hidden md:flex items-center gap-2 bg-white/95 backdrop-blur-sm border border-[#ebd4a8]/50 py-1.5 px-4 rounded-full shadow-sm">
            <span className="text-[10px] text-[#8a6f27] font-extrabold tracking-wider uppercase">Cabang:</span>
            {isSuper ? (
              <select
                value={selectedBranchId || ""}
                onChange={(e) => setSelectedBranchId(e.target.value || null)}
                className="bg-transparent text-xs font-bold text-[#17233C] border-none focus:outline-none focus:ring-0 pr-6 cursor-pointer"
                aria-label="Pilih Cabang"
              >
                <option value="">Semua Cabang</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-xs font-bold text-[#17233C] flex items-center gap-1.5">
                {currentBranchName}
                <Lock className="w-3 h-3 text-[#c5a059]" />
              </span>
            )}
          </div>

        </div>

        {/* Global Search and Personal Controls (Middle-Right Area) */}
        <div className="flex items-center gap-5 relative z-10">
          
          {/* Main White Capsule Search Bar */}
          <div className="relative hidden lg:block w-96">
            <span className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
              <Search className="w-4 h-4 text-slate-400" />
            </span>
            <input
              type="text"
              placeholder="Cari pasien, booking, atau nomor antrean..."
              className="w-full pl-11 pr-4 py-2 text-xs bg-white border border-slate-200 focus:border-[#ebd4a8] rounded-full focus:outline-none focus:ring-2 focus:ring-[#ebd4a8]/20 text-[#17233C] placeholder-slate-400 transition-all font-semibold shadow-sm"
              readOnly
            />
          </div>

          {/* Utility Action Buttons */}
          <div className="flex items-center gap-1">
            {/* Notification Bell */}
            <div className="relative">
              <button className="p-2 text-slate-300 hover:text-[#ebd4a8] rounded-full hover:bg-white/5 transition-colors relative" aria-label="Notifikasi">
                <Bell className="w-5 h-5" />
                <span className="absolute top-1 right-1 bg-[#E11D48] text-white text-[9px] font-extrabold w-4.5 h-4.5 rounded-full flex items-center justify-center border-2 border-[#17233C] leading-none">
                  3
                </span>
              </button>
            </div>

            {/* Grid Icon Launcher */}
            <button className="p-2 text-slate-300 hover:text-white rounded-full hover:bg-white/5 transition-colors hidden sm:flex items-center justify-center" aria-label="Menu Aplikasi">
              <div className="grid grid-cols-3 gap-0.5 w-4 h-4">
                {[...Array(9)].map((_, i) => (
                  <span key={i} className="w-1.0 h-1.0 bg-current rounded-sm" />
                ))}
              </div>
            </button>
          </div>

          {loading && (
            <span className="text-[10px] text-[#ebd4a8] bg-white/5 px-2.5 py-1 rounded-md border border-[#ebd4a8]/20 animate-pulse flex items-center gap-1.5 font-bold">
              <RefreshCw className="w-3 h-3 animate-spin text-[#ebd4a8]" /> SINKRONISASI
            </span>
          )}

          {/* Drg. Syarif Admin Profile Block */}
          <div className="relative border-l border-white/10 pl-5">
            <button
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              className="flex items-center gap-3 p-1 rounded-full hover:bg-white/5 transition-colors"
              aria-label="Menu Profil"
            >
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#ebd4a8] via-[#ebd4a8] to-[#c5a059] flex items-center justify-center text-[#17233C] font-black text-sm border border-white/30 shadow-sm overflow-hidden">
                S
              </div>
              <div className="hidden md:block text-left">
                <p className="text-xs font-bold text-white leading-none">{currentUser.name.replace(" (Super Admin)", "")}</p>
                <span className="text-[9px] text-[#ebd4a8] font-bold mt-1.5 block uppercase tracking-wider">
                  {currentUser.role.replace("_", " ")}
                </span>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-300 hidden md:block" />
            </button>

            {/* Profile Dropdown Container */}
            {showProfileMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowProfileMenu(false)} />
                <div className="absolute right-0 mt-3 w-56 bg-white border border-[#ebd4a8]/40 rounded-xl shadow-lg py-1.5 z-20">
                  <div className="px-4 py-2.5 border-b border-slate-100 text-xs">
                    <p className="text-slate-400 font-medium">Sesi Aktif</p>
                    <p className="font-bold text-[#17233C] mt-0.5">{currentUser.name}</p>
                    <p className="text-[#c5a059] font-bold mt-0.5 uppercase text-[9px] tracking-wider">{currentUser.role}</p>
                  </div>
                  <button
                    onClick={() => {
                      setShowProfileMenu(false);
                      navigate("/login");
                    }}
                    className="w-full text-left px-4 py-2 text-xs text-[#17233C] hover:bg-[#faf6ec] flex items-center gap-2 font-semibold"
                  >
                    <User className="w-3.5 h-3.5 text-[#c5a059]" /> Profil Saya
                  </button>
                  <button
                    onClick={async () => {
                      setShowProfileMenu(false);
                      localStorage.removeItem("mock_user_id");
                      await AuthService.signOut();
                      setCurrentUser(null);
                      navigate("/login");
                    }}
                    className="w-full text-left px-4 py-2 text-xs text-rose-600 hover:bg-rose-50 flex items-center gap-2 border-t border-slate-100 font-semibold"
                  >
                    <LogOut className="w-3.5 h-3.5 text-rose-500" /> Keluar Sesi
                  </button>
                </div>
              </>
            )}
          </div>

        </div>

      </header>

      {/* 2. LOWER REGION: SIDEBAR (LEFT) + WORKSPACE (RIGHT) */}
      <div className="flex-1 flex relative" id="lower-workspace">
        
        {/* SIDEBAR NAVIGATION (Starts exactly beneath the top header) */}
        <aside
          id="sidebar"
          className={`fixed md:sticky top-20 bottom-0 left-0 z-40 bg-[#FAFAF8] border-r border-[#ebd4a8]/25 flex flex-col transition-all duration-300 shrink-0
            ${isCollapsed ? "w-20" : "w-64"}
            ${isSidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
          `}
          style={{ height: "calc(100vh - 80px)" }}
        >
          {/* Sidebar Navigation Items list */}
          <div className="flex-1 overflow-y-auto py-5 px-4 space-y-6">
            {activeMenu.map((group, groupIdx) => (
              <div key={groupIdx} className="space-y-2">
                {!isCollapsed && (
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-3">
                    {group.title}
                  </h3>
                )}
                <ul className="space-y-1">
                  {group.items.map((item, itemIdx) => {
                    const isSrvTab = item.path.includes("?tab=");
                    let isActive = false;
                    if (isSrvTab) {
                      isActive = path.startsWith("/super-admin/configuration") && window.location.search.includes(item.path.split("?")[1]);
                    } else {
                      isActive = path === item.path;
                    }

                    return (
                      <li key={itemIdx}>
                        <Link
                          to={item.path}
                          className={`flex items-center gap-3.5 px-3 py-2 rounded-xl text-xs font-bold transition-all relative group
                            ${isActive
                              ? "bg-[#faf6ec] text-[#8a6f27] border-l-4 border-[#c5a059]"
                              : "text-[#5f6673] hover:bg-[#faf6ec]/50 hover:text-[#17233C]"
                            }
                          `}
                          title={item.name}
                          onClick={() => setIsSidebarOpen(false)}
                        >
                          <item.icon className={`w-4 h-4 shrink-0 ${isActive ? "text-[#c5a059]" : "text-slate-400 group-hover:text-[#c5a059] transition-colors"}`} />
                          {!isCollapsed && <span className="truncate">{item.name}</span>}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>

          {/* Logout Action at the Bottom of Sidebar */}
          <div className="p-4 border-t border-slate-100">
            <button
              onClick={async () => {
                localStorage.removeItem("mock_user_id");
                await AuthService.signOut();
                setCurrentUser(null);
                navigate("/login");
              }}
              className="w-full flex items-center gap-3.5 px-3 py-2 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 transition-colors"
              title="Keluar"
            >
              <LogOut className="w-4 h-4 shrink-0" />
              {!isCollapsed && <span>Keluar</span>}
            </button>
          </div>
        </aside>

        {/* Sidebar Backdrop (Mobile Only) */}
        {isSidebarOpen && (
          <div
            className="fixed inset-0 bg-slate-900/40 z-30 md:hidden top-20"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        {/* 3. MAIN SCROLLABLE CONTENT BODY */}
        <main className="flex-1 min-w-0 p-6 md:p-8 overflow-y-auto">
          {children}
        </main>

      </div>

      {/* 4. SIMULATION FLOATING TOOLBAR */}
      <div className="fixed bottom-4 right-4 z-50 bg-[#17233C] text-white py-2 px-3.5 rounded-full shadow-2xl text-[10px] flex items-center gap-3 border border-[#ebd4a8]/30 backdrop-blur-md">
        <span className="font-bold text-[#ebd4a8] flex items-center gap-1">
          <RefreshCw className="w-3 h-3 animate-spin" /> ROLE:
        </span>
        <select
          value={currentUser.id}
          onChange={(e) => handleUserSwitch(e.target.value)}
          className="bg-[#21304C] text-white rounded-full border border-white/10 px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-[#ebd4a8]/50 cursor-pointer font-medium"
          aria-label="Switch User Role simulation"
        >
          {SIMULATED_USERS.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name} ({u.role})
            </option>
          ))}
        </select>
      </div>

    </div>
  );
};
