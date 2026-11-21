const assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await(process.env.BROWSER_ENGINE==='webkit'?webkit:chromium).launch(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{});
 try{
 const p=await browser.newPage();await p.goto(require('node:url').pathToFileURL(require('node:path').resolve(__dirname,'../app.html')).href);
 await p.evaluate(()=>{autosaveEnabled=false;installDatabase(createEmptyDatabase());window.makeMeeting=(date,recurrence,custom=null)=>{
  const id=uuid(),m={id,title:'Series',content:'Keep my document',parent:null,versions:[{from:date,date,start:540,end:600,span:0,zone:'Europe/Amsterdam',enabled:true,allDay:false,recurrence,custom}],exceptions:{}};
  PlannerModel.state(db).meetings[id]=m;return m;
 };window.moveMeeting=(m,origin,date,mode='series')=>{
  const s=PlannerMeetings.schedule(m,origin),b=PlannerMeetings.blocks(m,m.id,s.date,DailyPlanner.zone).find(x=>x.origin===origin);
  const popup=DailyPlanner.popup;DailyPlanner.popup=(x,y,choices)=>choices[mode==='one'?0:1][1]();
  try{DailyMeetingEditor.change(b,{date},0,0)}finally{DailyPlanner.popup=popup}
 };});
 const result=await p.evaluate(()=>{
  const m=makeMeeting('2026-11-09',{frequency:'weekly',interval:1,startDate:'2026-11-09',weekDays:[1]});
  m.exceptions['2026-11-30']={date:'2026-12-02',start:660,end:720};
  const old=JSON.stringify(m);moveMeeting(m,'2026-11-16','2026-11-17');
  const dates=['2026-11-09','2026-11-16','2026-11-17','2026-11-23','2026-11-24','2026-12-02'].map(d=>PlannerMeetings.blocks(m,m.id,d,DailyPlanner.zone).map(b=>b.origin));
  const saved=JSON.stringify(db);undo();const restored=JSON.stringify(db.planner.meetings[m.id])===old;redo();
  const reopened=migrateDatabase(JSON.parse(saved));validateDatabase(reopened);
  return {dates,restored,same:JSON.stringify(reopened.planner.meetings[m.id])===JSON.stringify(db.planner.meetings[m.id]),nearest:PlannerMeetings.nearest(m,'2026-11-16')};
 });
 assert.deepEqual(result,{dates:[['2026-11-09'],[],['2026-11-16'],[],['2026-11-23'],['2026-11-30']],restored:true,same:true,nearest:'2026-11-17'});
 for(const [date,recurrence,custom,origin,to,next,nextTo] of [
 ['2026-11-09',{frequency:'weekly',interval:2,startDate:'2026-11-09',weekDays:[1]},null,'2026-11-23','2026-11-21','2026-12-07','2026-12-05'],
 ['2026-01-31',{frequency:'monthly',interval:1,startDate:'2026-01-31',dayOfMonth:31,monthlyMode:'date'},null,'2026-02-28','2026-03-02','2026-03-31','2026-04-02'],
 ['2026-11-09',null,'FREQ=WEEKLY;BYDAY=MO;COUNT=5','2026-11-16','2026-11-17','2026-11-23','2026-11-24'],
 ['2026-03-22',{frequency:'weekly',interval:1,startDate:'2026-03-22',weekDays:[0]},null,'2026-03-29','2026-03-30','2026-04-05','2026-04-06']
 ]){
  const rows=await p.evaluate(({date,recurrence,custom,origin,to,next,nextTo})=>{
   const m=makeMeeting(date,recurrence,custom);moveMeeting(m,origin,to);
   return [PlannerMeetings.blocks(m,m.id,to,DailyPlanner.zone).map(b=>b.origin),PlannerMeetings.blocks(m,m.id,nextTo,DailyPlanner.zone).map(b=>b.origin)];
  },{date,recurrence,custom,origin,to,next,nextTo});assert.deepEqual(rows,[[origin],[next]]);
 }
 assert(await p.evaluate(()=>{const m=makeMeeting('2026-11-09',{frequency:'weekly',interval:1,startDate:'2026-11-09',weekDays:[1]});moveMeeting(m,'2026-11-16','2026-11-17','one');return PlannerMeetings.schedule(m,'2026-11-23').date==='2026-11-23'}));
 console.log('PASS future/single meeting moves, stable origins, exceptions, weekly/monthly/custom, DST, undo and model reopening');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
