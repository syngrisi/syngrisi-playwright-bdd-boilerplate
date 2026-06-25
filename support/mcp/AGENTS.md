# MCP Subsystem (support/mcp/)

Agent instructions for the MCP server / test-engine subsystem. Root rules in [/AGENTS.md](../../AGENTS.md) still apply.

## What lives here

| Path | Purpose |
| --- | --- |
| `server.ts` | MCP server exposed to AI agents (`yarn test:mcp`) — ASK FIRST before editing |
| `bridge.ts` | JSON-RPC bridge between CLI/daemon and the Playwright session — ASK FIRST before editing |
| `test-engine.ts` | Thin re-export of the test-engine public API |
| `test-engine/` | CLI runtime, command parser, daemon server, state helpers, formatters |
| `test-engine-cli.ts` | CLI entry: `start` / `step` / `batch` / `status` / `shutdown` |
| `test-engine-state.ts` | Persisted session state |
| `utils/` | stepExecutor, dom-simplifier, logger, step registry, helpers |
| `test/` | Specs for this subsystem (`yarn test:mcp`) |

## Flow

```
agent → test-engine-cli.ts → daemon (test-engine/daemon-server.ts)
      → bridge.ts → Playwright session → stepExecutor (utils/stepExecutor.ts)
```

The CLI talks to a detached daemon per `SYSTEM_THREAD`; the daemon owns the MCP client connected to the bridge, which drives the browser.

## Rules

- Use **relative imports only** inside `support/mcp/` — the bridge runs without tsconfig path resolution, aliases like `@helpers/*` will break it at runtime.
- Public CLI surface (`start`, `step`, `batch`, `status`, `shutdown`) and exports of `test-engine.ts` are stable API — ASK FIRST before changing.
- Run the subsystem tests with `yarn test:mcp`.
- Logs: `logs/testengine.log`, per-step logs in `logs/*steps.log`.
