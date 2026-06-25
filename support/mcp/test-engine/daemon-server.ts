import { promises as fs } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';

import {
  appendSessionEvent,
  ensureTestEngineSessionDir,
  getTestEngineEventLogPath,
  removeSessionStateIfOwned,
  writeSessionState,
  type TestEngineSessionState,
} from '../test-engine-state';

import {
  LOCALHOST,
  type CommandExecutionResult,
  type DaemonCommandResponse,
  type DaemonCommandTaskResult,
  type DaemonStatusResponse,
  type ParsedCliArgs,
} from './constants';
import { quoteCommandToken } from './command-parser';
import { BufferingWritable } from './output-formatters';
import {
  extractArtifacts,
  makeCommandId,
  parseSessionMetadata,
  shouldMarkBrokenFromText,
  shouldTreatCommandErrorAsRecoverable,
  updatePhaseList,
} from './state-helpers';
import { TestEngineCliRuntime } from './cli-runtime';
import { handleDirectCommand } from './direct-commands';
import { ERROR_CODES, SESSION_NOT_STARTED_TEXT_MARKER } from '../utils/protocol';

export const runDaemonServer = async (parsed: ParsedCliArgs): Promise<number> => {
  const agentId = parsed.agentId;
  if (!agentId) {
    throw new Error('Daemon server requires --system-thread.');
  }

  const initialCommand = parsed.daemonAttach
    ? 'attach'
    : (() => {
        const [sessionName] = parsed.commands;
        if (!sessionName) {
          throw new Error('Daemon start requires a session name.');
        }
        return `start ${quoteCommandToken(sessionName)}${parsed.daemonHeaded ? ' --headed' : ''}`;
      })();

  const stdoutBuffer = new BufferingWritable();
  const stderrBuffer = new BufferingWritable();
  const runtime = new TestEngineCliRuntime({ stdout: stdoutBuffer, stderr: stderrBuffer }, { keepBridgeAlive: true });
  const sessionDir = await ensureTestEngineSessionDir(agentId);
  let currentState: TestEngineSessionState = {
    agentId: agentId,
    sessionName: parsed.daemonAttach ? `attached-${agentId}` : (parsed.commands[0] ?? `agent-${agentId}`),
    daemonPid: process.pid,
    daemonPort: 0,
    sessionDir,
    headed: parsed.daemonHeaded,
    mode: parsed.daemonAttach ? 'attach' : 'start',
    startedAt: new Date().toISOString(),
    lastActivity: new Date().toISOString(),
    initializing: true,
    health: 'initializing',
    lastPhase: 'boot',
    phases: [
      {
        name: 'boot',
        status: 'running',
        startedAt: new Date().toISOString(),
        details: parsed.daemonAttach ? 'daemon attach bootstrap' : 'daemon session bootstrap',
      },
    ],
    ownedResources: {
      daemonPid: process.pid,
    },
  };
  let commandQueue: Promise<void> = Promise.resolve();

  const persistState = async (patch: Partial<TestEngineSessionState>) => {
    currentState = {
      ...currentState,
      ...patch,
    };
    await writeSessionState(agentId, currentState);
  };

  const markPhase = async (name: string, status: 'running' | 'ok' | 'error', details?: string) => {
    const nextPhases = updatePhaseList(currentState, name, status, details);
    await persistState({
      phases: nextPhases,
      lastPhase: name,
    });
    await appendSessionEvent(agentId, {
      type: 'phase',
      phase: name,
      status,
      details,
    });
  };

  const markBroken = async (reason: string) => {
    await persistState({
      health: 'broken',
      brokenReason: reason,
      currentCommand: undefined,
      initializing: false,
      lastActivity: new Date().toISOString(),
      phases: updatePhaseList(currentState, currentState.lastPhase ?? 'unknown', 'error', reason),
    });
    await appendSessionEvent(agentId, { type: 'session_broken', reason, health: 'broken' });
  };

  const executeDaemonCommand = async (commandLine: string): Promise<DaemonCommandTaskResult> => {
    const commandId = makeCommandId();
    stdoutBuffer.clear();
    stderrBuffer.clear();

    await persistState({
      health: 'busy',
      currentCommand: commandLine,
      lastCommand: commandLine,
      lastCommandId: commandId,
      brokenReason: undefined,
      lastActivity: new Date().toISOString(),
    });
    await markPhase(
      commandLine.startsWith('step') || commandLine.startsWith('batch') ? 'executing_steps' : 'executing_command',
      'running',
      commandLine,
    );
    await appendSessionEvent(agentId, {
      type: 'command_started',
      commandId,
      command: commandLine,
    });

    const runCommandOnce = async (): Promise<CommandExecutionResult> => {
      if (
        commandLine === 'status' ||
        commandLine === 'resolve' ||
        commandLine === 'tools' ||
        commandLine === 'help' ||
        commandLine.startsWith('steps ')
      ) {
        return handleDirectCommand(commandLine, { stdout: stdoutBuffer, stderr: stderrBuffer }, agentId, {
          jsonOutput: false,
        }).then((value) => ({ ok: value.ok, shouldExit: false }));
      }
      return runtime.executeLine(commandLine, { interactive: false });
    };

    let result = await runCommandOnce();
    let stdout = stdoutBuffer.readText();
    let stderr = stderrBuffer.readText();
    let combinedText = `${stdout}\n${stderr}`;
    let recoveryNote = '';

    // The bridge occasionally drops back to bootstrap state ("Session not started")
    // mid-session. Attempt one automatic session restart + command retry before
    // surfacing the failure. Prefer the structured errorCode; fall back to text.
    const isSessionNotStarted = (res: CommandExecutionResult, text: string): boolean =>
      res.envelope?.errorCode === ERROR_CODES.SESSION_NOT_STARTED || text.includes(SESSION_NOT_STARTED_TEXT_MARKER);
    const lostBridgeSession =
      !result.ok &&
      isSessionNotStarted(result, combinedText) &&
      !commandLine.startsWith('start') &&
      commandLine !== 'attach' &&
      !commandLine.startsWith('shutdown');

    if (lostBridgeSession) {
      await appendSessionEvent(agentId, {
        type: 'auto_recovery_started',
        commandId,
        command: commandLine,
        reason: 'Bridge lost the browser session (reset to bootstrap).',
      });
      stdoutBuffer.clear();
      stderrBuffer.clear();
      const recovery = await runtime
        .executeLine(initialCommand, { interactive: false })
        .catch(() => ({ ok: false, shouldExit: false }));

      if (recovery.ok) {
        stdoutBuffer.clear();
        stderrBuffer.clear();
        result = await runCommandOnce();
        stdout = stdoutBuffer.readText();
        stderr = stderrBuffer.readText();
        combinedText = `${stdout}\n${stderr}`;
        recoveryNote =
          'Note: the bridge lost the browser session; it was restarted automatically (page state was reset) and the command was retried.\n';
        await appendSessionEvent(agentId, {
          type: result.ok ? 'auto_recovery_succeeded' : 'auto_recovery_retry_failed',
          commandId,
          command: commandLine,
        });
      } else {
        await appendSessionEvent(agentId, {
          type: 'auto_recovery_failed',
          commandId,
          command: commandLine,
        });
      }
    }

    const broken = !result.ok && shouldMarkBrokenFromText(combinedText);
    const artifacts = extractArtifacts(combinedText);

    // Derive the smoke step from the structured envelope of the last step the
    // start/attach sequence ran (its message holds the step Result), rather than
    // regexing the multiplexed raw stdout.
    const smokeMessage = result.envelope?.message ?? '';
    const smokeStep = smokeMessage.includes('Test message from diagnostic step')
      ? 'I test'
      : /Result:\s+"/u.test(smokeMessage)
        ? 'I get current URL'
        : undefined;
    const rawBrokenReason = stderr.trim() || stdout.trim() || 'Session became unusable.';
    const brokenReason = isSessionNotStarted(result, combinedText)
      ? `Bridge lost the browser session and automatic recovery did not restore it. Run "restart <sessionName>" to recover. Original error: ${rawBrokenReason}`
      : rawBrokenReason;
    await persistState({
      health: broken ? 'broken' : 'ready',
      brokenReason: broken ? brokenReason : undefined,
      currentCommand: undefined,
      lastActivity: new Date().toISOString(),
      lastArtifacts: artifacts,
      ...(commandLine.startsWith('start ') || commandLine === 'attach'
        ? {
            smokeCheckedAt: new Date().toISOString(),
            smokeStep,
          }
        : {}),
    });
    await markPhase(
      commandLine.startsWith('step') || commandLine.startsWith('batch') ? 'executing_steps' : 'executing_command',
      broken ? 'error' : 'ok',
      commandLine,
    );
    await appendSessionEvent(agentId, {
      type: broken ? 'command_broken' : 'command_finished',
      commandId,
      command: commandLine,
      ok: result.ok,
      shouldExit: result.shouldExit,
      artifacts,
      stderr: stderr.trim() || undefined,
    });

    return { result, stdout: recoveryNote ? `${recoveryNote}${stdout}` : stdout, stderr };
  };

  const server = http.createServer(async (request, response) => {
    const sendJson = (status: number, payload: unknown) => {
      response.statusCode = status;
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify(payload));
    };

    try {
      if (request.method === 'GET' && request.url === '/status') {
        sendJson(200, { ok: true, state: currentState } satisfies DaemonStatusResponse);
        return;
      }

      if (request.method === 'POST' && request.url === '/command') {
        let body = '';
        for await (const chunk of request) {
          body += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
        }

        const payload = JSON.parse(body || '{}') as { command?: string };
        const command = payload.command?.trim();
        if (!command) {
          sendJson(400, {
            ok: false,
            shouldExit: false,
            stdout: '',
            stderr: 'Missing command.',
          } satisfies DaemonCommandResponse);
          return;
        }

        let resolveTask: ((value: DaemonCommandResponse) => void) | null = null;
        let rejectTask: ((reason?: unknown) => void) | null = null;
        const taskResponse = new Promise<DaemonCommandResponse>((resolve, reject) => {
          resolveTask = resolve;
          rejectTask = reject;
        });

        commandQueue = commandQueue
          .catch(() => undefined)
          .then(async () => {
            try {
              const { result, stdout, stderr } = await executeDaemonCommand(command);
              resolveTask?.({
                ok: result.ok,
                shouldExit: result.shouldExit,
                stdout,
                stderr,
              });
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              if (shouldTreatCommandErrorAsRecoverable(message)) {
                await persistState({
                  health: 'ready',
                  brokenReason: undefined,
                  currentCommand: undefined,
                  lastActivity: new Date().toISOString(),
                });
                await markPhase(
                  command.startsWith('step') || command.startsWith('batch') ? 'executing_steps' : 'executing_command',
                  'error',
                  message,
                );
                await appendSessionEvent(agentId, {
                  type: 'command_failed_recoverable',
                  command: command,
                  stderr: message,
                });
                resolveTask?.({
                  ok: false,
                  shouldExit: false,
                  stdout: '',
                  stderr: message,
                  state: currentState,
                });
                return;
              }

              await markBroken(message);
              rejectTask?.(new Error(message));
            }
          });

        try {
          const commandResponse = await taskResponse;
          sendJson(200, {
            ...commandResponse,
            state: currentState,
          } satisfies DaemonCommandResponse);

          if (command.startsWith('shutdown') || commandResponse.shouldExit) {
            setImmediate(async () => {
              await appendSessionEvent(agentId, {
                type: 'shutdown',
                lastCommand: command,
              });
              await persistState({
                health: 'shutting_down',
                currentCommand: undefined,
                lastActivity: new Date().toISOString(),
              });
              await removeSessionStateIfOwned(agentId, process.pid);
              await runtime.close();
              await new Promise<void>((resolve) => server.close(() => resolve()));
              process.exit(0);
            });
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          sendJson(500, {
            ok: false,
            shouldExit: false,
            stdout: '',
            stderr: message,
          } satisfies DaemonCommandResponse);
        }
        return;
      }

      sendJson(404, { ok: false, error: 'Not found' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      sendJson(500, { ok: false, error: message });
    }
  });

  try {
    await markPhase('starting_daemon_http', 'running');
    await new Promise<void>((resolve, reject) => {
      server.listen(0, LOCALHOST, () => resolve());
      server.once('error', reject);
    });
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Failed to determine daemon port.');
    }

    currentState.daemonPort = address.port;
    currentState.eventLogFile = getTestEngineEventLogPath(agentId);
    currentState.ownedResources = {
      daemonPid: process.pid,
      daemonPort: currentState.daemonPort,
    };
    await writeSessionState(agentId, currentState);
    await markPhase('starting_daemon_http', 'ok', `port=${currentState.daemonPort}`);
    await appendSessionEvent(agentId, {
      type: 'daemon_started',
      daemonPid: process.pid,
      daemonPort: currentState.daemonPort,
      eventLogFile: currentState.eventLogFile,
      sessionDir: currentState.sessionDir,
    });

    await markPhase(parsed.daemonAttach ? 'attaching_remote_session' : 'starting_browser_session', 'running');
    const { result, stdout: stdoutText, stderr: stderrText } = await executeDaemonCommand(initialCommand);

    if (!result.ok) {
      currentState.initializing = false;
      currentState.initError = stderrText || stdoutText || 'Failed to initialize session daemon.';
      await markBroken(currentState.initError);
      throw new Error(currentState.initError);
    }

    currentState = {
      ...currentState,
      ...parseSessionMetadata(stdoutText),
      initializing: false,
      health: 'ready',
      initError: undefined,
      lastActivity: new Date().toISOString(),
    };
    await writeSessionState(agentId, currentState);
    await markPhase(parsed.daemonAttach ? 'attaching_remote_session' : 'starting_browser_session', 'ok');
    await markPhase('smoke_check', 'running', currentState.smokeStep ?? 'bootstrap smoke');
    await markPhase('smoke_check', 'ok', currentState.smokeStep ?? 'bootstrap smoke');
    await appendSessionEvent(agentId, {
      type: 'session_ready',
      sessionId: currentState.sessionId,
      logFile: currentState.logFile,
      smokeStep: currentState.smokeStep,
    });

    if (parsed.statusFile) {
      await fs.mkdir(path.dirname(parsed.statusFile), { recursive: true });
      await fs.writeFile(
        parsed.statusFile,
        JSON.stringify({ ok: true, pid: process.pid, startupStdout: stdoutText }),
        'utf8',
      );
    }

    await new Promise<void>((resolve) => {
      server.on('close', () => resolve());
    });
    return 0;
  } catch (error) {
    if (parsed.statusFile) {
      await fs.mkdir(path.dirname(parsed.statusFile), { recursive: true });
      const message = error instanceof Error ? error.message : String(error);
      await fs.writeFile(parsed.statusFile, JSON.stringify({ ok: false, error: message }), 'utf8');
    }
    throw error;
  } finally {
    await runtime.close();
    if (currentState.initError) {
      await removeSessionStateIfOwned(agentId, process.pid).catch(() => undefined);
    }
  }
};
