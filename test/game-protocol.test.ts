import { describe, it, expect } from 'vitest';
import {
  encodeGameFrame,
  decodeGameFrame,
  GameSubtype,
  ShotResult,
  GAME_FRAME_TYPE,
  type SetupMessage,
  type ShotMessage,
  type ResultMessage,
  type WinMessage,
} from '../lib/game-protocol.js';

describe('game-protocol', () => {
  describe('SETUP', () => {
    it('roundtrips a setup message', () => {
      const msg: SetupMessage = { subtype: GameSubtype.SETUP, hash: 0xDEADBEEF };
      const frame = encodeGameFrame(msg);
      expect(frame.length).toBe(7);
      expect(frame[0]).toBe(GAME_FRAME_TYPE);
      expect(frame[1]).toBe(GameSubtype.SETUP);

      const decoded = decodeGameFrame(frame) as SetupMessage;
      expect(decoded.subtype).toBe(GameSubtype.SETUP);
      expect(decoded.hash).toBe(0xDEADBEEF);
    });

    it('handles hash = 0', () => {
      const msg: SetupMessage = { subtype: GameSubtype.SETUP, hash: 0 };
      const decoded = decodeGameFrame(encodeGameFrame(msg)) as SetupMessage;
      expect(decoded.hash).toBe(0);
    });

    it('handles max hash', () => {
      const msg: SetupMessage = { subtype: GameSubtype.SETUP, hash: 0xFFFFFFFF };
      const decoded = decodeGameFrame(encodeGameFrame(msg)) as SetupMessage;
      expect(decoded.hash).toBe(0xFFFFFFFF);
    });
  });

  describe('SHOT', () => {
    it('roundtrips a shot message', () => {
      const msg: ShotMessage = { subtype: GameSubtype.SHOT, x: 3, y: 5 };
      const frame = encodeGameFrame(msg);
      expect(frame.length).toBe(5);

      const decoded = decodeGameFrame(frame) as ShotMessage;
      expect(decoded.subtype).toBe(GameSubtype.SHOT);
      expect(decoded.x).toBe(3);
      expect(decoded.y).toBe(5);
    });

    it('roundtrips corner coordinates', () => {
      for (const [x, y] of [[0, 0], [7, 0], [0, 7], [7, 7]]) {
        const msg: ShotMessage = { subtype: GameSubtype.SHOT, x, y };
        const decoded = decodeGameFrame(encodeGameFrame(msg)) as ShotMessage;
        expect(decoded.x).toBe(x);
        expect(decoded.y).toBe(y);
      }
    });
  });

  describe('RESULT', () => {
    it('roundtrips hit result', () => {
      const msg: ResultMessage = { subtype: GameSubtype.RESULT, x: 2, y: 4, result: ShotResult.Hit };
      const frame = encodeGameFrame(msg);
      expect(frame.length).toBe(6);

      const decoded = decodeGameFrame(frame) as ResultMessage;
      expect(decoded.subtype).toBe(GameSubtype.RESULT);
      expect(decoded.x).toBe(2);
      expect(decoded.y).toBe(4);
      expect(decoded.result).toBe(ShotResult.Hit);
    });

    it('roundtrips miss result', () => {
      const msg: ResultMessage = { subtype: GameSubtype.RESULT, x: 1, y: 1, result: ShotResult.Miss };
      const decoded = decodeGameFrame(encodeGameFrame(msg)) as ResultMessage;
      expect(decoded.result).toBe(ShotResult.Miss);
    });

    it('roundtrips sunk result', () => {
      const msg: ResultMessage = { subtype: GameSubtype.RESULT, x: 6, y: 7, result: ShotResult.Sunk };
      const decoded = decodeGameFrame(encodeGameFrame(msg)) as ResultMessage;
      expect(decoded.result).toBe(ShotResult.Sunk);
    });
  });

  describe('WIN', () => {
    it('roundtrips a win message', () => {
      const msg: WinMessage = { subtype: GameSubtype.WIN };
      const frame = encodeGameFrame(msg);
      expect(frame.length).toBe(3);

      const decoded = decodeGameFrame(frame) as WinMessage;
      expect(decoded.subtype).toBe(GameSubtype.WIN);
    });
  });

  describe('error cases', () => {
    it('throws on too-short frame', () => {
      expect(() => decodeGameFrame(new Uint8Array([0x05]))).toThrow();
    });

    it('throws on wrong frame type', () => {
      expect(() => decodeGameFrame(new Uint8Array([0x01, 0x01, 0x00]))).toThrow('Not a game frame');
    });

    it('throws on unknown subtype', () => {
      expect(() => decodeGameFrame(new Uint8Array([0x05, 0xFF, 0x00]))).toThrow('Unknown game subtype');
    });
  });
});
