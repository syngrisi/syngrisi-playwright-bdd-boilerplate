import { test as base } from 'playwright-bdd';
import { createLogger } from '@lib/logger';
import { startMcpServer, type McpServerHandle } from '../mcp/server';
import { findEphemeralPort } from '../mcp/utils/port-utils';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const logger = createLogger('TestEngine');
const FEATURE_URI = 'mcp://e2e-test-engine';

export type TestEngineFixture = {
  isRunning: () => boolean;
  getPort: () => number | null;
  getBaseUrl: () => string | null;
  start: (options?: { requestedPort?: number; featureUri?: string; tags?: string[] }) => Promise<void>;
  waitForShutdown: (options?: { timeoutMs?: number }) => Promise<void>;
  stop: () => Promise<void>;
  client: Client | null;
};

export const testEngineFixture = base.extend<{ testEngine: TestEngineFixture }>({
  testEngine: [
    async ({ page, context, request, appServer, testData, $test }: any, use: any, testInfo: any) => {
      let handle: McpServerHandle | null = null;
      let mcpClientInstance: Client | null = null;
      const defaultTags = testInfo.tags ?? [];

      const fixture: TestEngineFixture = {
        isRunning: () => handle !== null,
        getPort: () => (handle ? handle.port : null),
        getBaseUrl: () => (handle ? handle.baseUrl : null),
        start: async (options) => {
          if (handle) {
            logger.warn(`MCP server already running on port ${handle.port}`);
            return;
          }

          const requestedPort =
            typeof options?.requestedPort === 'number' ? options.requestedPort : await findEphemeralPort();
          const tags = options?.tags ?? defaultTags;
          const featureUri = options?.featureUri ?? FEATURE_URI;

          logger.info(`Starting MCP server with requested port ${requestedPort}`);

          handle = await startMcpServer({
            fixtures: { page, context, request, appServer, testData },
            runtime: {
              test: $test ?? base,
              testInfo,
              featureUri,
              tags,
            },
            requestedPort,
          });

          const endpoint = new URL('/mcp', handle.baseUrl);
          const transport = new StreamableHTTPClientTransport(endpoint);
          mcpClientInstance = new Client({ name: 'test-engine-client', version: '1.0.0' }, { capabilities: {} });
          await mcpClientInstance.connect(transport);
          logger.info(`MCP server started on port ${handle.port}`);
        },
        waitForShutdown: async (options) => {
          if (!handle) {
            throw new Error('MCP server is not running, cannot wait for shutdown.');
          }
          await handle.waitForShutdown(options);
        },
        stop: async () => {
          if (!handle) {
            return;
          }
          logger.info(`Stopping MCP server on port ${handle.port}`);
          await handle.stop();
          handle = null;
          mcpClientInstance = null;
        },
        get client(): Client | null {
          return mcpClientInstance;
        },
      };

      try {
        await use(fixture);
      } finally {
        if (handle) {
          await fixture.stop();
        }
      }
    },
    { scope: 'test' },
  ],
});
