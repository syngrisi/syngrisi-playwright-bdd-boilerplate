// Direct unit coverage for stepExecutor's pure/early-exit logic: the tool
// parameter schemas and the step-resolution "not found / suggestions" paths,
// which run before any browser interaction. Full execution is covered by the
// integration specs (mcp-bridge-cli, mcp-http).
import { expect, test } from '@playwright/test';

import {
  executeStep,
  stepExecuteManyParamsSchema,
  stepExecuteSingleParamsSchema,
  type StepExecutorDependencies,
} from '../utils/stepExecutor';
import { ERROR_CODES, extractEnvelope } from '../utils/protocol';
import type { Data } from '../utils/types';

test.describe('stepExecutor: tool parameter schemas', { tag: '@no-app-start' }, () => {
  test('single-step schema accepts stepText and optional docstring', () => {
    expect(stepExecuteSingleParamsSchema.safeParse({ stepText: 'I test' }).success).toBe(true);
    expect(stepExecuteSingleParamsSchema.safeParse({ stepText: 'I test', stepDocstring: 'x' }).success).toBe(true);
    expect(stepExecuteSingleParamsSchema.safeParse({}).success).toBe(false);
    expect(stepExecuteSingleParamsSchema.safeParse({ stepText: 42 }).success).toBe(false);
  });

  test('many-step schema requires a non-empty array of steps', () => {
    expect(stepExecuteManyParamsSchema.safeParse({ steps: ['a', { stepText: 'b' }] }).success).toBe(true);
    expect(stepExecuteManyParamsSchema.safeParse({ steps: [] }).success).toBe(false);
    expect(stepExecuteManyParamsSchema.safeParse({ steps: [{ nope: 1 }] }).success).toBe(false);
  });
});

// Minimal dependencies for the resolution path: only stepFinder and the parsed
// catalog are consulted before the not-found return.
function makeDeps(catalog: Data, definitions: unknown[] = []): StepExecutorDependencies {
  return {
    stepFinder: { findDefinitions: () => definitions },
    fixtures: {},
    llmStepDefinitionsParsed: catalog,
    bddConfig: {},
    autoFixtures: {},
  } as unknown as StepExecutorDependencies;
}

const EMPTY_CATALOG: Data = { files: [] };

const CATALOG_WITH_CLICK: Data = {
  files: [
    {
      fileName: 'steps/common/clicks.steps.ts',
      steps: [{ pattern: 'I click element with {target} {string}', description: 'Click an element.', line: 1 }],
    },
  ],
};

test.describe('stepExecutor: resolution failure paths', { tag: '@no-app-start' }, () => {
  test('unknown step with no suggestions returns STEP_NOT_FOUND', async () => {
    const result = await executeStep({ stepText: 'I zzz nonexistent qqq step wibble' }, makeDeps(EMPTY_CATALOG));
    expect((result as { isError?: boolean }).isError).toBe(true);
    const envelope = extractEnvelope(result);
    expect(envelope?.errorCode).toBe(ERROR_CODES.STEP_NOT_FOUND);
    expect(envelope?.message).toContain('No step definitions found');
  });

  test('unknown step with a near match returns STEP_NOT_FOUND plus suggestions', async () => {
    const result = await executeStep({ stepText: 'I click element banana' }, makeDeps(CATALOG_WITH_CLICK));
    expect((result as { isError?: boolean }).isError).toBe(true);
    const envelope = extractEnvelope(result);
    expect(envelope?.errorCode).toBe(ERROR_CODES.STEP_NOT_FOUND);
    expect(envelope?.message).toContain('Did you mean one of these?');
    expect(envelope?.message).toContain('I click element with {target} {string}');
  });

  test('stepFinder throwing surfaces a failure result (not a crash)', async () => {
    const deps = {
      stepFinder: {
        findDefinitions: () => {
          throw new Error('registry boom');
        },
      },
      fixtures: {},
      llmStepDefinitionsParsed: EMPTY_CATALOG,
      bddConfig: {},
      autoFixtures: {},
    } as unknown as StepExecutorDependencies;

    const result = await executeStep({ stepText: 'I test' }, deps);
    expect((result as { isError?: boolean }).isError).toBe(true);
    expect(extractEnvelope(result)?.message).toContain('Failed to search for step definitions');
  });
});
