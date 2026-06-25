import { When } from '@fixtures';
import { renderTemplate } from '@helpers/template';
import { createLogger } from '@lib/logger';

const logger = createLogger('ApiMockingSteps');

/**
 * Step definition: `When I block requests matching {string}`.
 *
 * Aborts every network request whose URL matches the glob/substring pattern
 * (Playwright route matching). Useful for stubbing out third-party calls,
 * analytics, or heavy resources.
 *
 * @example
 * ```gherkin
 * When I block requests matching "**\/*.{png,jpg,gif}"
 * ```
 */
When('I block requests matching {string}', async ({ page, testData }, pattern: string) => {
  const rendered = renderTemplate(pattern, testData);
  await page.route(rendered, (route) => route.abort());
  logger.info(`Blocking requests matching "${rendered}"`);
});

/**
 * Step definition: `When I mock {string} with status {int} and json body:`.
 *
 * Fulfills matching requests with a canned JSON response (body from the
 * docstring), so a scenario can exercise UI states without a live backend.
 *
 * @example
 * ```gherkin
 * When I mock "**\/api/user" with status 200 and json body:
 *   """
 *   { "name": "Test User" }
 *   """
 * ```
 */
When(
  'I mock {string} with status {int} and json body:',
  async ({ page, testData }, pattern: string, status: number, body: string) => {
    const rendered = renderTemplate(pattern, testData);
    const renderedBody = renderTemplate(body, testData);
    await page.route(rendered, (route) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: renderedBody,
      }),
    );
    logger.info(`Mocking "${rendered}" -> ${status}`);
  },
);
