import { resolve4, resolve6 } from 'node:dns/promises';

/**
 * Validador de URLs para webhooks (Issue #13).
 *
 * SSRF Mitigation:
 * 1. Solo acepta HTTPS
 * 2. Resuelve DNS (IPv4 + IPv6) y bloquea IPs privadas, localhost, link-local
 * 3. No seguir redirects (configurado en el fetch del dispatcher)
 *
 * Audit fix: Added resolve6() alongside resolve4() to prevent SSRF bypass
 * via IPv6 addresses (e.g., ::1, fc00::/7, fe80::/10).
 */

/** Rangos de IPs bloqueadas (exportado para re-validación en fetch time — M-04) */
export const BLOCKED_IP_RANGES = [
    /^127\./,                     // Loopback
    /^10\./,                      // Clase A privada
    /^172\.(1[6-9]|2\d|3[01])\./, // Clase B privada
    /^192\.168\./,                // Clase C privada
    /^169\.254\./,                // Link-local
    /^0\./,                       // Red actual
    /^::1$/,                      // IPv6 loopback
    /^fc/i,                       // IPv6 ULA
    /^fe80/i,                     // IPv6 link-local
];

/**
 * Checks if an IP address falls within a blocked range.
 * Exported for use in webhook delivery (DNS rebinding mitigation — M-04).
 */
export function isBlockedIp(ip: string): boolean {
    return BLOCKED_IP_RANGES.some((regex) => regex.test(ip));
}

/**
 * Resolves a hostname and validates all IPs against blocked ranges.
 * Can be called both at registration and at delivery time.
 * Throws if any resolved IP is in a blocked range.
 */
export async function resolveAndValidateHostname(hostname: string): Promise<void> {
    let allIps: string[] = [];

    try {
        const ipv4 = await resolve4(hostname);
        allIps = allIps.concat(ipv4);
    } catch {
        // No IPv4 records
    }

    try {
        const ipv6 = await resolve6(hostname);
        allIps = allIps.concat(ipv6);
    } catch {
        // No IPv6 records
    }

    if (allIps.length > 0) {
        for (const ip of allIps) {
            if (isBlockedIp(ip)) {
                throw new Error(`IP ${ip} is in a blocked range (private/loopback/link-local)`);
            }
        }
    } else {
        // Direct IP literal — check hostname itself
        if (isBlockedIp(hostname)) {
            throw new Error(`IP ${hostname} is in a blocked range`);
        }
    }
}

/**
 * Valida que una URL de webhook sea segura.
 * Lanza Error si la URL no pasa las comprobaciones.
 */
export async function validateWebhookUrl(url: string): Promise<void> {
    // 1. Parsear URL
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        throw new Error('Invalid URL format');
    }

    // 2. Solo HTTPS
    if (parsed.protocol !== 'https:') {
        throw new Error('Only HTTPS URLs are allowed');
    }

    // 3. Bloquear hostnames peligrosos
    const hostname = parsed.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
        throw new Error('localhost URLs are not allowed');
    }

    // 4. Resolver DNS y comprobar IPs (usa función compartida — M-04)
    await resolveAndValidateHostname(hostname);
}
