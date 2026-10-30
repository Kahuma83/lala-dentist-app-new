export function isFullAppDemoPath(pathname: string): boolean {
  return pathname === "/demo" || pathname.startsWith("/demo/");
}

export const isFullAppDemoEnabled =
  typeof window !== "undefined" && isFullAppDemoPath(window.location.pathname);

export const isLocalPatientDemoEnabled =
  (import.meta.env.DEV && import.meta.env.VITE_LOCAL_PATIENT_DEMO === "true")
  || isFullAppDemoEnabled;
