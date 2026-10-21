import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const repositoryRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.resolve(repositoryRoot, "attendance-portal"),
  envDir: repositoryRoot,
  plugins: [react()],
  build: {
    outDir: path.resolve(repositoryRoot, "dist-attendance-portal"),
    emptyOutDir: true
  },
  server: {
    host: "0.0.0.0",
    port: 3002,
    strictPort: true,
    proxy: {
      "/api": {
        target: process.env.DOCTOR_CHAT_API_URL || "http://localhost:3001",
        changeOrigin: true
      }
    }
  }
});
