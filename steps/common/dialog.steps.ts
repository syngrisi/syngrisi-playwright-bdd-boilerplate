import { When } from '@fixtures';
import { expect } from '@playwright/test';
import { createLogger } from '@lib/logger';

const logger = createLogger('DialogSteps');

/**
 * Step definition: `When I prepare to accept confirmation dialog with text {string}`.
 *
 * Provides a reusable Gherkin step for boilerplate and project test suites.
 * Keep debug messages and implementation comments in English.
 */
When('I prepare to accept confirmation dialog with text {string}', async ({ page }, text: string) => {
  logger.info(`Preparing to accept dialog with text: "${text}"`);
  page.once('dialog', async (dialog) => {
    logger.info(`Dialog appeared with message: "${dialog.message()}"`);
    expect(dialog.message()).toContain(text);
    await dialog.accept();
    logger.info('Dialog accepted');
  });
});

/**
 * Step definition: `When I prepare to dismiss confirmation dialog with text {string}`.
 *
 * Provides a reusable Gherkin step for boilerplate and project test suites.
 * Keep debug messages and implementation comments in English.
 */
When('I prepare to dismiss confirmation dialog with text {string}', async ({ page }, text: string) => {
  logger.info(`Preparing to dismiss dialog with text: "${text}"`);
  page.once('dialog', async (dialog) => {
    logger.info(`Dialog appeared with message: "${dialog.message()}"`);
    expect(dialog.message()).toContain(text);
    await dialog.dismiss();
    logger.info('Dialog dismissed');
  });
});

/**
 * Step definition: `When I prepare to accept next dialog`.
 *
 * Accepts the next dialog (alert/confirm/prompt) regardless of its text.
 * Useful when the dialog message is unknown in advance.
 */
When('I prepare to accept next dialog', async ({ page }) => {
  logger.info('Preparing to accept the next dialog (any text)');
  page.once('dialog', async (dialog) => {
    logger.info(`Dialog appeared with message: "${dialog.message()}"`);
    await dialog.accept();
    logger.info('Dialog accepted');
  });
});

/**
 * Step definition: `When I prepare to dismiss next dialog`.
 *
 * Dismisses the next dialog (alert/confirm/prompt) regardless of its text.
 */
When('I prepare to dismiss next dialog', async ({ page }) => {
  logger.info('Preparing to dismiss the next dialog (any text)');
  page.once('dialog', async (dialog) => {
    logger.info(`Dialog appeared with message: "${dialog.message()}"`);
    await dialog.dismiss();
    logger.info('Dialog dismissed');
  });
});
