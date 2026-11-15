import os, json, sys
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    pg=b.new_page(viewport={'width':915,'height':412})
    errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto('file://'+os.path.abspath('dist/index.html')); pg.wait_for_function('!!window.__debug',timeout=120000)
    res=pg.evaluate('''(() => { const d=window.__debug; const c=d.character.state; const inv=d.save.inventory; const out={log:[]}; let t=0;
      const step=(sec, until)=>{ let s=0; for(;s<sec;s+=1/60){ d.simulate(1/60); if(until&&until()) break; } t+=s; };
      const walkTo=(x,z,until)=>{ d.character.setPath(d.walkGrid.findPath(c.x,c.z,x,z)); step(300, until); };
      const log=(m)=>out.log.push(m+' t='+t.toFixed(0)+' inv='+JSON.stringify(inv));
      const craft=(id,n=1)=>{ document.querySelector('#hud .craft-chip').click(); for(let i=0;i<n;i++){ const b=document.querySelector(`#hud [data-recipe=${id}]`); if(!b||b.disabled){ log('CANNOT craft '+id); return false;} b.click(); } return true; };
      const harvest=(kinds, until)=>{ let n=0; while(!until() && n<60){ n++;
          const node=d.vegetation.harvestables.filter(h=>kinds.includes(h.kind) && !h.harvested).sort((a,b)=>Math.hypot(a.x-c.x,a.z-c.z)-Math.hypot(b.x-c.x,b.z-c.z))[0];
          const sp=d.harvesting.approachPoint(node,c.x,c.z); d.character.setPath(d.walkGrid.findPath(c.x,c.z,sp.x,sp.z)); d.harvesting.begin(node);
          step(60, ()=>!d.harvesting.isBusy()); } return n; };
      out.quest0=document.querySelector('#hud .quest-chip').textContent;
      for (const it of d.items.items.filter(i=>i.zone==='start')) walkTo(it.x,it.z,()=>it.collected);
      harvest(['bush'], ()=> (inv.fiber??0)>=1); craft('axe'); log('axe');
      out.quest1=document.querySelector('#hud .quest-chip').textContent;
      harvest(['tree'], ()=> (inv.wood??0)>=13 && (inv.fronds??0)>=12); log('wood');
      harvest(['bush'], ()=> (inv.fiber??0)>=15); log('fiber');
      craft('diggingStick'); craft('rope',5); craft('paddle'); craft('raftFrame'); log('crafted');
      // dig trap near a boar
      const boar=d.wildlife.boars.filter(b=>b.state!=='gone').sort((a,b)=>Math.hypot(a.x-c.x,a.z-c.z)-Math.hypot(b.x-c.x,b.z-c.z))[0];
      walkTo((c.x+boar.homeX)/2, (c.z+boar.homeZ)/2, ()=>c.pathIndex>=c.path.length); craft('pitTrap'); out.placing=d.trapPlacement.active;
      d.digTrapAt(c.x+3, c.z); step(10, ()=>!d.groundTask.active); log('trap dug traps='+d.wildlife.traps.length);
      // walk away and wait for boars
      const trap=d.wildlife.traps[0]; let hides=0, waits=0;
      while (d.save.stats.hidesGathered<2 && waits<20) { waits++;
        d.character.setPath(d.walkGrid.findPath(c.x,c.z,trap.x-25,trap.z-25)); step(120, ()=>trap.state==='caught');
        if (trap.state==='caught'){ d.interactWithTrap(trap); step(20, ()=>!d.groundTask.active); log('butchered'); d.interactWithTrap(trap); step(20, ()=>!d.groundTask.active); } }
      out.waits=waits; log('hunt done');
      craft('hideSail'); log('sail');
      let spot=null; for(let r=8;r<80&&!spot;r+=2) for(let k=0;k<24;k++){ const a=k/24*6.283, x=c.x+Math.cos(a)*r, z=c.z+Math.sin(a)*r; if(d.ground.heightAt(x,z)>1.6&&d.walkGrid.isPointWalkable(x,z)&&d.walkGrid.findPath(c.x,c.z,x,z).length){spot={x,z};break;} }
      walkTo(spot.x,spot.z); d.buryHere('chest'); step(8,()=>!d.groundTask.active); d.coverDigPatch(d.treasure.caches[0]); step(5,()=>!d.groundTask.active); log('buried');
      out.questWhileWaiting=document.querySelector('#hud .quest-chip').textContent;
      out.navyChip=document.querySelector('#hud .navy-chip').textContent;
      step(900, ()=>d.save.navy.state==='landed', 0.25); log('navy landed'); step(420, ()=>d.save.navy.state==='gone'); out.navyFound=d.save.navy.found; log('navy gone');
      const cache=d.treasure.caches.find(k=>k.contents==='chest'); if(cache){ walkTo(cache.x,cache.z); d.digUpCache(cache); step(8,()=>!d.groundTask.active); } out.chestBack=d.save.inventory.treasureChest;
      out.questBeforeBuild=document.querySelector('#hud .quest-chip').textContent;
      const s=d.raftSite; walkTo(s.x,s.z,()=>Math.hypot(c.x-s.x,c.z-s.z)<12); step(0.5);
      out.action=document.querySelector('#hud .action').innerText; document.querySelector('#hud .action').click();
      step(4); document.querySelector('#hud .action').click(); out.mode=d.getMode(); out.minutes=(t/60).toFixed(1); out.hunger=d.save.hunger.toFixed(0);
      return out})()''')
    print(json.dumps(res,indent=1,ensure_ascii=False)); print('errors',errs)
    b.close()
