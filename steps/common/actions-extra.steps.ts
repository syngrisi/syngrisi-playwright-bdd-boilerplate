import { When } from '@fixtures';
import { getLocatorQuery } from '@helpers/locators';
import { renderTemplate } from '@helpers/template';

/**
 * Step definition: `When I select the option with the value {string} for element {string}`.
 *
 * Provides a reusable Gherkin step for boilerplate and project test suites.
 * Keep debug messages and implementation comments in English.
 */
When(
  'I select the option with the value {string} for element {string}',
  async ({ page, testData }, optionValue: string, selector: string) => {
    const renderedSelector = renderTemplate(selector, testData);
    const renderedOptionValue = renderTemplate(optionValue, testData);

    const locator = getLocatorQuery(page, renderedSelector);
    const targetLocator = locator.first();

    // Wait for element to be visible and attached
    await targetLocator.waitFor({ state: 'attached', timeout: 5000 });

    // Use selectOption with value
    await targetLocator.selectOption({ value: renderedOptionValue });
  },
);
