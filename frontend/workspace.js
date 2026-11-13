/* Additional workspace screens. All records remain local to this browser. */
'use strict';

const undoHistory = [];
function checkpoint() {
  undoHistory.push(clone(data));
  if (undoHistory.length > 20) undoHistory.shift();
  document.querySelector('#undo').disabled = false;
}
document.querySelector('#undo').onclick = () => {
  if (!undoHistory.length) return;
  data = undoHistory.pop();
  persist();
  dialog.close();
  document.querySelector('#undo').disabled = !undoHistory.length;
  render();
  notify('Previous change restored');
};

// Follow text references when their source record is renamed.
function referenceLinks(key, record, parent) {
  const assignments = data.courses.flatMap(c => [...c.sections, ...c.labs]);
  const rules = [...data.standardRules.map(r => [r, 'elements']), ...data.orderRules.flatMap(r => [[r,'before'],[r,'after']])];
  const links = [];
  const add = (rows, prop, from, toProp) => rows.forEach(r => {
    if (r[prop] === from) links.push({record:r,prop,toProp});
  });
  if (key === 'campuses') {
    add([...data.buildings,...data.classrooms], 'campus', record.name, 'name');
    add([...data.campusTravel,...data.campusBuildingTravel], 'from', record.name, 'name');
    add(data.campusTravel, 'to', record.name, 'name');
  }
  if (key === 'buildings') {
    add([...data.classrooms,...data.buildingScores], 'building', record.name, 'name');
    add(data.buildingTravel, 'from', record.name, 'name');
    add([...data.buildingTravel,...data.campusBuildingTravel], 'to', record.name, 'name');
  }
  if (key === 'faculties') add([...data.departments,...data.instructors], 'faculty', record.name, 'name');
  if (key === 'departments') add([...data.instructors,...data.courses,...data.buildingScores,...data.courses.flatMap(c=>c.distributions)], 'department', record.abbreviation, 'abbreviation');
  if (key === 'classroomTypes') {
    add(data.classrooms, 'type', record.name, 'name');
    add(data.exams||[], 'preferredClassroomType', record.name, 'name');
  }
  if (key === 'instructors') {
    add(assignments, 'instructor', record.name+' '+record.surname, 'fullName');
    add(assignments, 'teachingAssistant', record.email, 'email');
    add(assignments, 'learningAssistant', record.email, 'email');
    add(data.exams||[], 'invigilator', record.email, 'email');
    for(const rule of [...(data.hardConstraints||[]),...(data.softConstraints||[])]){
      if(Array.isArray(rule.staffEmails)&&rule.staffEmails.includes(record.email)){
        links.push({record:rule,prop:'staffEmails',member:record.email,toProp:'email'});
      }
    }
  }
  if (key === 'classrooms') {
    add(assignments.flatMap(session=>[session,...(session.additionalMeetings||[])]), 'classroom', record.code, 'code');
    add(data.exams||[], 'classroom', record.code, 'code');
  }
  if (key === 'courses') add(data.exams||[], 'course', record.code, 'code');
  if (key === 'sections'&&parent!==undefined) add(data.courses[parent].labs, 'linkedSection', record.name, 'name');
  const token = key === 'courses' ? record.code : ['sections','labs'].includes(key) ? record.name : null;
  if (token) rules.forEach(([r,prop]) => {
    if (r[prop].split(',').map(v=>v.trim()).includes(token)) links.push({record:r,prop,token,toProp:key==='courses'?'code':'name'});
  });
  return links;
}
function renameReferences(key, old, next, parent) {
  referenceLinks(key, old, parent).forEach(link => {
    const value=link.toProp==='fullName'?next.name+' '+next.surname:next[link.toProp];
    if(link.member){
      link.record[link.prop]=link.record[link.prop].map(member=>member===link.member?value:member);
      return;
    }
    link.record[link.prop]=link.token?link.record[link.prop].split(',').map(v=>v.trim()===link.token?value:v.trim()).join(', '):value;
  });
  if(key==='buildings') data.classrooms.filter(r=>r.building===next.name).forEach(r=>r.campus=next.campus);
}
function deletionBlock(key,index,parent) {
  const record=rowsFor(key,parent)[index];
  let refs=referenceLinks(key,record,parent).length;
  if(key==='courses') refs += [...record.sections,...record.labs].reduce((sum,r)=>sum+referenceLinks('sections',r).length,0);
  return refs ? `This record is used in ${refs} other place(s). Update those references before deleting it.` : '';
}

// Validate fields as well as references before a save or JSON import.
const originalValidate = validate;
validate = function(record,key,index,parent) {
  const basic=originalValidate(record,key);
  if(basic)return basic;
  for(const spec of schemas[key]) {
    const value=record[spec.key];
    if(spec.multiple){
      if(spec.optional&&value===undefined)continue;
      const allowed=new Set(options(spec.options));
      if(!Array.isArray(value)||new Set(value).size!==value.length||value.some(item=>!allowed.has(item))){
        return `Choose existing ${spec.label.toLowerCase()} without duplicates.`;
      }
      continue;
    }
    if(spec.optional&&(value===undefined||value===''))continue;
    if(spec.type==='number'&&(!(spec.step==='any'?Number.isFinite(value):Number.isInteger(value))||value<0))return `${spec.label} must be a nonnegative ${spec.step==='any'?'number':'whole number'}.`;
    if(spec.type!=='number'&&(typeof value!=='string'||!value.trim()))return `${spec.label} is required.`;
    if(spec.type==='select'&&!options(spec.options,parent).includes(value))return `Choose an existing ${spec.label.toLowerCase()}.`;
    if(spec.type==='time'&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(value))return `${spec.label} must be a valid time.`;
    if(spec.type==='email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))return 'Enter a valid email address.';
  }
  if(key==='instructors'&&!data.departments.some(d=>d.abbreviation===record.department&&d.faculty===record.faculty))return 'Choose a department belonging to the selected faculty.';
  if(key==='instructors'&&record.max>24)return 'Working hours per day cannot exceed 24.';
  if(key==='classrooms'&&record.capacity<1)return 'Classroom capacity must be at least 1.';
  if(key==='distributions'&&record.term<1)return 'Term must be at least 1.';
  if(['sections','labs'].includes(key)){
    const time=[record.day,record.start,record.end];
    if(time.some(Boolean)&&!time.every(Boolean))return 'Enter the day, start, and end together, or leave them blank.';
    if(time.every(Boolean)&&record.start>=record.end)return 'End time must be later than start time.';
    if((time.every(Boolean)||record.additionalMeetings?.length)&&!record.instructor)return 'Choose an instructor before assigning meeting times.';
    if(time.every(Boolean)&&!record.classroom)return 'Choose a classroom for the first meeting.';
  }
  if(key==='exams'||key==='examWindows'){
    if(key==='exams'){
      if(!Number.isInteger(record.duration)||record.duration<1||record.duration>=1440)return 'Duration must be between 1 and 1,439 minutes.';
      if(record.demand<1)return 'Expected students must be at least 1.';
      const assignment=[record.date,record.start,record.end,record.classroom];
      if(assignment.every(value=>!value))return '';
      if(!assignment.every(Boolean))return 'Enter the date, start, end, and classroom together, or leave them all blank for allocation.';
    }
    const date=new Date(record.date+'T00:00:00Z');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(record.date)||!Number.isFinite(date.getTime())||
      date.toISOString().slice(0,10)!==record.date||record.date.startsWith('0000'))return 'Enter a valid exam date.';
    if(record.start>=record.end)return 'End time must be later than start time.';
    if(key==='exams'&&minutes(record.end)-minutes(record.start)!==record.duration)return 'Assigned start and end must match the exam duration.';
  }
  if(['standardRules','orderRules'].includes(key)) {
    const known=data.courses.flatMap(c=>[c.code,...c.sections.map(s=>s.name),...c.labs.map(s=>s.name)]);
    for(const prop of key==='standardRules'?['elements']:['before','after']) {
      const tokens=record[prop].split(',').map(v=>v.trim());
      if(tokens.some(v=>!known.includes(v)))return 'Use existing course or section names, separated by commas.';
    }
  }
  return '';
};

// Keep paired selectors in sync, including new forms with default selections.
function syncSelectors(form, changed) {
  if(!form)return;
  for(const [parentName,childName,source,parentProp,valueProp] of [
    ['campus','building','buildings','campus','name'],
    ['faculty','department','departments','faculty','abbreviation']
  ]) {
    if(changed&&changed!==parentName)continue;
    const parent=form.elements[parentName],child=form.elements[childName];
    if(!parent||!child)continue;
    const current=child.value,available=data[source].filter(r=>r[parentProp]===parent.value).map(r=>r[valueProp]);
    child.innerHTML=available.map(v=>`<option ${v===current?'selected':''}>${esc(v)}</option>`).join('');
  }
}
const originalEdit=edit;
edit=function(key,index,parent){
  originalEdit(key,index,parent);
  syncSelectors(document.querySelector('#edit-form'));
  if(['sections','labs'].includes(key)){
    document.querySelector('#fields').insertAdjacentHTML('afterbegin','<p class="section-form-hint">You can assign the instructor, room, and time later.</p>');
  }
  if(key==='exams'){
    const fields=document.querySelector('#fields');
    if(index===undefined){
      for(const name of ['date','start','end','classroom']){
        fields.querySelector(`[name="${name}"]`).closest('label').remove();
      }
      fields.insertAdjacentHTML('afterbegin','<p class="exam-form-hint">After saving, open Allocate rooms and times to place the exam. If the preferred classroom type is unavailable, the allocator can use another suitable room.</p>');
    }else{
      fields.insertAdjacentHTML('afterbegin','<p class="exam-form-hint">To return this exam to automatic allocation, clear the assigned date, times, and classroom.</p>');
    }
  }
  if(!['sections','labs'].includes(key))return;
  const fields=document.querySelector('#fields');
  fields.insertAdjacentHTML('beforeend',`<fieldset class="meeting-editor"><legend>Additional weekly meetings</legend><p>Use a separate meeting for each part of a split pattern such as 2 + 1 or 2 + 2. Each meeting can occupy one, two, or three consecutive teaching blocks.</p><div data-meetings></div><button type="button" data-add-meeting>Add meeting</button></fieldset>`);
  const container=fields.querySelector('[data-meetings]');
  const addMeeting=(meeting={})=>{
    const row=document.createElement('div');row.className='meeting-fields';
    row.innerHTML=`<label>Day<select data-meeting-field="day">${days.map(day=>`<option value="${day.toUpperCase()}" ${day.toUpperCase()===meeting.day?'selected':''}>${day}</option>`).join('')}</select></label>
      <label>Start<input data-meeting-field="start" type="time" value="${esc(meeting.start||'08:40')}" required></label>
      <label>End<input data-meeting-field="end" type="time" value="${esc(meeting.end||'09:30')}" required></label>
      <label>Room<select data-meeting-field="classroom">${options('classroomCodes').map(code=>`<option ${code===meeting.classroom?'selected':''}>${esc(code)}</option>`).join('')}</select></label>
      <button type="button">Remove meeting</button>`;
    row.querySelector('button').onclick=()=>row.remove();
    if(meeting.fixedTime===true)row.dataset.fixedTime='true';
    container.append(row);
    return row;
  };
  const record=index===undefined?null:rowsFor(key,parent)[index];
  (record?.additionalMeetings||[]).forEach(addMeeting);
  fields.querySelector('[data-add-meeting]').onclick=()=>{
    const room=document.querySelector('#edit-form [name="classroom"]')?.value;
    addMeeting({classroom:room}).querySelector('select').focus();
  };
};
const readBaseForm=readForm;
readForm=function(form,key){
  const record=readBaseForm(form,key);
  const meetings=form.querySelector('[data-meetings]');
  if(meetings)record.additionalMeetings=[...meetings.children].map(row=>{
    const meeting=Object.fromEntries([...row.querySelectorAll('[data-meeting-field]')].map(input=>[input.dataset.meetingField,input.value]));
    if(row.dataset.fixedTime==='true')meeting.fixedTime=true;
    return meeting;
  });
  return record;
};
document.addEventListener('change',e=>{
  if(e.target.name==='faculty'||e.target.name==='campus')syncSelectors(e.target.closest('form'),e.target.name);
});

// View sorting changes only the visible rows, preserving their edit/delete indices.
document.addEventListener('click',e=>{
  const button=e.target.closest('[data-sort]');
  if(!button)return;
  const wrapper=button.closest('.data-table'),key=wrapper.dataset.key;
  const parent=wrapper.dataset.parent===undefined?undefined:Number(wrapper.dataset.parent);
  const records=rowsFor(key,parent),prop=button.dataset.sort,th=button.closest('th');
  const descending=th.getAttribute('aria-sort')==='ascending';
  wrapper.querySelectorAll('th[aria-sort]').forEach(h=>h.setAttribute('aria-sort','none'));
  th.setAttribute('aria-sort',descending?'descending':'ascending');
  const tbody=wrapper.querySelector('tbody');
  [...tbody.rows].sort((a,b)=>{
    const x=records[Number(a.dataset.rowIndex)][prop],y=records[Number(b.dataset.rowIndex)][prop];
    return (typeof x==='number'?x-y:String(x).localeCompare(String(y),undefined,{numeric:true}))*(descending?-1:1);
  }).forEach(row=>tbody.append(row));
});

function allSessions({includeDisabled=false}={}) {
  return data.courses.flatMap((course,courseIndex)=>{
    if(!includeDisabled&&!courseIsEnabled(course))return [];
    const expand=(records,kind)=>records.flatMap((record,sessionIndex)=>{
      const session={...record,kind,course:course.code,courseIndex,sessionIndex};
      return [session,...(record.additionalMeetings||[]).map(({day,start,end,classroom,fixedTime},index)=>
        ({...session,day,start,end,classroom,fixedTime:fixedTime===true,meetingIndex:index+1}))];
    });
    return [...expand(course.sections,'Section'),...expand(course.labs,'Lab')];
  });
}
const minutes = time => Number(time.slice(0,2))*60+Number(time.slice(3));
function sessionRecord(workspace,session){
  const course=workspace.courses[session.courseIndex];
  const record=(session.kind==='Lab'?course.labs:course.sections)[session.sessionIndex];
  return session.meetingIndex?record.additionalMeetings[session.meetingIndex-1]:record;
}
function sessionLabel(session){return session.meetingIndex?`${session.name} · Meeting ${session.meetingIndex+1}`:session.name;}
function sessionType(session){return session.kind==='Lab'?(session.activityType||'Lab'):session.kind;}
function teachingBlockCount(start,end){
  if(!/^(?:[01]\d|2[0-3]):40$/.test(start||'')||!/^(?:[01]\d|2[0-3]):30$/.test(end||''))return 0;
  const elapsed=minutes(end)-minutes(start);
  return [50,110,170].includes(elapsed)?(elapsed+10)/60:0;
}
function usesSabanciBlocks(){return data.timeStructure.some(slot=>teachingBlockCount(slot.start,slot.end)===1);}
function unavailableHours(entity,dayIndex,start,end){
  if(!entity?.availability)return [];
  const from=minutes(start),to=minutes(end),offset=usesSabanciBlocks()?40:0;
  const result=[];
  for(let hour=Math.floor((from-offset)/60);hour<Math.ceil((to-offset)/60);hour++){
    const blockStart=hour*60+offset;
    if(from<blockStart+(offset?50:60)&&to>blockStart&&entity.availability[`${dayIndex}-${hour}`]==='Unavailable')result.push(hour);
  }
  return result;
}
function validateTeachingPlacement(record,key){
  const standard=usesSabanciBlocks();
  if(key==='timeStructure'&&standard&&teachingBlockCount(record.start,record.end)!==1)return 'Teaching blocks must start at :40 and finish at :30, 50 minutes later.';
  return ['sections','labs'].includes(key)?meetingValidation(record,standard):'';
}
function meetingValidation(record, enforceBlocks){
  if(record.additionalMeetings!==undefined&&!Array.isArray(record.additionalMeetings))return 'Additional meetings must be a list.';
  const meetings=record.additionalMeetings||[];
  for(const meeting of meetings){
    if(!meeting||!isScheduled(meeting)||!windowValid(meeting.start,meeting.end))return 'Each additional meeting needs a valid day, start time, and end time.';
    if(!data.classrooms.some(room=>room.code===meeting.classroom))return 'Choose an existing classroom for each additional meeting.';
    if(meeting.fixedTime!==undefined&&typeof meeting.fixedTime!=='boolean')return 'A meeting time lock must be true or false.';
  }
  if(enforceBlocks&&[record,...meetings].some(meeting=>isScheduled(meeting)&&!teachingBlockCount(meeting.start,meeting.end)))return 'Meetings must start at :40 and end at :30 after one, two, or three teaching blocks.';
  if(enforceBlocks){
    const scheduled=[record,...meetings].filter(isScheduled);
    if(scheduled.some((meeting,index)=>scheduled.slice(index+1).some(other=>
      meeting.day===other.day&&meeting.start<other.end&&other.start<meeting.end)))return 'Meetings of the same section or lab must have separate times.';
  }
  return '';
}
function isScheduled(s){return days.map(d=>d.toUpperCase()).includes(s.day)&&/^\d\d:\d\d$/.test(s.start||'')&&/^\d\d:\d\d$/.test(s.end||'')&&s.start<s.end;}
function minTravelMinutes(roomA, roomB) {
  if(!roomA||!roomB||roomA.code===roomB.code)return 0;
  let req=0;
  if(roomA.building&&roomB.building&&roomA.building!==roomB.building){
    for(const t of data.buildingTravel||[]){
      if((t.from===roomA.building&&t.to===roomB.building)||(t.from===roomB.building&&t.to===roomA.building))req=Math.max(req,Number(t.minutes)||0);
    }
  }
  if(roomA.campus&&roomB.campus&&roomA.campus!==roomB.campus){
    for(const t of data.campusTravel||[]){
      if((t.from===roomA.campus&&t.to===roomB.campus)||(t.from===roomB.campus&&t.to===roomA.campus))req=Math.max(req,Number(t.minutes)||0);
    }
    for(const t of data.campusBuildingTravel||[]){
      if((t.from===roomA.campus&&t.to===roomB.building)||(t.from===roomB.campus&&t.to===roomA.building))req=Math.max(req,Number(t.minutes)||0);
    }
  }
  return req;
}
function scheduleIssues() {
  const sessions=allSessions(),issues=[],use40=usesSabanciBlocks();
  const add=(severity,title,description,s,category='capacity')=>issues.push({severity,title,description,courseIndex:s.courseIndex,category});
  for(const s of sessions) {
    const room=data.classrooms.find(r=>r.code===s.classroom),instructor=data.instructors.find(r=>r.name+' '+r.surname===s.instructor),course=data.courses[s.courseIndex];
    if(!room)add('error','Missing classroom',s.classroom?`${s.name} refers to ${s.classroom}.`:`${s.name} needs a classroom.`,s,'capacity');
    if(!instructor)add('error','Missing instructor',s.instructor?`${s.name} refers to ${s.instructor}.`:`${s.name} needs an instructor.`,s,'capacity');
    if(room&&s.demand>room.capacity)add('error','Room capacity overflow',`${s.name}: ${s.demand} students assigned to ${room.capacity} seats in ${room.code} (+${s.demand-room.capacity} overflow).`,s,'capacity');
    if(room&&room.capacity>=80&&s.demand>0&&s.demand/room.capacity<=0.35)add('warning','Under-utilized large classroom (wasted capacity)',`${s.name} fills only ${s.demand} of ${room.capacity} seats (${Math.round(s.demand/room.capacity*100)}%) in ${room.code}, leaving ${room.capacity-s.demand} seats unused.`,s,'waste');
    if(room&&course?.classRequirements&&s.kind==='Section'&&['Computer Laboratory','Science Lab'].includes(course.classRequirements)&&room.type!==course.classRequirements){
      add('warning','Technical room requirement mismatch',`${s.name} requests ${course.classRequirements} (Class Reqs) but is placed in ${room.code} (${room.type}).`,s,'capacity');
    }
    if(!isScheduled(s)){add('warning','Unplaced session (awaiting time block)',`${s.name} (${s.demand} students) needs an assigned day and time block.`,s,'waste');continue;}
    if(use40&&!teachingBlockCount(s.start,s.end))add('warning','Meeting outside teaching block format',`${sessionLabel(s)} must start at :40 and end at :30 after one to three blocks.`,s,'capacity');
    const dayIndex=days.map(d=>d.toUpperCase()).indexOf(s.day);
    for(const [entity,label] of [[room,'Classroom'],[instructor,'Instructor']]) {
      if(!entity)continue;
      const [hour]=unavailableHours(entity,dayIndex,s.start,s.end);
      if(hour!==undefined){
        const slotLabel=use40?`${String(hour).padStart(2,'0')}:40–${String(hour+1).padStart(2,'0')}:30`:`${String(hour).padStart(2,'0')}:00`;
        add('error',`${label} unavailable`,`${sessionLabel(s)} overlaps an unavailable window (${slotLabel}).`,s,'capacity');
      }
    }
  }
  const scheduled=sessions.filter(isScheduled);
  scheduled.forEach((a,i)=>scheduled.slice(i+1).forEach(b=>{
    if(a.day===b.day&&a.start<b.end&&b.start<a.end){
      if(a.courseIndex===b.courseIndex&&(
        a.kind==='Section'&&b.kind==='Lab'&&b.linkedSection===a.name||
        b.kind==='Section'&&a.kind==='Lab'&&a.linkedSection===b.name
      ))add('error','Linked lecture overlap',`${a.name} and ${b.name} overlap on ${a.day}.`,a,'cohort');
      if(a.classroom===b.classroom)add('error','Classroom overlap',`${a.name} and ${b.name} overlap in ${a.classroom} on ${a.day} (${a.start}–${a.end}).`,a,'capacity');
      if(a.instructor===b.instructor)add('error','Instructor overlap',`${a.name} and ${b.name} overlap for ${a.instructor} on ${a.day}.`,a,'capacity');
      const ca=data.courses[a.courseIndex],cb=data.courses[b.courseIndex];
      if(ca&&cb&&ca!==cb){
        for(const da of ca.distributions||[])for(const db of cb.distributions||[]){
          if(da.department===db.department&&da.term===db.term&&da.percentage>=50&&db.percentage>=50){
            add('error','Student cohort clash (same department & term)',`${a.name} and ${b.name} overlap on ${a.day} (${a.start}–${a.end}) for ${da.department} Term ${da.term} students.`,a,'cohort');
          }
        }
      }
    }
    if(a.day===b.day&&!(a.start<b.end&&b.start<a.end)){
      const first=minutes(a.end)<=minutes(b.start)?a:b,second=first===a?b:a;
      const gapMin=minutes(second.start)-minutes(first.end);
      const roomA=data.classrooms.find(r=>r.code===first.classroom),roomB=data.classrooms.find(r=>r.code===second.classroom);
      if(first.classroom===second.classroom&&roomA&&gapMin<roomA.gap){
        add('error','Classroom turnaround gap violation',`${roomA.code} has ${gapMin} min between ${first.name} (${first.end}) and ${second.name} (${second.start}); requires ${roomA.gap} min turnaround.`,first,'travel');
      }
      if(first.instructor===second.instructor&&roomA&&roomB){
        const travel=minTravelMinutes(roomA,roomB);
        if(travel>0&&gapMin<travel){
          add('error','Unreachable consecutive buildings (travel time)',`${first.instructor} has ${gapMin} min between ${first.name} (${roomA.code}, ${roomA.building}) and ${second.name} (${roomB.code}, ${roomB.building}); requires ${travel} min travel.`,first,'travel');
        }
      }
    }
  }));
  for(const rule of data.standardRules||[]){
    const tokens=rule.elements.split(',').map(v=>v.trim()).filter(Boolean);
    const matched=scheduled.filter(s=>tokens.includes(s.course)||tokens.includes(s.name));
    for(let i=0;i<matched.length;i++)for(let j=i+1;j<matched.length;j++){
      const a=matched[i],b=matched[j];
      if(!tokens.some(token=>(token===a.course||token===a.name)&&
        tokens.some(other=>other!==token&&(other===b.course||other===b.name))))continue;
      const sev=rule.enforcement==='Soft'?'warning':'error';
      if(rule.type==='Same Time'&&(a.day!==b.day||a.start!==b.start)){
        add(sev,`Rule violation: ${rule.name}`,`${a.name} and ${b.name} must start on the same day and at the same time.`,a,'cohort');
      }
      if(rule.type==='Same Day'&&a.day!==b.day){
        add(sev,`Rule violation: ${rule.name}`,`${a.name} and ${b.name} must be scheduled on the same day.`,a,'cohort');
      }
      if(rule.type==='Different Time'&&a.day===b.day&&a.start<b.end&&b.start<a.end){
        add(sev,`Academic block violation: ${rule.name}`,`${a.name} and ${b.name} overlap on ${a.day} (${a.start}–${a.end}), violating "${rule.name}".`,a,'cohort');
      }
      if(rule.type==='Different Day'&&a.day===b.day){
        add(sev,`Rule violation: ${rule.name}`,`${a.name} and ${b.name} are both scheduled on ${a.day}.`,a,'cohort');
      }
    }
  }
  for(const rule of data.orderRules||[]){
    const beforeTokens=rule.before.split(',').map(v=>v.trim()),afterTokens=rule.after.split(',').map(v=>v.trim());
    const bList=scheduled.filter(s=>beforeTokens.includes(s.course)||beforeTokens.includes(s.name));
    const aList=scheduled.filter(s=>afterTokens.includes(s.course)||afterTokens.includes(s.name));
    const dayIdx=d=>days.map(x=>x.toUpperCase()).indexOf(d);
    for(const b of bList)for(const a of aList){
      if(dayIdx(a.day)<dayIdx(b.day)||(dayIdx(a.day)===dayIdx(b.day)&&minutes(a.start)<minutes(b.end))){
        add(rule.enforcement==='Soft'?'warning':'error',`Sequence rule violation: ${rule.name}`,`${a.name} (${a.day} ${a.start}) is scheduled before ${b.name} (${b.day} ${b.start}).`,b,'cohort');
      }
    }
  }
  for(const c of data.courses) {
    if(!courseIsEnabled(c))continue;
    const sum=c.distributions.reduce((n,r)=>n+r.percentage,0);
    if(c.distributions.length&&sum!==100)add('warning','Distribution total',`${c.code} distributions total ${sum}%; expected 100%.`,{courseIndex:data.courses.indexOf(c)},'cohort');
  }
  return issues;
}
function issueCards(issues){return issues.map(issue=>`<a class="issue-card ${issue.severity}" href="#courses/edit/${issue.courseIndex}"><span class="issue-symbol" aria-hidden="true">${issue.severity==='error'?'!':'i'}</span><div><strong>${esc(issue.title)}</strong><p>${esc(issue.description)}</p></div><span aria-hidden="true">↗</span></a>`).join('')||'<div class="empty"><strong>No schedule issues found by these checks.</strong><p>Open Capacity comparison to inspect room availability.</p></div>';}
function dashboard() {
  const sessions=allSessions(),scheduled=sessions.filter(isScheduled),issues=scheduleIssues();
  const seats=data.classrooms.reduce((n,r)=>n+r.capacity,0);
  main.innerHTML=heading('Your academic workspace','Plan teaching, organize resources, and review the week ahead.')+
    `<section class="welcome"><div><span class="eyebrow">DEFTERDAR / ACADEMIC PLANNING</span><h2>A clear view of your teaching week.</h2><p>${data.courses.length} courses, ${sessions.length} teaching sessions, and ${data.classrooms.length} classrooms in one workspace.</p><a class="button primary" href="#timetable">View weekly timetable →</a><a class="button welcome-secondary" href="#courses">Manage courses</a></div><div class="welcome-art" aria-hidden="true"><span>MON</span><span>TUE</span><span>WED</span><i></i><i></i><i></i><i></i><i></i><i></i></div></section>`+
    `<div class="stats">${[['Courses',data.courses.length,'courses','Course catalog'],['Teaching staff',data.instructors.length,'instructors','Instructors, TAs, and LAs'],['Classrooms',data.classrooms.length,'classrooms',seats+' total seats'],['Scheduled sessions',scheduled.length,'timetable',sessions.length-scheduled.length+' need a time']].map(([label,value,href,note])=>`<a class="stat" href="#${href}"><span>${label}</span><strong>${value}</strong><small>${note} ↗</small></a>`).join('')}</div>`+
    `<div class="dashboard-columns"><section class="panel"><div class="section-heading"><h2>Teaching by department</h2><a href="#courses">View courses →</a></div><div class="panel-content">${data.departments.map(d=>{const count=data.courses.filter(c=>c.department===d.abbreviation).length;return `<div class="department-row"><span>${esc(d.name)}</span><strong>${count} course${count===1?'':'s'}</strong><div class="bar-track"><span style="width:${Math.round(count/Math.max(data.courses.length,1)*100)}%"></span></div></div>`;}).join('')||'<p>Add a department to get started.</p>'}</div></section><section class="panel"><div class="section-heading"><h2>Schedule checks <span class="count-badge">${issues.length}</span></h2><a href="#issues">Review all →</a></div><div class="panel-content">${issueCards(issues.slice(0,3))}</div></section></div>`+
    `<section class="panel"><div class="section-heading"><h2>Quick actions</h2></div><div class="quick-actions"><button data-action="add" data-key="courses"><strong>+ Add a course</strong><small>Create sections and labs</small></button><button data-action="add" data-key="instructors"><strong>+ Add staff member</strong><small>Build your teaching team</small></button><button data-action="add" data-key="classrooms"><strong>+ Add a classroom</strong><small>Set capacity and availability</small></button></div></section>`;
}

let timetableFilters={department:'',instructor:'',classroom:''};
function timetable() {
  const filters=[['department','Department',data.departments.map(r=>r.abbreviation)],['instructor','Teaching staff',options('instructorNames')],['classroom','Classroom',options('classroomCodes')]];
  const sessions=allSessions().filter(s=>!timetableFilters.department||data.courses[s.courseIndex].department===timetableFilters.department).filter(s=>!timetableFilters.instructor||(typeof sessionStaff==='function'?sessionStaff(s).some(p=>staffName(p)===timetableFilters.instructor):s.instructor===timetableFilters.instructor)).filter(s=>!timetableFilters.classroom||s.classroom===timetableFilters.classroom);
  main.innerHTML=heading('Weekly timetable','Browse scheduled teaching sessions, or open a card to adjust its course.')+
    `<section class="panel"><div class="panel-content filter-bar">${filters.map(([key,label,values])=>`<label>${label}<select data-timetable-filter="${key}"><option value="">${key==='instructor'?'All teaching staff':'All '+label.toLowerCase()+'s'}</option>${values.map(v=>`<option ${timetableFilters[key]===v?'selected':''}>${esc(v)}</option>`).join('')}</select></label>`).join('')}<button id="clear-filters">Clear filters</button><button id="print-timetable">Print timetable</button></div></section>`+
    `<div class="timetable-summary"><span><b>${sessions.filter(isScheduled).length}</b> scheduled sessions</span><span><b>${sessions.filter(s=>!isScheduled(s)).length}</b> awaiting a time</span><span class="legend"><i></i> Lecture <i class="lab-dot"></i> Lab / recitation</span></div>`+
    `<section class="panel"><div class="week-scroll"><div class="week-grid">${days.map(day=>{const entries=sessions.filter(s=>s.day===day.toUpperCase()&&isScheduled(s)).sort((a,b)=>a.start.localeCompare(b.start));return `<section class="week-day"><h2>${day}</h2><small>${entries.length} session${entries.length===1?'':'s'}</small><div class="day-sessions">${entries.map(s=>`<a class="session-card ${s.kind==='Lab'?'lab':''}" href="#courses/edit/${s.courseIndex}"><span class="session-time">${esc(s.start)} – ${esc(s.end)}</span><strong>${esc(s.name)}</strong><span>${esc(data.courses[s.courseIndex].name)}</span><small>${esc(s.classroom)} · ${s.demand} students</small><small>${esc(s.instructor)}</small></a>`).join('')||'<p class="day-empty">No sessions scheduled</p>'}</div></section>`;}).join('')}</div></div></section>`+
    panel('Awaiting a time',sessions.filter(s=>!isScheduled(s)).map(s=>`<a class="unscheduled-row" href="#courses/edit/${s.courseIndex}"><div><strong>${esc(s.name)}</strong><small>${esc(s.instructor)} · ${esc(s.classroom)}</small></div><span class="tag">Assign time →</span></a>`).join('')||'<p>All sessions in this view have a time assigned.</p>',true);
  document.querySelector('#clear-filters').onclick=()=>{timetableFilters={department:'',instructor:'',classroom:''};render();};
  document.querySelector('#print-timetable').onclick=()=>window.print();
}
document.addEventListener('change',e=>{if(e.target.dataset.timetableFilter){timetableFilters[e.target.dataset.timetableFilter]=e.target.value;timetable();}});

const originalRender=render;
render=function() {
  const page=location.hash.slice(1).split('/')[0]||'dashboard';
  originalRender();
  document.querySelectorAll('nav a').forEach(a=>{
    const selected=a.hash==='#'+page;
    a.classList.toggle('active',selected);
    if(selected)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');
  });
  if(page==='dashboard')dashboard();
  if(page==='timetable')timetable();
  if(page==='issues'){
    const issues=scheduleIssues();
    const capCount=issues.filter(i=>i.category==='capacity'||!i.category).length;
    const travelCount=issues.filter(i=>i.category==='travel').length;
    const cohortCount=issues.filter(i=>i.category==='cohort').length;
    const wasteCount=issues.filter(i=>i.category==='waste').length;
    main.innerHTML=heading('Schedule checks & feasibility verification','Detect room overflows, wasted classroom capacity, unreachable consecutive buildings, and same-term student cohort clashes.')+
      `<div class="view-switch"><a class="button primary" href="#planning">Review schedule →</a><a href="#planning/counterfactual">Compare capacity →</a></div>`+
      `<div class="stats"><div class="stat"><span>Capacity &amp; overlaps</span><strong>${capCount}</strong><small>Room overflows, double-bookings &amp; unavailability</small></div><div class="stat"><span>Travel &amp; turnaround</span><strong>${travelCount}</strong><small>Unreachable back-to-back buildings &amp; room gaps</small></div><div class="stat"><span>Cohort &amp; rule clashes</span><strong>${cohortCount}</strong><small>Same-dept/term clashes &amp; academic blocks</small></div><div class="stat"><span>Wasted seats &amp; unplaced</span><strong>${wasteCount}</strong><small>Half-empty large halls &amp; unplaced sections</small></div></div><div class="notice"><strong>Schedule checks.</strong> Checks evaluate classroom capacity overflow, severe seat under-utilization, room &amp; teaching-team overlaps, inter-building travel times, room turnaround gaps, unavailable calendar windows, cross-faculty academic blocks, same-department/term student cohort clashes, and daily teaching limits.</div><section class="panel"><div class="panel-content">${issueCards(issues)}</div></section>`;
  }
  if(page==='help')main.innerHTML=heading('Workspace guide','Set up your workspace and plan the teaching week.')+`<div class="guide-grid">${[
    ['1. Set up the university','Start in General with campuses, buildings, faculties, departments, and the daily time structure. Linked names update when you rename a record.'],
    ['2. Add people and rooms','Create instructors and classrooms, then open a record to set availability. Click a calendar cell to cycle its status.'],
    ['3. Build the teaching plan','Open a course to add sections, labs, and term distributions. Give each session a day, time, room, and instructor.'],
    ['4. Review the week','Use Timetable to filter by department, instructor, or room. Schedule checks highlight capacity and overlap problems.'],
    ['5. Keep your changes','Changes save in this browser when storage is available. Export JSON for a backup; Import data restores it. Undo recovers up to 20 changes in the current session.'],
    ['6. Restore defaults','Restore default data replaces the current workspace after confirmation. Use Undo to recover previous records.']
  ].map(([title,text])=>`<section class="panel"><div class="panel-content"><h2>${title}</h2><p>${text}</p></div></section>`).join('')}</div>`;
  if(!['dashboard','timetable','occupancy','planning','issues','help','general','instructors','classrooms','courses','rules','login'].includes(page))main.innerHTML=heading('Page not found','Use the navigation to return to your workspace.')+'<a class="button primary" href="#dashboard">Go to overview</a>';
  document.title='Defterdar · '+(document.querySelector('nav a.active span')?.textContent||'Workspace');
  syncSelectors(document.querySelector('#detail-form'));
  document.querySelector('#workspace').classList.toggle('login-workspace',page==='login');
};

// Import uses a strict shape check before replacing any existing browser data.
function validateImport(candidate) {
  if(!candidate||typeof candidate!=='object'||Array.isArray(candidate))throw new Error('Expected a JSON workspace object.');
  if(typeof normalizeStaffData==='function')candidate=normalizeStaffData(clone(candidate));
  if(typeof normalizePlanningData==='function')candidate=normalizePlanningData(clone(candidate));
  const expected=Object.keys(window.EXAMPLE_DATA);
  for(const key of expected){
    if(!Array.isArray(candidate[key]))throw new Error(`Missing ${key} table.`);
    if(candidate[key].length>10000)throw new Error('A table exceeds the 10,000 record import limit.');
  }
  const saved=data;
  data=candidate;
  try{
    const checkRows=(key,rows,parent)=>{
      const unique=new Set();
      rows.forEach(r=>{
        if(!r||typeof r!=='object'||Array.isArray(r))throw new Error(`Invalid ${key} record.`);
        if(['sections','labs'].includes(key)&&r.fixedTime!==undefined&&typeof r.fixedTime!=='boolean')throw new Error('Fixed time must be true or false.');
        if(['sections','labs'].includes(key)){
          const meetingProblem=meetingValidation(r,false);
          if(meetingProblem)throw new Error(`${titles[key]}: ${meetingProblem}`);
        }
        for(const spec of schemas[key]){
          if(spec.multiple)continue; // validate() checks membership and shape against the imported workspace.
          if(spec.optional&&(r[spec.key]===undefined||r[spec.key]===''))continue;
          if(spec.type==='number'&&(!(spec.step==='any'?Number.isFinite(r[spec.key]):Number.isInteger(r[spec.key]))||r[spec.key]<0))throw new Error(`Invalid ${key}: ${spec.label}.`);
          if(spec.type!=='number'&&typeof r[spec.key]!=='string')throw new Error(`Invalid ${key}: ${spec.label}.`);
        }
        const problem=validate(r,key,undefined,parent);
        if(problem)throw new Error(`${titles[key]}: ${problem}`);
        const identity=key==='instructors'?r.email:key==='departments'?r.abbreviation:r.code||r.name;
        if(identity){if(unique.has(identity))throw new Error(`Duplicate ${key}: ${identity}`);unique.add(identity);}
        if(r.availability!==undefined){
          if(!r.availability||typeof r.availability!=='object'||Array.isArray(r.availability))throw new Error('Invalid availability calendar.');
          for(const [slot,state]of Object.entries(r.availability))if(!/^[0-6]-([0-9]|1[0-9]|2[0-3])$/.test(slot)||!['Available','Preferred','Unavailable'].includes(state))throw new Error('Invalid availability cell.');
        }
      });
    };
    // First verify nested tables, which other tables may reference.
    candidate.courses.forEach(c=>{
      for(const key of ['sections','labs','distributions'])if(!Array.isArray(c[key])||c[key].length>10000)throw new Error(`Invalid course ${key}.`);
    });
    for(const key of expected)checkRows(key,candidate[key]);
    candidate.courses.forEach((c,parent)=>['sections','labs','distributions'].forEach(key=>checkRows(key,c[key],parent)));
  }finally{data=saved;}
  return Object.fromEntries(expected.map(key=>[key,candidate[key]]));
}
document.querySelector('#import').onclick=()=>document.querySelector('#import-file').click();
document.querySelector('#import-file').onchange=async e=>{
  const file=e.target.files[0];if(!file)return;
  try{
    if(file.size>5*1024*1024)throw new Error('Choose a JSON file smaller than 5 MB.');
    const next=validateImport(JSON.parse(await file.text()));
    if(!confirm('Replace this workspace with the imported data? You can undo this change.'))return;
    checkpoint();data=clone(next);persist();location.hash='dashboard';render();notify('Workspace imported');
  }catch(error){notify('Import failed: '+error.message);}finally{e.target.value='';}
};
window.addEventListener('hashchange',()=>{if(dialog.open)dialog.close();main.focus({preventScroll:true});});
render();
