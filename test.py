import unittest
import terratri

class TerratriTest(unittest.TestCase):

    def test_whoseTurn(self):
        for steps, expect in [
            ('',      'r'),
            ('n',     'r'),
            ('nn',    'b'),
            ('nnS',   'b'),
            ('nnSS',  'r')
        ]:
            self.assertEquals(expect, terratri.whoseTurn(steps))

    def test_toGrid(self):
        self.assertEquals(
            [[' ', ' ', '_', '_', ' '],
             [' ', ' ', 'b', 'B', ' '],
             [' ', 'r', ' ', ' ', ' '],
             [' ', '.', ' ', ' ', ' '],
             [' ', 'R', '.', ' ', ' ']],
            terratri.boardToGrid(
                '  __ '
                '  bB '
                ' r   '
                ' .   '
                ' R.  '))

    def test_toBoard(self):
        self.assertEquals((
            '  __ '
            '  bB '
            ' r   '
            ' .   '
            ' R.  '),
            terratri.gridToBoard(
                [[' ', ' ', '_', '_', ' '],
                 [' ', ' ', 'b', 'B', ' '],
                 [' ', 'r', ' ', ' ', ' '],
                 [' ', '.', ' ', ' ', ' '],
                 [' ', 'R', '.', ' ', ' ']]))

    def test_findPawn(self):
        start = terratri.startGrid()
        self.assertEquals((2, 0, False), terratri.findPawn('b', start))
        self.assertEquals((2, 4, False), terratri.findPawn('r', start))

    def test_after(self):
        # This isn't a valid sequence of moves, but it tests
        # out the board manipulation functions.
        self.assertEquals(
            terratri.boardToGrid(
             '  _B '
             '   L '
             '  Rr '
             '  .  '
             '  .  '),
            terratri.after('nnEFfeSF'))

    def test_validSteps(self):
        self.assertEquals(
            {'n':'c2', 'e':'d1', 'w':'b1'},
            terratri.validSteps('r', terratri.startGrid(), ''))

        # after an inital move of n, red changed the board, so can return south
        self.assertEquals(
            {'n':'c3', 'e':'d2', 'w':'b2', 's':'c1', 'x':'end'},
            terratri.validSteps('r', terratri.after('n'), 'n'))

        # after 1. ns:
        self.assertEquals(
            {'S':'c4', 'E':'d5', 'W':'b5'},
            terratri.validSteps('b', terratri.after('ns'), 'ns'))

        # after 1. ns .. SN, red's choices are the same as on the first move
        self.assertEquals(
            {'n':'c2', 'e':'d1', 'w':'b1'},
            terratri.validSteps('r', terratri.after('nsSN'), 'nsSN'))

        # but if 2. n, red cannot return south as it leaves the board unchanged
        self.assertEquals(
            {'n':'c3', 'e':'d2', 'w':'b2', 'x':'end'},
            terratri.validSteps('r', terratri.after('nsSNn'), 'nsSNn'))


    def test_chunkSteps(self):
        self.assertEquals(
            [],
            terratri.niceHistory(''))
        self.assertEquals(
            ['n'],
            terratri.niceHistory('n'))
        self.assertEquals(
            ['nx SW','en'],
            terratri.niceHistory('nxSWen'))
        self.assertEquals(
            ['nx SW','en S'],
            terratri.niceHistory('nxSWenS'))
        self.assertEquals(
            ['nx SW','en SE', 'e'],
            terratri.niceHistory('nxSWenSEe'))


if __name__=="__main__":
    unittest.main()
