import os, json, math
from playwright.sync_api import sync_playwright

URL = 'file://' + os.path.abspath('dist/soundlab.html')

ANALYZE = r'''
async ({ name, seconds, mood }) => {
  const rate = 44100;
  const context = new OfflineAudioContext(2, Math.ceil(rate * seconds), rate);
  const audio = window.__createAudio({ context });
  if (mood) {
    audio.setMusicMood(mood);
    const eighth = 60 / 76 / 2;
    for (let at = 0.05; at < seconds - 2; at += eighth) audio.scheduleMusicBeat(at);
  } else {
    audio.renderSound(name, 0.01);
  }
  const buffer = await context.startRendering();
  let peak = 0, sum = 0, last = 0, count = 0, nonFinite = 0;
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const samples = buffer.getChannelData(channel);
    for (let index = 0; index < samples.length; index++) {
      const value = samples[index];
      if (!Number.isFinite(value)) { nonFinite++; continue; }
      const magnitude = Math.abs(value);
      if (magnitude > peak) peak = magnitude;
      sum += value * value; count++;
      if (magnitude > 0.001) last = Math.max(last, index / rate);
    }
  }
  const toDb = (value) => value > 0 ? 20 * Math.log10(value) : -200;
  return { peakDb: +toDb(peak).toFixed(1), rmsDb: +toDb(Math.sqrt(sum / count)).toFixed(1), audibleSeconds: +last.toFixed(2), nonFinite };
}
'''

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--autoplay-policy=no-user-gesture-required'])
    page = browser.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('console', lambda message: errors.append(message.text[:300]) if message.type == 'error' else None)
    page.goto(URL)
    page.wait_for_function('!!window.__createAudio')
    checks = {}
    names = page.evaluate("() => window.__createAudio({ context: new OfflineAudioContext(1, 44100, 44100) }).soundNames")
    results = {}
    for name in names:
        results[name] = page.evaluate(ANALYZE, {'name': name, 'seconds': 3.5, 'mood': None})
    for mood in ('calm', 'combat', 'gull'):
        results[f'music:{mood}'] = page.evaluate(ANALYZE, {'name': None, 'seconds': 14, 'mood': mood})
    voices = page.evaluate("async () => { const audio = window.__createAudio(); audio.unlock(); let accepted = 0; for (let i = 0; i < 40; i++) if (audio.play('clawSnap')) accepted++; audio.startAmbience(); audio.startMusic(); audio.setAmbience({ waveIntensity: 1, wind: 0.5, underwater: true }); await new Promise(r => setTimeout(r, 800)); audio.stopMusic(); return { accepted, active: audio.activeVoices }; }")
    page.click('button.sound')

    game = browser.new_page(viewport={'width': 915, 'height': 412})
    game.on('pageerror', lambda error: errors.append(str(error)))
    game.goto('file://' + os.path.abspath('dist/index.html') + '?quality=low&dpr=0.5')
    game.wait_for_function('!!window.__debug', timeout=180000)
    before = game.evaluate("() => __debug.isAudioUnlocked()")
    game.mouse.click(600, 300)
    integration = game.evaluate(r'''async () => {
      const d = __debug;
      const played = [];
      const originalPlay = d.audio.play;
      d.audio.play = (name, options) => { played.push(name); return originalPlay(name, options); };
      const spot = d.navigation.nearestWalkable(30, -40, 10);
      Object.assign(d.player, { x: spot.x, z: spot.z });
      d.setDestination(spot.x + 10, spot.z);
      for (let i = 0; i < 120; i++) d.simulate(1 / 60);
      const node = d.resources.nodes.find(n => n.type === 'shellBits' && !n.gathered);
      const near = d.navigation.nearestWalkable(node.x + 3, node.z, 6);
      Object.assign(d.player, { x: near.x, z: near.z });
      d.setDestination(node.x, node.z, node);
      for (let i = 0; i < 300 && !node.gathered; i++) d.simulate(1 / 60);
      const hopper = d.enemies.list.find(e => e.kind === 'sandHopper');
      const fightSpot = d.navigation.nearestWalkable(hopper.x + 2, hopper.z, 6);
      Object.assign(d.player, { x: fightSpot.x, z: fightSpot.z });
      d.engage(hopper);
      for (let i = 0; i < 120; i++) d.simulate(1 / 60);
      d.setPaused(true);
      await new Promise(r => setTimeout(r, 300));
      const pausedState = d.audio.context.state;
      d.setPaused(false);
      await new Promise(r => setTimeout(r, 300));
      return { unlocked: d.isAudioUnlocked(), contextState: d.audio.context.state, pausedState, played: [...new Set(played)], mood: d.audio.musicMood };
    }''')
    game.evaluate("() => __debug.setPaused(true)")
    game.locator('#hud .volume-row input').first.fill('0.2')
    stored = game.evaluate("() => JSON.parse(localStorage.getItem('seaofcrabs-audio'))")
    shots = browser.new_page()
    shots.goto('file://' + os.path.abspath('dist/index.html') + '?pose=1&hud')
    shots.wait_for_function('!!window.__frameReady', timeout=180000)
    screenshot_silent = shots.evaluate("() => __debug.audio === null")
    browser.close()
    expected = {'stepSand', 'gatherShellBits', 'clawSnap', 'hitThud', 'hopperJump'}
    checks['gameIntegration'] = not before and integration['unlocked'] and integration['pausedState'] == 'suspended' and integration['contextState'] == 'running' and expected <= set(integration['played']) and stored['music'] == 0.2 and screenshot_silent
    print(json.dumps({'integration': integration, 'stored': stored, 'screenshotSilent': screenshot_silent}, indent=1))
    checks.update({
        'noClipping': all(r['peakDb'] < -1 for r in results.values()),
        'allAudible': all(r['peakDb'] > -40 for r in results.values()),
        'finite': all(r['nonFinite'] == 0 for r in results.values()),
        'musicPlays': all(results[f'music:{m}']['audibleSeconds'] > 8 for m in ('calm', 'combat', 'gull')),
        'voiceLimit': voices['accepted'] == 16,
        'noErrors': not errors,
    })
    print(json.dumps({'sounds': results, 'voices': voices, 'checks': checks, 'errors': errors[:5]}, indent=1))
    print('ALL PASS' if all(checks.values()) else 'FAILED: ' + str([k for k, v in checks.items() if not v]))
