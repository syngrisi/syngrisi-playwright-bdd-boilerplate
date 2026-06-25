import { defineConfig, devices } from '@playwright/test';
import { defineBddConfig } from 'playwright-bdd';
import { config, env } from '@config';

const testDir = defineBddConfig({
  outputDir: '.features-gen',
  features: 'features/**/*.feature',
  steps: ['support/params.ts', 'steps/**/*.ts', 'support/fixtures/index.ts'],
});

export default defineConfig({
  timeout: config.timeout,
  expect: {
    timeout: config.expectTimeout,
  },
  globalSetup: './support/global-setup.ts',
  globalTeardown: './support/global-teardown.ts',
  fullyParallel: true,
  retries: env.CI ? config.retriesCI : config.retriesLocal,
  outputDir: './reports/test-artifacts',
  reporter: env.CI
    ? [
        ['list'],
        ['blob', { outputDir: config.blobReportPath }],
        ['json', { outputFile: 'reports/json/results.json' }],
        ['html', { open: 'never', outputFolder: config.mergedReportPath }],
      ]
    : [
        ['list'],
        ['html', { open: 'never', outputFolder: config.mergedReportPath }],
        ['json', { outputFile: 'reports/json/results.json' }],
      ],
  ...(env.PLAYWRIGHT_WORKERS ? { workers: env.PLAYWRIGHT_WORKERS } : {}),
  use: {
    baseURL: env.E2E_BASE_URL,
    headless: !env.PLAYWRIGHT_HEADED,
    // Local: keep a trace only when a test fails (cheap, no disk churn on green runs).
    // CI: trace the retry of a failed test. Force everything on with E2E_FORCE_TRACE.
    trace: env.E2E_FORCE_TRACE ? 'on' : env.CI ? 'on-first-retry' : 'retain-on-failure',
    actionTimeout: 7000,
    screenshot: 'only-on-failure',
  },
  testDir,
  projects: [
    {
      name: 'chromium',
      testDir,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1366, height: 768 },
      },
    },
  ],
});
