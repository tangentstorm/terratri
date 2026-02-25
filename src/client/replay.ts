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

// Precompute per-letter step positions for the full history.
const fullGame = new Game(fullSteps);
const fullHistory = fullGame.history;
const turns = fullSteps.split('|').filter(s => s.length > 0);

interface StepLetter { char: string; stepPos: number }
interface HistoryEntry { index: number; entryStart: number; red: StepLetter[]; blue: StepLetter[] }
const entries: HistoryEntry[] = [];
let cumulative = 0;
for (let i = 0; i < fullHistory.length; i++) {
  const redTurn = turns[2 * i] || '';
  const blueTurn = turns[2 * i + 1] || '';
  const entryStart = cumulative;
  const red: StepLetter[] = [];
  for (const ch of redTurn) {
    cumulative++;
    red.push({ char: ch, stepPos: cumulative });
  }
  const blue: StepLetter[] = [];
  for (const ch of blueTurn) {
    cumulative++;
    blue.push({ char: ch, stepPos: cumulative });
  }
  entries.push({ index: i, entryStart, red, blue });
}

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

  // History — always show full history, fade future letters
  if (entries.length > 0) {
    historyBox.style.display = 'block';

    function letterSpan(sl: StepLetter): string {
      const cls = n >= sl.stepPos ? 'history-step' : 'history-step history-future';
      return `<span class="${cls}" data-step="${sl.stepPos}">${sl.char}</span>`;
    }

    historySpan.innerHTML = entries
      .map(e => {
        const numCls = n > e.entryStart ? '' : ' history-future';
        let html = `<strong class="${numCls}">${e.index + 1}.</strong> `;
        html += e.red.map(letterSpan).join('');
        if (e.blue.length) html += ' ' + e.blue.map(letterSpan).join('');
        return html;
      })
      .join(' ');

    historySpan.querySelectorAll('.history-step').forEach(el => {
      el.addEventListener('click', () => {
        renderAt(Number((el as HTMLElement).dataset['step']));
      });
    });
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
