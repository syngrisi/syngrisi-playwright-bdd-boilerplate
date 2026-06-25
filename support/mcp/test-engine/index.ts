import process from 'node:process';

import { isProcessAlive } from '../test-engine-agent-resolver';
import { cleanupSessionStates } from '../test-engine-state';

import { HELP_TEXT, type TestEngineCliOptions } from './constants';
import { parseCliArgs } from './command-parser';
import { writeJson, writeLine } from './output-formatters';
import { handleDirectCommand } from './direct-commands';
import { runDaemonServer } from './daemon-server';

export const runTestEngineCli = async (argv: string[], options: TestEngineCliOptions = {}): Promise<number> => {
  const parsed = parseCliArgs(argv);
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;

  await cleanupSessionStates({ isProcessAlive });

  if (parsed.daemonServer) {
    return runDaemonServer(parsed);
  }

  if (parsed.showHelp || parsed.commands.length === 0) {
    if (parsed.jsonOutput) {
      writeJson(stdout, { ok: true, command: 'help', stdout: HELP_TEXT });
    } else {
      writeLine(stdout, HELP_TEXT);
    }
    return 0;
  }

  let fallbackAgentId: string | null = parsed.agentId;
  for (const command of parsed.commands) {
    const result = await handleDirectCommand(command, { stdout, stderr }, fallbackAgentId, {
      jsonOutput: parsed.jsonOutput,
    });
    if (!result.ok) {
      return 1;
    }
    fallbackAgentId = result.resolvedAgentId;
  }

  return 0;
};
