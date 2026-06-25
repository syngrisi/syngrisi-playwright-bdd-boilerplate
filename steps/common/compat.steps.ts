/**
 * Compatibility step definitions for legacy test migration.
 * Provides aliases from old WDIO/custom step syntax to the new framework.
 */

import { expect, type Page } from '@playwright/test';
import { Then } from '@fixtures';
import { expect as visualExpect } from '@fixtures';
import { config } from '@config';
import { getLocatorQuery } from '@helpers/locators';

/**
 * Waits for the page to be visually stable before a screenshot comparison:
 * network settled and web fonts loaded, so baselines aren't diffed against
 * half-rendered text. Replaces a fixed sleep.
 */
async function waitForVisualStability(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts?.ready).catch(() => undefined);
}

/**
 * Legacy: I expect that element {string} is displayed
 */
Then('I expect that element {string} is displayed', async ({ page, testData }, selector: string) => {
  const rendered = testData.renderTemplate(selector);
  const locator = getLocatorQuery(page, rendered);
  await expect(locator.first()).toBeVisible({ timeout: config.pollTimeout });
});

/**
 * Legacy: I expect that the attribute {string} from element {string} is {string}
 */
Then(
  'I expect that the attribute {string} from element {string} is {string}',
  async ({ page, testData }, attribute: string, selector: string, expected: string) => {
    const rendered = testData.renderTemplate(selector);
    const renderedExpected = testData.renderTemplate(expected);
    const locator = getLocatorQuery(page, rendered);
    await expect(locator.first()).toHaveAttribute(attribute, renderedExpected);
  },
);

/**
 * Legacy: I expect the url to contain {string}
 */
Then('I expect the url to contain {string}', async ({ page, testData }, expected: string) => {
  const rendered = testData.renderTemplate(expected);
  expect(page.url()).toContain(rendered);
});

/**
 * Legacy: I expect that the url is {string}
 */
Then('I expect that the url is {string}', async ({ page, testData }, expected: string) => {
  const rendered = testData.renderTemplate(expected);
  await expect(page).toHaveURL(rendered);
});

/**
 * Legacy: I visually check page as {string}
 */
Then('I visually check page as {string}', async ({ page }, name: string) => {
  await waitForVisualStability(page);
  await visualExpect.soft(page).toMatchBaseline(name, { fullPage: true });
});

/**
 * Legacy: I visually check viewport as {string}
 */
Then('I visually check viewport as {string}', async ({ page }, name: string) => {
  await waitForVisualStability(page);
  await visualExpect.soft(page).toMatchBaseline(name);
});

/**
 * Legacy: I visually check component {string} as {string}
 */
Then('I visually check component {string} as {string}', async ({ page, testData }, selector: string, name: string) => {
  const rendered = testData.renderTemplate(selector);
  await waitForVisualStability(page);
  await visualExpect.soft(page.locator(rendered)).toMatchBaseline(name);
});
