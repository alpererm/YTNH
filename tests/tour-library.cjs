// The YTNH Tour: a valid practice library with seven chapters, examples dated around today (visible even
// on a weekend), a Daily Planner session, a Target and Milestone, working links, no accidental tags, and
// entry points on the welcome screen and in the ☰ menu.
const assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const path=require('node:path');const {pathToFileURL}=require('node:url');
(async()=>{
 const browser=await (process.env.BROWSER_ENGINE==='webkit'?webkit:chromium).launch(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{});
 const p=await browser.newPage({viewport:{width:1300,height:850}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.clock.setFixedTime(new Date(2026,10,22,10,30));// a Sunday
 await p.goto(pathToFileURL(path.resolve(__dirname,'../app.html')).href);
 assert.equal(await p.locator('#tree [data-welcome="tour"]').isVisible(),true,'welcome screen offers the Tour');
 assert.equal(await p.locator('#tourBtn').count(),1,'☰ menu has Open the Tour…');
 await p.locator('#tree [data-welcome="tour"]').click();
 await p.waitForFunction(()=>db&&db.items.length>20);
 const r=await p.evaluate(()=>{
   const roots=childrenOf(db,null).map(i=>i.title);
   let valid=true;try{validateDatabase(db)}catch(e){valid=e.message}
   const tags=db.items.flatMap(i=>[...(i.explicitTags||[]),...inheritedTags(db,i)]);
   const refs=db.items.flatMap(i=>[...String(i.content).matchAll(/\[\[@\{([^}]+)\}\]\]/g)].map(m=>m[1]));
   const visible=[...document.querySelectorAll('#tree .row .title')].map(t=>t.textContent);
   return {roots,valid,tags,refs:refs.map(id=>!!itemById(db,id)),headings:db.items.filter(i=>i.heading).map(i=>i.title),
     today:db.items.filter(i=>(i.scheduledDates||[]).includes('2026-11-22')).map(i=>i.title),
     sessions:Object.values(db.planner?.sessions||{}).map(s=>[s.date,s.start,s.duration]),
     target:db.items.find(i=>i.target)?.target,milestone:db.items.find(i=>i.milestone)?.milestone,recurring:db.items.filter(i=>i.recurrence).length,
     selected:itemById(db,selected)?.title,editor:editorIsOpen(),visible,waiting:db.items.find(i=>i.status==='Waiting for')?.title};
 });
 assert.deepEqual(r.roots,['Start here','1 · Find your way around','2 · Organise a project','3 · Write in the editor','4 · Plan your time','5 · Think long-term','6 · Find things','7 · Your data and next steps']);
 assert.equal(r.valid,true,'the tour is a valid library');
 assert.deepEqual(r.tags,[],'no accidental tags');
 assert(r.refs.length>=1&&r.refs.every(Boolean),'links point to tour items');
 assert.deepEqual(r.headings,['Preparation','Delivery']);
 assert(r.today.length>=2,'examples scheduled today');
 assert.deepEqual(r.sessions,[['2026-11-22',660,45]],'a planner session later today');
 assert.deepEqual(r.target,{startMonth:'2026-11',endMonth:'2027-03'});assert.deepEqual(r.milestone,{targetWeek:'2026-W47'});
 assert.equal(r.recurring,1);assert.ok(r.waiting);
 assert.equal(r.selected,'Start here');assert.equal(r.editor,true,'opens on Start here');
 for(const t of ['Find this Todo on today’s Calendar','Water the plants'])assert(r.visible.includes(t),t+' is visible on a weekend');

 // Late in the evening the planner example moves to tomorrow morning.
 const late=await p.evaluate(()=>{const m=createEmptyDatabase();YTNHTour.build(m,{date:'2026-11-23',minutes:22*60});return Object.values(m.planner.sessions).map(s=>[s.date,s.start])});
 assert.deepEqual(late,[['2026-11-24',540]]);
 // Shortcuts are written for the platform.
 const mac=await p.evaluate(()=>{const m=createEmptyDatabase();YTNHTour.build(m);return m.items.find(i=>i.title==='Start here').content});
 assert.match(mac,/Open Library… \((⌘O|Ctrl\+O)\)/);
 assert.deepEqual(errors,[]);
 await browser.close();console.log('PASS Tour: chapters, valid library, dates around today, planner, targets, links, no stray tags, entry points');
})().catch(e=>{console.error(e);process.exit(1)});
