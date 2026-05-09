import pino from 'pino';

/**
 * Shared Pino logger for services and workers outside of Fastify context.
 *
 * Audit fix: replaces console.log/warn/error in workers and services
 * with a structured JSON logger that integrates with production
 * observability tools (log aggregators, Sentry, etc.).
 *
 * In development, uses pino-pretty for human-readable output.
 * In production, outputs JSON for machine parsing.
 */
export const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    transport:
        process.env.NODE_ENV === 'development'
            ? { target: 'pino-pretty', options: { colorize: true } }
            : undefined,
});
