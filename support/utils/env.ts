import dotenv from 'dotenv';

/**
 * Loads environment variables from a .env file.
 *
 * `quiet: true` suppresses dotenv's stdout logging, which would otherwise
 * corrupt STDIO JSON-RPC transports in processes that import a config at
 * startup (e.g. the MCP bridge-cli). Kept in one place so both the root
 * config and the MCP config load env the same way.
 *
 * @param envPath - Absolute path to a specific .env file; defaults to dotenv's
 *   cwd-relative resolution when omitted.
 */
export function loadEnv(envPath?: string): void {
  dotenv.config({ ...(envPath ? { path: envPath } : {}), quiet: true });
}
