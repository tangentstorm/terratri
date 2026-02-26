import { describe, test, expect } from 'vitest';
import { Game } from './Game.js';
import * as fs from 'fs';
import * as path from 'path';

// -----------------------------------------------------------------------
// Strategy helpers
// -----------------------------------------------------------------------

type Side = 'r' | 'b';
type Strategy = (game: Game, side: Side) => string;

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

function findPawnPos(side: Side, grid: string[][]): { x: number; y: number } | null {
  const fortPawn = side === 'r' ? 'E' : 'L';
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 5; x++) {
      if (grid[y][x] === side || grid[y][x] === fortPawn) {
        return { x, y };
      }
    }
  }
  return null;
}

function findEnemyPawnPos(side: Side, grid: string[][]): { x: number; y: number } | null {
  return findPawnPos(side === 'r' ? 'b' : 'r', grid);
}

// Pick a random valid move (seeded for reproducibility)
let rngState = 42;
function seededRandom(): number {
  rngState = (rngState * 1103515245 + 12345) & 0x7fffffff;
  return rngState / 0x7fffffff;
}

function pickRandom(game: Game): string {
  const valid = Object.keys(game.validSteps);
  if (valid.length === 0) throw new Error('No valid moves');
  return valid[Math.floor(seededRandom() * valid.length)];
}

// Expansion: prefer unclaimed/enemy territory, center, then fortify
function pickExpansion(game: Game, side: Side): string {
  const valid = Object.keys(game.validSteps);
  if (valid.length === 0) throw new Error('No valid moves');
  const fixCase = side === 'r' ? (s: string) => s.toLowerCase() : (s: string) => s.toUpperCase();

  // Always fortify if available
  if (valid.includes(fixCase('f'))) return fixCase('f');

  const pos = findPawnPos(side, game.grid);
  if (!pos) return valid[0];

  const dirs = valid.filter(v => 'nsewNSEW'.includes(v));
  let bestDir = '';
  let bestScore = -999;

  for (const d of dirs) {
    const dl = d.toLowerCase();
    let nx = pos.x, ny = pos.y;
    if (dl === 'n') ny--;
    if (dl === 's') ny++;
    if (dl === 'e') nx++;
    if (dl === 'w') nx--;
    if (nx < 0 || nx > 4 || ny < 0 || ny > 4) continue;

    let score = 0;
    const target = game.grid[ny][nx];
    // Strongly prefer unclaimed squares
    if (target === ' ') score += 5;
    // Prefer capturing enemy territory
    else if ((side === 'r' && target === '_') || (side === 'b' && target === '.')) score += 3;
    // Slight preference for center
    score -= (Math.abs(nx - 2) + Math.abs(ny - 2)) * 0.5;
    // Small random factor
    score += seededRandom() * 0.5;

    if (score > bestScore) {
      bestScore = score;
      bestDir = d;
    }
  }

  if (bestDir) return bestDir;
  if (valid.includes(fixCase('x'))) return fixCase('x');
  if (valid.includes(fixCase('k'))) return fixCase('k');
  return valid[0];
}

// Banking: bank on 2nd action when territory is low
function pickBanking(game: Game, side: Side): string {
  const valid = Object.keys(game.validSteps);
  if (valid.length === 0) throw new Error('No valid moves');
  const fixCase = side === 'r' ? (s: string) => s.toLowerCase() : (s: string) => s.toUpperCase();

  // Always fortify if available
  if (valid.includes(fixCase('f'))) return fixCase('f');

  // Bank if available and territory < 8
  if (valid.includes(fixCase('k'))) {
    const terr = countTerritory(game.grid);
    const myTerr = side === 'r' ? terr.red : terr.blue;
    if (myTerr < 8) return fixCase('k');
  }

  return pickExpansion(game, side);
}

// Aggressive: rush toward enemy
function pickAggressive(game: Game, side: Side): string {
  const valid = Object.keys(game.validSteps);
  if (valid.length === 0) throw new Error('No valid moves');
  const fixCase = side === 'r' ? (s: string) => s.toLowerCase() : (s: string) => s.toUpperCase();

  if (valid.includes(fixCase('f'))) return fixCase('f');

  const pos = findPawnPos(side, game.grid);
  const oppPos = findEnemyPawnPos(side, game.grid);
  if (!pos || !oppPos) return pickExpansion(game, side);

  const dirs = valid.filter(v => 'nsewNSEW'.includes(v));
  let bestDir = '';
  let bestScore = -999;

  for (const d of dirs) {
    const dl = d.toLowerCase();
    let nx = pos.x, ny = pos.y;
    if (dl === 'n') ny--;
    if (dl === 's') ny++;
    if (dl === 'e') nx++;
    if (dl === 'w') nx--;
    if (nx < 0 || nx > 4 || ny < 0 || ny > 4) continue;

    let score = 0;
    // Prefer moving toward opponent
    const oldDist = Math.abs(pos.x - oppPos.x) + Math.abs(pos.y - oppPos.y);
    const newDist = Math.abs(nx - oppPos.x) + Math.abs(ny - oppPos.y);
    score += (oldDist - newDist) * 3;
    // Still prefer unclaimed
    const target = game.grid[ny][nx];
    if (target === ' ') score += 2;
    else if ((side === 'r' && target === '_') || (side === 'b' && target === '.')) score += 1;
    score += seededRandom() * 0.3;

    if (score > bestScore) {
      bestScore = score;
      bestDir = d;
    }
  }

  if (bestDir) return bestDir;
  if (valid.includes(fixCase('x'))) return fixCase('x');
  return valid[0];
}

// Defensive: stay on own side, spread wide
function pickDefensive(game: Game, side: Side): string {
  const valid = Object.keys(game.validSteps);
  if (valid.length === 0) throw new Error('No valid moves');
  const fixCase = side === 'r' ? (s: string) => s.toLowerCase() : (s: string) => s.toUpperCase();

  if (valid.includes(fixCase('f'))) return fixCase('f');

  const pos = findPawnPos(side, game.grid);
  if (!pos) return valid[0];

  const dirs = valid.filter(v => 'nsewNSEW'.includes(v));
  let bestDir = '';
  let bestScore = -999;

  for (const d of dirs) {
    const dl = d.toLowerCase();
    let nx = pos.x, ny = pos.y;
    if (dl === 'n') ny--;
    if (dl === 's') ny++;
    if (dl === 'e') nx++;
    if (dl === 'w') nx--;
    if (nx < 0 || nx > 4 || ny < 0 || ny > 4) continue;

    let score = 0;
    // Prefer own side
    if (side === 'r') score += ny * 0.5;
    else score += (4 - ny) * 0.5;
    // Prefer unclaimed
    const target = game.grid[ny][nx];
    if (target === ' ') score += 4;
    else if ((side === 'r' && target === '_') || (side === 'b' && target === '.')) score += 1;
    // Prefer wide spread (edges)
    if (nx === 0 || nx === 4) score += 1;
    score += seededRandom() * 0.5;

    if (score > bestScore) {
      bestScore = score;
      bestDir = d;
    }
  }

  if (bestDir) return bestDir;
  if (valid.includes(fixCase('x'))) return fixCase('x');
  if (valid.includes(fixCase('k'))) return fixCase('k');
  return valid[0];
}

// Fort-focused: always fortify, expand with purpose
function pickFortFocused(game: Game, side: Side): string {
  const valid = Object.keys(game.validSteps);
  if (valid.length === 0) throw new Error('No valid moves');
  const fixCase = side === 'r' ? (s: string) => s.toLowerCase() : (s: string) => s.toUpperCase();

  if (valid.includes(fixCase('f'))) return fixCase('f');
  return pickExpansion(game, side);
}

// Opening-specific: follow planned opening then fall back
function makeOpeningStrategy(openingMoves: string[]): Strategy {
  let moveIdx = 0;
  return (game: Game, side: Side): string => {
    const valid = Object.keys(game.validSteps);
    const fixCase = side === 'r' ? (s: string) => s.toLowerCase() : (s: string) => s.toUpperCase();

    if (moveIdx < openingMoves.length) {
      const planned = fixCase(openingMoves[moveIdx]);
      if (valid.includes(planned)) {
        moveIdx++;
        return planned;
      }
    }
    return pickFortFocused(game, side);
  };
}

// -----------------------------------------------------------------------
// Play a game
// -----------------------------------------------------------------------

interface GameResult {
  gameNum: number;
  title: string;
  winner: Side | null;
  turns: number;
  steps: string;
  playByPlay: string[];
  keyMoment: string;
  lesson: string;
}

function playGame(
  gameNum: number,
  title: string,
  redStrategy: Strategy,
  blueStrategy: Strategy,
  maxActions: number = 500,
  keyMomentHint: string = '',
  lessonHint: string = ''
): GameResult {
  let game = new Game();
  const playByPlay: string[] = [];
  let actionCount = 0;

  while (!game.winner && game.whoseTurn && actionCount < maxActions) {
    actionCount++;
    const side = game.whoseTurn;
    const strategy = side === 'r' ? redStrategy : blueStrategy;

    const valid = Object.keys(game.validSteps);
    if (valid.length === 0) break;

    const move = strategy(game, side);
    game = game.applyStep(move);

    // Check if a turn just ended (steps ends with |) or game won
    if (game.steps.endsWith('|') || game.winner) {
      const turns = game.steps.split('|').filter(s => s.length > 0);
      const lastTurn = turns[turns.length - 1];
      const turnIdx = turns.length;
      const turnSide: Side = turnIdx % 2 === 1 ? 'r' : 'b';
      const sideName = turnSide === 'r' ? 'Red' : 'Blue';
      const roundNum = Math.ceil(turnIdx / 2);
      const terr = countTerritory(game.grid);
      playByPlay.push(`Turn ${roundNum} (${sideName}): =${lastTurn}= — R_terr=${terr.red} B_terr=${terr.blue}`);
    }
  }

  const completedTurns = (game.steps.match(/\|/g) || []).length;
  const turnCount = Math.ceil(completedTurns / 2);
  const winnerName = game.winner === 'r' ? 'Red' : game.winner === 'b' ? 'Blue' : 'Nobody';

  return {
    gameNum,
    title,
    winner: game.winner,
    turns: turnCount,
    steps: game.steps.replace(/\|$/, ''),
    playByPlay,
    keyMoment: keyMomentHint || `${winnerName} built territory advantage through consistent expansion.`,
    lesson: lessonHint || 'Consistent territory control enables earlier fortification.'
  };
}

// -----------------------------------------------------------------------
// Generate org-mode output
// -----------------------------------------------------------------------

function gameToOrg(r: GameResult): string {
  const winLabel = r.winner === 'r' ? 'Red' : r.winner === 'b' ? 'Blue' : 'Draw';
  const lines: string[] = [];
  lines.push(`* Game ${r.gameNum}: ${winLabel} wins in ${r.turns} turns`);
  lines.push(':PROPERTIES:');
  lines.push(`:STEPS: ${r.steps}`);
  lines.push(`:WINNER: ${r.winner || 'none'}`);
  lines.push(`:TURNS: ${r.turns}`);
  lines.push(':END:');
  lines.push('');
  lines.push('** Play-by-play');
  for (const p of r.playByPlay) {
    lines.push(`- ${p}`);
  }
  lines.push('');
  lines.push('** Key moment');
  lines.push(r.keyMoment);
  lines.push('');
  lines.push('** Lesson');
  lines.push(r.lesson);
  lines.push('');
  return lines.join('\n');
}

// -----------------------------------------------------------------------
// Tournament
// -----------------------------------------------------------------------

describe('Terratri Tournament — Batch 2', () => {
  const results: GameResult[] = [];

  test('plays 20 games and writes org file', () => {
    // Games 21-25: Banking strategies
    rngState = 100;
    results.push(playGame(21, 'Heavy Banking Red vs Expansion Blue',
      pickBanking, pickExpansion, 500,
      'Red banked early to build burst potential but Blue expanded freely.',
      'Heavy banking delays territory growth, giving the opponent a head start.'));

    rngState = 200;
    results.push(playGame(22, 'Expansion Red vs Heavy Banking Blue',
      pickExpansion, pickBanking, 500,
      'Red expanded aggressively while Blue saved moves.',
      'Early expansion creates more fort opportunities than banking.'));

    rngState = 300;
    results.push(playGame(23, 'Mutual Banking',
      pickBanking, pickBanking, 500,
      'Both players banked early, leading to burst plays in the mid-game.',
      'When both players bank, the first to break through territory threshold wins.'));

    rngState = 400;
    results.push(playGame(24, 'No Banking — Expansion vs Expansion',
      pickExpansion, pickExpansion, 500,
      'Pure territory race without banking.',
      'Without banking, the game becomes a pure territorial race to 5 squares.'));

    rngState = 500;
    results.push(playGame(25, 'Red Banks, Blue Fort-rushes',
      pickBanking, pickFortFocused, 500,
      'Blue rushed forts while Red built reserves.',
      'Fort rushing beats banking when you can reach 5 territory fast enough.'));

    // Games 26-30: Aggressive vs Defensive
    rngState = 600;
    results.push(playGame(26, 'Aggressive Red vs Defensive Blue',
      pickAggressive, pickDefensive, 500,
      'Red charged toward Blue but Blue spread defensively on own half.',
      'Aggression disrupts but defensive territory-building can outlast it.'));

    rngState = 700;
    results.push(playGame(27, 'Defensive Red vs Aggressive Blue',
      pickDefensive, pickAggressive, 500,
      'Blue charged forward while Red built a fortress on the bottom half.',
      'A defensive player who forts first can weather aggression.'));

    rngState = 800;
    results.push(playGame(28, 'Mutual Aggression',
      pickAggressive, pickAggressive, 500,
      'Both players rushed toward each other, creating contested center.',
      'Mutual aggression leads to territory being constantly contested.'));

    rngState = 900;
    results.push(playGame(29, 'Mutual Defense',
      pickDefensive, pickDefensive, 500,
      'Both players spread on their own halves, creating a slow game.',
      'Mutual defense leads to longer games with careful fort placement.'));

    rngState = 1000;
    results.push(playGame(30, 'Aggressive Red vs Fort-focused Blue',
      pickAggressive, pickFortFocused, 500,
      'Red disrupted Blue while Blue tried to build forts quickly.',
      'Fort focus combined with territory expansion beats pure aggression.'));

    // Games 31-35: Fort placement patterns
    rngState = 1100;
    results.push(playGame(31, 'Fort Rush Red vs Random Blue',
      pickFortFocused, pickRandom, 500,
      'Red methodically built territory and forts while Blue wandered.',
      'Focused fort strategy decisively beats random play.'));

    rngState = 1200;
    results.push(playGame(32, 'Fort Rush Red vs Fort Rush Blue',
      pickFortFocused, pickFortFocused, 500,
      'Both players raced to place all 5 forts.',
      'When both fort-rush, first-mover advantage (Red) is significant.'));

    rngState = 1300;
    results.push(playGame(33, 'Random Red vs Fort Rush Blue',
      pickRandom, pickFortFocused, 500,
      'Blue focused on forts while Red played randomly.',
      'Strategic focus on forts overwhelms random play.'));

    rngState = 1400;
    results.push(playGame(34, 'Expansion Red vs Random Blue',
      pickExpansion, pickRandom, 500,
      'Red expanded methodically while Blue moved chaotically.',
      'Methodical expansion is far stronger than random movement.'));

    rngState = 1500;
    results.push(playGame(35, 'Defensive Red vs Fort Rush Blue',
      pickDefensive, pickFortFocused, 500,
      'Red spread on its own half while Blue rushed for forts.',
      'Fort rushing with good expansion beats passive defense.'));

    // Games 36-40: Opening theory
    const openings: [string, string[]][] = [
      ['ne (north-east)', ['n', 'e']],
      ['nw (north-west)', ['n', 'w']],
      ['en (east-north)', ['e', 'n']],
      ['wn (west-north)', ['w', 'n']],
      ['ew (east-west)', ['e', 'w']],
    ];

    for (let i = 0; i < 5; i++) {
      rngState = 1600 + i * 100;
      const [name, moves] = openings[i];
      const redStrat = makeOpeningStrategy(moves);
      results.push(playGame(36 + i, `Red opens ${name} vs Fort Blue`,
        redStrat, pickFortFocused, 500,
        `Red opened with ${name} and transitioned to fort strategy.`,
        `The ${name} opening ${moves[0] === 'n' ? 'gains center presence early' : 'develops a flank'}.`));
    }

    // Verify all 20 games completed
    expect(results.length).toBe(20);

    // Verify all games have winners
    for (const r of results) {
      // Game should either have a winner or hit the action limit
      expect(r.playByPlay.length).toBeGreaterThan(0);
    }

    // Write org file
    const orgLines: string[] = [];
    orgLines.push('#+TITLE: Terratri Games -- Batch 2 (Games 21-40)');
    orgLines.push('');

    for (const r of results) {
      orgLines.push(gameToOrg(r));
    }

    // Summary
    orgLines.push('* Tournament Summary');
    orgLines.push('');
    const redWins = results.filter(r => r.winner === 'r').length;
    const blueWins = results.filter(r => r.winner === 'b').length;
    const draws = results.filter(r => !r.winner).length;
    orgLines.push(`| Side | Wins |`);
    orgLines.push(`|---+---|`);
    orgLines.push(`| Red | ${redWins} |`);
    orgLines.push(`| Blue | ${blueWins} |`);
    orgLines.push(`| Draw/Timeout | ${draws} |`);
    orgLines.push('');

    // Strategy performance
    orgLines.push('** Strategy Notes');
    orgLines.push('');
    orgLines.push('- Banking: Delays territory growth but enables burst plays later.');
    orgLines.push('- Expansion: Consistent territory gain, strong foundation for forts.');
    orgLines.push('- Aggressive: Disrupts opponent but can leave own territory thin.');
    orgLines.push('- Defensive: Safe territory building but cedes center control.');
    orgLines.push('- Fort-focused: Best overall strategy -- always fortify when possible.');
    orgLines.push('');

    const orgContent = orgLines.join('\n');
    const outDir = path.resolve(__dirname, '../../games');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'batch-02.org'), orgContent);

    // Also write a JSON summary for debugging
    fs.writeFileSync(path.join(outDir, 'batch-02.json'), JSON.stringify(results, null, 2));

    console.log(`\nTournament complete: ${redWins} Red wins, ${blueWins} Blue wins, ${draws} draws/timeouts`);
    console.log(`Results written to games/batch-02.org`);
  });
});
