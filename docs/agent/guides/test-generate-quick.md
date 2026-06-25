# Quick Guide: Generating E2E Tests

For AI agents working with the Playwright BDD suite. Use only local steps from `./steps/**`.

## Where to place generated features
- Path: `./features/<area>/<name>_generated.feature`
- Tag generated files: `@generated` (plus area tags as appropriate).

## Feature/Scenario skeleton

**Naming Rules:**
- Use dashes instead of parentheses in Feature and Scenario names
- Good: `Feature: RCA - Demo scenarios - Silent Mode`
- Bad: `Feature: RCA - Demo scenarios (Silent Mode)`

```gherkin
@generated
Feature: Short, clear feature name

  Scenario: What the user does
    When I open site "<baseUrl>"
    And I click element with label "Sign in"
    Then the button "Sign in" should be visible
```

## Common local steps (safe set)
- Navigation: `When I open site "<baseUrl>"` or `When I open url "<baseUrl>/path"`.
- Clicks: `When I click element with label "..."` (preferred) or `When I click element with locator "[data-testid='...']"` as fallback.
- Inputs: `When I fill "text" into element with label "Field"` or `When I fill "text" into textbox "Field"` or `When I fill "Option" into combobox "Status"`.
- Assertions:  
  - `Then the heading "..." should be visible`  
  - `Then the button "..." should be enabled|disabled|visible`  
  - `Then the element with label "..." should have text "Expected"`  
  - `Then the element with locator "[data-testid='id']" should be visible` (fallback only).
- Waiting: `When I wait for "2" seconds`.

## Domain hints
- Prefer semantic selectors; if missing, update the UI source to add proper labels/roles (see `selector_best_practices.md`).

## Generate and run
```bash
yarn bddgen                                     # regenerate step catalog
yarn test:smoke                                 # quick pass
npx playwright test "features/<area>/..._generated.feature" --grep "Scenario name" --workers=1
```
Headed debug: `npx playwright test ... --headed --workers=1`.
Visual debug: `yarn test:visual` for stable Syngrisi examples, `yarn test:visual:failing` for the intentionally failing visual example.

## Mandatory checks after generation
- Run the new scenario; fix failures before handing off.
- No CSS/XPath unless role/label/data-testid are impossible.
- Keep comments only for non-obvious business rules/timing.
- If you add/modify steps, restart MCP sessions (regenerate step YAML).
- Do not tag generated functional tests with `@visual` unless they intentionally require Syngrisi.

## Test data helpers
Use templates from `testData`:  
`"Order-<generateNumber[1000,9999]>"`, `"<generateEmail[test]>"`, reuse stored vars: `"<email>"`.

## Example
```gherkin
@generated
Feature: Create check

  Scenario: Create a check with required fields
    When I open site "<baseUrl>"
    And I click element with label "Sign in"
    And I fill "Test" into element with label "Email"
    And I fill "Test" into element with label "Password"
    And I click element with label "Sign in"
    Then the button "Sign in" should be visible
```
