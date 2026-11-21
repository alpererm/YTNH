const assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await (process.env.BROWSER_ENGINE==='webkit'?webkit:chromium).launch(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{});
 const p=await browser.newPage();await p.goto(require('node:url').pathToFileURL(require('node:path').resolve(__dirname,'../app.html')).href);
 for(const [day,dest,frequency,interval,later] of [
 ['2026-12-31','2027-01-01','daily',1,'2027-01-02'],['2026-03-28','2026-03-29','daily',2,'2026-03-30'],
 ['2026-11-02','2026-11-03','weekly',1,'2026-11-09'],['2026-01-31','2026-02-01','monthly',1,'2026-02-28']]){
 const result=await p.evaluate(({day,dest,frequency,interval,later})=>{
   installDatabase(createEmptyDatabase());const i=createItem(db,'Todo');i.recurrence={startDate:day,frequency,interval};i.occurrenceStates[day]='Waiting for';
   const n=createItem(db,'Todo');n.scheduledDates=[day,dest,later];const done=createItem(db,'Todo');done.scheduledDates=[day];done.status='On hold';
   const before=snapshot(),items=unfinishedForDay(day);postponeUnfinished(day,items);validateDatabase(db);
   const after=snapshot(),dates=occurrenceDates(i,day,later),next=nextActiveOccurrence(i,day),explicit=n.scheduledDates,repeated=unfinishedForDay(day).length;
   setOccurrenceStatus(i,dest,'Done');const states={...i.occurrenceStates};
   undo();return {dates,next,explicit,count:items.length,repeated,states,restored:snapshot()===before,saved:JSON.parse(after).items[0].occurrencePostponements};
 },{day,dest,frequency,interval,later});
 assert.deepEqual(result.dates,[dest,later]);assert.deepEqual(result.explicit,[dest,later]);assert.equal(result.next,dest);assert.equal(result.count,2);assert.equal(result.repeated,0);assert.equal(result.saved[day],dest);assert.equal(result.states[day],'Done');assert.equal(result.states[dest],interval===1&&frequency==='daily'?'Done':undefined);assert(result.restored);
 }
 await browser.close();console.log('PASS daily overlap, weekly, interval, monthly, local dates, history and undo');
})().catch(e=>{console.error(e);process.exit(1)});
