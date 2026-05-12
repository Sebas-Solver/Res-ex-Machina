import * as Sentry from '@sentry/node';

/**
 * Initializes Sentry for error and performance monitoring.
 *
 * Only activates if SENTRY_DSN is defined (production).
 * In development/test mode it operates as a noop.
 *
 * Note: reads process.env directly (not via env.ts) to avoid the
 * import chain errors.ts → monitoring.ts → env.ts → process.exit(1)
 * that crashes tests which only need error factories.
 * env.ts validation still runs first in app.ts, so values are safe.
 *
 * Issue #19 — Finding H-7 from alpha.1 code review
 */
export function initMonitoring(): void {
    const sentryDsn = process.env.SENTRY_DSN;
    const nodeEnv = process.env.NODE_ENV || 'development';

    if (!sentryDsn) {
        console.log('ℹ️  Sentry disabled (SENTRY_DSN not set)');
        return;
    }

    Sentry.init({
        dsn: sentryDsn,
        environment: nodeEnv,
        // 10% trace sampling to avoid saturating the free tier (5K errors/month)
        tracesSampleRate: 0.1,
        // Do not send PII (wallet addresses, IPs, etc.)
        sendDefaultPii: false,
    });

    console.log(`🛡️  Sentry initialized (env: ${nodeEnv})`);
}

// Re-export Sentry for direct use in error handler
export { Sentry };
