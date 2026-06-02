import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The Express API (server/index.ts) runs on :8787 in dev; Vite proxies /api and /images.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8787",
      "/images": "http://localhost:8787",
    },
  },
});
