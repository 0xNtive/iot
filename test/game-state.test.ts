import { describe, it, expect } from 'vitest';
import {
  createGameState,
  canPlaceShip,
  placeShip,
  toggleOrientation,
  allShipsPlaced,
  computePlacementHash,
  confirmReady,
  receiveSetup,
  receiveShot,
  recordResult,
  checkWin,
  declareWin,
  switchTurn,
  GRID_SIZE,
  SHIP_SIZES,
} from '../lib/game-state.js';
import { ShotResult } from '../lib/game-protocol.js';

describe('game-state', () => {
  describe('ship placement', () => {
    it('can place a horizontal ship', () => {
      const state = createGameState();
      const ship = placeShip(state, 0, 0);
      expect(ship).not.toBeNull();
      expect(ship!.size).toBe(SHIP_SIZES[0]); // 3
      expect(ship!.horizontal).toBe(true);
      expect(state.myGrid[0]).toBe('ship');
      expect(state.myGrid[1]).toBe('ship');
      expect(state.myGrid[2]).toBe('ship');
    });

    it('can place a vertical ship', () => {
      const state = createGameState();
      toggleOrientation(state);
      const ship = placeShip(state, 0, 0);
      expect(ship).not.toBeNull();
      expect(ship!.horizontal).toBe(false);
      expect(state.myGrid[0]).toBe('ship');
      expect(state.myGrid[GRID_SIZE]).toBe('ship');
      expect(state.myGrid[2 * GRID_SIZE]).toBe('ship');
    });

    it('rejects out-of-bounds horizontal placement', () => {
      const state = createGameState();
      // Ship of size 3 at x=6 would extend to x=8 (out of 8x8 grid)
      const ship = placeShip(state, 6, 0);
      expect(ship).toBeNull();
    });

    it('rejects out-of-bounds vertical placement', () => {
      const state = createGameState();
      toggleOrientation(state);
      const ship = placeShip(state, 0, 6);
      expect(ship).toBeNull();
    });

    it('rejects overlapping ships', () => {
      const state = createGameState();
      placeShip(state, 0, 0); // size 3 at (0,0)-(2,0)
      const ship = placeShip(state, 1, 0); // size 2 overlaps at (1,0)
      expect(ship).toBeNull();
    });

    it('places all 3 ships', () => {
      const state = createGameState();
      placeShip(state, 0, 0); // size 3
      placeShip(state, 0, 2); // size 2
      placeShip(state, 0, 4); // size 2
      expect(allShipsPlaced(state)).toBe(true);
      expect(state.ships.length).toBe(3);
    });

    it('rejects placement after all ships placed', () => {
      const state = createGameState();
      placeShip(state, 0, 0);
      placeShip(state, 0, 2);
      placeShip(state, 0, 4);
      const extra = placeShip(state, 0, 6);
      expect(extra).toBeNull();
    });
  });

  describe('canPlaceShip', () => {
    it('returns true for valid position', () => {
      const grid = new Array(GRID_SIZE * GRID_SIZE).fill('empty');
      expect(canPlaceShip(grid, 0, 0, 3, true)).toBe(true);
    });

    it('returns false for occupied cell', () => {
      const grid = new Array(GRID_SIZE * GRID_SIZE).fill('empty');
      grid[1] = 'ship';
      expect(canPlaceShip(grid, 0, 0, 3, true)).toBe(false);
    });
  });

  describe('placement hash', () => {
    it('produces consistent hash for same placement', () => {
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

    it('produces different hash for different placements', () => {
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

  describe('turn order', () => {
    it('lower hash goes first', () => {
      const state = createGameState();
      placeShip(state, 0, 0);
      placeShip(state, 0, 2);
      placeShip(state, 0, 4);
      confirmReady(state);

      // Simulate receiving a higher hash
      receiveSetup(state, state.myHash + 1);
      expect(state.phase).toBe('my-turn');
    });

    it('higher hash goes second', () => {
      const state = createGameState();
      placeShip(state, 0, 0);
      placeShip(state, 0, 2);
      placeShip(state, 0, 4);
      confirmReady(state);

      // Simulate receiving a lower hash
      receiveSetup(state, state.myHash > 0 ? state.myHash - 1 : state.myHash + 1);
      if (state.myHash > 0) {
        expect(state.phase).toBe('their-turn');
      }
    });
  });

  describe('combat', () => {
    function setupGame() {
      const state = createGameState();
      placeShip(state, 0, 0); // size 3: (0,0),(1,0),(2,0)
      placeShip(state, 0, 2); // size 2: (0,2),(1,2)
      placeShip(state, 0, 4); // size 2: (0,4),(1,4)
      confirmReady(state);
      receiveSetup(state, state.myHash + 1); // we go first
      return state;
    }

    it('reports miss for empty cell', () => {
      const state = setupGame();
      const result = receiveShot(state, 5, 5);
      expect(result).toBe(ShotResult.Miss);
      expect(state.myGrid[5 * GRID_SIZE + 5]).toBe('miss');
    });

    it('reports hit for ship cell', () => {
      const state = setupGame();
      const result = receiveShot(state, 0, 0);
      expect(result).toBe(ShotResult.Hit);
      expect(state.myGrid[0]).toBe('hit');
    });

    it('reports sunk when all cells of a ship are hit', () => {
      const state = setupGame();
      receiveShot(state, 0, 0); // hit
      receiveShot(state, 1, 0); // hit
      const result = receiveShot(state, 2, 0); // sunk (size 3 ship)
      expect(result).toBe(ShotResult.Sunk);
    });

    it('ends game when all ships sunk', () => {
      const state = setupGame();
      // Sink ship 1 (size 3)
      receiveShot(state, 0, 0);
      receiveShot(state, 1, 0);
      receiveShot(state, 2, 0);
      // Sink ship 2 (size 2)
      receiveShot(state, 0, 2);
      receiveShot(state, 1, 2);
      // Sink ship 3 (size 2)
      receiveShot(state, 0, 4);
      const result = receiveShot(state, 1, 4);
      expect(result).toBe(ShotResult.Sunk);
      expect(state.phase).toBe('finished');
      expect(state.winner).toBe('them');
    });

    it('recordResult marks target grid', () => {
      const state = setupGame();
      recordResult(state, 3, 3, ShotResult.Miss);
      expect(state.targetGrid[3 * GRID_SIZE + 3]).toBe('miss');

      recordResult(state, 4, 4, ShotResult.Hit);
      expect(state.targetGrid[4 * GRID_SIZE + 4]).toBe('hit');
    });

    it('checkWin detects when all hits accumulated', () => {
      const state = setupGame();
      const totalHits = SHIP_SIZES.reduce((a, b) => a + b, 0); // 7
      // Mark enough hits on target grid
      for (let i = 0; i < totalHits; i++) {
        state.targetGrid[i] = 'hit';
      }
      expect(checkWin(state)).toBe(true);
    });

    it('switchTurn alternates turns', () => {
      const state = setupGame();
      expect(state.phase).toBe('my-turn');
      switchTurn(state);
      expect(state.phase).toBe('their-turn');
      switchTurn(state);
      expect(state.phase).toBe('my-turn');
    });

    it('declareWin sets winner to me', () => {
      const state = setupGame();
      declareWin(state);
      expect(state.phase).toBe('finished');
      expect(state.winner).toBe('me');
    });
  });
});
