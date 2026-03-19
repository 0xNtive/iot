/**
 * Battleship game panel — two 8x8 grids with ship placement and combat UI.
 *
 * Features: coordinate labels, ship placement ghost, ship roster,
 * status types, last-shot highlight, target-grid hover.
 */

import {
  createGameState,
  placeShip,
  canPlaceShip,
  toggleOrientation,
  allShipsPlaced,
  confirmReady,
  receiveSetup,
  receiveShot,
  recordResult,
  checkWin,
  declareWin,
  switchTurn,
  GRID_SIZE,
  SHIP_SIZES,
  type GameState,
  type CellState,
} from '../../lib/game-state.js';
import {
  encodeGameFrame,
  GameSubtype,
  ShotResult,
  type GameMessage,
} from '../../lib/game-protocol.js';

const CELL_PX = 32;
const GRID_PX = GRID_SIZE * CELL_PX;

type StatusType = 'info' | 'hit' | 'miss' | 'sunk' | 'win' | 'lose';

export class GamePanel {
  private myCanvas: HTMLCanvasElement;
  private targetCanvas: HTMLCanvasElement;
  private myCtx: CanvasRenderingContext2D;
  private targetCtx: CanvasRenderingContext2D;
  private statusEl: HTMLElement;
  private rosterEl: HTMLElement;
  private rotateBtn: HTMLButtonElement;
  private readyBtn: HTMLButtonElement;
  private newGameBtn: HTMLButtonElement;
  private state: GameState;
  private onSendFrame: ((frame: Uint8Array) => void) | null = null;
  private pendingShotResolve: (() => void) | null = null;
  private hoverCell: { x: number; y: number } | null = null;
  private targetHoverCell: { x: number; y: number } | null = null;
  private lastShot: { x: number; y: number; grid: 'my' | 'target' } | null = null;

  constructor() {
    this.myCanvas = document.getElementById('game-my-grid') as HTMLCanvasElement;
    this.targetCanvas = document.getElementById('game-target-grid') as HTMLCanvasElement;
    this.myCtx = this.myCanvas.getContext('2d')!;
    this.targetCtx = this.targetCanvas.getContext('2d')!;
    this.statusEl = document.getElementById('game-status')!;
    this.rosterEl = document.getElementById('game-ship-roster')!;
    this.rotateBtn = document.getElementById('game-rotate') as HTMLButtonElement;
    this.readyBtn = document.getElementById('game-ready') as HTMLButtonElement;
    this.newGameBtn = document.getElementById('game-new') as HTMLButtonElement;

    this.state = createGameState();

    this.myCanvas.addEventListener('click', (e) => this.onMyGridClick(e));
    this.targetCanvas.addEventListener('click', (e) => this.onTargetGridClick(e));

    // Ship placement ghost
    this.myCanvas.addEventListener('mousemove', (e) => this.onMyGridHover(e));
    this.myCanvas.addEventListener('mouseleave', () => {
      this.hoverCell = null;
      this.render();
    });

    // Target grid hover
    this.targetCanvas.addEventListener('mousemove', (e) => this.onTargetGridHover(e));
    this.targetCanvas.addEventListener('mouseleave', () => {
      this.targetHoverCell = null;
      this.render();
    });

    this.rotateBtn.addEventListener('click', () => {
      toggleOrientation(this.state);
      this.setStatus(`Orientation: ${this.state.horizontal ? 'horizontal' : 'vertical'}`, 'info');
      this.render();
    });
    this.readyBtn.addEventListener('click', () => this.handleReady());
    this.newGameBtn.addEventListener('click', () => this.resetGame());

    this.render();
    this.setStatus(`Place your ships (${SHIP_SIZES.join(', ')})`, 'info');
    this.updateRoster();
  }

  setSendCallback(cb: (frame: Uint8Array) => void): void {
    this.onSendFrame = cb;
  }

  /** Handle incoming game message from opponent. */
  handleMessage(msg: GameMessage): void {
    switch (msg.subtype) {
      case GameSubtype.SETUP:
        receiveSetup(this.state, msg.hash);
        if (this.state.phase === 'my-turn') {
          this.setStatus('Your turn — click target grid to fire', 'info');
        } else if (this.state.phase === 'their-turn') {
          this.setStatus('Waiting for opponent to fire...', 'info');
        }
        break;

      case GameSubtype.SHOT: {
        const result = receiveShot(this.state, msg.x, msg.y);
        this.lastShot = { x: msg.x, y: msg.y, grid: 'my' };
        const resultFrame = encodeGameFrame({
          subtype: GameSubtype.RESULT,
          x: msg.x,
          y: msg.y,
          result,
        });
        this.onSendFrame?.(resultFrame);

        if (this.state.phase === 'finished') {
          this.setStatus('You lost — all ships sunk!', 'lose');
        } else {
          switchTurn(this.state);
          if (this.state.phase === 'my-turn') {
            this.setStatus('Your turn — click target grid to fire', 'info');
          }
        }
        this.render();
        this.updateRoster();
        break;
      }

      case GameSubtype.RESULT: {
        recordResult(this.state, msg.x, msg.y, msg.result);
        this.lastShot = { x: msg.x, y: msg.y, grid: 'target' };

        if (checkWin(this.state)) {
          declareWin(this.state);
          const winFrame = encodeGameFrame({ subtype: GameSubtype.WIN });
          this.onSendFrame?.(winFrame);
          this.setStatus('You win!', 'win');
        } else {
          const statusType: StatusType = msg.result === ShotResult.Miss ? 'miss'
            : msg.result === ShotResult.Sunk ? 'sunk' : 'hit';
          const statusText = msg.result === ShotResult.Miss ? 'Miss! Waiting for opponent...'
            : msg.result === ShotResult.Sunk ? 'Sunk! Waiting for opponent...'
            : 'Hit! Waiting for opponent...';
          switchTurn(this.state);
          this.setStatus(statusText, statusType);
        }
        this.render();
        this.updateRoster();
        break;
      }

      case GameSubtype.WIN:
        this.state.phase = 'finished';
        this.state.winner = 'them';
        this.setStatus('You lost — opponent wins!', 'lose');
        this.render();
        this.updateRoster();
        break;
    }
  }

  private onMyGridClick(e: MouseEvent): void {
    if (this.state.phase !== 'placing') return;

    const cell = this.getCellFromEvent(e, this.myCanvas);
    if (!cell) return;

    const ship = placeShip(this.state, cell.x, cell.y);
    if (!ship) {
      this.setStatus('Invalid placement — try again', 'miss');
      return;
    }

    const remaining = SHIP_SIZES.length - this.state.currentShipIndex;
    if (remaining > 0) {
      this.setStatus(`Ship placed! ${remaining} left (size ${SHIP_SIZES[this.state.currentShipIndex]})`, 'info');
    } else {
      this.setStatus('All ships placed — click Ready!', 'hit');
    }
    this.render();
    this.updateRoster();
  }

  private onTargetGridClick(e: MouseEvent): void {
    if (this.state.phase !== 'my-turn') return;

    const cell = this.getCellFromEvent(e, this.targetCanvas);
    if (!cell) return;

    const idx = cell.y * GRID_SIZE + cell.x;
    if (this.state.targetGrid[idx] !== 'empty') return;

    const frame = encodeGameFrame({
      subtype: GameSubtype.SHOT,
      x: cell.x,
      y: cell.y,
    });
    this.onSendFrame?.(frame);
    this.setStatus('Shot fired — waiting for result...', 'info');
  }

  private onMyGridHover(e: MouseEvent): void {
    if (this.state.phase !== 'placing') {
      this.hoverCell = null;
      return;
    }
    const cell = this.getCellFromEvent(e, this.myCanvas);
    this.hoverCell = cell;
    this.render();
  }

  private onTargetGridHover(e: MouseEvent): void {
    if (this.state.phase !== 'my-turn') {
      this.targetHoverCell = null;
      return;
    }
    const cell = this.getCellFromEvent(e, this.targetCanvas);
    if (cell) {
      const idx = cell.y * GRID_SIZE + cell.x;
      if (this.state.targetGrid[idx] !== 'empty') {
        this.targetHoverCell = null;
      } else {
        this.targetHoverCell = cell;
      }
    } else {
      this.targetHoverCell = null;
    }
    this.render();
  }

  private handleReady(): void {
    if (!allShipsPlaced(this.state)) {
      this.setStatus('Place all ships first!', 'miss');
      return;
    }
    if (this.state.phase !== 'placing') return;

    const hash = confirmReady(this.state);
    const frame = encodeGameFrame({
      subtype: GameSubtype.SETUP,
      hash,
    });
    this.onSendFrame?.(frame);
    this.setStatus('Setup sent — waiting for opponent...', 'info');
    this.render();
  }

  private resetGame(): void {
    this.state = createGameState();
    this.hoverCell = null;
    this.targetHoverCell = null;
    this.lastShot = null;
    this.render();
    this.setStatus(`Place your ships (${SHIP_SIZES.join(', ')})`, 'info');
    this.updateRoster();
  }

  private getCellFromEvent(
    e: MouseEvent,
    canvas: HTMLCanvasElement,
  ): { x: number; y: number } | null {
    const rect = canvas.getBoundingClientRect();
    const scaleX = GRID_PX / rect.width;
    const scaleY = GRID_PX / rect.height;
    const px = (e.clientX - rect.left) * scaleX;
    const py = (e.clientY - rect.top) * scaleY;
    const x = Math.floor(px / CELL_PX);
    const y = Math.floor(py / CELL_PX);
    if (x < 0 || x >= GRID_SIZE || y < 0 || y >= GRID_SIZE) return null;
    return { x, y };
  }

  private setStatus(text: string, type: StatusType = 'info'): void {
    this.statusEl.textContent = text;
    this.statusEl.className = `game-status game-status-${type}`;
  }

  private updateRoster(): void {
    const shipNames = ['Cruiser (3)', 'Destroyer (2)', 'Submarine (2)'];
    let html = '';

    for (let i = 0; i < SHIP_SIZES.length; i++) {
      const size = SHIP_SIZES[i];
      const ship = this.state.ships[i];
      const placed = i < this.state.currentShipIndex;

      html += '<div class="roster-ship">';
      html += `<span class="roster-name">${shipNames[i]}</span>`;
      html += '<span class="roster-cells">';

      for (let c = 0; c < size; c++) {
        let cls = 'roster-cell';
        if (!placed) {
          cls += ' roster-cell-pending';
        } else if (ship && ship.hits[c]) {
          cls += ' roster-cell-hit';
        } else if (this.state.phase === 'finished' && this.state.winner === 'them') {
          cls += ' roster-cell-sunk';
        } else {
          cls += ' roster-cell-ok';
        }
        html += `<span class="${cls}"></span>`;
      }

      html += '</span>';

      if (ship && ship.hits.every(h => h)) {
        html += '<span class="roster-tag roster-tag-sunk">SUNK</span>';
      } else if (placed) {
        html += '<span class="roster-tag roster-tag-ok">OK</span>';
      }

      html += '</div>';
    }

    this.rosterEl.innerHTML = html;
  }

  private render(): void {
    this.renderGrid(this.myCtx, this.state.myGrid, true);
    this.renderGrid(this.targetCtx, this.state.targetGrid, false);
  }

  private renderGrid(
    ctx: CanvasRenderingContext2D,
    grid: CellState[],
    showShips: boolean,
  ): void {
    const isMyGrid = showShips;
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, GRID_PX, GRID_PX);

    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const cell = grid[y * GRID_SIZE + x];
        const px = x * CELL_PX;
        const py = y * CELL_PX;

        // Cell background
        if (cell === 'ship' && showShips) {
          ctx.fillStyle = '#00aa55';
          ctx.fillRect(px + 1, py + 1, CELL_PX - 2, CELL_PX - 2);
        } else if (cell === 'hit') {
          ctx.fillStyle = '#ff0044';
          ctx.fillRect(px + 1, py + 1, CELL_PX - 2, CELL_PX - 2);
          // X mark
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(px + 6, py + 6);
          ctx.lineTo(px + CELL_PX - 6, py + CELL_PX - 6);
          ctx.moveTo(px + CELL_PX - 6, py + 6);
          ctx.lineTo(px + 6, py + CELL_PX - 6);
          ctx.stroke();
        } else if (cell === 'miss') {
          ctx.fillStyle = '#1a1a30';
          ctx.fillRect(px + 1, py + 1, CELL_PX - 2, CELL_PX - 2);
          // Dot
          ctx.fillStyle = '#444466';
          ctx.beginPath();
          ctx.arc(px + CELL_PX / 2, py + CELL_PX / 2, 4, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = '#12122a';
          ctx.fillRect(px + 1, py + 1, CELL_PX - 2, CELL_PX - 2);
        }

        // Grid lines
        ctx.strokeStyle = '#222244';
        ctx.lineWidth = 1;
        ctx.strokeRect(px, py, CELL_PX, CELL_PX);
      }
    }

    // Ship placement ghost
    if (isMyGrid && this.state.phase === 'placing' && this.hoverCell) {
      const shipIdx = this.state.currentShipIndex;
      if (shipIdx < SHIP_SIZES.length) {
        const size = SHIP_SIZES[shipIdx];
        const valid = canPlaceShip(
          this.state.myGrid,
          this.hoverCell.x,
          this.hoverCell.y,
          size,
          this.state.horizontal,
        );

        ctx.fillStyle = valid ? 'rgba(0, 255, 136, 0.3)' : 'rgba(255, 0, 68, 0.3)';
        for (let i = 0; i < size; i++) {
          const gx = this.state.horizontal ? this.hoverCell.x + i : this.hoverCell.x;
          const gy = this.state.horizontal ? this.hoverCell.y : this.hoverCell.y + i;
          if (gx >= 0 && gx < GRID_SIZE && gy >= 0 && gy < GRID_SIZE) {
            ctx.fillRect(gx * CELL_PX + 1, gy * CELL_PX + 1, CELL_PX - 2, CELL_PX - 2);
          }
        }
      }
    }

    // Target grid hover
    if (!isMyGrid && this.targetHoverCell) {
      ctx.fillStyle = 'rgba(0, 255, 136, 0.2)';
      ctx.fillRect(
        this.targetHoverCell.x * CELL_PX + 1,
        this.targetHoverCell.y * CELL_PX + 1,
        CELL_PX - 2,
        CELL_PX - 2,
      );
    }

    // Last shot highlight
    if (this.lastShot) {
      const onThisGrid = (isMyGrid && this.lastShot.grid === 'my') ||
                          (!isMyGrid && this.lastShot.grid === 'target');
      if (onThisGrid) {
        const lx = this.lastShot.x * CELL_PX;
        const ly = this.lastShot.y * CELL_PX;
        ctx.strokeStyle = '#ffaa00';
        ctx.lineWidth = 2;
        ctx.strokeRect(lx + 2, ly + 2, CELL_PX - 4, CELL_PX - 4);
      }
    }
  }
}
