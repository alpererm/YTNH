// Headings inside projects: label-only dividers among siblings. They have no marker, collapse their
// section, are skipped while hidden by keyboard navigation, carry their section when dragged, cannot
// be scheduled, and convert to a real parent or a plain Note.
const assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const path=require('node:path');const {pathToFileURL}=require('node:url');
(async()=>{
 const browser=await (process.env.BROWSER_ENGINE==='webkit'?webkit:chromium).launch(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{});
 const p=await browser.newPage({viewport:{width:1300,height:850}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(pathToFileURL(path.resolve(__dirname,'../app.html')).href);
 const setup=()=>p.evaluate(()=>{autosaveEnabled=false;installDatabase(createEmptyDatabase());db.settings.hideWeekends=false;
  const mk=(type,title,parent,extra={})=>{const i=createItem(db,type,parent?.id);i.title=title;Object.assign(i,extra);return i};
  const proj=mk('Todo','Supplier programme');const h1=mk('Note','Preparation',proj,{heading:true});const a=mk('Todo','Collect requirements',proj);const b=mk('Todo','Shortlist vendors',proj);
  const h2=mk('Note','Negotiation',proj,{heading:true});const c=mk('Todo','Request quotation',proj);mk('Todo','Standalone',null);
  window.ids={proj:proj.id,h1:h1.id,h2:h2.id,a:a.id,b:b.id,c:c.id};render();showCalendar()});
 const visible=()=>p.evaluate(()=>[...document.querySelectorAll('#tree .row:not(.sectionHidden) .title')].map(t=>t.textContent));
 const row=id=>p.locator(`#tree .row[data-id="${id}"]`);

 await setup();let ids=await p.evaluate(()=>ids);
 assert.equal(await row(ids.h1).locator('.itemMarker').count(),0,'headings have no status marker');
 assert.equal(await row(ids.h1).evaluate(r=>r.classList.contains('headingRow')),true);

 await row(ids.h1).locator('.headingToggle').click();
 assert.deepEqual(await visible(),['Supplier programme','Preparation','Negotiation','Request quotation','Standalone'],'clicking the arrow collapses the section up to the next heading');
 await p.evaluate(id=>{selected=id;focusOutlineItem(id)},ids.h1);
 await p.keyboard.press('ArrowDown');
 assert.equal(await p.evaluate(()=>selected),ids.h2,'keyboard navigation skips hidden rows');
 await p.evaluate(id=>{selected=id;focusOutlineItem(id)},ids.h1);
 await p.keyboard.press('ArrowRight');
 assert.equal((await visible()).length,7,'Right expands a collapsed heading');
 await p.keyboard.press('ArrowLeft');
 assert.equal((await visible()).length,5,'Left collapses it again');
 await p.keyboard.press('ArrowRight');

 assert.equal(await p.evaluate(id=>addExplicitScheduledDate(itemById(db,id),'2026-11-23'),ids.h1),false,'headings cannot be scheduled');
 assert.deepEqual(await p.evaluate(id=>itemById(db,id).scheduledDates||[],ids.h1),[]);

 // Dragging a heading carries its section with it.
 await row(ids.h1).locator('.title').dragTo(row(ids.c),{targetPosition:{x:60,y:Math.floor((await row(ids.c).boundingBox()).height-3)}});
 const order=await visible();
 assert.ok(order.indexOf('Preparation')>order.indexOf('Request quotation'),'heading moved below the drop target: '+order.join(' | '));
 assert.deepEqual(order.slice(order.indexOf('Preparation'),order.indexOf('Preparation')+3),['Preparation','Collect requirements','Shortlist vendors'],'its section moved with it');

 // H in the Outline creates a heading and starts renaming it.
 await setup();ids=await p.evaluate(()=>ids);
 await p.evaluate(id=>{selected=id;focusOutlineItem(id)},ids.proj);
 await p.keyboard.press('h');
 const created=await p.evaluate(()=>{const i=db.items.find(x=>x.heading&&!Object.values(ids).includes(x.id));return i&&{id:i.id,type:i.type}});
 assert.ok(created,'H creates a heading');assert.equal(created.type,'Note');

 // Convert to parent: the section becomes its children; convert to Note: just a plain Note.
 await setup();ids=await p.evaluate(()=>ids);
 await p.evaluate(()=>{convertHeadingToParent(itemById(db,ids.h1));render()});
 assert.equal(await p.evaluate(()=>itemById(db,ids.a).parentId),ids.h1);
 assert.equal(await p.evaluate(()=>itemById(db,ids.b).parentId),ids.h1);
 assert.equal(await p.evaluate(()=>itemById(db,ids.c).parentId),ids.proj,'items after the next heading stay');
 assert.equal(await p.evaluate(()=>!!itemById(db,ids.h1).heading),false);
 await p.evaluate(()=>{convertHeadingToNote(itemById(db,ids.h2));render()});
 assert.equal(await p.evaluate(()=>!!itemById(db,ids.h2).heading),false);
 assert.equal(await row(ids.h2).locator('.itemMarker').count(),1,'a converted Note gets its marker back');

 assert.deepEqual(errors,[]);
 await browser.close();console.log('PASS headings: collapse, keyboard, drag with section, no scheduling, H key, conversions');
})().catch(e=>{console.error(e);process.exit(1)});
