// One meeting in an unrecognised time zone must not stop the rest of an Outlook import.
const assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const path=require('node:path');const {pathToFileURL}=require('node:url');
(async()=>{
 const browser=await (process.env.BROWSER_ENGINE==='webkit'?webkit:chromium).launch(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{});
 const p=await browser.newPage();await p.goto(pathToFileURL(path.resolve(__dirname,'../app.html')).href);
 const ics=['BEGIN:VCALENDAR','VERSION:2.0',
  'BEGIN:VEVENT','UID:ok','DTSTAMP:20260301T000000Z','SUMMARY:Fine meeting','DTSTART:20260312T090000Z','DTEND:20260312T100000Z','END:VEVENT',
  'BEGIN:VEVENT','UID:bad','DTSTAMP:20260301T000000Z','SUMMARY:Odd zone meeting','DTSTART;TZID=Customized Time Zone:20260319T090000','DTEND;TZID=Customized Time Zone:20260319T100000','END:VEVENT',
  'END:VCALENDAR'].join('\r\n');
 const result=await p.evaluate(text=>{const r=PlannerOutlook.read(text,'2026-03-01','2026-05-01','Europe/Amsterdam');return {titles:r.series.map(s=>s.title),warnings:r.warnings}},ics);
 assert.deepEqual(result.titles,['Fine meeting']);
 assert(result.warnings.some(w=>w.includes('Odd zone meeting')&&w.includes('Customized Time Zone')),JSON.stringify(result.warnings));
 await browser.close();console.log('PASS unknown time zones skip one meeting and report it');
})().catch(e=>{console.error(e);process.exit(1)});
