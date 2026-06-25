---
name: browser
description: Browser automation, manual UI debugging, and feature reproduction for this Playwright BDD boilerplate via the local test-engine CLI. Use this whenever the user wants to walk a browser flow step by step, inspect the current page, reproduce an E2E scenario, debug MCP/Test Engine behavior, inspect available BDD steps, or execute browser workflow steps without raw JSON-RPC.
invocation: /browser
version: 2.1.0
allowed-tools:
  - Bash
  - Read
---

# Browser Automation & Debugging

Control the browser through the local Playwright BDD test-engine CLI.

The CLI entrypoint is:

```bash
npx tsx support/mcp/test-engine-cli.ts
```

Run every command from the boilerplate root.

## Contract

1. Always run `yarn bddgen` before scenario-oriented work.
2. Always set `SYSTEM_THREAD` explicitly for manual sessions.
3. Never run commands in parallel for the same session.
4. Prefer `step` over `batch`; use `batch` only for short deterministic sequences.
5. Use `step-json` or `batch-json` when shell quoting becomes fragile.
6. Prefer existing common steps before adding or using raw locator-heavy steps.
7. Use `status --json` when the session behaves unexpectedly.
8. Use `shutdown` when you are done. Use `restart` if the session becomes broken.

## Preflight

```bash
yarn bddgen
export SYSTEM_THREAD=manual-browser
npx tsx support/mcp/test-engine-cli.ts help
```

If preflight fails, stop and fix that first.

## Core Commands

- `start <sessionName> [--headed] [--system-thread <id>]`
- `restart <sessionName> [--headed] [--system-thread <id>]`
- `attach [--system-thread <id>]`
- `status [--system-thread <id>]`
- `tools [--system-thread <id>]`
- `step <stepText> [--docstring <text>] [--docstring-base64 <base64>] [--docstring-file <path>] [--system-thread <id>]`
- `step-json <json> | step-json --file <path> [--system-thread <id>]`
- `batch <step1> <step2> [step3 ...] [--system-thread <id>]`
- `batch-json <json> | batch-json --file <path> [--system-thread <id>]`
- `steps find <query>`
- `steps suggest <intent>`
- `clear [--system-thread <id>]`
- `shutdown [--system-thread <id>]`
- add `--json` for structured `state`, `health`, `artifacts`, and `eventLogFile`

## Boilerplate Examples

The default base URL is `https://the-internet.herokuapp.com`.

```bash
export SYSTEM_THREAD=internet-debug
npx tsx support/mcp/test-engine-cli.ts start internet --headed
npx tsx support/mcp/test-engine-cli.ts step "I open site \"<baseUrl>\""
npx tsx support/mcp/test-engine-cli.ts step "I analyze current page"
npx tsx support/mcp/test-engine-cli.ts step "the heading \"Welcome to the-internet\" should be visible"
npx tsx support/mcp/test-engine-cli.ts shutdown
```

Form login example:

```bash
export SYSTEM_THREAD=login-debug
npx tsx support/mcp/test-engine-cli.ts start login --headed
npx tsx support/mcp/test-engine-cli.ts step "I open site \"<baseUrl>/login\""
npx tsx support/mcp/test-engine-cli.ts step "I fill \"tomsmith\" into element with locator \"#username\""
npx tsx support/mcp/test-engine-cli.ts step "I fill \"SuperSecretPassword!\" into element with locator \"#password\""
npx tsx support/mcp/test-engine-cli.ts step "I click element with locator \"button[type='submit']\""
npx tsx support/mcp/test-engine-cli.ts step "the heading \"Secure Area\" should be visible"
npx tsx support/mcp/test-engine-cli.ts shutdown
```

## Step Discovery

Generated step catalogs live under `support/mcp/steps/`.

```bash
yarn bddgen
npx tsx support/mcp/test-engine-cli.ts steps find "visual snapshot"
npx tsx support/mcp/test-engine-cli.ts steps suggest "upload a file"
```

Prefer steps in this order:

1. Domain steps from `steps/domain/**`
2. Common semantic UI steps from `steps/common/**`
3. Raw locator steps only when semantic selectors are not available

## Syngrisi Visual Checks

Syngrisi runs on `http://localhost:5566/` by default. Visual tests autostart Syngrisi from the fixture if it is not already running.

```bash
yarn test:visual
```

Logs are written to:

```text
logs/syngrisi/syngrisi.log
```

The intentionally failing visual example is separate:

```bash
yarn test:visual:failing
```

This command is expected to exit non-zero after a baseline exists.

If the Syngrisi modal shows `Empty check data`, the URL likely contains a top-level test id instead of a nested check id. Close the modal, remove `checkId` from the URL, expand the test row, and click the check preview/card. Direct links printed by the visual assertion already use check ids.

## Quoting & Docstrings

For quote-heavy steps, prefer JSON:

```bash
npx tsx support/mcp/test-engine-cli.ts step-json '{"stepText":"I open site \"<baseUrl>\""}'
```

When nested quotes or special characters (e.g. non-breaking space) still break shell quoting, write the JSON to a file and use `--file`:

```bash
printf '%s' '{"stepText":"I click element with locator \"#id\""}' > .tmp/step.json
npx tsx support/mcp/test-engine-cli.ts step-json --file .tmp/step.json
```

For multiline docstrings, prefer base64:

```bash
DOC_B64=$(node -e 'process.stdout.write(Buffer.from(`return document.title`).toString("base64"))')
npx tsx support/mcp/test-engine-cli.ts step "I execute javascript code:" --docstring-base64 "$DOC_B64"
```

## Troubleshooting

1. Read the exact failing step text.
2. Confirm the step exists in `support/mcp/steps/**/*.yaml`.
3. Run `status --json`.
4. If `health` is `broken`, run `restart <sessionName> --headed`.
5. If a real step fails with `Session not started`, discard the session and start a fresh one.
6. Use one `step` command at a time to isolate failures.
7. Call `shutdown` when finished.
