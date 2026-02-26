#!/usr/bin/env npx tsx
/**
 * Stateless CLI for Terratri self-play.
 *
 * Usage:
 *   npx tsx src/mcp/play-cli.ts new
 *   npx tsx src/mcp/play-cli.ts show <steps>
 *   npx tsx src/mcp/play-cli.ts move <steps> <chars>
 *
 * Each call is independent — the steps string IS the state.
 * Output includes everything an agent needs to pick the next move.
 */

import { Game } from '../shared/Game.js';

// ---------------------------------------------------------------------------
// Territory counting (not exported from terratri.ts, so replicate here)
// ---------------------------------------------------------------------------

function countTerritory(grid: string[][]): { red: number; blue: number } {
  let red = 0, blue = 0;
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 5; x++) {
      const c = grid[y][x];
      if (c === '.') red++;
      if (c === '_') blue++;
    }
  }
  return { red, blue };
}

// ---------------------------------------------------------------------------
// ASCII board rendering
// ---------------------------------------------------------------------------

function renderBoard(grid: string[][]): string {
  const lines: string[] = [];
  lines.push('    a   b   c   d   e');
  lines.push('  +---+---+---+---+---+');
  for (let y = 0; y < 5; y++) {
    const rowLabel = 5 - y;
    const cells = grid[y].map(c => ` ${c === ' ' ? ' ' : c} `).join('|');
    lines.push(`${rowLabel} |${cells}|`);
    lines.push('  +---+---+---+---+---+');
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Full output
// ---------------------------------------------------------------------------

function render(game: Game): string {
  const lines: string[] = [];

  lines.push(renderBoard(game.grid));
  lines.push('');

  if (game.winner) {
    lines.push(`GAME OVER: ${game.winner === 'r' ? 'RED' : 'BLUE'} WINS!`);
  } else {
    lines.push(`Turn: ${game.whoseTurn === 'r' ? 'Red' : 'Blue'}`);
  }

  const terr = countTerritory(game.grid);
  lines.push(`Territory: Red=${terr.red} Blue=${terr.blue}`);
  lines.push(`Banked: Red=${game.redBanked} Blue=${game.blueBanked}`);
  lines.push(`Fort supply: Red=${game.redSupply} Blue=${game.blueSupply}`);

  if (game.whoseTurn) {
    const moves = Object.entries(game.validSteps);
    if (moves.length > 0) {
      lines.push(`Valid moves: ${moves.map(([s, t]) => `${s}(${t})`).join(', ')}`);
    }
  }

  if (game.history.length > 0) {
    lines.push(`History: ${game.history.join(' | ')}`);
  }

  lines.push(`Steps: ${game.steps || '(empty)'}`);

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const [cmd, ...args] = process.argv.slice(2);

if (!cmd || cmd === 'new') {
  console.log(render(new Game()));
} else if (cmd === 'show') {
  const steps = args[0] || '';
  console.log(render(new Game(steps)));
} else if (cmd === 'move') {
  const steps = args[0] || '';
  const chars = args[1] || '';

  let game = new Game(steps);

  for (const ch of chars.toLowerCase()) {
    if (!game.whoseTurn) {
      console.log('Game is already over.');
      console.log(render(game));
      process.exit(1);
    }

    const mapped = game.whoseTurn === 'b' ? ch.toUpperCase() : ch;

    if (!(mapped in game.validSteps)) {
      const valid = Object.entries(game.validSteps)
        .map(([s, t]) => `${s}(${t})`)
        .join(', ');
      console.error(`Invalid step '${ch}'. Valid: ${valid}`);
      console.log(render(game));
      process.exit(1);
    }

    game = game.applyStep(mapped);
  }

  console.log(render(game));
} else {
  console.error(`Unknown command '${cmd}'. Usage: play-cli.ts [new|show|move] ...`);
  process.exit(1);
}
