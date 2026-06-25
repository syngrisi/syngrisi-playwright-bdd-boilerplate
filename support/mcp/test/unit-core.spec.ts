import { expect, test } from '@playwright/test';

import {
  parseBatchJsonInput,
  parseCommandLine,
  parseStepJsonInput,
  tokenizeCommand,
  formatStepSuggestions,
} from '../test-engine/command-parser';
import {
  extractArtifacts,
  shouldMarkBrokenFromText,
  shouldTreatCommandErrorAsRecoverable,
} from '../test-engine/state-helpers';
import { simpleTokenSearch } from '../utils/simpleTokenSearch';
import { formatError } from '../utils/common';
import { removeGherkinKeywords } from '../utils/gherkinHelpers';
import { createErrorResponse, createSuccessResponse } from '../utils/responseHelpers';
import { ERROR_CODES, SESSION_NOT_STARTED_MESSAGE, extractEnvelope } from '../utils/protocol';
import type { Data } from '../utils/types';

test.describe('command-parser', { tag: '@no-app-start' }, () => {
  test('tokenizeCommand handles quoted arguments', () => {
    expect(tokenizeCommand('step "I open site \\"<baseUrl>\\""')).toEqual(['step', 'I open site "<baseUrl>"']);
    expect(tokenizeCommand('start my-session --headed')).toEqual(['start', 'my-session', '--headed']);
  });

  test('parseCommandLine passes step-json payload through untokenized', () => {
    expect(parseCommandLine('step-json {"stepText":"I test"}')).toEqual(['step-json', '{"stepText":"I test"}']);
    expect(parseCommandLine('batch-json [1,2]')).toEqual(['batch-json', '[1,2]']);
  });

  test('parseStepJsonInput accepts string, object, and rejects garbage', () => {
    expect(parseStepJsonInput('"I test"')).toEqual({ stepText: 'I test' });
    expect(parseStepJsonInput('{"stepText":"I test","stepDocstring":"doc"}')).toEqual({
      stepText: 'I test',
      stepDocstring: 'doc',
    });
    expect(() => parseStepJsonInput('{"foo":1}')).toThrow(/stepText/);
  });

  test('parseBatchJsonInput requires at least 2 items', () => {
    expect(() => parseBatchJsonInput('["only one"]')).toThrow(/at least 2/);
    expect(parseBatchJsonInput('["a", {"stepText":"b"}]')).toEqual([{ stepText: 'a' }, { stepText: 'b' }]);
  });
});

const CATALOG: Data = {
  files: [
    {
      fileName: 'steps/common/dialog.steps.ts',
      steps: [
        {
          pattern: 'I prepare to accept next dialog',
          description: 'Accepts the next dialog (alert/confirm/prompt) regardless of its text.',
          line: 45,
        },
      ],
    },
    {
      fileName: 'steps/common/actions.steps.ts',
      steps: [
        { pattern: 'I execute javascript code:', description: 'Executes JavaScript in the page context.', line: 341 },
        {
          pattern: 'I select the option with the text {string} for element {string}',
          description: 'Choose from a select element.',
          line: 418,
        },
      ],
    },
  ],
};

test.describe('steps suggest ranking', { tag: '@no-app-start' }, () => {
  test('intent about dialogs outranks unrelated javascript step', () => {
    const results = simpleTokenSearch(CATALOG, 'accept javascript alert');
    expect(results[0].pattern).toBe('I prepare to accept next dialog');
  });

  test('weak matches are not presented as confident recommendations', () => {
    const output = formatStepSuggestions('frobnicate the quux widget', CATALOG);
    expect(output).not.toContain('Recommended exact command');
  });

  test('confident matches keep the recommendation wording', () => {
    const output = formatStepSuggestions('accept next dialog', CATALOG);
    expect(output).toContain('Recommended exact command: step "I prepare to accept next dialog"');
  });
});

test.describe('error classification', { tag: '@no-app-start' }, () => {
  test('shouldMarkBrokenFromText matches session-loss markers', () => {
    expect(shouldMarkBrokenFromText(SESSION_NOT_STARTED_MESSAGE)).toBe(true);
    expect(shouldMarkBrokenFromText('Connection closed')).toBe(true);
    expect(shouldMarkBrokenFromText('locator.click: Timeout 15000ms exceeded.')).toBe(false);
  });

  test('shouldTreatCommandErrorAsRecoverable matches step-level failures', () => {
    expect(shouldTreatCommandErrorAsRecoverable('locator.waitFor: Timeout 15000ms exceeded.')).toBe(true);
    expect(shouldTreatCommandErrorAsRecoverable(SESSION_NOT_STARTED_MESSAGE)).toBe(false);
  });

  test('extractArtifacts dedupes file paths', () => {
    const text = 'Screenshot: /Users/x/shot.png\nAgain: /Users/x/shot.png and /Users/x/tree.json';
    expect(extractArtifacts(text)).toEqual(['/Users/x/shot.png', '/Users/x/tree.json']);
  });
});

test.describe('formatError', { tag: '@no-app-start' }, () => {
  test('strips MCP-infrastructure stack frames but keeps the message', () => {
    const error = new Error('locator.click: Timeout 15000ms exceeded.\nCall log:\n  - waiting for locator');
    error.stack = [
      'Error: locator.click: Timeout 15000ms exceeded.',
      'Call log:',
      '  - waiting for locator',
      '    at Object.call (/repo/steps/common/actions.steps.ts:2:881)',
      '    at /repo/node_modules/playwright-mcp-advanced/dist/context.js:109:28',
      '    at wrappedHandler (/repo/node_modules/@modelcontextprotocol/sdk/src/server/index.ts:262:32)',
      '    at /repo/support/mcp/utils/stepExecutor.ts:458:12',
    ].join('\n');

    const formatted = formatError(error);
    expect(formatted).toContain('locator.click: Timeout');
    expect(formatted).toContain('actions.steps.ts');
    expect(formatted).not.toContain('playwright-mcp-advanced');
    expect(formatted).not.toContain('@modelcontextprotocol');
    expect(formatted).not.toContain('stepExecutor.ts');
  });
});

test.describe('gherkin helpers', { tag: '@no-app-start' }, () => {
  test('removeGherkinKeywords strips leading keywords only', () => {
    expect(removeGherkinKeywords('When I open the app')).toBe('I open the app');
    expect(removeGherkinKeywords('I open the app')).toBe('I open the app');
  });
});

test.describe('result envelope protocol', { tag: '@no-app-start' }, () => {
  test('error responses carry a machine-readable envelope and stable text', () => {
    const response = createErrorResponse(SESSION_NOT_STARTED_MESSAGE, undefined, ERROR_CODES.SESSION_NOT_STARTED);
    expect(response.content[0].text).toBe(`Status: Failed\nError: ${SESSION_NOT_STARTED_MESSAGE}`);
    const envelope = extractEnvelope(response);
    expect(envelope).toEqual({
      status: 'failed',
      message: SESSION_NOT_STARTED_MESSAGE,
      errorCode: 'SESSION_NOT_STARTED',
    });
  });

  test('success responses carry the envelope alongside the text', () => {
    const response = createSuccessResponse('Executed 2 of 2 steps successfully');
    expect(response.content[0].text).toContain('Status: Success');
    expect(extractEnvelope(response)).toEqual({
      status: 'success',
      message: 'Executed 2 of 2 steps successfully',
    });
  });

  test('extractEnvelope ignores results without structured content', () => {
    expect(extractEnvelope({ content: [{ type: 'text', text: 'x' }] })).toBeNull();
    expect(extractEnvelope(null)).toBeNull();
  });
});
