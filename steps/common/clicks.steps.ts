import { When } from '@fixtures';
import type { ElementTarget } from '@params';
import { getLabelLocator, getLocatorQuery, getRoleLocator } from '@helpers/locators';
import type { AriaRole } from '@helpers/types';
import { renderTemplate } from '@helpers/template';

/**
 * Step definition: `When I click element with {target} {string}`
 *
 * Resolves either:
 * - a labelled control via `page.getByLabel`, or
 * - an arbitrary locator via `page.locator`.
 *
 * @param target - {@link ElementTarget} (`'label' | 'locator'`) provided by the `{target}` parameter.
 * @param rawValue - Label text or locator query identifying the element(s).
 *
 * @examples
 * ```gherkin
 * When I click element with label "Email"
 * When I click element with locator "//button[@type='submit']"
 * ```
 */
When('I click element with {target} {string}', async ({ page, testData }, target: ElementTarget, rawValue: string) => {
  const renderedValue = renderTemplate(rawValue, testData);

  if (target === 'label') {
    const locator = getLabelLocator(page, renderedValue);
    await locator.click();
    return;
  }

  if (target === 'locator') {
    const locator = getLocatorQuery(page, renderedValue);
    const targetLocator = locator.first();
    await targetLocator.waitFor({ state: 'visible', timeout: 15000 });

    // Use dispatchEvent for buttons with popover tooltips that can intercept clicks
    const isPopoverButton =
      /aria-label=['"](Remove|Delete|Accept)/i.test(renderedValue) ||
      /check-accept-icon|check-remove-icon/i.test(renderedValue) ||
      /Generate/i.test(renderedValue);

    if (isPopoverButton) {
      await targetLocator.dispatchEvent('click');
    } else {
      await targetLocator.click();
    }
    return;
  }

  throw new Error(`Unsupported target: ${target}`);
});

/**
 * Step definition: `When I click on the element {string} via js`.
 *
 * Provides a reusable Gherkin step for boilerplate and project test suites.
 * Keep debug messages and implementation comments in English.
 */
When('I click on the element {string} via js', async ({ page, testData }, selector: string) => {
  const rendered = testData.renderTemplate(selector);
  const locator = getLocatorQuery(page, rendered);
  const element = locator.first();
  await element.waitFor({ state: 'attached', timeout: 15000 });
  await element.evaluate((el: HTMLElement) => el.click());
});

/**
 * Step definition: `When I force click element with locator {string}`.
 *
 * Provides a reusable Gherkin step for boilerplate and project test suites.
 * Keep debug messages and implementation comments in English.
 */
When('I force click element with locator {string}', async ({ page, testData }, rawValue: string) => {
  const rendered = testData.renderTemplate(rawValue);
  const locator = getLocatorQuery(page, rendered);
  await locator.first().click({ force: true });
});

/**
 * Step definition: `When I real click element with locator {string}`.
 *
 * Provides a reusable Gherkin step for boilerplate and project test suites.
 * Keep debug messages and implementation comments in English.
 */
When('I real click element with locator {string}', async ({ page, testData }, rawValue: string) => {
  const rendered = testData.renderTemplate(rawValue);
  const locator = getLocatorQuery(page, rendered);
  await locator.first().click();
});

/**
 * Step definition: `When I click the {ordinal} {role} {string}`
 * Clicks on the Nth element of a given role and name.
 *
 * @param ordinal - Zero-based ordinal index supplied by `{ordinal}` (e.g. `1st` -> `0`).
 * @param role - {@link AriaRole} derived from the `{role}` parameter type.
 * @param name - Accessible name for the element.
 *
 * @example
 * ```gherkin
 * When I click the 1st button "Open Check"
 * ```
 */
When(
  'I click the {ordinal} {role} {string}',
  async ({ page, testData }, ordinal: number, role: AriaRole, name: string) => {
    const renderedName = renderTemplate(name, testData);
    const locator = getRoleLocator(page, role, renderedName, ordinal);
    await locator.click();
  },
);

/**
 * Step definition: `When I click {role} {string}`.
 *
 * Clicks an element resolved by ARIA role and accessible name (semantic locator).
 *
 * @param role - {@link AriaRole} derived from the `{role}` parameter type.
 * @param name - Accessible name for the element.
 *
 * @example
 * ```gherkin
 * When I click button "Submit"
 * When I click link "Dynamic ID"
 * ```
 */
When('I click {role} {string}', async ({ page, testData }, role: AriaRole, name: string) => {
  const renderedName = renderTemplate(name, testData);
  const locator = getRoleLocator(page, role, renderedName);
  await locator.click();
});

/**
 * Step definition: `When I safely click element with {target} {string}`.
 *
 * Provides a reusable Gherkin step for boilerplate and project test suites.
 * Keep debug messages and implementation comments in English.
 */
When(
  'I safely click element with {target} {string}',
  async ({ page, testData }, target: ElementTarget, rawValue: string) => {
    const renderedValue = renderTemplate(rawValue, testData);

    if (target === 'label') {
      const locator = getLabelLocator(page, renderedValue);
      await locator.click();
      return;
    }

    if (target === 'locator') {
      const locator = getLocatorQuery(page, renderedValue);
      const targetLocator = locator.first();
      await targetLocator.waitFor({ state: 'visible', timeout: 5000 });

      // Use JS click to bypass ALL interception/pointer-events issues
      await targetLocator.evaluate((e: HTMLElement) => e.click());
      return;
    }
    throw new Error(`Unsupported target: ${target}`);
  },
);

/**
 * Double-click an element
 */
When('I double click element with {target} {string}', async ({ page, testData }, target: string, rawValue: string) => {
  const rendered = testData.renderTemplate(rawValue);
  const locator = target === 'label' ? getLabelLocator(page, rendered) : getLocatorQuery(page, rendered);
  await locator.first().dblclick();
});

/**
 * Right-click an element (context menu)
 */
When('I right click element with {target} {string}', async ({ page, testData }, target: string, rawValue: string) => {
  const rendered = testData.renderTemplate(rawValue);
  const locator = target === 'label' ? getLabelLocator(page, rendered) : getLocatorQuery(page, rendered);
  await locator.first().click({ button: 'right' });
});

/**
 * Click on an element if it exists (no error if not found)
 */
When('I click on the element {string} if it exists', async ({ page, testData }, selector: string) => {
  const rendered = testData.renderTemplate(selector);
  const locator = getLocatorQuery(page, rendered);
  const count = await locator.count();
  if (count > 0) {
    await locator
      .first()
      .click({ timeout: 5000 })
      .catch(() => {});
  }
});

/**
 * Click on the element (alias for "I click element with locator")
 */
When('I click on the element {string}', async ({ page, testData }, selector: string) => {
  const rendered = testData.renderTemplate(selector);
  const locator = getLocatorQuery(page, rendered);
  await locator.first().click();
});
