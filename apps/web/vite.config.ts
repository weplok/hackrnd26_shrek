import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// Repo root is two levels up from apps/web.
const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@zero-day/engine": fileURLToPath(new URL("../../packages/engine/src/index.ts", import.meta.url)),
    },
  },
  server: {
    fs: { allow: [repoRoot] },
  },
});
