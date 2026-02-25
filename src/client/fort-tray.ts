/**
 * <fort-tray> web component
 * Shows remaining forts for a side.
 * Attributes: side ("home" | "away"), board, playing-as
 */

export class FortTray extends HTMLElement {
  private _side: 'home' | 'away' = 'home';
  private _playingAs = 'r';
  private _redBanked = 0;
  private _blueBanked = 0;
  private _redSupply = 5;
  private _blueSupply = 4;

  static get observedAttributes() {
    return ['side', 'playing-as'];
  }

  attributeChangedCallback(name: string, _old: string, val: string) {
    switch (name) {
      case 'side': this._side = val as 'home' | 'away'; break;
      case 'playing-as': this._playingAs = val; break;
    }
    this.render();
  }

  update(state: {
    playingAs: string;
    redBanked: number;
    blueBanked: number;
    redSupply: number;
    blueSupply: number;
  }) {
    this._playingAs = state.playingAs;
    this._redBanked = state.redBanked;
    this._blueBanked = state.blueBanked;
    this._redSupply = state.redSupply;
    this._blueSupply = state.blueSupply;
    this.render();
  }

  connectedCallback() {
    this._side = (this.getAttribute('side') as 'home' | 'away') || 'home';
    this.render();
  }

  private render() {
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
        html = blueBankFlip + fortIcons('bft', this._blueBanked) + spacer + fortIcons('rft', this._redSupply);
      } else {
        // right tray: blue supply + red's banked forts
        html = redBankLabel + fortIcons('bft', this._blueSupply) + spacer + fortIcons('rft', this._redBanked);
      }
    } else {
      if (this._side === 'home') {
        // left tray: red's banked forts (flipped) + blue supply
        html = redBankFlip + fortIcons('rft', this._redBanked) + spacer + fortIcons('bft', this._blueSupply);
      } else {
        // right tray: red supply + blue's banked forts
        html = blueBankLabel + fortIcons('rft', this._redSupply) + spacer + fortIcons('bft', this._blueBanked);
      }
    }

    this.innerHTML = html;
  }
}

customElements.define('fort-tray', FortTray);
