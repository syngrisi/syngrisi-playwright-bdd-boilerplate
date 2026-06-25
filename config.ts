import path from 'path';
import { bool, cleanEnv, num, str } from 'envalid';
import { loadEnv } from './support/utils/env';

loadEnv(path.resolve(__dirname, '.env'));

export const env = cleanEnv(process.env, {
  CI: bool({
    default: false,
    desc: 'Marks CI execution to adjust retries and reporting',
  }),
  E2E_BASE_URL: str({
    default: 'https://the-internet.herokuapp.com',
    desc: 'Base URL for E2E tests',
  }),
  E2E_BACKEND_HOST: str({
    default: '127.0.0.1',
    desc: 'Host to bind backend server in E2E tests',
  }),
  E2E_LOG_LEVEL: str({
    default: 'info',
    desc: 'E2E framework log level (error, warn, info, debug)',
  }),
  DOCKER: str({
    default: '0',
    desc: 'Run tests in Docker mode',
  }),
  PLAYWRIGHT_HEADED: bool({
    default: false,
    desc: 'Run Playwright tests in headed mode',
  }),
  PLAYWRIGHT_WORKERS: num({
    default: 4,
    desc: 'Number of parallel workers for Playwright',
  }),
  E2E_DEBUG: bool({
    default: false,
    desc: 'Enable debug mode - pause browser on test failure for inspection',
  }),
  E2E_FORCE_TRACE: bool({
    default: false,
    desc: 'Enable Playwright trace for all test runs',
  }),
});

export const config = {
  timeout: 5 * 60 * 1000,
  expectTimeout: 10_000,
  // Polling steps that wait for async app state (text/attribute/JS result).
  // Single source for these waits so they are configurable, not hardcoded per step.
  pollTimeout: 30_000,
  retriesCI: 2,
  // No retries locally so flakiness surfaces during development instead of being
  // masked by a passing retry; CI still retries to absorb infra noise.
  retriesLocal: 0,
  blobReportPath: './reports/blob',
  mergedReportPath: './reports/html',
} as const;
