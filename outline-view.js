"use strict";
// Theme application, full redraws, status helpers, grouping and drawing the Outline tree.
// Declarations only; loaded before the main script.
function storedTheme(){
 if(appearance.theme)return appearance.theme;
 if(appearanceTheme(db?.settings?.theme))return appearanceTheme(db.settings.theme);
 try{
   const t=localStorage.getItem("local-notes-todos-theme");
   if(appearanceTheme(t))return appearanceTheme(t);
 }catch{}
 return "light";
}
function applyTheme(theme=storedTheme()){
 const t=appearanceTheme(theme)||'light';
 document.body.dataset.theme=t;
 window.dispatchEvent(new CustomEvent('notes-theme-changed',{detail:t}));
}

function render(){
 window.dailyPlanner?.refresh();
 applyTheme();applySplitSetting();renderTree();if(!editorIsOpen())renderCalendar();renderStatus();
}
function renderStatus(){
 let ready=!!db;["saveFile","exportFile","archiveBrowser"].forEach(id=>$(id).disabled=!ready);
 $("showWeekends").disabled=!ready;$("showWeekends").checked=!weekendsHidden();$("storageStatus").textContent=(dirty?"Unsaved changes · ":"")+(storage.handle?`Connected: ${storage.name}`:db?`Loaded: ${storage.name||"new file"}${dirty?"":" · saved"}`:"No file open");updateDirtyUI();paintSaveState();$("notice").classList.toggle("hidden",!!db)
}

function normalizeStatusValue(v){
 const x=String(v||"").replace(/^["']|["']$/g,"").trim().toLowerCase().replace(/[_-]+/g," ");
 return TODO_STATUSES.find(s=>s.toLowerCase()===x)||
   (x==="waiting"?"Waiting for":x==="onhold"||x==="hold"?"On hold":null);
}
function parseSearchQuery(raw){
 const out={texts:[],tags:[],statuses:[],createdFrom:"",createdTo:"",scheduledFrom:"",scheduledTo:""};
 const tokens=String(raw||"").match(/[^\s"]+:"[^"]+"|"[^"]+"|\S+/g)||[];
 for(let token of tokens){
   if(/^#\S+/.test(token)){const t=normalizeTag(token);if(t)out.tags.push(t);continue}
   const m=token.match(/^([a-zA-Z]+):(.*)$/);
   if(m){
     const key=m[1].toLowerCase(),value=m[2].replace(/^"|"$/g,"");
     if(key==="tag"){const t=normalizeTag(value);if(t)out.tags.push(t);continue}
     if(key==="status"){const s=normalizeStatusValue(value);if(s)out.statuses.push(s);continue}
     const dm=value.match(/^(>=|<=|>|<)?(\d{4}-\d{2}-\d{2})$/);
     if(dm&&(key==="created"||key==="scheduled")){
       const op=dm[1]||">=";let d=dm[2];
       if(!validDate(d)){out.texts.push(token);continue}
       if(op===">"||op==="<"){const date=new Date(d+"T12:00:00Z");date.setUTCDate(date.getUTCDate()+(op===">"?1:-1));d=date.toISOString().slice(0,10)}
       if(key==="created"){if(op===">="||op===">")out.createdFrom=d;else out.createdTo=d}
       else {if(op===">="||op===">")out.scheduledFrom=d;else out.scheduledTo=d}
       continue
     }
   }
   out.texts.push(token.replace(/^"|"$/g,""));
 }
 return out;
}
function laterDate(a,b){return !a?b:!b?a:(a>b?a:b)}
function earlierDate(a,b){return !a?b:!b?a:(a<b?a:b)}


// Scoped to the Filters panel: a whole-document search ran once per Outline row and made redraws
// grow with the square of the library size (review 5).
function selectedStatusFilters(){
 const box=$("statusFilterBox")||document;
 return [...box.querySelectorAll("[data-status-filter]:checked")].map(x=>x.dataset.statusFilter);
}
function statusRecurringOnly(){return $("filterRecurrence").value==="recurring"}
function selectedItemTypes(){return [...$('filterType').selectedOptions].map(o=>o.value).filter(Boolean)}
function itemMatchesSelectedTypes(item){const types=selectedItemTypes();return !types.length||types.some(t=>t==='notes'?item.type==='Note':t==='targets'?item.type==='Todo'&&(!!item.target||(isMilestone(item)&&!!nearestPlanningAncestor(item,p=>p.type==='Todo'&&!!p.target))):item.type==='Todo'&&!item.target)}
function statusNotesOnly(){return selectedItemTypes().join(',')==='notes'}
function statusTodosOnly(){return selectedItemTypes().join(',')==='todos'}
function statusNotRecurring(){return $('filterRecurrence').value==='non-recurring'}
function clearStatusTypeMode(){for(const o of $('filterType').options)o.selected=false;$('filterRecurrence').value='';syncTypeFilter()}
function syncTypeFilter(){const types=selectedItemTypes();document.querySelectorAll('[data-type-filter]').forEach(c=>c.checked=types.includes(c.dataset.typeFilter))}
function showDoneItems(){return !!$('showDone')?.checked}
// Completion feedback (43): a just-completed Todo stays visible for a short grace period.
const completionGrace=new Map();
function doneIsVisible(status,_statuses,item){return !['Done','Cancelled','On hold'].includes(status)||showDoneItems()||!!(item&&completionGrace.has(item.id))}
let outlineDayFilter=null,outlineRevealId=null;
function weekendsHidden(){return db?.settings?.hideWeekends!==false}
function displayFilterActive(){return !!(weekendsHidden()||db?.settings?.hideRecurring)}
function statusFilterActive(){
 return !!(selectedStatusFilters().length||statusRecurringOnly()||selectedItemTypes().length||outlineDayFilter||statusNotRecurring()||displayFilterActive());
}
function isWeekendDateString(ds){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(ds||""))return false;
 const [y,m,d]=ds.split("-").map(Number),day=new Date(y,m-1,d,12).getDay();
 return day===0||day===6;
}
function itemPassesDisplayFilters(item){
 if(!itemMatchesSelectedTypes(item)||(item.type==='Todo'&&!doneIsVisible(item.status,parseSearchQuery($("search").value).statuses.length?parseSearchQuery($("search").value).statuses:selectedStatusFilters(),item)))return false;
 if(outlineDayFilter&&!scheduledGroupingDates(item).includes(outlineDayFilter))return false;
 if(db?.settings?.hideRecurring&&item.type==="Todo"&&item.recurrence?.frequency)return false;
 if(weekendsHidden()){
   const dates=scheduledGroupingDates(item);
   if(dates.length&&dates.every(isWeekendDateString))return false;
 }
 return true;
}
function updateStatusFilterLabel(){
 document.querySelectorAll("[data-recurrence-filter]").forEach(c=>c.checked=c.dataset.recurrenceFilter===$("filterRecurrence").value);
 const chips=[];
 const add=(key,label,clear)=>chips.push({key,label,clear});
 for(const type of selectedItemTypes())add('type-'+type,{notes:'Notes',todos:'Todos',targets:'Targets'}[type],()=>{for(const o of $('filterType').options)if(o.value===type)o.selected=false;$('filterType').dispatchEvent(new Event('change'))});
 const recurrence=$('filterRecurrence').value;
 if(recurrence)add('recurrence',recurrence==='recurring'?'Recurring':'Non-recurring',()=>{$('filterRecurrence').value='';$('filterRecurrence').dispatchEvent(new Event('change'))});
 for(const status of selectedStatusFilters())add('status-'+status,status,()=>{const cb=[...document.querySelectorAll('[data-status-filter]')].find(c=>c.dataset.statusFilter===status);cb.checked=false;cb.dispatchEvent(new Event('change'))});
 if(showDoneItems())add('show-done','Show inactive',()=>{$('showDone').checked=false;$('showDone').dispatchEvent(new Event('change'))});
 const shortDate=d=>new Date(d+'T12:00:00').toLocaleDateString('en-GB');
 for(const [key,label] of [['created','Created'],['scheduled','Scheduled']]){
   const from=$(key+'From').value,to=$(key+'To').value;
   if(from||to)add(key,label+(from&&to?': '+shortDate(from)+' – '+shortDate(to):from?' ≥ '+shortDate(from):' ≤ '+shortDate(to)),()=>$(key==='created'?'clearCreatedDates':'clearScheduledDates').click());
 }
 if(db&&!weekendsHidden())add('weekends','Show weekends',()=>{$('showWeekends').checked=false;$('showWeekends').dispatchEvent(new Event('change'))});
 if(db?.settings?.hideRecurring)add('hide-recurring','Hide recurring',()=>{checkpoint();db.settings.hideRecurring=false;markDirty();render()});
 if(outlineDayFilter)add('day','Day: '+shortDate(outlineDayFilter),()=>clearOutlineDayFilter());
 if($('search').value)add('search','Search: '+$('search').value,()=>{$('search').value='';$('search').dispatchEvent(new Event('input'))});
 const host=$('activeFilterChips'),focused=document.activeElement?.dataset?.removeFilter;
 host.replaceChildren();
 for(const chip of chips){
   const el=document.createElement('span');el.className='activeFilterChip';
   const label=document.createElement('span');label.textContent=chip.label;
   const button=document.createElement('button');button.type='button';button.textContent='×';button.dataset.removeFilter=chip.key;button.setAttribute('aria-label','Remove '+chip.label+' filter');
   button.onclick=()=>{const expanded=$('filtersToggle').getAttribute('aria-expanded');chip.clear();if(!document.activeElement?.dataset?.removeFilter)$('filtersToggle').focus({preventScroll:true});$('filtersToggle').setAttribute('aria-expanded',expanded)};
   el.append(label,button);host.append(el);
 }
 if(focused){const button=[...host.querySelectorAll('button')].find(b=>b.dataset.removeFilter===focused);button?.focus({preventScroll:true})}
 $('statusFilterBox').classList.toggle('has-filter',chips.length>0);
 $('clearAllFilters').hidden=chips.length===0;
 updateOutlineToolbarState();
}

function updateDateFilterSection(){updateStatusFilterLabel()}

function dateFilterValidation(){
 const cf=$("createdFrom")?.value||"",ct=$("createdTo")?.value||"",sf=$("scheduledFrom")?.value||"",st=$("scheduledTo")?.value||"";
 if(cf&&ct&&cf>ct)return {kind:"created",message:"Created date range is invalid: From must be on or before To."};
 if(sf&&st&&sf>st)return {kind:"scheduled",message:"Scheduled date range is invalid: From must be on or before To."};
 return null;
}
function updateDateFilterValidation(){
 const err=dateFilterValidation(),box=$("dateFilterError");
 ["createdFrom","createdTo","scheduledFrom","scheduledTo"].forEach(id=>$(id)?.removeAttribute("aria-invalid"));
 if(box){
   box.classList.toggle("hidden",!err);
   box.textContent=err?.message||"";
 }
 if(err){
   const ids=err.kind==="created"?["createdFrom","createdTo"]:["scheduledFrom","scheduledTo"];
   ids.forEach(id=>$(id)?.setAttribute("aria-invalid","true"));
 }
 return err;
}

function clearAllFilters(){
 outlineDayFilter=null;outlineRevealId=null;$("showDone").checked=false;$("search").value="";
 clearFilterSection();
}


let branchZoomLocation=null,branchZoomRoot=null,branchZoomHistory=[],branchZoomCollapsed=false;
function zoomRootItem(){
 const root=branchZoomRoot&&db&&itemById(db,branchZoomRoot);
 if(branchZoomRoot&&(!root||root.archived)){branchZoomRoot=null;branchZoomHistory=[]}
 return root&&!root.archived?root:null;
}
function inZoomBranch(item){
 const root=zoomRootItem();if(!root)return true;
 if(db.locations){const g=locationsForRead(db),id=branchZoomLocation||g.primary(root).id;return g.byItem.get(item.id)?.some(p=>g.chain(p).some(a=>a.id===id))}
 let current=item;const seen=new Set();
 while(current&&!seen.has(current.id)){if(current.id===root.id)return true;seen.add(current.id);current=current.parentId?itemById(db,current.parentId):null}return false;
}
function zoomIntoBranch(){
 const item=selected&&itemById(db,selected);if(!item||item.archived||item.id===branchZoomRoot||!inZoomBranch(item))return;
 branchZoomHistory.push({location:branchZoomLocation,root:branchZoomRoot,selected:item.id,scroll:$('tree').scrollTop,collapsed:branchZoomCollapsed});branchZoomRoot=item.id;branchZoomLocation=db.locations?new OutlineLocations(db).selected(item).id:null;branchZoomCollapsed=false;
 outlineRevealId=null;multiSelected.clear();milestoneSelection=null;render();$('tree').scrollTop=0;focusOutlineItem(item.id);
}
function zoomOutBranch(){
 if(!zoomRootItem())return;
 const previous=branchZoomHistory.pop();branchZoomLocation=previous?.location||null;branchZoomRoot=previous?.root||null;branchZoomCollapsed=previous?.collapsed||false;selected=previous?.selected||selected;
 if(!itemById(db,selected)||!inZoomBranch(itemById(db,selected)))selected=branchZoomRoot;
 outlineRevealId=null;multiSelected.clear();milestoneSelection=null;render();
 $('tree').scrollTop=previous?.scroll||0;focusOutlineItem(selected);
 if(editorIsOpen()&&selected)edit(selected);
}
function updateBranchZoomBar(){
 const root=zoomRootItem();$('branchZoomBar').classList.toggle('hidden',!root);
 $('branchZoomLabel').textContent=root?'› '+(root.title||'(untitled)'):'';
}

function directMatchedItems(){
 if(!db)return [];
 const q=parseSearchQuery($("search").value),uiStatus=selectedStatusFilters();
 if($('search').value.trim())return filterItems(db,{texts:q.texts,tags:q.tags,status:q.statuses,createdFrom:q.createdFrom,createdTo:q.createdTo,scheduledFrom:q.scheduledFrom,scheduledTo:q.scheduledTo,scheduledDatesForItem:scheduledGroupingDates}).filter(item=>item.type!=='Todo'||doneIsVisible(item.status,null,item));
 const statuses=q.statuses.length?q.statuses:uiStatus;
 const tags=[...q.tags].filter(Boolean);
 const typeMode=statusNotesOnly()?"notes":statusTodosOnly()?"todos":"";
 return filterItems(db,{
   texts:q.texts,status:statuses,tags,typeMode,recurringOnly:statusRecurringOnly(),notRecurring:statusNotRecurring(),
   createdFrom:laterDate(q.createdFrom,$("createdFrom").value),
   createdTo:earlierDate(q.createdTo,$("createdTo").value),
   scheduledFrom:laterDate(q.scheduledFrom,$("scheduledFrom").value),
   scheduledTo:earlierDate(q.scheduledTo,$("scheduledTo").value),
   scheduledDatesForItem:scheduledGroupingDates
 }).filter(item=>inZoomBranch(item)&&itemPassesDisplayFilters(item));
}
function matchedSet(){
 const arr=directMatchedItems(),s=new Set(arr.map(x=>x.id));
 const revealed=outlineRevealId===selected?itemById(db,selected):null;if(revealed&&!revealed.archived&&inZoomBranch(revealed)&&!s.has(revealed.id)){arr.push(revealed);s.add(revealed.id)}
 if(arr.length)for(const i of arr){let p=i.id===branchZoomRoot?null:i.parentId;while(p){s.add(p);if(p===branchZoomRoot)break;p=itemById(db,p)?.parentId}}
 if(db.locations){const g=new OutlineLocations(db);s.locations=new Set();for(const i of arr)for(const p of g.byItem.get(i.id)||[])for(const a of g.chain(p)){s.add(a.item.id);s.locations.add(a.id)}}
 if(zoomRootItem())s.add(branchZoomRoot);
 if(headingFilterActive())for(const i of db.items)if(i.heading&&s.has(i.id)&&!headingSection(i).some(x=>s.has(x.id)))s.delete(i.id);
 for(const id of [...s]){const h=headingAbove(itemById(db,id));if(h)s.add(h.id)}
 return s
}
// A real filter (not just "hide finished items" or the weekend setting) hides headings with nothing visible under them.
function headingFilterActive(){return !!(selectedStatusFilters().length||statusRecurringOnly()||statusNotRecurring()||selectedItemTypes().length||outlineDayFilter||$('createdFrom').value||$('createdTo').value||$('scheduledFrom').value||$('scheduledTo').value)}
function headingAbove(item){
 if(!item||item.heading)return null;
 const siblings=childrenOf(db,item.parentId||null).filter(x=>!x.archived).sort((a,b)=>a.order-b.order);
 for(let n=siblings.findIndex(x=>x.id===item.id)-1;n>=0;n--)if(siblings[n].heading)return siblings[n];
 return null;
}
function headingContextPath(item){
 const parts=[];let cur=item;const seen=new Set();
 while(cur&&!seen.has(cur.id)){seen.add(cur.id);const h=headingAbove(cur);if(h)parts.unshift(h.title||'(untitled)');const parent=itemById(db,cur.parentId);if(parent)parts.unshift(parent.title||'(untitled)');cur=parent}
 return parts.join(' › ');
}
const GROUP_BY_VALUES=["","created","scheduled","type","tag","status","target"];
const collapsedOutlineGroups=new Set();
function currentGroupBy(){
 if(zoomRootItem())return '';
 const v=db?.settings?.groupBy||"";
 return GROUP_BY_VALUES.includes(v)?v:"";
}
function syncGroupByUI(){
 const mode=currentGroupBy();
 $('groupBySelect').value=mode;
 $('groupBySelect').disabled=!!zoomRootItem();
 $("groupByBox")?.classList.toggle("has-filter",!!mode);
 updateOutlineToolbarState();
}
function outlineTargetMonth(month){return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(month.slice(5,7))-1]+' '+month.slice(2,4)}
function groupDateLabel(ds){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(ds||""))return ds||"No date";
 const [y,m,d]=ds.split("-").map(Number);
 return new Date(y,m-1,d,12).toLocaleDateString('en-GB');
}
function targetLocationGroups(graph,items){
 const groups=new Map();
 for(const item of items)for(const p of graph.byItem.get(item.id)||[]){
   const path=graph.chain(p),n=path.findLastIndex(n=>n.item.target),target=path[n],key=target?'target:'+target.id:'~notarget';
   if(!groups.has(key))groups.set(key,{key,location:target,places:new Set()});
   const group=groups.get(key);for(const node of path.slice(Math.max(n,0)))group.places.add(node.id);
 }
 return [...groups.values()].sort((a,b)=>!a.location?1:!b.location?-1:graph.code(a.location).localeCompare(graph.code(b.location),undefined,{numeric:true}));
}
function targetOutlineGroups(items){
 const groups=new Map();
 for(const item of items){
   const target=item.type==='Todo'&&item.target?item:nearestPlanningAncestor(item,p=>p.type==='Todo'&&!!p.target);
   const key=target?'target:'+target.id:'~notarget';
   if(!groups.has(key))groups.set(key,{key,label:target?target.title||'(untitled Target)':'No Target',items:[],target});
   const group=groups.get(key);let current=item;
   // Include intermediate ancestors as context, stopping at this group's Target.
   while(current&&!current.archived){
     if(!group.items.some(i=>i.id===current.id))group.items.push(current);
     if(current.id===target?.id)break;
     current=current.parentId?itemById(db,current.parentId):null;
   }
 }
 const result=[...groups.values()];
 result.sort((a,b)=>!a.target?1:!b.target?-1:itemCode(db,a.target).localeCompare(itemCode(db,b.target),undefined,{numeric:true}));
 for(const group of result)group.items.sort((a,b)=>a.order-b.order);
 return result;
}
// Grouped Outline headers share the Outline's own disclosure chevron.
function outlineGroupHead(key,collapsed,label,count,depth=0,countTitle=''){
 return `<button type="button" class="outlineGroupHead" data-group-toggle="${esc(key)}" aria-expanded="${collapsed?"false":"true"}" style="--group-depth:${depth}"><span class="groupHeadLabel"><span class="groupChevron" aria-hidden="true">${disclosureIcon(!collapsed)}</span><span class="groupHeadTitle">${esc(label)}</span></span><span class="groupHeadCount"${countTitle?` title="${esc(countTitle)}"`:''}>${esc(String(count))}</span></button>`;
}
// Nested tags (a/b/c) form a tree: children follow their nearest ancestor group and collapse with it.
function tagGroupTree(groups){
 const tagOf=g=>g.key.startsWith('tag:')?g.key.slice(4):null,byTag=new Map();
 for(const g of groups){const tag=tagOf(g);if(tag!==null)byTag.set(tag,g)}
 const nodes=new Map();
 for(const g of groups){
  const tag=tagOf(g);if(tag===null){nodes.set(g.key,{label:g.label,depth:0,ancestors:[],total:g.items.length});continue}
  const parts=tag.split('/'),ancestors=[];let parentTag=null;
  for(let n=1;n<parts.length;n++){const a=parts.slice(0,n).join('/');if(byTag.has(a)){ancestors.push('tag:'+a);parentTag=a}}
  nodes.set(g.key,{label:parentTag?tag.slice(parentTag.length+1):g.label,depth:ancestors.length,ancestors,total:0,tag});
 }
 for(const g of groups){const node=nodes.get(g.key);if(node.tag===undefined)continue;const ids=new Set();
  for(const [tag,other] of byTag)if(tag===node.tag||tag.startsWith(node.tag+'/'))other.items.forEach(i=>ids.add(i.id));node.total=ids.size}
 const tagged=groups.filter(g=>tagOf(g)!==null).sort((a,b)=>{const x=tagOf(a).split('/'),y=tagOf(b).split('/');for(let i=0;i<Math.min(x.length,y.length);i++){const c=compareTags(x[i],y[i]);if(c)return c}return x.length-y.length});
 return {nodes,order:[...tagged,...groups.filter(g=>tagOf(g)===null)]};
}
function outlineGroups(items,mode){
 if(mode==='target')return targetOutlineGroups(items);
 const map=new Map(),add=(key,label,item)=>{
   if(!map.has(key))map.set(key,{key,label,items:[]});
   if(!map.get(key).items.some(x=>x.id===item.id))map.get(key).items.push(item);
 };
 for(const i of items){
   if(mode==="created"){
     const ds=(i.createdAt||"").slice(0,10)||"unknown";
     add(ds,ds==="unknown"?"No creation date":groupDateLabel(ds),i);
   }else if(mode==="scheduled"){
     const dedicated=i.type==="Note"?"~notes":isMilestone(i)?"~milestones":i.target?"~targets":null;
     if(dedicated)add(dedicated,dedicated==="~notes"?"Notes":dedicated==="~milestones"?"Milestones":"Targets",i);
     const groupingDates=scheduledGroupingDates(i);
     let dates=groupingDates.slice().sort();
     if(weekendsHidden())dates=dates.filter(ds=>!isWeekendDateString(ds));
     if(dates.length)dates.forEach(ds=>add(ds,groupDateLabel(ds),i));
     else if(!dedicated&&!isRecurringTodo(i)&&!groupingDates.length)add("~unscheduled","Unscheduled",i);
   }else if(mode==="type"){
     add(i.type==="Note"?"1-note":"2-todo",i.type==="Note"?"Notes":"Todos",i);
   }else if(mode==="status"){
     const status=i.type==="Todo"?i.status:"Notes";add(String(i.type==="Todo"?TODO_STATUSES.indexOf(status):5)+"-"+status,status,i);
   }else if(mode==="tag"){
     const tags=inheritedTags(db,i);
     if(tags.length)tags.forEach(tag=>add("tag:"+tag,"#"+tag,i));
     else add("~notag","No tag",i);
   }
 }
 let groups=[...map.values()];
 if(mode==="created")groups.sort((a,b)=>b.key.localeCompare(a.key));
 else if(mode==="scheduled"){const rank=key=>({"~unscheduled":-1,"~notes":2,"~milestones":3,"~targets":4}[key]||0);groups.sort((a,b)=>rank(a.key)-rank(b.key)||a.key.localeCompare(b.key))}
 else groups.sort((a,b)=>a.key.localeCompare(b.key));
 for(const g of groups)g.items.sort((a,b)=>itemCode(db,a).localeCompare(itemCode(db,b)));
 return groups;
}
function currentDisclosureKey(){return JSON.stringify([$("search").value,selectedStatusFilters(),selectedItemTypes(),showDoneItems(),outlineDayFilter,$("filterRecurrence").value,db?.settings?.hideWeekends,db?.settings?.hideRecurring,...["createdFrom","createdTo","scheduledFrom","scheduledTo"].map(id=>$(id).value)])}
function outlineFiltering(){return !!($("search").value||statusFilterActive()||["createdFrom","createdTo","scheduledFrom","scheduledTo"].some(id=>$(id).value))}
function outlineCollapsed(item){if(item.id===branchZoomRoot)return branchZoomCollapsed;return outlineFiltering()?(filterDisclosure.get(item.id)??false):!!item.collapsed}
function setOutlineCollapsed(item,value){if(item.id===branchZoomRoot){branchZoomCollapsed=value;return}item.collapsed=value;if(outlineFiltering())filterDisclosure.set(item.id,value)}
function renderTree(){
 renderOutlineTree();
 // HTML style attributes are rejected by the packaged nonce-based CSP.
 for(const container of [$('tree'),$('pinnedOutline')]){
   container.querySelectorAll('[data-hierarchy-depth]').forEach(row=>row.style.setProperty('--hierarchy-depth',Number(row.dataset.hierarchyDepth)||0));
   container.querySelectorAll('[data-pin-depth]').forEach(row=>row.style.setProperty('--pin-depth',Number(row.dataset.pinDepth)||0));
 }
}
// Outline indentation (45, 47): one level equals the 20 px arrow slot plus the 5 px gap, so a child's
// arrow sits exactly under its parent's marker at every interface size. Levels past 6 indent a third as much.
function outlineIndent(depth){
 const step=25;
 return 6+step*Math.min(depth,6)+Math.round(step/3)*Math.max(0,depth-6);
}
// Headings (44): a collapsed heading hides the rows after it up to the next heading at its level
// (or the end of its parent). Headings are structural, so grouped views leave them out.
function applyHeadingSections(t){
 const rows=[...t.querySelectorAll('.row[data-id]')],grouped=!!currentGroupBy();let hide=null;
 for(const r of rows){
   const depth=Number(r.dataset.hierarchyDepth)||0,isHeading=r.classList.contains('headingRow');
   if(hide&&(depth<hide.depth||(depth===hide.depth&&isHeading)))hide=null;
   r.classList.toggle('sectionHidden',!!hide||(grouped&&isHeading));
   if(isHeading&&!hide&&!grouped&&itemById(db,r.dataset.id)?.collapsed)hide={depth};
 }
}
function toggleHeadingSection(h,open=null){if(!h?.heading)return;h.collapsed=open===null?!h.collapsed:!open;db.updatedAt=now();markDirty();renderTree();focusOutlineItem(h.id)}
function headingSection(h){
 const siblings=childrenOf(db,h.parentId||null).filter(x=>!x.archived).sort((a,b)=>a.order-b.order),start=siblings.findIndex(x=>x.id===h.id),out=[];
 for(const x of siblings.slice(start+1)){if(x.heading)break;out.push(x)}
 return out;
}
function convertHeadingToParent(h){
 const section=headingSection(h);checkpoint();const before=codeMapBefore(activeItems(db).map(x=>x.id));
 delete h.heading;h.collapsed=false;section.forEach((x,index)=>moveItem(db,x.id,h.id,index));touch(db,h);rememberChangedCodes(before);
 selected=h.id;render();toast('Heading converted to a parent item');
}
function convertHeadingToNote(h){checkpoint();delete h.heading;touch(db,h);render();toast('Heading converted to a Note')}
function renderOutlineTree(){const navigationSessions=upcomingItemSessions();locationIndex=null;queueMicrotask(updateOutlinePaneMarker);refreshInlineTodos();paintTargetSelection();
 updateBranchZoomBar();
 const previousScrollTop=$("tree").scrollTop;
 rememberFocusedItem();
 const focusedRow=document.activeElement?.closest?.('.row[data-id]')?.dataset.id;
 queueMicrotask(()=>{const row=locationRow(selected);if(row){if(!recurrenceViewportHold)row.scrollIntoView({block:'nearest'});if(focusedRow&&focusedRow===selected&&!isTextEntry(document.activeElement))row.focus({preventScroll:true})}});
 const searching=!!$('search').value.trim();
 const disclosureKey=currentDisclosureKey();if(!searching&&disclosureKey!==filterDisclosureKey){filterDisclosure.clear();filterDisclosureKey=disclosureKey}

 const t=$("tree");updateDateFilterSection();syncGroupByUI();
 const dateErr=updateDateFilterValidation();
 if(!db){$('pinnedOutline').hidden=true;t.innerHTML='<div class="empty welcomeEmpty"><p><strong>Welcome to YTNH</strong></p><p>New here? The Tour is a practice library that shows you around in a few minutes.</p><div class="welcomeActions"><button type="button" class="primary" data-welcome="tour">Take the Tour</button><button type="button" data-welcome="new">New Library…</button><button type="button" data-welcome="open">Open Library…</button></div></div>';t.querySelectorAll('[data-welcome]').forEach(b=>b.onclick=()=>{const k=b.dataset.welcome;if(k==='tour')YTNHTour.open();else $(k==='new'?'newFile':'openFile').click()});return}

 const match=searching?null:matchedSet(),filtering=!!(!showDoneItems()||$("search").value||statusFilterActive()||$("createdFrom").value||$("createdTo").value||$("scheduledFrom").value||$("scheduledTo").value);
 const graph=db.locations?locationsForRead(db):null,chosen=graph?.selected(itemById(db,selected));
 const rowRaw=(i,d,{grouped=false,shortcut=false,hierarchy=false,allowed=null,heading=null,location=graph?.primary(i)}={})=>{
   const current=selected===i.id&&(!graph||location?.id===chosen?.id);
   if(allowed&&!allowed.has(graph&&hierarchy?location.id:i.id))return '';
   if(!grouped&&(filtering||graph)&&!(match?.locations?match.locations.has(location.id):match.has(i.id)))return '';
   const kids=graph?graph.siblings(location.id):childrenOf(db,i.id),ks=kids;
   const renderChild=(child,depth)=>row(graph?child.item:child,depth,{grouped,hierarchy,allowed,location:graph?child:undefined});
   if(!shortcut&&i.type==='Todo'&&!doneIsVisible(i.status,null,i))return heading?'':ks.map(k=>renderChild(k,d)).join('');
   const cl=i.type==='Todo'&&i.status==='Done'?'done':i.status==='Cancelled'?'cancelled':'',tags=inheritedTags(db,i);
   let visualDepth=d;
   if(grouped&&!hierarchy){
     visualDepth=0;
     if(!shortcut&&allowed){
       if(graph){for(const ancestor of graph.chain(location).slice(0,-1))if(allowed.has(ancestor.item.id))visualDepth++}
       else{let parent=itemById(db,i.parentId);const seen=new Set();while(parent&&!seen.has(parent.id)){seen.add(parent.id);if(allowed.has(parent.id))visualDepth++;parent=itemById(db,parent.parentId)}}
     }
   }
   const indent=outlineIndent(visualDepth);
   const count=graph?.byItem.get(i.id)?.length||1;
   const link=count>1?`<button type="button" class="locationButton" aria-label="Linked item — ${count} locations" title="Linked item — ${count} locations"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M9 15H7a4 4 0 0 1 0-8h4m2 0h4a4 4 0 0 1 0 8h-2M8 11h8"/></svg></button>`:'';
   const collapsed=graph?(branchZoomRoot===i.id?branchZoomCollapsed:outlineFiltering()?(filterDisclosure.get(location.id)??false):location.collapsed):outlineCollapsed(i);
   // Only children that would actually be shown (filters, hidden weekends/recurring items, search) earn an arrow.
   const shownKids=(filtering||graph)&&match&&!grouped?ks.filter(k=>match.locations?match.locations.has(k.id):match.has((k.item||k).id)):ks;
   const showArrow=hasDisclosureChild(shownKids),groupArrow=heading&&(!ks.length||showArrow);
   const icons='';
   const metadata=[
     isMilestone(i)?`<span class="outlineMilestone" aria-label="Milestone ${esc(i.milestone.targetWeek)}">W${i.milestone.targetWeek.slice(6)}/${i.milestone.targetWeek.slice(2,4)}</span>`:'',
     i.type==='Todo'&&i.target?`<span class="outlineTarget" aria-label="Long-term target ${esc(i.target.startMonth)} to ${esc(i.target.endMonth)}">${outlineTargetMonth(i.target.startMonth)} – ${outlineTargetMonth(i.target.endMonth)}</span>`:'',
     !i.heading&&tags.length?`<span class="tags">${tags.map(tag=>`<span class="outlineTag">#${esc(tag)}</span>`).join('')}</span>`:'',
     heading?`<span class="targetGroupCount" aria-label="${heading.count} items">${heading.count}</span>`:''
   ].filter(Boolean).join('');
   return `<div class="row ${i.heading?'headingRow':''} ${current?'currentItem':''} ${grouped?'grouped-row':''} ${outlineDayFilter&&!scheduledGroupingDates(i).includes(outlineDayFilter)?'day-context-row':''} ${heading?'targetGroupRow':''} ${current||(graph&&multiLocations.size?multiLocations.has(location.id):multiSelected.size>1&&multiSelected.has(i.id))?'sel':''} ${i.type==='Todo'?statusClass(i.status||'Todo'):''}" data-id="${esc(i.id)}" data-location="${esc(location?.id||i.id)}" data-item-type="${i.type}" draggable="true" tabindex="-1" role="treeitem" aria-level="${visualDepth+1}" aria-selected="${current?'true':'false'}" data-indent="${indent}" data-hierarchy-depth="${visualDepth}" ${groupArrow||showArrow?`aria-expanded="${heading?!heading.collapsed:!collapsed}"`:''}>${groupArrow?`<button type="button" class="targetGroupToggle outlineChevron" data-group-toggle="${esc(heading.key)}" aria-label="${heading.collapsed?'Expand':'Collapse'} Target group" aria-expanded="${!heading.collapsed}">${disclosureIcon(!heading.collapsed)}</button>`:!shortcut&&(!grouped||hierarchy)?(i.heading?`<button type="button" tabindex="-1" class="outlineChevron headingToggle" data-heading-toggle="${esc(i.id)}" aria-label="${i.collapsed?'Expand':'Collapse'} section" aria-expanded="${!i.collapsed}">${disclosureIcon(!i.collapsed)}</button>`:showArrow?disclosureButton(!collapsed,'treeExpand'):'<span class="chevronSpace" aria-hidden="true"></span>'):''}${i.heading?'':itemMarker(i,{code:true,outline:true})}<div class="outlineText"><div class="outlineTitleLine"><span class="title ${cl}">${esc(i.title||'(untitled)')}</span>${icons?`<span class="outlineIcons">${icons}</span>`:''}</div>${searching?imageSearchResult(i,$("search").value):''}${metadata?`<div class="outlineMetadata">${metadata}</div>`:''}</div>${link}${outlineNavigationIndicators(i,navigationSessions)}</div>${heading||(grouped&&!hierarchy)||collapsed?'':ks.map(k=>renderChild(k,d+1)).join('')}`;
 };
 // Remember how every row was built so one changed row can be rebuilt alone (patchRender).
 const rowArgs=new Map();
 const row=(i,d,opts)=>{rowArgs.set(((opts&&opts.location)||graph?.primary(i))?.id||i.id,[i,d,opts]);return rowRaw(i,d,opts)};
 outlineRowContext={db,row:rowRaw,args:rowArgs,searching,mode:currentGroupBy(),filtersKey:outlineFilterKey()};
 paintPins(row,graph);
 if(dateErr&&!searching){t.innerHTML=`<div class="empty filterError">${esc(dateErr.message)}</div>`;return}
 if(searching){
   t.innerHTML=rankItems(directMatchedItems().filter(inZoomBranch),parseSearchQuery($('search').value).texts,{stable:true}).flatMap(item=>graph?graph.byItem.get(item.id).filter(location=>!branchZoomRoot||graph.chain(location).some(p=>p.id===branchZoomLocation)).map(location=>row(item,0,{grouped:true,location})):row(item,0,{grouped:true})).join('')||'<div class="empty">No matching items.</div>';
   if(!graph)t.querySelectorAll('.row[data-id]').forEach(r=>{const item=itemById(db,r.dataset.id),path=item?headingContextPath(item):'';const line=r.querySelector('.outlineTitleLine');if(path&&line){const c=document.createElement('div');c.className='searchContext';c.textContent=path;line.after(c)}});
   if(db.planner&&!zoomRootItem())DailyMeetingEditor.search(t,$('search').value.trim());
   paintHierarchy(t,hierarchyViews.outline,row,false);t.scrollTop=previousScrollTop;
   return;
 }
 const mode=currentGroupBy();
 if(mode){
   const items=directMatchedItems(),revealed=outlineRevealId===selected?itemById(db,selected):null;if(revealed&&!revealed.archived&&!items.some(i=>i.id===revealed.id))items.push(revealed);
   const groups=graph&&mode==='target'?targetLocationGroups(graph,items):outlineGroups(items,mode);
   const tagTree=mode==='tag'?tagGroupTree(groups):null,shown=tagTree?tagTree.order:groups;
   t.innerHTML=shown.length?shown.map(g=>{
     const collapseKey=mode+"|"+g.key,collapsed=collapsedOutlineGroups.has(collapseKey);
     const node=tagTree?.nodes.get(g.key);if(node&&node.ancestors.some(a=>collapsedOutlineGroups.has(mode+"|"+a)))return '';
     if(graph&&mode==='target'){
       const target=g.location,allowed=g.places;
       const show=(p,depth,heading=null)=>row(p.item,depth,{grouped:true,hierarchy:true,allowed,location:p,heading});
       const closed=collapsed||(target&&(outlineFiltering()?(filterDisclosure.get(target.id)??false):target.collapsed));
       if(target){const head=show(target,0,{key:collapseKey,collapsed:closed,count:allowed.size});const kids=closed?'':graph.siblings(target.id).map(n=>show(n,1)).join('');return `<section class="outlineGroup" data-group-key="${esc(g.key)}">${head}${kids}</section>`}
       const rows=collapsed?'':[...allowed].map(id=>graph.nodes.get(id)).filter(p=>!allowed.has(p.parent)).map(p=>show(p,0)).join('');
       return `<section class="outlineGroup" data-group-key="~notarget">${outlineGroupHead(collapseKey,collapsed,"No Target",allowed.size)}${rows}</section>`;
     }
     const allowed=new Set(g.items.map(i=>i.id)),roots=mode==='target'?g.items.filter(i=>!allowed.has(i.parentId)):g.items;
     if(mode==='target'&&g.target){
       const closed=collapsed||outlineCollapsed(g.target);
       const header=row(g.target,0,{grouped:true,hierarchy:true,allowed,heading:{key:collapseKey,collapsed:closed,count:g.items.length}});
       const descendants=closed?'':childrenOf(db,g.target.id).map(i=>row(i,doneIsVisible(g.target.status)?1:0,{grouped:true,hierarchy:true,allowed})).join('');
       return `<section class="outlineGroup" data-group-key="${esc(g.key)}">${header}${descendants}</section>`;
     }
     const rows=collapsed?'':roots.flatMap(i=>graph&&mode!=='target'?graph.byItem.get(i.id).map(location=>row(i,0,{grouped:true,allowed,location})):row(i,0,{grouped:true,hierarchy:mode==='target',allowed})).join('');
     return `<section class="outlineGroup" data-group-key="${esc(g.key)}"${node?.depth?` style="margin-inline-start:${node.depth*16}px"`:""}>${node?outlineGroupHead(collapseKey,collapsed,node.label,node.total>g.items.length?g.items.length+" · "+node.total:g.items.length,node.depth,node.total>g.items.length?g.items.length+" tagged directly, "+node.total+" including nested tags":""):outlineGroupHead(collapseKey,collapsed,g.label,g.items.length)}${rows}</section>`
   }).join(""):'<div class="empty">No matching items.</div>';
   t.querySelectorAll('[data-indent]').forEach(el=>el.style.paddingLeft=Number(el.dataset.indent)+'px');
   paintHierarchy(t,hierarchyViews.outline,row,false);t.scrollTop=previousScrollTop;
   return;
 }
 const roots=zoomRootItem()?[zoomRootItem()]:activeItems(db).filter(x=>!x.parentId).sort((a,b)=>a.order-b.order);
 t.innerHTML=(graph?(zoomRootItem()?[graph.nodes.get(branchZoomLocation)||graph.primary(zoomRootItem())]:graph.siblings(null)).map(location=>row(location.item,0,{location})):roots.map(r=>row(r,0))).join("")||'<div class="empty">No matching items.</div>';
 t.querySelectorAll('[data-indent]').forEach(el=>el.style.paddingLeft=Number(el.dataset.indent)+'px');
 paintHierarchy(t,hierarchyViews.outline,row,false);applyHeadingSections(t);t.scrollTop=previousScrollTop;
}
function mondayOf(date){
 const d=new Date(date.getFullYear(),date.getMonth(),date.getDate(),12),off=(d.getDay()+6)%7;d.setDate(d.getDate()-off);return d
}

// Single-row updates: when one item changes but the Outline's structure cannot, rebuild just
// that row from the arguments of the last full redraw. Searches, filters, grouping, zoom,
// linked items, pins and any change in the number of rows all fall back to a full redraw.
let outlineRowContext=null;
function outlineFilterKey(){return JSON.stringify([$('search').value,selectedStatusFilters(),selectedItemTypes(),statusRecurringOnly(),statusNotRecurring(),showDoneItems(),['createdFrom','createdTo','scheduledFrom','scheduledTo'].map(id=>$(id).value),currentGroupBy(),outlineDayFilter,branchZoomRoot,db?.settings?.hideWeekends,db?.settings?.hideRecurring])}
function outlinePatchable({finishingEdit=false}={}){
 const c=outlineRowContext;
 return !!(c&&db&&c.db===db&&!c.searching&&!c.mode&&!db.locations&&!hierarchyViews.outline&&!branchZoomRoot
   &&!$('search').value&&!selectedStatusFilters().length&&!selectedItemTypes().length
   &&c.filtersKey===outlineFilterKey()&&(finishingEdit||!$('tree').querySelector('.inlineEdit')));
}
function outlineRowDepth(r){return Number(r.dataset.hierarchyDepth)}
function patchOutlineRow(id){
 const rows=$('tree').querySelectorAll(`.row[data-id="${CSS.escape(id)}"]`);if(rows.length!==1)return false;
 const old=rows[0],args=outlineRowContext.args.get(old.dataset.location);if(!args)return false;
 const tpl=document.createElement('template');tpl.innerHTML=outlineRowContext.row(...args);
 const fresh=tpl.content.firstElementChild;if(!fresh||!fresh.matches('.row')||fresh.dataset.id!==id)return false;
 // The row's visible children follow it in the flat list; their number must stay the same.
 let shown=0;for(let r=old.nextElementSibling;r?.matches?.('.row')&&outlineRowDepth(r)>outlineRowDepth(old);r=r.nextElementSibling)shown++;
 if(shown!==tpl.content.querySelectorAll('.row').length-1)return false;
 fresh.style.paddingLeft=fresh.dataset.indent+'px';old.replaceWith(fresh);return true;
}
// The Calendar only shows items with dates, recurrence, a target or a milestone.
function onCalendar(item){return !!(item&&((item.scheduledDates||[]).length||isRecurringTodo(item)||item.target||isMilestone(item)))}
function patchRenderFinish(ids){window.dailyPlanner?.refresh();if(!editorIsOpen()&&ids.some(id=>onCalendar(itemById(db,id))))renderCalendar();renderStatus();refreshInlineTodos();paintOutlineSelection()}
function patchRender(ids,options={}){
 if(!outlinePatchable(options))return false;
 const pins=new Set(pinnedIds());if(ids.some(id=>pins.has(id)))return false;
 for(const id of ids)if(!patchOutlineRow(id))return false;
 patchRenderFinish(ids);return true;
}
// A finished Todo leaving the Outline: remove its row when nothing else can change shape.
function patchRemoveOutlineRow(id){
 if(!outlinePatchable())return false;
 const item=itemById(db,id);if(!item||doneIsVisible(item.status,null,item)||pinnedIds().includes(id))return false;
 const rows=$('tree').querySelectorAll(`.row[data-id="${CSS.escape(id)}"]`);if(rows.length!==1)return false;
 const row=rows[0],d=outlineRowDepth(row),next=row.nextElementSibling;
 if(next?.matches?.('.row')&&outlineRowDepth(next)>d)return false; // it has visible children
 // Keep the parent's arrow valid: another sibling must remain under the same parent.
 const sibling=step=>{for(let r=row[step];r?.matches?.('.row')&&outlineRowDepth(r)>=d;r=r[step])if(outlineRowDepth(r)===d)return true;return false};
 if(d>0&&!sibling('previousElementSibling')&&!sibling('nextElementSibling'))return false;
 outlineRowContext.args.delete(row.dataset.location);row.remove();
 patchRenderFinish([id]);return true;
}
// Selection-only change: repaint the highlight and do the same scroll and focus follow-up
// that a full redraw schedules.
function paintSelectionLikeRedraw(){
 const focusedRow=document.activeElement?.closest?.('.row[data-id]')?.dataset.id;
 // A full redraw replaces the focused row, which drops focus; keep that behaviour.
 if(document.activeElement&&$('tree').contains(document.activeElement))document.activeElement.blur();
 paintOutlineSelection();
 queueMicrotask(()=>{const row=locationRow(selected);if(row){if(!recurrenceViewportHold)row.scrollIntoView({block:'nearest'});if(focusedRow&&focusedRow===selected&&!isTextEntry(document.activeElement))row.focus({preventScroll:true})}});
}
