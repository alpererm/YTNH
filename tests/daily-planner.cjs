const assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await (process.env.BROWSER_ENGINE==='webkit'?webkit:chromium).launch(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{});
 try{
 const page=await browser.newPage({viewport:{width:1600,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(require('node:url').pathToFileURL(require('node:path').resolve(__dirname,'../app.html')).href);
 await page.evaluate(()=>{installDatabase(createEmptyDatabase());const item=createItem(db,'Todo');item.title='Plan this';item.scheduledDates=['2026-11-12'];window.item=item.id;DailyPlanner.open();DailyPlanner.selectDay('2026-11-16');});
 for(const picker of ['#dailyPlanner header .dayPickerGlyph','.dayFirstField:has(#jumpDate) .dayPickerGlyph']){
   await page.locator(picker).click();assert.equal(await page.locator('.toolbarDatePopup .weekLabel').count(),6);await page.keyboard.press('Escape');
 }
 const pin=page.locator('#dailyPlanner [data-act=pin]');
 await pin.click();await page.evaluate(()=>jumpToDate('2026-11-18'));assert.equal(await page.evaluate(()=>DailyPlanner.date),'2026-11-16');
 await page.locator('#dailyPlanner [data-act=next]').click();assert.equal(await page.evaluate(()=>calendarCursorDate),'2026-11-18');
 await page.reload();await page.evaluate(()=>{installDatabase(createEmptyDatabase());DailyPlanner.restore()});
 assert.equal(await page.evaluate(()=>DailyPlanner.date),'2026-11-17');await page.evaluate(()=>jumpToDate('2026-11-19'));await pin.click();assert.equal(await page.evaluate(()=>DailyPlanner.date),'2026-11-19');
 await page.evaluate(()=>{const i=createItem(db,'Todo');i.title='Plan this';i.scheduledDates=['2026-11-12'];window.item=i.id;edit(i.id);if(DailyPlanner.visible)throw Error('Planner not suspended');toggleEditorSidebar();if(!DailyPlanner.visible)throw Error('Planner did not resume');sidebarState.visible=true;applySidebarState();showCalendar();DailyPlanner.selectDay('2026-11-16')});
 await page.clock.setFixedTime(new Date(2026,10,16,8,55));
 await page.evaluate(()=>DailyPlanner.paint());
 const clearLabels=()=>page.evaluate(()=>{const label=document.querySelector('.planNow span').getBoundingClientRect();return [...document.querySelectorAll('.planHour')].every(h=>{const box=h.getBoundingClientRect();return label.bottom<=box.top||label.top>=box.bottom})});
 assert(await clearLabels());await page.clock.setFixedTime(new Date(2026,10,16,9,0));await page.evaluate(()=>DailyPlanner.paint());assert(await clearLabels());
 const grid=page.locator('.planGrid');
 await grid.focus();await page.keyboard.press('Enter');await page.getByRole('menuitem',{name:'Select Note or Todo'}).click();await page.locator('[data-ref-pick]').first().click();
 assert.equal(await page.locator('.planBlock.Todo').count(),1);
 await page.locator('.planBlock .itemMarker').click();
 assert.deepEqual(await page.evaluate(()=>[db.items[0].status,...db.items[0].scheduledDates,Object.values(db.planner.sessions)[0].done]),['Todo','2026-11-12',true]);
 await page.evaluate(()=>undo());assert.equal(await page.locator('.planBlock .itemMarker').getAttribute('data-marker-status'),'Todo');
 await page.locator('.planBlock').dblclick();assert(!(await page.locator('#dailyPlanner').isVisible()));assert(await page.locator('#editor').isVisible());await page.evaluate(()=>toggleEditorSidebar());assert(await page.locator('#dailyPlanner').isVisible());
 await page.keyboard.press((await page.evaluate(()=>/Mac|iPhone|iPad/.test(navigator.platform))?'Meta':'Control')+'+Alt+p');assert(!(await page.locator('#dailyPlanner').isVisible()));await page.evaluate(()=>selectSidebarTab('properties'));assert(await page.locator('#editorSidebar').isVisible());
 await page.evaluate(()=>{showCalendar();DailyPlanner.open();DailyMeetingEditor.create('2026-11-16',540)});
 await page.getByLabel('Meeting title').fill('Planning conversation');await page.getByLabel('Repeat',{exact:true}).selectOption('weekly');await page.getByRole('button',{name:'Apply',exact:true}).click();
 await page.evaluate(()=>DailyPlanner.selectDay('2026-11-23'));await page.locator('.planBlock.meeting').dblclick();
 await page.locator('#richEditor').pressSequentially('Shared minutes');
 await page.evaluate(()=>{showCalendar();DailyPlanner.selectDay('2026-11-16')});await page.locator('.planBlock.meeting').dblclick();
 assert.match(await page.locator('#richEditor').innerText(),/Shared minutes/);
 assert.equal(await page.evaluate(()=>db.items.length),1);
 await page.evaluate(()=>{showCalendar();DailyPlanner.selectDay('2026-11-16');
   for(let i=0;i<8;i++)PlannerModel.session(db,db.items[0],DailyPlanner.date,540,30);
   DailyPlanner.paint()});
 const quarter=t=>page.locator('[data-quarter="'+t+'"]'),tick=t=>page.locator('.planTick[data-minute="'+t+'"]').evaluate(el=>el.offsetTop);
 const base=await tick(570),nine=await tick(540);await quarter(540).click();assert.equal(await tick(540),nine);const afterFirst=await tick(570);assert(afterFirst>base);assert.equal(await page.locator('.planExpanded').count(),1);
 const during=await page.locator('.planGrid').evaluate(grid=>{
   const band=grid.querySelector('.planExpanded'),rect=band.getBoundingClientRect();return DailyPlanner.previewDrop(rect.bottom-2);
 });
 assert.equal(during,540);await page.evaluate(()=>DailyPlanner.clearSlot());
 const firstHeight=await tick(555);await quarter(555).click();assert.equal(await tick(555),firstHeight);assert(await tick(570)>afterFirst);assert.equal(await page.locator('.planExpanded').count(),2);
 await quarter(540).click();await quarter(555).click();assert.equal(await tick(570),base);
 const result=await page.evaluate(()=>{
   const m=Object.values(db.planner.meetings)[0];m.parent=item;checkpoint();deleteSubtree(db,item);const deleted=[m.parent,Object.keys(db.planner.sessions).length];undo();
   return {deleted,restored:db.planner.meetings[m.id].parent===item,sessions:Object.keys(db.planner.sessions).length};
 });
 assert.deepEqual(result,{deleted:[null,0],restored:true,sessions:9});
 await page.evaluate(()=>showCalendar());const toggle=page.locator('#yearsMode + #plannerToggle');await toggle.click();assert.equal(await toggle.getAttribute('aria-label'),'Show Daily Planner');await toggle.click();assert.equal(await page.getByLabel('Planner date (DD/MM/YYYY)',{exact:true}).inputValue(),'16/11/2026');await page.reload();await page.evaluate(()=>installDatabase(createEmptyDatabase()));assert.equal(await toggle.getAttribute('aria-pressed'),'true');
 await page.evaluate(()=>{openSettings()});
 await page.locator('#plannerStart').fill('08:00');await page.locator('#plannerEnd').fill('17:30');await page.locator('#modalOK').click();
 assert.deepEqual(await page.evaluate(()=>db.planner.settings),{start:480,end:1050});
 await grid.focus();await page.keyboard.press('Enter');await page.getByRole('menuitem',{name:'Create Todo',exact:true}).click();await page.getByLabel('Title',{exact:true}).fill('Planner-created item');await page.getByRole('button',{name:'Apply',exact:true}).click();
 assert.equal(await page.locator('#tree .row.currentItem .title').textContent(),'Planner-created item');
 await page.evaluate(()=>{const i=db.items[0];i.status='Done';$('search').value='Planner-created';renderTree()});assert.equal(await page.locator('#tree .row').count(),0);
 await page.evaluate(()=>{$('showDone').checked=true;renderTree()});assert.equal(await page.locator('#tree .row').count(),1);
 await page.evaluate(()=>DailyMeetingEditor.create('2026-11-16',600));
 await page.evaluate(()=>applyTheme('dark'));await page.getByLabel('Meeting title').fill('Monthly fixture');
 await page.getByLabel('Repeat',{exact:true}).click();const options=page.locator('dialog[open] #activeSelectOptions');await options.getByRole('option',{name:'Monthly',exact:true}).click();
 await page.locator('#meeting-monthlyMode').selectOption('relative');await page.locator('#meeting-monthlyOrdinal').selectOption('-1');await page.locator('#meeting-monthlyDayKind').selectOption('weekday');await page.getByRole('button',{name:'Apply',exact:true}).click();
 assert.deepEqual(await page.evaluate(()=>Object.values(db.planner.meetings)[0].versions[0].recurrence),{frequency:'monthly',interval:1,startDate:'2026-11-16',monthlyMode:'relative',ordinal:-1,dayKind:'weekday'});
 await page.evaluate(()=>{DailyPlanner.selectDay('2026-11-17');DailyMeetingEditor.create(DailyPlanner.date,960)});
 // close events remove old dialogs asynchronously; measure the active form only.
 const startDate=page.locator('dialog[open]').getByLabel('Start date',{exact:true}),endDate=page.locator('dialog[open]').getByLabel('End date (exclusive for all-day)',{exact:true});
 assert.equal((await startDate.boundingBox()).y,(await endDate.boundingBox()).y);
 assert.equal(await page.getByLabel('Start time').inputValue(),'16:00');
 await page.getByLabel('Meeting title').fill('One-off');await page.getByRole('button',{name:'Apply',exact:true}).click();
 const meeting=page.locator('.planBlock.meeting');assert.equal(await meeting.locator('svg').count(),1);
 const identity=await meeting.getAttribute('data-identity');await meeting.click({button:'right'});await page.getByRole('menuitem',{name:'Edit schedule…'}).click();
 await page.getByLabel('Repeat',{exact:true}).selectOption('weekly');await page.getByRole('button',{name:'Apply',exact:true}).click();
 await page.evaluate(()=>DailyPlanner.selectDay('2026-11-24'));assert.equal(await meeting.count(),1);
 assert.equal((await meeting.getAttribute('data-identity')).split('@')[0],identity.split('@')[0]);assert.equal(await meeting.locator('.planRepeat').count(),1);
 await page.evaluate(()=>undo());assert.equal(await meeting.count(),0);
 await page.evaluate(()=>{
   installDatabase(createEmptyDatabase());const i=createItem(db,'Todo');i.title='Recurring session';i.recurrence={frequency:'daily',interval:1,startDate:today()};
   PlannerModel.session(db,i,today(),600,15,today());DailyPlanner.open();DailyPlanner.selectDay(today());
 });
 await page.locator('.planBlock.Todo .itemMarker').click();
 assert.deepEqual(await page.evaluate(()=>[db.items[0].status,db.items[0].occurrenceStates[today()],nextActiveOccurrence(db.items[0])]),['Todo','Done',await page.evaluate(()=>PlannerModel.shift(today(),1))]);
 await page.evaluate(()=>undo());assert.equal(await page.evaluate(()=>nextActiveOccurrence(db.items[0])),await page.evaluate(()=>today()));
 assert.deepEqual(errors,[]);console.log('PASS picker, independent date and completion, undo, editor/sidebar switching');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
