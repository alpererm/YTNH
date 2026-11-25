const assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await (process.env.BROWSER_ENGINE==='webkit'?webkit:chromium).launch(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{});
 try{
 const page=await browser.newPage({viewport:{width:1500,height:1000}});
 // The Planner scrolls towards the current time; fix the clock so the fixed click positions below hold at any hour.
 await page.clock.install({time:new Date(2026,10,24,12,0)});
 await page.goto(require('node:url').pathToFileURL(require('node:path').resolve(__dirname,'../app.html')).href);
 await page.evaluate(()=>{installDatabase(createEmptyDatabase());const n=createItem(db,'Todo');n.title='Fixture';n.scheduledDates=['2026-12-01','2026-12-03'];window.testTodo=n.id;DailyPlanner.open();DailyPlanner.selectDay('2026-12-07')});
 const timeline=page.locator('.planGrid'),marker=page.locator('.planSlotMarker');
 const rect=await timeline.boundingBox();
 // Click near the end of 07:15–07:30, where nearest-quarter rounding chose 07:30.
 await page.mouse.click(rect.x+80,rect.y+29*1.45);
 assert(await marker.isVisible());const bounds=await marker.boundingBox();
 assert(Math.abs(bounds.y-rect.y-15*1.45)<1&&Math.abs(bounds.height-15*1.45)<1);
 await page.getByRole('menuitem',{name:'Create meeting'}).click();
 assert.equal(await marker.count(),0);assert.equal(await page.getByLabel('Start time').inputValue(),'07:15');
 await page.getByLabel('Meeting title').fill('Slot test');await page.getByRole('button',{name:'Apply',exact:true}).click();
 assert.equal(await page.evaluate(()=>Object.values(db.planner.meetings)[0].versions[0].start),435);
 await page.evaluate(()=>undo());await page.locator('[data-act=next]').click();assert.equal(await marker.count(),0);
 await page.locator('[data-act=prev]').click();
 async function drop(from,copy=false){
   await page.locator('.planGrid').evaluate((e,{from,copy})=>{
     const data=new DataTransfer();data.setData('text/plain',window.testTodo);
     if(from)data.setData('application/x-local-calendar-item',JSON.stringify({id:window.testTodo,from}));
     e.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,ctrlKey:copy,dataTransfer:data,clientY:e.getBoundingClientRect().top+90}));
   },{from,copy});
 }
 for(const from of [null,'2026-12-01']){
   await page.evaluate(()=>{draggedItemId=window.testTodo});
   await timeline.dispatchEvent('dragover',{clientY:rect.y+65,dataTransfer:await page.evaluateHandle(()=>new DataTransfer())});
   assert(await marker.isVisible());await drop(from,true);assert.equal(await marker.count(),0);
   assert.deepEqual(await page.evaluate(()=>db.items[0].scheduledDates),['2026-12-01','2026-12-03','2026-12-07']);
   await page.evaluate(()=>{draggedItemId=null;undo()});
 }
 await page.mouse.click(rect.x+80,rect.y+25);await page.keyboard.press('Escape');assert.equal(await marker.count(),0);
 await drop(null);assert.deepEqual(await page.evaluate(()=>db.items[0].scheduledDates),['2026-12-01','2026-12-03']);
 await drop('2026-12-01');assert.deepEqual(await page.evaluate(()=>db.items[0].scheduledDates),['2026-12-03','2026-12-07']);
 const node=page.locator('.planBlock.Todo').first();
 const key=(await node.getAttribute('data-identity')).split('@')[0];
 const session=()=>page.evaluate(key=>db.planner.sessions[key],key);
 const before=await session();let box=await node.boundingBox();const x=box.x+box.width/2,y=box.y+8;
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x,y+43.5);const ghost=page.locator('.planDragOutline');assert(await ghost.isVisible());assert.equal(await ghost.textContent(),'');assert.equal(await page.evaluate(()=>getSelection().toString()),'');await page.mouse.up();assert.equal(await ghost.count(),0);
 assert.equal((await session()).start,before.start+30);
 box=await page.locator('[data-identity="'+key+'@"]').boundingBox();const edge=box.y+box.height-2;
 await page.mouse.move(box.x+box.width/2,edge);await page.mouse.down();await page.mouse.move(box.x+box.width/2,edge+22);await page.mouse.up();
 assert.equal((await session()).duration,30);
 await page.evaluate(()=>filterOutlineDay('2026-12-08'));assert.equal(await page.getByLabel('Planner date (DD/MM/YYYY)',{exact:true}).inputValue(),'08/12/2026');
 await page.locator('[data-act=prev]').click();assert.equal(await page.evaluate(()=>calendarCursorDate),'2026-12-07');
 for(const theme of ['light','dark']){
   await page.evaluate(theme=>applyTheme(theme),theme);await page.setViewportSize({width:1100,height:800});
   assert.equal(await page.locator('#dailyPlanner [data-act=settings],#dailyPlanner [data-act=now]').count(),0);
 }
 await page.getByRole('separator',{name:'Resize Daily Planner'}).focus();await page.keyboard.press('ArrowLeft');
 assert(await page.evaluate(()=>Number(localStorage.getItem('ytnh-planner-width'))>0));
 console.log('PASS Outline/Calendar drop payloads, move and resize gestures, calendar date sync, themes and width preference');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
