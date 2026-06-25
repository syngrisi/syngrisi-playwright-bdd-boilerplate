import type { Page } from '@playwright/test';

/**
 * Executes developer-authored JavaScript in the page context and returns its value.
 *
 * Trust boundary: `code` originates from step text written by the test author
 * (Gherkin / docstring), never from the application under test or untrusted
 * input, so evaluating it is intentional — this is a debugging/automation tool.
 *
 * A snippet containing `return` is wrapped in an IIFE so statements work; a bare
 * expression is evaluated directly. Centralized here so the three call sites
 * (navigation + polling steps) share one implementation.
 */
export async function evaluateInPage<T = unknown>(page: Page, code: string): Promise<T> {
  const trimmed = code.trim();
  const wrapped = trimmed.includes('return') ? `(() => { ${trimmed} })()` : trimmed;
  return page.evaluate((source) => eval(source), wrapped) as Promise<T>;
}
