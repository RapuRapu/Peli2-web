import os, json, sys
from playwright.sync_api import sync_playwright

URL = 'file://' + os.path.abspath('dist/index.html') + '?quality=low&dpr=0.5'

FLOW = r'''
() => {
  const d = window.__debug;
  const out = {};
  d.setPaused(false);
  for (const enemy of d.enemies.list) Object.assign(enemy, { state: 'dead', respawnTimer: 1e9 });
  Object.assign(d.save.inventory, { shellBits: 5, driftwood: 9, seaLettuce: 9 });
  d.buildWorkshop();
  const screenOf = (x, y, z) => {
    d.updateCamera(0, true);
    const point = new d.camera.position.constructor(x, y, z).project(d.camera);
    return [(point.x + 1) / 2 * innerWidth, (1 - point.y) / 2 * innerHeight];
  };
  if (d.isUnderground()) d.exitBurrow();
  const entrance = d.burrow.state.entrance;
  const surfaceY = d.world.heightAt(entrance.x, entrance.z);
  out.entranceOnModel = Boolean(d.burrow.entranceUnder(...screenOf(entrance.x, surfaceY + 0.3, entrance.z), d.camera));
  out.entranceBesideModel = Boolean(d.burrow.entranceUnder(...screenOf(entrance.x + 4.5, d.world.heightAt(entrance.x + 4.5, entrance.z), entrance.z), d.camera));

  d.enterBurrow();
  for (let column = 2; column <= 4; column++) for (let row = 1; row <= 3; row++) d.burrow.finishDig(column, row);
  d.buildStation('crabBed', 3, 2);
  const bed = d.burrow.stationOf('crabBed');
  const spot = d.burrow.stationSpot(bed);
  out.bedOnModel = d.burrow.stationUnder(...screenOf(spot.x, 200.3, spot.z), d.camera) === bed;
  out.bedBesideModel = d.burrow.stationUnder(...screenOf(spot.x + 2.6, 200, spot.z + 2.6), d.camera) === bed;
  const shaft = d.burrow.shaftCenter;
  out.shaftBeside = Boolean(d.burrow.shaftUnder(...screenOf(shaft.x - 3, 200, shaft.z - 3), d.camera));
  return out;
}
'''

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    page = browser.new_page(viewport={'width': 915, 'height': 412})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(URL)
    page.wait_for_function('!!window.__debug', timeout=180000)
    page.evaluate('() => localStorage.clear()')
    page.reload()
    page.wait_for_function('!!window.__debug', timeout=180000)
    out = page.evaluate(FLOW)
    print(json.dumps(out))
    checks = {
        'entranceOnlyOnModel': out['entranceOnModel'] and not out['entranceBesideModel'],
        'bedOnlyOnModel': out['bedOnModel'] and not out['bedBesideModel'],
        'shaftNotFromAfar': not out['shaftBeside'],
        'noErrors': not errors,
    }
    print(json.dumps(checks, indent=2), errors)
    browser.close()
    print('ALL PASS' if all(checks.values()) else 'FAIL')
    sys.exit(0 if all(checks.values()) else 1)
