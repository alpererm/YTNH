// #52 new items start in the editor title; #63 one copy row; #43 Archive tools menu; #49 plain links; #50 tag setting.
const assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await (process.env.BROWSER_ENGINE==='webkit'?webkit:chromium).launch(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{});
 try{
 const page=await browser.newPage({viewport:{width:1400,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(require('node:url').pathToFileURL(require('node:path').resolve(__dirname,'../app.html')).href);
 const ev=(f,a)=>page.evaluate(f,a);
 await ev(()=>{autosaveEnabled=false;installDatabase(createEmptyDatabase());const t=createItem(db,'Todo');t.title='Book the venue';const a=createItem(db,'Note');a.title='Existing';a.explicitTags=['work'];a.content=`See [[@{${t.id}}]].`;window.ids={t:t.id,a:a.id};render();openSelectedInFullEditor(a.id);focusPane('outline');focusOutlineItem(a.id)});
 // #52: with the editor open, N starts in the editor title with the placeholder selected; Esc before typing removes it.
 const count=await ev(()=>db.items.length);
 await page.keyboard.press('n');await page.waitForTimeout(200);
 assert.deepEqual(await ev(()=>[document.activeElement.id,$('editorTitle').selectionStart,$('editorTitle').selectionEnd,$('editorTitle').value]),['editorTitle',0,13,'Untitled Note']);
 await page.keyboard.press('Escape');
 assert.equal(await ev(()=>db.items.length),count,'Esc removes the untouched new item');
 await ev(()=>{focusPane('outline');focusOutlineItem(ids.a)});await page.keyboard.press('n');await page.waitForTimeout(200);
 await page.keyboard.type('Kept note');await page.keyboard.press('Escape');
 assert.equal(await ev(()=>db.items.at(-1).title),'Kept note','a typed title is kept');
 // #49: links read as plain coloured text without a box or icon.
 await ev(()=>openSelectedInFullEditor(ids.a));
 const link=await page.locator('#richEditor .mdref').evaluate(e=>{const s=getComputedStyle(e);return {bg:s.backgroundColor,border:s.borderTopWidth,padding:s.paddingLeft,icon:getComputedStyle(e.querySelector('.itemMarker')).display,text:e.textContent,colour:s.color,todo:getComputedStyle(document.body).getPropertyValue('--item-link').trim()}});
 assert.deepEqual([link.bg,link.border,link.padding,link.icon,link.text],['rgba(0, 0, 0, 0)','0px','0px','none','Book the venue']);
 // #63: one copy row.
 await ev(()=>selectSidebarTab('details'));
 assert.deepEqual(await page.locator('#sidebar-details .detailCopyButtons').innerText().then(t=>t.replace(/\s+/g,' ').trim()),'Copy: ID Link Embed');
 const rows=await page.locator('#sidebar-details .detailCopyButtons button').evaluateAll(bs=>new Set(bs.map(b=>Math.round(b.getBoundingClientRect().top))).size);
 assert.equal(rows,1,'the copy buttons share one line');
 // #50: tags under items follow the setting.
 await ev(()=>{closeRightEditor();renderTree()});
 assert.equal(await page.locator(`#tree .row[data-id="${await ev(()=>ids.a)}"] .outlineTag`).count(),1);
 await ev(()=>openSettings());await page.locator('#settingsTab-appearance').click();await page.locator('#settingsOutlineTags').uncheck();
 assert.equal(await page.locator(`#tree .row[data-id="${await ev(()=>ids.a)}"] .outlineTag`).count(),0,'hidden when turned off');
 await page.locator('#settingsOutlineTags').check();await ev(()=>closeModalShell());
 // #43: the Archive dialog has no intro text; its tools are in the … menu.
 await ev(()=>openArchiveBrowser());
 assert.equal(await page.locator('#modalText').innerText(),'');
 assert.equal(await page.locator('#archiveCompleted').isVisible(),false);
 await page.locator('.archiveMore>summary').click();
 for(const id of ['archiveCompleted','coldArchiveByDate','restoreColdArchiveFile'])assert.equal(await page.locator('#'+id).isVisible(),true,id);
 await ev(()=>closeModalShell());
 assert.deepEqual(errors,[]);
 console.log('PASS editor-title start (#52), plain links (#49), one copy row (#63), tag setting (#50), Archive menu (#43)');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
