import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import * as cookie from 'cookie';
import path from 'path';
import { fileURLToPath } from 'url';
import * as terratri from './terratri.js';
import type { Board, Side, GameMessage, WsMessage } from '../shared/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Game storage
// ---------------------------------------------------------------------------
interface Game {
  key: string;
  redPlayer: string;
  bluPlayer: string | null;
  board: Board;
  whoseTurn: Side | '';
  steps: string;
  winner: Side | null;
}

const games = new Map<string, Game>();

// Track WS clients per player+game room
const rooms = new Map<string, Set<WebSocket>>();

function roomKey(playerId: string, gameKey: string): string {
  return playerId + ':' + gameKey;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function getPlayerId(req: express.Request, res: express.Response): string {
  const cookies = cookie.parse(req.headers.cookie || '');
  let id = cookies['player_id'];
  if (!id) {
    id = uuidv4();
    res.cookie('player_id', id, { httpOnly: true, sameSite: 'lax' });
  }
  return id;
}

function getPlayerIdFromCookie(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  const cookies = cookie.parse(cookieHeader);
  return cookies['player_id'] || null;
}

function makeMessage(game: Game, playingAs: Side): GameMessage {
  const grid = terratri.boardToGrid(game.board);
  let valid: Record<string, string> = {};
  if (game.whoseTurn && !game.winner) {
    valid = terratri.validSteps(game.whoseTurn as Side, grid, game.steps);
  }
  return {
    board: game.board,
    redPlayer: game.redPlayer,
    bluPlayer: game.bluPlayer || '',
    whoseTurn: game.whoseTurn,
    winner: game.winner,
    history: terratri.niceHistory(game.steps),
    validSteps: valid,
    playingAs,
    redBanked: terratri.bankedMoves('r', game.steps),
    blueBanked: terratri.bankedMoves('b', game.steps),
    redSupply: terratri.fortSupply('r', grid, game.steps),
    blueSupply: terratri.fortSupply('b', grid, game.steps),
  };
}

function sendUpdate(game: Game): void {
  // Send to red player
  const redRoom = rooms.get(roomKey(game.redPlayer, game.key));
  if (redRoom) {
    const msg: WsMessage = { type: 'update', data: makeMessage(game, 'r') };
    const payload = JSON.stringify(msg);
    for (const ws of redRoom) {
      if (ws.readyState === WebSocket.OPEN) ws.send(payload);
    }
  }
  // Send to blue player
  if (game.bluPlayer) {
    const bluRoom = rooms.get(roomKey(game.bluPlayer, game.key));
    if (bluRoom) {
      const msg: WsMessage = { type: 'update', data: makeMessage(game, 'b') };
      const payload = JSON.stringify(msg);
      for (const ws of bluRoom) {
        if (ws.readyState === WebSocket.OPEN) ws.send(payload);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------
const app = express();
app.use(express.json());

// API routes
app.post('/api/games', (req, res) => {
  const playerId = getPlayerId(req, res);
  const gameKey = uuidv4();
  const game: Game = {
    key: gameKey,
    redPlayer: playerId,
    bluPlayer: null,
    board: terratri.START_BOARD,
    whoseTurn: 'r',
    steps: '',
    winner: null
  };
  games.set(gameKey, game);
  res.json({ gameKey, playingAs: 'r' });
});

app.post('/api/games/:key/join', (req, res) => {
  const playerId = getPlayerId(req, res);
  const game = games.get(req.params.key);
  if (!game) {
    res.status(404).json({ error: 'No such game' });
    return;
  }
  if (!game.bluPlayer && game.redPlayer !== playerId) {
    game.bluPlayer = playerId;
  }
  const playingAs: Side = playerId === game.redPlayer ? 'r' : 'b';
  res.json({ gameKey: game.key, playingAs });
});

// In production, serve Vite build output
const distPath = path.resolve(__dirname, '../../dist');
app.use(express.static(distPath));
// Fallback for SPA-style navigation
app.get('/', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
app.get('/play.html', (_req, res) => res.sendFile(path.join(distPath, 'play.html')));

// ---------------------------------------------------------------------------
// HTTP + WebSocket server
// ---------------------------------------------------------------------------
const server = createServer(app);
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  if (req.url === '/ws') {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  } else {
    socket.destroy();
  }
});

wss.on('connection', (ws, req) => {
  const playerId = getPlayerIdFromCookie(req.headers.cookie);
  if (!playerId) {
    ws.close(4001, 'No player_id cookie');
    return;
  }

  // Track which rooms this socket is in for cleanup
  const joinedRooms: string[] = [];

  ws.on('message', (raw) => {
    let msg: WsMessage;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.type === 'join') {
      const { gameKey } = msg.data as { gameKey: string };
      const game = games.get(gameKey);
      if (!game) return;

      const rk = roomKey(playerId, gameKey);
      if (!rooms.has(rk)) rooms.set(rk, new Set());
      rooms.get(rk)!.add(ws);
      joinedRooms.push(rk);

      sendUpdate(game);
    }

    if (msg.type === 'move') {
      const { gameKey, step } = msg.data as { gameKey: string; step: string };
      const game = games.get(gameKey);
      if (!game || !step) return;

      // verify it's this player's turn
      if (game.whoseTurn === 'r' && playerId !== game.redPlayer) return;
      if (game.whoseTurn === 'b' && playerId !== game.bluPlayer) return;

      game.steps += step;
      if (terratri.isTurnOver(game.steps)) {
        game.steps += '|';
      }
      const grid = terratri.after(game.steps);
      game.board = terratri.gridToBoard(grid);
      game.winner = terratri.winner(grid);
      game.whoseTurn = game.winner ? '' : terratri.whoseTurn(game.steps);

      sendUpdate(game);
    }
  });

  ws.on('close', () => {
    for (const rk of joinedRooms) {
      const set = rooms.get(rk);
      if (set) {
        set.delete(ws);
        if (set.size === 0) rooms.delete(rk);
      }
    }
  });
});

const port = parseInt(process.env['PORT'] || '5050', 10);
server.listen(port, () => {
  console.log(`Terratri server listening on http://localhost:${port}`);
});
