import os, json, statistics, sys
from playwright.sync_api import sync_playwright

BASE = 'file://' + os.path.abspath('dist/index.html')
URL = BASE + '?quality=low&dpr=0.5&norender' + os.environ.get('CRAB_QUERY', '')
RUNS = 10

HELPERS = r'''
window.__hold = (() => {
  const d = window.__debug;
  const step = (seconds, until) => { let t = 0; for (; t < seconds; t += 1/60) { d.simulate(1/60); if (until && until()) break; } return t; };
  const silenceOthers = (keep) => { for (const enemy of d.enemies.list) if (!keep.includes(enemy)) Object.assign(enemy, { state: 'dead', respawnTimer: 1e9 }); };
  const place = (x, z) => { if (d.isUnderground()) d.exitBurrow(); const spot = d.navigation.nearestWalkable(x, z, 20); Object.assign(d.player, { x: spot.x, z: spot.z, path: [], pathIndex: 0, combatTarget: null, gatherTarget: null, speed: 0, inkedUntil: 0 }); return spot; };
  const equip = (shell, shellInvestment, claws, clawInvestment) => d.equipBuild(shell, claws, shellInvestment > 0 || clawInvestment > 0);
  function setup(kind, count, level, shell, shellInvestment, claws, clawInvestment, fed) {
    d.progression.setLevel(level);
    d.progression.state.experience = -1e9;
    d.progression.state.health = d.progression.maxHealth();
    equip(shell, shellInvestment, claws, clawInvestment);
    d.save.inventory = {};
    while (d.remains.list.length) d.remains.remove(d.remains.list[0]);
    const enemies = [];
    if (kind === 'cook') {
      place(106 - 6, -64 - 1);
      enemies.push(d.enemies.spawn('cook', 106, -64));
    } else {
      const spot = place(82, -66);
      for (let index = 0; index < count; index++) {
        const enemySpot = d.navigation.nearestWalkable(spot.x - 3 - index * 1.5, spot.z + 1.5 - index * 3, 10);
        enemies.push(d.enemies.spawn(kind, enemySpot.x, enemySpot.z, index));
      }
    }
    silenceOthers(enemies);
    d.player.lastCombatTime = -100;
    d.player.wellFedUntil = fed ? d.simulationTime() + 999 : 0;
    return enemies;
  }
  function fight(kind, count, level, shell, shellInvestment, claws, clawInvestment, fed) {
    const enemies = setup(kind, count, level, shell, shellInvestment, claws, clawInvestment, fed);
    const living = () => enemies.filter((enemy) => enemy.state !== 'dying' && enemy.state !== 'dead');
    for (const enemy of enemies) d.enemies.startChase(enemy);
    const seconds = step(300, () => { const target = living()[0]; if (target && d.player.combatTarget !== target) d.engage(target); return !target || d.remains.list.length > 0; });
    const won = living().length === 0;
    return { won, seconds, health: won ? d.progression.state.health : 0 };
  }
  return { step, setup, fight, place, silenceOthers };
})();
'''

def summarize(results):
    wins = [r for r in results if r['won']]
    return {'wins': f"{len(wins)}/{len(results)}", 'seconds': round(statistics.mean(r['seconds'] for r in results), 1), 'healthLeft': round(statistics.mean(r['health'] for r in results), 1)}

def frame_numbers(context, pose):
    page = context.new_page()
    page.goto(f'{BASE}?pose={pose}&quality=high')
    page.wait_for_function('!!window.__frameReady', timeout=240000)
    numbers = page.evaluate('() => window.__frameReady')
    page.close()
    return numbers

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    context = browser.new_context(viewport={'width': 915, 'height': 412})
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('console', lambda message: errors.append(message.text[:400]) if message.type == 'error' else None)
    page.goto(URL)
    page.wait_for_function('!!window.__debug', timeout=180000)
    page.evaluate("() => localStorage.clear()")
    page.reload()
    page.wait_for_function('!!window.__debug', timeout=180000)
    checks = {}

    area = page.evaluate(r"""() => {
      const d = window.__debug; const w = d.world; const out = {};
      const nodes = d.resources.nodes.filter((n) => n.type === 'fishBone' || n.type === 'wax');
      out.counts = { fishBone: nodes.filter((n) => n.type === 'fishBone').length, wax: nodes.filter((n) => n.type === 'wax').length };
      const home = { x: d.player.x, z: d.player.z };
      out.reachable = nodes.filter((n) => { const spot = d.navigation.nearestWalkable(n.x, n.z, 4); return spot && d.navigation.findPath(home.x, home.z, spot.x, spot.z).length > 0; }).length;
      out.cookReachable = d.navigation.findPath(home.x, home.z, 100, -64).length > 0;
      out.insideReachable = d.navigation.findPath(home.x, home.z, 88, -68).length > 0;
      out.beachItemsInHold = d.resources.nodes.filter((n) => !['fishBone', 'wax'].includes(n.type) && !n.gathered && w.isInHold(n.x, n.z)).length;
      out.holdEnemies = { cockroaches: d.enemies.list.filter((e) => e.kind === 'cockroach').length, cooks: d.enemies.list.filter((e) => e.kind === 'cook').length, ratsInHold: d.enemies.list.filter((e) => e.kind === 'rat' && w.isInHold(e.x, e.z)).length };
      out.propsBlock = w.holdProps.filter((p) => p.kind !== 'fishBones').every((p) => !w.isWalkable(p.x, p.z));
      return out;
    }""")
    print('area', json.dumps(area), flush=True)
    checks['holdArea'] = area['counts'] == {'fishBone': 10, 'wax': 8} and area['reachable'] == 18 and area['cookReachable'] and area['insideReachable'] and area['beachItemsInHold'] == 0 and area['holdEnemies']['cockroaches'] == 6 and area['holdEnemies']['cooks'] == 1 and area['propsBlock']

    goal = page.evaluate(r"""async () => {
      const d = window.__debug; const out = {};
      const step = (seconds, until) => { let t = 0; for (; t < seconds; t += 1/60) { d.simulate(1/60); if (until && until()) break; } return t; };
      const goalText = () => { const goal = document.querySelector('#hud .goal'); return goal.classList.contains('hidden') ? null : goal.textContent; };
      d.setPaused(false);
      for (const enemy of d.enemies.list) Object.assign(enemy, { state: 'dead', respawnTimer: 1e9 });
      Object.assign(d.save.inventory, { shellBits: 8, driftwood: 3, seaLettuce: 3 });
      d.buildWorkshop();
      d.save.inventory.shellBits = 3;
      d.craftItem('shell', 'snail');
      if (d.isUnderground()) d.exitBurrow();
      Object.assign(d.save, { reefFound: true, reefGearCrafted: true, campFound: true });
      Object.assign(d.save.inventory, { scrap: 6, cloth: 3, coral: 4 });
      d.craftItem('shell', 'tinCan');
      out.goal = goalText();
      document.querySelector('#hud .goal').click();
      const target = d.player.gatherTarget;
      out.walksToBone = !!target && target.type === 'fishBone';
      out.walkSeconds = +step(240, () => d.save.holdFound).toFixed(1);
      out.holdFound = d.save.holdFound;
      out.goalAfter = goalText();
      step(60, () => target.gathered);
      out.boneInBag = d.save.inventory.fishBone || 0;
      d.persist();
      return out;
    }""")
    print('goal', json.dumps(goal), flush=True)
    checks['shipwreckGoal'] = goal['goal'] == '⚓ Explore the shipwreck' and goal['walksToBone'] and goal['holdFound'] and goal['goalAfter'] is None and goal['boneInBag'] == 1

    page.evaluate("() => __debug.setPaused(true)")
    page.evaluate(HELPERS)
    scenarios = {
        'three roaches L10 coral★ coralTipped★': "'cockroach', 3, 10, 'coral', 3, 'coralTipped', 3, false",
        'three roaches L10 tinCan★ fishhook★': "'cockroach', 3, 10, 'tinCan', 3, 'fishhook', 3, false",
        'cook L10 tinCan★ fishhook★ fed': "'cook', 1, 10, 'tinCan', 6, 'fishhook', 6, true",
        'cook L10 skull fork fed': "'cook', 1, 10, 'skull', 0, 'fork', 0, true",
        'cook L10 skull★ fork★ fed': "'cook', 1, 10, 'skull', 6, 'fork', 6, true",
        'cook L10 thimble★ fork★ fed': "'cook', 1, 10, 'thimble', 6, 'fork', 6, true",
    }
    balance = {}
    for name, arguments in scenarios.items():
        results = [page.evaluate(f"() => __hold.fight({arguments})") for _ in range(RUNS)]
        balance[name] = summarize(results)
        print(name, balance[name], flush=True)
    wins = lambda name: int(balance[name]['wins'].split('/')[0])
    checks['roachesGateTier2'] = wins('three roaches L10 coral★ coralTipped★') <= 3 and wins('three roaches L10 tinCan★ fishhook★') >= 6
    checks['cookNeedsTier4Enchanted'] = wins('cook L10 tinCan★ fishhook★ fed') <= 3 and wins('cook L10 skull fork fed') <= 3 and wins('cook L10 skull★ fork★ fed') >= 7

    behaviour = page.evaluate(r"""() => {
      const d = window.__debug; const c = window.__hold; const out = {};
      const [cook] = c.setup('cook', 1, 10, 'skull', 9, 'fork', 0, false);
      cook.health = 1e5;
      c.place(70, -66); c.step(2);
      out.cookIgnoresOutside = cook.state === 'idle';
      c.place(106 - 12, -64); c.step(3, () => cook.zone);
      out.chopTelegraphed = !!(cook.zone && cook.zone.shape === 'line');
      const zone = cook.zone; const healthBefore = d.progression.state.health;
      d.player.combatTarget = null;
      c.place(d.player.x + Math.cos(zone.angle) * 5, d.player.z - Math.sin(zone.angle) * 5);
      c.step(zone.timer + 0.3);
      out.chopDodged = d.progression.state.health >= healthBefore;
      out.cookStaysPut = Math.hypot(cook.x - 106, cook.z + 64) < 0.5;
      c.place(106 - 5, -64); d.engage(cook);
      c.step(15, () => cook.zone && cook.zone.stomp);
      out.stompAfterTwoChops = !!(cook.zone && cook.zone.stomp) && cook.strikesMade === 2;
      const skullStats = (() => { c.setup('cockroach', 1, 10, 'skull', 0, 'fork', 0, false); return d.playerStats(); })();
      out.skullDread = skullStats.ability && skullStats.ability.dreadFactor === 0.8;
      const thimbleStats = (() => { c.setup('cockroach', 1, 10, 'thimble', 0, 'fork', 0, false); return d.playerStats(); })();
      out.thimbleStingEvery2 = thimbleStats.ability && thimbleStats.ability.everyHits === 2;
      const [roach] = c.setup('cockroach', 1, 10, 'skull', 0, 'fork', 0, false);
      d.enemies.startChase(roach);
      const before = d.progression.state.health; c.step(1.2, () => d.progression.state.health < before);
      const withDread = before - d.progression.state.health;
      out.dreadDamage = withDread;
      return out;
    }""")
    print('behaviour', json.dumps(behaviour), flush=True)
    checks['cookAttacks'] = behaviour['cookIgnoresOutside'] and behaviour['chopTelegraphed'] and behaviour['chopDodged'] and behaviour['cookStaysPut'] and behaviour['stompAfterTwoChops']
    checks['tier4Abilities'] = behaviour['skullDread'] and behaviour['thimbleStingEvery2']

    performance = {'start': frame_numbers(context, 1), 'holdOverview': frame_numbers(context, 84), 'inHold': frame_numbers(context, 85)}
    print('performance', json.dumps(performance), flush=True)
    checks['performance'] = performance['start']['calls'] <= 86 and performance['start']['triangles'] < 1115000 and performance['inHold']['calls'] <= 106
    checks['noConsoleErrors'] = not errors
    if errors: print(errors[:5])
    browser.close()

print(json.dumps({'balance': balance, 'checks': checks}, indent=1))
sys.exit(0 if all(checks.values()) else 1)
