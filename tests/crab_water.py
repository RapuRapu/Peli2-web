import os, json
from playwright.sync_api import sync_playwright

POOL_EDGE = (5, -8)
DRY_SAND = (5, -13)
DEEP_POOL = (5, -1)

SCRIPT = r'''
([poolEdge, drySand, deepPool]) => {
  const d = window.__debug; const p = d.player;
  const step = (seconds, until) => { let t = 0; for (; t < seconds; t += 1/60) { d.simulate(1/60); if (until && until()) break; } return t; };
  const walkTo = ([x, z]) => { const found = d.setDestination(x, z); step(40, () => p.pathIndex >= p.path.length); return found; };
  const checks = {};
  d.setPaused(false);
  const startNearDry = d.navigation.nearestWalkable(drySand[0], drySand[1], 10);
  Object.assign(p, { x: startNearDry.x, z: startNearDry.z, wetness: 0, wetHeight: 0 });
  step(0.5);

  const lowBeach = (() => {
    for (let x = -40; x <= 60; x += 2) for (let z = -40; z <= 40; z += 2) {
      if (!d.world.isWalkable(x, z)) continue;
      const height = d.world.heightAt(x, z);
      if (height < d.tideState.wetLevel && d.world.waterLevelAt(x, z, d.tideState.seaLevel) < height - 0.3) return { x, z, height, wetLevel: d.tideState.wetLevel };
    }
    return null;
  })();
  if (lowBeach) {
    const dryCrab = { x: p.x, z: p.z };
    Object.assign(p, { x: lowBeach.x, z: lowBeach.z });
    step(1);
    checks.dryLowBeach = { spot: lowBeach, wetness: p.wetness, pass: p.wetness === 0 };
    Object.assign(p, dryCrab);
    step(0.5);
  } else {
    checks.dryLowBeach = { pass: false, reason: 'no dry spot below the wet line found' };
  }

  const pathToPool = walkTo(poolEdge);
  checks.wadeIn = { pathFound: pathToPool, waterDepth: +p.waterDepth.toFixed(2), activeRipples: d.ripples.activeCount(), wetness: p.wetness, pass: pathToPool && d.ripples.activeCount() > 0 && p.wetness === 1 };

  const pathToDeep = walkTo(deepPool);
  step(4);
  checks.submerged = { pathFound: pathToDeep, waterDepth: +p.waterDepth.toFixed(2), activeRipples: d.ripples.activeCount(), pass: pathToDeep && p.waterDepth > 1.9 && d.ripples.activeCount() === 0 };

  walkTo(drySand);
  const heightWhenLeaving = p.wetHeight;
  step(10);
  const afterTen = p.wetness;
  step(25);
  checks.drying = { wetHeightWhenLeaving: +heightWhenLeaving.toFixed(2), wetnessAfter10s: +afterTen.toFixed(3), wetnessAfter35s: p.wetness, wetHeightAfter35s: p.wetHeight, pass: afterTen >= 0.6 && afterTen <= 0.7 && p.wetness === 0 && p.wetHeight === 0 };

  walkTo(poolEdge);
  walkTo(drySand);
  const tracksBefore = d.tracks.activeCount();
  walkTo([drySand[0] + 4, drySand[1] - 2]);
  checks.wetTracks = { wetnessWhileWalking: +p.wetness.toFixed(2), newTracks: d.tracks.activeCount() - tracksBefore, pass: p.wetness > 0.3 && d.tracks.activeCount() > tracksBefore };

  d.save.inventory = {};
  window.dispatchEvent(new Event('pagehide'));
  const stored = JSON.parse(localStorage.getItem('seaofcrabs-crab-save'));
  checks.saved = { wetness: +stored.wetness.toFixed(3), wetHeight: +stored.wetHeight.toFixed(2), pass: Math.abs(stored.wetness - p.wetness) < 1e-6 && stored.wetHeight === p.wetHeight };
  return checks;
}
'''

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    results = {}
    for quality in ('low', 'medium', 'high'):
        page = browser.new_page(viewport={'width': 915, 'height': 412})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('console', lambda message: errors.append(message.text[:400]) if message.type == 'error' else None)
        page.goto('file://' + os.path.abspath('dist/index.html') + f'?quality={quality}&dpr=0.5')
        page.wait_for_function('!!window.__debug', timeout=180000)
        page.wait_for_timeout(1000)
        if quality == 'low':
            results['checks'] = page.evaluate(SCRIPT, [POOL_EDGE, DRY_SAND, DEEP_POOL])
        results[f'errors_{quality}'] = errors
        page.close()
    browser.close()
    print(json.dumps(results, indent=1))
    failed = [name for name, check in results['checks'].items() if not check['pass']]
    errors = [error for quality in ('low', 'medium', 'high') for error in results[f'errors_{quality}']]
    print('FAILED:' if failed or errors else 'ALL PASS', failed, errors[:3])
