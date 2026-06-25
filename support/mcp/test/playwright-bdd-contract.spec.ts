// Guards the deep coupling to playwright-bdd internals. stepInvokerPatch.ts
// monkey-patches private modules; if a playwright-bdd upgrade moves or renames
// them, these tests fail loudly here instead of at runtime during a session.
import { expect, test } from '@playwright/test';

import { requirePlaywrightBddModule, resolvePlaywrightBddPath } from '../utils/playwrightBddPaths';
import { patchStepInvoker } from '../utils/stepInvokerPatch';

test.describe('playwright-bdd internal contract', { tag: '@no-app-start' }, () => {
  test('bddStepInvoker exposes BddStepInvoker.prototype.invoke', () => {
    const mod = requirePlaywrightBddModule<{ BddStepInvoker?: { prototype?: { invoke?: unknown } } }>(
      'dist',
      'runtime',
      'bddStepInvoker.js',
    );
    expect(mod.BddStepInvoker, 'BddStepInvoker export missing').toBeTruthy();
    expect(typeof mod.BddStepInvoker?.prototype?.invoke, 'invoke method missing').toBe('function');
  });

  test('getLocationInFile is exported', () => {
    const mod = requirePlaywrightBddModule<{ getLocationInFile?: unknown }>(
      'dist',
      'playwright',
      'getLocationInFile.js',
    );
    expect(typeof mod.getLocationInFile).toBe('function');
  });

  test('runStepWithLocation is exported', () => {
    const mod = requirePlaywrightBddModule<{ runStepWithLocation?: unknown }>(
      'dist',
      'playwright',
      'runStepWithLocation.js',
    );
    expect(typeof mod.runStepWithLocation).toBe('function');
  });

  test('resolvePlaywrightBddPath resolves inside the installed package', () => {
    const resolved = resolvePlaywrightBddPath('dist', 'runtime', 'bddStepInvoker.js');
    expect(resolved).toContain('playwright-bdd');
    expect(resolved.endsWith('bddStepInvoker.js')).toBe(true);
  });

  test('patchStepInvoker applies and returns the original invoke for restoration', () => {
    const original = patchStepInvoker();
    expect(typeof original).toBe('function');
    // Restore so the patch does not leak into other specs in this worker
    const mod = requirePlaywrightBddModule<{ BddStepInvoker: { prototype: { invoke: unknown } } }>(
      'dist',
      'runtime',
      'bddStepInvoker.js',
    );
    mod.BddStepInvoker.prototype.invoke = original;
  });
});
