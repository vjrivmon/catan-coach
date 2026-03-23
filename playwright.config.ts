import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
    viewport: { width: 390, height: 844 },
    locale: 'es-ES',
    // Wait for network idle before asserting
    navigationTimeout: 15_000,
    actionTimeout: 10_000,
  },
})
