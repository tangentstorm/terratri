import { describe, test, expect } from 'vitest';
import {
  whoseTurn, boardToGrid, gridToBoard, findPawn, after,
  validSteps, niceHistory, startGrid, bankedMoves, fortSupply,
  isTurnOver, countFortsOnBoard, spentMoves,
} from './terratri.js';

describe('terratri', () => {

  test('whoseTurn uses | delimiters', () => {
    const cases: [string, string][] = [
      ['', 'r'],
      ['n', 'r'],         // mid-turn, still red
      ['ns|', 'b'],       // 1 pipe → blue
      ['ns|S', 'b'],      // mid-turn, still blue
      ['ns|SS|', 'r'],    // 2 pipes → red
    ];
    for (const [steps, expected] of cases) {
      expect(whoseTurn(steps)).toBe(expected);
    }
  });

  test('boardToGrid', () => {
    expect(boardToGrid(
      '  __ ' +
      '  bB ' +
      ' r   ' +
      ' .   ' +
      ' R.  '
    )).toEqual([
      [' ', ' ', '_', '_', ' '],
      [' ', ' ', 'b', 'B', ' '],
      [' ', 'r', ' ', ' ', ' '],
      [' ', '.', ' ', ' ', ' '],
      [' ', 'R', '.', ' ', ' '],
    ]);
  });

  test('gridToBoard', () => {
    expect(gridToBoard([
      [' ', ' ', '_', '_', ' '],
      [' ', ' ', 'b', 'B', ' '],
      [' ', 'r', ' ', ' ', ' '],
      [' ', '.', ' ', ' ', ' '],
      [' ', 'R', '.', ' ', ' '],
    ])).toBe(
      '  __ ' +
      '  bB ' +
      ' r   ' +
      ' .   ' +
      ' R.  '
    );
  });

  test('findPawn', () => {
    const start = startGrid();
    expect(findPawn('b', start)).toEqual({ x: 2, y: 0, hasFort: false });
    expect(findPawn('r', start)).toEqual({ x: 2, y: 4, hasFort: false });
  });

  test('after skips | and k/K', () => {
    // Same game as before, but with | delimiters
    expect(after('nn|EF|fe|SF|')).toEqual(boardToGrid(
      '  _B ' +
      '   L ' +
      '  Rr ' +
      '  .  ' +
      '  .  '
    ));
    // k and K have no board effect
    expect(after('nk|')).toEqual(after('nx|'));
  });

  test('validSteps — first move', () => {
    expect(validSteps('r', startGrid(), '')).toEqual(
      { n: 'c2', e: 'd1', w: 'b1' }
    );
  });

  test('validSteps — second step includes bank option', () => {
    // after red moves north, second step offers directions + end + bank
    expect(validSteps('r', after('n'), 'n')).toEqual(
      { n: 'c3', e: 'd2', w: 'b2', s: 'c1', x: 'end', k: 'bank' }
    );
  });

  test('validSteps — blue first move', () => {
    // after red's turn (ns|), blue's first move
    expect(validSteps('b', after('ns|'), 'ns|')).toEqual(
      { S: 'c4', E: 'd5', W: 'b5' }
    );
  });

  test('validSteps — red second turn', () => {
    // after 1. ns .. SN, red's choices are same as first move
    expect(validSteps('r', after('ns|SN|'), 'ns|SN|')).toEqual(
      { n: 'c2', e: 'd1', w: 'b1' }
    );
  });

  test('validSteps — anti-reversal blocks return to start', () => {
    // 2. n, red cannot return south as it leaves the board unchanged
    expect(validSteps('r', after('ns|SN|n'), 'ns|SN|n')).toEqual(
      { n: 'c3', e: 'd2', w: 'b2', x: 'end', k: 'bank' }
    );
  });

  test('bankedMoves — blue starts with 1', () => {
    expect(bankedMoves('b', '')).toBe(1);
    expect(bankedMoves('r', '')).toBe(0);
  });

  test('bankedMoves — banking increases count', () => {
    // Red banks on turn 1 (nk|)
    expect(bankedMoves('r', 'nk|')).toBe(1);
    // Red banks twice
    expect(bankedMoves('r', 'nk|SN|nk|')).toBe(2);
  });

  test('bankedMoves — blue spending', () => {
    // Blue has 1 bank, spends it on a 3-step turn
    // Red: ns|, Blue: SWN (3rd step costs 1 bank)
    expect(bankedMoves('b', 'ns|SWN|')).toBe(0);
  });

  test('bankedMoves — spending does not happen on pass', () => {
    // Blue uses x at step 2 (free) — bank preserved
    // But first, blue needs to get to step 2: has 1 bank, after step 1
    // blue continues, then passes at step 2
    expect(bankedMoves('b', 'ns|SWX|')).toBe(1);
  });

  test('spentMoves', () => {
    expect(spentMoves('r', '')).toBe(0);
    // Blue spends 1 bonus action (3rd step W in SWN)
    expect(spentMoves('b', 'ns|SWN|')).toBe(1);
    // Pass at step 2 is free, not spent
    expect(spentMoves('b', 'ns|SWX|')).toBe(0);
  });

  test('fortSupply accounts for spent forts', () => {
    // At start: no forts on board, red has 0 banked, 0 spent → supply = 5
    expect(fortSupply('r', startGrid(), '')).toBe(5);
    // Blue has 1 banked → supply = 4
    expect(fortSupply('b', startGrid(), '')).toBe(4);
    // After blue spends 1 (SWN): banked=0, spent=1, on board=0 → supply = 4
    expect(fortSupply('b', after('ns|SWN|'), 'ns|SWN|')).toBe(4);
  });

  test('isTurnOver — basic cases', () => {
    expect(isTurnOver('')).toBe(false);      // no steps
    expect(isTurnOver('n')).toBe(false);      // only 1 step
    expect(isTurnOver('nx')).toBe(true);      // pass ends turn
    expect(isTurnOver('nk')).toBe(true);      // bank ends turn
    expect(isTurnOver('ns')).toBe(true);      // red has 0 bank → turn over
  });

  test('isTurnOver — blue with bank continues', () => {
    // Blue has 1 bank. After 2 steps, turn continues
    expect(isTurnOver('ns|SW')).toBe(false);
    // After 3rd step, bank depleted → turn over
    expect(isTurnOver('ns|SWN')).toBe(true);
  });

  test('isTurnOver — pass during bonus preserves bank', () => {
    // Blue passes at step 2 → turn over (x ends turn)
    expect(isTurnOver('ns|SWX')).toBe(true);
  });

  test('countFortsOnBoard', () => {
    const grid = after('nn|EF|fe|SF|');
    expect(countFortsOnBoard('r', grid)).toBe(1);
    expect(countFortsOnBoard('b', grid)).toBe(2);
  });

  test('validSteps — blue gets bonus actions from starting bank', () => {
    // After red's turn, blue has 1 bank
    // Blue's first step: directions only
    const grid1 = after('ns|');
    const vs1 = validSteps('b', grid1, 'ns|');
    expect(vs1).toEqual({ S: 'c4', E: 'd5', W: 'b5' });

    // Blue's second step: includes end + bank
    const grid2 = after('ns|S');
    const vs2 = validSteps('b', grid2, 'ns|S');
    expect(vs2['X']).toBe('end');

    // After blue's 2nd step (direction, not x/k), turn continues because bank > 0
    // Blue's 3rd step (bonus): directions + end
    const grid3 = after('ns|SW');
    const vs3 = validSteps('b', grid3, 'ns|SW');
    expect(vs3['X']).toBe('end');
    // No bank option at step index >= 2
    expect(vs3['K']).toBeUndefined();
  });

  test('validSteps — anti-reversal during bonus actions', () => {
    // Blue at step index 2 (bonus), moving after SW
    // Last step was W, so E (opposite) should be blocked if it undoes the move
    const grid = after('ns|SW');
    const vs = validSteps('b', grid, 'ns|SW');
    // E would undo W: check after('ns|S') vs after('ns|SWE')
    const beforeW = gridToBoard(after('ns|S'));
    const afterE = gridToBoard(after('ns|SWE'));
    if (beforeW === afterE) {
      expect(vs['E']).toBeUndefined();
    }
  });

  test('validSteps — end turn blocked if board unchanged during bonus', () => {
    // Blue moves S then N (back to start) — anti-reversal should block N
    // But if anti-reversal didn't block it, x should be blocked since board unchanged
    // This tests the end-turn guard at stepIndex >= 2
    // Blue: S, then at step 1 blue goes W (board changes), then at step 2 blue goes E
    // After SWE, if board is same as turn start, x is blocked
    const turnStart = gridToBoard(after('ns|'));
    const afterSWE = gridToBoard(after('ns|SWE'));
    if (turnStart === afterSWE) {
      const grid = after('ns|SWE');
      const vs = validSteps('b', grid, 'ns|SWE');
      expect(vs['X']).toBeUndefined();
    }
  });

  test('niceHistory with | delimiters', () => {
    expect(niceHistory('')).toEqual([]);
    expect(niceHistory('nx|')).toEqual(['nx']);
    expect(niceHistory('nx|SW|')).toEqual(['nx SW']);
    expect(niceHistory('nx|SW|en|')).toEqual(['nx SW', 'en']);
    expect(niceHistory('nx|SW|en|SE|')).toEqual(['nx SW', 'en SE']);
    // Incomplete turns
    expect(niceHistory('nx|SW|en')).toEqual(['nx SW', 'en']);
  });
});
