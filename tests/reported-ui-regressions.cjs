const assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await(process.env.BROWSER_ENGINE==='webkit'?webkit:chromium).launch(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{});
 try{
 const p=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(require('node:url').pathToFileURL(require('node:path').resolve(__dirname,'../app.html')).href);
 await p.evaluate(()=>{installDatabase(createEmptyDatabase());window.parent=createItem(db,'Note');parent.title='Needle parent';window.child=createItem(db,'Todo',parent.id);child.title='Needle child';window.other=createItem(db,'Todo');other.title='Needle elsewhere';render();selected=parent.id;$('search').value='Needle';renderTree();zoomIntoBranch()});
 assert.equal(await p.locator('#tree .row').count(),2);
 await p.evaluate(()=>{$('search').value='';zoomOutBranch();edit(parent.id);focusBodyStart();$('richEditor').innerHTML='<div data-mdblock="p">&lt;Call <strong>pasted supplier</strong> tomorrow</div>';placeCaretAtEnd($('richEditor').lastElementChild)});
 await p.keyboard.type('>');assert.equal(await p.locator('#richEditor .inlineTodo').count(),1);assert.equal(await p.evaluate(()=>db.items.at(-1).title),'Call pasted supplier tomorrow');
 await p.evaluate(()=>{showCalendar();DailyPlanner.open();sidebarState.visible=false;edit(parent.id)});assert(await p.locator('#editorSidebar').isVisible());
 await p.evaluate(()=>{focusBack=[];focusForward=[];focusHistoryCurrent=null;rememberFocusedItem();showCalendar();calendarMode='years';showCalendar();navigateFocusHistory(false)});assert.equal(await p.evaluate(()=>calendarMode),'weeks');
 await p.evaluate(()=>navigateFocusHistory(false));assert(await p.locator('#editor').isVisible());assert.equal(await p.evaluate(()=>selected),await p.evaluate(()=>parent.id));
 await p.evaluate(()=>navigateFocusHistory(true));assert(await p.locator('#calendarBody').isVisible());assert.equal(await p.evaluate(()=>calendarMode),'weeks');await p.evaluate(()=>navigateFocusHistory(true));assert.equal(await p.evaluate(()=>calendarMode),'years');
 await p.evaluate(()=>{calendarMode='weeks';showCalendar();DailyPlanner.open();DailyPlanner.selectDay('2026-11-16')});
 for(const selector of ['#dailyPlanner header .dayPickerGlyph','.dayFirstField:has(#jumpDate) .dayPickerGlyph']){
 await p.locator(selector).click();await p.locator('.toolbarDatePopup [data-pick-date="2026-11-18"]').click();assert.equal(await p.evaluate(()=>calendarCursorDate),'2026-11-18');assert.equal(await p.evaluate(()=>DailyPlanner.date),'2026-11-18');
 }
 await p.clock.setFixedTime(new Date(2026,10,12,11,37));await p.evaluate(()=>{DailyPlanner.selectDay('2026-11-18');PlannerModel.session(db,child,DailyPlanner.date,540,60);PlannerModel.session(db,other,DailyPlanner.date,555,15);DailyPlanner.paint()});
 assert.equal(await p.locator('.planBlock').count(),2);assert.equal(await p.locator('.planNow').count(),1);
 const boxes=await p.locator('.planBlock').evaluateAll(ns=>ns.map(n=>({x:n.offsetLeft,y:n.offsetTop,h:n.offsetHeight,w:n.offsetWidth})));assert(boxes[0].x!==boxes[1].x);assert(Math.max(...boxes.map(b=>b.h))>=85);
 await p.evaluate(()=>{edit(parent.id);$('editorTitle').value='Schedule @';$('editorTitle').focus();$('editorTitle').setSelectionRange(10,10);updateDateSuggestions($('editorTitle'))});assert.equal(await p.locator('#dateSuggestions .weekLabel').count(),6);
 await p.keyboard.press('Escape');await p.evaluate(()=>{child.status='Done';other.status='Cancelled';chooseReference()});/* finished items stay findable in pickers, dimmed (shared ranking) */assert.equal(await p.locator('[data-ref-pick="'+await p.evaluate(()=>child.id)+'"].inactiveResult').count(),1);assert.equal(await p.locator('[data-ref-pick="'+await p.evaluate(()=>other.id)+'"].inactiveResult').count(),1);
 assert.deepEqual(errors,[]);console.log('PASS search branch scope, formatted inline Todo, sidebar default, panel history, mouse date selection, continuous meeting columns, all-date marker, week numbers and reference status filtering');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
