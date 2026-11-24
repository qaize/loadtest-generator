import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * The browser talks to the local k6 runner through these paths, so the runner
 * stays on its own origin and needs no relaxed CORS in development.
 */
const RUNNER_PATHS = ['/run', '/runs', '/stop', '/health'];

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: Object.fromEntries(
      RUNNER_PATHS.map((path) => [
        path,
        { target: 'http://127.0.0.1:8787', changeOrigin: false },
      ]),
    ),
  },
  preview: {
    proxy: Object.fromEntries(
      RUNNER_PATHS.map((path) => [
        path,
        { target: 'http://127.0.0.1:8787', changeOrigin: false },
      ]),
    ),
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    restoreMocks: true,
  },
});