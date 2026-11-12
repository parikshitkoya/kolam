// Local preview of the game screen: `npm run preview`. Dev-only, never part of the Devvit build.
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';

const repo = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react(), tailwind()],
  server: { open: true, fs: { allow: [repo] } },
});
