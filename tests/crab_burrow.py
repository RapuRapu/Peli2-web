import os, json
from playwright.sync_api import sync_playwright

URL = 'file://' + os.path.abspath('dist/index.html') + '?quality=low&dpr=0.5&norender'

HELPERS = r'''
window.__step = (seconds, until) => { const d = window.__debug; let t = 0; for (; t < seconds; t += 1/60) { d.simulate(1/60); if (until && until()) break; } return t; };
window.__screenOf = (x, y, z) => { const d = window.__debug; const p = new d.camera.position.constructor(x, y, z).project(d.camera); return { x: (p.x * 0.5 + 0.5) * innerWidth, y: (-p.y * 0.5 + 0.5) * innerHeight }; };
window.__findEntranceSpot = () => { const d = window.__debug; for (let r = 4; r < 40; r += 1) for (let a = 0; a < 16; a++) { const x = 13 + Math.cos(a / 16 * Math.PI * 2) * r; const z = -21 + Math.sin(a / 16 * Math.PI * 2) * r; if (!d.entranceSpotProblem(x, z)) return { x, z }; } return null; };
'''

FLOW = r'''
() => {
  const d = window.__debug;
  const out = {};
  d.setPaused(false);
  const goal = document.querySelector('#hud .goal');
  out.firstGoal = goal.textContent;
  out.firstGoalIsAction = goal.classList.contains('action');
  goal.click();
  out.modeShown = !document.querySelector('#hud .mode-bar').classList.contains('hidden');
  out.wetRefused = d.chooseEntranceSpot(0, 40) === false;
  const spot = window.__findEntranceSpot();
  out.spot = spot;
  out.spotAccepted = d.chooseEntranceSpot(spot.x, spot.z);
  out.digSeconds = window.__step(20, () => d.burrow.exists);
  out.burrowExists = d.burrow.exists;
  out.goalAfterDig = goal.textContent;
  d.walkToEntrance();
  out.walkSeconds = window.__step(20, () => d.travelOption() === 'enter');
  out.stayedOutsideAfterWalk = !d.isUnderground();
  d.renderScene();
  out.travelButtonShown = !document.querySelector('#hud .travel-button').classList.contains('hidden');
  document.querySelector('#hud .travel-button').click();
  out.enterSeconds = window.__step(2, () => d.isUnderground());
  out.underground = d.isUnderground();
  out.hudUnderground = document.querySelector('#hud').classList.contains('underground');
  out.cameraOnBurrowLayer = d.camera.layers.mask === 2;
  out.buildButtonShown = !document.querySelector('#hud .build-open').classList.contains('hidden');
  out.playerY = d.player.y;
  out.digStarted = d.startDigCell(5, 7);
  window.__step(12, () => d.burrow.isDug(5, 7));
  out.cellDug = d.burrow.isDug(5, 7);
  out.notAdjacentRefused = d.startDigCell(0, 0) === false;
  Object.assign(d.save.inventory, { shellBits: 5, driftwood: 7, seaLettuce: 3 });
  document.querySelector('#hud .build-open').click();
  out.buildPanelOpen = d.buildPanel.isOpen;
  document.querySelector('#hud .build-panel [data-station="workshop"]').click();
  out.placingAfterChoose = !document.querySelector('#hud .mode-bar').classList.contains('hidden');
  return out;
}
'''

PLACE_TAP_TARGET = r'''
() => {
  const d = window.__debug;
  d.renderScene();
  const cell = d.burrow.freeCells().find((c) => c.column === 6 && c.row === 5);
  const center = { x: 1000 + (cell.column - 5) * 3, z: (cell.row - 5) * 3 };
  return window.__screenOf(center.x, 200, center.z);
}
'''

AFTER_PLACE = r'''
() => {
  const d = window.__debug;
  const out = {};
  out.workshopBuilt = d.burrow.hasStation('workshop');
  out.inventoryAfterWorkshop = { ...d.save.inventory };
  out.storageBuilt = d.buildStation('storage', 4, 5);
  out.duplicateRefused = d.buildStation('storage', 4, 6) === false;
  const workshopStation = d.burrow.stationOf('workshop');
  d.walkToStation(workshopStation);
  window.__step(10, () => d.workbenchPanel.isOpen);
  out.workshopPanelOpens = d.workbenchPanel.isOpen;
  d.workbenchPanel.close();
  Object.assign(d.save.inventory, { shellBits: 8, driftwood: 4 });
  const cone = d.craftItem('shell', 'cone');
  out.coneCrafted = Boolean(cone);
  Object.assign(d.save.inventory, { shellBits: 6, seaLettuce: 2, pearls: 1 });
  const storageStation = d.burrow.stationOf('storage');
  d.walkToStation(storageStation);
  window.__step(10, () => d.storagePanel.isOpen);
  out.storagePanelOpens = d.storagePanel.isOpen;
  document.querySelector('#hud .storage-panel .store-all').click();
  out.storedInventory = { ...d.storage.inventory };
  out.storedShellKinds = d.storage.shells.map((item) => item.kind);
  out.carriedAfterStore = { ...d.save.inventory };
  d.storagePanel.select('material:pearls', 'storage');
  document.querySelector('#hud .storage-panel [data-take="pearls"]').click();
  out.pearlTaken = d.save.inventory.pearls === 1 && !d.storage.inventory.pearls;
  d.storagePanel.close();
  d.setRendering(true);
  d.renderScene();
  d.setRendering(false);
  out.undergroundCalls = d.renderer.info.render.calls;
  out.undergroundTriangles = d.renderer.info.render.triangles;
  d.exitBurrow();
  out.surfaceAfterExit = !d.isUnderground();
  out.besideEntrance = Math.hypot(d.player.x - d.burrow.state.entrance.x, d.player.z - d.burrow.state.entrance.z) < 5;
  Object.assign(d.save.inventory, { driftwood: 2 });
  d.die();
  window.__step(3);
  out.wokeUnderground = d.isUnderground();
  out.remainsCount = d.remains.list.length;
  out.remainsHasPearl = d.remains.list.some((entry) => entry.inventory.pearls === 1);
  out.storageKept = d.storage.inventory.shellBits >= 6 && d.storage.shells.some((item) => item.kind === 'cone');
  d.persist();
  return out;
}
'''

RELOADED = r'''
() => {
  const d = window.__debug;
  return { burrowExists: d.burrow.exists, stations: d.burrow.state.stations.map((s) => s.kind).sort(), dugCount: d.burrow.state.dug.length, underground: d.isUnderground(), storageShells: d.storage.shells.length, storedBits: d.storage.inventory.shellBits || 0 };
}
'''

V3_SAVE = {'version': 3, 'x': 13, 'z': -21, 'heading': 2.3, 'worldTime': 260, 'inventory': {'shellBits': 2}, 'nodes': None, 'goalAnnounced': True, 'hasMoved': True, 'wetness': 0, 'wetHeight': 0, 'gear': {'nextId': 4, 'shells': [{'id': 1, 'kind': 'snail', 'enchant': 0}, {'id': 3, 'kind': 'turban', 'enchant': 2}], 'claws': [{'id': 2, 'kind': 'bare', 'enchant': 0}], 'wornShellId': 3, 'wornClawsId': 2}, 'workshopBuilt': True, 'craftedOnce': True, 'progression': None, 'remains': []}

def wait_frames(page, count=3):
    page.evaluate(f'() => new Promise(r => {{ let n = 0; const f = () => (++n >= {count} ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }})')

def fresh_page(context, errors):
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('console', lambda message: errors.append(message.text[:400]) if message.type == 'error' else None)
    page.goto(URL)
    page.wait_for_function('!!window.__debug', timeout=180000)
    with page.expect_navigation(timeout=180000):
        page.evaluate('() => { setTimeout(() => window.__debug.startOver(), 0); }')
    page.wait_for_function('!!window.__debug', timeout=180000)
    page.evaluate(HELPERS)
    return page

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    errors = []
    checks = {}
    context = browser.new_context(viewport={'width': 915, 'height': 412})
    page = fresh_page(context, errors)
    flow = page.evaluate(FLOW)
    print(json.dumps(flow))
    target = page.evaluate(PLACE_TAP_TARGET)
    page.mouse.click(target['x'], target['y'])
    wait_frames(page)
    after = page.evaluate(AFTER_PLACE)
    print(json.dumps(after))
    checks.update({
        'startsWithDigGoal': flow['firstGoal'] == '🕳️ Dig a burrow' and flow['firstGoalIsAction'] and flow['modeShown'],
        'wetSpotRefused': flow['wetRefused'],
        'entranceDug': flow['spotAccepted'] and flow['burrowExists'] and flow['goalAfterDig'].startswith('Workshop:'),
        'entersOnlyByButton': flow['stayedOutsideAfterWalk'] and flow['travelButtonShown'],
        'entersBurrow': flow['underground'] and flow['hudUnderground'] and flow['cameraOnBurrowLayer'] and flow['buildButtonShown'] and abs(flow['playerY'] - 200) < 0.01,
        'digsCell': flow['digStarted'] and flow['cellDug'] and flow['notAdjacentRefused'],
        'buildPanelPlacement': flow['buildPanelOpen'] and flow['placingAfterChoose'] and after['workshopBuilt'] and after['inventoryAfterWorkshop'].get('shellBits') == 0,
        'storageStation': after['storageBuilt'] and after['duplicateRefused'],
        'stationsOpen': after['workshopPanelOpens'] and after['storagePanelOpens'],
        'storeAll': after['storedInventory'].get('shellBits') == 6 and 'cone' in after['storedShellKinds'] and not after['carriedAfterStore'].get('shellBits'),
        'takeMaterial': after['pearlTaken'],
        'exitBesideEntrance': after['surfaceAfterExit'] and after['besideEntrance'],
        'deathWakesInBurrowStorageSafe': after['wokeUnderground'] and after['remainsCount'] == 1 and after['remainsHasPearl'] and after['storageKept'],
    })
    page.reload()
    page.wait_for_function('!!window.__debug', timeout=180000)
    reloaded = page.evaluate(RELOADED)
    print(json.dumps(reloaded))
    checks['saved'] = reloaded == {'burrowExists': True, 'stations': ['storage', 'workshop'], 'dugCount': 11, 'underground': True, 'storageShells': 1, 'storedBits': 6}
    context.close()

    migration = browser.new_context(viewport={'width': 915, 'height': 412})
    migration.add_init_script(f"localStorage.setItem('seaofcrabs-crab-save', JSON.stringify({json.dumps(V3_SAVE)}));")
    old = migration.new_page()
    old.on('pageerror', lambda error: errors.append(str(error)))
    old.goto(URL)
    old.wait_for_function('!!window.__debug', timeout=180000)
    migrated = old.evaluate('''() => { const d = window.__debug; return { entrance: d.burrow.state.entrance, stations: d.burrow.state.stations.map((s) => s.kind), worn: d.gear.wornShell().kind, quality: d.gear.wornShell().quality, underground: d.isUnderground(), goal: document.querySelector('#hud .goal').textContent }; }''')
    print(json.dumps(migrated))
    checks['migratesV3'] = migrated['entrance'] == {'x': 18, 'z': -17} and migrated['stations'] == ['workshop'] and migrated['worn'] == 'turban' and migrated['quality'] == 'fine' and not migrated['underground']
    migration.close()

    mobile = browser.new_context(viewport={'width': 412, 'height': 915}, is_mobile=True, has_touch=True, device_scale_factor=2)
    touch = fresh_page(mobile, errors)
    touch.tap('#hud .goal')
    spot = touch.evaluate('() => window.__findEntranceSpot()')
    screen = touch.evaluate(f'() => {{ const d = window.__debug; const near = d.navigation.nearestWalkable({spot["x"]} - 3, {spot["z"]} - 2, 6); Object.assign(d.player, {{ x: near.x, z: near.z }}); d.simulate(1 / 60); d.updateCamera(0, true); d.renderScene(); return window.__screenOf({spot["x"]}, d.world.heightAt({spot["x"]}, {spot["z"]}), {spot["z"]}); }}')
    print(json.dumps({'touchSpot': spot, 'screen': screen}))
    touch.touchscreen.tap(screen['x'], screen['y'])
    previewed = touch.evaluate('() => !window.__debug.burrow.exists && document.querySelector("#hud .mode-text").textContent.includes("again")')
    touch.touchscreen.tap(screen['x'], screen['y'])
    touch.evaluate('() => window.__step(20, () => window.__debug.burrow.exists)')
    dug_by_touch = touch.evaluate('() => window.__debug.burrow.exists')
    entrance_screen = touch.evaluate('() => { const d = window.__debug; d.updateCamera(0, true); d.renderScene(); const e = d.burrow.state.entrance; return window.__screenOf(e.x, d.world.heightAt(e.x, e.z) + 0.4, e.z); }')
    touch.touchscreen.tap(entrance_screen['x'], entrance_screen['y'])
    touch.evaluate('() => { window.__step(20, () => window.__debug.travelOption() === "enter"); window.__debug.renderScene(); }')
    outside_after_tap = touch.evaluate('() => !window.__debug.isUnderground()')
    touch.tap('#hud .travel-button')
    entered_by_touch = outside_after_tap and touch.evaluate('() => window.__debug.isUnderground()')
    checks['touchDigAndEnter'] = previewed and dug_by_touch and entered_by_touch
    print(json.dumps({'touchDug': dug_by_touch, 'touchEntered': entered_by_touch}))
    mobile.close()
    browser.close()

    checks['noErrors'] = not errors
    print(json.dumps({'checks': checks, 'errors': errors[:5]}, indent=1))
    print('ALL PASS' if all(checks.values()) else 'FAIL')
