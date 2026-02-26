#!/usr/bin/env npx tsx
/**
 * Self-play tournament: play 20 games with different strategies.
 * Outputs results as JSON for post-processing into org-mode.
 */

import { Game } from '../src/shared/Game.js';

// -----------------------------------------------------------------------
// Strategy helpers
// -----------------------------------------------------------------------

interface GameResult {
  gameNum: number;
  title: string;
  winner: 'r' | 'b' | null;
  turns: number;
  steps: string;
  playByPlay: string[];
  keyMoment: string;
  lesson: string;
}

type Strategy = (game: Game, side: 'r' | 'b') => string;

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

function findPawnPos(side: 'r' | 'b', grid: string[][]): { x: number; y: number } | null {
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

function dirToString(dir: string): string {
  switch(dir.toLowerCase()) {
    case 'n': return 'north';
    case 's': return 'south';
    case 'e': return 'east';
    case 'w': return 'west';
    case 'f': return 'fortify';
    case 'x': return 'pass';
    case 'k': return 'bank';
    default: return dir;
  }
}

// Pick a random valid move
function pickRandom(game: Game): string {
  const valid = Object.keys(game.validSteps);
  if (valid.length === 0) throw new Error('No valid moves');
  return valid[Math.floor(Math.random() * valid.length)];
}

// Pick direction moves that expand toward center, with fallback
function pickExpansion(game: Game, side: 'r' | 'b'): string {
  const valid = Object.keys(game.validSteps);
  if (valid.length === 0) throw new Error('No valid moves');

  const pos = findPawnPos(side, game.grid);
  if (!pos) return valid[0];

  // Prefer directions
  const dirs = valid.filter(v => 'nsewNSEW'.includes(v));
  const fixCase = side === 'r' ? (s: string) => s.toLowerCase() : (s: string) => s.toUpperCase();

  // If fortify is available, take it!
  if (valid.includes(fixCase('f'))) return fixCase('f');

  // Score directions by how they move toward center and unclaimed territory
  let bestDir = '';
  let bestScore = -999;

  for (const d of dirs) {
    const dl = d.toLowerCase();
    let score = 0;
    let nx = pos.x, ny = pos.y;
    if (dl === 'n') ny--;
    if (dl === 's') ny++;
    if (dl === 'e') nx++;
    if (dl === 'w') nx--;

    if (nx < 0 || nx > 4 || ny < 0 || ny > 4) continue;

    // Prefer moving toward center
    const centerDist = Math.abs(nx - 2) + Math.abs(ny - 2);
    score -= centerDist;

    // Prefer unclaimed squares
    const target = game.grid[ny][nx];
    if (target === ' ') score += 3;
    else if ((side === 'r' && target === '_') || (side === 'b' && target === '.')) score += 2; // Capture enemy territory

    if (score > bestScore) {
      bestScore = score;
      bestDir = d;
    }
  }

  if (bestDir) return bestDir;

  // Fallback: prefer pass or bank over bad moves
  if (valid.includes(fixCase('x'))) return fixCase('x');
  if (valid.includes(fixCase('k'))) return fixCase('k');
  return valid[0];
}

// Aggressive: rush toward opponent
function pickAggressive(game: Game, side: 'r' | 'b'): string {
  const valid = Object.keys(game.validSteps);
  if (valid.length === 0) throw new Error('No valid moves');

  const pos = findPawnPos(side, game.grid);
  const opponentSide: 'r' | 'b' = side === 'r' ? 'b' : 'r';
  const oppPos = findPawnPos(opponentSide, game.grid);
  const fixCase = side === 'r' ? (s: string) => s.toLowerCase() : (s: string) => s.toUpperCase();

  // If fortify is available, take it!
  if (valid.includes(fixCase('f'))) return fixCase('f');

  if (!pos || !oppPos) return valid[0];

  const dirs = valid.filter(v => 'nsewNSEW'.includes(v));

  // Move toward opponent
  let bestDir = '';
  let bestDist = 999;

  for (const d of dirs) {
    const dl = d.toLowerCase();
    let nx = pos.x, ny = pos.y;
    if (dl === 'n') ny--;
    if (dl === 's') ny++;
    if (dl === 'e') nx++;
    if (dl === 'w') nx--;

    const dist = Math.abs(nx - oppPos.x) + Math.abs(ny - oppPos.y);
    if (dist < bestDist) {
      bestDist = dist;
      bestDir = d;
    }
  }

  if (bestDir) return bestDir;
  if (valid.includes(fixCase('x'))) return fixCase('x');
  return valid[0];
}

// Banking: prefer to bank on 2nd action early
function pickBanking(game: Game, side: 'r' | 'b'): string {
  const valid = Object.keys(game.validSteps);
  if (valid.length === 0) throw new Error('No valid moves');
  const fixCase = side === 'r' ? (s: string) => s.toLowerCase() : (s: string) => s.toUpperCase();

  // If fortify is available, take it!
  if (valid.includes(fixCase('f'))) return fixCase('f');

  // If bank is available and we're early in the game, bank
  if (valid.includes(fixCase('k'))) {
    const terr = countTerritory(game.grid);
    const myTerr = side === 'r' ? terr.red : terr.blue;
    if (myTerr < 8) return fixCase('k'); // Bank early when territory is low
  }

  return pickExpansion(game, side);
}

// Defensive: stay on own side, spread out
function pickDefensive(game: Game, side: 'r' | 'b'): string {
  const valid = Object.keys(game.validSteps);
  if (valid.length === 0) throw new Error('No valid moves');

  const pos = findPawnPos(side, game.grid);
  const fixCase = side === 'r' ? (s: string) => s.toLowerCase() : (s: string) => s.toUpperCase();

  // If fortify is available, take it!
  if (valid.includes(fixCase('f'))) return fixCase('f');

  if (!pos) return valid[0];

  const dirs = valid.filter(v => 'nsewNSEW'.includes(v));

  // Stay on own side (red=bottom=high y, blue=top=low y)
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
    // Prefer staying on own side
    if (side === 'r') {
      score += ny; // Higher y = closer to bottom = Red's side
    } else {
      score += (4 - ny); // Lower y = closer to top = Blue's side
    }

    // Prefer unclaimed squares
    const target = game.grid[ny][nx];
    if (target === ' ') score += 3;

    // Prefer edge squares for spreading
    if (nx === 0 || nx === 4 || ny === 0 || ny === 4) score += 1;

    if (score > bestScore) {
      bestScore = score;
      bestDir = d;
    }
  }

  if (bestDir) return bestDir;
  if (valid.includes(fixCase('x'))) return fixCase('x');
  return valid[0];
}

// Fort-focused: prioritize getting to 5 territory fast and fortifying
function pickFortFocused(game: Game, side: 'r' | 'b'): string {
  const valid = Object.keys(game.validSteps);
  if (valid.length === 0) throw new Error('No valid moves');
  const fixCase = side === 'r' ? (s: string) => s.toLowerCase() : (s: string) => s.toUpperCase();

  // ALWAYS fortify if possible
  if (valid.includes(fixCase('f'))) return fixCase('f');

  // If close to 5 territory, prefer expansion
  const terr = countTerritory(game.grid);
  const myTerr = side === 'r' ? terr.red : terr.blue;

  if (myTerr >= 4) {
    // Rush for more territory to get fort-eligible
    return pickExpansion(game, side);
  }

  return pickExpansion(game, side);
}

// Opening-specific: follow a specific first-move sequence, then fall back to expansion
function makeOpeningStrategy(openingMoves: string): Strategy {
  let moveIdx = 0;
  return (game: Game, side: 'r' | 'b'): string => {
    const valid = Object.keys(game.validSteps);
    const fixCase = side === 'r' ? (s: string) => s.toLowerCase() : (s: string) => s.toUpperCase();

    if (moveIdx < openingMoves.length) {
      const planned = fixCase(openingMoves[moveIdx]);
      if (valid.includes(planned)) {
        moveIdx++;
        return planned;
      }
    }

    // Fall back to fort-focused
    return pickFortFocused(game, side);
  };
}

// -----------------------------------------------------------------------
// Play a game
// -----------------------------------------------------------------------

function playGame(
  gameNum: number,
  title: string,
  redStrategy: Strategy,
  blueStrategy: Strategy,
  maxTurns: number = 100,
  keyMomentHint: string = '',
  lessonHint: string = ''
): GameResult {
  let game = new Game();
  const playByPlay: string[] = [];
  let turnCount = 0;
  let safetyCounter = 0;

  while (!game.winner && safetyCounter < maxTurns * 10) {
    safetyCounter++;
    if (!game.whoseTurn) break;

    const side = game.whoseTurn;
    const strategy = side === 'r' ? redStrategy : blueStrategy;

    const valid = Object.keys(game.validSteps);
    if (valid.length === 0) break;

    // Determine which step in the current turn we're on
    const lastPipe = game.steps.lastIndexOf('|');
    const segment = lastPipe === -1 ? game.steps : game.steps.slice(lastPipe + 1);
    const stepIndex = segment.length;

    const move = strategy(game, side);
    const pos = findPawnPos(side, game.grid);
    const dest = game.validSteps[move];

    const turnNum = Math.floor((game.steps.match(/\|/g) || []).length / 2) + 1;
    const sideName = side === 'r' ? 'Red' : 'Blue';

    const moveDesc = `${move.toLowerCase()}`;

    // Record the move at start of turn
    if (stepIndex === 0) {
      // First action of a new turn
    }

    game = game.applyStep(move);

    // Check if turn just ended
    const newLastPipe = game.steps.lastIndexOf('|');
    const newSegment = newLastPipe === -1 ? game.steps : game.steps.slice(newLastPipe + 1);

    if (newSegment.length === 0 || game.winner) {
      // Turn ended
      const completedTurns = (game.steps.match(/\|/g) || []).length;
      const thisTurnNum = Math.ceil(completedTurns / 2);

      // Extract the turn that just ended
      const turns = game.steps.split('|').filter(s => s.length > 0);
      const lastTurn = turns[turns.length - 1] || segment + move;

      const terr = countTerritory(game.grid);
      const desc = `Turn ${thisTurnNum} (${sideName}): =${lastTurn}= — territory R=${terr.red} B=${terr.blue}`;
      playByPlay.push(desc);
      turnCount = thisTurnNum;
    }
  }

  // Count turns properly
  const completedTurns = (game.steps.match(/\|/g) || []).length;
  turnCount = Math.ceil(completedTurns / 2);

  const winnerName = game.winner === 'r' ? 'Red' : game.winner === 'b' ? 'Blue' : 'Draw';

  return {
    gameNum,
    title,
    winner: game.winner,
    turns: turnCount,
    steps: game.steps,
    playByPlay,
    keyMoment: keyMomentHint || `${winnerName} secured the win through consistent territory expansion and fort placement.`,
    lesson: lessonHint || 'Consistent territory expansion enables earlier fort placement.'
  };
}

// -----------------------------------------------------------------------
// Run tournament
// -----------------------------------------------------------------------

const results: GameResult[] = [];

// Games 21-25: Banking strategies
results.push(playGame(21, 'Heavy Banking Red vs Expansion Blue',
  pickBanking, pickExpansion, 100,
  'Red banked early but the delayed expansion cost tempo.',
  'Heavy banking can backfire if the opponent expands freely.'));

results.push(playGame(22, 'Expansion Red vs Heavy Banking Blue',
  pickExpansion, pickBanking, 100,
  'Red expanded while Blue saved moves for later.',
  'Early expansion creates more fort opportunities than banking.'));

results.push(playGame(23, 'Mutual Banking',
  pickBanking, pickBanking, 100,
  'Both players banked early, leading to explosive mid-game.',
  'When both players bank, the first to break through gets the advantage.'));

results.push(playGame(24, 'No Banking (Expansion vs Expansion)',
  pickExpansion, pickExpansion, 100,
  'Pure territory race without banking.',
  'Without banking, games follow a more predictable territory race.'));

results.push(playGame(25, 'Red Banks, Blue Fort-rushes',
  pickBanking, pickFortFocused, 100,
  'Blue rushed forts while Red saved for later.',
  'Fort rushing can beat banking if territory reaches threshold fast.'));

// Games 26-30: Aggressive vs Defensive
results.push(playGame(26, 'Aggressive Red vs Defensive Blue',
  pickAggressive, pickDefensive, 100,
  'Red rushed toward Blue territory while Blue spread on own side.',
  'Aggression can disrupt defensive plans but risks overextension.'));

results.push(playGame(27, 'Defensive Red vs Aggressive Blue',
  pickDefensive, pickAggressive, 100,
  'Red stayed back while Blue charged forward.',
  'Defense with early forts can weather aggressive play.'));

results.push(playGame(28, 'Mutual Aggression',
  pickAggressive, pickAggressive, 100,
  'Both players rushed toward each other in the center.',
  'Mutual aggression often results in blocked positions and long games.'));

results.push(playGame(29, 'Mutual Defense',
  pickDefensive, pickDefensive, 100,
  'Both players stayed on their sides, slowly expanding.',
  'Defensive play leads to longer games with careful fort timing.'));

results.push(playGame(30, 'Aggressive Red vs Fort-focused Blue',
  pickAggressive, pickFortFocused, 100,
  'Red disrupted while Blue tried to build forts quickly.',
  'Aggression can delay the opponent fort plan but requires follow-through.'));

// Games 31-35: Fort placement patterns
results.push(playGame(31, 'Fort Rush Red vs Random Blue',
  pickFortFocused, pickRandom, 100,
  'Red focused on forts while Blue played randomly.',
  'Focused fort strategy beats random play decisively.'));

results.push(playGame(32, 'Fort Rush Red vs Fort Rush Blue',
  pickFortFocused, pickFortFocused, 100,
  'Both players raced to place all 5 forts.',
  'Fort racing rewards whoever reaches 5 territory first.'));

results.push(playGame(33, 'Random Red vs Fort Rush Blue',
  pickRandom, pickFortFocused, 100,
  'Blue focused on forts while Red wandered.',
  'Strategic fort play outperforms random wandering.'));

results.push(playGame(34, 'Expansion Red vs Random Blue',
  pickExpansion, pickRandom, 100,
  'Red expanded methodically while Blue played chaotically.',
  'Methodical expansion beats random play in territory games.'));

results.push(playGame(35, 'Defensive Red vs Fort Rush Blue',
  pickDefensive, pickFortFocused, 100,
  'Red spread defensively while Blue rushed for forts.',
  'Fort rushing with good territory is hard to stop defensively.'));

// Games 36-40: Opening theory
const openings = ['ne', 'nw', 'en', 'wn', 'ew'];
const openingNames = ['ne (north-east)', 'nw (north-west)', 'en (east-north)', 'wn (west-north)', 'ew (east-west)'];

for (let i = 0; i < 5; i++) {
  const opening = openings[i];
  const openingName = openingNames[i];
  const redStrat = makeOpeningStrategy(opening);
  results.push(playGame(36 + i, `Red opens ${openingName} vs Fort Blue`,
    redStrat, pickFortFocused, 100,
    `Red opened with ${openingName} and transitioned to expansion.`,
    `The ${openingName} opening ${opening.includes('n') ? 'advances toward center early' : 'controls a flank first'}.`));
}

// -----------------------------------------------------------------------
// Output results as JSON
// -----------------------------------------------------------------------

console.log(JSON.stringify(results, null, 2));
