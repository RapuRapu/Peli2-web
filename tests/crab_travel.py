import os, json
from playwright.sync_api import sync_playwright

URL = 'file://' + os.path.abspath('dist/index.html') + '?quality=low&dpr=0.5&norender'

HELPERS = r'''
window.__step = (seconds, until) => { const d = window.__debug; let t = 0; for (; t < seconds; t += 1/60) { d.simulate(1/60); if (until && until()) break; } return t; };
window.__frame = () => { const d = window.__debug; d.updateCamera(0, true); d.renderScene(); };
window.__screenOf = (x, y, z) => { const d = window.__debug; const p = new d.camera.position.constructor(x, y, z).project(d.camera); return { x: (p.x * 0.5 + 0.5) * innerWidth, y: (-p.y * 0.5 + 0.5) * innerHeight }; };
window.__findEntranceSpot = () => { const d = window.__debug; for (let r = 4; r < 40; r += 1) for (let a = 0; a < 16; a++) { const x = 13 + Math.cos(a / 16 * Math.PI * 2) * r; const z = -21 + Math.sin(a / 16 * Math.PI * 2) * r; if (!d.entranceSpotProblem(x, z)) return { x, z }; } return null; };
window.__walking = () => { const p = window.__debug.player; return p.pathIndex < p.path.length; };
'''

SETUP = r'''
() => {
  const d = window.__debug;
  d.setPaused(false);
  const spot = window.__findEntranceSpot();
  d.digEntranceAt(spot.x, spot.z);
  Object.assign(d.save.inventory, { driftwood: 4, shellBits: 2 });
  const rackBuilt = d.buildRackStation();
  const near = d.navigation.nearestWalkable(spot.x - 3, spot.z - 2, 6);
  Object.assign(d.player, { x: near.x, z: near.z });
  d.simulate(1 / 60);
  window.__frame();
  return { rackBuilt, spot, surfaceDistance: d.getCameraDistance() };
}
'''

def touch_points(points):
    return [{'x': x, 'y': y, 'id': i, 'radiusX': 4, 'radiusY': 4, 'force': 1} for i, (x, y) in enumerate(points)]

def pinch(cdp, center, start_gap, end_gap, steps=6):
    cx, cy = center['x'], center['y']
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': touch_points([(cx - start_gap / 2, cy)])})
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': touch_points([(cx - start_gap / 2, cy), (cx + start_gap / 2, cy)])})
    for step in range(1, steps + 1):
        gap = start_gap + (end_gap - start_gap) * step / steps
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': touch_points([(cx - gap / 2, cy), (cx + gap / 2, cy)])})
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})

def drag(cdp, start, end, steps=8):
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': touch_points([(start['x'], start['y'])])})
    for step in range(1, steps + 1):
        x = start['x'] + (end['x'] - start['x']) * step / steps
        y = start['y'] + (end['y'] - start['y']) * step / steps
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': touch_points([(x, y)])})
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    errors = []
    checks = {}
    results = {}
    for name, viewport in [('portrait', {'width': 412, 'height': 915}), ('landscape', {'width': 915, 'height': 412})]:
        context = browser.new_context(viewport=viewport, is_mobile=True, has_touch=True, device_scale_factor=2)
        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('console', lambda message: errors.append(message.text[:400]) if message.type == 'error' else None)
        page.goto(URL)
        page.wait_for_function('!!window.__debug', timeout=180000)
        with page.expect_navigation(timeout=180000):
            page.evaluate('() => { setTimeout(() => window.__debug.startOver(), 0); }')
        page.wait_for_function('!!window.__debug', timeout=180000)
        page.evaluate(HELPERS)
        cdp = context.new_cdp_session(page)
        out = page.evaluate(SETUP)

        entrance = page.evaluate('() => { window.__frame(); const d = window.__debug; const e = d.burrow.state.entrance; return window.__screenOf(e.x, d.world.heightAt(e.x, e.z) + 0.4, e.z); }')
        pinch(cdp, entrance, 40, 150)
        out['pinchOnEntrance'] = page.evaluate('() => { const d = window.__debug; return { underground: d.isUnderground(), walking: window.__walking(), distance: d.getCameraDistance() }; }')

        page.evaluate('() => { const d = window.__debug; d.setCameraDistance(24); const e = d.burrow.state.entrance; const r = d.rack.state; const stand = d.navigation.nearestWalkable((e.x + r.x) / 2, (e.z + r.z) / 2, 6); Object.assign(d.player, { x: stand.x, z: stand.z }); d.simulate(1 / 60); }')
        rack = page.evaluate('() => { window.__frame(); const d = window.__debug; return window.__screenOf(d.rack.state.x, d.world.heightAt(d.rack.state.x, d.rack.state.z) + 1.4, d.rack.state.z); }')
        out['rackScreen'] = rack
        page.touchscreen.tap(rack['x'], rack['y'])
        out['rackTap'] = page.evaluate('() => { const d = window.__debug; window.__step(15, () => d.rackPanel.isOpen); const opened = d.rackPanel.isOpen; d.rackPanel.close(); return { opened, underground: d.isUnderground() }; }')

        entrance = page.evaluate('() => { window.__frame(); const d = window.__debug; const e = d.burrow.state.entrance; return window.__screenOf(e.x, d.world.heightAt(e.x, e.z) + 0.4, e.z); }')
        page.touchscreen.tap(entrance['x'], entrance['y'])
        out['entranceTap'] = page.evaluate('() => { const d = window.__debug; window.__step(15, () => !window.__walking()); window.__frame(); return { underground: d.isUnderground(), option: d.travelOption(), button: document.querySelector("#hud .travel-button").textContent, shown: !document.querySelector("#hud .travel-button").classList.contains("hidden") }; }')
        page.screenshot(path=f'/tmp/travel/{name}_surface_button.png')
        out['surfaceDistanceBefore'] = page.evaluate('() => window.__debug.getCameraDistance()')
        page.tap('#hud .travel-button')
        out['enteredByButton'] = page.evaluate('() => window.__debug.isUnderground()')
        out['burrowDistance'] = page.evaluate('() => window.__debug.getCameraDistance()')
        page.evaluate('() => { window.__step(0.5); window.__frame(); }')
        page.screenshot(path=f'/tmp/travel/{name}_burrow_entry.png')

        shaft = page.evaluate('() => { window.__frame(); const d = window.__debug; return window.__screenOf(d.burrow.shaftCenter.x, 200.5, d.burrow.shaftCenter.z); }')
        start = page.evaluate('() => ({ x: window.__debug.player.x, z: window.__debug.player.z })')
        pinch(cdp, shaft, 40, 150)
        out['pinchOnShaft'] = page.evaluate(f'() => {{ const d = window.__debug; window.__step(1); return {{ underground: d.isUnderground(), moved: Math.hypot(d.player.x - {start["x"]}, d.player.z - {start["z"]}), distance: d.getCameraDistance() }}; }}')
        pinch(cdp, shaft, 150, 80)
        out['pinchBackOnShaft'] = page.evaluate(f'() => {{ const d = window.__debug; window.__step(1); return {{ underground: d.isUnderground(), moved: Math.hypot(d.player.x - {start["x"]}, d.player.z - {start["z"]}), distance: d.getCameraDistance() }}; }}')

        shaft = page.evaluate('() => { window.__frame(); const d = window.__debug; return window.__screenOf(d.burrow.shaftCenter.x, 200.5, d.burrow.shaftCenter.z); }')
        page.touchscreen.tap(shaft['x'], shaft['y'])
        out['shaftTap'] = page.evaluate('() => { const d = window.__debug; window.__step(10, () => !window.__walking()); window.__frame(); return { underground: d.isUnderground(), option: d.travelOption(), shown: !document.querySelector("#hud .travel-button").classList.contains("hidden"), button: document.querySelector("#hud .travel-button").textContent }; }')
        page.screenshot(path=f'/tmp/travel/{name}_burrow_button.png')
        page.evaluate('() => window.__debug.setCameraDistance(19)')
        page.tap('#hud .travel-button')
        out['exitedByButton'] = page.evaluate('() => !window.__debug.isUnderground()')
        out['surfaceDistanceRestored'] = page.evaluate('() => window.__debug.getCameraDistance()')
        out['reenter'] = page.evaluate('() => { const d = window.__debug; d.enterBurrow(); const distance = d.getCameraDistance(); d.exitBurrow(); return distance; }')

        page.evaluate('() => { window.__step(0.2); window.__frame(); }')
        center = {'x': viewport['width'] / 2, 'y': viewport['height'] / 2}
        drag(cdp, center, {'x': center['x'] + 90, 'y': center['y'] + 40})
        out['dragWalks'] = page.evaluate('() => window.__walking()')
        results[name] = out
        print(name, json.dumps(out))
        p = out
        checks[f'{name}:pinchNeverTravelsOrWalks'] = not p['pinchOnEntrance']['underground'] and not p['pinchOnEntrance']['walking'] and p['pinchOnEntrance']['distance'] < p['surfaceDistance'] and p['pinchOnShaft']['underground'] and p['pinchOnShaft']['moved'] < 0.3 and p['pinchBackOnShaft']['underground'] and p['pinchBackOnShaft']['moved'] < 0.3 and p['pinchOnShaft']['distance'] < p['burrowDistance'] < p['pinchBackOnShaft']['distance'] + 50
        checks[f'{name}:rackBeatsEntrance'] = p['rackBuilt'] and p['rackTap']['opened'] and not p['rackTap']['underground']
        checks[f'{name}:entranceTapOnlyWalks'] = not p['entranceTap']['underground'] and p['entranceTap']['option'] == 'enter' and p['entranceTap']['shown'] and 'Enter' in p['entranceTap']['button']
        checks[f'{name}:enterByButton'] = p['enteredByButton']
        checks[f'{name}:shaftTapOnlyWalks'] = p['shaftTap']['underground'] and p['shaftTap']['option'] == 'exit' and p['shaftTap']['shown'] and 'outside' in p['shaftTap']['button']
        checks[f'{name}:exitByButton'] = p['exitedByButton']
        checks[f'{name}:zoomPerSpace'] = abs(p['surfaceDistanceRestored'] - p['surfaceDistanceBefore']) < 0.01 and abs(p['reenter'] - 19) < 0.01 and p['burrowDistance'] < p['surfaceDistance']
        checks[f'{name}:dragStillWalks'] = p['dragWalks']
        context.close()
    browser.close()
    checks['noErrors'] = not errors
    print(json.dumps({'checks': checks, 'errors': errors[:5]}, indent=1))
    print('ALL PASS' if all(checks.values()) else 'FAIL')
