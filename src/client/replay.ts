/**
 * Replay page entry — reads step history from URL, lets user scrub through game states.
 */
import './style.css';
import './terratri-board.js';
import './fort-tray.js';
import { Game } from '../shared/Game.js';
import type { TerratriBoard } from './terratri-board.js';
import type { FortTray } from './fort-tray.js';

const board = document.querySelector('terratri-board') as TerratriBoard;
const homeForts = document.getElementById('home-forts') as FortTray;
const awayForts = document.getElementById('away-forts') as FortTray;
const slider = document.getElementById('replay-slider') as HTMLInputElement;
const status = document.getElementById('replay-status')!;
const historyBox = document.getElementById('historyBox')!;
const historySpan = document.getElementById('history')!;

const btnStart = document.getElementById('btn-start') as HTMLButtonElement;
const btnPrev = document.getElementById('btn-prev') as HTMLButtonElement;
const btnNext = document.getElementById('btn-next') as HTMLButtonElement;
const btnEnd = document.getElementById('btn-end') as HTMLButtonElement;

// Read steps from URL
const params = new URLSearchParams(location.search);
const fullSteps = params.get('steps') || '';

// Count total atomic steps (non-'|' characters)
const totalSteps = [...fullSteps].filter(c => c !== '|').length;

let current = 0;

function renderAt(n: number) {
  current = n;
  slider.value = String(n);

  const game = Game.atStep(fullSteps, n);

  board.update({
    board: game.board,
    playingAs: 'r',
    whoseTurn: '',
    validSteps: {},
    winner: game.winner,
  });

  const trayState = {
    playingAs: 'r',
    redBanked: game.redBanked,
    blueBanked: game.blueBanked,
    redSupply: game.redSupply,
    blueSupply: game.blueSupply,
  };
  homeForts.update(trayState);
  awayForts.update(trayState);

  // Status line
  const turn = game.whoseTurn;
  const turnLabel = turn === 'r' ? 'Red' : turn === 'b' ? 'Blue' : '';
  if (game.winner) {
    status.textContent = `Move ${n}/${totalSteps} — ${game.winner === 'r' ? 'Red' : 'Blue'} wins!`;
  } else if (turnLabel) {
    status.textContent = `Move ${n}/${totalSteps} — ${turnLabel} to move`;
  } else {
    status.textContent = `Move ${n}/${totalSteps}`;
  }

  // History
  if (game.history.length > 0) {
    historyBox.style.display = 'block';
    historySpan.innerHTML = game.history
      .map((h, i) => `<strong>${i + 1}.</strong> ${h}`)
      .join(' ');
  } else {
    historyBox.style.display = 'none';
  }
}

// Init slider
slider.max = String(totalSteps);
slider.addEventListener('input', () => renderAt(Number(slider.value)));

// Button handlers
btnStart.addEventListener('click', () => renderAt(0));
btnPrev.addEventListener('click', () => renderAt(Math.max(0, current - 1)));
btnNext.addEventListener('click', () => renderAt(Math.min(totalSteps, current + 1)));
btnEnd.addEventListener('click', () => renderAt(totalSteps));

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') renderAt(Math.max(0, current - 1));
  if (e.key === 'ArrowRight') renderAt(Math.min(totalSteps, current + 1));
  if (e.key === 'Home') renderAt(0);
  if (e.key === 'End') renderAt(totalSteps);
});

// Show initial state
if (!fullSteps) {
  status.textContent = 'No steps provided. Use ?steps=... in the URL.';
} else {
  renderAt(0);
}
