import os
import sys
from playwright.sync_api import sync_playwright

out_dir = sys.argv[1] if len(sys.argv) > 1 else 'shots/cook'
distance = float(sys.argv[2]) if len(sys.argv) > 2 else 70
side_view = len(sys.argv) > 3 and sys.argv[3] == 'side'
top_view = len(sys.argv) > 3 and sys.argv[3] == 'top'
os.makedirs(out_dir, exist_ok=True)

SHOTS = [
    ('walk', "const s = d.enemies.list.find((e) => e.kind === 'cook').entry.stations[0]; c.activityTimer = 0; c.stationIndex = 1; d.simulate(1 / 60); for (let i = 0; i < 90; i++) d.simulate(1 / 30);", None),
    ('chopBlock', "const s = c.entry.stations[2]; Object.assign(c, { x: s.x, z: s.z, heading: s.heading, stationIndex: 2, activityTimer: 6, path: [] }); for (let i = 0; i < 25; i++) d.simulate(1 / 30);", None),
    ('slamWindup', "Object.assign(c, { x: 68, z: -66, heading: 0.3, path: [] }); Object.assign(d.player, { x: c.x + Math.sin(c.heading) * 9, z: c.z + Math.cos(c.heading) * 9 }); c.activityTimer = 0; d.enemies.startChase(c); for (let i = 0; i < 400 && !c.zone; i++) d.simulate(1 / 60); for (let i = 0; i < 40; i++) d.simulate(1 / 60);", None),
    ('slamDown', "for (let i = 0; i < 400 && c.zone && c.zone.timer > 0.06; i++) d.simulate(1 / 60);", None),
    ('slamAfter', "for (let i = 0; i < 12; i++) d.simulate(1 / 60);", None),
    ('stomp', "c.strikesMade = 2; c.cooldown = 0; c.zone = null; Object.assign(d.player, { x: c.x + Math.sin(c.heading) * 6, z: c.z + Math.cos(c.heading) * 6 }); for (let i = 0; i < 400 && !(c.zone && c.zone.stomp); i++) d.simulate(1 / 60); for (let i = 0; i < 50; i++) d.simulate(1 / 60);", None),
    ('flee', "c.zone = null; d.enemies.damage(c, 1e6, 100); for (let i = 0; i < 40; i++) d.simulate(1 / 60);", None),
]

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    page = browser.new_page(viewport={'width': 915, 'height': 412}, device_scale_factor=2)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(f'file://{os.path.abspath("dist/index.html")}?pose=85')
    page.wait_for_function('!!window.__frameReady', timeout=180000)
    page.evaluate(f"""(() => {{ const d = window.__debug; d.setRendering(false);
      for (const enemy of d.enemies.list) if (enemy.kind !== 'cook') Object.assign(enemy, {{ state: 'dead', respawnTimer: 1e9 }});
      window.__cook = d.enemies.list.find((e) => e.kind === 'cook');
      const s = window.__cook.entry.stations[0];
      d.enemies.spawn('cook', s.x, s.z);
      d.progression.state.health = 1e6; d.enemies.calmAll(1e9, 0); window.__cook.state = 'idle';
      d.setCameraDistance({distance}); }})()""")
    for name, action, _ in SHOTS:
        top = "const px = d.player.x, pz = d.player.z; d.camera.position.set(px + 0.1, c.y + 70, pz - 20); d.camera.lookAt(px, c.y, pz); d.camera.updateMatrixWorld();" if top_view else ''
        side = "const h = c.heading + Math.PI / 2; d.camera.position.set(c.x + Math.sin(h) * 55, c.y + 24, c.z + Math.cos(h) * 55); d.camera.lookAt(c.x, c.y + 18, c.z); d.camera.updateMatrixWorld();" if side_view else ''
        page.evaluate(f"(() => {{ const d = window.__debug; const c = window.__cook; {action} d.updateCamera(0, true); {side} {top} d.setRendering(true); d.renderScene(); d.setRendering(false); }})()")
        state = page.evaluate("(() => { const c = window.__cook; const w = (name) => { let f = null; c.creature.object.traverse((n) => { if (n.name === name) f = n; }); if (!f) return null; const v = f.getWorldPosition(f.position.clone().set(0,0,0)); return [+(v.x - c.x).toFixed(1), +(v.y - c.y).toFixed(1), +(v.z - c.z).toFixed(1)]; }; const local = (v) => v && [+(v[0] * Math.cos(c.heading) - v[2] * Math.sin(c.heading)).toFixed(1), +(v[0] * Math.sin(c.heading) + v[2] * Math.cos(c.heading)).toFixed(1)]; const z = c.zone && c.zone.shape === 'line' ? c.zone : c.lastChop; let onLine = null; if (z) { let cl = null; c.creature.object.traverse((n) => { if (n.name === 'cleaver') cl = n; }); const bladeCenter = cl.localToWorld(cl.position.clone().set(-0.45, 0, 0)); const dx = bladeCenter.x - z.x, dz = bladeCenter.z - z.z; onLine = { along: +(dx * Math.sin(z.angle) + dz * Math.cos(z.angle)).toFixed(1), side: +(dx * Math.cos(z.angle) - dz * Math.sin(z.angle)).toFixed(1), height: +(bladeCenter.y - c.y).toFixed(1), halfLength: z.length / 2 }; } return { onLine, side_forward: local(w('cleaver')), R: w('mixamorigRightHand'), L: w('mixamorigLeftHand'), cl: w('cleaver'), state: c.state, x: +c.x.toFixed(1), z: +c.z.toFixed(1), zone: c.zone ? +(1 - c.zone.timer / c.zone.duration).toFixed(2) : null, activity: c.activity, hurt: +c.hurt.toFixed(2), strike: +c.strike.toFixed(2), motion: +c.motion.toFixed(2) }; })()")
        print(name, state)
        page.screenshot(path=f'{out_dir}/{name}.png')
    print('errors', errors[:3])
    browser.close()
