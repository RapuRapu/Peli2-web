import os
import sys
from playwright.sync_api import sync_playwright

out_dir = sys.argv[1] if len(sys.argv) > 1 else 'shots/creatures'
os.makedirs(out_dir, exist_ok=True)
SCENES = {
    'shoreCrab': {'offset': (3.5, 2.0), 'distance': 9},
    'sandHopper': {'offset': (2.5, 1.5), 'distance': 7},
    'gull': {'offset': (10, 4), 'distance': 55},
}

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    for kind, scene in SCENES.items():
        if len(sys.argv) > 2 and kind not in sys.argv[2].split(','):
            continue
        page = browser.new_page(viewport={'width': 915, 'height': 412}, device_scale_factor=2)
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(f'file://{os.path.abspath("dist/index.html")}?pose=22')
        page.wait_for_function('!!window.__frameReady', timeout=180000)
        page.evaluate(f"""(() => {{ const d = window.__debug; d.setRendering(false);
          for (const enemy of d.enemies.list) Object.assign(enemy, {{ state: 'dead', respawnTimer: 1e9 }});
          const spot = d.navigation.nearestWalkable(d.player.x + {scene['offset'][0]}, d.player.z + {scene['offset'][1]}, 10);
          window.__creature = d.enemies.spawn('{kind}', spot.x, spot.z);
          window.__creature.altitude = 0; window.__creature.state = 'idle';
          d.setCameraDistance({scene['distance']}); }})()""")
        for index, (frames, action) in enumerate([(2, ''), (8, "window.__creature.motion = 1; window.__creature.heading += 0.0"), (8, "window.__creature.strike = 1"), (6, "window.__creature.hurt = 1")]):
            page.evaluate(f"(() => {{ const d = window.__debug; {action}; for (let i = 0; i < {frames}; i++) d.simulate(1 / 60); d.updateCamera && d.updateCamera(1, true); d.setRendering(true); d.renderScene(); d.setRendering(false); }})()")
            page.screenshot(path=f'{out_dir}/{kind}_{index}.png')
        print(kind, 'errors', errors[:3])
        page.close()
    browser.close()
