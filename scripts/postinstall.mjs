#!/usr/bin/env node
// Installs the Chromium browser for local development convenience
// (clone -> yarn install -> yarn test just works).
//
// Skipped in CI: GitHub Actions sets CI=true, and the workflow installs
// browsers explicitly with `yarn playwright install --with-deps chromium`
// (the supported CI approach — it also pulls OS dependencies). Running the
// download inside the install lifecycle on CI runners proved unreliable and
// could stall `yarn install`, so we keep it out of the critical path there.
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.env.CI) {
  console.log('[postinstall] CI detected — skipping browser download (installed explicitly in the workflow).');
  process.exit(0);
}

// Ensure the local Playwright binary resolves whether run via yarn (which adds
// node_modules/.bin to PATH) or directly with node.
const binDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'node_modules', '.bin');
const env = { ...process.env, PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ''}` };

try {
  execSync('playwright install chromium', { stdio: 'inherit', env });
} catch (error) {
  console.warn(
    `[postinstall] "playwright install chromium" failed: ${error instanceof Error ? error.message : String(error)}\n` +
      'Run it manually before executing tests.',
  );
}
