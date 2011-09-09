#!/usr/bin/env python
"""
A simple server for Adam Saltsman's game, Terratri
http://blog.adamatomic.com/making-terratri-a-minimalist-territory-captur

based on the channel tic-tac-toe example for google app engine, from:
http://code.google.com/p/channel-tac-toe/source/browse/trunk/chatactoe.py

"""
import os
from django.utils import simplejson
from google.appengine.api import channel, users
from google.appengine.ext import webapp, db
from google.appengine.ext.webapp import util, template
import terratri

class Game(db.Model):
    """
    All the data we store for a game.
    """
    redPlayer = db.UserProperty()
    bluPlayer = db.UserProperty()
    board = db.StringProperty(default=terratri.kStartBoard)
    whoseTurn = db.StringProperty(default='r')
    steps = db.StringProperty(default='')
    winner = db.StringProperty(default=None)
    winningBoard = db.StringProperty()

    @classmethod
    # webapp.Request -> Game
    def fromRequest(cls, req):
        user = users.get_current_user()
        gameKey = req.get('g')
        if user and gameKey:
            return Game.get_by_key_name(gameKey)


class GameUpdater(object):
    def __init__(self, game):
        self.game = game

    def sendUpdate(self):
        message = self.makeMessage()
        channel.send_message(self.redChannel(),
                             simplejson.dumps(message))
        if self.game.bluPlayer:
            message['playingAs'] = 'b'
            channel.send_message(self.bluChannel(),
                                 simplejson.dumps(message))

    def makeMove(self, move, user):
        # TODO: finish this, check for win, right player, etc...
        self.game.steps += move
        grid = terratri.after(self.game.steps)
        self.game.board = terratri.gridToBoard(grid)
        self.game.winner = terratri.winner(grid)
        self.game.whoseTurn = '' if self.game.winner else terratri.whoseTurn(self.game.steps)
        self.game.put()
        self.sendUpdate()

    def validSteps(self):
        if self.game.whoseTurn:
            grid = terratri.boardToGrid(self.game.board)
            return terratri.validSteps(self.game.whoseTurn, grid,
                                       self.game.steps)
        else:
            return {}

    def makeMessage(self):
        return {
            'board': self.game.board,
            'redPlayer': self.game.redPlayer.user_id(),
            'bluPlayer': self.game.bluPlayer.user_id() if self.game.bluPlayer \
                         else '',
            'whoseTurn' : self.game.whoseTurn,
            'winner': self.game.winner,
            'winningBoard': self.game.winningBoard,
            'history': terratri.niceHistory(self.game.steps),
            'validSteps': self.validSteps(),
            'playingAs': 'r'
        }
    
    def redChannel(self):
        return self.game.redPlayer.user_id() + ':' + self.game.key().id_or_name()

    def bluChannel(self):
        return self.game.bluPlayer.user_id() + ':' + self.game.key().id_or_name()


# str -> bool
def redWins(board):
    return board.count("R") == 5

# str -> bool
def bluWins(board):
    return board.count("B") == 5

class PlayPage(webapp.RequestHandler):
    """
    This page is responsible for showing the game ui.
    It may also create a new game or add the currently
    logged-in user to a game.
    """
    def get(self):
        user = users.get_current_user()
        if not user:
            self.redirect(users.create_login_url(self.request.uri))
            return

        gameKey = self.request.get("g")
        game = None
        if not gameKey:
            # if no game was specified, create a new game and make this user
            gameKey = user.user_id()
            game = Game(key_name = gameKey,
                        redPlayer = user,
                        redsTurn = True,
                        board = terratri.kStartBoard)
            game.put()
        else:
            game = Game.get_by_key_name(gameKey)
            if not game.bluPlayer and game.redPlayer != user:
                # if this game has no blue player, the current player is blue
                game.bluPlayer = user
                game.put()

        if game:
            token = channel.create_channel(user.user_id() + ':' + gameKey)
            template_values = {
                'cols': 'abcde' if user == game.redPlayer \
                                else 'edcba',
                'rows': list(reversed(range(1,6))) if user == game.redPlayer \
                                 else range(1,6),
                'token': token,
                'me': user.user_id(),
                'gameKey': gameKey,
                'gameLink': 'http://' + os.environ['HTTP_HOST'] + '/play?g=' + gameKey,
            }
            self.response.out.write(template.render('templates/play.html',
                                                    template_values))
        else:
            self.response.out.write("no such game")


class MainPage(webapp.RequestHandler):
    def get(self):
        self.response.out.write(template.render('templates/index.html', {}))

class OpenedPage(webapp.RequestHandler):
    """
    The js client posts to here when it opens the channel.
    """
    def post(self, *args):
        game = Game.fromRequest(self.request)
        if game:
            GameUpdater(game).sendUpdate()

class MovePage(webapp.RequestHandler):
    """
    The js client posts here when the user makes their move.
    """
    def post(self, *args):
        game = Game.fromRequest(self.request)
        user = users.get_current_user()
        if game and user:
            move = self.request.get('step')
            GameUpdater(game).makeMove(move, user)

def main():
    application = webapp.WSGIApplication([
        ('/', MainPage),
        ('/play', PlayPage),
        ('/opened', OpenedPage),
        ('/move', MovePage)
    ], debug=True)
    util.run_wsgi_app(application)


if __name__ == '__main__':
    main()
