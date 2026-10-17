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
    navigator.serviceWorker.register("/service-worker.js").catch((error: unknown) => {
      console.error("Gagal mengaktifkan service worker portal absensi:", error);
    });
  });
}
