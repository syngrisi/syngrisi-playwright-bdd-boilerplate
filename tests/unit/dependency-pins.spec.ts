import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const repoRoot = path.resolve(__dirname, '..', '..');

test.describe('dependency pins', () => {
  test('CI Playwright container tag matches the installed @playwright/test version', () => {
    const installed = require('@playwright/test/package.json').version as string;
    const ci = readFileSync(path.join(repoRoot, '.github/workflows/ci.yml'), 'utf8');

    const tags = [...ci.matchAll(/mcr\.microsoft\.com\/playwright:v([\d.]+)-/g)].map((m) => m[1]);
    expect(tags.length, 'expected at least one Playwright container image in CI').toBeGreaterThan(0);

    for (const tag of tags) {
      expect(
        tag,
        `CI Playwright image v${tag} is out of sync with installed @playwright/test ${installed}. ` +
          'Bump the image tag in .github/workflows/ci.yml (or the dependency) so the baked-in browsers match.',
      ).toBe(installed);
    }
  });

  test('top-level zod stays on v3 (the @syngrisi/* packages nest their own zod v4)', () => {
    const version = require('zod/package.json').version as string;
    expect(version, 'top-level zod must stay v3 for the MCP/zod-to-json-schema path').toMatch(/^3\./);
  });
});
