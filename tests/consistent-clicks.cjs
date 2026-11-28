// One click model: a title click selects and reveals, a double-click opens, and only markers change status.
const assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await (process.env.BROWSER_ENGINE==='webkit'?webkit:chromium).launch(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{});
 try{
 const page=await browser.newPage({viewport:{width:1600,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(require('node:url').pathToFileURL(require('node:path').resolve(__dirname,'../app.html')).href);
 await page.evaluate(()=>{
   autosaveEnabled=false;installDatabase(createEmptyDatabase());
   const parent=createItem(db,'Note');parent.title='Project';parent.collapsed=true;
   const todo=createItem(db,'Todo',parent.id);todo.title='Call supplier';todo.scheduledDates=['2026-11-10'];
   const note=createItem(db,'Note');note.title='Meeting notes';note.scheduledDates=['2026-11-10'];
   for(let i=0;i<7;i++){const x=createItem(db,'Note');x.title='Busy '+i;x.scheduledDates=['2026-11-12']}
   window.ids={parent:parent.id,todo:todo.id,note:note.id};
   weekAnchor=new Date(2026,10,10,12);calendarCursorDate='2026-11-10';render();showCalendar();renderCalendar();
 });
 const title=id=>page.locator(`#calendarBody [data-cal-item="${id}"] .calendarItemTitle`).first();
 const status=id=>page.evaluate(id=>itemById(db,id).status,id);

 // Left, right and middle clicks on a title never change status; a click reveals the item in the Outline.
 await title(await page.evaluate(()=>ids.todo)).click();
 await page.waitForTimeout(350);
 assert.equal(await status(await page.evaluate(()=>ids.todo)),'Todo');
 assert.equal(await page.evaluate(()=>selected),await page.evaluate(()=>ids.todo));
 assert.equal(await page.evaluate(()=>itemById(db,ids.parent).collapsed),false,'reveal expands the parent');
 assert.equal(await page.locator(`#tree .row[data-id="${await page.evaluate(()=>ids.todo)}"]`).count(),1);
 assert(!(await page.locator('#editor').isVisible()),'a single click does not open the editor');
 // #55: a middle-click on a Calendar title removes that date (status unchanged); Undo brings it back.
 await title(await page.evaluate(()=>ids.todo)).click({button:'middle'});
 assert.equal(await status(await page.evaluate(()=>ids.todo)),'Todo');
 assert.deepEqual(await page.evaluate(()=>itemById(db,ids.todo).scheduledDates),[]);
 await page.evaluate(()=>{undo();renderCalendar()});
 assert.deepEqual(await page.evaluate(()=>itemById(db,ids.todo).scheduledDates),['2026-11-10']);

 // The marker is the only status control.
 await page.locator(`#calendarBody .cal-code [data-marker-id="${await page.evaluate(()=>ids.todo)}"]`).first().click();
 assert.equal(await status(await page.evaluate(()=>ids.todo)),'Done');
 await page.evaluate(()=>{setItemCompletionStatus(itemById(db,ids.todo),'Todo');renderCalendar()});

 // Double-click opens the editor on the item.
 await title(await page.evaluate(()=>ids.note)).dblclick();
 assert(await page.locator('#editor').isVisible());
 assert.equal(await page.locator('#editorTitle').inputValue().catch(()=>page.locator('#editorTitle').innerText()),'Meeting notes');
 // With the editor open, a single click switches it, as in the Outline.
 await page.evaluate(()=>{showCalendar();renderCalendar()});
 if(await page.locator('#calendarBody').isVisible()){
   await title(await page.evaluate(()=>ids.todo)).click();
   assert.equal(await page.evaluate(()=>selected),await page.evaluate(()=>ids.todo));
 }

 // A day shows at most five items; +N expands the whole week.
 await page.evaluate(()=>{setView('calendar');showCalendar();renderCalendar()});
 const busy=page.locator('.day[data-date="2026-11-12"]');
 assert.equal(await busy.locator('.chip').count(),5);
 const more=busy.locator('button.hiddenDayItems');
 assert.equal(await more.innerText(),'+2');
 assert.equal(await page.locator('.weekrow[data-week="2026-11-09"] .weeknum [data-expand-week]').innerText(),'+');
 await more.click();
 assert.equal(await page.locator('.day[data-date="2026-11-12"] .chip').count(),7);
 assert.equal(await page.locator('.day[data-date="2026-11-12"] .hiddenDayItems').count(),0);
 await page.locator('.weekrow[data-week="2026-11-09"] .weeknum [data-expand-week]').click();
 assert.equal(await page.locator('.day[data-date="2026-11-12"] .chip').count(),5);
 // Quiet weeks have no expand control.
 assert.equal(await page.locator('.weekrow[data-week="2026-11-16"] [data-expand-week]').count(),0);

 // Milestones and Targets: a click selects and reveals.
 await page.evaluate(()=>{const m=createItem(db,'Todo',ids.parent);m.title='Pilot ready';m.milestone={targetWeek:'2026-W46'};ids.m=m.id;itemById(db,ids.parent).collapsed=true;selected=null;renderTree();renderCalendar()});
 await page.locator(`[data-milestone-id="${await page.evaluate(()=>ids.m)}"]`).click();
 assert.deepEqual(await page.evaluate(()=>[selected===ids.m,milestoneSelection===ids.m,itemById(db,ids.parent).collapsed]),[true,true,false]);
 await page.evaluate(()=>{const t=createItem(db,'Todo');t.title='Launch';t.target={startMonth:'2026-11',endMonth:'2027-01'};ids.t=t.id;calendarMode='years';renderCalendar()});
 {
   await page.locator(`[data-target-id="${await page.evaluate(()=>ids.t)}"]`).first().click();
   assert.equal(await page.evaluate(()=>selected),await page.evaluate(()=>ids.t));
   assert(!(await page.locator('#editor').isVisible()));
 }
 await page.evaluate(()=>{calendarMode='weeks';renderCalendar()});

 // Daily Planner: click reveals, the marker still toggles.
 await page.evaluate(()=>{selected=null;itemById(db,ids.parent).collapsed=true;renderTree();DailyPlanner.open();DailyPlanner.selectDay('2026-11-10')});
 await page.locator('.planGrid').focus();await page.keyboard.press('Enter');await page.getByRole('menuitem',{name:'Select Note or Todo'}).click();
 await page.locator('#refSearch').fill('Call supplier');await page.keyboard.press('Enter');
 await page.locator('.planBlock .planTitle').first().click();
 assert.deepEqual(await page.evaluate(()=>[selected===ids.todo,itemById(db,ids.parent).collapsed,itemById(db,ids.todo).status]),[true,false,'Todo']);

 // Inline to-dos: the menu offers Show in Outline.
 await page.evaluate(()=>{const host=createItem(db,'Note');host.title='Host';ids.host=host.id;DailyPlanner.close?.();edit(host.id);setView('editor');focusBodyStart()});
 await page.keyboard.type('<Ring the bank>. ');
 const inlineId=await page.locator('#richEditor .inlineTodo').first().getAttribute('data-inline-todo');
 await page.evaluate(()=>{selected=ids.host;itemById(db,ids.host).collapsed=true;renderTree()});
 await page.locator('#richEditor .inlineTodo').first().click({button:'right'});
 await page.getByRole('menuitem',{name:'Show in Outline'}).click();
 assert.equal(await page.evaluate(()=>selected),inlineId);
 assert.equal(await page.locator(`#tree .row[data-id="${inlineId}"]`).count(),1);

 // Middle-click on a marker cancels through the normal path in every view; a repeating Todo cancels one occurrence only.
 await page.evaluate(()=>{closeRightEditor?.();setView('calendar');calendarMode='weeks';
   const r=createItem(db,'Todo');r.title='Daily standup';const d0=today(),add=n=>{const d=new Date(d0+'T12:00:00');d.setDate(d.getDate()+n);return iso(d)};r.recurrence={frequency:'daily',interval:1,startDate:d0};db.settings.hideWeekends=false; /* today may be a weekend day */ids.r=r.id;ids.d1=add(1);ids.d2=add(2);weekAnchor=new Date(d0+'T12:00:00');
   const o=createItem(db,'Todo');o.title='Outline todo';ids.o=o.id;render();showCalendar();renderCalendar()});
 // #55: a middle-click on a marker no longer cancels anything.
 await page.locator(`#tree [data-marker-id="${await page.evaluate(()=>ids.o)}"]`).click({button:'middle'});
 assert.equal(await status(await page.evaluate(()=>ids.o)),'Todo');
 await page.locator(`.day[data-date="${await page.evaluate(()=>today())}"] [data-cal-item="${await page.evaluate(()=>ids.r)}"] .itemMarker`).click({button:'middle'});
 assert.deepEqual(await page.evaluate(()=>[occurrenceStatus(itemById(db,ids.r),today()),itemById(db,ids.r).status]),['Todo','Todo']);
 // Delete on a focused Calendar item removes that date.
 await page.evaluate(()=>{const n=itemById(db,ids.note);n.scheduledDates=['2026-11-10'];weekAnchor=new Date(2026,10,10,12);renderCalendar();focusPane('calendar');focusCalendarItem(ids.note,'2026-11-10')});
 await page.keyboard.press('Delete');
 assert.deepEqual(await page.evaluate(()=>itemById(db,ids.note).scheduledDates),[]);
 await page.evaluate(()=>{undo();renderCalendar()});
 await page.evaluate(()=>{weekAnchor=new Date(2026,10,10,12);renderCalendar()});
 assert.equal(await page.locator('.toast:visible').filter({hasText:/cancelled/i}).count(),0);

 // Right-click shows the same item menu everywhere.
 await title(await page.evaluate(()=>ids.note)).click({button:'right'});
 for(const name of ['Open','Show in Outline','Remove this date','Pin to top'])assert.equal(await page.getByRole('menuitem',{name,exact:true}).count(),1,name);
 await page.getByRole('menuitem',{name:'Remove this date',exact:true}).click();
 assert.deepEqual(await page.evaluate(()=>itemById(db,ids.note).scheduledDates),[]);
 await page.evaluate(()=>undo());
 await title(await page.evaluate(()=>ids.todo)).click({button:'right'});
 assert.equal(await page.getByRole('menuitem',{name:'Waiting for',exact:true}).count(),1);
 await page.getByRole('menuitem',{name:'Waiting for',exact:true}).click();
 assert.equal(await status(await page.evaluate(()=>ids.todo)),'Waiting for');
 await page.locator(`[data-milestone-id="${await page.evaluate(()=>ids.m)}"]`).click({button:'right'});
 assert.equal(await page.getByRole('menuitem',{name:'Open',exact:true}).count(),1);
 assert.equal(await page.getByRole('menuitem',{name:'Move unfinished to tomorrow'}).isVisible(),false);
 await page.keyboard.press('Escape');
 await page.locator(`#tree .row[data-id="${await page.evaluate(()=>ids.note)}"] .rowTitle, #tree .row[data-id="${await page.evaluate(()=>ids.note)}"]`).first().click({button:'right'});
 for(const name of ['Open','Add heading below'])assert.equal(await page.getByRole('menuitem',{name,exact:true}).count(),1,name);
 assert.equal(await page.getByRole('menuitem',{name:'Show in Outline',exact:true}).count(),0);
 await page.keyboard.press('Escape');

 // Keyboard in the Calendar: Enter on a chosen day moves into its items; Enter opens one.
 await page.evaluate(()=>{setView('calendar');showCalendar();renderCalendar()});
 await page.locator('.day[data-date="2026-11-10"]').click({position:{x:6,y:6}});
 await page.keyboard.press('Tab');
 assert.equal(await page.evaluate(()=>document.activeElement.closest('.day')?.dataset.date),'2026-11-10');
 const first=await page.evaluate(()=>document.activeElement.dataset.calItem);
 await page.keyboard.press('ArrowDown');
 const second=await page.evaluate(()=>document.activeElement.dataset.calItem);
 assert(first&&second&&first!==second,'ArrowDown moves to the next item');
 assert.equal(await page.evaluate(()=>selected),second,'moving onto an item selects it');
 await page.keyboard.press('Enter');
 assert(await page.locator('#editor').isVisible());

 // Links open with Ctrl/Cmd+click (a plain click places the cursor); backlinks open on a click; both reveal.
 const mod=await page.evaluate(()=>IS_MAC?'Meta':'Control');
 await page.evaluate(()=>{const a=createItem(db,'Note');a.title='Source note';const t=createItem(db,'Note',ids.parent);t.title='Linked target';
   a.content='See [['+refToken(t.id)+']] here.';ids.a=a.id;ids.lt=t.id;itemById(db,ids.parent).collapsed=true;render();edit(a.id);setView('editor')});
 await page.locator('#richEditor .mdref').click();
 assert.equal(await page.evaluate(()=>editorDisplayedId??selected),await page.evaluate(()=>ids.a));
 await page.locator('#richEditor .mdref').click({modifiers:[mod]});
 assert.deepEqual(await page.evaluate(()=>[selected===ids.lt,itemById(db,ids.parent).collapsed]),[true,false]);
 await page.evaluate(()=>{itemById(db,ids.parent).collapsed=true;renderTree();if(!$('editorSidebar')||$('editorSidebar').classList.contains('hidden'))toggleEditorSidebar?.()});
 const back=page.locator(`[data-backlink-id="${await page.evaluate(()=>ids.a)}"]`).first();
 assert.equal(await back.count(),1,'backlink listed');await page.focus('#richEditor');await back.click();
 assert.deepEqual(await page.evaluate(()=>[selected===ids.a,editorDisplayedId===ids.a]),[true,true]);

 assert.deepEqual(errors,[]);
 console.log('consistent clicks: ok');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
