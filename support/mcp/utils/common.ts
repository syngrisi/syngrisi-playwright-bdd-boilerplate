import path from 'node:path';
import { existsSync, promises as fsPromises } from 'node:fs';
import process from 'node:process';

// Stack frames from these locations are infrastructure noise for step errors:
// the actionable part is the error message itself (incl. Playwright call log).
const NOISY_STACK_FRAME_PATTERNS = [
  'node_modules/playwright-mcp-advanced',
  'node_modules/@modelcontextprotocol',
  'support/mcp/utils/stepInvokerPatch',
  'support/mcp/utils/stepExecutor',
  'node:internal',
];

const MAX_STACK_FRAMES = 4;

export const formatError = (err: unknown): string => {
  if (err instanceof Error) {
    if (!err.stack) {
      return err.message;
    }
    // Keep the message (with Playwright call log) plus a few app-level frames only
    const lines = err.stack.split('\n');
    const frameStart = lines.findIndex((line) => line.trimStart().startsWith('at '));
    if (frameStart === -1) {
      return err.stack;
    }
    const usefulFrames = lines
      .slice(frameStart)
      .filter((line) => !NOISY_STACK_FRAME_PATTERNS.some((pattern) => line.includes(pattern)))
      .slice(0, MAX_STACK_FRAMES);
    return [...lines.slice(0, frameStart), ...usefulFrames].join('\n').trimEnd();
  }
  if (typeof err === 'string') {
    return err;
  }
  if (typeof err === 'object' && err !== null) {
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }
  return String(err);
};

const PROJECT_MARKER_FILES = ['package.json', 'node_modules', 'support/mcp/bridge.ts'] as const;

const PROJECT_NAME = 'e2e';

export function getProjectRoot(): string {
  if (process.env.E2E_ROOT) {
    // Ensure E2E_ROOT is always an absolute path
    const e2eRoot = path.isAbsolute(process.env.E2E_ROOT)
      ? process.env.E2E_ROOT
      : path.resolve(process.cwd(), process.env.E2E_ROOT);

    if (existsSync(path.join(e2eRoot, 'node_modules'))) {
      return e2eRoot;
    }
  }

  let currentDir = process.cwd();
  const root = path.parse(currentDir).root;

  while (currentDir !== root) {
    const hasAllMarkers = PROJECT_MARKER_FILES.every((marker) => existsSync(path.join(currentDir, marker)));

    if (hasAllMarkers) {
      return currentDir;
    }
    currentDir = path.dirname(currentDir);
  }

  const mainModule = process.argv[1];
  if (mainModule?.includes(PROJECT_NAME)) {
    const match = mainModule.match(new RegExp(`^(.+/${PROJECT_NAME})`));
    if (match && existsSync(path.join(match[1], 'node_modules'))) {
      return match[1];
    }
  }

  throw new Error(`Could not find project root directory. Please run from the e2e project directory.`);
}

export const SHUTDOWN_NOTIFICATION_METHOD = 'notifications/shutdown' as const;

export function isShutdownNotification(
  notification: unknown,
): notification is { method: typeof SHUTDOWN_NOTIFICATION_METHOD } {
  if (!notification || typeof notification !== 'object') {
    return false;
  }
  const candidate = notification as { method?: unknown };
  return candidate.method === SHUTDOWN_NOTIFICATION_METHOD;
}

/**
 * Ensures a path exists and validates its type (file or directory).
 * Throws an error with a descriptive message if the path doesn't exist or has the wrong type.
 *
 * Local copy to avoid @utils/fs dependency chain which requires @lib/logger.
 *
 * @param targetPath - Path to validate
 * @param type - Expected type: "file" or "directory"
 * @throws Error if path doesn't exist or has wrong type
 */
export async function ensurePathExists(targetPath: string, type: 'file' | 'directory'): Promise<void> {
  try {
    const stats = await fsPromises.stat(targetPath);
    const isValid = type === 'file' ? stats.isFile() : stats.isDirectory();
    if (!isValid) {
      throw new Error(`Expected ${type} at ${targetPath}, but found non-${type} entry`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`${type} not found at ${targetPath}`);
    }
    throw error;
  }
}
