import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  // Each worker runs a software-WebGL Edge instance; more than 3 starves timing-sensitive checks on 16 GB machines
  workers: 3,
  use: { baseURL: 'http://localhost:4173', channel: 'msedge', viewport: { width: 1280, height: 720 } },
  webServer: { command: 'npm run preview', port: 4173, reuseExistingServer: true },
});
