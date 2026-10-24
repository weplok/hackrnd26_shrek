<<<<<<< HEAD
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
=======
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  publicDir: '../../content',
  server: {
    port: 5173,
>>>>>>> 6f0b5d1021ece56acf7816db674f9ce1fececf1a
  },
});
