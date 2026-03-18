import * as Sentry from '@sentry/node';
import { env } from './env.js';

/**
 * Initializes Sentry for error and performance monitoring.
 *
 * Only activates if SENTRY_DSN is defined (production).
 * En desarrollo/test funciona como noop.
 *
 * Issue #19 — Hallazgo H-7 del code review alpha.1
 */
export function initMonitoring(): void {
    if (!env.SENTRY_DSN) {
        console.log('ℹ️  Sentry desactivado (SENTRY_DSN no definido)');
        return;
    }

    Sentry.init({
        dsn: env.SENTRY_DSN,
        environment: env.NODE_ENV,
        // 10% de traces para no saturar el free tier (5K errores/mes)
        tracesSampleRate: 0.1,
        // No enviar PII (direcciones de wallet, IPs, etc.)
        sendDefaultPii: false,
    });

    console.log(`🛡️  Sentry inicializado (env: ${env.NODE_ENV})`);
}

// Re-exportar Sentry para uso directo en error handler
export { Sentry };
