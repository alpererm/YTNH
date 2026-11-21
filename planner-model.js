// A rule's key is stable. Individual occurrences are addressed by their original local day.
const PlannerModel = (() => {
  const copy = value => JSON.parse(JSON.stringify(value));
  const active = status => status === 'Todo' || status === 'Waiting for';
  function state(database) {
    return database.planner ||= {settings:{}, sessions:{}, rules:{}, meetings:{}, sources:{}};
  }
  function validate(database){
    const p=database.planner;if(p===undefined)return;
    const record=o=>o!==null&&typeof o==='object'&&!Array.isArray(o);
    const fail=detail=>{throw Error('Invalid Daily Planner record: '+detail+'. The library was not changed.')};
    const integer=(n,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
    const flags=o=>{for(const k of ['enabled','done','removed','allDay','postponed'])if(o[k]!==undefined&&typeof o[k]!=='boolean')fail(k)};
    const recurrence=r=>{
      if(!record(r)||!['daily','weekdays','weekly','monthly'].includes(r.frequency)||!integer(r.interval,1,Number.MAX_SAFE_INTEGER)||!validDate(r.startDate))fail('recurrence');
      if(r.weekDays!==undefined&&(!Array.isArray(r.weekDays)||!r.weekDays.length||r.weekDays.some(d=>!integer(d,0,6))||new Set(r.weekDays).size!==r.weekDays.length))fail('weekdays');
      if(r.monthlyMode!==undefined&&!['date','relative'].includes(r.monthlyMode))fail('monthly pattern');
      if(r.dayOfMonth!==undefined&&!integer(r.dayOfMonth,1,31))fail('monthly day');
      if(r.monthlyMode==='relative'&&(![1,2,3,4,-1].includes(r.ordinal)||!['day','weekday','weekend','0','1','2','3','4','5','6'].includes(String(r.dayKind))))fail('relative month');
    };
    const versions=vs=>{
      if(!Array.isArray(vs)||!vs.length)fail('missing versions');
      let prior='';for(const v of vs){if(!record(v)||!validDate(v.from)||v.from<=prior)fail('version order');prior=v.from;flags(v)}
    };
    const session=s=>{
      if(!integer(s.start,0,1439)||!integer(s.duration,15,1440)||s.start+s.duration>1440)fail('session time');
      flags(s);if(s.occurrence!==undefined&&!validDate(s.occurrence))fail('occurrence date');
    };
    const meeting=s=>{
      if(!record(s)||!validDate(s.date)||!integer(s.start,0,1439)||!integer(s.end,0,1440)||!integer(s.span,0,3652058)||(!s.span&&s.end<s.start)||(s.allDay&&!s.span))fail('meeting dates/times');
      if(typeof s.zone!=='string'||!s.zone.trim())fail('meeting time zone');
      try{new Intl.DateTimeFormat('en',{timeZone:s.zone}).format(0)}catch{fail('meeting time zone')}
      flags(s);
      if(s.until!=null&&!validDate(s.until))fail('recurrence end');
      if(s.recurrence!=null)recurrence(s.recurrence);
      if(s.custom!=null&&s.custom!==''){
        try{const r=ICAL.Recur.fromString(s.custom);if(!['DAILY','WEEKLY','MONTHLY','YEARLY'].includes(r.freq)||!integer(r.interval,1,Number.MAX_SAFE_INTEGER))fail('custom recurrence');r.iterator(ICAL.Time.fromDateString(s.date)).next()}catch{fail('custom recurrence')}
      }
      if(s.offset!==undefined&&!Number.isSafeInteger(s.offset))fail('meeting offset');
    };
    const exceptions=(r,validate)=>{
      if(!record(r.exceptions))fail('exceptions');
      for(const [day,e] of Object.entries(r.exceptions)){
        if(!validDate(day)||!record(e))fail('exception date');flags(e);
        if(e.date!==undefined&&!validDate(e.date))fail('exception destination');
        const v=versionAt(r.versions,day);if(!v)fail('exception before first version');
        if(!e.removed)validate({...v,...v.localOverride,...e,date:e.date||day});
      }
    };
    if(!record(p)||!['sessions','rules','meetings','sources','settings'].every(k=>record(p[k])))fail('collections');
    const owners=new Set([...database.items,...database.archiveIndex].map(i=>i.id));
    for(const s of Object.values(p.sessions)){
      if(!record(s)||!owners.has(s.item)||!validDate(s.date))fail('session owner/date');session(s);
    }
    for(const r of Object.values(p.rules)){
      if(!record(r)||!owners.has(r.item))fail('rule owner');versions(r.versions);
      for(const v of r.versions){session(v);if(!Number.isSafeInteger(v.offset))fail('rule offset');recurrence(v.recurrence)}
      exceptions(r,session);
    }
    const identities=new Set();
    for(const [id,m] of Object.entries(p.meetings)){
      if(!record(m)||m.id!==id||typeof m.title!=='string'||typeof m.content!=='string'||(m.parent&&!owners.has(m.parent)))fail('meeting identity');
      versions(m.versions);
      for(const v of m.versions){meeting(v);if(v.localOverride!=null){if(!record(v.localOverride))fail('local override');meeting({...v,...v.localOverride})}}
      exceptions(m,meeting);
      if(m.source){
        const identity=JSON.stringify([m.source,m.uid]);
        if(!Object.hasOwn(p.sources,m.source)||typeof m.uid!=='string'||!m.uid.trim()||!record(m.coverage)||identities.has(identity))fail('import identity');
        identities.add(identity);
        for(const [day,c] of Object.entries(m.coverage)){if(!validDate(day))fail('coverage date');meeting(c)}
      }
    }
  }
  function shift(date, days) {
    const d = new Date(date+'T12:00:00');
    d.setDate(d.getDate()+days);
    return iso(d);
  }
  function daysBetween(first, last) {
    return (Date.parse(last+'T00:00:00Z')-Date.parse(first+'T00:00:00Z'))/86400000;
  }
  function versionAt(versions, day) {
    return versions.findLast(v=>v.from<=day);
  }
  function revise(rule, day, values) {
    const prior=versionAt(rule.versions,day);
    rule.versions=rule.versions.filter(v=>v.from!==day);
    rule.versions.push({...prior,...copy(values),from:day});
    rule.versions.sort((a,b)=>a.from.localeCompare(b.from));
  }
  function session(database,item,date,start,duration,occurrence,origin,keepDates=false) {
    if(!validDate(date)||!Number.isInteger(start)||start<0||start%15||!Number.isInteger(duration)||duration<15||duration%15||start+duration>1440)
      throw new Error('Choose a time and duration within the selected day.');
    if(item.archived || (item.type==='Todo' && !active(item.status)))throw new Error('Choose an active item.');
    const key=uuid(),record={item:item.id,date,start,duration};
    if(item.type==='Todo'){record.done=false;if(occurrence)record.occurrence=occurrence;}
    const dates=item.scheduledDates||[];
    if(keepDates&&item.type==='Todo'){
      if(date!==origin&&!dates.includes(date))item.scheduledDates=[...dates,date].sort();
    }else{
    if(origin&&date!==origin&&isRecurringTodo(item)&&!dates.includes(origin)){
      const origins=occurrenceOrigins(item,origin);
      for(const o of origins)(item.occurrencePostponements ||= {})[o]=date;
    }
    if(origin && item.type==='Todo' && dates.includes(origin))item.scheduledDates=[...new Set(dates.map(day=>day===origin?date:day))].sort();
    else if(!dates.length&&!isRecurringTodo(item))item.scheduledDates=[date];
    }
    state(database).sessions[key]=record;
    return key;
  }
  function repeat(database,key) {
    const plan=state(database),s=plan.sessions[key],item=itemById(database,s.item);
    if(!isRecurringTodo(item)||!s.occurrence)throw new Error('Choose a Todo occurrence first.');
    const origin=s.occurrence;
    plan.rules[key]={item:item.id, versions:[], exceptions:{}};
    revise(plan.rules[key],origin,{recurrence:item.recurrence,start:s.start,duration:s.duration,offset:daysBetween(origin,s.date),enabled:true});
    if(s.done)plan.rules[key].exceptions[origin]={done:true};
    delete plan.sessions[key];
  }
  function occurrenceBlock(rule,key,origin,version){
    const changes=rule.exceptions[origin]||{};
    if(changes.removed)return null;
    return {key,origin,item:rule.item,occurrence:origin,date:shift(origin,version.offset),start:version.start,duration:version.duration,done:false,...changes};
  }
  // Read-only navigation index: explicit sessions plus the next occurrence per series.
  function upcoming(database,day,minute){
    const result=new Map(),plan=database?.planner;if(!plan)return result;
    const relevant=b=>b&&!b.removed&&!b.done&&b.date<='2150-12-31'&&(b.date>day||b.date===day&&b.start+b.duration>minute);
    const compare=(a,b)=>a.date.localeCompare(b.date)||a.start-b.start||a.key.localeCompare(b.key);
    const add=b=>{if(!result.has(b.item))result.set(b.item,[]);result.get(b.item).push(b)};
    for(const [key,s] of Object.entries(plan.sessions))if(relevant(s))add({...s,key});
    for(const [key,rule] of Object.entries(plan.rules)){
      const choices=[];
      for(const [origin,exception] of Object.entries(rule.exceptions)){
        const v=versionAt(rule.versions,origin);if(!v||!exception.date)continue;
        const block=occurrenceBlock(rule,key,origin,v);if(relevant(block))choices.push(block);
      }
      rule.versions.forEach((v,index)=>{
        if(!v.enabled)return;
        const from=[v.from,shift(day,-v.offset),'2026-01-01'].sort().at(-1);
        const to=rule.versions[index+1]?shift(rule.versions[index+1].from,-1):'2150-12-31';
        for(const origin of regularOccurrences({type:'Todo',recurrence:v.recurrence},from,to)){
          if(rule.exceptions[origin]?.date)continue;
          const block=occurrenceBlock(rule,key,origin,v);
          if(relevant(block)){choices.push(block);break}
        }
      });
      choices.sort(compare);if(choices.length)add(choices[0]);
    }
    for(const list of result.values())list.sort(compare);
    return result;
  }
  function generated(rule,key,day) {
    const found=new Map();
    const add=(origin,version)=>{
      const block=occurrenceBlock(rule,key,origin,version);
      if(block&&block.date===day)found.set(origin,block);
    };
    for(const v of rule.versions){
      const origin=shift(day,-v.offset);
      if(!v.enabled||versionAt(rule.versions,origin)!==v)continue;
      if(regularOccurrences({type:'Todo',recurrence:v.recurrence},origin,origin).next().value)add(origin,v);
    }
    for(const [origin,exception] of Object.entries(rule.exceptions)){
      const v=versionAt(rule.versions,origin);
      if(exception.date===day&&v)add(origin,v);
    }
    return [...found.values()];
  }
  function sessions(database,day){
    const p=database?.planner;if(!p)return [];
    const singles=Object.entries(p.sessions).filter(([,s])=>s.date===day).map(([key,s])=>({...s,key}));
    return singles.concat(Object.entries(p.rules).flatMap(([key,r])=>generated(r,key,day)));
  }
  function change(database,block,values,future=false){
    const p=state(database);
    if(!block.origin){
      if(values.removed)delete p.sessions[block.key];else Object.assign(p.sessions[block.key],values);
      return;
    }
    const rule=p.rules[block.key];
    if(!future){
      const exception=rule.exceptions[block.origin] ||= {};
      Object.assign(exception,values);
      if(values.date!==undefined)delete exception.postponed;
      if(!exception.date && !exception.removed)exception.date=block.date;
      return;
    }
    const edit={};
    if(values.date)edit.offset=daysBetween(block.origin,values.date);
    if(values.start!=null)edit.start=values.start;
    if(values.duration!=null)edit.duration=values.duration;
    if(values.removed)edit.enabled=false;
    for(const v of rule.versions.filter(v=>v.from>block.origin))Object.assign(v,edit);
    revise(rule,block.origin,edit);
  }
  function reconcile(database,day,minute){
    const p=database?.planner;if(!p)return;
    const items=new Map(database.items.map(i=>[i.id,i])),cold=new Set(database.archiveIndex.map(i=>i.id));
    const upcoming=s=>s.date>day||(s.date===day&&s.start>=minute);
    for(const [key,s] of Object.entries(p.sessions)){
      const item=items.get(s.item);
      if(!item&&!cold.has(s.item)){delete p.sessions[key];continue;}
      const status=item?.occurrenceStates?.[s.occurrence]||item?.status;
      if(!s.done&&upcoming(s)&&(!item||item.archived||(item.type==='Todo'&&!active(status))))delete p.sessions[key];
    }
    for(const [key,r] of Object.entries(p.rules)){
      const item=items.get(r.item);
      if(!item&&!cold.has(r.item)){delete p.rules[key];continue;}
      const v=versionAt(r.versions,day)||r.versions[0];if(!v)continue;
      if(!item||item.archived||!active(item.status)||!isRecurringTodo(item)){
        for(const b of generated(r,key,day))if(upcoming(b)&&!b.done)change(database,b,{removed:true});
        for(const exception of Object.values(r.exceptions))if(exception.date&&!exception.done&&upcoming({date:exception.date,start:exception.start??v.start}))exception.removed=true;
        const stop=day>=v.from?shift(day,1):v.from;
        if((versionAt(r.versions,stop)||r.versions[0])?.enabled)revise(r,stop,{enabled:false});
        for(const later of r.versions.filter(x=>x.from>=stop))later.enabled=false;
      }else{
        if(JSON.stringify(v.recurrence)!==JSON.stringify(item.recurrence)&&v.enabled){
          revise(r,day<v.from?v.from:day,{recurrence:item.recurrence});
          for(const later of r.versions.filter(x=>x.from>day))later.recurrence=copy(item.recurrence);
        }
        for(const [origin,moved] of Object.entries(item.occurrencePostponements||{})){
          const version=versionAt(r.versions,origin),e=r.exceptions[origin];
          if(!version||!version.enabled||origin<day||(e?.date&&!e.postponed)||e?.removed)continue;
          Object.assign(r.exceptions[origin] ||= {},{date:shift(moved,version.offset),postponed:true});
        }
        for(const [origin,e] of Object.entries(r.exceptions)){
          if(e.postponed&&origin>=day&&!item.occurrencePostponements?.[origin]){delete e.date;delete e.postponed}
        }
        for(const [origin,status] of Object.entries(item.occurrenceStates||{})){
          const version=versionAt(r.versions,origin);if(!version||active(status)||r.exceptions[origin]?.done)continue;
          const e=r.exceptions[origin]||{},s={date:e.date||shift(origin,version.offset),start:e.start??version.start};
          if(upcoming(s))(r.exceptions[origin] ||= {}).removed=true;
        }
      }
    }
    for(const m of Object.values(p.meetings))if(m.parent&&!items.has(m.parent)&&!cold.has(m.parent))m.parent=null;
  }
  return {state,validate,shift,daysBetween,versionAt,revise,session,repeat,sessions,upcoming,change,reconcile};
})();

// Keep civil dates in the meeting's own zone. Only the displayed interval is converted.
const PlannerMeetings = (() => {
  const formats=new Map();
  function parts(instant,zone){
    if(!formats.has(zone))formats.set(zone,new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}));
    const p=Object.fromEntries(formats.get(zone).formatToParts(instant).map(x=>[x.type,x.value]));
    return {date:p.year+'-'+p.month+'-'+p.day,minute:Number(p.hour)*60+Number(p.minute)};
  }
  function wall(date,minute,zone){
    const target=Date.parse(date+'T00:00:00Z')+minute*60000;
    const offsets=new Set();
    for(const t of [target-86400000,target,target+86400000]){
      const p=parts(t,zone);
      offsets.add(Date.parse(p.date+'T00:00:00Z')+p.minute*60000-t);
    }
    const candidates=[...offsets].map(offset=>target-offset).sort((a,b)=>a-b);
    // Earlier instant at a repeated hour; advance by the gap at a skipped hour.
    return candidates.find(t=>{const p=parts(t,zone);return p.date===date&&p.minute===minute})??candidates.at(-1);
  }
  function schedule(m,origin){
    const e=m.exceptions[origin],v=PlannerModel.versionAt(m.versions,origin);
    if(e?.removed||!v)return null;
    const covered=m.source?m.coverage?.[origin]:null;
    if(m.source&&(!covered||covered.enabled===false))return null;
    if(!covered&&!e&&!matches(v,origin))return null;
    if(covered&&!v.enabled&&!e)return null;
    const override=v.localOverride||{};
    return {...v,...covered,...override,...e,date:e?.date||((override.offset!=null)?PlannerModel.shift(covered?.date||origin,override.offset):covered?.date)||origin};
  }
  // Keep recurrence origins stable when moving a series; offsets only change display dates.
  // This reuses the localOverride representation already used by imported series.
  function reviseSchedule(m,origin,s){
    const v=PlannerModel.versionAt(m.versions,origin);
    s={...s};delete s.localOverride;delete s.from;
    const shape=r=>{if(!r)return null;const c={...r};delete c.startDate;return JSON.stringify(c)};
    const samePattern=v&&shape(v.recurrence)===shape(s.recurrence)&&(v.custom||null)===(s.custom||null);
    if(m.source||samePattern){
      const anchor=m.source?(m.coverage[origin]?.date||origin):origin;
      PlannerModel.revise(m,origin,{...s,date:v.date,recurrence:v.recurrence,custom:v.custom,
        localOverride:{...s,offset:PlannerModel.daysBetween(anchor,s.date)}});
    }else PlannerModel.revise(m,origin,{...s,localOverride:null});
  }
  // Use the same RFC recurrence iterator as the importer for custom meeting rules.
  const customCache=new WeakMap();
  function customDates(v,through){
    let cache=customCache.get(v);
    const key=v.custom+'@'+v.date;
    if(!cache||cache.key!==key){
      const rule=ICAL.Recur.fromString(v.custom);
      const cursor=rule.iterator(ICAL.Time.fromDateString(v.date));
      cache={key,cursor,next:cursor.next(),days:new Set()};customCache.set(v,cache);
    }
    while(cache.next){
      const iso=cache.next.toString().slice(0,10);if(iso>through)break;
      cache.days.add(iso);cache.next=cache.cursor.next();
    }
    return cache.days;
  }
  function matches(v,date){
    if(!v.enabled||date<v.date||(v.until&&date>v.until))return false;
    if(v.custom)return customDates(v,date).has(date);
    if(!v.recurrence)return date===v.date;
    return !!regularOccurrences({type:'Todo',recurrence:v.recurrence},date,date).next().value;
  }
  function nearest(m,day){
    const candidates=new Set([...Object.keys(m.exceptions),...Object.keys(m.coverage||{})]);
    if(!m.source)for(const [i,v] of m.versions.entries()){
      if(!v.enabled)continue;
      const from=v.from>v.date?v.from:v.date;
      const until=[m.versions[i+1]&&PlannerModel.shift(m.versions[i+1].from,-1),v.until,'2150-12-31'].filter(Boolean).sort()[0];
      if(from>until)continue;
      if(v.custom){for(const d of customDates(v,until))if(d>=from)candidates.add(d);continue}
      if(!v.recurrence){candidates.add(v.date);continue}
      const reference={type:'Todo',recurrence:v.recurrence};
      const originDay=PlannerModel.shift(day,-(v.localOverride?.offset||0));
      const after=from>originDay?from:originDay;
      if(after<=until)for(const d of regularOccurrences(reference,after,until)){if(!m.exceptions[d]){candidates.add(d);break}}
      const end=originDay<until?originDay:until;
      // Search history in short windows, starting with the most recent.
      for(let high=end;high>=from;){
        const low=PlannerModel.shift(high,-90),first=low>from?low:from;
        const dates=[...regularOccurrences(reference,first,high)].filter(d=>!m.exceptions[d]);
        if(dates.length){candidates.add(dates.at(-1));break}
        high=PlannerModel.shift(first,-1);
      }
    }
    const dates=[...candidates].map(d=>schedule(m,d)?.date).filter(Boolean).sort();
    return dates.find(d=>d>=day)||dates.at(-1);
  }
  function blocks(m,key,day,zone){
    const out=[],shift=PlannerModel.shift;
    const origins=new Set(Object.keys(m.exceptions));
    const span=Math.max(1,...m.versions.map(v=>v.span||0),...Object.values(m.coverage||{}).map(v=>v.span||0));
    for(let d=shift(day,-span-1);d<=shift(day,1);d=shift(d,1))origins.add(d);
    for(const v of m.versions){
      const offset=v.localOverride?.offset||0,first=shift(day,-offset-span-1),last=shift(day,-offset+1);
      for(let d=first;d<=last;d=shift(d,1))origins.add(d);
    }
    if(m.source)for(const [origin,s] of Object.entries(m.coverage||{}))if(s.date&&s.date<=shift(day,1)&&shift(s.date,(s.span||0)+1)>=day)origins.add(origin);
    for(const origin of origins){
      const s=schedule(m,origin);if(!s)continue;
      const endDate=shift(s.date,s.span||0);
      if(s.allDay){
        if(s.date<=day&&day<endDate)out.push({key,origin,title:m.title,meeting:true,allDay:true,date:day});
        continue;
      }
      const a=parts(wall(s.date,s.start,s.zone),zone),b=parts(wall(endDate,s.end,s.zone),zone);
      if(a.date>day||b.date<day||(b.date===day&&b.minute===0))continue;
      const start=a.date===day?a.minute:0,end=b.date===day?b.minute:1440;
      out.push({key,origin,title:m.title,meeting:true,date:day,start,duration:Math.max(1,end-start)});
    }
    return out;
  }
  return {parts,wall,matches,schedule,blocks,nearest,reviseSchedule};
})();
