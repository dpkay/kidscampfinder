import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";

// Static deploy: the app fetches pre-generated JSON from /api/*.json and images
// from /images/*, both served by Vite out of web/public/ at the root — so there
// is no dev proxy and no runtime server. basic-ssl (self-signed HTTPS, so phone
// geolocation works over the LAN) is only relevant to `vite` (serve); gate it out
// of the production build so it isn't loaded by `vite build`.
export default defineConfig(({ command }) => ({
  plugins: [react(), ...(command === "serve" ? [basicSsl()] : [])],
  server: {
    port: 5173,
  },
}));
