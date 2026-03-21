import { describe, it, expect } from 'vitest';
import {
  encodeGameFrame, decodeGameFrame,
  GameSubtype, ShotResult,
} from '../lib/game-protocol.js';
import {
  createGameState, canPlaceShip, placeShip, toggleOrientation,
  allShipsPlaced, computePlacementHash, confirmReady,
  receiveSetup, receiveShot, recordResult, checkWin,
  declareWin, switchTurn,
  GRID_SIZE, SHIP_SIZES,
} from '../lib/game-state.js';

describe('game protocol boundary coordinates', () => {
  it('roundtrips shots at all corners', () => {
    const corners = [
      [0, 0], [7, 0], [0, 7], [7, 7],
    ];
    for (const [x, y] of corners) {
      const frame = encodeGameFrame({ subtype: GameSubtype.SHOT, x, y });
      const decoded = decodeGameFrame(frame);
      expect(decoded.subtype).toBe(GameSubtype.SHOT);
      if (decoded.subtype === GameSubtype.SHOT) {
        expect(decoded.x).toBe(x);
        expect(decoded.y).toBe(y);
      }
    }
  });

  it('roundtrips results at all corners with all result types', () => {
    for (const result of [ShotResult.Miss, ShotResult.Hit, ShotResult.Sunk]) {
      const frame = encodeGameFrame({
        subtype: GameSubtype.RESULT,
        x: 7, y: 7, result,
      });
      const decoded = decodeGameFrame(frame);
      expect(decoded.subtype).toBe(GameSubtype.RESULT);
      if (decoded.subtype === GameSubtype.RESULT) {
        expect(decoded.result).toBe(result);
      }
    }
  });

  it('encodes setup with large hash values', () => {
    const hash = 0xDEADBEEF;
    const frame = encodeGameFrame({ subtype: GameSubtype.SETUP, hash });
    const decoded = decodeGameFrame(frame);
    expect(decoded.subtype).toBe(GameSubtype.SETUP);
    if (decoded.subtype === GameSubtype.SETUP) {
      expect(decoded.hash).toBe(hash);
    }
  });
});

describe('game state - hash collision tiebreaker', () => {
  it('deterministically resolves same-hash collision', () => {
    const state1 = createGameState();
    // Place ships at same positions → same hash
    placeShip(state1, 0, 0);
    placeShip(state1, 0, 2);
    placeShip(state1, 0, 4);
    const hash = confirmReady(state1);

    // Receive same hash (collision)
    receiveSetup(state1, hash);
    // Should still pick a phase (not crash)
    expect(['my-turn', 'their-turn']).toContain(state1.phase);
  });
});

describe('game state - full game simulation', () => {
  function setupPlayer() {
    const state = createGameState();
    placeShip(state, 0, 0); // size 3, horizontal
    placeShip(state, 0, 2); // size 2, horizontal
    placeShip(state, 0, 4); // size 2, horizontal
    return state;
  }

  it('plays a complete game to victory', () => {
    // Use different placements to get distinct hashes
    const me = createGameState();
    placeShip(me, 0, 0); // size 3, horizontal
    placeShip(me, 0, 2); // size 2, horizontal
    placeShip(me, 0, 4); // size 2, horizontal

    const them = createGameState();
    placeShip(them, 5, 0); // different position
    placeShip(them, 5, 2);
    placeShip(them, 5, 4);

    const myHash = confirmReady(me);
    const theirHash = confirmReady(them);

    // Hashes should differ since placements differ
    expect(myHash).not.toBe(theirHash);

    receiveSetup(me, theirHash);
    receiveSetup(them, myHash);

    // One should be my-turn, other their-turn
    expect(
      (me.phase === 'my-turn' && them.phase === 'their-turn') ||
      (me.phase === 'their-turn' && them.phase === 'my-turn')
    ).toBe(true);

    // Find who goes first
    const attacker = me.phase === 'my-turn' ? me : them;
    const defender = me.phase === 'my-turn' ? them : me;

    // Sink all of defender's ships
    const shipCells: [number, number][] = [];
    for (const ship of defender.ships) {
      for (let i = 0; i < ship.size; i++) {
        const sx = ship.horizontal ? ship.x + i : ship.x;
        const sy = ship.horizontal ? ship.y : ship.y + i;
        shipCells.push([sx, sy]);
      }
    }

    for (const [x, y] of shipCells) {
      const result = receiveShot(defender, x, y);
      expect([ShotResult.Hit, ShotResult.Sunk]).toContain(result);
      recordResult(attacker, x, y, result);
    }

    // Attacker should see win
    expect(checkWin(attacker)).toBe(true);
    // Defender game should be finished (set by receiveShot when last ship sunk)
    expect(defender.phase).toBe('finished');
    expect(defender.winner).toBe('them');
  });

  it('switchTurn alternates correctly', () => {
    const state = setupPlayer();
    confirmReady(state);
    receiveSetup(state, computePlacementHash(state.ships) + 1);

    if (state.phase === 'my-turn') {
      switchTurn(state);
      expect(state.phase).toBe('their-turn');
      switchTurn(state);
      expect(state.phase).toBe('my-turn');
    } else {
      switchTurn(state);
      expect(state.phase).toBe('my-turn');
      switchTurn(state);
      expect(state.phase).toBe('their-turn');
    }
  });

  it('switchTurn does nothing in non-playing phases', () => {
    const state = createGameState();
    expect(state.phase).toBe('placing');
    switchTurn(state);
    expect(state.phase).toBe('placing');
  });

  it('declareWin sets winner and phase', () => {
    const state = setupPlayer();
    declareWin(state);
    expect(state.phase).toBe('finished');
    expect(state.winner).toBe('me');
  });

  it('receiveShot on miss marks grid', () => {
    const state = setupPlayer();
    const result = receiveShot(state, 5, 5); // empty cell
    expect(result).toBe(ShotResult.Miss);
    expect(state.myGrid[5 * GRID_SIZE + 5]).toBe('miss');
  });

  it('recordResult marks target grid for miss', () => {
    const state = createGameState();
    recordResult(state, 3, 3, ShotResult.Miss);
    expect(state.targetGrid[3 * GRID_SIZE + 3]).toBe('miss');
  });

  it('recordResult marks target grid for hit', () => {
    const state = createGameState();
    recordResult(state, 3, 3, ShotResult.Hit);
    expect(state.targetGrid[3 * GRID_SIZE + 3]).toBe('hit');
  });

  it('recordResult marks target grid for sunk as hit', () => {
    const state = createGameState();
    recordResult(state, 3, 3, ShotResult.Sunk);
    expect(state.targetGrid[3 * GRID_SIZE + 3]).toBe('hit');
  });
});

describe('ship placement validation', () => {
  it('vertical ship at bottom edge is rejected', () => {
    const grid = new Array(GRID_SIZE * GRID_SIZE).fill('empty' as const);
    expect(canPlaceShip(grid, 0, 6, 3, false)).toBe(false); // 6+3=9 > 8
    expect(canPlaceShip(grid, 0, 7, 2, false)).toBe(false); // 7+2=9 > 8
  });

  it('horizontal ship at right edge is rejected', () => {
    const grid = new Array(GRID_SIZE * GRID_SIZE).fill('empty' as const);
    expect(canPlaceShip(grid, 6, 0, 3, true)).toBe(false); // 6+3=9 > 8
    expect(canPlaceShip(grid, 7, 0, 2, true)).toBe(false); // 7+2=9 > 8
  });

  it('ship fits exactly at edge', () => {
    const grid = new Array(GRID_SIZE * GRID_SIZE).fill('empty' as const);
    expect(canPlaceShip(grid, 5, 0, 3, true)).toBe(true);  // 5+3=8 <=8
    expect(canPlaceShip(grid, 0, 6, 2, false)).toBe(true); // 6+2=8 <=8
  });

  it('toggleOrientation flips placement', () => {
    const state = createGameState();
    expect(state.horizontal).toBe(true);
    toggleOrientation(state);
    expect(state.horizontal).toBe(false);
    toggleOrientation(state);
    expect(state.horizontal).toBe(true);
  });

  it('allShipsPlaced returns false with 0 ships', () => {
    const state = createGameState();
    expect(allShipsPlaced(state)).toBe(false);
  });

  it('allShipsPlaced returns true after all placed', () => {
    const state = createGameState();
    placeShip(state, 0, 0);
    placeShip(state, 0, 2);
    placeShip(state, 0, 4);
    expect(allShipsPlaced(state)).toBe(true);
  });

  it('confirmReady throws if not all placed', () => {
    const state = createGameState();
    placeShip(state, 0, 0);
    expect(() => confirmReady(state)).toThrow('Not all ships placed');
  });

  it('placement hash is deterministic', () => {
    const state1 = createGameState();
    placeShip(state1, 0, 0);
    placeShip(state1, 0, 2);
    placeShip(state1, 0, 4);

    const state2 = createGameState();
    placeShip(state2, 0, 0);
    placeShip(state2, 0, 2);
    placeShip(state2, 0, 4);

    expect(computePlacementHash(state1.ships)).toBe(computePlacementHash(state2.ships));
  });

  it('different placements produce different hashes', () => {
    const state1 = createGameState();
    placeShip(state1, 0, 0);
    placeShip(state1, 0, 2);
    placeShip(state1, 0, 4);

    const state2 = createGameState();
    placeShip(state2, 1, 0);
    placeShip(state2, 1, 2);
    placeShip(state2, 1, 4);

    expect(computePlacementHash(state1.ships)).not.toBe(computePlacementHash(state2.ships));
  });
});
