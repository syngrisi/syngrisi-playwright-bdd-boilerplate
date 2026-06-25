import path from 'node:path';
import process from 'node:process';
import type { Readable, Writable } from 'node:stream';

import { e2eRoot, mcpRoot } from '../config';
import type { TestEngineSessionHealth, TestEngineSessionState } from '../test-engine-state';
import type { ResultEnvelope } from '../utils/protocol';

export const NPX_BIN = process.platform === 'win32' ? 'npx.cmd' : 'npx';
export const BRIDGE_ENTRY = path.join(mcpRoot, 'bridge-cli.ts');
export const TSX_DIST_ROOT = path.join(e2eRoot, 'node_modules', 'tsx', 'dist');
export const TSX_PREFLIGHT = path.join(TSX_DIST_ROOT, 'preflight.cjs');
export const TSX_LOADER = `file://${path.join(TSX_DIST_ROOT, 'loader.mjs')}`;
export const LOCALHOST = '127.0.0.1';
export const DAEMON_START_TIMEOUT_MS = 180_000;
export const DAEMON_REQUEST_TIMEOUT_MS = 180_000;

export const HELP_TEXT = [
  'MCP Test Engine CLI',
  '',
  'Usage:',
  '  npx tsx support/mcp/test-engine-cli.ts help',
  '  npx tsx support/mcp/test-engine-cli.ts start demo --headed [--system-thread <id>]',
  '  npx tsx support/mcp/test-engine-cli.ts step "I test" [--system-thread <id>]',
  '  npx tsx support/mcp/test-engine-cli.ts batch "I test" "I get current URL" [--system-thread <id>]',
  '  npx tsx support/mcp/test-engine-cli.ts status [--system-thread <id>]',
  '  npx tsx support/mcp/test-engine-cli.ts shutdown [--system-thread <id>]',
  '  npx tsx support/mcp/test-engine-cli.ts reset [--system-thread <id>]',
  '',
  'Commands:',
  '  help',
  '  start <sessionName> [--headed]',
  '  attach',
  '  status',
  '  resolve',
  '  tools',
  '  step <stepText> [--docstring <text>] [--docstring-json <json>] [--docstring-base64 <base64>]',
  '  step-json <json> | step-json --file <path>',
  '  batch <step1> <step2> [step3 ...]',
  '  batch-json <json> | batch-json --file <path>',
  '  restart [sessionName] [--headed]',
  '  steps find <query>',
  '  steps suggest <intent>',
  '  clear',
  '  shutdown',
  '  reset',
  '',
  'Global options:',
  '  --system-thread <id>  Override SYSTEM_THREAD / PID heuristic lookup.',
  '  --json                Print machine-readable JSON.',
  '',
  'Rules of thumb:',
  '  - Always set SYSTEM_THREAD or pass --system-thread for manual sessions.',
  '  - Use start once; every next CLI call reuses the same session via local state.',
  '  - Use step for single actions and diagnostics.',
  '  - Use batch only for 2 or more sequential steps.',
  '  - Use attach to connect the daemon to an existing debug MCP session.',
  '  - Use shutdown only when you explicitly want to close the session.',
].join('\n');

export const TOOL_TIMEOUTS = {
  listTools: 120_000,
  startSession: 120_000,
  execute: 180_000,
} as const;

export type CommandExecutionResult = {
  ok: boolean;
  shouldExit: boolean;
  // Machine-readable envelope of the last tool result, when the layer below provided one
  envelope?: ResultEnvelope | null;
};

export type ParsedCliArgs = {
  commands: string[];
  showHelp: boolean;
  daemonServer: boolean;
  daemonAttach: boolean;
  daemonHeaded: boolean;
  statusFile: string | null;
  agentId: string | null;
  jsonOutput: boolean;
};

export type TestEngineCliOptions = {
  stdin?: Readable;
  stdout?: Writable;
  stderr?: Writable;
};

export type DaemonCommandResponse = {
  ok: boolean;
  shouldExit: boolean;
  stdout: string;
  stderr: string;
  state?: TestEngineSessionState | null;
};

export type DaemonStatusResponse = {
  ok: boolean;
  state: TestEngineSessionState | null;
};

export type DaemonCommandTaskResult = {
  result: CommandExecutionResult;
  stdout: string;
  stderr: string;
};

export type JsonCommandPayload = {
  ok: boolean;
  command: string;
  systemThread?: string | null;
  health?: TestEngineSessionHealth;
  reused?: boolean;
  stdout?: string;
  stderr?: string;
  state?: TestEngineSessionState | null;
  artifacts?: string[];
  eventLogFile?: string;
  suggestedCommand?: string;
  sessionDir?: string;
  phases?: TestEngineSessionState['phases'];
};
