import { When, Then } from '@fixtures';
import { expect, type Page } from '@playwright/test';
import { createLogger } from '@lib/logger';

const logger = createLogger('Network');

// Use WeakMap to store tracker per page instance
const pageTrackers = new WeakMap<Page, string[]>();

function getRequests(page: Page): string[] {
  if (!pageTrackers.has(page)) {
    pageTrackers.set(page, []);
  }
  return pageTrackers.get(page)!;
}

/**
 * Step definition: `When I start intercepting requests matching {string}`.
 *
 * Provides a reusable Gherkin step for boilerplate and project test suites.
 * Keep debug messages and implementation comments in English.
 */
When('I start intercepting requests matching {string}', async ({ page }, urlPattern: string) => {
  // Initialize empty requests array
  pageTrackers.set(page, []);

  // Use route to intercept ALL requests matching the given URL pattern
  await page.route(urlPattern, async (route) => {
    const url = route.request().url();
    const baseUrl = url.split('?')[0];
    const requests = getRequests(page);
    requests.push(baseUrl);
    logger.info(`[Network] Request intercepted: ${baseUrl}`);
    // Continue the request normally
    await route.continue();
  });
});

/**
 * Step definition: `When I reset request counter`.
 *
 * Provides a reusable Gherkin step for boilerplate and project test suites.
 * Keep debug messages and implementation comments in English.
 */
When('I reset request counter', async ({ page }) => {
  const requests = getRequests(page);
  logger.info(`[Network] Resetting counter. Previous count: ${requests.length}`);
  pageTrackers.set(page, []);
});

/**
 * Step definition: `Then I expect at least {int} requests were made`.
 *
 * Provides a reusable Gherkin step for boilerplate and project test suites.
 * Keep debug messages and implementation comments in English.
 */
Then('I expect at least {int} requests were made', async ({ page }, minCount: number) => {
  await expect
    .poll(() => getRequests(page).length, {
      message: `Expected at least ${minCount} requests`,
      timeout: 10000,
    })
    .toBeGreaterThanOrEqual(minCount);

  const requests = getRequests(page);
  const count = requests.length;
  logger.info(`[Network] Requests made: ${count}, expected at least: ${minCount}`);
  logger.info(`[Network] URLs: ${requests.join(', ')}`);
});

/**
 * Step definition: `Then I expect {int} new requests were made for cached resources`.
 *
 * Provides a reusable Gherkin step for boilerplate and project test suites.
 * Keep debug messages and implementation comments in English.
 */
Then('I expect {int} new requests were made for cached resources', async ({ page }, expectedCount: number) => {
  const requests = getRequests(page);
  const count = requests.length;
  logger.info(`[Network] New requests after reset: ${count}, expected: ${expectedCount}`);
  if (count > 0) {
    logger.info(`[Network] Unexpected requests: ${requests.join(', ')}`);
  }

  // Allow some tolerance - the browser might make requests for resources that weren't in the preload batch
  // But we expect most resources to be cached
  expect(count).toBeLessThanOrEqual(expectedCount);
});

/**
 * Step definition: `Then I expect exactly {int} requests were made`.
 *
 * Provides a reusable Gherkin step for boilerplate and project test suites.
 * Keep debug messages and implementation comments in English.
 */
Then('I expect exactly {int} requests were made', async ({ page }, expectedCount: number) => {
  const requests = getRequests(page);
  const count = requests.length;
  logger.info(`[Network] Requests made: ${count}, expected exactly: ${expectedCount}`);
  expect(count).toBe(expectedCount);
});

/**
 * Step definition: `Then I expect at most {int} new requests were made`.
 *
 * Provides a reusable Gherkin step for boilerplate and project test suites.
 * Keep debug messages and implementation comments in English.
 */
Then('I expect at most {int} new requests were made', async ({ page }, maxCount: number) => {
  const requests = getRequests(page);
  const count = requests.length;
  logger.info(`[Network] New requests: ${count}, expected at most: ${maxCount}`);
  if (count > 0) {
    logger.info(`[Network] Request URLs: ${requests.join(', ')}`);
  }
  expect(count).toBeLessThanOrEqual(maxCount);
});

/**
 * Step definition: `When I log request count`.
 *
 * Provides a reusable Gherkin step for boilerplate and project test suites.
 * Keep debug messages and implementation comments in English.
 */
When('I log request count', async ({ page }) => {
  const requests = getRequests(page);
  logger.info(`[Network] Current request count: ${requests.length}`);
  if (requests.length > 0) {
    logger.info(`[Network] URLs: ${requests.join('\n  ')}`);
  }
});
