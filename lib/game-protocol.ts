/**
 * Battleship game protocol - encode/decode game frames.
 *
 * Frame type 0x05, subtypes:
 *   SETUP  (0x01): placement hash for turn order — 7 bytes
 *   SHOT   (0x02): fire at coordinate — 5 bytes
 *   RESULT (0x03): hit/miss/sunk response — 6 bytes
 *   WIN    (0x04): game over — 3 bytes
 */

export const GAME_FRAME_TYPE = 0x05;

export const enum GameSubtype {
  SETUP = 0x01,
  SHOT = 0x02,
  RESULT = 0x03,
  WIN = 0x04,
}

export const enum ShotResult {
  Miss = 0,
  Hit = 1,
  Sunk = 2,
}

export interface SetupMessage {
  subtype: GameSubtype.SETUP;
  hash: number; // 32-bit hash of ship placement
}

export interface ShotMessage {
  subtype: GameSubtype.SHOT;
  x: number;
  y: number;
}

export interface ResultMessage {
  subtype: GameSubtype.RESULT;
  x: number;
  y: number;
  result: ShotResult;
}

export interface WinMessage {
  subtype: GameSubtype.WIN;
}

export type GameMessage = SetupMessage | ShotMessage | ResultMessage | WinMessage;

/**
 * Encode a game message into a frame.
 */
export function encodeGameFrame(msg: GameMessage): Uint8Array {
  switch (msg.subtype) {
    case GameSubtype.SETUP: {
      // [0x05][0x01][hash:4bytes][version]
      const frame = new Uint8Array(7);
      frame[0] = GAME_FRAME_TYPE;
      frame[1] = GameSubtype.SETUP;
      frame[2] = (msg.hash >>> 24) & 0xff;
      frame[3] = (msg.hash >>> 16) & 0xff;
      frame[4] = (msg.hash >>> 8) & 0xff;
      frame[5] = msg.hash & 0xff;
      frame[6] = 0x01; // version
      return frame;
    }
    case GameSubtype.SHOT: {
      // [0x05][0x02][x][y][version]
      const frame = new Uint8Array(5);
      frame[0] = GAME_FRAME_TYPE;
      frame[1] = GameSubtype.SHOT;
      frame[2] = msg.x;
      frame[3] = msg.y;
      frame[4] = 0x01;
      return frame;
    }
    case GameSubtype.RESULT: {
      // [0x05][0x03][x][y][result][version]
      const frame = new Uint8Array(6);
      frame[0] = GAME_FRAME_TYPE;
      frame[1] = GameSubtype.RESULT;
      frame[2] = msg.x;
      frame[3] = msg.y;
      frame[4] = msg.result;
      frame[5] = 0x01;
      return frame;
    }
    case GameSubtype.WIN: {
      // [0x05][0x04][version]
      const frame = new Uint8Array(3);
      frame[0] = GAME_FRAME_TYPE;
      frame[1] = GameSubtype.WIN;
      frame[2] = 0x01;
      return frame;
    }
  }
}

/**
 * Decode a game frame into a message.
 */
export function decodeGameFrame(data: Uint8Array): GameMessage {
  if (data.length < 3) throw new Error('Game frame too short');
  if (data[0] !== GAME_FRAME_TYPE) throw new Error('Not a game frame');

  const subtype = data[1];
  switch (subtype) {
    case GameSubtype.SETUP: {
      if (data.length < 7) throw new Error('SETUP frame too short');
      const hash = ((data[2] << 24) | (data[3] << 16) | (data[4] << 8) | data[5]) >>> 0;
      return { subtype: GameSubtype.SETUP, hash };
    }
    case GameSubtype.SHOT: {
      if (data.length < 5) throw new Error('SHOT frame too short');
      return { subtype: GameSubtype.SHOT, x: data[2], y: data[3] };
    }
    case GameSubtype.RESULT: {
      if (data.length < 6) throw new Error('RESULT frame too short');
      return { subtype: GameSubtype.RESULT, x: data[2], y: data[3], result: data[4] as ShotResult };
    }
    case GameSubtype.WIN: {
      return { subtype: GameSubtype.WIN };
    }
    default:
      throw new Error(`Unknown game subtype: 0x${subtype.toString(16)}`);
  }
}
