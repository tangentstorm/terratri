/**
 * The rules of Terratri
 * =====================
 *
 * Step notation
 * -------------
 * History is a string of 2 chars (steps) per move.
 *   lowercase = red, uppercase = blue
 *   n/N = north, s/S = south, e/E = east, w/W = west
 *   f/F = fort, x/X = pass (second step only)
 *
 * Board notation
 * --------------
 * 5x5 grid as a 25-character string (Board) or array-of-arrays (Grid).
 *   ' ' = unclaimed
 *   '.' = red territory, 'r' = red pawn, 'R' = red fort, 'E' = red fort+pawn
 *   '_' = blue territory, 'b' = blue pawn, 'B' = blue fort, 'L' = blue fort+pawn
 */

import type { Board, Grid, Side, Dir } from '../shared/types.js';

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
  const turnCount = Math.floor(steps.length / 2);
  return turnCount % 2 === 0 ? 'r' : 'b';
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

export function validSteps(side: Side, grid: Grid, steps: string): Record<string, string> {
  const res: [string, string][] = [];
  const fixCase = side === 'r' ? (s: string) => s.toLowerCase() : (s: string) => s.toUpperCase();
  const lastStep = steps.slice(-1);

  const secondStep = side === 'r' ? lastStep === lastStep.toLowerCase() && lastStep !== '' && lastStep >= 'a'
    : lastStep === lastStep.toUpperCase() && lastStep !== '' && lastStep >= 'A';

  // More precise: second step means the last char belongs to the current side
  const isSecondStep = lastStep.length > 0 &&
    (side === 'r' ? lastStep >= 'a' && lastStep <= 'z' : lastStep >= 'A' && lastStep <= 'Z');

  if (isSecondStep) {
    res.push([fixCase('x'), 'end']);
  }

  const enemies = enemiesOf(side);
  const found = findPawn(side, grid)!;
  const { x, y, hasFort } = found;

  for (const step of ['n', 's', 'e', 'w'] as Dir[]) {
    const [x2, y2] = relative(step, x, y);

    // prevent 'pass' turns that leave you on the same square
    if (isSecondStep && step === opposite(lastStep.toLowerCase())) {
      const beforeLast = after(steps.slice(0, -1));
      const afterThis = after(steps + step);
      if (gridToBoard(beforeLast) === gridToBoard(afterThis)) {
        continue;
      }
    }

    if (inBounds(x2, y2) && !enemies.includes(grid[y2][x2])) {
      res.push([fixCase(step), sq(x2, y2)]);
    }
  }

  if (!hasFort && squareCount(side, grid) >= 5) {
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
  const moves: string[] = [];
  for (let i = 0; i < steps.length; i += 4) {
    const chunk = steps.slice(i, i + 4);
    if (chunk) moves.push(chunk);
  }
  return moves.map(m => {
    const first = m.slice(0, 2);
    const second = m.slice(2);
    return (first + ' ' + second).trim();
  });
}
