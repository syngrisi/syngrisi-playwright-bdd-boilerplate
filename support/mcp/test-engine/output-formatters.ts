import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { Writable } from 'node:stream';

import { isProcessAlive, type ResolvedAgentIdentity } from '../test-engine-agent-resolver';
import {
  getTestEngineSessionDir,
  getTestEngineStatePath,
  type TestEngineSessionHealth,
  type TestEngineSessionState,
} from '../test-engine-state';

import {
  DAEMON_REQUEST_TIMEOUT_MS,
  LOCALHOST,
  type DaemonCommandResponse,
  type DaemonStatusResponse,
  type JsonCommandPayload,
} from './constants';

export class BufferingWritable extends Writable {
  private readonly chunks: string[] = [];

  override _write(chunk: Buffer | string, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
    this.chunks.push(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
    callback();
  }

  clear() {
    this.chunks.length = 0;
  }

  readText(): string {
    return this.chunks.join('');
  }
}

export const writeLine = (stream: Writable, message: string = '') => {
  stream.write(`${message}\n`);
};

export const readDocstringFile = async (filePath: string): Promise<string> => {
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
  return fs.readFile(absolutePath, 'utf8');
};

const formatResolvedIdentity = (identity: ResolvedAgentIdentity): string[] => {
  const lines = [`System thread: ${identity.agentId}`, `Resolved via: ${identity.source}`];
  if (identity.warning) {
    lines.push(`Warning: ${identity.warning}`);
  }
  return lines;
};

export const getHealthLabel = (state: TestEngineSessionState): TestEngineSessionHealth => {
  if (state.health) {
    return state.health;
  }
  if (state.initializing) {
    return 'initializing';
  }
  return 'ready';
};

export const sanitizeToolList = (tools: Array<{ name: string; description?: string }>): string[] =>
  tools.map(({ name, description }) => `${name}${description ? ` - ${description}` : ''}`);

export const fallbackToolList = (): string[] => [
  'session_start_new - Starts a new MCP browser session.',
  'sessions_clear - Clears existing Playwright browser contexts/pages.',
  'step_execute_single - Executes a single BDD step.',
  'step_execute_many - Executes multiple BDD steps in sequence.',
  'attach_existing_session - Attaches to an existing debug MCP session.',
];

export const formatStableToolList = (): string => fallbackToolList().join('\n');

export const writeJson = (stream: Writable, payload: JsonCommandPayload) => {
  stream.write(`${JSON.stringify(payload, null, 2)}\n`);
};

export const fetchJson = async <T>(
  url: string,
  options: {
    method?: 'GET' | 'POST';
    body?: unknown;
    timeoutMs?: number;
  } = {},
): Promise<T> => {
  const timeoutMs = options.timeoutMs ?? DAEMON_REQUEST_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let response: Response;
    try {
      response = await fetch(url, {
        method: options.method ?? 'GET',
        headers: options.body !== undefined ? { 'content-type': 'application/json' } : undefined,
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Daemon request timed out after ${timeoutMs}ms: ${url}`);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to reach session daemon at ${url}: ${message}`);
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Daemon request failed: HTTP ${response.status}${text ? ` - ${text}` : ''}`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
};

export const isStateReachable = async (state: TestEngineSessionState): Promise<boolean> => {
  if (!(await isProcessAlive(state.daemonPid))) {
    return false;
  }

  try {
    const response = await fetchJson<DaemonStatusResponse>(`http://${LOCALHOST}:${state.daemonPort}/status`, {
      timeoutMs: 3000,
    });
    return Boolean(response.ok);
  } catch {
    return false;
  }
};

export const printDaemonResponse = (
  streams: { stdout: Writable; stderr: Writable },
  response: DaemonCommandResponse,
): boolean => {
  if (response.stdout.trim()) {
    streams.stdout.write(response.stdout);
    if (!response.stdout.endsWith('\n')) {
      streams.stdout.write('\n');
    }
  }
  if (response.stderr.trim()) {
    streams.stderr.write(response.stderr);
    if (!response.stderr.endsWith('\n')) {
      streams.stderr.write('\n');
    }
  }
  return response.ok;
};

export const formatStateSummary = (identity: ResolvedAgentIdentity, state: TestEngineSessionState | null): string => {
  const lines = formatResolvedIdentity(identity);
  lines.push(`State file: ${getTestEngineStatePath(identity.agentId)}`);
  lines.push(`Session dir: ${getTestEngineSessionDir(identity.agentId)}`);
  if (!state) {
    lines.push('Has active session: no');
    return lines.join('\n');
  }

  lines.push('Has active session: yes');
  lines.push(`Session name: ${state.sessionName}`);
  lines.push(`Daemon PID: ${state.daemonPid}`);
  lines.push(`Daemon port: ${state.daemonPort}`);
  lines.push(`Health: ${getHealthLabel(state)}`);
  lines.push(`Mode: ${state.mode}`);
  lines.push(`Headed: ${state.headed ? 'yes' : 'no'}`);
  lines.push(`Started at: ${state.startedAt}`);
  lines.push(`Last activity: ${state.lastActivity}`);
  if (state.sessionId) {
    lines.push(`Session ID: ${state.sessionId}`);
  }
  if (state.logFile) {
    lines.push(`Log file: ${state.logFile}`);
  }
  if (state.initError) {
    lines.push(`Init error: ${state.initError}`);
  }
  if (state.brokenReason) {
    lines.push(`Broken reason: ${state.brokenReason}`);
  }
  if (state.currentCommand) {
    lines.push(`Current command: ${state.currentCommand}`);
  }
  if (state.lastCommand) {
    lines.push(`Last command: ${state.lastCommand}`);
  }
  if (state.smokeStep) {
    lines.push(`Smoke step: ${state.smokeStep}`);
  }
  if (state.smokeCheckedAt) {
    lines.push(`Smoke checked at: ${state.smokeCheckedAt}`);
  }
  if (state.eventLogFile) {
    lines.push(`Event log: ${state.eventLogFile}`);
  }
  if (state.lastPhase) {
    lines.push(`Last phase: ${state.lastPhase}`);
  }
  if (state.lastArtifacts?.length) {
    lines.push(`Last artifacts: ${state.lastArtifacts.join(', ')}`);
  }
  return lines.join('\n');
};

export const formatSessionStartSummary = (
  identity: ResolvedAgentIdentity,
  state: TestEngineSessionState,
  reused: boolean,
): string => {
  const lines = [
    ...formatResolvedIdentity(identity),
    'Status: Success',
    `Reused: ${reused ? 'yes' : 'no'}`,
    `Session name: ${state.sessionName}`,
    `Daemon PID: ${state.daemonPid}`,
    `Daemon port: ${state.daemonPort}`,
    `Health: ${getHealthLabel(state)}`,
    `Session dir: ${state.sessionDir ?? getTestEngineSessionDir(identity.agentId)}`,
  ];
  if (state.sessionId) {
    lines.push(`Session ID: ${state.sessionId}`);
  }
  if (state.logFile) {
    lines.push(`Log file: ${state.logFile}`);
  }
  return lines.join('\n');
};
