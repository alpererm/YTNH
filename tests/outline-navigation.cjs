// Outline indicators: calendar (scheduled, non-recurring), repeat (recurring) and clock (Daily Planner sessions).
// Hover lists dates; clicks navigate without changing data or selection; clock clicks cycle through a
// non-recurring item's sessions; a pinned Planner date is never changed by an icon click.
const assert=require('node:assert/strict');const{webkit,chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{const browser=await(process.env.BROWSER_ENGINE==='webkit'?webkit:chromium).launch(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{});try{
 const p=await browser.newPage({viewport:{width:1600,height:950}}),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(require('node:url').pathToFileURL(require('node:path').resolve(__dirname,'../app.html')).href);await p.clock.setFixedTime(new Date(2026,10,13,12));
 await p.evaluate(()=>{try{localStorage.removeItem('ytnh-planner-pin')}catch{}installDatabase(createEmptyDatabase());db.settings.hideWeekends=false;window.ids={};for(const name of ['Parent','Note','Todo','Past','Recurring','Current']){const i=createItem(db,name==='Todo'||name==='Recurring'?'Todo':'Note',name==='Todo'?ids.Parent:null);i.title=name;ids[name]=i.id}itemById(db,ids.Note).scheduledDates=['2026-11-19','2026-11-14'];itemById(db,ids.Todo).scheduledDates=['2026-11-16'];itemById(db,ids.Recurring).recurrence={frequency:'daily',interval:1,startDate:'2026-11-13'};PlannerModel.state(db);Object.assign(db.planner.sessions,{n2:{item:ids.Note,date:'2026-11-16',start:780,duration:30},n1:{item:ids.Note,date:'2026-11-14',start:600,duration:30},t1:{item:ids.Todo,date:'2026-11-16',start:540,duration:30,done:false},past:{item:ids.Past,date:'2026-11-13',start:600,duration:30},current:{item:ids.Current,date:'2026-11-13',start:705,duration:30}});db.planner.rules.r={item:ids.Recurring,versions:[{from:'2026-11-13',enabled:true,offset:0,start:780,duration:30,recurrence:itemById(db,ids.Recurring).recurrence}],exceptions:{'2026-11-13':{removed:true}}};db.settings.pinnedItems=[ids.Note,ids.Recurring];selected=ids.Parent;render();window.before=JSON.stringify({items:db.items,planner:db.planner});window.settingsBefore=JSON.stringify(db.settings)});
 const ids=await p.evaluate(()=>ids);const row=name=>p.locator(`#tree .row[data-id="${ids[name]}"]`);const nav=(name,kind)=>row(name).locator(`[data-outline-navigation="${kind}"]`);
 const kinds=name=>row(name).locator('.outlineNavigation button').evaluateAll(ns=>ns.map(n=>n.dataset.outlineNavigation));

 // Visibility
 assert.equal(await row('Parent').locator('.outlineNavigation').count(),0);
 assert.equal(await nav('Past','clock').count(),0,'past sessions show no clock');
 assert.equal(await nav('Current','clock').count(),1,'an ongoing session shows a clock');
 assert.deepEqual(await kinds('Note'),['clock','calendar'],'calendar stays rightmost');
 assert.deepEqual(await kinds('Todo'),['clock','calendar']);
 assert.deepEqual(await kinds('Recurring'),['clock','repeat'],'recurring: repeat instead of calendar, rightmost; clock to its left');
 const marker=await row('Recurring').locator('.itemMarker').evaluate(m=>({kind:m.dataset.markerKind,html:m.innerHTML}));
 assert.equal(marker.kind,'Recurring Todo');assert.match(marker.html,/<circle/);assert.doesNotMatch(marker.html,/m17 2/,'recurring Todo shows the regular Todo circle in the Outline');

 // Tooltips, sorted chronologically; recurring shows only the nearest occurrence
 const tip=(name,kind)=>nav(name,kind).getAttribute('data-tip');
 const noteDates=(await tip('Note','calendar')).split('\n');assert.equal(noteDates.length,2);assert.match(noteDates[0],/14/);assert.match(noteDates[1],/19/);
 const noteSessions=(await tip('Note','clock')).split('\n');assert.equal(noteSessions.length,2);assert.match(noteSessions[0],/14.*10:00–10:30/);assert.match(noteSessions[1],/16.*13:00–13:30/);
 assert.match(await tip('Recurring','repeat'),/^Next: .*13/,'next scheduled occurrence is today');assert.equal((await tip('Recurring','repeat')).split('\n').length,1);
 assert.match(await tip('Recurring','clock'),/^Next: .*14.*13:00/);assert.equal((await tip('Recurring','clock')).split('\n').length,1);

 await nav('Note','clock').hover();await p.waitForFunction(()=>!$('formatTooltip').classList.contains('hidden'));assert.equal(await p.locator('#formatTooltip .tooltipLabel').textContent(),noteSessions.join('\n'),'hover shows the session list');await p.mouse.move(5,900);
 // Calendar icon: unchanged behaviour (filtered views, no selection change)
 await p.evaluate(()=>{db.settings.hideWeekends=true;$('search').value='Parent';renderTree()});await p.locator(`#pinnedOutline [data-navigation-item="${ids.Note}"][data-outline-navigation=calendar]`).click();await p.waitForFunction(()=>calendarCursorDate==='2026-11-14');assert.equal(await p.evaluate(()=>selected),ids.Parent);assert.equal(await p.locator('#search').inputValue(),'');assert.equal(await p.locator(`#calendarBody .day[data-date="2026-11-14"] [data-cal-drag-item="${ids.Note}"]`).count(),1);
 await p.evaluate(()=>{db.settings.hideWeekends=false;$('search').value='';calendarNavigationReveal=null;renderTree();DailyPlanner.open(false)});

 // Clock: opens the Planner on the session date; cycles through a non-recurring item's sessions
 await nav('Todo','clock').click();await p.waitForFunction(()=>DailyPlanner.date==='2026-11-16');assert(await p.locator('#dailyPlanner').isVisible());assert.equal(await p.evaluate(()=>selected),ids.Parent);
 await nav('Note','clock').click();await p.waitForFunction(()=>DailyPlanner.date==='2026-11-14');
 await nav('Note','clock').click();await p.waitForFunction(()=>DailyPlanner.date==='2026-11-16');
 await nav('Note','clock').click();await p.waitForFunction(()=>DailyPlanner.date==='2026-11-14');assert.equal(await p.getByRole('menuitem').count(),0,'no pop-up menu');
 // Recurring clock: always the next planned occurrence
 await nav('Todo','clock').click();await p.waitForFunction(()=>DailyPlanner.date==='2026-11-16');
 for(let n=0;n<2;n++){await nav('Recurring','clock').click();await p.waitForFunction(()=>DailyPlanner.date==='2026-11-14')}

 // Repeat icon: Calendar to the next occurrence, and stays there on repeated clicks
 for(let n=0;n<2;n++){await p.evaluate(()=>{calendarCursorDate='2026-11-30'});await nav('Recurring','repeat').click();await p.waitForFunction(()=>calendarCursorDate==='2026-11-13')}

 // Pinned Planner date is never changed by an icon click
 await nav('Todo','clock').click();await p.waitForFunction(()=>DailyPlanner.date==='2026-11-16');
 await p.locator('#dailyPlanner [data-act=pin]').click();const pinBefore=await p.evaluate(()=>localStorage.getItem('ytnh-planner-pin'));assert.equal(pinBefore,'2026-11-16');
 await nav('Recurring','clock').click();await p.waitForTimeout(150);
 assert.equal(await p.evaluate(()=>DailyPlanner.date),'2026-11-16','pinned date unchanged');assert.match(await p.locator('#toast').textContent(),/Planner date is pinned/);
 await nav('Note','calendar').click();await p.waitForFunction(()=>calendarCursorDate==='2026-11-14');assert.equal(await p.evaluate(()=>DailyPlanner.date),'2026-11-16','Calendar navigation leaves the pinned Planner alone');
 await nav('Recurring','repeat').click();await p.waitForTimeout(100);assert.equal(await p.evaluate(()=>DailyPlanner.date),'2026-11-16');
 assert.equal(await p.evaluate(()=>localStorage.getItem('ytnh-planner-pin')),pinBefore,'still pinned');assert.equal(await p.getByRole('button',{name:'Return to pinned date'}).isVisible(),false);

 // Keyboard on an indicator; no data or settings changes; icons update immediately
 await nav('Todo','calendar').focus();await p.keyboard.press('Enter');await p.waitForFunction(()=>calendarCursorDate==='2026-11-16');assert.equal(await p.evaluate(()=>selected),ids.Parent);
 assert.equal(await p.evaluate(()=>JSON.stringify({items:db.items,planner:db.planner})),await p.evaluate(()=>before));assert.equal(await p.evaluate(()=>JSON.stringify(db.settings)),await p.evaluate(()=>settingsBefore));
 await p.evaluate(()=>{itemById(db,ids.Todo).recurrence={frequency:'daily',interval:1,startDate:'2026-11-16'};renderTree()});assert.deepEqual(await kinds('Todo'),['clock','repeat'],'icons follow a recurrence change');
 await p.evaluate(()=>{for(const k of ['n1','n2'])delete db.planner.sessions[k];renderTree()});assert.deepEqual(await kinds('Note'),['calendar'],'clock disappears with the sessions');

 // Themes and grouped view: same small icons
 for(const theme of ['light','dark']){await p.evaluate(t=>{applyTheme(t);renderTree()},theme);const rect=await nav('Note','calendar').boundingBox();assert(rect.width>=18&&rect.height>=20);assert.equal(await nav('Note','calendar').locator('svg').evaluate(n=>n.getBoundingClientRect().width),12)}
 await p.evaluate(()=>{db.settings.groupBy='type';renderTree()});assert(await p.locator(`#tree [data-navigation-item="${ids.Note}"][data-outline-navigation=calendar]`).count()>=1,'grouped view keeps the icons');
 assert.deepEqual(errors,[]);console.log('PASS Outline calendar/repeat/clock icons: visibility, tooltips, navigation, session cycling, recurrence, pinned Planner date, themes');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
