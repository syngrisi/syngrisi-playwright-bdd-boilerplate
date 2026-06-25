import { defineConfig } from '@playwright/test';

// Dedicated config for fast, pure-logic unit tests (no browser, no bddgen).
// Run with `yarn test:unit`.
export default defineConfig({
  testDir: './tests/unit',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  reporter: [['list']],
});
