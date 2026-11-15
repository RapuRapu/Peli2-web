import os, sys, json
from playwright.sync_api import sync_playwright

SETUP = r'''
window.__scene = (name) => {
  const d = window.__debug; const c = d.character.state;
  const step = (sec, until, dt = 1/30) => { for (let s = 0; s < sec; s += dt) { d.simulate(dt); if (until && until()) return s; } return sec; };
  const walkTo = (x, z) => { d.character.setPath(d.walkGrid.findPath(c.x, c.z, x, z)); step(60, () => c.pathIndex >= c.path.length); };
  const findSpot = (minH, maxH, from, rMin) => { for (let r = rMin; r < 160; r += 2) for (let k = 0; k < 24; k++) { const a = k / 24 * 6.283, x = from.x + Math.cos(a) * r, z = from.z + Math.sin(a) * r, h = d.ground.heightAt(x, z); if (h > minH && h < maxH && d.walkGrid.isPointWalkable(x, z) && d.walkGrid.findPath(c.x, c.z, x, z).length) return { x, z }; } return null; };
  d.performanceMonitor.setVisible(false);
  d.save.inventory = { treasureChest: 1, diggingStick: 1, axe: 1, fronds: 4, coconut: 1, pickaxe: 1, decoyChest: 1 };
  d.save.worldTime = 160; step(0.2);
  if (name === 'buried') {
    const spot = findSpot(1.5, 3, c, 12); walkTo(spot.x, spot.z); d.buryHere('chest'); step(8, () => !d.groundTask.active);
    const away = findSpot(1.5, 4, c, 6); walkTo(away.x, away.z);
  }
  if (name === 'navy') {
    const spot = findSpot(1.5, 3, c, 12); walkTo(spot.x, spot.z); d.buryHere('chest'); step(8, () => !d.groundTask.active);
    d.save.inventory.fronds = 2; d.coverDigPatch(d.treasure.caches[0]); step(5, () => !d.groundTask.active);
    d.save.worldTime = 716; step(30, () => d.getNavy() && d.getNavy().search.state === 'searching'); step(14);
    const n = d.getNavy(); const m = n.marines[0].body.state; const near = findSpot(0.8, 5, m, 9); if (near) walkTo(near.x, near.z);
  }
  if (name === 'crabs') {
    d.save.worldTime = 100; const k = d.crabs; k.thieves.forEach(t => t.cooldown = 0); step(60, () => k.thieves.some(t => t.state === 'fleeing'));
    const thief = k.thieves.find(t => t.state === 'fleeing') || k.thieves[0]; step(2.5);
    const near = findSpot(0.8, 4, thief, 9); if (near) d.character.place(near.x, near.z, 0); step(0.5);
  }
  if (name === 'migration') {
    const beach = findSpot(1.0, 2.0, c, 2); walkTo(beach.x, beach.z);
    d.save.inventory.coconut = 1; d.interactWithCrab({ kind: 'digger', crab: d.crabs.diggers[0] }); step(40, () => !d.groundTask.active);
    walkTo(beach.x, beach.z); d.save.worldTime = 205; step(4);
  }
  if (name === 'tunnel') {
    const spot = findSpot(3, 30, c, 10); walkTo(spot.x, spot.z); d.digTunnelEntrance(); step(12, () => !d.groundTask.active);
    d.enterTunnel(); step(0.3); const T = d.tunnels.state; const ray = d.raycaster.ray;
    const tap = (dx, dz) => { ray.origin.set(T.x + dx, -300 + 30, T.z + dz); ray.direction.set(0, -1, 0); d.tapUnderground(); step(12, () => !d.tunnels.task.active && c.pathIndex >= c.path.length); };
    for (const [dx, dz] of [[2,0],[4,0],[6,0],[6,2],[6,4],[0,-2],[0,-4],[-2,-4]]) tap(dx, dz);
    d.buryUnderground('chest'); step(6, () => !d.tunnels.task.active);
    tap(6, 4); tap(6, 6); step(1);
  }
  if (name === 'entrance') {
    const spot = findSpot(3, 30, c, 10); walkTo(spot.x, spot.z); d.digTunnelEntrance(); step(12, () => !d.groundTask.active);
    const away = findSpot(2, 30, d.tunnels.state, 4); walkTo(away.x, away.z); step(1);
  }
  return true;
};
'''

def shoot(out_dir, names, portrait=False):
    os.makedirs(out_dir, exist_ok=True)
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        for name in names:
            vp = {'width': 412, 'height': 915} if portrait else {'width': 915, 'height': 412}
            pg = b.new_page(viewport=vp, device_scale_factor=2)
            errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.goto('file://' + os.path.abspath('dist/index.html')); pg.wait_for_function('!!window.__debug', timeout=120000)
            pg.evaluate(SETUP); pg.evaluate(f'window.__scene({json.dumps(name)})')
            pg.wait_for_timeout(4000)
            path = f'{out_dir}/{name}{"-p" if portrait else ""}.png'
            pg.screenshot(path=path)
            print(path, errs[:2])
            pg.close()
        b.close()

if __name__ == '__main__':
    shoot(sys.argv[1], sys.argv[2].split(','), len(sys.argv) > 3 and sys.argv[3] == 'p')
