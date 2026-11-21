const DailyMeetingEditor=(()=>{
  const P=DailyPlanner,M=PlannerModel;
  function open(key){
    const m=db?.planner?.meetings[key];if(!m)return;
    if(editorDisplayedId!==key){docFind.hide(false);flushPendingInputs();flushAutosaveOnNavigation()}
    rememberEditorLocation();selected=editorDisplayedId=key;
    $('editor').classList.remove('hidden');$('editor').classList.add('meetingDocument');
    for(const id of ['calendarBody','mainPaneHead','calendarControls'])$(id).classList.add('hidden');
    $('layout').dataset.view='editor';$('editCode').textContent='▦';$('editCode').classList.remove('note-code','todo-code');
    $('refHealth').textContent='';$('editType').textContent='Meeting';$('mainTitle').textContent='Editor';
    $('meetingParent').textContent=m.parent?(itemById(db,m.parent)?.title||'Archived parent'):'';
    syncSourceFromModel(m);syncRichFromModel(m);setSourceMode(false);updateWritingWidth();focusBodyStart();rememberFocusedItem();
  }
  const parent=document.createElement('button');parent.id='meetingParent';parent.className='tagbadge';parent.onclick=()=>{const id=db.planner.meetings[selected]?.parent;if(id)edit(id)};
  $('editor').querySelector('.editmeta').append(parent);
  function editSchedule(m,origin,s,mode){
    const manual=!m,id=m?.id||uuid();
    const fields=[['title','Meeting title','text',m?.title||''],['date','Start date','date',s.date],['last','End date (exclusive for all-day)','date',M.shift(s.date,s.span||0)],['allDay','All day','checkbox',s.allDay||false],['start','Start time','time',P.clock(s.start)],['end','End time','time',P.clock(s.end)],['zone','Time zone','text',s.zone],
    ['frequency','Repeat','select',s.custom?'custom':s.recurrence?.frequency||'',[['','Once'],['daily','Daily'],['weekdays','Weekdays'],['weekly','Weekly'],['monthly','Monthly'],['custom','Custom rule']]],['custom','Recurrence rule (RFC 5545)','text',s.custom||''],['interval','Repeat every','number',s.recurrence?.interval||1],['until','Repeat through (optional)','date',s.until||'']];
    let pattern;
    const inputs=P.form(manual?'Create meeting':'Edit schedule',fields,v=>{
      if(!v.title.trim())throw Error('Enter a title.');PlannerMeetings.parts(Date.now(),v.zone);
      let span=M.daysBetween(v.date,v.last);
      if(v.allDay&&span===0)span=1;
      const start=v.allDay?0:P.parse(v.start),end=v.allDay?0:P.parse(v.end);
      if(span<0||(!span&&end<=start)||!Number.isInteger(+v.interval)||+v.interval<1||(v.until&&v.until<v.date))throw Error('Check the meeting dates, times and repeat interval.');
      let custom=null;
      if(v.frequency==='custom'){
        custom=v.custom.trim().replace(/^RRULE:/i,'').toUpperCase();
        if(!/^FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)(;|$)/.test(custom)||/BY(HOUR|MINUTE|SECOND)=/.test(custom))throw Error('Use a daily, weekly, monthly or yearly rule with one start time per day.');
        ICAL.Recur.fromString(custom).iterator(ICAL.Time.fromDateString(v.date)).next();
      }
      const schedule={custom,date:v.date,start,end,span,allDay:v.allDay,zone:v.zone,enabled:true,until:v.until||null,recurrence:v.frequency&&v.frequency!=='custom'?pattern.read(v):null};
      P.mutate(()=>{
        const target=m||{id,title:v.title.trim(),content:'',parent:null,createdAt:now(),updatedAt:now(),versions:[],exceptions:{}};
        target.title=v.title.trim();target.updatedAt=now();
        if(mode==='standalone'&&(schedule.recurrence||custom)){
          // Replace the single occurrence, including a prior drag exception, in place.
          target.versions=[{...schedule,from:v.date}];delete target.exceptions[origin];
        }else if(mode==='one'||mode==='standalone')target.exceptions[origin]=schedule;
        else PlannerMeetings.reviseSchedule(target,origin||v.date,schedule);
        M.state(db).meetings[id]=target;
      });
    });
    // Use the Todo editor's weekday and monthly controls with dialog-local identities.
    const ids={},host=document.createElement('div');
    for(const name of ['weeklyPattern','monthlyPattern']){
      const copy=$(name).cloneNode(true);
      for(const el of [copy,...copy.querySelectorAll('[id]')]){ids[el.id]=el;el.id='meeting-'+el.id}
      for(const label of copy.querySelectorAll('[for]'))label.htmlFor='meeting-'+label.htmlFor;
      for(const day of copy.querySelectorAll('[data-repeat-day]')){day.dataset.meetingDay=day.dataset.repeatDay;delete day.dataset.repeatDay}
      host.append(copy);
    }
    inputs.title.closest('dialog').classList.add('meetingDialog');
    host.className='meetingPattern';inputs.until.parentElement.after(host);
    inputs.allDay.parentElement.before(inputs.start.parentElement,inputs.end.parentElement);
    inputs.custom.parentElement.before(inputs.interval.parentElement);

    const weekdays=[...host.querySelectorAll('[data-meeting-day]')],r=s.recurrence||{},anchor=new Date(s.date+'T12:00:00');
    weekdays.forEach(c=>c.checked=(r.weekDays||[anchor.getDay()]).includes(+c.dataset.meetingDay));
    ids.monthlyMode.value=r.monthlyMode||'date';ids.monthlyDay.value=r.dayOfMonth||anchor.getDate();ids.monthlyOrdinal.value=r.ordinal||Math.min(4,Math.ceil(anchor.getDate()/7));ids.monthlyDayKind.value=r.dayKind??anchor.getDay();
    pattern={read(v){const result={frequency:v.frequency,interval:+v.interval,startDate:v.date};
      if(v.frequency==='weekly'){result.weekDays=weekdays.filter(c=>c.checked).map(c=>+c.dataset.meetingDay);if(!result.weekDays.length)throw Error('Select at least one weekday.')}
      if(v.frequency==='monthly'){result.monthlyMode=ids.monthlyMode.value;if(result.monthlyMode==='relative'){result.ordinal=+ids.monthlyOrdinal.value;result.dayKind=ids.monthlyDayKind.value}else result.dayOfMonth=+ids.monthlyDay.value}
      return result}};
    ids.monthlyMode.onchange=visibility;
    inputs.custom.required=false;inputs.frequency.required=false;inputs.until.required=false;inputs.interval.min=1;
    function visibility(){const f=inputs.frequency.value;host.hidden=mode==='one';ids.weeklyPattern.classList.toggle('hidden',f!=='weekly');ids.monthlyPattern.classList.toggle('hidden',f!=='monthly');ids.monthlyDatePattern.classList.toggle('hidden',ids.monthlyMode.value==='relative');ids.monthlyRelativePattern.classList.toggle('hidden',ids.monthlyMode.value!=='relative');for(const k of ['start','end']){inputs[k].disabled=inputs.allDay.checked;inputs[k].closest('label').hidden=inputs[k].disabled}for(const k of ['frequency','interval','until'])inputs[k].closest('label').hidden=mode==='one';inputs.custom.parentElement.hidden=mode==='one'||inputs.frequency.value!=='custom'}
    inputs.frequency.onchange=visibility;inputs.allDay.onchange=visibility;visibility();
  }
  function create(day,minute){const end=minute+30;editSchedule(null,null,{date:day,start:minute,end:end%1440,span:Math.floor(end/1440),zone:P.zone})}
  function chooseScope(b,x,y,fn){
    const m=db.planner.meetings[b.key],s=PlannerMeetings.schedule(m,b.origin);
    if(!m.source&&!s.recurrence&&!s.custom)return fn('one');
    P.popup(x,y,[['This occurrence only',()=>fn('one')],['This and all future occurrences',()=>fn('series')]]);
  }
  function change(b,values,x,y){
    const m=db.planner.meetings[b.key],s=PlannerMeetings.schedule(m,b.origin);
    chooseScope(b,x,y,mode=>P.mutate(()=>{
      const schedule={...s};
      if(values.removed){if(mode==='one'){m.exceptions[b.origin]={removed:true};return}schedule.enabled=false;}
      else{
        const first=PlannerMeetings.wall(s.date,s.start,s.zone);
        const endTime=PlannerMeetings.wall(M.shift(s.date,s.span||0),s.end,s.zone);
        const moved=values.start??b.start;
        const delta=PlannerMeetings.wall(values.date||b.date,moved,P.zone)-PlannerMeetings.wall(b.date,b.start,P.zone);
        const a=PlannerMeetings.parts(first+delta,s.zone);
        const end=PlannerMeetings.parts(endTime+delta+((values.duration??b.duration)-b.duration)*60000,s.zone);
        Object.assign(schedule,{date:a.date,start:a.minute,end:end.minute,span:M.daysBetween(a.date,end.date)});
      }
      if(mode==='one')m.exceptions[b.origin]=schedule;else PlannerMeetings.reviseSchedule(m,b.origin,schedule);
    }));
  }
  function menu(e,b){
    const m=db.planner.meetings[b.key],s=PlannerMeetings.schedule(m,b.origin);
    P.popup(e.clientX,e.clientY,[['Open meeting document',()=>open(m.id)],
      ['Edit schedule…',()=>{
        const single=!m.source&&m.versions.length===1&&!m.versions[0].recurrence&&!m.versions[0].custom;
        if(single)editSchedule(m,b.origin,s,'standalone');
        else chooseScope(b,e.clientX,e.clientY,mode=>editSchedule(m,b.origin,s,mode));
      }],
      ['Choose parent…',()=>chooseReference(false,i=>P.mutate(()=>m.parent=i.id),{title:'Meeting parent'})],
      ...(m.parent?[['Remove parent',()=>P.mutate(()=>m.parent=null)]]:[]),
      ['Cancel occurrence',()=>P.mutate(()=>m.exceptions[b.origin]={removed:true})],
      ['End series here',()=>P.mutate(()=>M.revise(m,b.origin,{enabled:false}))],
      ['Delete entire meeting and document…',()=>{if(confirm('Delete this meeting, all occurrences and its shared document?')){if(selected===m.id){showCalendar();selected=null;editorDisplayedId=null}P.mutate(()=>delete db.planner.meetings[m.id])}}]]);
  }
  function search(host,query){
    for(const m of Object.values(db.planner?.meetings||{})){
      const parent=m.parent&&itemById(db,m.parent),text=[m.title,m.content,parent?.title].filter(Boolean).join(' ').toLowerCase();
      if(!fuzzyTextMatch(query.toLowerCase(),text))continue;
      host.querySelector('.empty')?.remove();const result=P.button('▦ '+m.title,()=>{
        const day=today();P.open();P.selectDay(PlannerMeetings.nearest(m,day)||day);
        completeSearchAction();open(m.id);
      },host);result.className='planMeetingResult';
      const last=m.versions.at(-1);
      if(!last.enabled)P.button('Restart series…',()=>editSchedule(m,today(),{...last,date:today()},'series'),host);
    }
  }
  return {open,create,change,menu,search};
})();
