import { describe, it, expect } from 'vitest';
import { packBits, unpackBits } from '../lib/bitpack.js';

describe('packBits', () => {
  it('packs 8 bits into 1 byte MSB-first', () => {
    const bits = [true, false, true, false, true, false, true, false];
    const packed = packBits(bits);
    expect(packed.length).toBe(1);
    expect(packed[0]).toBe(0b10101010);
  });

  it('packs all true bits', () => {
    const bits = new Array(8).fill(true);
    const packed = packBits(bits);
    expect(packed[0]).toBe(0xff);
  });

  it('packs all false bits', () => {
    const bits = new Array(8).fill(false);
    const packed = packBits(bits);
    expect(packed[0]).toBe(0x00);
  });

  it('pads partial bytes with zeros', () => {
    const bits = [true, true, true]; // 3 bits → 1 byte
    const packed = packBits(bits);
    expect(packed.length).toBe(1);
    expect(packed[0]).toBe(0b11100000);
  });

  it('packs multiple bytes', () => {
    const bits = new Array(16).fill(false);
    bits[0] = true;  // byte 0, bit 7
    bits[8] = true;  // byte 1, bit 7
    const packed = packBits(bits);
    expect(packed.length).toBe(2);
    expect(packed[0]).toBe(0x80);
    expect(packed[1]).toBe(0x80);
  });
});

describe('unpackBits', () => {
  it('unpacks 1 byte into 8 bits', () => {
    const packed = new Uint8Array([0b10101010]);
    const bits = unpackBits(packed, 8);
    expect(bits).toEqual([true, false, true, false, true, false, true, false]);
  });

  it('unpacks partial byte', () => {
    const packed = new Uint8Array([0b11100000]);
    const bits = unpackBits(packed, 3);
    expect(bits).toEqual([true, true, true]);
  });
});

describe('roundtrip', () => {
  it('roundtrips arbitrary bit patterns', () => {
    const original = [
      true, false, true, true, false, false, true, false,
      false, true, true, false, true,
    ];
    const packed = packBits(original);
    const unpacked = unpackBits(packed, original.length);
    expect(unpacked).toEqual(original);
  });

  it('roundtrips QR-sized data (21x21 = 441 bits)', () => {
    const original = new Array(441).fill(false).map((_, i) => i % 3 === 0);
    const packed = packBits(original);
    expect(packed.length).toBe(Math.ceil(441 / 8));
    const unpacked = unpackBits(packed, 441);
    expect(unpacked).toEqual(original);
  });

  it('roundtrips 32x32 image data (1024 bits)', () => {
    const original = new Array(1024).fill(false).map((_, i) => i % 7 === 0);
    const packed = packBits(original);
    expect(packed.length).toBe(128);
    const unpacked = unpackBits(packed, 1024);
    expect(unpacked).toEqual(original);
  });
});
