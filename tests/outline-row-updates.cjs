// Single-row Outline updates must produce exactly what a full redraw produces.
const assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const path=require('node:path');const {pathToFileURL}=require('node:url');
(async()=>{
 const browser=await(process.env.BROWSER_ENGINE==='webkit'?webkit:chromium).launch(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{});
 try{
  const page=await browser.newPage({viewport:{width:1400,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(path.resolve(__dirname,'../app.html')).href);
  const result=await page.evaluate(async()=>{
   autosaveEnabled=false;installDatabase(createEmptyDatabase());db.settings.hideWeekends=false;
   let seed=7;const rnd=n=>{seed=(seed*1103515245+12345)%2147483648;return seed%n};
   const parents=[];
   for(let i=0;i<160;i++){const p=i<12?null:parents[rnd(parents.length)];const it=createItem(db,i%4?'Todo':'Note',p);it.title='item '+i;if(i%7===0)it.explicitTags=['proj/'+(i%3)];if(i%5===0)it.scheduledDates=[today()];if(i%11===0)it.status='Done';if(i<60)parents.push(it.id)}
   render();showCalendar();
   let patched=0,full=0;const pr=patchRender,prr=patchRemoveOutlineRow;
   patchRender=ids=>{const ok=pr(ids);ok?patched++:full++;return ok};patchRemoveOutlineRow=id=>{const ok=prr(id);ok?patched++:full++;return ok};
   const snap=()=>[...$('tree').querySelectorAll('.row')].map(r=>{const a=[...r.attributes].filter(x=>!['style','class'].includes(x.name)).map(x=>x.name+'='+x.value).sort().join('|');return r.dataset.id+'|'+[...r.classList].filter(c=>!['justCompleted','completingOut'].includes(c)).sort().join('.')+'|'+a+'|'+r.innerHTML.replace(/ (justCompleted|completingOut)\b/g,'')});
   const mismatches=[];
   const settle=()=>new Promise(r=>setTimeout(r,0));const check=async label=>{await settle();const a=snap();renderTree();await settle();const b=snap();if(JSON.stringify(a)!==JSON.stringify(b)){const k=a.findIndex((x,i)=>x!==b[i]);let c=0;while(c<a[k].length&&a[k][c]===b[k][c])c++;mismatches.push({label,rowsPatched:a.length,rowsFull:b.length,patched:a[k].slice(Math.max(0,c-80),c+160),full:b[k].slice(Math.max(0,c-80),c+160)})}};
   const visibleTodo=()=>{const rows=[...$('tree').querySelectorAll('.row[data-item-type="Todo"]')];return rows.length?itemById(db,rows[rnd(rows.length)].dataset.id):null};
   for(let step=0;step<60;step++){
     const kind=rnd(5),before=patched;
     if(kind===0||kind===1){const t=visibleTodo();if(!t)continue;document.querySelector(`#tree .row[data-id="${t.id}"] .itemMarker`).click();
       if(patched>before)await check('mark '+t.title);
       if(completionGrace.has(t.id)){const g=completionGrace.get(t.id);clearTimeout(g.timer);const b2=patched;finishCompletionGrace(t.id);await new Promise(r=>setTimeout(r,260));if(patched>b2)await check('grace end '+t.title)}}
     else if(kind===2){const t=visibleTodo();if(!t)continue;startInlineEdit(t.id);const input=$('tree').querySelector('.inlineEdit');input.value='renamed '+step;input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));if(patched>before)await check('rename '+t.title)}
     else if(kind===3){const rows=[...$('tree').querySelectorAll('.row')];const id=rows[rnd(rows.length)].dataset.id;edit(id);await check('open '+id);showCalendar()}
     else {$('showDone').checked=!$('showDone').checked;$('showDone').dispatchEvent(new Event('change',{bubbles:true}));render()}
   }
   // Filters must force the full redraw path.
   const fullBefore=full;$('search').value='item';$('search').dispatchEvent(new Event('input',{bubbles:true}));render();
   const t=visibleTodo();if(t)document.querySelector(`#tree .row[data-id="${t.id}"] .itemMarker`)?.click();
   const filteredFallback=full>fullBefore||!t;
   return {patched,full,mismatches,filteredFallback};
  });
  assert.deepEqual(result.mismatches,[],JSON.stringify(result.mismatches[0]));
  assert.ok(result.patched>=10,'fast path exercised: '+result.patched);
  assert.ok(result.filteredFallback,'search forces a full redraw');
  assert.deepEqual(errors,[]);
  console.log(`PASS ${result.patched} single-row updates identical to full redraws (${result.full} fell back)`);
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
