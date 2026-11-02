import React from "react";
import { createRoot } from "react-dom/client";
import { AttendancePortal } from "./AttendancePortal";
import "./style.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AttendancePortal />
  </React.StrictMode>
);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    const hadController = Boolean(navigator.serviceWorker.controller);
    let isReloading = false;
    if (hadController) {
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (isReloading) return;
        isReloading = true;
        window.location.reload();
      });
    }

    void navigator.serviceWorker.register("/service-worker.js", { updateViaCache: "none" })
      .then((registration) => registration.update())
      .catch((error: unknown) => {
        console.error("Gagal memperbarui service worker portal absensi:", error);
      });
  });
}
