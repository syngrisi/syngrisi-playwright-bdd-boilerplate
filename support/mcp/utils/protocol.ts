// Shared wire-protocol contract between MCP layers (server, bridge, daemon, CLI).
// Keeps error codes and the structured result envelope in one place so that
// consumers do not have to parse human-readable text with regexes.

export const SESSION_NOT_STARTED_MESSAGE = 'Session not started. Please call session_start_new first.';

// Short marker kept for backward-compatible text classification of older outputs
export const SESSION_NOT_STARTED_TEXT_MARKER = 'Session not started';

export const ERROR_CODES = {
  SESSION_NOT_STARTED: 'SESSION_NOT_STARTED',
  STEP_NOT_FOUND: 'STEP_NOT_FOUND',
  STEP_FAILED: 'STEP_FAILED',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export interface ResultArtifacts {
  screenshotPath?: string;
  accessibilityTreePath?: string;
}

/**
 * Machine-readable result envelope carried in the MCP tool result's
 * `structuredContent` field alongside the human-readable text content.
 */
export interface ResultEnvelope {
  status: 'success' | 'failed';
  message: string;
  errorCode?: ErrorCode;
  artifacts?: ResultArtifacts;
}

/** Extracts the structured envelope from an MCP tool result, if present. */
export const extractEnvelope = (result: unknown): ResultEnvelope | null => {
  if (!result || typeof result !== 'object' || !('structuredContent' in result)) {
    return null;
  }
  const candidate = (result as { structuredContent?: unknown }).structuredContent;
  if (
    candidate &&
    typeof candidate === 'object' &&
    'status' in candidate &&
    ((candidate as { status?: unknown }).status === 'success' ||
      (candidate as { status?: unknown }).status === 'failed')
  ) {
    return candidate as ResultEnvelope;
  }
  return null;
};
