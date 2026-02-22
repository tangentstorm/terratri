#!/usr/bin/env python3
"""
Terratri Online — modernized from the 2011 GAE version.

Replaces:
  - GAE webapp     → Flask
  - GAE Channel API → Flask-SocketIO (WebSockets)
  - GAE Datastore   → in-memory dict (swap for SQLite/Firestore if needed)
  - GAE Users API   → cookie-based player ID (swap for OAuth if needed)
"""
import os, json, uuid
from flask import Flask, render_template, request, redirect, session, url_for
from flask_socketio import SocketIO, emit, join_room
import terratri

app = Flask(__name__, static_folder='assets', static_url_path='/assets')
app.secret_key = os.environ.get('SECRET_KEY', 'terratri-dev-key-change-in-prod')
socketio = SocketIO(app)

# ---------------------------------------------------------------------------
# Game storage (in-memory; swap for a database if you need persistence)
# ---------------------------------------------------------------------------
games = {}

class Game:
    def __init__(self, key, red_player):
        self.key = key
        self.red_player = red_player
        self.blu_player = None
        self.board = terratri.kStartBoard
        self.whose_turn = 'r'
        self.steps = ''
        self.winner = None
        self.winning_board = None

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def get_player_id():
    if 'player_id' not in session:
        session['player_id'] = str(uuid.uuid4())
    return session['player_id']

def make_message(game, playing_as='r'):
    grid = terratri.boardToGrid(game.board)
    valid = {}
    if game.whose_turn and not game.winner:
        valid = terratri.validSteps(game.whose_turn, grid, game.steps)
    return {
        'board': game.board,
        'redPlayer': game.red_player,
        'bluPlayer': game.blu_player or '',
        'whoseTurn': game.whose_turn,
        'winner': game.winner,
        'winningBoard': game.winning_board,
        'history': terratri.niceHistory(game.steps),
        'validSteps': valid,
        'playingAs': playing_as,
    }

def send_update(game):
    msg = make_message(game, 'r')
    socketio.emit('update', msg, room=game.red_player + ':' + game.key)
    if game.blu_player:
        msg = make_message(game, 'b')
        socketio.emit('update', msg, room=game.blu_player + ':' + game.key)

# ---------------------------------------------------------------------------
# HTTP routes
# ---------------------------------------------------------------------------
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/play')
def play():
    player_id = get_player_id()
    game_key = request.args.get('g')

    if not game_key:
        game_key = player_id
        games[game_key] = Game(game_key, player_id)
        return redirect(url_for('play', g=game_key))

    game = games.get(game_key)
    if not game:
        return "No such game", 404

    if not game.blu_player and game.red_player != player_id:
        game.blu_player = player_id

    playing_as = 'r' if player_id == game.red_player else 'b'
    game_link = request.host_url.rstrip('/') + '/play?g=' + game_key

    return render_template('play.html',
        cols='abcde' if playing_as == 'r' else 'edcba',
        rows=list(reversed(range(1, 6))) if playing_as == 'r' else list(range(1, 6)),
        gameKey=game_key,
        playingAs=playing_as,
        gameLink=game_link,
    )

# ---------------------------------------------------------------------------
# WebSocket events (replaces GAE Channel API)
# ---------------------------------------------------------------------------
@socketio.on('join')
def on_join(data):
    player_id = get_player_id()
    game_key = data.get('gameKey')
    room = player_id + ':' + game_key
    join_room(room)
    game = games.get(game_key)
    if game:
        send_update(game)

@socketio.on('move')
def on_move(data):
    player_id = get_player_id()
    game_key = data.get('gameKey')
    step = data.get('step')
    game = games.get(game_key)
    if not game or not step:
        return
    # verify it's this player's turn
    if game.whose_turn == 'r' and player_id != game.red_player:
        return
    if game.whose_turn == 'b' and player_id != game.blu_player:
        return
    game.steps += step
    grid = terratri.after(game.steps)
    game.board = terratri.gridToBoard(grid)
    game.winner = terratri.winner(grid)
    game.whose_turn = '' if game.winner else terratri.whoseTurn(game.steps)
    send_update(game)

# ---------------------------------------------------------------------------
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5050))
    socketio.run(app, host='0.0.0.0', port=port, debug=True)
