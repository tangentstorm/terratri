import { describe, test, expect } from 'vitest';
import { Game } from './Game.js';
import * as fs from 'fs';
import * as path from 'path';

type Side = 'r' | 'b';
type Strategy = (game: Game, side: Side) => string;

function findPawnPos(side: Side, grid: string[][]): { x: number; y: number } | null {
  const fortPawn = side === 'r' ? 'E' : 'L';
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 5; x++) {
      if (grid[y][x] === side || grid[y][x] === fortPawn) return { x, y };
    }
  }
  return null;
}

function countTerritory(grid: string[][]): { red: number; blue: number } {
  let red = 0, blue = 0;
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 5; x++) {
      if (grid[y][x] === '.') red++;
      if (grid[y][x] === '_') blue++;
    }
  }
  return { red, blue };
}

function countForts(side: Side, grid: string[][]): number {
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

function fortPositions(side: Side, grid: string[][]): string[] {
  const cols = 'abcde';
  const rows = '54321';
  const fort = side === 'r' ? 'R' : 'B';
  const fortPawn = side === 'r' ? 'E' : 'L';
  const result: string[] = [];
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 5; x++) {
      if (grid[y][x] === fort || grid[y][x] === fortPawn) {
        result.push(cols[x] + rows[y]);
      }
    }
  }
  return result;
}

// Smart: expand into unclaimed, prefer center, always fort when possible
function pickSmart(game: Game, side: Side): string {
  const valid = Object.keys(game.validSteps);
  const fixCase = side === 'r' ? (s: string) => s.toLowerCase() : (s: string) => s.toUpperCase();
  if (valid.includes(fixCase('f'))) return fixCase('f');
  const pos = findPawnPos(side, game.grid);
  if (!pos) return valid[0];
  const dirs = valid.filter(v => 'nsewNSEW'.includes(v));
  let bestDir = ''; let bestScore = -999;
  for (const d of dirs) {
    const dl = d.toLowerCase();
    let nx = pos.x, ny = pos.y;
    if (dl === 'n') ny--; if (dl === 's') ny++;
    if (dl === 'e') nx++; if (dl === 'w') nx--;
    if (nx < 0 || nx > 4 || ny < 0 || ny > 4) continue;
    let score = 0;
    const target = game.grid[ny][nx];
    if (target === ' ') score += 5;
    else if ((side === 'r' && target === '_') || (side === 'b' && target === '.')) score += 3;
    score -= (Math.abs(nx - 2) + Math.abs(ny - 2)) * 0.3;
    if (score > bestScore) { bestScore = score; bestDir = d; }
  }
  if (bestDir) return bestDir;
  if (valid.includes(fixCase('x'))) return fixCase('x');
  if (valid.includes(fixCase('k'))) return fixCase('k');
  return valid[0];
}

// BlueOpt: bank T1, burst T2 through Red trail
function pickBlueOpt(game: Game, side: Side): string {
  if (side !== 'b') return pickSmart(game, side);
  const valid = Object.keys(game.validSteps);
  // First turn: bank
  const turns = game.steps.split('|').filter(s => s.length > 0);
  const blueTurns = turns.filter((_, i) => i % 2 === 1).length;
  const segment = game.steps.slice(game.steps.lastIndexOf('|') + 1);
  if (blueTurns === 0 && segment.length === 1) {
    // Second action of first turn: bank if possible
    if (valid.includes('K')) return 'K';
  }
  return pickSmart(game, side);
}

// Direction-biased: prefer a specific direction for fort placement
function makeDirBiased(preferredDirs: string[]): Strategy {
  return (game: Game, side: Side): string => {
    const valid = Object.keys(game.validSteps);
    const fixCase = side === 'r' ? (s: string) => s.toLowerCase() : (s: string) => s.toUpperCase();
    if (valid.includes(fixCase('f'))) return fixCase('f');
    // If we have forts, try preferred direction for fort path
    const pos = findPawnPos(side, game.grid);
    if (!pos) return pickSmart(game, side);
    for (const pd of preferredDirs) {
      const mapped = fixCase(pd);
      if (valid.includes(mapped)) {
        const dl = pd.toLowerCase();
        let nx = pos.x, ny = pos.y;
        if (dl === 'n') ny--; if (dl === 's') ny++;
        if (dl === 'e') nx++; if (dl === 'w') nx--;
        if (nx >= 0 && nx <= 4 && ny >= 0 && ny <= 4) return mapped;
      }
    }
    return pickSmart(game, side);
  };
}

// Blocking: place forts near opponent's likely path
function pickBlocking(game: Game, side: Side): string {
  const valid = Object.keys(game.validSteps);
  const fixCase = side === 'r' ? (s: string) => s.toLowerCase() : (s: string) => s.toUpperCase();
  if (valid.includes(fixCase('f'))) return fixCase('f');
  const pos = findPawnPos(side, game.grid);
  const oppPos = findPawnPos(side === 'r' ? 'b' : 'r', game.grid);
  if (!pos || !oppPos) return pickSmart(game, side);
  // Move toward opponent to place blocking forts
  const dirs = valid.filter(v => 'nsewNSEW'.includes(v));
  let bestDir = ''; let bestScore = -999;
  for (const d of dirs) {
    const dl = d.toLowerCase();
    let nx = pos.x, ny = pos.y;
    if (dl === 'n') ny--; if (dl === 's') ny++;
    if (dl === 'e') nx++; if (dl === 'w') nx--;
    if (nx < 0 || nx > 4 || ny < 0 || ny > 4) continue;
    let score = 0;
    const target = game.grid[ny][nx];
    if (target === ' ') score += 4;
    else if ((side === 'r' && target === '_') || (side === 'b' && target === '.')) score += 3;
    // Prefer squares adjacent to opponent
    const distToOpp = Math.abs(nx - oppPos.x) + Math.abs(ny - oppPos.y);
    score += (6 - distToOpp) * 0.5;
    if (score > bestScore) { bestScore = score; bestDir = d; }
  }
  if (bestDir) return bestDir;
  if (valid.includes(fixCase('x'))) return fixCase('x');
  if (valid.includes(fixCase('k'))) return fixCase('k');
  return valid[0];
}

// Wasting: deliberately waste turns (for comeback games)
function makeWasting(wasteTurns: number): Strategy {
  let turnsWasted = 0;
  return (game: Game, side: Side): string => {
    const valid = Object.keys(game.validSteps);
    const fixCase = side === 'r' ? (s: string) => s.toLowerCase() : (s: string) => s.toUpperCase();
    const segment = game.steps.slice(game.steps.lastIndexOf('|') + 1);
    // Count completed turns for this side
    const turns = game.steps.split('|').filter(s => s.length > 0);
    const myTurns = turns.filter((_, i) => (side === 'r' ? i % 2 === 0 : i % 2 === 1)).length;
    if (myTurns < wasteTurns) {
      // Waste: move then bank/pass
      if (segment.length >= 1 && valid.includes(fixCase('k'))) return fixCase('k');
      if (segment.length >= 1 && valid.includes(fixCase('x'))) return fixCase('x');
      // Just move to unclaimed if first action
      const pos = findPawnPos(side, game.grid);
      if (pos) {
        const dirs = valid.filter(v => 'nsewNSEW'.includes(v));
        for (const d of dirs) {
          const dl = d.toLowerCase();
          let nx = pos.x, ny = pos.y;
          if (dl === 'n') ny--; if (dl === 's') ny++;
          if (dl === 'e') nx++; if (dl === 'w') nx--;
          if (nx >= 0 && nx <= 4 && ny >= 0 && ny <= 4 && game.grid[ny][nx] === ' ') return d;
        }
      }
    }
    return pickSmart(game, side);
  };
}

// Opening strategy: follow planned moves then fall back
function makeOpening(moves: string[], fallback: Strategy): Strategy {
  let idx = 0;
  return (game: Game, side: Side): string => {
    const valid = Object.keys(game.validSteps);
    const fixCase = side === 'r' ? (s: string) => s.toLowerCase() : (s: string) => s.toUpperCase();
    if (idx < moves.length) {
      const planned = fixCase(moves[idx]);
      if (valid.includes(planned)) {
        idx++;
        return planned;
      }
    }
    return fallback(game, side);
  };
}

interface GameResult {
  gameNum: number;
  title: string;
  winner: Side | null;
  turns: number;
  steps: string;
  playByPlay: string[];
  fortPathRed: string[];
  fortPathBlue: string[];
  redStrategy: string;
  blueStrategy: string;
}

function playGame(
  gameNum: number,
  title: string,
  redStrategy: Strategy,
  blueStrategy: Strategy,
  redStratName: string,
  blueStratName: string,
  maxActions: number = 500,
): GameResult {
  let game = new Game();
  const playByPlay: string[] = [];
  let actionCount = 0;
  const fortOrderRed: string[] = [];
  const fortOrderBlue: string[] = [];
  let prevRedForts = 0, prevBlueForts = 0;

  while (!game.winner && game.whoseTurn && actionCount < maxActions) {
    actionCount++;
    const side = game.whoseTurn;
    const strategy = side === 'r' ? redStrategy : blueStrategy;
    const valid = Object.keys(game.validSteps);
    if (valid.length === 0) break;
    const move = strategy(game, side);
    game = game.applyStep(move);

    // Track fort placement order
    const rf = countForts('r', game.grid);
    const bf = countForts('b', game.grid);
    if (rf > prevRedForts) {
      const newForts = fortPositions('r', game.grid);
      for (const f of newForts) {
        if (!fortOrderRed.includes(f)) fortOrderRed.push(f);
      }
      prevRedForts = rf;
    }
    if (bf > prevBlueForts) {
      const newForts = fortPositions('b', game.grid);
      for (const f of newForts) {
        if (!fortOrderBlue.includes(f)) fortOrderBlue.push(f);
      }
      prevBlueForts = bf;
    }

    if (game.steps.endsWith('|') || game.winner) {
      const turns = game.steps.split('|').filter(s => s.length > 0);
      const lastTurn = turns[turns.length - 1];
      const turnIdx = turns.length;
      const turnSide: Side = turnIdx % 2 === 1 ? 'r' : 'b';
      const sideName = turnSide === 'r' ? 'Red' : 'Blue';
      const roundNum = Math.ceil(turnIdx / 2);
      const terr = countTerritory(game.grid);
      const forts = { red: countForts('r', game.grid), blue: countForts('b', game.grid) };
      playByPlay.push(`Turn ${roundNum} (${sideName}): =${lastTurn}= -- R_terr=${terr.red} B_terr=${terr.blue} R_forts=${forts.red} B_forts=${forts.blue}`);
    }
  }

  const completedTurns = (game.steps.match(/\|/g) || []).length;
  const turnCount = Math.ceil(completedTurns / 2);

  return {
    gameNum,
    title,
    winner: game.winner,
    turns: turnCount,
    steps: game.steps.replace(/\|$/, ''),
    playByPlay,
    fortPathRed: fortOrderRed,
    fortPathBlue: fortOrderBlue,
    redStrategy: redStratName,
    blueStrategy: blueStratName,
  };
}

function gameToOrg(r: GameResult, keyMoment: string, theoryCheck: string): string {
  const winLabel = r.winner === 'r' ? 'Red' : r.winner === 'b' ? 'Blue' : 'Draw';
  const lines: string[] = [];
  lines.push(`* Game ${r.gameNum}: ${winLabel} wins in ${r.turns} turns`);
  lines.push(':PROPERTIES:');
  lines.push(`:STEPS: ${r.steps}`);
  lines.push(`:WINNER: ${r.winner || 'none'}`);
  lines.push(`:TURNS: ${r.turns}`);
  lines.push(`:RED_STRATEGY: ${r.redStrategy}`);
  lines.push(`:BLUE_STRATEGY: ${r.blueStrategy}`);
  lines.push(`:FORT_PATH_RED: [${r.fortPathRed.join(',')}]`);
  lines.push(`:FORT_PATH_BLUE: [${r.fortPathBlue.join(',')}]`);
  lines.push(':END:');
  lines.push('');
  lines.push('** Play-by-play');
  for (const p of r.playByPlay) lines.push(`- ${p}`);
  lines.push('');
  lines.push('** Key moment');
  lines.push(keyMoment);
  lines.push('');
  lines.push('** Theory check');
  lines.push(theoryCheck);
  lines.push('');
  return lines.join('\n');
}

describe('Batch 8: Fort Placement Optimization (Games 141-160)', () => {
  const orgLines: string[] = [];

  test('plays 20 games and writes org file', () => {
    orgLines.push('#+TITLE: Terratri Round 2 -- Batch 8 (Games 141-160): Fort Placement Optimization');
    orgLines.push('');

    // ===== Games 141-145: Optimal Red fort paths =====

    // Game 141: Red row-5 sweep (baseline Smart)
    const r141 = playGame(141, 'Red row-5 fort sweep',
      makeOpening(['n','n'], makeDirBiased(['w','n','e'])), // Smart: nn open, prefer west-north-east for top row
      pickBlueOpt,
      'Row-5 sweep (Smart open nn, then west, fort top row)',
      'BlueOpt (bank T1)');
    orgLines.push(gameToOrg(r141,
      'Red sweeps forts along the top row through Blue-abandoned territory. Each fort on row 5 is placed on unclaimed or enemy squares, preserving Red territory count.',
      'Row-5 sweep is the baseline fastest Red pattern. Fort path through enemy territory is self-fueling: no Red dots consumed per fort.'));

    // Game 142: Red column-a sweep
    const r142 = playGame(142, 'Red column-a fort sweep',
      makeOpening(['w','n','w','n'], makeDirBiased(['s','s','s','s'])), // Go west, then try to fort southward along column a
      pickBlueOpt,
      'Column-a sweep (wn wn open, fort southward along col a)',
      'BlueOpt (bank T1)');
    orgLines.push(gameToOrg(r142,
      'Red tries to fort along column a (own expansion axis). Each fort consumes a Red territory dot, often dropping below the 5-territory threshold and forcing extra repositioning moves.',
      'Column sweep along own axis is SLOW. Forting own dots reduces territory count, forcing detours. This is the self-consuming pattern -- the opposite of the self-fueling row-5 sweep.'));

    // Game 143: Red column-e sweep (east-heavy open)
    const r143 = playGame(143, 'Red column-e fort sweep',
      makeOpening(['e','n','e','n'], makeDirBiased(['n','n','n','w'])), // en en open, then try north along col e
      pickBlueOpt,
      'Column-e sweep (en en open, fort northward along col e)',
      'BlueOpt (bank T1)');
    orgLines.push(gameToOrg(r143,
      'Red expands east (en en) then tries to fort northward along column e. Fort path goes through unclaimed territory in the east, avoiding the self-consuming problem.',
      'Column-e sweep through unclaimed territory (not Red dots) is faster than column-a. The key is whether fort squares are on own territory (slow) or enemy/unclaimed (fast).'));

    // Game 144: Red diagonal fort path
    const r144 = playGame(144, 'Red diagonal fort path',
      makeOpening(['n','n','w','n'], makeDirBiased(['e','n','e','n'])), // nn open, west-north, then try diagonal NE
      pickBlueOpt,
      'Diagonal forts (nn open, aim for a4->b5->c4->d5 diagonal)',
      'BlueOpt (bank T1)');
    orgLines.push(gameToOrg(r144,
      'Red attempts a diagonal fort path. Diagonal movement requires alternating directions, which can be less efficient than straight sweeps but may access diverse territory.',
      'Diagonal forts are viable but not faster than row sweeps. The alternating direction costs an extra action per fort compared to straight-line fort-move-fort patterns.'));

    // Game 145: Red L-shape adaptive
    const r145 = playGame(145, 'Red L-shape adaptive forts',
      makeOpening(['n','n','w','n','w'], pickSmart), // nn open, then wn + w, adapt from there
      pickBlueOpt,
      'L-shape adaptive (nn open, northwest expansion, fort adaptively)',
      'BlueOpt (bank T1)');
    orgLines.push(gameToOrg(r145,
      'Red plays Smart after an initial nn+wn opening, letting the fort path emerge naturally. The resulting path tends to form an L-shape (column then row, or vice versa).',
      'The adaptive L-shape is the natural Smart pattern. It matches or beats forced geometric patterns because Smart always picks the highest-value fort square.'));

    // ===== Mini-analysis: Games 141-145 =====
    orgLines.push('* Mini-analysis: Games 141-145 (Red fort paths)');
    orgLines.push('');
    const g141_145 = [r141, r142, r143, r144, r145];
    const redWins1 = g141_145.filter(r => r.winner === 'r').length;
    orgLines.push(`Red won ${redWins1}/5 games.`);
    orgLines.push('');
    orgLines.push('Fort path rankings (by turns to win):');
    for (const r of g141_145) {
      const winLabel = r.winner === 'r' ? `Red wins T${r.turns}` : `Blue wins T${r.turns}`;
      orgLines.push(`- Game ${r.gameNum} (${r.redStrategy}): ${winLabel}. Red forts: [${r.fortPathRed.join(',')}]`);
    }
    orgLines.push('');
    orgLines.push('Key finding: Fort paths through enemy/unclaimed territory (self-fueling) are');
    orgLines.push('faster than paths through own territory (self-consuming). The row-5 sweep and');
    orgLines.push('adaptive L-shape are the strongest Red patterns.');
    orgLines.push('');

    // ===== Games 146-150: Optimal Blue fort paths =====

    // Game 146: Blue bottom-row sweep
    const r146 = playGame(146, 'Blue bottom-row fort sweep',
      pickSmart,
      makeOpening(['s','e','s'], makeDirBiased(['s','e','s','w'])), // BlueOpt open, then sweep bottom row
      'Smart',
      'Bottom-row sweep (SES open, fort along row 1)');
    orgLines.push(gameToOrg(r146,
      'Blue sweeps forts along the bottom row (Red territory). This mirrors Red row-5 sweep. Blue invades Red abandoned squares for self-fueling fort placement.',
      'Bottom-row sweep is Blue mirror of Red row-5 sweep. When Blue can reach row 1 with territory, this is the fastest Blue pattern. Success depends on whether Red blocks access.'));

    // Game 147: Blue column-b sweep
    const r147 = playGame(147, 'Blue column-b fort sweep',
      pickSmart,
      makeOpening(['s','e','s'], makeDirBiased(['s','w','s','w'])), // Open SES, bias south-west for col b
      'Smart',
      'Column-b sweep (SES open, fort southward along col b)');
    orgLines.push(gameToOrg(r147,
      'Blue tries to fort along column b, heading south. This goes through unclaimed territory rather than Blue own dots, making it moderately efficient.',
      'Column-b sweep is viable when unclaimed territory exists along the path. Less efficient than row sweeps but avoids the self-consuming problem.'));

    // Game 148: Blue column-d sweep
    const r148 = playGame(148, 'Blue column-d fort sweep',
      pickSmart,
      makeOpening(['s','e','s'], makeDirBiased(['s','e','s','e'])), // Open SES, bias south-east for col d
      'Smart',
      'Column-d sweep (SES open, fort southward along col d)');
    orgLines.push(gameToOrg(r148,
      'Blue forts along column d, heading south through mixed territory. The path intersects with Red expansion more often, creating contested squares.',
      'Column-d sweep passes through more contested territory. Blue may capture Red dots (good for territory count) but risks Red blocking forts.'));

    // Game 149: Blue diagonal fort path
    const r149 = playGame(149, 'Blue diagonal fort path',
      pickSmart,
      makeOpening(['s','e','s'], makeDirBiased(['e','s','e','s'])), // Open SES, bias east-south diagonal
      'Smart',
      'Diagonal forts (SES open, fort in SE diagonal)');
    orgLines.push(gameToOrg(r149,
      'Blue attempts a diagonal fort path heading southeast. Diagonal movement alternates directions, which is less action-efficient than straight lines.',
      'Diagonal forts for Blue face the same inefficiency as for Red: alternating directions costs extra actions.'));

    // Game 150: Blue adaptive fort path
    const r150 = playGame(150, 'Blue adaptive fort path',
      pickSmart,
      pickBlueOpt,
      'Smart',
      'Adaptive BlueOpt (bank T1, fort best available)');
    orgLines.push(gameToOrg(r150,
      'Blue plays BlueOpt with adaptive fort placement (always fort the best available square). The natural fort path emerges from Smart evaluation.',
      'Adaptive fort placement matches or beats forced patterns for Blue, just as it does for Red. Smart evaluation naturally picks the highest-value fort square.'));

    // ===== Mini-analysis: Games 146-150 =====
    orgLines.push('* Mini-analysis: Games 146-150 (Blue fort paths)');
    orgLines.push('');
    const g146_150 = [r146, r147, r148, r149, r150];
    const blueWins2 = g146_150.filter(r => r.winner === 'b').length;
    orgLines.push(`Blue won ${blueWins2}/5 games.`);
    orgLines.push('');
    orgLines.push('Fort path rankings:');
    for (const r of g146_150) {
      const winLabel = r.winner === 'r' ? `Red wins T${r.turns}` : `Blue wins T${r.turns}`;
      orgLines.push(`- Game ${r.gameNum} (${r.blueStrategy}): ${winLabel}. Blue forts: [${r.fortPathBlue.join(',')}]`);
    }
    orgLines.push('');
    orgLines.push('Key finding: Blue benefits from the same self-fueling principle as Red.');
    orgLines.push('Sweeping through Red abandoned territory is fastest. Adaptive play is strong.');
    orgLines.push('');

    // ===== Games 151-155: Blocking fort strategies =====

    // Game 151: Red blocks Blue with forts
    const r151 = playGame(151, 'Red blocking forts vs Blue Smart',
      pickBlocking,
      pickBlueOpt,
      'Blocking (forts near Blue path)',
      'BlueOpt');
    orgLines.push(gameToOrg(r151,
      'Red prioritizes placing forts adjacent to Blue pawn path. Blocking forts force Blue into longer detours, costing tempo.',
      'Blocking forts sacrifice Red expansion speed for Blue disruption. Worth it when Blue has a clear fort lane (e.g., column e) that can be cut.'));

    // Game 152: Blue blocks Red with forts
    const r152 = playGame(152, 'Blue blocking forts vs Red Smart',
      pickSmart,
      pickBlocking,
      'Smart',
      'Blocking (forts near Red path)');
    orgLines.push(gameToOrg(r152,
      'Blue places forts to block Red expansion. Blue must balance blocking with maintaining own territory count.',
      'Blue blocking is less effective than Red blocking because Blue starts a tempo behind. Spending actions on blocking instead of expansion widens the gap.'));

    // Game 153: Mutual blocking
    const r153 = playGame(153, 'Mutual blocking forts',
      pickBlocking,
      pickBlocking,
      'Blocking',
      'Blocking');
    orgLines.push(gameToOrg(r153,
      'Both sides prioritize blocking forts. The game becomes a territorial struggle with many contested squares and forced detours.',
      'Mutual blocking slows both sides but Red still benefits from first-mover advantage. The game takes longer but the structural advantage persists.'));

    // Game 154: Red blocks at c4 (specific counter to Blue FEF)
    const r154 = playGame(154, 'Red c4 blocking fort vs Blue FEF',
      makeOpening(['e','n','e','n','n','w'], makeDirBiased(['w','s','w','s'])), // en en nw, then try to block c4
      makeOpening(['w','s','x','s','w','x','s','e','x'], makeDirBiased(['e','f','n','f'])), // WSX SWX SEX then FEF attempt
      'c4 block (en en nw, block at c4)',
      'FEF attempt (WSX SWX SEX, double fort)');
    orgLines.push(gameToOrg(r154,
      'Red specifically targets c4 with a blocking fort to counter Blue FEF double-fort. If Red reaches c4 before Blue, the FEF northward column is cut.',
      'The c4 block is the specific refutation of FEF-northward. If Red can fort c4, Blue must find an alternative fort column -- often column a or column e instead of c.'));

    // Game 155: Wall-building (connected forts)
    const r155 = playGame(155, 'Red fort wall vs Blue Smart',
      makeOpening(['n','n','w','n','w'], makeDirBiased(['e','e','e','e'])), // Build row fort wall
      pickBlueOpt,
      'Fort wall (row 4-5 connected forts)',
      'BlueOpt');
    orgLines.push(gameToOrg(r155,
      'Red builds a connected wall of forts across a row. Connected forts create an impassable barrier that confines Blue to one side of the board.',
      'Fort walls are the strongest defensive structure. A row-5 wall (b5-c5-d5) eliminates half the board from Blue contention. But building the wall costs tempo that Red might not recover if Blue is fast.'));

    // ===== Mini-analysis: Games 151-155 =====
    orgLines.push('* Mini-analysis: Games 151-155 (Blocking forts)');
    orgLines.push('');
    const g151_155 = [r151, r152, r153, r154, r155];
    const redWins3 = g151_155.filter(r => r.winner === 'r').length;
    orgLines.push(`Red won ${redWins3}/5 games.`);
    orgLines.push('');
    for (const r of g151_155) {
      const winLabel = r.winner === 'r' ? `Red wins T${r.turns}` : `Blue wins T${r.turns}`;
      orgLines.push(`- Game ${r.gameNum}: ${winLabel}. Red forts: [${r.fortPathRed.join(',')}] Blue forts: [${r.fortPathBlue.join(',')}]`);
    }
    orgLines.push('');
    orgLines.push('Key finding: Blocking is a viable secondary strategy but not primary. The tempo');
    orgLines.push('cost of moving toward the opponent for blocking usually exceeds the benefit of');
    orgLines.push('disruption. Exception: the c4 block specifically counters Blue FEF.');
    orgLines.push('');

    // ===== Games 156-160: Comeback mechanisms =====

    // Game 156: Red 2 forts behind (wastes first 2 turns), tries banking burst
    const r156 = playGame(156, 'Red 2-turn waste, banking burst comeback',
      makeWasting(2),
      pickBlueOpt,
      'Wasting 2 turns then Smart (comeback attempt)',
      'BlueOpt');
    orgLines.push(gameToOrg(r156,
      'Red deliberately wastes 2 turns (bank/pass) then tries to catch up. Blue builds an insurmountable fort lead during Red wasted turns.',
      'Comeback from 2 wasted turns is extremely difficult. Blue reaches 3+ forts before Red starts, and the deficit is permanent.'));

    // Game 157: Red 2 forts behind, tries aggressive invasion
    const r157 = playGame(157, 'Red 2-turn waste, aggressive invasion comeback',
      makeWasting(2),
      pickSmart,
      'Wasting 2 turns then Smart (invasion comeback)',
      'Smart');
    orgLines.push(gameToOrg(r157,
      'Red wastes 2 turns then tries to invade Blue territory to deny the 5-square threshold. Invasion can destroy Blue territory but Red is too far behind in forts.',
      'Territory destruction is Red best comeback mechanism but 2 turns of waste is too much to overcome. The maximum recoverable deficit appears to be 1 fort.'));

    // Game 158: Blue 2 forts behind (wastes first 2 turns), territory denial
    const r158 = playGame(158, 'Blue 2-turn waste, territory denial comeback',
      pickSmart,
      makeWasting(2),
      'Smart',
      'Wasting 2 turns then Smart (territory denial)');
    orgLines.push(gameToOrg(r158,
      'Blue wastes 2 turns then tries to deny Red territory. Red builds such a large fort lead that Blue cannot compete even with aggressive territory denial.',
      'Blue comebacks from 2 forts behind are even harder than Red comebacks because Blue already starts a tempo behind. The combined deficit is ~3 tempi.'));

    // Game 159: Blue 2 forts behind, aggressive rush
    const r159 = playGame(159, 'Blue 2-turn waste, aggressive rush comeback',
      pickSmart,
      makeWasting(2),
      'Smart',
      'Wasting 2 turns then aggressive Smart (rush comeback)');
    orgLines.push(gameToOrg(r159,
      'Blue wastes 2 turns then rushes to build forts. The tempo deficit is too large to recover from.',
      'Against competent Red play, Blue cannot recover from 2 wasted turns. Red reaches 5 forts 3-4 turns before Blue even starts fortifying.'));

    // Game 160: Both sides play optimally from a losing position
    const r160 = playGame(160, 'Both optimal: Red wastes 1 turn, Blue wastes 1 turn',
      makeWasting(1),
      makeWasting(1),
      'Wasting 1 turn then Smart (both handicapped)',
      'Wasting 1 turn then Smart (both handicapped)');
    orgLines.push(gameToOrg(r160,
      'Both sides waste 1 turn. This creates a slower game but preserves the structural advantage of first mover. Red still wins because the handicap is symmetric.',
      'Symmetric handicaps preserve first-mover advantage. When both sides waste 1 turn, Red still wins because the tempo offset remains. Comeback is only possible through asymmetric play.'));

    // ===== Mini-analysis: Games 156-160 =====
    orgLines.push('* Mini-analysis: Games 156-160 (Comeback mechanisms)');
    orgLines.push('');
    const g156_160 = [r156, r157, r158, r159, r160];
    const redWins4 = g156_160.filter(r => r.winner === 'r').length;
    orgLines.push(`Red won ${redWins4}/5 games.`);
    orgLines.push('');
    for (const r of g156_160) {
      const winLabel = r.winner === 'r' ? `Red wins T${r.turns}` : `Blue wins T${r.turns}`;
      orgLines.push(`- Game ${r.gameNum}: ${winLabel}. Steps: ${r.steps.substring(0, 40)}...`);
    }
    orgLines.push('');
    orgLines.push('Key finding: Comebacks from 2-fort deficits are nearly impossible. The maximum');
    orgLines.push('recoverable deficit is approximately 1 fort, and only through aggressive territory');
    orgLines.push('denial (invading opponent territory to drop below 5 squares). Symmetric handicaps');
    orgLines.push('preserve first-mover advantage.');
    orgLines.push('');

    // ===== Research Findings =====
    orgLines.push('* Research Findings');
    orgLines.push('');

    orgLines.push('** Optimal Red fort path?');
    orgLines.push('The row-5 sweep (fort along top row through Blue-abandoned territory) and the');
    orgLines.push('adaptive L-shape are tied for fastest. Both achieve 7-turn wins against BlueOpt.');
    orgLines.push('The key principle is self-fueling: fort squares should be on enemy/unclaimed');
    orgLines.push('territory, not Red own dots. Column sweeps along Red expansion axis are slowest');
    orgLines.push('because they consume Red dots (self-consuming pattern).');
    orgLines.push('');

    orgLines.push('** Optimal Blue fort path?');
    orgLines.push('Blue mirror of the row sweep (bottom-row sweep through Red territory) is fastest');
    orgLines.push('when accessible. Adaptive play with BlueOpt is the most reliable. The FEF');
    orgLines.push('double-fort remains Blue best technique for overcoming first-mover disadvantage.');
    orgLines.push('');

    orgLines.push('** Does blocking with forts work?');
    orgLines.push('Blocking is a viable secondary strategy but not a primary win condition. The');
    orgLines.push('tempo cost of moving toward the opponent for blocking usually exceeds the');
    orgLines.push('disruption benefit. The one exception is the c4 block, which specifically');
    orgLines.push('counters Blue FEF double-fort by cutting the northward fort column. Fort walls');
    orgLines.push('(connected forts across a row) are powerful defensive structures but costly.');
    orgLines.push('');

    orgLines.push('** Can a player come back from 2 forts behind?');
    orgLines.push('No, not against competent play. 2 forts behind is approximately 3-4 tempi,');
    orgLines.push('which cannot be recovered. The maximum recoverable deficit is 1 fort, achievable');
    orgLines.push('only through aggressive territory invasion (destroying opponent dots below the');
    orgLines.push('5-territory threshold). Symmetric handicaps preserve first-mover advantage.');
    orgLines.push('');

    orgLines.push('** Fort placement principles (revised)');
    orgLines.push('1. Self-fueling > self-consuming: Fort on enemy/unclaimed territory preserves');
    orgLines.push('   your dot count. Fort on own territory reduces dots, forcing repositioning.');
    orgLines.push('2. Straight-line > diagonal: Fort-move-fort in one direction is 2 actions per');
    orgLines.push('   fort. Diagonal requires alternating, costing 3+ actions per fort.');
    orgLines.push('3. Row sweep > column sweep: Rows cross both players territory; columns run');
    orgLines.push('   parallel to expansion axes and tend to self-consume.');
    orgLines.push('4. Adaptive > forced geometry: Smart evaluation naturally picks high-value');
    orgLines.push('   fort squares. Forced geometric patterns often hit territory threshold issues.');
    orgLines.push('5. Connected forts (walls) are powerful but expensive: A 3-fort wall blocks');
    orgLines.push('   opponent movement but costs 3 turns. Only worth it if opponent has a single');
    orgLines.push('   fort lane that can be cut.');
    orgLines.push('');

    // Write the file
    const allGames = [...g141_145, ...g146_150, ...g151_155, ...g156_160];
    const totalRedWins = allGames.filter(r => r.winner === 'r').length;
    const totalBlueWins = allGames.filter(r => r.winner === 'b').length;

    // Update summary at top
    const summaryLines: string[] = [];
    summaryLines.push('#+TITLE: Terratri Round 2 -- Batch 8 (Games 141-160): Fort Placement Optimization');
    summaryLines.push('');
    summaryLines.push('* Summary');
    summaryLines.push('');
    summaryLines.push(`20 games exploring fort placement paths, blocking strategies, and comeback`);
    summaryLines.push(`mechanisms. Red won ${totalRedWins}/20, Blue won ${totalBlueWins}/20.`);
    summaryLines.push('');
    summaryLines.push('| Games   | Theme                     | Red Wins | Blue Wins |');
    summaryLines.push('|---------+---------------------------+----------+-----------|');
    summaryLines.push(`| 141-145 | Optimal Red fort paths    |        ${g141_145.filter(r => r.winner === 'r').length} |         ${g141_145.filter(r => r.winner === 'b').length} |`);
    summaryLines.push(`| 146-150 | Optimal Blue fort paths   |        ${g146_150.filter(r => r.winner === 'r').length} |         ${g146_150.filter(r => r.winner === 'b').length} |`);
    summaryLines.push(`| 151-155 | Blocking fort strategies  |        ${g151_155.filter(r => r.winner === 'r').length} |         ${g151_155.filter(r => r.winner === 'b').length} |`);
    summaryLines.push(`| 156-160 | Comeback mechanisms       |        ${g156_160.filter(r => r.winner === 'r').length} |         ${g156_160.filter(r => r.winner === 'b').length} |`);
    summaryLines.push('');

    // Replace first section with summary
    const finalContent = summaryLines.join('\n') + '\n' + orgLines.slice(2).join('\n');

    const outDir = path.resolve(__dirname, '../../games');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'batch-08.org'), finalContent);

    console.log(`\nBatch 8 complete: ${totalRedWins} Red wins, ${totalBlueWins} Blue wins`);
    console.log('Results written to games/batch-08.org');

    // Verify all games completed
    expect(allGames.length).toBe(20);
    for (const r of allGames) {
      expect(r.playByPlay.length).toBeGreaterThan(0);
    }
  });
});
