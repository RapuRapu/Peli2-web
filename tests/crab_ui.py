import os, json
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    context = b.new_context(viewport={'width': 915, 'height': 412}, has_touch=True)
    pg = context.new_page()
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    url = 'file://' + os.path.abspath('dist/index.html') + '?quality=low&dpr=0.5&norender'
    pg.goto(url); pg.wait_for_function('!!window.__debug', timeout=120000)
    report = {}
    report['noGoalOrHint'] = pg.evaluate("!document.querySelector('#hud .goal') && !document.querySelector('#hud .hint')")
    report['vitalsAboveButtons'] = pg.evaluate("document.querySelector('#hud .vitals').getBoundingClientRect().bottom <= document.querySelector('#hud .pause-button').getBoundingClientRect().top")
    report['settingsLabel'] = pg.evaluate("document.querySelector('#hud .pause-button').getAttribute('aria-label')")
    pg.tap('#hud .level-badge')
    report['statusOpens'] = pg.evaluate("document.querySelector('#hud .status-panel').classList.contains('visible') && document.querySelector('#hud .status-panel .status-value').textContent.startsWith('1 / 50')")
    pg.tap('#hud .status-panel .workbench-close')
    report['statusCloses'] = pg.evaluate("!document.querySelector('#hud .status-panel').classList.contains('visible')")
    start = pg.evaluate('[__debug.player.x, __debug.player.z]')
    pg.mouse.click(600, 150)
    pg.evaluate('for (let i = 0; i < 240; i++) __debug.simulate(1/60)')
    moved = pg.evaluate('[__debug.player.x, __debug.player.z]')
    report['tapWalkDistance'] = round(((moved[0]-start[0])**2 + (moved[1]-start[1])**2) ** 0.5, 1)
    report['footprints'] = pg.evaluate('__debug.tracks.activeCount()')
    node = pg.evaluate('''(() => { const d = __debug; const n = d.resources.nodes.filter(n => !n.gathered).map(n => { const v = new (d.camera.position.constructor)(n.x, n.y + 0.4, n.z).project(d.camera); return { id: n.id, sx: (v.x * 0.5 + 0.5) * innerWidth, sy: (-v.y * 0.5 + 0.5) * innerHeight }; }).filter(n => n.sx > 60 && n.sx < innerWidth - 60 && n.sy > 90 && n.sy < innerHeight - 40); return n[0] || null; })()''')
    report['visibleNode'] = node['id'] if node else None
    if node:
        pg.mouse.click(node['sx'], node['sy'])
        pg.evaluate('for (let i = 0; i < 900; i++) __debug.simulate(1/60)')
        report['gatheredByTap'] = pg.evaluate(f"__debug.resources.nodes.find(n => n.id === '{node['id']}').gathered")
        report['inventory'] = pg.evaluate('__debug.save.inventory')
    pg.mouse.wheel(0, 600)
    pg.keyboard.down('w'); pg.evaluate('for (let i = 0; i < 60; i++) __debug.simulate(1/60)'); pg.keyboard.up('w')
    after_key = pg.evaluate('[__debug.player.x, __debug.player.z]')
    report['keyboardMoved'] = round(after_key[1] - pg.evaluate('0'), 1) != 0
    pg.click('#hud .pause-button')
    report['pauseMenuVisible'] = pg.evaluate("document.querySelector('#hud .pause-menu').classList.contains('visible')")
    report['pausedState'] = pg.evaluate('__debug.isPaused()')
    pg.click('#hud .pause-card .resume')
    report['resumed'] = not pg.evaluate('__debug.isPaused()')
    pg.evaluate('__debug.setPaused(true)')
    saved_position = pg.evaluate('[__debug.player.x, __debug.player.z]')
    pg.goto(url); pg.wait_for_function('!!window.__debug', timeout=120000)
    restored = pg.evaluate('[__debug.player.x, __debug.player.z]')
    report['saveRestoresPosition'] = abs(restored[0] - saved_position[0]) < 0.5 and abs(restored[1] - saved_position[1]) < 0.5
    report['saveRestoresInventory'] = pg.evaluate('__debug.save.inventory')
    pg.click('#hud .pause-button'); pg.click('#hud .quality-row button[data-quality="medium"]')
    pg.wait_for_function('!!window.__debug', timeout=120000)
    report['qualityStored'] = pg.evaluate("localStorage.getItem('seaofcrabs-quality')")
    print(json.dumps(report, indent=1)); print('errors:', errs)
    b.close()
