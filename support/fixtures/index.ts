import { mergeTests } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { appServerFixture } from './app-server.fixture';
import { testDataFixture } from './test-data.fixture';
import { testEngineFixture } from './test-engine.fixture';
import { syngrisiFixture } from './syngrisi/syngrisi.fixture';

// Import params
import '@params';

// Merge all fixture implementations
export const test = mergeTests(appServerFixture, testDataFixture, testEngineFixture, syngrisiFixture);

// Create BDD helpers with merged fixtures
export const { Given, When, Then } = createBdd(test);

// Re-export types for convenience
export type { AppServerFixture } from './app-server.fixture';
export type { TestStore } from './test-data.fixture';
export type { TestEngineFixture } from './test-engine.fixture';

// Re-export syngrisi expect for visual steps
export { expect } from './syngrisi/syngrisi.fixture';
export type { VisualMatchOptions } from './syngrisi/syngrisi.fixture';
