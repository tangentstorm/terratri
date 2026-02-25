import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import * as cookie from 'cookie';
import path from 'path';
import { fileURLToPath } from 'url';
import { Game } from '../shared/Game.js';
import type { Side, GameMessage, WsMessage } from '../shared/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Game storage
// ---------------------------------------------------------------------------
interface Session {
  key: string;
  redPlayer: string;
  bluPlayer: string | null;
  game: Game;
}

const games = new Map<string, Session>();

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

function makeMessage(session: Session, playingAs: Side): GameMessage {
  const g = session.game;
  return {
    board: g.board,
    redPlayer: session.redPlayer,
    bluPlayer: session.bluPlayer || '',
    whoseTurn: g.whoseTurn,
    winner: g.winner,
    history: g.history,
    validSteps: g.validSteps,
    playingAs,
    redBanked: g.redBanked,
    blueBanked: g.blueBanked,
    redSupply: g.redSupply,
    blueSupply: g.blueSupply,
    steps: g.steps,
  };
}

function sendUpdate(session: Session): void {
  // Send to red player
  const redRoom = rooms.get(roomKey(session.redPlayer, session.key));
  if (redRoom) {
    const msg: WsMessage = { type: 'update', data: makeMessage(session, 'r') };
    const payload = JSON.stringify(msg);
    for (const ws of redRoom) {
      if (ws.readyState === WebSocket.OPEN) ws.send(payload);
    }
  }
  // Send to blue player
  if (session.bluPlayer) {
    const bluRoom = rooms.get(roomKey(session.bluPlayer, session.key));
    if (bluRoom) {
      const msg: WsMessage = { type: 'update', data: makeMessage(session, 'b') };
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
  const session: Session = {
    key: gameKey,
    redPlayer: playerId,
    bluPlayer: null,
    game: new Game(),
  };
  games.set(gameKey, session);
  res.json({ gameKey, playingAs: 'r' });
});

app.post('/api/games/:key/join', (req, res) => {
  const playerId = getPlayerId(req, res);
  const session = games.get(req.params.key);
  if (!session) {
    res.status(404).json({ error: 'No such game' });
    return;
  }
  if (!session.bluPlayer && session.redPlayer !== playerId) {
    session.bluPlayer = playerId;
  }
  const playingAs: Side = playerId === session.redPlayer ? 'r' : 'b';
  res.json({ gameKey: session.key, playingAs });
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
      const session = games.get(gameKey);
      if (!session) return;

      const rk = roomKey(playerId, gameKey);
      if (!rooms.has(rk)) rooms.set(rk, new Set());
      rooms.get(rk)!.add(ws);
      joinedRooms.push(rk);

      sendUpdate(session);
    }

    if (msg.type === 'move') {
      const { gameKey, step } = msg.data as { gameKey: string; step: string };
      const session = games.get(gameKey);
      if (!session || !step) return;

      // verify it's this player's turn
      if (session.game.whoseTurn === 'r' && playerId !== session.redPlayer) return;
      if (session.game.whoseTurn === 'b' && playerId !== session.bluPlayer) return;

      session.game = session.game.applyStep(step);

      sendUpdate(session);
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
