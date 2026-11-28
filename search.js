"use strict";
// Shared search ranking and typo-tolerant matching for Outline search, Quick Open and pickers.
// Declarations only; loaded before the main script.
// Typo tolerance: one typo in words of 5+ letters, two in words of 8+; swapping neighbouring letters is
// one typo; a typo near the start of a longer word still matches ("progrm" → "programme").
// Search compares folded text: lowercase without accents, and Turkish dotless/dotted i treated
// as i, so "Işık", "ışık", "IŞIK" and "isik" match each other, as do "Şirket" and "sirket".
function searchFold(text){return String(text??'').toLowerCase().normalize('NFD').replace(/\p{M}/gu,'').replace(/ı/g,'i')}
// Tags sort in Turkish alphabetical order (ç after c, ı before i, ş after s), which keeps English order.
const TAG_COLLATOR=new Intl.Collator('tr');
function compareTags(a,b){return TAG_COLLATOR.compare(String(a),String(b))}
function typoDistance(a,b,max){
 if(Math.abs(a.length-b.length)>max)return max+1;
 const d=Array.from({length:a.length+1},(_,i)=>{const r=new Array(b.length+1).fill(0);r[0]=i;return r});
 for(let j=0;j<=b.length;j++)d[0][j]=j;
 for(let i=1;i<=a.length;i++){let best=max+1;for(let j=1;j<=b.length;j++){
   const cost=a[i-1]===b[j-1]?0:1;let v=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+cost);
   if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])v=Math.min(v,d[i-2][j-2]+1);
   d[i][j]=v;if(v<best)best=v}
   if(best>max)return max+1}
 return d[a.length][b.length];
}
function fuzzyWordMatch(term,word){
 term=searchFold(term);word=searchFold(word);
 if(!term||word.includes(term))return true;
 if(term.length<5||word.length<4)return false;
 const max=term.length>=8?2:1;
 if(typoDistance(term,word,max)<=max)return true;
 // A half-typed word: compare with the start of the longer word.
 if(word.length>term.length)for(let k=Math.max(4,term.length-max);k<=Math.min(word.length-1,term.length+max);k++)if(typoDistance(term,word.slice(0,k),max)<=max)return true;
 return false;
}
const SEARCH_WORDS=/[^\p{L}\p{N}_.-]+/u;
function fuzzyTextMatch(term,hay){
 term=searchFold(term).trim();hay=searchFold(hay);
 if(!term)return true;
 if(hay.includes(term))return true;
 return hay.split(SEARCH_WORDS).filter(Boolean).some(w=>fuzzyWordMatch(term,w));
}
// One ranking for Outline search, Quick Open and every item picker. Per search word, best first:
// 1 a whole word of the title · 2 the title starts with it · 3 a title word (or code) starts with it ·
// 4 inside a title word · 5 title with a typo · 6 a whole word of the text · 7 a text word starts with it ·
// 8 inside the text · 9 text with a typo. An exact title is 0; the whole title with a typo is 4.5. Title matches come before text-only matches;
// within each, active items come before finished ones, then by the weakest word, the sum, the shorter title
// and the most recent edit.
function searchTerms(query){return searchFold(query).trim().split(/\s+/).filter(Boolean)}
function termTier(term,title,titleWords,body,bodyWords,codes){
 if(titleWords.includes(term))return 1;
 if(title.startsWith(term))return 2;
 if(titleWords.some(w=>w.startsWith(term))||codes.some(c=>c.startsWith(term)))return 3;
 if(title.includes(term))return 4;
 if(titleWords.some(w=>fuzzyWordMatch(term,w)))return 5;
 if(bodyWords.includes(term))return 6;
 if(bodyWords.some(w=>w.startsWith(term)))return 7;
 if(body.includes(term)||codes.some(c=>c.includes(term)))return 8;
 if(bodyWords.some(w=>fuzzyWordMatch(term,w)))return 9;
 return Infinity;
}
function inactiveRank(item){if(item?.type==='Note')return inactiveTodoAbove(item)?2:0;return item?.type!=='Todo'?0:({'On hold':1,Done:2,Cancelled:3}[item.status]||0)}
// stable: equally good results keep their given (Outline) order, so moving items in search results stays predictable.
function rankItems(items,query,{title=i=>i.title,body=i=>descriptionSearchText(i.content),codes=i=>itemSearchCodes(db,i),item=i=>i,stable=false}={}){
 const terms=Array.isArray(query)?query.map(t=>searchFold(t)).filter(Boolean):searchTerms(query);
 if(!terms.length)return items;
 const whole=terms.join(' ');
 return items.map((entry,index)=>{
   const t=searchFold(title(entry)||'').trim(),b=searchFold(body(entry)||''),c=searchFold(codes(entry)||'').split(/\s+/).filter(Boolean);
   const tw=t.split(SEARCH_WORDS).filter(Boolean),bw=b.split(SEARCH_WORDS).filter(Boolean);
   const tiers=terms.map(term=>termTier(term,t,tw,b,bw,c));
   const target=item(entry);
   return {entry,index,worst:t===whole?0:whole.length>=5&&typoDistance(whole,t,whole.length>=8?2:1)<=(whole.length>=8?2:1)?Math.min(4.5,Math.max(...tiers)):Math.max(...tiers),sum:tiers.reduce((a,x)=>a+x,0),length:t.length,inactive:inactiveRank(target),edited:String(target?.updatedAt||'')};
 }).filter(h=>Number.isFinite(h.worst))
   .sort((a,b)=>(a.worst>5)-(b.worst>5)||a.inactive-b.inactive||a.worst-b.worst||a.sum-b.sum||(stable?0:a.length-b.length||b.edited.localeCompare(a.edited))||a.index-b.index)
   .map(h=>h.entry);
}

// Filtering for plain lists (Archive, Recently deleted, cold archive): every search word must match,
// with the same typo tolerance as Outline search and Quick Open.
function listSearchMatch(query,text){
 const terms=String(query||'').trim().toLowerCase().split(/\s+/).filter(Boolean);if(!terms.length)return true;
 const hay=String(text||'').toLowerCase();return terms.every(t=>fuzzyTextMatch(t,hay));
}
