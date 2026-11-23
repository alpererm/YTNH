// Headings open and edit like other items: a click shows the heading in the editor (no instant rename),
// its own text is saved to it, F2 renames inline, and other items' text never appears as the heading's.
const assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const path=require('node:path');const {pathToFileURL}=require('node:url');
(async()=>{
 const browser=await(process.env.BROWSER_ENGINE==='webkit'?webkit:chromium).launch(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{});
 try{
  const page=await browser.newPage({viewport:{width:1300,height:800}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(path.resolve(__dirname,'../app.html')).href);
  const ids=await page.evaluate(()=>{autosaveEnabled=false;installDatabase(createEmptyDatabase());
   const proj=createItem(db,'Note');proj.title='Project';proj.content='Project body';
   const h=createItem(db,'Note',proj.id);h.title='Section A';h.heading=true;
   const n=createItem(db,'Note',proj.id);n.title='Meeting notes';n.content='Notes text of the meeting';
   render();edit(proj.id);return {proj:proj.id,h:h.id,n:n.id}});
  const state=()=>page.evaluate(ids=>({shows:editorDisplayedId===ids.h?'heading':editorDisplayedId===ids.n?'note':'other',title:$('editorTitle').value??$('editorTitle').textContent,inline:!!document.querySelector('#tree .inlineEdit'),headingContent:itemById(db,ids.h).content}),ids);
  await page.click(`#tree .row[data-id="${ids.h}"] .title`);await page.waitForTimeout(300);
  let s=await state();assert.equal(s.shows,'heading');assert.equal(s.title,'Section A');assert.equal(s.inline,false,'a click must not start renaming');
  // Text typed into the heading's editor belongs to the heading.
  await page.click('#richEditor');await page.keyboard.type('Heading note');await page.waitForTimeout(300);
  await page.click(`#tree .row[data-id="${ids.n}"] .title`);await page.waitForTimeout(300);
  s=await state();assert.equal(s.shows,'note');assert.match(s.headingContent,/Heading note/);assert.doesNotMatch(s.headingContent,/meeting/);
  // Back to the heading: its own text, not the note's.
  await page.click(`#tree .row[data-id="${ids.h}"] .title`);await page.waitForTimeout(300);
  assert.match(await page.locator('#richEditor').innerText(),/Heading note/);
  assert.doesNotMatch(await page.locator('#richEditor').innerText(),/Notes text of the meeting/);
  // F2 renames inline, as for any item.
  await page.evaluate(id=>focusOutlineItem(id),ids.h);await page.keyboard.press('F2');
  assert.ok(await page.locator('#tree .inlineEdit').count()===1);
  await page.locator('#tree .inlineEdit').fill('Section B');await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(id=>itemById(db,id).title,ids.h),'Section B');
  assert.deepEqual(errors,[]);
  console.log('PASS headings open, edit and rename like other items');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
