@example @smoke
Feature: The Internet - Basic navigation

  Scenario: Open home page and verify core content
    When I open site "<baseUrl>"
    Then the title contains "The Internet"
    And the heading "Welcome to the-internet" should be visible
    And the link "Form Authentication" should be visible

  Scenario: Navigate to a content page from the home page
    When I open site "<baseUrl>"
    And I click element with locator "a[href='/status_codes']"
    Then the title contains "The Internet"
    And the heading "Status Codes" should be visible
    And the link "200" should be visible
