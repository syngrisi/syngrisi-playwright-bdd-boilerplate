import type { Page } from '@playwright/test';
import { Then, When } from '@fixtures';
import type { ElementAttribute, StepCondition } from '@params';
import { getLocator, getLocatorQuery } from '@helpers/locators';
import { assertCondition } from '@helpers/assertions';
import type { AriaRole } from '@helpers/types';
import { renderTemplate } from '@helpers/template';
import type { TestStore } from '@fixtures';

/**
 * Step definition: `When I wait on element {string} to not be displayed`.
 *
 * Provides a reusable Gherkin step for boilerplate and project test suites.
 * Keep debug messages and implementation comments in English.
 */
When('I wait on element {string} to not be displayed', async ({ page }, selector: string) => {
  await page.waitForFunction(
    (sel) => {
      const getNodes = () => {
        try {
          return Array.from(document.querySelectorAll(sel));
        } catch {
          const iterator = document.evaluate(sel, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
          const xpathNodes: Array<Node> = [];
          for (let i = 0; i < iterator.snapshotLength; i += 1) {
            const node = iterator.snapshotItem(i);
            if (node) xpathNodes.push(node);
          }
          return xpathNodes;
        }
      };
      const nodes = getNodes();
      return nodes.every((node) => {
        if (!(node instanceof HTMLElement)) return true;
        const style = window.getComputedStyle(node);
        return (
          style.display === 'none' ||
          style.visibility === 'hidden' ||
          node.offsetParent === null ||
          node.clientWidth === 0 ||
          node.clientHeight === 0
        );
      });
    },
    selector,
    { timeout: 30000 },
  );
});

/**
 * Step definition: `When I wait on element {string} to not exist`.
 *
 * Provides a reusable Gherkin step for boilerplate and project test suites.
 * Keep debug messages and implementation comments in English.
 */
When('I wait on element {string} to not exist', async ({ page }, selector: string) => {
  const locator = getLocatorQuery(page, selector);
  await locator.first().waitFor({ state: 'detached', timeout: 15000 });
});

/**
 * Step definition: `When I wait on element {string} to exist`.
 *
 * Provides a reusable Gherkin step for boilerplate and project test suites.
 * Keep debug messages and implementation comments in English.
 */
When('I wait on element {string} to exist', async ({ page }, selector: string) => {
  const locator = getLocatorQuery(page, selector);
  await locator.first().waitFor({ state: 'attached', timeout: 30000 });
});

/**
 * Step definition: `Then I wait on element {string}`.
 *
 * Provides a reusable Gherkin step for boilerplate and project test suites.
 * Keep debug messages and implementation comments in English.
 */
Then('I wait on element {string}', async ({ page }, selector: string) => {
  const locator = getLocatorQuery(page, selector);
  await locator.first().waitFor({ state: 'visible', timeout: 30000 });
});

/**
 * Step definition: `When I wait on element {string} to be {condition}`.
 *
 * Provides a reusable Gherkin step for boilerplate and project test suites.
 * Keep debug messages and implementation comments in English.
 */
When(
  'I wait on element {string} to be {condition}',
  async ({ page, testData }, selector: string, condition: StepCondition) => {
    const renderedSelector = renderTemplate(selector, testData);
    const locator = getLocatorQuery(page, renderedSelector);
    await assertCondition(locator, condition);
  },
);

/**
 * Waits for an element to reach a specific state.
 *
 * @example
 * ```gherkin
 * When I wait 5 seconds for the button with name "Submit" to be visible
 * When I wait 10 seconds for the element with locator "##flora-GridLayout" to be visible
 * ```
 */
When(
  'I wait {int} seconds for the {role} with {attribute} {string} to be {condition}',
  async (
    { page, testData }: { page: Page; testData: TestStore },
    timeoutInSeconds: number,
    role: AriaRole,
    attribute: ElementAttribute,
    value: string,
    condition: StepCondition,
  ) => {
    const locator = getLocator({
      page,
      role: role as AriaRole | 'element',
      attribute,
      value: testData.renderTemplate(value),
    });
    await assertCondition(locator, condition, undefined, { timeout: timeoutInSeconds * 1000 });
  },
);

/**
 * Waits for an element to not be displayed (hidden) with a specified timeout.
 *
 * @example
 * ```gherkin
 * When I wait 30 seconds for the element with locator "[data-test='folding-table-items']" to not be displayed
 * ```
 */
When(
  'I wait {int} seconds for the {role} with {attribute} {string} to not be displayed',
  async (
    { page, testData }: { page: Page; testData: TestStore },
    timeoutInSeconds: number,
    role: AriaRole,
    attribute: ElementAttribute,
    value: string,
  ) => {
    const locator = getLocator({
      page,
      role: role as AriaRole | 'element',
      attribute,
      value: testData.renderTemplate(value),
    });
    await locator.first().waitFor({ state: 'hidden', timeout: timeoutInSeconds * 1000 });
  },
);

/**
 * Step definition: `When I wait {int} seconds for the {role} with {attribute} {string} to not exist`.
 *
 * Provides a reusable Gherkin step for boilerplate and project test suites.
 * Keep debug messages and implementation comments in English.
 */
When(
  'I wait {int} seconds for the {role} with {attribute} {string} to not exist',
  async (
    { page, testData }: { page: Page; testData: TestStore },
    timeoutInSeconds: number,
    role: AriaRole,
    attribute: ElementAttribute,
    value: string,
  ) => {
    const locator = getLocator({
      page,
      role: role as AriaRole | 'element',
      attribute,
      value: testData.renderTemplate(value),
    });
    await locator.first().waitFor({ state: 'detached', timeout: timeoutInSeconds * 1000 });
  },
);

/**
 * Step definition: `When I wait {int} seconds for the {role} with {attribute} {string} to exist`.
 *
 * Provides a reusable Gherkin step for boilerplate and project test suites.
 * Keep debug messages and implementation comments in English.
 */
When(
  'I wait {int} seconds for the {role} with {attribute} {string} to exist',
  async (
    { page, testData }: { page: Page; testData: TestStore },
    timeoutInSeconds: number,
    role: AriaRole,
    attribute: ElementAttribute,
    value: string,
  ) => {
    const locator = getLocator({
      page,
      role: role as AriaRole | 'element',
      attribute,
      value: testData.renderTemplate(value),
    });
    await locator.first().waitFor({ state: 'attached', timeout: timeoutInSeconds * 1000 });
  },
);

/**
 * Waits for an element to reach a specific state with an additional timeout in milliseconds.
 * Note: The timeout in milliseconds overrides the timeout in seconds if provided.
 *
 * @example
 * ```gherkin
 * When I wait 30 seconds for the element with locator "[data-test='table-row-Message']" for 10000ms to be visible
 * ```
 */
When(
  'I wait {int} seconds for the {role} with {attribute} {string} for {ordinal} to be {condition}',
  async (
    { page, testData }: { page: Page; testData: TestStore },
    timeoutInSeconds: number,
    role: AriaRole,
    attribute: ElementAttribute,
    value: string,
    ordinalValue: number, // This is actually milliseconds (e.g., "10000ms"), but Playwright-BDD recognizes it as ordinal
    condition: StepCondition,
  ) => {
    const locator = getLocator({
      page,
      role: role as AriaRole | 'element',
      attribute,
      value: testData.renderTemplate(value),
    });
    // Extract milliseconds from ordinal value
    // Playwright-BDD's ordinal transformer extracts number and subtracts 1, so we need to add 1 back
    const timeoutMs = ordinalValue + 1;
    await assertCondition(locator, condition, undefined, { timeout: timeoutMs });
  },
);
