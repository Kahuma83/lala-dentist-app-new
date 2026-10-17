import React, { useEffect } from "react";
import { AppProvider, useApp } from "./context/AppContext";
import { RouterProvider, useRouter } from "./components/Router";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { PatientManagement } from "./pages/PatientManagement";
import { BookingManagement } from "./pages/BookingManagement";
import { H1ConfirmationPage } from "./pages/H1ConfirmationPage";
import { HotProspectPage } from "./pages/HotProspectPage";
import { LiveQueueManagement } from "./pages/LiveQueueManagement";
import { TreatmentManagement } from "./pages/TreatmentManagement";
import { Invoices } from "./pages/Invoices";
import { Payments } from "./pages/Payments";
import { Compensation } from "./pages/Compensation";
import { Payroll } from "./pages/Payroll";
import { Expenses } from "./pages/Expenses";
import { Configuration } from "./pages/Configuration";
import { Accounting } from "./pages/Accounting";
import { PatientAnalytics } from "./pages/PatientAnalytics";
import { PatientPortalHome } from "./pages/PatientPortalHome";
import { PatientAuthPage } from "./pages/PatientAuthPage";
import { HRManagement } from "./pages/HRManagement";
import { DoctorSchedules } from "./pages/DoctorSchedules";
import { WebsiteContentManagement } from "./pages/WebsiteContentManagement";
import { PlaceholderPage } from "./pages/PlaceholderPage";
import { AdminLayout } from "./layouts/AdminLayout";
import { UserRole } from "./types/domain";
import { isSupabaseConfigured } from "./lib/supabase";
import { AuthService } from "./services/authService";
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
  const { currentUser, authLoading } = useApp();
  const patientPortalHost = String(import.meta.env.VITE_PATIENT_PORTAL_HOST || "pasien.laladentist.id")
    .trim()
    .toLowerCase();
  const isPatientPortalHost = !!patientPortalHost && window.location.hostname.toLowerCase() === patientPortalHost;
  const isPatientPortalRoute = isPatientPortalHost || path.startsWith("/patient");

  useEffect(() => {
    if (!isPatientPortalHost) return;

    const originalTitle = document.title;
    const manifestLink = document.createElement("link");
    manifestLink.rel = "manifest";
    manifestLink.href = "/patient.webmanifest";
    document.head.appendChild(manifestLink);
    document.title = "Portal Pasien | Lala Dentist";

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/patient-service-worker.js", { scope: "/" })
        .catch((registrationError: unknown) => {
          console.error("Gagal mendaftarkan service worker portal pasien:", registrationError);
        });
    }

    return () => {
      manifestLink.remove();
      document.title = originalTitle;
    };
  }, [isPatientPortalHost]);

  // If initial auth session is still checking, show clean loading spinner
  if (authLoading && !currentUser) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin mx-auto mb-3" />
          <p className="text-xs font-medium text-slate-500">
            {isPatientPortalRoute ? "Menyiapkan Portal Pasien..." : "Menyiapkan Web Admin..."}
          </p>
        </div>
      </div>
    );
  }

  if (isPatientPortalRoute) {
    if (currentUser && currentUser.role !== UserRole.PATIENT) {
      return <PatientPortalSessionConflict />;
    }
    if (currentUser?.role === UserRole.PATIENT) return <PatientPortalHome />;
    return <PatientAuthPage />;
  }

  const hasStaleMockIdentity =
    !!currentUser &&
    !!currentUser.authUserId &&
    /^(user-|auth-|patient-)/i.test(currentUser.authUserId);

  // 1. Session boundary: If not logged in, or still holding stale mock identity, force to Login
  if (!currentUser || (isSupabaseConfigured && hasStaleMockIdentity)) {
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
    } else if (path === "/super-admin/hot-prospect") {
      view = <HotProspectPage />;
    } else if (path === "/super-admin/queue") {
      view = <LiveQueueManagement />;
    } else if (path === "/super-admin/check-in") {
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
    } else if (path === "/super-admin/analytics") {
      view = <PatientAnalytics />;
    } else if (path.startsWith("/super-admin/schedules")) {
      view = <DoctorSchedules />;
    } else if (path.startsWith("/super-admin/hr")) {
      view = <HRManagement />;
    } else if (path.startsWith("/super-admin/configuration")) {
      view = <Configuration />;
    } else if (path === "/super-admin/website") {
      view = <WebsiteContentManagement />;
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
    } else if (path === "/branch-admin/hot-prospect") {
      view = <HotProspectPage />;
    } else if (path === "/branch-admin/queue") {
      view = <LiveQueueManagement />;
    } else if (path === "/branch-admin/check-in") {
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
    } else if (path.startsWith("/branch-admin/schedules")) {
      view = <DoctorSchedules />;
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
    if (path.includes("/schedules")) {
      view = <DoctorSchedules />;
    } else if (path.includes("/treatments")) {
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

  // Catch-all route handler (e.g. root "/" or unregistered urls)
  return <Login />;
};

const PatientPortalSessionConflict: React.FC = () => {
  const { setCurrentUser } = useApp();
  const [error, setError] = React.useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = React.useState(false);

  const signOutStaffSession = async () => {
    setIsSigningOut(true);
    setError(null);
    try {
      await AuthService.signOut();
      setCurrentUser(null);
    } catch (signOutError) {
      setError(signOutError instanceof Error ? signOutError.message : "Gagal mengakhiri sesi akun staf.");
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f5ef] p-5">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 text-center shadow-sm">
        <h1 className="text-lg font-bold text-slate-900">Sesi akun staf terdeteksi</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Portal ini khusus pasien. Keluar dari akun staf terlebih dahulu untuk melanjutkan ke portal pasien.
        </p>
        {error && <p role="alert" className="mt-4 rounded-lg bg-rose-50 p-3 text-xs text-rose-700">{error}</p>}
        <button
          type="button"
          onClick={() => void signOutStaffSession()}
          disabled={isSigningOut}
          className="mt-5 rounded-xl bg-[#173d35] px-5 py-3 text-sm font-bold text-white hover:bg-[#205146] disabled:opacity-50"
        >
          {isSigningOut ? "Mengakhiri sesi..." : "Keluar dan lanjut ke portal pasien"}
        </button>
      </section>
    </main>
  );
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
