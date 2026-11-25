// Search box, find and replace, motion setting, reveal flash, Details, item menu, date labels and empty states.
const assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await (process.env.BROWSER_ENGINE==='webkit'?webkit:chromium).launch(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{});
 try{
 const page=await browser.newPage({viewport:{width:1500,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(require('node:url').pathToFileURL(require('node:path').resolve(__dirname,'../app.html')).href);
 const ev=f=>page.evaluate(f);
 // An empty library invites the first item instead of reporting a failed search.
 await ev(()=>{autosaveEnabled=false;installDatabase(createEmptyDatabase());render()});
 assert.match(await page.locator('#tree .empty').innerText(),/Nothing here yet/);
 await ev(()=>{
   const p=createItem(db,'Note');p.title='Project';p.collapsed=true;
   const t=createItem(db,'Todo',p.id);t.title='Launch';t.target={startMonth:'2026-11',endMonth:'2027-02'};
   const one=createItem(db,'Todo');one.title='One month';one.target={startMonth:'2026-11',endMonth:'2026-11'};
   const m=createItem(db,'Todo',p.id);m.title='Beta';m.milestone={targetWeek:'2026-W49'};
   const h=createItem(db,'Note',p.id);h.title='Section';h.heading=true;
   const n=createItem(db,'Note');n.title='Body';n.content='apple and Apple and APPLE';
   window.ids={p:p.id,t:t.id,one:one.id,m:m.id,h:h.id,n:n.id};itemById(db,ids.p).collapsed=false;render();
 });

 // Dates and weeks read unambiguously.
 assert.equal(await page.locator(`#tree .row[data-id="${await ev(()=>ids.t)}"] .outlineTarget`).innerText(),'Nov 2026 – Feb 2027');
 assert.equal(await page.locator(`#tree .row[data-id="${await ev(()=>ids.one)}"] .outlineTarget`).innerText(),'Nov 2026');
 assert.equal(await page.locator(`#tree .row[data-id="${await ev(()=>ids.m)}"] .outlineMilestone`).innerText(),'W49 2026');
 assert.equal(await ev(()=>shortMonthName(new Date(2026,8,1))),'Sep');

 // Outline search: the magnifier sits inside the field, the toolbar button hides, × clears.
 await ev(()=>{focusPane('outline');openOutlineSearch()});
 assert.equal(await page.locator('#outlineSearchButton').isVisible(),false);
 assert.equal(await page.locator('#searchClear').isVisible(),false,'no × without text');
 await page.keyboard.type('apple');
 assert.equal(await page.locator('#searchClear').isVisible(),true);
 const menu=await page.locator('#appMenu>summary').boundingBox(),field=await page.locator('#search').boundingBox();
 assert(field.x>=menu.x+menu.width-1,'the field does not cover the ☰ menu');
 await page.locator('#searchClear').click();
 assert.equal(await page.locator('#search').inputValue(),'');
 assert.equal(await ev(()=>document.activeElement.id),'search');
 await ev(()=>closeOutlineSearch(false));

 // Find and replace: compact floating panel, no Aa/W, Tab to Replace, Enter replaces and moves on, Mod+Enter all.
 await ev(()=>openSelectedInFullEditor(ids.n));
 // Check where the buttons appear on screen, not just their order in the page.
 const findX=(await page.locator('#documentFindButton').boundingBox()).x,formatX=(await page.locator('#formatMenu>summary').boundingBox()).x;
 assert(findX<formatX,`Find (${findX}) appears left of Formatting (${formatX})`);
 await page.locator('#documentFindButton').click();
 assert.equal(await page.locator('#documentFindBar button[aria-label="Match case"],#documentFindBar button[aria-label="Whole word"]').count(),0);
 const bar=await page.locator('#documentFindBar').boundingBox(),title=await page.locator('#editorTitle').boundingBox();
 assert(bar.y<title.y+title.height,'the panel sits at the top, over the title area');
 assert.equal(await page.locator('#documentFindBar output').innerText(),'');
 await page.keyboard.type('apple');
 assert.equal(await page.locator('#documentFindBar output').innerText(),'1/3');
 await page.keyboard.press('Tab');
 assert.equal(await ev(()=>document.activeElement.getAttribute('aria-label')),'Replace with');
 await page.keyboard.type('pear');await page.keyboard.press('Enter');
 assert.equal(await ev(()=>$('richEditor').innerText.trim()),'pear and Apple and APPLE');
 await page.keyboard.press(await ev(()=>IS_MAC?'Meta+Enter':'Control+Enter'));
 assert.equal(await ev(()=>$('richEditor').innerText.trim()),'pear and pear and pear');
 await page.keyboard.press('Shift+Tab');
 assert.equal(await ev(()=>document.activeElement.getAttribute('aria-label')),'Find text');
 await page.locator('#documentFindBar input[aria-label="Find text"]').fill('nothing');
 assert.equal(await page.locator('#documentFindBar output').innerText(),'No results');
 await page.keyboard.press('Escape');
 await page.waitForTimeout(250);

 // Details: kind names, no item actions, no old codes, one ID row.
 for(const [key,kind] of [['t','Target'],['m','Milestone'],['h','Heading'],['n','Note']]){
   await page.locator(`#tree .row[data-id="${await page.evaluate(key=>ids[key],key)}"]`).first().dblclick();
   await ev(()=>selectSidebarTab('details'));
   await page.waitForFunction(kind=>document.querySelector('#sidebar-details .detailsGrid>div:first-child strong')?.textContent===kind,kind,{timeout:3000}).catch(()=>{});
   assert.equal(await page.locator('#sidebar-details .detailsGrid>div:first-child strong').innerText(),kind);
 }
 const details=await page.locator('#sidebar-details').innerText();
 for(const gone of ['Item actions','Previous visible codes','Explicit tags','Recurrence'])assert(!details.includes(gone),gone);
 assert.equal(await page.locator('#sidebar-details [data-copy-ref]').count(),3);

 // The item menu carries Archive… and Delete….
 await ev(()=>{closeRightEditor();selected=ids.n;renderTree()});
 await page.locator(`#tree .row[data-id="${await ev(()=>ids.n)}"]`).click({button:'right'});
 for(const name of ['Archive…','Delete…'])assert.equal(await page.getByRole('menuitem',{name,exact:true}).count(),1,name);
 await page.keyboard.press('Escape');

 // A reveal from another view flashes the Outline row.
 await ev(()=>{itemById(db,ids.p).collapsed=true;renderTree();selectAndReveal(ids.m)});
 assert.equal(await page.locator(`#tree .row[data-id="${await ev(()=>ids.m)}"]`).evaluate(r=>r.classList.contains('navigationFlash')),true);

 // Animations: on by default; the Settings switch turns everything instant.
 assert.equal(await ev(()=>document.documentElement.classList.contains('no-motion')),false);
 await ev(()=>openSettings());
 await page.locator('#settingsAnimations').uncheck();
 assert.equal(await ev(()=>document.documentElement.classList.contains('no-motion')),true);
 assert.equal(await page.locator('.modal').evaluate(m=>getComputedStyle(m).animationName),'none');
 await page.locator('#settingsAnimations').check();
 assert.equal(await ev(()=>document.documentElement.classList.contains('no-motion')),false);

 // Calendar toolbar and days: icons, month title jumps, month only on the 1st, click selects, Enter/double-click filter.
 await ev(()=>{closeModalShell();DailyPlanner.close?.();closeRightEditor?.();clearOutlineDayFilter();setView('calendar');calendarMode='weeks';weekAnchor=new Date(2026,10,18,12);showCalendar();renderCalendar()});
 for(const id of ['today','weekMode','yearsMode'])assert.equal(await page.locator('#'+id).evaluate(b=>!!b.querySelector('svg')&&!b.textContent.trim()),true,id);
 assert.equal(await page.locator('#jumpDate').isVisible(),false);
 await page.locator('#calendarPeriodTitle').click();
 assert.equal(await ev(()=>$('modalTitle').dataset.jumpToDate),'true');await page.keyboard.press('Escape');
 assert.equal(await page.locator('.day[data-date="2026-12-01"] .daynum span:not(.todayBadge)').innerText(),'Dec');
 assert.equal(await page.locator('.day[data-date="2026-12-02"] .daynum span:not(.todayBadge)').count(),0,'no month on ordinary days');
 assert.equal(await page.locator('.day[data-date="2026-11-02"] .daynum span:not(.todayBadge)').innerText(),'Nov','with weekends hidden, the first Monday names a month that starts on a weekend');
 await page.locator('.day[data-date="2026-11-17"]').click({position:{x:6,y:6}});
 assert.deepEqual(await ev(()=>[outlineDayFilter,calendarCursorDate]),[null,'2026-11-17']);
 await page.keyboard.press('Enter');
 assert.equal(await ev(()=>outlineDayFilter),'2026-11-17');
 await page.keyboard.press('ArrowRight');
 assert.equal(await ev(()=>outlineDayFilter),'2026-11-18','the filter follows the selected day');
 await page.keyboard.press('Escape');
 assert.equal(await ev(()=>outlineDayFilter),null);
 await page.locator('.day[data-date="2026-11-19"]').dblclick({position:{x:6,y:6}});
 assert.equal(await ev(()=>outlineDayFilter),'2026-11-19');
 await ev(()=>clearOutlineDayFilter());

 // The day filter chip shows just the date.
 await ev(()=>{outlineDayFilter='2026-11-23';renderTree()});
 assert.equal(await page.locator('#activeFilterChips').innerText().then(t=>/Day:/.test(t)),false);
 assert.match(await page.locator('#activeFilterChips').innerText(),/23\/11\/2026|23 Nov/);
 await ev(()=>clearOutlineDayFilter());

 // The same item can't be planned twice in the same time.
 await ev(()=>{closeModalShell?.();const i=createItem(db,'Todo');i.title='Plan once';i.scheduledDates=['2026-11-12'];render();DailyPlanner.open();DailyPlanner.selectDay('2026-11-12')});
 for(let n=0;n<2;n++){
   await page.locator('.planGrid').focus();await page.keyboard.press('Enter');
   await page.getByRole('menuitem',{name:'Select Note or Todo'}).click();
   await page.locator('#refSearch').fill('Plan once');await page.keyboard.press('Enter');
 }
 assert.equal(await ev(()=>Object.values(db.planner.sessions).filter(s=>itemById(db,s.item)?.title==='Plan once').length),1);
 assert.match(await page.locator('#toast').innerText(),/already planned/);

 assert.deepEqual(errors,[]);
 console.log('PASS search box, find and replace, details, item menu, dates, flash, motion setting and empty library');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
