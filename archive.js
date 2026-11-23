"use strict";
// Cold archive: move fully archived subtrees into separate archive files and restore them.
// Declarations only; loaded before the main script.
let archiveOperationBusy=false;
async function writeColdArchiveFile(payload,suggestedName){
 if(!storage.handle?.sqlite)throw new Error('Open a library before archiving. Your items weren’t changed.');
 await window.notesDesktop.sqlite.archive(storage.handle,JSON.stringify(payload,null,2));
 return suggestedName;
}
function coldArchiveEntryById(id){return db?.archiveIndex?.find(e=>e.id===id)||null}
function coldArchiveReference(raw){
 const s=String(raw||"").trim(),uuidMatch=s.match(/^@\{([^}]+)\}$/);
 if(uuidMatch)return coldArchiveEntryById(uuidMatch[1]);
 const ids=referenceCandidates(db,s);return ids.length===1?coldArchiveEntryById(ids[0]):null;
}
function referenceKnown(raw){return !!(resolveReference(raw)||coldArchiveReference(raw))}
function validateColdArchivePayload(payload){
 if(!payload||payload.format!=="local-notes-todos-cold-archive"||payload.schemaVersion!==1||!Array.isArray(payload.items)||!payload.codes||typeof payload.codes!=="object")throw new Error("Not a compatible cold archive.");
 validateHierarchy(payload.items,true);for(const i of payload.items){if(i.target===undefined)i.target=null;validateItem(i)}
 if(Object.values(payload.codes).some(c=>typeof c!=="string"))throw new Error("Invalid archive codes.");
 return payload;
}
async function coldArchiveRoots(rootIds){
 if(archiveOperationBusy||fileOperationBusy){toast("Finish the current file operation first.");return false}
 const owner=db,revision=JSON.stringify(db);
 const roots=[...new Set(rootIds)].map(id=>itemById(db,id)).filter(i=>i?.archived);
 if(!roots.length){toast("No archived subtrees selected.");return false}
 const ids=new Set(),items=[];
 for(const root of roots)for(const i of [root,...descendants(db,root.id,true)])if(!ids.has(i.id)){ids.add(i.id);items.push(i)}
 if(db.locations&&items.some(i=>i.locationParent||Object.values(db.locations).some(p=>p.item===i.id||p.parent===(i.locationId||i.id)))){toast('Remove linked locations before cold archiving this branch.');return false}
 if(items.some(i=>!i.archived)){toast("Cold archive only moves fully archived subtrees.");return false}
 const codes={};for(const i of items)codes[i.id]=itemCode(db,i);
 const archiveId=uuid(),stamp=new Date().toISOString(),suggestedName=`cold-archive-${stamp.slice(0,10)}-${archiveId.slice(0,8)}.json`;
 const payload={format:"local-notes-todos-cold-archive",schemaVersion:1,archiveId,createdAt:stamp,sourceDatabaseCreatedAt:db.createdAt||null,sourceSchemaVersion:10,itemCount:items.length,codes,items:items.map(i=>({...JSON.parse(JSON.stringify(i)),content:canonicalizeForDatabase(db,i.content)}))};
 let archiveFile;
 archiveOperationBusy=true;
 try{archiveFile=await writeColdArchiveFile(payload,suggestedName)}catch(e){if(e.name!=="AbortError")toast(e.message);return false}finally{archiveOperationBusy=false}
 if(db!==owner||JSON.stringify(db)!==revision){toast("The library changed while exporting. The archive was exported and your items weren’t changed. Try again.");return false}
 checkpoint();stabilizeReferences(db);const previous=codeMapForDatabase(db);db.archiveIndex=db.archiveIndex||[];
 for(const i of items){
   const code=codes[i.id];
   db.archiveIndex.push({id:i.id,type:i.type,code,codeAliases:[...(i.codeAliases||[])],title:i.title||"",archiveId,archiveFile,coldArchivedAt:stamp,parentId:i.parentId||null,createdAt:i.createdAt,updatedAt:i.updatedAt,tags:normalizeTagList(i.explicitTags||[])});
   db.linkAliases=db.linkAliases||{};if(code)db.linkAliases[code.toUpperCase()]=i.id
 }
 const externalParents=new Set(roots.map(r=>r.parentId).filter(id=>id&&!ids.has(id)));
 db.items=db.items.filter(i=>!ids.has(i.id));
 for(const p of externalParents)recalcOrders(db,p);recordChangedCodes(db,previous);
 db.updatedAt=now();markDirty();render();toast(`Moved ${items.length} item${items.length===1?"":"s"} to ${archiveFile}`);return true
}
function archiveItemSignature(i){
 const fields=["id","type","title","content","status","scheduledDates","explicitTags","recurrence","occurrenceStates","occurrencePostponements","createdAt","target","milestone"];
 const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==="object"?Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])])):value;
 return JSON.stringify(stable(Object.fromEntries(fields.map(key=>[key,["target","milestone"].includes(key)?(i[key]??null):i[key]]))));
}
async function restoreColdArchiveFile(file){
 if(archiveOperationBusy||fileOperationBusy)throw new Error("Finish the current file operation first.");
 const owner=db,revision=JSON.stringify(db);archiveOperationBusy=true;let payload;
 try{payload=validateColdArchivePayload(JSON.parse(await file.text()))}finally{archiveOperationBusy=false}
 if(db!==owner||JSON.stringify(db)!==revision)throw new Error("The library changed while reading the archive. Try again.");
 const staged=JSON.parse(revision),existing=new Map(staged.items.map(i=>[i.id,i]));
 const incomingIdsForCodes=new Map();
 for(const i of payload.items){
   for(const code of [payload.codes[i.id],...(i.codeAliases||[])].filter(Boolean)){
     const key=code.toUpperCase();if(!incomingIdsForCodes.has(key))incomingIdsForCodes.set(key,new Set());incomingIdsForCodes.get(key).add(i.id);
   }
 }
 for(const i of payload.items){
   // Archive-local visible links refer to archive UUIDs, even if destination codes collide.
   i.content=outsideCode(i.content,part=>part.replace(/(!?)\[\[([^\]]+)\]\]/g,(whole,bang,code)=>{
     const ids=incomingIdsForCodes.get(code.toUpperCase());return ids?.size===1?`${bang}[[${refToken([...ids][0])}]]`:whole;
   }));
 }
 for(const i of payload.items)if(existing.has(i.id)&&archiveItemSignature({...existing.get(i.id),content:canonicalizeForDatabase(staged,existing.get(i.id).content)})!==archiveItemSignature(i))throw new Error("Archive contains an existing UUID with different content. Restore it into a separate library to compare.");
 const incoming=payload.items.filter(i=>!existing.has(i.id)).map(i=>JSON.parse(JSON.stringify(i)));
 if(!incoming.length){toast("Those archive items are already present.");return false}
 const allIds=new Set([...existing.keys(),...incoming.map(i=>i.id)]),previous=codeMapForDatabase(staged);
 stabilizeReferences(staged);
 // Stage all roots and reserve their namespace before assigning orphan/conflict IDs.
 const indexed=new Map(staged.archiveIndex.map(e=>[e.id,e])),used=occupiedRootOrdinals(staged),reserved=reservedRootOrdinals(staged);
 for(const i of incoming){
   i.archived=true;if(i.parentId&&!allIds.has(i.parentId))i.parentId=null;
   if(!i.parentId){
     const entry=indexed.get(i.id),indexedRoot=entry&&validateRootId(entry.code)?entry.code:null;
     const candidate=indexedRoot||([9,10].includes(payload.sourceSchemaVersion)||!payload.sourceSchemaVersion?i.rootId:null),n=rootOrdinalFromId(candidate);
     const otherOwner=staged.items.some(x=>!x.parentId&&x.rootId===candidate)||staged.archiveIndex.some(e=>e.id!==i.id&&e.code===candidate);
     const ownsReservation=!!indexedRoot&&!otherOwner;
     if(n&&!otherOwner&&(ownsReservation||(!used.has(n)&&!reserved.has(n)&&n>=staged.nextRootOrdinal))){
       i.rootId=candidate;used.add(n);reserved.add(n);staged.nextRootOrdinal=Math.max(staged.nextRootOrdinal,n+1);staged.reusableRootOrdinals=staged.reusableRootOrdinals.filter(x=>x!==n);
     }else i.rootId=null;
   }else i.rootId=null;
 }
 for(const i of incoming){
   if(!i.parentId&&!i.rootId){const n=takeRootOrdinal(staged,reserved);i.rootId=rootIdFromOrdinal(n);reserved.add(n);used.add(n)}
   const entry=indexed.get(i.id);
   for(const old of [payload.codes[i.id],entry?.code,...(entry?.codeAliases||[])].filter(Boolean)){
     if(!i.codeAliases.includes(old))i.codeAliases.push(old);staged.linkAliases[old.toUpperCase()]??=i.id;
   }
   staged.items.push(i);
 }
 if(incoming.some(i=>i.locationId||i.locationParent)){staged.schemaVersion=11;staged.locations??={}}
 const incomingIds=new Set(incoming.map(i=>i.id));staged.archiveIndex=staged.archiveIndex.filter(e=>!incomingIds.has(e.id));
 recordChangedCodes(staged,previous);reconcileAllocator(staged);validateDatabase(staged);
 checkpoint();db=staged;db.updatedAt=now();markDirty();render();toast(`Restored ${incoming.length} items into the in-file Archive.`);return true;
}
// Archive completed: the largest branches whose every active item is finished.
// A branch qualifies when its top item is a finished, non-recurring Todo and everything
// under it is either a finished Todo or a Note. Unfinished children keep the parent active.
// Branches with linked locations are skipped, as single archiving would refuse them.
function completedBranchRoots(db,{notChangedForDays=0}={}){
 const active=db.items.filter(i=>!i.archived),children=new Map();
 for(const i of active){if(!children.has(i.parentId))children.set(i.parentId,[]);children.get(i.parentId).push(i)}
 const finishedTodo=i=>i.type==='Todo'&&['Done','Cancelled'].includes(i.status)&&!isRecurringTodo(i);
 const settled=new Map();
 const allFinished=i=>{
   if(settled.has(i.id))return settled.get(i.id);
   settled.set(i.id,false);
   const ok=(finishedTodo(i)||i.type==='Note')&&(children.get(i.id)||[]).every(allFinished);
   settled.set(i.id,ok);return ok;
 };
 const cutoff=notChangedForDays?Date.now()-notChangedForDays*86400000:Infinity;
 const linked=new Set();
 if(db.locations){const g=new OutlineLocations(db);for(const i of active)if(g.byItem.get(i.id)?.length>1||i.locationParent)linked.add(i.id)}
 const hasLinked=i=>linked.has(i.id)||(children.get(i.id)||[]).some(hasLinked);
 return active.filter(i=>finishedTodo(i)&&allFinished(i)&&!hasLinked(i)
   &&new Date(i.updatedAt||0).getTime()<=cutoff
   &&!(i.parentId&&(()=>{const p=itemById(db,i.parentId);return p&&!p.archived&&finishedTodo(p)&&allFinished(p)&&!hasLinked(p)&&new Date(p.updatedAt||0).getTime()<=cutoff})()));
}
function archiveCompletedBranches(roots){
 if(!roots.length)return 0;
 checkpoint();let count=0;
 for(const r of roots){const n=1+descendants(db,r.id,true).length;if(archiveSubtree(db,r.id,true)!==false)count+=n}
 render();return count;
}
// Recently deleted: deleting a branch archives it in place with a trashedAt date, so it is hidden
// everywhere but keeps its parent. It can be restored for 30 days, then it is removed for good.
// Branches with linked locations cannot be archived and are still deleted permanently.
const TRASH_DAYS=30;
function branchHasLinkedLocations(db,id){
 if(!db.locations)return false;
 const g=new OutlineLocations(db),affected=[itemById(db,id),...descendants(db,id,true)].filter(Boolean);
 return affected.some(i=>g.byItem.get(i.id)?.length>1||i.locationParent||g.siblings(g.primary(i).id).some(p=>!p.primary));
}
function trashSubtree(db,id){
 const i=itemById(db,id);if(!i||branchHasLinkedLocations(db,id))return false;
 if(archiveSubtree(db,id,true)===false)return false;
 i.trashedAt=now();return true;
}
function trashedRoots(db){return db.items.filter(i=>i.trashedAt&&i.archived).sort((a,b)=>String(b.trashedAt).localeCompare(String(a.trashedAt)))}
function restoreTrashed(db,id){
 const i=itemById(db,id);if(!i)return false;
 if(archiveSubtree(db,id,false)===false)return false;
 delete i.trashedAt;touch(db,i);return true;
}
function trashExpiry(i){return new Date(new Date(i.trashedAt).getTime()+TRASH_DAYS*86400000)}
function purgeExpiredTrash(db,nowMs=Date.now()){
 let removed=0;
 for(const i of trashedRoots(db))if(trashExpiry(i).getTime()<=nowMs){deleteSubtree(db,i.id);removed++}
 return removed;
}
