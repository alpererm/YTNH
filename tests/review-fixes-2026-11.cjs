// November 2026 review fixes: Turkish search and tag order, Calendar Tab stops, labelled 24 px targets,
// whole-word Calendar titles, library wording and the app's own confirmation dialog.
const assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const path=require('node:path');const {pathToFileURL}=require('node:url');
(async()=>{
 const browser=await(process.env.BROWSER_ENGINE==='webkit'?webkit:chromium).launch(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{});
 try{
  const page=await browser.newPage({viewport:{width:1400,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(path.resolve(__dirname,'../app.html')).href);
  await page.evaluate(()=>{autosaveEnabled=false;installDatabase(createEmptyDatabase());db.settings.hideWeekends=false;
   const mk=(type,title)=>{const i=createItem(db,type);i.title=title;return i};
   const a=mk('Todo','Işık raporu');a.scheduledDates=[today()];a.tags=['şirket'];
   const b=mk('Todo','Şirket toplantısı');b.scheduledDates=[today()];b.tags=['çay'];
   const c=mk('Note','Supplier contract review');c.scheduledDates=[today()];c.tags=['ılık','iç','zeytin','cam'];
   const t=mk('Todo','Long target');t.target={startMonth:'2026-11',endMonth:'2027-03'};
   window.ids={a:a.id,b:b.id,c:c.id,t:t.id};render()});

  // Turkish search: dotless and dotted i, upper and lower case, and plain-Latin spellings all match.
  for(const q of ['ışık','isik','IŞIK','Işık','ISIK']){
   const found=await page.evaluate(q=>filterItems(db,{text:q}).map(i=>i.title),q);
   assert.ok(found.includes('Işık raporu'),`filter ${q}: ${found}`);
   const ranked=await page.evaluate(q=>rankItems(db.items,searchTerms(q)).map(r=>(r.item||r).title),q);
   assert.equal(ranked[0],'Işık raporu',`rank ${q}`);
  }
  assert.ok((await page.evaluate(()=>filterItems(db,{text:'sirket'}).map(i=>i.title))).includes('Şirket toplantısı'));
  console.log('PASS Turkish search folds ı/İ/I, ş and accents');

  // Tags sort in Turkish order: c, ç, ı, i, ş, z.
  assert.deepEqual(await page.evaluate(()=>['zeytin','şirket','iç','ılık','çay','cam'].sort(compareTags)),['cam','çay','ılık','iç','şirket','zeytin']);
  console.log('PASS tags sort in Turkish order');

  // Calendar: chip markers are not separate Tab stops; Target bar markers are not nested controls.
  await page.evaluate(()=>{showCalendar();renderCalendar()});
  const cal=await page.evaluate(()=>({tabbable:document.querySelectorAll('#calendarBody .itemMarker[tabindex="0"]').length,markers:document.querySelectorAll('#calendarBody .chip .itemMarker').length}));
  assert.ok(cal.markers>=3);assert.equal(cal.tabbable,0);
  await page.locator(`#calendarBody .cal-code [data-marker-id="${await page.evaluate(()=>ids.a)}"]`).first().click();
  assert.equal(await page.evaluate(()=>itemById(db,ids.a).status),'Done','marker click still completes');
  await page.evaluate(()=>{undo();calendarMode='years';showCalendar()});
  const bars=await page.evaluate(()=>[...document.querySelectorAll('.targetBar .itemMarker')].map(m=>({hidden:m.getAttribute('aria-hidden'),role:m.getAttribute('role'),tab:m.getAttribute('tabindex')})));
  assert.ok(bars.length>=1);for(const b of bars)assert.deepEqual(b,{hidden:'true',role:null,tab:null});
  await page.evaluate(()=>{calendarMode='weeks';showCalendar()});
  console.log('PASS Calendar markers out of the Tab order; Target bars have no nested controls');

  // Calendar titles wrap at word boundaries; the date-picker glyph is a 24 px target.
  assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('#calendarBody .chip .calendarItemTitle')).overflowWrap),'break-word');
  const glyph=await page.locator('.dayFirstField:has(#jumpDate) .dayPickerGlyph').boundingBox();
  assert.ok(glyph.width>=24&&glyph.height>=24,JSON.stringify(glyph));
  console.log('PASS whole-word Calendar titles and 24 px date-picker glyph');

  // Checklist checkboxes are named after their line and can be hit within 24 px.
  await page.evaluate(()=>{itemById(db,ids.c).content='- [ ] Call **the** supplier\n- [x] Send invoice';edit(ids.c)});
  const checks=await page.evaluate(()=>[...document.querySelectorAll('#richEditor input.md-check')].map(c=>c.getAttribute('aria-label')));
  assert.deepEqual(checks,['Call the supplier','Send invoice']);
  const hit=await page.evaluate(()=>{const c=document.querySelector('#richEditor input.md-check'),r=c.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;
   return [[cx-11,cy],[cx+11,cy],[cx,cy-11],[cx,cy+11]].map(([x,y])=>document.elementFromPoint(x,y)===c)});
  assert.deepEqual(hit,[true,true,true,true]);
  console.log('PASS labelled checklist checkboxes with a 24 px hit area');

  // Switching libraries with unsaved changes asks in the app's own dialog, worded for libraries.
  await page.evaluate(()=>{dirty=true;window.switchResult=allowDatabaseSwitch().then(v=>window.switchAnswer=v)});
  await page.waitForSelector('#appConfirmTitle');
  assert.match(await page.locator('dialog.libraryDialog').innerText(),/other library/);
  await page.locator('dialog.libraryDialog button',{hasText:'Cancel'}).click();
  await page.waitForFunction(()=>window.switchAnswer===false);
  await page.evaluate(()=>{dirty=false});
  assert.match(await page.evaluate(()=>{try{migrateDatabase({format:'other'})}catch(e){return e.message}}),/not a YTNH library/);
  assert.doesNotMatch(await page.evaluate(()=>document.body.innerHTML),/data file/i);
  console.log('PASS library wording and app confirmation dialog');

  assert.deepEqual(errors,[]);
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
