"use strict";
// Library data model: item codes, migration, validation, tags, hierarchy and Markdown conversion.
// Declarations only; loaded before the main script.
// v9 display codes are positional; UUIDs remain the permanent reference identity.
const ROOT_NUM_MAX=999;
const TOTAL_ROOT_IDS=998001;
function rootIdFromOrdinal(n){
 if(!Number.isSafeInteger(n)||n<1||n>TOTAL_ROOT_IDS)throw new Error('This library has reached the maximum of 998,001 items, or an item number is invalid.');
 return `${String(Math.floor((n-1)/999)+1).padStart(3,'0')}.${String((n-1)%999+1).padStart(3,'0')}`;
}
function rootOrdinalFromId(id){
 if(typeof id!=='string'||!/^\d{3}\.\d{3}$/.test(id))return 0;
 const [a,b]=id.split('.').map(Number);return a>=1&&a<=999&&b>=1&&b<=999?(a-1)*999+b:0;
}
function validateRootId(id){return rootOrdinalFromId(id)>0}
function storedItemCode(database,item){
 if(database.locations){let current=item;while(current){if(current.locationParent){const g=locationsForRead(database);return g.code(g.primary(item))}current=current.parentId&&itemById(database,current.parentId)}}
 const root=rootOf(database,item),positions=[];let current=item;
 while(current.id!==root.id){positions.unshift(current.order);current=itemById(database,current.parentId)}
 return root.rootId+(positions.length?'.'+positions.join('.'):'');
}
function itemSearchCodes(database,item,locations=null){
 if(database.locations){const g=locations||locationsForRead(database);return [...(g.byItem.get(item.id)||[]).map(p=>g.code(p)),...(item.codeAliases||[])].join(' ')}
 return [itemCode(database,item),...(item.codeAliases||[]),...Object.entries(database.linkAliases||{}).filter(([,id])=>id===item.id).map(([code])=>code)].join(' ');
}
function numericCodeRoot(code){return String(code||'').match(/^(\d{3}\.\d{3})(?:\.[1-9]\d*)*$/)?.[1]||null}
// Load the shared numeric RootID format without rewriting IDs or references.
function migrateDatabase(input){
 if(!input||input.format!=='local-notes-todos')throw new Error('This file is not a YTNH library.');
 if(![9,10,11].includes(input.schemaVersion))throw new Error('Unsupported library format. Open a YTNH library that uses data format 9, 10 or 11.');
 const next=JSON.parse(JSON.stringify(input));
 validateDatabase(next);reconcileAllocator(next);
 // Schema 9 already uses current RootIDs; only the optional Targets field differs.
 if(next.schemaVersion===9){
   for(const item of next.items)item.target=null;
   next.schemaVersion=10;validateDatabase(next);
   Object.defineProperty(next,'__migratedFromSchema',{value:9,enumerable:false,configurable:true});
 }
 return next;
}

const TODO_STATUSES=["Todo","Done","Cancelled","Waiting for","On hold"];
const now=()=>new Date().toISOString();
const uuid=()=>crypto.randomUUID?crypto.randomUUID():"id-"+Date.now()+"-"+Math.random().toString(36).slice(2);

function createEmptyDatabase(){
 return {format:"local-notes-todos",schemaVersion:10,createdAt:now(),updatedAt:now(),nextRootOrdinal:1,reusableRootOrdinals:[],settings:{hideWeekends:true,hideRecurring:false,groupBy:"",theme:"light"},linkAliases:{},archiveIndex:[],items:[],recurrenceSeries:[]};
}

// Optional metadata extends schema 10; legacy items can omit milestone entirely.
function isoWeekKey(ds){
 const d=new Date(ds+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+4-(d.getUTCDay()||7));
 const year=d.getUTCFullYear(),first=new Date(d);first.setUTCMonth(0,1);
 return String(year).padStart(4,'0')+'-W'+String(Math.ceil(((d-first)/86400000+1)/7)).padStart(2,'0');
}
function milestoneMonday(week){
 if(typeof week!=='string'||!/^(?!0000)\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/.test(week))return null;
 const year=Number(week.slice(0,4)),n=Number(week.slice(6));
 const d=new Date('2000-01-04T12:00:00Z');d.setUTCFullYear(year);d.setUTCDate(d.getUTCDate()-(d.getUTCDay()||7)+1+(n-1)*7);
 const ds=d.toISOString().slice(0,10);return isoWeekKey(ds)===week?ds:null;
}
function validMilestone(value){return value===null||!!(value&&typeof value==='object'&&!Array.isArray(value)&&milestoneMonday(value.targetWeek))}
function isMilestone(item){return item?.type==='Todo'&&!!item.milestone}
function milestoneOverdue(item,ds=today()){
 if(!isMilestone(item)||['Done','Cancelled'].includes(item.status))return false;
 const monday=milestoneMonday(item.milestone.targetWeek);if(!monday)return false;
 const end=new Date(monday+'T12:00:00Z');end.setUTCDate(end.getUTCDate()+6);return ds>end.toISOString().slice(0,10);
}
function nearestPlanningAncestor(item,predicate){
 if(db?.locations&&item){const g=locationsForRead(db);for(const p of g.byItem.get(item.id)||[]){const a=g.chain(p).slice(0,-1).reverse().find(n=>!n.item.archived&&predicate(n.item));if(a)return a.item}return null}
 const seen=new Set();let parent=item?.parentId;
 while(parent&&!seen.has(parent)){seen.add(parent);const p=itemById(db,parent);if(!p||p.archived)return null;if(predicate(p))return p;parent=p.parentId}return null;
}
function milestoneCounter(target){
 const g=db.locations?locationsForRead(db):null;
 const items=g?activeItems(db).filter(i=>isMilestone(i)&&g.byItem.get(i.id).some(p=>g.chain(p).slice(0,-1).reverse().find(a=>a.item.target)?.item.id===target.id)):activeItems(db).filter(i=>isMilestone(i)&&nearestPlanningAncestor(i,p=>p.type==='Todo'&&!!p.target)?.id===target.id);
 return items.length?`${items.filter(i=>i.status==='Done').length}/${items.length}`:'';
}
let milestoneSelection=null,milestoneDraggedId=null;
function paintMilestoneSelection(){
 const current=milestoneSelection&&itemById(db,milestoneSelection);
 if(!current||current.archived||!isMilestone(current))milestoneSelection=null;
 $('calendarBody').querySelectorAll('[data-milestone-id]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.milestoneId===milestoneSelection)));
 $('calendarBody').querySelectorAll('.chip[data-cal-drag-item]').forEach(chip=>{
   const related=milestoneSelection&&nearestPlanningAncestor(itemById(db,chip.dataset.calDragItem),isMilestone)?.id===milestoneSelection;
   chip.classList.toggle('milestone-related',!!related);chip.classList.toggle('milestone-unrelated',!!milestoneSelection&&!related);
 });
}
function setMilestoneWeek(id,week){
 const item=itemById(db,id);if(!isMilestone(item)||item.archived||!milestoneMonday(week)||item.milestone.targetWeek===week)return;
 checkpoint();item.milestone={targetWeek:week};touch(db,item);renderTree();renderCalendar();
 if(editorIsOpen()&&selected===id)renderMilestoneControls(item);
}
function milestoneStripHTML(week,items){
 if(!items.length)return '';
 return `<div class="milestoneStrip" aria-label="Milestones for ${weekLabel(week)}">${items.map(item=>{
 const label=`${item.title||'(untitled)'} · ${weekLabel(week)} · ${item.status}${milestoneOverdue(item)?' · Overdue':''}`;
 return `<button type="button" draggable="true" class="milestoneChip ${statusClass(item.status)} ${milestoneOverdue(item)?'milestone-overdue':''}" data-milestone-id="${esc(item.id)}" aria-pressed="${item.id===milestoneSelection}" title="${esc(label)}" aria-label="${esc(label)}">${itemMarker(item)}<span class="milestoneTitle">${esc(item.title||'(untitled)')}</span></button>`
 }).join('')}</div>`;
}
function bindMilestoneInteractions(w){
 w.querySelectorAll('[data-milestone-id]').forEach(button=>{
   bindCalendarTooltip(button,()=>button.getAttribute('aria-label'));
   button.onclick=e=>{e.stopPropagation();const id=button.dataset.milestoneId;milestoneSelection=milestoneSelection===id?null:id;selectAndReveal(id);paintMilestoneSelection()};
   button.ondblclick=e=>{e.preventDefault();e.stopPropagation();openSelectedInFullEditor(button.dataset.milestoneId)};
   button.oncontextmenu=e=>itemMenu(e,itemById(db,button.dataset.milestoneId));
   button.onkeydown=e=>{if(e.code==='Space'){e.preventDefault();e.stopPropagation();button.click()}else itemKeys(e,button,button.dataset.milestoneId)};
   button.ondragstart=e=>{milestoneDraggedId=button.dataset.milestoneId;e.stopPropagation();if(e.dataTransfer){e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('application/x-yutanohe-milestone',milestoneDraggedId)}};
   button.ondragend=()=>{milestoneDraggedId=null;w.querySelectorAll('.milestone-drop').forEach(r=>r.classList.remove('milestone-drop'))};
 });
 w.querySelectorAll('.weekrow').forEach(row=>{
   row.addEventListener('dragover',e=>{if(!milestoneDraggedId)return;e.preventDefault();e.stopPropagation();if(e.dataTransfer)e.dataTransfer.dropEffect='move';row.classList.add('milestone-drop')},true);
   row.addEventListener('dragleave',e=>{if(!row.contains(e.relatedTarget))row.classList.remove('milestone-drop')});
   row.addEventListener('drop',e=>{if(!milestoneDraggedId)return;e.preventDefault();e.stopPropagation();const id=milestoneDraggedId;milestoneDraggedId=null;row.classList.remove('milestone-drop');setMilestoneWeek(id,isoWeekKey(row.dataset.week))},true);
 });
 paintMilestoneSelection();
}

function validMonth(value){return typeof value==='string'&&/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(value)}
function validTarget(target){return target===null||!!(target&&typeof target==='object'&&!Array.isArray(target)&&validMonth(target.startMonth)&&validMonth(target.endMonth)&&target.startMonth<=target.endMonth)}
function targetOverdue(item,month=today().slice(0,7)){return !!(item.type==='Todo'&&item.target&&item.target.endMonth<month&&!['Done','Cancelled'].includes(item.status))}
function validDate(value){
 if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const d=new Date(value+"T12:00:00Z");return Number.isFinite(+d)&&d.toISOString().slice(0,10)===value;
}
function validateHierarchy(items,allowExternal=false){
 const byId=new Map();
 for(const i of items){
   if(!i||typeof i.id!=="string"||!/^[A-Za-z0-9_-]{1,160}$/.test(i.id)||byId.has(i.id))throw new Error("Invalid or duplicate item ID.");
   byId.set(i.id,i);
 }
 const depths=new Map();
 for(const i of items){
   const seen=new Set(),path=[];let x=i;
   while(x&&!depths.has(x.id)){
     if(seen.has(x.id))throw new Error("Hierarchy cycle detected.");seen.add(x.id);path.push(x.id);
     if(x.parentId!=null&&(typeof x.parentId!=="string"||!byId.has(x.parentId))){if(!allowExternal)throw new Error("Missing parent.");x=null;break}
     x=byId.get(x.parentId);
   }
   let depth=x?depths.get(x.id):0;
   for(const id of path.reverse()){if(++depth>256)throw new Error("Hierarchy exceeds the supported depth of 256.");depths.set(id,depth)}
 }

}
function validateItem(i){
 if(!["Note","Todo"].includes(i.type)||typeof i.title!=="string"||typeof i.content!=="string")throw new Error("Invalid item fields.");
 if(!Number.isSafeInteger(i.order)||i.order<1)throw new Error("Invalid sibling order.");
 if(!Array.isArray(i.scheduledDates)||i.scheduledDates.some(d=>!validDate(d)))throw new Error("Invalid scheduled dates.");
 if(!Array.isArray(i.explicitTags)||i.explicitTags.some(t=>typeof t!=="string"))throw new Error("Invalid tags.");
 if(i.tagExclusions!==undefined&&(!Array.isArray(i.tagExclusions)||i.tagExclusions.some(t=>typeof t!=="string")))throw new Error("Invalid inherited-tag exclusions.");
 if(!Array.isArray(i.codeAliases)||i.codeAliases.some(t=>typeof t!=="string"))throw new Error("Invalid code aliases.");
 if(!TODO_STATUSES.includes(i.status)||typeof i.archived!=="boolean")throw new Error("Invalid item status.");
 if(!Number.isFinite(Date.parse(i.createdAt))||!Number.isFinite(Date.parse(i.updatedAt)))throw new Error("Invalid timestamps.");
 if(i.target!==undefined&&(!validTarget(i.target)||(i.type!=="Todo"&&i.target!==null)))throw new Error("Invalid target window: Todos only, with start month no later than end month.");
 if(i.milestone!==undefined&&(!validMilestone(i.milestone)||(i.type!=="Todo"&&i.milestone!==null)))throw new Error("Invalid milestone: Todos only, with a valid ISO Target Week (YYYY-Www).");
 const r=i.recurrence;
 if(r&&(!["daily","weekdays","weekly","monthly"].includes(r.frequency)||!Number.isSafeInteger(r.interval)||r.interval<1||!validDate(r.startDate)))throw new Error("Invalid recurrence.");
 if(r?.weekDays!==undefined&&(!Array.isArray(r.weekDays)||!r.weekDays.length||r.weekDays.some(d=>!Number.isInteger(d)||d<0||d>6)||new Set(r.weekDays).size!==r.weekDays.length))throw new Error("Select at least one valid weekday.");
 if(r?.monthlyMode!==undefined&&!['date','relative'].includes(r.monthlyMode))throw new Error("Invalid monthly pattern.");
 if(r?.dayOfMonth!==undefined&&(!Number.isInteger(r.dayOfMonth)||r.dayOfMonth<1||r.dayOfMonth>31))throw new Error("Invalid monthly day.");
 if(r?.monthlyMode==='relative'&&(![1,2,3,4,-1].includes(r.ordinal)||!['day','weekday','weekend','0','1','2','3','4','5','6'].includes(r.dayKind)))throw new Error("Invalid relative monthly pattern.");
 if(i.occurrencePostponements!==undefined&&(!i.occurrencePostponements||typeof i.occurrencePostponements!=='object'||Array.isArray(i.occurrencePostponements)||Object.entries(i.occurrencePostponements).some(([origin,dest])=>!validDate(origin)||!validDate(dest)||dest<=origin)))throw new Error('Invalid occurrence postponement.');
 if(!i.occurrenceStates||typeof i.occurrenceStates!=="object"||Array.isArray(i.occurrenceStates)||Object.entries(i.occurrenceStates).some(([d,status])=>!validDate(d)||!TODO_STATUSES.includes(status)))throw new Error("Invalid occurrence states.");
}
function validateDatabase(db){
 if(db?.planner!==undefined)PlannerModel.validate(db);
 if(!db||![9,10,11].includes(db.schemaVersion)||!Array.isArray(db.items)||!Array.isArray(db.archiveIndex))throw new Error("This file is damaged or isn’t a YTNH library.");
 validateHierarchy(db.items);
 if(db.schemaVersion===11){if(!db.locations||typeof db.locations!=='object'||Array.isArray(db.locations))throw Error('Missing Outline locations.');new OutlineLocations(db).validate(true)}
 else if(db.locations||db.items.some(i=>i.locationId||i.locationParent))throw Error('Linked locations require schema 11.');
 const roots=new Set(),orders=new Set(),ids=new Set(db.items.map(i=>i.id)),byId=new Map(db.items.map(i=>[i.id,i]));
 for(const i of db.items){
   validateItem(i);
   if(!i.archived){
     if(i.parentId&&byId.get(i.parentId)?.archived)throw new Error("Active item has an archived parent.");
     const key=(i.locationParent||i.parentId||"root")+":"+i.order;if(!db.locations&&orders.has(key))throw new Error("Duplicate active sibling order.");orders.add(key);
   }
   if(!i.parentId){
     if(!validateRootId(i.rootId))throw new Error("Invalid RootID.");
     const key=i.rootId;if(roots.has(key))throw new Error("Duplicate RootID.");roots.add(key);
   }else if(i.rootId!=null)throw new Error("Child item has a RootID.");
 }
 const next=db.nextRootOrdinal,pool=db.reusableRootOrdinals;
 if(!Number.isSafeInteger(next)||next<1||next>TOTAL_ROOT_IDS+1||!Array.isArray(pool)||pool.some(n=>!Number.isSafeInteger(n)||n<1||n>=next||n>TOTAL_ROOT_IDS)||new Set(pool).size!==pool.length)throw new Error("Invalid shared RootID allocator.");
 const coldIds=new Set();
 for(const e of db.archiveIndex){
   if(!e||typeof e.id!=="string"||!/^[A-Za-z0-9_-]{1,160}$/.test(e.id)||ids.has(e.id)||coldIds.has(e.id)||!["Note","Todo"].includes(e.type)||typeof e.code!=="string"||typeof e.title!=="string"||typeof e.archiveFile!=="string"||!Array.isArray(e.tags)||e.tags.some(t=>typeof t!=="string"))throw new Error("Invalid cold archive index.");
   if(e.codeAliases!==undefined&&(!Array.isArray(e.codeAliases)||e.codeAliases.some(c=>typeof c!=="string")))throw new Error("Invalid cold archive aliases.");
   coldIds.add(e.id);
 }
 if(!db.linkAliases||typeof db.linkAliases!=="object"||Array.isArray(db.linkAliases)||Object.values(db.linkAliases).some(id=>typeof id!=="string"||!/^[A-Za-z0-9_-]{1,160}$/.test(id)))throw new Error("Invalid reference aliases.");
 return true;
}
function occupiedRootOrdinals(database){
 const out=new Set(Object.values(database.locations||{}).filter(p=>p.rootId).map(p=>rootOrdinalFromId(p.rootId)));
 for(const i of database.items)if(!i.parentId)out.add(rootOrdinalFromId(i.rootId));
 for(const e of database.archiveIndex||[])out.add(rootOrdinalFromId(numericCodeRoot(e.code)));
 out.delete(0);return out;
}
function reservedRootOrdinals(database){
 const out=occupiedRootOrdinals(database),released=new Set(database.reusableRootOrdinals);
 const codes=[...Object.keys(database.linkAliases||{}),...database.items.flatMap(i=>i.codeAliases||[]),...(database.archiveIndex||[]).flatMap(e=>e.codeAliases||[])];
 for(const code of codes){const n=rootOrdinalFromId(numericCodeRoot(code));if(n&&!released.has(n))out.add(n)}
 return out;
}
function reconcileAllocator(database){
 const occupied=reservedRootOrdinals(database);let next=database.nextRootOrdinal;
 for(const n of occupied)next=Math.max(next,n+1);
 database.nextRootOrdinal=next;
 database.reusableRootOrdinals=database.reusableRootOrdinals.filter(n=>!occupied.has(n)).sort((a,b)=>a-b);
}
function releaseRootId(database,type,rootId){
 const n=rootOrdinalFromId(rootId);if(!n)return;
 const pool=database.reusableRootOrdinals;
 if(!occupiedRootOrdinals(database).has(n)&&!pool.includes(n)){pool.push(n);pool.sort((a,b)=>a-b)}
 database.updatedAt=now();markDirty();
}
function takeRootOrdinal(database,occupied=reservedRootOrdinals(database)){
 const pool=database.reusableRootOrdinals;
 const reusable=pool.filter(n=>!occupied.has(n)).sort((a,b)=>a-b)[0];
 let n=reusable??database.nextRootOrdinal;while(occupied.has(n))n++;
 rootIdFromOrdinal(n); // Capacity check precedes all mutations.
 database.reusableRootOrdinals=pool.filter(x=>x!==n&&!occupied.has(x));
 if(reusable===undefined)database.nextRootOrdinal=n+1;
 return n;
}
function allocateRootId(database,type){
 if(type!==undefined&&!['Note','Todo'].includes(type))throw new Error('Invalid item type');
 const id=rootIdFromOrdinal(takeRootOrdinal(database));database.updatedAt=now();markDirty();return id;
}
function ensureRootCapacity(database,types){
 const trial={nextRootOrdinal:database.nextRootOrdinal,reusableRootOrdinals:[...database.reusableRootOrdinals]},occupied=reservedRootOrdinals(database);
 for(const type of types){if(!['Note','Todo'].includes(type))throw new Error('Invalid item type');occupied.add(takeRootOrdinal(trial,occupied))}
}
// Read-only lookup index (R2). It exists only while an Outline or Calendar redraw runs,
// so in-place edits made by event handlers can never meet a stale index.
let lookupScope=0,lookupCache=null;
function withLookups(fn){lookupScope++;try{return fn()}finally{if(--lookupScope===0)lookupCache=null}}
function readLookups(db){
 if(!lookupScope||!db?.items)return null;
 if(lookupCache&&lookupCache.db===db&&lookupCache.items===db.items&&lookupCache.length===db.items.length)return lookupCache;
 const byId=new Map(),children=new Map();
 for(const x of db.items){if(!byId.has(x.id))byId.set(x.id,x);const k=x.parentId;if(!children.has(k))children.set(k,[]);children.get(k).push(x)}
 return lookupCache={db,items:db.items,length:db.items.length,byId,children};
}
function itemById(db,id){const L=readLookups(db);return L?L.byId.get(id):db.items.find(x=>x.id===id)}
function activeItems(db){return db.items.filter(x=>!x.archived)}
function childrenOf(db,id,includeArchived=false){const L=readLookups(db);return (L?(L.children.get(id)||[]):db.items).filter(x=>x.parentId===id&&(includeArchived||!x.archived)).sort((a,b)=>a.order-b.order)}
function rootOf(db,item){let x=item,seen=new Set();while(x?.parentId){if(seen.has(x.id))throw new Error("Hierarchy cycle detected");seen.add(x.id);const p=itemById(db,x.parentId);if(!p)break;x=p}return x}
// One visual marker for each logical item. Dates supply occurrence-specific status.
// Checklist checkboxes are named after their line, so screen readers say what is being ticked.
function checkLabel(text){return String(text??'').replace(/[*_`~#<>\[\]]/g,'').replace(/\s+/g,' ').trim().slice(0,120)||'Checklist item'}
// Shared drawings, so the same idea looks the same everywhere (markers, Outline indicators, Daily Planner).
// One way to write weeks in text: "W49 2026" (the Calendar's week column shows just the number).
function weekLabel(isoWeek){const m=/^(\d{4})-W(\d{2})$/.exec(String(isoWeek||''));return m?`W${Number(m[2])} ${m[1]}`:String(isoWeek||'')}
// Month and week fields: shown as "11/2026" and "W48 2026", stored as "2026-11" and "2026-W48".
// Typing either form works (also "11.2026", "48 2026", "w48/2026").
function monthText(month){const m=/^(\d{4})-(\d{2})$/.exec(String(month||''));return m?`${m[2]}/${m[1]}`:String(month||'')}
function parseMonthText(text){
 const t=String(text||'').trim();let m=/^(\d{4})-(\d{1,2})$/.exec(t);if(m)return `${m[1]}-${m[2].padStart(2,'0')}`;
 m=/^(\d{1,2})\s*[\/.\- ]\s*(\d{4})$/.exec(t);return m?`${m[2]}-${m[1].padStart(2,'0')}`:t;
}
function parseWeekText(text){
 const t=String(text||'').trim();let m=/^(\d{4})-?W(\d{1,2})$/i.exec(t);if(m)return `${m[1]}-W${m[2].padStart(2,'0')}`;
 m=/^W?\s*(\d{1,2})\s*[\/,. ]\s*(\d{4})$/i.exec(t);return m?`${m[2]}-W${m[1].padStart(2,'0')}`:t;
}
// Short month names, with "Sep" (not the British "Sept") so every month has three letters.
function shortMonthName(date){return date.toLocaleDateString('en-GB',{month:'short'}).replace(/^Sept$/,'Sep')}
const ITEM_ICON_PATHS={
 note:'<path d="M13.5 4H7.5A1.5 1.5 0 0 0 6 5.5v13A1.5 1.5 0 0 0 7.5 20h9a1.5 1.5 0 0 0 1.5-1.5V8.5zM13.5 4v4.5H18M9 13h6M9 16.5h4"/>',
 repeat:'<path d="m16.5 3.5 3 3-3 3"/><path d="M4.5 11.5v-1a4 4 0 0 1 4-4h11"/><path d="m7.5 20.5-3-3 3-3"/><path d="M19.5 12.5v1a4 4 0 0 1-4 4h-11"/>',
 calendar:'<rect x="4" y="5.5" width="16" height="14.5" rx="2.5"/><path d="M8.5 3.5v4M15.5 3.5v4M4 10.5h16"/>',
 clock:'<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
 search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
 meeting:'<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.4-3 2.6-5 5.5-5s5.1 2 5.5 5"/><circle cx="17" cy="9" r="2.5"/><path d="M15.5 14.3c.5-.2 1-.3 1.5-.3 2.3 0 4 1.6 4.4 4"/>'
};
function itemMarker(item,{status=null,date=null,passive=false,code=false,planner=false,outline=false,nested=false}={}){
 const state=status||(date&&isRecurringTodo(item)?occurrenceStatus(item,date):item.status)||'Todo';
 const kind=item.target?'Target':isMilestone(item)?'Milestone':isRecurringTodo(item)?'Recurring Todo':item.type;
 // In the Outline a recurring Todo uses the plain Todo circle; the repeat icon moves to the right-hand indicators.
 const plainRecurring=outline&&kind==='Recurring Todo',special=!plainRecurring&&!['Note','Todo'].includes(kind);
 // Drawn to one optical size: a Note page is as tall as a Todo circle; Target and Milestone are only a touch larger.
 let shape=kind==='Target'?'<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.5"/>':kind==='Milestone'?'<path d="m12 3.5 8.5 8.5-8.5 8.5L3.5 12z"/>':kind==='Recurring Todo'&&!plainRecurring?ITEM_ICON_PATHS.repeat:item.type==='Note'?ITEM_ICON_PATHS.note:'<circle cx="12" cy="12" r="8"'+(state==='Done'?' fill="currentColor"':'')+'/>';
 if(item.type==='Todo'&&special&&['Done','Cancelled','On hold'].includes(state))shape+='<circle cx="19" cy="19" r="5" fill="var(--bg)" stroke="none"/>'+(state==='Done'?'<circle cx="19" cy="19" r="3" fill="currentColor" stroke="none"/>':state==='Cancelled'?'<path d="m16.5 16.5 5 5m0-5-5 5"/>':'<path d="M16 19h6"/>');
 else if(item.type==='Todo'&&state==='Cancelled')shape+='<path d="m8 8 8 8m0-8-8 8"/>';
 else if(item.type==='Todo'&&state==='On hold')shape+='<path d="M7 12h10"/>';
 else if(item.type==='Todo'&&state==='Waiting for'&&!special)shape+='<path d="M12 8.5V12l2.5 1.5"/>'; // a shape cue, not colour alone
 const label=kind+(item.type==='Todo'?' · '+state:'')+(!passive&&item.type==='Todo'?' · '+(state==='Done'?'Mark Todo':'Mark done'):'');
 return '<span class="itemMarker'+(code?' code':'')+'" data-marker-id="'+esc(item.id||'')+'" data-marker-type="'+esc(item.type)+'" data-marker-kind="'+kind+'" data-marker-status="'+esc(state)+'"'+(date?' data-marker-date="'+esc(date)+'"':'')+(code?' data-code="'+esc(item.id)+'"':'')+(planner?' data-marker-planner="true"':'')+(plainRecurring?' data-marker-plain="true"':'')+(passive?' data-marker-passive="true" aria-label="'+esc(label)+'"':nested?' aria-hidden="true"':' role="button" tabindex="'+(outline?'-1':'0')+'" aria-label="'+esc(label)+'"')+' title="'+esc(label)+'"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+shape+'</svg></span>';
}
function copyItemCode(item,location=null){
 const graph=db.locations?locationsForRead(db):null;
 return copyPlainText(graph&&location&&graph.nodes.has(location)?graph.code(graph.nodes.get(location)):itemCode(db,item));
}
// Sets a Todo's status from one of its markers, the same way in every view.
function setMarkerStatus(marker,status){
 return applyTodoStatus(itemById(db,marker.dataset.markerId),status,{date:marker.dataset.markerDate,row:marker.closest('.row')});
}
function applyTodoStatus(item,status,{date=null,row=null}={}){
 if(!item||item.type!=='Todo')return false;
 if(editorIsOpen())syncModelFromRich();
 if(date&&isRecurringTodo(item)){setOccurrenceCalendarStatus(item,date,status);renderTree()}
 else if(row){selected=item.id;selectedLocation=row.dataset.location;setOutlineCompletion(item,status)}
 else {checkpoint();setItemCompletionStatus(item,status);if(status==='Done'&&!showDoneItems()&&!isRecurringTodo(item))startCompletionGrace(item);else{cancelCompletionGrace(item.id);render();if(editorIsOpen()&&selected===item.id)edit(item.id)}}
 document.querySelector('#refSearch')?.dispatchEvent(new Event('input'));
 return true;
}
function markerAction(marker){
 const item=itemById(db,marker.dataset.markerId);if(!item||item.type!=='Todo')return false;
 if(editorIsOpen())syncModelFromRich();
 const row=marker.closest('.row'),date=marker.dataset.markerDate;
 if(row){selected=item.id;selectedLocation=row.dataset.location;setOutlineCompletion(item,item.status==='Done'?'Todo':'Done')}
 else if(date&&isRecurringTodo(item)){setOccurrenceCalendarStatus(item,date,occurrenceStatus(item,date)==='Done'?'Todo':'Done');renderTree()}
 else {const next=item.status==='Done'?'Todo':'Done';checkpoint();setItemCompletionStatus(item,next);if(next==='Done'&&!showDoneItems()&&!isRecurringTodo(item))startCompletionGrace(item);else{cancelCompletionGrace(item.id);render();if(editorIsOpen()&&selected===item.id)edit(item.id)}}
 document.querySelector('#refSearch')?.dispatchEvent(new Event('input'));
 return true;
}
function itemCode(db,item){return item?storedItemCode(db,item):""}
function descendants(db,id,includeArchived=false){const out=[];for(const c of childrenOf(db,id,includeArchived)){out.push(c,...descendants(db,c.id,includeArchived))}return out}
function recalcOrders(db,parentId){if(db.locations){
 const g=new OutlineLocations(db),parent=parentId&&g.primary(itemById(db,parentId));
 const used=new Set();let next=g.appendOrder(parent?.id||null);for(const p of g.siblings(parent?.id||null)){
   if(used.has(p.order)){if(p.primary)p.item.order=next++;else db.locations[p.id].order=next++}used.add(p.order);
 }locationIndex=null;return}db.items.filter(x=>x.parentId===parentId&&!x.archived).sort((a,b)=>a.order-b.order).forEach((x,i)=>x.order=i+1)}
function touch(db,item){item.updatedAt=now();db.updatedAt=now();markDirty();
 if(document.getElementById('search')?.value)queueMicrotask(()=>{if(!isTextEntry(document.activeElement))completeSearchAction(selected||item.id)});
}
function createItem(db,type,parentId=null,parentLocation=null){
 if(!["Note","Todo"].includes(type))throw new Error("Invalid item type");
 if(parentId!==null){
   let parent=itemById(db,parentId),depth=1;if(!parent||parent.archived)throw new Error("Choose an active parent.");
   while(parent){if(++depth>256)throw new Error("Hierarchy exceeds the supported depth of 256.");parent=parent.parentId?itemById(db,parent.parentId):null}
 }
 const siblings=db.items.filter(x=>x.parentId===parentId&&!x.archived);
 const i={id:uuid(),type,parentId,order:siblings.reduce((max,x)=>Math.max(max,x.order),0)+1,rootId:parentId?null:allocateRootId(db,type),title:type==="Note"?"Untitled Note":"Untitled Todo",content:"",status:"Todo",target:null,milestone:null,scheduledDates:[],explicitTags:[],recurrenceId:null,recurrence:null,occurrenceStates:{},codeAliases:[],createdAt:now(),updatedAt:now(),archived:false,collapsed:false};
 if(db.locations){const g=new OutlineLocations(db),parent=parentId?(g.nodes.get(parentLocation)||((selected===parentId&&g.selected(itemById(db,parentId)))||g.primary(itemById(db,parentId)))):null;
   if(parent&&!parent.primary)i.locationParent=parent.id;i.order=g.appendOrder(parent?.id||null)}
 db.items.push(i);db.updatedAt=now();markDirty();return i;
}
// "Keep both" after another computer saved the same library while this one had unsaved changes.
// The other copy's items that it changed since the two copies split (every item when the histories
// are unrelated) and that differ here are copied, with new ids, into a "Conflicting changes" Note
// at the top of the Outline, so nothing from either computer is lost. Returns how many were copied.
function mergeConflictingCopy(db,other,changedIds,source){
 const mark='Source: library file version '+String(source).slice(0,12);
 if(db.items.some(i=>!i.parentId&&!i.archived&&String(i.content||'').includes(mark)))return 0;
 const stable=v=>Array.isArray(v)?'['+v.map(stable).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}':JSON.stringify(v);
 const content=({updatedAt,order,rootId,codeAliases,locationParent,collapsed,...rest})=>stable(rest);
 const local=new Map(db.items.map(i=>[i.id,i])),changed=changedIds?new Set(changedIds):null,theirs=new Map(other.items.map(i=>[i.id,i]));
 const depth=i=>{let d=0;for(let p=theirs.get(i.parentId);p&&d<256;p=theirs.get(p.parentId))d++;return d};
 const picked=other.items.filter(o=>!o.archived&&(!changed||changed.has(o.id))&&!(local.has(o.id)&&content(local.get(o.id))===content(o))).sort((a,b)=>depth(a)-depth(b));
 if(!picked.length)return 0;
 checkpoint();
 const root=createItem(db,'Note');
 root.title='Conflicting changes from another computer';
 root.content='These items were changed on another computer while this one had unsaved changes. Compare them with your versions, keep what you need and delete this branch.\n\n'+mark;
 const clones=new Map();
 for(const o of picked){
   const copy=createItem(db,o.type,clones.get(o.parentId)?.id||root.id);
   for(const key of ['title','content','status','explicitTags','tagExclusions','scheduledDates','heading'])if(o[key]!==undefined)copy[key]=structuredClone(o[key]);
   if(local.has(o.id))copy.title=(o.title||'(untitled)')+' (other computer)';
   clones.set(o.id,copy);
   for(const [hash,asset] of Object.entries(other.imageAssets||{}))if(String(o.content||'').includes(hash)){db.imageAssets??={};db.imageAssets[hash]??=structuredClone(asset)}
 }
 return picked.length;
}
function isDescendant(db,candidateId,ancestorId){return descendants(db,ancestorId,true).some(x=>x.id===candidateId)}
function moveItem(db,id,newParentId,newIndex=null,visibleOrders=null){
 if(db.locations){const g=new OutlineLocations(db),item=itemById(db,id),p=id===selected?g.selected(item):g.primary(item);
   const dest=newParentId&&g.primary(itemById(db,newParentId));g.move(p,dest?.id||null,newIndex);g.commit(false);return}
 const item=itemById(db,id);if(!item)throw new Error("Item not found");
 if(newParentId===id||isDescendant(db,newParentId,id))throw new Error("Cannot create hierarchy cycle");
 if(newParentId!==null&&!itemById(db,newParentId))throw new Error("Parent not found.");
 validateHierarchy(db.items.map(i=>i.id===id?{...i,parentId:newParentId}:i));
 const allocated=newParentId===null&&item.parentId!==null?allocateRootId(db,item.type):null;
 stabilizeReferences(db);const previous=codeMapForDatabase(db);
 const oldParent=item.parentId,oldRootId=item.rootId; item.parentId=newParentId;
 if(oldParent===null && newParentId!==null && oldRootId)releaseRootId(db,item.type,oldRootId);
 if(newParentId===null && oldParent!==null)item.rootId=allocated;
 if(newParentId!==null)item.rootId=null;
 const siblings=db.items.filter(x=>x.parentId===newParentId&&!x.archived&&x.id!==id).sort((a,b)=>a.order-b.order);
 const idx=newIndex===null?siblings.length:Math.max(0,Math.min(newIndex,siblings.length));siblings.splice(idx,0,item);
 // Outline moves preserve hidden siblings' integer ordering slots.
 if(visibleOrders){for(const x of siblings)if(visibleOrders.has(x.id))x.order=visibleOrders.get(x.id)}else{siblings.forEach((x,i)=>x.order=i+1);recalcOrders(db,oldParent)}
 recordChangedCodes(db,previous);touch(db,item);
}
function promoteInPlace(database,id,toRoot=false){
 const item=itemById(database,id),parent=item&&itemById(database,item.parentId);if(!parent)return;
 const destination=toRoot?null:parent.parentId;
 let anchor=parent;while(anchor.parentId!==destination&&anchor.parentId)anchor=itemById(database,anchor.parentId);
 const siblings=childrenOf(database,destination);
 moveItem(database,id,destination,siblings.findIndex(i=>i.id===anchor.id)+1);
}

function normalizeTag(tag){
 return String(tag||"").trim().replace(/^#+/,"").replace(/\s+/g,"-").replace(/^\/+|\/+$/g,"").replace(/\/{2,}/g,"/").toLowerCase();
}
function normalizeTagList(value){
 const raw=Array.isArray(value)?value:String(value||"").split(/[,\n]+/);
 const out=[];
 for(const part of raw){
   for(const token of String(part).trim().split(/\s+/)){
     const t=normalizeTag(token);if(t&&!out.includes(t))out.push(t);
   }
 }
 return out;
}

function inlineTags(item){
 const text=(String(item.title||"")+"\n"+String(item.content||"")).replace(/```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|`+[^`]*`+|\[\[[\s\S]*?\]\]|https?:\/\/\S+|\]\([^)]*\)/g," ");
 return [...new Set([...text.matchAll(/(?:^|[\s(,;])#([\p{L}\p{N}_][\p{L}\p{N}_/-]*)/gu)].map(m=>normalizeTag(m[1])))];
}
function ownTags(item){return [...new Set([...normalizeTagList(item.explicitTags||[]),...inlineTags(item)])]}
function inheritedTags(db,item){
 if(db.locations){
   const graph=locationsForRead(db),all=new Set();
   for(const p of graph.byItem.get(item.id)||[]){const tags=new Set();for(const n of graph.chain(p)){for(const t of n.item.tagExclusions||[])tags.delete(t);for(const t of ownTags(n.item))tags.add(t)}for(const t of tags)all.add(t)}
   return [...all].sort(compareTags);
 }
 const chain=[],seen=new Set();for(let x=item;x&&!seen.has(x.id);x=itemById(db,x.parentId)){chain.unshift(x);seen.add(x.id)}
 const tags=new Set();for(const x of chain){for(const tag of normalizeTagList(x.tagExclusions||[]))tags.delete(tag);ownTags(x).forEach(t=>tags.add(t))}
 return [...tags].sort(compareTags);
}
function archiveSubtree(db,id,value=true){
 if(db.locations){const g=new OutlineLocations(db),affected=[itemById(db,id),...descendants(db,id,true)].filter(Boolean);
 if(affected.some(i=>g.byItem.get(i.id).length>1||i.locationParent||g.siblings(g.primary(i).id).some(p=>!p.primary))){toast('Remove linked locations from this branch before archiving it.');return false}}
 stabilizeReferences(db);const previous=codeMapForDatabase(db);const i=itemById(db,id);if(!i)return;[i,...descendants(db,id,true)].forEach(x=>{x.archived=value;touch(db,x)});recalcOrders(db,i.parentId);recordChangedCodes(db,previous)}
function deleteSubtree(db,id){stabilizeReferences(db);const previous=codeMapForDatabase(db);const i=itemById(db,id);if(!i)return;const ids=new Set([id,...descendants(db,id,true).map(x=>x.id)]),p=i.parentId;forgetPins(db,ids);db.items=db.items.filter(x=>!ids.has(x.id));recalcOrders(db,p);recordChangedCodes(db,previous);db.updatedAt=now();markDirty()}








function filterItems(db,{text="",texts=[],status=[],tag="",tags=[],createdFrom="",createdTo="",scheduledFrom="",scheduledTo="",typeMode="",recurringOnly=false,notRecurring=false,scheduledDatesForItem=i=>i.scheduledDates||[]}={}){
 const terms=(texts.length?texts:(text?String(text).trim().toLowerCase().split(/\s+/).filter(Boolean):[])).map(x=>String(x).toLowerCase());
 const requiredTags=[...(tag?[tag]:[]),...tags].filter(Boolean).map(normalizeTag).filter(Boolean);
 const requiredStatuses=status.map(normalizeStatusValue).filter(Boolean),locations=terms.length&&db.locations?new OutlineLocations(db):null;
 return activeItems(db).filter(i=>{
   const hay=terms.length?(i.title+" "+descriptionSearchText(i.content)+" "+itemSearchCodes(db,i,locations)).toLowerCase():'';
   if(terms.some(q=>!fuzzyTextMatch(q,hay)))return false;
   if(typeMode==="notes"&&i.type!=="Note")return false;
   if(typeMode==="todos"&&i.type!=="Todo")return false;
   if(recurringOnly&&(i.type!=="Todo"||!i.recurrence?.frequency))return false;
   if(notRecurring&&i.type==="Todo"&&i.recurrence?.frequency)return false;
   // Todo status selections are Todo-only filters. Notes never satisfy them.
   if(requiredStatuses.length){
     if(i.type!=="Todo")return false;
     if(!requiredStatuses.includes(i.status))return false;
   }
   if(requiredTags.length){
     const inherited=inheritedTags(db,i);
     // Querying #project matches #project and descendants such as #project/research.
     if(requiredTags.some(t=>!inherited.some(x=>x===t||x.startsWith(t+"/"))))return false;
   }
   const c=(i.createdAt||"").slice(0,10);if(createdFrom&&c<createdFrom)return false;if(createdTo&&c>createdTo)return false;
   if(scheduledFrom||scheduledTo){const ds=scheduledDatesForItem(i);if(!ds.some(d=>(!scheduledFrom||d>=scheduledFrom)&&(!scheduledTo||d<=scheduledTo)))return false}
   return true;
 });
}






let undoStack=[],redoStack=[],historyLock=false;

let dirty=false;
function markDirty(reconcilePlanner=true){
 if(reconcilePlanner && db?.planner){const d=new Date();PlannerModel.reconcile(db,today(),d.getHours()*60+d.getMinutes())}
 window.dailyPlanner?.refresh();
 locationIndex=null;
 dirty=true;
 updateDirtyUI();scheduleAutosave();
}
function markClean(){
 dirty=false;
 updateDirtyUI();
}
function updateDirtyUI(){
 const s=document.getElementById("storageStatus");
 if(s)s.classList.toggle("unsaved",dirty);
 document.title=`${dirty?"• ":""}YTNH v${APP_VERSION}`;
}

function snapshot(){
 const text=db?JSON.stringify(db):null;
 if(text){editorSnapshotSelections.set(text,captureEditorSelection());if(editorSnapshotSelections.size>170)editorSnapshotSelections.delete(editorSnapshotSelections.keys().next().value)}
 return text;
}
function checkpoint(){
 if(!db||historyLock)return false;
 const snap=snapshot();
 if(undoStack[undoStack.length-1]===snap)return false;
 undoStack.push(snap);trimHistory(undoStack);
 redoStack=[];return true
}
// Undo keeps up to 80 full snapshots, but large libraries stop at a memory budget (R1):
// about 40 million characters (~80 MB), always keeping the 10 most recent steps.
const HISTORY_STEPS=80,HISTORY_MIN_STEPS=10,HISTORY_CHAR_BUDGET=40e6;
function trimHistory(stack){
 let total=0;for(const s of stack)total+=s?.length||0;
 while(stack.length>HISTORY_STEPS||(stack.length>HISTORY_MIN_STEPS&&total>HISTORY_CHAR_BUDGET)){total-=stack[0]?.length||0;stack.shift()}
}
function restoreSnapshot(text){
 if(!text)return;
 const inline=document.activeElement;if(inline?.classList.contains("inlineEdit")){inline.dateRefreshing=true;inline.blur()}
 closeDateSuggestions();
 const wasEditorOpen=editorIsOpen(),view=$('layout').dataset.view;
 historyLock=true;db=migrateDatabase(JSON.parse(text));historyLock=false;markDirty(false);
 selected=selected&&editorDocument()&&!itemById(db,selected)?.archived?selected:null;applyTheme();applySplitSetting();
 if(wasEditorOpen&&selected){edit(selected);restoreEditorSelection(editorSnapshotSelections.get(text));renderStatus()}
 else if(wasEditorOpen&&appearance.defaultView==='editor'){showEditorAfterDeletion(selected);render()}
 else{showCalendar({refresh:false});$('layout').dataset.view=view==='editor'?'calendar':view;render()}
 resetEditorHistoryGroup();
}
function undo(){if(!undoStack.length||!db)return;redoStack.push(snapshot());trimHistory(redoStack);restoreSnapshot(undoStack.pop());toast("Undone")}
function redo(){if(!redoStack.length||!db)return;undoStack.push(snapshot());trimHistory(undoStack);restoreSnapshot(redoStack.pop());toast("Redone")}
function rememberCodeAlias(item,oldCode){}
function codeMapBefore(ids){const m=new Map();for(const id of ids){const i=itemById(db,id);if(i)m.set(id,itemCode(db,i))}return m}
function rememberChangedCodes(before){for(const [id,oldCode] of before){const i=itemById(db,id);if(i&&itemCode(db,i)!==oldCode)rememberCodeAlias(i,oldCode)}}
function refToken(id){return `@{${id}}`}
function resolveReference(raw){
 const s=String(raw||"").trim();
 const uuidMatch=s.match(/^@\{([^}]+)\}$/);if(uuidMatch)return itemById(db,uuidMatch[1])||null;
 return parseCodeReference(db,s);
}
function outsideCode(text,transform){
 return String(text||"").split(/(`+[\s\S]*?`+|<span data-inline-todo="[\w-]+" data-occurrence="[\w-]+">[\s\S]*?<\/span>)/g).map((part,k)=>k%2?part:transform(part)).join("");
}
function referenceCandidates(database,code){
 const key=String(code).trim().toUpperCase(),ids=new Set();
 if(database.locations){const g=locationsForRead(database);for(const p of g.nodes.values())if(g.code(p)===key)ids.add(p.item.id)}
 for(const i of database.items){if(itemCode(database,i).toUpperCase()===key||(i.codeAliases||[]).some(a=>a.toUpperCase()===key))ids.add(i.id)}
 for(const e of database.archiveIndex||[])if(e.code.toUpperCase()===key||(e.codeAliases||[]).some(c=>c.toUpperCase()===key))ids.add(e.id);
 const alias=database.linkAliases?.[key];if(alias)ids.add(alias);
 return [...ids];
}
function canonicalizeForDatabase(database,text){
 return outsideCode(text,part=>part.replace(/(!?)\[\[((?:[NT]-[A-Z0-9.]+|[0-9]{3}\.[0-9]{3}(?:\.[1-9][0-9]*)*))\]\]/gi,(m,bang,code)=>{
   const ids=referenceCandidates(database,code);return ids.length===1?`${bang}[[${refToken(ids[0])}]]`:m;
 }));
}
function canonicalizeReferences(text){return canonicalizeForDatabase(db,text)}
function stabilizeReferences(database){
 for(const i of database.items){const next=canonicalizeForDatabase(database,i.content);if(next!==i.content){i.content=next;i.updatedAt=now()}}
}
// Item codes are no longer shown (option C). Positional codes still resolve old typed
// references and existing aliases stay readable, but changes no longer record new aliases.
function codeMapForDatabase(database){return new Map()}
function recordChangedCodes(database,before){}
function displayReferenceToken(raw){
 const t=resolveReference(raw);if(t)return itemCode(db,t);
 const cold=coldArchiveReference(raw);return cold?.code||raw
}

function safeEditorURL(value){
 const url=String(value||'').trim();if(/[\u0000-\u0020]/.test(url))return false;
 if(/^(https?:\/\/|mailto:)/i.test(url))return true;
 if(!/^file:\/\//i.test(url))return false;
 try{return new URL(url).protocol==='file:'}catch{return false}
}
function pastedFileURL(value){
 let path=String(value||'').trim();
 if(path.startsWith('"')&&path.endsWith('"'))path=path.slice(1,-1);
 if(!path||/[\u0000-\u001f]/.test(path))return null;
 const encode=part=>encodeURIComponent(part).replace(/[!'()*]/g,ch=>'%'+ch.charCodeAt(0).toString(16).toUpperCase());
 if(/^[a-z]:[\\/]/i.test(path)){
   path=path.replace(/\\/g,'/');
   return 'file:///'+path.slice(0,2)+'/'+path.slice(3).split('/').map(encode).join('/');
 }
 if(/^file:\/\//i.test(path)){
   try{const url=new URL(path);return url.href.replace(/[()]/g,ch=>ch==='('?'%28':'%29')}catch{return null}
 }
 return null;
}
function localFilePath(url){
 let path;try{path=decodeURIComponent(url.pathname)}catch{path=url.pathname}
 if(url.hostname&&url.hostname!=='localhost')return '\\\\'+url.hostname+path.replace(/\//g,'\\');
 if(/^\/[a-z]:\//i.test(path))return path.slice(1).replace(/\//g,'\\');
 return path;
}
function openEditorLink(href){
 if(!safeEditorURL(href))return;
 if(window.notesDesktop){window.notesDesktop.openLink(href).catch(error=>toast(error.message));return}
 const url=new URL(href);
 const browserFile=/\.(?:pdf|txt|html?|xhtml|svg|png|jpe?g|gif|webp|avif|bmp|ico|mp3|wav|ogg|mp4|webm)$/i.test(url.pathname);
 if(url.protocol!=='file:'||browserFile){window.open(href,'_blank','noopener,noreferrer');return}
 const path=localFilePath(url),windowsPath=/^(?:[a-z]:\\|\\\\)/i.test(path);
 resetModalShell();
 $('modalTitle').textContent='Open Local File';
 $('modalText').textContent=windowsPath
   ?'To open this file in its Windows app, copy the path, press Win+R, paste it, and press Enter. The browser cannot reliably launch the desktop app for this file.'
   :'Copy this path and open the file from your file manager. The browser cannot reliably launch the desktop app for this file.';
 $('modalExtra').innerHTML='<label class="label" for="localFilePath">File path</label><input id="localFilePath" class="field" readonly><div class="group" style="margin-top:10px"><button type="button" id="tryLocalFileInBrowser">Try in browser</button></div>';
 $('localFilePath').value=path;
 $('localFilePath').onclick=()=>$('localFilePath').select();
 $('tryLocalFileInBrowser').onclick=()=>window.open(href,'_blank','noopener,noreferrer');
 $('modalOK').textContent='Copy path';$('modalOK').onclick=()=>copyPlainText(path);
 $('modalbg').classList.add('open');
}
function mdInlineToEditor(s){
  let x=esc(String(s||""));const stash=[];let tokenPrefix="%%REF";while(x.includes(tokenPrefix))tokenPrefix+="_";
  x=x.replace(/`([^`]+)`|&lt;span data-inline-todo=&quot;([\w-]+)&quot; data-occurrence=&quot;([\w-]+)&quot;&gt;([\s\S]*?)&lt;\/span&gt;/g,(all,code,id,occurrence,body)=>{const key=`${tokenPrefix}${stash.length}%%`;if(code!==undefined)stash.push(`<code>${code}</code>`);else{const decoder=document.createElement('textarea');decoder.innerHTML=body;decoder.innerHTML=decoder.value;stash.push(makeInlineTodo(id,occurrence,decoder.value).outerHTML)}return key});
  let sizeDepth=0;
  x=x.replace(/&lt;span data-text-size=&quot;(\d{1,2})&quot;&gt;|&lt;\/span&gt;/g,(tag,size)=>{
    const n=Number(size);if(size&&n>=8&&n<=96){sizeDepth++;const key=`${tokenPrefix}${stash.length}%%`;stash.push(`<span data-text-size="${n}">`);return key}
    if(!size&&sizeDepth){sizeDepth--;const key=`${tokenPrefix}${stash.length}%%`;stash.push('</span>');return key}return tag;
  });
  x=x.replace(/(!?)\[\[(@\{[^}]+\}|(?:[NT]-[A-Z0-9.]+|[0-9]{3}\.[0-9]{3}(?:\.[1-9][0-9]*)*))\]\]/gi,(m,bang,raw)=>{
    const t=resolveReference(raw),cold=t?null:coldArchiveReference(raw),display=t?itemCode(db,t):(cold?.code||displayReferenceToken(raw));
    const md=t?`${bang}[[${refToken(t.id)}]]`:cold?`${bang}[[${refToken(cold.id)}]]`:m,key=`${tokenPrefix}${stash.length}%%`;
    if(cold){
      const cls=`mdref ${bang?"embedref ":""}coldref`;
      stash.push(`<span class="${cls}" contenteditable="false" data-md="${esc(md)}">${itemMarker(cold,{passive:true})} ${esc(cold.title||"(untitled)")} · cold archive <small>${esc(cold.archiveFile||"")}</small></span>`);
    }else if(!t){
      stash.push(`<span class="mdref brokenref" contenteditable="false" data-broken-md="${esc(m)}" title="Broken reference. Double-click to choose a replacement.">${esc(m)} · missing or ambiguous</span>`);
    }else if(bang){
      const snippet=String(t.content||"").replace(/!\[\[[^\]]+\]\]/g,"").replace(/\[\[[^\]]+\]\]/g,"").replace(/[#*_`>-]/g," ").replace(/\s+/g," ").trim().slice(0,180);
      stash.push(`<span class="mdref embedref" contenteditable="false" data-md="${esc(md)}" data-ref-id="${esc(t.id)}"><span class="embedtitle">↳ ${itemMarker(t,{passive:true})} ${esc(t.title||"(untitled)")}</span><span class="embedsnippet">${esc(snippet||"Empty embedded item")}</span><button type="button" class="embedEditBtn" data-edit-embed="${esc(t.id)}">Edit source</button></span>`);
    }else{
      stash.push(`<span class="mdref" contenteditable="false" data-md="${esc(md)}" data-ref-id="${esc(t.id)}" title="${IS_MAC?'⌘':'Ctrl'}+click or double-click to open linked item">${itemMarker(t,{passive:true})} ${esc(t.title)}</span>`);
    }
    return key;
  });
  x=x.replace(/\[([^\]]+)\]\(([^)]+)\)/g,(all,label,href)=>{const decoder=document.createElement('textarea');decoder.innerHTML=href;const url=decoder.value;if(!safeEditorURL(url))return all;const key=`${tokenPrefix}${stash.length}%%`;stash.push(`<a href="${esc(url)}" rel="noopener noreferrer">${label}</a>`);return key});
  x=x.replace(/(?:https?:\/\/|file:\/\/|www\.)[^\s<>]+/gi,raw=>{
    const urlText=raw.replace(/[.,;:!?]+$/,'').replace(/&(?:lt|gt);.*$/,'');
    const decoder=document.createElement('textarea');decoder.innerHTML=urlText;
    const href=/^www\./i.test(decoder.value)?'https://'+decoder.value:decoder.value;
    if(!safeEditorURL(href))return raw;
    const key=`${tokenPrefix}${stash.length}%%`;stash.push(`<a href="${esc(href)}" rel="noopener noreferrer">${urlText}</a>`);return key+raw.slice(urlText.length);
  });
  x=x.replace(/~~([^~]+)~~/g,'<s>$1</s>').replace(/&lt;u&gt;([\s\S]*?)&lt;\/u&gt;/g,'<u>$1</u>');
  x=x.replace(/\*\*([^*]+)\*\*/g,"<strong>$1</strong>").replace(/\*([^*]+)\*/g,"<em>$1</em>");
  stash.forEach((v,i)=>x=x.replace(`${tokenPrefix}${i}%%`,v));return x;
}
// The external file is addressed by its content hash. This codec accepts only
// this library-relative form and never evaluates a source document as HTML.
function managedImageLine(line){
 const hashPath=/^assets\/([a-f0-9]{64})\.(png|jpg|webp|gif|heif|svg)$/;
 const basic=/^!\[((?:\\.|[^\]\\])*)\]\(([^()]+)\)$/.exec(line);
 if(basic){
   const path=hashPath.exec(basic[2]);
   return path&&{alt:basic[1].replace(/\\([\\\[\]])/g,'$1'),hash:path[1],ext:path[2],width:null,align:'left',caption:null};
 }
 if(!/^<(?:figure|img)\b/.test(line))return null;
 const doc=document.createElement('template');doc.innerHTML=line;
 const top=doc.content.firstElementChild;
 if(doc.content.childNodes.length!==1)return null;
 const fig=top?.tagName==='FIGURE'?top:null,img=fig?fig.firstElementChild:top;
 if(img?.tagName!=='IMG')return null;
 const path=hashPath.exec(img.getAttribute('src')||'');if(!path)return null;
 const caption=fig?.querySelector(':scope > figcaption');
 if(fig&&(fig.children.length!==(caption?2:1)||caption?.children.length))return null;
 const width=Number(img.getAttribute('width'))||null;
 return {hash:path[1],ext:path[2],alt:img.getAttribute('alt')||'',width:width&&width>0?Math.round(width):null,
    align:fig?.getAttribute('align')==='center'?'center':'left',caption:caption?.textContent??null};
}
function imageSource(image){
 const {hash,ext,alt,width,align,caption}=image;
 if(!width&&align!=='center'&&caption==null)return managedImageMarkdown(alt,hash,ext);
 const img='<img src="assets/'+hash+'.'+ext+'" alt="'+esc(alt)+'"'+(width?' width="'+Math.round(width)+'"':'')+'>';
 return caption!=null||align==='center'?'<figure'+(align==='center'?' align="center"':'')+'>'+img+(caption!=null?'<figcaption>'+esc(caption.replace(/[\r\n]+/g,' '))+'</figcaption>':'')+'</figure>':img;
}
function imageSearchResult(item,text){
 if(!text||!item.content.includes('assets/'))return '';
 const terms=parseSearchQuery(text).texts.map(term=>term.toLowerCase());if(!terms.length)return '';
 let index=0;
 for(const line of item.content.split('\n')){
   const image=managedImageLine(line);if(!image||!db.imageAssets?.[image.hash])continue;
   for(const [label,value] of [['Caption',image.caption],['Alt text',image.alt]]){
     if(value&&terms.some(term=>fuzzyTextMatch(term,value.toLowerCase())))return '<button type="button" class="imageSearchHit" data-image-index="'+index+'">'+label+': '+esc(value)+'</button>';
   }
   index++;
 }
 return '';
}
function descriptionSearchText(content){
 if(!content.includes('assets/'))return content;
 return content.split('\n').map(line=>{const image=managedImageLine(line);return image?image.alt+' '+(image.caption||''):line}).join('\n');
}
function externalDocumentImages(text){
   const refs=[];let fence=null;
   for(const [index,line] of text.split('\n').entries()){
     const tick=/^\s*(`{3,}|~{3,})/.exec(line);
     if(tick){if(!fence)fence=tick[1];else if(tick[1][0]===fence[0]&&tick[1].length>=fence.length)fence=null;continue}
     if(fence||managedImageLine(line))continue;
     if(/^<(img|figure)\b/.test(line)){
       const template=document.createElement('template');template.innerHTML=line;
       const top=template.content.firstElementChild,img=top?.matches('figure')?top.querySelector(':scope > img'):top;
       if(template.content.childNodes.length===1&&img?.matches('img[src]')){
         const width=Number(img.getAttribute('width'));
         refs.push({index,src:img.getAttribute('src'),alt:img.getAttribute('alt')||'',width:width>0?Math.round(width):null,
           align:top.getAttribute('align')==='center'?'center':'left',caption:top.querySelector('figcaption')?.textContent??null});
       }
       continue;
     }
     const m=/^!\[((?:\\.|[^\]\\])*)\]\((.+)\)$/.exec(line);
     if(m)refs.push({index,alt:m[1].replace(/\\([\\\[\]])/g,'$1'),src:m[2].replace(/^<(.+)>$/,'$1')});
   }return refs;
 }
function managedImageMarkdown(alt,hash,ext){
 const label=String(alt).replace(/[\r\n]+/g,' ').replace(/[\\\[\]]/g,'\\$&');
 return '!['+label+'](assets/'+hash+'.'+ext+')';
}
function managedImageBlock(line){
 const image=managedImageLine(line);
 if(!image)return '';
 const handles=['nw','ne','sw','se'].map(c=>'<span class="imageCorner '+c+'" data-corner="'+c+'" aria-hidden="true"></span>').join('');
 return '<div data-mdblock="image" contenteditable="false" data-align="'+image.align+'" data-image-source="'+esc(line)+'"><figure class="managedFigure"><div class="imageSurface"><span class="imagePixels"><span role="img" aria-label="'+esc(image.alt)+'">Image not yet available</span></span><span class="imageGrip" title="Move image" draggable="true">⠿</span>'+handles+'</div>'+(image.caption!=null?'<figcaption contenteditable="true">'+esc(image.caption)+'</figcaption>':'')+'</figure></div>';
}
function markdownToEditorHTML(text){
 const lines=String(text||'').split(/\r?\n/),out=[];let indents=[];
 for(let index=0;index<lines.length;index++){
   const line=lines[index],fence=line.match(/^(`{3,}|~{3,})(.*)$/);
   if(fence){
     const raw=[line];while(index+1<lines.length){const next=lines[++index];raw.push(next);if(new RegExp('^'+fence[1][0]+'{'+fence[1].length+',}\\s*$').test(next))break}
     const closed=raw.length>1&&new RegExp('^'+fence[1][0]+'{'+fence[1].length+',}\\s*$').test(raw.at(-1));
     // Fence lines stay in the text (so saving is unchanged) but are hidden in rich mode (33).
     out.push(`<div data-mdblock="code">${codeFenceSpan(raw[0]+'\n')}${esc(raw.slice(1,closed?-1:undefined).join('\n'))}${closed?codeFenceSpan('\n'+raw.at(-1)):''}</div>`);indents=[];continue;
   }
   if(storage.handle?.sqlite && db?.imageAssets){
     const managed=managedImageLine(line);
     if(managed && Object.hasOwn(db.imageAssets,managed.hash)){
       out.push(managedImageBlock(line));indents=[];continue;
     }
   }
   const headerless=line.trim()==='<!-- table:no-header -->',tableIndex=headerless?index+1:index,first=pipeCells(lines[tableIndex]||''),separator=pipeCells(lines[tableIndex+1]||'');
   if(first&&separator&&first.length===separator.length&&separator.every(x=>/^:?-{3,}:?$/.test(x))){const rows=[first];index=tableIndex+1;while(index+1<lines.length){const cells=pipeCells(lines[index+1]);if(!cells)break;rows.push(Array.from({length:first.length},(_,i)=>cells[i]||''));index++}out.push(tableHTML(rows,!headerless));indents=[];continue}
   let type='p',body=line,extra='',attrs='',m;
   if((m=line.match(/^([ \t]*)(- \[([ xX])\] |(\d+)\. |- )(.*)$/))){
     const indent=m[1].replace(/\t/g,'    ').length;
     while(indents.length&&indents.at(-1)>indent)indents.pop();
     if(!indents.length||indents.at(-1)<indent)indents.push(indent);
     const depth=indents.length-1;body=m[5];type=m[3]!==undefined?'check':m[4]?'ol':'ul';
     attrs=` data-mddepth="${depth}" data-mdindent="${esc(m[1])}"`;
     if(type==='check'){
       const heading=/^(#{1,6}) (.*)$/.exec(body);
       if(heading){attrs+=' data-check-heading="h'+heading[1].length+'"';body=heading[2]}
       else if(body.startsWith('> ')){attrs+=' data-check-heading="quote"';body=body.slice(2)}
     }
     if(type==='check')extra=`<input class="md-check" type="checkbox" contenteditable="false" aria-label="${esc(checkLabel(body))}" ${m[3].toLowerCase()==='x'?'checked':''}>`;
     if(type==='ol'){attrs+=` data-mdnum="${m[4]}"`;extra=`<span class="md-list-marker" contenteditable="false">${m[4]}.</span>`}
   }else{
     if(line.trim())indents=[];
     const heading=line.match(/^(#{1,6}) (.*)$/);
     if(heading){type='h'+heading[1].length;body=heading[2]}
     else if(/^> /.test(line)){type='quote';body=line.slice(2)}
     else if(/^---\s*$/.test(line)){type='hr';body='';extra='<hr contenteditable="false">'}
   }
   out.push(`<div data-mdblock="${type}"${attrs}>${extra}${body?mdInlineToEditor(body):'<br>'}</div>`);
 }
 return out.join('');
}
