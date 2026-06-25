import { expect } from '@playwright/test';
import { When, Then } from '@fixtures';
import type { ElementTarget } from '@params';
import { getLabelLocator, getLocatorQuery, getRoleLocator } from '@helpers/locators';
import type { AriaRole } from '@helpers/types';
import { renderTemplate } from '@helpers/template';
import { createLogger } from '@lib/logger';

const logger = createLogger('ActionsSteps');

/**
 * Step definition: `When I fill {string} into element with {target} {string}`
 *
 * Filling is intentionally limited to label-based selectors to guarantee actionable form controls.
 *
 * @param value - Text to input into the resolved control.
 * @param target - {@link ElementTarget} captured via `{target}`; must be `'label'`.
 * @param rawValue - Label text identifying the control.
 *
 * @examples
 * ```gherkin
 * When I fill "john@example.com" into element with label "Email"
 * ```
 */
When(
  'I fill {string} into element with {target} {string}',
  async ({ page, testData }, value: string, target: ElementTarget, rawValue: string) => {
    const renderedValue = renderTemplate(value, testData);
    const renderedTarget = renderTemplate(rawValue, testData);

    if (target === 'label') {
      const locator = getLabelLocator(page, renderedTarget);
      await locator.fill(renderedValue);
      return;
    }

    if (target === 'locator') {
      const locator = getLocatorQuery(page, renderedTarget);
      await locator.fill(renderedValue);
      return;
    }

    throw new Error('Fill action expects target to be "label" or "locator"');
  },
);

/**
 * Step definition: `When I fill {string} into {ordinal} element with label {string}`
 *
 * @param value - Text to input into the control.
 * @param ordinal - Zero-based ordinal index resolved by `{ordinal}`.
 * @param label - Label text identifying the control.
 *
 * @example
 * ```gherkin
 * When I fill "42" into 2nd element with label "Quantity"
 * ```
 */
When(
  'I fill {string} into {ordinal} element with label {string}',
  async ({ page, testData }, value: string, ordinal: number, label: string) => {
    const renderedValue = renderTemplate(value, testData);
    const renderedLabel = renderTemplate(label, testData);
    const locator = getLabelLocator(page, renderedLabel, ordinal);
    await locator.fill(renderedValue);
  },
);

/**
 * Step definition: `When I fill {string} into {role} {string}`
 *
 * @param value - Text to input into the control.
 * @param role - {@link AriaRole} derived from `{role}`.
 * @param name - Accessible name identifying the control.
 *
 * @example
 * ```gherkin
 * When I fill "user" into textbox "Username"
 * ```
 */
When(
  'I fill {string} into {role} {string}',
  async ({ page, testData }, value: string, role: AriaRole, name: string) => {
    const renderedValue = renderTemplate(value, testData);
    const renderedName = renderTemplate(name, testData);
    const locator = getRoleLocator(page, role, renderedName);
    await locator.fill(renderedValue);
  },
);

/**
 * Step definition: `When I fill {string} into element with placeholder {string}`.
 *
 * Provides a reusable Gherkin step for boilerplate and project test suites.
 * Keep debug messages and implementation comments in English.
 */
When(
  'I fill {string} into element with placeholder {string}',
  async ({ page, testData }, value: string, placeholder: string) => {
    const renderedValue = renderTemplate(value, testData);
    const renderedPlaceholder = renderTemplate(placeholder, testData);
    await page.getByPlaceholder(renderedPlaceholder).fill(renderedValue);
  },
);

/**
 * Step definition: `Then the element with placeholder {string} should be visible for {int} sec`.
 *
 * Provides a reusable Gherkin step for boilerplate and project test suites.
 * Keep debug messages and implementation comments in English.
 */
Then(
  'the element with placeholder {string} should be visible for {int} sec',
  async ({ page, testData }, placeholder: string, seconds: number) => {
    const renderedPlaceholder = renderTemplate(placeholder, testData);
    await page.getByPlaceholder(renderedPlaceholder).waitFor({ state: 'visible', timeout: seconds * 1000 });
  },
);

/**
 * Step definition: `When I select the option with the text {string} for element {string}`.
 *
 * Provides a reusable Gherkin step for boilerplate and project test suites.
 * Keep debug messages and implementation comments in English.
 */
When(
  'I select the option with the text {string} for element {string}',
  async ({ page, testData }, optionText: string, selector: string) => {
    const renderedSelector = renderTemplate(selector, testData);
    const renderedOptionText = renderTemplate(optionText, testData);
    // Extract index before passing to getLocatorQuery (it may strip the index)
    const nthMatch = renderedSelector.match(/\[(\d+)\]$/);
    const selectorWithoutIndex = renderedSelector.replace(/\[(\d+)\]$/, '');
    const locator = getLocatorQuery(page, selectorWithoutIndex);
    const targetLocator = nthMatch
      ? locator.nth(parseInt(nthMatch[1], 10) - 1) // Convert 1-based to 0-based
      : locator.first();

    // Wait for element to be visible and attached
    await targetLocator.waitFor({ state: 'visible', timeout: 10000 });
    await targetLocator.waitFor({ state: 'attached', timeout: 5000 });

    // Try selectOption first, if it fails, try clicking the select and then the option
    try {
      await targetLocator.selectOption({ label: renderedOptionText });
    } catch (_error) {
      // If selectOption fails, try clicking the select and then clicking the option div
      await targetLocator.click();
      await page.waitForTimeout(500); // Wait for dropdown to open
      const optionLocator = page.locator(`div:has-text('${renderedOptionText}')`).first();
      await optionLocator.waitFor({ state: 'visible', timeout: 5000 });
      await optionLocator.click();
    }
  },
);

/**
 * Step definition: `When I select dropdown option {string} by clicking div for element {string}`
 *
 * This step is specifically designed for custom dropdown components that don't work with standard selectOption.
 * It clicks on the select element to open the dropdown, then clicks on the div option, and also sets the value
 * via selectOption as a fallback to ensure the value is properly set.
 *
 * @param optionText - Text of the option to select
 * @param selector - Selector for the select element
 *
 * @example
 * ```gherkin
 * When I select dropdown option "Failed" by clicking div for element "[data-test='table-filter-value']"
 * ```
 */
When(
  'I select dropdown option {string} by clicking div for element {string}',
  async ({ page, testData }, optionText: string, selector: string) => {
    const renderedSelector = renderTemplate(selector, testData);
    const renderedOptionText = renderTemplate(optionText, testData);

    // Get the select element
    const selectLocator = getLocatorQuery(page, renderedSelector);
    await selectLocator.first().waitFor({ state: 'visible', timeout: 10000 });
    await selectLocator.first().waitFor({ state: 'attached', timeout: 5000 });

    // Click on select to open dropdown
    await selectLocator.first().click();
    await page.waitForTimeout(500); // Wait for dropdown to open

    // Click on the div option - prioritize role="option" to match actual dropdown items
    // and avoid matching parent containers with common text like "false"
    // Use try-catch to attempt specific selector first
    const roleOptionSelector = `[role="option"]:has-text("${renderedOptionText}")`;
    const genericDivSelector = `div:has-text("${renderedOptionText}")`;

    try {
      const optionLocator = page.locator(roleOptionSelector).first();
      await optionLocator.waitFor({ state: 'visible', timeout: 2000 });
      await optionLocator.click();
    } catch (_e) {
      logger.warn(`Could not find role="option" with text "${renderedOptionText}", falling back to generic div`);
      const optionLocator = page.locator(genericDivSelector).first();
      await optionLocator.waitFor({ state: 'visible', timeout: 5000 });
      await optionLocator.click();
    }

    // Also set value via selectOption as fallback to ensure value is properly set
    try {
      await page.waitForTimeout(300); // Small delay to ensure dropdown closed
      await selectLocator.first().selectOption({ label: renderedOptionText });
    } catch (_error) {
      // If selectOption fails, that's okay - we already clicked the div
      logger.debug(`selectOption fallback failed for "${renderedOptionText}", but div click succeeded`);
    }
  },
);

/**
 * Step definition: `When I set {string} to the inputfield {string}`.
 *
 * Provides a reusable Gherkin step for boilerplate and project test suites.
 * Keep debug messages and implementation comments in English.
 */
When('I set {string} to the inputfield {string}', async ({ page, testData }, value: string, selector: string) => {
  const renderedValue = renderTemplate(value, testData);
  const renderedSelector = renderTemplate(selector, testData);
  const locator = getLocatorQuery(page, renderedSelector);
  await locator.first().fill(renderedValue);
});

/**
 * Upload a file to an input element
 */
When('I upload file {string} to element {string}', async ({ page, testData }, filePath: string, selector: string) => {
  const renderedPath = testData.renderTemplate(filePath);
  const renderedSelector = testData.renderTemplate(selector);
  await page.locator(renderedSelector).setInputFiles(renderedPath);
});

/**
 * Clear an input element
 */
When('I clear element with {target} {string}', async ({ page, testData }, target: string, rawValue: string) => {
  const rendered = testData.renderTemplate(rawValue);
  const locator = target === 'label' ? getLabelLocator(page, rendered) : getLocatorQuery(page, rendered);
  await locator.first().clear();
});

/**
 * Focus an element
 */
When('I focus element with {target} {string}', async ({ page, testData }, target: string, rawValue: string) => {
  const rendered = testData.renderTemplate(rawValue);
  const locator = target === 'label' ? getLabelLocator(page, rendered) : getLocatorQuery(page, rendered);
  await locator.first().focus();
});

/**
 * Check multiple element attributes from a data table.
 * Table columns: | name/type | selector | attribute | value |
 */
Then('I check elements attributes:', async ({ page, testData }, dataTable: any) => {
  const rows = dataTable.hashes();
  for (const row of rows) {
    const selector = testData.renderTemplate(row.selector);
    const attribute = row.attribute;
    const expected = row.value;
    const locator = getLocatorQuery(page, selector);
    await expect(locator.first()).toHaveAttribute(attribute, expected);
  }
});
