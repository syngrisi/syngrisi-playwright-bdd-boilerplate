# Commonly Used E2E Steps

Most frequent steps in `./features`. Use these as defaults before inventing new ones. The complete generated list of all steps is in [STEPS.md](../STEPS.md) (regenerate with `yarn steps:docs`).

- **Navigation & selection**
  - `When I open site "<baseUrl>"` — navigate to the base URL.
  - `When I open url "<baseUrl>/path"` — navigate to a specific path.
  - `When I select the option with the text "<Text>" for element "<locator>"` — choose from a select element.
  - `When I set "<text>" to the inputfield "<locator>"` — type into free-form filters.
  - `When I click element with locator "<locator>"` — primary click step; works with CSS/XPath/testid.
  - `When I click element with label "<Label>"` — click by accessible label (preferred).
  - `When I clear local storage` — wipe browser storage between flows.

- **Waits**
  - `When I wait <seconds> seconds for the element with locator "<locator>" to be visible` — explicit waits for grids/cards.
  - `When I wait on element "<locator>" to not be displayed|not exist` — ensure removals/hide happen.
  - `When I wait <seconds> seconds` — generic small pauses.

- **Assertions**
  - `Then the element "<locator>" does appear exactly "<N>" times` — count table/list items.
  - `Then the element with locator "<locator>" should be visible` — visibility check.
  - `Then the css attribute "<attr>" from element "<locator>" is "<value>"` — style/state check.
  - `Then the button "<Name>" should be visible|enabled|disabled` — button state assertion.
  - `Then the heading "..." should be visible` — heading visibility check.

- **Forms**
  - `When I fill "<value>" into element with label "<Label>"` — labeled inputs.
  - `When I fill "<value>" into textbox "<Name>"` — role-based fill.
  - `When I fill "<value>" into element with placeholder "<Placeholder>"` — placeholder-based inputs.
  - `When I fill "<Option>" into combobox "<Name>"` — combobox selection.

- **Visual checks**
  - `Then the "page" visual snapshot matches "<Name>"` — viewport screenshot comparison.
  - `Then the "full page" visual snapshot matches "<Name>"` — full-page screenshot comparison.
  - `Then the "<locator>" visual snapshot matches "<Name>"` — element screenshot comparison.
  - `Then the "<locator>" visual snapshot matches "<Name>" with tolerance: "0.5"` — visual comparison with threshold.

Tip: Before adding new steps, search for existing patterns in `features/**` to stay aligned with the suite conventions. Use semantic locators where possible; rely on `element with locator` only when label/role is unavailable.
