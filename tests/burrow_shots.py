import os
import sys
from playwright.sync_api import sync_playwright

out_dir = sys.argv[1] if len(sys.argv) > 1 else 'shots/burrow'
os.makedirs(out_dir, exist_ok=True)
SHOTS = [
    ('overview', "const w = d.burrow.stationSpot(d.burrow.stationOf('workshop')); Object.assign(d.player, { x: w.x + 2.5, z: w.z + 1 }); d.setCameraDistance(30); d.simulate(1 / 60);"),
    ('exit', "Object.assign(d.player, { x: d.burrow.shaftCenter.x, z: d.burrow.shaftCenter.z - 4 }); d.setCameraDistance(18); d.simulate(1 / 60);"),
    ('digging', "d.setCameraDistance(16); d.startDigCell(7, 4); for (let i = 0; i < 80; i++) d.simulate(1 / 60);"),
    ('dug', "for (let i = 0; i < 200; i++) d.simulate(1 / 60);"),
]

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    page = browser.new_page(viewport={'width': 915, 'height': 412}, device_scale_factor=2)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(f'file://{os.path.abspath("dist/index.html")}?pose=46&quality=high')
    page.wait_for_function('!!window.__frameReady', timeout=180000)
    page.evaluate("(() => { document.querySelectorAll('.scene-fade').forEach((e) => e.style.display = 'none'); window.__debug.setRendering(false); })()")
    for name, action in SHOTS:
        page.evaluate(f"(() => {{ const d = window.__debug; {action} d.updateCamera(0, true); d.burrow.update(d.simulationTime(), d.camera, true); d.setRendering(true); d.renderScene(); d.setRendering(false); }})()")
        page.screenshot(path=f'{out_dir}/{name}.png')
    print('errors', errors[:3])
    browser.close()
