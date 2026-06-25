import type { Expect, Locator, LocatorScreenshotOptions, Page, PageScreenshotOptions } from '@playwright/test';
import { expect as baseExpect } from '@playwright/test';
import { test as baseTest } from 'playwright-bdd';
import { PlaywrightDriver } from '@syngrisi/playwright-sdk';
// Types are inlined since @syngrisi/playwright-sdk/types may not be directly importable
import { getSuiteTitle, getTestTitle, log } from '@syngrisi/playwright-sdk/dist/lib/utils';
import { config } from './syngrisi.config';
import { getBrowserFullVersion, getBrowserVersion, getViewport } from '@syngrisi/playwright-sdk/dist/lib/pwHelpers';
import { UAParser } from 'ua-parser-js';
import { ensureSyngrisiServer } from './syngrisi-server';

export type CheckResult = {
  message: () => string;
  pass: boolean;
  name?: string;
  expected?: unknown;
  actual?: unknown;
};

export type VisualMatchOptions = (PageScreenshotOptions | LocatorScreenshotOptions) & {
  contentReadyTimeoutMs?: number;
  stabilityTimeoutMs?: number;
  stabilityIntervalMs?: number;
  toleranceThreshold?: number;
  fullPage?: boolean;
};

const isVisualChecksDisabled = String(process.env.DISABLE_VISUAL_CHECKS).toLowerCase() === 'true';

type ToMatchBaseline = (pwObj: Page | Locator, checkName: string, options?: VisualMatchOptions) => Promise<CheckResult>;

export let expect: Expect<{ toMatchBaseline: ToMatchBaseline }>;

function getPageFromPwObject(pwObj: Page | Locator): Page {
  return 'context' in pwObj ? pwObj : pwObj.page();
}

function generateCheckLink(checkId: string): string {
  return `🔗 ${config.baseUrl}?checkId=${checkId}&modalIsOpen=true`;
}

export const syngrisiFixture = baseTest.extend<{ syngrisi: PlaywrightDriver }>({
  syngrisi: async ({ page }, use, testInfo) => {
    if (isVisualChecksDisabled || testInfo.tags.some((tag: string) => tag === '@no-visual')) {
      const mockSyngrisi = {
        startTestSession: async () => {},
        stopTestSession: async () => {},
        check: async () => ({ status: 'skipped' }),
      } as unknown as PlaywrightDriver;

      expect = baseExpect.extend({
        async toMatchBaseline(
          pwObj: Page | Locator,
          checkName: string,
          options?: VisualMatchOptions,
        ): Promise<CheckResult> {
          const reason = isVisualChecksDisabled ? 'DISABLE_VISUAL_CHECKS' : '@no-visual tag';
          log.warn(`Visual check skipped due to ${reason}`);
          return {
            message: () => `Visual check skipped due to ${reason}`,
            pass: true,
          };
        },
      });

      await use(mockSyngrisi);
      return;
    }

    await ensureSyngrisiServer(config.baseUrl);

    const syngrisi = new PlaywrightDriver({
      page,
      url: config.baseUrl,
      apiKey: config.apiKey,
    });

    let viewportSize = page.viewportSize();
    if (!viewportSize) {
      viewportSize = await page.evaluate(() => ({
        width: window.innerWidth,
        height: window.innerHeight,
      }));
    }
    if (!viewportSize) throw new Error('Cannot get viewport size');

    const userAgent = await page.evaluate(() => navigator.userAgent);
    const browser = UAParser(userAgent).browser;
    const browserName = browser.name?.toLowerCase() || 'chromium';
    const fullVersion = browser.version || '0.0';

    await syngrisi.startTestSession({
      params: {
        app: config.project,
        branch: config.branch,
        browserName,
        browserVersion: getBrowserVersion(fullVersion),
        browserFullVersion: getBrowserFullVersion(fullVersion),
        os: 'WINDOWS',
        test: getTestTitle(testInfo),
        run: config.runName ?? 'local',
        runident: config.runIdent ?? `local-${Date.now()}`,
        suite: getSuiteTitle(testInfo) ?? 'default',
        viewport: await getViewport(viewportSize),
      },
    });

    expect = baseExpect.extend({
      async toMatchBaseline(pwObj: Page | Locator, checkName: string, options?: VisualMatchOptions) {
        try {
          const page: Page = getPageFromPwObject(pwObj);

          await page.waitForLoadState('load', { timeout: 20000 });

          // Wait for content stability
          if (options?.stabilityTimeoutMs) {
            await page.waitForTimeout(options.stabilityTimeoutMs);
          } else {
            await page.waitForTimeout(1200);
          }

          // Take screenshot
          let screenshot: Buffer;
          if ('context' in pwObj) {
            screenshot = await pwObj.screenshot({
              ...(options?.fullPage ? { fullPage: true } : {}),
            });
          } else {
            await pwObj.waitFor({ state: 'visible', timeout: 20000 });
            await pwObj.scrollIntoViewIfNeeded();
            screenshot = await pwObj.screenshot();
          }

          let currentViewport = page.viewportSize();
          if (!currentViewport) {
            currentViewport = await page.evaluate(() => ({
              width: window.innerWidth,
              height: window.innerHeight,
            }));
          }
          if (!currentViewport) throw new Error('Cannot get viewport size');

          const rawBrowserVersion = page.context().browser()?.version() || fullVersion;

          const result = await syngrisi.check({
            checkName,
            imageBuffer: screenshot,
            params: {
              viewport: await getViewport(currentViewport),
              os: 'WINDOWS',
              browserVersion: getBrowserVersion(rawBrowserVersion),
              browserFullVersion: getBrowserFullVersion(rawBrowserVersion),
              ...(typeof options?.toleranceThreshold === 'number'
                ? { toleranceThreshold: options.toleranceThreshold }
                : {}),
            },
          });

          const checkResult = result as any;
          const checkLink = generateCheckLink(checkResult._id);

          if (checkResult?.status?.includes?.('new')) {
            log.warn(`⚠️ Check: '${checkResult.name}' has "new" status. Please review and accept in Syngrisi UI.`);
            log.warn(checkLink);
          }

          const success = !checkResult.status?.includes?.('failed');
          return {
            message: () =>
              success
                ? `Check: '${checkName}' - success\n ${checkLink}`
                : `❌ Check: '${checkName}' - failed\n${checkLink}\n${JSON.stringify(checkResult.failReasons)}`,
            pass: success,
            ...(success ? {} : { name: 'toMatchBaseline', expected: 0, actual: checkResult }),
          };
        } catch (e: unknown) {
          log.error(`❌ ${e instanceof Error ? e.stack : e}`);
          throw e;
        }
      },
    });

    await use(syngrisi);
    await syngrisi.stopTestSession();
  },
});
