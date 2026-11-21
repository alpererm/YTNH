// Completing a Todo: it stays (ticked, struck through) for a short grace period, can be undone with one
// more click, then leaves and the selection moves on. With "Show inactive" on, nothing disappears.
const assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const path=require('node:path');const {pathToFileURL}=require('node:url');
(async()=>{
 const browser=await (process.env.BROWSER_ENGINE==='webkit'?webkit:chromium).launch(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{});
 const p=await browser.newPage({viewport:{width:1300,height:850}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(pathToFileURL(path.resolve(__dirname,'../app.html')).href);
 const setup=()=>p.evaluate(()=>{autosaveEnabled=false;installDatabase(createEmptyDatabase());db.settings.hideWeekends=false;const a=createItem(db,'Todo');a.title='First';const b=createItem(db,'Todo');b.title='Second';window.ids={a:a.id,b:b.id};$('showDone').checked=false;selected=a.id;render();showCalendar();focusOutlineItem(a.id)});
 const row=id=>p.locator(`#tree .row[data-id="${id}"]`);
 const ids=async()=>p.evaluate(()=>ids);

 await setup();let {a,b}=await ids();
 await row(a).locator('.itemMarker').click();
 assert.equal(await p.evaluate(id=>itemById(db,id).status,a),'Done');
 assert.equal(await row(a).count(),1,'the completed Todo stays visible during the grace period');
 await p.waitForTimeout(2600);
 assert.equal(await row(a).count(),0,'it leaves after the grace period');
 assert.equal(await p.evaluate(()=>selected),b,'selection moves to the next item');

 await setup();({a,b}=await ids());
 await row(a).locator('.itemMarker').click();await p.waitForTimeout(500);
 await row(a).locator('.itemMarker').click();
 assert.equal(await p.evaluate(id=>itemById(db,id).status,a),'Todo','a second click within the grace period undoes it');
 await p.waitForTimeout(2600);
 assert.equal(await row(a).count(),1,'an undone Todo stays');

 await setup();({a,b}=await ids());
 await p.keyboard.press('Space');
 assert.equal(await p.evaluate(id=>itemById(db,id).status,a),'Done');assert.equal(await row(a).count(),1);
 await p.waitForTimeout(2600);assert.equal(await row(a).count(),0,'Space uses the same grace period');

 await setup();({a,b}=await ids());
 await p.evaluate(()=>{$('showDone').checked=true;render()});
 await row(a).locator('.itemMarker').click();await p.waitForTimeout(2600);
 assert.equal(await row(a).count(),1,'with Show inactive on, completed items stay');

 assert.deepEqual(errors,[]);
 await browser.close();console.log('PASS completion grace period, undo, keyboard completion and Show inactive');
})().catch(e=>{console.error(e);process.exit(1)});
