import { promises as fs } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

import { e2eRoot } from '../config';
import { isProcessAlive, type ResolvedAgentIdentity } from '../test-engine-agent-resolver';
import {
  appendSessionEvent,
  ensureTestEngineSessionDir,
  patchSessionState,
  readSessionState,
  removeSessionState,
  removeSessionStateIfOwned,
  updateSessionActivity,
  waitForSessionStateReady,
  type TestEngineSessionState,
} from '../test-engine-state';
import type { Data } from '../utils/types';
import { getStepDefinitions } from '../utils/stepDefinitions';
import { SESSION_NOT_STARTED_TEXT_MARKER } from '../utils/protocol';

import { DAEMON_START_TIMEOUT_MS, LOCALHOST, TSX_LOADER, TSX_PREFLIGHT, type DaemonCommandResponse } from './constants';
import { fetchJson, getHealthLabel, isStateReachable } from './output-formatters';

export const loadLiveStepDefinitions = (): Data => {
  const raw = getStepDefinitions();
  return JSON.parse(raw) as Data;
};

export const parseGlobalAgentId = (tokens: string[]): { tokens: string[]; agentId: string | null } => {
  const stripped: string[] = [];
  let agentId: string | null = null;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === '--system-thread') {
      const value = tokens[index + 1];
      if (!value) {
        throw new Error('Missing value after --system-thread.');
      }
      agentId = value;
      index += 1;
      continue;
    }
    stripped.push(token);
  }

  return { tokens: stripped, agentId };
};

export const validateCommandUsage = (command: string, args: string[]) => {
  if (command === 'batch' && args.length < 2) {
    throw new Error('batch requires at least 2 steps.');
  }
  if (command === 'step-json' && args.length !== 1) {
    throw new Error('step-json expects exactly 1 JSON argument.');
  }
  if (command === 'batch-json' && args.length !== 1) {
    throw new Error('batch-json expects exactly 1 JSON argument.');
  }
};

export const parseSessionMetadata = (stdout: string): Pick<TestEngineSessionState, 'sessionId' | 'logFile'> => {
  const sessionIdMatch = stdout.match(/with ID ([^\s.]+)/u);
  const logFileMatch = stdout.match(/Logs at ([^\s]+\.jsonl)/u);
  return {
    ...(sessionIdMatch?.[1] ? { sessionId: sessionIdMatch[1] } : {}),
    ...(logFileMatch?.[1] ? { logFile: logFileMatch[1] } : {}),
  };
};

const stripLeadingSuccessLine = (stdout: string): string => {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return '';
  }

  return trimmed.replace(/^Status:\s+Success\s*/u, '').trim();
};

export const requiresExplicitSystemThread = (command: string): boolean =>
  command === 'start' ||
  command === 'restart' ||
  command === 'attach' ||
  command === 'status' ||
  command === 'resolve' ||
  command === 'step' ||
  command === 'step-json' ||
  command === 'batch' ||
  command === 'batch-json' ||
  command === 'clear' ||
  command === 'shutdown' ||
  command === 'reset';

export const maybeResolveRuntimeSystemThread = (
  explicitAgentId: string | null,
  fallbackAgentId: string | null,
): string | null => explicitAgentId ?? fallbackAgentId ?? process.env.SYSTEM_THREAD?.trim() ?? null;

export const updatePhaseList = (
  state: TestEngineSessionState,
  name: string,
  status: 'running' | 'ok' | 'error',
  details?: string,
): TestEngineSessionState['phases'] => {
  const phases = [...(state.phases ?? [])];
  const now = new Date().toISOString();
  const last = phases[phases.length - 1];

  if (status === 'running') {
    phases.push({ name, status, startedAt: now, details });
    return phases;
  }

  if (last && last.name === name && last.status === 'running') {
    last.status = status;
    last.finishedAt = now;
    if (details) {
      last.details = details;
    }
    return phases;
  }

  phases.push({
    name,
    status,
    startedAt: now,
    finishedAt: now,
    details,
  });
  return phases;
};

// Presentation-layer convenience: turns the first numbered suggestion in a
// step-not-found message into a ready-to-run `step "..."` hint for the --json
// view. This enriches human-readable output, not a cross-layer control contract
// (control flow keys off the structured envelope's status/errorCode instead).
export const extractSuggestedCommand = (text: string): string | undefined => {
  const match = text.match(/^\d+\.\s+"([^"]+)"/m);
  return match?.[1] ? `step "${match[1]}"` : undefined;
};

export const normalizeStartupDetails = (stdout: string): string => {
  const stripped = stripLeadingSuccessLine(stdout);
  if (!stripped) {
    return '';
  }

  const [summary] = stripped.split(/\nAvailable test steps\b/iu, 1);
  return (summary ?? '').trim();
};

export const makeCommandId = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const extractArtifacts = (text: string): string[] => {
  const matches = text.match(/\/Users\/[^\s"]+\.(?:png|jsonl|log|yml|yaml|json)/gu) ?? [];
  return [...new Set(matches)];
};

export const shouldMarkBrokenFromText = (text: string): boolean =>
  text.includes(SESSION_NOT_STARTED_TEXT_MARKER) ||
  text.includes('Connection closed') ||
  text.includes('Failed to reach session daemon') ||
  text.includes('Session daemon for agent');

export const shouldTreatCommandErrorAsRecoverable = (text: string): boolean =>
  text.includes('Request timed out') ||
  text.includes('timed out after') ||
  text.includes('TimeoutError') ||
  text.includes('locator.click: Timeout') ||
  text.includes('locator.fill: Timeout') ||
  text.includes('locator.waitFor: Timeout') ||
  text.includes('element is not enabled');

export const cleanUpStaleState = async (state: TestEngineSessionState | null): Promise<boolean> => {
  if (!state) {
    return false;
  }
  const alive = await isStateReachable(state);
  if (alive) {
    return true;
  }
  await removeSessionState(state.agentId);
  return false;
};

export const attemptSessionSelfHeal = async (state: TestEngineSessionState, reason: string): Promise<void> => {
  await appendSessionEvent(state.agentId, {
    type: 'self_heal_started',
    reason,
    daemonPid: state.daemonPid,
    daemonPort: state.daemonPort,
  });

  try {
    await fetchJson<DaemonCommandResponse>(`http://${LOCALHOST}:${state.daemonPort}/command`, {
      method: 'POST',
      body: { command: 'shutdown' },
      timeoutMs: 5000,
    }).catch(() => undefined);
  } finally {
    if (await isProcessAlive(state.daemonPid)) {
      try {
        process.kill(state.daemonPid, 'SIGTERM');
      } catch {
        // Ignore race: daemon may have exited after shutdown request.
      }
    }

    if (process.platform !== 'win32') {
      try {
        process.kill(-state.daemonPid, 'SIGTERM');
      } catch {
        // Ignore race: process group may already be gone.
      }
    }

    await removeSessionStateIfOwned(state.agentId, state.daemonPid).catch(() => undefined);
    await appendSessionEvent(state.agentId, {
      type: 'self_heal_finished',
      reason,
    }).catch(() => undefined);
  }
};

export const startDaemonProcess = async (
  identity: ResolvedAgentIdentity,
  sessionName: string,
  headed: boolean,
  attachMode: boolean,
): Promise<{ state: TestEngineSessionState; startupStdout: string }> => {
  const sessionDir = await ensureTestEngineSessionDir(identity.agentId);
  const statusFile = path.join(sessionDir, 'daemon-status.json');
  const readStatusFile = async (): Promise<{ ok?: boolean; error?: string; startupStdout?: string } | null> => {
    const raw = await fs.readFile(statusFile, 'utf8').catch(() => '');
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as { ok?: boolean; error?: string; startupStdout?: string };
    } catch {
      return { ok: false, error: `Failed to parse daemon status file for agent ${identity.agentId}.` };
    }
  };
  const child = spawn(
    process.execPath,
    [
      '--require',
      TSX_PREFLIGHT,
      '--import',
      TSX_LOADER,
      path.join('support', 'mcp', 'test-engine-cli.ts'),
      '--daemon-server',
      '--status-file',
      statusFile,
      '--system-thread',
      identity.agentId,
      ...(attachMode ? ['--daemon-attach'] : []),
      ...(headed ? ['--headed'] : []),
      ...(attachMode ? [] : [sessionName]),
    ],
    {
      cwd: e2eRoot,
      env: {
        ...(process.env as Record<string, string>),
        MCP_BRIDGE_IGNORE_STDIN_END: '1',
      },
      detached: true,
      stdio: 'ignore',
    },
  );

  child.unref();

  try {
    const startedAt = Date.now();
    let state: TestEngineSessionState | null = null;

    while (Date.now() - startedAt < DAEMON_START_TIMEOUT_MS) {
      const status = await readStatusFile();
      if (status?.ok === false) {
        throw new Error(status.error ?? `Daemon startup failed for agent ${identity.agentId}.`);
      }

      const candidate = await readSessionState(identity.agentId);
      if (candidate && candidate.daemonPid === child.pid && !candidate.initializing) {
        state = candidate;
        break;
      }

      if (!(await isProcessAlive(child.pid ?? -1))) {
        throw new Error(
          status?.error ??
            `Daemon ${child.pid} exited before publishing a ready session state for agent ${identity.agentId}.`,
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    if (!state) {
      state = await waitForSessionStateReady(identity.agentId, 1000, 100).catch(() => null);
    }

    if (!state || state.daemonPid !== child.pid) {
      throw new Error(
        `Timed out waiting for daemon ${child.pid} to publish a ready session state for agent ${identity.agentId}.`,
      );
    }

    const status = await readStatusFile();
    const parsed = status ?? {};
    if (parsed.ok === false) {
      throw new Error(parsed.error ?? `Daemon startup failed for agent ${identity.agentId}.`);
    }
    const _startupStdout = parsed.startupStdout ?? '';
    return { state, startupStdout: parsed.startupStdout ?? '' };
  } finally {
    await fs.rm(statusFile, { force: true }).catch(() => undefined);
  }
};

export const ensureActiveState = async (agentId: string): Promise<TestEngineSessionState> => {
  const state = await readSessionState(agentId);
  if (!state) {
    throw new Error(`No active session found for agent "${agentId}". Run start first.`);
  }
  const alive = await cleanUpStaleState(state);
  if (!alive) {
    await attemptSessionSelfHeal(state, 'stale_or_unreachable_state').catch(() => undefined);
    throw new Error(`No active session found for agent "${agentId}". Run start first.`);
  }
  const refreshed = (await readSessionState(agentId)) ?? state;
  if (getHealthLabel(refreshed) === 'broken') {
    throw new Error(
      `Session "${agentId}" is marked broken. ${refreshed.brokenReason ?? 'Run start again to create a fresh session.'}`,
    );
  }
  return refreshed;
};

export const waitForDaemonShutdown = async (state: TestEngineSessionState, timeoutMs = 10000): Promise<void> => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const latestState = await readSessionState(state.agentId);
    if (!latestState || latestState.daemonPid !== state.daemonPid) {
      return;
    }

    if (!(await isProcessAlive(state.daemonPid))) {
      await removeSessionStateIfOwned(state.agentId, state.daemonPid).catch(() => undefined);
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  if (await isProcessAlive(state.daemonPid)) {
    try {
      process.kill(state.daemonPid, 'SIGTERM');
    } catch {
      // Ignore race: daemon may have already exited.
    }
  }

  if (process.platform !== 'win32') {
    try {
      process.kill(-state.daemonPid, 'SIGTERM');
    } catch {
      // Ignore race: process group may already be gone.
    }
  }

  await removeSessionStateIfOwned(state.agentId, state.daemonPid).catch(() => undefined);
};

export const forceShutdownSession = async (state: TestEngineSessionState, reason: string): Promise<void> => {
  await appendSessionEvent(state.agentId, {
    type: 'force_shutdown_started',
    reason,
    daemonPid: state.daemonPid,
    daemonPort: state.daemonPort,
  }).catch(() => undefined);

  try {
    await fetchJson<DaemonCommandResponse>(`http://${LOCALHOST}:${state.daemonPort}/command`, {
      method: 'POST',
      body: { command: 'shutdown' },
      timeoutMs: 3000,
    }).catch(() => undefined);
  } finally {
    if (await isProcessAlive(state.daemonPid)) {
      try {
        process.kill(state.daemonPid, 'SIGTERM');
      } catch {
        // Ignore race: daemon may have already exited.
      }
    }

    if (process.platform !== 'win32') {
      try {
        process.kill(-state.daemonPid, 'SIGTERM');
      } catch {
        // Ignore race: process group may already be gone.
      }
    }

    await removeSessionStateIfOwned(state.agentId, state.daemonPid).catch(() => undefined);
    await appendSessionEvent(state.agentId, {
      type: 'force_shutdown_finished',
      reason,
    }).catch(() => undefined);
  }
};

export const sendDaemonCommand = async (
  state: TestEngineSessionState,
  command: string,
): Promise<DaemonCommandResponse> => {
  let response: DaemonCommandResponse;
  try {
    response = await fetchJson<DaemonCommandResponse>(`http://${LOCALHOST}:${state.daemonPort}/command`, {
      method: 'POST',
      body: { command },
    });
  } catch (error) {
    const alive = await cleanUpStaleState(state);
    const message = error instanceof Error ? error.message : String(error);
    if (!alive) {
      await attemptSessionSelfHeal(state, 'daemon_unreachable').catch(() => undefined);
      throw new Error(
        `Session daemon for agent "${state.agentId}" is no longer reachable. Run start again. Last error: ${message}`,
      );
    }
    throw new Error(`Failed to execute "${command}" for agent "${state.agentId}": ${message}`);
  }

  if (response.ok) {
    await updateSessionActivity(state.agentId);
  } else if (shouldMarkBrokenFromText(`${response.stdout}\n${response.stderr}`)) {
    await patchSessionState(state.agentId, {
      health: 'broken',
      brokenReason: response.stderr.trim() || response.stdout.trim() || 'Session became unusable.',
      currentCommand: undefined,
      lastActivity: new Date().toISOString(),
    });
  }

  if (response.ok && command.trim().startsWith('shutdown')) {
    await waitForDaemonShutdown(state).catch(() => undefined);
  }

  return response;
};
