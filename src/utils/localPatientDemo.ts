export function isFullAppDemoPath(pathname: string): boolean {
  return pathname === "/demo" || pathname.startsWith("/demo/");
}

export function isFullAppDemoEnabledForEnvironment(isDevelopment: boolean, pathname: string): boolean {
  return isDevelopment && isFullAppDemoPath(pathname);
}

export const isFullAppDemoEnabled =
  typeof window !== "undefined" &&
  isFullAppDemoEnabledForEnvironment(import.meta.env.DEV, window.location.pathname);

export const isLocalPatientDemoEnabled =
  (import.meta.env.DEV && import.meta.env.VITE_LOCAL_PATIENT_DEMO === "true")
  || isFullAppDemoEnabled;
