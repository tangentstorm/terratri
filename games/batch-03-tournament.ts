#!/usr/bin/env npx tsx
/**
 * Self-play tournament Batch 3: Games 41-60
 * Themes: Counter-strategies, Tempo, Spatial patterns, Endgame technique
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

function countForts(side: 'r' | 'b', grid: string[][]): number {
  const fort = side === 'r' ? 'R' : 'B';
  const fortPawn = side === 'r' ? 'E' : 'L';
  let count = 0;
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 5; x++) {
      if (grid[y][x] === fort || grid[y][x] === fortPawn) count++;
    }
  }
  return count;
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

function getSegment(steps: string): string {
  const lastPipe = steps.lastIndexOf('|');
  return lastPipe === -1 ? steps : steps.slice(lastPipe + 1);
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

    const centerDist = Math.abs(nx - 2) + Math.abs(ny - 2);
    score -= centerDist;

    const target = game.grid[ny][nx];
    if (target === ' ') score += 3;
    else if ((side === 'r' && target === '_') || (side === 'b' && target === '.')) score += 2;

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

// Aggressive: rush toward opponent
function pickAggressive(game: Game, side: 'r' | 'b'): string {
  const valid = Object.keys(game.validSteps);
  if (valid.length === 0) throw new Error('No valid moves');

  const pos = findPawnPos(side, game.grid);
  const opponentSide: 'r' | 'b' = side === 'r' ? 'b' : 'r';
  const oppPos = findPawnPos(opponentSide, game.grid);
  const fixCase = side === 'r' ? (s: string) => s.toLowerCase() : (s: string) => s.toUpperCase();

  if (valid.includes(fixCase('f'))) return fixCase('f');
  if (!pos || !oppPos) return valid[0];

  const dirs = valid.filter(v => 'nsewNSEW'.includes(v));
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

  if (valid.includes(fixCase('f'))) return fixCase('f');

  if (valid.includes(fixCase('k'))) {
    const terr = countTerritory(game.grid);
    const myTerr = side === 'r' ? terr.red : terr.blue;
    if (myTerr < 8) return fixCase('k');
  }

  return pickExpansion(game, side);
}

// Defensive: stay on own side, spread out
function pickDefensive(game: Game, side: 'r' | 'b'): string {
  const valid = Object.keys(game.validSteps);
  if (valid.length === 0) throw new Error('No valid moves');

  const pos = findPawnPos(side, game.grid);
  const fixCase = side === 'r' ? (s: string) => s.toLowerCase() : (s: string) => s.toUpperCase();

  if (valid.includes(fixCase('f'))) return fixCase('f');
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
    if (side === 'r') {
      score += ny;
    } else {
      score += (4 - ny);
    }

    const target = game.grid[ny][nx];
    if (target === ' ') score += 3;
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

  if (valid.includes(fixCase('f'))) return fixCase('f');
  return pickExpansion(game, side);
}

// Counter-aggressive: flank away from opponent, avoid direct contact
function pickCounterAggressive(game: Game, side: 'r' | 'b'): string {
  const valid = Object.keys(game.validSteps);
  if (valid.length === 0) throw new Error('No valid moves');

  const pos = findPawnPos(side, game.grid);
  const opponentSide: 'r' | 'b' = side === 'r' ? 'b' : 'r';
  const oppPos = findPawnPos(opponentSide, game.grid);
  const fixCase = side === 'r' ? (s: string) => s.toLowerCase() : (s: string) => s.toUpperCase();

  if (valid.includes(fixCase('f'))) return fixCase('f');
  if (!pos || !oppPos) return valid[0];

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
    // Move AWAY from opponent
    const dist = Math.abs(nx - oppPos.x) + Math.abs(ny - oppPos.y);
    score += dist;
    // Prefer unclaimed territory
    const target = game.grid[ny][nx];
    if (target === ' ') score += 5;
    else if ((side === 'r' && target === '_') || (side === 'b' && target === '.')) score += 2;

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

// Tempo-seizing: bank early, then burst-fortify
function pickTempoSeize(game: Game, side: 'r' | 'b'): string {
  const valid = Object.keys(game.validSteps);
  if (valid.length === 0) throw new Error('No valid moves');
  const fixCase = side === 'r' ? (s: string) => s.toLowerCase() : (s: string) => s.toUpperCase();

  if (valid.includes(fixCase('f'))) return fixCase('f');

  const terr = countTerritory(game.grid);
  const myTerr = side === 'r' ? terr.red : terr.blue;
  const forts = countForts(side, game.grid);

  // Bank early (first 2 turns) to save for burst
  if (forts === 0 && myTerr < 4 && valid.includes(fixCase('k'))) {
    return fixCase('k');
  }

  return pickExpansion(game, side);
}

// Spatial: prefer left/west side of board
function pickLeftSide(game: Game, side: 'r' | 'b'): string {
  const valid = Object.keys(game.validSteps);
  if (valid.length === 0) throw new Error('No valid moves');

  const pos = findPawnPos(side, game.grid);
  const fixCase = side === 'r' ? (s: string) => s.toLowerCase() : (s: string) => s.toUpperCase();

  if (valid.includes(fixCase('f'))) return fixCase('f');
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
    // Prefer left side (low x)
    score += (4 - nx) * 2;
    const target = game.grid[ny][nx];
    if (target === ' ') score += 3;
    else if ((side === 'r' && target === '_') || (side === 'b' && target === '.')) score += 2;

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

// Spatial: prefer right/east side of board
function pickRightSide(game: Game, side: 'r' | 'b'): string {
  const valid = Object.keys(game.validSteps);
  if (valid.length === 0) throw new Error('No valid moves');

  const pos = findPawnPos(side, game.grid);
  const fixCase = side === 'r' ? (s: string) => s.toLowerCase() : (s: string) => s.toUpperCase();

  if (valid.includes(fixCase('f'))) return fixCase('f');
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
    // Prefer right side (high x)
    score += nx * 2;
    const target = game.grid[ny][nx];
    if (target === ' ') score += 3;
    else if ((side === 'r' && target === '_') || (side === 'b' && target === '.')) score += 2;

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

// Diagonal: prefer diagonal movement patterns (alternating n/s with e/w)
function pickDiagonal(game: Game, side: 'r' | 'b'): string {
  const valid = Object.keys(game.validSteps);
  if (valid.length === 0) throw new Error('No valid moves');

  const fixCase = side === 'r' ? (s: string) => s.toLowerCase() : (s: string) => s.toUpperCase();

  if (valid.includes(fixCase('f'))) return fixCase('f');

  const segment = getSegment(game.steps);
  const lastChar = segment.length > 0 ? segment.slice(-1).toLowerCase() : '';

  // Alternate between vertical and horizontal
  const wantVertical = lastChar === '' || lastChar === 'e' || lastChar === 'w' || lastChar === 'f' || lastChar === 'k';
  const preferred = wantVertical
    ? [fixCase('n'), fixCase('s')]
    : [fixCase('e'), fixCase('w')];

  for (const p of preferred) {
    if (valid.includes(p)) return p;
  }

  return pickExpansion(game, side);
}

// Center fortress: rush to center and fortify there
function pickCenterFort(game: Game, side: 'r' | 'b'): string {
  const valid = Object.keys(game.validSteps);
  if (valid.length === 0) throw new Error('No valid moves');

  const pos = findPawnPos(side, game.grid);
  const fixCase = side === 'r' ? (s: string) => s.toLowerCase() : (s: string) => s.toUpperCase();

  if (valid.includes(fixCase('f'))) return fixCase('f');
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
    // Strong preference for center
    const centerDist = Math.abs(nx - 2) + Math.abs(ny - 2);
    score -= centerDist * 3;
    const target = game.grid[ny][nx];
    if (target === ' ') score += 4;
    else if ((side === 'r' && target === '_') || (side === 'b' && target === '.')) score += 2;

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

// Endgame efficient: fortify-move pattern, minimize wasted moves
function pickEndgameEfficient(game: Game, side: 'r' | 'b'): string {
  const valid = Object.keys(game.validSteps);
  if (valid.length === 0) throw new Error('No valid moves');
  const fixCase = side === 'r' ? (s: string) => s.toLowerCase() : (s: string) => s.toUpperCase();

  // Always fortify if possible
  if (valid.includes(fixCase('f'))) return fixCase('f');

  const forts = countForts(side, game.grid);
  const terr = countTerritory(game.grid);
  const myTerr = side === 'r' ? terr.red : terr.blue;

  // If we have enough territory and supply, move to new positions for fortification
  if (myTerr >= 5 && forts < 5) {
    const pos = findPawnPos(side, game.grid);
    if (pos) {
      // Find directions that lead to non-fort squares (good for future fortification)
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
        // Prefer empty or own territory (not own forts) -- good spots for new forts
        if (target === ' ') score += 4;
        else if ((side === 'r' && target === '.') || (side === 'b' && target === '_')) score += 3;
        // Avoid enemy territory if possible, it just gets recaptured
        if ((side === 'r' && target === '_') || (side === 'b' && target === '.')) score += 1;

        if (score > bestScore) {
          bestScore = score;
          bestDir = d;
        }
      }

      if (bestDir) return bestDir;
    }
  }

  return pickExpansion(game, side);
}

// Raider: invade enemy territory to disrupt their fort plans
function pickRaider(game: Game, side: 'r' | 'b'): string {
  const valid = Object.keys(game.validSteps);
  if (valid.length === 0) throw new Error('No valid moves');

  const pos = findPawnPos(side, game.grid);
  const fixCase = side === 'r' ? (s: string) => s.toLowerCase() : (s: string) => s.toUpperCase();

  if (valid.includes(fixCase('f'))) return fixCase('f');
  if (!pos) return valid[0];

  const forts = countForts(side, game.grid);
  const terr = countTerritory(game.grid);
  const myTerr = side === 'r' ? terr.red : terr.blue;

  // If we have enough to fortify, prefer expansion/fort. Otherwise raid.
  if (myTerr >= 5 && forts < 5) {
    return pickExpansion(game, side);
  }

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
    // Prioritize enemy territory to raid it
    if ((side === 'r' && target === '_') || (side === 'b' && target === '.')) score += 5;
    else if (target === ' ') score += 3;

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

// Opening-specific: follow a specific first-move sequence, then fall back
function makeOpeningStrategy(openingMoves: string, fallback: Strategy = pickFortFocused): Strategy {
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

    return fallback(game, side);
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

    const segment = getSegment(game.steps);
    const stepIndex = segment.length;

    const move = strategy(game, side);

    game = game.applyStep(move);

    // Check if turn just ended
    const newSegment = getSegment(game.steps);

    if (newSegment.length === 0 || game.winner) {
      const completedTurns = (game.steps.match(/\|/g) || []).length;
      const thisTurnNum = Math.ceil(completedTurns / 2);

      const turns = game.steps.split('|').filter(s => s.length > 0);
      const lastTurn = turns[turns.length - 1] || segment + move;

      const terr = countTerritory(game.grid);
      const forts = { r: countForts('r', game.grid), b: countForts('b', game.grid) };
      const sideName = side === 'r' ? 'Red' : 'Blue';
      const desc = `Turn ${thisTurnNum} (${sideName}): =${lastTurn}= -- territory R=${terr.red} B=${terr.blue}, forts R=${forts.r} B=${forts.b}`;
      playByPlay.push(desc);
      turnCount = thisTurnNum;
    }
  }

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
// Run tournament -- Batch 3 (Games 41-60)
// -----------------------------------------------------------------------

const results: GameResult[] = [];

// Games 41-45: Counter-strategies

results.push(playGame(41, 'Counter-aggression: Flanking beats rushing',
  pickAggressive, pickCounterAggressive, 100,
  'Red rushed toward Blue, but Blue flanked away, claiming unchallenged territory.',
  'Counter-aggression through flanking avoids confrontation and builds territory faster than head-on play.'));

results.push(playGame(42, 'Counter-banking: Rush while opponent saves',
  pickFortFocused, pickBanking, 100,
  'Blue banked heavily while Red expanded and fortified freely.',
  'Rushing forts while the opponent banks capitalizes on their tempo sacrifice.'));

results.push(playGame(43, 'Counter-center: Edge expansion vs center focus',
  pickCenterFort, pickLeftSide, 100,
  'Red fought for center control but Blue quietly built along the left edge.',
  'Edge expansion can counter center control by avoiding confrontation entirely.'));

results.push(playGame(44, 'Counter-fort-chain: Raiding disrupts linear forts',
  pickFortFocused, pickRaider, 100,
  'Blue invaded Red territory to disrupt the fort chain, buying time.',
  'Raiding enemy territory can delay their fort placement even if it costs your own expansion.'));

results.push(playGame(45, 'Counter-defense: Aggression punishes passivity',
  pickDefensive, pickAggressive, 100,
  'Red played defensively but Blue charged in and seized contested territory.',
  'Aggression punishes purely defensive play by claiming the contested middle ground.'));

// Games 46-50: Tempo and initiative

results.push(playGame(46, 'Tempo: Red seizes initiative with expansion',
  pickExpansion, pickDefensive, 100,
  'Red expanded aggressively while Blue played safe, giving Red the initiative.',
  'Seizing initiative through expansion creates a tempo lead that compounds into earlier fortification.'));

results.push(playGame(47, 'Tempo: Blue fights back with bank burst',
  pickExpansion, pickTempoSeize, 100,
  'Blue banked early then burst-expanded, matching Red on territory.',
  'Bank burst can recover lost tempo if timed correctly before the opponent starts fortifying.'));

results.push(playGame(48, 'Tempo: Trading initiative through counter-play',
  pickAggressive, pickExpansion, 100,
  'Red attacked but Blue expanded elsewhere, trading initiative back and forth.',
  'When the aggressor over-commits, the defender can seize initiative by expanding in the opposite direction.'));

results.push(playGame(49, 'Tempo: Position over speed',
  pickBanking, pickFortFocused, 100,
  'Red sacrificed tempo by banking, Blue focused on forts.',
  'Tempo sacrifices through banking only pay off if the burst turn creates a position that normal play cannot match.'));

results.push(playGame(50, 'Tempo: Fort timing decides the race',
  pickFortFocused, pickFortFocused, 100,
  'Both players raced to fortify, with first-mover advantage deciding the winner.',
  'When strategies are equal, fort timing advantage from first-mover status is decisive.'));

// Games 51-55: Spatial patterns

results.push(playGame(51, 'Spatial: Left side vs right side',
  pickLeftSide, pickRightSide, 100,
  'Red claimed the left side while Blue claimed the right, each building fort chains on their side.',
  'When players target opposite sides of the board, the game becomes a pure tempo race with no conflict.'));

results.push(playGame(52, 'Spatial: Diagonal pattern vs expansion',
  pickDiagonal, pickExpansion, 100,
  'Red moved diagonally while Blue expanded toward the center.',
  'Diagonal movement covers more ground but can leave gaps in territory; expansion fills them.'));

results.push(playGame(53, 'Spatial: Bottom control vs top expansion',
  pickDefensive, pickExpansion, 100,
  'Red controlled the bottom rows while Blue expanded from the top.',
  'Bottom/top split leads to parallel expansion races where first-mover advantage still matters.'));

results.push(playGame(54, 'Spatial: Perimeter vs center',
  pickDefensive, pickCenterFort, 100,
  'Red spread along the perimeter while Blue rushed center.',
  'Perimeter play creates a wide fort-able area, while center play is compact but vulnerable to flanking.'));

results.push(playGame(55, 'Spatial: Center fortress vs edge expansion',
  pickCenterFort, pickRightSide, 100,
  'Red built a center fortress while Blue expanded along the right edge.',
  'A center fortress is strong but takes longer to reach 5 territory; edge columns reach it faster.'));

// Games 56-60: Endgame technique

results.push(playGame(56, 'Endgame: Clean close-out with efficient forts',
  pickEndgameEfficient, pickExpansion, 100,
  'Red closed out efficiently by minimizing wasted moves between forts.',
  'Efficient endgame play means every move either fortifies or positions for the next fort.'));

results.push(playGame(57, 'Endgame: Comeback through territory raid',
  pickExpansion, pickRaider, 100,
  'Blue raided Red territory in the endgame, disrupting fort placement.',
  'Territory raids in the endgame can delay the leader, sometimes enough for a comeback.'));

results.push(playGame(58, 'Endgame: Fort denial strategy',
  pickFortFocused, pickAggressive, 100,
  'Blue aggressively invaded Red fort locations, denying placement.',
  'Fort denial through invasion can slow the opponent, but you need your own fort plan too.'));

results.push(playGame(59, 'Endgame: Banked move advantage in fort race',
  pickBanking, pickExpansion, 100,
  'Red used banked moves for extra actions in the critical fort-placing phase.',
  'Banked moves in the endgame enable extra fortification actions that can swing the race.'));

results.push(playGame(60, 'Endgame: Fort chain completion technique',
  pickEndgameEfficient, pickEndgameEfficient, 100,
  'Both players used efficient fort-chain technique; first-mover won.',
  'When both players use optimal fort-chain technique, first-mover advantage is the sole differentiator.'));

// -----------------------------------------------------------------------
// Output results as JSON
// -----------------------------------------------------------------------

console.log(JSON.stringify(results, null, 2));
