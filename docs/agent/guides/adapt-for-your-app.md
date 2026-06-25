# Adapting the Boilerplate for Your App

This boilerplate ships pointed at the example site `https://the-internet.herokuapp.com`. Follow these steps to retarget it at a real application. Steps 1, 3, and 4 are required; the rest are optional.

## 1. Set your base URL

Override `E2E_BASE_URL`. The default lives in [`config.ts`](../../../config.ts); for local overrides create a `.env` from `.env.example` (never commit `.env`).

```bash
# .env
E2E_BASE_URL=https://staging.myapp.com
```

In features, always reference it via the `<baseUrl>` template instead of hardcoding URLs — it is resolved from `E2E_BASE_URL` by the `test-data` fixture.

```gherkin
When I open site "<baseUrl>"
When I open url "<baseUrl>/login"
```

## 2. Wire a real app server (optional)

[`support/fixtures/app-server.fixture.ts`](../../../support/fixtures/app-server.fixture.ts) is a no-op stub — `start`/`stop` are empty because the examples hit a deployed URL. Only implement it if tests should boot the app themselves (e.g. a local dev server) rather than target an already-running deployment.

```ts
import { spawn, type ChildProcess } from 'node:child_process';
import { test as base } from 'playwright-bdd';
import { env } from '@config';

export const appServerFixture = base.extend<{ appServer: AppServerFixture }>({
  appServer: async ({}, use) => {
    let proc: ChildProcess | undefined;
    await use({
      baseURL: env.E2E_BASE_URL,
      start: async () => {
        proc = spawn('yarn', ['dev'], { stdio: 'inherit' });
        // Wait until the port responds before running tests
        await waitForPort(3000);
      },
      stop: async () => {
        proc?.kill();
      },
    });
  },
});
```

Call `start`/`stop` from `support/global-setup.ts` / `support/global-teardown.ts`, or invoke them where you need a server per worker. Playwright's built-in [`webServer`](https://playwright.dev/docs/test-webserver) config is a simpler alternative when you do not need custom logic.

## 3. Add domain steps

Put app-specific steps in [`steps/domain/`](../../../steps/domain/README.md). Before writing a new step, search the generated reference [`docs/agent/STEPS.md`](../STEPS.md) — most actions and assertions already exist in `steps/common/`.

Import `Given/When/Then` from `@fixtures` (the merged fixtures), not from `playwright-bdd` directly.

```ts
import { When } from '@fixtures';

When('I submit the onboarding form', async ({ page }) => {
  await page.getByRole('button', { name: 'Finish' }).click();
});
```

After adding steps, run `yarn bddgen`, then `yarn steps:docs` to refresh the reference.

## 4. Write features against your app

Add Gherkin scenarios under `features/`, organized by area (`features/<area>/<name>.feature`). Replace or remove the `features/the-internet/` examples once you have your own coverage.

```gherkin
Feature: Login

  Scenario: User signs in
    When I open url "<baseUrl>/login"
    And I fill "user@example.com" into element with label "Email"
    And I fill "secret" into element with label "Password"
    And I click element with label "Sign in"
    Then the heading "Dashboard" should be visible
```

## 4b. Ready-made example patterns

`steps/domain/` and `features/examples/` ship runnable patterns you can copy:

- **Network mocking** (`api-mocking.steps.ts`): `I block requests matching "..."` and `I mock "..." with status N and json body:` (Playwright `page.route`) — stub a backend or block resources.
- **Accessibility** (`accessibility.steps.ts`): `the page should have no accessibility violations of severity "critical" or higher` (axe-core).
- **Data factories**: template generators resolve at runtime — `<generateEmail>`, `<generateUUID>`, `<generateNumber[1,100]>`, `<currentDate>` — so each run uses fresh values.

### Reusing login state (storageState)

To avoid logging in on every scenario, log in once and reuse the saved
`storageState`. The Playwright-native approach is a setup project that other
projects depend on:

```ts
// playwright.config.ts (projects)
{ name: 'setup', testMatch: /auth\.setup\.ts/ },
{ name: 'chromium', dependencies: ['setup'], use: { storageState: '.auth/user.json' } },
```

The `setup` spec logs in and calls `await context.storageState({ path: '.auth/user.json' })`.
Add `.auth/` to `.gitignore`. This is more reliable than re-authenticating per test.

## 5. Visual testing (optional)

If you use Syngrisi visual regression, point the `SYNGRISI_*` envs at your project/branch in `.env`:

```bash
SYNGRISI_BASE_URL=http://localhost:5566
SYNGRISI_PROJECT=myapp
SYNGRISI_BRANCH=main
```

See [`syngrisi_visual.md`](syngrisi_visual.md) for details. Set `DISABLE_VISUAL_CHECKS=true` to skip globally, or tag tests `@no-visual` to skip per-test.

## 6. Run the quality gates

Run these before pushing — CI ([`.github/workflows/ci.yml`](../../../.github/workflows/ci.yml)) runs the same gates:

```bash
yarn verify        # Biome lint + format check
yarn type-check    # TypeScript type check
yarn test:unit     # Pure-logic unit tests (no browser)
yarn test          # Full E2E suite
```
