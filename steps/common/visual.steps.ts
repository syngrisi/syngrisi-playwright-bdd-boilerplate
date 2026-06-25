/**
 * Step definitions for visual regression testing with Syngrisi.
 *
 * Provides Gherkin steps for visual snapshot comparisons of elements or pages.
 * Requires the syngrisi fixture to be active.
 */

import { expect } from '../../support/fixtures/syngrisi/syngrisi.fixture';
import { Then } from '@fixtures';
import type { VisualMatchOptions } from '../../support/fixtures/syngrisi/syngrisi.fixture';
import type { Page } from '@playwright/test';

const DEFAULT_STABILITY_RETRY_INTERVAL_MS = 250;

function buildVisualOptions(args?: { seconds?: number; tolerance?: string }): VisualMatchOptions | undefined {
  const options: VisualMatchOptions = {};

  if (typeof args?.seconds === 'number') {
    options.contentReadyTimeoutMs = args.seconds * 1000;
    options.stabilityTimeoutMs = args.seconds * 1000;
    options.stabilityIntervalMs = DEFAULT_STABILITY_RETRY_INTERVAL_MS;
  }

  if (args?.tolerance !== undefined) {
    const toleranceThreshold = Number(args.tolerance);
    if (!Number.isFinite(toleranceThreshold)) {
      throw new Error(`Invalid tolerance threshold: '${args.tolerance}'`);
    }
    options.toleranceThreshold = toleranceThreshold;
  }

  return Object.keys(options).length > 0 ? options : undefined;
}

async function expectVisualSnapshot(
  page: Page,
  testData: { renderTemplate: (value: string) => string },
  locator: string,
  name: string,
  options?: VisualMatchOptions,
) {
  if (locator === 'page') {
    await expect.soft(page).toMatchBaseline(name, options);
    return;
  }

  if (locator === 'full page') {
    await expect.soft(page).toMatchBaseline(name, {
      ...options,
      fullPage: true,
    });
    return;
  }

  await expect.soft(page.locator(testData.renderTemplate(locator))).toMatchBaseline(name, options);
}

async function expectIndexedVisualSnapshot(
  page: Page,
  testData: { renderTemplate: (value: string) => string },
  number: number,
  locator: string,
  name: string,
  options?: VisualMatchOptions,
) {
  await expect.soft(page.locator(testData.renderTemplate(locator)).nth(number - 1)).toMatchBaseline(name, options);
}

/**
 * Basic visual snapshot comparison.
 *
 * @example
 * ```gherkin
 * Then the "page" visual snapshot matches "homepage"
 * Then the "full page" visual snapshot matches "full-homepage"
 * Then the ".header" visual snapshot matches "header component"
 * ```
 */
Then(
  'the {string} visual snapshot matches {string}',
  async ({ page, syngrisi, testData }, locator: string, name: string) => {
    await page.waitForTimeout(3000);
    await expectVisualSnapshot(page, testData, locator, name);
  },
);

/**
 * Indexed visual snapshot comparison for repeated elements.
 *
 * @example
 * ```gherkin
 * Then the 2nd ".product-card" visual snapshot matches "second product"
 * ```
 */
Then(
  'the {int} {string} visual snapshot matches {string}',
  async ({ page, syngrisi, testData }, number: number, locator: string, name: string) => {
    await page.waitForTimeout(3000);
    await expectIndexedVisualSnapshot(page, testData, number, locator, name);
  },
);

/**
 * Visual snapshot with stability retry.
 *
 * @example
 * ```gherkin
 * Then the ".chart" visual snapshot matches "chart loaded" with stability retry within 10 seconds
 * ```
 */
Then(
  'the {string} visual snapshot matches {string} with stability retry within {int} seconds',
  async ({ page, syngrisi, testData }, locator: string, name: string, seconds: number) => {
    await expectVisualSnapshot(page, testData, locator, name, buildVisualOptions({ seconds }));
  },
);

/**
 * Visual snapshot with tolerance threshold.
 *
 * @example
 * ```gherkin
 * Then the ".dynamic-content" visual snapshot matches "dynamic section" with tolerance: "0.85"
 * ```
 */
Then(
  'the {string} visual snapshot matches {string} with tolerance: {string}',
  async ({ page, syngrisi, testData }, locator: string, name: string, tolerance: string) => {
    await page.waitForTimeout(3000);
    await expectVisualSnapshot(page, testData, locator, name, buildVisualOptions({ tolerance }));
  },
);

/**
 * Visual snapshot with both stability retry and tolerance.
 *
 * @example
 * ```gherkin
 * Then the ".animated" visual snapshot matches "animation" with stability retry within 5 seconds and tolerance: "0.5"
 * ```
 */
Then(
  'the {string} visual snapshot matches {string} with stability retry within {int} seconds and tolerance: {string}',
  async ({ page, syngrisi, testData }, locator: string, name: string, seconds: number, tolerance: string) => {
    await expectVisualSnapshot(page, testData, locator, name, buildVisualOptions({ seconds, tolerance }));
  },
);
