// SPDX-License-Identifier: Apache-2.0

/**
 * Structured logger for the MCP Server package.
 * 
 * Audit L-01: Replaces raw console.error with JSON-structured output
 * to stderr (MCP protocol requires stdout for data, stderr for logs).
 * 
 * Uses stderr intentionally: MCP stdio transport reserves stdout for
 * JSON-RPC messages. All log output MUST go to stderr.
 */

type LogLevel = 'info' | 'warn' | 'error' | 'fatal';

interface LogEntry {
    level: LogLevel;
    ts: string;
    component: string;
    msg: string;
    [key: string]: unknown;
}

function log(level: LogLevel, msg: string, extra?: Record<string, unknown>): void {
    const entry: LogEntry = {
        level,
        ts: new Date().toISOString(),
        component: 'mcp-server',
        msg,
        ...extra,
    };
    // Always write to stderr (MCP protocol requirement)
    process.stderr.write(JSON.stringify(entry) + '\n');
}

export const logger = {
    info: (msg: string, extra?: Record<string, unknown>) => log('info', msg, extra),
    warn: (msg: string, extra?: Record<string, unknown>) => log('warn', msg, extra),
    error: (msg: string, extra?: Record<string, unknown>) => log('error', msg, extra),
    fatal: (msg: string, extra?: Record<string, unknown>) => log('fatal', msg, extra),
};
