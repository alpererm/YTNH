const DailyPlanner = (() => {
  const M=PlannerModel, zone=Intl.DateTimeFormat().resolvedOptions().timeZone;
  const pane=document.createElement('aside');pane.id='dailyPlanner';pane.hidden=true;pane.setAttribute('aria-label','Daily Planner');
  pane.innerHTML='<div class="planGrip" role="separator" tabindex="0" aria-label="Resize Daily Planner" aria-orientation="vertical"></div><header><button data-act="prev" aria-label="Previous day">‹</button><input class="datejump" aria-label="Planner date" type="date"><button data-act="next" aria-label="Next day">›</button><button data-act="pin" class="editorIconButton"></button></header><div class="planAll"></div><div class="planScroll"><div class="planGrid" tabindex="0" aria-label="Daily timeline"></div></div>';
  document.querySelector('.mainpanel').append(pane);dayFirstField(pane.querySelector('input[type=date]'));
  const grid=pane.querySelector('.planGrid'),scroll=pane.querySelector('.planScroll'),all=pane.querySelector('.planAll');
  let date=today(),first=420,last=1140,selectedKey=null,expanded=new Set(),owner=null,queued=false,menu=null;
  const offsets=new Map(),px=1.45;
  const pin=pane.querySelector('[data-act=pin]');
  pin.innerHTML=sidebarIcon('<path d="m16 3 5 5-3 1-4 5v3l-2 2-7-7 2-2h3l5-4zM9 15l-6 6"/>');
  let pinnedDate=null,suspended=false,previewing=false;
  const returnPin=button('Return to pinned date',()=>{previewing=false;selectDay(pinnedDate,false);paintPin()},pane);returnPin.className='planReturnPin';returnPin.hidden=true;pane.querySelector('header').after(returnPin);
  try{const saved=localStorage.getItem('ytnh-planner-pin');if(validDate(saved||''))pinnedDate=saved}catch{}
  function paintPin(){returnPin.hidden=!(previewing&&pinnedDate&&date!==pinnedDate);pin.setAttribute('aria-pressed',String(!!pinnedDate));pin.title=pinnedDate?'Unpin Planner date':'Pin Planner date';pin.setAttribute('aria-label',pin.title)}
  function savePin(){try{if(pinnedDate)localStorage.setItem('ytnh-planner-pin',pinnedDate);else localStorage.removeItem('ytnh-planner-pin')}catch{}paintPin()}
  function follow(ds,includeHidden=false){if((!pane.hidden||includeHidden)&&!pinnedDate&&ds&&ds!==date)selectDay(ds,false)}
  function suspend(){if(!pane.hidden){open(false,false);suspended=true}}
  function resume(){if(suspended){suspended=false;open(true,false)}}
  paintPin();
  const minutes=()=>new Date().getHours()*60+new Date().getMinutes();
  const clock=n=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
  const parse=s=>{if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(s))return NaN;const [h,m]=s.split(':').map(Number);return h*60+m};
  const bound=(n,a,b)=>Math.min(b,Math.max(a,n));
  const snap=n=>Math.round(n/15)*15;
  // Every quarter owns one visual interval, with a reversible linear scale.
  let quarters=[];
  function pixelAt(minute){
    if(!quarters.length||minute<first)return (minute-first)*px;
    const q=quarters[Math.min(quarters.length-1,Math.floor((minute-first)/15))];
    return q.top+(minute-q.start)*q.height/15;
  }
  function minuteAtOffset(y){
    const q=quarters.find(q=>y<q.top+q.height)||quarters.at(-1);
    return q?q.start+(y-q.top)*15/q.height:first+y/px;
  }
  const minuteAt=e=>minuteAtOffset(e.clientY-grid.getBoundingClientRect().top);
  const quarterStart=minute=>bound(Math.floor(minute/15)*15,first,last-15);
  const slotMarker=document.createElement('div');slotMarker.className='planSlotMarker';slotMarker.setAttribute('aria-hidden','true');
  let selectedSlot=null;
  function paintSlot(){
    if(selectedSlot===null||selectedSlot<first||selectedSlot>=last){slotMarker.remove();return}
    slotMarker.style.top=pixelAt(selectedSlot)+'px';slotMarker.style.height=(pixelAt(selectedSlot+15)-pixelAt(selectedSlot))+'px';grid.append(slotMarker);
  }
  const identity=b=>b.key+'@'+(b.origin||'');
  function button(label,fn,parent){
    const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=fn;parent.append(b);return b;
  }
  function clearSlot(){selectedSlot=null;slotMarker.remove()}
  function closeMenu(){if(menu)clearSlot();menu?.remove();menu=null}
  function popup(x,y,choices,returnFocus=grid){
    closeMenu();menu=document.createElement('div');menu.className='selectPopover planMenu';menu.setAttribute('role','menu');document.body.append(menu);
    for(const [label,act] of choices)button(label,()=>{closeMenu();act()},menu).setAttribute('role','menuitem');
    menu.style.left=bound(x,4,innerWidth-menu.offsetWidth-4)+'px';menu.style.top=bound(y,4,innerHeight-menu.offsetHeight-4)+'px';
    menu.firstChild?.focus();
    menu.onkeydown=e=>{const bs=[...menu.children],i=bs.indexOf(document.activeElement);if(e.key==='Escape'){closeMenu();returnFocus?.focus()}else if(['ArrowDown','ArrowUp'].includes(e.key))bs[(i+(e.key==='ArrowUp'?-1:1)+bs.length)%bs.length].focus();else return;e.preventDefault();e.stopPropagation()};
  }
  document.addEventListener('pointerdown',e=>{if(menu&&!menu.contains(e.target))closeMenu()},true);
  function form(title,fields,submit){
    const dialog=document.createElement('dialog');dialog.className='libraryDialog planDialog';const f=document.createElement('form');dialog.append(f);
    const h=document.createElement('h3');h.textContent=title;f.append(h);const inputs={};
    for(const [name,label,type,value,options] of fields){
      const l=document.createElement('label');l.textContent=label;const i=document.createElement(type==='select'?'select':'input');if(type!=='select')i.type=type==='time'?'text':type;
      if(type==='time'){i.pattern='([01][0-9]|2[0-3]):[0-5][0-9]';i.placeholder='HH:MM';i.maxLength=5;i.title='24-hour time (HH:MM)'}
      for(const [v,t] of options||[])i.add(new Option(t,v));
      if(type==='checkbox')i.checked=value;else{i.value=value??'';i.required=true}
      i.name=name;i.setAttribute('aria-label',label);inputs[name]=i;l.append(i);f.append(l);
    }
    const actions=document.createElement('div');actions.className='modalactions';f.append(actions);
    button('Cancel',()=>dialog.close(),actions);const ok=button('Apply',null,actions);ok.type='submit';
    f.onsubmit=e=>{e.preventDefault();const values=Object.fromEntries(Object.entries(inputs).map(([k,v])=>[k,v.type==='checkbox'?v.checked:v.value]));try{submit(values);dialog.close()}catch(err){toast(err.message)}};
    dialog.onclose=()=>dialog.remove();dialog.onkeydown=e=>e.stopPropagation();document.body.append(dialog);dialog.showModal();
    queueMicrotask(()=>dialog.querySelectorAll('input[type=date]').forEach(dayFirstField));return inputs;
  }
  function mutate(fn){checkpoint();fn();db.updatedAt=now();markDirty();render();paint()}
  function selectDay(ds,sync=true){
    if(!validDate(ds))return;
    if(ds!==date){offsets.set(date,scroll.scrollTop);date=ds;expanded.clear();selectedSlot=null;selectedKey=null}
    if(pinnedDate&&sync&&!previewing){pinnedDate=ds;savePin()}
    if(previewing&&ds===pinnedDate)previewing=false;paintPin();
    if(sync&&!pinnedDate){calendarCursorDate=ds;weekAnchor=new Date(ds+'T12:00:00');$('jumpDate').value=ds;if(!editorIsOpen()){calendarMode='weeks';renderCalendar();$('calendarBody').querySelector('.day[data-date="'+ds+'"]')?.scrollIntoView({block:'nearest'})}}
    paint();scroll.scrollTop=offsets.get(date)??initialScroll();
  }
  function showSession(block){
    const exists=M.sessions(db,block.date).find(b=>identity(b)===identity(block)&&!b.done);
    if(!exists){toast('This session is no longer available.');renderTree();return}
    open(true);previewing=!!pinnedDate&&pinnedDate!==exists.date;selectDay(exists.date,!pinnedDate);paintPin();
    for(let minute=Math.floor(exists.start/15)*15;minute<exists.start+exists.duration;minute+=15)expanded.add(minute);
    selectedKey=identity(exists);paint();
    requestAnimationFrame(()=>{const target=[...grid.querySelectorAll('.planBlock')].find(n=>n.dataset.identity===selectedKey);if(target){scroll.scrollTop=Math.max(0,target.offsetTop-scroll.clientHeight/3);target.focus({preventScroll:true});flashNavigationElement(target)}});
  }
  function initialScroll(){
    let y=Math.max(0,(date===today()?minutes()-45-first:(db?.planner?.settings?.start??420)-first)*px);
    y=Math.min(y,Math.max(0,scroll.scrollHeight-scroll.clientHeight));
    // Never open half-way into a block: show the whole block that the start position would cut (29).
    for(let moved=true;moved;){moved=false;for(const n of grid.querySelectorAll('.planBlock'))if(n.offsetTop<y&&n.offsetTop+n.offsetHeight>y+2){y=Math.max(0,n.offsetTop-8);moved=true}}
    return y}
  function open(show=true,persist=true){
    if(show&&!db)return toast('Open a library first.');
    if(persist)suspended=false;
    if(persist)try{localStorage.setItem('ytnh-planner-open',String(show))}catch{}
    updateToggle(show);closeMenu();if(!show)offsets.set(date,scroll.scrollTop);
    if(!show){previewing=false;paintPin()}
    pane.hidden=!show;pane.parentElement.classList.toggle('plannerOpen',show);syncSidebarVisibility();
    if(show){if(owner!==db.createdAt){date=today();selectedSlot=null;owner=db.createdAt;offsets.clear()}selectDay(previewing?date:pinnedDate||calendarCursorDate||date,false)}
    updateWritingWidth();
  }
  function setWidth(n){
    n=bound(n,230,720);pane.parentElement.style.setProperty('--planner-width',n+'px');pane.querySelector('.planGrip').setAttribute('aria-valuenow',String(n));
    try{localStorage.setItem('ytnh-planner-width',String(n))}catch{}
  }
  try{const n=Number(localStorage.getItem('ytnh-planner-width'));if(n)setWidth(n)}catch{}
  const grip=pane.querySelector('.planGrip');
  grip.onpointerdown=e=>{e.preventDefault();grip.setPointerCapture(e.pointerId);grip.onpointermove=ev=>setWidth(pane.parentElement.getBoundingClientRect().right-ev.clientX);grip.onlostpointercapture=()=>grip.onpointermove=null};
  grip.onkeydown=e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){setWidth(pane.offsetWidth+(e.key==='ArrowLeft'?10:-10));e.preventDefault();e.stopPropagation()}};
  const toggle=document.createElement('button');toggle.id='plannerToggle';toggle.type='button';toggle.className='editorIconButton';toggle.innerHTML=sidebarIcons.toggle;
  $('yearsMode').after(toggle);
  function updateToggle(show){toggle.title=show?'Hide Daily Planner':'Show Daily Planner';toggle.setAttribute('aria-label',toggle.title);toggle.setAttribute('aria-pressed',String(show))}
  function restore(){let show=false;try{show=localStorage.getItem('ytnh-planner-open')==='true'}catch{}open(Boolean(db&&show),false)}
  toggle.onclick=()=>open(pane.hidden);updateToggle(false);
  window.addEventListener('keydown',e=>{
    if(e.code!=='KeyP'||!e.altKey||!(IS_MAC?e.metaKey:e.ctrlKey)||e.shiftKey||e.isComposing||isTextEntry(e.target)||e.getModifierState?.('AltGraph')||document.querySelector('dialog[open],#modalbg.open'))return;
    e.preventDefault();e.stopImmediatePropagation();if(!e.repeat)open(pane.hidden);
  },true);
  pane.querySelector('input').onchange=e=>selectDay(e.target.value);
  pane.querySelector('header').onclick=e=>{switch(e.target.closest("button")?.dataset.act){
    case 'prev':selectDay(M.shift(date,-1));break;case 'next':selectDay(M.shift(date,1));break;
    case 'pin':previewing=false;pinnedDate=pinnedDate?null:date;savePin();follow(calendarCursorDate||today());break;
  }};
  function add(item,start,from,keepDates=false){
    const save=occ=>mutate(()=>M.session(db,item,date,start,15,occ,from,keepDates));
    if(!isRecurringTodo(item))return save(null);
    if(from&&recurrenceOccurrences(item,from,from).next().value)return save(occurrenceOrigins(item,from)[0]);
    const direct=recurrenceOccurrences(item,date,date).next().value?occurrenceOrigins(item,date):[];if(direct.length===1)return save(direct[0]);
    const dates=[...regularOccurrences(item,M.shift(date,-370),M.shift(date,370))].sort((a,b)=>Math.abs(M.daysBetween(a,date))-Math.abs(M.daysBetween(b,date))).slice(0,12);
    if(!dates.length){dates.push(item.recurrence.startDate)}
    form('Plan Todo occurrence',[['day','Occurrence','select',dates[0],dates.map(d=>[d,displayDay(d)])]],v=>save(v.day));
  }
  function createMenu(e,start){
    closeMenu();selectSlotAt(start,e.clientY);selectedKey=null;pane.querySelector('.planSelected')?.classList.remove('planSelected');paintSlot();
    popup(e.clientX,e.clientY,[
      ['Select Note or Todo',()=>chooseReference(false,i=>add(i,start),{title:'Plan a work session'})],
      ...['Note','Todo'].map(type=>['Create '+type,()=>form('Create '+type,[['title','Title','text','']],v=>{if(!v.title.trim())throw Error('Enter a title.');let id;mutate(()=>{const i=createItem(db,type);id=i.id;i.title=v.title.trim();M.session(db,i,date,start,15,null)});if(zoomRootItem()){branchZoomRoot=branchZoomLocation=null;branchZoomHistory=[];branchZoomCollapsed=false}if($('search').value)closeOutlineSearch(false);revealOutlineItem(id,{focus:true})})]),
      ['Create meeting',()=>DailyMeetingEditor.create(date,start)]
    ]);
  }
  function apply(b,values,x,y){
    if(b.meeting)return DailyMeetingEditor.change(b,values,x,y);
    const save=future=>mutate(()=>{
      M.change(db,b,values,future);
      const item=itemById(db,b.item),origin=b.occurrence||b.origin;
      if(values.done!==undefined&&origin&&item&&isRecurringTodo(item)){
        const day=item.occurrencePostponements?.[origin]||origin;
        setOccurrenceStatus(item,day,values.done?'Done':'Todo');
      }
    });
    if(b.origin&&values.done===undefined)popup(x,y,[['This session only',()=>save(false)],['This and all future sessions',()=>save(true)]]);else save(false);
  }
  function actions(e,b){
    if(b.meeting)return DailyMeetingEditor.menu(e,b);
    const item=itemById(db,b.item),list=[['Move session…',()=>form('Move session',[['date','Date','date',date],['start','Start','time',clock(b.start)]],v=>{const t=snap(parse(v.start));if(t+b.duration>1440)throw Error('Session extends beyond this day.');apply(b,{date:v.date,start:t},e.clientX,e.clientY)})],['Remove session',()=>apply(b,{removed:true},e.clientX,e.clientY)]];
    if(!b.origin&&isRecurringTodo(item||{}))list.unshift(['Repeat with Todo',()=>mutate(()=>M.repeat(db,b.key))]);
    if(item&&!item.archiveFile)list.push(['Copy item code',()=>copyItemCode(item)]);popup(e.clientX,e.clientY,list);
  }
  function attach(node,b){
    node.tabIndex=0;node.setAttribute('role','button');node.dataset.identity=identity(b);
    const openBlock=()=>b.meeting?DailyMeetingEditor.open(b.key):itemById(db,b.item)?edit(b.item):toast('Restore this archived item to edit it.');
    node.ondblclick=openBlock;node.oncontextmenu=e=>{e.preventDefault();actions(e,b)};
    node.onkeydown=e=>{if(e.key==='Enter')openBlock();else if(e.key==='ContextMenu'||(e.shiftKey&&e.key==='F10')){const r=node.getBoundingClientRect();actions({clientX:r.x,clientY:r.y},b)}else return;e.preventDefault();e.stopPropagation()};
    node.onpointerdown=e=>{
      if(e.button!==0||e.target.tagName==='INPUT'||e.target.closest('.itemMarker'))return;
      selectedSlot=null;slotMarker.remove();selectedKey=identity(b);for(const n of pane.querySelectorAll('[data-identity]'))n.classList.toggle('planSelected',n.dataset.identity===selectedKey);
      if(b.allDay)return;
      const y=e.clientY,grabMinute=minuteAt(e),resizing=e.target.classList.contains('planHandle');node.setPointerCapture(e.pointerId);
      let ghost;
      const valuesAt=clientY=>{const d=snap(minuteAt({clientY})-grabMinute);return resizing?{duration:bound(snap(b.duration+d),15,1440-b.start)}:{start:bound(snap(b.start+d),0,1440-b.duration)}};
      function cleanup(){ghost?.remove();node.style.opacity='';node.onpointermove=node.onpointerup=node.onlostpointercapture=null}
      node.onlostpointercapture=cleanup;
      node.onpointermove=ev=>{
        if(!ghost&&Math.abs(ev.clientY-y)<4)return;
        if(!ghost){ghost=document.createElement('div');ghost.className='planDragOutline';node.after(ghost);ghost.style.left=node.offsetLeft+'px';ghost.style.width=node.offsetWidth+'px';node.style.opacity='0'}
        const values=valuesAt(ev.clientY);
        ghost.style.top=(node.offsetTop+(pixelAt(values.start??b.start)-pixelAt(b.start)))+'px';
        ghost.style.height=(values.duration?Math.max(1,pixelAt(b.start+values.duration)-node.offsetTop):node.offsetHeight)+'px';
      };
      node.onpointerup=end=>{const values=valuesAt(end.clientY);cleanup();if(!snap(minuteAt(end)-grabMinute))return;
        apply(b,values,end.clientX,end.clientY);
      };
    };
  }
  const icons={
    meeting:sidebarIcon('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01"/>'),
    note:sidebarIcon('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h6"/>'),
    repeat:sidebarIcon('<path d="m17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4m14-1v2a3 3 0 0 1-3 3H3"/>')
  };
  function blockLabel(node,b,item){
    if(b.meeting)node.insertAdjacentHTML('beforeend',icons.meeting);else if(item){node.insertAdjacentHTML('beforeend',itemMarker(item,{status:b.done?'Done':item.status,planner:true}));const marker=node.lastElementChild;marker.onclick=e=>{e.stopPropagation();if(item.type==='Todo')apply(b,{done:!b.done})};}
    const title=document.createElement('span');title.className='planTitle';title.textContent=b.title||item?.title||'Archived item';node.append(title);
    const meeting=b.meeting&&db.planner.meetings[b.key],version=meeting&&M.versionAt(meeting.versions,b.origin);
    const repeated=meeting?(version?.recurrence||version?.custom||(meeting.pattern&&meeting.pattern!=='Once')):(b.origin||item?.recurrence);
    if(repeated&&meeting){node.insertAdjacentHTML('beforeend',icons.repeat);node.lastChild.classList.add('planRepeat')}
    bindCalendarTooltip(node,()=>title.scrollWidth>title.clientWidth?title.textContent:'');
    return title.textContent;
  }
  function draw({b,lane,count,top,bottom,end,start}){
    const gutter=64;
    const node=document.createElement('div'),i=b.item&&(itemById(db,b.item)||db.archiveIndex.find(a=>a.id===b.item));
    node.className='planBlock '+(b.meeting?'meeting':i?.type||'Note')+(b.done?' complete':'')+(identity(b)===selectedKey?' planSelected':'');
    node.style.top=top+'px';node.style.height=(bottom-top)+'px';node.dataset.part=start;
    node.style.left='calc('+gutter+'px + (100% - '+gutter+'px) * '+lane/count+')';node.style.width='calc((100% - '+gutter+'px) * '+1/count+' - 2px)';

    const label=blockLabel(node,b,i);
    // Blocks tall enough for two lines show their time range under the title (42).
    if(bottom-top>=38){const time=document.createElement('span');time.className='planTime';time.textContent=clock(b.start)+' – '+clock(b.start+b.duration);node.append(time)}
    node.title=(i&&!i.archiveFile?itemCode(db,i)+' · ':'')+label+' · '+clock(b.start)+'–'+clock(b.start+b.duration)+' · '+b.duration+' min';
    if(end===b.start+b.duration){const handle=document.createElement('span');handle.className='planHandle';node.append(handle)}attach(node,b);grid.append(node);
  }
  function drawTimeline(blocks){
    const cap=bound(Math.floor((pane.clientWidth-64)/70),1,3),unit=15*px;
    const priority=b=>b.meeting?0:itemById(db,b.item)?.type==='Note'?1:2;
    blocks.sort((a,b)=>Number(!!a.done)-Number(!!b.done)||priority(a)-priority(b)||a.start-b.start||b.duration-a.duration);
    const assigned=new Map();
    const ordered=[...blocks].sort((a,b)=>a.start-b.start||b.duration-a.duration);
    let cluster=[],until=-1;
    function assignCluster(){
      const lanes=[];
      cluster.sort((a,b)=>Number(!!a.done)-Number(!!b.done)||priority(a)-priority(b)||a.start-b.start||b.duration-a.duration);
      for(const b of cluster){
        let lane=lanes.findIndex(items=>items.every(other=>other.start+other.duration<=b.start||b.start+b.duration<=other.start));
        if(lane<0){lane=lanes.length;lanes.push([])}
        lanes[lane].push(b);assigned.set(b,{lane});
      }
      for(const b of cluster)assigned.get(b).count=lanes.length;
    }
    for(const b of ordered){if(b.start>=until){assignCluster();cluster=[];until=-1}cluster.push(b);until=Math.max(until,b.start+b.duration)}
    assignCluster();
    const parts=[],previous=new Map();quarters=[];
    let top=0;
    for(let start=first;start<last;start+=15){
      const end=start+15,lanes=[];
      for(const block of blocks){
        if(block.start>=end||block.start+block.duration<=start)continue;
        const slot=assigned.get(block);
        while(lanes.length<slot.count)lanes.push([]);
        lanes[slot.lane].push(block);
      }
      const count=Math.min(cap,lanes.length),overflow=lanes.length>cap,open=overflow&&expanded.has(start);
      // Keep continuous leading lanes tall when a long event crosses this quarter.
      let fixed=0;
      if(open)while(fixed<count-1&&lanes[fixed].length===1&&lanes[fixed][0].start<=start&&lanes[fixed][0].start+lanes[fixed][0].duration>=end&&(lanes[fixed][0].start<start||lanes[fixed][0].start+lanes[fixed][0].duration>end))fixed++;
      const rows=open?Math.ceil((lanes.length-fixed)/(count-fixed)):1,height=rows*unit;
      quarters.push({start,top,height});
      if(open){const bg=document.createElement('div');bg.className='planExpanded';bg.style.top=top+'px';bg.style.height=height+'px';grid.append(bg)}
      lanes.slice(0,open?lanes.length:count).forEach((blocks,index)=>{
        const lane=index<fixed?index:fixed+(index-fixed)%(count-fixed);
        const row=index<fixed?0:Math.floor((index-fixed)/(count-fixed));
        const scale=index<fixed?height:unit;
        for(const b of blocks){
          const a=Math.max(start,b.start),z=Math.min(end,b.start+b.duration);
          const y=top+row*unit+(a-start)*scale/15,bottom=top+row*unit+(z-start)*scale/15,prev=previous.get(b);
          if(prev&&prev.end===a&&prev.lane===lane&&prev.count===count&&Math.abs(prev.bottom-y)<0.01){prev.bottom=bottom;prev.end=z}
          else{const part={b,lane,count,start:a,end:z,top:y,bottom};parts.push(part);previous.set(b,part)}
        }
      });
      if(overflow){
        const more=button(open?'−':'+',()=>toggleQuarter(start),grid);more.dataset.quarter=start;
        more.className='planMore';more.style.top=top+'px';more.setAttribute('aria-expanded',String(open));
        more.setAttribute('aria-label',(open?'Collapse':'Expand')+' overlapping blocks at '+clock(start));
      }
      top+=height;
    }
    parts.forEach(draw);
    for(let i=0;i<=quarters.length;i++){
      const t=first+i*15,tick=document.createElement('i');tick.className='planTick'+(t%60===0?' fullHour':'');
      tick.dataset.minute=t;tick.style.top=pixelAt(t)+'px';tick.setAttribute('aria-hidden','true');grid.append(tick);
    }
  }
  function toggleQuarter(start){
    const animate=!matchMedia('(prefers-reduced-motion: reduce)').matches;
    const key=n=>n.dataset.minute??(n.dataset.identity+'@'+n.dataset.part);
    const nodes=()=>grid.querySelectorAll('.planTick,.planBlock');
    const before=animate?new Map([...nodes()].map(n=>[key(n),n.offsetTop])):null;
    if(expanded.has(start))expanded.delete(start);else expanded.add(start);
    paint();
    grid.querySelector('[data-quarter="'+start+'"]')?.focus({preventScroll:true});
    if(before)for(const n of nodes()){const y=before.get(key(n));if(y!=null&&y!==n.offsetTop)n.animate([{transform:'translateY('+(y-n.offsetTop)+'px)'},{transform:'none'}],{duration:125,easing:'ease-out'})}
  }
  function timeLine(){
    grid.querySelector('.planNow')?.remove();const minute=minutes();if(minute<first||minute>=last)return;
    const line=document.createElement('div'),label=document.createElement('span');line.className='planNow';line.style.top=pixelAt(minute)+'px';label.textContent=clock(minute);line.append(label);grid.append(line);
    const height=label.offsetHeight,top=line.offsetTop;
    let y=bound(top-height/2,0,grid.clientHeight-height);
    for(const hour of grid.querySelectorAll('.planHour')){
      const a=hour.offsetTop,b=a+hour.offsetHeight;
      if(y<b+2&&y+height>a-2)y=a-height-2>=0&&top<a+hour.offsetHeight/2?a-height-2:b+2;
    }
    label.style.top=(y-top)+'px';line.style.setProperty('--stem-top',Math.min(0,y+height/2-top)+'px');line.style.setProperty('--stem-height',Math.abs(y+height/2-top)+'px');
  }
  function paint(){
    if(pane.hidden)return;if(!db){open(false,false);return}pane.querySelector('input').value=date;
    const p=db.planner,b=M.sessions(db,date),settings=p?.settings||{};all.replaceChildren();
    for(const [key,m] of Object.entries(p?.meetings||{}))for(const meeting of PlannerMeetings.blocks(m,key,date,zone)){
      if(meeting.allDay){const n=document.createElement('div');n.className='meeting'+(identity(meeting)===selectedKey?' planSelected':'');n.title=blockLabel(n,meeting,null);all.append(n);attach(n,meeting)}else b.push(meeting)
    }
    first=Math.floor(Math.min(settings.start??420,...b.map(s=>s.start),minutes())/60)*60;
    last=Math.min(1440,Math.ceil(Math.max(settings.end??1140,...b.map(s=>s.start+s.duration),minutes()+1)/60)*60);
    grid.replaceChildren();drawTimeline(b);
    grid.style.height=pixelAt(last)+'px';
    for(let t=first;t<last;t+=60){const l=document.createElement('div');l.className='planHour';l.textContent=clock(t);l.style.top=pixelAt(t)+'px';grid.append(l)}
    timeLine();paintSlot();
  }
  function refresh(){if(queued||pane.hidden)return;queued=true;queueMicrotask(()=>{queued=false;paint()})}
  grid.onclick=e=>{if(!e.target.closest('.planBlock,button'))createMenu(e,quarterStart(minuteAt(e)))};
  grid.oncontextmenu=e=>{if(!e.target.closest('.planBlock,button')){e.preventDefault();createMenu(e,quarterStart(minuteAt(e)))}};
  grid.onkeydown=e=>{if(e.target===grid&&e.key==='Enter'){const r=grid.getBoundingClientRect();createMenu({clientX:r.x+50,clientY:scroll.getBoundingClientRect().top+10},selectedSlot??quarterStart(minuteAtOffset(scroll.scrollTop)));e.preventDefault();e.stopPropagation()}};
  function selectSlotAt(start){if(start!==selectedSlot||!slotMarker.isConnected){selectedSlot=start;paintSlot()}}
  function previewDrop(y){
    const start=quarterStart(minuteAt({clientY:y}));selectSlotAt(start);return start;
  }
  function dropItem(id,start,from,keepDates){
    clearSlot();const item=itemById(db,id);if(item)add(item,start,from,keepDates);
  }
  grid.ondragover=e=>{if(draggedItemId||calendarDraggedItemId){e.preventDefault();previewDrop(e.clientY);e.dataTransfer.dropEffect=calendarDropAddsDate(e)?'copy':'move'}};
  grid.ondragleave=e=>{if(!grid.contains(e.relatedTarget))clearSlot()};
  window.addEventListener('dragend',clearSlot);
  grid.ondrop=e=>{e.preventDefault();e.stopPropagation();const cal=e.dataTransfer.getData('application/x-local-calendar-item'),data=cal?JSON.parse(cal):null;
    dropItem(data?.id||e.dataTransfer.getData('text/plain'),quarterStart(minuteAt(e)),data?.from,calendarDropAddsDate(e))};
  scroll.addEventListener('scroll',()=>{if(!pane.hidden&&!timeQueued){timeQueued=true;requestAnimationFrame(()=>{timeQueued=false;timeLine()})}},{passive:true});let timeQueued=false;
  new ResizeObserver(refresh).observe(pane);setInterval(()=>{if(!pane.hidden)timeLine()},30000);
  return {pinnedDate:()=>pinnedDate,captureLayout:()=>({hidden:pane.hidden,suspended,date,previewing,scroll:scroll.scrollTop}),restoreLayout:s=>{if(!s)return;pane.hidden=s.hidden;suspended=s.suspended;date=s.date;previewing=s.previewing;pane.parentElement.classList.toggle("plannerOpen",!s.hidden);updateToggle(!s.hidden);paintPin();paint();scroll.scrollTop=s.scroll;syncSidebarVisibility()},showSession,follow,suspend,resume,previewDrop,clearSlot,dropItem,open,restore,paint,refresh,selectDay,form,mutate,popup,clock,parse,button,zone,get date(){return date},get visible(){return !pane.hidden}};
})();

window.dailyPlanner=DailyPlanner;
if(db)DailyPlanner.restore();
