const installButton = document.querySelector("#install-button");
const installHelp = document.querySelector("#install-help");
let installPrompt = null;
let isIos = false;

const showInstallHelp = (message) => {
  installHelp.textContent = message;
};

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event;
  installButton.disabled = false;
  showInstallHelp("");
});

window.addEventListener("appinstalled", () => {
  installPrompt = null;
  showInstallHelp("Laladentist berhasil dipasang.");
  installButton.disabled = true;
});

if (/iPad|iPhone|iPod/.test(navigator.userAgent) && !("MSStream" in window)) {
  isIos = true;
}

installButton.addEventListener("click", async () => {
  if (!installPrompt) {
    showInstallHelp(
      isIos
        ? "Di Safari, tekan Bagikan lalu pilih Tambahkan ke Layar Utama."
        : "Browser belum menampilkan pemasangan otomatis. Buka menu browser, lalu pilih Install app atau Tambahkan ke Layar Utama."
    );
    return;
  }

  installButton.disabled = true;
  try {
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    installPrompt = null;
    if (choice.outcome === "accepted") {
      installButton.disabled = true;
      showInstallHelp("Laladentist berhasil dipasang. Halaman login dapat dibuka saat Anda siap.");
      return;
    }

    installButton.disabled = false;
    showInstallHelp("Pemasangan dibatalkan. Tekan Pasang untuk mencoba lagi.");
  } catch (error) {
    installButton.disabled = false;
    showInstallHelp(
      error instanceof Error
        ? `Browser tidak dapat memulai pemasangan: ${error.message}`
        : "Browser tidak dapat memulai pemasangan. Coba gunakan menu browser."
    );
  }
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/patient-service-worker.js", { scope: "/" })
    .catch((error) => {
      console.error("Gagal mendaftarkan service worker Laladentist:", error);
      showInstallHelp("Pemasangan belum siap. Periksa koneksi, muat ulang halaman, lalu coba lagi.");
    });
}
