const assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await (process.env.BROWSER_ENGINE==='webkit'?webkit:chromium).launch(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{});
 const p=await browser.newPage({viewport:{width:1450,height:950}});p.setDefaultTimeout(3500);const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(require('node:url').pathToFileURL(require('node:path').resolve(__dirname,'../app.html')).href);
 await p.evaluate(()=>{
   installDatabase(createEmptyDatabase());db.settings.hideWeekends=false;const a=createItem(db,'Note'),b=createItem(db,'Todo'),t=createItem(db,'Todo',a.id),kid=createItem(db,'Note',t.id);
   a.title='Operations';b.title='Planning';b.target={startMonth:'2026-01',endMonth:'2027-01'};t.title='Quote';t.scheduledDates=[today()];kid.title='Vendor';
   Object.assign(window,{aid:a.id,bid:b.id,tid:t.id,kid:kid.id});selected=t.id;render();focusOutlineItem(t.id)
 });
 await p.keyboard.press('Control+Shift+c');await p.locator('#refSearch').fill('Planning');await p.keyboard.press('Enter');
 assert.equal(await p.locator('.locationButton').count(),4);
 const result=await p.evaluate(()=>{
   const g=new OutlineLocations(db);window.clone=selectedLocation;window.copyChild=g.siblings(clone)[0].id;
   const codes=g.byItem.get(tid).map(n=>g.code(n));validateDatabase(migrateDatabase(JSON.parse(snapshot())));
   return [db.items.length,codes,new Set(visibleOutlineIds()).size,selected,tid,selectedLocation===tid,calendarEntries(today()).filter(e=>e.item.id===tid).length];
 });assert.equal(result[0],4);assert.equal(result[1].length,2);assert.notEqual(...result[1]);assert.equal(result[3],result[4]);assert.equal(result[5],false);assert.equal(result[6],1);
 await p.keyboard.press('F2');await p.locator('.inlineEdit').fill('Shared title');await p.keyboard.press('Enter');
 assert.equal(await p.locator('#tree .title').filter({hasText:'Shared title'}).count(),2);
 await p.evaluate(()=>{db.settings.groupBy='target';renderTree()});assert(await p.locator('.targetGroupRow').first().isVisible());assert.equal(await p.locator('.locationButton').count(),4);
 await p.evaluate(()=>{db.settings.groupBy='';jumpLocation(copyChild);moveLocationByKey('left',false);validateDatabase(db)});
 assert(await p.evaluate(()=>{const g=new OutlineLocations(db);return g.nodes.get(copyChild).parent===bid&&g.primary(itemById(db,kid)).parent===tid}));
 await p.evaluate(()=>{jumpLocation(clone);window.saved=snapshot();const g=new OutlineLocations(db);let failures=0;for(const dest of [g.nodes.get(clone),g.nodes.get(bid)]){try{const draft=new OutlineLocations(db);draft.clone(draft.nodes.get(clone),draft.nodes.get(dest.id));draft.validate()}catch{failures++}}if(failures!==2)throw Error('Missing cycle/duplicate protection');});
 await p.keyboard.press('Backspace');
 const menu=p.locator('#locationMenu'),choices=menu.getByRole('button');
 await p.keyboard.press('ArrowUp');
 assert.equal(await p.evaluate(()=>document.activeElement.textContent),'Delete item everywhere');
 assert.equal(await p.evaluate(()=>selectedLocation),await p.evaluate(()=>clone));
 await p.keyboard.press('ArrowDown');assert(await choices.first().evaluate(el=>el===document.activeElement));
 await p.keyboard.press('Escape');assert.equal(await menu.count(),0);
 await p.keyboard.press('Backspace');await p.keyboard.press('ArrowUp');await p.keyboard.press('ArrowUp');
 assert.equal(await p.evaluate(()=>document.activeElement.textContent),'Remove from this location');
 await p.keyboard.press('Enter');await p.locator('#modalOK').click();
 assert.equal(await p.evaluate(()=>new OutlineLocations(db).byItem.get(tid).length),1);
 await p.evaluate(()=>{undo();validateDatabase(db);jumpLocation(tid);removeLocation(new OutlineLocations(db).primary(itemById(db,tid)))});
 await p.locator('#modalOK').click();assert(await p.evaluate(()=>{validateDatabase(db);return new OutlineLocations(db).primary(itemById(db,tid)).id===clone&&itemById(db,kid)!=null}));
 await p.evaluate(()=>{const g=new OutlineLocations(db);removeLocation(g.nodes.get(clone),true)});await p.locator('#modalOK').click();assert(await p.evaluate(()=>{const t=itemById(db,tid);validateDatabase(db);return t.archived&&!!t.trashedAt&&!new OutlineLocations(db).siblings(null).some(n=>n.item.id===tid)&&!!itemById(db,kid)}));
 await p.evaluate(()=>{
   installDatabase(createEmptyDatabase());db.settings.hideWeekends=false;const a=createItem(db,'Note'),b=createItem(db,'Note'),c=createItem(db,'Note'),t=createItem(db,'Todo',a.id);
   a.title='First';b.title='Second';c.title='Third';t.title='Job';t.content='A shared body';t.scheduledDates=[today()];t.explicitTags=['work'];
   window.sets={a:a.id,b:b.id,c:c.id,t:t.id};selected=t.id;render();focusOutlineItem(t.id);
 });
 await p.keyboard.press('Meta+Shift+c');await p.locator('#refSearch').fill('Second');await p.keyboard.press('Enter');
 const keys=await p.evaluate(()=>({...sets,copy:selectedLocation}));
 const copy=p.locator('[data-location="'+keys.copy+'"]'),dest=p.locator('[data-location="'+keys.c+'"]');
 await copy.dragTo(dest,{targetPosition:{x:40,y:Math.floor((await dest.boundingBox()).height/2)}});
 assert.equal(await p.evaluate(()=>db.locations[Object.keys(db.locations)[0]].parent),keys.c);
 await p.evaluate(()=>{jumpLocation(sets.t);edit(sets.t);$('editorTitle').value='Changed once';syncModelFromRich();renderTree()});
 assert.equal(await p.locator('#tree .title').filter({hasText:'Changed once'}).count(),2);
 await p.evaluate(()=>{showCalendar();filterOutlineDay(today());renderTree()});assert.equal(await p.locator('.locationButton').count(),2);
 await p.evaluate(()=>{clearOutlineDayFilter();jumpLocation(sets.c);setOutlineCollapsed(itemById(db,sets.c),true);renderTree()});assert.equal(await copy.count(),0);
 await p.evaluate(()=>{jumpLocation(Object.keys(db.locations)[0]);const g=new OutlineLocations(db);const item=itemById(db,sets.t);const ref=createItem(db,'Note');ref.content='[['+refToken(item.id)+']] '+inlineTodoMarkup(item.id,'occurrence','Job');
   window.referenceId=ref.id;validateDatabase(db);
   if(!backlinksFor(item.id).some(i=>i.id===ref.id)||inlineTodoRecords(ref.content)[0].id!==item.id)throw Error('Lost UUID reference');
   const previous=snapshot();installDatabase(migrateDatabase(JSON.parse(previous)));if(snapshot()!==previous)throw Error('JSON round trip changed locations');
 });
 await p.evaluate(()=>{const child=createItem(db,'Note');child.title='Attach here';window.toAttach=child.id;jumpLocation(child.id)});
 await p.keyboard.press('Control+Shift+c');await p.locator('#refSearch').fill('Changed once');assert.equal(await p.locator('[data-ref-pick]').count(),2);
 await p.locator('[data-ref-pick="'+keys.copy+'"]').click();assert.equal(await p.evaluate(()=>db.locations[selectedLocation].parent),keys.copy);
 await p.evaluate(()=>{
   const src=itemById(db,toAttach),parents=[];for(let n=0;n<21;n++)parents.push(createItem(db,'Note'));
   const g=new OutlineLocations(db);for(const dest of parents)g.clone(g.primary(src),g.primary(dest));
   g.commit();validateDatabase(db);if(g.byItem.get(src.id).length!==23)throw Error('Placement cap');
   db.settings.groupBy='type';renderTree();if($('tree').querySelectorAll('.row[data-id="'+src.id+'"]').length!==23)throw Error('Grouped locations missing');
 });
 assert.deepEqual(errors,[]);await browser.close();console.log('PASS linked subtree, codes, picker, selection, shared edits, grouping, calendar, movement, removal, promotion, deletion, validation and undo');
})().catch(e=>{console.error(e);process.exit(1)});
