import type { Locator, Page } from '@playwright/test';
import type { AriaRole } from '@helpers/types';
import type { ElementAttribute, ElementTarget } from '@params';

const ROLE_ALIASES: Record<string, AriaRole> = {
  button: 'button',
  link: 'link',
  heading: 'heading',
  textbox: 'textbox',
  checkbox: 'checkbox',
  combobox: 'combobox',
  navigation: 'navigation',
  banner: 'banner',
  listitem: 'listitem',
  list: 'list',
  option: 'option',
  tab: 'tab',
};

export function toAriaRole(rawRole: string): AriaRole {
  const normalized = rawRole.trim().toLowerCase();
  return ROLE_ALIASES[normalized] ?? (normalized as AriaRole);
}

export function getRoleLocator(page: Page, role: string, name: string, index?: number): Locator {
  const locator = page.getByRole(toAriaRole(role), { name, exact: true });
  return index !== undefined ? locator.nth(index) : locator;
}

export function getLabelLocator(page: Page, label: string, index?: number): Locator {
  const locator = page.getByLabel(label, { exact: true });
  return index !== undefined ? locator.nth(index) : locator;
}

export function getLocatorQuery(page: Page, locatorQuery: string, index?: number): Locator {
  // Convert WebdriverIO's *= syntax (tag*=text) to Playwright's :has-text() syntax
  const webdriverIOContainsPattern = /^([a-zA-Z0-9_-]+)\*=(.+)$/;
  const matchContains = locatorQuery.match(webdriverIOContainsPattern);

  // Convert WebdriverIO's = syntax (tag=text) to Playwright's :has-text() syntax
  const webdriverIOExactPattern = /^([a-zA-Z0-9_-]+)=(.+)$/;
  const matchExact = locatorQuery.match(webdriverIOExactPattern);

  let normalizedQuery: string;
  if (matchContains) {
    const [, tag, text] = matchContains;
    normalizedQuery = `${tag}:has-text('${text}')`;
  } else if (matchExact) {
    const [, tag, text] = matchExact;
    normalizedQuery = `${tag}:has-text('${text}')`;
  } else {
    normalizedQuery = locatorQuery;
  }

  const locator = page.locator(normalizedQuery);
  return index !== undefined ? locator.nth(index) : locator;
}

/**
 * Parse a selector that may end with [N] for nth-child selection.
 * Returns the locator with optional nth() applied.
 * Index in selector is 1-based, converted to 0-based internally.
 */
export function getLocatorWithIndex(page: Page, selector: string, defaultFirst = true): Locator {
  const nthMatch = selector.match(/\[(\d+)\]$/);
  const cleanSelector = selector.replace(/\[(\d+)\]$/, '');
  const locator = getLocatorQuery(page, cleanSelector);
  if (nthMatch) {
    return locator.nth(parseInt(nthMatch[1], 10) - 1);
  }
  return defaultFirst ? locator.first() : locator;
}

/**
 * Resolves a locator based on a {@link ElementTarget} descriptor extracted from `{target}`.
 *
 * @param page - Playwright {@link Page} instance from the step world.
 * @param target - `'label' | 'locator'` parsed by the `{target}` parameter type.
 * @param rawValue - Label text or locator query.
 * @param ordinal - Optional zero-based ordinal index provided by `{ordinal}` when present.
 */
export function locatorFromTarget(page: Page, target: ElementTarget, rawValue: string, ordinal?: number) {
  if (target === 'label') {
    return getLabelLocator(page, rawValue, ordinal);
  }

  if (target === 'locator') {
    return getLocatorQuery(page, rawValue, ordinal);
  }

  throw new Error(`Unsupported target: ${target}`);
}

/**
 * Resolves a locator based on role, attribute, and value.
 *
 * @param page - Playwright {@link Page} instance from the step world.
 * @param role - {@link AriaRole} or 'element' for generic locators.
 * @param attribute - {@link ElementAttribute} (`'name' | 'locator' | 'label'`).
 * @param value - The value of the attribute.
 */
export function getLocator({
  page,
  role,
  attribute,
  value,
}: {
  page: Page;
  role: AriaRole | 'element';
  attribute: ElementAttribute;
  value: string;
}): Locator {
  if ((role as string) === 'element') {
    if (attribute === 'locator') {
      return getLocatorQuery(page, value);
    }
    if (attribute === 'label') {
      return getLabelLocator(page, value);
    }
    throw new Error(`For role "element", attribute must be "locator" or "label", got "${attribute}"`);
  }

  if (attribute === 'name') {
    return getRoleLocator(page, role as AriaRole, value);
  }

  throw new Error(`For role "${role}", attribute must be "name", got "${attribute}"`);
}
