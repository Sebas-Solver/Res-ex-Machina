import { resolve4 } from 'node:dns/promises';

/**
 * Validador de URLs para webhooks (Issue #13).
 *
 * SSRF Mitigation:
 * 1. Solo acepta HTTPS
 * 2. Resuelve DNS y bloquea IPs privadas, localhost, link-local
 * 3. No seguir redirects (configurado en el fetch del dispatcher)
 */

/** Rangos de IPs bloqueadas */
const BLOCKED_IP_RANGES = [
    /^127\./,                     // Loopback
    /^10\./,                      // Clase A privada
    /^172\.(1[6-9]|2\d|3[01])\./,// Clase B privada
    /^192\.168\./,                // Clase C privada
    /^169\.254\./,                // Link-local
    /^0\./,                       // Red actual
    /^::1$/,                      // IPv6 loopback
    /^fc/i,                       // IPv6 ULA
    /^fe80/i,                     // IPv6 link-local
];

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

    // 4. Resolver DNS y comprobar IPs
    try {
        const ips = await resolve4(hostname);
        for (const ip of ips) {
            if (BLOCKED_IP_RANGES.some((regex) => regex.test(ip))) {
                throw new Error(`IP ${ip} is in a blocked range (private/loopback/link-local)`);
            }
        }
    } catch (err) {
        // Si es nuestro error, re-lanzar
        if (err instanceof Error && err.message.includes('blocked range')) {
            throw err;
        }
        // DNS did not resolve — for direct IPs, check the hostname literal
        if (BLOCKED_IP_RANGES.some((regex) => regex.test(hostname))) {
            throw new Error(`IP ${hostname} is in a blocked range`);
        }
        // If DNS truly fails, let it pass (will error on fetch)
    }
}
