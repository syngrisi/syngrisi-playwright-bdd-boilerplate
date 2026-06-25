import { When } from '@fixtures';
import type { TestStore } from '@fixtures';
import { expect, type Page } from '@playwright/test';
import { config } from '@config';
import { getLocatorQuery } from '@helpers/locators';
import { renderTemplate } from '@helpers/template';
import { evaluateInPage } from '@helpers/page-eval';

function normalizeColor(raw: string): string {
  const trimmed = (raw || '').trim();
  const rgbaMatch = trimmed.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (rgbaMatch) {
    const [, r, g, b, a] = rgbaMatch;
    return `rgba(${r},${g},${b},${a || '1'})`;
  }
  return trimmed.replace(/\s+/g, '');
}

/**
 * Step definition: `When I wait until element {string} contains text {string}`.
 *
 * Polls until any matching element's text contains the expected substring.
 * Uses Playwright's expect.poll (auto-retry + configurable timeout) instead of
 * a manual deadline loop with fixed sleeps.
 */
When(
  'I wait until element {string} contains text {string}',
  async ({ page }: { page: Page }, selector: string, expected: string) => {
    const locator = getLocatorQuery(page, selector);
    const expectedText = expected.trim();

    await expect
      .poll(
        async () => {
          const texts = await locator.evaluateAll((elements) =>
            elements.map((el) => {
              const htmlElement = el as HTMLElement;
              const text = htmlElement.innerText ?? el.textContent ?? '';
              return text.replace(/\u00a0/g, ' ');
            }),
          );
          return texts.some((text) => text.includes(expectedText));
        },
        {
          timeout: config.pollTimeout,
          message: `Element "${selector}" did not contain text "${expectedText}"`,
        },
      )
      .toBe(true);
  },
);

/**
 * Step definition: `When I repeat javascript code until stored {string} string equals {string}:`.
 *
 * Re-runs the JS snippet until its stringified result equals the expected value,
 * storing the latest result under {string} on each poll.
 */
When(
  'I repeat javascript code until stored {string} string equals {string}:',
  async ({ page, testData }: { page: Page; testData: TestStore }, itemName: string, expected: string, js: string) => {
    const renderedJs = renderTemplate(js, testData);
    const expectedValue = renderTemplate(expected, testData).trim();

    await expect
      .poll(
        async () => {
          const result = await evaluateInPage(page, renderedJs);
          const value = result === undefined || result === null ? '' : String(result).trim();
          testData.set(itemName, value);
          return value;
        },
        {
          timeout: config.pollTimeout,
          message: `Stored "${itemName}" value did not become "${expectedValue}"`,
        },
      )
      .toBe(expectedValue);
  },
);

/**
 * Step definition: `When I repeat javascript code until stored {string} string matches {string}:`.
 *
 * Re-runs the JS snippet until its stringified result matches the regex pattern,
 * storing the latest result under {string} on each poll.
 */
When(
  'I repeat javascript code until stored {string} string matches {string}:',
  async ({ page, testData }: { page: Page; testData: TestStore }, itemName: string, pattern: string, js: string) => {
    const renderedJs = renderTemplate(js, testData);
    const regex = new RegExp(pattern);

    await expect
      .poll(
        async () => {
          const result = await evaluateInPage(page, renderedJs);
          const value = result === undefined || result === null ? '' : String(result).trim();
          testData.set(itemName, value);
          return value;
        },
        {
          timeout: config.pollTimeout,
          message: `Stored "${itemName}" value did not match pattern "${pattern}"`,
        },
      )
      .toMatch(regex);
  },
);

/**
 * Step definition: `When I wait until the css attribute {string} from element {string} is {string}`.
 *
 * Polls the computed CSS value (with SVG fill/stroke and parent-color fallbacks)
 * until it equals the expected color.
 */
When(
  'I wait until the css attribute {string} from element {string} is {string}',
  async ({ page }: { page: Page }, cssProperty: string, selector: string, expected: string) => {
    const locator = getLocatorQuery(page, selector);
    const expectedNormalized = normalizeColor(expected);

    const computeValue = async (): Promise<string> => {
      const raw = await locator.first().evaluate((el, prop) => {
        const camelProp = prop.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
        const style = window.getComputedStyle(el);
        let value = (style[camelProp as keyof CSSStyleDeclaration] as string) || '';
        if (prop === 'color' && (!value || value === 'rgba(0, 0, 0, 0)' || value === 'transparent')) {
          const fill = style.fill;
          const stroke = style.stroke;
          if (fill && fill !== 'none' && fill !== 'rgba(0, 0, 0, 0)') {
            value = fill;
          } else if (stroke && stroke !== 'none' && stroke !== 'rgba(0, 0, 0, 0)') {
            value = stroke;
          }
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
      return normalizeColor(raw);
    };

    await expect
      .poll(computeValue, {
        timeout: config.pollTimeout,
        message: `CSS attribute "${cssProperty}" for "${selector}" did not reach "${expectedNormalized}"`,
      })
      .toBe(expectedNormalized);
  },
);

/**
 * Step definition: `When I wait until element {string} has attribute {string} with value {string}`.
 *
 * Uses the native web-first toHaveAttribute assertion (auto-retry).
 */
When(
  'I wait until element {string} has attribute {string} with value {string}',
  async ({ page }: { page: Page }, selector: string, attribute: string, value: string) => {
    const locator = getLocatorQuery(page, selector);
    await expect(locator.first()).toHaveAttribute(attribute, value.trim(), { timeout: config.pollTimeout });
  },
);
