import type { Board, Grid, Side } from './types.js';
import * as terratri from './terratri.js';

export class Game {
  readonly steps: string;

  // Derived state (computed in constructor)
  readonly grid: Grid;
  readonly board: Board;
  readonly whoseTurn: Side | '';
  readonly winner: Side | null;
  readonly redBanked: number;
  readonly blueBanked: number;
  readonly redSupply: number;
  readonly blueSupply: number;
  readonly validSteps: Record<string, string>;
  readonly history: string[];

  constructor(steps = '') {
    this.steps = steps;
    this.grid = terratri.after(steps);
    this.board = terratri.gridToBoard(this.grid);
    this.winner = terratri.winner(this.grid);
    this.whoseTurn = this.winner ? '' : terratri.whoseTurn(steps);
    this.redBanked = terratri.bankedMoves('r', steps);
    this.blueBanked = terratri.bankedMoves('b', steps);
    this.redSupply = terratri.fortSupply('r', this.grid, steps);
    this.blueSupply = terratri.fortSupply('b', this.grid, steps);
    this.validSteps = this.whoseTurn
      ? terratri.validSteps(this.whoseTurn, this.grid, steps)
      : {};
    this.history = terratri.niceHistory(steps);
  }

  applyStep(step: string): Game {
    let newSteps = this.steps + step;
    if (terratri.isTurnOver(newSteps)) {
      newSteps += '|';
    }
    return new Game(newSteps);
  }

  /** State after the first n atomic steps (characters, skipping '|' delimiters). */
  static atStep(fullSteps: string, n: number): Game {
    let count = 0;
    let end = 0;
    for (let i = 0; i < fullSteps.length && count < n; i++) {
      if (fullSteps[i] !== '|') count++;
      end = i + 1;
    }
    // Include any trailing '|' delimiter
    while (end < fullSteps.length && fullSteps[end] === '|') end++;
    return new Game(fullSteps.slice(0, end));
  }
}
