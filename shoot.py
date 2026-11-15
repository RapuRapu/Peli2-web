import sys, time
from playwright.sync_api import sync_playwright

out_dir = sys.argv[1] if len(sys.argv) > 1 else 'shots'
poses = sys.argv[2].split(',') if len(sys.argv) > 2 else ['1', '2', '3', '4', '5', '6']
import os
os.makedirs(out_dir, exist_ok=True)

LANDSCAPE = {'width': 915, 'height': 412}
PORTRAIT = {'width': 412, 'height': 915}

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    for pose in poses:
        viewport = PORTRAIT if pose == '6' else LANDSCAPE
        context = browser.new_context(viewport=viewport, device_scale_factor=2)
        page = context.new_page()
        errors = []
        page.on('console', lambda m: errors.append(m.text) if m.type in ('error', 'warning') else None)
        page.on('pageerror', lambda e: errors.append(str(e)))
        started = time.time()
        page.goto(f'file://{os.path.abspath("dist/index.html")}?pose={pose}&hud')
        page.wait_for_function('!!window.__frameReady', timeout=180000)
        stats = page.evaluate('window.__frameReady')
        page.screenshot(path=f'{out_dir}/pose{pose}.png')
        errors = [e for e in errors if 'GPU stall' not in e]
        print(f'pose {pose}: {time.time() - started:.1f}s {stats}', ('ERRORS: ' + ' | '.join(errors[:5])) if errors else '')
        context.close()
    browser.close()
