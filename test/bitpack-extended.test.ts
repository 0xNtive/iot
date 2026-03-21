import { describe, it, expect } from 'vitest';
import { packBits, unpackBits, packValues, unpackValues } from '../lib/bitpack.js';

describe('packValues / unpackValues', () => {
  it('packs 2-bit values (4 per byte)', () => {
    const values = [0, 1, 2, 3]; // 4 values → 1 byte
    const packed = packValues(values, 2);
    expect(packed.length).toBe(1);
    // MSB-first: 00 01 10 11 = 0b00011011 = 0x1B
    expect(packed[0]).toBe(0b00011011);
  });

  it('packs 4-bit values (2 per byte)', () => {
    const values = [0x0A, 0x05]; // 2 values → 1 byte
    const packed = packValues(values, 4);
    expect(packed.length).toBe(1);
    expect(packed[0]).toBe(0xA5);
  });

  it('packs 1-bit values (8 per byte)', () => {
    const values = [1, 0, 1, 0, 1, 0, 1, 0];
    const packed = packValues(values, 1);
    expect(packed.length).toBe(1);
    expect(packed[0]).toBe(0b10101010);
  });

  it('roundtrips 2-bit values', () => {
    const original = [0, 1, 2, 3, 3, 2, 1, 0, 0, 2];
    const packed = packValues(original, 2);
    const unpacked = unpackValues(packed, original.length, 2);
    expect(unpacked).toEqual(original);
  });

  it('roundtrips 4-bit values', () => {
    const original = [0, 5, 10, 15, 7, 3, 12, 8, 1];
    const packed = packValues(original, 4);
    const unpacked = unpackValues(packed, original.length, 4);
    expect(unpacked).toEqual(original);
  });

  it('handles partial byte packing for 2-bit', () => {
    const values = [3, 1]; // 2 values in 2-bit = 4 bits → 1 byte (padded)
    const packed = packValues(values, 2);
    expect(packed.length).toBe(1);
    const unpacked = unpackValues(packed, 2, 2);
    expect(unpacked).toEqual([3, 1]);
  });

  it('handles partial byte packing for 4-bit', () => {
    const values = [15]; // 1 value → 1 byte (padded)
    const packed = packValues(values, 4);
    expect(packed.length).toBe(1);
    const unpacked = unpackValues(packed, 1, 4);
    expect(unpacked).toEqual([15]);
  });

  it('handles empty arrays', () => {
    expect(packBits([]).length).toBe(0);
    expect(packValues([], 2).length).toBe(0);
    expect(packValues([], 4).length).toBe(0);
  });

  it('roundtrips large 2-bit array (32x32 gray4 image)', () => {
    const original = new Array(1024).fill(0).map((_, i) => i % 4);
    const packed = packValues(original, 2);
    expect(packed.length).toBe(256); // 1024 values * 2 bits / 8
    const unpacked = unpackValues(packed, 1024, 2);
    expect(unpacked).toEqual(original);
  });

  it('roundtrips large 4-bit array (32x32 gray16 image)', () => {
    const original = new Array(1024).fill(0).map((_, i) => i % 16);
    const packed = packValues(original, 4);
    expect(packed.length).toBe(512); // 1024 values * 4 bits / 8
    const unpacked = unpackValues(packed, 1024, 4);
    expect(unpacked).toEqual(original);
  });

  it('masks values that exceed bit depth', () => {
    // 2-bit depth can only hold 0-3, value 7 should be masked to 3
    const values = [7, 5, 4, 0];
    const packed = packValues(values, 2);
    const unpacked = unpackValues(packed, 4, 2);
    expect(unpacked).toEqual([3, 1, 0, 0]); // masked to 2-bit range
  });

  it('single bit roundtrip matches packBits', () => {
    const bools = [true, false, true, true, false, false, true, false, true];
    const asValues = bools.map(b => b ? 1 : 0);
    const fromBits = packBits(bools);
    const fromValues = packValues(asValues, 1);
    expect(Array.from(fromBits)).toEqual(Array.from(fromValues));
  });
});

describe('edge cases', () => {
  it('single bit pack/unpack', () => {
    const packed = packBits([true]);
    expect(packed.length).toBe(1);
    expect(packed[0]).toBe(0x80);
    const unpacked = unpackBits(packed, 1);
    expect(unpacked).toEqual([true]);
  });

  it('exactly 8 bits fills one byte', () => {
    const packed = packBits(new Array(8).fill(true));
    expect(packed.length).toBe(1);
    expect(packed[0]).toBe(0xFF);
  });

  it('9 bits needs two bytes', () => {
    const bits = [...new Array(8).fill(true), false];
    const packed = packBits(bits);
    expect(packed.length).toBe(2);
    expect(packed[0]).toBe(0xFF);
    expect(packed[1]).toBe(0x00);
  });

  it('unpackBits fewer than packed bits', () => {
    const packed = new Uint8Array([0xFF]);
    const unpacked = unpackBits(packed, 4);
    expect(unpacked).toEqual([true, true, true, true]);
  });

  it('handles max QR v4 size (33x33 = 1089 bits)', () => {
    const original = new Array(1089).fill(false).map((_, i) => i % 2 === 0);
    const packed = packBits(original);
    expect(packed.length).toBe(137);
    const unpacked = unpackBits(packed, 1089);
    expect(unpacked).toEqual(original);
  });
});
