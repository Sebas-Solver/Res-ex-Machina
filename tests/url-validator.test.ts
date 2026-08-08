// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';
import {
    isBlockedIp,
    resolveAndValidateHostname,
    validateWebhookUrl,
    BLOCKED_IP_RANGES,
} from '../src/utils/urlValidator.js';

describe('urlValidator (SSRF Mitigation)', () => {
    describe('isBlockedIp', () => {
        it('blocks loopback IPv4 addresses', () => {
            expect(isBlockedIp('127.0.0.1')).toBe(true);
            expect(isBlockedIp('127.0.1.1')).toBe(true);
        });

        it('blocks Class A private IPv4 addresses', () => {
            expect(isBlockedIp('10.0.0.1')).toBe(true);
            expect(isBlockedIp('10.255.255.255')).toBe(true);
        });

        it('blocks Class B private IPv4 addresses', () => {
            expect(isBlockedIp('172.16.0.1')).toBe(true);
            expect(isBlockedIp('172.31.255.255')).toBe(true);
            expect(isBlockedIp('172.32.0.1')).toBe(false); // Outside range 16-31
        });

        it('blocks Class C private IPv4 addresses', () => {
            expect(isBlockedIp('192.168.1.1')).toBe(true);
            expect(isBlockedIp('192.168.0.254')).toBe(true);
        });

        it('blocks link-local IPv4 addresses', () => {
            expect(isBlockedIp('169.254.1.1')).toBe(true);
        });

        it('blocks 0.x.x.x addresses', () => {
            expect(isBlockedIp('0.0.0.0')).toBe(true);
        });

        it('blocks IPv6 loopback, ULA, and link-local addresses', () => {
            expect(isBlockedIp('::1')).toBe(true);
            expect(isBlockedIp('fc00::1')).toBe(true);
            expect(isBlockedIp('fe80::1')).toBe(true);
            expect(isBlockedIp('::ffff:127.0.0.1')).toBe(true);
            expect(isBlockedIp('::ffff:10.0.0.1')).toBe(true);
        });

        it('allows legitimate public IP addresses', () => {
            expect(isBlockedIp('8.8.8.8')).toBe(false);
            expect(isBlockedIp('1.1.1.1')).toBe(false);
            expect(isBlockedIp('93.184.216.34')).toBe(false);
        });
    });

    describe('validateWebhookUrl', () => {
        it('throws error for malformed URLs', async () => {
            await expect(validateWebhookUrl('not-a-url')).rejects.toThrow('Invalid URL format');
        });

        it('throws error for non-HTTPS protocols', async () => {
            await expect(validateWebhookUrl('http://api.example.com/webhook')).rejects.toThrow(
                'Only HTTPS URLs are allowed'
            );
            await expect(validateWebhookUrl('ftp://api.example.com/webhook')).rejects.toThrow(
                'Only HTTPS URLs are allowed'
            );
        });

        it('throws error for forbidden hostnames (localhost, 127.0.0.1, ::1)', async () => {
            await expect(validateWebhookUrl('https://localhost/webhook')).rejects.toThrow(
                'localhost URLs are not allowed'
            );
            await expect(validateWebhookUrl('https://127.0.0.1/webhook')).rejects.toThrow(
                'localhost URLs are not allowed'
            );
            await expect(validateWebhookUrl('https://[::1]/webhook')).rejects.toThrow(
                'localhost URLs are not allowed'
            );
        });
    });

    describe('resolveAndValidateHostname', () => {
        it('throws error if resolved IP is in a blocked range', async () => {
            await expect(resolveAndValidateHostname('192.168.1.50')).rejects.toThrow(
                'blocked range'
            );
        });

        it('passes validation for valid public hostname or IP', async () => {
            await expect(resolveAndValidateHostname('8.8.8.8')).resolves.not.toThrow();
        });
    });
});
