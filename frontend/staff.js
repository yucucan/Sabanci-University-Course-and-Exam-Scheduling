/* Teaching-team schedules. Existing instructor records and URLs stay compatible. */
'use strict';

const staffRoles = ['Instructor', 'Teaching Assistant', 'Learning Assistant'];
const staffView = {roles: [], faculty: '', department: '', day: '', start: '08:40', end: '19:30', status: '', query: '', slot: null};
const staffName = person => person.name + ' ' + person.surname;
const staffRole = person => person.role || 'Instructor';
const staffHref = person => '#instructors/schedule/' + encodeURIComponent(person.email);
const assistantFields = [['teachingAssistant', 'Teaching Assistant'], ['learningAssistant', 'Learning Assistant']];

function normalizeStaffData(workspace) {
  if (Array.isArray(workspace.instructors)) workspace.instructors.forEach(person => {
    if (person && typeof person === 'object' && person.role === undefined) person.role = 'Instructor';
  });
  if (Array.isArray(workspace.courses)) workspace.courses.forEach(course => {
    if (!course || typeof course !== 'object') return;
    for (const key of ['sections', 'labs']) if (Array.isArray(course[key])) course[key].forEach(session => {
      if (!session || typeof session !== 'object') return;
      assistantFields.forEach(([field]) => { if (session[field] === undefined) session[field] = ''; });
    });
  });
  return workspace;
}
normalizeStaffData(data);
normalizeStaffData(window.EXAMPLE_DATA);
titles.instructors = 'Teaching staff';
schemas.instructors.splice(3, 0, {...f('role', 'Staff role', 'select', staffRoles), default: 'Instructor'});
for (const key of ['sections', 'labs']) {
  schemas[key].find(spec => spec.key === 'instructor').label = 'Lead instructor';
  schemas[key].splice(2, 0,
    {...f('teachingAssistant', 'Teaching assistant', 'select', 'teachingAssistantEmails'), optional: true},
    {...f('learningAssistant', 'Learning assistant', 'select', 'learningAssistantEmails'), optional: true});
}
const optionsBeforeStaff = options;
options = function(source,parent) {
  if (source === 'teachingAssistantEmails') return data.instructors.filter(p => staffRole(p) === 'Teaching Assistant').map(p => p.email);
  if (source === 'learningAssistantEmails') return data.instructors.filter(p => staffRole(p) === 'Learning Assistant').map(p => p.email);
  return optionsBeforeStaff(source,parent);
};
function optionLabel(source, value) {
  if (source === 'courseCodes') {
    const course = data.courses.find(record => record.code === value);
    return course ? `${course.code} · ${course.name}` : value;
  }
  if (['teachingAssistantEmails', 'learningAssistantEmails', 'staffEmails'].includes(source)) {
    const person = data.instructors.find(p => p.email === value);
    return person ? `${staffName(person)} · ${staffRole(person)} · ${person.email}` : value;
  }
  return value;
}

function sessionStaff(session) {
  const people = [];
  const lead = data.instructors.find(person => staffName(person) === session.instructor);
  if (lead) people.push(lead);
  assistantFields.forEach(([field]) => {
    const person = data.instructors.find(p => p.email === session[field]);
    if (person && !people.some(p => p.email === person.email)) people.push(person);
  });
  return people;
}
function sessionsForStaff(person, scheduledOnly = false) {
  return (scheduledOnly ? scheduledSessions() : allSessions()).filter(session => sessionStaff(session).some(p => p.email === person.email));
}
function staffAssignment(person, session) {
  if (session.instructor === staffName(person)) return 'Lead instructor';
  return assistantFields.find(([field]) => session[field] === person.email)?.[1] || staffRole(person);
}
function occupiedMinutes(sessions) {
  return dayCodes().reduce((sum, day) => {
    const intervals = sessions.filter(s => s.day === day).map(s => [minutes(s.start), minutes(s.end)]).sort((a,b) => a[0]-b[0]);
    let end = -1, total = 0;
    intervals.forEach(([start, stop]) => { total += Math.max(0, stop - Math.max(start, end)); end = Math.max(end, stop); });
    return sum + total;
  }, 0);
}
function staffWindow(person, day, start, end, excludeKey = '') {
  if(!day){
    const states=dayCodes().map(d=>staffWindow(person,d,start,end,excludeKey));
    return {sessions:states.flatMap(s=>s.sessions),busy:states.some(s=>s.busy),blocked:states.some(s=>s.blocked),free:states.every(s=>s.free),collision:states.some(s=>s.collision||s.busy&&s.blocked)};
  }
  const sessions = sessionsForStaff(person, true).filter(s => sessionKey(s) !== excludeKey && s.day === day && overlaps(minutes(start), minutes(end), minutes(s.start), minutes(s.end)));
  const unavailable = unavailableHours(person,dayCodes().indexOf(day),start,end);
  const collision = sessions.some((a,i) => sessions.slice(i+1).some(b => overlaps(minutes(a.start), minutes(a.end), minutes(b.start), minutes(b.end))));
  return {sessions, busy: sessions.length > 0, blocked: unavailable.length > 0, free: !sessions.length && !unavailable.length, collision};
}
function staffStatus(state) {
  if (state.collision || state.busy && state.blocked) return ['conflict', 'Schedule conflict'];
  if (state.busy) return ['occupied', 'Teaching'];
  if (state.blocked) return ['blocked', 'Unavailable'];
  return ['free', 'Free'];
}
function staffInScope() {
  return data.instructors.filter(person => (!staffView.roles.length || staffView.roles.includes(staffRole(person))) &&
    (!staffView.faculty || person.faculty === staffView.faculty) && (!staffView.department || person.department === staffView.department));
}
function staffFilters() {
  return `<section class="panel staff-filter-panel"><div class="panel-content"><div class="filter-bar">
    ${selectControl('staff-faculty', 'Faculty', data.faculties.map(f => f.name), staffView.faculty, 'All faculties')}
    ${selectControl('staff-department', 'Department', data.departments.filter(d => !staffView.faculty || d.faculty === staffView.faculty).map(d => [d.abbreviation, d.name]), staffView.department, 'All departments')}
    <button id="clear-staff-filters">Clear filters</button></div>
    <fieldset class="type-filters"><legend>Staff roles <span>Select any combination · none selected means all roles</span></legend>${staffRoles.map(role => `<label class="type-chip"><input type="checkbox" data-staff-role="${role}" ${staffView.roles.includes(role) ? 'checked' : ''}><span>${role}</span></label>`).join('')}</fieldset>
    </div></section>`;
}
function bindStaffFilters() {
  document.querySelector('#staff-faculty').onchange = e => { staffView.faculty = e.target.value; staffView.department = ''; render(); };
  document.querySelector('#staff-department').onchange = e => { staffView.department = e.target.value; render(); };
  document.querySelectorAll('[data-staff-role]').forEach(input => { input.onchange = () => {
    staffView.roles = [...document.querySelectorAll('[data-staff-role]:checked')].map(i => i.dataset.staffRole); render();
  }; });
  document.querySelector('#clear-staff-filters').onclick = () => { Object.assign(staffView, {roles: [], faculty: '', department: '', status: '', query: ''}); render(); };
}
function staffViewSwitch(active) {
  return `<div class="view-switch"><a class="${active === 'finder' ? 'selected' : ''}" href="#instructors">Find teaching staff</a><a class="${active === 'heatmap' ? 'selected' : ''}" href="#instructors/occupancy">Weekly staff availability</a><button class="primary" data-action="add" data-key="instructors">+ Add staff member</button></div>`;
}
function staffUnscheduledNotice(people) {
  const count = allSessions().filter(s => !isScheduled(s) && sessionStaff(s).some(p => people.some(person => person.email === p.email))).length;
  return count ? `<div class="notice">${count} assigned session(s) have no day/time and are excluded from availability. <a href="#timetable">Review unassigned sessions →</a></div>` : '';
}

function staffFinder() {
  const valid = (!staffView.day||dayCodes().includes(staffView.day)) && windowValid(staffView.start, staffView.end), people = staffInScope();
  const states = valid ? people.map(person => ({person, ...staffWindow(person, staffView.day, staffView.start, staffView.end)})) : [];
  const visible = states.filter(state => !staffView.status || (staffView.status === 'free' ? state.free : staffView.status === 'busy' ? state.busy : staffView.status === 'conflict' ? state.collision || state.busy && state.blocked : state.blocked));
  const searchText = person => foldSearch(`${staffName(person)} ${person.email} ${staffRole(person)} ${person.faculty} ${person.department}`);
  const matches = person => searchText(person).includes(foldSearch(staffView.query));
  const count = visible.filter(s => matches(s.person)).length;
  main.innerHTML = heading('Teaching staff', 'Find instructors, teaching assistants, and learning assistants, or open their weekly schedules.') + staffViewSwitch('finder') +
    `<section class="panel time-picker"><div class="panel-content"><div class="section-kicker">CHECK STAFF AVAILABILITY</div><div class="filter-bar">
      ${selectControl('staff-day','Day',days.map((d,i)=>[dayCodes()[i],d]),staffView.day,'All days')}
      <label>From<input id="staff-start" type="time" value="${esc(staffView.start)}"></label><label>Until<input id="staff-end" type="time" value="${esc(staffView.end)}"></label>
      ${selectControl('staff-status','Status',[['free','Free'],['busy','Teaching'],['blocked','Unavailable'],['conflict','Schedule conflict']],staffView.status,'All statuses')}
      <button id="staff-show-heatmap">Show in weekly view</button></div><small>Free means no assigned class or unavailability overlaps the full interval. Includes lead, TA, and LA assignments.</small></div></section>` + staffFilters() +
    (valid ? statCards([['Matching staff',people.length,'Within the selected roles and departments'],['Free staff',states.filter(s=>s.free).length,'Available for the whole requested interval'],['Teaching',states.filter(s=>s.busy).length,'At least one assigned class overlaps'],['Unavailable',states.filter(s=>s.blocked&&!s.busy).length,'Restricted by personal availability']]) : '<div class="notice" role="alert">Choose a day and an end time later than the start time.</div>') +
    staffUnscheduledNotice(people) +
    (!data.instructors.some(p=>staffRole(p)!=='Instructor') ? '<div class="notice">Add a staff member with the Teaching Assistant or Learning Assistant role to assign assistants to sessions.</div>' : '') +
    `<section class="panel"><div class="section-heading"><h2>Teaching team</h2><span id="staff-count">${count} people shown</span></div><div class="panel-content"><label class="room-search">Search teaching staff<input id="staff-search" type="search" value="${esc(staffView.query)}" placeholder="Name, email, role, or department"></label>
    <div class="table-wrap"><table class="staff-results"><thead><tr><th scope="col">Staff member</th><th scope="col">Role / department</th><th scope="col">Status</th><th scope="col">Teaching hours${staffView.day?' · selected day':' · weekly'}</th><th scope="col">Classes in this interval</th><th scope="col">Actions</th></tr></thead><tbody>${visible.map(state=>{
      const person=state.person,[style,label]=staffStatus(state),index=data.instructors.indexOf(person),hours=occupiedMinutes(sessionsForStaff(person,true).filter(s=>!staffView.day||s.day===staffView.day))/60;
      return `<tr class="staff-result" data-staff-search="${esc(searchText(person))}" ${matches(person)?'':'hidden'}><td><a class="room-name" href="${esc(staffHref(person))}"><strong>${esc(staffName(person))} ↗</strong><span>${esc(person.email)}</span></a></td><td><strong>${esc(staffRole(person))}</strong><small>${esc(person.department)} · ${esc(person.faculty)}</small></td><td><span class="room-status ${style}">${label}</span></td><td>${hours.toFixed(1)} hours<small>${person.min}–${person.max} hours/day target${hours>person.max?' · Above maximum':''}</small></td><td>${state.sessions.map(s=>`<a class="class-link" href="#courses/edit/${s.courseIndex}">${esc(s.name)}<small>${esc(s.day)} · ${s.start}–${s.end} · ${esc(s.classroom)} · ${esc(staffAssignment(person,s))}</small></a>`).join('')||'<span class="muted">No assigned class in this interval</span>'}</td><td><div class="actions"><a class="tag" href="${esc(staffHref(person))}">Schedule</a><a class="tag" href="#instructors/edit/${index}">Details</a><button data-action="edit" data-key="instructors" data-index="${index}">Edit</button><button class="danger" data-action="delete" data-key="instructors" data-index="${index}">Delete</button></div></td></tr>`;
    }).join('')}</tbody></table></div><p id="staff-empty" class="empty" ${count?'hidden':''}>${valid?'No staff match these filters. Try another role, department, or time.':'Select a valid day and time window.'}</p></div></section>`;
  bindStaffFilters();
  for(const [id,key] of [['staff-day','day'],['staff-start','start'],['staff-end','end'],['staff-status','status']])document.getElementById(id).onchange=e=>{staffView[key]=e.target.value;render();};
  document.querySelector('#staff-search').oninput=e=>{
    staffView.query=e.target.value;let shown=0;
    document.querySelectorAll('.staff-result').forEach(row=>{row.hidden=!row.dataset.staffSearch.includes(foldSearch(staffView.query));if(!row.hidden)shown++;});
    document.querySelector('#staff-count').textContent=`${shown} people shown`;document.querySelector('#staff-empty').hidden=shown>0;
  };
  document.querySelector('#staff-show-heatmap').onclick=()=>{
    if(!valid||!staffView.day){notify('Select a single day to highlight a slot in the weekly view.');return;}
    staffView.slot={day:staffView.day,start:staffView.start,end:staffView.end};location.hash='instructors/occupancy';
  };
}

function staffSlotInspector() {
  const slot=staffView.slot;if(!slot)return '<div class="slot-hint">Select a time slot above to inspect teaching-staff availability.</div>';
  const states=staffInScope().map(person=>({person,...staffWindow(person,slot.day,slot.start,slot.end)}));
  return `<section class="panel"><div class="section-heading"><div><h2 id="staff-slot-heading" tabindex="-1">${esc(slot.day)} · ${slot.start}–${slot.end}</h2><small>${states.filter(s=>s.free).length} free · ${states.filter(s=>s.busy).length} teaching</small></div><button id="staff-find-this-slot">Find staff for this time →</button></div><div class="panel-content slot-room-list">${states.map(state=>{
    const [style,label]=staffStatus(state);
    return `<a class="slot-room ${style}" href="${esc(staffHref(state.person))}"><div><strong>${esc(staffName(state.person))}</strong><small>${esc(staffRole(state.person))}</small></div><span class="room-status ${style}">${label}</span><small>${state.sessions.map(s=>esc(s.name)).join(', ')||(state.blocked?'Personal availability restriction':'Free for the entire interval')}</small></a>`;
  }).join('')||'<p>No staff match these filters.</p>'}</div></section>`;
}
function staffHeatmap() {
  const people=staffInScope(),slots=teachingHeatmapRows(days);
  main.innerHTML=heading('Weekly staff availability','See how many people are teaching in each slot, then open an individual schedule.')+staffViewSwitch('heatmap')+staffFilters()+
    `<div class="toolbar"><button id="print-staff-heatmap">Print view</button></div>`+
    staffUnscheduledNotice(people)+`<section class="panel"><div class="section-heading"><h2>Teaching-staff heatmap</h2><small>${people.length} people · teaching ÷ matching staff</small></div><div class="heat-legend"><span>Less busy</span><i class="heat-0"></i><i class="heat-1"></i><i class="heat-2"></i><i class="heat-3"></i><i class="heat-4"></i><span>More busy</span></div>${people.length?`<div class="occupancy-scroll"><table class="heatmap"><caption class="sr-only">Teaching staff availability by day and time</caption><thead><tr><th scope="col">Time</th>${days.map(d=>`<th scope="col">${d}</th>`).join('')}</tr></thead><tbody>${slots.map(({start,end,days:configuredDays})=>`<tr><th scope="row">${start}<small>${end}</small></th>${dayCodes().map(day=>{
      if(!configuredDays.has(day))return '<td aria-label="No teaching block">—</td>';
      const states=people.map(p=>staffWindow(p,day,start,end)),busy=states.filter(s=>s.busy).length,free=states.filter(s=>s.free).length,blocked=states.filter(s=>s.blocked&&!s.busy).length,pct=percentage(busy,people.length),level=busy?Math.max(1,Math.ceil(pct/25)):0,selected=staffView.slot?.day===day&&staffView.slot?.start===start;
      return `<td><button class="heat-cell heat-${level} ${selected?'is-selected':''}" data-staff-slot-day="${day}" data-staff-slot-start="${start}" data-staff-slot-end="${end}" aria-pressed="${selected}" aria-label="${day} ${start}: ${busy} of ${people.length} teaching, ${free} free"><strong>${pct}%</strong><span>${busy} / ${people.length} teaching</span><small>${free} free${blocked?' · '+blocked+' unavailable':''}</small></button></td>`;
    }).join('')}</tr>`).join('')}</tbody></table></div>`:'<p class="empty">No staff match these filters.</p>'}</section><section id="staff-slot-inspector" aria-live="polite">${staffSlotInspector()}</section>`;
  bindStaffFilters();document.querySelector('#print-staff-heatmap').onclick=()=>window.print();
}

function staffSchedule(email) {
  const person=data.instructors.find(p=>p.email===email);
  if(!person){main.innerHTML=heading('Staff member not found','This person may have been renamed or removed.')+'<a class="button primary" href="#instructors">Return to teaching staff</a>';return;}
  const assigned=sessionsForStaff(person),sessions=assigned.filter(isScheduled),bounds=timeBounds(sessions),hours=(bounds.end-bounds.start)/60,rowHeight=76;
  const conflictCount=dayCodes().reduce((n,day)=>n+sessions.filter(s=>s.day===day).filter((s,i,list)=>list.slice(i+1).some(other=>overlaps(minutes(s.start),minutes(s.end),minutes(other.start),minutes(other.end)))).length,0);
  main.innerHTML=`<a class="back" href="#instructors">← Teaching staff</a>`+heading(staffName(person),`${staffRole(person)} · ${person.department} · ${person.faculty}`)+
    `<div class="view-switch"><a href="#instructors">Find teaching staff</a><a href="#instructors/occupancy">Weekly staff availability</a><a href="#instructors/edit/${data.instructors.indexOf(person)}">Details & availability</a><button id="print-person-schedule">Print schedule</button></div>`+
    `<section class="panel"><div class="panel-content">${selectControl('staff-switcher','Staff member',data.instructors.map(p=>[p.email,`${staffName(p)} · ${staffRole(p)}`]),person.email,'Choose a staff member')}</div></section>`+
    statCards([['Role',staffRole(person),'Includes all lead, TA, and LA assignments'],['Assigned sessions',assigned.length,`${assigned.length-sessions.length} still need a time`],['Scheduled teaching',(occupiedMinutes(sessions)/60).toFixed(1)+' h','Weekly booked time; overlaps count once'],['Overlapping sessions',conflictCount,'Review conflicts before finalizing']])+
    staffUnscheduledNotice([person])+
    `<section class="panel"><div class="section-heading"><div><h2>Weekly teaching schedule</h2><small>${esc(person.email)} · classes include role and classroom</small></div><div class="schedule-legend"><span>▣ Lecture</span><span>▤ Lab</span><span>▧ Unavailable</span></div></div><div class="room-calendar-scroll"><div class="room-calendar" style="--hours:${hours};--hour-height:${rowHeight}px"><div class="calendar-corner">Time</div>${days.map(d=>`<div class="room-day-heading">${d}</div>`).join('')}<div class="room-time-axis" style="height:${hours*rowHeight}px">${Array.from({length:hours},(_,i)=>`<span style="top:${i*rowHeight}px">${clock(bounds.start+i*60)}</span>`).join('')}</div>${dayCodes().map((day,dayIndex)=>`<div class="room-day-track" style="height:${hours*rowHeight}px" aria-label="${days[dayIndex]} staff schedule">${Array.from({length:hours},(_,i)=>person.availability?.[`${dayIndex}-${bounds.start/60+i}`]==='Unavailable'?`<div class="unavailable-block" style="top:${i*rowHeight}px;height:${rowHeight}px"><span>Unavailable</span></div>`:'').join('')}${layoutEvents(sessions.filter(s=>s.day===day)).map(({session:s,lane,columns})=>{
      const top=(minutes(s.start)-bounds.start)/60*rowHeight,height=(minutes(s.end)-minutes(s.start))/60*rowHeight;
      return `<a class="room-event ${s.kind==='Lab'?'lab-event':''} ${columns>1?'overlap-event':''} ${height<65?'short-event':''}" href="#courses/edit/${s.courseIndex}" style="top:${top}px;height:${height}px;left:calc(${lane/columns*100}% + 3px);width:calc(${100/columns}% - 6px)" title="${esc(`${s.name} · ${s.start}–${s.end} · ${s.classroom} · ${staffAssignment(person,s)}`)}"><span class="event-time">${s.start}–${s.end} · ${esc(sessionType(s))}</span><strong>${esc(s.name)}</strong><span class="event-course">${esc(data.courses[s.courseIndex].name)}</span><small>${esc(s.classroom)} · ${esc(staffAssignment(person,s))}</small><small>${columns>1?'SCHEDULE OVERLAP':''}</small></a>`;
    }).join('')}</div>`).join('')}</div></div></section>`+
    panel('Assigned classes',`<div class="table-wrap"><table><thead><tr><th>Class</th><th>Assignment</th><th>Day / time</th><th>Classroom</th><th>Lead instructor</th></tr></thead><tbody>${assigned.map(s=>`<tr><td><a class="text-link" href="#courses/edit/${s.courseIndex}">${esc(s.name)}</a></td><td>${esc(staffAssignment(person,s))}</td><td>${isScheduled(s)?`${esc(s.day)} · ${s.start}–${s.end}`:'Time not assigned'}</td><td><a class="text-link" href="${esc(roomHref(s.classroom))}">${esc(s.classroom)}</a></td><td>${esc(s.instructor)}</td></tr>`).join('')}</tbody></table></div>${assigned.length?'':'<p>No classes assigned yet. Open a course to assign this person as lead instructor, TA, or LA.</p>'}`,true)+
    `<div class="notice">Personal availability is edited in <a href="#instructors/edit/${data.instructors.indexOf(person)}">Details & availability</a>. Unscheduled sessions do not count as teaching time. All scheduled sessions are treated as occurring every week.</div>`;
  document.querySelector('#staff-switcher').onchange=e=>{location.hash=e.target.value?staffHref({email:e.target.value}):'#instructors';};
  document.querySelector('#print-person-schedule').onclick=()=>window.print();
}

const validateBeforeStaff=validate;
validate=function(record,key,index,parent){
  const error=validateBeforeStaff(record,key,index,parent);if(error)return error;
  if(key==='instructors'){
    const old=index===undefined?data.instructors.find(p=>p===record):data.instructors[index];
    if(data.instructors.some(p=>p!==old&&staffName(p)===staffName(record)))return 'Use a distinct full name for each staff member; lead assignments currently use full names.';
    if(data.instructors.some(p=>p!==old&&p.email.toLowerCase()===record.email.toLowerCase()))return 'That staff email already exists.';
    if(old&&staffRole(old)!==record.role){
      for(const [field,role]of assistantFields)if(record.role!==role&&allSessions({includeDisabled:true}).some(s=>s[field]===old.email))return `Remove this person’s ${role} assignments before changing their role.`;
    }
  }
  if(['sections','labs'].includes(key)){
    const team=sessionStaff(record),assigned=assistantFields.map(([field])=>record[field]).filter(Boolean),lead=data.instructors.find(p=>staffName(p)===record.instructor);
    if(lead&&assigned.includes(lead.email)||new Set(assigned).size!==assigned.length)return 'A person can have only one assignment role in the same class.';
    if(team.length!==Number(Boolean(record.instructor))+assigned.length)return 'Choose existing staff members for every assignment.';
  }
  return '';
};

function staffAssignmentProblems(session){
  if(!isScheduled(session))return [];
  return sessionStaff(session).flatMap(person=>{
    const state=staffWindow(person,session.day,session.start,session.end,sessionKey(session)),reasons=[];
    if(state.busy)reasons.push(`${staffName(person)} has another class`);
    if(state.blocked)reasons.push(`${staffName(person)} is unavailable`);
    return reasons;
  });
}
const candidatesBeforeStaff=roomCandidates;
roomCandidates=function(session,...args){
  const problems=staffAssignmentProblems(session);
  return candidatesBeforeStaff(session,...args).map(candidate=>({...candidate,reasons:[...new Set([...candidate.reasons,...problems])]}));
};
const issuesBeforeStaff=scheduleIssues;
scheduleIssues=function(){
  const issues=issuesBeforeStaff(),sessions=allSessions();
  for(const session of sessions)for(const [field,role]of assistantFields){
    if(!session[field])continue;
    const person=data.instructors.find(p=>p.email===session[field]);
    if(!person||staffRole(person)!==role)issues.push({severity:'error',title:`Invalid ${role} assignment`,description:`${session.name} needs an existing staff member with this role.`,courseIndex:session.courseIndex});
  }
  for(const person of data.instructors){
    const assigned=sessionsForStaff(person,true);
    assigned.forEach((a,i)=>{
      if(staffAssignment(person,a)!=='Lead instructor'&&staffWindow(person,a.day,a.start,a.end).blocked)issues.push({severity:'error',title:'Assistant unavailable',description:`${staffName(person)} is unavailable during ${a.name}.`,courseIndex:a.courseIndex});
      assigned.slice(i+1).forEach(b=>{
        if(a.day===b.day&&overlaps(minutes(a.start),minutes(a.end),minutes(b.start),minutes(b.end))&&!(staffAssignment(person,a)==='Lead instructor'&&staffAssignment(person,b)==='Lead instructor'))issues.push({severity:'error',title:'Teaching staff overlap',description:`${staffName(person)} is assigned to ${a.name} and ${b.name} at the same time.`,courseIndex:a.courseIndex});
      });
    });
    for(const day of dayCodes()){
      const daily=assigned.filter(s=>s.day===day),hours=occupiedMinutes(daily)/60;
      if(hours>person.max&&daily.length)issues.push({severity:'warning',title:'Daily teaching limit exceeded',description:`${staffName(person)}: ${hours.toFixed(1)} scheduled hours on ${day}; maximum ${person.max}.`,courseIndex:daily[0].courseIndex});
    }
  }
  return issues;
};

function addAssistantExamples(){
  const examples=window.EXAMPLE_DATA.instructors.filter(p=>staffRole(p)!=='Instructor'&&!data.instructors.some(existing=>existing.email.toLowerCase()===p.email.toLowerCase()||staffName(existing)===staffName(p))&&data.departments.some(d=>d.abbreviation===p.department&&d.faculty===p.faculty));
  if(!examples.length){notify('No compatible example assistants to add. Use Add staff member.');return;}
  checkpoint();data.instructors.push(...clone(examples));persist();render();notify(`${examples.length} example assistants added. Assign them inside a course’s sections or labs.`);
}

document.addEventListener('click',event=>{
  const cell=event.target.closest('[data-staff-slot-day]');
  if(cell){staffView.slot={day:cell.dataset.staffSlotDay,start:cell.dataset.staffSlotStart,end:cell.dataset.staffSlotEnd};document.querySelectorAll('[data-staff-slot-day]').forEach(button=>{button.classList.toggle('is-selected',button===cell);button.setAttribute('aria-pressed',String(button===cell));});document.querySelector('#staff-slot-inspector').innerHTML=staffSlotInspector();document.querySelector('#staff-slot-heading')?.focus();}
  if(event.target.closest('#staff-find-this-slot')){Object.assign(staffView,{day:staffView.slot.day,start:staffView.slot.start,end:staffView.slot.end});location.hash='instructors';}
});

const renderBeforeStaff=render;
render=function(){
  renderBeforeStaff();
  const [page,action,email]=(location.hash.slice(1)||'dashboard').split('/');
  if(page==='instructors'){
    if(action==='schedule'){let decoded;try{decoded=decodeURIComponent(email||'');}catch(_){decoded='';}staffSchedule(decoded);}
    else if(action==='occupancy')staffHeatmap();
    else if(!action)staffFinder();
    else if(action==='edit'&&data.instructors[Number(email)]){
      const person=data.instructors[Number(email)],link=document.createElement('a');link.className='button primary room-detail-timetable';link.href=staffHref(person);link.textContent='Open weekly teaching schedule →';document.querySelector('.page-heading')?.after(link);
      const assigned=panel('All teaching assignments',`<div class="table-wrap"><table><thead><tr><th>Class</th><th>Assignment role</th><th>Day / time</th><th>Classroom</th></tr></thead><tbody>${sessionsForStaff(person).map(s=>`<tr><td><a class="text-link" href="#courses/edit/${s.courseIndex}">${esc(s.name)}</a></td><td>${esc(staffAssignment(person,s))}</td><td>${isScheduled(s)?esc(s.day+' '+s.start+'–'+s.end):'Not scheduled'}</td><td>${esc(s.classroom)}</td></tr>`).join('')}</tbody></table></div>`,true);
      const oldPanel=[...main.querySelectorAll('details.panel')].find(panel=>panel.querySelector('summary')?.textContent==='Assigned Sections');if(oldPanel)oldPanel.outerHTML=assigned;else main.insertAdjacentHTML('beforeend',assigned);
    }
  }
  if(page==='courses'&&action==='edit'){
    for(const key of ['sections','labs']){
      const wrapper=main.querySelector(`.data-table[data-key="${key}"]`);
      if(!wrapper)continue;
      wrapper.querySelectorAll('tbody tr').forEach(row=>{
        const session=rowsFor(key,Number(email))[Number(row.dataset.rowIndex)];
        schemas[key].forEach((spec,index)=>{
          const person=spec.key==='instructor'?data.instructors.find(p=>staffName(p)===session.instructor):assistantFields.some(([field])=>field===spec.key)?data.instructors.find(p=>p.email===session[spec.key]):null;
          if(person)row.cells[index].innerHTML=`<a class="text-link" href="${esc(staffHref(person))}">${esc(staffName(person))}</a>`;
        });
      });
    }
  }
  if(page==='help')main.insertAdjacentHTML('afterbegin','<div class="notice"><strong>Teaching staff:</strong> choose a day/time and filter by Instructor, Teaching Assistant, or Learning Assistant. Click a person to open their weekly schedule. Assign optional TAs and LAs when editing course sections or labs. Their assignments affect availability and schedule checks.</div>');
  document.title='Defterdar · '+(document.querySelector('nav a.active span')?.textContent||'Workspace');
};
render();
