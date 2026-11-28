// #62: an embed (or link) at the end of a note can be selected, deleted and written after.
const assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await (process.env.BROWSER_ENGINE==='webkit'?webkit:chromium).launch(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{});
 try{
 const page=await browser.newPage({viewport:{width:1400,height:800}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(require('node:url').pathToFileURL(require('node:path').resolve(__dirname,'../app.html')).href);
 const reset=kind=>page.evaluate(kind=>{const n=itemById(db,ids.host);n.content=`Intro line\n\n${kind==='embed'?'!':''}[[@{${ids.target}}]]`;syncRichFromModel(n);return n.content},kind);
 const content=()=>page.evaluate(()=>itemById(db,ids.host).content);
 await page.evaluate(()=>{autosaveEnabled=false;installDatabase(createEmptyDatabase());const t=createItem(db,'Note');t.title='Embedded note';t.content='Some embedded text';const n=createItem(db,'Note');n.title='Host';window.ids={target:t.id,host:n.id};render();openSelectedInFullEditor(n.id)});
 for(const kind of ['embed','link']){
   const original=await reset(kind);
   await page.evaluate(()=>syncModelFromRich());
   assert.equal(await content(),original,kind+': opening the note does not change it');
   // Click below it and type.
   const box=await page.locator('#richEditor .mdref').boundingBox();
   await page.mouse.click(box.x+20,box.y+box.height+18);await page.keyboard.type('After');
   assert.match(await content(),/\]\]\nAfter$/,kind+': typing below it works');
   // Backspace right after it removes it in one step.
   await reset(kind);
   await page.evaluate(()=>{const blk=[...$('richEditor').children].find(b=>b.querySelector('.mdref'));const r=document.createRange();r.setStart(blk,blk.childNodes.length);r.collapse(true);getSelection().removeAllRanges();getSelection().addRange(r);$('richEditor').focus()});
   await page.keyboard.press('Backspace');
   assert(!(await content()).includes('[['),kind+': Backspace removes it');
   await page.evaluate(()=>undo());
   // A click selects it; Delete removes it.
   await reset(kind);
   const target=await page.locator(kind==='embed'?'#richEditor .embedref .embedtitle':'#richEditor .mdref').boundingBox();
   await page.mouse.click(target.x+target.width/2,target.y+target.height/2);
   assert.equal(await page.evaluate(()=>!!getSelection().getRangeAt(0).cloneContents().querySelector('.mdref')),true,kind+': a click selects it');
   await page.keyboard.press('Delete');
   assert(!(await content()).includes('[['),kind+': Delete removes it');
 }
 assert.deepEqual(errors,[]);
 console.log('PASS trailing embeds and links: write after, select, Backspace and Delete (#62)');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
