import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, "../../", "");
  const api = env.API_PROXY_TARGET || `http://localhost:${env.API_PORT || 3000}`;
  return {
    envDir: "../../",
    plugins: [react(), tailwindcss()],
    // Same-origin API in development: cookies stay first-party and SameSite=Lax works.
    // Cookies are host-scoped (not port-scoped), so a session from the game client on
    // localhost:5173 is also visible here on localhost:5174.
    server: { port: 5174, strictPort: true, proxy: { "/api": { target: api, changeOrigin: false } } },
    preview: { port: 4174, proxy: { "/api": { target: api, changeOrigin: false } } },
    define: { global: "globalThis" },
    resolve: { alias: { buffer: "buffer/" } },
    build: { target: "es2022", sourcemap: true, chunkSizeWarningLimit: 2500 },
  };
});
