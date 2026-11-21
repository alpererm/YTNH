const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const assert=require('node:assert/strict');const path=require('node:path');const {pathToFileURL}=require('node:url');
(async()=>{
 const b=await(process.env.BROWSER_ENGINE==='webkit'?webkit:chromium).launch(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{}),p=await b.newPage({viewport:{width:1500,height:900}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(pathToFileURL(path.resolve(__dirname,'../app.html')).href);const mod=await p.evaluate(()=>/Mac|iPhone|iPad/.test(navigator.platform)?'Meta':'Control');
 await p.evaluate(()=>{autosaveEnabled=false;appearance.theme='dark';applyAppearance();applyTheme();installDatabase(createEmptyDatabase());window.i=createItem(db,'Todo');i.title='Review supplier requirements';i.content='# Project\nFirst paragraph\nSecond paragraph';i.explicitTags=['supplier'];i.scheduledDates=[today()];edit(i.id);selectSidebarTab('properties');window.original=JSON.stringify(db)});
 for(const theme of ['light', 'dark']){
  await p.evaluate(t=>{appearance.theme=t;applyTheme()},theme);
  assert.equal(await p.locator('#editCode').evaluate(e=>getComputedStyle(e).backgroundColor),'rgba(0, 0, 0, 0)');
  assert.deepEqual(await p.locator('#backlinksBox').evaluate(e=>[getComputedStyle(e).backgroundColor,getComputedStyle(e).borderLeftWidth,getComputedStyle(e).borderTopWidth]),['rgba(0, 0, 0, 0)','0px','0px']);
  assert.notEqual(await p.locator('#milestoneEnabled').evaluate(e=>getComputedStyle(e).accentColor),'auto');
  assert.equal(await p.locator('#filtersContent legend').first().evaluate(e=>getComputedStyle(e).textTransform),'none');
  await p.locator('#tagInput').focus();assert.equal(await p.locator('#editorSidebar').isVisible(),true);
  await p.screenshot({path:`/private/tmp/workspace-polish-${theme}.png`});
 }
 await p.setViewportSize({width:1000,height:760});await p.waitForFunction(()=>getComputedStyle($('editorSidebar')).position==='absolute');
 await p.evaluate(()=>selectSidebarTab('properties'));
 const width=await p.locator('.writingArea').evaluate(e=>e.getBoundingClientRect().width);
 const preferences=await p.evaluate(()=>localStorage.getItem(SIDEBAR_KEY));
 await p.locator('#richEditor').click({position:{x:70,y:70}});assert.equal(await p.locator('#editorSidebar').isVisible(),false);
 assert.ok(await p.locator('.writingArea').evaluate(e=>e.getBoundingClientRect().width)>=width,'writing area may widen, never narrow, when the side panel drawer closes');
 assert.equal(await p.evaluate(()=>localStorage.getItem(SIDEBAR_KEY)),preferences);
 await p.evaluate(()=>{const text=$('richEditor').querySelector('[data-mdblock="p"]').firstChild;getSelection().collapse(text,3);rememberRichSelection()});
 const caret=await p.evaluate(()=>getSelection().anchorOffset);
 await p.locator('#sidebarToggle').click();assert.equal(await p.locator('#editorSidebar').isVisible(),true);assert.equal(await p.evaluate(()=>getSelection().anchorOffset),caret);
 await p.keyboard.type('X');assert.equal(await p.locator('#editorSidebar').isVisible(),false);assert.match(await p.evaluate(()=>i.content),/FirXst paragraph/);
 await p.evaluate(()=>undo());assert.equal(await p.evaluate(()=>itemById(db,i.id).content),'# Project\nFirst paragraph\nSecond paragraph');
 await p.locator('#sidebarToggle').click();assert.equal(await p.locator('#editorSidebar').isVisible(),true);
 await p.locator('#sidebarTab-headings').click();assert.equal(await p.locator('#editorSidebar').isVisible(),true);
 await p.locator('[data-heading-index="0"]').click(); // Heading navigation also returns to writing.
 assert.equal(await p.locator('#editorSidebar').isVisible(),false);
 // Command/Control+Shift+1 opens Properties while typing; the old Ctrl/Cmd+Alt+1 now only works outside text fields (review 38).
 await p.keyboard.press(mod+'+Shift+Digit1');assert.equal(await p.locator('#editorSidebar').isVisible(),true);
 await p.keyboard.press('ArrowRight');assert.equal(await p.locator('#editorSidebar').isVisible(),false);
 await p.keyboard.press(mod+'+Backslash');assert.equal(await p.locator('#editorSidebar').isVisible(),true);
 await p.keyboard.press(mod+'+Backslash');assert.equal(await p.locator('#editorSidebar').isVisible(),false);
 await p.keyboard.press(mod+'+Shift+Digit1');await p.locator('#richEditor').click({position:{x:70,y:70}});
 await p.setViewportSize({width:1500,height:900});await p.waitForFunction(()=>!$('editorWorkspace').classList.contains('sidebar-hidden'));
 assert.equal(await p.locator('#editorSidebar').isVisible(),true);await p.locator('#richEditor').click();assert.equal(await p.locator('#editorSidebar').isVisible(),true);
 assert.deepEqual(errors,[]);await b.close();console.log('PASS Workspace polish across two themes; narrow drawer pointer/typing/navigation/toggle, stable width/caret, saved preference, wide restoration');
})().catch(e=>{console.error(e);process.exit(1)});
