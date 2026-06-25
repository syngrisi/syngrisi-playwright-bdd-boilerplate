// Using relative path instead of @logger alias to allow bridge-cli.ts to run from any directory
// without requiring tsconfig.json path resolution (fixes "Cannot find module '@logger'" errors)
import logger, { formatArgs } from './logger';
import type { ErrorCode, ResultEnvelope } from './protocol';

interface ErrorArtifacts {
  screenshotPath?: string;
  accessibilityTreePath?: string;
}

export type { ErrorArtifacts };

// Responses carry both the human-readable text (content) and a machine-readable
// envelope (structuredContent) so downstream layers never need to regex the text.
export const createErrorResponse = (message: string, artifacts?: ErrorArtifacts, errorCode?: ErrorCode) => {
  const content: Array<{ type: 'text'; text: string }> = [
    {
      type: 'text' as const,
      text: `Status: Failed\nError: ${message}`,
    },
  ];

  if (artifacts?.screenshotPath) {
    content.push({
      type: 'text' as const,
      text: `\nScreenshot: ${artifacts.screenshotPath}`,
    });
  }

  if (artifacts?.accessibilityTreePath) {
    content.push({
      type: 'text' as const,
      text: `HTML (Emmet): ${artifacts.accessibilityTreePath}`,
    });
  }

  const structuredContent: ResultEnvelope = {
    status: 'failed',
    message,
    ...(errorCode ? { errorCode } : {}),
    ...(artifacts && (artifacts.screenshotPath || artifacts.accessibilityTreePath) ? { artifacts } : {}),
  };

  return {
    content,
    structuredContent,
    isError: true,
  };
};

export const createSuccessResponse = (message: string) => ({
  content: [
    {
      type: 'text' as const,
      text: `Status: Success\n${message}`,
    },
  ],
  structuredContent: { status: 'success', message } satisfies ResultEnvelope,
});

export const safeJsonParse = <T>(json: string, fallback: T): T => {
  try {
    return JSON.parse(json) as T;
  } catch (err) {
    logger.error(formatArgs('Failed to parse JSON:', err));
    return fallback;
  }
};
