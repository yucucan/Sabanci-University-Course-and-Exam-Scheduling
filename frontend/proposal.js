/* Defterdar proposal experience. UI state is separate from saved academic records. */
'use strict';

// Upgrade the earlier full-catalogue example once at load; explicit imports remain unrestricted.
function trimEarlierCatalogue(workspace){
  if(!Array.isArray(workspace.courses)||workspace.courses.length<=40)return null;
  const selected=new Set(window.SABANCI_CATALOG.map(course=>course.code));
  const storedCodes=new Set(workspace.courses.map(course=>course.code));
  if(![...selected].every(code=>storedCodes.has(code))||!['ME480','ME481','CS408','CS301'].every(code=>storedCodes.has(code)))return null;
  if(Array.isArray(workspace.exams)&&workspace.exams.some(exam=>!selected.has(exam?.course)))return null;
  const next=clone(workspace);
  next.courses=next.courses.filter(course=>selected.has(course.code));
  const elements=new Set(next.courses.flatMap(course=>[course.code,...course.sections.map(s=>s.name),...course.labs.map(s=>s.name)]));
  const retained=values=>typeof values==='string'&&values.split(',').every(value=>elements.has(value.trim()));
  next.standardRules=next.standardRules.filter(rule=>retained(rule.elements));
  next.orderRules=next.orderRules.filter(rule=>retained(rule.before)&&retained(rule.after));
  return next;
}
const INTRO_CATALOGUE_REVISION=STORAGE_KEY+'-intro-catalogue-v1';
let introMigrationPending=true;
try{introMigrationPending=localStorage.getItem(INTRO_CATALOGUE_REVISION)!=='done';}catch(_){}
if(introMigrationPending){
  const introCatalogue=trimEarlierCatalogue(data);
  if(introCatalogue){
    try{
      localStorage.setItem(STORAGE_KEY+'-before-intro-catalogue',localStorage.getItem(STORAGE_KEY)||JSON.stringify(data));
      data=introCatalogue;
      if(persist())try{localStorage.setItem(INTRO_CATALOGUE_REVISION,'done');}catch(_){}
    }catch(_){
      // Preserve the earlier saved workspace when a backup cannot be written.
      data=introCatalogue;
      notify('Showing the 40-course selection in memory. Export it to keep a separate copy; your earlier saved workspace remains unchanged.');
    }
  }else{
    try{localStorage.setItem(INTRO_CATALOGUE_REVISION,'done');}catch(_){}
  }
}

schemas.courses.find(s=>s.key==='patterns').optional=true;
schemas.courses.push({...f('catalogEcts','Catalogue ECTS','number'),optional:true,step:'any'});
intakeColumns.splice(3,0,['Catalogue ECTS',c=>c.catalogEcts]);
const courseView={query:'',department:'',status:'',scheduleStatus:'',min:'',max:''};
const proposalControls={};
const proposalSort={};
let lastProposalRoute=null;
const timetableView={weekends:false};
timetableFilters={course:'',instructor:'',classroom:''};

function resetViewFilters(page){
  if(['occupancy','classrooms'].includes(page))Object.assign(roomView,{types:[],campus:'',building:'',minSeats:0,day:'',start:'08:40',end:'19:30',status:'',query:'',selectedSlot:null});
  if(page==='instructors')Object.assign(staffView,{roles:[],faculty:'',department:'',day:'',start:'08:40',end:'19:30',status:'',query:'',slot:null});
  if(page==='courses')Object.assign(courseView,{query:'',department:'',status:'',scheduleStatus:'',min:'',max:''});
  if(page==='timetable')timetableFilters={course:'',instructor:'',classroom:''};
  if(page==='planning')planningView.requiredType='';
}
function currentRoute(){return (location.hash.slice(1)||'dashboard');}
function activeFilters(page){
  if(page==='courses')return Object.values(courseView).filter(v=>v!=='').length;
  if(page==='timetable')return Object.values(timetableFilters).filter(Boolean).length;
  if(page==='planning')return Number(Boolean(planningView.requiredType));
  if(page==='instructors')return staffView.roles.length+[staffView.faculty,staffView.department,staffView.day,staffView.status,staffView.query].filter(Boolean).length+Number(staffView.start!=='08:40'||staffView.end!=='19:30');
  if(['classrooms','occupancy'].includes(page))return roomView.types.length+[roomView.campus,roomView.building,roomView.status,roomView.query,roomView.day].filter(Boolean).length+Number(roomView.minSeats>0)+Number(roomView.start!=='08:40'||roomView.end!=='19:30');
  return 0;
}
function sortOptions(page){
  if(currentRoute().includes('/')&&!['instructors/occupancy','planning/session'].includes(currentRoute()))return [];
  if(page==='instructors')return [['name','Name: A–Z'],['name-desc','Name: Z–A'],['hours-desc','Teaching hours: highest first'],['hours','Teaching hours: lowest first']];
  if(page==='courses')return [['code','Course code: A–Z'],['name','Course title: A–Z'],['name-desc','Course title: Z–A'],['capacity-desc','Capacity: highest first'],['capacity','Capacity: lowest first']];
  if(['occupancy','classrooms'].includes(page))return [['code','Room code: A–Z'],['name','Room name: A–Z'],['capacity-desc','Capacity: highest first'],['capacity','Capacity: lowest first']];
  if(page==='rules')return [['default','Priority and name'],['name','Constraint name: A–Z'],['name-desc','Constraint name: Z–A'],['importance-desc','Importance: highest first'],['importance','Importance: lowest first']];
  if(currentRoute()==='planning/session')return [['score-desc','Recommendation score: highest first'],['code','Room code: A–Z'],['capacity','Capacity: lowest first'],['capacity-desc','Capacity: highest first']];
  return [];
}
function compareRecords(a,b,sort){
  const descending=sort.endsWith('-desc'),key=sort.replace('-desc','');
  let result;
  const av=a[key],bv=b[key];
  if(['hours','capacity','importance','score'].includes(key)){
    const emptyA=av===''||av===undefined,emptyB=bv===''||bv===undefined;
    if(emptyA!==emptyB)return emptyA?1:-1;
    result=Number(av||0)-Number(bv||0);
  }else result=String(av||'').localeCompare(String(bv||''),'en',{numeric:true,sensitivity:'base'});
  return result*(descending?-1:1)||String(a.code||a.name||'').localeCompare(String(b.code||b.name||''),'en',{numeric:true});
}
function staffSortRecord(person){return {name:staffName(person),hours:occupiedMinutes(sessionsForStaff(person,true).filter(s=>!staffView.day||s.day===staffView.day))/60};}
const staffScopeBeforeProposal=staffInScope;
staffInScope=function(){return staffScopeBeforeProposal().sort((a,b)=>compareRecords(staffSortRecord(a),staffSortRecord(b),proposalSort.instructors||'name'));};
const roomScopeBeforeProposal=roomsInScope;
roomsInScope=function(){const page=currentRoute().split('/')[0];return roomScopeBeforeProposal().sort((a,b)=>compareRecords(a,b,proposalSort[page]||'code'));};
function applyViewSort(page){
  const sort=proposalSort[page]||sortOptions(page)[0]?.[0];if(!sort)return;
  let rows=[],record=()=>({});
  if(page==='courses'){
    rows=[...main.querySelectorAll('.data-table[data-key="courses"] tbody tr')];record=row=>data.courses[Number(row.dataset.rowIndex)];
  }else if(page==='instructors'){
    if(currentRoute()==='instructors/occupancy'){
      rows=[...main.querySelectorAll('#staff-slot-inspector .slot-room')];record=row=>staffSortRecord(data.instructors.find(person=>staffHref(person)===row.getAttribute('href')));
    }else{rows=[...main.querySelectorAll('.staff-result')];record=row=>staffSortRecord(data.instructors[Number(row.querySelector('[data-action="edit"]').dataset.index)]);}
  }else if(page==='classrooms'){
    rows=[...main.querySelectorAll('.room-result')];record=row=>data.classrooms[Number(row.querySelector('[data-action="edit"]').dataset.index)];
  }else if(page==='occupancy'){
    rows=[...main.querySelectorAll('.room-shortcuts>a')];record=row=>data.classrooms.find(r=>roomHref(r.code)===row.getAttribute('href'))||{};
  }else if(page==='rules'){
    for(const grid of main.querySelectorAll('.constraint-grid')){
      const groupSort=sort==='default'?(grid.closest('.soft')?'importance-desc':'name'):sort;
      const constraint=row=>data[row.dataset.constraintKey][Number(row.dataset.constraintIndex)];
      [...grid.children].filter(row=>row.dataset.constraintKey)
        .sort((a,b)=>compareRecords(constraint(a),constraint(b),groupSort)).forEach(row=>grid.append(row));
    }
    return;
  }else if(currentRoute()==='planning/session'){
    rows=[...main.querySelectorAll('table tbody tr')];record=row=>({code:row.cells[0].textContent.trim(),capacity:Number(row.cells[1].textContent.match(/^\d+/)?.[0]),score:Number(row.cells[3].querySelector('strong')?.textContent)});
  }
  if(!rows.length)return;
  const parent=rows[0].parentElement;
  rows.sort((a,b)=>compareRecords(record(a),record(b),sort)).forEach(row=>parent.append(row));
}
function addViewControls(page,route){
  const selectors=page==='courses'?'.course-filter-panel':page==='timetable'?'.timetable-filter-panel':page==='classrooms'?'.time-picker,.scope-panel,.room-search':page==='instructors'?'.time-picker,.staff-filter-panel,.room-search':page==='occupancy'?'.scope-panel':route==='planning/session'?'label:has(#planning-type)':'';
  const parts=selectors?[...main.querySelectorAll(selectors)]:[];
  const choices=sortOptions(page);
  if(!parts.length&&!choices.length)return;
  const state=proposalControls[route]||={filters:false,sort:false};
  const holder=document.createElement('section');holder.className='view-controls';
  const count=activeFilters(page);
  holder.innerHTML=`<div class="view-control-buttons">${parts.length?`<button data-toggle-controls="filters" aria-expanded="${state.filters}" aria-controls="view-filter-panel">☷ Filters${count?' · '+count+' active':''}</button>`:''}${choices.length?`<button data-toggle-controls="sort" aria-expanded="${state.sort}" aria-controls="view-sort-panel">↕ Sort</button>`:''}${count?'<button class="text-link" data-clear-view>Clear filters</button>':'<span class="muted">Showing all records. Open filters to narrow the view.</span>'}</div><div id="view-filter-panel" ${state.filters?'':'hidden'}></div><div id="view-sort-panel" class="sort-panel" ${state.sort?'':'hidden'}>${choices.length?`<label>Sort by<select id="view-sort">${choices.map(([value,label])=>`<option value="${value}" ${(proposalSort[page]||choices[0][0])===value?'selected':''}>${label}</option>`).join('')}</select></label><small>Sorting changes the view; your saved records keep their order.</small>`:''}</div>`;
  const firstPanel=holder.querySelector('#view-filter-panel');
  // Moving existing controls keeps their bound handlers and input state intact.
  parts.forEach(part=>firstPanel.append(part));
  main.querySelector('.page-heading')?.after(holder);
  holder.querySelectorAll('[data-toggle-controls]').forEach(button=>{
    const type=button.dataset.toggleControls,panel=holder.querySelector(type==='filters'?'#view-filter-panel':'#view-sort-panel');
    button.onclick=()=>{state[type]=!state[type];button.setAttribute('aria-expanded',String(state[type]));panel.hidden=!state[type];};
  });
  holder.querySelector('[data-clear-view]')?.addEventListener('click',()=>{resetViewFilters(page);render();});
  holder.querySelector('#view-sort')?.addEventListener('change',event=>{proposalSort[page]=event.target.value;applyViewSort(page);});
  if(page==='occupancy'){
    const rooms=main.querySelector('.room-shortcuts');
    if(rooms){
      const roomControls=document.createElement('div');roomControls.className='view-controls';
      const buttons=document.createElement('div');buttons.className='view-control-buttons';
      buttons.append(holder.querySelector('[data-toggle-controls="sort"]'));
      roomControls.append(buttons,holder.querySelector('#view-sort-panel'));
      rooms.before(roomControls);
    }
  }
  applyViewSort(page);
}

function decorateDataTables(){
  main.querySelectorAll('.data-table').forEach((wrapper,tableIndex)=>{
    if(wrapper.dataset.key==='courses'&&currentRoute()==='courses')return;
    const toolbar=wrapper.querySelector('.toolbar'),search=toolbar?.querySelector('.search');if(!search)return;
    const id='table-controls-'+tableIndex,key=wrapper.dataset.key;
    const toggle=document.createElement('button');toggle.type='button';toggle.textContent='☷ Filters';toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-controls',id);
    const filter=document.createElement('div');filter.id=id;filter.hidden=true;filter.className='table-filter-panel';filter.append(search);toolbar.prepend(toggle);toolbar.after(filter);
    toggle.onclick=()=>{filter.hidden=!filter.hidden;toggle.setAttribute('aria-expanded',String(!filter.hidden));};
    const sort=document.createElement('button');sort.type='button';sort.textContent='↕ Sort';sort.setAttribute('aria-expanded','false');
    const sortPanel=document.createElement('div');sortPanel.className='table-filter-panel';sortPanel.hidden=true;
    sortPanel.id=id+'-sort';sort.setAttribute('aria-controls',sortPanel.id);
    sortPanel.innerHTML=`<label>Sort column<select><option value="">Choose a column</option>${schemas[key].map(spec=>`<option value="${spec.key}">${esc(spec.label)}</option>`).join('')}</select></label><label>Direction<select data-sort-direction><option value="ascending">Ascending</option><option value="descending">Descending</option></select></label>`;
    toolbar.append(sort);filter.after(sortPanel);sort.onclick=()=>{sortPanel.hidden=!sortPanel.hidden;sort.setAttribute('aria-expanded',String(!sortPanel.hidden));};
    sortPanel.onchange=()=>{
      const prop=sortPanel.querySelector('select').value;if(!prop)return;
      const th=[...wrapper.querySelectorAll('th')].find(th=>th.querySelector('[data-sort]')?.dataset.sort===prop);if(!th)return;
      const descending=sortPanel.querySelector('[data-sort-direction]').value==='descending';th.setAttribute('aria-sort',descending?'ascending':'none');th.querySelector('button').click();
    };
  });
}

function filteredCourseIndices(){
  const query=foldSearch(courseView.query.trim());
  return data.courses.map((c,index)=>({c,index})).filter(({c})=>
    (!query||foldSearch(`${c.code} ${c.name} ${c.department} ${c.notes||''}`).includes(query))&&
    (!courseView.department||c.department===courseView.department)&&(!courseView.status||c.openStatus===courseView.status)&&
    (!courseView.scheduleStatus||c.scheduleStatus===courseView.scheduleStatus)&&
    (courseView.min===''||c.capacity!==''&&c.capacity!==undefined&&Number(c.capacity)>=Number(courseView.min))&&
    (courseView.max===''||c.capacity!==''&&c.capacity!==undefined&&Number(c.capacity)<=Number(courseView.max))
  ).map(({index})=>index);
}
function updateCourseRows(){
  const matches=new Set(filteredCourseIndices());
  main.querySelectorAll('.data-table[data-key="courses"] tbody tr').forEach(row=>row.hidden=!matches.has(Number(row.dataset.rowIndex)));
  main.querySelectorAll('[data-intake-index]').forEach(row=>row.hidden=!matches.has(Number(row.dataset.intakeIndex)));
  const count=main.querySelector('.data-table[data-key="courses"] .row-count');if(count)count.textContent=`${matches.size} of ${data.courses.length} courses`;
  const empty=main.querySelector('#courses-empty');if(empty)empty.hidden=matches.size>0;
}
coursesPage=function(){
  const visible=['code','name','scheduleStatus','department','catalogEcts','credits','openStatus','patterns','capacity','plannedSections'];
  const all=schemas.courses;let content;
  try{schemas.courses=visible.map(key=>all.find(spec=>spec.key===key));content=table('courses');}finally{schemas.courses=all;}
  main.innerHTML=heading('Courses','Explore the course catalogue and collect the inputs needed for a teaching plan.')+
    `<section class="panel course-filter-panel"><div class="panel-content filter-bar"><label>Search courses<input id="course-search" type="search" value="${esc(courseView.query)}" placeholder="Course code, title, or notes"></label>${selectControl('course-department','Subject',data.departments.map(d=>[d.abbreviation,d.abbreviation+' · '+d.name]),courseView.department,'All subjects')}${selectControl('course-status','Open status',['Not specified','Planned','Open','Closed'],courseView.status,'All statuses')}<label>Minimum capacity<input id="course-min" type="number" min="0" step="1" value="${courseView.min}" placeholder="Any"></label><label>Maximum capacity<input id="course-max" type="number" min="0" step="1" value="${courseView.max}" placeholder="Any"></label></div></section>`+
    `<section class="panel"><div class="panel-content">${content}</div></section>`+facultyIntakeRegister();
  main.querySelector('.data-table .search')?.remove();
  const scheduleSort=main.querySelector('[data-sort="scheduleStatus"]');scheduleSort.firstChild.textContent='In schedule ';
  const scheduleColumn=scheduleSort.closest('th').cellIndex;
  main.querySelectorAll('.data-table[data-key="courses"] tbody tr').forEach(row=>{
    const index=Number(row.dataset.rowIndex),course=data.courses[index],enabled=courseIsEnabled(course);
    row.cells[scheduleColumn].innerHTML=courseScheduleSwitch(course,index);
    const count=course.sections.length;
    row.cells[1].insertAdjacentHTML('beforeend',`<br><a class="text-link" href="#courses/edit/${index}">${count?count+' section'+(count===1?'':'s'):'Add sections'}</a>`);
    row.classList.toggle('course-excluded',!enabled);
  });
  main.querySelector('#course-status').closest('label').insertAdjacentHTML('afterend',selectControl('course-schedule-status','In this semester’s schedule',['On','Off'],courseView.scheduleStatus,'All courses'));
  main.querySelector('.page-heading').insertAdjacentHTML('afterend','<p class="course-schedule-hint"><strong>Semester planning:</strong> switch a course Off to leave its sections and labs out of this plan. Its records and assignments are kept so you can switch it back On for another semester. This setting is separate from the faculty’s Open status.</p>');
  main.querySelector('.data-table .table-wrap').insertAdjacentHTML('beforeend','<p id="courses-empty" class="empty" hidden>No courses match these filters. Clear a filter or broaden the capacity range.</p>');
  main.querySelector('#course-search').oninput=event=>{courseView.query=event.target.value;updateCourseRows();updateFilterCount('courses');};
  for(const [id,key]of [['course-department','department'],['course-status','status'],['course-schedule-status','scheduleStatus'],['course-min','min'],['course-max','max']])main.querySelector('#'+id).onchange=event=>{
    if(['min','max'].includes(key)&&event.target.value!==''&&(!Number.isInteger(event.target.valueAsNumber)||event.target.valueAsNumber<0)){notify('Enter a nonnegative whole capacity, or leave it blank.');event.target.value=courseView[key];return;}
    const next={...courseView,[key]:event.target.value};
    if(next.min!==''&&next.max!==''&&Number(next.min)>Number(next.max)){notify('Minimum capacity cannot exceed maximum capacity.');event.target.value=courseView[key];return;}
    courseView[key]=event.target.value;render();
  };
  updateCourseRows();
};
function courseScheduleSwitch(course,index){
  const enabled=courseIsEnabled(course);
  return `<button type="button" role="switch" aria-checked="${enabled}" aria-label="Include ${esc(course.code)} in this semester’s schedule" data-course-schedule="${index}" class="course-schedule-switch ${enabled?'is-on':''}"><span class="switch-track" aria-hidden="true"></span><span>${enabled?'On':'Off'}</span></button>`;
}
function updateFilterCount(page){
  const button=main.querySelector('[data-toggle-controls="filters"]');if(!button)return;
  const count=activeFilters(page);button.textContent='☷ Filters'+(count?' · '+count+' active':'');
  const group=button.parentElement;
  if(count){
    group.querySelector('.muted')?.remove();
    if(!group.querySelector('[data-clear-view]')){const clear=document.createElement('button');clear.className='text-link';clear.dataset.clearView='';clear.textContent='Clear filters';clear.onclick=()=>{resetViewFilters(page);render();};group.append(clear);}
  }else{
    group.querySelector('[data-clear-view]')?.remove();
    if(!group.querySelector('.muted')){const note=document.createElement('span');note.className='muted';note.textContent='Showing all records. Open filters to narrow the view.';group.append(note);}
  }
}

function sessionCard(s){
  return `<a class="session-card ${s.kind==='Lab'?'lab':''}" href="#courses/edit/${s.courseIndex}"><span class="session-time">${esc(s.start)} – ${esc(s.end)}${s.kind==='Lab'?' · '+esc(sessionType(s)):''}</span><strong>${esc(sessionLabel(s))}</strong><span>${esc(data.courses[s.courseIndex].name)}</span><small>${esc(s.classroom)} · ${s.demand} students</small><small>${esc(s.instructor)}</small></a>`;
}
function weeklyCalendar(sessions,{entity=null,card=sessionCard,weekends=true,label='Weekly timetable'}={}){
  const displayedDays=weekends||sessions.some(s=>['SATURDAY','SUNDAY'].includes(s.day))?days:days.slice(0,5);
  const bounds=timeBounds(sessions),slots=[],availabilityOffset=usesSabanciBlocks()?40:0;
  for(let time=bounds.start;time<bounds.end;time+=60)slots.push(time);
  const rowHeight=148,height=(bounds.end-bounds.start)/60*rowHeight;
  return `<div class="proposal-calendar-scroll" tabindex="0" role="region" aria-label="${esc(label)}; scroll horizontally to view all days"><div class="proposal-calendar" style="--display-days:${displayedDays.length};--slot-height:${rowHeight}px"><div class="calendar-corner">Time</div>${displayedDays.map(day=>`<div class="room-day-heading">${day}${['Saturday','Sunday'].includes(day)?'<small>Substitute classes</small>':''}</div>`).join('')}<div class="proposal-time-axis" style="height:${height}px">${slots.map(time=>`<span style="top:${(time-bounds.start)/60*rowHeight}px">${clock(time)}<small>${clock(Math.min(time+50,bounds.end))}</small></span>`).join('')}</div>${displayedDays.map(day=>{
    const dayIndex=days.indexOf(day),daySessions=sessions.filter(s=>s.day===day.toUpperCase());
    return `<div class="proposal-day-track" data-calendar-day="${day.toUpperCase()}" style="height:${height}px">${slots.map(time=>`<div class="proposal-empty-slot" data-slot-start="${clock(time)}" style="top:${(time-bounds.start)/60*rowHeight}px;height:${Math.min(60,bounds.end-time)/60*rowHeight}px" aria-label="${day} ${clock(time)} teaching slot"></div>`).join('')}${entity?Object.entries(entity.availability||{}).filter(([key,value])=>value==='Unavailable'&&Number(key.split('-')[0])===dayIndex).map(([key])=>{const start=Number(key.split('-')[1])*60+availabilityOffset;const top=Math.max(bounds.start,start),end=Math.min(bounds.end,start+(availabilityOffset?50:60));return end>top?`<div class="unavailable-block" style="top:${(top-bounds.start)/60*rowHeight}px;height:${(end-top)/60*rowHeight}px"><span>Unavailable</span></div>`:'';}).join(''):''}${layoutEvents([...daySessions].sort((a,b)=>compareRecords({code:a.course,name:data.courses[a.courseIndex].name},{code:b.course,name:data.courses[b.courseIndex].name},proposalSort.timetable||'code'))).map(({session:s,lane,columns})=>`<div class="proposal-event ${columns>1?'has-overlap':''}" style="top:${(minutes(s.start)-bounds.start)/60*rowHeight}px;height:${(minutes(s.end)-minutes(s.start))/60*rowHeight}px;left:calc(${lane/columns*100}% + 5px);width:calc(${100/columns}% - 10px)" ${columns>1?'title="Overlapping sessions are shown side by side"':''}>${card(s)}</div>`).join('')}</div>`;
  }).join('')}</div></div>`;
}
timetable=function(){
  if(timetableFilters.course&&!data.courses.some(c=>c.code===timetableFilters.course&&courseIsEnabled(c)))timetableFilters.course='';
  const sessions=allSessions().filter(s=>(!timetableFilters.course||s.course===timetableFilters.course)&&(!timetableFilters.instructor||sessionStaff(s).some(p=>staffName(p)===timetableFilters.instructor))&&(!timetableFilters.classroom||s.classroom===timetableFilters.classroom));
  main.innerHTML=heading('Weekly timetable','See every teaching slot, including the gaps, and open a class to explore its plan.')+
    `<section class="panel timetable-filter-panel"><div class="panel-content filter-bar">${selectControl('timetable-course','Courses',data.courses.filter(courseIsEnabled).map(c=>[c.code,c.code+' · '+c.name]),timetableFilters.course,'All enabled courses')}${selectControl('timetable-instructor','Teaching staff',options('instructorNames'),timetableFilters.instructor,'All teaching staff')}${selectControl('timetable-classroom','Classroom',options('classroomCodes'),timetableFilters.classroom,'All classrooms')}</div></section>`+
    `<div class="timetable-summary"><span><b>${sessions.filter(isScheduled).length}</b> scheduled sessions</span><span><b>${sessions.filter(s=>!isScheduled(s)).length}</b> awaiting a time</span><label class="weekend-switch"><input id="show-weekends" type="checkbox" ${timetableView.weekends?'checked':''}> Show weekends</label><button id="print-timetable">Print timetable</button></div><section class="panel"><div class="section-heading"><h2>The teaching week</h2><small>08:40–19:30 · empty slots stay visible · weekend sessions appear automatically</small></div>${weeklyCalendar(sessions.filter(isScheduled),{weekends:timetableView.weekends})}</section>`+
    panel('Awaiting a time',sessions.filter(s=>!isScheduled(s)).sort((a,b)=>compareRecords({code:a.course,name:data.courses[a.courseIndex].name},{code:b.course,name:data.courses[b.courseIndex].name},proposalSort.timetable||'code')).map(s=>`<a class="unscheduled-row" href="#courses/edit/${s.courseIndex}"><strong>${esc(s.name)}</strong><small>${esc(s.instructor)} · ${esc(s.classroom)}</small><span class="tag">Assign time →</span></a>`).join('')||'<p>All created sessions have an assigned time. Catalogue entries without sections are not scheduled offerings.</p>',true);
  for(const key of ['course','instructor','classroom'])main.querySelector('#timetable-'+key).onchange=event=>{timetableFilters[key]=event.target.value;render();};
  main.querySelector('#show-weekends').onchange=event=>{timetableView.weekends=event.target.checked;render();};
  main.querySelector('#print-timetable').onclick=()=>window.print();
};

const scheduleSettings={stage:'initial',seatWeight:70,surgePercent:0,capacityDay:'',capacitySlot:''};

function computeScheduleMetrics(){
  const sessions=allSessions(),scheduled=sessions.filter(isScheduled),issues=scheduleIssues();
  let bookedSeatHours=0,usedSeatHours=0,overflowStudents=0,overflowSections=0,wastedLargeRooms=0,buildingScoreSum=0,buildingScoreCount=0;
  for(const s of scheduled){
    const room=data.classrooms.find(r=>r.code===s.classroom);
    const hrs=Math.max(0,(minutes(s.end)-minutes(s.start))/60);
    if(room){
      bookedSeatHours+=room.capacity*hrs;
      usedSeatHours+=Math.min(s.demand,room.capacity)*hrs;
      if(s.demand>room.capacity){overflowSections++;overflowStudents+=s.demand-room.capacity;}
      if(room.capacity>=80&&s.demand/room.capacity<=0.35)wastedLargeRooms++;
      const dept=data.courses[s.courseIndex]?.department;
      const bScore=data.buildingScores.find(b=>b.department===dept&&b.building===room.building)?.score??75;
      buildingScoreSum+=bScore;buildingScoreCount++;
    }
  }
  const unplacedSessions=sessions.length-scheduled.length;
  const unplacedStudents=sessions.filter(s=>!isScheduled(s)).reduce((n,s)=>n+(Number(s.demand)||0),0);
  const seatFillPct=bookedSeatHours?Math.round(usedSeatHours/bookedSeatHours*100):0;
  const wastedSeatHours=Math.max(0,Math.round(bookedSeatHours-usedSeatHours));
  const avgBuildingScore=buildingScoreCount?Math.round(buildingScoreSum/buildingScoreCount):80;
  const travelViolations=issues.filter(i=>i.category==='travel').length;
  const cohortClashes=issues.filter(i=>i.category==='cohort').length;
  const hardErrors=issues.filter(i=>i.severity==='error').length;
  return {
    totalSessions:sessions.length,
    scheduledCount:scheduled.length,
    unplacedSessions,
    unplacedStudents,
    bookedSeatHours:Math.round(bookedSeatHours),
    usedSeatHours:Math.round(usedSeatHours),
    wastedSeatHours,
    seatFillPct,
    overflowSections,
    overflowStudents,
    wastedLargeRooms,
    avgBuildingScore,
    travelViolations,
    cohortClashes,
    hardErrors,
    totalIssues:issues.length
  };
}

const originalPlanningPage=planningPage;
planningPage=function(){
  const route=currentRoute();
  if(route==='planning/counterfactual'){counterfactualPage();return;}
  if(route==='planning/session'){
    originalPlanningPage();
    main.querySelector('.page-heading')?.insertAdjacentHTML('afterend',planningSubnav('session'));
    return;
  }
  scheduleReviewPage();
};

dashboard=function(){
  const sessions=allSessions(),scheduled=sessions.filter(isScheduled),issues=scheduleIssues(),m=computeScheduleMetrics();
  main.innerHTML=heading('Scheduling and capacity overview','Manage teaching schedules and classrooms for Sabancı University.')+
    `<section class="welcome proposal-welcome"><div><span class="eyebrow">ACADEMIC SCHEDULING</span><h2>Plan teaching schedules and room assignments</h2><p>Review course placements, compare classroom capacity, and check conflicts before applying changes.</p><div class="welcome-actions"><a class="button primary" href="#planning">Review schedule →</a><a class="button welcome-secondary" href="#planning/counterfactual">Capacity comparison</a></div></div><div class="proposal-notebook" aria-hidden="true"><span>THE TEACHING WEEK</span><div>${['M','T','W','T','F'].map(d=>`<b>${d}</b>`).join('')}${Array.from({length:20},(_,i)=>`<i class="${[0,3,7,12,16].includes(i)?'filled':''}"></i>`).join('')}</div></div></section>`+
    `<div class="stats">${[['Catalogue courses',data.courses.length,'courses','18-column Sabancı faculty intake'],['Booked seat fill',m.seatFillPct+'%','planning/counterfactual',m.wastedSeatHours+' unused seat-hrs in booked rooms'],['Classrooms & labs',data.classrooms.length,'classrooms',data.classrooms.reduce((n,r)=>n+r.capacity,0)+' total seats across buildings'],['Schedule checks',issues.length,'issues',m.hardErrors?m.hardErrors+' hard conflicts detected':'No schedule errors reported']].map(([label,count,href,note])=>`<a class="stat" href="#${href}"><span>${label}</span><strong>${count}</strong><small>${note} ↗</small></a>`).join('')}</div>`+
    `<section class="panel"><div class="section-heading"><h2>Scheduling tools</h2></div><div class="proposal-feature-links">${[
      ['01','Schedule review','Review candidate changes and conflicts before applying placements.','planning'],
      ['02','Capacity comparison','Compare saved results and check available room hours.','planning/counterfactual'],
      ['03','Faculty Intake (18 Columns)','Inspect department course submissions, double codes, corequisites, and Class Reqs.','courses'],
      ['04','Feasibility & Travel Checks','Verify capacity overflows, inter-building travel times, and cohort clashes.','issues']
    ].map(([n,title,text,href])=>`<a href="#${href}"><span>${n}</span><h3>${title} ↗</h3><p>${text}</p></a>`).join('')}</div></section>`+
    `<div class="dashboard-columns"><section class="panel"><div class="section-heading"><h2>Schedule &amp; feasibility checks <span class="count-badge">${issues.length}</span></h2><a href="#issues">All checks →</a></div><div class="panel-content">${issueCards(issues.slice(0,4))}</div></section><section class="panel"><div class="section-heading"><h2>Spreadsheet import and export</h2><button type="button" class="text-link" data-open-spreadsheets>Open spreadsheets →</button></div><div class="panel-content"><p>Download inventory and intake CSVs, review imported rows, and export the current schedule.</p><div class="quick-actions"><button type="button" data-open-spreadsheets><strong>Review spreadsheet files</strong><small>University inventory and department intake CSV files</small></button></div></div></section></div>`;
};

function guidePage(){
  const guides=[
    ['planning','Schedule review','Review placements before applying changes','Select a planning stage and generate candidate placements. Compare each changed section, check remaining issues, and apply the reviewed schedule when ready.'],
    ['planning/counterfactual','Capacity comparison','Measure booked and available capacity','Compare saved before and after measurements, check free configured room hours by type, and estimate seat shortages at higher demand.'],
    ['general','General (Spreadsheet #1)','Configure university inventory & travel times','Define campuses, buildings, classroom types, the 08:40–19:30 time structure, room turnaround gaps, and inter-building travel times.'],
    ['courses','Courses (Spreadsheet #2)','Collect the 18 Sabancı faculty intake fields','Browse catalogue entries, edit the 18 internal faculty intake columns (SU credit, Dist. of hours, Double coded course, Corequisites, Class reqs, Room request), and manage sections, labs, and term distributions.'],
    ['instructors','Teaching staff','Manage hard unavailability & soft preferred hours','Filter instructors, TAs, and LAs by department or time window. Open a staff record to toggle Available, Preferred, and Unavailable slots.'],
    ['classrooms','Classrooms','Inspect capacities, attributes, and turnaround gaps','Filter rooms by capacity, building, or required technical type (Lecture Hall, Classroom, Computer Laboratory, Science Lab).'],
    ['timetable','Weekly timetable','Visualize the complete 08:40–19:30 teaching week','See every teaching block, including gaps and side-by-side overlaps. Filter by course, instructor, or classroom.'],
    ['exams','Exams','Allocate times and rooms for midterms and finals','Enter exam durations, student counts, and allowed windows. Generate, review, and apply date-specific classroom and time assignments.'],
    ['occupancy','Room occupancy','Explore campus heatmaps and slot utilization','Inspect the share of rooms occupied in each 50-minute teaching block. Use Show weekends to include Saturday and Sunday.'],
    ['issues','Schedule checks','Audit overflows, travel violations, and cohort clashes','Automatically verify classroom capacity overflows, wasted large halls, inter-building travel times, room turnaround gaps, academic conflict blocks, and same-term student clashes.']
  ];
  main.innerHTML=heading('Defterdar guide','Manage scheduling data, review placements, and check capacity.')+
    `<section class="guide-intro panel"><div class="panel-content"><h2>Start with your scheduling data</h2><p>Import inventory and intake CSVs, review the timetable, and generate placements for review. Use Filters to narrow a list and Undo to recover the previous workspace.</p><div class="guide-start"><a class="button primary" href="#planning">Schedule review</a><button type="button" class="button" data-open-spreadsheets>Open spreadsheets</button></div></div></section>`+
    `<div class="guide-grid">${guides.map(([href,title,subtitle,text],index)=>`<section class="panel guide-function"><div class="panel-content"><span class="guide-number">${String(index+1).padStart(2,'0')}</span><h2>${title}</h2><h3>${subtitle}</h3><p>${text}</p><a class="text-link" href="#${href}">Open ${title.toLowerCase()} →</a></div></section>`).join('')}</div>`;
}

const feedbackStorageKey=STORAGE_KEY+'-feedback';

function readLocalFeedback(){
  const entries=JSON.parse(localStorage.getItem(feedbackStorageKey)??'[]');
  if(!Array.isArray(entries)||!entries.every(entry=>entry&&
    ['improvement','bug'].includes(entry.kind)&&typeof entry.summary==='string'&&typeof entry.details==='string')){
    throw new Error('Invalid saved feedback');
  }
  return entries;
}

function feedbackPage(){
  main.innerHTML=heading('Improvements and bugs','Suggest a change, report a bug, or read recent feedback from other testers.')+
    `<section class="panel">
        <div class="section-heading"><h2>Feedback</h2><button type="button" id="download-feedback" disabled>Download all feedback (JSON)</button></div>
        <div class="panel-content">
          <form id="feedback-form">
            <p id="feedback-visibility">Checking feedback availability…</p>
            <div class="form-grid">
              <label>Type<select name="kind"><option value="improvement">Improvement</option><option value="bug">Bug</option></select></label>
              <label>Summary<input name="summary" required maxlength="120"></label>
              <div class="feedback-details">
                <label>Details<textarea name="details" rows="4" required maxlength="2000" aria-describedby="feedback-details-note"></textarea></label>
                <small id="feedback-details-note">Describe the change and which scheduling task it would help.</small>
              </div>
            </div>
            <div class="dialog-actions"><button type="submit" class="primary" aria-describedby="feedback-visibility" disabled>Submit feedback</button></div>
            <p id="feedback-status" role="status"></p>
          </form>
          <p>Room conflicts and capacity warnings appear in <a class="text-link" href="#issues">Schedule checks</a>.</p>
        </div>
    </section>
    <div class="dashboard-columns" id="feedback-board">
      <section class="panel"><div class="section-heading"><h2>Recent improvements</h2></div><div class="panel-content" id="feedback-improvements">Loading…</div></section>
      <section class="panel"><div class="section-heading"><h2>Recent bug reports</h2></div><div class="panel-content" id="feedback-bugs">Loading…</div></section>
    </div>`;
  const form=main.querySelector('#feedback-form');
  const status=main.querySelector('#feedback-status');
  const submit=form.querySelector('button[type="submit"]');
  const download=main.querySelector('#download-feedback');
  const visibility=main.querySelector('#feedback-visibility');
  const improvements=main.querySelector('#feedback-improvements');
  const bugs=main.querySelector('#feedback-bugs');
  const kind=form.elements.kind;
  const detailsNote=main.querySelector('#feedback-details-note');
  kind.addEventListener('change',()=>{
    detailsNote.textContent=kind.value==='bug'
      ?'Include the page, steps, and what you expected to happen.'
      :'Describe the change and which scheduling task it would help.';
  });
  const entriesMarkup=(records,empty)=>records.length
    ? `<ul class="feedback-entries">${records.map(record=>`<li><h3>${esc(record.summary)}</h3><p>${esc(record.details)}</p></li>`).join('')}</ul>`
    : `<p class="empty">${empty}</p>`;
  const showBoard=entries=>{
    improvements.innerHTML=entriesMarkup(entries.filter(record=>record.kind==='improvement'),'No improvements submitted yet.');
    bugs.innerHTML=entriesMarkup(entries.filter(record=>record.kind==='bug'),'No bugs reported yet.');
  };
  let localFeedback=location.protocol==='file:';
  let loadVersion=0;
  const refreshBoard=async()=>{
    const version=++loadVersion;
    try{
      if(!localFeedback){
        const response=await fetch('/api/feedback');
        if(version!==loadVersion)return;
        if(response.status===404){
          localFeedback=true;
        }else{
          if(!response.ok)throw new Error();
          const {entries}=await response.json();
          if(version!==loadVersion)return;
          showBoard(entries);
        }
      }
      if(localFeedback)showBoard(readLocalFeedback());
      visibility.textContent=localFeedback
        ?'Reports are saved in this browser. Download them to share with others.'
        :'Anyone with access to the site can read submissions.';
      submit.textContent=localFeedback?'Save in this browser':'Submit feedback';
      download.disabled=false;
    }catch{
      if(version!==loadVersion)return;
      visibility.textContent=improvements.textContent=bugs.textContent='Feedback could not be loaded.';
    }finally{
      if(version===loadVersion)submit.disabled=false;
    }
  };
  download.onclick=async()=>{
    download.disabled=true;
    status.textContent='Preparing download…';
    try{
      let entries;
      if(localFeedback){
        entries=readLocalFeedback();
      }else{
        const response=await fetch('/api/feedback?all=1');
        if(!response.ok)throw new Error();
        const archive=await response.json();
        if(!Array.isArray(archive.entries)||archive.complete===false||
          (archive.complete!==true&&archive.entries.length>=50))throw new Error();
        entries=archive.entries;
      }
      downloadJson('defterdar-feedback.json',entries);
      status.textContent=`Downloaded ${entries.length} feedback entries.`;
    }catch{
      status.textContent='The complete feedback list could not be downloaded.';
    }finally{
      download.disabled=false;
    }
  };
  refreshBoard();
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    if(submit.disabled)return;
    const summary=form.elements.summary.value.trim();
    const details=form.elements.details.value.trim();
    if(!summary||!details){
      status.textContent='Enter a summary and details before saving.';
      form.elements[summary?'details':'summary'].focus();
      return;
    }
    submit.disabled=true;
    status.textContent='Submitting feedback…';
    try{
      const entry={kind:kind.value,summary,details};
      if(localFeedback){
        const entries=[{...entry,createdAt:new Date().toISOString()},...readLocalFeedback()];
        localStorage.setItem(feedbackStorageKey,JSON.stringify(entries));
        showBoard(entries);
      }else{
        const response=await fetch('/api/feedback',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify(entry)
        });
        if(!response.ok)throw new Error();
        refreshBoard();
      }
      form.reset();
      kind.dispatchEvent(new Event('change'));
      status.textContent=localFeedback?'Feedback saved in this browser.':'Feedback submitted.';
    }catch{
      status.textContent='Feedback could not be submitted. Your text is still in the form.';
    }finally{
      submit.disabled=false;
    }
  });
}

loadPresentationExample=function(skipConfirm=false){
  if(!skipConfirm&&!confirm('Load the illustrative manual-scheduling conflict scenario? This populates room overflows, wasted hall capacity, an unreachable building transition, a same-term cohort clash, and an unplaced high-capacity section. Undo restores your current workspace.'))return;
  checkpoint();data=clone(window.EXAMPLE_DATA);
  normalizePlanningData(data);
  // 1. Overflowing section: IE311.DEMO (68 students in DEMO-102 with 53 seats -> +15 overflow)
  const ie311=data.courses.find(c=>c.code==='IE311');
  if(ie311)ie311.sections.push({name:'IE311.B',instructor:'Ece Demo',classroom:'DEMO-102',demand:68,day:'THURSDAY',start:'10:40',end:'12:30',teachingAssistant:'',learningAssistant:''});
  // 2. Wasted capacity: ENS208.A (41 students placed in 243-seat DEMO-201 shared hall -> 17% fill, 202 empty seats)
  const ens208=data.courses.find(c=>c.code==='ENS208');
  if(ens208&&ens208.sections[0])ens208.sections[0].classroom='DEMO-201';
  // 3. Unreachable consecutive buildings: Deniz Demo teaches CS201.A (MON 08:40–10:30 in DEMO-101, FENS building)
  //    and DSA210.A moved to MON 10:40–12:30 in DEMO-203 (Shared building) -> 10 min break < 15 min required travel!
  const dsa210=data.courses.find(c=>c.code==='DSA210');
  if(dsa210&&dsa210.sections[0]){
    Object.assign(dsa210.sections[0],{day:'MONDAY',start:'10:40',end:'12:30',classroom:'DEMO-203'});
  }
  // 4. Same-Department/Term Cohort & Academic Block Clash: MATH101.A placed on MONDAY 08:40–10:30 overlapping CS201.A
  const math101=data.courses.find(c=>c.code==='MATH101');
  if(math101&&math101.sections[0]){
    math101.sections[0].day='MONDAY';math101.sections[0].start='08:40';math101.sections[0].end='10:30';
    math101.distributions=[{term:1,department:'CS',percentage:60},{term:1,department:'MATH',percentage:40}];
  }
  // Include an additional section of an existing course so the catalogue stays intact.
  const computing=data.courses.find(c=>c.code==='CS201');
  if(computing)computing.sections.push({name:'CS201.B',instructor:'Deniz Demo',classroom:'DEMO-101',demand:118,day:'',start:'',end:'',teachingAssistant:'',learningAssistant:''});
  // 6. Unavailable room slot overlap on DEMO-PC1 during CS202.L-A (Friday 16:40)
  const pc1=data.classrooms.find(r=>r.code==='DEMO-PC1');
  if(pc1)pc1.availability={'4-16':'Unavailable'};
  scheduleReview=null;
  persist();
  if(!['planning','issues','timetable','occupancy'].includes(currentRoute().split('/')[0]))location.hash='planning';
  render();
  notify('Conflict scenario loaded. Generate candidate placements in Schedule review.');
};

function addRelationshipConversions(){
  for(const key of ['standardRules','orderRules'])main.querySelectorAll(`.data-table[data-key="${key}"] tbody tr`).forEach(row=>{
    const index=Number(row.dataset.rowIndex),rule=data[key][index],button=document.createElement('button');
    button.textContent='Make '+(rule.enforcement==='Hard'?'soft':'hard');button.dataset.convertRule=key;button.dataset.index=index;row.querySelector('.actions')?.prepend(button);
  });
}
document.addEventListener('click',event=>{
  if(event.target.closest('[data-trigger-demo-scenario]')){loadPresentationExample();return;}
  if(event.target.closest('#spreadsheets-btn,[data-open-spreadsheets]')){openSpreadsheetModal();return;}
  if(event.target.closest('[data-generate-schedule]')){generateScheduleCandidate();return;}
  if(event.target.closest('[data-apply-schedule-review]')){applyScheduleReview();return;}
  if(event.target.closest('[data-discard-schedule-review]')){scheduleReview=null;render();return;}
  if(event.target.closest('[data-export-uni-csv]')){exportUniversitySpreadsheetCsv();return;}
  if(event.target.closest('[data-export-dept-csv]')){exportDepartmentIntakeCsv();return;}
  if(event.target.closest('[data-export-schedule-csv]')){exportScheduleCsv();return;}
  const pinBtn=event.target.closest('[data-pin-session]');
  if(pinBtn){
    const session=allSessions().find(s=>sessionKey(s)===pinBtn.dataset.pinSession);
    if(!session)return;
    const record=sessionRecord(data,session);
    checkpoint();record.fixedTime=record.fixedTime!==true;scheduleReview=null;
    const saved=persist();render();
    if(saved)notify(record.fixedTime?'Meeting time fixed.':'Meeting time unlocked.');
    return;
  }
  const courseSwitch=event.target.closest('[data-course-schedule]');
  if(courseSwitch){
    const index=Number(courseSwitch.dataset.courseSchedule),course=data.courses[index];if(!course)return;
    checkpoint();course.scheduleStatus=courseIsEnabled(course)?'Off':'On';
    const saved=persist();render();
    const replacement=main.querySelector(`[data-course-schedule="${index}"]`);if(replacement&&!replacement.closest('tr')?.hidden)replacement.focus({preventScroll:true});
    notify(saved?`${course.code} is ${course.scheduleStatus} for this semester’s schedule. Assignments are kept.`:'Change is in memory only. Export data to keep it.');
  }
  const conversion=event.target.closest('[data-convert-rule]');
  if(conversion){
    const key=conversion.dataset.convertRule,index=Number(conversion.dataset.index),record=data[key]?.[index];if(!record)return;
    checkpoint();record.enforcement=record.enforcement==='Hard'?'Soft':'Hard';
    const saved=persist();render();if(saved)notify('Constraint strength changed. Undo restores the previous setting.');
  }
  const nav=event.target.closest('#sidebar nav a');
  if(nav){
    event.preventDefault();const page=nav.hash.slice(1);resetViewFilters(page);proposalControls[page]={filters:false,sort:false};
    if(location.hash!==nav.hash)location.hash=nav.hash;else render();
  }
});
document.addEventListener('change',event=>{
  const select=event.target.closest('[data-constraint-type]');
  if(select){
    const key=select.dataset.constraintType,index=Number(select.dataset.index),record=data[key]?.[index];
    const target=select.value==='Hard'?'hardConstraints':'softConstraints';
    if(!record||key===target)return;
    if(data[target].some(rule=>rule.name===record.name)){
      select.value=key==='hardConstraints'?'Hard':'Soft';
      notify('A constraint with this name already exists in the other group. Rename it first.');
      return;
    }
    checkpoint();data[key].splice(index,1);data[target].push({...record,importance:record.importance??50});
    const saved=persist();render();
    main.querySelector(`[data-constraint-type="${target}"][data-index="${data[target].length-1}"]`)?.focus();
    if(saved)notify('Constraint strength changed. Undo restores the previous setting.');
    return;
  }
  if(event.target.matches('[data-rule-importance]')){
    const rule=data.softConstraints[Number(event.target.dataset.ruleImportance)],value=event.target.valueAsNumber;
    if(!rule)return;
    if(!Number.isInteger(value)||value<0||value>100){event.target.value=rule.importance;notify('Importance must be a whole number from 0 to 100.');return;}
    if(value===rule.importance)return;checkpoint();rule.importance=value;persist();render();notify('Importance saved');
  }
});
document.addEventListener('input',event=>{
  if(event.target.matches('#staff-search,#finder-search'))updateFilterCount(currentRoute().split('/')[0]);
});

function replacePersonalCalendar(page,action,reference){
  const old=main.querySelector('.room-calendar-scroll');if(!old)return;
  let entity,sessions,card;
  if(page==='occupancy'&&action==='room'){
    let code;try{code=decodeURIComponent(reference);}catch(_){return;}
    entity=data.classrooms.find(r=>r.code===code);if(!entity)return;
    sessions=scheduledSessions().filter(s=>s.classroom===code);card=sessionCard;
  }else if(page==='instructors'&&action==='schedule'){
    let email;try{email=decodeURIComponent(reference);}catch(_){return;}
    entity=data.instructors.find(p=>p.email===email);if(!entity)return;
    sessions=sessionsForStaff(entity,true);
    card=s=>sessionCard(s).replace('</a>',`<small class="assignment-role">${esc(staffAssignment(entity,s))}</small></a>`);
  }else return;
  old.outerHTML=weeklyCalendar(sessions,{entity,card,weekends:true,label:'Personal weekly timetable'});
}
function showLegacyRestore(){
  let legacy;try{legacy=localStorage.getItem('kitai-static-demo-v1');}catch(_){return;}
  if(!legacy)return;
  const note=document.createElement('div');note.className='notice';note.innerHTML='<strong>An earlier workspace is available.</strong> <button id="restore-earlier-demo">Restore the earlier workspace</button>';
  main.append(note);note.querySelector('button').onclick=()=>{
    try{const restored=validateImport(JSON.parse(legacy));if(!confirm('Restore the earlier browser workspace here? Use Undo to recover the current workspace.'))return;checkpoint();data=restored;persist();render();notify('Earlier workspace restored. Undo is available.');}catch(error){notify('Earlier data could not be restored: '+error.message);}
  };
}
function showIntroCatalogueBackup(){
  let backup;try{backup=localStorage.getItem(STORAGE_KEY+'-before-intro-catalogue');}catch(_){return;}
  if(!backup)return;
  const note=document.createElement('div');note.className='notice';
  note.innerHTML='<strong>Your catalogue was reduced to the introductory selection.</strong> The earlier workspace is kept as a backup. <button id="download-catalogue-backup">Download earlier catalogue backup</button>';
  main.append(note);note.querySelector('button').onclick=()=>{
    const url=URL.createObjectURL(new Blob([backup],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download='defterdar-before-intro-catalogue.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
}
const renderBeforeProposal=render;
render=function(){
  if(currentRoute()==='exams/allocate')history.replaceState(null,'','#exam-allocation');
  const requestedRoute=currentRoute();
  if(requestedRoute!==lastProposalRoute){proposalControls[requestedRoute]={filters:false,sort:false};lastProposalRoute=requestedRoute;}
  renderBeforeProposal();
  const route=currentRoute(),[page,action,reference]=route.split('/');
  if(page==='help')guidePage();
  if(page==='feedback')feedbackPage();
  if(page==='exams')examsPage();
  if(page==='exam-allocation')examAllocationPage();
  if(page==='help')main.querySelector('.guide-function a[href="#courses"]')?.insertAdjacentHTML('beforebegin','<p><strong>Choose courses for this semester:</strong> each course has an On/Off switch. Off courses stay in the catalogue, but their sections and labs are excluded from timetables, occupancy, staff hours, checks, and room comparisons. Switch them back On to restore their saved assignments. Course details also offer this setting; select a value and Save changes. Filters can show On or Off courses.</p>');
  if(page==='courses'&&action==='edit'&&data.courses[Number(reference)]){
    const course=data.courses[Number(reference)];
    main.querySelector('.page-heading')?.insertAdjacentHTML('afterend',`<p class="course-schedule-hint"><strong>In this semester’s schedule: ${courseIsEnabled(course)?'On':'Off'}.</strong> ${courseIsEnabled(course)?'This course’s sections and labs contribute to the plan.':'This course is excluded from scheduled views and checks. Its sections, labs, and assignments are kept.'} Change “In this semester’s schedule” below and Save changes to update it.</p>`);
    const sections=main.querySelector('[data-key="sections"]');
    const labs=main.querySelector('[data-key="labs"]');
    main.querySelector('#detail-form').closest('section').before(sections.closest('details'),labs.closest('details'));
    sections.querySelector('[data-action="add"]').textContent='+ Add section';
    labs.querySelector('[data-action="add"]').textContent='+ Add lab or recitation';
  }
  if(page==='dashboard'){main.querySelector('.occupancy-entry')?.remove();showLegacyRestore();showIntroCatalogueBackup();}
  if(page==='general'){
    const notice=main.querySelector('.notice');if(notice)notice.innerHTML='<strong>Planning foundations.</strong> Teaching blocks run for 50 minutes, from :40 to :30. A meeting can span up to three consecutive blocks. Saturday and Sunday support substitute classes. Confirm term-specific windows, event blocks, and registration dates before scheduling classes.';
  }
  replacePersonalCalendar(page,action,reference);
  addRelationshipConversions();
  addViewControls(page,route);
  decorateDataTables();
  document.title='Defterdar · '+(main.querySelector('h1')?.textContent||'Sabancı University');
};
render();
