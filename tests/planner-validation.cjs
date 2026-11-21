const assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{const browser=await(process.env.BROWSER_ENGINE==='webkit'?webkit:chromium).launch(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{});try{
 const p=await browser.newPage();await p.goto(require('node:url').pathToFileURL(require('node:path').resolve(__dirname,'../app.html')).href);
 const result=await p.evaluate(()=>{
  autosaveEnabled=false;installDatabase(createEmptyDatabase());const item=createItem(db,'Todo'),id=uuid(),source=uuid(),rule=uuid();
  const v={from:'2026-11-09',date:'2026-11-09',start:540,end:600,span:0,allDay:false,zone:'Europe/Amsterdam',enabled:true};
  const plan=PlannerModel.state(db);plan.sources[source]={name:'Fixture'};
  plan.meetings[id]={id,title:'Meeting',content:'Keep',source,uid:'meeting',versions:[v],exceptions:{},coverage:{'2026-11-09':{...v}}};
  plan.rules[rule]={item:item.id,versions:[{from:v.from,start:540,duration:30,offset:0,enabled:true,recurrence:{frequency:'weekly',interval:1,startDate:v.from}}],exceptions:{'2026-11-16':{done:true}}};
  PlannerModel.validate(db);const before=JSON.stringify(db);
  const mutations=[
   m=>delete m.planner.meetings[id].versions[0].start,
   m=>m.planner.meetings[id].versions[0].start=Infinity,
   m=>m.planner.meetings[id].versions[0].zone='Missing/Zone',
   m=>m.planner.meetings[id].versions[0].span=-1,
   m=>m.planner.meetings[id].versions[0].end=500,
   m=>m.planner.meetings[id].versions[0].date='2026-02-30',
   m=>m.planner.meetings[id].versions.push({...v}),
   m=>m.planner.meetings[id].exceptions['2026-11-16']={start:NaN},
   m=>m.planner.meetings[id].exceptions['2026-11-16']={date:'wrong'},
   m=>m.planner.meetings[id].coverage['2026-11-09'].end=null,
   m=>m.planner.meetings[id].versions[0].localOverride={offset:0.5},
   m=>m.planner.rules[rule].versions[0].duration=undefined,
   m=>m.planner.rules[rule].versions[0].recurrence.interval=0,
   m=>m.planner.rules[rule].exceptions['2026-11-16']={duration:2000},
   m=>m.planner.meetings[id].versions[0].custom='FREQ=SECONDLY',
   m=>m.planner.meetings[id].versions[0].enabled='yes'
  ];let rejected=0;
  for(const mutate of mutations){const m=structuredClone(db);mutate(m);try{PlannerModel.validate(m)}catch(e){if(!e.message.includes('Invalid Daily Planner'))throw e;rejected++}}
  const round=migrateDatabase(JSON.parse(before));validateDatabase(round);
  return {rejected,total:mutations.length,untouched:JSON.stringify(db)===before,roundtrip:JSON.stringify(round.planner)===JSON.stringify(db.planner)};
 });
 assert.equal(result.rejected,result.total);assert(result.untouched&&result.roundtrip);
 console.log('PASS '+result.total+' invalid Planner payloads rejected; valid legacy/default records and current model preserved');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
