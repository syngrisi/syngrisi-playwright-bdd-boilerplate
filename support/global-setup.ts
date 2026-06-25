import fs from 'fs';
import path from 'path';

export default async function globalSetup() {
  // Clean logs
  const logsDir = path.resolve(__dirname, '..', 'logs');
  if (fs.existsSync(logsDir)) {
    fs.rmSync(logsDir, { recursive: true, force: true });
  }
  fs.mkdirSync(logsDir, { recursive: true });

  // Clean MCP logs
  const mcpLogsDir = path.resolve(__dirname, 'mcp', 'logs');
  if (fs.existsSync(mcpLogsDir)) {
    const entries = fs.readdirSync(mcpLogsDir);
    for (const entry of entries) {
      if (entry.endsWith('.jsonl')) {
        fs.unlinkSync(path.join(mcpLogsDir, entry));
      }
    }
    // Clean ports directory
    const portsDir = path.join(mcpLogsDir, 'ports');
    if (fs.existsSync(portsDir)) {
      fs.rmSync(portsDir, { recursive: true, force: true });
      fs.mkdirSync(portsDir, { recursive: true });
    }
  }

  // Clean MCP screenshots
  const screenshotsDir = path.resolve(__dirname, 'mcp', 'screenshots');
  if (fs.existsSync(screenshotsDir)) {
    fs.rmSync(screenshotsDir, { recursive: true, force: true });
  }
}
