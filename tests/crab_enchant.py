import os, json
from playwright.sync_api import sync_playwright

URL = 'file://' + os.path.abspath('dist/index.html') + '?quality=low&dpr=0.5'
ATTEMPTS_PER_LEVEL = 2000
ALLOWED_DEVIATION = 0.03

SETUP = r'''
() => {
  const d = window.__debug;
  d.setPaused(false);
  Object.assign(d.save.inventory, { shellBits: 5, driftwood: 3, seaLettuce: 3 });
  d.buildWorkshop();
  return d.save.workshopBuilt;
}
'''

ODDS = r'''
({ attempts }) => {
  const d = window.__debug;
  let seed = 20261117;
  const seeded = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const original = d.randomSource.next;
  d.randomSource.next = seeded;
  const inventory = {};
  const results = [];
  for (let target = 1; target <= 9; target++) {
    let successes = 0;
    let costOk = true;
    for (let attempt = 0; attempt < attempts; attempt++) {
      Object.assign(inventory, { shellBits: 10, seaLettuce: 4 });
      const item = d.gear.craft('shell', 'turban', inventory);
      item.enchant = target - 1;
      Object.assign(inventory, { pearls: 1, shellBits: 2 * target + 3 });
      const result = d.gear.enchant(item.id, inventory, () => d.randomSource.next());
      if (inventory.pearls !== 0 || inventory.shellBits !== 3) costOk = false;
      if (result.success) {
        successes++;
        d.gear.state.shells = d.gear.state.shells.filter((shell) => shell.id !== item.id);
      } else if (d.gear.state.shells.some((shell) => shell.id === item.id)) {
        costOk = false;
      }
    }
    results.push({ target, share: successes / attempts, costOk });
  }
  d.randomSource.next = original;
  return results;
}
'''

BEHAVIOUR = r'''
() => {
  const d = window.__debug;
  const original = d.randomSource.next;
  const forced = (value) => { d.randomSource.next = () => value; };
  const out = {};
  const give = (items) => { for (const [type, amount] of Object.entries(items)) d.save.inventory[type] = (d.save.inventory[type] || 0) + amount; };

  out.bareEnchantable = d.gear.enchantableItems().some(({ item }) => item.kind === 'bare');
  const bare = d.gear.state.claws.find((item) => item.kind === 'bare');
  give({ pearls: 1, shellBits: 2 });
  out.bareRefused = d.enchantItem(bare.id) === null;

  give({ shellBits: 10, seaLettuce: 4 });
  const turban = d.craftItem('shell', 'turban');
  d.wearItem(turban.id);
  const defenseBefore = d.playerStats().defense;
  give({ pearls: 3, shellBits: 12 });
  forced(0.999);
  for (let n = 0; n < 3; n++) d.enchantItem(turban.id);
  out.safeLevelsReached = turban.enchant;
  out.defenseAfterThree = d.playerStats().defense;
  out.defenseBefore = defenseBefore;
  give({ pearls: 1, shellBits: 8 });
  forced(0.5);
  const success = d.enchantItem(turban.id);
  out.fourSucceeds = success.success && turban.enchant === 4;
  give({ pearls: 1, shellBits: 10 });
  forced(0.999);
  const broke = d.enchantItem(turban.id);
  out.fiveBreaks = !broke.success && broke.wasWorn;
  out.nakedAfterBreak = d.gear.state.wornShellId === null && !d.gear.state.shells.some((item) => item.id === turban.id);
  out.defenseNaked = d.playerStats().defense;

  give({ shellBits: 6, driftwood: 4 });
  const claws = d.craftItem('claws', 'shellEdged');
  d.wearItem(claws.id);
  claws.enchant = 3;
  give({ pearls: 1, shellBits: 8 });
  forced(0.999);
  d.enchantItem(claws.id);
  out.clawsBreakToBare = d.gear.wornClaws().kind === 'bare';

  give({ shellBits: 3 });
  const snail = d.craftItem('shell', 'snail');
  snail.enchant = 3;
  give({ pearls: 1, shellBits: 8 });
  d.enchantItem(snail.id);
  out.snailBreaks = !d.gear.state.shells.some((item) => item.id === snail.id);

  give({ shellBits: 8, driftwood: 4 });
  const cone = d.craftItem('shell', 'cone');
  cone.enchant = 9;
  give({ pearls: 1, shellBits: 20 });
  out.maxRefused = d.enchantItem(cone.id) === null;

  const pearlsBefore = d.save.inventory.pearls;
  d.save.inventory.pearls = 0;
  cone.enchant = 2;
  out.noPearlsRefused = d.enchantItem(cone.id) === null;
  d.save.inventory.pearls = pearlsBefore;

  forced(0.0);
  give({ pearls: 1, shellBits: 6 });
  d.enchantItem(cone.id);
  out.coneLevel = cone.enchant;
  out.coneId = cone.id;
  d.wearItem(cone.id);
  d.persist();
  d.randomSource.next = original;
  return out;
}
'''

PANEL_STATE = r'''
() => {
  const panel = document.querySelector('#hud .workbench');
  const rows = [...panel.querySelectorAll('[data-enchant-item]')].map((row) => ({ id: Number(row.dataset.enchantItem), name: row.querySelector('.item-name').textContent, odds: row.querySelector('.enchant-odds')?.textContent || '', button: row.querySelector('button').textContent }));
  return { visible: panel.classList.contains('visible'), rows, result: panel.querySelector('.enchant-result')?.textContent || null, pearls: window.__debug.save.inventory.pearls };
}
'''

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
    return page

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    errors = []
    checks = {}
    context = browser.new_context(viewport={'width': 915, 'height': 412})
    page = fresh_page(context, errors)
    checks['workshopBuilt'] = page.evaluate(SETUP)

    odds = page.evaluate(ODDS, {'attempts': ATTEMPTS_PER_LEVEL})
    expected = page.evaluate('() => window.__debug.enchantLevels.slice(1).map((level) => level.chance)')
    for row, chance in zip(odds, expected):
        row['expected'] = chance
        row['ok'] = abs(row['share'] - chance) <= ALLOWED_DEVIATION and row['costOk']
    checks['oddsWithinThreePoints'] = all(row['ok'] for row in odds)
    print(json.dumps(odds))

    behaviour = page.evaluate(BEHAVIOUR)
    print(json.dumps(behaviour))
    checks.update({
        'bareNotEnchantable': not behaviour['bareEnchantable'] and behaviour['bareRefused'],
        'safeLevelsNeverFail': behaviour['safeLevelsReached'] == 3,
        'enchantRaisesDefense': behaviour['defenseAfterThree'] == behaviour['defenseBefore'] + 3,
        'riskyCanSucceed': behaviour['fourSucceeds'],
        'wornShellBreaksToNaked': behaviour['fiveBreaks'] and behaviour['nakedAfterBreak'] and behaviour['defenseNaked'] == 0,
        'wornClawsBreakToBare': behaviour['clawsBreakToBare'],
        'snailBreaks': behaviour['snailBreaks'],
        'capAtNine': behaviour['maxRefused'],
        'needsPearl': behaviour['noPearlsRefused'],
    })

    page.reload()
    page.wait_for_function('!!window.__debug', timeout=180000)
    reloaded = page.evaluate('''() => { const d = window.__debug; const worn = d.gear.wornShell(); return { kind: worn && worn.kind, enchant: worn && worn.enchant }; }''')
    checks['enchantSaved'] = reloaded == {'kind': 'cone', 'enchant': behaviour['coneLevel']} and behaviour['coneLevel'] == 3
    context.close()

    mobile = browser.new_context(viewport={'width': 412, 'height': 915}, is_mobile=True, has_touch=True, device_scale_factor=2)
    touch = fresh_page(mobile, errors)
    touch.evaluate(SETUP)
    touch.evaluate('''() => {
      const d = window.__debug;
      Object.assign(d.save.inventory, { shellBits: 10, seaLettuce: 4 });
      const turban = d.craftItem('shell', 'turban');
      d.wearItem(turban.id);
      Object.assign(d.save.inventory, { pearls: 3, shellBits: 20 });
      d.workbenchPanel.open('Enchant');
    }''')
    wait_frames(touch)
    first = touch.evaluate(PANEL_STATE)
    turban_row = next(row for row in first['rows'] if row['name'].startswith('Turban'))
    touch.tap(f'[data-enchant="{turban_row["id"]}"]')
    wait_frames(touch)
    after_safe = touch.evaluate(PANEL_STATE)
    touch.evaluate('() => { const d = window.__debug; d.gear.wornShell().enchant = 3; d.workbenchPanel.render(); d.randomSource.next = () => 0.999; }')
    wait_frames(touch)
    touch.tap(f'[data-enchant="{turban_row["id"]}"]')
    wait_frames(touch)
    armed = touch.evaluate(PANEL_STATE)
    touch.tap(f'[data-enchant="{turban_row["id"]}"]')
    wait_frames(touch)
    broken = touch.evaluate(PANEL_STATE)
    print(json.dumps({'first': first, 'afterSafe': after_safe, 'armed': armed, 'broken': broken}))
    checks['touchSafeEnchant'] = after_safe['pearls'] == 2 and after_safe['result'] and '+1' in after_safe['result']
    armed_row = next(row for row in armed['rows'] if row['id'] == turban_row['id'])
    checks['touchRiskNeedsSecondTap'] = armed['pearls'] == 2 and armed_row['button'] == 'Confirm · 30% break' and '30% break risk' in armed_row['odds'] and '70%' in armed_row['odds']
    checks['touchBreakShown'] = broken['pearls'] == 1 and broken['result'] and 'broke' in broken['result'] and not any(row['id'] == turban_row['id'] for row in broken['rows'])
    mobile.close()
    browser.close()

    checks['noErrors'] = not errors
    print(json.dumps({'checks': checks, 'errors': errors[:5]}, indent=1))
    print('ALL PASS' if all(checks.values()) else 'FAIL')
