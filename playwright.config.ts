import { defineConfig } from '@playwright/test'

// The dev server gets a fake Supabase URL; every request to it is intercepted by the tests (see e2e/helpers.ts).
const PORT = Number(process.env.E2E_PORT ?? 5174)

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    // On Windows use the installed Edge (no browser download); elsewhere `npx playwright install chromium`.
    channel: process.env.PW_CHANNEL ?? (process.platform === 'win32' ? 'msedge' : undefined),
    viewport: { width: 1280, height: 900 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `pnpm exec vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      VITE_SUPABASE_URL: 'http://127.0.0.1:54399',
      VITE_SUPABASE_ANON_KEY: 'e2e-anon-key',
      VITE_ADMIN_EMAIL: 'admin@example.com',
    },
  },
})
