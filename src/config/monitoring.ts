import * as Sentry from '@sentry/node';

/**
 * Initializes Sentry for error and performance monitoring.
 *
 * Only activates if SENTRY_DSN is defined (production).
 * En desarrollo/test funciona como noop.
 *
 * Note: reads process.env directly (not via env.ts) to avoid the
 * import chain errors.ts → monitoring.ts → env.ts → process.exit(1)
 * that crashes tests which only need error factories.
 * env.ts validation still runs first in app.ts, so values are safe.
 *
 * Issue #19 — Hallazgo H-7 del code review alpha.1
 */
export function initMonitoring(): void {
    const sentryDsn = process.env.SENTRY_DSN;
    const nodeEnv = process.env.NODE_ENV || 'development';

    if (!sentryDsn) {
        console.log('ℹ️  Sentry desactivado (SENTRY_DSN no definido)');
        return;
    }

    Sentry.init({
        dsn: sentryDsn,
        environment: nodeEnv,
        // 10% de traces para no saturar el free tier (5K errores/mes)
        tracesSampleRate: 0.1,
        // No enviar PII (direcciones de wallet, IPs, etc.)
        sendDefaultPii: false,
    });

    console.log(`🛡️  Sentry inicializado (env: ${nodeEnv})`);
}

// Re-exportar Sentry para uso directo en error handler
export { Sentry };
