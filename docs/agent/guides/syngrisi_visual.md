# Syngrisi Visual Testing

Visual regression is optional and isolated from functional test commands.

## Prerequisites

Syngrisi stores baselines and check results in MongoDB. A local MongoDB on `127.0.0.1:27017` must be running before the first visual run, unless `SYNGRISI_DB_URI` points to another instance.

Start MongoDB with Homebrew (macOS):

```bash
brew tap mongodb/brew
brew install mongodb-community
brew services start mongodb-community
```

Or with Docker:

```bash
docker run -d --name syngrisi-mongo -p 27017:27017 mongo:7
```

Verify it is reachable:

```bash
nc -z 127.0.0.1 27017 && echo "MongoDB is up"
```

The Syngrisi fixture checks MongoDB availability before starting the server and fails fast with a clear error if it is not reachable.

## Commands

```bash
yarn test:visual
```

Runs stable `@visual` scenarios and excludes `@visual-failing`.

```bash
yarn test:visual:failing
```

Runs the intentionally failing visual example. This command is expected to exit with a non-zero status after the baseline exists.

## Autostart Behavior

The Syngrisi fixture checks `SYNGRISI_BASE_URL` before the first visual check. If Syngrisi is not reachable, it starts `npx sy` automatically.

Defaults:

- UI: `http://localhost:5566/`
- log file: `logs/syngrisi/syngrisi.log`
- MongoDB URI: `mongodb://127.0.0.1:27017/e2eBoilerplateSyngrisiDB`

MongoDB must be available locally unless `SYNGRISI_DB_URI` points to another instance.

## Baseline Workflow

1. Run `yarn test:visual`.
2. Open `http://localhost:5566/`.
3. In the grouped table, expand a test row and click the check preview/card inside it.
4. Accept the baseline in Syngrisi.
5. Rerun `yarn test:visual`.

Do not use the id shown in the top-level grouped table as `checkId`. In the default "Group by Runs" view that id belongs to a test row, not to an individual check. A URL like `/?checkId=<test-id>&modalIsOpen=true` opens an empty modal because `/v1/checks` cannot find a check with that id.

Correct ways to open check details:

- Click the preview/card inside an expanded test row.
- Use the direct `checkId` link printed by the visual assertion in the Playwright output.
- Query `/v1/tests?populate=checks...` and use the nested `checks[0]._id` value, not the parent test `_id`.

## Troubleshooting

### Empty check data

If the modal shows `Empty check data`, the URL most likely contains a test id instead of a check id.

1. Close the modal.
2. Remove `checkId` and `modalIsOpen` from the URL.
3. Expand the test row.
4. Click the nested check preview/card.

You can verify it through the API:

```bash
curl 'http://localhost:5566/v1/checks?limit=1&filter={"_id":"<check-id>"}'
```

The response must contain `results[0]`. If `results` is empty, the id is not a check id.

## Example Feature

```gherkin
@visual
Feature: Visual checks

  Scenario: Login form visual snapshot
    When I open site "<baseUrl>/login"
    Then the ".example" visual snapshot matches "The Internet Login Form"
```

The intentionally failing example mutates the page with a random banner before comparing it to the stable baseline.

## Screenshots

The README includes fresh Syngrisi UI screenshots:

- `docs/assets/syngrisi/syngrisi-dashboard.png` -- run overview
- `docs/assets/syngrisi/syngrisi-new-baseline.png` -- baseline review modal
- `docs/assets/syngrisi/syngrisi-check-failure.png` -- failed visual check
- `docs/assets/syngrisi/syngrisi-visual-diff.png` -- failed check with diff overlay
