// Diagnostic only: mixed synthetic libraries, no timing pass/fail threshold.
const assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{const engine=process.env.BROWSER_ENGINE||'webkit',browser=await({chromium,webkit}[engine]).launch(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{});try{
 const p=await browser.newPage({viewport:{width:1450,height:950}});
 await p.goto(require('node:url').pathToFileURL(require('node:path').resolve(__dirname,'../app.html')).href);
 const results=[];
 for(const size of [250,1000,2000]){
  await p.evaluate(size=>{
   autosaveEnabled=false;installDatabase(createEmptyDatabase());
   let parent=null,root=null;
   for(let n=0;n<size;n++){
    if(n%20===0)parent=null;
    const i=createItem(db,n%4===0?'Note':'Todo',parent?.id||null);
    i.title='Operations '+n+' — supplier quotation and technical review';i.content='Body '.repeat(40);
    i.explicitTags=['project/'+n%12];if(n%3===0)i.scheduledDates=['2026-11-'+String(1+n%27).padStart(2,'0')];
    if(n%20===0){root=parent=i;if(i.type==='Todo')i.target={startMonth:'2026-11',endMonth:'2027-02'}}
    else if(n%5===0)parent=i;
    if(n%11===0&&i.type==='Todo')i.status='Done';
   }
   db.settings.pinnedItems=db.items.filter((_,n)=>n%200===0).map(i=>i.id);
   renderTree();
  },size);
  for(const mode of ['hierarchy','scheduled','status','filtered','linked']){
   const row=await p.evaluate(({size,mode})=>{
    $('search').value='';db.settings.groupBy=mode==='scheduled'?'scheduled':mode==='status'?'status':'';
    $('showDone').checked=mode!=='filtered';
    if(mode==='linked'){
     const g=new OutlineLocations(db),roots=g.siblings(null);
     for(let n=1;n<Math.min(roots.length,6);n++)g.clone(roots[n],roots[0]);
     g.commit(false);
    }
    renderTree();const before=JSON.stringify(db),order=visibleOutlineIds().join('|'),samples=[];
    for(let run=0;run<7;run++){const start=performance.now();renderTree();document.querySelector('#tree').getBoundingClientRect();samples.push(performance.now()-start)}
    samples.sort((a,b)=>a-b);
    return {size,mode,rows:document.querySelectorAll('#tree .row').length,medianMs:+samples[3].toFixed(2),p95Ms:+samples[6].toFixed(2),stable:before===JSON.stringify(db)&&order===visibleOutlineIds().join('|')};
   },{size,mode});
   assert(row.stable);results.push(row);
  }
 }
 console.log(JSON.stringify({engine,platform:process.platform,repetitions:7,includesLayout:true,results},null,2));
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
