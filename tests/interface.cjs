// Settings are tabbed; these checks show every panel so each control can be reached directly.
const screenshotDir=require('node:os').tmpdir();
const assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {pathToFileURL}=require('node:url');const path=require('node:path');
const fs=require('node:fs');
const themes=['light', 'dark'];
async function fixture(p){
 await p.evaluate(()=>{
  autosaveEnabled=false;installDatabase(createEmptyDatabase());db.settings.hideWeekends=false;
  const target=createItem(db,'Todo');target.title='Supplier programme';target.target={startMonth:'2026-10',endMonth:'2027-03'};
  const note=createItem(db,'Note');note.title='Project communication and technical requirements';note.explicitTags=['project/suppliers'];note.content='# Introduction\nConfirm the technical requirements with the supplier.\n## Technical evaluation\nFollow up on pricing and delivery.\n| Equipment | Supplier |\n|---|---|\n| Pump A | Supplier X |';note.scheduledDates=[today()];
  const child=createItem(db,'Todo',target.id);child.title='Request quotation and confirm the delivery schedule';child.scheduledDates=[today()];
  const milestone=createItem(db,'Todo',target.id);milestone.title='Technical review';milestone.milestone={targetWeek:isoWeekKey(today())};
  const later=createItem(db,'Todo');later.title='Installation';later.target={startMonth:'2027-04',endMonth:'2027-08'};
  window.ids={target:target.id,note:note.id,child:child.id};selected=note.id;render();showCalendar();centerCurrentWeekRow();window.original=JSON.stringify(db);
 });
}
async function state(p,theme,mode){await p.evaluate(({theme,mode})=>{
 appearance.theme=theme;applyTheme();
 if(mode==='editor'){edit(ids.note);sidebarState.visible=true;applySidebarState()}
 else {showCalendar();calendarMode=mode;renderCalendar();if(mode==='weeks')centerCurrentWeekRow()}
 document.activeElement?.blur();
},{theme,mode})}
(async()=>{
 const browser=await (process.env.BROWSER_ENGINE==='webkit'?webkit:chromium).launch(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{});
 const p=await browser.newPage({viewport:{width:1500,height:900}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(pathToFileURL(path.resolve(__dirname,'../app.html')).href);await fixture(p);
 const baselineFile=process.env.INTERFACE_BASELINE;
 if(baselineFile){
  const baseline=await browser.newPage({viewport:{width:1500,height:900}});await baseline.addInitScript(()=>localStorage.setItem('local-notes-todos-appearance',JSON.stringify({uiStyle:'bear'})));await baseline.goto(pathToFileURL(baselineFile).href);await fixture(baseline);
  for(const width of [1000,1500])for(const theme of themes)for(const mode of ['weeks','years','editor']){
   await Promise.all([p,baseline].map(page=>page.setViewportSize({width,height:900})));await state(p,theme,mode);await state(baseline,theme,mode);
   const actual=await p.locator('#layout').screenshot({animations:'disabled'}),expected=await baseline.locator('#layout').screenshot({animations:'disabled'});
   if(!actual.equals(expected)){fs.writeFileSync(`${screenshotDir}/layout-${theme}-${mode}-actual.png`,actual);fs.writeFileSync(`${screenshotDir}/layout-${theme}-${mode}-expected.png`,expected)}
   assert(actual.equals(expected),`Layout changed: ${theme} ${mode}`);
  }
  await baseline.close();
 }
 await state(p,'dark','weeks');await p.evaluate(()=>(openSettings(),document.querySelectorAll('.settingsPanel').forEach(x=>x.hidden=false)));
 assert.equal(await p.locator('#settingsTheme option').count(),2);assert.equal(await p.locator('#settingsUIStyle').count(),0);await p.locator('#modalOK').click();
 assert.equal(await p.evaluate(()=>JSON.stringify(db)),await p.evaluate(()=>original));
 for(const theme of themes){
  await state(p,theme,'weeks');
  await p.evaluate(()=>focusOutlineItem(selected));
  const row=p.locator('#tree .row.sel').first();assert.equal(await row.evaluate(e=>getComputedStyle(e,'::before').width),'3px');
  assert.equal(await row.evaluate(e=>getComputedStyle(e).backgroundColor),'rgba(0, 0, 0, 0)');
  await p.evaluate(()=>openOutlineSearch());await p.waitForFunction(()=>getComputedStyle(document.querySelector('#tree .row.paneMarker'),'::before').opacity==='1');assert.equal(await row.evaluate(e=>getComputedStyle(e,'::before').opacity),'1');assert.equal(await row.evaluate(e=>getComputedStyle(e).backgroundColor),'rgba(0, 0, 0, 0)');await p.evaluate(()=>closeOutlineSearch());
  const nested=p.locator('#tree .row').filter({hasText:'Request quotation'});assert(await nested.evaluate(e=>parseInt(getComputedStyle(e).paddingLeft)>10));
  const ordinary=p.locator('#calendarBody .day:not(.calendar-anchor)').first();assert.equal(await ordinary.evaluate(e=>getComputedStyle(e).backgroundColor),'rgba(0, 0, 0, 0)');
  const today=p.locator('.day.today');assert.equal(await today.evaluate(e=>getComputedStyle(e).outlineStyle),'none');
  assert.equal(await today.locator('.daynum').evaluate(e=>getComputedStyle(e,'::before').content),'none');
  assert.match(await today.locator('.daynum').innerText(),/\d+ \w+\s*Today/);assert.equal(await today.locator('.daynum .todayBadge').count(),1);
  assert.equal(await today.locator('.daynum').evaluate(e=>getComputedStyle(e).fontWeight),'700');
  assert.equal(await p.locator('.day:not(.today) .daynum').first().evaluate(e=>getComputedStyle(e).fontWeight),'400');
  // Today's column is tinted so it stands out (review 42).
  assert.notEqual(await today.evaluate(e=>getComputedStyle(e).backgroundColor),'rgba(0, 0, 0, 0)');
  assert.equal(await p.locator('.current-week>.weeknum').evaluate(e=>getComputedStyle(e).backgroundColor),'rgba(0, 0, 0, 0)');
  assert.equal(await p.locator('.milestoneChip').first().evaluate(e=>getComputedStyle(e).backgroundColor),'rgba(0, 0, 0, 0)');
  const bg=await p.locator('body').evaluate(e=>getComputedStyle(e).backgroundColor);
  for(const header of ['.treepanel>.head','#mainPaneHead'])assert.equal(await p.locator(header).evaluate(e=>getComputedStyle(e).backgroundColor),bg);
  for(const panel of ['.treepanel','.mainpanel'])assert.deepEqual(await p.locator(panel).evaluate(e=>[getComputedStyle(e).backgroundColor,getComputedStyle(e).borderTopColor]),[bg,'rgba(0, 0, 0, 0)']);
  for(const button of await p.locator('#calendarControls button').all())assert.equal(await button.evaluate(e=>getComputedStyle(e).borderTopColor),'rgba(0, 0, 0, 0)');
  const anchor=p.locator('.day.calendar-anchor');assert.notEqual(await anchor.evaluate(e=>getComputedStyle(e).borderTopColor),'rgba(0, 0, 0, 0)');
  await today.evaluate(e=>e.classList.add('drop-target'));assert.equal(await today.evaluate(e=>getComputedStyle(e).outlineStyle),'dashed');await today.evaluate(e=>e.classList.remove('drop-target'));
  assert(await p.locator('.milestoneChip').count()>0);
  for(const width of [1000,1500]){
   await p.setViewportSize({width,height:900});await state(p,theme,'weeks');await p.screenshot({path:`${screenshotDir}/workspace-${theme}-${width}-calendar.png`});
   await state(p,theme,'years');await p.evaluate(()=>{selected=ids.target;paintOutlineSelection()});
   assert.equal(await p.locator('.targetBar[data-selected="true"]').count(),2);
   assert.match(await p.locator('.targetBar[data-selected="true"]').first().evaluate(e=>getComputedStyle(e).boxShadow),/3px/);
   await p.screenshot({path:`${screenshotDir}/workspace-${theme}-${width}-targets.png`});
   await state(p,theme,'editor');
   for(const panel of ['#editor','#editorSidebar'])assert.equal(await p.locator(panel).evaluate(e=>getComputedStyle(e).backgroundColor),bg);
   await p.evaluate(()=>focusOutlineItem(selected));
   await p.locator('#sidebarTab-details').click();
   assert.equal(await p.locator('#tree .row.sel').first().evaluate(e=>getComputedStyle(e,'::before').opacity),'0');
   if(theme==='dark'&&width===1500)await p.screenshot({path:screenshotDir+'/workspace-compact-details.png'});
   assert.deepEqual(await p.locator('#sidebar-details .detailsGrid>div').first().evaluate(e=>[getComputedStyle(e).borderTopWidth,getComputedStyle(e).backgroundColor]),['0px','rgba(0, 0, 0, 0)']);
   await p.locator('#sidebarTab-properties').click();
   assert.equal(await p.locator('.writingArea').evaluate(e=>getComputedStyle(e).borderTopWidth),'0px');
   await p.screenshot({path:`${screenshotDir}/workspace-${theme}-${width}-editor.png`});

  }
 }
 await p.locator('#editorFocusToggle').click();assert.equal(await p.locator('.treepanel').isVisible(),false);await p.screenshot({path:screenshotDir+'/workspace-focus.png'});await p.locator('#editorFocusToggle').click();
 await p.evaluate(()=>(openSettings(),document.querySelectorAll('.settingsPanel').forEach(x=>x.hidden=false)));await p.selectOption('#settingsTheme','light');assert.equal(await p.getAttribute('body','data-theme'),'light');await p.locator('#modalOK').click();
 assert.equal(await p.evaluate(()=>JSON.stringify(db)),await p.evaluate(()=>original));
 // Exercise actual pointer/keyboard handlers in the workspace, not just CSS state.
 await state(p,'dark','weeks');
 const tomorrow=await p.evaluate(()=>Array.from($('calendarBody').querySelectorAll('.day[data-date]')).find(day=>day.dataset.date>today()&&day.offsetWidth)?.dataset.date);
 const drop=p.locator(`.day[data-date="${tomorrow}"]`);
 await p.locator('#tree .row').filter({hasText:'Project communication'}).dragTo(drop);
 assert.deepEqual(await p.evaluate(()=>itemById(db,ids.note).scheduledDates),[tomorrow]);
 await p.evaluate(()=>undo());assert.deepEqual(await p.evaluate(()=>itemById(db,ids.note).scheduledDates),[await p.evaluate(()=>today())]);
 await drop.click({position:{x:40,y:10}});assert.equal(await p.evaluate(()=>outlineDayFilter),tomorrow);
 await p.keyboard.press('Escape');assert.equal(await p.evaluate(()=>outlineDayFilter),null);
 await state(p,'light','years');
 await p.locator('#tree .row').filter({hasText:'Supplier programme'}).locator('.title').click();
 assert.equal(await p.locator('.targetBar[data-selected="true"]').count(),2);
 await p.locator('#tree .row').filter({hasText:'Project communication'}).locator('.title').click();
 assert.equal(await p.locator('.targetBar[data-selected="true"]').count(),0);
 await p.evaluate(()=>(openSettings(),document.querySelectorAll('.settingsPanel').forEach(x=>x.hidden=false)));await p.selectOption('#settingsTheme','light');await p.locator('#modalOK').click();
 await p.reload();assert.equal(await p.getAttribute('body','data-theme'),'light');
 assert.deepEqual(errors,[]);await browser.close();console.log('PASS theme persistence, unchanged JSON, two themes, Outline hierarchy/selection, calendar/drop indicators, Target selection, responsive editor/Focus Mode'+(baselineFile?', pixel-identical layout at both widths across all 15 theme/view combinations':''));
})().catch(e=>{console.error(e);process.exit(1)});
