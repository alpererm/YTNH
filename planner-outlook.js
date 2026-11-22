// Calendar data is parsed locally. The preview owns detached records until confirmation.
const PlannerOutlook=(()=>{
  const M=PlannerModel,W=PlannerMeetings,P=DailyPlanner;
  const windows={'Romance Standard Time':'Europe/Paris','W. Europe Standard Time':'Europe/Berlin','Turkey Standard Time':'Europe/Istanbul','GMT Standard Time':'Europe/London','Eastern Standard Time':'America/New_York','Pacific Standard Time':'America/Los_Angeles'};
  const localDay=t=>[t.year,String(t.month).padStart(2,'0'),String(t.day).padStart(2,'0')].join('-');
  const prop=(c,k)=>c.getFirstPropertyValue(k);
  function time(t,property,display){
    if(!t)throw Error('A calendar entry is missing its date.');
    const id=property?.getParameter('tzid')||t.zone?.tzid||'floating';
    const zone=id==='floating'?display:windows[id]||id;
    try{W.parts(0,zone);return {date:localDay(t),minute:t.hour*60+t.minute,zone}}
    catch{if(!t.zone?.component)throw Error('Unrecognized time zone: '+id);
      const instant=t.toJSDate();return {...W.parts(+instant,'UTC'),zone:'UTC'};}
  }
  function content(c){
    const text=prop(c,'description')||'',html=prop(c,'x-alt-desc');
    if(!html)return String(text);
    // Template content stays inert. Rebuild a small allowlist without copying attributes or loading images.
    const template=document.createElement('template');template.innerHTML=String(html);
    function clean(n){
      if(n.nodeType===3)return document.createTextNode(n.data);
      const name=n.localName;if(['script','style','iframe','object','img','svg','math','link','form'].includes(name))return document.createTextNode('');
      const el=['p','br','b','strong','u','em','i','s','li','ul','ol','a','div'].includes(name)?document.createElement(name):document.createElement('span');
      if(name==='a'&&/^(https?:\/\/|mailto:)/i.test(n.getAttribute('href')||''))el.setAttribute('href',n.getAttribute('href'));
      for(const child of n.childNodes)el.append(clean(child));return el;
    }
    const safe=document.createElement('div');for(const child of template.content.childNodes)safe.append(clean(child));
    return clipboardHTMLToMarkdown(safe.innerHTML)||String(text);
  }
  function span(c,start,end,display){
    const a=time(start,c.getFirstProperty('dtstart'),display),b=time(end,c.getFirstProperty('dtend')||c.getFirstProperty('dtstart'),display);
    let finish=b;
    if(!start.isDate&&a.zone!==b.zone)finish=W.parts(W.wall(b.date,b.minute,b.zone),a.zone);
    return {date:a.date,start:a.minute,end:finish.minute,span:M.daysBetween(a.date,finish.date),zone:a.zone,allDay:start.isDate,enabled:true};
  }
  function read(text,from,to,display=P.zone){
    if((from&&!validDate(from))||(to&&!validDate(to))||(from&&to&&from>to))throw Error('Choose a valid import range.');
    const cal=new ICAL.Component(ICAL.parse(text.replace(/^\uFEFF/,'')));
    if(cal.name!=='vcalendar')throw Error('Choose an iCalendar file.');
    const cancelled=c=>String(prop(c,'status')||'').toUpperCase()==='CANCELLED'||String(prop(cal,'method')||'').toUpperCase()==='CANCEL';
    const groups=new Map(),warnings=[],series=[];
    for(const c of cal.getAllSubcomponents('vevent')){
      const uid=String(prop(c,'uid')||'').trim();if(!uid){warnings.push('Skipped an event with no UID.');continue}
      if(!groups.has(uid))groups.set(uid,[]);groups.get(uid).push(c);
    }
    for(const [uid,events] of groups){
      // A meeting in a time zone we can't recognise is skipped and reported, not allowed to stop the import (review 6).
      try{
      const master=events.filter(c=>!prop(c,'recurrence-id')).sort((a,b)=>(prop(b,'sequence')||0)-(prop(a,'sequence')||0))[0];
      if(!master){
        const cancellations=events.filter(c=>cancelled(c)&&prop(c,'recurrence-id'))
          .map(c=>({...time(prop(c,'recurrence-id'),c.getFirstProperty('recurrence-id'),display),allDay:prop(c,'recurrence-id').isDate}));
        if(cancellations.length)series.push({uid,dates:{},excluded:[],cancellations});
        if(cancellations.length!==events.length)warnings.push('Skipped exceptions whose series definition is missing.');
        continue;
      }
      if(cancelled(master)){series.push({uid,cancelled:true,dates:{},excluded:[]});continue}
      const event=new ICAL.Event(master),start=event.startDate;
      if(!start)throw Error('A meeting has no DTSTART.');
      const rule=prop(master,'rrule');const bounded=!rule||rule.count||rule.until;
      if((rule&&['SECONDLY','MINUTELY','HOURLY'].includes(rule.freq))||rule?.parts?.BYHOUR?.length>1||rule?.parts?.BYMINUTE?.length>1){
        warnings.push('Skipped a series with multiple starts per day. Its recurrence cannot be represented reliably.');continue;
      }
      const dates={},times=new Map(),excluded=new Set(),pattern=rule?rule.toString():'Once';
      const exceptions=new Map();
      const masterZone=time(start,master.getFirstProperty('dtstart'),display).zone;
      function originDate(t,property){
        const source=time(t,property,display);
        return t.isDate||source.zone===masterZone?source.date:W.parts(W.wall(source.date,source.minute,source.zone),masterZone).date;
      }
      for(const c of events.filter(c=>prop(c,'recurrence-id')).sort((a,b)=>(prop(a,'sequence')||0)-(prop(b,'sequence')||0))){
        exceptions.set(originDate(prop(c,'recurrence-id'),c.getFirstProperty('recurrence-id')),c);
      }
      for(const [origin,c] of exceptions)if(cancelled(c))excluded.add(origin);
      const imported=new Set();
      function include(t,c,origin){
        const exception=exceptions.get(origin);
        if(exception&&cancelled(exception)){excluded.add(origin);return}
        const stamp=t.toString();
        if(times.has(origin)&&times.get(origin)!==stamp){times.set(origin,null);return}
        times.set(origin,stamp);
        let schedule;
        if(exception){const replacement=new ICAL.Event(exception);schedule=span(exception,replacement.startDate,replacement.endDate,display)}
        else {const end=t.clone();end.addDuration(event.duration);schedule=span(c,t,end,display)}
        if(schedule.date>to||M.shift(schedule.date,schedule.span)<from)return;
        if(schedule.allDay&&schedule.date<from&&M.shift(schedule.date,schedule.span)===from)return;
        dates[origin]=schedule;imported.add(origin);
      }
      for(const p of master.getAllProperties('exdate'))for(const t of p.getValues())excluded.add(originDate(t,p));
      if(!bounded){warnings.push('An unbounded Outlook rule has no verified export end. Only explicit dates were included.');}
      if(event.isRecurring()&&bounded){
        const iter=event.iterator();let t,steps=0;
        while((t=iter.next())){if(++steps>150000)throw Error('Recurrence expansion exceeded the safe import limit. Narrow the export.');
          const day=localDay(t);if(day>to)break;if(from&&day<M.shift(from,-Math.max(2,Math.ceil(event.duration.toSeconds()/86400))))continue;
          if(!excluded.has(day))include(t,master,day);
        }
      }else if(!excluded.has(localDay(start)))include(start,master,localDay(start));
      for(const p of master.getAllProperties('rdate'))for(const val of p.getValues()){const t=val.start||val;if(!excluded.has(localDay(t)))include(t,master,localDay(t))}
      for(const [origin,c] of exceptions)if(!imported.has(origin)&&!excluded.has(origin))include(prop(c,'recurrence-id'),master,origin);
      if([...times.values()].includes(null)){warnings.push('Skipped a series with distinct occurrences on the same date.');continue}
      if(Object.keys(dates).length||excluded.size)series.push({uid,title:String(prop(master,'summary')||'Untitled meeting'),content:content(master),dates,pattern,excluded:[...excluded]});
      }catch(error){
        if(!/^Unrecognized time zone/.test(error?.message||''))throw error;
        const named=events.find(c=>!prop(c,'recurrence-id'))||events[0];
        warnings.push('Skipped “'+String(prop(named,'summary')||'Untitled meeting')+'”: '+error.message+'.');
      }
    }
    return {series,warnings,calendarId:String(prop(cal,'uid')||prop(cal,'x-wr-relcalid')||'').trim(),calendarName:String(prop(cal,'x-wr-calname')||'')};
  }
  function preview(database,source,parsed,day){
    const sources=database.planner?.sources||{},existing=new Map(),own=sources[source];
    for(const m of Object.values(database.planner?.meetings||{})){
      if(!m.source)continue;
      if(m.source===source)existing.set(m.uid.trim(),m);
      else if(!existing.has(m.uid.trim())&&sameSource(own,sources[m.source]))existing.set(m.uid.trim(),m);
    }
    return parsed.series.map(s=>{
      const old=existing.get(s.uid),coverage={...old?.coverage},changes=[];
      if(!old&&!Object.keys(s.dates).length)return null;
      const cancelled=new Set(s.cancelled?Object.keys(coverage):s.excluded||[]);
      for(const c of s.cancellations||[]){
        const zone=old?.versions[0]?.zone;
        cancelled.add(!c.allDay&&zone?W.parts(W.wall(c.date,c.minute,c.zone),zone).date:c.date);
      }
      for(const origin of cancelled){
        const prior=coverage[origin];if(!prior||prior.date<day||prior.enabled===false)continue;
        const next={...prior,enabled:false};coverage[origin]=next;changes.push({origin,previous:prior,next});
      }
      for(const [origin,value] of Object.entries(s.dates)){
        if(cancelled.has(origin))continue;
        const prior=coverage[origin];
        if(prior&&prior.date<day)continue;
        if(!prior||Object.keys(value).some(k=>prior[k]!==value[k])){coverage[origin]=value;changes.push({origin,previous:prior,next:value})}
      }
      const earliest=Object.keys(coverage).sort()[0];
      const next=old?{...old,title:s.title??old.title,coverage,pattern:s.pattern??old.pattern}:{id:uuid(),source,uid:s.uid,title:s.title,content:s.content,parent:null,versions:[{...coverage[earliest],from:earliest}],exceptions:{},coverage,pattern:s.pattern,createdAt:now(),updatedAt:now()};
      if(next.versions[0].from>earliest)next.versions=[{...next.versions[0],from:earliest},...next.versions.slice(1)];
      const kind=!old?'New':changes.length||old.title!==next.title||old.pattern!==next.pattern?'Updated':'Unchanged';
      return {kind,old,next,changes};
    }).filter(Boolean);
  }
  function commit(database,source,details,rows){
    const plan=database.planner||{sessions:{},rules:{},meetings:{},sources:{},settings:{}},meetings={...plan.meetings};
    for(const row of rows)if(row.kind!=='Unchanged')meetings[row.next.id]={...row.next,updatedAt:now()};
    const previous=plan.sources[source],entry={...details,at:now()};
    const sources={...plan.sources,[source]:{...entry,history:[...(previous?.history||[]),entry]}};
    const planner={...plan,meetings,sources};
    M.validate({...database,planner});
    database.planner=planner;
  }
  function present(file,key,parsed,rows){
    const owner=db,serial=changeSerial;
    const dialog=document.createElement('dialog');dialog.className='libraryDialog outlookPreview';
    const add=(tag,value,parent=dialog)=>{const n=document.createElement(tag);n.textContent=value;parent.append(n);return n};
    add('h3','Outlook import preview');add('p',file.name+' · '+new Date(file.modified).toLocaleString('en-GB',{hourCycle:'h23'}));

    const dates=parsed.series.flatMap(s=>Object.values(s.dates).map(d=>d.date)).sort();
    add('p',dates.length?'Verified meeting dates in this file: '+displayDay(dates[0])+' – '+displayDay(dates.at(-1))+'. The export may only cover part of a series.':'No verified meeting dates in this file.');
    if(db.planner?.sources[key]?.fingerprint===file.fingerprint)add('p','This file’s contents are unchanged since the last confirmed import.');
    for(const warning of new Set(parsed.warnings))add('p',warning);
    for(const kind of ['New','Updated','Unchanged'])add('span',kind+' '+rows.filter(r=>r.kind===kind).length+'  ');
    const checks=new Map();P.button('Select all',()=>checks.forEach(c=>c.checked=true),dialog);P.button('Deselect all',()=>checks.forEach(c=>c.checked=false),dialog);
    for(const row of rows){const details=add('details',''),head=add('summary','',details);
      if(row.kind!=='Unchanged'){const c=document.createElement('input');c.type='checkbox';c.checked=true;head.append(c);checks.set(row,c)}
      head.append(document.createTextNode(row.kind+' · '+row.next.title));
      if(row.old&&row.old.title!==row.next.title)add('p',row.old.title+' → '+row.next.title,details);
      if(!row.old||row.old.pattern!==row.next.pattern)add('p',(row.old?.pattern||'')+' → '+row.next.pattern,details);
      const format=s=>s?.enabled===false?'Cancelled':s?displayDay(s.date)+' '+(s.allDay?'All day':P.clock(s.start)+'–'+P.clock(s.end)+' '+s.zone):'New';
      for(const d of row.changes)add('div',format(d.previous)+' → '+format(d.next),details);
    }
    const actions=add('div','');actions.className='modalactions';P.button('Cancel',()=>dialog.close(),actions);
    P.button('Import selected',()=>{if(owner!==db||serial!==changeSerial){toast('The library changed during preview. Open the import again.');dialog.close();return}const selected=rows.filter(r=>checks.get(r)?.checked);try{localStorage.setItem('planner-file-'+idFor(db,key),file.grant)}catch{}
      if(!selected.length){dialog.close();return}
      P.mutate(()=>commit(db,key,{name:file.name,grant:file.grant,calendarId:parsed.calendarId||db.planner?.sources[key]?.calendarId||'',calendarName:parsed.calendarName,fingerprint:file.fingerprint,modified:file.modified,from:dates[0],to:dates.at(-1)},selected));dialog.close()},actions);
    dialog.onkeydown=e=>e.stopPropagation();dialog.onclose=()=>dialog.remove();document.body.append(dialog);dialog.showModal();
  }
  function sameSource(a,b){
    if(!a||!b)return false;
    if(a.calendarId&&b.calendarId)return a.calendarId===b.calendarId;
    const hashes=s=>[s,...(s.history||[])].map(h=>h.fingerprint).filter(Boolean);
    const known=new Set(hashes(a));return hashes(b).some(h=>known.has(h));
  }
  function sourceCandidates(database,parsed,hash){
    const sources=Object.entries(database.planner?.sources||{});
    const compatible=sources.filter(([,s])=>!s.calendarId||!parsed.calendarId||s.calendarId===parsed.calendarId);
    const exact=compatible.filter(([,s])=>(parsed.calendarId&&parsed.calendarId===s.calendarId)||[s,...(s.history||[])].some(h=>h.fingerprint===hash));
    if(exact.length)return exact;
    const ids=new Set(parsed.series.map(s=>s.uid));
    const matches=new Set(Object.values(database.planner?.meetings||{}).filter(m=>m.source&&ids.has(m.uid.trim())).map(m=>m.source));
    return compatible.filter(([key])=>matches.has(key));
  }
  const idFor=(owner,key)=>owner.createdAt+'/'+key;
  async function choose(reuse){
    if(!db)return toast('Open a library first.');
    const last=Object.entries(db.planner?.sources||{}).sort((a,b)=>String(b[1].at).localeCompare(a[1].at))[0];
    const prior=reuse&&last;
    let grant=prior?(prior[1].grant||prior[0]):uuid();
    if(prior)try{grant=localStorage.getItem('planner-file-'+idFor(db,prior[0]))||grant}catch{}
    try{await readSelected(db,storage.handle?.sqlite?storage.handle.id:db.createdAt,grant,prior)}
    catch(error){toast('Outlook import: '+error.message)}
  }
  async function readSelected(owner,id,grant,prior){
    let file;
    if(window.__TAURI__?.core){
      file=await window.__TAURI__.core.invoke('read_planner_calendar',{library:id,source:grant,reuse:!!prior});
      if(!file)return;
    }else{
      const input=document.createElement('input');input.type='file';input.accept='.ics';
      const result=await new Promise(resolve=>{input.onchange=()=>resolve(input.files[0]);input.oncancel=()=>resolve(null);input.click()});
      if(!result)return;file={name:result.name,text:await result.text(),modified:result.lastModified};
    }
    if(owner!==db)throw Error('The active library changed. Open the import again.');
    file.fingerprint=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(file.text))),b=>b.toString(16).padStart(2,'0')).join('');
    file.grant=grant;
    const parsed=read(file.text),matches=sourceCandidates(db,parsed,file.fingerprint);
    const show=key=>{if(owner!==db)return;present(file,key,parsed,preview(db,key,parsed,today()))};
    if(matches.length>1&&!matches.every(([,s])=>sameSource(matches[0][1],s))){
      P.form('Choose matching Outlook calendar',[['key','Matching imports','select',matches[0][0],matches.map(([key,s])=>[key,(s.calendarName||s.name)+' · '+s.at])]],v=>show(v.key));
    }else show(matches[0]?.[0]||(prior&&(!parsed.calendarId||!prior[1].calendarId||parsed.calendarId===prior[1].calendarId)?prior[0]:prior?uuid():grant));

  }
  // Only consolidate verified sources. Every user-owned field must be compatible.
  function repairDuplicates(plan){
    const groups=new Map(),removed=[],conflicts=[];
    for(const m of Object.values(plan.meetings)){
      if(!m.source||!m.uid)continue;
      const uid=m.uid.trim(),peers=groups.get(uid)||[];
      const source=plan.sources[m.source];
      const peer=peers.find(p=>sameSource(source,plan.sources[p.source]));
      if(!peer){if(peers.length)conflicts.push(m);peers.push(m);groups.set(uid,peers);continue}
      const ignore=new Set(['id','source','createdAt','updatedAt','coverage','uid']);
      const fields=new Set([...Object.keys(peer),...Object.keys(m)]);
      if([...fields].some(k=>!ignore.has(k)&&JSON.stringify(peer[k])!==JSON.stringify(m[k]))||
        Object.entries(m.coverage||{}).some(([k,v])=>peer.coverage[k]&&JSON.stringify(v)!==JSON.stringify(peer.coverage[k]))){
        conflicts.push(m);continue;
      }
      peer.coverage={...m.coverage,...peer.coverage};delete plan.meetings[m.id];removed.push(m);
    }
    return {removed,conflicts};
  }
  function reviewDuplicates(){
    if(!db?.planner)return toast('No imported meetings.');
    const owner=db,serial=changeSerial,plan=structuredClone(db.planner);
    const {removed,conflicts}=repairDuplicates(plan);
    if(!removed.length&&!conflicts.length)return toast('No duplicate Outlook meetings found.');
    const dialog=document.createElement('dialog');dialog.className='libraryDialog outlookPreview';
    const heading=document.createElement('h3');heading.textContent='Review duplicate meetings';dialog.append(heading);
    for(const [label,items] of [['Identical copies to consolidate',removed],['Different records or unverified calendar identity — retained for review',conflicts]]){
      if(!items.length)continue;
      const group=document.createElement('details'),title=document.createElement('summary');title.textContent=label+' ('+items.length+')';group.append(title);
      for(const m of items){const line=document.createElement('p');line.textContent=[m.title,plan.sources[m.source]?.name,m.parent&&itemById(db,m.parent)?.title,m.content].filter(Boolean).join(' · ');group.append(line)}dialog.append(group);
    }
    P.button('Close',()=>dialog.close(),dialog);
    if(removed.length)P.button('Consolidate identical copies',()=>{if(owner===db&&serial===changeSerial){M.validate({...db,planner:plan});P.mutate(()=>db.planner=plan)}else toast('Library changed. Review again.');dialog.close()},dialog);
    dialog.onclose=()=>dialog.remove();document.body.append(dialog);dialog.showModal();
  }
  const menu=document.getElementById('calendarMenu');
  for(const [label,reuse] of [['Import Outlook Calendar…',false],['Reimport Outlook Calendar…',true]])P.button(label,()=>{$('appMenu').open=false;choose(reuse)},menu);
  P.button('Review Duplicate Meetings…',()=>{$('appMenu').open=false;reviewDuplicates()},menu);
  return {read,preview,commit,sourceCandidates,repairDuplicates};
})();
