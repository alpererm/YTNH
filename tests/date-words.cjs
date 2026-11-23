// Dates typed in words: English and Turkish, with or without Turkish letters.
const assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const path=require('node:path');const {pathToFileURL}=require('node:url');
(async()=>{
 const browser=await(process.env.BROWSER_ENGINE==='webkit'?webkit:chromium).launch(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{});
 try{
  const page=await browser.newPage();await page.goto(pathToFileURL(path.resolve(__dirname,'../app.html')).href);
  const expected={today:'2026-11-22',tomorrow:'2026-11-23',fri:'2026-11-27','next week':'2026-11-23','in 1 month':'2026-12-22','3/12':'2026-12-03','3.12.2026':'2026-12-03',
   'bugün':'2026-11-22',bugun:'2026-11-22','yarın':'2026-11-23',yarin:'2026-11-23','öbür gün':'2026-11-24',carsamba:'2026-11-25','çarşamba':'2026-11-25','haftaya cuma':'2026-11-27',
   '3 gün sonra':'2026-11-25','2 hafta sonra':'2026-12-06','3 aralik':'2026-12-03','3 aralık':'2026-12-03','15 Ocak 2027':'2027-01-15','ay sonu':'2026-11-30','PAZARTESİ':'2026-11-23',gibberish:null,'31/02/2027':null};
  const actual=await page.evaluate(cases=>Object.fromEntries(cases.map(c=>[c,parseTitleDate(c,new Date(2026,10,22,12))])),Object.keys(expected));
  assert.deepEqual(actual,expected);
  console.log('PASS date words in English and Turkish');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
