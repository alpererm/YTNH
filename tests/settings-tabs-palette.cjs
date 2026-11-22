// Settings in four tabs (remembered, arrow keys), the shared status palette (one colour per status everywhere,
// Waiting for distinct, readable Calendar chips in Graphite Dark, red only for overdue) and accent list markers.
const assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const path=require('node:path');const {pathToFileURL}=require('node:url');
(async()=>{
 const browser=await (process.env.BROWSER_ENGINE==='webkit'?webkit:chromium).launch(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{});
 const p=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(pathToFileURL(path.resolve(__dirname,'../app.html')).href);
 await p.evaluate(()=>{try{localStorage.removeItem('ytnh-settings-tab')}catch{}autosaveEnabled=false;installDatabase(createEmptyDatabase());render();openSettings()});
 const panel=()=>p.evaluate(()=>document.querySelector('.settingsPanel:not([hidden])')?.id);
 assert.deepEqual(await p.locator('[data-settings-tab]').allTextContents(),['General','Appearance','Editor','Calendar']);
 assert.equal(await panel(),'settingsPanel-general');
 const where=await p.evaluate(()=>Object.fromEntries(['settingsDefaultView','settingsCompletionSound','settingsTheme','settingsFont','settingsInterfaceSize','settingsEditorSize','settingsLimitWidth','settingsScrollPastEnd','settingsSpellcheck','plannerStart','settingsShowWeekends'].map(id=>[id,$(id)?.closest('.settingsPanel')?.id.replace('settingsPanel-','')])));
 assert.deepEqual(where,{settingsDefaultView:'general',settingsCompletionSound:'general',settingsTheme:'appearance',settingsFont:'appearance',settingsInterfaceSize:'appearance',settingsEditorSize:'editor',settingsLimitWidth:'editor',settingsScrollPastEnd:'editor',settingsSpellcheck:'editor',plannerStart:'calendar',settingsShowWeekends:'calendar'});
 await p.locator('#settingsTab-general').focus();await p.keyboard.press('ArrowRight');
 assert.equal(await panel(),'settingsPanel-appearance','arrow keys move between tabs');
 await p.locator('#settingsTab-calendar').click();await p.locator('#settingsShowWeekends').check();
 assert.equal(await p.evaluate(()=>db.settings.hideWeekends),false,'Show weekends in Settings changes the library setting');
 await p.keyboard.press('Escape');await p.evaluate(()=>openSettings());
 assert.equal(await panel(),'settingsPanel-calendar','the last tab is remembered');
 await p.keyboard.press('Escape');

 // Palette
 const colours=await p.evaluate(async()=>{
   installDatabase(createEmptyDatabase());db.settings.hideWeekends=false;$('showDone').checked=true;const d=today(),past=iso(new Date(Date.now()-3*86400000));
   const mk=(type,title,extra={})=>{const i=createItem(db,type);i.title=title;Object.assign(i,extra);return i};
   const st={};for(const s of ['Todo','Done','Waiting for','On hold','Cancelled'])st[s]=mk('Todo',s,{status:s,scheduledDates:[d]}).id;
   const note=mk('Note','Note',{scheduledDates:[d]}),late=mk('Todo','Late',{scheduledDates:[past]}),lateDone=mk('Todo','Late done',{status:'Done',scheduledDates:[past]});
   PlannerModel.session(db,itemById(db,st['Waiting for']),d,600,30);
   const out={};
   for(const theme of ['light','dark']){appearance.theme=theme;applyTheme();render();showCalendar();if($('dailyPlanner').hidden)$('plannerToggle').click();await new Promise(r=>setTimeout(r,100));
     const m=id=>getComputedStyle(document.querySelector(`#tree .row[data-id="${id}"] .itemMarker`)).color;
     const chip=id=>getComputedStyle(document.querySelector(`#calendarBody [data-cal-drag-item="${id}"] .cal-code`)||document.querySelector(`#calendarBody [data-cal-drag-item="${id}"]`)).color;
     const cs=getComputedStyle(document.body);
     out[theme]={markers:Object.fromEntries(Object.entries(st).map(([k,id])=>[k,m(id)])),note:m(note.id),title:getComputedStyle(document.querySelector(`#tree .row[data-id="${st['Waiting for']}"] .title`)).color,ink:getComputedStyle(document.querySelector(`#tree .row[data-id="${st.Todo}"] .title`)).color,chip:chip(st.Todo),
       overdue:!!document.querySelector(`#tree .row[data-id="${late.id}"] [data-outline-navigation="calendar"].overdue`),overdueDone:!!document.querySelector(`#tree .row[data-id="${lateDone.id}"] .overdue`),
       plan:document.querySelector('.planBlock.Todo')?.dataset.status,inlineWait:cs.getPropertyValue('--inline-wait').trim(),wait:cs.getPropertyValue('--st-wait').trim()}}
   return out;
 });
 for(const theme of ['light','dark']){const c=colours[theme];
   assert.equal(new Set(Object.values(c.markers)).size,5,theme+': five statuses, five marker colours '+JSON.stringify(c.markers));
   assert.equal(c.note,c.markers.Todo,theme+': Notes share the open colour');
   assert.equal(c.title,c.ink,theme+': titles keep the text colour; the marker carries the status');
   assert.equal(c.chip,c.ink,theme+': Calendar chip text is readable text colour');
   assert.equal(c.overdue,true);assert.equal(c.overdueDone,false,'finished items are never overdue');
   assert.equal(c.plan,'Waiting for');assert.equal(c.inlineWait,c.wait,theme+': inline Todos use the same palette');
 }
 // Accent list markers
 const list=await p.evaluate(async()=>{const i=createItem(db,'Note');i.title='L';i.content='- a\n    - b\n1. one';render();edit(i.id);await new Promise(r=>setTimeout(r,100));
   const ul=[...document.querySelectorAll('#richEditor [data-mdblock="ul"]')];return {accent:getComputedStyle(document.body).getPropertyValue('--accent').trim(),bullet:getComputedStyle(ul[0],'::before').color,nested:getComputedStyle(ul[1],'::before').content,num:getComputedStyle(document.querySelector('#richEditor .md-list-marker')).color}});
 const hex=list.accent.replace('#','');const rgb=`rgb(${parseInt(hex.slice(0,2),16)}, ${parseInt(hex.slice(2,4),16)}, ${parseInt(hex.slice(4,6),16)})`;
 assert.equal(list.bullet,rgb);assert.equal(list.num,rgb);assert.equal(list.nested,'"◦"');
 assert.deepEqual(errors,[]);await browser.close();console.log('PASS Settings tabs, shared status palette, overdue, accent list markers');
})().catch(e=>{console.error(e);process.exit(1)});
