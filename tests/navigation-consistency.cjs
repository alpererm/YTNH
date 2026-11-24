// Back/Forward, Quick Open, item commands, picker keys and archive lists behave consistently.
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
   const p=createItem(db,'Note');p.title='Project';p.collapsed=true;
   const a=createItem(db,'Note',p.id);a.title='Meeting notes';
   const b=createItem(db,'Note');b.title='Meeting notes';b.scheduledDates=['2026-11-10'];
   const c=createItem(db,'Note');c.title='Third';
   for(let i=0;i<25;i++){const x=createItem(db,'Note');x.title='Filler '+i}
   window.ids={p:p.id,a:a.id,b:b.id,c:c.id};render();
 });
 const ev=f=>page.evaluate(f);

 // Back/Forward: stepping through the Outline with the arrow keys adds no history; opening items does.
 await ev(()=>{focusBack=[];focusForward=[];focusHistoryCurrent=null;selected=ids.c;renderTree();focusPane('outline')});
 for(let i=0;i<4;i++)await page.keyboard.press('ArrowDown');
 assert.equal(await ev(()=>focusBack.length),0,'arrow stepping is not history');
 await ev(()=>{openSelectedInFullEditor(ids.a);openSelectedInFullEditor(ids.b);openSelectedInFullEditor(ids.c)});
 assert.deepEqual(await ev(()=>focusBack.map(s=>s.id).slice(-2)),await ev(()=>[ids.a,ids.b]));
 await ev(()=>{navigateFocusHistory(false)});
 assert.equal(await ev(()=>selected),await ev(()=>ids.b));
 await ev(()=>{for(let i=0;i<60;i++)openSelectedInFullEditor(i%2?ids.a:ids.c)});
 assert.equal(await ev(()=>focusBack.length),50,'history keeps 50 steps');

 // Quick Open: parent paths, Shift+Enter reveals, create from the query, item commands, page keys.
 await ev(()=>{closeRightEditor();selected=ids.a;itemById(db,ids.p).collapsed=true;renderTree();openQuickOpen()});
 assert.match(await page.locator('#modalText').innerText(),/Shift\+Enter/);
 assert.doesNotMatch(await page.locator('#modalText').innerText(),/Alt\+K|Option\+K/);
 await page.locator('#refSearch').fill('meeting notes');
 assert.deepEqual(await page.locator('#refResults .refResult small.refPath').allInnerTexts(),['Project']);
 const first=await page.locator('#refResults [data-ref-pick]').first().getAttribute('data-ref-pick');
 await page.locator('#refSearch').press('Shift+Enter');
 assert.equal(await ev(()=>$('modalbg').classList.contains('open')),false);
 assert.equal(await ev(()=>selected),first);
 assert(!(await page.locator('#editor').isVisible()),'Shift+Enter does not open the editor');
 await ev(()=>openQuickOpen());
 await page.locator('#refSearch').fill('Totally new idea');
 await page.locator('[data-create-reference="Todo"]').click();
 assert.equal(await ev(()=>db.items.at(-1).title),'Totally new idea');
 assert(await page.locator('#editor').isVisible(),'the created item opens');
 await ev(()=>{closeRightEditor();selected=ids.b;openQuickOpen()});
 await page.locator('#refSearch').fill('>item');
 const commands=await page.locator('#refResults .commandResult').allInnerTexts();
 for(const name of ['Item: Show in Outline','Item: Show in Calendar','Item: Move To…','Item: Copy Link','Item: History…'])assert(commands.some(c=>c.includes(name)),name);
 await page.locator('#refSearch').fill('');
 await page.locator('#refSearch').press('PageDown');
 assert.equal(await page.locator('#refResults button').nth(10).evaluate(b=>b.classList.contains('active')),true);
 await page.locator('#refSearch').press(await ev(()=>IS_MAC?'Meta+ArrowDown':'Control+ArrowDown'));
 assert.equal(await page.locator('#refResults button').last().evaluate(b=>b.classList.contains('active')),true);
 await page.locator('#refResults button').nth(2).hover();
 assert.equal(await page.locator('#refResults button').nth(2).evaluate(b=>b.classList.contains('active')),true,'hover moves the highlight');
 assert.equal(await page.locator('#modalOK').innerText(),'Cancel');
 await page.keyboard.press('Escape');

 // Item menu: Show in Calendar, Move to… and Copy link.
 await ev(()=>{selected=ids.b;renderTree()});
 await page.locator(`#tree .row[data-id="${await ev(()=>ids.b)}"]`).click({button:'right'});
 for(const name of ['Show in Calendar','Move to…','Copy link'])assert.equal(await page.getByRole('menuitem',{name,exact:true}).count(),1,name);
 await page.getByRole('menuitem',{name:'Move to…',exact:true}).click();
 await page.locator('#refSearch').fill('Project');await page.locator('#refSearch').press('Enter');
 assert.equal(await ev(()=>itemById(db,ids.b).parentId),await ev(()=>ids.p));

 // Archive lists: typo-tolerant search and the restored item is shown in the Outline.
 await ev(()=>{checkpoint();archiveSubtree(db,ids.c,true);render();openArchiveBrowser()});
 await page.locator('#archiveSearch').fill('thrid');
 await page.locator('#archiveSearch').dispatchEvent('input');
 assert.equal(await page.locator(`[data-restore="${await ev(()=>ids.c)}"]`).count(),1,'typo still finds the item');
 await page.locator(`[data-restore="${await ev(()=>ids.c)}"]`).click();
 assert.equal(await ev(()=>selected),await ev(()=>ids.c));

 // Ctrl/Cmd+P opens Quick Open; Ctrl/Cmd +/−/0 change the saved Interface and Editor sizes.
 const mod=await ev(()=>IS_MAC?'Meta':'Control');
 await ev(()=>{closeModalShell?.();focusPane('outline')});
 await page.keyboard.press(mod+'+p');
 assert.equal(await ev(()=>$('modalTitle').dataset.quickOpen),'true');
 await page.keyboard.press('Escape');
 const before=await ev(()=>[appearance.interfaceSize,appearance.editorSize]);
 await page.keyboard.press(mod+'+Equal');
 assert.deepEqual(await ev(()=>[appearance.interfaceSize,appearance.editorSize]),before.map(x=>x+1));
 assert.equal(await ev(()=>JSON.parse(localStorage.getItem(APPEARANCE_KEY)).interfaceSize),before[0]+1);
 await page.keyboard.press(mod+'+Digit0');
 assert.deepEqual(await ev(()=>[appearance.interfaceSize,appearance.editorSize]),[14,14]);
 // Commands read as Title Case and carry the right keys for this platform.
 assert.equal(await ev(()=>commandTitleCase('Item: Move to…')),'Item: Move To…');
 assert.equal(await ev(()=>commandTitleCase('Item: Mark Waiting for')),'Item: Mark Waiting for');
 const focus=await ev(()=>quickOpenCommands().find(c=>c.title==='Focus Mode').run);
 assert.equal(focus,await ev(()=>IS_MAC?'key:Ctrl+Mod+F':'key:F11'));

 // Clicking the item whose editor is open moves focus to the Outline (and keeps the editor on it).
 await ev(()=>{selected=ids.a;openSelectedInFullEditor(ids.a)});
 await page.locator('#richEditor').click();
 await page.locator(`#tree .row[data-id="${await ev(()=>ids.a)}"] .title`).first().click();
 await page.waitForTimeout(300);
 assert.deepEqual(await ev(()=>[document.activeElement.closest('.row')?.dataset.id===ids.a,activePane,editorDisplayedId===ids.a]),[true,'outline',true]);

 // Focus Mode: toolbar icons dim (only there); the side panel starts closed and opens with its shortcut.
 const opacity=()=>ev(()=>['#formatMenu>summary','#documentFindButton','#editorFocusToggle','#sidebarToggle'].map(s=>getComputedStyle(document.querySelector(s)).opacity));
 assert.deepEqual(await opacity(),['1','1','1','1']);
 await ev(()=>{$('richEditor').focus();setEditorFocus(true)});
 await page.waitForTimeout(300);
 assert.deepEqual(await opacity(),['0.35','0.35','0.35','0.35']);
 assert.equal(await page.locator('#editorSidebar').isVisible(),false);
 await page.keyboard.press(mod+'+Backslash');
 assert.equal(await page.locator('#editorSidebar').isVisible(),true,'the side panel opens in Focus Mode');
 const box=await page.locator('#editorSidebar').boundingBox(),doc=await page.locator('#editor .editorDocument').boundingBox();
 assert(box.x>=doc.x+doc.width-1,'the side panel does not cover the writing');
 await page.locator('#sidebarToggle').click();
 assert.equal(await page.locator('#editorSidebar').isVisible(),false,'its button closes it again');
 await ev(()=>setEditorFocus(false));
 await page.waitForTimeout(300);
 assert.deepEqual(await opacity(),['1','1','1','1']);

 assert.deepEqual(errors,[]);
 console.log('navigation consistency: ok');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
