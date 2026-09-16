import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // Share the single repo-root .env (documented in README) instead of
  // Vite's default of looking in apps/web/ for its own copy.
  envDir: fileURLToPath(new URL("../..", import.meta.url)),
  server: {
    port: 5173,
  },
});
