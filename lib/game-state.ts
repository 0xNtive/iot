/**
 * Pure game logic for Battleship.
 *
 * 8x8 grid, 3 ships (sizes 3, 2, 2).
 * State machine: placing → ready → playing → finished
 */

import { ShotResult } from './game-protocol.js';

export const GRID_SIZE = 8;
export const SHIP_SIZES = [3, 2, 2] as const;

export type CellState = 'empty' | 'ship' | 'hit' | 'miss';

export interface Ship {
  x: number;
  y: number;
  size: number;
  horizontal: boolean;
  hits: boolean[];
}

export type GamePhase = 'placing' | 'ready' | 'waiting-setup' | 'my-turn' | 'their-turn' | 'finished';

export interface GameState {
  phase: GamePhase;
  myGrid: CellState[];     // 8x8 flat
  targetGrid: CellState[]; // 8x8 opponent view
  ships: Ship[];
  myHash: number;
  opponentHash: number;
  currentShipIndex: number; // which ship is being placed next
  horizontal: boolean;      // current placement orientation
  winner: 'me' | 'them' | null;
}

export function createGameState(): GameState {
  return {
    phase: 'placing',
    myGrid: new Array(GRID_SIZE * GRID_SIZE).fill('empty'),
    targetGrid: new Array(GRID_SIZE * GRID_SIZE).fill('empty'),
    ships: [],
    myHash: 0,
    opponentHash: 0,
    currentShipIndex: 0,
    horizontal: true,
    winner: null,
  };
}

/** Check if a ship can be placed at the given position. */
export function canPlaceShip(
  grid: CellState[],
  x: number,
  y: number,
  size: number,
  horizontal: boolean,
): boolean {
  if (horizontal) {
    if (x + size > GRID_SIZE) return false;
    for (let i = 0; i < size; i++) {
      if (grid[y * GRID_SIZE + (x + i)] !== 'empty') return false;
    }
  } else {
    if (y + size > GRID_SIZE) return false;
    for (let i = 0; i < size; i++) {
      if ((y + i) * GRID_SIZE + x >= GRID_SIZE * GRID_SIZE) return false;
      if (grid[(y + i) * GRID_SIZE + x] !== 'empty') return false;
    }
  }
  return true;
}

/** Place a ship on the grid. Returns the new ship or null if invalid. */
export function placeShip(
  state: GameState,
  x: number,
  y: number,
): Ship | null {
  if (state.currentShipIndex >= SHIP_SIZES.length) return null;

  const size = SHIP_SIZES[state.currentShipIndex];
  if (!canPlaceShip(state.myGrid, x, y, size, state.horizontal)) return null;

  const ship: Ship = {
    x, y, size,
    horizontal: state.horizontal,
    hits: new Array(size).fill(false),
  };

  // Mark grid cells
  for (let i = 0; i < size; i++) {
    const cx = state.horizontal ? x + i : x;
    const cy = state.horizontal ? y : y + i;
    state.myGrid[cy * GRID_SIZE + cx] = 'ship';
  }

  state.ships.push(ship);
  state.currentShipIndex++;

  return ship;
}

/** Toggle placement orientation. */
export function toggleOrientation(state: GameState): void {
  state.horizontal = !state.horizontal;
}

/** Check if all ships have been placed. */
export function allShipsPlaced(state: GameState): boolean {
  return state.currentShipIndex >= SHIP_SIZES.length;
}

/** Compute a hash of the ship placement for turn order. */
export function computePlacementHash(ships: Ship[]): number {
  let hash = 0x811c9dc5; // FNV-1a offset basis
  for (const ship of ships) {
    hash ^= ship.x;
    hash = Math.imul(hash, 0x01000193);
    hash ^= ship.y;
    hash = Math.imul(hash, 0x01000193);
    hash ^= ship.size;
    hash = Math.imul(hash, 0x01000193);
    hash ^= ship.horizontal ? 1 : 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0; // unsigned
}

/** Mark the state as ready and compute hash. */
export function confirmReady(state: GameState): number {
  if (!allShipsPlaced(state)) throw new Error('Not all ships placed');
  state.phase = 'waiting-setup';
  state.myHash = computePlacementHash(state.ships);
  return state.myHash;
}

/** Handle receiving opponent's setup hash. Determines turn order. */
export function receiveSetup(state: GameState, opponentHash: number): void {
  state.opponentHash = opponentHash;
  if (state.phase === 'waiting-setup') {
    // Both sides ready — determine turn order
    decideTurnOrder(state);
  }
}

/** After both hashes are known, decide who goes first. */
function decideTurnOrder(state: GameState): void {
  if (state.myHash < state.opponentHash) {
    state.phase = 'my-turn';
  } else if (state.myHash > state.opponentHash) {
    state.phase = 'their-turn';
  } else {
    // Hash collision tiebreaker: XOR with ship count parity
    // Both sides compute the same result deterministically
    const tiebreak = (state.myHash ^ 0xA5A5A5A5) >>> 0;
    state.phase = (tiebreak % 2 === 0) ? 'my-turn' : 'their-turn';
  }
}

/** Handle an incoming shot at our grid. Returns the result. */
export function receiveShot(
  state: GameState,
  x: number,
  y: number,
): ShotResult {
  const idx = y * GRID_SIZE + x;
  const cell = state.myGrid[idx];

  if (cell === 'ship') {
    state.myGrid[idx] = 'hit';

    // Find which ship was hit
    for (const ship of state.ships) {
      for (let i = 0; i < ship.size; i++) {
        const sx = ship.horizontal ? ship.x + i : ship.x;
        const sy = ship.horizontal ? ship.y : ship.y + i;
        if (sx === x && sy === y) {
          ship.hits[i] = true;
          if (ship.hits.every(h => h)) {
            // Check if all ships sunk
            if (state.ships.every(s => s.hits.every(h => h))) {
              state.phase = 'finished';
              state.winner = 'them';
            }
            return ShotResult.Sunk;
          }
          return ShotResult.Hit;
        }
      }
    }
    return ShotResult.Hit;
  }

  state.myGrid[idx] = 'miss';
  return ShotResult.Miss;
}

/** Record a result from our shot on the opponent's grid. */
export function recordResult(
  state: GameState,
  x: number,
  y: number,
  result: ShotResult,
): void {
  const idx = y * GRID_SIZE + x;
  if (result === ShotResult.Miss) {
    state.targetGrid[idx] = 'miss';
  } else {
    state.targetGrid[idx] = 'hit';
  }
}

/** Check if all opponent ships are sunk (7 hits = 3+2+2). */
export function checkWin(state: GameState): boolean {
  const totalHits = SHIP_SIZES.reduce((a, b) => a + b, 0);
  const hits = state.targetGrid.filter(c => c === 'hit').length;
  return hits >= totalHits;
}

/** Mark game as won by us. */
export function declareWin(state: GameState): void {
  state.phase = 'finished';
  state.winner = 'me';
}

/** Switch turns after a shot/result exchange. */
export function switchTurn(state: GameState): void {
  if (state.phase === 'my-turn') {
    state.phase = 'their-turn';
  } else if (state.phase === 'their-turn') {
    state.phase = 'my-turn';
  }
}
