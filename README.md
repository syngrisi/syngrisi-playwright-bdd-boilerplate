# Syngrisi Playwright BDD Boilerplate

Playwright + Gherkin (BDD) boilerplate for **[Syngrisi](https://github.com/syngrisi/syngrisi) visual regression testing**. Write visual checks in plain Gherkin and run them against a Syngrisi server.

It includes:

- **Syngrisi visual regression** as first-class Gherkin steps (`Then the "..." visual snapshot matches "..."`) backed by `@syngrisi/playwright-sdk`
- Playwright BDD setup with TypeScript (`playwright-bdd`)
- ~150 reusable Gherkin step definitions for navigation, actions, assertions, polling, dialogs, network checks, and visual checks
- Test-data template helpers (`<baseUrl>`, `<generateEmail>`, …)
- Accessibility checks via `@axe-core/playwright`
- MCP Test Engine + `/browser` skill for AI-assisted browser sessions
- Example visual tests against the [Syngrisi demo app](https://viktor-silakov.github.io/syngrisi-demo-app/)

## Requirements

- Node.js >= 22.19.0
- MongoDB >= 8 running locally (Syngrisi stores baselines/snapshots there)

## Quick Start

```bash
yarn install                # installs deps + Chromium
yarn sy                     # start the Syngrisi server (http://localhost:5566, auth disabled)
yarn test:visual            # run the visual checks against the demo app
```

Then open `http://localhost:5566`, review the new baselines, accept them, and rerun `yarn test:visual` to compare against them.

Run the non-visual example suite (no Syngrisi server needed):

```bash
yarn test
```

Useful commands:

```bash
yarn bddgen        # Generate Playwright specs from feature files
yarn test          # Run all E2E tests in Chromium
yarn test:smoke    # Run @smoke tests
yarn test:examples # Run @example tests
yarn test:visual   # Run stable Syngrisi visual examples
yarn test:headed   # Run tests in headed mode
yarn test:unit     # Pure-logic unit tests (helpers), no browser, <1s
yarn test:mcp      # MCP server / test-engine subsystem tests
yarn lint          # Biome lint
yarn format        # Biome format (write)
yarn verify        # Biome lint + format check (CI gate)
yarn type-check    # TypeScript type check
yarn steps:docs    # Regenerate docs/agent/STEPS.md
```

Quality is enforced in CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)): a **static** job (`verify` + `type-check` + STEPS.md freshness), a **unit** job (`test:unit` + `test:mcp`), and an **e2e** job (`test`). Run `yarn verify && yarn type-check && yarn test:unit` locally before pushing.

## Project Structure

```text
.
├── config.ts                  # Environment config
├── playwright.config.ts       # Playwright BDD config
├── AGENTS.md                  # Canonical AI agent instructions (CLAUDE.md is a symlink)
├── ARCHITECTURE.md            # System design and data flows
├── llms.txt                   # Repository map for LLMs
├── features/
│   ├── syngrisi/              # Syngrisi visual regression examples (demo app)
│   ├── the-internet/          # Generic BDD example (common steps)
│   └── examples/              # Accessibility (axe) example
├── steps/
│   ├── common/                # Reusable step definitions
│   ├── domain/                # Add project-specific steps here
│   └── helpers/               # Locator, assertion, and template helpers
├── scripts/                   # Maintenance scripts (steps doc generator)
├── support/
│   ├── fixtures/              # Playwright fixtures
│   ├── mcp/                   # MCP server and test engine CLI (+ test/ specs)
│   ├── lib/                   # Logger
│   └── utils/                 # Shared utilities (env loader, common)
├── tests/unit/                # Pure-logic unit tests (yarn test:unit)
├── test-data/                 # Local test data files
├── biome.json                 # Biome linter/formatter config
├── .github/workflows/         # CI (static / unit / e2e)
└── docs/agent/                # Agent-oriented testing guides + generated STEPS.md
```

## AI Tooling

This repository is set up for AI-assisted development (Claude Code, Cursor, Copilot, Codex, Antigravity):

- [AGENTS.md](AGENTS.md) — single source of agent instructions; `CLAUDE.md` and `.github/copilot-instructions.md` are symlinks to it
- [ARCHITECTURE.md](ARCHITECTURE.md) — system design with data-flow diagrams
- [docs/agent/STEPS.md](docs/agent/STEPS.md) — generated reference of all Gherkin steps (`yarn steps:docs`)
- [llms.txt](llms.txt) — repository map for LLM indexing
- `.aiignore` / `.cursorignore` — keep generated artifacts out of AI context
- `support/mcp/` — MCP Test Engine so agents can drive a live browser session
- Biome (`yarn lint`/`format`/`verify`) enforces a consistent style so AI diffs stay clean

## Example Coverage

- `features/syngrisi/visual_demo_app.feature` — the headline example: element, viewport and full-page visual checks against the Syngrisi demo app, plus a `@visual-failing` scenario that demonstrates regression detection on a broken version.
- `features/the-internet/basic_navigation.feature` — a generic `@example @smoke` scenario showing the common navigation/assertion steps.
- `features/examples/accessibility.feature` — an `@a11y` accessibility check via `@axe-core/playwright`.

```bash
yarn test:examples   # @example tagged scenarios
yarn test:smoke      # @smoke tagged scenarios
```

## Configuration

Create a local `.env` from `.env.example` when you need overrides.

| Variable | Default | Description |
| --- | --- | --- |
| `E2E_BASE_URL` | `https://the-internet.herokuapp.com` | Base URL used by `<baseUrl>` in features |
| `E2E_LOG_LEVEL` | `info` | Framework log level |
| `PLAYWRIGHT_HEADED` | `false` | Run browser in headed mode |
| `PLAYWRIGHT_WORKERS` | `4` | Number of Playwright workers |
| `E2E_DEBUG` | `false` | Enable debug behavior |
| `E2E_FORCE_TRACE` | `false` | Force Playwright traces for all tests |
| `CI` | `false` | CI mode |

## Adding Tests

Add Gherkin scenarios under `features/`.

```gherkin
Feature: Search

  Scenario: Open search page
    When I open site "<baseUrl>/search"
    Then the heading "Search" should be visible
```

Add custom project steps under `steps/domain/` only when common steps are not enough.

```ts
import { When } from '@fixtures';

When('I do a project-specific action', async ({ page }) => {
  await page.getByRole('button', { name: 'Run' }).click();
});
```

## Common Step Examples

```gherkin
When I open site "<baseUrl>"
When I open url "<baseUrl>/login"
When I click element with locator "#submit"
When I fill "hello" into element with label "Name"
When I fill "hello" into element with locator "#name"
When I press the "Enter" key
When I wait until element "#status" contains text "Done"

Then the heading "Welcome" should be visible
Then the element with locator "#message" should have contains text "Success"
Then the element with locator "#email" should have value "user@example.com"
Then the title contains "The Internet"
```

## MCP Test Engine

Start an interactive browser session for agent-driven debugging:

```bash
export SYSTEM_THREAD=agent-session
npx tsx support/mcp/test-engine-cli.ts start my-session --headed
npx tsx support/mcp/test-engine-cli.ts step "I open site \"<baseUrl>\""
npx tsx support/mcp/test-engine-cli.ts step "I analyze current page"
npx tsx support/mcp/test-engine-cli.ts shutdown
```

## Visual Regression

Visual regression is the core purpose of this boilerplate. The Syngrisi fixture checks `SYNGRISI_BASE_URL` before the first visual check and starts Syngrisi automatically when it is not running. Visual checks are enabled by default; set `DISABLE_VISUAL_CHECKS=true` (or tag a scenario `@no-visual`) to skip them.

### Prerequisites

Syngrisi requires MongoDB on `127.0.0.1:27017` (or set `SYNGRISI_DB_URI` to another instance). Start it with Homebrew:

```bash
brew tap mongodb/brew
brew install mongodb-community
brew services start mongodb-community
```

Or with Docker:

```bash
docker run -d --name syngrisi-mongo -p 27017:27017 mongo:8
```

```bash
yarn test:visual
```

Defaults:

- Syngrisi UI: `http://localhost:5566/`
- Log file: `logs/syngrisi/syngrisi.log`
- MongoDB URI: `mongodb://127.0.0.1:27017/e2eBoilerplateSyngrisiDB`

The first visual run usually creates new baselines. Review and accept them in the Syngrisi UI, then rerun `yarn test:visual`.

When opening details from the Syngrisi table, expand the test row and click the nested check preview/card. The id displayed in the top-level grouped table is usually a test id, not a check id. If the modal says `Empty check data`, remove `checkId` from the URL and open the nested check instead.

### Syngrisi UI Screenshots

Run overview:

![Syngrisi run overview](docs/assets/syngrisi/syngrisi-dashboard.png)

New baseline review:

![Syngrisi new baseline review](docs/assets/syngrisi/syngrisi-new-baseline.png)

Failed visual check with diff overlay:

![Syngrisi failed visual check](docs/assets/syngrisi/syngrisi-check-failure.png)

Visual diff view:

![Syngrisi visual diff](docs/assets/syngrisi/syngrisi-visual-diff.png)

There is also an intentionally failing visual example. It mutates the login page with a random banner and compares it against the stable login-form baseline:

```bash
yarn test:visual:failing
```

This command is expected to exit with a non-zero status after the baseline exists.

Set `DISABLE_VISUAL_CHECKS=true` to skip visual checks.

## Browser Skill

Claude-compatible browser automation instructions live in `.claude/skills/browser/SKILL.md`. The skill is adapted for this boilerplate and uses the local test-engine CLI:

```bash
yarn bddgen
export SYSTEM_THREAD=manual-browser
npx tsx support/mcp/test-engine-cli.ts start manual-browser --headed
npx tsx support/mcp/test-engine-cli.ts step "I open site \"<baseUrl>\""
npx tsx support/mcp/test-engine-cli.ts shutdown
```

## Agent Documentation

See `docs/agent/` for detailed testing guides:

- [Run Tests Guide](docs/agent/guides/run_test.md)
- [Common Steps Cheatsheet](docs/agent/guides/common_steps_cheatsheet.md)
- [MCP Test Engine Usage](docs/agent/guides/mcp_test_engine_using.md)
- [Quick Test Generation](docs/agent/guides/test-generate-quick.md)
