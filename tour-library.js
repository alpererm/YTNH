"use strict";
// The YTNH Tour: a practice library that walks a new user through the app with small exercises.
// It is generated when opened, so its example dates sit in the current week and its shortcuts match
// the user's platform. YTNHTour.build fills an empty database; YTNHTour.open creates a new library.
const YTNHTour=(()=>{
 const key=spec=>shortcutText(spec);
 function addDays(ds,n){const d=new Date(ds+'T12:00:00');d.setDate(d.getDate()+n);return iso(d)}

 function build(database,{date=today(),minutes=null}={}){
   const made=[];
   // Show weekends here, so the examples for today stay visible when the tour is opened on a weekend.
   database.settings={...(database.settings||{}),hideWeekends:false};
   const add=(type,title,parent=null,extra={})=>{const i=createItem(database,type,parent?.id??null);i.title=title;i.content='';Object.assign(i,extra);made.push(i);return i};
   const note=(title,content,parent,extra)=>add('Note',title,parent,{content,...extra});
   const todo=(title,content,parent,extra)=>add('Todo',title,parent,{content:content||'',...extra});
   const link=i=>'[['+refToken(i.id)+']]';

   // Start here
   const start=note('Start here',
`Welcome to **YTNH**: notes, todos and long-term plans together, in a library file you own.

This is a **practice library**. Everything in it is yours to change, move, complete or delete. Your own libraries are not affected.

## How the tour works

Work through the numbered chapters in the Outline on the left, from top to bottom. Each Todo is a small exercise: do what it says, then mark it done. Most exercises take a few seconds.

- **Select** an item with a click or the arrow keys.
- **Open** it in the editor with a double-click or Shift+Enter.
- **Come back** to the Outline with Esc or ${key('Mod+1')}.

## When you're done

Open your own library with ☰ → Open Library… (${key('Mod+O')}) or ☰ → Open Recent. You can reopen a fresh copy of this tour at any time from ☰ → Open the Tour.`);

   // 1 · Find your way around
   const ch1=todo('1 · Find your way around','The Outline holds everything. These exercises use the keyboard, but the mouse works too.');
   todo('Press Down to select the next item, and Up to come back',null,ch1);
   todo('Press Space to mark this Todo done (press it again to undo)','You can also click the circle on the left. Finished items stay visible for a moment, then leave the list. Show them again with Alt+Shift+D.',ch1);
   todo('Press Enter (or F2) to rename this item, type a new name, then Enter',null,ch1);
   todo('Press Shift+Enter to open this item in the editor',
`You're in the editor. Everything you type here is saved automatically.

Press **Esc** to go back to the Outline, then mark this Todo done.`,ch1);
   const nest=todo('Press Right to expand this item, Left to collapse it',null,ch1,{collapsed:true});
   note('Items can be nested as deep as you like','Use Shift+Right and Shift+Left to demote or promote the selected item.',nest);
   todo('Press N for a new Note or T for a new Todo at this level','Alt+N and Alt+T create a child instead. Anywhere in the app, '+key('Mod+N')+' and '+key('Mod+T')+' do the same.',ch1);
   const drop=note('Drop here','Drag the Todo below onto the middle of this row to make it a child.',ch1);
   todo('Drag me onto “Drop here”','Drop on the top or bottom edge of a row to place an item before or after it instead. Shift+Up and Shift+Down reorder with the keyboard.',ch1);

   // 2 · Organise a project
   const ch2=todo('2 · Organise a project','A project is any Todo with children. Headings divide a project into sections without adding another level.');
   note('Preparation','',ch2,{heading:true});
   todo('Click the arrow beside “Preparation” to fold this section',null,ch2);
   todo('Right-click this circle to see the other statuses','Todos can be Todo, Done, Waiting for, On hold or Cancelled. A middle-click cancels.',ch2);
   todo('Waiting for: a reply from the printer',null,ch2,{status:'Waiting for'});
   note('Delivery','',ch2,{heading:true});
   todo('Select a Todo in this project and press H to add a heading below it','Headings are labels only: they have no status or dates. Right-click a heading to rename it or turn it into a real parent.',ch2);
   todo('Open the side panel (Properties) and add the tag “home” to this Todo','Press '+key('Mod+Backslash')+' to show or hide the side panel. Tags you add to a parent are inherited by everything inside it.',ch2);

   // 3 · Write in the editor
   const ch3=note('3 · Write in the editor','');
   const target=note('A note to link to','This note exists so you can link to it. Open it and look at **Backlinks** in the side panel: it lists every item that links here.',ch3);
   ch3.content=(
`The editor is rich text with Markdown underneath. Type these at the **start of a line**:

- \`- \` for a bullet, \`1. \` for a numbered list
- \`[] \` for a checklist
- \`> \` for a quote, \`# \` to \`### \` for headings
- \`---\` for a divider, three backticks and Enter for a code block

## Try it here

- [ ] Click at the end of this line and press Enter to add another checklist item
- [ ] Tick this box with a click or ${key('Mod+Shift+Enter')}
- [x] Already done

> Quotes look like this. Select some words and press ${key('Mod+B')} for **bold** or ${key('Mod+I')} for *italic*.

## Links between items

This links to ${link(target)}. Type \`[[\` anywhere to link or embed another item; links keep working when you rename or move it.

## Todos inside a sentence

Type \`<call the printer>\` in a sentence and it becomes a child Todo of this note, right where you wrote it.

## Look around

- **Source** in the formatting menu shows the Markdown behind the page.
- The **document outline** in the side panel (${key('Mod+Shift+2')}) lists this note's headings.
- **Focus Mode** (${IS_MAC?'F11 or '+key('Ctrl+Mod+F'):'F11'}) hides everything except your writing. Esc brings it back.

\`\`\`
Code blocks keep text exactly as typed.
\`\`\``);

   // 4 · Plan your time
   const ch4=todo('4 · Plan your time','Items appear on the Calendar on their scheduled dates. Show the Calendar with '+key('Mod+3')+'.');
   todo('Find this Todo on today’s Calendar','Selecting an item highlights it on the Calendar. Click the small calendar icon at the right of its row to jump there.',ch4,{scheduledDates:[date]});
   todo('Drag my Calendar chip to another day',null,ch4,{scheduledDates:[addDays(date,1)]});
   todo('Water the plants','This Todo repeats every week; the repeat icon on the right shows its next date. Completing it finishes only this week’s occurrence.',ch4,{recurrence:{frequency:'weekly',interval:1,startDate:date}});
   const planned=todo('Open the Daily Planner to see when this is planned','Press '+key('Mod+Shift+D')+' or use the panel button beside Targets. Click an empty time slot to plan something new, or drag an item from the Outline onto the timeline. The clock icon on this row jumps to the session.',ch4);
   todo('Click an empty part of a day in the Calendar','The Outline then shows only that day’s items. Press Esc to show everything again.',ch4);
   // A session later today (or tomorrow morning if it's late).
   const clock=minutes??(new Date().getHours()*60+new Date().getMinutes());
   let day=date,startAt=Math.ceil((clock+1)/60)*60;
   if(startAt<8*60)startAt=9*60;if(startAt>21*60){day=addDays(date,1);startAt=9*60}
   try{PlannerModel.session(database,planned,day,startAt,45)}catch{planned.scheduledDates=[day]}

   // 5 · Think long-term
   const month=date.slice(0,7),later=addDays(date,120).slice(0,7);
   const ch5=todo('5 · Think long-term','Targets show work that spans months; Milestones mark a week. Open Targets with '+key('Mod+4')+'.');
   const goal=todo('Finish the tour (a Target)','A Target is a Todo with a start and end month, shown as a bar in Targets. Items under it count towards it.',ch5,{target:{startMonth:month,endMonth:later}});
   todo('Try every chapter (a Milestone)','A Milestone is a Todo planned for a week. Mark it done and watch the count on the Target bar change.',goal,{milestone:{targetWeek:isoWeekKey(date)}});
   todo('Open Targets and find the bar for “Finish the tour”',null,ch5);

   // 6 · Find things
   const ch6=todo('6 · Find things','');
   todo('Press / and search for “plants”','Search is forgiving about typos. Try `#home` for the tag you added, or `status:Done` for finished Todos. Esc clears it.',ch6);
   todo('Open Filters (Alt+Shift+F) and show only Notes','Chips beside the filter button show what’s active; Clear all resets them.',ch6);
   todo('Group the Outline by type (Alt+Shift+G)','Group by shows items by date, type, tag or status. Choose None to go back.',ch6);
   todo('Press Ctrl+Shift+Space to open any item quickly','Quick Open works even when YTNH is in the background. You can turn it off in Settings.',ch6);

   // 7 · Your data and next steps
   note('7 · Your data and next steps',
`## Your library

A library is one \`.ytnh\` file in a folder you choose, such as a OneDrive folder. Changes save automatically while you work; **Save** (${key('Mod+S')}) and closing the app update the file. Keep a copy with ☰ → Back Up Library….

YTNH has no account and sends nothing anywhere.

## Bring things in

- **☰ → Import Markdown Folder…** turns a folder of Markdown files into Notes, keeping subfolders, tags, images and links.
- **☰ → Import Outlook Calendar…** brings in meetings from an exported .ics file.

## Make it yours

- **Settings** (${key('Mod+,')}): theme, font, sizes, whether the app opens on the Calendar or the editor.
- **Help** (?): every feature and keyboard shortcut, with search.

You've reached the end of the tour. Open your own library with ☰ → Open Library…, or start a new one with ☰ → New Library….`);

   database.updatedAt=now();
   return {start,chapters:[ch1,ch2,ch3,ch4,ch5,ch6],items:made};
 }

 // A fresh tour library. On the desktop it is saved as a new .ytnh file; in a browser it opens unsaved.
 async function open(){
   const model=createEmptyDatabase();const previous=db;
   // build() works on the global helpers, which act on the database passed in.
   const r=build(model);
   if(window.notesDesktop?.sqlite?.newLibrary){await window.notesDesktop.sqlite.newLibrary(model,'YTNH Tour.ytnh');}
   else{if(previous&&dirty&&!await appConfirm('Open the Tour?','Unsaved changes in the current library will be lost.','Open the Tour'))return;installDatabase(model);}
   const start=db?.items.find(i=>!i.parentId&&i.title==='Start here'&&!i.archived);if(!start||db.items.length!==r.items.length)return;
   selected=start.id;render();edit(start.id);
 }
 return {build,open};
})();
