@example @a11y
Feature: Accessibility checks (axe-core)

  Demonstrates the `steps/domain/accessibility.steps.ts` integration: run axe
  against a page and assert no violations at or above a chosen severity.

  Scenario: Login page has no critical accessibility violations
    When I open site "<baseUrl>/login"
    Then the page should have no accessibility violations of severity "critical" or higher
