const assert=require('node:assert/strict');
const {webkit,chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await(process.env.BROWSER_ENGINE==='webkit'?webkit:chromium).launch(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{});
 try{
 const p=await browser.newPage();await p.goto(require('node:url').pathToFileURL(require('node:path').resolve(__dirname,'../app.html')).href);
 await p.evaluate(()=>{installDatabase(createEmptyDatabase());window.a=createItem(db,'Note');a.title='Parent';window.c=createItem(db,'Todo',a.id);c.title='Child';c.status='Done';window.g=createItem(db,'Note',c.id);g.title='Grandchild';render()});
 assert.equal(await p.locator('#tree .treeExpand').count(),0);
 await p.evaluate(()=>{$('showDone').checked=true;renderTree()});
 const mainArrow=p.locator('#tree .treeExpand').first();const initial=await p.evaluate(()=>selected);await mainArrow.click();assert.equal(await mainArrow.getAttribute('aria-expanded'),'false');await mainArrow.click();assert.equal(await p.evaluate(()=>selected),initial);
 await p.locator('#tree .title').first().click({button:'right'});await p.getByRole('menuitem',{name:'Pin to top'}).click();
 const pins=p.locator('#pinnedOutline');assert.equal(await pins.locator('.row').count(),1);
 for(const status of ['Done','Cancelled','On hold','Waiting for','Todo']){
   await p.evaluate(status=>{c.status=status;$('showDone').checked=false;renderTree()},status);
   const expected=['Waiting for','Todo'].includes(status)?1:0;
   assert.equal(await pins.locator('.pinExpand').count(),expected);
   assert.equal(await p.locator('#tree .row').first().locator('.treeExpand').count(),expected);
 }
 await p.evaluate(()=>{c.status='Done';$('showDone').checked=true;renderTree()});
 await pins.getByLabel('Expand children').click();assert.equal(await pins.locator('.row').count(),2);
 await pins.locator('.title').last().click({button:'right'});await p.getByRole('menuitem',{name:'Pin to top'}).click();assert.equal(await pins.locator('.row').count(),3);
 await pins.locator('.pinExpand').nth(1).click();assert.equal(await pins.locator('.row').count(),4);
 await p.evaluate(()=>{$('search').value='no match here';db.settings.groupBy='tag';renderTree()});assert.equal(await pins.locator('.row').count(),4);
 await pins.locator('.title').first().click();assert(await p.locator('#editor').isVisible());assert.equal(await p.locator('#search').inputValue(),'no match here');
 await pins.locator('.row').last().dragTo(pins.locator('.row').first());assert(await p.evaluate(()=>pinnedIds()[0]===c.id));
 await p.evaluate(()=>{undo();renderTree()});assert(await p.evaluate(()=>pinnedIds()[0]===a.id));
 await p.evaluate(()=>{checkpoint();deleteSubtree(db,c.id);renderTree()});assert.equal(await pins.locator('.row').count(),1);
 await p.evaluate(()=>{undo();itemById(db,c.id).archived=true;renderTree()});assert.equal(await pins.locator('.row').count(),1);
 await p.evaluate(()=>{const child=itemById(db,c.id);child.archived=false;child.status='Done';$('search').value='Grandchild';db.settings.groupBy='status';selected=g.id;renderTree();focusOutlineItem(g.id);window.prior=JSON.stringify(db)});
 const tree=p.locator('#tree');await p.keyboard.press('Control+Shift+ArrowRight');assert.deepEqual(await tree.locator('.title').allTextContents(),['Parent','Child','Grandchild']);assert.equal(await tree.locator('.hierarchyContext').count(),2);
 await p.keyboard.press('Control+Shift+ArrowLeft');assert.deepEqual(await tree.locator('.title').allTextContents(),['Grandchild']);assert(await p.evaluate(()=>JSON.stringify(db)===prior));
 await pins.locator('.row').last().click();await p.keyboard.press('Control+Shift+ArrowRight');assert(await pins.locator('[data-hierarchy-context]').count()>=2);
 await p.keyboard.press('Control+Shift+ArrowLeft');assert.equal(await pins.locator('[data-hierarchy-context]').count(),0);
 console.log('PASS pinned hierarchy, search, grouping, editor, reorder, undo, archive and delete');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
