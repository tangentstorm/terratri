"""
the rules of terratri
=====================

step notation
-------------
We represent the history as a string of 2 chars (steps) per move.

    lowercase = red
    uppercase = blue

    'n','N' = north
    's','S' = south
    'e','E' = east
    'w','W' = west
    'f','F' = fort
    'x','X' = pass (second step only)


board notation
--------------

We represent either as a 5 x 5 array (list of lists)
of characters (a "grid"), or as a flattened 25-character
string (a "board").

In both cases, the characters are:

   ' '= unclaimed square

   '.' = red square
   'r' = red pawn
   'R' = red fort
   'E' = red fort + red pawn

   '_' = blue square
   'b' = blue pawn
   'B' = blue fort
   'L' = blue fort + blue pawn


"""
import string

kStartBoard =\
    ( '  b  '
      '     '
      '     '
      '     '
      '  r  ' )

# board string -> grid
def boardToGrid(board):
    rows = [board[off*5:off*5+5] for off in range(5)]
    return [list(row) for row in rows]

# grid -> board string
def gridToBoard(grid):
    return ''.join(''.join(row) for row in grid)


startGrid = lambda : boardToGrid(kStartBoard)

# steps string -> side char
def whoseTurn(steps):
    stepCount = len(steps)
    turnCount = stepCount / 2
    return 'r' if turnCount % 2 == 0 else 'b'

# side -> grid -> (x, y, hasFort)
def findPawn(pawn, grid):
    fortPawn = 'E' if pawn == 'r' else 'L'
    for y in range(5):
        for x in range(5):
            if grid[y][x] in (pawn, fortPawn):
                return x, y, grid[y][x] == fortPawn

# steps string -> grid
def after(steps):
    grid = startGrid()
    for s in steps:
        if   s == 'n': move('r', 'n', grid)
        elif s == 's': move('r', 's', grid)
        elif s == 'e': move('r', 'e', grid)
        elif s == 'w': move('r', 'w', grid)
        elif s == 'f': fortify('r', grid)
        elif s == 'x': pass
        elif s == 'N': move('b', 'n', grid)
        elif s == 'S': move('b', 's', grid)
        elif s == 'E': move('b', 'e', grid)
        elif s == 'W': move('b', 'w', grid)
        elif s == 'F': fortify('b', grid)
        elif s == 'X': pass
    return grid

# -> (x2, y2)
def relative(dir, x, y):
    if dir == 'n': return x, y - 1
    if dir == 's': return x, y + 1
    if dir == 'e': return x + 1, y
    if dir == 'w': return x - 1, y
    raise ValueError('relative() expected [nsew], got %r' % dir)

def pawnAndFort(pawn):
    return 'E' if pawn == 'r' else 'L'

# edits grid in place
def move(pawn, dir, grid):
    x1, y1, hasFort = findPawn(pawn, grid)
    x2, y2 = relative(dir, x1, y1)

    # move pawn to the new square:
    if grid[y2][x2] == pawn.upper():
        grid[y2][x2] = pawnAndFort(pawn)
    else:
        grid[y2][x2] = pawn

    # repaint the old square:
    if hasFort:
        grid[y1][x1] = pawn.upper()
    else:
        grid[y1][x1] = '.' if pawn == 'r' else '_'


# edits grid in place:
def fortify(pawn, grid):
    x, y, hasFort = findPawn(pawn, grid)
    assert not hasFort, "?? already a fort at (%s,%s)" % (x, y)
    grid[y][x] = pawnAndFort(pawn)


def inBounds(x, y):
    return x in range(5) and y in range(5)

def enemiesOf(side):
    return ['b','B','L'] if side == 'r' else ['r','R','E']


kRows = 'abcde'
kCols = '54321'
# int -> int -> str   ex: (2,4) -> 'c1'
def sq(x, y):
    return kRows[x] + kCols[y]


def squareCount(side, grid):
    count = 0
    want = '.' if side == 'r' else '_'
    for y in range(5):
        for x in range(5):
            if grid[y][x] == want:
                count += 1
    return count

def opposite(dir):
    if dir == 'n': return 's'
    if dir == 's': return 'n'
    if dir == 'e': return 'w'
    if dir == 'w': return 'e'
    return None


def validSteps(side, grid, lastStep):
    res = []
    fixCase = string.lower if side=='r' else string.upper

    secondStep = lastStep.islower() if side == 'r' else lastStep.isupper()
    if secondStep:
        res.append((fixCase('x'), 'end'))


    enemies = enemiesOf(side)
    x, y, hasFort = findPawn(side, grid)
    for step in ['n','s','e','w']:
        x2, y2 = relative(step, x, y)

        # prevent 'pass' turns that leave you on the same square:
        if secondStep and step == opposite(lastStep.lower()):
            continue
        elif inBounds(x2, y2) and grid[y2][x2] not in enemies:
            res.append((fixCase(step), sq(x2,y2)))

    if not hasFort and squareCount(side, grid) >= 5:
        res.append((fixCase('f'), sq(x,y)))

    return dict(res)


# grid -> Maybe side
def winner(grid):
    rCount = 0
    bCount = 0
    for y in range(5):
        for x in range(5):
            if grid[y][x] in ('R','E'): rCount += 1
            if grid[y][x] in ('B','L'): bCount += 1
    if rCount == 5: return 'r'
    if bCount == 5: return 'b'
    return None
