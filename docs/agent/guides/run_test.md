# Running E2E Tests

Target: Playwright BDD suite in the project root. Regenerate BDD specs before direct Playwright runs.

## Project

- **chromium**: default browser project for all feature files under `features/**/*.feature`

## Quick Commands

- Regenerate specs:
  ```bash
  yarn bddgen
  ```

- Run the full suite:
  ```bash
  yarn test
  ```

- Run smoke tests:
  ```bash
  yarn test:smoke
  ```

- Run boilerplate examples:
  ```bash
  yarn test:examples
  ```

- Run stable Syngrisi visual examples:
  ```bash
  yarn test:visual
  ```

- Run the intentionally failing Syngrisi example:
  ```bash
  yarn test:visual:failing
  ```

- Run a single feature or scenario:
  ```bash
  yarn bddgen && npx playwright test --project=chromium "features/<PATH>.feature" --grep "<Scenario name>" --workers=1
  ```

- Run headed:
  ```bash
  yarn bddgen && npx playwright test --project=chromium "features/<PATH>.feature" --grep "<Scenario name>" --workers=1 --headed
  ```

## Notes

- Prefer existing common steps before adding project-specific steps.
- Functional test scripts exclude `@visual` scenarios. Use `test:visual` for Syngrisi checks.
- Use semantic selectors when possible; otherwise use stable CSS or test IDs.
- Keep logs, screenshots, and traces under `test-results/` or `reports/`.
- If step definitions change, restart MCP sessions so the step catalog refreshes.
