import type { Page } from '@playwright/test';
import { When } from '@fixtures';
import { getLocatorQuery } from '@helpers/locators';
import { renderTemplate } from '@helpers/template';
import { evaluateInPage } from '@helpers/page-eval';
import type { TestStore } from '@fixtures';
import { createLogger } from '@lib/logger';

const logger = createLogger('ActionsSteps');

/**
 * Step definition: `When I wait for "{string}" seconds`
 *
 * Waits for the specified number of seconds, accepting templated values.
 *
 * @param rawSeconds - String representation of the seconds to wait.
 *
 * @example
 * ```gherkin
 * When I wait for "1" seconds
 * ```
 */
When(/I wait for "(.+)" second(?:s)?/, async ({ page, testData }, rawSeconds: string) => {
  const renderedSeconds = renderTemplate(rawSeconds, testData).trim();
  const seconds = Number.parseFloat(renderedSeconds);

  if (!Number.isFinite(seconds) || seconds < 0) {
    throw new Error(`Invalid wait duration: ${renderedSeconds}`);
  }

  await page.waitForTimeout(seconds * 1000);
});

/**
 * Step definition: `When I wait up to {int} seconds for javascript condition:`.
 *
 * Provides a reusable Gherkin step for boilerplate and project test suites.
 * Keep debug messages and implementation comments in English.
 */
When(
  'I wait up to {int} seconds for javascript condition:',
  async ({ page }: { page: Page }, timeoutSeconds: number, js: string) => {
    const trimmedJs = js.trim();
    const expression = trimmedJs.includes('return') ? trimmedJs : `return (${trimmedJs});`;
    const wrappedFunction = `(() => { ${expression} })()`;

    // Custom polling implementation to bypass global actionTimeout
    const pollingInterval = 100; // Check every 100ms
    const timeoutMs = timeoutSeconds * 1000;
    const startTime = Date.now();

    while (true) {
      try {
        const result = await page.evaluate(wrappedFunction);
        if (result) {
          return; // Condition met
        }
      } catch (_error) {
        // Ignore evaluation errors and continue polling
      }

      if (Date.now() - startTime >= timeoutMs) {
        throw new Error(`Timeout ${timeoutSeconds}s exceeded waiting for javascript condition:\n${trimmedJs}`);
      }

      await page.waitForTimeout(pollingInterval);
    }
  },
);

/**
 * Step definition: `When I wait {number} second(s)`
 *
 * Waits for the specified number of seconds, accepting templated values.
 * This pattern does NOT match "I wait for ..." format or "I wait X seconds for the ..." format.
 *
 * @param rawSeconds - String representation of the seconds to wait.
 *
 * @example
 * ```gherkin
 * When I wait 3 seconds
 * ```
 */
When(
  /^I wait (?!for)(\d+(?:\.\d+)?)\s+second(?:s)?(?!\s+for\s+the)$/,
  async ({ page, testData }, rawSeconds: string) => {
    const renderedSeconds = renderTemplate(rawSeconds, testData).trim();
    const seconds = Number.parseFloat(renderedSeconds);

    if (!Number.isFinite(seconds) || seconds < 0) {
      throw new Error(`Invalid wait duration: ${renderedSeconds}`);
    }

    await page.waitForTimeout(seconds * 1000);
  },
);

/**
 * Step definition: `When I press the {string} key`
 *
 * @param key - Key name to press (e.g., 'Escape', 'Enter', 'Tab').
 *
 * @example
 * ```gherkin
 * When I press the "Escape" key
 * ```
 */
When('I press the {string} key', async ({ page, testData }, key: string) => {
  const rendered = testData.renderTemplate(key);
  await page.keyboard.press(rendered);
});

/**
 * Step definition: `When I open url {string}` or `When I open site {string}`
 *
 * Navigates to the specified URL, supporting template variable substitution.
 *
 * @param url - URL to navigate to, may contain template variables.
 *
 * @examples
 * ```gherkin
 * When I open url "http://localhost:5555"
 * When I open site "https://example.com"
 * When I open url "<baseUrl>/dashboard"
 * ```
 */
When(/I open (?:url|site) "(.*)"/, async ({ page, testData }, url) => {
  const parsedUrl = testData.renderTemplate(url);
  await page.goto(parsedUrl);
});

/**
 * Step definition: `When I open the url {string}`.
 *
 * Provides a reusable Gherkin step for boilerplate and project test suites.
 * Keep debug messages and implementation comments in English.
 */
When('I open the url {string}', async ({ page, testData }: { page: Page; testData: TestStore }, url: string) => {
  const parsedUrl = testData.renderTemplate(url);
  logger.info(`Navigating to URL: ${parsedUrl}`);

  // Use domcontentloaded to avoid timeouts when background polling is active
  await page.goto(parsedUrl, { waitUntil: 'domcontentloaded' });
});

/**
 * Step definition: `When I set window size: {string}`.
 *
 * Provides a reusable Gherkin step for boilerplate and project test suites.
 * Keep debug messages and implementation comments in English.
 */
When('I set window size: {string}', async ({ page }, viewport: string) => {
  const size = viewport.split('x');
  await page.setViewportSize({ width: parseInt(size[0], 10), height: parseInt(size[1], 10) });
});

/**
 * Step definition: `When I refresh page`.
 *
 * Provides a reusable Gherkin step for boilerplate and project test suites.
 * Keep debug messages and implementation comments in English.
 */
When('I refresh page', async ({ page }) => {
  await page.reload();
});

/**
 * Step definition: `When I execute javascript code:`
 *
 * Atomic implementation - executes JavaScript code in browser context and stores result.
 * No retries, no special handling for specific code patterns.
 *
 * @param js - JavaScript code to execute (may contain 'return' statement).
 *
 * @example
 * ```gherkin
 * When I execute javascript code:
 *   """
 *   return document.querySelector('h1').textContent
 *   """
 * ```
 */
When('I execute javascript code:', async ({ page, testData }: { page: Page; testData: TestStore }, js: string) => {
  const result = await evaluateInPage(page, js);
  testData.set('js', result);
  // Surface the evaluated value as the step result so agents can read it back
  return result;
});

/**
 * Step definition: `When I scroll to element {string}`.
 *
 * Provides a reusable Gherkin step for boilerplate and project test suites.
 * Keep debug messages and implementation comments in English.
 */
When('I scroll to element {string}', async ({ page, testData }, selector: string) => {
  const rendered = testData.renderTemplate(selector);
  const locator = getLocatorQuery(page, rendered);
  const element = locator.first();
  // Use scrollIntoView with 'end' alignment to ensure element is scrolled to bottom of viewport
  // This is important for triggering infinite scroll loaders that are positioned after the element
  await element.evaluate((el) => {
    el.scrollIntoView({ behavior: 'instant', block: 'end' });
  });
  // Wait longer to allow intersection observer to trigger and async fetch to complete
  await page.waitForTimeout(500);
});

/**
 * Step definition: `When I scroll container {string} to bottom`.
 *
 * Provides a reusable Gherkin step for boilerplate and project test suites.
 * Keep debug messages and implementation comments in English.
 */
When('I scroll container {string} to bottom', async ({ page, testData }, selector: string) => {
  const rendered = testData.renderTemplate(selector);
  const locator = getLocatorQuery(page, rendered);
  const container = locator.first();

  // Wait for container to be visible
  await container.waitFor({ state: 'visible', timeout: 10000 });

  // Scroll with requestAnimationFrame to ensure IntersectionObserver fires
  await container.evaluate((el) => {
    return new Promise<void>((resolve) => {
      const maxScroll = el.scrollHeight - el.clientHeight;
      el.scrollTop = maxScroll;

      // requestAnimationFrame ensures observer can react
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          // Small bounce to guarantee observer triggers
          el.scrollTop = maxScroll - 1;
          requestAnimationFrame(() => {
            el.scrollTop = maxScroll;
            requestAnimationFrame(() => resolve());
          });
        });
      });
    });
  });

  // Additional stabilization wait for DOM updates
  await page.waitForTimeout(500);
});

/**
 * Step definition: `When I reload session`.
 *
 * Provides a reusable Gherkin step for boilerplate and project test suites.
 * Keep debug messages and implementation comments in English.
 */
When('I reload session', async ({ page, testData }: { page: Page; testData: TestStore }) => {
  await page.context().clearCookies();
  // Clear all browser storage to ensure clean session state
  try {
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  } catch {
    // Page might not have a valid context yet - ignore
  }
  testData.clearAll();
});

/**
 * Step definition: `When I delete the cookie {string}`.
 *
 * Provides a reusable Gherkin step for boilerplate and project test suites.
 * Keep debug messages and implementation comments in English.
 */
When('I delete the cookie {string}', async ({ page }, cookieName: string) => {
  await page.context().clearCookies({ name: cookieName });
});

/**
 * Step definition: `When I press {string}`.
 *
 * Provides a reusable Gherkin step for boilerplate and project test suites.
 * Keep debug messages and implementation comments in English.
 */
When('I press {string}', async ({ page, testData }, key: string) => {
  const rendered = testData.renderTemplate(key);
  await page.keyboard.press(rendered);
});

/**
 * Step definition: `When I hold key {string}`.
 *
 * Provides a reusable Gherkin step for boilerplate and project test suites.
 * Keep debug messages and implementation comments in English.
 */
When('I hold key {string}', async ({ page, testData }, key: string) => {
  const rendered = testData.renderTemplate(key);
  await page.keyboard.down(rendered);
});

/**
 * Step definition: `When I release key {string}`.
 *
 * Provides a reusable Gherkin step for boilerplate and project test suites.
 * Keep debug messages and implementation comments in English.
 */
When('I release key {string}', async ({ page, testData }, key: string) => {
  const rendered = testData.renderTemplate(key);
  await page.keyboard.up(rendered);
});

/**
 * Step definition: `When I move to element {string}`.
 *
 * Provides a reusable Gherkin step for boilerplate and project test suites.
 * Keep debug messages and implementation comments in English.
 */
When('I move to element {string}', async ({ page, testData }, selector: string) => {
  const rendered = testData.renderTemplate(selector);
  const locator = getLocatorQuery(page, rendered);
  const element = locator.first();
  await element.hover();
});

/**
 * Step definition: `When I hover over {string} and wait for tooltip {string}`.
 *
 * Provides a reusable Gherkin step for boilerplate and project test suites.
 * Keep debug messages and implementation comments in English.
 */
When(
  'I hover over {string} and wait for tooltip {string}',
  async ({ page }, hoverSelector: string, tooltipSelector: string) => {
    const element = getLocatorQuery(page, hoverSelector).first();
    await element.hover();
    // Keep hovering while waiting for tooltip (handles openDelay)
    await getLocatorQuery(page, tooltipSelector).waitFor({ state: 'visible', timeout: 10000 });
  },
);

/**
 * Step definition: `When I move to element {string} with an offset of {int},{int}`.
 *
 * Provides a reusable Gherkin step for boilerplate and project test suites.
 * Keep debug messages and implementation comments in English.
 */
When(
  'I move to element {string} with an offset of {int},{int}',
  async ({ page }, selector: string, x: number, y: number) => {
    const locator = getLocatorQuery(page, selector);
    const box = await locator.first().boundingBox();
    if (box) {
      await page.mouse.move(box.x + x, box.y + y);
    }
  },
);

/**
 * Remove an element from the DOM via JavaScript
 */
When('I remove element {string}', async ({ page, testData }, selector: string) => {
  const rendered = testData.renderTemplate(selector);
  await page.evaluate((sel) => {
    const elements = sel.startsWith('//')
      ? (() => {
          const result = document.evaluate(sel, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
          const nodes: Element[] = [];
          for (let i = 0; i < result.snapshotLength; i++) {
            nodes.push(result.snapshotItem(i) as Element);
          }
          return nodes;
        })()
      : Array.from(document.querySelectorAll(sel));
    for (const el of elements) {
      el.remove();
    }
  }, rendered);
});

/**
 * Scroll to the top of the page
 */
When('I scroll to the top of page', async ({ page }) => {
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.waitForTimeout(500);
});

/**
 * Switch to the last opened tab/window
 */
When('I focus the last opened tab', async ({ page, context }) => {
  const pages = context.pages();
  if (pages.length > 1) {
    const lastPage = pages[pages.length - 1];
    await lastPage.bringToFront();
  }
});
