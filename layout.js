"use strict";
// Pane layout, splitter, focus between panes and date arithmetic helpers.
// Declarations only; loaded before the main script.
function focusPane(name){
 activePane=name;
 if(name==="outline")focusOutlineItem(selected);
 else $("calendarBody").focus({preventScroll:true});
}
function initSplitter(){
 const sp=$("splitter");if(!sp)return;
 let resizedPct=null;

 const finishResize=()=>{
   if(!resizingSplit)return;
   resizingSplit=false;
   document.body.classList.remove("resizing");
   if(!db||resizedPct===null)return;
   // Persist the same CSS percentage shown during dragging, not splitter geometry.
   db.settings=db.settings||{};
   db.settings.outlinePanePct=resizedPct;
   markDirty();
 };

 sp.onpointerdown=e=>{
   e.preventDefault();
   resizingSplit=true;resizedPct=null;
   document.body.classList.add("resizing");
 };

 window.addEventListener("pointermove",e=>{
   if(!resizingSplit)return;
   const rect=$("layout").getBoundingClientRect();
   const pct=Math.max(22,Math.min(55,((e.clientX-rect.left)/rect.width)*100));
   resizedPct=pct;
   $("layout").style.setProperty("--outline-pct",pct+"%");
 });

 window.addEventListener("pointerup",finishResize);
 window.addEventListener("pointercancel",finishResize);
 window.addEventListener("blur",finishResize);
 sp.onclick=()=>finishResize();
}

function editorIsOpen(){return !$("editor").classList.contains("hidden")}
function closeRightEditor(){
  if(!editorIsOpen())return false;
  if(appearance.defaultView==='editor'&&!focusLayout){focusOutlineItem(selected);return true;}
  // Editor-first: Esc in Focus Mode returns to the normal editor layout, never to the Calendar or Targets.
  if(appearance.defaultView==='editor'&&focusLayout){
    const writing=$('editor').contains(document.activeElement);setEditorFocus(false);
    if(!editorIsOpen()&&selected)edit(selected,{keepSearch:true});
    $('layout').dataset.view='editor';activePane='editor';
    if(writing||!$('editor').contains(document.activeElement))$(!$('content').classList.contains('hidden')?'content':'richEditor').focus({preventScroll:true});
    return true;
  }
  syncModelFromRich?.();
  completeSearchAction(selected);showCalendar();
  $("layout").dataset.view="outline";
  setTimeout(()=>focusOutlineItem(selected),0);
  return true;
}
function listNavigationMode(){
  const a=document.activeElement;
  if(isTextEntry(a))return false;
  return true;
}
let outlineCreation=null;
function newOutlineDraft(){
 return {owner:db,location:selectedLocation,before:snapshot(),previous:selected,undo:undoStack.slice(),redo:redoStack.slice(),editorOpen:editorIsOpen()};
}
function quickCreateRoot(type,{heading=false}={}){
  if(!db)return;
  const draft=newOutlineDraft();checkpoint();
  const sibling=itemById(db,selected),parentId=sibling?.id===branchZoomRoot?branchZoomRoot:sibling?.parentId||null;
  const graph=db.locations&&new OutlineLocations(db),spot=graph&&graph.selected(sibling);
  const localParent=spot&&(spot.item.id===branchZoomRoot?spot:graph.nodes.get(spot.parent));
  const i=createItem(db,type,graph?localParent?.item.id||null:parentId,localParent?.id);
  if(heading)i.heading=true;
  if(spot&&spot.item.id!==branchZoomRoot){const after=new OutlineLocations(db);after.move(after.primary(i),spot.parent,graph.siblings(spot.parent).indexOf(spot)+1);after.commit(false)}
  else if(!graph&&sibling&&sibling.id!==branchZoomRoot){const siblings=childrenOf(db,parentId).filter(x=>x.id!==i.id);moveItem(db,i.id,parentId,siblings.findIndex(x=>x.id===sibling.id)+1)}
  outlineCreation={...draft,id:i.id};selected=i.id;completeSearchAction(i.id);
  if(heading)renderTree();else if(appearance.defaultView==='editor')edit(i.id);else showCalendar();revealOutlineItem(i.id);
  startInlineEdit(i.id);
  toast(heading?'Heading created':`${type} created`);
}


let calendarNavigationReveal=null;
function relevantCalendarDate(item){
 const dates=scheduledGroupingDates(item).filter(validDate).sort();
 return dates.find(d=>d>=today())||dates.at(-1)||null;
}
function upcomingItemSessions(){const now=new Date();return PlannerModel.upcoming(db,today(),now.getHours()*60+now.getMinutes())}
// Outline row indicators, right-aligned: calendar (scheduled, non-recurring), repeat (recurring) and clock
// (Daily Planner sessions). Small thin-stroke SVGs; hover lists the dates, click navigates.
const OUTLINE_INDICATOR_ICONS={
 calendar:'<rect x="4" y="5.5" width="16" height="14.5" rx="2.5"/><path d="M8.5 3.5v4M15.5 3.5v4M4 10.5h16"/>',
 repeat:'<path d="m16.5 3.5 3 3-3 3"/><path d="M4.5 11.5v-1a4 4 0 0 1 4-4h11"/><path d="m7.5 20.5-3-3 3-3"/><path d="M19.5 12.5v1a4 4 0 0 1-4 4h-11"/>',
 clock:'<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'
};
function outlineIndicatorIcon(kind){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+OUTLINE_INDICATOR_ICONS[kind]+'</svg>'}
function plannerBlockLabel(block){return displayDay(block.date)+' · '+DailyPlanner.clock(block.start)+'–'+DailyPlanner.clock(block.start+block.duration)}
function itemPlannerBlocks(item,sessions){
 const blocks=[...(sessions.get(item.id)||[])].sort((a,b)=>a.date.localeCompare(b.date)||a.start-b.start);
 return isRecurringTodo(item)?blocks.slice(0,1):blocks;
}
function outlineNavigationIndicators(item,sessions){
 if(item.heading)return '';
 const recurring=isRecurringTodo(item),blocks=itemPlannerBlocks(item,sessions),list=[];
 const button=(kind,label,tip)=>'<button type="button" tabindex="-1" data-outline-navigation="'+kind+'" data-navigation-item="'+esc(item.id)+'" data-tip="'+esc(tip)+'" aria-label="'+esc(label)+'">'+outlineIndicatorIcon(kind)+'</button>';
 if(recurring){
   const next=relevantCalendarDate(item);
   if(next)list.push(button('repeat','Repeats · next '+displayDay(next)+' · Show in Calendar','Next: '+displayDay(next)));
 }else{
   const dates=[...new Set(scheduledGroupingDates(item).filter(validDate))].sort();
   if(dates.length){const shown=dates.slice(0,12).map(displayDay);if(dates.length>12)shown.push('+'+(dates.length-12)+' more');
     // Overdue: an unfinished Todo whose scheduled dates are all in the past. Red is used for nothing else.
     const overdue=item.type==='Todo'&&!['Done','Cancelled'].includes(item.status)&&dates.at(-1)<today();
     list.push(button('calendar',(overdue?'Overdue · ':'')+'Scheduled '+dates.map(displayDay).join(', ')+' · Show in Calendar',(overdue?'Overdue\n':'')+shown.join('\n')).replace('<button ','<button '+(overdue?'class="overdue" ':'')))}
 }
 // The clock sits to the left; the calendar or repeat icon always takes the rightmost place.
 if(blocks.length)list.unshift(button('clock',(recurring?'Next planned session ':'Planned sessions ')+blocks.map(plannerBlockLabel).join(', ')+' · Show in Daily Planner',(recurring?'Next: ':'')+blocks.map(plannerBlockLabel).join('\n')));
 // A clock alone keeps the rightmost column free for a calendar or repeat icon, so the columns line up.
 if(list.length===1&&blocks.length)list.push('<span class="navigationSlot" aria-hidden="true"></span>');
 return list.length?'<span class="outlineNavigation">'+list.join('')+'</span>':'';
}
function flashNavigationElement(element){if(!element)return;element.classList.add('navigationFlash');setTimeout(()=>element.classList.remove('navigationFlash'),2200)}
function showItemInCalendar(item){
 const date=relevantCalendarDate(item);if(!date)return;
 if(editorIsOpen())flushPendingInputs();
 calendarNavigationReveal={owner:db,id:item.id,date};calendarSelectionDate=date;
 expandedWeeks.add(iso(mondayOf(new Date(date+'T12:00:00'))));jumpToDate(date);focusPane('calendar');
 requestAnimationFrame(()=>{const day=$('calendarBody').querySelector('.day[data-date="'+date+'"]');day?.closest('.weekrow')?.scrollIntoView({block:'center'});flashNavigationElement(day?.querySelector('[data-cal-drag-item="'+CSS.escape(item.id)+'"]'))});
}
const plannerIconCycle=new Map();
function showItemInPlanner(item){
 const blocks=itemPlannerBlocks(item,upcomingItemSessions());if(!blocks.length){renderTree();return}
 const key=b=>b.date+'@'+b.start,last=plannerIconCycle.get(item.id),at=blocks.findIndex(b=>key(b)===last);
 const block=blocks[isRecurringTodo(item)||at<0?0:(at+1)%blocks.length];plannerIconCycle.set(item.id,key(block));
 const pinned=window.dailyPlanner?.pinnedDate?.();
 if(pinned&&pinned!==block.date){toast('Planner date is pinned.');return}
 if(editorIsOpen())flushPendingInputs();showCalendar();window.dailyPlanner.showSession(block);
}

let calendarSelectionDate=null;
function revealSelectedInCalendar(){
 if(editorIsOpen()||calendarMode!=='weeks')return;
 const item=itemById(db,selected);if(!item)return;
 const dates=scheduledGroupingDates(item).filter(validDate).sort();
 const date=dates.find(d=>d>=today())||dates.at(-1)||null;
 calendarSelectionDate=date;
 if(date){
   if(!$('calendarBody').querySelector(`.day[data-date="${date}"]`))weekAnchor=new Date(date+'T12:00:00');
   calendarCursorDate=date;$('jumpDate').value=date;expandedWeeks.add(iso(mondayOf(new Date(date+'T12:00:00'))));
 }
 renderCalendar();
 if(date)requestAnimationFrame(()=>{
   if(selected!==item.id||editorIsOpen())return;
   const row=$('calendarBody').querySelector(`.day[data-date="${date}"]`)?.closest('.weekrow');
   row?.scrollIntoView({block:'center',inline:'nearest'});
 });
}
function navigateSelected(delta){
 historyQuietSelection=true;try{navigateSelectedNow(delta)}finally{historyQuietSelection=false}
}
function navigateSelectedNow(delta){
 if(db?.locations){multiLocations.clear();multiSelected.clear();const rows=[...$('tree').querySelectorAll('.row[data-id]')];if(!rows.length)return;const i=rows.indexOf(locationRow(selected)),row=rows[Math.max(0,Math.min(rows.length-1,i<0?0:i+delta))];locationGroup=row.closest('[data-group-key]')?.dataset.groupKey;selectedLocation=row.dataset.location;selected=row.dataset.id;paintOutlineSelection();if(editorIsOpen()||appearance.defaultView==='editor')edit(selected);focusOutlineItem(selected);return}
  const ids=visibleOutlineIds();if(!ids.length)return;let idx=selected?ids.indexOf(selected):-1;if(idx<0)idx=0;else idx=Math.max(0,Math.min(ids.length-1,idx+delta));selected=ids[idx];renderTree();if(editorIsOpen()||appearance.defaultView==='editor')edit(selected);focusOutlineItem(selected);
}
function commitTitleTags(item,value){
 const tags=inlineTags({title:value,content:""});if(!tags.length)return value;
 item.explicitTags=[...new Set([...normalizeTagList(item.explicitTags),...tags])];
 const title=outsideCode(value,part=>part.replace(/(^|[\s(,;])#([\p{L}\p{N}_][\p{L}\p{N}_/-]*)/gu,(whole,prefix,tag)=>tags.includes(normalizeTag(tag))?prefix:whole)).replace(/ {2,}/g,' ').trim()||'Untitled '+item.type;
 if(selected===item.id&&editorIsOpen()){
   renderTagField(item);
 }
 return title;
}
function startInlineEdit(id){
  if(document.activeElement===$("editorTitle"))document.activeElement.blur();
  const existing=$("tree").querySelector(".inlineEdit");
  if(existing){existing.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true}));if(existing.dataset.itemId===id)return}
  const row=locationRow(id),i=itemById(db,id);if(!row||!i)return;const title=row.querySelector(".title");if(!title)return;const draft=outlineCreation?.owner===db&&outlineCreation.id===id?outlineCreation:null;if(!draft)checkpoint();const old=i.title,input=document.createElement("input");input.className="inlineEdit";input.dataset.itemId=id;input.value=old;input.spellcheck=appearance.spellcheck;input.lang=appearance.language;title.replaceWith(input);input.focus();input.select();let finished=false;
  bindTagAutocomplete(input);bindDateAutocomplete(input);
  const finish=(save,commitTags=false)=>{if(finished)return;finished=true;
    if(draft&&outlineCreation===draft){
      outlineCreation=null;
      if(!save){
        selectedLocation=draft.location;selected=draft.previous;undoStack=draft.undo;redoStack=draft.redo;
        restoreSnapshot(draft.before);
        if(draft.editorOpen&&selected)edit(selected);else showCalendar();
        renderTree();focusOutlineItem(selected);return;
      }
    }
    const tagsBefore=JSON.stringify(i.explicitTags||[]);if(save){i.title=commitTags?commitTitleTags(i,input.value):input.value.trim()||i.title;touch(db,i)}else i.title=old;syncVisibleTitle(i);if(save)completeSearchAction(i.id);if(!(tagsBefore===JSON.stringify(i.explicitTags||[])&&!/#/.test(i.title)&&patchRender([i.id],{finishingEdit:true})))renderTree();if(commitTags)focusOutlineItem(i.id);};
  input.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();e.stopPropagation();finish(true,true)}else if(e.key==="Escape"){e.preventDefault();e.stopPropagation();finish(false)}});input.addEventListener("blur",()=>{if(!input.dateRefreshing)finish(true)});
}
function unscheduleExplicit(item,date=null){
 if(!item)return false;
 clearTimeout(codeSingleClickTimer);clearTimeout(calendarSingleClickTimer);
 const before=item.scheduledDates||[],next=date?before.filter(d=>d!==date):[];
 if(next.length===before.length){toast(isRecurringTodo(item)?'No explicit date to remove; recurrence is unchanged.':'This item has no scheduled date.');return false}
 checkpoint();selected=item.id;item.scheduledDates=next;touch(db,item);
 completeSearchAction(item.id);render();if(editorIsOpen())edit(item.id);focusOutlineItem(item.id);
 toast(isRecurringTodo(item)?'Explicit date removed; recurrence is unchanged.':'Unscheduled');return true;
}
function jumpToDate(ds){
  if(calendarMode==='years'&&validDate(ds))calendarMode='weeks';
  if(!validDate(ds))return;const [y,m,d]=ds.split("-").map(Number);if(y<2026||y>2150)return toast("Calendar range is 2026–2150.");weekAnchor=new Date(y,m-1,d||1,12);calendarCursorDate=ds;$("jumpDate").value=ds;setView("calendar");
}

function isoWeek(date){const d=new Date(Date.UTC(date.getFullYear(),date.getMonth(),date.getDate()));const day=d.getUTCDay()||7;d.setUTCDate(d.getUTCDate()+4-day);const y0=new Date(Date.UTC(d.getUTCFullYear(),0,1));return Math.ceil((((d-y0)/86400000)+1)/7)}

function parseCodeReference(database,code){
 const ids=referenceCandidates(database,code);return ids.length===1?itemById(database,ids[0])||null:null;
}
function addMonthsClamped(date,months,day){
  const d=new Date(date.getFullYear(),date.getMonth()+months,1,12);d.setDate(Math.min(day,new Date(d.getFullYear(),d.getMonth()+1,0).getDate()));return d;
}
function dateSerial(d){return Math.floor(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())/86400000)}
function weekdaysInclusive(start,end){
  const total=dateSerial(end)-dateSerial(start)+1;if(total<=0)return 0;
  const full=Math.floor(total/7),rem=total%7;let count=full*5,dow=start.getDay();
  for(let k=0;k<rem;k++){const day=(dow+k)%7;if(day!==0&&day!==6)count++}
  return count;
}

// One click model everywhere: a single click on an item's title selects it and reveals it in the
// Outline (and switches the editor when it is open); a double-click opens its editor. Status only
// changes through the item's marker, never by clicking the title.
function selectAndReveal(id){
 const item=itemById(db,id);if(!item)return;
 clearTimeout(calendarSingleClickTimer);calendarSingleClickTimer=null;
 if(item.archived){selected=id;toast('This item is archived. Restore it from ☰ → Archive… to see it in the Outline.');return}
 revealOutlineItem(id);
 if(editorIsOpen())edit(id);
 document.querySelectorAll('#calendarBody .chip[data-cal-drag-item]').forEach(c=>c.classList.toggle('selected',c.dataset.calDragItem===id));
 multiSelected.clear();paintTargetSelection();
}

// The one item menu, shown on right-click (or the menu key) wherever an item appears.
// date: the day the item was clicked on (its occurrence for repeating Todos, and the date "Remove this date" removes).
function itemMenu(e,item,{date=null,row=null,inOutline=false,inCalendar=false,removeDate=true,extra=[],returnFocus=document.activeElement}={}){
 if(!item)return;e?.preventDefault?.();e?.stopPropagation?.();
 const live=!item.archived,actions=[];
 actions.push(['Open',()=>live?openSelectedInFullEditor(item.id):toast('Restore this archived item to edit it.')]);
 if(!inOutline&&live)actions.push(['Show in Outline',()=>selectAndReveal(item.id)]);
 if(live&&!inCalendar&&relevantCalendarDate(item))actions.push(['Show in Calendar',()=>{selected=item.id;showItemInCalendar(item)}]);
 if(live&&itemPlannerBlocks(item,upcomingItemSessions()).length)actions.push(['Show in Daily Planner',()=>{selected=item.id;showItemInPlanner(item)}]);
 if(item.type==='Todo'&&live){
   const current=date&&isRecurringTodo(item)?occurrenceStatus(item,date):item.status;
   for(const status of TODO_STATUSES)actions.push([(current===status?'✓ ':'')+status,()=>applyTodoStatus(item,status,{date,row})]);
 }
 const dates=item.scheduledDates||[];
 if(live&&removeDate&&date&&dates.includes(date))actions.push(['Remove this date',()=>unscheduleExplicit(item,date)]);
 if(live&&dates.length&&!(removeDate&&date&&dates.length===1&&dates[0]===date))actions.push(['Unschedule all dates',()=>unscheduleExplicit(item)]);
 if(live){const ids=pinnedIds(),pinned=ids.includes(item.id);actions.push([pinned?'Unpin':'Pin to top',()=>savePins(pinned?ids.filter(id=>id!==item.id):[...ids,item.id])])}
 if(live)actions.push(['Move to…',()=>moveItemTo(item.id)]);
 actions.push(['Copy link',()=>copyPlainText(`[[${refToken(item.id)}]]`)]);
 actions.push(...extra);
 const x=e?.clientX??0,y=e?.clientY??0;
 DailyPlanner.popup(x,y,actions,returnFocus);
}

// Keyboard for an item shown outside the Outline: Enter or Shift+Enter opens it, the menu key (or Shift+F10)
// shows the item menu. Returns true when the key was handled.
function itemKeys(e,node,id,{date=null}={}){
 if(e.ctrlKey||e.metaKey||e.altKey)return false;
 const item=itemById(db,id);if(!item)return false;
 if(e.key==='Enter'){openSelectedInFullEditor(id)}
 else if(e.key==='ContextMenu'||(e.shiftKey&&e.key==='F10')){const r=node.getBoundingClientRect();itemMenu({clientX:r.x,clientY:r.bottom},item,{date,returnFocus:node})}
 else return false;
 e.preventDefault();e.stopPropagation();return true;
}

// Backlinks open on a single click (they are a list of places to go), remember the current place for Back,
// and show the item in the Outline.
function openBacklink(id){
 syncModelFromRich?.();rememberEditorLocation();selected=id;edit(id);setView('editor');revealOutlineItem(id);
}

// "Parent › Grandchild" path of an item's ancestors, shown under titles in pickers and lists.
function itemPathText(item){
 const names=[],seen=new Set();
 for(let p=item?.parentId&&itemById(db,item.parentId);p&&!seen.has(p.id);p=p.parentId&&itemById(db,p.parentId)){seen.add(p.id);names.unshift(p.title||'(untitled)')}
 return names.join(' › ');
}

// Move an item under another parent, chosen from the item picker.
function moveItemTo(id){
 const item=itemById(db,id);if(!item||item.archived)return;
 chooseReference(false,(target,meta)=>{
   if(!meta?.created)checkpoint();const codes=codeMapBefore(activeItems(db).map(i=>i.id));moveItem(db,id,target.id);rememberChangedCodes(codes);
   touch(db,item);revealOutlineItem(id);if(editorIsOpen())edit(id);renderCalendar();toast('Moved under “'+(target.title||'(untitled)')+'”');
 },{title:'Move to…',prompt:'Choose the new parent for “'+(item.title||'(untitled)')+'”.',allowCreate:true,filter:i=>i.id!==id&&!isDescendant(db,i.id,id)});
}

// One date format for dates shown as text: 24/11/2026 (date inputs keep the system's own picker format).
function displayDate(isoDate){const d=new Date(String(isoDate).slice(0,10)+'T12:00:00');return isNaN(d)?String(isoDate||''):d.toLocaleDateString('en-GB')}
