import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import type { TestStore } from '@fixtures';
import { getLocatorQuery } from '@helpers/locators';
import { renderTemplate } from '@helpers/template';
import { createLogger } from '@lib/logger';

const logger = createLogger('AssertionsSteps');

type KeyValue = { key: string; value?: string };

const STATE_ASSERTIONS = {
  attached: (locator: Locator, options?: { timeout?: number }) => expect(locator).toBeAttached(options),
  detached: (locator: Locator, options?: { timeout?: number }) => expect(locator).not.toBeAttached(options),
  present: (locator: Locator, options?: { timeout?: number }) => expect(locator).toBeAttached(options),
  absent: (locator: Locator, options?: { timeout?: number }) => expect(locator).not.toBeAttached(options),
  visible: (locator: Locator, options?: { timeout?: number }) => expect(locator).toBeVisible(options),
  hidden: (locator: Locator, options?: { timeout?: number }) => expect(locator).toBeHidden(options),
  enabled: (locator: Locator, options?: { timeout?: number }) => expect(locator).toBeEnabled(options),
  disabled: (locator: Locator, options?: { timeout?: number }) => expect(locator).toBeDisabled(options),
  editable: (locator: Locator, options?: { timeout?: number }) => expect(locator).toBeEditable(options),
  readonly: (locator: Locator, options?: { timeout?: number }) => expect(locator).not.toBeEditable(options),
  checked: (locator: Locator, options?: { timeout?: number }) => expect(locator).toBeChecked(options),
  unchecked: (locator: Locator, options?: { timeout?: number }) => expect(locator).not.toBeChecked(options),
  focused: (locator: Locator, options?: { timeout?: number }) => expect(locator).toBeFocused(options),
  blurred: (locator: Locator, options?: { timeout?: number }) => expect(locator).not.toBeFocused(options),
  empty: (locator: Locator, options?: { timeout?: number }) => expect(locator).toBeEmpty(options),
  'in viewport': (locator: Locator, options?: { timeout?: number }) => expect(locator).toBeInViewport(options),
  'not in viewport': (locator: Locator, options?: { timeout?: number }) => expect(locator).not.toBeInViewport(options),
} as const;

const STRING_ASSERTIONS = {
  'has text': (locator: Locator, expected: string) => expect(locator).toHaveText(expected),
  'contains text': (locator: Locator, expected: string) => expect(locator).toContainText(expected),
  'has value': (locator: Locator, expected: string) => expect(locator).toHaveValue(expected),
  'contains value': (locator: Locator, expected: string) =>
    expect(locator).toHaveValue(new RegExp(escapeForRegex(expected))),
  'has class': (locator: Locator, expected: string) =>
    expect(locator).toHaveClass(new RegExp(escapeForRegex(expected))),
  'contains class': (locator: Locator, expected: string) => expect(locator).toContainClass(expected),
  'has id': (locator: Locator, expected: string) => expect(locator).toHaveId(expected),
  'has accessible name': (locator: Locator, expected: string) => expect(locator).toHaveAccessibleName(expected),
  'has accessible description': (locator: Locator, expected: string) =>
    expect(locator).toHaveAccessibleDescription(expected),
  'contains HTML': async (locator: Locator, expected: string) => {
    const html = await locator.first().innerHTML();
    expect(html).toContain(expected);
  },
} as const;

const NUMBER_ASSERTIONS = {
  'has count': (locator: Locator, expected: number) => expect(locator).toHaveCount(expected),
} as const;

const KEY_VALUE_ASSERTIONS = {
  'has attribute': (locator: Locator, { key, value }: KeyValue) => {
    if (value === undefined) {
      return expect(locator).toHaveAttribute(key);
    }
    return expect(locator).toHaveAttribute(key, value);
  },
  'has css': (locator: Locator, { key, value }: KeyValue) => {
    if (value === undefined) {
      throw new Error('CSS condition requires "property=value" format');
    }
    return expect(locator).toHaveCSS(key, value);
  },
} as const;

export type StateCondition = keyof typeof STATE_ASSERTIONS;
export type StringCondition = keyof typeof STRING_ASSERTIONS;
export type NumberCondition = keyof typeof NUMBER_ASSERTIONS;
export type KeyValueCondition = keyof typeof KEY_VALUE_ASSERTIONS;
export type ValueCondition = StringCondition | NumberCondition | KeyValueCondition;
export type LocatorCondition = StateCondition | ValueCondition;

export const stateConditionNames = Object.keys(STATE_ASSERTIONS) as StateCondition[];

export async function assertCondition(
  locator: Locator,
  condition: LocatorCondition,
  rawExpected?: string,
  options?: { timeout?: number },
): Promise<void> {
  if (condition in STATE_ASSERTIONS) {
    const handler = STATE_ASSERTIONS[condition as StateCondition];
    await handler(locator.first(), options);
    return;
  }

  if (condition in STRING_ASSERTIONS) {
    const handler = STRING_ASSERTIONS[condition as StringCondition];
    if (rawExpected === undefined) {
      throw new Error(`Condition "${condition}" requires an expected value`);
    }
    await handler(locator.first(), rawExpected);
    return;
  }

  if (condition in NUMBER_ASSERTIONS) {
    const handler = NUMBER_ASSERTIONS[condition as NumberCondition];
    if (rawExpected === undefined) {
      throw new Error(`Condition "${condition}" requires a numeric value`);
    }
    const parsed = Number.parseInt(rawExpected, 10);
    if (!Number.isFinite(parsed)) {
      throw new Error(`Condition "${condition}" requires a numeric value, received "${rawExpected}"`);
    }
    await handler(locator, parsed);
    return;
  }

  if (condition in KEY_VALUE_ASSERTIONS) {
    const handler = KEY_VALUE_ASSERTIONS[condition as KeyValueCondition];
    if (rawExpected === undefined) {
      throw new Error(`Condition "${condition}" requires "key=value" argument`);
    }
    const keyValue = parseKeyValue(rawExpected);
    await handler(locator.first(), keyValue);
    return;
  }

  throw new Error(`Unsupported condition: ${condition}`);
}

function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseKeyValue(input: string): KeyValue {
  const match = /^(?<key>[^:=\s]+)\s*(?:[:=]\s*(?<value>.+))?$/.exec(input.trim());

  if (!match?.groups?.key) {
    throw new Error(`Expected "key=value" format, received "${input}"`);
  }

  const { key, value } = match.groups;
  return {
    key: key.trim(),
    value: value?.trim(),
  };
}

// Shared function for checking text content with status polling
export async function checkElementContainsText(page: Page, selector: string, expected: string, testData?: TestStore) {
  const renderedExpected = testData ? renderTemplate(expected, testData) : expected;
  const locator = getLocatorQuery(page, selector);
  try {
    await locator.first().waitFor({ state: 'attached', timeout: 10000 });
  } catch (error) {
    if (selector.includes("[data-check='")) {
      const snapshot = await page.evaluate(() =>
        Array.from(document.querySelectorAll('[data-check]')).map((el) => ({
          value: el.getAttribute('data-check'),
          text: el.textContent,
        })),
      );
      logger.info(
        `Wait for selector "${selector}" failed; available [data-check] elements: ${JSON.stringify(snapshot)}`,
      );
    }
    throw error;
  }
  // Handle placeholders like <YYYY-MM-DD> or <HH:mm:ss> - replace with regex pattern for date/time matching
  let expectedPattern = renderedExpected;
  if (renderedExpected.includes('<YYYY-MM-DD>')) {
    expectedPattern = renderedExpected.replace('<YYYY-MM-DD>', '\\d{4}-\\d{2}-\\d{2}(?: \\d{2}:\\d{2}:\\d{2})?');
    const actualText = await locator.first().textContent();
    const regex = new RegExp(expectedPattern);
    if (!regex.test(actualText || '')) {
      throw new Error(`Expected text to match pattern "${expectedPattern}", but got "${actualText}"`);
    }
    return;
  }
  if (renderedExpected.includes('<HH:mm:ss>')) {
    expectedPattern = renderedExpected.replace('<HH:mm:ss>', '\\d{2}:\\d{2}:\\d{2}');
    const actualText = await locator.first().textContent();
    const regex = new RegExp(expectedPattern);
    if (!regex.test(actualText || '')) {
      throw new Error(`Expected text to match pattern "${expectedPattern}", but got "${actualText}"`);
    }
    return;
  }
  let texts = await locator.allTextContents();
  if (texts.length === 0) {
    texts = await locator.evaluateAll((elements) =>
      elements.map((el) => {
        const htmlElement = el as HTMLElement;
        return htmlElement.innerText ?? el.textContent ?? '';
      }),
    );
  }
  const normalizedTexts = texts.map((text) => (text || '').replace(/\u00a0/g, ' '));
  if (texts.length === 0) {
    throw new Error(`Expected at least one element for selector "${selector}", but none found`);
  }
  if (!normalizedTexts.some((text) => text.includes(renderedExpected))) {
    throw new Error(
      `Expected any element matching "${selector}" to contain "${renderedExpected}", but texts were ${JSON.stringify(normalizedTexts)}`,
    );
  }
}
