// #51: tags written in an item's text are its own tags; #53: any level of a nested tag is found.
const assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await (process.env.BROWSER_ENGINE==='webkit'?webkit:chromium).launch(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{});
 try{
 const page=await browser.newPage({viewport:{width:1400,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(require('node:url').pathToFileURL(require('node:path').resolve(__dirname,'../app.html')).href);
 const ev=(f,a)=>page.evaluate(f,a);
 await ev(()=>{autosaveEnabled=false;installDatabase(createEmptyDatabase());
   const parent=createItem(db,'Note');parent.title='Project';parent.explicitTags=['project'];
   const n=createItem(db,'Note',parent.id);n.title='Idea note';n.explicitTags=['work'];n.content='Some text #idea here';
   const g=createItem(db,'Note');g.title='Repo';g.explicitTags=['git/hub/data'];const d=createItem(db,'Note');d.title='DB';d.explicitTags=['database'];
   window.ids={parent:parent.id,n:n.id,g:g.id,d:d.id};render();openSelectedInFullEditor(n.id);selectSidebarTab('properties')});
 // #51 Properties: the tag in the text sits with the item's own tags; Inherited shows only the parent's.
 assert.deepEqual(await page.locator('#tagChips .tagChip').allInnerTexts().then(t=>t.map(x=>x.replace('×','').trim())),['#work','#idea']);
 assert.equal(await page.locator('#tagChips .inTextTag [data-remove-tag]').count(),0,'a tag in the text has no remove button');
 assert.match(await page.locator('#inheritedTagInfo').innerText(),/#project/);
 assert.doesNotMatch(await page.locator('#inheritedTagInfo').innerText(),/#idea/);
 // #51 Details: Tags include it; "Inherited tags" lists only the parent's tag.
 await ev(()=>selectSidebarTab('details'));
 const details=await page.locator('#sidebar-details').innerText();
 assert.match(details,/Tags\s*#work\s*#idea|Tags\s*#idea\s*#work/);
 assert.match(details,/Inherited tags\s*#project/);
 assert.doesNotMatch(details,/Including from parents/);
 // #53 suggestions: "data" offers #database first, then #git/hub/data.
 await ev(()=>selectSidebarTab('properties'));
 await page.locator('#tagInput').click();await page.keyboard.type('data');
 assert.deepEqual(await page.locator('#tagSuggestions button').allInnerTexts().then(t=>t.map(x=>x.trim())),['#database','#git/hub/data']);
 await page.keyboard.press('Escape');
 // #53 search: #data and #hub/data find the nested tag; #ub does not match a partial level.
 const found=tags=>ev(tags=>filterItems(db,{tags}).map(i=>i.title).sort(),tags);
 assert.deepEqual(await found(['data']),['Repo']);
 assert.deepEqual(await found(['hub/data']),['Repo']);
 assert.deepEqual(await found(['git']),['Repo']);
 assert.deepEqual(await found(['ub']),[]);
 assert.deepEqual(errors,[]);
 console.log('PASS tags in the text are own tags (#51); nested tags found at any level (#53)');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
