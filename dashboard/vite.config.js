import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // Proxy de desarrollo al servicio de riesgo (Módulo 3): el navegador le
    // pide a /riesgo en este mismo origen y Vite reenvía al puerto 8000, así
    // no hace falta CORS. Se usa 127.0.0.1 (no localhost) por el problema
    // IPv4/IPv6 de Windows que ya vimos con adb.
    proxy: {
      "/riesgo": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
        rewrite: (ruta) => ruta.replace(/^\/riesgo/, ""),
      },
    },
  },
});