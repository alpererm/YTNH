// Native macOS menu bar: every item in src-tauri/src/menu.rs maps to something in the page, and choosing an
// item runs the same command as its shortcut or ☰ entry.
const assert=require('node:assert/strict');const fs=require('node:fs');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const path=require('node:path');const {pathToFileURL}=require('node:url');
(async()=>{
 const menu=fs.readFileSync(path.resolve(__dirname,'../src-tauri/src/menu.rs'),'utf8');
 const ids=[...menu.matchAll(/item\(app, "([^"]+)"/g)].map(m=>m[1]);
 assert(ids.length>25,'menu items found');
 const browser=await (process.env.BROWSER_ENGINE==='webkit'?webkit:chromium).launch(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{});
 const p=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(()=>Object.defineProperty(navigator,'platform',{get:()=>'MacIntel'}));
 await p.goto(pathToFileURL(path.resolve(__dirname,'../app.html')).href);
 await p.evaluate(()=>{autosaveEnabled=false;installDatabase(createEmptyDatabase());const i=createItem(db,'Note');i.title='Start';selected=i.id;render();showCalendar();focusOutlineItem(i.id)});
 // Every click:/text:/fn: target exists.
 const missing=await p.evaluate(ids=>ids.filter(id=>{const [k,...r]=id.split(':'),a=r.join(':');
   if(k==='click')return !document.getElementById(a);
   if(k==='text')return ![...document.querySelectorAll('#appMenu button')].some(b=>b.textContent.trim()===a);
   if(k==='fn')return !['settings','quickOpen','help','tour'].includes(a);
   return k!=='key';}),ids);
 assert.deepEqual(missing,[],'every menu item has a target');
 const send=id=>p.evaluate(id=>window.dispatchEvent(new CustomEvent('ytnh-menu',{detail:id})),id);
 await send('key:Mod+N');await p.waitForTimeout(100);
 assert.equal(await p.evaluate(()=>db.items.length),2,'File → New Note');
 await p.keyboard.press('Escape');await p.evaluate(()=>{const s=db.items[0];selected=s.id;showCalendar();focusOutlineItem(s.id)});
 await send('key:Mod+4');await p.waitForTimeout(100);
 assert.equal(await p.evaluate(()=>calendarMode),'years','View → Targets');
 await send('key:Mod+3');await p.waitForTimeout(100);
 assert.equal(await p.evaluate(()=>calendarMode),'weeks','View → Calendar');
 const planner=await p.evaluate(()=>$('dailyPlanner').hidden);await send('key:Mod+Shift+D');await p.waitForTimeout(100);
 assert.equal(await p.evaluate(()=>$('dailyPlanner').hidden),!planner,'View → Daily Planner');
 await send('fn:settings');assert.equal(await p.evaluate(()=>$('modalTitle').textContent),'Settings','YTNH → Settings…');
 await send('fn:help');assert.equal(await p.evaluate(()=>$('modalTitle').textContent),'Help','Help → YTNH Help (closes Settings first)');
 await p.keyboard.press('Escape');
 await send('key:Mod+Shift+F');await p.waitForTimeout(100);
 assert.equal(await p.evaluate(()=>document.activeElement.id),'search','Go → Search the Outline');
 assert.deepEqual(errors,[]);await browser.close();console.log('PASS native menu items map to page commands');
})().catch(e=>{console.error(e);process.exit(1)});
