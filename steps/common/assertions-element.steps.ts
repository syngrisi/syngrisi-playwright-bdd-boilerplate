import { Then } from '@fixtures';
import { expect } from '@playwright/test';
import type { ElementTarget, ExpectationCondition, StepCondition } from '@params';
import { getLocatorQuery, getRoleLocator, locatorFromTarget } from '@helpers/locators';
import { assertCondition, checkElementContainsText } from '@helpers/assertions';
import type { AriaRole } from '@helpers/types';
import { renderTemplate } from '@helpers/template';

/**
 * Step definition: `Then the {role} {string} should be {condition}`
 *
 * @param role - {@link AriaRole} derived from the `{role}` parameter type.
 * @param name - Accessible name for the element.
 * @param condition - {@link StepCondition} value (e.g. `'visible'`, `'enabled'`).
 *
 * @example
 * ```gherkin
 * Then the button "Save" should be visible
 * ```
 */
Then(
  'the {role} {string} should be {condition}',
  async ({ page, testData }, role: AriaRole, name: string, condition: StepCondition) => {
    const renderedName = renderTemplate(name, testData);
    const locator = getRoleLocator(page, role, renderedName);
    await assertCondition(locator, condition);
  },
);

/**
 * Step definition: `Then the {role} {string} should be {condition} for {int} sec`
 *
 * @param role - {@link AriaRole} derived from the `{role}` parameter type.
 * @param name - Accessible name for the element.
 * @param condition - {@link StepCondition} value (e.g. `'visible'`, `'enabled'`).
 * @param seconds - Number of seconds to wait for the condition.
 *
 * @example
 * ```gherkin
 * Then the button "Save" should be visible for 5 sec
 * ```
 */
Then(
  'the {role} {string} should be {condition} for {int} sec',
  async ({ page, testData }, role: AriaRole, name: string, condition: StepCondition, seconds: number) => {
    const renderedName = renderTemplate(name, testData);
    const locator = getRoleLocator(page, role, renderedName);
    await assertCondition(locator, condition, undefined, { timeout: seconds * 1000 });
  },
);

/**
 * Step definition: `Then the {ordinal} {role} {string} should be {condition}`
 *
 * @param ordinal - Zero-based ordinal index supplied by `{ordinal}` (e.g. `3rd` -> `2`).
 * @param role - {@link AriaRole} derived from the `{role}` parameter type.
 * @param name - Accessible name for the target element.
 * @param condition - {@link StepCondition} to evaluate (e.g. `'visible'`, `'checked'`).
 *
 * @example
 * ```gherkin
 * Then the 3rd checkbox "Select item" should be checked
 * ```
 */
Then(
  'the {ordinal} {role} {string} should be {condition}',
  async ({ page }, ordinal: number, role: AriaRole, name: string, condition: StepCondition) => {
    const locator = getRoleLocator(page, role, name, ordinal);
    await assertCondition(locator, condition);
  },
);

/**
 * Step definition: `Then the element with {target} {string} should be {condition}`
 *
 * @param target - {@link ElementTarget} (`'label' | 'locator'`).
 * @param rawValue - Label text or locator query that identifies the element.
 * @param condition - {@link StepCondition} to evaluate against the resolved locator.
 *
 * @example
 * ```gherkin
 * Then the element with label "Email" should be enabled
 * ```
 */
Then(
  'the element with {target} {string} should be {condition}',
  async ({ page }, target: ElementTarget, rawValue: string, condition: StepCondition) => {
    const locator = locatorFromTarget(page, target, rawValue);
    await assertCondition(locator, condition);
  },
);

/**
 * Step definition: `Then the element with {target} {string} should not be {condition}`
 *
 * @param target - {@link ElementTarget} (`'label' | 'locator'`).
 * @param rawValue - Label text or locator query that identifies the element.
 * @param condition - {@link StepCondition} to evaluate against the resolved locator.
 *
 * @example
 * ```gherkin
 * Then the element with locator "[data-test='modal']" should not be visible
 * ```
 */
Then(
  'the element with {target} {string} should not be {condition}',
  async ({ page }, target: ElementTarget, rawValue: string, condition: StepCondition) => {
    const locator = locatorFromTarget(page, target, rawValue);
    // Map "not be {condition}" to corresponding negative conditions
    const negativeConditionMap: Record<string, StepCondition> = {
      visible: 'hidden',
      enabled: 'disabled',
      checked: 'unchecked',
      attached: 'detached',
      present: 'absent',
      focused: 'blurred',
      editable: 'readonly',
      empty: 'empty', // empty doesn't have a direct negative, but we can check for non-empty
    };

    const negativeCondition = negativeConditionMap[condition];
    if (negativeCondition) {
      await assertCondition(locator, negativeCondition);
    } else {
      // Fallback: use direct negation for conditions not in the map
      if (condition === 'visible') {
        await expect(locator.first()).not.toBeVisible();
      } else if (condition === 'enabled') {
        await expect(locator.first()).toBeDisabled();
      } else if (condition === 'checked') {
        await expect(locator.first()).not.toBeChecked();
      } else {
        throw new Error(`Unsupported "not be" condition: ${condition}`);
      }
    }
  },
);

/**
 * Step definition: `Then the element with {target} {string} should be {condition} for {int} sec`
 *
 * @param target - {@link ElementTarget} (`'label' | 'locator'`).
 * @param rawValue - Label text or locator query that identifies the element.
 * @param condition - {@link StepCondition} to evaluate against the resolved locator.
 * @param seconds - Number of seconds to wait for the condition.
 *
 * @example
 * ```gherkin
 * Then the element with label "Loading" should be visible for 10 sec
 * ```
 */
Then(
  'the element with {target} {string} should be {condition} for {int} sec',
  async ({ page }, target: ElementTarget, rawValue: string, condition: StepCondition, seconds: number) => {
    const locator = locatorFromTarget(page, target, rawValue);
    await assertCondition(locator, condition, undefined, { timeout: seconds * 1000 });
  },
);

/**
 * Step definition: `Then the {ordinal} element with {target} {string} should be {condition}`
 *
 * @param ordinal - Zero-based ordinal index supplied by `{ordinal}`.
 * @param target - {@link ElementTarget} specifying resolution strategy.
 * @param rawValue - Label text or locator query used to find the element set.
 * @param condition - {@link StepCondition} to evaluate.
 *
 * @example
 * ```gherkin
 * Then the 2nd element with locator ".todo-item" should be visible
 * ```
 */
Then(
  'the {ordinal} element with {target} {string} should be {condition}',
  async ({ page }, ordinal: number, target: ElementTarget, rawValue: string, condition: StepCondition) => {
    const locator = locatorFromTarget(page, target, rawValue, ordinal);
    await assertCondition(locator, condition);
  },
);

/**
 * Step definition: `Then the {role} {string} should have text {string}`
 *
 * Retained for readability alongside the generic `{valueCondition}` variant.
 *
 * @param role - {@link AriaRole} derived from `{role}`.
 * @param name - Accessible name bound to the element.
 * @param expected - Exact text expected for the locator.
 *
 * @example
 * ```gherkin
 * Then the heading "Welcome" should have text "Welcome"
 * ```
 */
Then(
  'the {role} {string} should have text {string}',
  async ({ page }, role: AriaRole, name: string, expected: string) => {
    const locator = getRoleLocator(page, role, name);
    await assertCondition(locator, 'has text', expected);
  },
);

/**
 * Step definition: `Then the {ordinal} {role} {string} should have text {string}`
 *
 * @param ordinal - Zero-based ordinal index from the `{ordinal}` parameter.
 * @param role - {@link AriaRole} derived from `{role}`.
 * @param name - Accessible name for the element.
 * @param expected - Exact text expected for the locator.
 *
 * @example
 * ```gherkin
 * Then the 2nd button "Remove" should have text "Remove"
 * ```
 */
Then(
  'the {ordinal} {role} {string} should have text {string}',
  async ({ page }, ordinal: number, role: AriaRole, name: string, expected: string) => {
    const locator = getRoleLocator(page, role, name, ordinal);
    await assertCondition(locator, 'has text', expected);
  },
);

/**
 * Step definition: `Then the element with {target} {string} should have text {string}`
 *
 * @param target - {@link ElementTarget} representing either a label lookup or raw locator.
 * @param rawValue - Label text or locator query.
 * @param expected - Exact text expected for the locator.
 *
 * @example
 * ```gherkin
 * Then the element with locator "//h1" should have text "Welcome"
 * ```
 */
Then(
  'the element with {target} {string} should have text {string}',
  async ({ page }, target: ElementTarget, rawValue: string, expected: string) => {
    const locator = locatorFromTarget(page, target, rawValue);
    await assertCondition(locator, 'has text', expected);
  },
);

/**
 * Step definition: `Then the element with {target} {string} should have value {string}`
 *
 * Asserts the form control's current value using a label or raw locator.
 *
 * @param target - {@link ElementTarget} representing either a label lookup or raw locator.
 * @param rawValue - Label text or locator query identifying the element.
 * @param expected - Exact value expected for the element.
 *
 * @example
 * ```gherkin
 * Then the element with label "Email" should have value "user@example.com"
 * ```
 */
Then(
  'the element with {target} {string} should have value {string}',
  async ({ page, testData }, target: ElementTarget, rawValue: string, expected: string) => {
    const renderedTarget = testData ? renderTemplate(rawValue, testData) : rawValue;
    const renderedExpected = testData ? renderTemplate(expected, testData) : expected;

    if (target === 'locator') {
      // Extract index before passing to getLocatorQuery (it may strip the index)
      const nthMatch = renderedTarget.match(/(\d+)$/);
      const selectorWithoutIndex = renderedTarget.replace(/(\d+)$/, '');
      const locator = getLocatorQuery(page, selectorWithoutIndex);
      if (nthMatch) {
        const index = parseInt(nthMatch[1], 10) - 1; // Convert 1-based to 0-based
        const targetLocator = locator.nth(index);
        // Wait for element to be visible and attached before checking value
        await targetLocator.waitFor({ state: 'visible', timeout: 10000 });
        await targetLocator.waitFor({ state: 'attached', timeout: 5000 });
        await expect(targetLocator).toHaveValue(renderedExpected);
      } else {
        await expect(locator.first()).toHaveValue(renderedExpected);
      }
    } else {
      const locator = locatorFromTarget(page, target, renderedTarget);
      await assertCondition(locator, 'has value', renderedExpected);
    }
  },
);

/**
 * Step definition: `Then the element with {target} {string} should contain value {string}`.
 *
 * Provides a reusable Gherkin step for boilerplate and project test suites.
 * Keep debug messages and implementation comments in English.
 */
Then(
  'the element with {target} {string} should contain value {string}',
  async ({ page, testData }, target: ElementTarget, rawValue: string, expected: string) => {
    const renderedTarget = testData ? renderTemplate(rawValue, testData) : rawValue;
    const renderedExpected = testData ? renderTemplate(expected, testData) : expected;
    const locator = locatorFromTarget(page, target, renderedTarget);
    // Wait for element to be visible
    await locator.first().waitFor({ state: 'visible', timeout: 10000 });
    const value = await locator.inputValue();
    expect(value).toContain(renderedExpected);
  },
);

/**
 * Step definition: `Then the element with {target} {string} should have contains text {string}`
 *
 * Uses checkElementContainsText for locator targets to support polling and date placeholders.
 * For label targets, uses assertCondition for simpler behavior.
 *
 * @param target - {@link ElementTarget} representing either a label lookup or raw locator.
 * @param rawValue - Label text or locator query.
 * @param expected - Partial text expected within the resolved element.
 *
 * @example
 * ```gherkin
 * Then the element with label "Status" should have contains text "Pending"
 * Then the element with locator "[data-test='status']" should have contains text "Pending"
 * ```
 */
Then(
  'the element with {target} {string} should have contains text {string}',
  async ({ page, testData }, target: ElementTarget, rawValue: string, expected: string) => {
    if (target === 'locator') {
      // Use checkElementContainsText for locator targets to support polling and date placeholders
      await checkElementContainsText(page, rawValue, expected, testData);
    } else {
      // Use assertCondition for label targets
      const locator = locatorFromTarget(page, target, rawValue);
      await assertCondition(locator, 'contains text', expected);
    }
  },
);

/**
 * Step definition: `Then the {role} {string} should have contains text {string}`.
 *
 * Provides a reusable Gherkin step for boilerplate and project test suites.
 * Keep debug messages and implementation comments in English.
 */
Then(
  'the {role} {string} should have contains text {string}',
  async ({ page }, role: AriaRole, name: string, expected: string) => {
    const locator = getRoleLocator(page, role, name);
    await assertCondition(locator, 'contains text', expected);
  },
);

/**
 * Step definition: `Then the {ordinal} element with {target} {string} should have text {string}`
 *
 * @param ordinal - Zero-based ordinal index from `{ordinal}`.
 * @param target - {@link ElementTarget} used to resolve the locator.
 * @param rawValue - Label text or locator query.
 * @param expected - Exact text expected for the locator.
 *
 * @example
 * ```gherkin
 * Then the 3rd element with label "Todo" should have text "Finish docs"
 * ```
 */
Then(
  'the {ordinal} element with {target} {string} should have text {string}',
  async ({ page }, ordinal: number, target: ElementTarget, rawValue: string, expected: string) => {
    const locator = locatorFromTarget(page, target, rawValue, ordinal);
    await assertCondition(locator, 'has text', expected);
  },
);

/**
 * Step definition: `Then the element with {target} {string} should not have attribute {string}`.
 *
 * Provides a reusable Gherkin step for boilerplate and project test suites.
 * Keep debug messages and implementation comments in English.
 */
Then(
  'the element with {target} {string} should not have attribute {string}',
  async ({ page }, target: ElementTarget, rawValue: string, attributeName: string) => {
    const locator = locatorFromTarget(page, target, rawValue);
    await expect(locator.first()).not.toHaveAttribute(attributeName);
  },
);

/**
 * Step definition: `Then the element with {target} {string} should not have attribute {string} {string}`.
 *
 * Provides a reusable Gherkin step for boilerplate and project test suites.
 * Keep debug messages and implementation comments in English.
 */
Then(
  'the element with {target} {string} should not have attribute {string} {string}',
  async ({ page }, target: ElementTarget, rawValue: string, attributeName: string, expected: string) => {
    const locator = locatorFromTarget(page, target, rawValue);
    await expect(locator.first()).not.toHaveAttribute(attributeName, expected, { timeout: 15000 });
  },
);

/**
 * Step definition: `Then the element with {target} {string} should have attribute {string} {string}`.
 *
 * Provides a reusable Gherkin step for boilerplate and project test suites.
 * Keep debug messages and implementation comments in English.
 */
Then(
  'the element with {target} {string} should have attribute {string} {string}',
  async ({ page }, target: ElementTarget, rawValue: string, attributeName: string, expected: string) => {
    const locator = locatorFromTarget(page, target, rawValue);
    await expect(locator.first()).toHaveAttribute(attributeName, expected, { timeout: 15000 });
  },
);

/**
 * Step definition: `Then the element with {target} {string} should have has attribute {string}`.
 *
 * Provides a reusable Gherkin step for boilerplate and project test suites.
 * Keep debug messages and implementation comments in English.
 */
Then(
  'the element with {target} {string} should have has attribute {string}',
  async ({ page }, target: ElementTarget, rawValue: string, attributeValue: string) => {
    const locator = locatorFromTarget(page, target, rawValue);
    await assertCondition(locator, 'has attribute', attributeValue);
  },
);

/**
 * Step definition: `Then the element with {target} {string} should have contains HTML {string}`.
 *
 * Provides a reusable Gherkin step for boilerplate and project test suites.
 * Keep debug messages and implementation comments in English.
 */
Then(
  'the element with {target} {string} should have contains HTML {string}',
  async ({ page }, target: ElementTarget, rawValue: string, expected: string) => {
    const locator = locatorFromTarget(page, target, rawValue);
    await assertCondition(locator, 'contains HTML', expected);
  },
);

/**
 * Step definition: `Then the element with {target} {string} should have has class {string}`.
 *
 * Provides a reusable Gherkin step for boilerplate and project test suites.
 * Keep debug messages and implementation comments in English.
 */
Then(
  'the element with {target} {string} should have has class {string}',
  async ({ page }, target: ElementTarget, rawValue: string, className: string) => {
    const locator = locatorFromTarget(page, target, rawValue);
    await assertCondition(locator, 'has class', className);
  },
);

/**
 * Step definition: `Then the table containing {string} should be {condition}`
 *
 * Checks if a table containing specific text has a specified condition.
 *
 * @example
 * ```gherkin
 * Then the table containing "This is line 1" should be visible
 * Then the table containing "Some text" should be absent
 * ```
 */
Then(
  'the table containing {string} should be {condition}',
  async ({ page }, text: string, condition: ExpectationCondition) => {
    const locator = page.getByRole('table').filter({ hasText: text });
    await assertCondition(locator, condition);
  },
);

/**
 * Step definition: `Then the element {string} matches the text {string}`.
 *
 * Provides a reusable Gherkin step for boilerplate and project test suites.
 * Keep debug messages and implementation comments in English.
 */
Then('the element {string} matches the text {string}', async ({ page }, selector: string, expected: string) => {
  const locator = getLocatorQuery(page, selector);
  const visibleText = await locator.first().innerText();
  await expect(visibleText).toBe(expected);
});

/**
 * Step definition: `Then the element {string} does not exist`.
 *
 * Provides a reusable Gherkin step for boilerplate and project test suites.
 * Keep debug messages and implementation comments in English.
 */
Then('the element {string} does not exist', async ({ page }, selector: string) => {
  const locator = getLocatorQuery(page, selector);
  await expect(locator.first()).toHaveCount(0);
});

/**
 * Step definition: `Then the element {string} contains the text {string}`.
 *
 * Provides a reusable Gherkin step for boilerplate and project test suites.
 * Keep debug messages and implementation comments in English.
 */
Then('the element {string} contains the text {string}', async ({ page }, selector: string, expected: string) => {
  const locator = getLocatorQuery(page, selector);
  await expect(locator.first()).toContainText(expected);
});

/**
 * Step definition: `Then the {role} {string} should not be {condition}`
 *
 * Verifies that an element with specified role and name does NOT satisfy the condition.
 *
 * @example
 * ```gherkin
 * Then the button "Baselines" should not be visible
 * ```
 */
Then(
  'the {role} {string} should not be {condition}',
  async ({ page, testData }, role: AriaRole, name: string, condition: StepCondition) => {
    const renderedName = renderTemplate(name, testData);
    const locator = getRoleLocator(page, role, renderedName);
    // Invert the condition check
    if (condition === 'visible') {
      await expect(locator).not.toBeVisible();
    } else if (condition === 'enabled') {
      await expect(locator).not.toBeEnabled();
    } else if (condition === 'checked') {
      await expect(locator).not.toBeChecked();
    } else if (condition === 'disabled') {
      await expect(locator).not.toBeDisabled();
    } else {
      throw new Error(`Unsupported negated condition: ${condition}`);
    }
  },
);

/**
 * Step definition: `Then the text {string} should be {condition}`
 *
 * Verifies that text is visible on the page.
 *
 * @example
 * ```gherkin
 * Then the text "Welcome" should be visible
 * ```
 */
Then('the text {string} should be {condition}', async ({ page, testData }, text: string, condition: StepCondition) => {
  const renderedText = renderTemplate(text, testData);
  const locator = page.getByText(renderedText, { exact: false });
  await assertCondition(locator, condition);
});

/**
 * Step definition: `Then the text {string} should not be {condition}`
 *
 * Verifies that text is NOT visible on the page.
 *
 * @example
 * ```gherkin
 * Then the text "Error" should not be visible
 * ```
 */
Then(
  'the text {string} should not be {condition}',
  async ({ page, testData }, text: string, condition: StepCondition) => {
    const renderedText = renderTemplate(text, testData);
    const locator = page.getByText(renderedText, { exact: false });
    // Invert the condition check
    if (condition === 'visible') {
      await expect(locator).not.toBeVisible();
    } else if (condition === 'enabled') {
      await expect(locator).not.toBeEnabled();
    } else {
      throw new Error(`Unsupported negated condition for text: ${condition}`);
    }
  },
);
