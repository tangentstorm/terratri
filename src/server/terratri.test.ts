import { describe, test, expect } from 'vitest';
import {
  whoseTurn, boardToGrid, gridToBoard, findPawn, after,
  validSteps, niceHistory, startGrid,
} from './terratri.js';

describe('terratri', () => {

  test('whoseTurn', () => {
    const cases: [string, string][] = [
      ['', 'r'],
      ['n', 'r'],
      ['nn', 'b'],
      ['nnS', 'b'],
      ['nnSS', 'r'],
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

  test('after', () => {
    expect(after('nnEFfeSF')).toEqual(boardToGrid(
      '  _B ' +
      '   L ' +
      '  Rr ' +
      '  .  ' +
      '  .  '
    ));
  });

  test('validSteps', () => {
    expect(validSteps('r', startGrid(), '')).toEqual(
      { n: 'c2', e: 'd1', w: 'b1' }
    );

    // after an initial move of n, red changed the board, so can return south
    expect(validSteps('r', after('n'), 'n')).toEqual(
      { n: 'c3', e: 'd2', w: 'b2', s: 'c1', x: 'end' }
    );

    // after 1. ns:
    expect(validSteps('b', after('ns'), 'ns')).toEqual(
      { S: 'c4', E: 'd5', W: 'b5' }
    );

    // after 1. ns .. SN, red's choices are the same as on the first move
    expect(validSteps('r', after('nsSN'), 'nsSN')).toEqual(
      { n: 'c2', e: 'd1', w: 'b1' }
    );

    // but if 2. n, red cannot return south as it leaves the board unchanged
    expect(validSteps('r', after('nsSNn'), 'nsSNn')).toEqual(
      { n: 'c3', e: 'd2', w: 'b2', x: 'end' }
    );
  });

  test('niceHistory', () => {
    expect(niceHistory('')).toEqual([]);
    expect(niceHistory('n')).toEqual(['n']);
    expect(niceHistory('nxSWen')).toEqual(['nx SW', 'en']);
    expect(niceHistory('nxSWenS')).toEqual(['nx SW', 'en S']);
    expect(niceHistory('nxSWenSEe')).toEqual(['nx SW', 'en SE', 'e']);
  });
});
