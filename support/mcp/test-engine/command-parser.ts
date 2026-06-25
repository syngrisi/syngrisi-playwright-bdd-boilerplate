import { simpleTokenSearch } from '../utils/simpleTokenSearch';
import type { StepExecutorParams } from '../utils/stepExecutor';
import type { Data } from '../utils/types';

import type { ParsedCliArgs } from './constants';

export const extractContentText = (payload: unknown): string => {
  if (!payload || typeof payload !== 'object') {
    return '';
  }

  const content = (payload as { content?: unknown }).content;
  if (!Array.isArray(content) || content.length === 0) {
    return '';
  }

  const firstBlock = content[0];
  if (!firstBlock || typeof firstBlock !== 'object' || !('text' in firstBlock)) {
    return '';
  }

  return String((firstBlock as { text: unknown }).text ?? '');
};

export const tokenizeCommand = (line: string): string[] => {
  const tokens: string[] = [];
  let current = '';
  let quote: 'single' | 'double' | null = null;
  let escaped = false;

  for (const char of line.trim()) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === '\\' && quote !== 'single') {
      escaped = true;
      continue;
    }

    if (quote) {
      if ((quote === 'single' && char === "'") || (quote === 'double' && char === '"')) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }

    if (char === "'") {
      quote = 'single';
      continue;
    }

    if (char === '"') {
      quote = 'double';
      continue;
    }

    if (/\s/u.test(char)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }

    current += char;
  }

  if (escaped) {
    throw new Error('Command ended with an unfinished escape sequence.');
  }

  if (quote) {
    throw new Error('Command contains an unterminated quote.');
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
};

export const quoteCommandToken = (value: string): string => {
  if (!/[\s"]/u.test(value)) {
    return value;
  }
  return `"${value.replace(/\\/gu, '\\\\').replace(/"/gu, '\\"')}"`;
};

export const parseCommandLine = (line: string): string[] => {
  const trimmed = line.trim();
  if (trimmed.startsWith('step-json ')) {
    return ['step-json', trimmed.slice('step-json '.length)];
  }
  if (trimmed.startsWith('batch-json ')) {
    return ['batch-json', trimmed.slice('batch-json '.length)];
  }
  return tokenizeCommand(trimmed);
};

export const parseCliArgs = (argv: string[]): ParsedCliArgs => {
  const commands: string[] = [];
  let showHelp = false;
  let daemonServer = false;
  let daemonAttach = false;
  let daemonHeaded = false;
  let statusFile: string | null = null;
  let agentId: string | null = null;
  let jsonOutput = false;
  const passthroughTokens: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === '--help' || token === '-h') {
      showHelp = true;
      continue;
    }

    if (token === '--daemon-server') {
      daemonServer = true;
      continue;
    }

    if (token === '--json') {
      jsonOutput = true;
      continue;
    }

    if (token === '--daemon-attach') {
      daemonAttach = true;
      continue;
    }

    if (token === '--status-file') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value after --status-file.');
      }
      statusFile = value;
      index += 1;
      continue;
    }

    if (token === '--system-thread') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value after --system-thread.');
      }
      agentId = value;
      index += 1;
      continue;
    }

    if (token === '--command') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value after --command.');
      }
      commands.push(value);
      index += 1;
      continue;
    }

    if (daemonServer && token === '--headed') {
      daemonHeaded = true;
      continue;
    }

    passthroughTokens.push(token);
  }

  if (passthroughTokens.length > 0) {
    commands.push(passthroughTokens.map((token) => quoteCommandToken(token)).join(' '));
  }

  return {
    commands,
    showHelp,
    daemonServer,
    daemonAttach,
    daemonHeaded,
    statusFile,
    agentId,
    jsonOutput,
  };
};

const parseStructuredJson = (raw: string): unknown => {
  const parsed = JSON.parse(raw) as unknown;
  if (typeof parsed === 'string') {
    const trimmed = parsed.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      return JSON.parse(trimmed) as unknown;
    }
  }
  return parsed;
};

export const parseStepJsonInput = (raw: string): StepExecutorParams => {
  const parsed = parseStructuredJson(raw) as string | StepExecutorParams;
  if (typeof parsed === 'string') {
    return { stepText: parsed };
  }

  if (!parsed || typeof parsed !== 'object' || typeof parsed.stepText !== 'string') {
    throw new Error('step-json expects a JSON string or object with a string stepText field.');
  }

  return {
    stepText: parsed.stepText,
    ...(parsed.stepDocstring !== undefined ? { stepDocstring: parsed.stepDocstring } : {}),
  };
};

export const parseBatchJsonInput = (raw: string): StepExecutorParams[] => {
  const parsed = parseStructuredJson(raw) as Array<string | StepExecutorParams>;
  if (!Array.isArray(parsed) || parsed.length < 2) {
    throw new Error('batch-json expects a JSON array with at least 2 items.');
  }

  return parsed.map((item, index) => {
    if (typeof item === 'string') {
      return { stepText: item };
    }

    if (!item || typeof item !== 'object' || typeof item.stepText !== 'string') {
      throw new Error(`batch-json item at index ${index} must be a string or object with a string stepText field.`);
    }

    return {
      stepText: item.stepText,
      ...(item.stepDocstring !== undefined ? { stepDocstring: item.stepDocstring } : {}),
    };
  });
};

export const formatStepSearchResults = (query: string, data: Data): string => {
  const results = simpleTokenSearch(data, query).slice(0, 20);
  if (results.length === 0) {
    return `No step definitions found for query: "${query}"`;
  }

  const lines = results.map((result, index) => {
    const lineSuffix = result.line ? `:${result.line}` : '';
    const matchedTokens = result.matchedTokens.length > 0 ? ` [matched: ${result.matchedTokens.join(', ')}]` : '';
    return `${index + 1}. ${result.pattern}\n   file: ${result.file}${lineSuffix}\n   score: ${result.score.toFixed(2)}${matchedTokens}\n   description: ${result.description}`;
  });

  return `Found ${results.length} matching step definitions for "${query}":\n${lines.join('\n')}`;
};

export const formatStepSuggestions = (query: string, data: Data): string => {
  const results = simpleTokenSearch(data, query).slice(0, 5);
  if (results.length === 0) {
    return `No suggested step found for intent: "${query}"`;
  }

  const [best, ...alternatives] = results;
  // A weak match must not be presented as a confident recommendation
  const isConfident = best.score >= 0.5;
  const lines = [
    `Intent: "${query}"`,
    isConfident
      ? `Recommended exact command: step "${best.pattern}"`
      : `No confident match (best score ${best.score.toFixed(2)}). Closest candidate: step "${best.pattern}"`,
    `Source: ${best.file}${best.line ? `:${best.line}` : ''}`,
    best.description ? `Why: ${best.description}` : '',
    isConfident ? '' : 'Tip: refine the intent or use "steps find <keyword>" to browse the catalog.',
  ].filter(Boolean);

  if (alternatives.length > 0) {
    lines.push('');
    lines.push('Alternatives:');
    lines.push(
      ...alternatives.map(
        (result, index) =>
          `${index + 1}. step "${result.pattern}" (${result.file}${result.line ? `:${result.line}` : ''}, score ${result.score.toFixed(2)})`,
      ),
    );
  }

  return lines.join('\n');
};
