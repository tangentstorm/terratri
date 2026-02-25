/**
 * Terratri MCP Server — play Terratri in the CLI via Claude Code.
 *
 * Hot-reloads game logic: esbuild bundles Game.ts + terratri.ts into a
 * data: URL on demand, bypassing ESM module caching entirely.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import * as esbuild from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../..');

// ---------------------------------------------------------------------------
// Types for the dynamically-loaded Game class
// ---------------------------------------------------------------------------

interface GameInstance {
  readonly steps: string;
  readonly grid: string[][];
  readonly board: string;
  readonly whoseTurn: 'r' | 'b' | '';
  readonly winner: 'r' | 'b' | null;
  readonly redBanked: number;
  readonly blueBanked: number;
  readonly redSupply: number;
  readonly blueSupply: number;
  readonly validSteps: Record<string, string>;
  readonly history: string[];
  applyStep(step: string): GameInstance;
}

interface GameConstructor {
  new (steps?: string): GameInstance;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let Game: GameConstructor;
let steps = '';
let playingAs: 'r' | 'b' = 'r';

// ---------------------------------------------------------------------------
// Hot-reload via esbuild + data: URL
// ---------------------------------------------------------------------------

async function bundleGame(): Promise<GameConstructor> {
  const entryPoint = path.join(PROJECT_ROOT, 'src/shared/Game.ts');
  const result = await esbuild.build({
    entryPoints: [entryPoint],
    bundle: true,
    format: 'esm',
    write: false,
    platform: 'neutral',
  });
  // Append unique timestamp so the data: URL is never cached
  const code = result.outputFiles[0].text + `\n// bundled ${Date.now()}`;
  const url = 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
  const mod = await import(url);
  return mod.Game;
}

function getGame(): GameInstance {
  return new Game(steps);
}

// ---------------------------------------------------------------------------
// ASCII board rendering
// ---------------------------------------------------------------------------

function renderBoard(game: GameInstance): string {
  const grid = game.grid;
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

function renderStatus(game: GameInstance): string {
  const lines: string[] = [];

  if (game.winner) {
    lines.push(`*** ${game.winner === 'r' ? 'RED' : 'BLUE'} WINS! ***`);
  } else {
    const turn = game.whoseTurn === 'r' ? 'Red' : 'Blue';
    const isHuman = game.whoseTurn === playingAs;
    lines.push(`Turn: ${turn}${isHuman ? ' (Human)' : ' (Claude)'}`);
  }

  lines.push(`Banked: R=${game.redBanked} B=${game.blueBanked} | Fort supply: R=${game.redSupply} B=${game.blueSupply}`);

  if (game.whoseTurn) {
    const moves = Object.entries(game.validSteps);
    if (moves.length > 0) {
      lines.push(`Valid: ${moves.map(([s, t]) => `${s}→${t}`).join(', ')}`);
    }
  }

  if (game.history.length > 0) {
    lines.push(`History: ${game.history.join(' | ')}`);
  }

  return lines.join('\n');
}

function fullRender(): string {
  const game = getGame();
  return renderBoard(game) + '\n\n' + renderStatus(game);
}

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'terratri',
  version: '1.0.0',
});

server.tool(
  'new_game',
  'Start a new Terratri game. Red moves first.',
  { side: z.enum(['red', 'blue']).describe('Which side the human plays') },
  async ({ side }) => {
    steps = '';
    playingAs = side === 'red' ? 'r' : 'b';
    return { content: [{ type: 'text', text: fullRender() }] };
  },
);

server.tool(
  'board',
  'Show the current board and game status',
  {},
  async () => {
    return { content: [{ type: 'text', text: fullRender() }] };
  },
);

server.tool(
  'move',
  'Make one or more moves (auto-cased for current player). Steps: n/s/e/w=direction, f=fortify, x=pass/end, k=bank. Examples: "ne", "fx", "nk"',
  { step: z.string().describe('Step character(s), e.g. "n", "sw", "fx"') },
  async ({ step }) => {
    let game = getGame();

    if (!game.whoseTurn) {
      return { content: [{ type: 'text', text: 'Game is over!\n\n' + fullRender() }] };
    }

    for (const ch of step.toLowerCase()) {
      game = getGame(); // re-read: turn may have flipped
      if (!game.whoseTurn) break;

      const mapped = game.whoseTurn === 'b' ? ch.toUpperCase() : ch;

      if (!(mapped in game.validSteps)) {
        const valid = Object.entries(game.validSteps)
          .map(([s, t]) => `${s}→${t}`)
          .join(', ');
        return {
          content: [{
            type: 'text',
            text: `Invalid step '${ch}'. Valid: ${valid}\n\n${fullRender()}`,
          }],
        };
      }

      const newGame = game.applyStep(mapped);
      steps = newGame.steps;
    }

    return { content: [{ type: 'text', text: fullRender() }] };
  },
);

server.tool(
  'status',
  'Detailed game status: turn, valid moves, banks, forts, history',
  {},
  async () => {
    const game = getGame();
    return { content: [{ type: 'text', text: renderStatus(game) }] };
  },
);

server.tool(
  'reload',
  'Hot-reload game logic from disk. Use after editing terratri.ts or Game.ts.',
  {},
  async () => {
    try {
      Game = await bundleGame();
      const game = getGame(); // verify replay works
      return {
        content: [{
          type: 'text',
          text: `Reloaded! Game state preserved (${steps.replace(/\|/g, '').length} moves replayed).\n\n${fullRender()}`,
        }],
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: [{ type: 'text', text: `Reload failed: ${msg}` }] };
    }
  },
);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

Game = await bundleGame();
const transport = new StdioServerTransport();
await server.connect(transport);
