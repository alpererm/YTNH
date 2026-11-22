// Search ranking, shared by Outline search, Quick Open and every item picker: titles before text, whole
// words before prefixes, active before finished, typo tolerance (swaps, half-typed words), finished items
// findable but dimmed in pickers, recent items first in an empty picker.
const assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const path=require('node:path');const {pathToFileURL}=require('node:url');
(async()=>{
 const browser=await (process.env.BROWSER_ENGINE==='webkit'?webkit:chromium).launch(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{});
 const p=await browser.newPage({viewport:{width:1300,height:850}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(pathToFileURL(path.resolve(__dirname,'../app.html')).href);
 const res=await p.evaluate(()=>{
   autosaveEnabled=false;const m=createEmptyDatabase();YTNHTour.build(m,{date:today(),minutes:600});installDatabase(m);
   const mk=(type,title,content='',parent=null,extra={})=>{const i=createItem(db,type,parent?.id??null);i.title=title;i.content=content;Object.assign(i,extra);return i};
   const garden=mk('Note','Garden','Everything outdoors.');
   mk('Note','Meeting notes','We talked about the plants and the garden budget.');
   mk('Todo','Repot plants','',garden,{status:'Done'});
   mk('Todo','Buy plants','',garden);
   mk('Note','Plants','Exact title, nested',garden);
   mk('Note','Plantation history','Colonial era.');
   mk('Note','Explanation of the plan','How the plan works.');
   mk('Todo','Cancelled plant order','',null,{status:'Cancelled'});
   mk('Note','Supplier programme','Contracts and quotations.');
   mk('Note','Quarterly report','Mentions the supplier programme.');
   const recent=mk('Note','Edited a moment ago');recent.updatedAt=new Date(Date.now()+60000).toISOString();
   render();
   const outline=q=>{$('search').value=q;renderTree();return [...document.querySelectorAll('#tree .row .title')].map(e=>e.textContent.trim())};
   const picker=(q,opts={})=>{chooseReference(false,()=>{},opts);$('refSearch').value=q;$('refSearch').dispatchEvent(new Event('input'));const r=[...$('refResults').querySelectorAll('button[data-ref-pick]')].map(b=>({t:b.querySelector('span:not(.itemMarker)').childNodes[0].textContent.trim(),dim:b.classList.contains('inactiveResult')}));closeModalShell();return r};
   const out={};
   for(const q of ['plants','plan','plant','plnts','palnts','supplier progrm','meeting','car'])out[q]={outline:outline(q),link:picker(q).map(x=>x.t),quick:picker(q,{title:'Quick Open'}).map(x=>x.t)};
   $('search').value='';renderTree();
   out.dim=picker('plants').filter(x=>x.dim).map(x=>x.t);
   out.empty=picker('').slice(0,1).map(x=>x.t);
   selected=db.items.find(i=>i.title==='Water the plants').id;
   chooseCloneParent();$('refSearch').value='garden';$('refSearch').dispatchEvent(new Event('input'));
   out.clone=[...$('refResults').querySelectorAll('button[data-ref-pick]')].map(b=>b.querySelector('span:not(.itemMarker)').childNodes[0].textContent.trim());closeModalShell();
   out.words=[['palnts','plants'],['progrm','programme'],['suppler','supplier'],['plans','plants'],['cra','cart'],['plan','planet'],['recieve','receive'],['acommodation','accommodation']].map(([a,b])=>fuzzyWordMatch(a,b));
   return out;
 });
 const first=(q,k='quick')=>res[q][k][0];
 for(const k of ['outline','link','quick']){
   assert.equal(first('plants',k),'Plants',k+': exact title first');
   assert.deepEqual(res.plants[k].slice(1,4).sort(),['Buy plants','Press / and search for “plants”','Water the plants'],k+': whole-word title matches next (Outline search keeps Outline order among equals)');
   assert.equal(first('plan',k),'4 · Plan your time',k+': a whole word beats a prefix of a longer word');
   assert(res.plan[k].indexOf('Explanation of the plan')<res.plan[k].indexOf('Plants'),k);
   assert.equal(first('palnts',k),'Plants',k+': swapped letters still match');
   assert.equal(first('plnts',k),'Plants',k+': a missing letter still matches');
   assert.equal(first('supplier progrm',k),'Supplier programme',k+': half-typed word with a typo');
   assert.equal(first('meeting',k),'Meeting notes',k+': title before text');
   assert(res.plants[k].indexOf('Meeting notes')>res.plants[k].indexOf('Plantation history'),k+': text-only matches after title matches');
   assert.deepEqual(res.car[k],[],k+': short words have no typo tolerance');
 }
 // Finished items: findable in pickers, after active title matches, before text-only matches, dimmed.
 for(const k of ['link','quick']){const r=res.plants[k];assert(r.indexOf('Repot plants')>r.indexOf('Plantation history')&&r.indexOf('Repot plants')<r.indexOf('Meeting notes'),k+' '+r.join(' | '))}
 assert.equal(first('plant'),'Plants','an active prefix match beats a cancelled whole-word match');
 assert.deepEqual(res.dim.sort(),['Cancelled plant order','Repot plants']);
 assert.equal(res.outline?.length,undefined);
 assert.deepEqual(res.empty,['Edited a moment ago'],'an empty picker starts with recent items');
 assert.equal(res.clone[0],'Garden','Link under parent: title matches before path matches');
 assert.deepEqual(res.words,[true,true,true,true,false,true,true,true]);
 assert.deepEqual(errors,[]);
 await browser.close();console.log('PASS search ranking across Outline search, pickers and Quick Open; typo tolerance');
})().catch(e=>{console.error(e);process.exit(1)});
