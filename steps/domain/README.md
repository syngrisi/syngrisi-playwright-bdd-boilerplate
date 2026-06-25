# Domain Steps

App-specific step definitions go here. Before adding a step, search the full reference in [docs/agent/STEPS.md](../../docs/agent/STEPS.md) — most actions and assertions already exist in `steps/common/`.

## How to add a step

```ts
import { When } from '@fixtures';

When('I do a project-specific action', async ({ page }) => {
  await page.getByRole('button', { name: 'Run' }).click();
});
```

Rules:

- Import `Given/When/Then` from `@fixtures` (merged fixtures), not from playwright-bdd directly.
- Reuse helpers from `steps/helpers/` (locators, assertions, template).
- Prefer semantic locators (role, label) over CSS/XPath.
- After adding a step run `yarn bddgen`, then `yarn steps:docs` to refresh the reference.
