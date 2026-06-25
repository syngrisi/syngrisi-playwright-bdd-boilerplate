// Guards the fragile contracts with third-party dependencies that have already
// broken once: playwright-mcp-advanced imports the hoisted (top-level) zod and converts
// schemas with zod-to-json-schema, which the MCP SDK validates as zod v3. The @syngrisi/*
// packages need zod v4, but they nest their own copy — top-level zod must stay v3.
import { expect, test } from '@playwright/test';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { CallToolResultSchema, ListToolsResultSchema } from '@modelcontextprotocol/sdk/types.js';

import { bootstrapToolDefinitions, stepExecuteBatchToolDefinition } from '../server';
import { createErrorResponse } from '../utils/responseHelpers';
import { ERROR_CODES, SESSION_NOT_STARTED_MESSAGE } from '../utils/protocol';

test.describe('dependency contracts', { tag: '@no-app-start' }, () => {
  test('hoisted zod stays on v3 so zod-to-json-schema can convert schemas', () => {
    const version: string = require('zod/package.json').version;
    expect(version, 'top-level zod v4 breaks zod-to-json-schema used by playwright-mcp-advanced').toMatch(/^3\./);
  });

  test('zodToJsonSchema produces a typed object schema (the zod v4 regression marker)', () => {
    // Cast avoids tsc's deep generic instantiation on zodToJsonSchema (same as server.ts)
    const convert = zodToJsonSchema as unknown as (s: unknown) => { type?: string };
    const schema = convert(z.object({ a: z.string() }));
    expect(schema.type, 'empty schema means zod/zod-to-json-schema are incompatible').toBe('object');
  });

  test('all advertised tool definitions pass MCP SDK validation', () => {
    const all = [...bootstrapToolDefinitions, stepExecuteBatchToolDefinition];
    const parsed = ListToolsResultSchema.parse({ tools: all });
    expect(parsed.tools).toHaveLength(all.length);
    for (const tool of parsed.tools) {
      expect((tool.inputSchema as { type?: string }).type, `tool ${tool.name} inputSchema.type`).toBe('object');
    }
  });

  test('CallToolResultSchema preserves the structuredContent envelope', () => {
    const response = createErrorResponse(SESSION_NOT_STARTED_MESSAGE, undefined, ERROR_CODES.SESSION_NOT_STARTED);
    const parsed = CallToolResultSchema.parse(response);
    expect(parsed.structuredContent).toEqual({
      status: 'failed',
      message: SESSION_NOT_STARTED_MESSAGE,
      errorCode: 'SESSION_NOT_STARTED',
    });
  });
});
