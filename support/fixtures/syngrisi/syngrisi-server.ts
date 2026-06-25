import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';

const NPX_BIN = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const DEFAULT_DB_URI = 'mongodb://127.0.0.1:27017/e2eBoilerplateSyngrisiDB';
const DEFAULT_START_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 1000;
const LOG_FILE = path.resolve(process.cwd(), 'logs', 'syngrisi', 'syngrisi.log');

let startPromise: Promise<void> | null = null;

function appendLog(message: string): void {
  fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
  fs.appendFileSync(LOG_FILE, `${new Date().toISOString()} ${message}\n`, 'utf8');
}

function requestBaseUrl(baseUrl: string): Promise<boolean> {
  return new Promise((resolve) => {
    const request = http.get(baseUrl, (response) => {
      response.resume();
      resolve((response.statusCode ?? 500) < 500);
    });

    request.on('error', () => resolve(false));
    request.setTimeout(3000, () => {
      request.destroy();
      resolve(false);
    });
  });
}

async function waitForSyngrisi(baseUrl: string, timeoutMs = DEFAULT_START_TIMEOUT_MS): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await requestBaseUrl(baseUrl)) {
      appendLog(`Syngrisi is available at ${baseUrl}`);
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error(`Syngrisi did not become available at ${baseUrl} within ${timeoutMs}ms. Check ${LOG_FILE}`);
}

function getPort(baseUrl: string): string {
  return new URL(baseUrl).port || '80';
}

function isTcpReachable(host: string, port: number, timeoutMs = 3000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (result: boolean) => {
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs, () => done(false));
    socket.on('connect', () => done(true));
    socket.on('error', () => done(false));
  });
}

async function ensureMongoAvailable(): Promise<void> {
  const dbUri = process.env.SYNGRISI_DB_URI || DEFAULT_DB_URI;
  const url = new URL(dbUri);
  const host = url.hostname || '127.0.0.1';
  const port = Number(url.port) || 27017;

  if (await isTcpReachable(host, port)) {
    return;
  }

  throw new Error(
    `MongoDB is not reachable at ${host}:${port} (SYNGRISI_DB_URI=${dbUri}). ` +
      'Syngrisi requires MongoDB to start. Run "brew services start mongodb-community" ' +
      'or "docker run -d --name syngrisi-mongo -p 27017:27017 mongo:7", ' +
      'or point SYNGRISI_DB_URI to a running instance.',
  );
}

function spawnSyngrisi(baseUrl: string): void {
  fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
  const logFd = fs.openSync(LOG_FILE, 'a');

  appendLog(`Starting Syngrisi on ${baseUrl}`);

  const child = spawn(NPX_BIN, ['sy'], {
    cwd: process.cwd(),
    detached: true,
    env: {
      ...process.env,
      SYNGRISI_AUTH: 'false',
      SYNGRISI_APP_PORT: getPort(baseUrl),
      SYNGRISI_DB_URI: process.env.SYNGRISI_DB_URI || DEFAULT_DB_URI,
    },
    stdio: ['ignore', logFd, logFd],
  });

  child.unref();
  fs.closeSync(logFd);

  appendLog(`Syngrisi process spawned with pid ${child.pid ?? 'unknown'}`);
}

export async function ensureSyngrisiServer(baseUrl: string): Promise<void> {
  if (await requestBaseUrl(baseUrl)) {
    appendLog(`Syngrisi is already running at ${baseUrl}`);
    return;
  }

  if (!startPromise) {
    startPromise = (async () => {
      await ensureMongoAvailable();
      spawnSyngrisi(baseUrl);
      await waitForSyngrisi(baseUrl);
    })();
  }

  await startPromise;
}

export function getSyngrisiLogFile(): string {
  return LOG_FILE;
}
