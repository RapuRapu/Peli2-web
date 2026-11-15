export function createHud() {
  const root = document.createElement('div');
  root.id = 'hud';
  root.innerHTML = `
    <div class="compass">
      <svg viewBox="-50 -50 100 100" aria-hidden="true">
        <circle r="44" class="dial"/>
        <g class="wind-arrow"><path d="M -30 0 L 22 0 M 10 -12 L 26 0 L 10 12" /></g>
      </svg>
      <div class="readout"><span class="speed">0.0</span> kn</div>
    </div>
    <div class="status"></div>
    <div class="hint"><span>Kosketa merta: purjehdi sinne</span> · <span>Pidä pohjassa: ohjaa</span> · <span>Nipistä: zoomaa</span></div>
  `;
  document.body.appendChild(root);
  const windArrow = root.querySelector('.wind-arrow');
  const speedText = root.querySelector('.speed');
  const status = root.querySelector('.status');
  const hint = root.querySelector('.hint');
  let lastSpeedText = '';
  let lastStatus = '';

  function update({ speedKnots, windScreenAngle, aground, showHint, efficiencyAngle }) {
    windArrow.setAttribute('transform', `rotate(${(windScreenAngle * 180) / Math.PI})`);
    const nextSpeedText = speedKnots.toFixed(1);
    if (nextSpeedText !== lastSpeedText) {
      speedText.textContent = nextSpeedText;
      lastSpeedText = nextSpeedText;
    }
    const nextStatus = aground ? 'Karilla!' : efficiencyAngle < 0.56 ? 'Vastatuuleen – käänny' : '';
    if (nextStatus !== lastStatus) {
      status.textContent = nextStatus;
      status.classList.toggle('visible', nextStatus !== '');
      lastStatus = nextStatus;
    }
    hint.classList.toggle('hidden', !showHint);
  }

  function setVisible(visible) {
    root.style.display = visible ? '' : 'none';
  }

  return { update, setVisible };
}
