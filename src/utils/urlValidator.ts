// SPDX-License-Identifier: Apache-2.0

import { resolve4, resolve6 } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * Validador de URLs para webhooks (Issue #13 / Audit P1-10).
 *
 * SSRF Mitigation:
 * 1. Solo acepta HTTPS
 * 2. Resuelve DNS (IPv4 + IPv6) y bloquea IPs privadas, localhost, link-local
 * 3. Rechaza hostnames no resolubles e IPs mapeadas IPv6 (e.g. ::ffff:127.0.0.1)
 * 4. No seguir redirects (configurado en el fetch del dispatcher)
 */

/** Blocked IP ranges (exported for re-validation at fetch time — M-04) */
export const BLOCKED_IP_RANGES = [
    /^127\./,                                                // Loopback
    /^10\./,                                                 // Class A private
    /^172\.(1[6-9]|2\d|3[01])\./,                            // Class B private
    /^192\.168\./,                                           // Class C private
    /^169\.254\./,                                           // Link-local
    /^0\./,                                                  // Current network
    /^::1$/,                                                 // IPv6 loopback
    /^fc/i,                                                  // IPv6 ULA
    /^fe80/i,                                                // IPv6 link-local
    /^::ffff:(127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|0\.)/i, // IPv4-mapped IPv6 private
];

/**
 * Checks if an IP address falls within a blocked range.
 * Exported for use in webhook delivery (DNS rebinding mitigation — M-04).
 */
export function isBlockedIp(ip: string): boolean {
    const cleanIp = ip.replace(/^\[|\]$/g, '');
    return BLOCKED_IP_RANGES.some((regex) => regex.test(cleanIp));
}

/**
 * Resolves a hostname and validates all IPs against blocked ranges.
 * Can be called both at registration and at delivery time.
 * Throws if any resolved IP is in a blocked range or if hostname cannot be resolved.
 */
export async function resolveAndValidateHostname(hostname: string): Promise<void> {
    const cleanHostname = hostname.replace(/^\[|\]$/g, '');

    // Direct IP literal check
    if (isIP(cleanHostname)) {
        if (isBlockedIp(cleanHostname)) {
            throw new Error(`IP ${cleanHostname} is in a blocked range`);
        }
        return;
    }

    let allIps: string[] = [];

    try {
        const ipv4 = await resolve4(cleanHostname);
        allIps = allIps.concat(ipv4);
    } catch {
        // No IPv4 records
    }

    try {
        const ipv6 = await resolve6(cleanHostname);
        allIps = allIps.concat(ipv6);
    } catch {
        // No IPv6 records
    }

    if (allIps.length === 0) {
        throw new Error(`Hostname ${cleanHostname} could not be resolved via DNS`);
    }

    for (const ip of allIps) {
        if (isBlockedIp(ip)) {
            throw new Error(`IP ${ip} is in a blocked range (private/loopback/link-local)`);
        }
    }
}

/**
 * Validates that a webhook URL is safe.
 * Throws Error if the URL fails the checks.
 */
export async function validateWebhookUrl(url: string): Promise<void> {
    // 1. Parse URL
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        throw new Error('Invalid URL format');
    }

    // 2. HTTPS only
    if (parsed.protocol !== 'https:') {
        throw new Error('Only HTTPS URLs are allowed');
    }

    // 3. Block dangerous hostnames
    const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
        throw new Error('localhost URLs are not allowed');
    }

    // 4. Resolve DNS and check IPs (uses shared function — M-04)
    await resolveAndValidateHostname(hostname);
}
