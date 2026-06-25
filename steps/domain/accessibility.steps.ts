import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import { Then } from '@fixtures';
import { createLogger } from '@lib/logger';

const logger = createLogger('A11ySteps');

// axe impact levels ordered from least to most severe
const IMPACT_ORDER = ['minor', 'moderate', 'serious', 'critical'] as const;

/**
 * Step definition: `Then the page should have no accessibility violations of severity {string} or higher`.
 *
 * Runs axe-core against the current page and fails if any violation at or above
 * the given severity (minor < moderate < serious < critical) is present. All
 * violations are logged for visibility regardless of the threshold.
 *
 * @example
 * ```gherkin
 * Then the page should have no accessibility violations of severity "critical" or higher
 * ```
 */
Then(
  'the page should have no accessibility violations of severity {string} or higher',
  async ({ page }, minSeverity: string) => {
    const minIndex = IMPACT_ORDER.indexOf(minSeverity.toLowerCase() as (typeof IMPACT_ORDER)[number]);
    if (minIndex === -1) {
      throw new Error(`Unknown severity "${minSeverity}". Use one of: ${IMPACT_ORDER.join(', ')}.`);
    }

    // Cast: @axe-core/playwright bundles its own playwright-core types, which
    // are structurally identical but nominally distinct from the project's Page.
    const results = await new AxeBuilder({ page: page as never }).analyze();

    if (results.violations.length > 0) {
      const summary = results.violations
        .map((v) => `${v.impact ?? 'unknown'}: ${v.id} (${v.nodes.length} node(s))`)
        .join('\n  ');
      logger.info(`Accessibility violations on ${page.url()}:\n  ${summary}`);
    }

    const offending = results.violations.filter(
      (v) => IMPACT_ORDER.indexOf((v.impact ?? 'minor') as (typeof IMPACT_ORDER)[number]) >= minIndex,
    );

    expect(
      offending.map((v) => `${v.impact}: ${v.id}`),
      `Found accessibility violations at or above "${minSeverity}" severity`,
    ).toEqual([]);
  },
);
