import os, json
from playwright.sync_api import sync_playwright

URL = 'file://' + os.path.abspath('dist/index.html') + '?quality=low&dpr=0.5'

FLOW = r'''
() => {
  const d = window.__debug;
  const step = (seconds, until) => { let t = 0; for (; t < seconds; t += 1/60) { d.simulate(1/60); if (until && until()) break; } return t; };
  const out = {};
  d.setPaused(false);
  Object.assign(d.save.inventory, { shellBits: 5, driftwood: 3, seaLettuce: 18 });
  d.buildWorkshop();
  out.refusedWithoutStorage = d.recruitHelper('shellBits') === null;
  Object.assign(d.save.inventory, { driftwood: 4 });
  d.buildStation('storage', 4, 5);
  out.recruited = ['shellBits', 'driftwood', 'seaLettuce'].map((job) => Boolean(d.recruitHelper(job)));
  out.fourthRefused = d.recruitHelper('shellBits') === null;
  out.lettuceLeft = d.save.inventory.seaLettuce;
  let sharedTarget = false;
  let maxAway = 0;
  for (let t = 0; t < 60; t += 1/60) {
    d.simulate(1/60);
    const targets = d.helpers.list.map((h) => h.targetId).filter(Boolean);
    if (new Set(targets).size !== targets.length) sharedTarget = true;
    for (const h of d.helpers.list) if (h.state !== 'resting') maxAway = Math.max(maxAway, Math.hypot(h.x - d.burrow.state.entrance.x, h.z - d.burrow.state.entrance.z));
  }
  out.storageAfter60 = { ...d.storage.inventory };
  out.sharedTarget = sharedTarget;
  out.maxAway = +maxAway.toFixed(1);
  const lettuceHelper = d.helpers.list.find((h) => h.job === 'seaLettuce');
  d.helpers.setJob(lettuceHelper.id, 'shellBits');
  const bitsBefore = d.storage.inventory.shellBits || 0;
  const lettuceBefore = d.storage.inventory.seaLettuce || 0;
  step(45);
  out.jobChange = { bitsGained: (d.storage.inventory.shellBits || 0) - bitsBefore, lettuceGained: (d.storage.inventory.seaLettuce || 0) - lettuceBefore };
  step(20, () => d.helpers.list.some((h) => h.state === 'outbound'));
  const victim = d.helpers.list.find((h) => h.state === 'outbound');
  const crab = d.enemies.list.find((e) => e.kind === 'shoreCrab' && e.state !== 'dead' && e.state !== 'dying');
  out.hadVictim = Boolean(victim && crab);
  if (victim && crab) {
    victim.health = 6;
    Object.assign(crab, { x: victim.x + 3, z: victim.z });
    d.simulate(1/60);
    out.fledState = victim.state;
    victim.health = 1;
    Object.assign(crab, { x: victim.x + 1, z: victim.z });
    const before = d.helpers.list.length;
    d.simulate(1/60);
    out.lost = before - d.helpers.list.length;
    out.toast = document.querySelector('#hud .toast').textContent;
  }
  d.persist();
  return out;
}
'''

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
    flow = page.evaluate(FLOW)
    print(json.dumps(flow))
    gathered = flow['storageAfter60']
    checks.update({
        'needsStorage': flow['refusedWithoutStorage'],
        'recruitLimitAndCost': flow['recruited'] == [True, True, True] and flow['fourthRefused'] and flow['lettuceLeft'] == 0,
        'helpersGatherEveryJob': all(gathered.get(job, 0) >= 2 for job in ('shellBits', 'driftwood', 'seaLettuce')),
        'noSharedTargets': not flow['sharedTarget'],
        'stayNearHome': flow['maxAway'] < 75,
        'jobChangeWorks': flow['jobChange']['bitsGained'] >= 2 and flow['jobChange']['lettuceGained'] <= 1,
        'fleeAndLoss': flow['hadVictim'] and flow['fledState'] == 'fleeing' and flow['lost'] == 1 and 'helper was caught' in flow.get('toast', ''),
    })
    page.reload()
    page.wait_for_function('!!window.__debug', timeout=180000)
    reloaded = page.evaluate("() => window.__debug.helpers.list.map((h) => h.job).sort()")
    print(json.dumps({'reloadedJobs': reloaded}))
    checks['saved'] = len(reloaded) == 2
    context.close()

    mobile = browser.new_context(viewport={'width': 412, 'height': 915}, is_mobile=True, has_touch=True, device_scale_factor=2)
    touch = fresh_page(mobile, errors)
    touch.evaluate('''() => { const d = window.__debug; d.setPaused(false); Object.assign(d.save.inventory, { shellBits: 5, driftwood: 7, seaLettuce: 8 }); d.buildWorkshop(); d.buildStation('storage', 4, 5); d.enterBurrow(); }''')
    touch.tap('#hud .helpers-button')
    touch.tap('#hud .helpers-panel [data-recruit]')
    touch.tap('#hud .helpers-panel [data-job="driftwood"]')
    panel = touch.evaluate('''() => { const d = window.__debug; return { open: d.helpersPanel.isOpen, helpers: d.helpers.list.map((h) => h.job), activeJob: document.querySelector('#hud .helpers-panel .job-button.active')?.dataset.job }; }''')
    print(json.dumps(panel))
    checks['touchRecruitAndJob'] = panel['open'] and panel['helpers'] == ['driftwood'] and panel['activeJob'] == 'driftwood'
    mobile.close()

    perf = browser.new_page(viewport={'width': 915, 'height': 412})
    perf.goto('file://' + os.path.abspath('dist/index.html') + '?pose=51&hud&quality=high')
    perf.wait_for_function('!!window.__frameReady', timeout=240000)
    checks_perf = perf.evaluate('window.__frameReady')
    print(json.dumps({'pose51High': checks_perf}))
    browser.close()

    checks['noErrors'] = not errors
    print(json.dumps({'checks': checks, 'errors': errors[:5]}, indent=1))
    print('ALL PASS' if all(checks.values()) else 'FAIL')
