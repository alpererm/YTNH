"use strict";
// Calendar: item statuses from the calendar, postponing, and drawing weeks and years.
// Declarations only; loaded before the main script.
let calendarSingleClickTimer=null;
let calendarDraggedItemId=null;
let calendarDraggedFromDate=null;

function setTodoCalendarStatus(item,status){
 if(!item||item.type!=="Todo")return;
 checkpoint();
 setItemCompletionStatus(item,status);
 render();
}
function setOccurrenceCalendarStatus(item,date,status){
 if(!item||item.type!=="Todo"||!date)return;
 checkpoint();
 setOccurrenceStatus(item,date,status);
 renderCalendar();
}

function unfinishedForDay(day){
 const active=status=>status==='Todo'||status==='Waiting for';
 return activeItems(db).filter(item=>item.type==='Todo'&&active(item.status)).flatMap(item=>{
   const explicit=item.scheduledDates.includes(day),occurs=isRecurringTodo(item)&&occurrenceDates(item,day,day).length>0;
   const origins=occurs
     ?occurrenceOrigins(item,day).filter(origin=>active(item.occurrenceStates[origin]||'Todo')):[];
   return (origins.length||explicit&&!occurs)?[{item,explicit,origins}]:[];
 });
}
function postponeUnfinished(day,entries){
 if(!entries.length)return;
 const next=new Date(day+'T12:00:00');next.setDate(next.getDate()+1);const dest=iso(next);
 checkpoint();
 for(const {item,explicit,origins} of entries){
   if(explicit)item.scheduledDates=[...new Set(item.scheduledDates.map(d=>d===day?dest:d))].sort();
   if(origins.length){item.occurrencePostponements??={};for(const origin of origins)item.occurrencePostponements[origin]=dest}
   touch(db,item);
 }
 render();
}
function offerPostponement(){
 const day=today(),entries=unfinishedForDay(day);
 if(!entries.length)return toast('No unfinished Todos scheduled for today.');
 modal('Move unfinished to tomorrow?',`Move ${entries.length} scheduled occurrence${entries.length===1?'':'s'} to tomorrow?`,'Move',()=>{
   if(today()!==day)return offerPostponement();
   postponeUnfinished(day,unfinishedForDay(day));
 });
}
function initCalendarPlanningMenu(){
 const menu=document.createElement('div');menu.className='linkContextMenu hidden';menu.setAttribute('role','menu');
 const action=document.createElement('button');action.textContent='Move unfinished to tomorrow';action.setAttribute('role','menuitem');menu.append(action);document.body.append(menu);
 const close=()=>menu.classList.add('hidden');
 $('calendarBody').addEventListener('contextmenu',e=>{
   if(!db||calendarMode!=='weeks'||e.defaultPrevented)return;
   e.preventDefault();menu.classList.remove('hidden');menu.style.left=Math.max(0,Math.min(e.clientX,innerWidth-menu.offsetWidth))+'px';menu.style.top=Math.max(0,Math.min(e.clientY,innerHeight-menu.offsetHeight))+'px';action.focus();
 });
 action.onclick=()=>{close();offerPostponement()};
 document.addEventListener('pointerdown',e=>{if(!menu.contains(e.target))close()});
 menu.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();$('calendarBody').focus()}};
 menu.onfocusout=close;
}
function scheduleDroppedItems(ids,date,{add=false}={}){
 if(!db||!validDate(date))return false;
 const changes=[...new Set(ids)].map(id=>itemById(db,id)).filter(item=>item&&!item.archived).map(item=>{
   const dates=add?[...new Set([...(item.scheduledDates||[]),date])].sort():[date];
   return {item,dates};
 }).filter(({item,dates})=>JSON.stringify(item.scheduledDates||[])!==JSON.stringify(dates));
 if(!changes.length)return false;
 checkpoint();
 for(const {item,dates} of changes){item.scheduledDates=dates;touch(db,item)}
 render();showCalendar();
 toast(`${add?'Added date for':'Scheduled'} ${changes.length} item${changes.length===1?'':'s'} on ${date}`);
 return true;
}
function moveScheduledDate(item,fromDate,toDate,{add=false}={}){
 if(!item||fromDate===toDate||!(item.scheduledDates||[]).includes(fromDate))return false;
 return scheduleDroppedItems([item.id],toDate,{add});
}

function bindCalendarTooltip(element,label){
 let timer;
 const hide=()=>{clearTimeout(timer);document.getElementById('calendarTooltip')?.remove();element.removeAttribute('aria-describedby')};
 element.onmouseenter=()=>{hide();timer=setTimeout(()=>{
   const message=element.isConnected&&label();if(!message)return;
   const tip=document.createElement('div');tip.id='calendarTooltip';tip.className='calendarTooltip';tip.role='tooltip';tip.textContent=message;document.body.append(tip);element.setAttribute('aria-describedby',tip.id);
   const r=element.getBoundingClientRect();tip.style.left=Math.max(8,Math.min(r.left,innerWidth-tip.offsetWidth-8))+'px';tip.style.top=Math.max(8,Math.min(r.bottom+6,innerHeight-tip.offsetHeight-8))+'px';
 },1000)};
 element.onmouseleave=hide;element.onmousedown=hide;element.onblur=hide;
}
function datedNoteHint(el){toast(`Not scheduled: shown by its ${el.dataset.calDated==='created'?'created':'modified'} date. Drag it to a day to schedule it.`)}
function bindCalendarInteractions(w){
 w.querySelectorAll('.chip[data-cal-drag-item]').forEach(chip=>bindCalendarTooltip(chip,()=>itemById(db,chip.dataset.calDragItem)?.title||''));
 w.querySelectorAll("[data-cal-item]").forEach(el=>{
   // Title: select and reveal; the marker (handled app-wide) is the only way to change status.
   el.onclick=ev=>{ev.stopPropagation();selectAndReveal(el.dataset.calItem)};

   el.ondblclick=ev=>{
     ev.preventDefault();ev.stopPropagation();
     if(calendarSingleClickTimer){clearTimeout(calendarSingleClickTimer);calendarSingleClickTimer=null}
     const item=itemById(db,el.dataset.calItem);if(!item)return;
     openSelectedInFullEditor(item.id);
   };

   // #55: a middle-click on an item in the Calendar removes that date (Undo brings it back).
   el.onmousedown=ev=>{if(ev.button===1)ev.preventDefault()};
   el.onauxclick=ev=>{if(ev.button!==1)return;ev.preventDefault();ev.stopPropagation();if(ev.target.closest('.itemMarker'))return;if(el.dataset.calDated){datedNoteHint(el);return}unscheduleExplicit(itemById(db,el.dataset.calItem),el.dataset.calDate)};
   el.oncontextmenu=ev=>itemMenu(ev,itemById(db,el.dataset.calItem),{date:el.dataset.calDate,inCalendar:true,removeDate:!el.dataset.calDated});
   // Keyboard, as in the Outline: Up/Down select the day's items (and show them in the Outline), Space marks
   // a Todo done, Enter opens, the menu key shows the item menu and Escape returns to the day.
   el.onkeydown=ev=>{
     if(ev.ctrlKey||ev.metaKey||ev.altKey)return;
     const items=[...el.closest('.day').querySelectorAll('[data-cal-item]')],index=items.indexOf(el);
     if(ev.key==='ArrowDown'||ev.key==='ArrowUp'){const next=items[index+(ev.key==='ArrowDown'?1:-1)];if(next)focusCalendarItem(next.dataset.calItem,next.dataset.calDate,{reveal:true})}
     else if(ev.key===' '){const marker=el.querySelector('.itemMarker');if(marker&&el.dataset.calType==='Todo'){markerAction(marker);focusCalendarItem(el.dataset.calItem,el.dataset.calDate)}}
     else if(ev.key==='Escape'){activePane='calendar';$('calendarBody').focus({preventScroll:true})}
     else if((ev.key==='Delete'||ev.key==='Backspace')&&el.dataset.calDated)datedNoteHint(el);
     else if(ev.key==='Delete'||ev.key==='Backspace'){const date=el.dataset.calDate;if(unscheduleExplicit(itemById(db,el.dataset.calItem),date)!==false){activePane='calendar';focusCalendarItem(null,date)||$('calendarBody').focus({preventScroll:true})}}
     else{itemKeys(ev,el,el.dataset.calItem,{date:el.dataset.calDate});return}
     ev.preventDefault();ev.stopPropagation();
   };
   el.onfocus=()=>{activePane='calendar'};
 });

 w.querySelectorAll("[data-occ-item]").forEach(e=>e.onclick=ev=>{
   ev.stopPropagation();
   const i=itemById(db,e.dataset.occItem);
   if(i)openOccurrenceStatus(i,e.dataset.occ)
 });

 w.querySelectorAll('.chip[data-cal-drag-item]').forEach(chip=>chip.oncontextmenu=ev=>itemMenu(ev,itemById(db,chip.dataset.calDragItem),{date:chip.dataset.calDragDate,inCalendar:true,removeDate:!chip.dataset.calDated}));
 // Calendar item drag source: only explicit scheduled dates can be moved.
 w.querySelectorAll('.chip[draggable="true"][data-cal-drag-item]').forEach(chip=>{
   chip.ondragstart=ev=>{
     const id=chip.dataset.calDragItem,from=chip.dataset.calDragDate;
     if(!id||!from)return;
     // #57: a Note shown by its created/modified date isn't scheduled; dropping it on a day schedules it.
     if(chip.dataset.calDated){draggedItemId=id;draggedItemIds=[];chip.classList.add("dragging-calendar");if(ev.dataTransfer){ev.dataTransfer.effectAllowed="all";ev.dataTransfer.setData("text/plain",id)}return}
     calendarDraggedItemId=id;calendarDraggedFromDate=from;
     chip.classList.add("dragging-calendar");
     if(ev.dataTransfer){
       ev.dataTransfer.effectAllowed="all";
       ev.dataTransfer.setData("application/x-local-calendar-item",JSON.stringify({id,from}));
       ev.dataTransfer.setData("text/plain",id);
     }
   };
   chip.ondragend=()=>{
     chip.classList.remove("dragging-calendar");if(chip.dataset.calDated)draggedItemId=null;
     calendarDraggedItemId=null;calendarDraggedFromDate=null;
     document.querySelectorAll(".day.drop-target").forEach(x=>x.classList.remove("drop-target"));
   };
 });

 // A click selects a day; a double-click (or Enter) filters the Outline to it. While the filter is on,
 // it follows the selected day.
 w.querySelectorAll("[data-date]").forEach(e=>{
   e.onclick=ev=>{
     if(ev.target.closest("[data-cal-item],[data-occ-item],[data-expand-week]"))return;
     if((ev.ctrlKey||ev.metaKey)&&(selected||multiSelected.size)){calendarCursorDate=e.dataset.date;window.dailyPlanner?.follow(e.dataset.date);scheduleOn(e.dataset.date,{stayCalendar:true})}
     else selectCalendarDay(e.dataset.date);
   };
   e.ondblclick=ev=>{if(ev.target.closest("[data-cal-item],[data-occ-item],[data-expand-week]"))return;ev.preventDefault();filterOutlineDay(e.dataset.date)};
 });

 w.querySelectorAll(".day[data-date]").forEach(day=>{
   day.ondragenter=ev=>{
     if(draggedItemId||calendarDraggedItemId){ev.preventDefault();if(ev.dataTransfer)ev.dataTransfer.dropEffect=calendarDropAddsDate(ev)?"copy":"move";day.classList.add("drop-target")}
   };
   day.ondragover=ev=>{
     if(draggedItemId||calendarDraggedItemId){
       ev.preventDefault();
       if(ev.dataTransfer)ev.dataTransfer.dropEffect=calendarDropAddsDate(ev)?"copy":"move";
       day.classList.add("drop-target")
     }
   };
   day.ondragleave=ev=>{
     if(!day.contains(ev.relatedTarget))day.classList.remove("drop-target")
   };
   day.ondrop=ev=>{
     ev.preventDefault();ev.stopPropagation();day.classList.remove("drop-target");
     const targetDate=day.dataset.date;

     if(calendarDraggedItemId&&calendarDraggedFromDate){
       const item=itemById(db,calendarDraggedItemId);
       moveScheduledDate(item,calendarDraggedFromDate,targetDate,{add:calendarDropAddsDate(ev)});
       calendarDraggedItemId=null;calendarDraggedFromDate=null;
       return;
     }

     const id=draggedItemId||(ev.dataTransfer&&ev.dataTransfer.getData("text/plain"));
     if(!id)return;
     selected=id;scheduleDroppedItems(draggedItemIds.length?draggedItemIds:[id],targetDate,{add:calendarDropAddsDate(ev)});draggedItemId=null;draggedItemIds=[]
   };
 })
}
function centerCurrentWeekRow({now=false}={}){
 const row=$("calendarBody")?.querySelector(".weekrow.current-week");
 if(!row)return;
 const center=()=>row.scrollIntoView({block:"center",inline:"nearest",behavior:"auto"});
 if(now)center();else requestAnimationFrame(center);
}

// A collapsed week shows at most this many items per day; the rest appear when the week is expanded.
const CALENDAR_DAY_VISIBLE=5;

function renderWeekCalendar(w){
 const state=calendarSharedFilterState(),milestonesByWeek=new Map();
 for(const item of activeItems(db))if(isMilestone(item)&&calendarItemMatchesTextTags(item,state)&&calendarItemMatchesType(item,state)&&calendarStatusMatches(item,item.status,state)){
   const key=item.milestone.targetWeek;if(!milestonesByWeek.has(key))milestonesByWeek.set(key,[]);milestonesByWeek.get(key).push(item);
 }
 const days=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"],anchor=clampCalendarDate(weekAnchor),start=weekWindowStart(anchor);
 let h=`<div class="weekview ${weekendsHidden()&&!(selected&&calendarSelectionDate&&isWeekendDateString(calendarSelectionDate))&&!(calendarNavigationReveal?.owner===db&&calendarNavigationReveal.date===calendarCursorDate&&isWeekendDateString(calendarCursorDate))?"hide-weekends":""}"><div class="weekheader"><div>Week</div>${days.map(x=>`<div>${x}</div>`).join("")}</div>`;
 for(let widx=0;widx<21;widx++){
   const mon=new Date(start);mon.setDate(start.getDate()+widx*7);const key=iso(mon),expanded=expandedWeeks.has(key),dayData=[];
   let total=0;
   for(let j=0;j<7;j++){const d=new Date(mon);d.setDate(mon.getDate()+j);const entries=inCalendarRangeDate(d)?calendarEntries(iso(d)):[];dayData.push({d,entries});total+=entries.length}
   const overflow=dayData.some(x=>x.entries.length>CALENDAR_DAY_VISIBLE);
   const milestoneWeek=isoWeekKey(key),milestones=milestonesByWeek.get(milestoneWeek)||[];
   const currentWeekKey=iso(mondayOf(new Date()));h+=`<div class="weekrow ${milestones.length?"has-milestones":""} ${expanded?"expanded":""} ${key===currentWeekKey?"current-week":""}" data-week="${key}"><div class="weeknum weekcontrol"><strong>${isoWeek(mon)}</strong>${isoWeek(mon)===1?`<small class="weekYear">${new Date(mon.getFullYear(),mon.getMonth(),mon.getDate()+3).getFullYear()}</small>`:""}${overflow?`<button data-expand-week="${key}" aria-label="${expanded?"Collapse":"Expand"} busy week" title="${expanded?"Show at most "+CALENDAR_DAY_VISIBLE+" items per day":"Show all items this week"}">${expanded?"−":"+"}</button>`:""}</div>`;
   dayData.forEach(({d,entries},idx)=>{
     const shown=expanded?entries:entries.slice(0,CALENDAR_DAY_VISIBLE),hidden=entries.length-shown.length;
     h+=calendarDayHTML(d,{entries:shown,limit:Infinity,hiddenCount:hidden,weekKey:key,showMonth:widx===0}) // the month only where it changes (and on the first row)
   });
   h+=milestoneStripHTML(milestoneWeek,milestones)+"</div>"
 }
 w.innerHTML=h+"</div>";
 $("weeksEarlier").disabled=anchor<=CAL_MIN_DATE;
 $("weeksLater").disabled=anchor>=CAL_MAX_DATE;
 $("weeksEarlier").onclick=()=>{const d=new Date(anchor);d.setDate(d.getDate()-10*7);weekAnchor=clampCalendarDate(d);calendarCursorDate=iso(weekAnchor);$("jumpDate").value=calendarCursorDate;renderCalendar()};
 $("weeksLater").onclick=()=>{const d=new Date(anchor);d.setDate(d.getDate()+10*7);weekAnchor=clampCalendarDate(d);calendarCursorDate=iso(weekAnchor);$("jumpDate").value=calendarCursorDate;renderCalendar()};
 w.querySelectorAll("[data-expand-week]").forEach(b=>b.onclick=ev=>{ev.stopPropagation();const k=b.dataset.expandWeek;expandedWeeks.has(k)?expandedWeeks.delete(k):expandedWeeks.add(k);renderCalendar()});
 bindCalendarInteractions(w);bindMilestoneInteractions(w)
}
function assignTargetLanes(items){
 const lanes=new Map(),ends=[];
 const sorted=items.filter(i=>i.type==='Todo'&&i.target).sort((a,b)=>
   a.target.startMonth.localeCompare(b.target.startMonth)||a.target.endMonth.localeCompare(b.target.endMonth)||a.id.localeCompare(b.id));
 for(const item of sorted){
   let lane=ends.findIndex(end=>end<item.target.startMonth);
   if(lane<0)lane=ends.length;
   ends[lane]=item.target.endMonth;
   lanes.set(item.id,lane);
 }
 return lanes;
}
function targetSegmentsForYear(items,year,laneMap=assignTargetLanes(items)){
 const start=String(year).padStart(4,'0')+'-01',end=String(year).padStart(4,'0')+'-12';
 const segments=[];
 let lanes=1;
 for(const item of items){
   const target=item.target;
   if(!laneMap.has(item.id)||target.startMonth>end||target.endMonth<start)continue;
   const fromPrevious=target.startMonth<start,intoNext=target.endMonth>end,lane=laneMap.get(item.id);
   segments.push({item,lane,fromPrevious,intoNext,start:fromPrevious?1:Number(target.startMonth.slice(5)),end:intoNext?12:Number(target.endMonth.slice(5))});
   lanes=Math.max(lanes,lane+1);
 }
 segments.sort((a,b)=>a.start-b.start||a.lane-b.lane||a.item.id.localeCompare(b.item.id));
 return {segments,lanes};
}
function yearsFilteredTargets(){
 // Calendar's item-level predicate deliberately excludes scheduled-date ranges.
 const state=calendarSharedFilterState();return activeItems(db).filter(i=>i.type==='Todo'&&i.target&&calendarItemMatchesTextTags(i,state)&&calendarItemMatchesType(i,state)&&calendarStatusMatches(i,i.status,state));
}
function setYearsPage(year){yearsPageStart=Math.max(1,Math.min(9995,year));renderCalendar();focusPane('calendar')}
function renderYearsCalendar(w){
 const targets=yearsFilteredTargets().filter(i=>i.target.startMonth<=String(yearsPageStart+4).padStart(4,'0')+'-12'&&i.target.endMonth>=String(yearsPageStart).padStart(4,'0')+'-01');
 const laneMap=assignTargetLanes(targets),counts=new Map(targets.map(item=>[item.id,milestoneCounter(item)])),months=Array.from({length:12},(_,m)=>shortMonthName(new Date(2026,m,1)));
 w.innerHTML=`<div class="yearsScroll"><div class="yearsGrid"><div class="yearsMonths"><span>Year</span><div>${months.map(m=>`<span>${esc(m)}</span>`).join('')}</div></div>${Array.from({length:5},(_,offset)=>{
   const year=yearsPageStart+offset,{segments,lanes}=targetSegmentsForYear(targets,year,laneMap);
   return `<section class="targetYear" data-year="${year}"><h3>${year}</h3><div class="targetLanes" data-lanes="${lanes}">${segments.map(({item,start,end,lane,fromPrevious,intoNext})=>{
     const count=counts.get(item.id),overdue=targetOverdue(item),label=`${item.title||'(untitled)'} · ${outlineTargetRange(item.target)}${overdue?' · Overdue target':''}${count?' · '+String(count).replace('/',' of ')+' milestones done':''}`;
     return `<button type="button" class="targetBar ${fromPrevious?'continues-in':''} ${intoNext?'continues-out':''} ${statusClass(item.status)} ${overdue?'targetOverdue':''}" data-target-id="${esc(item.id)}" data-selected="${selected===item.id||multiSelected.has(item.id)}" data-start-month="${start}" data-end-month="${end}" data-lane="${lane}" aria-label="${esc(label)}" title="${esc(label)}">${itemMarker(item,{nested:true})}<span>${overdue?'⚑ ':''}${esc(item.title||'(untitled)')}</span>${count?`<span class="milestoneCount" aria-label="${String(count).replace('/',' of ')} milestones done">${count}</span>`:''}</button>`;
   }).join('')}</div></section>`;
 }).join('')}</div></div>`;
 // CSSOM preserves dynamic layout under the desktop Content Security Policy.
 w.querySelectorAll('.targetLanes').forEach(el=>{el.style.gridTemplateRows=`repeat(${Number(el.dataset.lanes)},32px)`});
 w.querySelectorAll('.targetBar').forEach(el=>{el.style.gridColumn=`${Number(el.dataset.startMonth)} / ${Number(el.dataset.endMonth)+1}`;el.style.gridRow=String(Number(el.dataset.lane)+1)});
 $('yearsPrevious').onclick=()=>setYearsPage(yearsPageStart-1);$('yearsNext').onclick=()=>setYearsPage(yearsPageStart+1); // #37: one year per click; Page Up/Down move five
 w.querySelectorAll('[data-target-id]').forEach(button=>{button.onclick=e=>{e.stopPropagation();selectAndReveal(button.dataset.targetId)};button.ondblclick=()=>openSelectedInFullEditor(button.dataset.targetId);button.oncontextmenu=e=>itemMenu(e,itemById(db,button.dataset.targetId));button.onkeydown=e=>itemKeys(e,button,button.dataset.targetId)});
}
function updateCalendarModeControls(){
 for(const [id,mode] of [['weekMode','weeks'],['yearsMode','years']])$(id).classList.toggle('primary',calendarMode===mode);
 $('weeksNavigation').classList.toggle('hidden',calendarMode==='years');$('yearsNavigation').classList.toggle('hidden',calendarMode!=='years');
 $('yearsPrevious').disabled=yearsPageStart<=1;$('yearsNext').disabled=yearsPageStart>=9995;
 $('jumpDate').classList.toggle('hidden',calendarMode==='years');{const label=calendarMode==='years'?'This year':'Today';$('today').setAttribute('aria-label',label);$('today').title=label+(IS_MAC?' (⌥⇧T)':' (Alt+Shift+T)')}
 $('calendarPeriodTitle').disabled=calendarMode==='years';
}
let renderedCalendarMode=null;
function renderCalendar(){
 const pane=$("calendarBody");
 if(renderedCalendarMode&&renderedCalendarMode!==calendarMode){pane.classList.remove('viewEnter');void pane.offsetWidth;pane.classList.add('viewEnter')}
 renderedCalendarMode=calendarMode;
 // The Daily Planner belongs to day planning: hide it in Targets, bring it back in Calendar (30).
 if(calendarMode==='years')window.dailyPlanner?.suspend();else if(!editorIsOpen())window.dailyPlanner?.resume();
 window.dailyPlanner?.follow(calendarCursorDate);
 const top=pane.scrollTop,left=pane.scrollLeft;
 try{renderCalendarContents()}finally{pane.scrollTop=top;pane.scrollLeft=left}
 updateCalendarPeriodTitle();
}
// Header title (42): the month in view ("November 2026"), or the five-year range in Targets.
function updateCalendarPeriodTitle(){
 const el=$('calendarPeriodTitle');if(!el)return;
 if(calendarMode==='years'){el.textContent=yearsPageStart+' – '+(yearsPageStart+4);return}
 const pane=$('calendarBody'),line=pane.getBoundingClientRect().top+pane.clientHeight/3;
 const row=[...pane.querySelectorAll('.weekrow[data-week]')].find(r=>r.getBoundingClientRect().bottom>line);
 if(!row){el.textContent='';return}
 const thursday=new Date(row.dataset.week+'T12:00:00');thursday.setDate(thursday.getDate()+3);
 el.textContent=thursday.toLocaleDateString('en-GB',{month:'long',year:'numeric'});
}

// Moves keyboard focus to an item on a day (the first one when no item is given).
function focusCalendarItem(id,date,{reveal=false}={}){
 const day=$('calendarBody').querySelector(`.day[data-date="${date}"]`);if(!day)return false;
 const el=(id&&day.querySelector(`[data-cal-item="${CSS.escape(id)}"]`))||day.querySelector('[data-cal-item]');
 if(!el)return false;
 if(reveal){selectAndReveal(el.dataset.calItem);return focusCalendarItem(el.dataset.calItem,date)}
 el.focus({preventScroll:true});el.scrollIntoView({block:'nearest'});return true;
}
