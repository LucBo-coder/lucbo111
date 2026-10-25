import { defineConfig } from '@playwright/test';
import base from './playwright.config';

export default defineConfig({
  ...base,
  testMatch: 'server_world.spec.ts',
  testIgnore: [],
  workers: 1,
  webServer: [
    { command: 'npm run preview', port: 4173, reuseExistingServer: true },
    { command: process.env.SERVER_TEST_COMMAND || 'npm run server', url: 'http://127.0.0.1:8789/healthz', env: { PORT: '8789', HOST: '127.0.0.1', DB_PATH: ':memory:', VERBOSE: 'false' }, reuseExistingServer: process.env.SERVER_TEST_EXTERNAL === '1' },
  ],
});
