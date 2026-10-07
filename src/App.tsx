import React from "react";
import { AppProvider, useApp } from "./context/AppContext";
import { RouterProvider, useRouter } from "./components/Router";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { PatientManagement } from "./pages/PatientManagement";
import { BookingManagement } from "./pages/BookingManagement";
import { H1ConfirmationPage } from "./pages/H1ConfirmationPage";
import { LiveQueueManagement } from "./pages/LiveQueueManagement";
import { TreatmentManagement } from "./pages/TreatmentManagement";
import { Invoices } from "./pages/Invoices";
import { Payments } from "./pages/Payments";
import { Compensation } from "./pages/Compensation";
import { Payroll } from "./pages/Payroll";
import { Expenses } from "./pages/Expenses";
import { Configuration } from "./pages/Configuration";
import { Accounting } from "./pages/Accounting";
import { HRManagement } from "./pages/HRManagement";
import { PlaceholderPage } from "./pages/PlaceholderPage";
import { AdminLayout } from "./layouts/AdminLayout";
import { UserRole } from "./types/domain";
import { Lock, ArrowLeft, RefreshCw } from "lucide-react";

const UnauthorizedPage: React.FC = () => {
  const { navigate } = useRouter();
  const { currentUser } = useApp();

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-center" id="unauthorized-screen">
      <div className="bg-white p-8 rounded-xl border border-slate-100 shadow-sm max-w-md w-full">
        <div className="w-12 h-12 bg-rose-50 rounded-full flex items-center justify-center text-rose-500 mx-auto mb-4">
          <Lock className="w-6 h-6 animate-bounce" />
        </div>
        <h2 className="text-lg font-bold text-slate-800">Akses Terbatas</h2>
        <p className="text-slate-500 text-xs mt-2 mb-6 leading-relaxed">
          Sistem mendeteksi bahwa peran Anda saat ini ({currentUser?.role}) tidak diizinkan membuka modul atau konfigurasi ini. Hak akses dibatasi (Role Guard).
        </p>
        <button
          onClick={() => {
            if (currentUser?.role === UserRole.SUPER_ADMIN) {
              navigate("/super-admin/dashboard");
            } else if (currentUser?.role === UserRole.BRANCH_ADMIN) {
              navigate("/branch-admin/dashboard");
            } else if (currentUser?.role === UserRole.DOCTOR) {
              navigate("/doctor/queue");
            } else if (currentUser?.role === UserRole.DOCTOR_ASSISTANT) {
              navigate("/assistant/queue");
            } else if (currentUser?.role === UserRole.PATIENT) {
              navigate("/patient/queue");
            } else {
              navigate("/login");
            }
          }}
          className="w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold py-2.5 px-4 rounded-lg text-xs transition-colors"
        >
          Kembali ke Dashboard Resmi
        </button>
      </div>
    </div>
  );
};

const AppContent: React.FC = () => {
  const { path } = useRouter();
  const { currentUser, loading } = useApp();

  // If loading and we don't have enough data yet, show a clean loading spinner
  if (loading && !currentUser) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin mx-auto mb-3" />
          <p className="text-xs font-medium text-slate-500">Menyiapkan Web Admin...</p>
        </div>
      </div>
    );
  }

  // 1. Session boundary: If not logged in and not on login page, force to Login
  if (!currentUser) {
    return <Login />;
  }

  // 2. Login route direct access
  if (path === "/login") {
    return <Login />;
  }

  // ==========================================
  // SUPER ADMIN ROUTES GUARD & RENDERING
  // ==========================================
  if (path.startsWith("/super-admin")) {
    if (currentUser.role !== UserRole.SUPER_ADMIN) {
      return <UnauthorizedPage />;
    }

    let view = <Dashboard />;

    if (path === "/super-admin/patients") {
      view = <PatientManagement />;
    } else if (path === "/super-admin/bookings") {
      view = <BookingManagement />;
    } else if (path === "/super-admin/h1-confirmation") {
      view = <H1ConfirmationPage />;
    } else if (path === "/super-admin/queue") {
      view = <LiveQueueManagement />;
    } else if (path === "/super-admin/treatments") {
      view = <TreatmentManagement />;
    } else if (path === "/super-admin/invoices") {
      view = <Invoices />;
    } else if (path === "/super-admin/payments") {
      view = <Payments />;
    } else if (path === "/super-admin/expenses") {
      view = <Expenses />;
    } else if (path === "/super-admin/compensation") {
      view = <Compensation />;
    } else if (path === "/super-admin/payroll") {
      view = <Payroll />;
    } else if (path === "/super-admin/accounting") {
      view = <Accounting />;
    } else if (path.startsWith("/super-admin/hr")) {
      view = <HRManagement />;
    } else if (path.startsWith("/super-admin/configuration")) {
      view = <Configuration />;
    }

    return <AdminLayout>{view}</AdminLayout>;
  }

  // ==========================================
  // BRANCH ADMIN ROUTES GUARD & RENDERING
  // ==========================================
  if (path.startsWith("/branch-admin")) {
    if (currentUser.role !== UserRole.BRANCH_ADMIN) {
      return <UnauthorizedPage />;
    }

    let view = <Dashboard />;

    if (path === "/branch-admin/patients") {
      view = <PatientManagement />;
    } else if (path === "/branch-admin/bookings") {
      view = <BookingManagement />;
    } else if (path === "/branch-admin/h1-confirmation") {
      view = <H1ConfirmationPage />;
    } else if (path === "/branch-admin/queue") {
      view = <LiveQueueManagement />;
    } else if (path === "/branch-admin/treatments") {
      view = <TreatmentManagement />;
    } else if (path === "/branch-admin/invoices") {
      view = <Invoices />;
    } else if (path === "/branch-admin/payments") {
      view = <Payments />;
    } else if (path === "/branch-admin/expenses") {
      view = <Expenses />;
    } else if (path === "/branch-admin/accounting") {
      view = <Accounting />;
    } else if (path.startsWith("/branch-admin/hr")) {
      view = <HRManagement />;
    } else if (path.startsWith("/branch-admin/configuration")) {
      view = <Configuration />;
    }

    return <AdminLayout>{view}</AdminLayout>;
  }

  // ==========================================
  // DOCTOR, ASSISTANT & PATIENT ROUTE HANDLERS
  // ==========================================
  if (path.startsWith("/doctor")) {
    if (currentUser.role !== UserRole.DOCTOR) {
      return <UnauthorizedPage />;
    }
    let view = <LiveQueueManagement />;
    if (path.includes("/treatments")) {
      view = <TreatmentManagement />;
    } else if (path.includes("/patients")) {
      view = <PatientManagement />;
    }
    return <AdminLayout>{view}</AdminLayout>;
  }

  if (path.startsWith("/assistant")) {
    if (currentUser.role !== UserRole.DOCTOR_ASSISTANT) {
      return <UnauthorizedPage />;
    }
    let view = <LiveQueueManagement />;
    if (path.includes("/treatments")) {
      view = <TreatmentManagement />;
    } else if (path.includes("/patients")) {
      view = <PatientManagement />;
    } else if (path.includes("/incentives")) {
      view = <Compensation />;
    }
    return <AdminLayout>{view}</AdminLayout>;
  }

  if (path.startsWith("/patient")) {
    if (currentUser.role !== UserRole.PATIENT) {
      return <UnauthorizedPage />;
    }
    let view = <LiveQueueManagement />;
    return <AdminLayout>{view}</AdminLayout>;
  }

  // Catch-all route handler (e.g. root "/" or unregistered urls)
  return <Login />;
};

export default function App() {
  return (
    <AppProvider>
      <RouterProvider>
        <AppContent />
      </RouterProvider>
    </AppProvider>
  );
}
