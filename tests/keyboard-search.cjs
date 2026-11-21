const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url'),path=require('node:path');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await(process.env.BROWSER_ENGINE==='webkit'?webkit:chromium).launch(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{});
 const p=await browser.newPage({viewport:{width:1400,height:900}}),errors=[];
 p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(4000);
 await p.goto(pathToFileURL(path.resolve(__dirname,'../app.html')).href);
 await p.evaluate(()=>{
   autosaveEnabled=false;installDatabase(createEmptyDatabase());
   const n=createItem(db,'Note'),t=createItem(db,'Todo');n.title='First note';n.content='A sentence with **bold words** inside.';t.title='Hidden supplier action';t.status='Waiting for';
   window.noteId=n.id;window.todoId=t.id;
   document.querySelector('[data-type-filter="notes"]').click();db.settings.groupBy='tag';render();edit(n.id);
   const text=$('richEditor').querySelector('strong,b').firstChild;
   $('richEditor').focus();getSelection().collapse(text,3);
 });
 await p.keyboard.press('Control+Shift+f');await p.locator('#search').fill('supplier');
 assert.deepEqual(await p.evaluate(()=>visibleOutlineIds()),[await p.evaluate(()=>todoId)]);
 await p.keyboard.press('Escape');
 assert.deepEqual(await p.evaluate(()=>[document.activeElement.id,getSelection().focusNode.textContent,getSelection().focusOffset,currentGroupBy()]),['richEditor','bold words',3,'tag']);
 assert(!await p.evaluate(()=>visibleOutlineIds().includes(todoId)));
 await p.keyboard.press('Control+Shift+f');await p.locator('#search').fill('supplier');await p.keyboard.press('Tab');
 assert.equal(await p.evaluate(()=>document.activeElement.closest('.row')?.dataset.id),await p.evaluate(()=>todoId));
 await p.evaluate(()=>closeOutlineSearch(false));
 await p.evaluate(()=>{setSourceMode(true);$('content').focus();$('content').setSelectionRange(2,8,'backward');setEditorFocus(true)});
 await p.keyboard.press('Meta+Shift+f');await p.locator('#search').fill('supplier');await p.keyboard.press('Escape');
 assert.deepEqual(await p.evaluate(()=>[document.activeElement.id,$('content').selectionStart,$('content').selectionEnd,$('content').selectionDirection,$('layout').classList.contains('editor-focus')]),['content',2,8,'backward',true]);
 await p.evaluate(()=>{setEditorFocus(false);setSourceMode(false);focusBodyStart()});
 await p.keyboard.press('Control+k');await p.waitForFunction(()=>document.activeElement.id==='linkAddress');
 await p.keyboard.type('https://example.org');assert.equal(await p.locator('#linkAddress').inputValue(),'https://example.org');await p.keyboard.press('Escape');
 await p.evaluate(()=>{clearAllFilters();db.settings.groupBy='';selected=noteId;showCalendar();render();focusOutlineItem(selected);window.before=JSON.stringify(db)});
 for(const key of ['n','t']){await p.keyboard.press(key);await p.locator('.inlineEdit').fill('Discard this');await p.keyboard.press('Escape');assert.equal(await p.evaluate(()=>JSON.stringify(db)),await p.evaluate(()=>before))}
 await p.keyboard.press('Enter');await p.locator('.inlineEdit').fill('Discard rename');await p.keyboard.press('Escape');
 assert.equal(await p.evaluate(()=>itemById(db,noteId).title),'First note');
 await p.evaluate(()=>{edit(noteId);focusBodyStart()});for(const key of ['n','t']){
   const count=await p.evaluate(()=>db.items.length);await p.keyboard.press('Alt+'+key);assert.equal(await p.evaluate(()=>db.items.length),count+1);assert.equal(await p.evaluate(()=>itemById(db,selected).type),key==='t'?'Todo':'Note');
 }
 for(const marker of ['- ','1. ','- [ ] ']){
   await p.evaluate(marker=>{const n=itemById(db,noteId);n.content='Previous line\n'+marker+'word';edit(noteId);setSourceMode(false);const line=$('richEditor').children[1];$('richEditor').focus();placeCaretAtBodyStart(line)},marker);
   await p.keyboard.press('ArrowLeft');assert(await p.evaluate(()=>bodyBlock(getSelection().focusNode)===$('richEditor').firstElementChild));await p.keyboard.type('!');assert(await p.evaluate(()=>itemById(db,noteId).content.startsWith('Previous line!\n')));
 }
 for(const theme of ['dark']){
   await p.evaluate(t=>{appearance.theme=t;applyTheme();openSettings()},theme);await p.locator('#settingsFont').click();assert(await p.locator('.selectPopover').isVisible());
   await p.keyboard.press('ArrowDown');await p.keyboard.press('Escape');assert.equal(await p.locator('.selectPopover').count(),0);await p.locator('#modalCancel').click();
 }
 await p.evaluate(()=>{showCalendar();filterOutlineDay('2026-11-06')});assert.equal(await p.locator('[data-remove-filter="day"]').count(),1);assert.equal(await p.locator('#dayFilterBar').count(),0);await p.keyboard.press('ArrowUp');assert.equal(await p.evaluate(()=>outlineDayFilter),'2026-10-30');await p.locator('[data-remove-filter="day"]').click();assert.equal(await p.evaluate(()=>outlineDayFilter),null);
 await p.evaluate(()=>{const n=itemById(db,noteId),t=itemById(db,todoId);t.status='Todo';n.scheduledDates=[today()];t.scheduledDates=[today()];db.settings.hideWeekends=false;appearance.theme='dark';applyTheme();weekAnchor=new Date();showCalendar();render()});
 for(const [id,color] of [[await p.evaluate(()=>noteId),'--outline-note-ink'],[await p.evaluate(()=>todoId),'--outline-todo-ink']]){
   for(const selector of [`#tree [data-marker-id="${id}"]`,`#calendarBody [data-marker-id="${id}"]`]){
     assert(await p.locator(selector).first().evaluate((e,token)=>{const probe=document.createElement('span');probe.style.color='var('+token+')';document.body.append(probe);const matches=getComputedStyle(probe).color===getComputedStyle(e).color;probe.remove();return matches},color));
     assert.deepEqual(await p.locator(selector).first().evaluate(e=>{const icon=e.querySelector('svg').getBoundingClientRect(),hit=e.getBoundingClientRect();return [icon.width,icon.height,hit.width>=24,hit.height>=24,e.textContent.trim()]}),[15,15,true,true,'']);
   }
 }
 const switchPane=await p.evaluate(()=>/Mac/.test(navigator.platform)?'Alt+Tab':'Control+Tab');
 for(const view of ['editor','weeks','years']){
   await p.evaluate(v=>{if(v==='editor')edit(noteId);else{calendarMode=v;showCalendar()}focusOutlineItem(noteId)},view);
   await p.keyboard.press(switchPane);assert(await p.evaluate(()=>!!document.activeElement.closest('.mainpanel')));
   await p.keyboard.press(switchPane);assert(await p.evaluate(()=>!!document.activeElement.closest('.treepanel')));
 }
 assert.deepEqual(errors,[]);await browser.close();console.log('PASS editor search caret/filter restoration, draft cancellation, link focus, child shortcuts, list boundaries, dark dropdowns and day chip');
})().catch(error=>{console.error(error);process.exit(1)});
