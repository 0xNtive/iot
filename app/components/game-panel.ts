/**
 * Battleship game panel — two 8x8 grids with ship placement and combat UI.
 */

import {
  createGameState,
  placeShip,
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

export class GamePanel {
  private myCanvas: HTMLCanvasElement;
  private targetCanvas: HTMLCanvasElement;
  private myCtx: CanvasRenderingContext2D;
  private targetCtx: CanvasRenderingContext2D;
  private statusEl: HTMLElement;
  private rotateBtn: HTMLButtonElement;
  private readyBtn: HTMLButtonElement;
  private newGameBtn: HTMLButtonElement;
  private state: GameState;
  private onSendFrame: ((frame: Uint8Array) => void) | null = null;
  private pendingShotResolve: (() => void) | null = null;

  constructor() {
    this.myCanvas = document.getElementById('game-my-grid') as HTMLCanvasElement;
    this.targetCanvas = document.getElementById('game-target-grid') as HTMLCanvasElement;
    this.myCtx = this.myCanvas.getContext('2d')!;
    this.targetCtx = this.targetCanvas.getContext('2d')!;
    this.statusEl = document.getElementById('game-status')!;
    this.rotateBtn = document.getElementById('game-rotate') as HTMLButtonElement;
    this.readyBtn = document.getElementById('game-ready') as HTMLButtonElement;
    this.newGameBtn = document.getElementById('game-new') as HTMLButtonElement;

    this.state = createGameState();

    this.myCanvas.addEventListener('click', (e) => this.onMyGridClick(e));
    this.targetCanvas.addEventListener('click', (e) => this.onTargetGridClick(e));
    this.rotateBtn.addEventListener('click', () => {
      toggleOrientation(this.state);
      this.setStatus(`Orientation: ${this.state.horizontal ? 'horizontal' : 'vertical'}`);
    });
    this.readyBtn.addEventListener('click', () => this.handleReady());
    this.newGameBtn.addEventListener('click', () => this.resetGame());

    this.render();
    this.setStatus(`Place your ships (${SHIP_SIZES.join(', ')})`);
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
          this.setStatus('Your turn — click target grid to fire');
        } else if (this.state.phase === 'their-turn') {
          this.setStatus('Waiting for opponent to fire...');
        }
        break;

      case GameSubtype.SHOT: {
        const result = receiveShot(this.state, msg.x, msg.y);
        // Send result back
        const resultFrame = encodeGameFrame({
          subtype: GameSubtype.RESULT,
          x: msg.x,
          y: msg.y,
          result,
        });
        this.onSendFrame?.(resultFrame);

        if (this.state.phase === 'finished') {
          this.setStatus('You lost — all ships sunk!');
        } else {
          switchTurn(this.state);
          if (this.state.phase === 'my-turn') {
            this.setStatus('Your turn — click target grid to fire');
          }
        }
        this.render();
        break;
      }

      case GameSubtype.RESULT: {
        recordResult(this.state, msg.x, msg.y, msg.result);

        let statusText = msg.result === ShotResult.Miss ? 'Miss!'
          : msg.result === ShotResult.Sunk ? 'Sunk!'
          : 'Hit!';

        if (checkWin(this.state)) {
          declareWin(this.state);
          const winFrame = encodeGameFrame({ subtype: GameSubtype.WIN });
          this.onSendFrame?.(winFrame);
          this.setStatus('You win!');
        } else {
          switchTurn(this.state);
          statusText += ' Waiting for opponent...';
          this.setStatus(statusText);
        }
        this.render();
        break;
      }

      case GameSubtype.WIN:
        this.state.phase = 'finished';
        this.state.winner = 'them';
        this.setStatus('You lost — opponent wins!');
        this.render();
        break;
    }
  }

  private onMyGridClick(e: MouseEvent): void {
    if (this.state.phase !== 'placing') return;

    const cell = this.getCellFromEvent(e, this.myCanvas);
    if (!cell) return;

    const ship = placeShip(this.state, cell.x, cell.y);
    if (!ship) {
      this.setStatus('Invalid placement — try again');
      return;
    }

    const remaining = SHIP_SIZES.length - this.state.currentShipIndex;
    if (remaining > 0) {
      this.setStatus(`Ship placed! ${remaining} left (size ${SHIP_SIZES[this.state.currentShipIndex]})`);
    } else {
      this.setStatus('All ships placed — click Ready!');
    }
    this.render();
  }

  private onTargetGridClick(e: MouseEvent): void {
    if (this.state.phase !== 'my-turn') return;

    const cell = this.getCellFromEvent(e, this.targetCanvas);
    if (!cell) return;

    const idx = cell.y * GRID_SIZE + cell.x;
    if (this.state.targetGrid[idx] !== 'empty') return; // already fired here

    // Send shot
    const frame = encodeGameFrame({
      subtype: GameSubtype.SHOT,
      x: cell.x,
      y: cell.y,
    });
    this.onSendFrame?.(frame);
    this.setStatus('Shot fired — waiting for result...');
  }

  private handleReady(): void {
    if (!allShipsPlaced(this.state)) {
      this.setStatus('Place all ships first!');
      return;
    }
    if (this.state.phase !== 'placing') return;

    const hash = confirmReady(this.state);
    const frame = encodeGameFrame({
      subtype: GameSubtype.SETUP,
      hash,
    });
    this.onSendFrame?.(frame);
    this.setStatus('Setup sent — waiting for opponent...');
    this.render();
  }

  private resetGame(): void {
    this.state = createGameState();
    this.render();
    this.setStatus(`Place your ships (${SHIP_SIZES.join(', ')})`);
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

  private setStatus(text: string): void {
    this.statusEl.textContent = text;
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
  }
}
