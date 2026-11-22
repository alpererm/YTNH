// Settings are tabbed; these checks show every panel so each control can be reached directly.
// Editor heading list: one current heading, set by a click / visible caret / scroll position, never stuck on
// the first heading; colour only (no background); Graphite Dark colours. Softer pane separators. Toolbars on
// one scale with SVG icons. Scroll past end: visual space only, per device, on by default.
const assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const path=require('node:path');const {pathToFileURL}=require('node:url');
(async()=>{
 const browser=await (process.env.BROWSER_ENGINE==='webkit'?webkit:chromium).launch(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{});
 const p=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(pathToFileURL(path.resolve(__dirname,'../app.html')).href);
 await p.evaluate(()=>{try{localStorage.removeItem('ytnh-scroll-past-end')}catch{}autosaveEnabled=false;installDatabase(createEmptyDatabase());
  const a=createItem(db,'Note');a.title='Doc';a.content='# Intro\n\nSome text.\n\n## Details\n\nMore.\n\n## Later\n\nEnd.';
  const long=createItem(db,'Note');long.title='Long';long.content=Array.from({length:60},(_,i)=>'Line '+i).join('\n\n');
  window.ids={a:a.id,long:long.id};selected=a.id;render();edit(a.id);sidebarState.tab='headings';sidebarState.visible=true;applySidebarState();refreshEditorSidebar()});
 await p.waitForTimeout(200);
 const current=()=>p.evaluate(()=>[...document.querySelectorAll('#sidebar-headings .current')].map(b=>b.textContent));
 await p.locator('#sidebar-headings [data-heading-index="2"]').click();await p.waitForTimeout(100);
 assert.deepEqual(await current(),['Later'],'the clicked heading becomes current, the first one does not stay marked');
 await p.evaluate(()=>focusOutlineItem(selected));await p.waitForTimeout(100);
 assert.deepEqual(await current(),['Later'],'and stays current when focus leaves the editor');
 await p.locator('#richEditor [data-mdblock="h2"]').first().click();await p.waitForTimeout(100);
 assert.deepEqual(await current(),['Details'],'moving the caret updates the current heading');
 assert.equal(await p.locator('#sidebar-headings .current').evaluate(b=>getComputedStyle(b).backgroundColor),'rgba(0, 0, 0, 0)','no background highlight');
 await p.evaluate(()=>{appearance.theme='dark';applyTheme()});
 assert.equal(await p.locator('#sidebar-headings .current').evaluate(b=>getComputedStyle(b).color),'rgb(204, 219, 229)','#CCDBE5 in Graphite Dark');
 assert.equal(await p.locator('#sidebar-headings [data-heading-index]:not(.current)').first().evaluate(b=>getComputedStyle(b).color),'rgb(151, 166, 177)');
 await p.evaluate(()=>{appearance.theme='light';applyTheme()});
 assert.notEqual(await p.locator('#sidebar-headings .current').evaluate(b=>getComputedStyle(b).color),'rgb(204, 219, 229)','other themes keep their colours');

 // Toolbars: 30x30 icon buttons with 16 px SVG icons; no text glyph icons.
 const sizes=await p.evaluate(()=>['#appMenu>summary','#outlineSearchButton','#filtersToggle','#outlineGroupButton','#formatMenu>summary','#documentFindButton','#editorFocusToggle','#sidebarToggle'].map(s=>{const e=document.querySelector(s),r=e.getBoundingClientRect(),i=e.querySelector('svg').getBoundingClientRect();return [s,Math.round(r.width),Math.round(r.height),Math.round(i.width)]}));
 for(const [s,w,h,i] of sizes)assert.deepEqual([w,h,i],[30,30,16],s);
 assert.equal(await p.evaluate(()=>$('appMenu').querySelector('summary').textContent.trim()),'','menu uses an SVG icon');
 await p.evaluate(()=>{showCalendar();if($('dailyPlanner').hidden)$('plannerToggle').click()});await p.waitForTimeout(200);
 for(const act of ['prev','next','pin']){const g=await p.locator(`#dailyPlanner header [data-act=${act}]`).evaluate(e=>{const r=e.getBoundingClientRect();return [Math.round(r.width),Math.round(r.height),!!e.querySelector('svg'),e.textContent.trim()]});assert.deepEqual(g,[30,30,true,''],act)}
 for(const id of ['weeksEarlier','weeksLater','plannerToggle'])assert.deepEqual(await p.locator('#'+id).evaluate(e=>{const r=e.getBoundingClientRect();return [Math.round(r.width),Math.round(r.height)]}),[30,30],id);
 const gaps=await p.evaluate(()=>{const g=(a,b)=>Math.round($(b).getBoundingClientRect().left-$(a).getBoundingClientRect().right);return [g('outlineSearchButton','filtersToggle'),g('filtersToggle','outlineGroupButton'),g('weeksEarlier','weeksLater')]});
 assert.deepEqual(gaps,[4,4,4],'4 px between buttons in a group');

 // Separators: softer than the workspace grid.
 const alpha=await p.evaluate(()=>{const a=c=>{const m=c.match(/[\d.]+\)$/);return m?parseFloat(m[0]):1};return [a(getComputedStyle($('dailyPlanner')).borderLeftColor),a(getComputedStyle(document.querySelector('.splitter'),'::after').backgroundColor)]});
 for(const v of alpha)assert(v<0.4&&v>0.2,'separator alpha '+v);

 // Scroll past end: on by default, ~40% of the editor height, content unchanged, device-local.
 await p.evaluate(()=>{edit(ids.long)});await p.waitForTimeout(200);
 const spe=await p.evaluate(async()=>{const d=document.querySelector('#editor .documentScroll');d.scrollTop=1e6;await new Promise(r=>setTimeout(r,50));const v=d.getBoundingClientRect(),l=$('richEditor').lastElementChild.getBoundingClientRect();return {extra:parseFloat(d.style.getPropertyValue('--scroll-past-end')),h:d.clientHeight,end:(l.bottom-v.top)/d.clientHeight}});
 assert(Math.abs(spe.extra-spe.h*.4)<2,JSON.stringify(spe));assert(spe.end<0.7,'last line can sit well above the bottom '+JSON.stringify(spe));
 const before=await p.evaluate(()=>itemById(db,ids.long).content);
 await p.evaluate(()=>(openSettings(),document.querySelectorAll('.settingsPanel').forEach(x=>x.hidden=false)));assert.equal(await p.locator('#settingsScrollPastEnd').isChecked(),true);
 await p.locator('#settingsScrollPastEnd').uncheck();
 assert.equal(await p.evaluate(()=>localStorage.getItem('ytnh-scroll-past-end')),'off');
 assert.equal(await p.evaluate(()=>JSON.stringify(db).includes('scroll-past-end')||JSON.stringify(db.settings).includes('scrollPast')),false,'not stored in the library');
 assert.equal(await p.evaluate(()=>document.querySelector('#editor .documentScroll').style.getPropertyValue('--scroll-past-end')),'0px');
 await p.locator('#settingsScrollPastEnd').check();await p.keyboard.press('Escape');
 assert.equal(await p.evaluate(()=>itemById(db,ids.long).content),before,'no content added');
 // Source mode keeps its own scroller sized to the pane and gets the same extra space inside it.
 const src=await p.evaluate(async()=>{$('sourceToggle').click();await new Promise(r=>setTimeout(r,100));const c=$('content'),d=document.querySelector('#editor .documentScroll');const out=[c.clientHeight===d.clientHeight,parseFloat(getComputedStyle(c).paddingBottom)>d.clientHeight*.35];$('sourceToggle').click();return out});
 assert.deepEqual(src,[true,true]);
 assert.deepEqual(errors,[]);
 await browser.close();console.log('PASS heading list selection/colours, toolbar scale and SVG icons, softer separators, scroll past end');
})().catch(e=>{console.error(e);process.exit(1)});
