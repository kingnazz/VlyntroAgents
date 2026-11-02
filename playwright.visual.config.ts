import { defineConfig } from '@playwright/test';
import base from './playwright.config.js';
export default defineConfig({
  ...base,
  testDir: 'tests/visual',
  timeout: 240000,
  projects: [
    {
      name: 'brand',
      use: { browserName: 'chromium', viewport: { width: 1440, height: 1000 } },
    },
  ],
});
