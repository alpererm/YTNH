// Item codes are no longer shown or recorded as new aliases; existing aliases still resolve.
const assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const path=require('node:path');const {pathToFileURL}=require('node:url');
(async()=>{
 const browser=await(process.env.BROWSER_ENGINE==='webkit'?webkit:chromium).launch(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{});
 try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(path.resolve(__dirname,'../app.html')).href);
  const r=await page.evaluate(()=>{
   autosaveEnabled=false;installDatabase(createEmptyDatabase());
   const parent=createItem(db,'Note');parent.title='Parent';
   const kids=[1,2,3,4].map(n=>{const k=createItem(db,'Todo',parent.id);k.title='Kid '+n;return k});
   const oldCode=itemCode(db,kids[2]);
   // An alias from an older library must keep resolving.
   kids[3].codeAliases=['009.009'];db.linkAliases={'009.009':kids[3].id};
   const before=JSON.stringify(db.linkAliases)+kids.map(k=>(k.codeAliases||[]).join()).join('|');
   kids[0].status='Done';archiveSubtree(db,kids[0].id,true);deleteSubtree(db,kids[1].id);
   const after=JSON.stringify(db.linkAliases)+kids.map(k=>(k.codeAliases||[]).join()).join('|');
   render();selected=kids[2].id;edit(kids[2].id);openItemDetails?.();
   const details=document.body.innerText;
   return {aliasesUnchanged:before===after,oldAliasResolves:resolveReference('009.009')?.id===kids[3].id,detailsShowCode:/\bCode\b/.test(details)&&details.includes(oldCode)};
  });
  assert.deepEqual(r,{aliasesUnchanged:true,oldAliasResolves:true,detailsShowCode:false});
  assert.deepEqual(errors,[]);
  console.log('PASS item codes hidden; aliases frozen and still resolving');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
