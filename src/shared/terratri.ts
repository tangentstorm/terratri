/**
 * The rules of Terratri
 * =====================
 *
 * Step notation
 * -------------
 * History is a string of steps separated by '|' turn delimiters.
 *   lowercase = red, uppercase = blue
 *   n/N = north, s/S = south, e/E = east, w/W = west
 *   f/F = fort, x/X = pass/end turn, k/K = bank
 *
 * Board notation
 * --------------
 * 5x5 grid as a 25-character string (Board) or array-of-arrays (Grid).
 *   ' ' = unclaimed
 *   '.' = red territory, 'r' = red pawn, 'R' = red fort, 'E' = red fort+pawn
 *   '_' = blue territory, 'b' = blue pawn, 'B' = blue fort, 'L' = blue fort+pawn
 */

import type { Board, Grid, Side, Dir } from './types.js';

export const START_BOARD: Board =
  '  b  ' +
  '     ' +
  '     ' +
  '     ' +
  '  r  ';

export function boardToGrid(board: Board): Grid {
  const rows: Grid = [];
  for (let i = 0; i < 5; i++) {
    rows.push(board.slice(i * 5, i * 5 + 5).split(''));
  }
  return rows;
}

export function gridToBoard(grid: Grid): Board {
  return grid.map(row => row.join('')).join('');
}

export function startGrid(): Grid {
  return boardToGrid(START_BOARD);
}

export function whoseTurn(steps: string): Side {
  const completedTurns = (steps.match(/\|/g) || []).length;
  return completedTurns % 2 === 0 ? 'r' : 'b';
}

export function findPawn(pawn: Side, grid: Grid): { x: number; y: number; hasFort: boolean } | undefined {
  const fortPawn = pawn === 'r' ? 'E' : 'L';
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 5; x++) {
      if (grid[y][x] === pawn || grid[y][x] === fortPawn) {
        return { x, y, hasFort: grid[y][x] === fortPawn };
      }
    }
  }
  return undefined;
}

function relative(dir: Dir, x: number, y: number): [number, number] {
  if (dir === 'n') return [x, y - 1];
  if (dir === 's') return [x, y + 1];
  if (dir === 'e') return [x + 1, y];
  if (dir === 'w') return [x - 1, y];
  throw new Error(`relative() expected [nsew], got '${dir}'`);
}

function pawnAndFort(pawn: Side): string {
  return pawn === 'r' ? 'E' : 'L';
}

/** Edits grid in place */
export function move(pawn: Side, dir: Dir, grid: Grid): void {
  const found = findPawn(pawn, grid)!;
  const [x2, y2] = relative(dir, found.x, found.y);

  // move pawn to the new square
  if (grid[y2][x2] === pawn.toUpperCase()) {
    grid[y2][x2] = pawnAndFort(pawn);
  } else {
    grid[y2][x2] = pawn;
  }

  // repaint the old square
  if (found.hasFort) {
    grid[found.y][found.x] = pawn.toUpperCase();
  } else {
    grid[found.y][found.x] = pawn === 'r' ? '.' : '_';
  }
}

/** Edits grid in place */
export function fortify(pawn: Side, grid: Grid): void {
  const found = findPawn(pawn, grid)!;
  if (found.hasFort) throw new Error(`already a fort at (${found.x},${found.y})`);
  grid[found.y][found.x] = pawnAndFort(pawn);
}

/** Replay a step string to produce the resulting grid */
export function after(steps: string): Grid {
  const grid = startGrid();
  for (const s of steps) {
    switch (s) {
      case 'n': move('r', 'n', grid); break;
      case 's': move('r', 's', grid); break;
      case 'e': move('r', 'e', grid); break;
      case 'w': move('r', 'w', grid); break;
      case 'f': fortify('r', grid); break;
      case 'x': break;
      case 'N': move('b', 'n', grid); break;
      case 'S': move('b', 's', grid); break;
      case 'E': move('b', 'e', grid); break;
      case 'W': move('b', 'w', grid); break;
      case 'F': fortify('b', grid); break;
      case 'X': break;
      case '|': break;
      case 'k': break;
      case 'K': break;
    }
  }
  return grid;
}

function inBounds(x: number, y: number): boolean {
  return x >= 0 && x < 5 && y >= 0 && y < 5;
}

function enemiesOf(side: Side): string[] {
  return side === 'r' ? ['b', 'B', 'L'] : ['r', 'R', 'E'];
}

const kRows = 'abcde';
const kCols = '54321';

/** (x, y) -> square name, e.g. (2,4) -> 'c1' */
function sq(x: number, y: number): string {
  return kRows[x] + kCols[y];
}

function squareCount(side: Side, grid: Grid): number {
  let count = 0;
  const want = side === 'r' ? '.' : '_';
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 5; x++) {
      if (grid[y][x] === want) count++;
    }
  }
  return count;
}

function opposite(dir: string): string | null {
  if (dir === 'n') return 's';
  if (dir === 's') return 'n';
  if (dir === 'e') return 'w';
  if (dir === 'w') return 'e';
  return null;
}

export function countFortsOnBoard(side: Side, grid: Grid): number {
  let count = 0;
  const fort = side === 'r' ? 'R' : 'B';
  const fortPawn = side === 'r' ? 'E' : 'L';
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 5; x++) {
      if (grid[y][x] === fort || grid[y][x] === fortPawn) count++;
    }
  }
  return count;
}

/** Count bonus actions consumed (forts permanently spent) by a side. */
export function spentMoves(side: Side, steps: string): number {
  let spent = 0;
  const turns = steps.split('|');
  for (let turnIdx = 0; turnIdx < turns.length; turnIdx++) {
    const turn = turns[turnIdx];
    if (turn.length === 0) continue;
    const turnSide: Side = turnIdx % 2 === 0 ? 'r' : 'b';
    if (turnSide !== side) continue;
    for (let i = 2; i < turn.length; i++) {
      const ch = turn[i];
      if (ch !== 'x' && ch !== 'X') spent++;
    }
  }
  return spent;
}

/** Derive banked-move count for a side from the step history. */
export function bankedMoves(side: Side, steps: string): number {
  let bank = side === 'b' ? 1 : 0;
  const turns = steps.split('|');

  for (let turnIdx = 0; turnIdx < turns.length; turnIdx++) {
    const turn = turns[turnIdx];
    if (turn.length === 0) continue;

    const turnSide: Side = turnIdx % 2 === 0 ? 'r' : 'b';
    if (turnSide !== side) continue;

    for (let i = 0; i < turn.length; i++) {
      const ch = turn[i];
      if (ch === 'k' || ch === 'K') bank++;
      else if (i >= 2 && ch !== 'x' && ch !== 'X') bank--; // spending
    }
  }

  return bank;
}

export function fortSupply(side: Side, grid: Grid, steps: string): number {
  return 5 - countFortsOnBoard(side, grid) - bankedMoves(side, steps) - spentMoves(side, steps);
}

/** Is the current turn segment complete? */
export function isTurnOver(steps: string): boolean {
  const lastPipe = steps.lastIndexOf('|');
  const segment = lastPipe === -1 ? steps : steps.slice(lastPipe + 1);

  if (segment.length < 2) return false;

  const lastChar = segment.slice(-1);
  if ('xXkK'.includes(lastChar)) return true;

  // Turn is also over if player has no bank remaining
  const turnIndex = (steps.match(/\|/g) || []).length;
  const side: Side = turnIndex % 2 === 0 ? 'r' : 'b';

  return bankedMoves(side, steps) <= 0;
}

export function validSteps(side: Side, grid: Grid, steps: string): Record<string, string> {
  const res: [string, string][] = [];
  const fixCase = side === 'r' ? (s: string) => s.toLowerCase() : (s: string) => s.toUpperCase();

  // Current turn segment
  const lastPipe = steps.lastIndexOf('|');
  const segment = lastPipe === -1 ? steps : steps.slice(lastPipe + 1);
  const stepIndex = segment.length;

  // Pass / end-turn / bank options
  if (stepIndex === 1) {
    // Second step: pass is always available
    res.push([fixCase('x'), 'end']);

    // Bank if supply > 0
    const supply = fortSupply(side, grid, steps);
    if (supply > 0) {
      res.push([fixCase('k'), 'bank']);
    }
  } else if (stepIndex >= 2) {
    // End turn (free) — blocked if board unchanged from turn start
    const turnStartSteps = lastPipe === -1 ? '' : steps.slice(0, lastPipe + 1);
    const turnStartBoard = gridToBoard(after(turnStartSteps));
    if (gridToBoard(grid) !== turnStartBoard) {
      res.push([fixCase('x'), 'end']);
    }
  }

  // Direction moves
  const enemies = enemiesOf(side);
  const found = findPawn(side, grid)!;
  const { x, y, hasFort } = found;

  for (const step of ['n', 's', 'e', 'w'] as Dir[]) {
    const [x2, y2] = relative(step, x, y);

    // Anti-reversal: block opposite-direction if it undoes the previous step
    if (stepIndex >= 1) {
      const lastStepInSegment = segment.slice(-1);
      if (step === opposite(lastStepInSegment.toLowerCase())) {
        const beforeLast = after(steps.slice(0, -1));
        const afterThis = after(steps + fixCase(step));
        if (gridToBoard(beforeLast) === gridToBoard(afterThis)) {
          continue;
        }
      }
    }

    if (inBounds(x2, y2) && !enemies.includes(grid[y2][x2])) {
      res.push([fixCase(step), sq(x2, y2)]);
    }
  }

  // Fortify: requires supply > 0 (forts only come from supply, never bank)
  if (!hasFort && squareCount(side, grid) >= 5 && fortSupply(side, grid, steps) > 0) {
    res.push([fixCase('f'), sq(x, y)]);
  }

  return Object.fromEntries(res);
}

export function winner(grid: Grid): Side | null {
  let rCount = 0;
  let bCount = 0;
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 5; x++) {
      if (grid[y][x] === 'R' || grid[y][x] === 'E') rCount++;
      if (grid[y][x] === 'B' || grid[y][x] === 'L') bCount++;
    }
  }
  if (rCount === 5) return 'r';
  if (bCount === 5) return 'b';
  return null;
}

export function niceHistory(steps: string): string[] {
  const turns = steps.split('|').filter(s => s.length > 0);
  const result: string[] = [];
  for (let i = 0; i < turns.length; i += 2) {
    const red = turns[i] || '';
    const blue = turns[i + 1] || '';
    result.push((red + ' ' + blue).trim());
  }
  return result;
}
