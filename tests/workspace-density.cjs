const screenshotDir=require('node:os').tmpdir();
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');const {pathToFileURL}=require('node:url');const path=require('node:path');
(async()=>{
 const browser=await(process.env.BROWSER_ENGINE==='webkit'?webkit:chromium).launch(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{});
 const p=await browser.newPage({viewport:{width:1500,height:900}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(pathToFileURL(path.resolve(__dirname,'../app.html')).href);
 await p.evaluate(()=>{autosaveEnabled=false;applyAppearance();installDatabase(createEmptyDatabase());db.settings.hideWeekends=false;window.item=createItem(db,'Todo');item.title='Review supplier requirements';item.content='A document to review';item.scheduledDates=[today()];selected=item.id;render();showCalendar();centerCurrentWeekRow()});
 const css=async(sel,prop)=>p.locator(sel).first().evaluate((e,k)=>getComputedStyle(e)[k],prop);
 assert.equal(await css('#tree','borderTopWidth'),'0px');
 for(const theme of ['light', 'dark']){
  await p.evaluate(t=>{appearance.theme=t;applyTheme()},theme);
  for(const sel of ['#appMenu>summary','#search','#groupBySelect','#jumpDate'])assert.equal(await css(sel,'backgroundColor'),'rgba(0, 0, 0, 0)');
  for(const sel of ['#appMenu>summary','#statusFilterBox','#mainPaneHead','.outlineActionsHead'])assert.equal(await css(sel,'borderBottomWidth'),'0px');
  await p.evaluate(()=>openOutlineSearch());assert.equal(await css('#search','backgroundColor'),'rgba(0, 0, 0, 0)');await p.evaluate(()=>closeOutlineSearch());
  assert.equal(await css('.weekrow','borderTopWidth'),await css('.weekrow>.day','borderLeftWidth'));
  assert.notEqual(await css('.weekrow','borderTopColor'),await css('.weekrow>.day','borderLeftColor'));
  assert(Math.abs(parseFloat(await css('.chip','fontSize'))-parseFloat(await css('#tree .title','fontSize'))*.86)<.1,'Calendar chips are 86% of the Outline text size');assert.equal(await css('.chip','backgroundColor'),'rgba(0, 0, 0, 0)');
  await p.screenshot({path:`${screenshotDir}/workspace-density-${theme}.png`});
 }
 for(const width of [1000,1500]){
  await p.setViewportSize({width,height:900});
  const fits=await p.locator('.outlineHeaderLeft').evaluate(e=>{const r=e.getBoundingClientRect(),s=document.querySelector('#outlineGroupButton').getBoundingClientRect();return Math.abs(r.right-s.right)<1});assert(fits);
  await p.evaluate(()=>edit(item.id));await p.waitForFunction(()=>Math.abs(document.querySelector('.editorDocument').clientWidth-document.querySelector('.writingArea').clientWidth)<1);assert.equal(await css('#editor .editmeta','borderBottomWidth'),'0px');
  await p.evaluate(()=>focusBodyStart());assert.equal(await css('#tree .row.sel','backgroundColor'),await css('.sidebarTabs button[aria-selected="true"]','backgroundColor'));
  const w=await p.locator('.writingArea').evaluate(e=>e.getBoundingClientRect().width);await p.evaluate(()=>toggleEditorSidebar());assert(await p.evaluate(before=>{const width=document.querySelector('.writingArea').getBoundingClientRect().width;return $('editorWorkspace').classList.contains('sidebar-hidden')?width>=before:width<=before},w));
  await p.evaluate(()=>toggleEditorSidebar());await p.screenshot({path:`${screenshotDir}/workspace-density-editor-${width}.png`});await p.evaluate(()=>showCalendar());
 }
 for(const windows of [false,true])for(const size of [8,10,14,18]){await p.evaluate(({windows,size})=>{document.body.classList.toggle('windows-desktop',windows);appearance.interfaceSize=size;applyAppearance()}, {windows,size});for(const sel of ['#tree .itemMarker','#calendarBody .itemMarker']){assert.equal(await css(sel+' svg','width'),'15px');assert(await p.locator(sel).first().evaluate(e=>e.getBoundingClientRect().width>=24))}assert.equal(await css('#tree .title','fontSize'),size+'px')}
 await p.evaluate(()=>openSettings());await p.selectOption('#settingsInterfaceSize','8');await p.selectOption('#settingsEditorSize','8');await p.locator('#modalOK').click();
 assert(Math.abs(parseFloat(await css('.chip','fontSize'))-8*.86)<.1,'Calendar chips follow the interface size');assert.equal(await css('#tree .title','fontSize'),'8px');
 await p.reload();assert.equal(await p.evaluate(()=>appearance.interfaceSize),8);assert.equal(await p.evaluate(()=>appearance.editorSize),8);
 assert.deepEqual(errors,[]);await browser.close();console.log('PASS Workspace density, two themes, aligned headers, equal calendar/Outline text, 8px persistence, sidebar width and removed dividers');
})().catch(e=>{console.error(e);process.exit(1)});
