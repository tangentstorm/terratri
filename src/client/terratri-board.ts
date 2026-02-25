/**
 * <terratri-board> web component
 * Renders the 5x5 grid with piece sprites and move icons.
 * Emits a 'step' CustomEvent when a move icon is clicked.
 */

const cols = 'abcde';
const kCols = '54321';

/** Map step code to image + arrow direction for red (board not flipped) */
const stepImgRed: Record<string, string> = {
  n: 'U', s: 'D', e: 'R', w: 'L', f: 'F', x: 'end', k: 'bank',
};

/** Map step code to image + arrow direction for blue (board is flipped) */
const stepImgBlue: Record<string, string> = {
  N: 'D', S: 'U', E: 'L', W: 'R', F: 'F', X: 'end', K: 'bank',
};

function spriteHtml(board: string, x: number, y: number): string {
  // board is indexed top-to-bottom, but grid coords are (col, row-from-bottom)
  // The old code used: board[(4-y)*5 + x] where y is row index from bottom
  // We receive (x, y) where x=col, y=row-from-top in grid order
  const ch = board[y * 5 + x];
  switch (ch) {
    case '.': return img('rsq');
    case 'r': return img('rsq') + img('rpn', 'pn');
    case 'R': return img('rsq') + img('rft', 'ft');
    case 'E': return img('rsq') + img('rft', 'ft') + img('rpf', 'pn');
    case '_': return img('bsq');
    case 'b': return img('bsq') + img('bpn', 'pn');
    case 'B': return img('bsq') + img('bft', 'ft');
    case 'L': return img('bsq') + img('bft', 'ft') + img('bpf', 'pn');
    default:  return '';
  }
}

function img(name: string, cls = 'sq'): string {
  return `<img class="${cls}" src="/images/${name}.png"/>`;
}

function stepImg(name: string): string {
  return `<img class="step" src="/images/${name}.png"/>`;
}

export class TerratriBoard extends HTMLElement {
  private _board = '                         ';
  private _playingAs = 'r';
  private _whoseTurn = '';
  private _validSteps: Record<string, string> = {};
  private _winner: string | null = null;

  static get observedAttributes() {
    return ['board', 'playing-as', 'whose-turn', 'valid-steps', 'winner'];
  }

  attributeChangedCallback(name: string, _old: string, val: string) {
    switch (name) {
      case 'board': this._board = val; break;
      case 'playing-as': this._playingAs = val; break;
      case 'whose-turn': this._whoseTurn = val; break;
      case 'valid-steps': this._validSteps = val ? JSON.parse(val) : {}; break;
      case 'winner': this._winner = val || null; break;
    }
    this.render();
  }

  /** Returns the end-turn step code if available, or null */
  get endStep(): { stepCode: string; imgFile: string } | null {
    const myTurn = this._playingAs === this._whoseTurn && !this._winner;
    if (!myTurn) return null;
    const imgMap = this._playingAs === 'r' ? stepImgRed : stepImgBlue;
    for (const [stepCode, squareName] of Object.entries(this._validSteps)) {
      if (squareName === 'end') {
        return { stepCode, imgFile: imgMap[stepCode] };
      }
    }
    return null;
  }

  /** Returns the bank step code if available, or null */
  get bankStep(): { stepCode: string; imgFile: string } | null {
    const myTurn = this._playingAs === this._whoseTurn && !this._winner;
    if (!myTurn) return null;
    const imgMap = this._playingAs === 'r' ? stepImgRed : stepImgBlue;
    for (const [stepCode, squareName] of Object.entries(this._validSteps)) {
      if (squareName === 'bank') {
        return { stepCode, imgFile: imgMap[stepCode] };
      }
    }
    return null;
  }

  update(state: {
    board: string;
    playingAs: string;
    whoseTurn: string;
    validSteps: Record<string, string>;
    winner: string | null;
  }) {
    this._board = state.board;
    this._playingAs = state.playingAs;
    this._whoseTurn = state.whoseTurn;
    this._validSteps = state.validSteps;
    this._winner = state.winner;
    this.render();
  }

  connectedCallback() {
    this.render();
  }

  private render() {
    const flipped = this._playingAs === 'b';
    const colOrder = flipped ? 'edcba' : 'abcde';
    const rowOrder = flipped ? [1, 2, 3, 4, 5] : [5, 4, 3, 2, 1];

    // Determine header labels based on orientation
    const topLabel = flipped ? 'S' : 'N';
    const bottomLabel = flipped ? 'N' : 'S';
    const leftLabel = flipped ? 'W' : 'W';
    const rightLabel = flipped ? 'E' : 'E';
    const topClass = flipped ? 'red-home' : 'blue-home';
    const bottomClass = flipped ? 'blue-home' : 'red-home';

    // Build step lookup: squareName -> {stepCode, imgName}
    const stepLookup = new Map<string, { stepCode: string; imgFile: string }>();
    const myTurn = this._playingAs === this._whoseTurn && !this._winner;

    if (myTurn) {
      const imgMap = this._playingAs === 'r' ? stepImgRed : stepImgBlue;
      for (const [stepCode, squareName] of Object.entries(this._validSteps)) {
        const imgFile = imgMap[stepCode];
        if (imgFile) {
          stepLookup.set(squareName, { stepCode, imgFile });
        }
      }
    }

    // Build table HTML
    let html = '<table>';

    // Top header row
    html += '<tr><th>&nbsp;</th>';
    for (const c of colOrder) {
      const isCenter = c === 'c';
      if (isCenter) {
        html += `<th class="col ${topClass}"><strong>${topLabel}</strong></th>`;
      } else {
        html += `<th class="col">${c}</th>`;
      }
    }
    html += '<th>&nbsp;</th></tr>';

    // Board rows
    for (const rowNum of rowOrder) {
      const y = 5 - rowNum; // convert 1-based row to 0-based grid y

      // Determine if this is the middle row (row 3)
      const isMiddleRow = rowNum === 3;
      const leftLbl = isMiddleRow ? `<strong>${flipped ? 'E' : 'W'}</strong>` : String(rowNum);
      const rightLbl = isMiddleRow ? `<strong>${flipped ? 'W' : 'E'}</strong>` : String(rowNum);

      html += `<tr><th class="row">${leftLbl}</th>`;
      for (const c of colOrder) {
        const x = cols.indexOf(c);
        const squareName = c + String(rowNum);
        const sprites = spriteHtml(this._board, x, y);
        let stepHtml = '';
        const stepInfo = stepLookup.get(squareName);
        if (stepInfo) {
          stepHtml = `<img class="step" data-step="${stepInfo.stepCode}" src="/images/${stepInfo.imgFile}.png"/>`;
        }
        html += `<td><div class="cell" id="${squareName}">${sprites}${stepHtml}</div></td>`;
      }
      html += `<th class="row">${rightLbl}</th></tr>`;
    }

    // Bottom header row
    html += '<tr><th>&nbsp;</th>';
    for (const c of colOrder) {
      const isCenter = c === 'c';
      if (isCenter) {
        html += `<th class="col ${bottomClass}"><strong>${bottomLabel}</strong></th>`;
      } else {
        html += `<th class="col">${c}</th>`;
      }
    }
    html += '<th>&nbsp;</th></tr>';

    html += '</table>';

    this.innerHTML = html;

    // Attach click handlers
    this.querySelectorAll('img.step').forEach(el => {
      el.addEventListener('click', () => {
        const step = (el as HTMLElement).dataset['step'];
        if (step) {
          this.dispatchEvent(new CustomEvent('step', { detail: step, bubbles: true }));
        }
      });
    });
  }
}

customElements.define('terratri-board', TerratriBoard);
