import os, json, sys
from playwright.sync_api import sync_playwright

URL = 'file://' + os.path.abspath('dist/index.html') + '?quality=low&dpr=0.5&norender' + os.environ.get('CRAB_QUERY', '')

FLOW = r'''
() => {
  const d = window.__debug;
  const out = {};
  const step = (seconds, until) => { let t = 0; for (; t < seconds; t += 1/60) { d.simulate(1/60); if (until && until()) break; } return t; };
  d.setPaused(false);
  out.tiers = [-10, -6, -5, -3, -2, 0, 2, 3, 4, 5, 6, 7, 8, 9, 30].map((difference) => d.difficultyOf(20 + difference, 20));
  out.experience = {
    even: d.experienceForKill(100, 10, 10),
    harder: d.experienceForKill(100, 15, 10),
    blue: d.experienceForKill(100, 7, 10),
    darkBlue: d.experienceForKill(100, 4, 10),
    darkerBlue: d.experienceForKill(100, 3, 10),
    floor: d.experienceForKill(25, 2, 50),
  };

  for (const enemy of d.enemies.list) Object.assign(enemy, { state: 'dead', respawnTimer: 1e9 });
  const spot = d.navigation.nearestWalkable(30, -40, 10);
  Object.assign(d.player, { x: spot.x, z: spot.z, path: [], pathIndex: 0, combatTarget: null });
  d.progression.setLevel(20);
  const hopperSpot = d.navigation.nearestWalkable(spot.x + 2, spot.z, 6);
  const hopper = d.enemies.spawn('sandHopper', hopperSpot.x, hopperSpot.z);
  const before = d.progression.state.experience;
  d.engage(hopper);
  step(15, () => hopper.state === 'dying' || hopper.state === 'dead');
  out.killXpAtTwenty = d.progression.state.experience - before;

  d.setRendering(true);
  const crabSpot = d.navigation.nearestWalkable(spot.x - 4, spot.z + 2, 6);
  const crab = d.enemies.spawn('shoreCrab', crabSpot.x, crabSpot.z);
  crab.state = 'idle';
  d.progression.setLevel(1);
  d.renderScene();
  const bar = crab.bar;
  out.nameShownNear = !bar.box.classList.contains('hidden') && bar.box.classList.contains('name-only');
  out.nameClassAtOne = bar.name.className;
  d.progression.setLevel(30);
  d.renderScene();
  out.nameClassAtThirty = bar.name.className;
  d.setRendering(false);

  Object.assign(crab, { state: 'dead', respawnTimer: 1e9 });
  const far = d.navigation.nearestWalkable(spot.x + 30, spot.z - 25, 15);
  const resting = d.enemies.spawn('shoreCrab', far.x, far.z);
  resting.state = 'idle';
  resting.health = 10;
  resting.lastHurtTime = d.simulationTime();
  step(5);
  out.healthAfterFive = Math.round(resting.health);
  step(5);
  out.healthAfterTen = Math.round(resting.health);
  return out;
}
'''

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    page = browser.new_page(viewport={'width': 915, 'height': 412})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('console', lambda message: errors.append(message.text[:300]) if message.type == 'error' else None)
    page.goto(URL)
    page.wait_for_function('!!window.__debug', timeout=180000)
    page.evaluate('() => window.__debug.startOver()')
    page.wait_for_function('!!window.__debug', timeout=180000)
    out = page.evaluate(FLOW)
    print(json.dumps(out), flush=True)
    checks = {
        'tiers': out['tiers'] == ['trivial', 'trivial', 'easy', 'easy', 'even', 'even', 'even', 'tough', 'tough', 'hard', 'hard', 'deadly', 'deadly', 'impossible', 'impossible'],
        'experienceShares': out['experience'] == {'even': 100, 'harder': 100, 'blue': 50, 'darkBlue': 10, 'darkerBlue': 8, 'floor': 1},
        'killUsesShare': out['killXpAtTwenty'] == 1,
        'nameNearbyColoured': out['nameShownNear'] and 'difficulty-even' in out['nameClassAtOne'] and 'difficulty-trivial' in out['nameClassAtThirty'],
        'slowDelayedRegen': out['healthAfterFive'] == 10 and 13 <= out['healthAfterTen'] <= 15,
        'noErrors': not errors,
    }
    print(json.dumps({'checks': checks, 'errors': errors[:5]}, indent=1))
    browser.close()
    sys.exit(0 if all(checks.values()) else 1)
