// A numbered list keeps the number typed on its first item ("5." stays 5), also after an empty line;
// items that continue a list are numbered in sequence.
const assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const path=require('node:path');const {pathToFileURL}=require('node:url');
(async()=>{
 const browser=await (process.env.BROWSER_ENGINE==='webkit'?webkit:chromium).launch(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{});
 const p=await browser.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(pathToFileURL(path.resolve(__dirname,'../app.html')).href);
 await p.evaluate(()=>{autosaveEnabled=false;installDatabase(createEmptyDatabase());const i=createItem(db,'Note');i.title='L';i.content='Intro\n\n';window.nid=i.id;render();edit(i.id)});
 await p.waitForTimeout(200);await p.evaluate(()=>{const r=document.createRange();r.selectNodeContents($('richEditor').lastElementChild);r.collapse(false);$('richEditor').focus();getSelection().removeAllRanges();getSelection().addRange(r)});
 await p.keyboard.type('5. five');await p.keyboard.press('Enter');await p.keyboard.type('six');await p.keyboard.press('Enter');await p.keyboard.press('Enter');await p.keyboard.press('Enter');
 await p.keyboard.type('3. three');await p.keyboard.press('Enter');await p.keyboard.type('four');await p.waitForTimeout(200);
 const r=await p.evaluate(()=>{syncModelFromRich();return [itemById(db,nid).content,[...document.querySelectorAll('#richEditor .md-list-marker')].map(m=>m.textContent)]});
 assert.equal(r[0],'Intro\n\n5. five\n6. six\n\n3. three\n4. four');
 assert.deepEqual(r[1],['5.','6.','3.','4.']);
 // Reopening keeps the numbers.
 await p.evaluate(()=>{edit(nid)});await p.waitForTimeout(150);
 assert.deepEqual(await p.evaluate(()=>[...document.querySelectorAll('#richEditor .md-list-marker')].map(m=>m.textContent)),['5.','6.','3.','4.']);
 assert.deepEqual(errors,[]);await browser.close();console.log('PASS numbered lists start at the typed number and continue in sequence');
})().catch(e=>{console.error(e);process.exit(1)});
