import React from "react";
import { useRouter } from "../Router";
import { useApp } from "../../context/AppContext";
import { UserRole } from "../../types/domain";
import {
  Users,
  CalendarRange,
  Clock,
  ListOrdered,
  Activity,
  Receipt,
  CreditCard,
  ArrowDownRight
} from "lucide-react";

export type HubType = "patient_schedule" | "queue_treatment" | "cashier";

interface OperationalHubTabsProps {
  hub: HubType;
}

export const OperationalHubTabs: React.FC<OperationalHubTabsProps> = ({ hub }) => {
  const { path, navigate } = useRouter();
  const { currentUser } = useApp();

  if (!currentUser) return null;

  // Determine prefix based on role
  const isSuper = currentUser.role === UserRole.SUPER_ADMIN;
  const isBranchAdmin = currentUser.role === UserRole.BRANCH_ADMIN;

  // Only show this hub bar for Super Admin and Branch Admin where multi-module workflow occurs
  if (!isSuper && !isBranchAdmin) {
    return null;
  }

  const prefix = isSuper ? "/super-admin" : "/branch-admin";

  let title = "";
  let tabs: Array<{
    name: string;
    path: string;
    icon: React.ComponentType<{ className?: string }>;
    description?: string;
  }> = [];

  if (hub === "patient_schedule") {
    title = "Area Kerja: Pasien & Jadwal";
    tabs = [
      {
        name: "Data Pasien",
        path: `${prefix}/patients`,
        icon: Users,
        description: "Profil, rekam RM & riwayat kunjungan"
      },
      {
        name: "Booking Pasien",
        path: `${prefix}/bookings`,
        icon: CalendarRange,
        description: "Reservasi janji temu mendatang"
      },
      {
        name: "Konfirmasi H-1",
        path: `${prefix}/h1-confirmation`,
        icon: Clock,
        description: "Tindak lanjut konfirmasi kehadiran"
      },
      {
        name: "Jadwal Praktik Dokter",
        path: `${prefix}/schedules`,
        icon: CalendarRange,
        description: "Matriks shift jaga dokter klinik"
      }
    ];
  } else if (hub === "queue_treatment") {
    title = "Area Kerja: Antrean & Pelayanan Treatment";
    tabs = [
      {
        name: "Antrean Klinik",
        path: `${prefix}/queue`,
        icon: ListOrdered,
        description: "Pemanggilan & alur ruang tunggu"
      },
      {
        name: "Daftar Treatment",
        path: `${prefix}/treatments`,
        icon: Activity,
        description: "Tindakan medis & odontogram chair"
      }
    ];
  } else if (hub === "cashier") {
    title = "Area Kerja: Kasir & Billing";
    tabs = [
      {
        name: "Faktur & Tagihan (Invoice)",
        path: `${prefix}/invoices`,
        icon: Receipt,
        description: "Penerbitan & pelunasan faktur tindakan"
      },
      {
        name: "Penerimaan & Kwitansi",
        path: `${prefix}/payments`,
        icon: CreditCard,
        description: "Riwayat kas masuk & cetak kwitansi"
      },
      {
        name: "Pengeluaran Kas Cabang",
        path: `${prefix}/expenses`,
        icon: ArrowDownRight,
        description: "Pencatatan kas keluar operasional"
      }
    ];
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 p-2 shadow-xs mb-6">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-100 mb-2">
        <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#8a6f27]">
          {title}
        </span>
        <span className="text-[10px] text-slate-400 font-medium">
          Navigasi Alur Kerja Terintegrasi
        </span>
      </div>
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        {tabs.map((tab) => {
          const isActive = path === tab.path;
          const Icon = tab.icon;

          return (
            <button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer border ${
                isActive
                  ? "bg-[#17233C] text-white border-[#17233C] shadow-sm"
                  : "bg-slate-50 text-slate-600 border-slate-200/70 hover:bg-[#faf6ec] hover:text-[#8a6f27] hover:border-[#ebd4a8]"
              }`}
              title={tab.description}
            >
              <Icon
                className={`w-3.5 h-3.5 shrink-0 ${
                  isActive ? "text-[#c5a059]" : "text-slate-400"
                }`}
              />
              <span>{tab.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
