import fs from 'node:fs';
import process from 'node:process';
import readline from 'node:readline/promises';
import type { Readable, Writable } from 'node:stream';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

import { e2eRoot } from '../config';
import type { StepExecutorParams } from '../utils/stepExecutor';

import {
  BRIDGE_ENTRY,
  HELP_TEXT,
  NPX_BIN,
  TOOL_TIMEOUTS,
  type CommandExecutionResult,
  type TestEngineCliOptions,
} from './constants';
import {
  extractContentText,
  formatStepSearchResults,
  formatStepSuggestions,
  parseBatchJsonInput,
  parseStepJsonInput,
  tokenizeCommand,
} from './command-parser';
import { fallbackToolList, readDocstringFile, sanitizeToolList, writeLine } from './output-formatters';
import { loadLiveStepDefinitions } from './state-helpers';
import { extractEnvelope, type ResultEnvelope } from '../utils/protocol';

export class TestEngineCliRuntime {
  private readonly stdin: Readable;
  private readonly stdout: Writable;
  private readonly stderr: Writable;
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private bridgeStderr = '';
  // Envelope of the most recent tool result, surfaced via CommandExecutionResult
  private lastEnvelope: ResultEnvelope | null = null;

  constructor(options: TestEngineCliOptions, runtimeOptions: { keepBridgeAlive?: boolean } = {}) {
    this.stdin = options.stdin ?? process.stdin;
    this.stdout = options.stdout ?? process.stdout;
    this.stderr = options.stderr ?? process.stderr;
    this.keepBridgeAlive = runtimeOptions.keepBridgeAlive ?? false;
  }

  private readonly keepBridgeAlive: boolean;

  async close(): Promise<void> {
    const transport = this.transport;
    const client = this.client;

    this.transport = null;
    this.client = null;

    await Promise.allSettled([
      (async () => {
        if (client) {
          await client.close().catch(() => undefined);
        }
      })(),
      (async () => {
        if (transport) {
          await transport.close().catch(() => undefined);
        }
      })(),
    ]);
  }

  private async ensureConnected(): Promise<Client> {
    if (this.client) {
      return this.client;
    }

    const transport = new StdioClientTransport({
      command: NPX_BIN,
      args: ['tsx', BRIDGE_ENTRY],
      cwd: e2eRoot,
      env: {
        ...(process.env as Record<string, string>),
        ...(this.keepBridgeAlive ? { MCP_BRIDGE_IGNORE_STDIN_END: '1' } : {}),
      },
      stderr: 'pipe',
    });

    const stderrStream = transport.stderr as Readable | undefined;
    stderrStream?.setEncoding('utf8');
    stderrStream?.on('data', (chunk: string | Buffer) => {
      this.bridgeStderr += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    });

    const client = new Client({ name: 'mcp-test-engine-cli', version: '0.0.0' }, { capabilities: {} });

    await client.connect(transport);
    this.transport = transport;
    this.client = client;
    return client;
  }

  private printSuccess(message: string) {
    writeLine(this.stdout, message);
  }

  private printError(message: string) {
    writeLine(this.stderr, message);
  }

  private async printToolResult(result: unknown): Promise<boolean> {
    this.lastEnvelope = extractEnvelope(result);
    const text = extractContentText(result);
    const isError = Boolean(
      result && typeof result === 'object' && 'isError' in result && (result as { isError?: boolean }).isError,
    );

    if (text) {
      if (isError) {
        this.printError(text);
      } else {
        this.printSuccess(text);
      }
      return !isError;
    }

    const serialized = JSON.stringify(result, null, 2);
    if (isError) {
      this.printError(serialized);
    } else {
      this.printSuccess(serialized);
    }
    return !isError;
  }

  private async runStart(args: string[]): Promise<boolean> {
    let headed = false;
    const sessionNameTokens: string[] = [];

    for (const token of args) {
      if (token === '--headed') {
        headed = true;
        continue;
      }
      sessionNameTokens.push(token);
    }

    const sessionName = sessionNameTokens.join(' ').trim();
    if (!sessionName) {
      throw new Error('start requires a session name.');
    }

    const client = await this.ensureConnected();
    const startSession = async () =>
      client.callTool(
        {
          name: 'session_start_new',
          arguments: {
            sessionName,
            headless: !headed,
          },
        },
        undefined,
        { timeout: TOOL_TIMEOUTS.startSession },
      );

    let result: Awaited<ReturnType<typeof startSession>> | null = null;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await client.callTool({ name: 'sessions_clear', arguments: {} }, undefined, { timeout: TOOL_TIMEOUTS.execute });
      result = await startSession();

      const text = extractContentText(result);
      const isError = Boolean(
        result && typeof result === 'object' && 'isError' in result && (result as { isError?: boolean }).isError,
      );
      const transient =
        isError &&
        (text.includes('ERR_CONNECTION_REFUSED') ||
          text.includes('Request timed out') ||
          text.includes('Connection closed'));

      if (!transient || attempt === 3) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    if (!result) {
      throw new Error('Failed to start MCP session: no result returned.');
    }

    const started = await this.printToolResult(result);
    if (!started) {
      return false;
    }

    const smokeCommands: StepExecutorParams[] = [{ stepText: 'I test' }, { stepText: 'I get current URL' }];

    for (const smokeCommand of smokeCommands) {
      const smokeOk = await this.executeStructuredStep(smokeCommand);
      if (smokeOk) {
        return true;
      }
    }

    return false;
  }

  private async runAttach(): Promise<boolean> {
    const client = await this.ensureConnected();
    const result = await client.callTool({ name: 'attach_existing_session', arguments: {} }, undefined, {
      timeout: TOOL_TIMEOUTS.execute,
    });
    return this.printToolResult(result);
  }

  private async runTools(): Promise<boolean> {
    const client = await this.ensureConnected();
    let lines: string[];
    try {
      const tools = await client.listTools(undefined, { timeout: TOOL_TIMEOUTS.listTools });
      lines = sanitizeToolList(tools.tools);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('inputSchema') || !message.includes('expected "object"')) {
        throw error;
      }
      lines = fallbackToolList();
    }
    this.printSuccess(lines.join('\n'));
    return true;
  }

  private async runStep(args: string[]): Promise<boolean> {
    const stepTokens: string[] = [];
    let stepDocstring: unknown;

    for (let index = 0; index < args.length; index += 1) {
      const token = args[index];
      if (token === '--docstring') {
        const value = args[index + 1];
        if (value === undefined) {
          throw new Error('Missing value after --docstring.');
        }
        stepDocstring = value;
        index += 1;
        continue;
      }

      if (token === '--docstring-json') {
        const value = args[index + 1];
        if (value === undefined) {
          throw new Error('Missing value after --docstring-json.');
        }
        stepDocstring = JSON.parse(value);
        index += 1;
        continue;
      }

      if (token === '--docstring-base64') {
        const value = args[index + 1];
        if (value === undefined) {
          throw new Error('Missing value after --docstring-base64.');
        }
        stepDocstring = Buffer.from(value, 'base64').toString('utf8');
        index += 1;
        continue;
      }

      if (token === '--docstring-file') {
        const value = args[index + 1];
        if (value === undefined) {
          throw new Error('Missing value after --docstring-file.');
        }
        stepDocstring = await readDocstringFile(value);
        index += 1;
        continue;
      }

      stepTokens.push(token);
    }

    const stepText = stepTokens.join(' ').trim();
    if (!stepText) {
      throw new Error('step requires a step text.');
    }

    const client = await this.ensureConnected();
    const argumentsPayload: Record<string, unknown> = { stepText };
    if (stepDocstring !== undefined) {
      argumentsPayload.stepDocstring = stepDocstring;
    }

    const result = await client.callTool({ name: 'step_execute_single', arguments: argumentsPayload }, undefined, {
      timeout: TOOL_TIMEOUTS.execute,
    });

    return this.printToolResult(result);
  }

  // Accepts either raw JSON or `--file <path>` to avoid shell quoting issues
  private resolveJsonArgument(commandName: string, args: string[]): string {
    if (args.length === 2 && args[0] === '--file') {
      return fs.readFileSync(args[1], 'utf8');
    }
    if (args.length === 1 && args[0].startsWith('--file ')) {
      return fs.readFileSync(args[0].slice('--file '.length).trim(), 'utf8');
    }
    if (args.length === 1) {
      return args[0];
    }
    throw new Error(`${commandName} expects exactly 1 JSON argument or --file <path>.`);
  }

  private async runStepJson(args: string[]): Promise<boolean> {
    return this.executeStructuredStep(parseStepJsonInput(this.resolveJsonArgument('step-json', args)));
  }

  private async runBatch(args: string[]): Promise<boolean> {
    if (args.length < 2) {
      throw new Error('batch requires at least 2 steps.');
    }

    const client = await this.ensureConnected();
    const result = await client.callTool({ name: 'step_execute_many', arguments: { steps: args } }, undefined, {
      timeout: TOOL_TIMEOUTS.execute,
    });

    return this.printToolResult(result);
  }

  private async runBatchJson(args: string[]): Promise<boolean> {
    const steps = parseBatchJsonInput(this.resolveJsonArgument('batch-json', args));
    const client = await this.ensureConnected();
    const result = await client.callTool({ name: 'step_execute_many', arguments: { steps } }, undefined, {
      timeout: TOOL_TIMEOUTS.execute,
    });

    return this.printToolResult(result);
  }

  private async executeStructuredStep(step: StepExecutorParams): Promise<boolean> {
    const client = await this.ensureConnected();
    const argumentsPayload: Record<string, unknown> = { stepText: step.stepText };
    if (step.stepDocstring !== undefined) {
      argumentsPayload.stepDocstring = step.stepDocstring;
    }

    const result = await client.callTool({ name: 'step_execute_single', arguments: argumentsPayload }, undefined, {
      timeout: TOOL_TIMEOUTS.execute,
    });
    return this.printToolResult(result);
  }

  private async runSteps(args: string[]): Promise<boolean> {
    const [subcommand, ...rest] = args;
    if (subcommand !== 'find' && subcommand !== 'suggest') {
      throw new Error(`Unknown steps subcommand: ${subcommand ?? '(empty)'}`);
    }

    const query = rest.join(' ').trim();
    if (!query) {
      throw new Error(`steps ${subcommand ?? 'find'} requires a query.`);
    }

    this.printSuccess(
      subcommand === 'suggest'
        ? formatStepSuggestions(query, loadLiveStepDefinitions())
        : formatStepSearchResults(query, loadLiveStepDefinitions()),
    );
    return true;
  }

  private async runClear(): Promise<boolean> {
    const client = await this.ensureConnected();
    const result = await client.callTool({ name: 'sessions_clear', arguments: {} }, undefined, {
      timeout: TOOL_TIMEOUTS.execute,
    });
    return this.printToolResult(result);
  }

  private async runShutdown(): Promise<boolean> {
    const client = await this.ensureConnected();
    await client.notification({ method: 'notifications/shutdown', params: {} });
    this.printSuccess('Shutdown notification sent.');
    return true;
  }

  async executeTokens(tokens: string[], options: { interactive: boolean }): Promise<CommandExecutionResult> {
    this.lastEnvelope = null;
    const result = await this.executeTokensInner(tokens, options);
    return { ...result, envelope: this.lastEnvelope };
  }

  private async executeTokensInner(
    tokens: string[],
    options: { interactive: boolean },
  ): Promise<CommandExecutionResult> {
    if (tokens.length === 0) {
      return { ok: true, shouldExit: false };
    }

    const [command, ...args] = tokens;

    try {
      switch (command) {
        case 'help':
          this.printSuccess(HELP_TEXT);
          return { ok: true, shouldExit: false };
        case 'start':
          return { ok: await this.runStart(args), shouldExit: false };
        case 'restart':
          return { ok: await this.runStart(args), shouldExit: false };
        case 'attach':
          return { ok: await this.runAttach(), shouldExit: false };
        case 'tools':
          return { ok: await this.runTools(), shouldExit: false };
        case 'step':
          return { ok: await this.runStep(args), shouldExit: false };
        case 'step-json':
          return { ok: await this.runStepJson(args), shouldExit: false };
        case 'batch':
          return { ok: await this.runBatch(args), shouldExit: false };
        case 'batch-json':
          return { ok: await this.runBatchJson(args), shouldExit: false };
        case 'steps':
          return { ok: await this.runSteps(args), shouldExit: false };
        case 'clear':
          return { ok: await this.runClear(), shouldExit: false };
        case 'shutdown':
          return { ok: await this.runShutdown(), shouldExit: true };
        case 'exit':
        case 'quit':
          return { ok: true, shouldExit: true };
        default:
          throw new Error(`Unknown command: ${command}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.printError(message);
      if (this.bridgeStderr.trim()) {
        this.printError(this.bridgeStderr.trim());
        this.bridgeStderr = '';
      }
      return { ok: false, shouldExit: options.interactive ? false : !this.keepBridgeAlive };
    }
  }

  async executeLine(line: string, options: { interactive: boolean }): Promise<CommandExecutionResult> {
    const trimmed = line.trim();
    if (trimmed.startsWith('step-json ')) {
      return this.executeTokens(['step-json', trimmed.slice('step-json '.length)], options);
    }
    if (trimmed.startsWith('batch-json ')) {
      return this.executeTokens(['batch-json', trimmed.slice('batch-json '.length)], options);
    }
    return this.executeTokens(tokenizeCommand(line), options);
  }

  async runInteractive(): Promise<number> {
    const isTTY = 'isTTY' in this.stdin && Boolean(this.stdin.isTTY);
    if (!isTTY) {
      this.printSuccess('Session is running. Press Ctrl+C to stop.');
      return new Promise<number>((resolve) => {
        const keepAlive = setInterval(() => {}, 60_000);
        const onSignal = () => {
          clearInterval(keepAlive);
          resolve(0);
        };
        process.once('SIGINT', onSignal);
        process.once('SIGTERM', onSignal);
      });
    }

    this.printSuccess('MCP Test Engine CLI');
    this.printSuccess('Type "help" to see commands. Type "shutdown" or "exit" to leave.');

    const rl = readline.createInterface({
      input: this.stdin,
      output: this.stdout,
      terminal: true,
    });

    let exitCode = 0;
    try {
      while (true) {
        const line = await rl.question('mcp> ');
        const result = await this.executeLine(line, { interactive: true });
        if (!result.ok) {
          exitCode = 1;
        }
        if (result.shouldExit) {
          break;
        }
      }
    } finally {
      rl.close();
    }

    return exitCode;
  }
}
