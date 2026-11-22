const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const assert=require('node:assert/strict');
(async()=>{const browser=await ({chromium,webkit}[process.env.BROWSER_ENGINE||'chromium']).launch(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{});const p=await browser.newPage({viewport:{width:1600,height:1000}});const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(require('node:url').pathToFileURL(require('node:path').resolve(__dirname,'../app.html')).href);
await p.evaluate(()=>{installDatabase(createEmptyDatabase());const i=createItem(db,'Note');i.title='Short';i.content='# One\n## Two\n#### Four\n##### Five\n###### Six\n# Last\n'+('A paragraph with enough words to measure wrapping. '.repeat(50));edit(i.id)});await p.waitForTimeout(100);
assert.deepEqual(await p.locator('[data-sidebar-tab]').evaluateAll(es=>es.map(e=>e.dataset.sidebarTab)),['properties','headings','details']);assert.equal(await p.locator('#sidebarTab-properties').getAttribute('aria-selected'),'true');for(const id of ['childNote','childTodo','doneBtn'])assert.equal(await p.locator('#'+id).isVisible(),false);
const date=await p.locator('.scheduledDateBox').boundingBox(),tags=await p.locator('#tagField').boundingBox();assert.ok(tags.y>date.y+date.height);assert.ok(Math.abs(tags.x-date.x)<2);
const code=await p.locator('#editCode').boundingBox();await p.locator('#editorTitle').fill('A very long title '.repeat(25));await p.waitForTimeout(50);const after=await p.locator('#editCode').boundingBox();assert.equal(after.y,code.y);assert.equal(after.x,code.x);
const measure=()=>p.locator('#richEditor').evaluate(e=>({width:e.getBoundingClientRect().width,height:e.scrollHeight}));const normal=await measure();await p.locator('#sidebarToggle').click();assert.ok((await measure()).width>=normal.width-1,'writing area never narrows when the side panel hides (responsive width since 87976da)');await p.locator('#editorFocusToggle').click();assert.ok(await p.locator('#richEditor').evaluate(e=>{const r=e.closest('.editorDocument').getBoundingClientRect(),w=e.closest('#editorWorkspace').getBoundingClientRect();return Math.abs((r.left-w.left)-(w.right-r.right))<3}),'Focus Mode centres the writing column (review 32)');await p.setViewportSize({width:1900,height:1000});await p.locator('#sidebarToggle').click();// still in Focus Mode: the column stays centred at its readable width (review 32)
await p.locator('#editorFocusToggle').click();await p.waitForTimeout(100);
const modifier=await p.evaluate(()=>/Mac|iPhone|iPad/.test(navigator.platform))?'Meta':'Control';await p.locator('#richEditor').focus();await p.keyboard.press(modifier+'+Shift+Digit2');assert.equal(await p.locator('#sidebarTab-headings').getAttribute('aria-selected'),'true');const positions=await p.locator('[data-heading-index]').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().x));assert.equal(positions[1]-positions[0],12);assert.equal(positions[2]-positions[0],36);await p.keyboard.press(modifier+'+Backslash');assert.equal(await p.locator('#editorSidebar').isVisible(),false);await p.keyboard.press(modifier+'+Backslash');assert.equal(await p.locator('#sidebarTab-headings').getAttribute('aria-selected'),'true');await p.keyboard.press(modifier+'+Shift+Digit1');assert.equal(await p.locator('#sidebarTab-properties').getAttribute('aria-selected'),'true');
for(const width of [1000,1100,1600]){await p.setViewportSize({width,height:1000});await p.waitForTimeout(100);const before=await measure();await p.locator('#sidebarToggle').click();assert.ok((await measure()).width>=before.width-1,'hiding the side panel never narrows the writing area');await p.locator('#sidebarToggle').click();assert.deepEqual(await measure(),before,'showing it again restores the original width')}
for(const theme of ['light','dark']){
 await p.evaluate(t=>{appearance.theme=t;applyTheme()},theme);
 for(const pct of ['30%','47%','62%']){
  await p.evaluate(value=>{$('layout').style.setProperty('--outline-pct',value);selectSidebarTab('properties')},pct);
  await p.waitForFunction(()=>{
   const sidebar=$('editorSidebar').getBoundingClientRect(),split=$('splitter').getBoundingClientRect();
   const line=getComputedStyle($('splitter'),'::after');
   const endsAt=(a,b)=>Math.abs(a-b)<1;
   const control=$('editorFocusToggle').getBoundingClientRect();
   const field=$('editor').querySelector('.writingArea').getBoundingClientRect();
   const tabs=$('sidebarTab-properties').getBoundingClientRect();
   const props=$('editor').querySelector('.editorOptions').getBoundingClientRect();
   return endsAt(sidebar.top,split.top+parseFloat(line.top)) &&
    endsAt(sidebar.bottom,split.bottom-parseFloat(line.bottom)) &&
    endsAt(tabs.left,props.left) && control.right<=sidebar.left &&
    // The writing area extends past the toolbar since the borderless layout (87976da); the toolbar must stay clear of the side panel.
    (sidebarIsDrawer() || control.right<=field.right+1);
  });
  const before=await p.locator('#editorSidebar').boundingBox();
  await p.locator('.documentScroll').evaluate(e=>e.scrollTop=e.scrollHeight);
  assert.deepEqual(await p.locator('#editorSidebar').boundingBox(),before);
 }
}
for(const theme of ['light', 'dark']){await p.evaluate(t=>{appearance.theme=t;applyTheme()},theme);assert.ok((await measure()).width>0)}assert.deepEqual(errors,[]);await browser.close();console.log('PASS sidebar defaults, shortcuts, Note controls, code anchoring, heading hierarchy and stable widths in normal/focus/narrow modes');})().catch(e=>{console.error(e);process.exit(1)});
