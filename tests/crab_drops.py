import os, json, statistics, sys
from playwright.sync_api import sync_playwright

BASE = 'file://' + os.path.abspath('dist/index.html')
URL = BASE + '?quality=low&dpr=0.5'
RUNS = 10
DAY_MS = 24 * 3600 * 1000

HELPERS = r'''
window.__drops = (() => {
  const d = window.__debug;
  const step = (seconds, until) => { let t = 0; for (; t < seconds; t += 1/60) { d.simulate(1/60); if (until && until()) break; } return t; };
  const silenceOthers = (keep) => { for (const enemy of d.enemies.list) if (!keep.includes(enemy) && !enemy.definition.dailyBoss) Object.assign(enemy, { state: 'dead', respawnTimer: 1e9 }); for (const enemy of d.enemies.list) if (!keep.includes(enemy) && enemy.definition.dailyBoss && enemy.state !== 'dead') Object.assign(enemy, { state: 'dead', respawnTimer: 1e9 }); };
  const place = (x, z) => { if (d.isUnderground()) d.exitBurrow(); const spot = d.navigation.nearestWalkable(x, z, 20); Object.assign(d.player, { x: spot.x, z: spot.z, path: [], pathIndex: 0, combatTarget: null, gatherTarget: null, speed: 0, inkedUntil: 0 }); return spot; };
  const equip = (shell, shellInvestment, claws, clawInvestment) => d.equipBuild(shell, claws, shellInvestment > 0 || clawInvestment > 0);
  const arenas = {
    giantLobster: { lair: { x: -62, z: 96 }, stand: { x: -62, z: 89 } },
    shipCat: { lair: { x: -97, z: -63 }, stand: { x: -97, z: -54 } },
    cook: { lair: { x: 106, z: -64 }, stand: { x: 100, z: -65 } },
  };
  function fight(kind, level, shell, shellInvestment, claws, clawInvestment, fed) {
    d.progression.setLevel(level);
    d.progression.state.experience = -1e9;
    d.progression.state.health = d.progression.maxHealth();
    equip(shell, shellInvestment, claws, clawInvestment);
    d.save.inventory = {};
    while (d.remains.list.length) d.remains.remove(d.remains.list[0]);
    const arena = arenas[kind];
    place(arena.stand.x, arena.stand.z);
    const boss = d.enemies.spawn(kind, arena.lair.x, arena.lair.z);
    silenceOthers([boss]);
    d.player.lastCombatTime = -100;
    d.player.wellFedUntil = fed ? d.simulationTime() + 999 : 0;
    d.enemies.startChase(boss);
    const seconds = step(300, () => { if (boss.state !== 'dying' && boss.state !== 'dead' && d.player.combatTarget !== boss) d.engage(boss); return boss.state === 'dying' || boss.state === 'dead' || d.remains.list.length > 0; });
    const won = boss.state === 'dying' || boss.state === 'dead';
    return { won, seconds, health: won ? d.progression.state.health : 0 };
  }
  return { step, place, fight, equip, silenceOthers };
})();
'''

def summarize(results):
    wins = [r for r in results if r['won']]
    return {'wins': f"{len(wins)}/{len(results)}", 'seconds': round(statistics.mean(r['seconds'] for r in results), 1), 'healthLeft': round(statistics.mean(r['health'] for r in results), 1)}

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
    page.evaluate("() => __debug.setPaused(true)")
    page.evaluate(HELPERS)
    checks = {}

    loot = page.evaluate(r"""() => {
      const d = window.__debug; const c = window.__drops; const out = {};
      const cook = d.enemies.list.find((e) => e.kind === 'cook');
      c.equip('skull', 9, 'fork', 9);
      d.save.inventory = {};
      d.randomSource.next = () => 0.5;
      d.dropLoot(cook);
      out.materialOnly = { apronScrap: d.save.inventory.apronScrap || 0, cleavers: d.gear.state.claws.filter((i) => i.kind === 'cleaver').length };
      out.restingHours = +(d.bossRestRemainingMs('cook') / 3600000).toFixed(2);
      d.randomSource.next = () => 0.05;
      d.dropLoot(cook);
      out.withItem = { apronScrap: d.save.inventory.apronScrap || 0, cleavers: d.gear.state.claws.filter((i) => i.kind === 'cleaver').length };
      d.randomSource.next = Math.random;
      const trophies = { gull: 'gullFeather', giantLobster: 'lobsterPlate', shipCat: 'catWhisker', cook: 'apronScrap' };
      out.trophyMaterials = Object.fromEntries(Object.entries(trophies).map(([kind, material]) => { d.save.inventory = {}; d.dropLoot(d.enemies.list.find((e) => e.kind === kind)); return [kind, (d.save.inventory[material] || 0) === 2]; }));
      const regions = { beach: { x: 20, z: -20 }, reef: { x: 10, z: 80 }, camp: { x: -84, z: -60 }, hold: { x: 88, z: -68 } };
      const allowed = { beach: ['shellBits', 'driftwood', 'seaLettuce'], reef: ['coral', 'seaGlass'], camp: ['scrap', 'cloth'], hold: ['fishBone', 'wax'] };
      out.common = {};
      for (const [region, spot] of Object.entries(regions)) {
        d.save.inventory = {};
        const fake = { kind: 'rat', definition: d.enemies.list.find((e) => e.kind === 'rat').definition, x: spot.x, z: spot.z, y: 0, altitude: 0 };
        const kills = 4000;
        for (let index = 0; index < kills; index++) d.dropLoot(fake);
        const total = Object.values(d.save.inventory).reduce((sum, value) => sum + value, 0);
        out.common[region] = { rate: +(total / kills).toFixed(3), regionMatches: d.regionAt(spot.x, spot.z) === region, onlyRegion: Object.keys(d.save.inventory).every((type) => allowed[region].includes(type)) };
      }
      return out;
    }""")
    print('loot', json.dumps(loot), flush=True)
    checks['bossMaterialAlways'] = loot['materialOnly'] == {'apronScrap': 2, 'cleavers': 0} and all(loot['trophyMaterials'].values())
    checks['bossItemChance'] = loot['withItem'] == {'apronScrap': 4, 'cleavers': 1}
    checks['restsOneDay'] = 23.9 < loot['restingHours'] <= 24
    checks['commonDrops'] = all(0.065 < r['rate'] < 0.095 and r['regionMatches'] and r['onlyRegion'] for r in loot['common'].values())

    resting = page.evaluate(r"""() => {
      const d = window.__debug; const c = window.__drops; const out = {};
      d.save.bossDefeatedAt = {};
      const cat = d.enemies.spawn('shipCat', -97, -63);
      c.silenceOthers([cat]);
      cat.health = 1; d.engage(cat);
      c.place(-97, -57);
      d.progression.setLevel(10); d.progression.state.health = d.progression.maxHealth();
      c.equip('tinCan', 9, 'fishhook', 9);
      c.step(20, () => cat.state === 'dead');
      out.killed = cat.state === 'dead';
      out.whiskers = d.save.inventory.catWhisker || 0;
      c.step(30);
      out.staysDead = cat.state === 'dead';
      out.label = (() => { c.place(-97, -50); d.updateCamera(1, true); d.renderScene(); const bar = [...document.querySelectorAll('#hud .enemy-bar.resting')].map((b) => b.textContent); return bar[0] || null; })();
      d.advanceWallClock(23 * 3600000);
      c.step(5);
      out.deadAfter23h = cat.state === 'dead';
      d.advanceWallClock(3600000 + 1000);
      c.place(20, -20);
      c.step(15, () => cat.state !== 'dead');
      out.backAfter24h = cat.state !== 'dead';
      d.persist();
      return out;
    }""")
    print('resting', json.dumps(resting), flush=True)
    checks['bossRests24h'] = resting['killed'] and resting['whiskers'] == 2 and resting['staysDead'] and resting['deadAfter23h'] and resting['backAfter24h'] and resting['label'] is not None and 'returns in' in resting['label']

    page.evaluate("() => { const d = window.__debug; d.save.bossDefeatedAt = { cook: Date.now() - 3600000 }; d.persist(); }")
    page.reload()
    page.wait_for_function('!!window.__debug', timeout=180000)
    reload_state = page.evaluate("() => { const d = window.__debug; const cook = d.enemies.list.find((e) => e.kind === 'cook'); const lobster = d.enemies.list.find((e) => e.kind === 'giantLobster'); return { cookDead: cook.state === 'dead', lobsterAlive: lobster.state !== 'dead', hours: +(d.bossRestRemainingMs('cook') / 3600000).toFixed(1) }; }")
    print('reload', json.dumps(reload_state), flush=True)
    checks['restSurvivesReload'] = reload_state['cookDead'] and reload_state['lobsterAlive'] and 22.9 < reload_state['hours'] < 23.1

    page.evaluate("() => __debug.setPaused(true)")
    page.evaluate(HELPERS)
    crafting = page.evaluate(r"""() => {
      const d = window.__debug; const out = {};
      d.save.inventory = { gullFeather: 3, driftwood: 4, shellBits: 4, lobsterPlate: 3, coral: 4, seaGlass: 2, catWhisker: 3, scrap: 10, cloth: 2, apronScrap: 3, fishBone: 4 };
      out.crafted = ['claws:quill', 'shell:lobster', 'claws:whisker', 'claws:cleaver'].map((key) => { const [category, kind] = key.split(':'); return !!d.craftItem(category, kind); });
      out.leftover = Object.values(d.save.inventory).reduce((sum, value) => sum + value, 0);
      window.__drops.equip('snail', 0, 'whisker', 0);
      out.swiftFactor = d.playerStats().attackIntervalFactor;
      window.__drops.equip('snail', 0, 'fork', 0);
      out.normalFactor = d.playerStats().attackIntervalFactor;
      return out;
    }""")
    print('crafting', json.dumps(crafting), flush=True)
    checks['trophyRecipes'] = all(crafting['crafted']) and crafting['leftover'] == 0
    checks['swift'] = crafting['swiftFactor'] == 0.8 and crafting['normalFactor'] == 1

    sheen = page.evaluate(r"""() => {
      const d = window.__debug; const out = {};
      const glowOf = (quality) => { d.gear.state.shells = [{ id: 500, kind: 'tinCan', quality }]; d.gear.state.wornShellId = 500; d.equipBuild && 0; d.wearItem(500); d.simulate(1 / 60); const mesh = d.scene.getObjectsByProperty('isInstancedMesh', true).find((m) => m.geometry.type === 'IcosahedronGeometry' && m.material.blending === 2); return { particles: mesh && mesh.visible ? mesh.count : 0 }; };
      out.fine = glowOf('fine');
      out.masterwork = glowOf('masterwork');
      return out;
    }""")
    print('sheen', json.dumps(sheen), flush=True)
    checks['masterworkSheenWithoutParticles'] = sheen['fine']['particles'] == 0 and sheen['masterwork']['particles'] == 0

    page.evaluate(HELPERS)
    scenarios = {
        'lobster L10 coral★ coralTipped★ fed': "'giantLobster', 10, 'coral', 4, 'coralTipped', 4, true",
        'lobster L10 lobster★ coralTipped★ fed': "'giantLobster', 10, 'lobster', 4, 'coralTipped', 4, true",
        'cat L10 tinCan★ fishhook★ fed': "'shipCat', 10, 'tinCan', 4, 'fishhook', 4, true",
        'cat L10 tinCan★ whisker★ fed': "'shipCat', 10, 'tinCan', 4, 'whisker', 4, true",
        'cook L10 skull★ fork★ fed': "'cook', 10, 'skull', 4, 'fork', 4, true",
        'cook L10 skull★ cleaver★ fed': "'cook', 10, 'skull', 4, 'cleaver', 4, true",
    }
    balance = {}
    for name, arguments in scenarios.items():
        results = [page.evaluate(f"() => __drops.fight({arguments})") for _ in range(RUNS)]
        balance[name] = summarize(results)
        print(name, balance[name], flush=True)
    wins = lambda name: int(balance[name]['wins'].split('/')[0])
    better = lambda base, trophy: wins(trophy) > wins(base) or (wins(trophy) == wins(base) and balance[trophy]['healthLeft'] >= balance[base]['healthLeft'])
    checks['trophiesHelp'] = better('lobster L10 coral★ coralTipped★ fed', 'lobster L10 lobster★ coralTipped★ fed') and better('cat L10 tinCan★ fishhook★ fed', 'cat L10 tinCan★ whisker★ fed') and better('cook L10 skull★ fork★ fed', 'cook L10 skull★ cleaver★ fed')

    checks['noConsoleErrors'] = not errors
    if errors: print(errors[:5])
    browser.close()

print(json.dumps({'balance': balance, 'checks': checks}, indent=1))
sys.exit(0 if all(checks.values()) else 1)
