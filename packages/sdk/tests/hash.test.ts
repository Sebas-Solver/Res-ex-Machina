import { describe, it, expect } from 'vitest';
import { computeContentHash } from '../src/hash.js';

describe('computeContentHash', () => {
    it('should hash a string to sha256 format', async () => {
        const hash = await computeContentHash('hello world');
        expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    });

    it('should produce deterministic hashes', async () => {
        const hash1 = await computeContentHash('test content');
        const hash2 = await computeContentHash('test content');
        expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different content', async () => {
        const hash1 = await computeContentHash('content A');
        const hash2 = await computeContentHash('content B');
        expect(hash1).not.toBe(hash2);
    });

    it('should hash empty string', async () => {
        const hash = await computeContentHash('');
        // SHA-256 of empty string is well-known
        expect(hash).toBe('sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    });

    it('should hash Uint8Array', async () => {
        const bytes = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
        const hash = await computeContentHash(bytes);
        expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    });

    it('should produce same hash for string and equivalent Uint8Array', async () => {
        const str = 'Hello';
        const bytes = new TextEncoder().encode(str);
        const hashStr = await computeContentHash(str);
        const hashBytes = await computeContentHash(bytes);
        expect(hashStr).toBe(hashBytes);
    });
});
