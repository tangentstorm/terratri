/**
 * Game page entry — connects WebSocket, manages state,
 * updates <terratri-board> and <fort-tray> components.
 */
import './style.css';
import './inject-rules.js';
import './terratri-board.js';
import './fort-tray.js';
import type { GameMessage, WsMessage } from '../shared/types.js';
import type { TerratriBoard } from './terratri-board.js';
import type { FortTray } from './fort-tray.js';

const board = document.querySelector('terratri-board') as TerratriBoard;
const homeForts = document.getElementById('home-forts') as FortTray;
const awayForts = document.getElementById('away-forts') as FortTray;

const msgOther = document.getElementById('other-player')!;
const msgYourMove = document.getElementById('your-move')!;
const msgTheirMove = document.getElementById('their-move')!;
const msgWon = document.getElementById('you-won')!;
const msgLost = document.getElementById('you-lost')!;
const historyBox = document.getElementById('historyBox')!;
const historySpan = document.getElementById('history')!;
const endDiv = document.getElementById('end')!;

let ws: WebSocket;
let gameKey: string;

function hideAllMessages() {
  msgOther.style.display = 'none';
  msgYourMove.style.display = 'none';
  msgTheirMove.style.display = 'none';
  msgWon.style.display = 'none';
  msgLost.style.display = 'none';
  historyBox.style.display = 'none';
}

function onUpdate(data: GameMessage) {
  hideAllMessages();

  // Update board component
  board.update({
    board: data.board,
    playingAs: data.playingAs,
    whoseTurn: data.whoseTurn,
    validSteps: data.validSteps,
    winner: data.winner,
  });

  // Update end-turn and bank buttons (outside the board flex area)
  endDiv.innerHTML = '';
  const endInfo = board.endStep;
  if (endInfo) {
    const img = document.createElement('img');
    img.className = 'step';
    img.src = `/images/${endInfo.imgFile}.png`;
    img.addEventListener('click', () => sendStep(endInfo.stepCode));
    endDiv.appendChild(img);
  }
  const bankInfo = board.bankStep;
  if (bankInfo) {
    const img = document.createElement('img');
    img.className = 'step';
    img.src = `/images/${bankInfo.imgFile}.png`;
    img.addEventListener('click', () => sendStep(bankInfo.stepCode));
    endDiv.appendChild(img);
  }

  // Update fort trays
  const trayState = {
    playingAs: data.playingAs,
    redBanked: data.redBanked,
    blueBanked: data.blueBanked,
    redSupply: data.redSupply,
    blueSupply: data.blueSupply,
  };
  homeForts.update(trayState);
  awayForts.update(trayState);

  // Show history
  if (data.history.length > 0) {
    historyBox.style.display = 'block';
    historySpan.innerHTML = data.history
      .map((h, i) => `<strong>${i + 1}.</strong> ${h}`)
      .join(' ');
  }

  // Update replay link
  const replayLink = document.getElementById('replay-link') as HTMLAnchorElement;
  if (data.steps) {
    replayLink.href = `${location.origin}/replay.html?steps=${encodeURIComponent(data.steps)}`;
    replayLink.style.display = '';
  } else {
    replayLink.style.display = 'none';
  }

  // Show appropriate message
  if (!data.bluPlayer) {
    msgOther.style.display = 'block';
  } else if (data.winner) {
    if (data.playingAs === data.winner) {
      msgWon.style.display = 'block';
    } else {
      msgLost.style.display = 'block';
    }
  } else {
    if (data.playingAs === data.whoseTurn) {
      msgYourMove.style.display = 'block';
    } else {
      msgTheirMove.style.display = 'block';
    }
  }
}

function connectWs() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${proto}//${location.host}/ws`);

  ws.addEventListener('open', () => {
    const msg: WsMessage = { type: 'join', data: { gameKey } };
    ws.send(JSON.stringify(msg));
  });

  ws.addEventListener('message', (ev) => {
    const msg: WsMessage = JSON.parse(ev.data);
    if (msg.type === 'update') {
      onUpdate(msg.data as GameMessage);
    }
  });

  ws.addEventListener('close', () => {
    // Reconnect after a delay
    setTimeout(connectWs, 2000);
  });
}

function sendStep(step: string) {
  const msg: WsMessage = { type: 'move', data: { gameKey, step } };
  ws.send(JSON.stringify(msg));
}

// Listen for step events from the board
board.addEventListener('step', ((e: CustomEvent) => {
  sendStep(e.detail);
}) as EventListener);

// ---------------------------------------------------------------------------
// Init: create or join game
// ---------------------------------------------------------------------------
async function init() {
  const params = new URLSearchParams(location.search);
  const g = params.get('g');

  const gameLink = document.getElementById('game-link-a') as HTMLAnchorElement;
  const thisGameLink = document.getElementById('this-game-link-a') as HTMLAnchorElement;

  if (!g) {
    // Create a new game
    const res = await fetch('/api/games', { method: 'POST' });
    const data = await res.json();
    gameKey = data.gameKey;
    // Redirect to include game key in URL
    location.search = `?g=${gameKey}`;
    return;
  }

  gameKey = g;

  // Join the game
  const res = await fetch(`/api/games/${gameKey}/join`, { method: 'POST' });
  if (!res.ok) {
    document.querySelector('.content')!.innerHTML =
      'No such game. <a href="/">Back to home.</a>';
    return;
  }

  // Set up game link
  const link = `${location.origin}/play.html?g=${gameKey}`;
  gameLink.href = link;
  gameLink.textContent = link;
  thisGameLink.href = link;
  thisGameLink.textContent = link;

  connectWs();
}

init();
