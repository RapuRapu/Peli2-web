import os, sys, time
from playwright.sync_api import sync_playwright

out_dir = sys.argv[1] if len(sys.argv) > 1 else 'shots'
poses = sys.argv[2].split(',') if len(sys.argv) > 2 else ['1', '2', '3', '4', '5', '6', '7', '8', '9']
extra = sys.argv[3] if len(sys.argv) > 3 else 'hud'
os.makedirs(out_dir, exist_ok=True)
LANDSCAPE = {'width': 915, 'height': 412}
PORTRAIT = {'width': 412, 'height': 915}
PORTRAIT_POSES = ('8', '19', '20', '28', '30', '43', '48', '49', '52', '63', '65', '70', '79', '83', '88', '91', '99')

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    for pose in poses:
        context = browser.new_context(viewport=PORTRAIT if pose in PORTRAIT_POSES else LANDSCAPE, device_scale_factor=2)
        page = context.new_page()
        errors = []
        page.on('console', lambda m: errors.append(m.text) if m.type in ('error', 'warning') else None)
        page.on('pageerror', lambda e: errors.append(str(e)))
        started = time.time()
        page.goto(f'file://{os.path.abspath("dist/index.html")}?pose={pose}&{extra}')
        try:
            page.wait_for_function('!!window.__frameReady', timeout=240000)
            stats = page.evaluate('window.__frameReady')
        except Exception as error:
            stats = f'TIMEOUT {error}'
        page.wait_for_timeout(900)
        page.screenshot(path=f'{out_dir}/pose{pose}.png')
        errors = [e for e in errors if 'GPU stall' not in e]
        print(f'pose {pose}: {time.time() - started:.1f}s {stats}', ('ERRORS: ' + ' | '.join(e[:600] for e in errors[:4])) if errors else '')
        context.close()
    browser.close()
