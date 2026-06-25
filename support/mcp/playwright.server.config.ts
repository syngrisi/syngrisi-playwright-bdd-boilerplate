import { defineConfig } from '@playwright/test';
import { env } from './config';
// Relative import: MCP code runs without tsconfig path resolution
import { env as appEnv } from '../../config';

const testDir = __dirname;

export default defineConfig({
  testDir,
  testMatch: '**/mcp.spec.ts',
  fullyParallel: true,
  use: {
    baseURL: appEnv.E2E_BASE_URL,
    viewport: null,
    launchOptions: {
      args: ['--start-maximized'],
    },
    actionTimeout: 15000,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        channel: 'chromium',
        headless: env.E2E_HEADLESS === '1',
      },
    },
  ],
});
