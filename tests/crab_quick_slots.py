import os, json, sys
from playwright.sync_api import sync_playwright

URL = 'file://' + os.path.abspath('dist/index.html') + '?quality=low&dpr=0.5&norender'

FLOW = r'''
() => {
  const d = window.__debug;
  const step = (seconds) => { for (let t = 0; t < seconds; t += 1/60) d.simulate(1/60); };
  const out = {};
  d.setPaused(false);
  for (const enemy of d.enemies.list) Object.assign(enemy, { state: 'dead', respawnTimer: 1e9 });
  out.defaultSlots = d.quickSlots().join(',');
  Object.assign(d.save.inventory, { driedKelp: 4, seaLettuce: 2 });
  out.crafted = d.craftSupply('kelpPoultice') && d.save.inventory.kelpPoultice === 1 && d.save.inventory.driedKelp === 2 && d.save.inventory.seaLettuce === 1;
  const max = d.progression.maxHealth();
  d.progression.state.health = Math.round(max * 0.3);
  document.querySelector('#hud .quick-slot[data-quick-slot="0"]').click();
  out.healed = d.progression.state.health - Math.round(max * 0.3);
  out.expectedHeal = Math.round(max * 0.4);
  out.poulticeUsed = d.save.inventory.kelpPoultice === 0;
  out.countShown = document.querySelector('#hud .quick-slot[data-quick-slot="0"] .quick-slot-count').textContent;
  d.save.inventory.kelpPoultice = 1;
  d.refreshHudForTest && d.refreshHudForTest();
  out.cooldownBlocks = !d.useConsumable('kelpPoultice');
  step(8.5);
  out.afterCooldown = d.useConsumable('kelpPoultice');
  document.querySelector('#hud .quick-slot[data-quick-slot="1"]').click();
  out.kelpEaten = d.save.inventory.driedKelp === 1 && d.isWellFed();
  d.assignQuickSlot(1, 'kelpPoultice');
  out.reassigned = d.quickSlots().join(',');
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
        'defaultSlots': out['defaultSlots'] == 'kelpPoultice,driedKelp',
        'craftPoultice': out['crafted'],
        'healFromSlot': out['healed'] == out['expectedHeal'] and out['poulticeUsed'] and out['countShown'] == '0',
        'cooldown': out['cooldownBlocks'] and out['afterCooldown'],
        'kelpFromSlot': out['kelpEaten'],
        'reassignMovesItem': out['reassigned'] == ',kelpPoultice' or out['reassigned'] == 'null,kelpPoultice',
        'noErrors': not errors,
    }
    print(json.dumps(checks, indent=2), errors)
    browser.close()
    print('ALL PASS' if all(checks.values()) else 'FAIL')
    sys.exit(0 if all(checks.values()) else 1)
