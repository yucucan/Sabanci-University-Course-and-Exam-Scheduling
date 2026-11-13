'use strict';

let examReview=null;
let avoidExamTeachingConflicts=true;
const examStartStep=15;
const examIsAssigned=exam=>Boolean(exam.date&&exam.start&&exam.end&&exam.classroom);
const examOverlap=(a,b)=>a.start<b.end&&b.start<a.end;

function examFindings(exam,index,exams){
  if(!examIsAssigned(exam))return [];
  const findings=[];
  const room=data.classrooms.find(room=>room.code===exam.classroom);
  if(room&&exam.demand>room.capacity)findings.push(`Room capacity is ${room.capacity} for ${exam.demand} students.`);
  for(const [otherIndex,other] of exams.entries()){
    if(otherIndex===index||!examIsAssigned(other)||other.date!==exam.date||!examOverlap(exam,other))continue;
    const shared=[];
    if(other.classroom===exam.classroom)shared.push('room');
    if(exam.invigilator&&other.invigilator===exam.invigilator)shared.push('invigilator');
    if(other.course===exam.course)shared.push('course');
    if(shared.length)findings.push(`Overlaps ${other.course} ${other.type.toLowerCase()} (${shared.join(', ')}).`);
  }
  return findings;
}

function buildExamReview(avoidTeaching){
  const windows=[...data.examWindows].sort((a,b)=>a.date.localeCompare(b.date)||a.start.localeCompare(b.start));
  const rooms=[...data.classrooms].sort((a,b)=>a.capacity-b.capacity||a.code.localeCompare(b.code));
  const staff=new Map(data.instructors.map(person=>[person.email,person]));
  const teaching=avoidTeaching?allSessions().filter(isScheduled).map(session=>({
    ...session,staffEmails:sessionStaff(session).map(person=>person.email)
  })):[];
  const occupied=new Map();
  const reserve=exam=>{
    if(!occupied.has(exam.date))occupied.set(exam.date,[]);
    occupied.get(exam.date).push(exam);
  };
  data.exams.filter(examIsAssigned).forEach(reserve);
  const queue=data.exams.flatMap((exam,index)=>examIsAssigned(exam)?[]:[{
    exam,index,
    windows:windows.filter(window=>window.type===exam.type&&minutes(window.end)-minutes(window.start)>=exam.duration),
    rooms:rooms.filter(room=>room.capacity>=exam.demand)
  }]).sort((a,b)=>a.windows.length*a.rooms.length-b.windows.length*b.rooms.length||
    b.exam.duration-a.exam.duration||b.exam.demand-a.exam.demand);

  const placements=[],unallocated=[];
  const deadline=performance.now()+1200;
  for(const item of queue){
    const {exam,index}=item;
    const preferredRooms=exam.preferredClassroomType
      ?item.rooms.filter(room=>room.type===exam.preferredClassroomType):[];
    const roomOrder=preferredRooms.length
      ?[...preferredRooms,...item.rooms.filter(room=>room.type!==exam.preferredClassroomType)]:item.rooms;
    let assignment,roomType;
    if(item.windows.length&&item.rooms.length){
      search: for(const window of item.windows){
        const dayIndex=(new Date(window.date+'T00:00:00Z').getUTCDay()+6)%7;
        const dayTeaching=teaching.filter(session=>session.day===days[dayIndex].toUpperCase());
        const sameDate=occupied.get(window.date)||[];
        const latest=minutes(window.end)-exam.duration;
        for(let start=minutes(window.start);start<=latest;start+=examStartStep){
          if(performance.now()>=deadline)break search;
          const slot={date:window.date,start:clock(start),end:clock(start+exam.duration)};
          const overlappingExams=sameDate.filter(other=>examOverlap(slot,other));
          if(overlappingExams.some(other=>other.course===exam.course||
            (exam.invigilator&&other.invigilator===exam.invigilator)))continue;
          if(unavailableHours(staff.get(exam.invigilator),dayIndex,slot.start,slot.end).length)continue;
          const overlappingClasses=dayTeaching.filter(session=>examOverlap(slot,session));
          if(exam.invigilator&&overlappingClasses.some(session=>session.staffEmails.includes(exam.invigilator)))continue;
          const room=(assignment?preferredRooms:roomOrder).find(room=>
            !overlappingExams.some(other=>other.classroom===room.code)&&
            !overlappingClasses.some(session=>session.classroom===room.code)&&
            !unavailableHours(room,dayIndex,slot.start,slot.end).length);
          if(room){
            assignment={...slot,classroom:room.code};
            roomType=room.type;
            if(!preferredRooms.length||room.type===exam.preferredClassroomType)break search;
          }
        }
      }
    }
    if(assignment){
      placements.push({index,exam,assignment,roomType});
      reserve({...exam,...assignment});
    }else{
      const reason=!item.windows.length?`Add a ${exam.type.toLowerCase()} window at least ${exam.duration} minutes long.`:
        !item.rooms.length?`No classroom seats ${exam.demand} students.`:
        performance.now()>=deadline?'The search reached its time limit. Narrow the allowed windows or apply the available allocations and try again.':
        'No available room and time found. Try adding a window or changing the assigned invigilator.';
      unallocated.push({exam,reason});
    }
  }
  return {baseline:JSON.stringify(data),placements,unallocated};
}

function applyExamReview(){
  if(!examReview?.placements.length)return;
  if(examReview.baseline!==JSON.stringify(data)){
    examReview=null;
    render();
    notify('The workspace changed. Generate allocations again.');
    return;
  }
  checkpoint();
  const {placements}=examReview;
  placements.forEach(({index,assignment})=>Object.assign(data.exams[index],assignment));
  examReview=null;
  const saved=persist();
  render();
  if(saved)notify(`Allocated ${placements.length} exam(s). Use Undo to restore the previous schedule.`);
}

function examReviewMarkup(review){
  const {placements,unallocated}=review;
  return `<h3 tabindex="-1" id="exam-review-title">Allocation preview</h3>
    <p>${placements.length} proposed · ${unallocated.length} awaiting allocation</p>
    ${placements.length?`<div class="table-wrap"><table><thead><tr><th scope="col">Exam</th><th scope="col">Date</th><th scope="col">Time</th><th scope="col">Classroom</th></tr></thead>
      <tbody>${placements.map(({exam,assignment,roomType})=>`<tr><td>${esc(exam.course)} · ${esc(exam.type)}</td><td>${esc(assignment.date)}</td><td>${esc(assignment.start)}–${esc(assignment.end)}</td><td>${esc(assignment.classroom)}${exam.preferredClassroomType&&exam.preferredClassroomType!==roomType?`<small>Preferred ${esc(exam.preferredClassroomType)} · assigned ${esc(roomType)}</small>`:''}</td></tr>`).join('')}</tbody></table></div>`:''}
    ${unallocated.length?`<h4>Awaiting allocation</h4><ul class="exam-findings">${unallocated.map(({exam,reason})=>`<li><strong>${esc(exam.course)} · ${esc(exam.type)}</strong> — ${esc(reason)}</li>`).join('')}</ul>`:''}
    ${placements.length?'<div class="dialog-actions"><button type="button" class="primary" id="apply-exam-review">Apply allocations</button></div>':''}`;
}

function examAllocationPage(){
  if(examReview&&examReview.baseline!==JSON.stringify(data))examReview=null;
  const unassigned=data.exams.filter(exam=>!examIsAssigned(exam)).length;
  main.innerHTML=heading('Allocate rooms and times','Generate and review proposed placements for midterms and finals.')+
    `<a class="back" href="#exams">← Exam list and windows</a>
     <section class="panel"><div class="section-heading"><h2>Allocation review</h2><span>${unassigned} awaiting allocation</span></div><div class="panel-content">
       <p>The search fills unassigned exams using room capacity, room and invigilator availability, and conflicts with other exams.</p>
       ${unassigned&&!data.examWindows.length?'<p>Add allowed exam windows on the Exams page before generating allocations.</p>':''}
       <label class="weekend-switch"><input type="checkbox" id="exam-avoid-classes" ${avoidExamTeachingConflicts?'checked':''}> Avoid clashes with weekly classes</label>
       <p><button type="button" class="primary" id="generate-exam-review" ${unassigned&&data.examWindows.length?'':'disabled'}>Generate allocations</button></p>
       ${examReview?examReviewMarkup(examReview):''}
     </div></section>`;
  main.querySelector('#exam-avoid-classes').onchange=event=>{
    avoidExamTeachingConflicts=event.target.checked;
    examReview=null;
    render();
    main.querySelector('#exam-avoid-classes').focus();
  };
  main.querySelector('#generate-exam-review').onclick=()=>{
    examReview=buildExamReview(avoidExamTeachingConflicts);
    render();
    main.querySelector('#exam-review-title').focus();
  };
  const apply=main.querySelector('#apply-exam-review');
  if(apply)apply.onclick=applyExamReview;
}

function examsPage(){
  const exams=data.exams;
  const unassigned=exams.filter(exam=>!examIsAssigned(exam)).length;
  main.innerHTML=heading('Exam scheduling','Manage midterms, finals, and the windows when they can be scheduled.')+
    `<section class="panel"><div class="section-heading"><h2>Exams</h2><span>${unassigned} awaiting allocation</span></div><div class="panel-content">${table('exams')}</div></section>
     <section class="panel"><div class="section-heading"><h2>Allowed exam windows</h2><a href="#exam-allocation">Allocate rooms and times →</a></div><div class="panel-content">
       <p>Add a date and time window for each midterm or final exam period. The search tries starts every ${examStartStep} minutes from the beginning of each window.</p>
       ${table('examWindows')}</div></section>`;
  const tableElement=main.querySelector('[data-key="exams"] table');
  const headingRow=tableElement.tHead.rows[0];
  headingRow.insertBefore(document.createElement('th'),headingRow.lastElementChild).textContent='Exam checks';
  const invigilatorColumn=schemas.exams.findIndex(field=>field.key==='invigilator');
  const rows=[...tableElement.tBodies[0].rows];
  rows.sort((left,right)=>{
    const a=exams[Number(left.dataset.rowIndex)],b=exams[Number(right.dataset.rowIndex)];
    return (a.date||'').localeCompare(b.date||'')||(a.start||'').localeCompare(b.start||'')||a.course.localeCompare(b.course);
  });
  for(const row of rows){
    const index=Number(row.dataset.rowIndex);
    const exam=exams[index];
    const staff=data.instructors.find(person=>person.email===exam.invigilator);
    row.cells[invigilatorColumn].textContent=staff?staffName(staff):'Unassigned';
    const findings=examFindings(exam,index,exams);
    const cell=row.insertCell(row.cells.length-1);
    cell.innerHTML=findings.length?`<ul class="exam-findings">${findings.map(finding=>`<li>${esc(finding)}</li>`).join('')}</ul>`:
      examIsAssigned(exam)?'No findings':'Awaiting allocation';
    row.parentElement.append(row);
  }
}
