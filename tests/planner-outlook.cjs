const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const event=(lines)=>['BEGIN:VEVENT',...lines,'END:VEVENT'].join('\r\n');
const cal=(...events)=>['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Example//Planner//EN',...events,'END:VCALENDAR'].join('\r\n');
function fixture(count,title){
 const series=event(['UID:weekly@example.invalid','DTSTART;TZID=Romance Standard Time:20260323T090500','DTEND;TZID=Romance Standard Time:20260323T094000','SUMMARY:'+title,'DESCRIPTION:First description','RRULE:FREQ=WEEKLY;COUNT='+count,'EXDATE;TZID=Romance Standard Time:20260406T090500']);
 const changed=event(['UID:weekly@example.invalid','RECURRENCE-ID;TZID=Romance Standard Time:20260330T090500','DTSTART;TZID=Romance Standard Time:20260331T100000','DTEND;TZID=Romance Standard Time:20260331T103000','SUMMARY:New time']);
 const holiday=event(['UID:all@example.invalid','DTSTART;VALUE=DATE:20260326','DTEND;VALUE=DATE:20260328','SUMMARY:Offsite','X-ALT-DESC;FMTTYPE=text/html:<p><strong>Agenda</strong></p>']);
 return cal(series,changed,holiday);
}
(async()=>{
 const browser=await(process.env.BROWSER_ENGINE==='webkit'?webkit:chromium).launch(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{});
 try{
 const p=await browser.newPage();await p.goto(require('node:url').pathToFileURL(path.resolve(__dirname,'../app.html')).href);
 const read=async(text)=>p.evaluate(text=>PlannerOutlook.read(text,'2026-03-01','2026-05-01','Europe/Amsterdam'),text);
 const a=await read(fixture(2,'Short')),b=await read(fixture(5,'Long'));
 assert.equal(a.series.length,2);assert.equal(a.series[0].dates['2026-03-30'].date,'2026-03-31');assert.equal(a.series[0].dates['2026-03-23'].start,545);
 assert(!b.series[0].dates['2026-04-06']);assert.equal(a.series[1].dates['2026-03-26'].span,2);assert.match(a.series[1].content,/Agenda/);
 await p.evaluate(({a,b})=>{
  installDatabase(createEmptyDatabase());const source=uuid(),parent=createItem(db,'Note');
  PlannerOutlook.commit(db,source,{name:'fixture'},PlannerOutlook.preview(db,source,a,'2026-03-01'));
  const m=Object.values(db.planner.meetings).find(m=>m.uid.startsWith('weekly'));m.content='Edited';m.parent=parent.id;
  const prior=JSON.stringify(db),rows=PlannerOutlook.preview(db,source,b,'2026-03-29');
  if(prior!==JSON.stringify(db))throw Error('Preview mutated library');
  PlannerOutlook.commit(db,source,{name:'fixture'},rows);
  const result=db.planner.meetings[m.id];if(result.content!=='Edited'||result.parent!==parent.id||result.title!=='Long'||Object.keys(db.planner.meetings).length!==2)throw Error('Identity or document changed');
  if(Object.keys(result.coverage).length!==4)throw Error('Bounded coverage');
  const [single]=PlannerOutlook.preview(db,source,{series:[a.series[1]]},'2026-04-01');PlannerOutlook.commit(db,source,{},[single]);
  if(!db.planner.meetings[m.id])throw Error('Missing from export deleted meeting');
  const beforeFailure=JSON.stringify(db);
  let rejected=false;try{PlannerOutlook.commit(db,source,{},[{kind:'Updated',next:{...m,parent:'missing'}}])}catch{rejected=true}
  if(!rejected||JSON.stringify(db)!==beforeFailure)throw Error('Invalid import did not roll back');
 },{a,b});
 await p.evaluate(parsed=>{
   const library=createEmptyDatabase(),key=uuid();
   for(let i=0;i<10;i++){
     const hash=i<5?'same-file':'longer-export';
     const matches=PlannerOutlook.sourceCandidates(library,parsed,hash);
     if(i&&matches[0]?.[0]!==key)throw Error('Repeated import selected a different source');
     const rows=PlannerOutlook.preview(library,key,parsed,'2026-01-01');
     if(i&&rows.some(r=>r.kind!=='Unchanged'))throw Error('Repeated import created or changed a meeting');
     if(!i)PlannerOutlook.commit(library,key,{name:'original.ics',fingerprint:hash},rows);
   }
   const other=uuid();PlannerOutlook.commit(library,other,{name:'renamed.ics',fingerprint:'same-file'},PlannerOutlook.preview(library,other,parsed,'2026-01-01'));
   Object.values(library.planner.meetings).find(m=>m.source===other).content+=' unique notes';
   const repair=PlannerOutlook.repairDuplicates(library.planner);
   if(repair.removed.length!==1||repair.conflicts.length!==1)throw Error('Repair failed to protect conflicting documents');
 },a);
 const exclusions=cal(event(['UID:excluded@example.invalid','DTSTART:20260323T090000Z','DTEND:20260323T093000Z','SUMMARY:Test','RRULE:FREQ=WEEKLY;COUNT=2','RDATE:20260401T090000Z']),
    event(['UID:excluded@example.invalid','RECURRENCE-ID:20260330T090000Z','STATUS:CANCELLED']));
 const limited=await read(exclusions);
 assert.deepEqual(Object.keys(limited.series[0].dates).sort(),['2026-03-23','2026-04-01']);
 const cancelledLater=await read(exclusions.replace('STATUS:CANCELLED','DTSTART:20260330T090000Z\r\nDTEND:20260330T093000Z'));
 await p.evaluate(({before,after})=>{
   const library=createEmptyDatabase(),source=uuid();
   PlannerOutlook.commit(library,source,{},PlannerOutlook.preview(library,source,before,'2026-03-01'));
   PlannerOutlook.commit(library,source,{},PlannerOutlook.preview(library,source,after,'2026-03-01'));
   if(!Object.values(library.planner.meetings)[0].coverage['2026-03-30'])throw Error('Later cancellation erased an established occurrence');
 },{before:cancelledLater,after:limited});
 const bounded=await read(exclusions.replace(';COUNT=2',''));
 assert(bounded.warnings.length>0);
 assert(!bounded.series[0].dates['2026-04-20']);
 await p.evaluate(()=>installDatabase(createEmptyDatabase()));
 async function normalImport(text,name){
   await p.locator('#appMenu > summary').click();
   const chosen=p.waitForEvent('filechooser');await p.getByRole('button',{name:'Import Outlook Calendar…',exact:true}).click();
   await (await chosen).setFiles({name,mimeType:'text/calendar',buffer:Buffer.from(text)});
   const dialog=p.locator('dialog.outlookPreview');await dialog.waitFor();
   const counts=await dialog.locator(':scope > span').allTextContents();
   await dialog.getByRole('button',{name:'Import selected'}).click();
   return counts.map(t=>Number(t.trim().split(' ').at(-1)));
 }
 for(let i=0;i<10;i++)assert.deepEqual(await normalImport(fixture(2,'Original'),i%2?'renamed.ics':'calendar.ics'),i?[0,0,2]:[2,0,0]);
 assert.deepEqual(await normalImport(fixture(5,'New title'),'longer.ics'),[0,1,1]);
 assert.equal(await p.evaluate(()=>Object.keys(db.planner.meetings).length),2);
 // Private exports are optional inputs and are never copied or logged.
 if(process.env.PLANNER_REAL_ICS){
 const names=['Example Calendar.ics','Example Calendar(1).ics'];
 const raw=names.map(n=>fs.readFileSync(path.join(process.env.PLANNER_REAL_ICS,n),'utf8'));
 const result=await p.evaluate(inputs=>{
  const db=createEmptyDatabase(),counts=[];
  for(const input of inputs){
   const parsed=PlannerOutlook.read(input,undefined,undefined,'Europe/Amsterdam');
   const source=PlannerOutlook.sourceCandidates(db,parsed,'')[0]?.[0]||uuid();
   const rows=PlannerOutlook.preview(db,source,parsed,'2026-11-08');PlannerOutlook.commit(db,source,{calendarId:parsed.calendarId},rows);
   counts.push([parsed.series.length,rows.filter(r=>r.old).length,Object.keys(db.planner.meetings).length,parsed.warnings.length]);
  }
  return counts;
 },raw);
 assert(result[0][0]>0 && result[1][1]>0);console.log('Private Outlook exports [series, matched previous series, total, warnings]',result);
 }
 console.log('PASS bounded Outlook imports, exceptions, coverage, shared documents, stable source identity');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
