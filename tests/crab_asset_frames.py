import os
import sys
from playwright.sync_api import sync_playwright

out_dir = sys.argv[1] if len(sys.argv) > 1 else 'shots/asset_frames'
extra_query = sys.argv[2] if len(sys.argv) > 2 else '&asset=crab'
os.makedirs(out_dir, exist_ok=True)

SCENARIOS = {
    'walk': {'pose': 15, 'action': "d.setDestination(d.player.x + 6, d.player.z + 1)", 'steps': [6, 3, 3, 3]},
    'attack': {'pose': 22, 'action': "d.hermit.playAttack('big')", 'steps': [1, 8, 5, 8]},
    'hurt': {'pose': 15, 'action': "d.hermit.playHurt(1, 1)", 'steps': [2, 8, 10, 12]},
    'fork': {'pose': 80, 'action': "d.equipBuild('tinCan', 'fork', false)", 'steps': [2]},
    'fishhook': {'pose': 22, 'action': "d.equipBuild('cone', 'fishhook', true)", 'steps': [2]},
    'naked': {'pose': 22, 'action': "d.setDestination(d.player.x - 5, d.player.z + 2)", 'steps': [12, 12]},
}

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    for name, scenario in SCENARIOS.items():
        if len(sys.argv) > 3 and name not in sys.argv[3].split(','):
            continue
        context = browser.new_context(viewport={'width': 915, 'height': 412}, device_scale_factor=2)
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(f'file://{os.path.abspath("dist/index.html")}?pose={scenario["pose"]}{extra_query}')
        page.wait_for_function('!!window.__frameReady', timeout=180000)
        page.evaluate('window.__debug.setRendering(false)')
        page.evaluate(f'(() => {{ const d = window.__debug; {scenario["action"]}; }})()')
        for index, frames in enumerate(scenario['steps']):
            page.evaluate(f'(() => {{ const d = window.__debug; for (let i = 0; i < {frames}; i++) d.simulate(1 / 60); d.updateCamera && d.updateCamera(0); d.setRendering(true); d.renderScene(); d.setRendering(false); }})()')
            page.screenshot(path=f'{out_dir}/{name}_{index}.png')
        print(name, 'errors:', errors[:3])
        context.close()
    browser.close()
