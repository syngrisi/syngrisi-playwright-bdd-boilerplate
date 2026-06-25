import process from 'node:process';
import type { Writable } from 'node:stream';

import { resolveAgentIdentity, type ResolvedAgentIdentity } from '../test-engine-agent-resolver';
import {
  getTestEngineEventLogPath,
  getTestEngineSessionDir,
  readSessionState,
  removeSessionState,
} from '../test-engine-state';

import { HELP_TEXT } from './constants';
import { parseCommandLine, quoteCommandToken } from './command-parser';
import {
  formatSessionStartSummary,
  formatStableToolList,
  formatStateSummary,
  getHealthLabel,
  printDaemonResponse,
  writeJson,
  writeLine,
} from './output-formatters';
import {
  attemptSessionSelfHeal,
  cleanUpStaleState,
  ensureActiveState,
  extractArtifacts,
  extractSuggestedCommand,
  forceShutdownSession,
  maybeResolveRuntimeSystemThread,
  normalizeStartupDetails,
  parseGlobalAgentId,
  requiresExplicitSystemThread,
  sendDaemonCommand,
  startDaemonProcess,
  validateCommandUsage,
} from './state-helpers';
import { TestEngineCliRuntime } from './cli-runtime';

export const resolveIdentityForCommand = async (
  explicitAgentId: string | null,
  fallbackAgentId: string | null,
  command?: string,
): Promise<ResolvedAgentIdentity> => {
  const manualAgentId = maybeResolveRuntimeSystemThread(explicitAgentId, fallbackAgentId);
  if (
    command &&
    requiresExplicitSystemThread(command) &&
    !manualAgentId &&
    process.env.TEST_ENGINE_ALLOW_HEURISTIC_RESOLUTION !== '1'
  ) {
    throw new Error(
      `Command "${command}" requires an explicit system thread. Set SYSTEM_THREAD or pass --system-thread.`,
    );
  }

  return resolveAgentIdentity({
    envAgentId: manualAgentId ?? undefined,
  });
};

export const handleDirectCommand = async (
  commandLine: string,
  streams: { stdout: Writable; stderr: Writable },
  fallbackAgentId: string | null,
  options: { jsonOutput: boolean },
): Promise<{ ok: boolean; resolvedAgentId: string | null }> => {
  const tokens = parseCommandLine(commandLine);
  if (tokens.length === 0) {
    return { ok: true, resolvedAgentId: fallbackAgentId };
  }

  const [command, ...rest] = tokens;
  const { tokens: strippedArgs, agentId: explicitAgentId } = parseGlobalAgentId(rest);
  validateCommandUsage(command, strippedArgs);

  if (command === 'help') {
    if (options.jsonOutput) {
      writeJson(streams.stdout, { ok: true, command: 'help', stdout: HELP_TEXT });
    } else {
      writeLine(streams.stdout, HELP_TEXT);
    }
    return { ok: true, resolvedAgentId: fallbackAgentId };
  }

  if (command === 'steps') {
    const runtime = new TestEngineCliRuntime({ stdout: streams.stdout, stderr: streams.stderr });
    try {
      const result = await runtime.executeTokens([command, ...strippedArgs], { interactive: false });
      return { ok: result.ok, resolvedAgentId: fallbackAgentId };
    } finally {
      await runtime.close();
    }
  }

  if (command === 'tools') {
    const identity = await resolveIdentityForCommand(explicitAgentId, fallbackAgentId, command);
    const state = await ensureActiveState(identity.agentId);
    const stdout = formatStableToolList();
    if (options.jsonOutput) {
      writeJson(streams.stdout, {
        ok: true,
        command,
        systemThread: identity.agentId,
        health: getHealthLabel(state),
        stdout,
        stderr: '',
        artifacts: [],
        state,
        eventLogFile: getTestEngineEventLogPath(identity.agentId),
        sessionDir: state.sessionDir ?? getTestEngineSessionDir(identity.agentId),
        phases: state.phases,
      });
    } else {
      writeLine(streams.stdout, stdout);
    }
    return { ok: true, resolvedAgentId: identity.agentId };
  }

  const identity = await resolveIdentityForCommand(explicitAgentId, fallbackAgentId, command);

  if (command === 'status' || command === 'resolve') {
    const state = await readSessionState(identity.agentId);
    const alive = await cleanUpStaleState(state);
    const refreshed = alive ? await readSessionState(identity.agentId) : null;
    if (options.jsonOutput) {
      writeJson(streams.stdout, {
        ok: true,
        command,
        systemThread: identity.agentId,
        health: refreshed ? getHealthLabel(refreshed) : undefined,
        state: refreshed,
        eventLogFile: getTestEngineEventLogPath(identity.agentId),
        sessionDir: refreshed?.sessionDir ?? getTestEngineSessionDir(identity.agentId),
        phases: refreshed?.phases,
      });
    } else {
      writeLine(streams.stdout, formatStateSummary(identity, refreshed));
    }
    return { ok: true, resolvedAgentId: identity.agentId };
  }

  if (command === 'reset') {
    const existingState = await readSessionState(identity.agentId);
    if (!existingState) {
      const message = `No active session found for agent "${identity.agentId}". State already clean.`;
      if (options.jsonOutput) {
        writeJson(streams.stdout, {
          ok: true,
          command,
          systemThread: identity.agentId,
          stdout: message,
          stderr: '',
          state: null,
          eventLogFile: getTestEngineEventLogPath(identity.agentId),
          sessionDir: getTestEngineSessionDir(identity.agentId),
        });
      } else {
        writeLine(streams.stdout, message);
      }
      return { ok: true, resolvedAgentId: identity.agentId };
    }

    await forceShutdownSession(existingState, 'manual_reset').catch(() => undefined);
    await removeSessionState(identity.agentId).catch(() => undefined);
    const message = `Reset session "${identity.agentId}" via local state cleanup.`;
    if (options.jsonOutput) {
      writeJson(streams.stdout, {
        ok: true,
        command,
        systemThread: identity.agentId,
        stdout: message,
        stderr: '',
        state: null,
        eventLogFile: getTestEngineEventLogPath(identity.agentId),
        sessionDir: getTestEngineSessionDir(identity.agentId),
      });
    } else {
      writeLine(streams.stdout, message);
    }
    return { ok: true, resolvedAgentId: identity.agentId };
  }

  if (command === 'start' || command === 'restart') {
    let headed = false;
    const sessionNameTokens: string[] = [];
    for (const token of strippedArgs) {
      if (token === '--headed') {
        headed = true;
        continue;
      }
      sessionNameTokens.push(token);
    }

    const sessionName = sessionNameTokens.join(' ').trim();
    if (!sessionName) {
      throw new Error(`${command} requires a session name.`);
    }

    const existingState = await readSessionState(identity.agentId);
    if (
      command === 'start' &&
      (await cleanUpStaleState(existingState)) &&
      getHealthLabel((await readSessionState(identity.agentId)) ?? existingState!) !== 'broken'
    ) {
      const activeState = await ensureActiveState(identity.agentId);
      if (options.jsonOutput) {
        writeJson(streams.stdout, {
          ok: true,
          command,
          systemThread: identity.agentId,
          health: getHealthLabel(activeState),
          state: activeState,
          reused: true,
          eventLogFile: getTestEngineEventLogPath(identity.agentId),
          sessionDir: activeState.sessionDir ?? getTestEngineSessionDir(identity.agentId),
          phases: activeState.phases,
        });
      } else {
        writeLine(streams.stdout, formatSessionStartSummary(identity, activeState, true));
      }
      return { ok: true, resolvedAgentId: identity.agentId };
    }

    if (existingState) {
      if (command === 'restart') {
        try {
          const response = await sendDaemonCommand(existingState, 'shutdown');
          printDaemonResponse(streams, response);
        } catch {
          // stale/broken session is being replaced anyway
        }
      }
      await attemptSessionSelfHeal(existingState, `${command}_replace_existing_session`).catch(() => undefined);
      await removeSessionState(identity.agentId);
    }

    const { state, startupStdout } = await startDaemonProcess(identity, sessionName, headed, false);
    if (options.jsonOutput) {
      writeJson(streams.stdout, {
        ok: true,
        command,
        systemThread: identity.agentId,
        health: getHealthLabel(state),
        state,
        reused: false,
        stdout: startupStdout,
        artifacts: extractArtifacts(startupStdout),
        eventLogFile: getTestEngineEventLogPath(identity.agentId),
        sessionDir: state.sessionDir ?? getTestEngineSessionDir(identity.agentId),
        phases: state.phases,
      });
    } else {
      writeLine(streams.stdout, formatSessionStartSummary(identity, state, false));
      const startupDetails = normalizeStartupDetails(startupStdout);
      if (startupDetails) {
        writeLine(streams.stdout, startupDetails);
      }
    }
    return { ok: true, resolvedAgentId: identity.agentId };
  }

  if (command === 'attach') {
    const existingState = await readSessionState(identity.agentId);
    if (
      (await cleanUpStaleState(existingState)) &&
      getHealthLabel((await readSessionState(identity.agentId)) ?? existingState!) !== 'broken'
    ) {
      const activeState = await ensureActiveState(identity.agentId);
      if (options.jsonOutput) {
        writeJson(streams.stdout, {
          ok: true,
          command,
          systemThread: identity.agentId,
          health: getHealthLabel(activeState),
          state: activeState,
          reused: true,
          eventLogFile: getTestEngineEventLogPath(identity.agentId),
          sessionDir: activeState.sessionDir ?? getTestEngineSessionDir(identity.agentId),
          phases: activeState.phases,
        });
      } else {
        writeLine(streams.stdout, formatSessionStartSummary(identity, activeState, true));
      }
      return { ok: true, resolvedAgentId: identity.agentId };
    }

    if (existingState) {
      await attemptSessionSelfHeal(existingState, 'attach_replace_existing_session').catch(() => undefined);
      await removeSessionState(identity.agentId);
    }

    const { state, startupStdout } = await startDaemonProcess(identity, `attached-${identity.agentId}`, false, true);
    if (options.jsonOutput) {
      writeJson(streams.stdout, {
        ok: true,
        command,
        systemThread: identity.agentId,
        health: getHealthLabel(state),
        state,
        reused: false,
        stdout: startupStdout,
        artifacts: extractArtifacts(startupStdout),
        eventLogFile: getTestEngineEventLogPath(identity.agentId),
        sessionDir: state.sessionDir ?? getTestEngineSessionDir(identity.agentId),
        phases: state.phases,
      });
    } else {
      writeLine(streams.stdout, formatSessionStartSummary(identity, state, false));
      const startupDetails = normalizeStartupDetails(startupStdout);
      if (startupDetails) {
        writeLine(streams.stdout, startupDetails);
      }
    }
    return { ok: true, resolvedAgentId: identity.agentId };
  }

  if (command === 'shutdown') {
    const existingState = await readSessionState(identity.agentId);
    if (!existingState) {
      throw new Error(`No active session found for agent "${identity.agentId}". Run start first.`);
    }

    const alive = await cleanUpStaleState(existingState);
    if (!alive) {
      await forceShutdownSession(existingState, 'shutdown_on_stale_state').catch(() => undefined);
      await removeSessionState(identity.agentId).catch(() => undefined);
      writeLine(streams.stdout, `Session "${identity.agentId}" was stale and has been force-cleaned locally.`);
      return { ok: true, resolvedAgentId: identity.agentId };
    }

    const refreshed = (await readSessionState(identity.agentId)) ?? existingState;
    if (getHealthLabel(refreshed) === 'broken') {
      await forceShutdownSession(refreshed, 'shutdown_on_broken_session');
      writeLine(
        streams.stdout,
        `Session "${identity.agentId}" was marked broken and has been force-shut down locally.`,
      );
      return { ok: true, resolvedAgentId: identity.agentId };
    }
  }

  const state = await ensureActiveState(identity.agentId);
  const daemonCommand =
    command === 'step-json' || command === 'batch-json'
      ? `${command} ${strippedArgs[0] ?? ''}`.trimEnd()
      : [command, ...strippedArgs.map(quoteCommandToken)].join(' ');
  const response = await sendDaemonCommand(state, daemonCommand);
  const artifacts = extractArtifacts(`${response.stdout}\n${response.stderr}`);
  const responseState = response.state ?? (await readSessionState(identity.agentId));
  let ok: boolean;
  if (options.jsonOutput) {
    writeJson(streams.stdout, {
      ok: response.ok,
      command,
      systemThread: identity.agentId,
      health: responseState ? getHealthLabel(responseState) : undefined,
      stdout: response.stdout,
      stderr: response.stderr,
      artifacts,
      state: responseState,
      eventLogFile: getTestEngineEventLogPath(identity.agentId),
      suggestedCommand: extractSuggestedCommand(`${response.stdout}\n${response.stderr}`),
      sessionDir: responseState?.sessionDir ?? getTestEngineSessionDir(identity.agentId),
      phases: responseState?.phases,
    });
    ok = response.ok;
  } else {
    ok = printDaemonResponse(streams, response);
  }
  return { ok, resolvedAgentId: identity.agentId };
};
