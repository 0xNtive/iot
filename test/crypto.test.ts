import { describe, it, expect } from 'vitest';
import { xorEncrypt, xorDecrypt } from '../lib/crypto.js';

describe('XOR Encryption', () => {
  it('should encrypt and decrypt data correctly', () => {
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    const key = new Uint8Array([255, 128, 64, 32]);

    const encrypted = xorEncrypt(data, key);
    const decrypted = xorDecrypt(encrypted, key);

    expect(decrypted).toEqual(data);
  });

  it('should handle empty data', () => {
    const data = new Uint8Array([]);
    const key = new Uint8Array([42, 84, 126]);

    const encrypted = xorEncrypt(data, key);
    const decrypted = xorDecrypt(encrypted, key);

    expect(encrypted).toEqual(data);
    expect(decrypted).toEqual(data);
  });

  it('should work with single byte key', () => {
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    const key = new Uint8Array([255]);

    const encrypted = xorEncrypt(data, key);
    expect(encrypted).toEqual(new Uint8Array([254, 253, 252, 251, 250]));

    const decrypted = xorDecrypt(encrypted, key);
    expect(decrypted).toEqual(data);
  });

  it('should repeat key when shorter than data', () => {
    const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const key = new Uint8Array([10, 20, 30]);

    const encrypted = xorEncrypt(data, key);
    // Key pattern: 10, 20, 30, 10, 20, 30, 10, 20
    // XOR: 1^10=11, 2^20=22, 3^30=29, 4^10=14, 5^20=17, 6^30=24, 7^10=13, 8^20=28
    const expected = new Uint8Array([11, 22, 29, 14, 17, 24, 13, 28]);
    expect(encrypted).toEqual(expected);

    const decrypted = xorDecrypt(encrypted, key);
    expect(decrypted).toEqual(data);
  });

  it('should work with wrong key', () => {
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    const correctKey = new Uint8Array([255, 128, 64]);
    const wrongKey = new Uint8Array([128, 64, 32]);

    const encrypted = xorEncrypt(data, correctKey);
    const wrongDecrypted = xorDecrypt(encrypted, wrongKey);

    // Should not match original data
    expect(wrongDecrypted).not.toEqual(data);
  });

  it('should throw error for empty key', () => {
    const data = new Uint8Array([1, 2, 3]);
    const emptyKey = new Uint8Array([]);

    expect(() => xorEncrypt(data, emptyKey)).toThrow('Encryption key cannot be empty');
    expect(() => xorDecrypt(data, emptyKey)).toThrow('Encryption key cannot be empty');
  });

  it('should be symmetric (encrypt = decrypt)', () => {
    const data = new Uint8Array([100, 200, 50, 150]);
    const key = new Uint8Array([17, 34, 68, 136]);

    const result1 = xorDecrypt(data, key);
    const result2 = xorEncrypt(data, key);

    expect(result1).toEqual(result2);
  });

  it('should handle large data', () => {
    const size = 10000;
    const data = new Uint8Array(size);
    for (let i = 0; i < size; i++) {
      data[i] = i % 256;
    }
    const key = new Uint8Array([123, 234, 45, 156, 67, 178, 89, 90]);

    const encrypted = xorEncrypt(data, key);
    const decrypted = xorDecrypt(encrypted, key);

    expect(decrypted).toEqual(data);
    expect(encrypted.length).toBe(size);
  });
});