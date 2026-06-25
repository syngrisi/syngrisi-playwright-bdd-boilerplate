@visual
Feature: Syngrisi demo app - visual regression

  # Visual checks against the Syngrisi demo app. On a fresh Syngrisi database the
  # checks get a "new" status (first baseline) and pass; review & accept them in the
  # Syngrisi UI, then subsequent runs compare against the accepted baseline.

  Scenario: Visual checks of the demo app (element, viewport, full page)
    When I open site "https://viktor-silakov.github.io/syngrisi-demo-app/?version=0"
    Then the "#graph" visual snapshot matches "Demo graph"
    And the "page" visual snapshot matches "Demo viewport"
    And the "full page" visual snapshot matches "Demo full page"

  # Demonstrates regression detection: the broken version (?version=1) renders a
  # different graph, so once "Demo graph" has an accepted baseline this check fails.
  # Excluded from `yarn test:visual`; run it with `yarn test:visual:failing`.
  @visual-failing
  Scenario: Regression is detected on the broken version
    When I open site "https://viktor-silakov.github.io/syngrisi-demo-app/?version=1"
    Then the "#graph" visual snapshot matches "Demo graph"
