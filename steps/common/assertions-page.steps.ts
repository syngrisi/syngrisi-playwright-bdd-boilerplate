import { Then } from '@fixtures';
import { expect } from '@playwright/test';
import type { ElementTarget, ExpectationCondition } from '@params';
import { getLocatorQuery, getRoleLocator, locatorFromTarget } from '@helpers/locators';
import { assertCondition } from '@helpers/assertions';
import type { AriaRole } from '@helpers/types';
import { renderTemplate } from '@helpers/template';
import { createLogger } from '@lib/logger';

const logger = createLogger('AssertionsSteps');

/**
 * Step definition: `Then the {role} {string} should have {valueCondition} {string}`
 *
 * Supports all string/number/key-value expectations defined in {@link ExpectationCondition}.
 *
 * @param role - {@link AriaRole} derived from `{role}`.
 * @param name - Accessible name for the target element.
 * @param condition - {@link ExpectationCondition} such as `'contains text'`, `'has attribute'`, `'has css'`.
 * @param expected - Expected string value, numeric string, or `key=value` pair depending on the condition.
 *
 * @examples
 * ```gherkin
 * Then the button "Submit" should have accessible name "Submit"
 * Then the listitem "Todo" should have count "3"
 * Then the checkbox "Accept" should have attribute "aria-checked=true"
 * ```
 */
Then(
  'the {role} {string} should have {valueCondition} {string}',
  async ({ page }, role: AriaRole, name: string, condition: ExpectationCondition, expected: string) => {
    const locator = getRoleLocator(page, role, name);
    await assertCondition(locator, condition, expected);
  },
);

/**
 * Step definition: `Then the element with {target} {string} should have {valueCondition} {string}`
 *
 * @param target - {@link ElementTarget} resolving the strategy (`'label' | 'locator'`).
 * @param rawValue - Label text or raw locator query.
 * @param condition - {@link ExpectationCondition} applied to the resolved locator.
 * @param expected - Expected value string provided in the step.
 *
 * @examples
 * ```gherkin
 * Then the element with label "Email" should have value "user@example.com"
 * Then the element with locator ".pill" should have css "background-color=red"
 * ```
 */
Then(
  'the element with {target} {string} should have {valueCondition} {string}',
  async ({ page }, target: ElementTarget, rawValue: string, condition: ExpectationCondition, expected: string) => {
    const locator = locatorFromTarget(page, target, rawValue);
    await assertCondition(locator, condition, expected);
  },
);

/**
 * Step definition: `Then the {ordinal} element with {target} {string} should have {valueCondition} {string}`
 *
 * @param ordinal - Zero-based ordinal index derived from `{ordinal}`.
 * @param target - {@link ElementTarget} resolution strategy.
 * @param rawValue - Label text or locator query.
 * @param condition - {@link ExpectationCondition} describing the assertion.
 * @param expected - Expected value string.
 *
 * @example
 * ```gherkin
 * Then the 2nd element with label "Email" should have value "admin@example.com"
 * ```
 */
Then(
  'the {ordinal} element with {target} {string} should have {valueCondition} {string}',
  async (
    { page },
    ordinal: number,
    target: ElementTarget,
    rawValue: string,
    condition: ExpectationCondition,
    expected: string,
  ) => {
    const locator = locatorFromTarget(page, target, rawValue, ordinal);
    await assertCondition(locator, condition, expected);
  },
);

/**
 * Step definition: `Then the page should be visible`.
 *
 * Provides a reusable Gherkin step for boilerplate and project test suites.
 * Keep debug messages and implementation comments in English.
 */
Then('the page should be visible', async ({ page }) => {
  await expect(page.locator('body')).toBeVisible();
});

/**
 * Step definition: `Then the element {string} has attribute {string} {string}`.
 *
 * Provides a reusable Gherkin step for boilerplate and project test suites.
 * Keep debug messages and implementation comments in English.
 */
Then(
  'the element {string} has attribute {string} {string}',
  async ({ page }, selector: string, attributeName: string, expected: string) => {
    const locator = getLocatorQuery(page, selector);
    const element = locator.first();
    const allValues = await locator.evaluateAll(
      (nodes, attr) => nodes.map((node) => (node as HTMLElement).getAttribute(attr)),
      attributeName,
    );
    logger.info(
      `Collected ${allValues.length} "${attributeName}" values for selector "${selector}": ${JSON.stringify(allValues)}`,
    );
    const htmlSnippets = await locator.evaluateAll((nodes) =>
      nodes.map((node) => {
        const el = node as Element;
        const parent = el.parentElement;
        const parentInfo = parent
          ? ` parent[data-test=${parent.getAttribute('data-test') || 'n/a'}, class=${parent.className}]`
          : '';
        return `${el.outerHTML}${parentInfo}`;
      }),
    );
    logger.info(`HTML snapshots for selector "${selector}": ${htmlSnippets.join(' | ')}`);
    const actual = await element.getAttribute(attributeName);
    logger.info(
      `Attribute assertion for selector "${selector}" -> ${attributeName}="${actual}" (expected "${expected}")`,
    );
    await expect(element).toHaveAttribute(attributeName, expected);
  },
);

/**
 * Step definition: `Then the title is {string}`.
 *
 * Provides a reusable Gherkin step for boilerplate and project test suites.
 * Keep debug messages and implementation comments in English.
 */
Then('the title is {string}', async ({ page }, expectedTitle: string) => {
  await expect(page).toHaveTitle(expectedTitle);
});

/**
 * Step definition: `Then the title contains {string}`.
 *
 * Provides a reusable Gherkin step for boilerplate and project test suites.
 * Keep debug messages and implementation comments in English.
 */
Then('the title contains {string}', async ({ page }, expectedTitle: string) => {
  // Escape regex characters for expectedTitle
  const escapedTitle = expectedTitle.replace(/[.*+?^${}()|[\\]/g, '\\$&');
  await expect(page).toHaveTitle(new RegExp(escapedTitle));
});

/**
 * Step definition: `Then the css attribute {string} from element {string} is {string}`.
 *
 * Provides a reusable Gherkin step for boilerplate and project test suites.
 * Keep debug messages and implementation comments in English.
 */
Then(
  'the css attribute {string} from element {string} is {string}',
  async ({ page, testData }, cssProperty: string, selector: string, expected: string) => {
    const renderedSelector = renderTemplate(selector, testData);
    const renderedExpected = renderTemplate(expected, testData);
    const locator = getLocatorQuery(page, renderedSelector);

    // Wait for element to be visible before checking CSS (handles slow CI)
    await locator.first().waitFor({ state: 'visible', timeout: 15000 });

    await expect(async () => {
      let actualValue = await locator.first().evaluate((el, prop) => {
        // Convert CSS property name (background-color) to camelCase (backgroundColor)
        const camelProp = prop.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
        const computedStyle = window.getComputedStyle(el);
        let value = (computedStyle[camelProp as keyof CSSStyleDeclaration] as string) || '';

        // For SVG elements with color property, check fill/stroke as fallbacks
        if (prop === 'color' && (!value || value === 'rgba(0, 0, 0, 0)' || value === 'transparent')) {
          const fill = computedStyle.fill;
          const stroke = computedStyle.stroke;

          if (fill && fill !== 'none' && fill !== 'rgba(0, 0, 0, 0)') {
            value = fill;
          } else if (stroke && stroke !== 'none' && stroke !== 'rgba(0, 0, 0, 0)') {
            value = stroke;
          }

          // If still empty, check parent element's color (SVG inherits color from parent)
          if (!value || value === 'rgba(0, 0, 0, 0)' || value === 'transparent') {
            const parent = el.parentElement;
            if (parent) {
              const parentColor = window.getComputedStyle(parent).color;
              if (parentColor && parentColor !== 'rgba(0, 0, 0, 0)') {
                value = parentColor;
              }
            }
          }
        }

        return value;
      }, cssProperty);

      // Normalize color values
      if (cssProperty.match(/(color|background-color)/)) {
        const rgbaMatch = actualValue.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
        if (rgbaMatch) {
          const r = rgbaMatch[1];
          const g = rgbaMatch[2];
          const b = rgbaMatch[3];
          const a = rgbaMatch[4] || '1';
          actualValue = `rgba(${r},${g},${b},${a})`;
        } else {
          const rgbMatch = actualValue.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
          if (rgbMatch) {
            actualValue = `rgba(${rgbMatch[1]},${rgbMatch[2]},${rgbMatch[3]},1)`;
          }
        }
        if (!actualValue) {
          logger.warn(`CSS property "${cssProperty}" returned empty value for selector "${selector}"`);
        }
      }

      // Handle px values with tolerance
      const expectedTrimmed = renderedExpected.trim();
      const pxMatch = expectedTrimmed.match(/^([\d.]+)px$/);
      const actualPxMatch = actualValue.match(/^([\d.]+)px$/);

      if (pxMatch && actualPxMatch) {
        const expectedPx = parseFloat(pxMatch[1]);
        const actualPx = parseFloat(actualPxMatch[1]);
        const tolerance = 10;
        const diff = Math.abs(expectedPx - actualPx);
        expect(diff).toBeLessThanOrEqual(tolerance);
      } else {
        expect(actualValue).toBe(expectedTrimmed);
      }
    }).toPass({ timeout: 15000 });
  },
);

/**
 * Step definition: `Then the element {string} does appear exactly {string} times`.
 *
 * Provides a reusable Gherkin step for boilerplate and project test suites.
 * Keep debug messages and implementation comments in English.
 */
Then(
  'the element {string} does appear exactly {string} times',
  async ({ page }, selector: string, expectedCount: string) => {
    const locator = getLocatorQuery(page, selector);
    const count = parseInt(expectedCount, 10);
    await expect(locator).toHaveCount(count, { timeout: 30000 });
  },
);

/**
 * Step definition: `Then the element {string} contains HTML {string}`.
 *
 * Provides a reusable Gherkin step for boilerplate and project test suites.
 * Keep debug messages and implementation comments in English.
 */
Then('the element {string} contains HTML {string}', async ({ page }, selector: string, expected: string) => {
  const locator = getLocatorQuery(page, selector);
  const html = await locator.first().innerHTML();
  await expect(html).toContain(expected);
});

/**
 * Step definition: `Then the element {string} has the class {string}`.
 *
 * Provides a reusable Gherkin step for boilerplate and project test suites.
 * Keep debug messages and implementation comments in English.
 */
Then('the element {string} has the class {string}', async ({ page }, selector: string, className: string) => {
  const locator = getLocatorQuery(page, selector);
  await expect(locator.first()).toHaveClass(new RegExp(className));
});

/**
 * Step definition: `Then the element {string} does not have the class {string}`.
 *
 * Provides a reusable Gherkin step for boilerplate and project test suites.
 * Keep debug messages and implementation comments in English.
 */
Then('the element {string} does not have the class {string}', async ({ page }, selector: string, className: string) => {
  const locator = getLocatorQuery(page, selector);
  await expect(locator.first()).not.toHaveClass(new RegExp(className));
});

/**
 * Step definition: `Then the element {string} does not have attribute {string} {string}`.
 *
 * Provides a reusable Gherkin step for boilerplate and project test suites.
 * Keep debug messages and implementation comments in English.
 */
Then(
  'the element {string} does not have attribute {string} {string}',
  async ({ page }, selector: string, attributeName: string, expected: string) => {
    const locator = getLocatorQuery(page, selector);
    await expect(locator.first()).not.toHaveAttribute(attributeName, expected);
  },
);

/**
 * Step definition: `Then the current url does not contain {string}`.
 *
 * Provides a reusable Gherkin step for boilerplate and project test suites.
 * Keep debug messages and implementation comments in English.
 */
Then('the current url does not contain {string}', async ({ page, testData }, expectedUrl: string) => {
  const renderedUrl = renderTemplate(expectedUrl, testData);
  const currentUrl = page.url();
  expect(currentUrl).not.toContain(renderedUrl);
});

/**
 * Step definition: `Then the HTML contains:`.
 *
 * Provides a reusable Gherkin step for boilerplate and project test suites.
 * Keep debug messages and implementation comments in English.
 */
Then('the HTML contains:', async ({ page }, docString: string) => {
  const source = await page.content();
  expect(source).toContain(docString.trim());
});

/**
 * Step definition: `Then the element {string} has attribute {string}`.
 *
 * Provides a reusable Gherkin step for boilerplate and project test suites.
 * Keep debug messages and implementation comments in English.
 */
Then(
  'the element {string} has attribute {string}',
  async ({ page, testData }, selector: string, attributeName: string) => {
    const renderedSelector = renderTemplate(selector, testData);
    const locator = getLocatorQuery(page, renderedSelector);
    // Wait for element to be visible first
    await locator.first().waitFor({ state: 'visible', timeout: 10000 });
    await expect(locator.first()).toHaveAttribute(attributeName);
  },
);

/**
 * Step definition: `Then the element {string} does not have attribute {string}`.
 *
 * Provides a reusable Gherkin step for boilerplate and project test suites.
 * Keep debug messages and implementation comments in English.
 */
Then(
  'the element {string} does not have attribute {string}',
  async ({ page, testData }, selector: string, attributeName: string) => {
    const renderedSelector = renderTemplate(selector, testData);
    const locator = getLocatorQuery(page, renderedSelector);
    await expect(locator.first()).not.toHaveAttribute(attributeName);
  },
);

/**
 * Step definition: `Then the cookie {string} should be present`
 *
 * Verifies that a cookie with the given name is present in the browser context.
 *
 * @example
 * ```gherkin
 * Then the cookie "my_session_id" should be present
 * ```
 */
Then('the cookie {string} should be present', async ({ page }, name: string) => {
  const cookies = await page.context().cookies();
  const cookie = cookies.find((c) => c.name === name);
  expect(cookie).toBeDefined();
});

/**
 * Step definition: `Then the cookie {string} should not be present`
 *
 * Verifies that a cookie with the given name is NOT present in the browser context.
 *
 * @example
 * ```gherkin
 * Then the cookie "my_session_id" should not be present
 * ```
 */
Then('the cookie {string} should not be present', async ({ page }, name: string) => {
  const cookies = await page.context().cookies();
  const cookie = cookies.find((c) => c.name === name);
  expect(cookie).toBeUndefined();
});

/**
 * Step definition: `Then the cookie {string} should have value {string}`
 *
 * Verifies that a cookie with the given name is present and its value matches the expected value.
 *
 * @example
 * ```gherkin
 * Then the cookie "my_session_id" should have value "abc-123"
 * ```
 */
Then('the cookie {string} should have value {string}', async ({ page }, name: string, expectedValue: string) => {
  const cookies = await page.context().cookies();
  const cookie = cookies.find((c) => c.name === name);
  expect(cookie).toBeDefined();
  expect(cookie?.value).toEqual(expectedValue);
});

/**
 * Step definition: `Then the element {string} should have at least {int} items within {int} seconds`
 *
 * Polls for minimum item count with timeout. Use for pagination/infinite scroll scenarios.
 *
 * @example
 * ```gherkin
 * Then the element "[data-test*='navbar_item_']" should have at least 21 items within 10 seconds
 * ```
 */
Then(
  'the element {string} should have at least {int} items within {int} seconds',
  async ({ page }, selector: string, minCount: number, seconds: number) => {
    const locator = getLocatorQuery(page, selector);

    await expect
      .poll(async () => await locator.count(), {
        message: `Waiting for at least ${minCount} items matching "${selector}"`,
        timeout: seconds * 1000,
      })
      .toBeGreaterThanOrEqual(minCount);
  },
);

/**
 * Step definition: `Then the element {string} should have exactly {int} items within {int} seconds`
 *
 * Polls for exact item count with timeout.
 *
 * @example
 * ```gherkin
 * Then the element "[data-test*='navbar_item_']" should have exactly 22 items within 10 seconds
 * ```
 */
Then(
  'the element {string} should have exactly {int} items within {int} seconds',
  async ({ page }, selector: string, exactCount: number, seconds: number) => {
    const locator = getLocatorQuery(page, selector);

    await expect
      .poll(async () => await locator.count(), {
        message: `Waiting for exactly ${exactCount} items matching "${selector}"`,
        timeout: seconds * 1000,
      })
      .toBe(exactCount);
  },
);

/**
 * Step definition: `Then the element {string} should have exactly {int} items within {int} seconds with refresh`
 *
 * Polls for exact item count with timeout, clicking refresh button between attempts.
 * Useful when data is created via API and table needs to be refreshed to show new items.
 *
 * @example
 * ```gherkin
 * Then the element "//div[contains(text(), 'User test')]" should have exactly 5 items within 30 seconds with refresh
 * ```
 */
Then(
  'the element {string} should have exactly {int} items within {int} seconds with refresh',
  async ({ page }, selector: string, exactCount: number, seconds: number) => {
    const locator = getLocatorQuery(page, selector);
    const refreshButton = page.locator('[data-test="table-refresh-icon"]');
    const newItemsBadge = page.locator('[data-test="table-refresh-icon-badge"]');
    const startTime = Date.now();
    const timeoutMs = seconds * 1000;
    const pollInterval = 1000;
    let lastCount = 0;

    while (Date.now() - startTime < timeoutMs) {
      lastCount = await locator.count();

      if (lastCount === exactCount) {
        return;
      }

      // Click refresh to get new data - always click if visible, regardless of badge
      const refreshVisible = await refreshButton.isVisible({ timeout: 500 }).catch(() => false);

      if (refreshVisible) {
        // Check for badge before clicking
        const hasBadge = await newItemsBadge.isVisible({ timeout: 200 }).catch(() => false);

        await refreshButton.click();

        // Wait for the refresh to complete - badge should disappear or stay gone
        await page.waitForTimeout(500);

        // If there was a badge, give extra time for data to load
        if (hasBadge) {
          await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
          // Check again immediately after refresh
          lastCount = await locator.count();
          if (lastCount === exactCount) {
            return;
          }
        }
      }

      await page.waitForTimeout(pollInterval);
    }

    // Final attempt: one more refresh and check
    const refreshVisible = await refreshButton.isVisible({ timeout: 500 }).catch(() => false);
    if (refreshVisible) {
      await refreshButton.click();
      await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(500);
    }

    lastCount = await locator.count();
    expect(lastCount, `Waiting for exactly ${exactCount} items matching "${selector}"`).toBe(exactCount);
  },
);

/**
 * Assert current URL contains a substring
 */
Then('the current url contains {string}', async ({ page, testData }, expected: string) => {
  const rendered = testData.renderTemplate(expected);
  const url = page.url();
  expect(url).toContain(rendered);
});

/**
 * Assert current URL matches exactly
 */
Then('the current url is {string}', async ({ page, testData }, expected: string) => {
  const rendered = testData.renderTemplate(expected);
  await expect(page).toHaveURL(rendered);
});
