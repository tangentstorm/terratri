import unittest
import terratri

class TerratriTest(unittest.TestCase):

    def test_whoseTurn(self):
        for steps, expect in [
            ('',      'r'),
            ('n',     'r'),
            ('nn',    'b'),
            ('nnf',   'b'),
            ('nnfs',  'r')
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
        # can't go south after going north because it puts you back in place
        self.assertEquals(
            {'n':'c3', 'e':'d2', 'w':'b2', 'x':'end'},
            terratri.validSteps('r', terratri.after('n'), 'n'))
        self.assertEquals(
            {'S':'c4', 'E':'d5', 'W':'b5'},
            terratri.validSteps('b', terratri.after('nn'), 'nn'))


if __name__=="__main__":
    unittest.main()
