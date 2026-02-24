/**
 * <fort-tray> web component
 * Shows remaining forts for a side.
 * Attributes: side ("home" | "away"), board, playing-as
 */

export class FortTray extends HTMLElement {
  private _side: 'home' | 'away' = 'home';
  private _board = '                         ';
  private _playingAs = 'r';

  static get observedAttributes() {
    return ['side', 'board', 'playing-as'];
  }

  attributeChangedCallback(name: string, _old: string, val: string) {
    switch (name) {
      case 'side': this._side = val as 'home' | 'away'; break;
      case 'board': this._board = val; break;
      case 'playing-as': this._playingAs = val; break;
    }
    this.render();
  }

  update(state: { board: string; playingAs: string }) {
    this._board = state.board;
    this._playingAs = state.playingAs;
    this.render();
  }

  connectedCallback() {
    this._side = (this.getAttribute('side') as 'home' | 'away') || 'home';
    this.render();
  }

  private render() {
    // Count placed forts
    let redForts = 0, blueForts = 0;
    for (const ch of this._board) {
      if (ch === 'R' || ch === 'E') redForts++;
      if (ch === 'B' || ch === 'L') blueForts++;
    }
    const redRemaining = 5 - redForts;
    const blueRemaining = 5 - blueForts;

    const fortIcons = (src: string, count: number) => {
      let html = '';
      for (let i = 0; i < count; i++) {
        html += `<img class="fort-indicator" src="/images/${src}.png"/>`;
      }
      return html;
    };

    const redBankLabel = '<div class="bank-label" style="background:#e08040">BANK</div>';
    const blueBankLabel = '<div class="bank-label" style="background:#4070c0">BANK</div>';
    const redBankFlip = '<div class="bank-label flipped" style="background:#e08040">BANK</div>';
    const blueBankFlip = '<div class="bank-label flipped" style="background:#4070c0">BANK</div>';
    const spacer = '<div class="fort-spacer"></div>';

    let html = '';
    if (this._playingAs === 'r') {
      if (this._side === 'home') {
        // left tray: blue's banked forts (flipped) + red supply
        html = blueBankFlip + fortIcons('bft', blueForts) + spacer + fortIcons('rft', redRemaining);
      } else {
        // right tray: blue supply + red's banked forts
        html = redBankLabel + fortIcons('bft', blueRemaining) + spacer + fortIcons('rft', redForts);
      }
    } else {
      if (this._side === 'home') {
        // left tray: red's banked forts (flipped) + blue supply
        html = redBankFlip + fortIcons('rft', redForts) + spacer + fortIcons('bft', blueRemaining);
      } else {
        // right tray: red supply + blue's banked forts
        html = blueBankLabel + fortIcons('rft', redRemaining) + spacer + fortIcons('bft', blueForts);
      }
    }

    this.innerHTML = html;
  }
}

customElements.define('fort-tray', FortTray);
